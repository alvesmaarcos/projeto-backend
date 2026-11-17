const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { ApiError } = require('../middleware/errors');
const MAX_SIZE = 5 * 1024 * 1024;

async function saveImage(content, type, directory) {
  if (content.length > 4 * Math.ceil(MAX_SIZE / 3))
    throw new ApiError(400, 'Imagem deve ter até 5 MB.');
  if (content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content))
    throw new ApiError(400, 'Base64 inválido.');
  const buffer = Buffer.from(content, 'base64');
  if (buffer.toString('base64') !== content) throw new ApiError(400, 'Base64 inválido.');
  if (!buffer.length || buffer.length > MAX_SIZE)
    throw new ApiError(400, 'Imagem deve ter até 5 MB.');
  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: 25000000, failOn: 'warning' }).metadata();
    await sharp(buffer, { limitInputPixels: 25000000, failOn: 'warning' }).stats();
  } catch {
    throw new ApiError(400, 'Arquivo de imagem inválido.');
  }
  const expected =
    type === 'image/png' ? 'png' : ['image/jpeg', 'image/jpg'].includes(type) ? 'jpeg' : undefined;
  if (!['png', 'jpeg'].includes(metadata.format) || (expected && metadata.format !== expected))
    throw new ApiError(400, 'Tipo da imagem não corresponde ao conteúdo.');
  const filename = `${randomUUID()}.${metadata.format === 'jpeg' ? 'jpg' : 'png'}`;
  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(directory, filename);
  try {
    await fs.writeFile(destination, buffer, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') await fs.unlink(destination).catch(() => {});
    throw error;
  }
  return `/media/${filename}`;
}
async function removeImages(paths, directory) {
  for (const value of paths) {
    if (!/^\/media\/[\w-]+\.(png|jpg)$/.test(value)) continue;
    try {
      await fs.unlink(path.join(directory, path.basename(value)));
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Falha ao limpar arquivo de imagem:', error.code);
    }
  }
}
module.exports = { saveImage, removeImages, MAX_SIZE };
