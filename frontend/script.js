// API配置 - 直接请求后端接口
const API_CONFIG = {
    baseUrl: '/api/data/kline',  // 相对路径，自动使用当前域名
    tradeTickUrl: '/api/data/trade-tick',
    depthTickUrl: '/api/data/depth-tick',
    // 国内白银主力 - 主要交易标的
    domesticSymbol: 'AG', // 国内白银主力代码（需要确认是否正确）
    // 伦敦现货白银 - 方向指引参考
    londonSymbol: 'Silver', // 伦敦现货白银代码
    interval: '1m', // 1分钟
    limit: 120, // 获取120根K线，确保有足够数据计算布林带
    // WebSocket配置
    wsToken: '9d7f12b4c30826987a501d532ef75707-c-app',
    wsUrl: 'wss://quote.alltick.co/quote-b-ws-api',
    // 大模型API配置
    llmApiUrl: 'https://1256349444-2ej4ahqihp.ap-singapore.tencentscf.com/chat'
};

// WebSocket连接管理（订阅交易价格）
class AllTickWebSocket {
    constructor(symbol, onTradeTick) {
        this.symbol = symbol;
        this.onTradeTick = onTradeTick;
        this.ws = null;
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.seqId = 1;
        this.isConnected = false;
    }
    
    connect() {
        const wsUrl = `${API_CONFIG.wsUrl}?token=${API_CONFIG.wsToken}`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('WebSocket连接已建立');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.subscribeAll();
                this.startHeartbeat();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('解析WebSocket消息失败:', error);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket错误:', error);
            };
            
            this.ws.onclose = () => {
                console.log('WebSocket连接已关闭');
                this.isConnected = false;
                this.stopHeartbeat();
                this.scheduleReconnect();
            };
        } catch (error) {
            console.error('创建WebSocket连接失败:', error);
            this.scheduleReconnect();
        }
    }
    
    subscribeAll() {
        // 订阅最新成交价（协议号22004）
        this.subscribeTradeTick();
    }
    
    subscribeTradeTick() {
        const seqId = this.seqId++;
        const trace = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const subscribeMsg = {
            cmd_id: 22004, // 订阅最新成交价协议号
            seq_id: seqId,
            trace: trace,
            data: {
                symbol_list: [
                    {
                        code: this.symbol
                    }
                ]
            }
        };
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(subscribeMsg));
            console.log('已发送成交价订阅请求:', subscribeMsg);
        } else {
            console.error('WebSocket未连接，无法发送成交价订阅请求');
        }
    }
    
    handleMessage(data) {
        const cmdId = data.cmd_id;
        
        // 应答消息：最新成交价订阅（22005）
        if (cmdId === 22005) {
            if (data.ret === 200) {
                console.log(`最新成交价订阅成功: ${this.symbol}`);
                // 订阅成功后，如果是伦敦白银，确保显示等待状态
                if (this.symbol === 'Silver' || this.symbol === 'SILVER') {
                    const container = document.getElementById('london-trade-tick-info');
                    if (container && (!londonLastTradePrice || londonLastTradePrice === 0)) {
                        container.innerHTML = '<span>等待数据...</span>';
                    }
                }
            } else {
                console.error('最新成交价订阅失败:', data.msg);
            }
            return;
        }
        
        // 推送消息：最新成交价（22998）
        if (cmdId === 22998) {
            if (data.data && this.onTradeTick) {
                // WebSocket推送的数据格式：{code, price, ...}
                // 直接传递整个data.data对象
                this.onTradeTick(data.data);
            }
            return;
        }
        
        // 推送消息：最新盘口深度（22999）
        if (cmdId === 22999) {
            // 深度数据推送，暂时不需要处理
            // console.log('收到深度数据推送:', data.data);
            return;
        }
        
        // 未知的消息类型
        console.log('收到未知消息类型:', cmdId, data);
    }
    
    startHeartbeat() {
        // 每10秒发送一次心跳
        this.heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // 心跳协议号通常是22000，但文档中没有明确说明，这里先不发送
                // 如果需要心跳，可能需要根据实际API文档调整
                // 暂时保持连接活跃即可
            }
        }, 10000); // 10秒
    }
    
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('达到最大重连次数，停止重连');
            return;
        }
        
        // 指数退避重连
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        
        console.log(`将在 ${delay}ms 后尝试重连 (第 ${this.reconnectAttempts} 次)`);
        
        this.reconnectTimer = setTimeout(() => {
            console.log('尝试重新连接WebSocket...');
            this.connect();
        }, delay);
    }
    
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this.stopHeartbeat();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// WebSocket实例
let domesticWS = null; // 国内白银WebSocket（TqSdk）
let londonWS = null; // 伦敦白银WebSocket（AllTick）

// 图表实例
let domesticChart = null; // 国内白银图表
let londonChart = null; // 伦敦白银图表

// 初始化图表
function initCharts() {
    // 清空信息显示
    const domesticInfo = document.getElementById('domestic-info');
    const londonInfo = document.getElementById('london-info');
    if (domesticInfo) {
        domesticInfo.innerHTML = '';
    }
    if (londonInfo) {
        londonInfo.innerHTML = '';
    }
    
    // 国内白银图表（主要交易标的）
    domesticChart = echarts.init(document.getElementById('domestic-chart'), 'dark');
    
    // 伦敦现货白银图表（方向指引参考）
    londonChart = echarts.init(document.getElementById('london-chart'), 'dark');
    
    // 设置初始配置（两个图表使用相同的配置）
    const initialOption = {
        backgroundColor: 'transparent',
        grid: [
            {
                left: '8%',
                right: '4%',
                top: '6%',
                height: '88%',
                containLabel: true
            }
        ],
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'cross'
            },
            backgroundColor: 'rgba(30, 37, 72, 0.95)',
            borderColor: '#1e2548',
            textStyle: {
                color: '#e0e0e0'
            },
            formatter: function(params) {
                if (!params || params.length === 0) {
                    return '';
                }
                
                let result = params[0].axisValue + '<br/>';
                
                // 判断是伦敦还是国内市场（根据第一个参数判断）
                const firstItem = params[0];
                const isLondonChart = firstItem && firstItem.seriesName && firstItem.seriesName.includes('伦敦');
                
                // 遍历所有系列
                params.forEach(function(item) {
                    if (item.seriesType === 'candlestick') {
                        // K线图数据格式：ECharts candlestick的value格式是 [开盘, 收盘, 最低, 最高]
                        const data = item.value || item.data;
                        if (Array.isArray(data) && data.length === 4) {
                            const open = data[0];
                            const close = data[1];
                            const lowest = data[2];
                            const highest = data[3];
                            
                            // 格式化价格
                            const formatPrice = function(price) {
                                if (isLondonChart) {
                                    return price.toFixed(3);
                                } else {
                                    return Math.round(price).toString();
                                }
                            };
                            
                            result += '<span style="display:inline-block;margin-right:5px;border-radius:2px;width:10px;height:10px;background-color:' + (item.color || '#ef4444') + ';"></span>';
                            result += '<span style="color:' + (item.color || '#ef4444') + ';">' + (item.seriesName || 'K线') + '</span><br/>';
                            result += '开盘: <span style="color:#ffffff;font-weight:600;">' + formatPrice(open) + '</span><br/>';
                            result += '收盘: <span style="color:#ffffff;font-weight:600;">' + formatPrice(close) + '</span><br/>';
                            result += '最高: <span style="color:#ef4444;font-weight:600;">' + formatPrice(highest) + '</span><br/>';
                            result += '最低: <span style="color:#4ade80;font-weight:600;">' + formatPrice(lowest) + '</span><br/>';
                        }
                    } else if (item.seriesType === 'line') {
                        // 其他线条（布林带等）
                        const value = item.value;
                        if (value !== null && value !== undefined) {
                            result += '<span style="display:inline-block;margin-right:5px;border-radius:2px;width:10px;height:10px;background-color:' + (item.color || '#60a5fa') + ';"></span>';
                            result += '<span style="color:' + (item.color || '#60a5fa') + ';">' + (item.seriesName || '') + '</span>: ';
                            if (isLondonChart) {
                                result += '<span style="color:#ffffff;font-weight:600;">' + value.toFixed(3) + '</span><br/>';
                            } else {
                                result += '<span style="color:#ffffff;font-weight:600;">' + Math.round(value) + '</span><br/>';
                            }
                        }
                    }
                });
                
                return result;
            }
        },
        xAxis: [
            {
                type: 'category',
                data: [],
                gridIndex: 0,
                boundaryGap: false,
                axisLine: {
                    lineStyle: {
                        color: '#1e2548'
                    }
                },
                axisLabel: {
                    color: '#9ca3af',
                    show: false
                },
                axisTick: {
                    show: false
                }
            }
        ],
        yAxis: [
            {
                type: 'value',
                scale: true,
                gridIndex: 0,
                position: 'left',
                axisLine: {
                    lineStyle: {
                        color: '#1e2548'
                    }
                },
                axisLabel: {
                    color: '#9ca3af'
                },
                splitLine: {
                    lineStyle: {
                        color: '#1e2548',
                        type: 'dashed'
                    }
                }
            }
        ],
        series: []
    };
    
    domesticChart.setOption(initialOption);
    londonChart.setOption(initialOption);
}

// 获取K线数据 - 请求后端接口
async function fetchKlineData(symbol) {
    try {
        // 请求后端接口，不需要传递token（token在后端配置）
        const params = new URLSearchParams({
            symbol: symbol,
            interval: API_CONFIG.interval,
            limit: API_CONFIG.limit.toString()
        });
        
        const url = `${API_CONFIG.baseUrl}?${params.toString()}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`HTTP错误: ${response.status}`, errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // AllTick API可能使用不同的响应格式，需要适配
        // 如果result有data字段，使用data；如果是数组，直接使用
        let data = null;
        if (Array.isArray(result)) {
            data = result;
        } else if (result.data) {
            data = result.data;
        } else if (result.code === 0 || result.code === 200) {
            data = result.data || [];
        } else {
            throw new Error(result.message || result.msg || 'API返回错误');
        }
        
        if (!data || data.length === 0) {
            console.warn('K线数据返回空数据');
            return [];
        }
        
        return data;
    } catch (error) {
        console.error('获取K线数据失败:', error);
        updateStatus('error');
        return null;
    }
}

// 获取日K线数据（用于计算前一日收盘价）
async function fetchDailyKline(symbol) {
    try {
        const params = new URLSearchParams({
            symbol: symbol,
            interval: '1d', // 日K线
            limit: '2' // 只需要2根K线：今日和昨日
        });
        
        const url = `${API_CONFIG.baseUrl}?${params.toString()}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.warn('获取日K线数据失败:', response.status);
            return null;
        }
        
        const result = await response.json();
        
        // 解析响应
        let data = null;
        if (Array.isArray(result)) {
            data = result;
        } else if (result.data) {
            data = result.data;
        } else if (result.code === 0 || result.code === 200) {
            data = result.data || [];
        }
        
        if (!data || data.length < 2) {
            console.warn('日K线数据不足，需要至少2根K线');
            return null;
        }
        
        // 返回前一日收盘价（倒数第二根K线的收盘价）
        // 数据按时间排序，最新的在最后
        const previousDayKline = data[data.length - 2];
        if (previousDayKline && previousDayKline.c > 0) {
            return previousDayKline.c; // 前一日收盘价
        }
        
        return null;
    } catch (error) {
        console.warn('获取日K线数据异常:', error);
        return null;
    }
}

