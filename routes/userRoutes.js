const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const db = require("../config/db");

// ✅ Using the destructured auth middleware
const { verifyToken, isAdmin } = require("../middleware/auth");

/**
 * @route   GET /api/users
 * @desc    Fetch all users for the Admin Dashboard
 */
router.get("/", verifyToken, isAdmin, userController.getAllUsers);

/**
 * @route   POST /api/users/accept-terms
 */
router.post("/accept-terms", verifyToken, userController.acceptTerms);

/**
 * @route   PATCH /api/users/:id/block
 */
router.patch(
  "/:id/block",
  verifyToken,
  isAdmin,
  userController.toggleUserBlock,
);

/**
 * @route   GET /api/users/admin-id
 */
router.get("/admin-id", userController.getAdminId);

/**
 * @route   GET /api/users/:id
 * @desc    Get specific user profile (Used for Property Owner Contact)
 * @access  Public
 */
router.get("/:id", async (req, res) => {
  const userId = req.params.id;

  // ✅ Updated to PostgreSQL $1 syntax and added ::text casting
  const query = `
    SELECT 
      id, 
      full_name AS name, 
      email, 
      role, 
      phone AS "phoneNumber", 
      profile_pic AS "profilePic", 
      is_online AS "isOnline", 
      last_seen AS "lastSeen" 
    FROM users 
    WHERE id::text = $1
  `;

  try {
    // ✅ Changed from callback to await to match your PG Pool config
    const result = await db.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // result.rows[0] contains the data in PG
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Database Error in getUserById:", err.message);
    res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
});

module.exports = router;
