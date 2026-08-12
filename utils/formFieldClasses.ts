export const FORM_FIELD_THEME = 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600';

/** 確認對話框「取消」：暗色模式下避免淺底 + 淺字對比不足 */
export const MODAL_CANCEL_BUTTON =
  'px-4 py-2 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition';

export const MODAL_CANCEL_BUTTON_LG =
  'px-6 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition';

/** 行動裝置數字鍵盤：含小數點（金額、比例、匯率等） */
export const INPUT_MODE_DECIMAL = 'decimal' as const;

/** 行動裝置數字鍵盤：整數（日期、天數等；不含小數點） */
export const INPUT_MODE_NUMERIC = 'numeric' as const;

