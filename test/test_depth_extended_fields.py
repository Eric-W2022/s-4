"""
测试国内白银盘口扩展字段
通过HTTP API访问本地服务(8000端口)，验证所有扩展字段是否正确返回
"""
import requests
import json
import time
from datetime import datetime


def print_section(title):
    """打印分节标题"""
    print("\n" + "="*80)
    print(f" {title}")
    print("="*80 + "\n")


def test_depth_tick_api():
    """测试盘口数据API"""
    print_section("测试国内白银盘口数据API")
    
    # API地址
    url = "http://localhost:8000/api/data/depth-tick"
    params = {"symbol": "AG"}
    
    print(f"请求URL: {url}")
    print(f"参数: {params}")
    print()
    
    try:
        # 发送请求
        response = requests.get(url, params=params, timeout=10)
        
        print(f"响应状态码: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ 请求失败: {response.text}")
            return None
        
        # 解析JSON
        data = response.json()
        
        # 检查响应结构
        if data.get("ret") != 200:
            print(f"❌ API返回错误: {data.get('msg', 'Unknown error')}")
            return None
        
        print("✅ API请求成功")
        
        # 获取depth_list
        depth_list = data.get("data", {}).get("depth_list", [])
        
        if not depth_list:
            print("❌ 深度数据为空")
            return None
        
        depth = depth_list[0]
        
        return depth
        
    except requests.exceptions.ConnectionError:
        print("❌ 连接失败: 请确保后端服务在8000端口运行")
        print("   启动命令: uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000")
        return None
    except requests.exceptions.Timeout:
        print("❌ 请求超时")
        return None
    except Exception as e:
        print(f"❌ 发生错误: {str(e)}")
        return None


def validate_depth_fields(depth):
    """验证盘口数据字段"""
    print_section("验证盘口数据字段")
    
    # 基础字段（买卖五档）
    basic_fields = {
        "bid_price": "买价(1-5档)",
        "bid_volume": "买量(1-5档)",
        "ask_price": "卖价(1-5档)",
        "ask_volume": "卖量(1-5档)",
    }
    
    # 扩展字段
    extended_fields = {
        "last_price": "最新价",
        "volume": "成交量",
        "amount": "成交额",
        "open_interest": "持仓量",
        "highest": "最高价",
        "lowest": "最低价",
        "open": "开盘价",
        "close": "收盘价",
        "average": "均价",
        "settlement": "结算价",
        "pre_settlement": "昨结算",
        "pre_close": "昨收盘",
        "pre_open_interest": "昨持仓",
        "upper_limit": "涨停价",
        "lower_limit": "跌停价",
        "change": "涨跌",
        "change_percent": "涨跌幅",
        "instrument_name": "合约名称",
        "price_tick": "最小变动",
        "volume_multiple": "合约乘数",
        "datetime": "行情时间",
    }
    
    print("【基础字段检查】")
    basic_ok = 0
    for field, desc in basic_fields.items():
        if field in depth:
            value = depth[field]
            if isinstance(value, list):
                print(f"  ✅ {desc:20} [{', '.join(str(v) for v in value[:3])}...]")
            else:
                print(f"  ✅ {desc:20} {value}")
            basic_ok += 1
        else:
            print(f"  ❌ {desc:20} 缺失")
    
    print(f"\n基础字段: {basic_ok}/{len(basic_fields)} 通过")
    
    print("\n【扩展字段检查】")
    extended_ok = 0
    missing_fields = []
    
    for field, desc in extended_fields.items():
        if field in depth:
            value = depth[field]
            # 检查是否为有效值（不为"0"或空）
            is_valid = value not in ["0", "", None, 0]
            status = "✅" if is_valid else "⚠️ "
            print(f"  {status} {desc:12} {field:20} = {value}")
            if is_valid:
                extended_ok += 1
        else:
            print(f"  ❌ {desc:12} {field:20} = 缺失")
            missing_fields.append(field)
    
    print(f"\n扩展字段: {extended_ok}/{len(extended_fields)} 有效值")
    
    if missing_fields:
        print(f"\n缺失的字段: {', '.join(missing_fields)}")
    
    return basic_ok == len(basic_fields) and len(missing_fields) == 0


