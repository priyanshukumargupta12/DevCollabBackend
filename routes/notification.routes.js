const express = require("express");
const router = express.Router();

const {
  getNotifications,
  markAsRead,
  markAllAsRead,
} = require("../controllers/notification.controller");

const { protect } = require("../middleware/auth.middleware");

// Enforce auth check across all notification routes
router.use(protect);

router.route("/")
  .get(getNotifications);

router.route("/read-all")
  .put(markAllAsRead);

router.route("/:id/read")
  .put(markAsRead);

module.exports = router;
