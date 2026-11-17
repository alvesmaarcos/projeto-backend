const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: 'string', minLength: 1, maxLength: 255 };
const id = { type: 'integer', minimum: 1 };
const boolean = { type: 'boolean' };
const money = { type: 'number', minimum: 0, maximum: 99999999.99, multipleOf: 0.01 };
const object = (properties, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const array = (items) => ({ type: 'array', items });
const user = { firstname: string, surname: string, email: { type: 'string', format: 'email' } };
const category = { name: string, slug: string, use_in_menu: { ...boolean, default: false } };
const option = {
  title: string,
  shape: { type: 'string', enum: ['square', 'circle'], default: 'square' },
  radius: {
    oneOf: [
      { type: 'integer', minimum: 0 },
      { type: 'string', pattern: '^\\d+px$' },
    ],
    default: 0,
  },
  type: { type: 'string', enum: ['text', 'color'], default: 'text' },
  values: {
    ...array(string),
    minItems: 1,
    description: 'Valores sem vírgulas; representação conjunta limitada a 255 caracteres.',
  },
  value: { ...array(string), deprecated: true, description: 'Alias de values; não envie ambos.' },
};
const imageWrite = {
  id,
  deleted: boolean,
  enabled: boolean,
  type: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/jpg'] },
  content: {
    type: 'string',
    description:
      'Base64 puro PNG/JPEG, até 5 MB e 25 milhões de pixels. Em atualização, pode preservar a URL atual.',
  },
};
const product = {
  enabled: { ...boolean, default: false },
  name: string,
  slug: string,
  use_in_menu: { ...boolean, default: false },
  stock: { type: 'integer', minimum: 0, default: 0 },
  description: { type: 'string', maxLength: 255, nullable: true },
  price: money,
  price_with_discount: money,
  category_ids: { ...array(id), maxItems: 100, uniqueItems: true },
};
const schemas = {
  Error: object(
    {
      error: object(
        {
          message: string,
          details: array(object({ field: { type: 'string' }, message: { type: 'string' } })),
        },
        ['message'],
      ),
    },
    ['error'],
  ),
  User: object({ id, ...user }, ['id', ...Object.keys(user)]),
  UserCreate: object(
    {
      ...user,
      password: { type: 'string', minLength: 8, description: 'Máximo de 72 bytes UTF-8.' },
      confirmPassword: { type: 'string' },
    },
    [...Object.keys(user), 'password', 'confirmPassword'],
  ),
  UserUpdate: { ...object(user), minProperties: 1 },
  Login: object({ email: user.email, password: { type: 'string' } }, ['email', 'password']),
  Token: object({ token: { type: 'string' } }, ['token']),
  Category: object({
    id,
    ...category,
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  }),
  CategoryCreate: object(category, ['name', 'slug']),
  CategoryUpdate: { ...object(category), minProperties: 1 },
  ImageWrite: object(imageWrite),
  OptionWrite: object({ id, deleted: boolean, ...option }),
  ProductCreate: object(
    {
      ...product,
      images: { ...array(ref('ImageWrite')), maxItems: 20 },
      options: { ...array(ref('OptionWrite')), maxItems: 100 },
    },
    ['name', 'slug', 'price', 'price_with_discount'],
  ),
  ProductUpdate: {
    ...object({
      ...product,
      images: { ...array(ref('ImageWrite')), maxItems: 20 },
      options: { ...array(ref('OptionWrite')), maxItems: 100 },
    }),
    minProperties: 1,
  },
  Product: object({
    id,
    ...product,
    images: array(
      object({ id, enabled: boolean, content: { type: 'string', example: '/media/uuid.png' } }),
    ),
    options: array(
      object({
        id,
        ...Object.fromEntries(Object.entries(option).filter(([key]) => key !== 'value')),
        radius: { type: 'integer' },
      }),
    ),
  }),
};
const json = (schema) => ({ 'application/json': { schema } });
const response = (description, schema) => ({
  description,
  ...(schema ? { content: json(schema) } : {}),
});
const error = (description) => response(description, ref('Error'));
const parameters = [{ name: 'id', in: 'path', required: true, schema: id }];
const secured = [{ bearerAuth: [] }];
function operation(
  summary,
  result,
  { auth = false, body, status = 200, byId = false, example } = {},
) {
  return {
    summary,
    security: auth ? secured : [],
    ...(byId ? { parameters } : {}),
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref(body), ...(example ? { example } : {}) } },
          },
        }
      : {}),
    responses: {
      [status]: response(
        status === 204 ? 'Operação concluída sem corpo.' : 'Sucesso',
        result ? ref(result) : undefined,
      ),
      400: error('Dados inválidos ou duplicados.'),
      ...(auth ? { 401: error('Token ausente, inválido, expirado ou conta excluída.') } : {}),
      ...(byId ? { 404: error('Recurso não encontrado.') } : {}),
      500: error('Erro interno.'),
    },
  };
}
const paths = {
  '/v1/user': {
    post: operation('Cadastrar usuário', 'User', {
      body: 'UserCreate',
      status: 201,
      example: {
        firstname: 'Ana',
        surname: 'Silva',
        email: 'ana@example.com',
        password: 'senha-segura-123',
        confirmPassword: 'senha-segura-123',
      },
    }),
  },
  '/v1/user/token': { post: operation('Autenticar usuário', 'Token', { body: 'Login' }) },
  '/v1/user/{id}': {
    get: operation('Consultar a própria conta', 'User', { auth: true, byId: true }),
    put: operation('Atualizar a própria conta', null, {
      auth: true,
      byId: true,
      body: 'UserUpdate',
      status: 204,
    }),
    delete: operation('Excluir a própria conta', null, { auth: true, byId: true, status: 204 }),
  },
};
paths['/v1/user/token'].post.responses[401] = error('Credenciais inválidas.');
for (const op of Object.values(paths['/v1/user/{id}']))
  op.responses[403] = error('A conta pertence a outro usuário.');
