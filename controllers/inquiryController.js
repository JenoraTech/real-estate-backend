const db = require("../config/db");
// Use this to keep your existing code working with Sequelize
const db_pg = db.sequelize;

/**
 * @desc    Send a message/inquiry to a property owner
 * @route   POST /api/inquiries
 */
exports.makeEnquiries = async (req, res) => {
  const { property_id, message } = req.body;
  const seeker_id = req.user.id; // From verifyToken middleware

  try {
    // Note: Using ? for MySQL or $1 for PostgreSQL depending on your DB driver
    // This example uses the standard query pattern
    const [result] = await db.execute(
      `INSERT INTO inquiries (property_id, seeker_id, message, created_at) 
       VALUES (?, ?, ?, NOW())`,
      [property_id, seeker_id, message],
    );

    res.status(201).json({
      message: "Inquiry sent to owner",
      inquiryId: result.insertId,
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
      SELECT i.*, p.title as property_title, u.username as seeker_name
      FROM inquiries i
      JOIN properties p ON i.property_id = p.id
      JOIN users u ON i.seeker_id = u.id
      WHERE p.owner_id = ?
      ORDER BY i.created_at DESC`,
      [owner_id],
    );
    res.status(200).json(inquiries);
  } catch (err) {
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
      SELECT i.*, p.title as property_title, u.username as seeker_name
      FROM inquiries i
      JOIN properties p ON i.property_id = p.id
      JOIN users u ON i.seeker_id = u.id
      ORDER BY i.created_at DESC`);
    res.status(200).json(inquiries);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch all inquiries" });
  }
};
