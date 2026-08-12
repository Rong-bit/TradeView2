import {
  Account,
  AccountKind,
  BaseCurrency,
  BASE_CURRENCIES,
  CashFlow,
  CashFlowCategory,
  CashFlowType,
  Currency,
  DebtKind,
  HistoricalData,
  Market,
  RecurringDepositRule,
  StockSplitEvent,
  Transaction,
  TransactionType,
} from '../types';
import type { ExchangeRates } from './calculations';

const MAX_TRANSACTIONS = 50_000;
const MAX_CASH_FLOWS = 50_000;
const MAX_ACCOUNTS = 500;
const MAX_RECURRING_RULES = 200;
const MAX_STOCK_SPLITS = 2_000;
const MAX_REBALANCE_ITEMS = 500;
const MAX_HISTORICAL_PERIODS = 120;
const MAX_PRICES_PER_PERIOD = 5_000;
const MAX_PRICE_KEYS = 10_000;
const MAX_ID_LEN = 128;
const MAX_NAME_LEN = 200;
const MAX_TICKER_LEN = 48;
const MAX_NOTE_LEN = 4_000;
const MAX_JSON_BYTES = 25 * 1024 * 1024;

const MARKETS = new Set<string>(Object.values(Market));
const CURRENCIES = new Set<string>(Object.values(Currency));
const TX_TYPES = new Set<string>(Object.values(TransactionType));
const CF_TYPES = new Set<string>(Object.values(CashFlowType));
const CF_CATEGORIES = new Set<string>(Object.values(CashFlowCategory));
const ACCOUNT_KINDS = new Set<string>(Object.values(AccountKind));
const DEBT_KINDS = new Set<string>(Object.values(DebtKind));
const US_DIVIDEND_TAX_PROFILES = new Set<string>([
  'W8BEN_30',
  'W9_0',
  'BACKUP_24',
  'CUSTOM',
]);
const RULE_KINDS = new Set<string>(['RECURRING_DEPOSIT', 'DEBT_PAYMENT_ALERT']);
const BASE_CURRENCY_SET = new Set<string>(BASE_CURRENCIES);

const HIST_PERIOD_KEY = /^(\d{4})(-Q[1-4])?$/;
const YEAR_MONTH_KEY = /^\d{4}-\d{2}$/;

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportValidationError';
  }
}

export interface ValidatedImportBackup {
  transactions: Transaction[];
  accounts: Account[];
  cashFlows: CashFlow[];
  currentPrices: Record<string, number>;
  priceDetails: Record<string, { change: number; changePercent: number; previousClose?: number }>;
  rebalanceTargets: Record<string, number>;
  rebalanceEnabledItems: string[];
  historicalData: HistoricalData;
  recurringDepositRules: RecurringDepositRule[];
  stockSplits: StockSplitEvent[];
  rates: Partial<ExchangeRates>;
  baseCurrency?: BaseCurrency;
  minDebtSafetySpread?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnsafeKeys(obj: Record<string, unknown>, label: string): void {
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new ImportValidationError(`${label}: invalid property name`);
    }
  }
}

function requireObject(raw: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(raw)) throw new ImportValidationError(`${label} must be an object`);
  rejectUnsafeKeys(raw, label);
  return raw;
}

function requireArray(raw: unknown, label: string, maxLen: number): unknown[] {
  if (!Array.isArray(raw)) throw new ImportValidationError(`${label} must be an array`);
  if (raw.length > maxLen) {
    throw new ImportValidationError(`${label} exceeds limit (${maxLen} items)`);
  }
  return raw;
}

function str(value: unknown, label: string, maxLen: number): string {
  if (typeof value !== 'string') throw new ImportValidationError(`${label} must be a string`);
  const s = value.trim();
  if (!s || s.length > maxLen) throw new ImportValidationError(`${label} is invalid`);
  return s;
}

function optionalStr(value: unknown, label: string, maxLen: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return str(value, label, maxLen);
}

function num(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ImportValidationError(`${label} must be a finite number`);
  }
  return value;
}

