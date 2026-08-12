import { useMemo } from 'react';
import {
  Transaction,
  Account,
  CashFlow,
  Holding,
  PortfolioSummary,
  Market,
  TransactionType,
  CashFlowType,
  Currency,
  BaseCurrency,
  RecurringDepositRule,
  StockSplitEvent,
  HistoricalData,
} from '../types';
import {
  calculateHoldings,
  calculateAccountBalances,
  buildLedgerState,
  generateAdvancedChartData,
  calculateAssetAllocation,
  calculateAnnualPerformance,
  calculateAccountPerformance,
  calculateXIRR,
  getDisplayRateForBaseCurrency,
  ExchangeRates,
  currencyToTWDRate,
  holdingValueToTWD,
  transactionAmountNativeToTWD,
  cashDividendNetNative,
} from '../utils/calculations';
import {
  computeDebtSummary,
  isBrokerageAccount,
  netInvestedDeltaForCashFlow,
} from '../utils/debtAccountHelpers';
import { checkDebtPaymentAlerts, computeDebtSpreadAlerts } from '../utils/scheduledAlerts';
import { getAccountUsDividendWithholdingRate } from '../utils/dividendTaxHelpers';

export interface PortfolioMetricsInput {
  transactions: Transaction[];
  accounts: Account[];
  cashFlows: CashFlow[];
  currentPrices: Record<string, number>;
  priceDetails: Record<string, { change: number; changePercent: number; previousClose?: number }>;
  stockSplits: StockSplitEvent[];
  historicalData: HistoricalData;
  rates: ExchangeRates;
  exchangeRate: number;
  jpyExchangeRate: number | undefined;
  eurExchangeRate: number | undefined;
  gbpExchangeRate: number | undefined;
  hkdExchangeRate: number | undefined;
  krwExchangeRate: number | undefined;
  cnyExchangeRate: number | undefined;
  inrExchangeRate: number | undefined;
  cadExchangeRate: number | undefined;
  audExchangeRate: number | undefined;
  sarExchangeRate: number | undefined;
  brlExchangeRate: number | undefined;
  baseCurrency: BaseCurrency;
  recurringDepositRules: RecurringDepositRule[];
  debtBannerDismissed: boolean;
  minDebtSafetySpread: number;
}

