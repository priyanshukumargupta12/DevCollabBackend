const express = require("express");
const router = express.Router({ mergeParams: true }); // mergeParams to access :workspaceId

const {
  createCodeFile,
  getCodeFiles,
  getCodeFileById,
  updateCodeFile,
  deleteCodeFile,
  saveVersion,
  getVersionHistory,
  getVersionById,
  restoreVersion,
  executeCodeFile,
} = require("../controllers/codeEditor.controller");

// ─── Code Files CRUD ─────────────────────────────────────────────────────────
// GET  /api/workspaces/:workspaceId/code-files       — list all files (tree)
// POST /api/workspaces/:workspaceId/code-files       — create file or folder
router.route("/").get(getCodeFiles).post(createCodeFile);

// GET    /api/workspaces/:workspaceId/code-files/:fileId  — get file with content
// PUT    /api/workspaces/:workspaceId/code-files/:fileId  — update content/name
// DELETE /api/workspaces/:workspaceId/code-files/:fileId  — soft delete
router.route("/:fileId").get(getCodeFileById).put(updateCodeFile).delete(deleteCodeFile);

// ─── Code Execution ──────────────────────────────────────────────────────────
// POST /api/workspaces/:workspaceId/code-files/:fileId/execute
router.post("/:fileId/execute", executeCodeFile);

// ─── Version History ─────────────────────────────────────────────────────────
// GET  /api/workspaces/:workspaceId/code-files/:fileId/versions         — list versions
// POST /api/workspaces/:workspaceId/code-files/:fileId/versions         — save new version
router.route("/:fileId/versions").get(getVersionHistory).post(saveVersion);

// GET  /api/workspaces/:workspaceId/code-files/:fileId/versions/:versionId        — single version (with content)
router.get("/:fileId/versions/:versionId", getVersionById);

// POST /api/workspaces/:workspaceId/code-files/:fileId/versions/:versionId/restore — restore version
router.post("/:fileId/versions/:versionId/restore", restoreVersion);

module.exports = router;
