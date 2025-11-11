// 单手交易组件
import React from 'react';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import type { SingleHandPosition, SingleHandOperation } from '../../types';
import './SingleHandTrader.css';

interface SingleHandTraderProps {
  position: SingleHandPosition;
  operations: SingleHandOperation[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onClearOperations?: () => void;
}

export const SingleHandTrader: React.FC<SingleHandTraderProps> = React.memo(
  ({ position, operations, isLoading, onRefresh, onClearOperations }) => {
    
    // 格式化时间
    const formatTime = (timestamp: number) => {
      const date = new Date(timestamp);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    };

    // 格式化持仓时长
    const formatDuration = (entryTime?: number) => {
      if (!entryTime) return '0分钟';
      const duration = Math.floor((Date.now() - entryTime) / 60000);
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      if (hours > 0) {
        return `${hours}小时${minutes}分钟`;
      }
      return `${minutes}分钟`;
    };

    return (
      <div className="single-hand-trader">
        <div className="single-hand-header">
          <div className="single-hand-title-section">
            <h2>单手交易策略</h2>
            {(operations.length > 0 || position.hasPosition) && (
              <button
                className="clear-operations-btn"
                onClick={() => {
                  if (confirm('确定要清空单手交易数据吗？这将清除持仓和所有操作记录！')) {
                    onClearOperations?.();
                  }
                }}
                title="清空单手交易数据"
              >
                ✕
              </button>
            )}
          </div>
          {onRefresh && (
            <button
              className="refresh-btn"
              onClick={onRefresh}
              disabled={isLoading}
              title="手动刷新"
            >
              {isLoading ? '⟳' : '↻'}
            </button>
          )}
        </div>

        {/* 当前持仓盈亏 */}
        <div className="position-section">
          <h3>当前持仓</h3>
          {position.hasPosition ? (
            <div className="position-info">
              <div className="position-cards">
                {/* 持仓方向 */}
                <div className="position-card">
                  <div className="position-card-label">方向</div>
                  <div className={`position-card-value direction ${position.direction === '多' ? 'long' : 'short'}`}>
                    {position.direction}单
                  </div>
                </div>

                {/* 入场价 */}
                <div className="position-card">
                  <div className="position-card-label">入场价</div>
                  <div className="position-card-value">
                    {position.entryPrice?.toFixed(0) || '-'}
                  </div>
                </div>

                {/* 当前价 */}
                <div className="position-card">
                  <div className="position-card-label">当前价</div>
                  <div className="position-card-value">
                    {position.currentPrice?.toFixed(0) || '-'}
                  </div>
                </div>

                {/* 持仓时长 */}
                <div className="position-card">
                  <div className="position-card-label">持仓时长</div>
                  <div className="position-card-value duration">
                    {formatDuration(position.entryTime)}
                  </div>
                </div>
              </div>

              {/* 盈亏显示 */}
              <div className="profit-loss-display">
                <div className="profit-loss-row">
                  <div className="profit-loss-item">
                    <span className="profit-loss-label">盈亏点数:</span>
                    <span className={`profit-loss-value ${
                      (position.profitLossPoints || 0) > 0 ? 'profit' : 
                      (position.profitLossPoints || 0) < 0 ? 'loss' : 'neutral'
                    }`}>
                      {position.profitLossPoints !== undefined && position.profitLossPoints > 0 ? '+' : ''}
                      {position.profitLossPoints?.toFixed(0) || 0} 点
                    </span>
                  </div>
                  <div className="profit-loss-item">
                    <span className="profit-loss-label">盈亏金额:</span>
                    <span className={`profit-loss-value ${
                      (position.profitLossMoney || 0) > 0 ? 'profit' : 
                      (position.profitLossMoney || 0) < 0 ? 'loss' : 'neutral'
                    }`}>
                      {position.profitLossMoney !== undefined && position.profitLossMoney > 0 ? '+' : ''}
                      {position.profitLossMoney?.toFixed(0) || 0} 元
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="no-position">
              <div className="no-position-icon">📊</div>
              <div className="no-position-text">
                <div className="idle-status">空闲</div>
                <div className="idle-stats">
                  <div className="idle-stat-item">
                    <span className="idle-stat-label">当前价:</span>
                    <span className="idle-stat-value">{position.currentPrice?.toFixed(0) || '-'}</span>
                  </div>
                  <div className="idle-stat-item">
                    <span className="idle-stat-label">盈亏:</span>
                    <span className="idle-stat-value neutral">0 点 / 0 元</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 操作记录 */}
        <div className="operations-section">
          <h3>操作记录</h3>
          {isLoading && operations.length === 0 ? (
            <div className="operations-loading">
              <LoadingSpinner />
            </div>
          ) : operations.length === 0 ? (
            <div className="no-operations">
              <div>暂无操作记录</div>
            </div>
          ) : (
            <div className="operations-list">
              {operations.map((op) => (
                <div key={op.id} className="operation-item">
                  <div className="operation-header">
                    <span className="operation-time">{formatTime(op.timestamp)}</span>
                    <span className={`operation-action ${
                      op.action === '开多' ? 'open-long' :
                      op.action === '开空' ? 'open-short' :
                      op.action === '平仓' ? 'close' : 'hold'
                    }`}>
                      {op.action}
                    </span>
                    <span className="operation-price">@ {op.price.toFixed(0)}</span>
                  </div>
                  
                  {/* 平仓时显示盈亏 */}
                  {op.action === '平仓' && op.profitLossPoints !== undefined && (
                    <div className="operation-profit-loss">
                      <span className={`operation-pl-points ${
                        op.profitLossPoints > 0 ? 'profit' : 
                        op.profitLossPoints < 0 ? 'loss' : 'neutral'
                      }`}>
                        {op.profitLossPoints > 0 ? '+' : ''}{op.profitLossPoints.toFixed(0)}点
                      </span>
                      <span className={`operation-pl-money ${
                        (op.profitLossMoney || 0) > 0 ? 'profit' : 
                        (op.profitLossMoney || 0) < 0 ? 'loss' : 'neutral'
                      }`}>
                        {(op.profitLossMoney || 0) > 0 ? '+' : ''}{op.profitLossMoney?.toFixed(0)}元
                      </span>
                    </div>
                  )}
                  
                  <div className="operation-reason">{op.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

SingleHandTrader.displayName = 'SingleHandTrader';

