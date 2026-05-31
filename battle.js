import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  get,
  push,
  remove,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDThHT_h6rZpfsa6p6yPDbjBzhAivm5GB8",
  authDomain: "sudoku-2db43.firebaseapp.com",
  databaseURL: "https://sudoku-2db43-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sudoku-2db43",
  storageBucket: "sudoku-2db43.firebasestorage.app",
  messagingSenderId: "872508216238",
  appId: "1:872508216238:web:d91ef230674f0041662e3f",
  measurementId: "G-235782ENKG",
};

const boardEl = document.querySelector("#battleBoard");
const roomCodeEl = document.querySelector("#roomCode");
const mobileRoomCodeEl = document.querySelector("#mobileRoomCode");
const timerEl = document.querySelector("#battleTimer");
const mobileTimerEl = document.querySelector("#mobileBattleTimer");
const messageEl = document.querySelector("#battleMessage");
const playersPanel = document.querySelector("#playersPanel");
const chatMessagesEl = document.querySelector("#chatMessages");
const mobileChatPreviewEl = document.querySelector("#mobileChatPreview");
const chatInput = document.querySelector("#chatInput");
const sendChatBtn = document.querySelector("#sendChatBtn");
const setupPanel = document.querySelector("#setupPanel");
const playerNameInput = document.querySelector("#playerName");
const joinCodeInput = document.querySelector("#joinCode");
const customRoomCodeInput = document.querySelector("#customRoomCode");
const eraseLimitInput = document.querySelector("#eraseLimit");
const hintLimitInput = document.querySelector("#hintLimit");
const soundPresetInput = document.querySelector("#soundPreset");
const soundVolumeInput = document.querySelector("#soundVolume");
const createRoomBtn = document.querySelector("#createRoomBtn");
const joinRoomBtn = document.querySelector("#joinRoomBtn");
const hintBtn = document.querySelector("#hintBtn");
const eraseBtn = document.querySelector("#battleEraseBtn");
const leaveRoomBtn = document.querySelector("#leaveRoomBtn");
const restartRoomBtn = document.querySelector("#restartRoomBtn");
const difficultyButtons = [...document.querySelectorAll("[data-battle-difficulty]")];
const chatModeButtons = [...document.querySelectorAll("[data-chat-mode]")];
const numberButtons = [...document.querySelectorAll("[data-battle-number]")];

const size = 9;
const boxSize = 3;
const sessionKey = "classic-sudoku-battle-session-v1";
const playerKey = "classic-sudoku-battle-player-v1";
const difficultySettings = {
  easy: { label: "쉬움", clues: 45 },
  medium: { label: "보통", clues: 36 },
  hard: { label: "어려움", clues: 30 },
};

let db = null;
let roomCode = "";
let room = null;
let playerId = localStorage.getItem(playerKey) || crypto.randomUUID();
let playerName = "플레이어";
let difficulty = "easy";
let solution = [];
let puzzle = [];
let playerGrid = [];
let fixedCells = [];
let selected = { row: 0, col: 0 };
let seconds = 0;
let timerId = null;
let unsubscribeRoom = null;
let isFinished = false;
let creatingRoom = false;
let lastChatCount = 0;
let eraseLimit = 3;
let eraseUsed = 0;
let hintLimit = 2;
let hintUsed = 0;
let chatMode = "free";
let chatCredits = 0;
let soundPreset = "soft";
let soundVolume = 80;
let completedUnits = new Set();
let roundId = "";
let audioContext = null;

localStorage.setItem(playerKey, playerId);

function hasFirebaseConfig() {
  return !Object.values(firebaseConfig).some((value) => value.includes("YOUR_"));
}

function setMessage(text, tone = "normal") {
  messageEl.textContent = text;
  messageEl.style.borderLeftColor = tone === "warn" ? "var(--warn)" : "var(--accent)";
}

function setRoomCodeText(value) {
  roomCodeEl.textContent = value;
  if (mobileRoomCodeEl) mobileRoomCodeEl.textContent = value;
}

const soundPresets = {
  soft: { correct: [660, 990], wrong: [150, 90], type: "sine" },
  pop: { correct: [520, 780], wrong: [170, 110], type: "square" },
  bell: { correct: [880, 1320], wrong: [220, 140], type: "sine" },
  arcade: { correct: [740, 1180], wrong: [180, 80], type: "sawtooth" },
  drum: { correct: [300, 520], wrong: [110, 70], type: "triangle" },
};

function getSoundVolume() {
  const value = Number(soundVolumeInput?.value);
  if (!Number.isFinite(value)) return 0.8;
  return Math.max(0, Math.min(1, value / 100));
}

