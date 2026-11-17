const { Op, literal } = require('sequelize');
const { sequelize, Product, Category, Image, Option } = require('../models');
const { ApiError } = require('../middleware/errors');
const { parseId, searchQuery } = require('./validation');
const { saveImage, removeImages } = require('./images');
const fields = [
  'id',
  'enabled',
  'name',
  'slug',
  'use_in_menu',
  'stock',
  'description',
  'price',
  'price_with_discount',
  'category_ids',
  'images',
  'options',
];
const include = [
  { model: Category, as: 'categories', attributes: ['id'], through: { attributes: [] } },
  { model: Image, as: 'images', separate: true, order: [['id', 'ASC']] },
  { model: Option, as: 'options', separate: true, order: [['id', 'ASC']] },
];
function serialize(product) {
  const data = product.get({ plain: true });
  const result = Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]]));
  return {
    ...result,
    price: Number(data.price),
    price_with_discount: Number(data.price_with_discount),
    category_ids: (data.categories || []).map((c) => c.id).sort((a, b) => a - b),
    images: (data.images || []).map((i) => ({ id: i.id, enabled: i.enabled, content: i.path })),
    options: (data.options || []).map(({ product_id, ...option }) => ({
      ...option,
      values: option.values.split(','),
    })),
  };
}
async function find(id, options = {}) {
  const product = await Product.findByPk(id, options);
  if (!product) throw new ApiError(404, 'Produto não encontrado.');
  return product;
}
function assertUniqueIds(items) {
  const ids = (items || []).filter((item) => item.id).map((item) => item.id);
  if (new Set(ids).size !== ids.length)
    throw new ApiError(400, 'Identificadores repetidos na atualização.');
}
async function updateChildren(product, Model, items, transaction, transform) {
  if (!items) return;
  assertUniqueIds(items);
  const existing = await Model.findAll({ where: { product_id: product.id }, transaction });
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const item of items) {
    const { id, deleted, ...data } = item;
    const row = id ? byId.get(id) : undefined;
    if (id && !row) throw new ApiError(400, 'Imagem/opção não pertence ao produto.');
    if (deleted) {
      await transform(data, row, true);
      await row.destroy({ transaction });
    } else {
      const attributes = await transform(data, row, false);
      if (row) await row.update(attributes, { transaction });
      else await Model.create({ ...attributes, product_id: product.id }, { transaction });
    }
  }
}

async function write(id, data, config) {
  const createdPaths = [];
  const removedPaths = [];
  let productId;
  try {
    productId = await sequelize.transaction(async (transaction) => {
      const { category_ids, images, options, ...attributes } = data;
      if (!id && [...(images || []), ...(options || [])].some((item) => item.id || item.deleted))
        throw new ApiError(400, 'Criação não aceita referências de imagens/opções existentes.');
      const product = id
        ? await find(id, { transaction, lock: transaction.LOCK.UPDATE })
        : await Product.create(attributes, { transaction });
      if (id) await product.update(attributes, { transaction });
      if (category_ids !== undefined) {
        const categories = await Category.findAll({ where: { id: category_ids }, transaction });
        if (categories.length !== category_ids.length)
          throw new ApiError(400, 'Categoria inexistente.');
        await product.setCategories(categories, { transaction });
      }
      await updateChildren(
        product,
        Image,
        images,
        transaction,
        async ({ content, type, ...rest }, row, deleted) => {
          if (deleted) {
            removedPaths.push(row.path);
            return {};
          }
          if (content === undefined || (row && content === row.path)) return rest;
          if (
            content.startsWith('http:') ||
            content.startsWith('https:') ||
            content.startsWith('/')
          )
            throw new ApiError(400, 'Use base64 ou preserve a URL atual da imagem.');
          const savedPath = await saveImage(content, type, config.uploadDir);
          createdPaths.push(savedPath);
          if (row) removedPaths.push(row.path);
          return { ...rest, path: savedPath };
        },
      );
      await updateChildren(product, Option, options, transaction, async ({ values, ...rest }) => ({
        ...rest,
        ...(values ? { values: values.join(',') } : {}),
      }));
      return product.id;
    });
  } catch (error) {
    // Files are outside the SQL transaction; compensate only uncommitted writes.
    await removeImages(createdPaths, config.uploadDir);
    throw error;
  }
  await removeImages(removedPaths, config.uploadDir);
  return productId;
}

function filters(query) {
  const predicates = [];
  const where = {};
  if (query.match !== undefined) {
    if (!query.match.trim() || query.match.length > 255)
      throw new ApiError(400, 'Termo de busca inválido.');
    const term = `%${query.match.replace(/[\\%_]/g, '\\$&')}%`;
    where[Op.or] = [{ name: { [Op.like]: term } }, { description: { [Op.like]: term } }];
  }
  if (query.category_ids !== undefined) {
    const ids = query.category_ids.split(',').map(parseId);
    predicates.push(
      literal(
        `EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = Product.id AND pc.category_id IN (${ids.join(',')}))`,
      ),
    );
  }
  if (query['price-range'] !== undefined) {
    const range = /^(\d+(?:\.\d{1,2})?)-(\d+(?:\.\d{1,2})?)$/.exec(query['price-range']);
    if (!range || Number(range[1]) > Number(range[2]) || Number(range[2]) > 99999999.99)
      throw new ApiError(400, 'Intervalo de preços inválido.');
    where.price = { [Op.between]: [Number(range[1]), Number(range[2])] };
  }
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith('option[')) continue;
    const id = parseId(key.slice(7, -1));
    const values = value.split(',');
    if (values.some((v) => !v.trim() || v.length > 255))
      throw new ApiError(400, 'Filtro de opção inválido.');
    // Values are escaped by the dialect; IDs have passed integer validation.
    const matches = values
      .map((v) => `FIND_IN_SET(${sequelize.escape(v)}, po.\`values\`) > 0`)
      .join(' OR ');
    predicates.push(
      literal(
        `EXISTS (SELECT 1 FROM product_options po WHERE po.product_id = Product.id AND po.id = ${id} AND (${matches}))`,
      ),
    );
  }
  if (predicates.length) where[Op.and] = predicates;
  return where;
}
module.exports = {
  async create(data, config) {
    return this.get(await write(undefined, data, config));
  },
  async update(id, data, config) {
    await write(id, data, config);
  },
  async get(id) {
    return serialize(await find(id, { include }));
  },
  async remove(id, config) {
    const paths = await sequelize.transaction(async (transaction) => {
      const product = await find(id, { transaction, lock: transaction.LOCK.UPDATE });
      const images = await Image.findAll({ where: { product_id: id }, transaction });
      await product.destroy({ transaction });
      return images.map((image) => image.path);
    });
    await removeImages(paths, config.uploadDir);
  },
  async search(query) {
    const { limit, page, fields: selected, pagination } = searchQuery(query, fields, true);
    const where = filters(query);
    // EXISTS filters keep parent pagination independent of association multiplicity.
    const { rows, count } = await Product.findAndCountAll({
      where,
      ...pagination,
      order: [['id', 'ASC']],
    });
    const products = rows.length
      ? await Product.findAll({
          where: { id: rows.map((p) => p.id) },
          include,
          order: [['id', 'ASC']],
        })
      : [];
    return {
      data: products.map((p) => {
        const data = serialize(p);
        return Object.fromEntries(selected.map((f) => [f, data[f]]));
      }),
      total: count,
      limit,
      page,
    };
  },
};
