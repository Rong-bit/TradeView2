import { useCallback } from 'react';
import {
  Transaction,
  Account,
  CashFlow,
  Market,
  HistoricalData,
  RecurringDepositRule,
} from '../types';
import type { AppText } from './useAppText';

interface UiModals {
  setIsFormOpen: (v: boolean) => void;
  setIsDeleteConfirmOpen: (v: boolean) => void;
  setIsTransactionDeleteConfirmOpen: (v: boolean) => void;
  setIsCashFlowDeleteConfirmOpen: (v: boolean) => void;
  setIsHistoricalModalOpen: (v: boolean) => void;
  setIsBatchUpdateMarketOpen: (v: boolean) => void;
  setIsImportOpen: (v: boolean) => void;
}

interface DeleteState {
  transactionToDelete: string | null;
  transactionToEdit: Transaction | null;
  cashFlowToDelete: string | null;
  setTransactionToDelete: (id: string | null) => void;
  setTransactionToEdit: (tx: Transaction | null) => void;
  setCashFlowToDelete: (id: string | null) => void;
  clearTransactionDelete: () => void;
  clearTransactionEdit: () => void;
  clearCashFlowDelete: () => void;
}

interface PortfolioMutations {
  transactions: Transaction[];
  accounts: Account[];
  cashFlows: CashFlow[];
  recurringDepositRules: RecurringDepositRule[];
  updateTransaction: (tx: Transaction) => void;
  removeTransaction: (id: string) => void;
  removeTransactionsByIds: (ids: string[]) => void;
  batchUpdateMarket: (updates: { id: string; market: Market }[]) => void;
  updateAccount: (acc: Account) => void;
  removeAccount: (id: string) => void;
  updateCashFlow: (cf: CashFlow) => void;
  removeCashFlow: (id: string) => void;
  removeCashFlowsByIds: (ids: string[]) => void;
  saveHistoricalData: (data: HistoricalData) => void;
  updateRecurringDepositRule: (rule: RecurringDepositRule) => void;
}

interface Params {
  portfolio: PortfolioMutations;
  ui: UiModals;
  deleteState: DeleteState;
  appText: AppText;
  showAlert: (message: string, title?: string, type?: 'info' | 'success' | 'error') => void;
  getFilteredTransactionIds: () => string[];
  markHighlighted: (ids: string | string[]) => void;
}