function playTone(kind) {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const preset = soundPresets[soundPreset] || soundPresets.soft;
    const [start, end] = kind === "correct" ? preset.correct : preset.wrong;
    const volume = getSoundVolume();

    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(end, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime((kind === "correct" ? 0.24 : 0.28) * volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  } catch {
    // Sound is optional; some mobile browsers block audio until interaction.
  }
}

function firebaseErrorMessage(error) {
  const code = error?.code || "";
  const message = error?.message || String(error);

  if (code.includes("permission-denied")) {
    return "Firebase 권한이 막혀 있어요. Realtime Database 규칙을 test mode로 열어주세요.";
  }

  if (message.includes("Database URL") || message.includes("databaseURL")) {
    return "Firebase Realtime Database 주소가 맞지 않아요. Database 화면의 URL을 확인해주세요.";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "Firebase에 연결하지 못했어요. 인터넷 연결이나 Firebase 설정을 확인해주세요.";
  }

  return `오류가 발생했어요: ${message}`;
}

async function runAction(action, workingText) {
  try {
    if (workingText) setMessage(workingText);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await Promise.race([
      action(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firebase 응답 시간이 너무 길어요. Realtime Database 주소와 규칙을 확인해주세요.")), 12000),
      ),
    ]);
  } catch (error) {
    console.error(error);
    if (creatingRoom) {
      resetBattleState("방을 Firebase에 저장하지 못했어요. Database 주소와 Rules를 확인한 뒤 새 방을 다시 만들어주세요.");
      return;
    }
    if (roomCode) setRoomCodeText(roomCode);
    setMessage(firebaseErrorMessage(error), "warn");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shuffle(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function isGrid(value) {
  return (
    Array.isArray(value) &&
    value.length === size &&
    value.every((row) => Array.isArray(row) && row.length === size)
  );
}

function makeEmptyGrid() {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function isValid(grid, row, col, value) {
  for (let i = 0; i < size; i += 1) {
    if (grid[row][i] === value || grid[i][col] === value) return false;
  }

  const startRow = Math.floor(row / boxSize) * boxSize;
  const startCol = Math.floor(col / boxSize) * boxSize;
  for (let r = startRow; r < startRow + boxSize; r += 1) {
    for (let c = startCol; c < startCol + boxSize; c += 1) {
      if (grid[r][c] === value) return false;
    }
  }

  return true;
}

function fillGrid(grid) {
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (grid[row][col] !== 0) continue;

      for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
        if (!isValid(grid, row, col, value)) continue;
        grid[row][col] = value;
        if (fillGrid(grid)) return true;
        grid[row][col] = 0;
      }

      return false;
    }
  }

  return true;
}

function countSolutions(grid, limit = 2) {
  let count = 0;

  function solve() {
    if (count >= limit) return;

    let best = null;
    let candidates = [];

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (grid[row][col] !== 0) continue;
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((value) =>
          isValid(grid, row, col, value),
        );
        if (values.length === 0) return;
        if (!best || values.length < candidates.length) {
          best = { row, col };
          candidates = values;
        }
      }
    }

    if (!best) {
      count += 1;
      return;
    }

    for (const value of candidates) {
      grid[best.row][best.col] = value;
      solve();
      grid[best.row][best.col] = 0;
      if (count >= limit) return;
    }
  }

  solve();
  return count;
}

function makePuzzle(fullGrid, clues) {
  const next = cloneGrid(fullGrid);
  const positions = shuffle(
    Array.from({ length: size * size }, (_, index) => ({
      row: Math.floor(index / size),
      col: index % size,
    })),
  );

  const blanks = size * size - clues;
  for (const { row, col } of positions.slice(0, blanks)) {
    next[row][col] = 0;
  }

  return next;
}

function makePuzzleWithUniqueSolution(fullGrid, clues) {
  const next = cloneGrid(fullGrid);
  const positions = shuffle(
    Array.from({ length: size * size }, (_, index) => ({
      row: Math.floor(index / size),
      col: index % size,
    })),
  );

  let remaining = size * size;
  for (const { row, col } of positions) {
    if (remaining <= clues) break;

    const saved = next[row][col];
    next[row][col] = 0;

    if (countSolutions(cloneGrid(next)) === 1) {
      remaining -= 1;
    } else {
      next[row][col] = saved;
    }
  }

  return next;
}

function generateGame(level) {
  const fullGrid = makeEmptyGrid();
  fillGrid(fullGrid);
  solution = cloneGrid(fullGrid);
  puzzle = makePuzzle(fullGrid, difficultySettings[level].clues);
  playerGrid = cloneGrid(puzzle);
  fixedCells = puzzle.map((row) => row.map((value) => value !== 0));
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const secs = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function cleanRoomCode(value) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9가-힣_-]/g, "")
    .slice(0, 12);
}

