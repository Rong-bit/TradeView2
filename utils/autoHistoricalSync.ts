/**
 * 登入後自動補齊歷史快照（Yahoo 股價／匯率）：
 * - 投資區間內每年（最早交易年～今年）：依季末／年底實際持倉判斷要補的期間
 * - 失敗不寫入空快照，下次登入再試
 * - 已有快照時只補缺價或預設匯率（30），不覆寫既有有效價格
 */
import type { Account, CashFlow, HistoricalData, Transaction } from '../types';
import { Market } from '../types';
import { getPortfolioStateAtDate } from './calculations';
import { fetchHistoricalQuarterEndData, fetchHistoricalYearEndData } from '../services/yahooFinanceService';

type MarketCode = 'US' | 'TW' | 'UK' | 'JP' | 'CN' | 'SZ' | 'IN' | 'CA' | 'FR' | 'HK' | 'KR' | 'DE' | 'AU' | 'SA' | 'BR';

type HoldingTicker = { market: string; ticker: string; display: string };

type PeriodSnap = HistoricalData[string];

function toMarketCode(m: Market): MarketCode {
  if (m === Market.TW) return 'TW';
  if (m === Market.UK) return 'UK';
  if (m === Market.JP) return 'JP';
  if (m === Market.CN) return 'CN';
  if (m === Market.SZ) return 'SZ';
  if (m === Market.IN) return 'IN';
  if (m === Market.CA) return 'CA';
  if (m === Market.FR) return 'FR';
  if (m === Market.HK) return 'HK';
  if (m === Market.KR) return 'KR';
  if (m === Market.DE) return 'DE';
  if (m === Market.AU) return 'AU';
  if (m === Market.SA) return 'SA';
  if (m === Market.BR) return 'BR';
  return 'US';
}

/** 與 HistoricalDataModal／buildQuarterlyTrendData 一致：0=尚無已結束季，1=Q1 已結束… */
export function getCompletedQuarterCount(month0 = new Date().getMonth()): number {
  return Math.floor(month0 / 3);
}

function getInvestmentYearSpan(
  transactions: Transaction[],
  cashFlows: CashFlow[]
): { minYear: number; maxYear: number } {
  const currentYear = new Date().getFullYear();
  let minYear = currentYear;
  let maxYear = currentYear;

  transactions.forEach(t => {
    const y = new Date(t.date).getFullYear();
    minYear = Math.min(minYear, y);
    maxYear = Math.max(maxYear, y);
  });
  cashFlows.forEach(c => {
    const y = new Date(c.date).getFullYear();
    minYear = Math.min(minYear, y);
    maxYear = Math.max(maxYear, y);
  });

  return { minYear, maxYear: Math.max(maxYear, currentYear) };
}

function getHoldingsTickersAtDate(
  date: Date,
  transactions: Transaction[],
  cashFlows: CashFlow[],
  accounts: Account[]
): HoldingTicker[] {
  const { holdings } = getPortfolioStateAtDate(date, transactions, cashFlows, accounts);
  return Object.keys(holdings)
    .filter(k => holdings[k] > 0.000001)
    .map(k => {
      const [market, ticker] = k.split('-');
      const clean = ticker.replace(/\(BAK\)/gi, '');
      const display = market === Market.TW && !clean.includes('TPE:') ? `TPE:${clean}` : clean;
      return { market, ticker, display };
    });
}

function getPriceInSnap(prices: Record<string, number>, t: HoldingTicker): number | undefined {
  const clean = t.ticker.replace(/\(BAK\)/gi, '');
  const v = prices[t.display] ?? prices[clean] ?? prices[t.ticker];
  return v === undefined || v === null ? undefined : v;
}

function rateNeedsSync(snap: PeriodSnap | undefined): boolean {
  if (!snap) return true;
  return !snap.exchangeRate || snap.exchangeRate === 0 || snap.exchangeRate === 30;
}

function filterTickersNeedingSync(tickers: HoldingTicker[], snap: PeriodSnap | undefined): HoldingTicker[] {
  if (!snap || Object.keys(snap.prices).length === 0) return tickers;
  return tickers.filter(t => {
    const v = getPriceInSnap(snap.prices, t);
    return v === undefined || v === 0;
  });
}

/** 該期間是否仍需自動補齊（缺價、空快照、或匯率仍為預設） */
function periodNeedsSync(snap: PeriodSnap | undefined, tickers: HoldingTicker[]): boolean {
  if (tickers.length === 0) return false;
  if (!snap || Object.keys(snap.prices).length === 0) return true;
  if (filterTickersNeedingSync(tickers, snap).length > 0) return true;
  return rateNeedsSync(snap);
}

