const db = require("../config/db"); // Ensure this is your pg pool export
const BASE_URL = "https://real-estate-backend-4kfq.onrender.com/";

// ======================= ADMIN: GET PENDING PROPERTIES =======================
exports.getPendingProperties = async (req, res) => {
  try {
    // Standard pg query logic
    const queryText = `
      SELECT 
        p.*, 
        u.full_name AS owner_name, 
        u.email AS owner_email,
        u.user_role AS owner_role
      FROM properties p
      LEFT JOIN users u ON p.owner_id::text = u.id::text
      WHERE p.is_approved = false 
      ORDER BY p.created_at DESC
    `;

    const result = await db.query(queryText);

    // If no rows, return empty array immediately
    if (!result || !result.rows || result.rows.length === 0) {
      return res.status(200).json([]);
    }

    const properties = result.rows.map((prop) => {
      const cleanProp = { ...prop };

      // Safety: Handle image_urls array and sanitize backslashes for Linux/Render
      if (cleanProp.image_urls && Array.isArray(cleanProp.image_urls)) {
        cleanProp.image_urls = cleanProp.image_urls.map((url) => {
          if (!url) return "";
          const sanitizedUrl = url.replace(/\\/g, "/");
          return sanitizedUrl.startsWith("http")
            ? sanitizedUrl
            : `${BASE_URL}${sanitizedUrl}`;
        });
      } else {
        cleanProp.image_urls = [];
      }

      // Safety: Handle thumbnail
      if (cleanProp.thumbnail) {
        const sanitizedThumb = cleanProp.thumbnail.replace(/\\/g, "/");
        if (!sanitizedThumb.startsWith("http")) {
          cleanProp.thumbnail = `${BASE_URL}${sanitizedThumb}`;
        }
      }

      return cleanProp;
    });

    console.log(`✅ Admin: Fetched ${properties.length} pending properties`);
    res.status(200).json(properties);
  } catch (err) {
    console.error("❌ Fetch Pending Error:", err.message);
    res.status(500).json({
      error: "Failed to fetch pending properties",
      details: err.message,
    });
  }
};

// ======================= ADMIN: APPROVE PROPERTY =======================
exports.approveProperty = async (req, res) => {
  const { id } = req.params;

  try {
    // Added ::text casting for UUID/String compatibility
    const result = await db.query(
      `UPDATE properties 
       SET is_approved = true, 
           status = 'active', 
           updated_at = NOW() 
       WHERE id::text = $1 
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
    console.error("❌ Approval Error:", err.message);
    res.status(500).json({ error: "Server error during approval" });
  }
};

// ======================= ADMIN: REJECT/DELETE PROPERTY =======================
exports.rejectProperty = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "DELETE FROM properties WHERE id::text = $1 RETURNING title",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Property not found" });
    }

    res.status(200).json({
      message: `Property '${result.rows[0].title}' has been rejected and deleted.`,
    });
  } catch (err) {
    console.error("❌ Reject Error:", err.message);
    res.status(500).json({ error: "Server error during rejection" });
  }
};

// ======================= ADMIN: DASHBOARD STATS =======================
exports.getAdminStats = async (req, res) => {
  try {
    // Run all count queries
    const userCount = await db.query("SELECT COUNT(*) FROM users");
    const propertyCount = await db.query("SELECT COUNT(*) FROM properties");
    const pendingCount = await db.query(
      "SELECT COUNT(*) FROM properties WHERE is_approved = false",
    );

    // Revenue query with a fallback catch in case interest_logs doesn't exist yet
    let totalRevenue = 0;
    try {
      const revenueRes = await db.query(
        "SELECT SUM(total_admin_revenue) FROM interest_logs",
      );
      totalRevenue = revenueRes.rows[0]?.sum || 0;
    } catch (e) {
      console.warn(
        "⚠️ Revenue table (interest_logs) query failed, defaulting to 0",
      );
    }

    res.status(200).json({
      totalUsers: parseInt(userCount.rows[0]?.count || 0),
      totalProperties: parseInt(propertyCount.rows[0]?.count || 0),
      pendingApprovals: parseInt(pendingCount.rows[0]?.count || 0),
      estimatedRevenue: parseFloat(totalRevenue),
    });
  } catch (err) {
    console.error("❌ Stats Error:", err.message);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};