function getName() {
  return playerNameInput.value.trim() || "플레이어";
}

function getEraseLimit() {
  const value = Number(eraseLimitInput?.value);
  if (!Number.isFinite(value)) return 3;
  return Math.max(0, Math.min(9, Math.floor(value)));
}

function getHintLimit() {
  const value = Number(hintLimitInput?.value);
  if (!Number.isFinite(value)) return 2;
  return Math.max(0, Math.min(9, Math.floor(value)));
}

function getSoundPreset() {
  return soundPresets[soundPresetInput?.value] ? soundPresetInput.value : "soft";
}

function eraseRemaining() {
  return Math.max(0, eraseLimit - eraseUsed);
}

function hintRemaining() {
  return Math.max(0, hintLimit - hintUsed);
}

function updateEraseButton() {
  eraseBtn.textContent = `지우기 ${eraseRemaining()}/${eraseLimit}`;
  eraseBtn.disabled = isFinished || !roomCode || eraseRemaining() <= 0;
}

function updateHintButton() {
  hintBtn.textContent = `힌트 ${hintRemaining()}/${hintLimit}`;
  hintBtn.disabled = isFinished || !roomCode || hintRemaining() <= 0;
}

function updateChatInputState() {
  const locked = chatMode === "earned" && chatCredits <= 0;
  chatInput.placeholder = locked ? "정답을 맞히면 1번 말할 수 있어요" : "메시지 입력";
  chatInput.disabled = !roomCode || locked;
  sendChatBtn.disabled = !roomCode || locked;
}

function setPlayControlsDisabled(disabled) {
  numberButtons.forEach((button) => {
    button.disabled = disabled;
  });
  eraseBtn.disabled = disabled || eraseRemaining() <= 0;
  hintBtn.disabled = disabled || hintRemaining() <= 0;
  restartRoomBtn.disabled = !roomCode || !room || room.ownerId !== playerId;
}

function saveSession() {
  if (!roomCode) return;
  localStorage.setItem(
    sessionKey,
    JSON.stringify({
      roomCode,
      playerId,
      playerName,
      playerGrid,
      selected,
      seconds,
      eraseLimit,
      eraseUsed,
      hintLimit,
      hintUsed,
      chatMode,
      chatCredits,
      soundPreset,
      soundVolume,
      completedUnits: [...completedUnits],
      roundId,
    }),
  );
}

function clearSession() {
  localStorage.removeItem(sessionKey);
}

function resetBattleState(text = "방을 만들거나 코드를 입력해서 참가하세요.") {
  clearInterval(timerId);
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
  roomCode = "";
  room = null;
  solution = [];
  puzzle = [];
  playerGrid = [];
  fixedCells = [];
  selected = { row: 0, col: 0 };
  seconds = 0;
  isFinished = false;
  creatingRoom = false;
  eraseLimit = getEraseLimit();
  eraseUsed = 0;
  hintLimit = getHintLimit();
  hintUsed = 0;
  chatCredits = 0;
  soundPreset = getSoundPreset();
  soundVolume = Math.round(getSoundVolume() * 100);
  completedUnits = new Set();
  roundId = "";
  clearSession();
  boardEl.innerHTML = "";
  playersPanel.innerHTML = "";
  chatMessagesEl.innerHTML = "";
  setRoomCodeText("----");
  timerEl.textContent = "00:00";
  if (mobileTimerEl) mobileTimerEl.textContent = "00:00";
  setupPanel.classList.remove("is-hidden");
  setPlayControlsDisabled(true);
  updateEraseButton();
  updateHintButton();
  updateChatInputState();
  setMessage(text, "warn");
}

async function leaveRoom() {
  const leavingCode = roomCode;
  const isOwner = room?.ownerId === playerId;
  resetBattleState("방에서 나왔어요. 새 방을 만들거나 다른 방에 참가하세요.");
  if (leavingCode && db) {
    if (isOwner) {
      await remove(ref(db, `rooms/${leavingCode}`));
    } else {
      await remove(ref(db, `rooms/${leavingCode}/players/${playerId}`));
    }
  }
}

function isValidRoomData(value) {
  return Boolean(value && isGrid(value.puzzle) && isGrid(value.solution));
}

