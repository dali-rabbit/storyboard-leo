// storyboard.js - 故事板编辑器
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
    { value: "crane_up", label: " crane 上升" },
    { value: "crane_down", label: " crane 下降" },
    { value: "static_with_focus_rack", label: "固定 + 焦点转移" },
    { value: "other", label: "其他（请说明）" },
  ];

  let storyboardState = {
    currentId: null, // 当前打开的故事板 ID
    title: "未命名故事板", // 当前标题
    panels: [],
  };

  // 获取所有已保存的故事板（从本地 storyboards/ 目录）
  async function loadStoryboardList() {
    try {
      const resp = await fetch("/list-storyboards");
      const list = await resp.json();
      const select = $("#storyboardSelector");
      // 保留前两个选项（—选择— 和 新建）
      const staticOptions = select.find("option:lt(2)").clone();
      select.empty().append(staticOptions);
      // 添加已保存的故事板
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
      const resp = await fetch("/list-storyboards");
      const list = await resp.json();
      const menu = $("#storyboardDropdownMenu");
      // 清空动态部分（保留前两项：新建 + 分割线）
      menu.find("li:not(:first-child):not(:nth-child(2))").remove();
      list.forEach((sb) => {
        const isActive = sb.id === storyboardState.currentId;
        const li = $(`
          <li>
            <a class="dropdown-item ${isActive ? "active" : ""}" href="#" data-id="${sb.id}">
              ${sb.title || "未命名故事板"}
            </a>
          </li>
        `);
        menu.append(li);
      });
    } catch (err) {
      console.error("加载故事板列表失败", err);
    }
  }

  function init() {
    renderPanels();
    applyUniformAspectRatio();
    bindGlobalEvents();
  }

  function bindGlobalEvents() {
    $("#storyboardTitle").on("blur input", function () {
      const newTitle = $(this).text().trim() || "未命名故事板";
      $(this).text(newTitle);
      storyboardState.title = newTitle;
      // 可选：自动保存草稿（或仅标记 dirty）
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
  }

  // 清空当前故事板，开始新的
  function resetStoryboard() {
    if (storyboardState.panels.length > 0) {
      if (
        !confirm("当前故事板有内容，确定要新建一个吗？未保存的内容将丢失。")
      ) {
        return;
      }
    }
    storyboardState.panels = [];
    renderPanels();
    applyUniformAspectRatio();
    updateSaveButton();
  }

  function addPanel(data) {
    const panel_id = data.panel_id || crypto.randomUUID();
    storyboardState.panels.push({ panel_id, ...data });
    console.log(storyboardState);
    renderPanels();
    applyUniformAspectRatio();
    updateSaveButton();
    document
      .getElementById("storyboardPanels")
      .scrollIntoView({ behavior: "smooth" });
    //$("#storyboardPlaceholder").removeClass("d-flex").hide();
  }

  function removePanel(id) {
    storyboardState.panels = storyboardState.panels.filter(
      (p) => p.panel_id !== id,
    );
    renderPanels();
    applyUniformAspectRatio();
    updateSaveButton();
  }

  function updatePanel(id, updates) {
    const panel = storyboardState.panels.find((p) => p.panel_id === id);
    if (panel) Object.assign(panel, updates);
    updateSaveButton();
  }

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
      storyboardState.panels.forEach((panel) => {
        const imgHtml =
          panel.images.length === 0
            ? '<div class="text-center text-muted py-3">点击“+图”添加图片</div>'
            : panel.images
                .map(
                  (url, idx) =>
                    `<a href="${url}" data-lightbox="panel-${panel.panel_id}" style="position:absolute; top:0; left:0; width:90%; height:90%; " class="panel-image-stack-link"><img src="${url}"  class="panel-image-stack" style="z-index:${panel.images.length - idx}"></a>`,
                )
                .join("");

        const cameraOptions = CAMERA_MOVEMENTS.map(
          (opt) =>
            `<option value="${opt.value}" ${panel.camera_movement === opt.value ? "selected" : ""}>${opt.label}</option>`,
        ).join("");

        html += `
          <div class="col-12 col-md-6 col-lg-4" data-panel-id="${panel.panel_id}">
            <div class="card h-100">
              <div class="card-header d-flex justify-content-between align-items-center">
                <select class="form-select form-select-sm camera-movement">
                  ${cameraOptions}
                </select>
                <button type="button" class="btn-close btn-sm remove-panel" aria-label="删除"></button>
              </div>
              <div class="card-body d-flex flex-column">
                <div class="panel-images mb-2" style="  display:flex;   gap:2px;">
                  ${imgHtml}
                </div>
                <button type="button" class="btn btn-outline-secondary btn-sm mb-2 add-image-to-panel">+ 添加图片</button>
                <textarea class="form-control description mb-2" rows="2" placeholder="镜头描述、对白等...">${panel.description}</textarea>
                <textarea class="form-control camera-note ${panel.cameraMovement === "other" ? "" : "d-none"}" rows="1" placeholder="请说明运镜方式...">${panel.cameraNote}</textarea>
              </div>
            </div>
          </div>
        `;
      });
      container.html(html);
      setupPanelEvents();
    }
  }

  // 计算并应用统一的图片宽高比
  async function applyUniformAspectRatio() {
    const panels = storyboardState.panels;
    if (panels.length === 0 || panels[0].images.length === 0) {
      // 没有参考图，恢复默认样式
      $(".panel-images").css("aspect-ratio", "");
      return;
    }

    const firstImageUrl = panels[0].images[0];
    try {
      // 加载图片并获取原始宽高
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("加载参考图失败"));
        img.src = firstImageUrl;
      });

      const aspectRatio = img.naturalWidth / img.naturalHeight;
      // 应用到所有 .panel-images 容器
      $(".panel-images").css("aspect-ratio", `${aspectRatio}`);
    } catch (err) {
      console.warn("无法获取第一张图的尺寸，使用默认比例", err);
      $(".panel-images").css("aspect-ratio", "");
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
      console.log(id);
      console.log(storyboardState);
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const urls = await uploadFilesAndGetUrls(files);
        const panel = storyboardState.panels.find((p) => p.panel_id === id);
        panel.images = panel.images.concat(urls);

        renderPanels();
        applyUniformAspectRatio();
        updateSaveButton();
      };
      input.click();
    });
  }

  async function uploadFilesAndGetUrls(files) {
    const urls = [];
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/quick-upload", {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (data.local_path) {
        urls.push(data.local_path); // e.g., /uploads/xxx.jpg
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

  // ===== 入口：从拖拽系统调用 =====
  window.enterStoryboardMode = function (items) {
    const imageRefs = items
      .map((item) => item.localPath || item.remoteUrl)
      .filter(Boolean);
    if (imageRefs.length === 0) return;

    // 1. 切换到故事板 Tab
    const storyboardTabBtn = document.querySelector("#storyboard-tab");
    if (storyboardTabBtn) {
      const tab = new bootstrap.Tab(storyboardTabBtn);
      tab.show();
    }

    // 2. 确保占位提示隐藏（即使首次进入）
    //$("#storyboardPlaceholder").removeClass("d-flex").hide();
    $("#storyboardPanels").show();

    // 3. 添加新分镜
    addPanel({
      images: imageRefs,
      description: "",
      cameraMovement: "fixed",
      cameraNote: "",
    });
  };

  // ===== 保存 =====
  async function saveStoryboard() {
    const data = {
      id: storyboardState.currentId, // 可能为 null
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
        storyboardState.currentId = result.record_id; // 新建时更新 ID
        storyboardState.title = data.title;
        loadStoryboardList(); // 刷新下拉菜单
        showToast("故事板保存成功！", "success", 5000);
        window.shouldHighlightNewRecords = true;

        loadStoryboardListIntoDropdown();
        // document.querySelector('button[data-bs-target="#quick-gen"]').click();
      } else {
        throw new Error(result.error || "保存失败");
      }
    } catch (err) {
      console.error(err);
      showToast("保存失败：" + err.message, "error", 5000);
    }
  }

  async function switchToStoryboard(id) {
    // 如果当前有内容，提示保存（可选）
    if (storyboardState.panels.length > 0 && storyboardState.currentId) {
      const shouldSave = confirm("当前故事板有修改，是否先保存？");
      if (shouldSave) {
        await saveStoryboard(); // 你已有的保存函数
      }
    }

    if (id === "__new__") {
      // 新建
      storyboardState = {
        currentId: null,
        title: "未命名故事板",
        panels: [],
      };
    } else if (id) {
      // 加载已有
      try {
        const resp = await fetch(`/load-storyboard/${id}`);
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
      // 选择“—请选择—”，清空
      storyboardState = { currentId: null, title: "未命名故事板", panels: [] };
    }

    renderPanels();
    applyUniformAspectRatio();
    updateSaveButton();
    loadStoryboardListIntoDropdown();
    // 更新下拉框选中状态（已在 loadStoryboardList 中处理）
  }

  $("#storyboardSelector").change(function () {
    const id = $(this).val();
    switchToStoryboard(id);
  });

  //新建
  $(document).on(
    "click",
    "#storyboardDropdownMenu [data-action='new']",
    function (e) {
      e.preventDefault();
      storyboardState = { currentId: null, title: "未命名故事板", panels: [] };
      renderPanels();
      applyUniformAspectRatio();
      updateSaveButton();
      resetStoryboard(); // 清空当前，新建
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

  // 切换到编辑模式
  function startEditingTitle() {
    const text = $("#storyboardTitleText").text();
    $("#storyboardTitleInput").val(text).removeClass("d-none");
    $("#storyboardTitleText").hide();
    $("#editTitleBtn").hide();
    $("#storyboardTitleInput").focus().select(); // 全选方便编辑
  }

  // 保存并退出编辑
  function finishEditingTitle() {
    const newTitle = $("#storyboardTitleInput").val().trim() || "未命名故事板";
    $("#storyboardTitleText").text(newTitle);
    $("#storyboardTitleInput").addClass("d-none");
    $("#storyboardTitleText").show();
    $("#editTitleBtn").show();
    storyboardState.title = newTitle;
  }

  // 绑定事件
  $("#storyboardTitleText, #editTitleBtn").on("click", startEditingTitle);
  $("#storyboardTitleInput").on("blur", finishEditingTitle);
  $("#storyboardTitleInput").on("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      finishEditingTitle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      $("#storyboardTitleInput").blur();
    }
  });

  // 初始化
  init();
  // loadStoryboardList();
  loadStoryboardListIntoDropdown();
})();
