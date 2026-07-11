const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 19;
const MIN_VIEW_HOUR = 0;
const MAX_VIEW_HOUR = 24;
const SLOT_MINUTES = 15;
const SLOTS_PER_HOUR = 4;
const MIN_EVENT_MINUTES = 15;
const STORAGE_PREFIX = "day-planner:";
const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;
const NOTIFICATION_IMAGES_KEY = `${STORAGE_PREFIX}notification-images`;
const NOTIFICATION_IMAGE_KEY = `${STORAGE_PREFIX}notification-image`;
const SCHEDULE_KEY = `${STORAGE_PREFIX}schedule`;
const DEFAULT_TAG = "task";

const NOTIFICATION_SOUNDS = [
  { id: "chime", label: "チャイム" },
  { id: "bell", label: "ベル" },
  { id: "digital", label: "デジタル" },
  { id: "soft", label: "ソフト" },
  { id: "off", label: "なし" },
];

let viewStartHour = DEFAULT_START_HOUR;
let viewEndHour = DEFAULT_END_HOUR;
let notifiedEventEnds = new Set();
/** @type {AudioContext | null} */
let notificationAudioCtx = null;

function START_HOUR() {
  return viewStartHour;
}

function END_HOUR() {
  return viewEndHour;
}

const TAGS = {
  task: { label: "タスク" },
  schedule: { label: "予定" },
  break: { label: "休憩" },
};

const DEFAULT_TAG_AUTO_COMPLETE = {
  task: false,
  schedule: true,
  break: true,
};

const DEFAULT_TAG_FILL_MOVABLE = {
  task: true,
  schedule: false,
  break: true,
};

const DEFAULT_TAG_NOTIFY = {
  task: true,
  schedule: false,
  break: true,
};

const state = {
  date: todayISO(),
  events: [],
  dayMemo: "",
  selectedId: null,
  selectedIds: [],
  selectionAnchorId: null,
  sidebarTab: "selection",
  nowViewMode: "task",
  notificationSound: "chime",
  notificationImages: [],
  tagAutoComplete: { ...DEFAULT_TAG_AUTO_COMPLETE },
  tagFillMovable: { ...DEFAULT_TAG_FILL_MOVABLE },
  tagNotify: { ...DEFAULT_TAG_NOTIFY },
  saveTimer: null,
  loading: false,
  routineMode: false,
  editingRoutineId: null,
  viewMode: "calendar",
  boardSort: "duration",
  boardOrder: null,
};

const ROUTINE_KEY = `${STORAGE_PREFIX}routine`;

/** GitHub Pages 等の公開環境ではローカル API を使わない */
function isLocalServerMode() {
  const host = location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function isStaticHosting() {
  return !isLocalServerMode();
}

/** @type {null | { version: number, schedule: { events: unknown[], memo: string }, routines: unknown[], settings: Record<string, unknown> }} */
let fileData = null;
let useFileStorage = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let fileSaveTimer = null;

async function initFileStorage() {
  if (!isLocalServerMode()) {
    useFileStorage = false;
    fileData = null;
    return false;
  }
  try {
    const res = await fetch("/api/data");
    if (!res.ok) throw new Error("server unavailable");
    fileData = await res.json();
    useFileStorage = true;
    migrateLocalStorageToFileIfNeeded();
    return true;
  } catch {
    useFileStorage = false;
    fileData = null;
    return false;
  }
}

function migrateLocalStorageToFileIfNeeded() {
  if (!useFileStorage || !fileData) return;
  let migrated = false;

  try {
    let raw = localStorage.getItem(SCHEDULE_KEY);
    if (!raw) raw = readLegacyScheduleRaw(todayISO());
    if (raw) {
      const parsed = JSON.parse(raw);
      const hasSchedule =
        (Array.isArray(parsed?.events) && parsed.events.length > 0) ||
        (typeof parsed?.memo === "string" && parsed.memo.trim());
      const fileEmpty =
        (!fileData.schedule?.events?.length) &&
        !(typeof fileData.schedule?.memo === "string" && fileData.schedule.memo.trim());
      if (hasSchedule && fileEmpty) {
        fileData.schedule = {
          events: Array.isArray(parsed.events) ? parsed.events : [],
          memo: typeof parsed.memo === "string" ? parsed.memo : "",
        };
        migrated = true;
      }
    }
  } catch {
    // ignore
  }

  try {
    const raw = localStorage.getItem(ROUTINE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const localRoutines = Array.isArray(parsed?.routines)
        ? parsed.routines
        : Array.isArray(parsed?.events)
          ? [{ id: newId(), name: "ルーティーン", events: parsed.events }]
          : [];
      if (localRoutines.length > 0 && !(fileData.routines?.length > 0)) {
        fileData.routines = localRoutines;
        migrated = true;
      }
    }
  } catch {
    // ignore
  }

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.startHour === "number" && typeof parsed?.endHour === "number") {
        fileData.settings = {
          ...fileData.settings,
          startHour: parsed.startHour,
          endHour: parsed.endHour,
        };
        migrated = true;
      }
    }
  } catch {
    // ignore
  }

  if (migrated) scheduleFileSave(true);
}

function syncStateToFileData() {
  if (!useFileStorage || !fileData) return;
  if (!state.routineMode) {
    fileData.schedule = { events: state.events, memo: state.dayMemo };
  }
  fileData.routines = routines;
  fileData.settings = {
    ...(fileData.settings ?? {}),
    startHour: viewStartHour,
    endHour: viewEndHour,
    sidebarCollapsed: appEl?.classList.contains("sidebar-collapsed") ?? false,
  };
}

async function saveFileData() {
  if (!useFileStorage || !fileData) return;
  syncStateToFileData();
  try {
    await fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fileData),
    });
  } catch {
    // ignore
  }
}

function scheduleFileSave(immediate = false) {
  if (!useFileStorage) return;
  if (fileSaveTimer) clearTimeout(fileSaveTimer);
  if (immediate) {
    fileSaveTimer = null;
    saveFileData();
    return;
  }
  fileSaveTimer = setTimeout(() => {
    fileSaveTimer = null;
    saveFileData();
  }, 400);
}

function flushFileSave() {
  if (fileSaveTimer) {
    clearTimeout(fileSaveTimer);
    fileSaveTimer = null;
  }
  if (useFileStorage) saveFileData();
}

const els = {
  timeAxis: document.getElementById("time-axis"),
  grid: document.getElementById("grid"),
  sidebar: document.getElementById("sidebar"),
  eventTitle: document.getElementById("event-title"),
  eventDone: document.getElementById("event-done"),
  eventNotes: document.getElementById("event-notes"),
  tagPicker: document.getElementById("tag-picker"),
  taskList: document.getElementById("task-list"),
  btnAddTask: document.getElementById("btn-add-task"),
  btnDeleteEvent: document.getElementById("btn-delete-event"),
  viewStartHour: document.getElementById("view-start-hour"),
  viewEndHour: document.getElementById("view-end-hour"),
  btnUpdateRange: document.getElementById("btn-update-range"),
  panelSelection: document.getElementById("panel-selection"),
  panelNow: document.getElementById("panel-now"),
  panelRoutine: document.getElementById("panel-routine"),
  panelMemo: document.getElementById("panel-memo"),
  dayMemo: document.getElementById("day-memo"),
  dayMemoHighlight: document.getElementById("day-memo-highlight"),
  analysisTotal: document.getElementById("analysis-total"),
  analysisDone: document.getElementById("analysis-done"),
  analysisTodo: document.getElementById("analysis-todo"),
  analysisFree: document.getElementById("analysis-free"),
  analysisBarDone: document.getElementById("analysis-bar-done"),
  analysisBarTodo: document.getElementById("analysis-bar-todo"),
  analysisBarFree: document.getElementById("analysis-bar-free"),
  analysisOntime: document.getElementById("analysis-ontime"),
  analysisOverdue: document.getElementById("analysis-overdue"),
  selectionEmpty: document.getElementById("selection-empty"),
  selectionContent: document.getElementById("selection-content"),
  nowEmpty: document.getElementById("now-empty"),
  nowContent: document.getElementById("now-content"),
  nowEventTitle: document.getElementById("now-event-title"),
  nowElapsed: document.getElementById("now-elapsed"),
  nowRemaining: document.getElementById("now-remaining"),
  nowProgressRing: document.getElementById("now-progress-ring"),
  nowTasksSection: document.getElementById("now-tasks-section"),
  nowTaskList: document.getElementById("now-task-list"),
  nowNotesSection: document.getElementById("now-notes-section"),
  nowNotes: document.getElementById("now-notes"),
  nowAddTask: document.getElementById("now-add-task"),
  nowExpand: document.getElementById("now-expand"),
  nowViewTabs: document.querySelectorAll(".now-view-tab"),
  nowTaskView: document.getElementById("now-task-view"),
  nowClockView: document.getElementById("now-clock-view"),
  sidebarTabs: document.querySelectorAll(".sidebar-tab"),
  gridScaffold: document.getElementById("grid-scaffold"),
  hourClockRange: document.getElementById("hour-clock-range"),
  hourClockIndicators: document.getElementById("hour-clock-indicators"),
  hourClockLabels: document.getElementById("hour-clock-labels"),
  hourClockHandGroup: document.getElementById("hour-clock-hand-group"),
  taskBoard: document.getElementById("task-board"),
  taskBoardList: document.getElementById("task-board-list"),
  taskBoardEmpty: document.getElementById("task-board-empty"),
  taskMarkdown: document.getElementById("task-markdown"),
  taskMarkdownEditor: document.getElementById("task-markdown-editor"),
  btnLoadMarkdown: document.getElementById("btn-load-markdown"),
  btnCopyMarkdown: document.getElementById("btn-copy-markdown"),
  viewTabs: document.querySelectorAll(".cal-header .view-tab"),
  boardSortBtns: document.querySelectorAll(".board-sort-btn"),
  settingsView: document.getElementById("settings-view"),
  notificationSound: document.getElementById("notification-sound"),
  btnTestNotification: document.getElementById("btn-test-notification"),
  btnTestPopup: document.getElementById("btn-test-popup"),
  notificationImageInput: document.getElementById("notification-image-input"),
  notificationImageList: document.getElementById("notification-image-list"),
  notificationImageEmpty: document.getElementById("notification-image-empty"),
  btnClearNotificationImages: document.getElementById("btn-clear-notification-images"),
  tagBehaviorRows: document.getElementById("tag-behavior-rows"),
  notificationPopup: document.getElementById("notification-popup"),
  notificationPopupMessage: document.getElementById("notification-popup-message"),
  notificationPopupDetail: document.getElementById("notification-popup-detail"),
  notificationPopupImage: document.getElementById("notification-popup-image"),
  notificationPopupClose: document.getElementById("notification-popup-close"),
};

