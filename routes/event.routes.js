const express = require("express");
const router = express.Router({ mergeParams: true }); // Access :workspaceId from parent router

const {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
} = require("../controllers/event.controller");

const { protect } = require("../middleware/auth.middleware");

// Enforce authentication on all event routes
router.use(protect);

// ─── Calendar Event CRUD ──────────────────────────────────────────────────────
router.route("/")
  .post(createEvent)
  .get(getEvents);

router.route("/:eventId")
  .put(updateEvent)
  .delete(deleteEvent);

module.exports = router;
