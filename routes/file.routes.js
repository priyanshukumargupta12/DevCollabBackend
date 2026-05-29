const express = require("express");
const router = express.Router({ mergeParams: true }); // Merge params to access workspaceId from parent route

const {
  uploadFileToWorkspace,
  getWorkspaceFiles,
  deleteWorkspaceFile,
} = require("../controllers/file.controller");

const { protect } = require("../middleware/auth.middleware");
const { workspaceUpload } = require("../utils/fileUploader");

// All file routes are protected by auth
router.use(protect);

router.route("/")
  .post(workspaceUpload.single("file"), uploadFileToWorkspace)
  .get(getWorkspaceFiles);

router.route("/:fileId")
  .delete(deleteWorkspaceFile);

module.exports = router;
