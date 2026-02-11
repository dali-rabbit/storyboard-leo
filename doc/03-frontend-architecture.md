# 前端架构详解

## 整体结构

前端采用传统的多页面脚本方式组织，使用 jQuery + Bootstrap 5 构建界面。

```
static/
├── state.js           # 全局状态管理
├── film-manager.js    # 影片管理模块
├── plugin-settings.js # 插件设置
├── upload.js          # 上传功能
├── quick-access.js    # 快捷访问
├── image-edit.js      # 图片编辑（裁剪/区域编辑）
├── storyboard.js      # 故事板编辑器
├── window-manager.js  # 浮动窗口管理
└── main.js            # 主逻辑入口
```

## 各模块详解

### 1. state.js - 全局状态管理

**职责**: 管理当前上传的图片列表（本地路径和远程 URL）

```javascript
window.AIImageState = {
  // Getters
  getUploadedUrls()     // 获取远程 URL 列表
  getLocalPaths()       // 获取本地路径列表
  
  // Setters
  setUploadedUrls(urls)
  setLocalPaths(paths)
  
  // 操作
  addUploadedFiles(urls, localPaths)     // 添加文件
  addFromQuickAccess(localPath, remoteUrl)  // 从快捷访问添加
  removeAtIndex(index)                   // 删除指定索引
  swapIndices(i, j)                      // 交换两个索引
  clear()                                // 清空所有
  
  // 工具
  getCount()
}
```

**数据结构**
```javascript
// uploadedImageUrls: ["https://imgbb.com/...", "https://imgbb.com/..."]
// uploadedLocalPaths: ["/history/films/xxx/history/inputs/xxx.jpg", ...]
```

---

### 2. film-manager.js - 影片管理模块

**职责**: 影片切换、影片 CRUD、影片选择器 UI

```javascript
window.FilmManager = {
  // 初始化
  async init() -> filmId
  
  // 获取当前影片
  getCurrentFilmId()
  getCurrentFilm()
  
  // 切换影片
  async switchFilm(filmId)
  
  // 影片 CRUD
  async createFilm(name, description)
  async updateFilm(filmId, data)
  async deleteFilm(filmId)
  
  // 回调注册
  onFilmChange(callback)  // 影片切换时触发
}
```

**影片切换回调链**
```javascript
// 当影片切换时，依次触发：
1. 清空当前状态 state.clear()
2. 重新渲染上传预览
3. 加载新影片插件设置
4. 加载新影片快捷访问
5. 加载新影片历史记录
6. 加载新影片故事板
```

---

### 3. upload.js - 上传功能模块

**职责**: 文件上传、拖拽上传、预览渲染、拖拽排序

**核心功能**

```javascript
// PNG 转 JPG
async function convertPngToJpg(file) -> File

// 渲染预览
function renderUploadPreview()

// 拖拽排序
function enableDragSort()

// 文件处理
async function processFiles(files)  // 处理拖入或选择的文件
```

**拖拽数据传递**
```javascript
// 从上传列表拖出时设置数据
window.__currentDragItem = {
  localPath: localPath,
  remoteUrl: remoteUrl
}
// 同时设置到 dataTransfer: "text/plain", "application/json"
```

---

### 4. plugin-settings.js - 插件设置

**职责**: 插件启用/禁用、排序、模型选择

**UI 交互**
- 插件列表拖拽排序
- 开关切换启用/禁用
- 模型选择下拉框（如 nano-banana vs nano-banana-fast）

**API 调用**
```javascript
GET  /api/films/{film_id}/plugin-settings     // 加载设置
PUT  /api/films/{film_id}/plugin-settings     // 保存设置
```

---

### 5. quick-access.js - 快捷访问

**职责**: 收藏图片管理、侧边栏展示、分类和备注

```javascript
window.QuickAccess = {
  // 数据管理
  async load(filmId)           // 加载当前影片的快捷访问
  async add(imageData)         // 添加图片
  async update(localPath, data)// 更新信息
  async remove(localPath)      // 删除
  
  // UI
  renderSidebar()              // 渲染侧边栏
  showQuickAccessWindow()      // 显示浮动窗口
}
```

**数据结构**
```javascript
{
  localPath: "/history/films/...",
  remoteUrl: "https://...",
  category: "角色/场景/道具",
  group: "分组名",
  viewType: "视角描述",
  note: "备注",
  addedAt: "ISO时间"
}
```

---

### 6. image-edit.js - 图片编辑模块

**职责**: 图片裁剪（四格/自由）和区域编辑（换脸/图生图）

**主要功能**

```javascript
// 模式切换
editMode: "crop" | "region"
cropMode: "quadrants" | "free"
regionAspectRatio: "1:1" | "16:9" | ...

// 裁剪功能
cropToQuadrants()        // 四格裁剪
drawCropRect()           // 自由裁剪框绘制
applyCrop()              // 应用裁剪

// 区域编辑
startRegionSelection()   // 开始选取区域
confirmRegionSelection() // 确认选取
openRegionEditModal()    // 打开编辑模态框

// 换脸
performFaceSwap()        // 调用 /swap_face API

// 图生图
performRegionImg2Img()   // 调用 /generate API
```

**Canvas 操作**
- 图片缩放显示（保持比例填充容器）
- 选取框绘制（半透明遮罩 + 高亮区域）
- 裁剪结果导出为 base64

---

### 7. storyboard.js - 故事板编辑器

**职责**: 故事板 CRUD、分镜管理、拖放排序

**核心概念**

