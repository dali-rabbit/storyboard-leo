// image-edit/crop-mode.js
// 裁剪模式功能（四格裁剪和自由裁剪）

(function() {
  // 裁剪按钮事件
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

  // 鼠标按下 - 自由裁剪模式
  canvas.addEventListener("mousedown", (e) => {
    // 区域编辑模式（只有未确定时才可调整）
    if (regionEditState.enabled && regionEditState.regionSelected && !regionEditState.regionConfirmed) {
      handleRegionEditMouseDown(e);
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

  // 区域编辑鼠标按下处理
  function handleRegionEditMouseDown(e) {
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
  }

  // 全局鼠标移动
  window.addEventListener("mousemove", (e) => {
    // 区域编辑拖动处理（只有未确定时才可拖动）
    if (regionEditState.enabled && regionEditState.regionSelected && !regionEditState.regionConfirmed && cropInteraction.isActive) {
      handleRegionEditMouseMove(e);
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
      handleFreeCropResize(e, mouseX, mouseY);
    }
  });

  // 区域编辑鼠标移动处理
  function handleRegionEditMouseMove(e) {
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
        case "n": {
          const newHeight = initY + initH - Math.min(normY, initY + initH - minSize);
          newRect.height = newHeight;
          newRect.width = newHeight * normAR;
          newRect.x = initX + (initW - newRect.width) / 2;
          newRect.y = initY + initH - newHeight;
          break;
        }
        case "s": {
          const newHeight = Math.max(minSize, normY - initY);
          newRect.height = newHeight;
          newRect.width = newHeight * normAR;
          newRect.x = initX + (initW - newRect.width) / 2;
          break;
        }
        case "w": {
          const newWidth = initX + initW - Math.min(normX, initX + initW - minSize);
          newRect.width = newWidth;
          newRect.height = newWidth / normAR;
          newRect.x = initX + initW - newWidth;
          newRect.y = initY + (initH - newRect.height) / 2;
          break;
        }
        case "e": {
          const newWidth = Math.max(minSize, normX - initX);
          newRect.width = newWidth;
          newRect.height = newWidth / normAR;
          newRect.y = initY + (initH - newRect.height) / 2;
          break;
        }
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
        newRect.height = minSize / normAR;
      }
      if (newRect.height < minSize) {
        newRect.height = minSize;
        newRect.width = minSize * normAR;
      }

      regionEditState.x = newRect.x;
      regionEditState.y = newRect.y;
      regionEditState.width = newRect.width;
      regionEditState.height = newRect.height;
    }

    render();
  }

  // 自由裁剪调整大小
  function handleFreeCropResize(e, mouseX, mouseY) {
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

  // 鼠标释放
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

  // 保存裁剪图片
  document.getElementById("saveCroppedImagesBtn").addEventListener("click", async () => {
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
})();
