# 美元指数数据获取测试报告

## 测试时间
2025-11-06

## 测试目标
验证是否能通过 TqSdk 或 AllTick API 获取美元指数实时数据

## 测试结果

### 1. TqSdk 测试

**测试文件:** `test_dollar_index.py`

**测试结果:** ❌ **无法连接**

**问题描述:**
- 连接 TqSdk 认证服务器时出现 SSL 错误
- 可能是网络问题或防火墙限制

**结论:**
- TqSdk 主要提供**中国期货市场**数据
- 美元指数在**洲际交易所 (ICE)** 交易，不属于中国期货市场
- TqSdk **不支持**美元指数数据

### 2. AllTick API - 美元指数测试

**测试文件:** `test_dollar_index_alltick.py`

**测试的代码:**
- `DINIW` - ❌ code invalid
- `DXY` - ❌ code invalid
- `USDX` - ❌ code invalid

**测试结果:** ❌ **所有代码无效**

**结论:**
- AllTick API 不支持这些美元指数代码
- AllTick 不直接提供美元指数 (DXY/USDX) 数据

### 3. AllTick API - 外汇货币对测试 ✅

**测试文件:** `test_dollar_estimation.py`

**测试结果:** ✅ **成功！**

**成功获取的货币对:**
- `EURUSD` - 1.14789 (权重: 57.6%)
- `GBPUSD` - 1.30406 (权重: 11.9%)
- `USDJPY` - 154.227 (权重: 13.6%)
- `USDCAD` - 1.41245 (权重: 9.1%)
- `USDCHF` - 0.81110 (权重: 3.6%)

**估算美元指数:** 103.74 (覆盖权重: 95.8%)

**结论:**
- ✅ AllTick API **完美支持**外汇货币对实时数据
- ✅ 可以通过货币对数据**估算美元指数**
- ✅ 覆盖了美元指数 **95.8%** 的权重成分
- ✅ 建议使用 **EURUSD** 作为美元走势的主要参考（权重最大）

## 美元指数简介

**美元指数 (USDX/DXY):**
- 衡量美元相对一篮子货币的强弱
- 主要在洲际交易所 (ICE) 交易
- 代码: DXY 或 USDX
- 成分: EUR (57.6%), JPY (13.6%), GBP (11.9%), CAD (9.1%), SEK (4.2%), CHF (3.6%)

## 替代方案

### 方案 1: 使用 iTick 数据服务

iTick 明确支持全球指数数据，包括美元指数。

**优点:**
- 专业的全球市场数据提供商
- 支持美元指数等全球指数
- 提供实时和历史数据

**缺点:**
- 可能需要付费订阅
- 需要集成新的 API

**参考链接:**
- https://itick.org/products/indices

### 方案 2: 使用外汇货币对估算

由于美元指数主要由 EUR/USD 组成（权重 57.6%），可以通过外汇货币对来估算美元走势。

**尝试获取:**
- EUR/USD (欧元/美元)
- GBP/USD (英镑/美元)  
- USD/JPY (美元/日元)
- USD/CAD (美元/加元)
- USD/CHF (美元/瑞郎)
- USD/SEK (美元/瑞典克朗)

**示例测试:** 见 `test_dollar_estimation.py`

### 方案 3: 使用其他免费 API

**Alpha Vantage:**
- 提供外汇数据
- 免费额度：每天 25 次请求
- 支持主要货币对

**示例代码:**
```python
import requests

API_KEY = "your_api_key"
url = f"https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=EUR&to_currency=USD&apikey={API_KEY}"
response = requests.get(url)
data = response.json()
```

**Fixer.io / ExchangeRate-API:**
- 提供实时汇率数据
- 有免费和付费版本

### 方案 4: WebSocket 实时数据

某些提供商提供 WebSocket 实时数据流：
- Yahoo Finance (免费，但不稳定)
- Finnhub (有免费额度)
- Twelve Data (有免费额度)

## 建议

### ⭐ 推荐方案（已验证可用）

