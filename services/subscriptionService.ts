import { Capacitor } from '@capacitor/core';
import { SubscriptionInfo, SubscriptionStatus, SubscriptionPlan, SubscriptionProduct } from '../types';
import { InAppPurchase } from '../src/plugins/InAppPurchase';
import { formatSubscriptionDisplayPrice } from '../utils/formatDisplay';

// 產品 ID 配置
export const PRODUCT_IDS = {
  MONTHLY: 'tradeview_monthly',
  YEARLY: 'tradeview_yearly'
} as const;

export function getPurchaseErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.errorMessage === 'string') return record.errorMessage;
    if (typeof record.message === 'string') return record.message;
  }
  return String(error);
}

export function isPurchaseUserCancelled(error: unknown): boolean {
  const msg = getPurchaseErrorMessage(error).toLowerCase();
  return (
    msg.includes('使用者取消') ||
    msg.includes('user cancel') ||
    msg.includes('user cancelled') ||
    msg.includes('canceled') ||
    msg.includes('cancelled')
  );
}

const DEFAULT_PRODUCTS: SubscriptionProduct[] = [
  {
    id: PRODUCT_IDS.MONTHLY,
    title: '月訂閱',
    description: '每月訂閱，解鎖所有功能',
    price: formatSubscriptionDisplayPrice(60, 'TWD'),
    priceValue: 60,
    currency: 'TWD',
    plan: 'monthly',
  },
  {
    id: PRODUCT_IDS.YEARLY,
    title: '年訂閱',
    description: '每年訂閱，享受更優惠的價格',
    price: formatSubscriptionDisplayPrice(590, 'TWD'),
    priceValue: 590,
    currency: 'TWD',
    plan: 'yearly',
  },
];

function withFormattedPrice(product: SubscriptionProduct): SubscriptionProduct {
  return {
    ...product,
    price: formatSubscriptionDisplayPrice(product.priceValue, product.currency),
  };
}

/** 畫面固定月制在上、年制在下（StoreKit 回傳順序不保證與請求一致） */
function sortSubscriptionProducts(products: SubscriptionProduct[]): SubscriptionProduct[] {
  return [...products].sort((a, b) => {
    if (a.plan === b.plan) return a.id.localeCompare(b.id);
    return a.plan === 'monthly' ? -1 : 1;
  });
}

// 訂閱狀態儲存鍵
const STORAGE_KEYS = {
  SUBSCRIPTION_INFO: 'tf_subscription_info',
  LAST_CHECK: 'tf_subscription_last_check'
} as const;

/** 啟動後短時間內不重複查 StoreKit（秒） */
const QUICK_REFRESH_TTL_MS = 30_000;

function parseAppleDate(value: string | Date | undefined | null): Date | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return !isNaN(d.getTime()) ? d : undefined;
}

function isSubscriptionExpired(info: SubscriptionInfo | null | undefined): boolean {
  if (!info?.expiryDate) return false;
  return new Date() > info.expiryDate;
}

class SubscriptionService {
  private isInitialized = false;
  private products: SubscriptionProduct[] = [];
  private refreshInFlight: Promise<SubscriptionInfo | null> | null = null;
  private quickRefreshCache: { at: number; result: SubscriptionInfo | null } | null = null;

  private invalidateQuickRefreshCache(): void {
    this.quickRefreshCache = null;
  }

