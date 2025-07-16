# worker/main.py
import asyncio
import json
import logging
import os
import re
import time
from pathlib import Path

import httpx
import psycopg2
import psycopg2.extras  # <--- 确保这一行存在且没有被注释
import redis
from dotenv import load_dotenv


# --- 配置 ---
# (此部分保持不变)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
load_dotenv()
DB_URL = os.getenv('DB_URL')
REDIS_HOST = os.getenv('REDIS_HOST')
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')
REDIS_DB = int(os.getenv('REDIS_DB', 3))
TASK_QUEUE_NAME = 'tile-scrape-queue'
STORAGE_ROOT = Path(os.getenv('STORAGE_ROOT', '/data/geoscraper-tiles'))
WAIT_LIST_KEY = f'bull:{TASK_QUEUE_NAME}:wait'
ACTIVE_LIST_KEY = f'bull:{TASK_QUEUE_NAME}:active'
MAP_URL_TEMPLATES = {
    'google-satellite': 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    'osm-standard': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    'osm-topo': 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
}
HTTP_PROXY_URL = os.getenv('HTTP_PROXY_URL')
REDIS_UPDATE_CHANNEL = "task-updates" # 用于发布任务更新的频道

# --- Redis 客户端实例 ---
# 将其提升为全局，方便复用
redis_client = redis.Redis(
    host=REDIS_HOST,
    password=REDIS_PASSWORD,
    db=REDIS_DB,
    decode_responses=True
)

def to_camel_case(snake_str):
    """
    将蛇形命名 (snake_case) 字符串转换为驼峰命名 (camelCase)。
    例如: 'hello_world' -> 'helloWorld'
    """
    # 使用正则表达式的替换函数，更高效
    return re.sub(r'_([a-z])', lambda m: m.group(1).upper(), snake_str)

def convert_keys_to_camel_case(data):
    """
    递归地将字典或字典列表中的所有键从 snake_case 转换为 camelCase。
    """
    if isinstance(data, dict):
        return {to_camel_case(k): convert_keys_to_camel_case(v) for k, v in data.items()}
    if isinstance(data, list):
        return [convert_keys_to_camel_case(i) for i in data]
    return data

# --- 数据库操作 (重构) ---
def update_task_in_db(task_id, status=None, progress=None, total_tiles=None, completed_tiles=None):
    """
    通用函数，根据传入的参数更新数据库中的任务。
    """
    update_fields = []
    params = []

    if status:
        update_fields.append("status = %s")
        params.append(status)
    if progress is not None:
        update_fields.append("progress = %s")
        params.append(progress)
    if total_tiles is not None:
        update_fields.append("total_tiles = %s")
        params.append(total_tiles)
    if completed_tiles is not None:
        update_fields.append("completed_tiles = %s")
        params.append(completed_tiles)

    if not update_fields:
        return

    try:
        conn = psycopg2.connect(DB_URL)
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur: # 确保使用 DictCursor
            query = f"UPDATE geoscraper.tasks SET {', '.join(update_fields)}, updated_at = NOW() WHERE id = %s RETURNING *"
            params.append(task_id)
            cur.execute(query, tuple(params))
            updated_task_raw = cur.fetchone()
            conn.commit()
            
            if updated_task_raw:
                # 将 psycopg2.extras.DictRow 转换为普通字典
                updated_task_dict = dict(updated_task_raw)
                
                # 将日期时间对象转换为 ISO 格式字符串
                for key, value in updated_task_dict.items():
                    if hasattr(value, 'isoformat'):
                        updated_task_dict[key] = value.isoformat()
                
                # --- 核心修改：在发布前转换命名风格 ---
                task_camel_case = convert_keys_to_camel_case(updated_task_dict)
                
                redis_client.publish(REDIS_UPDATE_CHANNEL, json.dumps(task_camel_case))
                logging.info(f"Task {task_id}: DB updated and published (camelCase) to Redis.")
            
        conn.close()
    except Exception as e:
        logging.error(f"Task {task_id}: Failed to update DB or publish: {e}")

def get_task_details(task_id):
    """从数据库获取任务详情 (保持不变)"""
    try:
        conn = psycopg2.connect(DB_URL)
        # 多查询几个字段，以备后用
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute("SELECT * FROM geoscraper.tasks WHERE id = %s", (task_id,))
            task = cur.fetchone()
        conn.close()
        return dict(task) if task else None
    except Exception as e:
        logging.error(f"Task {task_id}: Failed to fetch details from DB: {e}")
        return None

# --- 瓦片计算逻辑 (保持不变) ---
from math import log as _log, tan, radians, cos, pi
def lon_to_tile_x(lon, zoom): return int((lon + 180) / 360 * (2 ** zoom))
def lat_to_tile_y(lat, zoom): return int((1 -_log(tan(radians(lat)) + 1 / cos(radians(lat))) / pi) / 2 * (2 ** zoom))
def calculate_all_tiles(bounds, zoom_levels):
    tiles_to_download = []
    for zoom in zoom_levels:
        min_x = lon_to_tile_x(bounds['sw']['lng'], zoom)
        max_x = lon_to_tile_x(bounds['ne']['lng'], zoom)
        min_y = lat_to_tile_y(bounds['ne']['lat'], zoom)
        max_y = lat_to_tile_y(bounds['sw']['lat'], zoom)
        for x in range(min_x, max_x + 1):
            for y in range(min_y, max_y + 1):
                tiles_to_download.append({'z': zoom, 'x': x, 'y': y})
    return tiles_to_download

