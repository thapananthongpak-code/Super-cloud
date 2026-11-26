// Generates PWA icons from public/icons-source.svg. Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { mkdirSync, readFileSync } from "node:fs";

const svg = readFileSync("public/icons-source.svg");
mkdirSync("public/icons", { recursive: true });
await sharp(svg).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(svg).resize(512, 512).png().toFile("public/icons/icon-512.png");
await sharp(svg).resize(180, 180).flatten({ background: "#e8692b" }).png().toFile("public/icons/apple-touch-icon.png");
// Maskable: full-bleed background with the artwork inside the safe zone.
const inner = await sharp(svg).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#e8692b" } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile("public/icons/icon-maskable-512.png");
console.log("Icons written to public/icons/");
