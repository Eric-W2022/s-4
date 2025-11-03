#!/usr/bin/env python3
"""
TqSdk测试脚本
用于测试TqSdk是否能正常获取K线数据和实时行情数据
"""
import sys
import time
import traceback
from datetime import datetime

try:
    from tqsdk import TqApi, TqAuth
    TQSDK_AVAILABLE = True
    print("✓ TqSdk已安装")
except ImportError:
    print("✗ TqSdk未安装")
    sys.exit(1)

# TqSdk账户信息（从config.py中获取）
TQ_USERNAME = '17665117821'
TQ_PASSWORD = 'STC89c51'

def test_kline_data():
    """测试K线数据获取"""
    print("\n" + "="*50)
    print("测试1: 获取K线数据")
    print("="*50)
    
    try:
        auth = TqAuth(TQ_USERNAME, TQ_PASSWORD)
        api = TqApi(auth=auth)
        contract = "KQ.m@SHFE.ag"
        
        print(f"合约: {contract}")
        print("获取1分钟K线数据...")
        
        kline = api.get_kline_serial(
            contract,
            duration_seconds=60,  # 1分钟
            data_length=10  # 获取最近10根K线
        )
        
        if kline is not None and not kline.empty:
            print(f"\n✓ 成功获取 {len(kline)} 根K线数据")
            print("\n最新5根K线数据:")
            print("-" * 80)
            for i in range(min(5, len(kline))):
                idx = len(kline) - 1 - i
                row = kline.iloc[idx]
                timestamp = row['datetime'] / 1e9  # 纳秒转秒
                dt = datetime.fromtimestamp(timestamp)
                print(f"时间: {dt.strftime('%Y-%m-%d %H:%M:%S')}")
                print(f"  开盘: {row['open']}, 收盘: {row['close']}, 最高: {row['high']}, 最低: {row['low']}, 成交量: {row['volume']}")
                print()
            
            # 等待更新
            print("等待数据更新（5秒）...")
            deadline = time.time() + 5
            api.wait_update(deadline=deadline)
            
            # 重新获取
            kline = api.get_kline_serial(
                contract,
                duration_seconds=60,
                data_length=10
            )
            
            if kline is not None and not kline.empty:
                latest = kline.iloc[-1]
                timestamp = latest['datetime'] / 1e9
                dt = datetime.fromtimestamp(timestamp)
                print(f"\n更新后的最新K线:")
                print(f"时间: {dt.strftime('%Y-%m-%d %H:%M:%S')}")
                print(f"开盘: {latest['open']}, 收盘: {latest['close']}, 最高: {latest['high']}, 最低: {latest['low']}, 成交量: {latest['volume']}")
            
            api.close()
            return True
        else:
            print("✗ 获取K线数据失败：数据为空")
            api.close()
            return False
            
    except Exception as e:
        print(f"✗ 获取K线数据失败: {e}")
        traceback.print_exc()
        return False

def test_quote_data():
    """测试实时行情数据获取"""
    print("\n" + "="*50)
    print("测试2: 获取实时行情数据")
    print("="*50)
    
    try:
        auth = TqAuth(TQ_USERNAME, TQ_PASSWORD)
        api = TqApi(auth=auth)
        contract = "KQ.m@SHFE.ag"
        
        print(f"合约: {contract}")
        print("获取实时行情...")
        
        quote = api.get_quote(contract)
        
        if quote is not None:
            print("\n✓ 成功获取实时行情")
            print(f"Quote类型: {type(quote)}")
            
            # 等待更新
            print("\n等待数据更新（5秒）...")
            deadline = time.time() + 5
            api.wait_update(deadline=deadline)
            
            # 打印行情信息
            print("\n实时行情数据:")
            print("-" * 80)
            
            # 尝试多种方式获取价格
            if hasattr(quote, 'last_price'):
                print(f"最新价(last_price): {quote.last_price} (类型: {type(quote.last_price)})")
            if hasattr(quote, 'datetime'):
                datetime_value = quote.datetime
                print(f"时间(datetime): {datetime_value} (类型: {type(datetime_value)})")
                # 尝试转换为时间戳
                try:
                    if isinstance(datetime_value, (int, float)):
                        if datetime_value > 1e12:
                            timestamp = datetime_value / 1e9
                        elif datetime_value > 1e9:
                            timestamp = datetime_value
                        else:
                            timestamp = datetime_value
                        dt = datetime.fromtimestamp(timestamp)
                        print(f"  转换后时间: {dt.strftime('%Y-%m-%d %H:%M:%S')}")
                except Exception as e:
                    print(f"  时间转换失败: {e}")
            if hasattr(quote, 'volume'):
                print(f"成交量(volume): {quote.volume}")
            if hasattr(quote, 'open'):
                print(f"开盘价(open): {quote.open}")
            if hasattr(quote, 'high'):
                print(f"最高价(high): {quote.high}")
            if hasattr(quote, 'low'):
                print(f"最低价(low): {quote.low}")
            if hasattr(quote, 'close'):
                print(f"收盘价(close): {quote.close}")
            
            # 打印所有属性
            print(f"\n所有属性:")
            for attr in dir(quote):
                if not attr.startswith('_'):
                    try:
                        value = getattr(quote, attr)
                        if not callable(value):
                            print(f"  {attr}: {value} (类型: {type(value)})")
                    except:
                        pass
            
            api.close()
            return True
        else:
            print("✗ 获取实时行情失败：quote为None")
            api.close()
            return False
            
    except Exception as e:
        print(f"✗ 获取实时行情失败: {e}")
        traceback.print_exc()
        return False