const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * 52;

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}時間${m}分`;
  if (h > 0) return `${h}時間`;
  return `${m}分`;
}

function formatMinutesSeconds(minutes) {
  const totalSec = Math.max(0, Math.round(minutes * 60));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function toFullwidthDigits(value) {
  return String(value).replace(/\d/g, (digit) => String.fromCharCode(0xff10 + Number(digit)));
}

function formatTabDocumentTitle(remainingMinutes, eventTitle) {
  const time = toFullwidthDigits(formatMinutesSeconds(remainingMinutes));
  const name = (eventTitle || "（無題）").trim() || "（無題）";
  return `${time}｜${name}`;
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}

function hourClockArcPath(cx, cy, r, startDeg, endDeg) {
  const span = endDeg - startDeg;
  if (span <= 0.01) return "";
  const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(toRad(startDeg));
  const y0 = cy + r * Math.sin(toRad(startDeg));
  const x1 = cx + r * Math.cos(toRad(endDeg));
  const y1 = cy + r * Math.sin(toRad(endDeg));
  const large = span > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

function tagClockStroke(tag, done) {
  const t = normalizeTag(tag);
  if (done) return "rgb(154 205 50 / 88%)";
  if (t === "schedule") return "rgb(255 152 60 / 88%)";
  if (t === "break") return "rgb(255 255 255 / 72%)";
  return "rgb(98 160 255 / 88%)";
}

function hourClockPastEmptyStroke() {
  return "rgb(255 255 255 / 20%)";
}

function appendHourClockArc(container, startDeg, endDeg, stroke, className) {
  const arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arc.setAttribute("d", hourClockArcPath(110, 110, 92, startDeg, endDeg));
  arc.setAttribute("fill", "none");
  arc.setAttribute("stroke", stroke);
  arc.setAttribute("stroke-width", "8");
  arc.setAttribute("stroke-linecap", "butt");
  arc.setAttribute("class", className);
  container.appendChild(arc);
}

function formatHourClockRange(hour) {
  const h = String(hour).padStart(2, "0");
  const next = String((hour + 1) % 24).padStart(2, "0");
  return `${h}:00 – ${next}:00`;
}

function eventsInSlot(slotStart, slotEnd) {
  return state.events
    .filter((e) => {
      const start = minutesFromMidnight(e.start);
      const end = minutesFromMidnight(e.end);
      return start < slotEnd && end > slotStart;
    })
    .sort(
      (a, b) => minutesFromMidnight(a.start) - minutesFromMidnight(b.start)
        || minutesFromMidnight(a.end) - minutesFromMidnight(b.end),
    );
}

function updateHourClockHand() {
  const now = new Date();
  const minute = now.getMinutes() + now.getSeconds() / 60;
  els.hourClockHandGroup?.setAttribute("transform", `rotate(${minute * 6} 110 110)`);
}

const HOUR_CLOCK_CORNER = ["pos-tr", "pos-br", "pos-bl", "pos-tl"];

function renderHourClock() {
  const now = new Date();
  const hour = now.getHours();
  const hourStart = hour * 60;
  const minuteInHour = nowMinutes() - hour * 60;

  els.hourClockRange.textContent = formatHourClockRange(hour);

  els.hourClockIndicators.innerHTML = "";
  for (let i = 0; i < SLOTS_PER_HOUR; i += 1) {
    const slotStartRel = i * SLOT_MINUTES;
    const slotEndRel = slotStartRel + SLOT_MINUTES;
    const arcEndRel = Math.min(slotEndRel, minuteInHour);
    if (arcEndRel <= slotStartRel) continue;

    const slotStart = hourStart + slotStartRel;
    const slotEnd = hourStart + slotEndRel;
    const events = eventsInSlot(slotStart, slotEnd);
    const startDeg = (slotStartRel / 60) * 360;
    const endDeg = (arcEndRel / 60) * 360;

    if (events.length === 0) {
      appendHourClockArc(
        els.hourClockIndicators,
        startDeg,
        endDeg,
        hourClockPastEmptyStroke(),
        "hour-clock-indicator past-empty",
      );
      continue;
    }

    const primary = events[0];
    appendHourClockArc(
      els.hourClockIndicators,
      startDeg,
      endDeg,
      tagClockStroke(primary.tag, primary.done),
      `hour-clock-indicator tag-${normalizeTag(primary.tag)}${primary.done ? " done" : ""}`,
    );
  }

  els.hourClockLabels.innerHTML = "";
  for (let i = 0; i < SLOTS_PER_HOUR; i += 1) {
    const slotStart = hourStart + i * SLOT_MINUTES;
    const slotEnd = slotStart + SLOT_MINUTES;
    const events = eventsInSlot(slotStart, slotEnd);
    if (events.length === 0) continue;

    const primary = events[0];
    const label = document.createElement("p");
    label.className = `hour-clock-label ${HOUR_CLOCK_CORNER[i]} tag-${normalizeTag(primary.tag)}`;
    if (primary.done) label.classList.add("done");
    const names = events.map((e) => (e.title || "（無題）").trim() || "（無題）");
    label.textContent = names.length > 1 ? names.join(" / ") : names[0];
    els.hourClockLabels.appendChild(label);
  }

  updateHourClockHand();
}

function currentEventAtNow() {
  const now = nowMinutes();
  return state.events
    .filter((e) => {
      const start = minutesFromMidnight(e.start);
      const end = minutesFromMidnight(e.end);
      return now >= start && now < end;
    })
    .sort(
      (a, b) => minutesFromMidnight(a.start) - minutesFromMidnight(b.start)
        || minutesFromMidnight(a.end) - minutesFromMidnight(b.end),
    )[0] ?? null;
}

function initSidebarTabs() {
  els.sidebarTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setSidebarTab(tab.dataset.tab);
    });
  });
}

function applySidebarPanelVisibility() {
  els.panelSelection.hidden = state.sidebarTab !== "selection";
  els.panelNow.hidden = state.sidebarTab !== "now";
  els.panelRoutine.hidden = state.sidebarTab !== "routine";
  els.panelMemo.hidden = state.sidebarTab !== "memo";
}

function refreshActiveSidebarPanel() {
  applySidebarPanelVisibility();
  switch (state.sidebarTab) {
    case "selection":
      updateSelectionPanel();
      break;
    case "now":
      renderNowPanel(true);
      break;
    case "routine":
      renderRoutinePanel();
      break;
    case "memo":
      renderMemoPanel();
      break;
    default:
      break;
  }
}

function setSidebarTab(tab) {
  state.sidebarTab = tab;
  els.sidebarTabs.forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  refreshActiveSidebarPanel();
}

function updateSelectionPanel() {
  const hasSelection = hasEventSelection();
  els.selectionEmpty.hidden = hasSelection;
  els.selectionContent.hidden = !hasSelection;
}

function renderMemoPanel() {
  if (els.dayMemo.value !== state.dayMemo) {
    els.dayMemo.value = state.dayMemo;
  }
  syncMemoHighlight();
}

function syncMemoHighlight() {
  const text = els.dayMemo.value.replace(/\r\n/g, "\n");
  els.dayMemoHighlight.innerHTML = text
    .split("\n")
    .map((line) => formatMemoHighlightLine(line))
    .join("\n");
  els.dayMemoHighlight.scrollTop = els.dayMemo.scrollTop;
  els.dayMemoHighlight.scrollLeft = els.dayMemo.scrollLeft;
}

const MEMO_BULLET_RE = /^(\s*)-\s?(.*)$/;
const MEMO_LIST_INDENT = "  ";

function escapeMemoHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMemoHighlightLine(line) {
  const escaped = escapeMemoHtml(line);
  if (line.startsWith("## ")) {
    return `<span class="memo-h2">${escaped}</span>`;
  }
  const bullet = line.match(MEMO_BULLET_RE);
  if (bullet) {
    const indent = bullet[1].replace(/\t/g, MEMO_LIST_INDENT);
    const content = escapeMemoHtml(bullet[2]);
    const pad = indent
      ? `<span class="memo-bullet-indent">${"&nbsp;".repeat(indent.length)}</span>`
      : "";
    return `${pad}<span class="memo-bullet-marker">•</span> ${content}`;
  }
  return escaped;
}

function getTextareaLineRange(text, pos) {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const nextBreak = text.indexOf("\n", pos);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  return { lineStart, lineEnd, line: text.slice(lineStart, lineEnd) };
}

function applyTextareaEdit(textarea, value, cursor) {
  textarea.value = value;
  textarea.setSelectionRange(cursor, cursor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleMemoListKeydown(ev) {
  const textarea = ev.target;
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  if (!textarea.classList.contains("sidebar-notes")) return;
  if (ev.isComposing || ev.keyCode === 229) return;

  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart !== selectionEnd) return;

  const { lineStart, lineEnd, line } = getTextareaLineRange(value, selectionStart);
  const col = selectionStart - lineStart;
  const bullet = line.match(MEMO_BULLET_RE);

  if (ev.key === "Enter" && !ev.shiftKey) {
    if (!bullet) return;
    ev.preventDefault();
    const indent = bullet[1];
    const content = bullet[2];
    if (content.trim() === "") {
      const newValue = value.slice(0, lineStart) + value.slice(lineEnd);
      applyTextareaEdit(textarea, newValue, lineStart);
      return;
    }
    const insert = `\n${indent}- `;
    const newValue = value.slice(0, selectionStart) + insert + value.slice(selectionStart);
    applyTextareaEdit(textarea, newValue, selectionStart + insert.length);
    return;
  }

  if (ev.key === "Tab") {
    if (!bullet) return;
    ev.preventDefault();
    const indent = bullet[1];
    const content = bullet[2];
    let newIndent = indent;

    if (ev.shiftKey) {
      if (indent.endsWith("\t")) {
        newIndent = indent.slice(0, -1);
      } else if (indent.length >= MEMO_LIST_INDENT.length) {
        newIndent = indent.slice(MEMO_LIST_INDENT.length);
      } else {
        return;
      }
    } else {
      newIndent = indent + MEMO_LIST_INDENT;
    }

    const newLine = `${newIndent}- ${content}`;
    const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
    applyTextareaEdit(textarea, newValue, selectionStart + (newLine.length - line.length));
    return;
  }

  if (ev.key === "Backspace" && bullet) {
    const indent = bullet[1];
    const markerLen = indent.length + 2;
    if (col !== markerLen) return;
    ev.preventDefault();
    const newLine = `${indent}${bullet[2]}`;
    const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
    applyTextareaEdit(textarea, newValue, lineStart + indent.length);
  }
}

function bindMemoListEditor(textarea) {
  textarea.addEventListener("keydown", handleMemoListKeydown);
}

let nowRenderedEventId;

function setNowViewMode(mode) {
  state.nowViewMode = mode;
  els.nowViewTabs.forEach((btn) => {
    const active = btn.dataset.nowView === mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (state.sidebarTab === "now") renderNowPanel(true);
}

function renderNowPanel(force = false) {
  const isClock = state.nowViewMode === "clock";
  els.nowTaskView.hidden = isClock;
  els.nowClockView.hidden = !isClock;

  if (isClock) {
    renderHourClock();
    return;
  }

  const event = currentEventAtNow();
  if (!event) {
    els.nowEmpty.hidden = false;
    els.nowContent.hidden = true;
    els.nowEmpty.textContent = "No data";
    nowRenderedEventId = null;
    if (appEl.classList.contains("now-fullscreen")) setNowFullscreen(false);
    return;
  }

  els.nowEmpty.hidden = true;
  els.nowContent.hidden = false;

  const startMin = minutesFromMidnight(event.start);
  const endMin = minutesFromMidnight(event.end);
  const now = nowMinutes();
  const elapsed = Math.max(0, now - startMin);
  const remaining = Math.max(0, endMin - now);
  const total = endMin - startMin;
  const progress = total > 0 ? Math.min(1, elapsed / total) : 0;

  els.nowElapsed.textContent = formatDuration(total);
  els.nowRemaining.textContent = formatMinutesSeconds(remaining);
  els.nowProgressRing.style.strokeDashoffset = String(
    PROGRESS_RING_CIRCUMFERENCE * progress,
  );

  const changed = force || event.id !== nowRenderedEventId;
  if (changed) {
    nowRenderedEventId = event.id;
    els.nowEventTitle.textContent = event.title || "（無題）";
    els.nowEventTitle.classList.toggle("done", !!event.done);
    renderTaskList(event, els.nowTaskList);
    if (els.nowNotes.value !== (event.notes ?? "")) {
      els.nowNotes.value = event.notes ?? "";
    }
  }
}

function addTaskNow() {
  const event = currentEventAtNow();
  if (!event) return;
  addTaskInto(event, els.nowTaskList);
}

const DEFAULT_DOC_TITLE = "day planner";

function updateNowTab() {
  const event = currentEventAtNow();
  const nextTitle = event
    ? formatTabDocumentTitle(
      Math.max(0, minutesFromMidnight(event.end) - nowMinutes()),
      event.title,
    )
    : DEFAULT_DOC_TITLE;
  if (document.title !== nextTitle) document.title = nextTitle;
}

function formatSlotsWithDuration(slots, minutes) {
  return `${slots}マス ${formatDuration(minutes)}`;
}

function formatCount(n) {
  return `${n}件`;
}

function setItemDone(item, done) {
  item.done = !!done;
  if (done) {
    item.completedAt = timeFromMinutes(nowMinutes());
  } else {
    item.completedAt = null;
  }
}

function subtasksWithText(event) {
  return (event.tasks ?? []).filter((t) => (t.text ?? "").trim());
}

function subtaskCountDisplay(event) {
  const tasks = subtasksWithText(event);
  const total = tasks.length;
  if (total === 0) return null;
  const done = tasks.filter((t) => t.done).length;
  return {
    text: done > 0 ? `${done}/${total}` : String(total),
    ariaLabel: done > 0 ? `子タスク ${done}/${total}` : `子タスク ${total}件`,
  };
}

function syncSubtaskCountInWrap(wrap, display, className) {
  if (!wrap) return;
  let badge = wrap.querySelector(`:scope > .${className}`);
  if (!display) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = className;
    wrap.appendChild(badge);
  }
  badge.textContent = display.text;
  badge.setAttribute("aria-label", display.ariaLabel);
}

function appendSubtaskCountBadge(parent, event, className) {
  syncSubtaskCountInWrap(parent, subtaskCountDisplay(event), className);
}

function refreshEventSubtaskCounts(eventId) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return;
  const display = subtaskCountDisplay(event);

  els.grid?.querySelectorAll(`.event[data-id="${eventId}"]`).forEach((el) => {
    syncSubtaskCountInWrap(el.querySelector(".event-title-wrap"), display, "event-subtask-count");
  });

  const card = els.taskBoardList?.querySelector(`.task-card[data-id="${eventId}"]`);
  syncSubtaskCountInWrap(card?.querySelector(".task-card-title-wrap"), display, "task-card-subtask-count");
}

function hasIncompleteSubtasks(event) {
  return subtasksWithText(event).some((t) => !t.done);
}

function trySetEventDone(event, done) {
  if (done && hasIncompleteSubtasks(event)) {
    shakeEvent(event.id);
    return false;
  }
  setItemDone(event, done);
  return true;
}

const SHAKE_CLASS = "event-shake";

function shakeEvent(eventId) {
  const targets = [];
  els.grid?.querySelectorAll(`.event[data-id="${eventId}"]`).forEach((el) => targets.push(el));
  const boardCard = els.taskBoardList?.querySelector(`.task-card[data-id="${eventId}"]`);
  if (boardCard) targets.push(boardCard);
  if (state.selectedId === eventId) {
    const sidebarRow = document.querySelector(".sidebar-title-row");
    if (sidebarRow) targets.push(sidebarRow);
  }
  for (const el of targets) {
    el.classList.remove(SHAKE_CLASS);
    void el.offsetWidth;
    el.classList.add(SHAKE_CLASS);
    el.addEventListener("animationend", () => el.classList.remove(SHAKE_CLASS), { once: true });
  }
}

function isEventPast(event) {
  const end = minutesFromMidnight(event.end);
  const start = minutesFromMidnight(event.start);
  if (end <= start) return false;
  return nowMinutes() >= end;
}

function syncCalendarDate() {
  const today = todayISO();
  if (state.date === today) return;
  state.date = today;
}

function normalizeTagFlags(source, defaults) {
  const result = { ...defaults };
  if (!source || typeof source !== "object") return result;
  for (const id of Object.keys(TAGS)) {
    if (typeof source[id] === "boolean") result[id] = source[id];
  }
  return result;
}

function isAutoCompletableTag(event) {
  const tag = normalizeTag(event.tag);
  return !!state.tagAutoComplete[tag];
}

function isFillMovableTag(event) {
  const tag = normalizeTag(event.tag);
  return !!state.tagFillMovable[tag];
}

function isNotifyEnabledTag(event) {
  const tag = normalizeTag(event.tag);
  return !!state.tagNotify[tag];
}

function updateFillGapsButtonTitle() {
  const btn = document.getElementById("btn-fill-gaps");
  if (!btn) return;
  const movable = Object.entries(TAGS)
    .filter(([id]) => state.tagFillMovable[id])
    .map(([, { label }]) => label);
  const fixed = Object.entries(TAGS)
    .filter(([id]) => !state.tagFillMovable[id])
    .map(([, { label }]) => label);
  const movableText = movable.length > 0 ? movable.join("・") : "なし";
  const fixedText = fixed.length > 0 ? `${fixed.join("・")}は固定` : "固定なし";
  btn.title = `詰める (F)：1件選択で以降を詰める / 2件以上で選択範囲を詰める（doneは無視、対象: ${movableText}、${fixedText}）`;
}

function renderTagBehaviorSettings() {
  if (!els.tagBehaviorRows) return;
  els.tagBehaviorRows.innerHTML = "";
  for (const [id, { label }] of Object.entries(TAGS)) {
    const row = document.createElement("div");
    row.className = "tag-behavior-row";
    row.role = "row";

    const nameCell = document.createElement("span");
    nameCell.className = "tag-behavior-cell tag-behavior-label";
    nameCell.role = "cell";
    nameCell.textContent = label;

    const autoCell = document.createElement("label");
    autoCell.className = "tag-behavior-cell";
    autoCell.role = "cell";
    const autoInput = document.createElement("input");
    autoInput.type = "checkbox";
    autoInput.dataset.tag = id;
    autoInput.dataset.setting = "autoComplete";
    autoInput.checked = !!state.tagAutoComplete[id];
    autoInput.setAttribute("aria-label", `${label}を終了後に自動完了`);
    autoCell.appendChild(autoInput);

    const fillCell = document.createElement("label");
    fillCell.className = "tag-behavior-cell";
    fillCell.role = "cell";
    const fillInput = document.createElement("input");
    fillInput.type = "checkbox";
    fillInput.dataset.tag = id;
    fillInput.dataset.setting = "fillMovable";
    fillInput.checked = !!state.tagFillMovable[id];
    fillInput.setAttribute("aria-label", `${label}を詰める対象にする`);
    fillCell.appendChild(fillInput);

    const notifyCell = document.createElement("label");
    notifyCell.className = "tag-behavior-cell";
    notifyCell.role = "cell";
    const notifyInput = document.createElement("input");
    notifyInput.type = "checkbox";
    notifyInput.dataset.tag = id;
    notifyInput.dataset.setting = "notify";
    notifyInput.checked = !!state.tagNotify[id];
    notifyInput.setAttribute("aria-label", `${label}を未完了のまま終了したときに通知`);
    notifyCell.appendChild(notifyInput);

    row.append(nameCell, autoCell, fillCell, notifyCell);
    els.tagBehaviorRows.appendChild(row);
  }
}

function applyTagBehaviorFromUI() {
  if (!els.tagBehaviorRows) return;
  for (const input of els.tagBehaviorRows.querySelectorAll("input[type='checkbox']")) {
    const tag = input.dataset.tag;
    if (!Object.hasOwn(TAGS, tag)) continue;
    if (input.dataset.setting === "autoComplete") {
      state.tagAutoComplete[tag] = input.checked;
    } else if (input.dataset.setting === "fillMovable") {
      state.tagFillMovable[tag] = input.checked;
    } else if (input.dataset.setting === "notify") {
      state.tagNotify[tag] = input.checked;
    }
  }
  updateFillGapsButtonTitle();
  saveViewSettings();
}

function initTagBehaviorSettingsUI() {
  if (!els.tagBehaviorRows) return;
  renderTagBehaviorSettings();
  updateFillGapsButtonTitle();
  els.tagBehaviorRows.addEventListener("change", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== "checkbox") return;
    applyTagBehaviorFromUI();
    if (target.dataset.setting === "autoComplete") {
      autoCompletePastEvents();
    }
    if (target.dataset.setting === "notify" && target.checked && "Notification" in window) {
      Notification.requestPermission();
    }
  });
}

function autoCompletePastEvent(event) {
  event.done = true;
  event.completedAt = event.end;
  event.autoDoneApplied = true;
  for (const task of event.tasks ?? []) {
    if (task.done) continue;
    task.done = true;
    task.completedAt = event.end;
  }
}

function autoCompletePastEvents({ render = true } = {}) {
  let changed = false;

  for (const event of state.events) {
    if (
      event.done
      || event.autoDoneApplied
      || !isAutoCompletableTag(event)
      || !isEventPast(event)
    ) continue;
    autoCompletePastEvent(event);
    changed = true;
  }

  if (!changed) return false;

  const primary = selectedEvent();
  if (primary) {
    syncEventDoneUI(primary.done);
    fillSidebar();
  }
  if (render) {
    renderEvents();
    refreshAlternateViews();
    if (state.viewMode === "settings") renderAnalysisPanel();
  }
  scheduleSave();
  return true;
}

function completionMinute(item, fallbackEnd) {
  if (item.completedAt) return minutesFromMidnight(item.completedAt);
  if (item.done) return fallbackEnd;
  return null;
}

function scheduleUnits(event) {
  const tasks = (event.tasks ?? []).filter((t) => (t.text ?? "").trim());
  if (tasks.length > 0) return tasks;
  return [event];
}

function computeScheduleAdherence() {
  const now = nowMinutes();
  const rangeStart = dayStartMinutes();
  const rangeEnd = dayEndMinutes();
  let onTime = 0;
  let overdueIncomplete = 0;

  for (const event of state.events) {
    const start = minutesFromMidnight(event.start);
    const end = minutesFromMidnight(event.end);
    if (end <= rangeStart || start >= rangeEnd) continue;

    for (const unit of scheduleUnits(event)) {
      if (unit.done) {
        const completed = completionMinute(unit, end);
        if (completed !== null && completed <= end) onTime += 1;
      } else if (now >= end) {
        overdueIncomplete += 1;
      }
    }
  }

  return { onTime, overdueIncomplete };
}

function computeSlotBreakdown() {
  const rangeEnd = dayEndMinutes();
  const rangeStart = dayStartMinutes();

  const intervals = state.events.map((e) => ({
    start: minutesFromMidnight(e.start),
    end: minutesFromMidnight(e.end),
    done: !!e.done,
  }));

  let done = 0;
  let todo = 0;
  let free = 0;

  for (let t = rangeStart; t < rangeEnd; t += SLOT_MINUTES) {
    let covered = false;
    let coveredDone = false;
    for (const it of intervals) {
      if (it.start <= t && it.end > t) {
        covered = true;
        if (it.done) coveredDone = true;
      }
    }
    if (coveredDone) done += 1;
    else if (covered) todo += 1;
    else free += 1;
  }

  const total = done + todo + free;
  return { done, todo, free, total };
}

function renderAnalysisPanel() {
  const { done, todo, free, total } = computeSlotBreakdown();
  const { onTime, overdueIncomplete } = computeScheduleAdherence();

  els.analysisTotal.textContent = formatSlotsWithDuration(total, total * SLOT_MINUTES);
  els.analysisDone.textContent = formatSlotsWithDuration(done, done * SLOT_MINUTES);
  els.analysisTodo.textContent = formatSlotsWithDuration(todo, todo * SLOT_MINUTES);
  els.analysisFree.textContent = formatSlotsWithDuration(free, free * SLOT_MINUTES);
  els.analysisOntime.textContent = formatCount(onTime);
  els.analysisOverdue.textContent = formatCount(overdueIncomplete);

  const pct = (n) => (total > 0 ? `${(n / total) * 100}%` : "0%");
  els.analysisBarDone.style.width = pct(done);
  els.analysisBarTodo.style.width = pct(todo);
  els.analysisBarFree.style.width = pct(free);
}

function getNotificationAudioContext() {
  if (!notificationAudioCtx) {
    notificationAudioCtx = new AudioContext();
  }
  if (notificationAudioCtx.state === "suspended") {
    notificationAudioCtx.resume();
  }
  return notificationAudioCtx;
}

function playNotificationTone(freq, start, duration, type = "sine", gain = 0.14) {
  const ctx = getNotificationAudioContext();
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playNotificationPattern(soundId, start) {
  switch (soundId) {
    case "bell":
      playNotificationTone(659, start, 0.7, "triangle", 0.18);
      return 0.75;
    case "digital":
      playNotificationTone(1200, start, 0.12, "square", 0.08);
      playNotificationTone(900, start + 0.16, 0.12, "square", 0.08);
      playNotificationTone(1200, start + 0.32, 0.14, "square", 0.08);
      return 0.5;
    case "soft":
      playNotificationTone(520, start, 0.55, "sine", 0.12);
      return 0.6;
    case "chime":
    default:
      playNotificationTone(880, start, 0.22, "sine", 0.14);
      playNotificationTone(1175, start + 0.24, 0.38, "sine", 0.12);
      return 0.68;
  }
}

function playNotificationSound(soundId) {
  if (soundId === "off") return;
  const ctx = getNotificationAudioContext();
  const gap = 0.5;
  let t = ctx.currentTime;
  for (let i = 0; i < 2; i += 1) {
    const duration = playNotificationPattern(soundId, t);
    t += duration + gap;
  }
}

async function showEventNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission !== "granted") return;
  new Notification(title, {
    body,
    silent: true,
  });
}

function notificationImageSrc(img) {
  return img?.url || img?.data || "";
}

function pickRandomNotificationImage() {
  if (!state.notificationImages.length) return null;
  const index = Math.floor(Math.random() * state.notificationImages.length);
  return notificationImageSrc(state.notificationImages[index]) || null;
}

function showNotificationPopup(message, detail) {
  els.notificationPopupMessage.textContent = message;
  els.notificationPopupDetail.textContent = detail || "";
  els.notificationPopupDetail.hidden = !detail;

  const imageData = pickRandomNotificationImage();
  if (imageData) {
    els.notificationPopupImage.src = imageData;
    els.notificationPopupImage.hidden = false;
  } else {
    els.notificationPopupImage.removeAttribute("src");
    els.notificationPopupImage.hidden = true;
  }

  els.notificationPopup.hidden = false;
}

function closeNotificationPopup() {
  els.notificationPopup.hidden = true;
}

function triggerNotification(event) {
  const title = event.title?.trim() || "（無題）";
  const timeRange = `${event.start}–${event.end}`;

  if (state.notificationSound !== "off") {
    playNotificationSound(state.notificationSound);
  }

  showEventNotification("タスク未完了", `終了時刻を過ぎています: ${timeRange} ${title}`);
  showNotificationPopup("タスクが終わっていません", `${timeRange} ${title}`);
}

function resetNotificationState() {
  notifiedEventEnds.clear();
}

function checkEventNotifications() {
  const now = new Date();
  const currentMinute = now.getHours() * 60 + now.getMinutes();

  for (const event of state.events) {
    if (event.done) continue;
    if (!isNotifyEnabledTag(event)) continue;

    const start = minutesFromMidnight(event.start);
    const end = minutesFromMidnight(event.end);

    const endKey = `end:${event.id}@${event.end}`;
    if (currentMinute === end && end > start && !notifiedEventEnds.has(endKey)) {
      notifiedEventEnds.add(endKey);
      triggerNotification(event);
    }
  }
}

function newNotificationImageId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeNotificationImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .filter((img) => img && typeof img.data === "string" && img.data.startsWith("data:image/"))
    .map((img) => ({
      id: typeof img.id === "string" ? img.id : newNotificationImageId(),
      data: img.data,
    }));
}

function renderNotificationImageList() {
  els.notificationImageList.innerHTML = "";
  const empty = state.notificationImages.length === 0;
  els.notificationImageEmpty.hidden = !empty;
  els.btnClearNotificationImages.hidden = empty;

  for (const img of state.notificationImages) {
    const item = document.createElement("div");
    item.className = "notification-image-item";

    const preview = document.createElement("img");
    preview.className = "notification-image-thumb";
    preview.src = notificationImageSrc(img);
    preview.alt = "通知ポップアップ画像";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "notification-image-remove";
    removeBtn.setAttribute("aria-label", "画像を削除");
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => removeNotificationImage(img.id));

    item.append(preview, removeBtn);
    els.notificationImageList.appendChild(item);
  }
}

async function migrateLocalNotificationImagesToServer() {
  if (!useFileStorage) return;
  let images = [];
  try {
    const raw = localStorage.getItem(NOTIFICATION_IMAGES_KEY);
    if (raw) {
      images = normalizeNotificationImages(JSON.parse(raw));
    } else {
      const legacy = localStorage.getItem(NOTIFICATION_IMAGE_KEY);
      if (legacy) images = [{ id: newNotificationImageId(), data: legacy }];
    }
  } catch {
    return;
  }
  if (!images.length) return;
  for (const img of images) {
    try {
      await fetch("/api/notification-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: img.data }),
      });
    } catch {
      // ignore single file failures
    }
  }
  localStorage.removeItem(NOTIFICATION_IMAGES_KEY);
  localStorage.removeItem(NOTIFICATION_IMAGE_KEY);
}

async function loadNotificationImages() {
  if (useFileStorage) {
    await migrateLocalNotificationImagesToServer();
    try {
      const res = await fetch("/api/notification-images");
      if (res.ok) {
        const payload = await res.json();
        state.notificationImages = Array.isArray(payload.images)
          ? payload.images.map((img) => ({
              id: img.id,
              url: img.url,
            }))
          : [];
        if (payload.migrated) {
          const dataRes = await fetch("/api/data");
          if (dataRes.ok) fileData = await dataRes.json();
        }
        renderNotificationImageList();
        return;
      }
    } catch {
      // fall through
    }
    state.notificationImages = [];
    renderNotificationImageList();
    return;
  }

  let images = [];
  try {
    const raw = localStorage.getItem(NOTIFICATION_IMAGES_KEY);
    if (raw) {
      images = normalizeNotificationImages(JSON.parse(raw));
    } else {
      const legacy = localStorage.getItem(NOTIFICATION_IMAGE_KEY);
      if (legacy) images = [{ id: newNotificationImageId(), data: legacy }];
    }
  } catch {
    images = [];
  }
  state.notificationImages = images;
  renderNotificationImageList();
}

function saveNotificationImagesLocal() {
  const images = state.notificationImages;
  try {
    if (images.length > 0) {
      localStorage.setItem(NOTIFICATION_IMAGES_KEY, JSON.stringify(images));
    } else {
      localStorage.removeItem(NOTIFICATION_IMAGES_KEY);
    }
    localStorage.removeItem(NOTIFICATION_IMAGE_KEY);
  } catch {
    // ignore quota errors
  }
}

function compressNotificationImage(dataUrl, maxWidth = 720, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

async function handleNotificationImageUpload(fileList) {
  if (!fileList?.length) return;
  for (const file of fileList) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const raw = await readImageFileAsDataUrl(file);
      const data = await compressNotificationImage(raw);
      if (useFileStorage) {
        const res = await fetch("/api/notification-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });
        if (res.ok) {
          const image = await res.json();
          state.notificationImages.push({ id: image.id, url: image.url });
        }
      } else {
        state.notificationImages.push({ id: newNotificationImageId(), data });
      }
    } catch {
      // ignore single file failures
    }
  }
  renderNotificationImageList();
  if (!useFileStorage) saveNotificationImagesLocal();
  els.notificationImageInput.value = "";
}

async function removeNotificationImage(id) {
  if (useFileStorage) {
    try {
      const res = await fetch(`/api/notification-images/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
    } catch {
      return;
    }
  }
  state.notificationImages = state.notificationImages.filter((img) => img.id !== id);
  renderNotificationImageList();
  if (!useFileStorage) saveNotificationImagesLocal();
}

