import React, { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Market, Transaction, TransactionType } from '../types';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useMarket } from '../contexts/MarketContext';
import { useUI } from '../contexts/UIContext';
import { transactionAmountNativeToTWD, valueInBaseCurrency, cashDividendNetNative } from '../utils/calculations';
import { t, translate } from '../utils/i18n';
import { useActualDividends } from '../hooks/useActualDividends';
import type {
  ActualDividendRecord,
  TwEtfDistributionComposition,
} from '../services/moneydjService';
import {
  listAccountTickerQuantitiesAtExDate,
  tickerHasRecordedCashDividendInExMonth,
} from '../utils/dividendMatching';
import { formatLocalYmd } from '../utils/recurringDeposits';
import {
  persistDismissedPendingDividendKeys,
  persistPendingDividendListVisible,
  PENDING_DIVIDEND_DISMISSALS_CHANGED_EVENT,
  readDismissedPendingDividendKeys,
  readPendingDividendListVisible,
} from '../utils/pendingDividendDismissals';
import {
  dividendScheduleMapKey,
  marketToYahooMarketForDividends,
  TW_DIVIDEND_CROSS_BANK_WIRE_FEE_TWD,
  cashDividendBreakdownForMarket,
  formatCashDividendNativeAmountForMarket,
  formatUsDividendNativeAmount,
  getAccountUsDividendWithholdingRate,
  getMarketWithholdingReferenceRatePercent,
  marketCashDividendPriceIsNetAfterWithholding,
  netPriceMarketCashDividendSaveFields,
  readTransactionStatutoryWithholding,
  twEstimatedSingleDividendTwd,
  twEtfNhiEligibleIncomeTwd,
} from '../utils/dividendTaxHelpers';
import { FORM_FIELD_THEME } from '../utils/formFieldClasses';

function formatGrossForConfirmEdit(market: Market, grossNative: number): string {
  if (!Number.isFinite(grossNative) || grossNative <= 0) return '0';
  if (market === Market.US) return formatUsDividendNativeAmount(grossNative);
  return String(Math.round(grossNative));
}

function normalizeGrossForConfirm(market: Market, grossNative: number): number {
  if (!Number.isFinite(grossNative) || grossNative <= 0) return 0;
  if (market === Market.US) return Math.round(grossNative * 100) / 100;
  return Math.round(grossNative);
}

/** 試算實領步進：台日韓印整數元，其餘 0.01 */
const INTEGER_NET_MARKETS = new Set<Market>([Market.TW, Market.JP, Market.KR, Market.IN]);

function confirmNetUsesIntegerStep(market: Market): boolean {
  return INTEGER_NET_MARKETS.has(market);
}

function confirmNetStep(market: Market): number {
  return confirmNetUsesIntegerStep(market) ? 1 : 0.01;
}

function confirmNetInputPattern(market: Market): RegExp {
  return confirmNetUsesIntegerStep(market) ? /^\d+$/ : /^\d*\.?\d{0,2}$/;
}

function normalizeNetForConfirm(market: Market, value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (confirmNetUsesIntegerStep(market)) return Math.round(value);
  return Math.round(value * 100) / 100;
}

function formatNetForConfirmEdit(market: Market, netNative: number): string {
  if (!Number.isFinite(netNative) || netNative <= 0) {
    return confirmNetUsesIntegerStep(market) ? '0' : '0.00';
  }
  if (confirmNetUsesIntegerStep(market)) return String(Math.round(netNative));
  return normalizeNetForConfirm(market, netNative).toFixed(2);
}

function confirmNetGrossCap(market: Market, gross: number): number {
  if (!Number.isFinite(gross) || gross <= 0) return Infinity;
  return normalizeGrossForConfirm(market, gross);
}

type PendingConfirmState = {
  tx: Transaction;
  rowKey: string;
  editPrice: string;
  editAmount: string;
  baseNetNative: number;
  baseWithheldNhiTwd?: number;
  twDistributionComposition?: TwEtfDistributionComposition;
  twNhiEligibleIncomeTwd?: number;
  twEtfCompositionUnavailable?: boolean;
  deductWireFee: boolean;
};

/** 試算實領步進上限（台股若有二代健保，最高可調回稅前毛額） */
function confirmNetMaxNetFromState(prev: PendingConfirmState): number {
  const market = prev.tx.market;
  const net = normalizeNetForConfirm(market, parseFloat(prev.editAmount));
  const parsedGross = normalizeGrossForConfirm(market, parseFloat(prev.editPrice));
  if (market === Market.TW) {
    const nhi = prev.baseWithheldNhiTwd ?? 0;
    const wireFee = prev.deductWireFee ? TW_DIVIDEND_CROSS_BANK_WIRE_FEE_TWD : 0;
    const gross = parsedGross > 0 ? parsedGross : net + nhi;
    return Math.max(gross - wireFee, net);
  }
  if (market === Market.US) {
    return prev.baseNetNative > 0 ? prev.baseNetNative : parsedGross > 0 ? parsedGross : net;
  }
  return parsedGross > 0 ? parsedGross : net;
}

