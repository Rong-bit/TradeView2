import {
  Account,
  AccountKind,
  CashFlow,
  CashFlowType,
  Currency,
  DebtKind,
  RecurringDepositRule,
} from '../types';
import { ExchangeRates, currencyToTWDRate } from './calculations';

export const DEFAULT_DEBT_LEAD_DAYS = 3;
export const DEFAULT_MIN_SAFETY_SPREAD_PERCENT = 2;
/** 欠款餘額低於此值視為已結清（儀表板不顯示信貸區塊） */
export const ACTIVE_DEBT_BALANCE_EPSILON = 0.000001;

export function hasActiveDebtBalance(account: Account | undefined): boolean {
  if (!account || !isLiabilityAccount(account)) return false;
  return account.balance > ACTIVE_DEBT_BALANCE_EPSILON;
}

/** 儀表板／負債合計：信貸戶逾還（負餘額）視為 0，避免淨資產高估 */
export function effectiveLiabilityBalance(balance: number): number {
  if (!Number.isFinite(balance)) return 0;
  return balance > 0 ? balance : 0;
}

export function getAccountKind(account: Account | undefined): AccountKind {
  return account?.accountKind ?? AccountKind.BROKERAGE;
}

export function isLiabilityAccount(account: Account | undefined): boolean {
  return getAccountKind(account) === AccountKind.LIABILITY;
}

export function isBrokerageAccount(account: Account | undefined): boolean {
  return getAccountKind(account) === AccountKind.BROKERAGE;
}

export function cashFlowAmountTWD(
  cf: CashFlow,
  accounts: Account[],
  rates: ExchangeRates
): number {
  const account = accounts.find(a => a.id === cf.accountId);
  const sourceCurrency = account?.currency ?? Currency.TWD;
  const rate =
    cf.exchangeRate && cf.exchangeRate > 0
      ? cf.exchangeRate
      : currencyToTWDRate(sourceCurrency, rates);
  const baseAmt = sourceCurrency === Currency.TWD ? cf.amount : cf.amount * rate;
  const feeVal = cf.fee || 0;

  // 匯出／信貸利息：總流出 = 金額 + 手續費（覆蓋舊版 amount - fee 的錯誤 amountTWD）
  if (cf.type === CashFlowType.WITHDRAW || cf.type === CashFlowType.LOAN_INTEREST) {
    return baseAmt + feeVal;
  }
  if (cf.type === CashFlowType.DEPOSIT) {
    if (cf.amountTWD && cf.amountTWD > 0) return cf.amountTWD;
    return baseAmt + feeVal;
  }

  if (cf.amountTWD && cf.amountTWD > 0) return cf.amountTWD;
  return cf.amount * rate;
}

/** 負債戶 → 證券戶轉帳（信貸撥款） */
export function isDebtFundedInflow(cf: CashFlow, accounts: Account[]): boolean {
  if (cf.type !== CashFlowType.TRANSFER || !cf.targetAccountId) return false;
  const source = accounts.find(a => a.id === cf.accountId);
  const target = accounts.find(a => a.id === cf.targetAccountId);
  return isLiabilityAccount(source) && isBrokerageAccount(target);
}

/** 證券戶 → 負債戶轉帳（還本） */
export function isDebtRepaymentOutflow(cf: CashFlow, accounts: Account[]): boolean {
  if (cf.type !== CashFlowType.TRANSFER || !cf.targetAccountId) return false;
  const source = accounts.find(a => a.id === cf.accountId);
  const target = accounts.find(a => a.id === cf.targetAccountId);
  return isBrokerageAccount(source) && isLiabilityAccount(target);
}

export function isDebtRelatedCashFlow(cf: CashFlow, accounts: Account[]): boolean {
  return isDebtFundedInflow(cf, accounts) || isDebtRepaymentOutflow(cf, accounts);
}

/** 單月預計利息：balance × 年利率% ÷ 12 */
export function estimateMonthlyInterest(
  balance: number,
  annualInterestRatePercent: number | undefined
): number | null {
  if (!Number.isFinite(balance) || balance <= 0) return null;
  if (
    annualInterestRatePercent == null ||
    !Number.isFinite(annualInterestRatePercent) ||
    annualInterestRatePercent <= 0
  ) {
    return null;
  }
  return (balance * annualInterestRatePercent) / 100 / 12;
}

/** 額度使用率 0–100；無額度或額度 ≤ 0 時回傳 null */
export function creditUtilizationPercent(
  balance: number,
  creditLimit: number | undefined
): number | null {
  if (creditLimit == null || !Number.isFinite(creditLimit) || creditLimit <= 0) return null;
  return Math.min(100, (Math.max(0, balance) / creditLimit) * 100);
}

export interface LiabilityAccountInsight {
  accountId: string;
  name: string;
  currency: Currency;
  balance: number;
  balanceTWD: number;
  creditLimit?: number;
  creditLimitTWD?: number;
  utilizationPercent: number | null;
  annualInterestRate?: number;
  estimatedMonthlyInterest: number | null;
  estimatedMonthlyInterestTWD: number | null;
}

