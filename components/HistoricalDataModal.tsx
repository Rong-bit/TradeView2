
import React, { useState, useMemo, useEffect } from 'react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useUI } from '../contexts/UIContext';
import { t } from '../utils/i18n';
import { HistoricalData, Market, Currency } from '../types';
import { getPortfolioStateAtDate } from '../utils/calculations';
import { INPUT_MODE_DECIMAL } from '../utils/formFieldClasses';
import { fetchHistoricalYearEndData, fetchHistoricalQuarterEndData } from '../services/yahooFinanceService';

const applyVars = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));

type HistPeriodSnapshot = HistoricalData[string];

type FetchedHistRates = {
  exchangeRate?: number;
  jpyExchangeRate?: number;
  eurExchangeRate?: number;
  gbpExchangeRate?: number;
  hkdExchangeRate?: number;
  krwExchangeRate?: number;
  cnyExchangeRate?: number;
  cadExchangeRate?: number;
  audExchangeRate?: number;
  inrExchangeRate?: number;
  sarExchangeRate?: number;
  brlExchangeRate?: number;
};

const pickHistRate = (
  current: number | undefined,
  fetched: number | undefined,
  overwrite: boolean
) => (overwrite || !current || current === 0) && fetched && fetched > 0 ? fetched : current;

const mergeFetchedRatesIntoPeriod = (
  prev: HistPeriodSnapshot,
  result: FetchedHistRates,
  opts: { overwriteFx: boolean; defaultUsd?: number }
): HistPeriodSnapshot => {
  const defaultUsd = opts.defaultUsd ?? 30;
  const shouldUpdateUsd =
    opts.overwriteFx || !prev.exchangeRate || prev.exchangeRate === 0 || prev.exchangeRate === 30;
  return {
    ...prev,
    exchangeRate: shouldUpdateUsd ? (result.exchangeRate || defaultUsd) : prev.exchangeRate,
    jpyExchangeRate: pickHistRate(prev.jpyExchangeRate, result.jpyExchangeRate, opts.overwriteFx),
    eurExchangeRate: pickHistRate(prev.eurExchangeRate, result.eurExchangeRate, opts.overwriteFx),
    gbpExchangeRate: pickHistRate(prev.gbpExchangeRate, result.gbpExchangeRate, opts.overwriteFx),
    hkdExchangeRate: pickHistRate(prev.hkdExchangeRate, result.hkdExchangeRate, opts.overwriteFx),
    krwExchangeRate: pickHistRate(prev.krwExchangeRate, result.krwExchangeRate, opts.overwriteFx),
    cnyExchangeRate: pickHistRate(prev.cnyExchangeRate, result.cnyExchangeRate, opts.overwriteFx),
    cadExchangeRate: pickHistRate(prev.cadExchangeRate, result.cadExchangeRate, opts.overwriteFx),
    audExchangeRate: pickHistRate(prev.audExchangeRate, result.audExchangeRate, opts.overwriteFx),
    inrExchangeRate: pickHistRate(prev.inrExchangeRate, result.inrExchangeRate, opts.overwriteFx),
    sarExchangeRate: pickHistRate(prev.sarExchangeRate, result.sarExchangeRate, opts.overwriteFx),
    brlExchangeRate: pickHistRate(prev.brlExchangeRate, result.brlExchangeRate, opts.overwriteFx),
  };
};

interface Props {
  onSave: (data: HistoricalData) => void;
  onClose: () => void;
}