function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(sessionKey) || "null");
    if (!saved?.roomCode || !saved?.playerId) return false;
    roomCode = saved.roomCode;
    playerId = saved.playerId;
    playerName = saved.playerName || "플레이어";
    playerGrid = isGrid(saved.playerGrid) ? saved.playerGrid : [];
    selected = saved.selected || { row: 0, col: 0 };
    seconds = Number(saved.seconds) || 0;
    eraseLimit = Number.isInteger(saved.eraseLimit) ? saved.eraseLimit : 3;
    eraseUsed = Number.isInteger(saved.eraseUsed) ? saved.eraseUsed : 0;
    hintLimit = Number.isInteger(saved.hintLimit) ? saved.hintLimit : 2;
    hintUsed = Number.isInteger(saved.hintUsed) ? saved.hintUsed : 0;
    chatMode = saved.chatMode || "free";
    chatCredits = Number.isInteger(saved.chatCredits) ? saved.chatCredits : 0;
    soundPreset = soundPresets[saved.soundPreset] ? saved.soundPreset : "soft";
    soundVolume = Number.isInteger(saved.soundVolume) ? saved.soundVolume : 80;
    completedUnits = new Set(Array.isArray(saved.completedUnits) ? saved.completedUnits : []);
    if (soundPresetInput) soundPresetInput.value = soundPreset;
    if (soundVolumeInput) soundVolumeInput.value = String(soundVolume);
    roundId = saved.roundId || "";
    playerNameInput.value = playerName;
    return true;
  } catch {
    localStorage.removeItem(sessionKey);
    return false;
  }
}

function startTimer(reset = false) {
  clearInterval(timerId);
  if (reset) seconds = 0;
  timerEl.textContent = formatTime(seconds);
  if (mobileTimerEl) mobileTimerEl.textContent = formatTime(seconds);
  timerId = setInterval(async () => {
    if (!roomCode || isFinished) return;
    seconds += 1;
    timerEl.textContent = formatTime(seconds);
    if (mobileTimerEl) mobileTimerEl.textContent = formatTime(seconds);
    saveSession();
    await update(ref(db, `rooms/${roomCode}/players/${playerId}`), { seconds });
  }, 1000);
}

function correctCount() {
  let count = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (playerGrid[row][col] === solution[row][col]) count += 1;
    }
  }
  return count;
}

function isComplete() {
  return correctCount() === size * size;
}

function unitCells(type, index) {
  if (type === "row") return Array.from({ length: size }, (_, col) => ({ row: index, col }));
  if (type === "col") return Array.from({ length: size }, (_, row) => ({ row, col: index }));

  const startRow = Math.floor(index / boxSize) * boxSize;
  const startCol = (index % boxSize) * boxSize;
  return Array.from({ length: size }, (_, offset) => ({
    row: startRow + Math.floor(offset / boxSize),
    col: startCol + (offset % boxSize),
  }));
}

function isUnitComplete(cells) {
  return cells.every(({ row, col }) => playerGrid[row][col] === solution[row][col]);
}

function flashUnit(cells) {
  requestAnimationFrame(() => {
    cells.forEach(({ row, col }) => {
      boardEl
        .querySelector(`[data-row="${row}"][data-col="${col}"]`)
        ?.classList.add("complete-pop");
    });
  });
}

function checkUnitEffects() {
  const justCompleted = [];
  ["row", "col", "box"].forEach((type) => {
    for (let index = 0; index < size; index += 1) {
      const key = `${type}-${index}`;
      const cells = unitCells(type, index);
      if (isUnitComplete(cells) && !completedUnits.has(key)) {
        completedUnits.add(key);
        justCompleted.push(cells);
      }
    }
  });

  justCompleted.forEach(flashUnit);
}

async function syncPlayer(extra = {}) {
  if (!roomCode) return;
  const complete = isComplete();
  const payload = {
    name: playerName,
    progress: correctCount(),
    seconds,
    done: complete,
    updatedAt: serverTimestamp(),
    ...extra,
  };

  if (complete && !isFinished) {
    payload.finishedAt = serverTimestamp();
    isFinished = true;
    clearInterval(timerId);
    setPlayControlsDisabled(true);
    await update(ref(db, `rooms/${roomCode}`), {
      status: "finished",
      winnerId: playerId,
      finishedAt: serverTimestamp(),
    });
    setMessage("완성! 상대보다 먼저 끝냈다면 승리입니다.");
  }

  await update(ref(db, `rooms/${roomCode}/players/${playerId}`), payload);
  saveSession();
}

