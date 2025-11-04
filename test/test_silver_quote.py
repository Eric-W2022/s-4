#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
测试TQSdk获取国内白银主力合约的实时盘口数据

白银主力合约代码: KQ.m@SHFE.ag (主力连续合约)
或者具体合约如: SHFE.ag2412 (2024年12月合约)
"""

from tqsdk import TqApi, TqAuth
import time


def test_silver_main_quote():
    """测试获取白银主力合约的实时盘口数据"""
    
    print("=" * 80)
    print("测试TQSdk获取白银主力合约实时盘口数据")
    print("=" * 80)
    
    try:
        # 创建API实例
        # 注意: 如果没有账号，可以使用快期模拟账号测试
        # 注册地址: https://www.shinnytech.com/register/
        api = TqApi(
            auth=TqAuth("17665117821", "STC89c51"),  # 使用项目配置的快期账号
            # web_gui=True  # 启用Web图形界面
        )
        
        # 获取白银主力连续合约
        # KQ.m@SHFE.ag 表示上海期货交易所白银主力连续合约
        symbol = "KQ.m@SHFE.ag"
        print(f"\n正在获取合约: {symbol}")
        
        quote = api.get_quote(symbol)
        
        # 等待数据更新
        print("等待行情数据初始化...")
        api.wait_update()
        
        print("\n" + "=" * 80)
        print("白银主力合约实时盘口数据")
        print("=" * 80)
        
        # 循环获取并打印实时数据（获取10次）
        for i in range(10):
            # 等待行情更新
            api.wait_update()
            
            print(f"\n[更新 {i+1}/10] 时间: {quote.datetime}")
            print("-" * 80)
            
            # 基本信息
            print(f"合约代码: {quote.instrument_id}")
            print(f"合约名称: {getattr(quote, 'name', 'N/A')}")
            
            # 价格信息
            print(f"\n价格信息:")
            print(f"  最新价: {quote.last_price}")
            print(f"  开盘价: {quote.open}")
            print(f"  最高价: {quote.highest}")
            print(f"  最低价: {quote.lowest}")
            print(f"  昨收盘: {quote.pre_close}")
            print(f"  昨结算: {quote.pre_settlement}")
            print(f"  涨跌额: {quote.last_price - quote.pre_settlement if quote.last_price and quote.pre_settlement else 'N/A'}")
            
            # 五档盘口数据
            print(f"\n五档盘口:")
            print(f"  {'档位':<6} {'卖价':<12} {'卖量':<12} | {'买价':<12} {'买量':<12}")
            print(f"  {'-'*60}")
            
            for level in range(5, 0, -1):
                ask_price = getattr(quote, f'ask_price{level}', None)
                ask_volume = getattr(quote, f'ask_volume{level}', None)
                print(f"  卖{level}档  {ask_price if ask_price else '-':<12} {ask_volume if ask_volume else '-':<12}")
            
            print(f"  {'-'*60}")
            
            for level in range(1, 6):
                bid_price = getattr(quote, f'bid_price{level}', None)
                bid_volume = getattr(quote, f'bid_volume{level}', None)
                print(f"  买{level}档  {bid_price if bid_price else '-':<12} {bid_volume if bid_volume else '-':<12}")
            
            # 成交量和持仓信息
            print(f"\n成交和持仓:")
            print(f"  成交量: {quote.volume}")
            print(f"  成交额: {quote.amount}")
            print(f"  持仓量: {quote.open_interest}")
            
            # 涨跌停价
            print(f"\n涨跌停价:")
            print(f"  涨停价: {quote.upper_limit}")
            print(f"  跌停价: {quote.lower_limit}")
            
            # 等待1秒再获取下一次数据
            time.sleep(1)
        
        print("\n" + "=" * 80)
        print("测试完成！")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n错误: {str(e)}")
        print("\n提示:")
        print("1. 请确保已安装tqsdk: pip install tqsdk")
        print("2. 请替换正确的快期账号和密码")
        print("3. 可以在 https://www.shinnytech.com/register/ 注册账号")
        print("4. 或使用快期模拟交易账号测试")
        return False
    
    finally:
        # 关闭API连接
        if 'api' in locals():
            api.close()
            print("\nAPI连接已关闭")
    
    return True


def test_silver_specific_contract():
    """测试获取白银具体合约的实时盘口数据"""
    
    print("\n" + "=" * 80)
    print("测试TQSdk获取白银具体合约实时盘口数据")
    print("=" * 80)
    
    try:
        api = TqApi(auth=TqAuth("17665117821", "STC89c51"))  # 使用项目配置的快期账号
        
        # 获取具体的白银合约（例如2025年6月合约）
        # 注意：需要根据实际交易的合约月份调整
        symbol = "SHFE.ag2506"  # 2025年6月白银合约
        print(f"\n正在获取合约: {symbol}")
        
        quote = api.get_quote(symbol)
        
        # 等待数据更新
        print("等待行情数据初始化...")
        api.wait_update()
        
        print(f"\n合约: {symbol}")
        print(f"最新价: {quote.last_price}")
        print(f"买一价: {quote.bid_price1} | 买一量: {quote.bid_volume1}")
        print(f"卖一价: {quote.ask_price1} | 卖一量: {quote.ask_volume1}")
        print(f"成交量: {quote.volume}")
        print(f"持仓量: {quote.open_interest}")
        
        print("\n测试完成！")
        
    except Exception as e:
        print(f"\n错误: {str(e)}")
        return False
    
    finally:
        if 'api' in locals():
            api.close()
    
    return True


if __name__ == "__main__":
    print("TQSdk白银主力合约实时盘口数据测试脚本")
    print("\n使用说明:")
    print("1. 请先安装TQSdk: pip install tqsdk")
    print("2. 在脚本中替换快期账号和密码")
    print("3. 运行脚本: python test_silver_quote.py")
    print("\n开始测试...\n")
    
    # 测试主力连续合约
    success = test_silver_main_quote()
    
    # 可选：测试具体合约
    # test_silver_specific_contract()
    
    if success:
        print("\n✓ 测试成功！TQSdk可以正常获取白银主力合约的实时盘口数据")
    else:
        print("\n✗ 测试失败，请检查配置")

