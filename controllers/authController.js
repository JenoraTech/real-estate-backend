const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const crypto = require("crypto");
// ✅ Added SendGrid library
const sgMail = require("@sendgrid/mail");

// ✅ Configure SendGrid with your new API Key from .env
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const { sendEmail, sendSMS } = require("../utils/notifications");

/**
 * ✅ THE CRITICAL BRIDGE:
 * This ensures that 'db_pg.query' calls work with Sequelize while
 * keeping your manual SQL strings exactly as they are.
 */
const db_pg = {
  query: async (text, options = {}) => {
    // If you are passing 'replacements', Sequelize handles them automatically
    // If it's a SELECT, we return the data directly as you expect in your code
    const results = await db.sequelize.query(text, {
      ...options,
      // We ensure the 'replacements' from your code are passed through
      replacements: options.replacements || {},
      type: options.type || db.Sequelize.QueryTypes.SELECT,
    });

    // In your code, you use const [users] = await ...
    // Sequelize SELECT returns the array directly. We wrap it to match your destructuring.
    return [results];
  },
};

exports.createUserAccount = async (req, res) => {
  const { full_name, email, phone, password, user_role } = req.body;

  try {
    // 1️⃣ Basic validation
    if (!full_name || !email || !phone || !password) {
      return res.status(400).json({
        error: "Full name, email, phone number and password are required",
      });
    }

    // Normalize email and phone
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phone.trim();

    // 2️⃣ Check if email or phone already exists
    const [existingUsers] = await db_pg.query(
      `SELECT id FROM users WHERE email = :email OR phone = :phone`,
      {
        replacements: { email: normalizedEmail, phone: normalizedPhone },
        type: db.Sequelize.QueryTypes.SELECT,
      },
    );

    // logic check for existence
    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({
        error: "Email or phone number already registered",
      });
    }

    // 3️⃣ Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4️⃣ Generate OTP for immediate verification
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60000); // 10 minutes from now

    // 5️⃣ Insert user with OTP details
    const queryText = `
      INSERT INTO users 
      (full_name, email, phone, password_hash, user_role, otp_code, otp_expiry, is_verified)
      VALUES (:full_name, :email, :phone, :password_hash, :user_role, :otp_code, :otp_expiry, :is_verified)
      RETURNING id, full_name, email, phone, user_role, is_verified, created_at
    `;

    const [result] = await db_pg.query(queryText, {
      replacements: {
        full_name,
        email: normalizedEmail,
        phone: normalizedPhone,
        password_hash: hashedPassword,
        user_role: user_role || "seeker",
        otp_code: otp,
        otp_expiry: otpExpiry,
        is_verified: false,
      },
      type: db.Sequelize.QueryTypes.INSERT,
    });

    const newUser = result[0];

    // 6️⃣ Dispatch OTP via SendGrid
    const msg = {
      to: normalizedEmail,
      from: process.env.SENDER_EMAIL,
      subject: "Jenora Properties - Verification Code",
      text: `Your verification code is: ${otp}`,
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

    console.log(`Verification OTP for ${newUser.full_name}: ${otp}`);

    // 7️⃣ Return safe response
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

    if (err.code === "23505" || err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        error: "An account with this email or phone already exists.",
      });
    }

    res.status(500).json({
      error: "Internal server error during registration.",
    });
  }
};

