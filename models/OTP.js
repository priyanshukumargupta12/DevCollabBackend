const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * OTP Schema
 * Stores hashed one-time passwords for email and phone verification.
 * MongoDB TTL index auto-deletes documents after expiresAt.
 */
const otpSchema = new mongoose.Schema({
  identifier: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  otp: {
    type: String,
    required: true, // Stored as bcrypt hash
  },
  type: {
    type: String,
    enum: ["email", "phone"],
    required: true,
  },
  isUsed: {
    type: Boolean,
    default: false,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    index: { expires: 0 }, // TTL index — Mongo auto-deletes when expiresAt passes
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/**
 * Static method: Generate, hash, and save a new OTP.
 * Deletes any previous unused OTP for the same identifier+type.
 * @param {string} identifier - email or phone
 * @param {'email'|'phone'} type
 * @returns {{ rawOTP: string }} The plain-text OTP to send to the user
 */
otpSchema.statics.createOTP = async function (identifier, type) {
  // 1. Remove any existing unused OTP for this identifier
  await this.deleteMany({ identifier: identifier.toLowerCase(), type, isUsed: false });

  // 2. Generate a cryptographically random 6-digit OTP
  const rawOTP = String(Math.floor(100000 + Math.random() * 900000));

  // 3. Hash the OTP before storing
  const salt = await bcrypt.genSalt(10);
  const hashedOTP = await bcrypt.hash(rawOTP, salt);

  // 4. Save to DB
  await this.create({
    identifier: identifier.toLowerCase(),
    otp: hashedOTP,
    type,
  });

  return rawOTP;
};

/**
 * Static method: Verify an OTP.
 * @param {string} identifier - email or phone
 * @param {string} rawOTP - The plain-text OTP provided by user
 * @param {'email'|'phone'} type
 * @returns {{ valid: boolean, message?: string }}
 */
otpSchema.statics.verifyOTP = async function (identifier, rawOTP, type) {
  const record = await this.findOne({
    identifier: identifier.toLowerCase(),
    type,
    isUsed: false,
  }).sort({ createdAt: -1 }); // Get most recent

  if (!record) {
    return { valid: false, message: "OTP not found or already used. Please request a new one." };
  }

  if (record.expiresAt < new Date()) {
    return { valid: false, message: "OTP has expired. Please request a new one." };
  }

  const isMatch = await bcrypt.compare(rawOTP, record.otp);
  if (!isMatch) {
    return { valid: false, message: "Invalid OTP. Please try again." };
  }

  // Mark OTP as used (single-use)
  record.isUsed = true;
  await record.save();

  return { valid: true };
};

const OTP = mongoose.model("OTP", otpSchema);

module.exports = OTP;
