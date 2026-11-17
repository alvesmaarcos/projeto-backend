const migrations = require('../src/config/migrations');
const sequelize = require('../src/config/database');
(async () => {
  try {
    if (process.argv[2] === 'up') await migrations.up();
    else if (process.argv[2] === 'down') await migrations.down();
    else throw new Error('Use up ou down.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
