import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Account, CashFlow, CashFlowType, Currency, Holding, AssetClass, Market, Transaction, TransactionType, StockSplitEvent } from '../portfolioTypes';
import { formatCurrency, valueInBaseCurrency, getDisplayRateForBaseCurrency, holdingValueToTWD, buildAttributionSeries, buildWaterfallYearRows, buildQuarterlyTrendData, getAssetClassForTicker, calculateAssetAllocation, currencyToTWDRate, cashDividendNetNative } from '../utils/calculations';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useMarket } from '../contexts/MarketContext';
import { useUI } from '../contexts/UIContext';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, Brush, AreaChart, Area, Rectangle } from 'recharts';
import HoldingsTable from './HoldingsTable';
import MarketPerformanceChart from './MarketPerformanceChart';
import CashFlowWaterfall, { WaterfallLegendHints } from './CashFlowWaterfall';
import DividendHeatmap from './DividendHeatmap';
import { t, translate } from '../utils/i18n';
import { ALLOCATION_INNER_BOND_COLOR, ALLOCATION_INNER_EQUITY_COLOR } from '../utils/allocationDonutColors';
import { getSplitsForSymbol, applyPendingSplitsToPosition } from '../utils/stockSplitHelpers';
import {
  isDebtFundedInflow,
  isDebtRepaymentOutflow,
  netInvestedDeltaForCashFlow,
  buildLiabilityAccountInsights,
} from '../utils/debtAccountHelpers';

export interface DashboardProps {
  onUpdateHistorical?: () => void;
}

/** 設為 true 可重新顯示儀表板「年度績效表」區塊（暫時隱藏，未刪除程式） */
const SHOW_ANNUAL_PERFORMANCE_TABLE = false;

/** 雙鈕一體式膠囊：外框圓角、內鈕無縫、中間無分隔線 */
const SEGMENT_PILL_CLASS =
  'inline-flex overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-600';

const SEGMENT_BTN_CLASS =
  'px-3 py-1.5 text-sm rounded-none transition whitespace-nowrap focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/90';

