const bcrypt = require("bcryptjs");
const dbConfig = require("../config/db"); // Renamed to avoid confusion
const jwt = require("jsonwebtoken");

// ✅ THE CRITICAL BRIDGE:
// This ensures that 'db.query' and 'pool.query' calls work with Sequelize.
const db = {
  query: async (text, params) => {
    // Determine if it's a SELECT or an UPDATE/INSERT
    const isSelect = text.trim().toUpperCase().startsWith("SELECT");

    const [results, metadata] = await dbConfig.sequelize.query(text, {
      bind: params || [],
      type: isSelect
        ? dbConfig.sequelize.QueryTypes.SELECT
        : dbConfig.sequelize.QueryTypes.RAW,
    });

    // We normalize the response to match the 'pg' library format (result.rows)
    // so the rest of your functioning code doesn't need to change.
    const rows = Array.isArray(results) ? results : results?.rows || [results];

    return {
      rows: rows || [],
      rowCount: Array.isArray(rows) ? rows.length : metadata?.rowCount || 0,
    };
  },
};

// Supporting the different variable names used in your code
const pool = db;
const db_pg = dbConfig.sequelize;

/**
 * @desc    Fetch all users for Admin Dashboard
 * @access  Privatea/Admin
 */
exports.getAllUsers = async (req, res) => {
  try {
    // We fetch the exact column names: full_name and user_role
    // This ensures Flutter's data['full_name'] is not null [cite: 2026-03-02]
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

exports.getAdminId = async (req, res) => {
  try {
    const result = await pool.query(
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
      admin_name: result.rows[0].full_name || "App Support", // Pass the name too
    });
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.acceptTerms = async (req, res) => {
  try {
    // req.user.id is populated by your verifyToken middleware
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({ error: "User ID not found in token" });
    }

    // ✅ FIXED: Added 'RETURNING *' so result.rows[0] is actually populated
    const query =
      "UPDATE users SET has_accepted_terms = true WHERE id = $1 RETURNING *";

    // ✅ Using await with db.query for PostgreSQL
    const result = await db.query(query, [userId]);

    // In pg, result.rowCount tells you how many rows were updated
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Now result.rows[0] exists because of the RETURNING clause
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
