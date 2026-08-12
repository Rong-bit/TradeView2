import React from 'react';
import { Account, CashFlow, CashFlowType, Currency, Transaction } from '../types';
import { Language, t } from '../utils/i18n';
import { MODAL_CANCEL_BUTTON } from '../utils/formFieldClasses';
import type { AppText } from '../hooks/useAppText';

interface Props {
  language: Language;
  appText: AppText;
  isDeleteConfirmOpen: boolean;
  setIsDeleteConfirmOpen: (v: boolean) => void;
  confirmDeleteAllTransactions: () => void;
  pendingClearTxCount: number;
  isTransactionDeleteConfirmOpen: boolean;
  setIsTransactionDeleteConfirmOpen: (v: boolean) => void;
  confirmRemoveTransaction: () => void;
  isCashFlowDeleteConfirmOpen: boolean;
  cashFlowToDelete: string | null;
  cashFlows: CashFlow[];
  accounts: Account[];
  transactions: Transaction[];
  confirmRemoveCashFlow: () => void;
  cancelRemoveCashFlow: () => void;
}

const AppConfirmModals: React.FC<Props> = ({
  language,
  appText,
  isDeleteConfirmOpen,
  setIsDeleteConfirmOpen,
  confirmDeleteAllTransactions,
  pendingClearTxCount,
  isTransactionDeleteConfirmOpen,
  setIsTransactionDeleteConfirmOpen,
  confirmRemoveTransaction,
  isCashFlowDeleteConfirmOpen,
  cashFlowToDelete,
  cashFlows,
  accounts,
  transactions,
  confirmRemoveCashFlow,
  cancelRemoveCashFlow,
}) => {
  const cashFlowDeleteModal = (() => {
    if (!isCashFlowDeleteConfirmOpen || !cashFlowToDelete) return null;
    const cf = cashFlows.find(c => c.id === cashFlowToDelete);
    if (!cf) return null;
    const acc = accounts.find(a => a.id === cf.accountId);
    const rTx = transactions.filter(tx =>
      [cf.accountId, cf.targetAccountId].filter(Boolean).includes(tx.accountId)
    ).length;
    const gTN = (type: CashFlowType) =>
      ({
        [CashFlowType.DEPOSIT]: t(language).funds.deposit,
        [CashFlowType.WITHDRAW]: t(language).funds.withdraw,
        [CashFlowType.TRANSFER]: t(language).funds.transfer,
        [CashFlowType.INTEREST]: t(language).funds.interest,
        [CashFlowType.LOAN_INTEREST]: t(language).funds.loanInterest,
      })[type] ?? type;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md">
          <h3 className="text-lg font-bold text-red-600 mb-2">{appText.cashFlowDeleteTitle}</h3>
          <div className="mb-4">
            <p className="text-slate-700 mb-2">
              <span className="font-semibold">{appText.accountLabel}</span>
              {acc?.name ?? appText.unknownAccount}
            </p>
            <p className="text-slate-700 mb-2">
              <span className="font-semibold">{appText.dateLabel}</span>
              {cf.date}
            </p>
            <p className="text-slate-700 mb-2">
              <span className="font-semibold">{appText.typeLabel}</span>
              {gTN(cf.type)}
            </p>
            <p className="text-slate-700">
              <span className="font-semibold">{appText.amountLabel}</span>
              {acc?.currency === Currency.USD
                ? `$${cf.amount.toLocaleString()}`
                : `NT$${cf.amount.toLocaleString()}`}
            </p>
          </div>
          {rTx > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800 font-semibold mb-1">
                {appText.cashFlowDeleteWarningTitle}
              </p>
              <p className="text-sm text-amber-700">{appText.cashFlowDeleteWarningBody(rTx)}</p>
            </div>
          )}
          <p className="text-slate-600 mb-6">{appText.cashFlowDeleteMessage}</p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={cancelRemoveCashFlow}
              className={MODAL_CANCEL_BUTTON}
            >
              {t(language).common.cancel}
            </button>
            <button
              type="button"
              onClick={confirmRemoveCashFlow}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              {appText.confirmDeleteAction}
            </button>
          </div>
        </div>
      </div>
    );
  })();

  return (
    <>
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm">
            <h3 className="text-lg font-bold text-red-600 mb-2">{appText.confirmClearTxTitle}</h3>
            <p className="text-slate-600 mb-6">{appText.confirmClearTxMessage(pendingClearTxCount)}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(false)}
                className={MODAL_CANCEL_BUTTON}
              >
                {t(language).common.cancel}
              </button>
              <button
                type="button"
                onClick={confirmDeleteAllTransactions}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                {appText.confirmClearAction}
              </button>
            </div>
          </div>
        </div>
      )}
      {isTransactionDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-2">{appText.deleteTxTitle}</h3>
            <p className="text-slate-600 mb-6">{appText.deleteTxMessage}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsTransactionDeleteConfirmOpen(false)}
                className={MODAL_CANCEL_BUTTON}
              >
                {t(language).common.cancel}
              </button>
              <button
                type="button"
                onClick={confirmRemoveTransaction}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                {t(language).common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
      {cashFlowDeleteModal}
    </>
  );
};

export default AppConfirmModals;
