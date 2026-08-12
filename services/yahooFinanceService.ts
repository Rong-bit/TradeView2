// ─────────────────────────────────────────────────────────────────────────────
// yahooFinanceService.ts
// 透過 Vercel serverless proxy 向 Yahoo Finance 取得即時股價與匯率。
// GitHub Pages 靜態部署 → 所有 API 請求皆經 Vercel /api/yahoo-proxy 轉發。
//
// 【資料流紀錄（即時股價/匯率）】
// 1) UI（App.tsx）觸發 handleAutoUpdatePrices()
// 2) 呼叫 fetchCurrentPrices(tickers, markets, options)
// 3) fetchCurrentPrices 會先把代號轉成 Yahoo symbol（例如 2330 -> 2330.TW）
// 4) tryFetch 依序嘗試下列來源：
//    - VITE_YAHOO_PROXY_URL + ?target=<Yahoo URL>（預期主路徑）
//    - /api/yahoo-proxy?target=...（僅 vercel.app / localhost）
//    - corsproxy.io / allorigins（備援）
//    - 直連 Yahoo（最後備援）
// 5) 成功解析 JSON 後，回傳 prices 與各幣別匯率，更新到前端 state。
//
// 備註：
// - 前端建置環境是否帶入 VITE_YAHOO_PROXY_URL，會直接影響是否先走 Vercel proxy。
// - 若前端部署在 GitHub Pages，請在「GitHub Repo -> Settings -> Actions -> Variables」
//   設定 VITE_YAHOO_PROXY_URL（不是設在 Vercel 專案環境變數給 Pages 用）。
// - 建議值：VITE_YAHOO_PROXY_URL=https://trade-folio.vercel.app/api/yahoo-proxy
// - `regularMarketPrice` 為主要價格來源；若缺值則退回 previousClose / 預設值。
// ─────────────────────────────────────────────────────────────────────────────

import { buildProxiedFetchUrls } from '../utils/yahooProxyUrl';

// ── 型別 ─────────────────────────────────────────────────────────────────────

export interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  /** 昨收／參考價（供今日漲跌重算，避免現價更新後漲跌仍用舊值） */
  previousClose?: number;
  /** Yahoo Finance 回傳的 quote 幣別（例如 USD / GBP / GBX） */
  currency?: string;
}

export type YahooMarket =
  | 'US' | 'TW' | 'UK' | 'JP' | 'CN' | 'SZ'
  | 'IN' | 'CA' | 'FR' | 'HK' | 'KR' | 'DE'
  | 'AU' | 'SA' | 'BR';

// ── 設定常數 ──────────────────────────────────────────────────────────────────

const MARKET_SUFFIX: Record<YahooMarket, string> = {
  US: '',    TW: '.TW', UK: '.L',  JP: '.T',  CN: '.SS', SZ: '.SZ',
  IN: '.NS', CA: '.TO', FR: '.PA', HK: '.HK', KR: '.KS', DE: '.DE',
  AU: '.AX', SA: '.SR', BR: '.SA',
};

const CURRENCY_CFG: Record<string, { symbol: string; default: number }> = {
  USD: { symbol: 'USDTWD=X', default: 31.5  },
  JPY: { symbol: 'JPYTWD=X', default: 0.21  },
  EUR: { symbol: 'EURTWD=X', default: 34    },
  GBP: { symbol: 'GBPTWD=X', default: 40    },
  HKD: { symbol: 'HKDTWD=X', default: 4     },
  KRW: { symbol: 'KRWTWD=X', default: 0.023 },
  CNY: { symbol: 'CNYTWD=X', default: 4.3   },
  INR: { symbol: 'INRTWD=X', default: 0.38  },
  CAD: { symbol: 'CADTWD=X', default: 23    },
  AUD: { symbol: 'AUDTWD=X', default: 20    },
  SAR: { symbol: 'SARTWD=X', default: 8.2   },
  BRL: { symbol: 'BRLTWD=X', default: 5.5   },
};

const CONCURRENCY = 8;
const BATCH_DELAY = 50; // ms，僅用於批量失敗後的逐檔備援
const SPARK_BATCH_SIZE = 50;
const TIMEOUT_MS  = 4000;
const CACHE_TTL   = 5 * 60 * 1000; // 5 分鐘

// ── In-memory Cache ───────────────────────────────────────────────────────────

interface CacheEntry<T> { value: T; expiresAt: number; }
const _cache = new Map<string, CacheEntry<unknown>>();

function getCache<T>(key: string): T | null {
  const e = _cache.get(key) as CacheEntry<T> | undefined;
  if (!e || Date.now() > e.expiresAt) { _cache.delete(key); return null; }
  return e.value;
}
function setCache<T>(key: string, value: T, ttl = CACHE_TTL): void {
  _cache.set(key, { value, expiresAt: Date.now() + ttl });
}

/**
 * 清除即時股價／匯率的記憶體快取（供手動刷新前呼叫）。
 * 與 `fetchCurrentPrices(..., { skipCache: true })` 效果一致，且不依賴第三參數型別，方便 CI／舊檔案並存。
 */
export function clearYahooFinanceQuoteCaches(opts?: { includeRates?: boolean }): void {
  const includeRates = opts?.includeRates === true;
  for (const key of _cache.keys()) {
    if (key.startsWith('price:') || (includeRates && key.startsWith('rate:'))) {
      _cache.delete(key);
    }
  }
}

// ── Proxy URL 建構 ────────────────────────────────────────────────────────────

function proxyUrls(target: string): string[] {
  return buildProxiedFetchUrls(target);
}

// ── 底層 Fetch ────────────────────────────────────────────────────────────────

function isErrorBody(text: string, opts?: { allowHtml?: boolean }): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.startsWith('Edge:') || /^too many/i.test(t)) return true;
  if (opts?.allowHtml) return false;
  return t.includes('<!DOCTYPE') || t.includes('<html');
}

function isDevLogEnabled(): boolean {
  try {
    const env = (import.meta as any)?.env ?? {};
    if (Boolean(env.DEV)) return true;
    if (String(env.VITE_DEBUG_QUOTES || '').toLowerCase() === 'true') return true;

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('tfDebugQuotes');
      if (q === '1') {
        localStorage.setItem('tf-debug-quotes', '1');
        return true;
      }
      if (q === '0') {
        localStorage.removeItem('tf-debug-quotes');
        return false;
      }
      return localStorage.getItem('tf-debug-quotes') === '1';
    }
    return false;
  } catch {
    return false;
  }
}