async function clearNotificationImages() {
  if (useFileStorage) {
    try {
      const res = await fetch("/api/notification-images", { method: "DELETE" });
      if (!res.ok) return;
    } catch {
      return;
    }
  }
  state.notificationImages = [];
  renderNotificationImageList();
  if (!useFileStorage) saveNotificationImagesLocal();
  els.notificationImageInput.value = "";
}

function syncNotificationSettingsUI() {
  els.notificationSound.value = state.notificationSound;
}

function initNotificationSettingsUI() {
  els.notificationSound.innerHTML = "";
  for (const sound of NOTIFICATION_SOUNDS) {
    const opt = document.createElement("option");
    opt.value = sound.id;
    opt.textContent = sound.label;
    els.notificationSound.appendChild(opt);
  }
  syncNotificationSettingsUI();
}

function renderSettingsView() {
  syncNotificationSettingsUI();
  renderTagBehaviorSettings();
  updateFillGapsButtonTitle();
  renderNotificationImageList();
  renderAnalysisPanel();
}

function applyNotificationSettingsFromUI() {
  state.notificationSound = els.notificationSound.value;
  saveViewSettings();
}

function refreshSidebarPanels() {
  refreshActiveSidebarPanel();
}

let dragState = null;
let suppressEventClick = false;
const DRAG_THRESHOLD_PX = 4;

