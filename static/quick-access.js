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
        // 迁移老数据
        if (img.tag && img.tag !== "全部") {
          // 老 tag → category
          img.category = img.tag;
          img.group = img.title || img.tag;
          delete img.tag;
          delete img.title;
        } else if (!img.category) {
          // 未分类：把 title 作为 group
          img.category = null;
          img.group = img.title || "";
          delete img.tag;
          delete img.title;
        }
        if (!img.addedAt) img.addedAt = new Date().toISOString();
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
    if (usableRemote && !usableRemote.startsWith("https://")) {
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

  // ===== 新增：显示添加/编辑弹窗 =====
  function showAddQuickAccessModal(imgData = null) {
    // imgData 用于编辑已有项
    const isEditing = !!imgData;
    const category = imgData?.category || "none";
    const group = imgData?.group || "";
    const viewType = imgData?.viewType || "";
    const note = imgData?.note || "";

    const modalId = "quickAccessDetailModal";
    let html = `
    <div class="modal fade" id="${modalId}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content bg-dark text-light">
          <div class="modal-header">
            <h5 class="modal-title">${isEditing ? "图片信息" : "图片信息"}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <!-- 分类选择 -->
            <div class="mb-3">
              <label class="form-label">分类</label>
              <div class="form-check">
                <input class="form-check-input" type="radio" name="qaCategory" id="qaNone" value="none" ${category === "none" ? "checked" : ""}>
                <label class="form-check-label" for="qaNone">不分类</label>
              </div>
              <div class="form-check">
                <input class="form-check-input" type="radio" name="qaCategory" id="qaChar" value="角色" ${category === "角色" ? "checked" : ""}>
                <label class="form-check-label" for="qaChar">角色</label>
              </div>
              <div class="form-check">
                <input class="form-check-input" type="radio" name="qaCategory" id="qaScene" value="场景" ${category === "场景" ? "checked" : ""}>
                <label class="form-check-label" for="qaScene">场景</label>
              </div>
            </div>

            <!-- 动态字段容器 -->
            <div id="qaDynamicFields"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" id="qaSaveBtn">${isEditing ? "保存" : "添加"}</button>
          </div>
        </div>
      </div>
    </div>
    `;
    // 替换原初始化代码
    $("#quickAccessWindow").append(html);

    const modalEl = document.getElementById(modalId);
    if (!modalEl) {
      console.log("not modal");
      return;
    }

    // ✅ 关键修复：通过 data attribute 设置 backdrop
    modalEl.setAttribute("data-bs-backdrop", "false");
    modalEl.setAttribute("data-bs-keyboard", "true"); // 可选

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // 动态渲染字段
    function renderDynamicFields() {
      const cat = $('input[name="qaCategory"]:checked').val();
      let fieldsHtml = "";

      if (cat === "none") {
        fieldsHtml = `
          <div class="mb-3">
            <label class="form-label">标题</label>
            <input type="text" class="form-control" id="qaTitle" value="${group}">
          </div>
        `;
      } else {
        // 收集已有的 group 名字（去重）
        const existingGroups = [
          ...new Set(
            images
              .filter((img) => img.category === cat)
              .map((img) => img.group)
              .filter((g) => g && typeof g === "string"),
          ),
        ].sort();

        // 构建选项
        let optionsHtml = `<option value="">（请选择或输入新名字）</option>`;
        existingGroups.forEach((g) => {
          const selected = g === group ? "selected" : "";
          optionsHtml += `<option value="${g}" ${selected}>${g}</option>`;
        });
        optionsHtml += `<option value="__new__" ${group && !existingGroups.includes(group) ? "selected" : ""}>其他（请输入）…</option>`;

        const label = cat === "角色" ? "角色名字" : "场景名字";
        fieldsHtml += `
          <div class="mb-3">
            <label class="form-label">${label}</label>
            <select class="form-select" id="qaGroupSelect">
              ${optionsHtml}
            </select>
            <input type="text" class="form-control mt-1 d-none" id="qaGroupInput" placeholder="输入新名字…" value="${group && !existingGroups.includes(group) ? group : ""}">
          </div>
        `;

        // 视角下拉
        const charViews = [
          { value: "front_full", label: "正面全身" },
          { value: "side_full", label: "侧面全身" },
          { value: "back_full", label: "背面全身" },
          { value: "face_closeup", label: "面部特写" },
        ];
        const sceneViews = [
          { value: "wide_shot", label: "全景" },
          { value: "medium_shot", label: "近景" },
          { value: "birdseye", label: "俯视" },
          { value: "wormseye", label: "仰视" },
        ];
        const views = cat === "角色" ? charViews : sceneViews;
        fieldsHtml += `
          <div class="mb-3">
            <label class="form-label">视角</label>
            <select class="form-select" id="qaViewType">
              <option value="">（可选）</option>
              ${views.map((v) => `<option value="${v.value}" ${viewType === v.value ? "selected" : ""}>${v.label}</option>`).join("")}
            </select>
          </div>
        `;

        // 备注
        fieldsHtml += `
          <div class="mb-3">
            <label class="form-label">备注（可选）</label>
            <input type="text" class="form-control" id="qaNote" placeholder="如：校服、雨天" value="${note}">
          </div>
        `;
      }

      $("#qaDynamicFields").html(fieldsHtml);

      // 切换“其他…”时显示输入框
      $("#qaGroupSelect")
        .off("change")
        .on("change", function () {
          const val = $(this).val();
          if (val === "__new__") {
            $("#qaGroupInput").removeClass("d-none").focus();
          } else {
            $("#qaGroupInput").addClass("d-none");
          }
        });
    }

    // 初始渲染
    renderDynamicFields();
    $('input[name="qaCategory"]').on("change", renderDynamicFields);

    // 保存逻辑
    $("#qaSaveBtn").on("click", async () => {
      const cat = $('input[name="qaCategory"]:checked').val();
      let newImage = null;
      if (cat === "none") {
        const title = $("#qaTitle").val().trim();
        if (!title) {
          showToast("标题不能为空", "warning");
          return;
        }
        newImage = {
          category: null,
          group: title, // 老 title 兼容字段
          viewType: null,
          note: null,
          ...(imgData
            ? {
                localPath: imgData.localPath,
                remoteUrl: imgData.remoteUrl,
                addedAt: imgData.addedAt,
              }
            : {}),
        };
      } else {
        let group;
        const selectVal = $("#qaGroupSelect").val();
        if (selectVal === "__new__") {
          group = $("#qaGroupInput").val().trim();
        } else {
          group = selectVal;
        }
        if (!group) {
          showToast(`${cat}名字不能为空`, "warning");
          return;
        }
        newImage = {
          category: cat,
          group: group,
          viewType: $("#qaViewType").val() || null,
          note: $("#qaNote").val().trim() || null,
          ...(imgData
            ? {
                localPath: imgData.localPath,
                remoteUrl: imgData.remoteUrl,
                addedAt: imgData.addedAt,
              }
            : {}),
        };
      }

      if (!isEditing) {
        // 新增：需传入图片路径
        if (!window.__currentQuickAddImage) {
          showToast("图片信息缺失", "error");
          return;
        }
        newImage.localPath = window.__currentQuickAddImage.localPath;
        newImage.remoteUrl = window.__currentQuickAddImage.remoteUrl;
        newImage.addedAt = new Date().toISOString();
        images.push(newImage);
      } else {
        // 编辑：替换原数据
        const idx = images.findIndex(
          (i) =>
            i.localPath === imgData.localPath &&
            i.remoteUrl === imgData.remoteUrl,
        );
        if (idx !== -1) images[idx] = newImage;
      }

      save();
      renderSidebar();
      modal.hide();
    });

    // 删除（仅编辑时）
    if (isEditing) {
      $("#qaDeleteBtn").on("click", () => {
        if (confirm("确定删除？")) {
          const idx = images.findIndex(
            (i) =>
              i.localPath === imgData.localPath &&
              i.remoteUrl === imgData.remoteUrl,
          );
          if (idx !== -1) images.splice(idx, 1);
          save();
          renderSidebar();
          modal.hide();
        }
      });
    }

    // 自动清理
    $(`#${modalId}`).on("hidden.bs.modal", () => $(`#${modalId}`).remove());
  }

  // 辅助函数
  function getViewTypeLabel(key) {
    const map = {
      front_full: "正面全身",
      side_full: "侧面全身",
      back_full: "背面全身",
      face_closeup: "面部特写",
      wide_shot: "全景",
      medium_shot: "近景",
      birdseye: "俯视",
      wormseye: "仰视",
    };
    return map[key] || "";
  }

  function buildQuickImgItem(img, title) {
    const originalIndex = images.findIndex(
      (i) => i.localPath === img.localPath && i.remoteUrl === img.remoteUrl,
    );
    const titleDisplay = title
      ? `<div class="quick-img-title text-center small text-white bg-black bg-opacity-50 px-1" style="position:absolute;bottom:0;left:0;right:0;">${title}</div>`
      : "";
    return `
    <div class="quick-img-item position-relative border rounded d-flex justify-content-center align-items-center"
         style="width:120px;height:120px;cursor:pointer;" title="${title || "点击加入参考图"}">
      <img draggable="true" src="${img.localPath || img.remoteUrl}" style="width:100%;height:100%;object-fit:contain;">
      ${titleDisplay}
      <div class="dropdown" style="position:absolute;top:-8px;right:-8px;">
        <button class="btn btn-sm btn-dark dropdown-toggle" type="button" data-bs-toggle="dropdown" style="width:20px;height:20px;padding:0;font-size:10px;line-height:1;">⋮</button>
        <ul class="dropdown-menu p-1" style="font-size:12px;">
          <li><a class="dropdown-item quick-title-btn" href="#" data-index="${originalIndex}">编辑详情</a></li>
          <li><a class="dropdown-item text-danger quick-delete-btn" href="#" data-index="${originalIndex}">删除</a></li>
        </ul>
      </div>
    </div>
    `;
  }

  function renderSidebar(
    containerSelector = "#quickAccessWindow .quick-images-container",
  ) {
    const $container = $(containerSelector);
    if ($container.length === 0) return;

    let $renderTarget;

    // —————— 1. 确定渲染目标容器 ——————
    $container.empty();
    $renderTarget = $container;

    // —————— 2. 渲染过滤器 ——————

    let $filter = $renderTarget.find(".quick-filter");
    if ($filter.length === 0) {
      $filter = $(`
          <div class="quick-filter d-flex gap-2 mb-2">
            <button type="button" class="btn btn-sm btn-outline-secondary filter-btn" data-filter="all">全部</button>
            <button type="button" class="btn btn-sm btn-outline-secondary filter-btn" data-filter="角色">角色</button>
            <button type="button" class="btn btn-sm btn-outline-secondary filter-btn" data-filter="场景">场景</button>
          </div>
        `);
      $renderTarget.append($filter);
      $filter.on("click", ".filter-btn", function () {
        const filter = $(this).data("filter");
        setFilter(filter);
        // $filter.find(".filter-btn").removeClass("active");
        // $(this).addClass("active");
      });
      $filter
        .find(`.filter-btn[data-filter="${currentFilter}"]`)
        .addClass("active");
    }

    // —————— 3. 构建图像 HTML ——————
    // 过滤图片
    const filteredImages =
      currentFilter === "all"
        ? images
        : images.filter((img) => img.category === currentFilter);

    // 替换原 $container.html(html) 部分
    // 先分类
    const byCategory = {
      角色: {},
      场景: {},
      未分类: [],
    };

    filteredImages.forEach((img) => {
      if (img.category === "角色") {
        if (!byCategory["角色"][img.group]) byCategory["角色"][img.group] = [];
        byCategory["角色"][img.group].push(img);
      } else if (img.category === "场景") {
        if (!byCategory["场景"][img.group]) byCategory["场景"][img.group] = [];
        byCategory["场景"][img.group].push(img);
      } else {
        byCategory["未分类"].push(img);
      }
    });

    let html = "";

    // 渲染角色
    for (const [group, imgs] of Object.entries(byCategory["角色"])) {
      html += `
            <div class="quick-group">
              <h6 class="text-white mt-3 mb-1">${group}</h6>
              <div class="d-flex flex-wrap gap-2">
          `;
      imgs.forEach((img) => {
        const title =
          getViewTypeLabel(img.viewType) + (img.note ? `（${img.note}）` : "");
        html += buildQuickImgItem(img, title);
      });
      html += `</div></div>`;
    }

    // 渲染场景
    for (const [group, imgs] of Object.entries(byCategory["场景"])) {
      html += `
            <div class="quick-group">
              <h6 class="text-white mt-3 mb-1">${group}</h6>
              <div class="d-flex flex-wrap gap-2">
          `;
      imgs.forEach((img) => {
        const title =
          getViewTypeLabel(img.viewType) + (img.note ? `（${img.note}）` : "");
        html += buildQuickImgItem(img, title);
      });
      html += `</div></div>`;
    }

    // 渲染未分类
    if (byCategory["未分类"].length > 0) {
      html += `
            <div class="quick-group">
              <h6 class="text-white mt-3 mb-1 text-secondary">未分类</h6>
              <div class="d-flex flex-wrap gap-2">
          `;
      byCategory["未分类"].forEach((img) => {
        const title = img.group || "";
        html += buildQuickImgItem(img, title);
      });
      html += `</div></div>`;
    }

    // —————— 4. 插入 HTML ——————
    // $renderTarget.html(html);
    $renderTarget.append($(html));

    // —————— 5. 绑定交互事件 ——————
    const $target = $renderTarget;

    // 点击预览
    // 重新绑定事件（使用事件委托）
    $target.off("click").on("click", ".quick-img-item", function (e) {
      if ($(e.target).closest(".dropdown").length) return;

      const $img = $(this).find("img");
      const src = $img.attr("src");
      const img = images.find((i) => (i.localPath || i.remoteUrl) === src);

      if (!img) return;

      // 构造 fake item，兼容 showHistoryDetailModal
      const fakeItem = {
        id: "quick-" + Date.now(), // 无真实 ID，但用于唯一标识
        result_paths: [img.localPath || ""],
        result_urls: [img.remoteUrl || ""],
        input_paths: [],
        input_urls: [],
        timestamp: img.addedAt || new Date().toISOString(),
        params: {
          prompt: "(来自快捷访问)",
          size: "2K",
          aspect_ratio: "auto",
        },
      };

      // 调用全局模态框函数（需确保此函数在 window 作用域或可访问）
      if (typeof window.showHistoryDetailModal === "function") {
        window.showHistoryDetailModal(fakeItem);
      } else {
        // 兜底：直接加参考图（兼容旧版）
        const success = window.AIImageState?.addFromQuickAccess(
          img.localPath,
          img.remoteUrl,
        );
        if (success && window.UploadModule?.renderPreview) {
          window.UploadModule.renderPreview();
        }
      }
    });

    $target
      .off("dragstart")
      .on("dragstart", ".quick-img-item img", function (e) {
        const $img = $(this);
        const src = $img.attr("src");
        const img = images.find((i) => (i.localPath || i.remoteUrl) === src);
        if (!img) return;

        const itemData = {
          localPath: img.localPath,
          remoteUrl: img.remoteUrl,
        };
        window.__draggedItem = itemData;
        window.__dragOrigin = "quick"; // 标记来源是快捷栏

        const originalEvent = e.originalEvent;
        const ghost = this.cloneNode(true);
        ghost.style.width = "100px";
        ghost.style.height = "100px";
        ghost.style.opacity = "0.9";
        ghost.style.borderRadius = "4px";
        ghost.style.objectFit = "contain";
        ghost.style.pointerEvents = "none";
        const ghostDiv = document.createElement("div");
        ghostDiv.appendChild(ghost);
        ghostDiv.style.position = "absolute";
        ghostDiv.style.top = "-9999px";
        document.body.appendChild(ghostDiv);

        originalEvent.dataTransfer.setDragImage(ghostDiv, 40, 40);

        const cleanup = () => {
          if (ghostDiv.parentNode) ghostDiv.parentNode.removeChild(ghostDiv);
          document.removeEventListener("dragend", cleanup);
        };
        document.addEventListener("dragend", cleanup);

        // 延迟显示拖拽目标，但排除“快捷访问”区域
        setTimeout(() => {
          $("#dragTargetOverlay").show();
          // 隐藏快捷访问目标图标（如果是从快捷栏拖出）
          if (window.__dragOrigin === "quick") {
            $(`.drag-target-item[data-target="quick"]`).hide();
          }
        }, 100);
      });

    // 标签设置
    $target
      .off("click", ".quick-tag-btn")
      .on("click", ".quick-tag-btn", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const index = $(this).data("index");
        const tag = $(this).data("tag");
        setTag(index, tag);
      });

    // 设置标题
    // 替换原 .quick-title-btn 逻辑
    $target
      .off("click", ".quick-title-btn")
      .on("click", ".quick-title-btn", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const index = $(this).data("index");
        const img = images[index];
        if (img) {
          showAddQuickAccessModal(img); // ← 改为编辑模式
        }
      });

    // 删除
    $target
      .off("click", ".quick-delete-btn")
      .on("click", ".quick-delete-btn", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const index = $(this).data("index");
        removeImage(index);
      });

    // 初始化 Bootstrap dropdown（如果未自动初始化）
    if (typeof bootstrap !== "undefined" && bootstrap.Dropdown) {
      $target.find('[data-bs-toggle="dropdown"]').each(function () {
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