exports.loginUser = async (req, res) => {
  const { emailOrPhone, password } = req.body;

  console.log("-----------------------------------------");
  console.log("🚀 Login attempt received for:", emailOrPhone);

  if (!emailOrPhone || !password) {
    return res.status(400).json({
      message: "Email/Phone and password are required",
    });
  }

  try {
    const identifier = emailOrPhone.includes("@")
      ? emailOrPhone.toLowerCase().trim()
      : emailOrPhone.trim();

    // 2️⃣ Find user
    const [users] = await db_pg.query(
      `SELECT * FROM users WHERE email = :id OR phone = :id`,
      {
        replacements: { id: identifier },
        type: db.Sequelize.QueryTypes.SELECT,
      },
    );

    const user = Array.isArray(users) ? users[0] : users;

    if (!user) {
      console.log("❌ Login failed: User not found ->", identifier);
      return res.status(400).json({
        message: "Invalid Email/Phone or Password",
      });
    }

    // 3️⃣ Account status checks
    if (user.is_blocked || user.is_frozen) {
      return res.status(403).json({
        message: "Your account is restricted. Please contact support.",
      });
    }

    // 4️⃣ Verification Check & Automatic OTP Dispatch
    if (!user.is_verified) {
      console.log(
        `⚠️ User ${identifier} is not verified. Generating new OTP...`,
      );

      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

      await db_pg.query(
        `UPDATE users SET otp_code = :otp, otp_expiry = NOW() + INTERVAL '10 minutes' WHERE id = :userId`,
        {
          replacements: { otp: newOtp, userId: user.id },
          type: db.Sequelize.QueryTypes.UPDATE,
        },
      );

      console.log("*****************************************");
      console.log(`🔑 VERIFICATION CODE FOR ${user.email}: ${newOtp}`);
      console.log("*****************************************");

      try {
        const msg = {
          to: user.email,
          from: process.env.SENDER_EMAIL,
          subject: "Jenora Properties - Verification Code",
          html: `<h3>Your verification code is: <strong>${newOtp}</strong></h3>`,
        };
        await sgMail.send(msg);
        console.log(`✅ SendGrid: OTP Email sent to ${user.email}`);
      } catch (sgErr) {
        console.error(
          "❌ SendGrid: Failed to send email during login:",
          sgErr.message,
        );
      }

      return res.status(401).json({
        message:
          "Your account is not verified. A new code has been sent to your email.",
        requiresVerification: true,
        email: user.email,
        phone: user.phone,
        debug_otp: newOtp,
      });
    }

    // 5️⃣ Compare passwords
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      console.log("❌ Login failed: Incorrect password for ->", identifier);
      return res.status(400).json({
        message: "Invalid Email/Phone or Password",
      });
    }

    // 6️⃣ Sign JWT
    const payload = { id: user.id, role: user.user_role };
    const secret = process.env.JWT_SECRET || "fallback_secret_for_dev_only";
    const token = jwt.sign(payload, secret, { expiresIn: "24h" });

    console.log("✅ Login successful for:", user.full_name);

    return res.json({
      token: token,
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
    console.error("🔥 CRITICAL LOGIN ERROR:", err.message);
    return res.status(500).json({ error: "Server Error during login" });
  }
};

exports.sendVerificationOtp = async (req, res) => {
  const { emailOrPhone } = req.body;
  if (!emailOrPhone)
    return res.status(400).json({ message: "Email or phone is required" });

  try {
    const identifier = emailOrPhone.includes("@")
      ? emailOrPhone.toLowerCase().trim()
      : emailOrPhone.trim();

    const [users] = await db_pg.query(
      `SELECT id, email, phone FROM users WHERE email = :id OR phone = :id`,
      {
        replacements: { id: identifier },
        type: db.Sequelize.QueryTypes.SELECT,
      },
    );

    const user = Array.isArray(users) ? users[0] : users;
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = crypto.randomInt(100000, 999999).toString();

    await db_pg.query(
      `UPDATE users SET otp_code = :otp, otp_expiry = NOW() + INTERVAL '10 minutes' WHERE id = :userId`,
      {
        replacements: { otp, userId: user.id },
        type: db.Sequelize.QueryTypes.UPDATE,
      },
    );

    if (identifier.includes("@")) {
      const msg = {
        to: user.email,
        from: process.env.SENDER_EMAIL,
        subject: "Verification Code",
        html: `<h3>Your verification code is: <strong>${otp}</strong></h3>
               <p>This code will expire in 10 minutes.</p>`,
      };
      await sgMail.send(msg);
      console.log(`[AUTH] OTP Email dispatched to ${user.email}`);
    } else {
      await sendSMS(
        user.phone,
        `Your verification code is: ${otp}. It expires in 10 minutes.`,
      );
      console.log(`[AUTH] OTP SMS dispatched to ${user.phone}`);
    }

    res.json({
      message: `A verification code has been sent to your ${identifier.includes("@") ? "email" : "phone"}.`,
    });
  } catch (err) {
    console.error("OTP DISPATCH ERROR:", err.message);
    res.status(500).json({ message: "Failed to send verification code." });
  }
};

exports.verifyOtp = async (req, res) => {
  const { emailOrPhone, otp } = req.body;
  if (!emailOrPhone || !otp)
    return res
      .status(400)
      .json({ message: "Email/Phone and OTP are required" });

  try {
    const identifier = emailOrPhone.includes("@")
      ? emailOrPhone.toLowerCase().trim()
      : emailOrPhone.trim();

    const [users] = await db_pg.query(
      `SELECT * FROM users 
       WHERE (email = :id OR phone = :id) 
       AND otp_code = :otp 
       AND otp_expiry > CURRENT_TIMESTAMP`,
      {
        replacements: { id: identifier, otp: otp.toString() },
        type: db.Sequelize.QueryTypes.SELECT,
      },
    );

    const user = Array.isArray(users) ? users[0] : users;
    if (!user)
      return res.status(400).json({ message: "Invalid or expired OTP code." });

    await db_pg.query(
      `UPDATE users SET is_verified = true, otp_code = NULL, otp_expiry = NULL WHERE id = :userId`,
      {
        replacements: { userId: user.id },
        type: db.Sequelize.QueryTypes.UPDATE,
      },
    );

    const token = jwt.sign(
      { id: user.id, role: user.user_role },
      process.env.JWT_SECRET || "fallback",
      { expiresIn: "24h" },
    );

    res.json({
      message: "Account verified successfully",
      token: token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        user_role: user.user_role,
        is_verified: true,
      },
    });
  } catch (err) {
    console.error("VERIFY OTP ERROR:", err.message);
    res.status(500).json({ message: "An error occurred during verification." });
  }
};

