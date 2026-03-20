// propertyController.js
const BASE_URL = "https://real-estate-backend-4kfq.onrender.com/";
const db = require("../config/db");
const {
  Property,
  PropertyImage,
  User,
  PropertyCommission,
  Waitlist,
  Inquiry,
  Review,
  PropertyView,
} = require("../models");
const fs = require("fs");
const path = require("path");

// Use this to keep your existing code working with Sequelize if needed
const db_pg = db.sequelize;

/**
 * INTERNAL HELPER: runQuery
 * This ensures that even if your db.js exports a pool, a client, or a helper,
 * the .query() calls throughout this file will NOT crash.
 */
const runQuery = async (text, params) => {
  try {
    if (typeof db.query === "function") {
      return await db.query(text, params);
    } else if (db.pool && typeof db.pool.query === "function") {
      return await db.pool.query(text, params);
    } else {
      throw new Error(
        "Database configuration error: .query() is not available.",
      );
    }
  } catch (err) {
    throw err;
  }
};

// ======================= CREATE PROPERTY =======================
exports.createProperty = async (req, res) => {
  const {
    title,
    description,
    price,
    location,
    category,
    features,
    state,
    lga,
    city,
    street,
    landmark,
    latitude,
    longitude,
  } = req.body;

  const ownerId = req.user.id;

  try {
    // --- AUTOMATION: DEBT CHECK & ACCOUNT FREEZE ---
    const debtCheck = await db.query(
      `SELECT COUNT(*) FROM property_commissions 
       WHERE owner_id = $1 AND status = 'unpaid'`,
      [ownerId],
    );

    const unpaidCount = parseInt(debtCheck.rows[0].count);
    const DEBT_LIMIT = 3;

    if (unpaidCount >= DEBT_LIMIT) {
      await db.query("UPDATE users SET is_blocked = true WHERE id = $1", [
        ownerId,
      ]);
      return res.status(403).json({
        error: "Account Frozen",
        message: `Your account is frozen due to ${unpaidCount} unpaid commissions.`,
      });
    }

    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ error: "Please upload at least one property image." });
    }

    // --- SANITIZE PRICE ---
    const cleanPrice = price ? price.toString().replace(/,/g, "") : 0;

    // --- PREPARE IMAGES ---
    const imageUrlsArray = req.files.map((file) =>
      file.path.replace(/\\/g, "/"),
    );

    // --- CONVERT FEATURES ---
    let pgFeatures = "{}";
    if (features) {
      try {
        const parsedFeatures =
          typeof features === "string" ? JSON.parse(features) : features;
        if (Array.isArray(parsedFeatures)) {
          pgFeatures = `{${parsedFeatures
            .map((f) => `"${f.replace(/"/g, '\\"')}"`)
            .join(",")}}`;
        }
      } catch (e) {
        const fallbackArray =
          typeof features === "string" ? features.split(",") : [features];
        pgFeatures = `{${fallbackArray.map((f) => `"${f.trim()}"`).join(",")}}`;
      }
    }

    // --- INSERT PROPERTY ---
    const newProperty = await db.query(
      `INSERT INTO properties (
        owner_id, title, description, price, location, category, 
        listing_type, property_type, address, city, state, lga, 
        street, landmark, status, features, image_urls, 
        latitude, longitude, created_at, updated_at
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW()) 
      RETURNING *`,
      [
        ownerId,
        title,
        description,
        cleanPrice,
        location,
        category || "General",
        "rent",
        "house",
        location,
        city || "",
        state || "",
        lga || "",
        street || "",
        landmark || "",
        "pending",
        pgFeatures,
        `{${imageUrlsArray.map((url) => `"${url}"`).join(",")}}`,
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
      ],
    );

    const propertyId = newProperty.rows[0].id;

    // --- LOG COMMISSION ---
    const commissionDue = parseFloat(cleanPrice) * 0.025;
    await db.query(
      `INSERT INTO property_commissions (property_id, owner_id, total_rent_price, commission_due) 
       VALUES ($1, $2, $3, $4)`,
      [propertyId, ownerId, cleanPrice, commissionDue],
    );

    // --- SYNC WITH property_images TABLE ---
    for (const url of imageUrlsArray) {
      await db.query(
        `INSERT INTO property_images (property_id, image_url) VALUES ($1, $2)`,
        [propertyId, url],
      );
    }

    // --- RETURN FULL URLS ---
    const responseProperty = newProperty.rows[0];
    responseProperty.image_urls = imageUrlsArray.map(
      (url) => `${BASE_URL}${url}`,
    );

    res.status(201).json({
      message: "Property listed successfully!",
      property: responseProperty,
    });
  } catch (err) {
    console.error("PostgreSQL Error:", err.message);
    res.status(500).json({ error: "Database error", details: err.message });
  }
};

// ======================= GET ALL PROPERTIES =======================
exports.getAllProperties = async (req, res) => {
  try {
    const queryText = `
      SELECT 
        p.*,
        u.full_name AS owner_name,

        COALESCE(r.avg_rating, 0.0) AS average_rating,
        COALESCE(r.total_reviews, 0) AS total_reviews,

        pi.image_url AS thumbnail

      FROM properties p

      LEFT JOIN users u 
        ON p.owner_id = u.id

      LEFT JOIN (
        SELECT 
          owner_id::text AS owner_id,
          COALESCE(ROUND(AVG(rating)::numeric, 1), 0.0) AS avg_rating,
          COUNT(*)::int AS total_reviews
        FROM "Reviews"
        GROUP BY owner_id::text
      ) r 
      ON r.owner_id = p.owner_id::text

      LEFT JOIN LATERAL (
        SELECT image_url
        FROM property_images
        WHERE property_id::text = p.id::text
        LIMIT 1
      ) pi ON true

      WHERE (u.is_blocked = false OR u.is_blocked IS NULL)

      ORDER BY p.created_at DESC;
    `;

    const result = await db.query(queryText);

    // Map thumbnail to full URL
    result.rows.forEach((p) => {
      if (p.thumbnail) p.thumbnail = `${BASE_URL}${p.thumbnail}`;
    });

    res.json(result.rows);
  } catch (err) {
    console.error("❌ DATABASE CRASH DETAILS:", err.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: err.message,
    });
  }
};

// ======================= GET PROPERTIES BY OWNER =======================
exports.getPropertiesByOwner = async (req, res) => {
  try {
    const { owner_id } = req.params;

    const queryText = `
      SELECT p.*, 
      (SELECT image_url FROM property_images WHERE property_id = p.id LIMIT 1) as thumbnail,
      (SELECT array_agg(image_url) FROM property_images WHERE property_id = p.id) as image_urls
      FROM properties p 
      WHERE p.owner_id = $1
      ORDER BY p.created_at DESC
    `;

    const result = await db.query(queryText, [owner_id]);

    // Map image URLs to full paths
    result.rows.forEach((p) => {
      if (p.thumbnail) p.thumbnail = `${BASE_URL}${p.thumbnail}`;
      if (p.image_urls)
        p.image_urls = p.image_urls.map((url) => `${BASE_URL}${url}`);
    });

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Owner Fetch Error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ======================= UPDATE PROPERTY =======================
exports.updateProperty = async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    price,
    category,
    features,
    state,
    lga,
    city,
    street,
    landmark,
  } = req.body;

  const ownerId = req.user.id;
  let client;

  try {
    client = await db.connect();
    await client.query("BEGIN");

    const propertyCheck = await client.query(
      "SELECT * FROM properties WHERE id = $1 AND owner_id = $2",
      [id, ownerId],
    );

    if (propertyCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "Property not found or unauthorized." });
    }

    const currentProperty = propertyCheck.rows[0];
    const cleanPrice = price
      ? price.toString().replace(/,/g, "")
      : currentProperty.price;

    let pgFeatures = currentProperty.features;
    if (features) {
      try {
        const featuresArray =
          typeof features === "string" ? JSON.parse(features) : features;
        if (Array.isArray(featuresArray)) {
          pgFeatures = `{${featuresArray
            .map((f) => `"${f.replace(/"/g, '\\"')}"`)
            .join(",")}}`;
        }
      } catch (e) {
        console.error(e);
      }
    }

    const address = `${street || currentProperty.street}, ${city || currentProperty.city}, ${lga || currentProperty.lga}, ${state || currentProperty.state}`;

    // Handle images
    let finalImages = currentProperty.image_urls;
    if (req.files && req.files.length > 0) {
      const oldImages = await client.query(
        "SELECT image_url FROM property_images WHERE property_id = $1",
        [id],
      );
      for (const row of oldImages.rows) {
        const oldPath = path.join(__dirname, "..", row.image_url);
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch (e) {}
        }
      }

      await client.query("DELETE FROM property_images WHERE property_id = $1", [
        id,
      ]);

      const newPaths = req.files.map((file) => file.path.replace(/\\/g, "/"));
      finalImages = `{${newPaths.map((p) => `"${p}"`).join(",")}}`;

      for (const pathStr of newPaths) {
        await client.query(
          "INSERT INTO property_images (property_id, image_url) VALUES ($1, $2)",
          [id, pathStr],
        );
      }
    }

    const updatedProperty = await client.query(
      `UPDATE properties 
       SET title = COALESCE($1, title), description = COALESCE($2, description),
           price = COALESCE($3, price), category = COALESCE($4, category),
           features = COALESCE($5, features), state = COALESCE($6, state),
           lga = COALESCE($7, lga), city = COALESCE($8, city),
           street = COALESCE($9, street), landmark = COALESCE($10, landmark),
           address = COALESCE($11, address), image_urls = COALESCE($12, image_urls),
           updated_at = NOW()
       WHERE id = $13 AND owner_id = $14
       RETURNING *`,
      [
        title || null,
        description || null,
        cleanPrice || null,
        category || null,
        pgFeatures,
        state || null,
        lga || null,
        city || null,
        street || null,
        landmark || null,
        address || null,
        finalImages,
        id,
        ownerId,
      ],
    );

    if (cleanPrice) {
      const newCommission = parseFloat(cleanPrice) * 0.025;
      await client.query(
        `UPDATE property_commissions SET total_rent_price = $1, commission_due = $2 WHERE property_id = $3`,
        [cleanPrice, newCommission, id],
      );
    }

    await client.query("COMMIT");

    const result = updatedProperty.rows[0];
    if (result.image_urls) {
      result.image_urls = result.image_urls.map((url) => `${BASE_URL}${url}`);
    }

    res
      .status(200)
      .json({ message: "Property updated successfully", property: result });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    res
      .status(500)
      .json({ error: "Internal Server Error", details: err.message });
  } finally {
    if (client) client.release();
  }
};

// ======= KEEP ALL OTHER EXISTING FUNCTIONS AS IS =======
// deleteProperty, toggleVisibility, getAdminLeads, getUserWaitlist, addToWaitlist,
// removeFromWaitlist, logView, getViewed, addInquiry, getInquiriesByOwner,
// getNearbyProperties, getPropertyById, searchProperties, getPaidCommissions,
// getUnpaidCommissions, updateCommissionStatus

exports.deleteProperty = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // Extracted from JWT via verifyToken
  const userRole = req.user.role; // Extracted from JWT via verifyToken

  try {
    // 1. Fetch the property first to check existence and identify the owner
    const propertyCheck = await db.query(
      "SELECT * FROM properties WHERE id = $1",
      [id],
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({ error: "Property not found." });
    }

    const property = propertyCheck.rows[0];

    // 2. Authorization: Allow if the user is the Owner OR an Admin
    const isOwner = property.owner_id.toString() === userId.toString();
    const isAdmin = userRole === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(401).json({
        error:
          "Unauthorized. You do not have permission to delete this listing.",
      });
    }

    // 3. Fetch associated image paths to clean up server storage
    const imageQuery = await db.query(
      "SELECT image_url FROM property_images WHERE property_id = $1",
      [id],
    );

    // 4. Delete physical files from the filesystem
    if (imageQuery.rows.length > 0) {
      imageQuery.rows.forEach((row) => {
        // Ensure path logic points to your actual uploads folder
        const filePath = path.join(__dirname, "..", row.image_url);

        if (fs.existsSync(filePath)) {
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error(`Failed to delete file: ${filePath}`, err.message);
            }
          });
        }
      });
    }

    // 5. Database Cleanup (Atomic Deletion)
    // Delete dependent records first to avoid Foreign Key violations
    await db.query("DELETE FROM property_images WHERE property_id = $1", [id]);
    await db.query("DELETE FROM property_commissions WHERE property_id = $1", [
      id,
    ]);

    // Finally, delete the main property record
    const deleteResult = await db.query(
      "DELETE FROM properties WHERE id = $1",
      [id],
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: "Property could not be deleted." });
    }

    res.status(200).json({
      success: true,
      message: "Property and associated files deleted successfully.",
    });
  } catch (err) {
    console.error("Delete Error:", err.message);
    res.status(500).json({ error: "Internal server error during deletion." });
  }
};
exports.toggleVisibility = async (req, res) => {
  const { id } = req.params;
  const { is_hidden } = req.body; // Flutter sends {"is_hidden": true/false}

  try {
    const result = await db.query(
      "UPDATE properties SET is_hidden = $1 WHERE id = $2 RETURNING is_hidden",
      [is_hidden, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Property not found" });
    }

    res.status(200).json({
      message: "Visibility updated",
      is_hidden: result.rows[0].is_hidden,
    });
  } catch (err) {
    console.error("Visibility Toggle Error:", err);
    res.status(500).json({ error: "Database error" });
  }
};

// ✅ Get all seeker leads for the admin dashboard
// ... keep your existing db imports ...

/**
 * @desc    Get ALL leads for Admin screen (Your existing code)
 */
exports.getAdminLeads = async (req, res) => {
  try {
    const result = await db.query(`
            SELECT 
                w.id AS lead_id,
                u.full_name AS seeker_name, 
                u.phone AS seeker_phone,
                u.email AS seeker_email,
                p.title AS property_title,
                w.created_at
            FROM waitlist w
            JOIN users u ON w.user_id = u.id
            JOIN properties p ON w.property_id = p.id
            ORDER BY w.created_at DESC
        `);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Leads Fetch Error:", error.message);
    res.status(500).json({
      message: "Error fetching leads",
      error: error.message,
    });
  }
};

/**
 * ✅ NEW: Get Waitlist for CURRENT seeker only
 * @route   GET /api/properties/waitlist
 */
exports.getUserWaitlist = async (req, res) => {
  try {
    const user_id = req.user.id; // This is the UUID from verifyToken

    // We MUST join with properties to get the full data for the Seeker
    // UPDATED: Added owner rating to waitlist view
    const result = await db.query(
      `
      SELECT 
        p.*,
        u.full_name AS owner_name,
        u.average_rating,
        u.total_reviews
      FROM properties p
      INNER JOIN waitlist w ON p.id = w.property_id
      JOIN users u ON p.owner_id = u.id
      WHERE w.user_id = $1
    `,
      [user_id],
    );

    console.log(
      `Fetched ${result.rows.length} waitlist items for user ${user_id}`,
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Sync Error:", error.message);
    res.status(500).json({ error: "Failed to fetch your saved properties" });
  }
};

/**
 * @desc    Add property to waitlist (Your existing code)
 */
exports.addToWaitlist = async (req, res) => {
  try {
    const { property_id } = req.body;
    const user_id = req.user.id;

    if (!property_id) {
      return res.status(400).json({ error: "Property ID is required" });
    }

    const existing = await db.query(
      "SELECT * FROM waitlist WHERE user_id = $1 AND property_id = $2",
      [user_id, property_id],
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({ message: "Already in waitlist" });
    }

    await db.query(
      "INSERT INTO waitlist (user_id, property_id) VALUES ($1, $2)",
      [user_id, property_id],
    );

    res.status(201).json({ success: true, message: "Lead created" });
  } catch (error) {
    console.error("Waitlist Add Error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * @desc    Remove property from waitlist (Your existing code)
 */
exports.removeFromWaitlist = async (req, res) => {
  try {
    const { property_id } = req.params;
    const user_id = req.user.id;

    await db.query(
      "DELETE FROM waitlist WHERE user_id = $1 AND property_id = $2",
      [user_id, property_id],
    );

    res.status(200).json({ success: true, message: "Lead removed" });
  } catch (error) {
    console.error("Waitlist Remove Error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * ✅ NEW: Log a property view
 * @route   POST /api/properties/viewed
 */
exports.logView = async (req, res) => {
  try {
    const { property_id } = req.body;
    const user_id = req.user.id;

    // Use UPSERT (Update or Insert) to refresh the viewed_at timestamp
    await db.query(
      `
      INSERT INTO property_views (user_id, property_id) 
      VALUES ($1, $2) 
      ON CONFLICT (user_id, property_id) 
      DO UPDATE SET viewed_at = NOW()
    `,
      [user_id, property_id],
    );

    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * ✅ NEW: Get recently viewed for Seeker
 * @route   GET /api/properties/viewed
 */
exports.getViewed = async (req, res) => {
  try {
    const user_id = req.user.id;

    // UPDATED: Join with users to provide owner info for recently viewed items
    const result = await db.query(
      `
      SELECT p.*,
      u.full_name AS owner_name,
      u.average_rating,
      u.total_reviews
      FROM properties p
      JOIN property_views v ON p.id = v.property_id::uuid
      JOIN users u ON p.owner_id = u.id
      WHERE v.user_id = $1::uuid
      ORDER BY v.viewed_at DESC 
      LIMIT 10
      `,
      [user_id],
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ Database Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};
/**
 * @desc    Create a new inquiry (Matches your table schema)
 */
exports.addInquiry = async (req, res) => {
  const { property_id, message, contact_phone } = req.body;
  const seeker_id = req.user.id; // From verifyToken

  try {
    const result = await db.query(
      `INSERT INTO inquiries (property_id, seeker_id, message, contact_phone) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
      [property_id, seeker_id, message, contact_phone],
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Inquiry Insert Error:", error.message);
    res.status(500).json({ error: "Failed to send inquiry" });
  }
};

