const { Pool } = require("pg");
require("dotenv").config();

// Initialize the Postgres Pool (Direct connection, no ORM overhead)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase/Render
  },
});

// Test DB connection immediately on startup
pool.connect((err, client, release) => {
  if (err) {
    return console.error("❌ Database connection failed:", err.stack);
  }
  console.log("✅ Database connected successfully (Standard SQL Mode)");
  release();
});

// We export a simple query object so you can use db.query() everywhere
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool: pool,
};
