# 数据存储详解

## 存储架构

分镜狮采用文件系统存储，所有数据按**影片 (Film)** 隔离。

```
项目根目录/
├── films/                      # 影片数据根目录
│   ├── index.json              # 影片索引
│   └── {film_id}/              # 各影片目录
│       ├── history/            # 历史记录
│       │   ├── inputs/         # 上传的参考图
│       │   ├── results/        # 生成的结果图
│       │   └── *.json          # 历史记录元数据
│       ├── storyboards/        # 故事板
│       │   └── *.json
│       └── quick_access/
│           └── data.json       # 快捷访问数据
│
├── history/                    # 兼容旧版（迁移后不再使用）
│   ├── inputs/
│   ├── results/
│   └── *.json
│
└── storyboards/                # 兼容旧版（迁移后不再使用）
    └── *.json
```

---

## 影片索引

**文件**: `films/index.json`

**结构**:
```json
{
  "default": {
    "id": "default",
    "name": "默认影片（迁移数据）",
    "description": "自动创建的默认影片",
    "created_at": "2024-01-15T10:30:00",
    "updated_at": "2024-01-20T15:45:00",
    "cover_image": null
  },
  "550e8400-e29b-41d4-a716-446655440000": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "我的项目",
    "description": "项目描述",
    "created_at": "2024-01-20T16:00:00",
    "updated_at": "2024-01-20T16:30:00",
    "cover_image": "/history/films/.../results/cover.jpg"
  }
}
```

**字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 影片唯一标识（UUID 或 "default"） |
| `name` | string | 影片名称 |
| `description` | string | 影片描述 |
| `created_at` | ISO datetime | 创建时间 |
| `updated_at` | ISO datetime | 最后更新时间 |
| `cover_image` | string/null | 封面图路径 |

---

## 历史记录

### 存储位置

```
films/{film_id}/history/{record_id}.json
```

### 文件结构

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "film_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-20T16:30:00",
  
  "image_urls": [
    "https://imgbb.com/image1.jpg",
    "https://imgbb.com/image2.jpg"
  ],
  "local_input_paths": [
    "/history/films/xxx/history/inputs/xxx.jpg"
  ],
  
  "result_urls": [
    "https://imgbb.com/result1.jpg"
  ],
  "local_result_paths": [
    "/history/films/xxx/history/results/yyy.jpg"
  ],
  
  "prompt": "生成提示词",
  "size": "2K",
  "aspect_ratio": "16:9",
  "gen_elapsed": 15.3,
  "gen_plugin": "nano_banana"
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 记录唯一标识（UUID） |
| `film_id` | string | 所属影片 ID |
| `timestamp` | ISO datetime | 生成时间 |
| `image_urls` | [string] | 参考图外部 URL（ImgBB 等） |
| `local_input_paths` | [string] | 参考图本地路径 |
| `result_urls` | [string] | 结果图外部 URL |
| `local_result_paths` | [string] | 结果图本地路径 |
| `prompt` | string | 生成提示词 |
| `size` | string | 分辨率 (1K/2K/4K) |
| `aspect_ratio` | string | 宽高比 |
| `gen_elapsed` | number | 生成耗时（秒） |
| `gen_plugin` | string | 使用的插件 |

### 文件命名

- 单条记录: `{record_id}.json`
- 多条记录（手动保存）: `{record_id}_1.json`, `{record_id}_2.json`, ...

### 图片存储

**参考图**: `films/{film_id}/history/inputs/{uuid}.jpg`

**结果图**: `films/{film_id}/history/results/{uuid}.jpg`

所有图片统一转换为 **JPG 格式**，质量 92。

---

## 故事板

### 存储位置

```
films/{film_id}/storyboards/{storyboard_id}.json
```

