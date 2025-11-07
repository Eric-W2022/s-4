// 状态指示灯组件
import React from 'react';
import './StatusDot.css';

interface StatusDotProps {
  status: 'connected' | 'connecting' | 'error' | 'closed' | 'trading';
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = React.memo(({ status, className = '' }) => {
  return <span className={`status-dot ${status} ${className}`} />;
});

StatusDot.displayName = 'StatusDot';

