const express = require("express");
const router = express.Router();
const { Review, User, Property } = require("../models"); // ✅ Updated to include User and Property model

// ✅ FIX: Destructure 'protect' from the middleware object
const { protect } = require("../middleware/auth");

// Post a new review
// We use 'protect' here to ensure the seeker is logged in
router.post("/add", protect, async (req, res) => {
  try {
    const { owner_id, property_id, rating, comment } = req.body; // ✅ Added property_id

    // Safety check: Ensure the middleware attached the user successfully
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({ error: "Unauthorized: User ID not found in token" });
    }

    const seeker_id = req.user.id;

    const review = await Review.create({
      seeker_id,
      owner_id,
      property_id, // ✅ Now saving property_id in the review
      rating,
      comment,
    });

    // ✅ NEW: Recalculate and update Owner's average rating
    try {
      // 1. Get all reviews for this specific owner
      const allOwnerReviews = await Review.findAll({
        where: { owner_id: owner_id },
      });

      // 2. Calculate the average for Owner
      const totalOwnerRating = allOwnerReviews.reduce(
        (sum, r) => sum + r.rating,
        0,
      );
      const newOwnerAverage = (
        totalOwnerRating / allOwnerReviews.length
      ).toFixed(2);

      // 3. Update the User record in the database
      await User.update(
        {
          average_rating: newOwnerAverage,
          total_reviews: allOwnerReviews.length,
        },
        { where: { id: owner_id } },
      );

      // ✅ 4. NEW: Recalculate and update Property's average rating if property_id is provided
      if (property_id) {
        const allPropertyReviews = await Review.findAll({
          where: { property_id: property_id },
        });

        const totalPropRating = allPropertyReviews.reduce(
          (sum, r) => sum + r.rating,
          0,
        );
        const newPropAverage = (
          totalPropRating / allPropertyReviews.length
        ).toFixed(2);

        await Property.update(
          {
            average_rating: newPropAverage,
            total_reviews: allPropertyReviews.length,
          },
          { where: { id: property_id } },
        );

        console.log(
          `🏠 Updated Property ${property_id}: Avg ${newPropAverage} (${allPropertyReviews.length} reviews)`,
        );
      }

      console.log(
        `⭐ Updated Owner ${owner_id}: Avg ${newOwnerAverage} (${allOwnerReviews.length} reviews)`,
      );
    } catch (updateError) {
      console.error(
        "⚠️ Failed to update owner or property average, but review was saved:",
        updateError,
      );
      // We don't return an error here because the review itself was successfully saved
    }

    res.status(201).json(review);
  } catch (error) {
    console.error("Review Creation Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all reviews for a specific owner
router.get("/owner/:ownerId", async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: { owner_id: req.params.ownerId },
      order: [["createdAt", "DESC"]],
    });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ ADDED: Get all reviews for a specific property
router.get("/property/:propertyId", async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: { property_id: req.params.propertyId },
      order: [["createdAt", "DESC"]],
    });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
