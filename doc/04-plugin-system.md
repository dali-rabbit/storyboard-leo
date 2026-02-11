# 插件系统详解

## 概述

分镜狮采用插件化架构支持多种 AI 生图 API。插件系统允许：
- 动态加载/卸载插件
- 插件级联调用（fallback）
- 插件级别配置
- 自定义换脸插件

## 插件目录结构

```
plugins/
├── __init__.py              # 插件加载器
├── example/                 # 示例插件（默认禁用）
│   ├── __init__.py
│   └── plugin.py
├── nano_banana/             # NanoBanana 插件
│   ├── __init__.py
│   ├── plugin.py
│   └── .env                 # 插件独立配置
├── seedream/                # 火山 Seedream 插件
│   ├── __init__.py
│   ├── plugin.py
│   └── .env
└── replicate_swap/          # Replicate 换脸插件
    ├── __init__.py
    └── plugin.py
```

## 插件加载器 (plugins/__init__.py)

### 加载规则

1. **扫描范围**: 只加载 `plugins/` 下的子目录
2. **默认跳过**: `example/` 插件默认不加载（除非在 PLUGIN_ENABLED 中显式启用）
3. **白名单控制**: 通过 `.env` 中的 `PLUGIN_ENABLED` 控制加载哪些插件
4. **必需接口**: 插件必须实现 `generate_images` 函数

### 配置示例

```bash
# .env
# 只加载指定插件
PLUGIN_ENABLED=nano_banana,seedream

# 加载所有非 example 插件（默认行为）
# PLUGIN_ENABLED=

# 指定换脸插件
FACE_SWAP_PLUGIN=replicate_swap
```

### 加载器 API

```python
def load_plugins()
# 扫描并加载所有启用的插件
# 输出加载日志到控制台

def get_plugin(name) -> callable or None
# 根据插件名返回 generate_images 函数

def list_plugin_names() -> [name, ...]
# 返回当前已加载的插件名列表

def get_face_swap_plugin() -> callable or None
# 返回换脸插件的 swap_face 函数（用于 /swap_face 接口）
```

---

## 生图插件接口

### 必需函数

```python
def generate_images(image_urls: List[str], prompt: str, size: str, ar: str, **kwargs) -> List[str]:
    """
    生成图片
    
    Args:
        image_urls: 参考图片 URL 列表（外网可访问）
        prompt: 生成提示词
        size: 分辨率 (1K/2K/4K)
        ar: 宽高比 (auto/1:1/16:9/...)
        **kwargs: 额外参数（如 model）
    
    Returns:
        生成的图片 URL 列表，失败返回空列表 []
    """
    pass
```

### 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `image_urls` | List[str] | 参考图 URL 列表，至少一张 |
| `prompt` | str | 生成提示词，可能包含特殊标记 |
| `size` | str | 分辨率选择：1K/2K/4K |
| `ar` | str | 宽高比：auto/1:1/16:9/9:16/4:3/3:4/3:2/2:3/5:4/4:5/21:9 |
| `model` | str | （可选）模型变体，如 nano-banana-fast |

---

## 内置插件详解

### 1. nano_banana 插件

**文件**: `plugins/nano_banana/plugin.py`

**API**: NanoBanana (grsai.dakka.com.cn)

**支持的模型**:
- `nano-banana` (默认)
- `nano-banana-fast` (快速版)

**配置** (`plugins/nano_banana/.env`):
```bash
GRSAI_API_KEY=your_api_key_here
```

**实现要点**:
- 使用 SSE (Server-Sent Events) 流式响应
- 解析 `data:` 开头的 JSON 行
- 支持状态：succeeded / failed

**代码结构**:
```python
def generate_images(image_urls, prompt, size="2K", ar="auto", model="nano-banana"):
    # 验证模型参数
    # 构建请求体
    # POST 请求（stream=True）
    # 解析 SSE 响应
    # 返回 URL 列表
```

---

### 2. seedream 插件

**文件**: `plugins/seedream/plugin.py`

**API**: 火山引擎 Ark (ark.cn-beijing.volces.com)

**模型**: doubao-seedream-4-5-251128

**配置** (`plugins/seedream/.env`):
```bash
ARK_API_KEY=your_api_key_here
```

**尺寸映射**:

```python
# auto 模式下的分辨率映射
SIZE_MAPPING = {
    "1K": "1024x1024",   # 实际映射到 2K（Seedream 4.5 不支持 1K）
    "2K": "2048x2048",
    "4K": "4096x4096",
}

# 指定宽高比时的像素值（必须 >= 3686400 像素）
AR_TO_SIZE = {
    "1:1": (2048, 2048),
    "2:3": (1920, 2880),
    "3:2": (2880, 1920),
    "3:4": (1920, 2560),
    "4:3": (2560, 1920),
    "4:5": (1920, 2400),
    "5:4": (2400, 1920),
    "9:16": (1920, 3414),
    "16:9": (3414, 1920),
    "21:9": (4480, 1920),
}
```

