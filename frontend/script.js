// API配置 - 直接请求后端接口
const API_CONFIG = {
    baseUrl: '/api/kline',  // 相对路径，自动使用当前域名
    tradeTickUrl: '/api/trade-tick',
    depthTickUrl: '/api/depth-tick',
    // 伦敦现货白银 - 贵金属
    symbol: 'Silver', // 伦敦现货白银代码（根据AllTick产品列表）
    interval: '1m', // 1分钟
    limit: 100,
    // WebSocket配置
    wsToken: '9d7f12b4c30826987a501d532ef75707-c-app',
    wsUrl: 'wss://quote.alltick.co/quote-b-ws-api'
};

// WebSocket连接管理（同时订阅交易价格和盘口深度）
class AllTickWebSocket {
    constructor(symbol, onTradeTick, onDepthTick) {
        this.symbol = symbol;
        this.onTradeTick = onTradeTick;
        this.onDepthTick = onDepthTick;
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
        
        // 订阅最新盘口（协议号22002）
        this.subscribeDepthTick();
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
        }
    }
    
    subscribeDepthTick() {
        const seqId = this.seqId++;
        const trace = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const subscribeMsg = {
            cmd_id: 22002, // 订阅最新盘口协议号
            seq_id: seqId,
            trace: trace,
            data: {
                symbol_list: [
                    {
                        code: this.symbol,
                        depth_level: 5 // 请求5档深度（外汇、贵金属最多1档，但传入5档也无妨）
                    }
                ]
            }
        };
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(subscribeMsg));
            console.log('已发送盘口订阅请求:', subscribeMsg);
        } else {
            console.error('WebSocket未连接，无法发送盘口订阅请求');
        }
    }
    
    handleMessage(data) {
        const cmdId = data.cmd_id;
        
        // 应答消息：最新成交价订阅（22005）
        if (cmdId === 22005) {
            if (data.ret === 200) {
                console.log('最新成交价订阅成功');
            } else {
                console.error('最新成交价订阅失败:', data.msg);
            }
            return;
        }
        
        // 应答消息：最新盘口订阅（22003）
        if (cmdId === 22003) {
            if (data.ret === 200) {
                console.log('最新盘口订阅成功');
            } else {
                console.error('最新盘口订阅失败:', data.msg);
            }
            return;
        }
        
        // 推送消息：最新成交价（22998）
        if (cmdId === 22998) {
            if (data.data && this.onTradeTick) {
                this.onTradeTick(data.data);
            }
            return;
        }
        
        // 推送消息：最新盘口（22999）
        if (cmdId === 22999) {
            console.log('收到盘口深度推送:', data);
            if (data.data && this.onDepthTick) {
                console.log('调用onDepthTick回调，数据:', data.data);
                this.onDepthTick(data.data);
            } else {
                console.warn('盘口数据格式异常:', data);
            }
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
        }, 10000);
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
let allTickWS = null;

// 图表实例
let londonChart = null;

