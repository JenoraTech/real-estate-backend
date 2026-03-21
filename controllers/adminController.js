const dbConfig = require("../config/db"); // Renamed to avoid confusion
// Use this to keep your existing code working with Sequelize
const db_pg = dbConfig.sequelize;

// ✅ THE CRITICAL BRIDGE:
// This ensures that 'db.query' calls work with your Sequelize/Supabase setup.
const db = {
  query: async (text, params) => {
    const isSelect = text.trim().toUpperCase().startsWith("SELECT");
    const [results, metadata] = await dbConfig.sequelize.query(text, {
      bind: params || [],
      type: isSelect
        ? dbConfig.sequelize.QueryTypes.SELECT
        : dbConfig.sequelize.QueryTypes.RAW,
    });

    // Normalize response to match 'result.rows' format
    const rows = Array.isArray(results) ? results : results?.rows || [results];
    return {
      rows: rows || [],
      rowCount: Array.isArray(rows) ? rows.length : metadata?.rowCount || 0,
    };
  },
};

// 1. Fetch all properties that are waiting for approval
exports.getPendingProperties = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM properties 
       WHERE is_approved = false 
       ORDER BY created_at DESC`,
    );

    // ✅ UPDATED: Using your Render URL instead of the local IP for images
    const BASE_URL = "https://real-estate-backend-4kfq.onrender.com/";
    const properties = result.rows.map((prop) => ({
      ...prop,
      image_urls: prop.image_urls
        ? prop.image_urls.map((url) => {
            // If the URL is already absolute, don't prepend the BASE_URL
            return url.startsWith("http") ? url : `${BASE_URL}${url}`;
          })
        : [],
    }));

    res.status(200).json(properties);
  } catch (err) {
    console.error("Fetch Pending Error:", err.message);
    res.status(500).json({ error: "Failed to fetch pending properties" });
  }
};

// 2. Approve a property (Make it Live)
exports.approveProperty = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `UPDATE properties 
       SET is_approved = true, 
           status = 'active', 
           updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Property not found" });
    }

    res.status(200).json({
      message: "Property approved and is now live!",
      property: result.rows[0],
    });
  } catch (err) {
    console.error("Approval Error:", err.message);
    res.status(500).json({ error: "Server error during approval" });
  }
};

// 3. Reject/Delete a property
exports.rejectProperty = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "DELETE FROM properties WHERE id = $1 RETURNING title",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Property not found" });
    }

    res.status(200).json({
      message: `Property '${result.rows[0].title}' has been rejected and deleted.`,
    });
  } catch (err) {
    console.error("Reject Error:", err.message);
    res.status(500).json({ error: "Server error during rejection" });
  }
};

// 4. Admin Dashboard Stats
exports.getAdminStats = async (req, res) => {
  try {
    const userCount = await db.query("SELECT COUNT(*) FROM users");
    const propertyCount = await db.query("SELECT COUNT(*) FROM properties");
    const pendingCount = await db.query(
      "SELECT COUNT(*) FROM properties WHERE is_approved = false",
    );
    const totalRevenue = await db.query(
      "SELECT SUM(total_admin_revenue) FROM interest_logs",
    );

    res.status(200).json({
      totalUsers: parseInt(userCount.rows[0].count),
      totalProperties: parseInt(propertyCount.rows[0].count),
      pendingApprovals: parseInt(pendingCount.rows[0].count),
      estimatedRevenue: totalRevenue.rows[0].sum || 0,
    });
  } catch (err) {
    console.error("Stats Error:", err.message);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};
