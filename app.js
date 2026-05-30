const boardEl = document.querySelector("#board");
const timerEl = document.querySelector("#timer");
const mistakesEl = document.querySelector("#mistakes");
const messageEl = document.querySelector("#message");
const progressEl = document.querySelector("#progress");
const newGameBtn = document.querySelector("#newGameBtn");
const eraseBtn = document.querySelector("#eraseBtn");
const hintBtn = document.querySelector("#hintBtn");
const difficultyButtons = [...document.querySelectorAll(".difficulty-btn")];
const numberButtons = [...document.querySelectorAll("[data-number]")];

const size = 9;
const boxSize = 3;
const saveKey = "classic-sudoku-game-state-v1";
const difficultySettings = {
  easy: { label: "쉬움", clues: 45, limitSeconds: 10 * 60 },
  medium: { label: "보통", clues: 36, limitSeconds: 30 * 60 },
  hard: { label: "어려움", clues: 30, limitSeconds: null },
};
const unlockRules = {
  medium: { requiredDifficulty: "easy", requiredWins: 5 },
  hard: { requiredDifficulty: "medium", requiredWins: 4 },
};

let solution = [];
let puzzle = [];
let playerGrid = [];
let fixedCells = [];
let selected = { row: 0, col: 0 };
let difficulty = "easy";
let mistakes = 0;
let seconds = 0;
let timerId = null;
let gameComplete = false;
let completedUnits = new Set();
let eraseUsed = 0;
let hintUsed = 0;
let audioContext = null;
let progress = {
  easyTimedWins: 0,
  mediumTimedWins: 0,
};

