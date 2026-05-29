const mongoose = require("mongoose");

/**
 * Note Schema
 * Represents a collaborative or private markdown note in a workspace.
 */
const noteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Note title is required"],
      trim: true,
      minlength: [1, "Note title must be at least 1 character"],
      maxlength: [100, "Note title cannot exceed 100 characters"],
    },
    content: {
      type: String,
      default: "",
    },
    isDraft: {
      type: Boolean,
      default: true,
    },
    isShared: {
      type: Boolean,
      default: false,
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying a workspace's public/shared or draft notes efficiently
noteSchema.index({ workspace: 1, isShared: 1 });
noteSchema.index({ title: "text", content: "text" });

const Note = mongoose.model("Note", noteSchema);

module.exports = Note;
