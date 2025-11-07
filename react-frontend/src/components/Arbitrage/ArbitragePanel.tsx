// 套利追踪面板组件
import React, { useMemo, useState, useEffect } from 'react';
import { formatPrice } from '../../utils/chart';
import { formatTime } from '../../utils/time';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import type { KlineData } from '../../types';
import './ArbitragePanel.css';

interface ArbitragePanelProps {
  londonData: KlineData[];
  domesticData: KlineData[];
  isLoading?: boolean;
}

export const ArbitragePanel: React.FC<ArbitragePanelProps> = React.memo(
  ({ londonData, domesticData, isLoading }) => {
    // 控制提示显示状态
    const [showOpportunity, setShowOpportunity] = useState(false);
    
    // 计算套利指标（只追踪最后一根K线）
    const arbitrageMetrics = useMemo(() => {
      if (!londonData || londonData.length < 2 || !domesticData || domesticData.length < 2) {
        return null;
      }

      // 只取最后一根K线和前一根K线（用于计算变化率）
      const londonLatest = londonData[londonData.length - 1];
      const londonPrevious = londonData[londonData.length - 2];
      const domesticLatest = domesticData[domesticData.length - 1];
      const domesticPrevious = domesticData[domesticData.length - 2];

      // 计算相关性（基于最后一根K线的变化方向）
      const londonChange = ((londonLatest.c - londonPrevious.c) / londonPrevious.c) * 100;
      const domesticChange = ((domesticLatest.c - domesticPrevious.c) / domesticPrevious.c) * 100;
      
      // 简化的相关性：同向为正，反向为负
      const correlation = londonChange * domesticChange > 0 
        ? Math.min(Math.abs(londonChange), Math.abs(domesticChange)) / Math.max(Math.abs(londonChange), Math.abs(domesticChange))
        : -Math.min(Math.abs(londonChange), Math.abs(domesticChange)) / Math.max(Math.abs(londonChange), Math.abs(domesticChange));

      // 计算价差
      const exchangeRate = 235; // 汇率
      const priceDiff = domesticLatest.c - londonLatest.c * exchangeRate;

      // 计算最后一根K线的振幅
      const londonAmplitude = ((londonLatest.h - londonLatest.l) / londonLatest.l) * 100;
      const domesticAmplitude = ((domesticLatest.h - domesticLatest.l) / domesticLatest.l) * 100;
      const amplitudeDiff = Math.abs(domesticAmplitude - londonAmplitude);

      // 计算套利得分 (0-100)
      const correlationScore = Math.abs(correlation) * 50; // 相关性贡献50分
      const amplitudeScore = Math.min(amplitudeDiff * 10, 50); // 振幅差贡献50分
      const score = Math.min(correlationScore + amplitudeScore, 100);

      // 判断套利方向（多单或空单）
      // 逻辑：
      // 1. 如果国内相对伦敦涨得更快/跌得更慢 -> 做空国内（空单）
      // 2. 如果国内相对伦敦涨得更慢/跌得更快 -> 做多国内（多单）
      const domesticStrength = domesticChange - londonChange; // 正值表示国内更强
      let direction: 'long' | 'short' | 'neutral';
      // 降低阈值到0.01%，使其更敏感
      if (Math.abs(domesticStrength) < 0.01) {
        direction = 'neutral'; // 差异太小，不建议套利
      } else if (domesticStrength > 0) {
        direction = 'short'; // 国内相对更强，做空国内
      } else {
        direction = 'long'; // 国内相对更弱，做多国内
      }

      return {
        score: Math.round(score),
        correlation: Number(correlation.toFixed(3)),
        priceDiff: Number(priceDiff.toFixed(2)),
        londonAmplitude: Number(londonAmplitude.toFixed(3)),
        domesticAmplitude: Number(domesticAmplitude.toFixed(3)),
        amplitudeDiff: Number(amplitudeDiff.toFixed(3)),
        direction,
        domesticStrength: Number(domesticStrength.toFixed(3)),
      };
    }, [londonData, domesticData]);

    // 控制提示显示逻辑：当有新的套利机会时显示，5秒后自动隐藏
    useEffect(() => {
      if (arbitrageMetrics && arbitrageMetrics.score >= 40 && arbitrageMetrics.direction !== 'neutral') {
        // 显示提示
        setShowOpportunity(true);
        
        // 5秒后自动隐藏
        const timer = setTimeout(() => {
          setShowOpportunity(false);
        }, 5000);
        
        // 清理定时器
        return () => clearTimeout(timer);
      } else {
        // 如果条件不满足，立即隐藏
        setShowOpportunity(false);
      }
    }, [arbitrageMetrics?.score, arbitrageMetrics?.direction]);

    if (isLoading) {
      return (
        <div className="arbitrage-panel">
          <div className="arbitrage-header">
            <h3>套利追踪</h3>
          </div>
          <LoadingSpinner text="分析中..." size="small" />
        </div>
      );
    }

    if (!arbitrageMetrics) {
      return (
        <div className="arbitrage-panel">
          <div className="arbitrage-header">
            <h3>最后1根K线套利</h3>
          </div>
          <div className="no-data">数据不足，需要至少2根K线</div>
        </div>
      );
    }

    // 确定得分颜色
    const getScoreColor = (score: number) => {
      if (score >= 70) return '#ef4444'; // 高机会 - 红色
      return '#4ade80'; // 低机会 - 绿色
    };

    return (
      <div className="arbitrage-panel">
        <div className="arbitrage-header">
          <h3>最后1根K线套利</h3>
          <span className="arbitrage-update-time">{formatTime(Date.now())}</span>
        </div>

        <div className="arbitrage-content">
          {/* 套利得分 */}
          <div className="arbitrage-score-section">
            <div className="arbitrage-score-main">
              <span className="arbitrage-score-label">套利机会指数</span>
              <span 
                className="arbitrage-score-value"
                style={{ color: getScoreColor(arbitrageMetrics.score) }}
              >
                {arbitrageMetrics.score}
              </span>
            </div>
            <div className="arbitrage-score-bar">
              <div
                className="arbitrage-score-fill"
                style={{
                  width: `${arbitrageMetrics.score}%`,
                  backgroundColor: getScoreColor(arbitrageMetrics.score),
                }}
              />
            </div>
          </div>

          {/* 关键指标 */}
          <div className="arbitrage-metrics-row">
            <div className="arbitrage-metric-item">
              <div className="arbitrage-metric-label">相关性</div>
              <div 
                className="arbitrage-metric-value"
                style={{ color: Math.abs(arbitrageMetrics.correlation) > 0.7 ? '#4ade80' : '#fbbf24' }}
              >
                {arbitrageMetrics.correlation.toFixed(2)}
              </div>
            </div>
            <div className="arbitrage-metric-item">
              <div className="arbitrage-metric-label">振幅差</div>
              <div className="arbitrage-metric-value">
                {arbitrageMetrics.amplitudeDiff.toFixed(2)}%
              </div>
            </div>
            <div className="arbitrage-metric-item">
              <div className="arbitrage-metric-label">套利方向</div>
              <div 
                className="arbitrage-metric-value"
                style={{ 
                  color: arbitrageMetrics.direction === 'long' ? '#ef4444' : 
                         arbitrageMetrics.direction === 'short' ? '#4ade80' : '#9ca3af',
                  fontWeight: 'bold'
                }}
              >
                {arbitrageMetrics.direction === 'long' ? '多单' :
                 arbitrageMetrics.direction === 'short' ? '空单' : '观望'}
              </div>
            </div>
          </div>

          {/* 套利机会提示 */}
          {showOpportunity && arbitrageMetrics && (
            <div className="arbitrage-opportunity">
              <div className="arbitrage-opportunity-text">
                <span style={{ 
                  color: '#ffffff',
                  backgroundColor: arbitrageMetrics.direction === 'long' ? '#ef4444' : '#4ade80',
                  fontWeight: 'bold',
                  fontSize: '18px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  display: 'inline-block'
                }}>
                  {arbitrageMetrics.direction === 'long' ? '买多' : '卖空'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

ArbitragePanel.displayName = 'ArbitragePanel';

