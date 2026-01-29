// static/film-manager.js
// 影片管理模块 - 替代 localStorage，数据存储在服务器

window.FilmManager = (function () {
  let currentFilmId = null;
  let films = [];
  let onFilmChangeCallbacks = [];

  // 初始化
  async function init() {
    await loadFilms();
    
    // 尝试恢复上次选中的影片（从 localStorage 仅保存 ID）
    const savedFilmId = localStorage.getItem("currentFilmId");
    if (savedFilmId && films.find(f => f.id === savedFilmId)) {
      currentFilmId = savedFilmId;
    } else if (films.length > 0) {
      currentFilmId = films[0].id;
    }
    
    renderFilmSelector();
    return currentFilmId;
  }

  // 加载影片列表
  async function loadFilms() {
    try {
      const res = await fetch("/api/films");
      if (!res.ok) throw new Error("加载影片列表失败");
      films = await res.json();
    } catch (e) {
      console.error("[FilmManager] 加载影片列表失败:", e);
      films = [];
    }
  }

  // 获取当前影片 ID
  function getCurrentFilmId() {
    return currentFilmId;
  }

  // 获取当前影片信息
  function getCurrentFilm() {
    return films.find(f => f.id === currentFilmId);
  }

  // 获取所有影片
  function getFilms() {
    return [...films];
  }

  // 切换影片
  async function switchFilm(filmId) {
    if (filmId === currentFilmId) return;
    
    const film = films.find(f => f.id === filmId);
    if (!film) {
      showToast("影片不存在", "error");
      return;
    }
    
    currentFilmId = filmId;
    localStorage.setItem("currentFilmId", filmId);
    
    renderFilmSelector();
    
    // 触发回调
    onFilmChangeCallbacks.forEach(cb => cb(film));
    
    showToast(`已切换到影片: ${film.name}`, "success");
    return film;
  }

  // 创建影片
  async function createFilm(name, description = "") {
    try {
      const res = await fetch("/api/films", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "创建失败");
      }
      
      const film = await res.json();
      films.push(film);
      
      // 自动切换到新影片
      await switchFilm(film.id);
      
      showToast("影片创建成功", "success");
      return film;
    } catch (e) {
      showToast(e.message, "error");
      throw e;
    }
  }

  // 删除影片
  async function deleteFilm(filmId) {
    if (filmId === "default") {
      showToast("不能删除默认影片", "warning");
      return false;
    }
    
    try {
      const res = await fetch(`/api/films/${filmId}`, {
        method: "DELETE"
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "删除失败");
      }
      
      films = films.filter(f => f.id !== filmId);
      
      // 如果删除的是当前影片，切换到第一个
      if (currentFilmId === filmId && films.length > 0) {
        await switchFilm(films[0].id);
      }
      
      renderFilmSelector();
      showToast("影片删除成功", "success");
      return true;
    } catch (e) {
      showToast(e.message, "error");
      throw e;
    }
  }

  // 注册影片切换回调
  function onFilmChange(callback) {
    onFilmChangeCallbacks.push(callback);
  }

  // 渲染影片选择器
  function renderFilmSelector() {
    const $selector = $("#filmSelector");
    if ($selector.length === 0) return;

    const currentFilm = getCurrentFilm();
    
    // 更新下拉按钮文本
    $selector.find(".current-film-name").text(currentFilm ? currentFilm.name : "选择影片");
    
    // 更新下拉菜单
    const $menu = $selector.find(".dropdown-menu");
    $menu.empty();
    
    films.forEach(film => {
      const isActive = film.id === currentFilmId;
      $menu.append(`
        <li>
          <a class="dropdown-item ${isActive ? "active" : ""}" href="#" data-film-id="${film.id}">
            ${film.name}
            ${film.id === "default" ? "<span class=\"badge bg-secondary ms-2\">默认</span>" : ""}
          </a>
        </li>
      `);
    });
    
    $menu.append('<li><hr class="dropdown-divider"></li>');
    $menu.append(`
      <li>
        <a class="dropdown-item text-primary" href="#" id="createFilmBtn">
          <i class="bi bi-plus-lg"></i> 新建影片
        </a>
      </li>
    `);
    
    // 绑定切换事件
    $menu.off("click", "[data-film-id]").on("click", "[data-film-id]", function (e) {
      e.preventDefault();
      const filmId = $(this).data("film-id");
      switchFilm(filmId);
    });
    
    // 绑定创建事件
    $menu.off("click", "#createFilmBtn").on("click", "#createFilmBtn", function (e) {
      e.preventDefault();
      showCreateFilmModal();
    });
  }

  // 显示创建影片弹窗
  function showCreateFilmModal() {
    const modalId = "createFilmModal";
    
    // 移除已存在的弹窗
    $(`#${modalId}`).remove();
    
    const html = `
      <div class="modal fade" id="${modalId}" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content bg-dark text-light">
            <div class="modal-header">
              <h5 class="modal-title">新建影片</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">影片名称 *</label>
                <input type="text" class="form-control" id="newFilmName" placeholder="输入影片名称">
              </div>
              <div class="mb-3">
                <label class="form-label">描述</label>
                <textarea class="form-control" id="newFilmDesc" rows="2" placeholder="可选描述"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
              <button type="button" class="btn btn-primary" id="confirmCreateFilm">创建</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    $("body").append(html);
    
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
    
    // 聚焦输入框
    setTimeout(() => $("#newFilmName").focus(), 100);
    
    // 绑定创建按钮
    $("#confirmCreateFilm").off("click").on("click", async function () {
      const name = $("#newFilmName").val().trim();
      const desc = $("#newFilmDesc").val().trim();
      
      if (!name) {
        showToast("请输入影片名称", "warning");
        return;
      }
      
      $(this).prop("disabled", true).text("创建中...");
      
      try {
        await createFilm(name, desc);
        modal.hide();
      } finally {
        $(this).prop("disabled", false).text("创建");
      }
    });
    
    // 绑定回车键
    $("#newFilmName, #newFilmDesc").off("keypress").on("keypress", function (e) {
      if (e.which === 13 && !e.shiftKey) {
        e.preventDefault();
        $("#confirmCreateFilm").click();
      }
    });
    
    // 清理
    $(`#${modalId}`).on("hidden.bs.modal", function () {
      $(this).remove();
    });
  }

  return {
    init,
    getCurrentFilmId,
    getCurrentFilm,
    getFilms,
    switchFilm,
    createFilm,
    deleteFilm,
    onFilmChange,
    renderFilmSelector
  };
})();
