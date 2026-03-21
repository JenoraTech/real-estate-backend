const bcrypt = require("bcryptjs");
const db = require("../config/db"); // Now uses the clean pg library
const jwt = require("jsonwebtoken");

/**
 * @desc    Fetch all users for Admin Dashboard
 * @access  Private/Admin
 */
exports.getAllUsers = async (req, res) => {
  try {
    // The standard 'pg' library returns result.rows as a clean array
    const result = await db.query(
      "SELECT id, full_name, email, user_role, is_blocked FROM users ORDER BY created_at DESC",
    );

    console.log(`Fetched ${result.rows.length} users for Admin`);
    res.json(result.rows);
  } catch (err) {
    console.error("FETCH USERS ERROR:", err.message);
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
    const result = await db.query(
      "UPDATE users SET is_blocked = $1 WHERE id = $2 RETURNING id, full_name, is_blocked",
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
    res.status(500).json({ error: "Update failed: " + err.message });
  }
};

/**
 * @desc    Get Admin ID for Support/Chat
 */
exports.getAdminId = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, full_name FROM users WHERE LOWER(user_role) = LOWER($1) LIMIT 1",
      ["admin"],
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
    console.error("Database Error:", error);
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
      "UPDATE users SET has_accepted_terms = true WHERE id = $1 RETURNING *";

    const result = await db.query(query, [userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      has_accepted_terms: result.rows[0].has_accepted_terms,
      message: "Terms accepted successfully",
    });
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
