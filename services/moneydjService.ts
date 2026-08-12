// ─────────────────────────────────────────────────────────────────────────────
// moneydjService.ts
// 取得「歷史已發放」現金配息實績，用於 DividendHeatmap 的「待確認實績配息」清單。
//
// 設計目標：
//  - 實績區塊（過去已發放）採「精度優先」：只有抓到除息日、發放日、每股配息才顯示。
//  - 其他市場（非 TW/US）以 Yahoo Finance 補足覆蓋，發放日以市場慣例推估並標記。
// ─────────────────────────────────────────────────────────────────────────────
import { Market } from '../types';
import {
  buildProxiedFetchUrls,
  proxyFetchTimeoutMs,
  resolveYahooProxyBase,
} from '../utils/yahooProxyUrl';
import type { YahooMarket } from './yahooFinanceService';

export interface TwEtfDistributionComposition {
  /** 基金資訊觀測站預估股利所得占比（通常對應 54C） */
  dividendIncomePercent: number;
  /** 基金資訊觀測站預估利息所得占比（可能包含 5A） */
  interestIncomePercent: number;
  equalizationReservePercent: number;
  realizedCapitalGainPercent: number;
  otherIncomePercent: number;
  /** 官方欄位為公告前預估，實際仍以收益分配通知書為準 */
  estimated: true;
}

export interface ActualDividendRecord {
  /** YYYY-MM-DD 除息日（必有） */
  exDate: string;
  /** YYYY-MM-DD 發放日；若 MoneyDJ 無法取得則為推估值 */
  payDate?: string;
  /** 是否為推估發放日（true → 顯示「估」徽章） */
  payDateEstimated?: boolean;
  /** 每股現金股利（以該市場原幣別計，例如 TW: TWD、US: USD） */
  amountPerShare: number;
  /** 報價幣別（hint） */
  currency?: string;
  /** 台股 ETF 官方預估收益分配組成 */
  distributionComposition?: TwEtfDistributionComposition;
  /** 已由 ETF 專用資料來源確認；組成缺漏時不可把整筆配息當成健保費基 */
  isEtf?: boolean;
  /** 來源標記，用於 UI 顯示徽章 */
  source: 'fundclear' | 'mops' | 'moneydj' | 'dj' | 'stockanalysis' | 'yahoo';
}

const PAY_DATE_OFFSET_DAYS_BY_MARKET: Partial<Record<Market, number>> = {
  [Market.UK]: 21,
  [Market.JP]: 60,
  [Market.HK]: 30,
  [Market.KR]: 30,
  [Market.CA]: 14,
  [Market.AU]: 14,
  [Market.DE]: 21,
  [Market.FR]: 21,
  [Market.CN]: 30,
  [Market.SZ]: 30,
  [Market.IN]: 30,
  [Market.SA]: 30,
  [Market.BR]: 30,
};
const PAY_DATE_OFFSET_DEFAULT_DAYS = 21;

