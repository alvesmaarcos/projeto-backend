const v = require('../../src/services/validation');
describe('contratos e validação', () => {
  test('normaliza opções e preserva atualizações parciais', () => {
    expect(
      v.productUpdate.parse({ options: [{ title: 'Tamanho', value: ['M', 'G'], radius: '4px' }] })
        .options[0],
    ).toEqual({ title: 'Tamanho', values: ['M', 'G'], radius: 4 });
    expect(v.productUpdate.parse({ stock: 0 })).toEqual({ stock: 0 });
  });
  test.each([
    { options: [{ title: 'Cor', values: ['a,b'] }] },
    { options: [{ title: 'Cor', value: ['a'], values: ['b'] }] },
    { images: [{ deleted: true }] },
    { price: 1.234 },
    { stock: -1 },
    {},
    { unknown: true },
  ])('rejeita payload inválido %j', (data) => expect(() => v.productUpdate.parse(data)).toThrow());
  test('rejeita confirmação divergente e senhas acima do limite bcrypt', () => {
    const user = {
      firstname: 'A',
      surname: 'B',
      email: 'a@example.com',
      password: '12345678',
      confirmPassword: 'other',
    };
    expect(() => v.register.parse(user)).toThrow();
    expect(() =>
      v.register.parse({ ...user, password: 'é'.repeat(40), confirmPassword: 'é'.repeat(40) }),
    ).toThrow();
  });
  test('paginação e campos', () => {
    expect(v.searchQuery({ limit: '-1', page: 'anything' }, ['id'])).toEqual({
      limit: -1,
      page: 1,
      fields: ['id'],
    });
    for (const q of [
      { limit: '0' },
      { page: '1.5' },
      { fields: 'password' },
      { use_in_menu: 'yes' },
      { limit: ['1', '2'] },
    ])
      expect(() => v.searchQuery(q, ['id'])).toThrow();
  });
  test.each(['0', '-1', '1abc', '1.2', '2147483648'])('rejeita id %s', (id) =>
    expect(() => v.parseId(id)).toThrow(),
  );
});
