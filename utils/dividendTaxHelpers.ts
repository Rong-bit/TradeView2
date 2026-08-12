import { Market } from '../types';
import type { Account, Transaction } from '../types';
import type { YahooMarket } from '../services/yahooFinanceService';

/** 配息相關 map 鍵：`${market}\x1e${ticker}` */
export function dividendScheduleMapKey(market: Market, ticker: string): string {
  return `${market}\x1e${ticker.trim().toUpperCase()}`;
}

/** 二代健保補充保費：單次給付達此金額（含）以上須扣繳（參考常數，以最新法規為準） */
export const TW_NHI_SUPPLEMENT_THRESHOLD_TWD = 20_000;
/** 補充保費率（參考常數） */
export const TW_NHI_SUPPLEMENT_RATE = 0.0211;
/** 台股股票股計入門檻時每股面額（元）；門檻＝現金股利（元）＋股票股數×此面額（常見為 10） */
export const TW_STOCK_FACE_VALUE_PER_SHARE_NHI_BASIS_TWD = 10;

/** 試算二代健保門檻用：股票股股數對應之面額合計（元） */
export function twStockDividendParValueForNhiBasisTwd(stockDividendShares: number): number {
  const n = Number(stockDividendShares);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n * TW_STOCK_FACE_VALUE_PER_SHARE_NHI_BASIS_TWD;
}

/** 美股配息常見預扣 30%（僅供試算） */
export const US_DIVIDEND_WITHHOLDING_RATE = 0.3;

/** 依帳戶稅務文件取得美股股息預扣率；舊帳戶維持 W-8BEN 30% 相容預設。 */
export function getAccountUsDividendWithholdingRate(
  account?: Pick<Account, 'usDividendTaxProfile' | 'usDividendCustomWithholdingPercent'>
): number {
  switch (account?.usDividendTaxProfile) {
    case 'W9_0':
      return 0;
    case 'BACKUP_24':
      return 0.24;
    case 'CUSTOM': {
      const percent = account.usDividendCustomWithholdingPercent;
      if (!Number.isFinite(percent)) return US_DIVIDEND_WITHHOLDING_RATE;
      return Math.max(0, Math.min(100, Number(percent))) / 100;
    }
    case 'W8BEN_30':
    default:
      return US_DIVIDEND_WITHHOLDING_RATE;
  }
}
/** 台股現金股利跨行等常見匯費（元；是否收取依券商／銀行，未自動從試算中扣除） */
export const TW_DIVIDEND_CROSS_BANK_WIRE_FEE_TWD = 10;
export function marketToYahooMarketForDividends(m: Market): YahooMarket | null {
  const map: Partial<Record<Market, YahooMarket>> = {
    [Market.US]: 'US',
    [Market.TW]: 'TW',
    [Market.UK]: 'UK',
    [Market.JP]: 'JP',
    [Market.CN]: 'CN',
    [Market.SZ]: 'SZ',
    [Market.IN]: 'IN',
    [Market.CA]: 'CA',
    [Market.FR]: 'FR',
    [Market.HK]: 'HK',
    [Market.KR]: 'KR',
    [Market.DE]: 'DE',
    [Market.AU]: 'AU',
    [Market.SA]: 'SA',
    [Market.BR]: 'BR',
  };
  return map[m] ?? null;
}

/** 台股：依最近一次每股配息試算單次現金股利（TWD），四捨五入至元 */
export function twEstimatedSingleDividendTwd(shares: number, lastAmountPerShareTwd: number): number {
  if (shares <= 0 || lastAmountPerShareTwd <= 0) return 0;
  return Math.round(shares * lastAmountPerShareTwd);
}

/**
 * 二代健保補充保費試算：門檻為「現金股利（元）＋同次股票面額」≥ 20,000；
 * 費率 2.11%；依衛福部規範，補充保費計算至「元」，角以下無條件捨去（非四捨五入）。
 * cashDividendRoundedTwd：現金股利建議為已四捨五入至元後金額（與本專案 tryEstimate 一致）。
 * stockParValueTwdSameDistribution：同次股票股計入門檻之額（股數×每股面額，台股通常每股面額 10 元）。
 */