function payDateOffsetDays(market: Market): number {
  return PAY_DATE_OFFSET_DAYS_BY_MARKET[market] ?? PAY_DATE_OFFSET_DEFAULT_DAYS;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function tsToYmd(secondsOrMs: number): string {
  if (!Number.isFinite(secondsOrMs) || secondsOrMs <= 0) return '';
  const ms = secondsOrMs > 1e12 ? secondsOrMs : secondsOrMs * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

type FundClearDividendRow = {
  stockNo?: unknown;
  exDivDate?: unknown;
  payDate?: unknown;
  disAmount?: unknown;
  divDet1?: unknown;
  divDet2?: unknown;
  divDet3?: unknown;
  divDet4?: unknown;
  divDet5?: unknown;
};

function compactYmdToIso(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!/^\d{8}$/.test(s)) return '';
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : iso;
}

function fundClearPercent(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
}

/** 將基金資訊觀測站 ETF 配息回應正規化；搜尋結果仍須嚴格比對證券代號。 */
export function parseFundClearDividendResponse(
  payload: unknown,
  ticker: string
): ActualDividendRecord[] {
  if (!payload || typeof payload !== 'object') return [];
  const list = (payload as { list?: unknown }).list;
  if (!Array.isArray(list)) return [];
  const normalizedTicker = ticker.trim().toUpperCase();
  const rows: ActualDividendRecord[] = [];

  for (const raw of list as FundClearDividendRow[]) {
    if (String(raw.stockNo ?? '').trim().toUpperCase() !== normalizedTicker) continue;
    const exDate = compactYmdToIso(raw.exDivDate);
    const payDate = compactYmdToIso(raw.payDate);
    const amountPerShare = Number(raw.disAmount);
    if (!exDate || !payDate || !Number.isFinite(amountPerShare) || amountPerShare <= 0) continue;

    const percentages = [
      fundClearPercent(raw.divDet1),
      fundClearPercent(raw.divDet2),
      fundClearPercent(raw.divDet3),
      fundClearPercent(raw.divDet4),
      fundClearPercent(raw.divDet5),
    ];
    const hasComposition = percentages.some(value => value > 0);
    rows.push({
      exDate,
      payDate,
      amountPerShare,
      currency: 'TWD',
      source: 'fundclear',
      isEtf: true,
      ...(hasComposition
        ? {
            distributionComposition: {
              dividendIncomePercent: percentages[0],
              interestIncomePercent: percentages[1],
              equalizationReservePercent: percentages[2],
              realizedCapitalGainPercent: percentages[3],
              otherIncomePercent: percentages[4],
              estimated: true as const,
            },
          }
        : {}),
    });
  }

  return rows.sort((a, b) => b.exDate.localeCompare(a.exDate));
}

function fundClearDividendProxyUrl(ticker: string): string {
  const base = resolveYahooProxyBase();
  const path = `/api/fundclear-dividend?ticker=${encodeURIComponent(ticker)}`;
  if (!base) return path;
  return new URL(path, base).toString();
}

async function fetchFundClearTwEtfHistory(ticker: string): Promise<ActualDividendRecord[]> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), proxyFetchTimeoutMs());
  try {
    const res = await fetch(fundClearDividendProxyUrl(ticker), {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    return parseFundClearDividendResponse(await res.json(), ticker);
  } catch {
    return [];
  } finally {
    clearTimeout(tid);
  }
}

function isMoneyDjTarget(target: string): boolean {
  return /^https:\/\/(www\.)?moneydj\.com\//i.test(target);
}

function isMopsTarget(target: string): boolean {
  return /^https:\/\/mopsov\.twse\.com\.tw\//i.test(target);
}

async function fetchAsTextOnce(target: string): Promise<string | null> {
  const candidates = buildProxiedFetchUrls(target);
  const FETCH_TIMEOUT_MS = isMoneyDjTarget(target) || isMopsTarget(target)
    ? Math.max(proxyFetchTimeoutMs(), 15_000)
    : proxyFetchTimeoutMs();
  for (const url of candidates) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        headers: {
          Accept: 'text/html,application/json,*/*;q=0.8',
          ...(isMopsTarget(target) ? { Referer: 'https://mopsov.twse.com.tw/mops/web/t108sb19_q1' } : {}),
        },
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) continue;
      const text = await res.text();
      const t = text.trim();
      if (!t) continue;
      // proxy 拒絕目標時回 {"error":"..."}，不可當 HTML／Yahoo JSON 解析。
      if (/^\s*\{\s*"error"\s*:/.test(t)) continue;
      if (/^Edge:/i.test(t) || /^too many requests/i.test(t)) continue;
      // MoneyDJ 偶爾回 "目前無資料" / 維護頁，視為失敗。
      if (/系統維護|目前無資料/.test(t) && t.length < 600) continue;
      return text;
    } catch {
      /* timeout / CORS → 換下一個 */
    }
  }
  return null;
}