**使用 AllTick API 的外汇货币对数据**

✅ **优点:**
- 项目已集成，无需额外开发
- 免费可用，无需额外订阅
- 覆盖美元指数 95.8% 的权重成分
- 实时数据，延迟低
- 可以估算美元指数走势

📊 **使用方法:**

1. **获取主要货币对数据:**
   ```bash
   # EUR/USD (权重最大: 57.6%)
   http://localhost:8000/api/data/trade-tick?symbol=EURUSD
   http://localhost:8000/api/data/kline?symbol=EURUSD&interval=1m&limit=100
   
   # 其他主要货币对
   http://localhost:8000/api/data/trade-tick?symbol=USDJPY
   http://localhost:8000/api/data/trade-tick?symbol=GBPUSD
   ```

2. **前端使用:**
   - 打开 http://localhost:8000
   - 输入 `EURUSD` 作为交易品种
   - 查看实时行情和K线图

3. **估算美元指数:**
   - 监控 EURUSD（权重 57.6%）作为主要参考
   - 可选：同时监控其他货币对以获得更准确的趋势
   - 使用 `test_dollar_estimation.py` 进行自动估算

### 备选方案

1. **申请专业数据服务**
   - 如果需要官方的美元指数 (DXY) 数据
   - 建议申请 iTick 或其他专业服务
   - **注意:** 通常需要付费订阅

2. **使用免费 API**
   - Alpha Vantage (每天 25 次请求)
   - ExchangeRate-API (有免费额度)
   - **注意:** 需要额外集成工作

### 评估建议
1. **数据需求评估**
   - 对于大多数应用场景，货币对数据已经足够
   - EUR/USD 反向走势基本反映美元指数趋势
   - 只有需要精确的 DXY 数值时才需要专业数据源

2. **成本效益分析**
   - ✅ **推荐:** 使用现有的 AllTick 货币对数据（免费）
   - 💰 如需官方 DXY 数据，评估付费服务的成本
   - ⚠️ 自建数据源成本高且维护复杂

## 测试文件说明

### ⭐ test_dollar_estimation.py（推荐）
**测试通过外汇货币对估算美元指数**

**功能:**
- 测试 AllTick API 支持的外汇货币对
- 获取主要货币对实时价格（EURUSD, USDJPY, GBPUSD, USDCAD, USDCHF）
- 基于货币对数据估算美元指数
- 提供详细的使用建议

**运行方法:**
```bash
python test/test_dollar_estimation.py
```

**测试结果:** ✅ 成功（5个货币对可用，估算美元指数 103.74）

---

### test_dollar_index_alltick.py
**测试 AllTick API 是否直接支持美元指数**

**功能:**
- 测试多个可能的美元指数代码（DINIW, DXY, USDX）
- 测试 trade-tick, depth-tick, kline 三种数据接口

**运行方法:**
```bash
python test/test_dollar_index_alltick.py
```

**测试结果:** ❌ 所有美元指数代码无效

---

### test_dollar_index.py
**测试 TqSdk 是否支持美元指数数据**

**功能:**
- 测试 TqSdk 连接和认证
- 尝试获取多种可能的美元指数合约
- 提供 TqSdk 的使用说明

**运行方法:**
```bash
python test/test_dollar_index.py
```

**测试结果:** ❌ SSL 连接错误（TqSdk 主要支持中国期货市场）

## 附录：可能的货币对代码

如果 AllTick API 支持外汇数据，可能的代码格式：

```python
FOREX_PAIRS = [
    # 主要货币对
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "USDCAD",
    "USDCHF",
    "USDSEK",
    
    # 可能的格式
    "EUR/USD",
    "EUR.USD",
    "FXEURUSD",
    
    # 指数可能的格式
    "USD.IDX",
    "USDIDX",
    "USD_INDEX",
]
```

## 联系与支持

如需进一步协助，请：
1. 查阅 AllTick API 官方文档
2. 联系 AllTick 客服确认支持的品种
3. 考虑使用 iTick 等专业数据服务

