import { registerPlugin } from '@capacitor/core';

export interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  priceValue: number;
  currency: string;
  plan: 'monthly' | 'yearly';
}

export interface PurchaseResult {
  productId: string;
  transactionId: string;
  purchaseDate: string;
  expiryDate?: string;
}

export interface InAppPurchasePlugin {
  /**
   * 初始化内购服务
   */
  initialize(): Promise<void>;

  /**
   * 获取可用的产品列表
   */
  getProducts(options: { productIds: string[] }): Promise<{ products: Product[] }>;

  /**
   * 购买产品
   */
  purchase(options: { productId: string }): Promise<PurchaseResult>;

  /**
   * 恢复购买
   */
  restorePurchases(): Promise<{ purchases: PurchaseResult[] }>;

  /**
   * 检查订阅状态
   */
  checkSubscriptionStatus(options: {
    productId: string;
    skipRetry?: boolean;
  }): Promise<{ isActive: boolean; expiryDate?: string }>;
}

const InAppPurchase = registerPlugin<InAppPurchasePlugin>('InAppPurchase', {
  web: () => import('./InAppPurchase.web').then(m => new m.InAppPurchaseWeb()),
  // iOS 原生实现会自动通过 Capacitor 发现
});

export * from './definitions';
export { InAppPurchase };
