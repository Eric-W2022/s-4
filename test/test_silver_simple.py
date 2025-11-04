#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
简化版测试脚本 - 快速测试TQSdk获取白银主力合约数据
"""

from tqsdk import TqApi, TqAuth

# ========== 配置区域 ==========
# 使用项目配置的快期账号
TQSDK_USERNAME = "17665117821"
TQSDK_PASSWORD = "STC89c51"
# =============================

def main():
    """快速测试获取白银主力合约盘口数据"""
    
    print("开始测试TQSdk获取白银主力合约数据...\n")
    
    try:
        # 创建API实例
        print("正在连接TQSdk...")
        api = TqApi(auth=TqAuth(TQSDK_USERNAME, TQSDK_PASSWORD))
        
        # 获取白银主力合约
        symbol = "KQ.m@SHFE.ag"  # 白银主力连续合约
        print(f"正在获取合约: {symbol}\n")
        
        quote = api.get_quote(symbol)
        
        # 等待数据更新
        api.wait_update()
        
        # 打印盘口数据
        print("=" * 60)
        print(f"白银主力合约实时盘口数据 ({quote.datetime})")
        print("=" * 60)
        print(f"合约代码: {quote.instrument_id}")
        print(f"\n最新价: {quote.last_price}")
        print(f"\n卖五: {quote.ask_price5} ({quote.ask_volume5})")
        print(f"卖四: {quote.ask_price4} ({quote.ask_volume4})")
        print(f"卖三: {quote.ask_price3} ({quote.ask_volume3})")
        print(f"卖二: {quote.ask_price2} ({quote.ask_volume2})")
        print(f"卖一: {quote.ask_price1} ({quote.ask_volume1})")
        print(f"{'-'*60}")
        print(f"买一: {quote.bid_price1} ({quote.bid_volume1})")
        print(f"买二: {quote.bid_price2} ({quote.bid_volume2})")
        print(f"买三: {quote.bid_price3} ({quote.bid_volume3})")
        print(f"买四: {quote.bid_price4} ({quote.bid_volume4})")
        print(f"买五: {quote.bid_price5} ({quote.bid_volume5})")
        print(f"\n成交量: {quote.volume}")
        print(f"持仓量: {quote.open_interest}")
        print("=" * 60)
        
        print("\n✓ 测试成功！TQSdk可以正常获取白银主力合约的实时盘口数据")
        
        # 关闭连接
        api.close()
        return True
        
    except Exception as e:
        print(f"\n✗ 测试失败: {str(e)}")
        print("\n请检查:")
        print("1. 是否已安装tqsdk: pip install tqsdk")
        print("2. 是否正确配置了快期账号和密码")
        print("3. 网络连接是否正常")
        return False


if __name__ == "__main__":
    main()

