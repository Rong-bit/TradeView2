import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ADMIN_EMAIL, GLOBAL_AUTHORIZED_USERS } from '../config';
import { subscriptionService } from '../services/subscriptionService';
import type { SubscriptionInfo } from '../types';
import type { View } from '../contexts/UIContext';

/** 使用者本次登入主動選擇非會員模式時為 true，避免裝置訂閱快取覆寫 isGuest */
export const userChoseGuestLoginRef = { current: false };

export function isAuthorizedUser(email: string): boolean {
  return email === ADMIN_EMAIL || GLOBAL_AUTHORIZED_USERS.includes(email);
}

function parseStoredSubscriptionActive(): boolean {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('tf_subscription_info') : null;
    if (!stored) return false;
    const parsed = JSON.parse(stored);
    const status = String(parsed?.status ?? '').toLowerCase();
    const expiry = parsed?.expiryDate;
    if (status !== 'active') return false;
    if (expiry && !isNaN(new Date(expiry).getTime()) && new Date() > new Date(expiry)) return false;
    return true;
  } catch {
    return false;
  }
}

interface UseSubscriptionParams {
  isAuthenticated: boolean;
  currentUser: string;
  isGuest: boolean;
  setIsGuest: (v: boolean) => void;
  view: View;
}

export function useSubscription({
  isAuthenticated,
  currentUser,
  isGuest,
  setIsGuest,
  view,
}: UseSubscriptionParams) {
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [subscriptionCheckDone, setSubscriptionCheckDone] = useState(false);
  const subscriptionRefreshRef = useRef<Promise<void> | null>(null);

  const isMember = useMemo(() => {
    if (isAuthorizedUser(currentUser)) return true;
    if (!subscriptionCheckDone) return false;
    if (subscriptionInfo?.status === 'active') {
      if (subscriptionInfo.expiryDate && new Date() > subscriptionInfo.expiryDate) return false;
      return true;
    }
    return parseStoredSubscriptionActive();
  }, [currentUser, subscriptionInfo, subscriptionCheckDone]);

  useEffect(() => {
    if (userChoseGuestLoginRef.current) return;
    if (isMember && isGuest) {
      setIsGuest(false);
      localStorage.setItem('tf_is_guest', 'false');
    }
  }, [isMember, isGuest, setIsGuest]);

  const effectiveIsGuest = useMemo(() => {
    if (isAuthorizedUser(currentUser)) return false;
    if (!subscriptionCheckDone && isAuthenticated) return true;
    return isGuest;
  }, [currentUser, subscriptionCheckDone, isAuthenticated, isGuest]);

  const showApplyMemberButton = useMemo(() => {
    if (isAuthorizedUser(currentUser)) return false;
    return (
      (!subscriptionCheckDone && isAuthenticated) ||
      (isGuest && !isMember)
    );
  }, [currentUser, subscriptionCheckDone, isAuthenticated, isGuest, isMember]);

  useEffect(() => {
    const stored = subscriptionService.getStoredSubscriptionSync();
    if (stored) {
      const expired = stored.expiryDate && new Date() > stored.expiryDate;
      setSubscriptionInfo(expired ? { ...stored, status: 'expired' } : stored);
    }
    setSubscriptionCheckDone(true);

    const initSubscription = async () => {
      try {
        await subscriptionService.initialize();
        const subscription = await subscriptionService.getCurrentSubscription();
        if (subscription) setSubscriptionInfo(subscription);
      } catch (error: unknown) {
        const err = error as { code?: string; message?: string };
        const errorCode = err?.code || '';
        const errorMessage = err?.message || '';
        if (
          errorCode === 'UNIMPLEMENTED' ||
          errorMessage.includes('not implemented') ||
          errorMessage.includes('UNIMPLEMENTED') ||
          errorMessage.includes('Web platform not supported')
        ) {
          return;
        }
      }
    };
    subscriptionRefreshRef.current = initSubscription().finally(() => {
      subscriptionRefreshRef.current = null;
    });
  }, []);

  useEffect(() => {
    if (view !== 'dashboard') return;
    if (subscriptionRefreshRef.current) return;
    const recheckSubscription = async () => {
      try {
        const subscription = subscriptionService.resolveStoredSubscriptionActive();
        if (subscription) {
          setSubscriptionInfo(subscription);
          return;
        }
        const refreshed = await subscriptionService.getCurrentSubscription();
        if (refreshed) setSubscriptionInfo(refreshed);
      } catch {
        // Web / 模擬器可能 UNIMPLEMENTED
      }
    };
    subscriptionRefreshRef.current = recheckSubscription().finally(() => {
      subscriptionRefreshRef.current = null;
    });
  }, [view]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    const guestStatus = localStorage.getItem('tf_is_guest');
    if (guestStatus === 'true' && !isAuthorizedUser(currentUser)) {
      userChoseGuestLoginRef.current = true;
    }

    if (subscriptionCheckDone && guestStatus !== 'true' && parseStoredSubscriptionActive()) {
      setIsGuest(false);
      localStorage.setItem('tf_is_guest', 'false');
    }

    const checkSubscription = async () => {
      if (subscriptionRefreshRef.current) {
        await subscriptionRefreshRef.current;
      }
      try {
        const isSubscribed =
          !!subscriptionService.resolveStoredSubscriptionActive() || parseStoredSubscriptionActive();
        const isAuthorized = isAuthorizedUser(currentUser);
        const wouldBeGuest = !isSubscribed && !isAuthorized;
        const newIsGuest = userChoseGuestLoginRef.current ? true : wouldBeGuest;
        setIsGuest(newIsGuest);
        localStorage.setItem('tf_is_guest', newIsGuest ? 'true' : 'false');
      } catch (error: unknown) {
        const err = error as { code?: string; message?: string };
        const errorCode = err?.code || '';
        const errorMessage = err?.message || '';
        if (
          errorCode === 'UNIMPLEMENTED' ||
          errorMessage.includes('not implemented') ||
          errorMessage.includes('UNIMPLEMENTED') ||
          errorMessage.includes('Web platform not supported')
        ) {
          const newIsGuest = userChoseGuestLoginRef.current ? true : guestStatus === 'true';
          setIsGuest(newIsGuest);
          localStorage.setItem('tf_is_guest', newIsGuest ? 'true' : 'false');
          return;
        }
        const newIsGuest = userChoseGuestLoginRef.current ? true : guestStatus === 'true';
        setIsGuest(newIsGuest);
        localStorage.setItem('tf_is_guest', newIsGuest ? 'true' : 'false');
      }
    };

    checkSubscription();
  }, [isAuthenticated, currentUser, subscriptionCheckDone, setIsGuest]);

  const handleSubscriptionUpdated = useCallback(
    async (info: SubscriptionInfo) => {
      setSubscriptionInfo(info);
      if (info?.status === 'active') userChoseGuestLoginRef.current = false;
      const isSubscribed = await subscriptionService.isSubscribed();
      const isAuthorized = isAuthorizedUser(currentUser);
      const newIsGuest = !isSubscribed && !isAuthorized;
      setIsGuest(newIsGuest);
      localStorage.setItem('tf_is_guest', newIsGuest ? 'true' : 'false');
    },
    [currentUser, setIsGuest]
  );

  const openSubscriptionModal = useCallback(() => setIsSubscriptionModalOpen(true), []);
  const closeSubscriptionModal = useCallback(() => setIsSubscriptionModalOpen(false), []);

  return {
    isSubscriptionModalOpen,
    openSubscriptionModal,
    closeSubscriptionModal,
    subscriptionInfo,
    subscriptionCheckDone,
    isMember,
    effectiveIsGuest,
    showApplyMemberButton,
    handleSubscriptionUpdated,
  };
}

/** 一般用戶登入：先讀本地訂閱快取，再背景查 StoreKit */
export function resolveGeneralUserLoginGuestState(): boolean {
  const stored = subscriptionService.getStoredSubscriptionSync();
  const hasActiveStored =
    stored?.status === 'active' &&
    (!stored.expiryDate || new Date() <= new Date(stored.expiryDate));
  return !hasActiveStored;
}

export function afterGeneralUserLogin(
  email: string,
  setIsGuest: (v: boolean) => void,
  onSubscriptionActive?: () => void
): void {
  subscriptionService.getCurrentSubscription().then(sub => {
    if (sub?.status === 'active') {
      onSubscriptionActive?.();
      userChoseGuestLoginRef.current = false;
      setIsGuest(false);
      localStorage.setItem('tf_is_guest', 'false');
    }
  }).catch(() => {});
}
