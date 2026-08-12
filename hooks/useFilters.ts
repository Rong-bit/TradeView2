import { useReducer, useCallback } from 'react';

/**
 * 篩選狀態介面
 */
export interface FilterState {
  account: string;
  ticker: string;
  dateFrom: string;
  dateTo: string;
  includeCashFlow: boolean;
}

/**
 * 篩選狀態的操作類型
 */
type FilterAction =
  | { type: 'SET_ACCOUNT'; payload: string }
  | { type: 'SET_TICKER'; payload: string }
  | { type: 'SET_DATE_FROM'; payload: string }
  | { type: 'SET_DATE_TO'; payload: string }
  | { type: 'SET_INCLUDE_CASH_FLOW'; payload: boolean }
  | { type: 'CLEAR_ALL' };

/**
 * 篩選狀態的初始值
 */
const initialState: FilterState = {
  account: '',
  ticker: '',
  dateFrom: '',
  dateTo: '',
  includeCashFlow: true,
};

/**
 * 篩選狀態的 reducer
 */
function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_ACCOUNT':
      return { ...state, account: action.payload };
    case 'SET_TICKER':
      return { ...state, ticker: action.payload };
    case 'SET_DATE_FROM':
      return { ...state, dateFrom: action.payload };
    case 'SET_DATE_TO':
      return { ...state, dateTo: action.payload };
    case 'SET_INCLUDE_CASH_FLOW':
      return { ...state, includeCashFlow: action.payload };
    case 'CLEAR_ALL':
      return initialState;
    default:
      return state;
  }
}

/**
 * 使用篩選狀態的自訂 Hook
 * 
 * @returns 篩選狀態和操作函數
 */
export function useFilters() {
  const [state, dispatch] = useReducer(filterReducer, initialState);

  const setAccount = useCallback((account: string) => {
    dispatch({ type: 'SET_ACCOUNT', payload: account });
  }, []);

  const setTicker = useCallback((ticker: string) => {
    dispatch({ type: 'SET_TICKER', payload: ticker });
  }, []);

  const setDateFrom = useCallback((dateFrom: string) => {
    dispatch({ type: 'SET_DATE_FROM', payload: dateFrom });
  }, []);

  const setDateTo = useCallback((dateTo: string) => {
    dispatch({ type: 'SET_DATE_TO', payload: dateTo });
  }, []);

  const setIncludeCashFlow = useCallback((includeCashFlow: boolean) => {
    dispatch({ type: 'SET_INCLUDE_CASH_FLOW', payload: includeCashFlow });
  }, []);

  const clearFilters = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  return {
    // 狀態值（保持向後兼容的命名）
    filterAccount: state.account,
    filterTicker: state.ticker,
    filterDateFrom: state.dateFrom,
    filterDateTo: state.dateTo,
    includeCashFlow: state.includeCashFlow,
    // 操作函數（保持向後兼容的命名）
    setFilterAccount: setAccount,
    setFilterTicker: setTicker,
    setFilterDateFrom: setDateFrom,
    setFilterDateTo: setDateTo,
    setIncludeCashFlow: setIncludeCashFlow,
    clearFilters: clearFilters,
  };
}

