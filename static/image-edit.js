let canvas = document.getElementById("editCanvas");
let ctx = canvas.getContext("2d");
let img = document.getElementById("hiddenImageLoader");
let shouldHighlightNewRecords = false;

// 裁剪状态
let cropState = {
  enabled: false,
  imgWidth: 0,
  imgHeight: 0,
  scale: 0.95,
  offsetX: 0,
  offsetY: 0,
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
};

// 渲染主函数
function render() {
  console.log("渲染图片");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const iw = cropState.imgWidth;
  const ih = cropState.imgHeight;
  const cw = canvas.width;
  const ch = canvas.height;

  // 计算图片在 canvas 中的显示区域（保持比例，居中）
  let scale = Math.min(cw / iw, ch / ih);
  let dx = (cw - iw * scale) / 2;
  let dy = (ch - ih * scale) / 2;

  // 绘制原图
  ctx.drawImage(img, dx, dy, iw * scale, ih * scale);

  if (!cropState.enabled) return;

  // 计算每个裁剪格的逻辑尺寸（原始坐标系）
  const halfW = iw / 2;
  const halfH = ih / 2;
  const cropW = halfW * cropState.scale;
  const cropH = halfH * cropState.scale;

  // 四个中心点（原始坐标）
  const centers = [
    [halfW * (0.5 + cropState.offsetX), halfH * (0.5 + cropState.offsetY)], // 左上
    [halfW * (1.5 + cropState.offsetX), halfH * (0.5 + cropState.offsetY)], // 右上
    [halfW * (0.5 + cropState.offsetX), halfH * (1.5 + cropState.offsetY)], // 左下
    [halfW * (1.5 + cropState.offsetX), halfH * (1.5 + cropState.offsetY)], // 右下
  ];

  // 绘制裁剪框（映射到 canvas 坐标）
  ctx.strokeStyle = "#00ff00";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  centers.forEach(([cx, cy]) => {
    let x = dx + (cx - cropW / 2) * scale;
    let y = dy + (cy - cropH / 2) * scale;
    let w = cropW * scale;
    let h = cropH * scale;
    ctx.strokeRect(x, y, w, h);
  });
  ctx.setLineDash([]);
}

// ===== 交互事件 =====

// 启用四格切图
document.getElementById("cropToQuadrantsBtn").addEventListener("click", () => {
  cropState.enabled = true;
  cropState.scale = 0.95;
  cropState.offsetX = 0;
  cropState.offsetY = 0;
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

// 鼠标按下（准备拖动）
canvas.addEventListener("mousedown", (e) => {
  if (!cropState.enabled) return;
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  canvas.style.cursor = "grabbing";
});

// 鼠标移动（拖动）
window.addEventListener("mousemove", (e) => {
  if (!isDragging || !cropState.enabled) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  // 转换为原始图像坐标偏移（归一化到 -1~1）
  const container = canvas.parentElement;
  const normX = dx / (container.clientWidth / 2);
  const normY = dy / (container.clientHeight / 2);
  cropState.offsetX += normX * 0.02;
  cropState.offsetY += normY * 0.02;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  render();
});

// 鼠标释放
window.addEventListener("mouseup", () => {
  isDragging = false;
  canvas.style.cursor = "default";
});

// ===== 保存裁剪结果 =====
document
  .getElementById("saveCroppedImagesBtn")
  .addEventListener("click", async () => {
    if (!cropState.enabled) return;

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

    let dataUrls = [];
    let results = [];
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    for (let [cx, cy] of centers) {
      const x = cx - cropW / 2;
      const y = cy - cropH / 2;
      tempCanvas.width = cropW;
      tempCanvas.height = cropH;
      tempCtx.clearRect(0, 0, cropW, cropH);
      tempCtx.drawImage(img, -x, -y, iw, ih); // 裁剪技巧

      // 转为 Blob 并保存（模拟上传，但只存本地）
      const dataUrl = tempCanvas.toDataURL("image/jpeg", 0.92);
      dataUrls.push(dataUrl);
    }
    // 调用新接口
    try {
      let resp = await fetch("/save-cropped-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: dataUrls }),
      });
      let result = await resp.json();
      if (result.success && result.local_paths) {
        results = result.local_paths; // 如 ["/history/results/abc.jpg", ...]
      }
    } catch (e) {
      console.error("Save cropped images failed", e);
      return;
    }

    // 创建一个“裁剪记录”存入历史
    const record = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      local_result_paths: results,
      input_paths: [], // 原图路径（你可能需要传真实路径）
      prompt: "cropped",
      size: "",
      aspect_ratio: "",
    };

    // 保存记录（调用后端 /history 写入）
    await fetch("/history-record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });

    // alert(`成功裁剪并保存 ${results.length} 张图片到历史记录！`);
    // 设置标志：下一次加载历史时要高亮 + 滚动
    shouldHighlightNewRecords = true;

    // 切换到“快速生图”标签
    const quickGenTab = document.querySelector(
      'button[data-bs-target="#quick-gen"]',
    );
    if (quickGenTab) {
      const tab = new bootstrap.Tab(quickGenTab);
      tab.show(); // 触发 shown.bs.tab → loadHistoryPage(1)
    }
  });
