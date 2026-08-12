import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_HIGHLIGHT_MS = 60_000;

export function useRecentRecordHighlights(durationMs = DEFAULT_HIGHLIGHT_MS) {
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(() => new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const markHighlighted = useCallback(
    (ids: string | string[]) => {
      const idList = Array.isArray(ids) ? ids : [ids];
      if (idList.length === 0) return;

      setHighlightedIds(prev => {
        const next = new Set(prev);
        for (const id of idList) next.add(id);
        return next;
      });

      for (const id of idList) {
        const existing = timersRef.current.get(id);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
          setHighlightedIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          timersRef.current.delete(id);
        }, durationMs);

        timersRef.current.set(id, timer);
      }
    },
    [durationMs]
  );

  const isHighlighted = useCallback((id: string) => highlightedIds.has(id), [highlightedIds]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return { markHighlighted, isHighlighted };
}
