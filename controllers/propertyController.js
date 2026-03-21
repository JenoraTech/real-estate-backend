const BASE_URL = "https://real-estate-backend-4kfq.onrender.com/";
const db = require("../config/db");
const fs = require("fs");
const path = require("path");

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
          pgFeatures = `{${parsedFeatures.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(",")}}`;
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
      LEFT JOIN users u ON p.owner_id = u.id
      LEFT JOIN (
        SELECT 
          owner_id::text AS owner_id,
          COALESCE(ROUND(AVG(rating)::numeric, 1), 0.0) AS avg_rating,
          COUNT(*)::int AS total_reviews
        FROM "Reviews"  -- ✅ Fixed: Wrapped in quotes for case-sensitivity
        GROUP BY owner_id::text
      ) r ON r.owner_id::text = p.owner_id::text
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM property_images
        WHERE property_id::text = p.id::text -- ✅ Safety: Cast to text for matching
        LIMIT 1
      ) pi ON true
      WHERE (u.is_blocked = false OR u.is_blocked IS NULL)
      ORDER BY p.created_at DESC;
    `;

    const result = await db.query(queryText);

    // Map through results to append the BASE_URL to the thumbnail path
    result.rows.forEach((p) => {
      if (p.thumbnail) {
        // Ensure we don't double-append if path already contains BASE_URL
        if (!p.thumbnail.startsWith("http")) {
          p.thumbnail = `${BASE_URL}${p.thumbnail}`;
        }
      }
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
// ======================= SEARCH PROPERTIES =======================
exports.searchProperties = async (req, res) => {
  try {
    const { location, category, minPrice, maxPrice } = req.query;
    let query = `
      SELECT p.*, u.full_name AS owner_name,
      (SELECT image_url FROM property_images WHERE property_id = p.id LIMIT 1) as thumbnail
      FROM properties p
      JOIN users u ON p.owner_id = u.id
      WHERE (u.is_blocked = false OR u.is_blocked IS NULL)
    `;
    const params = [];

    if (location) {
      params.push(`%${location}%`);
      query += ` AND (p.location ILIKE $${params.length} OR p.city ILIKE $${params.length} OR p.state ILIKE $${params.length})`;
    }
    if (category) {
      params.push(category);
      query += ` AND p.category = $${params.length}`;
    }
    if (minPrice) {
      params.push(minPrice);
      query += ` AND p.price >= $${params.length}`;
    }
    if (maxPrice) {
      params.push(maxPrice);
      query += ` AND p.price <= $${params.length}`;
    }

    query += " ORDER BY p.created_at DESC";
    const result = await db.query(query, params);

    result.rows.forEach((p) => {
      if (p.thumbnail) p.thumbnail = `${BASE_URL}${p.thumbnail}`;
    });

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    result.rows.forEach((p) => {
      if (p.thumbnail) p.thumbnail = `${BASE_URL}${p.thumbnail}`;
      if (p.image_urls)
        p.image_urls = p.image_urls.map((url) => `${BASE_URL}${url}`);
    });
    res.json(result.rows);
  } catch (err) {
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
    client = await db.pool.connect();
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
          pgFeatures = `{${featuresArray.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(",")}}`;
        }
      } catch (e) {}
    }

    const address = `${street || currentProperty.street}, ${city || currentProperty.city}, ${lga || currentProperty.lga}, ${state || currentProperty.state}`;

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
    if (result.image_urls)
      result.image_urls = result.image_urls.map((url) => `${BASE_URL}${url}`);
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

// ======================= DELETE PROPERTY =======================
exports.deleteProperty = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const propertyCheck = await db.query(
      "SELECT * FROM properties WHERE id = $1",
      [id],
    );
    if (propertyCheck.rows.length === 0)
      return res.status(404).json({ error: "Property not found." });

    const property = propertyCheck.rows[0];
    const isOwner = property.owner_id.toString() === userId.toString();
    if (!isOwner && userRole !== "admin") {
      return res.status(401).json({ error: "Unauthorized deletion attempt." });
    }

    const imageQuery = await db.query(
      "SELECT image_url FROM property_images WHERE property_id = $1",
      [id],
    );
    imageQuery.rows.forEach((row) => {
      const filePath = path.join(__dirname, "..", row.image_url);
      if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
    });

    await db.query("DELETE FROM property_images WHERE property_id = $1", [id]);
    await db.query("DELETE FROM property_commissions WHERE property_id = $1", [
      id,
    ]);
    await db.query("DELETE FROM properties WHERE id = $1", [id]);

    res
      .status(200)
      .json({ success: true, message: "Property deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: "Internal server error during deletion." });
  }
};

// ======================= UTILITY METHODS =======================
exports.toggleVisibility = async (req, res) => {
  const { id } = req.params;
  const { is_hidden } = req.body;
  try {
    const result = await db.query(
      "UPDATE properties SET is_hidden = $1 WHERE id = $2 RETURNING is_hidden",
      [is_hidden, id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Property not found" });
    res.status(200).json({
      message: "Visibility updated",
      is_hidden: result.rows[0].is_hidden,
    });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
};

exports.getAdminLeads = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT w.id AS lead_id, u.full_name AS seeker_name, u.phone AS seeker_phone, u.email AS seeker_email,
             p.title AS property_title, w.created_at
      FROM waitlist w JOIN users u ON w.user_id = u.id JOIN properties p ON w.property_id = p.id
      ORDER BY w.created_at DESC`);
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addToWaitlist = async (req, res) => {
  try {
    const { property_id } = req.body;
    const user_id = req.user.id;
    const existing = await db.query(
      "SELECT * FROM waitlist WHERE user_id = $1 AND property_id = $2",
      [user_id, property_id],
    );
    if (existing.rows.length > 0)
      return res.status(200).json({ message: "Already in waitlist" });
    await db.query(
      "INSERT INTO waitlist (user_id, property_id) VALUES ($1, $2)",
      [user_id, property_id],
    );
    res.status(201).json({ success: true, message: "Lead created" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.removeFromWaitlist = async (req, res) => {
  try {
    const { property_id } = req.params;
    const user_id = req.user.id;
    await db.query(
      "DELETE FROM waitlist WHERE user_id = $1 AND property_id = $2",
      [user_id, property_id],
    );
    res.json({ message: "Removed from waitlist" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.logView = async (req, res) => {
  try {
    const { property_id } = req.body;
    await db.query(
      `INSERT INTO property_views (user_id, property_id) VALUES ($1, $2) 
       ON CONFLICT (user_id, property_id) DO UPDATE SET viewed_at = NOW()`,
      [req.user.id, property_id],
    );
    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getViewed = async (req, res) => {
  try {
    const user_id = req.user.id;
    const result = await db.query(
      `
      SELECT p.* FROM property_views pv 
      JOIN properties p ON pv.property_id = p.id 
      WHERE pv.user_id = $1 
      ORDER BY pv.viewed_at DESC`,
      [user_id],
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserWaitlist = async (req, res) => {
  try {
    const user_id = req.user.id;
    const result = await db.query(
      `
      SELECT p.* FROM waitlist w 
      JOIN properties p ON w.property_id = p.id 
      WHERE w.user_id = $1`,
      [user_id],
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;

    // We use ::text casting on IDs to ensure UUIDs and Strings match correctly
    // We wrap "Reviews" in double quotes for case-sensitivity
    const queryText = `
      SELECT 
        p.*, 
        u.full_name AS owner_name, 
        u.phone AS owner_phone, 
        u.email AS owner_email,
        (
          SELECT array_agg(image_url) 
          FROM property_images 
          WHERE property_id::text = p.id::text
        ) as image_urls,
        (
          SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0.0) 
          FROM "Reviews" 
          WHERE property_id::text = p.id::text
        ) as average_rating
      FROM properties p 
      JOIN users u ON p.owner_id::text = u.id::text 
      WHERE p.id::text = $1
    `;

    const result = await db.query(queryText, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Property not found" });
    }

    const property = result.rows[0];

    // Clean up image URLs to ensure they have the full backend path
    if (property.image_urls) {
      property.image_urls = property.image_urls.map((url) => {
        if (url.startsWith("http")) return url; // Already a full URL
        return `${BASE_URL}${url.replace(/\\/g, "/")}`; // Convert backslashes for web safety
      });
    }

    res.json(property);
  } catch (err) {
    console.error("❌ GET PROPERTY BY ID ERROR:", err.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: err.message,
    });
  }
};
exports.getPaidCommissions = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM property_commissions WHERE status = 'paid'",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUnpaidCommissions = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM property_commissions WHERE status = 'unpaid'",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getInquiriesByOwner = async (req, res) => {
  try {
    const { owner_id } = req.params;
    const result = await db.query(
      "SELECT * FROM inquiries WHERE owner_id = $1 ORDER BY created_at DESC",
      [owner_id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addInquiry = async (req, res) => {
  try {
    const { property_id, owner_id, message } = req.body;
    const seeker_id = req.user.id;
    const result = await db.query(
      "INSERT INTO inquiries (property_id, owner_id, seeker_id, message, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
      [property_id, owner_id, seeker_id, message],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateCommissionStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await db.query(
      "UPDATE property_commissions SET status = $1 WHERE id = $2 RETURNING *",
      [status, id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
