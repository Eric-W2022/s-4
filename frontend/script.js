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
    limit: 200, // 获取200根K线，确保有足够数据计算布林带
    // WebSocket配置
    wsToken: '9d7f12b4c30826987a501d532ef75707-c-app',
    wsUrl: 'wss://quote.alltick.co/quote-b-ws-api',
    // 大模型API配置 - 直接使用新加坡API
    llmApiUrl: 'https://1256349444-fla6e0vfcj.ap-singapore.tencentscf.com/chat'
};

// K线预测配置
const PREDICTION_CONFIG = {
    pricePointsCount: 20, // 1分钟预测价格点数量
    minPricePointsForRetrigger: 8, // 当预测数据少于此数量时自动触发新预测
    pricePointsCount15m: 5, // 15分钟预测价格点数量
    minPricePointsForRetrigger15m: 2 // 15分钟预测数据少于此数量时自动触发新预测
};

// WebSocket连接管理（订阅交易价格和K线）
class AllTickWebSocket {
    constructor(symbol, onTradeTick, onKlineUpdate) {
        this.symbol = symbol;
        this.onTradeTick = onTradeTick;
        this.onKlineUpdate = onKlineUpdate; // K线更新回调
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
                console.log('[WebSocket] ✓ 连接已建立，Symbol:', this.symbol, '时间:', new Date().toLocaleTimeString());
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.subscribeAll();
                this.startHeartbeat();
                
                // 不需要主动触发更新，定时器会自动更新
                // 避免与定时器冲突导致请求风暴
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
                console.log('[WebSocket] ✗ 连接已关闭，Symbol:', this.symbol, '时间:', new Date().toLocaleTimeString());
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
        // 订阅1分钟K线（协议号22006）
        this.subscribeKline();
    }
    
    subscribeKline() {
        const seqId = this.seqId++;
        const trace = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const subscribeMsg = {
            cmd_id: 22006, // 订阅K线协议号
            seq_id: seqId,
            trace: trace,
            data: {
                symbol_list: [
                    {
                        code: this.symbol,
                        kline_type: 1 // 1分钟K线
                    }
                ]
            }
        };
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(subscribeMsg));
            console.log('[WebSocket订阅] 已发送K线订阅请求:', this.symbol);
        } else {
            console.error('WebSocket未连接，无法发送K线订阅请求');
        }
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
                console.log(`[WebSocket订阅] ✓ 最新成交价订阅成功: ${this.symbol}, 时间: ${new Date().toLocaleTimeString()}`);
                // 订阅成功后，如果是伦敦白银，确保显示等待状态
                if (this.symbol === 'Silver' || this.symbol === 'SILVER') {
                    const container = document.getElementById('london-trade-tick-info');
                    if (container && (!londonLastTradePrice || londonLastTradePrice === 0)) {
                        container.innerHTML = '<span>等待数据...</span>';
                    }
                }
            } else {
                console.error('[WebSocket订阅] ✗ 最新成交价订阅失败:', data.msg, '错误码:', data.ret);
            }
            return;
        }
        
        // 应答消息：K线订阅（22007）
        if (cmdId === 22007) {
            if (data.ret === 200) {
                console.log(`[WebSocket订阅] ✓ K线订阅成功: ${this.symbol}, 时间: ${new Date().toLocaleTimeString()}`);
            } else {
                console.error(`[WebSocket订阅] ✗ K线订阅失败 [${this.symbol}]:`, data.msg, '错误码:', data.ret);
            }
            return;
        }
        
        // 推送消息：最新成交价（22998）
        if (cmdId === 22998) {
            if (data.data && this.onTradeTick) {
                // WebSocket推送的数据格式：{code, price, volume, tick_time, ...}
                // 直接传递整个data.data对象
                if (Math.random() < 0.05) { // 5%概率打印日志
                    console.log('[WebSocket推送] Tick数据:', {
                        code: data.data.code,
                        price: data.data.price,
                        volume: data.data.volume,
                        time: new Date(parseInt(data.data.tick_time)).toLocaleTimeString()
                    });
                }
                this.onTradeTick(data.data);
            }
            return;
        }
        
        // 推送消息：K线数据（23000）
        if (cmdId === 23000) {
            if (data.data && this.onKlineUpdate) {
                // K线数据推送
                if (Math.random() < 0.1) { // 10%概率打印日志
                    console.log('[WebSocket推送] 🔔 收到K线数据:', {
                        code: data.data.code,
                        time: data.data.time,
                        open: data.data.open,
                        close: data.data.close,
                        high: data.data.high,
                        low: data.data.low
                    });
                }
                this.onKlineUpdate(data.data);
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
        if (Math.random() < 0.1) { // 偶尔打印
            console.log('[WebSocket] 收到未知消息类型:', cmdId, data);
        }
    }
    
    startHeartbeat() {
        // 每10秒发送一次心跳（重新发送订阅请求作为心跳）
        // 根据AllTick API文档：要求每10秒发送一次心跳，30秒内没有心跳会断开连接
        this.heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // 重新发送订阅请求作为心跳（保持连接活跃）
                this.subscribeTradeTick();
                this.subscribeKline();
                if (Math.random() < 0.1) { // 偶尔打印日志
                    console.log('[WebSocket心跳] 已发送心跳（重新订阅成交价和K线）');
                }
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
            console.log(`[WebSocket] 尝试重新连接 (第${this.reconnectAttempts}次)，Symbol: ${this.symbol}`);
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
let domesticWS = null; // 国内白银WebSocket（连接后端TqSdk）
let londonWS = null; // 伦敦白银WebSocket（AllTick）

// 国内白银WebSocket连接管理
class DomesticWebSocket {
    constructor(onKlineUpdate, onQuoteUpdate) {
        this.onKlineUpdate = onKlineUpdate;
        this.onQuoteUpdate = onQuoteUpdate;
        this.ws = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.isConnected = false;
    }
    
    connect() {
        // 连接到后端WebSocket（使用相对路径，自动适配当前域名）
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/domestic`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('[国内WebSocket] ✓ 已连接到后端TqSdk数据流');
                this.isConnected = true;
                this.reconnectAttempts = 0;
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('[国内WebSocket] 解析消息失败:', error);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('[国内WebSocket] 错误:', error);
            };
            
            this.ws.onclose = () => {
                console.log('[国内WebSocket] ✗ 连接已关闭');
                this.isConnected = false;
                this.scheduleReconnect();
            };
        } catch (error) {
            console.error('[国内WebSocket] 创建连接失败:', error);
            this.scheduleReconnect();
        }
    }
    
    handleMessage(message) {
        const type = message.type;
        
        if (type === 'kline' || type === 'kline_update') {
            // K线数据推送
            if (this.onKlineUpdate) {
                this.onKlineUpdate(message);
            }
        } else if (type === 'quote' || type === 'quote_update') {
            // 行情数据推送
            if (this.onQuoteUpdate) {
                this.onQuoteUpdate(message);
            }
        }
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[国内WebSocket] 达到最大重连次数，停止重连');
            return;
        }
        
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        
        console.log(`[国内WebSocket] 将在 ${delay}ms 后尝试重连 (第 ${this.reconnectAttempts} 次)`);
        
        this.reconnectTimer = setTimeout(() => {
            console.log(`[国内WebSocket] 尝试重新连接 (第${this.reconnectAttempts}次)`);
            this.connect();
        }, delay);
    }
    
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.isConnected = false;
    }
}

// 图表实例
let domesticChart = null; // 国内白银图表
let londonChart = null; // 伦敦白银图表（1分钟K线）
let londonDailyChart = null; // 伦敦白银90日K线图表
let domesticDailyChart = null; // 国内白银90日K线图表
let london15mChart = null; // 伦敦白银15分钟K线图表
let domestic15mChart = null; // 国内白银15分钟K线图表

// 当前K线数据缓存（用于实时更新）
let currentLondonKlineRealtime = null; // 伦敦当前K线的实时状态
let lastLondonRealtimeUpdate = 0; // 上次实时更新的时间戳（节流用）
const REALTIME_UPDATE_INTERVAL = 200; // 实时更新最小间隔（毫秒）

// 保存滑动条状态（用于保持缩放状态）
// 从 localStorage 加载缩放状态，如果没有则使用默认值
function loadDataZoomState() {
    try {
        const saved = localStorage.getItem('chartDataZoomState');
        if (saved) {
            const parsed = JSON.parse(saved);
            console.log('[DataZoom] 从 localStorage 加载缩放状态:', parsed);
            return parsed;
        }
    } catch (error) {
        console.warn('[DataZoom] 加载缩放状态失败:', error);
    }
    return {
        london: { start: 0, end: 100 },
        domestic: { start: 0, end: 100 }
    };
}

// 保存缩放状态到 localStorage
function saveDataZoomState(state) {
    try {
        localStorage.setItem('chartDataZoomState', JSON.stringify(state));
        console.log('[DataZoom] 缩放状态已保存到 localStorage:', state);
    } catch (error) {
        console.warn('[DataZoom] 保存缩放状态失败:', error);
    }
}

let dataZoomState = loadDataZoomState();

// 计算X轴标签显示间隔（根据数据量和缩放范围）
// 始终显示首尾，中间均匀分布，总共显示8个标签
function calculateXAxisInterval(dataLength, start, end) {
    // 计算当前显示的数据点数量
    const visibleDataCount = Math.floor(dataLength * (end - start) / 100);
    
    // 如果数据点少于等于8个，每个都显示
    if (visibleDataCount <= 8) {
        return { type: 'all', interval: 0 };
    }
    
    // 需要显示8个标签：首尾各1个 + 中间6个
    // 中间6个标签需要均匀分布在剩余的 visibleDataCount - 2 个数据点中
    const middlePoints = visibleDataCount - 2; // 除去首尾
    const interval = Math.floor(middlePoints / 7); // 7个间隔（6个中间标签 + 1个末尾）
    
    return { type: 'fixed', interval: interval, total: visibleDataCount };
}

// 初始化图表
function initCharts() {
    // 清空信息显示
    const domesticInfo = document.getElementById('domestic-info');
    const londonInfo = document.getElementById('london-info');
    const londonDailyInfo = document.getElementById('london-daily-info');
    const domesticDailyInfo = document.getElementById('domestic-daily-info');
    const london15mInfo = document.getElementById('london-15m-info');
    const domestic15mInfo = document.getElementById('domestic-15m-info');
    if (domesticInfo) {
        domesticInfo.innerHTML = '';
    }
    if (londonInfo) {
        londonInfo.innerHTML = '';
    }
    if (londonDailyInfo) {
        londonDailyInfo.innerHTML = '';
    }
    if (domesticDailyInfo) {
        domesticDailyInfo.innerHTML = '';
    }
    if (london15mInfo) {
        london15mInfo.innerHTML = '';
    }
    if (domestic15mInfo) {
        domestic15mInfo.innerHTML = '';
    }
    
    // 国内白银图表（主要交易标的）
    domesticChart = echarts.init(document.getElementById('domestic-chart'), 'dark');
    
    // 伦敦现货白银图表（方向指引参考）- 1分钟K线
    londonChart = echarts.init(document.getElementById('london-chart'), 'dark');
    
    // 伦敦现货白银15分钟K线图表
    const london15mChartElement = document.getElementById('london-15m-chart');
    if (london15mChartElement) {
        london15mChart = echarts.init(london15mChartElement, 'dark');
    }
    
    // 国内白银15分钟K线图表
    const domestic15mChartElement = document.getElementById('domestic-15m-chart');
    if (domestic15mChartElement) {
        domestic15mChart = echarts.init(domestic15mChartElement, 'dark');
    }
    
    // 伦敦现货白银90日K线图表
    const londonDailyChartElement = document.getElementById('london-daily-chart');
    if (londonDailyChartElement) {
        londonDailyChart = echarts.init(londonDailyChartElement, 'dark');
    }
    
    // 国内白银90日K线图表
    const domesticDailyChartElement = document.getElementById('domestic-daily-chart');
    if (domesticDailyChartElement) {
        domesticDailyChart = echarts.init(domesticDailyChartElement, 'dark');
    }
    
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
                        // 其他线条（布林带、预测价格等）
                        let value = item.value;
                        
                        // 如果value是数组（如预测价格是[x, y]格式），取第二个值（价格）
                        if (Array.isArray(value)) {
                            value = value[1];
                        }
                        
                        if (value !== null && value !== undefined && !isNaN(value)) {
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
    if (london15mChart) {
        london15mChart.setOption(initialOption);
    }
    if (domestic15mChart) {
        domestic15mChart.setOption(initialOption);
    }
    if (londonDailyChart) {
        londonDailyChart.setOption(initialOption);
    }
    if (domesticDailyChart) {
        domesticDailyChart.setOption(initialOption);
    }
}

// 获取K线数据 - 请求后端接口
async function fetchKlineData(symbol, interval = null, limit = null) {
    try {
        // 请求后端接口，不需要传递token（token在后端配置）
        const params = new URLSearchParams({
            symbol: symbol,
            interval: interval || API_CONFIG.interval,
            limit: (limit || API_CONFIG.limit).toString(),
            _t: Date.now() // 添加时间戳，防止缓存
        });
        
        const url = `${API_CONFIG.baseUrl}?${params.toString()}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            },
            cache: 'no-cache' // 禁用缓存
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[fetchKlineData] HTTP错误 ${symbol} ${interval}: ${response.status}`, errorText);
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
            console.error(`[fetchKlineData] API返回错误 ${symbol} ${interval}:`, result);
            throw new Error(result.message || result.msg || 'API返回错误');
        }
        
        if (!data || data.length === 0) {
            console.warn(`[fetchKlineData] K线数据返回空 ${symbol} ${interval}`);
            return [];
        }
        
        console.log(`[fetchKlineData] ✓ 获取成功 ${symbol} ${interval}: ${data.length}条`);
        return data;
    } catch (error) {
        console.error(`[fetchKlineData] 获取K线数据失败 ${symbol} ${interval}:`, error);
        updateStatus('error');
        return null;
    }
}

// 日K线数据缓存（避免频繁请求导致429错误）
const dailyKlineCache = {};
const DAILY_KLINE_CACHE_DURATION = 5 * 60 * 1000; // 缓存5分钟

// 获取日K线数据（用于计算前一日收盘价）
async function fetchDailyKline(symbol) {
    // 检查缓存
    const now = Date.now();
    if (dailyKlineCache[symbol] && 
        dailyKlineCache[symbol].timestamp && 
        (now - dailyKlineCache[symbol].timestamp) < DAILY_KLINE_CACHE_DURATION) {
        console.log(`[日K线缓存] 使用缓存数据: ${symbol}，缓存时间: ${new Date(dailyKlineCache[symbol].timestamp).toLocaleTimeString()}`);
        return dailyKlineCache[symbol].value;
    }
    
    try {
        const params = new URLSearchParams({
            symbol: symbol,
            interval: '1d', // 日K线
            limit: '2' // 只需要2根K线：今日和昨日
            // 移除 _t 参数，避免过于频繁的请求
        });
        
        const url = `${API_CONFIG.baseUrl}?${params.toString()}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            }
            // 移除 cache: 'no-cache'，允许浏览器缓存
        });
        
        if (!response.ok) {
            console.warn(`[日K线请求] 获取失败 ${symbol}:`, response.status);
            // 如果有旧缓存，返回旧缓存
            if (dailyKlineCache[symbol] && dailyKlineCache[symbol].value !== null) {
                console.log(`[日K线缓存] 请求失败，使用旧缓存: ${symbol}`);
                return dailyKlineCache[symbol].value;
            }
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
            const closePrice = previousDayKline.c;
            // 缓存结果
            dailyKlineCache[symbol] = {
                value: closePrice,
                timestamp: Date.now()
            };
            console.log(`[日K线请求] 获取成功 ${symbol}:`, closePrice);
            return closePrice; // 前一日收盘价
        }
        
        return null;
    } catch (error) {
        console.warn('[日K线请求] 获取异常:', error);
        // 如果有旧缓存，返回旧缓存
        if (dailyKlineCache[symbol] && dailyKlineCache[symbol].value !== null) {
            console.log(`[日K线缓存] 异常时使用旧缓存: ${symbol}`);
            return dailyKlineCache[symbol].value;
        }
        return null;
    }
}

// 获取最新成交价（HTTP轮询，作为WebSocket的补充）
// AG（国内白银）通过后端TqSdk接口获取，Silver（伦敦白银）通过AllTick API获取
async function fetchTradeTick(symbol) {
    try {
        const url = `${API_CONFIG.tradeTickUrl}?symbol=${symbol}&_t=${Date.now()}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            },
            cache: 'no-cache' // 禁用缓存
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

// 获取盘口深度数据
async function fetchDepthTick(symbol) {
    try {
        const url = `${API_CONFIG.depthTickUrl}?symbol=${symbol}&_t=${Date.now()}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            },
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            return null;
        }
        
        const result = await response.json();
        
        if (result.ret === 200 && result.data && result.data.depth_list && result.data.depth_list.length > 0) {
            return result.data.depth_list[0];
        }
        
        return null;
    } catch (error) {
        console.error('[盘口数据] 获取失败:', error);
        return null;
    }
}

// 历史盘口数据（用于计算10秒内的情绪）
let depthHistoryData = [];
const DEPTH_HISTORY_DURATION = 10000; // 10秒

// 计算智能情绪指标
function calculateSmartEmotion(currentData, historyData) {
    // 当前买卖量
    let currentBidVol = 0;
    let currentAskVol = 0;
    
    for (let i = 0; i < 5; i++) {
        currentBidVol += currentData.bid_volume && currentData.bid_volume[i] ? parseInt(currentData.bid_volume[i]) : 0;
        currentAskVol += currentData.ask_volume && currentData.ask_volume[i] ? parseInt(currentData.ask_volume[i]) : 0;
    }
    
    // 如果历史数据不足，返回基础比例
    if (historyData.length < 2) {
        const total = currentBidVol + currentAskVol;
        return {
            bidPercent: total > 0 ? (currentBidVol / total * 100) : 50,
            askPercent: total > 0 ? (currentAskVol / total * 100) : 50,
            bidStrength: 50,
            askStrength: 50,
            trend: '平衡',
            trendValue: 0
        };
    }
    
    // 计算10秒内的变化趋势
    let bidVolChange = 0;
    let askVolChange = 0;
    let bidPriceChange = 0;
    let askPriceChange = 0;
    let spreadChange = 0;
    
    const oldestData = historyData[0];
    const currentBidPrice = currentData.bid_price && currentData.bid_price[0] ? parseFloat(currentData.bid_price[0]) : 0;
    const currentAskPrice = currentData.ask_price && currentData.ask_price[0] ? parseFloat(currentData.ask_price[0]) : 0;
    const oldBidPrice = oldestData.data.bid_price && oldestData.data.bid_price[0] ? parseFloat(oldestData.data.bid_price[0]) : 0;
    const oldAskPrice = oldestData.data.ask_price && oldestData.data.ask_price[0] ? parseFloat(oldestData.data.ask_price[0]) : 0;
    
    // 计算买卖量变化
    bidVolChange = currentBidVol - oldestData.bidVol;
    askVolChange = currentAskVol - oldestData.askVol;
    
    // 计算价格变化
    if (oldBidPrice > 0) bidPriceChange = ((currentBidPrice - oldBidPrice) / oldBidPrice) * 100;
    if (oldAskPrice > 0) askPriceChange = ((currentAskPrice - oldAskPrice) / oldAskPrice) * 100;
    
    // 计算买卖价差变化（价差缩小通常意味着市场活跃）
    const currentSpread = currentAskPrice - currentBidPrice;
    const oldSpread = oldAskPrice - oldBidPrice;
    if (oldSpread > 0) spreadChange = ((currentSpread - oldSpread) / oldSpread) * 100;
    
    // 综合计算情绪强度（0-100）
    // 买方情绪：买量增加、买价上升、价差缩小都是积极信号
    let bidStrength = 50;
    let askStrength = 50;
    
    // 1. 量的影响（40%权重）
    const totalVolChange = Math.abs(bidVolChange) + Math.abs(askVolChange);
    if (totalVolChange > 0) {
        const bidVolWeight = (bidVolChange > 0 ? bidVolChange : 0) / Math.max(totalVolChange, 1);
        const askVolWeight = (askVolChange > 0 ? askVolChange : 0) / Math.max(totalVolChange, 1);
        bidStrength += bidVolWeight * 20 - askVolWeight * 10;
        askStrength += askVolWeight * 20 - bidVolWeight * 10;
    }
    
    // 2. 价格趋势的影响（40%权重）
    bidStrength += bidPriceChange * 2;
    askStrength -= askPriceChange * 2; // 卖价上涨对卖方情绪是负面的
    
    // 3. 价差变化的影响（20%权重）
    if (currentSpread < oldSpread) {
        // 价差缩小，市场活跃，对双方都是正面的
        bidStrength += 5;
        askStrength += 5;
    }
    
    // 限制在0-100范围
    bidStrength = Math.max(0, Math.min(100, bidStrength));
    askStrength = Math.max(0, Math.min(100, askStrength));
    
    // 根据强度调整比例
    const strengthTotal = bidStrength + askStrength;
    const bidPercent = strengthTotal > 0 ? (bidStrength / strengthTotal * 100) : 50;
    const askPercent = strengthTotal > 0 ? (askStrength / strengthTotal * 100) : 50;
    
    // 判断趋势
    let trend = '平衡';
    let trendValue = bidStrength - askStrength;
    
    if (trendValue > 15) {
        trend = '买方强势';
    } else if (trendValue > 5) {
        trend = '买方偏强';
    } else if (trendValue < -15) {
        trend = '卖方强势';
    } else if (trendValue < -5) {
        trend = '卖方偏强';
    }
    
    return {
        bidPercent: bidPercent.toFixed(0),
        askPercent: askPercent.toFixed(0),
        bidStrength: bidStrength.toFixed(0),
        askStrength: askStrength.toFixed(0),
        trend: trend,
        trendValue: trendValue.toFixed(1),
        bidVolChange: bidVolChange,
        askVolChange: askVolChange
    };
}