function isRelated(row, col) {
  return (
    row === selected.row ||
    col === selected.col ||
    (Math.floor(row / boxSize) === Math.floor(selected.row / boxSize) &&
      Math.floor(col / boxSize) === Math.floor(selected.col / boxSize))
  );
}

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.classList.remove("loss-board");
  boardEl.removeAttribute("data-result");
  if (!puzzle.length) return;

  if (room?.status === "finished" && room?.winnerId && room.winnerId !== playerId) {
    boardEl.classList.add("loss-board");
    boardEl.dataset.result = "패배";
    for (let index = 0; index < size * size; index += 1) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.disabled = true;
      cell.setAttribute("aria-label", "패배 후 빈칸");
      boardEl.appendChild(cell);
    }
    return;
  }

  const selectedValue = playerGrid[selected.row]?.[selected.col];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const cell = document.createElement("button");
      const value = playerGrid[row][col];

      cell.className = "cell";
      cell.type = "button";
      cell.textContent = value || "";
      cell.setAttribute("aria-label", `${row + 1}행 ${col + 1}열`);
      cell.dataset.row = row;
      cell.dataset.col = col;

      if (fixedCells[row][col]) cell.classList.add("fixed");
      if (row === selected.row && col === selected.col) cell.classList.add("selected");
      else if (value && selectedValue && value === selectedValue) cell.classList.add("same");
      else if (isRelated(row, col)) cell.classList.add("related");
      if (value && value !== solution[row][col]) cell.classList.add("error");

      cell.addEventListener("click", () => {
        selected = { row, col };
        renderBoard();
        saveSession();
      });

      boardEl.appendChild(cell);
    }
  }
}

function renderPlayers() {
  const players = Object.entries(room?.players || {}).sort(([, a], [, b]) => {
    if (a.done !== b.done) return a.done ? -1 : 1;
    if ((b.progress || 0) !== (a.progress || 0)) return (b.progress || 0) - (a.progress || 0);
    return (a.seconds || 0) - (b.seconds || 0);
  });

  if (!players.length) {
    playersPanel.innerHTML = "<p>아직 참가자가 없습니다.</p>";
    return;
  }

  playersPanel.innerHTML = players
    .map(([id, player]) => {
      const winner = room?.winnerId === id ? " · 승리" : "";
      return `
        <div class="progress-row">
          <span>${player.name || "플레이어"}${id === playerId ? " (나)" : ""}</span>
          <strong>${player.progress || 0}/81</strong>
        </div>
        <p>${formatTime(player.seconds || 0)} · 지우기 ${player.eraseUsed || 0}/${room?.eraseLimit ?? eraseLimit} · 힌트 ${player.hintUsed || 0}/${room?.hintLimit ?? hintLimit}${winner}</p>
      `;
    })
    .join("");
}

