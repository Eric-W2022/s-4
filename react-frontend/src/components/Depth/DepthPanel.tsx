// 盘口深度面板组件
import React, { useMemo } from 'react';
import { formatPrice, formatVolume } from '../../utils/chart';
import { formatTime, formatTimestamp } from '../../utils/time';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import type { DepthData } from '../../types';
import './DepthPanel.css';

interface DepthPanelProps {
  data: DepthData | null;
  isLoading?: boolean;
}

export const DepthPanel: React.FC<DepthPanelProps> = React.memo(({ data, isLoading }) => {
  // 计算买卖盘情绪
  const emotion = useMemo(() => {
    if (!data) return null;
    
    const totalAsk = data.ask_volume.reduce((sum, vol) => sum + parseFloat(vol || '0'), 0);
    const totalBid = data.bid_volume.reduce((sum, vol) => sum + parseFloat(vol || '0'), 0);
    const total = totalAsk + totalBid;
    
    if (total === 0) return null;
    
    const askPercent = (totalAsk / total) * 100;
    const bidPercent = (totalBid / total) * 100;
    
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (bidPercent > askPercent + 10) {
      trend = 'bullish'; // 多方优势
    } else if (askPercent > bidPercent + 10) {
      trend = 'bearish'; // 空方优势
    }
    
    return {
      totalAsk,
      totalBid,
      askPercent,
      bidPercent,
      trend,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="depth-panel">
        <div className="depth-header">
          <h3>国内白银盘口</h3>
        </div>
        <LoadingSpinner text="加载盘口数据..." size="small" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="depth-panel">
        <div className="depth-header">
          <h3>国内白银盘口</h3>
        </div>
        <div className="no-data">暂无盘口数据</div>
      </div>
    );
  }

  return (
    <div className="depth-panel">
      <div className="depth-header">
        <h3>国内白银盘口</h3>
        <span className="depth-update-time">
          {data.datetime ? formatTimestamp(data.datetime, 'HH:mm:ss') : '--'}
        </span>
      </div>

      <div className="depth-content">
        {/* 买卖盘列表 */}
        <div className="depth-columns">
          {/* 卖盘 */}
          <div className="depth-column depth-column-ask">
            <div className="depth-column-header">卖盘 (空方)</div>
            <table className="depth-side-table">
              <tbody>
                {data.ask_price.slice().reverse().map((price, idx) => {
                  const actualIdx = data.ask_price.length - 1 - idx;
                  return (
                    <tr key={`ask-${actualIdx}`}>
                      <td className="depth-label">卖{actualIdx + 1}</td>
                      <td className="depth-price-ask">{formatPrice(price)}</td>
                      <td className="depth-vol">{formatVolume(data.ask_volume[actualIdx])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 买盘 */}
          <div className="depth-column depth-column-bid">
            <div className="depth-column-header">买盘 (多方)</div>
            <table className="depth-side-table">
              <tbody>
                {data.bid_price.map((price, idx) => (
                  <tr key={`bid-${idx}`}>
                    <td className="depth-label">买{idx + 1}</td>
                    <td className="depth-price-bid">{formatPrice(price)}</td>
                    <td className="depth-vol">{formatVolume(data.bid_volume[idx])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 情绪进度条 */}
        {emotion && (
          <div className="depth-emotion-bar">
            <div className="emotion-trend-indicator">
              <span className={`trend-badge trend-${emotion.trend}`}>
                {emotion.trend === 'bullish' ? '多方优势' : 
                 emotion.trend === 'bearish' ? '空方优势' : '多空平衡'}
              </span>
              <span className="trend-time">{formatTimestamp(Date.now(), 'HH:mm:ss')}</span>
            </div>
            <div className="emotion-bar-labels">
              <span className="emotion-label-ask">
                空方 {emotion.askPercent.toFixed(1)}%
                <small> ({formatVolume(emotion.totalAsk)})</small>
              </span>
              <span className="emotion-label-bid">
                多方 {emotion.bidPercent.toFixed(1)}%
                <small> ({formatVolume(emotion.totalBid)})</small>
              </span>
            </div>
            <div className="emotion-bar-container">
              <div 
                className="emotion-bar-ask" 
                style={{ width: `${emotion.askPercent}%` }}
              >
                {emotion.askPercent > 15 && (
                  <span className="emotion-bar-text">{emotion.askPercent.toFixed(0)}%</span>
                )}
              </div>
              <div 
                className="emotion-bar-bid" 
                style={{ width: `${emotion.bidPercent}%` }}
              >
                {emotion.bidPercent > 15 && (
                  <span className="emotion-bar-text">{emotion.bidPercent.toFixed(0)}%</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 扩展数据 */}
        {data.last_price && (
          <div className="depth-extended-data">
            <div className="extended-data-grid">
              <div className="extended-data-row">
                <div className="extended-data-item">
                  <div className="extended-label">最新价</div>
                  <div className="extended-value">{formatPrice(data.last_price)}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">涨跌</div>
                  <div className={`extended-value ${parseFloat(data.change || '0') >= 0 ? 'price-up' : 'price-down'}`}>
                    {data.change ? (parseFloat(data.change) >= 0 ? '+' : '') + formatPrice(data.change) : '--'}
                  </div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">涨跌幅</div>
                  <div className={`extended-value ${parseFloat(data.change_percent || '0') >= 0 ? 'price-up' : 'price-down'}`}>
                    {data.change_percent ? (parseFloat(data.change_percent) >= 0 ? '+' : '') + data.change_percent + '%' : '--'}
                  </div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">成交量</div>
                  <div className="extended-value">{data.volume ? formatVolume(data.volume) : '--'}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">昨持仓</div>
                  <div className="extended-value">{data.pre_open_interest ? formatVolume(data.pre_open_interest) : '--'}</div>
                </div>
              </div>
              <div className="extended-data-row">
                <div className="extended-data-item">
                  <div className="extended-label">开盘</div>
                  <div className="extended-value">{data.open ? formatPrice(data.open) : '--'}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">最高</div>
                  <div className="extended-value high-price">{data.highest ? formatPrice(data.highest) : '--'}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">最低</div>
                  <div className="extended-value low-price">{data.lowest ? formatPrice(data.lowest) : '--'}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">持仓量</div>
                  <div className="extended-value">{data.open_interest ? formatVolume(data.open_interest) : '--'}</div>
                </div>
                <div className="extended-data-item">
                  <div className="extended-label">持仓变化</div>
                  <div className={`extended-value ${
                    data.open_interest && data.pre_open_interest 
                      ? (parseFloat(data.open_interest) - parseFloat(data.pre_open_interest) >= 0 ? 'price-up' : 'price-down')
                      : ''
                  }`}>
                    {data.open_interest && data.pre_open_interest 
                      ? ((parseFloat(data.open_interest) - parseFloat(data.pre_open_interest)) >= 0 ? '+' : '') + 
                        formatVolume((parseFloat(data.open_interest) - parseFloat(data.pre_open_interest)).toString())
                      : '--'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

DepthPanel.displayName = 'DepthPanel';

