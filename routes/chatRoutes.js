const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");

// UPDATED: Now directly destructuring 'protect' since we added it to middleware/auth.js
const { protect } = require("../middleware/auth");

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure uploads directory exists (including the 'chat' sub-folder)
const uploadDir = "uploads/chat/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Creates a unique filename: timestamp + original extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

/**
 * Safety wrapper to prevent crashes if a controller function
 * is missing or renamed during development.
 */
const safe = (fn) =>
  typeof fn === "function"
    ? fn
    : (req, res) => {
        console.error("❌ Route Error: Controller method is not a function.");
        return res.status(501).json({ error: "Method not implemented" });
      };

// Apply protection to all chat routes (Ensures req.user is populated)
// This uses the verified 'protect' function from your auth middleware.
if (typeof protect === "function") {
  router.use(protect);
} else {
  console.error(
    "⚠️ Warning: 'protect' middleware is undefined. Check middleware/auth.js exports.",
  );
}

/**
 * @route   POST /api/chat/send
 * @desc    Send a message (Text, Image, or Audio)
 * @note    Uses upload.single('file') to handle Multipart data from Flutter
 */
router.post("/send", upload.single("file"), safe(chatController.sendMessage));

/**
 * @route   GET /api/chat/messages/:receiverId
 * @desc    Get Chat History between the logged-in user and recipient
 */
router.get("/messages/:receiverId", safe(chatController.getChatHistory));

/**
 * @route   GET /api/chat/recent
 * @desc    Get Basic Inbox view (list of recent unique conversations)
 */
router.get("/recent", safe(chatController.getConversations));

/**
 * @route   GET /api/chat/conversations
 * @desc    Get detailed conversation list with Online/Last Seen status
 */
router.get("/conversations", safe(chatController.getDetailedConversations));

/**
 * @route   PATCH /api/chat/read
 * @desc    Mark all messages from a specific sender as read (status = 3)
 */
router.patch("/read", safe(chatController.markAsRead));

/**
 * @route   GET /api/chat/presence/:userId
 * @desc    Get online status / last seen of a user
 */
router.get("/presence/:userId", safe(chatController.getUserPresence));

module.exports = router;