export function twNhiSupplementFloorTwd(
  cashDividendRoundedTwd: number,
  stockParValueTwdSameDistribution = 0
): number {
  const par = Number.isFinite(stockParValueTwdSameDistribution) ? stockParValueTwdSameDistribution : 0;
  const basis = cashDividendRoundedTwd + par;
  if (basis < TW_NHI_SUPPLEMENT_THRESHOLD_TWD) return 0;
  return Math.floor(basis * TW_NHI_SUPPLEMENT_RATE);
}

/** ETF：依官方收益組成估算本次補充保費計費所得（54C 股利＋適用之利息所得）。 */
export function twEtfNhiEligibleIncomeTwd(
  grossDividendTwd: number,
  dividendIncomePercent: number,
  interestIncomePercent: number
): number {
  const gross = Number(grossDividendTwd);
  const dividendPercent = Number(dividendIncomePercent);
  const interestPercent = Number(interestIncomePercent);
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  if (!Number.isFinite(dividendPercent) || !Number.isFinite(interestPercent)) return 0;
  const eligiblePercent = Math.max(0, Math.min(100, dividendPercent + interestPercent));
  return Math.round(gross * eligiblePercent / 100);
}

/** 以已確認的補充保費計費所得套用門檻與費率。 */
export function twNhiSupplementFromEligibleIncomeTwd(eligibleIncomeTwd: number): number {
  const basis = Math.round(eligibleIncomeTwd);
  if (!Number.isFinite(basis) || basis < TW_NHI_SUPPLEMENT_THRESHOLD_TWD) return 0;
  return Math.floor(basis * TW_NHI_SUPPLEMENT_RATE);
}

/** 是否為常見高配息 ETF（拆單教育文案用） */
export function isHighDividendTwEtfTicker(ticker: string): boolean {
  const t = ticker.trim();
  return t === '0050' || t === '0056' || t === '00878';
}

/** 美股複委託常見試算：以完整精度毛額分別四捨五入稅前金額與預扣稅至美分 */
export const US_DIVIDEND_GROSS_DECIMALS = 2;

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function decimalStringToScaledInt(value: string): { digits: bigint; scale: number } {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const digits = BigInt(`${negative ? '-' : ''}${whole}${fraction}`);
  return { digits, scale: fraction.length };
}

function divideAndRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function usDividendScaledProduct(shares: number, perShare: number): {
  product: bigint;
  divisor: bigint;
} {
  const SHARE_SCALE = 6;
  const PER_SHARE_SCALE = 6;
  const share = decimalStringToScaledInt(shares.toFixed(SHARE_SCALE));
  const perShareScaled = decimalStringToScaledInt(perShare.toFixed(PER_SHARE_SCALE));
  const product = share.digits * perShareScaled.digits;
  const totalScale = share.scale + perShareScaled.scale;
  return { product, divisor: 10n ** BigInt(totalScale) };
}

/** 稅前毛額：股數 × 完整精度每股股息後四捨五入至美分（BigInt 避免浮點誤差） */
function usDividendGrossNative(shares: number, perShare: number): number {
  const { product, divisor } = usDividendScaledProduct(shares, perShare);
  const grossCents = divideAndRoundHalfUp(product * 100n, divisor);
  return Number(grossCents) / 100;
}

/** 以未截位的原始毛額計算預扣稅，再四捨五入至美分。 */
function usDividendWithholdingCents(
  shares: number,
  perShare: number,
  withholdingRate: number
): number {
  const normalizedRate = Math.max(0, Math.min(1, withholdingRate));
  if (normalizedRate <= 0) return 0;
  const { product, divisor } = usDividendScaledProduct(shares, perShare);
  const RATE_SCALE = 1_000_000n;
  const scaledRate = BigInt(Math.round(normalizedRate * Number(RATE_SCALE)));
  const numerator = product * scaledRate * 100n;
  const denominator = divisor * RATE_SCALE;
  return Number(divideAndRoundHalfUp(numerator, denominator));
}

