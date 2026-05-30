const { Server } = require("socket.io");
const Message = require("./models/Message");
const Workspace = require("./models/Workspace");

// Global presence state mapping: userId -> Set(socketId)
const onlineUsers = new Map();
// Reverse lookup mapping: socketId -> userId
const socketToUser = new Map();
// Global socket.io instance
let ioInstance = null;

// Global mapping of active meeting participants: roomId -> Map(socketId -> userInfo)
const activeMeetings = new Map();

// ─── Collaborative Code Editor State ─────────────────────────────────────────
// editorRooms: fileId -> Map(socketId -> { userId, username, avatar, color, cursor })
const editorRooms = new Map();
// Last known content per file for new joiners: fileId -> { content, language, updatedAt }
const fileContentCache = new Map();
// Predefined distinct colors assigned to collaborators
const COLLABORATOR_COLORS = [
  "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6",
  "#06b6d4", "#ef4444", "#84cc16", "#f97316", "#14b8a6",
];

/**
 * Pick a color for a collaborator that's not already taken in the room.
 * @param {Map} roomUsers
 * @returns {string} hex color
 */
const pickCollaboratorColor = (roomUsers) => {
  const usedColors = new Set([...roomUsers.values()].map((u) => u.color));
  const available = COLLABORATOR_COLORS.filter((c) => !usedColors.has(c));
  return available.length > 0
    ? available[0]
    : COLLABORATOR_COLORS[roomUsers.size % COLLABORATOR_COLORS.length];
};

/**
 * Initialize Socket.io server
 * Handles real-time discussion rooms, online status, and typing indicators.
 */
