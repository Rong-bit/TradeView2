import { useState, useCallback } from 'react';
import { Transaction } from '../types';

/**
 * 刪除操作狀態介面
 */
export interface DeleteState {
  transactionId: string | null;
  transactionEdit: Transaction | null;
  cashFlowId: string | null;
}

/**
 * 使用刪除操作狀態的自訂 Hook
 * 
 * @returns 刪除狀態和操作函數
 */
export function useDeleteState() {
  const [state, setState] = useState<DeleteState>({
    transactionId: null,
    transactionEdit: null,
    cashFlowId: null,
  });

  // Transaction 相關操作
  const setTransactionToDelete = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, transactionId: id }));
  }, []);

  const setTransactionToEdit = useCallback((transaction: Transaction | null) => {
    setState(prev => ({ ...prev, transactionEdit: transaction }));
  }, []);

  const clearTransactionDelete = useCallback(() => {
    setState(prev => ({ ...prev, transactionId: null }));
  }, []);

  const clearTransactionEdit = useCallback(() => {
    setState(prev => ({ ...prev, transactionEdit: null }));
  }, []);

  // CashFlow 相關操作
  const setCashFlowToDelete = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, cashFlowId: id }));
  }, []);

  const clearCashFlowDelete = useCallback(() => {
    setState(prev => ({ ...prev, cashFlowId: null }));
  }, []);

  // 清除所有刪除狀態
  const clearAll = useCallback(() => {
    setState({
      transactionId: null,
      transactionEdit: null,
      cashFlowId: null,
    });
  }, []);

  return {
    // 狀態值（保持向後兼容的命名）
    transactionToDelete: state.transactionId,
    transactionToEdit: state.transactionEdit,
    cashFlowToDelete: state.cashFlowId,
    // 操作函數（保持向後兼容的命名）
    setTransactionToDelete,
    setTransactionToEdit,
    setCashFlowToDelete,
    // 清除函數
    clearTransactionDelete,
    clearTransactionEdit,
    clearCashFlowDelete,
    clearAll,
  };
}



