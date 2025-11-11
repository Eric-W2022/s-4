/**
 * 单手交易策略提示词
 * 用于AI分析单手交易决策
 */

import type { KlineData, DepthData, SingleHandPosition, SingleHandOperation } from '../types';

export interface BollingerBands {
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export interface SingleHandPromptParams {
  londonKline1m: KlineData[];
  londonKline15m: KlineData[];
  londonKline1d: KlineData[];
  domesticKline1m: KlineData[];
  domesticKline15m: KlineData[];
  domesticKline1d: KlineData[];
  domesticDepth: DepthData | null;
  currentPosition: SingleHandPosition;
  recentOperations: SingleHandOperation[];  // 最近10条操作记录
  currentPrice: number;  // 当前价格
  domesticBollinger1m?: BollingerBands;  // 国内1分钟布林带
  domesticBollinger15m?: BollingerBands;  // 国内15分钟布林带
}

/**
 * 构建单手交易策略提示词消息数组
 */
export function buildSingleHandMessages(params: SingleHandPromptParams): Array<{role: string, content: string}> {
  const {
    londonKline1m,
    londonKline15m,
    londonKline1d,
    domesticKline1m,
    domesticKline15m,
    domesticKline1d,
    domesticDepth,
    currentPosition,
    recentOperations,
    currentPrice,
    domesticBollinger1m,
    domesticBollinger15m,
  } = params;

  // 格式化K线数据（分钟级别）
  const formatKlineData = (klines: KlineData[], count: number = 20) => {
    return klines.slice(-count).map(k => {
      const time = new Date(k.t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      return `${time}: 开${k.o.toFixed(2)}/高${k.h.toFixed(2)}/低${k.l.toFixed(2)}/收${k.c.toFixed(2)}`;
    }).join('\n');
  };

  // 格式化K线数据（日线级别）
  const formatKlineDataDaily = (klines: KlineData[], count: number = 50) => {
    return klines.slice(-count).map(k => {
      const date = new Date(k.t).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
      return `${date}: 开${k.o.toFixed(2)}/高${k.h.toFixed(2)}/低${k.l.toFixed(2)}/收${k.c.toFixed(2)}`;
    }).join('\n');
  };

  // 格式化盘口数据
  const formatDepthData = (depth: DepthData | null) => {
    if (!depth) return '盘口数据不可用';
    
    const asks = depth.ask_price.slice(0, 5).map((price, idx) => 
      `卖${5-idx}: ${price} (${depth.ask_volume[idx]})`
    ).reverse().join('\n');
    
    const bids = depth.bid_price.slice(0, 5).map((price, idx) => 
      `买${idx+1}: ${price} (${depth.bid_volume[idx]})`
    ).join('\n');
    
    // 格式化涨跌数据
    const priceInfo = depth.last_price ? `当前价: ${depth.last_price}` : '';
    const changeInfo = depth.change && depth.change_percent 
      ? `  涨跌: ${depth.change} (${depth.change_percent}%)`
      : '';
    
    // 格式化成交和持仓数据
    const volumeInfo = depth.volume ? `成交量: ${depth.volume}` : '';
    const openInterestInfo = depth.open_interest ? `  持仓量: ${depth.open_interest}` : '';
    const openInterestChange = depth.open_interest && depth.pre_open_interest
      ? `  持仓差: ${(Number(depth.open_interest) - Number(depth.pre_open_interest)).toFixed(0)}`
      : '';
    
    // 格式化价格区间
    const priceRangeInfo = depth.open && depth.highest && depth.lowest
      ? `开盘: ${depth.open}  最高: ${depth.highest}  最低: ${depth.lowest}`
      : '';
    
    return `${asks}
${priceInfo}${changeInfo}
${bids}

${priceRangeInfo}
${volumeInfo}${openInterestInfo}${openInterestChange}`;
  };

  // 格式化当前持仓
  const formatPosition = (position: SingleHandPosition) => {
    if (!position.hasPosition) {
      return '当前无持仓，可以开仓';
    }
    
    const duration = position.entryTime 
      ? Math.round((Date.now() - position.entryTime) / 60000) 
      : 0;
    
    return `当前持仓: ${position.direction}单
入场价: ${position.entryPrice?.toFixed(0)}
入场时间: ${position.entryTime ? new Date(position.entryTime).toLocaleTimeString('zh-CN') : '未知'}
持仓时长: ${duration}分钟
当前价格: ${position.currentPrice?.toFixed(0)}
盈亏点数: ${position.profitLossPoints?.toFixed(0)}点
盈亏金额: ${position.profitLossMoney?.toFixed(0)}元 (每点15元)
最高盈利: ${position.maxProfitPoints?.toFixed(0)}点 (${position.maxProfitMoney?.toFixed(0)}元)
回撤比例: ${position.drawdownPercent?.toFixed(1)}% (从最高点回撤)`;
  };

  // 格式化操作历史
  const formatOperations = (operations: SingleHandOperation[]) => {
    if (operations.length === 0) {
      return '暂无历史操作记录';
    }
    
    return operations.map((op, idx) => {
      const time = new Date(op.timestamp).toLocaleTimeString('zh-CN');
      const profitInfo = op.profitLossPoints !== undefined 
        ? ` | 盈亏: ${op.profitLossPoints.toFixed(0)}点 (${op.profitLossMoney?.toFixed(0)}元)`
        : '';
      return `${idx+1}. [${time}] ${op.action} @ ${op.price.toFixed(0)}${profitInfo}\n   原因: ${op.reason}`;
    }).join('\n\n');
  };

  // 格式化布林带数据
  const formatBollinger = (bollinger?: BollingerBands, label: string = '') => {
    if (!bollinger || bollinger.upper === null || bollinger.middle === null || bollinger.lower === null) {
      return `${label}布林带：数据不可用`;
    }
    return `${label}布林带：上轨${bollinger.upper.toFixed(0)} | 中轨${bollinger.middle.toFixed(0)} | 下轨${bollinger.lower.toFixed(0)}`;
  };

  // 每个数据项都是一个独立的user message
  const messages = [
    {
      role: 'user',
      content: `当前价格\n国内白银主力当前价: ${currentPrice.toFixed(0)}`
    },
    {
      role: 'user',
      content: `伦敦现货白银 (1分钟K线，最近100根)\n${formatKlineData(londonKline1m, 100)}`
    },
    {
      role: 'user',
      content: `伦敦现货白银 (15分钟K线，最近50根)\n${formatKlineData(londonKline15m, 50)}`
    },
    {
      role: 'user',
      content: `伦敦现货白银 (日线，最近50根)\n${formatKlineDataDaily(londonKline1d, 50)}`
    },
    {
      role: 'user',
      content: `国内白银主力 (1分钟K线，最近100根)\n${formatKlineData(domesticKline1m, 100)}`
    },
    {
      role: 'user',
      content: `国内白银主力 (15分钟K线，最近50根)\n${formatKlineData(domesticKline15m, 50)}`
    },
    {
      role: 'user',
      content: `国内白银主力 (日线，最近50根)\n${formatKlineDataDaily(domesticKline1d, 50)}`
    },
    {
      role: 'user',
      content: `国内白银盘口\n${formatDepthData(domesticDepth)}`
    },
    {
      role: 'user',
      content: `技术指标\n${formatBollinger(domesticBollinger1m, '1分钟')}\n${formatBollinger(domesticBollinger15m, '15分钟')}`
    },
    {
      role: 'user',
      content: `当前持仓状态\n${formatPosition(currentPosition)}`
    },
    {
      role: 'user',
      content: `最近10条操作记录\n${formatOperations(recentOperations)}`
    }
  ];

  // 最后一个user message：分析要求
  const analysisMessage = {
    role: 'user',
    content: `分析要求

请基于以上市场数据和持仓状态，给出你的交易决策。

**重要提醒**：
1. **盈利≥30点时**：默认应该平仓！除非是明显的单边暴涨/暴跌行情（连续大K线、布林带狂奔）
2. **震荡行情**：盈利≥30点立即平仓，不要等！震荡中不可能吃到大行情！
3. **回撤>50%**：**必须平仓**，不要找任何借口持有！
4. **回撤>40%**：**优先平仓**，守住利润！
5. 根据盈利水平动态调整：盈利越大越保守，盈利小时可激进。

分析维度

1. **图形技术分析**（15分钟短线）：
   - K线形态：头肩顶/底、双顶/底、三角形、楔形、吞没、锤子线等经典形态
   - 均线系统：MA5、MA10、MA20的排列和交叉情况（金叉/死叉）
   - 布林带：价格与布林带上中下轨的位置关系
     * 价格触及上轨：超买，可能回调
     * 价格触及下轨：超卖，可能反弹
     * 价格在中轨附近：震荡，等待方向
     * 布林带收窄：酝酿突破
     * 布林带扩张：趋势加速
   - 趋势判断：上升趋势、下降趋势、横盘震荡
   - 支撑阻力：关键价格支撑位和阻力位（结合K线、布林带、整数关口）
   - 成交量：放量突破、缩量整理、量价配合情况

2. **多周期共振**：
   - 日线趋势：大周期方向判断
   - 15分钟趋势：中周期方向
   - 1分钟趋势：入场时机把握
   - 伦敦与国内：内外盘联动性分析

3. **盘口分析**：
   - 买卖盘力量对比（买一买二 vs 卖一卖二）
   - 大单压力：是否有明显的大单挂单
   - 成交活跃度：盘口流动性判断

4. **持仓评估**（如有持仓）：
   - **最高盈利和回撤**：**这是决策的核心依据！优先级最高！**
     * 最高盈利：显示持仓期间的最佳时机（基于实际最高价/最低价）
     * 回撤比例：显示利润回吐程度
     * **回撤判断标准**：
       - 回撤>60%：**立即平仓**！无需考虑其他因素！
       - 回撤50-60%：**强烈建议平仓**！除非有极强上涨/下跌信号
       - 回撤40-50%：**优先平仓**，趋势减弱必须平
       - 回撤30-40%：警惕状态，结合趋势决定
       - 回撤<30%：正常回调，可以持有
   - 当前盈亏：是否达到止盈/止损条件
   - 持仓时长：是否超过合理持仓时间
   - 市场变化：开仓后市场是否按预期发展
   - **核心原则**：守住利润比追求更大利润更重要！回撤大于50%立即平仓！

5. **历史操作反思**：
   - 分析最近操作的成功率
   - 总结失败操作的原因
   - 避免重复犯错
   - 强化成功策略
   - **特别注意**：如果有平仓记录显示"曾经盈利很多但最后盈利很少"，说明没有守住利润，要吸取教训！

策略偏好（激进型，追求大盈利）

**开仓策略**：
- ✓ 趋势明确时果断开仓，不犹豫（多周期K线方向一致）
- ✓ 多周期共振时加大持仓信心（日线、15分钟、1分钟方向一致）
- ✓ 布林带突破：价格突破上轨做多，跌破下轨做空（突破后追涨杀跌）
- ✓ 布林带反转：价格触及下轨反弹做多，触及上轨回调做空
- ✓ 关键位置突破：整数关口、前高前低突破时果断跟进
- ✓ K线形态确认：吞没、锤子线等反转形态出现时立即入场
- ✓ 强趋势行情：连续阳线/阴线时，顺势追入，不怕追高/杀低
- ✗ 趋势完全不明、完全横盘时才观望

**平仓策略**（优先级从高到低）：
1. **回撤保护平仓**（最优先！绝对优先！）：**最高盈利和回撤比例是最关键数据！**
   - **最高盈利≥20点 且 回撤≥50%：立即平仓！** 利润已经大幅回吐，必须止盈！
   - **最高盈利≥15点 且 回撤≥60%：立即平仓！** 不能坐过山车！
   - **最高盈利≥10点 且 回撤≥70%：立即平仓！** 再等利润就没了！
   - **重要**：回撤超过50%说明趋势已经明显减弱，不要再找理由持有！
   - 例：最高25点→现在10点，回撤60%→**必须平仓**，不要说"趋势未反转"！
2. **30点以上落袋为安**（优先级第二！）：
   - **盈利≥30点时**：默认应该平仓，落袋为安！
   - **震荡行情30点必平**：价格在区间内反复震荡，没有明确方向，立即平仓
   - **单边强势可持有**：只有在以下情况才考虑继续持有：
     * 连续大阳线/大阴线（实体大，上下影线短）
     * 布林带持续扩张，价格沿上轨/下轨奔跑
     * 成交量持续放大，动能强劲
     * 关键阻力/支撑被强势突破
   - **判断标准**：如果不是明显的单边暴涨/暴跌行情，30点就平仓！
3. **动态决策原则**：根据盈利水平灵活调整策略
   - **盈利≥30点**：优先平仓，除非单边极强（回撤10%就平）
   - **盈利20-30点**：适度灵活，回撤30%就平仓，守住利润
   - **盈利10-20点**：稍微激进，回撤50%才平仓，给空间
   - **盈利<10点**：可以等待，但要警惕趋势反转
4. **动力衰竭平仓**：观察K线和成交量，上涨/下跌动力明显减弱时果断止盈
   - 连续小阳/小阴线，振幅收窄
   - 价格在高位/低位反复震荡，无法突破
   - 出现明显的上影线/下影线，表明压力/支撑强大
5. **趋势反转平仓**：出现明确反转信号时立即平仓
   - K线形态反转（如十字星、吞没、乌云盖顶等）
   - 跌破关键支撑位/突破关键阻力位
   - 均线死叉/金叉
6. **宽容止损**：亏损达到15-20点时止损（给趋势发展空间）
7. **时间止盈**：持仓超过20分钟时要更加谨慎
   - 盈利>20点但趋势减弱：考虑止盈，别等到回撤
   - 盈利10-20点：结合趋势和回撤决定
   - 盈利<10点且超过30分钟：考虑离场

**持有策略**：
- **盈利30点以下**：
  * 盈利<10点或回撤<30%：可以持有等待
  * 盈利10-20点且回撤30-40%：趋势强劲可持有，趋势减弱应平
  * 盈利20-30点且回撤>40%：倾向于平仓
- **盈利30点以上**：
  * **默认不持有**，应该平仓落袋为安
  * **仅在单边暴涨/暴跌**时持有：连续大K线、布林带狂奔、成交量暴增
  * **震荡行情**：立即平仓，不要贪心
- **绝不持有**：任何情况下回撤>50%，立即平仓

风险控制与灵活策略

- 单次止损控制在20点以内（300元）
- 单次盈利目标20-50点（300-750元）
- **动态策略调整**：
  * 小盈利（<20点）：可激进等待，给趋势发展空间
  * 中盈利（20-30点）：适度保守，回撤30%就考虑平仓
  * **大盈利（≥30点）**：优先平仓！震荡中必平！单边强势才能持有！
- **守利润铁律**：
  * **盈利≥30点**：震荡行情立即平仓，单边行情回撤10%也要平
  * **回撤超过50%**：立即平仓，无论任何理由
  * **回撤超过40%**：优先平仓，除非有极强信号
- **行情识别**：
  * 单边行情：连续大K线、布林带狂奔、成交量暴增、强势突破
  * 震荡行情：小K线反复、布林带收窄、价格区间震荡、缺乏方向
- **决策灵活性**：根据实时行情类型（单边/震荡）、盈利水平、回撤程度综合判断

输出格式

请严格按照以下JSON格式输出（不要包含markdown代码块标记）:

{
  "action": "开多/开空/平仓/持有/观望",
  "reason": "详细的决策理由，包括：1)图形形态分析 2)趋势判断 3)支撑阻力位 4)盘口情况 5)持仓评估(如有) 6)操作依据",
  "confidence": 85,
  "targetPrice": 8650
}

字段说明：
- action: 必须是"开多"、"开空"、"平仓"、"持有"或"观望"之一
- reason: 详细说明分析逻辑（150字以内，重点突出）
- confidence: 信心度（0-100），基于技术指标一致性
- targetPrice: 目标价格（开仓时必填，平仓、持有和观望时可不填）

约束条件：
1. 如果当前有持仓，不能再开新仓，只能选择"平仓"或"持有"
2. 如果当前无持仓，不能选择"平仓"或"持有"，只能选择"开多"、"开空"或"观望"
3. 开仓时confidence必须≥50%即可，敢于出手（降低门槛）
4. 采用激进策略，追求大盈利，允许持仓30分钟以上
5. 参考历史操作记录，总结大盈利经验，复制成功模式`
  };

  // 返回所有消息（10个数据message + 1个分析要求message）
  return [...messages, analysisMessage];
}