export function useAppPortfolioHandlers({ portfolio, ui, deleteState, appText, showAlert, getFilteredTransactionIds, markHighlighted }: Params) {
  const {
    transactions,
    accounts,
    cashFlows,
    recurringDepositRules,
    updateTransaction,
    removeTransaction,
    removeTransactionsByIds,
    batchUpdateMarket,
    updateAccount,
    removeAccount,
    updateCashFlow,
    removeCashFlow,
    removeCashFlowsByIds,
    saveHistoricalData,
    updateRecurringDepositRule,
  } = portfolio;

  const {
    setIsFormOpen,
    setIsDeleteConfirmOpen,
    setIsTransactionDeleteConfirmOpen,
    setIsCashFlowDeleteConfirmOpen,
    setIsHistoricalModalOpen,
    setIsBatchUpdateMarketOpen,
    setIsImportOpen,
  } = ui;

  const {
    transactionToDelete,
    setTransactionToDelete,
    setTransactionToEdit,
    cashFlowToDelete,
    setCashFlowToDelete,
    clearTransactionDelete,
    clearTransactionEdit,
    clearCashFlowDelete,
  } = deleteState;

  const handleUpdateTransaction = useCallback(
    (tx: Transaction) => {
      updateTransaction(tx);
      markHighlighted(tx.id);
      showAlert(appText.txUpdated, appText.updateSuccessTitle, 'success');
    },
    [updateTransaction, markHighlighted, appText, showAlert]
  );

  const handleBatchUpdateMarket = useCallback(
    (updates: { id: string; market: Market }[]) => {
      batchUpdateMarket(updates);
      showAlert(appText.marketUpdated(updates.length), appText.updateSuccessTitle, 'success');
    },
    [batchUpdateMarket, appText, showAlert]
  );

  const handleRemoveTransaction = useCallback(
    (id: string) => {
      setTransactionToDelete(id);
      setIsTransactionDeleteConfirmOpen(true);
    },
    [setTransactionToDelete, setIsTransactionDeleteConfirmOpen]
  );

  const confirmRemoveTransaction = useCallback(() => {
    if (transactionToDelete) {
      removeTransaction(transactionToDelete);
      showAlert(appText.txDeleted, appText.deleteSuccessTitle, 'success');
    }
    setIsTransactionDeleteConfirmOpen(false);
    clearTransactionDelete();
  }, [
    transactionToDelete,
    removeTransaction,
    appText,
    showAlert,
    setIsTransactionDeleteConfirmOpen,
    clearTransactionDelete,
  ]);

  const handleClearAllTransactions = useCallback(() => {
    setIsDeleteConfirmOpen(true);
  }, [setIsDeleteConfirmOpen]);

  const confirmDeleteAllTransactions = useCallback(() => {
    const ids = getFilteredTransactionIds();
    if (ids.length === 0) {
      setIsDeleteConfirmOpen(false);
      return;
    }
    removeTransactionsByIds(ids);
    setIsDeleteConfirmOpen(false);
    setTimeout(() => showAlert(appText.txCleared(ids.length), appText.deleteSuccessTitle, 'success'), 100);
  }, [getFilteredTransactionIds, removeTransactionsByIds, setIsDeleteConfirmOpen, appText, showAlert]);

  const handleUpdateAccount = useCallback(
    (acc: Account) => {
      updateAccount(acc);
      showAlert(appText.accountUpdated(acc.name), appText.updateSuccessTitle, 'success');
    },
    [updateAccount, appText, showAlert]
  );

  const handleRemoveAccount = useCallback(
    (id: string) => {
      const acc = accounts.find(a => a.id === id);
      removeAccount(id);
      showAlert(appText.accountDeleted(acc?.name), appText.deleteSuccessTitle, 'success');
    },
    [accounts, removeAccount, appText, showAlert]
  );

  const handleUpdateCashFlow = useCallback(
    (cf: CashFlow) => {
      updateCashFlow(cf);
      markHighlighted(cf.id);
      showAlert(appText.cashFlowUpdated, appText.updateSuccessTitle, 'success');
    },
    [updateCashFlow, markHighlighted, appText, showAlert]
  );

  const handleRemoveCashFlow = useCallback(
    (id: string) => {
      setCashFlowToDelete(id);
      setIsCashFlowDeleteConfirmOpen(true);
    },
    [setCashFlowToDelete, setIsCashFlowDeleteConfirmOpen]
  );

  const confirmRemoveCashFlow = useCallback(() => {
    if (cashFlowToDelete) {
      removeCashFlow(cashFlowToDelete);
      showAlert(appText.cashFlowDeleted, appText.deleteSuccessTitle, 'success');
    }
    setIsCashFlowDeleteConfirmOpen(false);
    clearCashFlowDelete();
  }, [
    cashFlowToDelete,
    removeCashFlow,
    appText,
    showAlert,
    setIsCashFlowDeleteConfirmOpen,
    clearCashFlowDelete,
  ]);

  const cancelRemoveCashFlow = useCallback(() => {
    setIsCashFlowDeleteConfirmOpen(false);
    clearCashFlowDelete();
  }, [setIsCashFlowDeleteConfirmOpen, clearCashFlowDelete]);

  const handleClearAllCashFlows = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      removeCashFlowsByIds(ids);
      showAlert(appText.cashFlowCleared(ids.length), appText.deleteSuccessTitle, 'success');
    },
    [removeCashFlowsByIds, appText, showAlert]
  );

  const handleSaveHistoricalData = useCallback(
    (nd: HistoricalData) => {
      saveHistoricalData(nd);
      showAlert(appText.historicalSaved, appText.updateSuccessTitle, 'success');
    },
    [saveHistoricalData, appText, showAlert]
  );

  const handleAcknowledgeDebtPayment = useCallback(
    (ruleId: string) => {
      const rule = recurringDepositRules.find(r => r.id === ruleId);
      if (!rule) return;
      const period = new Date().toISOString().slice(0, 7);
      updateRecurringDepositRule({ ...rule, lastAcknowledgedPeriod: period });
    },
    [recurringDepositRules, updateRecurringDepositRule]
  );

  const openAddTransaction = useCallback(() => {
    setTransactionToEdit(null);
    setIsFormOpen(true);
  }, [setTransactionToEdit, setIsFormOpen]);

  const openEditTransaction = useCallback(
    (id: string) => {
      const tx = transactions.find(t => t.id === id);
      if (tx) {
        setTransactionToEdit(tx);
        setIsFormOpen(true);
      }
    },
    [transactions, setTransactionToEdit, setIsFormOpen]
  );

  const closeTransactionForm = useCallback(() => {
    setIsFormOpen(false);
    clearTransactionEdit();
  }, [setIsFormOpen, clearTransactionEdit]);

  return {
    handleUpdateTransaction,
    handleBatchUpdateMarket,
    handleRemoveTransaction,
    confirmRemoveTransaction,
    handleClearAllTransactions,
    confirmDeleteAllTransactions,
    handleUpdateAccount,
    handleRemoveAccount,
    handleUpdateCashFlow,
    handleRemoveCashFlow,
    confirmRemoveCashFlow,
    cancelRemoveCashFlow,
    handleClearAllCashFlows,
    handleSaveHistoricalData,
    handleAcknowledgeDebtPayment,
    openAddTransaction,
    openEditTransaction,
    closeTransactionForm,
    setIsHistoricalModalOpen,
    setIsBatchUpdateMarketOpen,
    setIsImportOpen,
  };
}
