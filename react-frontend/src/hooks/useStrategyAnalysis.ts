// 策略分析Hook
import { useEffect, useRef, useState, useCallback } from 'react';
import { strategyApi } from '../api/strategy';
import { createStrategyAnalysisRequest } from '../prompts/strategyPrompts';
import type { KlineData, DepthData, ModelType } from '../types';

interface UseStrategyAnalysisProps {
  model: ModelType;
  londonKline1m: KlineData[];
  londonKline15m: KlineData[];
  londonKlineDaily: KlineData[];
  domesticKline1m: KlineData[];
  domesticKline15m: KlineData[];
  domesticKlineDaily: KlineData[];
  domesticDepth: DepthData | null;
  enabled?: boolean;
  interval?: number; // 自动分析间隔（毫秒），默认60秒
}

export function useStrategyAnalysis({
  model,
  londonKline1m,
  londonKline15m,
  londonKlineDaily,
  domesticKline1m,
  domesticKline15m,
  domesticKlineDaily,
  domesticDepth,
  enabled = true,
  interval = 60000, // 默认60秒
}: UseStrategyAnalysisProps) {
  const [strategy, setStrategy] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastAnalysisTime = useRef<number>(0);
  const isAnalyzing = useRef(false);

  // 执行策略分析
  const analyzeStrategy = useCallback(async () => {
    // 防止重复调用
    if (isAnalyzing.current) {
      console.log('[策略分析] 正在分析中，跳过本次调用');
      return;
    }

    // 检查数据是否完整
    if (
      !londonKline1m.length ||
      !londonKline15m.length ||
      !londonKlineDaily.length ||
      !domesticKline1m.length ||
      !domesticKline15m.length ||
      !domesticKlineDaily.length
    ) {
      console.log('[策略分析] 数据未完整，等待数据加载');
      return;
    }

    // 检查时间间隔
    const now = Date.now();
    if (now - lastAnalysisTime.current < interval) {
      console.log('[策略分析] 未到分析时间，跳过本次调用');
      return;
    }

    try {
      isAnalyzing.current = true;
      setIsLoading(true);
      setError(null);
      
      console.log('[策略分析] 开始分析，使用模型:', model);
      
      const request = createStrategyAnalysisRequest(
        model,
        londonKline1m,
        londonKline15m,
        londonKlineDaily,
        domesticKline1m,
        domesticKline15m,
        domesticKlineDaily,
        domesticDepth
      );

      const result = await strategyApi.analyzeStrategy(request);
      
      console.log('[策略分析] 分析完成:', result);
      
      setStrategy({
        ...result,
        timestamp: now,
        model,
      });
      
      lastAnalysisTime.current = now;
    } catch (err: any) {
      console.error('[策略分析] 分析失败:', err);
      setError(err.message || '分析失败');
    } finally {
      setIsLoading(false);
      isAnalyzing.current = false;
    }
  }, [
    model,
    londonKline1m,
    londonKline15m,
    londonKlineDaily,
    domesticKline1m,
    domesticKline15m,
    domesticKlineDaily,
    domesticDepth,
    interval,
  ]);

  // 手动触发分析
  const triggerAnalysis = useCallback(() => {
    lastAnalysisTime.current = 0; // 重置时间，允许立即分析
    analyzeStrategy();
  }, [analyzeStrategy]);

  // 自动定时分析
  useEffect(() => {
    if (!enabled) return;

    // 首次分析（延迟5秒，等待数据加载）
    const initialTimer = setTimeout(() => {
      analyzeStrategy();
    }, 5000);

    // 定时分析
    const timer = setInterval(() => {
      analyzeStrategy();
    }, interval);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [enabled, analyzeStrategy, interval]);

  return {
    strategy,
    isLoading,
    error,
    triggerAnalysis,
  };
}

