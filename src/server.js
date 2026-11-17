const config = require('./config/env');
const createApp = require('./app');
const sequelize = require('./config/database');
async function start() {
  const settings = config();
  await sequelize.authenticate();
  const server = createApp(settings).listen(settings.port, () =>
    console.log(`API disponível na porta ${settings.port}. Documentação: /docs`),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      server.close(async () => {
        await sequelize.close();
        process.exit(0);
      });
    });
}
start().catch((error) => {
  console.error('Não foi possível iniciar a API:', error.message);
  process.exitCode = 1;
});
