"use strict";

const byId = (id) => document.getElementById(id);
const calendar = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" });
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const settings = {
  daily: { deck: dailyDeck, limit: 7, label: "下班运势牌", action: "今晚试试" },
  weekly: { deck: weeklyDeck, limit: 4, label: "本周贵人", action: "可以这样开口" }
};
const memory = { daily: [], weekly: [] };
const volatileStorage = new Set();
const moodButtons = document.querySelectorAll(".mood-button");
const displayCard = byId("display-card");
const historyDialog = byId("history-dialog");
const shareDialog = byId("share-dialog");
let view = "daily";
let mood = "default";
let currentResult = null;
let revision = 0;

function periodDate(kind, now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === "weekly") date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  const pad = (value) => String(value).padStart(2, "0");
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}

function storageKey(kind) {
  return "afterhours-oracle:v1:" + kind;
}

function records(kind) {
  if (volatileStorage.has(kind)) return memory[kind];
  try {
    const entries = JSON.parse(localStorage.getItem(storageKey(kind)) || "[]");
    if (Array.isArray(entries)) return entries;
  } catch {
    // An unavailable storage area still allows draws until the tab closes.
  }
  return memory[kind];
}

function saveRecord(record) {
  const { kind } = record;
  const entries = [record, ...records(kind)].slice(0, settings[kind].limit);
  memory[kind] = entries;
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(entries));
  } catch {
    // Preserve the result in memory when the browser blocks persistence.
    volatileStorage.add(kind);
  }
}

function findCurrent(kind, period = periodDate(kind)) {
  return records(kind).find((record) => record.period === period);
}

function getOrDraw(kind, selectedMood) {
  const now = new Date();
  const period = periodDate(kind, now);
  const existing = findCurrent(kind, period);
  if (existing) return existing;
  const deck = settings[kind].deck;
  const card = deck[Math.floor(Math.random() * deck.length)];
  const [reading, action] = kind === "daily" ? card.messages[selectedMood] : [card.reading, card.action];
  const { title, symbol, color, verse } = card;
  const result = { kind, period, drawnAt: now.toISOString(), title, symbol, color, verse, reading, action };
  saveRecord(result);
  return result;
}

function clearMood() {
  mood = "default";
  for (const button of moodButtons) button.setAttribute("aria-pressed", "false");
}

function paintCard(record) {
  displayCard.classList.remove("flipping", "revealing");
  displayCard.classList.toggle("face", Boolean(record));
  displayCard.style.setProperty("--face-color", record?.color || "#795276");
  byId("card-symbol").textContent = record?.symbol || (view === "weekly" ? "✧" : "☾");
  byId("card-caption").textContent = record?.title || "✦";
}

function updateLabels() {
  const now = new Date();
  byId("today").dateTime = periodDate("daily", now);
  byId("today").textContent = calendar.format(now);
  const daily = findCurrent("daily");
  const weekly = findCurrent("weekly");
  byId("weekly-label").textContent = weekly ? "回看本周贵人" : "抽张贵人牌";
  if (view === "daily") {
    byId("draw-label").textContent = daily ? "回看今日牌" : "抽张下班牌";
    byId("mood-picker").hidden = Boolean(daily);
  } else if (view === "weekly") {
    byId("draw-label").textContent = weekly ? "回看本周贵人" : "抽张贵人牌";
    byId("mood-picker").hidden = true;
  }
}

