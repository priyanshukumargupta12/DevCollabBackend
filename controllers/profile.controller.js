const User = require("../models/User");
const { uploadImage } = require("../utils/uploader");

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/users/profile/:username
// @desc    Get user profile by username
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.getProfileByUsername = async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select("-password -googleId");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("getProfileByUsername error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error fetching profile details.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/users/profile
// @desc    Update current user profile
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { 
      nickname, 
      title, 
      bio, 
      skills, 
      githubUrl, 
      linkedinUrl, 
      experience, 
      education 
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Initialize profile object if it doesn't exist
    if (!user.profile) {
      user.profile = {};
    }

    // Top level bio sync (backwards compatibility)
    if (bio !== undefined) {
      user.bio = bio.trim();
    }

    // Profile base fields
    if (nickname !== undefined) user.profile.nickname = nickname.trim();
    if (title !== undefined) user.profile.title = title.trim();
    if (githubUrl !== undefined) user.profile.githubUrl = githubUrl.trim();
    if (linkedinUrl !== undefined) user.profile.linkedinUrl = linkedinUrl.trim();

    // Process skills array
    if (skills !== undefined) {
      user.profile.skills = Array.isArray(skills)
        ? skills
        : typeof skills === "string"
        ? skills.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
        : [];
    }

    // Process & Validate Experience Timeline
    if (experience !== undefined) {
      if (!Array.isArray(experience)) {
        return res.status(400).json({
          success: false,
          message: "Experience must be an array.",
        });
      }

      // Basic validation check
      for (const item of experience) {
        if (!item.title || !item.title.trim()) {
          return res.status(400).json({ success: false, message: "Experience title is required" });
        }
        if (!item.company || !item.company.trim()) {
          return res.status(400).json({ success: false, message: "Experience company is required" });
        }
        if (!item.startDate) {
          return res.status(400).json({ success: false, message: "Experience start date is required" });
        }
      }
      user.profile.experience = experience;
    }

    // Process & Validate Education Timeline
    if (education !== undefined) {
      if (!Array.isArray(education)) {
        return res.status(400).json({
          success: false,
          message: "Education must be an array.",
        });
      }

      // Basic validation check
      for (const item of education) {
        if (!item.school || !item.school.trim()) {
          return res.status(400).json({ success: false, message: "Education school is required" });
        }
        if (!item.degree || !item.degree.trim()) {
          return res.status(400).json({ success: false, message: "Education degree is required" });
        }
        if (!item.fieldOfStudy || !item.fieldOfStudy.trim()) {
          return res.status(400).json({ success: false, message: "Education field of study is required" });
        }
        if (!item.startDate) {
          return res.status(400).json({ success: false, message: "Education start date is required" });
        }
      }
      user.profile.education = education;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully! 🎉",
      user,
    });
  } catch (error) {
    console.error("updateProfile error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error updating profile details.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/users/profile/avatar
// @desc    Upload user avatar to Cloudinary / Local storage
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select an image file to upload.",
      });
    }

    // Upload using uploader helper
    const imageUrl = await uploadImage(req.file);

    // Save to User
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    user.avatar = imageUrl;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile photo updated successfully! 📸",
      avatar: imageUrl,
      user,
    });
  } catch (error) {
    console.error("uploadAvatar error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error uploading profile photo.",
    });
  }
};
