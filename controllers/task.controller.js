const Task = require("../models/Task");
const Workspace = require("../models/Workspace");
const User = require("../models/User");
const { createNotification } = require("../utils/notificationHelper");
const { sendTaskAssignmentEmail } = require("../utils/sendEmail");

/**
 * Helper: Check if a user is a member of the workspace.
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

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/workspaces/:workspaceId/tasks
// @desc    Create a new task in a workspace
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.createTask = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { title, description, status, priority, dueDate, labels, assignedUser } = req.body;

    // 1. Verify access permissions
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
        message: "Task title is required.",
      });
    }

    // 2. Validate assignee user (if provided)
    let validAssignee = undefined;
    if (assignedUser) {
      const assigneeExists = await User.findById(assignedUser);
      if (assigneeExists) {
        validAssignee = assignedUser;
      }
    }

    // 3. Process labels array
    const processedLabels = Array.isArray(labels)
      ? labels
      : typeof labels === "string"
      ? labels.split(",").map((l) => l.trim()).filter((l) => l.length > 0)
      : [];

    const task = await Task.create({
      title: title.trim(),
      description: description ? description.trim() : "",
      status: status || "todo",
      priority: priority || "medium",
      dueDate: dueDate || undefined,
      labels: processedLabels,
      assignedUser: validAssignee,
      workspace: workspaceId,
      creator: req.user._id,
    });

    const populated = await task.populate([
      { path: "assignedUser", select: "username email avatar profile.nickname" },
      { path: "creator", select: "username email avatar profile.nickname" },
    ]);

    // Send task assignment alert if assignedUser is set
    if (task.assignedUser) {
      const workspace = await Workspace.findById(workspaceId);
      if (workspace) {
        await createNotification({
          recipient: task.assignedUser._id || task.assignedUser,
          sender: req.user._id,
          type: "task_assignment",
          title: "New Task Assigned",
          message: `${req.user.username} assigned you to the task "${task.title}" in workspace "${workspace.name}".`,
          workspace: workspaceId,
          relatedId: task._id,
        });

        // Send task assignment email (async background task)
        if (task.assignedUser.email) {
          const taskUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/workspace/${workspaceId}/editor`;
          sendTaskAssignmentEmail(
            task.assignedUser.email,
            task.assignedUser.username,
            req.user.username,
            task.title,
            workspace.name,
            taskUrl
          ).catch((err) => {
            console.error("❌ Task assignment email failed to send:", err.message);
          });
        }
      }
    }

    res.status(201).json({
      success: true,
      task: populated,
    });
  } catch (error) {
    console.error("createTask error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error creating task.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/workspaces/:workspaceId/tasks
// @desc    Get all tasks in a workspace
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.getTasks = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // Verify access
    const hasAccess = await isWorkspaceMember(workspaceId, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this workspace.",
      });
    }

    const tasks = await Task.find({ workspace: workspaceId })
      .populate("assignedUser", "username email avatar profile.nickname")
      .populate("creator", "username email avatar profile.nickname")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    console.error("getTasks error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error fetching tasks.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/workspaces/:workspaceId/tasks/:taskId
// @desc    Update a task details
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.updateTask = async (req, res) => {
  try {
    const { workspaceId, taskId } = req.params;
    const { title, description, status, priority, dueDate, labels, assignedUser } = req.body;

    // Verify access
    const hasAccess = await isWorkspaceMember(workspaceId, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this workspace.",
      });
    }

    const task = await Task.findOne({ _id: taskId, workspace: workspaceId });
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    const oldAssignee = task.assignedUser ? task.assignedUser.toString() : null;

    // Update details
    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Task title cannot be empty.",
        });
      }
      task.title = title.trim();
    }

    if (description !== undefined) {
      task.description = description.trim();
    }

    if (status !== undefined) {
      if (["todo", "in_progress", "review", "completed"].includes(status)) {
        task.status = status;
      }
    }

    if (priority !== undefined) {
      if (["low", "medium", "high"].includes(priority)) {
        task.priority = priority;
      }
    }

    if (dueDate !== undefined) {
      task.dueDate = dueDate || undefined;
    }

    if (labels !== undefined) {
      task.labels = Array.isArray(labels)
        ? labels
        : typeof labels === "string"
        ? labels.split(",").map((l) => l.trim()).filter((l) => l.length > 0)
        : [];
    }

    if (assignedUser !== undefined) {
      if (assignedUser === null || assignedUser === "") {
        task.assignedUser = undefined;
      } else {
        const assigneeExists = await User.findById(assignedUser);
        if (assigneeExists) {
          task.assignedUser = assignedUser;
        }
      }
    }

    await task.save();

    const populated = await task.populate([
      { path: "assignedUser", select: "username email avatar profile.nickname" },
      { path: "creator", select: "username email avatar profile.nickname" },
    ]);

    // Send task assignment alert if new assignee is set and changed
    const newAssignee = task.assignedUser
      ? (task.assignedUser._id ? task.assignedUser._id.toString() : task.assignedUser.toString())
      : null;
    if (newAssignee && newAssignee !== oldAssignee) {
      const workspace = await Workspace.findById(workspaceId);
      if (workspace) {
        await createNotification({
          recipient: task.assignedUser._id || task.assignedUser,
          sender: req.user._id,
          type: "task_assignment",
          title: "Task Assigned",
          message: `${req.user.username} assigned you to the task "${task.title}" in workspace "${workspace.name}".`,
          workspace: workspaceId,
          relatedId: task._id,
        });

        // Send task assignment email (async background task)
        if (task.assignedUser.email) {
          const taskUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/workspace/${workspaceId}/editor`;
          sendTaskAssignmentEmail(
            task.assignedUser.email,
            task.assignedUser.username,
            req.user.username,
            task.title,
            workspace.name,
            taskUrl
          ).catch((err) => {
            console.error("❌ Task assignment email failed to send:", err.message);
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      task: populated,
    });
  } catch (error) {
    console.error("updateTask error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error updating task details.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PATCH /api/workspaces/:workspaceId/tasks/:taskId/status
// @desc    Update only the status of a task (Drag & Drop helper)
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.updateTaskStatus = async (req, res) => {
  try {
    const { workspaceId, taskId } = req.params;
    const { status } = req.body;

    if (!status || !["todo", "in_progress", "review", "completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid task status.",
      });
    }

    // Verify access
    const hasAccess = await isWorkspaceMember(workspaceId, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this workspace.",
      });
    }

    const task = await Task.findOne({ _id: taskId, workspace: workspaceId });
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found in this workspace.",
      });
    }

    task.status = status;
    await task.save();

    const populated = await task.populate([
      { path: "assignedUser", select: "username email avatar profile.nickname" },
      { path: "creator", select: "username email avatar profile.nickname" },
    ]);

    res.status(200).json({
      success: true,
      task: populated,
    });
  } catch (error) {
    console.error("updateTaskStatus error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error updating task status.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/workspaces/:workspaceId/tasks/:taskId
// @desc    Delete a task
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteTask = async (req, res) => {
  try {
    const { workspaceId, taskId } = req.params;

    // Verify access
    const hasAccess = await isWorkspaceMember(workspaceId, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this workspace.",
      });
    }

    const task = await Task.findOneAndDelete({ _id: taskId, workspace: workspaceId });
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Task deleted successfully.",
    });
  } catch (error) {
    console.error("deleteTask error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error deleting task.",
    });
  }
};
