const express = require("express");
const router = express.Router();

const {
  getProfileByUsername,
  updateProfile,
  uploadAvatar,
} = require("../controllers/profile.controller");

const { protect } = require("../middleware/auth.middleware");
const { upload } = require("../utils/uploader");

// Enforce auth check across all profile endpoints
router.use(protect);

router.route("/profile")
  .put(updateProfile);

router.route("/profile/avatar")
  .post(upload.single("avatar"), uploadAvatar);

router.route("/profile/:username")
  .get(getProfileByUsername);

module.exports = router;
