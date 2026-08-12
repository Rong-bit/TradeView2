import React, { createContext, useContext } from 'react';
import {
  Transaction, Account, CashFlow, Holding, PortfolioSummary,
  ChartDataPoint, AssetAllocationItem, AnnualPerformanceItem,
  AccountPerformance, HistoricalData, Market, RecurringDepositRule, StockSplitEvent,
} from '../types';

export interface PortfolioContextValue {
  // 原始資料
  transactions: Transaction[];
  accounts: Account[];
  cashFlows: CashFlow[];
  currentPrices: Record<string, number>;
  priceDetails: Record<string, { change: number; changePercent: number; previousClose?: number }>;
  historicalData: HistoricalData;
  rebalanceTargets: Record<string, number>;
  rebalanceEnabledItems: string[];
  recurringDepositRules: RecurringDepositRule[];
  stockSplits: StockSplitEvent[];

  // 計算結果
  holdings: Holding[];
  computedAccounts: Account[];
  summary: PortfolioSummary;
  chartData: ChartDataPoint[];
  assetAllocation: AssetAllocationItem[];
  annualPerformance: AnnualPerformanceItem[];
  accountPerformance: AccountPerformance[];

  // 操作：transactions
  addTransaction: (tx: Transaction) => void;
  updateTransaction: (tx: Transaction) => void;
  removeTransaction: (id: string) => void;
  addBatchTransactions: (txs: Transaction[]) => void;
  clearTransactions: () => void;
  removeTransactionsByIds: (ids: string[]) => void;
  batchUpdateMarket: (updates: { id: string; market: Market }[]) => void;

  // 操作：accounts
  addAccount: (acc: Account) => void;
  updateAccount: (acc: Account) => void;
  removeAccount: (id: string) => void;

  // 操作：cashFlows
  addCashFlow: (cf: CashFlow) => void;
  updateCashFlow: (cf: CashFlow) => void;
  removeCashFlow: (id: string) => void;
  addBatchCashFlows: (cfs: CashFlow[]) => void;
  clearCashFlows: (ids: string[]) => void;
  removeCashFlowsByIds: (ids: string[]) => void;
  addRecurringDepositRule: (rule: RecurringDepositRule) => void;
  updateRecurringDepositRule: (rule: RecurringDepositRule) => void;
  removeRecurringDepositRule: (id: string) => void;
  addStockSplit: (event: StockSplitEvent) => void;
  removeStockSplit: (id: string) => void;

  // 操作：prices / historical
  updatePrice: (key: string, price: number) => void;
  updatePricesAndDetails: (
    prices: Record<string, number>,
    details: Record<string, { change: number; changePercent: number; previousClose?: number }>
  ) => void;
  saveHistoricalData: (data: HistoricalData) => void;
  updateRebalanceTargets: (targets: Record<string, number>) => void;
  setRebalanceEnabledItems: (items: string[]) => void;

  // 自動更新
  handleAutoUpdatePrices: (silent?: boolean) => Promise<void>;
  refreshIntervalMs: number;
  /** 與實際自動更新排程共用的下次刷新時間；無持倉時為 null */
  nextRefreshAt: number | null;
}

export const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used inside PortfolioContext.Provider');
  return ctx;
}
