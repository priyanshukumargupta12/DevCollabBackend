const Event = require("../models/Event");
const Task = require("../models/Task");
const Workspace = require("../models/Workspace");

/**
 * Helper: Verify workspace membership
 */
const isWorkspaceMember = async (workspaceId, userId) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return { access: false, workspace: null };
  const isOwner = workspace.owner.toString() === userId.toString();
  const isMember = workspace.members.some(
    (m) => (m.user._id || m.user).toString() === userId.toString()
  );
  return { access: isOwner || isMember, workspace };
};

/**
 * @route   POST /api/workspaces/:workspaceId/events
 * @desc    Create a new calendar event
 * @access  Private / Workspace Member
 */
exports.createEvent = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { title, description, start, end, allDay, type, color, reminders } = req.body;

    const { access } = await isWorkspaceMember(workspaceId, req.user._id);
    if (!access) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: "Event title is required." });
    }
    if (!start || !end) {
      return res.status(400).json({ success: false, message: "Start and end dates are required." });
    }
    if (new Date(end) < new Date(start)) {
      return res.status(400).json({ success: false, message: "End time must be after start time." });
    }

    // Build reminders array — reset sent flag for new events
    const processedReminders = Array.isArray(reminders)
      ? reminders.map((r) => ({ minutes: Number(r.minutes || r), sent: false }))
      : [];

    const event = await Event.create({
      title: title.trim(),
      description: description?.trim() || "",
      start: new Date(start),
      end: new Date(end),
      allDay: !!allDay,
      type: type || "event",
      color: color || "",
      workspace: workspaceId,
      creator: req.user._id,
      reminders: processedReminders,
    });

    const populated = await event.populate("creator", "username avatar profile.nickname");

    res.status(201).json({ success: true, event: populated });
  } catch (error) {
    console.error("createEvent error:", error.message);
    res.status(500).json({ success: false, message: "Server error creating event." });
  }
};

/**
 * @route   GET /api/workspaces/:workspaceId/events
 * @desc    Get all events + task deadlines for a workspace calendar
 * @access  Private / Workspace Member
 */
exports.getEvents = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const { access } = await isWorkspaceMember(workspaceId, req.user._id);
    if (!access) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Fetch real calendar events
    const events = await Event.find({ workspace: workspaceId })
      .populate("creator", "username avatar profile.nickname")
      .sort({ start: 1 });

    // Fetch tasks that have a due date — render them as read-only deadline events
    const tasksWithDueDate = await Task.find({
      workspace: workspaceId,
      dueDate: { $ne: null, $exists: true },
    }).populate("creator", "username");

    const deadlineEvents = tasksWithDueDate.map((task) => ({
      _id: `task-${task._id}`,
      title: `📌 ${task.title}`,
      description: task.description || "",
      start: task.dueDate,
      end: task.dueDate,
      allDay: true,
      type: "deadline",
      color: task.priority === "high" ? "#ef4444" : task.priority === "medium" ? "#f59e0b" : "#64748b",
      isTaskDeadline: true,
      taskId: task._id,
      workspace: workspaceId,
      creator: task.creator,
      reminders: [],
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));

    res.status(200).json({
      success: true,
      events: [...events, ...deadlineEvents],
    });
  } catch (error) {
    console.error("getEvents error:", error.message);
    res.status(500).json({ success: false, message: "Server error fetching events." });
  }
};

/**
 * @route   PUT /api/workspaces/:workspaceId/events/:eventId
 * @desc    Update an event
 * @access  Private / Creator only
 */
exports.updateEvent = async (req, res) => {
  try {
    const { workspaceId, eventId } = req.params;
    const { title, description, start, end, allDay, type, color, reminders } = req.body;

    const { access } = await isWorkspaceMember(workspaceId, req.user._id);
    if (!access) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const event = await Event.findOne({ _id: eventId, workspace: workspaceId });
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    // Only the creator can edit events
    if (event.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Only the event creator can edit it." });
    }

    if (title !== undefined) event.title = title.trim();
    if (description !== undefined) event.description = description.trim();
    if (start !== undefined) event.start = new Date(start);
    if (end !== undefined) event.end = new Date(end);
    if (allDay !== undefined) event.allDay = !!allDay;
    if (type !== undefined) event.type = type;
    if (color !== undefined) event.color = color;

    // Reset sent flags when reminders are updated
    if (reminders !== undefined) {
      event.reminders = Array.isArray(reminders)
        ? reminders.map((r) => ({ minutes: Number(r.minutes || r), sent: false }))
        : [];
    }

    await event.save();
    const populated = await event.populate("creator", "username avatar profile.nickname");

    res.status(200).json({ success: true, event: populated });
  } catch (error) {
    console.error("updateEvent error:", error.message);
    res.status(500).json({ success: false, message: "Server error updating event." });
  }
};

/**
 * @route   DELETE /api/workspaces/:workspaceId/events/:eventId
 * @desc    Delete an event
 * @access  Private / Creator or Workspace Owner
 */
exports.deleteEvent = async (req, res) => {
  try {
    const { workspaceId, eventId } = req.params;

    const { access, workspace } = await isWorkspaceMember(workspaceId, req.user._id);
    if (!access) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const event = await Event.findOne({ _id: eventId, workspace: workspaceId });
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    const isCreator = event.creator.toString() === req.user._id.toString();
    const isOwner = workspace && workspace.owner.toString() === req.user._id.toString();

    if (!isCreator && !isOwner) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this event." });
    }

    await Event.findByIdAndDelete(eventId);

    res.status(200).json({ success: true, message: "Event deleted successfully." });
  } catch (error) {
    console.error("deleteEvent error:", error.message);
    res.status(500).json({ success: false, message: "Server error deleting event." });
  }
};
