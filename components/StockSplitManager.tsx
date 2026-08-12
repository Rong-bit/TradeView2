import React, { useState, useMemo } from 'react';
import { Market, StockSplitEvent } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../utils/i18n';
import { FORM_FIELD_THEME, MODAL_CANCEL_BUTTON, INPUT_MODE_NUMERIC } from '../utils/formFieldClasses';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useUI } from '../contexts/UIContext';
import {
  normalizeTicker,
  computeSplitRatio,
  isDuplicateSplit,
} from '../utils/stockSplitHelpers';

const MARKET_OPTIONS: Market[] = [
  Market.TW, Market.US, Market.UK, Market.JP, Market.CN, Market.SZ,
  Market.IN, Market.CA, Market.FR, Market.HK, Market.KR, Market.DE,
  Market.AU, Market.SA, Market.BR,
];

const StockSplitManager: React.FC = () => {
  const { stockSplits, addStockSplit, removeStockSplit } = usePortfolio();
  const { language, showAlert } = useUI();
  const translations = t(language);
  const ss = translations.stockSplit;

  const [ticker, setTicker] = useState('');
  const [market, setMarket] = useState<Market>(Market.TW);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [sharesFrom, setSharesFrom] = useState('1');
  const [sharesTo, setSharesTo] = useState('2');
  const [note, setNote] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StockSplitEvent | null>(null);

  const fromNum = parseInt(sharesFrom, 10);
  const toNum = parseInt(sharesTo, 10);
  const ratio = computeSplitRatio(fromNum, toNum);

  const sortedSplits = useMemo(
    () =>
      [...stockSplits].sort(
        (a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()
      ),
    [stockSplits]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const norm = normalizeTicker(ticker);
    if (!norm) {
      showAlert(ss.tickerRequired, ss.title, 'error');
      return;
    }
    if (!effectiveDate) {
      showAlert(ss.dateRequired, ss.title, 'error');
      return;
    }
    if (ratio == null) {
      showAlert(ss.invalidRatio, ss.title, 'error');
      return;
    }
    if (isDuplicateSplit(stockSplits, market, norm, effectiveDate)) {
      showAlert(ss.duplicateError, ss.title, 'error');
      return;
    }

    addStockSplit({
      id: uuidv4(),
      ticker: norm,
      market,
      effectiveDate,
      sharesFrom: fromNum,
      sharesTo: toNum,
      ratio,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    });

    showAlert(ss.addSuccess, ss.title, 'success');
    setTicker('');
    setNote('');
    setSharesFrom('1');
    setSharesTo('2');
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      removeStockSplit(deleteTarget.id);
      showAlert(ss.deleteSuccess, ss.title, 'success');
      setDeleteTarget(null);
    }
  };

  const ratioDisplay =
    ratio != null
      ? `${fromNum} -> ${toNum} (ratio = ${ratio.toFixed(4)})`
      : '—';

  return (
    <div className="space-y-6">
      <div className="app-section-card p-6">
        <h3 className="font-bold text-lg mb-4">{ss.title}</h3>
        <p className="text-sm text-slate-500 mb-4">{ss.hint}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">{ss.ticker}</label>
              <input
                type="text"
                required
                value={ticker}
                onChange={e => setTicker(e.target.value)}
                className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                placeholder={ss.tickerPlaceholder}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">{ss.market}</label>
              <select
                value={market}
                onChange={e => setMarket(e.target.value as Market)}
                className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
              >
                {MARKET_OPTIONS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">{ss.effectiveDate}</label>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={e => setEffectiveDate(e.target.value)}
                className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">{ss.sharesFrom}</label>
              <input
                type="number"
                inputMode={INPUT_MODE_NUMERIC}
                min={1}
                step={1}
                required
                value={sharesFrom}
                onChange={e => setSharesFrom(e.target.value)}
                className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">{ss.sharesTo}</label>
              <input
                type="number"
                inputMode={INPUT_MODE_NUMERIC}
                min={1}
                step={1}
                required
                value={sharesTo}
                onChange={e => setSharesTo(e.target.value)}
                className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">{ss.splitRatio}</label>
              <div className={`mt-1 block w-full border border-slate-200 rounded-md p-2 bg-slate-50 text-slate-700 font-mono text-sm`}>
                {ratioDisplay}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">{ss.note}</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              className={`mt-1 block w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
              placeholder={ss.notePlaceholder}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 app-primary-btn rounded-md transition"
            >
              {ss.addButton}
            </button>
          </div>
        </form>
      </div>

      <div className="app-section-card p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">{ss.listTitle}</h3>
          <span className="text-sm text-slate-500">
            {ss.totalCount.replace('{count}', String(sortedSplits.length))}
          </span>
        </div>
        {sortedSplits.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
            {ss.emptyList}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2 pr-4">{ss.ticker}</th>
                  <th className="py-2 pr-4">{ss.market}</th>
                  <th className="py-2 pr-4">{ss.effectiveDate}</th>
                  <th className="py-2 pr-4">{ss.splitRatio}</th>
                  <th className="py-2 pr-4">{ss.note}</th>
                  <th className="py-2 text-right">{translations.common.delete}</th>
                </tr>
              </thead>
              <tbody>
                {sortedSplits.map(s => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 pr-4 font-mono font-medium">{s.ticker}</td>
                    <td className="py-3 pr-4">{s.market}</td>
                    <td className="py-3 pr-4">{s.effectiveDate}</td>
                    <td className="py-3 pr-4 font-mono">
                      {s.sharesFrom} → {s.sharesTo} ({s.ratio.toFixed(4)})
                    </td>
                    <td className="py-3 pr-4 text-slate-500 max-w-[200px] truncate">{s.note || '—'}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(s)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        {translations.common.delete}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-red-600 mb-2">{ss.deleteConfirmTitle}</h3>
            <p className="text-slate-600 mb-6">
              {ss.deleteConfirmMessage
                .replace('{ticker}', deleteTarget.ticker)
                .replace('{date}', deleteTarget.effectiveDate)}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className={MODAL_CANCEL_BUTTON}
              >
                {translations.common.cancel}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                {translations.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockSplitManager;