// 更新国内白银盘口显示
function updateDomesticDepth(depthData) {
    const container = document.getElementById('depth-content');
    const timeElement = document.getElementById('depth-update-time');
    
    if (!container) {
        console.warn('[盘口显示] 盘口容器未找到');
        return;
    }
    
    if (!depthData) {
        console.warn('[盘口显示] 盘口数据为空');
        container.innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 10px;">暂无盘口数据</div>';
        currentDomesticDepthData = null; // 清空缓存
        depthHistoryData = []; // 清空历史
        return;
    }
    
    // 保存盘口数据供AI分析使用
    currentDomesticDepthData = depthData;
    console.log('[盘口显示] 更新盘口数据 - 买1:', depthData.bid_price ? depthData.bid_price[0] : 'N/A', '卖1:', depthData.ask_price ? depthData.ask_price[0] : 'N/A');
    
    // 更新时间
    if (timeElement) {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        timeElement.textContent = timeStr;
    }
    
    // 计算当前买卖双方总量
    let totalBidVolume = 0;
    let totalAskVolume = 0;
    
    for (let i = 0; i < 5; i++) {
        const bidVol = depthData.bid_volume && depthData.bid_volume[i] ? parseInt(depthData.bid_volume[i]) : 0;
        const askVol = depthData.ask_volume && depthData.ask_volume[i] ? parseInt(depthData.ask_volume[i]) : 0;
        totalBidVolume += bidVol;
        totalAskVolume += askVol;
    }
    
    // 记录到历史数据
    const now = Date.now();
    depthHistoryData.push({
        timestamp: now,
        data: depthData,
        bidVol: totalBidVolume,
        askVol: totalAskVolume
    });
    
    // 清理超过10秒的旧数据
    depthHistoryData = depthHistoryData.filter(item => now - item.timestamp <= DEPTH_HISTORY_DURATION);
    
    // 计算智能情绪
    const emotion = calculateSmartEmotion(depthData, depthHistoryData);
    const bidPercent = emotion.bidPercent;
    const askPercent = emotion.askPercent;
    
    // 构建新的左右对比布局
    let html = '<div class="depth-container-new">';
    
    // 左右两列表格容器
    html += '<div class="depth-columns">';
    
    // 左列：卖盘（绿色）
    html += '<div class="depth-column depth-column-ask">';
    html += '<div class="depth-column-header">卖盘</div>';
    html += '<table class="depth-side-table">';
    
    // 卖盘从卖5到卖1
    for (let i = 4; i >= 0; i--) {
        const askPrice = depthData.ask_price && depthData.ask_price[i] ? parseFloat(depthData.ask_price[i]) : 0;
        const askVolume = depthData.ask_volume && depthData.ask_volume[i] ? parseInt(depthData.ask_volume[i]) : 0;
        
        html += '<tr>';
        html += `<td class="depth-label">卖${i + 1}</td>`;
        html += `<td class="depth-price-ask">${askPrice > 0 ? Math.round(askPrice) : '-'}</td>`;
        html += `<td class="depth-vol">${askVolume > 0 ? askVolume : '-'}</td>`;
        html += '</tr>';
    }
    
    html += '</table>';
    html += '</div>';
    
    // 右列：买盘（红色）
    html += '<div class="depth-column depth-column-bid">';
    html += '<div class="depth-column-header">买盘</div>';
    html += '<table class="depth-side-table">';
    
    // 买盘从买1到买5
    for (let i = 0; i < 5; i++) {
        const bidPrice = depthData.bid_price && depthData.bid_price[i] ? parseFloat(depthData.bid_price[i]) : 0;
        const bidVolume = depthData.bid_volume && depthData.bid_volume[i] ? parseInt(depthData.bid_volume[i]) : 0;
        
        html += '<tr>';
        html += `<td class="depth-label">买${i + 1}</td>`;
        html += `<td class="depth-price-bid">${bidPrice > 0 ? Math.round(bidPrice) : '-'}</td>`;
        html += `<td class="depth-vol">${bidVolume > 0 ? bidVolume : '-'}</td>`;
        html += '</tr>';
    }
    
    html += '</table>';
    html += '</div>';
    
    html += '</div>'; // 结束 depth-columns
    
    // 情绪进度条
    html += '<div class="depth-emotion-bar">';
    
    // 趋势指示器
    html += '<div class="emotion-trend-indicator">';
    const trendClass = emotion.trendValue > 0 ? 'trend-bullish' : emotion.trendValue < 0 ? 'trend-bearish' : 'trend-neutral';
    html += `<span class="trend-badge ${trendClass}">${emotion.trend}</span>`;
    html += '<span class="trend-time">10秒动态</span>';
    html += '</div>';
    
    html += '<div class="emotion-bar-container">';
    html += `<div class="emotion-bar-ask" style="width: ${askPercent}%">
        <span class="emotion-bar-text">${Math.round(parseFloat(askPercent))}%</span>
    </div>`;
    html += `<div class="emotion-bar-bid" style="width: ${bidPercent}%">
        <span class="emotion-bar-text">${Math.round(parseFloat(bidPercent))}%</span>
    </div>`;
    html += '</div>';
    html += '<div class="emotion-bar-totals">';
    
    // 显示卖方信息和变化
    let askChangeHtml = '';
    if (emotion.askVolChange !== undefined && depthHistoryData.length >= 2) {
        const askChange = emotion.askVolChange;
        const askChangeIcon = askChange > 0 ? '↑' : askChange < 0 ? '↓' : '─';
        const askChangeClass = askChange > 0 ? 'vol-up' : askChange < 0 ? 'vol-down' : '';
        askChangeHtml = ` <span class="vol-change ${askChangeClass}">${askChangeIcon}${Math.abs(askChange)}</span>`;
    }
    html += `<span class="emotion-total-ask">卖盘: ${totalAskVolume}${askChangeHtml}</span>`;
    
    // 显示买方信息和变化
    let bidChangeHtml = '';
    if (emotion.bidVolChange !== undefined && depthHistoryData.length >= 2) {
        const bidChange = emotion.bidVolChange;
        const bidChangeIcon = bidChange > 0 ? '↑' : bidChange < 0 ? '↓' : '─';
        const bidChangeClass = bidChange > 0 ? 'vol-up' : bidChange < 0 ? 'vol-down' : '';
        bidChangeHtml = ` <span class="vol-change ${bidChangeClass}">${bidChangeIcon}${Math.abs(bidChange)}</span>`;
    }
    html += `<span class="emotion-total-bid">买盘: ${totalBidVolume}${bidChangeHtml}</span>`;
    
    html += '</div>';
    html += '</div>';
    
    // 添加扩展市场数据区域
    html += '<div class="depth-extended-data">';
    html += '<div class="extended-data-title">实时市场数据</div>';
    html += '<div class="extended-data-grid">';
    
    // 准备所有数据
    const lastPrice = depthData.last_price ? parseFloat(depthData.last_price) : 0;
    const open = depthData.open ? parseFloat(depthData.open) : 0;
    const highest = depthData.highest ? parseFloat(depthData.highest) : 0;
    const lowest = depthData.lowest ? parseFloat(depthData.lowest) : 0;
    const average = depthData.average ? parseFloat(depthData.average) : 0;
    const change = depthData.change ? parseFloat(depthData.change) : 0;
    const changePercent = depthData.change_percent ? parseFloat(depthData.change_percent) : 0;
    const changeClass = change >= 0 ? 'price-up' : 'price-down';
    const preSettlement = depthData.pre_settlement ? parseFloat(depthData.pre_settlement) : 0;
    const preClose = depthData.pre_close ? parseFloat(depthData.pre_close) : 0;
    const close = depthData.close ? parseFloat(depthData.close) : 0;
    const settlement = depthData.settlement ? parseFloat(depthData.settlement) : 0;
    const volume = depthData.volume ? parseInt(depthData.volume) : 0;
    const amount = depthData.amount ? parseFloat(depthData.amount) : 0;
    const openInterest = depthData.open_interest ? parseInt(depthData.open_interest) : 0;
    const preOpenInterest = depthData.pre_open_interest ? parseInt(depthData.pre_open_interest) : 0;
    const upperLimit = depthData.upper_limit ? parseFloat(depthData.upper_limit) : 0;
    const lowerLimit = depthData.lower_limit ? parseFloat(depthData.lower_limit) : 0;
    const instrumentName = depthData.instrument_name || '-';
    const priceTick = depthData.price_tick ? parseFloat(depthData.price_tick) : 0;
    const volumeMultiple = depthData.volume_multiple ? parseInt(depthData.volume_multiple) : 0;
    const datetime = depthData.datetime || '-';
    
    // 格式化成交额（显示数值，不带单位）
    let amountStr = '-';
    if (amount > 0) {
        const amountWan = amount / 10000;
        if (amountWan >= 10000) {
            amountStr = (amountWan / 10000).toFixed(2);
        } else {
            amountStr = amountWan.toFixed(2);
        }
    }
    
    // 计算持仓量变化（数据仍然计算，用于传给AI，但不在界面上显示）
    let openInterestChange = '';
    // 保留计算逻辑供AI使用，但不显示在界面上
    // if (openInterest > 0 && preOpenInterest > 0) {
    //     const oiChange = openInterest - preOpenInterest;
    //     const oiChangePercent = ((oiChange / preOpenInterest) * 100).toFixed(2);
    //     if (oiChange !== 0) {
    //         const oiChangeClass = oiChange > 0 ? 'price-up' : 'price-down';
    //         const oiChangeSign = oiChange > 0 ? '+' : '';
    //         openInterestChange = ` <span class="${oiChangeClass}" style="font-size: 9px;">(${oiChangeSign}${oiChange.toLocaleString()})</span>`;
    //     }
    // }
    
    // 第一行：价格信息（5列）
    html += '<div class="extended-data-row">';
    html += `<div class="extended-data-item">
        <span class="extended-label">最新价</span>
        <span class="extended-value">${lastPrice > 0 ? Math.round(lastPrice) : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">开盘</span>
        <span class="extended-value">${open > 0 ? Math.round(open) : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">最高</span>
        <span class="extended-value high-price">${highest > 0 ? Math.round(highest) : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">最低</span>
        <span class="extended-value low-price">${lowest > 0 ? Math.round(lowest) : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">均价</span>
        <span class="extended-value">${average > 0 ? Math.round(average) : '-'}</span>
    </div>`;
    html += '</div>';
    
    // 第二行：涨跌和历史价格（5列）
    html += '<div class="extended-data-row">';
    html += `<div class="extended-data-item">
        <span class="extended-label">涨跌</span>
        <span class="extended-value ${changeClass}">${change !== 0 ? (change > 0 ? '+' : '') + change.toFixed(0) : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">涨跌幅</span>
        <span class="extended-value ${changeClass}">${changePercent !== 0 ? (changePercent > 0 ? '+' : '') + changePercent.toFixed(2) + '%' : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">昨结算</span>
        <span class="extended-value">${preSettlement > 0 ? Math.round(preSettlement) : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">昨收盘</span>
        <span class="extended-value">${preClose > 0 ? Math.round(preClose) : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">收盘价</span>
        <span class="extended-value">${close > 0 ? Math.round(close) : '-'}</span>
    </div>`;
    html += '</div>';
    
    // 第三行：成交和持仓（5列）
    html += '<div class="extended-data-row">';
    html += `<div class="extended-data-item">
        <span class="extended-label">成交量</span>
        <span class="extended-value">${volume > 0 ? volume.toLocaleString() : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">成交额</span>
        <span class="extended-value">${amountStr}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">持仓量</span>
        <span class="extended-value">${openInterest > 0 ? openInterest.toLocaleString() : '-'}${openInterestChange}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">昨持仓</span>
        <span class="extended-value">${preOpenInterest > 0 ? preOpenInterest.toLocaleString() : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">结算价</span>
        <span class="extended-value">${settlement > 0 ? Math.round(settlement) : '-'}</span>
    </div>`;
    html += '</div>';
    
    // 第四行：涨跌停和合约信息（5列）
    html += '<div class="extended-data-row">';
    html += `<div class="extended-data-item">
        <span class="extended-label">涨停价</span>
        <span class="extended-value">${upperLimit > 0 ? Math.round(upperLimit) : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">跌停价</span>
        <span class="extended-value">${lowerLimit > 0 ? Math.round(lowerLimit) : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">合约</span>
        <span class="extended-value" style="font-size: 10px;">${instrumentName}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">最小变动</span>
        <span class="extended-value">${priceTick > 0 ? priceTick : '-'}</span>
    </div>`;
    html += `<div class="extended-data-item">
        <span class="extended-label">合约乘数</span>
        <span class="extended-value" style="font-size: 10px;">${volumeMultiple > 0 ? volumeMultiple + 'kg/手' : '-'}</span>
    </div>`;
    html += '</div>';
    
    // 第五行：行情时间（跨5列居中）
    html += '<div class="extended-data-row">';
    html += `<div class="extended-data-item" style="grid-column: span 5; text-align: center;">
        <span class="extended-label">行情时间</span>
        <span class="extended-value" style="font-size: 10px;">${datetime !== '-' ? datetime.substring(0, 19).replace('T', ' ') : '-'}</span>
    </div>`;
    html += '</div>';
    
    html += '</div>'; // 结束 extended-data-grid
    html += '</div>'; // 结束 depth-extended-data
    
    html += '</div>'; // 结束 depth-container-new
    
    container.innerHTML = html;
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

// 存储当前盘口数据（用于AI分析）
let currentDomesticDepthData = null;

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
    // 计算涨跌强度（结合涨跌幅和成交量）
    const londonTrendMomentum = calculateTrendMomentum(
        londonLastChangePercent, 
        currentLondonKlineData,
        londonLastIsUp
    ); // 综合强度指标（0-1）
    
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

// 保存最后一次的价格建议（用于在页面刷新前保持显示）
let lastPriceAdvice = {
    entryPrice: null,
    stopLoss: null,
    takeProfit: null,
    lots: null, // 建议持仓手数
    direction: null // 交易方向：'做多' 或 '做空'
};

// 全局变量：存储预测K线数据（1分钟）
let predictedLondonKlines = [];
let predictedDomesticKlines = [];

// 全局变量：存储预测K线数据（15分钟）
let predictedLondon15mKlines = [];
let predictedDomestic15mKlines = [];

// 缓存上一次的预测结果（用于传给AI参考）
let previousLondonPrediction = null;
let previousDomesticPrediction = null;
let lastPredictionTime = 0; // 上次预测的时间戳

// AudioContext实例（需要用户交互后才能创建）
let audioContextInstance = null;

// 初始化AudioContext（需要在用户交互后调用）
function initAudioContext() {
    if (!audioContextInstance) {
        try {
            audioContextInstance = new (window.AudioContext || window.webkitAudioContext)();
            console.log('[音效] AudioContext已初始化');
        } catch (error) {
            console.warn('[音效] AudioContext初始化失败:', error);
        }
    }
    return audioContextInstance;
}

// 播放AI操作建议音效
function playTradingAdviceSound(action) {
    try {
        // 初始化AudioContext（如果还没有初始化）
        const audioContext = initAudioContext();
        if (!audioContext) {
            console.warn('[音效] AudioContext不可用，跳过播放');
            return;
        }
        
        // 如果AudioContext被暂停（浏览器要求用户交互），尝试恢复
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('[音效] AudioContext已恢复');
            }).catch(err => {
                console.warn('[音效] AudioContext恢复失败:', err);
            });
        }
        
        let frequency = 440; // 默认频率（A4音符）
        let duration = 0.3; // 持续时间（秒）
        
        // 根据操作建议设置不同的音调
        if (action === '买多') {
            // 买多：上升音调（积极）
            frequency = 523.25; // C5音符
            duration = 0.4;
        } else if (action === '卖空') {
            // 卖空：下降音调（谨慎）
            frequency = 349.23; // F4音符
            duration = 0.35;
        } else if (action === '观望') {
            // 观望：中性音调
            frequency = 440; // A4音符
            duration = 0.25;
        }
        
        // 创建振荡器
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        // 设置音调
        oscillator.type = 'sine'; // 正弦波，柔和
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        
        // 设置音量包络（淡入淡出，避免突然的音效）
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05); // 快速淡入
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + duration - 0.1); // 保持
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration); // 淡出
        
        // 连接节点
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // 播放音效
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
        
        console.log(`[音效] 播放操作建议音效: ${action} (频率: ${frequency}Hz)`);
    } catch (error) {
        // 如果Web Audio API不可用，静默失败
        console.warn('[音效] 播放失败:', error);
    }
}
let currentDescription = ''; // 当前描述，用户输入的当下情况
let descriptionLoaded = false; // 标记是否已经从localStorage加载过

// 当前选择的模型
let selectedModel = 'deepseek-chat'; // 默认使用DeepSeek
let modelLoaded = false; // 标记是否已经从localStorage加载过

// 从localStorage加载保存的当前描述
function loadCurrentDescription() {
    // 如果已经加载过，就不重复加载
    if (descriptionLoaded) {
        return;
    }
    
    try {
        const saved = localStorage.getItem('currentDescription');
        if (saved !== null) {
            currentDescription = saved;
            console.log('[加载描述] 从localStorage恢复描述，长度:', saved.length);
        } else {
            console.log('[加载描述] localStorage中没有保存的描述');
        }
        descriptionLoaded = true;
    } catch (e) {
        console.warn('加载保存的当前描述失败', e);
        descriptionLoaded = true; // 即使失败也标记为已加载，避免重复尝试
    }
}

// 保存当前描述到localStorage（带防抖）
function saveCurrentDescription() {
    // 清除之前的定时器
    if (saveDescriptionTimer) {
        clearTimeout(saveDescriptionTimer);
    }
    
    // 使用防抖：在SAVE_DESCRIPTION_DEBOUNCE_MS毫秒后才真正保存
    saveDescriptionTimer = setTimeout(() => {
        try {
            localStorage.setItem('currentDescription', currentDescription);
            console.log('[保存描述] 已保存到localStorage，长度:', currentDescription.length);
        } catch (e) {
            console.warn('保存当前描述到本地存储失败', e);
        }
    }, SAVE_DESCRIPTION_DEBOUNCE_MS);
}

// 从localStorage加载保存的模型选择
function loadSelectedModel() {
    // 如果已经加载过，就不重复加载
    if (modelLoaded) {
        return;
    }
    
    try {
        const saved = localStorage.getItem('selectedModel');
        if (saved !== null) {
            selectedModel = saved;
            console.log('[加载模型] 从localStorage恢复模型:', selectedModel);
        } else {
            console.log('[加载模型] 使用默认模型:', selectedModel);
        }
    } catch (e) {
        console.warn('加载保存的模型选择失败', e);
    }
    
    modelLoaded = true;
}

// 保存模型选择到localStorage
function saveSelectedModel() {
    try {
        localStorage.setItem('selectedModel', selectedModel);
        console.log('[保存模型] 已保存到localStorage:', selectedModel);
    } catch (e) {
        console.warn('保存模型选择到本地存储失败', e);
    }
}

// 页面加载时恢复当前描述和模型选择
loadCurrentDescription();
loadSelectedModel();

// 分析状态标志，防止重复点击
let isAnalyzing = false;

// 图表更新防抖机制
let chartUpdateTimer = null;
let isChartUpdating = false;
const CHART_UPDATE_DEBOUNCE_MS = 500; // 500ms防抖延迟

// 保存描述防抖机制
let saveDescriptionTimer = null;
const SAVE_DESCRIPTION_DEBOUNCE_MS = 1000; // 1秒防抖延迟

// 布林带突破检测节流
let lastBreakoutCheckTime = 0;
const BREAKOUT_CHECK_THROTTLE_MS = 2000; // 2秒节流

// 将AI分析结果转换为策略显示格式（简化版）
function convertAIResultToStrategy(aiResult) {
    if (!aiResult || aiResult.error) {
        return null;
    }
    
    const advice = aiResult.tradingAdvice || {};
    
    // 根据action确定颜色
    let actionColor = '#9ca3af';
    if (advice.action === '买多') {
        actionColor = '#ef4444';
    } else if (advice.action === '卖空') {
        actionColor = '#4ade80';
    }
    
    // 确定方向：基于action字段，如果是观望则根据价格关系判断
    let direction = null;
    if (advice.action === '买多') {
        direction = '做多';
    } else if (advice.action === '卖空') {
        direction = '做空';
    } else if (advice.action === '观望' && advice.entryPrice && advice.stopLoss) {
        // 观望时，根据价格关系判断建议方向
        // 做多：entryPrice > stopLoss（止损低于开仓价）
        // 做空：entryPrice < stopLoss（止损高于开仓价）
        if (advice.entryPrice > advice.stopLoss) {
            direction = '做多';
        } else if (advice.entryPrice < advice.stopLoss) {
            direction = '做空';
        }
    }
    
    // 如果新的AI结果有价格建议或手数量建议，更新保存的数据
    if (advice.entryPrice || advice.stopLoss || advice.takeProfit || advice.lots) {
        // 只有当新结果有价格时才更新（null值不会覆盖已有的价格）
        if (advice.entryPrice !== null && advice.entryPrice !== undefined) {
            lastPriceAdvice.entryPrice = advice.entryPrice;
            console.log('[价格建议] ✅ 更新开仓价:', advice.entryPrice);
        }
        if (advice.stopLoss !== null && advice.stopLoss !== undefined) {
            lastPriceAdvice.stopLoss = advice.stopLoss;
            console.log('[价格建议] ✅ 更新止损价:', advice.stopLoss);
        }
        if (advice.takeProfit !== null && advice.takeProfit !== undefined) {
            lastPriceAdvice.takeProfit = advice.takeProfit;
            console.log('[价格建议] ✅ 更新止盈价:', advice.takeProfit);
        }
        if (advice.lots !== null && advice.lots !== undefined) {
            lastPriceAdvice.lots = advice.lots;
        }
        
        // 触发图表更新以显示标记线，使用防抖机制避免频繁刷新
        if (domesticChart && currentDomesticKlineData && !isChartUpdating) {
            // 清除之前的定时器
            if (chartUpdateTimer) {
                clearTimeout(chartUpdateTimer);
            }
            
            // 使用防抖：在CHART_UPDATE_DEBOUNCE_MS毫秒后才真正执行更新
            chartUpdateTimer = setTimeout(() => {
                console.log('[价格建议] 📊 价格建议已更新，触发图表刷新以显示标记线');
                isChartUpdating = true;
                const skipTradingStrategyUpdate = true;
                updateChart(domesticChart, currentDomesticKlineData, 'domestic-info', skipTradingStrategyUpdate);
                // 更新完成后重置标志
                setTimeout(() => {
                    isChartUpdating = false;
                }, 200);
            }, CHART_UPDATE_DEBOUNCE_MS);
        }
    }
    
    // 如果有方向信息，保存它
    if (direction) {
        lastPriceAdvice.direction = direction;
    }
    
    // 优先使用新价格，如果没有则使用保存的价格
    let entryPrice = advice.entryPrice !== null && advice.entryPrice !== undefined ? advice.entryPrice : lastPriceAdvice.entryPrice;
    let stopLoss = advice.stopLoss !== null && advice.stopLoss !== undefined ? advice.stopLoss : lastPriceAdvice.stopLoss;
    let takeProfit = advice.takeProfit !== null && advice.takeProfit !== undefined ? advice.takeProfit : lastPriceAdvice.takeProfit;
    
    // 验证并调整止损价格：确保止损价格与开仓价格的差值（绝对值）不超过20
    if (entryPrice && stopLoss) {
        const stopLossDiff = Math.abs(stopLoss - entryPrice);
        if (stopLossDiff > 20) {
            // 如果差值超过20，调整止损价格
            if (stopLoss < entryPrice) {
                // 买多：止损价低于开仓价，调整为 entryPrice - 20
                stopLoss = entryPrice - 20;
            } else {
                // 卖空：止损价高于开仓价，调整为 entryPrice + 20
                stopLoss = entryPrice + 20;
            }
            // 更新保存的止损价格
            lastPriceAdvice.stopLoss = stopLoss;
        }
    }
    
    // 验证并调整止盈价格：确保止盈价格与开仓价格的差值（绝对值）不超过20
    if (entryPrice && takeProfit) {
        const takeProfitDiff = Math.abs(takeProfit - entryPrice);
        if (takeProfitDiff > 20) {
            // 如果差值超过20，调整止盈价格
            if (takeProfit > entryPrice) {
                // 买多：止盈价高于开仓价，调整为 entryPrice + 20
                takeProfit = entryPrice + 20;
            } else {
                // 卖空：止盈价低于开仓价，调整为 entryPrice - 20
                takeProfit = entryPrice - 20;
            }
            // 更新保存的止盈价格
            lastPriceAdvice.takeProfit = takeProfit;
        }
    }
    
    // K线预测功能已移除
    
    const strategy = {
        action: advice.action || '观望',
        actionColor: actionColor,
        confidence: advice.confidence || 0,
        riskLevel: advice.riskLevel || '中',
        analysisReason: aiResult.analysisReason || '暂无分析理由',
        nextSteps: aiResult.nextSteps || null, // 后续思路
        entryPrice: entryPrice,
        stopLoss: stopLoss,
        takeProfit: takeProfit,
        lots: advice.lots !== null && advice.lots !== undefined ? advice.lots : lastPriceAdvice.lots,
        direction: direction || lastPriceAdvice.direction, // 方向信息
        pricePrediction15min: advice.pricePrediction15min !== null && advice.pricePrediction15min !== undefined ? advice.pricePrediction15min : null, // 15分钟价格预测
        londonPricePrediction15min: advice.londonPricePrediction15min !== null && advice.londonPricePrediction15min !== undefined ? advice.londonPricePrediction15min : null // 伦敦15分钟价格预测
    };
    
    return strategy;
}

// 保存上一次的布林带突破状态，用于检测新的突破
let lastBollingerBreakout = {
    domestic: null, // 'upper', 'lower', 'middle', null
    london: null
};

