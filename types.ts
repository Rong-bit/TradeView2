
/** 基準顯示幣別（儀表板總額等用此幣顯示） */
export type BaseCurrency = 'TWD' | 'USD' | 'JPY' | 'EUR' | 'GBP' | 'HKD' | 'KRW' | 'CAD' | 'INR' | 'CNY' | 'AUD' | 'SAR' | 'BRL';

export const BASE_CURRENCIES: BaseCurrency[] = ['TWD', 'USD', 'JPY', 'EUR', 'GBP', 'HKD', 'KRW', 'CAD', 'INR', 'CNY', 'AUD', 'SAR', 'BRL'];

export enum Market {
  US = 'US',
  TW = 'TW',
  UK = 'UK',
  JP = 'JP',
  CN = 'CN',
  SZ = 'SZ',
  IN = 'IN',
  CA = 'CA',
  FR = 'FR',
  HK = 'HK',
  KR = 'KR',
  DE = 'DE',
  AU = 'AU',
  SA = 'SA',
  BR = 'BR'
}

export enum Currency {
  TWD = 'TWD',
  USD = 'USD',
  JPY = 'JPY',
  HKD = 'HKD',
  SGD = 'SGD',
  CNY = 'CNY',
  INR = 'INR',
  KRW = 'KRW',
  THB = 'THB',
  MYR = 'MYR',
  IDR = 'IDR',
  VND = 'VND',
  PHP = 'PHP',
  EUR = 'EUR',
  GBP = 'GBP',
  CHF = 'CHF',
  SEK = 'SEK',
  NOK = 'NOK',
  DKK = 'DKK',
  AUD = 'AUD',
  CAD = 'CAD',
  NZD = 'NZD',
  ZAR = 'ZAR',
  BRL = 'BRL',
  MXN = 'MXN',
  SAR = 'SAR'
}

export enum TransactionType {
  BUY = 'BUY',
  SELL = 'SELL',
  DIVIDEND = 'DIVIDEND', // +shares; DRIP 再投資時應填單價/股數/金額，與 BUY 同樣增加成本（見 calculateHoldings）
  CASH_DIVIDEND = 'CASH_DIVIDEND', // Cash payout
  TRANSFER_IN = 'TRANSFER_IN', // Stock Transfer In
  TRANSFER_OUT = 'TRANSFER_OUT' // Stock Transfer Out
}

export enum CashFlowType {
  DEPOSIT = 'DEPOSIT', // Import: Salary, Savings -> Account
  WITHDRAW = 'WITHDRAW', // Export: Account -> Living expenses
  TRANSFER = 'TRANSFER', // Internal: Account A -> Account B
  INTEREST = 'INTEREST', // Interest income
  LOAN_INTEREST = 'LOAN_INTEREST', // Loan interest expense (brokerage outflow)
}

export enum AccountKind {
  BROKERAGE = 'BROKERAGE',
  LIABILITY = 'LIABILITY',
}

export enum DebtKind {
  PERSONAL_LOAN = 'PERSONAL_LOAN',
  MORTGAGE = 'MORTGAGE',
  SECURITIES_LENDING = 'SECURITIES_LENDING',
}

export type UsDividendTaxProfile = 'W8BEN_30' | 'W9_0' | 'BACKUP_24' | 'CUSTOM';

export type ScheduledRuleKind = 'RECURRING_DEPOSIT' | 'DEBT_PAYMENT_ALERT';

export enum CashFlowCategory {
  INVESTMENT = 'INVESTMENT', // 投資
  EDUCATION = 'EDUCATION', // 教育資金
  TRAVEL = 'TRAVEL', // 旅遊
  LIVING = 'LIVING', // 生活費
  EMERGENCY = 'EMERGENCY', // 緊急預備金
  OTHER = 'OTHER' // 其他
}

