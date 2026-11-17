const { Category } = require('../models');
const { ApiError } = require('../middleware/errors');
const { searchQuery } = require('./validation');
const fields = ['id', 'name', 'slug', 'use_in_menu'];
async function find(id) {
  const category = await Category.findByPk(id);
  if (!category) throw new ApiError(404, 'Categoria não encontrada.');
  return category;
}
module.exports = {
  async create(data) {
    return (await Category.create(data)).get({ plain: true });
  },
  async get(id) {
    const category = await find(id);
    return Object.fromEntries(fields.map((f) => [f, category[f]]));
  },
  async update(id, data) {
    await (await find(id)).update(data);
  },
  async remove(id) {
    await (await find(id)).destroy();
  },
  async search(query) {
    const { limit, page, fields: attributes, pagination } = searchQuery(query, fields);
    const where =
      query.use_in_menu === undefined ? {} : { use_in_menu: query.use_in_menu === 'true' };
    const { count, rows } = await Category.findAndCountAll({
      where,
      attributes,
      ...pagination,
      order: [['id', 'ASC']],
    });
    return { data: rows, total: count, limit, page };
  },
};
