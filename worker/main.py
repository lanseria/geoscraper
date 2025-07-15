import os
import time
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv('DB_URL')
redis_host = os.getenv('REDIS_HOST')
redis_pass = os.getenv('REDIS_PASSWORD')

print(f"Connecting to DB: {db_url}")
print(f"Connecting to Redis: {redis_host} {redis_pass}")

# ... 添加连接测试逻辑 ...

while True:
    print("Python worker is alive...")
    time.sleep(10)