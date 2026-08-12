import { useReducer } from 'react';

/**
 * UI 狀態介面
 */
export interface UIState {
  modal: {
    form: boolean;
    import: boolean;
    deleteConfirm: boolean;
    transactionDeleteConfirm: boolean;
    cashFlowDeleteConfirm: boolean;
    historical: boolean;
    batchUpdateMarket: boolean;
  };
  mobileMenu: boolean;
}

/**
 * UI 狀態的操作類型
 */
type UIAction =
  | { type: 'OPEN_FORM' }
  | { type: 'CLOSE_FORM' }
  | { type: 'OPEN_IMPORT' }
  | { type: 'CLOSE_IMPORT' }
  | { type: 'OPEN_DELETE_CONFIRM' }
  | { type: 'CLOSE_DELETE_CONFIRM' }
  | { type: 'OPEN_TRANSACTION_DELETE_CONFIRM' }
  | { type: 'CLOSE_TRANSACTION_DELETE_CONFIRM' }
  | { type: 'OPEN_CASHFLOW_DELETE_CONFIRM' }
  | { type: 'CLOSE_CASHFLOW_DELETE_CONFIRM' }
  | { type: 'OPEN_HISTORICAL' }
  | { type: 'CLOSE_HISTORICAL' }
  | { type: 'OPEN_BATCH_UPDATE_MARKET' }
  | { type: 'CLOSE_BATCH_UPDATE_MARKET' }
  | { type: 'OPEN_MOBILE_MENU' }
  | { type: 'CLOSE_MOBILE_MENU' }
  | { type: 'TOGGLE_MOBILE_MENU' };

/**
 * UI 狀態的初始值
 */
const initialState: UIState = {
  modal: {
    form: false,
    import: false,
    deleteConfirm: false,
    transactionDeleteConfirm: false,
    cashFlowDeleteConfirm: false,
    historical: false,
    batchUpdateMarket: false,
  },
  mobileMenu: false,
};

/**
 * UI 狀態的 reducer
 */
function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'OPEN_FORM':
      return { ...state, modal: { ...state.modal, form: true } };
    case 'CLOSE_FORM':
      return { ...state, modal: { ...state.modal, form: false } };
    case 'OPEN_IMPORT':
      return { ...state, modal: { ...state.modal, import: true } };
    case 'CLOSE_IMPORT':
      return { ...state, modal: { ...state.modal, import: false } };
    case 'OPEN_DELETE_CONFIRM':
      return { ...state, modal: { ...state.modal, deleteConfirm: true } };
    case 'CLOSE_DELETE_CONFIRM':
      return { ...state, modal: { ...state.modal, deleteConfirm: false } };
    case 'OPEN_TRANSACTION_DELETE_CONFIRM':
      return { ...state, modal: { ...state.modal, transactionDeleteConfirm: true } };
    case 'CLOSE_TRANSACTION_DELETE_CONFIRM':
      return { ...state, modal: { ...state.modal, transactionDeleteConfirm: false } };
    case 'OPEN_CASHFLOW_DELETE_CONFIRM':
      return { ...state, modal: { ...state.modal, cashFlowDeleteConfirm: true } };
    case 'CLOSE_CASHFLOW_DELETE_CONFIRM':
      return { ...state, modal: { ...state.modal, cashFlowDeleteConfirm: false } };
    case 'OPEN_HISTORICAL':
      return { ...state, modal: { ...state.modal, historical: true } };
    case 'CLOSE_HISTORICAL':
      return { ...state, modal: { ...state.modal, historical: false } };
    case 'OPEN_BATCH_UPDATE_MARKET':
      return { ...state, modal: { ...state.modal, batchUpdateMarket: true } };
    case 'CLOSE_BATCH_UPDATE_MARKET':
      return { ...state, modal: { ...state.modal, batchUpdateMarket: false } };
    case 'OPEN_MOBILE_MENU':
      return { ...state, mobileMenu: true };
    case 'CLOSE_MOBILE_MENU':
      return { ...state, mobileMenu: false };
    case 'TOGGLE_MOBILE_MENU':
      return { ...state, mobileMenu: !state.mobileMenu };
    default:
      return state;
  }
}

