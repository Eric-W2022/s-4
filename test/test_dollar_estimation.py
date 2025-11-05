#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
测试通过外汇货币对获取数据（作为美元指数的替代方案）
美元指数主要由以下货币对组成：
- EUR/USD: 57.6%
- JPY/USD: 13.6%
- GBP/USD: 11.9%
- CAD/USD: 9.1%
- SEK/USD: 4.2%
- CHF/USD: 3.6%
"""

import httpx
import json
import asyncio
from datetime import datetime

# ========== 配置区域 ==========
ALLTICK_BASE_URL = "https://quote.alltick.co/quote-b-api"
ALLTICK_TOKEN = "9d7f12b4c30826987a501d532ef75707-c-app"
# =============================

# 美元指数成分货币对（各种可能的格式）
FOREX_PAIRS = [
    # 标准格式
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "USDCAD",
    "USDCHF",
    "USDSEK",
    
    # 带斜杠格式
    "EUR/USD",
    "GBP/USD",
    "USD/JPY",
    "USD/CAD",
    "USD/CHF",
    "USD/SEK",
    
    # 带点格式
    "EUR.USD",
    "GBP.USD",
    "USD.JPY",
    
    # 其他可能的格式
    "FXEURUSD",
    "FXGBPUSD",
    "FXUSDJPY",
]

# 货币对权重（用于计算美元指数估值）
DOLLAR_INDEX_WEIGHTS = {
    "EURUSD": -57.6,  # 负数因为EUR/USD上涨意味着美元下跌
    "USDJPY": 13.6,
    "GBPUSD": -11.9,
    "USDCAD": 9.1,
    "USDCHF": 3.6,
    "USDSEK": 4.2,
}


async def test_forex_pair(symbol: str):
    """测试获取外汇货币对实时价格"""
    try:
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
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{ALLTICK_BASE_URL}/trade-tick",
                params={"token": ALLTICK_TOKEN, "query": query_json},
                headers={"accept": "application/json"}
            )
            
            data = response.json()
            ret = data.get("ret", 0)
            
            if ret == 200:
                tick_list = data.get("data", {}).get("tick_list", [])
                if tick_list:
                    tick = tick_list[0]
                    price = tick.get('price', 'N/A')
                    print(f"  ✓ {symbol:12s} - 价格: {price:12s}")
                    return symbol, float(price) if price != 'N/A' else None
                    
            return symbol, None
                
    except Exception as e:
        return symbol, None


async def calculate_dollar_index(forex_data: dict):
    """根据货币对价格估算美元指数"""
    print(f"\n{'='*70}")
    print("美元指数估算（基于货币对）")
    print(f"{'='*70}")
    
    # 提取标准货币对数据
    standard_pairs = {}
    for key, price in forex_data.items():
        if price is None:
            continue
        
        # 标准化货币对名称
        normalized = key.upper().replace("/", "").replace(".", "").replace("FX", "")
        if normalized in DOLLAR_INDEX_WEIGHTS:
            standard_pairs[normalized] = price
    
    if not standard_pairs:
        print("\n✗ 没有足够的货币对数据来估算美元指数")
        return None
    
    print(f"\n可用货币对数据:")
    for pair, price in standard_pairs.items():
        weight = DOLLAR_INDEX_WEIGHTS.get(pair, 0)
        print(f"  {pair}: {price:.4f} (权重: {weight:+.1f}%)")
    
    # 简化的美元指数估算方法
    # 注意：这是一个简化的估算，真实的美元指数计算更复杂
    if len(standard_pairs) >= 3:
        print(f"\n说明:")
        print(f"  - 这是基于主要货币对的简化估算")
        print(f"  - 真实的美元指数 (DXY) 计算公式更复杂")
        print(f"  - 估算值仅供参考，不能作为交易依据")
        
        # 计算加权变化率（相对于基准值）
        # DXY 基准约为 100
        base_values = {
            "EURUSD": 1.10,  # 历史参考值
            "USDJPY": 110.0,
            "GBPUSD": 1.30,
            "USDCAD": 1.25,
            "USDCHF": 0.95,
            "USDSEK": 9.0,
        }
        
        weighted_change = 0
        total_weight = 0
        
        for pair, price in standard_pairs.items():
            if pair in base_values:
                base = base_values[pair]
                weight = abs(DOLLAR_INDEX_WEIGHTS[pair])
                
                # 计算变化率
                if DOLLAR_INDEX_WEIGHTS[pair] < 0:
                    # EUR/USD, GBP/USD: 上涨意味着美元下跌
                    change = (base - price) / base
                else:
                    # USD/JPY, USD/CAD等: 上涨意味着美元上涨
                    change = (price - base) / base
                
                weighted_change += change * weight
                total_weight += weight
        
        if total_weight > 0:
            estimated_index = 100 * (1 + weighted_change / total_weight)
            print(f"\n估算的美元指数: {estimated_index:.2f}")
            print(f"  (基准值: 100, 覆盖权重: {total_weight:.1f}%)")
            return estimated_index
    
    return None


async def main():
    """主测试函数"""
    print("="*70)
    print("测试外汇货币对数据（美元指数替代方案）")
    print("="*70)
    print(f"\n测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"API地址: {ALLTICK_BASE_URL}")
    
    print(f"\n说明:")
    print(f"  美元指数主要由以下货币对组成:")
    for pair, weight in DOLLAR_INDEX_WEIGHTS.items():
        print(f"    {pair}: {abs(weight):.1f}%")
    
    print(f"\n{'='*70}")
    print("测试货币对数据可用性")
    print(f"{'='*70}\n")
    
    # 测试所有可能的货币对格式
    forex_data = {}
    
    for symbol in FOREX_PAIRS:
        symbol_result, price = await test_forex_pair(symbol)
        if price is not None:
            forex_data[symbol_result] = price
        await asyncio.sleep(0.3)  # 避免请求过快
    
    # 输出结果
    print(f"\n{'='*70}")
    print("测试结果总结")
    print(f"{'='*70}")
    
    if forex_data:
        print(f"\n✓ 找到 {len(forex_data)} 个可用的货币对:")
        for symbol, price in forex_data.items():
            print(f"  {symbol}: {price}")
        
        # 尝试估算美元指数
        estimated = await calculate_dollar_index(forex_data)
        
        if estimated:
            print(f"\n{'='*70}")
            print("使用建议")
            print(f"{'='*70}")
            print(f"\n1. 通过项目 API 获取货币对数据:")
            first_symbol = list(forex_data.keys())[0]
            print(f"   http://localhost:8000/api/data/trade-tick?symbol={first_symbol}")
            print(f"   http://localhost:8000/api/data/kline?symbol={first_symbol}&interval=1m&limit=100")
            
            print(f"\n2. 监控主要货币对走势:")
            print(f"   - EUR/USD (权重最大: 57.6%)")
            print(f"   - USD/JPY (权重: 13.6%)")
            print(f"   - GBP/USD (权重: 11.9%)")
            
            print(f"\n3. 美元指数估算:")
            print(f"   - 可基于货币对数据计算简化的美元指数")
            print(f"   - 建议同时监控多个货币对以获得更准确的趋势")
        
        print(f"\n{'='*70}")
        print("结论")
        print(f"{'='*70}")
        print(f"\n✓ AllTick API 支持外汇货币对数据")
        print(f"✓ 可以通过货币对数据估算美元走势")
        print(f"✓ 建议监控 EUR/USD 作为美元指数的主要参考")
        
    else:
        print(f"\n✗ 未找到可用的外汇货币对")
        print(f"\n可能的原因:")
        print(f"  1. AllTick API 使用不同的代码格式")
        print(f"  2. 当前 Token 不支持外汇数据")
        print(f"  3. 需要尝试其他代码格式")
        
        print(f"\n建议:")
        print(f"  1. 查阅 AllTick API 文档获取正确的货币对代码")
        print(f"  2. 联系 AllTick 客服确认支持的品种")
        print(f"  3. 考虑使用其他数据源（如 Alpha Vantage, Fixer.io 等）")
    
    print(f"\n{'='*70}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n用户中断测试")
    except Exception as e:
        print(f"\n\n测试出错: {str(e)}")

