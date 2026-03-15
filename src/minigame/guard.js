// src/minigame/guard.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';

let playerRef = null, onUpdateCallback = null;
let dom = {};

// ゲーム状態
let isPlaying = false, isProcessing = false;
let animationId = null;
let lastFrameTime = 0;
let elapsedTime = 0;
let currentScore = 0;
let currentMultiplier = 0;
let hp = 3;

let playerPos = 40; 
let isInvincible = false;
let invincibleTimer = 0;
let obstacles =[];
let spawnTimer = 0;
let spawnInterval = 0.7; 

// 当たり判定用のエリア情報
let playAreaRect = null;
let prevPlayerPos = 40;

export function initGuard(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateCallback = updateUIFn;
  
  dom = {
    overlay: document.getElementById('modal-guard'),
    viewInfo: document.getElementById('gd-view-info'),
    viewPlay: document.getElementById('gd-view-play'),
    viewResult: document.getElementById('gd-view-result'),
    btnStart: document.getElementById('gd-btn-start'),
    btnRetry: document.getElementById('gd-btn-retry'),
    btnReset: document.getElementById('gd-btn-reset'),
    btnQuit: document.getElementById('gd-btn-quit'),
    btnClose: document.getElementById('gd-btn-close'),
    hp: document.getElementById('gd-hp'),
    score: document.getElementById('gd-score'),
    multiplier: document.getElementById('gd-multiplier'),
    timer: document.getElementById('gd-timer'),
    playArea: document.getElementById('gd-play-area'),
    obstaclesContainer: document.getElementById('gd-obstacles'),
    player: document.getElementById('gd-player'),
    damageFlash: document.getElementById('gd-damage-flash'),
    bestText: document.getElementById('gd-best-time')
  };

  dom.btnStart.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnRetry.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnReset.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnQuit.addEventListener('click', () => { isPlaying = false; showView('info'); });
  dom.btnClose.addEventListener('click', () => { dom.overlay.style.display = 'none'; });

  window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    if (e.key.toLowerCase() === 'r' && (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex')) {
      startGame();
    }
  });
 // --- 操作ロジックの修正 ---
  let isDragging = false;

  const handleMove = (clientX) => {
    if (!isPlaying || !playAreaRect) return;
    
    // プレイエリアの座標基準で計算
    const rect = playAreaRect; 
    let x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    
    // プレイヤーの幅20%の中心を考慮 (0%〜80%の範囲に収める)
    let leftPos = percentage - 10;
    
    // ★ 画面外に指があっても、0〜80の範囲にクランプ（固定）する
    playerPos = Math.max(0, Math.min(80, leftPos));
    
    dom.player.style.left = `${playerPos}%`;
  };

  // ★ 画面のどこで指を動かしても反応するように window に登録
  const onMove = (e) => {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    handleMove(clientX);
  };

  const onStart = (e) => {
    if (!isPlaying) return;
    isDragging = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    handleMove(clientX);
  };

  const onEnd = () => {
    isDragging = false;
  };

  // 開始判定はプレイエリアから（他のUI操作を邪魔しないため）
  dom.playArea.addEventListener('touchstart', onStart, { passive: false });
  dom.playArea.addEventListener('mousedown', onStart);

  // 移動と終了判定は window 全体で行う
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchend', onEnd);
  window.addEventListener('mouseup', onEnd);
  
  // エリアサイズのリサイズ追従
  window.addEventListener('resize', () => {
    if (isPlaying) playAreaRect = dom.playArea.getBoundingClientRect();
  });
}

export async function openGuardModal() {
  dom.overlay.style.display = 'flex';
  showView('info');
  const best = await getPersonalBest(playerRef.name, "guard");
  dom.bestText.textContent = best ? Math.floor(best).toString() + " pt" : "記録なし";
}

function showView(view) {
  dom.viewInfo.style.display = view === 'info' ? 'flex' : 'none';
  dom.viewPlay.style.display = view === 'play' ? 'flex' : 'none';
  dom.viewResult.style.display = view === 'result' ? 'flex' : 'none';
}

