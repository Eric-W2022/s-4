#!/usr/bin/env python3
"""
持续测试K线接口，检查数据是否更新
"""
import requests
import time
import json
from datetime import datetime

def test_kline_update():
    """持续测试K线接口，检查数据是否更新"""
    url = "http://localhost:8080/api/data/kline"
    params = {
        "symbol": "AG",
        "interval": "1m",
        "limit": 5
    }
    
    print("="*60)
    print("持续测试K线接口 - 检查数据是否更新")
    print("="*60)
    print(f"接口: {url}")
    print(f"参数: {params}")
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    last_data = None
    test_count = 0
    
    try:
        while test_count < 20:  # 测试20次
            test_count += 1
            try:
                response = requests.get(url, params=params, timeout=5)
                if response.status_code == 200:
                    data = response.json()
                    
                    if isinstance(data, list) and len(data) > 0:
                        latest = data[-1]
                        current_time = datetime.now().strftime('%H:%M:%S')
                        
                        # 提取关键信息
                        timestamp = latest.get('t', 0)
                        close_price = latest.get('c', 0)
                        volume = latest.get('v', 0)
                        
                        # 格式化时间戳
                        if timestamp:
                            dt = datetime.fromtimestamp(timestamp / 1000)
                            time_str = dt.strftime('%H:%M:%S')
                        else:
                            time_str = "N/A"
                        
                        # 检查是否有变化
                        if last_data:
                            last_close = last_data.get('c', 0)
                            last_time = last_data.get('t', 0)
                            
                            if close_price != last_close or timestamp != last_time:
                                print(f"[{test_count:2d}] [{current_time}] ✓ 数据已更新!")
                                print(f"    时间: {time_str} (时间戳: {timestamp})")
                                print(f"    收盘价: {last_close} -> {close_price}")
                                print(f"    成交量: {volume}")
                                print()
                                last_data = latest
                            else:
                                print(f"[{test_count:2d}] [{current_time}] - 数据未变化 (收盘价: {close_price}, 时间: {time_str})")
                        else:
                            print(f"[{test_count:2d}] [{current_time}] 初始数据:")
                            print(f"    时间: {time_str} (时间戳: {timestamp})")
                            print(f"    收盘价: {close_price}")
                            print(f"    成交量: {volume}")
                            print()
                            last_data = latest
                    else:
                        print(f"[{test_count:2d}] 返回数据为空或格式错误")
                else:
                    print(f"[{test_count:2d}] HTTP错误: {response.status_code}")
                    print(f"    响应: {response.text[:200]}")
                    
            except requests.exceptions.RequestException as e:
                print(f"[{test_count:2d}] 请求失败: {e}")
            
            # 等待5秒后再次请求
            if test_count < 20:
                time.sleep(5)
                
    except KeyboardInterrupt:
        print("\n测试被中断")
    
    print()
    print("="*60)
    print(f"测试结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"总共测试: {test_count} 次")
    print("="*60)

if __name__ == "__main__":
    test_kline_update()

