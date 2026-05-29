const express = require("express");
const router = express.Router();

const { register, login, getMe, logout, forgotPassword, resetPassword } = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");
const { googleAuth } = require("../controllers/google.controller");
const { sendEmailOTP, verifyEmailOTP } = require("../controllers/otp.controller");

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTES
// ────────────────────────────────────────────────────────────────────────────

// ── Local auth ─────────────────────────────────────────────────────────────
// @route POST /api/auth/register
router.post("/register", register);

// @route POST /api/auth/login
router.post("/login", login);

// @route POST /api/auth/forgot-password
router.post("/forgot-password", forgotPassword);

// @route POST /api/auth/reset-password/:token
router.post("/reset-password/:token", resetPassword);

// ── Google OAuth ───────────────────────────────────────────────────────────
// @route POST /api/auth/google  —  Body: { credential: "<Google ID token>" }
router.post("/google", googleAuth);

// ── Email OTP ──────────────────────────────────────────────────────────────
// @route POST /api/auth/otp/email/send    —  Body: { email }
router.post("/otp/email/send", sendEmailOTP);

// @route POST /api/auth/otp/email/verify  —  Body: { email, otp }
router.post("/otp/email/verify", verifyEmailOTP);

// ────────────────────────────────────────────────────────────────────────────
// PROTECTED ROUTES
// ────────────────────────────────────────────────────────────────────────────

// @route GET  /api/auth/me
router.get("/me", protect, getMe);

// @route POST /api/auth/logout
router.post("/logout", protect, logout);

module.exports = router;
