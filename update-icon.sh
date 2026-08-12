#!/bin/bash
# Android 圖示更新腳本 (Linux/Mac)
# 需要安裝 Python 和 Pillow 庫

echo "========================================"
echo "Android 圖示更新工具"
echo "========================================"
echo ""

# 檢查 Python 是否安裝
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到 Python3，請先安裝 Python"
    echo ""
    echo "安裝方法："
    echo "  Ubuntu/Debian: sudo apt-get install python3 python3-pip"
    echo "  macOS: brew install python3"
    echo "  然後安裝 Pillow: pip3 install Pillow"
    exit 1
fi

# 檢查 Pillow 是否安裝
python3 -c "import PIL" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Pillow 庫未安裝"
    echo "正在安裝 Pillow..."
    pip3 install Pillow
    if [ $? -ne 0 ]; then
        echo "❌ Pillow 安裝失敗"
        exit 1
    fi
fi

# 執行 Python 腳本
echo "正在更新圖示..."
echo ""
python3 update-icon.py

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 圖示更新完成！"
else
    echo ""
    echo "❌ 圖示更新失敗"
    exit 1
fi

