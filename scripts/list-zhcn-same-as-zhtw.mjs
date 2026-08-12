import { zhTW } from '../utils/i18n/zh-TW.ts';
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

const tw = flatten(zhTW);
const cn = flatten(zhCN);
const same = Object.keys(tw).filter((k) => cn[k] === tw[k]).sort();
console.log('same count:', same.length);
for (const k of same) console.log(k + '\t' + tw[k]);
