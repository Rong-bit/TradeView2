import { Account, RecurringDepositRule } from '../types';
import { currentYearMonth, scheduledDateInPeriod } from './recurringDeposits';
import {
  DEFAULT_DEBT_LEAD_DAYS,
  DEFAULT_MIN_SAFETY_SPREAD_PERCENT,
  hasActiveDebtBalance,
  isDebtPaymentAlertRule,
  isLiabilityAccount,
} from './debtAccountHelpers';

export interface DebtPaymentAlert {
  ruleId: string;
  accountId: string;
  accountName: string;
  dueDate: string;
  dayOfMonth: number;
  amount?: number;
  daysUntilDue: number;
  note?: string;
}

export interface DebtSpreadAlert {
  accountId: string;
  accountName: string;
  debtKind?: string;
  loanRate: number;
  returnRate: number;
  level: 'danger' | 'warning';
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

export function checkDebtPaymentAlerts(
  rules: RecurringDepositRule[],
  accounts: Account[],
  today: Date = new Date()
): DebtPaymentAlert[] {
  const period = currentYearMonth(today);
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const todayDay = today.getDate();
  const out: DebtPaymentAlert[] = [];

  rules.forEach(rule => {
    if (!rule.enabled || !isDebtPaymentAlertRule(rule)) return;
    if (rule.lastAcknowledgedPeriod === period) return;

    const acc = accounts.find(a => a.id === rule.accountId);
    if (!acc || !isLiabilityAccount(acc) || !hasActiveDebtBalance(acc)) return;

    const lead = rule.leadDays ?? DEFAULT_DEBT_LEAD_DAYS;
    const dueDay = Math.min(rule.dayOfMonth, daysInMonth(y, m));
    const daysUntil = dueDay - todayDay;
    if (daysUntil < 0 || daysUntil > lead) return;

    const dueDate = scheduledDateInPeriod(period, rule.dayOfMonth);
    out.push({
      ruleId: rule.id,
      accountId: rule.accountId,
      accountName: acc.name,
      dueDate,
      dayOfMonth: dueDay,
      amount: rule.amount,
      daysUntilDue: daysUntil,
      note: rule.note,
    });
  });

  return out.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

export function computeDebtSpreadAlerts(
  accounts: Account[],
  accountPerformance: Array<{ id: string; name: string; roi: number }>,
  minSafetySpreadPercent: number = DEFAULT_MIN_SAFETY_SPREAD_PERCENT
): DebtSpreadAlert[] {
  const alerts: DebtSpreadAlert[] = [];

  accounts.forEach(liability => {
    if (!isLiabilityAccount(liability) || !hasActiveDebtBalance(liability)) return;
    const rate = liability.annualInterestRate;
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return;

    const linkedId = liability.linkedBrokerageAccountId;
    const perf = linkedId
      ? accountPerformance.find(p => p.id === linkedId)
      : undefined;
    const returnRate = perf?.roi ?? 0;

    if (returnRate < rate) {
      alerts.push({
        accountId: liability.id,
        accountName: liability.name,
        loanRate: rate,
        returnRate,
        level: 'danger',
      });
    } else if (returnRate - rate < minSafetySpreadPercent) {
      alerts.push({
        accountId: liability.id,
        accountName: liability.name,
        loanRate: rate,
        returnRate,
        level: 'warning',
      });
    }
  });

  return alerts;
}
