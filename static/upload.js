// upload.js
(function () {
  const state = window.AIImageState;

  // ===== 工具函数：PNG 转 JPG =====
  async function convertPngToJpg(file) {
    if (!file.type.includes("png")) return file;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(
            (blob) =>
              resolve(
                new File([blob], file.name.replace(/\.png$/i, ".jpg"), {
                  type: "image/jpeg",
                }),
              ),
            "image/jpeg",
            0.92,
          );
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ===== 渲染预览 =====
  function renderUploadPreview() {
    const $ul = $("#uploadPreview").empty();
    const localPaths = state.getLocalPaths();
    localPaths.forEach((url, index) => {
      const $li = $(`
                <li class="upload-item" data-index="${index}">
                    <img src="${url}" />
                    <div class="remove-btn">×</div>
                    <div class="image-label">图${index + 1}</div>
                </li>
            `);
      $ul.append($li);
    });

    // 删除
    $(".remove-btn")
      .off("click")
      .on("click", function (e) {
        e.stopPropagation();
        const index = parseInt(
          $(this).closest(".upload-item").attr("data-index"),
        );
        state.removeAtIndex(index);
        renderUploadPreview();
      });

    // 拖拽
    enableDragSort();
  }

  // ===== 拖拽排序 =====
  function enableDragSort() {
    const items = document.querySelectorAll(".upload-item");
    let dragSrcEl = null;

    items.forEach((item) => {
      item.setAttribute("draggable", true);

      item.addEventListener("dragstart", () => {
        dragSrcEl = item;
        item.classList.add("dragging");
        document
          .querySelectorAll(".image-label")
          .forEach((el) => (el.style.display = "none"));
      });

      item.addEventListener("dragover", (e) => e.preventDefault());

      item.addEventListener("dragenter", () => {
        if (item !== dragSrcEl) item.style.opacity = "0.4";
      });

      item.addEventListener("dragleave", () => {
        item.style.opacity = "";
      });

      item.addEventListener("drop", () => {
        const target = item;
        if (target && target !== dragSrcEl) {
          const srcIndex = parseInt(dragSrcEl.getAttribute("data-index"));
          const targetIndex = parseInt(target.getAttribute("data-index"));
          state.swapIndices(srcIndex, targetIndex);
          renderUploadPreview();
        }
      });

      item.addEventListener("dragend", () => {
        items.forEach((el) => {
          el.classList.remove("dragging");
          el.style.opacity = "";
        });
        document
          .querySelectorAll(".image-label")
          .forEach((el) => (el.style.display = ""));
      });
    });
  }

  // ===== 上传处理 =====
  async function handleFileUpload(files) {
    if (state.getCount() >= 10) {
      alert("最多只能上传 10 张图片！");
      return;
    }
    if (state.getCount() + files.length > 10) {
      alert("最多只能上传 10 张图片！");
      files = files.slice(0, 10 - state.getCount());
    }
    files = files.filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;

    $("#dropZone").hide();
    const $progress = $("#uploadProgress")
      .show()
      .find(".progress-bar")
      .width("0%")
      .end();

    const convertedFiles = [];
    for (const file of files) {
      convertedFiles.push(await convertPngToJpg(file));
    }

    const formData = new FormData();
    convertedFiles.forEach((f) => formData.append("images", f));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/upload-images", true);
    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) {
        $progress.find(".progress-bar").width((e.loaded / e.total) * 100 + "%");
      }
    };
    xhr.onload = function () {
      $progress.hide();
      $("#dropZone").show();
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        state.addUploadedFiles(res.urls || [], res.local_paths || []);
        renderUploadPreview();
      } else {
        alert("上传失败");
      }
    };
    xhr.onerror = function () {
      $progress.hide();
      $("#dropZone").show();
      alert("上传请求失败");
    };
    xhr.send(formData);
  }

  // ===== 初始化 =====
  $(document).ready(function () {
    const $dropZone = $("#dropZone");
    const $fileInput = $("#imageUpload");

    $dropZone.on("click", () => {
      if ($("#uploadProgress").is(":visible")) return;
      $fileInput.trigger("click");
    });

    $dropZone.on("dragover dragenter", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if ($("#uploadProgress").is(":visible")) return;
      $dropZone.css("border-color", "#6a5acd");
    });

    $dropZone.on("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if ($("#uploadProgress").is(":visible")) return;
      $dropZone.css("border-color", "#555");
    });

    $dropZone.on("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if ($("#uploadProgress").is(":visible")) return;
      $dropZone.css("border-color", "#555");
      const files = e.originalEvent.dataTransfer.files;
      if (files && files.length > 0) handleFileUpload(Array.from(files));
    });

    $fileInput.on("change", function (e) {
      const files = Array.from(e.target.files);
      if (files.length > 0) handleFileUpload(files);
      this.value = "";
    });

    renderUploadPreview(); // 初始渲染
  });

  // 暴露给其他模块（如需要手动刷新）
  window.UploadModule = { renderPreview: renderUploadPreview };
})();
