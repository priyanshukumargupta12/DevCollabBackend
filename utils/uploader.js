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

// Configure Multer memory storage (keeps file buffers in memory for Cloudinary or disk uploader)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error("Only images (jpeg, jpg, png, gif, webp) are allowed."));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB
  fileFilter,
});

/**
 * Uploads a file buffer. Returns Cloudinary secure_url if configured,
 * otherwise writes the file to Backend/public/uploads and returns a local relative URL.
 * 
 * @param {Object} file - Express Multer file object
 * @returns {Promise<string>} Image URL
 */
const uploadImage = async (file) => {
  if (!file) return null;

  const hasCloudinaryEnv = 
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;

  if (hasCloudinaryEnv) {
    try {
      return await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "devcollab_profiles" },
          (error, result) => {
            if (error) {
              console.error("Cloudinary upload failed:", error.message);
              reject(error);
            } else {
              resolve(result.secure_url);
            }
          }
        );
        uploadStream.end(file.buffer);
      });
    } catch (err) {
      console.warn("Cloudinary upload crashed, falling back to local file storage...", err.message);
    }
  }

  // Local storage fallback
  const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
  const fileExt = path.extname(file.originalname) || ".png";
  const filename = `avatar_${uniqueSuffix}${fileExt}`;
  
  // Save inside Backend/public/uploads
  const uploadsDir = path.join(__dirname, "../public/uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const destPath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(destPath, file.buffer);

  // Return local static path
  return `/uploads/${filename}`;
};

module.exports = {
  upload,
  uploadImage,
};
