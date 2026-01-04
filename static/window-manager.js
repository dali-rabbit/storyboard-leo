// 浮窗管理器
(function () {
  // 显示/隐藏窗口
  $(document).on("click", ".toolbar-btn", function () {
    const targetId = $(this).data("window");
    const $win = $("#" + targetId);
    if ($win.hasClass("d-none")) {
      $win.removeClass("d-none");
      // 渲染内容（首次或每次？建议每次）
      if (targetId === "quickAccessWindow") {
        window.QuickAccess.renderSidebar();
      } else if (targetId === "historyWindow") {
        renderHistoryWindow();
      }
    } else {
      $win.addClass("d-none");
    }
  });

  // 最小化按钮
  $(document).on("click", ".minimize-btn", function () {
    const target = $(this).data("target");
    $("#" + target).addClass("d-none");
  });

  // 拖动窗口（仅 header）
  $(document).on("mousedown", ".floating-window .window-header", function (e) {
    const $win = $(this).closest(".floating-window");
    const startX = e.clientX - $win.offset().left;
    const startY = e.clientY - $win.offset().top;

    const move = (e) => {
      let left = e.clientX - startX;
      let top = e.clientY - startY;
      // 允许部分移出屏幕
      $win.css({ left: left + "px", top: top + "px" });
    };

    const up = () => {
      $(document).off("mousemove", move).off("mouseup", up);
    };

    $(document).on("mousemove", move).on("mouseup", up);
  });

  // 渲染历史记录窗口
  function renderHistoryWindow() {
    const $content = $("#historyWindow .window-content");
    $content.empty();
    // 复用原历史记录 HTML 逻辑（简化版）
    $.get("/history?page=1&limit=20", function (data) {
      let html = "";
      data.records.forEach((item) => {
        const url = item.result_paths[0] || item.result_urls[0] || "";
        html += `
          <div class="mb-2 border rounded p-1" draggable="true" data-history-item='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
            <img src="${url}" class="w-100" style="aspect-ratio:1/1; object-fit:cover;" />
          </div>
        `;
      });
      $content.html(html);
    });
  }
})();