  /**
   * 初始化訂閱服務
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const platform = Capacitor.getPlatform();
    
    // 直接嘗試初始化，如果失敗就靜默處理
    // 不預先檢查平台支持，避免重複調用導致多次錯誤
    if (platform === 'ios') {
      await this.initializeIOS();
    } else if (platform === 'android') {
      await this.initializeAndroid();
    } else {
      // Web 平台：靜默跳過，不輸出任何日誌
    }

    // 載入本地儲存的訂閱狀態
    await this.loadSubscriptionStatus();
    
    this.isInitialized = true;
  }

  /**
   * 初始化 iOS 內購
   */
  private async initializeIOS(): Promise<void> {
    try {
      // 检查是否在真实设备上（模拟器可能不支持）
      const platform = Capacitor.getPlatform();
      if (platform !== 'ios') {
        return;
      }
      
      await InAppPurchase.initialize();
      // 只在成功时记录，避免在开发环境产生噪音
    } catch (error: any) {
      // 在Web平台、模擬器或開發環境中，UNIMPLEMENTED錯誤是正常的，靜默處理
      const errorCode = error?.code || '';
      const errorMessage = error?.message || '';
      
      if (errorCode === 'UNIMPLEMENTED' || 
          errorMessage.includes('not implemented') ||
          errorMessage.includes('UNIMPLEMENTED') ||
          errorMessage.includes('Web platform not supported')) {
        // 完全靜默，不輸出任何日誌，避免Capacitor日誌系統記錄為錯誤
        return;
      }
      // 只有真正的錯誤才記錄（但在开发环境也尽量少输出）
      // console.error('iOS 內購初始化失敗:', error);
      // 不拋出錯誤，讓應用繼續運行
    }
  }

  /**
   * 初始化 Android 內購（需要原生實現）
   */
  private async initializeAndroid(): Promise<void> {
    // TODO: 實現 Google Play Billing 初始化
    // 需要使用 Capacitor 插件或原生代碼橋接
    // 參考：https://developer.android.com/google/play/billing
    
    try {
      // 這裡應該調用原生 Android 代碼來初始化 BillingClient
      // 例如：await Capacitor.Plugins.PlayBilling.initialize()
    } catch (error) {
      console.error('Android 內購初始化失敗:', error);
    }
  }

  /**
   * 獲取可用的訂閱產品列表
   */
  getCachedProducts(): SubscriptionProduct[] {
    return sortSubscriptionProducts(this.products.length > 0 ? this.products : DEFAULT_PRODUCTS);
  }

  /**
   * 獲取可用的訂閱產品列表
   */
  async getProducts(): Promise<SubscriptionProduct[]> {
    if (this.products.length > 0) {
      return sortSubscriptionProducts(this.products);
    }

    const platform = Capacitor.getPlatform();
    
    if (platform === 'ios') {
      this.products = sortSubscriptionProducts(await this.getIOSProducts());
    } else if (platform === 'android') {
      this.products = sortSubscriptionProducts(await this.getAndroidProducts());
    } else {
      // Web 平台：返回模擬產品
      this.products = sortSubscriptionProducts(DEFAULT_PRODUCTS);
    }

    return this.products;
  }

  /**
   * 獲取 iOS 產品列表
   */
  private async getIOSProducts(): Promise<SubscriptionProduct[]> {
    try {
      const result = await InAppPurchase.getProducts({
        productIds: [
          PRODUCT_IDS.MONTHLY, 
          PRODUCT_IDS.YEARLY
        ]
      });
      
      // 如果產品列表為空，使用默認產品列表（產品可能尚未在 App Store Connect 創建或審核）
      if (!result.products || result.products.length === 0) {
        return sortSubscriptionProducts(DEFAULT_PRODUCTS);
      }
      
      return sortSubscriptionProducts(
        result.products.map(product =>
          withFormattedPrice({
            id: product.id,
            title: product.title,
            description: product.description,
            price: product.price,
            priceValue: product.priceValue,
            currency: product.currency,
            plan: product.plan,
          })
        )
      );
    } catch (error) {
      console.error('獲取 iOS 產品失敗:', error);
      return sortSubscriptionProducts(DEFAULT_PRODUCTS);
    }
  }

  /**
   * 獲取 Android 產品列表（需要原生實現）
   */
  private async getAndroidProducts(): Promise<SubscriptionProduct[]> {
    // TODO: 實現 Google Play Billing 產品查詢
    // 需要從 Google Play Console 獲取產品資訊
    
    // 模擬返回（實際應該從 BillingClient 獲取）
    return [
      withFormattedPrice({
        id: PRODUCT_IDS.MONTHLY,
        title: '月訂閱',
        description: '每月 NT$60',
        price: '',
        priceValue: 60,
        currency: 'TWD',
        plan: 'monthly',
      }),
      withFormattedPrice({
        id: PRODUCT_IDS.YEARLY,
        title: '年訂閱',
        description: '每年 NT$590',
        price: '',
        priceValue: 590,
        currency: 'TWD',
        plan: 'yearly',
      }),
    ];
  }