function optionalNum(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return num(value, label);
}

function bool(value: unknown, label: string, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new ImportValidationError(`${label} must be a boolean`);
  return value;
}

function enumOf(value: unknown, label: string, allowed: Set<string>): string {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ImportValidationError(`${label} has invalid value`);
  }
  return value;
}

function optionalEnum(
  value: unknown,
  label: string,
  allowed: Set<string>
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return enumOf(value, label, allowed);
}

function dateStr(value: unknown, label: string): string {
  const s = str(value, label, 32);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) throw new ImportValidationError(`${label} is not a valid date`);
  return s;
}

function yearMonth(value: unknown, label: string): string | undefined {
  const s = optionalStr(value, label, 7);
  if (!s) return undefined;
  if (!YEAR_MONTH_KEY.test(s)) throw new ImportValidationError(`${label} must be YYYY-MM`);
  return s;
}

function dayOfMonth(value: unknown, label: string): number {
  const d = num(value, label);
  if (d < 1 || d > 31 || Math.floor(d) !== d) {
    throw new ImportValidationError(`${label} must be an integer 1–31`);
  }
  return d;
}

function parseAccount(raw: unknown, index: number): Account {
  const o = requireObject(raw, `accounts[${index}]`);
  const customWithholdingPercent = optionalNum(
    o.usDividendCustomWithholdingPercent,
    `accounts[${index}].usDividendCustomWithholdingPercent`
  );
  if (
    customWithholdingPercent != null &&
    (customWithholdingPercent < 0 || customWithholdingPercent > 100)
  ) {
    throw new ImportValidationError(
      `accounts[${index}].usDividendCustomWithholdingPercent must be between 0 and 100`
    );
  }
  const account: Account = {
    id: str(o.id, `accounts[${index}].id`, MAX_ID_LEN),
    name: str(o.name, `accounts[${index}].name`, MAX_NAME_LEN),
    currency: enumOf(o.currency, `accounts[${index}].currency`, CURRENCIES) as Currency,
    isSubBrokerage: bool(o.isSubBrokerage, `accounts[${index}].isSubBrokerage`),
    balance: num(o.balance, `accounts[${index}].balance`),
    accountKind: optionalEnum(o.accountKind, `accounts[${index}].accountKind`, ACCOUNT_KINDS) as
      | AccountKind
      | undefined,
    debtKind: optionalEnum(o.debtKind, `accounts[${index}].debtKind`, DEBT_KINDS) as DebtKind | undefined,
    annualInterestRate: optionalNum(o.annualInterestRate, `accounts[${index}].annualInterestRate`),
    creditLimit: optionalNum(o.creditLimit, `accounts[${index}].creditLimit`),
    linkedBrokerageAccountId: optionalStr(
      o.linkedBrokerageAccountId,
      `accounts[${index}].linkedBrokerageAccountId`,
      MAX_ID_LEN
    ),
    usDividendTaxProfile: optionalEnum(
      o.usDividendTaxProfile,
      `accounts[${index}].usDividendTaxProfile`,
      US_DIVIDEND_TAX_PROFILES
    ) as Account['usDividendTaxProfile'],
    usDividendCustomWithholdingPercent: customWithholdingPercent,
    isHidden: o.isHidden === undefined || o.isHidden === null
      ? undefined
      : bool(o.isHidden, `accounts[${index}].isHidden`),
  };
  return account;
}