### 文件结构

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "title": "故事板名称",
  "panels": [
    {
      "id": "panel-uuid-1",
      "order": 0,
      "images": [
        "/history/films/xxx/..."
      ],
      "cameraMovement": "pan",
      "shotSize": "中景",
      "duration": "3s",
      "audio": "背景音乐",
      "note": "分镜说明"
    }
  ],
  "timestamp": "2024-01-20T16:00:00",
  "lastModified": "2024-01-20T17:00:00"
}
```

### 分镜字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 分镜唯一标识 |
| `order` | number | 分镜顺序（0-based） |
| `images` | [string] | 分镜图片路径数组 |
| `cameraMovement` | string | 机位运动类型 |
| `shotSize` | string | 景别 |
| `duration` | string | 镜头时长 |
| `audio` | string | 音频/音效 |
| `note` | string | 备注 |

### 机位运动类型

- `fixed` - 固定镜头
- `pan` - 横摇
- `tilt` - 俯仰
- `zoom_in/out` - 变焦
- `dolly_in/out` - 推轨
- `track_left/right/forward/backward` - 跟拍
- `handheld` - 手持晃动
- `crane_up/down` - 升降
- `static_with_focus_rack` - 焦点转移
- `other` - 其他

---

## 快捷访问

### 存储位置

```
films/{film_id}/quick_access/data.json
```

### 文件结构

```json
[
  {
    "localPath": "/history/films/xxx/history/results/xxx.jpg",
    "remoteUrl": "https://imgbb.com/xxx.jpg",
    "category": "角色",
    "group": "主角组",
    "viewType": "正面全身",
    "note": "主角形象",
    "addedAt": "2024-01-20T16:00:00",
    "updatedAt": "2024-01-20T17:00:00"
  }
]
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `localPath` | string | 本地图片路径 |
| `remoteUrl` | string | 外部 URL |
| `category` | string | 分类（角色/场景/道具） |
| `group` | string | 分组名 |
| `viewType` | string | 视角描述 |
| `note` | string | 备注 |
| `addedAt` | ISO datetime | 添加时间 |
| `updatedAt` | ISO datetime | 更新时间 |

---

## 插件设置

### 存储位置

```
films/{film_id}/plugin_settings.json
```

### 文件结构

```json
[
  {
    "name": "nano_banana",
    "enabled": true,
    "model": "nano-banana"
  },
  {
    "name": "nano_banana_fast",
    "enabled": true,
    "model": "nano-banana-fast"
  },
  {
    "name": "seedream",
    "enabled": true
  }
]
```

### 默认配置

```json
[
  {"name": "nano_banana", "enabled": true},
  {"name": "nano_banana_fast", "enabled": true},
  {"name": "seedream", "enabled": true}
]
```

---

## 上传缓存

### 存储位置

```
films/{film_id}/upload.cache
# 或旧版兼容: history/upload.cache
```

### 文件结构

```json
{
  "films/xxx/history/inputs/xxx.jpg": "https://imgbb.com/xxx.jpg",
  "films/xxx/history/inputs/yyy.jpg": "https://imgbb.com/yyy.jpg"
}
```

**用途**: 避免重复上传同一文件到外部服务

---

## 数据迁移

### 迁移场景

从旧版单影片结构迁移到多影片结构：

```
旧版结构:
├── history/
│   ├── inputs/
│   ├── results/
│   └── *.json
└── storyboards/
    └── *.json

迁移后:
└── films/
    └── default/
        ├── history/
        │   ├── inputs/
        │   ├── results/
        │   └── *.json
        └── storyboards/
            └── *.json
```

### 迁移流程

```python
def migrate_existing_data():
    # 1. 检查旧版 history/ 和 storyboards/ 是否存在
    # 2. 创建 default 影片
    # 3. 复制所有文件到 films/default/
    # 4. 返回迁移统计
```

---

## 备份建议

### 需要备份的目录

```bash
# 核心数据
films/          # 所有影片数据
.env            # 环境变量配置

# 可选备份
plugins/*/      # 插件配置（不含 __pycache__）
```

### 不需要备份的目录

```bash
__pycache__/    # Python 缓存
*.pyc           # 编译后的 Python 文件
```

### 备份脚本示例

```bash
#!/bin/bash
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp -r films "$BACKUP_DIR/"
cp .env "$BACKUP_DIR/"

tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

echo "备份完成: $BACKUP_DIR.tar.gz"
```
