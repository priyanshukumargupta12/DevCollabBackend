const mongoose = require("mongoose");

/**
 * Notification Schema
 * Stores alerts for task assignments, mentions, and workspace invites.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient is required"],
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["task_assignment", "mention", "workspace_invite", "meeting"],
      required: [true, "Notification type is required"],
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
    },
    message: {
      type: String,
      required: [true, "Notification message is required"],
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId, // Generic reference for Task ID, Message ID, etc.
    },
  },
  {
    timestamps: true,
  }
);

// Index for compound query: recipient and unread status retrieval
notificationSchema.index({ recipient: 1, isRead: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
