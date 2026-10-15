import sharp from 'sharp';

for (const size of [48, 96]) {
  await sharp('public/icon.svg')
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`);
}
