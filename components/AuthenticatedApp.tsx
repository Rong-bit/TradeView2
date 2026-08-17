import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BaseCurrency, BASE_CURRENCIES, Transaction, CashFlow } from '../types';
import { useLocalStorageDebouncedSimple } from '../hooks/useLocalStorageDebounced';
import { useFilters } from '../hooks/useFilters';
import { useDeleteState } from '../hooks/useDeleteState';
import { useUIState } from '../hooks/useUIState';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { usePortfolioData } from '../hooks/usePortfolioData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { usePortfolioMetrics } from '../hooks/usePortfolioMetrics';
import { useMinDebtSafetySpread } from '../hooks/useMinDebtSafetySpread';
import { usePriceAutoUpdate } from '../hooks/usePriceAutoUpdate';
import { useBackupRestore } from '../hooks/useBackupRestore';
import { useAutoHistoricalSyncEffect } from '../hooks/useAutoHistoricalSyncEffect';
import { useAppPortfolioHandlers } from '../hooks/useAppPortfolioHandlers';
import { useRecentRecordHighlights } from '../hooks/useRecentRecordHighlights';
import { useSubscription } from '../hooks/useSubscription';
import { useSafeAreaInsets } from '../hooks/useSafeAreaInsets';
import type { AuthSession } from '../hooks/useAuthSession';
import { Capacitor } from '@capacitor/core';
import { formatNumber, formatAmount } from '../utils/formatDisplay';
import { INPUT_MODE_DECIMAL } from '../utils/formFieldClasses';
import { t, getBaseCurrencyLabel, BaseCurrencyCode, LANGUAGES } from '../utils/i18n';
import { PortfolioContext } from '../contexts/PortfolioContext';
import type { View } from '../contexts/UIContext';
import { MarketContext } from '../contexts/MarketContext';
import { UIContext } from '../contexts/UIContext';
import DebtAlertsBanner from './DebtAlertsBanner';
import TransactionForm from './TransactionForm';
import Dashboard from './Dashboard';
import AccountManager from './AccountManager';
import FundManager from './FundManager';
import RebalanceView from './RebalanceView';
import HelpView from './HelpView';
import HistoryView from './HistoryView';
import BatchImportModal from './BatchImportModal';
import HistoricalDataModal from './HistoricalDataModal';
import BatchUpdateMarketModal from './BatchUpdateMarketModal';
import AssetAllocationSimulator from './AssetAllocationSimulator';
import StockSplitManager from './StockSplitManager';
import DarkModeToggle from './DarkModeToggle';
import FontScaleToggle from './FontScaleToggle';
import AlertDialog from './AlertDialog';
import AppConfirmModals from './AppConfirmModals';
import SubscriptionModal from './SubscriptionModal';

const REFRESH_INTERVAL_MS = 3 * 60 * 1000;

interface Props {
  session: AuthSession;
}

