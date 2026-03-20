const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const db = require("../config/db");

// ✅ Destructure the functions from your updated auth middleware
// This prevents the "argument handler must be a function" crash.
const { verifyToken, isAdmin } = require("../middleware/auth");

/**
 * @route   GET /api/users
 * @desc    Fetch all users for the Admin Dashboard
 * @access  Private (Admin)
 */
// ✅ Changed authMiddleware to verifyToken and added isAdmin for security
router.get("/", verifyToken, isAdmin, userController.getAllUsers);

// ✅ UPDATED: Changed 'protect' to 'verifyToken' to match your import above
router.post("/accept-terms", verifyToken, userController.acceptTerms);

/**
 * @route   PATCH /api/users/:id/block
 * @desc    Admin Manual Block/Unblock
 * @access  Private (Admin)
 */
// ✅ Updated to use the correct middleware functions
router.patch(
  "/:id/block",
  verifyToken,
  isAdmin,
  userController.toggleUserBlock,
);
// Get the UUID of the admin user so seekers can contact them
router.get("/admin-id", userController.getAdminId);

/**
 * @route   GET /api/users/:id
 * @desc    Get specific user profile (Used for Property Owner Contact)
 * @access  Public
 */
router.get("/:id", (req, res) => {
  const userId = req.params.id;

  // We select fields that match your Flutter UserModel.fromJson factory exactly.
  const query = `
    SELECT 
      id, 
      username AS name, 
      email, 
      role, 
      phone_number AS phoneNumber, 
      profile_pic AS profilePic, 
      isOnline, 
      last_seen AS lastSeen 
    FROM users 
    WHERE id = ?
  `;

  db.query(query, [userId], (err, result) => {
    if (err) {
      console.error("Database Error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result[0]);
  });
});

module.exports = router;
