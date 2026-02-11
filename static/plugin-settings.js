// static/plugin-settings.js
// 插件设置管理

window.PluginSettings = (function () {
  let currentSettings = [];
  let currentFilmId = null;

  // 加载设置
  async function load(filmId) {
    currentFilmId = filmId;
    if (!filmId) return;

    try {
      const res = await fetch(`/api/films/${filmId}/plugin-settings`);
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      currentSettings = data.settings || [];
      return currentSettings;
    } catch (e) {
      console.error("[PluginSettings] 加载失败:", e);
      // 使用默认配置
      currentSettings = [
        { name: "nano_banana", enabled: true, model: "nano-banana" },
        { name: "nano_banana_fast", enabled: true, model: "nano-banana-fast" },
        { name: "seedream", enabled: true },
      ];
      return currentSettings;
    }
  }

  // 保存设置
  async function save(settings) {
    if (!currentFilmId) return false;

    try {
      const res = await fetch(`/api/films/${currentFilmId}/plugin-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error("保存失败");
      currentSettings = settings;
      showToast("设置已保存", "success", 2000);
      return true;
    } catch (e) {
      console.error("[PluginSettings] 保存失败:", e);
      showToast("保存失败", "error", 0);
      return false;
    }
  }

  // 显示设置弹窗
  function showModal() {
    const modalId = "pluginSettingsModal";
    $(`#${modalId}`).remove();

    const html = `
      <div class="modal fade" id="${modalId}" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content bg-dark text-light">
            <div class="modal-header">
              <h5 class="modal-title">🎨 生图插件设置</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p class="text-muted small mb-3">
                拖拽调整顺序，勾选启用/禁用。系统会按顺序尝试使用启用的插件。
              </p>
              <div id="pluginList" class="list-group">
                ${renderPluginList()}
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
              <button type="button" class="btn btn-primary" id="savePluginSettings">保存</button>
            </div>
          </div>
        </div>
      </div>
    `;

    $("body").append(html);

    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();

    // 绑定拖拽事件
    initDragSort();

    // 绑定保存按钮
    $("#savePluginSettings")
      .off("click")
      .on("click", async function () {
        const settings = [];
        $("#pluginList .plugin-item").each(function () {
          const name = $(this).data("name");
          const enabled = $(this).find(".plugin-enable").is(":checked");
          const setting = { name, enabled };
          
          settings.push(setting);
        });

        $(this).prop("disabled", true).text("保存中...");
        await save(settings);
        $(this).prop("disabled", false).text("保存");
        modal.hide();
      });

    // 清理
    $(`#${modalId}`).on("hidden.bs.modal", function () {
      $(this).remove();
    });
  }

  // 渲染插件列表
  function renderPluginList() {
    return currentSettings
      .map(
        (plugin, index) => `
      <div class="list-group-item plugin-item d-flex flex-column gap-2 bg-dark text-light border-secondary p-3" 
           data-name="${plugin.name}" data-index="${index}">
        <div class="d-flex align-items-center gap-3">
          <span class="drag-handle" style="cursor: grab; color: #666;">☰</span>
          <input type="checkbox" class="form-check-input plugin-enable" 
                 ${plugin.enabled ? "checked" : ""}>
          <span class="flex-grow-1">${getPluginDisplayName(plugin.name)}</span>
          <span class="badge ${plugin.enabled ? "bg-success" : "bg-secondary"}">
            ${plugin.enabled ? "启用" : "禁用"}
          </span>
        </div>
        ${renderModelSelect(plugin)}
      </div>
    `
      )
      .join("");
  }

  // 渲染模型选择（如果适用）
  function renderModelSelect(plugin) {
    // 暂无需要模型选择的插件
    return "";
  }

  // 获取插件显示名称
  function getPluginDisplayName(name) {
    const names = {
      nano_banana: "🍌 NanoBanana",
      nano_banana_fast: "🍌 NanoBanana Fast",
      seedream: "🔥 Seedream (火山)",
    };
    return names[name] || name;
  }

  // 初始化拖拽排序
  function initDragSort() {
    const list = document.getElementById("pluginList");
    if (!list) return;

    let draggedItem = null;

    $(list)
      .off("dragstart")
      .on("dragstart", ".plugin-item", function (e) {
        draggedItem = this;
        $(this).css("opacity", "0.5");
        e.originalEvent.dataTransfer.effectAllowed = "move";
      })
      .off("dragend")
      .on("dragend", ".plugin-item", function () {
        $(this).css("opacity", "");
        draggedItem = null;
      })
      .off("dragover")
      .on("dragover", ".plugin-item", function (e) {
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = "move";
        return false;
      })
      .off("drop")
      .on("drop", ".plugin-item", function (e) {
        e.stopPropagation();
        if (draggedItem !== this) {
          const allItems = $("#pluginList .plugin-item").toArray();
          const draggedIdx = allItems.indexOf(draggedItem);
          const droppedIdx = allItems.indexOf(this);

          if (draggedIdx < droppedIdx) {
            $(this).after(draggedItem);
          } else {
            $(this).before(draggedItem);
          }
        }
        return false;
      });

    // 设置 draggable
    $("#pluginList .plugin-item").attr("draggable", "true");

    // 复选框变更时更新徽章
    $(list)
      .off("change")
      .on("change", ".plugin-enable", function () {
        const enabled = $(this).is(":checked");
        const badge = $(this).siblings(".badge");
        if (enabled) {
          badge.removeClass("bg-secondary").addClass("bg-success").text("启用");
        } else {
          badge.removeClass("bg-success").addClass("bg-secondary").text("禁用");
        }
      });
  }

  return {
    load,
    save,
    showModal,
    getSettings: () => [...currentSettings],
  };
})();