function canStepConfirmNetUp(prev: PendingConfirmState): boolean {
  const market = prev.tx.market;
  const step = confirmNetStep(market);
  const net = normalizeNetForConfirm(market, parseFloat(prev.editAmount));
  const maxNet = confirmNetMaxNetFromState(prev);
  return Number.isFinite(maxNet) && maxNet > 0 && net + step <= maxNet + 1e-9;
}

function syncConfirmNetAmount(prev: PendingConfirmState, raw: string): PendingConfirmState | null {
  if (raw !== '' && !confirmNetInputPattern(prev.tx.market).test(raw)) return null;
  const nextTx: Transaction = { ...prev.tx };

  if (prev.tx.market === Market.TW) {
    if (prev.baseWithheldNhiTwd != null && prev.baseWithheldNhiTwd > 0) {
      nextTx.withheldNhiTwd = prev.baseWithheldNhiTwd;
    } else {
      delete nextTx.withheldNhiTwd;
    }
  }
  return { ...prev, tx: nextTx, editAmount: raw };
}

function stepConfirmNetValue(prev: PendingConfirmState, current: number, delta: number): number {
  const market = prev.tx.market;
  const cap = confirmNetMaxNetFromState(prev);
  let next = current + delta;
  next = normalizeNetForConfirm(market, next);
  if (!Number.isFinite(cap) || cap <= 0) return Math.max(0, next);
  return Math.max(0, Math.min(next, cap));
}

/** 台股待確認：試算二代健保固定；手動調整實領的差額併入手續費（非 withheldNhiTwd） */
function twPendingConfirmSaveFields(params: {
  gross: number;
  net: number;
  baseWithheldNhiTwd?: number;
  deductWireFee: boolean;
}): { price: number; fees: number; amount: number; withheldNhiTwd?: number } {
  const baseNhi = params.baseWithheldNhiTwd ?? 0;
  const wireFee = params.deductWireFee ? TW_DIVIDEND_CROSS_BANK_WIRE_FEE_TWD : 0;
  const expectedAutoNet = params.gross - baseNhi - wireFee;
  const manualFee = Math.max(0, Math.round(expectedAutoNet - params.net));
  const fees = wireFee + manualFee;
  const price = baseNhi > 0 ? params.gross - baseNhi : params.gross;
  return {
    price,
    fees,
    amount: params.net,
    ...(baseNhi > 0 ? { withheldNhiTwd: baseNhi } : {}),
  };
}

function cashDividendStatutoryLabel(market: Market, dtx: ReturnType<typeof t>['dividendTax']): string {
  if (market === Market.TW) return dtx.estNhiFee;
  if (market === Market.US) return dtx.usNetTooltipTitle;
  return dtx.marketWithholdingRef;
}

function colorForAmount(amount: number, maxAmount: number): string {
  if (amount === 0) return '#f1f5f9';
  const ratio = Math.min(amount / maxAmount, 1);
  if (ratio < 0.2) return '#fef9c3';
  if (ratio < 0.4) return '#fde68a';
  if (ratio < 0.6) return '#fbbf24';
  if (ratio < 0.8) return '#f59e0b';
  return '#d97706';
}

function textColorForAmount(amount: number, maxAmount: number): string {
  if (amount === 0) return '#94a3b8';
  return (amount / maxAmount) > 0.5 ? '#78350f' : '#92400e';
}

/** 除息日 YYYY-MM-DD 的本地年月（避免 UTC 切日誤差） */
function exYmdYearMonth(ymd: string): { year: number; month: number } | null {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() };
}

type PendingActualRow = {
  key: string;
  ticker: string;
  market: Market;
  quantity: number;
  exDate: string;
  payDate?: string;
  payDateEstimated?: boolean;
  amountPerShare: number;
  currency?: string;
  source: ActualDividendRecord['source'];
  distributionComposition?: TwEtfDistributionComposition;
  isEtf?: boolean;
  estTotalNative: number;
  accountId: string;
  accountOptions: Array<{ accountId: string; quantity: number }>;
};

