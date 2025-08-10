(() => {
  // ---------- helpers ----------
  const $ = s => document.querySelector(s);
  const el = (t,c,attrs={}) => { const n=document.createElement(t); if(c) n.className=c; for(const[k,v] of Object.entries(attrs)) n.setAttribute(k,v); return n; };

  const COLORS = ["#ff4757", "#1e90ff"]; // P1 red, P2 blue

  // ---------- state ----------
  let rows=6, cols=9;
  let current=0;                 // 0 -> P1, 1 -> P2
  let board=[];                  // {owner:-1|0|1, count:int}
  let playing=true;
  let firstMove=[false,false];   // guard: don't win before both moved

  // ---------- DOM ----------
  const boardEl=$("#board"), statusText=$("#statusText"), turnBadge=$("#turnBadge"),
        gridSelect=$("#gridSelect"), newBtn=$("#newGameBtn");

  // ---------- init ----------
  function init(){
    gridSelect.value="9x6";
    bindUI();
    setupBoard(cols,rows);
    updateStatus("Player 1 starts.");
  }

  function bindUI(){
    newBtn.addEventListener("click", ()=>{
      const [c,r]=gridSelect.value.split("x").map(n=>parseInt(n,10));
      cols=c; rows=r;
      setupBoard(cols,rows);
      current=0; playing=true; firstMove=[false,false];
      updateStatus("New game.");
    });
  }

  // ---------- board ----------
  function setupBoard(c,r){
    board = Array.from({length:r},()=>Array.from({length:c},()=>({owner:-1,count:0})));
    boardEl.style.gridTemplateColumns=`repeat(${c}, var(--cell))`;
    boardEl.innerHTML="";
    for(let y=0;y<r;y++){
      for(let x=0;x<c;x++){
        const cell=el("button","cell",{ "data-x":x, "data-y":y, "aria-label":`Cell ${x+1},${y+1}` });
        cell.addEventListener("click", ()=>handleMove(x,y));
        boardEl.appendChild(cell);
      }
    }
    paintAll();
  }

  function capacity(x,y){
    const onTop=y===0,onBottom=y===rows-1,onLeft=x===0,onRight=x===cols-1;
    const edges=[onTop,onBottom,onLeft,onRight].filter(Boolean).length;
    return edges===2?2:edges===1?3:4;
  }

  function neighbors(x,y){
    const n=[]; if(x>0)n.push([x-1,y]); if(x<cols-1)n.push([x+1,y]); if(y>0)n.push([x,y-1]); if(y<rows-1)n.push([x,y+1]); return n;
  }

  // ---------- SVG bomb ----------
  function makeBombSVG(color){
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.classList.add("bombsvg");
    svg.style.color = color;

    // body + neck
    const body = document.createElementNS(ns, "circle");
    body.setAttribute("cx","34"); body.setAttribute("cy","38"); body.setAttribute("r","18"); body.setAttribute("class","body");
    const neck = document.createElementNS(ns, "rect");
    neck.setAttribute("x","25"); neck.setAttribute("y","16"); neck.setAttribute("width","18"); neck.setAttribute("height","8");
    neck.setAttribute("rx","3"); neck.setAttribute("class","neck");

    // subtle highlight
    const shine = document.createElementNS(ns, "circle");
    shine.setAttribute("cx","26"); shine.setAttribute("cy","32"); shine.setAttribute("r","8"); shine.setAttribute("class","shine");

    // fuse shadow (behind) + rope
    const fuseShadow = document.createElementNS(ns, "path");
    fuseShadow.setAttribute("d","M44 18 C54 8, 63 14, 58 22");
    fuseShadow.setAttribute("class","fuseShadow");
    const fuse = document.createElementNS(ns, "path");
    fuse.setAttribute("d","M44 18 C54 8, 62 15, 57 22");
    fuse.setAttribute("class","fuse");

    // spark group (yellow core + player-colored petals)
    const g = document.createElementNS(ns, "g");
    g.setAttribute("class","spark");
    const base = document.createElementNS(ns, "circle");
    base.setAttribute("cx","57"); base.setAttribute("cy","22"); base.setAttribute("r","5"); base.setAttribute("class","sparkBase");
    g.appendChild(base);
    for (let i=0;i<8;i++){
      const p = document.createElementNS(ns, "rect");
      p.setAttribute("x","56.5"); p.setAttribute("y","10");
      p.setAttribute("width","3"); p.setAttribute("height","8");
      p.setAttribute("rx","1.5");
      p.setAttribute("class","sparkTint");
      p.setAttribute("transform",`rotate(${i*45} 57 22) translate(0,-7)`);
      g.appendChild(p);
    }

    svg.append(body, neck, shine, fuseShadow, fuse, g);
    return svg;
  }

  // ---------- moves ----------
  function handleMove(x,y){
    if(!playing) return;
    const cell=board[y][x];
    if(cell.owner!==-1 && cell.owner!==current) return;   // only empty or own

    // place
    cell.owner=current; cell.count+=1;
    drawCell(x,y);

    resolveReactions().then(()=>{
      firstMove[current]=true;

      // win check AFTER both have played at least once
      const counts = [0,0];
      for(let yy=0; yy<rows; yy++) for(let xx=0; xx<cols; xx++){
        const c=board[yy][xx]; if(c.owner!==-1) counts[c.owner]+=c.count;
      }
      const bothStarted = firstMove[0] && firstMove[1];
      if(bothStarted){
        const alive = [0,1].filter(p => counts[p]>0);
        if(alive.length===1){
          playing=false;
          updateStatus(`Player ${alive[0]+1} wins! 🏆`);
          return;
        }
      }

      // next turn
      current = (current+1)%2;
      updateStatus();
      paintAll();
    });
  }

  async function resolveReactions(){
    // queue any overfull cells
    const q=[];
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) if(board[y][x].count>=capacity(x,y)) q.push([x,y]);
    if(!q.length) return;

    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    while(q.length){
      // unique wave
      const wave=[...new Set(q.map(([x,y])=>`${x},${y}`))].map(s=>s.split(",").map(n=>parseInt(n,10)));
      q.length=0;

      const toInc=[];
      for(const [x,y] of wave){
        const cap=capacity(x,y); const cell=board[y][x];
        if(cell.count<cap) continue;
        cell.count-=cap; if(cell.count===0) cell.owner=-1;
        // send to neighbors as current player's orbs
        for(const [nx,ny] of neighbors(x,y)){
          const nc=board[ny][nx]; nc.owner=current; nc.count+=1;
          if(nc.count>=capacity(nx,ny)) toInc.push([nx,ny]);
        }
      }
      paintAll();
      for(const p of toInc) q.push(p);
      await sleep(150);
    }
  }

  // ---------- rendering ----------
  function paintAll(){
    // board glow & per-cell pulse color
    const glow=COLORS[current];
    document.documentElement.style.setProperty("--glow", glow);
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) drawCell(x,y,true);
  }

  function drawCell(x,y,withPulse=false){
    const idx=y*cols+x; const cellEl=boardEl.children[idx]; const data=board[y][x];
    cellEl.innerHTML=""; cellEl.classList.toggle("owned", data.owner!==-1);

    // pulse all cells in the current player's glow
    if(withPulse){ cellEl.classList.add("pulse"); cellEl.style.setProperty("--glow", COLORS[current]); }

    if(data.count===0) return;

    const color = COLORS[data.owner];
    if(data.count===1){
      const o=el("div","orb one"); o.style.color=color; o.style.background=color; cellEl.appendChild(o);
    }else if(data.count===2){
      const wrap=el("div","pair"); wrap.style.color=color;
      wrap.appendChild(el("i","a")); wrap.appendChild(el("i","b"));
      cellEl.appendChild(wrap);
    }else{ // 3 or more -> SVG bomb with fuse + spark
      cellEl.appendChild(makeBombSVG(color));
    }
  }

  // ---------- UI text ----------
  function updateStatus(extra){
    const color=COLORS[current];
    turnBadge.style.background=color;
    statusText.textContent = extra || `Player ${current+1}'s turn`;
  }

  // go
  init();
})();
