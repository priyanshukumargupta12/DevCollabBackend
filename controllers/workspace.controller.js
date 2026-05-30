const Workspace = require("../models/Workspace");
const User = require("../models/User");
const Task = require("../models/Task");
const Event = require("../models/Event");
const File = require("../models/File");
const Note = require("../models/Note");
const Message = require("../models/Message");
const CodeFile = require("../models/CodeFile");
const CodeVersion = require("../models/CodeVersion");
const Activity = require("../models/Activity");
const Notification = require("../models/Notification");
const { createNotification } = require("../utils/notificationHelper");
const { sendWorkspaceInviteEmail, sendWorkspaceCreatedEmail } = require("../utils/sendEmail");

/**
 * Helper: Check if user is the workspace owner.
 */
const isOwner = (workspace, userId) => {
  const ownerId = workspace.owner._id || workspace.owner;
  return ownerId.toString() === userId.toString();
};

/**
 * Helper: Get member role inside the workspace.
 * Returns 'admin', 'member' or null if not a member.
 */
const getMemberRole = (workspace, userId) => {
  const member = workspace.members.find((m) => {
    const memberUserId = m.user._id || m.user;
    return memberUserId.toString() === userId.toString() && m.status === "accepted";
  });
  return member ? member.role : null;
};

/**
 * Helper: Check if user has admin/write permissions (either owner or admin).
 */
const hasAdminAccess = (workspace, userId) => {
  if (isOwner(workspace, userId)) return true;
  return getMemberRole(workspace, userId) === "admin";
};

/**
 * Helper: Check if user is part of the workspace (owner, admin, or member).
 */
