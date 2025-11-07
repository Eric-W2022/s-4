// 图表工具函数
import type { EChartsOption } from 'echarts';
import type { KlineData } from '../types';
import { CHART_THEMES } from '../constants';
import { filterTradingTimeKlines } from './time';

/**
 * 计算布林带指标
 * @param data K线数据
 * @param period 周期，默认20
 * @param multiplier 标准差倍数，默认2
 */
export const calculateBollingerBands = (
  data: KlineData[],
  period: number = 20,
  multiplier: number = 2
) => {
  const upper: (number | null)[] = [];
  const middle: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      middle.push(null);
      lower.push(null);
      continue;
    }

    // 计算简单移动平均
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].c;
    }
    const ma = sum / period;

    // 计算标准差
    let variance = 0;
    for (let j = 0; j < period; j++) {
      variance += Math.pow(data[i - j].c - ma, 2);
    }
    const stdDev = Math.sqrt(variance / period);

    middle.push(ma);
    upper.push(ma + multiplier * stdDev);
    lower.push(ma - multiplier * stdDev);
  }

  return { upper, middle, lower };
};

/**
 * 将K线数据转换为ECharts格式
 */
export const convertKlineDataToEcharts = (data: KlineData[]) => {
  return data.map((item) => [
    item.t, // 时间
    item.o, // 开盘
    item.c, // 收盘
    item.l, // 最低
    item.h, // 最高
    item.v, // 成交量
  ]);
};

/**
 * 创建K线图表配置
 */
