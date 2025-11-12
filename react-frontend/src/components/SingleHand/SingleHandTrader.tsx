// 单手交易组件
import React, { useState } from 'react';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import { MODEL_OPTIONS } from '../../constants';
import type { SingleHandPosition, SingleHandOperation, ModelType } from '../../types';
import './SingleHandTrader.css';

// 获取模型简称
const getModelLabel = (modelValue?: string) => {
  if (!modelValue) return '';
  const model = MODEL_OPTIONS.find(m => m.value === modelValue);
  return model?.label || modelValue;
};

interface SingleHandTraderProps {
  position: SingleHandPosition;
  operations: SingleHandOperation[];
  isLoading?: boolean;
  selectedModel: ModelType;
  onModelChange: (model: ModelType) => void;
  onRefresh?: () => void;
  onClearOperations?: () => void;
  onDeleteOperation?: (operationId: string) => void;
  onManualTrigger?: () => void;
  autoRequestEnabled?: boolean;  // 是否启用自动请求
  onAutoRequestToggle?: (enabled: boolean) => void;  // 切换自动请求开关
}

export const SingleHandTrader: React.FC<SingleHandTraderProps> = React.memo(
  ({ position, operations, isLoading, selectedModel, onModelChange, onRefresh, onClearOperations, onDeleteOperation, onManualTrigger, autoRequestEnabled = true, onAutoRequestToggle }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const selectedModelLabel = MODEL_OPTIONS.find(
      (m) => m.value === selectedModel
    )?.label || 'DeepSeek';

    const handleModelSelect = (model: ModelType) => {
      onModelChange(model);
      setIsDropdownOpen(false);
    };
    
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
            {/* 模型选择器移到最前面 */}
            <div 
              className="model-selector-container"
              onMouseEnter={() => setIsDropdownOpen(true)}
              onMouseLeave={() => setIsDropdownOpen(false)}
            >
              <div className="model-selector-display">{selectedModelLabel}</div>
              <div className={`model-selector-dropdown ${isDropdownOpen ? 'open' : ''}`}>
                {MODEL_OPTIONS.slice(0, 6).map((option) => (
                  <div
                    key={option.value}
                    className={`model-selector-option ${
                      selectedModel === option.value ? 'active' : ''
                    }`}
                    onClick={() => handleModelSelect(option.value as ModelType)}
                  >
                    {option.label}
                  </div>
                ))}
                <div className="model-gap" />
                {MODEL_OPTIONS.slice(6).map((option) => (
                  <div
                    key={option.value}
                    className={`model-selector-option ${
                      selectedModel === option.value ? 'active' : ''
                    }`}
                    onClick={() => handleModelSelect(option.value as ModelType)}
                  >
                    {option.label}
                  </div>
                ))}
              </div>
            </div>
            {/* 自动请求开关 - 滑动开关样式 */}
            <label className="auto-request-toggle">
              <input
                type="checkbox"
                checked={autoRequestEnabled}
                onChange={(e) => {
                  onAutoRequestToggle?.(e.target.checked);
                }}
                className="toggle-switch"
                title={autoRequestEnabled ? "关闭自动请求" : "开启自动请求"}
              />
              <span className="toggle-slider"></span>
            </label>
            {(operations.length > 0 || position.hasPosition) ? (
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
            ) : (
              <button
                className="play-strategy-btn"
                onClick={() => {
                  onManualTrigger?.();
                }}
                disabled={isLoading}
                title="生成交易策略"
              >
                ▶
              </button>
            )}
          </div>
        </div>

        {/* 持仓盈亏 */}
        <div className="position-section">
          {position.hasPosition ? (
            <div className="position-info">
              <div className="position-cards">
                {/* 第一行：持仓方向、当前价 */}
                <div className="position-card">
                  <div className="position-card-label">持仓方向</div>
                  <div className={`position-card-value direction ${position.direction === '多' ? 'long' : 'short'}`}>
                    {position.direction}单
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">当前价</div>
                  <div className="position-card-value">
                    {position.currentPrice?.toFixed(0) || '-'}
                  </div>
                </div>

                {/* 第二行：入场价、盈亏点数 */}
                <div className="position-card">
                  <div className="position-card-label">入场价</div>
                  <div className="position-card-value">
                    {position.entryPrice?.toFixed(0) || '-'}
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">盈亏点数</div>
                  <div className={`position-card-value ${
                    (position.profitLossPoints || 0) > 0 ? 'profit' : 
                    (position.profitLossPoints || 0) < 0 ? 'loss' : 'neutral'
                  }`}>
                    {position.profitLossPoints !== undefined && position.profitLossPoints > 0 ? '+' : ''}
                    {position.profitLossPoints?.toFixed(0) || 0}点
                  </div>
                </div>

                {/* 第三行：盈亏金额、持仓时长 */}
                <div className="position-card">
                  <div className="position-card-label">盈亏金额</div>
                  <div className={`position-card-value ${
                    (position.profitLossMoney || 0) > 0 ? 'profit' : 
                    (position.profitLossMoney || 0) < 0 ? 'loss' : 'neutral'
                  }`}>
                    {position.profitLossMoney !== undefined && position.profitLossMoney > 0 ? '+' : ''}
                    {position.profitLossMoney?.toFixed(0) || 0}
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">持仓时长</div>
                  <div className="position-card-value duration">
                    {formatDuration(position.entryTime)}
                  </div>
                </div>

                {/* 第四行：最高盈利、回撤 */}
                <div className="position-card">
                  <div className="position-card-label">最高盈利</div>
                  <div className="position-card-value profit">
                    {position.maxProfitPoints !== undefined && position.maxProfitPoints > 0 ? '+' : ''}
                    {position.maxProfitPoints?.toFixed(0) || 0}点
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">回撤</div>
                  <div className={`position-card-value ${
                    (position.drawdownPercent || 0) > 30 ? 'loss' : 
                    (position.drawdownPercent || 0) > 10 ? 'neutral' : 'profit'
                  }`}>
                    {position.drawdownPercent?.toFixed(1) || 0}%
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="position-info">
              <div className="position-cards">
                {/* 第一行：持仓方向、当前价 */}
                <div className="position-card">
                  <div className="position-card-label">持仓方向</div>
                  <div className="position-card-value direction idle">
                    空闲
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">当前价</div>
                  <div className="position-card-value">
                    {position.currentPrice?.toFixed(0) || '-'}
                  </div>
                </div>

                {/* 第二行：入场价、盈亏点数 */}
                <div className="position-card">
                  <div className="position-card-label">入场价</div>
                  <div className="position-card-value">
                    -
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">盈亏点数</div>
                  <div className="position-card-value neutral">
                    0点
                  </div>
                </div>

                {/* 第三行：盈亏金额、持仓时长 */}
                <div className="position-card">
                  <div className="position-card-label">盈亏金额</div>
                  <div className="position-card-value neutral">
                    0
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">持仓时长</div>
                  <div className="position-card-value duration">
                    0分钟
                  </div>
                </div>

                {/* 第四行：最高盈利、回撤 */}
                <div className="position-card">
                  <div className="position-card-label">最高盈利</div>
                  <div className="position-card-value neutral">
                    0点
                  </div>
                </div>

                <div className="position-card">
                  <div className="position-card-label">回撤</div>
                  <div className="position-card-value neutral">
                    0%
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 今日统计 */}
        <div className="daily-stats-section">
          {/* 第一行：总点数、操作数、胜率 */}
          <div className="daily-stats-cards">
            <div className="daily-stat-card">
              <div className="daily-stat-label">总点数</div>
              <div className={`daily-stat-value ${
                (() => {
                  // 只统计平仓操作的点数（最终确定的盈亏）
                  const closedPoints = operations
                    .filter(op => op.action === '平仓' && op.profitLossPoints !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossPoints || 0), 0);
                  // 当前持仓的浮动盈亏点数
                  const currentPoints = position.hasPosition ? (position.profitLossPoints || 0) : 0;
                  const total = closedPoints + currentPoints;
                  return total > 0 ? 'profit' : total < 0 ? 'loss' : 'neutral';
                })()
              }`}>
                {(() => {
                  // 只统计平仓操作的点数（最终确定的盈亏）
                  const closedPoints = operations
                    .filter(op => op.action === '平仓' && op.profitLossPoints !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossPoints || 0), 0);
                  // 当前持仓的浮动盈亏点数
                  const currentPoints = position.hasPosition ? (position.profitLossPoints || 0) : 0;
                  const total = closedPoints + currentPoints;
                  return (total > 0 ? '+' : '') + total.toFixed(0);
                })()}
              </div>
            </div>
            <div className="daily-stat-card">
              <div className="daily-stat-label">操作数</div>
              <div className="daily-stat-value neutral">
                {operations.filter(op => 
                  op.action === '开多' || op.action === '开空' || op.action === '平仓' || 
                  op.action === '反转开多' || op.action === '反转开空' ||
                  op.action === '锁仓开多' || op.action === '锁仓开空' || 
                  op.action === '解锁平多' || op.action === '解锁平空'
                ).length}
              </div>
            </div>
            <div className="daily-stat-card">
              <div className="daily-stat-label">胜率</div>
              <div className={`daily-stat-value ${
                (() => {
                  // 统计所有平仓操作
                  const closedOps = operations.filter(op => op.action === '平仓' && op.netProfit !== undefined);
                  if (closedOps.length === 0) return 'neutral';
                  // 统计盈利的平仓操作
                  const winOps = closedOps.filter(op => (op.netProfit || 0) > 0);
                  const winRate = (winOps.length / closedOps.length) * 100;
                  return winRate >= 50 ? 'profit' : winRate >= 30 ? 'neutral' : 'loss';
                })()
              }`}>
                {(() => {
                  // 统计所有平仓操作
                  const closedOps = operations.filter(op => op.action === '平仓' && op.netProfit !== undefined);
                  if (closedOps.length === 0) return '0%';
                  // 统计盈利的平仓操作
                  const winOps = closedOps.filter(op => (op.netProfit || 0) > 0);
                  const winRate = (winOps.length / closedOps.length) * 100;
                  return winRate.toFixed(0) + '%';
                })()}
              </div>
            </div>
          </div>
          
          {/* 第二行：总营收、手续费、净利润 */}
          <div className="daily-stats-cards">
            <div className="daily-stat-card">
              <div className="daily-stat-label">总营收</div>
              <div className={`daily-stat-value ${
                (() => {
                  // 基于总点数计算总营收（总点数 × 15元/点）
                  // 只统计平仓操作的点数
                  const closedPoints = operations
                    .filter(op => op.action === '平仓' && op.profitLossPoints !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossPoints || 0), 0);
                  // 当前持仓的浮动盈亏点数
                  const currentPoints = position.hasPosition ? (position.profitLossPoints || 0) : 0;
                  const totalPoints = closedPoints + currentPoints;
                  const totalRevenue = totalPoints * 15; // 每点15元
                  return totalRevenue > 0 ? 'profit' : totalRevenue < 0 ? 'loss' : 'neutral';
                })()
              }`}>
                {(() => {
                  // 基于总点数计算总营收（总点数 × 15元/点）
                  // 只统计平仓操作的点数
                  const closedPoints = operations
                    .filter(op => op.action === '平仓' && op.profitLossPoints !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossPoints || 0), 0);
                  // 当前持仓的浮动盈亏点数
                  const currentPoints = position.hasPosition ? (position.profitLossPoints || 0) : 0;
                  const totalPoints = closedPoints + currentPoints;
                  const totalRevenue = totalPoints * 15; // 每点15元
                  return (totalRevenue > 0 ? '+' : '') + totalRevenue.toFixed(0);
                })()}
              </div>
            </div>
            <div className="daily-stat-card">
              <div className="daily-stat-label">手续费</div>
              <div className="daily-stat-value loss">
                {(() => {
                  const totalCommission = operations.filter(op => op.commission !== undefined)
                    .reduce((sum, op) => sum + (op.commission || 0), 0);
                  return '-' + totalCommission.toFixed(0);
                })()}
              </div>
            </div>
            <div className="daily-stat-card">
              <div className="daily-stat-label">净利润</div>
              <div className={`daily-stat-value ${
                (() => {
                  // 净利润 = 总营收 - 手续费
                  // 基于总点数计算总营收（总点数 × 15元/点）
                  // 只统计平仓操作的点数
                  const closedPoints = operations
                    .filter(op => op.action === '平仓' && op.profitLossPoints !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossPoints || 0), 0);
                  const currentPoints = position.hasPosition ? (position.profitLossPoints || 0) : 0;
                  const totalPoints = closedPoints + currentPoints;
                  const totalRevenue = totalPoints * 15;
                  
                  // 手续费：所有操作的手续费
                  const totalCommission = operations.filter(op => op.commission !== undefined)
                    .reduce((sum, op) => sum + (op.commission || 0), 0);
                  
                  // 净利润 = 总营收 - 手续费
                  const netProfit = totalRevenue - totalCommission;
                  return netProfit > 0 ? 'profit' : netProfit < 0 ? 'loss' : 'neutral';
                })()
              }`}>
                {(() => {
                  // 净利润 = 总营收 - 手续费
                  // 基于总点数计算总营收（总点数 × 15元/点）
                  // 只统计平仓操作的点数
                  const closedPoints = operations
                    .filter(op => op.action === '平仓' && op.profitLossPoints !== undefined)
                    .reduce((sum, op) => sum + (op.profitLossPoints || 0), 0);
                  const currentPoints = position.hasPosition ? (position.profitLossPoints || 0) : 0;
                  const totalPoints = closedPoints + currentPoints;
                  const totalRevenue = totalPoints * 15;
                  
                  // 手续费：所有操作的手续费
                  const totalCommission = operations.filter(op => op.commission !== undefined)
                    .reduce((sum, op) => sum + (op.commission || 0), 0);
                  
                  // 净利润 = 总营收 - 手续费
                  const netProfit = totalRevenue - totalCommission;
                  return (netProfit > 0 ? '+' : '') + netProfit.toFixed(0);
                })()}
              </div>
            </div>
          </div>
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
                  {/* 删除按钮 - 绝对定位在右上角 */}
                  {onDeleteOperation && (
                    <button
                      className="delete-operation-btn"
                      onClick={() => {
                        onDeleteOperation(op.id);
                      }}
                      title="删除此记录"
                    >
                      ✕
                    </button>
                  )}
                  
                  {/* 第一行：时间和入场价 */}
                  <div className="operation-header">
                    <span className="operation-time">{formatTime(op.timestamp)}</span>
                    <span className="operation-price">@ {op.price.toFixed(0)}</span>
                  </div>
                  
                  {/* 第二行：模型和处理时间 */}
                  <div className="operation-model-time-row">
                    {op.model && (
                      <span className="operation-model">{getModelLabel(op.model)}</span>
                    )}
                    {op.processingTime !== undefined && (
                      <span className="operation-processing-time">
                        {op.processingTime >= 1000 ? (op.processingTime / 1000).toFixed(1) + 's' : op.processingTime + 'ms'}
                      </span>
                    )}
                  </div>
                  
                  {/* 第三行：操作动作和手续费/持仓时间 */}
                  <div className="operation-action-line">
                    <span className={`operation-action ${
                      op.action === '开多' || op.action === '反转开多' || op.action === '锁仓开多' ? 'open-long' : 
                      op.action === '开空' || op.action === '反转开空' || op.action === '锁仓开空' ? 'open-short' :
                      op.action === '平仓' || op.action === '解锁平多' || op.action === '解锁平空' ? 'close' : 
                      op.action === '观望' ? 'watch' : 'hold'
                    }`}>
                      {op.action}
                    </span>
                    
                    {/* 开仓、平仓、锁仓、解锁显示手续费 */}
                    {(op.action === '开多' || op.action === '开空' || op.action === '平仓' || 
                      op.action === '反转开多' || op.action === '反转开空' ||
                      op.action === '锁仓开多' || op.action === '锁仓开空' || 
                      op.action === '解锁平多' || op.action === '解锁平空') && (
                      <span className="operation-commission-value">
                        手续费{(op.commission || -8) < 0 ? '' : '+'}{(op.commission || -8).toFixed(0)}
                      </span>
                    )}
                    
                    {/* 持有操作显示持仓时间 */}
                    {op.action === '持有' && (
                      <span className="operation-duration">
                        持仓{(() => {
                          const isCurrentPosition = position.hasPosition && position.entryTime && op.timestamp >= position.entryTime;
                          const duration = isCurrentPosition 
                            ? (position.entryTime ? Math.round((Date.now() - position.entryTime) / 60000) : 0)
                            : (op.duration || 0);
                          return duration;
                        })()}分钟
                      </span>
                    )}
                    
                    {/* 观望操作显示无持仓 */}
                    {op.action === '观望' && (
                      <span className="operation-pl-points neutral">无持仓</span>
                    )}
                  </div>
                  
                  {/* 第四行：点数、金额、净利润 */}
                  <div className="operation-financial-info">
                    {/* 开仓操作（包括反转开仓、锁仓） */}
                    {(op.action === '开多' || op.action === '开空' || 
                      op.action === '反转开多' || op.action === '反转开空' ||
                      op.action === '锁仓开多' || op.action === '锁仓开空') && (
                      <>
                        {(() => {
                          const isCurrentPosition = position.hasPosition && position.entryTime && op.timestamp >= position.entryTime;
                          const points = isCurrentPosition ? (position.profitLossPoints || 0) : (op.profitLossPoints || 0);
                          const money = isCurrentPosition ? (position.profitLossMoney || 0) : (op.profitLossMoney || 0);
                          
                          return (
                            <>
                              <span className={`operation-pl-points ${
                                points > 0 ? 'profit' : points < 0 ? 'loss' : 'neutral'
                              }`}>
                                {points > 0 ? '+' : ''}{points.toFixed(0)}点
                              </span>
                              <span className={`operation-pl-money ${
                                money > 0 ? 'profit' : money < 0 ? 'loss' : 'neutral'
                              }`}>
                                {money > 0 ? '+' : ''}{money.toFixed(0)}
                              </span>
                            </>
                          );
                        })()}
                      </>
                    )}
                  
                    {/* 平仓和解锁操作 */}
                    {(op.action === '平仓' || op.action === '解锁平多' || op.action === '解锁平空') && op.profitLossPoints !== undefined && (
                      <>
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
                          {(op.profitLossMoney || 0) > 0 ? '+' : ''}{op.profitLossMoney?.toFixed(0)}
                        </span>
                        <span className={`operation-net-profit ${
                          (op.netProfit || 0) > 0 ? 'profit' : 
                          (op.netProfit || 0) < 0 ? 'loss' : 'neutral'
                        }`}>
                          净利润{(op.netProfit || 0) > 0 ? '+' : ''}{op.netProfit?.toFixed(0)}
                        </span>
                      </>
                    )}
                    
                    {/* 持有操作 */}
                    {op.action === '持有' && (
                      <>
                        {(() => {
                          const isCurrentPosition = position.hasPosition && position.entryTime && op.timestamp >= position.entryTime;
                          const points = isCurrentPosition ? (position.profitLossPoints || 0) : (op.profitLossPoints || 0);
                          const money = isCurrentPosition ? (position.profitLossMoney || 0) : (op.profitLossMoney || 0);
                          
                          return (
                            <>
                              <span className={`operation-pl-points ${
                                points > 0 ? 'profit' : points < 0 ? 'loss' : 'neutral'
                              }`}>
                                {points > 0 ? '+' : ''}{points.toFixed(0)}点
                              </span>
                              <span className={`operation-pl-money ${
                                money > 0 ? 'profit' : money < 0 ? 'loss' : 'neutral'
                              }`}>
                                {money > 0 ? '+' : ''}{money.toFixed(0)}
                              </span>
                            </>
                          );
                        })()}
                      </>
                    )}
                  </div>
                  
                  {/* 原因说明和反思（默认折叠，hover展开）*/}
                  <div className="operation-reason-container">
                    <div className="operation-reason-header">
                      <span className="operation-reason-title">💡 决策理由</span>
                    </div>
                  <div className="operation-reason">{op.reason}</div>
                    {op.reflection && (
                      <>
                        <div className="operation-reflection-header">
                          <span className="operation-reflection-title">🤔 AI反思</span>
                        </div>
                        <div className="operation-reflection">{op.reflection}</div>
                      </>
                    )}
                  </div>
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

