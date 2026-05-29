const express = require("express");
const router = express.Router();

const {
  connectGithub,
  disconnectGithub,
  getGithubProfile,
  getGithubRepos,
  searchGithubRepos,
  getGithubContributions,
} = require("../controllers/github.controller");

const { protect } = require("../middleware/auth.middleware");

// Enforce auth check across all GitHub routes
router.use(protect);

router.get("/config", (req, res) => {
  res.json({ clientId: process.env.GITHUB_CLIENT_ID || "" });
});

router.post("/connect", connectGithub);
router.delete("/disconnect", disconnectGithub);
router.get("/profile", getGithubProfile);
router.get("/repos", getGithubRepos);
router.get("/repos/search", searchGithubRepos);
router.get("/contributions", getGithubContributions);

module.exports = router;
