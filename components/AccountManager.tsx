
import React, { useState, useCallback, useMemo } from 'react';
import {
  Account,
  AccountKind,
  Currency,
  DebtKind,
  Market,
  BASE_CURRENCIES,
  type UsDividendTaxProfile,
} from '../types';
import { isLiabilityAccount } from '../utils/debtAccountHelpers';
import { getAccountUsDividendWithholdingRate } from '../utils/dividendTaxHelpers';
import { v4 as uuidv4 } from 'uuid';
import { formatCurrency } from '../utils/calculations';
import { t, translate } from '../utils/i18n';
import { FORM_FIELD_THEME, MODAL_CANCEL_BUTTON, INPUT_MODE_DECIMAL, INPUT_MODE_NUMERIC } from '../utils/formFieldClasses';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useUI } from '../contexts/UIContext';

interface Props {}

const AccountManager: React.FC<Props> = () => {
  const {
    accounts: storedAccounts,
    computedAccounts: allAccounts,
    accountPerformance,
    holdings,
    transactions,
    addAccount,
    updateAccount: onUpdate,
    removeAccount: onDelete,
  } = usePortfolio();
  const { language } = useUI();
  const isChinese = language === 'zh-TW' || language === 'zh-CN';
  const usTaxText =
    language === 'zh-TW'
      ? {
          label: '美股股息預扣設定',
          w8: 'W-8BEN 非美國稅務居民（30%）',
          w9: 'W-9 美國稅務居民（0%）',
          backup: '備用預扣（24%）',
          custom: '自訂稅率',
          customRate: '自訂預扣率（%）',
          badge: '美股預扣',
        }
      : language === 'zh-CN'
        ? {
            label: '美股股息预扣设置',
            w8: 'W-8BEN 非美国税务居民（30%）',
            w9: 'W-9 美国税务居民（0%）',
            backup: '备用预扣（24%）',
            custom: '自定义税率',
            customRate: '自定义预扣率（%）',
            badge: '美股预扣',
          }
        : {
            label: 'U.S. dividend withholding',
            w8: 'W-8BEN non-U.S. tax resident (30%)',
            w9: 'W-9 U.S. tax resident (0%)',
            backup: 'Backup withholding (24%)',
            custom: 'Custom rate',
            customRate: 'Custom withholding rate (%)',
            badge: 'U.S. withholding',
          };
  const onAdd = addAccount;
  const translations = t(language);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>(Currency.TWD);
  const [isSubBrokerage, setIsSubBrokerage] = useState(false);
  const [accountKind, setAccountKind] = useState<AccountKind>(AccountKind.BROKERAGE);
  const [debtKind, setDebtKind] = useState<DebtKind>(DebtKind.PERSONAL_LOAN);
  const [annualInterestRate, setAnnualInterestRate] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [linkedBrokerageAccountId, setLinkedBrokerageAccountId] = useState('');
  const [usDividendTaxProfile, setUsDividendTaxProfile] =
    useState<UsDividendTaxProfile>('W8BEN_30');
  const [usDividendCustomWithholdingPercent, setUsDividendCustomWithholdingPercent] =
    useState('30');
  
  // State for custom delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<{id: string, name: string} | null>(null);
  const [hideTarget, setHideTarget] = useState<{id: string, name: string} | null>(null);
  
  // State for edit modal
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const accountUsesUsMarket = useCallback(
    (account: Account): boolean =>
      account.currency === Currency.USD ||
      account.isSubBrokerage ||
      transactions.some(tx => tx.accountId === account.id && tx.market === Market.US) ||
      holdings.some(holding => holding.accountId === account.id && holding.market === Market.US),
    [holdings, transactions]
  );
  const showUsTaxSettings =
    accountKind === AccountKind.BROKERAGE &&
    (currency === Currency.USD ||
      isSubBrokerage ||
      (editingAccount != null && accountUsesUsMarket(editingAccount)));

  /** 已結清或無持倉（曾有交易、目前無持股）皆不可刪，只能隱藏 */
  const hideOnlyAccountIds = useMemo(() => {
    const fromPerf = accountPerformance
      .filter(a => a.isClosed || a.isFlat)
      .map(a => a.id);
    const ids = new Set(fromPerf);
    // 本地再算一次，避免績效陣列尚未就緒時誤開刪除
    allAccounts.forEach(acc => {
      if (isLiabilityAccount(acc)) return;
      const hasTx = transactions.some(tx => tx.accountId === acc.id);
      if (!hasTx) return;
      const hasHoldings = holdings.some(
        h => h.accountId === acc.id && h.quantity > 0.000001
      );
      if (!hasHoldings) ids.add(acc.id);
    });
    return ids;
  }, [accountPerformance, allAccounts, holdings, transactions]);

  const accountStatusById = useMemo(() => {
    const map = new Map<string, 'closed' | 'flat'>();
    accountPerformance.forEach(a => {
      if (a.isClosed) map.set(a.id, 'closed');
      else if (a.isFlat) map.set(a.id, 'flat');
    });
    return map;
  }, [accountPerformance]);

  const visibleAccounts = useMemo(
    () => allAccounts.filter(a => !a.isHidden),
    [allAccounts]
  );
  const hiddenAccounts = useMemo(
    () => allAccounts.filter(a => a.isHidden),
    [allAccounts]
  );
  
  // 檢查名稱是否與其他帳戶重複（排除當前編輯的帳戶；含已隱藏）
  const isNameDuplicate = useCallback((checkName: string): boolean => {
    return allAccounts.some(acc => {
      // 編輯模式下，排除當前編輯的帳戶
      if (editingAccount && acc.id === editingAccount.id) {
        return false;
      }
      return acc.name === checkName;
    });
  }, [allAccounts, editingAccount]);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const hiddenDup = allAccounts.find(
      acc =>
        acc.isHidden &&
        acc.name === name.trim() &&
        !(editingAccount && acc.id === editingAccount.id)
    );
    if (hiddenDup) {
      alert(translate('accounts.duplicateHiddenNameHint', language, { name: name.trim() }));
      return;
    }
    
    // 檢查名稱是否重複
    if (isNameDuplicate(name)) {
      const errorMsg = isChinese
        ? `帳戶名稱「${name}」已存在，請使用不同的名稱。`
        : `Account name "${name}" already exists. Please use a different name.`;
      alert(errorMsg);
      return;
    }
    
    const accountBalance = editingAccount
      ? storedAccounts.find(account => account.id === editingAccount.id)?.balance ?? 0
      : 0;
    
    const isLiability = accountKind === AccountKind.LIABILITY;
    const rateNum = annualInterestRate.trim() ? parseFloat(annualInterestRate) : undefined;
    const limitNum = creditLimit.trim() ? parseFloat(creditLimit) : undefined;
    const parsedCustomWithholding = parseFloat(usDividendCustomWithholdingPercent);
    const customWithholdingPercent = Number.isFinite(parsedCustomWithholding)
      ? Math.max(0, Math.min(100, parsedCustomWithholding))
      : 30;
    const accountPayload: Account = {
      id: editingAccount?.id ?? uuidv4(),
      name,
      currency,
      isSubBrokerage: isLiability ? false : isSubBrokerage,
      balance: accountBalance,
      accountKind,
      isHidden: editingAccount?.isHidden,
      ...(isLiability
        ? {
            debtKind,
            annualInterestRate: rateNum,
            creditLimit: limitNum != null && limitNum > 0 ? limitNum : undefined,
            linkedBrokerageAccountId: linkedBrokerageAccountId || undefined,
          }
        : {
            debtKind: undefined,
            annualInterestRate: undefined,
            creditLimit: undefined,
            linkedBrokerageAccountId: undefined,
            usDividendTaxProfile: showUsTaxSettings ? usDividendTaxProfile : undefined,
            usDividendCustomWithholdingPercent:
              showUsTaxSettings && usDividendTaxProfile === 'CUSTOM'
                ? customWithholdingPercent
                : undefined,
          }),
    };

    if (editingAccount && onUpdate) {
      onUpdate(accountPayload);
      setIsEditModalOpen(false);
      setEditingAccount(null);
    } else {
      onAdd(accountPayload);
    }
    
    // Reset form
    setName('');
    setCurrency(Currency.TWD);
    setIsSubBrokerage(false);
    setAccountKind(AccountKind.BROKERAGE);
    setDebtKind(DebtKind.PERSONAL_LOAN);
    setAnnualInterestRate('');
    setCreditLimit('');
    setLinkedBrokerageAccountId('');
    setUsDividendTaxProfile('W8BEN_30');
    setUsDividendCustomWithholdingPercent('30');
  };

  const handleEditClick = (e: React.MouseEvent, account: Account) => {
    e.stopPropagation();
    setEditingAccount(account);
    setName(account.name);
    setCurrency(account.currency);
    setIsSubBrokerage(account.isSubBrokerage);
    setAccountKind(account.accountKind ?? AccountKind.BROKERAGE);
    setDebtKind(account.debtKind ?? DebtKind.PERSONAL_LOAN);
    setAnnualInterestRate(
      account.annualInterestRate != null ? String(account.annualInterestRate) : ''
    );
    setCreditLimit(account.creditLimit != null ? String(account.creditLimit) : '');
    setLinkedBrokerageAccountId(account.linkedBrokerageAccountId ?? '');
    setUsDividendTaxProfile(account.usDividendTaxProfile ?? 'W8BEN_30');
    setUsDividendCustomWithholdingPercent(
      account.usDividendCustomWithholdingPercent != null
        ? String(account.usDividendCustomWithholdingPercent)
        : '30'
    );
    setIsEditModalOpen(true);
  };
  
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string, accountName: string) => {
    // Only stop propagation to prevent bubbling to card clicks if any
    e.stopPropagation();
    if (hideOnlyAccountIds.has(id)) {
      setHideTarget({ id, name: accountName });
      return;
    }
    setDeleteTarget({ id, name: accountName });
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      onDelete(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const confirmHide = () => {
    if (!hideTarget) return;
    const acc = allAccounts.find(a => a.id === hideTarget.id);
    if (acc && onUpdate) {
      onUpdate({ ...acc, isHidden: true });
    }
    setHideTarget(null);
  };

  const restoreAccount = (acc: Account) => {
    if (onUpdate) onUpdate({ ...acc, isHidden: false });
  };

  const getCurrencyLabel = (c: Currency): string => {
    const a = translations.accounts;
    switch (c) {
      case Currency.TWD: return a.currencyTWD;
      case Currency.USD: return a.currencyUSD;
      case Currency.JPY: return a.currencyJPY;
      case Currency.EUR: return a.currencyEUR;
      case Currency.GBP: return a.currencyGBP;
      case Currency.HKD: return a.currencyHKD;
      case Currency.KRW: return a.currencyKRW;
      case Currency.CNY: return a.currencyCNY;
      case Currency.INR: return a.currencyINR;
      case Currency.CAD: return a.currencyCAD;
      case Currency.AUD: return a.currencyAUD;
      case Currency.SAR: return a.currencySAR;
      case Currency.BRL: return a.currencyBRL;
      default: return c;
    }
  };

  const accountCurrencies: Currency[] = [...BASE_CURRENCIES.map(code => code as Currency), Currency.CNY, Currency.AUD, Currency.SAR, Currency.BRL];

  return (
    <div className="space-y-6">
      <div className="app-section-card p-6">
        <h3 className="font-bold text-lg mb-4">{translations.accounts.addAccount}</h3>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700">{translations.accounts.accountName}</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={handleNameChange}
              className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
              placeholder={translations.accounts.accountNamePlaceholder}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">{translations.accounts.accountKind}</label>
            <select
              value={accountKind}
              onChange={e => setAccountKind(e.target.value as AccountKind)}
              className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
            >
              <option value={AccountKind.BROKERAGE}>{translations.accounts.accountKindBrokerage}</option>
              <option value={AccountKind.LIABILITY}>{translations.accounts.accountKindLiability}</option>
            </select>
          </div>
          {accountKind === AccountKind.LIABILITY && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700">{translations.accounts.debtKind}</label>
                <select
                  value={debtKind}
                  onChange={e => setDebtKind(e.target.value as DebtKind)}
                  className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                >
                  <option value={DebtKind.PERSONAL_LOAN}>{translations.accounts.debtKindPersonal}</option>
                  <option value={DebtKind.MORTGAGE}>{translations.accounts.debtKindMortgage}</option>
                  <option value={DebtKind.SECURITIES_LENDING}>{translations.accounts.debtKindSecurities}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">{translations.accounts.annualInterestRate}</label>
                <input
                  type="number"
                  inputMode={INPUT_MODE_DECIMAL}
                  step="0.01"
                  min="0"
                  value={annualInterestRate}
                  onChange={e => setAnnualInterestRate(e.target.value)}
                  className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                  placeholder="2.2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">{translations.accounts.creditLimit}</label>
                <input
                  type="number"
                  inputMode={INPUT_MODE_NUMERIC}
                  step="1"
                  min="0"
                  value={creditLimit}
                  onChange={e => setCreditLimit(e.target.value)}
                  className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                  placeholder="3000000"
                />
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="block text-sm font-medium text-slate-700">{translations.accounts.linkedBrokerageAccount}</label>
                <select
                  value={linkedBrokerageAccountId}
                  onChange={e => setLinkedBrokerageAccountId(e.target.value)}
                  className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                >
                  <option value="">—</option>
                  {visibleAccounts
                    .filter(a => !isLiabilityAccount(a))
                    .map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700">{translations.accounts.currency}</label>
            <select 
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
            >
              {accountCurrencies.map(c => (
                <option key={c} value={c}>{getCurrencyLabel(c)}</option>
              ))}
            </select>
          </div>
          {accountKind === AccountKind.BROKERAGE && (
            <>
              <div className="flex items-center h-10 pb-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSubBrokerage}
                    onChange={e => setIsSubBrokerage(e.target.checked)}
                    className="rounded text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-slate-700">{translations.accounts.subBrokerage}</span>
                </label>
              </div>
              {showUsTaxSettings && (
                <>
                  <div className="min-w-[260px]">
                    <label className="block text-sm font-medium text-slate-700">{usTaxText.label}</label>
                    <select
                      value={usDividendTaxProfile}
                      onChange={e => setUsDividendTaxProfile(e.target.value as UsDividendTaxProfile)}
                      className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                    >
                      <option value="W8BEN_30">{usTaxText.w8}</option>
                      <option value="W9_0">{usTaxText.w9}</option>
                      <option value="BACKUP_24">{usTaxText.backup}</option>
                      <option value="CUSTOM">{usTaxText.custom}</option>
                    </select>
                  </div>
                  {usDividendTaxProfile === 'CUSTOM' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700">{usTaxText.customRate}</label>
                      <input
                        type="number"
                        inputMode={INPUT_MODE_DECIMAL}
                        min="0"
                        max="100"
                        step="0.01"
                        value={usDividendCustomWithholdingPercent}
                        onChange={e => setUsDividendCustomWithholdingPercent(e.target.value)}
                        className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <button type="submit" className="app-primary-btn px-4 py-2 rounded">
            {editingAccount ? translations.accounts.update : translations.accounts.add}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleAccounts.map(acc => (
          <div key={acc.id} className="app-section-card p-5 hover:shadow-md transition-shadow relative">
            {/* Header Area */}
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1 min-w-0 pr-2">
                <h4 className="font-bold text-slate-800 text-lg break-words leading-tight">{acc.name}</h4>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    acc.currency === Currency.USD ? 'bg-blue-50 text-blue-700 border-blue-100' : 
                    acc.currency === Currency.JPY ? 'bg-orange-50 text-orange-700 border-orange-100' : 
                    acc.currency === Currency.EUR ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                    acc.currency === Currency.GBP ? 'bg-rose-50 text-rose-700 border-rose-100' :
                    acc.currency === Currency.HKD ? 'bg-amber-50 text-amber-700 border-amber-100' :
                    acc.currency === Currency.KRW ? 'bg-teal-50 text-teal-700 border-teal-100' :
                    acc.currency === Currency.CNY ? 'bg-red-50 text-red-700 border-red-100' :
                    acc.currency === Currency.INR ? 'bg-sky-50 text-sky-700 border-sky-100' :
                    acc.currency === Currency.CAD ? 'bg-rose-50 text-rose-700 border-rose-100' :
                    acc.currency === Currency.AUD ? 'bg-lime-50 text-lime-700 border-lime-100' :
                    acc.currency === Currency.SAR ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                    acc.currency === Currency.BRL ? 'bg-cyan-50 text-cyan-700 border-cyan-100' :
                    'bg-green-50 text-green-700 border-green-100'
                  }`}>
                    {acc.currency}
                  </span>
                  {acc.isSubBrokerage && <span className="text-xs bg-purple-50 text-purple-700 border border-purple-100 px-2 py-0.5 rounded">{translations.accounts.subBrokerage}</span>}
                  {!isLiabilityAccount(acc) && accountUsesUsMarket(acc) && (
                    <span className="text-xs bg-sky-50 text-sky-700 border border-sky-100 px-2 py-0.5 rounded">
                      {usTaxText.badge}{' '}
                      {Number((getAccountUsDividendWithholdingRate(acc) * 100).toFixed(2))}%
                    </span>
                  )}
                  {accountStatusById.get(acc.id) === 'closed' && (
                    <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-semibold">
                      {translations.dashboard.accountClosedBadge}
                    </span>
                  )}
                  {accountStatusById.get(acc.id) === 'flat' && (
                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold">
                      {translations.dashboard.accountFlatBadge}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-1 shrink-0">
                <button 
                    type="button"
                    onClick={(e) => handleEditClick(e, acc)}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors relative z-20 cursor-pointer border border-transparent"
                    title={translations.accounts.editAccount}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                <button 
                  type="button"
                  onClick={(e) => handleDeleteClick(e, acc.id, acc.name)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors relative z-20 cursor-pointer border border-transparent"
                  title={isChinese ? '刪除帳戶' : 'Delete Account'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="pt-4 border-t border-slate-50">
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">
                {isLiabilityAccount(acc) ? translations.accounts.debtBalance : translations.accounts.cashBalance}
              </p>
              <p className={`text-xl font-mono font-bold mt-1 ${isLiabilityAccount(acc) ? 'text-red-600' : 'text-slate-700'}`}>
                {isLiabilityAccount(acc) ? `(${formatCurrency(acc.balance, acc.currency)})` : formatCurrency(acc.balance, acc.currency)}
              </p>
              {isLiabilityAccount(acc) && acc.annualInterestRate != null && (
                <p className="text-xs text-slate-500 mt-1">{translations.accounts.annualInterestRate}: {acc.annualInterestRate}%</p>
              )}
              {isLiabilityAccount(acc) && acc.creditLimit != null && acc.creditLimit > 0 && (
                <p className="text-xs text-slate-500 mt-0.5">{translations.accounts.creditLimit}: {formatCurrency(acc.creditLimit, acc.currency)}</p>
              )}
            </div>
          </div>
        ))}
        
        {visibleAccounts.length === 0 && allAccounts.length === 0 && (
          <div className="col-span-full text-center py-10 text-slate-400 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
            {translations.accounts.noAccounts}
          </div>
        )}
      </div>

      {hiddenAccounts.length > 0 && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-bold text-slate-600 mb-3">
            {translations.accounts.hiddenAccountsSection}（{hiddenAccounts.length}）
          </h4>
          <div className="space-y-2">
            {hiddenAccounts.map(acc => (
              <div
                key={acc.id}
                className="flex items-center justify-between gap-3 bg-white rounded-md border border-slate-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{acc.name}</p>
                  <p className="text-xs text-slate-500">{acc.currency}</p>
                </div>
                <button
                  type="button"
                  onClick={() => restoreAccount(acc)}
                  className="shrink-0 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition"
                >
                  {translations.accounts.restoreAccount}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {isEditModalOpen && editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">{translations.accounts.editAccountTitle}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{translations.accounts.accountName}</label>
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={handleNameChange}
                  className={`w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                  placeholder={translations.accounts.accountNamePlaceholder}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{translations.accounts.accountKind}</label>
                <select
                  value={accountKind}
                  onChange={e => setAccountKind(e.target.value as AccountKind)}
                  className={`w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                >
                  <option value={AccountKind.BROKERAGE}>{translations.accounts.accountKindBrokerage}</option>
                  <option value={AccountKind.LIABILITY}>{translations.accounts.accountKindLiability}</option>
                </select>
              </div>
              {accountKind === AccountKind.LIABILITY && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">{translations.accounts.debtKind}</label>
                    <select
                      value={debtKind}
                      onChange={e => setDebtKind(e.target.value as DebtKind)}
                      className={`w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                    >
                      <option value={DebtKind.PERSONAL_LOAN}>{translations.accounts.debtKindPersonal}</option>
                      <option value={DebtKind.MORTGAGE}>{translations.accounts.debtKindMortgage}</option>
                      <option value={DebtKind.SECURITIES_LENDING}>{translations.accounts.debtKindSecurities}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">{translations.accounts.annualInterestRate}</label>
                    <input
                      type="number"
                      inputMode={INPUT_MODE_DECIMAL}
                      step="0.01"
                      min="0"
                      value={annualInterestRate}
                      onChange={e => setAnnualInterestRate(e.target.value)}
                      className={`w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">{translations.accounts.creditLimit}</label>
                    <input
                      type="number"
                      inputMode={INPUT_MODE_NUMERIC}
                      step="1"
                      min="0"
                      value={creditLimit}
                      onChange={e => setCreditLimit(e.target.value)}
                      className={`w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">{translations.accounts.linkedBrokerageAccount}</label>
                    <select
                      value={linkedBrokerageAccountId}
                      onChange={e => setLinkedBrokerageAccountId(e.target.value)}
                      className={`w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                    >
                      <option value="">—</option>
                      {allAccounts
                        .filter(a => !isLiabilityAccount(a) && a.id !== editingAccount.id)
                        .map(a => (
                          <option key={a.id} value={a.id}>
                            {a.isHidden
                              ? `${a.name} (${translations.accounts.hiddenAccountsSection})`
                              : a.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{translations.accounts.currency}</label>
                <select 
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  className={`w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                >
                  {accountCurrencies.map(c => (
                    <option key={c} value={c}>{getCurrencyLabel(c)}</option>
                  ))}
                </select>
              </div>
              {accountKind === AccountKind.BROKERAGE && (
                <>
                  <div className="flex items-center">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSubBrokerage}
                        onChange={(e) => setIsSubBrokerage(e.target.checked)}
                        className="rounded text-accent focus:ring-accent"
                      />
                      <span className="text-sm text-slate-700">{translations.accounts.subBrokerage}</span>
                    </label>
                  </div>
                  {showUsTaxSettings && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">{usTaxText.label}</label>
                        <select
                          value={usDividendTaxProfile}
                          onChange={e => setUsDividendTaxProfile(e.target.value as UsDividendTaxProfile)}
                          className={`w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                        >
                          <option value="W8BEN_30">{usTaxText.w8}</option>
                          <option value="W9_0">{usTaxText.w9}</option>
                          <option value="BACKUP_24">{usTaxText.backup}</option>
                          <option value="CUSTOM">{usTaxText.custom}</option>
                        </select>
                      </div>
                      {usDividendTaxProfile === 'CUSTOM' && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">{usTaxText.customRate}</label>
                          <input
                            type="number"
                            inputMode={INPUT_MODE_DECIMAL}
                            min="0"
                            max="100"
                            step="0.01"
                            value={usDividendCustomWithholdingPercent}
                            onChange={e => setUsDividendCustomWithholdingPercent(e.target.value)}
                            className={`w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingAccount(null);
                    setName('');
                    setCurrency(Currency.TWD);
                    setIsSubBrokerage(false);
                    setAccountKind(AccountKind.BROKERAGE);
                    setDebtKind(DebtKind.PERSONAL_LOAN);
                    setAnnualInterestRate('');
                    setCreditLimit('');
                    setLinkedBrokerageAccountId('');
                    setUsDividendTaxProfile('W8BEN_30');
                    setUsDividendCustomWithholdingPercent('30');
                  }}
                  className={MODAL_CANCEL_BUTTON}
                >
                  {translations.accounts.cancel}
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 app-primary-btn rounded transition shadow-sm"
                >
                  {translations.accounts.updateAccount}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">{translations.accounts.confirmDelete}</h3>
            <p className="text-slate-600 mb-4">
              {translate('accounts.confirmDeleteMessage', language, { name: deleteTarget.name })}
            </p>
            <div className="text-xs text-amber-600 bg-amber-50 p-3 rounded mb-6 border border-amber-100">
              {translations.accounts.deleteWarning}
            </div>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteTarget(null)}
                className={MODAL_CANCEL_BUTTON}
              >
                {translations.common.cancel}
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition shadow-sm"
              >
                {translations.accounts.deleteAccount}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 已結清：僅能隱藏 */}
      {hideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {translations.accounts.cannotDeleteClosedTitle}
            </h3>
            <p className="text-slate-600 mb-6 text-sm leading-relaxed">
              {translations.accounts.cannotDeleteClosedMessage}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setHideTarget(null)}
                className={MODAL_CANCEL_BUTTON}
              >
                {translations.common.cancel}
              </button>
              <button
                type="button"
                onClick={confirmHide}
                className="px-4 py-2 app-primary-btn rounded transition shadow-sm"
              >
                {translations.accounts.hideAccount}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountManager;
