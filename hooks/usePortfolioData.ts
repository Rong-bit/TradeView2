import { useState, useCallback } from 'react';
import { usePortfolioLocalStorage } from './usePortfolioLocalStorage';
import {
  Transaction,
  Account,
  CashFlow,
  HistoricalData,
  Market,
  RecurringDepositRule,
  StockSplitEvent,
  TransactionType,
} from '../types';
import { applyRecurringDeposits } from '../utils/recurringDeposits';
import { holdingPriceKey, quoteCurrencyForTransaction } from '../utils/calculations';
import { normalizeTransactionAmount } from '../utils/transactionAmount';
import { invalidateActualDividendCacheForTx } from '../utils/actualDividendCache';
import { clearDismissedPendingDividendKeysForTransaction } from '../utils/pendingDividendDismissals';

export interface PortfolioDataState {
  transactions: Transaction[];
  accounts: Account[];
  cashFlows: CashFlow[];
  currentPrices: Record<string, number>;
  priceDetails: Record<string, { change: number; changePercent: number; previousClose?: number }>;
  rebalanceTargets: Record<string, number>;
  rebalanceEnabledItems: string[];
  historicalData: HistoricalData;
  recurringDepositRules: RecurringDepositRule[];
  stockSplits: StockSplitEvent[];
}

/** 修正台股轉倉舊資料未捨去的金額小數 */
function normalizeTwTransferTransactions(state: PortfolioDataState): PortfolioDataState {
  let changed = false;
  const transactions = state.transactions.map(tx => {
    const next = normalizeTransactionAmount(tx);
    if (next.amount !== tx.amount) changed = true;
    return next;
  });
  return changed ? { ...state, transactions } : state;
}

/** 套用定期入金規則（單次 setState，避免 effect + cashFlows 依賴造成重複入帳） */
function applyRecurringToPortfolioState(state: PortfolioDataState): PortfolioDataState {
  const result = applyRecurringDeposits({
    rules: state.recurringDepositRules,
    cashFlows: state.cashFlows,
    accounts: state.accounts,
    today: new Date(),
  });
  if (
    result.newCashFlows.length === 0 &&
    result.updatedRules === state.recurringDepositRules
  ) {
    return state;
  }
  return {
    ...state,
    cashFlows: [...state.cashFlows, ...result.newCashFlows],
    recurringDepositRules: result.updatedRules,
  };
}

const INITIAL_STATE: PortfolioDataState = {
  transactions: [],
  accounts: [],
  cashFlows: [],
  currentPrices: {},
  priceDetails: {},
  rebalanceTargets: {},
  rebalanceEnabledItems: [],
  historicalData: {},
  recurringDepositRules: [],
  stockSplits: [],
};

function invalidatePendingDividendStateForTx(tx: Transaction): void {
  invalidateActualDividendCacheForTx(tx);
  if (tx.type === TransactionType.CASH_DIVIDEND) {
    clearDismissedPendingDividendKeysForTransaction(tx);
  }
}