# --- 核心下载逻辑 (保持不变) ---
async def download_tile(client, tile, url_template, task_id, delay):
    z, x, y = tile['z'], tile['x'], tile['y']
    url = url_template.format(z=z, x=x, y=y)
    save_path = STORAGE_ROOT / str(task_id) / str(z) / str(x)
    save_path.mkdir(parents=True, exist_ok=True)
    file_path = save_path / f"{y}.png"
    if file_path.exists(): return 'skipped'
    try:
        await asyncio.sleep(delay)
        headers = {'User-Agent': 'Mozilla/5.0'}
        async with client.stream('GET', url, headers=headers, timeout=20) as response:
            response.raise_for_status()
            with open(file_path, 'wb') as f:
                async for chunk in response.aiter_bytes(): f.write(chunk)
        return 'downloaded'
    except Exception: return 'failed'


async def process_task(task_id):
    """处理单个任务的完整流程 (重点修改)"""
    # --- 在函数开始时进行延迟导入 ---
    import httpx
    
    logging.info(f"Task {task_id}: Starting processing.")
    
    details = get_task_details(task_id)
    if not details:
        logging.error(f"Task {task_id}: Could not find task details in DB.")
        return

    all_tiles = calculate_all_tiles(details['bounds'], details['zoom_levels'])
    total_tiles = len(all_tiles)

    update_task_in_db(task_id, status='running', progress=0, total_tiles=total_tiles, completed_tiles=0)

    if total_tiles == 0:
        logging.info(f"Task {task_id}: No tiles to download. Marking as complete.")
        update_task_in_db(task_id, status='completed', progress=100)
        return

    logging.info(f"Task {task_id}: Found {total_tiles} tiles to download.")
    url_template = MAP_URL_TEMPLATES.get(details['map_type'])
    
    concurrency = details.get('concurrency', 5)
    download_delay = details.get('download_delay', 0.2)
    
    client_kwargs = {
        "limits": httpx.Limits(max_connections=concurrency, max_keepalive_connections=concurrency)
    }

    if HTTP_PROXY_URL:
        logging.info(f"Attempting to configure proxy: {HTTP_PROXY_URL}")
        try:
            # --- 再次进行延迟导入，仅在需要时 ---
            from httpx import Proxy, AsyncHTTPTransport

            # 默认使用新版 'proxies' API
            client_kwargs["proxies"] = HTTP_PROXY_URL
            
            try:
                _ = httpx.AsyncClient(**client_kwargs)
                logging.info("Proxy configured successfully using 'proxies' parameter.")
            except TypeError as e:
                if 'unexpected keyword' in str(e):
                    logging.warning(f"Httpx version is old, falling back to 'mounts' for proxy. Error: {e}")
                    client_kwargs.pop("proxies", None)
                    proxy = Proxy(HTTP_PROXY_URL)
                    transport = AsyncHTTPTransport(proxy=proxy)
                    client_kwargs["mounts"] = {"http://": transport, "https://": transport}
                    logging.info("Proxy configured successfully using 'mounts' parameter.")
                else:
                    raise e
        except Exception as e:
            logging.error(f"FATAL: Failed to configure httpx client with proxy. Aborting task. Error: {e}", exc_info=True)
            update_task_in_db(task_id, status='failed')
            return
            
    else:
        logging.info(f"No proxy configured, connecting directly.")

    async with httpx.AsyncClient(**client_kwargs) as client:
        tasks_to_run = [download_tile(client, tile, url_template, task_id, download_delay) for tile in all_tiles]
        last_update_time = time.time()

        # --- 核心修正：初始化 completed_count ---
        completed_count = 0

        for i, future in enumerate(asyncio.as_completed(tasks_to_run)):
            result = await future
            if result in ['downloaded', 'skipped']:
                completed_count += 1
            
            # 每秒最多更新一次进度，或在最后一次更新
            now = time.time()
            is_last_tile = (i + 1) == total_tiles
            if (now - last_update_time > 1) or is_last_tile:
                progress = (completed_count / total_tiles) * 100
                update_task_in_db(task_id, status='running', progress=progress, completed_tiles=completed_count)
                last_update_time = now
    
    # 任务完成
    final_progress = (completed_count / total_tiles) * 100
    logging.info(f"Task {task_id}: Processing finished. {completed_count}/{total_tiles} tiles successful.")
    update_task_in_db(task_id, status='completed', progress=final_progress, completed_tiles=completed_count)


def main():
    """主函数，监听 Redis 队列并分发任务"""
    logging.info("Python Worker is starting...")
    logging.info(f"Watching Redis queue: '{TASK_QUEUE_NAME}' on key '{WAIT_LIST_KEY}'")
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

    while True:
        try:
            job_id = redis_client.brpoplpush(WAIT_LIST_KEY, ACTIVE_LIST_KEY, timeout=10)

            if job_id:
                job_data_str = redis_client.hget(f'bull:{TASK_QUEUE_NAME}:{job_id}', 'data')
                if job_data_str:
                    job_data = json.loads(job_data_str)
                    task_id = job_data.get('taskId')
                    if task_id:
                        logging.info(f"Picked up task ID: {task_id} from job {job_id}")
                        try:
                            asyncio.run(process_task(task_id))
                        except Exception as e:
                            logging.error(f"Task {task_id}: Unhandled exception in process_task: {e}")
                            update_task_in_db(task_id, status='failed')
                    else:
                        logging.error(f"Job {job_id} has no taskId field.")
                else:
                    logging.error(f"Could not retrieve data for job {job_id}")

                redis_client.lrem(ACTIVE_LIST_KEY, 1, job_id)
                redis_client.delete(f'bull:{TASK_QUEUE_NAME}:{job_id}')
                
        except redis.exceptions.ConnectionError as e:
            logging.error(f"Redis connection error: {e}. Retrying in 5 seconds...")
            time.sleep(5)
        except Exception as e:
            logging.error(f"An unexpected error occurred in the main loop: {e}")
            time.sleep(5)


if __name__ == "__main__":
    main()