/** MoneyDJ 在手機網路易逾時；多試幾次以提高成功率。 */
async function fetchAsText(target: string): Promise<string | null> {
  const maxAttempts = isMoneyDjTarget(target) ? 3 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
    const text = await fetchAsTextOnce(target);
    if (text) return text;
  }
  return null;
}

async function fetchMopsAsText(target: string): Promise<string | null> {
  const candidates = [
    target,
    ...buildProxiedFetchUrls(target).filter(url => url !== target),
  ];
  const FETCH_TIMEOUT_MS = Math.max(proxyFetchTimeoutMs(), 15_000);
  for (const url of candidates) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: 'https://mopsov.twse.com.tw/mops/web/t108sb19_q1',
        },
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) continue;
      const text = await res.text();
      const t = text.trim();
      if (!t) continue;
      if (/^\s*\{\s*"error"\s*:/.test(t)) continue;
      if (/請選擇查詢條件/.test(t) && t.length < 3000) continue;
      return text;
    } catch {
      /* CORS / timeout / proxy not deployed → try next candidate */
    }
  }
  return null;
}

async function fetchJson<T = unknown>(target: string): Promise<T | null> {
  const text = await fetchAsText(target);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ── MoneyDJ ETF 配息頁（台股 ETF、美股／海外 ETF；提供精確每股 + 真實發放日） ──
//
// URL：https://www.moneydj.com/ETF/X/Basic/Basic0005.xdjhtm?etfid=<TICKER>
// 表格結構（每列 8 個 <td>，index 從 0 起）：
//   [0] 配息基準日（常為空）｜[1] 除息日｜[2] 登記日｜[3] 發放日｜[4] 幣別
//   ｜[5] 配息總額（台股 ETF）或短期資本利得｜[6] 年化配息率或長期資本利得｜[7] 配息總額（海外 ETF）
// 解析重點：
//  - 每股 = 台股 ETF 的 [5]，海外 ETF 的 [7]（注意 12 月底特別配息會把資本利得加進這欄）
//  - 發放日 = [3]，可信值（非推估）
//  - 幣別 = [4]，需從中文（美元／新台幣）轉成 ISO（USD／TWD）
const ETF_CURRENCY_MAP: Record<string, string> = {
  美元: 'USD',
  新台幣: 'TWD',
  台幣: 'TWD',
  港元: 'HKD',
  日圓: 'JPY',
  歐元: 'EUR',
  英鎊: 'GBP',
  人民幣: 'CNY',
  加幣: 'CAD',
  澳幣: 'AUD',
};

interface MoneyDjEtfDividendRow {
  /** YYYY-MM-DD 除息日 */
  exDate: string;
  /** YYYY-MM-DD 發放日 */
  payDate: string;
  /** 每股現金股利（含資本利得；以原幣別計） */
  amountPerShare: number;
  /** 報價幣別 ISO 三碼 */
  currency?: string;
}

function normalizeYmd(slashYmd: string): string {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(slashYmd.trim());
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function normalizeSlashYmd(raw: string): string {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(stripHtml(raw).trim());
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function normalizeTwRocOrYmd(raw: string): string {
  const s = raw.trim();
  const m = /^(\d{2,4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (!m) return '';
  const year = Number(m[1]);
  if (!Number.isFinite(year)) return '';
  const westernYear = year < 1911 ? year + 1911 : year;
  return `${westernYear}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function normalizeTwRocChineseDate(raw: string): string {
  const compact = stripHtml(raw).replace(/\s+/g, '');
  const m = /^(\d{2,4})年(\d{1,2})月(\d{1,2})日$/.exec(compact);
  if (!m) return '';
  const year = Number(m[1]);
  if (!Number.isFinite(year)) return '';
  const westernYear = year < 1911 ? year + 1911 : year;
  return `${westernYear}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function isCompleteRecord(rec: Pick<ActualDividendRecord, 'exDate' | 'payDate' | 'amountPerShare'>): boolean {
  return !!rec.exDate && !!rec.payDate && Number.isFinite(rec.amountPerShare) && rec.amountPerShare > 0;
}

/** 去除浮點誤差：Yahoo 常見 6.000036 類雜訊會收斂至 4 位內合理值，再保留最多 6 位小數 */
export function normalizeAmountPerShare(amount: number): number {
  if (!Number.isFinite(amount)) return amount;
  const at6 = Math.round(amount * 1e6) / 1e6;
  const at4 = Math.round(at6 * 1e4) / 1e4;
  if (Math.abs(at6 - at4) < 1e-4) return at4;
  return at6;
}

function etfAmountPerShareFromCells(cells: string[], market: Market): string {
  if (market === Market.TW) return cells[5] ?? '';
  return cells.length >= 8 ? (cells[7] ?? '') : (cells[5] ?? '');
}

export function parseMoneyDjEtfHtml(html: string, market: Market): MoneyDjEtfDividendRow[] {
  const rows: MoneyDjEtfDividendRow[] = [];
  const flat = html.replace(/[\r\n]+/g, ' ');
  // 鎖定 <tbody>...</tbody>，避免抓到頁面其他表格
  const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(flat);
  const scope = tbodyMatch ? tbodyMatch[1] : flat;

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(scope)) != null) {
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cm: RegExpExecArray | null;
    while ((cm = tdRe.exec(m[1])) != null) cells.push(stripHtml(cm[1]));
    if (cells.length < 7) continue;

    const exDateRaw = cells[1] ?? '';
    const payDateRaw = cells[3] ?? '';
    const currencyRaw = cells[4] ?? '';
    const amountRaw = etfAmountPerShareFromCells(cells, market);

    const exDate = normalizeYmd(exDateRaw);
    const payDate = normalizeYmd(payDateRaw);
    if (!exDate || !payDate) continue;
    const amount = normalizeAmountPerShare(Number(amountRaw.replace(/,/g, '')));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const currKey = Object.keys(ETF_CURRENCY_MAP).find(k => currencyRaw.includes(k));
    const currency = currKey ? ETF_CURRENCY_MAP[currKey] : undefined;

    rows.push({ exDate, payDate, amountPerShare: amount, currency });
  }
  // 由新到舊
  rows.sort((a, b) => b.exDate.localeCompare(a.exDate));
  return rows;
}

/** 抓取 ETF 配息頁；解析失敗或無資料時回 null。 */
async function fetchMoneyDjEtfHistory(
  ticker: string,
  market: Market
): Promise<MoneyDjEtfDividendRow[] | null> {
  // ETF id 接受 A–Z／0–9，VTI、QQQM、0050、SPDR 系列大小寫無關
  const sanitized = String(ticker)
    .replace(/\s/g, '')
    .replace(/\.(TW)$/i, '')
    .toUpperCase();
  if (!/^[0-9A-Z.\-]{1,12}$/.test(sanitized)) return null;
  const etfId = market === Market.TW ? `${sanitized}.tw` : sanitized;
  const url = `https://www.moneydj.com/ETF/X/Basic/Basic0005.xdjhtm?etfid=${encodeURIComponent(etfId)}`;
  const html = await fetchAsText(url);
  if (!html) return null;
  // 找不到該 ETF 時 MoneyDJ 通常導去清單頁或顯示「查無資料」字樣
  if (/查無資料|個股代碼錯誤/.test(html)) return null;
  const rows = parseMoneyDjEtfHtml(html, market);
  if (rows.length === 0) return null;
  return rows;
}

// ── 台股個股：DJ 鏡像重大行事曆（除息日 + 息值 + 現金股利發放日） ─────────────
export function parseDjTwStockCalendarHtml(html: string): ActualDividendRecord[] {
  const flat = html.replace(/[\r\n]+/g, ' ');
  if (/Sign in Page|會員|登入/.test(flat) && !/重大行事曆/.test(flat)) return [];

  const rows: string[][] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(flat)) != null) {
    const cells: string[] = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = tdRe.exec(m[1])) != null) cells.push(stripHtml(cm[1]));
    if (cells.length > 0) rows.push(cells);
  }

  const dateRow = rows.find(row => row[0] === '日期');
  const amountRow = rows.find(row => row[0]?.includes('息值'));
  const payDateRow = rows.find(row => row[0] === '現金股利發放日' || row[0] === '股息發放日');
  if (!dateRow || !amountRow || !payDateRow) return [];

  const exIdx = rows
    .find(row => row.includes('除息日'))
    ?.findIndex(cell => cell === '除息日');
  if (exIdx == null || exIdx < 1) return [];

  const exDate = normalizeTwRocOrYmd(dateRow[exIdx] ?? '');
  const amount = normalizeAmountPerShare(Number((amountRow[exIdx] ?? '').replace(/,/g, '')));
  const payDate = normalizeTwRocOrYmd(payDateRow[exIdx] ?? payDateRow[1] ?? '');

  const rec: ActualDividendRecord = {
    exDate,
    payDate,
    amountPerShare: amount,
    currency: 'TWD',
    source: 'dj',
  };
  return isCompleteRecord(rec) ? [rec] : [];
}

