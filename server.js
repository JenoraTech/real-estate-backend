require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const db = require("./config/db"); // Using the clean pg pool from your previous update

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

const userSocketMap = {};

// ✅ Clean PG Helper: No Sequelize replacements
const updateLastSeen = async (userId, isOnline) => {
  if (!userId || userId === "UNKNOWN_USER") return;
  try {
    const query = `
      UPDATE users 
      SET last_seen = NOW(), is_online = $1 
      WHERE id::text = $2 OR new_id::text = $2
    `;
    await db.query(query, [isOnline, userId]);
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
    updateLastSeen(data.sender_id, true);
    socket.to(receiverId).emit("new_message", data);
    socket.to(data.sender_id).emit("new_message", data);
  });

  socket.on("disconnect", () => {
    const disconnectedUserId = Object.keys(userSocketMap).find(
      (key) => userSocketMap[key] === socket.id,
    );
    if (disconnectedUserId) {
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
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ✅ STATIC FILE SERVING
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  "/uploads/properties",
  express.static(path.join(__dirname, "uploads/properties")),
);
app.use("/uploads/chat", express.static(path.join(__dirname, "uploads/chat")));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// --- Health Check ---
app.get("/test-db", async (req, res) => {
  try {
    const result = await db.query("SELECT NOW()");
    res.json({
      message: "Supabase Connected via PG Pool!",
      server_time: result.rows[0].now,
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

// --- Revenue Tracking ---
app.post("/api/contact-log", async (req, res) => {
  const { seeker_id, owner_id, property_id, price } = req.body;
  const COMMISSION_RATE = 0.025;
  const owner_fee = price * COMMISSION_RATE;
  const seeker_fee = price * COMMISSION_RATE;
  const total_revenue = owner_fee + seeker_fee;

  try {
    const result = await db.query(
      `INSERT INTO interest_logs 
      (seeker_id, owner_id, property_id, owner_commission_rate, seeker_commission_rate, total_admin_revenue, status) 
      VALUES ($1, $2, $3, 2.5, 2.5, $4, 'pending') RETURNING *`,
      [seeker_id, owner_id, property_id, total_revenue],
    );

    res.status(201).json({
      message: "Contact logged successfully.",
      data: {
        log: result.rows[0],
        breakdown: {
          owner_fee,
          seeker_fee,
          total_payable_by_seeker: parseFloat(price) + seeker_fee,
        },
      },
    });
  } catch (err) {
    console.error("Tracking Error:", err.message);
    res.status(500).json({ error: "Failed to log transaction revenue." });
  }
});

app.get("/", (req, res) =>
  res.send("🚀 Real Estate API is running on Supabase (PG)..."),
);
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

// --- Server Startup ---
const PORT = process.env.PORT || 5000;

// Simple connection check using the PG Pool
db.query("SELECT 1")
  .then(() => {
    console.log("🚀 Database (PostgreSQL Pool) connected successfully.");
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`\n==============================================`);
      console.log(`🚀 Server active on Port: ${PORT}`);
      console.log(`💰 Commission: 2.5% Owner / 2.5% Seeker`);
      console.log(`📡 Socket.io: Enabled`);
      console.log(`==============================================\n`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  });

process.on("SIGINT", () => {
  server.close(() => {
    console.log("\n🛑 Port 5000 released.");
    process.exit(0);
  });
});