  /**
   * 購買訂閱
   */
  async purchase(productId: string): Promise<SubscriptionInfo> {
    const platform = Capacitor.getPlatform();
    
    if (platform === 'ios') {
      return await this.purchaseIOS(productId);
    } else if (platform === 'android') {
      return await this.purchaseAndroid(productId);
    } else {
      throw new Error('訂閱功能僅在 iOS 和 Android 應用中可用');
    }
  }

  /**
   * iOS 購買
   */
  private async purchaseIOS(productId: string): Promise<SubscriptionInfo> {
    const id = typeof productId === 'string' ? productId : String(productId);
    try {
      const purchaseResult = await InAppPurchase.purchase({ productId: id });

      // 購買完成後以 StoreKit 授權為準（沙盒常有數秒延遲），避免沿用舊快取日期
      const refreshed = await this.refreshSubscriptionFromStore(id);
      if (refreshed && refreshed.productId === id) {
        return refreshed;
      }

      // 沙盒延遲：entitlements 尚未出現年制時，先用本次購買回傳的到期日
      if (purchaseResult.expiryDate) {
        const plan: SubscriptionPlan = id === PRODUCT_IDS.MONTHLY ? 'monthly' : 'yearly';
        const info = this.buildSubscriptionInfo({
          productId: id,
          plan,
          expiryDate: parseAppleDate(purchaseResult.expiryDate),
        });
        this.saveSubscriptionStatus(info);
        return info;
      }

      if (refreshed) {
        return refreshed;
      }

      throw new Error('購買完成但無法取得訂閱到期日，請稍後點「恢復購買」');
    } catch (error) {
      if (!isPurchaseUserCancelled(error)) {
        console.error('iOS 購買失敗:', error);
      }
      throw error;
    }
  }

  /**
   * Android 購買（需要原生實現）
   */
  private async purchaseAndroid(productId: string): Promise<SubscriptionInfo> {
    // TODO: 實現 Google Play Billing 購買流程
    // 1. 調用 BillingClient.launchBillingFlow()
    // 2. 等待購買結果
    // 3. 驗證購買令牌
    // 4. 更新訂閱狀態
    
    throw new Error('Android 購買功能需要原生實現');
  }

  /**
   * 恢復購買
   */
  async restorePurchases(): Promise<SubscriptionInfo | null> {
    const platform = Capacitor.getPlatform();
    
    if (platform === 'ios') {
      return await this.restoreIOSPurchases();
    } else if (platform === 'android') {
      return await this.restoreAndroidPurchases();
    } else {
      // Web 平台：從本地儲存恢復
      return this.loadSubscriptionStatus();
    }
  }

  /**
   * iOS 恢復購買
   */
  private async restoreIOSPurchases(): Promise<SubscriptionInfo | null> {
    try {
      await InAppPurchase.restorePurchases();
      return await this.refreshSubscriptionFromStore();
    } catch (error) {
      console.error('iOS 恢復購買失敗:', error);
      return null;
    }
  }

  /**
   * Android 恢復購買（需要原生實現）
   */
  private async restoreAndroidPurchases(): Promise<SubscriptionInfo | null> {
    // TODO: 實現 Google Play Billing 恢復購買
    // 需要查詢 Google Play 的購買歷史
    
    return null;
  }

