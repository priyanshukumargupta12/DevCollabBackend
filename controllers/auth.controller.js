const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("../utils/sendEmail");

/**
 * Generate a signed JWT token for a given user ID.
 * @param {string} id - The MongoDB user _id
 * @returns {string} Signed JWT token
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

/**
 * Helper: Send token response with user data.
 * @param {Object} user - Mongoose user document
 * @param {number} statusCode - HTTP status code
 * @param {Object} res - Express response object
 */
const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user._id);

  // Build a safe user object (no password)
  const userResponse = {
    _id: user._id,
    username: user.username,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    bio: user.bio,
    createdAt: user.createdAt,
  };

  res.status(statusCode).json({
    success: true,
    token,
    user: userResponse,
  });
};

// ─────────────────────────────────────────────
// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
// ─────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 1. Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide username, email, and password.",
      });
    }

    // 2. Check password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    // 3. Check for existing user (email or username)
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    });

    if (existingUser) {
      const field = existingUser.email === email.toLowerCase() ? "Email" : "Username";
      return res.status(409).json({
        success: false,
        message: `${field} is already registered.`,
      });
    }

    // 4. Create user (password is hashed via pre-save hook in User model)
    const user = await User.create({ username, email, password });

    // Send welcome email (async background task)
    if (user.email) {
      sendWelcomeEmail(user.email, user.username).catch((err) => {
        console.error("❌ Welcome email failed to send:", err.message);
      });
    }

    // 5. Return token + user data
    sendTokenResponse(user, 201, res);
  } catch (error) {
    console.error("Register error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during registration. Please try again.",
    });
  }
};

// ─────────────────────────────────────────────
// @route   POST /api/auth/login
// @desc    Authenticate user & return token
// @access  Public
// ─────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password.",
      });
    }

    // 2. Find user and explicitly select password (select: false by default)
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // 3. Compare passwords using the model instance method
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // 4. Return token + user data
    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during login. Please try again.",
    });
  }
};

// ─────────────────────────────────────────────
// @route   GET /api/auth/me
// @desc    Get currently authenticated user
// @access  Private (requires protect middleware)
// ─────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    // req.user is set by the protect middleware
    const user = await User.findById(req.user._id);

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        isOnline: user.isOnline,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("GetMe error:", error.message);
    res.status(500).json({
      success: false,
      message: "Could not fetch user profile.",
    });
  }
};

// ─────────────────────────────────────────────
// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
// ─────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    // For a stateless JWT approach, logout is handled client-side.
    // Here we just update isOnline status and return success.
    await User.findByIdAndUpdate(req.user._id, { isOnline: false });

    res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during logout.",
    });
  }
};

// ─────────────────────────────────────────────
// @route   POST /api/auth/forgot-password
// @desc    Generate password reset token & email reset link
// @access  Public
// ─────────────────────────────────────────────
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please provide an email address.",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No user account with that email was found.",
      });
    }

    // Generate reset token
    const resetToken = user.getResetPasswordToken();

    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const resetUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password/${resetToken}`;

    try {
      await sendPasswordResetEmail(user.email, user.username, resetUrl);

      res.status(200).json({
        success: true,
        message: "Password reset link sent to your email.",
      });
    } catch (err) {
      console.error("❌ Email send error:", err.message);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      res.status(500).json({
        success: false,
        message: "Email could not be sent. Please try again later.",
      });
    }
  } catch (error) {
    console.error("ForgotPassword error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during forgot password request.",
    });
  }
};

// ─────────────────────────────────────────────
// @route   POST /api/auth/reset-password/:token
// @desc    Verify reset token & update password
// @access  Public
// ─────────────────────────────────────────────
const resetPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    // Get hashed token
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "The password reset token is invalid or has expired.",
      });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now log in.",
    });
  } catch (error) {
    console.error("ResetPassword error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during password reset.",
    });
  }
};

module.exports = { register, login, getMe, logout, forgotPassword, resetPassword };