function playTone(kind) {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = kind === "correct" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(kind === "correct" ? 720 : 150, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "correct" ? 1120 : 90, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === "correct" ? 0.18 : 0.2, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  } catch {
    // Some browsers unlock sound only after a direct tap.
  }
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

function isGrid(value) {
  return (
    Array.isArray(value) &&
    value.length === size &&
    value.every((row) => Array.isArray(row) && row.length === size)
  );
}

function isDifficultyUnlocked(level) {
  if (level === "easy") return true;
  if (level === "medium") return progress.easyTimedWins >= unlockRules.medium.requiredWins;
  if (level === "hard") return progress.mediumTimedWins >= unlockRules.hard.requiredWins;
  return false;
}

function limitText(level) {
  const limit = difficultySettings[level].limitSeconds;
  return limit ? `${Math.floor(limit / 60)}분 안에` : "제한 없음";
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

function generateGame() {
  const fullGrid = makeEmptyGrid();
  fillGrid(fullGrid);
  solution = cloneGrid(fullGrid);
  puzzle = makePuzzle(fullGrid, difficultySettings[difficulty].clues);
  playerGrid = cloneGrid(puzzle);
  fixedCells = puzzle.map((row) => row.map((value) => value !== 0));
}

function saveGame() {
  const state = {
    difficulty,
    solution,
    puzzle,
    playerGrid,
    selected,
    mistakes,
    seconds,
    gameComplete,
    eraseUsed,
    hintUsed,
    progress,
    completedUnits: [...completedUnits],
  };

  localStorage.setItem(saveKey, JSON.stringify(state));
}

function loadSavedGame() {
  const raw = localStorage.getItem(saveKey);
  if (!raw) return false;

  try {
    const state = JSON.parse(raw);
    if (!isGrid(state.solution) || !isGrid(state.puzzle) || !isGrid(state.playerGrid)) {
      return false;
    }

    progress = {
      easyTimedWins: Math.max(0, Number(state.progress?.easyTimedWins) || 0),
      mediumTimedWins: Math.max(0, Number(state.progress?.mediumTimedWins) || 0),
    };
    difficulty = difficultySettings[state.difficulty] ? state.difficulty : "easy";
    if (!isDifficultyUnlocked(difficulty)) difficulty = "easy";
    solution = state.solution;
    puzzle = state.puzzle;
    playerGrid = state.playerGrid;
    fixedCells = puzzle.map((row) => row.map((value) => value !== 0));
    selected =
      state.selected &&
      Number.isInteger(state.selected.row) &&
      Number.isInteger(state.selected.col)
        ? state.selected
        : { row: 0, col: 0 };
    mistakes = Number.isInteger(state.mistakes) ? state.mistakes : 0;
    seconds = Number.isInteger(state.seconds) ? state.seconds : 0;
    gameComplete = Boolean(state.gameComplete);
    eraseUsed = Number.isInteger(state.eraseUsed) ? state.eraseUsed : 0;
    hintUsed = Number.isInteger(state.hintUsed) ? state.hintUsed : 0;
    completedUnits = new Set(Array.isArray(state.completedUnits) ? state.completedUnits : []);
    return true;
  } catch {
    localStorage.removeItem(saveKey);
    return false;
  }
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const secs = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

function startTimer(reset = true) {
  clearInterval(timerId);
  if (reset) seconds = 0;
  timerEl.textContent = formatTime(seconds);
  if (gameComplete) return;

  timerId = setInterval(() => {
    seconds += 1;
    timerEl.textContent = formatTime(seconds);
    saveGame();
  }, 1000);
}

function isRelated(row, col) {
  return (
    row === selected.row ||
    col === selected.col ||
    (Math.floor(row / boxSize) === Math.floor(selected.row / boxSize) &&
      Math.floor(col / boxSize) === Math.floor(selected.col / boxSize))
  );
}

function hasConflict(row, col) {
  const value = playerGrid[row][col];
  if (!value) return false;

  for (let i = 0; i < size; i += 1) {
    if (i !== col && playerGrid[row][i] === value) return true;
    if (i !== row && playerGrid[i][col] === value) return true;
  }

  const startRow = Math.floor(row / boxSize) * boxSize;
  const startCol = Math.floor(col / boxSize) * boxSize;
  for (let r = startRow; r < startRow + boxSize; r += 1) {
    for (let c = startCol; c < startCol + boxSize; c += 1) {
      if ((r !== row || c !== col) && playerGrid[r][c] === value) return true;
    }
  }

  return false;
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
  if (justCompleted.length) playTone("correct");
}

function renderBoard() {
  boardEl.innerHTML = "";
  const selectedValue = playerGrid[selected.row][selected.col];

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
      if (hasConflict(row, col) || (value && value !== solution[row][col])) {
        cell.classList.add("error");
      }

      cell.addEventListener("click", () => {
        selected = { row, col };
        renderBoard();
        saveGame();
      });

      boardEl.appendChild(cell);
    }
  }
}

function setMessage(text, tone = "normal") {
  messageEl.textContent = text;
  messageEl.style.borderLeftColor = tone === "warn" ? "var(--warn)" : "var(--accent)";
}

function updateToolButtons() {
  eraseBtn.textContent = `지우기 ${Math.max(0, 3 - eraseUsed)}/3`;
  hintBtn.textContent = `힌트 ${Math.max(0, 3 - hintUsed)}/3`;
  eraseBtn.disabled = gameComplete || eraseUsed >= 3;
  hintBtn.disabled = gameComplete || hintUsed >= 3;
}

function renderProgress() {
  const mediumReady = isDifficultyUnlocked("medium");
  const hardReady = isDifficultyUnlocked("hard");
  progressEl.innerHTML = `
    <div class="progress-row">
      <span>보통 열기</span>
      <strong>${Math.min(progress.easyTimedWins, 5)} / 5</strong>
    </div>
    <p>쉬움 스도쿠를 10분 안에 5개 완료</p>
    <div class="progress-row">
      <span>어려움 열기</span>
      <strong>${Math.min(progress.mediumTimedWins, 4)} / 4</strong>
    </div>
    <p>보통 스도쿠를 30분 안에 4개 완료</p>
    <div class="unlock-status">${mediumReady ? "보통 도전 가능" : "보통 잠김"} · ${
      hardReady ? "어려움 도전 가능" : "어려움 잠김"
    }</div>
  `;
}

function updateDifficultyButtons() {
  difficultyButtons.forEach((item) => {
    const level = item.dataset.difficulty;
    const unlocked = isDifficultyUnlocked(level);
    item.classList.toggle("active", level === difficulty);
    item.classList.toggle("locked", !unlocked);
    item.disabled = !unlocked;
    item.textContent = unlocked
      ? difficultySettings[level].label
      : `${difficultySettings[level].label} 잠김`;
    item.setAttribute("aria-disabled", String(!unlocked));
  });
  renderProgress();
}

function recordTimedWin() {
  const limit = difficultySettings[difficulty].limitSeconds;
  if (!limit || seconds > limit) return false;

  if (difficulty === "easy" && progress.easyTimedWins < 5) {
    progress.easyTimedWins += 1;
    return true;
  }

  if (difficulty === "medium" && progress.mediumTimedWins < 4) {
    progress.mediumTimedWins += 1;
    return true;
  }

  return false;
}

function completionMessage(wasTimedWin) {
  const clearText = `완성! ${formatTime(seconds)} 만에 해결했어요.`;
  if (difficulty === "easy") {
    if (wasTimedWin && isDifficultyUnlocked("medium")) {
      return `${clearText} 보통 단계가 열렸어요.`;
    }
    if (wasTimedWin) {
      return `${clearText} 보통 열기까지 ${5 - progress.easyTimedWins}개 남았어요.`;
    }
    return `${clearText} 10분을 넘겨서 보통 열기 기록에는 포함되지 않았어요.`;
  }

  if (difficulty === "medium") {
    if (wasTimedWin && isDifficultyUnlocked("hard")) {
      return `${clearText} 어려움 단계가 열렸어요.`;
    }
    if (wasTimedWin) {
      return `${clearText} 어려움 열기까지 ${4 - progress.mediumTimedWins}개 남았어요.`;
    }
    return `${clearText} 30분을 넘겨서 어려움 열기 기록에는 포함되지 않았어요.`;
  }

  return clearText;
}

function checkComplete() {
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (playerGrid[row][col] !== solution[row][col]) return false;
    }
  }

  gameComplete = true;
  clearInterval(timerId);
  const wasTimedWin = recordTimedWin();
  updateDifficultyButtons();
  updateToolButtons();
  setMessage(completionMessage(wasTimedWin));
  saveGame();
  return true;
}