function parseTransaction(raw: unknown, index: number): Transaction {
  const o = requireObject(raw, `transactions[${index}]`);
  const tx: Transaction = {
    id: str(o.id, `transactions[${index}].id`, MAX_ID_LEN),
    date: dateStr(o.date, `transactions[${index}].date`),
    ticker: str(o.ticker, `transactions[${index}].ticker`, MAX_TICKER_LEN),
    market: enumOf(o.market, `transactions[${index}].market`, MARKETS) as Market,
    type: enumOf(o.type, `transactions[${index}].type`, TX_TYPES) as TransactionType,
    price: num(o.price, `transactions[${index}].price`),
    quantity: num(o.quantity, `transactions[${index}].quantity`),
    fees: num(o.fees, `transactions[${index}].fees`),
    accountId: str(o.accountId, `transactions[${index}].accountId`, MAX_ID_LEN),
    note: optionalStr(o.note, `transactions[${index}].note`, MAX_NOTE_LEN),
    amount: optionalNum(o.amount, `transactions[${index}].amount`),
    category: optionalEnum(o.category, `transactions[${index}].category`, CF_CATEGORIES) as
      | CashFlowCategory
      | undefined,
    priceCurrency: optionalStr(o.priceCurrency, `transactions[${index}].priceCurrency`, 8),
    withheldNhiTwd: optionalNum(o.withheldNhiTwd, `transactions[${index}].withheldNhiTwd`),
    withheldUsTaxNative: optionalNum(
      o.withheldUsTaxNative,
      `transactions[${index}].withheldUsTaxNative`
    ),
    withheldTaxNative: optionalNum(
      o.withheldTaxNative,
      `transactions[${index}].withheldTaxNative`
    ),
  };
  return tx;
}

function parseCashFlow(raw: unknown, index: number): CashFlow {
  const o = requireObject(raw, `cashFlows[${index}]`);
  return {
    id: str(o.id, `cashFlows[${index}].id`, MAX_ID_LEN),
    date: dateStr(o.date, `cashFlows[${index}].date`),
    type: enumOf(o.type, `cashFlows[${index}].type`, CF_TYPES) as CashFlowType,
    amount: num(o.amount, `cashFlows[${index}].amount`),
    amountTWD: optionalNum(o.amountTWD, `cashFlows[${index}].amountTWD`),
    fee: optionalNum(o.fee, `cashFlows[${index}].fee`),
    accountId: str(o.accountId, `cashFlows[${index}].accountId`, MAX_ID_LEN),
    targetAccountId: optionalStr(o.targetAccountId, `cashFlows[${index}].targetAccountId`, MAX_ID_LEN),
    exchangeRate: optionalNum(o.exchangeRate, `cashFlows[${index}].exchangeRate`),
    note: optionalStr(o.note, `cashFlows[${index}].note`, MAX_NOTE_LEN),
    category: optionalEnum(o.category, `cashFlows[${index}].category`, CF_CATEGORIES) as
      | CashFlowCategory
      | undefined,
  };
}

function parseRecurringRule(raw: unknown, index: number): RecurringDepositRule {
  const o = requireObject(raw, `recurringDepositRules[${index}]`);
  return {
    id: str(o.id, `recurringDepositRules[${index}].id`, MAX_ID_LEN),
    enabled: bool(o.enabled, `recurringDepositRules[${index}].enabled`, true),
    dayOfMonth: dayOfMonth(o.dayOfMonth, `recurringDepositRules[${index}].dayOfMonth`),
    accountId: str(o.accountId, `recurringDepositRules[${index}].accountId`, MAX_ID_LEN),
    amount: num(o.amount, `recurringDepositRules[${index}].amount`),
    fee: optionalNum(o.fee, `recurringDepositRules[${index}].fee`),
    note: optionalStr(o.note, `recurringDepositRules[${index}].note`, MAX_NOTE_LEN),
    category: optionalEnum(o.category, `recurringDepositRules[${index}].category`, CF_CATEGORIES) as
      | CashFlowCategory
      | undefined,
    exchangeRate: optionalNum(o.exchangeRate, `recurringDepositRules[${index}].exchangeRate`),
    amountTWD: optionalNum(o.amountTWD, `recurringDepositRules[${index}].amountTWD`),
    startMonth: yearMonth(o.startMonth, `recurringDepositRules[${index}].startMonth`),
    lastAppliedPeriod: yearMonth(
      o.lastAppliedPeriod,
      `recurringDepositRules[${index}].lastAppliedPeriod`
    ),
    createdMonth: yearMonth(o.createdMonth, `recurringDepositRules[${index}].createdMonth`),
    kind: optionalEnum(o.kind, `recurringDepositRules[${index}].kind`, RULE_KINDS) as
      | 'RECURRING_DEPOSIT'
      | 'DEBT_PAYMENT_ALERT'
      | undefined,
    leadDays: optionalNum(o.leadDays, `recurringDepositRules[${index}].leadDays`),
    lastAcknowledgedPeriod: yearMonth(
      o.lastAcknowledgedPeriod,
      `recurringDepositRules[${index}].lastAcknowledgedPeriod`
    ),
  };
}

