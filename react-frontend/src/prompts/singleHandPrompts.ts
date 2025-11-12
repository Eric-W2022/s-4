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
      const volume = k.v !== undefined ? ` 量${k.v >= 10000 ? (k.v / 10000).toFixed(1) + 'w' : k.v.toFixed(0)}` : '';
      return `${time}: 开${k.o.toFixed(2)}/高${k.h.toFixed(2)}/低${k.l.toFixed(2)}/收${k.c.toFixed(2)}${volume}`;
    }).join('\n');
  };

  // 格式化K线数据（日线级别）
  const formatKlineDataDaily = (klines: KlineData[], count: number = 50) => {
    return klines.slice(-count).map(k => {
      const date = new Date(k.t).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
      const volume = k.v !== undefined ? ` 量${k.v >= 10000 ? (k.v / 10000).toFixed(1) + 'w' : k.v.toFixed(0)}` : '';
      return `${date}: 开${k.o.toFixed(2)}/高${k.h.toFixed(2)}/低${k.l.toFixed(2)}/收${k.c.toFixed(2)}${volume}`;
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
    
    // 锁仓状态
    if (position.isLocked && position.longPosition && position.shortPosition) {
      const longDuration = Math.round((Date.now() - position.longPosition.entryTime) / 60000);
      const shortDuration = Math.round((Date.now() - position.shortPosition.entryTime) / 60000);
      
      return `⚠️ 当前处于锁仓状态（同时持有多空两个方向）

【多单信息】
入场价: ${position.longPosition.entryPrice.toFixed(0)}
入场时间: ${new Date(position.longPosition.entryTime).toLocaleTimeString('zh-CN')}
持仓时长: ${longDuration}分钟
盈亏: ${position.longPosition.profitLossPoints.toFixed(0)}点 (${position.longPosition.profitLossMoney.toFixed(0)}元)
最高盈利: ${position.longPosition.maxProfitPoints.toFixed(0)}点 (${position.longPosition.maxProfitMoney.toFixed(0)}元)

【空单信息】
入场价: ${position.shortPosition.entryPrice.toFixed(0)}
入场时间: ${new Date(position.shortPosition.entryTime).toLocaleTimeString('zh-CN')}
持仓时长: ${shortDuration}分钟
盈亏: ${position.shortPosition.profitLossPoints.toFixed(0)}点 (${position.shortPosition.profitLossMoney.toFixed(0)}元)
最高盈利: ${position.shortPosition.maxProfitPoints.toFixed(0)}点 (${position.shortPosition.maxProfitMoney.toFixed(0)}元)

【锁仓总览】
当前价格: ${position.currentPrice?.toFixed(0)}
锁定盈亏: ${position.lockedProfitLoss?.toFixed(0)}元 (锁仓时锁定)
净盈亏: ${((position.longPosition.profitLossMoney + position.shortPosition.profitLossMoney)).toFixed(0)}元 (锁仓后的变动)

⚠️ 建议：等待明确方向信号后解锁，或者全部平仓`;
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

  // 格式化操作历史并分析绩效
  const formatOperations = (operations: SingleHandOperation[]) => {
    if (operations.length === 0) {
      return '暂无历史操作记录';
    }
    
    // 统计绩效
    const closedOps = operations.filter(op => op.action === '平仓' && op.netProfit !== undefined);
    const winOps = closedOps.filter(op => (op.netProfit || 0) > 0);
    const lossOps = closedOps.filter(op => (op.netProfit || 0) < 0);
    const winRate = closedOps.length > 0 ? (winOps.length / closedOps.length * 100).toFixed(0) : '0';
    const totalProfit = closedOps.reduce((sum, op) => sum + (op.netProfit || 0), 0);
    
    // 最近3次操作的趋势
    const recent3 = operations.slice(0, 3);
    const recent3Loss = recent3.filter(op => 
      op.action === '平仓' && op.netProfit !== undefined && op.netProfit < 0
    ).length;
    
    const performanceSummary = `
【绩效统计】
- 胜率: ${winRate}% (${winOps.length}胜/${lossOps.length}败，共${closedOps.length}次平仓)
- 累计净利润: ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(0)}元
- 最近3次操作: ${recent3Loss >= 2 ? '⚠️ 连续亏损！需要反思策略！' : recent3Loss === 1 ? '有亏损，需警惕' : '表现正常'}
`;
    
    const opsList = operations.map((op, idx) => {
      const opDate = new Date(op.timestamp);
      // 格式化时间：包含日期和时间，格式如 "11月12日 09:28:13"
      // 确保时间戳正确解析
      if (isNaN(opDate.getTime())) {
        console.warn(`[格式化操作记录] 无效的时间戳: ${op.timestamp}`);
        return `${idx+1}. [时间无效] ${op.action} @ ${op.price.toFixed(0)}`;
      }
      
      const month = opDate.getMonth() + 1;
      const day = opDate.getDate();
      const hours = opDate.getHours().toString().padStart(2, '0');
      const minutes = opDate.getMinutes().toString().padStart(2, '0');
      const seconds = opDate.getSeconds().toString().padStart(2, '0');
      const fullTime = `${month}月${day}日 ${hours}:${minutes}:${seconds}`;
      
      const profitInfo = op.profitLossPoints !== undefined 
        ? ` | 盈亏: ${op.profitLossPoints.toFixed(0)}点 (${op.profitLossMoney?.toFixed(0)}元)`
        : '';
      const netProfitInfo = op.netProfit !== undefined 
        ? ` | 净利润: ${op.netProfit > 0 ? '+' : ''}${op.netProfit.toFixed(0)}元`
        : '';
      const reflectionInfo = op.reflection 
        ? `\n   🤔 AI反思: ${op.reflection}`
        : '';
      return `${idx+1}. [${fullTime}] ${op.action} @ ${op.price.toFixed(0)}${profitInfo}${netProfitInfo}\n   原因: ${op.reason}${reflectionInfo}`;
    }).join('\n\n');
    
    return `${performanceSummary}\n【操作记录】\n${opsList}`;
  };

  // 格式化布林带数据
  const formatBollinger = (bollinger?: BollingerBands, label: string = '') => {
    if (!bollinger || bollinger.upper === null || bollinger.middle === null || bollinger.lower === null) {
      return `${label}布林带：数据不可用`;
    }
    return `${label}布林带：上轨${bollinger.upper.toFixed(0)} | 中轨${bollinger.middle.toFixed(0)} | 下轨${bollinger.lower.toFixed(0)}`;
  };

  // 获取当前时间
  const now = new Date();
  const currentTimeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // 检查是否接近收盘（收盘前1分钟）
  const isNearClose = 
    (hours === 10 && minutes === 14) ||  // 10:14分（10:15收盘前）
    (hours === 11 && minutes === 29) ||  // 11:29分（11:30收盘前）
    (hours === 14 && minutes === 59) ||  // 14:59分（15:00收盘前）
    (hours === 2 && minutes === 29);     // 次日2:29分（2:30收盘前）
  
  const closeWarning = isNearClose && currentPosition.hasPosition
    ? '\n\n⚠️⚠️⚠️ 警告：当前时间接近收盘（收盘前1分钟），必须立即平仓！不要持仓到收盘！ ⚠️⚠️⚠️'
    : '';

  // 每个数据项都是一个独立的user message
  const messages = [
    {
      role: 'user',
      content: `当前时间和价格\n当前时间: ${currentTimeStr}${closeWarning}\n国内白银主力当前价: ${currentPrice.toFixed(0)}`
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

**⚠️ 最高优先级：自动平仓规则**：

**1. 收盘前强制平仓**：
如果当前有持仓，检查当前时间是否接近收盘：
- **10:14分**（10:15收盘前）→ **立即平仓！**
- **11:29分**（11:30收盘前）→ **立即平仓！**
- **14:59分**（15:00收盘前）→ **立即平仓！**
- **次日2:29分**（2:30收盘前）→ **立即平仓！**
**收盘前1分钟必须清仓，无论盈亏！不要持仓到收盘！**

**2. 自动止损止盈平仓**（系统自动执行，不需要AI决策）：
系统有三个自动平仓规则（满足任一条件就会触发）：
- **规则0：亏损≥10点** → 立即自动止损（最高优先级，保护本金）
- **规则1：持仓≥5分钟 且 盈利≥20点** → 自动止盈（趋势好，快速止盈）
- **规则2：持仓≥6分钟 且 盈利≥10点** → 自动止盈（持仓久，保护利润）
- 系统每秒自动检查，满足任一条件会自动平仓
- **AI的作用**：在接近触发条件时，可以主动平仓避免等待自动触发
  * 亏损9点 → 建议主动止损，不要等到10点
  * 持仓4分30秒、盈利19点 → 建议主动平仓
  * 持仓5分30秒、盈利9点 → 建议主动平仓

**⚠️ 极高优先级：反转信号判断（仅次于收盘强制平仓）**：
**重点分析最后4根K线，判断是否出现反转信号！**

**反转信号判断标准（分析最后4根K线）**：
1. **强烈看涨反转信号**（触发"反转开多"）：
   - 连续3-4根阳线，且实体逐渐放大，收盘价逐步抬高
   - 大阳线吞没前面的阴线（吞没形态）
   - 锤子线/早晨之星出现在低位
   - 最后2根K线突破前期阻力位且站稳
   - 最后4根K线整体呈现"V型"反转形态

2. **强烈看跌反转信号**（触发"反转开空"）：
   - 连续3-4根阴线，且实体逐渐放大，收盘价逐步走低
   - 大阴线吞没前面的阳线（吞没形态）
   - 射击之星/黄昏之星出现在高位
   - 最后2根K线跌破前期支撑位且站稳
   - 最后4根K线整体呈现"倒V型"反转形态

**反转操作逻辑**：
- **如果有持仓且检测到反转信号**：立即选择"反转开多"或"反转开空"
  * 系统会自动：先平掉当前持仓 → 然后开反方向的仓位
  * 例：持有多单，检测到看跌反转 → 选择"反转开空" → 自动平多开空
  * 例：持有空单，检测到看涨反转 → 选择"反转开多" → 自动平空开多
  
- **如果无持仓且检测到反转信号**：
  * 看涨反转 → 选择"开多"
  * 看跌反转 → 选择"开空"

**反转信号优先级**：
- 反转信号出现时，优先级仅次于"收盘前强制平仓"
- 即使当前持仓有盈利，只要反转信号明确，也要果断反手
- 反转是最佳交易机会，不要犹豫！

**⚠️ 锁仓策略（第三优先级）**：
**什么时候考虑锁仓？**
1. **盈利保护型锁仓**：
   - 持有多单，已盈利≥20点，但出现回调信号（连续阴线、上影线长）→ 锁仓开空
   - 持有空单，已盈利≥20点，但出现反弹信号（连续阳线、下影线长）→ 锁仓开多
   - 目的：锁定已有盈利，防止大幅回撤

2. **不确定性锁仓**：
   - 持有仓位，但方向不明确，出现震荡信号→ 考虑锁仓
   - 持有仓位，接近关键支撑/阻力位，方向未明→ 考虑锁仓
   - 目的：观望等待，避免方向选择错误

3. **不建议锁仓的情况**：
   - 亏损时不要锁仓（应该及时止损）
   - 趋势明确时不要锁仓（应该顺势持有或平仓）
   - 盈利<10点不要锁仓（锁仓成本高，不划算）

**锁仓操作**：
- 持有多单 + 需要锁仓 → 选择"锁仓开空"（保持多单，再开空单）
- 持有空单 + 需要锁仓 → 选择"锁仓开多"（保持空单，再开多单）
- 锁仓后会同时持有多空两个方向的仓位

**解锁操作**：
- 锁仓后方向明确，看涨 → 选择"解锁平空"（平掉空单，保留多单）
- 锁仓后方向明确，看跌 → 选择"解锁平多"（平掉多单，保留空单）
- 锁仓后要全部平仓 → 选择"平仓"（平掉所有仓位）

**锁仓注意事项**：
- 锁仓会增加手续费成本（每次8元）
- 锁仓适合已有盈利的情况，保护利润
- 锁仓后要尽快解锁，不要长时间锁仓
- 解锁时要等待明确信号，不要盲目解锁

**⚠️ 首要任务：反思历史绩效**：
1. **查看绩效统计**：胜率<50%说明策略有问题，必须反思！
2. **连续亏损警示**：最近3次操作如果有2次以上亏损，说明方向判断错误！
   - **立即停止重复错误**：不要再用相同的逻辑做相同方向！
   - **考虑反向操作**：市场可能在告诉你反向才对
   - **降低频率**：连续亏损时要更谨慎，等待更明确的信号
3. **累计亏损警示**：净利润为负说明整体策略失败，必须调整！

**重要提醒**：
1. **趋势反转是最好的开仓机会**（尤其是连续亏损后更要重视！）：
   - **下跌转上涨**：大阳线吞没、突破阻力、连续阳线→**果断开多，不要再做空！**
   - **上涨转下跌**：大阴线吞没、跌破支撑、连续阴线→**果断开空，不要再做多！**
   - **逆势操作是亏损主因**：如果一直做空却亏损，说明趋势可能向上，必须反手！
   - 不要因为之前做多就不敢做空，反转信号出现就要反手！
   - **看K线趋势，不要固执己见**：连续3根阳线说明上涨，连续3根阴线说明下跌
2. **识别行情类型**：判断当前是单边、震荡、突破还是反转，不同行情用不同策略
3. **震荡行情**：
   - 开仓：在支撑位做多、阻力位做空（高抛低吸）
   - 平仓：盈利≥20点立即平仓！震荡中快进快出！
   - **震荡向下行情做多止盈**：如果判断为震荡向下行情但做了多单，价格反弹到布林带中轨附近（中线左右）时，必须及时止盈平仓！不要等待更高，震荡向下行情中多单反弹空间有限！
   - 目标：10-20点
4. **单边行情**：
   - 开仓：顺势追涨/杀跌，不怕追高
   - 平仓：盈利≥30点警惕，震荡时立即平
   - 目标：20-50点
5. **回撤保护**（所有行情都适用）：
   - 回撤>50%：**必须平仓**！
   - 回撤>40%：**优先平仓**！

分析维度

1. **行情类型识别**（最优先！决定策略方向）：
   **首先判断当前是哪种行情**：
   
   **单边行情特征**：
   - K线：连续大阳线/大阴线，实体大，上下影线短
   - 布林带：持续扩张，价格沿上轨/下轨奔跑
   - 成交量：持续放大，动能强劲
   - 方向：多周期共振，方向明确
   - 特点：一气呵成，少回调
   
   **震荡行情特征**：
   - K线：小阳小阴交替，上下影线长，实体小
   - 布林带：收窄或水平，价格在上下轨之间反复
   - 成交量：缩量，没有明显放量
   - 方向：无明确方向，在区间内震荡
   - 特点：反复拉锯，高抛低吸机会
   
   **突破行情特征**：
   - K线：整理形态（三角形、楔形、旗形）
   - 布林带：收窄后突然扩张
   - 成交量：整理缩量，突破放量
   - 方向：酝酿中，等待选择
   - 特点：突破后追随新趋势

2. **图形技术分析**（15分钟短线）：
   - K线形态：头肩顶/底、双顶/底、三角形、楔形、吞没、锤子线等经典形态
   - 均线系统：MA5、MA10、MA20的排列和交叉情况（金叉/死叉）
   - 布林带：价格与布林带上中下轨的位置关系
     * 价格触及上轨：超买，可能回调（震荡中做空机会）
     * 价格触及下轨：超卖，可能反弹（震荡中做多机会）
     * 价格在中轨附近：震荡，等待方向
     * 布林带收窄：酝酿突破
     * 布林带扩张：趋势加速（单边行情）
   - 趋势判断：上升趋势、下降趋势、横盘震荡
   - 支撑阻力：关键价格支撑位和阻力位（结合K线、布林带、整数关口）
   - 成交量：放量突破、缩量整理、量价配合情况

2. **多周期共振**（判断单边还是震荡）：
   - 日线趋势：大周期方向判断
   - 15分钟趋势：中周期方向
   - 1分钟趋势：入场时机把握
   - 伦敦与国内：内外盘联动性分析
   - **共振判断**：
     * 多周期方向一致 → 单边行情可能性大
     * 多周期方向不一致 → 震荡行情可能性大

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

策略偏好（全能型，适应各种行情）

**开仓策略**（根据行情类型选择策略）：

**1. 趋势反转策略**（最重要！反转是最好的开仓机会）：
- ✓ **明确反转信号果断开反向仓**：
  * 上涨趋势转为下跌：出现大阴线吞没、跌破支撑、均线死叉→果断开空
  * 下跌趋势转为上涨：出现大阳线吞没、突破阻力、均线金叉→果断开多
  * 不要犹豫：趋势反转是最好的入场点，机不可失！
- ✓ K线反转形态：十字星、吞没、乌云盖顶、锤子线等
- ✓ 突破关键位：跌破重要支撑做空，突破重要阻力做多
- ✓ 均线反转：死叉开空，金叉开多

**2. 单边行情策略**（趋势明确，连续K线）：
- ✓ 趋势明确时果断开仓，顺势而为（多周期方向一致）
- ✓ 多周期共振时加大信心（日线、15分钟、1分钟一致）
- ✓ 强势突破后追涨杀跌（整数关口、前高前低突破）
- ✓ 连续阳线/阴线时顺势追入，不怕追高/杀低
- ✓ 布林带扩张且价格沿轨道运行

**3. 震荡行情策略**（区间波动，高抛低吸）：
- ✓ 价格触及布林带下轨反弹时做多（超卖反弹）
- ✓ 价格触及布林带上轨回调时做空（超买回调）
- ✓ 价格在区间下沿获得支撑时做多
- ✓ 价格在区间上沿遇到阻力时做空
- ✓ K线反转形态（锤子线、吞没、十字星）配合支撑阻力位

**4. 突破行情策略**（酝酿突破，等待时机）：
- ✓ 布林带收窄后突破上轨/下轨时果断入场
- ✓ 三角形、楔形整理后突破时跟进
- ✓ 关键阻力/支撑突破且放量时入场
- ✗ 假突破要警惕（无量突破、快速回落）

**5. 观望条件**（很少观望，大部分时候都有机会）：
- ✗ 趋势完全不明、方向不清且无反转信号时才观望
- ✗ 布林带极度收窄、等待方向选择时观望

**平仓策略**（优先级从高到低）：
1. **⚠️ 注意自动止损止盈规则**（系统有三个规则）：
   - **规则0：亏损≥10点** → 系统立即自动止损（最高优先级）
   - **规则1：持仓≥5分钟 且 盈利≥20点** → 系统自动止盈
   - **规则2：持仓≥6分钟 且 盈利≥10点** → 系统自动止盈
   - AI建议：在接近触发条件时主动平仓
     * 亏损8-9点 → 建议主动止损，不要等到10点
     * 持仓4分30秒、盈利18-20点 → 建议主动平仓
     * 持仓5分30秒、盈利9-10点 → 建议主动平仓
2. **回撤保护平仓**（优先级第二！）：**最高盈利和回撤比例是最关键数据！**
   - **最高盈利≥20点 且 回撤≥50%：立即平仓！** 利润已经大幅回吐，必须止盈！
   - **最高盈利≥15点 且 回撤≥60%：立即平仓！** 不能坐过山车！
   - **最高盈利≥10点 且 回撤≥70%：立即平仓！** 再等利润就没了！
   - **重要**：回撤超过50%说明趋势已经明显减弱，不要再找理由持有！
   - 例：最高25点→现在10点，回撤60%→**必须平仓**，不要说"趋势未反转"！
3. **30点以上落袋为安**（优先级第三！）：
   - **盈利≥30点时**：默认应该平仓，落袋为安！
   - **震荡行情30点必平**：价格在区间内反复震荡，没有明确方向，立即平仓
   - **单边强势可持有**：只有在以下情况才考虑继续持有：
     * 连续大阳线/大阴线（实体大，上下影线短）
     * 布林带持续扩张，价格沿上轨/下轨奔跑
     * 成交量持续放大，动能强劲
     * 关键阻力/支撑被强势突破
   - **判断标准**：如果不是明显的单边暴涨/暴跌行情，30点就平仓！
4. **动态决策原则**：根据盈利水平灵活调整策略
   - **盈利≥30点**：优先平仓，除非单边极强（回撤10%就平）
   - **盈利20-30点**：适度灵活，回撤30%就平仓，守住利润
   - **盈利10-20点**：稍微激进，回撤50%才平仓，给空间（但注意自动止盈规则）
   - **盈利<10点**：可以等待，但要警惕趋势反转
5. **动力衰竭平仓**：观察K线和成交量，上涨/下跌动力明显减弱时果断止盈
   - 连续小阳/小阴线，振幅收窄
   - 价格在高位/低位反复震荡，无法突破
   - 出现明显的上影线/下影线，表明压力/支撑强大
6. **趋势反转平仓**：出现明确反转信号时立即平仓
   - K线形态反转（如十字星、吞没、乌云盖顶等）
   - 跌破关键支撑位/突破关键阻力位
   - 均线死叉/金叉
7. **⚠️ 自动止损**：亏损≥10点系统会自动止损，AI无需干预
   - AI可以在亏损8-9点时主动止损，避免等到10点
   - 如果判断趋势确实错误，即使亏损<10点也可以主动止损
8. **时间止盈**：持仓时长也是重要考虑因素
   - **持仓≥5分钟且盈利≥20点**：系统会自动平仓（规则1）
   - **持仓≥6分钟且盈利≥10点**：系统会自动平仓（规则2）
   - **持仓4-5分钟且盈利18-20点**：建议主动平仓，避免等待自动触发
   - **持仓5-6分钟且盈利8-10点**：建议主动平仓，避免等待自动触发
   - **持仓<5分钟且盈利10-20点**：结合趋势和回撤决定，可以给空间
   - **持仓>8分钟且盈利<10点**：考虑离场，效率太低或趋势不对

**持有策略**（根据行情类型和盈利水平）：

**震荡行情持有**：
- 盈利<10点：可以等待反弹/回调到目标位
- 盈利10-20点：考虑平仓，震荡空间有限
- 盈利≥20点：立即平仓，震荡行情不贪
- **震荡向下行情做多**：如果判断为震荡向下行情但持有多单，价格反弹到布林带中轨（中线）附近时，必须及时止盈！不要等待更高，震荡向下行情中多单反弹空间有限，到中线就是止盈机会！
- 任何时候接近布林带上轨/下轨：准备平仓

**单边行情持有**：
- 盈利<20点：趋势未改变可持有
- 盈利20-30点：趋势强劲继续持有，趋势减弱平仓
- 盈利30-50点：警惕反转，出现减弱信号就平
- 盈利≥50点：高度警惕，优先保护利润

**突破行情持有**：
- 突破初期（盈利<15点）：给空间，等待趋势展开
- 突破确认（盈利15-30点）：持有跟随
- 突破衰竭（价格回到突破点）：立即平仓

**绝不持有**：
- 回撤>50%：立即平仓
- 震荡+盈利≥30点：立即平仓

风险控制与灵活策略

**盈利目标**（根据行情类型）：
- 震荡行情：10-20点（快进快出，见好就收）
- 单边行情：20-50点（跟随趋势，吃大行情）
- 突破行情：15-40点（突破确认后跟随）

**止损控制**：
- **⚠️ 自动止损：亏损≥10点系统自动止损**（最高优先级）
- AI可以在亏损8-9点时主动止损
- 如果判断趋势完全错误，即使亏损<10点也要果断止损

**守利润铁律**：
- **⚠️ 自动止损止盈规则**：
  * **亏损≥10点 → 系统立即自动止损**（保护本金）
  * 持仓≥5分钟且盈利≥20点 → 系统自动止盈
  * 持仓≥6分钟且盈利≥10点 → 系统自动止盈
  * AI可以在接近触发条件时主动平仓
- **震荡+盈利≥30点**：立即平仓！震荡中吃不到大行情！
- **震荡+盈利≥20点**：优先平仓，别贪
- **单边+盈利≥30点**：趋势减弱立即平，趋势强劲回撤10%也要平
- **回撤>50%**：立即平仓，无论任何理由
- **回撤>40%**：优先平仓，除非极强信号

**策略核心**：
1. **先识别行情类型**（单边/震荡/突破），这是决策基础
2. **震荡行情**：高抛低吸，快进快出，盈利20-30点就走
3. **单边行情**：顺势而为，敢于持仓，但要警惕反转
4. **所有行情**：守住利润最重要，回撤大于40%优先平仓

输出格式

请严格按照以下JSON格式输出（不要包含markdown代码块标记）:

{
  "action": "开多/开空/平仓/持有/观望/反转开多/反转开空/锁仓开多/锁仓开空/解锁平多/解锁平空",
  "reason": "详细的决策理由，必须包括：1)最后4根K线反转信号分析（如有） 2)行情类型识别（单边/震荡/突破）3)图形形态分析 4)趋势判断 5)支撑阻力位 6)盘口情况 7)持仓评估(如有，含回撤分析) 8)操作依据",
  "reflection": "对历史绩效的反思：如果胜率<50%或连续亏损，必须分析原因（逆势操作？止损不及时？贪心不平仓？）并说明本次如何改进。如果绩效良好，总结成功经验。",
  "confidence": 85,
  "targetPrice": 8650
}

字段说明：
- action: 必须是以下之一：
  * "开多"：无持仓时开多单
  * "开空"：无持仓时开空单
  * "平仓"：平掉当前持仓（如果是锁仓状态，平掉所有仓位）
  * "持有"：继续持有当前仓位
  * "观望"：无持仓且不开仓
  * **"反转开多"**：有持仓时检测到看涨反转信号，自动平仓后开多单（平空开多）
  * **"反转开空"**：有持仓时检测到看跌反转信号，自动平仓后开空单（平多开空）
  * **"锁仓开多"**：持有空单时，保留空单，再开多单（形成锁仓）
  * **"锁仓开空"**：持有多单时，保留多单，再开空单（形成锁仓）
  * **"解锁平多"**：锁仓状态下，平掉多单，保留空单
  * **"解锁平空"**：锁仓状态下，平掉空单，保留多单
- reason: 详细说明分析逻辑（200字以内），**如果选择反转/锁仓/解锁操作，必须说明理由**
- **reflection**: ⚠️ 反思字段（100字以内）：
  * 胜率<50%：必须说明为什么一直亏损，本次操作如何避免重复错误
  * 连续亏损：分析是否逆势操作，本次是否需要反向思考
  * 累计亏损：反思整体策略问题，是否过于激进或过于保守
  * 绩效良好：总结成功经验，继续保持
- confidence: 信心度（0-100），基于技术指标一致性和信号强度
- targetPrice: 目标价格（开仓、反转、锁仓操作时必填，其他操作可不填）

约束条件：
1. **⚠️ 收盘前强制平仓（最高优先级）**：
   - 如果当前时间是10:14、11:29、14:59或次日2:29分，且有持仓
   - **必须立即选择"平仓"，无论盈亏，无论任何理由！**
   - 原因必须说明"收盘前强制平仓"
   - **收盘前不允许反转操作！只能平仓！**

2. **⚠️ 反转信号处理（第二优先级）**：
   - **有持仓时检测到反转信号**：
     * 看跌反转且持有多单 → 选择"反转开空"
     * 看涨反转且持有空单 → 选择"反转开多"
     * 系统会自动先平仓再开反向仓
   - **无持仓时检测到反转信号**：
     * 看跌反转 → 选择"开空"
     * 看涨反转 → 选择"开多"
   - **反转操作要果断**：反转信号明确时，confidence≥60%就要反手，不要犹豫！

3. **⚠️ 持仓和开仓约束（重要！）**：
   - **无持仓时**：只能选择"开多"、"开空"或"观望"
     * ❌ **绝对不能选择"持有"**（无持仓时选择持有是无效的）
     * ❌ 不能选择"平仓"（没有仓位可平）
     * ❌ 不能选择任何锁仓或解锁操作
   - **有单向持仓时**（只持有多单或空单）：可以选择"平仓"、"持有"、"反转开多"、"反转开空"、"锁仓开多"或"锁仓开空"
     * ❌ 不能选择"开多"或"开空"（已有持仓，不能再开新仓）
     * ❌ 不能选择"观望"（有持仓必须决策）
   - **锁仓状态时**（同时持有多空）：只能选择"平仓"（全平）、"解锁平多"或"解锁平空"
     * ❌ 不能再开新仓，只能解锁或全平
   - **核心原则**：根据持仓状态选择正确的操作，避免无效决策

4. **锁仓操作约束**：
   - **锁仓条件**：
     * 盈利≥10点才考虑锁仓（盈利太少锁仓不划算）
     * 出现回调/反弹信号但不确定趋势反转
     * 接近关键支撑/阻力位，方向不明确
   - **不要锁仓**：
     * 亏损时不要锁仓（应该止损）
     * 趋势明确时不要锁仓（顺势持有或平仓）
     * 盈利<10点不要锁仓
   - **解锁时机**：
     * 方向明确后尽快解锁
     * 看涨明确→解锁平空，保留多单
     * 看跌明确→解锁平多，保留空单

5. **开仓要积极但要吸取教训**：
   - confidence≥50%即可开仓，不要过于保守
   - 趋势反转信号明确时，confidence≥60%就果断反手
   - **⚠️ 但如果最近连续亏损，必须反思：是否一直逆势？如果是，本次必须顺势！**
   - 不要因为之前的持仓方向而不敢开反向仓
   - **⚠️ 收盘前5分钟不要开新仓、反转或锁仓**（避免来不及平仓）

6. **必须先分析最后4根K线**，判断是否有反转信号，然后识别行情类型（单边/震荡/突破/反转）

7. **操作目标**：
   - 震荡行情：目标10-20点，快进快出
   - 单边行情：目标20-50点，顺势持有
   - 反转行情：抓住反转机会，目标15-40点
   - 锁仓保护：锁定盈利，等待方向明确

8. **⚠️ 参考历史操作记录**，总结成功经验，**避免重复失误**：
   - 如果一直做空却亏损，说明可能需要做多或反转开多
   - 如果一直做多却亏损，说明可能需要做空或反转开空
   - 看K线实际走势，检测反转信号，不要固执己见`
  };

  // 返回所有消息（10个数据message + 1个分析要求message）
  return [...messages, analysisMessage];
}

