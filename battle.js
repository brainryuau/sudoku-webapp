import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  get,
  push,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDThHT_h6rZpfsa6p6yPDbjBzhAivm5GB8",
  authDomain: "sudoku-2db43.firebaseapp.com",
  databaseURL: "https://sudoku-2db43-default-rtdb.firebaseio.com",
  projectId: "sudoku-2db43",
  storageBucket: "sudoku-2db43.firebasestorage.app",
  messagingSenderId: "872508216238",
  appId: "1:872508216238:web:d91ef230674f0041662e3f",
  measurementId: "G-235782ENKG",
};

const boardEl = document.querySelector("#battleBoard");
const roomCodeEl = document.querySelector("#roomCode");
const timerEl = document.querySelector("#battleTimer");
const messageEl = document.querySelector("#battleMessage");
const playersPanel = document.querySelector("#playersPanel");
const chatMessagesEl = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const sendChatBtn = document.querySelector("#sendChatBtn");
const setupPanel = document.querySelector("#setupPanel");
const playerNameInput = document.querySelector("#playerName");
const joinCodeInput = document.querySelector("#joinCode");
const createRoomBtn = document.querySelector("#createRoomBtn");
const joinRoomBtn = document.querySelector("#joinRoomBtn");
const copyCodeBtn = document.querySelector("#copyCodeBtn");
const eraseBtn = document.querySelector("#battleEraseBtn");
const difficultyButtons = [...document.querySelectorAll("[data-battle-difficulty]")];
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

localStorage.setItem(playerKey, playerId);

function hasFirebaseConfig() {
  return !Object.values(firebaseConfig).some((value) => value.includes("YOUR_"));
}

function setMessage(text, tone = "normal") {
  messageEl.textContent = text;
  messageEl.style.borderLeftColor = tone === "warn" ? "var(--warn)" : "var(--accent)";
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
    await action();
  } catch (error) {
    console.error(error);
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

function getName() {
  return playerNameInput.value.trim() || "플레이어";
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
    }),
  );
}

