// Copies the pdf.js worker into /public so the browser can load it from our own domain.
// Runs automatically after `npm install` (see "postinstall" in package.json).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("pdfjs-dist/package.json"));
const src = join(pkgDir, "build", "pdf.worker.min.mjs");
const dest = join(process.cwd(), "public", "pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.error(`pdf.js worker not found at ${src}`);
  process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("Copied pdf.js worker to public/");
