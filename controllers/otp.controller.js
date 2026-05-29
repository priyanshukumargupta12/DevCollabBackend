const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OTP = require("../models/OTP");
const { sendOTPEmail } = require("../utils/sendEmail");

/**
 * Generate JWT token.
 */
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

/**
 * Build a safe user response object (no password).
 */
const buildUserResponse = (user) => ({
  _id: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
  bio: user.bio,
  authMethods: user.authMethods,
  isVerified: user.isVerified,
  createdAt: user.createdAt,
});

// ─── RATE LIMIT GUARD ─────────────────────────────────────────────────────────
// Prevent OTP spamming: only allow a new OTP request every 60 seconds.
// Only registers the timestamp AFTER a successful send (failed attempts don't consume the slot).
const recentRequests = new Map();

/** Check if a new OTP can be requested (does NOT register yet). */
const checkOTPRateLimit = (identifier) => {
  const lastRequest = recentRequests.get(identifier);
  const now = Date.now();
  if (lastRequest && now - lastRequest < 60 * 1000) {
    const secondsLeft = Math.ceil((60 * 1000 - (now - lastRequest)) / 1000);
    return { allowed: false, secondsLeft };
  }
  return { allowed: true };
};

/** Register a successful OTP send (call AFTER email is sent). */
const registerOTPRequest = (identifier) => {
  recentRequests.set(identifier, Date.now());
  // Clean up old entries after 1 hour to prevent memory leak
  setTimeout(() => recentRequests.delete(identifier), 60 * 60 * 1000);
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/otp/email/send
// @desc    Generate and send a 6-digit OTP to the given email address
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const sendEmailOTP = async (req, res) => {
  try {
    const { email } = req.body;

    // 1. Validate email format
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 2. Rate limit: max one OTP request per 60 seconds
    const { allowed, secondsLeft } = checkOTPRateLimit(normalizedEmail);
    if (!allowed) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${secondsLeft} seconds before requesting another OTP.`,
      });
    }

    // 3. Generate, hash, and store OTP in MongoDB (auto-expires in 10 min)
    const rawOTP = await OTP.createOTP(normalizedEmail, "email");

    // 4. Send the OTP via Gmail SMTP
    await sendOTPEmail(normalizedEmail, rawOTP);

    // 5. Only register rate-limit AFTER successful send
    registerOTPRequest(normalizedEmail);

    res.status(200).json({
      success: true,
      message: `Verification code sent to ${normalizedEmail}`,
    });
  } catch (error) {
    console.error("sendEmailOTP error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP email. Please check your email address and try again.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/otp/email/verify
// @desc    Verify email OTP → find or create user → return JWT
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const verifyEmailOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Verify the OTP (checks expiry, isUsed flag, and bcrypt compare)
    const result = await OTP.verifyOTP(normalizedEmail, otp.trim(), "email");
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.message });
    }

    // 2. Find or auto-create user
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      // New user — derive a username from the email local-part
      const baseUsername = normalizedEmail
        .split("@")[0]
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 20);
      let username = baseUsername;
      const existing = await User.findOne({ username });
      if (existing) username = `${baseUsername}_${Math.floor(1000 + Math.random() * 9000)}`;

      user = await User.create({
        username,
        email: normalizedEmail,
        authMethods: ["email_otp"],
        isVerified: true,
      });
    } else {
      // Existing user — mark verified, add auth method if missing
      user.isVerified = true;
      if (!user.authMethods.includes("email_otp")) user.authMethods.push("email_otp");
      await user.save();
    }

    // 3. Issue JWT
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: buildUserResponse(user),
    });
  } catch (error) {
    console.error("verifyEmailOTP error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during OTP verification.",
    });
  }
};

module.exports = { sendEmailOTP, verifyEmailOTP };
