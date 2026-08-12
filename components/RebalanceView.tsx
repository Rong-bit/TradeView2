
import React, { useEffect, useMemo, useState } from 'react';
import { Holding, Market } from '../types';
import { formatCurrency, valueInBaseCurrency, holdingValueToTWD } from '../utils/calculations';
import { t } from '../utils/i18n';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useMarket } from '../contexts/MarketContext';
import { useUI } from '../contexts/UIContext';

/** 與儀表板相同：雙鈕一體式膠囊 */
const SEGMENT_PILL_CLASS =
  'inline-flex overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-600';
const SEGMENT_BTN_CLASS =
  'px-3 py-1.5 text-sm rounded-none transition whitespace-nowrap focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/90';

interface Props {}

const RebalanceView: React.FC<Props> = () => {
  const { summary, holdings, accounts, rebalanceTargets: targets,
    updateRebalanceTargets: onUpdateTargets,
    rebalanceEnabledItems: enabledItemsArray,
    setRebalanceEnabledItems: onUpdateEnabledItems } = usePortfolio();
  const { baseCurrency, rates } = useMarket();
  const { exchangeRateUsdToTwd: exchangeRate, jpyExchangeRate } = rates;
  const { language } = useUI();
  const translations = t(language);
  const totalPortfolioValue = summary.totalValueTWD + summary.cashBalanceTWD;
  const toBase = (v: number) => valueInBaseCurrency(v, baseCurrency, rates);
  
  const enabledItems = useMemo(() => new Set(enabledItemsArray), [enabledItemsArray]);
  const [showInUSD, setShowInUSD] = useState(false);
  
  const handleTargetChange = (mergedKey: string, val: string, accountIds: string[], ticker: string) => {
    // 移除前導零：處理 "020" 或 "02" 這種情況
    let cleanedVal = val.trim();
    if (cleanedVal && cleanedVal.length > 1 && cleanedVal[0] === '0' && cleanedVal[1] !== '.') {
      // 移除前導零，但保留小數點前的零（例如 "0.5"）
      cleanedVal = cleanedVal.replace(/^0+/, '') || '0';
    }
    
    const num = parseFloat(cleanedVal);
    const newTargets = { ...targets };
    
    // 如果是現金目標
    if (mergedKey === 'cash') {
      if (cleanedVal === '' || isNaN(num)) {
        // 只有當輸入為空或無效時才刪除
        delete newTargets['cash'];
      } else {
        // 允許設置為0
        newTargets['cash'] = num;
      }
      onUpdateTargets(newTargets);
      return;
    }
    
    if (isNaN(num) || num === 0) {
      // 清除所有相關帳戶的目標
      accountIds.forEach(accountId => {
        const oldKey = `${accountId}-${ticker}`;
        delete newTargets[oldKey];
      });
      delete newTargets[mergedKey];
    } else {
      // 將目標佔比按現值比例分配給各個帳戶
      const mergedHolding = holdings.filter(h => 
        accountIds.includes(h.accountId) && h.ticker === ticker
      );
      const totalValTwd = mergedHolding.reduce((sum, h) => {
        const valTwd = holdingValueToTWD(h, accounts, rates);
        return sum + valTwd;
      }, 0);
      if (totalValTwd > 0) {
        mergedHolding.forEach(h => {
          const valTwd = holdingValueToTWD(h, accounts, rates);
          const ratio = valTwd / totalValTwd;
          const oldKey = `${h.accountId}-${h.ticker}`;
          newTargets[oldKey] = parseFloat((num * ratio).toFixed(1));
        });
      }
      // 同時保存合併後的 key 用於顯示
      newTargets[mergedKey] = num;
    }
    
    onUpdateTargets(newTargets);
  };

  const handleResetToCurrent = () => {
    const newTargets: Record<string, number> = {};
    // 先合併 holdings
    const mergedMap = new Map<string, { holdings: Holding[], totalValTwd: number }>();
    holdings.forEach(h => {
      const mergedKey = `${h.market}-${h.ticker}`;
      const valTwd = holdingValueToTWD(h, accounts, rates);
      if (!mergedMap.has(mergedKey)) {
        mergedMap.set(mergedKey, { holdings: [], totalValTwd: 0 });
      }
      const merged = mergedMap.get(mergedKey)!;
      merged.holdings.push(h);
      merged.totalValTwd += valTwd;
    });
    
    // 計算參與平衡的總價值（只包括啟用的項目）
    const isCashEnabled = enabledItems.has('cash');
    const enabledTotalValue = Array.from(mergedMap.entries())
      .filter(([mergedKey]) => enabledItems.has(mergedKey))
      .reduce((sum, [, merged]) => sum + merged.totalValTwd, 0) + (isCashEnabled ? summary.cashBalanceTWD : 0);
    
    // 設置目標佔比（基於參與平衡的總價值）
    mergedMap.forEach((merged, mergedKey) => {
      const isEnabled = enabledItems.has(mergedKey);
      // 如果是啟用的項目，使用參與平衡內的百分比；否則使用總資產百分比
      const pct = isEnabled && enabledTotalValue > 0
        ? (merged.totalValTwd / enabledTotalValue) * 100
        : (totalPortfolioValue > 0 ? (merged.totalValTwd / totalPortfolioValue) * 100 : 0);
      
      if (isEnabled) {
        newTargets[mergedKey] = parseFloat(pct.toFixed(1));
        
        // 按現值比例分配給各個帳戶
        merged.holdings.forEach(h => {
          const valTwd = holdingValueToTWD(h, accounts, rates);
          const ratio = merged.totalValTwd > 0 ? valTwd / merged.totalValTwd : 0;
          const oldKey = `${h.accountId}-${h.ticker}`;
          newTargets[oldKey] = parseFloat((pct * ratio).toFixed(1));
        });
      }
    });
    
    // 設置現金目標佔比
    if (isCashEnabled && enabledTotalValue > 0) {
      const cashPct = (summary.cashBalanceTWD / enabledTotalValue) * 100;
      newTargets['cash'] = parseFloat(cashPct.toFixed(1));
    }
    
    onUpdateTargets(newTargets);
  };
  
  // 初始化：預設所有項目都啟用（使用合併後的 key）
  useEffect(() => {
    if (enabledItemsArray.length === 0 && holdings.length > 0) {
      const initialEnabled: string[] = [];
      const mergedKeys = new Set<string>();
      holdings.forEach(h => {
        const mergedKey = `${h.market}-${h.ticker}`;
        if (!mergedKeys.has(mergedKey)) {
          initialEnabled.push(mergedKey);
          mergedKeys.add(mergedKey);
        }
      });
      initialEnabled.push('cash'); // 預設現金也啟用
      onUpdateEnabledItems(initialEnabled);
    }
  }, [holdings.length, enabledItemsArray.length, onUpdateEnabledItems]);

  // If targets are completely empty, auto-populate with current weights once
  useEffect(() => {
    if (Object.keys(targets).length === 0 && holdings.length > 0) {
      handleResetToCurrent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length]); // Only check when holdings loaded/changed length, avoid loop

  const handleToggleItem = (key: string) => {
    const newArray = [...enabledItemsArray];
    const index = newArray.indexOf(key);
    if (index > -1) {
      newArray.splice(index, 1);
    } else {
      newArray.push(key);
    }
    onUpdateEnabledItems(newArray);
  };

  const rebalanceRows = useMemo(() => {
    // 先合併相同 ticker 和 market 的 holdings
    const mergedMap = new Map<string, {
      holdings: Holding[];
      totalValTwd: number;
      totalQuantity: number;
      accountIds: string[];
      market: Market;
      ticker: string;
      currentPrice: number;
      totalCurrentValue: number;
    }>();
    
    holdings.forEach(h => {
      const mergedKey = `${h.market}-${h.ticker}`;
      const valTwd = holdingValueToTWD(h, accounts, rates);
      
      if (!mergedMap.has(mergedKey)) {
        mergedMap.set(mergedKey, {
          holdings: [],
          totalValTwd: 0,
          totalQuantity: 0,
          accountIds: [],
          market: h.market,
          ticker: h.ticker,
          currentPrice: h.currentPrice,
          totalCurrentValue: 0
        });
      }
      
      const merged = mergedMap.get(mergedKey)!;
      merged.holdings.push(h);
      merged.totalValTwd += valTwd;
      merged.totalQuantity += h.quantity;
      merged.totalCurrentValue += h.currentValue;
      if (!merged.accountIds.includes(h.accountId)) {
        merged.accountIds.push(h.accountId);
      }
    });
    
    // 計算參與平衡的總價值（包括啟用的股票和現金）
    const isCashEnabled = enabledItems.has('cash');
    const enabledTotalValue = Array.from(mergedMap.entries())
      .filter(([mergedKey]) => enabledItems.has(mergedKey))
      .reduce((sum, [, merged]) => sum + merged.totalValTwd, 0) + (isCashEnabled ? summary.cashBalanceTWD : 0);
    
    // 轉換為行數據
    return Array.from(mergedMap.entries()).map(([mergedKey, merged]) => {
      // 當前百分比：相對於總資產
      const currentPctTotal = totalPortfolioValue > 0 ? (merged.totalValTwd / totalPortfolioValue) * 100 : 0;
      // 當前百分比（參與平衡內）：相對於參與平衡的總價值
      const currentPct = enabledTotalValue > 0 && enabledItems.has(mergedKey) 
        ? (merged.totalValTwd / enabledTotalValue) * 100 
        : currentPctTotal;
      const isEnabled = enabledItems.has(mergedKey);
      
      // 計算加權平均價格（按現值加權，因為不同帳戶可能有不同價格）
      let avgPrice = merged.currentPrice;
      if (merged.holdings.length > 1) {
        const totalValue = merged.holdings.reduce((sum, h) => sum + h.currentValue, 0);
        if (totalValue > 0) {
          avgPrice = merged.holdings.reduce((sum, h) => {
            const weight = h.currentValue / totalValue;
            return sum + (h.currentPrice * weight);
          }, 0);
        }
      }
      
      // 優先使用合併後的 key，如果沒有則從各個帳戶的目標加總
      let targetPct = isEnabled ? (targets[mergedKey] || 0) : 0;
      if (targetPct === 0 && isEnabled) {
        // 如果合併後的 key 沒有值，則從各個帳戶的目標加總
        targetPct = merged.holdings.reduce((sum, h) => {
          const oldKey = `${h.accountId}-${h.ticker}`;
          return sum + (targets[oldKey] || 0);
        }, 0);
      }
      
      // 目標價值：基於參與平衡的總價值計算
      const targetValTwd = enabledTotalValue > 0 && isEnabled 
        ? enabledTotalValue * (targetPct / 100) 
        : (isEnabled ? totalPortfolioValue * (targetPct / 100) : merged.totalValTwd);
      const diffValTwd = targetValTwd - merged.totalValTwd;
      
      let diffShares = 0;
      if (isEnabled && merged.totalValTwd > 0 && merged.totalQuantity > 0) {
        const twdPerShare = merged.totalValTwd / merged.totalQuantity;
        diffShares = twdPerShare > 0 ? diffValTwd / twdPerShare : 0;
      }

      return {
        mergedKey,
        accountIds: merged.accountIds,
        ticker: merged.ticker,
        market: merged.market,
        currentPrice: avgPrice,
        valTwd: merged.totalValTwd,
        quantity: merged.totalQuantity,
        currentPct,
        targetPct,
        targetValTwd,
        diffValTwd,
        diffShares,
        isEnabled,
        holdings: merged.holdings // 保留原始 holdings 用於顯示帳戶資訊
      };
    });
  }, [holdings, accounts, targets, totalPortfolioValue, exchangeRate, jpyExchangeRate, enabledItems, summary.cashBalanceTWD, rates]);

  // Calculate totals - 只計算啟用的項目
  const enabledRows = rebalanceRows.filter(row => row.isEnabled);
  const isCashEnabled = enabledItems.has('cash');
  
  // 計算參與平衡的總價值（用於計算現金百分比）
  const enabledTotalValue = enabledRows.reduce((sum, row) => sum + row.valTwd, 0) + (isCashEnabled ? summary.cashBalanceTWD : 0);
  
  const totalTargetPct = enabledRows.reduce((acc, row) => acc + row.targetPct, 0);
  // 如果有手動設置的現金目標，使用該值；否則使用自動計算的值（100 - totalTargetPct）
  const cashTargetPct = isCashEnabled 
    ? (targets['cash'] !== undefined ? targets['cash'] : (100 - totalTargetPct))
    : 0;
  // 現金目標價值：基於參與平衡的總價值計算
  const targetCashTwd = isCashEnabled && enabledTotalValue > 0
    ? enabledTotalValue * (cashTargetPct / 100)
    : summary.cashBalanceTWD;
  const diffCashTwd = isCashEnabled ? (targetCashTwd - summary.cashBalanceTWD) : 0;
  
  // 現金當前百分比（參與平衡內）
  const cashCurrentPctEnabled = isCashEnabled && enabledTotalValue > 0
    ? (summary.cashBalanceTWD / enabledTotalValue) * 100
    : (totalPortfolioValue > 0 ? (summary.cashBalanceTWD / totalPortfolioValue) * 100 : 0);

  const displayCurrencyCode = showInUSD ? 'USD' : baseCurrency;

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      <div className="app-section-card p-4 sm:p-6 min-w-0 max-w-full">
        <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:justify-between lg:items-start">
          <h3 className="font-bold text-lg text-slate-800 shrink-0">{translations.rebalance.title}</h3>
          <div className="flex flex-col gap-3 min-w-0 w-full lg:w-auto lg:items-end">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 w-full lg:justify-end">
              {/* 貨幣切換開關 */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="hidden sm:inline text-sm text-slate-600 shrink-0">{translations.dashboard.displayCurrency}:</span>
                <div className={SEGMENT_PILL_CLASS}>
                  <button
                    type="button"
                    onClick={() => setShowInUSD(false)}
                    className={`${SEGMENT_BTN_CLASS} ${
                      !showInUSD
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    {baseCurrency}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInUSD(true)}
                    className={`${SEGMENT_BTN_CLASS} ${
                      showInUSD
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    {translations.dashboard.usd}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetToCurrent}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded border border-slate-300 transition whitespace-normal text-left max-w-full"
              >
                ↺ {translations.rebalance.resetToCurrent}
              </button>
            </div>
            <div className="text-left lg:text-right min-w-0">
              <p className="text-xs text-slate-500 break-words">{translations.rebalance.totalAssets}</p>
              <p className="text-lg sm:text-xl font-bold font-mono text-slate-800 break-all">
                {formatCurrency(showInUSD ? enabledTotalValue / summary.exchangeRateUsdToTwd : toBase(enabledTotalValue), displayCurrencyCode)}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 max-w-full">
          <table className="w-full min-w-[52rem] border-collapse text-xs sm:text-sm text-left">
            <thead className="text-slate-500 font-medium border-b border-slate-100">
              <tr>
                <th className="px-2 sm:px-3 py-2 w-12 whitespace-nowrap">{translations.rebalance.enable}</th>
                <th className="px-2 sm:px-3 py-2 min-w-[7rem] whitespace-normal leading-tight">{translations.rebalance.symbol} {translations.rebalance.accountLabel}</th>
                <th className="px-2 sm:px-3 py-2 text-right whitespace-normal leading-tight">{translations.rebalance.currentPrice}</th>
                <th className="px-2 sm:px-3 py-2 text-right whitespace-normal leading-tight">{translations.rebalance.currentValue} ({displayCurrencyCode})</th>
                <th className="px-2 sm:px-3 py-2 text-right whitespace-normal leading-tight">{translations.rebalance.currentWeight}</th>
                <th className="px-2 sm:px-3 py-2 text-right w-28 sm:w-36 whitespace-normal leading-tight">{translations.rebalance.targetWeight} %</th>
                <th className="px-2 sm:px-3 py-2 text-right whitespace-normal leading-tight">{translations.rebalance.targetValue}</th>
                <th className="px-2 sm:px-3 py-2 text-right whitespace-normal leading-tight">{translations.rebalance.adjustAmount}</th>
                <th className="px-2 sm:px-3 py-2 text-right min-w-[6rem] whitespace-normal leading-tight">{translations.rebalance.suggestedAction} {translations.rebalance.sharesLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rebalanceRows.map(row => {
                const isBuy = row.diffValTwd > 0;
                const isEnabled = row.isEnabled;
                const accountInfo = row.accountIds.length > 1 
                  ? ` (${row.accountIds.length}${translations.rebalance.accountCount})` 
                  : '';
                
                // 根據貨幣切換狀態計算顯示的金額
                const displayCurrency = displayCurrencyCode;
                const displayVal = showInUSD ? row.valTwd / summary.exchangeRateUsdToTwd : toBase(row.valTwd);
                const displayTargetVal = showInUSD ? row.targetValTwd / summary.exchangeRateUsdToTwd : toBase(row.targetValTwd);
                const displayDiffVal = showInUSD ? row.diffValTwd / summary.exchangeRateUsdToTwd : toBase(row.diffValTwd);
                
                return (
                  <tr key={row.mergedKey} className={`border-b border-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/40 ${!isEnabled ? 'opacity-50' : ''}`}>
                    <td className="px-2 sm:px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => handleToggleItem(row.mergedKey)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-2 sm:px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                      <div className="flex items-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded mr-2 ${
                          row.market === Market.US ? 'bg-blue-100 text-blue-800' : 
                          row.market === Market.UK ? 'bg-purple-100 text-purple-800' : 
                          row.market === Market.JP ? 'bg-orange-100 text-orange-800' :
                          row.market === Market.CN ? 'bg-amber-100 text-amber-800' :
                          row.market === Market.SZ ? 'bg-amber-200 text-amber-900' :
                          row.market === Market.IN ? 'bg-teal-100 text-teal-800' :
                          row.market === Market.CA ? 'bg-rose-100 text-rose-800' :
                          row.market === Market.FR ? 'bg-indigo-100 text-indigo-800' :
                          row.market === Market.HK ? 'bg-sky-100 text-sky-800' :
                          row.market === Market.KR ? 'bg-orange-100 text-orange-800' :
                          row.market === Market.DE ? 'bg-yellow-100 text-yellow-800' :
                          row.market === Market.AU ? 'bg-lime-100 text-lime-800' :
                          row.market === Market.SA ? 'bg-emerald-100 text-emerald-800' :
                          row.market === Market.BR ? 'bg-cyan-100 text-cyan-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {row.market}
                        </span>
                        <span className="text-slate-800 dark:text-slate-100">{row.ticker}</span>
                        {accountInfo && (
                          <span className="ml-2 text-xs text-slate-500">{accountInfo}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right text-slate-500 dark:text-slate-300">
                      {row.currentPrice.toFixed(2)}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {formatCurrency(displayVal, displayCurrency)}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right text-slate-500">
                      {row.currentPct.toFixed(1)}%
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right">
                      <div className="flex justify-end items-center">
                        <input 
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.]?[0-9]*"
                          className={`w-24 text-right border-2 rounded px-2 py-1 text-base sm:text-sm focus:ring-2 focus:ring-accent focus:border-accent font-bold ${
                            isEnabled 
                              ? 'border-indigo-100 text-slate-700 bg-white' 
                              : 'border-slate-200 text-slate-400 bg-slate-50'
                          }`}
                          value={row.targetPct === 0 ? '' : row.targetPct}
                          onChange={(e) => handleTargetChange(row.mergedKey, e.target.value, row.accountIds, row.ticker)}
                          disabled={!isEnabled}
                        />
                      </div>
                    </td>
                    <td className={`px-2 sm:px-3 py-2 text-right ${isEnabled ? 'text-slate-500' : 'text-slate-300'}`}>
                       {formatCurrency(displayTargetVal, displayCurrency)}
                    </td>
                    <td className={`px-2 sm:px-3 py-2 text-right font-medium ${isEnabled ? (isBuy ? 'text-red-600' : 'text-green-600') : 'text-slate-300'}`}>
                      {formatCurrency(displayDiffVal, displayCurrency)}
                    </td>
                    <td className={`px-2 sm:px-3 py-2 text-right font-bold ${isEnabled ? (isBuy ? 'text-red-600' : 'text-green-600') : 'text-slate-300'}`}>
                      {isEnabled ? (
                        <span>
                          {isBuy ? translations.rebalance.buy : translations.rebalance.sell} {Math.abs(row.diffShares).toFixed(row.market === Market.US || row.market === Market.UK || row.market === Market.CA || row.market === Market.FR ? 2 : 0)}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              
              {/* Cash Row */}
              <tr className={`border-b border-slate-100 font-medium ${!isCashEnabled ? 'opacity-50' : ''}`}>
                <td className="px-2 sm:px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={isCashEnabled}
                    onChange={() => handleToggleItem('cash')}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                </td>
                <td className="px-2 sm:px-3 py-2 text-slate-700">{translations.rebalance.cash}</td>
                <td className="px-2 sm:px-3 py-2 text-right">-</td>
                <td className="px-2 sm:px-3 py-2 text-right font-mono">
                  {formatCurrency(showInUSD ? summary.cashBalanceTWD / summary.exchangeRateUsdToTwd : toBase(summary.cashBalanceTWD), displayCurrencyCode)}
                </td>
                <td className="px-2 sm:px-3 py-2 text-right">{cashCurrentPctEnabled.toFixed(1)}%</td>
                <td className="px-2 sm:px-3 py-2 text-right">
                  <div className="flex justify-end items-center">
                    <input 
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*[.]?[0-9]*"
                      className={`w-24 text-right border-2 rounded px-2 py-1 text-base sm:text-sm focus:ring-2 focus:ring-accent focus:border-accent font-bold ${
                        isCashEnabled 
                          ? (cashTargetPct < 0 ? 'border-red-300 text-red-600 bg-red-50' : 'border-indigo-100 text-slate-700 bg-white') 
                          : 'border-slate-200 text-slate-400 bg-slate-50'
                      }`}
                      value={isCashEnabled ? (cashTargetPct === 0 ? '' : cashTargetPct) : ''}
                      onChange={(e) => handleTargetChange('cash', e.target.value, [], '')}
                      disabled={!isCashEnabled}
                    />
                  </div>
                </td>
                <td className={`px-2 sm:px-3 py-2 text-right ${isCashEnabled ? '' : 'text-slate-300'}`}>
                  {formatCurrency(showInUSD ? targetCashTwd / summary.exchangeRateUsdToTwd : toBase(targetCashTwd), displayCurrencyCode)}
                </td>
                <td className={`px-2 sm:px-3 py-2 text-right ${isCashEnabled ? (diffCashTwd > 0 ? 'text-blue-600' : 'text-slate-500') : 'text-slate-300'}`}>
                  {formatCurrency(showInUSD ? diffCashTwd / summary.exchangeRateUsdToTwd : toBase(diffCashTwd), displayCurrencyCode)}
                </td>
                <td className="px-2 sm:px-3 py-2 text-right text-xs text-slate-400 whitespace-normal leading-tight">
                  {isCashEnabled ? `(${translations.rebalance.remainingFunds})` : `(${translations.rebalance.notParticipating})`}
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-100 font-bold border-t border-slate-100">
               <tr>
                 <td colSpan={5} className="px-2 sm:px-3 py-2 text-right whitespace-normal leading-tight">{translations.rebalance.totalLabel}{translations.rebalance.totalEnabled})</td>
                 <td className={`px-2 sm:px-3 py-2 text-right ${Math.abs(totalTargetPct + cashTargetPct - 100) > 0.01 ? 'text-red-600' : 'text-slate-800'}`}>
                   {(totalTargetPct + cashTargetPct).toFixed(2)}%
                 </td>
                 <td colSpan={3}></td>
               </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800 break-words">
           <p className="font-bold mb-1">💡 {translations.rebalance.description}</p>
           <ul className="list-disc pl-5 space-y-1">
             <li>{translations.rebalance.description1}</li>
             <li>{translations.rebalance.description2}</li>
             <li>{translations.rebalance.description3}</li>
             <li>{translations.rebalance.description4}</li>
             <li>{translations.rebalance.description5}</li>
             <li>{translations.rebalance.description6}</li>
           </ul>
        </div>
      </div>
    </div>
  );
};

export default RebalanceView;
