const Notification = require("../models/Notification");

/**
 * Creates a notification in the DB and broadcasts it via Socket.io if the user is online.
 * Does not notify users of their own actions.
 */
const createNotification = async ({
  recipient,
  sender,
  type,
  title,
  message,
  workspace,
  relatedId,
}) => {
  try {
    // Prevent sending a notification to oneself
    if (recipient && sender && recipient.toString() === sender.toString()) {
      return null;
    }

    // 1. Create in database
    const notification = await Notification.create({
      recipient,
      sender,
      type,
      title,
      message,
      workspace,
      relatedId,
    });

    // 2. Populate references for frontend display
    const populated = await notification.populate([
      { path: "sender", select: "username email avatar" },
      { path: "workspace", select: "name" },
    ]);

    // 3. Dynamically import socket helper to prevent circular dependencies at startup
    const socketModule = require("../socket");
    if (socketModule && typeof socketModule.sendNotificationToUser === "function") {
      socketModule.sendNotificationToUser(recipient, populated);
    }

    return populated;
  } catch (error) {
    console.error("❌ createNotification error:", error.message);
    return null;
  }
};

module.exports = {
  createNotification,
};