function updateTradingStrategy() {
    const container = document.getElementById('trading-strategy-content');
    if (!container) {
        return;
    }
    
    // 确保加载了保存的描述（防止某些情况下没有加载）
    if (!descriptionLoaded) {
        loadCurrentDescription();
    }
    
    // 检查用户是否正在输入当前描述（如果有焦点），如果是则跳过更新
    const existingInput = document.getElementById('current-description-input');
    if (existingInput && document.activeElement === existingInput) {
        // 用户正在输入，完全跳过更新，避免打断用户
        return;
    }
    
    // 检测布林带突破，自动触发AI分析
    checkBollingerBreakoutAndTriggerAnalysis();
    
    // 优先使用AI分析结果
    if (aiAnalysisResult) {
        const aiStrategy = convertAIResultToStrategy(aiAnalysisResult);
        if (aiStrategy) {
            renderStrategyFromAI(aiStrategy);
            return;
        }
    }
    
    // 在重新渲染之前，先保存当前输入框的值（如果存在）
    let hadFocus = false;
    let cursorPosition = 0;
    if (existingInput) {
        currentDescription = existingInput.value;
        cursorPosition = existingInput.selectionStart || 0;
        hadFocus = document.activeElement === existingInput;
        // 如果有内容但没有焦点，光标应该在文本末尾
        if (!hadFocus && currentDescription.length > 0 && cursorPosition === 0) {
            cursorPosition = currentDescription.length;
        }
        saveCurrentDescription();
    }
    
    // 如果没有AI分析结果，显示等待状态和当前描述输入框
    container.innerHTML = `
        <div class="loading" style="margin-bottom: 20px;">等待AI分析数据...</div>
        <div class="strategy-section" style="margin-bottom: 20px;">
            <div style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1e2548;">
                当前描述
            </div>
            <textarea id="current-description-input" placeholder="请输入当下情况的描述（将在AI分析时加入prompt）" 
                style="width: 100%; min-height: 80px; padding: 12px; background: rgba(19, 23, 43, 0.8); border: 1px solid #1e2548; border-radius: 6px; color: #e0e0e0; font-size: 13px; line-height: 1.6; font-family: inherit; resize: vertical; box-sizing: border-box;"
                >${currentDescription}</textarea>
        </div>
    `;
    
    // 添加输入框事件监听，保存当前描述
    const descriptionInput = document.getElementById('current-description-input');
    if (descriptionInput) {
        // 恢复光标位置
        if (cursorPosition >= 0 && currentDescription.length > 0) {
            // 确保光标位置不超过文本长度
            const safePosition = Math.min(cursorPosition, currentDescription.length);
            setTimeout(() => {
                descriptionInput.setSelectionRange(safePosition, safePosition);
            }, 0);
        }
        
        // 恢复焦点（如果之前有焦点）
        if (hadFocus) {
            setTimeout(() => {
                descriptionInput.focus();
            }, 0);
        }
        
        // 移除之前可能存在的监听器（如果使用命名函数）
        descriptionInput.addEventListener('input', function handleDescriptionInput(e) {
            currentDescription = e.target.value;
            saveCurrentDescription(); // 保存到localStorage
        });
        
        // 添加 blur 事件监听器，确保失去焦点时也保存
        descriptionInput.addEventListener('blur', function handleDescriptionBlur(e) {
            currentDescription = e.target.value;
            saveCurrentDescription();
        });
    }
    
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

// 检测布林带突破并自动触发AI分析（只检测伦敦市场）
function checkBollingerBreakoutAndTriggerAnalysis() {
    // 节流：如果距离上次检测时间小于BREAKOUT_CHECK_THROTTLE_MS，则跳过
    const now = Date.now();
    if (now - lastBreakoutCheckTime < BREAKOUT_CHECK_THROTTLE_MS) {
        return;
    }
    
    // 检查数据完整性（只需要伦敦市场的数据）
    if (!londonLastTradePrice || !londonCurrentBollingerBands.upper) {
        return;
    }
    
    // 只分析伦敦市场的布林带位置
    const londonAnalysis = analyzeBollingerBands(
        londonLastTradePrice,
        londonCurrentBollingerBands.upper,
        londonCurrentBollingerBands.middle,
        londonCurrentBollingerBands.lower
    );
    
    // 检测突破状态
    let londonBreakout = null;
    
    // 检测伦敦突破
    if (londonAnalysis.breakout === 'upper' || londonAnalysis.breakout === 'lower') {
        londonBreakout = londonAnalysis.breakout;
    } else if (londonAnalysis.position === 'near_upper' || londonAnalysis.position === 'near_lower') {
        // 接近上下轨也算触发
        londonBreakout = londonAnalysis.position === 'near_upper' ? 'upper' : 'lower';
    } else if (londonAnalysis.position === 'middle' || londonAnalysis.position === 'upper_half' || londonAnalysis.position === 'lower_half') {
        // 价格在中轨附近或上下半部分时，如果之前有突破，现在回到中轨也算触发
        if (lastBollingerBreakout.london === 'upper' || lastBollingerBreakout.london === 'lower') {
            londonBreakout = 'middle';
        }
    }
    
    // 如果检测到新的突破（与上一次不同），触发AI分析
    if (londonBreakout !== null && londonBreakout !== lastBollingerBreakout.london) {
        console.log(`[布林带触发] 伦敦市场突破: ${lastBollingerBreakout.london} -> ${londonBreakout}`);
        lastBollingerBreakout.london = londonBreakout;
        lastBreakoutCheckTime = now; // 更新检测时间
        // 自动触发AI分析（如果不在分析中）
        if (!isAnalyzing) {
            console.log('[自动触发] 由于伦敦市场布林带突破，自动触发AI分析');
            performAnalysis();
        }
    }
}

// 使用AI分析结果渲染策略（简化版：只显示操作建议和分析理由）
function renderStrategyFromAI(displayStrategy) {
    const container = document.getElementById('trading-strategy-content');
    if (!container) {
        return;
    }
    
    // 确保加载了保存的描述（防止某些情况下没有加载）
    if (!descriptionLoaded) {
        loadCurrentDescription();
    }
    
    // 在重新渲染之前，先保存当前输入框的值（如果存在）
    const existingInput = document.getElementById('current-description-input');
    let hadFocus = false;
    let cursorPosition = 0;
    if (existingInput) {
        currentDescription = existingInput.value;
        cursorPosition = existingInput.selectionStart || 0;
        hadFocus = document.activeElement === existingInput;
        // 如果有内容但没有焦点，光标应该在文本末尾
        if (!hadFocus && currentDescription.length > 0 && cursorPosition === 0) {
            cursorPosition = currentDescription.length;
        }
        saveCurrentDescription();
    }
    
    let html = '';
    
    // 当前持仓信息
    const floatingPnL = calculateFloatingPnL(domesticLastTradePrice);
    const hasPosition = currentPosition.direction && currentPosition.lots > 0;
    
    // 价格建议（用于判断方向）
    const priceToShow = {
        entryPrice: displayStrategy.entryPrice !== null && displayStrategy.entryPrice !== undefined ? displayStrategy.entryPrice : lastPriceAdvice.entryPrice,
        stopLoss: displayStrategy.stopLoss !== null && displayStrategy.stopLoss !== undefined ? displayStrategy.stopLoss : lastPriceAdvice.stopLoss,
        takeProfit: displayStrategy.takeProfit !== null && displayStrategy.takeProfit !== undefined ? displayStrategy.takeProfit : lastPriceAdvice.takeProfit,
        lots: displayStrategy.lots !== null && displayStrategy.lots !== undefined ? displayStrategy.lots : lastPriceAdvice.lots
    };
    
    // 确定方向：优先使用strategy中的direction，如果没有则根据action和价格关系判断
    let direction = displayStrategy.direction;
    let directionColor = '#9ca3af';
    if (!direction) {
        // 如果没有方向信息，根据action和价格关系判断
        if (displayStrategy.action === '买多') {
            direction = '买多';
            directionColor = '#ef4444'; // 红色（带"多"字）
        } else if (displayStrategy.action === '卖空') {
            direction = '卖空';
            directionColor = '#4ade80'; // 绿色（带"空"字）
        } else if (displayStrategy.action === '观望' && priceToShow.entryPrice && priceToShow.stopLoss) {
            // 观望时，根据价格关系判断建议方向
            if (priceToShow.entryPrice > priceToShow.stopLoss) {
                direction = '买多';
                directionColor = '#ef4444';
            } else if (priceToShow.entryPrice < priceToShow.stopLoss) {
                direction = '卖空';
                directionColor = '#4ade80';
            }
        }
    } else {
        // 如果有方向信息，设置对应的颜色
        // 统一将"做多"/"多"转换为"买多"，"做空"/"空"转换为"卖空"
        if (direction === '做多' || direction.includes('多')) {
            direction = '买多';
            directionColor = '#ef4444'; // 红色（带"多"字）
        } else if (direction === '做空' || direction.includes('空')) {
            direction = '卖空';
            directionColor = '#4ade80'; // 绿色（带"空"字）
        }
    }
    
    // 如果交易方向和操作建议一致，不显示交易方向
    const showDirection = direction && direction !== displayStrategy.action;
    
    // 操作建议和交易方向合并显示在一行
    html += `<div class="strategy-main-action" style="text-align: center; margin-bottom: 20px; padding: 15px; background: rgba(19, 23, 43, 0.8); border-radius: 8px; border: 2px solid ${displayStrategy.actionColor};">
        <div style="font-size: 13px; color: #9ca3af; margin-bottom: 8px;">${showDirection ? '操作建议与方向' : '操作建议'}</div>
        <div style="display: flex; justify-content: center; align-items: center; gap: 16px; margin-bottom: 8px;">
            <div>
                ${showDirection ? `<div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">操作建议</div>` : ''}
                <div style="font-size: 26px; font-weight: 700; color: ${displayStrategy.actionColor};">
                    ${displayStrategy.action}
                </div>
            </div>
            ${showDirection ? `
            <div style="border-left: 2px solid #1e2548; padding-left: 16px;">
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">交易方向</div>
                <div style="font-size: 26px; font-weight: 700; color: ${directionColor};">
                    ${direction}
                </div>
            </div>
            ` : ''}
        </div>
        <div style="font-size: 13px; color: #9ca3af; margin-bottom: 0;">
            信心度: <span style="color: ${displayStrategy.confidence >= 70 ? '#ef4444' : displayStrategy.confidence >= 50 ? '#fbbf24' : '#9ca3af'}; font-weight: 600;">${displayStrategy.confidence}%</span>
            <span style="margin-left: 12px;">风险等级: <span style="color: ${displayStrategy.riskLevel === '高' ? '#ef4444' : displayStrategy.riskLevel === '中' ? '#fbbf24' : '#4ade80'}; font-weight: 600;">${displayStrategy.riskLevel}</span></span>
        </div>
        ${hasPosition ? `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #1e2548;">
            <div style="font-size: 11px; color: #9ca3af; margin-bottom: 4px;">当前持仓</div>
            <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">
                ${currentPosition.direction === 'buy' ? '买多' : '卖空'} ${currentPosition.lots}手 | 开仓价: ${Math.round(currentPosition.entryPrice)}
            </div>
            <div style="font-size: 13px; font-weight: 600; color: ${floatingPnL.isProfit ? '#4ade80' : '#ef4444'};">
                浮动盈亏: ${floatingPnL.isProfit ? '+' : ''}${Math.round(floatingPnL.pnl)} (${floatingPnL.isProfit ? '+' : ''}${floatingPnL.pnlPercent.toFixed(2)}%)
            </div>
        </div>
        ` : ''}
    </div>`;
    
    // 价格建议（显示在操作建议下面）
    if (priceToShow.entryPrice || priceToShow.stopLoss || priceToShow.takeProfit || priceToShow.lots) {
        html += `<div class="strategy-section" style="margin-bottom: 20px;">
            <div style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1e2548;">
                价格建议
            </div>
            <div style="padding: 12px; background: rgba(19, 23, 43, 0.6); border-radius: 6px;">
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 13px;">
                    ${priceToShow.entryPrice ? `
                    <div style="text-align: center; padding: 6px; background: rgba(251, 191, 36, 0.1); border-radius: 6px;">
                        <div style="color: #9ca3af; margin-bottom: 3px; white-space: nowrap; font-size: 11px;">开仓</div>
                        <div style="color: #ffffff; font-weight: 600; font-size: 14px;">${Math.round(priceToShow.entryPrice)}</div>
                    </div>
                    ` : '<div></div>'}
                    ${priceToShow.stopLoss ? `
                    <div style="text-align: center; padding: 6px; background: rgba(74, 222, 128, 0.1); border-radius: 6px;">
                        <div style="color: #9ca3af; margin-bottom: 3px; white-space: nowrap; font-size: 11px;">止损</div>
                        <div style="color: #4ade80; font-weight: 600; font-size: 14px;">${Math.round(priceToShow.stopLoss)}</div>
                    </div>
                    ` : '<div></div>'}
                    ${priceToShow.takeProfit ? `
                    <div style="text-align: center; padding: 6px; background: rgba(239, 68, 68, 0.1); border-radius: 6px;">
                        <div style="color: #9ca3af; margin-bottom: 3px; white-space: nowrap; font-size: 11px;">止盈</div>
                        <div style="color: #ef4444; font-weight: 600; font-size: 14px;">${Math.round(priceToShow.takeProfit)}</div>
                    </div>
                    ` : '<div></div>'}
                    ${priceToShow.lots ? `
                    <div style="text-align: center; padding: 6px; background: rgba(251, 191, 36, 0.1); border-radius: 6px;">
                        <div style="color: #9ca3af; margin-bottom: 3px; white-space: nowrap; font-size: 11px;">手数</div>
                        <div style="color: #fbbf24; font-weight: 600; font-size: 14px;">${Math.round(priceToShow.lots)}手</div>
                    </div>
                    ` : '<div></div>'}
                </div>
                ${displayStrategy.pricePrediction15min !== null && displayStrategy.pricePrediction15min !== undefined ? `
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #1e2548;">
                    <div style="color: #9ca3af; margin-bottom: 12px; font-size: 14px; font-weight: 600;">15分钟后价格预测</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <!-- 国内白银预测 -->
                        <div style="text-align: center; padding: 12px; background: rgba(19, 23, 43, 0.4); border-radius: 6px;">
                            <div style="color: #9ca3af; margin-bottom: 8px; font-size: 12px;">国内白银主力</div>
                            ${(() => {
                                const currentPrice = domesticLastTradePrice || displayStrategy.entryPrice || 0;
                                const prediction = displayStrategy.pricePrediction15min;
                                const diff = prediction - currentPrice;
                                const diffPercent = currentPrice > 0 ? ((diff / currentPrice) * 100).toFixed(2) : '0.00';
                                const isUp = diff >= 0;
                                const predictionColor = isUp ? '#ef4444' : '#4ade80';
                                return `
                                <div style="color: ${predictionColor}; font-weight: 700; font-size: 22px; margin-bottom: 6px;">
                                    ${Math.round(prediction)}
                                </div>
                                <div style="color: #9ca3af; font-size: 11px;">
                                    当前: <span style="color: #ffffff;">${Math.round(currentPrice)}</span>
                                    <span style="margin-left: 6px;">变化: <span style="color: ${predictionColor};">${isUp ? '+' : ''}${Math.round(diff)} (${isUp ? '+' : ''}${diffPercent}%)</span></span>
                                </div>
                                `;
                            })()}
                        </div>
                        <!-- 伦敦白银预测 -->
                        ${displayStrategy.londonPricePrediction15min !== null && displayStrategy.londonPricePrediction15min !== undefined ? `
                        <div style="text-align: center; padding: 12px; background: rgba(19, 23, 43, 0.4); border-radius: 6px;">
                            <div style="color: #9ca3af; margin-bottom: 8px; font-size: 12px;">伦敦现货白银</div>
                            ${(() => {
                                const currentPrice = londonLastTradePrice || 0;
                                const prediction = displayStrategy.londonPricePrediction15min;
                                const diff = prediction - currentPrice;
                                const diffPercent = currentPrice > 0 ? ((diff / currentPrice) * 100).toFixed(2) : '0.00';
                                const isUp = diff >= 0;
                                const predictionColor = isUp ? '#ef4444' : '#4ade80';
                                return `
                                <div style="color: ${predictionColor}; font-weight: 700; font-size: 22px; margin-bottom: 6px;">
                                    ${prediction.toFixed(3)}
                                </div>
                                <div style="color: #9ca3af; font-size: 11px;">
                                    当前: <span style="color: #ffffff;">${currentPrice > 0 ? currentPrice.toFixed(3) : 'N/A'}</span>
                                    ${currentPrice > 0 ? `<span style="margin-left: 6px;">变化: <span style="color: ${predictionColor};">${isUp ? '+' : ''}${diff.toFixed(3)} (${isUp ? '+' : ''}${diffPercent}%)</span></span>` : ''}
                                </div>
                                `;
                            })()}
                        </div>
                        ` : '<div></div>'}
                    </div>
                </div>
                ` : ''}
            </div>
        </div>`;
    }
    
    // 分析理由（显示在下面）
    html += `<div class="strategy-section" style="margin-bottom: 20px;">
        <div style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1e2548;">
            分析理由
        </div>
        <div style="padding: 12px; background: rgba(19, 23, 43, 0.6); border-radius: 6px; color: #e0e0e0; line-height: 1.6; font-size: 13px;">
            ${displayStrategy.analysisReason || '暂无分析理由'}
        </div>
    </div>`;
    
    // 后续思路（显示在分析理由下面）
    if (displayStrategy.nextSteps) {
        html += `<div class="strategy-section" style="margin-bottom: 20px;">
            <div style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1e2548;">
                后续思路
            </div>
            <div style="padding: 12px; background: rgba(19, 23, 43, 0.6); border-radius: 6px; color: #e0e0e0; line-height: 1.6; font-size: 13px;">
                ${displayStrategy.nextSteps}
            </div>
        </div>`;
    }
    
    // 当前描述（显示在后续思路下面）
    html += `<div class="strategy-section" style="margin-bottom: 20px;">
        <div style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1e2548;">
            当前描述
        </div>
        <textarea id="current-description-input" placeholder="请输入当下情况的描述（将在AI分析时加入prompt）" 
            style="width: 100%; min-height: 80px; padding: 12px; background: rgba(19, 23, 43, 0.8); border: 1px solid #1e2548; border-radius: 6px; color: #e0e0e0; font-size: 13px; line-height: 1.6; font-family: inherit; resize: vertical; box-sizing: border-box;"
            >${currentDescription}</textarea>
    </div>`;
    
    // 将HTML渲染到页面
    container.innerHTML = html;
    
    // 添加输入框事件监听，保存当前描述
    const descriptionInput = document.getElementById('current-description-input');
    if (descriptionInput) {
        // 恢复光标位置
        if (cursorPosition >= 0 && currentDescription.length > 0) {
            // 确保光标位置不超过文本长度
            const safePosition = Math.min(cursorPosition, currentDescription.length);
            setTimeout(() => {
                descriptionInput.setSelectionRange(safePosition, safePosition);
            }, 0);
        }
        
        // 恢复焦点（如果之前有焦点）
        if (hadFocus) {
            setTimeout(() => {
                descriptionInput.focus();
            }, 0);
        }
        
        descriptionInput.addEventListener('input', (e) => {
            currentDescription = e.target.value;
            saveCurrentDescription(); // 保存到localStorage
        });
    }
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

// 记录上一次国内价格触发刷新的时间
let lastDomesticPriceUpdateTrigger = 0;
const DOMESTIC_PRICE_UPDATE_INTERVAL = 10000; // 国内价格变化触发刷新的最小间隔（10秒）

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
    
    // 保存旧价格，用于判断是否有变化
    const oldPrice = domesticLastTradePrice;
    
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
    
    // 检测价格变化，如果在交易时间且价格有变化，触发K线刷新
    if (isDomesticTradingTime() && oldPrice !== null && oldPrice > 0 && Math.abs(price - oldPrice) >= 1) {
        const now = Date.now();
        const timeSinceLastTrigger = now - lastDomesticPriceUpdateTrigger;
        
        // 避免过于频繁触发，最少间隔10秒
        if (timeSinceLastTrigger >= DOMESTIC_PRICE_UPDATE_INTERVAL) {
            console.log(`[国内价格触发] 🔔 检测到价格变化 ${oldPrice} -> ${price}，触发K线刷新`);
            lastDomesticPriceUpdateTrigger = now;
            updateAllData();
        }
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
    
    // 如果currentLondonKlineRealtime还未初始化，尝试从currentLondonKlineData初始化
    if (!currentLondonKlineRealtime && currentLondonKlineData && currentLondonKlineData.length > 0) {
        const lastKline = currentLondonKlineData[currentLondonKlineData.length - 1];
        currentLondonKlineRealtime = {
            t: lastKline.t,
            o: lastKline.o,
            h: lastKline.h,
            l: lastKline.l,
            c: lastKline.c,
            v: lastKline.v,
            tu: lastKline.tu
        };
        console.log('[伦敦K线实时更新] 自动初始化currentLondonKlineRealtime，时间:', new Date(lastKline.t).toLocaleTimeString());
    }
    
    // 检查是否有新的K线（基于Tick时间戳判断）
    // tick_time是毫秒时间戳，需要转换为分钟级别判断是否跨分钟
    const tickTime = parseInt(priceData.tick_time || Date.now());
    const tickMinute = Math.floor(tickTime / 60000) * 60000; // 转换为分钟级时间戳
    
    if (currentLondonKlineRealtime && currentLondonKlineRealtime.t) {
        const currentKlineMinute = Math.floor(currentLondonKlineRealtime.t / 60000) * 60000;
        
        // 如果Tick的分钟时间戳大于当前K线的分钟时间戳，说明有新K线生成
        if (tickMinute > currentKlineMinute) {
            console.log(`[WebSocket触发] 🔔 检测到新K线！旧K线: ${new Date(currentKlineMinute).toLocaleTimeString()}, 新Tick: ${new Date(tickMinute).toLocaleTimeString()}`);
            console.log('[WebSocket触发] 立即刷新K线数据（WebSocket驱动）');
            // 立即触发数据更新，获取最新的K线数据
            updateAllData();
            return; // 新K线时，等待updateAllData更新数据后再继续
        }
    }
    
    // 实时更新当前K线的价格数据
    if (currentLondonKlineRealtime && price > 0) {
        // 更新收盘价
        currentLondonKlineRealtime.c = price;
        // 更新最高价
        if (price > currentLondonKlineRealtime.h) {
            currentLondonKlineRealtime.h = price;
        }
        // 更新最低价
        if (price < currentLondonKlineRealtime.l) {
            currentLondonKlineRealtime.l = price;
        }
        
        // 节流更新图表（避免过于频繁的渲染）
        const now = Date.now();
        const shouldUpdate = (now - lastLondonRealtimeUpdate) >= REALTIME_UPDATE_INTERVAL;
        
        if (shouldUpdate) {
            // 记录更新（每20次打印一次日志，避免过多输出）
            if (Math.random() < 0.05) {
                console.log(`[伦敦K线实时更新] Price: ${price.toFixed(3)}, OHLC: ${currentLondonKlineRealtime.o.toFixed(3)}/${currentLondonKlineRealtime.h.toFixed(3)}/${currentLondonKlineRealtime.l.toFixed(3)}/${currentLondonKlineRealtime.c.toFixed(3)}`);
            }
            
            // 轻量级更新：直接更新ECharts的最后一根K线数据，不重新计算布林带
            if (londonChart && currentLondonKlineData && currentLondonKlineData.length > 0) {
                try {
                    const option = londonChart.getOption();
                    if (option && option.series && option.series[0]) {
                        // 获取当前K线系列数据
                        const klineSeriesData = option.series[0].data;
                        if (klineSeriesData && klineSeriesData.length > 0) {
                            // 找到真实K线的最后一个位置（跳过后面的null值）
                            // currentLondonKlineData.length 是真实K线的数量
                            const lastRealKlineIndex = currentLondonKlineData.length - 1;
                            
                            // 确保索引有效
                            if (lastRealKlineIndex >= 0 && lastRealKlineIndex < klineSeriesData.length) {
                                // 更新最后一根真实K线的数据
                                const newKlineData = [
                                    currentLondonKlineRealtime.o,
                                    currentLondonKlineRealtime.c,
                                    currentLondonKlineRealtime.l,
                                    currentLondonKlineRealtime.h
                                ];
                                
                                // 直接更新数组，然后只更新这个位置的系列数据
                                klineSeriesData[lastRealKlineIndex] = newKlineData;
                                
                                // 使用setOption更新，指定要更新的系列索引
                                londonChart.setOption({
                                    series: [{
                                        data: klineSeriesData
                                    }]
                                }, false); // notMerge=false, 只合并更新
                                
                                lastLondonRealtimeUpdate = now;
                                
                                // 偶尔打印日志确认更新成功
                                if (Math.random() < 0.01) {
                                    console.log(`[伦敦K线实时更新] 成功更新K线索引 ${lastRealKlineIndex}, OHLC: ${newKlineData.join('/')}`);
                                }
                            } else {
                                if (Math.random() < 0.05) {
                                    console.warn(`[伦敦K线实时更新] 索引越界: lastRealKlineIndex=${lastRealKlineIndex}, klineSeriesData.length=${klineSeriesData.length}, currentLondonKlineData.length=${currentLondonKlineData.length}`);
                                }
                            }
                        } else {
                            if (Math.random() < 0.05) {
                                console.warn('[伦敦K线实时更新] klineSeriesData为空或长度为0');
                            }
                        }
                    }
                } catch (e) {
                    console.error('[伦敦K线实时更新] 更新失败:', e);
                }
            } else {
                if (Math.random() < 0.02) { // 偶尔打印警告
                    console.warn('[伦敦K线实时更新] 图表或数据未就绪', {
                        hasChart: !!londonChart,
                        hasData: !!(currentLondonKlineData && currentLondonKlineData.length > 0)
                    });
                }
            }
        }
    } else if (price > 0) {
        // 打印详细调试信息
        console.warn('[伦敦K线实时更新] currentLondonKlineRealtime未初始化!');
        console.warn('  - 价格:', price.toFixed(3));
        console.warn('  - currentLondonKlineData存在:', !!currentLondonKlineData);
        console.warn('  - currentLondonKlineData长度:', currentLondonKlineData ? currentLondonKlineData.length : 0);
        console.warn('  - 尝试立即初始化...');
        
        // 立即尝试初始化
        if (currentLondonKlineData && currentLondonKlineData.length > 0) {
            const lastKline = currentLondonKlineData[currentLondonKlineData.length - 1];
            currentLondonKlineRealtime = {
                t: lastKline.t,
                o: lastKline.o,
                h: price, // 使用当前价格作为初始高点
                l: price, // 使用当前价格作为初始低点
                c: price,
                v: lastKline.v,
                tu: lastKline.tu
            };
            console.warn('  - 紧急初始化完成!');
        }
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

/**
 * 计算涨跌强度（结合涨跌幅和成交量）
 * @param {number} changePercent - 涨跌幅百分比（可以为正或负）
 * @param {Array} klineData - K线数据数组，格式：[{t, o, c, h, l, v, ...}, ...] 或 [{o, c, h, l, v, ...}, ...]
 * @param {boolean} isUp - 是否上涨（true=上涨，false=下跌）
 * @param {number} lookbackPeriod - 回看周期（分钟数），默认20分钟
 * @returns {number} 综合强度指标，范围0-1，值越大表示强度越高
 */
function calculateTrendMomentum(changePercent, klineData, isUp, lookbackPeriod = 20) {
    // 如果没有涨跌幅数据，返回0
    if (changePercent === null || changePercent === undefined || changePercent === 0) {
        return 0;
    }
    
    // 1. 价格强度：涨跌幅的绝对值，归一化到0-1
    // 假设涨跌幅通常在-10%到+10%之间，10%为最大值
    const priceStrength = Math.min(Math.abs(changePercent) / 10, 1);
    
    // 2. 成交量强度：计算量比（当前成交量 vs 平均成交量）
    let volumeStrength = 0.5; // 默认中等强度
    
    // 检查是否有K线数据和成交量数据
    if (klineData && Array.isArray(klineData) && klineData.length >= 2) {
        try {
            // 获取最近的K线数据（最多lookbackPeriod根）
            const recentKlines = klineData.slice(-lookbackPeriod);
            
            // 检查数据结构，可能有两种格式：
            // 格式1: [{t, o, c, h, l, v, ...}, ...]
            // 格式2: [{o, c, h, l, v, ...}, ...]
            // 提取成交量字段
            const getVolume = (item) => {
                if (typeof item === 'object' && item !== null) {
                    return parseFloat(item.v || item.volume || 0);
                }
                return 0;
            };
            
            // 当前K线的成交量（最后一根）
            const currentVolume = getVolume(recentKlines[recentKlines.length - 1]);
            
            // 计算前N-1根K线的平均成交量
            const previousVolumes = recentKlines.slice(0, -1)
                .map(getVolume)
                .filter(v => v > 0);
            
            if (previousVolumes.length > 0 && currentVolume > 0) {
                const avgVolume = previousVolumes.reduce((sum, v) => sum + v, 0) / previousVolumes.length;
                
                // 量比 = 当前成交量 / 平均成交量
                const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
                
                // 归一化量比到0-1：
                // 量比 = 1 时，强度 = 0.5（中等）
                // 量比 = 2 时，强度 = 1（很强）
                // 量比 = 0.5 时，强度 = 0（很弱）
                // 使用对数函数平滑处理：volumeStrength = log2(volumeRatio + 1) / 2
                if (volumeRatio >= 0.5) {
                    volumeStrength = Math.min(Math.log2(volumeRatio + 1) / 2, 1);
                } else {
                    // 如果量比 < 0.5，说明成交量萎缩，强度降低
                    volumeStrength = volumeRatio; // 直接使用量比，范围0-0.5
                }
            } else {
                // 如果没有有效的成交量数据，使用默认值0.5
                volumeStrength = 0.5;
            }
        } catch (error) {
            console.warn('计算成交量强度失败:', error);
            // 如果计算出错，使用默认值0.5
            volumeStrength = 0.5;
        }
    }
    
    // 3. 综合强度 = 价格强度 × 成交量强度
    // 这意味着：
    // - 如果涨跌幅大但成交量小，强度中等（可能缺乏资金支持）
    // - 如果涨跌幅大且成交量大，强度高（有资金支持）
    // - 如果涨跌幅小但成交量大，强度中等（可能只是试探）
    // - 如果涨跌幅小且成交量小，强度低（市场平淡）
    const combinedStrength = priceStrength * volumeStrength;
    
    // 4. 方向加权：上涨时略提高强度（市场情绪偏向看涨），下跌时略降低强度
    const directionWeight = isUp ? 1.1 : 0.9;
    const finalStrength = Math.min(combinedStrength * directionWeight, 1);
    
    return finalStrength;
}

// 更新图表
function updateChart(chart, data, infoElementId, skipTradingStrategyUpdate = false) {
    // 检查chart是否已初始化
    if (!chart) {
        console.warn(`[图表更新] 图表未初始化: ${infoElementId}`);
        return;
    }
    
    console.log(`[图表更新] 开始更新: ${infoElementId}, 数据条数: ${data ? data.length : 0}`);
    
    if (!data || data.length === 0) {
        const infoElement = document.getElementById(infoElementId);
        if (infoElement) {
            infoElement.innerHTML = '<span style="color: #ef4444;">暂无数据</span>';
        }
        if (infoElementId.includes('domestic')) {
            console.warn(`[图表更新] ${infoElementId} 没有数据`);
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
    
    // 检查是否有预测K线数据
    let predictedKlines = [];
    const isLondonChart = infoElementId.includes('london');
    const isDomesticChart = infoElementId.includes('domestic');
    const is1mChart = !infoElementId.includes('daily') && !infoElementId.includes('15m');
    const is15mChart = infoElementId.includes('15m');
    
    // 获取最新真实K线的时间戳
    const lastRealTimestamp = sortedData.length > 0 ? sortedData[sortedData.length - 1].t : 0;
    
    if (is1mChart) {
        // 1分钟K线预测
        if (isLondonChart && predictedLondonKlines.length > 0) {
            // 清理已经被真实K线覆盖的预测数据（预测时间 <= 最新真实K线时间）
            const beforeClean = predictedLondonKlines.length;
            predictedLondonKlines = predictedLondonKlines.filter(pred => pred.t > lastRealTimestamp);
            predictedKlines = predictedLondonKlines;
            console.log('[K线预测] 清理后，伦敦1分钟预测K线剩余:', predictedKlines.length, '(清理前:', beforeClean, ')');
            
            // 如果预测数据少于设定值，自动触发新的预测
            if (predictedKlines.length < PREDICTION_CONFIG.minPricePointsForRetrigger && beforeClean > 0) {
                console.log(`[K线预测] ⚠️ 预测数据不足${PREDICTION_CONFIG.minPricePointsForRetrigger}个，将自动触发新预测`);
                setTimeout(() => {
                    console.log('[K线预测] 自动触发预测更新...');
                    predictKlinesInBackground();
                }, 1000);
            }
        } else if (isDomesticChart && predictedDomesticKlines.length > 0) {
            // 清理已经被真实K线覆盖的预测数据
            const beforeClean = predictedDomesticKlines.length;
            predictedDomesticKlines = predictedDomesticKlines.filter(pred => pred.t > lastRealTimestamp);
            predictedKlines = predictedDomesticKlines;
            console.log('[K线预测] 清理后，国内1分钟预测K线剩余:', predictedKlines.length, '(清理前:', beforeClean, ')');
            
            // 如果预测数据少于设定值，自动触发新的预测
            if (predictedKlines.length < PREDICTION_CONFIG.minPricePointsForRetrigger && beforeClean > 0) {
                console.log(`[K线预测] ⚠️ 预测数据不足${PREDICTION_CONFIG.minPricePointsForRetrigger}个，将自动触发新预测`);
                setTimeout(() => {
                    console.log('[K线预测] 自动触发预测更新...');
                    predictKlinesInBackground();
                }, 1000);
            }
        }
    } else if (is15mChart) {
        // 15分钟K线预测
        if (isLondonChart && predictedLondon15mKlines.length > 0) {
            // 清理已经被真实K线覆盖的预测数据
            const beforeClean = predictedLondon15mKlines.length;
            predictedLondon15mKlines = predictedLondon15mKlines.filter(pred => pred.t > lastRealTimestamp);
            predictedKlines = predictedLondon15mKlines;
            console.log('[K线预测] 清理后，伦敦15分钟预测K线剩余:', predictedKlines.length, '(清理前:', beforeClean, ')');
            
            // 如果预测数据少于设定值，自动触发新的预测
            if (predictedKlines.length < PREDICTION_CONFIG.minPricePointsForRetrigger15m && beforeClean > 0) {
                console.log(`[K线预测] ⚠️ 15分钟预测数据不足${PREDICTION_CONFIG.minPricePointsForRetrigger15m}根，将自动触发新预测`);
                setTimeout(() => {
                    console.log('[K线预测] 自动触发预测更新...');
                    predictKlinesInBackground();
                }, 1000);
            }
        } else if (isDomesticChart && predictedDomestic15mKlines.length > 0) {
            // 清理已经被真实K线覆盖的预测数据
            const beforeClean = predictedDomestic15mKlines.length;
            predictedDomestic15mKlines = predictedDomestic15mKlines.filter(pred => pred.t > lastRealTimestamp);
            predictedKlines = predictedDomestic15mKlines;
            console.log('[K线预测] 清理后，国内15分钟预测K线剩余:', predictedKlines.length, '(清理前:', beforeClean, ')');
            
            // 如果预测数据少于设定值，自动触发新的预测
            if (predictedKlines.length < PREDICTION_CONFIG.minPricePointsForRetrigger15m && beforeClean > 0) {
                console.log(`[K线预测] ⚠️ 15分钟预测数据不足${PREDICTION_CONFIG.minPricePointsForRetrigger15m}根，将自动触发新预测`);
                setTimeout(() => {
                    console.log('[K线预测] 自动触发预测更新...');
                    predictKlinesInBackground();
                }, 1000);
            }
        }
    }
    
    // 计算布林带
    const bollingerBands = calculateBollingerBands(sortedData, 20, 2);
    
    // 为预测K线添加null值（布林带不显示预测部分）
    // 注意：这里需要在validPredictedKlines计算之后才能确定长度
    // 所以先声明，稍后再填充
    
    // 验证并修正布林带数据（确保上轨 > 下轨）
    if (sortedData.length > 0) {
        for (let i = 0; i < bollingerBands.upper.length; i++) {
            if (bollingerBands.upper[i] !== null && bollingerBands.lower[i] !== null) {
                const upper = bollingerBands.upper[i];
                const lower = bollingerBands.lower[i];
                if (upper < lower) {
                    console.warn(`[布林带] 索引 ${i}: 上轨(${upper}) < 下轨(${lower})，交换值`);
                    // 交换上下轨
                    bollingerBands.upper[i] = lower;
                    bollingerBands.lower[i] = upper;
                }
            }
        }
    }
    
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

    // 更新交易策略（如果有完整数据），但避免循环调用
    if (!skipTradingStrategyUpdate) {
        updateTradingStrategy();
    }

    // 准备预测K线数据（完整的OHLC数据，显示为蜡烛图）
    // 先完全验证并转换预测K线数据
    const finalPredictedKlines = [];
    const finalPredictedPrices = [];
    const finalPredictedKlineData = [];
    
    for (const item of predictedKlines) {
        // 验证每一项
        if (!item || 
            typeof item.o !== 'number' || isNaN(item.o) || item.o <= 0 ||
            typeof item.c !== 'number' || isNaN(item.c) || item.c <= 0 ||
            typeof item.h !== 'number' || isNaN(item.h) || item.h <= 0 ||
            typeof item.l !== 'number' || isNaN(item.l) || item.l <= 0) {
            console.warn('[预测K线验证] 跳过无效数据:', item);
            continue;
        }
        
        // 构造OHLC数组
        const ohlc = [
            parseFloat(item.o),
            parseFloat(item.c),
            parseFloat(item.l),
            parseFloat(item.h)
        ];
        
        // 确保OHLC数组有效
        if (ohlc.some(v => isNaN(v) || v <= 0)) {
            console.warn('[预测K线验证] OHLC包含无效值:', ohlc);
            continue;
        }
        
        // 通过验证，添加到最终数组
        finalPredictedKlines.push(item);
        finalPredictedKlineData.push(ohlc);
        finalPredictedPrices.push(parseFloat(item.c));
    }
    
    if (predictedKlines.length > 0) {
        console.log(`[预测K线验证] 原始${predictedKlines.length}个，有效${finalPredictedKlines.length}个`);
        if (finalPredictedKlines.length > 0) {
            console.log(`[预测K线验证] 时间范围: ${new Date(finalPredictedKlines[0].t).toLocaleTimeString()} - ${new Date(finalPredictedKlines[finalPredictedKlines.length - 1].t).toLocaleTimeString()}`);
        }
    }
    
    // 为预测K线添加null值到布林带（布林带不显示预测部分）
    if (finalPredictedKlines.length > 0) {
        const nullValues = new Array(finalPredictedKlines.length).fill(null);
        bollingerBands.upper = [...bollingerBands.upper, ...nullValues];
        bollingerBands.middle = [...bollingerBands.middle, ...nullValues];
        bollingerBands.lower = [...bollingerBands.lower, ...nullValues];
    }
    
    // 准备K线数据（真实K线）
    let klineData = sortedData.map(item => [
        item.o, // 开盘价
        item.c, // 收盘价
        item.l, // 最低价
        item.h  // 最高价
    ]);
    
    // 为预测K线位置添加null值，使K线数据长度与时间轴一致
    if (finalPredictedKlines.length > 0) {
        for (let i = 0; i < finalPredictedKlines.length; i++) {
            klineData.push(null); // 填充null，ECharts不会显示这些位置的K线
        }
    }
    
    // 使用最终验证后的数据
    const predictedKlineData = finalPredictedKlineData;
    const predictedPrices = finalPredictedPrices;
    
    // 注意：成交量显示已移至进度条，不再需要单独的成交量系列
    
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
        // 判断是否是90日K线图表（通过infoElementId判断）
        const isDailyChart = infoElementId.includes('daily');
        
        if (isDailyChart) {
            // 90日K线：显示月-日格式（如"01-15"）
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            return `${month}-${day}`;
        } else if (sortedData.length > 50) {
            // 数据点多，只显示时分
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        } else {
            // 数据点少，显示月日时分
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${month}-${day} ${hours}:${minutes}`;
        }
    });
    
    // 准备预测K线的时间数据（使用finalPredictedKlines）
    const predictedTimeData = finalPredictedKlines.map(item => {
        const date = new Date(item.t);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`; // 预测K线只显示时:分
    });
    
    // 合并时间数据（真实 + 预测）
    const allTimeData = [...timeData, ...predictedTimeData];
    
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
    
    // 如果是国内白银1分钟K线图，添加价格建议标记（开仓价、止损价、止盈价）
    // 已隐藏：图表左上角的白色价格建议tab
    /*
    if (!infoElementId.includes('daily') && !infoElementId.includes('15m') && infoElementId.includes('domestic') && lastPriceAdvice.entryPrice) {
        const formatPrice = (price) => {
            if (isLondon) {
                return price.toFixed(3);
            } else {
                return Math.round(price).toString();
            }
        };
        
        // 在图表左上角显示价格建议（仅国内白银）
        let priceText = '';
        if (lastPriceAdvice.entryPrice) {
            priceText += `开仓: ${formatPrice(lastPriceAdvice.entryPrice)}\n`;
        }
        if (lastPriceAdvice.stopLoss) {
            priceText += `止损: ${formatPrice(lastPriceAdvice.stopLoss)}\n`;
        }
        if (lastPriceAdvice.takeProfit) {
            priceText += `止盈: ${formatPrice(lastPriceAdvice.takeProfit)}`;
        }
        
        if (priceText) {
            graphic.push({
                type: 'text',
                left: 10,
                top: 10,
                z: 100,
                style: {
                    text: priceText,
                    fill: '#ffffff',
                    fontSize: 12,
                    fontWeight: 600,
                    textAlign: 'left',
                    textVerticalAlign: 'top',
                    backgroundColor: 'rgba(19, 23, 43, 0.9)',
                    borderColor: '#1e2548',
                    borderWidth: 1,
                    padding: [8, 12],
                    borderRadius: 4
                }
            });
        }
    }
    */
    
    // 暂时移除价格通道线（markLine和markArea）以排查问题
    // TODO: 待图表刷新正常后，再考虑是否恢复
    
    // 准备价格标记线（开仓价、止损价、止盈价，只在国内白银1分钟K线图上显示）
    let priceMarkLines = [];
    // 只在国内白银的1分钟K线图上显示，不在伦敦图表、15分钟和90日K线图上显示
    if (!infoElementId.includes('daily') && !infoElementId.includes('15m') && infoElementId.includes('domestic')) {
        console.log('[价格标记线] 准备标记线（仅国内白银），infoElementId:', infoElementId);
        console.log('[价格标记线] lastPriceAdvice:', JSON.stringify(lastPriceAdvice));
        console.log('[价格标记线] entryPrice:', lastPriceAdvice.entryPrice, 'stopLoss:', lastPriceAdvice.stopLoss, 'takeProfit:', lastPriceAdvice.takeProfit);
        
        const formatPrice = (price) => {
            if (isLondon) {
                return price.toFixed(3);
            } else {
                return Math.round(price).toString();
            }
        };
        
        // 开仓价标记线（黄色）
        if (lastPriceAdvice.entryPrice) {
            const entryPrice = lastPriceAdvice.entryPrice;
            console.log('[价格标记线] 添加开仓价标记线:', entryPrice);
            priceMarkLines.push({
                yAxis: entryPrice,
                label: {
                    show: true,
                    position: 'start',
                    distance: 10,
                    formatter: `${formatPrice(entryPrice)}`,
                    color: '#ffffff',
                    backgroundColor: '#fbbf24',
                    borderColor: '#fbbf24',
                    borderWidth: 1,
                    padding: [4, 8],
                    borderRadius: 3,
                    fontSize: 12,
                    fontWeight: 600
                },
                lineStyle: {
                    color: '#fbbf24', // 黄色，表示开仓价
                    width: 2,
                    type: 'dashed'
                }
            });
        }
        
        // 止损价标记线（绿色）
        if (lastPriceAdvice.stopLoss) {
            const stopLoss = lastPriceAdvice.stopLoss;
            console.log('[价格标记线] 添加止损价标记线:', stopLoss);
            priceMarkLines.push({
                yAxis: stopLoss,
                label: {
                    show: true,
                    position: 'start',
                    distance: 10,
                    formatter: `${formatPrice(stopLoss)}`,
                    color: '#ffffff',
                    backgroundColor: '#4ade80',
                    borderColor: '#4ade80',
                    borderWidth: 1,
                    padding: [4, 8],
                    borderRadius: 3,
                    fontSize: 12,
                    fontWeight: 600
                },
                lineStyle: {
                    color: '#4ade80', // 绿色，表示止损价
                    width: 2,
                    type: 'dashed'
                }
            });
        }
        
        // 止盈价标记线（红色）
        if (lastPriceAdvice.takeProfit) {
            const takeProfit = lastPriceAdvice.takeProfit;
            console.log('[价格标记线] 添加止盈价标记线:', takeProfit);
            priceMarkLines.push({
                yAxis: takeProfit,
                label: {
                    show: true,
                    position: 'start',
                    distance: 10,
                    formatter: `${formatPrice(takeProfit)}`,
                    color: '#ffffff',
                    backgroundColor: '#ef4444',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    padding: [4, 8],
                    borderRadius: 3,
                    fontSize: 12,
                    fontWeight: 600
                },
                lineStyle: {
                    color: '#ef4444', // 红色，表示止盈价
                    width: 2,
                    type: 'dashed'
                }
            });
        }
        
        console.log('[价格标记线] ✅ 总共添加了', priceMarkLines.length, '条标记线');
    } else {
        if (!infoElementId.includes('daily') && !infoElementId.includes('15m') && infoElementId.includes('domestic')) {
            console.log('[价格标记线] ⚠️ 没有价格建议数据，标记线为空');
        }
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
                            // 添加成交量信息（从sortedData中获取）
                            const dataIndex = item.dataIndex;
                            if (dataIndex !== undefined && sortedData && sortedData[dataIndex]) {
                                const volume = sortedData[dataIndex].v || 0;
                                let volumeText = '';
                                if (volume >= 1000000) {
                                    volumeText = (volume / 1000000).toFixed(2) + 'M';
                                } else if (volume >= 1000) {
                                    volumeText = (volume / 1000).toFixed(2) + 'K';
                                } else {
                                    volumeText = volume.toString();
                                }
                                result += '成交量: <span style="color:#ffffff;font-weight:600;">' + volumeText + '</span><br/>';
                            }
                        }
                    } else if (item.seriesType === 'bar') {
                        // 成交量柱状图
                        const volumeValue = typeof item.value === 'object' ? (item.value.value || item.value) : item.value;
                        if (volumeValue !== null && volumeValue !== undefined) {
                            result += '<span style="display:inline-block;margin-right:5px;border-radius:2px;width:10px;height:10px;background-color:' + (item.color || '#9ca3af') + ';"></span>';
                            result += '<span style="color:#9ca3af;">成交量</span>: ';
                            // 格式化成交量显示
                            let volumeText = '';
                            if (volumeValue >= 1000000) {
                                volumeText = (volumeValue / 1000000).toFixed(2) + 'M';
                            } else if (volumeValue >= 1000) {
                                volumeText = (volumeValue / 1000).toFixed(2) + 'K';
                            } else {
                                volumeText = volumeValue.toString();
                            }
                            result += '<span style="color:#ffffff;font-weight:600;">' + volumeText + '</span><br/>';
                        }
                    } else if (item.seriesType === 'line') {
                        // 其他线条（布林带、预测价格等）
                        let value = item.value;
                        
                        // 如果value是数组（如预测价格是[x, y]格式），取第二个值（价格）
                        if (Array.isArray(value)) {
                            value = value[1];
                        }
                        
                        if (value !== null && value !== undefined && !isNaN(value)) {
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
                
                // 添加价格建议信息（只在1分钟K线图上显示，不包括15分钟和90日K线）
                if (!infoElementId.includes('daily') && !infoElementId.includes('15m')) {
                    let priceAdviceAdded = false;
                    
                    // 开仓价
                    if (lastPriceAdvice.entryPrice) {
                        if (!priceAdviceAdded) {
                            result += '<br/><span style="color:#9ca3af;font-size:11px;">━━━━━━━━━━━━━━</span><br/>';
                            priceAdviceAdded = true;
                        }
                        const formatPrice = isLondonChart ? lastPriceAdvice.entryPrice.toFixed(3) : Math.round(lastPriceAdvice.entryPrice).toString();
                        result += '<span style="display:inline-block;margin-right:5px;border-radius:2px;width:10px;height:10px;background-color:#fbbf24;"></span>';
                        result += '<span style="color:#fbbf24;">开仓价</span>: ';
                        result += '<span style="color:#ffffff;font-weight:600;">' + formatPrice + '</span><br/>';
                    }
                    
                    // 止损价
                    if (lastPriceAdvice.stopLoss) {
                        if (!priceAdviceAdded) {
                            result += '<br/><span style="color:#9ca3af;font-size:11px;">━━━━━━━━━━━━━━</span><br/>';
                            priceAdviceAdded = true;
                        }
                        const formatPrice = isLondonChart ? lastPriceAdvice.stopLoss.toFixed(3) : Math.round(lastPriceAdvice.stopLoss).toString();
                        result += '<span style="display:inline-block;margin-right:5px;border-radius:2px;width:10px;height:10px;background-color:#4ade80;"></span>';
                        result += '<span style="color:#4ade80;">止损价</span>: ';
                        result += '<span style="color:#ffffff;font-weight:600;">' + formatPrice + '</span><br/>';
                    }
                    
                    // 止盈价
                    if (lastPriceAdvice.takeProfit) {
                        if (!priceAdviceAdded) {
                            result += '<br/><span style="color:#9ca3af;font-size:11px;">━━━━━━━━━━━━━━</span><br/>';
                            priceAdviceAdded = true;
                        }
                        const formatPrice = isLondonChart ? lastPriceAdvice.takeProfit.toFixed(3) : Math.round(lastPriceAdvice.takeProfit).toString();
                        result += '<span style="display:inline-block;margin-right:5px;border-radius:2px;width:10px;height:10px;background-color:#ef4444;"></span>';
                        result += '<span style="color:#ef4444;">止盈价</span>: ';
                        result += '<span style="color:#ffffff;font-weight:600;">' + formatPrice + '</span><br/>';
                    }
                }
                
                return result;
            }
        },
        grid: [
            // K线图grid（占据绝大部分空间，下方留出空间给滑动条）
            {
                left: '5%',
                right: '10%',
                top: '6%',
                height: '82%',
                bottom: '12%', // 为滑动条留出空间
                containLabel: true
            }
        ],
        xAxis: [
            // K线图X轴（包含真实K线+预测K线的时间）
            {
                type: 'category',
                data: allTimeData,
                gridIndex: 0,
                boundaryGap: false,
                show: true // 显示X轴标签
            }
        ],
        yAxis: [
            // K线图Y轴（价格）
            {
                type: 'value',
                scale: false,
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
                        // 对于伦敦白银，显示3位小数；对于国内白银，显示整数
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
                splitNumber: isLondon ? 6 : 5
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
                // 添加价格标记线（开仓价、止损价、止盈价）
                markLine: priceMarkLines.length > 0 ? {
                    data: priceMarkLines,
                    silent: false,
                    symbol: 'none'
                } : undefined
            },
            // 预测K线蜡烛图（15分钟K线图使用）
            ...(is15mChart && predictedKlineData.length > 0 ? [{
                name: '预测K线',
                type: 'candlestick',
                data: (() => {
                    // 验证并准备数据
                    const validData = predictedKlineData.filter(item => {
                        // 最后验证：确保每个OHLC数据都是有效的
                        if (!Array.isArray(item) || item.length !== 4) {
                            console.warn('[预测K线] 跳过非法数据格式:', item);
                            return false;
                        }
                        const isValid = item.every(v => v !== null && v !== undefined && !isNaN(v) && v > 0);
                        if (!isValid) {
                            console.warn('[预测K线] 跳过包含无效值的数据:', item);
                        }
                        return isValid;
                    });
                    
                    // 构建完整长度的数组：前面填null，后面是预测K线
                    // 确保数组总长度 = sortedData.length + validData.length
                    const result = [];
                    
                    // 前面填充sortedData.length个null（占位真实K线位置）
                    for (let i = 0; i < sortedData.length; i++) {
                        result.push(null);
                    }
                    
                    // 后面添加预测K线数据
                    validData.forEach(item => {
                        result.push(item);
                    });
                    
                    console.log(`[预测K线series] 构建数据: ${sortedData.length}个null + ${validData.length}个预测K线 = ${result.length}个（期望长度=${sortedData.length + validData.length}）`);
                    
                    // 再次检查长度
                    if (result.length !== sortedData.length + validData.length) {
                        console.error('[预测K线series] 数据长度错误!', {
                            actualLength: result.length,
                            expectedLength: sortedData.length + validData.length
                        });
                    }
                    
                    return result;
                })(),
                xAxisIndex: 0,
                yAxisIndex: 0,
                itemStyle: {
                    color: 'rgba(239, 68, 68, 0.5)', // 上涨颜色（半透明红色）
                    color0: 'rgba(74, 222, 128, 0.5)', // 下跌颜色（半透明绿色）
                    borderColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor0: 'rgba(74, 222, 128, 0.7)',
                    borderWidth: 1
                },
                emphasis: {
                    itemStyle: {
                        color: 'rgba(239, 68, 68, 0.7)',
                        color0: 'rgba(74, 222, 128, 0.7)',
                        borderColor: 'rgba(239, 68, 68, 0.9)',
                        borderColor0: 'rgba(74, 222, 128, 0.9)',
                        borderWidth: 2
                    }
                },
                z: 5
            }] : []),
            // 预测价格线（1分钟K线图使用，实线连接显示）
            ...(is1mChart && predictedPrices.length > 0 ? [{
                name: '预测价格',
                type: 'line',
                data: (() => {
                    const result = [];
                    predictedPrices.forEach((price, index) => {
                        // 再次验证：确保价格是有效数字
                        if (price !== null && price !== undefined && !isNaN(price) && price > 0) {
                            result.push([sortedData.length + index, price]); // [x轴索引, 价格]
                        } else {
                            console.warn('[预测价格线] 跳过无效价格:', price, 'index:', index);
                        }
                    });
                    return result;
                })(),
                xAxisIndex: 0,
                yAxisIndex: 0,
                smooth: false,  // 不平滑，直线连接
                showSymbol: false,  // 不显示数据点
                connectNulls: false, // 不连接null值
                lineStyle: {
                    color: 'rgba(156, 163, 175, 0.9)',
                    width: 2,
                    type: 'solid'  // 实线样式
                },
                emphasis: {
                    lineStyle: {
                        color: 'rgba(156, 163, 175, 1)',
                        width: 3
                    }
                },
                z: 10
            }] : []),
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
                smooth: false,
                endLabel: {
                    show: true,
                    formatter: function(params) {
                        const value = params.value;
                        if (value !== null && value !== undefined) {
                            // 根据市场类型格式化数值
                            return isLondon ? value.toFixed(3) : Math.round(value).toString();
                        }
                        return '';
                    },
                    color: '#60a5fa',
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: 'rgba(96, 165, 250, 0.15)',
                    borderColor: '#60a5fa',
                    borderWidth: 1,
                    borderRadius: 3,
                    padding: [2, 6],
                    distance: 5
                }
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
                smooth: false,
                endLabel: {
                    show: true,
                    formatter: function(params) {
                        const value = params.value;
                        if (value !== null && value !== undefined) {
                            // 根据市场类型格式化数值
                            return isLondon ? value.toFixed(3) : Math.round(value).toString();
                        }
                        return '';
                    },
                    color: '#a78bfa',
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: 'rgba(167, 139, 250, 0.15)',
                    borderColor: '#a78bfa',
                    borderWidth: 1,
                    borderRadius: 3,
                    padding: [2, 6],
                    distance: 5
                }
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
                smooth: false,
                endLabel: {
                    show: true,
                    formatter: function(params) {
                        const value = params.value;
                        if (value !== null && value !== undefined) {
                            // 根据市场类型格式化数值
                            return isLondon ? value.toFixed(3) : Math.round(value).toString();
                        }
                        return '';
                    },
                    color: '#60a5fa',
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: 'rgba(96, 165, 250, 0.15)',
                    borderColor: '#60a5fa',
                    borderWidth: 1,
                    borderRadius: 3,
                    padding: [2, 6],
                    distance: 5
                }
            }
        ]
    };
    
    // 1分钟K线图表不使用dataZoom，显示所有数据点
    // 如果需要查看历史数据，可以使用鼠标滚轮缩放或者框选缩放
    if (!infoElementId.includes('daily')) {
        // 获取当前图表的dataZoom状态，如果存在的话
        let currentStart = 0;
        let currentEnd = 100;
        
        try {
            const currentOption = chart.getOption();
            if (currentOption && currentOption.dataZoom && currentOption.dataZoom.length > 0) {
                // 保留当前的缩放状态
                currentStart = currentOption.dataZoom[0].start || 0;
                currentEnd = currentOption.dataZoom[0].end || 100;
                console.log(`[DataZoom] 保持当前缩放状态: start=${currentStart}, end=${currentEnd}`);
            }
        } catch (e) {
            console.warn('[DataZoom] 获取当前缩放状态失败，使用默认值:', e);
        }
        
        // 添加dataZoom组件：inside（鼠标滚轮）+ slider（滑动条，显示成交量）
        option.dataZoom = [
            {
                type: 'inside',
                xAxisIndex: [0], // 只控制K线图的X轴
                start: currentStart, // 保持当前缩放状态
                end: currentEnd,
                zoomOnMouseWheel: true, // 允许鼠标滚轮缩放
                moveOnMouseMove: false, // 按住鼠标移动时平移
                moveOnMouseWheel: false // 不使用滚轮平移
            },
            {
                type: 'slider',
                xAxisIndex: [0], // 只控制K线图的X轴
                start: currentStart, // 保持当前缩放状态
                end: currentEnd,
                bottom: '2%', // 滑动条位置
                height: 50, // 滑动条高度（增加以显示成交量）
                handleSize: '100%', // 手柄大小
                handleStyle: {
                    color: '#667eea',
                    borderColor: '#667eea'
                },
                textStyle: {
                    color: '#9ca3af',
                    fontSize: 11
                },
                borderColor: '#1e2548',
                fillerColor: 'rgba(102, 126, 234, 0.15)',
                backgroundColor: '#13172b',
                // 在滑动条中显示成交量数据
                dataBackground: {
                    lineStyle: {
                        color: '#667eea',
                        width: 1
                    },
                    areaStyle: {
                        color: 'rgba(102, 126, 234, 0.25)'
                    }
                },
                selectedDataBackground: {
                    lineStyle: {
                        color: '#667eea',
                        width: 1.5
                    },
                    areaStyle: {
                        color: 'rgba(102, 126, 234, 0.4)'
                    }
                },
                moveHandleSize: 5,
                emphasis: {
                    handleStyle: {
                        borderColor: '#764ba2',
                        color: '#764ba2'
                    }
                },
                // 显示成交量数据
                show: true,
                showDetail: true,
                showDataShadow: true,
                realtime: true,
                filterMode: 'filter'
            }
        ];
        
        console.log(`[DataZoom] 1分钟K线 - 总数据: ${allTimeData.length}, 缩放状态: ${currentStart}% - ${currentEnd}%`);
    }
    
    // 最终数据验证：确保所有数组长度一致
    const expectedLength = allTimeData.length;
    if (bollingerBands.upper.length !== expectedLength || 
        bollingerBands.middle.length !== expectedLength || 
        bollingerBands.lower.length !== expectedLength) {
        console.error('[图表更新] 数据长度不一致!', {
            expectedLength,
            upperLength: bollingerBands.upper.length,
            middleLength: bollingerBands.middle.length,
            lowerLength: bollingerBands.lower.length
        });
        // 调整布林带数组长度
        while (bollingerBands.upper.length < expectedLength) bollingerBands.upper.push(null);
        while (bollingerBands.middle.length < expectedLength) bollingerBands.middle.push(null);
        while (bollingerBands.lower.length < expectedLength) bollingerBands.lower.push(null);
    }
    
    // 清理布林带数据中的无效值，转换为标准格式
    bollingerBands.upper = bollingerBands.upper.map(v => {
        if (v === null || v === undefined || isNaN(v)) return null;
        const num = parseFloat(v);
        return isNaN(num) ? null : num;
    });
    bollingerBands.middle = bollingerBands.middle.map(v => {
        if (v === null || v === undefined || isNaN(v)) return null;
        const num = parseFloat(v);
        return isNaN(num) ? null : num;
    });
    bollingerBands.lower = bollingerBands.lower.map(v => {
        if (v === null || v === undefined || isNaN(v)) return null;
        const num = parseFloat(v);
        return isNaN(num) ? null : num;
    });
    
    // 使用try-catch保护setOption调用，防止数据问题导致崩溃
    try {
        chart.setOption(option);
        console.log(`[图表更新] 完成更新: ${infoElementId}`);
    } catch (setOptionError) {
        console.error(`[图表更新] setOption失败 ${infoElementId}:`, setOptionError);
        console.error('[图表更新] 错误详情:', {
            message: setOptionError.message,
            stack: setOptionError.stack
        });
        // 尝试输出导致问题的数据结构
        console.error('[图表更新] 问题数据:', {
            expectedLength,
            klineDataLength: klineData.length,
            predictedKlineDataLength: predictedKlineData.length,
            predictedPricesLength: predictedPrices.length,
            allTimeDataLength: allTimeData.length,
            bollingerUpperLength: bollingerBands.upper.length,
            bollingerMiddleLength: bollingerBands.middle.length,
            bollingerLowerLength: bollingerBands.lower.length,
            // 检查数据中是否有null
            hasNullInUpper: bollingerBands.upper.some(v => v === null),
            hasNullInMiddle: bollingerBands.middle.some(v => v === null),
            hasNullInLower: bollingerBands.lower.some(v => v === null),
            // 检查预测数据
            predictedPricesHasNull: predictedPrices.some(v => v === null || v === undefined || isNaN(v)),
            predictedKlineDataSample: predictedKlineData.length > 0 ? predictedKlineData[0] : null
        });
        // 尝试输出前几个预测价格
        if (predictedPrices.length > 0) {
            console.error('[图表更新] 预测价格示例（前3个）:', predictedPrices.slice(0, 3));
        }
        // 不要抛出错误，让程序继续运行
        return;
    }
    
    // 如果有价格标记线，确保它们被正确应用（仅国内白银）
    if (priceMarkLines.length > 0 && !infoElementId.includes('daily') && !infoElementId.includes('15m') && infoElementId.includes('domestic')) {
        try {
            console.log('[价格标记线] 应用标记线到图表（仅国内白银），数量:', priceMarkLines.length);
            
            // priceMarkLines已经是正确的格式（包含yAxis, label, lineStyle）
            // 直接应用即可
            chart.setOption({
                series: [{
                    markLine: {
                        data: priceMarkLines,
                        silent: false,
                        symbol: 'none'
                    }
                }],
                notMerge: false
            });
            
            console.log('[价格标记线] 标记线已成功应用');
        } catch (error) {
            console.error('[价格标记线] 应用标记线失败:', error);
            console.error('[价格标记线] 标记线配置:', priceMarkLines);
        }
    }
    
    // 不再需要dataZoom事件监听器，因为1分钟K线图显示所有数据
}

// 更新X轴标签间隔（根据滑动条缩放状态）
function updateXAxisInterval(chart, infoElementId) {
    // 分钟K线图不显示X轴标签，不需要更新
    if (!chart || !infoElementId.includes('daily')) {
        return;
    }
    
    try {
        // 获取图表当前的数据
        const option = chart.getOption();
        if (!option || !option.xAxis || !option.xAxis[0] || !option.xAxis[0].data) {
            return;
        }
        
        const timeData = option.xAxis[0].data;
        if (!timeData || timeData.length === 0) {
            return;
        }
        
        const dataZoomId = infoElementId.includes('london') ? 'london' : 'domestic';
        const zoomState = dataZoomState[dataZoomId];
        
        // 计算当前显示的数据点范围
        const totalDataCount = timeData.length;
        const visibleDataCount = Math.max(1, Math.floor(totalDataCount * (zoomState.end - zoomState.start) / 100));
        const startIndex = Math.max(0, Math.floor(totalDataCount * zoomState.start / 100));
        const endIndex = Math.min(totalDataCount - 1, startIndex + visibleDataCount - 1);
        
        // 确保endIndex >= startIndex
        if (endIndex < startIndex) {
            return;
        }
        
        // 更新X轴标签间隔（90日K线图：每50根显示一个，同时确保最后一根显示）
        chart.setOption({
            xAxis: [{
                axisLabel: {
                    interval: function(index, value) {
                        // 如果索引不在可见范围内，不显示
                        if (index < startIndex || index > endIndex) {
                            return true; // 跳过
                        }
                        
                        // 最后一根K线始终显示
                        if (index === timeData.length - 1) {
                            return false; // 显示
                        }
                        
                        // 每50根显示一个（返回false表示显示，返回true表示跳过）
                        if (index % 50 === 0) {
                            return false; // 显示
                        }
                        return true; // 跳过
                    }
                }
            }]
        }, false); // false表示不合并，直接替换
    } catch (error) {
        console.warn('[updateXAxisInterval] 更新X轴标签间隔失败:', error);
    }
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

// K线WebSocket更新处理函数
let lastKlineWSUpdate = 0;
const KLINE_WS_UPDATE_INTERVAL = 1000; // K线WebSocket更新最小间隔（1秒）

function handleLondonKlineUpdate(klineData) {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastKlineWSUpdate;
    
    // 节流：避免过于频繁的更新
    if (timeSinceLastUpdate < KLINE_WS_UPDATE_INTERVAL) {
        return;
    }
    
    console.log('[WebSocket K线] 🔔 收到K线推送，触发刷新');
    lastKlineWSUpdate = now;
    
    // 立即触发K线数据刷新
    updateAllData();
}

// 国内K线WebSocket更新处理
let lastDomesticKlineWSUpdate = 0;
const DOMESTIC_KLINE_WS_UPDATE_INTERVAL = 500; // 国内K线WebSocket更新间隔（0.5秒）

function handleDomesticKlineUpdate(message) {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastDomesticKlineWSUpdate;
    
    // 节流
    if (timeSinceLastUpdate < DOMESTIC_KLINE_WS_UPDATE_INTERVAL) {
        return;
    }
    
    console.log('[国内WebSocket] 🔔 收到K线更新，触发刷新');
    lastDomesticKlineWSUpdate = now;
    
    // 立即触发K线数据刷新
    updateAllData();
}

// 国内行情WebSocket更新处理
function handleDomesticQuoteUpdate(message) {
    if (message.data && message.data.last_price) {
        const tickData = {
            price: message.data.last_price,
            volume: message.data.volume || 0,
            tick_time: Date.now()
        };
        updateDomesticTradeTick(tickData);
    }
}

// 初始化WebSocket连接（用于实时订阅最新成交价和K线）
function connectAllTickWebSocket() {
    // 国内白银WebSocket（连接后端TqSdk数据流）
    if (domesticWS) {
        domesticWS.disconnect();
    }
    
    domesticWS = new DomesticWebSocket(
        (message) => {
            handleDomesticKlineUpdate(message);
        },
        (message) => {
            handleDomesticQuoteUpdate(message);
        }
    );
    domesticWS.connect();
    console.log('[WebSocket初始化] 国内白银WebSocket已创建并连接');
    
    // 伦敦白银WebSocket（使用AllTick）
    if (londonWS) {
        londonWS.disconnect();
    }
    
    londonWS = new AllTickWebSocket(
        API_CONFIG.londonSymbol,
        (tickData) => {
            updateLondonTradeTick(tickData);
        },
        (klineData) => {
            handleLondonKlineUpdate(klineData);
        }
    );
    londonWS.connect();
    console.log('[WebSocket初始化] 伦敦白银WebSocket已创建并连接，Symbol:', API_CONFIG.londonSymbol);
    console.log('[WebSocket初始化] 已订阅：国内TqSdk数据流 + 伦敦AllTick数据流');
}

// 更新所有数据
// 保存上一次的K线数据，用于检查更新
let lastDomesticKlineData = null;
let lastLondonKlineData = null;

// 请求节流控制
let isUpdating = false; // 是否正在更新
let pendingUpdate = false; // 是否有待处理的更新请求
let lastUpdateTime = 0; // 上次更新时间
const MIN_UPDATE_INTERVAL = 200; // 最小更新间隔（毫秒），降低以支持WebSocket快速触发
let domesticDataLoaded = false; // 标记国内数据是否已加载过（非交易时间首次加载后不再刷新）

// 缓存国内各时间周期的K线数据
let currentDomestic15mKlineData = null;
let currentDomesticDailyKlineData = null;

async function updateAllData() {
    // 如果正在更新，标记为有待处理的请求，然后返回
    if (isUpdating) {
        pendingUpdate = true;
        if (Math.random() < 0.1) {
            console.log('[请求节流] 正在更新中，跳过本次请求');
        }
        return;
    }
    
    // 检查距离上次更新的时间间隔
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;
    if (timeSinceLastUpdate < MIN_UPDATE_INTERVAL) {
        pendingUpdate = true;
        if (Math.random() < 0.1) {
            console.log(`[请求节流] 距离上次更新仅${timeSinceLastUpdate}ms，跳过本次请求`);
        }
        return;
    }
    
    isUpdating = true;
    pendingUpdate = false;
    lastUpdateTime = now;
    
    updateStatus('connecting');
    
    try {
        // 检查国内是否在交易时间
        const isDomesticTrading = isDomesticTradingTime();
        
        // 准备请求数组
        let promises = [];
        let requestDomesticData = false;
        
        // 判断是否需要请求国内数据：交易时间内 或 首次加载
        if (isDomesticTrading || !domesticDataLoaded) {
            requestDomesticData = true;
            promises = [
                fetchKlineData(API_CONFIG.domesticSymbol), // 国内1分钟K线
                fetchKlineData(API_CONFIG.londonSymbol), // 伦敦1分钟K线
                fetchKlineData(API_CONFIG.londonSymbol, '15m', 100), // 伦敦15分钟K线数据（100根）
                fetchKlineData(API_CONFIG.domesticSymbol, '15m', 100), // 国内15分钟K线数据（100根）
                fetchKlineData(API_CONFIG.londonSymbol, '1d', 90), // 伦敦90日K线数据
                fetchKlineData(API_CONFIG.domesticSymbol, '1d', 90) // 国内90日K线数据
            ];
            if (!domesticDataLoaded) {
                console.log('[K线刷新] 首次加载，获取国内K线数据');
            }
        } else {
            // 非交易时间且已加载过，只更新伦敦数据
            promises = [
                null, // 占位，不请求国内1分钟K线
                fetchKlineData(API_CONFIG.londonSymbol), // 伦敦1分钟K线
                fetchKlineData(API_CONFIG.londonSymbol, '15m', 100), // 伦敦15分钟K线数据（100根）
                null, // 占位，不请求国内15分钟K线
                fetchKlineData(API_CONFIG.londonSymbol, '1d', 90), // 伦敦90日K线数据
                null // 占位，不请求国内90日K线
            ];
            if (Math.random() < 0.05) {
                console.log('[K线刷新] 国内休市，跳过国内K线请求');
            }
        }
        
        const [domesticKlineData, londonKlineData, london15mKlineData, domestic15mKlineData, londonDailyKlineData, domesticDailyKlineData] = await Promise.all(promises);
        
        // 检查国内市场数据是否有更新
        if (domesticKlineData && domesticKlineData.length > 0) {
            if (lastDomesticKlineData && lastDomesticKlineData.length > 0) {
                // 比较最新的K线数据
                const lastKline = lastDomesticKlineData[lastDomesticKlineData.length - 1];
                const currentKline = domesticKlineData[domesticKlineData.length - 1];
                
                const lastTimestamp = lastKline.t || lastKline.time || 0;
                const currentTimestamp = currentKline.t || currentKline.time || 0;
                const lastClose = lastKline.c || lastKline.close || 0;
                const currentClose = currentKline.c || currentKline.close || 0;
                
                // 转换时间戳为可读时间
                const formatTime = (ts) => {
                    const timestampMs = ts < 10000000000 ? ts * 1000 : ts;
                    const date = new Date(timestampMs);
                    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
                };
                
                if (currentTimestamp !== lastTimestamp || currentClose !== lastClose) {
                    console.log(`[数据更新] ✓ 国内市场数据已更新:`);
                    console.log(`    时间: ${formatTime(lastTimestamp)} -> ${formatTime(currentTimestamp)}`);
                    console.log(`    收盘价: ${lastClose} -> ${currentClose}`);
                    console.log(`    数据条数: ${lastDomesticKlineData.length} -> ${domesticKlineData.length}`);
                    
                    // 计算时间差
                    const timeDiff = currentTimestamp - lastTimestamp;
                    const timeDiffSeconds = Math.floor(timeDiff / 1000);
                    if (timeDiffSeconds > 120) {
                        console.warn(`[数据更新] ⚠️ 时间差过大: ${timeDiffSeconds}秒，数据可能延迟！`);
                    }
                } else {
                    console.log(`[数据更新] - 国内市场数据未变化 (时间: ${formatTime(currentTimestamp)}, 收盘价: ${currentClose})`);
                    // 检查是否因为市场休市
                    const now = Date.now();
                    const dataAge = now - (currentTimestamp < 10000000000 ? currentTimestamp * 1000 : currentTimestamp);
                    const dataAgeMinutes = Math.floor(dataAge / 60000);
                    if (dataAgeMinutes > 5) {
                        console.warn(`[数据更新] ⚠️ 国内数据已经 ${dataAgeMinutes} 分钟未更新，可能是市场休市`);
                    }
                }
            } else {
                console.log(`[数据更新] 国内市场首次获取数据`);
            }
        } else {
            console.log('[数据更新] ⚠ 国内市场数据为空或获取失败');
        }
        
        // 检查伦敦市场数据是否有更新
        if (londonKlineData && londonKlineData.length > 0) {
            if (lastLondonKlineData && lastLondonKlineData.length > 0) {
                // 比较最新的K线数据
                const lastKline = lastLondonKlineData[lastLondonKlineData.length - 1];
                const currentKline = londonKlineData[londonKlineData.length - 1];
                
                const lastTimestamp = lastKline.t || lastKline.time || 0;
                const currentTimestamp = currentKline.t || currentKline.time || 0;
                const lastClose = lastKline.c || lastKline.close || 0;
                const currentClose = currentKline.c || currentKline.close || 0;
                
                // 转换时间戳为可读时间
                const formatTime = (ts) => {
                    const timestampMs = ts < 10000000000 ? ts * 1000 : ts;
                    const date = new Date(timestampMs);
                    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
                };
                
                if (currentTimestamp !== lastTimestamp || currentClose !== lastClose) {
                    console.log(`[数据更新] ✓ 伦敦市场数据已更新:`);
                    console.log(`    时间: ${formatTime(lastTimestamp)} -> ${formatTime(currentTimestamp)}`);
                    console.log(`    收盘价: ${lastClose} -> ${currentClose}`);
                    console.log(`    数据条数: ${lastLondonKlineData.length} -> ${londonKlineData.length}`);
                    
                    // 计算时间差
                    const timeDiff = currentTimestamp - lastTimestamp;
                    const timeDiffSeconds = Math.floor(timeDiff / 1000);
                    if (timeDiffSeconds > 120) {
                        console.warn(`[数据更新] ⚠️ 伦敦数据时间差过大: ${timeDiffSeconds}秒，数据可能延迟！`);
                    }
                } else {
                    console.log(`[数据更新] - 伦敦市场数据未变化 (时间: ${formatTime(currentTimestamp)}, 收盘价: ${currentClose})`);
                }
            } else {
                console.log(`[数据更新] 伦敦市场首次获取数据`);
            }
        } else {
            console.warn('[数据更新] ⚠ 伦敦市场数据为空或获取失败');
        }
        
        // 保存当前数据供下次比较
        // 只在获取到新数据时更新
        if (domesticKlineData) {
            lastDomesticKlineData = domesticKlineData;
            currentDomesticKlineData = domesticKlineData;
            domesticDataLoaded = true; // 标记已加载过国内数据
        }
        if (domestic15mKlineData) {
            currentDomestic15mKlineData = domestic15mKlineData;
        }
        if (domesticDailyKlineData) {
            currentDomesticDailyKlineData = domesticDailyKlineData;
        }
        if (londonKlineData) {
            lastLondonKlineData = londonKlineData;
            currentLondonKlineData = londonKlineData;
        }
        
        // 初始化伦敦当前K线（用于实时更新）
        if (londonKlineData && londonKlineData.length > 0) {
            const lastKline = londonKlineData[londonKlineData.length - 1];
            
            // 只有当新K线开始时（时间戳不同），才重新初始化
            // 如果是同一根K线，保留实时更新的高低点
            if (!currentLondonKlineRealtime || currentLondonKlineRealtime.t !== lastKline.t) {
                // 新K线开始，复制API返回的数据
                currentLondonKlineRealtime = {
                    t: lastKline.t,
                    o: lastKline.o,
                    h: lastKline.h,
                    l: lastKline.l,
                    c: lastKline.c,
                    v: lastKline.v,
                    tu: lastKline.tu
                };
                console.log('[伦敦K线初始化] 新K线开始，时间戳:', new Date(lastKline.t).toLocaleTimeString(), 'OHLC:', lastKline.o.toFixed(3), lastKline.h.toFixed(3), lastKline.l.toFixed(3), lastKline.c.toFixed(3));
            } else {
                // 同一根K线，保持实时更新的高低点，只更新开盘价和成交量（API可能更准确）
                currentLondonKlineRealtime.o = lastKline.o;
                currentLondonKlineRealtime.v = lastKline.v;
                currentLondonKlineRealtime.tu = lastKline.tu;
                if (Math.random() < 0.05) { // 偶尔打印日志
                    console.log('[伦敦K线初始化] 同一根K线，保持WebSocket更新的高低收:', currentLondonKlineRealtime.h.toFixed(3), currentLondonKlineRealtime.l.toFixed(3), currentLondonKlineRealtime.c.toFixed(3));
                }
            }
        } else {
            console.warn('[伦敦K线初始化] londonKlineData为空或未定义');
        }
        
        // 更新国内白银K线图
        // 使用 currentDomesticKlineData（可能是新获取的或之前缓存的）
        if (currentDomesticKlineData !== null && currentDomesticKlineData.length > 0) {
            if (domesticKlineData) {
                console.log(`[图表更新] 准备更新国内图表（新数据），数据条数: ${domesticKlineData.length}`);
            } else if (Math.random() < 0.05) {
                console.log(`[图表更新] 国内休市，使用缓存数据显示，数据条数: ${currentDomesticKlineData.length}`);
            }
            
            if (!domesticChart) {
                console.warn('[数据更新] 国内图表未初始化，尝试重新初始化');
                const domesticChartElement = document.getElementById('domestic-chart');
                if (domesticChartElement) {
                    domesticChart = echarts.init(domesticChartElement, 'dark');
                    console.log('[数据更新] 国内图表重新初始化成功');
                } else {
                    console.error('[数据更新] 找不到国内图表DOM元素');
                }
            }
            if (domesticChart) {
                // 只在有新数据时更新图表
                if (domesticKlineData) {
                    console.log(`[图表更新] 调用updateChart更新国内图表`);
                    updateChart(domesticChart, currentDomesticKlineData, 'domestic-info');
                    console.log(`[图表更新] 国内图表更新完成`);
                }
            } else {
                console.error('[数据更新] 国内图表初始化失败，无法更新图表');
            }
        } else if (domesticKlineData !== undefined && domesticKlineData !== null) {
            const domesticInfo = document.getElementById('domestic-info');
            if (domesticInfo) {
                if (domesticKlineData === null) {
                    domesticInfo.innerHTML = '<span style="color: #ef4444;">API请求失败，请检查浏览器控制台</span>';
                } else {
                    domesticInfo.innerHTML = '<span style="color: #fbbf24;">返回空数据，可能是产品代码不正确</span>';
                }
            }
        }
        
        // 更新伦敦白银K线图（1分钟K线）
        if (londonKlineData !== null && londonKlineData.length > 0) {
            if (!londonChart) {
                console.warn('[数据更新] 伦敦图表未初始化，尝试重新初始化');
                const londonChartElement = document.getElementById('london-chart');
                if (londonChartElement) {
                    londonChart = echarts.init(londonChartElement, 'dark');
                    console.log('[数据更新] 伦敦图表重新初始化成功');
                }
            }
            if (londonChart) {
                // 使用实时更新的K线数据（如果有）
                let dataToDisplay = londonKlineData;
                if (currentLondonKlineRealtime && currentLondonKlineRealtime.t === londonKlineData[londonKlineData.length - 1].t) {
                    // 替换最后一根K线为实时更新的数据
                    dataToDisplay = [...londonKlineData.slice(0, -1), currentLondonKlineRealtime];
                }
                updateChart(londonChart, dataToDisplay, 'london-info');
            } else {
                console.error('[数据更新] 伦敦图表初始化失败，无法更新图表');
            }
        } else {
            console.warn('[数据更新] ⚠️ 伦敦K线数据获取失败，londonKlineData:', londonKlineData);
            const londonInfo = document.getElementById('london-info');
            if (londonInfo) {
                if (londonKlineData === null) {
                    londonInfo.innerHTML = '<span style="color: #ef4444;">API请求失败，请检查浏览器控制台</span>';
                } else {
                    londonInfo.innerHTML = '<span style="color: #fbbf24;">返回空数据，可能是产品代码不正确</span>';
                }
            }
        }
        
        // 更新伦敦白银90日K线图
        if (londonDailyKlineData !== null && londonDailyKlineData.length > 0) {
            if (!londonDailyChart) {
                const londonDailyChartElement = document.getElementById('london-daily-chart');
                if (londonDailyChartElement) {
                    londonDailyChart = echarts.init(londonDailyChartElement, 'dark');
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
                        xAxis: {
                            type: 'category',
                            data: [],
                            boundaryGap: false,
                            axisLine: { lineStyle: { color: '#4b5563' } },
                            axisLabel: { color: '#9ca3af' }
                        },
                        yAxis: {
                            type: 'value',
                            scale: true,
                            axisLine: { lineStyle: { color: '#4b5563' } },
                            axisLabel: { color: '#9ca3af' },
                            splitLine: { lineStyle: { color: '#1e2548' } }
                        },
                        series: []
                    };
                    londonDailyChart.setOption(initialOption);
                }
            }
            if (londonDailyChart) {
                updateChart(londonDailyChart, londonDailyKlineData, 'london-daily-info');
            }
        } else {
            const londonDailyInfo = document.getElementById('london-daily-info');
            if (londonDailyInfo) {
                if (londonDailyKlineData === null) {
                    londonDailyInfo.innerHTML = '<span style="color: #ef4444;">API请求失败，请检查浏览器控制台</span>';
                } else {
                    londonDailyInfo.innerHTML = '<span style="color: #fbbf24;">返回空数据，可能是产品代码不正确</span>';
                }
            }
        }
        
        // 更新伦敦白银15分钟K线图
        if (london15mKlineData !== null && london15mKlineData.length > 0) {
            if (!london15mChart) {
                const london15mChartElement = document.getElementById('london-15m-chart');
                if (london15mChartElement) {
                    london15mChart = echarts.init(london15mChartElement, 'dark');
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
                        xAxis: {
                            type: 'category',
                            data: [],
                            boundaryGap: false,
                            axisLine: { lineStyle: { color: '#4b5563' } },
                            axisLabel: { color: '#9ca3af' }
                        },
                        yAxis: {
                            type: 'value',
                            scale: true,
                            axisLine: { lineStyle: { color: '#4b5563' } },
                            axisLabel: { color: '#9ca3af' },
                            splitLine: { lineStyle: { color: '#1e2548' } }
                        },
                        series: []
                    };
                    london15mChart.setOption(initialOption);
                }
            }
            if (london15mChart) {
                updateChart(london15mChart, london15mKlineData, 'london-15m-info');
            }
        } else {
            const london15mInfo = document.getElementById('london-15m-info');
            if (london15mInfo) {
                if (london15mKlineData === null) {
                    london15mInfo.innerHTML = '<span style="color: #ef4444;">API请求失败，请检查浏览器控制台</span>';
                } else {
                    london15mInfo.innerHTML = '<span style="color: #fbbf24;">返回空数据，可能是产品代码不正确</span>';
                }
            }
        }
        
        // 更新国内白银90日K线图
        // 使用缓存数据（可能是新获取的或之前缓存的）
        const displayDomesticDailyData = domesticDailyKlineData || currentDomesticDailyKlineData;
        if (displayDomesticDailyData !== null && displayDomesticDailyData.length > 0) {
            if (!domesticDailyChart) {
                const domesticDailyChartElement = document.getElementById('domestic-daily-chart');
                if (domesticDailyChartElement) {
                    domesticDailyChart = echarts.init(domesticDailyChartElement, 'dark');
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
                        xAxis: {
                            type: 'category',
                            data: [],
                            boundaryGap: false,
                            axisLine: { lineStyle: { color: '#4b5563' } },
                            axisLabel: { color: '#9ca3af' }
                        },
                        yAxis: {
                            type: 'value',
                            scale: true,
                            axisLine: { lineStyle: { color: '#4b5563' } },
                            axisLabel: { color: '#9ca3af' },
                            splitLine: { lineStyle: { color: '#1e2548' } }
                        },
                        series: []
                    };
                    domesticDailyChart.setOption(initialOption);
                }
            }
            if (domesticDailyChart) {
                // 只在有新数据时更新
                if (domesticDailyKlineData) {
                    updateChart(domesticDailyChart, displayDomesticDailyData, 'domestic-daily-info');
                }
            }
        } else {
            const domesticDailyInfo = document.getElementById('domestic-daily-info');
            if (domesticDailyInfo) {
                if (domesticDailyKlineData === null) {
                    domesticDailyInfo.innerHTML = '<span style="color: #ef4444;">API请求失败，请检查浏览器控制台</span>';
                } else {
                    domesticDailyInfo.innerHTML = '<span style="color: #fbbf24;">返回空数据，可能是产品代码不正确</span>';
                }
            }
        }
        
        // 更新国内白银15分钟K线图
        // 使用缓存数据（可能是新获取的或之前缓存的）
        const displayDomestic15mData = domestic15mKlineData || currentDomestic15mKlineData;
        if (displayDomestic15mData !== null && displayDomestic15mData.length > 0) {
            if (!domestic15mChart) {
                const domestic15mChartElement = document.getElementById('domestic-15m-chart');
                if (domestic15mChartElement) {
                    domestic15mChart = echarts.init(domestic15mChartElement, 'dark');
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
                        xAxis: {
                            type: 'category',
                            data: [],
                            boundaryGap: false,
                            axisLine: { lineStyle: { color: '#4b5563' } },
                            axisLabel: { color: '#9ca3af' }
                        },
                        yAxis: {
                            type: 'value',
                            scale: true,
                            axisLine: { lineStyle: { color: '#4b5563' } },
                            axisLabel: { color: '#9ca3af' },
                            splitLine: { lineStyle: { color: '#1e2548' } }
                        },
                        series: []
                    };
                    domestic15mChart.setOption(initialOption);
                }
            }
            if (domestic15mChart) {
                // 只在有新数据时更新
                if (domestic15mKlineData) {
                    updateChart(domestic15mChart, displayDomestic15mData, 'domestic-15m-info');
                }
            }
        } else {
            const domestic15mInfo = document.getElementById('domestic-15m-info');
            if (domestic15mInfo) {
                if (domestic15mKlineData === null) {
                    domestic15mInfo.innerHTML = '<span style="color: #ef4444;">API请求失败，请检查浏览器控制台</span>';
                } else {
                    domestic15mInfo.innerHTML = '<span style="color: #fbbf24;">返回空数据，可能是产品代码不正确</span>';
                }
            }
        }
        
        // 更新套利追踪显示（在K线数据更新后）
        updateArbitrageDisplay();
        
        // 更新状态（只显示交易状态）
        if ((domesticKlineData !== null && domesticKlineData.length > 0) || 
            (londonKlineData !== null && londonKlineData.length > 0)) {
            updateStatus('connected');
        } else {
            updateStatus('error');
        }
    } catch (error) {
        console.error('[updateAllData] 更新数据失败:', error);
        console.error('[updateAllData] 错误堆栈:', error.stack);
        updateStatus('error');
        // 不要停止定时器，继续尝试更新
    } finally {
        // 释放更新锁
        isUpdating = false;
        
        // 如果在更新期间有新的更新请求，延迟执行
        if (pendingUpdate) {
            pendingUpdate = false;
            setTimeout(() => {
                updateAllData();
            }, MIN_UPDATE_INTERVAL);
            if (Math.random() < 0.1) {
                console.log(`[请求节流] 处理待处理的更新请求，${MIN_UPDATE_INTERVAL}ms后执行`);
            }
        }
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
    if (londonDailyChart) {
        londonDailyChart.resize();
    }
    if (london15mChart) {
        london15mChart.resize();
    }
    if (domesticDailyChart) {
        domesticDailyChart.resize();
    }
    if (domestic15mChart) {
        domestic15mChart.resize();
    }
});

// 定时器ID，用于清除定时器
let updateTimer = null;
let tradeDepthTimer = null;

// 更新成交价和盘口（每1-2秒一次，根据交易时间自动调整）
// AG（国内白银）通过后端TqSdk接口HTTP轮询获取，Silver（伦敦白银）通过AllTick WebSocket实时推送
// forceUpdate: 强制获取国内数据（用于首次加载）
async function updateTradeAndDepth(forceUpdate = false) {
    try {
        // 检查国内白银是否在交易时间内
        const isDomesticTrading = isDomesticTradingTime();
        
        // 根据交易时间决定是否获取国内数据
        let promises = [
            fetchTradeTick(API_CONFIG.londonSymbol)   // Silver通过AllTick API获取（作为WebSocket的补充）
        ];
        
        // 在交易时间内或首次强制加载时获取国内白银数据
        if (isDomesticTrading || forceUpdate) {
            promises.unshift(
                fetchTradeTick(API_CONFIG.domesticSymbol), // AG通过TqSdk获取
                fetchDepthTick(API_CONFIG.domesticSymbol)  // AG盘口数据
            );
        }
        
        const results = await Promise.all(promises);
        
        // 解析结果
        let domesticTradeTick, domesticDepth, londonTradeTick;
        if (isDomesticTrading || forceUpdate) {
            [domesticTradeTick, domesticDepth, londonTradeTick] = results;
        } else {
            [londonTradeTick] = results;
        }
        
        // 更新最新成交价（如果HTTP轮询返回了数据）
        if (domesticTradeTick) {
            updateDomesticTradeTick(domesticTradeTick);
        }
        if (londonTradeTick) {
            updateLondonTradeTick(londonTradeTick);
        }
        
        // 更新国内盘口数据
        if (domesticDepth) {
            updateDomesticDepth(domesticDepth);
            if (!isDomesticTrading && forceUpdate) {
                console.log('[盘口数据] 非交易时间，显示最后交易时的数据');
            }
        }
        
        // 更新套利追踪显示
        updateArbitrageDisplay();
        
        // Silver主要通过WebSocket实时推送，HTTP轮询作为补充
    } catch (error) {
        // 静默失败，WebSocket推送是主要数据源（对于Silver）
    }
}

// 刷新数据按钮
document.addEventListener('DOMContentLoaded', async () => {
    // 清空控制台日志
    console.clear();
    console.log('🚀 页面已加载，控制台日志已清空');
    console.log('=' .repeat(50));
    
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
    
    // 初始化状态点显示
    updateStatus();
    
    // 先立即更新一次数据（确保K线数据加载完成后再启动WebSocket）
    await updateAllData();
    console.log('[初始化] K线数据已加载，currentLondonKlineRealtime:', currentLondonKlineRealtime ? '已初始化' : '未初始化');
    
    // 初始化WebSocket连接（在K线数据加载后启动，确保实时更新有基础）
    connectAllTickWebSocket();
    
    // 📡 K线刷新策略：WebSocket实时推送（主要） + 定时器兜底（备用）
    // 
    // 工作原理：
    // 【伦敦白银 - AllTick WebSocket】
    //   1. 成交价推送 → 检测跨分钟（新K线）→ 立即刷新
    //   2. K线推送 → 直接触发刷新（1秒节流）
    // 
    // 【国内白银 - 后端TqSdk WebSocket】
    //   1. 后端TqSdk订阅实时数据
    //   2. K线更新 → 推送到前端 → 立即刷新（0.5秒节流）
    //   3. 行情更新 → 推送到前端 → 更新价格显示
    // 
    // 【定时器兜底】每10秒检查一次（仅作为备份，防止WebSocket异常）
    updateTimer = setInterval(updateAllData, 10000);
    console.log('[初始化] 📡 K线刷新策略: 双WebSocket实时推送 + 10秒定时兜底');
    console.log('[初始化] 国内: TqSdk WebSocket (0.5s节流) | 伦敦: AllTick WebSocket (1s节流)');
    
    // 首次加载时强制获取盘口数据（不管是否交易时间，都显示最后的数据）
    updateTradeAndDepth(true); // forceUpdate=true，强制获取国内数据
    
    // 动态调整更新频率
    function startTradeDepthTimer() {
        if (tradeDepthTimer) {
            clearInterval(tradeDepthTimer);
        }
        const isDomesticTrading = isDomesticTradingTime();
        const interval = isDomesticTrading ? 1000 : 2000; // 交易时间1秒，非交易时间2秒
        tradeDepthTimer = setInterval(() => updateTradeAndDepth(false), interval);
        console.log(`[盘口定时器] 国内${isDomesticTrading ? '交易中' : '休市'}，更新间隔: ${interval}ms`);
    }
    
    // 延迟启动定时器，让首次强制加载完成
    setTimeout(() => {
        startTradeDepthTimer();
    }, 1000);
    
    // 每分钟检查一次交易状态，动态调整更新频率
    setInterval(() => {
        const currentState = isDomesticTradingTime();
        const currentInterval = tradeDepthTimer ? (currentState ? 1000 : 2000) : 0;
        startTradeDepthTimer();
    }, 60000);
    
    // 每5分钟自动执行一次K线预测（如果已经有AI分析结果）
    setInterval(() => {
        if (aiAnalysisResult && (currentLondonKlineData || currentDomesticKlineData)) {
            console.log('[定时任务] 触发K线预测更新（每5分钟）');
            predictKlinesInBackground();
        }
    }, 5 * 60 * 1000); // 5分钟 = 300,000毫秒
    
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

// 代理检测缓存
let proxyDetectionCache = {
    isProxyEnabled: null, // null表示未检测，true表示开了代理，false表示没开代理
    lastCheckTime: null
};

/**
 * 检测本地代理端口是否可用
 * 尝试访问本地代理端口的HTTP接口（如果代理支持）
 * @param {number} port - 代理端口号，默认12334
 * @returns {Promise<boolean>} true表示代理端口可用，false表示不可用
 */
async function detectLocalProxyPort(port = 12334) {
    const timeout = 2000; // 2秒超时，快速检测本地端口
    
    // 创建带超时的fetch请求辅助函数
    const fetchWithTimeout = (url, options = {}) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        return fetch(url, {
            ...options,
            signal: controller.signal,
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache'
        }).then(() => {
            clearTimeout(timeoutId);
            return true;
        }).catch(() => {
            clearTimeout(timeoutId);
            return false;
        });
    };
    
    const checkPromises = [
        // 尝试访问代理端口的HTTP接口（常见接口路径）
        fetchWithTimeout(`http://127.0.0.1:${port}/`),
        
        // 尝试访问代理端口的健康检查接口
        fetchWithTimeout(`http://127.0.0.1:${port}/health`),
        
        // 尝试访问代理端口的状态接口
        fetchWithTimeout(`http://127.0.0.1:${port}/status`)
    ];
    
    try {
        const results = await Promise.allSettled(checkPromises);
        // 如果任何一个接口能访问，认为代理端口可用
        const portAvailable = results.some(r => r.status === 'fulfilled' && r.value === true);
        return portAvailable;
    } catch (error) {
        return false;
    }
}