function logFetchDebug(event: string, detail: Record<string, unknown>): void {
  if (!isDevLogEnabled()) return;
  const failureEvents = new Set([
    'http_not_ok',
    'error_body',
    'timeout',
    'network_error',
    'all_failed',
  ]);
  if (!failureEvents.has(event)) return;
  console.debug('[QUOTE_FETCH_DEBUG]', event, detail);
}

/** 嘗試各 proxy，回傳已解析的 JSON 或（HTML 字串用於 StockAnalysis）。 */
async function tryFetch(target: string): Promise<{ json: unknown; text: string } | null> {
  const candidates = proxyUrls(target);
  const allowHtml =
    /^https:\/\/tw\.stock\.yahoo\.com\//i.test(target) ||
    /^https:\/\/stockanalysis\.com\//i.test(target);
  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res  = await fetch(url, {
        headers: { Accept: 'application/json,text/html,*/*;q=0.8' },
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      if (!res.ok) {
        logFetchDebug('http_not_ok', {
          target,
          url,
          attempt: i + 1,
          total: candidates.length,
          status: res.status,
          statusText: res.statusText,
        });
        continue;
      }
      const text = await res.text();
      if (isErrorBody(text, { allowHtml })) {
        logFetchDebug('error_body', {
          target,
          url,
          attempt: i + 1,
          total: candidates.length,
          bodyPreview: text.slice(0, 120),
        });
        continue;
      }

      try {
        logFetchDebug('success_json', {
          target,
          url,
          attempt: i + 1,
          total: candidates.length,
        });
        return { json: JSON.parse(text), text };
      } catch {
        // 非 JSON（HTML page for StockAnalysis）也回傳
        logFetchDebug('success_text', {
          target,
          url,
          attempt: i + 1,
          total: candidates.length,
        });
        return { json: null, text };
      }
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      const isAbort = e?.name === 'AbortError' || /abort/i.test(msg);
      logFetchDebug(isAbort ? 'timeout' : 'network_error', {
        target,
        url,
        attempt: i + 1,
        total: candidates.length,
        error: msg || null,
      });
      /* timeout / CORS → 換下一個 */
    }
  }
  logFetchDebug('all_failed', { target, total: candidates.length });
  return null;
}

// ── Yahoo Chart 輔助 ─────────────────────────────────────────────────────────

function extractMeta(json: unknown): Record<string, any> | null {
  return (json as any)?.chart?.result?.[0]?.meta ?? null;
}

function extractOhlcv(json: unknown) {
  const r = (json as any)?.chart?.result?.[0];
  const spark = !r && json && typeof json === 'object' ? (json as any) : null;
  return {
    timestamps: (r?.timestamp ?? spark?.timestamp ?? []) as number[],
    closes:     (r?.indicators?.quote?.[0]?.close ?? spark?.indicators?.quote?.[0]?.close ?? spark?.close ?? []) as (number | null)[],
    adjCloses:  (r?.indicators?.adjclose?.[0]?.adjclose ?? spark?.indicators?.adjclose?.[0]?.adjclose ?? spark?.adjclose ?? []) as (number | null)[],
  };
}

function positiveQuoteNum(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pickPreferMetaChange(
  metaChangeRaw: unknown,
  metaPctRaw: unknown,
  price: number,
  prev: number,
): { change: number; pct: number } {
  const derivedChange = prev > 0 ? price - prev : 0;
  const derivedPct = prev > 0 ? (derivedChange / prev) * 100 : 0;
  const metaChange = Number(metaChangeRaw);
  const metaPct = Number(metaPctRaw);

  const hasMetaChange = Number.isFinite(metaChange);
  const hasMetaPct = Number.isFinite(metaPct);

  // Yahoo 偶爾會回 0 但 regularMarketPrice 與 previousClose 差異明顯。
  // 這時改用推導值，避免 UI 卡在 0.00（例如 BNDW）。
  if (
    hasMetaChange &&
    Math.abs(metaChange) < 1e-9 &&
    Math.abs(derivedChange) >= 0.005
  ) {
    return { change: derivedChange, pct: derivedPct };
  }

  if (hasMetaChange && hasMetaPct) {
    return { change: metaChange, pct: metaPct };
  }
  if (hasMetaChange) {
    return { change: metaChange, pct: prev > 0 ? (metaChange / prev) * 100 : 0 };
  }
  if (hasMetaPct) {
    return { change: derivedChange, pct: metaPct };
  }
  return { change: derivedChange, pct: derivedPct };
}

/**
 * Yahoo 在盤外時 meta.regularMarketPrice 常仍是「上一個正盤收盤」；
 * 併入盤後／盤前與 K 線最後一根（較新時間戳）可避免畫面一直像停在「昨天」。
 */
function pickLatestQuoteFromChart(
  meta: Record<string, any>,
  json: unknown,
): { price: number; source: 'regular' | 'post' | 'pre' | 'fallback' } {
  // 正規盤優先：UI 顯示固定跟 Yahoo 「At close」一致；盤前/盤後僅作備援。
  const preT = Number(meta.preMarketTime);
  const preP = positiveQuoteNum(meta.preMarketPrice);
  const postT = Number(meta.postMarketTime);
  const postP = positiveQuoteNum(meta.postMarketPrice);
  const regT = Number(meta.regularMarketTime);
  const regP = positiveQuoteNum(meta.regularMarketPrice);

  if (regP > 0 && Number.isFinite(regT) && regT > 0) {
    return { price: regP, source: 'regular' };
  }
  if (preP > 0 && Number.isFinite(preT) && preT > 0) {
    return { price: preP, source: 'pre' };
  }
  if (postP > 0 && Number.isFinite(postT) && postT > 0) {
    return { price: postP, source: 'post' };
  }

  const { timestamps, closes } = extractOhlcv(json);
  let bestT = 0;
  let bestP = 0;
  for (let i = closes.length - 1; i >= 0; i--) {
    const c = closes[i];
    if (c == null || !(c > 0)) continue;
    const ts = timestamps[i];
    if (Number.isFinite(ts) && ts > bestT) {
      bestT = ts;
      bestP = c;
    }
    break;
  }

  if (bestP <= 0) {
    bestP = regP || positiveQuoteNum(meta.previousClose) || positiveQuoteNum(meta.chartPreviousClose) || 0;
  }
  return { price: bestP, source: 'fallback' };
}

function chartMetaToPriceData(
  meta: Record<string, any>,
  json: unknown,
): { data: PriceData; source: 'regular' | 'post' | 'pre' | 'fallback' } | null {
  const { price, source } = pickLatestQuoteFromChart(meta, json);
  if (!price) return null;

  const prev = positiveQuoteNum(meta.previousClose) || positiveQuoteNum(meta.chartPreviousClose) || 0;
  let chg: number;
  let pct: number;
  if (source === 'pre') {
    const chosen = pickPreferMetaChange(
      meta.preMarketChange,
      meta.preMarketChangePercent,
      price,
      prev,
    );
    chg = chosen.change;
    pct = chosen.pct;
  } else if (source === 'post') {
    const chosen = pickPreferMetaChange(
      meta.postMarketChange,
      meta.postMarketChangePercent,
      price,
      prev,
    );
    chg = chosen.change;
    pct = chosen.pct;
  } else if (source === 'regular') {
    const chosen = pickPreferMetaChange(
      meta.regularMarketChange,
      meta.regularMarketChangePercent,
      price,
      prev,
    );
    chg = chosen.change;
    pct = chosen.pct;
  } else {
    chg = prev > 0 ? price - prev : 0;
    pct = prev > 0 ? (chg / prev) * 100 : 0;
  }

  return {
    data: {
      price,
      change: isNaN(chg) ? 0 : chg,
      changePercent: isNaN(pct) ? 0 : pct,
      previousClose: prev > 0 ? prev : undefined,
      currency: meta.currency ? normalizeYahooCurrency(meta.currency) : undefined,
    },
    source,
  };
}

function findYearEnd(
  timestamps: number[], closes: (number | null)[], targetTs: number
): number | null {
  let best: number | null = null, bestDiff = Infinity;
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null || c <= 0 || timestamps[i] > targetTs) continue;
    const d = targetTs - timestamps[i];
    if (d < bestDiff) { bestDiff = d; best = c; }
  }
  if (best == null) {
    for (let i = closes.length - 1; i >= 0; i--)
      if (closes[i] != null && closes[i]! > 0) { best = closes[i]; break; }
  }
  return best;
}

