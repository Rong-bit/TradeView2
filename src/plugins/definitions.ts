export interface InAppPurchasePlugin {
  initialize(): Promise<void>;
  getProducts(options: { productIds: string[] }): Promise<{ products: Product[] }>;
  purchase(options: { productId: string }): Promise<PurchaseResult>;
  restorePurchases(): Promise<{ purchases: PurchaseResult[] }>;
  checkSubscriptionStatus(options: {
    productId: string;
    skipRetry?: boolean;
  }): Promise<{ isActive: boolean; expiryDate?: string }>;
}

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
