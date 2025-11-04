# TQSdk 白银主力合约测试

本目录包含测试TQSdk获取国内白银主力合约实时盘口数据的脚本。

## 安装依赖

```bash
pip install tqsdk
```

## 配置账号

1. 注册快期账号: https://www.shinnytech.com/register/
2. 在 `test_silver_quote.py` 中替换账号密码：

```python
api = TqApi(auth=TqAuth("您的快期账号", "您的快期密码"))
```

## 运行测试

```bash
cd test
python test_silver_quote.py
```

## 测试说明

### 主力连续合约
脚本使用 `KQ.m@SHFE.ag` 获取白银主力连续合约，这个合约会自动指向当前的主力合约。

### 具体合约
如果需要获取特定月份的合约，可以使用：
- `SHFE.ag2506` - 2025年6月白银合约
- `SHFE.ag2512` - 2025年12月白银合约

### 输出数据

脚本会实时输出以下盘口数据：
- 基本信息：合约代码、合约名称
- 价格信息：最新价、开盘价、最高价、最低价、昨收盘、昨结算
- 五档盘口：买卖五档的价格和数量
- 成交和持仓：成交量、成交额、持仓量
- 涨跌停价：涨停价、跌停价

## 注意事项

1. TQSdk需要有效的快期账号才能获取实时数据
2. 白银期货在上海期货交易所（SHFE）交易
3. 交易时间内数据更新更加活跃
4. 非交易时间可能获取的是快照数据

## 参考文档

- TQSdk官方文档: https://doc.shinnytech.com/tqsdk/latest/
- API参考: https://doc.shinnytech.com/tqsdk/latest/reference/index.html

