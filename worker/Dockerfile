# ---- Stage 1: Builder ----
# 使用一个包含完整构建工具的 Python 镜像作为构建器
FROM m.daocloud.io/docker.io/library/python:3.12-slim-bookworm AS builder

# 设置工作目录
WORKDIR /app

# 安装 Poetry 或其他包管理器（如果使用）。这里我们直接使用 pip。
# 首先更新 pip 并安装依赖管理工具
RUN pip install --upgrade pip

# 为了更好地利用 Docker 缓存，我们先只复制依赖定义文件
COPY pyproject.toml README.md ./

# 安装依赖项。这会下载所有包到环境中。
# 注意：这里我们不使用虚拟环境，因为容器本身就是隔离的。
# --no-cache-dir 选项可以减少镜像大小
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple .

# ---- Stage 2: Final Image ----
# 使用一个非常精简的 Python 镜像作为最终的生产镜像
FROM m.daocloud.io/docker.io/library/python:3.12-slim-bookworm AS final

# 设置工作目录
WORKDIR /app

# 从 builder 阶段复制已安装的依赖项
# Python 的 site-packages 目录通常在 /usr/local/lib/pythonX.Y/site-packages
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
# 确保可执行文件也被复制
COPY --from=builder /usr/local/bin /usr/local/bin

# 复制应用程序的源代码
COPY . .

# 运行 worker 的命令
# 使用 `python -u` (等同于 PYTHONUNBUFFERED=1) 来确保日志能立即输出，方便调试
CMD ["python", "-u", "main.py"]