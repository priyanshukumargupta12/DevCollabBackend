const Event = require("../models/Event");
const Workspace = require("../models/Workspace");
const { createNotification } = require("./notificationHelper");

let schedulerInterval = null;

/**
 * Starts the background reminder scheduler.
 * Runs every 60 seconds, checks upcoming events with unsent reminders,
 * dispatches Socket.io + DB notifications to all workspace members.
 */
const startReminderScheduler = () => {
  if (schedulerInterval) {
    console.log("⏰ Reminder scheduler already running.");
    return;
  }

  console.log("⏰ Reminder scheduler started — checking every 60 seconds.");

  schedulerInterval = setInterval(async () => {
    try {
      const now = new Date();

      // Query events that:
      // 1. Are in the future (start time is ahead)
      // 2. Have at least one unsent reminder
      const upcomingEvents = await Event.find({
        start: { $gt: now },
        "reminders.sent": false,
      }).populate("workspace", "name owner members");

      for (const event of upcomingEvents) {
        const minutesUntilStart = (event.start.getTime() - now.getTime()) / 60000;

        for (let i = 0; i < event.reminders.length; i++) {
          const reminder = event.reminders[i];
          if (reminder.sent) continue;

          // Fire the reminder if we are within [offset - 1, offset + 1] minute window
          if (Math.abs(minutesUntilStart - reminder.minutes) <= 1) {
            // Mark as sent immediately to prevent duplicate fires
            event.reminders[i].sent = true;
            await event.save();

            // Gather all members to notify (owner + all workspace members)
            const workspace = event.workspace;
            const recipientIds = new Set();

            if (workspace.owner) {
              recipientIds.add(workspace.owner.toString());
            }
            if (Array.isArray(workspace.members)) {
              workspace.members.forEach((m) => {
                const uid = (m.user?._id || m.user)?.toString();
                if (uid) recipientIds.add(uid);
              });
            }

            const timeLabel =
              reminder.minutes === 0
                ? "now"
                : reminder.minutes < 60
                ? `in ${reminder.minutes} minutes`
                : reminder.minutes < 1440
                ? `in ${Math.round(reminder.minutes / 60)} hour(s)`
                : `in ${Math.round(reminder.minutes / 1440)} day(s)`;

            // Dispatch a notification to each member
            for (const recipientId of recipientIds) {
              await createNotification({
                recipient: recipientId,
                sender: event.creator,
                type: "workspace_update",
                title: `⏰ Event Reminder: ${event.title}`,
                message: `"${event.title}" in workspace "${workspace.name}" starts ${timeLabel}.`,
                workspace: workspace._id,
                relatedId: event._id,
              });
            }

            console.log(
              `⏰ Reminder sent for event "${event.title}" (${timeLabel}) → ${recipientIds.size} members`
            );
          }
        }
      }
    } catch (err) {
      console.error("❌ Reminder scheduler error:", err.message);
    }
  }, 60 * 1000); // every 60 seconds
};

/**
 * Stops the background scheduler (useful for graceful shutdown).
 */
const stopReminderScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("⏰ Reminder scheduler stopped.");
  }
};

module.exports = { startReminderScheduler, stopReminderScheduler };
