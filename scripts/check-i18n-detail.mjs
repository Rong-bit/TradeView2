import { zhTW } from '../utils/i18n/zh-TW.ts';
import { en } from '../utils/i18n/en.ts';
import { de } from '../utils/i18n/de.ts';
import { fr } from '../utils/i18n/fr.ts';
import { pt } from '../utils/i18n/pt.ts';
import { hi } from '../utils/i18n/hi.ts';
import { ar } from '../utils/i18n/ar.ts';
import { ja } from '../utils/i18n/ja.ts';
import { ko } from '../utils/i18n/ko.ts';
import { zhCN } from '../utils/i18n/zh-CN.ts';

function flatten(obj, prefix = '') {
  const out = {};
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, p));
    else if (typeof v === 'string') out[p] = v;
  }
  return out;
}

const ref = flatten(zhTW);
const enFlat = flatten(en);
const refKeys = Object.keys(ref);

function report(code, tr) {
  const flat = flatten(tr);
  const sameEn = refKeys.filter((k) => k in flat && flat[k] === enFlat[k] && k in enFlat);
  const bySection = {};
  for (const k of sameEn) {
    const sec = k.split('.')[0];
    bySection[sec] = (bySection[sec] || 0) + 1;
  }
  console.log(`\n${code}: ${sameEn.length} still English`);
  console.log('by section:', bySection);
  console.log('sample keys:', sameEn.slice(0, 30).join('\n  '));
}

report('de', de);
report('fr', fr);
report('pt', pt);
report('hi', hi);
report('ar', ar);
report('ja', ja);
report('ko', ko);
report('zh-CN', zhCN);

const cnFlat = flatten(zhCN);
const sameTw = refKeys.filter((k) => cnFlat[k] === ref[k]);
console.log('\nzh-CN same as zh-TW:', sameTw.length);
console.log('sample:', sameTw.slice(0, 40).join('\n  '));