/**
 * 检测浏览器是否开启了代理
 * 优先检测本地12334端口代理，然后检测网络可达性
 * @returns {Promise<boolean>} true表示开了代理，false表示没开代理
 */
async function detectProxy() {
    // 如果已经检测过，直接返回缓存结果
    if (proxyDetectionCache.isProxyEnabled !== null) {
        return proxyDetectionCache.isProxyEnabled;
    }
    
    try {
        // 首先检测本地代理端口（12334）
        console.log('[代理检测] 开始检测本地代理端口 12334...');
        const localProxyAvailable = await detectLocalProxyPort(12334);
        
        if (localProxyAvailable) {
            console.log('[代理检测] 检测到本地代理端口 12334 可用');
            proxyDetectionCache.isProxyEnabled = true;
            proxyDetectionCache.lastCheckTime = Date.now();
            API_CONFIG.llmApiUrl = API_CONFIG.llmApiUrlSingapore;
            console.log('[代理检测] 使用新加坡API:', API_CONFIG.llmApiUrl);
            return true;
        }
        
        console.log('[代理检测] 本地代理端口 12334 不可用，继续检测网络代理...');
        
        // 如果本地代理端口不可用，检测是否能访问Google或GitHub（开了代理通常能访问）
        // 使用超时控制来快速检测
        const timeout = 3000; // 3秒超时
        
        // 创建带超时的fetch请求辅助函数
        const fetchWithTimeout = (url, options = {}) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            return fetch(url, {
                ...options,
                signal: controller.signal,
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-cache'
            }).then(() => {
                clearTimeout(timeoutId);
                return true;
            }).catch(() => {
                clearTimeout(timeoutId);
                return false;
            });
        };
        
        const proxyCheckPromises = [
            // 尝试访问Google，如果能访问说明可能开了代理
            fetchWithTimeout('https://www.google.com/favicon.ico'),
            
            // 尝试访问GitHub，如果能访问说明可能开了代理
            fetchWithTimeout('https://github.com/favicon.ico')
        ];
        
        // 并行检测多个服务，如果任何一个能访问，说明可能开了代理
        const results = await Promise.allSettled(proxyCheckPromises);
        const accessibleCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
        
        // 如果至少有一个服务能访问，认为开了代理
        const isProxyEnabled = accessibleCount > 0;
        
        proxyDetectionCache.isProxyEnabled = isProxyEnabled;
        proxyDetectionCache.lastCheckTime = Date.now();
        
        // 根据代理状态设置API URL
        if (isProxyEnabled) {
            API_CONFIG.llmApiUrl = API_CONFIG.llmApiUrlSingapore;
            console.log('[代理检测] 检测到浏览器开启了网络代理，使用新加坡API:', API_CONFIG.llmApiUrl);
        } else {
            API_CONFIG.llmApiUrl = API_CONFIG.llmApiUrlChina;
            console.log('[代理检测] 检测到浏览器未开启代理，使用国内API:', API_CONFIG.llmApiUrl);
        }
        
        return isProxyEnabled;
        
    } catch (error) {
        console.error('[代理检测] 代理检测失败:', error);
        // 默认假设没开代理，使用国内API
        API_CONFIG.llmApiUrl = API_CONFIG.llmApiUrlChina;
        proxyDetectionCache.isProxyEnabled = false;
        proxyDetectionCache.lastCheckTime = Date.now();
        return false;
    }
}

