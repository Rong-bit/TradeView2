import { v4 as uuidv4 } from 'uuid';
import {
  Account,
  CashFlow,
  CashFlowType,
  Currency,
  RecurringDepositRule,
} from '../types';

export function recurringTag(ruleId: string, period: string): string {
  return `__recurring:${ruleId}:${period}__`;
}

export function hasRecurringTag(note: string | undefined, ruleId: string, period: string): boolean {
  return (note ?? '').includes(recurringTag(ruleId, period));
}

/** 列表／對話框顯示用：移除 note 尾端或其中供程式用的 __recurring:…__ */
export function stripRecurringMarkersFromNote(note: string | undefined): string {
  if (!note) return '';
  return note.replace(/\s*__recurring:[^:]+:[^_]+__/g, '').trim();
}

export function noteContainsRecurringMarker(note: string | undefined): boolean {
  return /__recurring:[^:]+:[^_]+__/.test(note ?? '');
}

/** 儲存備註時：保留原錄之 __recurring 標記（供定期去重用），接在使用者可見文字後 */
export function mergeNotePreserveRecurringMarkers(
  originalNote: string | undefined,
  userFacingNote: string
): string {
  const tags = originalNote?.match(/__recurring:[^:]+:[^_]+__/g) ?? [];
  if (tags.length === 0) return userFacingNote.trim();
  const userPart = userFacingNote.trim();
  if (!userPart) return tags.join(' ').trim();
  return `${userPart} ${tags.join(' ')}`.trim();
}

/** YYYY-MM-DD（本地） */
export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 目前年月 YYYY-MM（本地） */
export function currentYearMonth(d: Date): string {
  return formatLocalYmd(d).slice(0, 7);
}

function daysInCalendarMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/** period YYYY-MM → 該月排程入帳日 YYYY-MM-DD */
export function scheduledDateInPeriod(period: string, dayOfMonth: number): string {
  const [y, m] = period.split('-').map(Number);
  const maxD = daysInCalendarMonth(y, m);
  const d = Math.min(Math.max(1, Math.floor(dayOfMonth)), maxD);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addOnePeriod(period: string): string {
  const [y, mon] = period.split('-').map(Number);
  const d = new Date(y, mon - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodsBetweenInclusive(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let p = from;
  while (p <= to) {
    out.push(p);
    const next = addOnePeriod(p);
    if (next === p) break;
    p = next;
  }
  return out;
}

/** 與 FundManager 入金時之一致邏輯（僅 DEPOSIT） */
export function computeDepositAmountTWD(
  currency: Currency,
  amount: number,
  fee: number,
  exchangeRate?: number,
  explicitAmountTWD?: number
): number | undefined {
  if (explicitAmountTWD !== undefined && Number.isFinite(explicitAmountTWD) && explicitAmountTWD > 0) {
    return explicitAmountTWD;
  }
  const f = fee || 0;
  if (currency === Currency.TWD) return amount + f;
  if (
    (currency === Currency.USD || currency === Currency.JPY) &&
    exchangeRate !== undefined &&
    exchangeRate > 0
  ) {
    return amount * exchangeRate + f;
  }
  return undefined;
}

function buildNote(baseNote: string | undefined, ruleId: string, period: string): string {
  const tag = recurringTag(ruleId, period);
  const t = (baseNote ?? '').trim();
  return t ? `${t} ${tag}` : tag;
}

function effectiveStartMonth(rule: RecurringDepositRule): string {
  const created = rule.createdMonth ?? '2000-01';
  if (!rule.startMonth) return created;
  return rule.startMonth > created ? rule.startMonth : created;
}

export interface ApplyRecurringDepositsInput {
  rules: RecurringDepositRule[];
  cashFlows: CashFlow[];
  accounts: Account[];
  today?: Date;
}

export interface ApplyRecurringDepositsResult {
  newCashFlows: CashFlow[];
  updatedRules: RecurringDepositRule[];
}

export function applyRecurringDeposits(input: ApplyRecurringDepositsInput): ApplyRecurringDepositsResult {
  const today = input.today ?? new Date();
  const todayYmd = formatLocalYmd(today);
  const thisMonth = currentYearMonth(today);
  const accountById = new Map(input.accounts.map(a => [a.id, a]));

  const newCashFlows: CashFlow[] = [];
  const rulesOut: RecurringDepositRule[] = [...input.rules];
  let anyRuleMetaChanged = false;

  for (let i = 0; i < rulesOut.length; i++) {
    const rule = rulesOut[i];
    if (!rule.enabled) continue;
    if (rule.kind === 'DEBT_PAYMENT_ALERT') continue;

    const account = accountById.get(rule.accountId);
    if (!account) continue;

    const from = effectiveStartMonth(rule);
    if (from > thisMonth) continue;

    const periods = periodsBetweenInclusive(from, thisMonth);
    let maxApplied = rule.lastAppliedPeriod;

    for (const period of periods) {
      const already = (flows: CashFlow[]) =>
        flows.some(
          cf =>
            cf.type === CashFlowType.DEPOSIT &&
            cf.accountId === rule.accountId &&
            hasRecurringTag(cf.note, rule.id, period)
        );
      if (already(input.cashFlows) || already(newCashFlows)) {
        if (!maxApplied || period > maxApplied) maxApplied = period;
        continue;
      }

      const scheduledYmd = scheduledDateInPeriod(period, rule.dayOfMonth);

      if (period === thisMonth) {
        if (todayYmd < scheduledYmd) continue;
      }

      const fee = rule.fee ?? 0;
      const amountTWD = computeDepositAmountTWD(
        account.currency,
        rule.amount,
        fee,
        rule.exchangeRate,
        rule.amountTWD
      );

      const cf: CashFlow = {
        id: uuidv4(),
        date: scheduledYmd,
        type: CashFlowType.DEPOSIT,
        amount: rule.amount,
        amountTWD: amountTWD !== undefined && amountTWD > 0 ? amountTWD : undefined,
        fee: fee > 0 ? fee : undefined,
        accountId: rule.accountId,
        exchangeRate:
          account.currency === Currency.TWD
            ? 1
            : rule.exchangeRate !== undefined && rule.exchangeRate > 0
              ? rule.exchangeRate
              : undefined,
        note: buildNote(rule.note, rule.id, period),
        category: rule.category,
      };

      newCashFlows.push(cf);
      if (!maxApplied || period > maxApplied) maxApplied = period;
    }

    if (maxApplied && maxApplied !== rule.lastAppliedPeriod) {
      rulesOut[i] = { ...rule, lastAppliedPeriod: maxApplied };
      anyRuleMetaChanged = true;
    }
  }

  return {
    newCashFlows,
    updatedRules: anyRuleMetaChanged ? rulesOut : input.rules,
  };
}
