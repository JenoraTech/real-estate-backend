const { Sequelize, DataTypes } = require("sequelize");
require("dotenv").config();

// Initializing Sequelize with the corrected Supabase Connection String
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  protocol: "postgres",
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // Required for Supabase/AWS
    },
    // CRITICAL: Supabase Pooler (6543) requires this to prevent
    // "prepared statement already exists" or "not found" errors.
    prepareThreshold: 0,
  },
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

// --- Models ---
// Note: Ensure these paths match your folder structure exactly
db.User = require("../models/user")(sequelize, DataTypes);
db.Property = require("../models/property")(sequelize, DataTypes);
db.PropertyImage = require("../models/propertyImage")(sequelize, DataTypes);
db.Review = require("../models/Review")(sequelize, DataTypes);

// --- Associations ---

// A property has many images - Deleting a property automatically deletes its image records
db.Property.hasMany(db.PropertyImage, {
  foreignKey: "property_id",
  onDelete: "CASCADE",
});
db.PropertyImage.belongsTo(db.Property, {
  foreignKey: "property_id",
});

// User to Property Relationship
db.User.hasMany(db.Property, {
  foreignKey: "owner_id",
});
db.Property.belongsTo(db.User, {
  as: "owner",
  foreignKey: "owner_id",
});

// Review Relationship
db.Property.hasMany(db.Review, {
  foreignKey: "property_id",
  onDelete: "CASCADE",
});
db.Review.belongsTo(db.Property, {
  foreignKey: "property_id",
});

module.exports = db;
