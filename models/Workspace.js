const mongoose = require("mongoose");

/**
 * Workspace Schema
 * Represents a project workspace owned by a user, containing members with different roles.
 */
const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Workspace name is required"],
      trim: true,
      minlength: [3, "Workspace name must be at least 3 characters"],
      maxlength: [50, "Workspace name cannot exceed 50 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
      default: "",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["admin", "member"],
          default: "member",
        },
        status: {
          type: String,
          enum: ["pending", "accepted"],
          default: "pending",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexing for quick lookups on user workspaces
workspaceSchema.index({ owner: 1 });
workspaceSchema.index({ "members.user": 1 });
workspaceSchema.index({ name: "text", description: "text" });

const Workspace = mongoose.model("Workspace", workspaceSchema);

module.exports = Workspace;
