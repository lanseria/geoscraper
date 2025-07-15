# worker/main.py
import asyncio
import json
import logging
import os
import time
from pathlib import Path

import httpx
import psycopg2
import redis
from dotenv import load_dotenv

# --- 配置 ---
# 使用 logging 模块记录日志，比 print 更专业
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# 加载环境变量
load_dotenv()

# 从环境变量获取配置
DB_URL = os.getenv('DB_URL')
REDIS_HOST = os.getenv('REDIS_HOST')
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')
TASK_QUEUE_NAME = 'tile-scrape-queue'
STORAGE_ROOT = Path(os.getenv('STORAGE_ROOT', '/data/geoscraper-tiles'))

# Redis 队列键名 (BullMQ 格式)
WAITING_LIST_KEY = f'bull:{TASK_QUEUE_NAME}:waiting'
ACTIVE_LIST_KEY = f'bull:{TASK_QUEUE_NAME}:active'

# 地图 URL 模板
MAP_URL_TEMPLATES = {
    'google-satellite': 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    'osm-standard': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    'osm-topo': 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
}

# --- 数据库操作 ---
def update_task_status(task_id, status, progress=None):
    """更新数据库中的任务状态和进度"""
    try:
        conn = psycopg2.connect(DB_URL)
        with conn.cursor() as cur:
            if progress is not None:
                cur.execute(
                    "UPDATE geoscraper.tasks SET status = %s, progress = %s, updated_at = NOW() WHERE id = %s",
                    (status, progress, task_id)
                )
            else:
                cur.execute(
                    "UPDATE geoscraper.tasks SET status = %s, updated_at = NOW() WHERE id = %s",
                    (status, task_id)
                )
            conn.commit()
        conn.close()
        logging.info(f"Task {task_id}: Status updated to '{status}', progress: {progress or 'N/A'}")
    except Exception as e:
        logging.error(f"Task {task_id}: Failed to update status in DB: {e}")

def get_task_details(task_id):
    """从数据库获取任务详情"""
    try:
        conn = psycopg2.connect(DB_URL)
        with conn.cursor() as cur:
            cur.execute("SELECT name, bounds, zoom_levels, map_type, concurrency, download_delay FROM geoscraper.tasks WHERE id = %s", (task_id,))
            task = cur.fetchone()
        conn.close()
        if task:
            return {
                "name": task[0], "bounds": task[1], "zoom_levels": task[2],
                "map_type": task[3], "concurrency": int(task[4]), "download_delay": float(task[5])
            }
        return None
    except Exception as e:
        logging.error(f"Task {task_id}: Failed to fetch details from DB: {e}")
        return None

# --- 瓦片计算逻辑 (从JS版本移植) ---
def lon_to_tile_x(lon, zoom):
    return int((lon + 180) / 360 * (2 ** zoom))

def lat_to_tile_y(lat, zoom):
    return int((1 -_log(tan(radians(lat)) + 1 / cos(radians(lat))) / pi) / 2 * (2 ** zoom))
from math import log as _log, tan, radians, cos, pi

def calculate_all_tiles(bounds, zoom_levels):
    """计算所有需要下载的瓦片坐标"""
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

# --- 核心下载逻辑 ---
async def download_tile(client, tile, url_template, task_id, delay):
    """下载单个瓦片"""
    z, x, y = tile['z'], tile['x'], tile['y']
    url = url_template.format(z=z, x=x, y=y)
    save_path = STORAGE_ROOT / str(task_id) / str(z) / str(x)
    save_path.mkdir(parents=True, exist_ok=True)
    file_path = save_path / f"{y}.png"

    if file_path.exists():
        return 'skipped'

    try:
        await asyncio.sleep(delay) # 下载延迟
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        async with client.stream('GET', url, headers=headers, timeout=20) as response:
            response.raise_for_status()
            with open(file_path, 'wb') as f:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)
        return 'downloaded'
    except httpx.HTTPStatusError as e:
        logging.warning(f"Task {task_id}: HTTP Error {e.response.status_code} for tile {z}/{x}/{y}")
        return 'failed'
    except Exception as e:
        logging.error(f"Task {task_id}: Error downloading tile {z}/{x}/{y}: {e}")
        return 'failed'


