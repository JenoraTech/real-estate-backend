const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class Property extends Model {}

  Property.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      owner_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "owner_id", // Maps JS 'owner_id' to DB 'owner_id'
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
      },
      property_type: {
        type: DataTypes.STRING,
      },
      listing_type: {
        type: DataTypes.STRING,
      },
      location: {
        type: DataTypes.STRING,
      },
      price: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING,
        defaultValue: "NGN",
      },
      status: {
        type: DataTypes.STRING,
        defaultValue: "pending",
      },
      category: {
        type: DataTypes.STRING,
        defaultValue: "General",
      },
      image_urls: {
        type: DataTypes.JSONB, // Optimized for PostgreSQL arrays/lists
        defaultValue: [],
      },
      features: {
        type: DataTypes.TEXT,
      },
      is_approved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "is_approved",
      },
    },
    {
      sequelize,
      modelName: "Property",
      tableName: "properties", // Explicitly point to your existing table
      underscored: true, // Automatically handles created_at/updated_at
    },
  );

  return Property;
};
