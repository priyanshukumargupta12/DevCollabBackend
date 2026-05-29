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
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
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
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
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