function parseStockSplit(raw: unknown, index: number): StockSplitEvent {
  const o = requireObject(raw, `stockSplits[${index}]`);
  return {
    id: str(o.id, `stockSplits[${index}].id`, MAX_ID_LEN),
    ticker: str(o.ticker, `stockSplits[${index}].ticker`, MAX_TICKER_LEN),
    market: enumOf(o.market, `stockSplits[${index}].market`, MARKETS) as Market,
    effectiveDate: dateStr(o.effectiveDate, `stockSplits[${index}].effectiveDate`),
    sharesFrom: num(o.sharesFrom, `stockSplits[${index}].sharesFrom`),
    sharesTo: num(o.sharesTo, `stockSplits[${index}].sharesTo`),
    ratio: num(o.ratio, `stockSplits[${index}].ratio`),
    note: optionalStr(o.note, `stockSplits[${index}].note`, MAX_NOTE_LEN),
    createdAt: dateStr(o.createdAt, `stockSplits[${index}].createdAt`),
  };
}

function parsePriceMap(raw: unknown, label: string): Record<string, number> {
  const o = requireObject(raw, label);
  const out: Record<string, number> = {};
  let count = 0;
  for (const [key, value] of Object.entries(o)) {
    if (count >= MAX_PRICE_KEYS) {
      throw new ImportValidationError(`${label} exceeds price key limit`);
    }
    if (key.length > MAX_TICKER_LEN) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[key] = value;
    count++;
  }
  return out;
}

function parsePriceDetails(raw: unknown): Record<string, { change: number; changePercent: number; previousClose?: number }> {
  const o = requireObject(raw, 'priceDetails');
  const out: Record<string, { change: number; changePercent: number; previousClose?: number }> = {};
  let count = 0;
  for (const [key, value] of Object.entries(o)) {
    if (count >= MAX_PRICE_KEYS) break;
    if (!isPlainObject(value)) continue;
    const change = value.change;
    const changePercent = value.changePercent;
    const previousClose = value.previousClose;
    if (
      typeof change !== 'number' ||
      typeof changePercent !== 'number' ||
      !Number.isFinite(change) ||
      !Number.isFinite(changePercent)
    ) {
      continue;
    }
    if (key.length <= MAX_TICKER_LEN) {
      const entry: { change: number; changePercent: number; previousClose?: number } = { change, changePercent };
      if (typeof previousClose === 'number' && Number.isFinite(previousClose) && previousClose > 0) {
        entry.previousClose = previousClose;
      }
      out[key] = entry;
      count++;
    }
  }
  return out;
}

