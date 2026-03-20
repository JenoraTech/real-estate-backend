const pool = require("../config/db"); // This is for your raw SQL queries
const db = require("../config/db"); // Add this line so 'db' is defined
// Use this to keep your existing code working with Sequelize
const db_pg = db.sequelize;

// Helper Regex for UUID validation (Standardized for all functions)
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1. Send a Message (Standardized for 'content' column and 'receiver_id')
exports.sendMessage = async (req, res) => {
  // SAFETY CHECK: In Multipart requests, fields are in req.body, files are in req.file
  if (!req.body || (Object.keys(req.body).length === 0 && !req.file)) {
    console.error("❌ sendMessage Error: Request body and file are missing.");
    return res.status(400).json({ error: "Request body is missing" });
  }

  // 🛡️ CRASH PROTECTION: Ensure req.user exists from the middleware
  if (!req.user || !req.user.id) {
    console.error(
      "❌ sendMessage Error: User not authenticated (req.user is undefined)",
    );
    return res
      .status(401)
      .json({ error: "Authentication failed. User not identified." });
  }

  // Extract fields from req.body
  const {
    client_id,
    clientId,
    receiver_id,
    message_text,
    content,
    reply_to_text,
    reply_to_message_id,
    is_urgent,
    created_at,
    audio_duration,
    message_type: body_message_type,
    media_url: body_media_url,
  } = req.body;

  let message_type = body_message_type;
  let media_url = body_media_url;

  // ✅ Handle File Upload via Multer
  if (req.file) {
    // Generate relative path for DB storage
    media_url = `/uploads/chat/${req.file.filename}`;

    if (!message_type || message_type === "text") {
      if (req.file.mimetype.startsWith("image/")) {
        message_type = "image";
      } else if (req.file.mimetype.startsWith("audio/")) {
        message_type = "audio";
      } else if (req.file.mimetype.startsWith("video/")) {
        message_type = "video";
      } else {
        message_type = "file";
      }
    }
  }

  const final_client_id = client_id || clientId || null;
  const final_content = content || message_text || "";
  const sender_id = req.user.id;
  const target_receiver_id = receiver_id;
  const timestamp = created_at || new Date().toISOString();

  // Safety Guard: prevent crash if receiver_id is "undefined", null, or invalid UUID
  if (
    !target_receiver_id ||
    target_receiver_id === "undefined" ||
    !uuidRegex.test(target_receiver_id)
  ) {
    console.error(
      `❌ sendMessage Blocked: Invalid receiver_id format: "${receiver_id}"`,
    );
    return res
      .status(400)
      .json({ error: "Invalid receiver_id format. A valid UUID is required." });
  }

  try {
    // A. Duplicate Check via client_id
    if (final_client_id) {
      const checkDuplicate = await pool.query(
        `SELECT * FROM messages WHERE client_id = $1`,
        [final_client_id],
      );
      if (checkDuplicate && checkDuplicate.rows.length > 0) {
        return res.status(200).json(checkDuplicate.rows[0]);
      }
    }

    // B. Check if receiver is online to set status
    const receiverStatus = await pool.query(
      "SELECT is_online FROM users WHERE id = $1",
      [target_receiver_id],
    );

    const isOnline = receiverStatus.rows[0]?.is_online || false;
    const initialStatus = isOnline ? 2 : 1;
    const finalReplyId =
      reply_to_message_id && reply_to_message_id !== "null"
        ? reply_to_message_id
        : null;

    // ✅ FIX: Ensure audio_duration is a valid integer or null
    const finalAudioDuration = audio_duration ? parseInt(audio_duration) : null;

    // C. Insert using the 'content' column
    const newMessage = await pool.query(
      `INSERT INTO messages (
        client_id, sender_id, receiver_id, content, reply_to_text, 
        reply_to_message_id, is_urgent, created_at, status,
        message_type, media_url, audio_duration, is_read
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
      RETURNING *`, // ✅ Added $13 here
      [
        final_client_id,
        sender_id,
        target_receiver_id,
        final_content,
        reply_to_text || null,
        finalReplyId,
        is_urgent === true || is_urgent === 1 || is_urgent === "true",
        timestamp,
        initialStatus,
        message_type || "text",
        media_url || null,
        finalAudioDuration,
        false, // This is the 13th value (is_read)
      ],
    );

    res.status(201).json(newMessage.rows[0]);
  } catch (err) {
    console.error("❌ SQL Error in sendMessage:", err.message);
    if (err.code === "22P02" || err.message.includes("uuid")) {
      return res.status(400).json({
        error: "Invalid UUID format. Check sender_id or receiver_id.",
        details: err.message,
      });
    }
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
};

// 2. Get Chat History (Standardized with UUID Safety)
exports.getChatHistory = async (req, res) => {
  const myId = req.user.id;
  const otherUserId = req.params.receiverId;

  // 1. Validation for UUID strings using Regex
  if (
    !otherUserId ||
    otherUserId === "undefined" ||
    !uuidRegex.test(otherUserId)
  ) {
    console.error("⚠️ Invalid receiverId received:", otherUserId);
    return res
      .status(400)
      .json({ error: "Invalid receiver ID format. Valid UUID required." });
  }

  // 2. Pagination handling
  const before = req.query.before || "9999-12-31T23:59:59Z";
  const limit = parseInt(req.query.limit) || 20;

  try {
    // 3. Optimized Query
    const query = `
      SELECT 
        id, sender_id, receiver_id, content, content AS message_text, 
        message_type, media_url, is_read, status, created_at
      FROM messages 
      WHERE ((sender_id = $1 AND receiver_id = $2) 
          OR (sender_id = $2 AND receiver_id = $1))
        AND created_at < $3
      ORDER BY created_at DESC 
      LIMIT $4
    `;

    const history = await pool.query(query, [myId, otherUserId, before, limit]);

    console.log(
      `📜 Fetched ${history.rows.length} messages between ${myId} and ${otherUserId}`,
    );
    res.status(200).json(history.rows);
  } catch (err) {
    console.error("❌ SQL Error in getChatHistory:", err.message);
    res.status(500).json({ error: "Server error while fetching chat history" });
  }
};

// 3. Detailed Conversation List (Inbox View - Optimized with DISTINCT ON)
exports.getDetailedConversations = async (req, res) => {
  const myId = req.user.id;

  try {
    const query = `
      WITH LatestMessages AS (
        SELECT DISTINCT ON (
          CASE 
            WHEN sender_id = $1 THEN receiver_id 
            ELSE sender_id 
          END
        )
        id AS message_id, -- Renamed to avoid confusion with user id
        CASE 
          WHEN sender_id = $1 THEN receiver_id 
          ELSE sender_id 
        END AS other_user_id,
        content,
        created_at,
        is_read,
        status,
        message_type,
        is_urgent,
        client_id
      FROM messages
      WHERE sender_id = $1 OR receiver_id = $1
      ORDER BY 
        CASE 
          WHEN sender_id = $1 THEN receiver_id 
          ELSE sender_id 
        END, 
        created_at DESC
      )
      SELECT 
        lm.message_id,
        lm.other_user_id AS peer_id, -- ✅ EXPLICIT UUID FOR FLUTTER
        lm.other_user_id AS receiver_uuid, -- Alias for backward compatibility
        lm.content AS message_text,
        lm.content AS last_message,
        lm.created_at AS last_message_time,
        lm.status AS last_message_status,
        lm.is_urgent AS last_message_urgent,
        lm.client_id AS last_message_client_id,
        lm.message_type AS last_message_type,
        u.full_name,
        u.user_role,
        u.is_online,
        u.last_seen,
        u.profile_image_url
      FROM LatestMessages lm
      JOIN users u ON u.id = lm.other_user_id
      ORDER BY lm.created_at DESC;
    `;

    const result = await pool.query(query, [myId]);

    console.log(
      `✅ Found ${result.rows.length} detailed conversations for user ${myId}`,
    );

    // Log the first row to verify the UUID is present
    if (result.rows.length > 0) {
      console.log("Sample Peer ID:", result.rows[0].peer_id);
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("❌ SQL Error in getDetailedConversations:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};
// 4. Update Status to Read (Standardized with UUID Safety)
exports.markAsRead = async (req, res) => {
  const myId = req.user.id;
  const { senderId } = req.body;

  if (!senderId || !uuidRegex.test(senderId)) {
    console.error(
      `⚠️ markAsRead rejected: Invalid senderId format received: "${senderId}"`,
    );
    return res.status(400).json({ error: "A valid UUID senderId is required" });
  }

  try {
    const result = await pool.query(
      `UPDATE messages 
       SET status = 3, is_read = true 
       WHERE receiver_id = $1 
         AND sender_id = $2 
         AND is_read = false`,
      [myId, senderId],
    );

    console.log(
      `📖 [MarkRead] User ${myId} read messages from ${senderId}. Updated: ${result.rowCount} rows.`,
    );

    res.status(200).json({
      success: true,
      updatedCount: result.rowCount,
    });
  } catch (err) {
    console.error("❌ SQL Error in markAsRead:", err.message);
    res.status(500).json({ error: "Failed to update status" });
  }
};

// 5. Get User Presence (Online / Last Seen)
exports.getUserPresence = async (req, res) => {
  const { userId } = req.params;

  if (!userId || !uuidRegex.test(userId)) {
    return res.status(400).json({ error: "Invalid User UUID format" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, is_online, last_seen 
       FROM users 
       WHERE id = $1`,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      userId: rows[0].id,
      is_online: rows[0].is_online,
      last_seen: rows[0].last_seen,
    });
  } catch (err) {
    console.error("❌ SQL Error in getUserPresence:", err.message);
    res.status(500).json({ error: "Failed to fetch user presence" });
  }
};

// 6. Delete Message (Hard Delete)
exports.deleteMessage = async (req, res) => {
  const myId = req.user.id;
  const messageId = req.params.id;

  try {
    const result = await pool.query(
      `DELETE FROM messages 
       WHERE (id::text = $1 OR client_id = $1) 
       AND sender_id = $2`,
      [messageId.toString(), myId],
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ error: "Message not found or unauthorized" });
    }

    res
      .status(200)
      .json({ success: true, message: "Message deleted successfully" });
  } catch (err) {
    console.error("❌ SQL Error in deleteMessage:", err.message);
    res.status(500).json({ error: "Failed to delete message" });
  }
};
