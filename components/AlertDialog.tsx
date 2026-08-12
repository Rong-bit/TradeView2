import React from 'react';
import { createPortal } from 'react-dom';
import { Language, t } from '../utils/i18n';
import type { AlertDialogState } from '../types';

export type { AlertDialogState };

interface Props {
  dialog: AlertDialogState;
  language: Language;
  onClose: () => void;
}

const AlertDialog: React.FC<Props> = ({ dialog, language, onClose }) => {
  if (!dialog.isOpen) return null;
  if (typeof document === 'undefined') return null;

  const titleClass =
    dialog.type === 'error'
      ? 'text-red-600'
      : dialog.type === 'success'
        ? 'text-green-600'
        : 'text-slate-800';

  // 使用 inline 底色，避免 .dark .bg-white { !important } 把卡片染成近黑，
  // 再疊純黑半透明遮罩時在 Chrome 看起來像整頁變黑（iOS 淺色模式較不明顯）。
  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)' }}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl max-w-sm w-full p-6 text-center relative z-[10051]"
        style={{ backgroundColor: '#ffffff', color: '#1e293b' }}
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <h3 className={`text-lg font-bold mb-2 ${titleClass}`}>{dialog.title}</h3>
        <p className="mb-6 whitespace-pre-line" style={{ color: '#475569' }}>
          {dialog.message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="bg-slate-900 text-white px-6 py-2 rounded hover:bg-slate-800"
        >
          {t(language).common.confirm}
        </button>
      </div>
    </div>,
    document.body
  );
};

export default AlertDialog;
