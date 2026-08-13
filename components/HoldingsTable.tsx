
import React, { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import RefreshCountdown from './RefreshCountdown';
import { Holding, Market, Account, Currency, TransactionType, Transaction } from '../types';
import {
  formatCurrency,
  valuationCurrencyForHolding,
  calculateGenericXIRR,
} from '../utils/calculations';
import { t } from '../utils/i18n';
import { formatHoldingPrice } from '../utils/formatDisplay';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useUI } from '../contexts/UIContext';

interface Props {}

type DisplayMode = 'merged' | 'detailed';

/** 比例由 colgroup 決定；勿再加 max-w，否則無法撐滿容器 */
const CELL_PAD = 'px-2 py-2';
const HOLDINGS_TABLE_MIN_WIDTH = '62rem';
const MARKET_WIDTH_PCT = '6.45%';
const MARKET_TICKER_WIDTH_PCT = '14.51%';

function sanitizeAnnualized(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (Math.abs(v) > 500) return 0;
  return v;
}

function resolveTxCost(tx: Transaction): number {
  let baseVal = tx.price * tx.quantity;
  if (tx.market === Market.TW) baseVal = Math.floor(baseVal);
  if (Number.isFinite(tx.amount) && (tx.amount as number) > 0) return tx.amount as number;
  return baseVal + (tx.fees || 0);
}

function resolveTxProceeds(tx: Transaction): number {
  let baseVal = tx.price * tx.quantity;
  if (tx.market === Market.TW) baseVal = Math.floor(baseVal);
  if (Number.isFinite(tx.amount) && (tx.amount as number) > 0) return tx.amount as number;
  return baseVal - (tx.fees || 0);
}

function computeMergedAnnualizedXirr(
  market: Market,
  ticker: string,
  transactions: Transaction[],
  outValue: number
): number {
  if (outValue <= 0) return 0;
  const flows: { amount: number; date: number }[] = [];
  const targetTicker = ticker.toUpperCase();

  transactions.forEach(tx => {
    if (tx.market !== market) return;
    if (tx.ticker.toUpperCase() !== targetTicker) return;
    const date = new Date(tx.date).getTime();
    if (!Number.isFinite(date)) return;
    if (tx.type === TransactionType.BUY) {
      flows.push({ amount: -resolveTxCost(tx), date });
      return;
    }
    if (tx.type === TransactionType.SELL || tx.type === TransactionType.CASH_DIVIDEND) {
      flows.push({ amount: resolveTxProceeds(tx), date });
    }
  });

  const invested = flows.some(f => f.amount < 0);
  if (!invested) return 0;
  const xirr = calculateGenericXIRR([...flows, { amount: outValue, date: Date.now() }]);
  return sanitizeAnnualized(xirr);
}

