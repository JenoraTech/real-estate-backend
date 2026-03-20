const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure the 'uploads' directory exists
const uploadDir = "uploads/properties";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Creates a unique filename: timestamp-random-originalExt
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

/**
 * UPDATED FILE FILTER
 * Handles cases where Flutter Web sends bytes without a clear image mimetype.
 */
const fileFilter = (req, file, cb) => {
  const allowedExtensions = /jpeg|jpg|png|webp|gif/;

  // 1. Check if the mimetype starts with image/
  const isImageMime = file.mimetype.startsWith("image/");

  // 2. Check if the file extension is an image (fallback for Web bytes)
  const isImageExt = allowedExtensions.test(
    path.extname(file.originalname).toLowerCase(),
  );

  if (isImageMime || isImageExt) {
    cb(null, true);
  } else {
    // This triggers the "Only image files are allowed!" error you saw in the logs
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter,
});

module.exports = upload;
