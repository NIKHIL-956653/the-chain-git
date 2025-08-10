import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue, update } from "firebase/database";

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyCqmSa4u0Pmv2ubhVrATy_0_oaKfHYd1DM",
    authDomain: "chain-reaction-nikhil.firebaseapp.com",
    databaseURL: "https://chain-reaction-nikhil-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "chain-reaction-nikhil",
    storageBucket: "chain-reaction-nikhil.appspot.com",
    messagingSenderId: "962407013979",
    appId: "1:962407013979:web:61aa487b08c4be9434697e",
    measurementId: "G-JBNJGW0K74"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Game variables
let seat = null;
let currentTurn = null;
let roomCode = null;
let playerColors = {};
let boardState = [];

// HTML elements
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const seatSelect = document.getElementById("seat");
const newGameBtn = document.getElementById("newGame");
const boardElement = document.getElementById("board");

// Create room
createRoomBtn.addEventListener("click", () => {
    roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    set(ref(db, `rooms/${roomCode}`), {
        board: [],
        currentTurn: "P1",
        players: {},
    });
    alert(`Room created: ${roomCode}`);
});

// Join room
joinRoomBtn.addEventListener("click", () => {
    seat = seatSelect.value;
    if (!roomCode) {
        roomCode = prompt("Enter room code:");
    }
    update(ref(db, `rooms/${roomCode}/players`), {
        [seat]: { color: seat === "P1" ? "red" : "blue" }
    });
    listenToRoom();
});

// Listen for updates
function listenToRoom() {
    onValue(ref(db, `rooms/${roomCode}`), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            boardState = data.board || [];
            currentTurn = data.currentTurn;
            renderBoard();
        }
    });
}

// Handle cell click
function handleCellClick(row, col) {
    if (seat !== currentTurn) {
        alert("Not your turn!");
        return;
    }
    if (!boardState[row]) boardState[row] = [];
    if (!boardState[row][col]) {
        boardState[row][col] = seat;
    } else if (boardState[row][col] === seat) {
        // Add more orbs logic if needed
    } else {
        alert("Can't place on opponent's cell!");
        return;
    }

    // Save new state and switch turn
    const nextTurn = seat === "P1" ? "P2" : "P1";
    update(ref(db, `rooms/${roomCode}`), {
        board: boardState,
        currentTurn: nextTurn
    });
}

// Render board
function renderBoard() {
    boardElement.innerHTML = "";
    for (let r = 0; r < 6; r++) {
        const rowDiv = document.createElement("div");
        rowDiv.classList.add("row");
        for (let c = 0; c < 9; c++) {
            const cell = document.createElement("div");
            cell.classList.add("cell");
            cell.textContent = boardState[r]?.[c] || "";
            cell.addEventListener("click", () => handleCellClick(r, c));
            rowDiv.appendChild(cell);
        }
        boardElement.appendChild(rowDiv);
    }
}
