const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { verifyToken, isAdmin } = require("../middleware/auth"); // ✅ Ensure this path matches your file structure

// --- ALL ROUTES PROTECTED BY TOKEN AND ADMIN CHECK ---

// 1. Fetch Pending (Added isAdmin)
router.get(
  "/pending-properties",
  verifyToken,
  isAdmin,
  adminController.getPendingProperties,
);

// 2. Stats
router.get("/stats", verifyToken, isAdmin, adminController.getAdminStats);

// 3. Approve
router.patch(
  "/approve/:id",
  verifyToken,
  isAdmin,
  adminController.approveProperty,
);

// 4. Reject
router.delete(
  "/reject/:id",
  verifyToken,
  isAdmin,
  adminController.rejectProperty,
);

module.exports = router;
