const axios = require("axios");
const User = require("../models/User");

// Helper: Make requests to GitHub API
const githubRequest = async (url, token, method = "GET", data = null) => {
  return axios({
    url,
    method,
    data,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "DeveloperCollabPlatform",
    },
  });
};

/**
 * Exchange OAuth authorization code for GitHub access token
 * @route   POST /api/github/connect
 * @access  Private
 */
exports.connectGithub = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: "Code parameter is required." });
    }

    const client_id = process.env.GITHUB_CLIENT_ID;
    const client_secret = process.env.GITHUB_CLIENT_SECRET;

    // Check if placeholders are configured
    if (!client_id || client_id.includes("placeholder") || !client_secret || client_secret.includes("placeholder")) {
      // In development placeholder mode, mock a link to a demo developer account
      // Use user-specific values to avoid unique constraint violations in MongoDB (githubId is unique)
      const demoUsername = `demo-developer-${req.user.username}`;
      const demoGithubId = `demo-${req.user._id}`;
      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
          githubId: demoGithubId,
          githubUsername: demoUsername,
          githubAccessToken: "demo-access-token",
          "profile.githubUrl": `https://github.com/${demoUsername}`,
        },
        { new: true }
      );

      return res.status(200).json({
        success: true,
        message: "GitHub connected (DEMO MODE). Ensure real OAuth keys are set in .env for production.",
        user: updatedUser,
      });
    }

    // 1. Exchange code for access token
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id,
        client_secret,
        code,
      },
      {
        headers: { Accept: "application/json" },
      }
    );

    const { access_token, error, error_description } = tokenResponse.data;
    if (error) {
      return res.status(400).json({
        success: false,
        message: error_description || "GitHub OAuth token exchange failed.",
      });
    }

    // 2. Fetch user profile from GitHub
    const profileResponse = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "User-Agent": "DeveloperCollabPlatform",
      },
    });

    const { id, login, html_url } = profileResponse.data;

    // 3. Link credentials to current User
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        githubId: String(id),
        githubUsername: login,
        githubAccessToken: access_token,
        "profile.githubUrl": html_url,
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "GitHub account linked successfully! 🎉",
      user: updatedUser,
    });
  } catch (err) {
    console.error("❌ connectGithub error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error linking GitHub account.",
    });
  }
};

/**
 * Disconnect GitHub credentials
 * @route   DELETE /api/github/disconnect
 * @access  Private
 */
exports.disconnectGithub = async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $unset: {
          githubId: "",
          githubUsername: "",
          githubAccessToken: "",
        },
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "GitHub account disconnected successfully.",
      user: updatedUser,
    });
  } catch (err) {
    console.error("❌ disconnectGithub error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error disconnecting GitHub account.",
    });
  }
};

/**
 * Fetch GitHub user details
 * @route   GET /api/github/profile
 * @access  Private
 */
exports.getGithubProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+githubAccessToken");
    if (!user || !user.githubId) {
      return res.status(400).json({ success: false, message: "GitHub is not connected." });
    }

    // Fallback Mock Profile in demo mode
    if (user.githubAccessToken === "demo-access-token") {
      return res.status(200).json({
        success: true,
        profile: {
          login: user.githubUsername,
          name: "Demo Developer",
          avatar_url: "https://github.com/identicons/demo-developer.png",
          bio: "Full Stack Engineer | React & Node enthusiast",
          public_repos: 24,
          followers: 142,
          following: 89,
          html_url: user.profile?.githubUrl,
        },
      });
    }

    const response = await githubRequest(
      "https://api.github.com/user",
      user.githubAccessToken
    );

    res.status(200).json({
      success: true,
      profile: response.data,
    });
  } catch (err) {
    console.error("❌ getGithubProfile error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch GitHub profile details.",
    });
  }
};

/**
 * Fetch list of user's GitHub repositories
 * @route   GET /api/github/repos
 * @access  Private
 */
exports.getGithubRepos = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+githubAccessToken");
    if (!user || !user.githubId) {
      return res.status(400).json({ success: false, message: "GitHub is not connected." });
    }

    // Fallback Mock Repos in demo mode
    if (user.githubAccessToken === "demo-access-token") {
      const mockRepos = [
        { id: 1, name: "mern-collab-platform", description: "Real-time workspace collaboration board with WebRTC video calling", stargazers_count: 34, language: "JavaScript", html_url: "#" },
        { id: 2, name: "react-spotlight-search", description: "Spotlight command menu component with keyboard shortcuts", stargazers_count: 12, language: "TypeScript", html_url: "#" },
        { id: 3, name: "express-audit-logger", description: "Express middleware interceptor logging database mutations", stargazers_count: 5, language: "JavaScript", html_url: "#" },
        { id: 4, name: "webrtc-mesh-signaling", description: "Peer-to-peer signaling client tunnels using Socket.io", stargazers_count: 18, language: "JavaScript", html_url: "#" },
      ];
      return res.status(200).json({ success: true, repos: mockRepos });
    }

    const response = await githubRequest(
      "https://api.github.com/user/repos?sort=updated&per_page=50",
      user.githubAccessToken
    );

    res.status(200).json({
      success: true,
      repos: response.data,
    });
  } catch (err) {
    console.error("❌ getGithubRepos error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch GitHub repositories.",
    });
  }
};

