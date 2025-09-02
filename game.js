(() => {
  const $ = s => document.querySelector(s);
  const el = (t, c, attrs = {}) => {
    const n = document.createElement(t);
    if (c) n.className = c;
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  const defaultColors = ["#ff4757", "#1e90ff", "#2ed573", "#ecc668", "#FFA500", "#800080"];
  const AI_DELAY = 900; // small pause so AI turns feel natural

  let rows = 9, cols = 9;
  let players = [];
  let playerTypes = []; // {type:"human" | "ai", difficulty: "easy"|"medium"|"hard"|null}
  let current = 0, board = [], playing = true, firstMove = [], history = [];
  let scores = [];
  let movesMade = 0; // prevents instant wins

  // UI
  const boardEl = $("#board"),
    statusText = $("#statusText"),
    turnBadge = $("#turnBadge"),
    gridSelect = $("#gridSelect"),
    newBtn = $("#newGameBtn"),
    undoBtn = $("#undoBtn"),
    playerCountSelect = $("#playerCountSelect"),
    playerSettingsContainer = $("#playerSettingsContainer"),
    modeSelect = document.getElementById("gameModeSelect"),
    timerDisplay = document.getElementById("timerDisplay"),
    timeLeftSpan = document.getElementById("timeLeft"),
    timerSelect = document.getElementById("timerSelect"),
    timerLabel = document.getElementById("timerLabel"),
    scoreDisplay = document.getElementById("scoreDisplay");

  // Mode & timer
  let mode = "normal";
  let timer = null;
  let timeLimit = 120;
  let timeLeft = timeLimit;

  // ---------- Player settings ----------
  function buildPlayerSettings(count) {
    playerSettingsContainer.innerHTML = "";
    players = [];
    playerTypes = [];
    scores = new Array(count).fill(0);

    for (let i = 0; i < count; i++) {
      const div = el("div", "player-setting");

      const labelName = el("label", "");
      labelName.textContent = `Player ${i + 1} Name: `;
      const nameInput = el("input", "", { type: "text", placeholder: `Player ${i + 1}` });
      labelName.appendChild(nameInput);

      const labelType = el("label", "");
      labelType.textContent = " Type: ";
      const typeSelect = el("select", "");
      typeSelect.innerHTML = `
        <option value="human" selected>Human</option>
        <option value="easy">AI Easy</option>
        <option value="medium">AI Medium</option>
        <option value="hard">AI Hard</option>
      `;
      labelType.appendChild(typeSelect);

      const labelP = el("label", "");
      labelP.textContent = `Player ${i + 1} Color: `;
      const colorInput = el("input", "", { type: "color", value: defaultColors[i] });
      labelP.appendChild(colorInput);

      div.append(labelName, labelType, labelP);
      playerSettingsContainer.appendChild(div);

      players.push({ name: "", color: colorInput.value });
      playerTypes.push({ type: "human", difficulty: null });

      nameInput.addEventListener("input", (e) => {
        players[i].name = e.target.value.trim() || `Player ${i + 1}`;
        updateStatus(); renderScores();
      });
      colorInput.addEventListener("input", (e) => {
        players[i].color = e.target.value;
        paintAll(); renderScores();
      });
      typeSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        playerTypes[i] = (val === "human") ? { type: "human", difficulty: null }
                                          : { type: "ai", difficulty: val };
        if (playing && current === i) processTurn();
      });
    }
    resetGame();
  }

  // ---------- Mode / timer ----------
  modeSelect.addEventListener("change", () => {
    mode = modeSelect.value;
    const on = mode === "timeAttack";
    timerDisplay.style.display = on ? "inline-block" : "none";
    timerSelect.style.display = on ? "inline-block" : "none";
    timerLabel.style.display = on ? "inline-block" : "none";
    if (!on) stopTimer();
    resetGame();
  });
  timerSelect.addEventListener("change", () => { if (mode === "timeAttack") resetGame(); });

  newBtn.addEventListener("click", resetGame);
  undoBtn.addEventListener("click", undoMove);
  playerCountSelect.addEventListener("change", () => buildPlayerSettings(parseInt(playerCountSelect.value, 10)));
  gridSelect.addEventListener("change", resetGame);

  let aiTimeout = null;

  function startTimer() {
    stopTimer();
    timeLeft = timeLimit;
    updateTimerDisplay();
    timer = setInterval(() => {
      timeLeft--; updateTimerDisplay();
      if (timeLeft <= 0) { clearInterval(timer); endGameDueToTime(); }
    }, 1000);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function updateTimerDisplay() { timeLeftSpan.textContent = timeLeft; }
  function endGameDueToTime() { playing = false; updateStatus("Time's up! Game Over."); alert("Time's up! Game Over."); }

  // ---------- Board ----------
  function setupBoard(c, r) {
    board = Array.from({ length: r }, () =>
      Array.from({ length: c }, () => ({ owner: -1, count: 0 }))
    );
    cols = c; rows = r;
    boardEl.style.gridTemplateColumns = `repeat(${c}, var(--cell))`;
    boardEl.innerHTML = "";
    for (let y = 0; y < r; y++) {
      for (let x = 0; x < c; x++) {
        const cell = el("button", "cell", {
          "data-x": x, "data-y": y, "aria-label": `Cell ${x + 1},${y + 1}`,
        });
        cell.addEventListener("click", () => handleMove(x, y));
        boardEl.appendChild(cell);
      }
    }
    paintAll();
  }

  const capacity = (x, y) => {
    const edges = [y==0, y==rows-1, x==0, x==cols-1].filter(Boolean).length;
    return edges === 2 ? 2 : edges === 1 ? 3 : 4;
  };
  const neighbors = (x, y) => {
    const n = [];
    if (x > 0) n.push([x-1, y]);
    if (x < cols-1) n.push([x+1, y]);
    if (y > 0) n.push([x, y-1]);
    if (y < rows-1) n.push([x, y+1]);
    return n;
  };

  function makeBombSVG(color) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.classList.add("bombsvg");
    const body = document.createElementNS(ns, "circle");
    body.setAttribute("cx","32"); body.setAttribute("cy","36"); body.setAttribute("r","16");
    body.setAttribute("fill", color); body.setAttribute("filter", `drop-shadow(0 0 14px ${color})`);
    svg.appendChild(body);
    const shine = document.createElementNS(ns, "circle");
    shine.setAttribute("cx","26"); shine.setAttribute("cy","30"); shine.setAttribute("r","6");
    shine.setAttribute("fill","#fff"); shine.setAttribute("opacity",".22"); svg.appendChild(shine);
    const fuse = document.createElementNS(ns, "rect");
    fuse.setAttribute("x","29"); fuse.setAttribute("y","16"); fuse.setAttribute("width","6"); fuse.setAttribute("height","8"); fuse.setAttribute("rx","2");
    fuse.setAttribute("fill","#c9a777"); svg.appendChild(fuse);
    const spark = document.createElementNS(ns, "circle");
    spark.setAttribute("cx","32"); spark.setAttribute("cy","16"); spark.setAttribute("r","4");
    spark.setAttribute("fill","#ffd54a"); spark.setAttribute("filter","drop-shadow(0 0 8px #ffd54a)");
    svg.appendChild(spark);
    return svg;
  }

  function init() { buildPlayerSettings(parseInt(playerCountSelect.value, 10)); }

  // ---------- Game flow ----------
  function resetGame() {
    const [c, r] = gridSelect.value.split("x").map(Number);
    cols = c; rows = r;
    current = 0; playing = true;
    firstMove = players.map(() => false);
    history = [];
    movesMade = 0;
    setupBoard(cols, rows);
    updateStatus(`Player ${current + 1}'s turn`);
    updateScores();

    if (mode === "timeAttack") { timeLimit = parseInt(timerSelect.value, 10); startTimer(); }
    else { stopTimer(); }

    if (playerTypes[current].type === "ai") processTurn();
  }

  function updateScores() {
    scores = players.map(() => 0);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const o = board[y][x].owner;
        if (o !== -1) scores[o] += board[y][x].count;
      }
    renderScores();
  }
  function renderScores() {
    scoreDisplay.innerHTML = players
      .map((p, i) => `<span style="color:${p.color}; font-weight:700; margin-right:12px;">${p.name || 'Player ' + (i+1)}: ${scores[i]}</span>`)
      .join("");
  }

  function advanceTurn() {
    current = (current + 1) % players.length;
    updateStatus(); paintAll();
    if (playing && playerTypes[current].type === "ai") processTurn();
  }

  function processTurn() {
    if (!playing) return;
    const p = playerTypes[current];
    if (p.type !== "ai") return;
    clearTimeout(aiTimeout);
    aiTimeout = setTimeout(() => makeAIMove(current, p.difficulty), AI_DELAY);
  }

  // ---------- AI (diverse & smarter) ----------
  const jitter = (amt = 0.2) => (Math.random() * amt - amt / 2);

  function makeAIMove(playerIndex, difficulty) {
    if (difficulty === "easy") makeRandomMove(playerIndex);
    else if (difficulty === "medium") makeMediumMove(playerIndex);
    else makeHardMove(playerIndex); // upgraded
  }

  function makeRandomMove(playerIndex) {
    const valid = [];
    for (let y=0; y<rows; y++) for (let x=0; x<cols; x++) {
      const c = board[y][x];
      if (c.owner === -1 || c.owner === playerIndex) valid.push([x,y]);
    }
    if (!valid.length) { advanceTurn(); return; }
    const [x,y] = valid[Math.floor(Math.random()*valid.length)];
    makeMove(x,y);
  }

  function makeMediumMove(playerIndex) {
    const cx = (cols-1)/2, cy = (rows-1)/2;
    const enemyPressure = (x,y) => {
      let s=0; for (const [nx,ny] of neighbors(x,y)) {
        const n=board[ny][nx]; if (n.owner!==-1 && n.owner!==playerIndex) s+=Math.min(n.count,2);
      } return s;
    };

    let cand = [];
    for (let y=0; y<rows; y++) for (let x=0; x<cols; x++) {
      const cell = board[y][x];
      if (cell.owner === -1 || cell.owner === playerIndex) {
        const cap = capacity(x,y);
        const nearBoom = (cell.count + 1 >= cap) ? 1 : 0;
        const centerBonus = 1 / (1 + Math.hypot(x-cx, y-cy));
        const pressure = enemyPressure(x,y) / 4;
        const ownBonus = (cell.owner === playerIndex) ? 0.15 : 0;
        const score = nearBoom*2.5 + centerBonus*1.2 + pressure + ownBonus + jitter(0.25);
        cand.push({x,y,score});
      }
    }
    if (!cand.length) { advanceTurn(); return; }
    cand.sort((a,b)=> b.score - a.score || Math.random() - 0.5);
    const pickFrom = Math.min(5, cand.length);
    const choice = cand[Math.floor(Math.random()*pickFrom)];
    makeMove(choice.x, choice.y);
  }

  // >>> UPGRADED HARD AI: narrow top-K + opponent best-reply lookahead (2-ply)
  function makeHardMove(playerIndex) {
    // 1) score all legal moves by current heuristic
    const candidates = [];
    for (let y=0; y<rows; y++) for (let x=0; x<cols; x++) {
      const cell = board[y][x];
      if (cell.owner === -1 || cell.owner === playerIndex) {
        const base = simulateMoveScore(x, y, playerIndex);
        const near = (cell.count + 1 >= capacity(x,y)) ? 0.8 : 0;  // prefer near-pop
        let danger = 0;
        for (const [nx, ny] of neighbors(x,y)) {
          const n = board[ny][nx];
          if (n.owner !== -1 && n.owner !== playerIndex && n.count + 1 >= capacity(nx,ny)) danger += 0.6;
        }
        candidates.push({ x, y, score: base + near - danger });
      }
    }
    if (!candidates.length) { advanceTurn(); return; }

    candidates.sort((a,b)=> b.score - a.score);
    const top = candidates.slice(0, Math.min(6, candidates.length));

    // helper to simulate a move on a given snapshot (NO board mutation)
    const simulateOn = (snapshot, x, y, who) => {
      const clone = snapshot.map(row => row.map(c => ({...c})));
      if (clone[y][x].owner !== -1 && clone[y][x].owner !== who) return -1;

      clone[y][x].owner = who; clone[y][x].count += 1;

      const q = [];
      for (let yy=0; yy<rows; yy++) for (let xx=0; xx<cols; xx++)
        if (clone[yy][xx].count >= capacity(xx,yy)) q.push([xx,yy]);

      let gain = 0;
      while(q.length){
        const [cx,cy] = q.shift();
        const cap = capacity(cx,cy);
        const cell = clone[cy][cx];
        if (cell.count < cap) continue;
        cell.count -= cap;
        if (cell.count === 0) cell.owner = -1;

        for (const [nx,ny] of neighbors(cx,cy)){
          const n = clone[ny][nx];
          gain += (n.owner === who ? 0.4 : (n.owner === -1 ? 0.4 : 1.2)) * Math.max(n.count,1);
          n.owner = who; n.count += 1;
          if (n.count >= capacity(nx,ny)) q.push([nx,ny]);
        }
      }
      const centerBias = 0.5 / (1 + Math.hypot(x-(cols-1)/2, y-(rows-1)/2));
      return gain + centerBias;
    };

    const opp = (playerIndex + 1) % players.length;
    let best = top[0], bestVal = -Infinity;

    for (const c of top) {
      // snapshot current board
      const snap = board.map(row => row.map(cell => ({...cell})));

      // our move value from the snapshot
      const ours = simulateOn(snap, c.x, c.y, playerIndex);

      // opponent best reply from the post-ours snapshot
      let oppBest = -Infinity;
      for (let y=0; y<rows; y++) for (let x=0; x<cols; x++) {
        const cell = snap[y][x];
        if (cell.owner === -1 || cell.owner === opp) {
          const s = simulateOn(snap, x, y, opp);
          if (s > oppBest) oppBest = s;
        }
      }

      const total = ours - 0.8 * oppBest; // weight opponent’s reply
      if (total > bestVal) { bestVal = total; best = c; }
    }

    makeMove(best.x, best.y);
  }
  // <<< END upgraded Hard AI

  function simulateMoveScore(x, y, playerIndex) {
    const clone = board.map(row => row.map(c => ({...c})));
    if (clone[y][x].owner !== -1 && clone[y][x].owner !== playerIndex) return -1;

    clone[y][x].owner = playerIndex; clone[y][x].count += 1;

    let q=[];
    for (let yy=0; yy<rows; yy++) for (let xx=0; xx<cols; xx++)
      if (clone[yy][xx].count >= capacity(xx,yy)) q.push([xx,yy]);

    let gain=0;
    while(q.length){
      const [cx,cy] = q.shift();
      const cap = capacity(cx,cy);
      const cell = clone[cy][cx];
      if (cell.count < cap) continue;
      cell.count -= cap;
      if (cell.count === 0) cell.owner = -1;

      for (const [nx,ny] of neighbors(cx,cy)){
        const n = clone[ny][nx];
        gain += (n.owner === playerIndex ? 0.4 : (n.owner === -1 ? 0.4 : 1.2)) * Math.max(n.count,1);
        n.owner = playerIndex; n.count += 1;
        if (n.count >= capacity(nx,ny)) q.push([nx,ny]);
      }
    }
    const centerBias = 0.5 / (1 + Math.hypot(x-(cols-1)/2, y-(rows-1)/2));
    return gain + centerBias;
  }

  // ---------- Input / Moves ----------
  function handleMove(x, y) {
    if (!playing) return;
    if (playerTypes[current].type === "ai") return; // block human on AI turn
    const cell = board[y][x];
    if (cell.owner !== -1 && cell.owner !== current) return;
    makeMove(x, y);
  }

  async function makeMove(x, y) {
    history.push(JSON.stringify({ board, current, playing, firstMove: [...firstMove], scores: [...scores], movesMade }));
    const cell = board[y][x];
    cell.owner = current; cell.count += 1;
    movesMade++; // opening grace control
    drawCell(x, y);
    await resolveReactions();
    updateScores();
    firstMove[current] = true;
    checkWin();
    if (playing) advanceTurn();
  }

  async function resolveReactions() {
    const q = [];
    for (let y=0;y<rows;y++) for (let x=0;x<cols;x++)
      if (board[y][x].count >= capacity(x,y)) q.push([x,y]);
    if (!q.length) return;
    const sleep = ms => new Promise(r=>setTimeout(r,ms));
    while(q.length){
      const wave = [...new Set(q.map(([x,y])=>`${x},${y}`))].map(s=>s.split(",").map(Number));
      q.length=0;
      const toInc=[];
      for (const [x,y] of wave){
        const cap = capacity(x,y);
        const cell = board[y][x];
        if (cell.count < cap) continue;
        cell.count -= cap;
        if (cell.count === 0) cell.owner = -1;
        for (const [nx,ny] of neighbors(x,y)){
          const nc = board[ny][nx];
          nc.owner = current; nc.count += 1;
          if (nc.count >= capacity(nx,ny)) toInc.push([nx,ny]);
        }
      }
      paintAll();
      for (const p of toInc) q.push(p);
      await sleep(120);
    }
  }

  function paintAll() {
    document.documentElement.style.setProperty("--glow", players[current].color);
    for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) drawCell(x,y,true);
  }

  function drawCell(x, y, withPulse=false) {
    const idx = y*cols + x;
    const cellEl = boardEl.children[idx];
    const data = board[y][x];
    cellEl.innerHTML = "";
    cellEl.classList.toggle("owned", data.owner !== -1);
    if (withPulse) { cellEl.classList.add("pulse"); cellEl.style.setProperty("--glow", players[current].color); }
    if (data.count === 0) return;
    const color = players[data.owner]?.color || "#ccc";
    if (data.count === 1) {
      const o = el("div", "orb one"); o.style.background = color; o.style.color = color; cellEl.appendChild(o);
    } else if (data.count === 2) {
      const wrap = el("div", "pair-improved");
      const a = el("div", "orb two-orb"), b = el("div", "orb two-orb");
      a.style.background = color; b.style.background = color; wrap.append(a,b); cellEl.appendChild(wrap);
    } else {
      cellEl.appendChild(makeBombSVG(color));
    }
  }

  function updateStatus(extra) {
    const playerName = players[current]?.name || `Player ${current + 1}`;
    statusText.textContent = extra || `${playerName}'s turn`;
    turnBadge.style.background = players[current].color;
  }

  function undoMove() {
    if (!history.length) return;
    const prev = JSON.parse(history.pop());
    board = prev.board; current = prev.current; playing = prev.playing;
    firstMove = prev.firstMove; scores = prev.scores || scores; movesMade = prev.movesMade || movesMade;
    paintAll(); updateStatus(); renderScores();
  }

  function checkWin() {
    // Opening grace period: require at least N full rounds before wins are allowed
    const minRounds = 3;
    const minMovesForWin = players.length * minRounds;
    if (movesMade < minMovesForWin) return false;

    const counts = players.map(() => 0);
    for (let y=0;y<rows;y++) for (let x=0;x<cols;x++){
      const o = board[y][x].owner; if (o !== -1) counts[o] += board[y][x].count;
    }

    if (firstMove.every(Boolean)) {
      const alive = counts.map((c,i)=>({count:c,idx:i})).filter(p=>p.count>0);
      if (alive.length === 1) {
        playing = false;
        const w = alive[0].idx;
        const name = players[w].name?.trim() || `Player ${w+1}`;
        updateStatus(`${name} wins! 🏆`);
        return true;
      }
    }
    return false;
  }

  init();
})();