function startGame() {
  if(animationId) cancelAnimationFrame(animationId);
  showView('play');
  
  // 画面サイズの取得
  playAreaRect = dom.playArea.getBoundingClientRect();
  
  isPlaying = true;
  isProcessing = false;
  elapsedTime = 0;
  currentScore = 0;
  currentMultiplier = 0;
  hp = 3;
  playerPos = 40;
  prevPlayerPos = 40;
  isInvincible = false;
  invincibleTimer = 0;
  obstacles =[];
  spawnTimer = 0;
  spawnInterval = 0.6; // 最初からまあまあ降る

  updateHpUI();
  dom.obstaclesContainer.innerHTML = '';
  dom.player.style.left = '40%';
  dom.player.style.transition = 'none'; 
  
  lastFrameTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

function updateHpUI() {
  dom.hp.textContent = "❤️".repeat(hp) + "🖤".repeat(3 - hp);
}

// ★弾幕パターンの生成
function spawnObstacle() {
  // 速度は緩やかに上昇（速すぎると理不尽になるため密度で勝負）
  const speedBase = 30 + elapsedTime * 0.8; 
  const types = ['normal'];
  
  if (elapsedTime > 5) types.push('diagonal', 'normal'); // 5秒から斜め
  if (elapsedTime > 15) types.push('zigzag', 'diagonal'); // 15秒からジグザグ
  if (elapsedTime > 25) types.push('stopgo'); // 25秒からフェイント

  const createBall = (type, lane) => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.width = '20%';
    el.style.height = '20px';
    el.style.display = 'flex';
    el.style.justifyContent = 'center';
    el.style.alignItems = 'center';
    
    const ball = document.createElement('div');
    ball.style.width = '20px';
    ball.style.height = '20px';
    ball.style.background = 'radial-gradient(circle at 30% 30%, #aaa, #333)';
    ball.style.borderRadius = '50%';
    ball.style.boxShadow = '2px 2px 4px rgba(0,0,0,0.5)';
    el.appendChild(ball);

    dom.obstaclesContainer.appendChild(el);
    obstacles.push({ 
      el, type, lane, y: -5, speed: speedBase, 
      state: 0, timer: 0, dir: Math.random() < 0.5 ? 1 : -1,
      baseLane: lane // ジグザグの基準位置
    });
  };

  const type1 = types[Math.floor(Math.random() * types.length)];
  const lane1 = Math.floor(Math.random() * 5);
  createBall(type1, lane1);

  // ★ STGの密度：15秒以降、30%の確率で別のレーンにもう1個同時に落とす
  if (elapsedTime > 15 && Math.random() < 0.3) {
    const type2 = types[Math.floor(Math.random() * types.length)];
    let lane2 = Math.floor(Math.random() * 5);
    if (lane2 === lane1) lane2 = (lane2 + 1) % 5; // 同じレーンに重ならないように
    createBall(type2, lane2);
  }
}

