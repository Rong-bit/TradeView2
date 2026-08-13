
import React, { useState, useEffect, useMemo } from 'react';
import { BaseCurrency, CashFlow, CashFlowType, Currency, RecurringDepositRule, ScheduledRuleKind } from '../types';
import {
  isLiabilityAccount,
  isBrokerageAccount,
  isDebtFundedInflow,
  isDebtRepaymentOutflow,
} from '../utils/debtAccountHelpers';
import { v4 as uuidv4 } from 'uuid';
import {
  formatCurrency,
  valueInBaseCurrency,
  currencyToTWDRate,
  baseCurrencyToCurrency,
  fundFormAccountBasePairToTwdPerNative,
  fundFormTwdPerNativeToAccountBasePair,
} from '../utils/calculations';
import BatchCashFlowModal from './BatchCashFlowModal';
import { t, translate } from '../utils/i18n';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useMarket } from '../contexts/MarketContext';
import { useUI } from '../contexts/UIContext';
import { FORM_FIELD_THEME, MODAL_CANCEL_BUTTON, INPUT_MODE_DECIMAL, INPUT_MODE_NUMERIC } from '../utils/formFieldClasses';
import { recordRowClassName } from '../utils/recordHighlightClasses';
import {
  currentYearMonth,
  stripRecurringMarkersFromNote,
  noteContainsRecurringMarker,
  mergeNotePreserveRecurringMarkers,
} from '../utils/recurringDeposits';

interface Props {
  minDebtSafetySpread?: number;
  onMinDebtSafetySpreadChange?: (value: number) => void;
}

/** 證券戶幣別與儀表板基準幣相同（例：基準幣 JPY 且帳戶為日幣帳） */
function fundAccountMatchesBaseCurrency(
  accountCurrency: Currency | undefined,
  baseCurrency: BaseCurrency
): boolean {
  return !!accountCurrency && (accountCurrency as string) === baseCurrency;
}