export interface Account {
  id: string;
  name: string;
  currency: Currency;
  isSubBrokerage: boolean; // For USD accounts in TW brokers
  balance: number; // Cash balance (LIABILITY: principal owed, positive)
  accountKind?: AccountKind;
  debtKind?: DebtKind;
  /** Annual interest % e.g. 2.2 */
  annualInterestRate?: number;
  /** Credit line limit (same currency as account); used for utilization display */
  creditLimit?: number;
  linkedBrokerageAccountId?: string;
  /** 美股股息預扣身分；舊帳戶未設定時視為 W-8BEN 30%。 */
  usDividendTaxProfile?: UsDividendTaxProfile;
  /** CUSTOM 時使用，百分比 0–100。 */
  usDividendCustomWithholdingPercent?: number;
  /** 已結清後由使用者隱藏：列表不顯示，資料與歷史仍保留 */
  isHidden?: boolean;
}

export interface CashFlow {
  id: string;
  date: string;
  type: CashFlowType;
  amount: number; // Native currency amount (e.g., USD for USD account)
  amountTWD?: number; // Exact TWD value involved (for cost basis accuracy)
  fee?: number; // Fee involved in the transaction (e.g. wire fee)
  accountId: string; // Source account (or Target for Deposit)
  targetAccountId?: string; // Only for Transfer
  exchangeRate?: number; // If transferring between currencies
  note?: string;
  category?: CashFlowCategory; // 資金用途類別
}

/** 每月固定某日自動建立 DEPOSIT 入金，或信貸繳款提醒（僅在開啟 App 時檢查） */
export interface RecurringDepositRule {
  id: string;
  enabled: boolean;
  /** 1–31；若該月無該日則用該月最後一日 */
  dayOfMonth: number;
  accountId: string;
  amount: number;
  fee?: number;
  note?: string;
  category?: CashFlowCategory;
  /** USD/JPY 等入金時用於推算 amountTWD（與手動入金一致） */
  exchangeRate?: number;
  /** 若填寫則優先於依匯率推算 */
  amountTWD?: number;
  /** 僅從此 YYYY-MM 起產生 */
  startMonth?: string;
  /** 內部：最後已掃描到的 YYYY-MM */
  lastAppliedPeriod?: string;
  /** 建立時 YYYY-MM；舊備份可省略 */
  createdMonth?: string;
  /** 預設 RECURRING_DEPOSIT */
  kind?: ScheduledRuleKind;
  /** DEBT_PAYMENT_ALERT：繳款日前幾天提醒，預設 3 */
  leadDays?: number;
  /** DEBT_PAYMENT_ALERT：YYYY-MM 已確認 */
  lastAcknowledgedPeriod?: string;
}

/** 股票拆分事件（不寫入交易紀錄，於計算層依生效日調整持倉） */
export interface StockSplitEvent {
  id: string;
  ticker: string;
  market: Market;
  effectiveDate: string;
  sharesFrom: number;
  sharesTo: number;
  ratio: number;
  note?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  date: string; // ISO Date string
  ticker: string;
  market: Market;
  type: TransactionType;
  price: number;
  quantity: number;
  fees: number;
  accountId: string;
  note?: string;
  amount?: number;
  category?: CashFlowCategory; // 股票用途類別
  priceCurrency?: string; // 報價幣別（覆蓋 market 推斷，例如 USD、GBP）
  /** 現金股利：二代健保補充保費已扣金額（台幣），供統計；與實領入帳分開紀錄 */
  withheldNhiTwd?: number;
  /** 現金股利：美股預扣稅金額（證券戶幣別，多為 USD），供統計 */
  withheldUsTaxNative?: number;
  /** 現金股利：其他市場源國／券商預扣稅（證券戶幣別），供統計 */
  withheldTaxNative?: number;
}

export interface Holding {
  ticker: string;
  market: Market;
  quantity: number;
  avgCost: number;
  totalCost: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  accountId: string;
  // New fields for Asset Allocation Table
  weight: number; // % of Total Portfolio (Invested + Cash)
  annualizedReturn: number; // CAGR %
  dailyChange?: number; // Price change amount
  dailyChangePercent?: number; // Price change %
  firstBuyDate?: string; // Helper for ROI calc
  category?: CashFlowCategory; // 股票用途類別
  priceCurrency?: string; // 報價幣別（覆蓋 market 推斷）
}