function gameLoop(now) {
  if (!isPlaying) return;
  let dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  
  // ★ チート対策: タブ切り替え等で時間が飛んだ場合は1フレーム分(16ms)に抑える
  if (dt > 0.1) dt = 0.016; 

  elapsedTime += dt;

  // --- 倍率とスコアの計算 --- (最初の5sは0)
  let phase = 1, requiredTime = 5;
  let passedTime = 0;
  while (true) {
    if( elapsedTime < 5){
      currentMultiplier = 0;
      break;
    }else if (elapsedTime - 5 < passedTime + requiredTime) {
      currentMultiplier = 1.0 + (phase - 1) * 0.25;
      break;
    }
    passedTime += requiredTime;
    phase++;
    requiredTime += 5; 
  }

  currentScore += 10 * currentMultiplier * dt;
  
  dom.score.textContent = Math.floor(currentScore);
  dom.multiplier.textContent = `x${currentMultiplier.toFixed(2)}`;
  dom.timer.textContent = elapsedTime.toFixed(1);

  // --- 障害物スポーン（密度上昇） ---
  // 時間が経つほど間隔が短くなる（0.6秒から0.1秒まで縮まる）
  spawnInterval = Math.max(0.1, 0.6 - (elapsedTime * (0.008 - elapsedTime / 40000)));
  spawnTimer += dt;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnObstacle();
  }

  if (isInvincible) {
    invincibleTimer -= dt;
    dom.player.style.opacity = (Math.floor(invincibleTimer * 10) % 2 === 0) ? 0.5 : 1;
    if (invincibleTimer <= 0) { isInvincible = false; dom.player.style.opacity = 1; }
  }

  // ★ 精密当たり判定のための事前計算
  const rectW = playAreaRect.width;
  const rectH = playAreaRect.height;
  
  // 盾（カプセル型）のパラメータ
  const pCx_current = rectW * (playerPos / 100 + 0.1);
  const pCx_prev = rectW * (prevPlayerPos / 100 + 0.1);
  const minCx = Math.min(pCx_current, pCx_prev);
  const maxCx = Math.max(pCx_current, pCx_prev);
  const pCy = rectH * 0.9 - 10;                // 中心のY座標（bottom:10%, 高さ20px）
  const pHalfW = (rectW * 0.16) / 2;           // 幅の半分
  const pHalfH = 10;                           // 高さの半分
  const pCapW = Math.max(0, pHalfW - 10);      // 両端の半円を除いた直線部分の半幅

  for (let i = obstacles.length - 1; i >= 0; i--) {
    let obs = obstacles[i];
    
    // 動きの制御
    if (obs.type === 'normal') {
      obs.y += obs.speed * dt;
    } 
    else if (obs.type === 'diagonal') {
      obs.y += obs.speed * dt;
      obs.lane += obs.dir * 1 * dt; 
      if (obs.lane <= 0) { obs.lane = 0; obs.dir = 1; }
      if (obs.lane >= 4) { obs.lane = 4; obs.dir = -1; }
    }
    else if (obs.type === 'stopgo') {
      if (obs.state === 0 && obs.y > 25) { // 少し上で止まる
        obs.state = 1; obs.timer = 0.8; 
      } else if (obs.state === 1) {
        obs.timer -= dt;
        if (obs.timer <= 0) { obs.state = 2; obs.speed *= 1.8; } // 1.8倍速で再開
      } else {
        obs.y += obs.speed * dt;
      }
    }
    else if (obs.type === 'zigzag') {
      obs.y += obs.speed * dt;
      obs.timer += dt * 4;
      obs.lane = obs.baseLane + Math.sin(obs.timer) * 0.6; // 基準レーンを中心に揺れる
    }

    obs.el.style.top = `${obs.y}%`;
    obs.el.style.left = `${obs.lane * 20}%`;

    // --- ★ 見た目通りのカプセル型当たり判定 ---
    if (!isInvincible && obs.y > 75 && obs.y < 95) {
      const oCx = rectW * (obs.lane * 0.2 + 0.1);
      const oCy = rectH * (obs.y / 100) + 10;
      const oR = 10; 
      
      // ★ 鉄球のX座標と、「プレイヤーの移動軌跡（線分）」の最短距離 dx を求める
      let dx = 0;
      if (oCx < minCx) dx = minCx - oCx;         // 軌跡より左にある
      else if (oCx > maxCx) dx = oCx - maxCx;    // 軌跡より右にある
      else dx = 0;                               // 軌跡の上に重なっている（ワープ避け検知！）
      
      const dy = Math.abs(pCy - oCy);
      let hit = false;
      const hitboxTolerance = 2; 

      if (dx <= pCapW) {
        if (dy <= pHalfH + oR - hitboxTolerance) hit = true;
      } else {
        const distSq = (dx - pCapW) * (dx - pCapW) + dy * dy;
        const hitRadius = 10 + oR - hitboxTolerance;
        if (distSq <= hitRadius * hitRadius) hit = true;
      }

      if (hit) {
        hp--;
        updateHpUI();
        isInvincible = true;
        invincibleTimer = 1.0;
        
        dom.damageFlash.style.opacity = 1;
        setTimeout(() => dom.damageFlash.style.opacity = 0, 100);
        
        if (hp <= 0) {
          finishGame();
          return; // ★注意：ここで return する前に prevPlayerPos を更新するか、ゲーム終了なのでOK
        }
      }
    }

    if (obs.y > 100) {
      obs.el.remove();
      obstacles.splice(i, 1);
    }
  }

  // ★フレームの最後に位置を記録
  prevPlayerPos = playerPos;

  animationId = requestAnimationFrame(gameLoop);
}

async function finishGame() {
  if (isProcessing) return;
  isPlaying = false;
  isProcessing = true;
  if(animationId) cancelAnimationFrame(animationId);
  
  const finalScore = Math.floor(currentScore);
  
  const earnedVit = Math.floor(finalScore / 25);
  const earnedExp = Math.floor(finalScore / 6);

  const result = applyMinigameResult(playerRef, 'vit', earnedExp, earnedVit);
  
  if (onUpdateCallback) onUpdateCallback();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();

  await savePlayerData(playerRef);

  const isNewRecord = await savePersonalBest(playerRef.name, "guard", finalScore);

  dom.viewResult.querySelector('#gd-res-score').textContent = finalScore;
  dom.viewResult.querySelector('#gd-res-time').textContent = `${elapsedTime.toFixed(2)} s`;
  
  let gainHtml = `
    <div style="font-size:16px; margin-bottom:10px;">Lv.${result.currentLv} <span style="font-size:12px; color:#aaa;">(${result.currentExp}/${result.nextExp})</span></div>
    VIT 基礎値: <span style="color:#6be6ff;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>
    EXP 獲得: <span style="color:#5ce6e6;">+${earnedExp}</span>
  `;
  const prog = Math.floor((result.currentExp / result.nextExp) * 100);
  gainHtml += `<div style="width:100%; background:#111; border:1px solid #4a3b26; height:8px; margin-top:8px; border-radius:4px; overflow:hidden;"><div style="width:${prog}%; background:#6be6ff; height:100%;"></div></div>`;
  if (result.leveledUp) gainHtml += `<div style="color:#ffd166; font-weight:bold; font-size:16px; margin-top:5px;">🎉 LEVEL UP!</div>`;

  document.getElementById('gd-res-gained').innerHTML = gainHtml;
  document.getElementById('gd-res-newrecord').style.display = isNewRecord ? 'block' : 'none';

  setTimeout(() => {
    showView('result');
    isProcessing = false;
  }, 1000);
}