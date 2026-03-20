const dbConfig = require("../config/db"); // Renamed to avoid confusion

// ✅ THE CRITICAL BRIDGE:
// This ensures that 'db.execute' or 'db.query' calls work with Sequelize.
const db = {
  execute: async (text, params) => {
    // We convert MySQL-style '?' or standard params to Sequelize-bound params
    // We return [results] to match your existing array destructuring [result]
    const [results] = await dbConfig.sequelize.query(text, {
      bind: params,
      type: dbConfig.sequelize.QueryTypes.SELECT,
    });

    // We mock the 'insertId' behavior for your POST requests
    return [
      results,
      { insertId: results && results[0] ? results[0].id : null },
    ];
  },
  query: async (text, params) => {
    const [results] = await dbConfig.sequelize.query(text, {
      bind: params,
      type: dbConfig.sequelize.QueryTypes.SELECT,
    });
    return [results];
  },
};

// Use this to keep your existing code working with Sequelize
const db_pg = dbConfig.sequelize;

/**
 * @desc    Send a message/inquiry to a property owner
 * @route   POST /api/inquiries
 */
exports.makeEnquiries = async (req, res) => {
  const { property_id, message } = req.body;
  const seeker_id = req.user.id; // From verifyToken middleware

  try {
    // Note: Using $1, $2, $3 for PostgreSQL compatibility with Sequelize bind
    const [result, metadata] = await db.execute(
      `INSERT INTO inquiries (property_id, seeker_id, message, created_at) 
       VALUES ($1, $2, $3, NOW()) RETURNING id`,
      [property_id, seeker_id, message],
    );

    res.status(201).json({
      message: "Inquiry sent to owner",
      inquiryId: metadata.insertId,
    });
  } catch (err) {
    console.error("Inquiry Error:", err);
    res.status(500).json({ error: "Failed to send inquiry" });
  }
};

/**
 * @desc    Get inquiries for properties owned by the logged-in user
 * @route   GET /api/inquiries/owner
 */
exports.getInquiriesByOwner = async (req, res) => {
  const owner_id = req.user.id;
  try {
    const [inquiries] = await db.execute(
      `
      SELECT i.*, p.title as property_title, u.full_name as seeker_name
      FROM inquiries i
      JOIN properties p ON i.property_id = p.id
      JOIN users u ON i.seeker_id = u.id
      WHERE p.owner_id = $1
      ORDER BY i.created_at DESC`,
      [owner_id],
    );
    res.status(200).json(inquiries);
  } catch (err) {
    console.error("Fetch Owner Inquiries Error:", err.message);
    res.status(500).json({ error: "Failed to fetch owner inquiries" });
  }
};

/**
 * @desc    Admin view to see all platform inquiries
 * @route   GET /api/inquiries/admin
 */
exports.getAllInquiries = async (req, res) => {
  try {
    const [inquiries] = await db.execute(`
      SELECT i.*, p.title as property_title, u.full_name as seeker_name
      FROM inquiries i
      JOIN properties p ON i.property_id = p.id
      JOIN users u ON i.seeker_id = u.id
      ORDER BY i.created_at DESC`);
    res.status(200).json(inquiries);
  } catch (err) {
    console.error("Admin Inquiries Error:", err.message);
    res.status(500).json({ error: "Failed to fetch all inquiries" });
  }
};
