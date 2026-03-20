require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const db = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: String(process.env.DB_PASSWORD),
  port: process.env.DB_PORT,
});

const setupAdmin = async () => {
  // CONFIGURATION: Using your exact column names
  const adminEmail = "jenoraestateapp@gmail.com";
  const adminPass = "Salome88.";
  const fullName = "Estate Main Admin";
  const userRole = "admin"; // Matches your user_role column

  try {
    console.log("Connecting to real_estate database...");
    const hashedPassword = await bcrypt.hash(adminPass, 10);

    // SQL matching your specific schema:
    // email, password_hash, full_name, user_role, is_blocked
    const query = `
      INSERT INTO users (email, password_hash, full_name, user_role, is_blocked, is_verified) 
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email;
    `;

    const values = [
      adminEmail,
      hashedPassword,
      fullName,
      userRole,
      false,
      true,
    ];

    const res = await db.query(query, values);

    console.log("-----------------------------------------");
    console.log("🚀 ESTATE ADMIN CREATED SUCCESSFULLY!");
    console.log(`Email: ${res.rows[0].email}`);
    console.log(`Password: ${adminPass}`);
    console.log("-----------------------------------------");

    process.exit(0);
  } catch (err) {
    if (err.code === "23505") {
      console.error("❌ ERROR: A user with this email already exists.");
    } else {
      console.error("❌ SETUP FAILED:", err.message);
    }
    process.exit(1);
  }
};

setupAdmin();
