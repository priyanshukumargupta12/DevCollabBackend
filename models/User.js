const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const experienceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  location: String,
  startDate: { type: Date, required: true },
  endDate: Date,
  current: { type: Boolean, default: false },
  description: String,
});

const educationSchema = new mongoose.Schema({
  school: { type: String, required: true },
  degree: { type: String, required: true },
  fieldOfStudy: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: Date,
  current: { type: Boolean, default: false },
  description: String,
});

/**
 * User Schema
 * Supports multiple auth methods: local (password), Google OAuth, Email OTP, Phone OTP.
 */
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
    },

    // ── Identifiers ────────────────────────────────────────────────────
    email: {
      type: String,
      unique: true,
      sparse: true, // Allows null for Google-only users without email
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },

    // ── Auth credentials ───────────────────────────────────────────────
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // Never return password in queries by default
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true, // Only set for Google OAuth users
    },

    // ── Auth method tracking ───────────────────────────────────────────
    authMethods: {
      type: [String],
      enum: ["local", "google", "email_otp"],
      default: ["local"],
    },
    isVerified: {
      type: Boolean,
      default: false, // Email/phone verified flag
    },

    // ── Profile fields ─────────────────────────────────────────────────
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    avatar: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      maxlength: [200, "Bio cannot exceed 200 characters"],
      default: "",
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    profile: {
      nickname: { type: String, default: "" },
      title: { type: String, default: "" },
      skills: { type: [String], default: [] },
      githubUrl: { type: String, default: "" },
      linkedinUrl: { type: String, default: "" },
      experience: [experienceSchema],
      education: [educationSchema],
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },
    githubUsername: {
      type: String,
    },
    githubAccessToken: {
      type: String,
      select: false,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
  }
);

/**
 * Pre-save hook: Hash password before saving if it has been modified.
 * Skipped when password is not set (Google/OTP users).
 */
userSchema.pre("save", async function () {
  if (!this.password || !this.isModified("password")) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Instance method: Compare a plain-text password with the stored hash.
 * @param {string} candidatePassword - The plain-text password to verify
 * @returns {Promise<boolean>} True if passwords match
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Generate and hash password reset token
 */
userSchema.methods.getResetPasswordToken = function () {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set expire (1 hour)
  this.resetPasswordExpire = Date.now() + 60 * 60 * 1000;

  return resetToken;
};

userSchema.index({ username: "text", "profile.nickname": "text", email: "text" });

const User = mongoose.model("User", userSchema);

module.exports = User;