function todayISO() {
  return formatDateISO(new Date());
}

function formatDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysISO(date, days) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateISO(d);
}

function minutesFromMidnight(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function timeFromMinutes(total) {
  const clamped = Math.max(0, Math.min(24 * 60, total));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function snapMinutes(total) {
  return Math.round(total / SLOT_MINUTES) * SLOT_MINUTES;
}

function dayStartMinutes() {
  return START_HOUR() * 60;
}

function dayEndMinutes() {
  return END_HOUR() * 60;
}

function hourCount() {
  return END_HOUR() - START_HOUR();
}

function applyLoadedSettings(data) {
  if (typeof data.startHour === "number" && typeof data.endHour === "number") {
    viewStartHour = data.startHour;
    viewEndHour = data.endHour;
  }
  if (
    typeof data.notificationSound === "string"
    && NOTIFICATION_SOUNDS.some((s) => s.id === data.notificationSound)
  ) {
    state.notificationSound = data.notificationSound;
  }
  state.tagAutoComplete = normalizeTagFlags(data.tagAutoComplete, DEFAULT_TAG_AUTO_COMPLETE);
  state.tagFillMovable = normalizeTagFlags(data.tagFillMovable, DEFAULT_TAG_FILL_MOVABLE);
  if (data.tagNotify && typeof data.tagNotify === "object") {
    state.tagNotify = normalizeTagFlags(data.tagNotify, DEFAULT_TAG_NOTIFY);
  } else if (typeof data.notificationsEnabled === "boolean") {
    // 旧・全体オンオフ設定からの移行
    state.tagNotify = {
      task: data.notificationsEnabled,
      schedule: false,
      break: data.notificationsEnabled,
    };
  } else {
    state.tagNotify = { ...DEFAULT_TAG_NOTIFY };
  }
}

function loadViewSettings() {
  if (useFileStorage && fileData?.settings) {
    applyLoadedSettings(fileData.settings);
  } else {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) applyLoadedSettings(JSON.parse(raw));
    } catch {
      // ignore
    }
  }
  viewStartHour = Math.max(MIN_VIEW_HOUR, Math.min(MAX_VIEW_HOUR - 1, viewStartHour));
  viewEndHour = Math.max(viewStartHour + 1, Math.min(MAX_VIEW_HOUR, viewEndHour));
  syncNotificationSettingsUI();
  renderTagBehaviorSettings();
  updateFillGapsButtonTitle();
}

function saveViewSettings() {
  const payload = {
    startHour: viewStartHour,
    endHour: viewEndHour,
    notificationSound: state.notificationSound,
    tagAutoComplete: { ...state.tagAutoComplete },
    tagFillMovable: { ...state.tagFillMovable },
    tagNotify: { ...state.tagNotify },
  };
  if (useFileStorage && fileData) {
    fileData.settings = {
      ...(fileData.settings ?? {}),
      ...payload,
    };
    scheduleFileSave();
    return;
  }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function initViewRangeSelects() {
  els.viewStartHour.innerHTML = "";
  els.viewEndHour.innerHTML = "";
  for (let h = MIN_VIEW_HOUR; h < MAX_VIEW_HOUR; h += 1) {
    const startOpt = document.createElement("option");
    startOpt.value = String(h);
    startOpt.textContent = `${String(h).padStart(2, "0")}:00`;
    els.viewStartHour.appendChild(startOpt);
  }
  for (let h = MIN_VIEW_HOUR + 1; h <= MAX_VIEW_HOUR; h += 1) {
    const endOpt = document.createElement("option");
    endOpt.value = String(h);
    endOpt.textContent = `${String(h).padStart(2, "0")}:00`;
    els.viewEndHour.appendChild(endOpt);
  }
  els.viewStartHour.value = String(viewStartHour);
  els.viewEndHour.value = String(viewEndHour);
}

function applyViewRange() {
  syncLayout();
  buildAxes();
  buildGrid();
  renderEvents();
  renderNowLine();
  if (state.selectedId) fillSidebar({ skipTasks: true });
  refreshActiveSidebarPanel();
}

function updateRangeToNow() {
  const hour = Math.max(
    MIN_VIEW_HOUR,
    Math.min(MAX_VIEW_HOUR - 1, Math.floor(nowMinutes() / 60)),
  );
  viewStartHour = hour;
  if (viewStartHour >= viewEndHour) {
    viewEndHour = Math.min(MAX_VIEW_HOUR, viewStartHour + 1);
  }
  els.viewStartHour.value = String(viewStartHour);
  els.viewEndHour.value = String(viewEndHour);
  saveViewSettings();
  applyViewRange();
}

function cellStartMinutes(hour, col) {
  return hour * 60 + col * SLOT_MINUTES;
}

function gridRowForHour(hour) {
  return hour - START_HOUR() + 1;
}

function gridColForSlot(col) {
  return col + 1;
}

function normalizeTag(tag) {
  return Object.hasOwn(TAGS, tag) ? tag : DEFAULT_TAG;
}

function eventTagClass(tag) {
  return `tag-${normalizeTag(tag)}`;
}

function newId() {
  return crypto.randomUUID();
}

function initTagPicker() {
  els.tagPicker.innerHTML = "";
  for (const [id, { label }] of Object.entries(TAGS)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tag-option";
    btn.dataset.tag = id;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      setSelectedTag(id);
    });
    els.tagPicker.appendChild(btn);
  }
}

function setSelectedTag(tag) {
  const event = selectedEvent();
  if (!event) return;
  event.tag = normalizeTag(tag);
  updateTagPickerUI(event.tag);
  renderEvents();
  scheduleSave();
}

function updateTagPickerUI(tag) {
  const normalized = normalizeTag(tag);
  els.tagPicker.querySelectorAll(".tag-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tag === normalized);
  });
}

function selectedEvent() {
  return state.events.find((e) => e.id === state.selectedId) ?? null;
}

function normalizeEvent(event) {
  event.tag = normalizeTag(event.tag);
  event.done = !!event.done;
  if (!event.done) event.completedAt = null;
  event.autoDoneApplied = !!event.autoDoneApplied;
  if (
    !event.autoDoneApplied
    && event.done
    && isAutoCompletableTag(event)
    && event.completedAt === event.end
  ) {
    event.autoDoneApplied = true;
  }
  if (Array.isArray(event.tasks)) {
    for (const task of event.tasks) {
      task.done = !!task.done;
      if (!task.done) task.completedAt = null;
    }
  }
  return event;
}

function assignEventColumns(evs) {
  // Stable left-to-right ordering: greedy interval-graph coloring reset per
  // connected component. Only used to keep an event's relative position
  // consistent across the sub-regions it is rendered in.
  const sorted = [...evs].sort((a, b) => a.start - b.start || a.end - b.end);
  const columns = [];
  const columnOf = new Map();
  let groupMaxEnd = -1;

  for (const it of sorted) {
    if (it.start >= groupMaxEnd) columns.length = 0;
    let col = columns.findIndex((end) => end <= it.start);
    if (col === -1) {
      col = columns.length;
      columns.push(it.end);
    } else {
      columns[col] = it.end;
    }
    columnOf.set(it.id, col);
    groupMaxEnd = Math.max(groupMaxEnd, it.end);
  }

  return columnOf;
}

function buildEventPieces(item, evs, columnOf, visStart, visEnd) {
  // Split the event at every point where the set of concurrently overlapping
  // events changes (and at hour boundaries so each piece fits one grid row).
  // Each piece is only divided into as many lanes as there are events actually
  // overlapping during that specific sub-range.
  const clippedStart = Math.max(item.start, visStart);
  const clippedEnd = Math.min(item.end, visEnd);

  const points = new Set([clippedStart, clippedEnd]);
  for (let h = Math.floor(clippedStart / 60) + 1; h * 60 < clippedEnd; h += 1) {
    points.add(h * 60);
  }
  for (const other of evs) {
    if (other.start > clippedStart && other.start < clippedEnd) points.add(other.start);
    if (other.end > clippedStart && other.end < clippedEnd) points.add(other.end);
  }
  const bounds = [...points].sort((a, b) => a - b);

  const raw = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const t0 = bounds[i];
    const t1 = bounds[i + 1];
    if (t1 <= t0) continue;
    const hour = Math.floor(t0 / 60);
    const active = evs
      .filter((o) => o.start <= t0 && o.end >= t1)
      .sort((a, b) => (columnOf.get(a.id) - columnOf.get(b.id)) || a.start - b.start);
    const index = Math.max(0, active.findIndex((o) => o.id === item.id));
    raw.push({
      hour,
      t0,
      t1,
      colStart: (t0 - hour * 60) / SLOT_MINUTES,
      colEnd: (t1 - hour * 60) / SLOT_MINUTES,
      index,
      count: active.length || 1,
    });
  }

  const pieces = [];
  for (const p of raw) {
    const prev = pieces[pieces.length - 1];
    if (prev && prev.hour === p.hour && prev.index === p.index
      && prev.count === p.count && prev.colEnd === p.colStart) {
      prev.colEnd = p.colEnd;
      prev.t1 = p.t1;
    } else {
      pieces.push({ ...p });
    }
  }

  return { pieces, clippedStart, clippedEnd };
}

function syncLayout() {
  document.documentElement.style.setProperty("--hour-count", String(hourCount()));
}

function buildAxes() {
  els.timeAxis.innerHTML = "";

  const hours = hourCount();
  for (let i = 0; i <= hours; i += 1) {
    const hour = START_HOUR() + i;
    const label = document.createElement("span");
    label.className = "axis-label";
    label.style.top = `${(i / hours) * 100}%`;
    label.textContent = String(hour);
    els.timeAxis.appendChild(label);
  }
}

function isShadedHour(hour) {
  return hour < 9 || hour === 12 || hour >= 18;
}

function buildGrid() {
  els.grid.innerHTML = "";

  for (let hour = START_HOUR(); hour < END_HOUR(); hour += 1) {
    const shaded = isShadedHour(hour);
    for (let col = 0; col < SLOTS_PER_HOUR; col += 1) {
      const cell = document.createElement("div");
      cell.className = shaded ? "grid-cell time-shaded" : "grid-cell";
      cell.dataset.hour = String(hour);
      cell.dataset.col = String(col);
      cell.style.gridRow = String(gridRowForHour(hour));
      cell.style.gridColumn = String(gridColForSlot(col));
      cell.addEventListener("mousedown", startCreate);
      els.grid.appendChild(cell);
    }
  }
}

function renderEvents() {
  els.grid.querySelectorAll(".event").forEach((el) => el.remove());

  const visStart = dayStartMinutes();
  const visEnd = dayEndMinutes();

  const evs = state.events.map((e) => ({
    id: e.id,
    ref: e,
    start: minutesFromMidnight(e.start),
    end: minutesFromMidnight(e.end),
  })).filter((it) => it.end > it.start);

  const columnOf = assignEventColumns(evs);

  for (const item of evs) {
    if (item.end <= visStart || item.start >= visEnd) continue;

    const event = item.ref;
    const extendsBefore = item.start < visStart;
    const extendsAfter = item.end > visEnd;

    const { pieces, clippedStart, clippedEnd } = buildEventPieces(item, evs, columnOf, visStart, visEnd);

    pieces.forEach((seg, index) => {
      const el = document.createElement("div");
      el.className = `event ${eventTagClass(event.tag)}`;
      if (index > 0) el.classList.add("continuation");
      if (index < pieces.length - 1) el.classList.add("continues-after");
      if (extendsBefore && seg.t0 === clippedStart) el.classList.add("extends-before");
      if (extendsAfter && seg.t1 === clippedEnd) el.classList.add("extends-after");
      if (isEventSelected(event.id)) el.classList.add("selected");
      if (event.done) el.classList.add("done");
      el.dataset.id = event.id;
      el.style.gridRow = String(gridRowForHour(seg.hour));
      el.style.gridColumn = `${gridColForSlot(seg.colStart)} / span ${seg.colEnd - seg.colStart}`;
      el.style.position = "relative";
      el.style.setProperty("--lane-count", String(seg.count));
      el.style.setProperty("--lane-index", String(seg.index));

      const titleWrap = document.createElement("div");
      titleWrap.className = "event-title-wrap";

      const title = document.createElement("div");
      title.className = "event-title";
      title.textContent = event.title || "（無題）";
      titleWrap.append(title);
      appendSubtaskCountBadge(titleWrap, event, "event-subtask-count");

      el.append(titleWrap);

      if (!extendsBefore && seg.t0 === clippedStart) {
        const resizeStart = document.createElement("div");
        resizeStart.className = "event-resize event-resize-start";
        resizeStart.dataset.action = "resize-start";
        el.appendChild(resizeStart);
      }

      if (!extendsAfter && seg.t1 === clippedEnd) {
        const resizeEnd = document.createElement("div");
        resizeEnd.className = "event-resize event-resize-end";
        resizeEnd.dataset.action = "resize-end";
        el.appendChild(resizeEnd);
      }

      el.addEventListener("mousedown", (ev) => {
        const action = ev.target.dataset.action;
        if (action === "resize-start") {
          startResize(ev, event.id, "start");
        } else if (action === "resize-end") {
          startResize(ev, event.id, "end");
        } else {
          startMove(ev, event.id);
        }
      });

      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (suppressEventClick) {
          suppressEventClick = false;
          return;
        }
        handleEventSelect(event.id, ev);
      });

      els.grid.appendChild(el);
    });
  }
}

