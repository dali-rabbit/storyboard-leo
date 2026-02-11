# test_gen_api.py
import os
import tempfile
import time
from pathlib import Path

import requests

from plugins import get_plugin, load_plugins
from uploader import upload_file_for_plugin

load_plugins()


# 需要迁移图片到火山 TOS 的插件
PLUGINS_NEED_VOLC_MIGRATION = ["seedream"]

# 插件映射：某些配置名称实际对应另一个插件
PLUGIN_NAME_MAPPING = {
    "nano_banana_fast": "nano_banana",  # fast 版本实际上是 nano_banana 插件的 fast 模型
}


def _migrate_to_volc_tos(image_urls, plugin_name):
    """
    将外部图片 URL 列表迁移到火山 TOS，返回新的 URL 列表
    :param image_urls: 原始图片 URL 列表
    :param plugin_name: 插件名称
    :return: 迁移后的 URL 列表
    """
    if not image_urls:
        return image_urls
    
    migrated_urls = []
    print(f"[Migrate] 为 {plugin_name} 迁移图片到火山 TOS...")
    
    for url in image_urls:
        # 如果已经是火山 TOS 链接，直接使用
        if "volces.com" in url or "tos-" in url:
            migrated_urls.append(url)
            continue
        
        try:
            # 下载图片
            print(f"[Migrate] 下载: {url[:80]}...")
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            
            # 保存到临时文件
            suffix = ".jpg"
            content_type = resp.headers.get("content-type", "")
            if "png" in content_type:
                suffix = ".png"
            elif "webp" in content_type:
                suffix = ".webp"
            
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(resp.content)
                tmp_path = tmp.name
            
            # 上传到火山 TOS
            volc_url = upload_file_for_plugin(tmp_path, plugin_name)
            migrated_urls.append(volc_url)
            print(f"[Migrate] 迁移成功: {volc_url[:80]}...")
            
            # 清理临时文件
            os.unlink(tmp_path)
            
        except Exception as e:
            print(f"[Migrate] 迁移失败 {url[:50]}...: {e}")
            # 迁移失败时保持原 URL（让插件自己尝试处理）
            migrated_urls.append(url)
    
    return migrated_urls


def generate_via_image_fallback(
    image_urls, prompt, size="2K", ar="auto", fallback_order=None, plugin_models=None
):
    """
    通过图片生成图片，支持多插件 fallback
    
    :param image_urls: 参考图片 URL 列表
    :param prompt: 生成提示词
    :param size: 分辨率
    :param ar: 宽高比
    :param fallback_order: 插件执行顺序
    :param plugin_models: 插件模型配置，如 {"nano_banana": "nano-banana-fast"}
    :return: 字典 {"urls": [...], "plugin": "name", "elapsed": seconds} 或空列表（保持兼容）
    """
    if fallback_order is None:
        fallback_order = ["nano_banana", "nano_banana_fast", "seedream"]
    
    if plugin_models is None:
        plugin_models = {}

    for name in fallback_order:
        # 处理插件名映射
        actual_plugin_name = PLUGIN_NAME_MAPPING.get(name, name)
        func = get_plugin(actual_plugin_name)
        if not func:
            print(f"[Plugin] 未找到: {name} (映射后: {actual_plugin_name})")
            continue
        print(f"🚀 尝试插件: {name} (实际: {actual_plugin_name})")
        
        try:
            # 检查是否需要图片迁移
            plugin_image_urls = image_urls
            if actual_plugin_name in PLUGINS_NEED_VOLC_MIGRATION:
                plugin_image_urls = _migrate_to_volc_tos(image_urls, actual_plugin_name)
            
            # 构建参数
            kwargs = {
                "image_urls": plugin_image_urls,
                "prompt": prompt,
                "size": size,
                "ar": ar
            }
            
            # 处理模型选择
            if actual_plugin_name == "nano_banana":
                # 如果是 nano_banana_fast 配置，自动使用 fast 模型
                if name == "nano_banana_fast":
                    kwargs["model"] = "nano-banana-fast"
                    print(f"[Plugin] 使用模型: nano-banana-fast (由 {name} 映射)")
                elif name in plugin_models:
                    kwargs["model"] = plugin_models[name]
                    print(f"[Plugin] 使用模型: {plugin_models[name]}")
            
            # 开始计时（仅 API 调用时间）
            start_time = time.time()
            result = func(**kwargs)
            elapsed = time.time() - start_time
            
            if result:
                print(f"[Plugin {name}] 生成成功，耗时: {elapsed:.1f}秒")
                return {
                    "urls": result,
                    "plugin": name,  # 返回用户配置的名称（如 nano_banana_fast）
                    "elapsed": round(elapsed, 1)
                }
        except Exception as e:
            print(f"[Plugin {name}] 异常: {e}")
    return []