// ── Symbol 轉換 ──────────────────────────────────────────────────────────────

function toYahoo(ticker: string, market?: YahooMarket): string {
  const t = ticker
    .replace(/^TPE:/i, '')
    .replace(/\(BAK\)/gi, '')
    .replace(/\.(L|T|SS|SZ|NS|BO|TO|PA|HK|KS|KQ|DE|F|AX|SR|SA)$/i, '')
    .trim();
  if (market) return MARKET_SUFFIX[market] !== undefined ? `${t}${MARKET_SUFFIX[market]}` : t;
  if (/^\d{4}$/.test(t)) return `${t}.TW`;
  return t;
}

function normalizeYahooCurrency(cur: unknown): string | undefined {
  if (cur == null) return undefined;
  const s = String(cur).trim();
  // Yahoo 對英股便士常見回傳：GBp（注意小寫 p）
  // 也可能回傳：GBX
  if (/^GB[pP]$/.test(s)) return 'GBX';
  if (s.toUpperCase() === 'GBX') return 'GBX';
  return s.toUpperCase();
}

function marketToExpectedQuoteCurrency(market?: YahooMarket): string {
  if (!market) return 'TWD';
  // 這裡要對齊 utils/calculations.ts 的 marketToCurrency：程式下游假設 currentPrice 已是「市場幣別」。
  switch (market) {
    case 'US': return 'USD';
    case 'TW': return 'TWD';
    case 'UK': return 'GBP';
    case 'JP': return 'JPY';
    case 'CN':
    case 'SZ': return 'CNY';
    case 'IN': return 'INR';
    case 'CA': return 'CAD';
    case 'FR':
    case 'DE': return 'EUR';
    case 'HK': return 'HKD';
    case 'KR': return 'KRW';
    case 'AU': return 'AUD';
    case 'SA': return 'SAR';
    case 'BR': return 'BRL';
    default: return 'TWD';
  }
}

function rateToTwd(currency: string, rateMap: Record<string, number>): number {
  const c = currency.toUpperCase();
  if (c === 'TWD') return 1;
  return rateMap[c] ?? 0;
}

// ── TWSE 即時報價（台股優先來源）──────────────────────────────────────────────
//
// 為什麼需要：Yahoo Finance US 的 v8/finance/chart 對「台股」常延遲 ——
// `regularMarketPrice` 可能停在上一交易日收盤、`indicators.quote[0]` 為空，
// 造成前端顯示永遠卡在昨收（例：0050 卡 84.15、2330 卡 2030）。
// 台灣證交所 mis 的 `getStockInfo.jsp` 是台股/ETF 真正的盤中即時來源，
// 回傳欄位：z=最新成交, o=開盤, h=最高, l=最低, y=昨收, v=量, t=時間，
//          a=五檔委賣（_分隔，首檔最佳）, b=五檔委買（_分隔，首檔最佳）。
// 同時送 tse_ 與 otc_ 兩個前綴，可同時涵蓋上市與上櫃。

