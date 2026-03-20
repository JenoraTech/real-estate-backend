const express = require("express");
const router = express.Router();
const inquiryController = require("../controllers/inquiryController");
const { verifyToken, isAdmin } = require("../middleware/auth");

/**
 * @route   POST /api/inquiries
 * @desc    Send a message to a property owner
 */
router.post("/", verifyToken, inquiryController.makeEnquiries);

/**
 * @route   GET /api/inquiries/owner
 * @desc    Get inquiries for properties owned by the logged-in user
 */
// ✅ Check if 'getInquiriesByOwner' exists in your controller.
// If it doesn't, this line crashes the server.
if (inquiryController.getInquiriesByOwner) {
  router.get("/owner", verifyToken, inquiryController.getInquiriesByOwner);
}

/**
 * @route   GET /api/inquiries/admin
 * @desc    Admin view to monitor all platform communications
 */
// ✅ Line 25: Ensure 'getAllInquiries' is exported in inquiryController.js
if (inquiryController.getAllInquiries) {
  router.get("/admin", verifyToken, isAdmin, inquiryController.getAllInquiries);
}

module.exports = router;
