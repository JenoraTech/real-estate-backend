const { Sequelize, DataTypes } = require("sequelize");
require("dotenv").config();

// ✅ Create the connection using Supabase DATABASE_URL
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true, // Supabase requires SSL
      rejectUnauthorized: false,
    },
  },
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// --- 1. Import Models ---
db.User = require("./user")(sequelize, DataTypes);
db.Property = require("./property")(sequelize, DataTypes);
db.PropertyImage = require("./propertyImage")(sequelize, DataTypes);
db.Review = require("./Review")(sequelize, DataTypes);

// --- 2. Define Associations (Relationships) ---

// Property <-> Images
db.Property.hasMany(db.PropertyImage, {
  foreignKey: "property_id",
  as: "images",
});
db.PropertyImage.belongsTo(db.Property, {
  foreignKey: "property_id",
});

// Property <-> User (Owner)
db.Property.belongsTo(db.User, {
  foreignKey: "owner_id",
  as: "owner",
});
db.User.hasMany(db.Property, {
  foreignKey: "owner_id",
  as: "properties",
});

// User <-> Review
db.User.hasMany(db.Review, {
  foreignKey: "owner_id",
  as: "reviews",
});
db.Review.belongsTo(db.User, {
  foreignKey: "owner_id",
  as: "target_user",
});

// Property <-> Review
db.Property.hasMany(db.Review, {
  foreignKey: "property_id",
  as: "reviews",
});
db.Review.belongsTo(db.Property, {
  foreignKey: "property_id",
});

module.exports = db;