export function buildLiabilityAccountInsights(
  accounts: Account[],
  rates: ExchangeRates
): LiabilityAccountInsight[] {
  return accounts
    .filter(isLiabilityAccount)
    .filter(hasActiveDebtBalance)
    .map(a => {
      const twdRate = currencyToTWDRate(a.currency, rates);
      const monthly = estimateMonthlyInterest(a.balance, a.annualInterestRate);
      return {
        accountId: a.id,
        name: a.name,
        currency: a.currency,
        balance: a.balance,
        balanceTWD: a.balance * twdRate,
        creditLimit: a.creditLimit,
        creditLimitTWD:
          a.creditLimit != null && a.creditLimit > 0 ? a.creditLimit * twdRate : undefined,
        utilizationPercent: creditUtilizationPercent(a.balance, a.creditLimit),
        annualInterestRate: a.annualInterestRate,
        estimatedMonthlyInterest: monthly,
        estimatedMonthlyInterestTWD: monthly != null ? monthly * twdRate : null,
      };
    });
}

/** Ledger / 餘額：負債戶上 TRANSFER（撥出）= 欠款增加 */
export function ledgerBalanceChangeForCashFlow(
  record: {
    accountId: string;
    subType: string;
    amount: number;
    isTargetRecord?: boolean;
  },
  accounts: Account[]
): number {
  const acc = accounts.find(a => a.id === record.accountId);
  if (!isLiabilityAccount(acc)) {
    if (record.subType === CashFlowType.DEPOSIT) return record.amount;
    if (record.subType === CashFlowType.WITHDRAW) return -record.amount;
    if (record.subType === CashFlowType.LOAN_INTEREST) return -record.amount;
    if (record.subType === CashFlowType.TRANSFER) return -record.amount;
    if (record.subType === 'TRANSFER_IN') return record.amount;
    if (record.subType === CashFlowType.INTEREST) return record.amount;
    return 0;
  }

  if (record.subType === CashFlowType.TRANSFER && !record.isTargetRecord) {
    return record.amount;
  }
  if (record.subType === 'TRANSFER_IN' && record.isTargetRecord) {
    return -record.amount;
  }
  if (record.subType === CashFlowType.DEPOSIT) return record.amount;
  if (record.subType === CashFlowType.WITHDRAW) return -record.amount;
  if (record.subType === CashFlowType.LOAN_INTEREST) return record.amount;
  return 0;
}

export function computeDebtSummary(
  accounts: Account[],
  cashFlows: CashFlow[],
  rates: ExchangeRates
) {
  let totalDebtBalanceTWD = 0;
  let leverageNetTWD = 0;
  let hasDebtFunding = false;

  accounts.forEach(a => {
    if (!isLiabilityAccount(a)) return;
    totalDebtBalanceTWD +=
      effectiveLiabilityBalance(a.balance) * currencyToTWDRate(a.currency, rates);
  });

  cashFlows.forEach(cf => {
    const twd = cashFlowAmountTWD(cf, accounts, rates);
    if (isDebtFundedInflow(cf, accounts)) {
      leverageNetTWD += twd;
      hasDebtFunding = true;
    } else if (isDebtRepaymentOutflow(cf, accounts)) {
      leverageNetTWD -= twd;
      hasDebtFunding = true;
    }
  });

  if (totalDebtBalanceTWD <= ACTIVE_DEBT_BALANCE_EPSILON) {
    hasDebtFunding = false;
  }

  return { totalDebtBalanceTWD, leverageNetTWD, hasDebtFunding };
}

export function netInvestedDeltaForCashFlow(
  cf: CashFlow,
  accounts: Account[],
  rates: ExchangeRates
): number {
  const twd = cashFlowAmountTWD(cf, accounts, rates);
  const source = accounts.find(a => a.id === cf.accountId);
  if (cf.type === CashFlowType.DEPOSIT || cf.type === CashFlowType.WITHDRAW) {
    // 負債戶入金／提款僅調整欠款，非自有資金淨投入
    if (isLiabilityAccount(source)) return 0;
    if (cf.type === CashFlowType.DEPOSIT) return twd;
    return -twd;
  }
  if (isDebtFundedInflow(cf, accounts)) return twd;
  if (isDebtRepaymentOutflow(cf, accounts)) return -twd;
  return 0;
}

export function isRecurringDepositRule(rule: RecurringDepositRule): boolean {
  return !rule.kind || rule.kind === 'RECURRING_DEPOSIT';
}

export function isDebtPaymentAlertRule(rule: RecurringDepositRule): boolean {
  return rule.kind === 'DEBT_PAYMENT_ALERT';
}

export function getDebtKindLabel(
  kind: DebtKind | undefined,
  language: string
): string {
  const zh = language === 'zh-TW' || language === 'zh-CN';
  switch (kind) {
    case DebtKind.PERSONAL_LOAN:
      return zh ? '個人信貸' : 'Personal loan';
    case DebtKind.MORTGAGE:
      return zh ? '房屋信貸' : 'Mortgage';
    case DebtKind.SECURITIES_LENDING:
      return zh ? '借券信貸' : 'Securities lending';
    default:
      return zh ? '負債' : 'Liability';
  }
}
