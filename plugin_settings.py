"""
插件设置管理模块
管理每个影片的生图插件配置（启用/禁用、排序）
"""

import json
from pathlib import Path

from film_manager import FILMS_DIR, DEFAULT_FILM_ID, get_film_dir

# 默认插件配置
# nano_banana 包含两个模型变体：nano-banana（普通）和 nano-banana-fast（快速）
DEFAULT_PLUGINS = [
    {"name": "nano_banana", "enabled": True},
    {"name": "nano_banana_fast", "enabled": True},
    {"name": "seedream", "enabled": True},
]

AVAILABLE_PLUGINS = ["nano_banana", "nano_banana_fast", "seedream"]


def _get_settings_path(film_id):
    """获取影片的插件设置文件路径"""
    return FILMS_DIR / film_id / "plugin_settings.json"


def load_plugin_settings(film_id=None):
    """
    加载影片的插件设置
    :param film_id: 影片ID，None则返回默认配置
    :return: 插件配置列表 [{"name": str, "enabled": bool}, ...]
    """
    if film_id is None:
        return DEFAULT_PLUGINS.copy()
    
    settings_path = _get_settings_path(film_id)
    if settings_path.exists():
        try:
            with open(settings_path, "r", encoding="utf-8") as f:
                settings = json.load(f)
                # 验证设置格式
                if isinstance(settings, list) and len(settings) > 0:
                    # 过滤掉无效的插件
                    valid_settings = [
                        s for s in settings 
                        if s.get("name") in AVAILABLE_PLUGINS
                    ]
                    if valid_settings:
                        # 检查是否有新增的默认插件不在已保存的设置中
                        existing_names = {s["name"] for s in valid_settings}
                        for default_plugin in DEFAULT_PLUGINS:
                            if default_plugin["name"] not in existing_names:
                                # 自动添加新插件
                                valid_settings.append(default_plugin.copy())
                                print(f"[PluginSettings] 自动添加新插件: {default_plugin['name']}")
                        return valid_settings
        except Exception as e:
            print(f"[PluginSettings] 加载设置失败: {e}")
    
    # 返回默认配置
    return DEFAULT_PLUGINS.copy()


def save_plugin_settings(film_id, settings):
    """
    保存影片的插件设置
    :param film_id: 影片ID
    :param settings: 插件配置列表
    :return: 是否成功
    """
    try:
        settings_path = _get_settings_path(film_id)
        settings_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(settings_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[PluginSettings] 保存设置失败: {e}")
        return False


def get_enabled_plugins(film_id=None):
    """
    获取启用的插件列表（按顺序）
    :param film_id: 影片ID
    :return: 启用的插件名称列表
    """
    settings = load_plugin_settings(film_id)
    return [s["name"] for s in settings if s.get("enabled", False)]


def reset_plugin_settings(film_id):
    """重置为默认设置"""
    return save_plugin_settings(film_id, DEFAULT_PLUGINS.copy())