const DividendHeatmap: React.FC = () => {
  const { transactions, accounts, holdings, cashFlows, addTransaction } = usePortfolio();
  const { baseCurrency, rates } = useMarket();
  const { language, isGuest } = useUI();
  const tr = t(language);
  const [hoveredCell, setHoveredCell] = useState<{ year: number; month: number } | null>(null);
  const [dismissedPendingKeys, setDismissedPendingKeys] = useState<Set<string>>(
    () => readDismissedPendingDividendKeys()
  );
  const [pendingListVisible, setPendingListVisible] = useState(
    () => readPendingDividendListVisible()
  );
  const [confirmState, setConfirmState] = useState<PendingConfirmState | null>(null);

  useEffect(() => {
    const syncDismissedKeys = () => setDismissedPendingKeys(readDismissedPendingDividendKeys());
    window.addEventListener(PENDING_DIVIDEND_DISMISSALS_CHANGED_EVENT, syncDismissedKeys);
    return () => window.removeEventListener(PENDING_DIVIDEND_DISMISSALS_CHANGED_EVENT, syncDismissedKeys);
  }, []);

  const toBase = (v: number) => valueInBaseCurrency(v, baseCurrency, rates);
  const dtx = tr.dividendTax;
  const tf = tr.transactionForm;

  const marketLabelMap = useMemo(
    (): Record<Market, string> => ({
      [Market.US]: tf.marketUS,
      [Market.TW]: tf.marketTW,
      [Market.UK]: tf.marketUK,
      [Market.JP]: tf.marketJP,
      [Market.CN]: tf.marketCN,
      [Market.SZ]: tf.marketSZ,
      [Market.IN]: tf.marketIN,
      [Market.CA]: tf.marketCA,
      [Market.FR]: tf.marketFR,
      [Market.HK]: tf.marketHK,
      [Market.KR]: tf.marketKR,
      [Market.DE]: tf.marketDE,
      [Market.AU]: tf.marketAU,
      [Market.SA]: tf.marketSA,
      [Market.BR]: tf.marketBR,
    }),
    [tf]
  );

  const getAccountName = (accountId: string): string => {
    const a = accounts.find(x => x.id === accountId);
    return a ? `${a.name} (${a.currency})` : accountId;
  };
  const getAccountCurrencyCode = (accountId: string): string => {
    const a = accounts.find(x => x.id === accountId);
    return a ? String(a.currency) : 'TWD';
  };
  const getCashDividendCalc = (
    row: Pick<
      PendingActualRow,
      'market' | 'amountPerShare' | 'quantity' | 'distributionComposition' | 'isEtf' | 'accountId'
    >
  ): ReturnType<typeof cashDividendBreakdownForMarket> => {
    if (row.market !== Market.TW) {
      const account = accounts.find(item => item.id === row.accountId);
      return cashDividendBreakdownForMarket(
        row.market,
        row.quantity,
        row.amountPerShare,
        row.market === Market.US
          ? { usWithholdingRate: getAccountUsDividendWithholdingRate(account) }
          : undefined
      );
    }
    if (row.distributionComposition) {
      const gross = twEstimatedSingleDividendTwd(row.quantity, row.amountPerShare);
      const basis = twEtfNhiEligibleIncomeTwd(
        gross,
        row.distributionComposition.dividendIncomePercent,
        row.distributionComposition.interestIncomePercent
      );
      return cashDividendBreakdownForMarket(row.market, row.quantity, row.amountPerShare, {
        twNhiEligibleIncomeTwd: basis,
      });
    }
    return cashDividendBreakdownForMarket(
      row.market,
      row.quantity,
      row.amountPerShare,
      row.isEtf ? { twNhiEligibleIncomeTwd: null } : undefined
    );
  };

  const mergedHoldingsForDiv = useMemo(() => {
    const m = new Map<string, { market: Market; ticker: string; quantity: number }>();
    for (const h of holdings) {
      if (!marketToYahooMarketForDividends(h.market)) continue;
      const k = dividendScheduleMapKey(h.market, h.ticker);
      const prev = m.get(k);
      if (prev) prev.quantity += h.quantity;
      else m.set(k, { market: h.market, ticker: h.ticker, quantity: h.quantity });
    }
    return [...m.values()];
  }, [holdings]);

  /** 現有持倉 + 交易紀錄曾出現的標的，避免除息後已賣出仍須補登時抓不到配息資料 */
  const dividendRequests = useMemo(() => {
    const m = new Map<string, { ticker: string; market: Market }>();
    for (const h of mergedHoldingsForDiv) {
      const k = dividendScheduleMapKey(h.market, h.ticker);
      m.set(k, { ticker: h.ticker, market: h.market });
    }
    for (const tx of transactions) {
      if (!tx.ticker?.trim()) continue;
      if (!marketToYahooMarketForDividends(tx.market)) continue;
      const k = dividendScheduleMapKey(tx.market, tx.ticker);
      if (!m.has(k)) m.set(k, { ticker: tx.ticker.trim(), market: tx.market });
    }
    return [...m.values()];
  }, [mergedHoldingsForDiv, transactions]);
  const actualDividendsMap = useActualDividends(dividendRequests);

  const { grid, years, maxAmount, totalDividend, monthTotals, yearTotals } = useMemo(() => {
    const map: Record<number, Record<number, { amount: number; tickers: Record<string, number> }>> = {};

    transactions.forEach(tx => {
      if (tx.type !== TransactionType.CASH_DIVIDEND) return;
      const d = new Date(tx.date);
      const year = d.getFullYear();
      const month = d.getMonth();
      const amt = cashDividendNetNative(tx);
      const amountTWD = transactionAmountNativeToTWD(amt, tx, accounts, rates);
      const amount = toBase(amountTWD);
      if (!map[year]) map[year] = {};
      if (!map[year][month]) map[year][month] = { amount: 0, tickers: {} };
      map[year][month].amount += amount;
      map[year][month].tickers[tx.ticker] = (map[year][month].tickers[tx.ticker] ?? 0) + amount;
    });

    const years = Object.keys(map).map(Number).sort();
    let maxAmount = 0;
    let total = 0;
    const monthTotals: number[] = new Array(12).fill(0);
    const yearTotals: Record<number, number> = {};

    years.forEach(y => {
      yearTotals[y] = 0;
      for (let m = 0; m < 12; m++) {
        const amt = map[y]?.[m]?.amount ?? 0;
        if (amt > maxAmount) maxAmount = amt;
        total += amt;
        monthTotals[m] += amt;
        yearTotals[y] += amt;
      }
    });

    return { grid: map, years, maxAmount, totalDividend: total, monthTotals, yearTotals };
  }, [transactions, accounts, rates, baseCurrency]);

  /**
   * 今年已除息、除息日當日該帳戶有持股、且「該 ticker」在除息月尚無實績（不影響同月其他股票）。
   */
  const pendingActualRows = useMemo((): PendingActualRow[] => {
    const todayYmd = formatLocalYmd(new Date());
    const currentYear = new Date().getFullYear();
    const yearStartYmd = `${currentYear}-01-01`;
    const rows: PendingActualRow[] = [];

    for (const { ticker, market } of dividendRequests) {
      const key = dividendScheduleMapKey(market, ticker);
      const list = actualDividendsMap[key];
      if (!list || list === 'loading') continue;

      for (const rec of list) {
        if (rec.exDate > todayYmd) continue;
        if (rec.exDate < yearStartYmd) continue;

        const exYm = exYmdYearMonth(rec.exDate);
        if (!exYm) continue;
        const recordedTickersInMonth = grid[exYm.year]?.[exYm.month]?.tickers;

        const holdersAtEx = listAccountTickerQuantitiesAtExDate(
          transactions,
          cashFlows,
          accounts,
          market,
          ticker,
          rec.exDate
        );
        if (holdersAtEx.length === 0) continue;

        for (const acct of holdersAtEx) {
          if (
            tickerHasRecordedCashDividendInExMonth(
              transactions,
              recordedTickersInMonth,
              ticker,
              rec.exDate,
              market,
              acct.accountId,
              rec.payDate
            )
          ) {
            continue;
          }

          rows.push({
            key: `${key}|${rec.exDate}|${acct.accountId}`,
            ticker,
            market,
            quantity: acct.quantity,
            exDate: rec.exDate,
            payDate: rec.payDate,
            payDateEstimated: rec.payDateEstimated,
            amountPerShare: rec.amountPerShare,
            currency: rec.currency,
            source: rec.source,
            distributionComposition: rec.distributionComposition,
            isEtf: rec.isEtf,
            estTotalNative: rec.amountPerShare * acct.quantity,
            accountId: acct.accountId,
            accountOptions: holdersAtEx,
          });
        }
      }
    }

    rows.sort(
      (a, b) =>
        b.exDate.localeCompare(a.exDate) ||
        a.ticker.localeCompare(b.ticker) ||
        a.accountId.localeCompare(b.accountId)
    );
    return rows;
  }, [dividendRequests, actualDividendsMap, transactions, cashFlows, accounts, grid]);

  const visiblePendingRows = useMemo(
    () => pendingActualRows.filter(row => !dismissedPendingKeys.has(row.key)),
    [pendingActualRows, dismissedPendingKeys]
  );

  const dismissPendingRow = (rowKey: string) => {
    setDismissedPendingKeys(prev => {
      const next = new Set(prev);
      next.add(rowKey);
      persistDismissedPendingDividendKeys(next);
      return next;
    });
    if (confirmState?.rowKey === rowKey) setConfirmState(null);
  };

  const pendingActualLoading = useMemo(() => {
    for (const req of dividendRequests) {
      const key = dividendScheduleMapKey(req.market, req.ticker);
      if (actualDividendsMap[key] === 'loading') return true;
    }
    return false;
  }, [dividendRequests, actualDividendsMap]);

  const handleAddPendingActual = (row: PendingActualRow) => {
    const accountId = row.accountId ?? accounts[0]?.id;
    if (!accountId) return;
    const calc = getCashDividendCalc(row);
    if (calc.netNative <= 0) return;
    const note = translate('dividendTax.pendingActualNoteTemplate', language, {
      perShare: row.amountPerShare.toLocaleString(undefined, { maximumFractionDigits: 6 }),
      qty: row.quantity.toLocaleString(),
    });
    const tx: Transaction = {
      id: uuidv4(),
      date: row.payDate ?? row.exDate,
      ticker: row.ticker,
      market: row.market,
      type: TransactionType.CASH_DIVIDEND,
      price: calc.netNative,
      quantity: 1,
      fees: 0,
      accountId,
      amount: calc.netNative,
      note,
      ...(calc.withheldNhiTwd != null && calc.withheldNhiTwd > 0
        ? { withheldNhiTwd: calc.withheldNhiTwd }
        : {}),
      ...(calc.withheldUsTaxNative != null && calc.withheldUsTaxNative > 0
        ? { withheldUsTaxNative: calc.withheldUsTaxNative }
        : {}),
      ...(calc.withheldTaxNative != null && calc.withheldTaxNative > 0
        ? { withheldTaxNative: calc.withheldTaxNative }
        : {}),
    };
    setConfirmState({
      tx,
      rowKey: row.key,
      editPrice: formatGrossForConfirmEdit(row.market, calc.grossNative),
      editAmount: formatNetForConfirmEdit(row.market, calc.netNative),
      baseNetNative: calc.netNative,
      baseWithheldNhiTwd: calc.withheldNhiTwd,
      ...(row.distributionComposition
        ? {
            twDistributionComposition: row.distributionComposition,
            twNhiEligibleIncomeTwd: twEtfNhiEligibleIncomeTwd(
              calc.grossNative,
              row.distributionComposition.dividendIncomePercent,
              row.distributionComposition.interestIncomePercent
            ),
          }
        : {}),
      ...(row.market === Market.TW && row.isEtf && !row.distributionComposition
        ? { twEtfCompositionUnavailable: true }
        : {}),
      deductWireFee: false,
    });
  };

  const applyConfirmWireFeeChoice = (checked: boolean) => {
    setConfirmState(prev => {
      if (!prev || prev.tx.market !== Market.TW) return prev;
      const currentNet = parseFloat(prev.editAmount);
      const adjustedNet = Number.isFinite(currentNet)
        ? Math.max(
            0,
            Math.round(
              checked
                ? currentNet - TW_DIVIDEND_CROSS_BANK_WIRE_FEE_TWD
                : currentNet + TW_DIVIDEND_CROSS_BANK_WIRE_FEE_TWD
            )
          )
        : Math.max(
            0,
            Math.round(prev.baseNetNative) -
              (checked ? TW_DIVIDEND_CROSS_BANK_WIRE_FEE_TWD : 0)
          );
      const nextTx: Transaction = { ...prev.tx };
      if (prev.baseWithheldNhiTwd != null && prev.baseWithheldNhiTwd > 0) {
        nextTx.withheldNhiTwd = prev.baseWithheldNhiTwd;
      } else {
        delete nextTx.withheldNhiTwd;
      }
      return {
        ...prev,
        tx: nextTx,
        deductWireFee: checked,
        editAmount: String(adjustedNet),
      };
    });
  };

  const applyConfirmNetEdit = (raw: string) => {
    setConfirmState(prev => {
      if (!prev) return null;
      return syncConfirmNetAmount(prev, raw) ?? prev;
    });
  };

  const formatConfirmNetOnBlur = () => {
    setConfirmState(prev => {
      if (!prev || confirmNetUsesIntegerStep(prev.tx.market)) return prev;
      const n = parseFloat(prev.editAmount);
      if (!Number.isFinite(n) || n < 0) return prev;
      const formatted = formatNetForConfirmEdit(prev.tx.market, n);
      if (formatted === prev.editAmount) return prev;
      return syncConfirmNetAmount(prev, formatted) ?? prev;
    });
  };

  const stepConfirmNetAmount = (delta: number) => {
    setConfirmState(prev => {
      if (!prev) return prev;
      const market = prev.tx.market;
      const current = parseFloat(prev.editAmount);
      const base = Number.isFinite(current) ? current : 0;
      const next = stepConfirmNetValue(prev, base, delta);
      const formatted = formatNetForConfirmEdit(market, next);
      return syncConfirmNetAmount(prev, formatted) ?? prev;
    });
  };

  const confirmAndSavePendingActual = () => {
    if (!confirmState) return;
    const netRaw = parseFloat(confirmState.editAmount);
    const net = Number.isFinite(netRaw)
      ? normalizeNetForConfirm(confirmState.tx.market, netRaw)
      : NaN;
    if (!Number.isFinite(net) || net <= 0) return;
    const gross = normalizeGrossForConfirm(confirmState.tx.market, parseFloat(confirmState.editPrice));

    const saved: Transaction = {
      ...confirmState.tx,
      quantity: 1,
      amount: net,
    };

    if (confirmState.tx.market === Market.TW) {
      const twFields = twPendingConfirmSaveFields({
        gross,
        net,
        baseWithheldNhiTwd: confirmState.baseWithheldNhiTwd,
        deductWireFee: confirmState.deductWireFee,
      });
      saved.price = twFields.price;
      saved.fees = twFields.fees;
      saved.amount = twFields.amount;
      if (twFields.withheldNhiTwd != null && twFields.withheldNhiTwd > 0) {
        saved.withheldNhiTwd = twFields.withheldNhiTwd;
      } else {
        delete saved.withheldNhiTwd;
      }
    } else if (marketCashDividendPriceIsNetAfterWithholding(confirmState.tx.market)) {
      const statutoryTax = readTransactionStatutoryWithholding(confirmState.tx);
      const netFields = netPriceMarketCashDividendSaveFields({
        market: confirmState.tx.market,
        autoNet: confirmState.baseNetNative,
        net,
        statutoryTax,
      });
      saved.price = netFields.price;
      saved.fees = netFields.fees;
      saved.amount = netFields.amount;
      delete saved.withheldNhiTwd;
      delete saved.withheldUsTaxNative;
      delete saved.withheldTaxNative;
      if (netFields.withheldNhiTwd != null && netFields.withheldNhiTwd > 0) {
        saved.withheldNhiTwd = netFields.withheldNhiTwd;
      }
      if (netFields.withheldUsTaxNative != null && netFields.withheldUsTaxNative > 0) {
        saved.withheldUsTaxNative = netFields.withheldUsTaxNative;
      }
      if (netFields.withheldTaxNative != null && netFields.withheldTaxNative > 0) {
        saved.withheldTaxNative = netFields.withheldTaxNative;
      }
    } else {
      saved.price = net;
    }

    addTransaction(saved);
    setConfirmState(null);
  };

  const cancelConfirmPendingActual = () => {
    setConfirmState(null);
  };

  const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const MONTH_NAMES = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) =>
      new Date(2000, i, 1).toLocaleDateString(language === 'zh-TW' ? 'zh-TW' : language === 'zh-CN' ? 'zh-CN' : language, { month: 'long' })
    );
  }, [language]);

  const displayYears = useMemo(() => years, [years]);
  const heatScaleMax = Math.max(maxAmount, 1);

  const fmt = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(2)}k`;
    return v.toFixed(0);
  };

  const hoveredData = hoveredCell ? grid[hoveredCell.year]?.[hoveredCell.month] : null;
  const bestMonth = monthTotals.indexOf(Math.max(...monthTotals));
  const hasHeatmapData = displayYears.length > 0;

  const renderPendingAddRow = (pa: PendingActualRow) => {
    const accountId = pa.accountId ?? accounts[0]?.id ?? '';

    return (
      <div key={pa.key} className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <span className="text-sm font-medium text-slate-500">
          {getAccountName(accountId)}
        </span>
        <button
          type="button"
          onClick={() => handleAddPendingActual(pa)}
          className="rounded border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-800 hover:bg-sky-100"
        >
          {dtx.pendingActualAddBtn}
        </button>
        <button
          type="button"
          onClick={() => dismissPendingRow(pa.key)}
          className="rounded border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
          title={dtx.pendingActualDismissBtn}
        >
          {dtx.pendingActualDismissBtn}
        </button>
      </div>
    );
  };

  if (isGuest) return null;

  return (
    <div className="bg-white p-6 rounded-xl shadow overflow-hidden">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h3 className="font-bold text-slate-800 text-xl">{tr.dividendHeatmap.title}</h3>
          <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{tr.dividendHeatmap.subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-400">{tr.dividendHeatmap.totalDividend}</div>
          <div className="text-lg font-bold text-amber-600">{fmt(totalDividend)} {baseCurrency}</div>
        </div>
      </div>

      {hasHeatmapData ? (
        <div className="overflow-x-auto">
          <div className="min-w-[540px]">
            <div className="flex mb-1.5">
              <div className="w-14 shrink-0" />
              {SHORT_MONTHS.map(m => (
                <div key={m} className="flex-1 text-center text-sm font-medium text-slate-400" style={{ minWidth: 36 }}>
                  {m}
                </div>
              ))}
              <div className="w-20 shrink-0 text-sm font-medium text-slate-400 text-right pr-1">
                {tr.dividendHeatmap.yearTotal}
              </div>
            </div>

            {displayYears.map(year => (
              <div key={year} className="flex items-center mb-1">
                <div className="w-14 shrink-0 text-sm font-bold text-slate-600 pr-2 text-right">{year}</div>
                {Array.from({ length: 12 }, (_, m) => {
                  const cell = grid[year]?.[m];
                  const actualAmount = cell?.amount ?? 0;
                  const isHovered = hoveredCell?.year === year && hoveredCell?.month === m;
                  const actualColor = colorForAmount(actualAmount, heatScaleMax);
                  return (
                    <div
                      key={m}
                      className="flex-1 mx-0.5 rounded cursor-pointer transition-all duration-150 relative"
                      style={{
                        minWidth: 32,
                        height: 36,
                        background: actualColor,
                        border: isHovered ? '2px solid #d97706' : '2px solid transparent',
                        transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onMouseEnter={() => setHoveredCell({ year, month: m })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {actualAmount > 0 && (
                        <span
                          className="text-[9px] font-bold leading-none"
                          style={{
                            color: textColorForAmount(actualAmount, heatScaleMax),
                          }}
                        >
                          {fmt(actualAmount)}
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="w-20 shrink-0 text-sm font-bold text-amber-600 text-right pr-1 tabular-nums">
                  {(yearTotals[year] ?? 0) > 0 ? fmt(yearTotals[year] ?? 0) : '—'}
                </div>
              </div>
            ))}

            <div className="flex items-center mt-2 border-t border-slate-100 pt-2">
              <div className="w-14 shrink-0 text-[10px] text-slate-400 text-right pr-2">
                {tr.dividendHeatmap.monthTotal}
              </div>
              {monthTotals.map((total, m) => (
                <div key={m} className="flex-1 mx-0.5 text-center" style={{ minWidth: 32 }}>
                  <span className={`text-[9px] font-bold tabular-nums ${m === bestMonth && total > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {total > 0 ? fmt(total) : '—'}
                  </span>
                </div>
              ))}
              <div className="w-20 shrink-0" />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-slate-400 text-sm text-center py-6">{tr.dividendHeatmap.noData}</p>
      )}

      {hasHeatmapData && hoveredCell && (hoveredData?.amount ?? 0) > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <div className="font-bold text-amber-800 mb-2">
            {hoveredCell.year} · {MONTH_NAMES[hoveredCell.month]}
          </div>
          <div className="text-amber-700 font-mono font-bold text-lg mb-2">
            {tr.dividendHeatmap.recordedLabel}：{fmt(hoveredData?.amount ?? 0)} {baseCurrency}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(hoveredData?.tickers ?? {})
              .sort(([, a], [, b]) => b - a)
              .map(([ticker, amt]) => (
                <div key={ticker} className="text-xs bg-white border border-amber-200 rounded-full px-2 py-0.5 text-amber-700 font-medium">
                  {ticker}: {fmt(amt)}
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 flex-wrap">
        <span>{tr.dividendHeatmap.less}</span>
        {['#fef9c3', '#fde68a', '#fbbf24', '#f59e0b', '#d97706'].map(c => (
          <div key={c} className="w-6 h-3 rounded-sm" style={{ backgroundColor: c }} />
        ))}
        <span>{tr.dividendHeatmap.more}</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 leading-snug">
          {hasHeatmapData && bestMonth >= 0 && monthTotals[bestMonth] > 0 && (
            <span className="text-amber-600 font-medium break-words">
              {tr.dividendHeatmap.bestMonth}：{MONTH_NAMES[bestMonth]}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium shrink-0">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: '#f59e0b' }} aria-hidden />
            {tr.dividendHeatmap.recordedLabel}
          </span>
        </div>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-slate-800">{dtx.pendingActualTitle}</h4>
          <button
            type="button"
            onClick={() => {
              setPendingListVisible(prev => {
                const next = !prev;
                persistPendingDividendListVisible(next);
                return next;
              });
            }}
            className="shrink-0 rounded border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {pendingListVisible ? dtx.pendingActualToggleHide : dtx.pendingActualToggleShow}
          </button>
        </div>
        {pendingListVisible ? (
          <>
            <p className="text-sm text-slate-500 mb-2 leading-relaxed">{dtx.pendingActualSubtitle}</p>
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 leading-relaxed">
              {dtx.pendingActualDripHint}
            </p>
            {pendingActualLoading ? (
              <p className="text-sm text-slate-400 py-2">{dtx.pendingActualLoading}</p>
            ) : visiblePendingRows.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">{dtx.pendingActualEmpty}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold">
                    <tr>
                      <th className="px-3 py-2">{tr.holdings.ticker}</th>
                      <th className="px-3 py-2">{tr.historicalModal.colMarket}</th>
                      <th className="px-3 py-2">{dtx.upcomingExDate}</th>
                      <th className="px-3 py-2">{dtx.pendingActualPayDate}</th>
                      <th className="px-3 py-2 text-right">{dtx.pendingActualPerShare}</th>
                      <th className="px-3 py-2 text-right">{dtx.pendingActualEstAmount}</th>
                      <th className="px-3 py-2 text-center">{tr.labels.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePendingRows.map(pa => {
                      const calc = getCashDividendCalc(pa);
                      const cur = pa.currency ?? getAccountCurrencyCode(pa.accountId);
                      return (
                        <tr key={pa.key} className="border-b border-slate-100 text-slate-600 last:border-b-0 dark:border-slate-700">
                          <td className="px-3 py-2 font-mono font-medium">{pa.ticker}</td>
                          <td className="px-3 py-2">{marketLabelMap[pa.market] ?? pa.market}</td>
                          <td className="px-3 py-2 tabular-nums">{pa.exDate}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {pa.payDate ?? '—'}
                            {pa.payDateEstimated ? (
                              <span className="ml-1 text-xs text-slate-400">({dtx.pendingActualEstimatedDate})</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {pa.amountPerShare.toLocaleString(undefined, { maximumFractionDigits: 4 })} {cur}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCashDividendNativeAmountForMarket(pa.market, calc.netNative)}{' '}
                            {cur}
                          </td>
                          <td className="px-3 py-2 text-center">{renderPendingAddRow(pa)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>

      {confirmState && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 p-4">
              <h3 className="text-white font-bold text-lg">{tf.confirmTitle}</h3>
            </div>
            <div className="p-6 space-y-3">
              <div className="bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">{tf.confirmMessage}</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">{tf.dateLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">{confirmState.tx.date}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">{tf.accountLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{getAccountName(confirmState.tx.accountId)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">{tf.tickerLabel}</span>
                  <span className="font-medium font-mono text-slate-900 dark:text-slate-100">{confirmState.tx.ticker}</span>
                </div>
                <div className="flex justify-between items-center gap-3 py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400 shrink-0">{dtx.pendingActualConfirmGrossAmount}</span>
                  <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {confirmState.editPrice}{' '}
                    {getAccountCurrencyCode(confirmState.tx.accountId)}
                  </span>
                </div>
                {confirmState.tx.market === Market.TW && confirmState.twDistributionComposition && (
                  <div className="rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-600 dark:text-slate-400">
                        {dtx.pendingActualNhiEligibleIncome}
                      </span>
                      <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {(
                          confirmState.twDistributionComposition.dividendIncomePercent +
                          confirmState.twDistributionComposition.interestIncomePercent
                        ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        % · {(confirmState.twNhiEligibleIncomeTwd ?? 0).toLocaleString()} TWD
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      {dtx.pendingActualCompositionWarning}
                    </p>
                  </div>
                )}
                {confirmState.tx.market === Market.TW &&
                  confirmState.twEtfCompositionUnavailable && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {dtx.pendingActualCompositionUnavailable}
                    </p>
                  )}
                {(() => {
                  const tax = readTransactionStatutoryWithholding(confirmState.tx);
                  if (tax == null || tax <= 0) return null;
                  const market = confirmState.tx.market;
                  const cur = getAccountCurrencyCode(confirmState.tx.accountId);
                  const amountLabel =
                    market === Market.TW
                      ? `−${tax.toLocaleString()} TWD`
                      : `−${formatCashDividendNativeAmountForMarket(market, tax)} ${cur}`;
                  return (
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700 text-rose-700 dark:text-rose-400">
                      <span>{cashDividendStatutoryLabel(market, dtx)}</span>
                      <span className="font-medium tabular-nums">{amountLabel}</span>
                    </div>
                  );
                })()}
                {confirmState.tx.market === Market.TW && (
                  <div className="py-2 border-b border-slate-100 dark:border-slate-700">
                    <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={confirmState.deductWireFee}
                        onChange={e => applyConfirmWireFeeChoice(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>
                        <span className="font-medium">
                          {dtx.pendingActualWireFeeOption}
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {dtx.pendingActualWireFeeHint}
                        </span>
                      </span>
                    </label>
                    {confirmState.deductWireFee && (
                      <div className="mt-1 flex justify-between text-sm text-rose-700 dark:text-rose-400">
                        <span>{dtx.pendingActualWireFeeLabel}</span>
                        <span className="font-medium tabular-nums">
                          −{TW_DIVIDEND_CROSS_BANK_WIRE_FEE_TWD.toLocaleString()} TWD
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {confirmState.tx.note && (
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">{tf.noteLabel}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100 text-right max-w-[60%]">{confirmState.tx.note}</span>
                  </div>
                )}
                <div className="border-t-2 border-slate-300 dark:border-slate-600 pt-2 mt-2">
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-slate-700 dark:text-slate-300 font-semibold shrink-0">{dtx.pendingActualEstAmount}</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <input
                        type="text"
                        inputMode={confirmNetUsesIntegerStep(confirmState.tx.market) ? 'numeric' : 'decimal'}
                        min="0"
                        value={confirmState.editAmount}
                        onChange={e => applyConfirmNetEdit(e.target.value)}
                        onBlur={formatConfirmNetOnBlur}
                        className={`w-28 text-right tabular-nums font-bold text-lg border border-slate-300 rounded-md p-1.5 ${FORM_FIELD_THEME}`}
                      />
                      {(() => {
                        const market = confirmState.tx.market;
                        const step = confirmNetStep(market);
                        const current = parseFloat(confirmState.editAmount);
                        const net = Number.isFinite(current) ? normalizeNetForConfirm(market, current) : 0;
                        const canStepDown = net > 0;
                        const canStepUp = canStepConfirmNetUp(confirmState);
                        const stepLabel = confirmNetUsesIntegerStep(market)
                          ? String(step)
                          : step.toFixed(2);
                        const stepBtnClass =
                          'flex h-5 w-7 items-center justify-center rounded border border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600';
                        return (
                          <div className="flex flex-col shrink-0 gap-0.5" role="group" aria-label={dtx.pendingActualEstAmount}>
                            <button
                              type="button"
                              disabled={!canStepUp}
                              onClick={() => stepConfirmNetAmount(step)}
                              className={stepBtnClass}
                              aria-label={`+${stepLabel}`}
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              disabled={!canStepDown}
                              onClick={() => stepConfirmNetAmount(-step)}
                              className={stepBtnClass}
                              aria-label={`−${stepLabel}`}
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        );
                      })()}
                      <span className="text-slate-500 dark:text-slate-400 text-xs shrink-0">
                        {getAccountCurrencyCode(confirmState.tx.accountId)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={cancelConfirmPendingActual}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {tf.backToEdit}
                </button>
                <button
                  type="button"
                  onClick={confirmAndSavePendingActual}
                  className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
                >
                  {tf.confirmSave}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DividendHeatmap;