export function usePortfolioData(userPrefix: string | undefined) {
  const [data, setData] = useState<PortfolioDataState>(INITIAL_STATE);

  usePortfolioLocalStorage(data, userPrefix, 500);

  /** 從 localStorage 載入所有投資組合資料 */
  const loadData = useCallback((getKey: (k: string) => string) => {
    const parse = <T>(key: string, fallback: T): T => {
      const item = localStorage.getItem(getKey(key));
      if (!item) return fallback;
      try {
        return JSON.parse(item) as T;
      } catch {
        return fallback;
      }
    };

    const loaded: PortfolioDataState = {
      transactions: parse('transactions', []),
      accounts: parse('accounts', []),
      cashFlows: parse('cashFlows', []),
      currentPrices: parse('prices', {}),
      priceDetails: parse('priceDetails', {}),
      rebalanceTargets: parse('rebalanceTargets', {}),
      rebalanceEnabledItems: parse('rebalanceEnabledItems', []),
      historicalData: parse('historicalData', {}),
      recurringDepositRules: parse('recurringDepositRules', []),
      stockSplits: parse('stockSplits', []),
    };

    /** 台股漲跌邏輯更新後，清掉舊 priceDetails（含錯誤 previousClose），各裝置需重新「更新股價」 */
    const PRICE_DETAILS_SCHEMA = '2';
    const schemaKey = 'tf_price_details_schema';
    if (localStorage.getItem(schemaKey) !== PRICE_DETAILS_SCHEMA) {
      loaded.priceDetails = {};
      localStorage.setItem(schemaKey, PRICE_DETAILS_SCHEMA);
    }

    setData(normalizeTwTransferTransactions(applyRecurringToPortfolioState(loaded)));
  }, []);

  /** 重置所有資料（登出時使用） */
  const resetData = useCallback(() => {
    setData(INITIAL_STATE);
  }, []);

  // ── Transactions ──────────────────────────────────────────────

  const addTransaction = useCallback((tx: Transaction) => {
    const normalized = normalizeTransactionAmount(tx);
    invalidateActualDividendCacheForTx(normalized);
    setData(prev => {
      const newPrices = { ...prev.currentPrices };
      const key = holdingPriceKey(
        normalized.market,
        normalized.ticker,
        quoteCurrencyForTransaction(normalized, prev.accounts)
      );
      if (!newPrices[key]) newPrices[key] = normalized.price;
      return {
        ...prev,
        transactions: [...prev.transactions, normalized],
        currentPrices: newPrices,
      };
    });
  }, []);

  const updateTransaction = useCallback((tx: Transaction) => {
    const normalized = normalizeTransactionAmount(tx);
    setData(prev => {
      const old = prev.transactions.find(t => t.id === normalized.id);
      if (old) invalidatePendingDividendStateForTx(old);
      invalidatePendingDividendStateForTx(normalized);
      return {
        ...prev,
        transactions: prev.transactions.map(t => (t.id === normalized.id ? normalized : t)),
      };
    });
  }, []);

  const removeTransaction = useCallback((id: string) => {
    setData(prev => {
      const removed = prev.transactions.find(t => t.id === id);
      if (removed) invalidatePendingDividendStateForTx(removed);
      return {
        ...prev,
        transactions: prev.transactions.filter(t => t.id !== id),
      };
    });
  }, []);

  const addBatchTransactions = useCallback((txs: Transaction[]) => {
    const normalizedTxs = txs.map(normalizeTransactionAmount);
    normalizedTxs.forEach(invalidateActualDividendCacheForTx);
    setData(prev => {
      const newPrices = { ...prev.currentPrices };
      normalizedTxs.forEach(tx => {
        const key = holdingPriceKey(
          tx.market,
          tx.ticker,
          quoteCurrencyForTransaction(tx, prev.accounts)
        );
        if (!newPrices[key] && tx.price > 0) newPrices[key] = tx.price;
      });
      return {
        ...prev,
        transactions: [...prev.transactions, ...normalizedTxs],
        currentPrices: newPrices,
      };
    });
  }, []);

  const clearTransactions = useCallback(() => {
    setData(prev => {
      prev.transactions.forEach(invalidatePendingDividendStateForTx);
      return { ...prev, transactions: [] };
    });
  }, []);

  const removeTransactionsByIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setData(prev => {
      prev.transactions
        .filter(tx => idSet.has(tx.id))
        .forEach(invalidatePendingDividendStateForTx);
      return {
        ...prev,
        transactions: prev.transactions.filter(tx => !idSet.has(tx.id)),
      };
    });
  }, []);

  const batchUpdateMarket = useCallback((updates: { id: string; market: Market }[]) => {
    setData(prev => ({
      ...prev,
      transactions: prev.transactions.map(tx => {
        const update = updates.find(u => u.id === tx.id);
        return update ? { ...tx, market: update.market } : tx;
      }),
    }));
  }, []);

  // ── Accounts ──────────────────────────────────────────────────

  const addAccount = useCallback((acc: Account) => {
    setData(prev => ({ ...prev, accounts: [...prev.accounts, acc] }));
  }, []);

  const updateAccount = useCallback((acc: Account) => {
    setData(prev => ({
      ...prev,
      accounts: prev.accounts.map(a => a.id === acc.id ? acc : a),
    }));
  }, []);

  const removeAccount = useCallback((id: string) => {
    setData(prev => ({ ...prev, accounts: prev.accounts.filter(a => a.id !== id) }));
  }, []);

  // ── Cash Flows ────────────────────────────────────────────────

  const addCashFlow = useCallback((cf: CashFlow) => {
    setData(prev => ({ ...prev, cashFlows: [...prev.cashFlows, cf] }));
  }, []);

  const updateCashFlow = useCallback((cf: CashFlow) => {
    setData(prev => ({
      ...prev,
      cashFlows: prev.cashFlows.map(c => c.id === cf.id ? cf : c),
    }));
  }, []);

  const removeCashFlow = useCallback((id: string) => {
    setData(prev => ({ ...prev, cashFlows: prev.cashFlows.filter(c => c.id !== id) }));
  }, []);

  const addBatchCashFlows = useCallback((cfs: CashFlow[]) => {
    setData(prev => ({ ...prev, cashFlows: [...prev.cashFlows, ...cfs] }));
  }, []);

  const clearCashFlows = useCallback(() => {
    setData(prev => ({ ...prev, cashFlows: [] }));
  }, []);

  const removeCashFlowsByIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setData(prev => ({
      ...prev,
      cashFlows: prev.cashFlows.filter(cf => !idSet.has(cf.id)),
    }));
  }, []);

  // ── Recurring deposit rules ───────────────────────────────────

  const addRecurringDepositRule = useCallback((rule: RecurringDepositRule) => {
    setData(prev =>
      applyRecurringToPortfolioState({
        ...prev,
        recurringDepositRules: [...prev.recurringDepositRules, rule],
      })
    );
  }, []);

  const updateRecurringDepositRule = useCallback((rule: RecurringDepositRule) => {
    setData(prev =>
      applyRecurringToPortfolioState({
        ...prev,
        recurringDepositRules: prev.recurringDepositRules.map(r => (r.id === rule.id ? rule : r)),
      })
    );
  }, []);

  const removeRecurringDepositRule = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      recurringDepositRules: prev.recurringDepositRules.filter(r => r.id !== id),
    }));
  }, []);

  const setRecurringDepositRules = useCallback((rules: RecurringDepositRule[]) => {
    setData(prev => applyRecurringToPortfolioState({ ...prev, recurringDepositRules: rules }));
  }, []);

  /** 手動觸發定期入金同步（登入時已於 loadData 內套用，勿再綁 cashFlows effect） */
  const syncRecurringDeposits = useCallback(() => {
    setData(prev => applyRecurringToPortfolioState(prev));
  }, []);

  // ── Prices ────────────────────────────────────────────────────

  const updatePrice = useCallback((key: string, price: number) => {
    setData(prev => ({ ...prev, currentPrices: { ...prev.currentPrices, [key]: price } }));
  }, []);

  const updatePricesAndDetails = useCallback(
    (
      newPrices: Record<string, number>,
      newDetails: Record<string, { change: number; changePercent: number; previousClose?: number }>
    ) => {
      setData(prev => ({
        ...prev,
        currentPrices: { ...prev.currentPrices, ...newPrices },
        priceDetails: { ...prev.priceDetails, ...newDetails },
      }));
    },
    []
  );

  // ── Other ─────────────────────────────────────────────────────

  const updateRebalanceTargets = useCallback((targets: Record<string, number>) => {
    setData(prev => ({ ...prev, rebalanceTargets: targets }));
  }, []);

  const setRebalanceEnabledItems = useCallback((items: string[]) => {
    setData(prev => ({ ...prev, rebalanceEnabledItems: items }));
  }, []);

  const saveHistoricalData = useCallback((newData: HistoricalData) => {
    setData(prev => ({ ...prev, historicalData: newData }));
  }, []);

  // ── Stock splits ──────────────────────────────────────────────

  const addStockSplit = useCallback((event: StockSplitEvent) => {
    setData(prev => ({ ...prev, stockSplits: [...prev.stockSplits, event] }));
  }, []);

  const removeStockSplit = useCallback((id: string) => {
    setData(prev => ({ ...prev, stockSplits: prev.stockSplits.filter(s => s.id !== id) }));
  }, []);

  const importData = useCallback((imported: Partial<PortfolioDataState>) => {
    setData(prev =>
      normalizeTwTransferTransactions(applyRecurringToPortfolioState({ ...prev, ...imported }))
    );
  }, []);

  return {
    // state
    ...data,
    // lifecycle
    loadData,
    resetData,
    importData,
    // transactions
    addTransaction,
    updateTransaction,
    removeTransaction,
    addBatchTransactions,
    clearTransactions,
    removeTransactionsByIds,
    batchUpdateMarket,
    // accounts
    addAccount,
    updateAccount,
    removeAccount,
    // cashflows
    addCashFlow,
    updateCashFlow,
    removeCashFlow,
    addBatchCashFlows,
    clearCashFlows,
    removeCashFlowsByIds,
    addRecurringDepositRule,
    updateRecurringDepositRule,
    removeRecurringDepositRule,
    setRecurringDepositRules,
    syncRecurringDeposits,
    // prices
    updatePrice,
    updatePricesAndDetails,
    // other
    updateRebalanceTargets,
    setRebalanceEnabledItems,
    saveHistoricalData,
    addStockSplit,
    removeStockSplit,
  };
}
