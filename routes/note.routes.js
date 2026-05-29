const express = require("express");
const router = express.Router({ mergeParams: true }); // Enable access to :workspaceId from parent router

const {
  createNote,
  getNotes,
  updateNote,
  deleteNote,
} = require("../controllers/note.controller");

const { protect } = require("../middleware/auth.middleware");

// Enforce auth check across all note routes
router.use(protect);

// ─── Note CRUD Routes ────────────────────────────────────────────────────────
router.route("/")
  .post(createNote)
  .get(getNotes);

router.route("/:noteId")
  .put(updateNote)
  .delete(deleteNote);

module.exports = router;
