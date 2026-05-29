const mongoose = require("mongoose");

/**
 * CodeFile Schema
 * Represents a code file or folder within a workspace's coding environment.
 * Supports nested folder structures via self-referencing parent field.
 */
const codeFileSchema = new mongoose.Schema(
  {
    // ── Identity ────────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, "File name is required"],
      trim: true,
      maxlength: [120, "File name cannot exceed 120 characters"],
    },

    // ── Type ────────────────────────────────────────────────────────────────
    isFolder: {
      type: Boolean,
      default: false,
    },

    // ── Nested tree: reference to parent folder (null = root level) ─────────
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CodeFile",
      default: null,
    },

    // ── Content (only applicable to files, not folders) ─────────────────────
    content: {
      type: String,
      default: "",
    },

    // ── Language for syntax highlighting and execution ───────────────────────
    language: {
      type: String,
      enum: [
        "javascript",
        "typescript",
        "python",
        "java",
        "cpp",
        "c",
        "go",
        "rust",
        "html",
        "css",
        "json",
        "markdown",
        "plaintext",
      ],
      default: "javascript",
    },

    // ── Relationships ────────────────────────────────────────────────────────
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: [true, "Workspace reference is required"],
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Version tracking ─────────────────────────────────────────────────────
    currentVersion: {
      type: Number,
      default: 1,
    },

    // ── Auto-save draft (temporary unsaved content) ──────────────────────────
    draft: {
      type: String,
      default: null,
    },

    // ── Soft delete flag ─────────────────────────────────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// Query all files in a workspace efficiently
codeFileSchema.index({ workspace: 1, parent: 1, isDeleted: 1 });
// Query by workspace and name for uniqueness checks
codeFileSchema.index({ workspace: 1, parent: 1, name: 1 });

/**
 * Detect language from file extension
 * @param {string} filename
 * @returns {string} language identifier
 */
codeFileSchema.statics.detectLanguage = function (filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  const extMap = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    java: "java",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    c: "c",
    h: "c",
    go: "go",
    rs: "rust",
    html: "html",
    htm: "html",
    css: "css",
    json: "json",
    md: "markdown",
    txt: "plaintext",
  };
  return extMap[ext] || "plaintext";
};

const CodeFile = mongoose.model("CodeFile", codeFileSchema);

module.exports = CodeFile;
