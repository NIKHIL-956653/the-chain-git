/* Chain Reaction - Vanilla JS
   Author: you + Ram
   Features:
   - 2–8 players
   - Common grid sizes
   - Undo (one full turn)
   - Smooth chain-reaction animation
   - Mobile-friendly
*/

(() => {
  // ---------- Utilities ----------
  const $ = s => document.querySelector(s);
  const el = (tag, cls, attrs={}) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.entries(attrs).forEach(([k,v]) => n.setAttribute(k,v));
    return n;
  };

  const COLORS = [
    "#ff4757", // P1 red
    "#1e90ff", // P2 blue
    "#2ed573", // P3 green
    "#ffa502", // P4 orange
    "#a55eea", // P5 purple
    "#eccc68", // P6 yellow
    "#70a1ff", // P7 light blue
    "#ff6b81", // P8 pink
  ];

  // ---------- State ----------
  let rows = 6, cols = 9;        // default 9x6 (cols x rows in UI)
  let players = 2;
  let current = 0;               // current player index
  let board = [];                // {owner: -1|playerIndex, count: 0..3}
  let playing = true;
  let moveHistory = [];          // stack of previous states for Undo
  let turnCommitted = false;     // used to save undo snapshots only once per turn
  let eliminated = new Set();    // players with no orbs on board AFTER their first move has happened
  let firstMoveDone = new Array(8).fill(false);

  // ---------- Elements ----------
  const boardEl = $("#board");
  const statusText = $("#statusText");
  const turnBadge = $("#turnBadge");
  const playersSelect = $("#playersSelect");
  const gridSelect = $("#gridSelect");
  const newGameBtn = $("#newGameBtn");
  const undoBtn = $("#undoBtn");

  // ---------- Init ----------
  function init() {
    playersSelect.value = String(players);
    gridSelect.value = "9x6";
    setupBoard(cols, rows);
    bindUI();
    updateStatus();
  }

  function bindUI() {
    newGameBtn.addEventListener("click", () => {
      const [c, r] = gridSelect.value.split("x").map(n=>parseInt(n,10));
      cols = c; rows = r;
      players = parseInt(playersSelect.value, 10);
      resetGame();
    });

    undoBtn.addEventListener("click", undo);

    playersSelect.addEventListener("change", e => {
      players = parseInt(e.target.value, 10);
      resetGame(false); // keep grid, restart game
    });

    gridSelect.addEventListener("change", e => {
      const [c, r] = e.target.value.split("x").map(n=>parseInt(n,10));
      cols = c; rows = r;
      resetGame(false);
    });
  }

  function resetGame(rebuild=true){
    current = 0;
    playing = true;
    moveHistory = [];
    firstMoveDone = new Array(8).fill(false);
    eliminated.clear();
    if (rebuild) setupBoard(cols, rows);
    else setupBoard(cols, rows, false);
    updateStatus();
  }

  function setupBoard(c, r, rebuildDOM=true){
    board = Array.from({length:r}, _ => Array.from({length:c}, _ => ({owner:-1, count:0})));
    if (rebuildDOM){
      boardEl.innerHTML = "";
      boardEl.style.gridTemplateColumns = `repeat(${c}, var(--cell-size))`;
      boardEl.style.gridTemplateRows = `repeat(${r}, var(--cell-size))`;
      boardEl.setAttribute("aria-rowcount", r);
      boardEl.setAttribute("aria-colcount", c);

      for (let y=0; y<r; y++){
        for (let x=0; x<c; x++){
          const cell = el("button","cell",{ "data-x":x, "data-y":y, "role":"gridcell" });
          cell.addEventListener("click", () => handleMove(x,y));
          boardEl.appendChild(cell);
        }
      }
    } else {
      // just clear DOM orbs
      Array.from(boardEl.children).forEach(cell=>{
        cell.classList.remove("owned");
        cell.innerHTML = "";
      });
    }
  }

  // ---------- Game Logic ----------
  function capacity(x,y){
    // corners: 2, edges: 3, middle: 4
    const onTop = y===0, onBottom = y===rows-1, onLeft = x===0, onRight = x===cols-1;
    const edges = [onTop,onBottom,onLeft,onRight].filter(Boolean).length;
    return edges===2 ? 2 : edges===1 ? 3 : 4;
  }

  function neighbors(x,y){
    const n = [];
    if (x>0) n.push([x-1,y]);
    if (x<cols-1) n.push([x+1,y]);
    if (y>0) n.push([x,y-1]);
    if (y<rows-1) n.push([x,y+1]);
    return n;
  }

  function deepCopyBoard(b){
    return b.map(row => row.map(cell => ({owner: cell.owner, count: cell.count})));
  }

  function saveSnapshot(){
    moveHistory.push({
      board: deepCopyBoard(board),
      current,
      playing,
      eliminated: new Set(Array.from(eliminated)),
      firstDone: [...firstMoveDone]
    });
    if (moveHistory.length>30) moveHistory.shift(); // cap
  }

  function undo(){
    if (!moveHistory.length) return;
    const snap = moveHistory.pop();
    board = deepCopyBoard(snap.board);
    current = snap.current;
    playing = snap.playing;
    eliminated = new Set(Array.from(snap.eliminated));
    firstMoveDone = [...snap.firstDone];
    renderBoard();
    updateStatus("Undid last move.");
  }

  function handleMove(x,y){
    if (!playing) return;

    const cell = board[y][x];
    if (cell.owner !== -1 && cell.owner !== current){
      pulseStatus("You can only play on empty cells or your own.", true);
      return;
    }

    // Save snapshot ONCE per turn (before the first placement of that turn)
    if (!turnCommitted){ saveSnapshot(); turnCommitted = true; }

    // Place orb
    cell.owner = current;
    cell.count += 1;
    animatePlace(x,y);

    // Chain reactions
    resolveReactions().then(() => {
      // Mark first move done for this player (used to avoid early elimination before moving)
      if (!firstMoveDone[current]) firstMoveDone[current] = true;

      // After reactions, check eliminations
      checkEliminations();

      // Win check
      const alive = alivePlayers();
      if (alive.length === 1){
        playing = false;
        updateStatus(`Player ${alive[0]+1} wins! 🏆`);
        turnCommitted = false;
        return;
      }

      // Next turn
      nextPlayer();
      turnCommitted = false;
      updateStatus();
    });
  }

  function alivePlayers(){
    const counts = new Array(players).fill(0);
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        const c = board[y][x];
        if (c.owner !== -1) counts[c.owner] += c.count;
      }
    }
    const alive = [];
    for (let p=0; p<players; p++){
      // If player hasn't made a first move yet, keep them alive regardless of count
      if (!firstMoveDone[p] || counts[p] > 0) alive.push(p);
    }
    return alive;
  }

  function checkEliminations(){
    // remove players who have made at least one move and now have zero orbs
    const counts = new Array(players).fill(0);
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        const c = board[y][x];
        if (c.owner !== -1) counts[c.owner] += c.count;
      }
    }
    for (let p=0; p<players; p++){
      if (firstMoveDone[p] && counts[p] === 0) eliminated.add(p);
    }
  }

  function nextPlayer(){
    for (let i=1; i<=players; i++){
      const candidate = (current + i) % players;
      if (!eliminated.has(candidate)) { current = candidate; break; }
    }
  }

  async function resolveReactions(){
    // BFS-style wave processing with animation pauses
    const q = [];
    // seed: any cell that exceeds capacity after a placement
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        if (board[y][x].count >= capacity(x,y)){
          q.push([x,y]);
        }
      }
    }
    if (!q.length){
      renderCellGroup(); // simple rerender
      return;
    }

    const sleep = ms => new Promise(res=>setTimeout(res, ms));
    while (q.length){
      // process all overfull cells together (one "wave")
      const wave = [...new Set(q.map(([x,y]) => `${x},${y}`))].map(s=>s.split(",").map(n=>parseInt(n,10)));
      q.length = 0;

      // explode them
      const toAdd = [];
      for (const [x,y] of wave){
        const cap = capacity(x,y);
        const cell = board[y][x];
        if (cell.count < cap) continue; // might have been reduced by prior blast in same wave
        cell.count -= cap;
        if (cell.count === 0) cell.owner = -1;
        animateBlast(x,y);

        for (const [nx,ny] of neighbors(x,y)){
          const ncell = board[ny][nx];
          ncell.owner = current;
          ncell.count += 1;
          toAdd.push([nx,ny]);
        }
      }

      renderCellGroup();

      // queue any cells that became overfull
      for (const [nx,ny] of toAdd){
        if (board[ny][nx].count >= capacity(nx,ny)) q.push([nx,ny]);
      }

      await sleep(160); // animation cadence between waves
    }
  }

  // ---------- Rendering ----------
  function renderBoard(){
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        renderCell(x,y);
      }
    }
  }

  function renderCellGroup(){
    // faster than re-rendering all children from scratch: loop once
    const cells = boardEl.children;
    let idx = 0;
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        const cellEl = cells[idx++];
        drawCellContent(cellEl, x, y);
      }
    }
  }

  function renderCell(x,y){
    const idx = y*cols + x;
    const cellEl = boardEl.children[idx];
    drawCellContent(cellEl, x, y);
  }

  function drawCellContent(cellEl, x, y){
    const data = board[y][x];
    cellEl.innerHTML = "";
    cellEl.classList.toggle("owned", data.owner !== -1);

    if (data.count === 0) return;

    const color = COLORS[data.owner % COLORS.length];
    // Single orb or grouped layout for 2/3
    if (data.count === 1){
      const o = el("div","orb");
      o.style.background = color;
      cellEl.appendChild(o);
    } else if (data.count === 2){
      const wrap = el("div","orb count2");
      wrap.style.background = color + "00"; // transparent base
      wrap.appendChild(el("i")); wrap.appendChild(el("i"));
      cellEl.appendChild(wrap);
    } else { // 3 or more: still render 3 (visual), logic stays in state
      const wrap = el("div","orb count3");
      wrap.style.background = color + "00";
      wrap.appendChild(el("i")); wrap.appendChild(el("i")); wrap.appendChild(el("i"));
      cellEl.appendChild(wrap);
    }

    // Ring outline by owner
    cellEl.style.boxShadow = `0 0 0 2px ${color}33 inset, 0 6px 18px #0008`;
  }

  function animatePlace(x,y){
    renderCell(x,y);
    const idx = y*cols + x;
    const cellEl = boardEl.children[idx];
    const orb = cellEl.querySelector(".orb, .orb.count2, .orb.count3");
    if (!orb) return;
    orb.style.transform = "scale(0.8)";
    requestAnimationFrame(()=> {
      orb.style.transition = "transform .15s ease";
      orb.style.transform = "scale(1)";
      setTimeout(()=> orb.style.transition = "", 160);
    });
  }

  function animateBlast(x,y){
    const idx = y*cols + x;
    const cellEl = boardEl.children[idx];
    cellEl.animate(
      [{ transform: "scale(1)" }, { transform: "scale(0.94)" }, { transform: "scale(1)" }],
      { duration: 160, easing: "ease-out" }
    );
  }

  function updateStatus(extra){
    const color = COLORS[current % COLORS.length];
    turnBadge.style.background = color;
    const alive = alivePlayers().map(p => p+1).join(", ");
    statusText.textContent = extra || `Player ${current+1}'s turn • Alive: [${alive}]`;
  }

  function pulseStatus(msg, warn=false){
    statusText.textContent = msg;
    statusText.animate(
      [{ opacity: 0.6 }, { opacity: 1 }],
      { duration: 260, easing: "ease-out" }
    );
    if (warn){
      statusText.style.color = "#ffb3b3";
      setTimeout(()=> statusText.style.color = "#cfe0ff", 500);
    }
  }

  // ---------- Start ----------
  init();
})();