async def process_task(task_id):
    """处理单个任务的完整流程"""
    logging.info(f"Task {task_id}: Starting processing.")
    
    # 1. 更新状态为 'running'
    update_task_status(task_id, 'running', 0)

    # 2. 获取任务详情
    details = get_task_details(task_id)
    if not details:
        update_task_status(task_id, 'failed')
        return

    # 3. 计算所有瓦片
    all_tiles = calculate_all_tiles(details['bounds'], details['zoom_levels'])
    total_tiles = len(all_tiles)
    if total_tiles == 0:
        logging.info(f"Task {task_id}: No tiles to download. Marking as complete.")
        update_task_status(task_id, 'completed', 100)
        return

    logging.info(f"Task {task_id}: Found {total_tiles} tiles to download.")
    url_template = MAP_URL_TEMPLATES.get(details['map_type'])
    
    # 4. 并发下载
    completed_count = 0
    limits = httpx.Limits(max_connections=details['concurrency'], max_keepalive_connections=details['concurrency'])
    async with httpx.AsyncClient(limits=limits) as client:
        tasks_to_run = [download_tile(client, tile, url_template, task_id, details['download_delay']) for tile in all_tiles]
        last_progress_update = time.time()
        
        for i, future in enumerate(asyncio.as_completed(tasks_to_run)):
            result = await future
            if result in ['downloaded', 'skipped']:
                completed_count += 1
            
            # 每秒最多更新一次进度，避免频繁写库
            now = time.time()
            if now - last_progress_update > 1 or completed_count == total_tiles:
                progress = (completed_count / total_tiles) * 100
                update_task_status(task_id, 'running', progress)
                last_progress_update = now
    
    # 5. 任务完成
    final_progress = (completed_count / total_tiles) * 100
    logging.info(f"Task {task_id}: Processing finished. {completed_count}/{total_tiles} tiles successful.")
    update_task_status(task_id, 'completed', final_progress)


# --- 主循环 ---
def main():
    """主函数，监听 Redis 队列并分发任务"""
    logging.info("Python Worker is starting...")
    logging.info(f"Watching Redis queue: '{TASK_QUEUE_NAME}'")
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True) # 确保根存储目录存在

    redis_client = redis.Redis(
        host=REDIS_HOST,
        password=REDIS_PASSWORD,
        decode_responses=True
    )

    while True:
        try:
            # 使用 BRPOP 进行调试，它返回 (list_name, item)
            # timeout=0 表示无限期等待
            packed_job = redis_client.brpop([WAITING_LIST_KEY], timeout=10) 

            if packed_job:
                # packed_job 是一个元组，例如 (b'bull:tile-scrape-queue:waiting', b'1')
                list_name, job_id = packed_job
                
                # --- 从这里开始，逻辑与之前相似 ---
                logging.info(f"Popped job with ID: {job_id} from list: {list_name}")
                
                # 立即将其放入 active 列表，模拟原子操作
                redis_client.lpush(ACTIVE_LIST_KEY, job_id)

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
                            update_task_status(task_id, 'failed')
                    else:
                        logging.error(f"Job {job_id} has no taskId field.")
                else:
                    logging.error(f"Could not retrieve data for job {job_id}")
                
                # 处理完后，从 active 列表中移除
                redis_client.lrem(ACTIVE_LIST_KEY, 1, job_id)
                # 还可以删除作业的哈希数据，这里暂时省略以简化
                
        except redis.exceptions.ConnectionError as e:
            logging.error(f"Redis connection error: {e}. Retrying in 5 seconds...")
            time.sleep(5)
        except Exception as e:
            logging.error(f"An unexpected error occurred in the main loop: {e}")
            time.sleep(5)


if __name__ == "__main__":
    main()