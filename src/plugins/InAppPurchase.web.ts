import { WebPlugin } from '@capacitor/core';
import type { InAppPurchasePlugin, Product, PurchaseResult } from './definitions';

export class InAppPurchaseWeb extends WebPlugin implements InAppPurchasePlugin {
  async initialize(): Promise<void> {
    // Web 平台不支持，静默返回
    // 不输出任何日志，避免在开发环境产生噪音
  }

  async getProducts(options: { productIds: string[] }): Promise<{ products: Product[] }> {
    // Web 平台不支持，返回空数组
    return { products: [] };
  }

  async purchase(options: { productId: string }): Promise<PurchaseResult> {
    // Web 平台不支持，返回一个拒绝的 Promise，但错误会被上层捕获
    return Promise.reject({ code: 'UNIMPLEMENTED', message: 'Web platform not supported' });
  }

  async restorePurchases(): Promise<{ purchases: PurchaseResult[] }> {
    // Web 平台不支持，返回空数组
    return { purchases: [] };
  }

  async checkSubscriptionStatus(options: { productId: string }): Promise<{ isActive: boolean; expiryDate?: string }> {
    // Web 平台不支持，返回未激活状态
    return { isActive: false };
  }
}
