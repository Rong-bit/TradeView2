import { Market, TransactionType } from '../types';
import { dividendScheduleMapKey, marketToYahooMarketForDividends } from './dividendTaxHelpers';

/** 與 useActualDividends 一致 */
export const ACTUAL_DIVIDENDS_LS_KEY = 'tf-actual-dividends-v14';

export const ACTUAL_DIVIDENDS_INVALIDATE_EVENT = 'tf-actual-dividends-invalidate';

function readCache(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(ACTUAL_DIVIDENDS_LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, unknown>;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

/** 清除單一標的的待確認實績配息快取，並通知 useActualDividends 重新抓取。 */
export function invalidateActualDividendCache(market: Market, ticker: string): void {
  if (!marketToYahooMarketForDividends(market)) return;
  const trimmed = ticker.trim();
  if (!trimmed) return;

  const key = dividendScheduleMapKey(market, trimmed);
  try {
    const all = readCache();
    if (key in all) {
      delete all[key];
      localStorage.setItem(ACTUAL_DIVIDENDS_LS_KEY, JSON.stringify(all));
    }
  } catch {
    /* quota / private mode */
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(ACTUAL_DIVIDENDS_INVALIDATE_EVENT, { detail: { key } })
    );
  }
}

export function invalidateActualDividendCacheForTx(tx: {
  type: TransactionType;
  market: Market;
  ticker: string;
}): void {
  if (tx.type !== TransactionType.CASH_DIVIDEND) return;
  invalidateActualDividendCache(tx.market, tx.ticker);
}
