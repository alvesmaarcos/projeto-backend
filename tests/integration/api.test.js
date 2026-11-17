// Only the dedicated test database may be reset by this suite.
require('dotenv').config({ path: '.env.test', quiet: true });
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'catalog_test';
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT || '3307';
process.env.DB_USER = process.env.TEST_DB_USER || 'catalog';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'test_catalog_password';
process.env.JWT_SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
process.env.UPLOAD_DIR = 'test-uploads';
if (!process.env.DB_NAME.endsWith('_test'))
  throw new Error('TEST_DB_NAME precisa terminar em _test.');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const { sequelize, User, Product, Image, Option, ProductCategory } = require('../../src/models');
const migrations = require('../../src/config/migrations');
const createApp = require('../../src/app');
const app = createApp();
let token;
let userId;
let png;
const auth = () => ({ Authorization: `Bearer ${token}` });
const user = {
  firstname: 'Ana',
  surname: 'Silva',
  email: 'ana@example.com',
  password: 'senha-segura',
  confirmPassword: 'senha-segura',
};
const product = { name: 'Tênis', slug: 'tenis', price: 120.5, price_with_discount: 100, stock: 5 };
beforeAll(async () => {
  await sequelize.authenticate();
  await migrations.down({ to: 0 });
  await migrations.up();
  await migrations.down({ to: 0 });
  await migrations.up();
  await fs.mkdir(process.env.UPLOAD_DIR, { recursive: true });
  png = (
    await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } })
      .png()
      .toBuffer()
  ).toString('base64');
});
afterAll(async () => {
  await sequelize.close();
});
test('cadastro, credenciais, hash, validação e unicidade', async () => {
  await request(app)
    .post('/v1/user')
    .send({ ...user, confirmPassword: 'wrong' })
    .expect(400);
  const response = await request(app).post('/v1/user').send(user).expect(201);
  userId = response.body.id;
  expect(response.body).not.toHaveProperty('password');
  expect((await User.unscoped().findByPk(userId)).password).toMatch(/^\$2/);
  await request(app).post('/v1/user').send(user).expect(400);
  await request(app)
    .post('/v1/user/token')
    .send({ email: user.email, password: 'wrong' })
    .expect(401);
  const login = await request(app)
    .post('/v1/user/token')
    .send({ email: user.email, password: user.password })
    .expect(200);
  token = login.body.token;
});
test('autorização e atualização da própria conta', async () => {
  const url = `/v1/user/${userId}`;
  await request(app).get(url).expect(401);
  await request(app).get(url).set({ Authorization: 'Bearer invalid' }).expect(401);
  const expired = jwt.sign({}, process.env.JWT_SECRET, { subject: String(userId), expiresIn: -1 });
  await request(app)
    .get(url)
    .set({ Authorization: `Bearer ${expired}` })
    .expect(401);
  await request(app)
    .get(`/v1/user/${userId + 1}`)
    .set(auth())
    .expect(403);
  await request(app)
    .put(`/v1/user/${userId + 1}`)
    .set(auth())
    .send({ firstname: 'X' })
    .expect(403);
  await request(app)
    .delete(`/v1/user/${userId + 1}`)
    .set(auth())
    .expect(403);
  const updated = await request(app).put(url).set(auth()).send({ firstname: 'Maria' }).expect(204);
  expect(updated.text).toBe('');
  const response = await request(app).get(url).set(auth()).expect(200);
  expect(response.body.firstname).toBe('Maria');
  expect(response.body).not.toHaveProperty('password');
});
test('CRUD de categorias, filtros e respostas HTTP', async () => {
  await request(app).post('/v1/category').send({ name: 'Shoes', slug: 'shoes' }).expect(401);
  await request(app).post('/v1/category').set(auth()).send({ name: '' }).expect(400);
  const category = (
    await request(app)
      .post('/v1/category')
      .set(auth())
      .send({ name: 'Shoes', slug: 'shoes', use_in_menu: true })
      .expect(201)
  ).body;
  await request(app).get(`/v1/category/${category.id}`).expect(200);
  const search = await request(app)
    .get('/v1/category/search')
    .query({ use_in_menu: true, fields: 'name', limit: -1 })
    .expect(200);
  expect(search.body).toMatchObject({ total: 1, limit: -1, page: 1, data: [{ name: 'Shoes' }] });
  await request(app).get('/v1/category/search?fields=password').expect(400);
  await request(app).get('/v1/category/search?limit=0').expect(400);
  expect(
    (
      await request(app)
        .put(`/v1/category/${category.id}`)
        .set(auth())
        .send({ name: 'Calçados' })
        .expect(204)
    ).text,
  ).toBe('');
  expect(
    (await request(app).delete(`/v1/category/${category.id}`).set(auth()).expect(204)).text,
  ).toBe('');
  await request(app).get(`/v1/category/${category.id}`).expect(404);
  await request(app).delete(`/v1/category/${category.id}`).set(auth()).expect(404);
});
test('produtos: associações, filtros combinados, paginação e projeção', async () => {
  const categories = [];
  for (const name of ['A', 'B'])
    categories.push(
      (await request(app).post('/v1/category').set(auth()).send({ name, slug: name }).expect(201))
        .body.id,
    );
  const created = await request(app)
    .post('/v1/product')
    .set(auth())
    .send({
      ...product,
      category_ids: categories,
      images: [{ type: 'image/png', content: png }],
      options: [
        { title: 'Tamanho', value: ['M', 'G'], radius: '4px' },
        { title: 'Cor', values: ['azul'] },
      ],
    })
    .expect(201);
  const p = created.body;
  expect(p.category_ids).toEqual(categories);
  expect(p.price).toBe(120.5);
  expect(p.options[0]).toMatchObject({ radius: 4, values: ['M', 'G'] });
  await request(app)
    .get(p.images[0].content)
    .expect('Content-Type', /image\/png/)
    .expect(200);
  const second = (
    await request(app)
      .post('/v1/product')
      .set(auth())
      .send({ ...product, name: 'Outro', slug: 'outro' })
      .expect(201)
  ).body;
  const search = await request(app)
    .get('/v1/product/search')
    .query({
      category_ids: categories.join(','),
      match: 'Tênis',
      'price-range': '100-150',
      [`option[${p.options[0].id}]`]: 'G,PP',
      [`option[${p.options[1].id}]`]: 'azul',
      fields: 'id,name,images',
      limit: 1,
    })
    .expect(200);
  expect(search.body.total).toBe(1);
  expect(Object.keys(search.body.data[0])).toEqual(['id', 'name', 'images']);
  const page = await request(app).get('/v1/product/search?limit=1&page=2').expect(200);
  expect(page.body.data[0].id).toBe(second.id);
  expect(page.body.total).toBe(2);
  expect(
    (await request(app).get('/v1/product/search?limit=-1').expect(200)).body.data,
  ).toHaveLength(2);
  await request(app).get('/v1/product/search?price-range=200-100').expect(400);
  await request(app).get('/v1/product/search?category_ids=1abc').expect(400);
  await request(app).get('/v1/product/search?option[1]=%27%20OR%201=1--').expect(200);
  // Cross-product IDs must fail without retaining scalar changes or new files.
  const beforeFiles = await fs.readdir(process.env.UPLOAD_DIR);
  await request(app)
    .put(`/v1/product/${second.id}`)
    .set(auth())
    .send({
      name: 'Não persistir',
      images: [{ type: 'image/png', content: png }],
      options: [{ id: p.options[0].id, title: 'Inválido' }],
    })
    .expect(400);
  expect(await fs.readdir(process.env.UPLOAD_DIR)).toEqual(beforeFiles);
  expect((await request(app).get(`/v1/product/${second.id}`)).body.name).toBe('Outro');
  await request(app)
    .put(`/v1/product/${second.id}`)
    .set(auth())
    .send({ images: [{ id: p.images[0].id, deleted: true }] })
    .expect(400);
  await request(app)
    .put(`/v1/product/${p.id}`)
    .set(auth())
    .send({
      stock: 8,
      category_ids: [categories[0]],
      images: [{ id: p.images[0].id, content: p.images[0].content }],
      options: [
        { id: p.options[0].id, values: ['GG'] },
        { id: p.options[1].id, deleted: true },
        { title: 'Material', values: ['Algodão'] },
      ],
    })
    .expect(204);
  const changed = (await request(app).get(`/v1/product/${p.id}`).expect(200)).body;
  expect(changed).toMatchObject({ name: 'Tênis', stock: 8, category_ids: [categories[0]] });
  expect(changed.options[0].values).toEqual(['GG']);
  expect(changed.options).toHaveLength(2);
  await request(app)
    .put(`/v1/product/${p.id}`)
    .set(auth())
    .send({ images: [{ id: p.images[0].id, type: 'image/png', content: png }] })
    .expect(204);
  await request(app).get(p.images[0].content).expect(404);
  await request(app).delete(`/v1/category/${categories[0]}`).set(auth()).expect(204);
  expect((await request(app).get(`/v1/product/${p.id}`).expect(200)).body.category_ids).toEqual([]);
  const paths = (await request(app).get(`/v1/product/${p.id}`)).body.images.map((i) => i.content);
  await request(app)
    .put(`/v1/product/${p.id}`)
    .set(auth())
    .send({
      images: [
        { id: (await request(app).get(`/v1/product/${p.id}`)).body.images[0].id, deleted: true },
      ],
    })
    .expect(204);
  expect((await request(app).get(`/v1/product/${p.id}`)).body.images).toEqual([]);
  await request(app)
    .put(`/v1/product/${p.id}`)
    .set(auth())
    .send({ images: [{ type: 'image/png', content: png }] })
    .expect(204);
  paths.push(...(await request(app).get(`/v1/product/${p.id}`)).body.images.map((i) => i.content));
  await request(app).delete(`/v1/product/${p.id}`).set(auth()).expect(204);
  expect(await Image.count({ where: { product_id: p.id } })).toBe(0);
  expect(await Option.count({ where: { product_id: p.id } })).toBe(0);
  expect(await ProductCategory.count({ where: { product_id: p.id } })).toBe(0);
  for (const path of paths) await request(app).get(path).expect(404);
  await request(app).get(`/v1/product/${p.id}`).expect(404);
});
test('rollback de criação, validação e documentação', async () => {
  const count = await Product.count();
  await request(app)
    .post('/v1/product')
    .set(auth())
    .send({ ...product, category_ids: [2147483647] })
    .expect(400);
  await request(app)
    .post('/v1/product')
    .set(auth())
    .send({
      ...product,
      images: [{ type: 'image/png', content: Buffer.from('fake').toString('base64') }],
    })
    .expect(400);
  expect(await Product.count()).toBe(count);
  await request(app).get('/v1/product/not-an-id').expect(400);
  await request(app).put('/v1/product/2147483647').set(auth()).send({ name: 'X' }).expect(404);
  await request(app).post('/v1/user').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).get('/unknown').expect(404);
  await request(app).get('/docs/').expect(200);
  const spec = (await request(app).get('/openapi.json').expect(200)).body;
  expect(Object.keys(spec.paths)).toHaveLength(9);
  expect(spec.paths['/v1/product/{id}'].put.responses).toHaveProperty('204');
  expect(spec.paths['/v1/user/token'].post.security).toEqual([]);
});
test('conta excluída invalida o token existente', async () => {
  await request(app).delete(`/v1/user/${userId}`).set(auth()).expect(204);
  await request(app).post('/v1/category').set(auth()).send({ name: 'X', slug: 'x' }).expect(401);
});
