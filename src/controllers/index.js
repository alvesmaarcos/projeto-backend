const schemas = require('../services/validation');
const users = require('../services/users');
const categories = require('../services/categories');
const products = require('../services/products');
module.exports = (config) => ({
  users: {
    create: async (req, res) =>
      res.status(201).json(await users.create(schemas.register.parse(req.body))),
    token: async (req, res) => res.json(await users.token(schemas.login.parse(req.body), config)),
    get: async (req, res) => res.json(await users.get(schemas.parseId(req.params.id), req.userId)),
    update: async (req, res) => {
      await users.update(
        schemas.parseId(req.params.id),
        req.userId,
        schemas.userUpdate.parse(req.body),
      );
      res.status(204).end();
    },
    remove: async (req, res) => {
      await users.remove(schemas.parseId(req.params.id), req.userId);
      res.status(204).end();
    },
  },
  ...Object.fromEntries(
    [
      ['categories', categories, 'category'],
      ['products', products, 'product'],
    ].map(([name, service, schema]) => [
      name,
      {
        create: async (req, res) =>
          res.status(201).json(await service.create(schemas[schema].parse(req.body), config)),
        search: async (req, res) => res.json(await service.search(req.query)),
        get: async (req, res) => res.json(await service.get(schemas.parseId(req.params.id))),
        update: async (req, res) => {
          await service.update(
            schemas.parseId(req.params.id),
            schemas[`${schema}Update`].parse(req.body),
            config,
          );
          res.status(204).end();
        },
        remove: async (req, res) => {
          await service.remove(schemas.parseId(req.params.id), config);
          res.status(204).end();
        },
      },
    ]),
  ),
});
