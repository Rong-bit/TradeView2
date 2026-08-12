import { useEffect, useRef } from 'react';
import type { PortfolioDataState } from './usePortfolioData';

const STORAGE_MAP: { stateKey: keyof PortfolioDataState; storageKey: string }[] = [
  { stateKey: 'transactions', storageKey: 'transactions' },
  { stateKey: 'accounts', storageKey: 'accounts' },
  { stateKey: 'cashFlows', storageKey: 'cashFlows' },
  { stateKey: 'currentPrices', storageKey: 'prices' },
  { stateKey: 'priceDetails', storageKey: 'priceDetails' },
  { stateKey: 'rebalanceTargets', storageKey: 'rebalanceTargets' },
  { stateKey: 'rebalanceEnabledItems', storageKey: 'rebalanceEnabledItems' },
  { stateKey: 'historicalData', storageKey: 'historicalData' },
  { stateKey: 'recurringDepositRules', storageKey: 'recurringDepositRules' },
  { stateKey: 'stockSplits', storageKey: 'stockSplits' },
];

function writePortfolioToLocalStorage(data: PortfolioDataState, userPrefix: string): void {
  for (const { stateKey, storageKey } of STORAGE_MAP) {
    try {
      const fullKey = `${userPrefix}_${storageKey}`;
      localStorage.setItem(fullKey, JSON.stringify(data[stateKey]));
    } catch (error) {
      console.error(`[usePortfolioLocalStorage] 儲存失敗 (${storageKey}):`, error);
    }
  }
}

/**
 * 將整包投資組合 state 以單一防抖 timer 批次寫入 localStorage（取代多個 hook）。
 */
export function usePortfolioLocalStorage(
  data: PortfolioDataState,
  userPrefix: string | undefined,
  delay = 500
): void {
  const skipFirstSave = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const dataRef = useRef(data);
  dataRef.current = data;
  const pendingRef = useRef(false);

  useEffect(() => {
    skipFirstSave.current = true;
  }, [userPrefix]);

  useEffect(() => {
    if (!userPrefix) return;

    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }

    pendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      writePortfolioToLocalStorage(dataRef.current, userPrefix);
      pendingRef.current = false;
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current) {
        writePortfolioToLocalStorage(dataRef.current, userPrefix);
        pendingRef.current = false;
      }
    };
  }, [data, userPrefix, delay]);
}
