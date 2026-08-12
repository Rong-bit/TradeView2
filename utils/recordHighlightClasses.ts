export function recordRowClassName(highlighted: boolean): string {
  return highlighted ? 'record-row-highlight' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40';
}
