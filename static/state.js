// state.js

// 全局提示函数
// delay: 自动关闭延迟（毫秒），默认 3000ms，0 表示不自动关闭
function showToast(message, type = "info", delay = 3000) {
  // type: 'success', 'error', 'warning', 'info'
  const colors = {
    success: "#28a745",
    error: "#dc3545",
    warning: "#fd7e14",
    info: "#17a2b8",
  };
  const bgColor = colors[type] || "blue";

  const toastId = "toast-" + Date.now();
  const toastHtml = `
    <div id="${toastId}" class="toast align-items-center text-white border-0 mb-2" role="alert" style="background-color: ${bgColor}; min-width: 250px; max-width: 400px; pointer-events: auto;">
      <div class="d-flex">
        <div class="toast-body" style="word-break: break-word; overflow-wrap: break-word; max-width: 330px;">
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto flex-shrink-0" data-bs-dismiss="toast" aria-label="Close" style="min-width: 16px;"></button>
      </div>
    </div>
  `;

  const container = document.getElementById("globalToastContainer");
  container.insertAdjacentHTML("beforeend", toastHtml);

  const toastEl = document.getElementById(toastId);
  let toast = null;
  if (delay == 0) {
    toast = new bootstrap.Toast(toastEl, {
      autohide: false,
    });
  } else if (delay > 0) {
    toast = new bootstrap.Toast(toastEl, {
      autohide: true,
      delay: delay,
    });
  }

  toast.show();

  // 自动清理已隐藏的 toast
  toastEl.addEventListener("hidden.bs.toast", () => {
    toastEl.remove();
  });
}

window.AIImageState = (function () {
  let uploadedImageUrls = [];
  let uploadedLocalPaths = [];

  return {
    getUploadedUrls() {
      return [...uploadedImageUrls];
    },
    getLocalPaths() {
      return [...uploadedLocalPaths];
    },
    setUploadedUrls(urls) {
      uploadedImageUrls = [...urls];
    },
    setLocalPaths(paths) {
      uploadedLocalPaths = [...paths];
    },
    addUploadedFiles(urls, localPaths) {
      uploadedImageUrls.push(...urls);
      uploadedLocalPaths.push(...localPaths);
    },
    removeAtIndex(index) {
      uploadedImageUrls.splice(index, 1);
      uploadedLocalPaths.splice(index, 1);
    },
    swapIndices(i, j) {
      if (
        i < 0 ||
        j < 0 ||
        i >= uploadedImageUrls.length ||
        j >= uploadedImageUrls.length
      )
        return;
      [uploadedImageUrls[i], uploadedImageUrls[j]] = [
        uploadedImageUrls[j],
        uploadedImageUrls[i],
      ];
      [uploadedLocalPaths[i], uploadedLocalPaths[j]] = [
        uploadedLocalPaths[j],
        uploadedLocalPaths[i],
      ];
    },
    clear() {
      uploadedImageUrls = [];
      uploadedLocalPaths = [];
    },
    getCount() {
      return uploadedLocalPaths.length;
    },
    setFromUrls: function (urls, paths) {
      uploadedImageUrls = [...urls];
      uploadedLocalPaths = [...paths]; // mock 文件名
    },
    addFromQuickAccess(localPath, remoteUrl) {
      const exists =
        uploadedLocalPaths.includes(localPath) ||
        uploadedImageUrls.includes(remoteUrl);
      if (exists) return false;
      if (uploadedLocalPaths.length >= 10) return false;
      uploadedLocalPaths.push(localPath);
      uploadedImageUrls.push(remoteUrl);
      return true;
    },
  };
})();