```javascript
storyboardState = {
  currentId: null,           // 当前故事板 ID
  title: "未命名故事板",
  panels: [],                // 分镜数组
  lastModified: null,
  dirty: false               // 是否有未保存修改
}

// 单个分镜结构
panel = {
  id: "uuid",
  order: 0,                  // 顺序
  images: [],                // 图片 URL 数组
  cameraMovement: "fixed",   // 机位运动
  shotSize: "",              // 景别
  duration: "3s",            // 镜头时长
  audio: "",                 // 音频/音效
  note: ""                   // 备注
}
```

**机位运动选项**
```javascript
CAMERA_MOVEMENTS = [
  {value: "fixed", label: "固定镜头"},
  {value: "pan", label: "横摇（Pan）"},
  {value: "tilt", label: "俯仰（Tilt）"},
  {value: "zoom_in", label: "推进（Zoom In）"},
  {value: "zoom_out", label: "拉远（Zoom Out）"},
  {value: "dolly_in", label: "推轨靠近（Dolly In）"},
  {value: "dolly_out", label: "推轨远离（Dolly Out）"},
  {value: "track_left", label: "左移跟拍"},
  {value: "track_right", label: "右移跟拍"},
  {value: "track_forward", label: "前进跟拍"},
  {value: "track_backward", label: "后退跟拍"},
  {value: "handheld", label: "手持晃动"},
  {value: "crane_up", label: "crane 上升"},
  {value: "crane_down", label: "crane 下降"},
  {value: "static_with_focus_rack", label: "固定 + 焦点转移"},
  {value: "other", label: "其他（请说明）"}
]
```

**主要函数**

```javascript
// 故事板管理
async loadStoryboard(id)           // 加载故事板
async saveStoryboard()             // 保存故事板
async deleteStoryboard(id)         // 删除故事板
switchToStoryboard(id)             // 切换到故事板

// 分镜管理
addNewPanel()                      // 添加分镜
deletePanel(index)                 // 删除分镜
movePanel(fromIndex, toIndex)      // 移动分镜（排序）
updatePanelState()                 // 更新分镜状态

// 图片拖放
bindDropZoneEvents()               // 绑定拖放事件
```

**拖放限制**
```javascript
// 在某些操作期间禁用图片拖放
enableImageDrop(true/false)
// 例如：区域编辑模态框打开时禁用
```

---

### 8. window-manager.js - 浮动窗口管理

**职责**: 可拖拽浮动窗口的行为控制

**窗口类型**
- `#quickAccessWindow` - 快捷访问窗口
- `#historyWindow` - 历史记录窗口

**功能**
- 拖拽移动（通过 `.floating-header`）
- 调整大小（通过 `.resize-handle`）
- z-index 管理（点击置顶）
- 打开/关闭动画

---

### 9. main.js - 主逻辑入口

**职责**: 初始化、事件绑定、全局功能

**初始化流程**
```javascript
async function initFilmManager() {
  // 1. 初始化影片管理
  const filmId = await window.FilmManager.init()
  
  // 2. 加载插件设置
  await window.PluginSettings.load(filmId)
  
  // 3. 加载快捷访问
  await window.QuickAccess.load(filmId)
  window.QuickAccess.renderSidebar()
  
  // 4. 加载历史记录
  loadHistoryWindowPage(1)
  
  // 5. 加载故事板
  window.StoryboardModule.loadStoryboardListIntoDropdown()
}
```

**历史记录分页**
```javascript
function loadHistoryWindowPage(page, limit = 12)
// 支持多选模式、批量删除
```

**提示词预览**
```javascript
function updatePromptPreview()
// 根据选择的模式（Raw/分镜/角色）拼接提示词
```

**生成按钮处理**
```javascript
// 收集参数 -> 调用 /generate -> 展示结果 -> 保存历史
```

---

## 数据流示例

### 上传图片流程

```
用户拖拽文件到上传区
    │
    ▼
processFiles(files)
    │
    ├──► convertPngToJpg(file)  // 如果是 PNG
    │
    ▼
FormData -> /upload-images
    │
    ▼
后端返回: {urls: [...], local_paths: [...]}
    │
    ▼
state.addUploadedFiles(urls, localPaths)
    │
    ▼
renderUploadPreview()  // 更新 UI
```

### 生成图片流程

```
用户点击"生成图片"
    │
    ▼
收集参数: image_urls, prompt, size, aspect_ratio, film_id
    │
    ▼
POST /generate
    │
    ▼
后端返回: {success, result_urls, record_id, elapsed, plugin}
    │
    ▼
展示结果到 #generatedPreview
    │
    ▼
刷新历史记录
```

### 拖拽图片到故事板

```
从上传列表/历史记录/快捷访问拖出图片
    │
    ▼
设置 drag data (localPath, remoteUrl)
    │
    ▼
拖入故事板分镜区域
    │
    ▼
检查 imageDropEnabled (区域编辑时禁用)
    │
    ▼
获取 localPath -> /quick-upload-2 (带缓存)
    │
    ▼
返回 external_url
    │
    ▼
更新分镜图片数组 -> renderStoryboard()
    │
    ▼
标记 dirty = true
```

---

## 全局工具函数

```javascript
// 显示 Toast 提示
function showToast(message, type = "info", delay = 3000)
// type: 'success', 'error', 'warning', 'info'
// delay: 0 表示不自动关闭

// 窗口置顶
let currentTopZIndex = 5
function bringWindowToFront(el)
```

---

## 事件命名规范

```javascript
// jQuery 事件绑定使用 .off().on() 模式防止重复绑定
$(selector).off("click").on("click", handler)

// 事件委托用于动态元素
$(document).off("click", selector).on("click", selector, handler)
```
