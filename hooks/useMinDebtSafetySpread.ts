import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_MIN_SAFETY_SPREAD_PERCENT } from '../utils/debtAccountHelpers';

export function useMinDebtSafetySpread(userPrefix: string | undefined) {
  const [minDebtSafetySpread, setMinDebtSafetySpread] = useState(DEFAULT_MIN_SAFETY_SPREAD_PERCENT);

  useEffect(() => {
    if (!userPrefix) {
      setMinDebtSafetySpread(DEFAULT_MIN_SAFETY_SPREAD_PERCENT);
      return;
    }
    const raw = localStorage.getItem(`${userPrefix}_minDebtSafetySpread`);
    const n = raw != null ? parseFloat(raw) : DEFAULT_MIN_SAFETY_SPREAD_PERCENT;
    setMinDebtSafetySpread(Number.isFinite(n) && n >= 0 ? n : DEFAULT_MIN_SAFETY_SPREAD_PERCENT);
  }, [userPrefix]);

  const handleMinDebtSafetySpreadChange = useCallback(
    (n: number) => {
      const v = Number.isFinite(n) && n >= 0 ? n : DEFAULT_MIN_SAFETY_SPREAD_PERCENT;
      setMinDebtSafetySpread(v);
      if (userPrefix) localStorage.setItem(`${userPrefix}_minDebtSafetySpread`, String(v));
    },
    [userPrefix]
  );

  return { minDebtSafetySpread, handleMinDebtSafetySpreadChange };
}
