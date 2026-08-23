/**
 * Copy pdfjs's standard font data into the served asset tree.
 *
 * WHY THIS EXISTS
 * pdfjs does not embed the PDF base-14 fonts (Helvetica, Times, Courier and
 * friends). A PDF that names one — which is most documents produced by Office,
 * and every PDF that does not embed its fonts — makes pdfjs fetch the matching
 * .pfb from `standardFontDataUrl`. If that URL is not configured or the files
 * are absent, `page.render()` does not fail: it waits, and the page stays blank
 * with nothing in the console. That is exactly what happened when the viewer was
 * first wired up.
 *
 * The files are copied from the installed package rather than committed, so they
 * can never drift from the pdfjs version in package.json. QMS Desktop is offline
 * software, so they must be served locally — there is no CDN fallback, and the
 * CSP would refuse one anyway.
 */
import { cp, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'node_modules/pdfjs-dist/standard_fonts');
const to = resolve(root, 'public/pdfjs/standard_fonts');

if (!existsSync(from)) {
  console.error(
    `[pdfjs-assets] ${from} is missing. Run "npm install" — the in-app document ` +
      `viewer cannot render PDFs that rely on the standard fonts without it.`,
  );
  process.exit(1);
}

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });

const copied = await readdir(to);
console.log(`[pdfjs-assets] ${copied.length} standard font files ready at public/pdfjs/standard_fonts`);