function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(sessionKey) || "null");
    if (!saved?.roomCode || !saved?.playerId) return false;
    roomCode = saved.roomCode;
    playerId = saved.playerId;
    playerName = saved.playerName || "플레이어";
    playerGrid = saved.playerGrid || [];
    selected = saved.selected || { row: 0, col: 0 };
    seconds = Number(saved.seconds) || 0;
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
  timerId = setInterval(async () => {
    if (!roomCode || isFinished) return;
    seconds += 1;
    timerEl.textContent = formatTime(seconds);
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
  if (!puzzle.length) return;

  const selectedValue = playerGrid[selected.row]?.[selected.col];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const cell = document.createElement("button");
      const value = playerGrid[row][col];

      cell.className = "cell";
      cell.type = "button";
      cell.textContent = value || "";
      cell.setAttribute("aria-label", `${row + 1}행 ${col + 1}열`);

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
        <p>${formatTime(player.seconds || 0)}${winner}</p>
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
    return;
  }

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
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function handleRoomUpdate(snapshot) {
  room = snapshot.val();
  if (!room) {
    setMessage("방을 찾을 수 없습니다.", "warn");
    return;
  }

  roomCodeEl.textContent = roomCode;
  solution = room.solution;
  puzzle = room.puzzle;
  fixedCells = puzzle.map((row) => row.map((value) => value !== 0));
  if (!playerGrid.length || playerGrid.length !== size) playerGrid = cloneGrid(puzzle);
  renderBoard();
  renderPlayers();
  renderChat();

  if (room.status === "finished") {
    isFinished = true;
    clearInterval(timerId);
    setMessage(room.winnerId === playerId ? "승리했어요!" : "상대가 먼저 완성했어요.");
  } else {
    isFinished = false;
  }
}

function watchRoom() {
  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = onValue(ref(db, `rooms/${roomCode}`), handleRoomUpdate);
}

async function createRoom() {
  playerName = getName();
  generateGame(difficulty);
  playerGrid = cloneGrid(puzzle);
  seconds = 0;
  isFinished = false;
  roomCode = makeRoomCode();

  await set(ref(db, `rooms/${roomCode}`), {
    status: "playing",
    difficulty,
    puzzle,
    solution,
    createdAt: serverTimestamp(),
    players: {
      [playerId]: {
        name: playerName,
        progress: correctCount(),
        seconds: 0,
        done: false,
        joinedAt: serverTimestamp(),
      },
    },
    chat: {},
  });

  setupPanel.classList.add("is-hidden");
  roomCodeEl.textContent = roomCode;
  startTimer(true);
  watchRoom();
  saveSession();
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
  solution = nextRoom.solution;
  puzzle = nextRoom.puzzle;
  fixedCells = puzzle.map((row) => row.map((value) => value !== 0));
  playerGrid = cloneGrid(puzzle);
  seconds = 0;
  isFinished = nextRoom.status === "finished";

  await update(ref(db, `rooms/${roomCode}/players/${playerId}`), {
    name: playerName,
    progress: correctCount(),
    seconds: 0,
    done: false,
    joinedAt: serverTimestamp(),
  });

  setupPanel.classList.add("is-hidden");
  roomCodeEl.textContent = roomCode;
  startTimer(true);
  watchRoom();
  saveSession();
  setMessage("방에 참가했어요. 같은 퍼즐로 대전을 시작합니다.");
}

async function inputNumber(value) {
  if (!roomCode || isFinished) return;
  const { row, col } = selected;
  if (fixedCells[row][col]) {
    setMessage("처음부터 채워진 칸은 바꿀 수 없어요.", "warn");
    return;
  }

  playerGrid[row][col] = value;
  renderBoard();
  await syncPlayer();
}

async function eraseSelected() {
  if (!roomCode || isFinished) return;
  const { row, col } = selected;
  if (fixedCells[row][col]) {
    setMessage("처음부터 채워진 칸은 지울 수 없어요.", "warn");
    return;
  }

  playerGrid[row][col] = 0;
  renderBoard();
  await syncPlayer();
}

async function copyCode() {
  if (!roomCode) return;
  await navigator.clipboard.writeText(roomCode);
  setMessage("방 코드를 복사했어요.");
}

async function sendChat(event) {
  event.preventDefault();
  if (!roomCode) {
    setMessage("방에 들어간 뒤 채팅할 수 있어요.", "warn");
    return;
  }

  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";
  await set(push(ref(db, `rooms/${roomCode}/chat`)), {
    playerId,
    name: playerName,
    text,
    createdAt: Date.now(),
  });
}

function updateDifficultyButtons() {
  difficultyButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.battleDifficulty === difficulty);
  });
}

function boot() {
  if (!hasFirebaseConfig()) {
    setMessage("대전모드를 쓰려면 battle.js에 Firebase 설정값을 먼저 넣어야 합니다.", "warn");
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
    copyCodeBtn.disabled = true;
    eraseBtn.disabled = true;
    chatInput.disabled = true;
    sendChatBtn.disabled = true;
    playersPanel.innerHTML = "<p>GitHub Pages만으로는 실시간 대전이 되지 않아 Firebase 연결이 필요합니다.</p>";
    return;
  }

  db = getDatabase(initializeApp(firebaseConfig));

  if (loadSession()) {
    setupPanel.classList.add("is-hidden");
    roomCodeEl.textContent = roomCode;
    startTimer(false);
    watchRoom();
    setMessage("저장된 대전 방을 불러왔어요.");
  }
}

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    difficulty = button.dataset.battleDifficulty;
    updateDifficultyButtons();
  });
});

numberButtons.forEach((button) => {
  button.addEventListener("click", () => runAction(() => inputNumber(Number(button.dataset.battleNumber))));
});

createRoomBtn.addEventListener("click", () => runAction(createRoom, "방을 만드는 중입니다..."));
joinRoomBtn.addEventListener("click", () => runAction(joinRoom, "방에 참가하는 중입니다..."));
copyCodeBtn.addEventListener("click", () => runAction(copyCode));
eraseBtn.addEventListener("click", () => runAction(eraseSelected));
chatForm.addEventListener("submit", (event) => runAction(() => sendChat(event)));

document.addEventListener("keydown", (event) => {
  if (event.key >= "1" && event.key <= "9") runAction(() => inputNumber(Number(event.key)));
  if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
    runAction(eraseSelected);
  }
});

updateDifficultyButtons();
boot();
