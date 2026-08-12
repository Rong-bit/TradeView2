import React, { useState } from 'react';
import { TransactionType } from '../types';
import { t, translate } from '../utils/i18n';
import { usePortfolio } from '../contexts/PortfolioContext';
import StockTimeline from './StockTimeline';
import { useUI } from '../contexts/UIContext';
import { useFilters } from '../hooks/useFilters';
import { FORM_FIELD_THEME } from '../utils/formFieldClasses';
import { noteContainsRecurringMarker, stripRecurringMarkersFromNote } from '../utils/recurringDeposits';
import { formatCashDividendPrice } from '../utils/formatDisplay';
import { recordRowClassName } from '../utils/recordHighlightClasses';

interface Props {
  onAddTransaction: () => void;
  onEditTransaction: (id: string) => void;
  onRemoveTransaction: (id: string) => void;
  onRemoveCashFlow: (id: string) => void;
  onClearAllTransactions: () => void;
  onOpenBatchUpdateMarket: () => void;
  onOpenImport: () => void;
  filteredRecords: any[];
  filteredTransactionCount: number;
  filterAccount: string;
  setFilterAccount: (v: string) => void;
  filterTicker: string;
  setFilterTicker: (v: string) => void;
  filterDateFrom: string;
  setFilterDateFrom: (v: string) => void;
  filterDateTo: string;
  setFilterDateTo: (v: string) => void;
  includeCashFlow: boolean;
  setIncludeCashFlow: (v: boolean) => void;
  clearFilters: () => void;
  formatNumber: (n: number) => string;
  formatAmount: (n: number) => string;
}

