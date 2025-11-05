# 美元指数数据测试总结

## 🎯 核心结论

✅ **可以获取美元指数相关数据！**

虽然 TqSdk 和 AllTick API 都不直接支持美元指数 (DXY)，但 **AllTick API 支持外汇货币对数据**，可以通过主要货币对来监控美元走势。

## ✅ 可用方案

### 使用 AllTick API 的外汇货币对（推荐）

**可用的货币对:**
- ✅ `EURUSD` - EUR/USD (权重 57.6%) 
- ✅ `USDJPY` - USD/JPY (权重 13.6%)
- ✅ `GBPUSD` - GBP/USD (权重 11.9%)
- ✅ `USDCAD` - USD/CAD (权重 9.1%)
- ✅ `USDCHF` - USD/CHF (权重 3.6%)

**覆盖范围:** 美元指数 **95.8%** 的权重成分

**估算美元指数:** **103.74** (2025-11-06 测试)

## 🚀 快速使用

### 方法 1: 通过 API 接口

```bash
# 获取 EUR/USD 实时价格（最重要，权重 57.6%）
http://localhost:8000/api/data/trade-tick?symbol=EURUSD

# 获取 EUR/USD K线数据
http://localhost:8000/api/data/kline?symbol=EURUSD&interval=1m&limit=100

# 获取盘口深度
http://localhost:8000/api/data/depth-tick?symbol=EURUSD
```

### 方法 2: 通过前端界面

1. 打开浏览器访问: `http://localhost:8000`
2. 在交易品种输入框输入: `EURUSD`
3. 查看实时行情和K线图

### 方法 3: 运行测试脚本

```bash
# 测试所有货币对并估算美元指数
cd /Users/zhangzhigong/cursor/s-4
python test/test_dollar_estimation.py
```

## 📊 数据映射关系

| 货币对 | 代码 | 权重 | 与美元关系 |
|--------|------|------|-----------|
| 欧元/美元 | EURUSD | 57.6% | 反向（EUR/USD↑ → 美元↓） |
| 美元/日元 | USDJPY | 13.6% | 正向（USD/JPY↑ → 美元↑） |
| 英镑/美元 | GBPUSD | 11.9% | 反向（GBP/USD↑ → 美元↓） |
| 美元/加元 | USDCAD | 9.1% | 正向（USD/CAD↑ → 美元↑） |
| 美元/瑞郎 | USDCHF | 3.6% | 正向（USD/CHF↑ → 美元↑） |
| 美元/瑞典克朗 | USDSEK | 4.2% | 正向（USD/SEK↑ → 美元↑） |

**说明:**
- **反向:** 货币对上涨意味着美元贬值
- **正向:** 货币对上涨意味着美元升值

## 💡 使用建议

### 简单监控
**只看 EUR/USD 即可**
- EUR/USD 权重占 57.6%，是最重要的参考指标
- EUR/USD 下跌 → 美元走强
- EUR/USD 上涨 → 美元走弱

### 精确监控
**同时监控多个货币对**
```python
# 推荐监控的三大货币对（覆盖 83.1% 权重）
EURUSD  # 57.6%
USDJPY  # 13.6%
GBPUSD  # 11.9%
```

### 自动估算
运行测试脚本自动计算美元指数估值：
```bash
python test/test_dollar_estimation.py
```

## ❌ 不可用方案

### TqSdk
- ❌ 不支持美元指数
- ❌ 主要提供中国期货市场数据
- ❌ SSL 连接问题

### AllTick 直接获取美元指数
- ❌ `DINIW` - 无效
- ❌ `DXY` - 无效
- ❌ `USDX` - 无效

## 📁 测试文件

| 文件 | 功能 | 结果 |
|------|------|------|
| `test_dollar_estimation.py` | 测试外汇货币对（推荐） | ✅ 成功 |
| `test_dollar_index_alltick.py` | 测试美元指数代码 | ❌ 无效 |
| `test_dollar_index.py` | 测试 TqSdk | ❌ 连接失败 |
| `README_dollar_index.md` | 详细文档 | 📖 说明 |

## 🔍 示例数据

**2025-11-06 测试结果:**

```
货币对实时价格:
  EURUSD: 1.14789
  GBPUSD: 1.30406
  USDJPY: 154.227
  USDCAD: 1.41245
  USDCHF: 0.81110

估算美元指数: 103.74
```

## 📞 需要帮助？

查看详细文档:
```bash
cat test/README_dollar_index.md
```

运行测试:
```bash
python test/test_dollar_estimation.py
```

## ⚠️ 免责声明

- 估算的美元指数仅供参考，不能作为交易依据
- 真实的美元指数 (DXY) 计算公式更复杂
- 如需精确的 DXY 数据，请使用专业数据服务（如 iTick）