function Dashboard({ onUpdateHistorical }: DashboardProps) {
  const { summary, holdings, chartData, annualPerformance,
    accountPerformance, cashFlows, transactions, accounts: portfolioAccounts, computedAccounts,
    updatePrice: onUpdatePrice, handleAutoUpdatePrices: onAutoUpdate,
    refreshIntervalMs, historicalData, stockSplits } = usePortfolio();
  const { baseCurrency, rates } = useMarket();
  const { language, isGuest } = useUI();
  const accounts = computedAccounts;
  const visibleAccountPerformance = useMemo(
    () =>
      accountPerformance.filter(ap => {
        const src = portfolioAccounts.find(a => a.id === ap.id);
        return !src?.isHidden;
      }),
    [accountPerformance, portfolioAccounts]
  );
  const translations = t(language);
  const [showDetails, setShowDetails] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [showCostDetailModal, setShowCostDetailModal] = useState(false);
  const [showAccountInUSD, setShowAccountInUSD] = useState(false); 
  const [showAnnualInUSD, setShowAnnualInUSD] = useState(false);
  const [mainChartTab, setMainChartTab] = useState<'cumulative' | 'year'>('cumulative');
  const [trendSeriesVisible, setTrendSeriesVisible] = useState({
    cost: true,
    profit: true,
    totalAssets: true,
    estTotalAssets: true,
    yearlyPeriodRoi: false,
  });
  const [activeInnerIndex, setActiveInnerIndex] = useState<number | undefined>(undefined);
  const [activeOuterIndex, setActiveOuterIndex] = useState<number | undefined>(undefined);
  /**
   * 資產配置區：雙層 Pie、圖例 grid 的 gap、扇形 padding 都會觸發連續 leave。
   * 改為只在「整塊互動區」外 pointerleave 時延遲清除；區內移動（含跨圖例格線）不會清狀態。
   */
  const allocationHoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ALLOCATION_DONUT_HOVER_CLEAR_MS = 220;

  const cancelAllocationHoverClear = useCallback(() => {
    if (allocationHoverClearTimerRef.current != null) {
      clearTimeout(allocationHoverClearTimerRef.current);
      allocationHoverClearTimerRef.current = null;
    }
  }, []);

  const scheduleAllocationHoverClear = useCallback(() => {
    cancelAllocationHoverClear();
    allocationHoverClearTimerRef.current = setTimeout(() => {
      setActiveOuterIndex(undefined);
      setActiveInnerIndex(undefined);
      allocationHoverClearTimerRef.current = null;
    }, ALLOCATION_DONUT_HOVER_CLEAR_MS);
  }, [cancelAllocationHoverClear]);

  useEffect(
    () => () => {
      cancelAllocationHoverClear();
    },
    [cancelAllocationHoverClear]
  );
  const [tickerClassOverrides, setTickerClassOverrides] = useState<Record<string, AssetClass>>({});
  // 股/債覆寫用：寫入 localStorage：assetClassOverrides
  const [overrideTickerInput, setOverrideTickerInput] = useState<string>('');
  const [overrideAssetClass, setOverrideAssetClass] = useState<AssetClass>(AssetClass.EQUITY);
  const [showAssetClassOverride, setShowAssetClassOverride] = useState(false);
  const tickerSuggestions = useMemo(
    () => Array.from(new Set(holdings.map((h: Holding) => h.ticker))).sort((a, b) => a.localeCompare(b)),
    [holdings]
  );
  const holdingTickersUpper = useMemo(
    () => new Set(holdings.map((h: Holding) => h.ticker.trim().toUpperCase())),
    [holdings]
  );
  const overrideChips = useMemo(() => {
    return Object.entries(tickerClassOverrides)
      .filter(([ticker]) => holdingTickersUpper.has(ticker))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [tickerClassOverrides, holdingTickersUpper]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [hoveredAnnualYear, setHoveredAnnualYear] = useState<string | null>(null);
  const [hoveredAccountId, setHoveredAccountId] = useState<string | null>(null);

  const toBase = useCallback(
    (v: number) => valueInBaseCurrency(v, baseCurrency, rates),
    [baseCurrency, rates]
  );
  const displayRate = getDisplayRateForBaseCurrency(baseCurrency, rates);

  const liabilityInsights = useMemo(
    () => buildLiabilityAccountInsights(accounts, rates),
    [accounts, rates]
  ); 
  const overseasTaxProgress = useMemo(() => {
    const reportYear = new Date().getFullYear();
    const DECLARATION_THRESHOLD_TWD = 1_000_000;
    const AMT_EXEMPTION_TWD = 6_700_000;
    const AMT_RATE = 0.2;

    const accountCurrencyMap = new Map<string, Currency>();
    accounts.forEach((acc: Account) => {
      accountCurrencyMap.set(acc.id, acc.currency);
    });

    const accountHistoricalRates = new Map<string, Array<{ dateTs: number; rate: number }>>();
    cashFlows.forEach((cf: CashFlow) => {
      const accountCurrency = accountCurrencyMap.get(cf.accountId) ?? Currency.TWD;
      if (accountCurrency === Currency.TWD) return;
      const dateTs = new Date(cf.date).getTime();
      if (!Number.isFinite(dateTs)) return;

      let rate = 0;
      if (cf.exchangeRate && cf.exchangeRate > 0) {
        rate = cf.exchangeRate;
      } else if (cf.amountTWD && cf.amountTWD > 0 && cf.amount > 0) {
        rate = cf.amountTWD / cf.amount;
      }
      if (!Number.isFinite(rate) || rate <= 0) return;

      const arr = accountHistoricalRates.get(cf.accountId) ?? [];
      arr.push({ dateTs, rate });
      accountHistoricalRates.set(cf.accountId, arr);
    });
    accountHistoricalRates.forEach(arr => arr.sort((a, b) => a.dateTs - b.dateTs));

    const resolveRateForDate = (accountId: string, date: string): number => {
      const ccy = accountCurrencyMap.get(accountId) ?? Currency.TWD;
      if (ccy === Currency.TWD) return 1;
      const dateTs = new Date(date).getTime();
      const rows = accountHistoricalRates.get(accountId) ?? [];
      let hitRate: number | null = null;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].dateTs <= dateTs) {
          hitRate = rows[i].rate;
          break;
        }
      }
      if (hitRate && hitRate > 0) return hitRate;
      return currencyToTWDRate(ccy, rates);
    };

    const toTwdByTxDate = (nativeAmount: number, tx: Transaction): number => {
      const accountCurrency = accountCurrencyMap.get(tx.accountId) ?? Currency.TWD;
      if (accountCurrency === Currency.TWD) return nativeAmount;
      return nativeAmount * resolveRateForDate(tx.accountId, tx.date);
    };

    let overseasRealizedPLTwd = 0;
    let overseasDividendTwd = 0;
    const positionMap = new Map<string, { quantity: number; totalCost: number }>();
    const splitCursors = new Map<string, { splits: StockSplitEvent[]; index: number }>();
    const txs = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    txs.forEach(tx => {
      const key = `${tx.accountId}-${tx.market}-${tx.ticker.toUpperCase()}`;
      if (!positionMap.has(key)) positionMap.set(key, { quantity: 0, totalCost: 0 });
      const pos = positionMap.get(key)!;
      if (!splitCursors.has(key)) {
        splitCursors.set(key, {
          splits: getSplitsForSymbol(stockSplits, tx.market, tx.ticker),
          index: 0,
        });
      }
      const splitCursor = splitCursors.get(key)!;
      applyPendingSplitsToPosition(pos, splitCursor.splits, splitCursor, tx.date);
      const isOverseasMarket = tx.market !== Market.TW;
      const isReportYear = new Date(tx.date).getFullYear() === reportYear;

      if (
        tx.type === TransactionType.BUY ||
        tx.type === TransactionType.TRANSFER_IN ||
        tx.type === TransactionType.DIVIDEND
      ) {
        const txCost = tx.amount !== undefined
          ? tx.amount
          : (tx.price * tx.quantity + (tx.fees || 0));
        pos.quantity += tx.quantity;
        pos.totalCost += txCost;
        return;
      }

      if (tx.type === TransactionType.SELL || tx.type === TransactionType.TRANSFER_OUT) {
        if (pos.quantity <= 0) return;
        const ratio = tx.quantity / pos.quantity;
        let costOfSold = pos.totalCost * ratio;
        if (tx.market === Market.TW) costOfSold = Math.round(costOfSold);
        pos.quantity -= tx.quantity;
        pos.totalCost -= costOfSold;

        if (tx.type === TransactionType.SELL && isOverseasMarket && isReportYear) {
          const proceeds = tx.amount !== undefined
            ? tx.amount
            : (tx.price * tx.quantity - (tx.fees || 0));
          const realizedNative = proceeds - costOfSold;
          overseasRealizedPLTwd += toTwdByTxDate(realizedNative, tx);
        }
        return;
      }

      if (tx.type === TransactionType.CASH_DIVIDEND && isOverseasMarket && isReportYear) {
        const divNative = cashDividendNetNative(tx);
        overseasDividendTwd += toTwdByTxDate(divNative, tx);
      }
    });

    const overseasIncomeTwd = overseasRealizedPLTwd + overseasDividendTwd;
    const basicIncomeTwd = overseasIncomeTwd;
    const estimatedTaxableBaseTwd = Math.max(0, basicIncomeTwd - AMT_EXEMPTION_TWD);
    const estimatedAmtTaxTwd = estimatedTaxableBaseTwd * AMT_RATE;

    let statusText = '無須申報';
    let hintText = '海外所得未達 100 萬，暫無申報需求。';
    let barClass = 'bg-emerald-500';
    if (overseasIncomeTwd >= DECLARATION_THRESHOLD_TWD && overseasIncomeTwd <= AMT_EXEMPTION_TWD) {
      statusText = '需申報，免課稅';
      hintText = '已達申報門檻（100 萬），但未超過 670 萬免稅額。';
      barClass = 'bg-amber-500';
    } else if (overseasIncomeTwd > AMT_EXEMPTION_TWD) {
      statusText = '注意！可能產生稅義務';
      hintText = '已超過 670 萬，請留意最低稅負制試算結果。';
      barClass = 'bg-rose-500';
    }

    const progressPct = Math.min(100, Math.max(0, (Math.max(overseasIncomeTwd, 0) / AMT_EXEMPTION_TWD) * 100));

    return {
      reportYear,
      overseasRealizedPLTwd,
      overseasDividendTwd,
      overseasIncomeTwd,
      basicIncomeTwd,
      estimatedTaxableBaseTwd,
      estimatedAmtTaxTwd,
      declarationThresholdTwd: DECLARATION_THRESHOLD_TWD,
      amtExemptionTwd: AMT_EXEMPTION_TWD,
      statusText,
      hintText,
      barClass,
      progressPct,
    };
  }, [accounts, cashFlows, transactions, rates, stockSplits]);


  /** 累積損益圖：窄螢幕（與瀑布圖同款判斷）— 外擴 margin、較緊卡片內距，繪圖區較大 */
  const [isTrendChartCompact, setIsTrendChartCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => setIsTrendChartCompact(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  /**
   * 窄螢幕右側只留 Y 軸刻度寬（margin.right 盡量小），避免繪圖區右側一大塊空白；
   * 右軸 width 與 margin 合計仍需容納「12%」類刻度，勾選報酬率時不另加大 margin。
   */
  const cumulativeChartMargin = useMemo(() => {
    if (isTrendChartCompact) {
      return { top: 8, left: 8, right: 2, bottom: 58 };
    }
    return { top: 10, left: 44, right: 40, bottom: 60 };
  }, [isTrendChartCompact]);

  useEffect(() => {
    setIsMounted(true);
    // 與專案實際 dark class 同步，避免 matchMedia 與 html.dark 不一致造成字色/背景對比錯誤
    const readFromDom = () => document.documentElement.classList.contains('dark');
    setIsDarkMode(readFromDom());

    const observer = new MutationObserver(() => {
      setIsDarkMode(readFromDom());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('assetClassOverrides');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, AssetClass>;
      if (parsed && typeof parsed === 'object') {
        setTickerClassOverrides(parsed);
      }
    } catch {
      // ignore invalid localStorage value
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('assetClassOverrides', JSON.stringify(tickerClassOverrides));
  }, [tickerClassOverrides]);

  const normalizeOverrideKey = (raw: string) => raw.trim().toUpperCase();

  const setOverrideForTicker = () => {
    const key = normalizeOverrideKey(overrideTickerInput);
    if (!key) return;
    setTickerClassOverrides(prev => ({ ...prev, [key]: overrideAssetClass }));
  };

  const clearOverrideForTicker = (tickerKey: string) => {
    const key = normalizeOverrideKey(tickerKey);
    if (!key) return;
    setTickerClassOverrides(prev => {
      if (!(key in prev)) return prev;
      const next: Record<string, AssetClass> = { ...prev };
      delete next[key];
      return next;
    });
  };

  /** 外圈：依 ticker 合併持倉市值占比（不含現金；同一標的不同帳戶會加總）。
   * 排序與內圈「股票→債券」一致：先所有股票類標的、再債券類，同類內依市值大→小，使內外圈同類別落在相近圓心角。 */
  const tickerAllocationOuter = useMemo(() => {
    const items = calculateAssetAllocation(holdings, 0, rates, portfolioAccounts).filter(item => item.value > 0);
    const equity: typeof items = [];
    const bond: typeof items = [];
    const other: typeof items = [];
    for (const item of items) {
      const ac = getAssetClassForTicker(item.name, tickerClassOverrides);
      if (ac === AssetClass.BOND) bond.push(item);
      else if (ac === AssetClass.EQUITY) equity.push(item);
      else other.push(item);
    }
    const byValueDesc = (a: (typeof items)[0], b: (typeof items)[0]) => b.value - a.value;
    equity.sort(byValueDesc);
    bond.sort(byValueDesc);
    other.sort(byValueDesc);
    return [...equity, ...bond, ...other];
  }, [holdings, rates, portfolioAccounts, tickerClassOverrides]);

  const stockBondAllocation = useMemo(() => {
    let stockValue = 0;
    let bondValue = 0;
    holdings.forEach((h: Holding) => {
      const value = holdingValueToTWD(h, portfolioAccounts, rates);
      const assetClass = getAssetClassForTicker(h.ticker, tickerClassOverrides);
      if (assetClass === AssetClass.BOND) bondValue += value;
      else if (assetClass === AssetClass.EQUITY) stockValue += value;
    });
    const total = stockValue + bondValue;
    if (total <= 0) return [];
    const result: Array<{ name: string; value: number; ratio: number; color: string; assetClass: AssetClass }> = [];
    const eq = translations.dashboard.equityLabelShort;
    const bd = translations.dashboard.bondLabelShort;
    if (stockValue > 0)
      result.push({
        name: eq,
        value: stockValue,
        ratio: (stockValue / total) * 100,
        color: ALLOCATION_INNER_EQUITY_COLOR,
        assetClass: AssetClass.EQUITY,
      });
    if (bondValue > 0)
      result.push({
        name: bd,
        value: bondValue,
        ratio: (bondValue / total) * 100,
        color: ALLOCATION_INNER_BOND_COLOR,
        assetClass: AssetClass.BOND,
      });
    return result;
  }, [holdings, rates, tickerClassOverrides, portfolioAccounts, translations]);

  const totalAssetsWithCashTwd = summary.totalValueTWD + summary.cashBalanceTWD;
  const hasDebtOnBooks = (summary.totalDebtBalanceTWD ?? 0) > 0;
  const assetsCardHeadlineTwd = hasDebtOnBooks
    ? (summary.netWorthTWD ?? totalAssetsWithCashTwd)
    : totalAssetsWithCashTwd;
  const cashRatioOfTotalAssets = totalAssetsWithCashTwd > 0
    ? (summary.cashBalanceTWD / totalAssetsWithCashTwd) * 100
    : 0;

  const allocationIncludingCash = useMemo(() => {
    let stockValue = 0;
    let bondValue = 0;
    holdings.forEach((h: Holding) => {
      const value = holdingValueToTWD(h, portfolioAccounts, rates);
      const assetClass = getAssetClassForTicker(h.ticker, tickerClassOverrides);
      if (assetClass === AssetClass.BOND) bondValue += value;
      else if (assetClass === AssetClass.EQUITY) stockValue += value;
    });

    const cashValue = Math.max(0, summary.cashBalanceTWD || 0);
    const investedTotal = stockValue + bondValue;
    const totalWithCash = investedTotal + cashValue;
    if (totalWithCash <= 0) {
      return {
        outer: [] as Array<{ name: string; value: number; ratio: number; color: string }>,
        inner: [] as Array<{ name: string; value: number; ratio: number; color: string }>,
      };
    }

    const cashLabel = translate('rebalance.cash', language);
    const outer = tickerAllocationOuter
      .map(item => ({
        ...item,
        ratio: (item.value / totalWithCash) * 100,
      }))
      .filter(item => item.value > 0);

    if (cashValue > 0) {
      outer.push({
        name: cashLabel,
        value: cashValue,
        ratio: (cashValue / totalWithCash) * 100,
        color: '#94a3b8',
      });
    }

    const inner: Array<{ name: string; value: number; ratio: number; color: string }> = [];
    if (stockValue > 0) {
      inner.push({
        name: translations.dashboard.equityLabelShort,
        value: stockValue,
        ratio: (stockValue / totalWithCash) * 100,
        color: ALLOCATION_INNER_EQUITY_COLOR,
      });
    }
    if (bondValue > 0) {
      inner.push({
        name: translations.dashboard.bondLabelShort,
        value: bondValue,
        ratio: (bondValue / totalWithCash) * 100,
        color: ALLOCATION_INNER_BOND_COLOR,
      });
    }
    if (cashValue > 0) {
      inner.push({
        name: cashLabel,
        value: cashValue,
        ratio: (cashValue / totalWithCash) * 100,
        color: '#94a3b8',
      });
    }

    return { outer, inner };
  }, [holdings, portfolioAccounts, rates, tickerClassOverrides, summary.cashBalanceTWD, tickerAllocationOuter, translations, language]);

  const costDetails = useMemo(() => {
    return cashFlows
      .filter(
        (cf: CashFlow) =>
          cf.type === CashFlowType.DEPOSIT ||
          cf.type === CashFlowType.WITHDRAW ||
          isDebtFundedInflow(cf, accounts) ||
          isDebtRepaymentOutflow(cf, accounts)
      )
      .sort((a: CashFlow, b: CashFlow) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(cf => {
          const account = accounts.find(a => a.id === cf.accountId);
          if (!account) return null;
          const isUSD = account.currency === Currency.USD;
          
          let rate = 1;
          let rateSource = translations.dashboard.taiwanDollar;
          let amountTWD = 0;

          if (cf.amountTWD && cf.amountTWD > 0) {
             amountTWD = cf.amountTWD;
             if (account.currency === Currency.TWD) {
               // 台幣帳戶：amountTWD 常為「金額+手續費」，匯率固定顯示 1.00／台幣
               rate = 1;
               rateSource = translations.dashboard.taiwanDollar;
             } else {
               rate = cf.amount > 0 ? amountTWD / cf.amount : 0;
               rateSource = translations.dashboard.fixedTWD;
             }
          } else {
             if (isUSD) {
               if (cf.exchangeRate && cf.exchangeRate > 0) {
                   rate = cf.exchangeRate;
                   rateSource = `${translations.dashboard.historicalRate} (${cf.exchangeRate})`;
               } else {
                   rate = summary.exchangeRateUsdToTwd;
                   rateSource = `${translations.dashboard.currentRate} (${rate})`;
               }
             }
             amountTWD = cf.amount * rate;
          }
          
          return {
              ...cf,
              accountName: account.name,
              currency: account.currency,
              rate,
              rateSource,
              amountTWD
          };
      }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [cashFlows, accounts, summary.exchangeRateUsdToTwd, translations]);

  const verifyTotal = costDetails.reduce((acc, item) => {
      return acc + netInvestedDeltaForCashFlow(item, accounts, rates);
  }, 0);

  const toggleTrendSeries = (key: keyof typeof trendSeriesVisible) => {
    setTrendSeriesVisible(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const attributionSeries = useMemo(() => {
    return buildAttributionSeries(chartData, cashFlows, transactions, portfolioAccounts, rates);
  }, [chartData, cashFlows, transactions, portfolioAccounts, rates]);

  const trendChartData = useMemo(() => {
    const estMap = new Map(chartData.map(item => [item.year, item.estTotalAssets]));
    return attributionSeries.map(item => ({
      year: item.period,
      cost: toBase(item.cumulativeCost),
      profit: toBase(item.cumulativeProfit),
      totalAssets: toBase(item.endAssets),
      estTotalAssets: toBase(estMap.get(item.period) || 0),
      isRealData: item.isRealData,
      isConsistent: item.isConsistent,
      reconciledDiff: toBase(item.reconciledDiff),
    }));
  }, [attributionSeries, chartData, toBase]);

  const roiByCalendarYear = useMemo(() => {
    const m = new Map<number, number>();
    annualPerformance.forEach(ap => {
      const match = String(ap.year).match(/^(\d{4})/);
      if (match) m.set(Number(match[1]), ap.roi);
    });
    return m;
  }, [annualPerformance]);

  const quarterlyTrendData = useMemo(() => {
    const formatQuarterLabel = (period: string): string => {
      const quarterMatch = period.match(/^(\d{4})-Q([1-4])$/);
      if (quarterMatch) return `${quarterMatch[1]}Q${quarterMatch[2]}`;
      const nowMatch = period.match(/^(\d{4})-NOW$/);
      if (nowMatch) return `${nowMatch[1]}${translations.dashboard.chartLabels.toDate}`;
      return period;
    };

    return buildQuarterlyTrendData(chartData, attributionSeries, cashFlows, transactions, portfolioAccounts, rates, historicalData).map(item => {
      const yearMatch = item.period.match(/^(\d{4})(?:-Q[1-4]|-NOW)$/);
      const calYear = yearMatch ? Number(yearMatch[1]) : NaN;
      const yearRoi = Number.isFinite(calYear) ? roiByCalendarYear.get(calYear) : undefined;
      // 每年只畫一根空心長條：落在 Q4；當年尚無 Q4 時改落在「至今」
      const calendarYearNow = new Date().getFullYear();
      const isQ4Point = /^\d{4}-Q4$/.test(item.period);
      const isCurrentYearNowPoint =
        /^\d{4}-NOW$/.test(item.period) && Number.isFinite(calYear) && calYear === calendarYearNow;
      const hasYearRoi = yearRoi !== undefined && Number.isFinite(yearRoi);
      const yearlyPeriodRoi =
        hasYearRoi && (isQ4Point || isCurrentYearNowPoint) ? yearRoi : undefined;
      return {
        year: formatQuarterLabel(item.period),
        cost: toBase(item.cost),
        profit: toBase(item.profit),
        totalAssets: toBase(item.totalAssets),
        estTotalAssets: toBase(item.estTotalAssets),
        isRealData: item.isRealData,
        yearlyPeriodRoi,
      };
    });
  }, [chartData, attributionSeries, cashFlows, transactions, portfolioAccounts, rates, historicalData, toBase, translations, roiByCalendarYear]);

  const hasInterpolatedQuarterData = useMemo(
    () => quarterlyTrendData.some(d => !d.isRealData),
    [quarterlyTrendData]
  );

  const hasAttributionMismatch = attributionSeries.some(item => !item.isConsistent);

  const waterfallYearRows = useMemo(
    () => buildWaterfallYearRows(attributionSeries, cashFlows, portfolioAccounts, rates),
    [attributionSeries, cashFlows, portfolioAccounts, rates]
  );

  const cumulativeChartHeightClass = isTrendChartCompact
    ? 'h-[400px] md:h-[540px]'
    : 'h-[380px] md:h-[540px]';
  const cumulativeXAxisFontSize = isTrendChartCompact ? 9 : 10;
  const cumulativeXAxisHeight = isTrendChartCompact ? 68 : 60;
  const cumulativeLeftAxisWidth = isTrendChartCompact ? 30 : 39;
  const cumulativeRightAxisWidth = isTrendChartCompact ? 30 : 40;
  const cumulativeBarSize = isTrendChartCompact ? 22 : 30;
  const cumulativeRoiBarSize = isTrendChartCompact ? 14 : 18;
  const cumulativeDotSize = isTrendChartCompact ? 3 : 4;
  const showCumulativeBrush = isTrendChartCompact
    ? quarterlyTrendData.length > 16
    : quarterlyTrendData.length > 8;
  /** 點數過多時預設只顯示近期視窗，避免手機上全部擠成細條；Brush 仍可拖回更早歷史 */
  const cumulativeBrushVisibleCount = isTrendChartCompact ? 28 : 32;
  const cumulativeBrushDefaultIndices = useMemo(() => {
    const len = quarterlyTrendData.length;
    if (len === 0) return { startIndex: 0, endIndex: 0 };
    const endIndex = len - 1;
    const startIndex = Math.max(0, len - cumulativeBrushVisibleCount);
    return { startIndex, endIndex };
  }, [quarterlyTrendData.length, cumulativeBrushVisibleCount]);
  const [cumulativeBrushIndices, setCumulativeBrushIndices] = useState(cumulativeBrushDefaultIndices);
  // 僅在資料長度／可視季數門檻變化時重設預設視窗，避免拖曳中被重算的物件參考打斷
  useEffect(() => {
    setCumulativeBrushIndices(cumulativeBrushDefaultIndices);
  }, [quarterlyTrendData.length, cumulativeBrushVisibleCount, cumulativeBrushDefaultIndices]);
  const profitBarShape = useCallback((props: any) => {
    const barFill = props?.payload?.profit >= 0 ? '#10b981' : '#ef4444';
    return <Rectangle {...props} fill={barFill} />;
  }, []);
  /** 年度報酬：空心＋虛線描邊長條（非實心填色） */
  const yearlyRoiBarShape = useCallback((props: any) => {
    const v = props?.payload?.yearlyPeriodRoi;
    if (v === undefined || v === null || !Number.isFinite(Number(v))) {
      return <Rectangle {...props} fill="none" stroke="none" />;
    }
    const stroke = Number(v) < 0 ? '#ef4444' : '#db2777';
    return (
      <Rectangle
        {...props}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray="5 3"
      />
    );
  }, []);

  return (
    <div className="space-y-6">
      {/* ① Summary Cards — enhanced with trend arrows + sparkline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">

        {/* Net Cost Card */}
        <div className="bg-white p-4 sm:p-5 rounded-xl shadow border-l-4 border-purple-500 relative group hover:shadow-md transition-shadow">
          <h4 className="text-slate-500 text-sm font-semibold uppercase tracking-wider flex justify-between items-center">
            {translations.dashboard.netCost}
            <button
              onClick={() => setShowCostDetailModal(true)}
              className="relative z-10 text-indigo-600 hover:text-indigo-800 text-sm bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100"
              title={translations.dashboard.viewCalculationDetails}
            >🔍 {translations.dashboard.detail}</button>
          </h4>
          <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-2 tabular-nums">
            {formatCurrency(toBase(summary.netInvestedTWD), baseCurrency)}
          </p>
          {summary.hasDebtFunding && (summary.leverageNetTWD ?? 0) > 0 && (
            <p className="text-xs sm:text-sm text-amber-700 mt-1 leading-snug">
              {translate('dashboard.leverageNetInvestedNote', language, {
                amount: formatCurrency(toBase(summary.leverageNetTWD ?? 0), baseCurrency),
              })}
            </p>
          )}
          {/* Sparkline: historical cost trend */}
          {isMounted && chartData.length > 1 && (
            <div className="mt-2 h-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData.slice(-8).map(d => ({ v: toBase(d.cost) }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sg-purple" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#7c3aed" strokeWidth={1.5} fill="url(#sg-purple)" dot={false} activeDot={false} isAnimationActive={true}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Total Assets / Net Worth Card */}
        <div className="bg-white p-4 sm:p-5 rounded-xl shadow border-l-4 border-green-500 relative overflow-hidden group hover:shadow-md transition-shadow">
          <h4 className="text-slate-500 text-sm font-semibold uppercase tracking-wider">
            {hasDebtOnBooks ? translations.dashboard.netWorth : translations.dashboard.totalAssets}
          </h4>
          <div className="flex items-center gap-2 mt-2">
            <p className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums">
              {formatCurrency(toBase(assetsCardHeadlineTwd), baseCurrency)}
            </p>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">{translations.dashboard.includeCash}: {formatCurrency(toBase(summary.cashBalanceTWD), baseCurrency)}</p>
          {hasDebtOnBooks && (
            <p className="text-sm text-red-600 mt-0.5">
              {translations.dashboard.totalDebt}: {formatCurrency(toBase(summary.totalDebtBalanceTWD ?? 0), baseCurrency)}
            </p>
          )}
          {isMounted && chartData.length > 1 && (
            <div className="mt-2 h-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData.slice(-8).map(d => ({ v: toBase(d.totalAssets || 0) }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sg-green" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#22c55e" strokeWidth={1.5} fill="url(#sg-green)" dot={false} activeDot={false} isAnimationActive={true}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Total P/L Card */}
        <div className={`bg-white p-4 sm:p-5 rounded-xl shadow border-l-4 ${summary.totalPLTWD >= 0 ? 'border-emerald-500' : 'border-rose-500'} group hover:shadow-md transition-shadow`}>
          <h4 className="text-slate-500 text-sm font-semibold uppercase tracking-wider">{translations.dashboard.totalPL}</h4>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-lg leading-none ${summary.totalPLTWD >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {summary.totalPLTWD >= 0 ? '↑' : '↓'}
            </span>
            <p className={`text-xl sm:text-2xl font-bold tabular-nums ${summary.totalPLTWD >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {summary.totalPLTWD >= 0 ? '+' : ''}{formatCurrency(toBase(summary.totalPLTWD), baseCurrency)}
            </p>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded ${summary.totalPLTWD >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {summary.totalPLPercent.toFixed(2)}%
            </span>
          </div>
          {isMounted && chartData.length > 1 && (
            <div className="mt-2 h-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData.slice(-8).map(d => ({ v: toBase(d.profit || 0) }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sg-pl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={summary.totalPLTWD >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={summary.totalPLTWD >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke={summary.totalPLTWD >= 0 ? '#10b981' : '#ef4444'} strokeWidth={1.5} fill="url(#sg-pl)" dot={false} activeDot={false} isAnimationActive />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Annualized Return Card */}
        <div className="bg-white p-4 sm:p-5 rounded-xl shadow border-l-4 border-blue-500 group hover:shadow-md transition-shadow">
          <h4 className="text-slate-500 text-sm font-semibold uppercase tracking-wider">{translations.dashboard.annualizedReturn}</h4>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-lg leading-none ${summary.annualizedReturn >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>
              {summary.annualizedReturn >= 0 ? '↑' : '↓'}
            </span>
            <p className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums">
              {summary.annualizedReturn.toFixed(1)}%
            </p>
          </div>
          {summary.hasDebtFunding && (
            <p className="text-xs sm:text-sm text-amber-700 mt-1">{translations.dashboard.leverageXirrWarning}</p>
          )}
          {/* ① Progress bar showing return vs 8% target */}
          <div className="mt-2">
            <div className="flex justify-between text-sm text-slate-400 mb-0.5">
              <span>0%</span>
              <span className="text-slate-500">{translations.dashboard.annualizedReturnTarget8}</span>
              <span>20%+</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 relative">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-1000"
                style={{ width: `${Math.min(Math.max((summary.annualizedReturn / 20) * 100, 0), 100)}%` }}
              />
              <div
                className="absolute top-0 h-full w-px bg-slate-400"
                style={{ left: '40%' }}
                title={translations.dashboard.annualizedReturnTarget8}
              />
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-1">{translations.dashboard.estimatedGrowth8}: {formatCurrency(toBase(summary.netInvestedTWD * 1.08), baseCurrency)}</p>
        </div>

      </div>

      {liabilityInsights.length > 0 && (
        <div className="mb-4">
          <h3 className="text-lg sm:text-xl font-bold text-slate-700 dark:text-slate-200 mb-3">
            {translations.dashboard.debtAccountsTitle}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liabilityInsights.map(insight => {
              const util = insight.utilizationPercent;
              const barPct = util != null ? Math.min(100, Math.max(0, util)) : 0;
              const barColor =
                util == null
                  ? 'bg-slate-400'
                  : util >= 90
                    ? 'bg-red-500'
                    : util >= 70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500';
              return (
                <div
                  key={insight.accountId}
                  className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl shadow border-l-4 border-red-500"
                >
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{insight.name}</h4>
                  <p className="text-xl font-mono font-bold text-red-600 mt-2 tabular-nums">
                    ({formatCurrency(insight.balance, insight.currency)})
                  </p>
                  {insight.creditLimit != null && insight.creditLimit > 0 && util != null && (
                    <div className="mt-3">
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {translate('dashboard.creditUsedOfLimit', language, {
                          used: formatCurrency(insight.balance, insight.currency),
                          limit: formatCurrency(insight.creditLimit, insight.currency),
                          percent: util.toFixed(1),
                        })}
                      </p>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 mt-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {insight.estimatedMonthlyInterest != null && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-600">
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        {translations.dashboard.estimatedMonthlyInterest}
                      </p>
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5 tabular-nums">
                        {formatCurrency(insight.estimatedMonthlyInterest, insight.currency)}
                        {insight.annualInterestRate != null && (
                          <span className="text-sm font-normal text-slate-500 ml-1">
                            @ {insight.annualInterestRate}%
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {translations.dashboard.estimatedMonthlyInterestNote}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detailed Statistics Toggle */}
      <div className="app-section-card">
        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex justify-between items-center p-4 transition font-medium text-sm" style={{ backgroundColor: isDarkMode ? "#1e293b" : "#f8fafc", color: isDarkMode ? "#cbd5e1" : "#334155" }} onMouseEnter={e=>(e.currentTarget.style.backgroundColor=isDarkMode?"#334155":"#f1f5f9")} onMouseLeave={e=>(e.currentTarget.style.backgroundColor=isDarkMode?"#1e293b":"#f8fafc")}
        >
          <span>{translations.dashboard.detailedStatistics}</span>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className={`h-5 w-5 transition-transform ${showDetails ? 'rotate-180' : ''}`} 
            viewBox="0 0 20 20" fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        
        {showDetails && (
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 animate-fade-in border-t border-slate-100">
            <div>
              <p className="text-sm text-slate-500 mb-1">{translations.dashboard.totalCost}</p>
              <p className="text-xl font-bold text-slate-800">{formatCurrency(toBase(summary.netInvestedTWD), baseCurrency)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">{translations.dashboard.totalPLAmount}</p>
              <p className={`text-xl font-bold ${summary.totalPLTWD >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(toBase(summary.totalPLTWD), baseCurrency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">{translations.dashboard.accumulatedCashDividends}</p>
              <p className="text-xl font-bold text-yellow-600">{formatCurrency(toBase(summary.accumulatedCashDividendsTWD), baseCurrency)}</p>
            </div>
             <div>
              <p className="text-sm text-slate-500 mb-1">{translations.dashboard.accumulatedStockDividends}</p>
              <p className="text-xl font-bold text-yellow-600">{formatCurrency(toBase(summary.accumulatedStockDividendsTWD), baseCurrency)}</p>
            </div>
             <div>
              <p className="text-sm text-slate-500 mb-1">{translations.dashboard.annualizedReturnRate}</p>
              <p className={`text-xl font-bold ${summary.annualizedReturn >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {summary.annualizedReturn.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">{translations.dashboard.avgExchangeRate}</p>
              <p className="text-xl font-bold text-slate-700">{summary.avgExchangeRate > 0 ? summary.avgExchangeRate.toFixed(2) : '-'}</p>
            </div>
             <div>
              <p className="text-sm text-slate-500 mb-1">{translations.dashboard.currentExchangeRate} ({displayRate.label})</p>
              <p className="text-xl font-bold text-slate-700">{displayRate.value.toFixed(2)}</p>
            </div>
             <div>
              <p className="text-sm text-slate-500 mb-1">{translations.dashboard.totalReturnRate}</p>
              <p className={`text-xl font-bold ${summary.totalPLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.totalPLPercent.toFixed(2)}%
              </p>
            </div>
            {baseCurrency === 'TWD' && (
            <div className="col-span-2 md:col-span-4 mt-3 pt-5 border-t-2 border-slate-400 dark:border-slate-400">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                  海外所得稅務進度（{overseasTaxProgress.reportYear}）
                </p>
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-medium w-fit">
                  {overseasTaxProgress.statusText}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">{overseasTaxProgress.hintText}</p>
              <div className="mt-3">
                <div className="relative w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full ${overseasTaxProgress.barClass} transition-all duration-500`}
                    style={{ width: `${overseasTaxProgress.progressPct}%` }}
                  />
                  <div className="absolute inset-y-0 border-l border-slate-400/70" style={{ left: `${(1_000_000 / 6_700_000) * 100}%` }} />
                  <div className="absolute inset-y-0 border-l border-slate-500" style={{ left: '100%' }} />
                </div>
                <div className="relative mt-1 h-4 text-sm text-slate-500">
                  <span className="absolute left-0 top-0">0</span>
                  <span
                    className="absolute top-0 -translate-x-1/2"
                    style={{ left: `${(1_000_000 / 6_700_000) * 100}%` }}
                  >
                    100 萬（申報門檻）
                  </span>
                  <span className="absolute right-0 top-0">670 萬（免稅額）</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-slate-500 text-sm">海外已實現損益（非台灣市場）</p>
                  <p className="font-bold text-slate-800 tabular-nums">
                    {formatCurrency(toBase(overseasTaxProgress.overseasRealizedPLTwd), baseCurrency)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-slate-500 text-sm">海外累積股利（非台灣市場）</p>
                  <p className="font-bold text-slate-800 tabular-nums">
                    {formatCurrency(toBase(overseasTaxProgress.overseasDividendTwd), baseCurrency)}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-slate-600 text-sm">海外所得合計（損益 + 股利）</p>
                  <p className="font-bold text-blue-700 tabular-nums">
                    {formatCurrency(toBase(overseasTaxProgress.overseasIncomeTwd), baseCurrency)}
                  </p>
                </div>
                <div className="rounded-lg bg-rose-50 p-3">
                  <p className="text-slate-600 text-sm">最低稅負試算（參考）</p>
                  <p className="font-bold text-rose-700 tabular-nums">
                    {formatCurrency(toBase(overseasTaxProgress.estimatedAmtTaxTwd), baseCurrency)}
                  </p>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-3">
                公式：{`(基本所得額 - 670 萬) × 20%`}，目前以「海外所得」作為基本所得額試算（未含保險給付等其他項目）。
              </p>
            </div>
            )}
          </div>
        )}
      </div>

      {/* 主圖：累積損益（按季）／按年資金流瀑布；窄螢幕 overflow-visible 讓累積圖可滿版寬 */}
      {!isGuest && (
        <div className="bg-white max-sm:overflow-visible sm:overflow-hidden max-sm:py-3 sm:p-6 rounded-xl shadow">
          <div className="max-sm:px-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-3">
            <div className="min-w-0 flex-1">
              {mainChartTab === 'cumulative' ? (
                <h3 className="font-bold text-blue-600 text-lg sm:text-xl">{translations.dashboard.assetVsCostTrend}</h3>
              ) : (
                <>
                  <h3 className="font-bold text-slate-800 text-lg sm:text-xl">{translations.waterfall.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{translations.waterfall.subtitle}</p>
                </>
              )}
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 shrink-0">
              <div className={`${SEGMENT_PILL_CLASS} self-end sm:self-center`}>
                <button
                  type="button"
                  onClick={() => setMainChartTab('cumulative')}
                  className={`${SEGMENT_BTN_CLASS} ${
                    mainChartTab === 'cumulative'
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {translations.dashboard.chartLabels.accumulatedPL}
                </button>
                <button
                  type="button"
                  onClick={() => setMainChartTab('year')}
                  className={`${SEGMENT_BTN_CLASS} ${
                    mainChartTab === 'year'
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {translations.waterfall.byYear}
                </button>
              </div>
              <button
                type="button"
                onClick={onUpdateHistorical}
                className="text-sm px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded border border-indigo-200 flex items-center justify-center gap-1 transition self-end sm:self-center"
                title={translations.dashboard.aiCorrectHistoryTitle}
              >
                <span>🤖</span> {translations.dashboard.aiCorrectHistory}
              </button>
            </div>
          </div>

          <div className="w-full">
            {mainChartTab === 'cumulative' ? (
              <>
                <div className="max-sm:px-3 mb-3 flex flex-wrap gap-3 text-sm">
                  {[
                    { key: 'cost', label: translations.dashboard.chartLabels.investmentCost, color: '#8b5cf6' },
                    { key: 'profit', label: translations.dashboard.chartLabels.barName, color: '#10b981' },
                    { key: 'totalAssets', label: translations.dashboard.chartLabels.totalAssets, color: '#3b82f6' },
                    { key: 'estTotalAssets', label: translations.dashboard.chartLabels.estimatedAssets, color: '#f59e0b' },
                    { key: 'yearlyPeriodRoi', label: translations.dashboard.chartLabels.yearlyPeriodRoi, color: '#db2777' },
                  ].map(item => (
                    <label key={item.key} className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={trendSeriesVisible[item.key as keyof typeof trendSeriesVisible]}
                        onChange={() => toggleTrendSeries(item.key as keyof typeof trendSeriesVisible)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-600">{item.label}</span>
                    </label>
                  ))}
                </div>
                <div
                  className={
                    isTrendChartCompact
                      ? `w-screen max-w-[100vw] min-w-0 ${cumulativeChartHeightClass} ml-[calc(50%-50vw)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]`
                      : `w-full min-w-0 ${cumulativeChartHeightClass} -ml-2 sm:ml-0 -mr-10 sm:-mr-5 md:-mr-3 md:ml-0 lg:mx-0`
                  }
                >
                  {isMounted && quarterlyTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%" debounce={50}>
                      <ComposedChart
                        data={quarterlyTrendData}
                        margin={cumulativeChartMargin}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={isDarkMode ? '#334155' : '#f1f5f9'}
                        />
                        <XAxis
                          dataKey="year"
                          stroke={isDarkMode ? '#cbd5e1' : '#64748b'}
                          tick={{ fill: isDarkMode ? '#cbd5e1' : '#64748b', fontSize: cumulativeXAxisFontSize }}
                          axisLine={{ stroke: isDarkMode ? '#64748b' : '#94a3b8' }}
                          tickLine={{ stroke: isDarkMode ? '#64748b' : '#94a3b8' }}
                          fontSize={cumulativeXAxisFontSize}
                          className="text-sm"
                          padding={isTrendChartCompact ? { left: 0, right: 0 } : { left: 10, right: 10 }}
                          angle={-45}
                          textAnchor="end"
                          height={cumulativeXAxisHeight}
                          interval={isTrendChartCompact ? 1 : 0}
                        />
                        <YAxis
                          yAxisId="left"
                          orientation="left"
                          stroke={isDarkMode ? '#cbd5e1' : '#64748b'}
                          tick={{ fill: isDarkMode ? '#cbd5e1' : '#64748b', fontSize: 9 }}
                          axisLine={{ stroke: isDarkMode ? '#64748b' : '#94a3b8' }}
                          tickLine={{ stroke: isDarkMode ? '#64748b' : '#94a3b8' }}
                          className="text-sm"
                          width={cumulativeLeftAxisWidth}
                          tickFormatter={(val: number) => {
                            if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
                            if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
                            return val.toFixed(0);
                          }}
                        />
                        {/*
                          右軸始終掛載（刻度／軸線僅在勾選報酬率時顯示），避免 Recharts 因掛卸軸而重算繪圖區造成「縮圖」。
                        */}
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke={
                            trendSeriesVisible.yearlyPeriodRoi
                              ? isDarkMode
                                ? '#f472b6'
                                : '#db2777'
                              : 'transparent'
                          }
                          tick={
                            trendSeriesVisible.yearlyPeriodRoi
                              ? { fill: isDarkMode ? '#f472b6' : '#db2777', fontSize: 9 }
                              : false
                          }
                          axisLine={
                            trendSeriesVisible.yearlyPeriodRoi
                              ? { stroke: isDarkMode ? '#f472b6' : '#db2777' }
                              : false
                          }
                          tickLine={
                            trendSeriesVisible.yearlyPeriodRoi
                              ? { stroke: isDarkMode ? '#f472b6' : '#db2777' }
                              : false
                          }
                          width={cumulativeRightAxisWidth}
                          domain={['auto', 'auto']}
                          tickFormatter={(val: number) => `${Math.round(Number(val))}%`}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                          labelStyle={{ color: '#0f172a', fontWeight: 700 }}
                          separator=""
                          formatter={(value: number, name: string, props: any) => {
                            if (name === translations.dashboard.chartLabels.yearlyPeriodRoi && typeof value === 'number' && Number.isFinite(value)) {
                              const roiLabel = translations.dashboard.chartLabels.yearlyPeriodRoi;
                              return [
                                <span style={{ color: '#db2777', fontWeight: 700 }} key="yroi">
                                  {roiLabel}：{value.toFixed(2)}%
                                </span>,
                                '',
                              ];
                            }
                            const isReal = props.payload.isRealData;
                            let suffix = '';
                            if (name === translations.dashboard.chartLabels.totalAssets && isReal)
                              suffix = translations.dashboard.chartLabels.realData;
                            else if (name === translations.dashboard.chartLabels.totalAssets)
                              suffix = translations.dashboard.chartLabels.estimated;

                            if (name.includes(translations.dashboard.chartLabels.accumulatedPL)) {
                              const plColor = value >= 0 ? '#10b981' : '#ef4444';
                              return [
                                <span style={{ color: plColor, fontWeight: 700 }}>
                                  {translations.dashboard.chartLabels.accumulatedPL}：{formatCurrency(value, baseCurrency)}
                                </span>
                                ,
                                ''
                              ];
                            }

                            return [formatCurrency(value, baseCurrency), `${name + suffix}：`];
                          }}
                        />
                        <Legend
                          iconSize={0}
                          wrapperStyle={{ color: isDarkMode ? '#cbd5e1' : '#334155' }}
                          formatter={(value: string, entry: any) => {
                            if (value.includes(translations.dashboard.chartLabels.accumulatedPL)) {
                              return (
                                <span className="inline-flex items-center gap-3">
                                  <span className="flex items-center gap-1">
                                    <span
                                      style={{
                                        display: 'inline-block',
                                        width: '10px',
                                        height: '10px',
                                        backgroundColor: '#10b981',
                                        borderRadius: '2px',
                                        marginRight: '4px',
                                      }}
                                    />
                                    <span style={{ color: '#10b981', fontWeight: 600 }}>
                                      {translations.dashboard.chartLabels.profit}
                                    </span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span
                                      style={{
                                        display: 'inline-block',
                                        width: '10px',
                                        height: '10px',
                                        backgroundColor: '#ef4444',
                                        borderRadius: '2px',
                                        marginRight: '4px',
                                      }}
                                    />
                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                      {translations.dashboard.chartLabels.loss}
                                    </span>
                                  </span>
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex items-center gap-1">
                                <span
                                  style={{
                                    display: 'inline-block',
                                    width: '10px',
                                    height: '10px',
                                    backgroundColor: entry.color,
                                    borderRadius: '2px',
                                    marginRight: '4px',
                                  }}
                                />
                                <span className="text-slate-700 dark:text-slate-200 font-medium">{value}</span>
                              </span>
                            );
                          }}
                        />
                        {trendSeriesVisible.cost && (
                          <Bar
                            yAxisId="left"
                            dataKey="cost"
                            name={translations.dashboard.chartLabels.investmentCost}
                            stackId="a"
                            fill="#8b5cf6"
                            barSize={cumulativeBarSize}
                          />
                        )}
                        {trendSeriesVisible.profit && (
                          <Bar
                            yAxisId="left"
                            dataKey="profit"
                            name={translations.dashboard.chartLabels.barName}
                            stackId="a"
                            barSize={cumulativeBarSize}
                            shape={profitBarShape}
                          />
                        )}
                        {trendSeriesVisible.totalAssets && (
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="totalAssets"
                            name={translations.dashboard.chartLabels.totalAssets}
                            stroke="#3b82f6"
                            strokeWidth={3}
                            dot={{ r: cumulativeDotSize, fill: '#3b82f6', strokeWidth: 0 }}
                          />
                        )}
                        {trendSeriesVisible.estTotalAssets && (
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="estTotalAssets"
                            name={translations.dashboard.chartLabels.estimatedAssets}
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={false}
                          />
                        )}
                        {trendSeriesVisible.yearlyPeriodRoi && (
                          <Bar
                            yAxisId="right"
                            dataKey="yearlyPeriodRoi"
                            name={translations.dashboard.chartLabels.yearlyPeriodRoi}
                            stackId="roi"
                            barSize={cumulativeRoiBarSize}
                            shape={yearlyRoiBarShape}
                            legendType="none"
                            isAnimationActive
                          />
                        )}
                        {showCumulativeBrush && (
                          <Brush
                            dataKey="year"
                            height={28}
                            stroke={isDarkMode ? '#64748b' : '#94a3b8'}
                            fill={isDarkMode ? '#1e293b' : '#f1f5f9'}
                            travellerWidth={12}
                            startIndex={cumulativeBrushIndices.startIndex}
                            endIndex={cumulativeBrushIndices.endIndex}
                            onChange={(next) => {
                              if (
                                next &&
                                typeof next.startIndex === 'number' &&
                                typeof next.endIndex === 'number'
                              ) {
                                setCumulativeBrushIndices({
                                  startIndex: next.startIndex,
                                  endIndex: next.endIndex,
                                });
                              }
                            }}
                            style={{ fontSize: '10px' }}
                            tickFormatter={v => String(v)}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400">
                      {!isMounted
                        ? translations.dashboard.chartLoading
                        : quarterlyTrendData.length === 0
                          ? translations.dashboard.noChartData
                          : translations.dashboard.chartLoading}
                    </div>
                  )}
                </div>
                {hasAttributionMismatch && (
                  <div className="max-sm:mx-3 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs sm:text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                    資料對帳提醒：部分年度「資產變化」與「淨流入 + 收益 + 市場損益」存在微小差異，請檢查匯率或歷史估值來源。
                  </div>
                )}
                {hasInterpolatedQuarterData && (
                  <div className="max-sm:mx-3 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs sm:text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{translations.dashboard.chartLegendLinearInterpolation}</span>
                    {onUpdateHistorical && (
                      <button
                        type="button"
                        onClick={onUpdateHistorical}
                        className="font-medium text-indigo-700 hover:text-indigo-900 underline dark:text-indigo-300 dark:hover:text-indigo-200"
                      >
                        {translations.dashboard.aiCorrectHistory}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div
                className={
                  isTrendChartCompact
                    ? 'w-screen max-w-[100vw] min-w-0 ml-[calc(50%-50vw)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]'
                    : 'w-full min-w-0 -ml-2 sm:ml-0 -mr-10 sm:-mr-5 md:-mr-3 md:ml-0 lg:mx-0'
                }
              >
                <div className={cumulativeChartHeightClass}>
                  <CashFlowWaterfall
                    hideHeader
                    fillParent
                    isCompact={isTrendChartCompact}
                    rows={waterfallYearRows}
                  />
                </div>
                <WaterfallLegendHints />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 個股／ETF 外圈 + 股債內圈 */}
      {!isGuest && (
        <div className="app-section-card p-6">
          <h3 className="font-bold text-slate-800 text-lg sm:text-xl mb-1">{translations.dashboard.allocation}</h3>
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="mr-4">
              {translations.dashboard.totalAssets}: <span className="font-semibold tabular-nums">{formatCurrency(toBase(totalAssetsWithCashTwd), baseCurrency)}</span>
            </span>
            <span className="mr-4">
              {translations.dashboard.includeCash}: <span className="font-semibold tabular-nums">{formatCurrency(toBase(summary.cashBalanceTWD), baseCurrency)}</span>
            </span>
            <span>
              {translations.marketChart.ratio}: <span className="font-semibold tabular-nums">{cashRatioOfTotalAssets.toFixed(2)}%</span>
            </span>
          </div>
          <div
            className="allocation-donut-hover-zone"
            onPointerEnter={cancelAllocationHoverClear}
            onPointerLeave={scheduleAllocationHoverClear}
          >
          {(activeOuterIndex !== undefined && allocationIncludingCash.outer[activeOuterIndex]) || (activeInnerIndex !== undefined && allocationIncludingCash.inner[activeInnerIndex]) ? (
            <div className="mb-3 px-3 py-2 rounded-lg flex items-center gap-3 bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
              {activeOuterIndex !== undefined && allocationIncludingCash.outer[activeOuterIndex] ? (
                <>
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: allocationIncludingCash.outer[activeOuterIndex].color }} />
                  <span className="font-semibold font-mono text-slate-900 dark:text-slate-100">
                    {allocationIncludingCash.outer[activeOuterIndex].name}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">{translations.dashboard.marketDistribution}</span>
                  <span className="text-sm ml-auto text-slate-900 dark:text-slate-200 tabular-nums">
                    {allocationIncludingCash.outer[activeOuterIndex].ratio.toFixed(1)}%
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                    {formatCurrency(toBase(allocationIncludingCash.outer[activeOuterIndex].value), baseCurrency)}
                  </span>
                </>
              ) : activeInnerIndex !== undefined && allocationIncludingCash.inner[activeInnerIndex] ? (
                <>
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: allocationIncludingCash.inner[activeInnerIndex].color }} />
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {allocationIncludingCash.inner[activeInnerIndex].name}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">
                    {translations.dashboard.stockBondRatioBadge} ({translations.dashboard.includeCash})
                  </span>
                  <span className="text-sm ml-auto text-slate-900 dark:text-slate-200 tabular-nums">
                    {allocationIncludingCash.inner[activeInnerIndex].ratio.toFixed(1)}%
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                    {formatCurrency(toBase(allocationIncludingCash.inner[activeInnerIndex].value), baseCurrency)}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="w-full flex flex-col lg:flex-row items-center gap-6">
            <div className="w-full max-w-sm h-72">
              {isMounted && (allocationIncludingCash.inner.length > 0 || allocationIncludingCash.outer.length > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocationIncludingCash.outer}
                      cx="50%"
                      cy="50%"
                      innerRadius={72}
                      outerRadius={102}
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={1.5}
                      dataKey="value"
                      nameKey="name"
                      onMouseEnter={(_: any, index: number) => {
                        cancelAllocationHoverClear();
                        setActiveOuterIndex(index);
                        setActiveInnerIndex(undefined);
                      }}
                    >
                      {allocationIncludingCash.outer.map((entry, index) => (
                        <Cell
                          key={`outer-${entry.name}-${index}`}
                          fill={entry.color}
                          opacity={activeOuterIndex === undefined || activeOuterIndex === index ? 1 : 0.4}
                          style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                        />
                      ))}
                    </Pie>
                    <Pie
                      data={allocationIncludingCash.inner}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={72}
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={1.5}
                      dataKey="value"
                      nameKey="name"
                      onMouseEnter={(_: any, index: number) => {
                        cancelAllocationHoverClear();
                        setActiveInnerIndex(index);
                        setActiveOuterIndex(undefined);
                      }}
                    >
                      {allocationIncludingCash.inner.map((entry, index) => (
                        <Cell
                          key={`inner-${entry.name}-${index}`}
                          fill={entry.color}
                          opacity={activeInnerIndex === undefined || activeInnerIndex === index ? 1 : 0.45}
                          style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string, props: any) => {
                        const payload = props?.payload;
                        const ratio = typeof payload?.ratio === 'number' ? ` (${payload.ratio.toFixed(1)}%)` : '';
                        const labelText =
                          typeof payload?.name === 'string' && payload.name.length > 0 ? payload.name : name;
                        return [formatCurrency(toBase(value), baseCurrency), `${labelText}${ratio}`];
                      }}
                      contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px", backgroundColor: "#ffffff", color: "#1e293b" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  {!isMounted ? translations.dashboard.chartLoading : translations.dashboard.noHoldings}
                </div>
              )}
            </div>
            <div className="flex-1 w-full space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">{translations.dashboard.legendMarketOuter} ({translations.dashboard.includeCash})</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {allocationIncludingCash.outer.map((item, index) => (
                    <div
                      key={`${item.name}-${index}`}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                        activeOuterIndex === index ? 'bg-slate-50 dark:bg-slate-700/50 shadow-sm' : 'bg-transparent'
                      }`}
                      onMouseEnter={() => {
                        cancelAllocationHoverClear();
                        setActiveOuterIndex(index);
                        setActiveInnerIndex(undefined);
                      }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-semibold flex-1 font-mono text-slate-900 dark:text-slate-100">{item.name}</span>
                      <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-300">{item.ratio.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">{translations.dashboard.legendStockBondInner} ({translations.dashboard.includeCash})</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {allocationIncludingCash.inner.map((item, index) => (
                    <div
                      key={`${item.name}-${index}`}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                        activeInnerIndex === index ? 'bg-slate-50 dark:bg-slate-700/50 shadow-sm' : 'bg-transparent'
                      }`}
                      onMouseEnter={() => {
                        cancelAllocationHoverClear();
                        setActiveInnerIndex(index);
                        setActiveOuterIndex(undefined);
                      }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-semibold flex-1 text-slate-900 dark:text-slate-100">{item.name}</span>
                      <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-300">{item.ratio.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 股/債覆寫：預設收合，需自行設定時再展開 */}
              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600 rounded-lg p-3 selection:bg-indigo-200 selection:text-slate-900 dark:selection:bg-indigo-600 dark:selection:text-white">
                <button
                  type="button"
                  onClick={() => setShowAssetClassOverride((open) => !open)}
                  aria-expanded={showAssetClassOverride}
                  className="w-full flex items-center justify-between gap-2 text-left rounded-md -m-1 p-1 hover:bg-slate-100/80 dark:hover:bg-slate-700/70 transition"
                >
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    {translations.dashboard.assetClassOverrideTitle}
                    {overrideChips.length > 0 && (
                      <span className="text-[10px] sm:text-xs font-medium tabular-nums text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 px-1.5 py-0.5 rounded">
                        {overrideChips.length}
                      </span>
                    )}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform ${showAssetClassOverride ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showAssetClassOverride && (
                  <div className="mt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          {translations.dashboard.tickerSymbolLabel}
                        </label>
                        <input
                          value={overrideTickerInput}
                          onChange={(e) => setOverrideTickerInput(e.target.value)}
                          list="ticker-suggestions"
                          placeholder={translations.dashboard.tickerPlaceholderExamples}
                          className="w-full bg-white dark:bg-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-md p-2 text-base sm:text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <datalist id="ticker-suggestions">
                          {tickerSuggestions.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          {translations.dashboard.assetClassSelectLabel}
                        </label>
                        <select
                          value={overrideAssetClass}
                          onChange={(e) => setOverrideAssetClass(e.target.value as AssetClass)}
                          className="w-full bg-white dark:bg-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-md p-2 text-base sm:text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value={AssetClass.EQUITY}>{translations.dashboard.equityLabelShort}</option>
                          <option value={AssetClass.BOND}>{translations.dashboard.bondLabelShort}</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={setOverrideForTicker}
                        className="flex-1 px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 transition"
                      >
                        {translations.dashboard.saveAssetClassOverride}
                      </button>
                      <button
                        onClick={() => clearOverrideForTicker(overrideTickerInput)}
                        className="flex-1 px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        {translations.dashboard.clearTickerOverride}
                      </button>
                    </div>

                    {overrideChips.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-1">{translations.dashboard.currentOverridesHeading}</p>
                        <div className="flex flex-wrap gap-2">
                          {overrideChips.map(([tickerKey, assetClass]) => {
                            const label =
                              assetClass === AssetClass.BOND
                                ? translations.dashboard.bondLabelShort
                                : translations.dashboard.equityLabelShort;
                            return (
                              <button
                                key={tickerKey}
                                type="button"
                                onClick={() => clearOverrideForTicker(tickerKey)}
                                className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 hover:border-indigo-200 dark:hover:border-indigo-500 transition flex items-center gap-2"
                                title={translations.dashboard.removeOverrideTitle}
                              >
                                <span className="text-sm font-mono text-slate-700 dark:text-slate-200">{tickerKey}</span>
                                <span className={`text-sm font-semibold ${assetClass === AssetClass.BOND ? 'text-blue-700 dark:text-blue-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                                  {label}
                                </span>
                                <span className="text-xs sm:text-sm text-slate-400">×</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* 各市場績效比較、股息熱力圖（置於年度績效表上方） */}
      {!isGuest && <MarketPerformanceChart />}
      {!isGuest && <DividendHeatmap />}

      {/* Annual Performance Table（顯示與否見 SHOW_ANNUAL_PERFORMANCE_TABLE） */}
      {SHOW_ANNUAL_PERFORMANCE_TABLE && !isGuest && annualPerformance.length > 0 && (
          <div className="app-section-card">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-lg sm:text-xl">{translations.dashboard.annualPerformance}</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 shrink-0">{translations.dashboard.displayCurrency}:</span>
                <div className={SEGMENT_PILL_CLASS}>
                  <button
                    type="button"
                    onClick={() => setShowAnnualInUSD(false)}
                    className={`${SEGMENT_BTN_CLASS} ${
                      !showAnnualInUSD
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    {baseCurrency}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAnnualInUSD(true)}
                    className={`${SEGMENT_BTN_CLASS} ${
                      showAnnualInUSD
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    {translations.dashboard.usd}
                  </button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm sm:text-base text-left">
                <thead style={{ backgroundColor: '#f8fafc', color: '#64748b' }} className="uppercase font-medium">
                  <tr>
                    <th className="px-6 py-3">{translations.dashboard.year}</th>
                    <th className="px-6 py-3 text-right">{translations.dashboard.startAssets}</th>
                    <th className="px-6 py-3 text-right">{translations.dashboard.annualNetInflow}</th>
                    <th className="px-6 py-3 text-right">{translations.dashboard.endAssets}</th>
                    <th className="px-6 py-3 text-right">{translations.dashboard.annualProfit}</th>
                    <th className="px-6 py-3 text-right">{translations.dashboard.annualROI}</th>
                  </tr>
                </thead>
                <tbody>
                  {annualPerformance.map(item => {
                    const displayCurrency = showAnnualInUSD ? 'USD' : baseCurrency;
                    const startAssets = showAnnualInUSD ? item.startAssets / summary.exchangeRateUsdToTwd : toBase(item.startAssets);
                    const netInflow = showAnnualInUSD ? item.netInflow / summary.exchangeRateUsdToTwd : toBase(item.netInflow);
                    const endAssets = showAnnualInUSD ? item.endAssets / summary.exchangeRateUsdToTwd : toBase(item.endAssets);
                    const profit = showAnnualInUSD ? item.profit / summary.exchangeRateUsdToTwd : toBase(item.profit);
                    
                    return (
                      <tr key={item.year}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = isDarkMode ? "#334155" : "#f8fafc";
                          setHoveredAnnualYear(item.year);
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = "transparent";
                          setHoveredAnnualYear(null);
                        }}
                        style={{ transition: "background-color 0.15s" }}
                      >
                        <td
                          className="px-6 py-3 font-bold text-slate-700 dark:text-slate-200"
                          style={{
                            color:
                              (!isDarkMode && hoveredAnnualYear === item.year)
                                ? "#0f172a"
                                : (isDarkMode ? "#e2e8f0" : "#334155"),
                          }}
                        >
                          {item.year}
                          {item.isRealData && <span title={translations.dashboard.realHistoricalData} className="ml-2 text-xs cursor-help">✅</span>}
                        </td>
                        <td className="px-6 py-3 text-right text-slate-600 dark:text-slate-300 tabular-nums">{formatCurrency(startAssets, displayCurrency)}</td>
                        <td className="px-6 py-3 text-right text-slate-600 dark:text-slate-300 tabular-nums">{formatCurrency(netInflow, displayCurrency)}</td>
                        <td className="px-6 py-3 text-right font-medium text-slate-700 dark:text-slate-200 tabular-nums">{formatCurrency(endAssets, displayCurrency)}</td>
                        <td className="px-6 py-3 text-right font-bold" style={{ color: profit >= 0 ? "#10b981" : "#ef4444" }}>
                          {formatCurrency(profit, displayCurrency)}
                        </td>
                        <td className="px-6 py-3 text-right font-bold" style={{ color: item.roi >= 0 ? "#10b981" : "#ef4444" }}>
                          {item.roi.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
      )}

      {/* Account List Card — 版面與「資產配置明細」(HoldingsTable) 一致 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden border border-slate-100 dark:border-slate-700">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center flex-wrap gap-2 bg-slate-50 dark:bg-slate-800">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg sm:text-xl flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            {translations.dashboard.brokerageAccounts}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-300 shrink-0">{translations.dashboard.displayCurrency}:</span>
            <div className={SEGMENT_PILL_CLASS}>
              <button
                type="button"
                onClick={() => setShowAccountInUSD(false)}
                className={`${SEGMENT_BTN_CLASS} ${
                  !showAccountInUSD
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                {baseCurrency}
              </button>
              <button
                type="button"
                onClick={() => setShowAccountInUSD(true)}
                className={`${SEGMENT_BTN_CLASS} ${
                  showAccountInUSD
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                {translations.dashboard.usd}
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm text-left">
            <thead className="bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 text-sm font-bold border-b border-slate-100 dark:border-slate-700">
              <tr>
                <th className="px-3 py-2 sticky left-0 z-10 min-w-[10rem] whitespace-nowrap bg-white dark:bg-slate-800">
                  {translations.dashboard.accountName}
                </th>
                <th className="px-3 py-2 text-right whitespace-nowrap">{translations.dashboard.totalAssetsNT}</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">{translations.dashboard.marketValueNT}</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end gap-1">
                    {translations.dashboard.balanceNT}
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 dark:border-slate-500 text-xs text-slate-500 dark:text-slate-400 cursor-help"
                      title={translations.dashboard.balanceColumnTooltip}
                    >
                      i
                    </span>
                  </span>
                </th>
                <th className="px-3 py-2 text-right whitespace-nowrap">{translations.dashboard.unrealizedPL}</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">{translations.dashboard.realizedPL}</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">{translations.dashboard.dividendInterest}</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end gap-1">
                    {translations.dashboard.profitNT}
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 dark:border-slate-500 text-xs text-slate-500 dark:text-slate-400 cursor-help"
                      title={translations.dashboard.profitFormulaTooltip}
                    >
                      i
                    </span>
                  </span>
                </th>
                <th className="px-3 py-2 text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end gap-1">
                    {translations.dashboard.totalReturnRate}
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 dark:border-slate-500 text-xs text-slate-500 dark:text-slate-400 cursor-help"
                      title={translate('dashboard.accountReturnRateTooltip', language)}
                    >
                      i
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {visibleAccountPerformance.length > 0 ? (
                visibleAccountPerformance.map(acc => {
                  let displayCurrency: string;
                  let totalAssets: number;
                  let marketValue: number;
                  let cashBalance: number;
                  let unrealizedProfit: number;
                  let realizedProfit: number;
                  let income: number;
                  let profit: number;
                  
                  if (showAccountInUSD) {
                    displayCurrency = 'USD';
                    if (acc.currency === Currency.USD) {
                      totalAssets = acc.totalAssetsNative || acc.totalAssetsTWD / summary.exchangeRateUsdToTwd;
                      marketValue = acc.marketValueNative || acc.marketValueTWD / summary.exchangeRateUsdToTwd;
                      cashBalance = acc.cashBalanceNative || acc.cashBalanceTWD / summary.exchangeRateUsdToTwd;
                      unrealizedProfit = acc.unrealizedProfitNative || (acc.unrealizedProfitTWD || 0) / summary.exchangeRateUsdToTwd;
                      realizedProfit = acc.realizedProfitNative || (acc.realizedProfitTWD || 0) / summary.exchangeRateUsdToTwd;
                      income = acc.incomeNative || (acc.incomeTWD || 0) / summary.exchangeRateUsdToTwd;
                      profit = acc.profitNative || acc.profitTWD / summary.exchangeRateUsdToTwd;
                    } else {
                      totalAssets = acc.totalAssetsTWD / summary.exchangeRateUsdToTwd;
                      marketValue = acc.marketValueTWD / summary.exchangeRateUsdToTwd;
                      cashBalance = acc.cashBalanceTWD / summary.exchangeRateUsdToTwd;
                      unrealizedProfit = (acc.unrealizedProfitTWD || 0) / summary.exchangeRateUsdToTwd;
                      realizedProfit = (acc.realizedProfitTWD || 0) / summary.exchangeRateUsdToTwd;
                      income = (acc.incomeTWD || 0) / summary.exchangeRateUsdToTwd;
                      profit = acc.profitTWD / summary.exchangeRateUsdToTwd;
                    }
                  } else {
                    displayCurrency = baseCurrency;
                    totalAssets = toBase(acc.totalAssetsTWD);
                    marketValue = toBase(acc.marketValueTWD);
                    cashBalance = toBase(acc.cashBalanceTWD);
                    unrealizedProfit = toBase(acc.unrealizedProfitTWD || 0);
                    realizedProfit = toBase(acc.realizedProfitTWD || 0);
                    income = toBase(acc.incomeTWD || 0);
                    profit = toBase(acc.profitTWD);
                  }
                  
                  return (
                      <tr
                        key={acc.id}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = isDarkMode ? "#334155" : "#f8fafc";
                          setHoveredAccountId(acc.id);
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = "transparent";
                          setHoveredAccountId(null);
                        }}
                        style={{ transition: "background-color 0.15s" }}
                      >
                        <td
                          className="px-3 py-2 font-semibold text-sm sticky left-0 z-10 min-w-[10rem] whitespace-nowrap bg-white dark:bg-slate-800"
                          style={{
                            transition: "background-color 0.15s",
                            backgroundColor:
                              hoveredAccountId === acc.id
                                ? (isDarkMode ? "#334155" : "#f8fafc")
                                : undefined,
                            color:
                              (!isDarkMode && hoveredAccountId === acc.id)
                                ? "#0f172a"
                                : (isDarkMode ? "#e2e8f0" : "#334155"),
                          }}
                        >
                          <div>
                            {acc.name}
                            <span
                              className="text-xs font-normal ml-1"
                              style={{
                                color:
                                  (!isDarkMode && hoveredAccountId === acc.id)
                                    ? "#0f172a"
                                    : (isDarkMode ? "#cbd5e1" : "#64748b"),
                              }}
                            >
                              ({acc.currency})
                            </span>
                            {acc.isClosed ? (
                              <span className="ml-1.5 inline-flex rounded px-1.5 py-0.5 text-xs font-semibold bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-200">
                                {translate('dashboard.accountClosedBadge', language)}
                              </span>
                            ) : acc.isFlat ? (
                              <span className="ml-1.5 inline-flex rounded px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                                {translate('dashboard.accountFlatBadge', language)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td
                          className="px-3 py-2 text-right font-bold tabular-nums text-sm whitespace-nowrap"
                          style={{ color: isDarkMode ? "#e2e8f0" : "#334155" }}
                        >
                          {formatCurrency(totalAssets, displayCurrency)}
                        </td>
                        <td
                          className="px-3 py-2 text-right tabular-nums text-sm whitespace-nowrap"
                          style={{ color: isDarkMode ? "#e2e8f0" : "#334155" }}
                        >
                          {formatCurrency(marketValue, displayCurrency)}
                        </td>
                        <td
                          className="px-3 py-2 text-right tabular-nums text-sm whitespace-nowrap"
                          style={{ color: isDarkMode ? "#e2e8f0" : "#334155" }}
                        >
                          {formatCurrency(cashBalance, displayCurrency)}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap ${unrealizedProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                          {formatCurrency(unrealizedProfit, displayCurrency)}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap ${realizedProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                          {formatCurrency(realizedProfit, displayCurrency)}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap ${income >= 0 ? 'text-success' : 'text-danger'}`}>
                          {formatCurrency(income, displayCurrency)}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap ${profit >= 0 ? 'text-success' : 'text-danger'}`}>
                          {formatCurrency(profit, displayCurrency)}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap ${acc.roi >= 0 ? 'text-success' : 'text-danger'}`}>
                          {acc.roi.toFixed(2)}%
                        </td>
                      </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-slate-400 dark:text-slate-500">{translations.dashboard.noAccounts}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <HoldingsTable />

      {showCostDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
            <div className="app-modal-header p-4 flex justify-between items-center shrink-0">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <span>💰</span> {translations.dashboard.netInvestedBreakdown}
              </h2>
              <button onClick={() => setShowCostDetailModal(false)} className="text-slate-400 hover:text-white text-2xl">&times;</button>
            </div>
            
            <div className="p-4 bg-blue-50 border-b border-blue-100 text-sm text-blue-800">
              <p>ℹ️ <strong>{translations.dashboard.formulaLabel}</strong> {translations.dashboard.calculationFormula}</p>
              <p>⚠️ <strong>{translations.dashboard.attention}：</strong> {translations.dashboard.formulaNote}</p>
              {summary.hasDebtFunding && (
                <p className="mt-2">📌 {translations.dashboard.leverageFormulaNote}</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-0">
              <table className="min-w-full text-sm sm:text-base text-left">
                <thead className="bg-slate-100 sticky top-0 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">{translations.dashboard.date}</th>
                    <th className="px-3 py-2 min-w-[7rem] whitespace-nowrap">{translations.dashboard.category}</th>
                    <th className="px-3 py-2">{translations.labels.account}</th>
                    <th className="px-3 py-2 text-right">{translations.dashboard.originalAmount}</th>
                    <th className="px-3 py-2 text-right">{translations.labels.exchangeRate}</th>
                    <th className="px-3 py-2 text-right">{translate('dashboard.twdCost', language, { currency: baseCurrency })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {costDetails.map((item, idx) => {
                    const isDebtIn = isDebtFundedInflow(item, accounts);
                    const isDebtOut = isDebtRepaymentOutflow(item, accounts);
                    const categoryLabel = isDebtIn
                      ? translations.dashboard.debtDisbursement
                      : isDebtOut
                        ? translations.dashboard.debtRepayment
                        : item.type === CashFlowType.DEPOSIT
                          ? translations.dashboard.deposit
                          : translations.dashboard.withdraw;
                    const delta = netInvestedDeltaForCashFlow(item, accounts, rates);
                    const badgeClass = isDebtIn || item.type === CashFlowType.DEPOSIT
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700';
                    return (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 last:border-b-0 dark:border-slate-700"
                      onMouseEnter={e=>(e.currentTarget.style.backgroundColor=isDarkMode?"#334155":"#f8fafc")}
                      onMouseLeave={e=>(e.currentTarget.style.backgroundColor="transparent")}
                      style={{ transition: "background-color 0.15s" }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{item.date}</td>
                      <td className="px-3 py-2 whitespace-nowrap min-w-[7rem]">
                        <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${badgeClass}`}>
                          {categoryLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {item.accountName} <span className="text-xs sm:text-sm text-slate-400">({item.currency})</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {item.currency === Currency.USD ? '$' : 'NT$'}{item.amount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-col items-end">
                          <span>{item.rate.toFixed(2)}</span>
                          <span className="text-xs sm:text-sm text-slate-400">{item.rateSource}</span>
                        </div>
                      </td>
                      <td className={`px-3 py-2 text-right font-bold font-mono ${delta >= 0 ? 'text-slate-800' : 'text-red-500'}`}>
                        {delta < 0 ? '-' : ''}{formatCurrency(toBase(Math.abs(delta)), baseCurrency)}
                      </td>
                    </tr>
                  );})}
                </tbody>
                <tfoot className="bg-slate-50 sticky bottom-0 border-t-2 border-slate-300 font-bold text-slate-800">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right">{translations.dashboard.totalNetInvested}</td>
                    <td className="px-3 py-2 text-right text-lg">{formatCurrency(toBase(verifyTotal), baseCurrency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
              <button onClick={() => setShowCostDetailModal(false)} className="px-6 py-2 app-primary-btn rounded">
                {translations.common.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