// 调用AI分析API
async function callAnalysisAPI(domesticData, londonData, domesticDailyData = null, londonDailyData = null, domestic15mData = null, london15mData = null, domesticPrediction = null, londonPrediction = null, temperature = 1.0) {
    console.log('[callAnalysisAPI] 函数被调用，温度:', temperature);
    console.log('[callAnalysisAPI] domesticData:', domesticData ? domesticData.length : 0, '条');
    console.log('[callAnalysisAPI] londonData:', londonData ? londonData.length : 0, '条');
    console.log('[callAnalysisAPI] domesticDailyData:', domesticDailyData ? domesticDailyData.length : 0, '条');
    console.log('[callAnalysisAPI] londonDailyData:', londonDailyData ? londonDailyData.length : 0, '条');
    console.log('[callAnalysisAPI] domesticPrediction:', domesticPrediction ? '有' : '无');
    console.log('[callAnalysisAPI] londonPrediction:', londonPrediction ? '有' : '无');
    
    try {
        console.log('[callAnalysisAPI] 使用的API URL:', API_CONFIG.llmApiUrl);
        
        // 检查prompt.js是否已加载
        if (!window.PROMPT_CONFIG) {
            console.error('[callAnalysisAPI] Prompt配置文件未加载');
            throw new Error('Prompt配置文件未加载，请刷新页面重试');
        }
        
        console.log('[callAnalysisAPI] Prompt配置已加载');
        
        // 获取当前描述（如果用户输入框存在，优先使用输入框的值）
        const descriptionInput = document.getElementById('current-description-input');
        if (descriptionInput) {
            currentDescription = descriptionInput.value || '';
        }
        
        // 加载系统提示词，如果有当前描述，拼接到prompt前面
        let systemPrompt = window.PROMPT_CONFIG.MAIN_PROMPT;
        if (currentDescription && currentDescription.trim()) {
            systemPrompt = `当前情况描述：${currentDescription.trim()}\n\n${systemPrompt}`;
            console.log('[callAnalysisAPI] 已将当前描述拼接到prompt前面');
        }
        
        // 构建消息数组：第一个消息是当前时间信息，然后是K线数据
        const messages = [];
        
        // 第一个user消息：当前时间信息
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const currentTimeStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        
        messages.push({
            role: "user",
            content: `=== 当前时间信息 ===\n当前时间：${currentTimeStr}\n\n请根据当前时间判断：\n1. 国内市场是否在交易时间内（通常为工作日9:00-15:00和21:00-次日2:30）\n2. 如果国内市场未开盘，在预测pricePrediction15min时需要考虑可能的开盘价格\n3. 伦敦市场为24小时交易，需要考虑当前时间段的交易活跃度`
        });
        console.log('[callAnalysisAPI] 已添加当前时间信息到messages，时间:', currentTimeStr);
        
        // 第二个user消息：伦敦1分钟K线数据
        if (londonData && londonData.length > 0) {
            const londonPrompt = window.PROMPT_CONFIG.formatKlineDataForPrompt(
                londonData, 
                '伦敦现货白银（1分钟K线）', 
                'Silver'
            );
            messages.push({
                role: "user",
                content: londonPrompt
            });
            console.log('[callAnalysisAPI] 已添加伦敦1分钟K线数据到messages，数据条数:', londonData.length);
        } else {
            console.warn('[callAnalysisAPI] 伦敦1分钟K线数据为空，跳过');
        }
        
        // 第三个user消息：伦敦日K线数据
        if (londonDailyData && londonDailyData.length > 0) {
            const londonDailyPrompt = window.PROMPT_CONFIG.formatKlineDataForPrompt(
                londonDailyData, 
                '伦敦现货白银（日K线）', 
                'Silver'
            );
            messages.push({
                role: "user",
                content: londonDailyPrompt
            });
            console.log('[callAnalysisAPI] 已添加伦敦日K线数据到messages，数据条数:', londonDailyData.length);
        } else {
            console.warn('[callAnalysisAPI] 伦敦日K线数据为空，跳过');
        }
        
        // 第四个user消息：国内1分钟K线数据
        if (domesticData && domesticData.length > 0) {
            const domesticPrompt = window.PROMPT_CONFIG.formatKlineDataForPrompt(
                domesticData, 
                '国内白银（1分钟K线）', 
                'AG'
            );
            messages.push({
                role: "user",
                content: domesticPrompt
            });
            console.log('[callAnalysisAPI] 已添加国内1分钟K线数据到messages，数据条数:', domesticData.length);
        } else {
            console.warn('[callAnalysisAPI] 国内1分钟K线数据为空，跳过');
        }
        
        // 第五个user消息：国内15分钟K线数据
        if (domestic15mData && domestic15mData.length > 0) {
            const domestic15mPrompt = window.PROMPT_CONFIG.formatKlineDataForPrompt(
                domestic15mData, 
                '国内白银（15分钟K线）', 
                'AG'
            );
            messages.push({
                role: "user",
                content: domestic15mPrompt
            });
            console.log('[callAnalysisAPI] 已添加国内15分钟K线数据到messages，数据条数:', domestic15mData.length);
        } else {
            console.warn('[callAnalysisAPI] 国内15分钟K线数据为空，跳过');
        }
        
        // 第六个user消息：伦敦15分钟K线数据
        if (london15mData && london15mData.length > 0) {
            const london15mPrompt = window.PROMPT_CONFIG.formatKlineDataForPrompt(
                london15mData, 
                '伦敦现货白银（15分钟K线）', 
                'Silver'
            );
            messages.push({
                role: "user",
                content: london15mPrompt
            });
            console.log('[callAnalysisAPI] 已添加伦敦15分钟K线数据到messages，数据条数:', london15mData.length);
        } else {
            console.warn('[callAnalysisAPI] 伦敦15分钟K线数据为空，跳过');
        }
        
        // 第七个user消息：国内日K线数据
        if (domesticDailyData && domesticDailyData.length > 0) {
            const domesticDailyPrompt = window.PROMPT_CONFIG.formatKlineDataForPrompt(
                domesticDailyData, 
                '国内白银（日K线）', 
                'AG'
            );
            messages.push({
                role: "user",
                content: domesticDailyPrompt
            });
            console.log('[callAnalysisAPI] 已添加国内日K线数据到messages，数据条数:', domesticDailyData.length);
        } else {
            console.warn('[callAnalysisAPI] 国内日K线数据为空，跳过');
        }
        
        // 第八个user消息：国内白银实时盘口数据和扩展市场数据
        if (currentDomesticDepthData) {
            let depthPrompt = "=== 国内白银实时盘口数据 ===\n\n";
            depthPrompt += "**卖盘（卖5到卖1）**：\n";
            for (let i = 4; i >= 0; i--) {
                const askPrice = currentDomesticDepthData.ask_price && currentDomesticDepthData.ask_price[i] ? parseFloat(currentDomesticDepthData.ask_price[i]) : 0;
                const askVolume = currentDomesticDepthData.ask_volume && currentDomesticDepthData.ask_volume[i] ? parseInt(currentDomesticDepthData.ask_volume[i]) : 0;
                depthPrompt += `  卖${i + 1}: 价格 ${askPrice.toFixed(0)}, 数量 ${askVolume}\n`;
            }
            depthPrompt += "\n**买盘（买1到买5）**：\n";
            for (let i = 0; i < 5; i++) {
                const bidPrice = currentDomesticDepthData.bid_price && currentDomesticDepthData.bid_price[i] ? parseFloat(currentDomesticDepthData.bid_price[i]) : 0;
                const bidVolume = currentDomesticDepthData.bid_volume && currentDomesticDepthData.bid_volume[i] ? parseInt(currentDomesticDepthData.bid_volume[i]) : 0;
                depthPrompt += `  买${i + 1}: 价格 ${bidPrice.toFixed(0)}, 数量 ${bidVolume}\n`;
            }
            
            // 添加扩展市场数据
            depthPrompt += "\n**实时市场数据**：\n";
            
            // 价格信息
            const lastPrice = parseFloat(currentDomesticDepthData.last_price || 0);
            const open = parseFloat(currentDomesticDepthData.open || 0);
            const highest = parseFloat(currentDomesticDepthData.highest || 0);
            const lowest = parseFloat(currentDomesticDepthData.lowest || 0);
            const average = parseFloat(currentDomesticDepthData.average || 0);
            depthPrompt += `- 最新价: ${lastPrice.toFixed(0)}  开盘: ${open.toFixed(0)}  最高: ${highest.toFixed(0)}  最低: ${lowest.toFixed(0)}  均价: ${average.toFixed(0)}\n`;
            
            // 涨跌信息
            const change = parseFloat(currentDomesticDepthData.change || 0);
            const changePercent = parseFloat(currentDomesticDepthData.change_percent || 0);
            const preSettlement = parseFloat(currentDomesticDepthData.pre_settlement || 0);
            const changeSign = change >= 0 ? '+' : '';
            depthPrompt += `- 涨跌: ${changeSign}${change.toFixed(0)} (${changeSign}${changePercent.toFixed(2)}%)  昨结算: ${preSettlement.toFixed(0)}\n`;
            
            // 成交和持仓信息
            const volume = parseInt(currentDomesticDepthData.volume || 0);
            const amount = parseFloat(currentDomesticDepthData.amount || 0);
            const openInterest = parseInt(currentDomesticDepthData.open_interest || 0);
            const preOpenInterest = parseInt(currentDomesticDepthData.pre_open_interest || 0);
            
            // 格式化成交额（显示数值，不带单位）
            let amountStr = '';
            if (amount > 0) {
                const amountWan = amount / 10000;
                if (amountWan >= 10000) {
                    amountStr = `${(amountWan / 10000).toFixed(2)}`;
                } else {
                    amountStr = `${amountWan.toFixed(2)}`;
                }
            }
            
            // 计算持仓量变化
            let oiChangeStr = '';
            if (openInterest > 0 && preOpenInterest > 0) {
                const oiChange = openInterest - preOpenInterest;
                const oiChangePercent = ((oiChange / preOpenInterest) * 100).toFixed(2);
                const oiChangeSign = oiChange >= 0 ? '+' : '';
                oiChangeStr = ` (${oiChangeSign}${oiChange}, ${oiChangeSign}${oiChangePercent}%)`;
            }
            
            depthPrompt += `- 成交量: ${volume.toLocaleString()}手  成交额: ${amountStr}\n`;
            depthPrompt += `- 持仓量: ${openInterest.toLocaleString()}手${oiChangeStr}  昨持仓: ${preOpenInterest.toLocaleString()}手\n`;
            
            // 合约信息
            const instrumentName = currentDomesticDepthData.instrument_name || '';
            const volumeMultiple = parseInt(currentDomesticDepthData.volume_multiple || 0);
            const upperLimit = parseFloat(currentDomesticDepthData.upper_limit || 0);
            const lowerLimit = parseFloat(currentDomesticDepthData.lower_limit || 0);
            depthPrompt += `- 合约: ${instrumentName}  乘数: ${volumeMultiple}kg/手\n`;
            depthPrompt += `- 涨停: ${upperLimit.toFixed(0)}  跌停: ${lowerLimit.toFixed(0)}\n`;
            
            depthPrompt += "\n**盘口分析要点**：\n";
            depthPrompt += "- 买卖价差：反映市场流动性和交易活跃度\n";
            depthPrompt += "- 买卖盘量比：反映多空力量对比\n";
            depthPrompt += "- 持仓量变化：增仓说明市场参与度提升，减仓说明资金流出\n";
            depthPrompt += "- 成交量和成交额：反映市场活跃程度\n";
            depthPrompt += "- 涨跌幅和相对位置：当前价格在日内高低点的位置\n";
            
            // 添加分析要求
            depthPrompt += "\n\n请综合分析以上两个市场的K线数据（包括1分钟K线、15分钟K线和日K线）以及国内白银的实时盘口数据和市场数据，注意它们之间的关联性、短期和长期趋势，以及当前的市场情绪、资金流向、持仓变化等，并按照JSON格式输出分析结果。";
            
            messages.push({
                role: "user",
                content: depthPrompt
            });
            console.log('[callAnalysisAPI] 已添加国内白银实时盘口数据和扩展市场数据到messages');
        } else {
            console.warn('[callAnalysisAPI] 国内白银实时盘口数据为空，跳过');
            // 如果没有盘口数据，在最后一个消息添加分析要求
            if (messages.length > 0) {
                let analysisInstruction = "\n\n请综合分析以上两个市场的K线数据（包括1分钟K线、15分钟K线和日K线），注意它们之间的关联性、短期和长期趋势，并按照JSON格式输出分析结果。";
                messages[messages.length - 1].content += analysisInstruction;
                console.log('[callAnalysisAPI] 已添加分析要求到最后一个消息');
            }
        }
        
        // 第九个user消息：AI预测数据（如果有）
        if (londonPrediction || domesticPrediction) {
            let predictionPrompt = "=== AI预测数据（供参考） ===\n\n";
            
            if (londonPrediction && londonPrediction.prices && Array.isArray(londonPrediction.prices)) {
                predictionPrompt += "**伦敦白银预测价格（未来50分钟）**：\n";
                const londonPrices = londonPrediction.prices.slice(0, 10); // 只显示前10个点，避免太长
                predictionPrompt += londonPrices.map((p, i) => `${i + 1}min: ${typeof p === 'number' ? p.toFixed(3) : p}`).join(', ');
                predictionPrompt += ` ... (共${londonPrediction.prices.length}个价格点)\n`;
                
                // 计算预测趋势
                const firstPrice = londonPrediction.prices[0];
                const lastPrice = londonPrediction.prices[londonPrediction.prices.length - 1];
                const priceChange = lastPrice - firstPrice;
                const changePercent = ((priceChange / firstPrice) * 100).toFixed(2);
                predictionPrompt += `预测趋势：${priceChange > 0 ? '上涨' : priceChange < 0 ? '下跌' : '震荡'} ${Math.abs(changePercent)}%\n\n`;
            }
            
            if (domesticPrediction && domesticPrediction.prices && Array.isArray(domesticPrediction.prices)) {
                predictionPrompt += "**国内白银预测价格（未来50分钟）**：\n";
                const domesticPrices = domesticPrediction.prices.slice(0, 10); // 只显示前10个点
                predictionPrompt += domesticPrices.map((p, i) => `${i + 1}min: ${typeof p === 'number' ? p.toFixed(0) : p}`).join(', ');
                predictionPrompt += ` ... (共${domesticPrediction.prices.length}个价格点)\n`;
                
                // 计算预测趋势
                const firstPrice = domesticPrediction.prices[0];
                const lastPrice = domesticPrediction.prices[domesticPrediction.prices.length - 1];
                const priceChange = lastPrice - firstPrice;
                const changePercent = ((priceChange / firstPrice) * 100).toFixed(2);
                predictionPrompt += `预测趋势：${priceChange > 0 ? '上涨' : priceChange < 0 ? '下跌' : '震荡'} ${Math.abs(changePercent)}%\n\n`;
            }
            
            predictionPrompt += "**说明**：\n";
            predictionPrompt += "- 以上是基于K线数据的AI价格预测\n";
            predictionPrompt += "- 预测数据可作为参考，但不应作为唯一决策依据\n";
            predictionPrompt += "- 请结合实时K线、盘口数据和预测趋势综合判断\n";
            predictionPrompt += "- 如果预测趋势与当前K线走势一致，可增强信心\n";
            predictionPrompt += "- 如果预测与实际走势出现背离，需谨慎对待\n";
            
            messages.push({
                role: "user",
                content: predictionPrompt
            });
            console.log('[callAnalysisAPI] 已添加AI预测数据到messages');
        }
        
        // 验证messages数组
        console.log('[callAnalysisAPI] messages数组长度:', messages.length);
        if (messages.length === 0) {
            throw new Error('没有可用的K线数据');
        }
        
        // 构建请求体（prompt参数放系统提示词，messages数组放用户数据）
        const requestBody = {
            prompt: systemPrompt,
            messages: messages,
            model: selectedModel, // 使用用户选择的模型
            temperature: temperature // 策略预测使用更保守的温度以获得更准确的分析
        };
        
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
            
            console.log('[callAnalysisAPI] fetch请求已发送，等待响应...');
            
            // 清除超时定时器
            clearTimeout(timeoutId);
            
            console.log('[callAnalysisAPI] 收到响应，Status:', response.status);
            
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
                        // 清理可能的转义字符
                        let cleanedText = messageText.trim();
                        // 如果字符串包含转义的换行符，先处理
                        cleanedText = cleanedText.replace(/\\n/g, '\n');
                        
                        try {
                            analysisResult = JSON.parse(cleanedText);
                        } catch (parseErr) {
                            // 尝试提取JSON部分
                            const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                analysisResult = JSON.parse(jsonMatch[0]);
                            } else {
                                throw parseErr;
                            }
                        }
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
                console.error('[LLM响应] JSON解析失败:', parseError);
                console.error('[LLM响应] 原始响应:', JSON.stringify(apiResponse, null, 2));
                analysisResult = {
                    error: "JSON解析失败",
                    raw_response: JSON.stringify(apiResponse),
                    parse_error: parseError.message
                };
            }
            
            // 检查解析结果
            if (!analysisResult) {
                throw new Error('AI分析返回结果为空');
            }
            
            if (analysisResult.error) {
                throw new Error(`AI分析错误: ${analysisResult.error}`);
            }
            
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

