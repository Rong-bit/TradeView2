import { useEffect, useRef } from 'react';

/**
 * 使用防抖機制將資料儲存到 localStorage 的自訂 Hook
 * 可以減少頻繁的 localStorage 寫入操作，提升效能
 * 
 * @param key localStorage 的鍵值
 * @param value 要儲存的值
 * @param delay 防抖延遲時間（毫秒），預設 500ms
 * @param userPrefix 使用者前綴（用於多使用者環境）
 */
export function useLocalStorageDebounced<T>(
  key: string,
  value: T,
  delay: number = 500,
  userPrefix?: string
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // 首次渲染時不執行，避免覆蓋 localStorage 中的資料
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // 清除之前的定時器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // 設置新的定時器
    timeoutRef.current = setTimeout(() => {
      try {
        const fullKey = userPrefix ? `${userPrefix}_${key}` : key;
        const serialized = JSON.stringify(value);
        localStorage.setItem(fullKey, serialized);
      } catch (error) {
        console.error(`[useLocalStorageDebounced] 儲存失敗 (key: ${key}):`, error);
      }
    }, delay);

    // 清理函數
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [key, value, delay, userPrefix]);
}

/**
 * 儲存原始類型（字串或數字）到 localStorage 的防抖 Hook
 * 用於不需要 JSON.stringify 的簡單類型
 */
export function useLocalStorageDebouncedSimple(
  key: string,
  value: string | number | undefined,
  delay: number = 500,
  userPrefix?: string
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    let pending = true;
    const write = () => {
      try {
        const fullKey = userPrefix ? `${userPrefix}_${key}` : key;
        if (value !== undefined) {
          localStorage.setItem(fullKey, value.toString());
        } else {
          localStorage.removeItem(fullKey);
        }
      } catch (error) {
        console.error(`[useLocalStorageDebouncedSimple] 儲存失敗 (key: ${key}):`, error);
      }
      pending = false;
    };

    timeoutRef.current = setTimeout(write, delay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (pending) write();
    };
  }, [key, value, delay, userPrefix]);
}

