const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { verifyToken } = require("../middleware/auth");

// ======================= POST A NEW REVIEW =======================
router.post("/add", verifyToken, async (req, res) => {
  try {
    const { owner_id, rating, comment } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Unauthorized: User ID not found" });
    }

    const seeker_id = req.user.id;

    // 1️⃣ Insert using your EXACT column names from the screenshot: createdAt
    const insertQuery = `
      INSERT INTO reviews (seeker_id, owner_id, rating, comment, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
    `;
    const reviewResult = await db.query(insertQuery, [
      seeker_id.toString(),
      owner_id.toString(),
      rating,
      comment,
    ]);
    const newReview = reviewResult.rows[0];

    // 2️⃣ Recalculate and Update Owner Stats
    try {
      const ownerStatsQuery = `
        UPDATE users 
        SET 
          average_rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE owner_id::text = $1),
          total_reviews = (SELECT COUNT(*)::int FROM reviews WHERE owner_id::text = $1)
        WHERE id::text = $1
      `;
      await db.query(ownerStatsQuery, [owner_id]);
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
    const query = `
      SELECT r.*, u.full_name as seeker_name 
      FROM reviews r
      LEFT JOIN users u ON r.seeker_id::text = u.id::text
      WHERE r.owner_id::text = $1 
      ORDER BY r."createdAt" DESC
    `;
    const result = await db.query(query, [req.params.ownerId]);
    res.json(result.rows || []);
  } catch (error) {
    console.error("❌ Owner Review Error:", error.message);
    res.status(200).json([]);
  }
});

module.exports = router;
