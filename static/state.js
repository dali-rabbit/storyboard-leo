// state.js

// 全局提示函数
function showToast(message, type = "info", delay = 0) {
  // type: 'success', 'error', 'warning', 'info'
  const colors = {
    success: "green",
    error: "red",
    warning: "orange",
    info: "blue",
  };
  const bgColor = colors[type] || "blue";

  const toastId = "toast-" + Date.now();
  const toastHtml = `
    <div id="${toastId}" class="toast align-items-center text-white border-0 mb-2" role="alert" style="background-color: ${bgColor}; min-width: 250px; pointer-events: auto;">
      <div class="d-flex">
        <div class="toast-body">
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
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
