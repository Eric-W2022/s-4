#!/usr/bin/env python3
"""
测试TqSdk获取最新白银价格
"""
import sys
import os

# 添加backend目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from config import get_tqsdk_api, TQSDK_AVAILABLE
from datetime import datetime
import asyncio
from concurrent.futures import ThreadPoolExecutor

def test_get_quote():
    """测试获取实时行情"""
    if not TQSDK_AVAILABLE:
        print("TqSdk未安装")
        return
    
    try:
        print("="*60)
        print("测试TqSdk获取最新白银价格")
        print("="*60)
        
        # 获取TqApi实例
        api = get_tqsdk_api()
        contract = "KQ.m@SHFE.ag"
        
        print(f"合约代码: {contract}")
        print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print()
        
        # 获取实时行情
        print("正在获取实时行情...")
        quote = api.get_quote(contract)
        
        # 等待数据更新
        print("等待数据更新...")
        api.wait_update()
        
        # 显示行情信息
        print("\n" + "="*60)
        print("实时行情数据:")
        print("="*60)
        
        # 尝试获取各种价格字段
        if hasattr(quote, 'last_price'):
            print(f"最新价 (last_price): {quote.last_price}")
        if hasattr(quote, 'datetime'):
            print(f"时间戳 (datetime): {quote.datetime}")
        if hasattr(quote, 'volume'):
            print(f"成交量 (volume): {quote.volume}")
        if hasattr(quote, 'open'):
            print(f"开盘价 (open): {quote.open}")
        if hasattr(quote, 'high'):
            print(f"最高价 (high): {quote.high}")
        if hasattr(quote, 'low'):
            print(f"最低价 (low): {quote.low}")
        if hasattr(quote, 'close'):
            print(f"收盘价 (close): {quote.close}")
        if hasattr(quote, 'bid_price1'):
            print(f"买一价 (bid_price1): {quote.bid_price1}")
        if hasattr(quote, 'ask_price1'):
            print(f"卖一价 (ask_price1): {quote.ask_price1}")
        
        # 如果是dict类型
        if isinstance(quote, dict):
            print("\n行情数据 (dict格式):")
            for key, value in quote.items():
                print(f"  {key}: {value}")
        
        print("\n" + "="*60)
        print("测试完成")
        print("="*60)
        
    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()


def test_get_quote_async():
    """测试异步获取实时行情"""
    if not TQSDK_AVAILABLE:
        print("TqSdk未安装")
        return
    
    async def run_test():
        from config import get_tqsdk_quote_async
        
        try:
            print("="*60)
            print("测试异步获取最新白银价格")
            print("="*60)
            print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print()
            
            quote_data = await get_tqsdk_quote_async('AG')
            
            if quote_data:
                print("\n" + "="*60)
                print("实时行情数据:")
                print("="*60)
                print(f"合约代码: {quote_data.get('code')}")
                print(f"价格: {quote_data.get('price')}")
                print(f"成交量: {quote_data.get('volume')}")
                print(f"时间戳: {quote_data.get('tick_time')}")
                print("="*60)
            else:
                print("未获取到数据")
                
        except Exception as e:
            print(f"\n错误: {e}")
            import traceback
            traceback.print_exc()
    
    asyncio.run(run_test())


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='测试TqSdk获取白银价格')
    parser.add_argument('--use-async', action='store_true', help='使用异步方式')
    args = parser.parse_args()
    
    if args.use_async:
        test_get_quote_async()
    else:
        test_get_quote()

