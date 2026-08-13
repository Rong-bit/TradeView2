import React, { useState, useMemo } from 'react';
import { AssetSimulationItem, SimulationResult, Market, YearlyProjection } from '../types';
import { formatCurrency, valueInBaseCurrency } from '../utils/calculations';
import { v4 as uuidv4 } from 'uuid';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { fetchAnnualizedReturn } from '../services/yahooFinanceService';
import { t, translate } from '../utils/i18n';
import { FORM_FIELD_THEME, MODAL_CANCEL_BUTTON, INPUT_MODE_DECIMAL, INPUT_MODE_NUMERIC } from '../utils/formFieldClasses';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useMarket } from '../contexts/MarketContext';
import { useUI } from '../contexts/UIContext';

interface Props {}

/** 手動添加資產表格欄寬：避免窄螢幕下代號／市場／配置比例被壓縮不可見 */
const SIM_MANUAL_TABLE_MIN = 'min-w-[42rem]';
const SIM_COL_TICKER = 'min-w-[7rem]';
const SIM_COL_MARKET = 'min-w-[10rem]';
const SIM_COL_RETURN = 'min-w-[12rem]';
const SIM_COL_ALLOC = 'min-w-[5.5rem]';
const SIM_COL_ACTION = 'min-w-[4.5rem]';

