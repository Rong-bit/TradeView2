
import React, { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Account, CashFlow, CashFlowType } from '../types';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useMarket } from '../contexts/MarketContext';
import { FORM_FIELD_THEME, MODAL_CANCEL_BUTTON_LG } from '../utils/formFieldClasses';
import { useUI } from '../contexts/UIContext';
import { formatCurrency, valueInBaseCurrency } from '../utils/calculations';
import { languageToLocale, translate } from '../utils/i18n';

interface Props {
  onImport: (flows: CashFlow[]) => void;
  onClose: () => void;
}

/** 略過 Excel 貼上時的第一列表頭列（支援中英文等常見標題） */
function isCashFlowPasteHeaderFirstCell(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/^date$/i.test(s)) return true;
  if (/^datum$/i.test(s)) return true;
  if (/^data$/i.test(s)) return true;
  if (s.includes('日期')) return true;
  if (s === '日付' || s.startsWith('日付')) return true;
  if (s === '날짜') return true;
  if (s.includes('तारीख')) return true;
  if (s.includes('التاريخ')) return true;
  return false;
}

/**
 * 佔位範例第 2、3 列（Tab 分隔、固定 8 欄），必須與 handleParse 欄位索引一致：
 * 0 日期 | 1 台幣 | 2 美元 | 3 匯率 | 4 手續費 | 5 總計 | 6 帳戶 | 7 類別
 * 第 7 欄（類別）會寫入 note，與手動建檔的「類型」文案一致即可；是否跨境以匯率欄有無為準，勿用系統不存在的類別名。
 * — 第 2 列：valUsd>0 且 Total 為台幣成本；第 3 列：僅美金、匯率空白。
 */
const DEMO_ROW2_CROSS_BORDER =
  '2025/9/16\t1300000\t$45,410.72\t28.628\t950\t1300950\tSchwab\t匯入資金 (Import/Salary)';
const DEMO_ROW3_US_DOMESTIC =
  '2025/10/15\t\t$5,000\t\t\t$5,000\tSchwab US\tDeposit';

