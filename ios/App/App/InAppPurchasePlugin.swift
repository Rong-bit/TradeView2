import Foundation
import Capacitor
import StoreKit

@objc(InAppPurchasePlugin)
public class InAppPurchasePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InAppPurchasePlugin"
    public let jsName = "InAppPurchase"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkSubscriptionStatus", returnType: CAPPluginReturnPromise),
    ]

    // StoreKit 1 兼容性支持（iOS 15 以下）
    private var productRequest: SKProductsRequest?
    private var products: [String: SKProduct] = [:]
    private var purchaseCallbacks: [String: CAPPluginCall] = [:]
    
    // StoreKit 2 產品快取（使用Any類型以避免@available問題）
    private var storeKit2Products: [String: Any] = [:]
    
    /// 是否已啟動 Transaction.updates 監聽（僅啟動一次）
    private static var transactionUpdatesTaskStarted = false
    
    @objc func initialize(_ call: CAPPluginCall) {
        // StoreKit 2 不需要显式初始化
        // 但我们需要注册支付队列观察者（用于 StoreKit 1 兼容）
        if #available(iOS 15.0, *) {
            // 依 Apple 建議：在啟動時監聽 Transaction.updates，避免漏掉非同步完成的購買
            if !Self.transactionUpdatesTaskStarted {
                Self.transactionUpdatesTaskStarted = true
                Task { await listenForTransactionUpdates() }
            }
            call.resolve([:])
        } else {
            // StoreKit 1 需要注册观察者
            SKPaymentQueue.default().add(self)
            call.resolve([:])
        }
    }
    
    /// 監聽 StoreKit 2 交易更新（在 App 啟動時呼叫，避免漏掉成功購買）
    @available(iOS 15.0, *)
    private func listenForTransactionUpdates() async {
        for await result in Transaction.updates {
            switch result {
            case .verified(let transaction):
                // 驗證通過：完成交易，避免重複遞送
                await transaction.finish()
                // 可選：通知前端刷新訂閱狀態
                Task { @MainActor in
                    self.notifyListeners("transactionUpdated", data: [
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id)
                    ])
                }
            case .unverified:
                break
            }
        }
    }
    
    @objc func getProducts(_ call: CAPPluginCall) {
        // Capacitor 插件方法接收的参数格式：getProducts({ productIds: string[] })
        // 从 options 中获取 productIds 数组
        var productIdsArray: [String]? = nil
        
        // 方式1：从 options 中获取数组
        if let ids = call.options["productIds"] as? [String] {
            productIdsArray = ids
        }
        // 方式2：从 options 中获取 NSArray 并转换
        else if let ids = call.options["productIds"] as? NSArray {
            productIdsArray = ids.compactMap { $0 as? String }
        }
        
        guard let productIds = productIdsArray, !productIds.isEmpty else {
            call.reject("產品 ID 列表無效或為空")
            return
        }
        
        if #available(iOS 15.0, *) {
            // 使用 StoreKit 2
            Task { @MainActor in
                do {
                    let products = try await Product.products(for: productIds)
                    
                    var result: [[String: Any]] = []
                    
                    for product in products {
                        // 快取產品
                        self.storeKit2Products[product.id] = product
                        
                        // StoreKit 2 沒有 priceLocale，使用格式化樣式的 locale
                        let currencyCode = product.priceFormatStyle.locale.currencyCode ?? Locale.current.currencyCode ?? "USD"
                        
                        var productDict: [String: Any] = [
                            "id": product.id,
                            "title": product.displayName,
                            "description": product.description,
                            "price": product.displayPrice,
                            "priceValue": Double(truncating: product.price as NSNumber),
                            "currency": currencyCode
                        ]
                        
                        // 判断是月订阅还是年订阅
                        if product.id.contains("monthly") {
                            productDict["plan"] = "monthly"
                        } else if product.id.contains("yearly") {
                            productDict["plan"] = "yearly"
                        }
                        
                        result.append(productDict)
                    }
                    
                    call.resolve(["products": result])
                } catch {
                    call.reject("取得產品失敗: \(error.localizedDescription)")
                }
            }
        } else {
            // 使用 StoreKit 1（iOS 15 以下）
            let productIdSet = Set(productIds)
            let request = SKProductsRequest(productIdentifiers: productIdSet)
            request.delegate = self
            self.productRequest = request
            
            request.start()
            objc_setAssociatedObject(request, "pluginCall", call, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }
    
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("產品 ID 無效")
            return
        }
        
        if #available(iOS 15.0, *) {
            // 使用 StoreKit 2
            Task { @MainActor in
                do {
                    // 取得產品（如果未快取，則重新取得）
                    var product: Product
                    if let cachedProduct = self.storeKit2Products[productId] as? Product {
                        product = cachedProduct
                    } else {
                        let products = try await Product.products(for: [productId])
                        guard let foundProduct = products.first else {
                            call.reject("產品未找到（productId: \(productId)）")
                            return
                        }
                        product = foundProduct
                        self.storeKit2Products[productId] = product
                    }
                    
                    // 發起購買
                    let result = try await product.purchase()
                    
                    switch result {
                    case .success(let verification):
                        // 驗證交易
                        switch verification {
                        case .verified(let transaction):
                            // 取得訂閱到期日期
                            var expiryDate: String? = nil
                            if let expirationDate = transaction.expirationDate {
                                let formatter = ISO8601DateFormatter()
                                expiryDate = formatter.string(from: expirationDate)
                            }
                            
                            let formatter = ISO8601DateFormatter()
                            call.resolve([
                                "productId": transaction.productID,
                                "transactionId": String(transaction.id),
                                "purchaseDate": formatter.string(from: transaction.purchaseDate),
                                "expiryDate": expiryDate as Any
                            ])
                            
                            // 完成交易
                            await transaction.finish()
                            
                        case .unverified(_, let error):
                            call.reject("交易驗證失敗: \(error.localizedDescription)")
                        }
                        
                    case .userCancelled:
                        call.reject("使用者取消購買")
                        
                    case .pending:
                        call.reject("購買待處理（需要家長批准）")
                        
                    @unknown default:
                        call.reject("未知的購買結果")
                    }
                } catch {
                    call.reject("購買失敗: \(error.localizedDescription)")
                }
            }
        } else {
            // 使用 StoreKit 1（iOS 15 以下）
            guard let product = products[productId] else {
                call.reject("產品未找到，請先呼叫 getProducts")
                return
            }
            
            purchaseCallbacks[productId] = call
            let payment = SKPayment(product: product)
            SKPaymentQueue.default().add(payment)
        }
    }
    
    /// 從 StoreKit 2 currentEntitlements 檢查指定產品的訂閱是否有效（用於 checkSubscriptionStatus 與重試）
    @available(iOS 15.0, *)
    private static func checkEntitlement(productId: String) async -> (isActive: Bool, expiryDateString: String?) {
        var isActive = false
        var expiryDateString: String? = nil
        let now = Date()
        let formatter = ISO8601DateFormatter()
        
        for await result in Transaction.currentEntitlements {
            switch result {
            case .verified(let transaction):
                if transaction.productID == productId {
                    if let expirationDate = transaction.expirationDate {
                        if expirationDate > now {
                            isActive = true
                            expiryDateString = formatter.string(from: expirationDate)
                            return (isActive, expiryDateString)
                        }
                    } else {
                        let purchaseDate = transaction.purchaseDate
                        let daysSincePurchase = Calendar.current.dateComponents([.day], from: purchaseDate, to: now).day ?? 0
                        if daysSincePurchase < 365 {
                            isActive = true
                            return (isActive, expiryDateString)
                        }
                    }
                }
            case .unverified:
                continue
            }
        }
        return (isActive, expiryDateString)
    }
    
    @objc func restorePurchases(_ call: CAPPluginCall) {
        if #available(iOS 15.0, *) {
            // 使用 StoreKit 2
            Task { @MainActor in
                var purchases: [[String: Any]] = []
                
                // 取得所有目前授權（包括訂閱）
                for await result in Transaction.currentEntitlements {
                    switch result {
                    case .verified(let transaction):
                        let formatter = ISO8601DateFormatter()
                        var purchaseDict: [String: Any] = [
                            "productId": transaction.productID,
                            "transactionId": String(transaction.id),
                            "purchaseDate": formatter.string(from: transaction.purchaseDate)
                        ]
                        
                        if let expirationDate = transaction.expirationDate {
                            purchaseDict["expiryDate"] = formatter.string(from: expirationDate)
                        }
                        
                        purchases.append(purchaseDict)
                        
                    case .unverified:
                        // 跳過未驗證的交易，繼續檢查下一個
                        continue
                    }
                }
                
                call.resolve(["purchases": purchases])
            }
        } else {
            // 使用 StoreKit 1（iOS 15 以下）
            SKPaymentQueue.default().restoreCompletedTransactions()
            objc_setAssociatedObject(SKPaymentQueue.default(), "restoreCall", call, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }
    
    @objc func checkSubscriptionStatus(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("產品 ID 無效")
            return
        }
        let skipRetry = call.getBool("skipRetry") ?? false
        
        if #available(iOS 15.0, *) {
            // 使用 StoreKit 2 檢查訂閱狀態（沙盒環境 currentEntitlements 可能有數秒延遲，故加入重試）
            Task { @MainActor in
                var (isActive, expiryDateString) = await Self.checkEntitlement(productId: productId)
                
                // 若未找到授權，短暫延遲後重試（因應 StoreKit 沙盒延遲，最多重試兩次）
                if !isActive && !skipRetry {
                    try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5 秒
                    (isActive, expiryDateString) = await Self.checkEntitlement(productId: productId)
                }
                if !isActive && !skipRetry {
                    try? await Task.sleep(nanoseconds: 2_000_000_000) // 再等 2 秒
                    (isActive, expiryDateString) = await Self.checkEntitlement(productId: productId)
                }
                
                if isActive, let expiryDate = expiryDateString {
                    call.resolve([
                        "isActive": true,
                        "expiryDate": expiryDate
                    ])
                } else {
                    call.resolve(["isActive": false])
                }
            }
        } else {
            // iOS 15 以下使用传统方法
            // 檢查本地收據（需要伺服器驗證才能準確判斷）
            // 這裡簡化處理，返回 false
            // 實際應用中應該發送收據到伺服器驗證
            call.resolve(["isActive": false])
        }
    }
    
    public override func load() {
        // 只在 iOS 15 以下注册支付队列观察者
        if #available(iOS 15.0, *) {
            // StoreKit 2 不需要手动注册观察者
        } else {
            SKPaymentQueue.default().add(self)
        }
    }
    
    deinit {
        if #available(iOS 15.0, *) {
            // StoreKit 2 不需要手动移除观察者
        } else {
            SKPaymentQueue.default().remove(self)
        }
    }
}