/**
 * @desc    Get inquiries for a specific owner
 */
exports.getInquiriesByOwner = async (req, res) => {
  const { owner_id } = req.params;

  try {
    const result = await db.query(
      `
            SELECT 
                i.id AS inquiry_id,
                i.message,
                i.seeker_id,   -- Added seeker_id for internal chat linking
                i.contact_phone,
                i.status,
                i.created_at,
                u.full_name AS seeker_name,
                u.email AS seeker_email,
                p.title AS property_title,
                p.location
            FROM inquiries i
            JOIN users u ON i.seeker_id = u.id 
            JOIN properties p ON i.property_id = p.id
            WHERE p.owner_id = $1
            ORDER BY i.created_at DESC
        `,
      [owner_id],
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Fetch Inquiries Error:", error.message);
    res.status(500).json({ error: "Failed to fetch inquiries" });
  }
};
exports.getNearbyProperties = async (req, res) => {
  // lat/lng from user's current location, radius in kilometers
  const { lat, lng, radius = 10 } = req.query;

  if (!lat || !lng) {
    return res
      .status(400)
      .json({ error: "Location coordinates are required." });
  }

  try {
    const nearbyProperties = await db.query(
      `SELECT *, (
          6371 * acos(
            cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2)) + 
            sin(radians($1)) * sin(radians(latitude))
          )
        ) AS distance_km
        FROM properties
        WHERE status = 'active' 
        AND latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND (
          6371 * acos(
            cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2)) + 
            sin(radians($1)) * sin(radians(latitude))
          )
        ) <= $3
        ORDER BY distance_km ASC
        LIMIT 25`,
      [lat, lng, radius],
    );

    res.status(200).json({
      success: true,
      count: nearbyProperties.rows.length,
      data: nearbyProperties.rows,
    });
  } catch (err) {
    console.error("Nearby search error:", err.message);
    res.status(500).json({ error: "Failed to fetch nearby listings." });
  }
};
