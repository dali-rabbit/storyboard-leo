// main.js
(function () {
  const state = window.AIImageState;
  const ITEMS_PER_PAGE = 12;
  // 快捷栏数据结构：{ "1": [url1, url2, ...], "2": [], ... }
  let quickSlots = JSON.parse(localStorage.getItem("quickSlots")) || {
    "1": [], "2": [], "3": [], "4": [], "5": []
  };

  function saveQuickSlots() {
    console.log("save");
    localStorage.setItem("quickSlots", JSON.stringify(quickSlots));
  }

  function renderQuickSlot(slot) {
    console.log("render");
    const $container = $(`.quick-item[data-slot="${slot}"] .quick-thumbnails`);
    $container.empty();
    const urls = quickSlots[slot] || [];
    urls.forEach(url => {
      const $thumb = $(`
        <div class="quick-thumb" draggable="true" data-url="${url}">
          <img src="${url}" loading="lazy">
          <span class="remove-btn">×</span>
        </div>
      `);
      $container.append($thumb);
    });
  }
  
  // 初始化所有快捷栏
  function initQuickSlots() {
    for (let i = 1; i <= 5; i++) {
      renderQuickSlot(String(i));
    }
  }

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
                        <div class="card">
                            <a href="${url}" data-lightbox="history">
                                <img src="${url}" class="history-img w-100" style="aspect-ratio:1/1;object-fit:cover;">
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
                                <button class="btn btn-sm btn-outline-primary w-100 mt-1 dropdown-toggle"
                                        type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                  发送到…
                                </button>
                                <ul class="dropdown-menu bg-dark text-light w-100">
                                  <li><a class="dropdown-item text-light" href="#" data-target="slot-1">快捷栏1</a></li>
                                  <li><a class="dropdown-item text-light" href="#" data-target="slot-2">快捷栏2</a></li>
                                  <li><a class="dropdown-item text-light" href="#" data-target="slot-3">快捷栏3</a></li>
                                  <li><a class="dropdown-item text-light" href="#" data-target="slot-4">快捷栏4</a></li>
                                  <li><a class="dropdown-item text-light" href="#" data-target="slot-5">快捷栏5</a></li>
                                  <li><hr class="dropdown-divider bg-secondary"></li>
                                  <li><a class="dropdown-item text-light" href="#" data-target="image-split">图片拆分</a></li>
                                  <li><a class="dropdown-item text-light" href="#" data-target="storyboard">故事板</a></li>
                                </ul>
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


    // 初始化快捷栏
    initQuickSlots();

    // 如果你希望在切换标签时执行某些 JS 逻辑（例如懒加载、初始化组件等），可以监听 Bootstrap 的 shown.bs.tab 事件：
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach((tab) => {
      tab.addEventListener("shown.bs.tab", (event) => {
        const targetId = event.target.getAttribute("data-bs-target");
        console.log("切换到标签:", targetId);
        // 例如：if (targetId === '#storyboard') 初始化故事板编辑器
      });
    });

    // 侧边栏展开/收起
    $("#toggleSidebarBtn").click(function () {
      $("#quickSidebar").toggleClass("collapsed");
    });

    $(document).on("click", ".dropdown-item", function (e) {
      e.preventDefault();
      const target = $(this).data("target");
      const item = $(this).closest(".card").find(".view-params").data("item");
    
      if (target.startsWith("slot-")) {
        const slot = target.split("-")[1]; // "slot-1" → "1"
        const imageUrl = item.result_paths[0]; // 假设用首图
        if (!imageUrl) return;
    
        // 去重 + 限6张
        let list = quickSlots[slot] || [];
        if (!list.includes(imageUrl)) {
          if (list.length >= 6) {
            alert(`快捷栏${slot}已满（最多6张）`);
            return;
          }
          list.push(imageUrl);
          quickSlots[slot] = list;
          saveQuickSlots();
          renderQuickSlot(slot);
        }
        // 可选：自动展开侧边栏
        $("#quickSidebar").removeClass("collapsed");
      } else if (target === "image-split") {
        // TODO: 跳转到图片拆分 Tab
        $('#image-split-tab').tab('show');
      } else if (target === "storyboard") {
        // TODO: 跳转到故事板 Tab
        $('#storyboard-tab').tab('show');
      }
    });


    // 移除图片
    $(document).on("click", ".quick-thumb .remove-btn", function (e) {
      e.stopPropagation();
      const $thumb = $(this).closest(".quick-thumb");
      const url = $thumb.data("url");
      const slot = $thumb.closest(".quick-item").data("slot");

      quickSlots[slot] = (quickSlots[slot] || []).filter(u => u !== url);
      saveQuickSlots();
      renderQuickSlot(slot);
    });

    // 拖拽到上传区
    $(document).on("dragstart", ".quick-thumb", function (e) {
      $(this).addClass("dragging");
      e.originalEvent.dataTransfer.setData("text/plain", $(this).data("url"));
    });

    $(document).on("dragend", ".quick-thumb", function () {
      $(this).removeClass("dragging");
    });



  });
})();
