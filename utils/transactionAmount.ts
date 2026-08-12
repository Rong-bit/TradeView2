import { Market, Transaction, TransactionType } from '../types';

/** 台股成交金額：價格×股數無條件捨去；其他市場保留原值 */
export function twFloorBaseAmount(price: number, quantity: number, market: Market): number {
  const raw = price * quantity;
  return market === Market.TW ? Math.floor(raw) : raw;
}

/** 依交易類型計算入帳／顯示用總金額（與記一筆表單一致） */
export function computeTransactionAmount(
  type: TransactionType,
  market: Market,
  price: number,
  quantity: number,
  fees: number
): number {
  if (type === TransactionType.BUY || type === TransactionType.SELL) {
    const baseAmount = twFloorBaseAmount(price, quantity, market);
    return type === TransactionType.BUY ? baseAmount + fees : baseAmount - fees;
  }
  if (type === TransactionType.DIVIDEND) {
    return twFloorBaseAmount(price, quantity, market) + fees;
  }
  if (type === TransactionType.CASH_DIVIDEND) {
    return price * quantity - fees;
  }
  if (type === TransactionType.TRANSFER_OUT) {
    return twFloorBaseAmount(price, quantity, market) - fees;
  }
  if (type === TransactionType.TRANSFER_IN) {
    return twFloorBaseAmount(price, quantity, market) + fees;
  }
  return price * quantity;
}

/**
 * 帳本顯示金額。
 * 轉倉（匯入／匯出）一律走標準公式，修正台股舊資料未捨去的小數。
 */
export function resolveTransactionLedgerAmount(
  tx: Pick<Transaction, 'type' | 'market' | 'price' | 'quantity' | 'fees' | 'amount'>
): number {
  const fees = tx.fees || 0;
  if (
    tx.type === TransactionType.TRANSFER_IN ||
    tx.type === TransactionType.TRANSFER_OUT
  ) {
    return computeTransactionAmount(tx.type, tx.market, tx.price, tx.quantity, fees);
  }
  if (tx.amount != null && Number.isFinite(tx.amount) && tx.amount > 0) {
    return tx.amount;
  }
  return computeTransactionAmount(tx.type, tx.market, tx.price, tx.quantity, fees);
}

/** 寫入前正規化：台股轉倉金額一律套用捨去公式 */
export function normalizeTransactionAmount<T extends Transaction>(tx: T): T {
  if (
    tx.market === Market.TW &&
    (tx.type === TransactionType.TRANSFER_IN || tx.type === TransactionType.TRANSFER_OUT)
  ) {
    return {
      ...tx,
      amount: computeTransactionAmount(tx.type, tx.market, tx.price, tx.quantity, tx.fees || 0),
    };
  }
  return tx;
}
