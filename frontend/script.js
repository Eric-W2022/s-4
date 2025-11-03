// API配置 - 直接请求后端接口
const API_CONFIG = {
    baseUrl: '/api/kline',  // 相对路径，自动使用当前域名
    tradeTickUrl: '/api/trade-tick',
    depthTickUrl: '/api/depth-tick',
    // 国内白银主力 - 主要交易标的
    domesticSymbol: 'AG', // 国内白银主力代码（需要确认是否正确）
    // 伦敦现货白银 - 方向指引参考
    londonSymbol: 'Silver', // 伦敦现货白银代码
    interval: '1m', // 1分钟
    limit: 120, // 获取120根K线，确保有足够数据计算布林带
    // WebSocket配置
    wsToken: '9d7f12b4c30826987a501d532ef75707-c-app',
    wsUrl: 'wss://quote.alltick.co/quote-b-ws-api'
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
                },
                name: '价格',
                nameTextStyle: {
                    color: '#9ca3af'
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
    const pricePosition = (price - lower) / bandWidth; // 0-1之间，0=下轨，1=上轨
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

// 更新国内白银成交价显示（不再显示，但保留逻辑用于计算）
function updateDomesticTradeTick(tick) {
    // 不再更新UI显示，只保留价格数据
    if (!tick) {
        return;
    }
    
    const price = parseFloat(tick.price || 0);
    
    if (price === 0) {
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
}

// 更新伦敦白银成交价显示（显示在标题栏）
function updateLondonTradeTick(tick) {
    const container = document.getElementById('london-trade-tick-info');
    
    if (!container) {
        return;
    }
    
    // 如果没有数据，显示上一次的价格（如果有）
    if (!tick) {
        if (londonLastTradePrice !== null && londonLastTradePrice > 0) {
            const changeColor = londonLastIsUp ? '#ef4444' : '#4ade80';
            const changeSign = londonLastChange >= 0 ? '+' : '';
            container.innerHTML = `
                <span class="price" style="color: ${changeColor}; font-size: 18px; font-weight: 700;">
                    ${londonLastTradePrice.toFixed(3)}
                </span>
                <span class="change ${londonLastIsUp ? 'positive' : 'negative'}" style="color: ${changeColor}; font-size: 14px;">
                    ${changeSign}${londonLastChange.toFixed(3)} (${changeSign}${londonLastChangePercent.toFixed(2)}%)
                </span>
            `;
        } else {
            container.innerHTML = '<span>加载中...</span>';
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
            const changeSign = londonLastChange >= 0 ? '+' : '';
            container.innerHTML = `
                <span class="price" style="color: ${changeColor}; font-size: 18px; font-weight: 700;">
                    ${londonLastTradePrice.toFixed(3)}
                </span>
                <span class="change ${londonLastIsUp ? 'positive' : 'negative'}" style="color: ${changeColor}; font-size: 14px;">
                    ${changeSign}${londonLastChange.toFixed(3)} (${changeSign}${londonLastChangePercent.toFixed(2)}%)
                </span>
            `;
        } else {
            container.innerHTML = '<span>加载中...</span>';
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
    const changeColor = isUp ? '#ef4444' : '#4ade80';
    const changeSign = change >= 0 ? '+' : '';
    
    // 更新标题栏显示
    container.innerHTML = `
        <span class="price" style="color: ${priceColor}; font-size: 18px; font-weight: 700;">
            ${price.toFixed(3)}
        </span>
        <span class="change ${isUp ? 'positive' : 'negative'}" style="color: ${changeColor}; font-size: 14px;">
            ${changeSign}${change.toFixed(3)} (${changeSign}${changePercent.toFixed(2)}%)
        </span>
    `;
    
    // 如果伦敦图表已初始化，更新图表显示实时价格
    if (londonChart && londonChart.getOption) {
        updateLondonChartRealtimePrice();
    }
}

// 更新伦敦图表实时价格显示（在K线图上）
function updateLondonChartRealtimePrice() {
    if (!londonChart || !londonChart.getOption) {
        return;
    }
    
    try {
        const option = londonChart.getOption();
        if (!option || !option.series) {
            return;
        }
        
        // 查找实时价格系列
        let realtimePriceSeriesIndex = -1;
        for (let i = 0; i < option.series.length; i++) {
            if (option.series[i].name === '实时价格') {
                realtimePriceSeriesIndex = i;
                break;
            }
        }
        
        // 如果已有实时价格系列，更新它
        if (realtimePriceSeriesIndex >= 0 && londonLastTradePrice !== null && londonLastTradePrice > 0) {
            const changeColor = londonLastIsUp ? '#ef4444' : '#4ade80';
            const changeSign = londonLastChange >= 0 ? '+' : '';
            
            // 获取当前数据
            const currentSeries = option.series[realtimePriceSeriesIndex];
            const dataLength = currentSeries.data.length;
            
            // 更新最后一个数据点的价格
            const newData = [...currentSeries.data];
            newData[dataLength - 1] = londonLastTradePrice;
            
            // 更新系列配置
            londonChart.setOption({
                series: [{
                    name: '实时价格',
                    data: newData,
                    lineStyle: {
                        color: changeColor
                    },
                    itemStyle: {
                        color: changeColor
                    },
                    label: {
                        show: true,
                        formatter: `${londonLastTradePrice.toFixed(3)}\n${changeSign}${londonLastChange.toFixed(3)} (${changeSign}${londonLastChangePercent.toFixed(2)}%)`,
                        color: changeColor
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
            }
        }
    }
    
    // 准备K线数据
    const klineData = sortedData.map(item => [
        item.o, // 开盘价
        item.c, // 收盘价
        item.l, // 最低价
        item.h  // 最高价
    ]);
    
    // 计算价格范围，用于设置Y轴范围（包含K线和布林带）
    const prices = sortedData.flatMap(item => [item.o, item.c, item.h, item.l]);
    // 添加布林带的上下轨到价格范围
    const bollingerPrices = [
        ...bollingerBands.upper.filter(v => v !== null),
        ...bollingerBands.lower.filter(v => v !== null)
    ];
    const allPrices = [...prices, ...bollingerPrices];
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice;
    // 如果价格范围太小（小于1%），使用更大的padding确保K线可见
    const paddingPercent = priceRange / maxPrice < 0.01 ? 0.3 : 0.2;
    const padding = Math.max(priceRange * paddingPercent, maxPrice * 0.01);
    
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
    const isLondon = infoElementId.includes('london');
    
    // 如果是伦敦白银，添加实时价格标记在最后一个K线右侧
    let graphic = [];
    if (isLondon && londonLastTradePrice !== null && londonLastTradePrice > 0 && sortedData.length > 0) {
        const lastIndex = sortedData.length - 1;
        const lastData = sortedData[lastIndex];
        const changeColor = londonLastIsUp ? '#ef4444' : '#4ade80';
        const changeSign = londonLastChange >= 0 ? '+' : '';
        
        // 计算实时价格在图上的位置（最后一个K线的右侧）
        // 使用graphic组件在图表上添加文本和线
        graphic.push({
            type: 'group',
            left: 'right',
            top: 'middle',
            children: [
                {
                    type: 'line',
                    shape: {
                        x1: 0,
                        y1: 0,
                        x2: -30,
                        y2: 0
                    },
                    style: {
                        stroke: changeColor,
                        lineWidth: 2
                    },
                    position: [sortedData.length - 1, londonLastTradePrice],
                    z: 100
                },
                {
                    type: 'text',
                    style: {
                        text: `${londonLastTradePrice.toFixed(3)}\n${changeSign}${londonLastChange.toFixed(3)} (${changeSign}${londonLastChangePercent.toFixed(2)}%)`,
                        fill: changeColor,
                        fontSize: 12,
                        fontWeight: 600,
                        textAlign: 'left',
                        textVerticalAlign: 'middle'
                    },
                    position: [sortedData.length - 1, londonLastTradePrice],
                    z: 100
                }
            ]
        });
    }
    
    const option = {
        graphic: graphic.length > 0 ? graphic : undefined,
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
                        // 取整，不显示小数
                        return Math.round(value).toString();
                    },
                    showMinLabel: false, // 不显示最小值标签（避免重复）
                    showMaxLabel: false  // 不显示最大值标签（避免重复）
                },
                splitLine: {
                    lineStyle: {
                        color: '#1e2548',
                        type: 'dashed'
                    }
                },
                name: '价格',
                nameTextStyle: {
                    color: '#9ca3af'
                },
                min: function(value) {
                    // 确保最小值不小于0，并且有足够的padding
                    const minVal = Math.max(0, value.min - padding);
                    return minVal;
                },
                max: function(value) {
                    // 增加最大值，确保K线和布林带都有足够的显示空间
                    return value.max + padding;
                },
                splitNumber: 5 // 设置Y轴分割数量，让刻度更清晰
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
                }
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
    
    // 如果是伦敦白银，添加实时价格显示在最后一个K线右侧
    if (isLondon && londonLastTradePrice !== null && londonLastTradePrice > 0 && sortedData.length > 0) {
        const changeColor = londonLastIsUp ? '#ef4444' : '#4ade80';
        const changeSign = londonLastChange >= 0 ? '+' : '';
        
        // 添加实时价格线系列（显示在最后一个K线右侧）
        const realtimePriceData = new Array(sortedData.length).fill(null);
        realtimePriceData[sortedData.length - 1] = londonLastTradePrice;
        
        option.series.push({
            name: '实时价格',
            type: 'line',
            data: realtimePriceData,
            xAxisIndex: 0,
            yAxisIndex: 0,
            lineStyle: {
                color: changeColor,
                width: 2,
                type: 'dashed'
            },
            itemStyle: {
                color: changeColor
            },
            symbol: 'circle',
            symbolSize: 8,
            label: {
                show: true,
                position: 'right',
                formatter: `${londonLastTradePrice.toFixed(3)}\n${changeSign}${londonLastChange.toFixed(3)} (${changeSign}${londonLastChangePercent.toFixed(2)}%)`,
                color: changeColor,
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: 'rgba(19, 23, 43, 0.9)',
                borderColor: changeColor,
                borderWidth: 1,
                padding: [4, 8],
                borderRadius: 4
            },
            z: 10
        });
    }
    
    chart.setOption(option);
}

// 判断当前是否在交易时间
function isTradingTime() {
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

// 更新状态
function updateStatus(status) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('status-text');
    
    statusDot.className = `status-dot ${status}`;
    
    // 判断交易状态
    const tradingStatus = isTradingTime() ? '交易中' : '休市中';
    
    // 只显示交易状态
    statusText.textContent = tradingStatus;
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
    
    // 立即更新一次数据
    updateAllData();
    
    // 每1秒更新一次K线数据
    updateTimer = setInterval(updateAllData, 1000);
    
    // 每500ms更新一次成交价（即1秒2次）
    updateTradeAndDepth(); // 立即执行一次
    tradeDepthTimer = setInterval(updateTradeAndDepth, 500);
    
    // 开发模式：监听文件变化（热重载）
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('🔧 开发模式：已启用热重载功能');
        // 每3秒检查一次脚本文件是否有更新
        let lastScriptVersion = Date.now();
        let lastScriptHash = '';
        
        setInterval(() => {
            fetch(`/script.js?t=${Date.now()}`)
                .then(response => {
                    if (response.ok) {
                        return response.text();
                    }
                    return null;
                })
                .then(scriptContent => {
                    if (scriptContent) {
                        // 计算简单的hash（前100个字符的hash）
                        const hash = btoa(scriptContent.substring(0, 100)).substring(0, 20);
                        
                        if (hash !== lastScriptHash && lastScriptHash !== '') {
                            console.log('检测到脚本文件更新，3秒后自动刷新页面...');
                            setTimeout(() => {
                                if (updateTimer) {
                                    clearInterval(updateTimer);
                                }
                                if (tradeDepthTimer) {
                                    clearInterval(tradeDepthTimer);
                                }
                                window.location.reload();
                            }, 3000);
                        }
                        lastScriptHash = hash;
                    }
                })
                .catch(error => {
                    // 静默失败
                });
        }, 3000);
        
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
