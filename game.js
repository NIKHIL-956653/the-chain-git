(() => {
  const $ = s => document.querySelector(s);
  const el = (tag, cls, attrs={}) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.entries(attrs).forEach(([k,v]) => n.setAttribute(k,v));
    return n;
  };

  const COLORS = [
    "#ff4757", // Player 1 red
    "#1e90ff"  // Player 2 blue
  ];

  let rows = 6, cols = 9;
  let players = 2;
  let current = 0;
  let board = [];
  let playing = true;
  let eliminated = new Set();
  let firstMoveDone = new Array(2).fill(false);

  const boardEl = $("#board");
  const statusText = $("#statusText");
  const turnBadge = $("#turnBadge");
  const newGameBtn = $("#newGameBtn");

  function init() {
    setupBoard(cols, rows);
    bindUI();
    updateStatus();
  }

  function bindUI() {
    newGameBtn.addEventListener("click", () => {
      resetGame();
    });
  }

  function resetGame() {
    current = 0;
    playing = true;
    eliminated.clear();
    firstMoveDone = new Array(players).fill(false);
    setupBoard(cols, rows);
    updateStatus();
  }

  function setupBoard(c, r) {
    board = Array.from({length:r}, _ => Array.from({length:c}, _ => ({owner:-1, count:0})));
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = `repeat(${c}, var(--cell-size))`;
    boardEl.style.gridTemplateRows = `repeat(${r}, var(--cell-size))`;

    for (let y=0; y<r; y++){
      for (let x=0; x<c; x++){
        const cell = el("button","cell",{ "data-x":x, "data-y":y });
        cell.addEventListener("click", () => handleMove(x,y));
        boardEl.appendChild(cell);
      }
    }
    applyNeonGlow();
  }

  function capacity(x,y){
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

  function handleMove(x,y){
    if (!playing) return;
    const cell = board[y][x];
    if (cell.owner !== -1 && cell.owner !== current) return;

    cell.owner = current;
    cell.count += 1;
    renderBoard();

    resolveReactions().then(() => {
      if (!firstMoveDone[current]) firstMoveDone[current] = true;
      checkEliminations();
      const alive = alivePlayers();
      if (alive.length === 1){
        playing = false;
        updateStatus(`Player ${alive[0]+1} wins! 🏆`);
        return;
      }
      nextPlayer();
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
    return counts.map((c,i) => (!firstMoveDone[i] || c>0) ? i : null).filter(v => v !== null);
  }

  function checkEliminations(){
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
    const q = [];
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        if (board[y][x].count >= capacity(x,y)){
          q.push([x,y]);
        }
      }
    }
    if (!q.length){
      renderBoard();
      return;
    }

    const sleep = ms => new Promise(res=>setTimeout(res, ms));
    while (q.length){
      const wave = [...new Set(q.map(([x,y]) => `${x},${y}`))].map(s=>s.split(",").map(n=>parseInt(n,10)));
      q.length = 0;
      const toAdd = [];
      for (const [x,y] of wave){
        const cap = capacity(x,y);
        const cell = board[y][x];
        if (cell.count < cap) continue;
        cell.count -= cap;
        if (cell.count === 0) cell.owner = -1;
        for (const [nx,ny] of neighbors(x,y)){
          const ncell = board[ny][nx];
          ncell.owner = current;
          ncell.count += 1;
          toAdd.push([nx,ny]);
        }
      }
      renderBoard();
      for (const [nx,ny] of toAdd){
        if (board[ny][nx].count >= capacity(nx,ny)) q.push([nx,ny]);
      }
      await sleep(160);
    }
  }

  function renderBoard(){
    const cells = boardEl.children;
    let idx = 0;
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        const cellEl = cells[idx++];
        const data = board[y][x];
        cellEl.innerHTML = "";
        cellEl.classList.toggle("owned", data.owner !== -1);
        if (data.count > 0){
          const color = COLORS[data.owner];
          const orb = el("div","orb");
          orb.style.background = color;
          cellEl.appendChild(orb);
        }
      }
    }
  }

  function updateStatus(extra){
    const color = COLORS[current];
    turnBadge.style.background = color;
    statusText.textContent = extra || `Player ${current+1}'s turn`;
    applyNeonGlow();
  }

  function applyNeonGlow(){
    const cells = boardEl.children;
    const neonColor = COLORS[current];
    for (let cell of cells){
      cell.classList.add("neon-pulse");
      cell.style.setProperty("--neon-color", neonColor);
    }
  }

  init();
})();
