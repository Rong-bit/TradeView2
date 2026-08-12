// BillingBridge - Android Billing API 橋接器
// 處理 Web 端與 Android Native 端的通訊

declare global {
  interface Window {
    AndroidBilling?: {
      queryProducts: () => void;
      launchPurchaseFlow: (productId: string) => void;
      queryPurchases: () => void;
    };
    onBillingReady?: (data: string) => void;
    onBillingError?: (data: string) => void;
    onProductsLoaded?: (data: string) => void;
    onProductsError?: (data: string) => void;
    onPurchaseSuccess?: (data: string) => void;
    onPurchaseCanceled?: (data: string) => void;
    onPurchaseError?: (data: string) => void;
    onPurchasesLoaded?: (data: string) => void;
    onPurchasesError?: (data: string) => void;
  }
}

export interface Product {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceAmountMicros?: number;
}

export interface Purchase {
  orderId: string;
  purchaseToken: string;
  productIds: string[];
  purchaseTime: number;
  isAcknowledged: boolean;
}

export class BillingBridge {
  private static instance: BillingBridge;
  private isAndroid: boolean;
  private callbacks: Map<string, ((data: any) => void)[]> = new Map();

  private constructor() {
    // 檢測是否在 Android 環境中
    this.isAndroid = this.detectAndroid();
    this.setupCallbacks();
  }

  public static getInstance(): BillingBridge {
    if (!BillingBridge.instance) {
      BillingBridge.instance = new BillingBridge();
    }
    return BillingBridge.instance;
  }

  private detectAndroid(): boolean {
    // 檢測是否在 Android WebView 或 TWA 中
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('android') || 
           typeof window.AndroidBilling !== 'undefined' ||
           window.location.protocol === 'tradeview:';
  }

  private setupCallbacks(): void {
    // 設置全局回調函數供 Android 調用
    window.onBillingReady = (data: string) => {
      this.emit('billingReady', JSON.parse(data || '{}'));
    };

    window.onBillingError = (data: string) => {
      const error = JSON.parse(data || '{}');
      this.emit('billingError', error);
    };

    window.onProductsLoaded = (data: string) => {
      const result = JSON.parse(data || '{}');
      this.emit('productsLoaded', result);
    };

    window.onProductsError = (data: string) => {
      const error = JSON.parse(data || '{}');
      this.emit('productsError', error);
    };

    window.onPurchaseSuccess = (data: string) => {
      const purchase = JSON.parse(data || '{}');
      this.emit('purchaseSuccess', purchase);
    };

    window.onPurchaseCanceled = (data: string) => {
      this.emit('purchaseCanceled', JSON.parse(data || '{}'));
    };

    window.onPurchaseError = (data: string) => {
      const error = JSON.parse(data || '{}');
      this.emit('purchaseError', error);
    };

    window.onPurchasesLoaded = (data: string) => {
      const result = JSON.parse(data || '{}');
      this.emit('purchasesLoaded', result);
    };

    window.onPurchasesError = (data: string) => {
      const error = JSON.parse(data || '{}');
      this.emit('purchasesError', error);
    };
  }

