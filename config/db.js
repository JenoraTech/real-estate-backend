const { Sequelize, DataTypes } = require("sequelize");
require("dotenv").config();

// Initialize Sequelize with Supabase PostgreSQL
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  protocol: "postgres",
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // Required for Supabase
    },
    prepareThreshold: 0, // Important for Supabase pooler
  },
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// Test DB connection (VERY IMPORTANT)
(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected successfully");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
  }
})();

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// --- Models ---
db.User = require("../models/user")(sequelize, DataTypes);
db.Property = require("../models/property")(sequelize, DataTypes);
db.PropertyImage = require("../models/propertyImage")(sequelize, DataTypes);
db.Review = require("../models/Review")(sequelize, DataTypes);

// --- Associations ---

// Property → Images
db.Property.hasMany(db.PropertyImage, {
  foreignKey: "property_id",
  onDelete: "CASCADE",
});
db.PropertyImage.belongsTo(db.Property, {
  foreignKey: "property_id",
});

// User → Property
db.User.hasMany(db.Property, {
  foreignKey: "owner_id",
});
db.Property.belongsTo(db.User, {
  as: "owner",
  foreignKey: "owner_id",
});

// Property → Review
db.Property.hasMany(db.Review, {
  foreignKey: "property_id",
  onDelete: "CASCADE",
});
db.Review.belongsTo(db.Property, {
  foreignKey: "property_id",
});

module.exports = db;
