const bcrypt = require("bcryptjs");
const db = require("../config/db"); // Clean pg library pool
const jwt = require("jsonwebtoken");

/**
 * @desc    Fetch all users for Admin Dashboard
 * @access  Private/Admin
 */
exports.getAllUsers = async (req, res) => {
  try {
    // Corrected to user_role and added 'AS role' for Flutter compatibility
    const result = await db.query(
      `SELECT id, full_name, email, 
              user_role AS role, 
              is_blocked, created_at 
       FROM users 
       ORDER BY created_at DESC`,
    );

    console.log(`Fetched ${result.rows.length} users for Admin`);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ FETCH USERS ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch users: " + err.message });
  }
};

/**
 * @desc    Admin Manual Block/Unblock
 * @access  Private/Admin
 */
exports.toggleUserBlock = async (req, res) => {
  const { id } = req.params;
  const { is_blocked } = req.body;

  try {
    // ::text casting for UUID compatibility
    const result = await db.query(
      "UPDATE users SET is_blocked = $1 WHERE id::text = $2 RETURNING id, full_name, is_blocked",
      [is_blocked, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: `User ${is_blocked ? "blocked" : "unblocked"} successfully`,
      user: result.rows[0],
    });
  } catch (err) {
    console.error("❌ TOGGLE BLOCK ERROR:", err.message);
    res.status(500).json({ error: "Update failed: " + err.message });
  }
};

/**
 * @desc    Get Admin ID for Support/Chat
 */
exports.getAdminId = async (req, res) => {
  try {
    // Corrected query to use user_role
    const result = await db.query(
      "SELECT id, full_name FROM users WHERE LOWER(user_role) = 'admin' LIMIT 1",
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No admin found" });
    }

    res.json({
      success: true,
      admin_id: result.rows[0].id,
      admin_name: result.rows[0].full_name || "App Support",
    });
  } catch (error) {
    console.error("❌ GET ADMIN ID ERROR:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * @desc    Accept Terms and Conditions
 */
exports.acceptTerms = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({ error: "User ID not found in token" });
    }

    const query =
      "UPDATE users SET has_accepted_terms = true WHERE id::text = $1 RETURNING id, has_accepted_terms";

    const result = await db.query(query, [userId.toString()]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      has_accepted_terms: result.rows[0].has_accepted_terms,
      message: "Terms accepted successfully",
    });
  } catch (error) {
    console.error("❌ ACCEPT TERMS ERROR:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