/**
 * Search user's GitHub repositories
 * @route   GET /api/github/repos/search
 * @access  Private
 */
exports.searchGithubRepos = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, message: "Query string q is required." });
    }

    const user = await User.findById(req.user._id).select("+githubAccessToken");
    if (!user || !user.githubId) {
      return res.status(400).json({ success: false, message: "GitHub is not connected." });
    }

    // Fallback Mock search in demo mode
    if (user.githubAccessToken === "demo-access-token") {
      const mockRepos = [
        { id: 1, name: "mern-collab-platform", description: "Real-time workspace collaboration board with WebRTC video calling", stargazers_count: 34, language: "JavaScript", html_url: "#" },
        { id: 2, name: "react-spotlight-search", description: "Spotlight command menu component with keyboard shortcuts", stargazers_count: 12, language: "TypeScript", html_url: "#" },
        { id: 3, name: "express-audit-logger", description: "Express middleware interceptor logging database mutations", stargazers_count: 5, language: "JavaScript", html_url: "#" },
        { id: 4, name: "webrtc-mesh-signaling", description: "Peer-to-peer signaling client tunnels using Socket.io", stargazers_count: 18, language: "JavaScript", html_url: "#" },
      ];
      const filtered = mockRepos.filter(
        (r) => r.name.toLowerCase().includes(q.toLowerCase()) || 
               (r.description && r.description.toLowerCase().includes(q.toLowerCase()))
      );
      return res.status(200).json({ success: true, repos: filtered });
    }

    const response = await githubRequest(
      `https://api.github.com/search/repositories?q=${q.trim()}+user:${user.githubUsername}`,
      user.githubAccessToken
    );

    res.status(200).json({
      success: true,
      repos: response.data.items,
    });
  } catch (err) {
    console.error("❌ searchGithubRepos error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to search GitHub repositories.",
    });
  }
};

/**
 * Fetch contribution graph metrics (GraphQL API)
 * @route   GET /api/github/contributions
 * @access  Private
 */
exports.getGithubContributions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+githubAccessToken");
    if (!user || !user.githubId) {
      return res.status(400).json({ success: false, message: "GitHub is not connected." });
    }

    // Fallback Mock contributions in demo mode or if API fails
    const generateMockContributions = () => {
      const weeks = [];
      const now = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      
      let cursor = new Date(oneYearAgo);
      // Align to Sunday
      cursor.setDate(cursor.getDate() - cursor.getDay());

      for (let w = 0; w < 53; w++) {
        const days = [];
        for (let d = 0; d < 7; d++) {
          const count = Math.random() > 0.6 ? Math.floor(Math.random() * 8) : 0;
          let color = "#161b22"; // Empty
          if (count > 0 && count <= 2) color = "#0e4429"; // Low
          else if (count > 2 && count <= 4) color = "#006d32"; // Medium
          else if (count > 4 && count <= 6) color = "#26a641"; // High
          else if (count > 6) color = "#39d353"; // Ultra

          days.push({
            contributionCount: count,
            date: new Date(cursor).toISOString().split("T")[0],
            color,
          });

          cursor.setDate(cursor.getDate() + 1);
        }
        weeks.push({ contributionDays: days });
      }

      return {
        totalContributions: weeks.reduce(
          (sum, w) => sum + w.contributionDays.reduce((s, d) => s + d.contributionCount, 0),
          0
        ),
        weeks,
      };
    };

    if (user.githubAccessToken === "demo-access-token") {
      const mockCalendar = generateMockContributions();
      return res.status(200).json({ success: true, calendar: mockCalendar });
    }

    // Execute GitHub GraphQL request
    const query = `
      query($username: String!) {
        user(login: $username) {
          contributionsCollection {
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  contributionCount
                  date
                  color
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await axios.post(
        "https://api.github.com/graphql",
        {
          query,
          variables: { username: user.githubUsername },
        },
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            "User-Agent": "DeveloperCollabPlatform",
            Accept: "application/json",
          },
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0]?.message || "GraphQL query error");
      }

      const calendar = response.data.data?.user?.contributionsCollection?.contributionCalendar;
      if (!calendar) {
        throw new Error("Calendar data is null");
      }

      res.status(200).json({
        success: true,
        calendar,
      });
    } catch (graphError) {
      console.warn("⚠️ GraphQL call failed, falling back to mock contributions:", graphError.message);
      const mockCalendar = generateMockContributions();
      res.status(200).json({
        success: true,
        calendar: mockCalendar,
        isMock: true,
      });
    }
  } catch (err) {
    console.error("❌ getGithubContributions error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to compile GitHub contributions calendar.",
    });
  }
};
