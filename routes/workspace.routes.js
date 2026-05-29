const express = require("express");
const router = express.Router();

const {
  createWorkspace,
  getWorkspaces,
  getWorkspaceById,
  updateWorkspace,
  deleteWorkspace,
  addMember,
  removeMember,
  updateMemberRole,
  getWorkspaceActivities,
  acceptInvitation,
  rejectInvitation,
} = require("../controllers/workspace.controller");

const { protect } = require("../middleware/auth.middleware");
const activityLogger = require("../middleware/activityLogger");
const taskRoutes = require("./task.routes");
const fileRoutes = require("./file.routes");
const noteRoutes = require("./note.routes");
const eventRoutes = require("./event.routes");
const codeEditorRoutes = require("./codeEditor.routes");

// Enforce auth check across all workspaces routes
router.use(protect);
router.use(activityLogger);

// ─── Mount Nested Task Sub-routes ──────────────────────────────────────────
router.use("/:workspaceId/tasks", taskRoutes);

// ─── Mount Nested File Sub-routes ──────────────────────────────────────────
router.use("/:workspaceId/files", fileRoutes);

// ─── Mount Nested Note Sub-routes ──────────────────────────────────────────
router.use("/:workspaceId/notes", noteRoutes);

// ─── Mount Nested Event/Calendar Sub-routes ──────────────────────────────────
router.use("/:workspaceId/events", eventRoutes);

// ─── Mount Nested Code Editor Sub-routes ──────────────────────────────────────
router.use("/:workspaceId/code-files", codeEditorRoutes);

// ─── Workspace Base CRUD ─────────────────────────────────────────────────────
router.route("/")
  .post(createWorkspace)
  .get(getWorkspaces);

router.route("/:id")
  .get(getWorkspaceById)
  .put(updateWorkspace)
  .delete(deleteWorkspace);

router.route("/:id/activities")
  .get(getWorkspaceActivities);

// ─── Members Management ──────────────────────────────────────────────────────
router.route("/:id/members")
  .post(addMember);

router.route("/:id/members/:userId")
  .put(updateMemberRole)
  .delete(removeMember);

// ─── Invitations Management ──────────────────────────────────────────────────
router.post("/:id/invitations/accept", acceptInvitation);
router.post("/:id/invitations/reject", rejectInvitation);

module.exports = router;