const AuthenticatedApp: React.FC<Props> = ({ session }) => {
  const {
    isGuest,
    setIsGuest,
    currentUser,
    userPrefix,
    language,
    handleLanguageChange,
    appText,
    isChinese,
    alertDialog,
    showAlert,
    closeAlert,
    handleLogout: sessionLogout,
    handleContactAdmin,
  } = session;

  const [view, setView] = useState<View>('dashboard');
  const [baseCurrency, setBaseCurrency] = useState<BaseCurrency>('TWD');
  const [debtBannerDismissed, setDebtBannerDismissed] = useState(false);

  const {
    isSubscriptionModalOpen,
    openSubscriptionModal,
    closeSubscriptionModal,
    effectiveIsGuest,
    showApplyMemberButton,
    handleSubscriptionUpdated,
  } = useSubscription({
    isAuthenticated: true,
    currentUser,
    isGuest,
    setIsGuest,
    view,
  });

  const handleUpgrade = () => {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') {
      openSubscriptionModal();
    } else {
      handleContactAdmin();
    }
  };

  /** App Store 5.1.1(v)：清除本機所有 tf_* 資料並登出 */
  const handleDeleteAccount = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tf_')) keysToRemove.push(key);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
    sessionLogout();
  }, [sessionLogout]);

  const upgradeLabel =
    Capacitor.getPlatform() === 'ios'
      ? t(language).subscription.becomeMember
      : t(language).common.upgrade;

  const {
    isFormOpen,
    isImportOpen,
    isDeleteConfirmOpen,
    isTransactionDeleteConfirmOpen,
    isCashFlowDeleteConfirmOpen,
    isHistoricalModalOpen,
    isBatchUpdateMarketOpen,
    isMobileMenuOpen,
    setIsFormOpen,
    setIsImportOpen,
    setIsDeleteConfirmOpen,
    setIsTransactionDeleteConfirmOpen,
    setIsCashFlowDeleteConfirmOpen,
    setIsHistoricalModalOpen,
    setIsBatchUpdateMarketOpen,
    setIsMobileMenuOpen,
    toggleMobileMenu,
  } = useUIState();

  const { top: safeAreaTop } = useSafeAreaInsets();

  const menuToggleRef = useRef(0);
  /** 從選單切到交易紀錄／資金管理時，關閉選單後改捲到頂而非還原舊位置 */
  const scrollToTopAfterMenuCloseRef = useRef(false);

  const handleMenuToggle = useCallback(() => {
    const now = Date.now();
    // 避免 Android 觸控合成 click / 連點造成「開了又關」像當機
    if (now - menuToggleRef.current < 350) return;
    menuToggleRef.current = now;
    toggleMobileMenu();
  }, [toggleMobileMenu]);

  const scrollPageToTop = useCallback(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const scrollY = window.scrollY || window.pageYOffset || 0;
    const { overflow, position, top, left, right, width } = document.body.style;
    const htmlOverflow = document.documentElement.style.overflow;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = overflow;
      document.body.style.position = position;
      document.body.style.top = top;
      document.body.style.left = left;
      document.body.style.right = right;
      document.body.style.width = width;
      const toTop = scrollToTopAfterMenuCloseRef.current;
      scrollToTopAfterMenuCloseRef.current = false;
      window.scrollTo(0, toTop ? 0 : scrollY);
    };
  }, [isMobileMenuOpen, setIsMobileMenuOpen]);

  // 切換至交易紀錄／資金管理時，內容從最上方開始顯示
  useEffect(() => {
    if (view !== 'history' && view !== 'funds') return;
    scrollPageToTop();
    const t0 = window.setTimeout(scrollPageToTop, 0);
    const t1 = window.setTimeout(scrollPageToTop, 50);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [view, scrollPageToTop]);

  const deleteState = useDeleteState();
  const { transactionToEdit, cashFlowToDelete } = deleteState;

  const {
    filterAccount,
    filterTicker,
    filterDateFrom,
    filterDateTo,
    includeCashFlow,
    setFilterAccount,
    setFilterTicker,
    setFilterDateFrom,
    setFilterDateTo,
    setIncludeCashFlow,
    clearFilters,
  } = useFilters();

  const {
    rates,
    loadRates,
    updateRates,
    setUsdRate,
    resetRates,
    exchangeRate,
    jpyExchangeRate,
    eurExchangeRate,
    gbpExchangeRate,
    hkdExchangeRate,
    krwExchangeRate,
    cadExchangeRate,
    inrExchangeRate,
    cnyExchangeRate,
    audExchangeRate,
    sarExchangeRate,
    brlExchangeRate,
  } = useExchangeRates(userPrefix);

  const portfolio = usePortfolioData(userPrefix);
  const {
    transactions,
    accounts,
    cashFlows,
    currentPrices,
    priceDetails,
    rebalanceTargets,
    rebalanceEnabledItems,
    historicalData,
    recurringDepositRules,
    stockSplits,
    loadData,
    resetData,
    addTransaction,
    updateTransaction,
    removeTransaction,
    addBatchTransactions,
    clearTransactions,
    removeTransactionsByIds,
    batchUpdateMarket,
    updateAccount,
    removeAccount,
    addCashFlow,
    updateCashFlow,
    removeCashFlow,
    addBatchCashFlows,
    clearCashFlows,
    removeCashFlowsByIds,
    addRecurringDepositRule,
    updateRecurringDepositRule,
    removeRecurringDepositRule,
    updatePrice,
    updatePricesAndDetails,
    updateRebalanceTargets,
    setRebalanceEnabledItems,
    saveHistoricalData,
    addStockSplit,
    removeStockSplit,
  } = portfolio;

  const { markHighlighted, isHighlighted } = useRecentRecordHighlights();

  const addTransactionWithHighlight = useCallback(
    (tx: Transaction) => {
      addTransaction(tx);
      markHighlighted(tx.id);
    },
    [addTransaction, markHighlighted]
  );

  const addBatchTransactionsWithHighlight = useCallback(
    (txs: Transaction[]) => {
      addBatchTransactions(txs);
      markHighlighted(txs.map(t => t.id));
    },
    [addBatchTransactions, markHighlighted]
  );

  const addCashFlowWithHighlight = useCallback(
    (cf: CashFlow) => {
      addCashFlow(cf);
      markHighlighted(cf.id);
    },
    [addCashFlow, markHighlighted]
  );

  const addBatchCashFlowsWithHighlight = useCallback(
    (cfs: CashFlow[]) => {
      addBatchCashFlows(cfs);
      markHighlighted(cfs.map(cf => cf.id));
    },
    [addBatchCashFlows, markHighlighted]
  );

  useLocalStorageDebouncedSimple('baseCurrency', baseCurrency, 500, userPrefix);

  const { minDebtSafetySpread, handleMinDebtSafetySpreadChange } = useMinDebtSafetySpread(userPrefix);

  useEffect(() => {
    if (!currentUser) return;
    const getKey = (key: string) => `tf_${currentUser}_${key}`;
    loadData(getKey);
    loadRates(getKey);
    const savedBase = localStorage.getItem(getKey('baseCurrency'));
    const validBases: BaseCurrency[] = [
      'TWD', 'USD', 'JPY', 'EUR', 'GBP', 'HKD', 'KRW', 'CAD', 'INR', 'CNY', 'AUD', 'SAR', 'BRL',
    ];
    if (savedBase && validBases.includes(savedBase as BaseCurrency)) {
      setBaseCurrency(savedBase as BaseCurrency);
    } else {
      const lang = navigator.language ?? '';
      if (lang.startsWith('ja')) setBaseCurrency('JPY');
      else if (lang.startsWith('ko')) setBaseCurrency('KRW');
      else if (lang.startsWith('de')) setBaseCurrency('EUR');
      else setBaseCurrency('TWD');
    }
  }, [currentUser, loadData, loadRates]);

  const metrics = usePortfolioMetrics({
    transactions,
    accounts,
    cashFlows,
    currentPrices,
    priceDetails,
    stockSplits,
    historicalData,
    rates,
    exchangeRate,
    jpyExchangeRate,
    eurExchangeRate,
    gbpExchangeRate,
    hkdExchangeRate,
    krwExchangeRate,
    cnyExchangeRate,
    inrExchangeRate,
    cadExchangeRate,
    audExchangeRate,
    sarExchangeRate,
    brlExchangeRate,
    baseCurrency,
    recurringDepositRules,
    debtBannerDismissed,
    minDebtSafetySpread,
  });

  const {
    baseHoldings,
    holdings,
    computedAccounts,
    summary,
    displayRate,
    chartData,
    assetAllocation,
    annualPerformance,
    accountPerformance,
    debtPaymentAlerts,
    debtSpreadAlerts,
    combinedRecords,
  } = metrics;

  const handleAutoUpdatePrices = usePriceAutoUpdate({
    baseCurrency,
    rates,
    baseHoldings,
    holdings,
    accounts: computedAccounts,
    updatePricesAndDetails,
    updateRates,
    showAlert,
    appText,
  });

  const {
    nextRefreshAt,
    refreshNow: refreshPricesNow,
  } = useAutoRefresh(handleAutoUpdatePrices, {
    intervalMs: REFRESH_INTERVAL_MS,
    enabled: baseHoldings.length > 0,
    refreshOnStart: true,
    refreshOnVisible: true,
  });

  useAutoHistoricalSyncEffect({
    isAuthenticated: true,
    isGuest: effectiveIsGuest,
    userPrefix,
    transactions,
    cashFlows,
    accounts,
    historicalData,
    saveHistoricalData,
  });

  const { handleExportData, handleImportData } = useBackupRestore({
    currentUser,
    rates,
    baseCurrency,
    minDebtSafetySpread,
    portfolio,
    updateRates,
    setBaseCurrency,
    handleMinDebtSafetySpreadChange,
    showAlert,
    appText,
    isChinese,
  });

  const filteredRecords = useMemo(
    () =>
      combinedRecords.filter(r => {
        if (filterAccount && r.accountId !== filterAccount) return false;
        if (!includeCashFlow && r.type === 'CASHFLOW') return false;
        if (
          filterTicker &&
          r.type === 'TRANSACTION' &&
          !r.ticker.toLowerCase().includes(filterTicker.toLowerCase())
        )
          return false;
        if (filterDateFrom && new Date(r.date) < new Date(filterDateFrom)) return false;
        if (filterDateTo && new Date(r.date) > new Date(filterDateTo)) return false;
        return true;
      }),
    [combinedRecords, filterAccount, filterTicker, filterDateFrom, filterDateTo, includeCashFlow]
  );

  const filteredTransactionIds = useMemo(
    () => filteredRecords.filter(r => r.type === 'TRANSACTION').map(r => r.id),
    [filteredRecords]
  );

  const handlers = useAppPortfolioHandlers({
    portfolio: {
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
    },
    ui: {
      setIsFormOpen,
      setIsDeleteConfirmOpen,
      setIsTransactionDeleteConfirmOpen,
      setIsCashFlowDeleteConfirmOpen,
      setIsHistoricalModalOpen,
      setIsBatchUpdateMarketOpen,
      setIsImportOpen,
    },
    deleteState,
    appText,
    showAlert,
    getFilteredTransactionIds: () => filteredTransactionIds,
    markHighlighted,
  });

  const handleLogout = () => {
    sessionLogout();
    resetData();
    resetRates();
  };

  const availableViews = effectiveIsGuest
    ? (['dashboard', 'history', 'funds', 'accounts', 'splits', 'simulator', 'help'] as View[])
    : (['dashboard', 'history', 'funds', 'accounts', 'splits', 'rebalance', 'simulator', 'help'] as View[]);

  const portfolioValue = {
    transactions,
    accounts,
    cashFlows,
    currentPrices,
    priceDetails,
    historicalData,
    rebalanceTargets,
    rebalanceEnabledItems,
    recurringDepositRules,
    stockSplits,
    holdings,
    computedAccounts,
    summary,
    chartData,
    assetAllocation,
    annualPerformance,
    accountPerformance,
    addTransaction: addTransactionWithHighlight,
    updateTransaction,
    removeTransaction,
    addBatchTransactions: addBatchTransactionsWithHighlight,
    clearTransactions,
    removeTransactionsByIds,
    batchUpdateMarket,
    addAccount: portfolio.addAccount,
    updateAccount: handlers.handleUpdateAccount,
    removeAccount: handlers.handleRemoveAccount,
    addCashFlow: addCashFlowWithHighlight,
    updateCashFlow: handlers.handleUpdateCashFlow,
    removeCashFlow: handlers.handleRemoveCashFlow,
    addBatchCashFlows: addBatchCashFlowsWithHighlight,
    clearCashFlows: handlers.handleClearAllCashFlows,
    removeCashFlowsByIds,
    addRecurringDepositRule,
    updateRecurringDepositRule,
    removeRecurringDepositRule,
    updatePrice,
    updatePricesAndDetails,
    saveHistoricalData: handlers.handleSaveHistoricalData,
    updateRebalanceTargets,
    setRebalanceEnabledItems,
    addStockSplit,
    removeStockSplit,
    handleAutoUpdatePrices: refreshPricesNow,
    refreshIntervalMs: REFRESH_INTERVAL_MS,
    nextRefreshAt,
  };

  const marketValue = {
    rates,
    exchangeRate,
    jpyExchangeRate,
    eurExchangeRate,
    gbpExchangeRate,
    hkdExchangeRate,
    krwExchangeRate,
    cadExchangeRate,
    inrExchangeRate,
    cnyExchangeRate,
    audExchangeRate,
    sarExchangeRate,
    brlExchangeRate,
    baseCurrency,
    setBaseCurrency,
    displayRate,
    setUsdRate,
    updateRates,
  };

  const uiValue = {
    language,
    setLanguage: handleLanguageChange,
    view,
    setView,
    availableViews,
    isAuthenticated: true,
    isGuest: effectiveIsGuest,
    currentUser,
    alertDialog,
    showAlert,
    closeAlert,
    isRecordHighlighted: isHighlighted,
  };

  const pageTitle =
    (view === 'dashboard' && t(language).pages.dashboard) ||
    (view === 'history' && t(language).pages.history) ||
    (view === 'funds' && t(language).pages.funds) ||
    (view === 'accounts' && t(language).pages.accounts) ||
    (view === 'splits' && t(language).pages.splits) ||
    (view === 'rebalance' && t(language).pages.rebalance) ||
    (view === 'simulator' && t(language).pages.simulator) ||
    (view === 'help' && t(language).pages.help) ||
    '';

  const navLabel = (v: View) => {
    const nav = t(language).nav;
    const map: Record<View, string> = {
      dashboard: nav.dashboard,
      history: nav.history,
      funds: nav.funds,
      accounts: nav.accounts,
      splits: nav.splits,
      rebalance: nav.rebalance,
      simulator: nav.simulator,
      help: nav.help,
    };
    return map[v];
  };

  const mainMaxW = view === 'dashboard' ? 'max-w-[1800px]' : 'max-w-7xl';
  const mainPadding =
    view === 'dashboard'
      ? 'max-sm:px-0 max-sm:pt-4 max-sm:pb-4 sm:pl-3 sm:pr-2 md:p-8 max-w-[1800px]'
      : 'p-4 max-w-7xl';

  return (
    <PortfolioContext.Provider value={portfolioValue}>
      <MarketContext.Provider value={marketValue}>
        <UIContext.Provider value={uiValue}>
          <div className="min-h-screen app-page-shell flex flex-col">
            <header
              className="app-fixed-header app-chrome-header text-white sticky top-0 z-50"
              style={{
                isolation: 'isolate',
                WebkitTransform: 'translateZ(0)',
                transform: 'translateZ(0)',
                paddingTop: safeAreaTop > 0 ? `${safeAreaTop}px` : 'env(safe-area-inset-top, 0px)',
              }}
            >
              <div className={`mx-auto px-4 ${mainMaxW}`}>
                <div className="flex items-center justify-between min-h-16 h-16" style={{ position: 'relative', zIndex: 100, pointerEvents: 'auto' }}>
                  <div
                    className="flex items-center gap-3 shrink-0"
                    style={{ position: 'relative', zIndex: 101, pointerEvents: 'auto' }}
                  >
                    <button
                      type="button"
                      id="mobile-menu-toggle-button"
                      aria-label={isMobileMenuOpen ? 'Close Menu' : 'Open Menu'}
                      aria-expanded={isMobileMenuOpen}
                      onClick={e => {
                        e.stopPropagation();
                        handleMenuToggle();
                      }}
                      className="p-3 -ml-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors touch-manipulation relative cursor-pointer"
                      style={{
                        WebkitTapHighlightColor: 'transparent',
                        touchAction: 'manipulation',
                        userSelect: 'none',
                        pointerEvents: 'auto',
                        minWidth: 48,
                        minHeight: 48,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg className="w-6 h-6 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                    <div
                      className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg cursor-pointer"
                      onClick={() => setView('dashboard')}
                      onKeyDown={e => e.key === 'Enter' && setView('dashboard')}
                      role="button"
                      tabIndex={0}
                    >
                      T
                    </div>
                    <div className="hidden sm:block">
                      <h1 className="font-bold text-lg leading-none bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                        TradeView
                      </h1>
                      <p className="text-[10px] text-slate-400 leading-none mt-0.5">{t(language).login.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="hidden sm:flex items-center">
                      <select
                        value={language}
                        onChange={e => handleLanguageChange(e.target.value as typeof language)}
                        className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {LANGUAGES.map(({ code, label }) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {showApplyMemberButton && (
                      <button
                        type="button"
                        onClick={handleUpgrade}
                        className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-bold rounded-full transition shadow-lg shadow-amber-500/20"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                        <span>{upgradeLabel}</span>
                      </button>
                    )}
                    <div className="hidden sm:flex items-center gap-2">
                      <select
                        value={baseCurrency}
                        onChange={e => setBaseCurrency(e.target.value as BaseCurrency)}
                        className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {BASE_CURRENCIES.map(c => (
                          <option key={c} value={c}>
                            {getBaseCurrencyLabel(c as BaseCurrencyCode, language)}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center bg-slate-800 rounded-md px-2 py-1 border border-slate-700">
                        <span className="text-sm text-slate-400 mr-2">{displayRate.label}</span>
                        {baseCurrency === 'TWD' ? (
                          <input
                            type="number"
                            inputMode={INPUT_MODE_DECIMAL}
                            step="0.01"
                            value={exchangeRate}
                            onChange={e => setUsdRate(parseFloat(e.target.value))}
                            className="w-14 bg-transparent text-sm text-white font-mono focus:outline-none text-right"
                          />
                        ) : (
                          <span className="w-14 text-sm text-white font-mono text-right">
                            {displayRate.value.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
                      <FontScaleToggle />
                      <DarkModeToggle />
                      <div
                        className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold ring-2 ring-slate-800 shadow-sm"
                        title={currentUser}
                      >
                        {currentUser.substring(0, 2).toUpperCase()}
                      </div>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
                        title={t(language).nav.logout}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <main className={`flex-1 mx-auto w-full md:p-8 ${mainPadding}`}>
              <div className={`mb-6 ${view === 'dashboard' ? 'max-sm:px-3 max-sm:pr-2' : ''}`}>
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 border-l-4 border-indigo-500 pl-2 sm:pl-3 flex justify-between items-center">
                  <span className="break-words">{pageTitle}</span>
                  {showApplyMemberButton && (
                    <button
                      type="button"
                      onClick={handleUpgrade}
                      className="sm:hidden px-3 py-1 bg-amber-500 text-white text-sm font-bold rounded-full shadow"
                    >
                      {upgradeLabel}
                    </button>
                  )}
                </h2>
              </div>
              <div className="animate-fade-in">
                {(view === 'dashboard' || view === 'funds') && (
                  <DebtAlertsBanner
                    paymentAlerts={debtPaymentAlerts}
                    spreadAlerts={debtSpreadAlerts}
                    hasDebtFunding={!!summary.hasDebtFunding}
                    leverageNetTWD={summary.leverageNetTWD ?? 0}
                    language={language}
                    baseCurrency={baseCurrency}
                    rates={rates}
                    onAcknowledgePayment={handlers.handleAcknowledgeDebtPayment}
                    onDismissSession={() => setDebtBannerDismissed(true)}
                  />
                )}
                {view === 'dashboard' && (
                  <Dashboard onUpdateHistorical={() => handlers.setIsHistoricalModalOpen(true)} />
                )}
                {view === 'history' && (
                  <HistoryView
                    onAddTransaction={handlers.openAddTransaction}
                    onEditTransaction={handlers.openEditTransaction}
                    onRemoveTransaction={handlers.handleRemoveTransaction}
                    onRemoveCashFlow={handlers.handleRemoveCashFlow}
                    onClearAllTransactions={handlers.handleClearAllTransactions}
                    onOpenBatchUpdateMarket={() => handlers.setIsBatchUpdateMarketOpen(true)}
                    onOpenImport={() => handlers.setIsImportOpen(true)}
                    filteredRecords={filteredRecords}
                    filteredTransactionCount={filteredTransactionIds.length}
                    filterAccount={filterAccount}
                    setFilterAccount={setFilterAccount}
                    filterTicker={filterTicker}
                    setFilterTicker={setFilterTicker}
                    filterDateFrom={filterDateFrom}
                    setFilterDateFrom={setFilterDateFrom}
                    filterDateTo={filterDateTo}
                    setFilterDateTo={setFilterDateTo}
                    includeCashFlow={includeCashFlow}
                    setIncludeCashFlow={setIncludeCashFlow}
                    clearFilters={clearFilters}
                    formatNumber={formatNumber}
                    formatAmount={formatAmount}
                  />
                )}
                {view === 'accounts' && <AccountManager />}
                {view === 'splits' && <StockSplitManager />}
                {view === 'funds' && (
                  <FundManager
                    minDebtSafetySpread={minDebtSafetySpread}
                    onMinDebtSafetySpreadChange={handleMinDebtSafetySpreadChange}
                  />
                )}
                {view === 'rebalance' && !effectiveIsGuest && <RebalanceView />}
                {view === 'simulator' && <AssetAllocationSimulator />}
                {view === 'help' && (
                  <HelpView
                    onExport={handleExportData}
                    onImport={handleImportData}
                    currentUser={currentUser}
                    onOpenSubscription={Capacitor.getPlatform() === 'ios' ? openSubscriptionModal : undefined}
                    onDeleteAccount={handleDeleteAccount}
                    onContactAdmin={handleContactAdmin}
                  />
                )}
              </div>
            </main>

            {isMobileMenuOpen &&
              typeof document !== 'undefined' &&
              createPortal(
              <div
                data-mobile-menu="true"
                className="fixed inset-0 flex bg-black/50 animate-fade-in"
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 999999,
                  pointerEvents: 'auto',
                }}
                onClick={e => {
                  if (e.target === e.currentTarget) setIsMobileMenuOpen(false);
                }}
              >
                <div
                  className="app-chrome-header w-80 h-full shadow-2xl flex flex-col animate-slide-right"
                  onClick={e => e.stopPropagation()}
                  style={{
                    maxWidth: '85vw',
                    paddingTop: safeAreaTop > 0 ? `${safeAreaTop}px` : 'env(safe-area-inset-top, 0px)',
                    overscrollBehavior: 'contain',
                  }}
                >
                  <div className="p-6 bg-white/5 border-b border-sky-400/20 flex justify-between items-center">
                    <div>
                      <h3 className="text-white font-bold text-lg">TradeView</h3>
                      <p className="text-sky-200/80 text-sm mt-1">{currentUser}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="text-slate-300 hover:text-white text-2xl transition-colors"
                      aria-label="Close Menu"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="p-4 bg-black/20 border-b border-sky-400/15 space-y-2">
                    <div className="flex justify-between items-center text-sm font-bold gap-2">
                      <span className="text-slate-500">{t(language).common.baseCurrency}</span>
                      <select
                        value={baseCurrency}
                        onChange={e => setBaseCurrency(e.target.value as BaseCurrency)}
                        className="flex-1 bg-slate-800 rounded border border-slate-700 text-emerald-400 px-2 py-1"
                      >
                        {BASE_CURRENCIES.map(c => (
                          <option key={c} value={c}>
                            {getBaseCurrencyLabel(c as BaseCurrencyCode, language)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-between items-center text-sm font-bold">
                      <span className="text-slate-500">
                        {displayRate.label} {t(language).labels.exchangeRate}
                      </span>
                      {baseCurrency === 'TWD' ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.]?[0-9]*"
                          value={exchangeRate}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === '' || v === '.') return;
                            const n = parseFloat(v);
                            if (!Number.isNaN(n)) setUsdRate(n);
                          }}
                          className="w-20 bg-slate-800 rounded border border-slate-700 text-emerald-400 text-base sm:text-sm text-right px-2 py-1"
                        />
                      ) : (
                        <span className="text-emerald-400 font-mono">{displayRate.value.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-1">
                    {availableViews.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          if (v === 'history' || v === 'funds') {
                            scrollToTopAfterMenuCloseRef.current = true;
                          }
                          setView(v);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 p-4 rounded-xl text-left transition ${view === v ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30' : 'hover:bg-white/10 text-slate-200'}`}
                      >
                        <span className="font-bold">{navLabel(v)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="p-4 border-t border-slate-800 space-y-2">
                    <FontScaleToggle variant="menu" />
                    <select
                      value={language}
                      onChange={e => {
                        handleLanguageChange(e.target.value as typeof language);
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {LANGUAGES.map(({ code, label }) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {showApplyMemberButton && (
                      <button
                        type="button"
                        onClick={() => {
                          handleUpgrade();
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-amber-500 text-slate-900 font-bold hover:bg-amber-600 transition"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                        {upgradeLabel}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        handleLogout();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-red-900/20 text-red-400 font-bold border border-red-900/30 hover:bg-red-900/30 transition"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      {t(language).nav.logout}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            <footer className="app-chrome-header text-slate-300 py-6 mt-12 border-t border-sky-400/20">
              <div className={`mx-auto px-4 text-center ${mainMaxW}`}>
                <p className="text-sm">
                  © 2025 TradeView. Designed & Developed by{' '}
                  <span className="text-sky-300 font-bold">Jun-rong, Huang</span>
                </p>
                <p className="text-[10px] mt-2 text-slate-400">{t(language).common.footerLocalDataPrivacy}</p>
              </div>
            </footer>

            {isFormOpen && (
              <TransactionForm
                onAdd={addTransactionWithHighlight}
                onUpdate={handlers.handleUpdateTransaction}
                editingTransaction={transactionToEdit}
                onClose={handlers.closeTransactionForm}
              />
            )}
            {isImportOpen && (
              <BatchImportModal onImport={addBatchTransactionsWithHighlight} onClose={() => setIsImportOpen(false)} />
            )}
            {isHistoricalModalOpen && (
              <HistoricalDataModal
                onSave={handlers.handleSaveHistoricalData}
                onClose={() => setIsHistoricalModalOpen(false)}
              />
            )}
            {isBatchUpdateMarketOpen && (
              <BatchUpdateMarketModal
                onUpdate={handlers.handleBatchUpdateMarket}
                onClose={() => setIsBatchUpdateMarketOpen(false)}
              />
            )}

            <AppConfirmModals
              language={language}
              appText={appText}
              isDeleteConfirmOpen={isDeleteConfirmOpen}
              setIsDeleteConfirmOpen={setIsDeleteConfirmOpen}
              confirmDeleteAllTransactions={handlers.confirmDeleteAllTransactions}
              pendingClearTxCount={filteredTransactionIds.length}
              isTransactionDeleteConfirmOpen={isTransactionDeleteConfirmOpen}
              setIsTransactionDeleteConfirmOpen={setIsTransactionDeleteConfirmOpen}
              confirmRemoveTransaction={handlers.confirmRemoveTransaction}
              isCashFlowDeleteConfirmOpen={isCashFlowDeleteConfirmOpen}
              cashFlowToDelete={cashFlowToDelete}
              cashFlows={cashFlows}
              accounts={accounts}
              transactions={transactions}
              confirmRemoveCashFlow={handlers.confirmRemoveCashFlow}
              cancelRemoveCashFlow={handlers.cancelRemoveCashFlow}
            />

            <AlertDialog dialog={alertDialog} language={language} onClose={closeAlert} />

            {isSubscriptionModalOpen && (
              <SubscriptionModal
                isOpen={isSubscriptionModalOpen}
                onClose={closeSubscriptionModal}
                language={language}
                onSubscriptionUpdated={handleSubscriptionUpdated}
              />
            )}
          </div>
        </UIContext.Provider>
      </MarketContext.Provider>
    </PortfolioContext.Provider>
  );
};

export default AuthenticatedApp;