// 初始化图表
function initCharts() {
    // 伦敦现货白银图表
    londonChart = echarts.init(document.getElementById('london-chart'), 'dark');
    
    // 设置初始配置
    const initialOption = {
        backgroundColor: 'transparent',
        grid: [
            {
                left: '3%',
                right: '4%',
                top: '5%',
                height: '60%',
                containLabel: true
            },
            {
                left: '3%',
                right: '4%',
                top: '68%',
                height: '28%',
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
            },
            {
                type: 'category',
                data: [],
                gridIndex: 1,
                boundaryGap: false,
                axisLine: {
                    lineStyle: {
                        color: '#1e2548'
                    }
                },
                axisLabel: {
                    color: '#9ca3af',
                    fontSize: 11
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
            },
            {
                type: 'value',
                scale: true,
                gridIndex: 1,
                position: 'left',
                axisLine: {
                    lineStyle: {
                        color: '#1e2548'
                    }
                },
                axisLabel: {
                    color: '#6b7280',
                    fontSize: 10
                },
                splitLine: {
                    show: false
                },
                name: '成交量',
                nameTextStyle: {
                    color: '#6b7280',
                    fontSize: 11
                }
            }
        ],
        series: []
    };
    
    londonChart.setOption(initialOption);
}

// 获取K线数据 - 请求后端接口
async function fetchKlineData() {
    try {
        // 请求后端接口，不需要传递token（token在后端配置）
        const params = new URLSearchParams({
            symbol: API_CONFIG.symbol,
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

// 获取最新成交价（HTTP轮询，作为WebSocket的补充）
async function fetchTradeTick() {
    try {
        const url = `${API_CONFIG.tradeTickUrl}?symbol=${API_CONFIG.symbol}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.ret === 200 && result.data && result.data.tick_list && result.data.tick_list.length > 0) {
            return result.data.tick_list[0];
        }
        
        return null;
    } catch (error) {
        // 静默失败，WebSocket推送是主要数据源
        return null;
    }
}

// 获取盘口深度（HTTP轮询，作为WebSocket的补充）
async function fetchDepthTick() {
    try {
        const url = `${API_CONFIG.depthTickUrl}?symbol=${API_CONFIG.symbol}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.ret === 200 && result.data && result.data.tick_list && result.data.tick_list.length > 0) {
            return result.data.tick_list[0];
        }
        
        return null;
    } catch (error) {
        // 静默失败，WebSocket推送是主要数据源
        return null;
    }
}

// 显示最新成交价
function updateTradeTick(tick) {
    const container = document.getElementById('trade-tick-info');
    
    if (!tick) {
        container.innerHTML = '<div class="loading">暂无数据</div>';
        return;
    }
    
    const price = parseFloat(tick.price || 0);
    const volume = parseFloat(tick.volume || 0);
    const turnover = parseFloat(tick.turnover || 0);
    const tickTime = tick.tick_time ? new Date(parseInt(tick.tick_time)).toLocaleString('zh-CN') : '--';
    const tradeDirection = tick.trade_direction || 0;
    const directionText = tradeDirection === 1 ? '买入' : tradeDirection === 2 ? '卖出' : '中性';
    
    container.innerHTML = `
        <div class="tick-price">${price.toFixed(3)}</div>
        <div class="tick-item">
            <span class="tick-label">成交量:</span>
            <span class="tick-value">${volume.toFixed(2)}</span>
        </div>
        <div class="tick-item">
            <span class="tick-label">成交额:</span>
            <span class="tick-value">${turnover.toFixed(2)}</span>
        </div>
        <div class="tick-item">
            <span class="tick-label">方向:</span>
            <span class="tick-value">${directionText}</span>
        </div>
        <div class="tick-item">
            <span class="tick-label">时间:</span>
            <span class="tick-value" style="font-size: 12px;">${tickTime}</span>
        </div>
    `;
}

// 显示盘口深度
function updateDepthTick(depth) {
    console.log('updateDepthTick被调用，数据:', depth);
    const container = document.getElementById('depth-tick-info');
    
    if (!depth) {
        console.warn('updateDepthTick: depth为空');
        container.innerHTML = '<div class="loading">暂无数据</div>';
        return;
    }
    
    // WebSocket推送的盘口数据格式：bids和asks都是数组
    const bids = depth.bids || [];
    const asks = depth.asks || [];
    
    console.log('盘口数据 - bids:', bids, 'asks:', asks);
    
    // 获取最大档数
    const maxLevels = Math.max(bids.length, asks.length);
    
    if (maxLevels === 0) {
        console.warn('updateDepthTick: 没有盘口数据');
        container.innerHTML = '<div class="loading">暂无数据</div>';
        return;
    }
    
    let html = '<div class="depth-table">';
    html += '<div class="depth-header"><span>买量</span><span>买价</span><span>卖价</span><span>卖量</span></div>';
    
    // 显示盘口（最多5档，外汇、贵金属通常只有1档）
    for (let i = 0; i < Math.min(maxLevels, 5); i++) {
        const bid = bids[i] || {};
        const ask = asks[i] || {};
        
        const bidPrice = parseFloat(bid.price || 0);
        const bidVolume = parseFloat(bid.volume || 0); // 外汇、贵金属可能没有volume
        const askPrice = parseFloat(ask.price || 0);
        const askVolume = parseFloat(ask.volume || 0); // 外汇、贵金属可能没有volume
        
        // 格式化显示：如果没有volume，显示"--"
        const bidVolumeStr = bidVolume > 0 ? bidVolume.toFixed(2) : '--';
        const askVolumeStr = askVolume > 0 ? askVolume.toFixed(2) : '--';
        
        html += `
            <div class="depth-row">
                <span class="depth-volume">${bidVolumeStr}</span>
                <span class="depth-price depth-bid">${bidPrice > 0 ? bidPrice.toFixed(3) : '--'}</span>
                <span class="depth-price depth-ask">${askPrice > 0 ? askPrice.toFixed(3) : '--'}</span>
                <span class="depth-volume">${askVolumeStr}</span>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
    console.log('盘口深度已更新到页面');
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
        infoElement.innerHTML = '<span style="color: #ef4444;">暂无数据</span>';
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
    
    // 准备K线数据
    const klineData = sortedData.map(item => [
        item.o, // 开盘价
        item.c, // 收盘价
        item.l, // 最低价
        item.h  // 最高价
    ]);
    
    // 计算价格范围，用于设置Y轴范围
    const prices = sortedData.flatMap(item => [item.o, item.c, item.h, item.l]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
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
    
    // 计算最新价格和涨跌
    const latest = sortedData[sortedData.length - 1];
    const previous = sortedData.length > 1 ? sortedData[sortedData.length - 2] : latest;
    const change = latest.c - previous.c;
    const changePercent = previous.c !== 0 ? ((change / previous.c) * 100).toFixed(2) : 0;
    
    // 更新信息显示
    const infoElement = document.getElementById(infoElementId);
    infoElement.innerHTML = `
        <span class="price">价格: ${latest.c.toFixed(2)}</span>
        <span class="change ${change >= 0 ? 'positive' : 'negative'}">
            ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent}%)
        </span>
        <span>成交量: ${latest.v.toFixed(0)}</span>
    `;
    
    // 更新图表
    const option = {
        grid: [
            {
                left: '8%', // 增加左侧空间，确保价格标签完整显示
                right: '4%',
                top: '8%', // 增加顶部间距，避免遮挡
                height: '62%', // K线图占据62%（稍微减小，给顶部留空间）
                containLabel: true
            },
            {
                left: '8%', // 增加左侧空间
                right: '4%',
                top: '72%', // 成交量图从72%开始（增加间距）
                height: '23%', // 成交量图占据23%
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
                    show: false // 隐藏上部X轴标签
                },
                axisTick: {
                    show: false
                }
            },
            {
                type: 'category',
                data: timeData,
                gridIndex: 1,
                boundaryGap: false,
                axisLine: {
                    lineStyle: {
                        color: '#1e2548'
                    }
                },
                axisLabel: {
                    color: '#9ca3af',
                    fontSize: 11
                },
                splitLine: {
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
                    }
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
                    // 增加最大值，确保K线有足够的显示空间
                    return value.max + padding;
                },
                splitNumber: 5 // 设置Y轴分割数量，让刻度更清晰
            },
            {
                type: 'value',
                scale: true,
                gridIndex: 1,
                position: 'left',
                axisLine: {
                    lineStyle: {
                        color: '#1e2548'
                    }
                },
                axisLabel: {
                    color: '#6b7280',
                    fontSize: 10,
                    formatter: function(value) {
                        if (value >= 1000000) {
                            return (value / 1000000).toFixed(1) + 'M';
                        } else if (value >= 1000) {
                            return (value / 1000).toFixed(1) + 'K';
                        }
                        return value;
                    }
                },
                splitLine: {
                    show: false
                },
                name: '成交量',
                nameTextStyle: {
                    color: '#6b7280',
                    fontSize: 11
                }
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
            {
                name: '成交量',
                type: 'bar',
                data: sortedData.map(item => item.v),
                xAxisIndex: 1,
                yAxisIndex: 1,
                barWidth: '60%',
                itemStyle: {
                    color: function(params) {
                        const idx = params.dataIndex;
                        if (idx === 0) {
                            // 第一个数据点，使用默认颜色
                            return 'rgba(156, 163, 175, 0.6)';
                        }
                        // 判断涨跌：收盘价 >= 开盘价为上涨（红色），否则为下跌（绿色）
                        const isUp = sortedData[idx].c >= sortedData[idx].o;
                        return isUp ? 'rgba(239, 68, 68, 0.6)' : 'rgba(74, 222, 128, 0.6)';
                    },
                    borderColor: function(params) {
                        const idx = params.dataIndex;
                        if (idx === 0) {
                            return '#9ca3af';
                        }
                        // 判断涨跌：收盘价 >= 开盘价为上涨（红色），否则为下跌（绿色）
                        const isUp = sortedData[idx].c >= sortedData[idx].o;
                        return isUp ? '#ef4444' : '#4ade80';
                    },
                    borderWidth: 1
                },
                emphasis: {
                    itemStyle: {
                        opacity: 0.8
                    }
                }
            }
        ]
    };
    
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

// 初始化WebSocket连接（用于实时订阅最新成交价和盘口深度）
function connectAllTickWebSocket() {
    if (allTickWS) {
        // 如果已经连接，先断开
        allTickWS.disconnect();
    }
    
    allTickWS = new AllTickWebSocket(
        API_CONFIG.symbol,
        // 最新成交价回调
        (tickData) => {
            updateTradeTick(tickData);
        },
        // 最新盘口深度回调
        (depthData) => {
            updateDepthTick(depthData);
        }
    );
    
    allTickWS.connect();
}

// 更新所有数据
async function updateAllData() {
    updateStatus('connecting');
    
    try {
        // 只获取K线数据（最新成交价和盘口深度通过WebSocket实时推送）
        const klineData = await fetchKlineData();
        
        // 更新K线图
        if (klineData !== null && klineData.length > 0) {
            updateChart(londonChart, klineData, 'london-info');
        } else {
            const londonInfo = document.getElementById('london-info');
            if (klineData === null) {
                londonInfo.innerHTML = '<span style="color: #ef4444;">API请求失败，请检查浏览器控制台</span>';
            } else {
                londonInfo.innerHTML = '<span style="color: #fbbf24;">返回空数据，可能是产品代码不正确</span>';
            }
        }
        
        // 更新状态（只显示交易状态）
        if (klineData !== null && klineData.length > 0) {
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
    if (londonChart) {
        londonChart.resize();
    }
});

// 定时器ID，用于清除定时器
let updateTimer = null;
let tradeDepthTimer = null;

// 更新成交价和盘口（每500ms一次，即1秒2次）
async function updateTradeAndDepth() {
    try {
        const [tradeTick, depthTick] = await Promise.all([
            fetchTradeTick(),
            fetchDepthTick()
        ]);
        
        // 更新最新成交价（如果HTTP轮询返回了数据）
        if (tradeTick) {
            updateTradeTick(tradeTick);
        }
        
        // 更新盘口深度（如果HTTP轮询返回了数据）
        if (depthTick) {
            updateDepthTick(depthTick);
        }
    } catch (error) {
        // 静默失败，WebSocket推送是主要数据源
    }
}

// 刷新数据按钮
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    updateAllData();
    
    // 初始化WebSocket连接（订阅最新成交价和盘口深度）
    connectAllTickWebSocket();
    
    // 每1秒更新一次K线数据
    updateTimer = setInterval(updateAllData, 1000);
    
    // 每500ms更新一次成交价和盘口（即1秒2次）
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
                .then(content => {
                    if (content) {
                        // 简单hash检查（取前1000个字符的hash）
                        const hash = content.substring(0, 1000).split('').reduce((a, b) => {
                            a = ((a << 5) - a) + b.charCodeAt(0);
                            return a & a;
                        }, 0).toString();
                        
                        if (hash !== lastScriptHash && lastScriptHash !== '') {
                            console.log('🔄 检测到代码更新，3秒后自动刷新页面...');
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
                .catch(() => {
                    // 忽略错误
                });
        }, 3000);
        
        // 键盘快捷键：Ctrl+R 刷新数据，Ctrl+Shift+R 重载页面
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

