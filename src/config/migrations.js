const path = require('node:path');
const { Umzug, SequelizeStorage } = require('umzug');
const sequelize = require('./database');
module.exports = new Umzug({
  migrations: { glob: ['*.js', { cwd: path.resolve(__dirname, '../../migrations') }] },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});
