#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
测试 AllTick API 获取美元指数实时数据
"""

import httpx
import json
import asyncio
from datetime import datetime

# ========== 配置区域 ==========
ALLTICK_BASE_URL = "https://quote.alltick.co/quote-b-api"
ALLTICK_TOKEN = "9d7f12b4c30826987a501d532ef75707-c-app"
# =============================

# 可能的美元指数代码
DOLLAR_INDEX_SYMBOLS = [
    "DINIW",    # ICE 美元指数
    "DXY",      # 美元指数
    "USDX",     # 美元指数
]


async def test_trade_tick(symbol: str):
    """测试获取实时成交价"""
    try:
        print(f"\n{'='*70}")
        print(f"测试 trade-tick: {symbol}")
        print(f"{'='*70}")
        
        # 构建请求
        query_data = {
            "trace": f"test-{int(datetime.now().timestamp() * 1000)}",
            "data": {
                "symbol_list": [
                    {"code": symbol}
                ]
            }
        }
        
        query_json = json.dumps(query_data, ensure_ascii=False)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{ALLTICK_BASE_URL}/trade-tick",
                params={"token": ALLTICK_TOKEN, "query": query_json},
                headers={"accept": "application/json"}
            )
            
            data = response.json()
            ret = data.get("ret", 0)
            
            print(f"状态码: {response.status_code}")
            print(f"返回码: {ret}")
            print(f"返回消息: {data.get('msg', 'N/A')}")
            
            if ret == 200:
                tick_list = data.get("data", {}).get("tick_list", [])
                if tick_list:
                    tick = tick_list[0]
                    print(f"\n✓ 成功获取数据!")
                    print(f"  代码: {tick.get('code', 'N/A')}")
                    print(f"  价格: {tick.get('price', 'N/A')}")
                    print(f"  成交量: {tick.get('volume', 'N/A')}")
                    print(f"  时间: {tick.get('tick_time', 'N/A')}")
                    return True
                else:
                    print(f"✗ 返回数据为空")
                    return False
            else:
                print(f"✗ 请求失败")
                print(f"完整响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
                return False
                
    except Exception as e:
        print(f"✗ 异常: {str(e)}")
        return False


async def test_depth_tick(symbol: str):
    """测试获取盘口深度"""
    try:
        print(f"\n{'='*70}")
        print(f"测试 depth-tick: {symbol}")
        print(f"{'='*70}")
        
        # 构建请求
        query_data = {
            "trace": f"test-{int(datetime.now().timestamp() * 1000)}",
            "data": {
                "symbol_list": [
                    {"code": symbol}
                ]
            }
        }
        
        query_json = json.dumps(query_data, ensure_ascii=False)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{ALLTICK_BASE_URL}/depth-tick",
                params={"token": ALLTICK_TOKEN, "query": query_json},
                headers={"accept": "application/json"}
            )
            
            data = response.json()
            ret = data.get("ret", 0)
            
            print(f"状态码: {response.status_code}")
            print(f"返回码: {ret}")
            print(f"返回消息: {data.get('msg', 'N/A')}")
            
            if ret == 200:
                depth_list = data.get("data", {}).get("depth_list", [])
                if depth_list:
                    depth = depth_list[0]
                    print(f"\n✓ 成功获取盘口数据!")
                    print(f"  代码: {depth.get('code', 'N/A')}")
                    
                    bid_prices = depth.get('bid_price', [])
                    bid_volumes = depth.get('bid_volume', [])
                    ask_prices = depth.get('ask_price', [])
                    ask_volumes = depth.get('ask_volume', [])
                    
                    if bid_prices and ask_prices:
                        print(f"\n  盘口数据:")
                        print(f"    卖一: {ask_prices[0] if len(ask_prices) > 0 else 'N/A'} ({ask_volumes[0] if len(ask_volumes) > 0 else 'N/A'})")
                        print(f"    买一: {bid_prices[0] if len(bid_prices) > 0 else 'N/A'} ({bid_volumes[0] if len(bid_volumes) > 0 else 'N/A'})")
                    
                    return True
                else:
                    print(f"✗ 返回数据为空")
                    return False
            else:
                print(f"✗ 请求失败")
                print(f"完整响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
                return False
                
    except Exception as e:
        print(f"✗ 异常: {str(e)}")
        return False


async def test_kline(symbol: str, interval: str = "1m", limit: int = 10):
    """测试获取K线数据"""
    try:
        print(f"\n{'='*70}")
        print(f"测试 kline: {symbol} ({interval})")
        print(f"{'='*70}")
        
        # 转换interval为kline_type
        kline_type_map = {
            "1m": 1,
            "5m": 2,
            "15m": 3,
            "30m": 4,
            "1h": 5,
            "1d": 8,
        }
        kline_type = kline_type_map.get(interval, 1)
        
        # 构建请求
        query_data = {
            "trace": f"test-{int(datetime.now().timestamp() * 1000)}",
            "data": {
                "code": symbol,
                "kline_type": kline_type,
                "kline_timestamp_end": 0,
                "query_kline_num": limit,
                "adjust_type": 0
            }
        }
        
        query_json = json.dumps(query_data, ensure_ascii=False)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{ALLTICK_BASE_URL}/kline",
                params={"token": ALLTICK_TOKEN, "query": query_json},
                headers={"accept": "application/json"}
            )
            
            data = response.json()
            ret = data.get("ret", 0)
            
            print(f"状态码: {response.status_code}")
            print(f"返回码: {ret}")
            print(f"返回消息: {data.get('msg', 'N/A')}")
            
            if ret == 200:
                kline_list = data.get("data", {}).get("kline_list", [])
                if kline_list:
                    print(f"\n✓ 成功获取 {len(kline_list)} 条K线数据!")
                    
                    # 显示最新的一条K线
                    if len(kline_list) > 0:
                        latest = kline_list[-1]
                        print(f"\n  最新K线:")
                        print(f"    时间: {datetime.fromtimestamp(latest.get('timestamp', 0))}")
                        print(f"    开盘: {latest.get('open_price', 'N/A')}")
                        print(f"    最高: {latest.get('high_price', 'N/A')}")
                        print(f"    最低: {latest.get('low_price', 'N/A')}")
                        print(f"    收盘: {latest.get('close_price', 'N/A')}")
                        print(f"    成交量: {latest.get('volume', 'N/A')}")
                    
                    return True
                else:
                    print(f"✗ 返回数据为空")
                    return False
            else:
                print(f"✗ 请求失败")
                print(f"完整响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
                return False
                
    except Exception as e:
        print(f"✗ 异常: {str(e)}")
        return False


async def main():
    """主测试函数"""
    print("="*70)
    print("测试 AllTick API 获取美元指数数据")
    print("="*70)
    print(f"\n测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"API地址: {ALLTICK_BASE_URL}")
    
    # 记录成功的合约
    successful_results = {}
    
    # 测试所有可能的美元指数代码
    for symbol in DOLLAR_INDEX_SYMBOLS:
        print(f"\n{'#'*70}")
        print(f"# 测试代码: {symbol}")
        print(f"{'#'*70}")
        
        results = {
            "trade_tick": False,
            "depth_tick": False,
            "kline": False
        }
        
        # 测试 trade-tick
        results["trade_tick"] = await test_trade_tick(symbol)
        await asyncio.sleep(0.5)
        
        # 测试 depth-tick
        results["depth_tick"] = await test_depth_tick(symbol)
        await asyncio.sleep(0.5)
        
        # 测试 kline
        results["kline"] = await test_kline(symbol)
        await asyncio.sleep(0.5)
        
        # 记录结果
        if any(results.values()):
            successful_results[symbol] = results
    
    # 输出总结
    print("\n" + "="*70)
    print("测试总结")
    print("="*70)
    
    if successful_results:
        print(f"\n✓ 找到 {len(successful_results)} 个可用的美元指数代码:")
        for symbol, results in successful_results.items():
            print(f"\n  {symbol}:")
            print(f"    - 实时成交价 (trade-tick): {'✓ 可用' if results['trade_tick'] else '✗ 不可用'}")
            print(f"    - 盘口深度 (depth-tick): {'✓ 可用' if results['depth_tick'] else '✗ 不可用'}")
            print(f"    - K线数据 (kline): {'✓ 可用' if results['kline'] else '✗ 不可用'}")
        
        print("\n结论: AllTick API 支持获取美元指数数据")
        print("\n使用方法:")
        print("  1. 直接调用项目的 API 接口:")
        print(f"     http://localhost:8000/api/data/trade-tick?symbol={list(successful_results.keys())[0]}")
        print(f"     http://localhost:8000/api/data/kline?symbol={list(successful_results.keys())[0]}&interval=1m&limit=100")
        print("\n  2. 在前端页面使用:")
        print(f"     打开 http://localhost:8000 并输入 {list(successful_results.keys())[0]} 作为交易品种")
        
    else:
        print("\n✗ 未找到可用的美元指数代码")
        print("\n可能的原因:")
        print("  1. AllTick API 不支持这些代码")
        print("  2. 需要尝试其他代码格式")
        print("  3. API Token 权限不足")
        print("\n建议:")
        print("  1. 查阅 AllTick API 文档获取正确的美元指数代码")
        print("  2. 联系 AllTick 客服确认支持的品种")
        print("  3. 考虑使用其他数据源")
    
    print("\n" + "="*70)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n用户中断测试")
    except Exception as e:
        print(f"\n\n测试出错: {str(e)}")