export interface PortfolioSummary {
  totalCostTWD: number;
  totalValueTWD: number;
  totalPLTWD: number;
  totalPLPercent: number;
  cashBalanceTWD: number; // Total cash across accounts converted to TWD
  netInvestedTWD: number; // Total cash deposits - withdrawals
  /** 負債本金餘額合計（TWD） */
  totalDebtBalanceTWD?: number;
  /** 淨資產 = 總資產 − 負債 */
  netWorthTWD?: number;
  /** 累計信貸撥入 − 還本（TWD） */
  leverageNetTWD?: number;
  hasDebtFunding?: boolean;
  annualizedReturn: number; // CAGR
  exchangeRateUsdToTwd: number;
  jpyExchangeRate?: number; // JPY to TWD exchange rate (optional)
  eurExchangeRate?: number; // EUR to TWD (1 EUR = N TWD)
  gbpExchangeRate?: number; // GBP to TWD (1 GBP = N TWD)
  hkdExchangeRate?: number; // HKD to TWD (1 HKD = N TWD)
  krwExchangeRate?: number; // KRW to TWD (1 KRW = N TWD)
  cnyExchangeRate?: number; // CNY to TWD (1 CNY = N TWD)
  inrExchangeRate?: number; // INR to TWD (1 INR = N TWD)
  cadExchangeRate?: number; // CAD to TWD (1 CAD = N TWD)
  audExchangeRate?: number; // AUD to TWD (1 AUD = N TWD)
  sarExchangeRate?: number; // SAR to TWD (1 SAR = N TWD)
  brlExchangeRate?: number; // BRL to TWD (1 BRL = N TWD)
  // Detailed fields
  accumulatedCashDividendsTWD: number;
  accumulatedStockDividendsTWD: number;
  avgExchangeRate: number;
  /** 當曆年：台股健保補充保費預扣合計（TWD） */
  yearWithheldNhiTwd: number;
  /** 當曆年：美股現金股利預扣稅合計（TWD）：有實際值則加總，否則依帳戶預扣設定回推。 */
  yearUsWithholdingTwd: number;
}

export interface ChartDataPoint {
  year: string;
  cost: number; // Purple: Cumulative Invested Cost (Principal)
  profit: number; // New: Cumulative Profit/Loss (Assets - Cost)
  totalAssets: number; // Green: Simulated Historical Value
  estTotalAssets: number; // Blue: Projected/Target curve
  assetCostRatio: number; // Red: Ratio (plotted on separate axis usually, or normalized)
  isRealData?: boolean; // New: Indicates if this point uses real historical prices
}

export interface AssetAllocationItem {
  name: string; // Ticker or "Cash" or "Others"
  value: number; // TWD Value
  ratio: number; // Percentage 0-100
  color: string;
}

export enum AssetClass {
  EQUITY = 'EQUITY',
  BOND = 'BOND',
  CASH = 'CASH',
  OTHER = 'OTHER'
}

export interface AssetClassAllocationItem {
  assetClass: AssetClass;
  name: string;
  value: number;
  ratio: number;
  color: string;
}

export interface AnnualPerformanceItem {
  year: string;
  startAssets: number;
  netInflow: number;
  endAssets: number;
  profit: number;
  roi: number;
  isRealData?: boolean;
}

export interface AttributionPoint {
  period: string;
  startAssets: number;
  endAssets: number;
  deltaAssets: number;
  netInflow: number;
  income: number;
  marketPL: number;
  cumulativeCost: number;
  cumulativeProfit: number;
  isRealData?: boolean;
  reconciledDiff: number;
  isConsistent: boolean;
}

/** 資金流瀑布圖單一期間（金額為 TWD） */
export interface WaterfallPeriodRow {
  period: string;
  startAssets: number;
  endAssets: number;
  netInflow: number;
  income: number;
  marketPL: number;
  deposit: number;
  withdraw: number;
  isRealData?: boolean;
}

