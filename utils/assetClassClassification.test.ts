import { describe, expect, it } from 'vitest';
import { AssetClass } from '../types';
import { classifyAssetClassByTicker } from './calculations';

describe('asset class classification', () => {
  it('recognizes Taiwan bond ETF tickers ending in B', () => {
    expect(classifyAssetClassByTicker('00679B')).toBe(AssetClass.BOND);
    expect(classifyAssetClassByTicker('00937b')).toBe(AssetClass.BOND);
  });

  it('recognizes BNDW as a bond ETF', () => {
    expect(classifyAssetClassByTicker('BNDW')).toBe(AssetClass.BOND);
  });

  it('does not classify ordinary Taiwan stock tickers as bonds', () => {
    expect(classifyAssetClassByTicker('2330')).toBe(AssetClass.EQUITY);
  });
});
