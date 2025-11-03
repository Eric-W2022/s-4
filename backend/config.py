"""
共享配置和工具函数模块
"""
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import asyncio
import math

# 尝试导入TqSdk
try:
    from tqsdk import TqApi, TqAuth
    import pandas as pd
    TQSDK_AVAILABLE = True
except ImportError:
    TQSDK_AVAILABLE = False
    TqApi = None
    TqAuth = None
    pd = None

# TqSdk配置
TQ_USERNAME = '17665117821'
TQ_PASSWORD = 'STC89c51'
TQ_API = None  # TqApi实例，全局单例

# 存储订阅的K线数据（实时更新）
TQSDK_KLINE_CACHE = {
    'AG': {
        '1m': [],  # 1分钟K线数据
        '5m': [],
        '15m': [],
        '30m': [],
        '1h': [],
        '1d': []
    }
}

# 存储订阅的实时行情数据
TQSDK_QUOTE_CACHE = {
    'AG': None  # 最新行情数据
}

# 订阅任务运行标志
TQSDK_SUBSCRIPTION_RUNNING = False

# 线程池执行器（用于运行同步的TqSdk代码）
if TQSDK_AVAILABLE:
    executor = ThreadPoolExecutor(max_workers=2)
else:
    executor = None

# AllTick API配置
# 外汇、贵金属、加密货币、原油、CFD指数、商品接口地址
ALLTICK_BASE_URL = "https://quote.alltick.co/quote-b-api"
ALLTICK_TOKEN = "9d7f12b4c30826987a501d532ef75707-c-app"

# K线类型映射: interval -> kline_type
# 1=1分钟, 2=5分钟, 3=15分钟, 4=30分钟, 5=1小时, 8=日K, 9=周K, 10=月K
KLINE_TYPE_MAP = {
    "1m": 1,
    "5m": 2,
    "15m": 3,
    "30m": 4,
    "1h": 5,
    "1d": 8,
    "1w": 9,
    "1M": 10
}


def safe_float(value, default=0.0):
    """安全地将值转换为float，处理NaN和None"""
    try:
        if value is None:
            return default
        result = float(value)
        if math.isnan(result) or math.isinf(result):
            return default
        return result
    except (ValueError, TypeError):
        return default


def convert_tqsdk_kline_to_standard_format(kline_df):
    """将TqSdk的K线DataFrame转换为标准格式"""
    if kline_df is None or kline_df.empty:
        return []
    
    result = []
    for _, row in kline_df.iterrows():
        # TqSdk返回的DataFrame包含datetime、open、high、low、close、volume等列
        # datetime列可能是Timestamp对象或纳秒时间戳(float)
        datetime_value = row.get('datetime')
        if datetime_value is None:
            continue
        
        # 处理时间戳转换
        try:
            if hasattr(datetime_value, 'timestamp'):
                # pandas Timestamp对象
                timestamp_ms = int(datetime_value.timestamp() * 1000)
            elif isinstance(datetime_value, (int, float)):
                # 纳秒时间戳（TqSdk返回的是纳秒）
                if datetime_value > 1e12:  # 纳秒时间戳
                    timestamp_ms = int(datetime_value / 1e6)
                elif datetime_value > 1e9:  # 毫秒时间戳
                    timestamp_ms = int(datetime_value)
                else:  # 秒时间戳
                    timestamp_ms = int(datetime_value * 1000)
            else:
                # 尝试转换为Timestamp
                if pd:
                    ts = pd.Timestamp(datetime_value)
                    timestamp_ms = int(ts.timestamp() * 1000)
                else:
                    timestamp_ms = 0
        except Exception as e:
            logging.warning(f"时间戳转换失败: {datetime_value}, 错误: {e}")
            continue
        
        result.append({
            "t": timestamp_ms,
            "o": safe_float(row.get('open', 0)),
            "c": safe_float(row.get('close', 0)),
            "h": safe_float(row.get('high', 0)),
            "l": safe_float(row.get('low', 0)),
            "v": safe_float(row.get('volume', 0)),
            "tu": safe_float(row.get('close', 0) * row.get('volume', 0))  # 成交额 = 收盘价 * 成交量
        })
    
    return result


def get_tqsdk_api():
    """获取或创建TqApi实例（单例模式）"""
    global TQ_API
    if not TQSDK_AVAILABLE:
        raise RuntimeError("TqSdk未安装")
    
    if TQ_API is None:
        try:
            auth = TqAuth(TQ_USERNAME, TQ_PASSWORD)
            TQ_API = TqApi(auth=auth)
            logging.info("TqApi实例创建成功")
        except Exception as e:
            logging.error(f"创建TqApi实例失败: {e}")
            raise
    return TQ_API


