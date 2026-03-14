// src/minigame/guard.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';

let playerRef = null, onUpdateCallback = null, dom = {};

// ゲームステート
let isPlaying = false, isProcessing = false;
let animationId = null, lastFrameTime = 0;
let hp = 3, score = 0, survivalTime = 0;
let currentMultiplier = 1, currentPhase = 1, nextPhaseTime = 5;
let invincibleTimer = 0;

// プレイヤー＆障害物情報
let playerX = 50; // 0〜100%
const PLAYER_RADIUS = 8; // 半径(%)
let obstacles =[];
let spawnTimer = 0, spawnInterval = 1.0;

export function initGuard(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateCallback = updateUIFn;
  
  dom = {
    overlay: document.getElementById('modal-guard'),
    viewInfo: document.getElementById('gu-view-info'),
    viewPlay: document.getElementById('gu-view-play'),
    viewResult: document.getElementById('gu-view-result'),
    playArea: document.getElementById('gu-play-area'),
    playerEl: document.getElementById('gu-player'),
    hpText: document.getElementById('gu-hp-display'),
    scoreText: document.getElementById('gu-score'),
    multText: document.getElementById('gu-multiplier'),
    bestText: document.getElementById('gu-best-time')
  };

  // ボタン設定
  document.getElementById('gu-btn-start').addEventListener('click', () => { if(!isProcessing) startGame(); });
  document.getElementById('gu-btn-retry').addEventListener('click', () => { if(!isProcessing) startGame(); });
  document.getElementById('gu-btn-reset').addEventListener('click', () => { if(!isProcessing){ isPlaying=false; cancelAnimationFrame(animationId); startGame(); }});
  document.getElementById('gu-btn-quit').addEventListener('click', () => { isPlaying=false; cancelAnimationFrame(animationId); showView('info'); });
  document.getElementById('gu-btn-close').addEventListener('click', () => { if(!isProcessing) dom.overlay.style.display = 'none'; });

  // Rキーリトライ
  window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    if (e.key.toLowerCase() === 'r' && (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex')) {
      isPlaying = false; cancelAnimationFrame(animationId); startGame();
    }
  });

  // 操作（ドラッグ/スワイプ）
  const movePlayer = (clientX) => {
    if (!isPlaying) return;
    const rect = dom.playArea.getBoundingClientRect();
    let x = ((clientX - rect.left) / rect.width) * 100;
    if (x < 0) x = 0; if (x > 100) x = 100;
    playerX = x;
    dom.playerEl.style.left = `${playerX}%`;
  };

  const onTouchMove = (e) => { e.preventDefault(); movePlayer(e.touches[0].clientX); };
  const onMouseMove = (e) => { if(e.buttons > 0) movePlayer(e.clientX); }; // クリック中のみ移動可能にするなら e.buttons > 0
  
  dom.playArea.addEventListener('touchmove', onTouchMove, { passive: false });
  dom.playArea.addEventListener('mousemove', (e) => movePlayer(e.clientX)); // PCはマウスを乗せるだけで追従
}

export async function openGuardModal() {
  dom.overlay.style.display = 'flex';
  showView('info');
  const best = await getPersonalBest(playerRef.name, "guard");
  dom.bestText.textContent = best ? `${Math.floor(best)} pt` : "記録なし";
}

function showView(view) {
  dom.viewInfo.style.display = view === 'info' ? 'flex' : 'none';
  dom.viewPlay.style.display = view === 'play' ? 'flex' : 'none';
  dom.viewResult.style.display = view === 'result' ? 'flex' : 'none';
}

