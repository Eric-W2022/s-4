#!/usr/bin/env python3
"""
直接测试fetch_tqsdk_quote函数
"""
import sys
import os

# 添加backend目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from config import fetch_tqsdk_quote
from concurrent.futures import ThreadPoolExecutor
import time

executor = ThreadPoolExecutor(max_workers=2)

for i in range(3):
    print(f"\n{'='*60}")
    print(f"第 {i+1} 次测试")
    print(f"{'='*60}")
    
    try:
        result = executor.submit(fetch_tqsdk_quote, 'AG').result(timeout=5)
        if result:
            print(f"返回结果:")
            print(f"  价格: {result.get('price')}")
            print(f"  成交量: {result.get('volume')}")
            print(f"  时间戳: {result.get('tick_time')}")
            print(f"  合约: {result.get('code')}")
        else:
            print("返回None")
    except Exception as e:
        print(f"错误: {e}")
        import traceback
        traceback.print_exc()
    
    if i < 2:
        print("\n等待3秒...")
        time.sleep(3)

print("\n" + "="*60)
print("测试完成")