function parseRebalanceTargets(raw: unknown): Record<string, number> {
  const o = requireObject(raw, 'rebalanceTargets');
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(o)) {
    if (key.length > MAX_TICKER_LEN) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function parseStringArray(raw: unknown, label: string, maxLen: number, itemMax: number): string[] {
  const arr = requireArray(raw, label, maxLen);
  return arr.map((item, i) => str(item, `${label}[${i}]`, itemMax));
}

function parseHistoricalData(raw: unknown): HistoricalData {
  const o = requireObject(raw, 'historicalData');
  const out: HistoricalData = {};
  const keys = Object.keys(o);
  if (keys.length > MAX_HISTORICAL_PERIODS) {
    throw new ImportValidationError(`historicalData exceeds period limit (${MAX_HISTORICAL_PERIODS})`);
  }
  for (const periodKey of keys) {
    if (!HIST_PERIOD_KEY.test(periodKey)) continue;
    const snap = requireObject(o[periodKey], `historicalData[${periodKey}]`);
    const pricesRaw = snap.prices;
    const prices =
      pricesRaw === undefined
        ? {}
        : (() => {
            const p = requireObject(pricesRaw, `historicalData[${periodKey}].prices`);
            const pricesOut: Record<string, number> = {};
            let n = 0;
            for (const [k, v] of Object.entries(p)) {
              if (n >= MAX_PRICES_PER_PERIOD) break;
              if (k.length > MAX_TICKER_LEN) continue;
              if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
                pricesOut[k] = v;
                n++;
              }
            }
            return pricesOut;
          })();

    const exchangeRate = num(snap.exchangeRate, `historicalData[${periodKey}].exchangeRate`);
    if (exchangeRate <= 0) {
      throw new ImportValidationError(`historicalData[${periodKey}].exchangeRate must be positive`);
    }

    const optionalHistRate = (field: string) => {
      const v = snap[field];
      if (v === undefined || v === null) return undefined;
      const r = num(v, `historicalData[${periodKey}].${field}`);
      return r > 0 ? r : undefined;
    };

    out[periodKey] = {
      prices,
      exchangeRate,
      jpyExchangeRate: optionalHistRate('jpyExchangeRate'),
      eurExchangeRate: optionalHistRate('eurExchangeRate'),
      gbpExchangeRate: optionalHistRate('gbpExchangeRate'),
      hkdExchangeRate: optionalHistRate('hkdExchangeRate'),
      krwExchangeRate: optionalHistRate('krwExchangeRate'),
      cnyExchangeRate: optionalHistRate('cnyExchangeRate'),
      cadExchangeRate: optionalHistRate('cadExchangeRate'),
      audExchangeRate: optionalHistRate('audExchangeRate'),
      inrExchangeRate: optionalHistRate('inrExchangeRate'),
      sarExchangeRate: optionalHistRate('sarExchangeRate'),
      brlExchangeRate: optionalHistRate('brlExchangeRate'),
    };
  }
  return out;
}

function parseRates(raw: Record<string, unknown>): Partial<ExchangeRates> {
  const ru: Partial<ExchangeRates> = {};
  const usd = raw.exchangeRate ?? raw.exchangeRateUsdToTwd;
  if (usd !== undefined) {
    const r = num(usd, 'exchangeRate');
    if (r > 0) ru.exchangeRateUsdToTwd = r;
  }
  const optionalRate = (key: keyof ExchangeRates, field: string) => {
    const v = raw[field];
    if (v === undefined || v === null) return;
    const r = num(v, field);
    if (r > 0) ru[key] = r;
  };
  optionalRate('jpyExchangeRate', 'jpyExchangeRate');
  optionalRate('eurExchangeRate', 'eurExchangeRate');
  optionalRate('gbpExchangeRate', 'gbpExchangeRate');
  optionalRate('hkdExchangeRate', 'hkdExchangeRate');
  optionalRate('krwExchangeRate', 'krwExchangeRate');
  optionalRate('cnyExchangeRate', 'cnyExchangeRate');
  optionalRate('inrExchangeRate', 'inrExchangeRate');
  optionalRate('cadExchangeRate', 'cadExchangeRate');
  optionalRate('audExchangeRate', 'audExchangeRate');
  optionalRate('sarExchangeRate', 'sarExchangeRate');
  optionalRate('brlExchangeRate', 'brlExchangeRate');
  return ru;
}

function dedupeById<T extends { id: string }>(items: T[], label: string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  if (out.length < items.length) {
    console.warn(`[import] Dropped duplicate ${label} ids`);
  }
  return out;
}

function filterByAccountIds<T extends { accountId: string }>(
  items: T[],
  accountIds: Set<string>,
  label: string
): T[] {
  if (accountIds.size === 0) return items;
  const out = items.filter(item => accountIds.has(item.accountId));
  if (out.length < items.length) {
    console.warn(`[import] Dropped ${items.length - out.length} ${label} with unknown accountId`);
  }
  return out;
}

