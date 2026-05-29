const express = require("express");
const router = express.Router();

const { globalSearch } = require("../controllers/search.controller");
const { protect } = require("../middleware/auth.middleware");

// Enforce authentication for search
router.use(protect);

router.route("/").get(globalSearch);

module.exports = router;
