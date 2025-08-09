/* Chain Reaction — Neon + Bomb + (Auto) Online Multiplayer
   - Works offline out of the box
   - If Firebase + online controls exist in the page, online mode enables itself
   - 2–8 players, undo, animations, neon glow, bomb warning (cap-1)
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

  // ---------- Config / Colors ----------
  const DEFAULTS = ["#ff2d55","#2ea8ff","#2ed573","#ffb020","#b57aff","#ffd54a","#6cb2ff","#ff6b81"];
  let COLORS = [...DEFAULTS];

  // local color persistence
  const KEY_COLORS = "cr_neon_colors";
  const loadColors = () => { try{ const s=JSON.parse(localStorage.getItem(KEY_COLORS)); if(Array.isArray(s)&&s.length===8) COLORS=s; }catch{} };
  const saveColors = () => { try{ localStorage.setItem(KEY_COLORS, JSON.stringify(COLORS)); }catch{} };

  // ---------- State ----------
  let rows = 6, cols = 9;        // default 9x6
  let players = 2;
  let current = 0;               // current player index
  let board = [];                // {owner: -1|playerIndex, count: 0..N}
  let playing = true;
  let moveHistory = [];          // stack for Undo
  let turnCommitted = false;     // snapshot once per turn
  let eliminated = new Set();    // players who are out (after first move)
  let firstMoveDone = new Array(8).fill(false);

  // ---------- Online (autodetect) ----------
  const hasFirebase = typeof window !== "undefined" && !!window.firebase;
  const onlineEls = {
    createRoomBtn: $("#createRoomBtn"),
    joinRoomBtn: $("#joinRoomBtn"),
    roomInput: $("#roomCodeInput"),
    seatSelect: $("#seatSelect"),
    copyLinkBtn: $("#copyLinkBtn"),
    roomStatus: $("#roomStatus"),
  };
  const onlineControlsPresent = !!(onlineEls.createRoomBtn && onlineEls.joinRoomBtn && onlineEls.seatSelect);

  // online mode becomes true only if Firebase + controls exist
  const ONLINE = hasFirebase && onlineControlsPresent;

  // online state
  const clientId = (()=>{ const k="cr_client_id"; let v=localStorage.getItem(k); if(!v){ v=Math.random().toString(36).slice(2,10); localStorage.setItem(k,v);} return v; })();
  let roomId = "";     // e.g. AB12CD
  let mySeat = "";     // "1".."8"
  let applyingRemote = false;

  // ---------- Elements ----------
  const boardEl = $("#board");
  const statusText = $("#statusText");
  const turnBadge = $("#turnBadge");
  const playersSelect = $("#playersSelect");
  const gridSelect = $("#gridSelect");
  const newGameBtn = $("#newGameBtn");
  const undoBtn = $("#undoBtn");
  const swatchesEl = $("#swatches");
  const resetBtn = $("#resetColorsBtn");

  // ---------- Firebase (only if ONLINE) ----------
  let db = null;
  if (ONLINE) {
    // Your config (from your message) — includes databaseURL
    const firebaseConfig = {
      apiKey: "AIzaSyCqmSa4u0Pmv2ubhVrATy_0_oaKfHYd1DM",
      authDomain: "chain-reaction-nikhil.firebaseapp.com",
      databaseURL: "https://chain-reaction-nikhil-default-rtdb.firebaseio.com",
      projectId: "chain-reaction-nikhil",
      storageBucket: "chain-reaction-nikhil.firebasestorage.app",
      messagingSenderId: "962407013979",
      appId: "1:962407013979:web:61aa487b08c4be9434697e",
      measurementId: "G-JBNJGW0K74"
    };
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
  }

  // ---------- Init ----------
  function init() {
    loadColors();
    playersSelect && (playersSelect.value = String(players));
    gridSelect && (gridSelect.value = "9x6");
    setupColorPanel();
    setupBoard(cols, rows);
    bindUI();
    updateStatus();

    // Auto-join via ?room=XXXX
    if (ONLINE) {
      const params = new URLSearchParams(location.search);
      const r = (params.get("room")||"").toUpperCase();
      if (r) { onlineEls.roomInput.value = r; joinRoom(r); }
    }
  }

  function bindUI() {
    newGameBtn && newGameBtn.addEventListener("click", () => {
      const [c, r] = gridSelect.value.split("x").map(n=>parseInt(n,10));
      cols = c; rows = r; players = parseInt(playersSelect.value, 10);
      // local reset
      board = Array.from({length:rows},()=>Array.from({length:cols},()=>({owner:-1,count:0})));
      current = 0; playing = true; moveHistory = []; firstMoveDone = new Array(8).fill(false); eliminated.clear();
      setupBoard(cols, rows, false);
      renderBoard();
      updateStatus("New game ready. Player 1 starts.");
      if (ONLINE && roomId) pushState();
    });

    undoBtn && undoBtn.addEventListener("click", undo);

    playersSelect && playersSelect.addEventListener("change", e => {
      players = parseInt(e.target.value, 10);
      setupColorPanel();
      resetGame(false);
      if (ONLINE && roomId) pushState();
    });

    gridSelect && gridSelect.addEventListener("change", e => {
      const [c, r] = e.target.value.split("x").map(n=>parseInt(n,10));
      cols = c; rows = r;
      resetGame(false);
      if (ONLINE && roomId) pushState();
    });

    resetBtn && resetBtn.addEventListener("click", () => {
      COLORS = [...DEFAULTS]; saveColors();
      setupColorPanel(); renderBoard(); updateStatus("Colors reset.");
      if (ONLINE && roomId) colorsRef(roomId).set(COLORS);
    });

    // Online controls
    if (ONLINE) {
      onlineEls.createRoomBtn.addEventListener("click", createRoom);
      onlineEls.joinRoomBtn.addEventListener("click", () => {
        const code=(onlineEls.roomInput.value||"").trim().toUpperCase();
        if(!code){ pulseStatus("Enter a room code.", true); return; }
        joinRoom(code);
      });
      onlineEls.copyLinkBtn.addEventListener("click", () => {
        if(!roomId){ pulseStatus("Create or join a room first.", true); return; }
        const url = `${location.origin}${location.pathname}?room=${roomId}`;
        navigator.clipboard.writeText(url).then(()=> pulseStatus("Join link copied!")).catch(()=> pulseStatus(url));
      });
      onlineEls.seatSelect.addEventListener("change", e => claimSeat(e.target.value));
    }
  }

  function resetGame(rebuild=true){
    current = 0;
    playing = true;
    moveHistory = [];
    firstMoveDone = new Array(8).fill(false);
    eliminated.clear();
    if (rebuild) setupBoard(cols, rows);
    else setupBoard(cols, rows, false);
    updateStatus("New game ready. Player 1 starts.");
  }

  function setupBoard(c, r, rebuildDOM=true){
    board = Array.from({length:r}, _ => Array.from({length:c}, _ => ({owner:-1, count:0})));
    if (rebuildDOM){
      boardEl.innerHTML = "";
      boardEl.style.gridTemplateColumns = `repeat(${c}, var(--cell-size))`;
      boardEl.style.gridTemplateRows = `repeat(${r}, var(--cell-size))`;

      for (let y=0; y<r; y++){
        for (let x=0; x<c; x++){
          const cell = el("button","cell",{ "data-x":x, "data-y":y, "role":"gridcell" });
          cell.addEventListener("click", () => handleMove(x,y));
          boardEl.appendChild(cell);
        }
      }
    } else {
      // clear DOM
      Array.from(boardEl.children).forEach(cell=>{
        cell.classList.remove("owned");
        cell.style.removeProperty("--neon");
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

  function deepCopyBoard(b){ return b.map(row => row.map(cell => ({owner: cell.owner, count: cell.count}))); }
  const serializeState = () => ({ rows, cols, players, current, board, playing, firstMoveDone, eliminated:[...eliminated] });
  function applyState(s){
    rows=s.rows; cols=s.cols; players=s.players; current=s.current; board=s.board; playing=s.playing;
    firstMoveDone=s.firstMoveDone||new Array(8).fill(false); eliminated=new Set(s.eliminated||[]);
    setupBoard(cols,rows,false); renderBoard(); updateStatus("[Synced]");
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
    if (ONLINE && roomId) pushState();
  }

  function handleMove(x,y){
    if (!playing) return;

    // Online guard: must have seat + be your turn
    if (ONLINE && roomId){
      if(!mySeat){ pulseStatus("Claim a seat (P1–P8) to play.", true); return; }
      const myIdx = parseInt(mySeat,10)-1;
      if(current !== myIdx){ pulseStatus("Not your turn.", true); return; }
    }

    const cell = board[y][x];
    if (cell.owner !== -1 && cell.owner !== current){
      pulseStatus("You can only play on empty cells or your own.", true);
      return;
    }

    if (!turnCommitted){ saveSnapshot(); turnCommitted = true; }

    // Place orb
    cell.owner = current;
    cell.count += 1;
    animatePlace(x,y);

    // Chain reactions
    resolveReactions().then(() => {
      if (!firstMoveDone[current]) firstMoveDone[current] = true;
      checkEliminations();

      const alive = alivePlayers();
      if (alive.length === 1){
        playing = false;
        updateStatus(`Player ${alive[0]+1} wins! 🏆`);
        turnCommitted = false;
        if (ONLINE && roomId) pushState();
        return;
      }

      nextPlayer();
      turnCommitted = false;
      updateStatus();
      if (ONLINE && roomId) pushState();
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
      if (!firstMoveDone[p] || counts[p] > 0) alive.push(p);
    }
    return alive;
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
      renderCellGroup();
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
        animateBlast(x,y);

        for (const [nx,ny] of neighbors(x,y)){
          const ncell = board[ny][nx];
          ncell.owner = current;
          ncell.count += 1;
          toAdd.push([nx,ny]);
        }
      }

      renderCellGroup();

      for (const [nx,ny] of toAdd){
        if (board[ny][nx].count >= capacity(nx,ny)) q.push([nx,ny]);
      }

      await sleep(170);
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

  function bombSVG(color){
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 64 64"); svg.classList.add("bomb");
    svg.style.color = color;
    const g = document.createElementNS(svg.namespaceURI,"g");
    const body = document.createElementNS(svg.namespaceURI,"circle");
    body.setAttribute("cx","34"); body.setAttribute("cy","38"); body.setAttribute("r","18");
    body.setAttribute("fill","currentColor");
    const neck = document.createElementNS(svg.namespaceURI,"rect");
    neck.setAttribute("x","25"); neck.setAttribute("y","16"); neck.setAttribute("width","18"); neck.setAttribute("height","8");
    neck.setAttribute("rx","3"); neck.setAttribute("fill","currentColor");
    const fuse = document.createElementNS(svg.namespaceURI,"path");
    fuse.setAttribute("d","M44 18 C54 8, 62 16, 56 22");
    fuse.setAttribute("stroke","currentColor"); fuse.setAttribute("stroke-width","4"); fuse.setAttribute("fill","none"); fuse.setAttribute("stroke-linecap","round");
    const spark = document.createElementNS(svg.namespaceURI,"circle");
    spark.setAttribute("cx","56"); spark.setAttribute("cy","22"); spark.setAttribute("r","4");
    spark.setAttribute("fill","currentColor"); spark.style.filter="blur(0.5px)";
    g.appendChild(body); g.appendChild(neck); g.appendChild(fuse); g.appendChild(spark);
    svg.appendChild(g); return svg;
  }

  function drawCellContent(cellEl, x, y){
    const data = board[y][x];
    cellEl.innerHTML = "";

    const owner = data.owner;
    const neon = owner!==-1 ? COLORS[owner % COLORS.length] : null;
    if (neon){ cellEl.classList.add("owned"); cellEl.style.setProperty("--neon", neon); }
    else { cellEl.classList.remove("owned"); cellEl.style.removeProperty("--neon"); }

    if (data.count === 0) { cellEl.style.boxShadow="0 6px 18px #0008"; return; }

    const color = COLORS[data.owner % COLORS.length];

    if (data.count === 1){
      const o = el("div","orb");
      o.style.background = color;
      cellEl.appendChild(o);
    } else if (data.count === 2){
      const wrap = el("div","orb count2");
      wrap.style.background = color + "00";
      wrap.appendChild(el("i")); wrap.appendChild(el("i"));
      cellEl.appendChild(wrap);
    } else {
      const wrap = el("div","orb count3");
      wrap.style.background = color + "00";
      wrap.appendChild(el("i")); wrap.appendChild(el("i")); wrap.appendChild(el("i"));
      cellEl.appendChild(wrap);
    }

    // Bomb indicator when one step from capacity
    const cap = capacity(x,y);
    if (data.count === cap - 1){
      cellEl.appendChild(bombSVG(color));
    }
  }

  function animatePlace(x,y){
    renderCell(x,y);
    const idx = y*cols + x;
    const cellEl = boardEl.children[idx];
    const orb = cellEl.querySelector(".orb, .orb.count2, .orb.count3");
    if (!orb) return;
    orb.style.transform = "scale(0.82)";
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
      [{ transform: "scale(1)" }, { transform: "scale(0.93)" }, { transform: "scale(1)" }],
      { duration: 170, easing: "ease-out" }
    );
  }

  function updateStatus(extra){
    const color = COLORS[current % COLORS.length];
    if (turnBadge) turnBadge.style.background = color;
    const alive = alivePlayers().map(p => p+1).join(", ");
    const onlineTag = (ONLINE && roomId) ? `[${roomId}] ` : "";
    const seatTag = (ONLINE && mySeat) ? ` • You: P${mySeat}` : "";
    statusText && (statusText.textContent = onlineTag + (extra || `Player ${current+1}'s turn • Alive: [${alive}]`) + seatTag);
  }

  function pulseStatus(msg, warn=false){
    if (!statusText) return;
    statusText.textContent = msg;
    statusText.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
    if (warn){
      statusText.style.color = "#ffb3b3";
      setTimeout(()=> statusText.style.color = "#cfe0ff", 500);
    }
  }

  // ---------- Color UI ----------
  function setupColorPanel(){
    if (!swatchesEl) return;
    swatchesEl.innerHTML = "";
    for(let i=0;i<players;i++){
      const wrap = el("div","swatch");
      const dot = el("span","dot"); dot.style.color = COLORS[i];
      const label = el("label",""); label.textContent = `P${i+1}`;
      const input = el("input","",{type:"color", value: COLORS[i]});
      input.addEventListener("input", (e)=>{
        COLORS[i] = e.target.value;
        dot.style.color = COLORS[i];
        saveColors();
        renderBoard();
        updateStatus();
        if (ONLINE && roomId) colorsRef(roomId).set(COLORS);
      });
      wrap.appendChild(dot); wrap.appendChild(label); wrap.appendChild(input);
      swatchesEl.appendChild(wrap);
    }
  }

  // ---------- Online helpers (only used if ONLINE) ----------
  const roomRef  = id => db.ref(`rooms/${id}`);
  const stateRef = id => db.ref(`rooms/${id}/state`);
  const seatsRef = id => db.ref(`rooms/${id}/seats`);
  const colorsRef= id => db.ref(`rooms/${id}/colors`);
  const randomRoomCode = () => Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);

  function pushState(){
    if(!(ONLINE && roomId)) return;
    applyingRemote = true;
    stateRef(roomId).set(serializeState()).finally(()=> setTimeout(()=> applyingRemote=false, 60));
  }

  function attachListeners(){
    stateRef(roomId).on("value", snap=>{
      const s=snap.val(); if(!s) return;
      if(applyingRemote) return;
      applyState(s);
    });

    seatsRef(roomId).on("value", snap=>{
      const seats=snap.val()||{};
      const taken=new Set(Object.keys(seats).filter(k=>seats[k]));
      const sel = onlineEls.seatSelect;
      for(const opt of sel.options){
        if(!opt.value) continue;
        opt.disabled = taken.has(opt.value) && seats[opt.value] !== clientId;
      }
    });

    colorsRef(roomId).on("value", snap=>{
      const c=snap.val();
      if(Array.isArray(c)&&c.length===8){ COLORS=c; setupColorPanel(); renderBoard(); updateStatus("[Colors synced]"); }
    });
  }

  function createRoom(){
    const id = randomRoomCode();
    roomId = id; mySeat = ""; onlineEls.seatSelect.value = "";

    const [c,r] = gridSelect.value.split("x").map(n=>parseInt(n,10));
    cols=c; rows=r; players=parseInt(playersSelect.value,10);
    board = Array.from({length:rows},()=>Array.from({length:cols},()=>({owner:-1,count:0})));
    current=0; playing=true; firstMoveDone=new Array(8).fill(false); eliminated.clear();

    roomRef(id).set({ createdAt: Date.now(), state: serializeState(), seats:{}, colors: COLORS })
      .then(()=>{ attachListeners(); onlineEls.roomStatus.textContent=`Room ${id} created. Share the code.`; updateStatus("Room created."); })
      .catch(()=> pulseStatus("Room create failed.", true));
  }

  function joinRoom(id){
    roomId = id.toUpperCase();
    mySeat = ""; onlineEls.seatSelect.value="";
    attachListeners();
    onlineEls.roomStatus.textContent = `Joined ${roomId}. Claim a seat to play.`;
  }

  function claimSeat(n){
    if(!(ONLINE && roomId) || !n) return;
    const ref = seatsRef(roomId).child(n);
    ref.transaction(curr => (!curr || curr===clientId) ? clientId : curr,
      (err, committed, snap)=>{
        if(err){ pulseStatus("Seat claim error.",true); return; }
        const val=snap.val();
        if(val===clientId){ mySeat=n; updateStatus(`You took seat P${n}`); }
        else { pulseStatus("Seat already taken.",true); onlineEls.seatSelect.value=""; }
      });
    ref.onDisconnect().remove();
  }

  // ---------- Start ----------
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
