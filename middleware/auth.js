const jwt = require("jsonwebtoken");

// 1. Define verifyToken
const verifyToken = (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Ensure the controller can always find 'id'
    // If your JWT payload uses 'userId' or 'sub', this maps it to 'id'
    req.user = {
      ...decoded,
      id: decoded.id || decoded.userId || decoded.sub,
    };

    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

// 2. Define isAdmin (Needed for your leads and commissions routes)
const isAdmin = (req, res, next) => {
  // Check if req.user exists and if the role is admin
  // Based on your instructions, this handles main admin and sub-admins
  // ✅ Added lowercase check to be extra safe with different DB string formats
  if (
    req.user &&
    (req.user.role === "admin" ||
      req.user.role === "Admin" ||
      req.user.role?.toLowerCase() === "admin")
  ) {
    next();
  } else {
    res.status(403).json({ message: "Access denied: Admins only" });
  }
};

// 3. ✅ Export as an OBJECT so destructuring works in routes
module.exports = {
  verifyToken,
  protect: verifyToken, // Alias so 'const { protect } = require(...)' works
  isAdmin,
};
