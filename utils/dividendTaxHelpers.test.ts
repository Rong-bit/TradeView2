import { describe, expect, it } from 'vitest';
import { Market } from '../types';
import {
  cashDividendBreakdownForMarket,
  getAccountUsDividendWithholdingRate,
  twEtfNhiEligibleIncomeTwd,
  twNhiSupplementFromEligibleIncomeTwd,
  usCashDividendCentBreakdown,
} from './dividendTaxHelpers';

describe('US dividend withholding calculation', () => {
  it('rounds gross dividend and withholding tax independently to cents', () => {
    expect(usCashDividendCentBreakdown(831.88675, 0.2006)).toMatchObject({
      grossNative: 166.88,
      taxNative: 50.06,
      netNative: 116.82,
    });
  });

  it('keeps the expected result for a whole-share dividend', () => {
    expect(usCashDividendCentBreakdown(718, 0.2006)).toMatchObject({
      grossNative: 144.03,
      taxNative: 43.21,
      netNative: 100.82,
    });
  });

  it('calculates withholding from the unrounded gross dividend', () => {
    expect(usCashDividendCentBreakdown(1549.887, 0.2006)).toMatchObject({
      grossNative: 310.91,
      taxNative: 93.27,
      netNative: 217.64,
    });
  });

  it('keeps six-decimal per-share precision before rounding each result', () => {
    expect(usCashDividendCentBreakdown(312.56342, 0.562715)).toMatchObject({
      grossNative: 175.88,
      taxNative: 52.77,
      netNative: 123.11,
    });
  });

  it('supports W-9 zero withholding and 24% backup withholding', () => {
    expect(usCashDividendCentBreakdown(718, 0.2006, undefined, 0)).toMatchObject({
      grossNative: 144.03,
      taxNative: 0,
      netNative: 144.03,
    });
    expect(usCashDividendCentBreakdown(718, 0.2006, undefined, 0.24)).toMatchObject({
      grossNative: 144.03,
      taxNative: 34.57,
      netNative: 109.46,
    });
  });

  it('maps account tax profiles while keeping old accounts at 30%', () => {
    expect(getAccountUsDividendWithholdingRate()).toBe(0.3);
    expect(getAccountUsDividendWithholdingRate({ usDividendTaxProfile: 'W9_0' })).toBe(0);
    expect(getAccountUsDividendWithholdingRate({ usDividendTaxProfile: 'BACKUP_24' })).toBe(0.24);
    expect(
      getAccountUsDividendWithholdingRate({
        usDividendTaxProfile: 'CUSTOM',
        usDividendCustomWithholdingPercent: 15,
      })
    ).toBe(0.15);
  });

  it('honors an explicit zero U.S. withholding amount', () => {
    const breakdown = cashDividendBreakdownForMarket(Market.US, 718, 0.2006, {
      explicitTaxNative: 0,
    });
    expect(breakdown.taxNative).toBe(0);
    expect(breakdown.netNative).toBe(144.03);
    expect(breakdown.withheldUsTaxNative).toBeUndefined();
  });
});

describe('TW ETF NHI supplement calculation', () => {
  it('uses FundClear dividend and interest composition instead of gross payout', () => {
    const gross = 28_969;
    const eligibleIncome = twEtfNhiEligibleIncomeTwd(gross, 26, 0);

    expect(eligibleIncome).toBe(7_532);
    expect(twNhiSupplementFromEligibleIncomeTwd(eligibleIncome)).toBe(0);

    const breakdown = cashDividendBreakdownForMarket(Market.TW, 48_281, 0.6, {
      twNhiEligibleIncomeTwd: eligibleIncome,
    });
    expect(breakdown).toMatchObject({
      grossNative: 28_969,
      taxNative: 0,
      netNative: 28_969,
    });
    expect(breakdown.withheldNhiTwd).toBeUndefined();
  });

  it('charges 2.11% once eligible income reaches TWD 20,000', () => {
    expect(twNhiSupplementFromEligibleIncomeTwd(19_999)).toBe(0);
    expect(twNhiSupplementFromEligibleIncomeTwd(20_000)).toBe(422);
  });

  it('honors an explicit zero withholding and does not fall back to gross', () => {
    const breakdown = cashDividendBreakdownForMarket(Market.TW, 48_281, 0.6, {
      explicitTaxNative: 0,
    });
    expect(breakdown.taxNative).toBe(0);
    expect(breakdown.netNative).toBe(28_969);
  });

  it('does not deduct NHI for a confirmed ETF when composition is unavailable', () => {
    const breakdown = cashDividendBreakdownForMarket(Market.TW, 48_281, 0.6, {
      twNhiEligibleIncomeTwd: null,
    });
    expect(breakdown.taxNative).toBe(0);
    expect(breakdown.netNative).toBe(28_969);
  });
});