/** 解析 TWSE 價格欄（"-" / 空字串視為無效） */
function parseTwseQuoteField(s: unknown): number {
  if (s == null) return 0;
  const str = String(s).trim();
  if (!str || str === '-' || str === '--') return 0;
  const n = Number(str.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 將 TWSE msgArray 元素转为可索引列 */
function twseMsgRow(item: unknown): Record<string, unknown> | null {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;
  return item as Record<string, unknown>;
}

/** 上市優先，且優先有最近成交價的 msgArray 列 */
function pickTwseMsgItem(arr: unknown[]): Record<string, unknown> | null {
  const candidates: Record<string, unknown>[] = [];
  for (const raw of arr) {
    const row = twseMsgRow(raw);
    if (!row) continue;
    const z = parseTwseQuoteField(row['z']);
    const y = parseTwseQuoteField(row['y']);
    const o = parseTwseQuoteField(row['o']);
    if (z > 0 || y > 0 || o > 0 || parseBestQuote(row['a']) > 0 || parseBestQuote(row['b']) > 0) {
      candidates.push(row);
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aTse = a['ex'] === 'tse' ? 1 : 0;
    const bTse = b['ex'] === 'tse' ? 1 : 0;
    if (bTse !== aTse) return bTse - aTse;
    return parseTwseQuoteField(b['z']) - parseTwseQuoteField(a['z']);
  });
  return candidates[0];
}

/** 解析 TWSE 用底線串接的五檔字串，取第一檔（最佳價） */
function parseBestQuote(s: unknown): number {
  if (s == null) return 0;
  const first = String(s).split('_')[0];
  const n = Number(first);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 依「台北時間」判斷台股一般交易日時段（不含國定假日判斷）。
 * - preopen / weekend：不採用五檔試算價，避免開盤前集合競價造成數字跳動。
 * - continuous：09:00–13:30，可用成交價與五檔。
 * - postclose：收盤後不取五檔中價，避免盤後委託簿雜訊。
 */
function getTwseSession(now: Date): 'weekend' | 'preopen' | 'continuous' | 'postclose' {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const wd = map.weekday;
  if (wd === 'Sat' || wd === 'Sun') return 'weekend';
  const h = Number(map.hour);
  const m = Number(map.minute);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 'preopen';
  const mins = h * 60 + m;
  if (mins < 9 * 60) return 'preopen';
  if (mins < 13 * 60 + 30) return 'continuous';
  return 'postclose';
}

async function twseRowToPriceData(
  picked: Record<string, unknown>,
  code: string,
): Promise<PriceData | null> {
  const z = parseTwseQuoteField(picked['z']);
  const o = parseTwseQuoteField(picked['o']);
  /** 漲跌分母用昨收 y；勿用 pz（當日參考價，常接近現價，會把漲跌算成 0 或符號反） */
  const yesterdayClose = parseTwseQuoteField(picked['y']);
  const bestAsk = parseBestQuote(picked['a']);
  const bestBid = parseBestQuote(picked['b']);
  const session = getTwseSession(new Date());

  const twChangeFromRef = (last: number): { change: number; changePercent: number } => {
    if (yesterdayClose <= 0 || last <= 0) return { change: 0, changePercent: 0 };
    const change = last - yesterdayClose;
    return { change, changePercent: (change / yesterdayClose) * 100 };
  };

  if (session === 'preopen') {
    if (z > 0) {
      const { change, changePercent } = twChangeFromRef(z);
      return { price: z, change, changePercent, previousClose: yesterdayClose, currency: 'TWD' };
    }
    if (yesterdayClose > 0) {
      return { price: yesterdayClose, change: 0, changePercent: 0, previousClose: yesterdayClose, currency: 'TWD' };
    }
    return null;
  }
  if (session === 'weekend') {
    return null;
  }

  // 漲跌一律以「最近成交 z」對參考價/昨收；勿用委賣價減昨收（易與行情軟體符號相反）
  let price = 0;
  let priceFromLastTrade = false;
  if (z > 0) {
    price = z;
    priceFromLastTrade = true;
  } else if (session === 'continuous') {
    if (bestAsk > 0) {
      price = bestAsk;
    } else if (bestBid > 0) {
      price = bestBid;
    } else if (o > 0) {
      price = o;
      priceFromLastTrade = true;
    } else if (yesterdayClose > 0) {
      price = yesterdayClose;
    }
  } else if (session === 'postclose') {
    if (z > 0) {
      price = z;
      priceFromLastTrade = true;
    } else {
      return null;
    }
  }
  if (price <= 0) return null;

  const changeBase = priceFromLastTrade ? price : z > 0 ? z : o;
  let { change, changePercent } = twChangeFromRef(changeBase);
  if (!priceFromLastTrade && changeBase <= 0) {
    const htmlQuote = await fetchYahooTwHtmlFallback(code);
    if (htmlQuote) {
      change = htmlQuote.change;
      changePercent = htmlQuote.changePercent;
    } else {
      change = 0;
      changePercent = 0;
    }
  }

  return {
    price,
    change,
    changePercent,
    previousClose: yesterdayClose > 0 ? yesterdayClose : undefined,
    currency: 'TWD',
  };
}

/** 單次 TWSE 請求抓取多檔台股（比逐檔 fetch 快數倍） */
async function fetchTwseQuotesBatch(
  codes: string[],
  skipCache = false,
): Promise<Map<string, PriceData>> {
  const out = new Map<string, PriceData>();
  const unique = [...new Set(codes.filter(Boolean))];
  if (!unique.length) return out;

  const exCh = unique.flatMap(c => [`tse_${c}.tw`, `otc_${c}.tw`]).join('|');
  const bust = skipCache ? `&_=${Date.now()}` : '';
  const url =
    `https://mis.twse.com.tw/stock/api/getStockInfo.jsp` +
    `?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0${bust}`;
  const resp = await tryFetch(url);
  const arr = (resp?.json as any)?.msgArray;
  if (!Array.isArray(arr) || arr.length === 0) return out;

  const byCode = new Map<string, unknown[]>();
  for (const raw of arr) {
    const row = twseMsgRow(raw);
    if (!row) continue;
    const code = String(row['c'] ?? '').trim();
    if (!code) continue;
    const list = byCode.get(code) ?? [];
    list.push(raw);
    byCode.set(code, list);
  }

  await Promise.all(
    unique.map(async code => {
      const picked = pickTwseMsgItem(byCode.get(code) ?? []);
      if (!picked) return;
      const data = await twseRowToPriceData(picked, code);
      if (!data || data.price <= 0) return;
      out.set(code, data);
      if (!skipCache) setCache(`price:${code}.TW`, data);
    }),
  );
  return out;
}

async function fetchTwseQuote(code: string): Promise<PriceData | null> {
  const batch = await fetchTwseQuotesBatch([code], true);
  return batch.get(code) ?? null;
}

function extractSparkQuotePayload(json: unknown, symbol: string): Record<string, any> | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, any>;
  const direct = root[symbol] ?? root[symbol.toUpperCase()] ?? root[symbol.toLowerCase()];
  const candidates = [
    direct,
    ...(Array.isArray(root.spark?.result) ? root.spark.result : []),
    ...(Array.isArray(root.finance?.result) ? root.finance.result : []),
  ];

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, any>;
    const rowSymbol = String(row.symbol ?? row.meta?.symbol ?? '').trim();
    if (rowSymbol && rowSymbol.toUpperCase() !== symbol.toUpperCase()) continue;

    const response = Array.isArray(row.response) ? row.response[0] : null;
    if (response && typeof response === 'object') {
      const responseRow = response as Record<string, any>;
      const responseMeta = responseRow.meta && typeof responseRow.meta === 'object'
        ? responseRow.meta as Record<string, any>
        : {};
      return { ...row, ...responseRow, ...responseMeta, symbol: rowSymbol || symbol };
    }
    return { ...row, symbol: rowSymbol || symbol };
  }
  return null;
}

/** Yahoo v7 spark API：一次請求多檔非台股報價 */
async function fetchYahooQuoteBatch(
  symbols: string[],
  skipCache = false,
): Promise<Map<string, PriceData>> {
  const out = new Map<string, PriceData>();
  const unique = [...new Set(symbols.filter(Boolean))];
  if (!unique.length) return out;

  for (let i = 0; i < unique.length; i += SPARK_BATCH_SIZE) {
    const chunk = unique.slice(i, i + SPARK_BATCH_SIZE);
    const bust = skipCache ? `&_=${Date.now()}` : '';
    const url =
      `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${chunk.map(s => encodeURIComponent(s)).join(',')}` +
      `&range=1d&interval=1m&includePrePost=true${bust}`;
    const resp = await tryFetch(url);
    if (!resp?.json) continue;

    for (const sym of chunk) {
      const payload = extractSparkQuotePayload(resp.json, sym);
      if (!payload) continue;
      const parsed = chartMetaToPriceData(payload, payload);
      if (!parsed) continue;
      const data = parsed.data;
      out.set(sym.toUpperCase(), data);
      if (!skipCache) {
        const ttl = parsed.source === 'pre' || parsed.source === 'post' ? 30 * 1000 : CACHE_TTL;
        setCache(`price:${sym}`, data, ttl);
      }
    }
    if (i + SPARK_BATCH_SIZE < unique.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }
  return out;
}

function lookupQuoteMap(map: Map<string, PriceData>, symbol: string): PriceData | undefined {
  return map.get(symbol.toUpperCase()) ?? map.get(symbol);
}

/**
 * 台股 Yahoo 頁面備援（HTML 解析）：
 * 當 TWSE MIS 暫時取不到有效欄位時，嘗試從 Yahoo TW quote 頁抓「成交／昨收」。
 */
async function fetchYahooTwHtmlFallback(code: string): Promise<PriceData | null> {
  const url = `https://tw.stock.yahoo.com/quote/${encodeURIComponent(code)}`;
  const resp = await tryFetch(url);
  const html = resp?.text ?? '';
  if (!html) return null;

  // 例：<span ...>成交</span><span ...>86.00</span>
  const lastMatch = html.match(/成交<\/span><span[^>]*>([\d,]+(?:\.\d+)?)/);
  const prevMatch = html.match(/昨收<\/span><span[^>]*>([\d,]+(?:\.\d+)?)/);
  const upDownMatch = html.match(/漲跌<\/span><span[^>]*>(?:<span[^>]*><\/span>)?([+\-]?\d+(?:\.\d+)?)/);

  const price = Number((lastMatch?.[1] ?? '').replace(/,/g, ''));
  if (!Number.isFinite(price) || price <= 0) return null;

  const prev = Number((prevMatch?.[1] ?? '').replace(/,/g, ''));
  let change = Number((upDownMatch?.[1] ?? '').replace(/,/g, ''));
  if (!Number.isFinite(change)) {
    change = Number.isFinite(prev) && prev > 0 ? price - prev : 0;
  }
  const changePercent = Number.isFinite(prev) && prev > 0 ? (change / prev) * 100 : 0;
  return {
    price,
    change,
    changePercent,
    previousClose: Number.isFinite(prev) && prev > 0 ? prev : undefined,
    currency: 'TWD',
  };
}

// ── 即時股價 ─────────────────────────────────────────────────────────────────

async function fetchSinglePrice(
  symbol: string,
  interval: '1m' | '1d' = '1m',
  skipCache = false,
): Promise<PriceData | null> {
  const ck = `price:${symbol}`;
  if (!skipCache) {
    const cached = getCache<PriceData>(ck);
    if (cached) return cached;
  }

  // 台股優先用 TWSE 即時報價，避免 Yahoo US chart API 延遲回傳昨收
  const twMatch = /^(\d+)\.TW$/i.exec(symbol);
  if (twMatch) {
    try {
      const twseData = await fetchTwseQuote(twMatch[1]);
      if (twseData && twseData.price > 0) {
        setCache(ck, twseData);
        return twseData;
      }
      const yahooTwData = await fetchYahooTwHtmlFallback(twMatch[1]);
      if (yahooTwData && yahooTwData.price > 0) {
        setCache(ck, yahooTwData, 60 * 1000);
        return yahooTwData;
      }
    } catch { /* TWSE 失敗就退回 Yahoo chart */ }
  }

  const bust = skipCache ? `&_=${Date.now()}` : '';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=1d&includePrePost=true${bust}`;
  const resp = await tryFetch(url);
  const meta = extractMeta(resp?.json ?? null);

  if (!meta) {
    return interval === '1m' ? fetchSinglePrice(symbol, '1d', skipCache) : null;
  }

  const parsed = chartMetaToPriceData(meta, resp?.json);
  if (!parsed && interval === '1m') return fetchSinglePrice(symbol, '1d', skipCache);
  if (!parsed) return null;

  const { data: result, source } = parsed;
  // 盤前/盤後波動快，縮短快取以避免畫面長時間停在舊值。
  if (source === 'pre' || source === 'post') {
    setCache(ck, result, 30 * 1000);
  } else {
    setCache(ck, result);
  }
  return result;
}

// ── 匯率 ─────────────────────────────────────────────────────────────────────

async function fetchRate(currency: string): Promise<number> {
  const ck = `rate:${currency}`;
  const cached = getCache<number>(ck);
  if (cached !== null) return cached;

  const cfg = CURRENCY_CFG[currency];
  if (!cfg) return 0;

  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${cfg.symbol}?interval=1m&range=1d`;
  const resp = await tryFetch(url);
  const meta = extractMeta(resp?.json ?? null);
  const rate = (meta?.regularMarketPrice ?? meta?.previousClose) || cfg.default;

  setCache(ck, rate);
  return rate;
}

async function fetchRates(currencies: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    [...new Set(currencies)].map(c => fetchRate(c).then(r => [c, r] as const))
  );
  return Object.fromEntries(entries);
}

function neededCurrencies(markets: YahooMarket[]): string[] {
  const s = new Set(['USD', 'EUR', 'GBP']);
  for (const m of markets) {
    if (m === 'JP') s.add('JPY');
    if (m === 'CN' || m === 'SZ') s.add('CNY');
    if (m === 'IN') s.add('INR');
    if (m === 'CA') s.add('CAD');
    if (m === 'HK') s.add('HKD');
    if (m === 'KR') s.add('KRW');
    if (m === 'AU') s.add('AUD');
    if (m === 'SA') s.add('SAR');
    if (m === 'BR') s.add('BRL');
  }
  return [...s];
}

// ── 歷史年底匯率 ──────────────────────────────────────────────────────────────

async function fetchHistoricalRate(currency: string, year: number): Promise<number> {
  const ck = `hist:${currency}:${year}`;
  const cached = getCache<number>(ck);
  if (cached !== null) return cached;

  const cfg    = CURRENCY_CFG[currency];
  if (!cfg) return 0;
  const endTs  = Math.floor(Date.UTC(year, 11, 31, 23, 59, 59) / 1000);
  const startTs = Math.floor(Date.UTC(year, 10,  1,  0,  0,  0) / 1000);

  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${cfg.symbol}?period1=${startTs}&period2=${endTs}&interval=1d`;
  const resp = await tryFetch(url);
  const { timestamps, closes } = extractOhlcv(resp?.json ?? null);
  const rate = findYearEnd(timestamps, closes, endTs) ?? cfg.default;

  setCache(ck, rate, 24 * 60 * 60 * 1000);
  return rate;
}

// ── 公開 API ─────────────────────────────────────────────────────────────────

export const fetchCurrentPrices = async (
  tickers: string[],
  markets?: YahooMarket[],
  options?: {
    skipCache?: boolean;
    /** 與 tickers 對齊；覆蓋市場預設報價幣（如 UK+USD 的 VWRA） */
    quoteCurrencies?: string[];
    /** 批量取得部分結果時先更新 UI（不必等全部完成） */
    onProgress?: (partial: Record<string, PriceData>) => void;
  },
): Promise<{
  prices: Record<string, PriceData>;
  exchangeRate: number;
  jpyExchangeRate?: number;
  eurExchangeRate?: number;
  gbpExchangeRate?: number;
  hkdExchangeRate?: number;
  krwExchangeRate?: number;
  cnyExchangeRate?: number;
  inrExchangeRate?: number;
  cadExchangeRate?: number;
  audExchangeRate?: number;
  sarExchangeRate?: number;
  brlExchangeRate?: number;
}> => {
  const skipCache = options?.skipCache === true;
  // 與 REFRESH_INTERVAL 對齊：略過快取時一併清匯率快取，否則僅股價重抓、匯率仍可能 5 分鐘內不變
  if (skipCache) clearYahooFinanceQuoteCaches({ includeRates: true });
  const symbols    = tickers.map((t, i) => toYahoo(t, markets?.[i]));
  const currencies = neededCurrencies(markets ?? []);

  async function batchPrices(): Promise<(PriceData | null)[]> {
    const out: (PriceData | null)[] = new Array(symbols.length).fill(null);
    const twCodes: string[] = [];
    const twCodeByIndex = new Map<number, string>();
    const nonTwSymbols: string[] = [];
    const nonTwIndexBySymbol = new Map<string, number[]>();

    symbols.forEach((sym, i) => {
      const twMatch = /^(\d+)\.TW$/i.exec(sym);
      if (twMatch) {
        const code = twMatch[1];
        twCodes.push(code);
        twCodeByIndex.set(i, code);
      } else {
        nonTwSymbols.push(sym);
        const list = nonTwIndexBySymbol.get(sym) ?? [];
        list.push(i);
        nonTwIndexBySymbol.set(sym, list);
      }
    });

    const emitProgress = () => {
      if (!options?.onProgress) return;
      const partial: Record<string, PriceData> = {};
      tickers.forEach((t, i) => {
        const p = out[i];
        if (p) partial[t] = p;
      });
      if (Object.keys(partial).length) options.onProgress(partial);
    };

    const [twMap, yahooMap] = await Promise.all([
      fetchTwseQuotesBatch(twCodes, skipCache),
      fetchYahooQuoteBatch(nonTwSymbols, skipCache),
    ]);

    twCodeByIndex.forEach((code, i) => {
      const data = twMap.get(code);
      if (data) out[i] = data;
    });
    nonTwIndexBySymbol.forEach((indices, sym) => {
      const data = lookupQuoteMap(yahooMap, sym);
      if (!data) return;
      indices.forEach(i => { out[i] = data; });
    });
    emitProgress();

    const missing: number[] = [];
    out.forEach((p, i) => { if (!p) missing.push(i); });
    for (let s = 0; s < missing.length; s += CONCURRENCY) {
      const chunk = missing.slice(s, s + CONCURRENCY);
      const fallback = await Promise.all(
        chunk.map(i => fetchSinglePrice(symbols[i], '1m', skipCache)),
      );
      chunk.forEach((i, j) => { out[i] = fallback[j]; });
      emitProgress();
      if (s + CONCURRENCY < missing.length)
        await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
    return out;
  }

  const [priceList, rateMap] = await Promise.all([batchPrices(), fetchRates(currencies)]);

  const prices: Record<string, PriceData> = {};
  tickers.forEach((t, i) => {
    const p = priceList[i];
    if (!p) return;

    // 目標：讓 prices[t].price / change 都成為「下游報價幣別」（預設=市場幣；可覆蓋為 USD 等）。
    const expectedCcy =
      options?.quoteCurrencies?.[i]?.toUpperCase() ||
      (markets?.[i] ? marketToExpectedQuoteCurrency(markets[i]) : null);
    if (!expectedCcy) {
      prices[t] = p;
      return;
    }

    let fromCcy = (p.currency ?? '').toUpperCase();
    let normalizedPrice = p.price;
    let normalizedChange = p.change;
    let normalizedPrev = p.previousClose;

    // 英股有時 quote 會是 GBX（pence），程式期望 market=UK 的 quote 是 GBP
    if (fromCcy === 'GBX') {
      fromCcy = 'GBP';
      normalizedPrice /= 100;
      normalizedChange /= 100;
      if (normalizedPrev !== undefined) normalizedPrev /= 100;
    }

    const toCcy = expectedCcy.toUpperCase();
    if (!fromCcy || fromCcy === toCcy) {
      prices[t] = {
        ...p,
        price: normalizedPrice,
        change: normalizedChange,
        previousClose: normalizedPrev,
        currency: fromCcy || p.currency,
      };
      return;
    }

    const fromRate = rateToTwd(fromCcy, rateMap);
    const toRate = rateToTwd(toCcy, rateMap);
    if (fromRate > 0 && toRate > 0) {
      const factor = fromRate / toRate; // (from->TWD) / (to->TWD)
      prices[t] = {
        ...p,
        price: normalizedPrice * factor,
        change: normalizedChange * factor,
        previousClose: normalizedPrev !== undefined ? normalizedPrev * factor : undefined,
        currency: toCcy, // 存入「市場幣別」
      };
    } else {
      // 缺匯率時保守：不轉換，讓下游至少不會 NaN
      prices[t] = p;
    }
  });

  return {
    prices,
    exchangeRate:    rateMap['USD'] ?? 31.5,
    jpyExchangeRate: rateMap['JPY'],
    eurExchangeRate: rateMap['EUR'],
    gbpExchangeRate: rateMap['GBP'],
    hkdExchangeRate: rateMap['HKD'],
    krwExchangeRate: rateMap['KRW'],
    cnyExchangeRate: rateMap['CNY'],
    inrExchangeRate: rateMap['INR'],
    cadExchangeRate: rateMap['CAD'],
    audExchangeRate: rateMap['AUD'],
    sarExchangeRate: rateMap['SAR'],
    brlExchangeRate: rateMap['BRL'],
  };
};

export const fetchHistoricalYearEndData = async (
  year: number,
  tickers: string[],
  markets?: YahooMarket[],
): Promise<{
  prices: Record<string, number>;
  exchangeRate: number;
  jpyExchangeRate?: number;
  eurExchangeRate?: number;
  gbpExchangeRate?: number;
  hkdExchangeRate?: number;
  krwExchangeRate?: number;
  cnyExchangeRate?: number;
  inrExchangeRate?: number;
  cadExchangeRate?: number;
  audExchangeRate?: number;
  sarExchangeRate?: number;
  brlExchangeRate?: number;
}> => {
  const endTs   = Math.floor(Date.UTC(year, 11, 31, 23, 59, 59) / 1000);
  const startTs = Math.floor(Date.UTC(year, 11,  1,  0,  0,  0) / 1000);

  // 根據實際持有市場決定需要抓哪些匯率
  const neededRates = neededCurrencies(markets ?? []);

  const [priceList, ...rateResults] = await Promise.all([
    Promise.all(tickers.map(async (ticker, i) => {
      const sym  = toYahoo(ticker, markets?.[i]);
      // 用日線抓整個 12 月，取最後一個有效交易日的收盤價
      // 注意：優先用 adjCloses（調整後）僅在有配息時才有差異；
      // 對資產估值應用原始 closes，但要確保取的是最後交易日而非 timestamp 最接近的那筆
      const moStartTs = Math.floor(Date.UTC(year, 11, 1, 0, 0, 0) / 1000);
      const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${moStartTs}&period2=${endTs}&interval=1d`;
      const resp = await tryFetch(url);
      const { timestamps, closes } = extractOhlcv(resp?.json ?? null);
      // 取 period 內最後一個有效收盤價（最後交易日），不用 findYearEnd 避免 timestamp 偏移問題
      for (let j = closes.length - 1; j >= 0; j--) {
        if (closes[j] != null && closes[j]! > 0) return closes[j];
      }
      return null;
    })),
    // 永遠抓 USD；其餘依持有市場動態決定
    ...neededRates.map(currency => fetchHistoricalRate(currency, year)),
  ]);

  const rateMap: Record<string, number> = {};
  neededRates.forEach((currency, i) => {
    const v = rateResults[i] as number | undefined;
    if (v != null && v > 0) rateMap[currency] = v;
  });

  const prices: Record<string, number> = {};
  tickers.forEach((ticker, i) => {
    const p = (priceList as (number | null)[])[i];
    if (p != null && p > 0) {
      prices[ticker] = p;
      const clean = ticker.replace(/^TPE:/i, '');
      if (clean !== ticker) prices[clean] = p;
    }
  });

  return {
    prices,
    exchangeRate:    rateMap['USD'] ?? 31.5,
    jpyExchangeRate: rateMap['JPY'],
    eurExchangeRate: rateMap['EUR'],
    gbpExchangeRate: rateMap['GBP'],
    hkdExchangeRate: rateMap['HKD'],
    krwExchangeRate: rateMap['KRW'],
    cnyExchangeRate: rateMap['CNY'],
    inrExchangeRate: rateMap['INR'],
    cadExchangeRate: rateMap['CAD'],
    audExchangeRate: rateMap['AUD'],
    sarExchangeRate: rateMap['SAR'],
    brlExchangeRate: rateMap['BRL'],
  };
};

