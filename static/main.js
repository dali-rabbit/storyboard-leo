// main.js
//
// 全局 z-index 计数器
let currentTopZIndex = 5;

function bringWindowToFront(el) {
  if (!el.classList.contains("floating-window")) return;
  currentTopZIndex += 1;
  el.style.zIndex = currentTopZIndex;
}

(function () {
  const state = window.AIImageState;
  // 全局变量记录当前页
  let currentHistoryWindowPage = 1;

  // 初始化影片管理
  async function initFilmManager() {
    const filmId = await window.FilmManager.init();
    
    // 加载当前影片的插件设置
    if (window.PluginSettings) {
      await window.PluginSettings.load(filmId);
    }
    
    // 加载当前影片的快捷访问数据
    await window.QuickAccess.load(filmId);
    window.QuickAccess.renderSidebar();
    
    // 加载当前影片的历史记录
    loadHistoryWindowPage(1);
    
    // 加载当前影片的故事板列表
    if (window.StoryboardModule) {
      window.StoryboardModule.loadStoryboardListIntoDropdown();
    }
    
    // 注册影片切换回调
    window.FilmManager.onFilmChange(async (film) => {
      // 清空当前状态
      state.clear();
      if (window.UploadModule) {
        window.UploadModule.renderPreview();
      }
      
      // 加载新影片的插件设置
      if (window.PluginSettings) {
        await window.PluginSettings.load(film.id);
      }
      
      // 加载新影片的快捷访问
      await window.QuickAccess.load(film.id);
      window.QuickAccess.renderSidebar();
      
      // 加载新影片的历史记录
      loadHistoryWindowPage(1);
      
      // 加载新影片的故事板
      if (window.StoryboardModule) {
        window.StoryboardModule.loadStoryboardListIntoDropdown();
      }
    });
  }

  // 历史窗口分页
  // 历史记录多选模式状态
  let historyMultiSelectMode = false;
  
  function loadHistoryWindowPage(page, limit = 12) {
    currentHistoryWindowPage = page;
    const filmId = window.FilmManager.getCurrentFilmId();
    $.get(`/history?page=${page}&limit=${limit}&film_id=${filmId}`, function (data) {
      // 添加批量操作标题栏
      const multiSelectDisplay = historyMultiSelectMode ? 'style="display: flex;"' : 'style="display: none;"';
      let html = `
        <div class="col-12 mb-3 d-flex align-items-center gap-2">
          <button type="button" class="btn btn-sm ${historyMultiSelectMode ? 'btn-primary' : 'btn-outline-secondary'}" id="toggleMultiSelectBtn">
            ${historyMultiSelectMode ? '退出多选' : '多选模式'}
          </button>
          <div id="multiSelectControls" class="align-items-center gap-2" ${multiSelectDisplay}>
            <div class="form-check mb-0">
              <input class="form-check-input" type="checkbox" id="selectAllHistory">
              <label class="form-check-label text-light" for="selectAllHistory">全选</label>
            </div>
            <span class="text-muted">|</span>
            <span class="text-muted small">已选 <span id="selectedHistoryCount">0</span> 项</span>
            <button type="button" class="btn btn-sm btn-danger" id="batchDeleteHistoryBtn" disabled>
              <i class="bi bi-trash"></i> 删除选中
            </button>
          </div>
        </div>
      `;
      
      data.records.forEach((item) => {
        const url = item.result_paths[0] || "";
        const checkboxDisplay = historyMultiSelectMode ? 'style="display: block;"' : 'style="display: none;"';
        html += `
          <div class="col-6 col-sm-4 col-md-3 mb-3 history-item-container">
            <div class="card history-card position-relative" data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}' data-id="${item.id}">
              <div class="history-checkbox position-absolute" ${checkboxDisplay}>
                <input type="checkbox" class="form-check-input history-select" value="${item.id}" data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
              </div>
              <img src="${url}" class="w-100" style="aspect-ratio:1/1;object-fit:cover;" draggable="true">
            </div>
          </div>
        `;
      });
      $("#historyWindowList").html(html);

      let pg = "";
      for (let i = 1; i <= data.pages; i++) {
        pg += `<li class="page-item ${i === page ? "active" : ""}"><a class="page-link" href="#">${i}</a></li>`;
      }
      $("#historyWindowPagination").html(pg);
      
      // 绑定批量操作事件
      bindBatchHistoryEvents();
    });
  }
  
  // 批量操作事件绑定
  function bindBatchHistoryEvents() {
    // 多选模式切换
    $("#toggleMultiSelectBtn").off("click").on("click", function () {
      historyMultiSelectMode = !historyMultiSelectMode;
      loadHistoryWindowPage(currentHistoryWindowPage);
    });
    
    // 全选/取消全选
    $("#selectAllHistory").off("change").on("change", function () {
      const checked = $(this).is(":checked");
      $(".history-select").prop("checked", checked);
      $(".history-card").toggleClass("selected", checked);
      updateSelectedCount();
    });
    
    // 单个选择变化（点击复选框时阻止冒泡触发卡片点击）
    $(document).off("click", ".history-select").on("click", ".history-select", function (e) {
      e.stopPropagation();
    });
    
    $(document).off("change", ".history-select").on("change", ".history-select", function () {
      updateSelectedCount();
      
      // 更新卡片样式
      $(this).closest(".history-card").toggleClass("selected", $(this).is(":checked"));
      
      // 更新全选状态
      const allChecked = $(".history-select").length === $(".history-select:checked").length;
      $("#selectAllHistory").prop("checked", allChecked);
    });
    
    // 批量删除
    $("#batchDeleteHistoryBtn").off("click").on("click", async function () {
      const selectedIds = $(".history-select:checked").map(function () {
        return $(this).val();
      }).get();
      
      if (selectedIds.length === 0) {
        showToast("请先选择要删除的记录", "warning", 3000);
        return;
      }
      
      if (!confirm(`确定要删除选中的 ${selectedIds.length} 条历史记录吗？\n\n此操作不可恢复，本地图片也将被删除。`)) {
        return;
      }
      
      const filmId = window.FilmManager.getCurrentFilmId();
      
      try {
        const res = await fetch("/history/batch-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ record_ids: selectedIds, film_id: filmId }),
        });
        
        const result = await res.json();
        
        if (result.success) {
          showToast(`成功删除 ${result.deleted_count} 条记录`, "success", 3000);
          if (result.failed_ids && result.failed_ids.length > 0) {
            showToast(`${result.failed_ids.length} 条删除失败`, "warning", 5000);
          }
          // 重新加载当前页
          loadHistoryWindowPage(currentHistoryWindowPage);
        } else {
          showToast("删除失败: " + (result.error || "未知错误"), "error", 0);
        }
      } catch (e) {
        console.error("批量删除失败:", e);
        showToast("删除请求失败", "error", 0);
      }
    });
  }
  
  // 更新选中数量
  function updateSelectedCount() {
    const count = $(".history-select:checked").length;
    $("#selectedHistoryCount").text(count);
    $("#batchDeleteHistoryBtn").prop("disabled", count === 0);
  }

  // ===== 提示词预览 =====
  function updatePromptPreview() {
    let text = "";
    if ($("#modeRaw").is(":checked")) {
      text = $("#promptRaw").val();
    } else if ($("#modeStoryboard").is(":checked")) {
      const pre = $("#prePrompt").val();
      const style = $("#style").val();
      const s1 = $("#shot1").val();
      const s2 = $("#shot2").val();
      const s3 = $("#shot3").val();
      const s4 = $("#shot4").val();
      text = `${pre}，生成四格分镜（${style}）：\n分镜一：${s1}\n分镜二：${s2}\n分镜三：${s3}\n分镜四：${s4}`;
    } else if ($("#modeCharacter").is(":checked")) {
      // 角色模式逻辑
      const views = [];
      const scenes = [];
      if ($("#viewFront").is(":checked")) views.push("正面全身");
      if ($("#viewSide").is(":checked")) views.push("侧面全身");
      if ($("#viewBack").is(":checked")) views.push("背面全身");
      if ($("#viewFace").is(":checked")) views.push("面部特写");

      if ($("#viewSolidBg").is(":checked")) scenes.push("纯色背景");

      if (views.length === 0) {
        text = "（请至少选择一个视角）";
      } else {
        const viewText = views.join("和") + ", " + scenes.join(", ");
        const notes = $("#characterNotes").val().trim();
        text = `给我一个这个角色的${viewText}。${notes ? " " + notes : ""}`;
      }
    }
    $("#promptPreview").text(text || "（提示词为空）");
  }

  // ===== 生成图片 =====
  let isGenerating = false;
  $("#generateBtn").click(function () {
    if (isGenerating) return;
    const prompt = $("#promptPreview").text().trim();
    if (!prompt || prompt === "（提示词为空）") {
      alert("请填写提示词");
      return;
    }

    isGenerating = true;
    const startTime = Date.now();
    $(this).prop("disabled", true).text("生成中...");

    const filmId = window.FilmManager.getCurrentFilmId();

    $.ajax({
      url: "/generate",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        image_urls: state.getUploadedUrls(),
        local_input_paths: state.getLocalPaths(),
        prompt: prompt,
        size: $("#resolution").val(),
        aspect_ratio: $("#aspectRatio").val(),
        film_id: filmId,
      }),
      success: function (res) {
        if (res.success) {
          // 使用后端返回的纯生成耗时（不含上传、迁移等预处理时间）
          const elapsed = res.elapsed || 0;
          const pluginName = res.plugin || '';
          const pluginBadge = pluginName ? `<span class="badge bg-secondary ms-1">${pluginName}</span>` : '';
          let html = `<div class="text-muted small mb-2">⚡ 生成耗时: ${elapsed}秒${pluginBadge}</div>`;
          res.result_urls.forEach((url) => {
            html += `
                            <div class="mb-3">
                                <a href="${url}" data-lightbox="generated"><img src="${url}" class="img-fluid rounded" style="max-height:300px;"></a>
                                <div class="mt-2">
                                    <a href="${url}" download class="btn btn-sm btn-outline-light">下载</a>
                                    &nbsp;
                                    <a href="javascript:void(0);" data-url="${url}" class="btn btn-sm btn-success" id="editGenerated" > 编辑</a>
                                </div>
                            </div>
                        `;
          });
          $("#generatedPreview").html(html);
          loadHistoryWindowPage(1);
        } else {
          alert("生成失败: " + (res.error || "未知错误"));
        }
      },
      error: function (xhr) {
        const err = xhr.responseJSON?.error || "请求失败";
        alert("生成错误: " + err);
      },
      complete: function () {
        isGenerating = false;
        $("#generateBtn").prop("disabled", false).text("生成图片");
      },
    });
  });

  /**
   * 将指定图片载入“图片编辑”标签页并激活
   * @param {Object} item - 包含 localPath 或 remoteUrl 的对象
   */
  function enterImageEditMode(item) {
    // 1. 切换到“图片编辑”标签
    const editTabBtn = document.querySelector("#image-split-tab");
    if (editTabBtn) {
      const tab = new bootstrap.Tab(editTabBtn);
      tab.show();
    }

    // 2. 优先使用本地路径（localPath），没有则用远程 URL（remoteUrl）
    const imgUrl = item.localPath || item.remoteUrl;
    if (!imgUrl) {
      console.warn("No image URL to edit", item);
      return;
    }

    // 3. 触发图片加载（与 drag-drop 逻辑一致）
    $("#hiddenImageLoader").attr("src", imgUrl);
    $("#imageEditPlaceholder").hide();
  }

  // ===== 事件绑定 =====
  $(document).ready(async function () {
    // 初始化影片管理
    await initFilmManager();
    
    // 模式切换
    $('input[name="mode"]').change(function () {
      $("#rawSection").toggle(this.value === "raw");
      $("#storyboardSection").toggle(this.value === "storyboard");
      $("#characterSection").toggle(this.value === "character");
      updatePromptPreview();
    });

    $(
      "#promptRaw, #prePrompt, #style, #shot1, #shot2, #shot3, #shot4, #characterNotes",
    ).on("input", updatePromptPreview);

    // 复选框变化也要触发预览更新
    $("#characterSection input[type='checkbox']").on(
      "change",
      updatePromptPreview,
    );

    $(document).on("click", "#historyPagination .page-link", function (e) {
      e.preventDefault();
      loadHistoryWindowPage(parseInt($(this).text()));
    });

    // 插件设置按钮
    $(document).on("click", "#pluginSettingsBtn", function () {
      if (window.PluginSettings) {
        window.PluginSettings.showModal();
      }
    });

    // 初始化
    updatePromptPreview();

    // 如果你希望在切换标签时执行某些 JS 逻辑（例如懒加载、初始化组件等），可以监听 Bootstrap 的 shown.bs.tab 事件：
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach((tab) => {
      tab.addEventListener("shown.bs.tab", (event) => {
        const targetId = event.target.getAttribute("data-bs-target");
        console.log("切换到标签:", targetId);
      });
    });

    // ===== 拖拽到目标区域逻辑 =====

    // 点击历史卡片
    $(document).on("click", ".history-card", function (e) {
      // 多选模式下，点击卡片切换选中状态
      if (historyMultiSelectMode) {
        e.preventDefault();
        e.stopPropagation();
        const $checkbox = $(this).find(".history-select");
        $checkbox.prop("checked", !$checkbox.is(":checked"));
        $(this).toggleClass("selected", $checkbox.is(":checked"));
        updateSelectedCount();
        
        // 更新全选状态
        const allChecked = $(".history-select").length === $(".history-select:checked").length;
        $("#selectAllHistory").prop("checked", allChecked);
        return;
      }
      
      // 正常模式下，点击打开详情
      const item = $(this).data("item");
      showHistoryDetailModal(item);
    });

    function showHistoryDetailModal(item) {
      const isFromQuick = item.id?.startsWith("quick-");
      const resultUrl = item.result_paths[0] || item.result_urls[0] || "";

      const hideUseParams =
        item.params.prompt === "free crop" ||
        item.params.prompt === "quadrants crop";

      // 构建内容（和原来一样，但不再包含外层 modal 结构）
      const deleteBtn = isFromQuick
        ? ""
        : `<button type="button" class="btn btn-outline-danger btn-sm" id="deleteHistoryBtn" data-id="${item.id}">删除</button>`;

      const useParamsBtn = hideUseParams
        ? ""
        : `<button type="button" class="btn btn-outline-primary" id="useParamsBtn" data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>复刻</button>`;

      let paramsText = "";
      if (!hideUseParams) {
        paramsText = `
          <strong>提示词：</strong>${item.params.prompt.replace(/\n/g, "<br>")}<br>
          <strong>分辨率：</strong>${item.params.size}<br>
          <strong>长宽比：</strong>${item.params.aspect_ratio}<br>
          <strong>生成时间：</strong>${new Date(item.timestamp).toLocaleString("zh-CN")}
        `;
      }

      let inputHtml = "";
      if (item.input_paths && item.input_paths.length > 0) {
        inputHtml =
          '<h5 class="mt-3">输入参考图：</h5><div class="d-flex flex-wrap gap-2">';
        item.input_paths.forEach((url) => {
          inputHtml += `<img src="${url}" style="width:50px;height:50px;object-fit:cover;">`;
        });
        inputHtml += "</div>";
      }

      // 更新模态框内容
      const $modal = $("#historyDetailModal");
      $modal.find(".modal-body").html(`
        <div class="text-center mb-3">
          <a href="${resultUrl}" data-lightbox="history-detail">
            <img src="${resultUrl}" class="img-fluid rounded" style="max-height:400px;">
          </a>
        </div>
        ${paramsText}
        ${inputHtml}
      `);

      $modal.find(".modal-footer").html(`
        ${deleteBtn}
        <button type="button" class="btn btn-outline-info" id="editHistoryBtn" data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>编辑</button>
        ${useParamsBtn}
        <button type="button" class="btn btn-outline-success" id="useAsReferenceBtn"
          data-local="${resultUrl}"
          data-remote="${resultUrl}"
          data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
          作为参考图
        </button>
      `);

      // 初始化或获取已有的 Modal 实例（推荐缓存，但简单场景可每次都 new）
      const modalInstance = bootstrap.Modal.getOrCreateInstance($modal[0]);
      modalInstance.show();
    }
    // 暴露方法到全局
    window.showHistoryDetailModal = showHistoryDetailModal;

    // 使用参数（复用原有逻辑）
    $(document).on("click", "#useParamsBtn", function () {
      const item = $(this).data("item");
      // === 以下复用你原有的“使用参数”逻辑 ===
      const params = item.params;

      // 判断模式（Raw / Storyboard / Character）
      let isCharacter = params.prompt.includes("面部特征保持一致");
      let isStoryboard = params.prompt.includes("生成四格分镜");

      if (isCharacter) {
        $("#modeCharacter").prop("checked", true).trigger("change");
        // 清空复选框
        $("#characterSection input[type='checkbox']").prop("checked", false);
        const prompt = params.prompt;
        if (prompt.includes("正面全身")) $("#viewFront").prop("checked", true);
        if (prompt.includes("侧面全身")) $("#viewSide").prop("checked", true);
        if (prompt.includes("背面全身")) $("#viewBack").prop("checked", true);
        if (prompt.includes("面部特写")) $("#viewFace").prop("checked", true);
        if (prompt.includes("纯色背景"))
          $("#viewSolidBg").prop("checked", true);

        const notesMatch = prompt.match(/面部特征保持一致\。（.*?）?$/);
        $("#characterNotes").val(notesMatch ? notesMatch[1] || "" : "");
      } else if (isStoryboard) {
        $("#modeStoryboard").prop("checked", true).trigger("change");
        const lines = params.prompt.split("\n");
        const preMatch = lines[0]?.match(/^(.+)，生成四格分镜/);
        $("#prePrompt").val(preMatch ? preMatch[1] : "");
        const styleMatch = lines[0]?.match(/生成四格分镜（(.+?)）/);
        $("#style").val(styleMatch ? styleMatch[1] : "");
        $("#shot1").val(lines[1]?.replace("分镜一：", "") || "");
        $("#shot2").val(lines[2]?.replace("分镜二：", "") || "");
        $("#shot3").val(lines[3]?.replace("分镜三：", "") || "");
        $("#shot4").val(lines[4]?.replace("分镜四：", "") || "");
      } else {
        $("#modeRaw").prop("checked", true).trigger("change");
        $("#promptRaw").val(params.prompt);
      }

      $("#resolution").val(params.size || "2K");
      $("#aspectRatio").val(params.aspect_ratio || "auto");

      // 恢复参考图
      state.clear();
      if (item.input_paths && item.input_paths.length > 0) {
        state.setFromUrls(item.input_urls, item.input_paths);
      }
      if (typeof window.UploadModule?.renderPreview === "function") {
        window.UploadModule.renderPreview();
      }

      updatePromptPreview();
      $("html, body").animate({ scrollTop: 0 }, 300);

      // 关闭浮窗
      bootstrap.Modal.getInstance(
        document.getElementById("historyDetailModal"),
      )?.hide();
    });

    // 删除记录
    $(document).on("click", "#deleteHistoryBtn", function () {
      const recordId = $(this).data("id");
      const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
      if (!confirm("确定要删除这条历史记录吗？")) return;

      $.ajax({
        url: `/history/${recordId}?film_id=${filmId}`,
        method: "DELETE",
        success: function (res) {
          if (res.success) {
            // 关闭浮窗
            bootstrap.Modal.getInstance(
              document.getElementById("historyDetailModal"),
            )?.hide();
            // 重新加载当前页
            const currentPage =
              parseInt(
                $("#historyPagination .page-item.active .page-link").text(),
              ) || 1;
            loadHistoryWindowPage(currentPage);
          } else {
            alert("删除失败: " + (res.error || "未知错误"));
          }
        },
        error: function () {
          alert("删除请求失败");
        },
      });
    });

    // 编辑按钮
    $(document).on("click", "#editHistoryBtn", function () {
      const item = $(this).data("item");

      // 构造与拖拽逻辑一致的 item 结构：{ localPath, remoteUrl }
      const editItem = {
        localPath: item.result_paths?.[0] || item.result_urls?.[0], // 优先本地路径
        remoteUrl: item.result_urls?.[0],
      };

      enterImageEditMode(editItem);

      // 关闭浮窗
      bootstrap.Modal.getInstance(
        document.getElementById("historyDetailModal"),
      )?.hide();
      $(".btn-close[data-dismiss='history-window']").trigger("click");
    });
    // 编辑按钮（刚生成的图片）
    $(document).on("click", "#editGenerated", function () {
      const localPathAsUrl = $(this).data("url");
      enterImageEditMode({ localPath: localPathAsUrl, remoteUrl: null });
    });

    // 新增：作为参考图
    $(document).on("click", "#useAsReferenceBtn", async function () {
      const localPath = $(this).data("local");
      const remoteUrl = $(this).data("remote");
      const item = $(this).data("item");

      let usableLocal = localPath;
      let usableRemote = remoteUrl;

      // 若没有有效的 ImgBB 远程地址，先上传
      if (!usableRemote || !usableRemote.startsWith("https://")) {
        if (!usableLocal) {
          alert("无法获取图片源，无法作为参考图");
          return;
        }

        try {
          const filmId = window.FilmManager ? window.FilmManager.getCurrentFilmId() : "default";
          const uploadRes = await fetch("/quick-upload-2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ local_path: usableLocal, film_id: filmId }),
          });

          if (!uploadRes.ok) throw new Error("上传失败");
          const data = await uploadRes.json();
          usableRemote = data.url;
          usableLocal = data.local_path || usableLocal;
        } catch (e) {
          console.error("上传参考图失败:", e);
          showToast("上传参考图失败，请重试", "error", 3000);
          return;
        }
      }

      // 加入参考图
      const success = window.AIImageState?.addFromQuickAccess(
        usableLocal,
        usableRemote,
      );
      if (success) {
        if (typeof window.UploadModule?.renderPreview === "function") {
          window.UploadModule.renderPreview();
        }
        showToast("已添加为参考图", "success", 2000);
        // 关闭模态框
        bootstrap.Modal.getInstance(
          document.getElementById("historyDetailModal"),
        )?.hide();
      } else {
        showToast("参考图已存在或数量已达上限（最多10张）", "warning", 2500);
      }
    });

    // ===== 工具条弹窗控制 =====
    $(document).on("click", ".tool-btn", function () {
      const target = $(this).data("target");
      let win;
      if (target === "quick-access") {
        win = $("#quickAccessWindow").removeClass("d-none");
        window.QuickAccess?.renderSidebar(
          "#quickAccessWindow .quick-images-container",
        );
      } else if (target === "history-window") {
        win = $("#historyWindow").removeClass("d-none");
        loadHistoryWindowPage(1);
      }
      if (win) bringWindowToFront(win[0]);
    });

    // 关闭窗口
    $(document).on("click", "[data-dismiss]", function () {
      const target = $(this).data("dismiss");
      if (target === "quick-access") {
        $("#quickAccessWindow").addClass("d-none");
      } else if (target === "history-window") {
        $("#historyWindow").addClass("d-none");
        // 关闭时自动退出多选模式
        if (historyMultiSelectMode) {
          historyMultiSelectMode = false;
        }
      }
    });

    $(document).on(
      "click",
      "#historyWindowPagination .page-link",
      function (e) {
        e.preventDefault();
        const page = parseInt($(this).text());
        // 重新计算当前 limit（或缓存）
        const win = document.getElementById("historyWindow");
        const containerWidth =
          win?.querySelector(".history-content")?.clientWidth || 400;
        //const limit = calculateHistoryItemsPerPage(containerWidth);
        loadHistoryWindowPage(page);
      },
    );

    // ===== 拖拽移动浮动窗口 =====
    function makeWindowDraggable(windowSelector) {
      const winEl = document.querySelector(windowSelector); // ← 改名：winEl
      if (!winEl) return;

      let pos1 = 0,
        pos2 = 0,
        pos3 = 0,
        pos4 = 0;

      const header = winEl.querySelector(".floating-header");
      if (!header) return;

      header.style.cursor = "move";

      header.onmousedown = dragMouseDown;

      function dragMouseDown(e) {
        e.preventDefault();
        bringWindowToFront(winEl);
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
      }

      function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        // ✅ 正确计算新位置
        const newLeft = winEl.offsetLeft - pos1;
        const newTop = winEl.offsetTop - pos2;

        // ✅ 使用全局 window.innerWidth/Height（注意：不是 winEl.innerWidth！）
        const maxX = window.innerWidth - winEl.offsetWidth;
        const maxY = window.innerHeight - winEl.offsetHeight;

        // ✅ 限制边界
        winEl.style.left = Math.max(0, Math.min(newLeft, maxX)) + "px";
        winEl.style.top = Math.max(0, Math.min(newTop, maxY)) + "px";

        // ✅ 移除 transform（确保定位基于 left/top）
        winEl.style.transform = "none";
      }

      function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
      }
    }

    // 初始化拖拽
    makeWindowDraggable("#quickAccessWindow");
    makeWindowDraggable("#historyWindow");

    // ===== 悬浮窗口图片拖拽支持 =====
    $(document).on(
      "dragstart",
      "#historyWindow .history-card img, #quickAccessWindow .quick-img-item img",
      function (e) {
        const originalEvent = e.originalEvent;
        let itemData = null;

        // 来源：历史记录
        if ($(this).closest("#historyWindow").length) {
          const item = $(this).parent("div").data("item");
          console.log(item);
          if (item) {
            itemData = {
              type: "history",
              localPath: item.result_paths?.[0] || "",
              remoteUrl: item.result_urls?.[0] || "",
              inputPaths: item.input_paths || [],
              inputUrls: item.input_urls || [],
              params: item.params || {},
            };
          }
        }
        // 来源：快捷访问
        else if ($(this).closest("#quickAccessWindow").length) {
          const item = $(this).data("quick-item");
          if (item) {
            itemData = {
              type: "quick",
              localPath: item.localPath,
              remoteUrl: item.remoteUrl,
              category: item.category,
              group: item.group,
              viewType: item.viewType,
              note: item.note,
            };
          }
        }

        if (itemData) {
          // 存储到全局（供 drop 区域读取）
          window.__draggedItem = itemData;

          // 设置拖影
          const img = this.cloneNode(true);
          img.style.width = "80px";
          img.style.height = "80px";
          img.style.opacity = "0.9";
          img.style.borderRadius = "4px";
          img.style.objectFit = "cover";
          img.style.pointerEvents = "none";
          const ghost = document.createElement("div");
          ghost.appendChild(img);
          ghost.style.position = "absolute";
          ghost.style.top = "-9999px";
          document.body.appendChild(ghost);
          originalEvent.dataTransfer.setDragImage(ghost, 40, 40);

          // 清理
          const cleanup = () => {
            if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
            document.removeEventListener("dragend", cleanup);
          };
          document.addEventListener("dragend", cleanup);

          // 不显示 #dragTargetOverlay（你已移除，所以跳过）
          return;
        }
      },
    );

    // 快捷访问窗口接收历史图
    $(document).on(
      "dragover",
      "#quickAccessWindow .quick-images-container",
      function (e) {
        e.preventDefault();
      },
    );
    $(document).on(
      "drop",
      "#quickAccessWindow .quick-images-container",
      function (e) {
        e.preventDefault();
        const item = window.__draggedItem;
        if (item && item.type === "history") {
          // 提取主图
          const imgToAdd = {
            localPath: item.localPath,
            remoteUrl: item.remoteUrl,
          };
          window.QuickAccess?.addImage(imgToAdd);
          showToast("已添加到快捷访问", "success", 2000);
        }
        window.__draggedItem = null;
      },
    );

    function makeResizable(windowSelector) {
      const win = document.querySelector(windowSelector);
      if (!win) return;

      const handle = win.querySelector(".resize-handle");
      if (!handle) return;

      let isResizing = false;

      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        isResizing = true;
        document.body.classList.add("resizing");
        document.addEventListener("mousemove", resize);
        document.addEventListener("mouseup", stopResize);
      });

      function resize(e) {
        if (!isResizing) return;
        const rect = win.getBoundingClientRect();
        const dx = e.clientX - rect.right;
        const dy = e.clientY - rect.bottom;

        let newWidth = rect.width + dx;
        let newHeight = rect.height + dy;

        // 限制 min/max
        newWidth = Math.min(1200, Math.max(300, newWidth));
        newHeight = Math.min(800, Math.max(200, newHeight));

        win.style.width = newWidth + "px";
        win.style.height = newHeight + "px";
      }

      function stopResize() {
        isResizing = false;
        document.body.classList.remove("resizing");
        document.removeEventListener("mousemove", resize);
        document.removeEventListener("mouseup", stopResize);

        // ✅ 调整结束：如果是历史窗口，重新加载
        if (windowSelector === "#historyWindow") {
          debouncedReloadHistoryWindow();
        }
      }
    }

    function calculateHistoryItemsPerPage(containerWidth) {
      // 每张卡片约 100px 宽（含 gutter）
      const cols = Math.max(2, Math.floor(containerWidth / 110));
      // 高度区域约 400px 可用，每行 120px
      const rows = Math.max(2, Math.floor(400 / 120));
      return cols * rows;
    }

    function debounce(func, wait) {
      let timeout;
      return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
      };
    }

    // const debouncedReloadHistoryWindow = debounce(() => {
    //   const win = document.getElementById("historyWindow");
    //   if (!win) return;

    //   const containerWidth = win.querySelector(".history-content").clientWidth;
    //   const newLimit = calculateHistoryItemsPerPage(containerWidth);

    //   // 可选：存入全局或闭包，避免重复加载相同 limit
    //   loadHistoryWindowPage(currentHistoryWindowPage, newLimit);
    // }, 300);

    makeResizable("#quickAccessWindow");
    makeResizable("#historyWindow");

    // document ready 结束
  });
})();