function inputNumber(value) {
  if (gameComplete) return;
  const { row, col } = selected;

  if (fixedCells[row][col]) {
    setMessage("처음부터 채워진 칸은 바꿀 수 없어요.", "warn");
    return;
  }

  playerGrid[row][col] = value;

  if (value !== solution[row][col]) {
    mistakes += 1;
    mistakesEl.textContent = mistakes;
    setMessage("그 숫자는 정답이 아니에요. 다른 가능성을 찾아보세요.", "warn");
    playTone("wrong");
  } else {
    setMessage("좋아요. 계속 이어가세요.");
    playTone("correct");
  }

  renderBoard();
  if (value === solution[row][col]) checkUnitEffects();
  if (!checkComplete()) saveGame();
}

function useHint() {
  if (gameComplete) return;
  if (hintUsed >= 3) {
    setMessage("힌트는 3번까지 사용할 수 있어요.", "warn");
    updateToolButtons();
    return;
  }
  const candidates = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!fixedCells[row][col] && playerGrid[row][col] !== solution[row][col]) {
        candidates.push({ row, col });
      }
    }
  }
  if (!candidates.length) return;

  const target =
    !fixedCells[selected.row]?.[selected.col] &&
    playerGrid[selected.row]?.[selected.col] !== solution[selected.row]?.[selected.col]
      ? selected
      : candidates[0];
  playerGrid[target.row][target.col] = solution[target.row][target.col];
  selected = target;
  hintUsed += 1;
  setMessage("힌트로 한 칸을 채웠어요.");
  playTone("correct");
  renderBoard();
  updateToolButtons();
  checkUnitEffects();
  if (!checkComplete()) saveGame();
}

function eraseSelected() {
  if (gameComplete) return;
  if (eraseUsed >= 3) {
    setMessage("지우기는 3번까지 사용할 수 있어요.", "warn");
    updateToolButtons();
    return;
  }
  const { row, col } = selected;

  if (fixedCells[row][col]) {
    setMessage("처음부터 채워진 칸은 지울 수 없어요.", "warn");
    return;
  }

  playerGrid[row][col] = 0;
  eraseUsed += 1;
  setMessage("선택한 칸을 비웠어요.");
  renderBoard();
  updateToolButtons();
  saveGame();
}

function newGame() {
  gameComplete = false;
  mistakes = 0;
  completedUnits = new Set();
  eraseUsed = 0;
  hintUsed = 0;
  mistakesEl.textContent = mistakes;
  generateGame();

  const firstEmpty = puzzle
    .flatMap((row, rowIndex) => row.map((value, colIndex) => ({ value, rowIndex, colIndex })))
    .find((cell) => cell.value === 0);
  selected = { row: firstEmpty.rowIndex, col: firstEmpty.colIndex };

  setMessage(
    `${difficultySettings[difficulty].label} 난이도 새 게임을 시작했어요. 기록 조건은 ${limitText(
      difficulty,
    )} 완료입니다.`,
  );
  updateDifficultyButtons();
  renderBoard();
  updateToolButtons();
  startTimer();
  saveGame();
}

function moveSelection(rowDelta, colDelta) {
  selected = {
    row: Math.max(0, Math.min(size - 1, selected.row + rowDelta)),
    col: Math.max(0, Math.min(size - 1, selected.col + colDelta)),
  };
  renderBoard();
  saveGame();
}

function startApp() {
  if (loadSavedGame()) {
    mistakesEl.textContent = mistakes;
    timerEl.textContent = formatTime(seconds);
    updateDifficultyButtons();
    updateToolButtons();
    renderBoard();
    startTimer(false);
    setMessage(
      gameComplete ? "완료된 게임을 불러왔어요. 새 게임으로 다음 도전을 시작하세요." : "저장된 게임을 불러왔어요. 이어서 플레이하세요.",
    );
    return;
  }

  newGame();
}

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextDifficulty = button.dataset.difficulty;
    if (!isDifficultyUnlocked(nextDifficulty)) return;
    difficulty = nextDifficulty;
    newGame();
  });
});

numberButtons.forEach((button) => {
  button.addEventListener("click", () => inputNumber(Number(button.dataset.number)));
});

newGameBtn.addEventListener("click", newGame);
eraseBtn.addEventListener("click", eraseSelected);
hintBtn.addEventListener("click", useHint);

document.addEventListener("keydown", (event) => {
  if (event.key >= "1" && event.key <= "9") inputNumber(Number(event.key));
  if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") eraseSelected();
  if (event.key === "ArrowUp") moveSelection(-1, 0);
  if (event.key === "ArrowDown") moveSelection(1, 0);
  if (event.key === "ArrowLeft") moveSelection(0, -1);
  if (event.key === "ArrowRight") moveSelection(0, 1);
});

startApp();
