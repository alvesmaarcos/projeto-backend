class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.status || 500;
  let message = error.message;
  let details;
  if (error.name === 'ZodError') {
    status = 400;
    message = 'Dados inválidos.';
    details = error.issues.map(({ path, message: reason }) => ({
      field: path.join('.'),
      message: reason,
    }));
  } else if (
    [
      'SequelizeUniqueConstraintError',
      'SequelizeForeignKeyConstraintError',
      'SequelizeValidationError',
    ].includes(error.name)
  ) {
    status = 400;
    message = 'Dados duplicados, inválidos ou referência inexistente.';
  } else if (error.type === 'entity.parse.failed') {
    status = 400;
    message = 'JSON inválido.';
  } else if (error.type === 'entity.too.large') {
    status = 400;
    message = 'Corpo da requisição excede o limite de 40 MB.';
  }
  if (status >= 500) {
    console.error('Erro interno:', error.name);
    message = 'Erro interno do servidor.';
  }
  res.status(status).json({ error: { message, ...(details ? { details } : {}) } });
}
module.exports = { ApiError, errorHandler };