const AssetAllocationSimulator: React.FC<Props> = () => {
  const { holdings: rawHoldings } = usePortfolio();
  const { baseCurrency, rates, exchangeRate: exchangeRateUsdToTwd,
    jpyExchangeRate, eurExchangeRate, gbpExchangeRate, hkdExchangeRate,
    krwExchangeRate, cadExchangeRate, inrExchangeRate, audExchangeRate,
    sarExchangeRate, brlExchangeRate } = useMarket();
  const { language } = useUI();
  const holdings = rawHoldings.map(h => ({ ticker: h.ticker, market: h.market, annualizedReturn: h.annualizedReturn }));
  const toBase = (v: number) => valueInBaseCurrency(v, baseCurrency, rates);
  const translations = t(language);

  /** 標籤後綴基準幣；若文案已含 (XXX) 則不再重複（避免 en 等出現 (TWD)(TWD)） */
  const simulatorAmountLabel = (text: string) => {
    if (language === 'zh-TW') return text;
    if (/\([A-Z]{3}\)\s*$/i.test(text.trim())) return text;
    return `${text} (${baseCurrency})`;
  };

  const [assets, setAssets] = useState<AssetSimulationItem[]>([]);
  const [initialAmount, setInitialAmount] = useState<number>(1000000); // 預設 100 萬
  const [years, setYears] = useState<number>(10); // 預設 10 年
  const [regularInvestment, setRegularInvestment] = useState<number>(0); // 定期定額金額
  const [regularFrequency, setRegularFrequency] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly'); // 定期定額頻率
  
  // 將 Market 枚舉值轉換為翻譯後的顯示文字
  const getMarketDisplayText = (market: Market): string => {
    switch (market) {
      case Market.TW:
        return translations.simulator.marketTW;
      case Market.US:
        return translations.simulator.marketUS;
      case Market.UK:
        return translations.simulator.marketUK;
      case Market.JP:
        return translations.simulator.marketJP;
      case Market.CN:
        return translations.simulator.marketCN;
      case Market.SZ:
        return translations.simulator.marketSZ;
      case Market.IN:
        return translations.simulator.marketIN;
      case Market.CA:
        return translations.simulator.marketCA;
      case Market.FR:
        return translations.simulator.marketFR;
      case Market.HK:
        return translations.simulator.marketHK;
      case Market.KR:
        return translations.simulator.marketKR;
      case Market.DE:
        return translations.simulator.marketDE;
      case Market.AU:
        return translations.simulator.marketAU;
      case Market.SA:
        return translations.simulator.marketSA;
      case Market.BR:
        return translations.simulator.marketBR;
      default:
        return market;
    }
  };
  // 多行輸入的臨時數據結構
  interface TempInputRow {
    id: string;
    ticker: string;
    market: Market;
    annualReturn: number;
    allocation: number;
    loadingReturn?: boolean;
  }

  const [inputRows, setInputRows] = useState<TempInputRow[]>([
    { id: uuidv4(), ticker: '', market: Market.TW, annualReturn: 8, allocation: 0 }
  ]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [loadingTickers, setLoadingTickers] = useState<Set<string>>(new Set()); // 正在查詢的股票代號集合
  const [dataWarning, setDataWarning] = useState<string>(''); // 數據不完整的警告訊息


  // 計算模擬結果
  const simulationResult = useMemo<SimulationResult | null>(() => {
    if (assets.length === 0) return null;
    if (years <= 0) return null; // 投資年數必須大於 0

    // 檢查配置比例總和
    const totalAllocation = assets.reduce((sum, a) => sum + a.allocation, 0);
    if (Math.abs(totalAllocation - 100) > 0.01) return null; // 配置比例必須等於 100%

    // 計算加權平均年化報酬率
    const weightedReturn = assets.reduce((sum, a) => {
      return sum + (a.annualizedReturn * a.allocation / 100);
    }, 0);

    // 計算年度預測（包含定期定額）
    const yearlyProjections: YearlyProjection[] = [];
    let currentValue = initialAmount;
    let cumulativeInvestment = initialAmount; // 累積總投入
    const monthlyReturn = Math.pow(1 + weightedReturn / 100, 1 / 12) - 1; // 月化報酬率

    // 計算年度定期定額投入
    const annualRegularInvestment = regularFrequency === 'monthly' 
      ? regularInvestment * 12 
      : regularFrequency === 'quarterly'
      ? regularInvestment * 4
      : regularInvestment;

    for (let year = 1; year <= years; year++) {
      const yearStartValue = currentValue;
      let yearRegularInvestment = 0;

      if (regularInvestment > 0) {
        if (regularFrequency === 'monthly') {
          // 每月投入，計算複利效果
          for (let month = 1; month <= 12; month++) {
            // 先投入定期定額
            currentValue += regularInvestment;
            cumulativeInvestment += regularInvestment;
            yearRegularInvestment += regularInvestment;
            
            // 然後計算該月的報酬
            currentValue = currentValue * (1 + monthlyReturn);
          }
        } else if (regularFrequency === 'quarterly') {
          // 每季投入（每3個月投入一次），計算複利效果
          const quarterlyReturn = Math.pow(1 + weightedReturn / 100, 1 / 4) - 1; // 季化報酬率
          for (let quarter = 1; quarter <= 4; quarter++) {
            // 先投入定期定額
            currentValue += regularInvestment;
            cumulativeInvestment += regularInvestment;
            yearRegularInvestment += regularInvestment;
            
            // 然後計算該季的報酬（3個月）
            currentValue = currentValue * Math.pow(1 + monthlyReturn, 3);
          }
        } else {
          // 每年投入一次（在年初投入）
          currentValue += annualRegularInvestment;
          cumulativeInvestment += annualRegularInvestment;
          yearRegularInvestment = annualRegularInvestment;
          
          // 計算整年的報酬
          currentValue = currentValue * (1 + weightedReturn / 100);
        }
      } else {
        // 沒有定期定額，只計算報酬
        currentValue = currentValue * (1 + weightedReturn / 100);
      }

      const yearReturn = currentValue - yearStartValue - yearRegularInvestment;
      const yearReturnPercent = yearStartValue > 0 
        ? (yearReturn / (yearStartValue + yearRegularInvestment)) * 100 
        : 0;

      yearlyProjections.push({
        year,
        value: currentValue,
        return: yearReturn,
        returnPercent: yearReturnPercent,
        regularInvestment: yearRegularInvestment,
        cumulativeInvestment
      });
    }

    const finalValue = currentValue;
    const totalInvested = cumulativeInvestment;
    const totalReturn = finalValue - totalInvested;
    const totalReturnPercent = totalInvested > 0 
      ? (totalReturn / totalInvested) * 100 
      : 0;

    return {
      initialAmount,
      years,
      finalValue,
      totalReturn,
      totalReturnPercent,
      annualizedReturn: weightedReturn,
      yearlyProjections,
      regularInvestment: regularInvestment > 0 ? {
        amount: regularInvestment,
        frequency: regularFrequency,
        totalInvested: totalInvested
      } : undefined
    };
  }, [assets, initialAmount, years, regularInvestment, regularFrequency]);

  // 添加新行
  const addInputRow = () => {
    setInputRows([...inputRows, { 
      id: uuidv4(), 
      ticker: '', 
      market: Market.TW, 
      annualReturn: 8, 
      allocation: 0 
    }]);
  };

  // 刪除輸入行
  const removeInputRow = (id: string) => {
    setInputRows(prev => {
      if (prev.length > 1) {
        return prev.filter(row => row.id !== id);
      }
      return prev;
    });
  };

  // 更新輸入行
  const updateInputRow = (id: string, field: keyof TempInputRow, value: any) => {
    setInputRows(prev => prev.map(row => {
      if (row.id === id) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  // 批量添加資產
  const batchAddAssets = () => {
    setErrorMessage('');
    
    const rowsWithTicker = inputRows.filter(row => row.ticker.trim());
    const validRows = rowsWithTicker.filter(row => row.allocation > 0);
    
    if (rowsWithTicker.length === 0) {
      setErrorMessage(translations.simulator.errorEnterTicker);
      return;
    }

    if (validRows.length === 0) {
      setErrorMessage(translations.simulator.errorEnterAllocation);
      return;
    }

    // 檢查配置比例總和
    const totalAllocation = validRows.reduce((sum, row) => sum + row.allocation, 0);
    const currentTotal = assets.reduce((sum, a) => sum + a.allocation, 0);
    
    if (currentTotal + totalAllocation > 100) {
      setErrorMessage(translate('simulator.errorAllocationSum', language));
      return;
    }

    // 添加所有有效行
    const newAssets: AssetSimulationItem[] = validRows.map(row => ({
      id: uuidv4(),
      ticker: row.ticker.trim().toUpperCase(),
      market: row.market,
      annualizedReturn: row.annualReturn,
      allocation: row.allocation
    }));

    setAssets([...assets, ...newAssets]);
    
    // 重置輸入行（保留一行空白）
    setInputRows([{ id: uuidv4(), ticker: '', market: Market.TW, annualReturn: 8, allocation: 0 }]);
  };


  // 從現有持倉導入（同一市場＋代號只保留一筆；已在配置列表者略過）
  const importFromHoldings = () => {
    setErrorMessage('');
    if (holdings.length === 0) {
      setErrorMessage(translations.simulator.errorNoHoldings);
      return;
    }

    const existingKeys = new Set(
      assets.map(a => `${a.market}\x1e${a.ticker.trim().toUpperCase()}`)
    );
    const byKey = new Map<string, AssetSimulationItem>();

    for (const h of holdings) {
      const key = `${h.market}\x1e${h.ticker.trim().toUpperCase()}`;
      if (existingKeys.has(key) || byKey.has(key)) continue;
      byKey.set(key, {
        id: uuidv4(),
        ticker: h.ticker.trim().toUpperCase(),
        market: h.market,
        annualizedReturn: h.annualizedReturn || 8,
        allocation: 0,
      });
    }

    const newAssets = Array.from(byKey.values());
    if (newAssets.length === 0) return;

    setAssets([...assets, ...newAssets]);
  };

  // 自動查詢年化報酬率（針對特定行）
  // 
  // 年化報酬率計算說明：
  // 系統會查詢股票上市以來的歷史數據，使用 CAGR (Compound Annual Growth Rate) 公式計算：
  // CAGR = ((當前價格 / 初始價格) ^ (1 / 年數)) - 1
  // 
  // 這表示如果從上市時買入並持有至今，每年的平均複合報酬率。
  // 例如：股票從 100 元漲到 200 元，經過 5 年，年化報酬率約為 14.87%
  //
  const fetchReturnForRow = async (rowId: string) => {
    const row = inputRows.find(r => r.id === rowId);
    if (!row || !row.ticker.trim()) {
      setErrorMessage(translations.simulator.errorEnterTickerFirst);
      return;
    }

    setErrorMessage('');
    const tickerUpper = row.ticker.trim().toUpperCase();
    setLoadingTickers(prev => new Set([...prev, tickerUpper]));
    updateInputRow(rowId, 'loadingReturn', true);

    try {
      // 查詢股票上市以來的年化報酬率（CAGR）
      const annualReturn = await fetchAnnualizedReturn(tickerUpper, row.market);
      
      if (annualReturn !== null) {
        updateInputRow(rowId, 'annualReturn', annualReturn);
        setErrorMessage(''); // 清除錯誤訊息
      } else {
        setErrorMessage(translate('simulator.errorCannotGetReturn', language, { ticker: tickerUpper }));
      }
    } catch (error) {
      console.error('查詢年化報酬率時發生錯誤:', error);
      setErrorMessage(translations.simulator.errorQueryFailed);
    } finally {
      setLoadingTickers(prev => {
        const newSet = new Set(prev);
        newSet.delete(tickerUpper);
        return newSet;
      });
      updateInputRow(rowId, 'loadingReturn', false);
    }
  };

  // 更新資產
  const updateAsset = (id: string, field: keyof AssetSimulationItem, value: any) => {
    setErrorMessage('');
    setAssets(assets.map(a => {
      if (a.id === id) {
        // 如果更新配置比例，檢查總和
        if (field === 'allocation') {
          const currentTotal = assets.reduce((sum, item) => {
            if (item.id === id) return sum;
            return sum + item.allocation;
          }, 0);
          if (currentTotal + value > 100) {
            setErrorMessage(translate('simulator.errorAllocationSum', language));
            return a;
          }
        }
        return { ...a, [field]: value };
      }
      return a;
    }));
  };

  // 刪除資產
  const removeAsset = (id: string) => {
    setAssets(assets.filter(a => a.id !== id));
  };

  // 自動平衡配置（平均分配）
  const autoBalance = () => {
    if (assets.length === 0) return;
    const equalAllocation = 100 / assets.length;
    setAssets(assets.map(a => ({ ...a, allocation: equalAllocation })));
  };

  // 清空所有資產
  const clearAll = () => {
    setShowClearConfirm(true);
  };

  const confirmClearAll = () => {
    setAssets([]);
    setShowClearConfirm(false);
    setErrorMessage('');
  };

  // 準備圖表數據
  const chartData = simulationResult?.yearlyProjections.map(yp => ({
    [translations.simulator.year]: yp.year,
    [translations.simulator.assetValue]: Math.round(yp.value),
    [translations.simulator.yearlyReturn]: Math.round(yp.return),
    [translations.simulator.cumulativeInvestment]: yp.cumulativeInvestment ? Math.round(yp.cumulativeInvestment) : initialAmount,
    [translations.simulator.initial]: initialAmount
  })) || [];

  return (
    <div className="space-y-6">
      {/* 說明區塊 */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
        <h3 className="font-bold text-blue-900 mb-2">📊 {translations.simulator.title}</h3>
        <p className="text-sm text-blue-800 mb-2">
          {translations.simulator.description}
        </p>
        <p className="text-xs text-blue-700 mt-2">
          {translations.simulator.descriptionWarning}
        </p>
      </div>

      {/* 基本設定 */}
      <div className="app-section-card p-6">
        <h3 className="font-bold text-slate-800 text-lg mb-4">{translations.simulator.basicSettings}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {simulatorAmountLabel(translations.simulator.initialAmount)}
            </label>
            <input
              type="number"
              inputMode={INPUT_MODE_DECIMAL}
              value={initialAmount === 0 ? '' : initialAmount}
              onChange={(e) => {
                const inputValue = e.target.value;
                // 如果輸入為空，設為 0
                if (inputValue === '' || inputValue === null || inputValue === undefined) {
                  setInitialAmount(0);
                  return;
                }
                // 移除前導零並轉換為數字
                const numValue = parseFloat(inputValue);
                // 如果轉換失敗或為 NaN，設為 0
                if (isNaN(numValue)) {
                  setInitialAmount(0);
                  return;
                }
                // 確保值不小於 0
                if (numValue < 0) {
                  setInitialAmount(0);
                } else {
                  setInitialAmount(numValue);
                }
              }}
              onBlur={(e) => {
                // 當失去焦點時，確保值正確格式化
                const numValue = parseFloat(e.target.value);
                if (isNaN(numValue) || numValue === 0) {
                  setInitialAmount(0);
                } else {
                  setInitialAmount(numValue);
                }
              }}
              className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
              min="0"
              step="1000"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {translations.simulator.investmentYears}
            </label>
            <input
              type="text"
              inputMode={INPUT_MODE_NUMERIC}
              value={years === 0 ? '' : years.toString()}
              onChange={(e) => {
                const inputValue = e.target.value.trim();
                // 允許空字串（用戶正在輸入時）
                if (inputValue === '' || inputValue === null || inputValue === undefined) {
                  setYears(0); // 使用 0 作為空值的標記
                  return;
                }
                // 只允許數字
                if (!/^\d+$/.test(inputValue)) {
                  return; // 如果不是純數字，不更新
                }
                // 轉換為整數
                const numValue = parseInt(inputValue, 10);
                // 如果轉換失敗或為 NaN，不更新
                if (isNaN(numValue)) {
                  return;
                }
                // 確保值在有效範圍內
                if (numValue < 1) {
                  setYears(1);
                } else if (numValue > 50) {
                  setYears(50);
                } else {
                  setYears(numValue);
                }
              }}
              onBlur={(e) => {
                // 當失去焦點時，確保值正確格式化
                const inputValue = e.target.value.trim();
                if (inputValue === '' || inputValue === null || inputValue === undefined) {
                  setYears(10); // 預設為 10 年
                  return;
                }
                const numValue = parseInt(inputValue, 10);
                if (isNaN(numValue) || numValue < 1) {
                  setYears(10); // 預設為 10 年
                } else if (numValue > 50) {
                  setYears(50);
                } else {
                  setYears(numValue);
                }
              }}
              className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
              min="1"
              max="50"
              placeholder="10"
            />
          </div>
        </div>
        
        {/* 定期定額設定 */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">{translations.simulator.regularInvestment}</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {simulatorAmountLabel(translations.simulator.regularAmount)}
              </label>
              <input
                type="number"
                inputMode={INPUT_MODE_DECIMAL}
                value={regularInvestment === 0 ? '' : regularInvestment}
                onChange={(e) => {
                  const inputValue = e.target.value;
                  // 如果輸入為空，設為 0
                  if (inputValue === '' || inputValue === null || inputValue === undefined) {
                    setRegularInvestment(0);
                    return;
                  }
                  // 移除前導零並轉換為數字
                  const numValue = parseFloat(inputValue);
                  // 如果轉換失敗或為 NaN，設為 0
                  if (isNaN(numValue)) {
                    setRegularInvestment(0);
                    return;
                  }
                  // 確保值不小於 0
                  if (numValue < 0) {
                    setRegularInvestment(0);
                  } else {
                    setRegularInvestment(numValue);
                  }
                }}
                onBlur={(e) => {
                  // 當失去焦點時，確保值正確格式化
                  const numValue = parseFloat(e.target.value);
                  if (isNaN(numValue) || numValue === 0) {
                    setRegularInvestment(0);
                  } else {
                    setRegularInvestment(numValue);
                  }
                }}
                className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                min="0"
                step="1000"
                placeholder="0"
              />
              <p className="text-xs text-slate-500 mt-1">{translations.simulator.setToZero}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {translations.simulator.frequency}
              </label>
              <select
                value={regularFrequency}
                onChange={(e) => setRegularFrequency(e.target.value as 'monthly' | 'quarterly' | 'yearly')}
                className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                disabled={regularInvestment === 0}
              >
                <option value="monthly">{translations.simulator.monthly}</option>
                <option value="quarterly">{translations.simulator.quarterly}</option>
                <option value="yearly">{translations.simulator.yearly}</option>
              </select>
            </div>
            <div className="flex items-end">
              <div className="w-full p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-1">{translations.simulator.annualTotal}</p>
                <p className="text-lg font-bold text-slate-800">
                  {regularInvestment > 0 
                    ? formatCurrency(
                        toBase(regularFrequency === 'monthly' 
                          ? regularInvestment * 12 
                          : regularFrequency === 'quarterly'
                          ? regularInvestment * 4
                          : regularInvestment),
                        baseCurrency
                      )
                    : formatCurrency(0, baseCurrency)
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 從現有持倉導入 */}
      {holdings.length > 0 && (
        <div className="app-section-card p-6">
          <h3 className="font-bold text-slate-800 text-lg mb-4">{translations.simulator.importFromHoldings}</h3>
          <button
            onClick={importFromHoldings}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:bg-indigo-800 active:scale-95 active:shadow-inner transition-all duration-150 text-sm font-medium shadow-md hover:shadow-lg"
          >
            {translations.simulator.importButton}
          </button>
        </div>
      )}

      {/* 錯誤訊息顯示 */}
      {errorMessage && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <p className="text-red-800 font-medium">{errorMessage}</p>
          <button
            onClick={() => setErrorMessage('')}
            className="mt-2 text-sm text-red-600 hover:text-red-800 active:text-red-900 active:scale-95 transition-all duration-150 underline"
          >
            {translations.simulator.close}
          </button>
        </div>
      )}

      {/* 手動添加資產 */}
      <div className="app-section-card p-6">
        <div className="mb-4">
          <h3 className="font-bold text-slate-800 text-lg">{translations.simulator.manualAdd}</h3>
        </div>
        
        {/* 年化報酬率說明 */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          <p className="font-semibold mb-1">{translations.simulator.cagrExplanation}</p>
          <p className="mb-1">
            {translations.simulator.cagrFormulaDesc}
          </p>
          <p className="font-mono bg-blue-100 px-2 py-1 rounded mb-1 text-blue-900 dark:bg-slate-700 dark:text-blue-100">
            {translations.simulator.cagrFormula}
          </p>
          <p className="mb-1">
            {translations.simulator.cagrExample}
          </p>
          <p className="text-blue-700">
            {translations.simulator.cagrExampleValue}
          </p>
        </div>

        {/* 多行輸入表格 */}
        <div className="overflow-x-auto -mx-1 px-1">
          <table className={`w-full ${SIM_MANUAL_TABLE_MIN} text-xs sm:text-sm border-collapse`}>
            <thead className="bg-slate-50 text-slate-600 uppercase font-medium">
              <tr className="border-b border-slate-100">
                <th className={`px-2 sm:px-3 py-2 text-left ${SIM_COL_TICKER}`}>{translations.simulator.ticker}</th>
                <th className={`px-2 sm:px-3 py-2 text-left ${SIM_COL_MARKET}`}>{translations.simulator.market}</th>
                <th className={`px-2 sm:px-3 py-2 text-left ${SIM_COL_RETURN}`}>{translations.simulator.annualReturn}</th>
                <th className={`px-2 sm:px-3 py-2 text-left ${SIM_COL_ALLOC}`}>{translations.simulator.allocation}</th>
                <th className={`px-2 sm:px-3 py-2 text-center ${SIM_COL_ACTION}`}>{translations.simulator.action}</th>
              </tr>
            </thead>
            <tbody>
              {inputRows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className={`hover:bg-slate-50${rowIndex < inputRows.length - 1 ? ' border-b border-slate-100' : ''}`}
                >
                  <td className={`px-2 sm:px-3 py-2 ${SIM_COL_TICKER}`}>
                    <input
                      type="text"
                      value={row.ticker}
                      onChange={(e) => updateInputRow(row.id, 'ticker', e.target.value)}
                      placeholder={translations.simulator.tickerPlaceholder}
                      className={`w-full min-w-0 px-2 sm:px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                    />
                  </td>
                  <td className={`px-2 sm:px-3 py-2 ${SIM_COL_MARKET}`}>
                    <select
                      value={row.market}
                      onChange={(e) => updateInputRow(row.id, 'market', e.target.value as Market)}
                      className={`w-full min-w-0 px-2 sm:px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                    >
                      <option value={Market.TW}>{translations.simulator.marketTW}</option>
                      <option value={Market.US}>{translations.simulator.marketUS}</option>
                      <option value={Market.UK}>{translations.simulator.marketUK}</option>
                      <option value={Market.JP}>{translations.simulator.marketJP}</option>
                      <option value={Market.CN}>{translations.simulator.marketCN}</option>
                      <option value={Market.SZ}>{translations.simulator.marketSZ}</option>
                      <option value={Market.IN}>{translations.simulator.marketIN}</option>
                      <option value={Market.CA}>{translations.simulator.marketCA}</option>
                      <option value={Market.FR}>{translations.simulator.marketFR}</option>
                      <option value={Market.HK}>{translations.simulator.marketHK}</option>
                      <option value={Market.KR}>{translations.simulator.marketKR}</option>
                      <option value={Market.DE}>{translations.simulator.marketDE}</option>
                      <option value={Market.AU}>{translations.simulator.marketAU}</option>
                      <option value={Market.SA}>{translations.simulator.marketSA}</option>
                      <option value={Market.BR}>{translations.simulator.marketBR}</option>
                    </select>
                  </td>
                  <td className={`px-2 sm:px-3 py-2 ${SIM_COL_RETURN}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="number"
                        inputMode={INPUT_MODE_DECIMAL}
                        value={row.annualReturn}
                        onChange={(e) => updateInputRow(row.id, 'annualReturn', parseFloat(e.target.value) || 0)}
                        className={`flex-1 min-w-[3.5rem] px-2 sm:px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                        step="0.1"
                        min="0"
                        max="100"
                      />
                      {row.ticker.trim() && (
                        <button
                          onClick={() => fetchReturnForRow(row.id)}
                          disabled={row.loadingReturn || loadingTickers.has(row.ticker.trim().toUpperCase())}
                          className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 active:bg-blue-200 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          title={translations.simulator.autoQueryTitle}
                        >
                          {(row.loadingReturn || loadingTickers.has(row.ticker.trim().toUpperCase())) ? (
                            <span className="flex items-center gap-1">
                              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              {translations.simulator.querying}
                            </span>
                          ) : (
                            translations.simulator.autoQuery
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className={`px-2 sm:px-3 py-2 ${SIM_COL_ALLOC}`}>
                    <input
                      type="number"
                      inputMode={INPUT_MODE_DECIMAL}
                      value={row.allocation === 0 ? '' : row.allocation}
                      onChange={(e) => {
                        const inputValue = e.target.value;
                        if (inputValue === '' || inputValue === null || inputValue === undefined) {
                          updateInputRow(row.id, 'allocation', 0);
                          return;
                        }
                        const numValue = parseFloat(inputValue);
                        if (isNaN(numValue)) {
                          updateInputRow(row.id, 'allocation', 0);
                          return;
                        }
                        if (numValue < 0) {
                          updateInputRow(row.id, 'allocation', 0);
                        } else if (numValue > 100) {
                          updateInputRow(row.id, 'allocation', 100);
                        } else {
                          updateInputRow(row.id, 'allocation', numValue);
                        }
                      }}
                      onBlur={(e) => {
                        const numValue = parseFloat(e.target.value);
                        if (isNaN(numValue) || numValue === 0) {
                          updateInputRow(row.id, 'allocation', 0);
                        } else {
                          updateInputRow(row.id, 'allocation', numValue);
                        }
                      }}
                      className={`w-full min-w-0 px-2 sm:px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="0"
                    />
                  </td>
                  <td className={`px-2 sm:px-3 py-2 text-center ${SIM_COL_ACTION}`}>
                    <button
                      onClick={() => removeInputRow(row.id)}
                      disabled={inputRows.length === 1}
                      className="text-red-500 hover:text-red-700 active:text-red-900 active:scale-95 transition-all duration-150 text-sm px-2 py-1 rounded hover:bg-red-50 active:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {translations.simulator.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 批量添加按鈕 */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={addInputRow}
            className="px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 active:bg-green-200 active:scale-95 active:shadow-inner transition-all duration-150 text-sm font-medium border border-green-200 hover:border-green-300"
          >
            + {translations.simulator.addRow}
          </button>
          <button
            onClick={batchAddAssets}
            className="px-6 py-2 app-primary-btn rounded-lg active:scale-95 active:shadow-inner transition-all duration-150 font-medium shadow-md hover:shadow-lg"
          >
            {translations.simulator.addAll}
          </button>
        </div>
      </div>

      {/* 資產配置列表 */}
      {assets.length > 0 && (
        <div className="app-section-card p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800 text-lg">{translations.simulator.assetList}</h3>
            <div className="flex gap-2">
              <button
                onClick={autoBalance}
                className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 active:bg-blue-200 active:scale-95 active:shadow-inner transition-all duration-150 text-sm font-medium border border-blue-200 hover:border-blue-300"
              >
                {translations.simulator.autoBalance}
              </button>
              <button
                onClick={clearAll}
                className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 active:bg-red-200 active:scale-95 active:shadow-inner transition-all duration-150 text-sm font-medium border border-red-200 hover:border-red-300"
              >
                {translations.simulator.clearAll}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs sm:text-sm border-collapse">
              <thead className="bg-slate-50 text-slate-600 uppercase font-medium">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-2 text-left">{translations.simulator.ticker}</th>
                  <th className="px-3 py-2 text-left">{translations.simulator.market}</th>
                  <th className="px-3 py-2 text-right">{translations.simulator.annualReturn}</th>
                  <th className="px-3 py-2 text-right">{translations.simulator.allocation}</th>
                  <th className="px-3 py-2 text-right">{translations.simulator.action}</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset, assetIndex) => {
                  const currentTotal = assets.reduce((sum, a) => sum + a.allocation, 0);
                  return (
                    <tr
                      key={asset.id}
                      className={`hover:bg-slate-50${assetIndex < assets.length - 1 ? ' border-b border-slate-100' : ''}`}
                    >
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {asset.ticker}
                        {asset.name && <span className="text-xs text-slate-500 ml-2">({asset.name})</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{getMarketDisplayText(asset.market)}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          inputMode={INPUT_MODE_DECIMAL}
                          value={asset.annualizedReturn}
                          onChange={(e) => updateAsset(asset.id, 'annualizedReturn', parseFloat(e.target.value) || 0)}
                          className={`w-20 px-2 py-1 border border-slate-300 rounded text-right text-base sm:text-sm focus:ring-2 focus:ring-blue-500 ${FORM_FIELD_THEME}`}
                          step="0.1"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          inputMode={INPUT_MODE_DECIMAL}
                          value={asset.allocation === 0 ? '' : asset.allocation}
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            // 如果輸入為空，設為 0
                            if (inputValue === '' || inputValue === null || inputValue === undefined) {
                              updateAsset(asset.id, 'allocation', 0);
                              return;
                            }
                            // 移除前導零並轉換為數字
                            const numValue = parseFloat(inputValue);
                            // 如果轉換失敗或為 NaN，設為 0
                            if (isNaN(numValue)) {
                              updateAsset(asset.id, 'allocation', 0);
                              return;
                            }
                            // 確保值在有效範圍內
                            if (numValue < 0) {
                              updateAsset(asset.id, 'allocation', 0);
                            } else if (numValue > 100) {
                              updateAsset(asset.id, 'allocation', 100);
                            } else {
                              updateAsset(asset.id, 'allocation', numValue);
                            }
                          }}
                          onBlur={(e) => {
                            // 當失去焦點時，確保值正確格式化
                            const numValue = parseFloat(e.target.value);
                            if (isNaN(numValue) || numValue === 0) {
                              updateAsset(asset.id, 'allocation', 0);
                            } else {
                              updateAsset(asset.id, 'allocation', numValue);
                            }
                          }}
                          className={`w-20 px-2 py-1 border border-slate-300 rounded text-right text-base sm:text-sm focus:ring-2 focus:ring-blue-500 ${FORM_FIELD_THEME}`}
                          step="0.1"
                          min="0"
                          max="100"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeAsset(asset.id)}
                          className="text-red-500 hover:text-red-700 active:text-red-900 active:scale-95 transition-all duration-150 text-sm px-2 py-1 rounded hover:bg-red-50 active:bg-red-100"
                        >
                          {translations.simulator.delete}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t border-slate-100">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right">{translations.simulator.allocationSum}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={Math.abs(assets.reduce((sum, a) => sum + a.allocation, 0) - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}>
                      {assets.reduce((sum, a) => sum + a.allocation, 0).toFixed(1)}%
                    </span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 模擬結果 */}
      {simulationResult && (
        <>
          {/* 結果摘要卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="app-section-card p-6 border-l-4 border-purple-500">
              <h4 className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                {simulationResult.regularInvestment ? translations.simulator.totalInvested : translations.simulator.initial}
              </h4>
              <p className="text-2xl font-bold text-slate-800 mt-2">
                {formatCurrency(
                  toBase(simulationResult.regularInvestment 
                    ? simulationResult.regularInvestment.totalInvested 
                    : simulationResult.initialAmount),
                  baseCurrency
                )}
              </p>
              {simulationResult.regularInvestment && (
                <p className="text-xs text-slate-500 mt-1">
                  {translations.simulator.initial}: {formatCurrency(toBase(simulationResult.initialAmount), baseCurrency)}
                </p>
              )}
            </div>
            <div className="app-section-card p-6 border-l-4 border-green-500">
              <h4 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{translations.simulator.finalValue}</h4>
              <p className="text-2xl font-bold text-slate-800 mt-2">
                {formatCurrency(toBase(simulationResult.finalValue), baseCurrency)}
              </p>
            </div>
            <div className="app-section-card p-6 border-l-4 border-blue-500">
              <h4 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{translations.simulator.totalReturn}</h4>
              <p className="text-2xl font-bold text-slate-800 mt-2">
                {formatCurrency(toBase(simulationResult.totalReturn), baseCurrency)}
              </p>
              <p className="text-sm font-bold text-blue-600 mt-1">
                {simulationResult.totalReturnPercent.toFixed(2)}%
              </p>
            </div>
            <div className="app-section-card p-6 border-l-4 border-indigo-500">
              <h4 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{translations.simulator.portfolioAnnualReturn}</h4>
              <p className="text-2xl font-bold text-slate-800 mt-2">
                {simulationResult.annualizedReturn.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* 年度預測圖表 */}
          <div className="app-section-card p-6">
            <h3 className="font-bold text-slate-800 text-lg mb-4">{translations.simulator.yearlyProjection}</h3>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey={translations.simulator.year} stroke="#64748b" fontSize={12} />
                  <YAxis 
                    stroke="#64748b" 
                    fontSize={12} 
                    tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    formatter={(value: number) => formatCurrency(toBase(value), baseCurrency)}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey={translations.simulator.assetValue} 
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    dot={{ r: 4 }} 
                    name={translations.simulator.assetValue}
                  />
                  <Line 
                    type="monotone" 
                    dataKey={translations.simulator.cumulativeInvestment} 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    strokeDasharray="3 3" 
                    dot={false}
                    name={translations.simulator.cumulativeInvestment}
                  />
                  <Line 
                    type="monotone" 
                    dataKey={translations.simulator.initial} 
                    stroke="#8b5cf6" 
                    strokeWidth={2} 
                    strokeDasharray="5 5" 
                    dot={false}
                    name={translations.simulator.initial}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 年度報酬圖表 */}
          <div className="app-section-card p-6">
            <h3 className="font-bold text-slate-800 text-lg mb-4">{translations.simulator.yearlyReturnAnalysis}</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey={translations.simulator.year} stroke="#64748b" fontSize={12} />
                  <YAxis 
                    stroke="#64748b" 
                    fontSize={12} 
                    tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    formatter={(value: number) => formatCurrency(toBase(value), baseCurrency)}
                  />
                  <Legend />
                  <Bar dataKey={translations.simulator.yearlyReturn} fill="#10b981" name={translations.simulator.yearlyReturn} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 詳細年度預測表 */}
          <div className="app-section-card">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-lg">{translations.simulator.detailedYearlyProjection}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs sm:text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-medium">
                  <tr>
                    <th className="px-6 py-3">{translations.simulator.year}</th>
                    <th className="px-6 py-3 text-right">{translations.simulator.assetValue}</th>
                    {simulationResult.regularInvestment && (
                      <th className="px-6 py-3 text-right">{translations.simulator.yearlyInvestment}</th>
                    )}
                    <th className="px-6 py-3 text-right">{translations.simulator.cumulativeInvestment}</th>
                    <th className="px-6 py-3 text-right">{translations.simulator.yearlyReturn}</th>
                    <th className="px-6 py-3 text-right">{translations.simulator.yearlyReturnRate}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {simulationResult.yearlyProjections.map(yp => (
                    <tr key={yp.year} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-bold text-slate-700">{translations.simulator.yearPrefix} {yp.year} {translations.simulator.yearSuffix}</td>
                      <td className="px-6 py-3 text-right font-medium">
                        {formatCurrency(toBase(yp.value), baseCurrency)}
                      </td>
                      {simulationResult.regularInvestment && (
                        <td className="px-6 py-3 text-right text-slate-600">
                          {yp.regularInvestment ? formatCurrency(toBase(yp.regularInvestment), baseCurrency) : '-'}
                        </td>
                      )}
                      <td className="px-6 py-3 text-right text-slate-600">
                        {yp.cumulativeInvestment ? formatCurrency(toBase(yp.cumulativeInvestment), baseCurrency) : formatCurrency(toBase(initialAmount), baseCurrency)}
                      </td>
                      <td className={`px-6 py-3 text-right font-bold ${yp.return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(toBase(yp.return), baseCurrency)}
                      </td>
                      <td className={`px-6 py-3 text-right font-bold ${yp.returnPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {yp.returnPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 配置比例未達 100% 的提示 */}
      {assets.length > 0 && simulationResult === null && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg">
          <p className="text-amber-800 font-medium">
            {translations.simulator.allocationWarning} {assets.reduce((sum, a) => sum + a.allocation, 0).toFixed(1)}%
          </p>
        </div>
      )}

      {/* 清空確認對話框 */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-2">{translations.simulator.confirmClear}</h3>
            <p className="text-slate-600 mb-6">{translations.simulator.confirmClearMessage}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className={MODAL_CANCEL_BUTTON}
              >
                {translations.simulator.cancel}
              </button>
              <button
                onClick={confirmClearAll}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 active:bg-red-800 active:scale-95 active:shadow-inner transition-all duration-150 shadow-md hover:shadow-lg"
              >
                {translations.simulator.confirmClear}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetAllocationSimulator;