**特殊要求**:
- 图片必须先上传到火山 TOS
- 使用 `volcenginesdkarkruntime` SDK

---

### 3. replicate_swap 换脸插件（示例）

**文件**: `plugins/replicate_swap/plugin.py`

**接口类型**: 换脸插件（不同于生图插件）

**必需函数**:
```python
def swap_face(source_image_url: str, face_image_url: str) -> str:
    """
    执行换脸
    
    Args:
        source_image_url: 被替换面部的图片 URL
        face_image_url: 提供面部的图片 URL
    
    Returns:
        换脸后的图片 URL
    """
    pass
```

**配置**:
```bash
# .env
FACE_SWAP_PLUGIN=replicate_swap
```

---

## Fallback 机制

### 工作原理

```
用户发起生成请求
    │
    ▼
test_gen_api.generate_via_image_fallback()
    │
    ├──► 获取插件 fallback_order
    │       如: ["nano_banana", "nano_banana_fast", "seedream"]
    │
    ▼
按顺序尝试每个插件:
    │
    ├──► 插件1: nano_banana
    │       ├──► 检查是否需要图片迁移
    │       ├──► 调用 generate_images()
    │       ├──► 成功？返回结果 ✓
    │       └──► 失败？继续下一个
    │
    ├──► 插件2: nano_banana_fast
    │       └──► 同上...
    │
    └──► 插件3: seedream
            └──► 同上...
    │
    ▼
所有插件都失败？返回空列表 []
```

### 图片迁移

某些插件（如 seedream）需要图片托管在特定平台：

```python
PLUGINS_NEED_VOLC_MIGRATION = ["seedream"]

def _migrate_to_volc_tos(image_urls, plugin_name):
    # 1. 下载原图
    # 2. 上传到火山 TOS
    # 3. 返回新的 URL 列表
```

### 插件名称映射

```python
PLUGIN_NAME_MAPPING = {
    "nano_banana_fast": "nano_banana",
    # 配置名 -> 实际插件名
    # nano_banana_fast 实际上是 nano_banana 插件使用 fast 模型
}
```

---

## 开发新插件

### 步骤

1. **创建目录**
   ```bash
   mkdir plugins/my_plugin
   touch plugins/my_plugin/__init__.py
   touch plugins/my_plugin/plugin.py
   touch plugins/my_plugin/.env
   ```

2. **实现接口** (`plugin.py`)
   ```python
   import os
   from dotenv import load_dotenv
   from pathlib import Path
   
   # 加载插件配置
   PLUGIN_DIR = Path(__file__).parent
   load_dotenv(PLUGIN_DIR / ".env")
   
   MY_API_KEY = os.getenv("MY_API_KEY")
   
   def generate_images(image_urls, prompt, size="2K", ar="auto"):
       if not MY_API_KEY:
           print("[my_plugin] 未配置 API Key")
           return []
       
       # 调用你的 API
       # ...
       
       return ["https://result-url-1", "https://result-url-2"]
   ```

3. **配置环境变量** (`.env`)
   ```bash
   MY_API_KEY=your_api_key
   ```

4. **启用插件**
   ```bash
   # 根目录 .env
   PLUGIN_ENABLED=nano_banana,my_plugin
   ```

5. **重启应用**
   ```bash
   python main.py
   ```

---

## 插件调试

### 日志输出

```python
print(f"[my_plugin] 开始生成: {prompt[:50]}...")
print(f"[my_plugin] 使用 {len(image_urls)} 张参考图")
print(f"[my_plugin] 生成成功: {len(result_urls)} 张图片")
```

### 手动测试

```python
# test_plugin.py
from plugins import load_plugins, get_plugin

load_plugins()

func = get_plugin("my_plugin")
if func:
    result = func(
        image_urls=["https://example.com/ref.jpg"],
        prompt="测试提示词",
        size="2K",
        ar="1:1"
    )
    print(result)
```

---

## 插件设置持久化

每个影片可以独立配置插件：

```python
# plugin_settings.py
DEFAULT_PLUGINS = [
    {"name": "nano_banana", "enabled": True},
    {"name": "nano_banana_fast", "enabled": True},
    {"name": "seedream", "enabled": True},
]

# 存储位置: films/{film_id}/plugin_settings.json
```

**前端设置界面**:
- 插件列表（可拖拽排序）
- 启用/禁用开关
- 模型选择（如适用）