async function fetchDjTwStockCalendarHistory(ticker: string): Promise<ActualDividendRecord[]> {
  const sanitized = String(ticker).replace(/^TPE:/i, '').replace(/\D/g, '');
  if (!/^\d{4,6}$/.test(sanitized)) return [];
  const url = `https://fubon-ebrokerdj.fbs.com.tw/z/zc/zci/zci_${encodeURIComponent(sanitized)}.djhtm`;
  const html = await fetchAsText(url);
  if (!html) return [];
  return parseDjTwStockCalendarHtml(html);
}

// ── 台股個股：MOPS 除權息公告（官方真實現金股利發放日） ────────────────
interface MopsTwStockAnnouncementRef {
  date1: string;
  seqNo: string;
  comp: string;
}

export function parseMopsTwStockAnnouncementRefs(html: string): MopsTwStockAnnouncementRef[] {
  const refs: MopsTwStockAnnouncementRef[] = [];
  const seen = new Set<string>();
  const re =
    /DATE1\.value="(\d+)";document\.t108sb22_fm1\.SEQ_NO\.value="([^"]+)";document\.t108sb22_fm1\.COMP\.value="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) != null) {
    const ref = { date1: m[1], seqNo: m[2], comp: m[3] };
    const key = `${ref.date1}|${ref.seqNo}|${ref.comp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  refs.sort((a, b) => a.date1.localeCompare(b.date1) || a.seqNo.localeCompare(b.seqNo));
  return refs;
}

export function parseMopsTwStockDividendDetailHtml(html: string): ActualDividendRecord | null {
  const text = stripHtml(html)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '');

  const amountMatch = /除息--普通股：每壹股配發現金\(股利\)([\d,.]+)元/.exec(text);
  const payDateMatch = /現金股利發放日：(\d{2,4}年\d{1,2}月\d{1,2}日)/.exec(text);
  const exDateMatch = /除權\/除息交易日：(\d{2,4}年\d{1,2}月\d{1,2}日)/.exec(text);

  const rawAmount = Number((amountMatch?.[1] ?? '').replace(/,/g, ''));
  const amount = Number.isFinite(rawAmount) ? Math.round(rawAmount * 1e6) / 1e6 : rawAmount;
  const payDate = normalizeTwRocChineseDate(payDateMatch?.[1] ?? '');
  const exDate = normalizeTwRocChineseDate(exDateMatch?.[1] ?? '');

  const rec: ActualDividendRecord = {
    exDate,
    payDate,
    amountPerShare: amount,
    currency: 'TWD',
    source: 'mops',
  };
  return isCompleteRecord(rec) ? rec : null;
}

async function fetchMopsTwStockDividendHistory(ticker: string): Promise<ActualDividendRecord[]> {
  const sanitized = String(ticker).replace(/^TPE:/i, '').replace(/\D/g, '');
  if (!/^\d{4,6}$/.test(sanitized)) return [];

  const currentRocYear = new Date().getFullYear() - 1911;
  const years = [currentRocYear - 1, currentRocYear];
  const detailRefs: MopsTwStockAnnouncementRef[] = [];

  for (const year of years) {
    const listParams = new URLSearchParams({
      step: '1',
      TYPEK: 'all',
      year: String(year),
      co_id: sanitized,
      month: 'all',
      b_date: '',
      e_date: '',
      isnew: 'false',
      firstin: 'true',
    });
    const listUrl = `https://mopsov.twse.com.tw/mops/web/ajax_t108sb19?${listParams.toString()}`;
    const html = await fetchMopsAsText(listUrl);
    if (!html) continue;
    detailRefs.push(...parseMopsTwStockAnnouncementRefs(html));
  }

  detailRefs.sort((a, b) => a.date1.localeCompare(b.date1) || a.seqNo.localeCompare(b.seqNo));

  const byExDate = new Map<string, ActualDividendRecord>();
  for (const ref of detailRefs) {
    const detailParams = new URLSearchParams({
      firstin: 'true',
      colorchg: '',
      TYPEK: 'all',
      isnew: 'false',
      id: '',
      DATE1: ref.date1,
      SEQ_NO: ref.seqNo,
      COMP: ref.comp,
      kind: '',
      SKIND: 'G',
      step: '2',
    });
    const detailUrl = `https://mopsov.twse.com.tw/mops/web/ajax_t108sb22?${detailParams.toString()}`;
    const html = await fetchMopsAsText(detailUrl);
    if (!html) continue;
    const rec = parseMopsTwStockDividendDetailHtml(html);
    if (rec) byExDate.set(rec.exDate, rec);
  }

  return Array.from(byExDate.values()).sort((a, b) => b.exDate.localeCompare(a.exDate));
}