// K线预测API调用（独立于主分析）
async function callKlinePredictionAPI(marketType, klineData, londonPrediction = null, previousPrediction = null, temperature = 1.0) {
    console.log(`[K线预测] 开始预测 ${marketType} 的后续${PREDICTION_CONFIG.pricePointsCount}个价格点，温度: ${temperature}`);
    console.log(`[K线预测] 输入数据条数: ${klineData ? klineData.length : 0}`);
    if (londonPrediction) {
        console.log(`[K线预测] 包含伦敦市场预测参考（${PREDICTION_CONFIG.pricePointsCount}个价格点）`);
    }
    if (previousPrediction) {
        console.log(`[K线预测] 包含上一次的预测结果（用于对比调整）`);
    }
    
    if (!klineData || klineData.length < 20) {
        console.warn('[K线预测] 数据不足，至少需要20根K线');
        return null;
    }
    
    try {
        
        // 准备系统提示词（根据市场类型选择）
        const systemPrompt = marketType === 'london' 
            ? window.PROMPT_CONFIG.KLINE_PREDICTION_PROMPT_LONDON
            : window.PROMPT_CONFIG.KLINE_PREDICTION_PROMPT_DOMESTIC;
        
        // 准备K线数据（只使用最近100根，减少token消耗）
        const recentKlines = klineData.slice(-100);
        const marketName = marketType === 'london' ? '伦敦现货白银（1分钟K线）' : '国内白银主力（1分钟K线）';
        const symbol = marketType === 'london' ? 'Silver' : 'AG';
        
        const klinePrompt = window.PROMPT_CONFIG.formatKlineDataForPrompt(
            recentKlines,
            marketName,
            symbol
        );
        
        // 构建messages数组
        const messages = [
            {
                role: "user",
                content: klinePrompt
            }
        ];
        
        // 如果有上一次的预测结果，添加到messages中
        if (previousPrediction && previousPrediction.prices && Array.isArray(previousPrediction.prices)) {
            const timeSinceLastPrediction = lastPredictionTime > 0 
                ? Math.floor((Date.now() - lastPredictionTime) / 60000) 
                : 0; // 距离上次预测的分钟数
            
            const previousPredictionText = `
=== 上一次的预测结果（供参考和调整） ===

上次预测时间：约${timeSinceLastPrediction}分钟前
上次预测的${PREDICTION_CONFIG.pricePointsCount}个价格点：
${previousPrediction.prices.slice(0, PREDICTION_CONFIG.pricePointsCount).map((p, i) => `${i + 1}min: ${typeof p === 'number' ? p.toFixed(marketType === 'london' ? 3 : 0) : p}`).join(', ')}

**重要说明**：
- 请对比上一次的预测和当前的实际走势
- 如果上一次预测准确，说明当前判断正确，可以延续之前的逻辑
- 如果上一次预测偏差较大，需要分析原因并调整预测策略
- 考虑市场是否出现了新的变化（如突破、反转等）
- 新的预测应该基于当前最新的市场状态，同时参考之前的预测经验
`;
            
            messages.push({
                role: "user",
                content: previousPredictionText
            });
            
            console.log(`[K线预测] 已添加上一次的预测结果（${timeSinceLastPrediction}分钟前）`);
        }
        
        // 如果是国内市场且有伦敦预测，添加伦敦预测信息
        if (marketType === 'domestic' && londonPrediction) {
            const londonPredictionText = `
=== 伦敦现货白银预测价格（参考） ===

预测的${PREDICTION_CONFIG.pricePointsCount}个价格点（每分钟）：
${londonPrediction.prices ? londonPrediction.prices.map((p, i) => `${i + 1}min: ${p.toFixed(3)}`).join(', ') : '无'}

请参考伦敦市场的预测走势，预测国内白银主力的后续${PREDICTION_CONFIG.pricePointsCount}个价格点。`;
            
            messages.push({
                role: "user",
                content: londonPredictionText
            });
        }
        
        // 如果是国内市场且有盘口数据，添加实时盘口信息
        if (marketType === 'domestic' && currentDomesticDepthData) {
            let depthPrompt = "=== 国内白银实时盘口数据 ===\n\n";
            depthPrompt += "**卖盘（卖5到卖1）**：\n";
            for (let i = 4; i >= 0; i--) {
                const askPrice = currentDomesticDepthData.ask_price && currentDomesticDepthData.ask_price[i] ? parseFloat(currentDomesticDepthData.ask_price[i]) : 0;
                const askVolume = currentDomesticDepthData.ask_volume && currentDomesticDepthData.ask_volume[i] ? parseInt(currentDomesticDepthData.ask_volume[i]) : 0;
                depthPrompt += `  卖${i + 1}: 价格 ${askPrice.toFixed(0)}, 数量 ${askVolume}\n`;
            }
            depthPrompt += "\n**买盘（买1到买5）**：\n";
            for (let i = 0; i < 5; i++) {
                const bidPrice = currentDomesticDepthData.bid_price && currentDomesticDepthData.bid_price[i] ? parseFloat(currentDomesticDepthData.bid_price[i]) : 0;
                const bidVolume = currentDomesticDepthData.bid_volume && currentDomesticDepthData.bid_volume[i] ? parseInt(currentDomesticDepthData.bid_volume[i]) : 0;
                depthPrompt += `  买${i + 1}: 价格 ${bidPrice.toFixed(0)}, 数量 ${bidVolume}\n`;
            }
            depthPrompt += "\n**盘口分析要点**：\n";
            depthPrompt += "- 当前买卖价差反映市场流动性\n";
            depthPrompt += "- 买卖盘量比反映多空力量对比\n";
            depthPrompt += "- 大单情况可能预示价格趋势\n";
            depthPrompt += "\n请结合盘口数据分析当前市场情绪，预测价格走势。";
            
            messages.push({
                role: "user",
                content: depthPrompt
            });
            
            console.log('[K线预测] 已添加国内白银实时盘口数据');
        }
        
        // 添加最终指令
        messages.push({
            role: "user",
            content: `请根据以上数据预测后续${PREDICTION_CONFIG.pricePointsCount}个价格点（每分钟），按JSON格式输出价格数组。注意：价格必须有正常的波动，不能是简单的直线上涨或下跌，要符合真实市场的涨跌节奏。`
        });
        
        // 构建请求体
        const requestBody = {
            prompt: systemPrompt,
            messages: messages,
            model: selectedModel,
            temperature: temperature // K线预测使用更高的温度以获得更有创造性的预测
        };
        
        console.log(`[K线预测] 准备调用API，市场: ${marketType}，温度: ${temperature}`);
        
        // 创建超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
        
        try {
            const response = await fetch(API_CONFIG.llmApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'accept': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[K线预测错误] Status:', response.status, 'Error:', errorText);
                return null;
            }
            
            const apiResponse = await response.json();
            console.log('[K线预测] API响应:', apiResponse);
            
            // 解析响应
            let predictionResult = null;
            if (apiResponse.response && Array.isArray(apiResponse.response) && apiResponse.response.length > 0) {
                const messageText = apiResponse.response[0].message;
                
                if (typeof messageText === 'string') {
                    let cleanedText = messageText.trim();
                    
                    // 移除markdown代码块标记
                    cleanedText = cleanedText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                    
                    try {
                        predictionResult = JSON.parse(cleanedText);
                        console.log('[K线预测] 解析成功:', predictionResult);
                        
                        // 验证预测结果
                        if (predictionResult.prices && Array.isArray(predictionResult.prices)) {
                            console.log(`[K线预测] 预测了 ${predictionResult.prices.length} 个价格点`);
                            console.log(`[K线预测] 价格范围: ${Math.min(...predictionResult.prices).toFixed(3)} - ${Math.max(...predictionResult.prices).toFixed(3)}`);
                            return predictionResult;
                        } else {
                            console.error('[K线预测] 响应格式错误，缺少prices字段');
                            return null;
                        }
                    } catch (parseError) {
                        console.error('[K线预测] JSON解析失败:', parseError);
                        console.error('[K线预测] 原始文本:', cleanedText);
                        return null;
                    }
                }
            }
            
            console.error('[K线预测] 响应格式不符合预期');
            return null;
            
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                console.error('[K线预测] 请求超时');
            } else {
                console.error('[K线预测] 请求失败:', fetchError);
            }
            return null;
        }
        
    } catch (error) {
        console.error('[K线预测] 发生错误:', error);
        return null;
    }
}

