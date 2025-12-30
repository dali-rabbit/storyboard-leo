// static/quick-access.js
window.QuickAccess = (function () {
  const STORAGE_KEY = "quickAccessImages";
  let images = [];

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      images = saved ? JSON.parse(saved) : [];
    } catch (e) {
      images = [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
  }

  // 暴露给外部调用：添加图片（自动处理路径）
  async function addImage({ localPath, remoteUrl }) {
    console.log([localPath, remoteUrl]);
    if (!localPath && !remoteUrl) return;

    // 去重（按 remoteUrl 或 localPath）
    const exists = images.some(
      (img) =>
        (img.remoteUrl === remoteUrl && remoteUrl) ||
        (img.localPath === localPath && localPath),
    );
    if (exists) return;
    console.log([localPath, remoteUrl]);

    let usableLocal = localPath;
    let usableRemote = remoteUrl;
    if (!usableRemote.startsWith("https://i.ibb.co")) {
      usableRemote = null;
    }

    // 情况1：只有本地路径 → 上传到 ImgBB
    if (usableLocal && !usableRemote) {
      try {
        const resp = await fetch(usableLocal);
        const blob = await resp.blob();
        const formData = new FormData();
        formData.append("file", blob, "quick.jpg");
        const uploadRes = await fetch("/quick-upload", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const data = await uploadRes.json();
          usableRemote = data.url;
          // 更新 localPath 为标准化路径（以防相对路径问题）
          usableLocal = data.local_path || usableLocal;
        } else {
          alert("上传至快捷访问失败");
          return;
        }
      } catch (e) {
        console.error("QuickAccess upload error:", e);
        alert("上传失败，请重试");
        return;
      }
    }

    // 情况2：只有远程 URL 且是 imgbb → 保留
    // 情况3：远程 URL 非 imgbb → 暂不支持（你可后续扩展）

    images.push({
      localPath: usableLocal,
      remoteUrl: usableRemote,
      addedAt: new Date().toISOString(),
    });
    save();
    renderSidebar();
  }

  // 渲染侧边栏（仅在展开时显示图片）
  function renderSidebar() {
    const $sidebar = $("#quickSidebar");
    if ($sidebar.hasClass("collapsed")) return;

    const $container = $sidebar.find(".quick-images");
    if ($container.length === 0) {
      // 使用 flex 横向布局容器，并加间隙
      const $div = $(`
        <div class="quick-images mt-2 d-flex flex-wrap gap-2" style="justify-content: flex-start;"></div>
      `);
      $sidebar.append($div);
    }

    let html = "";
    images.forEach((img, i) => {
      html += `
        <div class="quick-img-item position-relative border rounded d-flex justify-content-center align-items-center"
             style="width:100px;height:100px;cursor:pointer;" title="点击加入参考图">
          <img src="${img.localPath || img.remoteUrl}" style="width:100%;height:100%;object-fit:cover;">
          <button type="button" class="btn-remove btn btn-sm btn-danger position-absolute"
                  style="top: -8px; right: -8px; width: 20px; height: 20px; padding: 0; font-size: 12px; line-height: 1;">
            &times;
          </button>
        </div>
      `;
    });
    $sidebar.find(".quick-images").html(html);

    // 绑定“点击加入参考图”事件
    $sidebar
      .find(".quick-img-item")
      .off("click")
      .on("click", function (e) {
        if ($(e.target).hasClass("btn-remove")) return;

        const index = $(this).index();
        const img = images[index];
        if (!img) return;

        const success = window.AIImageState?.addFromQuickAccess(
          img.localPath,
          img.remoteUrl,
        );
        if (!success) {
          // 可选：提示用户（比如已达上限或已存在）
          // 例如：Bootstrap Toast 或 alert
          // alert("无法添加：已达10张上限或图片已存在");
        } else {
          // 刷新上传预览区
          if (window.UploadModule?.renderPreview) {
            window.UploadModule.renderPreview();
          }
        }
      });

    // 绑定“删除”事件
    $sidebar
      .find(".btn-remove")
      .off("click")
      .on("click", function (e) {
        e.stopPropagation();
        const $item = $(this).closest(".quick-img-item");
        const index = $item.index();
        images.splice(index, 1);
        save();
        renderSidebar(); // 重新渲染
      });
  }

  // 初始化
  load();
  return { addImage, renderSidebar, getImages: () => [...images] };
})();
