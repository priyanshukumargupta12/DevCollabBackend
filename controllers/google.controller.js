const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Helper: Generate JWT and build safe user response.
 */
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

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

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/google
// @desc    Verify Google ID token → find or create user → return JWT
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Google credential token is required.",
      });
    }

    // 1. Verify the Google ID token with Google's servers
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid Google token. Please try again.",
      });
    }

    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Could not retrieve email from Google account.",
      });
    }

    // 2. Find existing user by googleId or email
    let user = await User.findOne({
      $or: [{ googleId }, { email: email.toLowerCase() }],
    });

    if (user) {
      // 3a. Existing user — link Google if not already linked
      if (!user.googleId) {
        user.googleId = googleId;
        if (!user.authMethods.includes("google")) user.authMethods.push("google");
        if (picture && !user.avatar) user.avatar = picture;
        user.isVerified = true;
        await user.save();
      }
    } else {
      // 3b. New user — auto-create account from Google profile
      // Generate a unique username from Google name
      const baseUsername = name
        ? name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 20)
        : email.split("@")[0].replace(/[^a-z0-9_]/g, "").slice(0, 20);

      // Ensure username uniqueness by appending random suffix if needed
      let username = baseUsername;
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        username = `${baseUsername}_${Math.floor(1000 + Math.random() * 9000)}`;
      }

      user = await User.create({
        username,
        email: email.toLowerCase(),
        googleId,
        avatar: picture || "",
        authMethods: ["google"],
        isVerified: true,
        // password is intentionally omitted — Google users have no local password
      });
    }

    // 4. Generate JWT and return response
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: buildUserResponse(user),
    });
  } catch (error) {
    console.error("Google auth error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during Google authentication.",
    });
  }
};

module.exports = { googleAuth };
