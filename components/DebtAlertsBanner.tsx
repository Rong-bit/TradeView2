import React from 'react';
import { DebtPaymentAlert, DebtSpreadAlert } from '../utils/scheduledAlerts';
import { formatCurrency, valueInBaseCurrency } from '../utils/calculations';
import { BaseCurrency } from '../types';
import { ExchangeRates } from '../utils/calculations';
import { translate } from '../utils/i18n';
import type { Language } from '../utils/i18n';

interface Props {
  paymentAlerts: DebtPaymentAlert[];
  spreadAlerts: DebtSpreadAlert[];
  hasDebtFunding: boolean;
  leverageNetTWD: number;
  language: Language;
  baseCurrency: BaseCurrency;
  rates: ExchangeRates;
  onAcknowledgePayment: (ruleId: string) => void;
  onDismissSession: () => void;
}

const DebtAlertsBanner: React.FC<Props> = ({
  paymentAlerts,
  spreadAlerts,
  hasDebtFunding,
  leverageNetTWD,
  language,
  baseCurrency,
  rates,
  onAcknowledgePayment,
  onDismissSession,
}) => {
  const tr = (key: string, params?: Record<string, string | number>) =>
    translate(`debt.${key}`, language, params);

  const showLeverageNote = hasDebtFunding && leverageNetTWD > 0;
  if (paymentAlerts.length === 0 && spreadAlerts.length === 0 && !showLeverageNote) return null;

  const toBase = (v: number) => valueInBaseCurrency(v, baseCurrency, rates);

  return (
    <div className="space-y-2 mb-4">
      {paymentAlerts.map(a => (
        <div
          key={a.ruleId}
          className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
        >
          <p className="font-semibold">{tr('paymentAlertTitle')}</p>
          <p className="mt-1">
            {tr('paymentAlertBody', {
              name: a.accountName,
              days: a.daysUntilDue,
              date: a.dueDate,
              amount: a.amount != null ? formatCurrency(a.amount, 'TWD') : '—',
            })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAcknowledgePayment(a.ruleId)}
              className="px-3 py-1 rounded bg-amber-700 text-white text-sm hover:bg-amber-800"
            >
              {tr('acknowledgePaid')}
            </button>
            <button
              type="button"
              onClick={onDismissSession}
              className="px-3 py-1 rounded border border-amber-400 text-amber-800 dark:text-amber-200 text-sm"
            >
              {tr('remindLater')}
            </button>
          </div>
        </div>
      ))}

      {spreadAlerts.map(a => (
        <div
          key={a.accountId}
          className={`rounded-lg border px-4 py-3 text-sm ${
            a.level === 'danger'
              ? 'border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:border-red-700 dark:text-red-100'
              : 'border-yellow-300 bg-yellow-50 text-yellow-900 dark:bg-yellow-950/40 dark:border-yellow-700 dark:text-yellow-100'
          }`}
        >
          <p className="font-semibold">
            {a.level === 'danger' ? tr('spreadDangerTitle') : tr('spreadWarningTitle')}
          </p>
          <p className="mt-1">
            {tr('spreadBody', {
              name: a.accountName,
              ret: a.returnRate.toFixed(2),
              rate: a.loanRate.toFixed(2),
            })}
          </p>
          <p className="mt-1 text-xs opacity-80">{tr('notAdvice')}</p>
        </div>
      ))}

      {showLeverageNote && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-slate-800 dark:border-amber-800 px-4 py-2 text-xs text-amber-900 dark:text-amber-100">
          {tr('leverageNetNote', {
            amount: formatCurrency(toBase(leverageNetTWD), baseCurrency),
          })}
        </div>
      )}
    </div>
  );
};

export default DebtAlertsBanner;
