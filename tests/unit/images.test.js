const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { saveImage, removeImages, MAX_SIZE } = require('../../src/services/images');
let directory;
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-images-'));
});
afterAll(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});
test('valida, salva e remove PNG sem permitir path traversal', async () => {
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  const saved = await saveImage(png.toString('base64'), 'image/png', directory);
  expect(await fs.readFile(path.join(directory, path.basename(saved)))).toEqual(png);
  await expect(saveImage(png.toString('base64'), 'image/jpeg', directory)).rejects.toMatchObject({
    status: 400,
  });
  await removeImages([saved, '/media/../../outside.png'], directory);
  expect(await fs.readdir(directory)).toEqual([]);
});
test('rejeita base64 inválido, arquivo falso e imagem grande', async () => {
  for (const content of [
    'invalid!',
    Buffer.from('not an image').toString('base64'),
    Buffer.alloc(MAX_SIZE + 1).toString('base64'),
  ]) {
    await expect(saveImage(content, 'image/png', directory)).rejects.toMatchObject({ status: 400 });
  }
});
test('aceita JPEG real e rejeita PNG truncado', async () => {
  const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } })
    .jpeg()
    .toBuffer();
  const saved = await saveImage(jpeg.toString('base64'), 'image/jpg', directory);
  expect(saved).toMatch(/\.jpg$/);
  await removeImages([saved], directory);
  const png = await sharp(jpeg).png().toBuffer();
  await expect(
    saveImage(png.subarray(0, 40).toString('base64'), 'image/png', directory),
  ).rejects.toMatchObject({ status: 400 });
});
