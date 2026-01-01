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
  cropState.enabled = false;
  resizeCanvas();
  render();

  $("#imageEditPlaceholder")
    .removeClass("d-flex") // 移除 display: flex
    .hide(); // 此时 hide 有效
  $("#cropToQuadrantsBtn").prop("disabled", false);
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
  if (!cropState.enabled) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.02 : 0.02;
  cropState.scale = Math.max(0.5, Math.min(1.2, cropState.scale + delta));
  render();
});

let isDraggingFree = false;
let dragCorner = null; // null = 移动整体，'br' = 调整右下角（简化）

canvas.addEventListener("mousedown", (e) => {
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
    if (!cropState.enabled) return;

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    let dataUrls = [];

    if (cropState.mode === "quadrants") {
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
      let resp = await fetch("/save-cropped-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: dataUrls }),
      });
      let result = await resp.json();
      if (!result.success) throw new Error("Save failed");

      const record = {
        id: crypto.randomUUID(),
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