for (const [resource, schema] of [
  ['category', 'Category'],
  ['product', 'Product'],
]) {
  paths[`/v1/${resource}`] = {
    post: operation(`Criar ${resource}`, schema, {
      auth: true,
      body: `${schema}Create`,
      status: 201,
    }),
  };
  paths[`/v1/${resource}/{id}`] = {
    get: operation(`Consultar ${resource}`, schema, { byId: true }),
    put: {
      ...operation(`Atualizar ${resource}`, null, {
        auth: true,
        byId: true,
        body: `${schema}Update`,
        status: 204,
      }),
      description:
        'Campos omitidos são preservados. category_ids substitui os vínculos; imagens/opções sem id são criadas, com id são atualizadas e com deleted=true são removidas. Novas opções exigem title e values; novas imagens exigem type e content.',
    },
    delete: operation(`Excluir ${resource}`, null, { auth: true, byId: true, status: 204 }),
  };
  const query = (name, type, description, example) => ({
    name,
    in: 'query',
    description,
    schema: { type },
    ...(example !== undefined ? { example } : {}),
  });
  const search = operation(`Buscar ${resource}`, null);
  search.parameters = [
    query('limit', 'integer', '-1 para todos ou 1–100; padrão 12.', 12),
    query('page', 'integer', 'Página >= 1; padrão 1. Ignorada com limit=-1.', 1),
    query(
      'fields',
      'string',
      'Campos separados por vírgula; somente campos da representação pública.',
      'id,name,slug',
    ),
    ...(resource === 'category'
      ? [query('use_in_menu', 'boolean', 'Filtrar exibição no menu.')]
      : [
          query('match', 'string', 'Trecho literal do nome ou descrição.', 'Tênis'),
          query('category_ids', 'string', 'Qualquer categoria listada.', '1,2'),
          query('price-range', 'string', 'Intervalo inclusivo sobre price.', '100-200'),
          query(
            'option[45]',
            'string',
            'Troque 45 pelo ID da opção. Qualquer valor listado; opções diferentes se combinam por AND.',
            'GG,PP',
          ),
        ]),
  ];
  search.responses[200] = response(
    'Página ordenada por ID; total conta produtos/categorias sem duplicações.',
    object({
      data: array(ref(schema)),
      total: { type: 'integer' },
      limit: { type: 'integer' },
      page: { type: 'integer' },
    }),
  );
  paths[`/v1/${resource}/search`] = { get: search };
}
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'GTECH — API de catálogo',
    version: '1.0.0',
    description:
      'CRUD de usuários, categorias e produtos. Cadastro/login públicos. Leituras do catálogo públicas; escritas exigem JWT, sem perfis administrativos. JSON limitado a 40 MB.',
  },
  servers: [{ url: '/' }],
  paths,
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas,
  },
};
