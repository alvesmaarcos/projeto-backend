const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' };
const required = (type) => ({ type, allowNull: false });
const flag = () => ({ ...required(D.BOOLEAN), defaultValue: false });

const User = sequelize.define(
  'User',
  {
    firstname: required(D.STRING),
    surname: required(D.STRING),
    email: { ...required(D.STRING), unique: true },
    password: required(D.STRING),
  },
  { ...timestamps, tableName: 'users', defaultScope: { attributes: { exclude: ['password'] } } },
);
const Category = sequelize.define(
  'Category',
  {
    name: required(D.STRING),
    slug: required(D.STRING),
    use_in_menu: flag(),
  },
  { ...timestamps, tableName: 'categories' },
);
const Product = sequelize.define(
  'Product',
  {
    enabled: flag(),
    name: required(D.STRING),
    slug: required(D.STRING),
    use_in_menu: flag(),
    stock: { ...required(D.INTEGER), defaultValue: 0 },
    description: D.STRING,
    price: required(D.DECIMAL(10, 2)),
    price_with_discount: required(D.DECIMAL(10, 2)),
  },
  { ...timestamps, tableName: 'products' },
);
const Image = sequelize.define(
  'Image',
  { enabled: flag(), path: required(D.STRING) },
  { tableName: 'product_images', timestamps: false },
);
const Option = sequelize.define(
  'Option',
  {
    title: required(D.STRING),
    shape: { type: D.ENUM('square', 'circle'), defaultValue: 'square', allowNull: false },
    radius: { type: D.INTEGER, defaultValue: 0, allowNull: false },
    type: { type: D.ENUM('text', 'color'), defaultValue: 'text', allowNull: false },
    values: required(D.STRING),
  },
  { tableName: 'product_options', timestamps: false },
);
const ProductCategory = sequelize.define(
  'ProductCategory',
  {},
  { tableName: 'product_categories', timestamps: false },
);
Product.hasMany(Image, {
  as: 'images',
  foreignKey: { name: 'product_id', allowNull: false },
  onDelete: 'CASCADE',
});
Product.hasMany(Option, {
  as: 'options',
  foreignKey: { name: 'product_id', allowNull: false },
  onDelete: 'CASCADE',
});
Product.belongsToMany(Category, {
  as: 'categories',
  through: ProductCategory,
  foreignKey: 'product_id',
  otherKey: 'category_id',
});
Category.belongsToMany(Product, {
  as: 'products',
  through: ProductCategory,
  foreignKey: 'category_id',
  otherKey: 'product_id',
});
module.exports = { sequelize, User, Category, Product, Image, Option, ProductCategory };
