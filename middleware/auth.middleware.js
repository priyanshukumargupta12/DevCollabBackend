const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Protect Middleware
 * Verifies the JWT Bearer token on protected routes.
 * Attaches the authenticated user to req.user.
 */
const protect = async (req, res, next) => {
  let token;

  // 1. Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  // 2. Reject if no token found
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    });
  }

  try {
    // 3. Verify token signature and expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Fetch user from DB (password excluded by default)
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User belonging to this token no longer exists.",
      });
    }

    // 5. Attach user to request object for downstream use
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token has expired. Please log in again.",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid token. Authentication failed.",
    });
  }
};

/**
 * Restrict Middleware (Role-based access control)
 * Usage: restrict("admin")
 * @param {...string} roles - Allowed roles
 */
const restrict = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action.",
      });
    }
    next();
  };
};

module.exports = { protect, restrict };
