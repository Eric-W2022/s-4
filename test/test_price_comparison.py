#!/usr/bin/env python3
"""
同时测试TqSdk直接获取和接口获取，比对数据
"""
import sys
import os
import requests
import time
from datetime import datetime

# 添加backend目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from config import get_tqsdk_api, TQSDK_AVAILABLE, get_tqsdk_quote_async
import asyncio

def test_sdk_direct():
    """直接通过SDK获取"""
    if not TQSDK_AVAILABLE:
        return None
    
    try:
        api = get_tqsdk_api()
        contract = "KQ.m@SHFE.ag"
        quote = api.get_quote(contract)
        api.wait_update()
        
        # 提取价格
        if hasattr(quote, 'last_price'):
            price = float(quote.last_price) if quote.last_price is not None else 0
        elif isinstance(quote, dict):
            price = float(quote.get('last_price', 0))
        else:
            price = 0
        
        # 提取时间
        if hasattr(quote, 'datetime'):
            dt = quote.datetime
            if isinstance(dt, str):
                from datetime import datetime as dt_cls
                dt_obj = dt_cls.strptime(dt.split('.')[0], '%Y-%m-%d %H:%M:%S')
                timestamp = int(dt_obj.timestamp() * 1000)
            else:
                timestamp = int(dt / 1e6) if dt > 1e12 else int(dt)
        else:
            timestamp = int(datetime.now().timestamp() * 1000)
        
        return {
            "price": price,
            "timestamp": timestamp,
            "datetime": quote.datetime if hasattr(quote, 'datetime') else None
        }
    except Exception as e:
        print(f"SDK直接获取失败: {e}")
        import traceback
        traceback.print_exc()
        return None


async def test_sdk_async():
    """通过异步函数获取"""
    if not TQSDK_AVAILABLE:
        return None
    
    try:
        quote_data = await get_tqsdk_quote_async('AG')
        if quote_data:
            return {
                "price": float(quote_data.get('price', 0)),
                "timestamp": int(quote_data.get('tick_time', 0)),
                "code": quote_data.get('code')
            }
        return None
    except Exception as e:
        print(f"SDK异步获取失败: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_api():
    """通过API接口获取"""
    try:
        url = "http://localhost:8080/api/data/trade-tick"
        params = {"symbol": "AG"}
        
        response = requests.get(url, params=params, timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("ret") == 200:
                tick_list = data.get("data", {}).get("tick_list", [])
                if tick_list:
                    tick = tick_list[0]
                    return {
                        "price": float(tick.get("price", 0)),
                        "timestamp": int(tick.get("tick_time", 0)),
                        "code": tick.get("code")
                    }
        return None
    except Exception as e:
        print(f"API接口获取失败: {e}")
        return None


async def run_comparison():
    """运行对比测试"""
    print("="*80)
    print("同时测试SDK和接口，比对实时价格数据")
    print("="*80)
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    for i in range(5):
        print(f"\n{'='*80}")
        print(f"第 {i+1} 次测试")
        print(f"{'='*80}")
        test_time = datetime.now().strftime('%H:%M:%S')
        
        # 1. SDK直接获取
        print(f"\n[{test_time}] 1. SDK直接获取:")
        sdk_direct = test_sdk_direct()
        if sdk_direct:
            print(f"    价格: {sdk_direct['price']}")
            print(f"    时间戳: {sdk_direct['timestamp']}")
            if sdk_direct.get('datetime'):
                print(f"    时间: {sdk_direct['datetime']}")
        else:
            print("    获取失败")
        
        # 2. SDK异步获取
        print(f"\n[{test_time}] 2. SDK异步获取:")
        sdk_async = await test_sdk_async()
        if sdk_async:
            print(f"    价格: {sdk_async['price']}")
            print(f"    时间戳: {sdk_async['timestamp']}")
            print(f"    合约: {sdk_async.get('code')}")
        else:
            print("    获取失败")
        
        # 3. API接口获取
        print(f"\n[{test_time}] 3. API接口获取:")
        api_data = test_api()
        if api_data:
            print(f"    价格: {api_data['price']}")
            print(f"    时间戳: {api_data['timestamp']}")
            print(f"    合约: {api_data.get('code')}")
        else:
            print("    获取失败")
        
        # 比对结果
        print(f"\n[{test_time}] 比对结果:")
        prices = []
        if sdk_direct:
            prices.append(("SDK直接", sdk_direct['price']))
        if sdk_async:
            prices.append(("SDK异步", sdk_async['price']))
        if api_data:
            prices.append(("API接口", api_data['price']))
        
        if len(prices) > 1:
            price_values = [p[1] for p in prices]
            if len(set(price_values)) == 1:
                print(f"    ✓ 所有价格一致: {price_values[0]}")
            else:
                print(f"    ✗ 价格不一致:")
                for name, price in prices:
                    print(f"      {name}: {price}")
        
        # 时间戳比对
        timestamps = []
        if sdk_direct:
            timestamps.append(("SDK直接", sdk_direct['timestamp']))
        if sdk_async:
            timestamps.append(("SDK异步", sdk_async['timestamp']))
        if api_data:
            timestamps.append(("API接口", api_data['timestamp']))
        
        if len(timestamps) > 1:
            print(f"    时间戳比对:")
            for name, ts in timestamps:
                dt_str = datetime.fromtimestamp(ts / 1000).strftime('%H:%M:%S')
                print(f"      {name}: {ts} ({dt_str})")
        
        if i < 4:
            print(f"\n等待5秒后继续...")
            await asyncio.sleep(5)
    
    print("\n" + "="*80)
    print("测试完成")
    print("="*80)


if __name__ == "__main__":
    asyncio.run(run_comparison())

