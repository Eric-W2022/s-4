#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
测试TqSdk获取美元指数实时数据
"""

from tqsdk import TqApi, TqAuth
import time

# ========== 配置区域 ==========
# 使用项目配置的快期账号
TQSDK_USERNAME = "17665117821"
TQSDK_PASSWORD = "STC89c51"
# =============================

# 可能的美元指数合约代码列表
POSSIBLE_DOLLAR_INDEX_SYMBOLS = [
    # 尝试各种可能的美元指数代码
    "USDX",           # 美元指数常见代码
    "DXY",            # 美元指数另一个常见代码
    "USD.INDEX",      # 可能的格式
    "DINIW",          # ICE美元指数
    # 中金所（CFFEX）股指相关
    "CFFEX.IF",       # 沪深300股指期货（作为参考）
    # 上期所外汇相关
    "INE.sc",         # 上海国际能源交易中心原油（可能有美元相关）
]


def test_dollar_index_quote(api, symbol):
    """测试获取指定合约的实时行情"""
    try:
        print(f"\n{'='*70}")
        print(f"测试合约: {symbol}")
        print(f"{'='*70}")
        
        # 获取行情
        quote = api.get_quote(symbol)
        
        # 等待数据更新（最多等待3秒）
        deadline = time.time() + 3
        while time.time() < deadline:
            api.wait_update(deadline=deadline)
            
            # 检查是否有有效数据
            if hasattr(quote, 'last_price') and quote.last_price and not str(quote.last_price).lower() == 'nan':
                print(f"✓ 找到有效数据！")
                print(f"\n合约信息:")
                print(f"  合约代码: {quote.instrument_id if hasattr(quote, 'instrument_id') else 'N/A'}")
                print(f"  合约名称: {quote.ins_name if hasattr(quote, 'ins_name') else 'N/A'}")
                print(f"  交易所: {quote.exchange_id if hasattr(quote, 'exchange_id') else 'N/A'}")
                
                print(f"\n实时行情:")
                print(f"  最新价: {quote.last_price}")
                print(f"  开盘价: {quote.open if hasattr(quote, 'open') else 'N/A'}")
                print(f"  最高价: {quote.highest if hasattr(quote, 'highest') else 'N/A'}")
                print(f"  最低价: {quote.lowest if hasattr(quote, 'lowest') else 'N/A'}")
                print(f"  成交量: {quote.volume if hasattr(quote, 'volume') else 'N/A'}")
                print(f"  持仓量: {quote.open_interest if hasattr(quote, 'open_interest') else 'N/A'}")
                print(f"  更新时间: {quote.datetime if hasattr(quote, 'datetime') else 'N/A'}")
                
                # 如果有盘口数据
                if hasattr(quote, 'bid_price1') and quote.bid_price1:
                    print(f"\n盘口数据:")
                    print(f"  买一: {quote.bid_price1} ({quote.bid_volume1 if hasattr(quote, 'bid_volume1') else 'N/A'})")
                    print(f"  卖一: {quote.ask_price1 if hasattr(quote, 'ask_price1') else 'N/A'} ({quote.ask_volume1 if hasattr(quote, 'ask_volume1') else 'N/A'})")
                
                return True
        
        # 超时未获取到有效数据
        print(f"✗ 未能获取到有效数据（超时）")
        if hasattr(quote, 'last_price'):
            print(f"  last_price 值: {quote.last_price}")
        return False
        
    except Exception as e:
        print(f"✗ 获取失败: {str(e)}")
        return False


def search_contracts_by_keyword(api, keyword):
    """搜索包含关键词的合约"""
    try:
        print(f"\n{'='*70}")
        print(f"搜索包含 '{keyword}' 的合约...")
        print(f"{'='*70}")
        
        # TqSdk没有直接的搜索API，我们需要通过其他方式
        # 这里只是一个示例，实际可能需要其他方法
        print("注意: TqSdk不提供合约搜索API，建议查阅官方文档获取完整合约列表")
        return False
        
    except Exception as e:
        print(f"✗ 搜索失败: {str(e)}")
        return False


def main():
    """测试TqSdk是否能获取美元指数数据"""
    
    print("="*70)
    print("测试 TqSdk 获取美元指数实时数据")
    print("="*70)
    print(f"\n账号: {TQSDK_USERNAME}")
    print(f"测试时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # 创建API实例
        print("\n正在连接TQSdk...")
        api = TqApi(auth=TqAuth(TQSDK_USERNAME, TQSDK_PASSWORD))
        print("✓ 连接成功！")
        
        # 记录成功的合约
        successful_symbols = []
        
        # 测试所有可能的美元指数合约代码
        for symbol in POSSIBLE_DOLLAR_INDEX_SYMBOLS:
            result = test_dollar_index_quote(api, symbol)
            if result:
                successful_symbols.append(symbol)
            time.sleep(0.5)  # 避免请求过快
        
        # 输出总结
        print("\n" + "="*70)
        print("测试总结")
        print("="*70)
        
        if successful_symbols:
            print(f"\n✓ 找到 {len(successful_symbols)} 个可用的合约:")
            for symbol in successful_symbols:
                print(f"  - {symbol}")
            print("\n结论: TqSdk 可以获取上述合约的实时数据")
        else:
            print("\n✗ 未找到有效的美元指数合约")
            print("\n结论: TqSdk 可能不支持美元指数（USDX/DXY）的实时数据")
            print("\n说明:")
            print("  1. TqSdk 主要提供中国期货市场的数据")
            print("  2. 美元指数（USDX）主要在洲际交易所（ICE）交易")
            print("  3. 如需美元指数数据，建议使用其他数据源，如:")
            print("     - AllTick API (项目中已集成)")
            print("     - iTick")
            print("     - Alpha Vantage")
            print("     - 其他外汇/指数数据提供商")
            
            print("\n可选方案:")
            print("  - 项目已集成 AllTick API，可尝试使用其获取美元指数数据")
            print("  - 美元指数在 AllTick 中的代码可能是: DINIW 或 DXY")
        
        # 关闭连接
        api.close()
        print("\n✓ 测试完成，连接已关闭")
        
        return len(successful_symbols) > 0
        
    except Exception as e:
        print(f"\n✗ 测试过程出错: {str(e)}")
        print("\n请检查:")
        print("1. 是否已安装tqsdk: pip install tqsdk")
        print("2. 是否正确配置了快期账号和密码")
        print("3. 网络连接是否正常")
        return False


def test_alltick_suggestion():
    """建议使用 AllTick API 获取美元指数"""
    print("\n" + "="*70)
    print("建议: 使用 AllTick API 获取美元指数")
    print("="*70)
    print("\n项目已集成 AllTick API，可以通过以下方式获取美元指数:")
    print("\n1. API 端点:")
    print("   http://localhost:8000/api/data/kline?symbol=DINIW&interval=1m&limit=100")
    print("   http://localhost:8000/api/data/trade-tick?symbol=DINIW")
    print("   http://localhost:8000/api/data/depth-tick?symbol=DINIW")
    
    print("\n2. 可能的美元指数代码:")
    print("   - DINIW: ICE 美元指数")
    print("   - DXY: 美元指数")
    print("   - USDX: 美元指数")
    
    print("\n3. 示例代码 (使用 httpx):")
    print("""
    import httpx
    
    async def get_dollar_index():
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "http://localhost:8000/api/data/trade-tick",
                params={"symbol": "DINIW"}
            )
            return response.json()
    """)
    
    print("\n4. 或使用前端页面:")
    print("   打开 http://localhost:8000 并输入 DINIW 作为交易品种")


if __name__ == "__main__":
    success = main()
    
    # 如果TqSdk不支持，提供AllTick建议
    if not success:
        test_alltick_suggestion()
    
    print("\n" + "="*70)