export interface AccountPerformance {
  id: string;
  name: string;
  currency: Currency;
  totalAssetsTWD: number;
  marketValueTWD: number;
  cashBalanceTWD: number;
  profitTWD: number;
  roi: number;
  /** 無持股且現金≈0：證券戶績效已結清（轉倉結案後常見） */
  isClosed?: boolean;
  /** 無持股但仍有現金：空手、帳戶仍可用 */
  isFlat?: boolean;
  // 原始幣種數值（用於切換顯示）
  totalAssetsNative?: number;
  marketValueNative?: number;
  cashBalanceNative?: number;
  profitNative?: number;
  netInvestedNative?: number;
  unrealizedProfitTWD?: number;
  realizedProfitTWD?: number;
  incomeTWD?: number;
  unrealizedProfitNative?: number;
  realizedProfitNative?: number;
  incomeNative?: number;
}

// New Interface for Historical Data Storage
export interface HistoricalData {
  [year: string]: {
    prices: Record<string, number>; // Ticker -> Price on Dec 31
    exchangeRate: number; // USD to TWD on Dec 31
    jpyExchangeRate?: number; // JPY to TWD on Dec 31 (optional)
    eurExchangeRate?: number; // EUR to TWD on Dec 31 (optional)
    gbpExchangeRate?: number; // GBP to TWD on Dec 31 (optional)
    hkdExchangeRate?: number; // HKD to TWD on Dec 31 (optional)
    krwExchangeRate?: number; // KRW to TWD on Dec 31 (optional)
    cnyExchangeRate?: number; // CNY to TWD on Dec 31 (optional)
    cadExchangeRate?: number; // CAD to TWD on Dec 31 (optional)
    audExchangeRate?: number; // AUD to TWD on Dec 31 (optional)
    inrExchangeRate?: number; // INR to TWD on Dec 31 (optional)
    sarExchangeRate?: number; // SAR to TWD on Dec 31 (optional)
    brlExchangeRate?: number; // BRL to TWD on Dec 31 (optional)
  };
}

// 資產配置模擬相關類型
export interface AssetSimulationItem {
  id: string;
  ticker: string;
  market: Market;
  name?: string; // 可選的資產名稱
  annualizedReturn: number; // 年化報酬率 (%)
  allocation: number; // 配置比例 (%)
}

export interface SimulationResult {
  initialAmount: number; // 初始投資金額
  years: number; // 投資年數
  finalValue: number; // 最終價值
  totalReturn: number; // 總報酬
  totalReturnPercent: number; // 總報酬率 (%)
  annualizedReturn: number; // 組合年化報酬率 (%)
  yearlyProjections: YearlyProjection[]; // 年度預測
  regularInvestment?: {
    amount: number; // 定期定額金額
    frequency: 'monthly' | 'quarterly' | 'yearly'; // 投入頻率
    totalInvested: number; // 總投入金額（包含初始和定期定額）
  };
}

export interface YearlyProjection {
  year: number;
  value: number; // 該年度末的價值
  return: number; // 該年度的報酬
  returnPercent: number; // 該年度的報酬率 (%)
  regularInvestment?: number; // 該年度的定期定額投入
  cumulativeInvestment?: number; // 累積總投入（包含初始和定期定額）
}

// 用於交易記錄和資金流動記錄的統一型別
export interface CombinedRecord {
  id: string;
  date: string;
  accountId: string;
  type: 'TRANSACTION' | 'CASHFLOW';
  subType: TransactionType | CashFlowType | 'TRANSFER_IN';
  ticker: string;
  market: Market | '';
  price: number;
  quantity: number;
  amount: number;
  fees: number;
  description: string;
  originalRecord: Transaction | CashFlow;
  balance?: number;
  balanceChange?: number;
  // 僅用於 CASHFLOW 的欄位
  targetAccountId?: string;
  sourceAccountId?: string;
  exchangeRate?: number;
  isSourceRecord?: boolean;
  isTargetRecord?: boolean;
}

/** 全域提示對話框 state（登入頁與主畫面共用） */
export interface AlertDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

// 訂閱相關類型
export type SubscriptionStatus = 'active' | 'expired' | 'none';
export type SubscriptionPlan = 'monthly' | 'yearly';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  plan?: SubscriptionPlan;
  expiryDate?: Date;
  productId?: string;
  transactionId?: string;
  platform?: 'ios' | 'android' | 'web';
}

export interface SubscriptionProduct {
  id: string;
  title: string;
  description: string;
  price: string;
  priceValue: number;
  currency: string;
  plan: SubscriptionPlan;
}

