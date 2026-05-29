const File = require("../models/File");
const Workspace = require("../models/Workspace");
const { uploadWorkspaceFile, deleteWorkspaceFile } = require("../utils/fileUploader");

/**
 * Helper: Check if user is a member of the workspace (owner or in members)
 */
const isWorkspaceMember = (workspace, userId) => {
  const isOwner = workspace.owner.toString() === userId.toString();
  const isMember = workspace.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  return isOwner || isMember;
};

/**
 * Helper: Check if user has admin permissions (owner or has admin role in members)
 */
const hasAdminAccess = (workspace, userId) => {
  const isOwner = workspace.owner.toString() === userId.toString();
  const isAdmin = workspace.members.some(
    (m) => m.user.toString() === userId.toString() && m.role === "admin"
  );
  return isOwner || isAdmin;
};

/**
 * Upload a file to the workspace
 * @route   POST /api/workspaces/:workspaceId/files
 * @access  Private
 */
exports.uploadFileToWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    // Check workspace access
    if (!isWorkspaceMember(workspace, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to upload files to this workspace.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a file to upload.",
      });
    }

    // Perform file upload (Cloudinary or local disk fallback)
    const fileUrl = await uploadWorkspaceFile(req.file);

    if (!fileUrl) {
      return res.status(500).json({
        success: false,
        message: "Failed to upload file to storage.",
      });
    }

    // Create file record in database
    const fileRecord = await File.create({
      name: req.file.originalname,
      url: fileUrl,
      size: req.file.size,
      mimeType: req.file.mimetype,
      workspace: workspaceId,
      uploader: req.user._id,
    });

    const populated = await fileRecord.populate(
      "uploader",
      "username email avatar profile.nickname"
    );

    res.status(201).json({
      success: true,
      message: "File uploaded successfully.",
      file: populated,
    });
  } catch (error) {
    console.error("uploadFileToWorkspace error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during file upload.",
    });
  }
};

/**
 * Get all files uploaded to a workspace
 * @route   GET /api/workspaces/:workspaceId/files
 * @access  Private
 */
exports.getWorkspaceFiles = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    // Check workspace access
    if (!isWorkspaceMember(workspace, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view files in this workspace.",
      });
    }

    const files = await File.find({ workspace: workspaceId })
      .populate("uploader", "username email avatar profile.nickname")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: files.length,
      files,
    });
  } catch (error) {
    console.error("getWorkspaceFiles error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error fetching workspace files.",
    });
  }
};

/**
 * Delete a workspace file
 * @route   DELETE /api/workspaces/:workspaceId/files/:fileId
 * @access  Private
 */
exports.deleteWorkspaceFile = async (req, res) => {
  try {
    const { workspaceId, fileId } = req.params;
    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    const fileRecord = await File.findById(fileId);

    if (!fileRecord) {
      return res.status(404).json({
        success: false,
        message: "File not found.",
      });
    }

    // Check workspace membership
    if (!isWorkspaceMember(workspace, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access this workspace.",
      });
    }

    // Check deletion authorization:
    // Only the uploader of the file, workspace owner, or workspace admin can delete it.
    const isUploader = fileRecord.uploader.toString() === req.user._id.toString();
    const isOwnerOrAdmin = hasAdminAccess(workspace, req.user._id);

    if (!isUploader && !isOwnerOrAdmin) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this file. Only the uploader or workspace admins can delete files.",
      });
    }

    // Delete from file system / Cloudinary
    await deleteWorkspaceFile(fileRecord.url);

    // Delete database record
    await File.findByIdAndDelete(fileId);

    res.status(200).json({
      success: true,
      message: "File deleted successfully.",
    });
  } catch (error) {
    console.error("deleteWorkspaceFile error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error deleting file.",
    });
  }
};
