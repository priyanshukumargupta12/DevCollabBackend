const Activity = require("../models/Activity");
const Task = require("../models/Task");
const Workspace = require("../models/Workspace");

/**
 * Express middleware to automatically log user activities inside workspaces.
 * Intercepts successful mutations (POST, PUT, PATCH, DELETE) and records them.
 */
const activityLogger = async (req, res, next) => {
  // Pre-fetch resource names for DELETE requests before they are removed from the database
  if (req.method === "DELETE") {
    try {
      if (req.params.taskId) {
        const task = await Task.findById(req.params.taskId);
        if (task) {
          req._tempResource = { type: "task", title: task.title };
        }
      } else if (req.params.fileId && req.baseUrl.includes("/files")) {
        const FileModel = require("../models/File");
        const file = await FileModel.findById(req.params.fileId);
        if (file) {
          req._tempResource = { type: "file", name: file.name };
        }
      } else if (req.params.userId && req.path.includes("/members/")) {
        const User = require("../models/User");
        const user = await User.findById(req.params.userId);
        if (user) {
          req._tempResource = {
            type: "member",
            name: user.profile?.nickname || user.username,
            email: user.email,
          };
        }
      } else if (req.params.id && req.baseUrl === "/api/workspaces") {
        const ws = await Workspace.findById(req.params.id);
        if (ws) {
          req._tempResource = { type: "workspace", name: ws.name };
        }
      }
    } catch (err) {
      console.warn("⚠️ Activity logger pre-fetch warning:", err.message);
    }
  }

  // Intercept the response JSON formatter to trigger logging after successful handler execution
  const originalJson = res.json;
  res.json = function (data) {
    res.json = originalJson;

    if (res.statusCode >= 200 && res.statusCode < 300) {
      logUserActivity(req, res, data).catch((err) =>
        console.error("❌ Activity logging error:", err.message)
      );
    }

    return originalJson.call(this, data);
  };

  next();
};

/**
 * Formulates and saves the activity to the database.
 */
const logUserActivity = async (req, res, data) => {
  const userId = req.user?._id;
  if (!userId) return;

  const username = req.user.profile?.nickname || req.user.username;
  let workspaceId = req.params.workspaceId || req.params.id;
  let action = "";
  let details = "";
  const metadata = new Map();

  const baseUrl = req.baseUrl;
  const path = req.path;
  const method = req.method;

  // 1. Workspace Base CRUD & Member Management
  if (baseUrl === "/api/workspaces") {
    // Workspace Create
    if (method === "POST" && path === "/") {
      action = "workspace_create";
      workspaceId = data.workspace?._id;
      details = `created workspace "${data.workspace?.name}"`;
      metadata.set("workspaceName", data.workspace?.name);
    }
    // Workspace Update
    else if (method === "PUT" && path.match(/^\/[a-f0-9]{24}$/)) {
      action = "workspace_update";
      details = `updated workspace details for "${data.workspace?.name}"`;
      metadata.set("workspaceName", data.workspace?.name);
    }
    // Workspace Delete
    else if (method === "DELETE" && path.match(/^\/[a-f0-9]{24}$/)) {
      action = "workspace_delete";
      details = `deleted workspace "${req._tempResource?.name || "Workspace"}"`;
      metadata.set("workspaceName", req._tempResource?.name || "");
    }
    // Member Add/Join
    else if (method === "POST" && path.match(/^\/[a-f0-9]{24}\/members$/)) {
      action = "member_join";
      details = `added collaborator ${req.body.email} as ${req.body.role}`;
      metadata.set("email", req.body.email);
      metadata.set("role", req.body.role);
    }
    // Member Leave/Remove
    else if (method === "DELETE" && path.match(/^\/[a-f0-9]{24}\/members\/[a-f0-9]{24}$/)) {
      action = "member_leave";
      const memberName = req._tempResource?.name || "Collaborator";
      details = `removed collaborator "${memberName}"`;
      metadata.set("memberName", memberName);
    }
    // Member Role Update
    else if (method === "PUT" && path.match(/^\/[a-f0-9]{24}\/members\/[a-f0-9]{24}$/)) {
      action = "member_role_update";
      const memberName = req._tempResource?.name || "Collaborator";
      details = `updated role of "${memberName}" to ${req.body.role}`;
      metadata.set("memberName", memberName);
      metadata.set("role", req.body.role);
    }
  }
  // 2. Task Management
  else if (baseUrl.includes("/tasks")) {
    // Task Create
    if (method === "POST" && path === "/") {
      action = "task_create";
      details = `created task "${data.task?.title}"`;
      metadata.set("taskTitle", data.task?.title);
      metadata.set("status", data.task?.status);
    }
    // Task Status Update (Drag & Drop)
    else if (method === "PATCH" && path.match(/^\/[a-f0-9]{24}\/status$/)) {
      action = "task_status_update";
      details = `moved task "${data.task?.title}" to "${data.task?.status}"`;
      metadata.set("taskTitle", data.task?.title);
      metadata.set("status", data.task?.status);
    }
    // Task Update (generic details)
    else if (method === "PUT" && path.match(/^\/[a-f0-9]{24}$/)) {
      action = "task_update";
      details = `updated task details for "${data.task?.title}"`;
      metadata.set("taskTitle", data.task?.title);
      metadata.set("status", data.task?.status);
    }
    // Task Delete
    else if (method === "DELETE" && path.match(/^\/[a-f0-9]{24}$/)) {
      action = "task_delete";
      details = `deleted task "${req._tempResource?.title || "Task"}"`;
      metadata.set("taskTitle", req._tempResource?.title || "");
    }
  }
  // 3. Shared Files Uploads
  else if (baseUrl.includes("/files")) {
    // File Upload
    if (method === "POST" && path === "/") {
      action = "file_upload";
      details = `uploaded file "${data.file?.name}"`;
      metadata.set("fileName", data.file?.name);
    }
    // File Delete
    else if (method === "DELETE" && path.match(/^\/[a-f0-9]{24}$/)) {
      action = "file_delete";
      details = `deleted file "${req._tempResource?.name || "File"}"`;
      metadata.set("fileName", req._tempResource?.name || "");
    }
  }

  // Create database log entry
  if (action && workspaceId) {
    try {
      await Activity.create({
        user: userId,
        workspace: workspaceId,
        action,
        details,
        metadata,
      });
    } catch (err) {
      console.error("❌ Error writing activity to DB:", err.message);
    }
  }
};

module.exports = activityLogger;
