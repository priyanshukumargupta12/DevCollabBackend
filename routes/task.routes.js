const express = require("express");
const router = express.Router({ mergeParams: true }); // Enable child access to :workspaceId from parent router

const {
  createTask,
  getTasks,
  updateTask,
  updateTaskStatus,
  deleteTask,
} = require("../controllers/task.controller");

const { protect } = require("../middleware/auth.middleware");

// Enforce auth check across all task routes
router.use(protect);

// ─── Base CRUD on Workspace Tasks ──────────────────────────────────────────
router.route("/")
  .post(createTask)
  .get(getTasks);

router.route("/:taskId")
  .put(updateTask)
  .delete(deleteTask);

// ─── Status Update (Drag & Drop Helper) ──────────────────────────────────────
router.route("/:taskId/status")
  .patch(updateTaskStatus);

module.exports = router;