const pickRate = (current: number | undefined, fetched: number | undefined) =>
  (!current || current === 0) && fetched && fetched > 0 ? fetched : current;

function mergeFetchedPrices(
  merged: Record<string, number>,
  prices: Record<string, number>
): void {
  Object.entries(prices).forEach(([key, price]) => {
    merged[key] = price;
    if (key.startsWith('TPE:')) merged[key.replace(/^TPE:/i, '')] = price;
    else if (/^\d{4}$/.test(key)) merged[`TPE:${key}`] = price;
  });
}

function mergePeriodSnap(prevSnap: PeriodSnap | undefined, result: PeriodSnap): PeriodSnap {
  const prev = prevSnap || { prices: {}, exchangeRate: 0 };
  const mergedPrices = { ...prev.prices };
  mergeFetchedPrices(mergedPrices, result.prices);
  const shouldUpdateRate = rateNeedsSync(prev);
  const newRate = shouldUpdateRate ? (result.exchangeRate || 31.5) : prev.exchangeRate;

  return {
    ...prev,
    prices: mergedPrices,
    exchangeRate: newRate,
    jpyExchangeRate: pickRate(prev.jpyExchangeRate, result.jpyExchangeRate),
    eurExchangeRate: pickRate(prev.eurExchangeRate, result.eurExchangeRate),
    gbpExchangeRate: pickRate(prev.gbpExchangeRate, result.gbpExchangeRate),
    hkdExchangeRate: pickRate(prev.hkdExchangeRate, result.hkdExchangeRate),
    krwExchangeRate: pickRate(prev.krwExchangeRate, result.krwExchangeRate),
    cnyExchangeRate: pickRate(prev.cnyExchangeRate, result.cnyExchangeRate),
    cadExchangeRate: pickRate(prev.cadExchangeRate, result.cadExchangeRate),
    audExchangeRate: pickRate(prev.audExchangeRate, result.audExchangeRate),
    inrExchangeRate: pickRate(prev.inrExchangeRate, result.inrExchangeRate),
    sarExchangeRate: pickRate(prev.sarExchangeRate, result.sarExchangeRate),
    brlExchangeRate: pickRate(prev.brlExchangeRate, result.brlExchangeRate),
  };
}

/** 過去年度、年底有持倉、且快照仍缺價／匯率（由新到舊） */
export function findYearsNeedingAutoHistoricalSync(
  transactions: Transaction[],
  cashFlows: CashFlow[],
  accounts: Account[],
  historicalData: HistoricalData
): number[] {
  const currentYear = new Date().getFullYear();
  const { minYear, maxYear } = getInvestmentYearSpan(transactions, cashFlows);
  const result: number[] = [];

  for (let y = maxYear; y >= minYear; y--) {
    if (y >= currentYear) continue;

    const tickers = getHoldingsTickersAtDate(
      new Date(`${y}-12-31`),
      transactions,
      cashFlows,
      accounts
    );
    if (!periodNeedsSync(historicalData[String(y)], tickers)) continue;
    result.push(y);
  }

  return result;
}

/** 需補齊季末快照的年份與季度（Q1~Q3；當年僅已結束的季） */
export function findQuartersNeedingAutoHistoricalSync(
  transactions: Transaction[],
  cashFlows: CashFlow[],
  accounts: Account[],
  historicalData: HistoricalData
): Array<{ year: number; quarters: (1 | 2 | 3)[] }> {
  const currentYear = new Date().getFullYear();
  const completedQuarter = getCompletedQuarterCount();
  const { minYear, maxYear } = getInvestmentYearSpan(transactions, cashFlows);

  const result: Array<{ year: number; quarters: (1 | 2 | 3)[] }> = [];

  for (let y = maxYear; y >= minYear; y--) {
    const maxQ = y < currentYear ? 3 : completedQuarter;
    if (maxQ < 1) continue;

    const quarters: (1 | 2 | 3)[] = [];
    for (let q = 1 as 1 | 2 | 3; q <= maxQ; q++) {
      const tickers = getHoldingsTickersAtDate(
        new Date(y, q * 3, 0),
        transactions,
        cashFlows,
        accounts
      );
      const key = `${y}-Q${q}`;
      if (!periodNeedsSync(historicalData[key], tickers)) continue;
      quarters.push(q);
    }

    if (quarters.length > 0) result.push({ year: y, quarters });
  }

  return result;
}