function renderChat() {
  const messages = Object.entries(room?.chat || {})
    .map(([id, message]) => ({ id, ...message }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .slice(-40);

  if (!messages.length) {
    chatMessagesEl.innerHTML = '<p class="chat-empty">아직 메시지가 없습니다.</p>';
    mobileChatPreviewEl.innerHTML = '<p class="chat-empty">대화 없음</p>';
    return;
  }

  const shouldScroll =
    messages.length !== lastChatCount ||
    chatMessagesEl.scrollTop + chatMessagesEl.clientHeight >= chatMessagesEl.scrollHeight - 24;

  chatMessagesEl.innerHTML = messages
    .map((message) => {
      const mine = message.playerId === playerId ? " mine" : "";
      const name = escapeHtml(message.name || "플레이어");
      const text = escapeHtml(message.text || "");
      return `
        <div class="chat-message${mine}">
          <strong>${name}</strong>
          <span>${text}</span>
        </div>
      `;
    })
    .join("");
  mobileChatPreviewEl.innerHTML = messages
    .slice(-3)
    .map((message) => {
      const mine = message.playerId === playerId ? " mine" : "";
      const name = escapeHtml(message.name || "플레이어");
      const text = escapeHtml(message.text || "");
      return `
        <div class="chat-message${mine}">
          <strong>${name}</strong>
          <span>${text}</span>
        </div>
      `;
    })
    .join("");
  lastChatCount = messages.length;
  if (shouldScroll) {
    requestAnimationFrame(() => {
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      mobileChatPreviewEl.scrollTop = mobileChatPreviewEl.scrollHeight;
    });
  }
}

function handleRoomUpdate(snapshot) {
  room = snapshot.val();
  if (!room) {
    resetBattleState("저장된 방을 Firebase에서 찾을 수 없어요. 새 방을 다시 만들어주세요.");
    return;
  }

  if (!isValidRoomData(room)) {
    resetBattleState("이 방은 퍼즐 정보가 없어서 사용할 수 없어요. 새 방을 다시 만들어주세요.");
    return;
  }

  setRoomCodeText(roomCode);
  eraseLimit = Number.isInteger(room.eraseLimit) ? room.eraseLimit : eraseLimit;
  hintLimit = Number.isInteger(room.hintLimit) ? room.hintLimit : hintLimit;
  chatMode = room.chatMode || chatMode;
  soundPreset = soundPresets[room.soundPreset] ? room.soundPreset : soundPreset;
  soundVolume = Number.isInteger(room.soundVolume) ? room.soundVolume : soundVolume;
  if (soundPresetInput) soundPresetInput.value = soundPreset;
  if (soundVolumeInput) soundVolumeInput.value = String(soundVolume);
  solution = room.solution;
  puzzle = room.puzzle;
  fixedCells = puzzle.map((row) => row.map((value) => value !== 0));
  if (room.roundId && room.roundId !== roundId) {
    roundId = room.roundId;
    playerGrid = cloneGrid(puzzle);
    selected = { row: 0, col: 0 };
    seconds = 0;
    eraseUsed = 0;
    hintUsed = 0;
    chatCredits = 0;
    completedUnits = new Set();
    startTimer(false);
    update(ref(db, `rooms/${roomCode}/players/${playerId}`), {
      progress: correctCount(),
      seconds: 0,
      eraseUsed: 0,
      hintUsed: 0,
      chatCredits: 0,
      done: false,
      updatedAt: serverTimestamp(),
    });
  }
  if (!playerGrid.length || playerGrid.length !== size) playerGrid = cloneGrid(puzzle);
  renderBoard();
  renderPlayers();
  renderChat();

  if (room.status === "finished") {
    isFinished = true;
    clearInterval(timerId);
    setPlayControlsDisabled(true);
    updateChatInputState();
    setMessage(room.winnerId === playerId ? "승리했어요!" : "진정한 바보입니다", room.winnerId === playerId ? "normal" : "warn");
  } else {
    isFinished = false;
    setPlayControlsDisabled(false);
    updateEraseButton();
    updateHintButton();
    updateChatInputState();
  }
  restartRoomBtn.disabled = room.ownerId !== playerId;
}

function watchRoom() {
  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = onValue(ref(db, `rooms/${roomCode}`), handleRoomUpdate);
}

async function createRoom() {
  creatingRoom = true;
  playerName = getName();
  eraseLimit = getEraseLimit();
  eraseUsed = 0;
  hintLimit = getHintLimit();
  hintUsed = 0;
  chatCredits = 0;
  completedUnits = new Set();
  soundPreset = getSoundPreset();
  soundVolume = Math.round(getSoundVolume() * 100);
  roomCode = cleanRoomCode(customRoomCodeInput?.value || "") || makeRoomCode();
  setRoomCodeText(roomCode);
  setMessage(`방 코드 ${roomCode} 생성 완료. 퍼즐을 준비하는 중입니다...`);
  await new Promise((resolve) => setTimeout(resolve, 30));

  const existing = await get(ref(db, `rooms/${roomCode}`));
  if (existing.exists()) {
    creatingRoom = false;
    roomCode = "";
    setRoomCodeText("----");
    setMessage("이미 사용 중인 방 코드예요. 다른 이름으로 만들어주세요.", "warn");
    return;
  }

  generateGame(difficulty);
  roundId = crypto.randomUUID();
  playerGrid = cloneGrid(puzzle);
  seconds = 0;
  isFinished = false;
  setupPanel.classList.add("is-hidden");
  renderBoard();
  saveSession();
  setMessage(`방 코드 ${roomCode} 생성 완료. Firebase에 저장하는 중입니다...`);

  await set(ref(db, `rooms/${roomCode}`), {
    status: "playing",
    ownerId: playerId,
    difficulty,
    eraseLimit,
    hintLimit,
    chatMode,
    soundPreset,
    soundVolume,
    roundId,
    puzzle,
    solution,
    createdAt: serverTimestamp(),
    players: {
      [playerId]: {
        name: playerName,
        progress: correctCount(),
        seconds: 0,
        eraseUsed,
        hintUsed,
        chatCredits,
        done: false,
        joinedAt: serverTimestamp(),
      },
    },
    chat: {},
  });

  startTimer(true);
  watchRoom();
  saveSession();
  creatingRoom = false;
  updateEraseButton();
  updateHintButton();
  updateChatInputState();
  setMessage("방을 만들었어요. 방 코드를 상대에게 보내세요.");
}

async function joinRoom() {
  playerName = getName();
  roomCode = joinCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    setMessage("참가할 방 코드를 입력하세요.", "warn");
    return;
  }

  const snapshot = await get(ref(db, `rooms/${roomCode}`));
  if (!snapshot.exists()) {
    setMessage("해당 방을 찾을 수 없어요.", "warn");
    return;
  }

  const nextRoom = snapshot.val();
  if (!isValidRoomData(nextRoom)) {
    setMessage("이 방은 퍼즐 정보가 없어서 참가할 수 없어요. 방 만든 사람이 새 방을 다시 만들어야 합니다.", "warn");
    return;
  }

  solution = nextRoom.solution;
  puzzle = nextRoom.puzzle;
  eraseLimit = Number.isInteger(nextRoom.eraseLimit) ? nextRoom.eraseLimit : 3;
  eraseUsed = 0;
  hintLimit = Number.isInteger(nextRoom.hintLimit) ? nextRoom.hintLimit : 2;
  hintUsed = 0;
  chatMode = nextRoom.chatMode || "free";
  soundPreset = soundPresets[nextRoom.soundPreset] ? nextRoom.soundPreset : "soft";
  soundVolume = Number.isInteger(nextRoom.soundVolume) ? nextRoom.soundVolume : 80;
  if (soundPresetInput) soundPresetInput.value = soundPreset;
  if (soundVolumeInput) soundVolumeInput.value = String(soundVolume);
  chatCredits = 0;
  completedUnits = new Set();
  roundId = nextRoom.roundId || "";
  fixedCells = puzzle.map((row) => row.map((value) => value !== 0));
  playerGrid = cloneGrid(puzzle);
  seconds = 0;
  isFinished = nextRoom.status === "finished";

  await update(ref(db, `rooms/${roomCode}/players/${playerId}`), {
    name: playerName,
    progress: correctCount(),
    seconds: 0,
    eraseUsed,
    hintUsed,
    chatCredits,
    done: false,
    joinedAt: serverTimestamp(),
  });

  setupPanel.classList.add("is-hidden");
  setRoomCodeText(roomCode);
  startTimer(true);
  watchRoom();
  saveSession();
  updateEraseButton();
  updateHintButton();
  updateChatInputState();
  setMessage("방에 참가했어요. 같은 퍼즐로 대전을 시작합니다.");
}

async function restartRoom() {
  if (!roomCode || !room) return;
  if (room.ownerId !== playerId) {
    setMessage("방을 만든 사람만 새 게임을 시작할 수 있어요.", "warn");
    return;
  }

  generateGame(difficulty);
  roundId = crypto.randomUUID();
  playerGrid = cloneGrid(puzzle);
  fixedCells = puzzle.map((row) => row.map((value) => value !== 0));
  selected = puzzle
    .flatMap((row, rowIndex) => row.map((value, colIndex) => ({ value, rowIndex, colIndex })))
    .find((cell) => cell.value === 0) || { rowIndex: 0, colIndex: 0 };
  selected = { row: selected.rowIndex, col: selected.colIndex };
  seconds = 0;
  isFinished = false;
  eraseUsed = 0;
  hintUsed = 0;
  chatCredits = 0;
  completedUnits = new Set();
  const startProgress = puzzle.flat().filter(Boolean).length;

  const players = Object.fromEntries(
    Object.entries(room.players || {}).map(([id, player]) => [
      id,
      {
        ...player,
        progress: startProgress,
        seconds: 0,
        eraseUsed: 0,
        hintUsed: 0,
        chatCredits: 0,
        done: false,
        finishedAt: null,
        updatedAt: serverTimestamp(),
      },
    ]),
  );

  await update(ref(db, `rooms/${roomCode}`), {
    status: "playing",
    winnerId: null,
    finishedAt: null,
    difficulty,
    puzzle,
    solution,
    roundId,
    players,
    restartedAt: serverTimestamp(),
  });

  startTimer(true);
  renderBoard();
  updateEraseButton();
  updateHintButton();
  updateChatInputState();
  saveSession();
  setMessage("같은 방에서 새 게임을 시작했어요.");
}

async function inputNumber(value) {
  if (!roomCode || isFinished) return;
  const { row, col } = selected;
  if (fixedCells[row][col]) {
    setMessage("처음부터 채워진 칸은 바꿀 수 없어요.", "warn");
    return;
  }

  const previousValue = playerGrid[row][col];
  playerGrid[row][col] = value;
  const correct = value === solution[row][col];
  if (chatMode === "earned" && correct && previousValue !== solution[row][col]) {
    chatCredits += 1;
  }
  playTone(correct ? "correct" : "wrong");
  renderBoard();
  if (correct) checkUnitEffects();
  await syncPlayer({ chatCredits });
}

async function useHint() {
  if (!roomCode || isFinished) return;
  if (hintRemaining() <= 0) {
    setMessage("힌트를 모두 사용했어요.", "warn");
    updateHintButton();
    return;
  }

  const empties = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!fixedCells[row][col] && playerGrid[row][col] !== solution[row][col]) {
        empties.push({ row, col });
      }
    }
  }

  if (!empties.length) return;
  const target =
    !fixedCells[selected.row]?.[selected.col] &&
    playerGrid[selected.row]?.[selected.col] !== solution[selected.row]?.[selected.col]
      ? selected
      : empties[0];
  playerGrid[target.row][target.col] = solution[target.row][target.col];
  selected = target;
  hintUsed += 1;
  updateHintButton();
  playTone("correct");
  renderBoard();
  checkUnitEffects();
  await syncPlayer({ hintUsed, chatCredits });
}