/** 美股：試算毛額、預扣稅、實領（毛額與原始毛額計稅結果分別四捨五入至美分） */
export function usCashDividendCentBreakdown(
  shares: number,
  perShare: number,
  explicitTaxNative?: number,
  withholdingRate = US_DIVIDEND_WITHHOLDING_RATE
): {
  grossCents: number;
  taxCents: number;
  netCents: number;
  grossNative: number;
  taxNative: number;
  netNative: number;
} {
  if (shares <= 0 || perShare <= 0) {
    return {
      grossCents: 0,
      taxCents: 0,
      netCents: 0,
      grossNative: 0,
      taxNative: 0,
      netNative: 0,
    };
  }

  const grossNative = usDividendGrossNative(shares, perShare);
  const grossCents = Math.round(grossNative * 100);
  const taxCents =
    explicitTaxNative != null && explicitTaxNative >= 0
      ? Math.round(explicitTaxNative * 100)
      : Math.min(
          grossCents,
          usDividendWithholdingCents(shares, perShare, withholdingRate)
        );
  const netCents = grossCents - taxCents;
  const taxNative = taxCents / 100;
  const netNative = netCents / 100;

  return {
    grossCents,
    taxCents,
    netCents,
    grossNative,
    taxNative,
    netNative,
  };
}

/** 美股：試算稅後配息（原幣） */
export function usEstimatedNetDividendNative(shares: number, lastAmountPerShareUsd: number): number {
  return usCashDividendCentBreakdown(shares, lastAmountPerShareUsd).netNative;
}

/**
 * 美股：備註每股×股數試算；若 userNet 與公式淨額不同（手動調整實領），
 * 以 userNet 為準，稅前採 2 位小數並反推預扣稅。
 */
export function usCashDividendFromNoteWithNetOverride(
  shares: number,
  perShare: number,
  userNetNative?: number
): {
  grossNative: number;
  taxNative: number;
  netNative: number;
  isManualNet: boolean;
} {
  const formula = usCashDividendCentBreakdown(shares, perShare);
  const grossRounded = Math.round(formula.grossNative * 100) / 100;
  const userNet =
    userNetNative != null && Number.isFinite(userNetNative) && userNetNative > 0
      ? Math.round(userNetNative * 100) / 100
      : undefined;
  if (userNet != null && Math.abs(userNet - formula.netNative) >= 0.005) {
    const taxNative = Math.round((grossRounded - userNet) * 100) / 100;
    return {
      grossNative: grossRounded,
      taxNative: Math.max(0, taxNative),
      netNative: userNet,
      isManualNet: true,
    };
  }
  return {
    grossNative: formula.grossNative,
    taxNative: formula.taxNative,
    netNative: formula.netNative,
    isManualNet: false,
  };
}

/** 美股：已知稅前毛額時試算預扣稅與稅後實領（各自四捨五入至美分） */
export function usWithholdingFromGrossNative(
  grossNative: number,
  withholdingRate = US_DIVIDEND_WITHHOLDING_RATE
): {
  taxNative: number;
  netNative: number;
} {
  if (!Number.isFinite(grossNative) || grossNative <= 0) {
    return { taxNative: 0, netNative: 0 };
  }
  const grossCents = Math.round(roundToCents(grossNative) * 100);
  const normalizedRate = Math.max(0, Math.min(1, withholdingRate));
  const taxCents = Math.min(
    grossCents,
    Math.round(roundToCents(grossNative * normalizedRate) * 100)
  );
  const taxNative = taxCents / 100;
  const netNative = (grossCents - taxCents) / 100;
  return { taxNative, netNative };
}

/** 台股：已知稅前現金股利（元）時試算二代健保與稅後實領 */
export function twNetFromGrossTwd(grossTwd: number): {
  withheldNhiTwd?: number;
  netNative: number;
} {
  const gross = Math.round(grossTwd);
  if (gross <= 0) return { netNative: 0 };
  const withheldNhiTwd =
    gross >= TW_NHI_SUPPLEMENT_THRESHOLD_TWD ? twNhiSupplementFloorTwd(gross) : undefined;
  const netNative = gross - (withheldNhiTwd ?? 0);
  return { withheldNhiTwd, netNative };
}

/** 美股配息金額顯示（固定 2 位小數，避免 toLocaleString 銀行家捨入） */
export function formatUsDividendNativeAmount(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return (Math.round(value * 100) / 100).toFixed(2);
}

