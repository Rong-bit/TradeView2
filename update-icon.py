#!/usr/bin/env python3
"""
Android 應用圖示更新腳本
將源圖示文件轉換為 Android 所需的不同尺寸
"""

import os
from PIL import Image
import sys

# Android 圖示尺寸配置
ICON_SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

# 源圖示文件
SOURCE_ICON = 'TradeFolio_Icon_0 (1).png'
RES_DIR = 'app/src/main/res'

def resize_icon(source_path, output_path, size):
    """調整圖示大小並保存"""
    try:
        # 打開源圖像
        img = Image.open(source_path)
        
        # 轉換為 RGBA（支持透明背景）
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # 調整大小（使用高質量重採樣）
        img_resized = img.resize((size, size), Image.Resampling.LANCZOS)
        
        # 確保輸出目錄存在（如果路徑包含目錄）
        output_dir = os.path.dirname(output_path)
        if output_dir:  # 只有在有目錄路徑時才創建
            os.makedirs(output_dir, exist_ok=True)
        
        # 保存圖示
        img_resized.save(output_path, 'PNG', optimize=True)
        print(f"✅ 已生成: {output_path} ({size}x{size}px)")
        return True
    except Exception as e:
        print(f"❌ 錯誤: {output_path} - {e}")
        return False

def main():
    # 檢查源文件是否存在
    if not os.path.exists(SOURCE_ICON):
        print(f"❌ 找不到源圖示文件: {SOURCE_ICON}")
        print("請確保圖示文件在項目根目錄")
        sys.exit(1)
    
    print("========================================")
    print("Android 圖示更新工具")
    print("========================================")
    print(f"源圖示: {SOURCE_ICON}")
    print("")
    
    # 檢查源圖像
    try:
        source_img = Image.open(SOURCE_ICON)
        print(f"源圖像尺寸: {source_img.size[0]}x{source_img.size[1]}px")
        print(f"源圖像模式: {source_img.mode}")
        print("")
    except Exception as e:
        print(f"❌ 無法讀取源圖像: {e}")
        sys.exit(1)
    
    # 生成所有尺寸的圖示
    success_count = 0
    for folder, size in ICON_SIZES.items():
        output_path = os.path.join(RES_DIR, folder, 'ic_launcher.png')
        if resize_icon(SOURCE_ICON, output_path, size):
            success_count += 1
    
    print("")
    print("========================================")
    if success_count == len(ICON_SIZES):
        print(f"✅ 成功生成 {success_count} 個圖示文件")
        print("")
        print("下一步：")
        print("1. 檢查生成的圖示是否正確")
        print("2. 重新構建應用: gradlew.bat bundleRelease")
    else:
        print(f"⚠️  部分失敗：成功 {success_count}/{len(ICON_SIZES)}")
    print("========================================")
    
    # 生成 Google Play Store 圖示（512x512）
    store_icon_path = 'store_icon.png'
    if resize_icon(SOURCE_ICON, store_icon_path, 512):
        print(f"✅ 已生成 Google Play Store 圖示: {store_icon_path}")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n操作已取消")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 發生錯誤: {e}")
        sys.exit(1)

