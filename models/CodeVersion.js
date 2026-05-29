const mongoose = require("mongoose");

/**
 * CodeVersion Schema
 * Stores point-in-time snapshots of code file content.
 * Used for version history, diff viewing, and content restoration.
 */
const codeVersionSchema = new mongoose.Schema(
  {
    // ── Reference to parent code file ────────────────────────────────────────
    codeFile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CodeFile",
      required: [true, "CodeFile reference is required"],
    },

    // ── Workspace reference for quick access control checks ──────────────────
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: [true, "Workspace reference is required"],
    },

    // ── Snapshot content at save time ────────────────────────────────────────
    content: {
      type: String,
      required: true,
      default: "",
    },

    // ── Who triggered the save ───────────────────────────────────────────────
    savedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ── Human-readable version label (e.g., "v1", "v2", "Initial commit") ───
    label: {
      type: String,
      default: "",
      maxlength: [100, "Label cannot exceed 100 characters"],
    },

    // ── Monotonically increasing version number per file ─────────────────────
    version: {
      type: Number,
      required: true,
      min: 1,
    },

    // ── Content size in bytes for display ────────────────────────────────────
    size: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// Fetch version history for a file in order
codeVersionSchema.index({ codeFile: 1, version: -1 });
// Workspace-level queries
codeVersionSchema.index({ workspace: 1, codeFile: 1 });

const CodeVersion = mongoose.model("CodeVersion", codeVersionSchema);

module.exports = CodeVersion;
