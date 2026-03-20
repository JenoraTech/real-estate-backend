const { DataTypes } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define("Review", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    seeker_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    owner_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rating: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  });

  return Review;
};
