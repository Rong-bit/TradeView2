import { Market } from '../portfolioTypes';

/**
 * 儀表板「資產配置」雙層甜甜圈配色（外圓：市場 / 內圓：股債）。
 * 若要改色，只須編輯此檔，無需動 Dashboard 邏輯。
 */
export const ALLOCATION_MARKET_COLORS: Record<Market, string> = {
  [Market.TW]: '#3b82f6',
  [Market.US]: '#22c55e',
  [Market.UK]: '#a855f7',
  [Market.JP]: '#ef4444',
  [Market.CN]: '#f59e0b',
  [Market.SZ]: '#d97706',
  [Market.IN]: '#14b8a6',
  [Market.CA]: '#f43f5e',
  [Market.FR]: '#6366f1',
  [Market.HK]: '#0ea5e9',
  [Market.KR]: '#ea580c',
  [Market.DE]: '#ca8a04',
  [Market.AU]: '#65a30d',
  [Market.SA]: '#047857',
  [Market.BR]: '#0891b2',
};

/** 內圓：股票（權益） */
export const ALLOCATION_INNER_EQUITY_COLOR = '#22c55e';
/** 內圓：債券（預設改為紫色，避免與外圓台股藍 #3b82f6 混淆；可改成任意 hex） */
export const ALLOCATION_INNER_BOND_COLOR = '#7c3aed';
