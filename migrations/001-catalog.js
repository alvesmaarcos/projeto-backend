const { DataTypes: D } = require('sequelize');
const required = (type) => ({ type, allowNull: false });
const id = () => ({ ...required(D.INTEGER), primaryKey: true, autoIncrement: true });
const flag = () => ({ ...required(D.BOOLEAN), defaultValue: false });
const timestamps = () => ({ created_at: required(D.DATE), updated_at: required(D.DATE) });
const reference = (model) => ({
  ...required(D.INTEGER),
  references: { model, key: 'id' },
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});

module.exports = {
  async up({ context: q }) {
    await q.createTable('users', {
      id: id(),
      firstname: required(D.STRING),
      surname: required(D.STRING),
      email: { ...required(D.STRING), unique: true },
      password: required(D.STRING),
      ...timestamps(),
    });
    await q.createTable('categories', {
      id: id(),
      name: required(D.STRING),
      slug: required(D.STRING),
      use_in_menu: flag(),
      ...timestamps(),
    });
    await q.createTable('products', {
      id: id(),
      enabled: flag(),
      name: required(D.STRING),
      slug: required(D.STRING),
      use_in_menu: flag(),
      stock: { ...required(D.INTEGER), defaultValue: 0 },
      description: D.STRING,
      price: required(D.DECIMAL(10, 2)),
      price_with_discount: required(D.DECIMAL(10, 2)),
      ...timestamps(),
    });
    await q.createTable('product_images', {
      id: id(),
      product_id: reference('products'),
      enabled: flag(),
      path: required(D.STRING),
    });
    await q.createTable('product_options', {
      id: id(),
      product_id: reference('products'),
      title: required(D.STRING),
      shape: { ...required(D.ENUM('square', 'circle')), defaultValue: 'square' },
      radius: { ...required(D.INTEGER), defaultValue: 0 },
      type: { ...required(D.ENUM('text', 'color')), defaultValue: 'text' },
      values: required(D.STRING),
    });
    await q.createTable('product_categories', {
      product_id: { ...reference('products'), primaryKey: true },
      category_id: { ...reference('categories'), primaryKey: true },
    });
    await q.addIndex('products', ['price']);
    await q.addIndex('categories', ['use_in_menu']);
  },
  async down({ context: q }) {
    for (const table of [
      'product_categories',
      'product_options',
      'product_images',
      'products',
      'categories',
      'users',
    ])
      await q.dropTable(table);
  },
};
