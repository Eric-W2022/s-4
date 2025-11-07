// 套利追踪面板组件
import React, { useMemo } from 'react';
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

      return {
        score: Math.round(score),
        correlation: Number(correlation.toFixed(3)),
        priceDiff: Number(priceDiff.toFixed(2)),
        londonAmplitude: Number(londonAmplitude.toFixed(3)),
        domesticAmplitude: Number(domesticAmplitude.toFixed(3)),
        amplitudeDiff: Number(amplitudeDiff.toFixed(3)),
      };
    }, [londonData, domesticData]);

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
            <h3>套利追踪（最后一根K线）</h3>
          </div>
          <div className="no-data">数据不足，需要至少2根K线</div>
        </div>
      );
    }

    // 确定得分颜色
    const getScoreColor = (score: number) => {
      if (score >= 70) return '#ef4444'; // 高机会 - 红色
      if (score >= 40) return '#fbbf24'; // 中等机会 - 黄色
      return '#4ade80'; // 低机会 - 绿色
    };

    return (
      <div className="arbitrage-panel">
        <div className="arbitrage-header">
          <h3>套利追踪（最后一根K线）</h3>
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
          </div>

          {/* 套利机会提示 */}
          {arbitrageMetrics.score >= 60 && (
            <div className="arbitrage-opportunity">
              <div className="arbitrage-opportunity-title">⚠️ 潜在套利机会</div>
              <div className="arbitrage-opportunity-text">
                两市场出现明显差异，建议关注
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

ArbitragePanel.displayName = 'ArbitragePanel';

