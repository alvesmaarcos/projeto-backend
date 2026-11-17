const express = require('express');
const request = require('supertest');
const { errorHandler } = require('../../src/middleware/errors');

test('erro assíncrono inesperado retorna 500 sem expor dados internos', async () => {
  const app = express();
  app.get('/', async () => {
    throw new Error('database password private-value');
  });
  app.use(errorHandler);
  const logger = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await request(app).get('/').expect(500);
    expect(response.body).toEqual({ error: { message: 'Erro interno do servidor.' } });
    expect(JSON.stringify(logger.mock.calls)).not.toContain('private-value');
  } finally {
    logger.mockRestore();
  }
});