export function hasAutoHistoricalSyncWork(
  transactions: Transaction[],
  cashFlows: CashFlow[],
  accounts: Account[],
  historicalData: HistoricalData
): boolean {
  return (
    findYearsNeedingAutoHistoricalSync(transactions, cashFlows, accounts, historicalData).length > 0 ||
    findQuartersNeedingAutoHistoricalSync(transactions, cashFlows, accounts, historicalData).length > 0
  );
}

function buildQueryFromTickers(toQuery: HoldingTicker[]): { queryTickers: string[]; queryMarkets: MarketCode[] } {
  const queryTickers = toQuery.map(t => t.display);
  const queryMarkets = toQuery.map(t => toMarketCode(t.market as Market));
  return { queryTickers, queryMarkets };
}

async function syncMissingQuarterSnapshots(
  transactions: Transaction[],
  cashFlows: CashFlow[],
  accounts: Account[],
  accumulated: HistoricalData,
  jobs: Array<{ year: number; quarters: (1 | 2 | 3)[] }>
): Promise<{ data: HistoricalData; didUpdate: boolean }> {
  let didUpdate = false;
  let delayAfter = false;

  for (const { year: y, quarters } of jobs) {
    for (const q of quarters) {
      const tickers = getHoldingsTickersAtDate(
        new Date(y, q * 3, 0),
        transactions,
        cashFlows,
        accounts
      );
      if (tickers.length === 0) continue;

      const key = `${y}-Q${q}`;
      const prevSnap = accumulated[key];
      const missing = filterTickersNeedingSync(tickers, prevSnap);
      const needsRate = rateNeedsSync(prevSnap);

      if (missing.length === 0 && !needsRate) continue;

      const toQuery = missing.length > 0 ? missing : [tickers[0]];
      const { queryTickers, queryMarkets } = buildQueryFromTickers(toQuery);

      if (delayAfter) await new Promise(r => setTimeout(r, 500));
      delayAfter = true;

      try {
        const quarterResults = await fetchHistoricalQuarterEndData(y, queryTickers, queryMarkets, [q]);
        const result = quarterResults[key];
        if (!result) continue;

        const merged = mergePeriodSnap(prevSnap, result);
        if (Object.keys(merged.prices).length === 0) continue;

        accumulated = { ...accumulated, [key]: merged };
        didUpdate = true;
      } catch (e) {
        console.warn(`[autoHistorical] ${key} 季末抓取失敗`, e);
      }
    }
  }

  return { data: accumulated, didUpdate };
}

export async function autoSyncMissingHistoricalData(
  transactions: Transaction[],
  cashFlows: CashFlow[],
  accounts: Account[],
  historicalData: HistoricalData
): Promise<{ data: HistoricalData; didUpdate: boolean }> {
  const years = findYearsNeedingAutoHistoricalSync(transactions, cashFlows, accounts, historicalData);
  const quarterJobs = findQuartersNeedingAutoHistoricalSync(transactions, cashFlows, accounts, historicalData);

  if (years.length === 0 && quarterJobs.length === 0) {
    return { data: historicalData, didUpdate: false };
  }

  let accumulated: HistoricalData = { ...historicalData };
  let didUpdate = false;
  let delayAfter = false;

  for (const y of years) {
    const tickers = getHoldingsTickersAtDate(
      new Date(`${y}-12-31`),
      transactions,
      cashFlows,
      accounts
    );
    if (tickers.length === 0) continue;

    const prevYearData = accumulated[String(y)];
    const missing = filterTickersNeedingSync(tickers, prevYearData);
    const needsRate = rateNeedsSync(prevYearData);

    if (missing.length === 0 && !needsRate) continue;

    const toQuery = missing.length > 0 ? missing : [tickers[0]];
    const { queryTickers, queryMarkets } = buildQueryFromTickers(toQuery);

    if (delayAfter) await new Promise(r => setTimeout(r, 500));
    delayAfter = true;

    try {
      const result = await fetchHistoricalYearEndData(y, queryTickers, queryMarkets);
      const merged = mergePeriodSnap(prevYearData, result);
      if (Object.keys(merged.prices).length === 0) continue;

      accumulated = { ...accumulated, [String(y)]: merged };
      didUpdate = true;
    } catch (e) {
      console.warn(`[autoHistorical] ${y} 年底抓取失敗`, e);
    }
  }

  if (quarterJobs.length > 0) {
    const quarterResult = await syncMissingQuarterSnapshots(
      transactions,
      cashFlows,
      accounts,
      accumulated,
      quarterJobs
    );
    accumulated = quarterResult.data;
    didUpdate = didUpdate || quarterResult.didUpdate;
  }

  return { data: accumulated, didUpdate };
}
