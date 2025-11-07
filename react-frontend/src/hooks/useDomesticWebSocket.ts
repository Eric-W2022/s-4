// 国内白银 WebSocket Hook
import { useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../constants';
import type { KlineData } from '../types';

interface UseDomesticWebSocketOptions {
  enabled?: boolean;
  onKlineUpdate: (kline: KlineData) => void;
  onInitialData: (klines: KlineData[]) => void;
  onStatusChange: (status: 'connected' | 'connecting' | 'error' | 'closed') => void;
}

export const useDomesticWebSocket = (options: UseDomesticWebSocketOptions) => {
  const { enabled = true, onKlineUpdate, onInitialData, onStatusChange } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    // 清理旧连接
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        try {
          wsRef.current.close();
        } catch (e) {
          console.error('[WebSocket] 关闭旧连接失败:', e);
        }
      }
      wsRef.current = null;
    }

    // 如果已卸载，不再连接
    if (!mountedRef.current) return;

    const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + '/ws/domestic';
    console.log('[WebSocket] 正在连接:', wsUrl);
    onStatusChange('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        console.log('[WebSocket] ✓ 已连接');
        reconnectAttemptsRef.current = 0;
        onStatusChange('connected');
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'kline' && Array.isArray(message.data)) {
            // 初始K线数据
            console.log('[WebSocket] 收到初始K线数据:', message.data.length, '条');
            onInitialData(message.data);
          } else if (message.type === 'kline_update' && message.data) {
            // K线更新
            onKlineUpdate(message.data);
          }
        } catch (error) {
          console.error('[WebSocket] 解析消息失败:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] 错误:', error);
        if (mountedRef.current) {
          onStatusChange('error');
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] 连接关闭');
        if (!mountedRef.current) return;
        
        onStatusChange('closed');
        
        // 尝试重连
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * reconnectAttemptsRef.current, 5000);
          console.log(`[WebSocket] ${delay}ms 后尝试重连 (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, delay);
        } else {
          console.error('[WebSocket] 达到最大重连次数，停止重连');
          onStatusChange('error');
        }
      };
    } catch (error) {
      console.error('[WebSocket] 创建连接失败:', error);
      onStatusChange('error');
    }
  }, [onKlineUpdate, onInitialData, onStatusChange]);

  useEffect(() => {
    if (!enabled) {
      console.log('[WebSocket] WebSocket 已禁用');
      return;
    }

    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {
          console.error('[WebSocket] 清理时关闭连接失败:', e);
        }
        wsRef.current = null;
      }
    };
  }, [enabled, connect]);

  return {
    reconnect: () => {
      reconnectAttemptsRef.current = 0;
      connect();
    },
  };
};

