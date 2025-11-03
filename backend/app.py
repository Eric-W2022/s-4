"""
FastAPI 后端服务
提供前端页面和AllTick API数据接口
同时支持TqSdk获取国内期货数据
"""
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import httpx
import uvicorn
import logging
from datetime import datetime
import json
import uuid
import urllib.parse
import asyncio
from concurrent.futures import ThreadPoolExecutor

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

app = FastAPI(title="白银K线监控", version="1.0.0")

# 获取项目根目录和前端目录
BASE_DIR = Path(__file__).parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
LOGS_DIR = BASE_DIR / "logs"

# 创建logs目录
LOGS_DIR.mkdir(exist_ok=True)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOGS_DIR / f"app_{datetime.now().strftime('%Y%m%d')}.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 禁用httpx的INFO级别日志（避免打印HTTP请求详情）
logging.getLogger("httpx").setLevel(logging.WARNING)

# TqSdk配置
TQ_USERNAME = '17665117821'
TQ_PASSWORD = 'STC89c51'
TQ_API = None  # TqApi实例，全局单例

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


def convert_tqsdk_kline_to_standard_format(kline_df) -> list:
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
            logger.warning(f"时间戳转换失败: {datetime_value}, 错误: {e}")
            continue
        
        result.append({
            "t": timestamp_ms,
            "o": float(row.get('open', 0)),
            "c": float(row.get('close', 0)),
            "h": float(row.get('high', 0)),
            "l": float(row.get('low', 0)),
            "v": float(row.get('volume', 0)),
            "tu": float(row.get('close', 0) * row.get('volume', 0))  # 成交额 = 收盘价 * 成交量
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
            logger.info("TqApi实例创建成功")
        except Exception as e:
            logger.error(f"创建TqApi实例失败: {e}")
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
        logger.error(f"获取TqSdk K线数据失败: {e}")
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
        logger.error(f"获取TqSdk实时行情失败: {e}", exc_info=True)
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
            "o": float(item.get("open_price", 0)),
            "c": float(item.get("close_price", 0)),
            "h": float(item.get("high_price", 0)),
            "l": float(item.get("low_price", 0)),
            "v": float(item.get("volume", 0)),
            "tu": float(item.get("turnover", 0))
        })
    
    return result