// ── 台股個股：Yahoo 台股股利政策頁（備援真實發放日；既有 proxy 已允許） ───────
export function parseYahooTwDividendPageHtml(html: string): ActualDividendRecord[] {
  const rows: ActualDividendRecord[] = [];
  const flat = html.replace(/[\r\n]+/g, ' ');
  const rowRe = /<li class="List\(n\)">([\s\S]*?)<\/div><\/li>/g;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(flat)) != null) {
    const rowHtml = m[1];
    if (!/20\d{2}Q[1-4]/.test(rowHtml)) continue;

    const cells = Array.from(rowHtml.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g))
      .map(match => stripHtml(match[1]).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const quarterIdx = cells.findIndex(cell => /^20\d{2}Q[1-4]$/.test(cell));
    if (quarterIdx < 0) continue;

    const amount = normalizeAmountPerShare(Number((cells[quarterIdx + 1] ?? '').replace(/,/g, '')));
    const exDate = normalizeSlashYmd(cells[quarterIdx + 5] ?? '');
    const payDate = normalizeSlashYmd(cells[quarterIdx + 7] ?? '');
    const rec: ActualDividendRecord = {
      exDate,
      payDate,
      amountPerShare: amount,
      currency: 'TWD',
      source: 'yahoo',
    };
    if (isCompleteRecord(rec)) rows.push(rec);
  }

  rows.sort((a, b) => b.exDate.localeCompare(a.exDate));
  return rows;
}

