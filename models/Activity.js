const mongoose = require("mongoose");

/**
 * Activity Schema
 * Represents user operations inside a workspace, logging tasks, members, files, and workspace updates.
 */
const activitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: [true, "Workspace is required"],
      index: true,
    },
    action: {
      type: String,
      required: [true, "Action type is required"],
      enum: [
        "workspace_create",
        "workspace_update",
        "workspace_delete",
        "task_create",
        "task_update",
        "task_status_update",
        "task_delete",
        "member_join",
        "member_leave",
        "member_role_update",
        "file_upload",
        "file_delete",
      ],
    },
    details: {
      type: String,
      required: [true, "Activity details description is required"],
      trim: true,
    },
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for quick workspace activity pagination
activitySchema.index({ workspace: 1, createdAt: -1 });

const Activity = mongoose.model("Activity", activitySchema);

module.exports = Activity;
