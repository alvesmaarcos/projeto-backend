const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { ApiError } = require('../middleware/errors');
const publicUser = (user) => ({
  id: user.id,
  firstname: user.firstname,
  surname: user.surname,
  email: user.email,
});
async function ownedUser(id, userId) {
  if (id !== userId) throw new ApiError(403, 'Acesso permitido apenas à própria conta.');
  const user = await User.findByPk(id);
  if (!user) throw new ApiError(404, 'Usuário não encontrado.');
  return user;
}
module.exports = {
  async create({ confirmPassword, password, ...data }) {
    const user = await User.create({ ...data, password: await bcrypt.hash(password, 12) });
    return publicUser(user);
  },
  async token(data, config) {
    const user = await User.unscoped().findOne({ where: { email: data.email } });
    if (!user || !(await bcrypt.compare(data.password, user.password)))
      throw new ApiError(401, 'Credenciais inválidas.');
    return {
      token: jwt.sign({}, config.jwtSecret, {
        algorithm: 'HS256',
        subject: String(user.id),
        expiresIn: config.jwtExpiresIn,
      }),
    };
  },
  async get(id, userId) {
    return publicUser(await ownedUser(id, userId));
  },
  async update(id, userId, data) {
    await (await ownedUser(id, userId)).update(data);
  },
  async remove(id, userId) {
    await (await ownedUser(id, userId)).destroy();
  },
};
