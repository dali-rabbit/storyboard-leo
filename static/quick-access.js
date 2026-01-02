// static/quick-access.js
window.QuickAccess = (function () {
  const STORAGE_KEY = "quickAccessImages";
  let images = [];
  let currentFilter = "all"; // "all", "角色", "场景"

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      images = saved ? JSON.parse(saved) : [];
      images.forEach((img) => {
        if (!img.tag) img.tag = "全部";
        if (!img.title) img.title = ""; // ← 新增：默认无标题
      });
    } catch (e) {
      images = [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
  }

  async function addImage({ localPath, remoteUrl }) {
    console.log([localPath, remoteUrl]);
    if (!localPath && !remoteUrl) return;

    const exists = images.some(
      (img) =>
        (img.remoteUrl === remoteUrl && remoteUrl) ||
        (img.localPath === localPath && localPath),
    );
    if (exists) return;

    let usableLocal = localPath;
    let usableRemote = remoteUrl;
    if (usableRemote && !usableRemote.startsWith("https://i.ibb.co")) {
      usableRemote = null;
    }

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

    images.push({
      localPath: usableLocal,
      remoteUrl: usableRemote,
      addedAt: new Date().toISOString(),
      tag: "全部",
      title: "", // ← 新增
    });
    save();
    renderSidebar();
  }

  function setTitle(index, newTitle) {
    if (images[index]) {
      images[index].title = (newTitle || "").trim();
      save();
      renderSidebar();
    }
  }

  function setTag(index, newTag) {
    if (images[index]) {
      images[index].tag = newTag;
      save();
      renderSidebar();
    }
  }

  function removeImage(index) {
    images.splice(index, 1);
    save();
    renderSidebar();
  }

  function setFilter(filter) {
    currentFilter = filter;
    renderSidebar();
  }

  function renderSidebar() {
    const $sidebar = $("#quickSidebar");
    // 若侧边栏收起，清除内容（避免 DOM 残留）
    if ($sidebar.hasClass("collapsed")) {
      $sidebar.find(".quick-images").remove();
      $sidebar.find(".quick-filter").remove();
      return;
    }

    // 渲染顶部过滤器
    let $filter = $sidebar.find(".quick-filter");
    if ($filter.length === 0) {
      $filter = $(`
        <div class="quick-filter d-flex gap-2 mb-2">
          <button type="button" class="btn btn-sm btn-outline-secondary filter-btn" data-filter="all">全部</button>
          <button type="button" class="btn btn-sm btn-outline-secondary filter-btn" data-filter="角色">角色</button>
          <button type="button" class="btn btn-sm btn-outline-secondary filter-btn" data-filter="场景">场景</button>
        </div>
      `);
      $sidebar.append($filter);

      $filter.on("click", ".filter-btn", function () {
        const filter = $(this).data("filter");
        setFilter(filter);
        $filter.find(".filter-btn").removeClass("active");
        $(this).addClass("active");
      });

      // 初始化激活状态
      $filter
        .find(`.filter-btn[data-filter="${currentFilter}"]`)
        .addClass("active");
    }

    // 渲染图片容器
    let $container = $sidebar.find(".quick-images");
    if ($container.length === 0) {
      $container = $(`
        <div class="quick-images mt-2 d-flex flex-wrap gap-2" style="justify-content: flex-start;"></div>
      `);
      $sidebar.append($container);
    }

    // 过滤图片
    const filteredImages =
      currentFilter === "all"
        ? images
        : images.filter((img) => img.tag === currentFilter);

    let html = "";
    filteredImages.forEach((img, i) => {
      const originalIndex = images.findIndex(
        (item) =>
          item.localPath === img.localPath && item.remoteUrl === img.remoteUrl,
      );

      // 标题显示（有标题才显示文字）
      const titleDisplay = img.title
        ? `<div class="quick-img-title text-center small text-white bg-black bg-opacity-50 px-1" style="position:absolute;bottom:0;left:0;right:0;">${img.title}</div>`
        : "";

      html += `
        <div class="quick-img-item position-relative border rounded d-flex justify-content-center align-items-center"
             style="width:100px;height:100px;cursor:pointer;" title="${img.title || "点击加入参考图"}">
          <img src="${img.localPath || img.remoteUrl}" style="width:100%;height:100%;object-fit:cover;">
          ${titleDisplay}
          <div class="dropdown" style="position:absolute;top:-8px;right:-8px;">
            <button class="btn btn-sm btn-dark dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="width:20px;height:20px;padding:0;font-size:10px;line-height:1;">
              ⋮
            </button>
            <ul class="dropdown-menu p-1" style="font-size:12px;">
              <li><a class="dropdown-item quick-tag-btn" href="#" data-index="${originalIndex}" data-tag="角色">角色</a></li>
              <li><a class="dropdown-item quick-tag-btn" href="#" data-index="${originalIndex}" data-tag="场景">场景</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item quick-title-btn" href="#" data-index="${originalIndex}">设置标题</a></li>
              <li><a class="dropdown-item text-danger quick-delete-btn" href="#" data-index="${originalIndex}">删除</a></li>
            </ul>
          </div>
        </div>
      `;
    });

    $container.html(html);

    // 重新绑定事件（使用事件委托）
    $container.off("click").on("click", ".quick-img-item", function (e) {
      if ($(e.target).closest(".dropdown").length) return;
      const $item = $(this);
      const $img = $item.find("img");
      const src = $img.attr("src");
      const img = images.find((i) => (i.localPath || i.remoteUrl) === src);
      if (img && window.AIImageState?.addFromQuickAccess) {
        const success = window.AIImageState.addFromQuickAccess(
          img.localPath,
          img.remoteUrl,
        );
        if (success && window.UploadModule?.renderPreview) {
          window.UploadModule.renderPreview();
        }
      }
    });

    // 标签设置
    $container
      .off("click", ".quick-tag-btn")
      .on("click", ".quick-tag-btn", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const index = $(this).data("index");
        const tag = $(this).data("tag");
        setTag(index, tag);
      });

    // 设置标题
    $container
      .off("click", ".quick-title-btn")
      .on("click", ".quick-title-btn", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const index = $(this).data("index");
        const currentTitle = images[index]?.title || "";
        const newTitle = prompt("请输入图片标题：", currentTitle);
        if (newTitle !== null) {
          // 用户点击“取消”返回 null，不保存
          setTitle(index, newTitle);
        }
      });

    // 删除
    $container
      .off("click", ".quick-delete-btn")
      .on("click", ".quick-delete-btn", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const index = $(this).data("index");
        removeImage(index);
      });

    // 初始化 Bootstrap dropdown（如果未自动初始化）
    if (typeof bootstrap !== "undefined" && bootstrap.Dropdown) {
      $container.find('[data-bs-toggle="dropdown"]').each(function () {
        new bootstrap.Dropdown(this);
      });
    }
  }

  load();
  return {
    addImage,
    renderSidebar,
    getImages: () => [...images],
  };
})();