const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: function (origin, callback) {
        // Allow requests with no origin (mobile/curl)
        if (!origin) return callback(null, true);
        const allowed =
          !origin ||
          origin === (process.env.CLIENT_URL || "http://localhost:5173") ||
          origin.endsWith(".vercel.app") ||
          /^https?:\/\/localhost:\d+$/.test(origin);
        if (allowed) callback(null, true);
        else callback(new Error("Socket.io CORS: origin not allowed"));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Allow both WebSocket and long-polling (required for Vercel)
    transports: ["polling", "websocket"],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  ioInstance = io;

  io.on("connection", (socket) => {
    console.log(`🔌 Client connected to Socket.io: ${socket.id}`);

    // ─── USER PRESENCE ON CONNECTION ─────────────────────────────────────────
    socket.on("join_user", (userId) => {
      if (!userId) return;
      socketToUser.set(socket.id, userId);

      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId).add(socket.id);

      console.log(`👤 User joined online presence: ${userId} (Socket: ${socket.id})`);
      // Broadcast globally updated list of online user IDs
      io.emit("online_users", Array.from(onlineUsers.keys()));
    });

    // ─── JOIN WORKSPACE DISCUSSION ROOM ──────────────────────────────────────
    socket.on("join_workspace", async ({ workspaceId, userId }) => {
      if (!workspaceId || !userId) return;

      // Access Check: Verify that the user is actually a member of the workspace
      try {
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) {
          socket.emit("error_message", { message: "Workspace not found." });
          return;
        }

        const isOwner = workspace.owner.toString() === userId.toString();
        const isMember = workspace.members.some(
          (m) => m.user.toString() === userId.toString()
        );

        if (!isOwner && !isMember) {
          socket.emit("error_message", { message: "Access denied. You are not a member." });
          return;
        }

        // Add client socket to the workspace room
        socket.join(workspaceId);
        console.log(`💬 User ${userId} joined chat room: ${workspaceId}`);

        // Fetch recent messages history (limit to last 50)
        const messages = await Message.find({ workspace: workspaceId })
          .populate("sender", "username email avatar profile.nickname")
          .sort({ createdAt: -1 })
          .limit(50);

        // Send history back to joining client (reverse to restore chronological order)
        socket.emit("workspace_history", messages.reverse());
      } catch (err) {
        console.error("join_workspace error:", err.message);
        socket.emit("error_message", { message: "Failed to join workspace discussion." });
      }
    });

    // ─── SEND MESSAGE TO WORKSPACE DISCUSSION ─────────────────────────────────
    socket.on("send_message", async ({ workspaceId, senderId, text }) => {
      if (!workspaceId || !senderId || !text || !text.trim()) return;

      try {
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) return;

        // Create and save message
        const message = await Message.create({
          workspace: workspaceId,
          sender: senderId,
          text: text.trim(),
        });

        // Populate sender info for the frontend
        const populated = await message.populate("sender", "username email avatar profile.nickname");

        // Broadcast to all sockets in the workspace room
        io.to(workspaceId).emit("receive_message", populated);

        // ─── PARSE MENTIONS ──────────────────────────────────────────────────
        const mentionRegex = /@(\w+)/g;
        const mentionedUsernames = [];
        let match;
        while ((match = mentionRegex.exec(text)) !== null) {
          const username = match[1];
          if (!mentionedUsernames.includes(username)) {
            mentionedUsernames.push(username);
          }
        }

        if (mentionedUsernames.length > 0) {
          const User = require("./models/User");
          const { createNotification } = require("./utils/notificationHelper");

          for (const username of mentionedUsernames) {
            // Don't notify self-mentions
            if (populated.sender.username === username) continue;

            const user = await User.findOne({ username });
            if (!user) continue;

            // Check if user is member/owner of workspace
            const isWorkspaceOwner = workspace.owner.toString() === user._id.toString();
            const isWorkspaceMember = workspace.members.some(
              (m) => (m.user._id || m.user).toString() === user._id.toString()
            );

            if (isWorkspaceOwner || isWorkspaceMember) {
              await createNotification({
                recipient: user._id,
                sender: senderId,
                type: "mention",
                title: "New Mention",
                message: `${populated.sender.username} mentioned you in the chat room of "${workspace.name}": "${text.trim()}"`,
                workspace: workspaceId,
                relatedId: message._id,
              });
            }
          }
        }
      } catch (err) {
        console.error("send_message error:", err.message);
        socket.emit("error_message", { message: "Failed to send message." });
      }
    });

    // ─── TYPING INDICATOR EVENT ──────────────────────────────────────────────
    socket.on("typing", ({ workspaceId, userId, username, isTyping }) => {
      if (!workspaceId || !userId) return;

      // Broadcast typing indicator to all members in the workspace room except sender
      socket.to(workspaceId).emit("user_typing", {
        userId,
        username,
        isTyping,
      });
    });

    // ─── WebRTC VIDEO MEETINGS SIGNALING ─────────────────────────────────────
    socket.on("join_meeting", ({ roomId, userId, username, avatar, audio, video }) => {
      if (!roomId || !userId) return;

      const isNewMeeting = !activeMeetings.has(roomId) || activeMeetings.get(roomId).size === 0;

      socket.join(roomId);

      if (!activeMeetings.has(roomId)) {
        activeMeetings.set(roomId, new Map());
      }

      const roomUsers = activeMeetings.get(roomId);

      const userInfo = {
        socketId: socket.id,
        userId,
        username,
        avatar,
        audio: audio ?? true,
        video: video ?? true,
        screen: false
      };

      roomUsers.set(socket.id, userInfo);
      console.log(`📹 User ${username} (${socket.id}) joined meeting room: ${roomId}`);

      if (isNewMeeting) {
        Workspace.findById(roomId)
          .then(async (workspace) => {
            if (!workspace) return;
            const { createNotification } = require("./utils/notificationHelper");

            const recipients = new Set();
            if (workspace.owner.toString() !== userId.toString()) {
              recipients.add(workspace.owner.toString());
            }
            workspace.members.forEach(member => {
              const mId = member.user.toString();
              if (mId !== userId.toString()) {
                recipients.add(mId);
              }
            });

            for (const recipientId of recipients) {
              await createNotification({
                recipient: recipientId,
                sender: userId,
                type: "meeting",
                title: "Video Meeting Started",
                message: `${username} started a video call in "${workspace.name}". Click here to join!`,
                workspace: roomId,
                relatedId: roomId
              });
            }
          })
          .catch(err => {
            console.error("❌ Error sending video call notifications:", err);
          });
      }

      // Gather other users in this meeting
      const otherUsers = [];
      roomUsers.forEach((user, sId) => {
        if (sId !== socket.id) {
          otherUsers.push(user);
        }
      });

      // Send current participants list to joining client
      socket.emit("meeting_users", otherUsers);

      // Notify others in room
      socket.to(roomId).emit("peer_joined", userInfo);
    });

    socket.on("send_offer", ({ targetSocketId, sdp }) => {
      io.to(targetSocketId).emit("receive_offer", {
        senderSocketId: socket.id,
        sdp
      });
    });

    socket.on("send_answer", ({ targetSocketId, sdp }) => {
      io.to(targetSocketId).emit("receive_answer", {
        senderSocketId: socket.id,
        sdp
      });
    });

    socket.on("send_ice_candidate", ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit("receive_ice_candidate", {
        senderSocketId: socket.id,
        candidate
      });
    });

    socket.on("leave_meeting", ({ roomId }) => {
      if (!roomId) return;

      socket.leave(roomId);

      if (activeMeetings.has(roomId)) {
        const roomUsers = activeMeetings.get(roomId);
        if (roomUsers.has(socket.id)) {
          const userInfo = roomUsers.get(socket.id);
          roomUsers.delete(socket.id);
          console.log(`📹 User ${userInfo.username} left meeting room: ${roomId}`);

          if (roomUsers.size === 0) {
            activeMeetings.delete(roomId);
          }
        }
      }

      // Notify others in meeting
      socket.to(roomId).emit("peer_left", { socketId: socket.id });
    });

    socket.on("status_change", ({ roomId, audio, video, screen }) => {
      if (!roomId) return;

      if (activeMeetings.has(roomId)) {
        const roomUsers = activeMeetings.get(roomId);
        if (roomUsers.has(socket.id)) {
          const userInfo = roomUsers.get(socket.id);
          if (audio !== undefined) userInfo.audio = audio;
          if (video !== undefined) userInfo.video = video;
          if (screen !== undefined) userInfo.screen = screen;
        }
      }

      // Notify other peers of state change
      socket.to(roomId).emit("peer_status_changed", {
        socketId: socket.id,
        audio,
        video,
        screen
      });
    });

    // ─── COLLABORATIVE CODE EDITOR ──────────────────────────────────────────────

    /**
     * Join a collaborative code editor room for a specific file.
     * Room key: `editor:${fileId}` to prevent collisions with chat rooms.
     */
    socket.on("join_code_editor", async ({ fileId, workspaceId, userId, username, avatar }) => {
      if (!fileId || !workspaceId || !userId) return;

      try {
        // Verify workspace membership
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) {
          socket.emit("error_message", { message: "Workspace not found." });
          return;
        }

        const isOwnerUser = workspace.owner.toString() === userId.toString();
        const isMemberUser = workspace.members.some(
          (m) => m.user.toString() === userId.toString()
        );

        if (!isOwnerUser && !isMemberUser) {
          socket.emit("error_message", { message: "Access denied to code editor." });
          return;
        }

        const roomKey = `editor:${fileId}`;
        socket.join(roomKey);

        // Initialize room map if first joiner
        if (!editorRooms.has(fileId)) {
          editorRooms.set(fileId, new Map());
        }

        const roomUsers = editorRooms.get(fileId);
        const color = pickCollaboratorColor(roomUsers);

        const userInfo = {
          socketId: socket.id,
          userId,
          username,
          avatar: avatar || "",
          color,
          cursor: null, // Will be updated by cursor_change events
          fileId,
        };

        roomUsers.set(socket.id, userInfo);
        console.log(`✏️ User ${username} joined editor room: ${fileId}`);

        // Send current file content cache to new joiner (so they don't need a REST call)
        if (fileContentCache.has(fileId)) {
          socket.emit("editor_init", fileContentCache.get(fileId));
        }

        // Send current presence list (all active editors) to the new joiner
        const activeEditors = [...roomUsers.values()].filter((u) => u.socketId !== socket.id);
        socket.emit("editor_presence", activeEditors);

        // Notify existing editors that someone joined
        socket.to(roomKey).emit("user_joined_editor", userInfo);

      } catch (err) {
        console.error("join_code_editor error:", err.message);
        socket.emit("error_message", { message: "Failed to join editor room." });
      }
    });

    /**
     * Leave a collaborative editor room explicitly.
     */
    socket.on("leave_code_editor", ({ fileId }) => {
      if (!fileId) return;

      const roomKey = `editor:${fileId}`;
      socket.leave(roomKey);

      if (editorRooms.has(fileId)) {
        const roomUsers = editorRooms.get(fileId);
        const userInfo = roomUsers.get(socket.id);
        roomUsers.delete(socket.id);

        if (userInfo) {
          socket.to(roomKey).emit("user_left_editor", { socketId: socket.id, userId: userInfo.userId });
          console.log(`✏️ User ${userInfo.username} left editor room: ${fileId}`);
        }

        if (roomUsers.size === 0) {
          editorRooms.delete(fileId);
        }
      }
    });

    /**
     * Broadcast code changes to all other editors in the file's room.
     * Uses Last-Writer-Wins with full document sync (simple, reliable).
     */
    socket.on("code_change", ({ fileId, content, language }) => {
      if (!fileId || content === undefined) return;

      const roomKey = `editor:${fileId}`;

      // Update in-memory content cache for new joiners
      fileContentCache.set(fileId, {
        content,
        language,
        updatedAt: Date.now(),
      });

      // Broadcast to all OTHER editors in the room (not sender)
      socket.to(roomKey).emit("code_change", {
        fileId,
        content,
        language,
        senderSocketId: socket.id,
      });
    });

    /**
     * Broadcast cursor/selection position of a collaborator.
     */
    socket.on("cursor_change", ({ fileId, cursor, selection }) => {
      if (!fileId) return;

      const roomKey = `editor:${fileId}`;

      // Update stored cursor position
      if (editorRooms.has(fileId)) {
        const roomUsers = editorRooms.get(fileId);
        if (roomUsers.has(socket.id)) {
          const userInfo = roomUsers.get(socket.id);
          userInfo.cursor = cursor;
          userInfo.selection = selection;
        }
      }

      // Broadcast cursor to other editors
      socket.to(roomKey).emit("cursor_change", {
        socketId: socket.id,
        cursor,
        selection,
      });
    });

    /**
     * Notify all editors that the file was saved (auto-save or manual).
     */
    socket.on("code_saved", ({ fileId, savedBy, version }) => {
      if (!fileId) return;

      const roomKey = `editor:${fileId}`;
      io.to(roomKey).emit("code_saved", { fileId, savedBy, version, savedAt: new Date().toISOString() });
    });

    /**
     * Request code execution from the server.
     * Executes via the codeExecutor utility and emits the result back.
     */
    socket.on("run_code_request", async ({ fileId, code, language, requestId }) => {
      if (!code || !language) {
        socket.emit("run_code_result", {
          requestId,
          fileId,
          error: "No code or language provided.",
          output: "",
          exitCode: 1,
        });
        return;
      }

      try {
        const { executeCode } = require("./utils/codeExecutor");
        const startTime = Date.now();
        const result = await executeCode(code, language);
        const executionTime = Date.now() - startTime;

        socket.emit("run_code_result", {
          requestId,
          fileId,
          ...result,
          executionTime,
        });
      } catch (err) {
        socket.emit("run_code_result", {
          requestId,
          fileId,
          error: err.message,
          output: "",
          exitCode: 1,
        });
      }
    });

    // ─── DISCONNECT ──────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`🔌 Client disconnected from Socket.io: ${socket.id}`);
      const userId = socketToUser.get(socket.id);
      socketToUser.delete(socket.id);

      if (userId && onlineUsers.has(userId)) {
        const userSockets = onlineUsers.get(userId);
        userSockets.delete(socket.id);
        
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
        }

        // Broadcast updated presence list
        io.emit("online_users", Array.from(onlineUsers.keys()));
      }

      // Clean up active meeting participants on disconnection
      activeMeetings.forEach((roomUsers, roomId) => {
        if (roomUsers.has(socket.id)) {
          const userInfo = roomUsers.get(socket.id);
          roomUsers.delete(socket.id);
          console.log(`📹 Disconnected User ${userInfo.username} removed from meeting room: ${roomId}`);

          socket.to(roomId).emit("peer_left", { socketId: socket.id });

          if (roomUsers.size === 0) {
            activeMeetings.delete(roomId);
          }
        }
      });

      // Clean up collaborative editor rooms on disconnection
      editorRooms.forEach((roomUsers, fileId) => {
        if (roomUsers.has(socket.id)) {
          const userInfo = roomUsers.get(socket.id);
          roomUsers.delete(socket.id);
          console.log(`✏️ Disconnected user ${userInfo?.username} removed from editor room: ${fileId}`);

          const roomKey = `editor:${fileId}`;
          socket.to(roomKey).emit("user_left_editor", {
            socketId: socket.id,
            userId: userInfo?.userId,
          });

          if (roomUsers.size === 0) {
            editorRooms.delete(fileId);
            // Keep content cache briefly — cleared on next join if stale
          }
        }
      });
    });
  });

  return io;
};

/**
 * Sends a real-time notification to a specific user if they are online.
 */
const sendNotificationToUser = (userId, notification) => {
  if (!ioInstance) return;
  const userStr = userId.toString();
  if (onlineUsers.has(userStr)) {
    const socketIds = onlineUsers.get(userStr);
    socketIds.forEach((socketId) => {
      ioInstance.to(socketId).emit("notification_received", notification);
    });
  }
};

module.exports = initSocket;
module.exports.sendNotificationToUser = sendNotificationToUser;

