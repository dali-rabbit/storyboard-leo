let canvas = document.getElementById("editCanvas");
let ctx = canvas.getContext("2d");
let img = document.getElementById("hiddenImageLoader");
let shouldHighlightNewRecords = false;

// 裁剪状态
let cropState = {
  enabled: false,
  mode: "quadrants", // 'quadrants' 或 'free'

  // 四格模式参数
  scale: 0.95,
  offsetX: 0,
  offsetY: 0,

  // 自由裁剪参数（归一化坐标：0~1）
  free: {
    x: 0.25, // 左上角 x (比例)
    y: 0.25, // 左上角 y
    width: 0.5, // 宽度比例
    height: 0.5, // 高度比例
  },

  imgWidth: 0,
  imgHeight: 0,
};

let cropInteraction = {
  isActive: false,
  handle: null, // null, 'nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'
  startX: 0,
  startY: 0,
  initial: null, // { x, y, width, height } 快照
};

let isDragging = false;
let dragStartX, dragStartY;

// 区域编辑状态
let regionEditState = {
  enabled: false,
  aspectRatio: "16:9",
  x: 0.25,
  y: 0.25,
  width: 0.5,
  height: 0.5,
  regionSelected: false,
  regionConfirmed: false,
  originalImageUrl: null,
};

// 区域编辑结果管理
let regionEditResults = [];
let currentResultIndex = -1;
let currentOriginalImage = null;

// 区域编辑步骤状态
let regionEditStep = 0; // 0: 初始, 1: 选取中, 2: 已确定

// 区域编辑额外图片列表
let regionEditExtraImages = [];

// 调整 canvas 尺寸以适应容器
function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  if (cropState.imgWidth > 0) {
    render();
  }
}

window.addEventListener("resize", resizeCanvas);

// 加载图片后初始化
img.onload = function () {
  cropState.imgWidth = img.naturalWidth;
  cropState.imgHeight = img.naturalHeight;
  // cropState.enabled = false;
  resizeCanvas();
  render();

  $("#imageEditPlaceholder")
    .removeClass("d-flex") // 移除 display: flex
    .hide(); // 此时 hide 有效
  $("#cropToQuadrantsBtn").prop("disabled", false);
  $("#startRegionEditBtn").prop("disabled", false);
  // 在 image-edit.js 顶部或 onload 后
  document.getElementById("cropMode").value = "quadrants";
};

// 渲染主函数
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const iw = cropState.imgWidth;
  const ih = cropState.imgHeight;
  const cw = canvas.width;
  const ch = canvas.height;

  let scale = Math.min(cw / iw, ch / ih);
  let dx = (cw - iw * scale) / 2;
  let dy = (ch - ih * scale) / 2;

  ctx.drawImage(img, dx, dy, iw * scale, ih * scale);

  // 区域编辑选区绘制
  if (regionEditState.enabled && regionEditState.regionSelected) {
    const rectX = dx + regionEditState.x * iw * scale;
    const rectY = dy + regionEditState.y * ih * scale;
    const rectW = regionEditState.width * iw * scale;
    const rectH = regionEditState.height * ih * scale;
    
    // 根据是否已确定显示不同样式
    if (regionEditState.regionConfirmed) {
      // 已确定：绿色边框，显示"已固定选区"
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(rectX, rectY, rectW, rectH);
      
      // 显示文字
      ctx.fillStyle = "#00ff00";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.fillText("已固定选区", rectX + rectW / 2, rectY - 10);
    } else {
      // 选取中：红色边框，显示控制点
      ctx.strokeStyle = "#ff6b6b";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rectX, rectY, rectW, rectH);

      // 绘制控制点（8个：4角 + 4边）
      const points = [];
      const halfHandle = 6;

      // 角点 (NW, NE, SW, SE)
      points.push({ x: rectX, y: rectY, type: "nw" });
      points.push({ x: rectX + rectW, y: rectY, type: "ne" });
      points.push({ x: rectX, y: rectY + rectH, type: "sw" });
      points.push({ x: rectX + rectW, y: rectY + rectH, type: "se" });

      // 边中点 (N, E, S, W)
      points.push({ x: rectX + rectW / 2, y: rectY, type: "n" });
      points.push({ x: rectX + rectW, y: rectY + rectH / 2, type: "e" });
      points.push({ x: rectX + rectW / 2, y: rectY + rectH, type: "s" });
      points.push({ x: rectX, y: rectY + rectH / 2, type: "w" });

      ctx.fillStyle = "#ff6b6b";
      points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, halfHandle, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.setLineDash([]);
  }

  if (!cropState.enabled) return;

  ctx.strokeStyle = "#00ff00";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);

  if (cropState.mode === "quadrants") {
    const halfW = iw / 2;
    const halfH = ih / 2;
    const cropW = halfW * cropState.scale;
    const cropH = halfH * cropState.scale;

    const centers = [
      [halfW * (0.5 + cropState.offsetX), halfH * (0.5 + cropState.offsetY)],
      [halfW * (1.5 + cropState.offsetX), halfH * (0.5 + cropState.offsetY)],
      [halfW * (0.5 + cropState.offsetX), halfH * (1.5 + cropState.offsetY)],
      [halfW * (1.5 + cropState.offsetX), halfH * (1.5 + cropState.offsetY)],
    ];

    centers.forEach(([cx, cy]) => {
      let x = dx + (cx - cropW / 2) * scale;
      let y = dy + (cy - cropH / 2) * scale;
      ctx.strokeRect(x, y, cropW * scale, cropH * scale);
    });
  } else if (cropState.mode === "free") {
    const { x, y, width, height } = cropState.free;
    const rectX = dx + x * iw * scale;
    const rectY = dy + y * ih * scale;
    const rectW = width * iw * scale;
    const rectH = height * ih * scale;
    ctx.strokeRect(rectX, rectY, rectW, rectH);

    // 绘制控制点（8个：4角 + 4边）
    const points = [];
    const halfHandle = 6; // 控制点半径（视觉大小）

    // 角点 (NW, NE, SW, SE)
    points.push({ x: rectX, y: rectY, type: "nw" }); // 左上
    points.push({ x: rectX + rectW, y: rectY, type: "ne" }); // 右上
    points.push({ x: rectX, y: rectY + rectH, type: "sw" }); // 左下
    points.push({ x: rectX + rectW, y: rectY + rectH, type: "se" }); // 右下

    // 边中点 (N, E, S, W)
    points.push({ x: rectX + rectW / 2, y: rectY, type: "n" }); // 上
    points.push({ x: rectX + rectW, y: rectY + rectH / 2, type: "e" }); // 右
    points.push({ x: rectX + rectW / 2, y: rectY + rectH, type: "s" }); // 下
    points.push({ x: rectX, y: rectY + rectH / 2, type: "w" }); // 左

    ctx.fillStyle = "#00ff00";
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, halfHandle, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  ctx.setLineDash([]);
}