def test_subscription_loop():
    """测试订阅循环"""
    print("\n" + "="*50)
    print("测试3: 订阅循环（持续30秒）")
    print("="*50)
    
    try:
        auth = TqAuth(TQ_USERNAME, TQ_PASSWORD)
        api = TqApi(auth=auth)
        contract = "KQ.m@SHFE.ag"
        
        print(f"合约: {contract}")
        
        # 订阅K线
        kline = api.get_kline_serial(
            contract,
            duration_seconds=60,
            data_length=10
        )
        print("✓ 已订阅K线数据")
        
        # 订阅行情
        quote = api.get_quote(contract)
        print("✓ 已订阅实时行情")
        
        print("\n开始循环更新（30秒）...")
        start_time = time.time()
        update_count = 0
        last_price = None
        
        while time.time() - start_time < 30:
            deadline = time.time() + 1
            api.wait_update(deadline=deadline)
            
            update_count += 1
            
            # 检查价格是否变化
            if quote is not None and hasattr(quote, 'last_price'):
                current_price = quote.last_price
                if last_price is None:
                    last_price = current_price
                    print(f"[{update_count:3d}] 初始价格: {current_price}")
                elif current_price != last_price:
                    try:
                        if hasattr(quote, 'datetime'):
                            datetime_value = quote.datetime
                            if isinstance(datetime_value, (int, float)):
                                if datetime_value > 1e12:
                                    timestamp = datetime_value / 1e9
                                elif datetime_value > 1e9:
                                    timestamp = datetime_value
                                else:
                                    timestamp = datetime_value
                                dt = datetime.fromtimestamp(timestamp)
                                print(f"[{update_count:3d}] 价格变化: {last_price} -> {current_price} (时间: {dt.strftime('%H:%M:%S')})")
                            else:
                                print(f"[{update_count:3d}] 价格变化: {last_price} -> {current_price}")
                        else:
                            print(f"[{update_count:3d}] 价格变化: {last_price} -> {current_price}")
                    except Exception as e:
                        print(f"[{update_count:3d}] 价格变化: {last_price} -> {current_price} (时间获取失败: {e})")
                    last_price = current_price
            
            if update_count % 10 == 0:
                if quote is not None and hasattr(quote, 'last_price'):
                    print(f"[{update_count:3d}] 当前价格: {quote.last_price} (未变化)")
        
        print(f"\n✓ 循环结束，共更新 {update_count} 次")
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ 订阅循环失败: {e}")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("="*50)
    print("TqSdk 测试脚本")
    print("="*50)
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    results = []
    
    # 测试1: K线数据
    results.append(("K线数据", test_kline_data()))
    
    # 测试2: 实时行情
    results.append(("实时行情", test_quote_data()))
    
    # 测试3: 订阅循环
    results.append(("订阅循环", test_subscription_loop()))
    
    # 打印总结
    print("\n" + "="*50)
    print("测试总结")
    print("="*50)
    for name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"{name}: {status}")
    
    print(f"\n结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

