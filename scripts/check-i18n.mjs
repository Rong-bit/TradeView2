import { zhTW } from '../utils/i18n/zh-TW.ts';
import { zhCN } from '../utils/i18n/zh-CN.ts';
import { en } from '../utils/i18n/en.ts';
import { ja } from '../utils/i18n/ja.ts';
import { ko } from '../utils/i18n/ko.ts';
import { de } from '../utils/i18n/de.ts';
import { fr } from '../utils/i18n/fr.ts';
import { hi } from '../utils/i18n/hi.ts';
import { ar } from '../utils/i18n/ar.ts';
import { pt } from '../utils/i18n/pt.ts';

const langs = { 'zh-TW': zhTW, 'zh-CN': zhCN, en, ja, ko, de, fr, hi, ar, pt };

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
const refKeys = Object.keys(ref).sort();
const enFlat = flatten(en);

console.log('zh-TW keys:', refKeys.length);

for (const [code, tr] of Object.entries(langs)) {
  if (code === 'zh-TW') continue;
  const flat = flatten(tr);
  const missing = refKeys.filter((k) => !(k in flat));
  const sameEn = refKeys.filter((k) => k in flat && flat[k] === enFlat[k] && code !== 'en');
  const sameZh = refKeys.filter((k) => k in flat && flat[k] === ref[k] && code === 'zh-CN');
  console.log(`\n=== ${code} ===`);
  console.log('keys:', Object.keys(flat).length, 'missing:', missing.length);
  if (missing.length) console.log('missing:', missing.slice(0, 20).join(', '));
  if (code !== 'en') console.log('identical to en:', sameEn.length);
  if (code === 'zh-CN') console.log('identical to zh-TW (need simplify):', sameZh.length);
}
