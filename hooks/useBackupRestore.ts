import { useCallback } from 'react';
import { BaseCurrency } from '../types';
import { ExchangeRates } from '../utils/calculations';
import { ImportValidationError, parseImportBackup } from '../utils/validateImportBackup';
import { shareOrDownloadBlob } from '../utils/shareDownloadBlob';
import type { AppText } from './useAppText';
import type { usePortfolioData } from './usePortfolioData';

type PortfolioDataApi = Pick<
  ReturnType<typeof usePortfolioData>,
  | 'transactions'
  | 'accounts'
  | 'cashFlows'
  | 'currentPrices'
  | 'priceDetails'
  | 'rebalanceTargets'
  | 'rebalanceEnabledItems'
  | 'historicalData'
  | 'recurringDepositRules'
  | 'stockSplits'
  | 'importData'
>;

interface Params {
  currentUser: string;
  rates: ExchangeRates & { exchangeRateUsdToTwd: number };
  baseCurrency: BaseCurrency;
  minDebtSafetySpread: number;
  portfolio: PortfolioDataApi;
  updateRates: (updates: Partial<ExchangeRates>) => void;
  setBaseCurrency: (c: BaseCurrency) => void;
  handleMinDebtSafetySpreadChange: (n: number) => void;
  showAlert: (message: string, title?: string, type?: 'info' | 'success' | 'error') => void;
  appText: AppText;
  isChinese: boolean;
}

export function useBackupRestore({
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
}: Params) {
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
    importData,
  } = portfolio;

  const handleExportData = useCallback(async () => {
    try {
      const d = {
        version: '2.0',
        user: currentUser,
        timestamp: new Date().toISOString(),
        transactions,
        accounts,
        cashFlows,
        currentPrices,
        priceDetails,
        ...rates,
        exchangeRate: rates.exchangeRateUsdToTwd,
        baseCurrency,
        rebalanceTargets,
        rebalanceEnabledItems,
        historicalData,
        recurringDepositRules,
        stockSplits,
        minDebtSafetySpread,
      };
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const filename = `TradeView_${(currentUser || 'guest').replace(/[^a-zA-Z0-9@._-]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
      await shareOrDownloadBlob(blob, filename, {
        shareTitle: appText.shareTitle,
        mimeType: 'application/json',
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      showAlert(
        appText.backupFailed(err instanceof Error ? err.message : String(err)),
        appText.genericErrorTitle,
        'error'
      );
    }
  }, [
    currentUser,
    transactions,
    accounts,
    cashFlows,
    currentPrices,
    priceDetails,
    rates,
    baseCurrency,
    rebalanceTargets,
    rebalanceEnabledItems,
    historicalData,
    recurringDepositRules,
    stockSplits,
    minDebtSafetySpread,
    appText,
    showAlert,
  ]);

  const handleImportData = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const text = e.target?.result as string;
          const validated = parseImportBackup(text);
          importData({
            transactions: validated.transactions,
            accounts: validated.accounts,
            cashFlows: validated.cashFlows,
            currentPrices: validated.currentPrices,
            priceDetails: validated.priceDetails,
            rebalanceTargets: validated.rebalanceTargets,
            rebalanceEnabledItems: validated.rebalanceEnabledItems,
            historicalData: validated.historicalData,
            recurringDepositRules: validated.recurringDepositRules,
            stockSplits: validated.stockSplits,
          });
          if (Object.keys(validated.rates).length) updateRates(validated.rates);
          if (validated.baseCurrency) setBaseCurrency(validated.baseCurrency);
          if (validated.minDebtSafetySpread !== undefined) {
            handleMinDebtSafetySpreadChange(validated.minDebtSafetySpread);
          }
          showAlert(appText.restoreSuccess, appText.restoreSuccessTitle, 'success');
        } catch (err) {
          const message =
            err instanceof ImportValidationError
              ? isChinese
                ? `匯入失敗：${err.message}`
                : `Import failed: ${err.message}`
              : appText.importFailed;
          showAlert(message, appText.importFailedTitle, 'error');
        }
      };
      reader.readAsText(file);
    },
    [
      importData,
      updateRates,
      setBaseCurrency,
      handleMinDebtSafetySpreadChange,
      showAlert,
      appText,
      isChinese,
    ]
  );

  return { handleExportData, handleImportData };
}
