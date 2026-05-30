require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const path = require("path");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth.routes");
const workspaceRoutes = require("./routes/workspace.routes");
const notificationRoutes = require("./routes/notification.routes");
const profileRoutes = require("./routes/profile.routes");
const searchRoutes = require("./routes/search.routes");
const githubRoutes = require("./routes/github.routes");

// ─── Initialize Express ───────────────────────
const app = express();
const PORT = process.env.PORT || 5000;

// ─── Connect to Database ─────────────────────
connectDB();

// ─── Security Middleware ─────────────────────
// Set various HTTP security headers (allowing cross-origin resource sharing for static assets)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: false,  // Disabled — required for Google OAuth popup postMessage
}));

// Rate limiting: max 100 requests per 15 minutes per IP (increased in dev)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "development" ? 10000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes.",
  },
});
app.use("/api", limiter);

// ─── CORS ─────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5000",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.some(allowed => origin === allowed) ||
        origin.endsWith(".vercel.app") ||
        /^https?:\/\/localhost:\d+$/.test(origin);

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── Body Parsers ─────────────────────────────
app.use(express.json({ limit: "10kb" }));          // Parse JSON bodies
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies
app.use(cookieParser());                            // Parse cookies

// ─── Logging ─────────────────────────────────
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ─── Serve static uploads local fallback ──────
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// ─── API Routes ──────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", profileRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/github", githubRoutes);

// ─── Health Check ─────────────────────────────
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Developer Collaboration Platform API is running 🚀",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─── Root Endpoint ────────────────────────────
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Developer Collaboration Platform API is running 🚀",
    docs: "/api/health",
  });
});

// ─── 404 Handler ─────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found.`,
  });
});

// ─── Global Error Handler ─────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// ─── Start Server ─────────────────────────────
const initSocket = require("./socket");
const { startReminderScheduler } = require("./utils/reminderScheduler");

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

initSocket(server);

// Start background scheduler for event reminders
startReminderScheduler();

module.exports = app;
