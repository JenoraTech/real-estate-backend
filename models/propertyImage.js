const { Model, DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  class PropertyImage extends Model {}

  PropertyImage.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      property_id: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "property_id",
      },
      image_url: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "image_url",
      },
      is_primary: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "is_approved",
      },
    },
    {
      sequelize,
      modelName: "PropertyImage",
      tableName: "property_images",
      underscored: true,
    },
  );

  return PropertyImage;
};