const BatchCashFlowModal: React.FC<Props> = ({ onImport, onClose }) => {
  const { accounts } = usePortfolio();
  const { baseCurrency, rates } = useMarket();
  const { language } = useUI();
  const isChinese = language === 'zh-TW' || language === 'zh-CN';
  const tx = (key: string, fallback: string, params?: Record<string, string | number>) => {
    const fullKey = `batchCashFlowModal.${key}`;
    const resolved = translate(fullKey, language, params);
    return resolved === fullKey ? fallback : resolved;
  };

  const pastePlaceholder = useMemo(() => {
    const loc = languageToLocale(language);
    const fmt = (v: number, ccy: string) => formatCurrency(v, ccy, loc);
    const acc = translate('batchCashFlowModal.pasteDemoRow1Account', language);
    const accTxt = acc.startsWith('batchCashFlowModal.') ? (isChinese ? '國泰' : 'Local Bank') : acc;
    const catFund = translate('fundForm.typeDeposit', language);
    const catTxt = catFund.startsWith('fundForm.')
      ? isChinese
        ? '匯入資金 (Import/Salary)'
        : 'Deposit'
      : catFund;
    // 第一列：純台幣—cols[1] 與 cols[5] 同為入金金額（與 TWD 分支 valTotal 邏輯一致）
    const row1 = `2025/12/1\t${fmt(30000, 'TWD')}\t\t\t\t${fmt(30000, 'TWD')}\t${accTxt}\t${catTxt}`;
    let out = `${row1}\n${DEMO_ROW2_CROSS_BORDER}\n${DEMO_ROW3_US_DOMESTIC}`;
    if (baseCurrency !== 'TWD') {
      const approxVal = valueInBaseCurrency(30000, baseCurrency, rates);
      const approx = fmt(approxVal, baseCurrency);
      let approxLine = translate('batchCashFlowModal.pastePlaceholderApprox', language, { approx });
      if (approxLine.startsWith('batchCashFlowModal.')) {
        approxLine = `(≈ ${approx})`;
      }
      out += `\n${approxLine}`;
    }
    return out;
  }, [language, isChinese, baseCurrency, rates]);
  const [step, setStep] = useState<1 | 2>(1); // 1: Paste & Parse, 2: Map Accounts & Preview
  const [inputText, setInputText] = useState('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [accountMapping, setAccountMapping] = useState<Record<string, string>>({});
  const [detectedAccountNames, setDetectedAccountNames] = useState<string[]>([]);
  const [failCount, setFailCount] = useState(0);
  const text = {
    title: tx('title', isChinese ? '批次匯入資金 (Batch Cash Flow)' : 'Batch Cash Flow Import'),
    guideTitle: tx('guideTitle', isChinese ? '使用說明：' : 'Instructions:'),
    guideBody: tx('guideBody', isChinese
      ? '請直接從 Excel 複製包含「日期、台幣、美元、匯率、手續費、總計、帳戶、類別」的資料並貼上。最後一欄為類別，倒數第二欄為帳戶。'
      : 'Paste tab-separated data from Excel: Date, TWD, USD, Rate, Fee, Total, Account, Category. The last column is Category; the column before it is Account.'),
    guideNoteFx: tx(
      'guideNoteFx',
      isChinese
        ? '※ 第一列：純台幣入帳—台幣與總計填金額，美元與匯率欄留空。第二列：跨境 TWD→美金 時填匯率。第三列：美國境內美金入帳（如 ACH）無需換匯，匯率欄留空。'
        : 'Note: (1) First line—TWD only: fill TWD & Total; leave USD & Rate empty. (2) Cross-border TWD→USD: fill Rate. (3) US domestic USD (e.g. ACH): no FX, leave Rate empty.'
    ),
    columnHeaderExample: tx(
      'columnHeaderExample',
      isChinese
        ? '日期 | 台幣 | 美元 | 匯率 | 手續費 | 總計 | 帳戶 | 類別'
        : 'Date | TWD | USD | Rate | Fee | Total | Account | Category'
    ),
    parseFailed: (failed: number) =>
      tx(
        'parseFailed',
        isChinese
          ? `無法解析資料。\n成功: 0 筆\n失敗: ${failed} 筆\n請確認格式是否為 Tab 分隔 (直接從 Excel 複製)。`
          : `Unable to parse data.\nSuccess: 0\nFailed: ${failed}\nPlease ensure the format is tab-separated (copy directly from Excel).`,
        { count: failed }
      ),
    unmappedAccounts: (names: string[]) =>
      tx(
        'unmappedAccounts',
        isChinese
          ? `請先設定以下帳戶的對應關係：\n${names.join(', ')}`
          : `Please map these accounts first:\n${names.join(', ')}`,
        { accounts: names.join(', ') }
      ),
    mappingTitle: tx('mappingTitle', isChinese ? '1. 帳戶名稱對應 (Account Mapping)' : '1. Account Mapping'),
    mappingDesc: tx('mappingDesc', isChinese
      ? '請將「檔案中的帳戶名稱」對應到您「系統中的證券戶」。'
      : 'Map account names from file to your existing system accounts.'),
    fileNameLabel: tx('fileNameLabel', isChinese ? '檔案名稱:' : 'File account:'),
    selectAccount: tx('selectAccount', isChinese ? '-- 請選擇對應帳戶 --' : '-- Select mapped account --'),
    previewTitle: tx('previewTitle', isChinese ? '2. 資料預覽' : '2. Data Preview'),
    successLabel: tx('successLabel', isChinese ? '成功' : 'Success'),
    failedLabel: tx('failedLabel', isChinese ? '未成功' : 'Failed'),
    failedUnit: tx('failedUnit', isChinese ? '筆' : 'rows'),
    colDate: tx('colDate', isChinese ? '日期' : 'Date'),
    colType: tx('colType', isChinese ? '類別' : 'Category'),
    colAmount: tx('colAmount', isChinese ? '金額 (USD/TWD)' : 'Amount (USD/TWD)'),
    colFee: tx('colFee', isChinese ? '手續費' : 'Fee'),
    colTwdCost: tx('colTwdCost', isChinese ? '實際台幣成本' : 'Actual TWD Cost'),
    colFileAccount: tx('colFileAccount', isChinese ? '檔案帳戶' : 'File Account'),
    colMappedAccount: tx('colMappedAccount', isChinese ? '對應系統帳戶' : 'Mapped Account'),
    unmapped: tx('unmapped', isChinese ? '未對應' : 'Unmapped'),
    cancel: tx('cancel', isChinese ? '取消' : 'Cancel'),
    parseData: tx('parseData', isChinese ? '解析資料' : 'Parse Data'),
    confirmImport: tx('confirmImport', isChinese ? '確認匯入' : 'Confirm Import'),
  };

  /** 解析貼上儲存格中的數字（支援 Intl 格式之千分位、貨幣符號） */
  const parseNumber = (str: string) => {
    if (!str) return 0;
    const normalized = str.replace(/\u00a0/g, '').replace(/,/g, '').trim();
    const hasMinus = normalized.includes('-');
    const numPart = normalized.replace(/[^0-9.]/g, '');
    const v = parseFloat(numPart);
    if (!Number.isFinite(v)) return 0;
    return hasMinus ? -Math.abs(v) : v;
  };

  const parseDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
      return date.toISOString().split('T')[0];
    } catch (e) {
      return new Date().toISOString().split('T')[0];
    }
  };

  const handleParse = () => {
    const lines = inputText.split('\n');
    const rows: any[] = [];
    const foundAccounts = new Set<string>();
    let currentFailures = 0;

    lines.forEach(line => {
      if (!line.trim()) return;
      
      // Use single tab split to preserve empty columns (critical for fixed structure)
      // Format: Date | TWD | USD | Rate | Fee | Total | Account | Category
      // Index:   0   |  1  |  2  |  3   |  4  |   5   |    6    |    7
      const cols = line.replace(/\r/g, '').split('\t');
      
      // Skip header row or malformed lines
      if (cols.length < 3 || isCashFlowPasteHeaderFirstCell(cols[0])) return;

      const dateStr = cols[0];
      
      // Account is at index 6 based on your data
      const accountName = cols[6] ? cols[6].trim() : ''; 
      // Category is at index 7 based on your data
      const categoryStr = cols[7] ? cols[7].trim() : '';

      const rawTwd = cols[1];
      const rawUsd = cols[2];
      const rawFee = cols[4];
      const rawTotal = cols[5];
      
      let amount = 0;
      let amountTWD = 0; // Store exact TWD amount if available
      let isUSD = false;
      
      const valUsd = Math.abs(parseNumber(rawUsd));
      const valTwd = Math.abs(parseNumber(rawTwd));
      const valFee = Math.abs(parseNumber(rawFee));
      const valTotal = Math.abs(parseNumber(rawTotal));

      if (valUsd > 0) {
        // It's a USD transaction
        amount = valUsd;
        isUSD = true;
        
        // Strategy for amountTWD (Cost Basis in TWD):
        // 1. If 'Total' column exists and is large (likely TWD), use it. It usually includes fees.
        // 2. Else if 'TWD' column exists, use it + Fee.
        
        if (valTotal > 0 && Math.abs(valTotal - valUsd) > valUsd) { 
            // Heuristic: If Total is significantly different from USD amount, it's likely the TWD total
            amountTWD = valTotal;
        } else if (valTwd > 0) {
            // If explicit Total missing, sum TWD principal + Fee
            amountTWD = valTwd + valFee;
        }
      } else {
        // It's a TWD transaction
        // Use Total if available (as it includes fee), otherwise TWD val + fee
        if (valTotal > 0) {
           amount = valTotal;
        } else {
           amount = valTwd + valFee;
        }
      }
      
      // Fallback
      if (amount === 0 && valTotal > 0) {
         amount = valTotal;
      }

      // Determine Type
      let type = CashFlowType.DEPOSIT;
      if (categoryStr.includes('轉出') || categoryStr.includes('匯出')) type = CashFlowType.WITHDRAW;
      else if (categoryStr.includes('轉入') || categoryStr.includes('匯入')) type = CashFlowType.DEPOSIT;
      else if (categoryStr.includes('利息')) type = CashFlowType.INTEREST;
      else if (categoryStr.includes('轉帳')) type = CashFlowType.TRANSFER;
      
      // Extract Exchange Rate (Col 3)
      const exRate = parseNumber(cols[3]);
      
      let note = categoryStr;

      if (dateStr && (amount >= 0 || valFee >= 0) && accountName) {
        rows.push({
          tempId: uuidv4(),
          date: parseDate(dateStr),
          amount,
          amountTWD: amountTWD > 0 ? amountTWD : undefined, 
          originalAccountName: accountName.trim(),
          type,
          isUSD,
          exchangeRate: exRate > 0 ? exRate : undefined,
          note: note,
          fee: valFee > 0 ? valFee : undefined
        });
        foundAccounts.add(accountName.trim());
      } else {
        currentFailures++;
      }
    });

    setFailCount(currentFailures);

    if (rows.length > 0) {
      setDetectedAccountNames(Array.from(foundAccounts));
      
      // Auto-map if names match exactly
      const initialMapping: Record<string, string> = {};
      foundAccounts.forEach(name => {
        const match = accounts.find(a => a.name === name || a.name.includes(name));
        if (match) initialMapping[name] = match.id;
        else initialMapping[name] = ''; // Pending
      });
      setAccountMapping(initialMapping);
      setParsedRows(rows);
      setStep(2);
    } else {
      alert(text.parseFailed(currentFailures));
    }
  };

  const handleImportConfirm = () => {
    // Validation: All accounts must be mapped
    const unmapped = detectedAccountNames.filter(name => !accountMapping[name]);
    if (unmapped.length > 0) {
      alert(text.unmappedAccounts(unmapped));
      return;
    }

    const finalFlows: CashFlow[] = parsedRows.map(row => ({
      id: uuidv4(),
      date: row.date,
      type: row.type,
      amount: row.amount,
      amountTWD: row.amountTWD, // Include in final object
      fee: row.fee, // Include fee
      accountId: accountMapping[row.originalAccountName],
      exchangeRate: row.exchangeRate,
      note: row.note
    }));

    onImport(finalFlows);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        <div className="bg-slate-900 p-4 flex justify-between items-center shrink-0">
          <h2 className="text-white font-bold text-lg">{text.title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 border border-blue-200">
                <p className="font-bold mb-1">{text.guideTitle}</p>
                <p>{text.guideBody}</p>
                <p className="mt-2 text-xs text-blue-900/90 leading-relaxed">{text.guideNoteFx}</p>
                <p className="mt-1 text-xs opacity-75 font-mono bg-blue-100 p-1 rounded inline-block">
                  {text.columnHeaderExample}
                </p>
              </div>
              <textarea 
                className="w-full h-96 border border-slate-300 rounded-lg p-4 font-mono text-base sm:text-xs focus:ring-2 focus:ring-accent outline-none whitespace-pre overflow-auto"
                placeholder={pastePlaceholder}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {/* Account Mapping Section */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-3 text-sm">{text.mappingTitle}</h3>
                <p className="text-xs text-slate-500 mb-4">{text.mappingDesc}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {detectedAccountNames.map(name => (
                    <div key={name} className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500">{text.fileNameLabel} <span className="text-slate-800">{name}</span></label>
                      <select 
                        className={`text-base sm:text-sm border rounded p-2 ${FORM_FIELD_THEME} ${!accountMapping[name] ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-slate-300'}`}
                        value={accountMapping[name] || ''}
                        onChange={e => setAccountMapping(prev => ({...prev, [name]: e.target.value}))}
                      >
                        <option value="">{text.selectAccount}</option>
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview Table */}
              <div>
                <h3 className="font-bold text-slate-800 mb-3 text-sm flex items-center">
                  <span>
                    {text.previewTitle}
                    <span className="ml-2 font-normal text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                      {text.successLabel}: <span className="text-green-600 font-bold">{parsedRows.length}</span>
                    </span>
                    {failCount > 0 && (
                        <span className="ml-2 font-normal text-xs bg-red-50 px-2 py-0.5 rounded text-red-600 border border-red-100">
                            {text.failedLabel}: <strong>{failCount}</strong> {text.failedUnit}
                        </span>
                    )}
                  </span>
                </h3>
                <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                  <table className="min-w-full text-xs sm:text-sm text-left">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="px-3 py-2">{text.colDate}</th>
                        <th className="px-3 py-2">{text.colType}</th>
                        <th className="px-3 py-2 text-right">{text.colAmount}</th>
                        <th className="px-3 py-2 text-right">{text.colFee}</th>
                        <th className="px-3 py-2 text-right">{text.colTwdCost}</th>
                        <th className="px-3 py-2">{text.colFileAccount}</th>
                        <th className="px-3 py-2">{text.colMappedAccount}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold 
                              ${row.type === CashFlowType.DEPOSIT || row.type === CashFlowType.INTEREST ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {row.note.split(' ')[0]} {/* Show original category name */}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.isUSD ? '$' : 'NT$'}{row.amount.toLocaleString()}
                            {row.exchangeRate && <span className="block text-[10px] text-slate-400">Ex: {row.exchangeRate}</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-500">
                             {row.fee ? row.fee : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-700 font-bold">
                            {row.amountTWD ? `NT$${row.amountTWD.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{row.originalAccountName}</td>
                          <td className="px-3 py-2 font-medium text-slate-700">
                            {accounts.find(a => a.id === accountMapping[row.originalAccountName])?.name || <span className="text-red-500">{text.unmapped}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className={MODAL_CANCEL_BUTTON_LG}>{text.cancel}</button>
          {step === 1 ? (
            <button onClick={handleParse} disabled={!inputText.trim()} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shadow-lg">{text.parseData}</button>
          ) : (
            <button onClick={handleImportConfirm} className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition shadow-lg">{text.confirmImport}</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchCashFlowModal;