function getCursorForHandle(type) {
  const map = {
    nw: "nw-resize",
    ne: "ne-resize",
    sw: "sw-resize",
    se: "se-resize",
    n: "n-resize",
    s: "s-resize",
    e: "e-resize",
    w: "w-resize",
  };
  return map[type] || "default";
}

// ===== 区域编辑功能 =====

// 获取比例数值
function getAspectRatioValue(ratio) {
  const ratioMap = {
    "1:1": 1,
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "4:3": 4 / 3,
    "3:4": 3 / 4,
    "2:3": 2 / 3,
    "3:2": 3 / 2,
  };
  return ratioMap[ratio] || 16 / 9;
}

// 重置区域编辑状态
function resetRegionEditState() {
  const selectedRatio = document.getElementById("regionAspectRatio")?.value || "16:9";
  const targetAR = getAspectRatioValue(selectedRatio);
  const imgAR = cropState.imgWidth / cropState.imgHeight;
  const normAR = targetAR / imgAR;
  
  // 初始化选区尺寸（中间位置，保持比例）
  let initWidth = 0.5;
  let initHeight = initWidth / normAR;
  
  // 如果高度超出，调整
  if (initHeight > 0.8) {
    initHeight = 0.8;
    initWidth = initHeight * normAR;
  }
  
  regionEditState = {
    enabled: false,
    aspectRatio: selectedRatio,
    x: (1 - initWidth) / 2,
    y: (1 - initHeight) / 2,
    width: initWidth,
    height: initHeight,
    regionSelected: false,
    regionConfirmed: false,
    originalImageUrl: null,
  };
  regionEditStep = 0; // 重置步骤
  regionEditResults = [];
  currentResultIndex = -1;
  currentOriginalImage = null;
  regionEditExtraImages = [];
  renderRegionEditResults();
  renderRegionEditExtraImages();
  const btn = document.getElementById("startRegionEditBtn");
  btn.textContent = "选取区域";
  btn.classList.remove("btn-success");
  btn.classList.add("btn-warning");
  document.getElementById("regionEditActionBtn").classList.add("d-none");
  document.getElementById("regionEditActionBtn").disabled = true;
  document.getElementById("applyRegionEditBtn").disabled = true;
}