// 获取最新成交价（HTTP轮询，作为WebSocket的补充）
// AG（国内白银）通过后端TqSdk接口获取，Silver（伦敦白银）通过AllTick API获取
async function fetchTradeTick(symbol) {
    try {
        const url = `${API_CONFIG.tradeTickUrl}?symbol=${symbol}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            // 如果是400错误，静默失败
            if (response.status === 400) {
                return null;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.ret === 200 && result.data && result.data.tick_list && result.data.tick_list.length > 0) {
            return result.data.tick_list[0];
        }
        
        return null;
    } catch (error) {
        // 静默失败，WebSocket推送是主要数据源（对于Silver）
        return null;
    }
}

// 保存上一次的价格和涨跌信息，用于计算涨跌
// 国内白银
let domesticLastTradePrice = null;
let domesticLastChange = 0;
let domesticLastChangePercent = 0;
let domesticLastIsUp = false;
let domesticPreviousDayClosePrice = null;
let domesticCurrentBollingerBands = {
    upper: null,
    middle: null,
    lower: null
};

// 伦敦白银
let londonLastTradePrice = null;
let londonLastChange = 0;
let londonLastChangePercent = 0;
let londonLastIsUp = false;
let londonPreviousDayClosePrice = null;
let londonCurrentBollingerBands = {
    upper: null,
    middle: null,
    lower: null
};

// 持仓管理
let currentPosition = {
    direction: null, // 'buy' 买多 或 'sell' 卖空
    lots: 0, // 当前手数
    entryPrice: 0, // 开仓价格
    openTime: null // 开仓时间
};

// 存储当前K线数据（用于AI分析）
let currentDomesticKlineData = null;
let currentLondonKlineData = null;

// 策略防抖管理（避免频繁变化）
let strategyDebounce = {
    lastAction: null, // 上一次的操作建议
    lastActionTime: null, // 上一次操作建议的时间
    stableAction: null, // 稳定的操作建议
    stableActionTime: null, // 稳定操作建议的时间
    changeCount: 0, // 连续变化次数
    DEBOUNCE_DURATION: 5000 // 防抖持续时间（毫秒），5秒内不变化才确认
};

// 计算浮动盈亏
function calculateFloatingPnL(currentPrice) {
    if (!currentPosition.direction || currentPosition.lots === 0 || !currentPrice) {
        return {
            pnl: 0,
            pnlPercent: 0,
            isProfit: false
        };
    }
    
    const priceDiff = currentPrice - currentPosition.entryPrice;
    let pnl = 0;
    
    if (currentPosition.direction === 'buy') {
        // 买多：价格上涨盈利
        pnl = priceDiff * currentPosition.lots;
    } else if (currentPosition.direction === 'sell') {
        // 卖空：价格下跌盈利
        pnl = -priceDiff * currentPosition.lots;
    }
    
    const pnlPercent = currentPosition.entryPrice !== 0 
        ? (priceDiff / currentPosition.entryPrice) * 100 
        : 0;
    
    return {
        pnl: pnl,
        pnlPercent: pnlPercent,
        isProfit: pnl >= 0
    };
}

// 开仓函数（用于手动开仓或根据策略自动开仓）
function openPosition(direction, lots, entryPrice) {
    if (!direction || !lots || !entryPrice) {
        return false;
    }
    
    // 如果已有持仓，检查方向是否一致
    if (currentPosition.direction && currentPosition.direction === direction) {
        // 同方向加仓，计算加权平均开仓价
        const totalLots = currentPosition.lots + lots;
        currentPosition.entryPrice = (currentPosition.entryPrice * currentPosition.lots + entryPrice * lots) / totalLots;
        currentPosition.lots = totalLots;
    } else if (currentPosition.direction && currentPosition.direction !== direction) {
        // 反向持仓，需要先平仓
        console.warn('已有反向持仓，需要先平仓');
        return false;
    } else {
        // 新开仓
        currentPosition.direction = direction;
        currentPosition.lots = lots;
        currentPosition.entryPrice = entryPrice;
        currentPosition.openTime = new Date();
    }
    
    // 保存到本地存储
    try {
        localStorage.setItem('currentPosition', JSON.stringify(currentPosition));
    } catch (e) {
        console.warn('保存持仓到本地存储失败', e);
    }
    
    // 更新策略显示
    updateTradingStrategy();
    
    return true;
}

// 平仓函数
function closePosition() {
    if (!currentPosition.direction || currentPosition.lots === 0) {
        return false;
    }
    
    const closedPosition = { ...currentPosition };
    
    // 清空持仓
    currentPosition.direction = null;
    currentPosition.lots = 0;
    currentPosition.entryPrice = 0;
    currentPosition.openTime = null;
    
    // 清除本地存储
    try {
        localStorage.removeItem('currentPosition');
    } catch (e) {
        console.warn('清除本地存储失败', e);
    }
    
    // 更新策略显示
    updateTradingStrategy();
    
    return closedPosition;
}

// 加载保存的持仓
function loadSavedPosition() {
    try {
        const saved = localStorage.getItem('currentPosition');
        if (saved) {
            const position = JSON.parse(saved);
            if (position.direction && position.lots > 0) {
                currentPosition = position;
                // 恢复时间对象
                if (position.openTime) {
                    currentPosition.openTime = new Date(position.openTime);
                }
            }
        }
    } catch (e) {
        console.warn('加载保存的持仓失败', e);
    }
}

// 页面加载时恢复持仓
loadSavedPosition();

// 保存24小时前的价格（用于计算24小时涨跌幅）
let price24hAgo = null;
let price24hTimestamp = null;

// 统计WebSocket推送频率
let wsStats = {
    tradeTickCount: 0,
    lastTradeTickTime: null,
    tradeTickIntervals: []
};

// 分析布林带突破情况并提供交易策略
function analyzeBollingerBands(price, upper, middle, lower) {
    if (!upper || !middle || !lower || price <= 0) {
        return {
            position: 'unknown',
            positionDesc: '数据不足',
            breakout: null,
            breakoutDesc: '--',
            strategy: '等待数据',
            strategyDesc: '正在计算布林带...',
            signal: 'neutral',
            signalColor: '#9ca3af'
        };
    }
    
    const bandWidth = upper - lower;
    let pricePosition = (price - lower) / bandWidth; // 0-1之间，0=下轨，1=上轨
    // 限制pricePosition在合理范围内（0-1），超出范围时限制在边界
    pricePosition = Math.max(0, Math.min(1, pricePosition));
    const distanceFromMiddle = price - middle;
    const distanceFromMiddlePercent = (distanceFromMiddle / middle) * 100;
    
    let position = 'middle';
    let positionDesc = '';
    let breakout = null;
    let breakoutDesc = '';
    let strategy = '';
    let strategyDesc = '';
    let signal = 'neutral';
    let signalColor = '#9ca3af';
    
    // 判断价格位置
    if (price > upper) {
        position = 'above_upper';
        positionDesc = '突破上轨';
        signal = 'bullish';
        signalColor = '#ef4444';
        breakout = 'upper';
        breakoutDesc = '价格突破布林带上轨，强势上涨信号';
        
        // 交易策略
        if (distanceFromMiddlePercent > 2) {
            strategy = 'strong_buy';
            strategyDesc = '强烈看涨：价格大幅突破上轨，建议做多，但需注意回调风险';
        } else {
            strategy = 'buy';
            strategyDesc = '看涨：价格突破上轨，可考虑做多，设置止损';
        }
    } else if (price < lower) {
        position = 'below_lower';
        positionDesc = '跌破下轨';
        signal = 'bearish';
        signalColor = '#4ade80';
        breakout = 'lower';
        breakoutDesc = '价格跌破布林带下轨，强势下跌信号';
        
        // 交易策略
        if (distanceFromMiddlePercent < -2) {
            strategy = 'strong_sell';
            strategyDesc = '强烈看跌：价格大幅跌破下轨，建议做空，但需注意反弹风险';
        } else {
            strategy = 'sell';
            strategyDesc = '看跌：价格跌破下轨，可考虑做空，设置止损';
        }
    } else if (pricePosition > 0.8) {
        position = 'near_upper';
        positionDesc = '接近上轨';
        signal = 'neutral_bullish';
        signalColor = '#fbbf24';
        breakoutDesc = '价格接近上轨，上涨动能较强';
        
        strategy = 'watch';
        strategyDesc = '观望：价格接近上轨，关注是否突破或回调';
    } else if (pricePosition < 0.2) {
        position = 'near_lower';
        positionDesc = '接近下轨';
        signal = 'neutral_bearish';
        signalColor = '#fbbf24';
        breakoutDesc = '价格接近下轨，下跌动能较强';
        
        strategy = 'watch';
        strategyDesc = '观望：价格接近下轨，关注是否跌破或反弹';
    } else if (pricePosition > 0.6) {
        position = 'upper_half';
        positionDesc = '上轨区间';
        signal = 'neutral_bullish';
        signalColor = '#fbbf24';
        breakoutDesc = '价格位于布林带上半部分';
        
        strategy = 'watch';
        strategyDesc = '观望：价格位于上半部分，趋势偏多';
    } else if (pricePosition < 0.4) {
        position = 'lower_half';
        positionDesc = '下轨区间';
        signal = 'neutral_bearish';
        signalColor = '#fbbf24';
        breakoutDesc = '价格位于布林带下半部分';
        
        strategy = 'watch';
        strategyDesc = '观望：价格位于下半部分，趋势偏空';
    } else {
        position = 'middle';
        positionDesc = '中轨附近';
        signal = 'neutral';
        signalColor = '#9ca3af';
        breakoutDesc = '价格位于布林带中轨附近';
        
        strategy = 'neutral';
        strategyDesc = '中性：价格在中轨附近，等待方向确认';
    }
    
    return {
        position,
        positionDesc,
        breakout,
        breakoutDesc,
        strategy,
        strategyDesc,
        signal,
        signalColor,
        pricePosition: (pricePosition * 100).toFixed(1),
        distanceFromMiddle: distanceFromMiddle.toFixed(3),
        distanceFromMiddlePercent: distanceFromMiddlePercent.toFixed(2),
        upper: upper.toFixed(3),
        middle: middle.toFixed(3),
        lower: lower.toFixed(3)
    };
}

// 综合分析交易策略（结合伦敦市场和国内市场）
function analyzeTradingStrategy() {
    // 检查数据完整性
    if (!londonLastTradePrice || !domesticLastTradePrice || 
        !londonCurrentBollingerBands.upper || !domesticCurrentBollingerBands.upper) {
        return null;
    }
    
    // 分析伦敦市场（作为方向指引）
    const londonAnalysis = analyzeBollingerBands(
        londonLastTradePrice,
        londonCurrentBollingerBands.upper,
        londonCurrentBollingerBands.middle,
        londonCurrentBollingerBands.lower
    );
    
    // 分析国内市场（作为交易标的）
    const domesticAnalysis = analyzeBollingerBands(
        domesticLastTradePrice,
        domesticCurrentBollingerBands.upper,
        domesticCurrentBollingerBands.middle,
        domesticCurrentBollingerBands.lower
    );
    
    // 综合判断
    let action = '观望'; // 买多、卖空、观望
    let actionColor = '#9ca3af';
    let confidence = 0; // 0-100，信心度
    let entryPrice = domesticLastTradePrice; // 建议入场价格
    let stopLoss = null; // 止损价格
    let takeProfit = null; // 止盈价格
    let addPosition = null; // 追加手数建议
    let addPositionReason = ''; // 追加手数理由
    let reasoning = ''; // 分析理由
    
    // 固定差价（±20）
    const STOP_LOSS_DISTANCE = 20;
    const TAKE_PROFIT_DISTANCE = 20;
    
    // 伦敦市场方向判断（权重较高）
    const londonSignal = londonAnalysis.signal;
    const londonPosition = parseFloat(londonAnalysis.pricePosition) / 100; // pricePosition已经是百分比，需要除以100转换为0-1
    
    // 国内市场位置判断
    const domesticPosition = parseFloat(domesticAnalysis.pricePosition) / 100; // pricePosition已经是百分比，需要除以100转换为0-1
    const domesticSignal = domesticAnalysis.signal;
    
    // 计算突破幅度（判断是否持续突破）
    const londonBandWidth = londonCurrentBollingerBands.upper - londonCurrentBollingerBands.lower;
    const londonBreakoutDistance = londonSignal === 'bullish' 
        ? (londonLastTradePrice - londonCurrentBollingerBands.upper) / londonBandWidth
        : londonSignal === 'bearish'
        ? (londonCurrentBollingerBands.lower - londonLastTradePrice) / londonBandWidth
        : 0;
    
    const domesticBandWidth = domesticCurrentBollingerBands.upper - domesticCurrentBollingerBands.lower;
    const domesticBreakoutDistance = domesticSignal === 'bullish'
        ? (domesticLastTradePrice - domesticCurrentBollingerBands.upper) / domesticBandWidth
        : domesticSignal === 'bearish'
        ? (domesticCurrentBollingerBands.lower - domesticLastTradePrice) / domesticBandWidth
        : 0;
    
    // 价格相关性判断（伦敦和国内的趋势是否一致）
    const priceCorrelation = (londonLastIsUp === domesticLastIsUp) ? 1 : -1;
    
    // 分析伦敦市场整体走势（用于追加手数判断）
    // 计算伦敦市场的趋势强度：价格相对中轨的位置和突破幅度
    const londonTrendStrength = londonPosition; // 0-1，0=下轨，1=上轨
    const londonTrendDirection = londonLastIsUp ? 1 : -1; // 1=上涨，-1=下跌
    const londonTrendMomentum = Math.abs(londonLastChangePercent); // 涨跌幅绝对值，代表动量
    
    // 综合策略判断（反向思维：突破上轨做空，突破下轨做多）
    // 但要预防持续突破的情况（突破幅度过大时，可能继续上涨/下跌）
    
    if (londonSignal === 'bullish') {
        // 伦敦向上突破：偏向做空（反向）
        if (londonBreakoutDistance > 0.3) {
            // 持续大幅向上突破，可能继续上涨，谨慎观望
            action = '观望';
            actionColor = '#fbbf24';
            confidence = 25;
            reasoning = `伦敦市场持续大幅向上突破（突破幅度${(londonBreakoutDistance * 100).toFixed(1)}%），可能继续上涨，建议观望等待回调`;
        } else if (domesticPosition > 0.6) {
            // 国内也在高位，可以做空等待回调
            action = '卖空';
            actionColor = '#4ade80';
            confidence = Math.min(75, 50 + (domesticPosition > 0.8 ? 25 : 0));
            entryPrice = domesticLastTradePrice;
            stopLoss = domesticLastTradePrice + STOP_LOSS_DISTANCE; // 止损：入场价+20
            takeProfit = domesticLastTradePrice - TAKE_PROFIT_DISTANCE; // 止盈：入场价-20
            
            // 追加手数逻辑：结合伦敦市场走势判断
            // 如果伦敦市场继续上涨但突破幅度不大（<0.2），且国内价格继续上涨10点以上，可以追加摊平
            if (londonTrendDirection > 0 && londonBreakoutDistance < 0.2 && domesticPosition > 0.75) {
                addPosition = '0.5手';
                addPositionReason = '伦敦市场上涨但未持续突破，国内价格继续上涨10点以上时可追加0.5手摊平';
            } else if (londonTrendDirection < 0 && domesticPosition > 0.65) {
                // 伦敦市场开始回调，国内价格回调至中轨附近时可追加
                addPosition = '0.5手';
                addPositionReason = '伦敦市场回调，国内价格回调至中轨附近时可追加0.5手';
            } else if (londonTrendDirection < 0 && domesticPosition > 0.75) {
                addPosition = '0.5手';
                addPositionReason = '伦敦市场回调确认，国内高位可追加0.5手，等待回调';
            }
            
            reasoning = `伦敦市场向上突破，国内市场价格${(domesticPosition * 100).toFixed(0)}%高位，预计回调，建议做空`;
        } else {
            // 国内还在中低位，可能跟随上涨，观望
            action = '观望';
            actionColor = '#fbbf24';
            confidence = 35;
            reasoning = `伦敦市场向上突破，但国内市场价格${(domesticPosition * 100).toFixed(1)}%位置，可能跟随上涨，建议观望`;
        }
    } else if (londonSignal === 'bearish') {
        // 伦敦向下突破：偏向做多（反向）
        if (londonBreakoutDistance > 0.3) {
            // 持续大幅向下突破，可能继续下跌，谨慎观望
            action = '观望';
            actionColor = '#fbbf24';
            confidence = 25;
            reasoning = `伦敦市场持续大幅向下突破（突破幅度${(londonBreakoutDistance * 100).toFixed(1)}%），可能继续下跌，建议观望等待反弹`;
        } else if (domesticPosition < 0.4) {
            // 国内也在低位，可以做多等待反弹
            action = '买多';
            actionColor = '#ef4444';
            confidence = Math.min(75, 50 + (domesticPosition < 0.2 ? 25 : 0));
            entryPrice = domesticLastTradePrice;
            stopLoss = domesticLastTradePrice - STOP_LOSS_DISTANCE; // 止损：入场价-20
            takeProfit = domesticLastTradePrice + TAKE_PROFIT_DISTANCE; // 止盈：入场价+20
            
            // 追加手数逻辑：结合伦敦市场走势判断
            // 如果伦敦市场继续下跌但突破幅度不大（<0.2），且国内价格继续下跌10点以上，可以追加摊平
            if (londonTrendDirection < 0 && londonBreakoutDistance < 0.2 && domesticPosition < 0.25) {
                addPosition = '0.5手';
                addPositionReason = '伦敦市场下跌但未持续突破，国内价格继续下跌10点以上时可追加0.5手摊平';
            } else if (londonTrendDirection > 0 && domesticPosition < 0.35) {
                // 伦敦市场开始反弹，国内价格反弹至中轨附近时可追加
                addPosition = '0.5手';
                addPositionReason = '伦敦市场反弹，国内价格反弹至中轨附近时可追加0.5手';
            } else if (londonTrendDirection > 0 && domesticPosition < 0.25) {
                addPosition = '0.5手';
                addPositionReason = '伦敦市场反弹确认，国内低位可追加0.5手，等待反弹';
            }
            
            reasoning = `伦敦市场向下突破，国内市场价格${(domesticPosition * 100).toFixed(0)}%低位，预计反弹，建议做多`;
        } else {
            // 国内还在中高位，可能跟随下跌，观望
            action = '观望';
            actionColor = '#fbbf24';
            confidence = 35;
            reasoning = `伦敦市场向下突破，但国内市场价格${(domesticPosition * 100).toFixed(1)}%位置，可能跟随下跌，建议观望`;
        }
    } else if (londonPosition > 0.75 && domesticPosition > 0.7) {
        // 两个市场都在高位，可以做空
        action = '卖空';
        actionColor = '#4ade80';
        confidence = 60;
        entryPrice = domesticLastTradePrice;
        stopLoss = domesticLastTradePrice + STOP_LOSS_DISTANCE; // 止损：入场价+20
        takeProfit = domesticLastTradePrice - TAKE_PROFIT_DISTANCE; // 止盈：入场价-20
        
        // 追加手数逻辑：双市场高位，结合伦敦市场走势
        if (londonTrendDirection < 0) {
            // 伦敦市场开始回调，可以分批建仓
            addPosition = '1手';
            addPositionReason = '双市场高位+伦敦回调，建议分批建仓：先开1手，价格回调5-10点后追加0.5手，盈利15点后可再加0.5手';
        } else if (londonBreakoutDistance > 0.15) {
            // 伦敦市场还在突破，谨慎
            addPosition = '0.5手';
            addPositionReason = '双市场高位但伦敦仍在突破，建议先开0.5手，等待伦敦回调确认后再追加';
        } else {
            addPosition = '1手';
            addPositionReason = '双市场高位，建议分批建仓：先开1手，价格回调5-10点后追加0.5手，盈利15点后可再加0.5手';
        }
        
        reasoning = `伦敦和国内市场都在高位（伦敦${(londonPosition * 100).toFixed(0)}%，国内${(domesticPosition * 100).toFixed(0)}%），预计回调，建议做空`;
    } else if (londonPosition < 0.25 && domesticPosition < 0.3) {
        // 两个市场都在低位，可以做多
        action = '买多';
        actionColor = '#ef4444';
        confidence = 60;
        entryPrice = domesticLastTradePrice;
        stopLoss = domesticLastTradePrice - STOP_LOSS_DISTANCE; // 止损：入场价-20
        takeProfit = domesticLastTradePrice + TAKE_PROFIT_DISTANCE; // 止盈：入场价+20
        
        // 追加手数逻辑：双市场低位，结合伦敦市场走势
        if (londonTrendDirection > 0) {
            // 伦敦市场开始反弹，可以分批建仓
            addPosition = '1手';
            addPositionReason = '双市场低位+伦敦反弹，建议分批建仓：先开1手，价格反弹5-10点后追加0.5手，盈利15点后可再加0.5手';
        } else if (londonBreakoutDistance > 0.15) {
            // 伦敦市场还在突破下跌，谨慎
            addPosition = '0.5手';
            addPositionReason = '双市场低位但伦敦仍在突破下跌，建议先开0.5手，等待伦敦反弹确认后再追加';
        } else {
            addPosition = '1手';
            addPositionReason = '双市场低位，建议分批建仓：先开1手，价格反弹5-10点后追加0.5手，盈利15点后可再加0.5手';
        }
        
        reasoning = `伦敦和国内市场都在低位（伦敦${(londonPosition * 100).toFixed(0)}%，国内${(domesticPosition * 100).toFixed(0)}%），预计反弹，建议做多`;
    } else {
        // 其他情况，观望
        action = '观望';
        actionColor = '#9ca3af';
        confidence = 40;
        reasoning = `市场信号不明确，伦敦${londonAnalysis.positionDesc}，国内${domesticAnalysis.positionDesc}`;
    }
    
    return {
        action,
        actionColor,
        confidence,
        entryPrice,
        stopLoss,
        takeProfit,
        addPosition,
        addPositionReason,
        reasoning,
        londonAnalysis,
        domesticAnalysis
    };
}

// 应用防抖逻辑，稳定操作建议
function applyStrategyDebounce(newStrategy) {
    if (!newStrategy) {
        return null;
    }
    
    const now = Date.now();
    const currentAction = newStrategy.action;
    
    // 如果是第一次或者操作建议发生变化
    if (!strategyDebounce.lastAction || strategyDebounce.lastAction !== currentAction) {
        // 重置计数器，记录新的操作建议
        strategyDebounce.lastAction = currentAction;
        strategyDebounce.lastActionTime = now;
        strategyDebounce.changeCount = 1;
        
        // 如果当前操作建议与稳定建议不同，等待一段时间确认
        if (strategyDebounce.stableAction !== currentAction) {
            // 如果上一次稳定建议的时间已经过去很久（超过2倍防抖时间），直接更新
            if (!strategyDebounce.stableActionTime || 
                (now - strategyDebounce.stableActionTime) > strategyDebounce.DEBOUNCE_DURATION * 2) {
                strategyDebounce.stableAction = currentAction;
                strategyDebounce.stableActionTime = now;
                return newStrategy; // 返回新的策略
            }
            // 否则返回null，表示需要保持上一次的稳定建议
            return null;
        }
    } else {
        // 操作建议相同，检查是否已经稳定足够长时间
        const timeSinceChange = now - strategyDebounce.lastActionTime;
        
        if (timeSinceChange >= strategyDebounce.DEBOUNCE_DURATION) {
            // 已经稳定足够长时间，更新稳定建议
            if (strategyDebounce.stableAction !== currentAction) {
                strategyDebounce.stableAction = currentAction;
                strategyDebounce.stableActionTime = now;
                return newStrategy; // 返回新的策略
            }
            // 已经是稳定建议，直接返回
            return newStrategy;
        } else {
            // 还不够稳定，返回null，保持上一次的稳定建议
            return null;
        }
    }
    
    // 如果当前操作建议与稳定建议相同，直接返回
    if (strategyDebounce.stableAction === currentAction) {
        return newStrategy;
    }
    
    // 默认返回null，保持上一次的稳定建议
    return null;
}

// 保存上一次稳定的策略（用于防抖）
let lastStableStrategy = null;

// 保存AI分析结果
let aiAnalysisResult = null;

// 分析状态标志，防止重复点击
let isAnalyzing = false;

// 将AI分析结果转换为策略显示格式
function convertAIResultToStrategy(aiResult) {
    if (!aiResult || aiResult.error) {
        return null;
    }
    
    const advice = aiResult.tradingAdvice || {};
    
    // 根据action确定颜色
    let actionColor = '#9ca3af';
    if (advice.action === '买入') {
        actionColor = '#ef4444';
    } else if (advice.action === '卖出') {
        actionColor = '#4ade80';
    }
    
    // 根据市场情绪确定信号颜色
    let signalColor = '#9ca3af';
    if (aiResult.marketSentiment === '看涨') {
        signalColor = '#ef4444';
    } else if (aiResult.marketSentiment === '看跌') {
        signalColor = '#4ade80';
    }
    
    return {
        action: advice.action || '观望',
        actionColor: actionColor,
        confidence: advice.confidence || 0,
        entryPrice: advice.entryPrice || 0,
        stopLoss: advice.stopLoss || 0,
        takeProfit: advice.takeProfit || 0,
        riskLevel: advice.riskLevel || '中',
        positionSize: advice.positionSize || '建议观望',
        reasoning: aiResult.analysis?.details || aiResult.analysis?.summary || '暂无详细分析',
        trend: aiResult.trend || '未知',
        trendStrength: aiResult.trendStrength || '未知',
        supportLevel: aiResult.supportLevel || 0,
        resistanceLevel: aiResult.resistanceLevel || 0,
        marketSentiment: aiResult.marketSentiment || '中性',
        momentum: aiResult.momentum || '未知',
        volatility: aiResult.volatility || '未知',
        keyPatterns: aiResult.keyPatterns || [],
        opportunities: aiResult.analysis?.opportunities || '',
        risks: aiResult.analysis?.risks || '',
        recommendations: aiResult.recommendations || []
    };
}

// 更新交易策略显示
function updateTradingStrategy() {
    const container = document.getElementById('trading-strategy-content');
    if (!container) {
        return;
    }
    
    // 优先使用AI分析结果
    if (aiAnalysisResult) {
        const aiStrategy = convertAIResultToStrategy(aiAnalysisResult);
        if (aiStrategy) {
            renderStrategyFromAI(aiStrategy);
            return;
        }
    }
    
    // 如果没有AI分析结果，使用原有逻辑（但隐藏）
    container.innerHTML = '<div class="loading">等待AI分析数据...</div>';
    
    // 注释掉原有的策略分析逻辑，只保留AI分析
    /*
    const rawStrategy = analyzeTradingStrategy();
    
    if (!rawStrategy) {
        container.innerHTML = '<div class="loading">等待市场数据...</div>';
        return;
    }
    
    // 应用防抖逻辑
    const strategy = applyStrategyDebounce(rawStrategy);
    
    // 如果没有返回新策略（防抖中），使用上一次的稳定策略
    const displayStrategy = strategy || lastStableStrategy;
    
    if (!displayStrategy) {
        container.innerHTML = '<div class="loading">等待市场数据...</div>';
        return;
    }
    
    // 保存当前策略为稳定策略（如果通过了防抖）
    if (strategy) {
        lastStableStrategy = strategy;
    }
    */
}

// 使用AI分析结果渲染策略
function renderStrategyFromAI(displayStrategy) {
    const container = document.getElementById('trading-strategy-content');
    if (!container) {
        return;
    }
    
    let html = '';
    
    // 当前持仓信息
    const floatingPnL = calculateFloatingPnL(domesticLastTradePrice);
    const hasPosition = currentPosition.direction && currentPosition.lots > 0;
    
    // 操作建议（大标题）
    html += `<div class="strategy-main-action" style="text-align: center; margin-bottom: 20px; padding: 20px; background: rgba(19, 23, 43, 0.8); border-radius: 8px; border: 2px solid ${displayStrategy.actionColor};">
        <div style="font-size: 14px; color: #9ca3af; margin-bottom: 8px;">操作建议</div>
        <div style="font-size: 32px; font-weight: 700; color: ${displayStrategy.actionColor}; margin-bottom: 8px;">
            ${displayStrategy.action}
        </div>
        <div style="font-size: 14px; color: #9ca3af; margin-bottom: 8px;">
            信心度: <span style="color: ${displayStrategy.confidence >= 70 ? '#ef4444' : displayStrategy.confidence >= 50 ? '#fbbf24' : '#9ca3af'}; font-weight: 600;">${displayStrategy.confidence}%</span>
        </div>
        ${hasPosition ? `
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #1e2548;">
            <div style="font-size: 12px; color: #9ca3af; margin-bottom: 5px;">当前持仓</div>
            <div style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 5px;">
                ${currentPosition.direction === 'buy' ? '买多' : '卖空'} ${currentPosition.lots}手 | 开仓价: ${Math.round(currentPosition.entryPrice)}
            </div>
            <div style="font-size: 14px; font-weight: 600; color: ${floatingPnL.isProfit ? '#4ade80' : '#ef4444'};">
                浮动盈亏: ${floatingPnL.isProfit ? '+' : ''}${Math.round(floatingPnL.pnl)} (${floatingPnL.isProfit ? '+' : ''}${floatingPnL.pnlPercent.toFixed(2)}%)
            </div>
        </div>
        ` : ''}
    </div>`;
    
    // 价格指引
    html += `<div class="strategy-section" style="margin-bottom: 20px;">
        <div style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1e2548;">
            价格指引
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            ${displayStrategy.entryPrice > 0 ? `
            <div style="padding: 12px; background: rgba(19, 23, 43, 0.6); border-radius: 6px;">
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">入场价格</div>
                <div style="font-size: 18px; font-weight: 600; color: #ffffff;">${Math.round(displayStrategy.entryPrice)}</div>
            </div>
            ` : '<div></div>'}
            ${displayStrategy.stopLoss > 0 ? `
            <div style="padding: 12px; background: rgba(19, 23, 43, 0.6); border-radius: 6px;">
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">止损价格</div>
                <div style="font-size: 18px; font-weight: 600; color: #4ade80;">${Math.round(displayStrategy.stopLoss)}</div>
            </div>
            ` : '<div></div>'}
            ${displayStrategy.takeProfit > 0 ? `
            <div style="padding: 12px; background: rgba(19, 23, 43, 0.6); border-radius: 6px;">
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">止盈价格</div>
                <div style="font-size: 18px; font-weight: 600; color: #ef4444;">${Math.round(displayStrategy.takeProfit)}</div>
            </div>
            ` : '<div></div>'}
        </div>
    </div>`;
    
    // 分析理由
    html += `<div class="strategy-section" style="margin-bottom: 20px;">
        <div style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1e2548;">
            分析理由
        </div>
        <div style="padding: 12px; background: rgba(19, 23, 43, 0.6); border-radius: 6px; color: #e0e0e0; line-height: 1.6;">
            ${displayStrategy.reasoning}
        </div>
    </div>`;
    
    // 市场分析
    html += `<div class="strategy-section">
        <div style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1e2548;">
            市场分析
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
            <div style="padding: 12px; background: rgba(19, 23, 43, 0.6); border-radius: 6px;">
                <div style="font-size: 14px; font-weight: 600; color: #60a5fa; margin-bottom: 8px;">趋势分析</div>
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">趋势: <span style="color: ${displayStrategy.actionColor};">${displayStrategy.trend}</span></div>
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">强度: <span style="color: ${displayStrategy.actionColor};">${displayStrategy.trendStrength}</span></div>
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">情绪: <span style="color: ${displayStrategy.actionColor};">${displayStrategy.marketSentiment}</span></div>
                <div style="font-size: 12px; color: #9ca3af;">动量: ${displayStrategy.momentum}</div>
            </div>
            <div style="padding: 12px; background: rgba(19, 23, 43, 0.6); border-radius: 6px;">
                <div style="font-size: 14px; font-weight: 600; color: #a78bfa; margin-bottom: 8px;">支撑阻力</div>
                ${displayStrategy.supportLevel > 0 ? `
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">支撑位: <span style="color: #4ade80;">${Math.round(displayStrategy.supportLevel)}</span></div>
                ` : ''}
                ${displayStrategy.resistanceLevel > 0 ? `
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">阻力位: <span style="color: #ef4444;">${Math.round(displayStrategy.resistanceLevel)}</span></div>
                ` : ''}
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">风险等级: <span style="color: ${displayStrategy.riskLevel === '高' ? '#ef4444' : displayStrategy.riskLevel === '中' ? '#fbbf24' : '#4ade80'}; font-weight: 600;">${displayStrategy.riskLevel}</span></div>
                <div style="font-size: 12px; color: #9ca3af;">波动性: ${displayStrategy.volatility}</div>
            </div>
        </div>
        ${displayStrategy.keyPatterns && displayStrategy.keyPatterns.length > 0 ? `
        <div style="margin-top: 10px; padding: 12px; background: rgba(19, 23, 43, 0.6); border-radius: 6px;">
            <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">关键形态:</div>
            <div style="font-size: 12px; color: #e0e0e0;">${displayStrategy.keyPatterns.join(', ')}</div>
        </div>
        ` : ''}
    </div>`;
    
    container.innerHTML = html;
}

// 更新布林带分析显示
function updateBollingerAnalysis(price, bollingerBands, containerId) {
    const container = document.getElementById(containerId);
    
    if (!container) {
        return;
    }
    
    // 如果没有价格数据，显示等待状态
    if (!price || price <= 0) {
        container.innerHTML = '<div class="loading">等待价格数据...</div>';
        return;
    }
    
    // 如果没有布林带数据，显示等待状态
    if (!bollingerBands || !bollingerBands.upper || !bollingerBands.middle || !bollingerBands.lower) {
        container.innerHTML = '<div class="loading">等待布林带数据...</div>';
        return;
    }
    
    // 分析布林带
    const analysis = analyzeBollingerBands(
        price,
        bollingerBands.upper,
        bollingerBands.middle,
        bollingerBands.lower
    );
    
    // 构建HTML
    let html = '';
    
    // 价格位置
    html += `<div class="analysis-item" style="margin-bottom: 15px;">
        <div class="analysis-label">位置:</div>
        <div class="analysis-value" style="color: ${analysis.signalColor}; font-weight: 600;">
            ${analysis.positionDesc}
        </div>
    </div>`;
    
    // 突破情况
    html += `<div class="analysis-item" style="margin-bottom: 15px;">
        <div class="analysis-label">突破:</div>
        <div class="analysis-value" style="color: ${analysis.signalColor};">
            ${analysis.breakoutDesc}
        </div>
    </div>`;
    
    // 布林带数值
    html += `<div class="analysis-item" style="margin-bottom: 15px; padding-top: 10px; border-top: 1px solid #1e2548;">
        <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px;">布林带数值:</div>
        <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <div>
                <span style="color: #60a5fa;">上轨:</span>
                <span style="color: #e0e0e0;">${analysis.upper}</span>
            </div>
            <div>
                <span style="color: #a78bfa;">中轨:</span>
                <span style="color: #e0e0e0;">${analysis.middle}</span>
            </div>
            <div>
                <span style="color: #60a5fa;">下轨:</span>
                <span style="color: #e0e0e0;">${analysis.lower}</span>
            </div>
        </div>
        <div style="margin-top: 5px; font-size: 11px; color: #6b7280;">
            位置: ${analysis.pricePosition}% | 距离中轨: ${analysis.distanceFromMiddlePercent}%
        </div>
    </div>`;
    
    // 交易策略
    html += `<div class="analysis-item" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #1e2548;">
        <div class="analysis-label" style="font-weight: 600; margin-bottom: 8px;">交易策略:</div>
        <div class="analysis-value" style="color: ${analysis.signalColor}; font-weight: 500; line-height: 1.5;">
            ${analysis.strategyDesc}
        </div>
    </div>`;
    
    container.innerHTML = html;
}

// 更新国内白银成交价显示（显示在标题中）
function updateDomesticTradeTick(tick) {
    const container = document.getElementById('domestic-trade-tick-info');
    
    if (!container) {
        return;
    }
    
    // 如果没有数据，显示上一次的价格（如果有）
    if (!tick) {
        if (domesticLastTradePrice !== null && domesticLastTradePrice > 0) {
            const changeColor = domesticLastIsUp ? '#ef4444' : '#4ade80';
            const changeSign = domesticLastChange >= 0 ? '+' : '';
            container.innerHTML = `<span style="color: ${changeColor};">${Math.round(domesticLastTradePrice)}</span>`;
        } else {
            container.innerHTML = '<span style="color: #6b7280;">加载中...</span>';
        }
        return;
    }
    
    // 处理数据格式
    let priceData = tick;
    if (Array.isArray(tick) && tick.length > 0) {
        priceData = tick[0];
    }
    
    const price = parseFloat(priceData.price || 0);
    
    if (price === 0) {
        if (domesticLastTradePrice !== null && domesticLastTradePrice > 0) {
            const changeColor = domesticLastIsUp ? '#ef4444' : '#4ade80';
            container.innerHTML = `<span style="color: ${changeColor};">${Math.round(domesticLastTradePrice)}</span>`;
        } else {
            container.innerHTML = '<span style="color: #6b7280;">加载中...</span>';
        }
        return;
    }
    
    // 计算涨跌
    let change = 0;
    let changePercent = 0;
    let isUp = false;
    
    if (domesticPreviousDayClosePrice !== null && domesticPreviousDayClosePrice > 0) {
        change = price - domesticPreviousDayClosePrice;
        changePercent = domesticPreviousDayClosePrice !== 0 ? ((change / domesticPreviousDayClosePrice) * 100) : 0;
        isUp = change >= 0;
    } else if (domesticLastTradePrice !== null && domesticLastTradePrice > 0) {
        change = price - domesticLastTradePrice;
        changePercent = domesticLastTradePrice !== 0 ? ((change / domesticLastTradePrice) * 100) : 0;
        isUp = change >= 0;
    }
    
    domesticLastChange = change;
    domesticLastChangePercent = changePercent;
    domesticLastIsUp = isUp;
    domesticLastTradePrice = price;
    
    const priceColor = isUp ? '#ef4444' : '#4ade80';
    
    // 更新标题中的价格显示
    container.innerHTML = `<span style="color: ${priceColor};">${Math.round(price)}</span>`;
    
    // 如果国内图表已初始化，更新图表显示实时价格
    if (domesticChart && domesticChart.getOption) {
        updateDomesticChartRealtimePrice();
    }
    
    // 更新交易策略
    updateTradingStrategy();
}

// 更新伦敦白银成交价显示（显示在标题中）
function updateLondonTradeTick(tick) {
    const container = document.getElementById('london-trade-tick-info');
    
    if (!container) {
        return;
    }
    
    // 如果没有数据，显示上一次的价格（如果有）
    if (!tick) {
        if (londonLastTradePrice !== null && londonLastTradePrice > 0) {
            const changeColor = londonLastIsUp ? '#ef4444' : '#4ade80';
            container.innerHTML = `<span style="color: ${changeColor};">${londonLastTradePrice.toFixed(3)}</span>`;
        } else {
            container.innerHTML = '<span style="color: #6b7280;">加载中...</span>';
        }
        return;
    }
    
    // 处理WebSocket推送的数据格式
    // 可能是单个对象 {code, price, ...} 或数组 [{code, price, ...}]
    let priceData = tick;
    if (Array.isArray(tick) && tick.length > 0) {
        // 如果是数组，取第一个
        priceData = tick[0];
    }
    
    const price = parseFloat(priceData.price || 0);
    
    if (price === 0) {
        if (londonLastTradePrice !== null && londonLastTradePrice > 0) {
            const changeColor = londonLastIsUp ? '#ef4444' : '#4ade80';
            container.innerHTML = `<span style="color: ${changeColor};">${londonLastTradePrice.toFixed(3)}</span>`;
        } else {
            container.innerHTML = '<span style="color: #6b7280;">加载中...</span>';
        }
        return;
    }
    
    // 计算涨跌
    let change = 0;
    let changePercent = 0;
    let isUp = false;
    
    if (londonPreviousDayClosePrice !== null && londonPreviousDayClosePrice > 0) {
        change = price - londonPreviousDayClosePrice;
        changePercent = londonPreviousDayClosePrice !== 0 ? ((change / londonPreviousDayClosePrice) * 100) : 0;
        isUp = change >= 0;
    } else if (londonLastTradePrice !== null && londonLastTradePrice > 0) {
        change = price - londonLastTradePrice;
        changePercent = londonLastTradePrice !== 0 ? ((change / londonLastTradePrice) * 100) : 0;
        isUp = change >= 0;
    }
    
    londonLastChange = change;
    londonLastChangePercent = changePercent;
    londonLastIsUp = isUp;
    londonLastTradePrice = price;
    
    const priceColor = isUp ? '#ef4444' : '#4ade80';
    
    // 更新标题中的价格显示
    container.innerHTML = `<span style="color: ${priceColor};">${price.toFixed(3)}</span>`;
    
    // 如果伦敦图表已初始化，更新图表显示实时价格
    if (londonChart && londonChart.getOption) {
        updateLondonChartRealtimePrice();
    }
    
    // 更新交易策略
    updateTradingStrategy();
}

// 更新国内图表实时价格显示（在K线图上）
function updateDomesticChartRealtimePrice() {
    if (!domesticChart || !domesticChart.getOption) {
        return;
    }
    
    try {
        if (domesticLastTradePrice !== null && domesticLastTradePrice > 0) {
            const changeColor = domesticLastIsUp ? '#ef4444' : '#4ade80';
            const changeSign = domesticLastChange >= 0 ? '+' : '';
            
            // 更新graphic组件，显示在图表右上角
            domesticChart.setOption({
                graphic: [{
                    type: 'text',
                    right: 10,
                    top: 10,
                    z: 100,
                    style: {
                        text: `${Math.round(domesticLastTradePrice)}\n${changeSign}${Math.round(domesticLastChange)} (${changeSign}${domesticLastChangePercent.toFixed(2)}%)`,
                        fill: changeColor,
                        fontSize: 12,
                        fontWeight: 600,
                        textAlign: 'right',
                        textVerticalAlign: 'top',
                        backgroundColor: 'rgba(19, 23, 43, 0.9)',
                        borderColor: changeColor,
                        borderWidth: 1,
                        padding: [6, 10],
                        borderRadius: 4
                    }
                }]
            }, false);
        }
    } catch (error) {
        // 静默失败，避免影响其他功能
        console.warn('更新国内图表实时价格失败:', error);
    }
}

// 更新伦敦图表实时价格显示（在K线图上）
function updateLondonChartRealtimePrice() {
    if (!londonChart || !londonChart.getOption) {
        return;
    }
    
    try {
        if (londonLastTradePrice !== null && londonLastTradePrice > 0) {
            const changeColor = londonLastIsUp ? '#ef4444' : '#4ade80';
            const changeSign = londonLastChange >= 0 ? '+' : '';
            
            // 更新graphic组件，显示在图表右上角
            londonChart.setOption({
                graphic: [{
                    type: 'text',
                    right: 10,
                    top: 10,
                    z: 100,
                    style: {
                        text: `${londonLastTradePrice.toFixed(3)}\n${changeSign}${londonLastChange.toFixed(3)} (${changeSign}${londonLastChangePercent.toFixed(2)}%)`,
                        fill: changeColor,
                        fontSize: 12,
                        fontWeight: 600,
                        textAlign: 'right',
                        textVerticalAlign: 'top',
                        backgroundColor: 'rgba(19, 23, 43, 0.9)',
                        borderColor: changeColor,
                        borderWidth: 1,
                        padding: [6, 10],
                        borderRadius: 4
                    }
                }]
            }, false);
        }
    } catch (error) {
        // 静默失败，避免影响其他功能
        console.warn('更新伦敦图表实时价格失败:', error);
    }
}

// 计算布林带
function calculateBollingerBands(data, period = 20, stdDev = 2) {
    const upper = [];
    const middle = [];
    const lower = [];
    
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            // 数据点不足，无法计算布林带
            upper.push(null);
            middle.push(null);
            lower.push(null);
            continue;
        }
        
        // 获取过去period期的收盘价
        const prices = [];
        for (let j = i - period + 1; j <= i; j++) {
            prices.push(data[j].c);
        }
        
        // 计算移动平均线（中轨）
        const ma = prices.reduce((sum, price) => sum + price, 0) / period;
        middle.push(ma);
        
        // 计算标准差
        const variance = prices.reduce((sum, price) => sum + Math.pow(price - ma, 2), 0) / period;
        const standardDeviation = Math.sqrt(variance);
        
        // 计算上轨和下轨
        upper.push(ma + stdDev * standardDeviation);
        lower.push(ma - stdDev * standardDeviation);
    }
    
    return { upper, middle, lower };
}

// 更新图表
function updateChart(chart, data, infoElementId) {
    if (!data || data.length === 0) {
        const infoElement = document.getElementById(infoElementId);
        if (infoElement) {
            infoElement.innerHTML = '<span style="color: #ef4444;">暂无数据</span>';
        }
        return;
    }
    
    // 数据格式：{t, o, c, h, l, v, tu}
    // t: 时间戳（毫秒）, o: 开盘价, c: 收盘价, h: 最高价, l: 最低价, v: 成交量, tu: 成交额
    const normalizeData = data.map(item => {
        // 确保时间戳是数字类型（毫秒）
        const timestamp = typeof item.t === 'number' ? item.t : parseInt(item.t || 0);
        // 确保时间戳是毫秒级（如果小于10000000000则是秒级，需要转换）
        const timestampMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
        
        return {
            t: timestampMs,
            o: parseFloat(item.o || 0),
            c: parseFloat(item.c || 0),
            h: parseFloat(item.h || 0),
            l: parseFloat(item.l || 0),
            v: parseFloat(item.v || 0),
            tu: parseFloat(item.tu || 0)
        };
    });
    
    // 排序数据（按时间戳升序）
    const sortedData = [...normalizeData].sort((a, b) => a.t - b.t);
    
    // 计算布林带
    const bollingerBands = calculateBollingerBands(sortedData, 20, 2);
    
    // 保存最新的布林带数据（用于实时分析）
    // 根据infoElementId判断是哪个市场
    const isDomestic = infoElementId.includes('domestic');
    const isLondon = infoElementId.includes('london');
    if (sortedData.length > 0) {
        const latestIndex = sortedData.length - 1;
        if (bollingerBands.upper[latestIndex] !== null) {
            const bollingerData = {
                upper: bollingerBands.upper[latestIndex],
                middle: bollingerBands.middle[latestIndex],
                lower: bollingerBands.lower[latestIndex]
            };
            
            if (isDomestic) {
                domesticCurrentBollingerBands = bollingerData;
            } else if (isLondon) {
                londonCurrentBollingerBands = bollingerData;
            }
        }
    }
    
    // 更新交易策略（如果有完整数据）
    updateTradingStrategy();
    
    // 准备K线数据
    const klineData = sortedData.map(item => [
        item.o, // 开盘价
        item.c, // 收盘价
        item.l, // 最低价
        item.h  // 最高价
    ]);
    
    // 计算价格范围，用于设置Y轴范围
    let minPrice, maxPrice, paddingTop, paddingBottom, yAxisMin, yAxisMax;
    
    if (isLondon) {
        // 伦敦白银：只基于K线的最高最低价，上方扩展15%，下方扩展10%
        const klinePrices = sortedData.flatMap(item => [item.h, item.l]); // 只取最高价和最低价
        minPrice = Math.min(...klinePrices);
        maxPrice = Math.max(...klinePrices);
        const priceRange = maxPrice - minPrice;
        // 上方扩展15%，下方扩展10%
        paddingTop = priceRange * 0.15;
        paddingBottom = priceRange * 0.1;
        // 计算Y轴的最小值和最大值
        yAxisMin = minPrice - paddingBottom;
        yAxisMax = maxPrice + paddingTop;
    } else {
        // 国内白银：只基于K线的最高最低价，上方扩展15%，下方扩展10%
        const klinePrices = sortedData.flatMap(item => [item.h, item.l]); // 只取最高价和最低价
        minPrice = Math.min(...klinePrices);
        maxPrice = Math.max(...klinePrices);
        const priceRange = maxPrice - minPrice;
        // 上方扩展15%，下方扩展10%
        paddingTop = priceRange * 0.15;
        paddingBottom = priceRange * 0.1;
        // 计算Y轴的最小值和最大值
        yAxisMin = minPrice - paddingBottom;
        yAxisMax = maxPrice + paddingTop;
    }
    
    // 准备时间轴数据
    const timeData = sortedData.map(item => {
        const date = new Date(item.t);
        // 如果数据点多，只显示时分；如果数据点少，显示月日时分
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        if (sortedData.length > 50) {
            // 数据点多，只显示时分
            return `${hours}:${minutes}`;
        } else {
            // 数据点少，显示月日时分
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            return `${month}-${day} ${hours}:${minutes}`;
        }
    });
    
    // K线图不再显示价格信息，改为使用WebSocket实时推送的最新成交价
    const infoElement = document.getElementById(infoElementId);
    if (infoElement) {
        infoElement.innerHTML = ''; // 清空信息显示
    }
    
    // 不再更新今日开盘价，改为在初始化时获取前一日收盘价
    // 更新图表
    
    // 准备实时价格标记在图表右上角
    let graphic = [];
    
    // 如果是伦敦白银，添加实时价格标记
    if (isLondon && londonLastTradePrice !== null && londonLastTradePrice > 0 && sortedData.length > 0) {
        const changeColor = londonLastIsUp ? '#ef4444' : '#4ade80';
        const changeSign = londonLastChange >= 0 ? '+' : '';
        
        // 使用graphic组件在图表右上角添加文本
        graphic.push({
            type: 'text',
            right: 10,
            top: 10,
            z: 100,
            style: {
                text: `${londonLastTradePrice.toFixed(3)}\n${changeSign}${londonLastChange.toFixed(3)} (${changeSign}${londonLastChangePercent.toFixed(2)}%)`,
                fill: changeColor,
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'right',
                textVerticalAlign: 'top',
                backgroundColor: 'rgba(19, 23, 43, 0.9)',
                borderColor: changeColor,
                borderWidth: 1,
                padding: [6, 10],
                borderRadius: 4
            }
        });
    }
    
    // 如果是国内白银，添加实时价格标记
    if (!isLondon && domesticLastTradePrice !== null && domesticLastTradePrice > 0 && sortedData.length > 0) {
        const changeColor = domesticLastIsUp ? '#ef4444' : '#4ade80';
        const changeSign = domesticLastChange >= 0 ? '+' : '';
        
        // 使用graphic组件在图表右上角添加文本
        graphic.push({
            type: 'text',
            right: 10,
            top: 10,
            z: 100,
            style: {
                text: `${Math.round(domesticLastTradePrice)}\n${changeSign}${Math.round(domesticLastChange)} (${changeSign}${domesticLastChangePercent.toFixed(2)}%)`,
                fill: changeColor,
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'right',
                textVerticalAlign: 'top',
                backgroundColor: 'rgba(19, 23, 43, 0.9)',
                borderColor: changeColor,
                borderWidth: 1,
                padding: [6, 10],
                borderRadius: 4
            }
        });
    }
    
    // 准备价格通道线（从AI分析结果获取支撑位和阻力位）
    let markLineConfig = null;
    let markAreaConfig = null;
    let supportLevel = 0;
    let resistanceLevel = 0;
    
    // 从AI分析结果中获取支撑位和阻力位
    if (aiAnalysisResult) {
        const aiStrategy = convertAIResultToStrategy(aiAnalysisResult);
        if (aiStrategy) {
            supportLevel = aiStrategy.supportLevel || 0;
            resistanceLevel = aiStrategy.resistanceLevel || 0;
        }
    }
    
    // 如果有支撑位和阻力位，添加通道线
    if (supportLevel > 0 && resistanceLevel > 0) {
        // 创建markLine数据，绘制横跨整个图表的价格通道
        markLineConfig = {
            silent: false,
            symbol: ['none', 'none'],
            lineStyle: {
                color: '#fbbf24',
                width: 2,
                type: 'solid',
                opacity: 0.8
            },
            label: {
                show: true,
                position: 'end',
                formatter: function(params) {
                    return params.name;
                },
                color: '#ffffff',
                backgroundColor: 'rgba(19, 23, 43, 0.9)',
                padding: [4, 8],
                borderRadius: 4
            },
            data: [
                // 阻力位（上轨）- 水平线，红色虚线
                [
                    {
                        name: '阻力位',
                        yAxis: resistanceLevel,
                        lineStyle: {
                            color: '#ef4444',
                            width: 2,
                            type: 'dashed',
                            opacity: 0.8
                        },
                        label: {
                            formatter: '阻力位 ' + (isLondon ? resistanceLevel.toFixed(3) : Math.round(resistanceLevel)),
                            color: '#ef4444'
                        }
                    },
                    {
                        yAxis: resistanceLevel
                    }
                ],
                // 支撑位（下轨）- 水平线，绿色虚线
                [
                    {
                        name: '支撑位',
                        yAxis: supportLevel,
                        lineStyle: {
                            color: '#4ade80',
                            width: 2,
                            type: 'dashed',
                            opacity: 0.8
                        },
                        label: {
                            formatter: '支撑位 ' + (isLondon ? supportLevel.toFixed(3) : Math.round(supportLevel)),
                            color: '#4ade80'
                        }
                    },
                    {
                        yAxis: supportLevel
                    }
                ]
            ]
        };
        
        // 添加通道填充区域（使用markArea）
        markAreaConfig = {
            silent: true,
            itemStyle: {
                color: 'rgba(251, 191, 36, 0.1)', // 黄色半透明填充
                borderColor: 'rgba(251, 191, 36, 0.3)',
                borderWidth: 1
            },
            data: [
                [
                    {
                        yAxis: supportLevel,
                        name: '通道下轨'
                    },
                    {
                        yAxis: resistanceLevel,
                        name: '通道上轨'
                    }
                ]
            ]
        };
    }
    
    const option = {
        graphic: graphic.length > 0 ? graphic : undefined,
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'cross'
            },
            backgroundColor: 'rgba(30, 37, 72, 0.95)',
            borderColor: '#1e2548',
            textStyle: {
                color: '#e0e0e0'
            },
            formatter: function(params) {
                if (!params || params.length === 0) {
                    return '';
                }
                
                let result = params[0].axisValue + '<br/>';
                
                // 判断是伦敦还是国内市场（根据infoElementId判断）
                const isLondonChart = infoElementId && infoElementId.includes('london');
                
                // 遍历所有系列
                params.forEach(function(item) {
                    if (item.seriesType === 'candlestick') {
                        // K线图数据格式：ECharts candlestick的value格式是 [开盘, 收盘, 最低, 最高]
                        const data = item.value || item.data;
                        if (Array.isArray(data) && data.length === 4) {
                            const open = data[0];
                            const close = data[1];
                            const lowest = data[2];
                            const highest = data[3];
                            
                            // 格式化价格
                            const formatPrice = function(price) {
                                if (isLondonChart) {
                                    return price.toFixed(3);
                                } else {
                                    return Math.round(price).toString();
                                }
                            };
                            
                            result += '<span style="display:inline-block;margin-right:5px;border-radius:2px;width:10px;height:10px;background-color:' + (item.color || '#ef4444') + ';"></span>';
                            result += '<span style="color:' + (item.color || '#ef4444') + ';">' + (item.seriesName || 'K线') + '</span><br/>';
                            result += '开盘: <span style="color:#ffffff;font-weight:600;">' + formatPrice(open) + '</span><br/>';
                            result += '收盘: <span style="color:#ffffff;font-weight:600;">' + formatPrice(close) + '</span><br/>';
                            result += '最高: <span style="color:#ef4444;font-weight:600;">' + formatPrice(highest) + '</span><br/>';
                            result += '最低: <span style="color:#4ade80;font-weight:600;">' + formatPrice(lowest) + '</span><br/>';
                        }
                    } else if (item.seriesType === 'line') {
                        // 其他线条（布林带等）
                        const value = item.value;
                        if (value !== null && value !== undefined) {
                            result += '<span style="display:inline-block;margin-right:5px;border-radius:2px;width:10px;height:10px;background-color:' + (item.color || '#60a5fa') + ';"></span>';
                            result += '<span style="color:' + (item.color || '#60a5fa') + ';">' + (item.seriesName || '') + '</span>: ';
                            if (isLondonChart) {
                                result += '<span style="color:#ffffff;font-weight:600;">' + value.toFixed(3) + '</span><br/>';
                            } else {
                                result += '<span style="color:#ffffff;font-weight:600;">' + Math.round(value) + '</span><br/>';
                            }
                        }
                    }
                });
                
                return result;
            }
        },
        grid: [
            {
                left: '8%', // 增加左侧空间，确保价格标签完整显示
                right: '4%',
                top: '6%', // 减少顶部间距，让图表更大
                height: '88%', // K线图占据更多空间
                containLabel: true
            }
        ],
        xAxis: [
            {
                type: 'category',
                data: timeData,
                gridIndex: 0,
                boundaryGap: false,
                axisLine: {
                    lineStyle: {
                        color: '#1e2548'
                    }
                },
                axisLabel: {
                    color: '#9ca3af',
                    show: true // 显示X轴标签
                },
                axisTick: {
                    show: false
                }
            }
        ],
        yAxis: [
            {
                type: 'value',
                scale: false, // 关闭自动缩放，使用固定比例
                gridIndex: 0,
                position: 'left',
                axisLine: {
                    lineStyle: {
                        color: '#1e2548'
                    }
                },
                axisLabel: {
                    color: '#9ca3af',
                    formatter: function(value) {
                        // 对于伦敦白银，显示3位小数；对于国内白银，取整
                        if (isLondon) {
                            return value.toFixed(3);
                        } else {
                            return Math.round(value).toString();
                        }
                    },
                    showMinLabel: true,
                    showMaxLabel: true
                },
                splitLine: {
                    lineStyle: {
                        color: '#1e2548',
                        type: 'dashed'
                    },
                    show: true
                },
                min: isLondon ? yAxisMin : function(value) {
                    // 国内白银：确保最小值不小于0，并且有足够的paddingBottom
                    const minVal = Math.max(0, value.min - paddingBottom);
                    return minVal;
                },
                max: isLondon ? yAxisMax : function(value) {
                    // 国内白银：增加最大值，使用paddingTop确保K线和布林带都有足够的显示空间
                    return value.max + paddingTop;
                },
                splitNumber: isLondon ? 6 : 5 // 伦敦白银设置6个分割点，确保刻度清晰且不重复
            }
        ],
        series: [
            {
                name: 'K线',
                type: 'candlestick',
                data: klineData,
                xAxisIndex: 0,
                yAxisIndex: 0,
                itemStyle: {
                    color: '#ef4444', // 上涨颜色（红色）
                    color0: '#4ade80', // 下跌颜色（绿色）
                    borderColor: '#ef4444',
                    borderColor0: '#4ade80',
                    borderWidth: 1
                },
                emphasis: {
                    itemStyle: {
                        color: '#ef4444',
                        color0: '#4ade80',
                        borderColor: '#ef4444',
                        borderColor0: '#4ade80',
                        borderWidth: 2
                    }
                },
                // 添加价格通道标记线和填充区域
                markLine: markLineConfig,
                markArea: markAreaConfig
            },
            // 布林带上轨
            {
                name: '布林上轨',
                type: 'line',
                data: bollingerBands.upper,
                xAxisIndex: 0,
                yAxisIndex: 0,
                lineStyle: {
                    color: '#60a5fa',
                    width: 1,
                    type: 'solid'
                },
                itemStyle: {
                    opacity: 0
                },
                symbol: 'none',
                smooth: false
            },
            // 布林带中轨（移动平均线）
            {
                name: '布林中轨',
                type: 'line',
                data: bollingerBands.middle,
                xAxisIndex: 0,
                yAxisIndex: 0,
                lineStyle: {
                    color: '#a78bfa',
                    width: 1,
                    type: 'solid'
                },
                itemStyle: {
                    opacity: 0
                },
                symbol: 'none',
                smooth: false
            },
            // 布林带下轨
            {
                name: '布林下轨',
                type: 'line',
                data: bollingerBands.lower,
                xAxisIndex: 0,
                yAxisIndex: 0,
                lineStyle: {
                    color: '#60a5fa',
                    width: 1,
                    type: 'solid'
                },
                itemStyle: {
                    opacity: 0
                },
                symbol: 'none',
                smooth: false
            }
        ]
    };
    
    chart.setOption(option);
}

// 判断当前是否在交易时间（伦敦白银）
function isLondonTradingTime() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcDay = now.getUTCDay(); // 0=周日, 6=周六
    
    // 判断是否夏令时（3月-11月）
    const month = now.getUTCMonth(); // 0-11
    const isDST = month >= 2 && month <= 10; // 3月(2)到11月(10)
    
    // 夏令时：周日22:00-周五21:00，每日休息21:00-22:00
    // 冬令时：周日23:00-周五22:00，每日休息22:00-23:00
    const dailyBreakStart = isDST ? 21 : 22;
    const dailyBreakEnd = isDST ? 22 : 23;
    
    // 周日开始时间
    const sundayStart = isDST ? 22 : 23;
    
    // 周五结束时间
    const fridayEnd = isDST ? 21 : 22;
    
    // 周六全天休市
    if (utcDay === 6) {
        return false;
    }
    
    // 周日：从start时间开始
    if (utcDay === 0) {
        return utcHour >= sundayStart;
    }
    
    // 周五：到end时间结束
    if (utcDay === 5) {
        return utcHour < fridayEnd;
    }
    
    // 周一到周四：全天交易，但排除每日休息时间
    if (utcDay >= 1 && utcDay <= 4) {
        return utcHour < dailyBreakStart || utcHour >= dailyBreakEnd;
    }
    
    return false;
}

// 判断当前是否在交易时间（国内白银 - 中国期货市场）
function isDomesticTradingTime() {
    const now = new Date();
    // 获取当前时间戳（毫秒）
    const utcTime = now.getTime();
    // 计算北京时间（UTC+8）
    const beijingOffset = 8 * 60 * 60 * 1000;
    const beijingTimestamp = utcTime + beijingOffset;
    
    // 创建北京时间对象（使用UTC方法，但时间戳是北京时间）
    const beijingDate = new Date(beijingTimestamp);
    const beijingHour = beijingDate.getUTCHours();
    const beijingMinute = beijingDate.getUTCMinutes();
    const beijingDay = beijingDate.getUTCDay(); // 0=周日, 6=周六
    
    // 周末休市
    if (beijingDay === 0 || beijingDay === 6) {
        return false;
    }
    
    // 夜盘：21:00-02:30（次日）
    if (beijingHour >= 21 || beijingHour < 2) {
        if (beijingHour === 2 && beijingMinute >= 30) {
            return false; // 02:30之后结束夜盘
        }
        return true;
    }
    
    // 日盘：09:00-11:30, 13:30-15:00
    if (beijingHour >= 9 && beijingHour < 11) {
        return true;
    }
    
    if (beijingHour === 11 && beijingMinute < 30) {
        return true;
    }
    
    if (beijingHour >= 13 && beijingHour < 15) {
        if (beijingHour === 13 && beijingMinute < 30) {
            return false; // 13:30之前休市
        }
        return true;
    }
    
    return false;
}

// 判断当前是否在交易时间（保持向后兼容）
function isTradingTime() {
    return isLondonTradingTime();
}

// 更新状态
function updateStatus(status) {
    // 判断交易状态
    const isLondonTrading = isLondonTradingTime();
    const isDomesticTrading = isDomesticTradingTime();
    
    // 更新伦敦现货白银状态点
    const londonStatusDot = document.getElementById('london-status-dot');
    if (londonStatusDot) {
        londonStatusDot.className = `status-dot ${isLondonTrading ? 'trading' : 'closed'}`;
    }
    
    // 更新国内白银主力状态点
    const domesticStatusDot = document.getElementById('domestic-status-dot');
    if (domesticStatusDot) {
        domesticStatusDot.className = `status-dot ${isDomesticTrading ? 'trading' : 'closed'}`;
    }
}

// 生成测试数据（用于调试）
function generateTestData(basePrice, name) {
    const data = [];
    const now = Date.now();
    let price = basePrice;
    
    for (let i = 99; i >= 0; i--) {
        const change = (Math.random() - 0.5) * 2;
        const open = price;
        price = price + change;
        const high = Math.max(open, price) + Math.random() * 0.5;
        const low = Math.min(open, price) - Math.random() * 0.5;
        const close = price;
        
        data.push({
            t: now - i * 60000, // 每分钟
            o: Math.round(open * 100) / 100,
            c: Math.round(close * 100) / 100,
            h: Math.round(high * 100) / 100,
            l: Math.round(low * 100) / 100,
            v: Math.floor(Math.random() * 1000 + 100),
            tu: Math.round((Math.random() * 1000000 + 100000) * 100) / 100
        });
    }
    
    return data;
}

// 初始化WebSocket连接（用于实时订阅最新成交价）
// 注意：国内白银(AG)使用TqSdk，不使用AllTick WebSocket；只有伦敦白银(Silver)使用AllTick WebSocket
function connectAllTickWebSocket() {
    // 国内白银(AG)不使用WebSocket，只通过TqSdk获取K线数据
    // 不需要创建domesticWS
    
    // 伦敦白银WebSocket（使用AllTick）
    if (londonWS) {
        londonWS.disconnect();
    }
    
    londonWS = new AllTickWebSocket(
        API_CONFIG.londonSymbol,
        (tickData) => {
            updateLondonTradeTick(tickData);
        }
    );
    londonWS.connect();
}

// 更新所有数据
async function updateAllData() {
    updateStatus('connecting');
    
    try {
        // 同时获取国内和伦敦的K线数据
        const [domesticKlineData, londonKlineData] = await Promise.all([
            fetchKlineData(API_CONFIG.domesticSymbol),
            fetchKlineData(API_CONFIG.londonSymbol)
        ]);
        
        // 保存K线数据供分析使用
        currentDomesticKlineData = domesticKlineData;
        currentLondonKlineData = londonKlineData;
        
        // 更新国内白银K线图
        if (domesticKlineData !== null && domesticKlineData.length > 0) {
            updateChart(domesticChart, domesticKlineData, 'domestic-info');
        } else {
            const domesticInfo = document.getElementById('domestic-info');
            if (domesticInfo) {
                if (domesticKlineData === null) {
                    domesticInfo.innerHTML = '<span style="color: #ef4444;">API请求失败，请检查浏览器控制台</span>';
                } else {
                    domesticInfo.innerHTML = '<span style="color: #fbbf24;">返回空数据，可能是产品代码不正确</span>';
                }
            }
        }
        
        // 更新伦敦白银K线图
        if (londonKlineData !== null && londonKlineData.length > 0) {
            updateChart(londonChart, londonKlineData, 'london-info');
        } else {
            const londonInfo = document.getElementById('london-info');
            if (londonInfo) {
                if (londonKlineData === null) {
                    londonInfo.innerHTML = '<span style="color: #ef4444;">API请求失败，请检查浏览器控制台</span>';
                } else {
                    londonInfo.innerHTML = '<span style="color: #fbbf24;">返回空数据，可能是产品代码不正确</span>';
                }
            }
        }
        
        // 更新状态（只显示交易状态）
        if ((domesticKlineData !== null && domesticKlineData.length > 0) || 
            (londonKlineData !== null && londonKlineData.length > 0)) {
            updateStatus('connected');
        } else {
            updateStatus('error');
        }
    } catch (error) {
        console.error('更新数据失败:', error);
        updateStatus('error');
    }
}

// 窗口大小改变时调整图表
window.addEventListener('resize', () => {
    if (domesticChart) {
        domesticChart.resize();
    }
    if (londonChart) {
        londonChart.resize();
    }
});

// 定时器ID，用于清除定时器
let updateTimer = null;
let tradeDepthTimer = null;

// 更新成交价（每500ms一次，即1秒2次）
// AG（国内白银）通过后端TqSdk接口HTTP轮询获取，Silver（伦敦白银）通过AllTick WebSocket实时推送
async function updateTradeAndDepth() {
    try {
        // 同时获取国内和伦敦的成交价
        const [domesticTradeTick, londonTradeTick] = await Promise.all([
            fetchTradeTick(API_CONFIG.domesticSymbol), // AG通过TqSdk获取
            fetchTradeTick(API_CONFIG.londonSymbol)    // Silver通过AllTick API获取（作为WebSocket的补充）
        ]);
        
        // 更新最新成交价（如果HTTP轮询返回了数据）
        if (domesticTradeTick) {
            updateDomesticTradeTick(domesticTradeTick);
        }
        if (londonTradeTick) {
            updateLondonTradeTick(londonTradeTick);
        }
        // Silver主要通过WebSocket实时推送，HTTP轮询作为补充
    } catch (error) {
        // 静默失败，WebSocket推送是主要数据源（对于Silver）
    }
}

// 刷新数据按钮
document.addEventListener('DOMContentLoaded', async () => {
    initCharts();
    
    // 获取前一日收盘价（用于计算涨跌幅）
    const [domesticPrevClose, londonPrevClose] = await Promise.all([
        fetchDailyKline(API_CONFIG.domesticSymbol),
        fetchDailyKline(API_CONFIG.londonSymbol)
    ]);
    
    if (domesticPrevClose !== null && domesticPrevClose > 0) {
        domesticPreviousDayClosePrice = domesticPrevClose;
        console.log('国内白银前一日收盘价:', domesticPreviousDayClosePrice);
    }
    
    if (londonPrevClose !== null && londonPrevClose > 0) {
        londonPreviousDayClosePrice = londonPrevClose;
        console.log('伦敦白银前一日收盘价:', londonPreviousDayClosePrice);
    }
    
    // 初始化WebSocket连接（订阅最新成交价）
    connectAllTickWebSocket();
    
    // 初始化状态点显示
    updateStatus();
    
    // 立即更新一次数据
    updateAllData();
    
    // 每1秒更新一次K线数据
    updateTimer = setInterval(updateAllData, 1000);
    
    // 每500ms更新一次成交价（即1秒2次）
    updateTradeAndDepth(); // 立即执行一次
    tradeDepthTimer = setInterval(updateTradeAndDepth, 500);
    
    // 监控交易时间变化，在交易时间开始时立即刷新数据
    let lastDomesticTradingState = isDomesticTradingTime();
    let lastLondonTradingState = isLondonTradingTime();
    
    setInterval(() => {
        const currentDomesticTrading = isDomesticTradingTime();
        const currentLondonTrading = isLondonTradingTime();
        
        // 如果国内交易时间从休市变为交易中，立即刷新数据
        if (!lastDomesticTradingState && currentDomesticTrading) {
            console.log('国内交易时间开始，立即刷新数据...');
            updateAllData();
            updateTradeAndDepth();
        }
        
        // 如果伦敦交易时间从休市变为交易中，立即刷新数据
        if (!lastLondonTradingState && currentLondonTrading) {
            console.log('伦敦交易时间开始，立即刷新数据...');
            updateAllData();
            updateTradeAndDepth();
        }
        
        // 更新状态点
        updateStatus();
        
        lastDomesticTradingState = currentDomesticTrading;
        lastLondonTradingState = currentLondonTrading;
    }, 1000); // 每秒检查一次交易状态
    
    // 开发模式：监听文件变化（热重载）
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('🔧 开发模式：已启用热重载功能（HTML、CSS、JS）');
        
        // 检查多个文件的变化
        const filesToCheck = [
            { url: '/script.js', name: 'script.js' },
            { url: '/style.css', name: 'style.css' },
            { url: '/index.html', name: 'index.html' }
        ];
        
        const fileHashes = {};
        
        // 初始化：获取所有文件的初始hash
        Promise.all(filesToCheck.map(file => 
            fetch(`${file.url}?t=${Date.now()}`)
                .then(response => response.ok ? response.text() : null)
                .then(content => {
                    if (content) {
                        // 计算hash（使用前200个字符，更准确）
                        const hash = btoa(content.substring(0, 200)).substring(0, 30);
                        fileHashes[file.name] = hash;
                        console.log(`✅ ${file.name} 已加载，hash: ${hash.substring(0, 10)}...`);
                    }
                })
                .catch(() => {})
        )).then(() => {
            console.log('📦 所有文件已初始化，开始监控文件变化...');
            
            // 每2秒检查一次文件是否有更新
            setInterval(() => {
                filesToCheck.forEach(file => {
                    fetch(`${file.url}?t=${Date.now()}`)
                        .then(response => {
                            if (response.ok) {
                                return response.text();
                            }
                            return null;
                        })
                        .then(content => {
                            if (content) {
                                const hash = btoa(content.substring(0, 200)).substring(0, 30);
                                
                                if (fileHashes[file.name] && hash !== fileHashes[file.name]) {
                                    console.log(`🔄 检测到 ${file.name} 文件更新，3秒后自动刷新页面...`);
                                    console.log(`   旧hash: ${fileHashes[file.name].substring(0, 10)}...`);
                                    console.log(`   新hash: ${hash.substring(0, 10)}...`);
                                    
                                    // 3秒后刷新页面
                                    setTimeout(() => {
                                        if (updateTimer) {
                                            clearInterval(updateTimer);
                                        }
                                        if (tradeDepthTimer) {
                                            clearInterval(tradeDepthTimer);
                                        }
                                        console.log('🔄 正在刷新页面...');
                                        window.location.reload();
                                    }, 3000);
                                    
                                    // 更新hash，避免重复触发
                                    fileHashes[file.name] = hash;
                                }
                            }
                        })
                        .catch(error => {
                            // 静默失败，避免控制台噪音
                        });
                });
            }, 2000); // 每2秒检查一次
        });
        
        // 监听键盘快捷键：Ctrl+R 刷新数据，Ctrl+Shift+R 重新加载页面
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'R') {
                e.preventDefault();
                if (updateTimer) {
                    clearInterval(updateTimer);
                }
                if (tradeDepthTimer) {
                    clearInterval(tradeDepthTimer);
                }
                window.location.reload();
            } else if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                updateAllData();
            }
        });
    }
});

// ==================== AI走势分析功能 ====================

// 调用AI分析API
async function callAnalysisAPI(klineData) {
    try {
        // 检查prompt.js是否已加载
        if (!window.PROMPT_CONFIG) {
            throw new Error('Prompt配置文件未加载，请刷新页面重试');
        }
        
        // 加载系统提示词
        const systemPrompt = window.PROMPT_CONFIG.MAIN_PROMPT;
        
        // 格式化用户提示词（K线数据）
        const userPrompt = window.PROMPT_CONFIG.formatKlineDataForPrompt(klineData);
        
        // 构建消息数组（只包含用户消息）
        const messages = [
            {
                role: "user",
                content: userPrompt
            }
        ];
        
        // 构建请求体（prompt参数放系统提示词，messages数组放用户数据）
        const requestBody = {
            prompt: systemPrompt,
            messages: messages,
            model: 'deepseek-chat' // 使用DeepSeek Chat模型
        };
        
        console.log('[LLM请求] URL:', API_CONFIG.llmApiUrl);
        console.log('[LLM请求] 接收K线数据条数:', klineData.length);
        console.log('[LLM请求] Prompt长度:', systemPrompt.length, '字符');
        console.log('[LLM请求] User prompt长度:', userPrompt.length, '字符');
        
        // 创建AbortController用于超时控制（1分钟=60000毫秒）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, 60000); // 60秒超时
        
        try {
            // 直接调用大模型API
            const response = await fetch(API_CONFIG.llmApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'accept': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal // 添加超时控制
            });
            
            // 清除超时定时器
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[LLM API错误] Status:', response.status, 'Error:', errorText);
                throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
            }
            
            const apiResponse = await response.json();
            console.log('[LLM响应] Status:', response.status);
            console.log('[LLM响应] 原始响应:', JSON.stringify(apiResponse, null, 2));
            
            // 解析新的响应格式：response[0].message 是一个JSON字符串
            let analysisResult = null;
            try {
                // 检查响应格式
                if (apiResponse.response && Array.isArray(apiResponse.response) && apiResponse.response.length > 0) {
                    // 新格式：response[0].message 包含JSON字符串
                    const messageText = apiResponse.response[0].message;
                    if (typeof messageText === 'string') {
                        // message是一个JSON字符串，需要解析
                        analysisResult = JSON.parse(messageText);
                    } else if (typeof messageText === 'object') {
                        // message已经是对象
                        analysisResult = messageText;
                    }
                } else if (typeof apiResponse === 'object' && apiResponse.trend) {
                    // 如果响应直接是分析结果对象
                    analysisResult = apiResponse;
                } else {
                    // 尝试从content或message字段提取
                    let resultText = apiResponse.content || apiResponse.message || JSON.stringify(apiResponse);
                    // 尝试从文本中提取JSON
                    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        analysisResult = JSON.parse(jsonMatch[0]);
                    } else {
                        analysisResult = {
                            error: "无法解析JSON格式的分析结果",
                            raw_response: resultText
                        };
                    }
                }
            } catch (parseError) {
                console.warn('[LLM响应] JSON解析失败:', parseError);
                analysisResult = {
                    error: "JSON解析失败",
                    raw_response: JSON.stringify(apiResponse),
                    parse_error: parseError.message
                };
            }
            
            console.log('[分析成功] 数据条数:', klineData.length);
            console.log('[分析结果]', analysisResult);
            return analysisResult;
        } catch (error) {
            // 清除超时定时器（如果请求失败）
            clearTimeout(timeoutId);
            
            // 检查是否是超时错误
            if (error.name === 'AbortError') {
                console.error('调用分析API超时（60秒）');
                throw new Error('请求超时，AI分析时间超过60秒，请稍后重试');
            }
            
            console.error('调用分析API失败:', error);
            throw error;
        }
    } catch (error) {
        console.error('调用分析API失败:', error);
        throw error;
    }
}

// 执行AI分析
async function performAnalysis() {
    const analyzeBtn = document.getElementById('analyze-btn');
    
    if (!analyzeBtn) {
        console.error('分析按钮未找到');
        return;
    }
    
    // 如果正在分析中，直接返回，防止重复点击
    if (isAnalyzing) {
        console.log('正在分析中，请勿重复点击');
        return;
    }
    
    // 立即设置分析状态和按钮状态
    isAnalyzing = true;
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '分析中...';
    
    // 更新实时交易策略显示为加载状态
    const strategyContent = document.getElementById('trading-strategy-content');
    if (strategyContent) {
        strategyContent.innerHTML = '<div class="loading">正在分析K线数据，请稍候...</div>';
    }
    
    try {
        // 获取最新的K线数据
        let klineDataToAnalyze = [];
        
        // 优先使用国内白银数据，如果没有则使用伦敦数据
        if (currentDomesticKlineData && currentDomesticKlineData.length > 0) {
            klineDataToAnalyze = currentDomesticKlineData;
            console.log(`使用国内白银数据进行分析，数据条数: ${klineDataToAnalyze.length}`);
        } else if (currentLondonKlineData && currentLondonKlineData.length > 0) {
            klineDataToAnalyze = currentLondonKlineData;
            console.log(`使用伦敦白银数据进行分析，数据条数: ${klineDataToAnalyze.length}`);
        } else {
            // 如果缓存中没有数据，实时获取
            console.log('缓存中没有数据，实时获取...');
            const [domesticData, londonData] = await Promise.all([
                fetchKlineData(API_CONFIG.domesticSymbol),
                fetchKlineData(API_CONFIG.londonSymbol)
            ]);
            
            if (domesticData && domesticData.length > 0) {
                klineDataToAnalyze = domesticData;
            } else if (londonData && londonData.length > 0) {
                klineDataToAnalyze = londonData;
            } else {
                throw new Error('无法获取K线数据，请稍后重试');
            }
        }
        
        if (klineDataToAnalyze.length === 0) {
            throw new Error('K线数据为空，无法进行分析');
        }
        
        // 调用分析API
        console.log('正在调用分析API...');
        const result = await callAnalysisAPI(klineDataToAnalyze);
        
        // 保存AI分析结果
        aiAnalysisResult = result;
        
        // 更新实时交易策略显示（会自动使用AI分析结果）
        updateTradingStrategy();
        
        console.log('分析完成，策略已更新');
        
    } catch (error) {
        console.error('分析失败:', error);
        const strategyContent = document.getElementById('trading-strategy-content');
        if (strategyContent) {
            strategyContent.innerHTML = `
                <div style="color: #ef4444; padding: 15px; text-align: center;">
                    <div style="font-size: 18px; margin-bottom: 8px;">分析失败</div>
                    <div style="font-size: 14px; color: #9ca3af;">${error.message || '未知错误'}</div>
                    <div style="margin-top: 10px; font-size: 12px; color: #6b7280;">请检查网络连接或稍后重试</div>
                </div>
            `;
        }
    } finally {
        // 恢复按钮和分析状态
        isAnalyzing = false;
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'AI走势分析';
    }
}

// 初始化分析功能（页面加载完成后）
document.addEventListener('DOMContentLoaded', () => {
    // 分析按钮事件
    const analyzeBtn = document.getElementById('analyze-btn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', performAnalysis);
    }
    
    // 初始化时获取一次K线数据
    setTimeout(async () => {
        try {
            const [domesticData, londonData] = await Promise.all([
                fetchKlineData(API_CONFIG.domesticSymbol),
                fetchKlineData(API_CONFIG.londonSymbol)
            ]);
            currentDomesticKlineData = domesticData;
            currentLondonKlineData = londonData;
            console.log('K线数据已缓存，可用于分析');
        } catch (error) {
            console.warn('初始化K线数据失败:', error);
        }
    }, 2000); // 延迟2秒，确保页面已加载完成
});

