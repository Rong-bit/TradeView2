import { Market, StockSplitEvent } from '../types';

export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export function computeSplitRatio(sharesFrom: number, sharesTo: number): number | null {
  if (!Number.isFinite(sharesFrom) || !Number.isFinite(sharesTo)) return null;
  if (sharesFrom <= 0 || sharesTo <= 0) return null;
  return sharesTo / sharesFrom;
}

export function splitSymbolKey(market: Market, ticker: string): string {
  return `${market}-${normalizeTicker(ticker)}`;
}

export function getSplitsForSymbol(
  splits: StockSplitEvent[],
  market: Market,
  ticker: string
): StockSplitEvent[] {
  const key = splitSymbolKey(market, ticker);
  return splits
    .filter(s => splitSymbolKey(s.market, s.ticker) === key)
    .sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime());
}

/** 持倉模擬用：套用尚未處理、且 effectiveDate <= txDate 的拆分 */
export function applyPendingSplitsToPosition(
  pos: { quantity: number; totalCost: number },
  splits: StockSplitEvent[],
  splitCursor: { index: number },
  txDate: string
): void {
  const txTs = new Date(txDate).getTime();
  while (splitCursor.index < splits.length) {
    const split = splits[splitCursor.index];
    if (new Date(split.effectiveDate).getTime() > txTs) break;
    if (pos.quantity > 0) {
      pos.quantity *= split.ratio;
      // totalCost 不變；賣出成本模擬僅用 quantity + totalCost
      splitCursor.index += 1;
    }
    // 股數為 0 時不標記為已套用，留待後續交易或結算日再處理
  }
}

/** calculateHoldings 用：套用拆分並更新 avgCost */
export function applyPendingSplitsToHolding(
  h: { quantity: number; avgCost: number; totalCost: number },
  splits: StockSplitEvent[],
  splitCursor: { index: number },
  txDate: string
): void {
  const txTs = new Date(txDate).getTime();
  while (splitCursor.index < splits.length) {
    const split = splits[splitCursor.index];
    if (new Date(split.effectiveDate).getTime() > txTs) break;
    if (h.quantity > 0) {
      h.quantity *= split.ratio;
      h.avgCost = h.quantity > 0 ? h.totalCost / h.quantity : 0;
      splitCursor.index += 1;
    }
    // 股數為 0 時不標記為已套用，留待後續交易或結算日再處理
  }
}

export function buildSplitCursorMap(
  stockSplits: StockSplitEvent[]
): Map<string, { splits: StockSplitEvent[]; index: number }> {
  const map = new Map<string, { splits: StockSplitEvent[]; index: number }>();
  const seen = new Set<string>();
  for (const s of stockSplits) {
    const key = splitSymbolKey(s.market, s.ticker);
    if (seen.has(key)) continue;
    seen.add(key);
    map.set(key, { splits: getSplitsForSymbol(stockSplits, s.market, s.ticker), index: 0 });
  }
  return map;
}

export function isDuplicateSplit(
  splits: StockSplitEvent[],
  market: Market,
  ticker: string,
  effectiveDate: string,
  excludeId?: string
): boolean {
  const norm = normalizeTicker(ticker);
  return splits.some(
    s =>
      s.id !== excludeId &&
      s.market === market &&
      normalizeTicker(s.ticker) === norm &&
      s.effectiveDate === effectiveDate
  );
}
