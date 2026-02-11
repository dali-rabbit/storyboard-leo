// image-edit/region-mode.js
// 区域编辑功能（选区、换脸、图生图、结果管理）

(function() {
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
    
    // 添加"原图"选项在最前面
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

  // 颜色匹配开关切换
  document.getElementById("enableColorMatch")?.addEventListener("change", (e) => {
    const enabled = e.target.checked;
    document.getElementById("colorMatchMethodSection").style.display = enabled ? "block" : "none";
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
  document.getElementById("applyRegionEditBtn")?.addEventListener("click", async () => {
    if (currentResultIndex < 0 || currentResultIndex >= regionEditResults.length) {
      showToast("请先选择一个编辑结果", "error");
      return;
    }

    const result = regionEditResults[currentResultIndex];
    const enableColorMatch = document.getElementById("enableColorMatch")?.checked ?? true;
    const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
    
    // 显示加载状态
    document.getElementById("fullscreenMask").style.display = "block";
    document.getElementById("fullscreenMask").classList.remove("d-none");
    document.getElementById("fullscreenMask").querySelector("div > div").innerHTML = 
      '<div class="spinner-border text-light mb-2" role="status"></div><div>正在处理颜色匹配...</div>';
    
    try {
      let finalResultUrl = result.url;
      
      // 如果启用了颜色匹配，先调用颜色匹配API
      if (enableColorMatch) {
        const colorMethod = document.getElementById("colorMatchMethod")?.value || "mkl";
        
        // 获取原图URL（当前显示在canvas上的图）
        const originalUrl = currentOriginalImage || regionEditState.originalImageUrl;
        
        if (!originalUrl) {
          throw new Error("无法获取原图URL");
        }
        
        console.log("[Color Match] 调用颜色匹配API");
        console.log("[Color Match] target:", result.url);
        console.log("[Color Match] ref:", originalUrl);
        
        const resp = await fetch("/color-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_url: result.url,
            ref_url: originalUrl,
            method: colorMethod,
            strength: 1.0,
            film_id: filmId,
          }),
        });
        
        const data = await resp.json();
        if (!data.success) {
          throw new Error(data.error || "颜色匹配失败");
        }
        
        finalResultUrl = data.local_path;
        console.log("[Color Match] 处理完成:", finalResultUrl);
        showToast("颜色匹配完成", "success");
      }
      
      // 创建临时 canvas 来合成图片
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");
      
      tempCanvas.width = cropState.imgWidth;
      tempCanvas.height = cropState.imgHeight;
      
      // 绘制原图
      tempCtx.drawImage(img, 0, 0);
      
      // 载入编辑结果并合成
      const resultImg = new Image();
      resultImg.crossOrigin = "anonymous";
      
      await new Promise((resolve, reject) => {
        resultImg.onload = resolve;
        resultImg.onerror = reject;
        resultImg.src = finalResultUrl;
      });
      
      const cropX = regionEditState.x * cropState.imgWidth;
      const cropY = regionEditState.y * cropState.imgHeight;
      const cropW = regionEditState.width * cropState.imgWidth;
      const cropH = regionEditState.height * cropState.imgHeight;
      
      tempCtx.drawImage(resultImg, cropX, cropY, cropW, cropH);
      
      // 更新主图片
      img.src = tempCanvas.toDataURL("image/jpeg", 0.92);
      
      showToast("已应用编辑结果" + (enableColorMatch ? "（含颜色匹配）" : ""), "success");
      
    } catch (err) {
      console.error("应用编辑结果错误:", err);
      showToast("应用失败: " + err.message, "error");
    } finally {
      document.getElementById("fullscreenMask").style.display = "none";
      document.getElementById("fullscreenMask").classList.add("d-none");
      // 恢复遮罩文字
      document.getElementById("fullscreenMask").querySelector("div > div").innerHTML = 
        '<div class="spinner-border text-light mb-2" role="status"></div><div>正在处理换脸，请稍候...</div>';
    }
  });
})();