// MARK: - SKProductsRequestDelegate
extension InAppPurchasePlugin: SKProductsRequestDelegate {
    public func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse) {
        var result: [[String: Any]] = []
        
        for product in response.products {
            self.products[product.productIdentifier] = product
            
            let formatter = NumberFormatter()
            formatter.numberStyle = .currency
            formatter.locale = product.priceLocale
            
            var productDict: [String: Any] = [
                "id": product.productIdentifier,
                "title": product.localizedTitle,
                "description": product.localizedDescription,
                "price": formatter.string(from: product.price) ?? "",
                "priceValue": product.price.doubleValue,
                "currency": product.priceLocale.currencyCode ?? "USD"
            ]
            
            // 判断是月订阅还是年订阅
            if product.productIdentifier.contains("monthly") {
                productDict["plan"] = "monthly"
            } else if product.productIdentifier.contains("yearly") {
                productDict["plan"] = "yearly"
            }
            
            result.append(productDict)
        }
        
        // 取得保存的 call
        if let call = objc_getAssociatedObject(request, "pluginCall") as? CAPPluginCall {
            call.resolve(["products": result])
            objc_setAssociatedObject(request, "pluginCall", nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }
    
    public func request(_ request: SKRequest, didFailWithError error: Error) {
        if let call = objc_getAssociatedObject(request, "pluginCall") as? CAPPluginCall {
            call.reject("取得產品失敗: \(error.localizedDescription)")
            objc_setAssociatedObject(request, "pluginCall", nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }
}

// MARK: - SKPaymentTransactionObserver
extension InAppPurchasePlugin: SKPaymentTransactionObserver {
    public func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        for transaction in transactions {
            switch transaction.transactionState {
            case .purchased:
                handlePurchased(transaction)
            case .failed:
                handleFailed(transaction)
            case .restored:
                handleRestored(transaction)
            case .deferred:
                // 購買被延遲（例如需要家長批准）
                break
            case .purchasing:
                // 購買進行中
                break
            @unknown default:
                break
            }
        }
    }
    
    private func handlePurchased(_ transaction: SKPaymentTransaction) {
        let productId = transaction.payment.productIdentifier
        
        // StoreKit 1 無法直接取得訂閱到期日期
        // 需要伺服器驗證收據才能取得準確的到期日期
        // 這裡返回基本購買資訊
        let formatter = ISO8601DateFormatter()
        let result: [String: Any] = [
            "productId": productId,
            "transactionId": transaction.transactionIdentifier ?? "",
            "purchaseDate": formatter.string(from: transaction.transactionDate ?? Date())
        ]
        
        if let call = purchaseCallbacks[productId] {
            call.resolve(result)
            purchaseCallbacks.removeValue(forKey: productId)
        }
        
        SKPaymentQueue.default().finishTransaction(transaction)
    }
    
    private func handleFailed(_ transaction: SKPaymentTransaction) {
        let productId = transaction.payment.productIdentifier
        
        if let call = purchaseCallbacks[productId] {
            if let error = transaction.error as? SKError {
                call.reject("購買失敗: \(error.localizedDescription)")
            } else {
                call.reject("購買失敗")
            }
            purchaseCallbacks.removeValue(forKey: productId)
        }
        
        SKPaymentQueue.default().finishTransaction(transaction)
    }
    
    private func handleRestored(_ transaction: SKPaymentTransaction) {
        let productId = transaction.original?.payment.productIdentifier ?? transaction.payment.productIdentifier
        
        let formatter = ISO8601DateFormatter()
        let result: [String: Any] = [
            "productId": productId,
            "transactionId": transaction.transactionIdentifier ?? "",
            "purchaseDate": formatter.string(from: transaction.transactionDate ?? Date())
        ]
        
        // 收集所有恢復的購買
        if var purchases = objc_getAssociatedObject(SKPaymentQueue.default(), "restoredPurchases") as? [[String: Any]] {
            purchases.append(result)
            objc_setAssociatedObject(SKPaymentQueue.default(), "restoredPurchases", purchases, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        } else {
            objc_setAssociatedObject(SKPaymentQueue.default(), "restoredPurchases", [result], .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
        
        SKPaymentQueue.default().finishTransaction(transaction)
    }
    
    public func paymentQueueRestoreCompletedTransactionsFinished(_ queue: SKPaymentQueue) {
        if let call = objc_getAssociatedObject(queue, "restoreCall") as? CAPPluginCall {
            if let purchases = objc_getAssociatedObject(queue, "restoredPurchases") as? [[String: Any]] {
                call.resolve(["purchases": purchases])
            } else {
                call.resolve(["purchases": []])
            }
            objc_setAssociatedObject(queue, "restoreCall", nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
            objc_setAssociatedObject(queue, "restoredPurchases", nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }
    
    public func paymentQueue(_ queue: SKPaymentQueue, restoreCompletedTransactionsFailedWithError error: Error) {
        if let call = objc_getAssociatedObject(queue, "restoreCall") as? CAPPluginCall {
            call.reject("恢復購買失敗: \(error.localizedDescription)")
            objc_setAssociatedObject(queue, "restoreCall", nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }
}