/** 驗證並清理 TradeView 備份 JSON（匯入還原用） */
export function parseImportBackup(jsonText: string): ValidatedImportBackup {
  if (jsonText.length > MAX_JSON_BYTES) {
    throw new ImportValidationError('Backup file is too large');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new ImportValidationError('Invalid JSON');
  }

  const root = requireObject(raw, 'backup');

  const hasTx = Array.isArray(root.transactions);
  const hasAcc = Array.isArray(root.accounts);
  if (!hasTx && !hasAcc) {
    throw new ImportValidationError('Backup must include transactions or accounts');
  }

  const accounts = dedupeById(
    (hasAcc ? requireArray(root.accounts, 'accounts', MAX_ACCOUNTS) : []).map((item, i) =>
      parseAccount(item, i)
    ),
    'accounts'
  );
  const accountIds = new Set(accounts.map(a => a.id));

  const transactions = dedupeById(
    filterByAccountIds(
      (hasTx ? requireArray(root.transactions, 'transactions', MAX_TRANSACTIONS) : []).map(
        (item, i) => parseTransaction(item, i)
      ),
      accountIds,
      'transactions'
    ),
    'transactions'
  );

  const cashFlows = dedupeById(
    filterByAccountIds(
      (Array.isArray(root.cashFlows)
        ? requireArray(root.cashFlows, 'cashFlows', MAX_CASH_FLOWS)
        : []
      ).map((item, i) => parseCashFlow(item, i)),
      accountIds,
      'cashFlows'
    ),
    'cashFlows'
  );

  const recurringDepositRules = dedupeById(
    filterByAccountIds(
      (Array.isArray(root.recurringDepositRules)
        ? requireArray(root.recurringDepositRules, 'recurringDepositRules', MAX_RECURRING_RULES)
        : []
      ).map((item, i) => parseRecurringRule(item, i)),
      accountIds,
      'recurringDepositRules'
    ),
    'recurringDepositRules'
  );

  const stockSplits = dedupeById(
    (Array.isArray(root.stockSplits)
      ? requireArray(root.stockSplits, 'stockSplits', MAX_STOCK_SPLITS)
      : []
    ).map((item, i) => parseStockSplit(item, i)),
    'stockSplits'
  );

  const currentPrices =
    root.currentPrices !== undefined ? parsePriceMap(root.currentPrices, 'currentPrices') : {};
  const priceDetails =
    root.priceDetails !== undefined ? parsePriceDetails(root.priceDetails) : {};
  const rebalanceTargets =
    root.rebalanceTargets !== undefined ? parseRebalanceTargets(root.rebalanceTargets) : {};
  const rebalanceEnabledItems =
    root.rebalanceEnabledItems !== undefined
      ? parseStringArray(root.rebalanceEnabledItems, 'rebalanceEnabledItems', MAX_REBALANCE_ITEMS, 64)
      : [];
  const historicalData =
    root.historicalData !== undefined ? parseHistoricalData(root.historicalData) : {};

  const rates = parseRates(root);

  let baseCurrency: BaseCurrency | undefined;
  if (root.baseCurrency !== undefined && root.baseCurrency !== null) {
    const bc = String(root.baseCurrency);
    if (!BASE_CURRENCY_SET.has(bc)) {
      throw new ImportValidationError('baseCurrency is invalid');
    }
    baseCurrency = bc as BaseCurrency;
  }

  let minDebtSafetySpread: number | undefined;
  if (root.minDebtSafetySpread !== undefined && root.minDebtSafetySpread !== null) {
    const spread = num(root.minDebtSafetySpread, 'minDebtSafetySpread');
    if (spread >= 0 && spread <= 100) minDebtSafetySpread = spread;
  }

  return {
    transactions,
    accounts,
    cashFlows,
    currentPrices,
    priceDetails,
    rebalanceTargets,
    rebalanceEnabledItems,
    historicalData,
    recurringDepositRules,
    stockSplits,
    rates,
    baseCurrency,
    minDebtSafetySpread,
  };
}
