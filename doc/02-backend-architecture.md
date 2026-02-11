# 后端架构详解

## 核心模块

### 1. app.py - Flask 主应用

**职责**: 路由定义、请求处理、响应组装

#### 主要路由分类

**文件服务**
```python
@app.route("/history/<path:filename>")  # 历史文件访问（支持影片隔离）
```

**图片上传**
```python
@app.route("/upload-images", methods=["POST"])      # 批量上传参考图
@app.route("/quick-upload", methods=["POST"])       # 快速单文件上传
@app.route("/quick-upload-2", methods=["POST"])     # 带缓存的上传
```

**图片生成**
```python
@app.route("/generate", methods=["POST"])           # 主生成接口
```

**历史记录管理**
```python
@app.route("/history")                              # 分页获取历史
@app.route("/history/<record_id>", methods=["DELETE"])      # 删除单条
@app.route("/history/batch-delete", methods=["POST"])       # 批量删除
@app.route("/history-record", methods=["POST"])             # 手动保存记录
```

**图片处理**
```python
@app.route("/save-cropped-images", methods=["POST"])        # 保存裁剪图片
@app.route("/swap_face", methods=["POST"])                  # 换脸接口
```

**影片管理 API**
```python
@app.route("/api/films", methods=["GET"])                   # 列表
@app.route("/api/films", methods=["POST"])                  # 创建
@app.route("/api/films/<film_id>", methods=["GET"])         # 详情
@app.route("/api/films/<film_id>", methods=["PUT"])         # 更新
@app.route("/api/films/<film_id>", methods=["DELETE"])      # 删除
```

**插件设置 API**
```python
@app.route("/api/films/<film_id>/plugin-settings", methods=["GET"])
@app.route("/api/films/<film_id>/plugin-settings", methods=["PUT"])
@app.route("/api/films/<film_id>/enabled-plugins", methods=["GET"])
```

**快捷访问 API**
```python
@app.route("/api/films/<film_id>/quick-access", methods=["GET"])
@app.route("/api/films/<film_id>/quick-access", methods=["POST"])
@app.route("/api/films/<film_id>/quick-access/<path:local_path>", methods=["PUT"])
@app.route("/api/films/<film_id>/quick-access/<path:local_path>", methods=["DELETE"])
```

#### 核心工具函数

**图片保存**
```python
def save_image_from_url(url: str, folder: Path) -> str
# 从 URL 下载图片或解析 base64 data URI，保存为 JPG

def save_uploaded_file_as_jpg(file_storage, folder: Path) -> str
# 将 Flask 上传文件保存为 JPG（PNG 自动转）
```

**目录获取**
```python
def get_film_dirs(film_id) -> dict
# 返回影片的各目录路径：history、inputs、results、storyboards
```

---

### 2. film_manager.py - 影片管理模块

**职责**: 影片的 CRUD、数据隔离、数据迁移

#### 核心概念

**影片 (Film)** 是数据隔离的基本单位，每个影片拥有：
- 独立的目录结构
- 独立的历史记录
- 独立的故事板
- 独立的快捷访问数据
- 独立的插件设置

#### 数据结构

```python
# 影片索引 (films/index.json)
{
  "film_id": {
    "id": "uuid",
    "name": "影片名称",
    "description": "描述",
    "created_at": "ISO时间",
    "updated_at": "ISO时间",
    "cover_image": "封面图路径或null"
  }
}
```

#### 目录结构

```
films/
├── index.json
└── {film_id}/
    ├── history/
    │   ├── inputs/          # 上传的参考图
    │   ├── results/         # 生成的结果图
    │   └── *.json           # 历史记录文件
    ├── storyboards/         # 故事板 JSON 文件
    └── quick_access/
        └── data.json        # 快捷访问数据
```

#### 主要函数

```python
# CRUD
create_film(name, description) -> film_dict
delete_film(film_id) -> (bool, error_msg)
get_film(film_id) -> film_dict or None
list_films() -> [film_dict, ...]
update_film(film_id, name, description, cover_image) -> film_dict

# 目录获取
get_film_dir(film_id) -> Path
get_film_history_dir(film_id) -> Path
get_film_storyboards_dir(film_id) -> Path
get_film_quick_access_path(film_id) -> Path

# 快捷访问
load_quick_access(film_id) -> [image_data, ...]
save_quick_access(film_id, data)
add_quick_access_image(film_id, image_data) -> image_data or None
update_quick_access_image(film_id, local_path, updates) -> image_data or None
remove_quick_access_image(film_id, local_path) -> bool

# 数据迁移（兼容旧版）
migrate_existing_data() -> migrated_stats
```

---

### 3. uploader.py - 图片上传服务

**职责**: 统一上传接口，支持多种上传后端

#### 上传后端

**1. ImgBB (默认)**
```python
def _upload_to_imgbb(file_path: str) -> str
# 限制：免费版最大 32MB
# 返回：ImgBB CDN URL
```

**2. GitHub + jsDelivr**
```python
def _upload_to_github_jsdelivr(file_path: str, filename: str) -> str
# 需要配置：GITHUB_USERNAME, GITHUB_REPO, GITHUB_BRANCH, LOCAL_REPO_PATH
# 流程：复制文件 -> git add -> git commit -> git push
# 返回：jsDelivr CDN URL
```

**3. 火山 TOS**
```python
def _upload_to_volc_tos(file_path: str, filename: str) -> str
# 需要配置：VOLC_TOS_ACCESS_KEY, VOLC_TOS_SECRET_KEY, VOLC_TOS_BUCKET
# 返回：预签名 URL（24小时有效）
```