  /**
   * 從 StoreKit 重新讀取訂閱（含重試，購買後 / 恢復購買時使用 full；開啟訂閱頁使用 quick）
   */
  async refreshSubscriptionFromStore(
    preferredProductId?: string,
    options?: { mode?: 'full' | 'quick' }
  ): Promise<SubscriptionInfo | null> {
    const platform = Capacitor.getPlatform();
    if (platform !== 'ios') {
      return this.loadSubscriptionStatus();
    }

    const mode = options?.mode ?? 'full';
    if (mode === 'quick' && this.quickRefreshCache) {
      if (Date.now() - this.quickRefreshCache.at < QUICK_REFRESH_TTL_MS) {
        return this.quickRefreshCache.result;
      }
      this.quickRefreshCache = null;
    }

    const run = async (): Promise<SubscriptionInfo | null> => {
      const delays = mode === 'quick' ? [0] : [0, 1500, 3000];
      const skipRetry = mode === 'quick';

      for (const delay of delays) {
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        const [monthlyStatus, yearlyStatus] = await Promise.all([
          InAppPurchase.checkSubscriptionStatus({ productId: PRODUCT_IDS.MONTHLY, skipRetry }),
          InAppPurchase.checkSubscriptionStatus({ productId: PRODUCT_IDS.YEARLY, skipRetry }),
        ]);
        const picked = this.pickActiveSubscription(monthlyStatus, yearlyStatus, preferredProductId);
        if (picked) {
          this.saveSubscriptionStatus(picked);
          return picked;
        }
      }
      return null;
    };

    if (mode === 'quick' && this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const promise = run();
    if (mode === 'quick') {
      this.refreshInFlight = promise;
      promise
        .then(result => {
          this.quickRefreshCache = { at: Date.now(), result };
        })
        .finally(() => {
          if (this.refreshInFlight === promise) {
            this.refreshInFlight = null;
          }
        });
    }
    return promise;
  }

  private pickActiveSubscription(
    monthlyStatus: { isActive: boolean; expiryDate?: string },
    yearlyStatus: { isActive: boolean; expiryDate?: string },
    preferredProductId?: string
  ): SubscriptionInfo | null {
    type Candidate = { productId: string; plan: SubscriptionPlan; expiryDate?: Date };
    const candidates: Candidate[] = [];

    if (monthlyStatus.isActive) {
      candidates.push({
        productId: PRODUCT_IDS.MONTHLY,
        plan: 'monthly',
        expiryDate: parseAppleDate(monthlyStatus.expiryDate),
      });
    }
    if (yearlyStatus.isActive) {
      candidates.push({
        productId: PRODUCT_IDS.YEARLY,
        plan: 'yearly',
        expiryDate: parseAppleDate(yearlyStatus.expiryDate),
      });
    }
    if (candidates.length === 0) return null;

    if (preferredProductId) {
      const preferred = candidates.find(c => c.productId === preferredProductId);
      if (preferred) {
        return this.buildSubscriptionInfo(preferred);
      }
    }

    // 月制與年制同時有效時（升級過渡期），優先顯示年制
    if (candidates.length > 1) {
      const yearly = candidates.find(c => c.plan === 'yearly');
      if (yearly) {
        return this.buildSubscriptionInfo(yearly);
      }
    }

    // 僅一筆有效訂閱，或需比較到期日時
    candidates.sort((a, b) => {
      const aTime = a.expiryDate?.getTime() ?? 0;
      const bTime = b.expiryDate?.getTime() ?? 0;
      return bTime - aTime;
    });
    return this.buildSubscriptionInfo(candidates[0]);
  }

  private buildSubscriptionInfo(candidate: {
    productId: string;
    plan: SubscriptionPlan;
    expiryDate?: Date;
  }): SubscriptionInfo {
    const info: SubscriptionInfo = {
      status: 'active',
      plan: candidate.plan,
      expiryDate: candidate.expiryDate,
      productId: candidate.productId,
      platform: 'ios',
    };
    if (isSubscriptionExpired(info)) {
      info.status = 'expired';
    }
    return info;
  }

  /**
   * 檢查訂閱狀態
   */
  async checkSubscriptionStatus(): Promise<SubscriptionInfo> {
    const platform = Capacitor.getPlatform();
    
    // 如果是 iOS 平台，從 StoreKit 驗證
    if (platform === 'ios') {
      try {
        const refreshed = await this.refreshSubscriptionFromStore(undefined, { mode: 'quick' });
        if (refreshed) {
          return refreshed;
        }
      } catch (error: any) {
        // 在Web平台、模擬器或開發環境中，UNIMPLEMENTED錯誤是正常的，靜默處理
        const errorCode = error?.code || '';
        const errorMessage = error?.message || '';
        
        if (errorCode === 'UNIMPLEMENTED' || 
            errorMessage.includes('not implemented') ||
            errorMessage.includes('UNIMPLEMENTED') ||
            errorMessage.includes('Web platform not supported')) {
          // 完全靜默，不輸出任何日誌，避免Capacitor日誌系統記錄為錯誤
          // 直接返回本地儲存的狀態或默認狀態
        } else {
          // 只有真正的錯誤才記錄（但在开发环境也尽量少输出）
          // console.error('檢查 iOS 訂閱狀態失敗:', error);
        }
      }
    }
    
    // 從本地儲存載入
    let subscriptionInfo = this.loadSubscriptionStatus();
    
    // 檢查是否過期
    if (subscriptionInfo && subscriptionInfo.expiryDate) {
      const now = new Date();
      if (now > subscriptionInfo.expiryDate) {
        subscriptionInfo.status = 'expired';
        this.saveSubscriptionStatus(subscriptionInfo);
      }
    }
    
    return subscriptionInfo || {
      status: 'none',
      platform: platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'web'
    };
  }

  resolveStoredSubscriptionActive(): SubscriptionInfo | null {
    const stored = this.getStoredSubscriptionSync();
    if (!stored || stored.status !== 'active') return null;
    if (stored.expiryDate && new Date() > stored.expiryDate) return null;
    return stored;
  }

  /**
   * 同步讀取本地儲存的訂閱狀態（供訂閱畫面立即顯示用，不呼叫原生）
   */
  getStoredSubscriptionSync(): SubscriptionInfo | null {
    return this.loadSubscriptionStatus();
  }

  /**
   * 載入本地儲存的訂閱狀態
   */
  private loadSubscriptionStatus(): SubscriptionInfo | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTION_INFO);
      if (!stored) return null;
      
