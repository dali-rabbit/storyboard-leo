# plugins/__init__.py
"""
插件系统加载器。

规则：
- 只加载 plugins/ 下的子目录（如 plugins/nano_banana/）
- 默认跳过 plugins/example/（除非在 PLUGIN_ENABLED 中显式启用）
- 通过 .env 中的 PLUGIN_ENABLED 控制加载哪些插件
"""

import importlib
import os
from pathlib import Path

from dotenv import load_dotenv

# 加载项目根目录的 .env（应包含 PLUGIN_ENABLED）
load_dotenv()

PLUGIN_DIR = Path(__file__).parent
_loaded_plugins = {}


def load_plugins():
    global _loaded_plugins
    _loaded_plugins = {}

    # 从 .env 读取启用的插件列表
    enabled_str = os.getenv("PLUGIN_ENABLED", "").strip()
    if enabled_str:
        enabled_set = set(
            name.strip() for name in enabled_str.split(",") if name.strip()
        )
        print(f"[Plugin] 配置启用插件: {sorted(enabled_set)}")
    else:
        enabled_set = None  # None 表示“尝试加载所有（除 example）”
        print("[Plugin] 未设置 PLUGIN_ENABLED，将加载所有非 example 插件")

    for item in PLUGIN_DIR.iterdir():
        if not item.is_dir():
            continue

        plugin_name = item.name

        # 跳过 Python 包控制文件
        if plugin_name.startswith("__"):
            continue

        # 默认跳过 example 插件，除非显式启用
        if plugin_name == "example" and (
            enabled_set is None or plugin_name not in enabled_set
        ):
            if enabled_set is not None:
                print(f"[Plugin] 跳过未启用的插件: {plugin_name}")
            continue

        # 如果设置了白名单，且当前插件不在其中，跳过
        if enabled_set is not None and plugin_name not in enabled_set:
            print(f"[Plugin] 跳过未启用的插件: {plugin_name}")
            continue

        # 尝试加载 plugin.py
        module_path = f"plugins.{plugin_name}.plugin"
        try:
            module = importlib.import_module(module_path)

            if not hasattr(module, "generate_images"):
                print(f"[Plugin] 跳过 {plugin_name}：缺少 generate_images 函数")
                continue

            _loaded_plugins[plugin_name] = module.generate_images
            print(f"[Plugin] ✅ 成功加载: {plugin_name}")

        except Exception as e:
            print(f"[Plugin] ❌ 加载失败 {plugin_name}: {e}")


def get_plugin(name):
    """根据插件名返回 generate_images 函数，若不存在返回 None"""
    return _loaded_plugins.get(name)


def list_plugin_names():
    """返回当前已加载的插件名列表"""
    return list(_loaded_plugins.keys())


def get_face_swap_plugin():
    """返回指定的换脸插件函数（从 FACE_SWAP_PLUGIN 配置读取）"""
    plugin_name = os.getenv("FACE_SWAP_PLUGIN", "").strip()
    if not plugin_name:
        return None
    func = _loaded_plugins.get(plugin_name)
    if func is None:
        print(f"[FaceSwap] 插件未加载或不存在: {plugin_name}")
        return None
    # 注意：换脸插件必须实现 `swap_face(source_url, face_url)` 函数
    # 我们假设插件模块有一个 `swap_face` 函数（而不是 generate_images）
    try:
        module = importlib.import_module(f"plugins.{plugin_name}.plugin")
        return getattr(module, "swap_face", None)
    except Exception as e:
        print(f"[FaceSwap] 获取 swap_face 函数失败: {e}")
        return None
