// image-edit/core.js
// 核心状态定义、Canvas 初始化和渲染

// 全局变量
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
let isDraggingFree = false;
let dragCorner = null; // null = 移动整体，'br' = 调整右下角（简化）

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
  resizeCanvas();
  render();

  $("#imageEditPlaceholder")
    .removeClass("d-flex") // 移除 display: flex
    .hide(); // 此时 hide 有效
  $("#cropToQuadrantsBtn").prop("disabled", false);
  $("#startRegionEditBtn").prop("disabled", false);
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
