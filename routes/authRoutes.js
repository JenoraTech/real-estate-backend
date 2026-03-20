const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// ✅ UPDATED: Destructuring to get the specific function from the middleware object
// This prevents the "argument handler must be a function" TypeError
const { verifyToken } = require("../middleware/auth");

// --- Public Authentication Routes ---

/**
 * @route   POST /api/auth/register
 * @desc    Create a new user account
 */
router.post("/register", authController.createUserAccount);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user via Email or Phone and get token
 */
router.post("/login", authController.loginUser);

// --- OTP & Verification Flow ---

/**
 * @route   POST /api/auth/send-otp
 * @desc    Send a numeric OTP to user email/phone
 */
router.post("/send-otp", authController.sendVerificationOtp);

/**
 * ✅ ADDED: Match the Flutter resend-otp call
 * @route   POST /api/auth/resend-otp
 * @desc    Resend a numeric OTP to user email/phone
 */
router.post("/resend-otp", authController.sendVerificationOtp);

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify the OTP provided by the user
 */
router.post("/verify-otp", authController.verifyOtp);

// --- Password Recovery Flow ---

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Initiate password reset process
 */
router.post("/forgot-password", authController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Update password using reset token/OTP
 */
router.post("/reset-password", authController.resetPassword);

// --- Protected Routes (Requires JWT) ---

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user's profile data using their JWT token
 * @access  Private (Handled by verifyToken)
 */
// ✅ UPDATED: Using verifyToken (the function) instead of the whole middleware object
router.get("/profile", verifyToken, async (req, res) => {
  try {
    // req.user is populated by your authMiddleware (usually contains user ID and role)
    if (!req.user) {
      return res.status(404).json({
        success: false,
        message: "User context not found in request",
      });
    }

    res.json({
      success: true,
      user: req.user,
    });
  } catch (err) {
    console.error("Profile Fetch Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching profile",
    });
  }
});

module.exports = router;
