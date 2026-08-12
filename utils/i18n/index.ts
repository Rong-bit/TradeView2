// utils/i18n/index.ts
// 由此目錄提供 i18n；請使用 import ... from '../utils/i18n'（勿再新增單檔 utils/i18n.ts，以免覆蓋此目錄）。
//
// 若舊單檔裡曾有：
//   marketChart: en.marketChart,
//   waterfall: en.waterfall,
//   dividendHeatmap: en.dividendHeatmap,
// 請改到「該語言檔」utils/i18n/xx.ts：
//   • 若該檔已是 export const xx = { ...en, ... }，不必再寫這三行（已由 en 繼承）。
//   • 否則在該檔 import { en } from './en'，於物件內加上上列三行，或貼上 en.ts 裡對應區塊並改翻譯。

export type { Language, BaseCurrencyCode, Translations } from './types';
export { LANGUAGES } from './types';

import { zhTW } from './zh-TW';
import { zhCN } from './zh-CN';
import { en }   from './en';
import { ja }   from './ja';
import { ko }   from './ko';
import { de }   from './de';
import { fr }   from './fr';
import { hi }   from './hi';
import { ar }   from './ar';
import { pt }   from './pt';

import type { Language, Translations } from './types';
import type { BaseCurrencyCode } from './types';

const translations: Record<Language, Translations> = {
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  en,
  ja,
  ko,
  de,
  fr,
  hi,
  ar,
  pt,
};

export const getLanguage = (): Language => {
  const saved = localStorage.getItem('tf_language');
  const valid: Language[] = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko', 'de', 'fr', 'hi', 'ar', 'pt'];
  return valid.includes(saved as Language) ? (saved as Language) : 'zh-TW';
};

export const setLanguage = (lang: Language): void => {
  localStorage.setItem('tf_language', lang);
};

export const t = (lang: Language): Translations =>
  translations[lang] ?? translations['zh-TW'];

/** UI 語言 → Intl.NumberFormat / formatCurrency 用的 BCP 47 locale */
export function languageToLocale(lang: Language): string {
  const map: Record<Language, string> = {
    'zh-TW': 'zh-TW',
    'zh-CN': 'zh-CN',
    en: 'en-US',
    ja: 'ja-JP',
    ko: 'ko-KR',
    de: 'de-DE',
    fr: 'fr-FR',
    hi: 'hi-IN',
    ar: 'ar',
    pt: 'pt-BR',
  };
  return map[lang] ?? 'en-US';
}

export const translate = (
  key: string,
  lang: Language,
  params?: Record<string, string | number>,
): string => {
  const keys = key.split('.');
  let value: unknown = translations[lang] ?? translations['zh-TW'];
  for (const k of keys) {
    value = (value as Record<string, unknown>)?.[k];
    if (value === undefined) return key;
  }
  if (typeof value === 'string' && params) {
    return value.replace(/\{(\w+)\}/g, (match, p) =>
      p in params ? String(params[p]) : match,
    );
  }
  return typeof value === 'string' ? value : key;
};

export const getBaseCurrencyLabel = (code: BaseCurrencyCode, lang: Language): string => {
  const tr = translations[lang] ?? translations['zh-TW'];
  return tr?.baseCurrency?.[code] ?? code;
};