#### 插件特定上传

```python
# 某些插件（如 seedream）需要特定的图片托管
def upload_file_for_plugin(file_path: str, plugin_name: str, filename: str) -> str

# 映射配置
PLUGIN_UPLOAD_BACKENDS = {
    "seedream": "volc_tos",  # seedream 必须使用火山 TOS
}
```

#### 统一入口

```python
def upload_file(file_path: str, filename: str = None) -> str
# 根据 UPLOAD_BACKEND 环境变量选择后端
```

---

### 4. test_gen_api.py - 生图 API 调用

**职责**: 多插件 fallback 调用、图片 URL 迁移

#### 核心函数

```python
def generate_via_image_fallback(
    image_urls,           # 参考图 URL 列表
    prompt,               # 生成提示词
    size="2K",            # 分辨率
    ar="auto",            # 宽高比
    fallback_order=None,  # 插件执行顺序
    plugin_models=None    # 插件模型配置
) -> dict or list
```

#### 返回值格式

```python
# 成功时
{
    "urls": ["http://...", "http://..."],  # 生成的图片 URL
    "plugin": "nano_banana",               # 实际使用的插件
    "elapsed": 15.3                        # API 调用耗时（秒）
}

# 失败时
[]  # 空列表（保持向后兼容）
```

#### Fallback 机制

```
1. 按 fallback_order 顺序尝试各插件
2. 获取插件函数 (get_plugin)
3. 检查是否需要图片迁移（如 seedream 需要火山 TOS URL）
4. 构建调用参数
5. 计时并调用插件
6. 成功则返回，失败则尝试下一个插件
7. 所有插件都失败返回空列表
```

#### 图片迁移

```python
def _migrate_to_volc_tos(image_urls, plugin_name) -> [url, ...]
# 将外部图片下载后上传到火山 TOS
# 用于需要特定图片托管的插件
```

#### 插件名称映射

```python
PLUGIN_NAME_MAPPING = {
    "nano_banana_fast": "nano_banana",  # fast 版本实际上是 nano_banana 的 fast 模型
}
```

---

### 5. plugin_settings.py - 插件设置管理

**职责**: 每个影片的插件配置持久化

#### 默认配置

```python
DEFAULT_PLUGINS = [
    {"name": "nano_banana", "enabled": True},
    {"name": "nano_banana_fast", "enabled": True},
    {"name": "seedream", "enabled": True},
]

AVAILABLE_PLUGINS = ["nano_banana", "nano_banana_fast", "seedream"]
```

#### 存储位置

```
films/{film_id}/plugin_settings.json
```

#### 主要函数

```python
def load_plugin_settings(film_id=None) -> [plugin_config, ...]
# 加载影片的插件设置，不存在则返回默认配置

def save_plugin_settings(film_id, settings) -> bool
# 保存插件设置

def get_enabled_plugins(film_id=None) -> [plugin_name, ...]
# 获取按顺序排列的已启用插件名称列表
```

---

### 6. plugins/__init__.py - 插件系统加载器

**职责**: 动态加载插件模块

#### 加载规则

1. 只加载 `plugins/` 下的子目录
2. 默认跳过 `plugins/example/`（除非在 PLUGIN_ENABLED 中显式启用）
3. 通过 `.env` 中的 `PLUGIN_ENABLED` 控制加载哪些插件
4. 插件必须实现 `generate_images` 函数

#### 接口定义

```python
def load_plugins()
# 扫描并加载所有启用的插件

def get_plugin(name) -> callable or None
# 根据插件名返回 generate_images 函数

def list_plugin_names() -> [name, ...]
# 返回当前已加载的插件名列表

def get_face_swap_plugin() -> callable or None
# 返回换脸插件的 swap_face 函数
```

#### 插件函数签名

```python
# 生图插件
def generate_images(image_urls: [str], prompt: str, size: str, ar: str, **kwargs) -> [url, ...]

# 换脸插件
def swap_face(source_image_url: str, face_image_url: str) -> str
```

---

## 数据流

### 图片生成流程

```
用户上传图片
    │
    ▼
/upload-images ──► 保存本地 + 上传到外部服务
    │
    ▼
用户点击生成
    │
    ▼
/generate ──► 获取影片插件设置
    │
    ▼
test_gen_api.generate_via_image_fallback()
    │
    ├──► 尝试插件1 ──► 成功？返回结果
    │         │
    │         └──► 失败
    │
    ├──► 尝试插件2 ──► 成功？返回结果
    │
    └──► ...
    │
    ▼
保存结果图到本地
    │
    ▼
创建历史记录 JSON
    │
    ▼
返回本地路径给前端展示
```

### 影片切换流程

```
用户切换影片
    │
    ▼
前端调用 FilmManager.switchFilm(filmId)
    │
    ▼
触发 onFilmChange 回调
    │
    ├──► 清空当前状态 (state.clear())
    ├──► 加载新影片插件设置
    ├──► 加载新影片快捷访问
    ├──► 加载新影片历史记录
    └──► 加载新影片故事板
```

---

## 并发控制

```python
# 避免重复提交
current_task_lock = Lock()
is_generating = False

@app.route("/generate", methods=["POST"])
def generate():
    if current_task_lock.locked():
        return jsonify({"error": "Another task is running"}), 429
    
    with current_task_lock:
        # 执行生成...
```

---

## 缓存机制

```python
# 上传缓存（避免重复上传同一文件）
cache_lock = threading.Lock()

def get_cache_file(film_id=None) -> str
# films/{film_id}/upload.cache 或 history/upload.cache（兼容旧版）

# 缓存格式: {local_path: external_url}
```
