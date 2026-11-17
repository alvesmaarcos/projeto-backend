require('dotenv').config({ quiet: true });
const { Sequelize } = require('sequelize');

module.exports = new Sequelize(
  process.env.DB_NAME || 'catalog',
  process.env.DB_USER || 'catalog',
  process.env.DB_PASSWORD || '',
  {
    dialect: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    logging: false,
    pool: { max: 10, min: 0, idle: 10000 },
    define: { underscored: true },
  },
);
