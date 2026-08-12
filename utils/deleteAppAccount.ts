/** 清除指定使用者在本機 localStorage 的所有資料與登入狀態 */
export function clearUserLocalStorage(userEmail: string): void {
  const prefix = `tf_${userEmail}_`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) keysToRemove.push(key);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));

  localStorage.removeItem('tf_is_auth');
  localStorage.removeItem('tf_last_user');
  localStorage.removeItem('tf_is_guest');
}