// 15分钟K线预测API调用
async function callKlinePrediction15mAPI(marketType, klineData, londonPrediction = null, temperature = 1.0) {
    console.log(`[15分钟K线预测] 开始预测 ${marketType} 的后续${PREDICTION_CONFIG.pricePointsCount15m}个价格点，温度: ${temperature}`);
    console.log(`[15分钟K线预测] 输入数据条数: ${klineData ? klineData.length : 0}`);
    
    if (!klineData || klineData.length < 10) {
        console.warn('[15分钟K线预测] 数据不足，至少需要10根K线');
        return null;
    }
    
    try {
        // 准备系统提示词（根据市场类型选择）
        const systemPrompt = marketType === 'london' 
            ? window.PROMPT_CONFIG.KLINE_PREDICTION_PROMPT_LONDON_15M
            : window.PROMPT_CONFIG.KLINE_PREDICTION_PROMPT_DOMESTIC_15M;
        
        // 准备messages数组
        const messages = [];
        
        // 添加K线数据
        const klinePrompt = window.PROMPT_CONFIG.formatKlineDataForPrompt(
            klineData, 
            marketType === 'london' ? '伦敦现货白银15分钟' : '国内白银主力15分钟',
            marketType === 'london' ? API_CONFIG.londonSymbol : API_CONFIG.domesticSymbol
        );
        
        messages.push({
            role: "user",
            content: klinePrompt
        });
        
        // 如果是国内市场且有伦敦预测，添加伦敦预测信息
        if (marketType === 'domestic' && londonPrediction) {
            const londonPredictionText = `
=== 伦敦现货白银15分钟预测价格（参考） ===

预测的${PREDICTION_CONFIG.pricePointsCount15m}个价格点（每15分钟）：
${londonPrediction.prices ? londonPrediction.prices.map((p, i) => `${(i + 1) * 15}min: ${p.toFixed(3)}`).join(', ') : '无'}

请参考伦敦市场的预测走势，预测国内白银主力的后续${PREDICTION_CONFIG.pricePointsCount15m}个价格点。`;
            
            messages.push({
                role: "user",
                content: londonPredictionText
            });
        }
        
        // 添加最终指令
        messages.push({
            role: "user",
            content: `请根据以上15分钟K线数据预测后续${PREDICTION_CONFIG.pricePointsCount15m}个价格点（每个点代表15分钟后的价格），按JSON格式输出价格数组。注意：价格必须有正常的波动，不能是简单的直线。`
        });
        
        // 构建请求体
        const requestBody = {
            prompt: systemPrompt,
            messages: messages,
            model: selectedModel,
            temperature: temperature
        };
        
        console.log(`[15分钟K线预测] 准备调用API，市场: ${marketType}，温度: ${temperature}`);
        
        // 创建超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
        
        try {
            const response = await fetch(API_CONFIG.llmApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[15分钟K线预测错误] Status:', response.status, 'Error:', errorText);
                return null;
            }
            
            const apiResponse = await response.json();
            console.log('[15分钟K线预测] API响应:', apiResponse);
            
            // 解析响应
            let predictionResult = null;
            if (apiResponse.response && Array.isArray(apiResponse.response) && apiResponse.response.length > 0) {
                const messageText = apiResponse.response[0].message;
                
                if (typeof messageText === 'string') {
                    let cleanedText = messageText.trim();
                    
                    // 移除markdown代码块标记
                    cleanedText = cleanedText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                    
                    try {
                        predictionResult = JSON.parse(cleanedText);
                        console.log('[15分钟K线预测] 解析成功:', predictionResult);
                        
                        // 验证预测结果
                        if (predictionResult.prices && Array.isArray(predictionResult.prices)) {
                            console.log(`[15分钟K线预测] 预测了 ${predictionResult.prices.length} 个价格点`);
                            console.log(`[15分钟K线预测] 价格范围: ${Math.min(...predictionResult.prices).toFixed(marketType === 'london' ? 3 : 0)} - ${Math.max(...predictionResult.prices).toFixed(marketType === 'london' ? 3 : 0)}`);
                            return predictionResult;
                        } else {
                            console.error('[15分钟K线预测] 响应格式错误，缺少prices字段');
                            return null;
                        }
                    } catch (parseError) {
                        console.error('[15分钟K线预测] JSON解析失败:', parseError);
                        console.error('[15分钟K线预测] 原始文本:', cleanedText);
                        return null;
                    }
                }
            }
            
            console.error('[15分钟K线预测] 响应格式不符合预期');
            return null;
            
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                console.error('[15分钟K线预测] 请求超时');
            } else {
                console.error('[15分钟K线预测] 请求失败:', fetchError);
            }
            return null;
        }
        
    } catch (error) {
        console.error('[15分钟K线预测] 发生错误:', error);
        return null;
    }
}

// 执行AI分析
async function performAnalysis() {
    // 如果正在分析中，直接返回，防止重复分析
    if (isAnalyzing) {
        console.log('[performAnalysis] 正在分析中，忽略重复请求');
        return;
    }
    
    // 设置分析状态
    isAnalyzing = true;
    
    try {
        // 强制获取最新的K线数据（国内和伦敦的1分钟K线、15分钟K线和日K线），不使用缓存，确保数据是最新的
        const [domesticData, londonData, domestic15mData, london15mData, domesticDailyData, londonDailyData] = await Promise.all([
            fetchKlineData(API_CONFIG.domesticSymbol), // 国内1分钟K线
            fetchKlineData(API_CONFIG.londonSymbol), // 伦敦1分钟K线
            fetchKlineData(API_CONFIG.domesticSymbol, '15m', 100), // 国内15分钟K线数据（100根）
            fetchKlineData(API_CONFIG.londonSymbol, '15m', 100), // 伦敦15分钟K线数据（100根）
            fetchKlineData(API_CONFIG.domesticSymbol, '1d', 90), // 国内日K线数据
            fetchKlineData(API_CONFIG.londonSymbol, '1d', 90) // 伦敦日K线数据
        ]);
        
        let domesticDataToAnalyze = null;
        let londonDataToAnalyze = null;
        let domestic15mDataToAnalyze = null;
        let london15mDataToAnalyze = null;
        let domesticDailyDataToAnalyze = null;
        let londonDailyDataToAnalyze = null;
        
        if (domesticData && domesticData.length > 0) {
            domesticDataToAnalyze = domesticData;
            currentDomesticKlineData = domesticData; // 更新缓存
        } else {
            console.warn('[performAnalysis] 国内白银1分钟K线数据获取失败或为空');
        }
        
        if (londonData && londonData.length > 0) {
            londonDataToAnalyze = londonData;
            currentLondonKlineData = londonData; // 更新缓存
        } else {
            console.warn('[performAnalysis] 伦敦白银1分钟K线数据获取失败或为空');
        }
        
        if (domesticDailyData && domesticDailyData.length > 0) {
            domesticDailyDataToAnalyze = domesticDailyData;
        } else {
            console.warn('[performAnalysis] 国内白银日K线数据获取失败或为空');
        }
        
        if (londonDailyData && londonDailyData.length > 0) {
            londonDailyDataToAnalyze = londonDailyData;
        } else {
            console.warn('[performAnalysis] 伦敦白银日K线数据获取失败或为空');
        }
        
        if (domestic15mData && domestic15mData.length > 0) {
            domestic15mDataToAnalyze = domestic15mData;
        } else {
            console.warn('[performAnalysis] 国内白银15分钟K线数据获取失败或为空');
        }
        
        if (london15mData && london15mData.length > 0) {
            london15mDataToAnalyze = london15mData;
        } else {
            console.warn('[performAnalysis] 伦敦白银15分钟K线数据获取失败或为空');
        }
        
        // 检查是否有至少一个市场的数据（1分钟K线或日K线都可以）
        if ((!domesticDataToAnalyze || domesticDataToAnalyze.length === 0) && 
            (!londonDataToAnalyze || londonDataToAnalyze.length === 0) &&
            (!domesticDailyDataToAnalyze || domesticDailyDataToAnalyze.length === 0) &&
            (!londonDailyDataToAnalyze || londonDailyDataToAnalyze.length === 0)) {
            throw new Error('无法获取K线数据，请稍后重试');
        }
        
        // 调用分析API，同时传递国内和伦敦的1分钟K线、15分钟K线和日K线数据，以及预测数据
        const result = await callAnalysisAPI(
            domesticDataToAnalyze, 
            londonDataToAnalyze, 
            domesticDailyDataToAnalyze, 
            londonDailyDataToAnalyze, 
            domestic15mDataToAnalyze, 
            london15mDataToAnalyze,
            previousDomesticPrediction,  // 传入国内预测
            previousLondonPrediction      // 传入伦敦预测
        );
        
        // 保存AI分析结果
        aiAnalysisResult = result;
        
        // 播放操作建议音效
        const advice = result.tradingAdvice || {};
        const action = advice.action || '观望';
        playTradingAdviceSound(action);
        
        // 更新实时交易策略显示（会自动使用AI分析结果）
        updateTradingStrategy();
        
        // AI分析完成后，自动触发K线预测（后台执行，不影响主流程）
        console.log('[performAnalysis] 开始执行K线预测（后台任务）');
        predictKlinesInBackground();
        
    } catch (error) {
        console.error('[performAnalysis] 分析失败，错误详情:', error);
        console.error('[performAnalysis] 错误堆栈:', error.stack);
        console.error('[performAnalysis] 错误消息:', error.message);
        
        const strategyContent = document.getElementById('trading-strategy-content');
        if (strategyContent) {
            strategyContent.innerHTML = `
                <div style="color: #ef4444; padding: 15px; text-align: center;">
                    <div style="font-size: 18px; margin-bottom: 8px;">分析失败</div>
                    <div style="font-size: 14px; color: #9ca3af;">${error.message || '未知错误'}</div>
                    <div style="margin-top: 10px; font-size: 12px; color: #6b7280;">请检查浏览器控制台查看详细错误信息</div>
                </div>
            `;
        }
    } finally {
        // 恢复分析状态
        isAnalyzing = false;
    }
}

/**
 * 从1分钟预测价格生成15分钟K线预测
 * @param {Array<number>} prices - 1分钟预测价格数组（至少15个）
 * @param {Array<Object>} baseKlineData - 基础K线数据（用于获取最后一根K线的时间戳）
 * @param {number} count - 需要生成的15分钟K线数量（默认5根）
 * @returns {Array<Object>} 15分钟K线预测数据
 */
function generate15mKlinesFromPrediction(prices, baseKlineData, count = 5) {
    const result = [];
    
    if (!prices || prices.length < 15 || !baseKlineData || baseKlineData.length === 0) {
        console.warn('[15分钟K线预测] 数据不足，无法生成预测');
        return result;
    }
    
    // 获取最后一根真实K线的时间戳
    const lastKline = baseKlineData[baseKlineData.length - 1];
    const lastTimestamp = lastKline.t || lastKline.time || Date.now();
    
    // 生成指定数量的15分钟K线
    for (let i = 0; i < count; i++) {
        const startIndex = i * 15; // 每根15分钟K线使用15个1分钟价格
        const endIndex = startIndex + 15;
        
        // 如果价格数据不足，停止生成
        if (endIndex > prices.length) {
            console.warn(`[15分钟K线预测] 第${i + 1}根K线数据不足，实际只生成了${i}根K线`);
            break;
        }
        
        // 提取这15分钟的价格
        const minutePrices = prices.slice(startIndex, endIndex);
        
        // 验证价格数据：过滤无效值
        const validMinutePrices = minutePrices.filter(p => 
            p !== null && p !== undefined && typeof p === 'number' && !isNaN(p) && p > 0
        );
        
        // 如果有效价格少于10个，跳过这根K线
        if (validMinutePrices.length < 10) {
            console.warn(`[15分钟K线预测] 第${i + 1}根K线有效价格不足（${validMinutePrices.length}/15），跳过`);
            continue;
        }
        
        // 计算OHLC（使用有效价格）
        const open = parseFloat(validMinutePrices[0]); // 开盘价：第一个价格
        const close = parseFloat(validMinutePrices[validMinutePrices.length - 1]); // 收盘价：最后一个价格
        const high = Math.max(...validMinutePrices); // 最高价
        const low = Math.min(...validMinutePrices); // 最低价
        
        // 再次验证OHLC数据
        if (isNaN(open) || isNaN(close) || isNaN(high) || isNaN(low) || 
            open <= 0 || close <= 0 || high <= 0 || low <= 0) {
            console.warn(`[15分钟K线预测] 第${i + 1}根K线OHLC数据无效，跳过`);
            continue;
        }
        
        // 计算时间戳（每根K线间隔15分钟）
        const timestamp = lastTimestamp + (i + 1) * 15 * 60 * 1000;
        
        result.push({
            t: timestamp,
            o: open,
            c: close,
            h: high,
            l: low,
            v: 0 // 预测K线没有成交量
        });
    }
    
    console.log(`[15分钟K线预测] 成功生成${result.length}根K线，时间范围: ${new Date(result[0]?.t).toLocaleString()} - ${new Date(result[result.length - 1]?.t).toLocaleString()}`);
    
    return result;
}