def fetch_tqsdk_kline(symbol: str, duration_seconds: int, data_length: int):
    """使用TqSdk获取K线数据（同步函数，在线程池中运行）"""
    try:
        api = get_tqsdk_api()
        # 白银主力合约代码：KQ.m@SHFE.ag
        if symbol.upper() == 'AG':
            contract = "KQ.m@SHFE.ag"
        else:
            contract = symbol
        
        # 获取K线数据
        kline_df = api.get_kline_serial(contract, duration_seconds=duration_seconds, data_length=data_length)
        
        # 转换为标准格式
        return convert_tqsdk_kline_to_standard_format(kline_df)
    except Exception as e:
        logging.error(f"获取TqSdk K线数据失败: {e}")
        raise


def fetch_tqsdk_quote(symbol: str):
    """使用TqSdk获取实时行情（同步函数，在线程池中运行）"""
    try:
        api = get_tqsdk_api()
        # 白银主力合约代码：KQ.m@SHFE.ag
        if symbol.upper() == 'AG':
            contract = "KQ.m@SHFE.ag"
        else:
            contract = symbol
        
        # 获取实时行情
        quote = api.get_quote(contract)
        
        # TqSdk的quote对象有last_price字段（最新价）
        # 转换为标准格式
        if quote:
            # 处理last_price，可能是None、字符串或数字
            last_price = quote.get('last_price', 0)
            if last_price is None:
                last_price = 0
            elif isinstance(last_price, str):
                try:
                    last_price = float(last_price)
                except (ValueError, TypeError):
                    last_price = 0
            else:
                try:
                    last_price = float(last_price) if last_price else 0
                except (ValueError, TypeError):
                    last_price = 0
            
            # 处理volume
            volume = quote.get('volume', 0)
            if volume is None:
                volume = 0
            elif isinstance(volume, str):
                try:
                    volume = float(volume)
                except (ValueError, TypeError):
                    volume = 0
            else:
                try:
                    volume = float(volume) if volume else 0
                except (ValueError, TypeError):
                    volume = 0
            
            # 处理datetime
            datetime_value = quote.get('datetime', 0)
            if datetime_value is None:
                datetime_value = 0
            elif isinstance(datetime_value, str):
                try:
                    datetime_value = float(datetime_value)
                except (ValueError, TypeError):
                    datetime_value = 0
            else:
                try:
                    datetime_value = float(datetime_value) if datetime_value else 0
                except (ValueError, TypeError):
                    datetime_value = 0
            
            # 时间戳转换（纳秒转毫秒）
            # 确保datetime_value是数字类型再进行比较
            if isinstance(datetime_value, (int, float)) and datetime_value > 0:
                if datetime_value > 1e12:
                    tick_time_ms = int(datetime_value / 1e6)
                elif datetime_value > 1e9:
                    tick_time_ms = int(datetime_value)
                else:
                    tick_time_ms = int(datetime_value * 1000)
            else:
                tick_time_ms = int(datetime.now().timestamp() * 1000)
            
            return {
                "code": contract,
                "price": str(last_price),
                "volume": str(volume),
                "tick_time": str(tick_time_ms)
            }
        return None
    except Exception as e:
        logging.error(f"获取TqSdk实时行情失败: {e}", exc_info=True)
        raise


async def get_tqsdk_quote_async(symbol: str):
    """异步包装器，在线程池中运行同步的TqSdk代码"""
    if not TQSDK_AVAILABLE or executor is None:
        raise RuntimeError("TqSdk未安装或未初始化")
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, fetch_tqsdk_quote, symbol)


async def get_tqsdk_kline_async(symbol: str, duration_seconds: int, data_length: int):
    """异步包装器，在线程池中运行同步的TqSdk代码"""
    if not TQSDK_AVAILABLE or executor is None:
        raise RuntimeError("TqSdk未安装或未初始化")
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, fetch_tqsdk_kline, symbol, duration_seconds, data_length)


def convert_interval_to_kline_type(interval: str) -> int:
    """将前端interval转换为AllTick的kline_type"""
    return KLINE_TYPE_MAP.get(interval.lower(), 1)  # 默认1分钟


def convert_api_response_to_standard_format(api_response: dict) -> list:
    """将AllTick API响应转换为标准格式"""
    if api_response.get("ret") != 200:
        return []
    
    kline_list = api_response.get("data", {}).get("kline_list", [])
    result = []
    
    for item in kline_list:
        result.append({
            "t": int(item.get("timestamp", 0)) * 1000,  # 转换为毫秒时间戳
            "o": safe_float(item.get("open_price", 0)),
            "c": safe_float(item.get("close_price", 0)),
            "h": safe_float(item.get("high_price", 0)),
            "l": safe_float(item.get("low_price", 0)),
            "v": safe_float(item.get("volume", 0)),
            "tu": safe_float(item.get("turnover", 0))
        })
    
    return result

