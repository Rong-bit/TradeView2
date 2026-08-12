import { useEffect, useRef, useCallback, useState } from 'react';

interface UseAutoRefreshOptions {
  /** 刷新間隔（毫秒），預設 3 分鐘 */
  intervalMs?: number;
  /** 是否啟用（例如未登入時不啟用） */
  enabled?: boolean;
  /** 啟用後是否立即靜默刷新一次（預設 false） */
  refreshOnStart?: boolean;
  /** 切回前台時是否立即刷新（預設 true） */
  refreshOnVisible?: boolean;
}

/**
 * 自動定時刷新 hook。
 * - 可在啟用後立即靜默刷新一次
 * - 每 intervalMs 自動呼叫 onRefresh（靜默模式）
 * - 畫面倒數與實際排程共用 nextRefreshAt
 * - 切到其他分頁 / 最小化時暫停；切回來僅在已逾期時補刷
 * - enabled=false 時完全不啟動（未登入、無持倉時使用）
 */
export function useAutoRefresh(
  onRefresh: (silent: boolean) => Promise<void>,
  options: UseAutoRefreshOptions = {},
) {
  const {
    intervalMs = 3 * 60 * 1000, // 預設 3 分鐘
    enabled = true,
    refreshOnStart = false,
    refreshOnVisible = true,
  } = options;

  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshingRef = useRef(false);
  const onRefreshRef    = useRef(onRefresh);
  const scheduleNextRef = useRef<() => void>(() => {});
  const nextRefreshAtRef = useRef<number | null>(null);
  const hasRefreshedOnStartRef = useRef(false);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);

  // 保持 callback 最新，避免 stale closure
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  const runRefresh = useCallback(async (silent: boolean) => {
    if (isRefreshingRef.current) return; // 避免重疊請求
    isRefreshingRef.current = true;
    try {
      await onRefreshRef.current(silent);
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!enabled) {
      timerRef.current = null;
      nextRefreshAtRef.current = null;
      setNextRefreshAt(null);
      return;
    }

    const nextAt = Date.now() + intervalMs;
    nextRefreshAtRef.current = nextAt;
    setNextRefreshAt(nextAt);
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      if (document.visibilityState !== 'visible') return;
      await runRefresh(true);
      scheduleNextRef.current();
    }, intervalMs);
  }, [enabled, intervalMs, runRefresh]);

  useEffect(() => {
    scheduleNextRef.current = scheduleNext;
  }, [scheduleNext]);

  const refreshNow = useCallback(async (silent = false) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    nextRefreshAtRef.current = null;
    setNextRefreshAt(null);
    await runRefresh(silent);
    scheduleNextRef.current();
  }, [runRefresh]);

  // 初始排程；若要求啟動刷新，完成後才開始下一個完整週期。
  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      hasRefreshedOnStartRef.current = false;
      scheduleNext();
    } else if (refreshOnStart && !hasRefreshedOnStartRef.current) {
      hasRefreshedOnStartRef.current = true;
      void runRefresh(true).finally(() => {
        if (!cancelled) scheduleNextRef.current();
      });
    } else {
      scheduleNext();
    }

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, refreshOnStart, runRefresh, scheduleNext]);

  // 頁面可見性：已超過畫面所示的下次更新時間才補刷。
  useEffect(() => {
    if (!enabled || !refreshOnVisible) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      const nextAt = nextRefreshAtRef.current;
      if (nextAt != null && Date.now() >= nextAt) {
        await refreshNow(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, refreshOnVisible, refreshNow]);

  return { nextRefreshAt, refreshNow };
}