/** 季末日期：Q1=3/31, Q2=6/30, Q3=9/30, Q4=12/31 */
const QUARTER_END: Record<number, { month: number; day: number }> = {
  1: { month: 2, day: 31 },  // Date.UTC month 0-based → month=2 → March
  2: { month: 5, day: 30 },
  3: { month: 8, day: 30 },
  4: { month: 11, day: 31 },
};

/**
 * 抓指定年份 Q1~Q3 季末股價（Q4 已由 fetchHistoricalYearEndData 處理）。
 * 回傳 { "2023-Q1": { prices, exchangeRate, ... }, ... }
 */
export const fetchHistoricalQuarterEndData = async (
  year: number,
  tickers: string[],
  markets?: YahooMarket[],
  quarters: (1 | 2 | 3)[] = [1, 2, 3],
): Promise<Record<string, {
  prices: Record<string, number>;
  exchangeRate: number;
  jpyExchangeRate?: number;
  eurExchangeRate?: number;
  gbpExchangeRate?: number;
  hkdExchangeRate?: number;
  krwExchangeRate?: number;
  cnyExchangeRate?: number;
  inrExchangeRate?: number;
  cadExchangeRate?: number;
  audExchangeRate?: number;
  sarExchangeRate?: number;
  brlExchangeRate?: number;
}>> => {
  const neededRates = neededCurrencies(markets ?? []);
  const result: Record<string, any> = {};

  for (const q of quarters) {
    const { month, day } = QUARTER_END[q];
    const endTs   = Math.floor(Date.UTC(year, month, day, 23, 59, 59) / 1000);
    const startTs = Math.floor(Date.UTC(year, month - 1, 1, 0, 0, 0) / 1000); // 前一個月初開始抓

    const [priceList, ...rateResults] = await Promise.all([
      Promise.all(tickers.map(async (ticker, i) => {
        const sym = toYahoo(ticker, markets?.[i]);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${startTs}&period2=${endTs}&interval=1d`;
        const resp = await tryFetch(url);
        const { closes } = extractOhlcv(resp?.json ?? null);
        for (let j = closes.length - 1; j >= 0; j--) {
          if (closes[j] != null && closes[j]! > 0) return closes[j];
        }
        return null;
      })),
      ...neededRates.map(currency => fetchHistoricalRate(currency, year)),
    ]);

    const rateMap: Record<string, number> = {};
    neededRates.forEach((currency, i) => {
      const v = rateResults[i] as number | undefined;
      if (v != null && v > 0) rateMap[currency] = v;
    });

    const prices: Record<string, number> = {};
    tickers.forEach((ticker, i) => {
      const p = (priceList as (number | null)[])[i];
      if (p != null && p > 0) {
        prices[ticker] = p;
        const clean = ticker.replace(/^TPE:/i, '');
        if (clean !== ticker) prices[clean] = p;
      }
    });

    result[`${year}-Q${q}`] = {
      prices,
      exchangeRate:    rateMap['USD'] ?? 31.5,
      jpyExchangeRate: rateMap['JPY'],
      eurExchangeRate: rateMap['EUR'],
      gbpExchangeRate: rateMap['GBP'],
      hkdExchangeRate: rateMap['HKD'],
      krwExchangeRate: rateMap['KRW'],
      cnyExchangeRate: rateMap['CNY'],
      inrExchangeRate: rateMap['INR'],
      cadExchangeRate: rateMap['CAD'],
      audExchangeRate: rateMap['AUD'],
      sarExchangeRate: rateMap['SAR'],
      brlExchangeRate: rateMap['BRL'],
    };

    // 季之間間隔，避免 rate limit
    if (q < Math.max(...quarters)) await new Promise(r => setTimeout(r, 400));
  }

  return result;
};

export const fetchAnnualizedReturn = async (
  ticker: string,
  market?: YahooMarket,
): Promise<number | null> => {
  const clean = ticker.replace(/^TPE:/i, '').trim().toUpperCase();
  const MARKET_SA: Partial<Record<YahooMarket, string>> = { TW:'tpe', UK:'lon', JP:'tyo' };

  const saUrls = market && MARKET_SA[market]
    ? [`https://stockanalysis.com/quote/${MARKET_SA[market]}/${clean}/`]
    : [`https://stockanalysis.com/etf/${clean}/`, `https://stockanalysis.com/stocks/${clean}/`];

  const patterns = [
    /since\s+the\s+fund'?s?\s+inception[^.]*average\s+annual\s+return\s+has\s+been\s+([\d.]+)%/i,
    /average\s+annual\s+return\s+has\s+been\s+([\d.]+)%/i,
    /since[^.]*inception[^.]*average\s+annual\s+return[^.]*?([\d.]+)%/i,
    /annual\s+return[^%]*?([\d.]+)%/i,
  ];

  for (const url of saUrls) {
    const resp = await tryFetch(url);
    const html = resp?.text ?? '';
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m?.[1]) {
        const v = parseFloat(m[1]);
        if (!isNaN(v) && v > -100 && v < 1000) return v;
      }
    }
  }

  // fallback: Yahoo Finance CAGR
  const symbol = toYahoo(ticker, market);
  const current = await fetchSinglePrice(symbol);
  if (!current || current.price <= 0) return null;

  const endTs   = Math.floor(Date.now() / 1000);
  const startTs = Math.floor(new Date('2000-01-01').getTime() / 1000);
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${startTs}&period2=${endTs}&interval=1d`;
  const resp = await tryFetch(url);
  const { timestamps, closes, adjCloses } = extractOhlcv(resp?.json ?? null);

  const prices = adjCloses.length > 0 ? adjCloses : closes;
  if (!timestamps.length || !prices.length) return null;

  let earliestPrice: number | null = null, earliestTs: number | null = null;
  for (let i = 0; i < timestamps.length; i++) {
    if (prices[i] != null && prices[i]! > 0) { earliestPrice = prices[i]; earliestTs = timestamps[i]; break; }
  }
  if (!earliestPrice || !earliestTs) return null;

  let latestPrice = current.price;
  for (let i = prices.length - 1; i >= 0; i--)
    if (prices[i] != null && prices[i]! > 0) { latestPrice = prices[i]!; break; }

  const years = (Date.now() / 1000 - earliestTs) / (365.25 * 24 * 3600);
  if (years <= 0) return null;

  return (Math.pow(latestPrice / earliestPrice, 1 / years) - 1) * 100;
};
