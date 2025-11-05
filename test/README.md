# 测试脚本目录

本目录包含各种数据源测试脚本，包括：
1. **白银主力合约测试** - 测试TQSdk获取国内白银主力合约数据
2. **美元指数测试** - 测试TQSdk和AllTick API获取美元指数相关数据

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

---

## 美元指数测试

### 📋 快速查看

**查看总结:** 
```bash
cat test/SUMMARY_dollar_index.md
```

**查看详细文档:**
```bash
cat test/README_dollar_index.md
```

### ✅ 核心结论

✅ **可以通过 AllTick API 获取美元指数相关数据！**

虽然不能直接获取美元指数 (DXY)，但可以获取其主要成分货币对：
- ✅ EURUSD - EUR/USD (权重 57.6%)
- ✅ USDJPY - USD/JPY (权重 13.6%) 
- ✅ GBPUSD - GBP/USD (权重 11.9%)
- ✅ USDCAD - USD/CAD (权重 9.1%)
- ✅ USDCHF - USD/CHF (权重 3.6%)

**覆盖范围:** 美元指数 **95.8%** 的权重成分

### 🚀 快速使用

**推荐测试:**
```bash
python test/test_dollar_estimation.py
```

**API 使用:**
```bash
# 获取 EUR/USD 实时数据（最重要，权重 57.6%）
http://localhost:8000/api/data/trade-tick?symbol=EURUSD
http://localhost:8000/api/data/kline?symbol=EURUSD&interval=1m&limit=100
```

**前端使用:**
1. 打开 http://localhost:8000
2. 输入 `EURUSD` 查看实时行情

### 📁 测试文件

| 文件 | 功能 | 结果 |
|------|------|------|
| `test_dollar_estimation.py` | ⭐ 测试外汇货币对（推荐） | ✅ 成功 |
| `test_dollar_index_alltick.py` | 测试美元指数代码 | ❌ 无效 |
| `test_dollar_index.py` | 测试 TqSdk | ❌ 连接失败 |
| `README_dollar_index.md` | 详细文档 | 📖 说明 |
| `SUMMARY_dollar_index.md` | 快速总结 | 📋 总结 |

### 💡 简单使用提示

**只需监控 EUR/USD 即可了解美元走势！**
- EUR/USD 权重占 57.6%，是最重要的参考
- EUR/USD ↓ → 美元走强
- EUR/USD ↑ → 美元走弱

