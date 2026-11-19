// Генерирует растровые иконки из src/app/icon.svg (единственный исходник логотипа).
// Запуск: npm run icons
import fs from 'node:fs';
import sharp from 'sharp';

const svg = fs.readFileSync('src/app/icon.svg', 'utf8');
// iOS и аватарки скругляют/обрезают углы сами — для них плашка на весь квадрат.
const fullBleed = Buffer.from(svg.replace(/(<rect id="tile"[^>]*?) rx="[^"]*"/, '$1'));
const rounded = Buffer.from(svg);

const png = (src, size) =>
  sharp(src, { density: (72 * size) / 64 }).resize(size, size).ensureAlpha().png().toBuffer();

// favicon.ico: PNG-кадры 16/32/48 внутри ICO-контейнера.
const frames = await Promise.all([16, 32, 48].map(async (s) => ({ s, b: await png(rounded, s) })));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = 6 + 16 * frames.length;
const entries = frames.map(({ s, b }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(b.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += b.length;
  return e;
});
fs.writeFileSync('src/app/favicon.ico', Buffer.concat([header, ...entries, ...frames.map((f) => f.b)]));

fs.writeFileSync('src/app/apple-icon.png', await png(fullBleed, 180));

// Аватарки для Vercel-проекта и Telegram-бота (загружаются вручную).
fs.mkdirSync('docs/brand', { recursive: true });
fs.writeFileSync('docs/brand/kanbot-avatar-640.png', await png(fullBleed, 640));

console.log('icons: favicon.ico, apple-icon.png, docs/brand/kanbot-avatar-640.png');
