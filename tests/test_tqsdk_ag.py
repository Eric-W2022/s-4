"""
TqSDK测试文件 - 使用白银主力合约测试
"""
from tqsdk import TqApi, TqAuth, TqKq

# 创建快期模拟账户
tq_kq = TqKq()

# 使用快期模拟账户连接（账号信息来自配置）
api = TqApi(account=tq_kq, auth=TqAuth("17665117821", "STC89c51"))

# 使用白银主力合约（当前活跃的合约）
symbol = "KQ.m@SHFE.ag"  # 白银主力连续合约

# 获取行情
quote = api.get_quote(symbol)
print("=" * 50)
print(f"合约: {quote.instrument_name} ({quote.instrument_id})")
print(f"最新价: {quote.last_price}")
print(f"买一价: {quote.bid_price1}  买一量: {quote.bid_volume1}")
print(f"卖一价: {quote.ask_price1}  卖一量: {quote.ask_volume1}")
print(f"今开盘: {quote.open}")
print(f"最高价: {quote.highest}")
print(f"最低价: {quote.lowest}")
print(f"成交量: {quote.volume}")
print(f"持仓量: {quote.open_interest}")
print(f"昨结算: {quote.pre_settlement}")
print("=" * 50)
print("\n")

# 下单限价单（买入开仓）
# 使用卖一价作为限价，确保能成交
buy_price = quote.ask_price1
print(f"开始下单: 买入开仓 1手，限价={buy_price} (卖一价，确保成交)")
order = api.insert_order(
    symbol=symbol, 
    direction='BUY', 
    offset='OPEN', 
    limit_price=buy_price,  # 使用卖一价，确保能成交
    volume=1
)

# 等待委托单状态更新
print("等待委托单状态更新...\n")
update_count = 0
max_updates = 20  # 最多等待20次更新
while order.status == 'ALIVE' and update_count < max_updates:
    api.wait_update()
    update_count += 1
    print(f"更新 {update_count}: 状态={order.status}, 原始数量={order.volume_orign}, 剩余数量={order.volume_left}")

if update_count >= max_updates and order.status == 'ALIVE':
    print("\n等待超时，订单仍未完成，可能需要撤单或等待更长时间")

print(f"\n委托单最终状态: {order.status}")
print(f"是否错误: {order.is_error}")
print(f"最后消息: {order.last_msg}")
print("\n")

# 打印快期模拟账户信息
print("=" * 50)
print("快期模拟账户信息")
print("=" * 50)
account_info = tq_kq.get_account()
print(f"账户ID: {account_info.get('user_id')}")
print(f"币种: {account_info.get('currency')}")
print(f"账户权益: {account_info.get('balance'):.2f}")
print(f"可用资金: {account_info.get('available'):.2f}")
print(f"冻结保证金: {account_info.get('frozen_margin'):.2f}")
print(f"持仓盈亏: {account_info.get('position_profit'):.2f}")
print(f"平仓盈亏: {account_info.get('close_profit'):.2f}")
print(f"风险度: {account_info.get('risk_ratio'):.4f}")
print("=" * 50)
print("\n")

# 获取具体合约持仓
actual_symbol = quote.instrument_id  # 获取实际合约代码
print("=" * 50)
print(f"持仓信息 ({actual_symbol})")
print("=" * 50)
position = tq_kq.get_position(actual_symbol)
print(f"多头持仓: {position.get('volume_long')}")
print(f"空头持仓: {position.get('volume_short')}")
print(f"多头冻结: {position.get('volume_long_frozen')}")
print(f"空头冻结: {position.get('volume_short_frozen')}")
print(f"持仓盈亏: {position.get('float_profit', 0)}")
print(f"保证金: {position.get('margin', 0)}")
print("=" * 50)
print("\n")

# 打印成交记录
if order.trade_records:
    print("=" * 50)
    print("成交记录")
    print("=" * 50)
    for trade_id, trade in order.trade_records.items():
        print(f"成交ID: {trade_id}")
        print(f"成交价格: {trade.get('price')}")
        print(f"成交数量: {trade.get('volume')}")
        print(f"成交时间: {trade.get('trade_date_time')}")
        print("-" * 50)
else:
    print("无成交记录")

print("\n")

# 关闭API连接
print("关闭API连接...")
api.close()
print("测试完成！")

