const express = require("express");
const router = express.Router();
const db = require("../config/db"); // ✅ Uses the new PG Pool
const { protect } = require("../middleware/auth");

// ======================= POST A NEW REVIEW =======================
router.post("/add", protect, async (req, res) => {
  try {
    const { owner_id, property_id, rating, comment } = req.body;

    // Safety check for user from middleware
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Unauthorized: User ID not found" });
    }

    const seeker_id = req.user.id;

    // 1️⃣ Insert the Review
    const insertQuery = `
      INSERT INTO reviews (seeker_id, owner_id, property_id, rating, comment, created_at)
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

    // 2️⃣ Recalculate and Update Owner/Property Stats
    try {
      // Update Owner Average Rating & Total Reviews
      const ownerStatsQuery = `
        UPDATE users 
        SET 
          average_rating = (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE owner_id = $1),
          total_reviews = (SELECT COUNT(*) FROM reviews WHERE owner_id = $1)
        WHERE id = $1
      `;
      await db.query(ownerStatsQuery, [owner_id]);

      // Update Property Average Rating & Total Reviews (if property_id exists)
      if (property_id) {
        const propertyStatsQuery = `
          UPDATE properties 
          SET 
            average_rating = (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE property_id = $1),
            total_reviews = (SELECT COUNT(*) FROM reviews WHERE property_id = $1)
          WHERE id = $1
        `;
        await db.query(propertyStatsQuery, [property_id]);
      }
    } catch (updateError) {
      console.error(
        "⚠️ Review saved, but stats update failed:",
        updateError.message,
      );
    }

    res.status(201).json(newReview);
  } catch (error) {
    console.error("Review Creation Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ======================= GET REVIEWS FOR OWNER =======================
router.get("/owner/:ownerId", async (req, res) => {
  try {
    const query = `
      SELECT * FROM reviews 
      WHERE owner_id = $1 
      ORDER BY created_at DESC
    `;
    const result = await db.query(query, [req.params.ownerId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================= GET REVIEWS FOR PROPERTY =======================
router.get("/property/:propertyId", async (req, res) => {
  try {
    const query = `
      SELECT * FROM reviews 
      WHERE property_id = $1 
      ORDER BY created_at DESC
    `;
    const result = await db.query(query, [req.params.propertyId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
