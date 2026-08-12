import { Market, Transaction, TransactionType } from '../types';
import { dividendScheduleMapKey } from './dividendTaxHelpers';

const LS_KEY = 'tf-pending-dividend-dismissals-v1';
export const PENDING_DIVIDEND_DISMISSALS_CHANGED_EVENT = 'tf-pending-dividend-dismissals-changed';

function notifyDismissalsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PENDING_DIVIDEND_DISMISSALS_CHANGED_EVENT));
}

export function readDismissedPendingDividendKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set();
  }
}

export function persistDismissedPendingDividendKeys(keys: Set<string>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...keys]));
    notifyDismissalsChanged();
  } catch {
    /* quota / private mode */
  }
}

/** @deprecated 請改用 clearDismissedPendingDividendKeysForTransaction，避免多帳戶同 ticker 互相影響 */
export function clearDismissedPendingDividendKeysForTicker(market: Market, ticker: string): void {
  const prefix = `${dividendScheduleMapKey(market, ticker)}|`;
  const keys = readDismissedPendingDividendKeys();
  let changed = false;
  for (const key of [...keys]) {
    if (key.startsWith(prefix)) {
      keys.delete(key);
      changed = true;
    }
  }
  if (changed) persistDismissedPendingDividendKeys(keys);
}

/** 刪除／更新現金股息時，僅還原「該帳戶」的待確認列（key 結尾為 |accountId） */
export function clearDismissedPendingDividendKeysForTransaction(tx: Transaction): void {
  if (tx.type !== TransactionType.CASH_DIVIDEND || !tx.accountId) return;
  const prefix = `${dividendScheduleMapKey(tx.market, tx.ticker)}|`;
  const accountSuffix = `|${tx.accountId}`;
  const keys = readDismissedPendingDividendKeys();
  let changed = false;
  for (const key of [...keys]) {
    if (key.startsWith(prefix) && key.endsWith(accountSuffix)) {
      keys.delete(key);
      changed = true;
    }
  }
  if (changed) persistDismissedPendingDividendKeys(keys);
}

const LIST_VISIBLE_LS_KEY = 'tf-pending-dividend-list-visible-v1';

export function readPendingDividendListVisible(): boolean {
  try {
    return localStorage.getItem(LIST_VISIBLE_LS_KEY) !== '0';
  } catch {
    return true;
  }
}

export function persistPendingDividendListVisible(visible: boolean): void {
  try {
    localStorage.setItem(LIST_VISIBLE_LS_KEY, visible ? '1' : '0');
  } catch {
    /* quota / private mode */
  }
}
