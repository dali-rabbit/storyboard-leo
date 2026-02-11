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
})();