const isMember = (workspace, userId) => {
  if (isOwner(workspace, userId)) return true;
  return getMemberRole(workspace, userId) !== null;
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/workspaces
// @desc    Create a new workspace
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.createWorkspace = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Workspace name is required and must be at least 3 characters.",
      });
    }

    const workspace = await Workspace.create({
      name: name.trim(),
      description: description ? description.trim() : "",
      owner: req.user._id,
      members: [],
    });

    // Populate owner info before responding
    const populated = await workspace.populate("owner", "username email avatar profile.nickname");

    // Send workspace created email (async background task)
    if (populated.owner && populated.owner.email) {
      const workspaceUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/workspace/${workspace._id}/editor`;
      sendWorkspaceCreatedEmail(
        populated.owner.email,
        populated.owner.username,
        workspace.name,
        workspaceUrl
      ).catch((err) => {
        console.error("❌ Workspace created email failed to send:", err.message);
      });
    }

    res.status(201).json({
      success: true,
      workspace: populated,
    });
  } catch (error) {
    console.error("createWorkspace error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during workspace creation.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/workspaces
// @desc    Get all workspaces the user is owner, admin, or member of
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.getWorkspaces = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find workspaces where user is owner OR user is an accepted member
    const workspaces = await Workspace.find({
      $or: [
        { owner: userId },
        { members: { $elemMatch: { user: userId, status: "accepted" } } },
      ],
    })
      .populate("owner", "username email avatar profile.nickname")
      .populate("members.user", "username email avatar profile.nickname")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: workspaces.length,
      workspaces,
    });
  } catch (error) {
    console.error("getWorkspaces error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error fetching workspaces.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/workspaces/:id
// @desc    Get a single workspace details
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.getWorkspaceById = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate("owner", "username email avatar profile.nickname")
      .populate("members.user", "username email avatar profile.nickname");

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    // Access control: User must be owner or member
    if (!isMember(workspace, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this workspace.",
      });
    }

    res.status(200).json({
      success: true,
      workspace,
    });
  } catch (error) {
    console.error("getWorkspaceById error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error fetching workspace details.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/workspaces/:id
// @desc    Update workspace name and description
// @access  Private (Owner or Admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateWorkspace = async (req, res) => {
  try {
    const { name, description } = req.body;

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    // Access Control: Owner or Admin
    if (!hasAdminAccess(workspace, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to edit this workspace.",
      });
    }

    if (name) {
      if (name.trim().length < 3) {
        return res.status(400).json({
          success: false,
          message: "Workspace name must be at least 3 characters.",
        });
      }
      workspace.name = name.trim();
    }

    if (description !== undefined) {
      workspace.description = description.trim();
    }

    await workspace.save();

    // Populate and return updated workspace
    const updated = await Workspace.findById(workspace._id)
      .populate("owner", "username email avatar")
      .populate("members.user", "username email avatar");

    res.status(200).json({
      success: true,
      workspace: updated,
    });
  } catch (error) {
    console.error("updateWorkspace error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error updating workspace.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/workspaces/:id
// @desc    Delete a workspace
// @access  Private (Owner only)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    // Access Control: Owner only
    if (!isOwner(workspace, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only the workspace owner can delete it.",
      });
    }

    const workspaceId = req.params.id;

    // Perform cascade deletes of all associated workspace entities
    await Promise.all([
      Workspace.findByIdAndDelete(workspaceId),
      Task.deleteMany({ workspace: workspaceId }),
      Event.deleteMany({ workspace: workspaceId }),
      File.deleteMany({ workspace: workspaceId }),
      Note.deleteMany({ workspace: workspaceId }),
      Message.deleteMany({ workspace: workspaceId }),
      CodeFile.deleteMany({ workspace: workspaceId }),
      CodeVersion.deleteMany({ workspace: workspaceId }),
      Activity.deleteMany({ workspace: workspaceId }),
      Notification.deleteMany({ workspace: workspaceId }),
    ]);

    res.status(200).json({
      success: true,
      message: "Workspace deleted successfully.",
    });
  } catch (error) {
    console.error("deleteWorkspace error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error deleting workspace.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/workspaces/:id/members
// @desc    Add a member to the workspace by email
// @access  Private (Owner or Admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.addMember = async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Member email is required.",
      });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    // Access Control: Owner or Admin
    if (!hasAdminAccess(workspace, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to invite members.",
      });
    }

    // Find the user to add
    const userToAdd = await User.findOne({ email: email.toLowerCase().trim() });
    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        message: `User with email "${email}" not found.`,
      });
    }

    // Check if user is already the owner
    if (isOwner(workspace, userToAdd._id)) {
      return res.status(400).json({
        success: false,
        message: "User is already the owner of this workspace.",
      });
    }

    // Check if user is already a member (pending or accepted)
    const existingMember = workspace.members.find((m) => {
      const memberUserId = m.user._id || m.user;
      return memberUserId.toString() === userToAdd._id.toString();
    });

    if (existingMember) {
      const statusText = existingMember.status === "pending" ? "pending invitation to" : "member of";
      return res.status(400).json({
        success: false,
        message: `User is already a ${statusText} this workspace.`,
      });
    }

    // Enforce valid role assignment (admin or member)
    const assignedRole = role && ["admin", "member"].includes(role) ? role : "member";

    workspace.members.push({
      user: userToAdd._id,
      role: assignedRole,
      status: "pending",
    });

    await workspace.save();

    // Trigger real-time workspace invite notification
    await createNotification({
      recipient: userToAdd._id,
      sender: req.user._id,
      type: "workspace_invite",
      title: "Workspace Invitation",
      message: `${req.user.username} added you to the workspace "${workspace.name}".`,
      workspace: workspace._id,
      relatedId: workspace._id,
    });

    // Send workspace invite email (async background task)
    if (userToAdd.email) {
      const workspaceUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/workspace/${workspace._id}/editor`;
      sendWorkspaceInviteEmail(
        userToAdd.email,
        userToAdd.username,
        req.user.username,
        workspace.name,
        workspaceUrl
      ).catch((err) => {
        console.error("❌ Workspace invite email failed to send:", err.message);
      });
    }

    const updated = await Workspace.findById(workspace._id)
      .populate("owner", "username email avatar profile.nickname")
      .populate("members.user", "username email avatar profile.nickname");

    res.status(200).json({
      success: true,
      message: `${userToAdd.username} added successfully.`,
      workspace: updated,
    });
  } catch (error) {
    console.error("addMember error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error inviting member.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/workspaces/:id/members/:userId
// @desc    Remove a member from the workspace (or leave workspace)
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.removeMember = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    // Determine target member and role
    const targetIsMember = workspace.members.some((m) => {
      const memberUserId = m.user._id || m.user;
      return memberUserId.toString() === userId.toString();
    });

    if (!targetIsMember) {
      return res.status(400).json({
        success: false,
        message: "Target user is not a member of this workspace.",
      });
    }

    const targetRole = getMemberRole(workspace, userId);

    // Permission Rules:
    // 1. A member can remove themselves ("leave" the workspace).
    // 2. The owner can remove anyone.
    // 3. An admin can remove standard members, but NOT the owner or other admins.
    const isSelfRemove = currentUserId.toString() === userId.toString();
    const isCurrentUserOwner = isOwner(workspace, currentUserId);
    const isCurrentUserAdmin = getMemberRole(workspace, currentUserId) === "admin";

    let allowed = false;

    if (isSelfRemove) {
      allowed = true; // Anyone can choose to leave
    } else if (isCurrentUserOwner) {
      allowed = true; // Owner has root permission
    } else if (isCurrentUserAdmin && targetRole === "member") {
      allowed = true; // Admin can remove members, but not other admins
    }

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to remove this member.",
      });
    }

    // Pull member from list
    workspace.members = workspace.members.filter((m) => {
      const memberUserId = m.user._id || m.user;
      return memberUserId.toString() !== userId.toString();
    });

    await workspace.save();

    const updated = await Workspace.findById(workspace._id)
      .populate("owner", "username email avatar profile.nickname")
      .populate("members.user", "username email avatar profile.nickname");

    res.status(200).json({
      success: true,
      message: isSelfRemove ? "You have left the workspace." : "Member removed successfully.",
      workspace: updated,
    });
  } catch (error) {
    console.error("removeMember error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error removing member.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/workspaces/:id/members/:userId
// @desc    Update a member's role (Admin / Member)
// @access  Private (Owner only)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateMemberRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || !["admin", "member"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid role ('admin' or 'member').",
      });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    // Access Control: Owner only (Admins cannot change roles of other users)
    if (!isOwner(workspace, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only the workspace owner can modify member roles.",
      });
    }

    // Find the member to update
    const member = workspace.members.find((m) => {
      const memberUserId = m.user._id || m.user;
      return memberUserId.toString() === userId.toString();
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found in this workspace.",
      });
    }

    // Update role
    member.role = role;
    await workspace.save();

    const updated = await Workspace.findById(workspace._id)
      .populate("owner", "username email avatar profile.nickname")
      .populate("members.user", "username email avatar profile.nickname");

    res.status(200).json({
      success: true,
      message: "Member role updated successfully.",
      workspace: updated,
    });
  } catch (error) {
    console.error("updateMemberRole error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error updating member role.",
    });
  }
};

