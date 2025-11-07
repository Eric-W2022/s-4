// 时间工具函数
import dayjs from 'dayjs';

/**
 * 格式化时间戳
 */
export const formatTimestamp = (
  timestamp: number | string,
  format: string = 'YYYY-MM-DD HH:mm:ss'
): string => {
  const ts = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
  // 判断是秒还是毫秒
  const timestampMs = ts < 10000000000 ? ts * 1000 : ts;
  return dayjs(timestampMs).format(format);
};

/**
 * 格式化为时:分
 */
export const formatTime = (timestamp: number | string): string => {
  return formatTimestamp(timestamp, 'HH:mm');
};

/**
 * 格式化为月-日 时:分
 */
export const formatDateTime = (timestamp: number | string): string => {
  return formatTimestamp(timestamp, 'MM-DD HH:mm');
};

/**
 * 获取当前时间戳
 */
export const getCurrentTimestamp = (): number => {
  return Date.now();
};

/**
 * 判断市场是否在交易时间
 */
export const isMarketOpen = (marketType: 'london' | 'domestic'): boolean => {
  const now = dayjs();
  const hour = now.hour();
  const day = now.day();

  if (marketType === 'london') {
    // 伦敦市场24小时交易
    return true;
  } else {
    // 国内白银交易时间：工作日 9:00-15:00, 21:00-次日2:30
    // 周末休市
    if (day === 0 || day === 6) return false;
    
    if ((hour >= 9 && hour < 15) || (hour >= 21 || hour < 2)) {
      return true;
    }
    if (hour === 2 && now.minute() <= 30) {
      return true;
    }
    return false;
  }
};