// 后台执行K线预测（不阻塞主流程）
async function predictKlinesInBackground() {
    try {
        console.log('[K线预测后台任务] 开始执行');
        
        // 先预测伦敦市场（传入上一次的伦敦预测）
        const londonPrediction = currentLondonKlineData && currentLondonKlineData.length >= 20 
            ? await callKlinePredictionAPI('london', currentLondonKlineData, null, previousLondonPrediction)
            : null;
        
        console.log('[K线预测后台任务] 伦敦市场预测完成');
        
        // 然后预测国内市场（传入伦敦预测和上一次的国内预测）
        const domesticPrediction = currentDomesticKlineData && currentDomesticKlineData.length >= 20
            ? await callKlinePredictionAPI('domestic', currentDomesticKlineData, londonPrediction, previousDomesticPrediction)
            : null;
        
        console.log('[K线预测后台任务] 国内市场预测完成');
        
        // 更新预测时间戳
        lastPredictionTime = Date.now();
        
        // 缓存本次预测结果供下次使用
        if (londonPrediction) {
            previousLondonPrediction = londonPrediction;
            console.log('[K线预测后台任务] 已缓存伦敦预测结果');
        }
        if (domesticPrediction) {
            previousDomesticPrediction = domesticPrediction;
            console.log('[K线预测后台任务] 已缓存国内预测结果');
        }
        
        // 保存预测结果到全局变量（转换为K线格式以兼容现有代码）
        if (londonPrediction && londonPrediction.prices && Array.isArray(londonPrediction.prices)) {
            // 过滤并验证价格数据
            const validPrices = londonPrediction.prices.filter(price => 
                price !== null && price !== undefined && typeof price === 'number' && !isNaN(price) && price > 0
            );
            
            if (validPrices.length === 0) {
                console.error('[K线预测后台任务] ⚠️ 伦敦预测价格全部无效，跳过');
            } else {
                // 转换价格数组为K线格式（只有收盘价）
                const lastKline = currentLondonKlineData[currentLondonKlineData.length - 1];
                const lastTimestamp = lastKline.t || lastKline.time || Date.now();
                
                predictedLondonKlines = validPrices.map((price, index) => ({
                    t: lastTimestamp + (index + 1) * 60000, // 每分钟递增
                    o: parseFloat(price),
                    c: parseFloat(price),
                    h: parseFloat(price),
                    l: parseFloat(price),
                    v: 0
                }));
                console.log(`[K线预测后台任务] 伦敦预测完成，${predictedLondonKlines.length}个价格点`);
                console.log(`[K线预测后台任务] 价格范围: ${Math.min(...validPrices).toFixed(3)} - ${Math.max(...validPrices).toFixed(3)}`);
            }
        }
        
        if (domesticPrediction && domesticPrediction.prices && Array.isArray(domesticPrediction.prices)) {
            // 过滤并验证价格数据
            const validPrices = domesticPrediction.prices.filter(price => 
                price !== null && price !== undefined && typeof price === 'number' && !isNaN(price) && price > 0
            );
            
            if (validPrices.length === 0) {
                console.error('[K线预测后台任务] ⚠️ 国内预测价格全部无效，跳过');
            } else {
                // 转换价格数组为K线格式（只有收盘价）
                const lastKline = currentDomesticKlineData[currentDomesticKlineData.length - 1];
                const lastTimestamp = lastKline.t || lastKline.time || Date.now();
                
                predictedDomesticKlines = validPrices.map((price, index) => ({
                    t: lastTimestamp + (index + 1) * 60000, // 每分钟递增
                    o: parseFloat(price),
                    c: parseFloat(price),
                    h: parseFloat(price),
                    l: parseFloat(price),
                    v: 0
                }));
                console.log(`[K线预测后台任务] 国内预测完成，${predictedDomesticKlines.length}个价格点`);
                console.log(`[K线预测后台任务] 价格范围: ${Math.min(...validPrices)} - ${Math.max(...validPrices)}`);
            }
        }
        
        // 直接预测15分钟K线价格点
        console.log('[K线预测后台任务] ========== 开始15分钟K线预测 ==========');
        
        // 获取15分钟K线数据用于预测
        const london15mData = await fetchKlineData(API_CONFIG.londonSymbol, 'm15', 90);
        const domestic15mData = await fetchKlineData(API_CONFIG.domesticSymbol, 'm15', 90);
        
        // 预测伦敦15分钟K线
        const london15mPrediction = london15mData && london15mData.length >= 10
            ? await callKlinePrediction15mAPI('london', london15mData)
            : null;
        
        console.log('[K线预测后台任务] 伦敦15分钟预测完成');
        
        // 预测国内15分钟K线（参考伦敦预测）
        const domestic15mPrediction = domestic15mData && domestic15mData.length >= 10
            ? await callKlinePrediction15mAPI('domestic', domestic15mData, london15mPrediction)
            : null;
        
        console.log('[K线预测后台任务] 国内15分钟预测完成');
        
        // 将15分钟预测价格转换为K线格式
        if (london15mPrediction && london15mPrediction.prices && Array.isArray(london15mPrediction.prices)) {
            const validPrices = london15mPrediction.prices.filter(price => 
                price !== null && price !== undefined && typeof price === 'number' && !isNaN(price) && price > 0
            );
            
            if (validPrices.length > 0 && london15mData && london15mData.length > 0) {
                const lastKline = london15mData[london15mData.length - 1];
                const lastTimestamp = lastKline.t || lastKline.time || Date.now();
                
                predictedLondon15mKlines = validPrices.map((price, index) => ({
                    t: lastTimestamp + (index + 1) * 15 * 60 * 1000, // 每15分钟递增
                    o: parseFloat(price),
                    c: parseFloat(price),
                    h: parseFloat(price),
                    l: parseFloat(price),
                    v: 0
                }));
                console.log(`[K线预测后台任务] ✅ 伦敦15分钟K线预测完成，${predictedLondon15mKlines.length}个价格点`);
                console.log(`[K线预测后台任务] 伦敦15分钟价格范围: ${Math.min(...validPrices).toFixed(3)} - ${Math.max(...validPrices).toFixed(3)}`);
            }
        }
        
        if (domestic15mPrediction && domestic15mPrediction.prices && Array.isArray(domestic15mPrediction.prices)) {
            const validPrices = domestic15mPrediction.prices.filter(price => 
                price !== null && price !== undefined && typeof price === 'number' && !isNaN(price) && price > 0
            );
            
            if (validPrices.length > 0 && domestic15mData && domestic15mData.length > 0) {
                const lastKline = domestic15mData[domestic15mData.length - 1];
                const lastTimestamp = lastKline.t || lastKline.time || Date.now();
                
                predictedDomestic15mKlines = validPrices.map((price, index) => ({
                    t: lastTimestamp + (index + 1) * 15 * 60 * 1000, // 每15分钟递增
                    o: parseFloat(price),
                    c: parseFloat(price),
                    h: parseFloat(price),
                    l: parseFloat(price),
                    v: 0
                }));
                console.log(`[K线预测后台任务] ✅ 国内15分钟K线预测完成，${predictedDomestic15mKlines.length}个价格点`);
                console.log(`[K线预测后台任务] 国内15分钟价格范围: ${Math.min(...validPrices)} - ${Math.max(...validPrices)}`);
            }
        }
        
        console.log('[K线预测后台任务] ========== 15分钟K线预测完成 ==========');
        
        // 更新图表以显示预测K线（1分钟图和15分钟图）
        // 不自动调整dataZoom，避免图表跳动，让用户手动滑动查看
        try {
            if (londonChart && londonPrediction) {
                console.log('[K线预测后台任务] 更新伦敦1分钟图表以显示预测K线');
                updateChart(londonChart, currentLondonKlineData, 'london-info');
            }
            
            if (domesticChart && domesticPrediction) {
                console.log('[K线预测后台任务] 更新国内1分钟图表以显示预测K线');
                updateChart(domesticChart, currentDomesticKlineData, 'domestic-info');
            }
            
            // 更新15分钟K线图表（使用已获取的数据）
            if (london15mChart && predictedLondon15mKlines.length > 0 && london15mData && london15mData.length > 0) {
                console.log('[K线预测后台任务] 更新伦敦15分钟图表以显示预测K线');
                updateChart(london15mChart, london15mData, 'london-15m-info');
            }
            
            if (domestic15mChart && predictedDomestic15mKlines.length > 0 && domestic15mData && domestic15mData.length > 0) {
                console.log('[K线预测后台任务] 更新国内15分钟图表以显示预测K线');
                updateChart(domestic15mChart, domestic15mData, 'domestic-15m-info');
            }
            
            console.log('[K线预测后台任务] 执行完成');
        } catch (chartError) {
            console.error('[K线预测后台任务] 更新图表失败:', chartError);
            console.error('[K线预测后台任务] 错误详情:', {
                message: chartError.message,
                stack: chartError.stack
            });
        }
        
    } catch (error) {
        console.error('[K线预测后台任务] 执行失败:', error);
    }
}

// 模型选择器变化处理函数
function modelSelectorChangeHandler(e) {
    // 初始化AudioContext（用户交互时）
    initAudioContext();
    
    // 更新选中的模型
    selectedModel = e.target.value;
    console.log('[模型选择] 切换到模型:', selectedModel);
    
    // 保存模型选择
    saveSelectedModel();
    
    // 自动触发分析
    performAnalysis();
}

// 初始化分析功能（页面加载完成后）
document.addEventListener('DOMContentLoaded', () => {
    console.log('=' .repeat(50));
    console.log('📊 初始化AI分析功能...');
    console.log('=' .repeat(50));
    
    // 加载上次选择的模型
    loadSelectedModel();
    
    // 模型名称映射（用于显示）
    const modelNameMap = {
        'doubao-seed-1-6-thinking-250715': '豆包',
        'deepseek-chat': 'DeepSeek',
        'qwen3-max': 'Qwen',
        'glm-4.6': 'GLM',
        'MiniMax-M2': 'MiniMax',
        'kimi-k2-0905-preview': 'Kimi',
        'gpt-5': 'GPT',
        'claude-sonnet-4-5': 'Claude',
        'google-ai-studio/gemini-2.5-pro': 'Gemini',
        'grok/grok-4': 'Grok'
    };
    
    // 更新模型选择器显示
    const modelSelectorDisplay = document.getElementById('model-selector-display');
    if (modelSelectorDisplay) {
        modelSelectorDisplay.textContent = modelNameMap[selectedModel] || 'DeepSeek';
    }
    
    // 模型选择器下拉选项事件
    const modelSelectorOptions = document.querySelectorAll('.model-selector-option');
    if (modelSelectorOptions.length > 0) {
        modelSelectorOptions.forEach(option => {
            option.addEventListener('click', function() {
                // 初始化AudioContext（用户交互时）
                initAudioContext();
                
                // 获取选中的模型
                const modelValue = this.getAttribute('data-model');
                selectedModel = modelValue;
                
                // 更新显示文本
                if (modelSelectorDisplay) {
                    modelSelectorDisplay.textContent = this.textContent;
                }
                
                console.log('[模型选择] 切换到模型:', selectedModel);
                
                // 保存模型选择
                saveSelectedModel();
                
                // 自动触发分析
                performAnalysis();
            });
        });
        console.log('[初始化] 模型选择器事件已绑定，当前模型:', selectedModel);
    } else {
        console.warn('[初始化] 模型选择器未找到');
    }
    
    // 在用户首次点击页面时初始化AudioContext（以便音效可以播放）
    const initAudioOnInteraction = () => {
        initAudioContext();
        // 移除事件监听器，只初始化一次
        document.removeEventListener('click', initAudioOnInteraction);
        document.removeEventListener('keydown', initAudioOnInteraction);
        document.removeEventListener('touchstart', initAudioOnInteraction);
    };
    document.addEventListener('click', initAudioOnInteraction, { once: true });
    document.addEventListener('keydown', initAudioOnInteraction, { once: true });
    document.addEventListener('touchstart', initAudioOnInteraction, { once: true });
    
    // 页面加载完成，显示使用的API
    console.log('[页面初始化] 使用的API URL:', API_CONFIG.llmApiUrl);
    
    // 初始化时获取一次K线数据并自动触发AI分析
    setTimeout(async () => {
        try {
            // 获取1分钟和15分钟K线数据
            const [domesticData, londonData, domestic15mData, london15mData] = await Promise.all([
                fetchKlineData(API_CONFIG.domesticSymbol),
                fetchKlineData(API_CONFIG.londonSymbol),
                fetchKlineData(API_CONFIG.domesticSymbol, 'm15', 90),
                fetchKlineData(API_CONFIG.londonSymbol, 'm15', 90)
            ]);
            
            currentDomesticKlineData = domesticData;
            currentLondonKlineData = londonData;
            console.log('1分钟K线数据已缓存，可用于分析');
            console.log('15分钟K线数据已获取，准备预测');
            
            // 自动触发AI分析（只有在没有手动触发过的情况下）
            if ((domesticData && domesticData.length > 0) || (londonData && londonData.length > 0)) {
                if (!isAnalyzing) {
                    console.log('[自动触发] 页面加载完成，自动触发AI分析和K线预测');
                    performAnalysis();
                } else {
                    console.log('[自动触发] 已有分析在进行中，跳过自动触发');
                }
            } else {
                console.warn('[自动触发] 没有足够的K线数据，跳过自动分析');
            }
        } catch (error) {
            console.warn('初始化K线数据失败:', error);
        }
    }, 2000); // 延迟2秒，确保页面已加载完成
});

// ============================================
// 套利追踪功能
// ============================================

/**
 * 计算两个市场最近5根K线的差异和套利机会
 * @param {Array} londonKlines - 伦敦白银K线数据（至少5根）
 * @param {Array} domesticKlines - 国内白银K线数据（至少5根）
 * @returns {Object} 套利分析结果
 */
function calculateArbitrageOpportunity(londonKlines, domesticKlines) {
    if (!londonKlines || !domesticKlines || londonKlines.length < 5 || domesticKlines.length < 5) {
        return null;
    }
    
    // 取最近5根K线
    const londonRecent = londonKlines.slice(-5);
    const domesticRecent = domesticKlines.slice(-5);
    
    // 汇率：1美元约等于235元人民币（用于价格对比）
    const EXCHANGE_RATE = 235;
    
    let totalSimilarity = 0;
    let trendConsistency = 0;
    let amplitudeDiff = 0;
    let shapeSimilarity = 0;
    
    const klineComparisons = [];
    
    // 逐根K线对比
    for (let i = 0; i < 5; i++) {
        const london = londonRecent[i];
        const domestic = domesticRecent[i];
        
        // 1. 计算涨跌幅（相对变化率）
        const londonChange = ((london.c - london.o) / london.o) * 100;
        const domesticChange = ((domestic.c - domestic.o) / domestic.o) * 100;
        const changeConsistency = 100 - Math.min(Math.abs(londonChange - domesticChange) * 10, 100);
        
        // 2. 计算振幅（相对于开盘价的百分比）
        const londonAmplitude = ((london.h - london.l) / london.o) * 100;
        const domesticAmplitude = ((domestic.h - domestic.l) / domestic.o) * 100;
        const amplitudeConsistency = 100 - Math.min(Math.abs(londonAmplitude - domesticAmplitude) * 10, 100);
        
        // 3. 趋势方向一致性（涨跌方向是否相同）
        const londonDirection = london.c >= london.o ? 1 : -1;
        const domesticDirection = domestic.c >= domestic.o ? 1 : -1;
        const directionMatch = londonDirection === domesticDirection ? 100 : 0;
        
        // 4. K线形态相似度（实体比例、上下影线比例）
        const londonBody = Math.abs(london.c - london.o);
        const londonRange = london.h - london.l;
        const londonBodyRatio = londonRange > 0 ? londonBody / londonRange : 0;
        
        const domesticBody = Math.abs(domestic.c - domestic.o);
        const domesticRange = domestic.h - domestic.l;
        const domesticBodyRatio = domesticRange > 0 ? domesticBody / domesticRange : 0;
        
        const bodyRatioConsistency = 100 - Math.min(Math.abs(londonBodyRatio - domesticBodyRatio) * 100, 100);
        
        // 单根K线的综合相似度
        const klineSimilarity = (
            changeConsistency * 0.35 +      // 涨跌幅相似度权重35%
            amplitudeConsistency * 0.25 +   // 振幅相似度权重25%
            directionMatch * 0.30 +          // 方向一致性权重30%
            bodyRatioConsistency * 0.10      // 形态相似度权重10%
        );
        
        totalSimilarity += klineSimilarity;
        trendConsistency += directionMatch;
        amplitudeDiff += Math.abs(londonAmplitude - domesticAmplitude);
        shapeSimilarity += bodyRatioConsistency;
        
        // 保存每根K线的对比信息
        klineComparisons.push({
            index: i + 1,
            londonChange: londonChange,
            domesticChange: domesticChange,
            londonAmplitude: londonAmplitude,
            domesticAmplitude: domesticAmplitude,
            similarity: klineSimilarity,
            directionMatch: londonDirection === domesticDirection
        });
    }
    
    // 计算综合指标
    const avgSimilarity = totalSimilarity / 5;
    const avgTrendConsistency = trendConsistency / 5;
    const avgAmplitudeDiff = amplitudeDiff / 5;
    const avgShapeSimilarity = shapeSimilarity / 5;
    
    // 分析套利机会
    let opportunityType = 'normal';
    let opportunityText = '两市场走势基本一致';
    let opportunityScore = 0;
    
    // 检查是否有套利机会
    const lastLondonChange = klineComparisons[4].londonChange;
    const lastDomesticChange = klineComparisons[4].domesticChange;
    const changeDiff = lastLondonChange - lastDomesticChange;
    
    // 套利机会识别逻辑
    if (Math.abs(changeDiff) > 0.3) {
        if (changeDiff > 0.3) {
            // 伦敦涨幅大于国内，预期国内会补涨
            opportunityType = 'long_domestic';
            opportunityText = `国内可能补涨 (差${Math.abs(changeDiff).toFixed(2)}%)`;
            opportunityScore = Math.min(Math.abs(changeDiff) * 20, 100);
        } else if (changeDiff < -0.3) {
            // 伦敦跌幅大于国内，预期国内会补跌
            opportunityType = 'short_domestic';
            opportunityText = `国内可能补跌 (差${Math.abs(changeDiff).toFixed(2)}%)`;
            opportunityScore = Math.min(Math.abs(changeDiff) * 20, 100);
        }
    } else if (avgSimilarity > 85) {
        opportunityText = '两市场高度同步，暂无明显套利机会';
    } else if (avgSimilarity < 60) {
        opportunityText = '两市场走势分化，谨慎操作';
    }
    
    return {
        similarity: avgSimilarity,
        trendConsistency: avgTrendConsistency,
        amplitudeDiff: avgAmplitudeDiff,
        shapeSimilarity: avgShapeSimilarity,
        klineComparisons: klineComparisons,
        opportunity: {
            type: opportunityType,
            text: opportunityText,
            score: opportunityScore
        }
    };
}

/**
 * 更新套利追踪显示
 */
function updateArbitrageDisplay() {
    const container = document.getElementById('arbitrage-content');
    const timeElement = document.getElementById('arbitrage-update-time');
    
    if (!container) {
        return;
    }
    
    // 检查是否有足够的K线数据
    if (!currentLondonKlineData || !currentDomesticKlineData || 
        currentLondonKlineData.length < 5 || currentDomesticKlineData.length < 5) {
        container.innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 10px;">数据加载中...</div>';
        return;
    }
    
    // 计算套利机会
    const analysis = calculateArbitrageOpportunity(currentLondonKlineData, currentDomesticKlineData);
    
    if (!analysis) {
        container.innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 10px;">分析失败</div>';
        return;
    }
    
    // 更新时间
    if (timeElement) {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        timeElement.textContent = timeStr;
    }
    
    // 根据相似度确定颜色
    let scoreColor;
    if (analysis.similarity >= 85) {
        scoreColor = '#10b981'; // 绿色：高度相似
    } else if (analysis.similarity >= 70) {
        scoreColor = '#3b82f6'; // 蓝色：较为相似
    } else if (analysis.similarity >= 50) {
        scoreColor = '#f59e0b'; // 橙色：一般相似
    } else {
        scoreColor = '#ef4444'; // 红色：差异较大
    }
    
    // 构建HTML
    let html = '';
    
    // 第一行：趋势一致性、相似度、振幅偏差
    html += '<div class="arbitrage-metrics-row">';
    
    // 趋势一致性
    const trendColor = analysis.trendConsistency >= 80 ? '#10b981' : (analysis.trendConsistency >= 60 ? '#f59e0b' : '#ef4444');
    html += '<div class="arbitrage-metric-item">';
    html += '<span class="arbitrage-metric-label">趋势一致性</span>';
    html += `<span class="arbitrage-metric-value" style="color: ${trendColor}">${analysis.trendConsistency.toFixed(0)}%</span>`;
    html += '</div>';
    
    // 相似度
    html += '<div class="arbitrage-metric-item">';
    html += '<span class="arbitrage-metric-label">相似度</span>';
    html += `<span class="arbitrage-metric-value" style="color: ${scoreColor}">${analysis.similarity.toFixed(1)}%</span>`;
    html += '</div>';
    
    // 振幅偏差
    const ampColor = analysis.amplitudeDiff < 0.5 ? '#10b981' : (analysis.amplitudeDiff < 1.0 ? '#f59e0b' : '#ef4444');
    html += '<div class="arbitrage-metric-item">';
    html += '<span class="arbitrage-metric-label">振幅偏差</span>';
    html += `<span class="arbitrage-metric-value" style="color: ${ampColor}">${analysis.amplitudeDiff.toFixed(2)}%</span>`;
    html += '</div>';
    
    html += '</div>';
    
    // 最近1根K线的涨跌幅差异展示（带方向）
    const latestComp = analysis.klineComparisons[4]; // 最新的K线（第5根）
    
    // 使用涨跌幅（带正负）
    const londonChangePercent = latestComp.londonChange; // 已经是涨跌幅百分比，有正负
    const domesticChangePercent = latestComp.domesticChange; // 已经是涨跌幅百分比，有正负
    
    // 计算相对差异：(伦敦振幅 - 国内振幅) / max(|伦敦振幅|, |国内振幅|) * 100%
    const maxAbsChange = Math.max(Math.abs(londonChangePercent), Math.abs(domesticChangePercent));
    let changeDiffPercent = 0;
    if (maxAbsChange > 0) {
        changeDiffPercent = ((londonChangePercent - domesticChangePercent) / maxAbsChange) * 100;
    }
    const changeDiffColor = changeDiffPercent > 0 ? '#ef4444' : '#10b981'; // 向上红色，向下绿色
    const changeDiffSign = changeDiffPercent > 0 ? '+' : '';
    
    // 伦敦和国内的颜色根据涨跌显示
    const londonColor = londonChangePercent >= 0 ? '#ef4444' : '#10b981';
    const domesticColor = domesticChangePercent >= 0 ? '#ef4444' : '#10b981';
    const londonSign = londonChangePercent > 0 ? '+' : '';
    const domesticSign = domesticChangePercent > 0 ? '+' : '';
    
    // 计算进度条的宽度（差异百分比直接对应进度条）
    const changeDiffAbs = Math.abs(changeDiffPercent);
    const progressWidth = Math.min(changeDiffAbs, 100); // 差异百分比直接映射到进度条
    
    // 第二行：伦敦振幅、国内振幅、振幅差异（一行三列）
    html += '<div class="arbitrage-metrics-row">';
    
    // 伦敦振幅
    html += '<div class="arbitrage-metric-item">';
    html += '<span class="arbitrage-metric-label">伦敦振幅</span>';
    html += `<span class="arbitrage-metric-value" style="color: ${londonColor}">${londonSign}${londonChangePercent.toFixed(2)}%</span>`;
    html += '</div>';
    
    // 国内振幅
    html += '<div class="arbitrage-metric-item">';
    html += '<span class="arbitrage-metric-label">国内振幅</span>';
    html += `<span class="arbitrage-metric-value" style="color: ${domesticColor}">${domesticSign}${domesticChangePercent.toFixed(2)}%</span>`;
    html += '</div>';
    
    // 振幅差异
    html += '<div class="arbitrage-metric-item">';
    html += '<span class="arbitrage-metric-label">振幅差异</span>';
    html += `<span class="arbitrage-metric-value" style="color: ${changeDiffColor}">${changeDiffSign}${changeDiffPercent.toFixed(2)}%</span>`;
    html += '</div>';
    
    html += '</div>';
    
    // 差异进度条
    html += '<div class="arbitrage-diff-progress-section">';
    html += '<div class="arbitrage-amplitude-progress-bar">';
    html += `<div class="arbitrage-amplitude-progress-fill" style="width: ${progressWidth}%; background: ${changeDiffColor}"></div>`;
    html += '</div>';
    html += '</div>';
    
    // 套利机会提示
    if (analysis.opportunity.score > 30) {
        html += '<div class="arbitrage-opportunity">';
        html += '<div class="arbitrage-opportunity-title">⚡ 套利机会</div>';
        html += `<div class="arbitrage-opportunity-text">${analysis.opportunity.text}</div>`;
        html += '</div>';
    }
    
    container.innerHTML = html;
}

// 在K线更新时自动更新套利追踪
// 在updateChart函数中调用（需要在适当位置添加）

