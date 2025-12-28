"""
示例插件：演示如何编写一个兼容的图像生成插件。

功能：返回一张占位图（https://picsum.photos），仅用于演示。
实际插件应调用真实 API。

插件必须实现：
    generate_images(image_urls, prompt, size="2K", ar="auto") -> list[str]

环境变量：
    示例中不需要密钥，但真实插件应在 .env 中配置。
"""

import os
import requests
from pathlib import Path
from urllib.parse import urlencode

# 🔑 可选：加载本插件目录下的 .env（如果需要密钥）
# from dotenv import load_dotenv
# PLUGIN_DIR = Path(__file__).parent
# load_dotenv(PLUGIN_DIR / ".env")
# API_KEY = os.getenv("YOUR_API_KEY")

PLUGIN_NAME = "example"

def generate_images(image_urls, prompt, size="2K", ar="auto"):
    """
    插件主入口。
    
    Args:
        image_urls (list[str]): 已由主程序上传到外网的图片 URL 列表（如 ImgBB）
        prompt (str): 用户输入的文本提示
        size (str): 分辨率，如 "2K", "4K"
        ar (str): 宽高比，如 "16:9", "1:1", "auto"
    
    Returns:
        list[str]: 成功生成的图片 URL 列表（可被浏览器直接访问），失败返回 []
    """
    print(f"[{PLUGIN_NAME}] 收到请求: prompt='{prompt}', size={size}, ar={ar}")
    print(f"[{PLUGIN_NAME}] 输入图片: {image_urls[:2]}...")  # 仅打印前 2 张

    try:
        # === 示例逻辑：生成一个 Picsum 占位图 ===
        # 根据 size 和 ar 估算分辨率（简化处理）
        width, height = 1920, 1080  # 默认 2K
        if size == "4K":
            width, height = 3840, 2160
        if ar == "1:1":
            height = width

        params = urlencode({"w": width, "h": height, "random": hash(prompt) % 1000})
        placeholder_url = f"https://picsum.photos/{width}/{height}?{params}"

        # 测试 URL 是否有效（可选）
        resp = requests.head(placeholder_url, timeout=5)
        if resp.status_code == 200:
            print(f"[{PLUGIN_NAME}] 返回示例图: {placeholder_url}")
            return [placeholder_url]
        else:
            print(f"[{PLUGIN_NAME}] 占位图不可用")
    except Exception as e:
        print(f"[{PLUGIN_NAME}] 插件异常: {e}")

    return []