exports.forgotPassword = async (req, res) => {
  const { emailOrPhone } = req.body;
  if (!emailOrPhone)
    return res.status(400).json({ message: "Email or phone is required" });

  try {
    const identifier = emailOrPhone.includes("@")
      ? emailOrPhone.toLowerCase().trim()
      : emailOrPhone.trim();

    const [users] = await db_pg.query(
      `SELECT id, email, phone FROM users WHERE email=:id OR phone=:id`,
      {
        replacements: { id: identifier },
        type: db.Sequelize.QueryTypes.SELECT,
      },
    );

    const user = Array.isArray(users) ? users[0] : users;
    const genericMessage =
      "If an account is associated with this identifier, a reset code has been sent.";

    if (!user) return res.json({ message: genericMessage });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60000);

    await db_pg.query(
      `UPDATE users SET reset_token = :otp, reset_token_expiry = :expiry WHERE id = :id`,
      {
        replacements: { otp: otpCode, expiry, id: user.id },
        type: db.Sequelize.QueryTypes.UPDATE,
      },
    );

    const msg = {
      to: user.email,
      from: process.env.SENDER_EMAIL,
      subject: "Password Reset Code - Jenora Properties",
      html: `<div style="font-family: Arial; padding: 20px;">
              <h2>Password Reset Request</h2>
              <div style="background: #f4f4f4; padding: 15px; font-size: 24px; font-weight: bold; color: #D4AF37;">${otpCode}</div>
              <p>Expires in 15 minutes.</p>
            </div>`,
    };

    await sgMail.send(msg);
    res.json({ success: true, message: genericMessage });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.resetPassword = async (req, res) => {
  const { emailOrPhone, otp, newPassword } = req.body;
  if (!emailOrPhone || !otp || !newPassword)
    return res.status(400).json({ message: "All fields are required" });

  try {
    const identifier = emailOrPhone.trim();

    const [users] = await db_pg.query(
      `SELECT id FROM users 
       WHERE (email = :id OR phone = :id) 
       AND reset_token = :otp 
       AND reset_token_expiry > CURRENT_TIMESTAMP`,
      {
        replacements: { id: identifier, otp },
        type: db.Sequelize.QueryTypes.SELECT,
      },
    );

    const user = Array.isArray(users) ? users[0] : users;
    if (!user)
      return res
        .status(400)
        .json({ message: "Invalid or expired reset code." });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await db_pg.query(
      `UPDATE users SET password_hash = :pass, reset_token = NULL, reset_token_expiry = NULL, is_verified = true WHERE id = :userId`,
      {
        replacements: { pass: hashedPassword, userId: user.id },
        type: db.Sequelize.QueryTypes.UPDATE,
      },
    );

    res.json({ success: true, message: "Password reset successfully." });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err.message);
    res.status(500).json({ message: "Failed to reset password" });
  }
};
