document.addEventListener("DOMContentLoaded", () => {

  // 要素取得
  const titleInput = document.getElementById("taskTitleInput");
  const estimateSelect = document.getElementById("taskEstimateSelect");
  const addButton = document.getElementById("addTaskButton");
  const taskList = document.getElementById("taskList");
  const completedTaskList = document.getElementById("completedTaskList");
  const footerSummary = document.getElementById("footerSummary");

  /** @typedef {{id:string,title:string,estimate:number,actual?:number,actualMs?:number,createdAt:number,order:number,done:boolean,elapsedMs:number,isRunning:boolean,lastStartAt?:number}} Task */
  /** @type {Task[]} */
  let tasks = loadTasks();
  let tickHandle = null;
  let editingTaskId = null;

  // --- 追加処理 ---
  addButton.addEventListener("click", () => {
    const title = (titleInput.value || "").trim();
    const estimate = parseInt(String(estimateSelect.value || "").trim(), 10);
    if (!title) {
      alert("タスク名を入力してください");
      return;
    }
    if (!Number.isFinite(estimate) || estimate <= 0) {
      alert("予測時間(分)は1以上の数値で入力してください");
      return;
    }
    const newTask = /** @type {Task} */({
      id: crypto.randomUUID(),
      title,
      estimate,
      createdAt: Date.now(),
      order: tasks.length ? Math.max(...tasks.map(t => t.order)) + 1 : 1,
      done: false,
      elapsedMs: 0,
      isRunning: false
    });
    tasks.push(newTask);
    persistTasks(tasks);
    titleInput.value = "";
    estimateSelect.value = "10";
    render();
  });

  // --- レンダリング ---
  function render() {
    // 並び順
    tasks.sort((a, b) => {
      if (a.isRunning && !b.isRunning) return -1;
      if (!a.isRunning && b.isRunning) return 1;
      if (!a.done && b.done) return -1;
      if (a.done && !b.done) return 1;
      return a.order - b.order;
    });

    if (taskList) taskList.innerHTML = "";
    if (completedTaskList) completedTaskList.innerHTML = "";

    for (const task of tasks) {
      const li = document.createElement("li");
      li.className = "task-item";
      if (task.isRunning) li.classList.add("is-running");
      if (task.done) li.classList.add("is-done");
      li.dataset.id = task.id;
      li.draggable = !task.done;

      const { remainSec, elapsedMs, progress, over } = calculateProgress(task);
      const estimateSeconds = Math.max(0, Math.round(task.estimate * 60));
      const actualSeconds = getActualSeconds(task);
      const actualLabel = actualSeconds != null ? formatDurationFromSeconds(actualSeconds) : "";
      const hasStarted = task.isRunning || task.elapsedMs > 0;
      const canEditEstimate = !task.done && !task.isRunning && !hasStarted;
      const liveLabel = formatRemain(remainSec);
      const timeLabel = task.done
        ? (actualLabel || formatDurationFromSeconds(estimateSeconds))
        : liveLabel;
      const timeClass = [
        "task-time",
        task.done ? "task-time-done" : task.isRunning ? "task-time-running" : hasStarted ? "task-time-progress" : "task-time-planned"
      ].join(" ");
      const badgeCls = badgeClass(task);
      const badgeTxt = badgeLabel(task);
      const isEditingTitle = editingTaskId === task.id;
      const actions = [];
      if (!task.done) {
        actions.push(`<button class="btn" data-action="toggle">${task.isRunning ? "||" : "▶"}</button>`);
      }
      if (!task.done && task.isRunning) {
        actions.push(`<button class="btn btn-complete" data-action="complete" title="完了">✔</button>`);
      }
      if (!task.isRunning) {
        actions.push(`<button class="btn btn-delete" data-action="delete" title="削除">-</button>`);
      }

      const presetSeconds = [300, 600, 1200, 1800, 2700, 3600];
      if (!presetSeconds.includes(estimateSeconds)) {
        presetSeconds.push(estimateSeconds);
        presetSeconds.sort((a, b) => a - b);
      }
      const timeCellHtml = canEditEstimate
        ? `<label class="task-time task-time-editable" aria-label="予測時間を選択">
            <select class="input select task-estimate-select">
              ${presetSeconds.map(sec => `<option value="${sec}" ${sec === estimateSeconds ? "selected" : ""}>${formatDurationFromSeconds(sec)}</option>`).join("")}
            </select>
          </label>`
        : `<div class="${timeClass}">${timeLabel}</div>`;

      li.innerHTML = `
        <div class="drag-handle" aria-label="ドラッグで並び替え" title="ドラッグで並び替え">≡</div>
        ${isEditingTitle ? `<input class="task-title-input" type="text" value="${escapeHtml(task.title)}" aria-label="タスク名を編集" />` : `<button class="task-title" type="button">${escapeHtml(task.title)}</button>`}
        ${timeCellHtml}
        <div class="progress ${over ? "over" : ""}"><div class="bar" style="width:${Math.min(100, progress)}%"></div></div>
        <div class="${badgeCls}" title="差分">${badgeTxt}</div>
        <div class="task-actions">${actions.join("")}</div>
      `;

      if (isEditingTitle) {
        const inputEl = li.querySelector(".task-title-input");
        if (inputEl instanceof HTMLInputElement) {
          requestAnimationFrame(() => {
            inputEl.focus();
            inputEl.select();
          });
          const commit = () => {
            const value = inputEl.value.trim();
            if (!value) {
              alert("タスク名を入力してください");
              inputEl.focus();
              return;
            }
            task.title = value;
            editingTaskId = null;
            persistTasks(tasks);
            render();
          };
          const cancel = () => {
            editingTaskId = null;
            render();
          };
          inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          });
          inputEl.addEventListener("blur", () => {
            if (editingTaskId === task.id) commit();
          });
        }
      } else {
        const titleButton = li.querySelector(".task-title");
        if (titleButton instanceof HTMLButtonElement) {
          titleButton.addEventListener("click", (e) => {
            e.stopPropagation();
            editingTaskId = task.id;
            render();
          });
        }
      }

      if (canEditEstimate) {
        const selectEl = li.querySelector(".task-estimate-select");
        if (selectEl instanceof HTMLSelectElement) {
          selectEl.addEventListener("change", (e) => {
            e.stopPropagation();
            const value = Number(selectEl.value);
            if (!Number.isFinite(value) || value <= 0) return;
            task.estimate = value / 60;
            persistTasks(tasks);
            render();
          });
        }
      }

      li.addEventListener("click", (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const action = target.dataset.action;
        if (!action) return;
        if (action === "delete") {
          tasks = tasks.filter(t => t.id !== task.id);
          persistTasks(tasks);
          render();
        } else if (action === "complete") {
          if (!task.isRunning) return;
          stopTimer(task);
          const { elapsedMs } = calculateProgress(task);
          task.done = true;
          task.actualMs = elapsedMs;
          task.actual = Math.max(0, Math.round(elapsedMs / 60000));
          persistTasks(tasks);
          render();
        } else if (action === "toggle") {
          if (task.isRunning) {
            stopTimer(task);
          } else {
            startTimer(task);
          }
          persistTasks(tasks);
          render();
        }
      });

      if (!task.done) {
        li.addEventListener("dragstart", (e) => onDragStart(e, task.id));
        li.addEventListener("dragover", onDragOver);
        li.addEventListener("dragleave", onDragLeave);
        li.addEventListener("drop", (e) => onDrop(e, task.id));
      }

      const container = task.done ? completedTaskList : taskList;
      if (container) {
        container.appendChild(li);
      }
    }

    if (footerSummary) {
      const total = tasks.length;
      const done = tasks.filter(t => t.done).length;
      const totalEstimateSec = tasks.reduce((s, t) => s + Math.round(t.estimate * 60), 0);
      const totalActualSec = tasks.reduce((s, t) => s + (t.done ? (getActualSeconds(t) || 0) : 0), 0);
      const totalDiffSec = tasks.reduce((s, t) => {
        if (!t.done) return s;
        const actualSec = getActualSeconds(t);
        if (actualSec == null) return s;
        return s + (actualSec - Math.round(t.estimate * 60));
      }, 0);
      const parts = [];
      parts.push(`${done}/${total} 完了`);
      parts.push(`計 ${formatDurationFromSeconds(totalEstimateSec)}`);
      if (done > 0) {
        parts.push(`実績 ${formatDurationFromSeconds(totalActualSec)}`);
        parts.push(formatSignedSeconds(totalDiffSec));
      } else {
        parts.push(`実績 --:--`);
        parts.push(`--:--`);
      }
      footerSummary.textContent = parts.join(" · ");
    }
  }

  // --- DnD ハンドラ ---
  function onDragStart(/** @type {DragEvent} */ e, id) {
    e.dataTransfer?.setData("text/plain", id);
    const el = e.target;
    if (el instanceof HTMLElement) el.classList.add("dragging");
  }
  function onDragOver(/** @type {DragEvent} */ e) {
    e.preventDefault();
    const el = e.currentTarget;
    if (el instanceof HTMLElement) el.classList.add("drop-target");
  }
  function onDragLeave(/** @type {DragEvent} */ e) {
    const el = e.currentTarget;
    if (el instanceof HTMLElement) el.classList.remove("drop-target");
  }
  function onDrop(/** @type {DragEvent} */ e, targetId) {
    e.preventDefault();
    const draggedId = e.dataTransfer?.getData("text/plain");
    const el = e.currentTarget;
    if (el instanceof HTMLElement) el.classList.remove("drop-target");
    if (!draggedId || draggedId === targetId) return;

    // 並び入れ替え
    const dragged = tasks.find(t => t.id === draggedId);
    const target = tasks.find(t => t.id === targetId);
    if (!dragged || !target) return;
    const draggedOrder = dragged.order;
    dragged.order = target.order;

    // 入れ替え時の他要素の調整
    for (const t of tasks) {
      if (t.id === dragged.id) continue;
      if (draggedOrder < target.order) {
        // 下から上へ移動
        if (t.order > draggedOrder && t.order <= target.order) t.order -= 1;
      } else if (draggedOrder > target.order) {
        // 上から下へ移動
        if (t.order < draggedOrder && t.order >= target.order) t.order += 1;
      }
    }
    persistTasks(tasks);
    render();
  }

  // --- ユーティリティ ---
  function startTimer(task) {
    task.isRunning = true;
    task.lastStartAt = Date.now();
    ensureTicking();
  }
  function stopTimer(task) {
    if (!task.isRunning || !task.lastStartAt) return;
    task.elapsedMs += Date.now() - task.lastStartAt;
    task.isRunning = false;
    task.lastStartAt = undefined;
  }
  function ensureTicking() {
    if (tickHandle) return;
    tickHandle = setInterval(() => {
      let changed = false;
      for (const t of tasks) {
        if (t.isRunning && t.lastStartAt) {
          changed = true;
        }
      }
      if (changed) {
        // 軽量更新: 全体再描画でも十分軽い規模
        render();
      } else {
        clearInterval(tickHandle);
        tickHandle = null;
      }
    }, 1000);
  }

  function calculateProgress(task) {
    const estimateMs = task.estimate * 60 * 1000;
    const runningDelta = task.isRunning && task.lastStartAt ? (Date.now() - task.lastStartAt) : 0;
    const elapsedMs = task.elapsedMs + runningDelta;
    const remainMs = Math.max(0, estimateMs - elapsedMs);
    const remainSec = Math.ceil(remainMs / 1000);
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const progress = estimateMs > 0 ? (elapsedMs / estimateMs) * 100 : 0;
    const over = elapsedMs > estimateMs;
    return { remainSec, elapsedSec, elapsedMs, progress, over };
  }

  function badgeClass(task) {
    if (!task.done) return "badge";
    const diffMinutes = getDiffMinutes(task);
    if (diffMinutes == null) return "badge";
    if (diffMinutes <= -5) return "badge badge-good";
    if (diffMinutes <= 5) return "badge";
    if (diffMinutes <= 15) return "badge badge-warn";
    return "badge badge-bad";
  }
  function badgeLabel(task) {
    if (!task.done) return "";
    const diffMinutes = getDiffMinutes(task);
    if (diffMinutes == null) return "";
    const diffSeconds = Math.round(diffMinutes * 60);
    return formatSignedSeconds(diffSeconds);
  }
  function formatSignedSeconds(sec) {
    if (sec === 0) return formatDurationFromSeconds(0);
    const sign = sec > 0 ? "+" : "-";
    return sign + formatDurationFromSeconds(Math.abs(sec));
  }
  function formatRemain(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function formatDurationFromSeconds(totalSec) {
    const sec = Math.max(0, Math.round(totalSec));
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  function getActualSeconds(task) {
    if (typeof task.actualMs === "number") return Math.round(task.actualMs / 1000);
    if (typeof task.actual === "number" && Number.isFinite(task.actual)) return Math.round(task.actual * 60);
    return null;
  }
  function getDiffMinutes(task) {
    const actualSec = getActualSeconds(task);
    if (actualSec == null) return null;
    return actualSec / 60 - task.estimate;
  }
  function escapeHtml(s) { return s.replace(/[&<>"]+/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])); }

  function persistTasks(list) {
    localStorage.setItem("tasks", JSON.stringify(list));
  }
  function loadTasks() {
    try {
      const raw = localStorage.getItem("tasks");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((t) => ({
        id: String(t.id || crypto.randomUUID()),
        title: String(t.title || ""),
        estimate: Number(t.estimate || 0),
        actual: typeof t.actual === "number" ? t.actual : undefined,
        actualMs: typeof t.actualMs === "number" ? Number(t.actualMs) : undefined,
        createdAt: Number(t.createdAt || Date.now()),
        order: Number(t.order || 1),
        done: Boolean(t.done),
        elapsedMs: Number(t.elapsedMs || 0),
        isRunning: Boolean(t.isRunning),
        lastStartAt: typeof t.lastStartAt === "number" ? Number(t.lastStartAt) : undefined
      })).filter(t => t.title && t.estimate > 0);
    } catch {
      return [];
    }
  }

  // 初回描画
  render();
});


