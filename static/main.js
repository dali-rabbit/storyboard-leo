// main.js
//

(function () {
  const state = window.AIImageState;
  const ITEMS_PER_PAGE = 12;

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
      if ($("#viewFront").is(":checked")) views.push("正面全身");
      if ($("#viewSide").is(":checked")) views.push("侧面全身");
      if ($("#viewBack").is(":checked")) views.push("背面全身");
      if ($("#viewFace").is(":checked")) views.push("面部特写");
      if ($("#viewSolidBg").is(":checked")) views.push("纯色背景");

      if (views.length === 0) {
        text = "（请至少选择一个视角）";
      } else {
        const viewText = views.join("和");
        const notes = $("#characterNotes").val().trim();
        text = `给我一个这个角色的${viewText}。要求角色面部特征保持一致。${notes ? " " + notes : ""}`;
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
    $(this).prop("disabled", true).text("生成中...");

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
      }),
      success: function (res) {
        if (res.success) {
          let html = "";
          res.result_urls.forEach((url) => {
            html += `
                            <div class="mb-3">
                                <a href="${url}" data-lightbox="generated"><img src="${url}" class="img-fluid rounded" style="max-height:300px;"></a>
                                <div class="mt-2">
                                    <a href="${url}" download class="btn btn-sm btn-outline-light">下载</a>
                                </div>
                            </div>
                        `;
          });
          $("#generatedPreview").html(html);
          loadHistoryPage(1);
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

  // ===== 历史记录 =====
  function showParamsModal(item) {
    let inputHtml = "";
    if (item.input_paths && item.input_paths.length > 0) {
      inputHtml = '<h5>输入参考图：</h5><div class="d-flex flex-wrap gap-2">';
      item.input_paths.forEach((url) => {
        inputHtml += `<a href="${url}" data-lightbox="inputs-${item.id}"><img src="${url}" style="width:60px;height:60px;object-fit:cover;"></a>`;
      });
      inputHtml += "</div>";
    }

    const modalHtml = `
            <div class="modal fade" id="paramsModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content bg-dark text-light">
                        <div class="modal-header">
                            <h5 class="modal-title">生成参数</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p><strong>提示词：</strong>${item.params.prompt.replace(/\n/g, "<br>")}</p>
                            <p><strong>分辨率：</strong>${item.params.size}</p>
                            <p><strong>长宽比：</strong>${item.params.aspect_ratio}</p>
                            <p><strong>生成时间：</strong>${new Date(item.timestamp).toLocaleString("zh-CN")}</p>
                            ${inputHtml}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    $("#historyList").append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById("paramsModal"));
    modal.show();
    $("#paramsModal").on("hidden.bs.modal", function () {
      $(this).remove();
    });
  }

  function loadHistoryPage(page) {
    $.get(
      "/history?page=" + page + "&limit=" + ITEMS_PER_PAGE,
      function (data) {
        let html = "";
        data.records.forEach((item) => {
          const url = item.result_paths[0] || "";
          html += `
            <div class="col-6 col-sm-4 col-md-2 mb-3">
              <div class="card history-card" data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
                <a href="javascript:void(0);" class="history-img-link">
                  <img src="${url}" class="w-100 history-img" style="aspect-ratio:1/1;object-fit:cover;" draggable="true" data-history-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
                </a>
              </div>
            </div>
          `;
        });
        $("#historyList").html(html);

        let pg = "";
        for (let i = 1; i <= data.pages; i++) {
          pg += `<li class="page-item ${i === page ? "active" : ""}"><a class="page-link" href="#">${i}</a></li>`;
        }
        $("#historyPagination").html(pg);

        // ✅ 仅在 shouldHighlightNewRecords 为 true 时执行高亮和滚动
        if (shouldHighlightNewRecords) {
          shouldHighlightNewRecords = false; // 重置标志，只触发一次

          const cards = document.querySelectorAll("#quick-gen .history-card");
          const count = Math.min(4, cards.length);

          // 高亮前 4 张
          for (let i = 0; i < count; i++) {
            const card = cards[i];
            card.style.transition = "background-color 1.5s ease";
            card.style.backgroundColor = "#ffeb3b";

            setTimeout(() => {
              card.style.backgroundColor = "";
            }, 1500);
          }

          // 滚动到 #quick-gen 容器底部（或 historyList 底部）
          const quickGenContainer = document.getElementById("quick-gen");
          if (quickGenContainer) {
            // 使用 smooth 滚动到底部
            quickGenContainer.scrollIntoView({
              behavior: "smooth",
              block: "end",
            });
            // 或者如果你希望滚动的是整个页面到底部（取决于布局）：
            // window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
          }
        }
      },
    );
  }

  // ===== 事件绑定 =====
  $(document).ready(function () {
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
      loadHistoryPage(parseInt($(this).text()));
    });

    // 初始化
    updatePromptPreview();
    loadHistoryPage(1);

    // 如果你希望在切换标签时执行某些 JS 逻辑（例如懒加载、初始化组件等），可以监听 Bootstrap 的 shown.bs.tab 事件：
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach((tab) => {
      tab.addEventListener("shown.bs.tab", (event) => {
        const targetId = event.target.getAttribute("data-bs-target");
        console.log("切换到标签:", targetId);
        // 例如：if (targetId === '#storyboard') 初始化故事板编辑器
        if (targetId === "#quick-gen") {
          loadHistoryPage(1);
        }
      });
    });

    // 侧边栏展开/收起
    $("#toggleSidebarBtn").click(function () {
      const $sidebar = $("#quickSidebar");
      const isCurrentlyCollapsed = $sidebar.hasClass("collapsed");

      // 先切换类，触发动画
      $sidebar.toggleClass("collapsed");

      // 等待动画结束
      $sidebar.one("transitionend", function () {
        const $icon = $("#shortcut-icon");
        if (isCurrentlyCollapsed) {
          // 之前是展开，现在 collapsed → 显示文字
          $icon.html("快捷访问");
        } else {
          // 之前是 collapsed，现在展开 → 显示 ★
          $icon.html("★");
        }
        // 渲染快捷图
        if (window.QuickAccess) window.QuickAccess.renderSidebar();
      });
    });

    // ===== 拖拽到目标区域逻辑 =====
    let isDraggingFromValidSource = false;
    let dragOrigin = null;

    // 监听所有 dragstart（参考图 + 历史图）
    $(document).on("dragstart", ".history-img", function (e) {
      const $el = $(this);
      const originalEvent = e.originalEvent; // 获取原生 DragEvent

      let itemData = null;
      const item = $el.data("history-item");
      itemData = {
        localPath: item?.result_paths?.[0],
        remoteUrl: item?.result_urls?.[0],
      };

      if (itemData) {
        window.__draggedItem = itemData;
        isDraggingFromValidSource = true;
        dragOrigin = this; // 原生元素

        // 创建拖影
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

        // ✅ 正确使用原生 dataTransfer
        originalEvent.dataTransfer.setDragImage(ghost, 40, 40);

        // 清理 ghost
        const cleanup = () => {
          if (ghost.parentNode) {
            ghost.parentNode.removeChild(ghost);
          }
          document.removeEventListener("dragend", cleanup);
        };
        document.addEventListener("dragend", cleanup);

        // 延迟显示目标面板
        setTimeout(() => {
          if (isDraggingFromValidSource) {
            $("#dragTargetOverlay").show();
          }
        }, 100);
      }
    });

    // 允许拖拽到目标区域
    $(document).on("dragover", ".drag-target-item", function (e) {
      e.preventDefault(); // 关键！否则 drop 不会触发
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

    // 处理 drop
    $(document).on("drop", ".drag-target-item", function (e) {
      e.preventDefault(); // 通常也在这里 preventDefault，防止浏览器默认行为（如打开图片）
      const target = $(this).data("target");
      const item = window.__draggedItem || window.__currentDragItem;

      if (item && target === "quick") {
        // 快捷访问
        window.QuickAccess?.addImage(item);
      } else if (item && target == "edit") {
        enterImageEditMode(item);
      } else if (item && target === "storyboard") {
        // 单图：直接进入故事板
        enterStoryboardMode([item]);
      }

      cleanupDragState();
    });

    // 监听 dragend（取消）
    $(document).on("dragend dragcancel", "*", function () {
      cleanupDragState();
    });

    function cleanupDragState() {
      isDraggingFromValidSource = false;
      window.__draggedItem = null;
      window.__dragOrigin = null; // ← 新增
      // 隐藏所有目标区域（包括重新显示快捷访问图标）
      $(".drag-target-item[data-target='quick']").show(); // ← 恢复显示
      $("#dragTargetOverlay").hide();
    }

    // 点击历史卡片，弹出详情浮窗
    $(document).on("click", ".history-card", function (e) {
      const item = $(this).data("item");
      showHistoryDetailModal(item);
    });

    function showHistoryDetailModal(item) {
      const isFromQuick = item.id?.startsWith("quick-");
      // 在 modalHtml 的 footer 中，按条件隐藏按钮：
      const deleteBtn = isFromQuick
        ? ""
        : `
        <button type="button" class="btn btn-outline-danger btn-sm" id="deleteHistoryBtn" data-id="${item.id}">
          删除
        </button>
      `;

      const useParamsBtn = `
        <button type="button" class="btn btn-outline-primary" id="useParamsBtn" data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
          复刻
        </button>
      `;
      // 生成参数文本（带换行）
      const paramsText = `
            <strong>提示词：</strong>${item.params.prompt.replace(/\n/g, "<br>")}<br>
            <strong>分辨率：</strong>${item.params.size}<br>
            <strong>长宽比：</strong>${item.params.aspect_ratio}<br>
            <strong>生成时间：</strong>${new Date(item.timestamp).toLocaleString("zh-CN")}
        `;

      // 输入图预览（如果有）
      let inputHtml = "";
      if (item.input_paths && item.input_paths.length > 0) {
        inputHtml =
          '<h5 class="mt-3">输入参考图：</h5><div class="d-flex flex-wrap gap-2">';
        item.input_paths.forEach((url) => {
          inputHtml += `<img src="${url}" style="width:50px;height:50px;object-fit:cover;">`;
        });
        inputHtml += "</div>";
      }

      // 结果图（主图）
      const resultUrl = item.result_paths[0] || item.result_urls[0] || "";

      // 判断是否应隐藏“复刻”按钮
      const hideUseParams =
        item.params.prompt === "free crop" ||
        item.params.prompt === "quadrants crop";

      // 获取主图（优先本地路径，但参考图需远程地址）
      const resultLocalPath = item.result_paths?.[0] || "";
      const resultRemoteUrl = item.result_urls?.[0] || "";

      const modalHtml = `
        <div class="modal fade" id="historyDetailModal" tabindex="-1">
          <div class="modal-dialog modal-lg">
            <div class="modal-content bg-dark text-light">
              <div class="modal-header">
                <h5 class="modal-title">历史记录详情</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div class="text-center mb-3">
                  <a href="${resultRemoteUrl || resultLocalPath}" data-lightbox="history-detail">
                    <img src="${resultRemoteUrl || resultLocalPath}" class="img-fluid rounded" style="max-height:400px;">
                  </a>
                </div>
                <div>${paramsText}</div>
                ${inputHtml}
              </div>
              <div class="modal-footer">
                ${deleteBtn}
                <button type="button" class="btn btn-outline-info" id="editHistoryBtn" data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
                  编辑
                </button>
                ${useParamsBtn}
                <button type="button" class="btn btn-outline-success" id="useAsReferenceBtn"
                  data-local="${resultLocalPath}"
                  data-remote="${resultRemoteUrl}"
                  data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
                  作为参考图
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      // 插入并显示
      $("#historyList").append(modalHtml);
      const modal = new bootstrap.Modal(
        document.getElementById("historyDetailModal"),
      );
      modal.show();

      // 清理
      $("#historyDetailModal").on("hidden.bs.modal", function () {
        $(this).remove();
      });
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
      if (!confirm("确定要删除这条历史记录吗？")) return;

      $.ajax({
        url: `/history/${recordId}`,
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
            loadHistoryPage(currentPage);
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
          const resp = await fetch(usableLocal);
          if (!resp.ok) throw new Error("无法读取本地图片");
          const blob = await resp.blob();
          const formData = new FormData();
          formData.append("file", blob, "reference.jpg");

          const uploadRes = await fetch("/quick-upload", {
            method: "POST",
            body: formData,
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
    // document ready 结束
  });
})();