def display_formatted_depth(depth):
    """格式化显示盘口数据"""
    print_section("格式化显示盘口数据")
    
    # 显示买卖盘
    print("【买卖盘口】")
    print(f"{'档位':<8} {'卖价':>12} {'卖量':>12}     {'买价':>12} {'买量':>12}")
    print("-" * 65)
    
    for i in range(5):
        ask_price = depth.get("ask_price", [])[i] if i < len(depth.get("ask_price", [])) else "0"
        ask_volume = depth.get("ask_volume", [])[i] if i < len(depth.get("ask_volume", [])) else "0"
        bid_price = depth.get("bid_price", [])[i] if i < len(depth.get("bid_price", [])) else "0"
        bid_volume = depth.get("bid_volume", [])[i] if i < len(depth.get("bid_volume", [])) else "0"
        
        print(f"第{i+1}档  {ask_price:>12} {ask_volume:>12}     {bid_price:>12} {bid_volume:>12}")
    
    # 显示扩展数据
    print("\n【价格信息】")
    last_price = float(depth.get("last_price", 0))
    open_price = float(depth.get("open", 0))
    highest = float(depth.get("highest", 0))
    lowest = float(depth.get("lowest", 0))
    average = float(depth.get("average", 0))
    
    print(f"  最新价: {last_price:>10.0f}    开盘价: {open_price:>10.0f}")
    print(f"  最高价: {highest:>10.0f}    最低价: {lowest:>10.0f}")
    print(f"  均  价: {average:>10.0f}")
    
    print("\n【涨跌信息】")
    change = float(depth.get("change", 0))
    change_percent = float(depth.get("change_percent", 0))
    pre_settlement = float(depth.get("pre_settlement", 0))
    upper_limit = float(depth.get("upper_limit", 0))
    lower_limit = float(depth.get("lower_limit", 0))
    
    change_sign = "+" if change >= 0 else ""
    print(f"  涨  跌: {change_sign}{change:>10.0f}    涨跌幅: {change_sign}{change_percent:>9.2f}%")
    print(f"  昨结算: {pre_settlement:>10.0f}")
    print(f"  涨停价: {upper_limit:>10.0f}    跌停价: {lower_limit:>10.0f}")
    
    print("\n【成交信息】")
    volume = int(depth.get("volume", 0))
    amount = float(depth.get("amount", 0))
    open_interest = int(depth.get("open_interest", 0))
    pre_open_interest = int(depth.get("pre_open_interest", 0))
    
    # 格式化成交额
    if amount > 0:
        amount_wan = amount / 10000
        if amount_wan >= 10000:
            amount_str = f"{amount_wan/10000:.2f}亿元"
        else:
            amount_str = f"{amount_wan:.2f}万元"
    else:
        amount_str = "0"
    
    # 计算持仓量变化
    oi_change_str = ""
    if open_interest > 0 and pre_open_interest > 0:
        oi_change = open_interest - pre_open_interest
        oi_change_pct = (oi_change / pre_open_interest) * 100
        if oi_change != 0:
            oi_change_str = f" ({oi_change:+,}, {oi_change_pct:+.2f}%)"
    
    print(f"  成交量: {volume:>15,} 手")
    print(f"  成交额: {amount_str:>20}")
    print(f"  持仓量: {open_interest:>15,} 手{oi_change_str}")
    print(f"  昨持仓: {pre_open_interest:>15,} 手")
    
    print("\n【合约信息】")
    instrument_name = depth.get("instrument_name", "-")
    price_tick = float(depth.get("price_tick", 0))
    volume_multiple = int(depth.get("volume_multiple", 0))
    datetime_str = depth.get("datetime", "-")
    
    print(f"  合约名称: {instrument_name}")
    print(f"  最小变动: {price_tick}")
    print(f"  合约乘数: {volume_multiple} kg/手")
    print(f"  行情时间: {datetime_str}")


def test_debug_quote_fields():
    """测试调试接口：查看quote对象的所有字段"""
    print_section("测试调试接口：查看Quote对象所有字段")
    
    url = "http://localhost:8000/api/debug/quote-fields"
    
    print(f"请求URL: {url}")
    print()
    
    try:
        response = requests.get(url, timeout=10)
        
        print(f"响应状态码: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ 请求失败: {response.text}")
            return
        
        data = response.json()
        
        if not data.get("available"):
            print(f"❌ Quote数据未就绪: {data.get('error')}")
            return
        
        print("✅ Quote数据已就绪")
        print(f"\nQuote对象类型: {data.get('quote_type')}")
        
        # 显示各类字段统计
        print(f"\n【字段统计】")
        print(f"  所有字段: {len(data.get('all_fields', {}))} 个")
        print(f"  价格字段: {len(data.get('price_fields', {}))} 个")
        print(f"  成交量字段: {len(data.get('volume_fields', {}))} 个")
        print(f"  成交额字段: {len(data.get('amount_fields', {}))} 个")
        print(f"  持仓量字段: {len(data.get('position_fields', {}))} 个")
        print(f"  时间字段: {len(data.get('time_fields', {}))} 个")
        
        # 显示重要字段
        print(f"\n【重要字段值】")
        important_fields = data.get('other_important_fields', {})
        for field, value in sorted(important_fields.items())[:15]:  # 只显示前15个
            print(f"  {field:20} = {value}")
        
        if len(important_fields) > 15:
            print(f"  ... 还有 {len(important_fields) - 15} 个字段")
        
    except Exception as e:
        print(f"❌ 发生错误: {str(e)}")


def main():
    """主函数"""
    print("\n" + "🚀" * 40)
    print("  国内白银盘口扩展字段测试")
    print("  测试时间:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("🚀" * 40)
    
    # 测试1: 获取盘口数据
    depth = test_depth_tick_api()
    
    if depth:
        # 测试2: 验证字段
        all_ok = validate_depth_fields(depth)
        
        # 测试3: 格式化显示
        display_formatted_depth(depth)
        
        # 测试结果
        print_section("测试结果")
        if all_ok:
            print("✅ 所有测试通过！")
            print("   - 基础字段完整")
            print("   - 扩展字段完整")
            print("   - 数据格式正确")
        else:
            print("⚠️  部分测试未通过")
            print("   - 请检查缺失的字段")
    else:
        print_section("测试结果")
        print("❌ 无法获取盘口数据")
    
    # 测试4: 调试接口
    print("\n")
    test_debug_quote_fields()
    
    print("\n" + "="*80)
    print("测试完成")
    print("="*80 + "\n")


if __name__ == "__main__":
    main()

