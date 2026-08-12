import React, { useState, useEffect } from 'react';
import { Language, t } from '../utils/i18n';
import { subscriptionService, PRODUCT_IDS, isPurchaseUserCancelled, getPurchaseErrorMessage } from '../services/subscriptionService';
import { SubscriptionInfo, SubscriptionProduct } from '../types';
import { Capacitor } from '@capacitor/core';
import { TERMS_OF_USE_EULA_URL, PRIVACY_POLICY_URL } from '../config';
import { openExternalUrl } from '../utils/openExternalUrl';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onSubscriptionUpdated?: (info: SubscriptionInfo) => void;
}

const SubscriptionModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  language,
  onSubscriptionUpdated 
}) => {
  const translations = t(language);
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionInfo | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isOpen && !isInitialized) {
      initializeSubscription();
    }
  }, [isOpen, isInitialized]);

  const initializeSubscription = async () => {
    setError(null);
    setProductsLoading(true);
    setProducts([]);
    setCurrentSubscription(subscriptionService.resolveStoredSubscriptionActive());

    try {
      await subscriptionService.initialize();

      const productsList = await subscriptionService.getProducts();
      setProducts(productsList);

      const subscription =
        Capacitor.getPlatform() === 'ios'
          ? await subscriptionService.refreshSubscriptionFromStore(undefined, { mode: 'quick' })
          : await subscriptionService.getCurrentSubscription();

      if (subscription && subscription.status === 'active') {
        setCurrentSubscription(subscription);
      } else {
        setCurrentSubscription(subscriptionService.resolveStoredSubscriptionActive());
      }
    } catch (err) {
      console.error('刷新訂閱資料失敗:', err);
      setError(err instanceof Error ? err.message : translations.subscription.initFailed);
    } finally {
      setProductsLoading(false);
      setIsInitialized(true);
    }
  };

  const handlePurchase = async (productId: string) => {
    if (
      currentSubscription?.status === 'active' &&
      currentSubscription.productId === productId
    ) {
      return;
    }

    try {
      setPurchasing(productId);
      setError(null);
      
      const subscriptionInfo = await subscriptionService.purchase(productId);
      
      // 更新訂閱狀態
      setCurrentSubscription(subscriptionInfo);
      
      // 通知父組件
      if (onSubscriptionUpdated) {
        onSubscriptionUpdated(subscriptionInfo);
      }
      
      // 顯示成功訊息
      alert(translations.subscription.purchaseSuccess);
    } catch (err) {
      if (isPurchaseUserCancelled(err)) return;
      console.error('購買失敗:', err);
      const errorMessage = getPurchaseErrorMessage(err) || translations.subscription.purchaseFailed;
      setError(errorMessage);
      alert(`${translations.subscription.purchaseFailedPrefix}${errorMessage}`);
    } finally {
      setPurchasing(null);
    }
  };

  const handleRestore = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const subscriptionInfo = await subscriptionService.restorePurchases();
      
      if (subscriptionInfo && subscriptionInfo.status === 'active') {
        setCurrentSubscription(subscriptionInfo);
        if (onSubscriptionUpdated) {
          onSubscriptionUpdated(subscriptionInfo);
        }
        alert(translations.subscription.restoreSuccess);
      } else {
        alert(translations.subscription.restoreNotFound);
      }
    } catch (err) {
      console.error('恢復購買失敗:', err);
      setError(err instanceof Error ? err.message : translations.subscription.restoreFailed);
    } finally {
      setLoading(false);
    }
  };

  const formatExpiryDate = (date: Date | undefined): string => {
    if (!date) return '';
    const locale = language === 'zh-TW' || language === 'zh-CN' ? 'zh-TW' : 'en-US';
    return new Date(date).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  };

  const platform = Capacitor.getPlatform();
  const isNativePlatform = platform === 'ios' || platform === 'android';

  if (!isOpen) return null;

  const overlayPadding = {
    paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))',
    paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))',
    paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
    paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
  };
  const modalMaxHeight = 'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1rem)';

  return (
    <div 
      className="fixed inset-0 flex flex-col items-center bg-black/50 animate-fade-in overflow-hidden"
      style={{
        ...overlayPadding,
        zIndex: 2147483647, /* 高於 app-fixed-header，避免頂部文字被 header 遮住 */
      }}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-y-auto overflow-x-hidden flex flex-col"
        style={{
          maxHeight: modalMaxHeight,
          WebkitOverflowScrolling: 'touch',
          flex: '1 1 0',
          minHeight: 0,
        }}
      >
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                {translations.subscription.title}
              </h2>
              <p className="text-indigo-100 mt-1 text-sm">
                {translations.subscription.subtitle}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-indigo-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content - 與 header 同一個可捲動區塊，底部留安全區域 */}
        <div 
          className="p-6 space-y-6"
          style={{
            paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* Current Subscription Status */}
          {currentSubscription && currentSubscription.status === 'active' && (
            <div className="bg-green-50 dark:bg-green-900/25 border-2 border-green-400 dark:border-green-600 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <h3 className="font-bold text-green-800 dark:text-green-300">
                  {translations.subscription.memberStatus}
                </h3>
              </div>
              <p className="text-sm text-green-700 dark:text-green-400">
                {`${translations.subscription.plan} ${currentSubscription.plan === 'monthly' ? translations.subscription.monthly : translations.subscription.yearly}`}
              </p>
              {currentSubscription.expiryDate && (
                <p className="text-sm text-green-700 dark:text-green-400 mt-1 font-medium">
                  {`${translations.subscription.periodEndLabel}${formatExpiryDate(currentSubscription.expiryDate)}`}
                </p>
              )}
            </div>
          )}

          {/* Platform Warning */}
          {!isNativePlatform && (
            <div className="bg-amber-50 dark:bg-amber-900/25 border-2 border-amber-400 dark:border-amber-600 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-bold text-amber-800 dark:text-amber-300">
                    {translations.subscription.inAppOnlyTitle}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    {translations.subscription.inAppOnlyDesc}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/25 border-2 border-red-400 dark:border-red-600 rounded-lg p-4">
              <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Subscription Plans */}
          {productsLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="mt-2 text-slate-600">{translations.subscription.loading}</p>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {products.map((product) => {
                const isYearly = product.plan === 'yearly';
                const isPurchasing = purchasing === product.id;
                const isCurrentPlan = currentSubscription?.productId === product.id && 
                                     currentSubscription?.status === 'active';

                return (
                  <div
                    key={product.id}
                    className={`relative border-2 rounded-lg p-6 transition-all ${
                      isYearly
                        ? 'border-purple-500 dark:border-purple-400 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/40 dark:to-indigo-900/40'
                        : 'border-slate-300 bg-white'
                    } ${isCurrentPlan ? 'ring-2 ring-green-500' : ''}`}
                  >
                    {isYearly && (
                      <div className="absolute top-0 right-0 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">
                        {translations.subscription.recommended}
                      </div>
                    )}
                    
                    {isCurrentPlan && (
                      <div className="absolute top-2 left-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">
                        {translations.subscription.currentPlan}
                      </div>
                    )}

                    <div className="mt-4">
                      <h3 className="text-xl font-bold text-slate-800 mb-2">
                        {isYearly ? translations.subscription.yearly : translations.subscription.monthly}
                      </h3>
                      <p className="text-sm text-slate-600 mb-2">
                        {translations.subscription.lengthLabel}{isYearly ? translations.subscription.lengthYear : translations.subscription.lengthMonth}
                      </p>
                      <div className="mb-4">
                        <span className="text-3xl font-bold text-slate-900 tabular-nums">{product.price}</span>
                        {isYearly ? (
                          <span className="text-sm text-slate-600 ml-2">
                            {translations.subscription.perYear}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-600 ml-2">
                            {translations.subscription.perMonth}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mb-4 min-h-[3rem]">
                        {isYearly ? translations.subscription.yearlyDesc : translations.subscription.monthlyDesc}
                      </p>
                      
                      {isYearly && (
                        <div className="bg-purple-100 dark:bg-purple-900/50 rounded p-2 mb-4">
                          <p className="text-xs text-purple-800 dark:text-purple-200 font-semibold">
                            {translations.subscription.savePercent}
                          </p>
                        </div>
                      )}

                      <button
                        onClick={() => handlePurchase(product.id)}
                        disabled={isPurchasing || !isNativePlatform || isCurrentPlan}
                        className={`w-full py-3 px-4 rounded-lg font-bold transition-all ${
                          isCurrentPlan
                            ? 'bg-green-500 text-white cursor-not-allowed'
                            : isPurchasing
                            ? 'bg-slate-400 text-white cursor-not-allowed'
                            : isYearly
                            ? 'bg-purple-600 hover:bg-purple-700 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        {isPurchasing ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            {translations.subscription.processing}
                          </span>
                        ) : isCurrentPlan ? (
                          translations.subscription.currentPlan
                        ) : (
                          translations.subscription.becomeMember
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}

          {/* Restore Purchases */}
          {isNativePlatform && (
            <div className="border-t border-slate-200 pt-4">
              <button
                onClick={handleRestore}
                disabled={loading || productsLoading}
                className="w-full py-2 px-4 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors"
              >
                {translations.subscription.restorePurchases}
              </button>
            </div>
          )}

          {/* App Store 3.1.2：訂閱流程內須提供可點擊的 Terms of Use (EULA) 與 Privacy Policy 連結，iOS 使用 SFSafariViewController */}
          <div className="border-t border-slate-200 pt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            <button
              type="button"
              onClick={() => openExternalUrl(TERMS_OF_USE_EULA_URL)}
              className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline font-medium bg-transparent border-none cursor-pointer p-0"
            >
              {translations.subscription.termsOfUse}
            </button>
            <button
              type="button"
              onClick={() => openExternalUrl(PRIVACY_POLICY_URL)}
              className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline font-medium bg-transparent border-none cursor-pointer p-0"
            >
              {translations.subscription.privacyPolicy}
            </button>
          </div>

          {/* Features List */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <h4 className="font-bold text-slate-800 mb-3">
              {translations.subscription.featureTitle}
            </h4>
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {translations.subscription.feature1}
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {translations.subscription.feature2}
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {translations.subscription.feature3}
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {translations.subscription.feature4}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionModal;