function startGame() {
  showView('play');
  isPlaying = true; isProcessing = false;
  hp = 3; score = 0; survivalTime = 0;
  currentMultiplier = 1; currentPhase = 1; nextPhaseTime = 5;
  invincibleTimer = 0;
  obstacles =[];
  playerX = 50;
  spawnTimer = 0; spawnInterval = 1.0;
  
  dom.playerEl.style.left = '50%';
  dom.playerEl.style.opacity = '1';
  updateHUD();
  
  // 既存の鉄球DOMを消す
  dom.playArea.querySelectorAll('.gu-obs').forEach(e => e.remove());
  
  lastFrameTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

function updateHUD() {
  dom.hpText.textContent = "❤️".repeat(hp) + "🖤".repeat(3 - hp);
  dom.scoreText.textContent = Math.floor(score);
  dom.multText.textContent = currentMultiplier;
}

function spawnObstacle() {
  const types = ['straight'];
  if (survivalTime > 10) types.push('zigzag', 'bounce');
  if (survivalTime > 20) types.push('stop_go', 'wide');

  const type = types[Math.floor(Math.random() * types.length)];
  const lanes =[10, 30, 50, 70, 90]; // 5レーンの中心座標(%)
  const laneX = lanes[Math.floor(Math.random() * lanes.length)];
  
  let obs = {
    id: Date.now() + Math.random(),
    x: laneX, y: -10,
    radius: type === 'wide' ? 20 : 8, // wideは超巨大
    type: type,
    speed: 40 + survivalTime * 1.5, // 時間経過で基本速度UP
    state: 0, // stop_go等の状態管理用
    timer: 0,
    el: document.createElement('div')
  };

  // DOM生成
  obs.el.className = 'gu-obs';
  obs.el.style.position = 'absolute';
  obs.el.style.width = `${obs.radius * 2}%`;
  obs.el.style.paddingTop = `${obs.radius * 2}%`; // 正方形を維持
  obs.el.style.borderRadius = '50%';
  obs.el.style.background = type === 'wide' ? 'radial-gradient(circle, #ff0000, #550000)' : 'radial-gradient(circle, #888, #222)';
  obs.el.style.transform = 'translate(-50%, -50%)';
  obs.el.style.boxShadow = '0 5px 10px rgba(0,0,0,0.8)';
  dom.playArea.appendChild(obs.el);
  
  obstacles.push(obs);
}

function gameLoop(now) {
  if (!isPlaying) return;
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  // --- スコアとフェーズ計算 ---
  survivalTime += dt;
  if (survivalTime >= nextPhaseTime) {
    currentPhase++;
    currentMultiplier = currentPhase;
    nextPhaseTime += currentPhase * 5; // 5, 15, 30, 50, 75...
  }
  score += (currentMultiplier * 100) * dt;
  
  // --- 障害物スポーン ---
  spawnInterval = Math.max(0.2, 1.0 - survivalTime * 0.015); // 徐々に激しく
  spawnTimer += dt;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnObstacle();
    // 確率で同時湧き
    if (survivalTime > 15 && Math.random() < 0.3) spawnObstacle();
  }

  // --- プレイヤー無敵処理 ---
  if (invincibleTimer > 0) {
    invincibleTimer -= dt;
    dom.playerEl.style.opacity = Math.floor(now / 100) % 2 === 0 ? '0.2' : '0.8'; // 点滅
  } else {
    dom.playerEl.style.opacity = '1';
  }

  // --- 障害物の移動と当たり判定 ---
  for (let i = obstacles.length - 1; i >= 0; i--) {
    let o = obstacles[i];
    o.timer += dt;

    // パターンごとの動き
    if (o.type === 'straight' || o.type === 'wide') {
      o.y += o.speed * dt;
    } 
    else if (o.type === 'zigzag') {
      o.y += o.speed * dt;
      o.x += Math.sin(o.timer * 5) * 15 * dt; // サイン波で揺れる
    }
    else if (o.type === 'bounce') {
      o.y += o.speed * dt;
      o.x += (o.state === 0 ? 30 : -30) * dt; // state=0なら右、1なら左
      if (o.x > 95) { o.state = 1; o.x = 95; }
      if (o.x < 5) { o.state = 0; o.x = 5; }
    }
    else if (o.type === 'stop_go') {
      if (o.y < 30) o.y += o.speed * dt; // 30%まで降りる
      else if (o.timer < 2.0) { /* 止まる */ }
      else o.y += o.speed * 3 * dt; // 急加速！
    }

    o.el.style.left = `${o.x}%`;
    o.el.style.top = `${o.y}%`;

    // 当たり判定 (円の距離) プレイヤーYは90%近辺
    const playerY = 90;
    // 画面の縦横比による歪みを雑に補正するため、Xの差分を少し重く見る
    const dx = o.x - playerX;
    const dy = o.y - playerY;
    const distSq = dx*dx + dy*dy;
    const hitDistSq = Math.pow(o.radius + PLAYER_RADIUS, 2);

    if (distSq < hitDistSq && invincibleTimer <= 0) {
      hp--;
      invincibleTimer = 1.0;
      dom.playArea.style.background = 'rgba(255,0,0,0.5)'; // ダメージエフェクト
      setTimeout(() => dom.playArea.style.background = 'rgba(0,0,0,0.6)', 100);
      updateHUD();
      if (hp <= 0) {
        finishGame();
        return;
      }
    }

    // 画面外に出たら消す
    if (o.y > 110) {
      o.el.remove();
      obstacles.splice(i, 1);
    }
  }

  updateHUD();
  animationId = requestAnimationFrame(gameLoop);
}

async function finishGame() {
  if (isProcessing) return;
  isPlaying = false;
  isProcessing = true;
  if(animationId) cancelAnimationFrame(animationId);
  
  const finalScore = Math.floor(score);
  
  // ★ 報酬計算式
  const gainedVitBase = Math.floor(finalScore / 160) + 2;
  const gainedExp = Math.floor(finalScore / 35) + 10;

  const result = applyMinigameResult(playerRef, 'vit', gainedExp, gainedVitBase);
  
  if (onUpdateCallback) onUpdateCallback();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();

  await savePlayerData(playerRef);
  const isNewRecord = await savePersonalBest(playerRef.name, "guard", finalScore);

  // リザルト表示
  document.getElementById('gu-res-score').textContent = finalScore;
  document.getElementById('gu-res-time').textContent = survivalTime.toFixed(2);
  
  let gainHtml = `
    <div style="font-size:16px; margin-bottom:10px;">Lv.${result.currentLv} <span style="font-size:12px; color:#aaa;">(${result.currentExp}/${result.nextExp})</span></div>
    VIT 基礎値: <span style="color:#6be6ff;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>
    EXP 獲得: <span style="color:#5ce6e6;">+${gainedExp}</span>
  `;
  
  const prog = Math.floor((result.currentExp / result.nextExp) * 100);
  gainHtml += `<div style="width:100%; background:#111; border:1px solid #4a3b26; height:8px; margin-top:8px; border-radius:4px; overflow:hidden;"><div style="width:${prog}%; background:#6be6ff; height:100%;"></div></div>`;
  if (result.leveledUp) gainHtml += `<div style="color:#ffd166; font-weight:bold; font-size:16px; margin-top:5px;">🎉 LEVEL UP!</div>`;

  document.getElementById('gu-res-gained').innerHTML = gainHtml;
  document.getElementById('gu-res-newrecord').style.display = isNewRecord ? 'block' : 'none';

  setTimeout(() => {
    showView('result');
    isProcessing = false;
  }, 500);
}