  public on(event: string, callback: (data: any) => void): void {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event)!.push(callback);
  }

  public off(event: string, callback: (data: any) => void): void {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  public async queryProducts(): Promise<Product[]> {
    return new Promise((resolve, reject) => {
      if (!this.isAndroid || !window.AndroidBilling) {
        // 如果不在 Android 環境，使用 URL Scheme 方式
        this.useUrlScheme('queryProducts', {}, (result: any) => {
          if (result.products) {
            resolve(result.products);
          } else {
            reject(new Error(result.error || 'Failed to query products'));
          }
        });
        return;
      }

      const onProductsLoaded = (result: any) => {
        if (result.products) {
          resolve(result.products);
          window.onProductsLoaded = undefined;
          window.onProductsError = undefined;
        }
      };

      const onProductsError = (error: any) => {
        reject(new Error(error.error || 'Failed to query products'));
        window.onProductsLoaded = undefined;
        window.onProductsError = undefined;
      };

      window.onProductsLoaded = (data: string) => {
        onProductsLoaded(JSON.parse(data || '{}'));
      };

      window.onProductsError = (data: string) => {
        onProductsError(JSON.parse(data || '{}'));
      };

      try {
        window.AndroidBilling.queryProducts();
      } catch (error: any) {
        reject(error);
      }
    });
  }

  public async launchPurchaseFlow(productId: string): Promise<Purchase> {
    return new Promise((resolve, reject) => {
      if (!this.isAndroid || !window.AndroidBilling) {
        // 如果不在 Android 環境，使用 URL Scheme 方式
        this.useUrlScheme('launchPurchaseFlow', { productId }, (result: any) => {
          if (result.orderId) {
            resolve(result);
          } else {
            reject(new Error(result.error || 'Purchase failed'));
          }
        });
        return;
      }

      const onPurchaseSuccess = (purchase: any) => {
        resolve(purchase);
        window.onPurchaseSuccess = undefined;
        window.onPurchaseCanceled = undefined;
        window.onPurchaseError = undefined;
      };

      const onPurchaseCanceled = () => {
        reject(new Error('Purchase was canceled'));
        window.onPurchaseSuccess = undefined;
        window.onPurchaseCanceled = undefined;
        window.onPurchaseError = undefined;
      };

      const onPurchaseError = (error: any) => {
        reject(new Error(error.error || 'Purchase failed'));
        window.onPurchaseSuccess = undefined;
        window.onPurchaseCanceled = undefined;
        window.onPurchaseError = undefined;
      };

      window.onPurchaseSuccess = (data: string) => {
        onPurchaseSuccess(JSON.parse(data || '{}'));
      };

      window.onPurchaseCanceled = () => {
        onPurchaseCanceled();
      };

      window.onPurchaseError = (data: string) => {
        onPurchaseError(JSON.parse(data || '{}'));
      };

      try {
        window.AndroidBilling.launchPurchaseFlow(productId);
      } catch (error: any) {
        reject(error);
      }
    });
  }

  public async queryPurchases(): Promise<Purchase[]> {
    return new Promise((resolve, reject) => {
      if (!this.isAndroid || !window.AndroidBilling) {
        // 如果不在 Android 環境，使用 URL Scheme 方式
        this.useUrlScheme('queryPurchases', {}, (result: any) => {
          if (result.purchases) {
            resolve(result.purchases);
          } else {
            reject(new Error(result.error || 'Failed to query purchases'));
          }
        });
        return;
      }

      const onPurchasesLoaded = (result: any) => {
        if (result.purchases) {
          resolve(result.purchases);
          window.onPurchasesLoaded = undefined;
          window.onPurchasesError = undefined;
        }
      };

      const onPurchasesError = (error: any) => {
        reject(new Error(error.error || 'Failed to query purchases'));
        window.onPurchasesLoaded = undefined;
        window.onPurchasesError = undefined;
      };

      window.onPurchasesLoaded = (data: string) => {
        onPurchasesLoaded(JSON.parse(data || '{}'));
      };

      window.onPurchasesError = (data: string) => {
        onPurchasesError(JSON.parse(data || '{}'));
      };

      try {
        window.AndroidBilling.queryPurchases();
      } catch (error: any) {
        reject(error);
      }
    });
  }

  private useUrlScheme(action: string, data: any, callback: (result: any) => void): void {
    // 使用 URL Scheme 與 Android 通訊（適用於 CustomTabs 模式）
    const url = `tradeview://billing?action=${action}&data=${encodeURIComponent(JSON.stringify(data))}`;
    
    // 設置臨時監聽器來接收結果
    const listener = (event: MessageEvent) => {
      if (event.data && event.data.type === 'billingResponse') {
        callback(event.data.data);
        window.removeEventListener('message', listener);
      }
    };
    window.addEventListener('message', listener);
    
    // 嘗試打開 URL（會觸發 Android Intent）
    window.location.href = url;
    
    // 如果 URL Scheme 失敗，回退到 Promise 超時
    setTimeout(() => {
      window.removeEventListener('message', listener);
      callback({ error: 'Timeout: No response from Android' });
    }, 10000);
  }

  public isAvailable(): boolean {
    return this.isAndroid;
  }
}

export default BillingBridge.getInstance();

