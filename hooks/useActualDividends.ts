import { useEffect, useMemo, useState } from 'react';
import { Market } from '../types';
import {
  fetchActualDividendHistory,
  type ActualDividendRecord,
} from '../services/moneydjService';
import {
  dividendScheduleMapKey,
  marketToYahooMarketForDividends,
} from '../utils/dividendTaxHelpers';
import {
  ACTUAL_DIVIDENDS_INVALIDATE_EVENT,
  ACTUAL_DIVIDENDS_LS_KEY,
} from '../utils/actualDividendCache';

// v14：清除 FundClear 部署前留下的 ETF 無組成快取。
const LS_KEY = ACTUAL_DIVIDENDS_LS_KEY;
const LEGACY_LS_KEYS = [
  'tf-actual-dividends-v1',
  'tf-actual-dividends-v2',
  'tf-actual-dividends-v3',
  'tf-actual-dividends-v4',
  'tf-actual-dividends-v5',
  'tf-actual-dividends-v6',
  'tf-actual-dividends-v7',
  'tf-actual-dividends-v8',
  'tf-actual-dividends-v9',
  'tf-actual-dividends-v10',
  'tf-actual-dividends-v11',
  'tf-actual-dividends-v12',
  'tf-actual-dividends-v13',
] as const;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 10 * 60 * 1000;
const CONCURRENCY = 3;

interface CacheEntry {
  at: number;
  data: ActualDividendRecord[] | null;
}

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, CacheEntry>;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function purgeLegacyActualDividendCaches(): void {
  try {
    for (const k of LEGACY_LS_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

function writeCacheEntry(key: string, data: ActualDividendRecord[] | null): void {
  try {
    const all = readCache();
    all[key] = { at: Date.now(), data };
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode → ignore */
  }
}

export type ActualDividendsMap = Record<string, ActualDividendRecord[] | null | 'loading'>;

function normalizeRequests(requests: Array<{ ticker: string; market: Market }>) {
  const seen = new Set<string>();
  const list: Array<{
    ticker: string;
    market: Market;
    key: string;
    ym: NonNullable<ReturnType<typeof marketToYahooMarketForDividends>>;
  }> = [];
  for (const r of requests) {
    const ym = marketToYahooMarketForDividends(r.market);
    if (!ym) continue;
    const key = dividendScheduleMapKey(r.market, r.ticker);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ ticker: r.ticker.trim(), market: r.market, key, ym });
  }
  return list;
}

/**
 * 依持倉代號批次抓取「歷史已發放」現金配息。
 * TW/US 優先高精度來源；其他市場用 Yahoo Finance events=div。
 * 使用 localStorage 快取 24 小時（`tf-actual-dividends-v14`）。
 */
export function useActualDividends(
  requests: Array<{ ticker: string; market: Market }>
): ActualDividendsMap {
  const jobs = useMemo(() => normalizeRequests(requests), [requests]);
  const depKey = useMemo(() => jobs.map(j => j.key).sort().join('|'), [jobs]);

  const [map, setMap] = useState<ActualDividendsMap>({});
  const [invalidateSeq, setInvalidateSeq] = useState(0);

  useEffect(() => {
    const onInvalidate = () => setInvalidateSeq(n => n + 1);
    window.addEventListener(ACTUAL_DIVIDENDS_INVALIDATE_EVENT, onInvalidate);
    return () => window.removeEventListener(ACTUAL_DIVIDENDS_INVALIDATE_EVENT, onInvalidate);
  }, []);

  useEffect(() => {
    purgeLegacyActualDividendCaches();
    const cached = readCache();
    const initial: ActualDividendsMap = {};
    const toFetch: typeof jobs = [];

    for (const j of jobs) {
      const hit = cached[j.key];
      const isEmptyResult = Array.isArray(hit?.data) && hit.data.length === 0;
      const isTwEtfMissingComposition =
        j.market === Market.TW &&
        Array.isArray(hit?.data) &&
        hit.data.some(rec => rec.isEtf && !rec.distributionComposition);
      const ttl =
        isEmptyResult || isTwEtfMissingComposition ? EMPTY_CACHE_TTL_MS : CACHE_TTL_MS;
      const isFresh = !!hit && Date.now() - hit.at < ttl;
      // 僅快取成功結果；空結果只短暫沿用，避免某台裝置暫時抓失敗後整天看不到待確認配息。
      if (isFresh && Array.isArray(hit.data)) {
        initial[j.key] = hit.data;
      } else {
        initial[j.key] = 'loading';
        toFetch.push(j);
      }
    }

    setMap(initial);

    if (toFetch.length === 0) return;

    let cancelled = false;
    const pool = [...toFetch];

    const worker = async () => {
      while (pool.length > 0 && !cancelled) {
        const job = pool.shift();
        if (!job) break;
        try {
          const data = await fetchActualDividendHistory(job.ticker, job.market, job.ym);
          if (cancelled) return;
          writeCacheEntry(job.key, data);
          setMap(prev => ({ ...prev, [job.key]: data }));
        } catch {
          if (cancelled) return;
          setMap(prev => ({ ...prev, [job.key]: null }));
        }
      }
    };

    Promise.all(Array.from({ length: CONCURRENCY }, () => worker())).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [depKey, invalidateSeq]);

  return map;
}