const HistoricalDataModal: React.FC<Props> = ({ onSave, onClose }) => {
  const { transactions, cashFlows, accounts, historicalData } = usePortfolio();
  const { language } = useUI();
  const accTr = t(language).accounts;
  const tr = t(language).historicalModal;
  const currentYear = new Date().getFullYear();
  const completedQuarter = Math.floor((new Date().getMonth()) / 3) as 0 | 1 | 2 | 3;

  // Identify available years from data（含當年，便於查看 Q1~Q3）
  const years = useMemo(() => {
    const allYears = new Set([
        ...transactions.map(t => new Date(t.date).getFullYear()),
        ...cashFlows.map(c => new Date(c.date).getFullYear())
    ]);
    allYears.add(currentYear);
    return Array.from(allYears).filter(y => y <= currentYear).sort((a, b) => b - a);
  }, [transactions, cashFlows, currentYear]);

  const [selectedYear, setSelectedYear] = useState<number>(years[0] || currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(4);
  const availableQuarters = useMemo(() => {
    if (selectedYear < currentYear) return [1, 2, 3, 4] as const;
    const maxQuarter = Math.max(1, completedQuarter) as 1 | 2 | 3 | 4;
    return ([1, 2, 3, 4] as const).filter(q => q <= maxQuarter);
  }, [selectedYear, currentYear, completedQuarter]);

  useEffect(() => {
    if (!availableQuarters.includes(selectedQuarter)) {
      setSelectedQuarter(availableQuarters[availableQuarters.length - 1] as 1 | 2 | 3 | 4);
    }
  }, [availableQuarters, selectedQuarter]);

  const [localData, setLocalData] = useState<HistoricalData>(historicalData);
  const [loading, setLoading] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; year: number } | null>(null);

  const selectedPeriodKey = selectedQuarter === 4 ? String(selectedYear) : `${selectedYear}-Q${selectedQuarter}`;
  // 季末最後一日：new Date(Y, n*3, 0) 為「第 n*3 個月的前一日」＝該季最後一日（Q3 為 9/30，不可誤用 9/31）
  const selectedPeriodDate = useMemo(
    () => new Date(selectedYear, selectedQuarter * 3, 0),
    [selectedYear, selectedQuarter],
  );
  const selectedPeriodDateLabel = useMemo(() => {
    const d = selectedPeriodDate;
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedPeriodDate]);

  // Determine tickers for selected period
  const activeTickers = useMemo(() => {
      const { holdings } = getPortfolioStateAtDate(selectedPeriodDate, transactions, cashFlows, accounts);
      return Object.keys(holdings).filter(k => holdings[k] > 0.000001).map(k => {
          const [market, ticker] = k.split('-');
          return { market, ticker };
      });
  }, [selectedPeriodDate, transactions, cashFlows, accounts]);

  const showInrFx = useMemo(
    () =>
      activeTickers.some(t => t.market === Market.IN) ||
      accounts.some(a => a.currency === Currency.INR),
    [activeTickers, accounts]
  );
  const showSarFx = useMemo(
    () =>
      activeTickers.some(t => t.market === Market.SA) ||
      accounts.some(a => a.currency === Currency.SAR),
    [activeTickers, accounts]
  );
  const showBrlFx = useMemo(
    () =>
      activeTickers.some(t => t.market === Market.BR) ||
      accounts.some(a => a.currency === Currency.BRL),
    [activeTickers, accounts]
  );

  // Handle data updates
  const handlePriceChange = (ticker: string, value: string) => {
      const num = parseFloat(value);
      setLocalData(prev => ({
          ...prev,
          [selectedPeriodKey]: {
              ...prev[selectedPeriodKey],
              prices: { ...prev[selectedPeriodKey]?.prices, [ticker]: isNaN(num) ? 0 : num },
              exchangeRate: prev[selectedPeriodKey]?.exchangeRate || 30,
          }
      }));
  };

  const handleRateChange = (value: string) => {
      const num = parseFloat(value);
      setLocalData(prev => ({
          ...prev,
          [selectedPeriodKey]: {
              ...prev[selectedPeriodKey],
              prices: prev[selectedPeriodKey]?.prices || {},
              exchangeRate: isNaN(num) ? 30 : num,
          }
      }));
  };

  const handleOptionalRateChange = (
    field: 'inrExchangeRate' | 'sarExchangeRate' | 'brlExchangeRate',
    value: string
  ) => {
    const num = parseFloat(value);
    setLocalData(prev => ({
      ...prev,
      [selectedPeriodKey]: {
        ...prev[selectedPeriodKey],
        prices: prev[selectedPeriodKey]?.prices || {},
        exchangeRate: prev[selectedPeriodKey]?.exchangeRate || 30,
        [field]: isNaN(num) ? undefined : num,
      },
    }));
  };

  const handleAiFetch = async () => {
      // 1. Get current data for selected year
      const currentYearData = localData[selectedPeriodKey] || { prices: {}, exchangeRate: 0 };

      // 2. Filter out tickers that already have non-zero data
      const missingTickers = activeTickers.filter(t => {
          // 移除 (BAK) 後綴以進行比對
          const cleanTicker = t.ticker.replace(/\(BAK\)/gi, '');
          const displayTicker = t.market === Market.TW && !cleanTicker.includes('TPE:') ? `TPE:${cleanTicker}` : cleanTicker;
          
          // Check if price exists and is non-zero (檢查多種可能的 key 格式)
          // 注意：需要明確檢查 undefined，因為 0 也是有效值（表示需要更新）
          const val1 = currentYearData.prices[displayTicker];
          const val2 = currentYearData.prices[cleanTicker];
          const val3 = currentYearData.prices[t.ticker];
          const val = val1 !== undefined ? val1 : (val2 !== undefined ? val2 : val3);
          
          // 如果值為 undefined、null 或 0，或強制重新抓取，則需要更新
          const needsUpdate = forceRefresh || val === undefined || val === null || val === 0;
          
          if (!needsUpdate) {
          } else {
          }
          
          return needsUpdate;
      });

      // 3. Check if exchange rate needs update
      // Rule: Allow update if it's missing (0/undefined) OR it is exactly 30 (default).
      // If it is any other number (e.g. 32.5), assume user set it and do not overwrite.
      const rateNeedsUpdate = forceRefresh || !currentYearData.exchangeRate || currentYearData.exchangeRate === 0 || currentYearData.exchangeRate === 30;

      if (missingTickers.length === 0 && !rateNeedsUpdate) {
          alert(tr.alertNoUpdateNeeded);
          return;
      }

      setLoading(true);
      try {
          // If no tickers are missing but rate needs update, we still need to call API.
          // We'll query one ticker to trigger the prompt logic if list is empty.
          let queryTickers: string[] = [];
          type MarketCode = 'US' | 'TW' | 'UK' | 'JP' | 'CN' | 'SZ' | 'IN' | 'CA' | 'FR' | 'HK' | 'KR' | 'DE' | 'AU' | 'SA' | 'BR';
          const toMarketCode = (m: Market): MarketCode => {
            if (m === Market.TW) return 'TW';
            if (m === Market.UK) return 'UK';
            if (m === Market.JP) return 'JP';
            if (m === Market.CN) return 'CN';
            if (m === Market.SZ) return 'SZ';
            if (m === Market.IN) return 'IN';
            if (m === Market.CA) return 'CA';
            if (m === Market.FR) return 'FR';
            if (m === Market.HK) return 'HK';
            if (m === Market.KR) return 'KR';
            if (m === Market.DE) return 'DE';
            if (m === Market.AU) return 'AU';
            if (m === Market.SA) return 'SA';
            if (m === Market.BR) return 'BR';
            return 'US';
          };
          let queryMarkets: MarketCode[] = [];
          if (missingTickers.length > 0) {
              queryTickers = missingTickers.map(t => {
                  const cleanTicker = t.ticker.replace(/\(BAK\)/gi, '');
                  return t.market === Market.TW && !cleanTicker.includes('TPE:') ? `TPE:${cleanTicker}` : cleanTicker;
              });
              queryMarkets = missingTickers.map(t => toMarketCode(t.market as Market));
          } else if (activeTickers.length > 0) {
              const t = activeTickers[0];
              const cleanTicker = t.ticker.replace(/\(BAK\)/gi, '');
              queryTickers = [t.market === Market.TW && !cleanTicker.includes('TPE:') ? `TPE:${cleanTicker}` : cleanTicker];
              queryMarkets = [toMarketCode(t.market as Market)];
          }
          
          const result = selectedQuarter === 4
            ? await fetchHistoricalYearEndData(selectedYear, queryTickers, queryMarkets)
            : (await fetchHistoricalQuarterEndData(selectedYear, queryTickers, queryMarkets, [selectedQuarter]))[`${selectedYear}-Q${selectedQuarter}`];
          
          // 檢查是否有成功取得數據
          const successCount = Object.keys(result.prices).length;
          if (successCount === 0 && missingTickers.length > 0) {
              alert(
                  applyVars(tr.alertFetchFailed, {
                      count: missingTickers.length,
                      tickers: queryTickers.join(', '),
                  }),
              );
          } else if (successCount < missingTickers.length) {
              const failedTickers = missingTickers.filter(t => {
                  const displayTicker = t.market === Market.TW && !t.ticker.includes('TPE:') ? `TPE:${t.ticker}` : t.ticker;
                  return !result.prices[displayTicker] && !result.prices[t.ticker];
              });
              console.warn('部分股票無法取得歷史股價：', failedTickers.map(t => t.ticker));
          }
          
          setLocalData(prev => {
              const prevPeriodData = prev[selectedPeriodKey] || { prices: {}, exchangeRate: 0 };
              const mergedPrices = { ...prevPeriodData.prices };

              Object.entries(result.prices).forEach(([key, price]) => {
                  mergedPrices[key] = price;
                  if (key.startsWith('TPE:')) {
                      const cleanKey = key.replace(/^TPE:/i, '');
                      mergedPrices[cleanKey] = price;
                  } else if (key.match(/^\d{4}$/)) {
                      mergedPrices[`TPE:${key}`] = price;
                  }
              });

              return {
                  ...prev,
                  [selectedPeriodKey]: {
                      ...mergeFetchedRatesIntoPeriod(prevPeriodData, result, { overwriteFx: false }),
                      prices: mergedPrices,
                  },
              };
          });
      } catch (e) {
          alert(tr.alertAiError);
      } finally {
          setLoading(false);
      }
  };

  const handleBatchFetch = async () => {
      const historicalYears = years.filter(y => y < currentYear);
      if (historicalYears.length === 0) return;
      setLoading(true);
      setBatchProgress({ current: 0, total: historicalYears.length, year: historicalYears[0] });

      type MarketCode = 'US' | 'TW' | 'UK' | 'JP' | 'CN' | 'SZ' | 'IN' | 'CA' | 'FR' | 'HK' | 'KR' | 'DE' | 'AU' | 'SA' | 'BR';
      const toMarketCode = (m: Market): MarketCode => {
          if (m === Market.TW) return 'TW';
          if (m === Market.UK) return 'UK';
          if (m === Market.JP) return 'JP';
          if (m === Market.CN) return 'CN';
          if (m === Market.SZ) return 'SZ';
          if (m === Market.IN) return 'IN';
          if (m === Market.CA) return 'CA';
          if (m === Market.FR) return 'FR';
          if (m === Market.HK) return 'HK';
          if (m === Market.KR) return 'KR';
          if (m === Market.DE) return 'DE';
          if (m === Market.AU) return 'AU';
          if (m === Market.SA) return 'SA';
          if (m === Market.BR) return 'BR';
          return 'US';
      };

      const pickRate = (current: number | undefined, fetched: number | undefined) =>
          (forceRefresh || !current || current === 0) && fetched && fetched > 0 ? fetched : current;

      let accumulated: HistoricalData = { ...localData };

      for (let i = 0; i < historicalYears.length; i++) {
          const y = historicalYears[i];
          setBatchProgress({ current: i + 1, total: years.length, year: y });

          try {
              // ── 年底股價 ──────────────────────────────────────────────
              const yearEndDate = new Date(`${y}-12-31`);
              const { holdings: yearEndHoldings } = getPortfolioStateAtDate(yearEndDate, transactions, cashFlows, accounts);
              const yearTickers = Object.keys(yearEndHoldings)
                  .filter(k => yearEndHoldings[k] > 0.000001)
                  .map(k => { const [market, ticker] = k.split('-'); return { market, ticker }; });

              if (yearTickers.length > 0) {
                  const prevYearData = accumulated[y] || { prices: {}, exchangeRate: 0 };
                  const toQuery = forceRefresh ? yearTickers : yearTickers.filter(t => {
                      const clean = t.ticker.replace(/\(BAK\)/gi, '');
                      const display = t.market === Market.TW && !clean.includes('TPE:') ? `TPE:${clean}` : clean;
                      const val = prevYearData.prices[display] ?? prevYearData.prices[clean] ?? prevYearData.prices[t.ticker];
                      return val === undefined || val === null || val === 0;
                  });
                  const rateNeedsUpdate = forceRefresh || !prevYearData.exchangeRate || prevYearData.exchangeRate === 0 || prevYearData.exchangeRate === 30;

                  if (toQuery.length > 0 || rateNeedsUpdate) {
                      const queryTickers = (toQuery.length > 0 ? toQuery : [yearTickers[0]]).map(t => {
                          const clean = t.ticker.replace(/\(BAK\)/gi, '');
                          return t.market === Market.TW && !clean.includes('TPE:') ? `TPE:${clean}` : clean;
                      });
                      const queryMarkets = (toQuery.length > 0 ? toQuery : [yearTickers[0]]).map(t => toMarketCode(t.market as Market));
                      const result = await fetchHistoricalYearEndData(y, queryTickers, queryMarkets);

                      const newRate = rateNeedsUpdate ? (result.exchangeRate || 30) : prevYearData.exchangeRate;
                      const mergedPrices = { ...prevYearData.prices };
                      Object.entries(result.prices).forEach(([key, price]) => {
                          mergedPrices[key] = price;
                          if (key.startsWith('TPE:')) mergedPrices[key.replace(/^TPE:/i, '')] = price;
                          else if (key.match(/^\d{4}$/)) mergedPrices[`TPE:${key}`] = price;
                      });
                      accumulated = {
                          ...accumulated,
                          [y]: {
                              ...mergeFetchedRatesIntoPeriod(prevYearData, result, {
                                  overwriteFx: forceRefresh || rateNeedsUpdate,
                              }),
                              prices: mergedPrices,
                              exchangeRate: newRate,
                          },
                      };
                  }
              }

              // ── Q1~Q3 季末股價 ────────────────────────────────────────
              // 各季用該季末的持倉，確保持倉正確（例如 Q1 賣掉的股票不會出現在 Q2）
              const quartersToFetch = ([1, 2, 3] as (1|2|3)[]).filter(q => {
                  if (forceRefresh) return true;
                  const snap = accumulated[`${y}-Q${q}`];
                  return !snap || Object.keys(snap.prices).length === 0;
              });

              if (quartersToFetch.length > 0) {
                  // 取各季持倉的聯集作為查詢標的
                  const allQTickers = new Map<string, string>(); // key -> market
                  for (const q of quartersToFetch) {
                      const qDate = new Date(y, q * 3, 0);
                      const { holdings: qHoldings } = getPortfolioStateAtDate(qDate, transactions, cashFlows, accounts);
                      Object.keys(qHoldings).filter(k => qHoldings[k] > 0.000001).forEach(k => {
                          const [market, ticker] = k.split('-');
                          const clean = ticker.replace(/\(BAK\)/gi, '');
                          const display = market === Market.TW && !clean.includes('TPE:') ? `TPE:${clean}` : clean;
                          allQTickers.set(display, market);
                      });
                  }
                  const queryTickers = Array.from(allQTickers.keys());
                  const queryMarkets = queryTickers.map(t => toMarketCode(allQTickers.get(t) as Market));

                  if (queryTickers.length > 0) {
                      const quarterResults = await fetchHistoricalQuarterEndData(y, queryTickers, queryMarkets, quartersToFetch);
                      Object.entries(quarterResults).forEach(([key, result]) => {
                          const prevSnap = accumulated[key] || { prices: {}, exchangeRate: 0 };
                          const mergedPrices = { ...prevSnap.prices };
                          Object.entries(result.prices).forEach(([ticker, price]) => {
                              mergedPrices[ticker] = price;
                              if (ticker.startsWith('TPE:')) mergedPrices[ticker.replace(/^TPE:/i, '')] = price;
                              else if (ticker.match(/^\d{4}$/)) mergedPrices[`TPE:${ticker}`] = price;
                          });
                          const usdNeedsUpdate =
                              forceRefresh || !prevSnap.exchangeRate || prevSnap.exchangeRate === 0;
                          accumulated = {
                              ...accumulated,
                              [key]: {
                                  ...mergeFetchedRatesIntoPeriod(prevSnap, result, {
                                      overwriteFx: forceRefresh,
                                      defaultUsd: 31.5,
                                  }),
                                  prices: mergedPrices,
                                  exchangeRate: usdNeedsUpdate
                                      ? (result.exchangeRate || 31.5)
                                      : prevSnap.exchangeRate,
                              },
                          };
                      });
                  }
              }
          } catch (e) {
              console.warn('Historical fetch failed for year', y, e);
          }

          if (i < historicalYears.length - 1) await new Promise(r => setTimeout(r, 600));
      }

      setLocalData(accumulated);
      setBatchProgress(null);
      setLoading(false);
      alert(applyVars(tr.alertAllComplete, { count: historicalYears.length }));
  };

  const handleSave = () => {
      onSave(localData);
      onClose();
  };

  const currentYearData = localData[selectedPeriodKey] || { prices: {}, exchangeRate: 30 };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="rounded-xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden" style={{ backgroundColor: "#ffffff", color: "#1e293b" }}>
        <div className="bg-slate-900 p-4 flex justify-between items-center shrink-0">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <span>🕰️</span> {tr.title}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
        </div>
        
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-6">
           <div className="flex gap-4 items-start bg-slate-50 p-4 rounded-lg border border-slate-200">
               <div className="flex flex-col gap-2 shrink-0">
                   <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">{tr.selectYearLabel}</label>
                   <select
                     value={selectedYear} 
                     onChange={(e) => setSelectedYear(Number(e.target.value))}
                     className="border border-slate-300 rounded p-2 text-base sm:text-sm font-bold min-w-[100px] text-slate-800 bg-white"
                   >
                       {years.map(y => (
                         <option key={y} value={y}>{applyVars(tr.yearOption, { year: y })}</option>
                       ))}
                       {years.length === 0 && <option disabled>{tr.noHistoryYears}</option>}
                   </select>
                   </div>
                   <div>
                   <label className="block text-xs font-bold text-slate-500 mb-1">{tr.selectQuarterLabel}</label>
                   <select
                     value={selectedQuarter}
                     onChange={(e) => setSelectedQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}
                     className="border border-slate-300 rounded p-2 text-base sm:text-sm font-bold min-w-[90px] text-slate-800 bg-white"
                   >
                     {availableQuarters.map(q => (
                       <option key={q} value={q}>{`Q${q}`}</option>
                     ))}
                   </select>
                   </div>
               </div>
               
               <div className="flex-1 flex flex-col items-end gap-2">
                   <div className="flex flex-col gap-2 w-full max-w-[14rem] sm:max-w-none sm:w-auto">
                       <button
                         onClick={handleAiFetch}
                         disabled={loading || years.length === 0}
                         className={`w-full sm:w-auto px-4 py-2 rounded shadow text-sm font-bold text-white transition flex items-center justify-center gap-2
                           ${loading ? 'bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                       >
                           {loading && !batchProgress
                             ? tr.aiSearching
                             : applyVars(tr.fillYearEndButton, { year: selectedYear, quarter: selectedQuarter })}
                       </button>
                       <button
                         onClick={handleBatchFetch}
                         disabled={loading || years.length === 0}
                         className={`w-full sm:w-auto px-4 py-2 rounded shadow text-sm font-bold text-white transition flex items-center justify-center gap-2
                           ${loading ? 'bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                       >
                           {batchProgress
                               ? applyVars(tr.batchProgress, {
                                   current: batchProgress.current,
                                   total: batchProgress.total,
                                   year: batchProgress.year,
                                 })
                               : tr.batchFetchAll}
                       </button>
                   </div>
                   <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                       <input
                         type="checkbox"
                         checked={forceRefresh}
                         onChange={e => setForceRefresh(e.target.checked)}
                         className="rounded"
                       />
                       {tr.forceRefresh}
                   </label>
                   {batchProgress && (
                       <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1">
                           <div
                             className="bg-emerald-500 h-1.5 rounded-full transition-all"
                             style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                           />
                       </div>
                   )}
               </div>
           </div>

           <div className="border rounded-lg overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
               <div className="p-3 sm:p-4 border-b flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3" style={{ backgroundColor: "#f1f5f9" }}>
                   <h3 className="font-bold shrink-0" style={{ color: "#334155" }}>
                    {applyVars(tr.periodDataTitle, { year: selectedYear, quarter: selectedQuarter })}
                   </h3>
                   <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:justify-end">
                       <div className="flex items-center gap-2">
                         <label className="text-sm whitespace-nowrap" style={{ color: "#475569" }}>{tr.exchangeRateLabel}</label>
                         <input
                           type="number"
                           inputMode={INPUT_MODE_DECIMAL}
                           step="0.1"
                           value={currentYearData.exchangeRate}
                           onChange={(e) => handleRateChange(e.target.value)}
                           className="w-20 border rounded p-1 text-right font-mono text-slate-800 bg-white"
                         />
                       </div>
                       {showInrFx && (
                         <div className="flex items-center gap-2">
                           <label className="text-xs" style={{ color: "#475569" }}>{accTr.currencyINR}</label>
                           <input
                             type="number"
                             inputMode={INPUT_MODE_DECIMAL}
                             step="0.001"
                             value={currentYearData.inrExchangeRate ?? ''}
                             onChange={(e) => handleOptionalRateChange('inrExchangeRate', e.target.value)}
                             placeholder="TWD"
                             className="w-16 border rounded p-1 text-right font-mono text-base sm:text-xs text-slate-800 bg-white"
                           />
                         </div>
                       )}
                       {showSarFx && (
                         <div className="flex items-center gap-2">
                           <label className="text-xs" style={{ color: "#475569" }}>{accTr.currencySAR}</label>
                           <input
                             type="number"
                             inputMode={INPUT_MODE_DECIMAL}
                             step="0.01"
                             value={currentYearData.sarExchangeRate ?? ''}
                             onChange={(e) => handleOptionalRateChange('sarExchangeRate', e.target.value)}
                             placeholder="TWD"
                             className="w-16 border rounded p-1 text-right font-mono text-base sm:text-xs text-slate-800 bg-white"
                           />
                         </div>
                       )}
                       {showBrlFx && (
                         <div className="flex items-center gap-2">
                           <label className="text-xs" style={{ color: "#475569" }}>{accTr.currencyBRL}</label>
                           <input
                             type="number"
                             inputMode={INPUT_MODE_DECIMAL}
                             step="0.01"
                             value={currentYearData.brlExchangeRate ?? ''}
                             onChange={(e) => handleOptionalRateChange('brlExchangeRate', e.target.value)}
                             placeholder="TWD"
                             className="w-16 border rounded p-1 text-right font-mono text-base sm:text-xs text-slate-800 bg-white"
                           />
                         </div>
                       )}
                   </div>
               </div>
               
               <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
               <table className="w-full table-fixed text-sm text-left border-collapse">
                   <colgroup>
                       <col className="w-[3.75rem]" />
                       <col />
                       <col />
                   </colgroup>
                   <thead style={{ backgroundColor: "#f8fafc", color: "#64748b" }}>
                       <tr>
                           <th className="px-1.5 sm:px-2 py-2 border-b border-slate-200 whitespace-nowrap">{tr.colMarket}</th>
                           <th className="px-2 py-2 border-b border-slate-200 whitespace-nowrap">{tr.colTicker}</th>
                           <th className="px-2 py-2 text-center border-b border-slate-200 whitespace-nowrap">
                            <span className="sm:hidden">{tr.colClosePriceShort}</span>
                            <span className="hidden sm:inline">{applyVars(tr.colClosePrice, { date: selectedPeriodDateLabel })}</span>
                           </th>
                       </tr>
                   </thead>
                   <tbody>
                       {activeTickers.length === 0 ? (
                           <tr><td colSpan={3} className="p-8 text-center text-slate-400">{tr.noHoldingsThisYear}</td></tr>
                       ) : (
                           activeTickers.map(t => {
                               // 移除 (BAK) 後綴以進行比對（與過濾邏輯保持一致）
                               const cleanTicker = t.ticker.replace(/\(BAK\)/gi, '');
                               const displayTicker = t.market === Market.TW && !cleanTicker.includes('TPE:') ? `TPE:${cleanTicker}` : cleanTicker;
                               const priceKey = t.market === Market.TW ? displayTicker : cleanTicker;
                               
                               // 檢查多種可能的 key 格式
                               const val1 = currentYearData.prices[priceKey];
                               const val2 = currentYearData.prices[displayTicker];
                               const val3 = currentYearData.prices[cleanTicker];
                               const val4 = currentYearData.prices[t.ticker];
                               const val = val1 !== undefined ? val1 : (val2 !== undefined ? val2 : (val3 !== undefined ? val3 : val4)) || 0;
                               const hasData = val > 0;
                               const displayPrice = val === 0 ? 0 : Math.round(Number(val) * 100) / 100;
                               
                               return (
                                   <tr key={t.ticker} onMouseEnter={e=>(e.currentTarget.style.backgroundColor="#f8fafc")} onMouseLeave={e=>(e.currentTarget.style.backgroundColor="transparent")}>
                                       <td className="px-1.5 sm:px-2 py-2 border-b border-slate-100">
                                           <span className={`px-1.5 py-0.5 rounded text-xs ${
                                            t.market === Market.US ? 'bg-blue-100 text-blue-700' : 
                                            t.market === Market.UK ? 'bg-purple-100 text-purple-700' : 
                                            t.market === Market.JP ? 'bg-red-100 text-red-700' :
                                            t.market === Market.CN ? 'bg-amber-100 text-amber-700' :
                                            t.market === Market.SZ ? 'bg-amber-200 text-amber-800' :
                                            t.market === Market.IN ? 'bg-teal-100 text-teal-700' :
                                            t.market === Market.CA ? 'bg-rose-100 text-rose-700' :
                                            t.market === Market.FR ? 'bg-indigo-100 text-indigo-700' :
                                             'bg-green-100 text-green-700'
                                           }`}>
                                               {t.market}
                                           </span>
                                       </td>
                                       <td className="px-2 py-2 font-bold border-b border-slate-100 truncate" style={{ color: "#334155" }}>
                                           {t.ticker.replace(/\(BAK\)/gi, '')}
                                           {hasData && <span className="text-green-500 ml-0.5 text-xs">✓</span>}
                                       </td>
                                       <td className="px-2 py-2 text-left border-b border-slate-100">
                                           <input 
                                             type="number"
                                             inputMode={INPUT_MODE_DECIMAL}
                                             step="0.01"
                                             value={displayPrice}
                                             onChange={(e) => handlePriceChange(priceKey, e.target.value)}
                                             className="w-full min-w-0 border rounded p-1 text-right text-base sm:text-sm focus:ring-2 focus:ring-accent" style={{ color: "#1e293b", backgroundColor: hasData ? "#f0fdf4" : "#ffffff", borderColor: hasData ? "#bbf7d0" : "#cbd5e1" }}
                                             placeholder={tr.pricePlaceholder}
                                           />
                                       </td>
                                   </tr>
                               );
                           })
                       )}
                   </tbody>
               </table>
               </div>
           </div>
           
           <div className="text-xs p-3 rounded" style={{ backgroundColor: "#fefce8", color: "#78716c", border: "1px solid #fef08a" }}>
               {tr.hintTitle}
               <ul className="list-disc pl-5 mt-1 space-y-1">
                   <li>{applyVars(tr.hintBullet1, { year: selectedYear, quarter: selectedQuarter })}</li>
                   <li>{tr.hintBullet2}</li>
                   <li>{tr.hintBullet3}</li>
               </ul>
           </div>
        </div>

        <div className="p-4 flex justify-end gap-3 shrink-0" style={{ borderTop: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
          <button onClick={onClose} className="px-6 py-2 border rounded-lg transition" style={{ borderColor: "#cbd5e1", color: "#334155", backgroundColor: "#ffffff" }}>{tr.cancel}</button>
          <button onClick={handleSave} className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition shadow-lg">{tr.saveUpdateChart}</button>
        </div>
      </div>
    </div>
  );
};

export default HistoricalDataModal;


