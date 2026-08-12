/** 從現金股息備註解析「每股 × 持股」明細（支援各語系自動匯入模板） */
export type CashDividendNoteBreakdown = {
  perShare: number;
  shares: number;
};

const NOTE_BREAKDOWN_PATTERNS: RegExp[] = [
  /每股\s*([\d,.\s]+)\s*[，,]\s*持股\s*([\d,.\s]+)/,
  /([\d,.]+)\s*per share[,\s]+([\d,.]+)\s*shares/i,
  /1株\s*([\d,.]+)[、,]\s*保有\s*([\d,.]+)\s*株/,
  /주당\s*([\d,.]+)[,\s]+보유\s*([\d,.]+)/,
  /([\d,.]+)\s*pro Aktie[,\s]+([\d,.]+)\s*Stück/i,
  /([\d,.]+)\s*par action[,\s]+([\d,.]+)\s*actions/i,
  /por ação\s*([\d,.]+)[,\s]+posição\s*([\d,.]+)/i,
  /لكل سهم\s*([\d,.]+)[،,]\s*الكمية\s*([\d,.]+)/,
  /प्रति शेयर\s*([\d,.]+)[,\s]+होल्डिंग\s*([\d,.]+)/,
];

function parseNoteNumber(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

export function parseCashDividendNoteBreakdown(
  note: string | undefined | null
): CashDividendNoteBreakdown | null {
  const text = (note ?? '').trim();
  if (!text) return null;

  for (const pattern of NOTE_BREAKDOWN_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const perShare = parseNoteNumber(match[1]);
    const shares = parseNoteNumber(match[2]);
    if (perShare > 0 && shares > 0) {
      return { perShare, shares };
    }
  }
  return null;
}
