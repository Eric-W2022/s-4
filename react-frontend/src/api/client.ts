// API 客户端配置
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../constants';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 增加到60秒
  headers: {
    'Content-Type': 'application/json',
  },
});

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1秒

// 判断是否应该重试
const shouldRetry = (error: AxiosError): boolean => {
  // 超时错误、网络错误、5xx服务器错误应该重试
  if (error.code === 'ECONNABORTED') return true; // 超时
  if (error.code === 'ECONNRESET') return true; // 连接重置
  if (error.code === 'ETIMEDOUT') return true; // 连接超时
  if (!error.response) return true; // 网络错误
  if (error.response.status >= 500) return true; // 服务器错误
  if (error.response.status === 429) return true; // 请求过多
  return false;
};

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 初始化重试计数
    (config as any).retryCount = (config as any).retryCount || 0;
    // 可以在这里添加认证token等
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器（带重试逻辑）
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as AxiosRequestConfig & { retryCount?: number };
    
    if (!config) {
      return Promise.reject(error);
    }

    // 获取当前重试次数
    const retryCount = config.retryCount || 0;

    // 判断是否应该重试
    if (retryCount < MAX_RETRIES && shouldRetry(error)) {
      config.retryCount = retryCount + 1;
      
      // 计算延迟时间（指数退避）
      const delayTime = RETRY_DELAY * Math.pow(2, retryCount);
      
      console.warn(
        `API请求失败，${delayTime}ms后进行第${config.retryCount}次重试:`,
        config.url,
        error.message
      );

      // 等待后重试
      await delay(delayTime);
      return apiClient(config);
    }

    // 达到最大重试次数或不应重试，记录错误
    if (error.code === 'ECONNABORTED') {
      console.error('API请求超时（已重试%d次）:', retryCount, error.config?.url);
    } else if (error.response) {
      console.error('API错误:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('API无响应（已重试%d次）:', retryCount, error.message);
    } else {
      console.error('API Error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

