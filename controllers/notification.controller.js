const Notification = require("../models/Notification");

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/notifications
// @desc    Get all notifications for the authenticated user
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate("sender", "username email avatar")
      .populate("workspace", "name")
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error("getNotifications error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error fetching notifications.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/notifications/:id/read
// @desc    Mark a single notification as read
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error("markAsRead error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error updating notification status.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/notifications/read-all
// @desc    Mark all notifications of the user as read
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
    });
  } catch (error) {
    console.error("markAllAsRead error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error marking all notifications as read.",
    });
  }
};
