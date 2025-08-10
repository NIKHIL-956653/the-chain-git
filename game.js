import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "YOUR-API-KEY",
  authDomain: "YOUR-PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR-PROJECT.firebaseio.com",
  projectId: "YOUR-PROJECT",
  storageBucket: "YOUR-PROJECT.appspot.com",
  messagingSenderId: "XXXX",
  appId: "XXXX"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const $ = s => document.querySelector(s);
const boardEl = $("#board");
const statusText = $("#statusText");
const turnBadge = $("#turnBadge");
const newGameBtn = $("#newGameBtn");

const COLORS = ["#ff4757", "#1e90ff"];
let rows = 6, cols = 9;
let board = [];
let current = 0;
let playing = true;

function setupBoard() {
  board = Array.from({length: rows}, () => Array.from({length: cols}, () => ({ owner: -1, count: 0 })));
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  boardEl.style.gridTemplateRows = `repeat(${rows}, var(--cell-size))`;

  for (let y=0; y<rows; y++) {
    for (let x=0; x<cols; x++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.addEventListener("click", () => handleMove(x, y));
      boardEl.appendChild(cell);
    }
  }
  updateNeonGlow();
}

function handleMove(x, y) {
  if (!playing) return;
  const cell = board[y][x];
  if (cell.owner !== -1 && cell.owner !== current) return;

  cell.owner = current;
  cell.count++;
  updateFirebase();
  nextTurn();
}

function nextTurn() {
  current = (current + 1) % 2;
  updateStatus();
  updateNeonGlow();
}

function updateStatus() {
  turnBadge.style.background = COLORS[current];
  statusText.textContent = `Player ${current + 1}'s turn`;
}

function updateNeonGlow() {
  document.querySelectorAll(".cell").forEach(c => {
    c.classList.remove("pulse");
    c.style.setProperty("--glow-color", COLORS[current]);
    setTimeout(() => c.classList.add("pulse"), 0);
  });
}

function updateFirebase() {
  set(ref(db, "game"), { board, current, playing });
}

onValue(ref(db, "game"), snap => {
  const data = snap.val();
  if (!data) return;
  board = data.board;
  current = data.current;
  playing = data.playing;
  renderBoard();
  updateStatus();
  updateNeonGlow();
});

function renderBoard() {
  const cells = boardEl.children;
  let idx = 0;
  for (let y=0; y<rows; y++) {
    for (let x=0; x<cols; x++) {
      const cellEl = cells[idx++];
      const data = board[y][x];
      cellEl.innerHTML = "";
      if (data.count > 0) {
        const orb = document.createElement("div");
        orb.className = "orb";
        orb.style.background = COLORS[data.owner];
        cellEl.appendChild(orb);
      }
    }
  }
}

newGameBtn.addEventListener("click", () => {
  setupBoard();
  current = 0;
  playing = true;
  updateFirebase();
});

setupBoard();
updateStatus();
