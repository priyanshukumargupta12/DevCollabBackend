const mongoose = require("mongoose");

/**
 * Reminder Sub-Schema
 * Tracks a reminder offset in minutes before the event start, and whether it has been sent.
 */
const reminderSchema = new mongoose.Schema({
  minutes: {
    type: Number,
    required: true,
    // 0=at event time, 15, 30, 60, 1440 (1 day), 10080 (1 week)
  },
  sent: {
    type: Boolean,
    default: false,
  },
});

/**
 * Event Schema
 * Represents a scheduled calendar event in a workspace.
 */
const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Event title is required"],
      trim: true,
      maxlength: [100, "Event title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
      default: "",
    },
    start: {
      type: Date,
      required: [true, "Event start time is required"],
    },
    end: {
      type: Date,
      required: [true, "Event end time is required"],
    },
    allDay: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      enum: ["meeting", "event", "other"],
      default: "event",
    },
    color: {
      type: String,
      default: "",
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reminders: {
      type: [reminderSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient workspace calendar queries
eventSchema.index({ workspace: 1, start: 1 });
eventSchema.index({ workspace: 1, end: 1 });

const Event = mongoose.model("Event", eventSchema);

module.exports = Event;
