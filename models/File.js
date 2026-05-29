const mongoose = require("mongoose");

/**
 * File Schema
 * Represents a document, image, or PDF shared in a workspace.
 */
const fileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "File name is required"],
      trim: true,
    },
    url: {
      type: String,
      required: [true, "File URL is required"],
    },
    size: {
      type: Number,
      required: [true, "File size is required"],
    },
    mimeType: {
      type: String,
      required: [true, "File MIME type is required"],
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Optimize search queries filtering by workspace
fileSchema.index({ workspace: 1, createdAt: -1 });

const File = mongoose.model("File", fileSchema);

module.exports = File;