async function eraseSelected() {
  if (!roomCode || isFinished) return;
  if (eraseRemaining() <= 0) {
    setMessage("지우기 횟수를 모두 사용했어요.", "warn");
    updateEraseButton();
    return;
  }
  const { row, col } = selected;
  if (fixedCells[row][col]) {
    setMessage("처음부터 채워진 칸은 지울 수 없어요.", "warn");
    return;
  }
  if (!playerGrid[row][col]) {
    setMessage("이미 비어 있는 칸이에요.", "warn");
    return;
  }

  playerGrid[row][col] = 0;
  eraseUsed += 1;
  updateEraseButton();
  renderBoard();
  await syncPlayer({ eraseUsed });
}

async function copyCode() {
  if (!roomCode) return;
  await navigator.clipboard.writeText(roomCode);
  setMessage("방 코드를 복사했어요.");
}

async function sendChat() {
  if (!roomCode) {
    setMessage("방에 들어간 뒤 채팅할 수 있어요.", "warn");
    return;
  }

  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";
  sendChatBtn.disabled = true;
  try {
    if (chatMode === "earned" && chatCredits <= 0) {
      setMessage("정답을 맞히면 1번 말할 수 있어요.", "warn");
      updateChatInputState();
      return;
    }
    if (chatMode === "earned") chatCredits -= 1;
    await set(push(ref(db, `rooms/${roomCode}/chat`)), {
      playerId,
      name: playerName,
      text,
      createdAt: Date.now(),
    });
    if (chatMode === "earned") {
      await update(ref(db, `rooms/${roomCode}/players/${playerId}`), { chatCredits });
      saveSession();
    }
  } finally {
    sendChatBtn.disabled = false;
    updateChatInputState();
  }
}

