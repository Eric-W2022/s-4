"""
数据路由模块
提供K线数据、交易tick、深度tick等数据接口
"""
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
import httpx
import logging
from datetime import datetime
import json
import uuid
import urllib.parse

# 导入共享配置和工具函数
from config import (
    TQSDK_KLINE_CACHE,
    TQSDK_QUOTE_CACHE,
    TQSDK_SUBSCRIPTION_RUNNING,
    ALLTICK_BASE_URL,
    ALLTICK_TOKEN,
    convert_interval_to_kline_type,
    convert_api_response_to_standard_format,
    get_tqsdk_kline_async,
    get_tqsdk_quote_async
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/data", tags=["数据接口"])


@router.get("/kline")
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
            
            # 检查是否有订阅缓存数据
            if TQSDK_SUBSCRIPTION_RUNNING and interval.lower() in TQSDK_KLINE_CACHE.get('AG', {}):
                cached_data = TQSDK_KLINE_CACHE['AG'][interval.lower()]
                if cached_data and len(cached_data) > 0:
                    # 从缓存中返回数据（限制数量）
                    result_data = cached_data[-limit:] if len(cached_data) > limit else cached_data
                    logger.info(f"[TqSdk缓存] Symbol: {symbol} | Interval: {interval} | 数据条数: {len(result_data)}")
                    return JSONResponse(
                        content=result_data,
                        status_code=200
                    )
            
            # 如果缓存中没有数据，尝试直接获取（兼容模式）
            logger.warning(f"[TqSdk回退] 缓存无数据，使用直接获取方式")
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


@router.get("/trade-tick")
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
            
            # 优先从订阅缓存中获取实时行情
            if TQSDK_SUBSCRIPTION_RUNNING and TQSDK_QUOTE_CACHE.get('AG'):
                quote = TQSDK_QUOTE_CACHE['AG']
                if quote:
                    # 处理last_price
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
                    if isinstance(datetime_value, (int, float)) and datetime_value > 0:
                        if datetime_value > 1e12:
                            tick_time_ms = int(datetime_value / 1e6)
                        elif datetime_value > 1e9:
                            tick_time_ms = int(datetime_value)
                        else:
                            tick_time_ms = int(datetime_value * 1000)
                    else:
                        tick_time_ms = int(datetime.now().timestamp() * 1000)
                    
                    result = {
                        "ret": 200,
                        "msg": "ok",
                        "trace": trace_id,
                        "data": {
                            "tick_list": [{
                                "code": "KQ.m@SHFE.ag",
                                "price": str(last_price),
                                "volume": str(quote.get('volume', 0)),
                                "tick_time": str(tick_time_ms)
                            }]
                        }
                    }
                    logger.info(f"[TqSdk缓存行情] Symbol: {symbol} | Price: {last_price}")
                    return JSONResponse(content=result, status_code=200)
            
            # 如果缓存中没有数据，使用直接获取（兼容模式）
            logger.warning(f"[TqSdk回退] 缓存无数据，使用直接获取方式")
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


@router.get("/depth-tick")
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