/** 配息試算：日／韓／印等以整數元（分）呈現的市場 */
export const DIVIDEND_INTEGER_AMOUNT_MARKETS = new Set<Market>([
  Market.TW,
  Market.JP,
  Market.KR,
  Market.IN,
]);

export type MarketDividendWithholdingMode = 'none' | 'flat_rate' | 'tw_nhi' | 'us_broker';

export type MarketDividendWithholdingConfig = {
  mode: MarketDividendWithholdingMode;
  /** 固定預扣率 0–1（tw_nhi / none 忽略；us_broker 用 US_DIVIDEND_WITHHOLDING_RATE） */
  referenceRate?: number;
};

/**
 * 各市场配息预扣试算（参考常数；实际依券商、租税条约、账户类型而异，非报税建议）。
 * 台湾投资者常见情境：外国源扣缴 + 台股二代健保。
 */
export const MARKET_DIVIDEND_WITHHOLDING: Record<Market, MarketDividendWithholdingConfig> = {
  [Market.US]: { mode: 'us_broker', referenceRate: US_DIVIDEND_WITHHOLDING_RATE },
  [Market.TW]: { mode: 'tw_nhi' },
  [Market.UK]: { mode: 'none', referenceRate: 0 },
  [Market.HK]: { mode: 'none', referenceRate: 0 },
  [Market.JP]: { mode: 'flat_rate', referenceRate: 0.1 },
  [Market.CN]: { mode: 'flat_rate', referenceRate: 0.1 },
  [Market.SZ]: { mode: 'flat_rate', referenceRate: 0.1 },
  [Market.KR]: { mode: 'flat_rate', referenceRate: 0.15 },
  [Market.IN]: { mode: 'flat_rate', referenceRate: 0.2 },
  [Market.CA]: { mode: 'flat_rate', referenceRate: 0.15 },
  [Market.FR]: { mode: 'flat_rate', referenceRate: 0.15 },
  [Market.DE]: { mode: 'flat_rate', referenceRate: 0.26375 },
  [Market.AU]: { mode: 'flat_rate', referenceRate: 0.3 },
  [Market.SA]: { mode: 'flat_rate', referenceRate: 0.05 },
  [Market.BR]: { mode: 'none', referenceRate: 0 },
};

export type CashDividendBreakdown = {
  grossNative: number;
  taxNative: number;
  netNative: number;
  withheldNhiTwd?: number;
  withheldUsTaxNative?: number;
  withheldTaxNative?: number;
  referenceRate?: number;
};

function roundDividendNativeAmount(market: Market, value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (DIVIDEND_INTEGER_AMOUNT_MARKETS.has(market)) return Math.round(value);
  return Math.round(value * 100) / 100;
}

function cashDividendGrossNative(market: Market, shares: number, perShare: number): number {
  if (shares <= 0 || perShare <= 0) return 0;
  if (market === Market.US) return usDividendGrossNative(shares, perShare);
  if (market === Market.TW) return twEstimatedSingleDividendTwd(shares, perShare);
  return roundDividendNativeAmount(market, shares * perShare);
}

function flatRateWithholdingTax(
  market: Market,
  grossNative: number,
  rate: number
): number {
  if (grossNative <= 0 || rate <= 0) return 0;
  const raw = grossNative * rate;
  if (DIVIDEND_INTEGER_AMOUNT_MARKETS.has(market)) return Math.round(raw);
  return roundToCents(raw);
}

/** 是否有试算预扣（非 none） */
export function marketHasStatutoryWithholdingTrial(market: Market): boolean {
  const cfg = MARKET_DIVIDEND_WITHHOLDING[market];
  if (cfg.mode === 'tw_nhi' || cfg.mode === 'us_broker') return true;
  return cfg.mode === 'flat_rate' && (cfg.referenceRate ?? 0) > 0;
}

/** 股息 price 栏存「扣完试算预扣后净额」的市场（台股仍为毛额／扣 NHI 后总额） */
export function marketCashDividendPriceIsNetAfterWithholding(market: Market): boolean {
  if (market === Market.TW) return false;
  return marketHasStatutoryWithholdingTrial(market);
}

