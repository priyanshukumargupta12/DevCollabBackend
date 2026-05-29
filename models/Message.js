const mongoose = require("mongoose");

/**
 * Message Schema
 * Stores chat messages sent within workspaces.
 */
const messageSchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: [true, "Message text cannot be empty"],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Optimize sorting queries on chat history loads
messageSchema.index({ workspace: 1, createdAt: 1 });
messageSchema.index({ text: "text" });

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
