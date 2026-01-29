// storyboard.js - 故事板编辑器（完整版，含拖动排序 + 动画反馈）
(() => {
  const PANEL_MAX_COUNT = 12;
  const CAMERA_MOVEMENTS = [
    { value: "fixed", label: "固定镜头" },
    { value: "pan", label: "横摇（Pan）" },
    { value: "tilt", label: "俯仰（Tilt）" },
    { value: "zoom_in", label: "推进（Zoom In）" },
    { value: "zoom_out", label: "拉远（Zoom Out）" },
    { value: "dolly_in", label: "推轨靠近（Dolly In）" },
    { value: "dolly_out", label: "推轨远离（Dolly Out）" },
    { value: "track_left", label: "左移跟拍" },
    { value: "track_right", label: "右移跟拍" },
    { value: "track_forward", label: "前进跟拍" },
    { value: "track_backward", label: "后退跟拍" },
    { value: "handheld", label: "手持晃动" },
    { value: "crane_up", label: "crane 上升" },
    { value: "crane_down", label: "crane 下降" },
    { value: "static_with_focus_rack", label: "固定 + 焦点转移" },
    { value: "other", label: "其他（请说明）" },
  ];

  let storyboardState = {
    currentId: null,
    title: "未命名故事板",
    panels: [],
    lastModified: null,
    dirty: false, // 脏状态
  };

  // 控制图片拖放上传是否启用
  let imageDropEnabled = true;

  // ======================
  // 工具函数
  // ======================

  function enableImageDrop(enable) {
    imageDropEnabled = enable;
  }

  // ======================
  // 网络 & 存储
  // ======================

  async function loadStoryboardList() {
    try {
      const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
      const resp = await fetch(`/list-storyboards?film_id=${filmId}`);
      const list = await resp.json();
      const select = $("#storyboardSelector");
      const staticOptions = select.find("option:lt(2)").clone();
      select.empty().append(staticOptions);
      list.forEach((sb) => {
        const opt = $(
          `<option value="${sb.id}">${sb.title || "未命名"}</option>`,
        );
        if (sb.id === storyboardState.currentId) {
          opt.prop("selected", true);
        }
        select.append(opt);
      });
    } catch (err) {
      console.error("加载故事板列表失败", err);
    }
  }

  async function loadStoryboardListIntoDropdown() {
    try {
      const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
      const resp = await fetch(`/list-storyboards?film_id=${filmId}`);
      const list = await resp.json();

      // 按 timestamp 降序排序（最新在前）
      list.sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp) : new Date(0);
        const bTime = b.timestamp ? new Date(b.timestamp) : new Date(0);
        return bTime - aTime;
      });

      const menu = $("#storyboardDropdownMenu");
      menu.find("li:not(:first-child):not(:nth-child(2))").remove();
      list.forEach((sb) => {
        const isActive = sb.id === storyboardState.currentId;
        const li = $(`
          <li>
            <a class="dropdown-item ${isActive ? "active" : ""}" href="#" data-id="${sb.id}">
              ${sb.title || "未命名故事板"}
              <small class="text-muted d-block">${sb.timestamp ? new Date(sb.timestamp).toLocaleString() : ""}</small>
            </a>
          </li>
        `);
        menu.append(li);
      });

      // 如果当前没有故事板，且列表非空 → 自动加载最新一个
      if (
        !storyboardState.currentId &&
        list.length > 0 &&
        !storyboardState.panels.length
      ) {
        setTimeout(() => {
          switchToStoryboard(list[0].id);
        }, 100);
      }
    } catch (err) {
      console.error("加载故事板列表失败", err);
    }
  }

  // ======================
  // 拖放上传（图片拖入分镜）
  // ======================

  function bindDropZoneEvents() {
    const container = document.getElementById("storyboardPanels");
    if (!container) return;

    container.addEventListener("dragover", (e) => {
      if (!imageDropEnabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });

    container.addEventListener("dragenter", (e) => {
      if (!imageDropEnabled) return;
      const target = e.target.closest(".panel-images");
      if (target) {
        target.classList.add("storyboard-drop-target");
      }
    });

    container.addEventListener("dragleave", (e) => {
      if (!imageDropEnabled) return;
      const target = e.target.closest(".panel-images");
      if (target) {
        const related = e.relatedTarget;
        if (!target.contains(related)) {
          target.classList.remove("storyboard-drop-target");
        }
      }
    });

    container.addEventListener("drop", async (e) => {
      if (!imageDropEnabled) return;
      e.preventDefault();
      const url = e.dataTransfer.getData("text/plain");
      if (!url) return;

      container.querySelectorAll(".storyboard-drop-target").forEach((el) => {
        el.classList.remove("storyboard-drop-target");
      });

      const panelImages = e.target.closest(".panel-images");
      if (panelImages) {
        const panelId = panelImages.closest("[data-panel-id]").dataset.panelId;
        const panel = storyboardState.panels.find(
          (p) => p.panel_id === panelId,
        );
        if (panel) {
          panel.images.push(url);
          renderPanels();
          applyUniformAspectRatio();
          updateSaveButton();
          showToast("图片已添加到分镜", "success", 2000);
        }
      } else {
        if (storyboardState.panels.length === 0) {
          addPanel({
            images: [url],
            description: "",
            cameraMovement: "fixed",
            cameraNote: "",
          });
          showToast("已创建新分镜并添加图片", "success", 2000);
        } else {
          showToast("请将图片拖到具体分镜卡片内", "info", 2000);
        }
      }
    });
  }

  // ======================
  // 拖动排序（分镜卡片）
  // ======================

  let dragState = {
    dragging: false,
    sourceElement: null,
  };

  function setupDragSort() {
    const container = document.getElementById("storyboardPanels");
    if (!container) return;

    // 移除旧监听器
    container.querySelectorAll("[draggable]").forEach((el) => {
      el.removeEventListener("dragstart", handleDragStart);
      el.removeEventListener("dragend", handleDragEnd);
    });
    container.removeEventListener("dragover", handleDragOver);
    container.removeEventListener("drop", handleDrop);

    // 绑定新监听器
    container.querySelectorAll("[draggable]").forEach((el) => {
      el.addEventListener("dragstart", handleDragStart);
      el.addEventListener("dragend", handleDragEnd);
    });
    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("drop", handleDrop);
  }

  function handleDragStart(e) {
    dragState.dragging = true;
    dragState.sourceElement = e.target.closest(".col-12");
    if (!dragState.sourceElement) return;

    dragState.sourceElement.style.opacity = "0.4";
    dragState.sourceElement.classList.add("dragging");

    enableImageDrop(false);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "text/plain",
      dragState.sourceElement.dataset.panelId,
    );
  }

  function handleDragEnd(e) {
    dragState.dragging = false;
    if (dragState.sourceElement) {
      dragState.sourceElement.style.opacity = "";
      dragState.sourceElement.classList.remove("dragging");
    }
    enableImageDrop(true);

    // 清除高亮
    document.querySelectorAll(".drag-insert-hint").forEach((el) => {
      el.classList.remove("drag-insert-hint");
    });
  }

  function handleDragOver(e) {
    if (!dragState.dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // 清除所有高亮（关键修复点）
    document.querySelectorAll(".drag-insert-hint").forEach((el) => {
      el.classList.remove("drag-insert-hint");
    });

    const targetCol = e.target.closest(".col-12");
    if (!targetCol || targetCol === dragState.sourceElement) return;

    // 仅高亮当前悬停目标
    targetCol.classList.add("drag-insert-hint");
    return false;
  }

  function handleDrop(e) {
    if (!dragState.dragging || !dragState.sourceElement) return;
    e.preventDefault();

    const targetCol = e.target.closest(".col-12");
    if (!targetCol || targetCol === dragState.sourceElement) {
      handleDragEnd(e);
      return;
    }

    const sourceId = dragState.sourceElement.dataset.panelId;
    const targetId = targetCol.dataset.panelId;

    const panels = storyboardState.panels;
    const sourceIndex = panels.findIndex((p) => p.panel_id === sourceId);
    const targetIndex = panels.findIndex((p) => p.panel_id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) {
      handleDragEnd(e);
      return;
    }

    // 重排序
    const [moved] = panels.splice(sourceIndex, 1);
    panels.splice(targetIndex, 0, moved);
    storyboardState.dirty = true;

    // 添加淡入动画反馈
    renderPanels();
    applyUniformAspectRatio();
    updateSaveButton();

    // 触发轻微动画反馈
    const allCards = document.querySelectorAll("#storyboardPanels .col-12");
    allCards.forEach((card, idx) => {
      card.style.transition = "transform 0.3s ease, opacity 0.3s ease";
      card.style.transform = "scale(1.02)";
      setTimeout(() => {
        card.style.transform = "scale(1)";
      }, 150);
    });

    handleDragEnd(e);
  }

  // ======================
  // 渲染与事件绑定
  // ======================

  function renderPanels() {
    const container = $("#storyboardPanels");
    const placeholder = $("#storyboardPlaceholder");

    if (storyboardState.panels.length === 0) {
      $("#storyboardPlaceholder").addClass("d-flex").show();
      container.hide();
      placeholder.show();
      $("#storyboardTitleInput").val(storyboardState.title);
      $("#storyboardTitleText").text(storyboardState.title);
    } else {
      $("#storyboardPlaceholder").removeClass("d-flex").hide();
      placeholder.hide();
      container.show();
      $("#storyboardTitleInput").val(storyboardState.title);
      $("#storyboardTitleText").text(storyboardState.title);

      let html = "";
      storyboardState.panels.forEach((panel, index) => {
        const panelNumber = index + 1;
        const imgHtml =
          panel.images.length === 0
            ? '<div class="text-center text-muted py-3">上传或拖入已有图片</div>'
            : panel.images
                .map(
                  (url, idx) => `
                  <div class="panel-image-wrapper" style="position:relative; flex:1; height:200px;">
                    <a href="${url}" data-lightbox="panel-${panel.panel_id}" class="d-block h-100">
                      <img src="${url}" class="panel-image-stack w-100 h-100" style="object-fit:cover; position:absolute; top:0; left:0;">
                    </a>
                    <button type="button" class="btn btn-danger btn-sm remove-image-btn"
                      data-url="${url}"
                      style="position:absolute; top:4px; right:4px; opacity:0; transition:opacity 0.2s; z-index:10;">
                      ×
                    </button>
                  </div>
                `,
                )
                .join("");

        const cameraOptions = CAMERA_MOVEMENTS.map(
          (opt) =>
            `<option value="${opt.value}" ${panel.cameraMovement === opt.value ? "selected" : ""}>${opt.label}</option>`,
        ).join("");

        html += `
          <div class="col-12 col-md-6 col-lg-4" data-panel-id="${panel.panel_id}" draggable="true">
            <div class="card h-100">
              <div class="card-header d-flex justify-content-between align-items-center">
                <span class="panel-number">${panelNumber}</span>
                <button type="button" class="btn-close btn-sm remove-panel" aria-label="删除"></button>
              </div>
              <div class="card-body d-flex flex-column">
                <div class="panel-images mb-2 d-flex" style="gap:2px; position:relative;">
                  ${imgHtml}
                </div>
                <button type="button" class="btn btn-outline-secondary btn-sm mb-2 add-image-to-panel">+ 添加图片</button>

                <!-- 镜头类型（移到中间） -->
                <select class="form-select form-select-sm camera-movement mb-2">
                  ${cameraOptions}
                </select>

                <textarea class="form-control description" rows="2" placeholder="镜头描述、对白等...">${panel.description}</textarea>
                <textarea class="form-control camera-note ${panel.cameraMovement === "other" ? "" : "d-none"}" rows="1" placeholder="请说明运镜方式...">${panel.cameraNote}</textarea>
              </div>
            </div>
          </div>
        `;
      });
      container.html(html);
      setupPanelEvents();
      setupDragSort(); // 重要：每次渲染后重新绑定拖拽
    }
  }

  function setupPanelEvents() {
    $(".remove-panel").click(function () {
      const id = $(this).closest("[data-panel-id]").data("panel-id");
      removePanel(id);
    });

    $(".camera-movement").change(function () {
      const id = $(this).closest("[data-panel-id]").data("panel-id");
      const val = $(this).val();
      updatePanel(id, { cameraMovement: val });
      $(this)
        .closest(".card")
        .find(".camera-note")
        .toggleClass("d-none", val !== "other");
    });

    $(".description, .camera-note").on("input", function () {
      const id = $(this).closest("[data-panel-id]").data("panel-id");
      const field = $(this).hasClass("description")
        ? "description"
        : "cameraNote";
      updatePanel(id, { [field]: this.value });
    });

    $(".add-image-to-panel").click(function () {
      const id = $(this).closest("[data-panel-id]").data("panel-id");
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const urls = await uploadFilesAndGetUrls(files);
        const panel = storyboardState.panels.find((p) => p.panel_id === id);
        if (panel) {
          panel.images = panel.images.concat(urls);
          renderPanels();
          applyUniformAspectRatio();
          updateSaveButton();
        }
      };
      input.click();
    });

    const container = $("#storyboardPanels");
    // 图片删除按钮的 hover 显示
    container.on("mouseenter", ".panel-image-wrapper", function () {
      $(this).find(".remove-image-btn").css("opacity", "1");
    });

    container.on("mouseleave", ".panel-image-wrapper", function () {
      $(this).find(".remove-image-btn").css("opacity", "0");
    });

    // 删除图片
    container.on("click", ".remove-image-btn", function (e) {
      e.stopPropagation();
      const urlToRemove = $(this).data("url");
      const panelId = $(this).closest("[data-panel-id]").data("panel-id");
      const panel = storyboardState.panels.find((p) => p.panel_id === panelId);
      if (panel) {
        panel.images = panel.images.filter((url) => url !== urlToRemove);
        renderPanels();
        applyUniformAspectRatio();
        updateSaveButton();
        showToast("图片已删除", "info", 2000);
      }
    });
  }

  // ======================
  // 核心 CRUD
  // ======================

  function addPanel(data) {
    const panel_id = data.panel_id || crypto.randomUUID();
    storyboardState.panels.push({ panel_id, ...data });
    storyboardState.dirty = true;
    renderPanels();
    applyUniformAspectRatio();
    updateSaveButton();
    document
      .getElementById("storyboardPanels")
      .scrollIntoView({ behavior: "smooth" });
  }

  function removePanel(id) {
    storyboardState.panels = storyboardState.panels.filter(
      (p) => p.panel_id !== id,
    );
    storyboardState.dirty = true;
    renderPanels();
    applyUniformAspectRatio();
    updateSaveButton();
  }

  function updatePanel(id, updates) {
    const panel = storyboardState.panels.find((p) => p.panel_id === id);
    if (panel) {
      Object.assign(panel, updates);
      storyboardState.dirty = true; // 标记为已修改
    }
    updateSaveButton();
  }

  async function uploadFilesAndGetUrls(files) {
    const urls = [];
    const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("film_id", filmId);
      const resp = await fetch("/quick-upload", {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (data.local_path) {
        urls.push(data.local_path);
      } else {
        throw new Error("上传失败");
      }
    }
    return urls;
  }

  function updateSaveButton() {
    const hasContent = storyboardState.panels.some((p) => p.images.length > 0);
    $("#saveStoryboardBtn").prop("disabled", !hasContent);
  }

  // ======================
  // 保存与加载
  // ======================

  async function saveStoryboard() {
    const now = new Date().toISOString(); // 标准格式，便于排序
    storyboardState.lastModified = now;

    const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
    const data = {
      id: storyboardState.currentId,
      film_id: filmId,
      title: storyboardState.title,
      panels: storyboardState.panels.map((p) => ({
        panel_id: p.panel_id,
        images: p.images,
        description: p.description,
        camera_movement: p.cameraMovement,
        camera_note: p.cameraNote,
      })),
    };

    try {
      const resp = await fetch("/save-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await resp.json();
      if (result.success) {
        storyboardState.currentId = result.record_id;
        storyboardState.title = data.title;
        storyboardState.dirty = false; //
        loadStoryboardList();
        showToast("故事板保存成功！", "success", 5000);
        window.shouldHighlightNewRecords = true;
        loadStoryboardListIntoDropdown();
      } else {
        throw new Error(result.error || "保存失败");
      }
    } catch (err) {
      console.error(err);
      showToast("保存失败：" + err.message, "error", 5000);
    }
  }

  async function switchToStoryboard(id) {
    if (storyboardState.currentId && storyboardState.dirty) {
      const shouldSave = confirm("当前故事板有修改，是否先保存？");
      if (shouldSave) {
        await saveStoryboard(); // 保存会自动清除 dirty
      }
    }

    if (id === "__new__") {
      storyboardState = {
        currentId: null,
        title: "未命名故事板",
        panels: [],
        lastModified: null,
        dirty: false,
      };
    } else if (id) {
      try {
        const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
        const resp = await fetch(`/load-storyboard/${id}?film_id=${filmId}`);
        const data = await resp.json();
        storyboardState = {
          currentId: data.id,
          title: data.title || "未命名故事板",
          panels: data.panels || [],
        };
      } catch (err) {
        showToast("加载失败", "error");
        return;
      }
    } else {
      storyboardState = {
        currentId: null,
        title: "未命名故事板",
        panels: [],
        lastModified: null,
        dirty: false,
      };
    }

    renderPanels();
    applyUniformAspectRatio();
    updateSaveButton();
    loadStoryboardListIntoDropdown();

    // 在 switchToStoryboard 函数末尾添加：
    if (id && id !== "__new__") {
      $("#deleteStoryboardBtn").show();
    } else {
      $("#deleteStoryboardBtn").hide();
    }
  }

  // ======================
  // 初始化 & 全局事件
  // ======================

  function init() {
    renderPanels();
    applyUniformAspectRatio();
    bindGlobalEvents();
    bindDropZoneEvents();
  }

  function bindGlobalEvents() {
    $("#storyboardTitle").on("blur input", function () {
      const newTitle = $(this).text().trim() || "未命名故事板";
      $(this).text(newTitle);
      storyboardState.title = newTitle;
    });

    $("#newStoryboardBtn").click(resetStoryboard);
    $("#addStoryboardPanelBtn").click(() => {
      if (storyboardState.panels.length >= PANEL_MAX_COUNT) {
        showToast(`最多支持 ${PANEL_MAX_COUNT} 个分镜`, "error", 5000);
        return;
      }
      addPanel({
        images: [],
        description: "",
        cameraMovement: "fixed",
        cameraNote: "",
      });
    });
    $("#saveStoryboardBtn").click(saveStoryboard);

    $("#storyboardSelector").change(function () {
      const id = $(this).val();
      switchToStoryboard(id);
    });

    $(document).on(
      "click",
      "#storyboardDropdownMenu [data-action='new']",
      function (e) {
        e.preventDefault();
        resetStoryboard();
        $("#storyboardTitle").text("未命名故事板").focus();
      },
    );

    $(document).on(
      "click",
      "#storyboardDropdownMenu .dropdown-item[data-id]",
      function (e) {
        e.preventDefault();
        const id = $(this).data("id");
        switchToStoryboard(id);
      },
    );

    // 编辑标题
    $("#storyboardTitleText, #editTitleBtn").on("click", startEditingTitle);
    $("#storyboardTitleInput").on("blur", finishEditingTitle);
    $("#storyboardTitleInput").on("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        finishEditingTitle();
      } else if (e.key === "Escape") {
        e.preventDefault();
        $(this).blur();
      }
    });
  }

  function resetStoryboard() {
    if (storyboardState.panels.length > 0 && storyboardState.dirty) {
      if (!confirm("当前故事板有内容，确定要新建一个吗？未保存的内容将丢失。"))
        return;
    }
    storyboardState.panels = [];
    storyboardState.title = "未命名故事板";
    storyboardState.currentId = null;
    storyboardState.dirty = false;
    storyboardState.lastModified = null;
    $("#storyboardTitleText").html(storyboardState.title);
    $("#storyboardTitleInput").val(storyboardState.title);
    renderPanels();
    applyUniformAspectRatio();
    updateSaveButton();
    $("#deleteStoryboardBtn").hide();
  }

  function startEditingTitle() {
    const text = $("#storyboardTitleText").text();
    $("#storyboardTitleInput").val(text).removeClass("d-none");
    $("#storyboardTitleText").hide();
    $("#editTitleBtn").hide();
    $("#storyboardTitleInput").focus().select();
  }

  function finishEditingTitle() {
    const newTitle = $("#storyboardTitleInput").val().trim() || "未命名故事板";
    if (newTitle !== storyboardState.title) {
      storyboardState.dirty = true;
    }
    $("#storyboardTitleText").text(newTitle);
    $("#storyboardTitleInput").addClass("d-none");
    $("#storyboardTitleText").show();
    $("#editTitleBtn").show();
    storyboardState.title = newTitle;
  }

  // ======================
  // 外部入口
  // ======================

  window.enterStoryboardMode = function (items) {
    const imageRefs = items
      .map((item) => item.localPath || item.remoteUrl)
      .filter(Boolean);
    if (imageRefs.length === 0) return;

    const storyboardTabBtn = document.querySelector("#storyboard-tab");
    if (storyboardTabBtn) {
      const tab = new bootstrap.Tab(storyboardTabBtn);
      tab.show();
    }

    $("#storyboardPanels").show();
    addPanel({
      images: imageRefs,
      description: "",
      cameraMovement: "fixed",
      cameraNote: "",
    });
  };

  // ======================
  // 图片比例
  // ======================

  async function applyUniformAspectRatio() {
    const panels = storyboardState.panels;
    if (panels.length === 0 || panels[0].images.length === 0) {
      $(".panel-images").css("aspect-ratio", "");
      return;
    }

    const firstImageUrl = panels[0].images[0];
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("加载参考图失败"));
        img.src = firstImageUrl;
      });

      const aspectRatio = img.naturalWidth / img.naturalHeight;
      $(".panel-images").css("aspect-ratio", `${aspectRatio}`);
    } catch (err) {
      console.warn("无法获取第一张图的尺寸，使用默认比例", err);
      $(".panel-images").css("aspect-ratio", "");
    }
  }

  // 删除当前故事板
  $("#deleteStoryboardBtn").click(async function () {
    const currentId = storyboardState.currentId;
    if (!currentId) {
      showToast("无可删除的故事板", "error", 2000);
      return;
    }

    const title = storyboardState.title || "当前故事板";
    if (!confirm(`确定要删除故事板 “${title}” 吗？此操作不可恢复。`)) {
      return;
    }

    try {
      const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
      const resp = await fetch(`/delete-storyboard/${currentId}?film_id=${filmId}`, {
        method: "DELETE",
      });
      const result = await resp.json();
      if (result.success) {
        showToast("故事板已删除", "success", 2000);
        // 清空当前状态，回到新建
        storyboardState = {
          currentId: null,
          title: "未命名故事板",
          panels: [],
          lastModified: null,
          dirty: false,
        };
        renderPanels();
        updateSaveButton();
        $("#deleteStoryboardBtn").hide();
        loadStoryboardListIntoDropdown();
        // 可选：自动加载最新故事板（或保持空白）
        const listResp = await fetch(`/list-storyboards?film_id=${filmId}`);
        const list = await listResp.json();
        if (list.length > 0) {
          switchToStoryboard(list[0].id);
        } else {
          resetStoryboard();
        }
      } else {
        throw new Error(result.error || "删除失败");
      }
    } catch (err) {
      console.error(err);
      showToast("删除失败：" + err.message, "error", 3000);
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (storyboardState.currentId && storyboardState.dirty) {
      // 触发浏览器默认提示
      event.preventDefault();
      event.returnValue = ""; // 必须设置（即使为空字符串）
      return "";
    }
  });

  // ======================
  // 启动
  // ======================

  init();
  // 延迟加载故事板列表，等待 FilmManager 初始化完成
  if (window.FilmManager && window.FilmManager.getCurrentFilmId()) {
    loadStoryboardListIntoDropdown();
  }
  
  // 暴露给外部调用
  window.StoryboardModule = {
    loadStoryboardList,
    loadStoryboardListIntoDropdown,
    resetStoryboard,
    saveStoryboard
  };
})();
