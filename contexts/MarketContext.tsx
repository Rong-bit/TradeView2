import React, { createContext, useContext } from 'react';
import { BaseCurrency } from '../types';
import { ExchangeRates } from '../utils/calculations';

export interface MarketContextValue {
  // 匯率物件（直接傳給 calculations 函式用）
  rates: ExchangeRates;

  // 常用解構（向下相容，避免改動太多地方）
  exchangeRate: number;
  jpyExchangeRate: number | undefined;
  eurExchangeRate: number | undefined;
  gbpExchangeRate: number | undefined;
  hkdExchangeRate: number | undefined;
  krwExchangeRate: number | undefined;
  cadExchangeRate: number | undefined;
  inrExchangeRate: number | undefined;
  cnyExchangeRate: number | undefined;
  audExchangeRate: number | undefined;
  sarExchangeRate: number | undefined;
  brlExchangeRate: number | undefined;

  // 基準幣
  baseCurrency: BaseCurrency;
  setBaseCurrency: (c: BaseCurrency) => void;

  // 顯示匯率（儀表板 header 用）
  displayRate: { label: string; value: number };

  // 匯率更新
  setUsdRate: (rate: number) => void;
  updateRates: (updates: Partial<ExchangeRates>) => void;
}

export const MarketContext = createContext<MarketContextValue | null>(null);

export function useMarket(): MarketContextValue {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used inside MarketContext.Provider');
  return ctx;
}
