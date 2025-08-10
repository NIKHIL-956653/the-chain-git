import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyCqmSa4u0Pmv2ubhVrATy_0_oaKfHYd1DM",
  authDomain: "chain-reaction-nikhil.firebaseapp.com",
  projectId: "chain-reaction-nikhil",
  storageBucket: "chain-reaction-nikhil.appspot.com",
  messagingSenderId: "962407013979",
  appId: "1:962407013979:web:61aa487b08c4be9434697e",
  measurementId: "G-JBNJGW0K74",
  databaseURL: "https://chain-reaction-nikhil-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Game State ---
let rows = 6, cols = 9;
let players = 2;
let current = 0;
let board = [];
let mySeat = null;
let roomId = "testroom"; // fixed room for now

// --- DOM Elements ---
const boardEl = document.getElementById("board");
const statusText = document.getElementById("statusText");
const turnBadge = document.getElementById("turnBadge");
const newGameBtn = document.getElementById("newGameBtn");

function setupBoard() {
  board = Array.from({length: rows}, () => Array.from({length: cols}, () => ({owner:-1, count:0})));
  boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  boardEl.innerHTML = "";
  for (let y=0; y<rows; y++){
    for (let x=0; x<cols; x++){
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.addEventListener("click", () => handleMove(x,y));
      boardEl.appendChild(cell);
    }
  }
}

function renderBoard() {
  const cells = boardEl.children;
  let idx=0;
  for (let y=0; y<rows; y++){
    for (let x=0; x<cols; x++){
      const cell = cells[idx++];
      const data = board[y][x];
      cell.innerHTML = "";
      cell.classList.toggle("owned", data.owner !== -1);
      if (data.count > 0) {
        const orb = document.createElement("div");
        orb.className = "orb";
        orb.style.background = COLORS[data.owner];
        cell.appendChild(orb);
      }
    }
  }
}

function updateStatus() {
  const color = COLORS[current];
  document.documentElement.style.setProperty("--board-glow-color", color);
  turnBadge.style.background = color;
  statusText.textContent = `Player ${current+1}'s turn`;
}

function handleMove(x,y){
  if (mySeat !== current) return; // not your turn
  const cell = board[y][x];
  if (cell.owner !== -1 && cell.owner !== current) return;
  cell.owner = current;
  cell.count += 1;
  current = (current + 1) % players;
  pushGameState();
}

function pushGameState(){
  update(ref(db, `rooms/${roomId}`), {
    board,
    current
  });
}

function joinRoom(){
  const roomRef = ref(db, `rooms/${roomId}`);
  get(roomRef).then(snapshot => {
    if (!snapshot.exists()){
      set(roomRef, {
        board,
        current: 0,
        seats: [null, null]
      });
    } else {
      let data = snapshot.val();
      if (data.seats[0] === null) { mySeat = 0; data.seats[0] = true; }
      else if (data.seats[1] === null) { mySeat = 1; data.seats[1] = true; }
      update(roomRef, { seats: data.seats });
    }
  });

  onValue(roomRef, snap => {
    const data = snap.val();
    if (!data) return;
    board = data.board;
    current = data.current;
    renderBoard();
    updateStatus();
  });
}

// --- Constants ---
const COLORS = ["#ff4757", "#1e90ff"];

// --- Init ---
setupBoard();
joinRoom();
newGameBtn.addEventListener("click", () => {
  setupBoard();
  current = 0;
  pushGameState();
});