/**
 * 使用 UI 狀態的自訂 Hook
 * 
 * @returns UI 狀態和操作函數
 */
export function useUIState() {
  const [state, dispatch] = useReducer(uiReducer, initialState);

  // Modal 操作函數
  const openForm = () => dispatch({ type: 'OPEN_FORM' });
  const closeForm = () => dispatch({ type: 'CLOSE_FORM' });
  const openImport = () => dispatch({ type: 'OPEN_IMPORT' });
  const closeImport = () => dispatch({ type: 'CLOSE_IMPORT' });
  const openDeleteConfirm = () => dispatch({ type: 'OPEN_DELETE_CONFIRM' });
  const closeDeleteConfirm = () => dispatch({ type: 'CLOSE_DELETE_CONFIRM' });
  const openTransactionDeleteConfirm = () => dispatch({ type: 'OPEN_TRANSACTION_DELETE_CONFIRM' });
  const closeTransactionDeleteConfirm = () => dispatch({ type: 'CLOSE_TRANSACTION_DELETE_CONFIRM' });
  const openCashFlowDeleteConfirm = () => dispatch({ type: 'OPEN_CASHFLOW_DELETE_CONFIRM' });
  const closeCashFlowDeleteConfirm = () => dispatch({ type: 'CLOSE_CASHFLOW_DELETE_CONFIRM' });
  const openHistorical = () => dispatch({ type: 'OPEN_HISTORICAL' });
  const closeHistorical = () => dispatch({ type: 'CLOSE_HISTORICAL' });
  const openBatchUpdateMarket = () => dispatch({ type: 'OPEN_BATCH_UPDATE_MARKET' });
  const closeBatchUpdateMarket = () => dispatch({ type: 'CLOSE_BATCH_UPDATE_MARKET' });
  const openMobileMenu = () => dispatch({ type: 'OPEN_MOBILE_MENU' });
  const closeMobileMenu = () => dispatch({ type: 'CLOSE_MOBILE_MENU' });
  const toggleMobileMenu = () => dispatch({ type: 'TOGGLE_MOBILE_MENU' });

  return {
    // 狀態值（保持向後兼容的命名）
    isFormOpen: state.modal.form,
    isImportOpen: state.modal.import,
    isDeleteConfirmOpen: state.modal.deleteConfirm,
    isTransactionDeleteConfirmOpen: state.modal.transactionDeleteConfirm,
    isCashFlowDeleteConfirmOpen: state.modal.cashFlowDeleteConfirm,
    isHistoricalModalOpen: state.modal.historical,
    isBatchUpdateMarketOpen: state.modal.batchUpdateMarket,
    isMobileMenuOpen: state.mobileMenu,
    // 操作函數（保持向後兼容的命名）
    setIsFormOpen: (open: boolean) => open ? openForm() : closeForm(),
    setIsImportOpen: (open: boolean) => open ? openImport() : closeImport(),
    setIsDeleteConfirmOpen: (open: boolean) => open ? openDeleteConfirm() : closeDeleteConfirm(),
    setIsTransactionDeleteConfirmOpen: (open: boolean) => open ? openTransactionDeleteConfirm() : closeTransactionDeleteConfirm(),
    setIsCashFlowDeleteConfirmOpen: (open: boolean) => open ? openCashFlowDeleteConfirm() : closeCashFlowDeleteConfirm(),
    setIsHistoricalModalOpen: (open: boolean) => open ? openHistorical() : closeHistorical(),
    setIsBatchUpdateMarketOpen: (open: boolean) => open ? openBatchUpdateMarket() : closeBatchUpdateMarket(),
    setIsMobileMenuOpen: (open: boolean) => open ? openMobileMenu() : closeMobileMenu(),
    // 便利函數
    toggleMobileMenu,
  };
}

