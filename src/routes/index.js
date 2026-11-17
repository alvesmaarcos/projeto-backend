const { Router } = require('express');
const controllers = require('../controllers');
const authenticate = require('../middleware/auth');
module.exports = (config) => {
  const router = Router();
  const c = controllers(config);
  const auth = authenticate(config);
  router.post('/user/token', c.users.token);
  router.post('/user', c.users.create);
  router.get('/user/:id', auth, c.users.get);
  router.put('/user/:id', auth, c.users.update);
  router.delete('/user/:id', auth, c.users.remove);
  for (const [path, handler] of [
    ['category', c.categories],
    ['product', c.products],
  ]) {
    router.get(`/${path}/search`, handler.search);
    router.get(`/${path}/:id`, handler.get);
    router.post(`/${path}`, auth, handler.create);
    router.put(`/${path}/:id`, auth, handler.update);
    router.delete(`/${path}/:id`, auth, handler.remove);
  }
  return router;
};