function renderNowLine() {
  els.grid.querySelector(".now-line")?.remove();

  const now = new Date();
  const hour = now.getHours();
  if (hour < START_HOUR() || hour >= END_HOUR()) return;

  const minute = now.getMinutes();
  const line = document.createElement("div");
  line.className = "now-line";
  line.style.gridRow = String(gridRowForHour(hour));
  line.style.gridColumn = "1 / -1";
  line.style.setProperty("--now-x", `${(minute / 60) * 100}%`);
  els.grid.appendChild(line);
}

function sortedEvents() {
  return [...state.events].sort(
    (a, b) => minutesFromMidnight(a.start) - minutesFromMidnight(b.start)
      || minutesFromMidnight(a.end) - minutesFromMidnight(b.end),
  );
}

function selectAdjacentEvent(direction) {
  if (!state.selectedId) return;
  const events = sortedEvents();
  const index = events.findIndex((e) => e.id === state.selectedId);
  if (index === -1) return;
  const next = events[index + direction];
  if (next) selectSingle(next.id);
}

function pruneEmptyTasks(id) {
  if (!id) return false;
  const event = state.events.find((e) => e.id === id);
  if (!event || !Array.isArray(event.tasks)) return false;
  const before = event.tasks.length;
  event.tasks = event.tasks.filter((t) => (t.text ?? "").trim());
  return event.tasks.length !== before;
}

function refreshAlternateViews() {
  if (state.viewMode === "board") renderTaskBoard();
  else if (state.viewMode === "markdown") renderMarkdownView();
  else if (state.viewMode === "settings") renderSettingsView();
}

function tagLabel(tag) {
  return TAGS[normalizeTag(tag)]?.label ?? TAGS.task.label;
}

const TAG_LABEL_TO_ID = {
  タスク: "task",
  予定: "schedule",
  休憩: "break",
  task: "task",
  schedule: "schedule",
  break: "break",
};

function tagFromLabel(label) {
  if (!label) return DEFAULT_TAG;
  return TAG_LABEL_TO_ID[label.trim()] ?? DEFAULT_TAG;
}

function buildTasksMarkdown() {
  const lines = [];

  for (const event of sortedEvents()) {
    const title = (event.title ?? "").trim() || "（無題）";
    const timeRange = `${event.start}–${event.end}`;
    const tag = tagLabel(event.tag);
    const tasks = (event.tasks ?? [])
      .map((t) => (t.text ?? "").trim())
      .filter(Boolean);
    const notes = (event.notes ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    lines.push(`* [${tag}] ${title} ${timeRange}`);
    for (const text of tasks) lines.push(`  * ${text}`);
    if (notes.length > 0) {
      lines.push("  * メモ");
      for (const note of notes) lines.push(`    * ${note}`);
    }
  }

  return lines.join("\n").trimEnd();
}

const MARKDOWN_EVENT_RE = /^[-*] (?:\[([^\]]+)\] )?(.+?) (\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})\s*$/;

function parseTasksMarkdown(text) {
  const parsed = [];
  let current = null;
  let inNotes = false;

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!rawLine.trim()) {
      inNotes = false;
      continue;
    }

    if (!rawLine.startsWith(" ")) {
      const match = rawLine.match(MARKDOWN_EVENT_RE);
      if (match) {
        if (current) parsed.push(current);
        current = {
          title: match[2].trim(),
          tag: tagFromLabel(match[1]),
          start: match[3],
          end: match[4],
          tasks: [],
          notes: [],
        };
        inNotes = false;
      }
      continue;
    }

    if (!current) continue;

    if (/^  [-*] メモ\s*$/.test(rawLine)) {
      inNotes = true;
      continue;
    }

    const subMatch = rawLine.match(/^  [-*] (.+)$/);
    if (subMatch && !inNotes) {
      current.tasks.push(subMatch[1].trim());
      continue;
    }

    const noteMatch = rawLine.match(/^    [-*] (.+)$/);
    if (noteMatch && inNotes) {
      current.notes.push(noteMatch[1].trim());
    }
  }

  if (current) parsed.push(current);
  return parsed;
}

function loadTasksMarkdown() {
  const text = els.taskMarkdownEditor.value.trim();
  if (!text) return;

  const parsed = parseTasksMarkdown(text);
  if (parsed.length === 0) {
    window.alert("読み込める予定がありません。形式を確認してください。");
    return;
  }

  if (state.events.length > 0 && !window.confirm("現在の予定を置き換えて読み込みますか？")) {
    return;
  }

  state.events = parsed.map((item) => ({
    id: newId(),
    title: item.title,
    start: snapTime(item.start),
    end: snapTime(item.end),
    tag: normalizeTag(item.tag),
    tasks: item.tasks.map((text) => ({ id: newId(), text, done: false })),
    notes: item.notes.join("\n"),
    done: false,
  }));
  state.events.sort((a, b) => minutesFromMidnight(a.start) - minutesFromMidnight(b.start));
  closeSidebar();
  renderEvents();
  renderNowLine();
  scheduleSave();
  refreshSidebarPanels();
  refreshAlternateViews();
}

function renderMarkdownView() {
  if (document.activeElement !== els.taskMarkdownEditor) {
    els.taskMarkdownEditor.value = buildTasksMarkdown();
  }
}

async function copyTasksMarkdown() {
  const text = els.taskMarkdownEditor.value.trim() || buildTasksMarkdown();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  const btn = els.btnCopyMarkdown;
  const prev = btn.textContent;
  btn.textContent = "コピーしました";
  setTimeout(() => {
    btn.textContent = prev;
  }, 1500);
}

function isEventSelected(id) {
  return state.selectedIds.includes(id);
}

function hasEventSelection() {
  return state.selectedIds.length > 0;
}

function setSelection(ids, primaryId = null, anchorId = null) {
  const nextIds = [...new Set(ids)];
  const removed = state.selectedIds.filter((id) => !nextIds.includes(id));
  let changed = false;
  for (const id of removed) {
    if (id !== primaryId && pruneEmptyTasks(id)) changed = true;
  }

  state.selectedIds = nextIds;
  state.selectedId = primaryId ?? nextIds[nextIds.length - 1] ?? null;
  state.selectionAnchorId = anchorId ?? state.selectedId;

  if (state.selectedId) setSidebarTab("selection");
  renderEvents();
  if (state.selectedId) fillSidebar();
  else {
    els.selectionEmpty.hidden = false;
    els.selectionContent.hidden = true;
  }
  refreshSidebarPanels();
  refreshAlternateViews();
  if (changed) scheduleSave();
}

function selectSingle(id) {
  setSelection([id], id, id);
}

function toggleEventSelection(id) {
  const ids = [...state.selectedIds];
  const index = ids.indexOf(id);
  if (index >= 0) {
    if (ids.length === 1) {
      closeSidebar();
      return;
    }
    ids.splice(index, 1);
    const primary = ids[ids.length - 1];
    setSelection(ids, primary, id);
    return;
  }
  ids.push(id);
  setSelection(ids, id, id);
}

function selectEventRange(toId) {
  const anchor = state.selectionAnchorId ?? state.selectedId;
  if (!anchor) {
    selectSingle(toId);
    return;
  }
  const events = sortedEvents();
  const i1 = events.findIndex((e) => e.id === anchor);
  const i2 = events.findIndex((e) => e.id === toId);
  if (i1 === -1 || i2 === -1) {
    selectSingle(toId);
    return;
  }
  const lo = Math.min(i1, i2);
  const hi = Math.max(i1, i2);
  const ids = events.slice(lo, hi + 1).map((e) => e.id);
  setSelection(ids, toId, anchor);
}

function handleEventSelect(id, ev) {
  if (ev.shiftKey) {
    selectEventRange(id);
  } else if (ev.metaKey || ev.ctrlKey) {
    toggleEventSelection(id);
  } else {
    selectSingle(id);
  }
}

function selectEvent(id) {
  selectSingle(id);
}

function eventDurationMinutes(event) {
  return minutesFromMidnight(event.end) - minutesFromMidnight(event.start);
}

function shuffleBoardOrder() {
  const ids = state.events.map((e) => e.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  state.boardOrder = ids;
}

function boardSortedEvents() {
  const evs = [...state.events];
  const byDone = (a, b) => Number(!!a.done) - Number(!!b.done);
  if (state.boardSort === "random") {
    if (!state.boardOrder) shuffleBoardOrder();
    const pos = new Map(state.boardOrder.map((id, i) => [id, i]));
    evs.sort(
      (a, b) => byDone(a, b)
        || (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity),
    );
  } else {
    evs.sort(
      (a, b) => byDone(a, b)
        || eventDurationMinutes(a) - eventDurationMinutes(b)
        || minutesFromMidnight(a.start) - minutesFromMidnight(b.start),
    );
  }
  return evs;
}

function createTaskCard(event) {
  const card = document.createElement("div");
  card.className = `task-card ${eventTagClass(event.tag)}`;
  if (event.done) card.classList.add("done");
  if (isEventSelected(event.id)) card.classList.add("selected");
  card.dataset.id = event.id;

  const titleWrap = document.createElement("div");
  titleWrap.className = "task-card-title-wrap";

  const title = document.createElement("div");
  title.className = "task-card-title";
  title.textContent = event.title || "（無題）";
  titleWrap.append(title);
  appendSubtaskCountBadge(titleWrap, event, "task-card-subtask-count");

  const meta = document.createElement("div");
  meta.className = "task-card-meta";

  const duration = document.createElement("span");
  duration.className = "task-card-duration";
  duration.textContent = formatDuration(eventDurationMinutes(event));

  meta.append(duration);
  card.append(titleWrap, meta);

  card.addEventListener("click", (ev) => {
    handleEventSelect(event.id, ev);
    if (state.boardSort === "random") {
      shuffleBoardOrder();
      renderTaskBoard();
    }
  });

  return card;
}

function makeCardGrid() {
  const grid = document.createElement("div");
  grid.className = "task-card-grid";
  return grid;
}

function renderTaskBoard() {
  els.taskBoardList.innerHTML = "";
  const events = boardSortedEvents();

  els.taskBoardEmpty.hidden = events.length > 0;
  els.taskBoardList.hidden = events.length === 0;

  if (state.boardSort === "duration") {
    // 時間サイズごとに見出しを作り、その下にカードを並べる
    let currentDuration = null;
    let grid = null;
    for (const event of events) {
      const dur = eventDurationMinutes(event);
      if (dur !== currentDuration) {
        currentDuration = dur;
        const header = document.createElement("div");
        header.className = "task-group-header";
        header.textContent = formatDuration(dur);
        els.taskBoardList.appendChild(header);
        grid = makeCardGrid();
        els.taskBoardList.appendChild(grid);
      }
      grid.appendChild(createTaskCard(event));
    }
    return;
  }

  const grid = makeCardGrid();
  for (const event of events) {
    grid.appendChild(createTaskCard(event));
  }
  els.taskBoardList.appendChild(grid);
}

function setViewMode(mode) {
  state.viewMode = mode;
  els.gridScaffold.hidden = mode !== "calendar";
  els.taskBoard.hidden = mode !== "board";
  els.taskMarkdown.hidden = mode !== "markdown";
  els.settingsView.hidden = mode !== "settings";
  els.viewTabs.forEach((btn) => {
    const active = btn.dataset.view === mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  refreshAlternateViews();
}

function setBoardSort(sort) {
  state.boardSort = sort;
  if (sort === "random") shuffleBoardOrder();
  els.boardSortBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sort === sort);
  });
  refreshAlternateViews();
}

function closeSidebar() {
  const prevIds = [...state.selectedIds];
  state.selectedId = null;
  state.selectedIds = [];
  state.selectionAnchorId = null;
  let changed = false;
  for (const id of prevIds) {
    if (pruneEmptyTasks(id)) changed = true;
  }
  renderEvents();
  refreshSidebarPanels();
  refreshAlternateViews();
  if (changed) scheduleSave();
}

function snapTime(time) {
  return timeFromMinutes(snapMinutes(minutesFromMidnight(time)));
}

function syncEventDoneUI(done) {
  const isDone = !!done;
  els.eventDone.checked = isDone;
  els.eventTitle.classList.toggle("done", isDone);
}

