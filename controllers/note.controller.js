const Note = require("../models/Note");
const Workspace = require("../models/Workspace");

/**
 * Helper: Check if a user is a member or owner of the workspace.
 */
const isWorkspaceMember = async (workspaceId, userId) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return false;

  const isOwner = workspace.owner.toString() === userId.toString();
  const isMember = workspace.members.some(
    (m) => (m.user._id || m.user).toString() === userId.toString()
  );

  return isOwner || isMember;
};

/**
 * Create a new Note
 * @route   POST /api/workspaces/:workspaceId/notes
 * @access  Private
 */
exports.createNote = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { title, content, isDraft, isShared } = req.body;

    // 1. Verify workspace access
    const hasAccess = await isWorkspaceMember(workspaceId, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this workspace.",
      });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Note title is required.",
      });
    }

    // 2. Create note
    const note = await Note.create({
      title: title.trim(),
      content: content || "",
      isDraft: isDraft !== undefined ? isDraft : true,
      isShared: isShared !== undefined ? isShared : false,
      workspace: workspaceId,
      creator: req.user._id,
    });

    const populated = await note.populate("creator", "username email avatar profile.nickname");

    res.status(201).json({
      success: true,
      note: populated,
    });
  } catch (error) {
    console.error("createNote error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error creating note.",
    });
  }
};

/**
 * Get all notes in a workspace (accessible to the current user)
 * @route   GET /api/workspaces/:workspaceId/notes
 * @access  Private
 */
exports.getNotes = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // 1. Verify workspace access
    const hasAccess = await isWorkspaceMember(workspaceId, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this workspace.",
      });
    }

    // 2. Fetch notes:
    // Current user can see any notes in the workspace that are:
    // - Created by them, OR
    // - Shared with the workspace (isShared = true)
    const notes = await Note.find({
      workspace: workspaceId,
      $or: [
        { creator: req.user._id },
        { isShared: true }
      ]
    })
      .populate("creator", "username email avatar profile.nickname")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: notes.length,
      notes,
    });
  } catch (error) {
    console.error("getNotes error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error fetching notes.",
    });
  }
};

/**
 * Update a Note
 * @route   PUT /api/workspaces/:workspaceId/notes/:noteId
 * @access  Private
 */
exports.updateNote = async (req, res) => {
  try {
    const { workspaceId, noteId } = req.params;
    const { title, content, isDraft, isShared } = req.body;

    // 1. Verify workspace access
    const hasAccess = await isWorkspaceMember(workspaceId, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this workspace.",
      });
    }

    // 2. Find note
    const note = await Note.findOne({ _id: noteId, workspace: workspaceId });
    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Note not found in this workspace.",
      });
    }

    // 3. Check editing authorization:
    // If the note is private (isShared = false), only the creator can edit it.
    // If it is shared (isShared = true), any workspace member can edit it.
    const isCreator = note.creator.toString() === req.user._id.toString();
    if (!note.isShared && !isCreator) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You cannot edit this private note.",
      });
    }

    // 4. Perform updates
    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Note title cannot be empty.",
        });
      }
      note.title = title.trim();
    }

    if (content !== undefined) {
      note.content = content;
    }

    if (isDraft !== undefined) {
      note.isDraft = isDraft;
    }

    if (isShared !== undefined) {
      // Only the creator can change the shared status of a note
      if (!isCreator && note.isShared !== isShared) {
        return res.status(403).json({
          success: false,
          message: "Only the note creator can change its shared/privacy status.",
        });
      }
      note.isShared = isShared;
    }

    await note.save();

    const populated = await note.populate("creator", "username email avatar profile.nickname");

    res.status(200).json({
      success: true,
      note: populated,
    });
  } catch (error) {
    console.error("updateNote error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error updating note.",
    });
  }
};

/**
 * Delete a Note
 * @route   DELETE /api/workspaces/:workspaceId/notes/:noteId
 * @access  Private
 */
exports.deleteNote = async (req, res) => {
  try {
    const { workspaceId, noteId } = req.params;

    // 1. Verify workspace access
    const hasAccess = await isWorkspaceMember(workspaceId, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this workspace.",
      });
    }

    // 2. Find note
    const note = await Note.findOne({ _id: noteId, workspace: workspaceId });
    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Note not found.",
      });
    }

    // 3. Check delete authorization:
    // Only the note creator, or the workspace owner, can delete a note.
    const workspace = await Workspace.findById(workspaceId);
    const isOwner = workspace && workspace.owner.toString() === req.user._id.toString();
    const isCreator = note.creator.toString() === req.user._id.toString();

    if (!isCreator && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not authorized to delete this note.",
      });
    }

    await Note.findByIdAndDelete(noteId);

    res.status(200).json({
      success: true,
      message: "Note deleted successfully.",
    });
  } catch (error) {
    console.error("deleteNote error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error deleting note.",
    });
  }
};
