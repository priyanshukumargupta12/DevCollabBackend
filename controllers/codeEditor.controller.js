const CodeFile = require("../models/CodeFile");
const CodeVersion = require("../models/CodeVersion");
const Workspace = require("../models/Workspace");
const { executeCode } = require("../utils/codeExecutor");

// ─── Permission Helpers ───────────────────────────────────────────────────────

/**
 * Check if user is owner of the workspace.
 */
const isOwner = (workspace, userId) => {
  const ownerId = workspace.owner._id || workspace.owner;
  return ownerId.toString() === userId.toString();
};

/**
 * Get member role in workspace (admin | member | null).
 */
const getMemberRole = (workspace, userId) => {
  const member = workspace.members.find((m) => {
    const mId = m.user._id || m.user;
    return mId.toString() === userId.toString();
  });
  return member ? member.role : null;
};

/**
 * Check if user has write access (owner or admin).
 */
const hasWriteAccess = (workspace, userId) => {
  if (isOwner(workspace, userId)) return true;
  return getMemberRole(workspace, userId) === "admin";
};

/**
 * Check if user is any member of the workspace (owner, admin, or member).
 */
const isMember = (workspace, userId) => {
  if (isOwner(workspace, userId)) return true;
  return getMemberRole(workspace, userId) !== null;
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/workspaces/:workspaceId/code-files
// @desc    Create a new code file or folder
// @access  Private (owner or admin)
// ─────────────────────────────────────────────────────────────────────────────
exports.createCodeFile = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { name, isFolder = false, parent = null, language, content = "" } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "File name is required." });
    }

    // Verify workspace exists and user has access
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, message: "Workspace not found." });
    }

    if (!isMember(workspace, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Only owners and admins can create files
    if (!hasWriteAccess(workspace, req.user._id) && getMemberRole(workspace, req.user._id) !== "member") {
      // Members with "member" role can also create files (editor access)
      // Only viewers would be blocked — we allow all members to edit for now
    }

    // Check for duplicate name in same parent folder
    const duplicate = await CodeFile.findOne({
      workspace: workspaceId,
      parent: parent || null,
      name: name.trim(),
      isDeleted: false,
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: `A ${duplicate.isFolder ? "folder" : "file"} named "${name}" already exists here.`,
      });
    }

    // Detect language from filename if not provided
    const detectedLanguage = language || (isFolder ? "plaintext" : CodeFile.detectLanguage(name.trim()));

    const codeFile = await CodeFile.create({
      name: name.trim(),
      isFolder,
      parent: parent || null,
      content: isFolder ? "" : content,
      language: detectedLanguage,
      workspace: workspaceId,
      createdBy: req.user._id,
    });

    const populated = await codeFile.populate("createdBy", "username email avatar");

    return res.status(201).json({ success: true, codeFile: populated });
  } catch (error) {
    console.error("createCodeFile error:", error.message);
    return res.status(500).json({ success: false, message: "Server error creating file." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/workspaces/:workspaceId/code-files
// @desc    Get all code files/folders for a workspace (tree structure)
// @access  Private (any member)
// ─────────────────────────────────────────────────────────────────────────────
exports.getCodeFiles = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, message: "Workspace not found." });
    }

    if (!isMember(workspace, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Fetch all non-deleted files for the workspace (content excluded for performance)
    const files = await CodeFile.find({ workspace: workspaceId, isDeleted: false })
      .populate("createdBy", "username avatar")
      .populate("lastEditedBy", "username avatar")
      .select("-content -draft") // Exclude heavy fields from list view
      .sort({ isFolder: -1, name: 1 }); // Folders first, then alphabetical

    return res.status(200).json({ success: true, count: files.length, files });
  } catch (error) {
    console.error("getCodeFiles error:", error.message);
    return res.status(500).json({ success: false, message: "Server error fetching files." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/workspaces/:workspaceId/code-files/:fileId
// @desc    Get a single code file with full content
// @access  Private (any member)
// ─────────────────────────────────────────────────────────────────────────────
exports.getCodeFileById = async (req, res) => {
  try {
    const { workspaceId, fileId } = req.params;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, message: "Workspace not found." });
    }

    if (!isMember(workspace, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const codeFile = await CodeFile.findOne({
      _id: fileId,
      workspace: workspaceId,
      isDeleted: false,
    })
      .populate("createdBy", "username avatar email")
      .populate("lastEditedBy", "username avatar");

    if (!codeFile) {
      return res.status(404).json({ success: false, message: "File not found." });
    }

    return res.status(200).json({ success: true, codeFile });
  } catch (error) {
    console.error("getCodeFileById error:", error.message);
    return res.status(500).json({ success: false, message: "Server error fetching file." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/workspaces/:workspaceId/code-files/:fileId
// @desc    Update a code file (content, name, language, parent)
// @access  Private (any member — viewer restriction enforced via socket)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateCodeFile = async (req, res) => {
  try {
    const { workspaceId, fileId } = req.params;
    const { content, name, language, parent, draft } = req.body;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, message: "Workspace not found." });
    }

    if (!isMember(workspace, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const codeFile = await CodeFile.findOne({
      _id: fileId,
      workspace: workspaceId,
      isDeleted: false,
    });

    if (!codeFile) {
      return res.status(404).json({ success: false, message: "File not found." });
    }

    // Apply changes
    if (content !== undefined) codeFile.content = content;
    if (name !== undefined && name.trim()) codeFile.name = name.trim();
    if (language !== undefined) codeFile.language = language;
    if (parent !== undefined) codeFile.parent = parent || null;
    if (draft !== undefined) codeFile.draft = draft;

    codeFile.lastEditedBy = req.user._id;

    await codeFile.save();

    return res.status(200).json({ success: true, codeFile });
  } catch (error) {
    console.error("updateCodeFile error:", error.message);
    return res.status(500).json({ success: false, message: "Server error updating file." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/workspaces/:workspaceId/code-files/:fileId
// @desc    Soft-delete a code file or folder (recursive for folders)
// @access  Private (owner or admin)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteCodeFile = async (req, res) => {
  try {
    const { workspaceId, fileId } = req.params;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, message: "Workspace not found." });
    }

    // Only owner or admin can delete files
    if (!hasWriteAccess(workspace, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only owners and admins can delete files.",
      });
    }

    const codeFile = await CodeFile.findOne({
      _id: fileId,
      workspace: workspaceId,
      isDeleted: false,
    });

    if (!codeFile) {
      return res.status(404).json({ success: false, message: "File not found." });
    }

    // Recursively soft-delete folder contents
    if (codeFile.isFolder) {
      await softDeleteRecursive(workspaceId, fileId);
    }

    codeFile.isDeleted = true;
    await codeFile.save();

    return res.status(200).json({ success: true, message: "File deleted successfully." });
  } catch (error) {
    console.error("deleteCodeFile error:", error.message);
    return res.status(500).json({ success: false, message: "Server error deleting file." });
  }
};

/**
 * Recursively mark all children of a folder as deleted.
 * @param {string} workspaceId
 * @param {string} parentId
 */
const softDeleteRecursive = async (workspaceId, parentId) => {
  const children = await CodeFile.find({
    workspace: workspaceId,
    parent: parentId,
    isDeleted: false,
  });

  for (const child of children) {
    if (child.isFolder) {
      await softDeleteRecursive(workspaceId, child._id);
    }
    child.isDeleted = true;
    await child.save();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/workspaces/:workspaceId/code-files/:fileId/versions
// @desc    Save a new version snapshot of the file
// @access  Private (any member)
// ─────────────────────────────────────────────────────────────────────────────
exports.saveVersion = async (req, res) => {
  try {
    const { workspaceId, fileId } = req.params;
    const { label } = req.body;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, message: "Workspace not found." });
    }

    if (!isMember(workspace, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const codeFile = await CodeFile.findOne({
      _id: fileId,
      workspace: workspaceId,
      isDeleted: false,
    });

    if (!codeFile) {
      return res.status(404).json({ success: false, message: "File not found." });
    }

    if (codeFile.isFolder) {
      return res.status(400).json({ success: false, message: "Cannot version a folder." });
    }

    // Increment version counter
    codeFile.currentVersion += 1;
    await codeFile.save();

    const version = await CodeVersion.create({
      codeFile: fileId,
      workspace: workspaceId,
      content: codeFile.content,
      savedBy: req.user._id,
      version: codeFile.currentVersion,
      label: label || `v${codeFile.currentVersion}`,
      size: Buffer.byteLength(codeFile.content || "", "utf8"),
    });

    const populated = await version.populate("savedBy", "username avatar");

    return res.status(201).json({ success: true, version: populated });
  } catch (error) {
    console.error("saveVersion error:", error.message);
    return res.status(500).json({ success: false, message: "Server error saving version." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/workspaces/:workspaceId/code-files/:fileId/versions
// @desc    Get version history list for a file
// @access  Private (any member)
// ─────────────────────────────────────────────────────────────────────────────
exports.getVersionHistory = async (req, res) => {
  try {
    const { workspaceId, fileId } = req.params;
    const limit = parseInt(req.query.limit) || 30;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, message: "Workspace not found." });
    }

    if (!isMember(workspace, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const versions = await CodeVersion.find({ codeFile: fileId, workspace: workspaceId })
      .populate("savedBy", "username avatar email")
      .sort({ version: -1 })
      .limit(limit)
      .select("-content"); // Exclude content from list (fetch individually)

    return res.status(200).json({ success: true, count: versions.length, versions });
  } catch (error) {
    console.error("getVersionHistory error:", error.message);
    return res.status(500).json({ success: false, message: "Server error fetching version history." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/workspaces/:workspaceId/code-files/:fileId/versions/:versionId
// @desc    Get a specific version with full content (for diff view)
// @access  Private (any member)
// ─────────────────────────────────────────────────────────────────────────────
exports.getVersionById = async (req, res) => {
  try {
    const { workspaceId, fileId, versionId } = req.params;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, message: "Workspace not found." });
    }

    if (!isMember(workspace, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const version = await CodeVersion.findOne({
      _id: versionId,
      codeFile: fileId,
      workspace: workspaceId,
    }).populate("savedBy", "username avatar email");

    if (!version) {
      return res.status(404).json({ success: false, message: "Version not found." });
    }

    return res.status(200).json({ success: true, version });
  } catch (error) {
    console.error("getVersionById error:", error.message);
    return res.status(500).json({ success: false, message: "Server error fetching version." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/workspaces/:workspaceId/code-files/:fileId/versions/:versionId/restore
// @desc    Restore file content from a specific version
// @access  Private (any member)
// ─────────────────────────────────────────────────────────────────────────────
exports.restoreVersion = async (req, res) => {
  try {
    const { workspaceId, fileId, versionId } = req.params;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, message: "Workspace not found." });
    }

    if (!isMember(workspace, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const version = await CodeVersion.findOne({
      _id: versionId,
      codeFile: fileId,
      workspace: workspaceId,
    });

    if (!version) {
      return res.status(404).json({ success: false, message: "Version not found." });
    }

    // Restore content from the selected version snapshot
    const codeFile = await CodeFile.findByIdAndUpdate(
      fileId,
      {
        content: version.content,
        lastEditedBy: req.user._id,
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: `File restored to version ${version.version}.`,
      codeFile,
    });
  } catch (error) {
    console.error("restoreVersion error:", error.message);
    return res.status(500).json({ success: false, message: "Server error restoring version." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/workspaces/:workspaceId/code-files/:fileId/execute
// @desc    Execute code file content and return output
// @access  Private (any member)
// ─────────────────────────────────────────────────────────────────────────────
exports.executeCodeFile = async (req, res) => {
  try {
    const { workspaceId, fileId } = req.params;
    const { code, language } = req.body; // Allow inline code override

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, message: "Workspace not found." });
    }

    if (!isMember(workspace, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    let execCode = code;
    let execLang = language;

    // If no inline code provided, use file's saved content
    if (!execCode) {
      const codeFile = await CodeFile.findOne({
        _id: fileId,
        workspace: workspaceId,
        isDeleted: false,
      });
      if (!codeFile) {
        return res.status(404).json({ success: false, message: "File not found." });
      }
      execCode = codeFile.content;
      execLang = codeFile.language;
    }

    const startTime = Date.now();
    const result = await executeCode(execCode, execLang);
    const executionTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      result: {
        ...result,
        executionTime,
      },
    });
  } catch (error) {
    console.error("executeCodeFile error:", error.message);
    return res.status(500).json({ success: false, message: "Server error executing code." });
  }
};
