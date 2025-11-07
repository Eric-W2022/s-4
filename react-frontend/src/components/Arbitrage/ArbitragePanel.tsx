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
    // 计算套利指标
    const arbitrageMetrics = useMemo(() => {
      if (!londonData || londonData.length < 5 || !domesticData || domesticData.length < 5) {
        return null;
      }

      // 取最近5根K线
      const londonRecent = londonData.slice(-5);
      const domesticRecent = domesticData.slice(-5);

      // 计算相关性
      const calculateCorrelation = () => {
        const londonChanges = londonRecent.map((k, i) => 
          i > 0 ? ((k.c - londonRecent[i - 1].c) / londonRecent[i - 1].c) * 100 : 0
        ).slice(1);
        const domesticChanges = domesticRecent.map((k, i) => 
          i > 0 ? ((k.c - domesticRecent[i - 1].c) / domesticRecent[i - 1].c) * 100 : 0
        ).slice(1);

        const n = londonChanges.length;
        const meanLondon = londonChanges.reduce((a, b) => a + b, 0) / n;
        const meanDomestic = domesticChanges.reduce((a, b) => a + b, 0) / n;

        let numerator = 0;
        let denomLondon = 0;
        let denomDomestic = 0;

        for (let i = 0; i < n; i++) {
          const diffLondon = londonChanges[i] - meanLondon;
          const diffDomestic = domesticChanges[i] - meanDomestic;
          numerator += diffLondon * diffDomestic;
          denomLondon += diffLondon * diffLondon;
          denomDomestic += diffDomestic * diffDomestic;
        }

        const correlation = numerator / Math.sqrt(denomLondon * denomDomestic);
        return isNaN(correlation) ? 0 : correlation;
      };

      // 计算价差
      const londonLatest = londonRecent[londonRecent.length - 1].c;
      const domesticLatest = domesticRecent[domesticRecent.length - 1].c;
      const exchangeRate = 235; // 汇率
      const priceDiff = domesticLatest - londonLatest * exchangeRate;

      // 计算振幅
      const londonAmplitude = londonRecent.reduce((sum, k) => {
        return sum + ((k.h - k.l) / k.l) * 100;
      }, 0) / londonRecent.length;

      const domesticAmplitude = domesticRecent.reduce((sum, k) => {
        return sum + ((k.h - k.l) / k.l) * 100;
      }, 0) / domesticRecent.length;

      const amplitudeDiff = Math.abs(domesticAmplitude - londonAmplitude);

      // 计算套利得分 (0-100)
      const correlation = calculateCorrelation();
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
            <h3>套利追踪（最近5根K线）</h3>
          </div>
          <div className="no-data">数据不足，需要至少5根K线</div>
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
          <h3>套利追踪（最近5根K线）</h3>
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
              <div className="arbitrage-metric-label">价差</div>
              <div 
                className="arbitrage-metric-value"
                style={{ color: arbitrageMetrics.priceDiff >= 0 ? '#ef4444' : '#4ade80' }}
              >
                {formatPrice(arbitrageMetrics.priceDiff)}
              </div>
            </div>
            <div className="arbitrage-metric-item">
              <div className="arbitrage-metric-label">振幅差</div>
              <div className="arbitrage-metric-value">
                {arbitrageMetrics.amplitudeDiff.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* 振幅分析 */}
          <div className="arbitrage-amplitude-section">
            <div className="arbitrage-amplitude-title">平均振幅对比</div>
            <div className="arbitrage-amplitude-content">
              <div className="arbitrage-amplitude-row">
                <span className="arbitrage-amplitude-label">伦敦白银</span>
                <span className="arbitrage-amplitude-value">
                  {arbitrageMetrics.londonAmplitude.toFixed(2)}%
                </span>
              </div>
              <div className="arbitrage-amplitude-row">
                <span className="arbitrage-amplitude-label">国内白银</span>
                <span className="arbitrage-amplitude-value">
                  {arbitrageMetrics.domesticAmplitude.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* 振幅差异进度条 */}
          <div className="arbitrage-amplitude-diff-section">
            <div className="arbitrage-amplitude-diff-header">
              <span className="arbitrage-amplitude-label">振幅差异</span>
              <span className="arbitrage-amplitude-diff-value">
                {arbitrageMetrics.amplitudeDiff.toFixed(2)}%
              </span>
            </div>
            <div className="arbitrage-diff-progress-section">
              <div className="arbitrage-amplitude-progress-bar">
                <div
                  className="arbitrage-amplitude-progress-fill"
                  style={{
                    width: `${Math.min(arbitrageMetrics.amplitudeDiff * 10, 100)}%`,
                    backgroundColor: arbitrageMetrics.amplitudeDiff > 5 ? '#f59e0b' : '#667eea',
                  }}
                />
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

