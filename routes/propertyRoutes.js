const express = require("express");
const router = express.Router();
const propertyController = require("../controllers/propertyController");
const upload = require("../middleware/upload");

// ✅ Clean destructuring from your updated middleware/auth.js
// Note: verifyToken is the 'pg' version of your previous 'protect' logic
const { verifyToken, isAdmin } = require("../middleware/auth");

// --- PUBLIC ROUTES ---

/**
 * @route   GET /api/properties/search
 * @desc    Search properties with granular filters
 */
router.get("/search", propertyController.searchProperties);

/**
 * @route   GET /api/properties
 * @desc    Get all properties for the main feed
 */
router.get("/", propertyController.getAllProperties);

// --- PRIVATE ROUTES (Authentication Required) ---

// Waitlist Logic (Moved ABOVE /:id to prevent UUID syntax errors)
/**
 * @route   GET /api/properties/waitlist
 * @desc    Get current user's waitlist
 */
router.get("/waitlist", verifyToken, propertyController.getUserWaitlist);

/**
 * @route   POST /api/properties/waitlist
 * @desc    Add a property to the user's waitlist (Hearting)
 */
router.post("/waitlist", verifyToken, propertyController.addToWaitlist);

/**
 * @route   DELETE /api/properties/waitlist/:property_id
 * @desc    Remove a property from the user's waitlist (Un-hearting)
 */
router.delete(
  "/waitlist/:property_id",
  verifyToken,
  propertyController.removeFromWaitlist,
);

// Viewing Logic (Moved ABOVE /:id to prevent UUID syntax errors)
/**
 * @route   GET /api/properties/viewed
 */
router.get("/viewed", verifyToken, propertyController.getViewed);

/**
 * @route   POST /api/properties/viewed
 */
router.post("/viewed", verifyToken, propertyController.logView);

/**
 * @route   POST /api/properties/inquiry
 * @desc    Create a new inquiry (Seeker sends message to Owner)
 */
router.post("/inquiry", verifyToken, propertyController.addInquiry);

/**
 * @route   POST /api/properties
 * @desc    Create a new property listing
 */
router.post(
  "/",
  verifyToken,
  upload.array("images", 10),
  propertyController.createProperty,
);

// --- OWNER / AGENT ROUTES ---

/**
 * @route   GET /api/properties/owner/:owner_id
 */
router.get(
  "/owner/:owner_id",
  verifyToken,
  propertyController.getPropertiesByOwner,
);

/**
 * @route   GET /api/properties/owner/inquiries/:owner_id
 * @desc    Get all inquiries sent to a specific owner's properties
 */
router.get(
  "/owner/inquiries/:owner_id",
  verifyToken,
  propertyController.getInquiriesByOwner,
);

// --- ADMIN SPECIFIC ROUTES (Commission & Leads) ---

/**
 * @route   GET /api/properties/admin/commissions/unpaid
 */
router.get(
  "/admin/commissions/unpaid",
  verifyToken,
  isAdmin,
  propertyController.getUnpaidCommissions,
);

/**
 * @route   PATCH /api/properties/admin/commissions/:id/paid
 */
router.patch(
  "/admin/commissions/:id/paid",
  verifyToken,
  isAdmin,
  propertyController.updateCommissionStatus,
);

/**
 * @route   GET /api/properties/admin/commissions/paid
 */
router.get(
  "/admin/commissions/paid",
  verifyToken,
  isAdmin,
  propertyController.getPaidCommissions,
);

/**
 * @route   GET /api/properties/admin/leads
 * @desc    Matches the Flutter call for seeker interest
 */
router.get(
  "/admin/leads",
  verifyToken,
  isAdmin,
  propertyController.getAdminLeads,
);

// --- DYNAMIC ID ROUTES (MUST BE AT THE BOTTOM) ---

/**
 * @route   GET /api/properties/:id
 * @desc    Get full details of a single property
 */
router.get("/:id", propertyController.getPropertyById);

/**
 * @route   PUT /api/properties/:id
 * @desc    Update property details
 */
router.put(
  "/:id",
  verifyToken,
  upload.array("images", 10),
  propertyController.updateProperty,
);

/**
 * @route   DELETE /api/properties/:id
 * @desc    Delete a property listing
 */
router.delete("/:id", verifyToken, propertyController.deleteProperty);

/**
 * @route   PATCH /api/properties/:id/visibility
 * @desc    Admin can hide/show properties
 */
router.patch(
  "/:id/visibility",
  verifyToken,
  isAdmin,
  propertyController.toggleVisibility,
);

module.exports = router;
