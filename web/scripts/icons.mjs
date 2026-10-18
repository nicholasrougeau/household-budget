// Renders the PNG icons (home-screen, maskable, apple-touch) from the SVG mark.
// Run: node scripts/icons.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const mark = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");

// Full-bleed version for iOS (it rounds corners itself) and maskable icons (safe zone = 80%).
const fullBleed = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#1F5C4D"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
    ${mark.replace(/<svg[^>]*>|<\/svg>/g, "").replace(/<rect[^>]*\/>/, "")}
  </g>
</svg>`;

const out = (svg, size, file) =>
  sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toFile(fileURLToPath(new URL(`../public/${file}`, import.meta.url)));

await Promise.all([
  out(mark, 32, "favicon-32.png"),
  out(mark, 192, "icon-192.png"),
  out(mark, 512, "icon-512.png"),
  out(fullBleed(0.92), 180, "apple-touch-icon.png"),
  out(fullBleed(0.78), 512, "icon-maskable-512.png"),
]);
console.log("icons written");
