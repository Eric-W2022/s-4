// 图表工具函数
import type { EChartsOption } from 'echarts';
import type { KlineData } from '../types';
import { CHART_THEMES } from '../constants';

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
  const chartData = convertKlineDataToEcharts(data);

  return {
    backgroundColor: 'transparent',
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
    },
    grid: [
      {
        left: '5%',
        right: '3%',
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
        data: chartData.map((item) => item[0]),
        scale: true,
        boundaryGap: true,
        axisLine: {
          lineStyle: { color: CHART_THEMES.BORDER },
        },
        axisLabel: {
          color: CHART_THEMES.TEXT_SECONDARY,
          formatter: (value: string | number) => {
            // ECharts 会将时间戳转为字符串，需要转回数字
            const timestamp = typeof value === 'string' ? parseFloat(value) : value;
            if (isNaN(timestamp)) return '';
            const date = new Date(timestamp);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
          },
        },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
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
        min: 'dataMin',
        max: 'dataMax',
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
        start: 0,
        end: 100,
      },
      {
        show: true,
        xAxisIndex: [0, 1],
        type: 'slider',
        top: '92%',
        start: 0,
        end: 100,
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
        data: chartData.map((item) => [item[1], item[2], item[3], item[4]]),
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
export const formatPrice = (price: number | string, decimals: number = 2): string => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return '0.00';
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

