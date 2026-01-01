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
    } else {
      const pre = $("#prePrompt").val();
      const style = $("#style").val();
      const s1 = $("#shot1").val();
      const s2 = $("#shot2").val();
      const s3 = $("#shot3").val();
      const s4 = $("#shot4").val();
      text = `${pre}，生成四格分镜（${style}）：\n分镜一：${s1}\n分镜二：${s2}\n分镜三：${s3}\n分镜四：${s4}`;
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
              <div class="card history-card">
                <a href="${url}" data-lightbox="history">
                  <img src="${url}" class="history-img w-100" style="aspect-ratio:1/1;object-fit:cover;" draggable="true" data-history-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
                </a>
                <div class="card-body p-2">
                  <button class="btn btn-sm btn-outline-light w-100 mt-1 view-params"
                    data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
                    查看参数
                  </button>
                  <button class="btn btn-sm btn-outline-primary w-100 mt-1 use-params"
                    data-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
                    使用参数
                  </button>
                </div>
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
      updatePromptPreview();
    });

    $("#promptRaw, #prePrompt, #style, #shot1, #shot2, #shot3, #shot4").on(
      "input",
      updatePromptPreview,
    );

    // 历史记录交互
    $(document).on("click", ".view-params", function () {
      const item = $(this).data("item");
      showParamsModal(item);
    });

    $(document).on("click", ".use-params", function () {
      const item = $(this).data("item");
      const params = item.params;

      // 1. 恢复提示词模式和内容
      if (params.prompt.includes("生成四格分镜")) {
        // 判断为 storyboard 模式（可优化为更可靠的方式，如存 mode 字段）
        $("#modeStoryboard").prop("checked", true).trigger("change");
        // 简单解析（适用于你当前的格式）
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

      // 2. 恢复分辨率与长宽比
      $("#resolution").val(params.size || "2K");
      $("#aspectRatio").val(params.aspect_ratio || "auto");

      // 3. 恢复参考图（清空当前状态，重新加载）
      // 恢复参考图状态
      state.clear();
      if (item.input_paths && item.input_paths.length > 0) {
        state.setFromUrls(item.input_urls, item.input_paths);
      }

      // ✅ 关键：调用已有的渲染函数，而不是手写 HTML
      if (typeof window.UploadModule?.renderPreview === "function") {
        window.UploadModule.renderPreview();
      } else {
        console.warn("UploadModule.renderPreview not available");
        // 降级处理（可选）
        $("#uploadPreview").empty();
        if (item.input_paths?.length) {
          $("#dropZone .text-muted").text(
            `已加载 ${item.input_paths.length} 张参考图`,
          );
        } else {
          $("#dropZone .text-muted").html(
            "📁 拖拽图片至此，或 <u>点击上传</u>",
          );
        }
      }

      // 4. 更新提示词预览
      updatePromptPreview();

      // 可选：滚动到表单顶部
      $("html, body").animate({ scrollTop: 0 }, 300);
    });

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
          // 渲染快捷图
          if (window.QuickAccess) window.QuickAccess.renderSidebar();
        } else {
          // 之前是 collapsed，现在展开 → 显示 ★
          $icon.html("★");
        }
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

    // 处理 drop
    $(document).on("drop", ".drag-target-item", function (e) {
      e.preventDefault(); // 通常也在这里 preventDefault，防止浏览器默认行为（如打开图片）
      const target = $(this).data("target");
      const item = window.__draggedItem || window.__currentDragItem;

      if (item && target === "quick") {
        // 快捷访问
        window.QuickAccess?.addImage(item);
      } else if (item && target == "edit") {
        // 图片编辑
        // 1. 切换到“图片编辑”标签
        const editTabBtn = document.querySelector("#image-split-tab");
        if (editTabBtn) {
          const tab = new bootstrap.Tab(editTabBtn);
          tab.show();
        }

        // 2. 显示图片（优先用 remoteUrl，兼容本地调试时用 localPath）
        const imgUrl = item.localPath;
        const $img = $("#editingImage");
        const $placeholder = $("#imageEditPlaceholder");

        $("#hiddenImageLoader").attr("src", imgUrl);
        $placeholder.hide();
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
      $("#dragTargetOverlay").hide();
    }
  });
})();