// 渲染区域编辑结果列表
function renderRegionEditResults() {
  const container = document.getElementById("regionEditResultsList");
  if (!container) return;

  let html = "";
  
  // 添加“原图”选项在最前面
  const isOriginalActive = currentResultIndex === -1;
  html += `
    <div class="result-item ${isOriginalActive ? 'active' : ''}" data-idx="-1" style="cursor: pointer; padding: 8px; margin-bottom: 4px; border-radius: 4px; ${isOriginalActive ? 'background: #0d6efd; color: white;' : 'background: #2d2d2d; color: #fff;'}">
      <div class="d-flex align-items-center">
        <span class="me-2">🖼️</span>
        <span>原图</span>
      </div>
    </div>
  `;
  
  regionEditResults.forEach((result, idx) => {
    const isActive = idx === currentResultIndex;
    html += `
      <div class="result-item ${isActive ? 'active' : ''}" data-idx="${idx}" style="cursor: pointer; padding: 8px; margin-bottom: 4px; border-radius: 4px; ${isActive ? 'background: #0d6efd; color: white;' : 'background: #2d2d2d; color: #fff;'}">
        <div class="d-flex justify-content-between align-items-center">
          <span>结果 ${idx + 1}</span>
          <button class="btn btn-sm btn-danger delete-result" data-idx="${idx}" style="padding: 2px 6px; font-size: 12px;">删除</button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;

  // 添加点击事件
  container.querySelectorAll(".result-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-result")) return;
      const idx = parseInt(el.dataset.idx, 10);
      showRegionEditResult(idx);
    });
  });

  // 添加删除事件
  container.querySelectorAll(".delete-result").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      deleteRegionEditResult(idx);
    });
  });
}

// 显示指定结果（idx=-1显示原图）
function showRegionEditResult(idx) {
  currentResultIndex = idx;
  renderRegionEditResults();

  if (idx === -1) {
    // 显示原图
    if (currentOriginalImage) {
      img.src = currentOriginalImage;
      cropState.imgWidth = img.naturalWidth;
      cropState.imgHeight = img.naturalHeight;
    } else if (regionEditState.originalImageUrl) {
      img.src = regionEditState.originalImageUrl;
    }
  } else if (idx >= 0 && idx < regionEditResults.length) {
    // 显示结果图
    const result = regionEditResults[idx];
    img.src = result.url;
    cropState.imgWidth = result.width || img.naturalWidth;
    cropState.imgHeight = result.height || img.naturalHeight;
  }
  render();
}

// 删除结果
function deleteRegionEditResult(idx) {
  if (idx < 0 || idx >= regionEditResults.length) return;
  
  regionEditResults.splice(idx, 1);
  
  // 调整当前索引
  if (currentResultIndex === idx) {
    currentResultIndex = -1;
    showRegionEditResult(-1);
  } else if (currentResultIndex > idx) {
    currentResultIndex--;
  }
  
  renderRegionEditResults();
}

// 渲染额外图片列表
function renderRegionEditExtraImages() {
  const container = document.getElementById("regionImg2ImgExtraList");
  if (!container) return;

  let html = "";
  regionEditExtraImages.forEach((imgData, idx) => {
    html += '<div class="position-relative" style="width:60px;height:60px;">' +
      '<img src="' + imgData.preview + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;">' +
      '<button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 p-0 remove-extra-img" ' +
      'style="width:18px;height:18px;font-size:10px;line-height:1;" data-idx="' + idx + '">×</button>' +
    '</div>';
  });

  container.innerHTML = html;

  // 添加删除事件
  container.querySelectorAll(".remove-extra-img").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      regionEditExtraImages.splice(idx, 1);
      renderRegionEditExtraImages();
    });
  });
}

// 图生图额外图片上传
document.getElementById("regionImg2ImgDropZone")?.addEventListener("click", () => {
  document.getElementById("regionImg2ImgExtraUpload")?.click();
});

document.getElementById("regionImg2ImgExtraUpload")?.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  
  const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
  
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    if (regionEditExtraImages.length >= 9) {
      showToast("最多只能添加9张额外参考图", "warning");
      break;
    }
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("film_id", filmId);
      
      const resp = await fetch("/quick-upload", {
        method: "POST",
        body: formData,
      });
      
      if (!resp.ok) throw new Error("Upload failed");
      
      const data = await resp.json();
      regionEditExtraImages.push({
        url: data.url,
        localPath: data.local_path,
        preview: data.local_path || data.url,
      });
    } catch (err) {
      console.error("上传失败:", err);
    }
  }
  
  renderRegionEditExtraImages();
  e.target.value = "";
});

// ===== 交互事件 =====

document.getElementById("cropToQuadrantsBtn").addEventListener("click", () => {
  const mode = document.getElementById("cropMode").value;
  cropState.mode = mode;
  cropState.enabled = true;

  if (mode === "quadrants") {
    cropState.scale = 0.95;
    cropState.offsetX = 0;
    cropState.offsetY = 0;
  } else if (mode === "free") {
    // 重置自由区域为中间 50%
    cropState.free = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  }

  render();
  document.getElementById("saveCroppedImagesBtn").disabled = false;
});

// 鼠标滚轮：缩放裁剪框
canvas.addEventListener("wheel", (e) => {
  // 区域编辑模式：滚轮缩放选区（只有未确定时才可调整）
  if (regionEditState.enabled && regionEditState.regionSelected && !regionEditState.regionConfirmed) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.02 : 0.02;
    
    const targetAR = getAspectRatioValue(regionEditState.aspectRatio);
    const imgAR = cropState.imgWidth / cropState.imgHeight;
    const normAR = targetAR / imgAR;
    
    let newWidth = regionEditState.width + delta;
    let newHeight = newWidth / normAR;
    
    // 限制最小/最大
    const minSize = 0.1;
    const maxSize = 0.9;
    
    if (newWidth >= minSize && newWidth <= maxSize && 
        newHeight >= minSize && newHeight <= maxSize &&
        regionEditState.x + newWidth <= 1 &&
        regionEditState.y + newHeight <= 1) {
      regionEditState.width = newWidth;
      regionEditState.height = newHeight;
      render();
    }
    return;
  }
  
  if (!cropState.enabled) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.02 : 0.02;
  cropState.scale = Math.max(0.5, Math.min(1.2, cropState.scale + delta));
  render();
});

let isDraggingFree = false;
let dragCorner = null; // null = 移动整体，'br' = 调整右下角（简化）

canvas.addEventListener("mousedown", (e) => {
  // 区域编辑模式（只有未确定时才可调整）
  if (regionEditState.enabled && regionEditState.regionSelected && !regionEditState.regionConfirmed) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const iw = cropState.imgWidth;
    const ih = cropState.imgHeight;
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(cw / iw, ch / ih);
    const dx = (cw - iw * scale) / 2;
    const dy = (ch - ih * scale) / 2;

    const rectX = dx + regionEditState.x * iw * scale;
    const rectY = dy + regionEditState.y * ih * scale;
    const rectW = regionEditState.width * iw * scale;
    const rectH = regionEditState.height * ih * scale;

    const handleSize = 12;

    // 检查是否点中控制点
    const handles = [
      { x: rectX, y: rectY, type: "nw" },
      { x: rectX + rectW, y: rectY, type: "ne" },
      { x: rectX, y: rectY + rectH, type: "sw" },
      { x: rectX + rectW, y: rectY + rectH, type: "se" },
      { x: rectX + rectW / 2, y: rectY, type: "n" },
      { x: rectX + rectW, y: rectY + rectH / 2, type: "e" },
      { x: rectX + rectW / 2, y: rectY + rectH, type: "s" },
      { x: rectX, y: rectY + rectH / 2, type: "w" },
    ];

    let hitHandle = null;
    for (let h of handles) {
      if (
        Math.abs(mouseX - h.x) <= handleSize &&
        Math.abs(mouseY - h.y) <= handleSize
      ) {
        hitHandle = h.type;
        break;
      }
    }

    if (hitHandle) {
      cropInteraction.isActive = true;
      cropInteraction.handle = hitHandle;
      cropInteraction.startX = mouseX;
      cropInteraction.startY = mouseY;
      cropInteraction.initial = { 
        x: regionEditState.x, 
        y: regionEditState.y, 
        width: regionEditState.width, 
        height: regionEditState.height 
      };
      canvas.style.cursor = getCursorForHandle(hitHandle);
    } else if (
      mouseX >= rectX &&
      mouseX <= rectX + rectW &&
      mouseY >= rectY &&
      mouseY <= rectY + rectH
    ) {
      // 点中内部 → 移动整体
      cropInteraction.isActive = true;
      cropInteraction.handle = "move";
      cropInteraction.startX = mouseX - rectX;
      cropInteraction.startY = mouseY - rectY;
      cropInteraction.initial = { 
        x: regionEditState.x, 
        y: regionEditState.y, 
        width: regionEditState.width, 
        height: regionEditState.height 
      };
      canvas.style.cursor = "move";
    }
    return;
  }

  if (!cropState.enabled) return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const iw = cropState.imgWidth;
  const ih = cropState.imgHeight;
  const cw = canvas.width;
  const ch = canvas.height;
  const scale = Math.min(cw / iw, ch / ih);
  const dx = (cw - iw * scale) / 2;
  const dy = (ch - ih * scale) / 2;

  if (cropState.mode === "free") {
    const { x, y, width, height } = cropState.free;
    const rectX = dx + x * iw * scale;
    const rectY = dy + y * ih * scale;
    const rectW = width * iw * scale;
    const rectH = height * ih * scale;

    // 判断是否点在裁剪框内（简化：整个区域可拖）
    if (
      mouseX >= rectX &&
      mouseX <= rectX + rectW &&
      mouseY >= rectY &&
      mouseY <= rectY + rectH
    ) {
      isDraggingFree = true;
      dragStartX = mouseX - rectX;
      dragStartY = mouseY - rectY;
      canvas.style.cursor = "move";
    }

    const handleSize = 12; // 检测区域（比绘制略大）

    // 检查是否点中控制点
    const handles = [
      { x: rectX, y: rectY, type: "nw" },
      { x: rectX + rectW, y: rectY, type: "ne" },
      { x: rectX, y: rectY + rectH, type: "sw" },
      { x: rectX + rectW, y: rectY + rectH, type: "se" },
      { x: rectX + rectW / 2, y: rectY, type: "n" },
      { x: rectX + rectW, y: rectY + rectH / 2, type: "e" },
      { x: rectX + rectW / 2, y: rectY + rectH, type: "s" },
      { x: rectX, y: rectY + rectH / 2, type: "w" },
    ];

    let hitHandle = null;
    for (let h of handles) {
      if (
        Math.abs(mouseX - h.x) <= handleSize &&
        Math.abs(mouseY - h.y) <= handleSize
      ) {
        hitHandle = h.type;
        break;
      }
    }

    if (hitHandle) {
      // 点中控制点
      cropInteraction.isActive = true;
      cropInteraction.handle = hitHandle;
      cropInteraction.startX = mouseX;
      cropInteraction.startY = mouseY;
      cropInteraction.initial = { ...cropState.free };
      canvas.style.cursor = getCursorForHandle(hitHandle);
    } else if (
      mouseX >= rectX &&
      mouseX <= rectX + rectW &&
      mouseY >= rectY &&
      mouseY <= rectY + rectH
    ) {
      // 点中内部 → 移动整体
      cropInteraction.isActive = true;
      cropInteraction.handle = "move";
      cropInteraction.startX = mouseX - rectX;
      cropInteraction.startY = mouseY - rectY;
      cropInteraction.initial = { ...cropState.free };
      canvas.style.cursor = "move";
    }
  }
});

window.addEventListener("mousemove", (e) => {
  // 区域编辑模式
  // 区域编辑拖动处理（只有未确定时才可拖动）
  if (regionEditState.enabled && regionEditState.regionSelected && !regionEditState.regionConfirmed && cropInteraction.isActive) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const iw = cropState.imgWidth;
    const ih = cropState.imgHeight;
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(cw / iw, ch / ih);
    const dx = (cw - iw * scale) / 2;
    const dy = (ch - ih * scale) / 2;

    const {
      x: initX,
      y: initY,
      width: initW,
      height: initH,
    } = cropInteraction.initial;

    const targetAR = getAspectRatioValue(regionEditState.aspectRatio);
    const imgAR = cropState.imgWidth / cropState.imgHeight;
    const normAR = targetAR / imgAR;

    if (cropInteraction.handle === "move") {
      // 移动整体
      let newX = (mouseX - cropInteraction.startX - dx) / (iw * scale);
      let newY = (mouseY - cropInteraction.startY - dy) / (ih * scale);
      newX = Math.max(0, Math.min(1 - initW, newX));
      newY = Math.max(0, Math.min(1 - initH, newY));
      regionEditState.x = newX;
      regionEditState.y = newY;
      regionEditState.width = initW;
      regionEditState.height = initH;
    } else {
      // 调整尺寸（保持比例）
      let newRect = { x: initX, y: initY, width: initW, height: initH };

      // 将鼠标位置转为归一化坐标
      const normX = (mouseX - dx) / (iw * scale);
      const normY = (mouseY - dy) / (ih * scale);

      // 最小裁剪尺寸（归一化）
      const minSize = Math.max(50 / iw, 50 / ih);

      switch (cropInteraction.handle) {
        case "nw":
          newRect.x = Math.min(normX, initX + initW - minSize);
          newRect.width = initX + initW - newRect.x;
          newRect.height = newRect.width / normAR;
          newRect.y = initY + initH - newRect.height;
          break;
        case "ne":
          newRect.width = Math.max(minSize, normX - initX);
          newRect.height = newRect.width / normAR;
          newRect.y = initY + initH - newRect.height;
          break;
        case "sw":
          newRect.x = Math.min(normX, initX + initW - minSize);
          newRect.width = initX + initW - newRect.x;
          newRect.height = newRect.width / normAR;
          break;
        case "se":
          newRect.width = Math.max(minSize, normX - initX);
          newRect.height = newRect.width / normAR;
          break;
        case "n":
          {
            const newHeight = initY + initH - Math.min(normY, initY + initH - minSize);
            newRect.height = newHeight;
            newRect.width = newHeight * aspectValue;
            newRect.x = initX + (initW - newRect.width) / 2;
            newRect.y = initY + initH - newHeight;
          }
          break;
        case "s":
          {
            const newHeight = Math.max(minSize, normY - initY);
            newRect.height = newHeight;
            newRect.width = newHeight * aspectValue;
            newRect.x = initX + (initW - newRect.width) / 2;
          }
          break;
        case "w":
          {
            const newWidth = initX + initW - Math.min(normX, initX + initW - minSize);
            newRect.width = newWidth;
            newRect.height = newWidth / aspectValue;
            newRect.x = initX + initW - newWidth;
            newRect.y = initY + (initH - newRect.height) / 2;
          }
          break;
        case "e":
          {
            const newWidth = Math.max(minSize, normX - initX);
            newRect.width = newWidth;
            newRect.height = newWidth / aspectValue;
            newRect.y = initY + (initH - newRect.height) / 2;
          }
          break;
      }

      // 边界约束
      if (newRect.x < 0) {
        newRect.width += newRect.x;
        newRect.x = 0;
      }
      if (newRect.y < 0) {
        newRect.height += newRect.y;
        newRect.y = 0;
      }
      if (newRect.x + newRect.width > 1) {
        newRect.x = 1 - newRect.width;
      }
      if (newRect.y + newRect.height > 1) {
        newRect.y = 1 - newRect.height;
      }

      // 二次确保最小尺寸
      if (newRect.width < minSize) {
        newRect.width = minSize;
        newRect.height = minSize / aspectValue;
      }
      if (newRect.height < minSize) {
        newRect.height = minSize;
        newRect.width = minSize * aspectValue;
      }

      regionEditState.x = newRect.x;
      regionEditState.y = newRect.y;
      regionEditState.width = newRect.width;
      regionEditState.height = newRect.height;
    }

    render();
    return;
  }

  if (!cropState.enabled) return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  if (cropState.mode === "free" && isDraggingFree) {
    const iw = cropState.imgWidth;
    const ih = cropState.imgHeight;
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(cw / iw, ch / ih);
    const dx = (cw - iw * scale) / 2;
    const dy = (ch - ih * scale) / 2;

    // 新的左上角（canvas 坐标）
    let newRectX = mouseX - dragStartX;
    let newRectY = mouseY - dragStartY;

    // 转换为归一化坐标 (0~1)
    let newX = (newRectX - dx) / (iw * scale);
    let newY = (newRectY - dy) / (ih * scale);

    // 边界限制
    newX = Math.max(0, Math.min(1 - cropState.free.width, newX));
    newY = Math.max(0, Math.min(1 - cropState.free.height, newY));

    cropState.free.x = newX;
    cropState.free.y = newY;
    render();
  }
  if (cropState.mode === "free" && cropInteraction.isActive) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const iw = cropState.imgWidth;
    const ih = cropState.imgHeight;
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(cw / iw, ch / ih);
    const dx = (cw - iw * scale) / 2;
    const dy = (ch - ih * scale) / 2;

    const {
      x: initX,
      y: initY,
      width: initW,
      height: initH,
    } = cropInteraction.initial;

    if (cropInteraction.handle === "move") {
      // 移动整体
      let newX = (mouseX - cropInteraction.startX - dx) / (iw * scale);
      let newY = (mouseY - cropInteraction.startY - dy) / (ih * scale);
      newX = Math.max(0, Math.min(1 - initW, newX));
      newY = Math.max(0, Math.min(1 - initH, newY));
      cropState.free = { x: newX, y: newY, width: initW, height: initH };
    } else {
      // 调整尺寸
      let newRect = { x: initX, y: initY, width: initW, height: initH };

      // 将鼠标位置转为归一化坐标
      const normX = (mouseX - dx) / (iw * scale);
      const normY = (mouseY - dy) / (ih * scale);

      // 最小裁剪尺寸（归一化）
      const minSize = Math.max(50 / iw, 50 / ih); // 至少 50px

      switch (cropInteraction.handle) {
        case "nw":
          newRect.x = Math.min(normX, initX + initW - minSize);
          newRect.width = initX + initW - newRect.x;
          newRect.y = Math.min(normY, initY + initH - minSize);
          newRect.height = initY + initH - newRect.y;
          break;
        case "ne":
          newRect.width = Math.max(minSize, normX - initX);
          newRect.y = Math.min(normY, initY + initH - minSize);
          newRect.height = initY + initH - newRect.y;
          break;
        case "sw":
          newRect.x = Math.min(normX, initX + initW - minSize);
          newRect.width = initX + initW - newRect.x;
          newRect.height = Math.max(minSize, normY - initY);
          break;
        case "se":
          newRect.width = Math.max(minSize, normX - initX);
          newRect.height = Math.max(minSize, normY - initY);
          break;
        case "n":
          newRect.y = Math.min(normY, initY + initH - minSize);
          newRect.height = initY + initH - newRect.y;
          break;
        case "s":
          newRect.height = Math.max(minSize, normY - initY);
          break;
        case "w":
          newRect.x = Math.min(normX, initX + initW - minSize);
          newRect.width = initX + initW - newRect.x;
          break;
        case "e":
          newRect.width = Math.max(minSize, normX - initX);
          break;
      }

      // 边界约束
      if (newRect.x < 0) {
        newRect.width += newRect.x;
        newRect.x = 0;
      }
      if (newRect.y < 0) {
        newRect.height += newRect.y;
        newRect.y = 0;
      }
      if (newRect.x + newRect.width > 1) newRect.width = 1 - newRect.x;
      if (newRect.y + newRect.height > 1) newRect.height = 1 - newRect.y;

      // 二次确保最小尺寸
      if (newRect.width < minSize) {
        if (newRect.x + minSize <= 1) newRect.width = minSize;
        else {
          newRect.x = 1 - minSize;
          newRect.width = minSize;
        }
      }
      if (newRect.height < minSize) {
        if (newRect.y + minSize <= 1) newRect.height = minSize;
        else {
          newRect.y = 1 - minSize;
          newRect.height = minSize;
        }
      }

      cropState.free = newRect;
    }

    render();
  }
});

window.addEventListener("mouseup", () => {
  isDragging = false;
  isDraggingFree = false;
  cropInteraction.isActive = false;
  cropInteraction.handle = null;
  canvas.style.cursor = "default";
});

// 滚轮缩放自由区域（以中心为锚点）
canvas.addEventListener("wheel", (e) => {
  if (!cropState.enabled || cropState.mode !== "free") return;
  e.preventDefault();

  const delta = e.deltaY > 0 ? -0.02 : 0.02;
  let newWidth = cropState.free.width + delta;
  let newHeight = cropState.free.height + delta;

  // 限制最小/最大
  newWidth = Math.max(0.1, Math.min(1.0, newWidth));
  newHeight = Math.max(0.1, Math.min(1.0, newHeight));

  // 保持中心不变：调整 x/y
  const centerX = cropState.free.x + cropState.free.width / 2;
  const centerY = cropState.free.y + cropState.free.height / 2;

  cropState.free.width = newWidth;
  cropState.free.height = newHeight;
  cropState.free.x = centerX - newWidth / 2;
  cropState.free.y = centerY - newHeight / 2;

  // 边界检查
  if (cropState.free.x < 0) cropState.free.x = 0;
  if (cropState.free.y < 0) cropState.free.y = 0;
  if (cropState.free.x + cropState.free.width > 1)
    cropState.free.x = 1 - cropState.free.width;
  if (cropState.free.y + cropState.free.height > 1)
    cropState.free.y = 1 - cropState.free.height;

  render();
});

// 鼠标释放
window.addEventListener("mouseup", () => {
  isDragging = false;
  canvas.style.cursor = "default";
});

document
  .getElementById("saveCroppedImagesBtn")
  .addEventListener("click", async () => {
    // 支持裁剪模式和区域编辑模式
    if (!cropState.enabled && !regionEditState.enabled) return;

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    let dataUrls = [];

    // 区域编辑模式：直接保存当前显示的完整图片（已合成编辑结果）
    if (regionEditState.enabled) {
      // 当前 img.src 已经是合成后的完整图片
      const tempImg = new Image();
      tempImg.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        tempImg.onload = resolve;
        tempImg.onerror = reject;
        tempImg.src = img.src;
      });
      tempCanvas.width = tempImg.naturalWidth;
      tempCanvas.height = tempImg.naturalHeight;
      tempCtx.drawImage(tempImg, 0, 0);
      dataUrls.push(tempCanvas.toDataURL("image/jpeg", 0.92));
    } else if (cropState.mode === "quadrants") {
      const iw = cropState.imgWidth;
      const ih = cropState.imgHeight;
      const halfW = iw / 2;
      const halfH = ih / 2;
      const cropW = halfW * cropState.scale;
      const cropH = halfH * cropState.scale;
      const centers = [
        [halfW * (0.5 + cropState.offsetX), halfH * (0.5 + cropState.offsetY)],
        [halfW * (1.5 + cropState.offsetX), halfH * (0.5 + cropState.offsetY)],
        [halfW * (0.5 + cropState.offsetX), halfH * (1.5 + cropState.offsetY)],
        [halfW * (1.5 + cropState.offsetX), halfH * (1.5 + cropState.offsetY)],
      ];

      for (let [cx, cy] of centers) {
        const x = cx - cropW / 2;
        const y = cy - cropH / 2;
        tempCanvas.width = cropW;
        tempCanvas.height = cropH;
        tempCtx.clearRect(0, 0, cropW, cropH);
        tempCtx.drawImage(img, -x, -y, iw, ih);
        dataUrls.push(tempCanvas.toDataURL("image/jpeg", 0.92));
      }
    } else if (cropState.mode === "free") {
      const { x, y, width, height } = cropState.free;
      const cropX = x * cropState.imgWidth;
      const cropY = y * cropState.imgHeight;
      const cropW = width * cropState.imgWidth;
      const cropH = height * cropState.imgHeight;

      tempCanvas.width = cropW;
      tempCanvas.height = cropH;
      tempCtx.clearRect(0, 0, cropW, cropH);
      tempCtx.drawImage(
        img,
        -cropX,
        -cropY,
        cropState.imgWidth,
        cropState.imgHeight,
      );
      dataUrls.push(tempCanvas.toDataURL("image/jpeg", 0.92));
    }

    // 保存到后端
    try {
      const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
      
      let resp = await fetch("/save-cropped-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: dataUrls, film_id: filmId }),
      });
      let result = await resp.json();
      if (!result.success) throw new Error("Save failed");

      const record = {
        id: crypto.randomUUID(),
        film_id: filmId,
        timestamp: new Date().toISOString(),
        local_result_paths: result.local_paths,
        input_paths: [],
        prompt: cropState.mode === "free" ? "free crop" : "quadrants crop",
        size: "",
        aspect_ratio: "",
      };

      await fetch("/history-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });

      shouldHighlightNewRecords = true;
      document.querySelector('button[data-bs-target="#quick-gen"]').click();
    } catch (e) {
      console.error("保存失败", e);
      alert("保存裁剪结果失败，请重试。");
    }
  });

// ===== 换脸功能 ===== (已删除)
/*
document.getElementById("swapFaceBtn")?.addEventListener("click", async () => {
  // 1. 获取 QuickAccess 中标签为“角色”的图片
  const quickImages = window.QuickAccess?.getImages() || [];
  const characterImages = quickImages.filter(
    (img) => img.category === "角色" && img.viewType === "face_closeup",
  );

  if (characterImages.length === 0) {
    alert("暂无标记为“角色”的参考面部图片，请先在快捷访问中标记。");
    return;
  }

  // 2. 构建选择模态框
  let listHtml = "";
  characterImages.forEach((img, idx) => {
    const previewSrc = img.localPath || img.remoteUrl;
    const title = img.group
      ? `<div class="text-center small mt-1">${img.group}</div>`
      : "";
    listHtml += `
      <div class="col-4 mb-3 text-center" style="cursor:pointer;" data-index="${idx}">
        <img src="${previewSrc}" class="rounded" style="width:100px;height:100px;object-fit:cover;">
        ${title}
      </div>
    `;
  });

  const modalHtml = `
    <div class="modal fade" id="swapFaceModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content bg-dark text-light">
          <div class="modal-header">
            <h5 class="modal-title">选择参考面部</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row">${listHtml}</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
            <button type="button" class="btn btn-primary" id="confirmSwapFace" disabled>确认换脸</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const modalEl = document.getElementById("swapFaceModal");
  const modal = new bootstrap.Modal(modalEl);
  let selectedIdx = null;

  // 选中逻辑
  modalEl.querySelectorAll(".col-4").forEach((el) => {
    el.addEventListener("click", () => {
      modalEl
        .querySelectorAll(".col-4")
        .forEach((e) => e.classList.remove("border", "border-success"));
      el.classList.add("border", "border-success");
      selectedIdx = parseInt(el.dataset.index, 10);
      document.getElementById("confirmSwapFace").disabled = false;
    });
  });

  // 确认换脸
  document
    .getElementById("confirmSwapFace")
    .addEventListener("click", async () => {
      if (selectedIdx === null) return;

      // 显示全屏遮罩
      modal.hide();
      document.getElementById("fullscreenMask").style.display = "block";
      document.getElementById("fullscreenMask").classList.remove("d-none");

      const faceImg = characterImages[selectedIdx];
      const faceUrl = faceImg.remoteUrl; // 必须有 remoteUrl（QuickAccess 已保证）

      // 3. 将当前 canvas 图像上传到 ImgBB
      // 3. 将原始图像（而非 Canvas）上传到 ImgBB
      let originalBlob;
      try {
        // img.src 可能是 URL 或 blob URL
        const response = await fetch(img.src);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch original image: ${response.statusText}`,
          );
        }
        originalBlob = await response.blob();
      } catch (err) {
        console.error("无法获取原始图像用于上传:", err);
        alert("无法读取原始图像，请确保图片已正确加载。");
        document.getElementById("fullscreenMask").style.display = "none";
        document.getElementById("fullscreenMask").classList.add("d-none");
        return;
      }

      const formData = new FormData();
      formData.append("file", originalBlob, "original_for_swap.jpg");
      
      const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
      formData.append("film_id", filmId);

      const uploadResp = await fetch("/quick-upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadResp.ok) {
        alert("上传当前图像失败，请重试。");
        document.getElementById("fullscreenMask").style.display = "none";
        document.getElementById("fullscreenMask").classList.add("d-none");
        return;
      }
      const uploadData = await uploadResp.json();
      const sourceUrl = uploadData.url; // canvas 图的 ImgBB URL

      // 4. 调用换脸接口（你已提供伪接口）
      filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
      const swapResp = await fetch("/swap_face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: sourceUrl, face_url: faceUrl, film_id: filmId }),
      });

      const swapData = await swapResp.json();
      if (!swapData.success) {
        showToast("换脸失败：可能是人物面部遮挡较多", "error");
        document.getElementById("fullscreenMask").style.display = "none";
        document.getElementById("fullscreenMask").classList.add("d-none");
        return;
      }

      // 5. 加载返回的占位图（或真实结果）到 canvas
      const swappedImg = new Image();
      swappedImg.onload = () => {
        console.log("换脸成功");
        // 重置 crop 状态
        cropState.imgWidth = swappedImg.naturalWidth;
        cropState.imgHeight = swappedImg.naturalHeight;
        cropState.enabled = true;
        cropState.mode = "free";
        cropState.free = { x: 0, y: 0, width: 1, height: 1 }; // 整图
        img.src = swappedImg.src; // 更新主图（触发 onload）

        // 全局提示
        showToast("换脸成功，可以使用保存按钮保存", "success");
        // 隐藏遮罩
        document.getElementById("fullscreenMask").style.display = "none";
        document.getElementById("fullscreenMask").classList.add("d-none");
      };
      swappedImg.src = swapData.result_url; // 占位图 URL
    });
  // 启用保存按钮
  document.getElementById("saveCroppedImagesBtn").disabled = false;

  modalEl.addEventListener("hidden.bs.modal", () => {
    modalEl.remove();
  });
  modal.show();
});
*/

// ===== 拖拽上传到图片编辑器 =====
const editContainer = document.getElementById("imageEditContainer");

// 阻止默认拖拽行为（防止浏览器打开图片）
["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  editContainer.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

// 高亮拖入区域（可选视觉反馈）
editContainer.addEventListener("dragenter", () => {
  editContainer.classList.add("border-primary", "border-2");
});

editContainer.addEventListener("dragleave", () => {
  editContainer.classList.remove("border-primary", "border-2");
});

editContainer.addEventListener("drop", (e) => {
  editContainer.classList.remove("border-primary", "border-2");

  const files = e.dataTransfer.files;
  if (files.length === 0) return;

  const file = files[0];
  if (!file.type.startsWith("image/")) {
    showToast("请拖入图片文件", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (event) {
    // 创建临时 URL
    const url = event.target.result;

    // 设置到隐藏的 img 元素（触发 onload）
    img.src = url;

    // 隐藏占位提示
    $("#imageEditPlaceholder").hide();

    // 启用按钮（与 onload 逻辑一致）
    $("#cropToQuadrantsBtn").prop("disabled", false);
      $("#startRegionEditBtn").prop("disabled", false);
    document.getElementById("cropMode").value = "quadrants";
  };
  reader.readAsDataURL(file);
});

// ===== 区域编辑事件监听器 =====

// 编辑模式切换
document.getElementById("editMode")?.addEventListener("change", (e) => {
  const mode = e.target.value;
  
  if (mode === "region") {
    // 区域编辑模式
    cropState.enabled = false;
    document.querySelectorAll(".crop-mode-option").forEach(el => el.classList.add("d-none"));
    document.querySelectorAll(".region-mode-option").forEach(el => el.classList.remove("d-none"));
    document.getElementById("regionEditResultsPanel").style.display = "block";
    resetRegionEditState();
    // 必须在 reset 之后设置，否则会被 reset 覆盖
    regionEditState.originalImageUrl = img.src;
    currentOriginalImage = img.src;
    regionEditState.enabled = true;
  } else {
    // 裁剪模式
    regionEditState.enabled = false;
    cropState.enabled = true;
    document.querySelectorAll(".crop-mode-option").forEach(el => el.classList.remove("d-none"));
    document.querySelectorAll(".region-mode-option").forEach(el => el.classList.add("d-none"));
    document.getElementById("regionEditResultsPanel").style.display = "none";
    document.getElementById("regionEditActionBtn").classList.add("d-none");
    render();
  }
});

// 比例选择变化
document.getElementById("regionAspectRatio")?.addEventListener("change", (e) => {
  const ratio = e.target.value;
  regionEditState.aspectRatio = ratio;
  
  if (regionEditState.regionSelected) {
    // 重新计算选区以保持比例
    // 需要考虑原始图片的宽高比
    const targetAR = getAspectRatioValue(ratio);
    const imgAR = cropState.imgWidth / cropState.imgHeight;
    const normAR = targetAR / imgAR;
    
    const currentNormAR = regionEditState.width / regionEditState.height;
    
    if (Math.abs(currentNormAR - normAR) > 0.01) {
      // 调整高度以适应新比例
      const newHeight = regionEditState.width / normAR;
      if (regionEditState.y + newHeight <= 1) {
        regionEditState.height = newHeight;
      } else {
        // 如果超出边界，调整宽度
        regionEditState.height = 1 - regionEditState.y;
        regionEditState.width = regionEditState.height * normAR;
      }
      render();
    }
  }
});

// 开始/确定/重新选取区域
// 状态流程：选取区域 -> 确定选区 -> 重新选取
regionEditStep = 0; // 0: 初始, 1: 选取中, 2: 已确定

document.getElementById("startRegionEditBtn")?.addEventListener("click", () => {
  const btn = document.getElementById("startRegionEditBtn");
  
  if (regionEditStep === 0) {
    // 第一步：开始选取区域
    const selectedRatio = document.getElementById("regionAspectRatio")?.value || "16:9";
    const targetAR = getAspectRatioValue(selectedRatio);
    const imgAR = cropState.imgWidth / cropState.imgHeight;
    const normAR = targetAR / imgAR;
    
    // 初始化选区尺寸（中间位置，保持比例）
    let initWidth = 0.5;
    let initHeight = initWidth / normAR;
    
    // 如果高度超出，调整
    if (initHeight > 0.8) {
      initHeight = 0.8;
      initWidth = initHeight * normAR;
    }
    
    regionEditState.aspectRatio = selectedRatio;
    regionEditState.x = (1 - initWidth) / 2;
    regionEditState.y = (1 - initHeight) / 2;
    regionEditState.width = initWidth;
    regionEditState.height = initHeight;
    regionEditState.enabled = true;
    regionEditState.regionSelected = true; // 可以调整
    regionEditStep = 1;
    btn.textContent = "确定选区";
    btn.classList.remove("btn-warning");
    btn.classList.add("btn-success");
    render();
  } else if (regionEditStep === 1) {
    // 第二步：确定选区（固定，显示编辑按钮）
    regionEditStep = 2;
    regionEditState.regionConfirmed = true; // 标记为已确定
    btn.textContent = "重新选取";
    btn.classList.remove("btn-success");
    btn.classList.add("btn-warning");
    document.getElementById("regionEditActionBtn").classList.remove("d-none");
    document.getElementById("regionEditActionBtn").disabled = false;
    render();
  } else {
    // 第三步：重新选取（回到初始状态）
    regionEditStep = 0;
    regionEditState.regionSelected = false;
    regionEditState.regionConfirmed = false;
    regionEditState.x = 0.25;
    regionEditState.y = 0.25;
    regionEditState.width = 0.5;
    regionEditState.height = 0.5;
    btn.textContent = "选取区域";
    btn.classList.remove("btn-warning");
    btn.classList.add("btn-success");
    document.getElementById("regionEditActionBtn").classList.add("d-none");
    document.getElementById("regionEditActionBtn").disabled = true;
    document.getElementById("applyRegionEditBtn").disabled = true;
    render();
  }
});

// 打开编辑模态框
document.getElementById("regionEditActionBtn")?.addEventListener("click", () => {
  if (!regionEditState.regionSelected) return;
  
  // 加载快捷访问中的角色图片到换脸选项
  const quickImages = window.QuickAccess?.getImages() || [];
  const characterImages = quickImages.filter(
    (img) => img.category === "角色" && img.viewType === "face_closeup"
  );
  
  const faceSwapOptions = document.getElementById("regionFaceSwapOptions");
  if (faceSwapOptions) {
    if (characterImages.length === 0) {
      faceSwapOptions.innerHTML = '<div class="col-12 text-center text-muted py-3">暂无标记为"角色-面部特写"的参考图片，请先在快捷访问中标记。</div>';
    } else {
      let html = "";
      characterImages.forEach((charImg, idx) => {
        const previewSrc = charImg.localPath || charImg.remoteUrl;
        const title = charImg.group ? '<div class="text-center small mt-1">' + charImg.group + '</div>' : "";
        html += '<div class="col-4 mb-2 text-center region-face-option" style="cursor:pointer;" data-idx="' + idx + '" data-url="' + charImg.remoteUrl + '">' +
          '<img src="' + previewSrc + '" class="rounded" style="width:80px;height:80px;object-fit:cover; border: 2px solid transparent;">' +
          title +
        '</div>';
      });
      faceSwapOptions.innerHTML = html;
      
      // 绑定点击事件
      faceSwapOptions.querySelectorAll(".region-face-option").forEach(el => {
        el.addEventListener("click", function() {
          faceSwapOptions.querySelectorAll(".region-face-option img").forEach(img => {
            img.style.borderColor = "transparent";
          });
          this.querySelector("img").style.borderColor = "#00ff00";
          this.classList.add("selected");
        });
      });
    }
  }
  
  // 重置编辑类型为换脸
  document.getElementById("regionEditTypeFace").checked = true;
  document.getElementById("regionFaceSwapSection").style.display = "block";
  document.getElementById("regionImg2ImgSection").style.display = "none";
  document.getElementById("regionImg2ImgPrompt").value = "";
  regionEditExtraImages = [];
  renderRegionEditExtraImages();
  
  const modal = new bootstrap.Modal(document.getElementById("regionEditModal"));
  modal.show();
});

// 编辑类型切换
document.querySelectorAll('input[name="regionEditType"]').forEach(radio => {
  radio.addEventListener("change", (e) => {
    const isFaceSwap = e.target.value === "face_swap";
    document.getElementById("regionFaceSwapSection").style.display = isFaceSwap ? "block" : "none";
    document.getElementById("regionImg2ImgSection").style.display = isFaceSwap ? "none" : "block";
  });
});

// 确认编辑
document.getElementById("confirmRegionEdit")?.addEventListener("click", async () => {
  const editType = document.querySelector('input[name="regionEditType"]:checked')?.value || "img2img";
  const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
  
  // 关闭模态框
  bootstrap.Modal.getInstance(document.getElementById("regionEditModal"))?.hide();

  // 显示加载状态
  document.getElementById("fullscreenMask").style.display = "block";
  document.getElementById("fullscreenMask").classList.remove("d-none");

  try {
    let result;
    
    if (editType === "face_swap") {
      // 换脸模式
      const selectedFace = document.querySelector(".region-face-option.selected");
      if (!selectedFace) {
        throw new Error("请选择参考面部");
      }
      const faceUrl = selectedFace.dataset.url;
      
      // 调用后端换脸 API
      const resp = await fetch("/region_edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_url: currentOriginalImage,
          region: {
            x: regionEditState.x,
            y: regionEditState.y,
            width: regionEditState.width,
            height: regionEditState.height,
            aspect_ratio: regionEditState.aspectRatio,
          },
          edit_type: "face_swap",
          face_url: faceUrl,
          film_id: filmId,
        }),
      });
      
      result = await resp.json();
      if (!result.success) throw new Error(result.error || "换脸失败");
      
    } else {
      // 图生图模式
      const prompt = document.getElementById("regionImg2ImgPrompt")?.value || "";
      if (!prompt.trim()) {
        throw new Error("请输入提示词");
      }
      
      const extraUrls = regionEditExtraImages.map(img => img.url);
      
      const resp = await fetch("/region_edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_url: currentOriginalImage,
          region: {
            x: regionEditState.x,
            y: regionEditState.y,
            width: regionEditState.width,
            height: regionEditState.height,
            aspect_ratio: regionEditState.aspectRatio,
          },
          edit_type: "img2img",
          prompt: prompt,
          extra_image_urls: extraUrls,
          film_id: filmId,
        }),
      });
      
      result = await resp.json();
      if (!result.success) throw new Error(result.error || "图生图失败");
    }

    // 添加结果到列表
    regionEditResults.push({
      url: result.local_path,
      type: editType,
      params: editType === "face_swap" ? {} : { prompt: document.getElementById("regionImg2ImgPrompt")?.value || "" },
    });

    renderRegionEditResults();
    showRegionEditResult(regionEditResults.length - 1);
    
    document.getElementById("applyRegionEditBtn").disabled = false;
    document.getElementById("saveCroppedImagesBtn").disabled = false;
    showToast(editType === "face_swap" ? "换脸完成" : "图生图完成", "success");
    
  } catch (err) {
    console.error("区域编辑错误:", err);
    showToast("区域编辑失败: " + err.message, "error");
  } finally {
    document.getElementById("fullscreenMask").style.display = "none";
    document.getElementById("fullscreenMask").classList.add("d-none");
  }
});

// 应用结果到主图片
document.getElementById("applyRegionEditBtn")?.addEventListener("click", () => {
  if (currentResultIndex < 0 || currentResultIndex >= regionEditResults.length) {
    showToast("请先选择一个编辑结果", "error");
    return;
  }

  const result = regionEditResults[currentResultIndex];
  
  // 创建临时 canvas 来合成图片
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");
  
  tempCanvas.width = cropState.imgWidth;
  tempCanvas.height = cropState.imgHeight;
  
  // 绘制原图
  tempCtx.drawImage(img, 0, 0);
  
  // 载入编辑结果并合成
  const resultImg = new Image();
  resultImg.onload = () => {
    const cropX = regionEditState.x * cropState.imgWidth;
    const cropY = regionEditState.y * cropState.imgHeight;
    const cropW = regionEditState.width * cropState.imgWidth;
    const cropH = regionEditState.height * cropState.imgHeight;
    
    tempCtx.drawImage(resultImg, cropX, cropY, cropW, cropH);
    
    // 更新主图片
    img.src = tempCanvas.toDataURL("image/jpeg", 0.92);
    
    showToast("已应用编辑结果", "success");
  };
  resultImg.src = result.url;
});
