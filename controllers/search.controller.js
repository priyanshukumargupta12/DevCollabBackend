const Workspace = require("../models/Workspace");
const Task = require("../models/Task");
const Message = require("../models/Message");
const User = require("../models/User");

/**
 * Perform a global search across workspaces, tasks, messages, and users.
 * Filters results by workspaces the authenticated user belongs to (except user search).
 * @route   GET /api/search
 * @access  Private
 */
exports.globalSearch = async (req, res) => {
  try {
    const { q, type = "all", workspaceId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!q || !q.trim()) {
      return res.status(200).json({
        success: true,
        results: { workspaces: [], tasks: [], messages: [], users: [] },
        pagination: { hasMore: false, page, total: 0 },
      });
    }

    const searchQuery = q.trim();

    // 1. Fetch workspaces the user is a member of to restrict access
    const myWorkspaces = await Workspace.find({
      $or: [
        { owner: req.user._id },
        { "members.user": req.user._id },
      ],
    }).select("_id");
    
    const myWorkspaceIds = myWorkspaces.map(w => w._id);

    // Apply workspace filter: if a specific workspaceId was requested, intersect it with user's accessible workspaces
    let targetWorkspaceIds = myWorkspaceIds;
    if (workspaceId) {
      if (myWorkspaceIds.map(String).includes(String(workspaceId))) {
        targetWorkspaceIds = [workspaceId];
      } else {
        // Requested workspace is not accessible by the user
        return res.status(403).json({
          success: false,
          message: "You do not have access to the requested workspace scope.",
        });
      }
    }

    const results = {};
    let totalCount = 0;

    // Helper searches
    const searchWorkspaces = async (searchLimit, searchSkip) => {
      const filter = {
        _id: { $in: myWorkspaceIds }, // Workspace search is always across all accessible workspaces unless sub-scoped
        $or: [
          { name: { $regex: searchQuery, $options: "i" } },
          { description: { $regex: searchQuery, $options: "i" } },
        ],
      };
      if (workspaceId) {
        filter._id = workspaceId;
      }
      const items = await Workspace.find(filter)
        .populate("owner", "username email avatar profile.nickname")
        .limit(searchLimit)
        .skip(searchSkip);
      const total = await Workspace.countDocuments(filter);
      return { items, total };
    };

    const searchTasks = async (searchLimit, searchSkip) => {
      const filter = {
        workspace: { $in: targetWorkspaceIds },
        $or: [
          { title: { $regex: searchQuery, $options: "i" } },
          { description: { $regex: searchQuery, $options: "i" } },
          { labels: { $regex: searchQuery, $options: "i" } },
        ],
      };
      const items = await Task.find(filter)
        .populate("assignedUser", "username email avatar profile.nickname")
        .populate("workspace", "name")
        .limit(searchLimit)
        .skip(searchSkip);
      const total = await Task.countDocuments(filter);
      return { items, total };
    };

    const searchMessages = async (searchLimit, searchSkip) => {
      const filter = {
        workspace: { $in: targetWorkspaceIds },
        text: { $regex: searchQuery, $options: "i" },
      };
      const items = await Message.find(filter)
        .populate("sender", "username email avatar profile.nickname")
        .populate("workspace", "name")
        .sort({ createdAt: -1 })
        .limit(searchLimit)
        .skip(searchSkip);
      const total = await Message.countDocuments(filter);
      return { items, total };
    };

    const searchUsers = async (searchLimit, searchSkip) => {
      const filter = {
        $or: [
          { username: { $regex: searchQuery, $options: "i" } },
          { email: { $regex: searchQuery, $options: "i" } },
          { "profile.nickname": { $regex: searchQuery, $options: "i" } },
        ],
      };
      const items = await User.find(filter)
        .select("username email avatar profile.nickname bio")
        .limit(searchLimit)
        .skip(searchSkip);
      const total = await User.countDocuments(filter);
      return { items, total };
    };

    // 2. Perform searches based on request type
    if (type === "workspaces") {
      const { items, total } = await searchWorkspaces(limit, skip);
      results.workspaces = items;
      totalCount = total;
    } 
    else if (type === "tasks") {
      const { items, total } = await searchTasks(limit, skip);
      results.tasks = items;
      totalCount = total;
    } 
    else if (type === "messages") {
      const { items, total } = await searchMessages(limit, skip);
      results.messages = items;
      totalCount = total;
    } 
    else if (type === "users") {
      const { items, total } = await searchUsers(limit, skip);
      results.users = items;
      totalCount = total;
    } 
    else {
      // type === "all" -> fetch top 5 of each category synchronously (no paginated skip)
      const [wsRes, taskRes, msgRes, userRes] = await Promise.all([
        searchWorkspaces(5, 0),
        searchTasks(5, 0),
        searchMessages(5, 0),
        searchUsers(5, 0),
      ]);

      results.workspaces = wsRes.items;
      results.tasks = taskRes.items;
      results.messages = msgRes.items;
      results.users = userRes.items;
      
      totalCount = wsRes.total + taskRes.total + msgRes.total + userRes.total;
    }

    res.status(200).json({
      success: true,
      results,
      pagination: {
        page,
        limit,
        total: totalCount,
        hasMore: type !== "all" && page * limit < totalCount,
      },
    });
  } catch (error) {
    console.error("❌ Global search error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during global search execution.",
    });
  }
};