async function fetchYahooTwDividendPageHistory(ticker: string): Promise<ActualDividendRecord[]> {
  const sanitized = String(ticker).replace(/^TPE:/i, '').replace(/\D/g, '');
  if (!/^\d{4,6}$/.test(sanitized)) return [];
  const url = `https://tw.stock.yahoo.com/quote/${encodeURIComponent(sanitized)}.TW/dividend`;
  const html = await fetchAsText(url);
  if (!html) return [];
  return parseYahooTwDividendPageHtml(html);
}

// ── 美股個股：StockAnalysis dividend page（完整 Ex-Date / Amount / Pay Date） ─
const STOCK_ANALYSIS_MONTHS: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

function normalizeStockAnalysisDate(raw: string): string {
  const m = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/.exec(raw.trim());
  if (!m) return '';
  return `${m[3]}-${STOCK_ANALYSIS_MONTHS[m[1]]}-${m[2].padStart(2, '0')}`;
}

function parseStockAnalysisDividendHtml(html: string): ActualDividendRecord[] {
  const rows: ActualDividendRecord[] = [];
  const flat = html.replace(/[\r\n]+/g, ' ');
  const tableMatch = /Dividend History[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i.exec(flat);
  const scope = tableMatch?.[1] ?? flat;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(scope)) != null) {
    const cells: string[] = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = tdRe.exec(m[1])) != null) cells.push(stripHtml(cm[1]));
    if (cells.length < 4 || /Ex-Dividend/i.test(cells[0])) continue;

    const exDate = normalizeStockAnalysisDate(cells[0]);
    const amount = normalizeAmountPerShare(Number((cells[1] ?? '').replace(/[$,\s]/g, '')));
    const payDate = normalizeStockAnalysisDate(cells[3]);
    const rec: ActualDividendRecord = {
      exDate,
      payDate,
      amountPerShare: amount,
      currency: 'USD',
      source: 'stockanalysis',
    };
    if (isCompleteRecord(rec)) rows.push(rec);
  }
  rows.sort((a, b) => b.exDate.localeCompare(a.exDate));
  return rows;
}

