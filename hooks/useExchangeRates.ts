import { useState, useCallback, useEffect, useRef } from 'react';
import { ExchangeRates } from '../utils/calculations';

export interface ExchangeRateState extends ExchangeRates {
  // ExchangeRates 已包含所有欄位，此處作為別名使用
}

const DEFAULT_RATES: ExchangeRateState = {
  exchangeRateUsdToTwd: 31.5,
  jpyExchangeRate: undefined,
  eurExchangeRate: undefined,
  gbpExchangeRate: undefined,
  hkdExchangeRate: undefined,
  krwExchangeRate: undefined,
  cadExchangeRate: undefined,
  inrExchangeRate: undefined,
  cnyExchangeRate: undefined,
  audExchangeRate: undefined,
  sarExchangeRate: undefined,
  brlExchangeRate: undefined,
};

const DEFAULT_USD_TWD = DEFAULT_RATES.exchangeRateUsdToTwd;
const isReasonableUsdTwd = (rate: number): boolean => rate >= 10 && rate <= 100;

const parsePositiveNumber = (raw: string | null): number | undefined => {
  if (!raw) return undefined;
  const val = parseFloat(raw);
  return Number.isFinite(val) && val > 0 ? val : undefined;
};

// localStorage key 對應表
const RATE_KEYS: Record<keyof ExchangeRateState, string> = {
  exchangeRateUsdToTwd: 'exchangeRate',
  jpyExchangeRate: 'jpyExchangeRate',
  eurExchangeRate: 'eurExchangeRate',
  gbpExchangeRate: 'gbpExchangeRate',
  hkdExchangeRate: 'hkdExchangeRate',
  krwExchangeRate: 'krwExchangeRate',
  cadExchangeRate: 'cadExchangeRate',
  inrExchangeRate: 'inrExchangeRate',
  cnyExchangeRate: 'cnyExchangeRate',
  audExchangeRate: 'audExchangeRate',
  sarExchangeRate: 'sarExchangeRate',
  brlExchangeRate: 'brlExchangeRate',
};

export function useExchangeRates(persistUserPrefix?: string) {
  const [rates, setRates] = useState<ExchangeRateState>(DEFAULT_RATES);
  const skipFirstSave = useRef(true);
  const ratesRef = useRef(rates);
  ratesRef.current = rates;

  /** 從 localStorage 載入所有匯率 */
  const loadRates = useCallback((getKey: (k: string) => string) => {
    const usdRate = parsePositiveNumber(localStorage.getItem(getKey('exchangeRate')));
    const loaded: ExchangeRateState = {
      exchangeRateUsdToTwd: usdRate !== undefined && isReasonableUsdTwd(usdRate) ? usdRate : DEFAULT_USD_TWD,
      jpyExchangeRate: undefined,
      eurExchangeRate: undefined,
      gbpExchangeRate: undefined,
      hkdExchangeRate: undefined,
      krwExchangeRate: undefined,
      cadExchangeRate: undefined,
      inrExchangeRate: undefined,
      cnyExchangeRate: undefined,
      audExchangeRate: undefined,
      sarExchangeRate: undefined,
      brlExchangeRate: undefined,
    };

    const optionalKeys: Array<keyof Omit<ExchangeRateState, 'exchangeRateUsdToTwd'>> = [
      'jpyExchangeRate', 'eurExchangeRate', 'gbpExchangeRate',
      'hkdExchangeRate', 'krwExchangeRate', 'cadExchangeRate',
      'inrExchangeRate', 'cnyExchangeRate', 'audExchangeRate',
      'sarExchangeRate', 'brlExchangeRate',
    ];

    optionalKeys.forEach(key => {
      loaded[key] = parsePositiveNumber(localStorage.getItem(getKey(RATE_KEYS[key])));
    });

    setRates(loaded);
    return loaded;
  }, []);

  /** 儲存所有匯率到 localStorage */
  const saveRates = useCallback((newRates: ExchangeRateState, userPrefix: string) => {
    const getKey = (k: string) => `${userPrefix}_${k}`;

    localStorage.setItem(getKey('exchangeRate'), newRates.exchangeRateUsdToTwd.toString());

    const optionalKeys: Array<keyof Omit<ExchangeRateState, 'exchangeRateUsdToTwd'>> = [
      'jpyExchangeRate', 'eurExchangeRate', 'gbpExchangeRate',
      'hkdExchangeRate', 'krwExchangeRate', 'cadExchangeRate',
      'inrExchangeRate', 'cnyExchangeRate', 'audExchangeRate',
      'sarExchangeRate', 'brlExchangeRate',
    ];

    optionalKeys.forEach(key => {
      const storeKey = getKey(RATE_KEYS[key]);
      const val = newRates[key];
      if (val !== undefined) {
        localStorage.setItem(storeKey, val.toString());
      } else {
        localStorage.removeItem(storeKey);
      }
    });
  }, []);

  /** 批次更新匯率（例如從 API 回傳後更新） */
  const updateRates = useCallback((updates: Partial<ExchangeRateState>) => {
    setRates(prev => ({ ...prev, ...updates }));
  }, []);

  /** 僅更新 USD/TWD 匯率 */
  const setUsdRate = useCallback((rate: number) => {
    const safeRate = isReasonableUsdTwd(rate) ? rate : DEFAULT_USD_TWD;
    setRates(prev => ({ ...prev, exchangeRateUsdToTwd: safeRate }));
  }, []);

  /** 重置所有匯率為預設值 */
  const resetRates = useCallback(() => {
    setRates(DEFAULT_RATES);
  }, []);

  useEffect(() => {
    skipFirstSave.current = true;
  }, [persistUserPrefix]);

  useEffect(() => {
    if (!persistUserPrefix) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }

    let pending = true;
    const timer = setTimeout(() => {
      saveRates(ratesRef.current, persistUserPrefix);
      pending = false;
    }, 500);

    return () => {
      clearTimeout(timer);
      if (pending) {
        saveRates(ratesRef.current, persistUserPrefix);
      }
    };
  }, [rates, persistUserPrefix, saveRates]);

  return {
    rates,
    loadRates,
    saveRates,
    updateRates,
    setUsdRate,
    resetRates,
    // 向下相容：直接解構出常用屬性
    exchangeRate: rates.exchangeRateUsdToTwd,
    jpyExchangeRate: rates.jpyExchangeRate,
    eurExchangeRate: rates.eurExchangeRate,
    gbpExchangeRate: rates.gbpExchangeRate,
    hkdExchangeRate: rates.hkdExchangeRate,
    krwExchangeRate: rates.krwExchangeRate,
    cadExchangeRate: rates.cadExchangeRate,
    inrExchangeRate: rates.inrExchangeRate,
    cnyExchangeRate: rates.cnyExchangeRate,
    audExchangeRate: rates.audExchangeRate,
    sarExchangeRate: rates.sarExchangeRate,
    brlExchangeRate: rates.brlExchangeRate,
  };
}
