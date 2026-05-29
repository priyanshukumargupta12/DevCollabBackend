const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const path = require("path");
const fs = require("fs");

// Configure Cloudinary from env variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
});

// Configure Multer memory storage (keeps file buffers in memory)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Allowed file extensions
  const allowedExtensions = /jpg|jpeg|png|pdf|docx/;
  
  // Allowed MIME types
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];

  const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedMimeTypes.includes(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(
      new Error(
        "Only images (jpg, jpeg, png), PDFs (pdf), and Word documents (docx) are allowed."
      )
    );
  }
};

const workspaceUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
  fileFilter,
});

/**
 * Uploads a file buffer. Returns Cloudinary secure_url if configured,
 * otherwise writes the file to Backend/public/uploads/files and returns a local relative URL.
 * 
 * @param {Object} file - Express Multer file object
 * @returns {Promise<string>} File URL
 */
const uploadWorkspaceFile = async (file) => {
  if (!file) return null;

  const hasCloudinaryEnv = 
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;

  if (hasCloudinaryEnv) {
    try {
      return await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { 
            folder: "devcollab_workspace_files",
            resource_type: "auto" // Auto detect images, pdfs, and other raw files
          },
          (error, result) => {
            if (error) {
              console.error("Cloudinary workspace upload failed:", error.message);
              reject(error);
            } else {
              resolve(result.secure_url);
            }
          }
        );
        uploadStream.end(file.buffer);
      });
    } catch (err) {
      console.warn("Cloudinary upload crashed, falling back to local storage...", err.message);
    }
  }

  // Local storage fallback
  const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
  const fileExt = path.extname(file.originalname) || ".bin";
  const filename = `file_${uniqueSuffix}${fileExt}`;
  
  // Save inside Backend/public/uploads/files
  const uploadsDir = path.join(__dirname, "../public/uploads/files");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const destPath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(destPath, file.buffer);

  // Return local static path
  return `/uploads/files/${filename}`;
};

/**
 * Deletes a file. Cleans up either Cloudinary asset or local file.
 * 
 * @param {string} fileUrl - File URL to delete
 * @returns {Promise<boolean>} Success status
 */
const deleteWorkspaceFile = async (fileUrl) => {
  if (!fileUrl) return false;

  // Case 1: Local file deletion
  if (fileUrl.startsWith("/uploads/files/")) {
    try {
      const filename = fileUrl.replace("/uploads/files/", "");
      const filePath = path.join(__dirname, "../public/uploads/files", filename);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
    } catch (err) {
      console.error("Error unlinking local file:", err.message);
      return false;
    }
  }

  // Case 2: Cloudinary file deletion
  const isCloudinary = fileUrl.includes("res.cloudinary.com");
  if (isCloudinary) {
    try {
      // Cloudinary URL format:
      // https://res.cloudinary.com/<cloud_name>/<resource_type>/upload/v<version>/<folder>/<public_id>.<extension>
      const match = fileUrl.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
      if (match && match[1]) {
        const publicId = match[1];
        
        // Determine resource type:
        // images use "image" resource_type; pdf/docx are "raw" or "image" depending on upload.
        // If the URL contains '/raw/', it's raw; if it contains '/image/', it's image.
        let resourceType = "image";
        if (fileUrl.includes("/raw/upload/")) {
          resourceType = "raw";
        } else if (fileUrl.includes("/image/upload/")) {
          resourceType = "image";
        } else {
          // Fallback check based on extension
          const ext = path.extname(fileUrl).toLowerCase();
          if (ext === ".pdf" || ext === ".docx") {
            resourceType = "raw";
          }
        }

        const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        return result.result === "ok";
      }
    } catch (err) {
      console.error("Error destroying Cloudinary file:", err.message);
      return false;
    }
  }

  return false;
};

module.exports = {
  workspaceUpload,
  uploadWorkspaceFile,
  deleteWorkspaceFile,
};
