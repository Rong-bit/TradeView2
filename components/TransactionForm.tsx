
import React, { useState, useEffect } from 'react';
import { Market, Transaction, TransactionType, Holding, Account } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../utils/i18n';
import { FORM_FIELD_THEME, INPUT_MODE_DECIMAL } from '../utils/formFieldClasses';
import { parseCashDividendNoteBreakdown } from '../utils/cashDividendNoteParse';
import {
  twEstimatedSingleDividendTwd,
  usCashDividendCentBreakdown,
  formatUsDividendNativeAmount,
  getAccountUsDividendWithholdingRate,
} from '../utils/dividendTaxHelpers';
import { computeTransactionAmount } from '../utils/transactionAmount';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useUI } from '../contexts/UIContext';
interface Props {
  onAdd: (tx: Transaction) => void;
  onUpdate: (tx: Transaction) => void;
  onClose: () => void;
  editingTransaction: Transaction | null;
}

/** 現金股息：價格欄為股息總額、數量固定 1；美股為依帳戶預扣後金額，台股為毛額；舊資料若 quantity≠1 則併入 price */
function cashDividendFormFromTransaction(tx: Transaction): {
  price: string;
  quantity: string;
  fees: string;
} {
  const fees = tx.fees || 0;
  if (tx.quantity === 1) {
    const breakdown = parseCashDividendNoteBreakdown(tx.note);
    if (breakdown) {
      if (tx.market === Market.US) {
        return {
          price: formatUsDividendNativeAmount(tx.price),
          quantity: '1',
          fees: tx.fees.toString(),
        };
      }
      if (tx.market === Market.TW) {
        const gross = twEstimatedSingleDividendTwd(breakdown.shares, breakdown.perShare);
        return {
          price: String(gross),
          quantity: '1',
          fees: tx.fees.toString(),
        };
      }
    }
    if (tx.market === Market.US) {
      return {
        price: formatUsDividendNativeAmount(tx.price),
        quantity: '1',
        fees: tx.fees.toString(),
      };
    }
    const grossTwd =
      tx.withheldNhiTwd != null && tx.withheldNhiTwd > 0 ? tx.price + tx.withheldNhiTwd : tx.price;
    return {
      price: grossTwd.toString(),
      quantity: '1',
      fees: tx.fees.toString(),
    };
  }
  const grossPrice =
    tx.amount != null && tx.amount > 0 ? tx.amount + fees : tx.price * tx.quantity;
  return {
    price: grossPrice.toString(),
    quantity: '1',
    fees: tx.fees.toString(),
  };
}

