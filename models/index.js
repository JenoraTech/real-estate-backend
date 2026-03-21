/**
 * ⚠️ SEQUELIZE REMOVED ⚠️
 * This file now serves as a central export hub for the PostgreSQL pool.
 * It prevents the "Module Not Found: sequelize" error on Render.
 */

const db = require("../config/db"); // Imports your pg Pool

// We export the pool as 'sequelize' to maintain compatibility
// with any files still calling db.sequelize.query()
const models = {
  query: db.query,
  pool: db.pool,
  // We keep these keys present so imports like { User } don't
  // immediately throw "undefined" errors, though you should
  // update those routes to use db.query directly.
  User: "DEPRECATED_USE_RAW_SQL",
  Property: "DEPRECATED_USE_RAW_SQL",
  Review: "DEPRECATED_USE_RAW_SQL",
};

module.exports = models;
