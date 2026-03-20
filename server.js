require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http"); // Required for Socket.io

// --- Database Integration ---
// Using your config/db.js which now points to Supabase
const db = require("./config/db");
const db_pg = db.sequelize; // Use the Sequelize instance for raw queries to share the connection pool

// --- Sequelize Models ---
const Property = db.Property;

// --- Route Imports ---
const chatRoutes = require("./routes/chatRoutes");
const authRoutes = require("./routes/authRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const server = http.createServer(app);

// --- Socket.io Integration ---
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// A map to track which User ID is on which Socket ID
const userSocketMap = {};

// ✅ Updated Helper: Uses Sequelize for Supabase Compatibility
const updateLastSeen = async (userId, isOnline) => {
  if (!userId || userId === "UNKNOWN_USER") return;
  try {
    const query = `
      UPDATE users 
      SET last_seen = NOW(), is_online = :isOnline 
      WHERE id::text = :userId OR new_id::text = :userId
    `;
    await db_pg.query(query, {
      replacements: { isOnline, userId },
      type: db.Sequelize.QueryTypes.UPDATE,
    });
    console.log(
      `🗄️ Supabase Updated: User ${userId} is ${isOnline ? "Active" : "Away"}`,
    );
  } catch (err) {
    console.error("❌ Error updating last_seen in Supabase:", err.message);
  }
};

io.on("connection", (socket) => {
  console.log("⚡ New connection:", socket.id);

  const userId = socket.handshake.query.userId;
  if (userId) {
    userSocketMap[userId] = socket.id;
    socket.join(userId);
    console.log(`✅ User ${userId} connected to app via handshake`);
  }

  socket.on("identify", (id) => {
    if (userSocketMap[id] !== socket.id) {
      userSocketMap[id] = socket.id;
      socket.join(id);
      console.log(`🆔 User ${id} linked to socket ${socket.id}`);
    }
  });

  socket.on("join_chat", (data) => {
    const myId = data.myUserId || data.userId;
    if (myId) {
      console.log(`📖 User ${myId} entered chat screen.`);
      updateLastSeen(myId, true);
      io.emit("user_status_update", {
        userId: myId,
        online: true,
        last_seen: new Date().toISOString(),
      });
    }
  });

  socket.on("leave_chat", (data) => {
    const myId = data.myUserId || data.userId;
    if (myId) {
      console.log(`🚪 User ${myId} left chat screen.`);
      updateLastSeen(myId, false);
      io.emit("user_status_update", {
        userId: myId,
        online: false,
        last_seen: new Date().toISOString(),
      });
    }
  });

  socket.on("send_message", (data) => {
    const receiverId = data.receiver_id || data.receiverId;
    console.log(`📩 Message from ${data.sender_id} to ${receiverId}`);
    updateLastSeen(data.sender_id, true);
    socket.to(receiverId).emit("new_message", data);
    socket.to(data.sender_id).emit("new_message", data);
  });

  socket.on("disconnect", () => {
    const disconnectedUserId = Object.keys(userSocketMap).find(
      (key) => userSocketMap[key] === socket.id,
    );
    if (disconnectedUserId) {
      console.log(`🔴 User ${disconnectedUserId} disconnected`);
      updateLastSeen(disconnectedUserId, false);
      delete userSocketMap[disconnectedUserId];
      io.emit("user_status_update", {
        userId: disconnectedUserId,
        online: false,
        last_seen: new Date().toISOString(),
      });
    }
  });
});

// --- Middleware ---
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    credentials: true,
  }),
);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads/chat", express.static(path.join(__dirname, "uploads/chat")));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// --- Health Check ---
app.get("/test-db", async (req, res) => {
  try {
    const [result] = await db_pg.query("SELECT NOW()");
    res.json({
      message: "Supabase Connected!",
      server_time: result[0].now,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Database connection failed", details: err.message });
  }
});

// --- API Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/properties", require("./routes/propertyRoutes"));
app.use("/api/inquiries", require("./routes/inquiryRoutes"));
app.use("/api/chat", chatRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/admin", adminRoutes);

// --- Revenue Tracking & Contact Logic ---
app.post("/api/contact-log", async (req, res) => {
  const { seeker_id, owner_id, property_id, price } = req.body;
  const COMMISSION_RATE = 0.025;
  const owner_commission = price * COMMISSION_RATE;
  const seeker_commission = price * COMMISSION_RATE;
  const total_admin_revenue = owner_commission + seeker_commission;

  try {
    const [result] = await db_pg.query(
      `INSERT INTO interest_logs 
      (seeker_id, owner_id, property_id, owner_commission_rate, seeker_commission_rate, total_admin_revenue, status) 
      VALUES (:seeker_id, :owner_id, :property_id, 2.5, 2.5, :revenue, 'pending') RETURNING *`,
      {
        replacements: {
          seeker_id,
          owner_id,
          property_id,
          revenue: total_admin_revenue,
        },
      },
    );

    res.status(201).json({
      message: "Contact logged. Service charges calculated.",
      data: {
        log: result[0],
        breakdown: {
          owner_fee: owner_commission,
          seeker_fee: seeker_commission,
          total_payable_by_seeker: parseFloat(price) + seeker_commission,
        },
      },
    });
  } catch (err) {
    console.error("Tracking Error:", err.message);
    res.status(500).json({ error: "Failed to log transaction revenue." });
  }
});

// --- Root & Error Handlers ---
app.get("/", (req, res) =>
  res.send("🚀 Real Estate API is running on Supabase..."),
);
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err.stack);
  res
    .status(500)
    .json({ error: "Internal Server Error", message: err.message });
});

// --- Server Startup ---
const PORT = process.env.PORT || 5000;

db.sequelize
  .authenticate()
  .then(() => {
    console.log("🚀 Database (Sequelize) connected successfully.");
    // sync({ alter: false }) protects your cloud data
    return db.sequelize.sync({ alter: false });
  })
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`\n==============================================`);
      console.log(`🚀 Server active on Port: ${PORT}`);
      console.log(`💰 Commission: 2.5% Owner / 2.5% Seeker`);
      console.log(`📡 Socket.io: Enabled with Cloud Compatibility`);
      console.log(`==============================================\n`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  });

// Handle Port cleanup on restart
process.on("SIGINT", () => {
  server.close(() => {
    console.log("\n🛑 Port 5000 released.");
    process.exit(0);
  });
});