async function fetchStockAnalysisUsStockDividends(ticker: string): Promise<ActualDividendRecord[]> {
  const sanitized = String(ticker).replace(/\s/g, '').toLowerCase();
  if (!/^[a-z0-9.-]{1,12}$/.test(sanitized)) return [];
  // 美股 ETF（如 VT）在 /etf/ 路徑；個股在 /stocks/。兩者皆試，避免 ETF 404 後無資料。
  for (const segment of ['stocks', 'etf'] as const) {
    const url = `https://stockanalysis.com/${segment}/${encodeURIComponent(sanitized)}/dividend/`;
    const html = await fetchAsText(url);
    if (!html) continue;
    const rows = parseStockAnalysisDividendHtml(html);
    if (rows.length > 0) return rows;
  }
  return [];
}

// ── 其他市場：Yahoo Finance events=div（覆蓋優先；發放日為市場慣例推估） ──────
async function fetchYahooDividendEvents(
  ticker: string,
  market: Market,
  yahooMarket: YahooMarket
): Promise<ActualDividendRecord[]> {
  const MARKET_SUFFIX: Record<YahooMarket, string> = {
    US: '',
    TW: '.TW',
    UK: '.L',
    JP: '.T',
    CN: '.SS',
    SZ: '.SZ',
    IN: '.NS',
    CA: '.TO',
    FR: '.PA',
    HK: '.HK',
    KR: '.KS',
    DE: '.DE',
    AU: '.AX',
    SA: '.SR',
    BR: '.SA',
  };
  const cleaned = ticker
    .replace(/^TPE:/i, '')
    .replace(/\(BAK\)/gi, '')
    .replace(/\.(L|T|SS|SZ|NS|BO|TO|PA|HK|KS|KQ|DE|F|AX|SR|SA)$/i, '')
    .trim();
  if (!cleaned) return [];

  const symbol = `${cleaned}${MARKET_SUFFIX[yahooMarket] ?? ''}`;
  const enc = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?events=div&interval=1d&range=5y`;
  const json = await fetchJson<any>(url);
  const result = (json as any)?.chart?.result?.[0];
  if (!result) return [];

  const divs = result?.events?.dividends;
  const currency = result?.meta?.currency;
  const rows: ActualDividendRecord[] = [];
  if (divs && typeof divs === 'object') {
    for (const v of Object.values(divs) as any[]) {
      const amount = normalizeAmountPerShare(Number(v?.amount));
      const exDate = tsToYmd(Number(v?.date));
      const payDate = addDaysYmd(exDate, payDateOffsetDays(market));
      const rec: ActualDividendRecord = {
        exDate,
        payDate,
        payDateEstimated: true,
        amountPerShare: amount,
        currency,
        source: 'yahoo',
      };
      if (isCompleteRecord(rec)) rows.push(rec);
    }
  }
  rows.sort((a, b) => b.exDate.localeCompare(a.exDate));
  return rows;
}

/**
 * 取得指定持倉的歷史已發放現金配息（過去 5 年內）。
 * 一律回傳「除息日由新到舊」的陣列；未來日期不會出現。
 *
 * 精度優先來源：
 *  - 台股 ETF：基金資訊觀測站（含預估收益組成），MoneyDJ 備援。
 *  - 台股個股：Yahoo 台股股利頁（真實發放日，快速）＋MOPS/DJ 備援＋Yahoo chart 補缺。
 *  - 美股個股：StockAnalysis dividend page（個股 /stocks/、ETF /etf/）。
 *  - 美股／台股 ETF 若上述來源皆無資料：Yahoo Finance events=div（發放日推估）。
 *  - 其他市場個股與 ETF：Yahoo Finance events=div。
 */
export async function fetchActualDividendHistory(
  ticker: string,
  market: Market,
  yahooMarket: YahooMarket
): Promise<ActualDividendRecord[]> {
  const today = new Date().toISOString().slice(0, 10);
  const byExDate = new Map<string, ActualDividendRecord>();

  const mergeRecords = (
    records: ActualDividendRecord[],
    opts?: { fillGapsOnly?: boolean }
  ) => {
    for (const rec of records) {
      if (rec.exDate > today) continue;
      if (!isCompleteRecord(rec)) continue;
      if (opts?.fillGapsOnly && byExDate.has(rec.exDate)) continue;
      byExDate.set(rec.exDate, rec);
    }
  };

  if (market === Market.TW) {
    const fundClearRows = await fetchFundClearTwEtfHistory(ticker);
    if (fundClearRows.length) {
      mergeRecords(fundClearRows);
      if (byExDate.size > 0) {
        return Array.from(byExDate.values()).sort((a, b) => b.exDate.localeCompare(a.exDate));
      }
    }
  }

  if (market === Market.TW || market === Market.US) {
    const mdjEtfRows = await fetchMoneyDjEtfHistory(ticker, market).catch(() => null);
    if (mdjEtfRows?.length) {
      mergeRecords(
        mdjEtfRows.map(row => ({
          exDate: row.exDate,
          payDate: row.payDate,
          amountPerShare: row.amountPerShare,
          currency: row.currency,
          source: 'moneydj' as const,
          isEtf: true,
        }))
      );
      if (byExDate.size > 0) {
        return Array.from(byExDate.values()).sort((a, b) => b.exDate.localeCompare(a.exDate));
      }
    }
  }

  if (market === Market.TW) {
    mergeRecords(await fetchYahooTwDividendPageHistory(ticker).catch(() => []));
    if (byExDate.size === 0) {
      mergeRecords(await fetchMopsTwStockDividendHistory(ticker).catch(() => []));
      mergeRecords(await fetchDjTwStockCalendarHistory(ticker).catch(() => []), { fillGapsOnly: true });
    }
  } else {
    const records =
      market === Market.US
        ? await fetchStockAnalysisUsStockDividends(ticker).catch(() => [])
        : await fetchYahooDividendEvents(ticker, market, yahooMarket).catch(() => []);
    mergeRecords(records);
  }

  // 台股個股：Yahoo 台股股利頁/MOPS/DJ 先提供真實發放日；Yahoo chart 只補缺口，缺口仍標示為估算發放日。
  if (market === Market.TW) {
    mergeRecords(
      await fetchYahooDividendEvents(ticker, market, yahooMarket).catch(() => []),
      { fillGapsOnly: true }
    );
  } else if (byExDate.size === 0 && market === Market.US) {
    mergeRecords(await fetchYahooDividendEvents(ticker, market, yahooMarket).catch(() => []));
  }

  return Array.from(byExDate.values()).sort((a, b) => b.exDate.localeCompare(a.exDate));
}
