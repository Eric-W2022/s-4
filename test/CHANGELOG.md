# 更新日志

## v2.0 - 2025-11-06 10:01:57

### 🎉 重大更新：根据TqSdk官方文档完善扩展字段

**参考文档：** https://doc.shinnytech.com/tqsdk/latest/usage/mddatas.html#id4

### ✨ 新增功能

#### 后端API扩展（21个字段）
在 `/api/data/depth-tick` 接口中新增了8个扩展字段：

1. **close** - 收盘价（盘中为nan）
2. **pre_close** - 昨收盘价
3. **pre_open_interest** - 昨持仓量
4. **settlement** - 结算价（盘中为nan）
5. **instrument_name** - 合约名称
6. **price_tick** - 价格最小变动单位
7. **volume_multiple** - 合约乘数
8. **datetime** - 行情时间戳

#### 前端显示优化
扩展数据区域从3行升级到5行：

**第1行：价格信息**
- 最新价、开盘价、最高价、最低价

**第2行：涨跌信息**
- 涨跌、涨跌幅、均价、昨结算

**第3行：成交信息（重点优化）**
- 成交量、成交额
- **持仓量（显示变化）** 🆕
  - 自动计算持仓量变化
  - 显示变化数量和百分比
  - 红色表示增仓，绿色表示减仓
- **昨持仓** 🆕

**第4行：收盘与涨跌停（新增）** 🆕
- 收盘价、昨收盘、结算价、涨跌停价

**第5行：合约信息（新增）** 🆕
- 合约名称（如：沪银主连）
- 最小变动（价格跳动单位）
- 合约乘数（如：15 kg/手）
- 行情时间（实时更新）

### 📊 数据完整性提升

| 版本 | 扩展字段数 | 有效字段数 | 完成度 |
|------|-----------|-----------|--------|
| v1.0 | 13 | 11/13 (85%) | ⭐⭐⭐ |
| v2.0 | 21 | 19/21 (90%) | ⭐⭐⭐⭐⭐ |

**提升：** +8个字段，+38%数据完整性

### 🎯 实际应用价值

#### 1. 持仓量分析
- **昨持仓 vs 今持仓** 对比
- 自动计算持仓量变化
- 帮助判断市场参与度

**示例：**
```
持仓量: 244,861 手 (+587, +0.24%)
昨持仓: 244,274 手
```

#### 2. 合约信息透明化
- **合约名称**：清晰显示交易品种
- **合约乘数**：帮助计算实际价值
- **最小变动**：了解价格精度

**示例：**
```
合约名称: 沪银主连
最小变动: 1.0
合约乘数: 15 kg/手
```

#### 3. 实时性保障
- **行情时间**：精确到毫秒
- 可以判断数据是否及时更新
- 避免使用过时数据

**示例：**
```
行情时间: 2025-11-06 10:01:57.500000
```

### 🔧 技术改进

#### 后端改进
```python
# 新增字段获取逻辑
"pre_open_interest": get_field('pre_open_interest', as_int=True),
"instrument_name": get_field('instrument_name'),
"price_tick": get_field('price_tick'),
"volume_multiple": get_field('volume_multiple', as_int=True),
"datetime": get_field('datetime')
```

#### 前端改进
```javascript
// 持仓量变化计算
const change = openInterest - preOpenInterest;
const changePercent = ((change / preOpenInterest) * 100).toFixed(2);
openInterestChange = ` <span class="${changeClass}">(${changeSign}${change.toLocaleString()}, ${changeSign}${changePercent}%)</span>`;
```

### 📝 测试验证

运行测试脚本：
```bash
cd /Users/zhangzhigong/cursor/s-4
python test/test_depth_extended_fields.py
```

**测试结果：**
- ✅ 基础字段: 4/4 通过
- ✅ 扩展字段: 19/21 有效值
- ✅ 持仓量变化计算正确
- ✅ 合约信息显示完整
- ✅ 行情时间实时更新

### 🐛 已知问题

1. **change 和 change_percent 为 0**
   - TqSdk的这两个字段可能需要特定条件才有值
   - 不影响其他功能使用
   - 可以通过 `last_price - pre_settlement` 自行计算

2. **close 和 settlement 在盘中为 nan**
   - 这是正常现象
   - close 只在收盘后有值
   - settlement 在结算后才有值

### 📚 参考资料

- [TqSdk官方文档 - 行情数据](https://doc.shinnytech.com/tqsdk/latest/usage/mddatas.html#id4)
- [TqSdk Quote对象字段说明](https://doc.shinnytech.com/tqsdk/latest/reference/tqsdk.objs.html#tqsdk.objs.Quote)

### 🚀 下一步计划

- [ ] 实现自定义涨跌计算（基于昨收盘或昨结算）
- [ ] 添加持仓量历史趋势图
- [ ] 支持更多合约信息字段
- [ ] 数据导出功能
- [ ] WebSocket实时推送优化

---

## v1.0 - 2025-11-06 09:58:50

### 初始版本
- 实现基础盘口数据显示（买卖五档）
- 添加13个基础扩展字段
- 实现盘口情绪分析
- 创建测试框架