/** 参考预扣率百分比（供 UI 显示；无则 null） */
export function getMarketWithholdingReferenceRatePercent(market: Market): number | null {
  const cfg = MARKET_DIVIDEND_WITHHOLDING[market];
  if (cfg.mode === 'tw_nhi') return TW_NHI_SUPPLEMENT_RATE * 100;
  if (cfg.mode === 'us_broker') return US_DIVIDEND_WITHHOLDING_RATE * 100;
  if (cfg.mode === 'flat_rate' && (cfg.referenceRate ?? 0) > 0) {
    return Math.round((cfg.referenceRate ?? 0) * 10000) / 100;
  }
  return null;
}

export function formatCashDividendNativeAmountForMarket(market: Market, value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (market === Market.US) return formatUsDividendNativeAmount(value);
  if (DIVIDEND_INTEGER_AMOUNT_MARKETS.has(market)) return String(Math.round(value));
  return (Math.round(value * 100) / 100).toFixed(2);
}

/** 全市場：每股 × 股數試算毛額、预扣、實領 */
export function cashDividendBreakdownForMarket(
  market: Market,
  shares: number,
  perShare: number,
  opts?: {
    explicitTaxNative?: number;
    /** 美股帳戶適用的預扣率 0–1；未提供時維持 30%。 */
    usWithholdingRate?: number;
    /**
     * 台股 ETF 補充保費計費所得。null 表示已知為 ETF 但官方尚無組成，
     * 此時不可退回用整筆配息估算。
     */
    twNhiEligibleIncomeTwd?: number | null;
  }
): CashDividendBreakdown {
  const grossNative = cashDividendGrossNative(market, shares, perShare);
  if (grossNative <= 0) {
    return { grossNative: 0, taxNative: 0, netNative: 0 };
  }

  const cfg = MARKET_DIVIDEND_WITHHOLDING[market];

  if (cfg.mode === 'tw_nhi') {
    let nhi: number;
    if (opts?.explicitTaxNative != null && opts.explicitTaxNative >= 0) {
      nhi = Math.round(opts.explicitTaxNative);
    } else if (opts && 'twNhiEligibleIncomeTwd' in opts) {
      nhi =
        opts.twNhiEligibleIncomeTwd == null
          ? 0
          : twNhiSupplementFromEligibleIncomeTwd(opts.twNhiEligibleIncomeTwd);
    } else {
      nhi = twNhiSupplementFloorTwd(grossNative);
    }
    const taxNative = nhi > 0 ? nhi : 0;
    const netNative = grossNative - taxNative;
    return {
      grossNative,
      taxNative,
      netNative,
      ...(taxNative > 0 ? { withheldNhiTwd: taxNative } : {}),
      referenceRate: taxNative > 0 ? TW_NHI_SUPPLEMENT_RATE : undefined,
    };
  }

  if (cfg.mode === 'us_broker') {
    const formula = usCashDividendCentBreakdown(
      shares,
      perShare,
      opts?.explicitTaxNative,
      opts?.usWithholdingRate
    );
    return {
      grossNative: formula.grossNative,
      taxNative: formula.taxNative,
      netNative: formula.netNative,
      ...(formula.taxNative > 0 ? { withheldUsTaxNative: formula.taxNative } : {}),
      referenceRate: US_DIVIDEND_WITHHOLDING_RATE,
    };
  }

  const rate = cfg.referenceRate ?? 0;
  const taxNative =
    opts?.explicitTaxNative != null && opts.explicitTaxNative > 0
      ? roundDividendNativeAmount(market, opts.explicitTaxNative)
      : flatRateWithholdingTax(market, grossNative, rate);
  const netNative = roundDividendNativeAmount(market, grossNative - taxNative);
  return {
    grossNative,
    taxNative,
    netNative,
    ...(taxNative > 0 ? { withheldTaxNative: taxNative } : {}),
    ...(rate > 0 ? { referenceRate: rate } : {}),
  };
}