function fillSidebar({ skipTasks = false } = {}) {
  const event = selectedEvent();
  if (!event) return;

  event.start = snapTime(event.start);
  event.end = snapTime(event.end);
  event.tag = normalizeTag(event.tag);

  els.eventTitle.value = event.title ?? "";
  autoResizeTaskInput(els.eventTitle);
  syncEventDoneUI(event.done);
  els.eventNotes.value = event.notes ?? "";
  updateTagPickerUI(event.tag);
  if (!skipTasks) renderTaskList(event);
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function isEventDoneKey(ev) {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
  return ev.key === "d" || ev.key === "D";
}

function isFillGapsKey(ev) {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
  return ev.key === "f" || ev.key === "F";
}

function isEventDeleteKey(ev) {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
  if (ev.key === "Delete" || ev.key === "Backspace") return true;
  return ev.code === "Delete" || ev.code === "Backspace";
}

function toggleSelectedEventsDone() {
  const ids = state.selectedIds.length > 0
    ? [...state.selectedIds]
    : (state.selectedId ? [state.selectedId] : []);
  if (ids.length === 0) return;

  let changed = false;
  for (const id of ids) {
    const event = state.events.find((e) => e.id === id);
    if (!event) continue;
    if (!trySetEventDone(event, !event.done)) continue;
    changed = true;
  }
  if (!changed) return;

  const primary = selectedEvent();
  if (primary) {
    syncEventDoneUI(primary.done);
    fillSidebar();
  }
  renderEvents();
  scheduleSave();
  if (state.viewMode === "settings") renderAnalysisPanel();
  refreshAlternateViews();
}

function autoResizeTaskInput(textarea) {
  textarea.style.height = "0";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function focusTaskInput(taskId, listEl = els.taskList) {
  const textarea = listEl.querySelector(`textarea[data-task-id="${taskId}"]`);
  textarea?.focus();
}

let taskReorder = null;

const TASK_REORDER_ANIM_MS = 180;

function animateTaskReorder(listEl, mutate) {
  const items = [...listEl.querySelectorAll(".task-item")];
  const beforeTop = new Map(items.map((li) => [li, li.getBoundingClientRect().top]));

  mutate();

  for (const li of listEl.querySelectorAll(".task-item")) {
    const prevTop = beforeTop.get(li);
    if (prevTop == null) continue;
    const delta = prevTop - li.getBoundingClientRect().top;
    if (!delta) continue;
    li.style.transition = "none";
    li.style.transform = `translateY(${delta}px)`;
    requestAnimationFrame(() => {
      li.style.transition = `transform ${TASK_REORDER_ANIM_MS}ms ease`;
      li.style.transform = "";
    });
  }
}

function startTaskReorder(ev, li, listEl, event, task) {
  if (ev.button !== 0) return;
  if (task?.done) return; // done の子タスクは並び替え不可
  ev.preventDefault();
  taskReorder = { li, listEl, event };
  li.classList.add("dragging");
  document.addEventListener("mousemove", onTaskReorderMove);
  document.addEventListener("mouseup", onTaskReorderEnd);
}

function onTaskReorderMove(ev) {
  if (!taskReorder) return;
  const listEl = taskReorder.listEl;
  const dragLi = taskReorder.li;

  // 並び替え対象は未done同士のみ。done の子タスクの間・後ろには挿入しない。
  const undone = [...listEl.querySelectorAll(".task-item:not(.dragging):not(.done)")];
  const firstDone = listEl.querySelector(".task-item.done");
  const ref = undone.find((item) => {
    const rect = item.getBoundingClientRect();
    return ev.clientY < rect.top + rect.height / 2;
  }) ?? firstDone ?? null;

  if (ref === dragLi) return;
  if (ref === dragLi.nextElementSibling) return;
  if (ref === null && dragLi.nextElementSibling === null) return;

  animateTaskReorder(listEl, () => {
    if (ref) listEl.insertBefore(dragLi, ref);
    else listEl.appendChild(dragLi);
  });
}

function onTaskReorderEnd() {
  document.removeEventListener("mousemove", onTaskReorderMove);
  document.removeEventListener("mouseup", onTaskReorderEnd);
  if (!taskReorder) return;
  const { listEl, event } = taskReorder;
  taskReorder.li.classList.remove("dragging");
  taskReorder = null;

  if (event && Array.isArray(event.tasks)) {
    const order = [...listEl.querySelectorAll(".task-item")].map(
      (li) => li.dataset.taskId,
    );
    event.tasks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    reorderTasksByDone(event);
    scheduleSave();
  }
}

function reorderTasksByDone(event) {
  if (!Array.isArray(event.tasks)) return;
  const undone = event.tasks.filter((t) => !t.done);
  const done = event.tasks.filter((t) => t.done);
  event.tasks = [...undone, ...done];
}

function firstDoneTaskIndex(tasks) {
  const idx = tasks.findIndex((t) => t.done);
  return idx === -1 ? tasks.length : idx;
}

function insertUndoneTask(event, task, afterId = null) {
  if (!event.tasks) event.tasks = [];
  reorderTasksByDone(event);
  const firstDone = firstDoneTaskIndex(event.tasks);

  if (afterId == null) {
    event.tasks.splice(firstDone, 0, task);
    return;
  }

  const index = event.tasks.findIndex((t) => t.id === afterId);
  if (index === -1) {
    event.tasks.splice(firstDone, 0, task);
    return;
  }

  const insertAt = event.tasks[index].done
    ? firstDone
    : Math.min(index + 1, firstDone);
  event.tasks.splice(insertAt, 0, task);
}

// 子タスクが全て完了したら親（予定）を完了に、そうでなければ未完了に同期する。
function syncEventDoneFromTasks(event) {
  const tasks = event.tasks ?? [];
  if (tasks.length === 0) return false;
  const allDone = tasks.every((t) => t.done);
  if (event.done === allDone) return false;
  if (allDone) {
    event.done = true;
    const latest = tasks.reduce((max, task) => {
      if (!task.completedAt) return max;
      return Math.max(max, minutesFromMidnight(task.completedAt));
    }, 0);
    event.completedAt = latest
      ? timeFromMinutes(latest)
      : timeFromMinutes(nowMinutes());
  } else {
    event.done = false;
    event.completedAt = null;
  }
  return true;
}

function applyEventDoneUI(event) {
  renderEvents();
  if (event.id === state.selectedId) syncEventDoneUI(event.done);
  const nowEvent = currentEventAtNow();
  if (nowEvent && nowEvent.id === event.id) {
    els.nowEventTitle.classList.toggle("done", !!event.done);
  }
  refreshAlternateViews();
}

function renderTaskList(event, listEl = els.taskList) {
  reorderTasksByDone(event);

  const active = document.activeElement;
  const activeTaskId = active?.dataset?.taskId ?? null;
  const activeInList = activeTaskId && listEl.contains(active);
  const selectionStart = active instanceof HTMLTextAreaElement ? active.selectionStart : null;
  const selectionEnd = active instanceof HTMLTextAreaElement ? active.selectionEnd : null;

  listEl.innerHTML = "";
  const tasks = event.tasks ?? [];

  for (const task of tasks) {
    const li = document.createElement("li");
    li.className = "task-item";
    li.dataset.taskId = task.id;
    if (task.done) li.classList.add("done");

    const handle = document.createElement("span");
    handle.className = "task-drag-handle";
    handle.textContent = "⠿";
    handle.setAttribute("aria-label", "ドラッグで並び替え");
    handle.title = "ドラッグで並び替え";
    handle.addEventListener("mousedown", (ev) => startTaskReorder(ev, li, listEl, event, task));

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";
    checkbox.checked = !!task.done;
    checkbox.addEventListener("change", () => {
      setItemDone(task, checkbox.checked);
      const parentChanged = syncEventDoneFromTasks(event);
      reorderTasksByDone(event);
      renderTaskList(event, listEl);
      if (parentChanged) applyEventDoneUI(event);
      else refreshEventSubtaskCounts(event.id);
      scheduleSave();
    });

    const input = document.createElement("textarea");
    input.className = "task-input";
    input.dataset.taskId = task.id;
    input.rows = 1;
    input.value = task.text ?? "";
    input.placeholder = "子タスク内容";
    input.addEventListener("input", () => {
      task.text = input.value;
      autoResizeTaskInput(input);
      refreshEventSubtaskCounts(event.id);
      scheduleSave();
      refreshAlternateViews();
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      if (ev.shiftKey) return;
      if (ev.isComposing || ev.keyCode === 229) return;
      ev.preventDefault();
      task.text = input.value;
      addTaskAfter(task.id, event, listEl);
    });
    input.addEventListener("focus", () => {
      li.classList.add("editing");
    });
    input.addEventListener("blur", () => {
      li.classList.remove("editing");
      // 何も記載がない子タスクはフォーカスが外れたら削除する
      if (!(input.value ?? "").trim()) {
        event.tasks = event.tasks.filter((t) => t.id !== task.id);
        li.remove();
        refreshEventSubtaskCounts(event.id);
        scheduleSave();
        refreshAlternateViews();
      }
    });
    autoResizeTaskInput(input);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-remove-task";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      deleteSubtask(event, task.id, listEl);
    });

    li.append(handle, checkbox, input, remove);
    listEl.appendChild(li);
  }

  if (activeInList) {
    const textarea = listEl.querySelector(`textarea[data-task-id="${activeTaskId}"]`);
    if (textarea) {
      textarea.focus();
      if (selectionStart !== null && selectionEnd !== null) {
        textarea.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }
}

function addTaskAfter(afterId, event = selectedEvent(), listEl = els.taskList) {
  if (!event) return;
  const newTask = { id: newId(), text: "", done: false };
  insertUndoneTask(event, newTask, afterId);
  renderTaskList(event, listEl);
  scheduleSave();
  focusTaskInput(newTask.id, listEl);
}

function addTaskInto(event, listEl = els.taskList) {
  if (!event) return;
  const newTask = { id: newId(), text: "", done: false };
  insertUndoneTask(event, newTask);
  renderTaskList(event, listEl);
  scheduleSave();
  focusTaskInput(newTask.id, listEl);
}

function addTask() {
  addTaskInto(selectedEvent(), els.taskList);
}

function activeSubtaskContext() {
  const active = document.activeElement;
  if (!(active instanceof HTMLTextAreaElement)) return null;
  if (!active.classList.contains("task-input")) return null;
  const taskId = active.dataset.taskId;
  if (!taskId) return null;
  const listEl = active.closest(".task-list");
  if (!listEl) return null;
  if (listEl === els.taskList) {
    const event = selectedEvent();
    return event ? { event, taskId, listEl } : null;
  }
  if (listEl === els.nowTaskList) {
    const event = currentEventAtNow();
    return event ? { event, taskId, listEl } : null;
  }
  return null;
}

function deleteSubtask(event, taskId, listEl) {
  event.tasks = event.tasks.filter((t) => t.id !== taskId);
  renderTaskList(event, listEl);
  refreshEventSubtaskCounts(event.id);
  scheduleSave();
  refreshAlternateViews();
}

function addTaskAtOpenLocation() {
  if (state.sidebarTab === "now") {
    const event = currentEventAtNow();
    if (event) {
      addTaskInto(event, els.nowTaskList);
      return;
    }
  }
  const event = selectedEvent();
  if (event) addTaskInto(event, els.taskList);
}

function updateSelectedFromSidebar() {
  const event = selectedEvent();
  if (!event) return;

  event.title = els.eventTitle.value;
  event.notes = els.eventNotes.value;

  renderEvents();
  scheduleSave();
  refreshActiveSidebarPanel();
  refreshAlternateViews();
}

function deleteSelectedEvent({ skipConfirm = false } = {}) {
  const ids = state.selectedIds.length > 0
    ? [...state.selectedIds]
    : (state.selectedId ? [state.selectedId] : []);
  if (ids.length === 0) return;

  if (!skipConfirm) {
    if (ids.length === 1) {
      const event = state.events.find((e) => e.id === ids[0]);
      if (!window.confirm(`「${event?.title || "（無題）"}」を削除しますか？`)) return;
    } else if (!window.confirm(`${ids.length}件の予定を削除しますか？`)) {
      return;
    }
  }

  for (const id of ids) pruneEmptyTasks(id);
  const idSet = new Set(ids);
  state.events = state.events.filter((e) => !idSet.has(e.id));
  closeSidebar();
  scheduleSave();
}

function createEvent(startMin, endMin) {
  if (endMin - startMin < MIN_EVENT_MINUTES) {
    endMin = startMin + MIN_EVENT_MINUTES;
  }
  const event = {
    id: newId(),
    title: "",
    start: timeFromMinutes(startMin),
    end: timeFromMinutes(endMin),
    tag: DEFAULT_TAG,
    tasks: [],
    notes: "",
    done: false,
  };
  state.events.push(event);
  state.events.sort((a, b) => minutesFromMidnight(a.start) - minutesFromMidnight(b.start));
  selectEvent(event.id);
  scheduleSave();
  els.eventTitle.focus();
}

function cellFromPoint(x, y) {
  const rect = els.grid.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const relX = (x - rect.left) / rect.width;
  const relY = (y - rect.top) / rect.height;
  const rows = hourCount();

  const col = Math.min(SLOTS_PER_HOUR - 1, Math.max(0, Math.floor(relX * SLOTS_PER_HOUR)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(relY * rows)));

  return {
    hour: START_HOUR() + row,
    col,
  };
}

function rangeFromCells(a, b) {
  const startMin = Math.min(cellStartMinutes(a.hour, a.col), cellStartMinutes(b.hour, b.col));
  const endMin = Math.max(cellStartMinutes(a.hour, a.col), cellStartMinutes(b.hour, b.col)) + SLOT_MINUTES;
  return { startMin, endMin };
}

function highlightRange(startMin, endMin) {
  clearHighlight();
  els.grid.querySelectorAll(".grid-cell").forEach((cell) => {
    const min = cellStartMinutes(Number(cell.dataset.hour), Number(cell.dataset.col));
    if (min >= startMin && min < endMin) {
      cell.classList.add("drag-range");
    }
  });
}

function clearHighlight() {
  els.grid.querySelectorAll(".grid-cell.drag-range").forEach((cell) => {
    cell.classList.remove("drag-range");
  });
}

function startCreate(ev) {
  if (ev.button !== 0) return;

  const startCell = {
    hour: Number(ev.currentTarget.dataset.hour),
    col: Number(ev.currentTarget.dataset.col),
  };

  dragState = {
    mode: "create",
    startCell,
    currentCell: startCell,
  };

  const { startMin, endMin } = rangeFromCells(startCell, startCell);
  highlightRange(startMin, endMin);

  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
}

function activateDragIfNeeded(ev) {
  if (!dragState || dragState.active || dragState.mode === "create") return true;
  const dx = ev.clientX - dragState.startX;
  const dy = ev.clientY - dragState.startY;
  if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return false;
  dragState.active = true;
  if (dragState.id && !isEventSelected(dragState.id)) {
    selectSingle(dragState.id);
  }
  return true;
}

function startMove(ev, id) {
  ev.stopPropagation();
  if (ev.button !== 0) return;
  if (ev.target.dataset.action?.startsWith("resize")) return;
  if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;

  const event = state.events.find((e) => e.id === id);
  if (!event) return;

  const startMin = minutesFromMidnight(event.start);
  const endMin = minutesFromMidnight(event.end);
  const cell = cellFromPoint(ev.clientX, ev.clientY);
  const grabMin = cell ? cellStartMinutes(cell.hour, cell.col) : startMin;

  dragState = {
    mode: "move",
    id,
    duration: endMin - startMin,
    offsetMin: grabMin - startMin,
    startX: ev.clientX,
    startY: ev.clientY,
    active: false,
  };

  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
}

function startResize(ev, id, edge = "end") {
  ev.stopPropagation();
  if (ev.button !== 0) return;
  if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;

  const event = state.events.find((e) => e.id === id);
  if (!event) return;

  dragState = {
    mode: "resize",
    edge,
    id,
    startMin: minutesFromMidnight(event.start),
    endMin: minutesFromMidnight(event.end),
    startX: ev.clientX,
    startY: ev.clientY,
    active: false,
  };

  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
}

function onDragMove(ev) {
  if (!dragState) return;

  const cell = cellFromPoint(ev.clientX, ev.clientY);

  if (dragState.mode === "create") {
    if (!cell) return;
    dragState.currentCell = cell;
    const { startMin, endMin } = rangeFromCells(dragState.startCell, cell);
    highlightRange(startMin, endMin);
    return;
  }

  if (!activateDragIfNeeded(ev)) return;
  if (!cell) return;

  const event = state.events.find((e) => e.id === dragState.id);
  if (!event) return;

  const cellMin = cellStartMinutes(cell.hour, cell.col);

  if (dragState.mode === "move") {
    let newStart = cellMin - dragState.offsetMin;
    newStart = snapMinutes(newStart);
    newStart = Math.max(0, Math.min(24 * 60 - dragState.duration, newStart));
    event.start = timeFromMinutes(newStart);
    event.end = timeFromMinutes(newStart + dragState.duration);
    fillSidebar({ skipTasks: true });
    renderEvents();
    return;
  }

  if (dragState.mode === "resize") {
    if (dragState.edge === "start") {
      let startMin = snapMinutes(cellMin);
      startMin = Math.max(0, Math.min(dragState.endMin - MIN_EVENT_MINUTES, startMin));
      event.start = timeFromMinutes(startMin);
    } else {
      let endMin = cellMin + SLOT_MINUTES;
      endMin = Math.max(dragState.startMin + MIN_EVENT_MINUTES, snapMinutes(endMin));
      endMin = Math.min(24 * 60, endMin);
      event.end = timeFromMinutes(endMin);
    }
    fillSidebar({ skipTasks: true });
    renderEvents();
  }
}

function onDragEnd() {
  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup", onDragEnd);

  if (!dragState) return;

  if (dragState.mode === "create") {
    const { startMin, endMin } = rangeFromCells(dragState.startCell, dragState.currentCell);
    clearHighlight();
    if (endMin - startMin >= MIN_EVENT_MINUTES) {
      createEvent(startMin, endMin);
    }
  } else if (dragState.active) {
    suppressEventClick = true;
    scheduleSave();
    refreshActiveSidebarPanel();
  }

  dragState = null;
}

function readLegacyScheduleRaw(date) {
  let raw = localStorage.getItem(`${STORAGE_PREFIX}${date}`);
  if (raw) return raw;
  return localStorage.getItem(`${STORAGE_PREFIX}${addDaysISO(date, -1)}`);
}

function readDayFromStorage(date) {
  if (useFileStorage && fileData?.schedule) {
    return {
      date,
      events: Array.isArray(fileData.schedule.events) ? fileData.schedule.events : [],
      memo: typeof fileData.schedule.memo === "string" ? fileData.schedule.memo : "",
    };
  }
  try {
    let raw = localStorage.getItem(SCHEDULE_KEY);
    // 旧・日付別キー（day-planner:YYYY-MM-DD）からの移行
    if (!raw) raw = readLegacyScheduleRaw(date);
    if (!raw) return { date, events: [], memo: "" };
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return { date, events: [], memo: "" };
    return {
      date,
      events: Array.isArray(data.events) ? data.events : [],
      memo: typeof data.memo === "string" ? data.memo : "",
    };
  } catch {
    return { date, events: [], memo: "" };
  }
}

function writeDayToStorage(date, events, memo = "") {
  if (useFileStorage && fileData) {
    fileData.schedule = { events, memo };
    scheduleFileSave();
    return;
  }
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify({ events, memo }, null, 2));
}

let routines = [];

function readRoutinesFromStorage() {
  if (useFileStorage && fileData) {
    const data = fileData.routines;
    if (!Array.isArray(data)) return [];
    return data
      .filter((r) => r && typeof r === "object")
      .map((r) => ({
        id: r.id || newId(),
        name: r.name ?? "ルーティーン",
        events: Array.isArray(r.events) ? r.events : [],
      }));
  }
  try {
    const raw = localStorage.getItem(ROUTINE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    // 新形式: { routines: [{ id, name, events }] }
    if (Array.isArray(data.routines)) {
      return data.routines
        .filter((r) => r && typeof r === "object")
        .map((r) => ({
          id: r.id || newId(),
          name: r.name ?? "ルーティーン",
          events: Array.isArray(r.events) ? r.events : [],
        }));
    }
    // 旧形式: { events: [...] } → 単一ルーティーンへ移行
    if (Array.isArray(data.events)) {
      return [{ id: newId(), name: "ルーティーン", events: data.events }];
    }
    return [];
  } catch {
    return [];
  }
}

function writeRoutinesToStorage() {
  if (useFileStorage && fileData) {
    fileData.routines = routines;
    scheduleFileSave();
    return;
  }
  localStorage.setItem(ROUTINE_KEY, JSON.stringify({ routines }, null, 2));
}

function editingRoutine() {
  return routines.find((r) => r.id === state.editingRoutineId) ?? null;
}

function persistCurrent() {
  if (state.routineMode) {
    const routine = editingRoutine();
    if (routine) {
      routine.events = state.events;
      writeRoutinesToStorage();
    }
  } else {
    writeDayToStorage(state.date, state.events, state.dayMemo);
  }
}

const history = { stack: [], index: -1, restoring: false };

function snapshotEvents() {
  return JSON.stringify(state.events);
}

function resetHistory() {
  history.stack = [snapshotEvents()];
  history.index = 0;
}

function commitHistory() {
  const snap = snapshotEvents();
  if (history.index >= 0 && history.stack[history.index] === snap) return;
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(snap);
  history.index = history.stack.length - 1;
}

function flushSave() {
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    saveDay();
  }
  flushFileSave();
}

function applySnapshot(snap) {
  history.restoring = true;
  state.events = JSON.parse(snap).map(normalizeEvent);
  state.selectedIds = state.selectedIds.filter((id) => state.events.some((e) => e.id === id));
  if (state.selectedIds.length === 0) {
    state.selectedId = null;
    state.selectionAnchorId = null;
  } else if (!state.selectedIds.includes(state.selectedId)) {
    state.selectedId = state.selectedIds[state.selectedIds.length - 1];
    state.selectionAnchorId = state.selectedId;
  }
  renderEvents();
  if (state.selectedId) fillSidebar();
  else {
    els.selectionEmpty.hidden = false;
    els.selectionContent.hidden = true;
  }
  refreshSidebarPanels();
  try {
    persistCurrent();
  } catch {
    // localStorage 書き込み失敗時は無視
  }
  history.restoring = false;
}

function undo() {
  flushSave();
  if (history.index <= 0) return;
  history.index -= 1;
  applySnapshot(history.stack[history.index]);
}

function redo() {
  flushSave();
  if (history.index >= history.stack.length - 1) return;
  history.index += 1;
  applySnapshot(history.stack[history.index]);
}

function loadDay(date) {
  state.loading = true;
  const data = readDayFromStorage(date);
  state.date = date;
  state.events = data.events.map(normalizeEvent);
  state.dayMemo = data.memo ?? "";
  state.selectedIds = [];
  state.selectionAnchorId = null;
  state.selectedId = null;
  closeSidebar();
  autoCompletePastEvents({ render: false });
  syncLayout();
  buildAxes();
  buildGrid();
  renderEvents();
  renderNowLine();
  state.loading = false;
  resetHistory();
  resetNotificationState();
}

function saveDay() {
  if (state.loading) return;
  try {
    persistCurrent();
  } catch {
    // localStorage 書き込み失敗時は無視
  }
  if (!history.restoring) commitHistory();
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveDay, 400);
}

