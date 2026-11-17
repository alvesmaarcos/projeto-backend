const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { ApiError } = require('./errors');

module.exports = (config) => async (req, res, next) => {
  const match = /^Bearer ([^\s]+)$/.exec(req.get('Authorization') || '');
  if (!match) throw new ApiError(401, 'Token obrigatório.');
  let payload;
  try {
    payload = jwt.verify(match[1], config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new ApiError(401, 'Token inválido ou expirado.');
  }
  if (!/^\d+$/.test(payload.sub || '') || !(await User.findByPk(payload.sub)))
    throw new ApiError(401, 'Usuário não autenticado.');
  req.userId = Number(payload.sub);
  next();
};