const HistoryView: React.FC<Props> = ({
  onAddTransaction,
  onEditTransaction,
  onRemoveTransaction,
  onRemoveCashFlow,
  onClearAllTransactions,
  onOpenBatchUpdateMarket,
  onOpenImport,
  filteredRecords,
  filteredTransactionCount,
  filterAccount,
  setFilterAccount,
  filterTicker,
  setFilterTicker,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  includeCashFlow,
  setIncludeCashFlow,
  clearFilters,
  formatNumber,
  formatAmount,
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'timeline'>('list');
  const { transactions, accounts, cashFlows } = usePortfolio();
  const { language, isRecordHighlighted } = useUI();
  const tr = t(language);
  const isChinese = language === 'zh-TW' || language === 'zh-CN';

  return (
    <>
      {/* Tab 切換 */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
            activeTab === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {`📋 ${tr.history.tabTransactions}`}
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
            activeTab === 'timeline' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {`📈 ${tr.history.tabTimeline}`}
        </button>
      </div>

      {activeTab === 'timeline' ? (
        <StockTimeline />
      ) : (
        <div className="space-y-6">

      {/* 操作列 */}
      <div className="app-section-card p-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-700">
            {tr.history.operations}
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onOpenBatchUpdateMarket}
              className="bg-purple-600 text-white px-3 py-1.5 rounded text-xs sm:text-sm hover:bg-purple-700 shadow-lg shadow-purple-600/20 whitespace-nowrap"
            >
              {tr.history.batchUpdateMarket}
            </button>
            <button
              onClick={onClearAllTransactions}
              disabled={filteredTransactionCount === 0}
              className="bg-red-50 text-red-600 px-3 py-1.5 rounded text-xs sm:text-sm hover:bg-red-100 border border-red-200 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-50"
            >
              {tr.history.clearAll}
            </button>
            <button
              onClick={onOpenImport}
              className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded text-xs sm:text-sm hover:bg-indigo-100 border border-indigo-200 whitespace-nowrap"
            >
              {tr.history.batchImport}
            </button>
            <button
              onClick={onAddTransaction}
              className="app-primary-btn px-4 py-2 rounded text-xs sm:text-sm whitespace-nowrap"
            >
              {tr.history.addRecord}
            </button>
          </div>
        </div>
      </div>

      {/* 篩選列 */}
      <div className="app-section-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{tr.history.filter}</h3>
          <button
            onClick={clearFilters}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            {tr.history.clearFilters}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {tr.history.accountFilter}
            </label>
            <select
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
            >
              <option value="">{tr.funds.allAccounts}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {tr.history.tickerFilter}
            </label>
            <input
              type="text"
              value={filterTicker}
              onChange={e => setFilterTicker(e.target.value)}
              placeholder={isChinese ? '例如: 0050, AAPL' : 'e.g. 0050, AAPL'}
              className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {tr.history.dateFrom}
            </label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {tr.history.dateTo}
            </label>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <label className="flex items-center cursor-pointer gap-2">
            <input
              type="checkbox"
              checked={includeCashFlow}
              onChange={e => setIncludeCashFlow(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
            />
            <span className="text-sm font-medium text-slate-700">{tr.history.includeCashFlow}</span>
            <span className="text-xs text-slate-500">{tr.history.includeCashFlowDesc}</span>
          </label>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <div className="text-sm text-slate-600">
            {translate('history.showingRecords', language, {
              count: filteredRecords.filter(r => !(r.type === 'CASHFLOW' && r.isTargetRecord)).length,
            })}
            {!includeCashFlow && cashFlows.length > 0 && (
              <span className="text-amber-600 ml-2">
                （{translate('history.hiddenCashFlowRecords', language, { count: cashFlows.length })}）
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 30);
                setFilterDateFrom(d.toISOString().split('T')[0]);
                setFilterDateTo(new Date().toISOString().split('T')[0]);
              }}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition"
            >
              {tr.history.last30Days}
            </button>
            <button
              onClick={() => {
                const y = new Date().getFullYear();
                setFilterDateFrom(`${y}-01-01`);
                setFilterDateTo(`${y}-12-31`);
              }}
              className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition"
            >
              {tr.history.thisYear}
            </button>
          </div>
        </div>
      </div>

      {/* 交易記錄表 */}
      <div className="app-section-card overflow-x-auto">
        <table className="min-w-full text-xs sm:text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100 dark:border-slate-700">
            <tr>
              <th className="px-2 sm:px-3 py-2 whitespace-nowrap">{tr.labels.date}</th>
              <th className="px-2 sm:px-3 py-2 whitespace-nowrap hidden sm:table-cell">{tr.labels.account}</th>
              <th className="px-2 sm:px-3 py-2 whitespace-nowrap">{tr.labels.description}</th>
              <th className="px-2 sm:px-3 py-2 whitespace-nowrap hidden md:table-cell">{tr.labels.category}</th>
              <th className="px-2 sm:px-3 py-2 text-right whitespace-nowrap">{tr.labels.price}</th>
              <th className="px-2 sm:px-3 py-2 text-right whitespace-nowrap">{tr.labels.quantity}</th>
              <th className="px-2 sm:px-3 py-2 text-right whitespace-nowrap">{tr.labels.fee}</th>
              <th className="px-2 sm:px-3 py-2 text-right whitespace-nowrap">{tr.labels.amount}</th>
              <th className="px-2 sm:px-3 py-2 text-right whitespace-nowrap hidden md:table-cell">{tr.labels.balance}</th>
              <th className="px-2 sm:px-3 py-2 text-center whitespace-nowrap">{tr.labels.action}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredRecords.map(record => {
              const accName = accounts.find(a => a.id === record.accountId)?.name;
              const balance = record.balance ?? 0;
              const nBal = Math.abs(balance) < 0.0001 ? 0 : balance;

              let bc = 'bg-gray-100 text-gray-700';
              let dt: string = record.subType as string;

              if (record.type === 'TRANSACTION') {
                if (record.subType === TransactionType.BUY) bc = 'bg-red-100 text-red-700';
                else if (record.subType === TransactionType.SELL) bc = 'bg-green-100 text-green-700';
                else if (record.subType === TransactionType.DIVIDEND || record.subType === TransactionType.CASH_DIVIDEND) bc = 'bg-yellow-100 text-yellow-700';
                else if (record.subType === TransactionType.TRANSFER_IN) bc = 'bg-blue-100 text-blue-700';
                else if (record.subType === TransactionType.TRANSFER_OUT) bc = 'bg-orange-100 text-orange-700';
              } else if (record.type === 'CASHFLOW') {
                if (record.subType === 'DEPOSIT') { bc = 'bg-emerald-100 text-emerald-700'; dt = tr.history.cashFlowDeposit; }
                else if (record.subType === 'WITHDRAW') { bc = 'bg-red-100 text-red-700'; dt = tr.history.cashFlowWithdraw; }
                else if (record.subType === 'TRANSFER') { bc = 'bg-purple-100 text-purple-700'; dt = tr.history.cashFlowTransfer; }
                else if (record.subType === 'TRANSFER_IN') { bc = 'bg-blue-100 text-blue-700'; dt = tr.history.cashFlowTransferIn; }
              }

              let tAN: string | null = null;
              if (record.type === 'CASHFLOW') {
                if (record.subType === 'TRANSFER' && record.targetAccountId)
                  tAN = accounts.find(a => a.id === record.targetAccountId)?.name ?? null;
                else if (record.subType === 'TRANSFER_IN' && record.sourceAccountId)
                  tAN = accounts.find(a => a.id === record.sourceAccountId)?.name ?? null;
              }

              return (
                <tr
                  key={`${record.type}-${record.id}`}
                  className={recordRowClassName(isRecordHighlighted(record.id))}
                >
                  <td className="px-2 sm:px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300 text-xs sm:text-sm">
                    {record.date}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs hidden sm:table-cell">
                    {accName}
                  </td>
                  <td className="px-2 sm:px-3 py-2 font-semibold text-slate-700 dark:text-slate-100 text-xs sm:text-sm">
                    {record.type === 'TRANSACTION' ? (
                      <div className="flex flex-col">
                        <span>
                          <span className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 mr-1">{record.market}</span>
                          {record.ticker}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 sm:hidden">{accName}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {(() => {
                          const raw = record.description ?? '';
                          const stripped = stripRecurringMarkersFromNote(raw);
                          const hasRec = noteContainsRecurringMarker(raw);
                          return (
                            <span className="text-slate-600 dark:text-slate-300">
                              {hasRec && !stripped ? (
                                <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                                  {tr.fundForm.recurringNoteBadge}
                                </span>
                              ) : (
                                <>
                                  <span>{stripped || '—'}</span>
                                  {hasRec && !!stripped && (
                                    <span className="text-indigo-500 dark:text-indigo-400 text-[10px] sm:text-xs ml-1">
                                      · {tr.fundForm.recurringNoteBadge}
                                    </span>
                                  )}
                                </>
                              )}
                            </span>
                          );
                        })()}
                        {tAN && record.subType === 'TRANSFER' && (
                          <span className="text-[10px] text-slate-400">→ {tAN}</span>
                        )}
                        {tAN && record.subType === 'TRANSFER_IN' && (
                          <span className="text-[10px] text-slate-400">← {tAN}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-2 sm:px-3 py-2 hidden md:table-cell">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${bc}`}>{dt}</span>
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300 text-xs">
                    {record.type === 'TRANSACTION'
                      ? record.subType === TransactionType.CASH_DIVIDEND
                        ? formatCashDividendPrice(record.price)
                        : formatNumber(record.price)
                      : '-'}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300 text-xs">
                    {record.type === 'TRANSACTION' ? formatNumber(record.quantity) : '-'}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300 text-xs">
                    {record.type === 'TRANSACTION' && record.fees > 0 ? formatNumber(record.fees) : '-'}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right font-bold font-mono text-slate-700 dark:text-slate-100 text-xs sm:text-sm">
                    {formatAmount(record.amount)}
                    <div className="md:hidden mt-0.5">
                      <span className={`text-[10px] font-normal ${nBal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatAmount(nBal)}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right hidden md:table-cell">
                    <div className="flex flex-col items-end">
                      <span className={`font-medium text-xs sm:text-sm ${nBal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatAmount(nBal)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {accounts.find(a => a.id === record.accountId)?.currency || 'TWD'}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right">
                    {!(record.type === 'CASHFLOW' && record.isTargetRecord) && (
                      <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 justify-end items-end sm:items-center">
                        {record.type === 'TRANSACTION' && (
                          <button
                            onClick={() => onEditTransaction(record.id)}
                            className="text-blue-400 hover:text-blue-600 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 border border-blue-100 rounded hover:bg-blue-50 whitespace-nowrap"
                          >
                            {tr.history.edit}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (record.type === 'TRANSACTION') onRemoveTransaction(record.id);
                            else onRemoveCashFlow(record.id.replace('-target', ''));
                          }}
                          className="text-red-400 hover:text-red-600 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 border border-red-100 rounded hover:bg-red-50 whitespace-nowrap"
                        >
                          {tr.history.delete}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredRecords.length === 0 && (
          <div className="p-8 text-center text-slate-400">
            <p className="text-lg font-medium text-slate-500 mb-2">
              {transactions.length === 0
                ? tr.history.noTransactions
                : tr.history.noMatchingTransactions}
            </p>
          </div>
        )}
      </div>
        </div>
      )}
    </>
  );
};

export default HistoryView;
