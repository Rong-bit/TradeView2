import React, { useState, useMemo } from 'react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useUI } from '../contexts/UIContext';
import { Transaction, Market } from '../types';
import { FORM_FIELD_THEME, MODAL_CANCEL_BUTTON_LG } from '../utils/formFieldClasses';
import { t } from '../utils/i18n';

interface Props {
  onUpdate: (updates: { id: string; market: Market }[]) => void;
  onClose: () => void;
}

const BatchUpdateMarketModal: React.FC<Props> = ({ onUpdate, onClose }) => {
  const { transactions } = usePortfolio();
  const { language } = useUI();
  const isChinese = language === 'zh-TW' || language === 'zh-CN';
  const tr = t(language);
  const tf = tr.transactionForm;
  const [ticker, setTicker] = useState('');
  const [newMarket, setNewMarket] = useState<Market>(Market.US);

  const text = {
    title: isChinese ? '批量修改市場' : 'Batch Update Market',
    tickerLabel: isChinese ? '股票代號' : 'Ticker Symbol',
    tickerPlaceholder: isChinese ? '例如：VWRA' : 'e.g. VWRA',
    marketLabel: isChinese ? '新的市場設置' : 'New Market',
    foundRecords: (count: number) =>
      language === 'zh-TW'
        ? `找到 ${count} 筆交易紀錄`
        : language === 'zh-CN'
          ? `找到 ${count} 笔交易记录`
          : `Found ${count} matching transactions`,
    updateTargetPrefix: isChinese ? '將把這些記錄的市場設置更新為：' : 'These records will be updated to market:',
    noMatchesAlert:
      language === 'zh-TW'
        ? '找不到匹配的交易紀錄，請確認股票代號是否正確。'
        : language === 'zh-CN'
          ? '找不到匹配的交易记录，请确认股票代号是否正确。'
          : 'No matching transactions found. Please verify the ticker symbol.',
    confirmUpdate: isChinese ? '確認修改' : 'Confirm Update',
  };

  const marketLabelMap: Record<Market, string> = {
    [Market.US]: tf.marketUS,
    [Market.TW]: tf.marketTW,
    [Market.UK]: tf.marketUK,
    [Market.JP]: tf.marketJP,
    [Market.CN]: tf.marketCN,
    [Market.SZ]: tf.marketSZ,
    [Market.IN]: tf.marketIN,
    [Market.CA]: tf.marketCA,
    [Market.FR]: tf.marketFR,
    [Market.HK]: tf.marketHK,
    [Market.KR]: tf.marketKR,
    [Market.DE]: tf.marketDE,
    [Market.AU]: tf.marketAU,
    [Market.SA]: tf.marketSA,
    [Market.BR]: tf.marketBR,
  };

  // 根據輸入的股票代號找到匹配的交易記錄
  const matchingTransactions = useMemo(() => {
    if (!ticker.trim()) return [];
    const upperTicker = ticker.trim().toUpperCase();
    return transactions.filter((tx: Transaction) => tx.ticker.toUpperCase() === upperTicker);
  }, [ticker, transactions]);

  const handleConfirm = () => {
    if (matchingTransactions.length === 0) {
      alert(text.noMatchesAlert);
      return;
    }

    const updates = matchingTransactions.map((tx: Transaction) => ({
      id: tx.id,
      market: newMarket
    }));

    onUpdate(updates);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="bg-purple-600 p-4 flex justify-between items-center rounded-t-xl">
          <h2 className="text-white font-bold text-lg">{text.title}</h2>
          <button onClick={onClose} className="text-purple-200 hover:text-white text-2xl">&times;</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* 股票代號輸入 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              {text.tickerLabel}
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder={text.tickerPlaceholder}
              className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
            />
          </div>

          {/* 市場選擇 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              {text.marketLabel}
            </label>
            <select
              value={newMarket}
              onChange={(e) => setNewMarket(e.target.value as Market)}
              className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base sm:text-sm ${FORM_FIELD_THEME}`}
            >
              <option value={Market.US}>{tf.marketUS}</option>
              <option value={Market.TW}>{tf.marketTW}</option>
              <option value={Market.UK}>{tf.marketUK}</option>
              <option value={Market.JP}>{tf.marketJP}</option>
              <option value={Market.CN}>{tf.marketCN}</option>
              <option value={Market.SZ}>{tf.marketSZ}</option>
              <option value={Market.IN}>{tf.marketIN}</option>
              <option value={Market.CA}>{tf.marketCA}</option>
              <option value={Market.FR}>{tf.marketFR}</option>
              <option value={Market.HK}>{tf.marketHK}</option>
              <option value={Market.KR}>{tf.marketKR}</option>
              <option value={Market.DE}>{tf.marketDE}</option>
              <option value={Market.AU}>{tf.marketAU}</option>
              <option value={Market.SA}>{tf.marketSA}</option>
              <option value={Market.BR}>{tf.marketBR}</option>
            </select>
          </div>

          {/* 顯示找到的交易記錄數量 */}
          {ticker.trim() && (
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-sm text-slate-700">
                <span className="font-bold text-purple-600">
                  {text.foundRecords(matchingTransactions.length)}
                </span>
                {matchingTransactions.length > 0 && (
                  <span className="block mt-2 text-xs text-slate-500">
                    {text.updateTargetPrefix}<strong>{marketLabelMap[newMarket] ?? tf.marketUS}</strong>
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            className={MODAL_CANCEL_BUTTON_LG}
          >
            {tr.common.cancel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={matchingTransactions.length === 0}
            className={`px-6 py-2 rounded-lg transition shadow-lg text-white ${
              matchingTransactions.length > 0
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-slate-400 cursor-not-allowed'
            }`}
          >
            {text.confirmUpdate}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchUpdateMarketModal;