export function usePortfolioMetrics(input: PortfolioMetricsInput) {
  const {
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
  } = input;

  const baseHoldings = useMemo(
    () => calculateHoldings(transactions, currentPrices, priceDetails, accounts, rates, stockSplits),
    [transactions, currentPrices, priceDetails, accounts, rates, stockSplits]
  );

  const computedAccounts = useMemo(
    () => calculateAccountBalances(accounts, cashFlows, transactions),
    [accounts, cashFlows, transactions]
  );

  const summary = useMemo<PortfolioSummary>(() => {
    let netInvestedTWD = 0;
    let totalUsdInflow = 0;
    let totalTwdCostForUsd = 0;
    cashFlows.forEach((cf: CashFlow) => {
      const account = accounts.find((a: Account) => a.id === cf.accountId);
      netInvestedTWD += netInvestedDeltaForCashFlow(cf, accounts, rates);
      if (cf.type === CashFlowType.DEPOSIT && account?.currency === Currency.USD) {
        totalUsdInflow += cf.amount;
        totalTwdCostForUsd += cf.amountTWD ?? cf.amount * (cf.exchangeRate ?? exchangeRate);
      }
      if (cf.type === CashFlowType.TRANSFER && cf.targetAccountId) {
        const ta = accounts.find((a: Account) => a.id === cf.targetAccountId);
        if (account?.currency === Currency.TWD && ta?.currency === Currency.USD) {
          totalUsdInflow += cf.exchangeRate ? cf.amount / cf.exchangeRate : cf.amount / exchangeRate;
          totalTwdCostForUsd += cf.amount;
        }
      }
    });
    const stockValueTWD = baseHoldings.reduce(
      (s: number, h: Holding) => s + holdingValueToTWD(h, accounts, rates),
      0
    );
    const cashValueTWD = computedAccounts.reduce((s: number, a: Account) => {
      if (!isBrokerageAccount(a)) return s;
      return s + a.balance * currencyToTWDRate(a.currency, rates);
    }, 0);
    const debt = computeDebtSummary(computedAccounts, cashFlows, rates);
    const totalValueTWD = stockValueTWD;
    const totalAssets = totalValueTWD + cashValueTWD;
    const totalPLTWD = totalAssets - netInvestedTWD;
    const netWorthTWD = totalAssets - debt.totalDebtBalanceTWD;
    const sumDiv = (type: TransactionType) =>
      transactions
        .filter((t: Transaction) => t.type === type)
        .reduce((s: number, t: Transaction) => {
          const amt =
            type === TransactionType.CASH_DIVIDEND
              ? cashDividendNetNative(t)
              : (t.amount ?? t.price * t.quantity) - t.fees;
          return s + transactionAmountNativeToTWD(amt, t, accounts, rates);
        }, 0);

    const reportYear = new Date().getFullYear();
    let yearWithheldNhiTwd = 0;
    let yearUsWithholdingTwd = 0;
    transactions.forEach((t: Transaction) => {
      if (t.type !== TransactionType.CASH_DIVIDEND) return;
      if (new Date(t.date).getFullYear() !== reportYear) return;
      if (t.withheldNhiTwd != null && t.withheldNhiTwd > 0) {
        yearWithheldNhiTwd += t.withheldNhiTwd;
      }
      if (t.market === Market.US) {
        const netNative = cashDividendNetNative(t);
        if (t.withheldUsTaxNative != null && t.withheldUsTaxNative > 0) {
          yearUsWithholdingTwd += transactionAmountNativeToTWD(t.withheldUsTaxNative, t, accounts, rates);
        } else if (netNative > 0) {
          const account = accounts.find(item => item.id === t.accountId);
          const withholdingRate = getAccountUsDividendWithholdingRate(account);
          if (withholdingRate > 0 && withholdingRate < 1) {
            const implied = netNative * (withholdingRate / (1 - withholdingRate));
            yearUsWithholdingTwd += transactionAmountNativeToTWD(implied, t, accounts, rates);
          }
        }
      }
    });

    return {
      totalCostTWD: 0,
      totalValueTWD,
      totalPLTWD,
      totalPLPercent: netInvestedTWD > 0 ? (totalPLTWD / netInvestedTWD) * 100 : 0,
      cashBalanceTWD: cashValueTWD,
      netInvestedTWD,
      annualizedReturn: calculateXIRR(cashFlows, accounts, totalAssets, rates),
      exchangeRateUsdToTwd: exchangeRate,
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
      accumulatedCashDividendsTWD: sumDiv(TransactionType.CASH_DIVIDEND),
      accumulatedStockDividendsTWD: sumDiv(TransactionType.DIVIDEND),
      avgExchangeRate: totalUsdInflow > 0 ? totalTwdCostForUsd / totalUsdInflow : 0,
      yearWithheldNhiTwd,
      yearUsWithholdingTwd,
      totalDebtBalanceTWD: debt.totalDebtBalanceTWD,
      netWorthTWD,
      leverageNetTWD: debt.leverageNetTWD,
      hasDebtFunding: debt.hasDebtFunding,
    };
  }, [baseHoldings, computedAccounts, cashFlows, rates, accounts, transactions, exchangeRate, jpyExchangeRate, eurExchangeRate, gbpExchangeRate, hkdExchangeRate, krwExchangeRate, cnyExchangeRate, inrExchangeRate, cadExchangeRate, audExchangeRate, sarExchangeRate, brlExchangeRate]);

  const displayRate = useMemo(
    () => getDisplayRateForBaseCurrency(baseCurrency, rates),
    [baseCurrency, rates]
  );

  const holdings = useMemo(() => {
    const total = summary.totalValueTWD + summary.cashBalanceTWD;
    return baseHoldings.map((h: Holding) => ({
      ...h,
      weight: total > 0 ? (holdingValueToTWD(h, accounts, rates) / total) * 100 : 0,
    }));
  }, [baseHoldings, summary.totalValueTWD, summary.cashBalanceTWD, rates, accounts]);

  const chartData = useMemo(
    () =>
      generateAdvancedChartData(
        transactions,
        cashFlows,
        accounts,
        summary.totalValueTWD + summary.cashBalanceTWD,
        rates,
        historicalData
      ),
    [
      transactions,
      cashFlows,
      accounts,
      summary.totalValueTWD,
      summary.cashBalanceTWD,
      rates,
      historicalData,
    ]
  );

  const assetAllocation = useMemo(
    () => calculateAssetAllocation(holdings, summary.cashBalanceTWD, rates, accounts),
    [holdings, summary.cashBalanceTWD, rates, accounts]
  );

  const annualPerformance = useMemo(() => calculateAnnualPerformance(chartData), [chartData]);

  const accountPerformance = useMemo(
    () => calculateAccountPerformance(computedAccounts, holdings, cashFlows, transactions, rates, stockSplits),
    [computedAccounts, holdings, cashFlows, transactions, rates, stockSplits]
  );

  const debtPaymentAlerts = useMemo(
    () => (debtBannerDismissed ? [] : checkDebtPaymentAlerts(recurringDepositRules, accounts)),
    [recurringDepositRules, accounts, debtBannerDismissed]
  );

  const debtSpreadAlerts = useMemo(
    () =>
      computeDebtSpreadAlerts(
        accounts,
        accountPerformance.map(ap => ({ id: ap.id, name: ap.name, roi: ap.roi })),
        minDebtSafetySpread
      ),
    [accounts, accountPerformance, minDebtSafetySpread]
  );

  const combinedRecords = useMemo(
    () => buildLedgerState(transactions, cashFlows, accounts).combinedRecordsSorted,
    [transactions, cashFlows, accounts]
  );

  return {
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
  };
}