const FundManager: React.FC<Props> = ({ minDebtSafetySpread = 2, onMinDebtSafetySpreadChange }) => {
  const { accounts, cashFlows, addCashFlow, updateCashFlow: onUpdate,
    addBatchCashFlows, removeCashFlow, clearCashFlows,
    recurringDepositRules, addRecurringDepositRule, updateRecurringDepositRule, removeRecurringDepositRule,
  } = usePortfolio();
  const { baseCurrency, rates } = useMarket();
  const { exchangeRateUsdToTwd: currentExchangeRate, jpyExchangeRate: currentJpyExchangeRate, eurExchangeRate: currentEurExchangeRate, gbpExchangeRate: currentGbpExchangeRate, hkdExchangeRate: currentHkdExchangeRate, krwExchangeRate: currentKrwExchangeRate, cadExchangeRate: currentCadExchangeRate, inrExchangeRate: currentInrExchangeRate } = rates;
  const { language, isRecordHighlighted } = useUI();
  const onAdd = addCashFlow;
  const onBatchAdd = addBatchCashFlows;
  const onDelete = removeCashFlow;
  const onClearAll = clearCashFlows;
  const toBase = (v: number) => valueInBaseCurrency(v, baseCurrency, rates);
  const translations = t(language);
  const ff = translations.fundForm;
  // Form State
  const [type, setType] = useState<CashFlowType>(CashFlowType.DEPOSIT);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState(''); 
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [note, setNote] = useState('');
  
  // UI State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [editingCashFlow, setEditingCashFlow] = useState<CashFlow | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingCashFlow, setPendingCashFlow] = useState<CashFlow | null>(null);

  // Filter State
  const [filterAccount, setFilterAccount] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  const [recModalOpen, setRecModalOpen] = useState(false);
  const [recEditing, setRecEditing] = useState<RecurringDepositRule | null>(null);
  const [recDay, setRecDay] = useState('1');
  const [recAccountId, setRecAccountId] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recFee, setRecFee] = useState('');
  const [recEx, setRecEx] = useState('');
  const [recNote, setRecNote] = useState('');
  const [recStartMonth, setRecStartMonth] = useState('');
  const [recAmountTwd, setRecAmountTwd] = useState('');
  const [recEnabled, setRecEnabled] = useState(true);
  const [recKind, setRecKind] = useState<ScheduledRuleKind>('RECURRING_DEPOSIT');
  const [recLeadDays, setRecLeadDays] = useState('3');

  const [safetySpreadDraft, setSafetySpreadDraft] = useState(() => String(minDebtSafetySpread));
  const [showRecurringPanel, setShowRecurringPanel] = useState(false);
  const [showDebtAlertPanel, setShowDebtAlertPanel] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showScheduleSection, setShowScheduleSection] = useState(false);

  const schedulePanelToggleClass = (open: boolean) =>
    open
      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700';

  useEffect(() => {
    setSafetySpreadDraft(String(minDebtSafetySpread));
  }, [minDebtSafetySpread]);

  const openRecModal = (rule?: RecurringDepositRule) => {
    if (rule) {
      setRecEditing(rule);
      setRecDay(String(rule.dayOfMonth));
      setRecAccountId(rule.accountId);
      setRecAmount(String(rule.amount));
      setRecFee(rule.fee != null ? String(rule.fee) : '');
      if (rule.exchangeRate != null && rule.exchangeRate > 0) {
        const acc = accounts.find(a => a.id === rule.accountId);
        if (acc && fundAccountMatchesBaseCurrency(acc.currency, baseCurrency)) {
          setRecEx('');
        } else if (acc && acc.currency !== Currency.TWD) {
          const v = fundFormTwdPerNativeToAccountBasePair(rule.exchangeRate, baseCurrency, rates);
          setRecEx(v != null ? String(v) : String(rule.exchangeRate));
        } else {
          setRecEx(String(rule.exchangeRate));
        }
      } else {
        setRecEx('');
      }
      setRecNote((rule.note ?? '').replace(/\s*__recurring:[^:]+:[^_]+__/g, '').trim());
      setRecStartMonth(rule.startMonth ?? '');
      setRecAmountTwd(rule.amountTWD != null ? String(rule.amountTWD) : '');
      setRecEnabled(rule.enabled);
      setRecKind(rule.kind ?? 'RECURRING_DEPOSIT');
      setRecLeadDays(String(rule.leadDays ?? 3));
    } else {
      setRecEditing(null);
      setRecDay('1');
      setRecAccountId(accounts[0]?.id ?? '');
      setRecAmount('');
      setRecFee('');
      setRecEx('');
      setRecNote('');
      setRecStartMonth('');
      setRecAmountTwd('');
      setRecEnabled(true);
      setRecKind('RECURRING_DEPOSIT');
      setRecLeadDays('3');
    }
    setRecModalOpen(true);
  };

  const saveRecRule = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = parseFloat(recAmount);
    if (!recAccountId || !Number.isFinite(numAmt) || numAmt <= 0) {
      alert(ff.recurringInvalidAmount);
      return;
    }
    const day = Math.min(31, Math.max(1, parseInt(recDay, 10) || 1));
    const feeNum = recFee ? parseFloat(recFee) : 0;
    const exNum = recEx ? parseFloat(recEx) : undefined;
    const amtTwdNum = recAmountTwd.trim() ? parseFloat(recAmountTwd) : undefined;
    const recAccForSave = accounts.find(a => a.id === recAccountId);
    let storedEx: number | undefined =
      exNum !== undefined && Number.isFinite(exNum) && exNum > 0 ? exNum : undefined;
    if (recAccForSave && fundAccountMatchesBaseCurrency(recAccForSave.currency, baseCurrency)) {
      const r = currencyToTWDRate(recAccForSave.currency, rates);
      if (!Number.isFinite(r) || r <= 0) {
        alert(ff.exchangeRateInvalid);
        return;
      }
      storedEx = r;
    } else if (
      storedEx !== undefined &&
      recAccForSave &&
      !fundAccountMatchesBaseCurrency(recAccForSave.currency, baseCurrency) &&
      recAccForSave.currency !== Currency.TWD
    ) {
      const conv = fundFormAccountBasePairToTwdPerNative(storedEx, baseCurrency, rates);
      if (!Number.isFinite(conv) || conv <= 0) {
        alert(ff.exchangeRateInvalid);
        return;
      }
      storedEx = conv;
    }
    const isDebtAlert = recKind === 'DEBT_PAYMENT_ALERT';
    const rule: RecurringDepositRule = {
      id: recEditing?.id ?? uuidv4(),
      enabled: recEnabled,
      kind: recKind,
      dayOfMonth: day,
      accountId: recAccountId,
      amount: numAmt,
      fee: isDebtAlert ? undefined : Number.isFinite(feeNum) && feeNum > 0 ? feeNum : undefined,
      exchangeRate: isDebtAlert ? undefined : storedEx,
      note: recNote.trim() || undefined,
      amountTWD: isDebtAlert ? undefined : amtTwdNum !== undefined && Number.isFinite(amtTwdNum) ? amtTwdNum : undefined,
      startMonth: isDebtAlert ? undefined : recStartMonth.trim() || undefined,
      lastAppliedPeriod: recEditing?.lastAppliedPeriod,
      lastAcknowledgedPeriod: recEditing?.lastAcknowledgedPeriod,
      leadDays: isDebtAlert ? Math.min(31, Math.max(0, parseInt(recLeadDays, 10) || 3)) : undefined,
      createdMonth: recEditing?.createdMonth ?? currentYearMonth(new Date()),
    };
    if (recEditing) updateRecurringDepositRule(rule);
    else addRecurringDepositRule(rule);
    setRecModalOpen(false);
  };

  const recSelectedAccount = accounts.find(a => a.id === recAccountId);
  const recShowExchange =
    !!recSelectedAccount &&
    !fundAccountMatchesBaseCurrency(recSelectedAccount.currency, baseCurrency);

  // 當帳戶列表變更或初始化時，確保 accountId 有效
  useEffect(() => {
    const eligible =
      type === CashFlowType.LOAN_INTEREST
        ? accounts.filter(a => isBrokerageAccount(a))
        : accounts;
    if (eligible.length > 0 && !eligible.find(a => a.id === accountId)) {
      setAccountId(eligible[0].id);
    }
  }, [accounts, accountId, type]);

  // 當進入編輯模式時，載入現有資金記錄資料
  useEffect(() => {
    if (editingCashFlow) {
      setType(editingCashFlow.type);
      setDate(editingCashFlow.date);
      setAmount(editingCashFlow.amount.toString());
      setFee(editingCashFlow.fee?.toString() || '');
      setAccountId(editingCashFlow.accountId);
      setTargetAccountId(editingCashFlow.targetAccountId || '');
      const acc = accounts.find(a => a.id === editingCashFlow.accountId);
      const tgt = editingCashFlow.targetAccountId
        ? accounts.find(a => a.id === editingCashFlow.targetAccountId)
        : undefined;
      const isEditCrossXfer =
        editingCashFlow.type === CashFlowType.TRANSFER &&
        !!tgt &&
        !!acc &&
        acc.currency !== tgt.currency;
      if (editingCashFlow.exchangeRate != null && editingCashFlow.exchangeRate > 0) {
        if (isEditCrossXfer) {
          setExchangeRate(String(editingCashFlow.exchangeRate));
        } else if (acc && fundAccountMatchesBaseCurrency(acc.currency, baseCurrency)) {
          setExchangeRate('');
        } else if (acc && acc.currency !== Currency.TWD) {
          const v = fundFormTwdPerNativeToAccountBasePair(
            editingCashFlow.exchangeRate,
            baseCurrency,
            rates
          );
          setExchangeRate(v != null ? String(v) : String(editingCashFlow.exchangeRate));
        } else {
          setExchangeRate(String(editingCashFlow.exchangeRate));
        }
      } else {
        setExchangeRate('');
      }
      {
        const raw = editingCashFlow.note ?? '';
        const stripped = stripRecurringMarkersFromNote(raw);
        const hasTag = noteContainsRecurringMarker(raw);
        setNote(hasTag && !stripped ? ff.recurringNoteBadge : stripped);
      }
    } else {
      // 重置為預設值
      setType(CashFlowType.DEPOSIT);
      setDate(new Date().toISOString().split('T')[0]);
      setAmount('');
      setFee('');
      setAccountId(accounts[0]?.id || '');
      setTargetAccountId('');
      setExchangeRate('');
      setNote('');
    }
  }, [editingCashFlow, accounts, ff.recurringNoteBadge, baseCurrency, rates]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return alert(ff.errorNoAccount);

    const numAmount = parseFloat(amount);
    const numFee = fee ? parseFloat(fee) : 0;
    
    // Determine Rate logic based on visibility
    let numRate: number | undefined = undefined;
    
    // Logic to calculate final rate and TWD amount
    const account = accounts.find(a => a.id === accountId);
    const targetAccount = accounts.find(a => a.id === targetAccountId);
    
    const isTransfer = type === CashFlowType.TRANSFER;
    const isInterest = type === CashFlowType.INTEREST;
    const isLoanInterest = type === CashFlowType.LOAN_INTEREST;
    const isSameCurrency = isTransfer && account && targetAccount && account.currency === targetAccount.currency;
    const isCrossXfer =
      isTransfer && account && targetAccount && account.currency !== targetAccount.currency;
    
    if (showExchangeRateInput) {
      const raw = exchangeRate ? parseFloat(exchangeRate) : undefined;
      if (isCrossXfer) {
        numRate = raw;
      } else if (
        raw !== undefined &&
        Number.isFinite(raw) &&
        raw > 0 &&
        account &&
        !fundAccountMatchesBaseCurrency(account.currency, baseCurrency) &&
        account.currency !== Currency.TWD
      ) {
        const conv = fundFormAccountBasePairToTwdPerNative(raw, baseCurrency, rates);
        if (!Number.isFinite(conv) || conv <= 0) {
          alert(ff.exchangeRateInvalid);
          return;
        }
        numRate = conv;
      } else if (account?.currency === Currency.TWD && baseCurrency !== 'TWD') {
        if (raw === undefined || !Number.isFinite(raw) || raw <= 0) {
          alert(ff.exchangeRateInvalid);
          return;
        }
        numRate = raw;
      } else {
        numRate = raw;
      }
    } else if (isSameCurrency) {
       numRate = 1; // Same currency transfer implies rate 1
    } else if (account?.currency === Currency.TWD && !isTransfer) {
       numRate = 1; // TWD Deposit/Withdraw（基準幣為台幣、未顯示匯率欄）
    } else if (
      !isTransfer &&
      !isInterest &&
      !isLoanInterest &&
      account &&
      fundAccountMatchesBaseCurrency(account.currency, baseCurrency)
    ) {
      // 帳戶幣＝基準幣：不顯示匯率欄，改以設定之 TWD/帳戶幣換算
      numRate = currencyToTWDRate(account.currency, rates);
    }

    // Determine amountTWD
    let calculatedTWD: number | undefined = undefined;
    
    if (account && account.currency !== Currency.TWD && numRate) {
       if (type === CashFlowType.DEPOSIT) {
          calculatedTWD = (numAmount * numRate) + numFee;
       } else if (type === CashFlowType.WITHDRAW || type === CashFlowType.LOAN_INTEREST) {
          calculatedTWD = (numAmount * numRate) + numFee;
       } else {
          calculatedTWD = (numAmount * numRate);
       }
    } else if (account?.currency === Currency.TWD) {
        // TWD Logic
        if (type === CashFlowType.DEPOSIT) calculatedTWD = numAmount + numFee;
        else if (type === CashFlowType.WITHDRAW || type === CashFlowType.LOAN_INTEREST) calculatedTWD = numAmount + numFee;
        else calculatedTWD = numAmount;
    }
    
    let finalNote = note.trim();
    if (editingCashFlow && noteContainsRecurringMarker(editingCashFlow.note)) {
      finalNote = mergeNotePreserveRecurringMarkers(editingCashFlow.note, note);
    }

    const cashFlow: CashFlow = {
      id: editingCashFlow ? editingCashFlow.id : uuidv4(),
      date,
      type,
      amount: numAmount,
      amountTWD: calculatedTWD,
      fee: numFee > 0 ? numFee : undefined,
      accountId,
      targetAccountId: type === CashFlowType.TRANSFER ? targetAccountId : undefined,
      exchangeRate: numRate,
      note: finalNote
    };

    // 顯示確認對話框，不直接儲存
    setPendingCashFlow(cashFlow);
    setShowConfirmDialog(true);
  };

  // 確認並儲存資金記錄
  const confirmAndSave = () => {
    if (!pendingCashFlow) return;
    
    if (editingCashFlow && onUpdate) {
      onUpdate(pendingCashFlow);
    } else {
      onAdd(pendingCashFlow);
    }

    // Reset Fields
    setAmount('');
    setFee('');
    setNote('');
    setEditingCashFlow(null);
    setShowConfirmDialog(false);
    setPendingCashFlow(null);
    setIsFormOpen(false); // Close Modal
  };

  // 取消確認，返回編輯
  const cancelConfirm = () => {
    setShowConfirmDialog(false);
    setPendingCashFlow(null);
  };

  const getTypeName = (type: CashFlowType) => {
    switch (type) {
      case CashFlowType.DEPOSIT: return t(language).funds.deposit;
      case CashFlowType.WITHDRAW: return t(language).funds.withdraw;
      case CashFlowType.TRANSFER: return t(language).funds.transfer;
      case CashFlowType.INTEREST: return t(language).funds.interest;
      case CashFlowType.LOAN_INTEREST: return t(language).funds.loanInterest;
      default: return type;
    }
  };

  const selectedAccount = accounts.find(a => a.id === accountId);
  const targetAccount = accounts.find(a => a.id === targetAccountId);
  
  // Logic to determine if Exchange Rate Input should be shown
  const isTransfer = type === CashFlowType.TRANSFER;
  const isInterest = type === CashFlowType.INTEREST;
  const isLoanInterest = type === CashFlowType.LOAN_INTEREST;
  const cashFlowSourceAccounts = useMemo(
    () =>
      isLoanInterest ? accounts.filter(a => isBrokerageAccount(a)) : accounts,
    [accounts, isLoanInterest]
  );
  const isCrossCurrencyTransfer = isTransfer && selectedAccount && targetAccount && selectedAccount.currency !== targetAccount.currency;
  const transferDebtHint =
    isTransfer && selectedAccount && targetAccount
      ? isDebtFundedInflow(
          { type: CashFlowType.TRANSFER, accountId, targetAccountId, amount: 0, date: '', id: '' },
          accounts
        )
        ? ff.transferDebtDisbursementHint
        : isDebtRepaymentOutflow(
            { type: CashFlowType.TRANSFER, accountId, targetAccountId, amount: 0, date: '', id: '' },
            accounts
          )
          ? ff.transferDebtRepaymentHint
          : null
      : null;
  const isSameCurrencyTransfer = isTransfer && selectedAccount && targetAccount && selectedAccount.currency === targetAccount.currency;

  const showExchangeRateInput =
    // 帳戶幣 ≠ 基準幣：顯示 匯率(帳戶幣/基準幣)；同幣時不顯示（改以設定之 TWD/帳戶幣）
    (!isTransfer &&
      !isInterest &&
      !isLoanInterest &&
      !!selectedAccount &&
      !fundAccountMatchesBaseCurrency(selectedAccount.currency, baseCurrency)) ||
    // 跨幣轉帳
    (isTransfer && targetAccountId !== '' && isCrossCurrencyTransfer);

  // 跨幣別轉帳匯率標籤：統一為 匯率 (A/B) = 1 A = 多少 B，故有 USD 時顯示 (USD/他幣)
  const transferRateLabel = useMemo(() => {
    if (!isCrossCurrencyTransfer || !selectedAccount || !targetAccount) return null;
    const src = selectedAccount.currency;
    const tgt = targetAccount.currency;
    let first: string;  // 1 單位幣別（顯示在 / 左邊）
    let second: string;
    if (src === Currency.USD) {
      first = Currency.USD;
      second = tgt;
    } else if (tgt === Currency.USD) {
      first = Currency.USD;
      second = src;
    } else {
      first = tgt;
      second = src;
    }
    return translate('fundForm.exchangeRatePair', language, { quote: first, base: second });
  }, [isCrossCurrencyTransfer, selectedAccount, targetAccount, language]);

  // TWD 對各幣別匯率（用於推算任意兩幣別建議匯率）
  const twdPerCurrency = useMemo(() => ({
    [Currency.TWD]: 1,
    [Currency.USD]: currentExchangeRate,
    [Currency.JPY]: currentJpyExchangeRate,
    [Currency.EUR]: currentEurExchangeRate ?? 0,
    [Currency.GBP]: currentGbpExchangeRate ?? 0,
    [Currency.HKD]: currentHkdExchangeRate ?? 0,
    [Currency.KRW]: currentKrwExchangeRate ?? 0,
    [Currency.CAD]: currentCadExchangeRate ?? 0,
    [Currency.INR]: currentInrExchangeRate ?? 0,
  } as Record<string, number>), [currentExchangeRate, currentJpyExchangeRate, currentEurExchangeRate, currentGbpExchangeRate, currentHkdExchangeRate, currentKrwExchangeRate, currentCadExchangeRate, currentInrExchangeRate]);

  // 跨幣別轉帳時之建議匯率 placeholder（與 transferRateLabel 約定一致）
  const transferRatePlaceholder = useMemo(() => {
    if (!isCrossCurrencyTransfer || !selectedAccount || !targetAccount) return undefined;
    const src = selectedAccount.currency;
    const tgt = targetAccount.currency;
    const twdSrc = twdPerCurrency[src];
    const twdTgt = twdPerCurrency[tgt];
    if (src === Currency.USD) {
      if (twdTgt > 0) return (currentExchangeRate / twdTgt).toFixed(4);
      return undefined;
    }
    if (tgt === Currency.USD) {
      if (twdSrc > 0) return (currentExchangeRate / twdSrc).toFixed(4);
      return undefined;
    }
    // 兩方皆非 USD：匯率 (target/source) = 1 target = X source，placeholder = source per 1 target
    if (twdSrc > 0 && twdTgt > 0) {
      const sourcePerTarget = src === Currency.TWD ? twdTgt : 1 / twdSrc;
      return sourcePerTarget.toFixed(4);
    }
    return undefined;
  }, [isCrossCurrencyTransfer, selectedAccount, targetAccount, twdPerCurrency, currentExchangeRate]);

  const fundNonTransferRateLabel = useMemo(() => {
    if (!selectedAccount) return ff.exchangeRate;
    return translate('fundForm.exchangeRatePair', language, {
      quote: selectedAccount.currency,
      base: baseCurrency,
    });
  }, [selectedAccount, baseCurrency, language, ff]);

  const fundEntryRatePlaceholder = useMemo(() => {
    if (!selectedAccount) return currentExchangeRate.toString();
    if (fundAccountMatchesBaseCurrency(selectedAccount.currency, baseCurrency)) {
      return currentExchangeRate.toString();
    }
    // 每 1 帳戶幣 = 多少基準幣（TWD+JPY 為 twdPerAcct/twdPerBase，勿用「每 1 JPY 幾 TWD」當 placeholder）
    const twdPerBase = currencyToTWDRate(baseCurrencyToCurrency(baseCurrency), rates);
    const twdPerAcct = currencyToTWDRate(selectedAccount.currency, rates);
    if (twdPerBase > 0 && twdPerAcct > 0) {
      return (twdPerAcct / twdPerBase).toFixed(4);
    }
    return currentExchangeRate.toString();
  }, [selectedAccount, baseCurrency, rates, currentExchangeRate]);

  // Filter Logic
  const filteredFlows = useMemo(() => {
    return cashFlows.filter(cf => {
      const matchAccount = filterAccount ? (cf.accountId === filterAccount || cf.targetAccountId === filterAccount) : true;
      const matchType = filterType ? cf.type === filterType : true;
      const matchDateFrom = filterDateFrom ? cf.date >= filterDateFrom : true;
      const matchDateTo = filterDateTo ? cf.date <= filterDateTo : true;
      return matchAccount && matchType && matchDateFrom && matchDateTo;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [cashFlows, filterAccount, filterType, filterDateFrom, filterDateTo]);

  const clearFilters = () => {
    setFilterAccount('');
    setFilterType('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const hasActiveFilters = Boolean(filterAccount || filterType || filterDateFrom || filterDateTo);
  const fundsTr = t(language).funds;
  const renderShowRecordsLabel = () =>
    translate('funds.showRecords', language, { count: filteredFlows.length }).split('{count}').map((part, index, array) =>
      index === array.length - 1 ? part : (
        <React.Fragment key={index}>
          {part}
          <span className="font-semibold text-slate-800">{filteredFlows.length}</span>
        </React.Fragment>
      )
    );

  return (
    <div className="space-y-6">
      
      {/* 1. Operation Options Bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-100">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <h3 className="text-base sm:text-lg font-bold text-slate-700">{fundsTr.operations}</h3>
            <div className="flex flex-wrap gap-2">
               {/* 順序與交易紀錄互應：查詢 → 頁面專屬 → 批次匯入 → 清除 → 記一筆 */}
               <button
                 type="button"
                 onClick={() => setShowFilterPanel(v => !v)}
                 aria-expanded={showFilterPanel}
                 className={`px-3 py-1.5 rounded text-sm whitespace-nowrap border transition ${
                   showFilterPanel || hasActiveFilters
                     ? 'bg-sky-600 text-white border-sky-600 hover:bg-sky-700'
                     : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                 }`}
               >
                  {fundsTr.filter}
               </button>
               <button
                 type="button"
                 onClick={() => {
                   setShowScheduleSection(v => {
                     const next = !v;
                     if (next && !showRecurringPanel && !showDebtAlertPanel) {
                       setShowRecurringPanel(true);
                     }
                     return next;
                   });
                 }}
                 aria-expanded={showScheduleSection}
                 className={`px-3 py-1.5 rounded text-sm whitespace-nowrap border transition ${
                   showScheduleSection || recurringDepositRules.length > 0
                     ? 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700'
                     : 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                 }`}
               >
                  {ff.recurringSectionTitle}
               </button>
               <button onClick={() => setIsBatchOpen(true)} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded text-sm hover:bg-indigo-100 border border-indigo-200 whitespace-nowrap">
                  {fundsTr.batchImport}
               </button>
               <button
                 onClick={() => setIsClearConfirmOpen(true)}
                 disabled={filteredFlows.length === 0}
                 className="bg-red-50 text-red-600 px-3 py-1.5 rounded text-sm hover:bg-red-100 border border-red-200 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-50"
               >
                  {fundsTr.clearAll}
               </button>
               <button onClick={() => {
                 setEditingCashFlow(null);
                 setIsFormOpen(true);
               }} className="app-primary-btn px-4 py-2 rounded text-sm whitespace-nowrap">
                  {fundsTr.addRecord}
               </button>
            </div>
          </div>
      </div>

      {/* 1b. 定期規程與負債警示：僅在操作選項按標題按鈕時顯示 */}
      {showScheduleSection && (
      <div className="app-section-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-700">{ff.recurringSectionTitle}</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowRecurringPanel(v => !v)}
              className={`px-3 py-1.5 rounded text-sm font-medium border transition whitespace-nowrap ${schedulePanelToggleClass(showRecurringPanel)}`}
            >
              {showRecurringPanel ? ff.toggleHideRecurring : ff.toggleShowRecurring}
            </button>
            {onMinDebtSafetySpreadChange && (
              <button
                type="button"
                onClick={() => setShowDebtAlertPanel(v => !v)}
                className={`px-3 py-1.5 rounded text-sm font-medium border transition whitespace-nowrap ${schedulePanelToggleClass(showDebtAlertPanel)}`}
              >
                {showDebtAlertPanel ? ff.toggleHideDebtAlert : ff.toggleShowDebtAlert}
              </button>
            )}
          </div>
        </div>

        {showRecurringPanel && (
        <div className="space-y-3 animate-fade-in border-t border-slate-100 pt-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-700">{ff.recurringRulesTitle}</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">{ff.recurringDisclaimer}</p>
            </div>
            <button
              type="button"
              onClick={() => openRecModal()}
              disabled={accounts.length === 0}
              className="shrink-0 bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ff.recurringAddRule}
            </button>
          </div>
          {recurringDepositRules.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">{ff.recurringNoRules}</p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
              {recurringDepositRules.map(r => {
              const acc = accounts.find(a => a.id === r.accountId);
              const isDebtAlert = r.kind === 'DEBT_PAYMENT_ALERT';
              return (
                <li key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <label className="flex items-center gap-2 text-sm shrink-0">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={() => updateRecurringDepositRule({ ...r, enabled: !r.enabled })}
                      className="rounded border-slate-300"
                    />
                    <span className="text-slate-600">{ff.recurringEnabled}</span>
                  </label>
                  <span className={`text-sm font-medium flex-1 ${isDebtAlert ? 'text-red-700' : 'text-slate-800'}`}>
                    {isDebtAlert ? (
                      <>
                        <span className="text-xs font-bold uppercase mr-1">[{ff.recurringKindDebtAlert}]</span>
                        {translate('fundForm.recurringDayShort', language, {
                          day: r.dayOfMonth,
                          account: acc?.name ?? r.accountId,
                          amount: r.amount.toLocaleString(),
                          ccy: acc?.currency ?? '',
                        })}
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-bold text-green-700 uppercase mr-1">[{ff.recurringKindDeposit}]</span>
                        {translate('fundForm.recurringDayShort', language, {
                          day: r.dayOfMonth,
                          account: acc?.name ?? r.accountId,
                          amount: r.amount.toLocaleString(),
                          ccy: acc?.currency ?? '',
                        })}
                      </>
                    )}
                  </span>
                  <span className="text-xs text-slate-500">
                    {r.lastAppliedPeriod
                      ? translate('fundForm.recurringLastApplied', language, { period: r.lastAppliedPeriod })
                      : '—'}
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openRecModal(r)}
                      className="text-indigo-600 text-sm hover:underline"
                    >
                      {ff.recurringEditRule}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(ff.recurringDeleteConfirm)) removeRecurringDepositRule(r.id);
                      }}
                      className="text-red-600 text-sm hover:underline"
                    >
                      {ff.recurringDeleteRule}
                    </button>
                  </div>
                </li>
              );
              })}
            </ul>
          )}
        </div>
        )}

        {showDebtAlertPanel && onMinDebtSafetySpreadChange && (
          <div className="space-y-2 border-t border-slate-200 pt-4 animate-fade-in">
            <h4 className="text-sm font-semibold text-slate-700">{ff.debtAlertSettingsTitle}</h4>
            <p className="text-xs text-slate-500 max-w-2xl">{ff.minSafetySpreadHelp}</p>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span>{ff.minSafetySpread}</span>
              <input
                type="number"
                inputMode={INPUT_MODE_DECIMAL}
                min={0}
                max={20}
                step={0.5}
                value={safetySpreadDraft}
                onChange={e => setSafetySpreadDraft(e.target.value)}
                onBlur={() => {
                  const raw = safetySpreadDraft.trim();
                  if (raw === '' || raw === '-' || raw === '.') {
                    setSafetySpreadDraft(String(minDebtSafetySpread));
                    return;
                  }
                  const parsed = parseFloat(raw);
                  if (!Number.isFinite(parsed)) {
                    setSafetySpreadDraft(String(minDebtSafetySpread));
                    return;
                  }
                  const clamped = Math.min(20, Math.max(0, parsed));
                  onMinDebtSafetySpreadChange(clamped);
                  setSafetySpreadDraft(String(clamped));
                }}
                className={`w-20 border border-slate-300 rounded px-2 py-1 text-base sm:text-sm ${FORM_FIELD_THEME}`}
              />
            </label>
          </div>
        )}
      </div>
      )}

      {recModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-2 sm:p-4 z-[55] animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[95vh] overflow-hidden flex flex-col">
            <div className="app-modal-header p-3 sm:p-4 flex justify-between items-center shrink-0">
              <h2 className="text-white font-bold text-base sm:text-lg">
                {recEditing ? ff.recurringEditRule : ff.recurringAddRule}
              </h2>
              <button
                type="button"
                onClick={() => setRecModalOpen(false)}
                className="text-slate-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <form onSubmit={saveRecRule} className="p-4 sm:p-6 overflow-y-auto space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={recEnabled}
                  onChange={e => setRecEnabled(e.target.checked)}
                  className="rounded"
                />
                <span>{ff.recurringEnabled}</span>
              </label>
              <div>
                <label className="block text-slate-700 dark:text-slate-200 font-medium">{ff.type}</label>
                <select
                  value={recKind}
                  onChange={e => setRecKind(e.target.value as ScheduledRuleKind)}
                  className={`mt-1 w-full border border-slate-300 rounded p-2 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                >
                  <option value="RECURRING_DEPOSIT">{ff.recurringKindDeposit}</option>
                  <option value="DEBT_PAYMENT_ALERT">{ff.recurringKindDebtAlert}</option>
                </select>
              </div>
              {recKind === 'DEBT_PAYMENT_ALERT' && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-200 font-medium">{ff.recurringLeadDays}</label>
                  <input
                    type="number"
                    inputMode={INPUT_MODE_NUMERIC}
                    min={0}
                    max={31}
                    value={recLeadDays}
                    onChange={e => setRecLeadDays(e.target.value)}
                    className={`mt-1 w-full border border-slate-300 rounded p-2 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                  />
                </div>
              )}
              <div>
                <label className="block text-slate-700 dark:text-slate-200 font-medium">{ff.recurringDayOfMonth}</label>
                <input
                  type="number"
                  inputMode={INPUT_MODE_NUMERIC}
                  min={1}
                  max={31}
                  required
                  value={recDay}
                  onChange={e => setRecDay(e.target.value)}
                  className={`mt-1 w-full border border-slate-300 rounded p-2 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-200 font-medium">{ff.account}</label>
                <select
                  value={recAccountId}
                  onChange={e => setRecAccountId(e.target.value)}
                  required
                  className={`mt-1 w-full border border-slate-300 rounded p-2 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                >
                  {accounts
                    .filter(a => (recKind === 'DEBT_PAYMENT_ALERT' ? isLiabilityAccount(a) : !isLiabilityAccount(a)))
                    .map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-200 font-medium">
                  {ff.amount} ({recSelectedAccount?.currency ?? 'TWD'})
                </label>
                <input
                  type="number"
                inputMode={INPUT_MODE_DECIMAL}
                  min={0}
                  step="0.01"
                  required
                  value={recAmount}
                  onChange={e => setRecAmount(e.target.value)}
                  className={`mt-1 w-full border border-slate-300 rounded p-2 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                />
              </div>
              {recShowExchange && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-200 font-medium">
                    {recSelectedAccount
                      ? translate('fundForm.exchangeRatePair', language, {
                          quote: recSelectedAccount.currency,
                          base: baseCurrency,
                        })
                      : ff.exchangeRate}
                  </label>
                  <input
                    type="number"
                inputMode={INPUT_MODE_DECIMAL}
                    step="0.0001"
                    placeholder={
                      (() => {
                        const rec = recSelectedAccount;
                        if (!rec) return currentExchangeRate.toString();
                        if (fundAccountMatchesBaseCurrency(rec.currency, baseCurrency)) {
                          return currentExchangeRate.toString();
                        }
                        const twdB = currencyToTWDRate(baseCurrencyToCurrency(baseCurrency), rates);
                        const twdA = currencyToTWDRate(rec.currency, rates);
                        if (twdB > 0 && twdA > 0) return (twdA / twdB).toFixed(4);
                        return currentExchangeRate.toString();
                      })()
                    }
                    value={recEx}
                    onChange={e => setRecEx(e.target.value)}
                    className={`mt-1 w-full border border-slate-300 rounded p-2 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                  />
                </div>
              )}
              <div>
                <label className="block text-slate-700 dark:text-slate-200 font-medium">
                  {translate('fundForm.fees', language, { currency: baseCurrency })}{' '}
                  <span className="text-xs font-normal text-slate-400">{ff.feesNote}</span>
                </label>
                <input
                  type="number"
                inputMode={INPUT_MODE_DECIMAL}
                  step="0.01"
                  value={recFee}
                  onChange={e => setRecFee(e.target.value)}
                  className={`mt-1 w-full border border-slate-300 rounded p-2 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-200 font-medium">{ff.recurringAmountTwdOptional}</label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-1 leading-relaxed">{ff.recurringAmountTwdHelp}</p>
                <input
                  type="number"
                inputMode={INPUT_MODE_DECIMAL}
                  step="0.01"
                  value={recAmountTwd}
                  onChange={e => setRecAmountTwd(e.target.value)}
                  className={`mt-1 w-full border border-slate-300 rounded p-2 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-200 font-medium">{ff.recurringStartMonth}</label>
                <input
                  type="month"
                  value={recStartMonth}
                  onChange={e => setRecStartMonth(e.target.value)}
                  className={`mt-1 w-full border border-slate-300 rounded p-2 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                />
                <p className="text-xs text-slate-500 mt-1">{ff.recurringStartMonthHint}</p>
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-200 font-medium">{ff.note}</label>
                <input
                  type="text"
                  value={recNote}
                  onChange={e => setRecNote(e.target.value)}
                  className={`mt-1 w-full border border-slate-300 rounded p-2 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRecModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-md"
                >
                  {ff.cancel}
                </button>
                <button type="submit" className="flex-1 px-4 py-2 app-primary-btn rounded-md">
                  {ff.recurringSaveRule}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Filters：僅在操作選項按「查詢/篩選」時顯示 */}
      {showFilterPanel && (
      <div className="app-section-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">{fundsTr.filter}</h3>
            <button 
              onClick={clearFilters}
              className="text-sm text-slate-500 hover:text-slate-700 underline"
            >
              {fundsTr.clearFilters}
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
             {/* 帳戶篩選 */}
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-2">
                 {fundsTr.accountFilter}
               </label>
               <select 
                  value={filterAccount} 
                  onChange={e => setFilterAccount(e.target.value)} 
                  className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
               >
                  <option value="">{fundsTr.allAccounts}</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
               </select>
             </div>

             {/* 類別篩選 */}
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-2">
                 {fundsTr.typeFilter}
               </label>
               <select 
                  value={filterType} 
                  onChange={e => setFilterType(e.target.value)} 
                  className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
               >
                  <option value="">{fundsTr.allTypes}</option>
                  <option value={CashFlowType.DEPOSIT}>{fundsTr.deposit}</option>
                  <option value={CashFlowType.WITHDRAW}>{fundsTr.withdraw}</option>
                  <option value={CashFlowType.TRANSFER}>{fundsTr.transfer}</option>
                  <option value={CashFlowType.INTEREST}>{fundsTr.interest}</option>
                  <option value={CashFlowType.LOAN_INTEREST}>{fundsTr.loanInterest}</option>
               </select>
             </div>

             {/* 起始日 */}
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-2">
                 {fundsTr.dateFrom}
               </label>
               <input 
                  type="date" 
                  value={filterDateFrom} 
                  onChange={e => setFilterDateFrom(e.target.value)} 
                  className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`} 
               />
             </div>

             {/* 結束日 */}
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-2">
                 {fundsTr.dateTo}
               </label>
               <input 
                  type="date" 
                  value={filterDateTo} 
                  onChange={e => setFilterDateTo(e.target.value)} 
                  className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`} 
               />
             </div>
          </div>
          
          {/* 篩選結果統計與快速按鈕 */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div className="text-sm text-slate-600">
              {renderShowRecordsLabel()}
              {filteredFlows.length !== cashFlows.length && (
                <span className="text-slate-500">
                  {' '}{translate('funds.totalRecords', language, { total: cashFlows.length })}
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const thirtyDaysAgo = new Date();
                  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                  setFilterDateFrom(thirtyDaysAgo.toISOString().split('T')[0]);
                  setFilterDateTo(new Date().toISOString().split('T')[0]);
                }}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition"
              >
                {fundsTr.last30Days}
              </button>
              <button
                onClick={() => {
                  const currentYear = new Date().getFullYear();
                  setFilterDateFrom(`${currentYear}-01-01`);
                  setFilterDateTo(`${currentYear}-12-31`);
                }}
                className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition"
              >
                {fundsTr.thisYear}
              </button>
            </div>
          </div>
      </div>
      )}

      {!showFilterPanel && (
        <div className="text-sm text-slate-600 px-1">
          {renderShowRecordsLabel()}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setShowFilterPanel(true)}
              className="ml-2 text-sky-700 hover:underline"
            >
              {fundsTr.filter}
            </button>
          )}
          {filteredFlows.length !== cashFlows.length && (
            <span className="text-slate-500">
              {' '}{translate('funds.totalRecords', language, { total: cashFlows.length })}
            </span>
          )}
        </div>
      )}

      {/* 3. List Table：捲動放內層，避免 app-section-card 的 overflow:hidden 蓋掉滾輪 */}
      <div className="app-section-card">
        <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-100 dark:border-slate-700">
            <tr>
              <th className="px-2 sm:px-3 py-2 whitespace-nowrap">{t(language).labels.date}</th>
              <th className="px-2 sm:px-3 py-2 text-right whitespace-nowrap">{t(language).labels.amount}</th>
              <th className="px-2 sm:px-3 py-2 text-right whitespace-nowrap hidden sm:table-cell">{t(language).labels.exchangeRate}</th>
              <th className="px-2 sm:px-3 py-2 text-right whitespace-nowrap hidden sm:table-cell">{t(language).labels.fee}</th>
              <th className="px-2 sm:px-3 py-2 text-right whitespace-nowrap">{t(language).labels.totalCost} ({baseCurrency})</th>
              <th className="px-2 sm:px-3 py-2 whitespace-nowrap">{t(language).labels.account}</th>
              <th className="px-2 sm:px-3 py-2 whitespace-nowrap hidden sm:table-cell">{t(language).labels.category}</th>
              <th className="px-2 sm:px-3 py-2 text-center whitespace-nowrap">{t(language).labels.action}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredFlows.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">{(language === 'en' || language === 'de' || language === 'fr' || language === 'hi') ? 'No matching records found.' : '沒有符合條件的資金紀錄。'}</td></tr>
            ) : (
                filteredFlows.map(cf => {
                   const account = accounts.find(a => a.id === cf.accountId);
                   const accountName = account?.name || 'Unknown';
                   const targetName = accounts.find(a => a.id === cf.targetAccountId)?.name;
                   const accountCurrency = account?.currency ?? Currency.TWD;

                   const noteFeeMatch = cf.note?.match(/手續費:\s*(\d+(\.\d+)?)/);
                   const displayFee = cf.fee !== undefined ? cf.fee : (noteFeeMatch ? noteFeeMatch[1] : '-');

                   const noteAfterFeeStrip = cf.note?.replace(/\(手續費:.*?\)/, '').trim() ?? '';
                   const categoryNoteDisplay = stripRecurringMarkersFromNote(noteAfterFeeStrip);
                   const showRecurringBadgeOnly =
                     noteContainsRecurringMarker(cf.note) && !categoryNoteDisplay;

                   const tgtAcc = cf.targetAccountId ? accounts.find(a => a.id === cf.targetAccountId) : undefined;
                   const isCfCrossXfer =
                     cf.type === CashFlowType.TRANSFER &&
                     !!tgtAcc &&
                     !!account &&
                     account.currency !== tgtAcc.currency;
                   const needsTwdPerAccountForCost = account && account.currency !== Currency.TWD;

                   // 總計成本 (TWD)，用於換算為基準幣顯示
                   const rate =
                     cf.exchangeRate ??
                     (needsTwdPerAccountForCost ? currencyToTWDRate(accountCurrency, rates) : 1);
                   const baseAmt = needsTwdPerAccountForCost ? cf.amount * (rate || 1) : cf.amount;
                   const feeVal = cf.fee || 0;
                   let displayTotalTWD = 0;
                   if (
                     cf.type === CashFlowType.DEPOSIT ||
                     cf.type === CashFlowType.WITHDRAW ||
                     cf.type === CashFlowType.LOAN_INTEREST
                   ) {
                       // 匯入／匯出／信貸利息：總計成本 = 金額 + 手續費（與儲存邏輯一致）
                       displayTotalTWD = baseAmt + feeVal;
                   } else if (cf.amountTWD != null) {
                       displayTotalTWD = cf.amountTWD;
                   } else {
                       displayTotalTWD = baseAmt;
                   }

                   let displayExRateStr = '-';
                   if (cf.exchangeRate != null && cf.exchangeRate > 0) {
                     if (isCfCrossXfer) {
                       displayExRateStr = String(cf.exchangeRate);
                     } else if (
                       account &&
                       !fundAccountMatchesBaseCurrency(account.currency, baseCurrency)
                     ) {
                       if (account.currency === Currency.TWD) {
                         displayExRateStr = String(cf.exchangeRate);
                       } else {
                         const v = fundFormTwdPerNativeToAccountBasePair(
                           cf.exchangeRate,
                           baseCurrency,
                           rates
                         );
                         displayExRateStr = v != null ? v.toFixed(4) : String(cf.exchangeRate);
                       }
                     } else {
                       displayExRateStr = String(cf.exchangeRate);
                     }
                   }

                   const isDebtInCf = isDebtFundedInflow(cf, accounts);
                   const isDebtOutCf = isDebtRepaymentOutflow(cf, accounts);
                   const typeBadgeClass =
                     cf.type === CashFlowType.DEPOSIT ||
                     cf.type === CashFlowType.INTEREST ||
                     cf.type === CashFlowType.LOAN_INTEREST ||
                     isDebtInCf
                       ? 'bg-green-100 text-green-700'
                       : cf.type === CashFlowType.WITHDRAW || isDebtOutCf
                         ? 'bg-red-100 text-red-700'
                         : 'bg-blue-100 text-blue-700';
                   const trDash = t(language).dashboard;
                   const typeBadgeLabel = isDebtInCf
                     ? trDash.debtDisbursement
                     : isDebtOutCf
                       ? trDash.debtRepayment
                       : getTypeName(cf.type);

                   return (
                     <tr key={cf.id} className={recordRowClassName(isRecordHighlighted(cf.id))}>
                       <td className="px-2 sm:px-3 py-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">{cf.date}</td>

                       <td className="px-2 sm:px-3 py-2 text-right font-mono text-slate-800 dark:text-slate-100">
                         {formatCurrency(cf.amount, accountCurrency)}
                       </td>

                       <td className="px-2 sm:px-3 py-2 text-right text-slate-500 dark:text-slate-300 hidden sm:table-cell">
                         {displayExRateStr}
                       </td>

                       <td className="px-2 sm:px-3 py-2 text-right text-slate-400 dark:text-slate-500 hidden sm:table-cell">
                         {displayFee == null || displayFee === '-' || displayFee === '' ? '-' : String(displayFee)}
                       </td>

                       <td className="px-2 sm:px-3 py-2 text-right font-bold text-emerald-700">
                         {formatCurrency(toBase(displayTotalTWD), baseCurrency)}
                       </td>

                       <td className="px-2 sm:px-3 py-2 text-slate-700 dark:text-slate-100 whitespace-nowrap">
                         <div className="flex flex-col">
                           <span>{accountName}</span>
                           {cf.type === CashFlowType.TRANSFER && targetName && <span className="text-slate-400 dark:text-slate-500 text-xs">→ {targetName}</span>}
                         </div>
                       </td>

                       <td className="px-2 sm:px-3 py-2 text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                         <div className="flex flex-col gap-1">
                           <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${typeBadgeClass}`}>
                             {typeBadgeLabel}
                           </span>
                           {cf.note && (
                             <span className="text-xs text-slate-500 dark:text-slate-400">
                               {categoryNoteDisplay}
                               {showRecurringBadgeOnly ? (
                                 <span className="text-indigo-600 dark:text-indigo-400 font-medium">{ff.recurringNoteBadge}</span>
                               ) : (
                                 noteContainsRecurringMarker(cf.note) && (
                                   <span className="ml-1 text-indigo-500 dark:text-indigo-400">· {ff.recurringNoteBadge}</span>
                                 )
                               )}
                             </span>
                           )}
                         </div>
                       </td>

                       <td className="px-2 sm:px-3 py-2 text-right">
                         <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 justify-end items-end sm:items-center">
                             <button 
                               onClick={() => {
                                 setEditingCashFlow(cf);
                                 setIsFormOpen(true);
                               }} 
                               className="text-blue-400 hover:text-blue-600 text-sm border border-blue-200 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded hover:bg-blue-50 whitespace-nowrap"
                             >
                               {translations.common.edit}
                             </button>
                           <button onClick={() => onDelete(cf.id)} className="text-red-400 hover:text-red-600 text-sm border border-red-200 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded hover:bg-red-50 whitespace-nowrap">{translations.common.delete}</button>
                         </div>
                       </td>
                     </tr>
                   );
                })
            )}
          </tbody>
        </table>
      </div>
      </div>
      
      {/* 確認對話框 */}
      {showConfirmDialog && pendingCashFlow && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="app-modal-header p-4">
              <h3 className="text-white font-bold text-lg">{ff.confirmTitle}</h3>
            </div>
            <div className="p-6 space-y-3">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/40 rounded-lg p-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-100 font-medium">{ff.confirmMessage}</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-300">{ff.dateLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{pendingCashFlow.date}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-300">{ff.typeLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{getTypeName(pendingCashFlow.type)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-300">{ff.accountLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{accounts.find(a => a.id === pendingCashFlow.accountId)?.name || pendingCashFlow.accountId} ({accounts.find(a => a.id === pendingCashFlow.accountId)?.currency || ''})</span>
                </div>
                {pendingCashFlow.targetAccountId && (
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-300">{ff.targetAccountLabel}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{accounts.find(a => a.id === pendingCashFlow.targetAccountId)?.name || pendingCashFlow.targetAccountId} ({accounts.find(a => a.id === pendingCashFlow.targetAccountId)?.currency || ''})</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-300">{ff.amountLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {pendingCashFlow.amount.toLocaleString()} {accounts.find(a => a.id === pendingCashFlow.accountId)?.currency || ''}
                  </span>
                </div>
                {pendingCashFlow.exchangeRate != null && pendingCashFlow.exchangeRate > 0 && (() => {
                  const pAcc = accounts.find(a => a.id === pendingCashFlow.accountId);
                  const pTgt = pendingCashFlow.targetAccountId
                    ? accounts.find(a => a.id === pendingCashFlow.targetAccountId)
                    : undefined;
                  const pCross =
                    pendingCashFlow.type === CashFlowType.TRANSFER &&
                    !!pTgt &&
                    !!pAcc &&
                    pAcc.currency !== pTgt.currency;
                  let shown = String(pendingCashFlow.exchangeRate);
                  if (
                    !pCross &&
                    pAcc &&
                    !fundAccountMatchesBaseCurrency(pAcc.currency, baseCurrency)
                  ) {
                    if (pAcc.currency === Currency.TWD) {
                      shown = String(pendingCashFlow.exchangeRate);
                    } else {
                      const v = fundFormTwdPerNativeToAccountBasePair(
                        pendingCashFlow.exchangeRate,
                        baseCurrency,
                        rates
                      );
                      if (v != null) shown = v.toFixed(4);
                    }
                  }
                  return (
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                      <span className="text-slate-600 dark:text-slate-300">{ff.exchangeRateLabel}</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{shown}</span>
                    </div>
                  );
                })()}
                {pendingCashFlow.fee && (
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-300">{ff.feesLabel}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{pendingCashFlow.fee.toLocaleString()} {baseCurrency}</span>
                  </div>
                )}
                {pendingCashFlow.note && (() => {
                  const stripped = stripRecurringMarkersFromNote(pendingCashFlow.note ?? '');
                  const hasR = noteContainsRecurringMarker(pendingCashFlow.note);
                  const displayNoteConfirm = hasR
                    ? (stripped ? `${stripped} · ${ff.recurringNoteBadge}` : ff.recurringNoteBadge)
                    : stripped;
                  return (
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                      <span className="text-slate-600 dark:text-slate-300">{ff.noteLabel}</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100 text-right max-w-[60%]">{displayNoteConfirm}</span>
                    </div>
                  );
                })()}
                {pendingCashFlow.amountTWD != null && (
                  <div className="border-t-2 border-slate-300 pt-2 mt-2">
                    <div className="flex justify-between">
                      <span className="text-slate-700 font-semibold">{translate('fundForm.totalTWD', language, { currency: baseCurrency })}</span>
                      <span className="font-bold text-lg text-slate-900">
                        {formatCurrency(toBase(pendingCashFlow.amountTWD), baseCurrency)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={cancelConfirm}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
                >
                  {ff.backToEdit}
                </button>
                <button
                  type="button"
                  onClick={confirmAndSave}
                  className="flex-1 px-4 py-2 app-primary-btn rounded-md"
                >
                  {ff.confirmSave}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">
             <div className="app-modal-header p-3 sm:p-4 flex justify-between items-center shrink-0">
                <h2 className="text-white font-bold text-base sm:text-lg">{editingCashFlow ? ff.editFundRecord : ff.addFundRecord}</h2>
                <button onClick={() => {
                  setIsFormOpen(false);
                  setEditingCashFlow(null);
                }} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
             </div>
             
             <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{ff.date}</label>
                      <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={`mt-1 w-full border border-slate-300 rounded p-2 ${FORM_FIELD_THEME}`}/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{ff.type}</label>
                      <select value={type} onChange={e => setType(e.target.value as CashFlowType)} className={`mt-1 w-full border border-slate-300 rounded p-2 ${FORM_FIELD_THEME}`}>
                        <option value={CashFlowType.DEPOSIT}>{ff.typeDeposit}</option>
                        <option value={CashFlowType.WITHDRAW}>{ff.typeWithdraw}</option>
                        <option value={CashFlowType.TRANSFER}>{ff.typeTransfer}</option>
                        <option value={CashFlowType.INTEREST}>{ff.typeInterest}</option>
                        <option value={CashFlowType.LOAN_INTEREST}>{t(language).funds.loanInterest}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                        {type === CashFlowType.TRANSFER ? ff.sourceAccount : ff.account}
                      </label>
                      <select value={accountId} onChange={e => setAccountId(e.target.value)} className={`mt-1 w-full border border-slate-300 rounded p-2 ${FORM_FIELD_THEME}`}>
                        {cashFlowSourceAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{ff.amount} ({selectedAccount?.currency || 'TWD'})</label>
                      <input type="number" inputMode={INPUT_MODE_DECIMAL} required min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={`mt-1 w-full border border-slate-300 rounded p-2 ${FORM_FIELD_THEME}`}/>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-slate-50 dark:bg-slate-700/40 p-3 sm:p-4 rounded border border-slate-100 dark:border-slate-600">
                     {type === CashFlowType.TRANSFER && (
                         <div className="sm:col-span-2">
                           <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{ff.targetAccount}</label>
                           <select required value={targetAccountId} onChange={e => setTargetAccountId(e.target.value)} className={`mt-1 w-full border border-slate-300 rounded p-2 ${FORM_FIELD_THEME}`}>
                              <option value="">{ff.selectAccount}</option>
                              {accounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                           </select>
                           {transferDebtHint && (
                             <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">{transferDebtHint}</p>
                           )}
                         </div>
                     )}

                     {/* Dynamic Fields based on Account Type & Action */}
                     {showExchangeRateInput ? (
                       <div>
                         <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                            {transferRateLabel ?? fundNonTransferRateLabel}
                            {isCrossCurrencyTransfer && <span className="text-xs text-blue-600 ml-1">{ff.crossCurrencyTransfer}</span>}
                            {!isTransfer && selectedAccount?.currency === Currency.USD && <span className="text-xs text-green-600 ml-1">{ff.usdConversion}</span>}
                            {!isTransfer && selectedAccount?.currency === Currency.JPY && <span className="text-xs text-orange-600 ml-1">{ff.jpyConversion}</span>}
                         </label>
                         <input 
                           type="number"
                inputMode={INPUT_MODE_DECIMAL} 
                           step="0.0001" 
                           placeholder={transferRatePlaceholder ?? fundEntryRatePlaceholder} 
                           value={exchangeRate} 
                           onChange={e => setExchangeRate(e.target.value)} 
                           className={`mt-1 w-full border border-slate-300 rounded p-2 text-base sm:text-sm ${FORM_FIELD_THEME}`}
                           required
                         />
                       </div>
                     ) : (
                        isSameCurrencyTransfer && (
                            <div className="pb-2 flex items-end h-full">
                                <span className="text-sm font-bold text-slate-500 bg-slate-200 px-3 py-1.5 rounded-full">
                                   {ff.sameCurrencyTransfer}
                                </span>
                            </div>
                        )
                     )}

                     <div>
                       <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{translate('fundForm.fees', language, { currency: baseCurrency })} <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">{ff.feesNote}</span></label>
                       <input type="number" inputMode={INPUT_MODE_NUMERIC} step="1" placeholder="0" value={fee} onChange={e => setFee(e.target.value)} className={`mt-1 w-full border border-slate-300 rounded p-2 ${FORM_FIELD_THEME}`}/>
                     </div>
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{ff.note}</label>
                     <input type="text" value={note} onChange={e => setNote(e.target.value)} className={`mt-1 w-full border border-slate-300 rounded p-2 ${FORM_FIELD_THEME}`}/>
                  </div>

                  <div className="pt-3 sm:pt-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <button 
                      type="button" 
                      onClick={() => {
                        setIsFormOpen(false);
                        setEditingCashFlow(null);
                      }}
                      className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 text-sm sm:text-base"
                    >
                      {ff.cancel}
                    </button>
                    <button 
                      type="submit" 
                      className="flex-1 px-4 py-2 app-primary-btn rounded-md text-sm sm:text-base"
                    >
                      {editingCashFlow ? ff.updateRecord : ff.confirmExecute}
                    </button>
                  </div>
                </form>
             </div>
          </div>
        </div>
      )}
      
      {/* 5. Clear All Confirmation Modal */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
           <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 max-w-sm w-full mx-4">
              <h3 className="text-base sm:text-lg font-bold text-red-600 mb-2">{translations.funds.confirmClearAll}</h3>
              <p className="text-sm sm:text-base text-slate-600 mb-6">
                {translate('funds.confirmClearAllMessage', language, { count: filteredFlows.length })}
              </p>
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                 <button type="button" onClick={() => setIsClearConfirmOpen(false)} className={`${MODAL_CANCEL_BUTTON} text-sm sm:text-base`}>{translations.common.cancel}</button>
                 <button 
                   onClick={() => {
                       onClearAll(filteredFlows.map(cf => cf.id));
                       setIsClearConfirmOpen(false);
                   }} 
                   className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm sm:text-base"
                 >
                   {translations.funds.confirmClear}
                 </button>
              </div>
           </div>
        </div>
      )}

      {isBatchOpen && (
        <BatchCashFlowModal onImport={onBatchAdd} 
          onClose={() => setIsBatchOpen(false)} 
        />
      )}
    </div>
  );
};

export default FundManager;

