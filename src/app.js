const express = require('express');
const swaggerUi = require('swagger-ui-express');
const config = require('./config/env');
const routes = require('./routes');
const { ApiError, errorHandler } = require('./middleware/errors');
const openapi = require('../docs/openapi');
module.exports = function createApp(settings = config()) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '40mb' }));
  app.use('/media', express.static(settings.uploadDir, { dotfiles: 'deny', index: false }));
  app.get('/openapi.json', (req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
  app.use('/v1', routes(settings));
  app.use((req, res, next) => next(new ApiError(404, 'Rota não encontrada.')));
  app.use(errorHandler);
  return app;
};
