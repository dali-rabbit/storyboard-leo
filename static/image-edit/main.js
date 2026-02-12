// image-edit/main.js
// 图片编辑模块入口 - 拖拽上传功能

(function() {
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

    // 检查区域编辑状态：如果有未应用的编辑结果，提示用户
    if (typeof regionEditResults !== 'undefined' && regionEditResults.length > 0) {
      const count = regionEditResults.length;
      if (!confirm(`当前区域有 ${count} 个编辑结果未应用。\n\n拖入新图片将丢失这些结果。\n\n是否继续？`)) {
        return; // 用户取消
      }
      // 用户确认，清空编辑结果
      regionEditResults = [];
      currentResultIndex = -1;
      if (typeof renderRegionEditResults === 'function') {
        renderRegionEditResults();
      }
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
      
      // 如果当前是区域编辑模式，重置状态
      if (regionEditState && regionEditState.enabled) {
        resetRegionEditState();
        regionEditState.originalImageUrl = url;
        currentOriginalImage = url;
        regionEditState.enabled = true;
      }
    };
    reader.readAsDataURL(file);
  });

  // 清空画布功能
  document.getElementById("clearCanvasBtn")?.addEventListener("click", () => {
    // 确认对话框
    if (!confirm("确定要清空画布吗？这将清除所有编辑内容和选区。")) {
      return;
    }
    
    // 清空图片
    img.src = "";
    
    // 重置裁剪状态
    cropState.enabled = false;
    cropState.imgWidth = 0;
    cropState.imgHeight = 0;
    
    // 重置区域编辑状态（如果函数存在）
    if (typeof resetRegionEditState === "function") {
      resetRegionEditState();
    }
    
    // 显示占位提示
    const placeholder = document.getElementById("imageEditPlaceholder");
    if (placeholder) {
      placeholder.classList.add("d-flex");
      placeholder.style.display = "flex";
    }
    
    // 禁用相关按钮
    document.getElementById("cropToQuadrantsBtn").disabled = true;
    document.getElementById("startRegionEditBtn").disabled = true;
    document.getElementById("regionEditActionBtn")?.classList.add("d-none");
    document.getElementById("saveCroppedImagesBtn").disabled = true;
    
    // 清除画布
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    showToast("画布已清空", "info");
  });
})();