export const createKlineChartOption = (
  data: KlineData[],
  title: string
): EChartsOption => {
  // 判断是否是伦敦市场（需要显示小数）
  const isLondonMarket = title.includes('伦敦');
  // 判断是否是日K线（显示日期而非时间）
  const isDailyKline = title.includes('90日') || title.includes('日K线');
  // 判断是否是国内1分钟K线（需要过滤非交易时间）
  const isDomestic1m = !isLondonMarket && !isDailyKline && !title.includes('15分钟');

  // 过滤交易时间数据（仅对国内1分钟K线）
  let processedData = data;
  let sessionBreaks: number[] = [];
  if (isDomestic1m) {
    const result = filterTradingTimeKlines(data);
    processedData = result.filtered;
    sessionBreaks = result.sessionBreaks;
  }

  const chartData = convertKlineDataToEcharts(processedData);
  const bollingerBands = calculateBollingerBands(processedData);

  return {
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 300,
    animationEasing: 'cubicOut',
    title: {
      text: title,
      textStyle: {
        color: CHART_THEMES.TEXT,
        fontSize: 16,
      },
      show: false, // 标题由组件外部控制
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        crossStyle: {
          color: CHART_THEMES.TEXT_SECONDARY,
        },
      },
      backgroundColor: CHART_THEMES.PANEL_BG,
      borderColor: CHART_THEMES.BORDER,
      textStyle: {
        color: CHART_THEMES.TEXT,
      },
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        
        const param = params[0];
        // 对于category类型的X轴，name就是时间戳
        const timestamp = typeof param.name === 'string' ? parseFloat(param.name) : param.name;
        const date = new Date(timestamp);
        const year = String(date.getFullYear()).slice(-2); // 只取后两位
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        // 根据K线类型显示不同的时间格式
        const timeStr = isDailyKline 
          ? `${month}-${day}`  // 日K线只显示月-日，不带年份
          : `${year}-${month}-${day} ${hours}:${minutes}`;  // 分钟K线显示日期+时间
        
        let result = `<div style="padding: 5px;">${timeStr}<br/>`;
        
        let upperValue: number | null = null;
        let middleValue: number | null = null;
        let lowerValue: number | null = null;
        
        params.forEach((item: any) => {
          if (item.seriesName === 'K线') {
            // ECharts candlestick 在tooltip中，value数组格式为：[open, close, lowest, highest]
            const klineValue = item.value || item.data;
            if (!Array.isArray(klineValue) || klineValue.length < 4) return;
            
            // 注意：ECharts candlestick 标准格式是 [open, close, lowest, highest]
            const open = klineValue[0];
            const close = klineValue[1];
            const lowest = klineValue[2];
            const highest = klineValue[3];
            
            const color = close >= open ? CHART_THEMES.RED : CHART_THEMES.GREEN;
            const formatValue = (val: number) => isLondonMarket ? val.toFixed(3) : Math.round(val).toString();
            result += `<div style="margin-top: 8px;">`;
            result += `<span style="color: ${CHART_THEMES.TEXT_SECONDARY};">开盘：</span><span style="color: ${color}; font-weight: bold;">${formatValue(open)}</span><br/>`;
            result += `<span style="color: ${CHART_THEMES.TEXT_SECONDARY};">收盘：</span><span style="color: ${color}; font-weight: bold;">${formatValue(close)}</span><br/>`;
            result += `<span style="color: ${CHART_THEMES.TEXT_SECONDARY};">最高：</span><span style="color: ${CHART_THEMES.RED}; font-weight: bold;">${formatValue(highest)}</span><br/>`;
            result += `<span style="color: ${CHART_THEMES.TEXT_SECONDARY};">最低：</span><span style="color: ${CHART_THEMES.GREEN}; font-weight: bold;">${formatValue(lowest)}</span>`;
            result += `</div>`;
          } else if (item.seriesName === '布林上轨') {
            upperValue = item.value;
          } else if (item.seriesName === '布林中轨') {
            middleValue = item.value;
          } else if (item.seriesName === '布林下轨') {
            lowerValue = item.value;
          } else if (item.seriesName === '成交量') {
            const volumeValue = item.value;
            result += `<div style="margin-top: 8px;">`;
            result += `<span style="color: ${CHART_THEMES.TEXT_SECONDARY};">成交量：</span><span style="color: ${CHART_THEMES.BLUE}; font-weight: bold;">${volumeValue}</span>`;
            result += `</div>`;
          }
        });
        
        // 显示布林带数据
        if (upperValue !== null || middleValue !== null || lowerValue !== null) {
          const formatBollinger = (val: number) => isLondonMarket ? val.toFixed(3) : Math.round(val).toString();
          result += `<div style="margin-top: 8px; border-top: 1px solid ${CHART_THEMES.BORDER}; padding-top: 8px;">`;
          if (upperValue !== null) {
            result += `<span style="color: ${CHART_THEMES.TEXT_SECONDARY};">布林上轨：</span><span style="color: ${CHART_THEMES.PURPLE}; font-weight: bold;">${formatBollinger(upperValue)}</span><br/>`;
          }
          if (middleValue !== null) {
            result += `<span style="color: ${CHART_THEMES.TEXT_SECONDARY};">布林中轨：</span><span style="color: ${CHART_THEMES.YELLOW}; font-weight: bold;">${formatBollinger(middleValue)}</span><br/>`;
          }
          if (lowerValue !== null) {
            result += `<span style="color: ${CHART_THEMES.TEXT_SECONDARY};">布林下轨：</span><span style="color: ${CHART_THEMES.PURPLE}; font-weight: bold;">${formatBollinger(lowerValue)}</span>`;
          }
          result += `</div>`;
        }
        
        result += `</div>`;
        return result;
      },
    },
    grid: [
      {
        left: '5%',
        right: '3%',  // 标签在线上，不需要额外空间
        top: '10%',
        height: '60%',
      },
      {
        left: '5%',
        right: '3%',
        top: '75%',
        height: '15%',
      },
    ],
    xAxis: [
      {
        type: 'category',
        data: chartData.map((item) => item[0]), // 时间戳数组
        scale: true,
        boundaryGap: true,
        axisLine: {
          lineStyle: { color: CHART_THEMES.BORDER },
        },
        axisLabel: {
          color: CHART_THEMES.TEXT_SECONDARY,
          formatter: (value: any) => {
            const timestamp = typeof value === 'string' ? parseFloat(value) : value;
            if (isNaN(timestamp)) return '';
            const date = new Date(timestamp);
            if (isDailyKline) {
              // 日K线显示月-日
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              return `${month}-${day}`;
            } else {
              // 分钟K线显示时:分
              const hours = String(date.getHours()).padStart(2, '0');
              const minutes = String(date.getMinutes()).padStart(2, '0');
              return `${hours}:${minutes}`;
            }
          },
        },
        splitLine: { show: false },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: chartData.map((item) => item[0]),
        scale: true,
        boundaryGap: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        scale: true,
        splitArea: {
          show: false,
        },
        axisLine: {
          lineStyle: { color: CHART_THEMES.BORDER },
        },
        axisLabel: {
          color: CHART_THEMES.TEXT_SECONDARY,
          formatter: (value: number) => {
            return isLondonMarket ? value.toFixed(3) : Math.round(value).toString();
          },
        },
        splitLine: {
          lineStyle: {
            color: CHART_THEMES.BORDER,
            type: 'dashed',
          },
        },
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        // 不设置 start 和 end，让 ECharts 保持用户的缩放状态
      },
      {
        show: true,
        xAxisIndex: [0, 1],
        type: 'slider',
        top: '92%',
        // 不设置 start 和 end，让 ECharts 保持用户的缩放状态
        backgroundColor: CHART_THEMES.PANEL_BG,
        borderColor: CHART_THEMES.BORDER,
        fillerColor: 'rgba(102, 126, 234, 0.2)',
        textStyle: {
          color: CHART_THEMES.TEXT_SECONDARY,
        },
      },
    ],
    series: [
      {
        name: 'K线',
        type: 'candlestick',
        data: chartData.map((item) => [item[1], item[2], item[3], item[4]]), // [开, 收, 低, 高]
        itemStyle: {
          color: CHART_THEMES.RED, // 涨
          color0: CHART_THEMES.GREEN, // 跌
          borderColor: CHART_THEMES.RED,
          borderColor0: CHART_THEMES.GREEN,
        },
        emphasis: {
          itemStyle: {
            borderWidth: 2,
          },
        },
        // 添加交易时段分割线（仅国内1分钟K线）
        markLine: sessionBreaks.length > 0 ? {
          silent: true,
          symbol: 'none',
          label: {
            show: false,
          },
          lineStyle: {
            color: CHART_THEMES.BLUE,
            width: 2,
            type: 'solid',
            opacity: 0.6,
          },
          data: sessionBreaks.map(index => ({
            xAxis: index, // category轴使用索引
            label: {
              show: true,
              position: 'end',
              formatter: '交易时段',
              color: CHART_THEMES.BLUE,
              fontSize: 10,
            },
          })),
        } : undefined,
      },
      {
        name: '布林上轨',
        type: 'line',
        data: bollingerBands.upper,
        smooth: true,
        lineStyle: {
          color: CHART_THEMES.PURPLE,
          width: 1.5,
          opacity: 0.8,
        },
        showSymbol: false,
        label: {
          show: true,
          position: 'end',
          formatter: () => {
            const lastValue = bollingerBands.upper[bollingerBands.upper.length - 1];
            if (lastValue === null) return '';
            return isLondonMarket ? lastValue.toFixed(3) : Math.round(lastValue).toString();
          },
          color: CHART_THEMES.PURPLE,
          fontSize: 11,
          fontWeight: 'bold',
          fontFamily: 'Monaco, monospace',
          backgroundColor: 'rgba(19, 23, 43, 0.9)',
          padding: [3, 6],
          borderColor: CHART_THEMES.PURPLE,
          borderWidth: 1,
          borderRadius: 3,
        },
        emphasis: {
          disabled: true,
        },
      },
      {
        name: '布林中轨',
        type: 'line',
        data: bollingerBands.middle,
        smooth: true,
        lineStyle: {
          color: CHART_THEMES.YELLOW,
          width: 1.5,
          opacity: 0.8,
        },
        showSymbol: false,
        label: {
          show: true,
          position: 'end',
          formatter: () => {
            const lastValue = bollingerBands.middle[bollingerBands.middle.length - 1];
            if (lastValue === null) return '';
            return isLondonMarket ? lastValue.toFixed(3) : Math.round(lastValue).toString();
          },
          color: CHART_THEMES.YELLOW,
          fontSize: 11,
          fontWeight: 'bold',
          fontFamily: 'Monaco, monospace',
          backgroundColor: 'rgba(19, 23, 43, 0.9)',
          padding: [3, 6],
          borderColor: CHART_THEMES.YELLOW,
          borderWidth: 1,
          borderRadius: 3,
        },
        emphasis: {
          disabled: true,
        },
      },
      {
        name: '布林下轨',
        type: 'line',
        data: bollingerBands.lower,
        smooth: true,
        lineStyle: {
          color: CHART_THEMES.PURPLE,
          width: 1.5,
          opacity: 0.8,
        },
        showSymbol: false,
        label: {
          show: true,
          position: 'end',
          formatter: () => {
            const lastValue = bollingerBands.lower[bollingerBands.lower.length - 1];
            if (lastValue === null) return '';
            return isLondonMarket ? lastValue.toFixed(3) : Math.round(lastValue).toString();
          },
          color: CHART_THEMES.PURPLE,
          fontSize: 11,
          fontWeight: 'bold',
          fontFamily: 'Monaco, monospace',
          backgroundColor: 'rgba(19, 23, 43, 0.9)',
          padding: [3, 6],
          borderColor: CHART_THEMES.PURPLE,
          borderWidth: 1,
          borderRadius: 3,
        },
        emphasis: {
          disabled: true,
        },
      },
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: chartData.map((item, index) => {
          const volume = item[5];
          const isRise = index > 0 && item[2] >= chartData[index - 1][2];
          return {
            value: volume,
            itemStyle: {
              color: isRise ? CHART_THEMES.RED : CHART_THEMES.GREEN,
            },
          };
        }),
      },
    ],
  };
};

/**
 * 计算涨跌幅
 */
export const calculateChange = (current: number, previous: number) => {
  if (!previous || previous === 0) return { change: 0, changePercent: 0 };
  const change = current - previous;
  const changePercent = (change / previous) * 100;
  return {
    change: Number(change.toFixed(2)),
    changePercent: Number(changePercent.toFixed(2)),
  };
};

/**
 * 格式化价格
 */
export const formatPrice = (price: number | string, decimals: number = 0): string => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return '0';
  // 如果是整数，不显示小数点
  if (decimals === 0 || num === Math.floor(num)) {
    return Math.round(num).toString();
  }
  return num.toFixed(decimals);
};

/**
 * 格式化成交量
 */
export const formatVolume = (volume: number | string): string => {
  const num = typeof volume === 'string' ? parseFloat(volume) : volume;
  if (isNaN(num)) return '0';
  if (num >= 10000) {
    return (num / 10000).toFixed(2) + 'w';
  }
  return num.toFixed(0);
};

