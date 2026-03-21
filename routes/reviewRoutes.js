const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { verifyToken } = require("../middleware/auth");

// ======================= POST A NEW REVIEW =======================
router.post("/add", verifyToken, async (req, res) => {
  try {
    const { owner_id, property_id, rating, comment } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Unauthorized: User ID not found" });
    }

    const seeker_id = req.user.id;

    // Use lowercase 'reviews' or match exactly what Supabase shows
    // We remove the double quotes to let the DB handle case-sensitivity normally
    const insertQuery = `
      INSERT INTO Reviews (seeker_id, owner_id, property_id, rating, comment, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `;
    const reviewResult = await db.query(insertQuery, [
      seeker_id,
      owner_id,
      property_id,
      rating,
      comment,
    ]);
    const newReview = reviewResult.rows[0];

    // 2️⃣ Recalculate and Update Stats
    try {
      const ownerStatsQuery = `
        UPDATE users 
        SET 
          average_rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM Reviews WHERE owner_id::text = $1),
          total_reviews = (SELECT COUNT(*)::int FROM Reviews WHERE owner_id::text = $1)
        WHERE id::text = $1
      `;
      await db.query(ownerStatsQuery, [owner_id]);

      if (property_id) {
        const propertyStatsQuery = `
          UPDATE properties 
          SET 
            average_rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM Reviews WHERE property_id::text = $1),
            total_reviews = (SELECT COUNT(*)::int FROM Reviews WHERE property_id::text = $1)
          WHERE id::text = $1
        `;
        await db.query(propertyStatsQuery, [property_id]);
      }
    } catch (updateError) {
      console.error("⚠️ Stats update failed:", updateError.message);
    }

    res.status(201).json(newReview);
  } catch (error) {
    console.error("❌ Review Creation Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ======================= GET REVIEWS FOR OWNER =======================
router.get("/owner/:ownerId", async (req, res) => {
  try {
    // Join logic: casting both to text to ensure the varchar vs uuid mismatch doesn't break
    const query = `
      SELECT r.*, u.full_name as seeker_name 
      FROM Reviews r
      LEFT JOIN users u ON r.seeker_id::text = u.id::text
      WHERE r.owner_id::text = $1 
      ORDER BY r.created_at DESC
    `;
    const result = await db.query(query, [req.params.ownerId]);
    res.json(result.rows || []);
  } catch (error) {
    console.error("❌ Owner Review Error:", error.message);
    res.status(200).json([]); // Return empty array so Flutter doesn't see a 500
  }
});

// ======================= GET REVIEWS FOR PROPERTY =======================
router.get("/property/:propertyId", async (req, res) => {
  try {
    const query = `
      SELECT r.*, u.full_name as seeker_name 
      FROM Reviews r
      LEFT JOIN users u ON r.seeker_id::text = u.id::text
      WHERE r.property_id::text = $1 
      ORDER BY r.created_at DESC
    `;
    const result = await db.query(query, [req.params.propertyId]);
    res.json(result.rows || []);
  } catch (error) {
    console.error("❌ Property Review Error:", error.message);
    res.status(200).json([]); // Return empty array so Flutter doesn't see a 500
  }
});

module.exports = router;
