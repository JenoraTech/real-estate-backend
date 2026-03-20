// c:\RealEstate\real-estate-backend\models\user.js

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      full_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      user_role: {
        type: DataTypes.ENUM("seeker", "owner", "both"),
        defaultValue: "seeker",
      },
      has_accepted_terms: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      // ✅ ADDED: Stores the calculated average rating (e.g., 4.50)
      average_rating: {
        type: DataTypes.DECIMAL(3, 2),
        defaultValue: 0.0,
      },
      // ✅ ADDED: Stores total number of reviews received
      total_reviews: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    },
    {
      tableName: "users", // This is the name of the table in PostgreSQL
      timestamps: true, // Automatically adds createdAt and updatedAt fields
    },
  );

  return User;
};