function focusTitle(id) {
  byId(id).focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function showDraw(kind, focus = true) {
  revision += 1;
  view = kind;
  currentResult = null;
  clearMood();
  const weekly = kind === "weekly";
  const title = byId("main-title");
  const accent = document.createElement("span");
  accent.textContent = weekly ? "遇见怎样的人？" : "给今晚抽张牌。";
  title.replaceChildren(weekly ? "这一周，" : "下班了，", document.createElement("br"), accent);
  byId("intro").textContent = weekly
    ? "翻开一张牌，看看这周可以留意哪一类人。"
    : "翻开一张牌，带走一句解读和一个今晚就能做的小动作。";
  byId("weekly-back").hidden = !weekly;
  byId("weekly-panel").hidden = weekly;
  byId("draw-view").hidden = false;
  byId("result-view").hidden = true;
  byId("draw-button").disabled = false;
  document.querySelector(".hero").setAttribute("aria-labelledby", "main-title");
  updateLabels();
  paintCard();
  if (focus) focusTitle("main-title");
}

function showResult(record, animate = false) {
  revision += 1;
  view = "result";
  currentResult = record;
  byId("draw-view").hidden = true;
  byId("result-view").hidden = false;
  byId("weekly-panel").hidden = record.kind === "weekly";
  document.querySelector(".hero").setAttribute("aria-labelledby", "result-title");
  byId("result-kind").textContent = settings[record.kind].label;
  byId("result-title").textContent = record.title;
  byId("result-reading").textContent = record.reading;
  byId("action-label").textContent = settings[record.kind].action;
  byId("result-action").textContent = record.action;
  byId("save-status").hidden = true;
  updateLabels();
  paintCard(record);
  if (animate) displayCard.classList.add("revealing");
  focusTitle("result-title");
}

async function draw() {
  if (byId("draw-button").disabled) return;
  const existing = findCurrent(view);
  if (existing) {
    showResult(existing);
    return;
  }
  const kind = view;
  const selectedMood = mood;
  const drawRevision = revision;
  byId("draw-button").disabled = true;
  const choose = () => getOrDraw(kind, selectedMood);
  let result;
  try {
    result = navigator.locks ? await navigator.locks.request(storageKey(kind), choose) : choose();
  } catch {
    result = choose();
  }
  if (revision !== drawRevision) return;
  if (reducedMotion.matches) {
    showResult(result);
    return;
  }
  byId("draw-label").textContent = "正在翻牌";
  displayCard.classList.add("flipping");
  window.setTimeout(() => {
    if (revision === drawRevision) showResult(result, true);
  }, 330);
}

function openHistory() {
  const entries = [...records("daily"), ...records("weekly")]
    .sort((first, second) => second.drawnAt.localeCompare(first.drawnAt));
  const list = byId("history-list");
  list.replaceChildren();
  byId("history-empty").hidden = entries.length > 0;
  for (const record of entries) {
    const item = document.createElement("button");
    const symbol = document.createElement("span");
    const body = document.createElement("span");
    const context = document.createElement("small");
    const arrow = document.createElement("span");
    item.type = "button";
    item.className = "history-item";
    symbol.className = "symbol";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = record.symbol;
    context.textContent = record.period + " · " + settings[record.kind].label;
    body.append(record.title, context);
    arrow.textContent = "→";
    arrow.setAttribute("aria-hidden", "true");
    item.append(symbol, body, arrow);
    item.addEventListener("click", () => {
      historyDialog.close();
      showResult(record);
    });
    list.append(item);
  }
  historyDialog.showModal();
}

function shareImage(record) {
  const canvas = document.createElement("canvas");
  canvas.width = 840;
  canvas.height = 1100;
  const pen = canvas.getContext("2d");
  if (!pen) throw new Error("Canvas unavailable");

  const backdrop = pen.createRadialGradient(420, 470, 15, 420, 520, 650);
  backdrop.addColorStop(0, record.color);
  backdrop.addColorStop(.58, "#302449");
  backdrop.addColorStop(1, "#191630");
  pen.fillStyle = backdrop;
  pen.fillRect(0, 0, 840, 1100);
  pen.strokeStyle = "#e5c487";
  pen.lineWidth = 3;
  pen.strokeRect(28, 28, 784, 1044);
  pen.globalAlpha = .45;
  pen.lineWidth = 1;
  pen.strokeRect(44, 44, 752, 1012);
  for (const radius of [159, 179]) {
    pen.beginPath();
    pen.arc(420, 432, radius, 0, 2 * Math.PI);
    pen.stroke();
  }
  for (const [x, y] of [[108, 184], [180, 274], [698, 217], [647, 317], [188, 620], [680, 570]]) {
    pen.beginPath();
    pen.moveTo(x - 7, y);
    pen.lineTo(x + 7, y);
    pen.moveTo(x, y - 7);
    pen.lineTo(x, y + 7);
    pen.stroke();
  }
  pen.globalAlpha = 1;
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  pen.fillStyle = "#f2d493";
  pen.font = '42px "Microsoft YaHei", "PingFang SC", sans-serif';
  pen.fillText(settings[record.kind].label, 420, 150, 700);
  pen.font = '205px "Segoe UI Symbol", Georgia, serif';
  pen.fillText(record.symbol, 420, 436, 270);
  pen.fillStyle = "#fff5e4";
  pen.font = 'bold 76px "Microsoft YaHei", "PingFang SC", sans-serif';
  pen.fillText(record.title, 420, 750, 680);
  pen.font = '41px "Microsoft YaHei", "PingFang SC", sans-serif';
  pen.fillText(record.verse, 420, 845, 680);
  pen.fillStyle = "#d5c5e3";
  pen.font = '28px "Microsoft YaHei", "PingFang SC", sans-serif';
  pen.fillText("娱乐抽牌", 420, 980);
  return canvas.toDataURL("image/png");
}

function showShare() {
  if (!currentResult) return;
  try {
    const url = shareImage(currentResult);
    byId("share-image").src = url;
    byId("share-image").alt = currentResult.title + " · " + currentResult.verse;
    byId("download-link").href = url;
    byId("download-link").download = currentResult.title + ".png";
    shareDialog.showModal();
  } catch {
    byId("save-status").textContent = "图片暂时无法生成，可以截图保存牌面。";
    byId("save-status").hidden = false;
  }
}

for (const button of moodButtons) {
  button.addEventListener("click", () => {
    const next = button.dataset.mood === mood ? "default" : button.dataset.mood;
    clearMood();
    if (next === "default") return;
    mood = next;
    button.setAttribute("aria-pressed", "true");
  });
}
byId("draw-button").addEventListener("click", draw);
byId("weekly-button").addEventListener("click", () => {
  const record = findCurrent("weekly");
  if (record) showResult(record);
  else showDraw("weekly");
});
for (const id of ["home-button", "weekly-back", "result-back"]) {
  byId(id).addEventListener("click", () => showDraw("daily"));
}
byId("history-button").addEventListener("click", openHistory);
byId("save-button").addEventListener("click", showShare);
window.addEventListener("focus", updateLabels);
window.addEventListener("storage", updateLabels);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateLabels();
});
window.setInterval(updateLabels, 30_000);
showDraw("daily", false);
