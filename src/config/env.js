require('dotenv').config({ quiet: true });
const path = require('node:path');

function config() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres.');
  }
  return {
    port: Number(process.env.PORT || 3000),
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
    uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  };
}
module.exports = config;