@app.get("/api/kline")
async def get_kline(
    request: Request,
    symbol: str = Query(..., description="产品代码，如XAGUSD、AG等"),
    interval: str = Query("1m", description="K线周期，如1m、5m、1h等"),
    limit: int = Query(100, description="返回数据条数，最大500")
):
    """
    获取K线数据接口
    国内白银(AG)使用TqSdk，其他产品使用AllTick API
    """
    # 记录请求日志
    client_ip = request.client.host if request.client else "unknown"
    request_time = datetime.now().isoformat()
    trace_id = f"{uuid.uuid4()}-{int(datetime.now().timestamp() * 1000)}"
    
    # 限制limit最大值
    limit = min(limit, 500)
    
    logger.info(f"[API请求] IP: {client_ip} | Symbol: {symbol} | Interval: {interval} | Limit: {limit} | Trace: {trace_id}")
    
    try:
        # 如果是国内白银(AG)，使用TqSdk获取数据
        if symbol.upper() == 'AG':
            logger.info(f"[TqSdk请求] Symbol: {symbol} | Interval: {interval} | Limit: {limit}")
            
            # 转换interval为秒数
            interval_map = {
                "1m": 60,
                "5m": 300,
                "15m": 900,
                "30m": 1800,
                "1h": 3600,
                "1d": 86400
            }
            duration_seconds = interval_map.get(interval.lower(), 60)
            
            try:
                # 使用TqSdk获取K线数据
                standard_data = await get_tqsdk_kline_async(symbol, duration_seconds, limit)
                
                logger.info(f"[TqSdk成功] Symbol: {symbol} | 数据条数: {len(standard_data)}")
                return JSONResponse(
                    content=standard_data,
                    status_code=200
                )
            except RuntimeError as e:
                # TqSdk未安装或初始化失败
                logger.error(f"[TqSdk错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
                raise HTTPException(status_code=503, detail=f"TqSdk服务不可用: {str(e)}")
            except Exception as e:
                # 其他TqSdk错误
                logger.error(f"[TqSdk错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"TqSdk获取数据失败: {str(e)}")
        
        # 其他产品使用AllTick API
        # 转换interval为kline_type
        kline_type = convert_interval_to_kline_type(interval)
        
        # 构建AllTick API请求体（POST请求，参数在query字段）
        query_data = {
            "trace": trace_id,
            "data": {
                "code": symbol,
                "kline_type": kline_type,
                "kline_timestamp_end": 0,  # 0表示从当前最新往前查询
                "query_kline_num": limit,
                "adjust_type": 0  # 0:除权
            }
        }
        
        # 记录请求详情
        request_log = {
            "timestamp": request_time,
            "client_ip": client_ip,
            "symbol": symbol,
            "interval": interval,
            "kline_type": kline_type,
            "limit": limit,
            "trace_id": trace_id,
            "api_url": ALLTICK_BASE_URL
        }
        logger.debug(f"请求详情: {json.dumps(request_log, ensure_ascii=False)}")
        
        # 使用httpx异步客户端发送POST请求
        # 注意：query参数需要JSON字符串，httpx会自动URL编码
        query_json = json.dumps(query_data, ensure_ascii=False)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{ALLTICK_BASE_URL}/kline",
                params={"token": ALLTICK_TOKEN, "query": query_json},
                headers={
                    "accept": "application/json"
                }
            )
            
            # 记录响应日志
            response_time = datetime.now().isoformat()
            response_log = {
                "timestamp": response_time,
                "symbol": symbol,
                "status_code": response.status_code,
                "trace_id": trace_id
            }
            
            # 解析响应
            try:
                api_response = response.json()
            except:
                api_response = {"error": response.text}
            
            # 检查AllTick API的ret字段
            ret_code = api_response.get("ret", response.status_code)
            
            if response.status_code == 200 and ret_code == 200:
                # 转换为标准格式
                standard_data = convert_api_response_to_standard_format(api_response)
                
                response_log["data_count"] = len(standard_data)
                response_log["ret"] = ret_code
                response_log["msg"] = api_response.get("msg")
                
                logger.info(f"[API成功] Symbol: {symbol} | Status: {response.status_code} | Ret: {ret_code} | 数据条数: {len(standard_data)}")
                logger.debug(f"响应详情: {json.dumps(response_log, ensure_ascii=False)}")
                
                return JSONResponse(
                    content=standard_data,
                    status_code=200
                )
            else:
                # 返回错误信息
                error_data = {
                    "ret": ret_code,
                    "msg": api_response.get("msg", api_response.get("error", "Unknown error")),
                    "trace": api_response.get("trace", trace_id)
                }
                response_log["error"] = error_data
                logger.warning(f"[API错误] Symbol: {symbol} | Status: {response.status_code} | Ret: {ret_code} | Error: {error_data.get('msg')}")
                logger.debug(f"错误详情: {json.dumps(response_log, ensure_ascii=False)}")
                
                return JSONResponse(
                    content=error_data,
                    status_code=response.status_code if response.status_code != 200 else 400
                )
                
    except httpx.TimeoutException as e:
        logger.error(f"[API超时] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=504, detail="请求超时")
    except httpx.RequestError as e:
        logger.error(f"[API请求错误] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"请求错误: {str(e)}")
    except Exception as e:
        logger.error(f"[服务器错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")


@app.get("/api/trade-tick")
async def get_trade_tick(
    request: Request,
    symbol: str = Query(..., description="产品代码，如Silver、AG等")
):
    """
    获取最新成交价接口
    国内白银(AG)使用TqSdk，其他产品使用AllTick API
    """
    client_ip = request.client.host if request.client else "unknown"
    request_time = datetime.now().isoformat()
    trace_id = f"{uuid.uuid4()}-{int(datetime.now().timestamp() * 1000)}"
    
    logger.info(f"[Trade-Tick请求] IP: {client_ip} | Symbol: {symbol} | Trace: {trace_id}")
    
    # 如果是国内白银(AG)，使用TqSdk获取实时行情
    if symbol.upper() == 'AG':
        try:
            logger.info(f"[TqSdk实时行情请求] Symbol: {symbol}")
            
            # 使用TqSdk获取实时行情
            quote_data = await get_tqsdk_quote_async(symbol)
            
            if quote_data:
                # 转换为AllTick格式
                result = {
                    "ret": 200,
                    "msg": "ok",
                    "trace": trace_id,
                    "data": {
                        "tick_list": [{
                            "code": quote_data.get("code", symbol),
                            "price": quote_data.get("price", "0"),
                            "volume": quote_data.get("volume", "0"),
                            "tick_time": quote_data.get("tick_time", str(int(datetime.now().timestamp() * 1000)))
                        }]
                    }
                }
                logger.info(f"[TqSdk实时行情成功] Symbol: {symbol} | Price: {quote_data.get('price')}")
                return JSONResponse(content=result, status_code=200)
            else:
                raise HTTPException(status_code=404, detail="TqSdk未获取到实时行情数据")
                
        except RuntimeError as e:
            logger.error(f"[TqSdk错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
            raise HTTPException(status_code=503, detail=f"TqSdk服务不可用: {str(e)}")
        except Exception as e:
            logger.error(f"[TqSdk错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"TqSdk获取实时行情失败: {str(e)}")
    
    # 其他产品使用AllTick API
    try:
        query_data = {
            "trace": trace_id,
            "data": {
                "symbol_list": [
                    {"code": symbol}
                ]
            }
        }
        
        query_json = json.dumps(query_data, ensure_ascii=False)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            url = f"{ALLTICK_BASE_URL}/trade-tick?token={ALLTICK_TOKEN}&query={urllib.parse.quote(query_json)}"
            response = await client.post(
                url,
                headers={
                    "accept": "application/json"
                }
            )
            
            try:
                api_response = response.json()
            except:
                api_response = {"error": response.text}
            
            ret_code = api_response.get("ret", response.status_code)
            
            if response.status_code == 200 and ret_code == 200:
                logger.info(f"[Trade-Tick成功] Symbol: {symbol} | Ret: {ret_code}")
                return JSONResponse(content=api_response, status_code=200)
            else:
                error_data = {
                    "ret": ret_code,
                    "msg": api_response.get("msg", api_response.get("error", "Unknown error")),
                    "trace": api_response.get("trace", trace_id)
                }
                logger.warning(f"[Trade-Tick错误] Symbol: {symbol} | Ret: {ret_code} | Error: {error_data.get('msg')}")
                return JSONResponse(content=error_data, status_code=response.status_code if response.status_code != 200 else 400)
                
    except httpx.TimeoutException as e:
        logger.error(f"[Trade-Tick超时] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=504, detail="请求超时")
    except httpx.RequestError as e:
        logger.error(f"[Trade-Tick请求错误] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"请求错误: {str(e)}")
    except Exception as e:
        logger.error(f"[Trade-Tick服务器错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")


@app.get("/api/depth-tick")
async def get_depth_tick(
    request: Request,
    symbol: str = Query(..., description="产品代码，如Silver等")
):
    """
    获取最新盘口深度接口
    后端直接请求AllTick API，前端无需传递token
    """
    client_ip = request.client.host if request.client else "unknown"
    request_time = datetime.now().isoformat()
    trace_id = f"{uuid.uuid4()}-{int(datetime.now().timestamp() * 1000)}"
    
    logger.info(f"[Depth-Tick请求] IP: {client_ip} | Symbol: {symbol} | Trace: {trace_id}")
    
    try:
        query_data = {
            "trace": trace_id,
            "data": {
                "symbol_list": [
                    {"code": symbol}
                ]
            }
        }
        
        query_json = json.dumps(query_data, ensure_ascii=False)
        # httpx会自动对params进行URL编码，所以我们直接传JSON字符串，不需要手动编码
        # 但为了避免双重编码问题，我们使用data参数而不是params
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 使用POST请求，query参数放在URL中，data为空
            url = f"{ALLTICK_BASE_URL}/depth-tick?token={ALLTICK_TOKEN}&query={urllib.parse.quote(query_json)}"
            response = await client.post(
                url,
                headers={
                    "accept": "application/json"
                }
            )
            
            try:
                api_response = response.json()
            except:
                api_response = {"error": response.text}
            
            ret_code = api_response.get("ret", response.status_code)
            
            if response.status_code == 200 and ret_code == 200:
                logger.info(f"[Depth-Tick成功] Symbol: {symbol} | Ret: {ret_code}")
                return JSONResponse(content=api_response, status_code=200)
            else:
                error_data = {
                    "ret": ret_code,
                    "msg": api_response.get("msg", api_response.get("error", "Unknown error")),
                    "trace": api_response.get("trace", trace_id)
                }
                logger.warning(f"[Depth-Tick错误] Symbol: {symbol} | Ret: {ret_code} | Error: {error_data.get('msg')}")
                return JSONResponse(content=error_data, status_code=response.status_code if response.status_code != 200 else 400)
                
    except httpx.TimeoutException as e:
        logger.error(f"[Depth-Tick超时] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=504, detail="请求超时")
    except httpx.RequestError as e:
        logger.error(f"[Depth-Tick请求错误] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"请求错误: {str(e)}")
    except Exception as e:
        logger.error(f"[Depth-Tick服务器错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")


@app.get("/health")
async def health_check():
    """健康检查接口"""
    logger.info("[健康检查] 服务正常")
    return {"status": "ok", "service": "白银K线监控"}


# 挂载前端静态文件（CSS、JS等）
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# 添加静态文件路由，使前端资源可以直接访问（放在最后，避免匹配API路由）
@app.get("/{file_path:path}")
async def serve_static(file_path: str, request: Request):
    """服务前端静态文件"""
    if file_path in ["", "index.html"]:
        response = FileResponse(str(FRONTEND_DIR / "index.html"))
        # 开发模式下禁用缓存，方便热重载
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    
    file = FRONTEND_DIR / file_path
    if file.exists() and file.is_file():
        response = FileResponse(str(file))
        # 开发模式下禁用缓存，方便热重载
        if file_path.endswith(('.js', '.css', '.html')):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response
    
    # 如果是API路径，返回404
    if file_path.startswith("api/") or file_path.startswith("docs") or file_path.startswith("openapi.json"):
        raise HTTPException(status_code=404, detail="Not found")
    
    # 其他情况返回index.html（用于SPA路由）
    response = FileResponse(str(FRONTEND_DIR / "index.html"))
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


if __name__ == "__main__":
    logger.info("=" * 50)
    logger.info("白银K线监控服务启动")
    logger.info("=" * 50)
    logger.info(f"服务运行在: http://localhost:8080")
    logger.info(f"API文档: http://localhost:8080/docs")
    logger.info(f"健康检查: http://localhost:8080/health")
    logger.info(f"日志目录: {LOGS_DIR}")
    logger.info("=" * 50)
    logger.info("按 Ctrl+C 停止服务器")
    logger.info("=" * 50)
    
    print("=" * 50)
    print("白银K线监控服务启动")
    print("=" * 50)
    print("服务运行在: http://localhost:8080")
    print("API文档: http://localhost:8080/docs")
    print("健康检查: http://localhost:8080/health")
    print(f"日志目录: {LOGS_DIR}")
    print("=" * 50)
    print("按 Ctrl+C 停止服务器")
    print("=" * 50)
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info"
    )

