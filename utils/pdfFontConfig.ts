import type { Language } from './i18n/types';

export type PdfFontSetId =
  | 'tc'
  | 'sc'
  | 'jp'
  | 'kr'
  | 'latin-ext'
  | 'arabic'
  | 'devanagari';

export type PdfFontSet = {
  id: PdfFontSetId;
  family: string;
  regularVfs: string;
  boldVfs: string;
  regularPath: string;
  boldPath: string;
};

const FONT_BASE = './fonts';

function fontSet(
  id: PdfFontSetId,
  family: string,
  filePrefix: string
): PdfFontSet {
  return {
    id,
    family,
    regularVfs: `${filePrefix}-Regular.ttf`,
    boldVfs: `${filePrefix}-Bold.ttf`,
    regularPath: `${FONT_BASE}/${filePrefix}-Regular.ttf`,
    boldPath: `${FONT_BASE}/${filePrefix}-Bold.ttf`,
  };
}

export const PDF_FONT_SETS: Record<PdfFontSetId, PdfFontSet> = {
  tc: fontSet('tc', 'NotoSansTC', 'NotoSansTC'),
  sc: fontSet('sc', 'NotoSansSC', 'NotoSansSC'),
  jp: fontSet('jp', 'NotoSansJP', 'NotoSansJP'),
  kr: fontSet('kr', 'NotoSansKR', 'NotoSansKR'),
  'latin-ext': fontSet('latin-ext', 'NotoSansLatin', 'NotoSansLatin'),
  arabic: fontSet('arabic', 'NotoSansArabic', 'NotoSansArabic'),
  devanagari: fontSet('devanagari', 'NotoSansDevanagari', 'NotoSansDevanagari'),
};

const LANGUAGE_FONT_SET: Record<Language, PdfFontSetId> = {
  'zh-TW': 'tc',
  'zh-CN': 'sc',
  ja: 'jp',
  ko: 'kr',
  en: 'latin-ext',
  de: 'latin-ext',
  fr: 'latin-ext',
  pt: 'latin-ext',
  ar: 'arabic',
  hi: 'devanagari',
};

export function getPdfFontSetForLanguage(language: Language): PdfFontSet {
  const id = LANGUAGE_FONT_SET[language] ?? 'latin-ext';
  return PDF_FONT_SETS[id];
}

/** PDF 內拉丁混排 fallback（阿拉伯文／印地語子集不含 ASCII） */
export function getPdfLatinFallbackFontSet(): PdfFontSet {
  return PDF_FONT_SETS['latin-ext'];
}