function cloneRoutineEvent(e) {
  return {
    id: newId(),
    title: e.title ?? "",
    start: e.start,
    end: e.end,
    tag: normalizeTag(e.tag),
    tasks: Array.isArray(e.tasks)
      ? e.tasks.map((t) => ({ id: newId(), text: t.text ?? "", done: false }))
      : [],
    notes: e.notes ?? "",
    done: false,
  };
}

function nextRoutineName() {
  const base = "ルーティーン";
  const used = new Set(routines.map((r) => r.name));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

function addRoutine() {
  const routine = { id: newId(), name: nextRoutineName(), events: [] };
  routines.push(routine);
  writeRoutinesToStorage();
  editRoutine(routine.id);
}

function editRoutine(id) {
  const routine = routines.find((r) => r.id === id);
  if (!routine) return;
  flushSave();
  if (state.viewMode !== "calendar") setViewMode("calendar");
  state.routineMode = true;
  state.editingRoutineId = id;
  appEl.classList.add("routine-mode");
  state.loading = true;
  state.events = (routine.events ?? []).map((e) => normalizeEvent({ ...e }));
  state.selectedIds = [];
  state.selectionAnchorId = null;
  state.selectedId = null;
  setSidebarCollapsed(false);
  renderEvents();
  renderNowLine();
  state.loading = false;
  resetHistory();
  setSidebarTab("routine");
}

function finishRoutineEdit() {
  if (!state.routineMode) return;
  flushSave();
  const routine = editingRoutine();
  if (routine) {
    routine.events = state.events;
    try {
      writeRoutinesToStorage();
    } catch {
      // ignore
    }
  }
  state.routineMode = false;
  state.editingRoutineId = null;
  appEl.classList.remove("routine-mode");
  loadDay(state.date);
  setSidebarTab("routine");
}

function deleteRoutine(id) {
  const routine = routines.find((r) => r.id === id);
  if (!routine) return;
  if (!window.confirm(`「${routine.name}」を削除しますか？`)) return;
  if (state.routineMode && state.editingRoutineId === id) {
    state.routineMode = false;
    state.editingRoutineId = null;
    appEl.classList.remove("routine-mode");
    loadDay(state.date);
  }
  routines = routines.filter((r) => r.id !== id);
  writeRoutinesToStorage();
  renderRoutinePanel();
}

function renameRoutine(id, name) {
  const routine = routines.find((r) => r.id === id);
  if (!routine) return;
  routine.name = name.trim() || "ルーティーン";
  writeRoutinesToStorage();
}

function applyRoutine(id) {
  if (state.routineMode) return;
  const routine = routines.find((r) => r.id === id);
  if (!routine || routine.events.length === 0) {
    window.alert("このルーティーンには予定がありません。");
    return;
  }
  const clones = routine.events.map(cloneRoutineEvent);
  state.events.push(...clones);
  state.events.sort((a, b) => minutesFromMidnight(a.start) - minutesFromMidnight(b.start));
  renderEvents();
  scheduleSave();
  refreshSidebarPanels();
}

function routineIcon(paths) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = paths;
  return svg;
}

function renderRoutinePanel() {
  const panel = els.panelRoutine;
  panel.innerHTML = "";

  const header = document.createElement("div");
  header.className = "routine-header";
  const heading = document.createElement("span");
  heading.className = "routine-heading";
  heading.textContent = "ルーティーン";
  header.appendChild(heading);

  if (!state.routineMode) {
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "routine-add-btn";
    addBtn.setAttribute("aria-label", "追加");
    addBtn.title = "追加";
    addBtn.appendChild(routineIcon('<path d="M12 5v14M5 12h14" />'));
    addBtn.addEventListener("click", addRoutine);
    header.appendChild(addBtn);
  }
  panel.appendChild(header);

  if (state.routineMode) {
    const routine = editingRoutine();
    const editing = document.createElement("div");
    editing.className = "routine-editing";

    const badge = document.createElement("div");
    badge.className = "routine-editing-badge";
    badge.textContent = "編集中";
    editing.appendChild(badge);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "routine-name-input";
    nameInput.value = routine?.name ?? "";
    nameInput.placeholder = "ルーティーン名";
    nameInput.addEventListener("input", () => {
      if (state.editingRoutineId) renameRoutine(state.editingRoutineId, nameInput.value);
    });
    editing.appendChild(nameInput);

    const hint = document.createElement("p");
    hint.className = "routine-hint";
    hint.textContent = "カレンダー上で予定を作成・編集できます。内容は自動保存されます。";
    editing.appendChild(hint);

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "routine-done-btn";
    doneBtn.textContent = "編集を終える";
    doneBtn.addEventListener("click", finishRoutineEdit);
    editing.appendChild(doneBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "routine-delete-btn";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => {
      if (state.editingRoutineId) deleteRoutine(state.editingRoutineId);
    });
    editing.appendChild(deleteBtn);

    panel.appendChild(editing);
    return;
  }

  if (routines.length === 0) {
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent = "ルーティーンがありません。「+」で作成できます。";
    panel.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "routine-list";

  for (const routine of routines) {
    const li = document.createElement("li");
    li.className = "routine-item";

    const info = document.createElement("div");
    info.className = "routine-item-info";
    const name = document.createElement("span");
    name.className = "routine-item-name";
    name.textContent = routine.name;
    info.append(name);

    const actions = document.createElement("div");
    actions.className = "routine-item-actions";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "routine-action-btn routine-action-apply";
    applyBtn.title = "適用";
    applyBtn.setAttribute("aria-label", "適用");
    applyBtn.appendChild(routineIcon('<polygon points="8 5 19 12 8 19 8 5" fill="currentColor" stroke="none" />'));
    applyBtn.addEventListener("click", () => applyRoutine(routine.id));

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "routine-action-btn";
    editBtn.title = "編集";
    editBtn.setAttribute("aria-label", "編集");
    editBtn.appendChild(routineIcon('<path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />'));
    editBtn.addEventListener("click", () => editRoutine(routine.id));

    actions.append(applyBtn, editBtn);
    li.append(info, actions);
    list.appendChild(li);
  }

  panel.appendChild(list);
}

function clearSchedule() {
  if (state.routineMode) return;
  if (state.events.length === 0) return;
  if (!window.confirm("この日の予定をすべて削除しますか？")) return;
  state.events = [];
  closeSidebar();
  renderEvents();
  scheduleSave();
  refreshSidebarPanels();
}

function markAllTasksUndone() {
  if (state.routineMode) return;
  if (state.events.length === 0) return;
  let changed = false;
  for (const event of state.events) {
    let eventChanged = false;
    if (event.done) {
      setItemDone(event, false);
      eventChanged = true;
    }
    for (const task of event.tasks ?? []) {
      if (task.done) {
        setItemDone(task, false);
        eventChanged = true;
      }
    }
    if (eventChanged) {
      reorderTasksByDone(event);
      changed = true;
    }
  }
  if (!changed) return;
  renderEvents();
  if (state.selectedId) fillSidebar();
  scheduleSave();
  refreshAlternateViews();
  refreshSidebarPanels();
}

function deleteAllCompleted() {
  if (state.routineMode) return;
  if (state.events.length === 0) return;

  const hasCompleted =
    state.events.some((e) => e.done) ||
    state.events.some((e) => (e.tasks ?? []).some((t) => t.done));
  if (!hasCompleted) return;
  if (!window.confirm("完了している予定と子タスクをすべて削除しますか？")) return;

  const selectedId = state.selectedId;
  const selectedWasDone = state.events.find((e) => e.id === selectedId)?.done;

  state.events = state.events
    .filter((e) => !e.done)
    .map((e) => {
      e.tasks = (e.tasks ?? []).filter((t) => !t.done);
      return e;
    });

  if (selectedWasDone || (selectedId && !state.events.some((e) => e.id === selectedId))) {
    closeSidebar();
  }

  renderEvents();
  if (state.selectedId) fillSidebar();
  scheduleSave();
  refreshAlternateViews();
  refreshSidebarPanels();
}

function runBulkAction(action) {
  closeBulkMenu();
  switch (action) {
    case "delete-all":
      clearSchedule();
      break;
    case "mark-undone":
      markAllTasksUndone();
      break;
    case "delete-completed":
      deleteAllCompleted();
      break;
    default:
      break;
  }
}

function closeBulkMenu() {
  const panel = document.getElementById("cal-bulk-menu-panel");
  const btn = document.getElementById("btn-bulk-actions");
  if (!panel || !btn) return;
  panel.hidden = true;
  btn.setAttribute("aria-expanded", "false");
}

function toggleBulkMenu() {
  const panel = document.getElementById("cal-bulk-menu-panel");
  const btn = document.getElementById("btn-bulk-actions");
  if (!panel || !btn) return;
  const open = panel.hidden;
  panel.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function initBulkMenu() {
  const menu = document.getElementById("cal-bulk-menu");
  const btn = document.getElementById("btn-bulk-actions");
  const panel = document.getElementById("cal-bulk-menu-panel");
  if (!menu || !btn || !panel) return;

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    toggleBulkMenu();
  });

  panel.querySelectorAll("[data-bulk-action]").forEach((item) => {
    item.addEventListener("click", () => {
      runBulkAction(item.dataset.bulkAction);
    });
  });

  document.addEventListener("click", (ev) => {
    if (!menu.contains(ev.target)) closeBulkMenu();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeBulkMenu();
  });
}

