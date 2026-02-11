"""
影片管理模块
管理影片（项目）的 CRUD 和当前影片状态
"""

import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path

# 影片数据目录
FILMS_DIR = Path("films")
FILMS_DIR.mkdir(exist_ok=True)

# 影片索引文件
FILMS_INDEX = FILMS_DIR / "index.json"

# 默认影片 ID
DEFAULT_FILM_ID = "default"


def _load_index():
    """加载影片索引"""
    if FILMS_INDEX.exists():
        with open(FILMS_INDEX, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_index(index):
    """保存影片索引"""
    with open(FILMS_INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)


def init_default_film():
    """初始化默认影片（用于数据迁移）"""
    index = _load_index()
    if DEFAULT_FILM_ID not in index:
        # 检查是否有现有数据需要迁移
        has_existing_data = False
        
        # 检查 old history
        old_history = Path("history")
        if old_history.exists() and any(old_history.iterdir()):
            has_existing_data = True
        
        # 检查 old storyboards
        old_storyboards = Path("storyboards")
        if old_storyboards.exists() and any(old_storyboards.iterdir()):
            has_existing_data = True
        
        film_name = "默认影片（迁移数据）" if has_existing_data else "我的第一个影片"
        
        index[DEFAULT_FILM_ID] = {
            "id": DEFAULT_FILM_ID,
            "name": film_name,
            "description": "自动创建的默认影片",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "cover_image": None,
        }
        _save_index(index)
        
        # 创建影片目录结构
        _create_film_dirs(DEFAULT_FILM_ID)
        
        return True, has_existing_data
    return False, False


def _create_film_dirs(film_id):
    """创建影片的目录结构"""
    film_dir = FILMS_DIR / film_id
    (film_dir / "history" / "inputs").mkdir(parents=True, exist_ok=True)
    (film_dir / "history" / "results").mkdir(parents=True, exist_ok=True)
    (film_dir / "storyboards").mkdir(parents=True, exist_ok=True)
    (film_dir / "quick_access").mkdir(parents=True, exist_ok=True)
    return film_dir


def create_film(name, description=""):
    """创建新影片"""
    film_id = str(uuid.uuid4())
    
    index = _load_index()
    index[film_id] = {
        "id": film_id,
        "name": name,
        "description": description,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "cover_image": None,
    }
    _save_index(index)
    
    # 创建目录结构
    _create_film_dirs(film_id)
    
    return index[film_id]


def get_film(film_id):
    """获取影片信息"""
    index = _load_index()
    return index.get(film_id)


def list_films():
    """列出所有影片"""
    index = _load_index()
    return sorted(index.values(), key=lambda x: x["updated_at"], reverse=True)


def update_film(film_id, name=None, description=None, cover_image=None):
    """更新影片信息"""
    index = _load_index()
    if film_id not in index:
        return None
    
    if name is not None:
        index[film_id]["name"] = name
    if description is not None:
        index[film_id]["description"] = description
    if cover_image is not None:
        index[film_id]["cover_image"] = cover_image
    
    index[film_id]["updated_at"] = datetime.now().isoformat()
    _save_index(index)
    return index[film_id]


def delete_film(film_id):
    """删除影片及其所有数据"""
    if film_id == DEFAULT_FILM_ID:
        return False, "不能删除默认影片"
    
    index = _load_index()
    if film_id not in index:
        return False, "影片不存在"
    
    # 删除影片目录
    film_dir = FILMS_DIR / film_id
    if film_dir.exists():
        shutil.rmtree(film_dir)
    
    # 从索引中移除
    del index[film_id]
    _save_index(index)
    
    return True, None


def get_film_dir(film_id):
    """获取影片目录路径"""
    return FILMS_DIR / film_id


def get_film_history_dir(film_id):
    """获取影片历史记录目录"""
    return FILMS_DIR / film_id / "history"


def get_film_storyboards_dir(film_id):
    """获取影片故事板目录"""
    return FILMS_DIR / film_id / "storyboards"


def get_film_quick_access_path(film_id):
    """获取影片快捷访问数据文件路径"""
    return FILMS_DIR / film_id / "quick_access" / "data.json"


# ========== 快捷访问数据管理 ==========

def load_quick_access(film_id):
    """加载影片的快捷访问数据"""
    path = get_film_quick_access_path(film_id)
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_quick_access(film_id, data):
    """保存影片的快捷访问数据"""
    path = get_film_quick_access_path(film_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def add_quick_access_image(film_id, image_data):
    """添加图片到快捷访问"""
    data = load_quick_access(film_id)
    
    # 检查是否已存在
    for img in data:
        if (img.get("localPath") == image_data.get("localPath") or 
            img.get("remoteUrl") == image_data.get("remoteUrl")):
            return None
    
    image_data["addedAt"] = datetime.now().isoformat()
    data.append(image_data)
    save_quick_access(film_id, data)
    return image_data


def update_quick_access_image(film_id, local_path, updates):
    """更新快捷访问图片信息"""
    data = load_quick_access(film_id)
    for img in data:
        if img.get("localPath") == local_path:
            img.update(updates)
            img["updatedAt"] = datetime.now().isoformat()
            save_quick_access(film_id, data)
            return img
    return None


def remove_quick_access_image(film_id, local_path):
    """从快捷访问中移除图片"""
    data = load_quick_access(film_id)
    print(f"[FilmManager] 删除前数据: {len(data)} 条")
    print(f"[FilmManager] 尝试删除: {local_path}")
    print(f"[FilmManager] 现有路径: {[img.get('localPath') for img in data]}")
    
    original_count = len(data)
    data = [img for img in data if img.get("localPath") != local_path]
    
    if len(data) < original_count:
        print(f"[FilmManager] 删除成功，剩余 {len(data)} 条")
        save_quick_access(film_id, data)
        return True
    else:
        print(f"[FilmManager] 未找到匹配项，删除失败")
        return False


# ========== 数据迁移 ==========

def migrate_existing_data():
    """将现有数据迁移到默认影片"""
    film_id = DEFAULT_FILM_ID
    film_dir = FILMS_DIR / film_id
    
    migrated = {
        "history": False,
        "storyboards": False,
        "count": 0
    }
    
    # 迁移 history
    old_history = Path("history")
    if old_history.exists():
        target_history = film_dir / "history"
        for item in old_history.iterdir():
            if item.is_file():
                shutil.copy2(item, target_history / item.name)
                migrated["count"] += 1
            elif item.is_dir():
                target_dir = target_history / item.name
                target_dir.mkdir(exist_ok=True)
                for subitem in item.iterdir():
                    if subitem.is_file():
                        shutil.copy2(subitem, target_dir / subitem.name)
                        migrated["count"] += 1
        migrated["history"] = True
    
    # 迁移 storyboards
    old_storyboards = Path("storyboards")
    if old_storyboards.exists():
        target_storyboards = film_dir / "storyboards"
        for item in old_storyboards.iterdir():
            if item.is_file():
                shutil.copy2(item, target_storyboards / item.name)
                migrated["count"] += 1
        migrated["storyboards"] = True
    
    return migrated
