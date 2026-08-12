import { CashFlow, CombinedRecord } from '../types';

/** 列表顯示用筆數（排除轉帳目標端的虛擬列） */
export function countVisibleFilteredRecords(records: CombinedRecord[]): number {
  return records.filter(r => !(r.type === 'CASHFLOW' && r.isTargetRecord)).length;
}

export function getDeletableIdsFromFilteredRecords(records: CombinedRecord[]) {
  const transactionIds: string[] = [];
  const cashFlowIds = new Set<string>();
  for (const r of records) {
    if (r.type === 'TRANSACTION') {
      transactionIds.push(r.id);
    } else if (r.type === 'CASHFLOW') {
      cashFlowIds.add((r.originalRecord as CashFlow).id);
    }
  }
  return { transactionIds, cashFlowIds: [...cashFlowIds] };
}
