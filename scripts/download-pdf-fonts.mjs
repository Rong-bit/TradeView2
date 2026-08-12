#!/usr/bin/env node
/**
 * 从 Fontsource CDN 下载 PDF 说明书各语系 Noto Sans 子集（Regular 400 / Bold 700）。
 * 运行：node scripts/download-pdf-fonts.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'fonts');

/** @type {{ filePrefix: string; pkg: string; subset: string }[]} */
const FONT_SPECS = [
  { filePrefix: 'NotoSansTC', pkg: 'noto-sans-tc', subset: 'chinese-traditional' },
  { filePrefix: 'NotoSansSC', pkg: 'noto-sans-sc', subset: 'chinese-simplified' },
  { filePrefix: 'NotoSansJP', pkg: 'noto-sans-jp', subset: 'japanese' },
  { filePrefix: 'NotoSansKR', pkg: 'noto-sans-kr', subset: 'korean' },
  // latin-ext 子集不含基本 ASCII (A-Z)，英文／德法葡说明书会整份空白；须用 latin
  { filePrefix: 'NotoSansLatin', pkg: 'noto-sans', subset: 'latin' },
  { filePrefix: 'NotoSansArabic', pkg: 'noto-sans-arabic', subset: 'arabic' },
  { filePrefix: 'NotoSansDevanagari', pkg: 'noto-sans-devanagari', subset: 'devanagari' },
];

const WEIGHTS = [
  { suffix: 'Regular', weight: 400 },
  { suffix: 'Bold', weight: 700 },
];

async function downloadFont(spec, weightSpec) {
  const url = `https://cdn.jsdelivr.net/fontsource/fonts/${spec.pkg}@latest/${spec.subset}-${weightSpec.weight}-normal.ttf`;
  const outPath = join(OUT_DIR, `${spec.filePrefix}-${weightSpec.suffix}.ttf`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed ${url}: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  console.log(`✓ ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const spec of FONT_SPECS) {
    for (const weight of WEIGHTS) {
      await downloadFont(spec, weight);
    }
  }
  console.log('All PDF fonts downloaded.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