export function readTransactionStatutoryWithholding(tx: {
  market: Market;
  withheldNhiTwd?: number;
  withheldUsTaxNative?: number;
  withheldTaxNative?: number;
}): number | undefined {
  if (tx.market === Market.TW && tx.withheldNhiTwd != null && tx.withheldNhiTwd > 0) {
    return tx.withheldNhiTwd;
  }
  if (tx.market === Market.US && tx.withheldUsTaxNative != null && tx.withheldUsTaxNative > 0) {
    return tx.withheldUsTaxNative;
  }
  if (tx.withheldTaxNative != null && tx.withheldTaxNative > 0) {
    return tx.withheldTaxNative;
  }
  return undefined;
}

export function statutoryWithholdingFieldsForMarket(
  market: Market,
  taxNative: number | undefined
): Pick<Transaction, 'withheldNhiTwd' | 'withheldUsTaxNative' | 'withheldTaxNative'> {
  if (taxNative == null || taxNative <= 0) return {};
  if (market === Market.TW) return { withheldNhiTwd: Math.round(taxNative) };
  if (market === Market.US) {
    return { withheldUsTaxNative: roundToCents(taxNative) };
  }
  return { withheldTaxNative: roundDividendNativeAmount(market, taxNative) };
}

/** 待確認／表單：試算预扣固定；手動調整實領差額併入手續費（台股匯費等另用 twPendingConfirmSaveFields） */
export function netPriceMarketCashDividendSaveFields(params: {
  market: Market;
  autoNet: number;
  net: number;
  statutoryTax?: number;
}): {
  price: number;
  fees: number;
  amount: number;
} & Pick<Transaction, 'withheldNhiTwd' | 'withheldUsTaxNative' | 'withheldTaxNative'> {
  const autoNet = roundDividendNativeAmount(params.market, params.autoNet);
  const net = roundDividendNativeAmount(params.market, params.net);
  const manualFee = Math.max(
    0,
    roundDividendNativeAmount(params.market, autoNet - net)
  );
  return {
    price: autoNet,
    fees: manualFee,
    amount: net,
    ...statutoryWithholdingFieldsForMarket(params.market, params.statutoryTax),
  };
}

/** 備註每股×股數：存檔欄位（台股毛額模式 vs 其他扣稅後淨額模式） */
export function cashDividendSaveFromNoteBreakdown(params: {
  market: Market;
  shares: number;
  perShare: number;
  formPrice: number;
  formFees: number;
  preservedTaxNative?: number;
}): {
  price: number;
  fees: number;
  amount: number;
} & Pick<Transaction, 'withheldNhiTwd' | 'withheldUsTaxNative' | 'withheldTaxNative'> {
  const calc = cashDividendBreakdownForMarket(
    params.market,
    params.shares,
    params.perShare,
    { explicitTaxNative: params.preservedTaxNative }
  );

  if (params.market === Market.TW) {
    const grossNative = calc.grossNative;
    const nhi = calc.taxNative;
    const fees = roundDividendNativeAmount(Market.TW, params.formFees);
    const price = nhi > 0 ? grossNative - nhi : grossNative;
    return {
      price,
      fees,
      amount: roundDividendNativeAmount(Market.TW, grossNative - nhi - fees),
      ...statutoryWithholdingFieldsForMarket(Market.TW, nhi > 0 ? nhi : undefined),
    };
  }

  if (marketCashDividendPriceIsNetAfterWithholding(params.market)) {
    const autoNet = calc.netNative;
    let fees = roundDividendNativeAmount(params.market, params.formFees);
    const userPrice = params.formPrice;
    if (Number.isFinite(userPrice) && userPrice < autoNet) {
      fees = Math.max(
        0,
        roundDividendNativeAmount(params.market, autoNet - userPrice + fees)
      );
    }
    return {
      price: autoNet,
      fees,
      amount: roundDividendNativeAmount(params.market, autoNet - fees),
      ...statutoryWithholdingFieldsForMarket(
        params.market,
        calc.taxNative > 0 ? calc.taxNative : undefined
      ),
    };
  }

  const price = Number.isFinite(params.formPrice)
    ? roundDividendNativeAmount(params.market, params.formPrice)
    : calc.grossNative;
  const fees = roundDividendNativeAmount(params.market, params.formFees);
  return {
    price,
    fees,
    amount: roundDividendNativeAmount(params.market, price - fees),
  };
}
