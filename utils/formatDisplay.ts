export const formatNumber = (num: number): string => {
  if (!Number.isFinite(num)) return '-';
  const normalized = Math.round(num * 1e8) / 1e8;
  if (normalized % 1 === 0) {
    return normalized.toLocaleString('zh-TW');
  }
  return normalized.toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
};

/** 現金股利單價欄（實領總額）：先四捨五入至分，整數不補 .00，與金額欄一致 */
export const formatCashDividendPrice = (num: number): string => {
  if (!Number.isFinite(num)) return '-';
  const rounded = Math.round(num * 100) / 100;
  return rounded % 1 === 0
    ? rounded.toLocaleString('zh-TW')
    : rounded.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatAmount = (num: number): string =>
  num % 1 === 0
    ? num.toLocaleString('zh-TW')
    : num.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function normalizeHoldingPrice(price: number): number {
  if (!Number.isFinite(price) || Math.abs(price) < 0.0001) return 0;
  return price;
}

/**
 * 持倉現價：固定小數二位。
 * - 不傳 currency：純數字（編輯用，如 158.24）
 * - 傳 currency：含幣別符號（顯示用，如 US$158.24、NT$580.00）
 */
export function formatHoldingPrice(
  price: number,
  currency?: string,
  locale: string = 'zh-TW'
): string {
  const n = normalizeHoldingPrice(price);
  if (!currency || currency.trim() === '' || currency.length !== 3) {
    return n.toFixed(2);
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

export function parseHoldingUnitPrice(input: string): number {
  const cleaned = input.replace(/,/g, '').trim();
  const raw = parseFloat(cleaned);
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * 100) / 100;
}

/** 訂閱方案價格：TWD/JPY/KRW 整數不顯示小數，USD 等顯示兩位小數（與 StoreKit 無關，避免占位價與真實價格式不一致） */
export function formatSubscriptionDisplayPrice(
  priceValue: number,
  currency: string,
  locale: string = 'zh-TW'
): string {
  const normalized = Math.abs(priceValue) < 0.0001 ? 0 : priceValue;
  const code = (currency || 'TWD').trim().toUpperCase();
  const twoDecimals = ['USD', 'EUR', 'GBP', 'HKD', 'AUD', 'CAD', 'CHF', 'SGD'].includes(code);

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: twoDecimals ? 2 : 0,
      maximumFractionDigits: twoDecimals ? 2 : 0,
    }).format(normalized);
  } catch {
    return `${code} ${normalized.toLocaleString(locale)}`;
  }
}