/**
 * Get workspace activities history timeline (paginated)
 * @route   GET /api/workspaces/:id/activities
 * @access  Private
 */
exports.getWorkspaceActivities = async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const Activity = require("../models/Activity");

    const activities = await Activity.find({ workspace: workspaceId })
      .populate("user", "username email avatar profile.nickname")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Activity.countDocuments({ workspace: workspaceId });

    res.status(200).json({
      success: true,
      activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error("getWorkspaceActivities error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error fetching workspace activity timeline.",
    });
  }
};

/**
 * Accept a pending workspace invitation.
 * @route   POST /api/workspaces/:id/invitations/accept
 */
exports.acceptInvitation = async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const userId = req.user._id;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    // Find the pending member
    const member = workspace.members.find((m) => {
      const memberUserId = m.user._id || m.user;
      return memberUserId.toString() === userId.toString();
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found or you are not invited to this workspace.",
      });
    }

    if (member.status === "accepted") {
      return res.status(400).json({
        success: false,
        message: "You have already accepted this invitation.",
      });
    }

    // Update status to accepted
    member.status = "accepted";
    await workspace.save();

    // Create activity logger entry
    const Activity = require("../models/Activity");
    await Activity.create({
      user: userId,
      workspace: workspaceId,
      action: "member_join",
      details: `${req.user.username} accepted the invitation and joined the workspace.`,
    });

    res.status(200).json({
      success: true,
      message: "Invitation accepted. You are now a member of the workspace.",
      workspace,
    });
  } catch (error) {
    console.error("acceptInvitation error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error accepting invitation.",
    });
  }
};

/**
 * Decline a pending workspace invitation.
 * @route   POST /api/workspaces/:id/invitations/reject
 */
exports.rejectInvitation = async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const userId = req.user._id;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    // Find the pending member
    const memberIndex = workspace.members.findIndex((m) => {
      const memberUserId = m.user._id || m.user;
      return memberUserId.toString() === userId.toString();
    });

    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found or you are not invited to this workspace.",
      });
    }

    // Remove the member
    workspace.members.splice(memberIndex, 1);
    await workspace.save();

    res.status(200).json({
      success: true,
      message: "Invitation declined successfully.",
    });
  } catch (error) {
    console.error("rejectInvitation error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error declining invitation.",
    });
  }
};