      const info = JSON.parse(stored);
      info.expiryDate = parseAppleDate(info.expiryDate);
      if (isSubscriptionExpired(info)) {
        info.status = 'expired';
      }
      return info;
    } catch (error) {
      console.error('載入訂閱狀態失敗:', error);
      return null;
    }
  }

  /**
   * 儲存訂閱狀態到本地
   */
  private saveSubscriptionStatus(info: SubscriptionInfo): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_INFO, JSON.stringify(info));
      localStorage.setItem(STORAGE_KEYS.LAST_CHECK, new Date().toISOString());
      this.invalidateQuickRefreshCache();
    } catch (error) {
      console.error('儲存訂閱狀態失敗:', error);
    }
  }

  /**
   * 更新訂閱狀態（購買成功後調用）
   */
  updateSubscriptionStatus(
    productId: string,
    transactionId: string,
    expiryDate: Date
  ): void {
    const platform = Capacitor.getPlatform();
    const plan: SubscriptionPlan = productId === PRODUCT_IDS.MONTHLY ? 'monthly' : 'yearly';
    
    const subscriptionInfo: SubscriptionInfo = {
      status: 'active',
      plan,
      expiryDate,
      productId,
      transactionId,
      platform: platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'web'
    };
    
    this.saveSubscriptionStatus(subscriptionInfo);
  }

  /**
   * 檢查是否已訂閱
   */
  async isSubscribed(): Promise<boolean> {
    const status = await this.checkSubscriptionStatus();
    return status.status === 'active';
  }

  /**
   * 獲取當前訂閱資訊
   */
  async getCurrentSubscription(): Promise<SubscriptionInfo | null> {
    const status = await this.checkSubscriptionStatus();
    return status.status === 'active' ? status : null;
  }
}

// 導出單例實例
export const subscriptionService = new SubscriptionService();
