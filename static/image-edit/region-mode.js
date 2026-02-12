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
    
    // 添加"原图"选项在最前面（无缩略图，只有文字）
    const isOriginalActive = currentResultIndex === -1;
    html += `
      <div class="result-item ${isOriginalActive ? 'active' : ''}" data-idx="-1" style="cursor: pointer; padding: 8px; margin-bottom: 8px; border-radius: 4px; ${isOriginalActive ? 'background: #0d6efd; color: white;' : 'background: #2d2d2d; color: #fff;'}">
        <div class="d-flex align-items-center">
          <span class="me-2">🖼️</span>
          <span>原图</span>
        </div>
      </div>
    `;
    
    // 编辑结果显示缩略图（带hover按钮）
    regionEditResults.forEach((result, idx) => {
      const isActive = idx === currentResultIndex;
      const editTypeLabel = result.type === "face_swap" ? "换脸" : "图生图";
      const editTypeIcon = result.type === "face_swap" ? "👤" : "🎨";
      
      html += `
        <div class="result-item ${isActive ? 'active' : ''}" data-idx="${idx}" 
             style="cursor: pointer; padding: 8px; margin-bottom: 8px; border-radius: 4px; ${isActive ? 'background: #0d6efd;' : 'background: #2d2d2d;'} border: 2px solid ${isActive ? '#0d6efd' : 'transparent'}; position: relative;"
             onmouseenter="this.querySelector('.result-actions').style.opacity='1'" 
             onmouseleave="this.querySelector('.result-actions').style.opacity='0'">
          <div class="d-flex gap-2">
            <!-- 缩略图 -->
            <div style="flex-shrink: 0; position: relative;">
              <img src="${result.url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; ${isActive ? 'box-shadow: 0 0 0 2px #fff;' : ''}" 
                   onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22><rect fill=%22%23333%22 width=%2280%22 height=%2280%22/><text fill=%22%23999%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22>加载失败</text></svg>'">
              <!-- Hover 操作按钮 -->
              <div class="result-actions" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px; opacity: 0; transition: opacity 0.2s; border-radius: 4px;">
                <button class="btn btn-sm btn-primary rerun-result" data-idx="${idx}" style="padding: 2px 8px; font-size: 11px; white-space: nowrap;">🔄 重跑</button>
                <button class="btn btn-sm btn-outline-light edit-params" data-idx="${idx}" style="padding: 2px 8px; font-size: 11px; white-space: nowrap;">⚙️ 编辑</button>
                <button class="btn btn-sm btn-outline-danger delete-result" data-idx="${idx}" style="padding: 2px 8px; font-size: 11px; white-space: nowrap;">🗑️ 删除</button>
              </div>
            </div>
            <!-- 信息 -->
            <div style="flex: 1; min-width: 0; color: ${isActive ? '#fff' : '#ccc'};">
              <div class="d-flex justify-content-between align-items-start mb-1">
                <span style="font-weight: 500;">${editTypeIcon} 结果 ${idx + 1}</span>
              </div>
              <div style="font-size: 12px; opacity: 0.8; margin-bottom: 4px;">
                <span class="badge bg-secondary" style="font-size: 10px;">${editTypeLabel}</span>
              </div>
              ${result.params && result.params.prompt ? `<div style="font-size: 11px; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${result.params.prompt}">${result.params.prompt}</div>` : ''}
              ${result.rerunFrom !== undefined ? `<div style="font-size: 10px; opacity: 0.5; margin-top: 2px;">↳ 重跑自结果 ${result.rerunFrom + 1}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;

    // 添加点击事件
    container.querySelectorAll(".result-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest('.result-actions')) return;
        const idx = parseInt(el.dataset.idx, 10);
        showRegionEditResult(idx);
      });
    });

    // 添加重跑事件
    container.querySelectorAll(".rerun-result").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        rerunRegionEdit(idx);
      });
    });

    // 添加编辑参数事件
    container.querySelectorAll(".edit-params").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        editResultParams(idx);
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

  // 显示指定结果（idx=-1显示原图，idx>=0显示合成预览）
  async function showRegionEditResult(idx) {
    currentResultIndex = idx;
    renderRegionEditResults();

    if (idx === -1) {
      // 显示原图
      const originalUrl = currentOriginalImage || regionEditState.originalImageUrl;
      if (originalUrl) {
        img.src = originalUrl;
        // 等待加载完成后更新尺寸
        await new Promise((resolve) => {
          img.onload = () => {
            cropState.imgWidth = img.naturalWidth;
            cropState.imgHeight = img.naturalHeight;
            render();
            resolve();
          };
          img.onerror = resolve;
          // 如果已经加载完成，直接执行
          if (img.complete) {
            cropState.imgWidth = img.naturalWidth;
            cropState.imgHeight = img.naturalHeight;
            render();
            resolve();
          }
        });
      }
    } else if (idx >= 0 && idx < regionEditResults.length) {
      // ✅ 显示合成预览：选区小图贴回原始大图
      const result = regionEditResults[idx];
      const originalUrl = currentOriginalImage || regionEditState.originalImageUrl;
      
      if (!originalUrl) {
        // 没有原图，直接显示小图
        img.src = result.url;
        return;
      }
      
      try {
        // 创建合成预览
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");
        
        // 使用原始大图尺寸
        const originalImg = new Image();
        originalImg.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          originalImg.onload = resolve;
          originalImg.onerror = reject;
          originalImg.src = originalUrl;
        });
        
        tempCanvas.width = originalImg.naturalWidth;
        tempCanvas.height = originalImg.naturalHeight;
        
        // 绘制原图
        tempCtx.drawImage(originalImg, 0, 0);
        
        // 绘制选区结果
        const resultImg = new Image();
        resultImg.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          resultImg.onload = resolve;
          resultImg.onerror = reject;
          resultImg.src = result.url;
        });
        
        // 计算选区位置
        const cropX = regionEditState.x * tempCanvas.width;
        const cropY = regionEditState.y * tempCanvas.height;
        
        // 将小图贴到选区位置
        tempCtx.drawImage(resultImg, cropX, cropY);
        
        // 显示合成结果
        img.src = tempCanvas.toDataURL("image/jpeg", 0.92);
        cropState.imgWidth = tempCanvas.width;
        cropState.imgHeight = tempCanvas.height;
        
      } catch (err) {
        console.error("显示合成预览失败:", err);
        // 降级：直接显示小图
        img.src = result.url;
      }
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

  // 重跑区域编辑（使用当前结果的参数重新生成）
  async function rerunRegionEdit(idx) {
    if (idx < 0 || idx >= regionEditResults.length) return;
    
    const result = regionEditResults[idx];
    const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
    
    // 显示加载状态
    document.getElementById("fullscreenMask").style.display = "block";
    document.getElementById("fullscreenMask").classList.remove("d-none");
    document.getElementById("fullscreenMask").querySelector("div > div").innerHTML = 
      '<div class="spinner-border text-light mb-2" role="status"></div><div>正在重跑编辑...</div>';
    
    try {
      const originalUrl = currentOriginalImage || regionEditState.originalImageUrl;
      if (!originalUrl) {
        throw new Error("无法获取原图URL");
      }
      
      // 构建请求参数（复用原结果的参数）
      const requestBody = {
        original_url: originalUrl,
        region: {
          x: regionEditState.x,
          y: regionEditState.y,
          width: regionEditState.width,
          height: regionEditState.height,
          aspect_ratio: regionEditState.aspectRatio,
        },
        edit_type: result.type,
        film_id: filmId,
      };
      
      // 根据编辑类型添加特定参数
      if (result.type === "face_swap") {
        // 换脸：需要 face_url，从原结果参数中获取
        if (!result.params || !result.params.face_url) {
          throw new Error("无法获取换脸参数，请重新编辑");
        }
        requestBody.face_url = result.params.face_url;
      } else {
        // 图生图：需要 prompt 和 extra_image_urls
        if (!result.params || !result.params.prompt) {
          throw new Error("无法获取图生图参数，请重新编辑");
        }
        requestBody.prompt = result.params.prompt;
        requestBody.extra_image_urls = result.params.extra_image_urls || [];
      }
      
      // 调用编辑 API
      const resp = await fetch("/region_edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      
      const data = await resp.json();
      if (!data.success) {
        throw new Error(data.error || "重跑失败");
      }
      
      // 添加新结果到列表（标记为重跑）
      const newResult = {
        url: data.local_path,
        type: result.type,
        width: data.width,
        height: data.height,
        params: result.params,  // 复用原参数
        rerunFrom: idx,  // 标记重跑来源
      };
      
      regionEditResults.push(newResult);
      
      renderRegionEditResults();
      showRegionEditResult(regionEditResults.length - 1);
      
      showToast(`重跑完成（结果 ${regionEditResults.length}）`, "success");
      
    } catch (err) {
      console.error("重跑编辑错误:", err);
      showToast("重跑失败: " + err.message, "error");
    } finally {
      document.getElementById("fullscreenMask").style.display = "none";
      document.getElementById("fullscreenMask").classList.add("d-none");
    }
  }

  // 编辑结果参数（打开模态框修改参数后重新生成）
  function editResultParams(idx) {
    if (idx < 0 || idx >= regionEditResults.length) return;
    
    const result = regionEditResults[idx];
    
    // 打开编辑模态框并填充当前参数
    document.getElementById("regionEditTypeFace").checked = result.type === "face_swap";
    document.getElementById("regionEditTypeImg2Img").checked = result.type === "img2img";
    
    // 触发类型切换事件
    document.getElementById("regionEditTypeFace").dispatchEvent(new Event("change"));
    
    if (result.type === "face_swap") {
      // 换脸：保持当前选择的面部（如果有）
      document.getElementById("regionFaceSwapSection").style.display = "block";
      document.getElementById("regionImg2ImgSection").style.display = "none";
    } else {
      // 图生图：填充提示词和额外图片
      document.getElementById("regionFaceSwapSection").style.display = "none";
      document.getElementById("regionImg2ImgSection").style.display = "block";
      
      if (result.params) {
        document.getElementById("regionImg2ImgPrompt").value = result.params.prompt || "";
        // 恢复额外图片
        regionEditExtraImages = result.params.extra_images || [];
        renderRegionEditExtraImages();
      }
    }
    
    // 显示模态框
    const modal = new bootstrap.Modal(document.getElementById("regionEditModal"));
    modal.show();
    
    // 标记这是编辑模式（需要在确认编辑时知道要更新哪个结果）
    window.__editingResultIndex = idx;
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

  // 检查是否有未应用的编辑结果
  function hasUnappliedResults() {
    return regionEditResults.length > 0;
  }

  // 提示用户确认放弃当前编辑结果
  function confirmAbandonResults(actionName) {
    const count = regionEditResults.length;
    const message = `当前选区有 ${count} 个编辑结果未应用。\n\n${actionName}将丢失这些结果。\n\n是否继续？`;
    return confirm(message);
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
      // 切换到区域编辑模式：检查是否有未应用的编辑结果
      if (hasUnappliedResults()) {
        if (!confirmAbandonResults("切换到区域编辑模式")) {
          // 用户取消，恢复原来的选择
          e.target.value = "crop";
          return;
        }
      }
      
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
      // 切换到裁剪模式：检查是否有未应用的编辑结果
      if (hasUnappliedResults()) {
        if (!confirmAbandonResults("切换到裁剪模式")) {
          // 用户取消，恢复原来的选择
          e.target.value = "region";
          return;
        }
      }
      
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
      // 检查是否有未应用的编辑结果
      if (hasUnappliedResults()) {
        if (!confirmAbandonResults("重新选取区域")) {
          return; // 用户取消，不执行重新选取
        }
      }
      
      // 保存当前原图URL（resetRegionEditState会清空它）
      const preservedOriginalUrl = currentOriginalImage || regionEditState.originalImageUrl || img.src;
      
      // ✅ 使用resetRegionEditState()完整重置所有状态，包括编辑历史
      resetRegionEditState();
      
      // ✅ 恢复保存的原图URL
      regionEditState.originalImageUrl = preservedOriginalUrl;
      currentOriginalImage = preservedOriginalUrl;
      
      // 重新选取后保持选区编辑模式启用状态
      regionEditState.enabled = true;
      regionEditStep = 0;
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
    
    // ✅ 换脸默认不融合
    const seamlessMethod = document.getElementById("seamlessMethod");
    if (seamlessMethod) {
      seamlessMethod.value = "none";
      seamlessMethod.dispatchEvent(new Event("change"));
    }
    
    const modal = new bootstrap.Modal(document.getElementById("regionEditModal"));
    modal.show();
  });

  // 编辑类型切换
  document.querySelectorAll('input[name="regionEditType"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      const isFaceSwap = e.target.value === "face_swap";
      document.getElementById("regionFaceSwapSection").style.display = isFaceSwap ? "block" : "none";
      document.getElementById("regionImg2ImgSection").style.display = isFaceSwap ? "none" : "block";
      
      // ✅ 根据编辑类型设置默认融合方式
      const seamlessMethod = document.getElementById("seamlessMethod");
      if (seamlessMethod) {
        if (isFaceSwap) {
          // 换脸：默认不融合
          seamlessMethod.value = "none";
        } else {
          // 图生图：默认泊松融合
          seamlessMethod.value = "poisson_normal";
        }
        // 触发change事件更新UI
        seamlessMethod.dispatchEvent(new Event("change"));
      }
    });
  });

  // 颜色匹配开关切换
  document.getElementById("enableColorMatch")?.addEventListener("change", (e) => {
    const enabled = e.target.checked;
    document.getElementById("colorMatchMethodSection").style.display = enabled ? "block" : "none";
  });

  // 边界融合方法切换
  document.getElementById("seamlessMethod")?.addEventListener("change", (e) => {
    const method = e.target.value;
    const isFeather = method === "feather";
    document.getElementById("featherRadiusSection").style.display = isFeather ? "block" : "none";
  });

  // 羽化半径滑块
  document.getElementById("featherRadius")?.addEventListener("input", (e) => {
    document.getElementById("featherRadiusValue").textContent = e.target.value;
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

      // 构建完整的参数信息（用于重跑和编辑）
      let params = {};
      if (editType === "face_swap") {
        const selectedFace = document.querySelector(".region-face-option.selected");
        params = {
          face_url: selectedFace ? selectedFace.dataset.url : null,
        };
      } else {
        params = {
          prompt: document.getElementById("regionImg2ImgPrompt")?.value || "",
          extra_image_urls: regionEditExtraImages.map(img => img.url),
          extra_images: regionEditExtraImages,  // 完整信息用于编辑时恢复
        };
      }
      
      // 检查是否是编辑模式
      const editingIdx = window.__editingResultIndex;
      if (editingIdx !== undefined && editingIdx >= 0 && editingIdx < regionEditResults.length) {
        // 编辑模式：更新原结果
        regionEditResults[editingIdx] = {
          url: result.local_path,
          type: editType,
          width: result.width,
          height: result.height,
          params: params,
          edited: true,  // 标记为已编辑
        };
        delete window.__editingResultIndex;
        
        renderRegionEditResults();
        showRegionEditResult(editingIdx);
        showToast("编辑完成", "success");
      } else {
        // 新建模式：添加新结果
        regionEditResults.push({
          url: result.local_path,
          type: editType,
          width: result.width,
          height: result.height,
          params: params,
        });
        
        renderRegionEditResults();
        showRegionEditResult(regionEditResults.length - 1);
        showToast(editType === "face_swap" ? "换脸完成" : "图生图完成", "success");
      }
      
      document.getElementById("applyRegionEditBtn").disabled = false;
      document.getElementById("saveCroppedImagesBtn").disabled = false;
      
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
      let resultWidth = result.width || regionEditState.width * cropState.imgWidth;
      let resultHeight = result.height || regionEditState.height * cropState.imgHeight;
      
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
        console.log("[Color Match] 参考选区:", {
          x: regionEditState.x,
          y: regionEditState.y,
          width: regionEditState.width,
          height: regionEditState.height,
        });
        
        const resp = await fetch("/color-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_url: result.url,
            ref_url: originalUrl,
            region: {
              x: regionEditState.x,
              y: regionEditState.y,
              width: regionEditState.width,
              height: regionEditState.height,
            },
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
      
      // ✅ 获取边界融合设置
      const seamlessMethod = document.getElementById("seamlessMethod")?.value || "poisson_normal";
      const featherRadius = parseInt(document.getElementById("featherRadius")?.value || "10");
      
      // ✅ 使用原始大图作为合成基础（不是当前 canvas 显示的内容）
      const originalUrl = currentOriginalImage || regionEditState.originalImageUrl;
      if (!originalUrl) {
        throw new Error("无法获取原图URL");
      }
      
      // 计算选区在原图中的位置（像素坐标）
      const cropX = regionEditState.x * cropState.imgWidth;
      const cropY = regionEditState.y * cropState.imgHeight;
      
      let finalImageUrl;
      
      // 如果选择了融合方法，调用后端 API
      if (seamlessMethod !== "none") {
        document.getElementById("fullscreenMask").querySelector("div > div").innerHTML = 
          '<div class="spinner-border text-light mb-2" role="status"></div><div>正在进行边界融合...</div>';
        
        console.log("[Seamless Clone] 调用边界融合 API:", {
          method: seamlessMethod,
          featherRadius: seamlessMethod === "feather" ? featherRadius : undefined,
          x: Math.round(cropX),
          y: Math.round(cropY),
        });
        
        const resp = await fetch("/seamless-clone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_url: finalResultUrl,
            target_url: originalUrl,
            x: Math.round(cropX),
            y: Math.round(cropY),
            method: seamlessMethod,
            feather_radius: featherRadius,
            film_id: filmId,
          }),
        });
        
        const data = await resp.json();
        if (!data.success) {
          throw new Error(data.error || "边界融合失败");
        }
        
        finalImageUrl = data.local_path;
        console.log("[Seamless Clone] 融合完成:", data.method);
        
      } else {
        // 不融合，使用前端合成（直接覆盖）
        console.log("[Apply] 不使用融合，直接覆盖");
        
        // 创建临时 canvas 来合成图片
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");
        
        tempCanvas.width = cropState.imgWidth;
        tempCanvas.height = cropState.imgHeight;
        
        // 先绘制原始大图
        const originalImg = new Image();
        originalImg.crossOrigin = "anonymous";
        
        await new Promise((resolve, reject) => {
          originalImg.onload = resolve;
          originalImg.onerror = reject;
          originalImg.src = originalUrl;
        });
        
        tempCtx.drawImage(originalImg, 0, 0);
        
        // 载入编辑结果（选区小图）并合成到对应位置
        const resultImg = new Image();
        resultImg.crossOrigin = "anonymous";
        
        await new Promise((resolve, reject) => {
          resultImg.onload = resolve;
          resultImg.onerror = reject;
          resultImg.src = finalResultUrl;
        });
        
        // 将选区小图贴到对应位置
        tempCtx.drawImage(resultImg, cropX, cropY);
        
        finalImageUrl = tempCanvas.toDataURL("image/jpeg", 0.92);
      }
      
      // 更新主图片
      img.src = finalImageUrl;
      
      // 构建成功提示
      let successMsg = "已应用编辑结果";
      if (enableColorMatch) successMsg += "（颜色匹配）";
      if (seamlessMethod !== "none") {
        const methodNames = {
          "feather": "羽化边缘",
          "poisson_normal": "泊松融合",
          "poisson_mixed": "泊松混合"
        };
        successMsg += enableColorMatch ? " + " : "（";
        successMsg += methodNames[seamlessMethod] + "）";
      }
      showToast(successMsg, "success");
      
      // ✅ 应用成功后清空编辑记录，避免重复提示"未应用"
      regionEditResults = [];
      currentResultIndex = -1;
      renderRegionEditResults();
      
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
