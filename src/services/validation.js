const { z } = require('zod');
const { ApiError } = require('../middleware/errors');
const text = z.string().trim().min(1).max(255);
const id = z.number().int().positive().max(2147483647);
const money = z
  .number()
  .min(0)
  .max(99999999.99)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001,
    'Use até duas casas decimais.',
  );
const password = z
  .string()
  .min(8)
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Senha deve ter no máximo 72 bytes.');
const userFields = {
  firstname: text,
  surname: text,
  email: z
    .email()
    .max(255)
    .transform((v) => v.toLowerCase()),
};
const register = z
  .strictObject({ ...userFields, password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Senhas diferentes.',
    path: ['confirmPassword'],
  });
const userUpdate = z
  .strictObject(userFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Informe ao menos um campo.');
const login = z.strictObject({ email: userFields.email, password: z.string().min(1).max(256) });
const category = z.strictObject({ name: text, slug: text, use_in_menu: z.boolean().optional() });
const categoryUpdate = category
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Informe ao menos um campo.');
const optionValues = z
  .array(text.refine((v) => !v.includes(','), 'Valores não podem conter vírgulas.'))
  .min(1)
  .refine((v) => v.join(',').length <= 255, 'Valores excedem 255 caracteres.');
const radius = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^\d+px$/)
      .transform((v) => Number(v.slice(0, -2))),
  ])
  .pipe(z.number().int().min(0).max(2147483647));
const option = z
  .strictObject({
    id: id.optional(),
    deleted: z.boolean().optional(),
    title: text.optional(),
    shape: z.enum(['square', 'circle']).optional(),
    radius: radius.optional(),
    type: z.enum(['text', 'color']).optional(),
    values: optionValues.optional(),
    value: optionValues.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.deleted && !v.id) ctx.addIssue({ code: 'custom', message: 'Exclusão exige id.' });
    if (!v.id && (!v.title || !(v.values || v.value)))
      ctx.addIssue({ code: 'custom', message: 'Nova opção exige title e values.' });
    if (v.values && v.value)
      ctx.addIssue({ code: 'custom', message: 'Envie apenas values ou value.' });
  })
  .transform(({ value, ...v }) => ({ ...v, ...(value ? { values: value } : {}) }));
const image = z
  .strictObject({
    id: id.optional(),
    deleted: z.boolean().optional(),
    enabled: z.boolean().optional(),
    type: z.enum(['image/png', 'image/jpeg', 'image/jpg']).optional(),
    content: z
      .string()
      .min(1)
      .max(7 * 1024 * 1024)
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.deleted && !v.id) ctx.addIssue({ code: 'custom', message: 'Exclusão exige id.' });
    if (!v.id && (!v.content || !v.type))
      ctx.addIssue({ code: 'custom', message: 'Nova imagem exige type e content.' });
  });
const product = z.strictObject({
  name: text,
  slug: text,
  enabled: z.boolean().optional(),
  use_in_menu: z.boolean().optional(),
  stock: z.number().int().min(0).max(2147483647).optional(),
  description: z.string().max(255).nullable().optional(),
  price: money,
  price_with_discount: money,
  category_ids: z
    .array(id)
    .max(100)
    .refine((v) => new Set(v).size === v.length, 'Categorias repetidas.')
    .optional(),
  images: z.array(image).max(20).optional(),
  options: z.array(option).max(100).optional(),
});
const productUpdate = product
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Informe ao menos um campo.');

function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
    throw new ApiError(400, 'ID inválido.');
  return id.parse(Number(value));
}
function searchQuery(query, allowedFields, productSearch = false) {
  const allowed = [
    'limit',
    'page',
    'fields',
    ...(productSearch ? ['match', 'category_ids', 'price-range'] : ['use_in_menu']),
  ];
  for (const [key, value] of Object.entries(query)) {
    if (
      (!allowed.includes(key) && !(productSearch && /^option\[[1-9]\d*\]$/.test(key))) ||
      typeof value !== 'string'
    )
      throw new ApiError(400, 'Parâmetro de busca inválido.');
  }
  const integer = (value, fallback) => {
    if (value === undefined) return fallback;
    if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw new ApiError(400, 'Paginação inválida.');
    return Number(value);
  };
  const limit = integer(query.limit, 12);
  const page = limit === -1 ? 1 : integer(query.page, 1);
  if (
    (limit !== -1 && (limit < 1 || limit > 100)) ||
    page < 1 ||
    !Number.isSafeInteger((page - 1) * limit)
  )
    throw new ApiError(400, 'Paginação inválida; limit deve ser -1 ou de 1 a 100.');
  const fields = query.fields === undefined ? allowedFields : query.fields.split(',');
  if (!fields.length || fields.some((field) => !allowedFields.includes(field)))
    throw new ApiError(400, 'Campos inválidos.');
  if (query.use_in_menu !== undefined && !['true', 'false'].includes(query.use_in_menu))
    throw new ApiError(400, 'use_in_menu deve ser true ou false.');
  return {
    limit,
    page,
    fields,
    ...(limit === -1 ? {} : { pagination: { limit, offset: (page - 1) * limit } }),
  };
}
module.exports = {
  register,
  userUpdate,
  login,
  category,
  categoryUpdate,
  product,
  productUpdate,
  parseId,
  searchQuery,
};
