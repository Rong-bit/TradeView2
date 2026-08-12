import React, { createContext, useContext } from 'react';
import type { AlertDialogState } from '../types';
import { Language } from '../utils/i18n';

export type View = 'dashboard' | 'history' | 'funds' | 'accounts' | 'splits' | 'rebalance' | 'simulator' | 'help';

/** @deprecated 請改用 AlertDialogState */
export type AlertState = AlertDialogState;

export interface UIContextValue {
  // 語言
  language: Language;
  setLanguage: (lang: Language) => void;

  // 頁面路由
  view: View;
  setView: (v: View) => void;
  availableViews: View[];

  // 認證
  isAuthenticated: boolean;
  isGuest: boolean;
  currentUser: string;

  // Alert
  alertDialog: AlertState;
  showAlert: (message: string, title?: string, type?: 'info' | 'success' | 'error') => void;
  closeAlert: () => void;

  /** 交易／資金紀錄剛新增時短暫高亮（約 1 分鐘後自動恢復） */
  isRecordHighlighted: (id: string) => boolean;
}

export const UIContext = createContext<UIContextValue | null>(null);

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside UIContext.Provider');
  return ctx;
}