const HoldingsTable: React.FC<Props> = () => {
  const { holdings, accounts, transactions,
    handleAutoUpdatePrices: onAutoUpdate, refreshIntervalMs, nextRefreshAt } = usePortfolio();
  const { language } = useUI();
  const translations = t(language);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('merged');
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(() => new Set());
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorTopRef = useRef<number | null>(null);
  const scrollLeftRef = useRef(0);

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    if (mode === displayMode) return;
    if (cardRef.current) {
      scrollAnchorTopRef.current = cardRef.current.getBoundingClientRect().top;
    }
    if (scrollContainerRef.current) {
      scrollLeftRef.current = scrollContainerRef.current.scrollLeft;
    }
    if (mode !== 'detailed') {
      setExpandedAccountIds(new Set());
    }
    setDisplayMode(mode);
  }, [displayMode]);

  const toggleAccountExpanded = useCallback((accountId: string) => {
    setExpandedAccountIds(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }, []);

  // 切換模式後補償高度差，避免整頁跳動
  useLayoutEffect(() => {
    const anchorTop = scrollAnchorTopRef.current;
    if (anchorTop === null || !cardRef.current) return;

    const delta = cardRef.current.getBoundingClientRect().top - anchorTop;
    if (Math.abs(delta) > 0.5) {
      window.scrollBy(0, delta);
    }
    scrollAnchorTopRef.current = null;

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollLeftRef.current;
    }
  }, [displayMode]);

  // ⑤ Sortable columns
  type SortKey = 'weight' | 'unrealizedPL' | 'unrealizedPLPercent' | 'annualizedReturn' | 'dailyChangePercent' | 'currentValue';
  const [sortKey, setSortKey] = useState<SortKey>('weight');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  // 跟隨頁面實際 dark class，避免與 DarkModeToggle（localStorage + html.dark）不同步
  useEffect(() => {
    const readFromDom = () => document.documentElement.classList.contains('dark');
    setIsDarkMode(readFromDom());

    const observer = new MutationObserver(() => {
      setIsDarkMode(readFromDom());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className={`ml-0.5 text-[10px] ${sortKey === col ? 'text-indigo-500' : 'text-slate-300'}`}>
      {sortKey === col ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  );

  // 合併相同標的 (Ticker + Market) 的持倉
  const mergedHoldings = useMemo(() => {
    const map = new Map<string, Holding>();

    const MS = '\x1e';
    holdings.forEach(h => {
      // 不同證券戶幣別不可合併加總市值（幣別維度不同）
      const key = `${h.market}${MS}${h.ticker}${MS}${valuationCurrencyForHolding(h, accounts)}`;
      if (!map.has(key)) {
        map.set(key, { ...h, accountId: `merged${MS}${key}` });
      } else {
        const existing = map.get(key)!;
        
        const newQuantity = existing.quantity + h.quantity;
        const newTotalCost = existing.totalCost + h.totalCost;
        const newCurrentValue = existing.currentValue + h.currentValue;
        const newUnrealizedPL = existing.unrealizedPL + h.unrealizedPL;
        const newWeight = existing.weight + h.weight;
        
        // Recalculate derived fields
        const newAvgCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;
        const newUnrealizedPLPercent = newTotalCost > 0 ? (newUnrealizedPL / newTotalCost) * 100 : 0;

        const earliestFirstBuyDate = [existing.firstBuyDate, h.firstBuyDate]
          .filter((d): d is string => Boolean(d))
          .sort()[0];

        // Daily Change should be the same for same ticker. 
        // Take from existing (or new, they should match).
        
        map.set(key, {
          ...existing,
          quantity: newQuantity,
          totalCost: newTotalCost,
          currentValue: newCurrentValue,
          unrealizedPL: newUnrealizedPL,
          weight: newWeight,
          avgCost: newAvgCost,
          unrealizedPLPercent: newUnrealizedPLPercent,
          annualizedReturn: existing.annualizedReturn,
          firstBuyDate: earliestFirstBuyDate,
        });
      }
    });

    const merged = Array.from(map.entries()).map(([key, h]) => {
      const annualizedReturn = computeMergedAnnualizedXirr(
        h.market,
        h.ticker,
        transactions,
        h.currentValue
      );
      return { ...h, annualizedReturn };
    });

    // Sort by Weight Descending
    return merged.sort((a, b) => b.weight - a.weight);
  }, [holdings, accounts, transactions]);

  // ⑤ Apply sort to mergedHoldings
  const sortedMergedHoldings = useMemo(() => {
    return [...mergedHoldings].sort((a, b) => {
      const av = (a[sortKey as keyof typeof a] as number) ?? 0;
      const bv = (b[sortKey as keyof typeof b] as number) ?? 0;
      return sortAsc ? av - bv : bv - av;
    });
  }, [mergedHoldings, sortKey, sortAsc]);

  // 明細顯示：依帳戶分組
  const groupedByAccount = useMemo(() => {
    const accountMap = new Map<string, { account: Account; holdings: Holding[] }>();
    
    // 建立帳戶映射
    accounts.forEach(acc => {
      accountMap.set(acc.id, { account: acc, holdings: [] });
    });
    
    // 將持倉分配到對應帳戶
    holdings.forEach(h => {
      const group = accountMap.get(h.accountId);
      if (group) {
        group.holdings.push(h);
      } else {
        // 如果找不到帳戶，建立一個臨時群組
        accountMap.set(h.accountId, {
          account: { id: h.accountId, name: h.accountId, currency: Currency.TWD, isSubBrokerage: false, balance: 0 },
          holdings: [h]
        });
      }
    });
    
    // 過濾掉沒有持倉的帳戶，並按帳戶名稱排序
    return Array.from(accountMap.values())
      .filter(group => group.holdings.length > 0)
      .sort((a, b) => a.account.name.localeCompare(b.account.name))
      .map(group => ({
        ...group,
        holdings: group.holdings.sort((a, b) => b.weight - a.weight)
      }));
  }, [holdings, accounts]);

  const handleAutoUpdateClick = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
      try {
      await onAutoUpdate();
    } catch (error) {
      alert(language === 'zh-TW' ? "更新失敗，請確認網路或 API Key。" : "Update failed. Please check your network or API Key.");
    } finally {
      setIsUpdating(false);
    }
  };

  function marketNativeCurrency(m: Market): string {
    return m === Market.TW ? 'TWD' : m === Market.JP ? 'JPY' : m === Market.CN ? 'CNY' : m === Market.SZ ? 'CNY' : m === Market.IN ? 'INR' : m === Market.CA ? 'CAD' : m === Market.FR ? 'EUR' : m === Market.HK ? 'HKD' : m === Market.KR ? 'KRW' : m === Market.DE ? 'EUR' : m === Market.AU ? 'AUD' : m === Market.SA ? 'SAR' : m === Market.BR ? 'BRL' : m === Market.UK ? 'GBP' : 'USD';
  }

  const MS_ROW = '\x1e';

  function renderHoldingRow(h: Holding, isDetailedMode: boolean = false) {
    const isProfit = h.unrealizedPL >= 0;
    const mergedCurrency =
      h.accountId.startsWith('merged') && h.accountId.includes(MS_ROW)
        ? h.accountId.split(MS_ROW).slice(-1)[0]
        : null;
    const acc = accounts.find(a => a.id === h.accountId);
    const currency = isDetailedMode && acc
      ? String(acc.currency)
      : mergedCurrency ?? marketNativeCurrency(h.market);
    const plColor = isProfit ? 'text-success' : 'text-danger';
    const roiColor = h.annualizedReturn >= 0 ? 'text-blue-600' : 'text-orange-600';
    const dailyChangeColor = h.dailyChange !== undefined && h.dailyChange !== null
      ? (h.dailyChange >= 0 ? 'text-success' : 'text-danger')
      : 'text-slate-500';
    const uniqueKey = `${h.accountId}-${h.market}-${h.ticker}`;

    const displayCurrentPrice = Number.isFinite(h.currentPrice)
      ? Number(h.currentPrice.toFixed(2))
      : 0;

    return (
      <tr
        key={uniqueKey}
        className={`transition-colors group ${
          isDetailedMode
            ? isDarkMode
              ? 'bg-slate-800/50'
              : 'bg-slate-50/30'
            : ''
        }`}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = isDarkMode ? '#334155' : '#f1f5f9';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '';
        }}
      >
        <td className={`${CELL_PAD} sticky left-0 z-10 bg-white dark:bg-slate-800`}>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border ${
            h.market === Market.US ? 'bg-blue-50 text-blue-600 border-blue-100' :
            h.market === Market.UK ? 'bg-purple-50 text-purple-600 border-purple-100' :
            h.market === Market.JP ? 'bg-orange-50 text-orange-600 border-orange-100' :
            h.market === Market.CN ? 'bg-amber-50 text-amber-600 border-amber-100' :
            h.market === Market.HK ? 'bg-sky-50 text-sky-600 border-sky-100' :
            h.market === Market.KR ? 'bg-orange-50 text-orange-600 border-orange-100' :
            h.market === Market.DE ? 'bg-yellow-50 text-yellow-600 border-yellow-100' :
            h.market === Market.AU ? 'bg-lime-50 text-lime-600 border-lime-100' :
            h.market === Market.SA ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
            h.market === Market.BR ? 'bg-cyan-50 text-cyan-600 border-cyan-100' :
            h.market === Market.IN ? 'bg-teal-50 text-teal-600 border-teal-100' :
            h.market === Market.CA ? 'bg-rose-50 text-rose-600 border-rose-100' :
            h.market === Market.FR ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
            'bg-green-50 text-green-600 border-green-100'
          }`}>
            {h.market}
          </span>
        </td>

        <td
          className={`${CELL_PAD} sticky z-10 bg-white dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-100 truncate`}
          style={{ left: MARKET_WIDTH_PCT }}
        >
          {h.ticker}
        </td>

        <td className={`${CELL_PAD} text-right font-mono transition-colors text-slate-600 dark:text-slate-100 text-xs sm:text-sm`}>
          {(() => {
            const num = h.quantity;
            if (num % 1 === 0) {
              return num.toLocaleString('en-US');
            }
            const fixed = num.toFixed(5);
            return fixed.replace(/\.?0+$/, '');
          })()}
        </td>

        <td className={`${CELL_PAD} text-right font-mono tabular-nums text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100`}>
          {formatHoldingPrice(displayCurrentPrice, currency)}
        </td>

        <td className={CELL_PAD}>
          <div className="flex flex-col gap-1">
            <span
              className={`text-xs font-medium text-right ${
                isDarkMode ? 'text-[#94a3b8]' : 'text-[#475569] group-hover:text-[#1e293b]'
              }`}
            >
              {h.weight.toFixed(1)}%
            </span>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  h.market === Market.US ? 'bg-blue-400' :
                  h.market === Market.UK ? 'bg-purple-400' :
                  h.market === Market.JP ? 'bg-orange-400' :
                  h.market === Market.CN ? 'bg-amber-400' :
                  h.market === Market.SZ ? 'bg-amber-500' :
                  h.market === Market.IN ? 'bg-teal-400' :
                  h.market === Market.CA ? 'bg-rose-400' :
                  h.market === Market.FR ? 'bg-indigo-400' :
                  'bg-green-400'
                }`}
                style={{ width: `${Math.min(h.weight, 100)}%` }}
              ></div>
            </div>
          </div>
        </td>

        <td className={`${CELL_PAD} text-right font-medium text-slate-600 dark:text-slate-100`}>
          {formatCurrency(h.totalCost, currency)}
        </td>

        <td
          className={`${CELL_PAD} text-right font-medium`}
          style={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
        >
          {formatCurrency(h.currentValue, currency)}
        </td>

        <td className={`${CELL_PAD} text-right font-bold ${plColor}`}>
          <div className="flex flex-col items-end leading-tight">
            <span>{formatCurrency(h.unrealizedPL, currency)}</span>
            <span className="text-[10px] opacity-80">{isProfit ? '+' : ''}{h.unrealizedPLPercent.toFixed(2)}%</span>
          </div>
        </td>

        <td className={`${CELL_PAD} text-right font-bold ${roiColor}`}>
          {h.annualizedReturn && h.annualizedReturn !== 0 ? `${h.annualizedReturn.toFixed(1)}%` : '-'}
        </td>

        <td className={`${CELL_PAD} text-right text-xs font-bold ${dailyChangeColor}`}>
          {h.dailyChange !== undefined && h.dailyChange !== null ? (
             <div className="flex flex-col items-end">
               <span>{h.dailyChange > 0 ? '+' : ''}{h.dailyChange.toFixed(2)}</span>
               {h.dailyChangePercent !== undefined && h.dailyChangePercent !== null && (
                 <span className="opacity-75">({h.dailyChangePercent > 0 ? '+' : ''}{h.dailyChangePercent.toFixed(2)}%)</span>
               )}
             </div>
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </td>

        <td className={`${CELL_PAD} text-right text-xs text-slate-600 dark:text-slate-100`}>
           {new Intl.NumberFormat('zh-TW', {
              style: 'currency',
              currency: currency,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
           }).format(h.avgCost)}
        </td>
      </tr>
    );
  }

  const tableBody = displayMode === 'merged' ? (
    sortedMergedHoldings.length === 0 ? (
      <tr>
        <td colSpan={11} className="px-3 py-6 text-center text-slate-400">
          {translations.holdings.noHoldings}
        </td>
      </tr>
    ) : (
      sortedMergedHoldings.map((h) => renderHoldingRow(h))
    )
  ) : (
    groupedByAccount.length === 0 ? (
      <tr>
        <td colSpan={11} className="px-3 py-6 text-center text-slate-400">
          {translations.holdings.noHoldings}
        </td>
      </tr>
    ) : (
      groupedByAccount.map((group) => {
        const account = group.account;
        const accountHoldings = group.holdings;
        const isExpanded = expandedAccountIds.has(account.id);

        const accountTotalCost = accountHoldings.reduce((sum, h) => sum + h.totalCost, 0);
        const accountTotalValue = accountHoldings.reduce((sum, h) => sum + h.currentValue, 0);
        const accountTotalPL = accountHoldings.reduce((sum, h) => sum + h.unrealizedPL, 0);
        const accountTotalWeight = accountHoldings.reduce((sum, h) => sum + h.weight, 0);
        const currency = String(account.currency);

        return (
          <React.Fragment key={account.id}>
            <tr
              className="bg-slate-700 text-white font-bold cursor-pointer select-none hover:bg-slate-600 transition-colors"
              onClick={() => toggleAccountExpanded(account.id)}
              aria-expanded={isExpanded}
            >
              <td
                colSpan={2}
                className={`${CELL_PAD} sticky left-0 z-20 bg-inherit`}
                style={{ width: MARKET_TICKER_WIDTH_PCT }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-md bg-white/10 hover:bg-white/20 transition"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAccountExpanded(account.id);
                    }}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </button>
                  <span className="truncate">{account.name}</span>
                  <span className="text-xs font-normal opacity-75 shrink-0">({account.currency})</span>
                  <span className="text-[10px] font-normal opacity-70 shrink-0">· {accountHoldings.length}</span>
                  <span className={`ml-auto text-[10px] font-normal opacity-80 shrink-0 ${isExpanded ? '' : 'opacity-60'}`}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                </div>
              </td>
              <td className={`${CELL_PAD} text-right`}>-</td>
              <td className={`${CELL_PAD} text-right`}>-</td>
              <td className={`${CELL_PAD} text-right`}>{accountTotalWeight.toFixed(1)}%</td>
              <td className={`${CELL_PAD} text-right`}>{formatCurrency(accountTotalCost, currency)}</td>
              <td className={`${CELL_PAD} text-right`}>{formatCurrency(accountTotalValue, currency)}</td>
              <td className={`${CELL_PAD} text-right ${accountTotalPL >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {formatCurrency(accountTotalPL, currency)}
              </td>
              <td className={`${CELL_PAD} text-right`}>-</td>
              <td className={`${CELL_PAD} text-right`}>-</td>
              <td className={`${CELL_PAD} text-right`}>-</td>
            </tr>
            {isExpanded && accountHoldings.map((h) => renderHoldingRow(h, true))}
          </React.Fragment>
        );
      })
    )
  );

  return (
    <div
      ref={cardRef}
      className="bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden border border-slate-100 dark:border-slate-700"
    >
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center flex-wrap gap-2 bg-slate-50 dark:bg-slate-800">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          {translations.holdings.portfolioHoldings}
        </h3>
        <div className="flex items-center gap-2">
          {/* 切換顯示模式按鈕 */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 p-1">
            <button
              onClick={() => handleDisplayModeChange('merged')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                displayMode === 'merged'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {translations.holdings.mergedDisplay}
            </button>
            <button
              onClick={() => handleDisplayModeChange('detailed')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                displayMode === 'detailed'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {translations.holdings.detailedDisplay}
            </button>
          </div>
          <RefreshCountdown
            intervalMs={refreshIntervalMs}
            nextRefreshAt={nextRefreshAt}
            onManualRefresh={handleAutoUpdateClick}
            isRefreshing={isUpdating}
            label={translations.holdings.aiUpdatePrices}
          />
        </div>
      </div>
      <div
        ref={scrollContainerRef}
        className="overflow-auto max-h-[min(65vh,36rem)]"
        style={{ scrollbarGutter: 'stable' }}
      >
        <table
          className="w-full table-fixed text-sm text-left"
          style={{ minWidth: HOLDINGS_TABLE_MIN_WIDTH }}
        >
          <colgroup>
            <col style={{ width: '6.45%' }} />
            <col style={{ width: '8.06%' }} />
            <col style={{ width: '8.47%' }} />
            <col style={{ width: '8.06%' }} />
            <col style={{ width: '8.06%' }} />
            <col style={{ width: '12.1%' }} />
            <col style={{ width: '12.1%' }} />
            <col style={{ width: '12.1%' }} />
            <col style={{ width: '5.24%' }} />
            <col style={{ width: '9.27%' }} />
            <col style={{ width: '10.09%' }} />
          </colgroup>
          {/* 凍結標題列：垂直／水平捲動時表頭固定 */}
          <thead className="text-slate-500 dark:text-slate-300 text-sm uppercase font-bold tracking-wider">
            <tr>
              <th className={`${CELL_PAD} sticky top-0 left-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700`}>{translations.holdings.market}</th>
              <th
                className={`${CELL_PAD} sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700`}
                style={{ left: MARKET_WIDTH_PCT }}
              >{translations.holdings.ticker}</th>
              <th className={`${CELL_PAD} sticky top-0 z-20 text-right bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700`}>{translations.holdings.quantity}</th>
              <th className={`${CELL_PAD} sticky top-0 z-20 text-right bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700`}>{translations.holdings.currentPrice}</th>
              <th
                className={`${CELL_PAD} sticky top-0 z-20 text-right bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:text-indigo-600 select-none`}
                onClick={() => handleSort('weight')}
              >{translations.holdings.weight}<SortIcon col="weight" /></th>
              <th className={`${CELL_PAD} sticky top-0 z-20 text-right bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700`}>{translations.holdings.cost}</th>
              <th
                className={`${CELL_PAD} sticky top-0 z-20 text-right bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:text-indigo-600 select-none`}
                onClick={() => handleSort('currentValue')}
              >{translations.holdings.marketValue}<SortIcon col="currentValue" /></th>
              <th
                className={`${CELL_PAD} sticky top-0 z-20 text-right bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:text-indigo-600 select-none`}
                onClick={() => handleSort('unrealizedPL')}
              >{translations.holdings.profitLoss}<SortIcon col="unrealizedPL" /></th>
              <th
                className={`${CELL_PAD} sticky top-0 z-20 text-right bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:text-indigo-600 select-none`}
                onClick={() => handleSort('annualizedReturn')}
              >{translations.holdings.annualizedROI}<SortIcon col="annualizedReturn" /></th>
              <th
                className={`${CELL_PAD} sticky top-0 z-20 text-right bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:text-indigo-600 select-none`}
                onClick={() => handleSort('dailyChangePercent')}
              >{translations.holdings.dailyChange}<SortIcon col="dailyChangePercent" /></th>
              <th className={`${CELL_PAD} sticky top-0 z-20 text-right bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700`}>{translations.holdings.avgPrice}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {tableBody}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HoldingsTable;