function updateDifficultyButtons() {
  difficultyButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.battleDifficulty === difficulty);
  });
}

function updateChatModeButtons() {
  chatModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.chatMode === chatMode);
  });
}

function boot() {
  if (!hasFirebaseConfig()) {
    setMessage("대전모드를 쓰려면 battle.js에 Firebase 설정값을 먼저 넣어야 합니다.", "warn");
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
  hintBtn.disabled = true;
  eraseBtn.disabled = true;
  restartRoomBtn.disabled = true;
    chatInput.disabled = true;
    sendChatBtn.disabled = true;
    playersPanel.innerHTML = "<p>GitHub Pages만으로는 실시간 대전이 되지 않아 Firebase 연결이 필요합니다.</p>";
    return;
  }

  db = getDatabase(initializeApp(firebaseConfig));

  if (loadSession()) {
    setupPanel.classList.add("is-hidden");
    setRoomCodeText(roomCode);
    startTimer(false);
    watchRoom();
    setMessage("저장된 대전 방을 불러왔어요.");
  } else {
    setPlayControlsDisabled(true);
  }
  updateEraseButton();
  updateHintButton();
  updateChatInputState();
  updateChatModeButtons();
}

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    difficulty = button.dataset.battleDifficulty;
    updateDifficultyButtons();
  });
});

chatModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    chatMode = button.dataset.chatMode;
    updateChatModeButtons();
    updateChatInputState();
  });
});

soundPresetInput?.addEventListener("change", () => {
  soundPreset = getSoundPreset();
  playTone("correct");
  saveSession();
});

soundVolumeInput?.addEventListener("input", () => {
  soundVolume = Math.round(getSoundVolume() * 100);
  saveSession();
});

numberButtons.forEach((button) => {
  button.addEventListener("click", () => runAction(() => inputNumber(Number(button.dataset.battleNumber))));
});

createRoomBtn.addEventListener("click", () => runAction(createRoom, "방을 만드는 중입니다..."));
joinRoomBtn.addEventListener("click", () => runAction(joinRoom, "방에 참가하는 중입니다..."));
hintBtn.addEventListener("click", () => runAction(useHint));
eraseBtn.addEventListener("click", () => runAction(eraseSelected));
restartRoomBtn.addEventListener("click", () => runAction(restartRoom, "새 게임을 준비하는 중입니다..."));
leaveRoomBtn.addEventListener("click", () => runAction(leaveRoom));
sendChatBtn.addEventListener("click", () => runAction(sendChat));
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    runAction(sendChat);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key >= "1" && event.key <= "9") runAction(() => inputNumber(Number(event.key)));
  if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
    runAction(eraseSelected);
  }
});

updateDifficultyButtons();
boot();