function isMovableForFillGaps(event) {
  return !event.done && isFillMovableTag(event);
}

function fillGapObstacles(excludeIds = new Set()) {
  return state.events
    .filter((e) => !excludeIds.has(e.id) && !isMovableForFillGaps(e))
    .map((e) => ({
      start: minutesFromMidnight(e.start),
      end: minutesFromMidnight(e.end),
    }))
    .filter((o) => o.end > o.start)
    .sort((a, b) => a.start - b.start);
}

function placementStart(cursor, duration, obstacles) {
  let start = cursor;
  for (;;) {
    const end = start + duration;
    const block = obstacles.find((o) => start < o.end && end > o.start);
    if (!block) return start;
    start = block.end;
  }
}

function finishFillGaps(changed) {
  if (!changed) return;
  state.events.sort((a, b) => minutesFromMidnight(a.start) - minutesFromMidnight(b.start));
  renderEvents();
  if (state.selectedId) fillSidebar({ skipTasks: true });
  scheduleSave();
  refreshSidebarPanels();
}

function fillGapsForSelected(ids) {
  const idSet = new Set(ids);
  const items = state.events
    .filter((e) => idSet.has(e.id) && isMovableForFillGaps(e))
    .map((e) => ({
      ev: e,
      start: minutesFromMidnight(e.start),
      end: minutesFromMidnight(e.end),
    }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (items.length < 2) return;

  const obstacles = fillGapObstacles(idSet);
  let cursor = items[0].start;
  let changed = false;
  for (const item of items) {
    const duration = item.end - item.start;
    const nextStart = placementStart(cursor, duration, obstacles);
    if (item.start !== nextStart) {
      item.ev.start = timeFromMinutes(nextStart);
      item.ev.end = timeFromMinutes(nextStart + duration);
      changed = true;
    }
    cursor = nextStart + duration;
  }

  finishFillGaps(changed);
}

function fillGapsAfterSelected(selectedId) {
  const selected = state.events.find((e) => e.id === selectedId);
  if (!selected) return;

  const selStart = minutesFromMidnight(selected.start);
  const selEnd = minutesFromMidnight(selected.end);
  const obstacles = [
    ...fillGapObstacles(new Set([selectedId])),
    { start: selStart, end: selEnd },
  ].sort((a, b) => a.start - b.start);

  let items = state.events
    .filter(
      (e) =>
        e.id !== selected.id &&
        isMovableForFillGaps(e) &&
        minutesFromMidnight(e.end) > selStart,
    )
    .map((e) => ({
      ev: e,
      start: minutesFromMidnight(e.start),
      end: minutesFromMidnight(e.end),
    }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (items.length === 0) return;

  let cursor = selEnd;
  let changed = false;
  let i = 0;
  while (i < items.length) {
    let groupEnd = items[i].end;
    let j = i + 1;
    while (j < items.length && items[j].start < groupEnd) {
      groupEnd = Math.max(groupEnd, items[j].end);
      j += 1;
    }
    const groupStart = items[i].start;
    const groupDuration = groupEnd - groupStart;
    const nextStart = placementStart(cursor, groupDuration, obstacles);
    const shift = groupStart - nextStart;
    if (shift !== 0) {
      for (let k = i; k < j; k += 1) {
        const it = items[k];
        it.ev.start = timeFromMinutes(it.start - shift);
        it.ev.end = timeFromMinutes(it.end - shift);
      }
      changed = true;
    }
    cursor = nextStart + groupDuration;
    i = j;
  }

  finishFillGaps(changed);
}

function fillGaps() {
  if (state.selectedIds.length >= 2) {
    fillGapsForSelected(state.selectedIds);
  } else if (state.selectedIds.length === 1) {
    fillGapsAfterSelected(state.selectedIds[0]);
  }
}

els.btnAddTask.addEventListener("click", addTask);
els.btnDeleteEvent.addEventListener("click", deleteSelectedEvent);

els.eventTitle.addEventListener("input", () => {
  autoResizeTaskInput(els.eventTitle);
  updateSelectedFromSidebar();
});
els.eventDone.addEventListener("change", () => {
  const event = selectedEvent();
  if (!event) return;
  const wantDone = els.eventDone.checked;
  if (!trySetEventDone(event, wantDone)) {
    syncEventDoneUI(false);
    return;
  }
  syncEventDoneUI(event.done);
  renderEvents();
  scheduleSave();
  if (state.viewMode === "settings") renderAnalysisPanel();
});
els.eventNotes.addEventListener("input", updateSelectedFromSidebar);

function setNowFullscreen(on) {
  appEl.classList.toggle("now-fullscreen", on);
  els.nowExpand.setAttribute("aria-label", on ? "全画面を終了" : "全画面表示");
  els.nowExpand.title = on ? "全画面を終了" : "全画面表示";
}

els.nowExpand.addEventListener("click", () => {
  setNowFullscreen(!appEl.classList.contains("now-fullscreen"));
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !els.notificationPopup.hidden) {
    closeNotificationPopup();
    return;
  }
  if (ev.key === "Escape" && appEl.classList.contains("now-fullscreen")) {
    setNowFullscreen(false);
  }
});

els.nowAddTask.addEventListener("click", addTaskNow);
els.nowNotes.addEventListener("input", () => {
  const event = currentEventAtNow();
  if (!event) return;
  event.notes = els.nowNotes.value;
  if (event.id === state.selectedId) els.eventNotes.value = event.notes;
  scheduleSave();
  refreshAlternateViews();
});

els.dayMemo.addEventListener("input", () => {
  state.dayMemo = els.dayMemo.value;
  syncMemoHighlight();
  scheduleSave();
  refreshAlternateViews();
});

els.dayMemo.addEventListener("scroll", () => {
  els.dayMemoHighlight.scrollTop = els.dayMemo.scrollTop;
  els.dayMemoHighlight.scrollLeft = els.dayMemo.scrollLeft;
});

bindMemoListEditor(els.dayMemo);
bindMemoListEditor(els.eventNotes);
bindMemoListEditor(els.nowNotes);

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
  if (!hasEventSelection() || isEditableTarget(ev.target)) return;
  ev.preventDefault();
  selectAdjacentEvent(ev.key === "ArrowUp" ? -1 : 1);
});

document.addEventListener("keydown", (ev) => {
  if (ev.isComposing || ev.keyCode === 229) return;

  if (ev.key === "a" && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
    if (isEditableTarget(ev.target)) return;
    const canAdd = selectedEvent() || (state.sidebarTab === "now" && currentEventAtNow());
    if (!canAdd) return;
    ev.preventDefault();
    addTaskAtOpenLocation();
    return;
  }

  if (isEventDoneKey(ev)) {
    if (!hasEventSelection() || isEditableTarget(ev.target)) return;
    ev.preventDefault();
    toggleSelectedEventsDone();
    return;
  }

  if (isFillGapsKey(ev)) {
    if (!hasEventSelection() || isEditableTarget(ev.target)) return;
    ev.preventDefault();
    fillGaps();
    return;
  }

  if (isEventDeleteKey(ev)) {
    if (activeSubtaskContext()) return;
    if (!hasEventSelection() || isEditableTarget(ev.target)) return;
    ev.preventDefault();
    deleteSelectedEvent({ skipConfirm: true });
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "z" && ev.key !== "Z") return;
  if (!(ev.metaKey || ev.ctrlKey)) return;
  if (isEditableTarget(ev.target)) return;
  ev.preventDefault();
  if (ev.shiftKey) redo();
  else undo();
});

els.viewStartHour.addEventListener("change", () => {
  const start = Number(els.viewStartHour.value);
  const end = Number(els.viewEndHour.value);
  if (start >= end) {
    viewEndHour = Math.min(MAX_VIEW_HOUR, start + 1);
    els.viewEndHour.value = String(viewEndHour);
  }
  viewStartHour = start;
  saveViewSettings();
  applyViewRange();
});

els.viewEndHour.addEventListener("change", () => {
  const start = Number(els.viewStartHour.value);
  const end = Number(els.viewEndHour.value);
  if (end <= start) {
    viewStartHour = Math.max(MIN_VIEW_HOUR, end - 1);
    els.viewStartHour.value = String(viewStartHour);
  }
  viewEndHour = end;
  saveViewSettings();
  applyViewRange();
});

const appEl = document.querySelector(".app");
const sidebarToggle = document.getElementById("sidebar-toggle");
const SIDEBAR_COLLAPSED_KEY = `${STORAGE_PREFIX}sidebar-collapsed`;

function setSidebarCollapsed(collapsed) {
  appEl.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  sidebarToggle.setAttribute("aria-label", collapsed ? "サイドバーを開く" : "サイドバーを折りたたむ");
  if (useFileStorage && fileData) {
    fileData.settings = { ...(fileData.settings ?? {}), sidebarCollapsed: collapsed };
    scheduleFileSave();
    return;
  }
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore
  }
}

sidebarToggle.addEventListener("click", () => {
  setSidebarCollapsed(!appEl.classList.contains("sidebar-collapsed"));
});

document.getElementById("btn-fill-gaps").addEventListener("click", fillGaps);
initBulkMenu();

els.viewTabs.forEach((btn) => {
  btn.addEventListener("click", () => setViewMode(btn.dataset.view));
});
els.boardSortBtns.forEach((btn) => {
  btn.addEventListener("click", () => setBoardSort(btn.dataset.sort));
});
els.nowViewTabs.forEach((btn) => {
  btn.addEventListener("click", () => setNowViewMode(btn.dataset.nowView));
});
els.btnLoadMarkdown.addEventListener("click", loadTasksMarkdown);
els.btnCopyMarkdown.addEventListener("click", copyTasksMarkdown);
els.btnUpdateRange.addEventListener("click", updateRangeToNow);

els.notificationSound.addEventListener("change", applyNotificationSettingsFromUI);
els.btnTestNotification.addEventListener("click", () => {
  getNotificationAudioContext();
  playNotificationSound(state.notificationSound);
});
els.btnTestPopup.addEventListener("click", () => {
  showNotificationPopup("タスクが終わっていません", "09:00–09:30 サンプルタスク");
});
els.notificationImageInput.addEventListener("change", () => {
  const files = els.notificationImageInput.files;
  if (files?.length) handleNotificationImageUpload(files);
});
els.btnClearNotificationImages.addEventListener("click", clearNotificationImages);
els.notificationPopupClose.addEventListener("click", closeNotificationPopup);
document.getElementById("notification-popup-backdrop")?.addEventListener("click", closeNotificationPopup);

async function initApp() {
  await initFileStorage();
  if (isStaticHosting()) {
    document.body.classList.add("static-hosting");
    document.getElementById("hosting-notice")?.removeAttribute("hidden");
  }
  routines = readRoutinesFromStorage();
  loadViewSettings();
  await loadNotificationImages();
  initNotificationSettingsUI();
  initTagBehaviorSettingsUI();
  initViewRangeSelects();
  initSidebarTabs();
  const ui = useFileStorage && fileData?.settings ? fileData.settings : null;
  setSidebarCollapsed(
    ui ? !!ui.sidebarCollapsed : localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1",
  );
  loadDay(todayISO());
  initTagPicker();
  refreshSidebarPanels();
  updateNowTab();
}

initApp();
window.addEventListener("resize", () => {
  syncLayout();
  buildAxes();
});

setInterval(() => {
  syncCalendarDate();
  autoCompletePastEvents();
  renderNowLine();
  updateNowTab();
  checkEventNotifications();
  if (state.sidebarTab === "now") renderNowPanel();
  if (state.viewMode === "settings") renderAnalysisPanel();
}, 1000);