const TransactionForm: React.FC<Props> = ({ onAdd, onUpdate, onClose, editingTransaction }) => {
  const { accounts, holdings } = usePortfolio();
  const { language } = useUI();
  const isEditing = !!editingTransaction;
  const translations = t(language);
  const tf = translations.transactionForm;
  const isChinese = language === 'zh-TW' || language === 'zh-CN';
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    ticker: '',
    market: Market.TW,
    type: TransactionType.BUY,
    price: '',
    quantity: '',
    fees: '0',
    accountId: accounts[0]?.id || '',
    note: '',
  });

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [transferValidationMessage, setTransferValidationMessage] = useState<string | null>(null);
  const [pendingTransaction, setPendingTransaction] = useState<Transaction | null>(null);
  const [pendingTransferInTransaction, setPendingTransferInTransaction] = useState<Transaction | null>(null);
  const [targetAccountId, setTargetAccountId] = useState('');
  const selectedUsWithholdingRate = getAccountUsDividendWithholdingRate(
    accounts.find(account => account.id === formData.accountId)
  );
  const isTransferOutMode = formData.type === TransactionType.TRANSFER_OUT;
  const transactionTypeOptions: TransactionType[] = [
    TransactionType.BUY,
    TransactionType.SELL,
    TransactionType.DIVIDEND,
    TransactionType.CASH_DIVIDEND,
    TransactionType.TRANSFER_OUT,
  ];
  const canShowTransferInOption = isEditing && formData.type === TransactionType.TRANSFER_IN;
  if (canShowTransferInOption) {
    transactionTypeOptions.splice(4, 0, TransactionType.TRANSFER_IN);
  }

  // 當進入編輯模式時，載入現有交易資料
  useEffect(() => {
    if (editingTransaction) {
      const cashDivFields =
        editingTransaction.type === TransactionType.CASH_DIVIDEND
          ? cashDividendFormFromTransaction(editingTransaction)
          : null;
      setFormData({
        date: editingTransaction.date,
        ticker: editingTransaction.ticker,
        market: editingTransaction.market,
        type: editingTransaction.type,
        price: cashDivFields?.price ?? editingTransaction.price.toString(),
        quantity: cashDivFields?.quantity ?? editingTransaction.quantity.toString(),
        fees: cashDivFields?.fees ?? editingTransaction.fees.toString(),
        accountId: editingTransaction.accountId,
        note: editingTransaction.note || '',
      });
      setTargetAccountId('');
    } else {
      // 重置為預設值
      setFormData({
        date: new Date().toISOString().split('T')[0],
        ticker: '',
        market: Market.TW,
        type: TransactionType.BUY,
        price: '',
        quantity: '',
        fees: '0',
        accountId: accounts[0]?.id || '',
        note: '',
      });
      setTargetAccountId('');
    }
  }, [editingTransaction, accounts]);

  useEffect(() => {
    if (!isTransferOutMode) {
      setTargetAccountId('');
    }
  }, [isTransferOutMode]);

  // 當交易類型變更為現金股息時，自動將數量設為 1
  useEffect(() => {
    if (formData.type === TransactionType.CASH_DIVIDEND && formData.quantity !== '1' && !editingTransaction) {
      setFormData(prev => ({ ...prev, quantity: '1' }));
    }
  }, [formData.type, editingTransaction]);

  // 美股現金股息：備註含每股×股數時，新增交易依帳戶預扣設定同步試算（編輯時保留已存資料）
  useEffect(() => {
    if (editingTransaction) return;
    if (formData.type !== TransactionType.CASH_DIVIDEND || formData.market !== Market.US) return;
    const breakdown = parseCashDividendNoteBreakdown(formData.note);
    if (!breakdown) return;
    const calc = usCashDividendCentBreakdown(
      breakdown.shares,
      breakdown.perShare,
      undefined,
      selectedUsWithholdingRate
    );
    const nextPrice = formatUsDividendNativeAmount(calc.netNative);
    if (formData.price !== nextPrice) {
      setFormData(prev => ({ ...prev, price: nextPrice }));
    }
  }, [
    editingTransaction,
    formData.type,
    formData.market,
    formData.note,
    selectedUsWithholdingRate,
  ]);

  // 當選擇轉入/轉出且關鍵欄位變更時，重新填入平均成本（查無則清空）
  useEffect(() => {
    const isTransferType =
      formData.type === TransactionType.TRANSFER_IN ||
      formData.type === TransactionType.TRANSFER_OUT;
    if (!isTransferType || editingTransaction) return;

    if (!formData.ticker || !formData.accountId || !formData.market) {
      if (formData.price !== '') {
        setFormData(prev => ({ ...prev, price: '' }));
      }
      return;
    }

    const avgCost = findAvgCostFromHoldings(
      formData.accountId,
      formData.ticker,
      formData.market
    );
    const nextPrice = avgCost !== null ? avgCost.toFixed(2) : '';
    if (formData.price !== nextPrice) {
      setFormData(prev => ({ ...prev, price: nextPrice }));
    }
  }, [formData.type, formData.ticker, formData.accountId, formData.market, editingTransaction, holdings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.accountId) return alert(tf.errorNoAccount);
    const shouldCreateTransferPair = !isEditing && formData.type === TransactionType.TRANSFER_OUT;
    if (shouldCreateTransferPair && !targetAccountId) return alert(tf.errorNoTargetAccount);
    if (shouldCreateTransferPair && targetAccountId === formData.accountId) return alert(tf.errorSameTransferAccount);

    let price = parseFloat(formData.price);
    // 現金股息時，數量固定為 1
    const quantity = formData.type === TransactionType.CASH_DIVIDEND ? 1 : parseFloat(formData.quantity);
    let fees = parseFloat(formData.fees) || 0;
    const noteBreakdown = parseCashDividendNoteBreakdown(formData.note);
    let withheldUsTaxNative: number | undefined;
    let withheldNhiTwd: number | undefined;

    let finalAmount: number;

    if (formData.type === TransactionType.CASH_DIVIDEND && noteBreakdown) {
      if (formData.market === Market.US) {
        const formula = usCashDividendCentBreakdown(
          noteBreakdown.shares,
          noteBreakdown.perShare,
          undefined,
          selectedUsWithholdingRate
        );
        const taxNative =
          isEditing &&
          editingTransaction?.withheldUsTaxNative != null &&
          editingTransaction.withheldUsTaxNative > 0
            ? editingTransaction.withheldUsTaxNative
            : formula.taxNative;
        const autoNet = Math.round((formula.grossNative - taxNative) * 100) / 100;
        const userPrice = parseFloat(formData.price);
        const priceAdjustFee =
          Number.isFinite(userPrice) && userPrice < autoNet
            ? Math.max(0, Math.round((autoNet - userPrice) * 100) / 100)
            : 0;
        fees = Math.round((fees + priceAdjustFee) * 100) / 100;
        if (taxNative > 0) {
          withheldUsTaxNative = taxNative;
        } else {
          withheldUsTaxNative = undefined;
        }
        price = autoNet;
        finalAmount = Math.round((autoNet - fees) * 100) / 100;
      } else if (formData.market === Market.TW) {
        const grossNative = twEstimatedSingleDividendTwd(
          noteBreakdown.shares,
          noteBreakdown.perShare
        );
        const nhi =
          isEditing &&
          editingTransaction?.withheldNhiTwd != null &&
          editingTransaction.withheldNhiTwd > 0
            ? editingTransaction.withheldNhiTwd
            : 0;
        if (nhi > 0) {
          withheldNhiTwd = nhi;
          price = grossNative - nhi;
        } else {
          withheldNhiTwd = undefined;
          price = grossNative;
        }
        finalAmount = grossNative - nhi - fees;
      } else {
        finalAmount = computeTransactionAmount(
          formData.type,
          formData.market,
          price,
          quantity,
          fees
        );
      }
    } else if (formData.type === TransactionType.CASH_DIVIDEND && formData.market === Market.US) {
      price = parseFloat(formData.price);
      finalAmount = Math.round((price - fees) * 100) / 100;
      if (
        isEditing &&
        editingTransaction?.withheldUsTaxNative != null &&
        editingTransaction.withheldUsTaxNative > 0
      ) {
        withheldUsTaxNative = editingTransaction.withheldUsTaxNative;
      }
    } else {
      finalAmount = computeTransactionAmount(
        formData.type,
        formData.market,
        price,
        quantity,
        fees
      );
    }

    if (!isEditing && formData.type === TransactionType.TRANSFER_OUT) {
      const availableQuantity = getAvailableHoldingQuantity(
        formData.accountId,
        formData.ticker,
        formData.market
      );
      if (!Number.isNaN(quantity) && quantity > availableQuantity) {
        setTransferValidationMessage(
          `${tf.errorInsufficientTransferOutQuantity}（${formatDisplayQuantity(availableQuantity)} ${tf.shares}）`
        );
        return;
      }
    }

    const newTx: Transaction = {
      id: isEditing && editingTransaction ? editingTransaction.id : uuidv4(),
      date: formData.date,
      ticker: formData.ticker.toUpperCase(),
      market: formData.market,
      type: formData.type,
      price: price,
      quantity: quantity,
      fees: fees,
      accountId: formData.accountId,
      note: formData.note,
      amount: finalAmount // 儲存計算後的總金額
    };

    if (withheldUsTaxNative != null && withheldUsTaxNative > 0) {
      newTx.withheldUsTaxNative = withheldUsTaxNative;
    }
    if (withheldNhiTwd != null && withheldNhiTwd > 0) {
      newTx.withheldNhiTwd = withheldNhiTwd;
    }

    if (shouldCreateTransferPair) {
      // 與匯出持股同一套台股無條件捨去規則，避免金額差小數點
      const transferInAmount = computeTransactionAmount(
        TransactionType.TRANSFER_IN,
        formData.market,
        price,
        quantity,
        0
      );
      const transferInTx: Transaction = {
        id: uuidv4(),
        date: formData.date,
        ticker: formData.ticker.toUpperCase(),
        market: formData.market,
        type: TransactionType.TRANSFER_IN,
        price: price,
        quantity: quantity,
        fees: 0,
        accountId: targetAccountId,
        note: formData.note,
        amount: transferInAmount
      };
      setPendingTransferInTransaction(transferInTx);
    } else {
      setPendingTransferInTransaction(null);
    }
    
    // 顯示確認對話框，不直接儲存
    setPendingTransaction(newTx);
    setShowConfirmDialog(true);
  };

  // 確認並儲存交易
  const confirmAndSave = () => {
    if (!pendingTransaction) return;
    
    if (isEditing) {
      onUpdate(pendingTransaction);
    } else {
      onAdd(pendingTransaction);
      if (pendingTransferInTransaction) {
        onAdd(pendingTransferInTransaction);
      }
    }
    setShowConfirmDialog(false);
    setPendingTransaction(null);
    setPendingTransferInTransaction(null);
    onClose();
  };

  // 取消確認，返回編輯
  const cancelConfirm = () => {
    setShowConfirmDialog(false);
    setPendingTransaction(null);
    setPendingTransferInTransaction(null);
  };

  // 取得交易類型的名稱
  const getTypeName = (type: TransactionType): string => {
    switch (type) {
      case TransactionType.BUY: return tf.typeBuy;
      case TransactionType.SELL: return tf.typeSell;
      case TransactionType.CASH_DIVIDEND: return tf.typeCashDividend;
      case TransactionType.DIVIDEND: return tf.typeDividend;
      case TransactionType.TRANSFER_IN: return tf.typeTransferIn;
      case TransactionType.TRANSFER_OUT: return tf.typeTransferOut;
      default: return type;
    }
  };

  /** 單價／金額皆以所選證券戶幣別輸入（如 USD 戶填美元價） */
  const getAccountCurrencyCode = (accountId: string): string => {
    const a = accounts.find((x: Account) => x.id === accountId);
    return a ? String(a.currency) : 'TWD';
  };

  const formatAmountForMarket = (value: number, market: Market): string =>
    market === Market.TW ? Math.round(value).toString() : value.toFixed(2);

  // 從 holdings 中根據 ticker 查找對應的市場
  const findMarketFromHoldings = (ticker: string): Market | null => {
    if (!ticker || !holdings || holdings.length === 0) return null;
    
    const upperTicker = ticker.toUpperCase().trim();
    
    // 在 holdings 中查找匹配的 ticker
    const matchedHolding = holdings.find((h: Holding) => {
      const holdingTicker = h.ticker.toUpperCase().trim();
      // 支援完全匹配或移除前綴後匹配（如 TPE:2330 匹配 2330）
      return holdingTicker === upperTicker || 
             holdingTicker.replace(/^(TPE:|TW|US|LON|TYO)/i, '') === upperTicker ||
             upperTicker.replace(/^(TPE:|TW|US|LON|TYO)/i, '') === holdingTicker;
    });
    
    return matchedHolding ? matchedHolding.market : null;
  };

  // 根據帳戶、代號、市場查找平均成本
  const findAvgCostFromHoldings = (
    accountId: string, 
    ticker: string, 
    market: Market
  ): number | null => {
    if (!accountId || !ticker || !holdings || holdings.length === 0) return null;
    
    const upperTicker = ticker.toUpperCase().trim();
    const matchedHolding = holdings.find((h: Holding) => {
      return h.accountId === accountId && 
             h.market === market &&
             h.ticker.toUpperCase().trim() === upperTicker;
    });
    
    return matchedHolding && matchedHolding.avgCost > 0 ? matchedHolding.avgCost : null;
  };

  const getAvailableHoldingQuantity = (
    accountId: string,
    ticker: string,
    market: Market
  ): number => {
    if (!accountId || !ticker || !holdings || holdings.length === 0) return 0;

    const upperTicker = ticker.toUpperCase().trim();
    const matchedHolding = holdings.find((h: Holding) => {
      return h.accountId === accountId &&
             h.market === market &&
             h.ticker.toUpperCase().trim() === upperTicker;
    });

    return matchedHolding ? matchedHolding.quantity : 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const newFormData = { ...formData, [e.target.name]: e.target.value };
    
    // 當交易類型變為現金股息時，自動將數量設為 1
    if (e.target.name === 'type' && e.target.value === TransactionType.CASH_DIVIDEND) {
      newFormData.quantity = '1';
    }
    
    // 當輸入代號時，從 holdings 中自動判斷市場
    if (e.target.name === 'ticker' && e.target.value) {
      const detectedMarket = findMarketFromHoldings(e.target.value);
      if (detectedMarket) {
        newFormData.market = detectedMarket;
      }
    }
    
    // 當選擇轉入/轉出類型，或變更帳戶/代號/市場時，嘗試自動填入平均成本
    if (
      (e.target.name === 'type' && 
       (e.target.value === TransactionType.TRANSFER_IN || 
        e.target.value === TransactionType.TRANSFER_OUT)) ||
      (e.target.name === 'accountId' && 
       (newFormData.type === TransactionType.TRANSFER_IN || 
        newFormData.type === TransactionType.TRANSFER_OUT)) ||
      (e.target.name === 'ticker' && 
       (newFormData.type === TransactionType.TRANSFER_IN || 
        newFormData.type === TransactionType.TRANSFER_OUT)) ||
      (e.target.name === 'market' && 
       (newFormData.type === TransactionType.TRANSFER_IN || 
        newFormData.type === TransactionType.TRANSFER_OUT))
    ) {
      if (newFormData.ticker && newFormData.accountId && newFormData.market && !editingTransaction) {
        const avgCost = findAvgCostFromHoldings(
          newFormData.accountId,
          newFormData.ticker,
          newFormData.market
        );
        newFormData.price = avgCost !== null ? avgCost.toFixed(2) : '';
      } else if (!editingTransaction) {
        newFormData.price = '';
      }
    }
    
    setFormData(newFormData);
  };

  const formatDividendDetailAmount = (value: number, market: Market): string =>
    market === Market.TW
      ? Math.round(value).toLocaleString()
      : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });

  const getCashDividendWithheld = (): number => {
    if (!isEditing || !editingTransaction) return 0;
    if (editingTransaction.withheldUsTaxNative != null && editingTransaction.withheldUsTaxNative > 0) {
      return editingTransaction.withheldUsTaxNative;
    }
    if (editingTransaction.withheldNhiTwd != null && editingTransaction.withheldNhiTwd > 0) {
      return editingTransaction.withheldNhiTwd;
    }
    return 0;
  };

  const getCashDividendBreakdownCalc = () => {
    const breakdown = parseCashDividendNoteBreakdown(formData.note);
    if (!breakdown) return null;

    const withheld = getCashDividendWithheld();
    if (formData.market === Market.US) {
      const formula = usCashDividendCentBreakdown(
        breakdown.shares,
        breakdown.perShare,
        undefined,
        selectedUsWithholdingRate
      );
      const taxNative = withheld > 0 ? withheld : formula.taxNative;
      return {
        grossNative: formula.grossNative,
        taxNative,
        netNative: Math.round((formula.grossNative - taxNative) * 100) / 100,
      };
    }
    if (formData.market === Market.TW) {
      const grossNative = twEstimatedSingleDividendTwd(breakdown.shares, breakdown.perShare);
      const taxNative = withheld > 0 ? withheld : 0;
      return {
        grossNative,
        taxNative,
        netNative: grossNative - taxNative,
      };
    }
    const grossNative = breakdown.perShare * breakdown.shares;
    const taxNative = withheld > 0 ? withheld : 0;
    return {
      grossNative,
      taxNative,
      netNative: grossNative - taxNative,
    };
  };

  const calculatePreviewAmount = (): number => {
    const price = parseFloat(formData.price) || 0;
    const quantity =
      formData.type === TransactionType.CASH_DIVIDEND ? 1 : parseFloat(formData.quantity) || 0;
    const fees = parseFloat(formData.fees) || 0;
    if (formData.type === TransactionType.CASH_DIVIDEND) {
      if (formData.market === Market.US) {
        if (price > 0) return Math.round((price - fees) * 100) / 100;
        const breakdownCalc = getCashDividendBreakdownCalc();
        if (breakdownCalc) {
          return Math.round((breakdownCalc.netNative - fees) * 100) / 100;
        }
        return 0;
      }
      const withheld = getCashDividendWithheld();
      const breakdownCalc = getCashDividendBreakdownCalc();
      if (breakdownCalc) {
        return breakdownCalc.netNative - fees;
      }
      if (withheld > 0 && editingTransaction?.withheldNhiTwd) {
        return price - fees - withheld;
      }
      return price - fees;
    }
    return computeTransactionAmount(formData.type, formData.market, price, quantity, fees);
  };

  const showAmountPreview =
    formData.type === TransactionType.CASH_DIVIDEND
      ? !!formData.price || !!parseCashDividendNoteBreakdown(formData.note)
      : !!formData.price && !!formData.quantity;

  const renderCalculationFormula = (): string => {
    if (formData.type === TransactionType.CASH_DIVIDEND) {
      const price = parseFloat(formData.price) || 0;
      const fees = parseFloat(formData.fees) || 0;
      const withheld = getCashDividendWithheld();
      const deduction = fees > 0 ? fees : withheld;
      const breakdown = parseCashDividendNoteBreakdown(formData.note);
      const totalLabel = tf.placeholderQuantity;

      if (breakdown) {
        const breakdownCalc = getCashDividendBreakdownCalc();
        const gross = breakdownCalc?.grossNative ?? breakdown.perShare * breakdown.shares;
        const perShareLabel = formatDividendDetailAmount(breakdown.perShare, formData.market);
        const sharesLabel = formatDisplayQuantity(breakdown.shares);
        const grossLabel = formatDividendDetailAmount(gross, formData.market);
        let formula = `${tf.calculationMethod}${perShareLabel} × ${sharesLabel} ${tf.shares} = ${grossLabel}`;
        if (formData.market === Market.US && breakdownCalc && breakdownCalc.taxNative > 0) {
          formula += ` − ${formatDividendDetailAmount(breakdownCalc.taxNative, formData.market)} (${tf.deductionShort})`;
          const netLabel = formatDividendDetailAmount(breakdownCalc.netNative, formData.market);
          formula += ` = ${netLabel}`;
          if (fees > 0) {
            formula += ` − ${formatDividendDetailAmount(fees, formData.market)} (${tf.feesShort})`;
            formula += ` = ${formatDividendDetailAmount(breakdownCalc.netNative - fees, formData.market)}`;
          }
          return formula;
        }
        const nhiDeduction = breakdownCalc?.taxNative ?? 0;
        const totalDeduction = nhiDeduction + fees;
        const breakdownDeduction = totalDeduction > 0 ? totalDeduction : deduction;
        if (breakdownDeduction > 0) {
          formula += ` − ${formatDividendDetailAmount(breakdownDeduction, formData.market)} (${tf.deductionShort})`;
        }
        if (breakdownCalc) {
          const netLabel = formatDividendDetailAmount(
            breakdownCalc.netNative - fees,
            formData.market
          );
          formula += ` = ${netLabel}`;
        }
        return formula;
      }

      const grossLabel = formatDividendDetailAmount(price, formData.market);
      if (formData.market === Market.US) {
        if (fees > 0) {
          return `${tf.calculationFormula}${totalLabel} ${grossLabel} − ${formatDividendDetailAmount(fees, formData.market)} (${tf.feesShort}) = ${formatDividendDetailAmount(price - fees, formData.market)}`;
        }
        return `${tf.calculationFormula}${totalLabel} ${grossLabel}`;
      }
      if (deduction > 0) {
        return `${tf.calculationFormula}${totalLabel} ${grossLabel} − ${formatDividendDetailAmount(deduction, formData.market)} (${tf.deductionShort})`;
      }
      return `${tf.calculationFormula}${totalLabel} ${grossLabel}`;
    }
    const feeOp =
      formData.type === TransactionType.BUY || formData.type === TransactionType.DIVIDEND
        ? ' + '
        : formData.type === TransactionType.SELL || formData.type === TransactionType.TRANSFER_OUT
          ? ' - '
          : '';
    return `${tf.calculationFormula}${formData.price} × ${formData.quantity}${
      formData.market === Market.TW ? tf.formulaNote : ''
    }${feeOp}${formData.fees || 0} (${tf.feesShort})`;
  };

  // 取得帳戶名稱
  const getAccountName = (accountId: string): string => {
    const account = accounts.find(a => a.id === accountId);
    return account ? `${account.name} (${account.currency})` : accountId;
  };

  const formatDisplayQuantity = (value: number): string => {
    const rounded = Number(value.toFixed(8));
    return rounded.toString();
  };

  const selectedAccountCurrency = getAccountCurrencyCode(formData.accountId);

  const availableTransferOutQuantity = isTransferOutMode
    ? getAvailableHoldingQuantity(formData.accountId, formData.ticker, formData.market)
    : 0;

  return (
    <>
      {/* 確認對話框 */}
      {transferValidationMessage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-red-600 p-4">
              <h3 className="text-white font-bold text-lg">{tf.confirmTitle}</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-800">{transferValidationMessage}</p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setTransferValidationMessage(null)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
                >
                  {translations.common.confirm}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showConfirmDialog && pendingTransaction && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60] overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col my-auto">
            <div className="bg-slate-900 p-4 shrink-0">
              <h3 className="text-white font-bold text-lg">{tf.confirmTitle}</h3>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto flex-1 min-h-0">
              <div className="bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">{tf.confirmMessage}</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">{tf.dateLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{pendingTransaction.date}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">{tf.accountLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{getAccountName(pendingTransaction.accountId)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">{tf.marketLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{pendingTransaction.market}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">{tf.tickerLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{pendingTransaction.ticker}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">{tf.typeLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{getTypeName(pendingTransaction.type)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">{tf.priceLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {pendingTransaction.price.toFixed(2)} {getAccountCurrencyCode(pendingTransaction.accountId)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">{tf.quantityLabel}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {pendingTransaction.type === TransactionType.CASH_DIVIDEND
                      ? tf.cashDividendQuantityConfirm
                      : `${pendingTransaction.quantity} ${tf.shares}`}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">
                    {tf.feesLabel}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {pendingTransaction.fees.toFixed(2)} {getAccountCurrencyCode(pendingTransaction.accountId)}
                  </span>
                </div>
                {pendingTransaction.note && (
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">{tf.noteLabel}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100 text-right max-w-[60%]">{pendingTransaction.note}</span>
                  </div>
                )}
                {pendingTransferInTransaction && (
                  <div className="rounded-md border border-indigo-100 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 p-2 text-xs text-indigo-900 dark:text-indigo-200">
                    {tf.transferInConfirmHint}：{getAccountName(pendingTransferInTransaction.accountId)} / {pendingTransferInTransaction.market} / {pendingTransferInTransaction.ticker} / {pendingTransferInTransaction.quantity} {tf.shares}
                  </div>
                )}
                <div className="border-t-2 border-slate-300 dark:border-slate-600 pt-2 mt-2">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="text-slate-700 dark:text-slate-300 font-semibold shrink-0">{tf.totalAmount}</span>
                    <span className="font-bold text-lg text-slate-900 dark:text-amber-400 tabular-nums text-right">
                      {formatAmountForMarket(pendingTransaction.amount ?? 0, pendingTransaction.market)}{' '}
                      {getAccountCurrencyCode(pendingTransaction.accountId)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={cancelConfirm}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {tf.backToEdit}
                </button>
                <button
                  type="button"
                  onClick={confirmAndSave}
                  className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
                >
                  {tf.confirmSave}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in overflow-y-auto">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col my-auto">
          <div className="bg-slate-900 p-4 flex justify-between items-center shrink-0">
            <h2 className="text-white font-bold text-lg">{isEditing ? tf.editTransaction : tf.addTransaction}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
          </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">{tf.date}</label>
              <input 
                type="date" name="date" required
                value={formData.date} onChange={handleChange}
                className={`mt-1 w-full border border-slate-300 rounded-md p-2 focus:ring-accent focus:border-accent ${FORM_FIELD_THEME}`}
              />
            </div>
             <div>
              <label className="block text-sm font-medium text-slate-700">{tf.account}</label>
              <select 
                name="accountId" required
                value={formData.accountId} onChange={handleChange}
                className={`mt-1 w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-sm font-medium text-slate-700">{tf.market}</label>
              <select 
                name="market" 
                value={formData.market} onChange={handleChange}
                className={`mt-1 w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
              >
                <option value={Market.TW}>{tf.marketTW}</option>
                <option value={Market.US}>{tf.marketUS}</option>
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

            <div>
              <label className="block text-sm font-medium text-slate-700">{tf.ticker}</label>
              <input 
                type="text" name="ticker" required placeholder={tf.tickerPlaceholder}
                value={formData.ticker} onChange={handleChange}
                className={`mt-1 w-full border border-slate-300 rounded-md p-2 uppercase ${FORM_FIELD_THEME}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">{tf.category}</label>
              <select 
                name="type" 
                value={formData.type} onChange={handleChange}
                className={`mt-1 w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
              >
                {transactionTypeOptions.map(type => (
                  <option key={type} value={type}>
                    {getTypeName(type)}
                  </option>
                ))}
              </select>
            </div>
             <div>
              <label className="block text-sm font-medium text-slate-700">
                {formData.type === TransactionType.CASH_DIVIDEND
                  ? tf.placeholderQuantity
                  : tf.price}{' '}
                ({selectedAccountCurrency})
              </label>
              <input 
                type="number" inputMode={INPUT_MODE_DECIMAL} name="price" required step="any" min="0"
                value={formData.price} onChange={handleChange}
                placeholder={formData.type === TransactionType.CASH_DIVIDEND ? tf.placeholderQuantity : tf.placeholderPrice}
                className={`mt-1 w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
              />
            </div>
          </div>

          {isTransferOutMode && !isEditing && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
              <div className="font-semibold text-slate-800">{tf.transferInSectionTitle}</div>
              <div>
                <label className="block text-sm font-medium text-slate-700">{tf.targetAccount}</label>
                <select
                  name="targetAccountId"
                  required
                  value={targetAccountId}
                  onChange={e => setTargetAccountId(e.target.value)}
                  className={`mt-1 w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
                >
                  <option value="">{tf.targetAccountPlaceholder}</option>
                  {accounts
                    .filter(a => a.id !== formData.accountId)
                    .map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                    ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-sm font-medium text-slate-700">
                {formData.type === TransactionType.CASH_DIVIDEND ? tf.quantityFixed : tf.quantity}
              </label>
              <input 
                type="number" inputMode={INPUT_MODE_DECIMAL} name="quantity" required step="any" min="0"
                value={formData.type === TransactionType.CASH_DIVIDEND ? '1' : formData.quantity}
                onChange={handleChange}
                disabled={formData.type === TransactionType.CASH_DIVIDEND}
                className={`mt-1 w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME} ${formData.type === TransactionType.CASH_DIVIDEND ? 'bg-slate-100 cursor-not-allowed dark:bg-slate-700' : ''}`}
              />
              {isTransferOutMode && formData.ticker.trim() && (
                <div className="mt-1 text-xs text-slate-500">
                  {tf.availableTransferOutQuantity
                    .replace('{quantity}', formatDisplayQuantity(availableTransferOutQuantity))
                    .replace('{shares}', tf.shares)}
                </div>
              )}
            </div>
             <div>
              <label className="block text-sm font-medium text-slate-700">{tf.fees}</label>
              <input 
                type="number" inputMode={INPUT_MODE_DECIMAL} name="fees" step="0.01" min="0"
                value={formData.fees} onChange={handleChange}
                className={`mt-1 w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">{tf.note}</label>
            <input 
              type="text" name="note"
              value={formData.note} onChange={handleChange}
              className={`mt-1 w-full border border-slate-300 rounded-md p-2 ${FORM_FIELD_THEME}`}
            />
          </div>

          {/* 計算金額預覽 */}
          {showAmountPreview && (
            <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
              <div className="text-xs text-slate-600 mb-1">{tf.previewTitle}</div>
              <div className="text-lg font-bold text-slate-800">
                {formatAmountForMarket(calculatePreviewAmount(), formData.market)}
                <span className="text-xs text-slate-500 ml-2">
                  ({selectedAccountCurrency})
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {renderCalculationFormula()}
              </div>
            </div>
          )}

          <div className="pt-4 flex gap-3">
             <button 
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
            >
              {tf.cancel}
            </button>
            <button 
              type="submit"
              className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              {isEditing ? tf.updateTransaction : tf.saveTransaction}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
};

export default TransactionForm;


