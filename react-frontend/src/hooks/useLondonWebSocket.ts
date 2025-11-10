import { useEffect, useRef } from 'react';
import type { KlineData } from '../types';

interface AllTickKlineResponse {
  cmd_id: number;
  data?: {
    kline_list?: Array<{
      code: string;
      kline_type: number;
      kline_timestamp: number;
      open: number;
      close: number;
      high: number;
      low: number;
      volume: number;
      amount: number;
    }>;
  };
}

interface AllTickTradeTickResponse {
  cmd_id: number;
  data?: {
    symbol_list?: Array<{
      code: string;
      latest_price: number;
      latest_timestamp: number;
    }>;
  };
}

interface UseLondonWebSocketOptions {
  symbol: string;
  wsUrl: string;
  token: string;
  enabled?: boolean;
  onKlineUpdate?: (kline: KlineData) => void;
  onInitialData?: (klines: KlineData[]) => void;
  onTradeTickUpdate?: (price: number, timestamp: number) => void;
  onStatusChange?: (status: 'connected' | 'connecting' | 'error' | 'closed') => void;
}

export const useLondonWebSocket = ({
  symbol,
  wsUrl,
  token,
  enabled = true,
  onKlineUpdate,
  onInitialData,
  onTradeTickUpdate,
  onStatusChange,
}: UseLondonWebSocketOptions) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const seqIdRef = useRef(1);
  const mountedRef = useRef(true);
  const klineBufferRef = useRef<KlineData[]>([]);
  const lastUpdateTimeRef = useRef<number>(0);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const HEARTBEAT_INTERVAL = 30000; // 30秒心跳（减少频率，避免过度订阅）
  const RECONNECT_DELAY = 5000; // 5秒后重连（增加延迟，避免频繁重连）
  const MIN_UPDATE_INTERVAL = 200; // 最小更新间隔200ms（每秒最多5次）

  // 订阅K线（带状态检查，避免重复订阅）
  const lastSubscribeTimeRef = useRef<number>(0);
  const SUBSCRIBE_THROTTLE = 5000; // 5秒内不重复订阅
  
  const subscribeKline = (ws: WebSocket, force: boolean = false) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    // 节流：避免短时间内重复订阅
    const now = Date.now();
    if (!force && now - lastSubscribeTimeRef.current < SUBSCRIBE_THROTTLE) {
      console.log('[AllTick] 跳过重复订阅K线（节流中）');
      return;
    }
    
    const seqId = seqIdRef.current++;
    const trace = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const subscribeMsg = {
      cmd_id: 22006, // 订阅K线协议号
      seq_id: seqId,
      trace: trace,
      data: {
        symbol_list: [
          {
            code: symbol,
            kline_type: 1, // 1分钟K线
          },
        ],
      },
    };

    ws.send(JSON.stringify(subscribeMsg));
    lastSubscribeTimeRef.current = now;
    console.log('[AllTick] 已订阅K线:', symbol);
  };

  // 订阅实时价格（带状态检查，避免重复订阅）
  const subscribeTradeTick = (ws: WebSocket, force: boolean = false) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    // 节流：避免短时间内重复订阅
    const now = Date.now();
    if (!force && now - lastSubscribeTimeRef.current < SUBSCRIBE_THROTTLE) {
      console.log('[AllTick] 跳过重复订阅实时价格（节流中）');
      return;
    }
    
    const seqId = seqIdRef.current++;
    const trace = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const subscribeMsg = {
      cmd_id: 22004, // 订阅最新成交价协议号
      seq_id: seqId,
      trace: trace,
      data: {
        symbol_list: [
          {
            code: symbol,
          },
        ],
      },
    };

    ws.send(JSON.stringify(subscribeMsg));
    console.log('[AllTick] 已订阅实时价格:', symbol);
  };

  // 发送心跳（心跳不触发节流检查）
  const sendHeartbeat = (ws: WebSocket) => {
    if (ws.readyState === WebSocket.OPEN) {
      // AllTick的心跳是重新发送订阅请求（强制发送，跳过节流）
      subscribeKline(ws, true);
      subscribeTradeTick(ws, true);
    }
  };

  // 启动心跳
  const startHeartbeat = (ws: WebSocket) => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }

    heartbeatTimerRef.current = setInterval(() => {
      if (mountedRef.current && ws.readyState === WebSocket.OPEN) {
        sendHeartbeat(ws);
      }
    }, HEARTBEAT_INTERVAL);
  };

  // 停止心跳
  const stopHeartbeat = () => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  };

  // 转换AllTick K线数据为标准格式
  const convertKlineData = (kline: any): KlineData => {
    return {
      t: kline.kline_timestamp * 1000, // 秒转毫秒
      o: parseFloat(kline.open) || 0,
      c: parseFloat(kline.close) || 0,
      h: parseFloat(kline.high) || 0,
      l: parseFloat(kline.low) || 0,
      v: parseFloat(kline.volume) || 0,
      tu: parseFloat(kline.amount) || 0,
    };
  };

  // 处理WebSocket消息
  const handleMessage = (data: AllTickKlineResponse | AllTickTradeTickResponse) => {
    if (!mountedRef.current) return;

    try {
      // K线数据推送 (cmd_id: 22006)
      if (data.cmd_id === 22006 && data.data?.kline_list) {
        const klineList = data.data.kline_list;

        if (klineList.length > 0) {
          const latestKline = klineList[klineList.length - 1];
          const convertedKline = convertKlineData(latestKline);

          // 如果是第一批数据
          if (klineBufferRef.current.length === 0) {
            const allKlines = klineList.map(convertKlineData);
            klineBufferRef.current = allKlines;
            onInitialData?.(allKlines);
            lastUpdateTimeRef.current = Date.now();
            console.log('[AllTick] 收到初始K线数据:', allKlines.length, '条');
          } else {
            // 节流：最多每200ms更新一次
            const now = Date.now();
            if (now - lastUpdateTimeRef.current >= MIN_UPDATE_INTERVAL) {
              onKlineUpdate?.(convertedKline);
              lastUpdateTimeRef.current = now;
            }
          }
        }
      }

      // 实时价格推送 (cmd_id: 22004)
      if (data.cmd_id === 22004 && data.data?.symbol_list) {
        const symbolData = data.data.symbol_list[0];
        if (symbolData && symbolData.latest_price) {
          onTradeTickUpdate?.(symbolData.latest_price, symbolData.latest_timestamp * 1000);
        }
      }
    } catch (error) {
      console.error('[AllTick] 处理消息失败:', error);
    }
  };

  // 连接WebSocket
  const connect = () => {
    if (!enabled || !mountedRef.current) return;

    onStatusChange?.('connecting');
    console.log('[AllTick] 正在连接...', symbol);

    const fullWsUrl = `${wsUrl}?token=${token}`;

    try {
      const ws = new WebSocket(fullWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        console.log('[AllTick] ✓ 已连接:', symbol);
        reconnectAttemptsRef.current = 0;
        onStatusChange?.('connected');

        // 订阅数据（首次连接，强制发送）
        subscribeKline(ws, true);
        subscribeTradeTick(ws, true);

        // 启动心跳
        startHeartbeat(ws);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          console.error('[AllTick] 解析消息失败:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[AllTick] WebSocket错误:', error);
        onStatusChange?.('error');
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;

        console.log('[AllTick] ✗ 连接已关闭:', symbol);
        onStatusChange?.('closed');
        stopHeartbeat();

        // 尝试重连
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          console.log(
            `[AllTick] 尝试重连 (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`
          );

          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, RECONNECT_DELAY);
        } else {
          console.error('[AllTick] 达到最大重连次数，停止重连');
          onStatusChange?.('error');
        }
      };
    } catch (error) {
      console.error('[AllTick] 创建WebSocket失败:', error);
      onStatusChange?.('error');
    }
  };

  // 断开连接
  const disconnect = () => {
    mountedRef.current = false;

    stopHeartbeat();

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    klineBufferRef.current = [];
  };

  // 初始化连接
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, symbol]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnectAttempts: reconnectAttemptsRef.current,
  };
};

