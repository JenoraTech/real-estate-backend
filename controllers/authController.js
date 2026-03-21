const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db"); // Now uses the clean pg library
const crypto = require("crypto");
const sgMail = require("@sendgrid/mail");

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const { sendEmail, sendSMS } = require("../utils/notifications");

// ======================= CREATE USER ACCOUNT =======================
exports.createUserAccount = async (req, res) => {
  const { full_name, email, phone, password, user_role } = req.body;

  try {
    if (!full_name || !email || !phone || !password) {
      return res.status(400).json({
        error: "Full name, email, phone number and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phone.trim();

    // 1️⃣ Check if email or phone already exists
    const existingCheck = await db.query(
      `SELECT id FROM users WHERE email = $1 OR phone = $2`,
      [normalizedEmail, normalizedPhone],
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        error: "Email or phone number already registered",
      });
    }

    // 2️⃣ Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3️⃣ Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60000);

    // 4️⃣ Insert user
    const queryText = `
      INSERT INTO users 
      (full_name, email, phone, password_hash, user_role, otp_code, otp_expiry, is_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, full_name, email, phone, user_role, is_verified, created_at
    `;

    const result = await db.query(queryText, [
      full_name,
      normalizedEmail,
      normalizedPhone,
      hashedPassword,
      user_role || "seeker",
      otp,
      otpExpiry,
      false,
    ]);

    const newUser = result.rows[0];

    // 5️⃣ Dispatch OTP via SendGrid
    const msg = {
      to: normalizedEmail,
      from: process.env.SENDER_EMAIL,
      subject: "Jenora Properties - Verification Code",
      html: `<div style="font-family: Arial; padding: 20px; border: 1px solid #eee;">
                <h2 style="color: #0B1221;">Welcome to Jenora Properties</h2>
                <p>Your verification code is:</p>
                <h1 style="color: #D4AF37; letter-spacing: 5px;">${otp}</h1>
                <p>This code expires in 10 minutes.</p>
              </div>`,
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ OTP Email sent to ${normalizedEmail}`);
    } catch (error) {
      console.error(
        "❌ SendGrid Delivery Error:",
        error.response ? error.response.body : error,
      );
    }

    res.status(201).json({
      message: "Account created successfully. Please verify your phone/email.",
      user: {
        id: newUser.id,
        full_name: newUser.full_name,
        email: newUser.email,
        phone: newUser.phone,
        user_role: newUser.user_role,
        is_verified: newUser.is_verified,
      },
      debug_otp: otp,
    });
  } catch (err) {
    console.error("CREATE USER ERROR:", err.message);
    if (err.code === "23505") {
      return res
        .status(400)
        .json({ error: "An account with this email or phone already exists." });
    }
    res
      .status(500)
      .json({ error: "Internal server error during registration." });
  }
};

// ======================= LOGIN USER =======================
exports.loginUser = async (req, res) => {
  const { emailOrPhone, password } = req.body;

  if (!emailOrPhone || !password) {
    return res
      .status(400)
      .json({ message: "Email/Phone and password are required" });
  }

  try {
    const identifier = emailOrPhone.includes("@")
      ? emailOrPhone.toLowerCase().trim()
      : emailOrPhone.trim();

    const result = await db.query(
      `SELECT * FROM users WHERE email = $1 OR phone = $1`,
      [identifier],
    );

    const user = result.rows[0];

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid Email/Phone or Password" });
    }

    if (user.is_blocked || user.is_frozen) {
      return res.status(403).json({
        message: "Your account is restricted. Please contact support.",
      });
    }

    // Verification Check
    if (!user.is_verified) {
      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      await db.query(
        `UPDATE users SET otp_code = $1, otp_expiry = NOW() + INTERVAL '10 minutes' WHERE id = $2`,
        [newOtp, user.id],
      );

      const msg = {
        to: user.email,
        from: process.env.SENDER_EMAIL,
        subject: "Jenora Properties - Verification Code",
        html: `<h3>Your verification code is: <strong>${newOtp}</strong></h3>`,
      };
      await sgMail
        .send(msg)
        .catch((e) => console.error("Email fail:", e.message));

      return res.status(401).json({
        message:
          "Your account is not verified. A new code has been sent to your email.",
        requiresVerification: true,
        email: user.email,
        phone: user.phone,
        debug_otp: newOtp,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Invalid Email/Phone or Password" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.user_role },
      process.env.JWT_SECRET || "fallback",
      { expiresIn: "24h" },
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        full_name: user.full_name,
        user_role: user.user_role,
        has_accepted_terms: user.has_accepted_terms,
        is_verified: user.is_verified,
      },
    });
  } catch (err) {
    console.error("🔥 LOGIN ERROR:", err.message);
    return res.status(500).json({ error: "Server Error during login" });
  }
};

// ======================= SEND OTP =======================
exports.sendVerificationOtp = async (req, res) => {
  const { emailOrPhone } = req.body;
  if (!emailOrPhone)
    return res.status(400).json({ message: "Email or phone is required" });

  try {
    const identifier = emailOrPhone.includes("@")
      ? emailOrPhone.toLowerCase().trim()
      : emailOrPhone.trim();
    const result = await db.query(
      `SELECT id, email, phone FROM users WHERE email = $1 OR phone = $1`,
      [identifier],
    );
    const user = result.rows[0];

    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = crypto.randomInt(100000, 999999).toString();
    await db.query(
      `UPDATE users SET otp_code = $1, otp_expiry = NOW() + INTERVAL '10 minutes' WHERE id = $2`,
      [otp, user.id],
    );

    if (identifier.includes("@")) {
      const msg = {
        to: user.email,
        from: process.env.SENDER_EMAIL,
        subject: "Verification Code",
        html: `<h3>Your verification code is: <strong>${otp}</strong></h3>`,
      };
      await sgMail.send(msg);
    } else {
      await sendSMS(
        user.phone,
        `Your verification code is: ${otp}. It expires in 10 minutes.`,
      );
    }

    res.json({ message: `A verification code has been sent.` });
  } catch (err) {
    res.status(500).json({ message: "Failed to send verification code." });
  }
};

// ======================= VERIFY OTP =======================
exports.verifyOtp = async (req, res) => {
  const { emailOrPhone, otp } = req.body;
  try {
    const identifier = emailOrPhone.includes("@")
      ? emailOrPhone.toLowerCase().trim()
      : emailOrPhone.trim();
    const result = await db.query(
      `SELECT * FROM users WHERE (email = $1 OR phone = $1) AND otp_code = $2 AND otp_expiry > CURRENT_TIMESTAMP`,
      [identifier, otp.toString()],
    );

    const user = result.rows[0];
    if (!user)
      return res.status(400).json({ message: "Invalid or expired OTP code." });

    await db.query(
      `UPDATE users SET is_verified = true, otp_code = NULL, otp_expiry = NULL WHERE id = $1`,
      [user.id],
    );

    const token = jwt.sign(
      { id: user.id, role: user.user_role },
      process.env.JWT_SECRET || "fallback",
      { expiresIn: "24h" },
    );

    res.json({
      message: "Account verified successfully",
      token,
      user: { ...user, is_verified: true, password_hash: undefined },
    });
  } catch (err) {
    res.status(500).json({ message: "An error occurred during verification." });
  }
};

// ======================= FORGOT PASSWORD =======================
exports.forgotPassword = async (req, res) => {
  const { emailOrPhone } = req.body;
  try {
    const identifier = emailOrPhone.includes("@")
      ? emailOrPhone.toLowerCase().trim()
      : emailOrPhone.trim();
    const result = await db.query(
      `SELECT id, email FROM users WHERE email=$1 OR phone=$1`,
      [identifier],
    );
    const user = result.rows[0];

    if (!user) return res.json({ message: "If account exists, code sent." });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60000);

    await db.query(
      `UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3`,
      [otpCode, expiry, user.id],
    );

    await sgMail.send({
      to: user.email,
      from: process.env.SENDER_EMAIL,
      subject: "Password Reset Code",
      html: `<h2>Code: ${otpCode}</h2>`,
    });

    res.json({ success: true, message: "Reset code sent." });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
};

// ======================= RESET PASSWORD =======================
exports.resetPassword = async (req, res) => {
  const { emailOrPhone, otp, newPassword } = req.body;
  try {
    const identifier = emailOrPhone.trim();
    const result = await db.query(
      `SELECT id FROM users WHERE (email = $1 OR phone = $1) AND reset_token = $2 AND reset_token_expiry > CURRENT_TIMESTAMP`,
      [identifier, otp],
    );

    const user = result.rows[0];
    if (!user)
      return res
        .status(400)
        .json({ message: "Invalid or expired reset code." });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await db.query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL, is_verified = true WHERE id = $2`,
      [hashedPassword, user.id],
    );

    res.json({ success: true, message: "Password reset successfully." });
  } catch (err) {
    res.status(500).json({ message: "Failed to reset password" });
  }
};
