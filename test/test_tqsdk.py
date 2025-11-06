"""
TqSdk 连接测试脚本
用于诊断 TqSdk 连接问题
"""
import os
import sys

# 禁用代理
os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'
if 'HTTP_PROXY' in os.environ:
    del os.environ['HTTP_PROXY']
if 'HTTPS_PROXY' in os.environ:
    del os.environ['HTTPS_PROXY']
if 'http_proxy' in os.environ:
    del os.environ['http_proxy']
if 'https_proxy' in os.environ:
    del os.environ['https_proxy']

print("=" * 60)
print("TqSdk 连接测试")
print("=" * 60)

# 检查环境变量
print("\n1. 检查代理环境变量:")
print(f"  HTTP_PROXY: {os.environ.get('HTTP_PROXY', 'Not set')}")
print(f"  HTTPS_PROXY: {os.environ.get('HTTPS_PROXY', 'Not set')}")
print(f"  http_proxy: {os.environ.get('http_proxy', 'Not set')}")
print(f"  https_proxy: {os.environ.get('https_proxy', 'Not set')}")
print(f"  NO_PROXY: {os.environ.get('NO_PROXY', 'Not set')}")

try:
    print("\n2. 导入 TqSdk...")
    from tqsdk import TqApi, TqAuth
    print("  ✅ TqSdk 导入成功")
    
    print("\n3. 尝试连接 TqSdk...")
    # 使用账号密码
    username = '17665117821'
    password = 'STC89c51'
    
    print(f"  使用账号: {username}")
    
    try:
        auth = TqAuth(username, password)
        print("  ✅ TqAuth 创建成功")
        
        print("\n4. 创建 TqApi 实例...")
        api = TqApi(auth=auth)
        print("  ✅ TqApi 连接成功!")
        
        print("\n5. 测试获取合约信息...")
        contract = "KQ.m@SHFE.ag"
        quote = api.get_quote(contract)
        print(f"  ✅ 成功获取合约: {contract}")
        print(f"  最新价: {quote.last_price}")
        print(f"  开盘价: {quote.open}")
        print(f"  最高价: {quote.highest}")
        print(f"  最低价: {quote.lowest}")
        
        print("\n6. 测试获取K线数据...")
        klines = api.get_kline_serial(contract, duration_seconds=60, data_length=5)
        print(f"  ✅ 成功获取K线数据，最近5条:")
        print(klines.tail())
        
        print("\n7. 关闭连接...")
        api.close()
        print("  ✅ 连接已关闭")
        
        print("\n" + "=" * 60)
        print("✅ 所有测试通过！TqSdk 工作正常")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ TqApi 连接失败: {e}")
        print(f"\n错误类型: {type(e).__name__}")
        import traceback
        print("\n完整错误信息:")
        traceback.print_exc()
        
        print("\n可能的解决方案:")
        print("1. 检查网络连接")
        print("2. 检查是否有代理设置干扰")
        print("3. 检查防火墙设置")
        print("4. 检查账号密码是否正确")
        
except ImportError as e:
    print(f"\n❌ 导入失败: {e}")
    print("请安装 TqSdk: pip install tqsdk")
except Exception as e:
    print(f"\n❌ 发生错误: {e}")
    import traceback
    traceback.print_exc()

