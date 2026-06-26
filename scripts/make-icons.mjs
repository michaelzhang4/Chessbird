/** Rasterizes static/icons/icon.svg into the PNG sizes the PWA manifest + iOS need. */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';

mkdirSync('static/icons', { recursive: true });
const svg = readFileSync('static/icons/icon.svg');

for (const [size, name] of [
	[192, 'icon-192.png'],
	[512, 'icon-512.png'],
	[512, 'icon-512-maskable.png']
]) {
	await sharp(svg).resize(size, size).png().toFile(`static/icons/${name}`);
	console.log(name);
}

// Apple touch icon: flatten onto solid green (iOS dislikes transparency).
await sharp(svg)
	.resize(180, 180)
	.flatten({ background: '#779556' })
	.png()
	.toFile('static/icons/apple-touch-icon-180.png');
console.log('apple-touch-icon-180.png');
