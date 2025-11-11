"""
数据路由模块
提供K线数据、交易tick、深度tick等数据接口
"""
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import httpx
import logging
from datetime import datetime
import json
import uuid
import urllib.parse
import csv
import os

# 导入共享配置和工具函数
from ..config.settings import (
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
        # 如果是国内白银(AG)，使用TqSdk获取数据（优先使用缓存）
        if symbol.upper() == 'AG':
            logger.info(f"[TqSdk请求] Symbol: {symbol} | Interval: {interval} | Limit: {limit}")
            
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
                # 优先使用订阅缓存的实时数据
                if TQSDK_SUBSCRIPTION_RUNNING and TQSDK_KLINE_CACHE.get('AG') and TQSDK_KLINE_CACHE['AG'].get(interval.lower()):
                    cached_data = TQSDK_KLINE_CACHE['AG'][interval.lower()]
                    if cached_data and len(cached_data) > 0:
                        # 返回最新的limit条数据
                        standard_data = cached_data[-limit:] if len(cached_data) > limit else cached_data
                        logger.info(f"[TqSdk缓存] Symbol: {symbol} | Interval: {interval} | 数据条数: {len(standard_data)}")
                        return JSONResponse(
                            content=standard_data,
                            status_code=200
                        )
                
                # 如果缓存中没有数据，使用直接获取（兼容模式）
                logger.warning(f"[TqSdk回退] 缓存无数据，使用直接获取方式")
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
        
        async with httpx.AsyncClient(timeout=60.0) as client:  # 增加到60秒
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
                
                # 确保返回标准HTTP状态码
                http_status = 400  # 客户端错误（如无效的symbol）
                if response.status_code >= 500:
                    http_status = 502  # 上游服务器错误
                elif response.status_code >= 400 and response.status_code < 500:
                    http_status = response.status_code
                
                return JSONResponse(
                    content=error_data,
                    status_code=http_status
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
    
    # 如果是国内白银(AG)，使用TqSdk获取实时行情（直接获取，不使用缓存）
    if symbol.upper() == 'AG':
        try:
            logger.info(f"[TqSdk实时行情请求] Symbol: {symbol}")
            
            # 直接获取实时行情数据（不使用缓存）
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
        
        async with httpx.AsyncClient(timeout=60.0) as client:  # 增加到60秒
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
                
                # 确保返回标准HTTP状态码
                http_status = 400  # 客户端错误（如无效的symbol）
                if response.status_code >= 500:
                    http_status = 502  # 上游服务器错误
                elif response.status_code >= 400 and response.status_code < 500:
                    http_status = response.status_code
                
                return JSONResponse(content=error_data, status_code=http_status)
                
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
    symbol: str = Query(..., description="产品代码，如Silver、AG等")
):
    """
    获取最新盘口深度接口
    国内白银(AG)使用TqSdk，其他产品使用AllTick API
    """
    client_ip = request.client.host if request.client else "unknown"
    request_time = datetime.now().isoformat()
    trace_id = f"{uuid.uuid4()}-{int(datetime.now().timestamp() * 1000)}"
    
    logger.info(f"[Depth-Tick请求] IP: {client_ip} | Symbol: {symbol} | Trace: {trace_id}")
    
    # 如果是国内白银(AG)，使用TqSdk获取盘口数据
    if symbol.upper() == 'AG':
        try:
            # 优先从订阅缓存获取（实时更新）
            quote = TQSDK_QUOTE_CACHE.get('AG')
            
            # 如果缓存为空，尝试直接获取
            if quote is None:
                from ..config.settings import get_tqsdk_api
                api = get_tqsdk_api()
                contract = "KQ.m@SHFE.ag"
                quote = api.get_quote(contract)
                logger.info(f"[TqSdk盘口] 从直接API获取（缓存未就绪）")
            else:
                logger.debug(f"[TqSdk盘口] 从订阅缓存获取（实时数据）")
            
            # 辅助函数：安全获取字段值
            def get_field(field_name, default="0", as_int=False):
                if hasattr(quote, field_name):
                    value = getattr(quote, field_name)
                    if value is not None and value != "":
                        try:
                            if as_int:
                                return str(int(value))
                            else:
                                return str(value)
                        except:
                            pass
                return default
            
            # 计算涨跌和涨跌幅
            def calculate_change():
                try:
                    last_price = float(get_field('last_price', '0'))
                    pre_settlement = float(get_field('pre_settlement', '0'))
                    
                    if last_price > 0 and pre_settlement > 0:
                        change = last_price - pre_settlement
                        change_percent = (change / pre_settlement) * 100
                        return str(round(change, 2)), str(round(change_percent, 2))
                    return "0", "0"
                except:
                    return "0", "0"
            
            change_value, change_percent_value = calculate_change()
            
            # 处理datetime字段 - TqSdk返回纳秒级时间戳，需转换为毫秒
            def get_datetime_ms():
                try:
                    if hasattr(quote, 'datetime'):
                        dt_value = quote.datetime
                        if dt_value is not None:
                            # TqSdk的datetime是纳秒级时间戳，转换为毫秒
                            if isinstance(dt_value, (int, float)):
                                # 纳秒转毫秒
                                return str(int(dt_value / 1000000))
                            elif isinstance(dt_value, str):
                                # 如果是字符串，尝试转换
                                try:
                                    dt_ns = int(dt_value)
                                    return str(int(dt_ns / 1000000))
                                except:
                                    pass
                    # 如果获取失败，使用当前时间
                    return str(int(datetime.now().timestamp() * 1000))
                except:
                    return str(int(datetime.now().timestamp() * 1000))
            
            # 构造返回数据（模拟AllTick格式，并扩展更多字段）
            result = {
                "ret": 200,
                "msg": "ok",
                "trace": trace_id,
                "data": {
                    "depth_list": [{
                        "code": symbol,
                        # 买一到买五
                        "bid_price": [
                            get_field('bid_price1'),
                            get_field('bid_price2'),
                            get_field('bid_price3'),
                            get_field('bid_price4'),
                            get_field('bid_price5')
                        ],
                        "bid_volume": [
                            get_field('bid_volume1', as_int=True),
                            get_field('bid_volume2', as_int=True),
                            get_field('bid_volume3', as_int=True),
                            get_field('bid_volume4', as_int=True),
                            get_field('bid_volume5', as_int=True)
                        ],
                        # 卖一到卖五
                        "ask_price": [
                            get_field('ask_price1'),
                            get_field('ask_price2'),
                            get_field('ask_price3'),
                            get_field('ask_price4'),
                            get_field('ask_price5')
                        ],
                        "ask_volume": [
                            get_field('ask_volume1', as_int=True),
                            get_field('ask_volume2', as_int=True),
                            get_field('ask_volume3', as_int=True),
                            get_field('ask_volume4', as_int=True),
                            get_field('ask_volume5', as_int=True)
                        ],
                        # 扩展字段：更多市场数据
                        "last_price": get_field('last_price'),  # 最新价
                        "volume": get_field('volume', as_int=True),  # 成交量
                        "amount": get_field('amount'),  # 成交额
                        "open_interest": get_field('open_interest', as_int=True),  # 持仓量
                        "highest": get_field('highest'),  # 最高价
                        "lowest": get_field('lowest'),  # 最低价
                        "open": get_field('open'),  # 开盘价
                        "close": get_field('close'),  # 收盘价
                        "average": get_field('average'),  # 均价
                        "settlement": get_field('settlement'),  # 结算价
                        "pre_settlement": get_field('pre_settlement'),  # 昨结算
                        "pre_close": get_field('pre_close'),  # 昨收盘
                        "pre_open_interest": get_field('pre_open_interest', as_int=True),  # 昨持仓
                        "upper_limit": get_field('upper_limit'),  # 涨停价
                        "lower_limit": get_field('lower_limit'),  # 跌停价
                        "change": change_value,  # 涨跌（计算值）
                        "change_percent": change_percent_value,  # 涨跌幅（计算值）
                        # 合约信息
                        "instrument_name": get_field('instrument_name'),  # 合约名称
                        "price_tick": get_field('price_tick'),  # 价格变动单位
                        "volume_multiple": get_field('volume_multiple', as_int=True),  # 合约乘数
                        "datetime": get_datetime_ms()  # 行情时间（毫秒时间戳）
                    }]
                }
            }
            
            logger.info(f"[TqSdk盘口成功] Symbol: {symbol}")
            return JSONResponse(content=result, status_code=200)
            
        except Exception as e:
            logger.error(f"[TqSdk盘口错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"TqSdk获取盘口数据失败: {str(e)}")
    
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
        # httpx会自动对params进行URL编码，所以我们直接传JSON字符串，不需要手动编码
        # 但为了避免双重编码问题，我们使用data参数而不是params
        
        async with httpx.AsyncClient(timeout=60.0) as client:  # 增加到60秒
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
                
                # 确保返回标准HTTP状态码
                http_status = 400  # 客户端错误（如无效的symbol）
                if response.status_code >= 500:
                    http_status = 502  # 上游服务器错误
                elif response.status_code >= 400 and response.status_code < 500:
                    http_status = response.status_code
                
                return JSONResponse(content=error_data, status_code=http_status)
                
    except httpx.TimeoutException as e:
        logger.error(f"[Depth-Tick超时] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=504, detail="请求超时")
    except httpx.RequestError as e:
        logger.error(f"[Depth-Tick请求错误] Symbol: {symbol} | Error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"请求错误: {str(e)}")
    except Exception as e:
        logger.error(f"[Depth-Tick服务器错误] Symbol: {symbol} | Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")


# ==================== 预测数据保存 ====================

class PredictionData(BaseModel):
    """预测数据模型"""
    timestamp: int
    model: str
    action: str
    confidence: int
    riskLevel: str
    entryPrice: float
    stopLoss: float
    takeProfit: float
    lots: int
    londonPricePrediction15min: float
    pricePrediction15min: float
    analysisReason: Optional[str] = None
    profitLossPoints: Optional[float] = None
    profitLossPercent: Optional[float] = None
    isWin: Optional[bool] = None
    takeProfitReached: Optional[bool] = None
    takeProfitMinutes: Optional[int] = None
    stopLossReached: Optional[bool] = None
    stopLossMinutes: Optional[int] = None


class SavePredictionRequest(BaseModel):
    """保存预测请求模型（包含新预测和需要更新的历史数据）"""
    newPrediction: PredictionData
    recentPredictions: list[PredictionData] = []  # 最近15分钟内需要更新的预测


# ==================== 单手交易策略 ====================

class SingleHandPosition(BaseModel):
    """单手交易当前持仓"""
    hasPosition: bool
    direction: Optional[str] = None  # '多' 或 '空'
    entryPrice: Optional[float] = None
    entryTime: Optional[int] = None
    currentPrice: Optional[float] = None
    profitLossPoints: Optional[float] = None
    profitLossMoney: Optional[float] = None


class SingleHandOperation(BaseModel):
    """单手交易操作记录"""
    id: str
    timestamp: int
    action: str  # '开多', '开空', '平仓', '持有'
    price: float
    reason: str
    profitLossPoints: Optional[float] = None
    profitLossMoney: Optional[float] = None


@router.post("/save-prediction")
async def save_prediction(request: SavePredictionRequest):
    """
    保存15分钟多手预测数据到CSV文件，并更新15分钟内的旧数据
    """
    try:
        # 获取当前日期作为文件名
        date_str = datetime.now().strftime("%Y%m%d")
        # predictions/15min_multi_hand目录在项目根目录下
        from pathlib import Path
        base_dir = Path(__file__).parent.parent.parent
        predictions_dir = base_dir / "predictions" / "15min_multi_hand"
        csv_file = predictions_dir / f"predictions_{date_str}.csv"
        
        # 确保predictions/15min_multi_hand目录存在
        predictions_dir.mkdir(parents=True, exist_ok=True)
        
        # CSV表头
        fieldnames = [
            '时间', '模型', '操作', '信心度', '风险等级',
            '入场价', '止损价', '止盈价', '手数',
            '伦敦预测价', '国内预测价', '分析理由',
            '实际盈亏点数', '实际盈亏百分比', '是否盈利',
            '是否触达止盈', '触达止盈分钟数',
            '是否触达止损', '触达止损分钟数'
        ]
        
        # 读取现有数据
        existing_rows = []
        if csv_file.exists():
            with open(str(csv_file), 'r', newline='', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                existing_rows = list(reader)
        
        # 创建时间戳到更新数据的映射
        update_map = {}
        for pred in request.recentPredictions:
            timestamp_str = datetime.fromtimestamp(pred.timestamp / 1000).strftime("%Y-%m-%d %H:%M:%S")
            update_map[timestamp_str] = pred
        
        # 更新现有行的盈亏数据
        updated_count = 0
        for row in existing_rows:
            if row['时间'] in update_map:
                pred = update_map[row['时间']]
                # 更新盈亏字段
                if pred.profitLossPoints is not None:
                    row['实际盈亏点数'] = pred.profitLossPoints
                if pred.profitLossPercent is not None:
                    row['实际盈亏百分比'] = pred.profitLossPercent
                if pred.isWin is not None:
                    row['是否盈利'] = '是' if pred.isWin else '否'
                if pred.takeProfitReached is not None:
                    row['是否触达止盈'] = '是' if pred.takeProfitReached else '否'
                if pred.takeProfitMinutes is not None:
                    row['触达止盈分钟数'] = pred.takeProfitMinutes
                if pred.stopLossReached is not None:
                    row['是否触达止损'] = '是' if pred.stopLossReached else '否'
                if pred.stopLossMinutes is not None:
                    row['触达止损分钟数'] = pred.stopLossMinutes
                updated_count += 1
        
        # 添加新预测（检查是否已存在，避免重复）
        new_pred = request.newPrediction
        timestamp_str = datetime.fromtimestamp(new_pred.timestamp / 1000).strftime("%Y-%m-%d %H:%M:%S")
        
        # 检查该时间戳是否已存在
        timestamp_exists = any(row['时间'] == timestamp_str for row in existing_rows)
        
        if not timestamp_exists:
            new_row = {
                '时间': timestamp_str,
                '模型': new_pred.model,
                '操作': new_pred.action,
                '信心度': new_pred.confidence,
                '风险等级': new_pred.riskLevel,
                '入场价': new_pred.entryPrice,
                '止损价': new_pred.stopLoss,
                '止盈价': new_pred.takeProfit,
                '手数': new_pred.lots,
                '伦敦预测价': new_pred.londonPricePrediction15min,
                '国内预测价': new_pred.pricePrediction15min,
                '分析理由': new_pred.analysisReason or '',
                '实际盈亏点数': new_pred.profitLossPoints if new_pred.profitLossPoints is not None else '',
                '实际盈亏百分比': new_pred.profitLossPercent if new_pred.profitLossPercent is not None else '',
                '是否盈利': '是' if new_pred.isWin else '否' if new_pred.isWin is not None else '',
                '是否触达止盈': '是' if new_pred.takeProfitReached else '否' if new_pred.takeProfitReached is not None else '',
                '触达止盈分钟数': new_pred.takeProfitMinutes if new_pred.takeProfitMinutes else '',
                '是否触达止损': '是' if new_pred.stopLossReached else '否' if new_pred.stopLossReached is not None else '',
                '触达止损分钟数': new_pred.stopLossMinutes if new_pred.stopLossMinutes else ''
            }
            existing_rows.append(new_row)
        else:
            logger.info(f"[保存预测] 时间戳 {timestamp_str} 已存在，跳过添加")
        
        # 重新写入整个CSV文件
        with open(str(csv_file), 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(existing_rows)
        
        logger.info(f"[保存15分钟多手预测] 成功保存新预测并更新{updated_count}条历史数据到 {csv_file}")
        
        return {
            "success": True,
            "message": "15分钟多手预测数据已保存",
            "file": str(csv_file),
            "updated": updated_count
        }
        
    except Exception as e:
        logger.error(f"[保存15分钟多手预测错误] {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"保存15分钟多手预测数据失败: {str(e)}")


class SaveSingleHandOperationRequest(BaseModel):
    """保存单手交易操作请求"""
    operation: SingleHandOperation


@router.post("/save-single-hand-operation")
async def save_single_hand_operation(request: SaveSingleHandOperationRequest):
    """
    保存单手交易操作记录到CSV文件
    """
    try:
        # 获取当前日期作为文件名
        date_str = datetime.now().strftime("%Y%m%d")
        # predictions/single_hand目录在项目根目录下
        from pathlib import Path
        base_dir = Path(__file__).parent.parent.parent
        predictions_dir = base_dir / "predictions" / "single_hand"
        csv_file = predictions_dir / f"operations_{date_str}.csv"
        
        # 确保predictions/single_hand目录存在
        predictions_dir.mkdir(parents=True, exist_ok=True)
        
        # CSV表头
        fieldnames = [
            '时间', '操作', '价格', '理由', '盈亏点数', '盈亏金额'
        ]
        
        # 检查文件是否存在
        file_exists = csv_file.exists()
        
        # 准备操作数据
        op = request.operation
        timestamp_str = datetime.fromtimestamp(op.timestamp / 1000).strftime("%Y-%m-%d %H:%M:%S")
        
        row = {
            '时间': timestamp_str,
            '操作': op.action,
            '价格': op.price,
            '理由': op.reason,
            '盈亏点数': op.profitLossPoints if op.profitLossPoints is not None else '',
            '盈亏金额': op.profitLossMoney if op.profitLossMoney is not None else ''
        }
        
        # 追加写入CSV文件
        with open(str(csv_file), 'a', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()
            writer.writerow(row)
        
        logger.info(f"[保存单手交易操作] 成功保存操作记录到 {csv_file}")
        
        return {
            "success": True,
            "message": "单手交易操作已保存",
            "file": str(csv_file)
        }
        
    except Exception as e:
        logger.error(f"[保存单手交易操作错误] {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"保存单手交易操作失败: {str(e)}")

