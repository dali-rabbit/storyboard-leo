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
})();
