/** 與 .env.local / GitHub Actions 建議值一致；Capacitor、GitHub Pages 等無 /api 時的預設代理 */
export const DEFAULT_YAHOO_PROXY_BASE = 'https://trade-folio.vercel.app/api/yahoo-proxy';

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
};

/** Capacitor Android/iOS WebView（hostname 常為 localhost，但無法用相對 /api/yahoo-proxy） */
export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as CapacitorWindow).Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
  const p = cap.getPlatform?.();
  return p === 'android' || p === 'ios';
}

/**
 * 解析 Yahoo/MoneyDJ 代理 base URL。
 * - 有 VITE_YAHOO_PROXY_URL → 使用
 * - Capacitor 原生 → 固定 DEFAULT（與網頁建置有設 env 時行為一致）
 * - vercel.app / 一般瀏覽器 localhost → null（呼叫端用相對 /api/yahoo-proxy）
 * - GitHub Pages 等 → DEFAULT
 */
export function resolveYahooProxyBase(): string | null {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_YAHOO_PROXY_URL as string | undefined)
      : undefined;
  if (raw?.trim()) return raw.trim().replace(/\/+$/, '');

  if (isCapacitorNative()) return DEFAULT_YAHOO_PROXY_BASE;

  if (typeof window === 'undefined') return DEFAULT_YAHOO_PROXY_BASE;

  const h = window.location.hostname;
  if (h.endsWith('vercel.app') || h === 'localhost' || h === '127.0.0.1') {
    return null;
  }

  return DEFAULT_YAHOO_PROXY_BASE;
}

function shouldBlockDirectFetch(target: string): boolean {
  return (
    /^https:\/\/query1\.finance\.yahoo\.com\//i.test(target) ||
    /^https:\/\/(www\.)?moneydj\.com\//i.test(target) ||
    /^https:\/\/(tw\.stock\.yahoo\.com|mis\.twse\.com\.tw|stockanalysis\.com|fubon-ebrokerdj\.fbs\.com\.tw)\//i.test(target)
  );
}

/** 組出 fetch 候選 URL（先 proxy，必要時才直連 target） */
export function buildProxiedFetchUrls(target: string): string[] {
  const enc = encodeURIComponent(target);
  const urls: string[] = [];
  const base = resolveYahooProxyBase();

  if (base) {
    urls.push(`${base}?target=${enc}`);
  } else if (typeof window !== 'undefined') {
    urls.push(`/api/yahoo-proxy?target=${enc}`);
  }

  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser || !shouldBlockDirectFetch(target)) {
    urls.push(target);
  }

  return urls;
}

/** 手機瀏覽器開 GitHub Pages 時網路較慢，略延長 MoneyDJ 逾時 */
function isLikelyMobileClient(): boolean {
  if (typeof window === 'undefined') return false;
  if (isCapacitorNative()) return true;
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
  } catch {
    /* ignore */
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** MoneyDJ／StockAnalysis 等僅能走 proxy；略延長逾時以避免代理回應較慢時抓不到配息實績 */
export function proxyFetchTimeoutMs(): number {
  return isLikelyMobileClient() ? 15_000 : 12_000;
}

/** 待確認實績配息備註：與 handleAddPendingActual 相同精度 */
export function formatDividendPerShare(amountPerShare: number): string {
  return amountPerShare.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
