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
let currentMultiplier = 1.0;
let hp = 3;

// ★修正：レーン制ではなく、自由なパーセンテージ位置(0〜80)で管理
let playerPos = 40; 
let isInvincible = false;
let invincibleTimer = 0;
let obstacles =[];
let spawnTimer = 0;
let spawnInterval = 1.0;

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

  // --- ★修正：ドラッグでの自由移動 ---
  const handleMove = (clientX) => {
    if (!isPlaying) return;
    const rect = dom.playArea.getBoundingClientRect();
    let x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    
    // プレイヤーの幅(20%)の半分を引いて中心を合わせる
    let leftPos = percentage - 10;
    // 画面外に出ないように 0% 〜 80% に制限
    playerPos = Math.max(0, Math.min(80, leftPos));
    
    dom.player.style.left = `${playerPos}%`;
  };

  const onTouchMove = (e) => { e.preventDefault(); handleMove(e.touches[0].clientX); };
  const onMouseMove = (e) => { if (e.buttons > 0) handleMove(e.clientX); };
  const onTouchStart = (e) => { e.preventDefault(); handleMove(e.touches[0].clientX); };
  const onMouseDown = (e) => { handleMove(e.clientX); };

  dom.playArea.addEventListener('touchmove', onTouchMove, { passive: false });
  dom.playArea.addEventListener('mousemove', onMouseMove);
  dom.playArea.addEventListener('touchstart', onTouchStart, { passive: false });
  dom.playArea.addEventListener('mousedown', onMouseDown);
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
  
  isPlaying = true;
  isProcessing = false;
  elapsedTime = 0;
  currentScore = 0;
  currentMultiplier = 1.0;
  hp = 3;
  playerPos = 40;
  isInvincible = false;
  invincibleTimer = 0;
  obstacles =[];
  spawnTimer = 0;
  spawnInterval = 1.2;

  updateHpUI();
  dom.obstaclesContainer.innerHTML = '';
  dom.player.style.left = '40%';
  dom.player.style.transition = 'none'; // 滑らかに動かすためCSSアニメーションは切る
  
  lastFrameTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

function updateHpUI() {
  dom.hp.textContent = "❤️".repeat(hp) + "🖤".repeat(3 - hp);
}

function spawnObstacle() {
  const speedBase = 30 + elapsedTime * 1.5; 
  const types = ['normal'];
  
  if (elapsedTime > 10) types.push('spread');
  if (elapsedTime > 20) types.push('diagonal');
  if (elapsedTime > 30) types.push('stopgo', 'zigzag');

  const type = types[Math.floor(Math.random() * types.length)];
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
  el.appendChild(ball);

  if (type === 'spread') {
    // ★修正：5レーン中、ランダムな2レーンを安置（穴）にする
    const lanes =[0, 1, 2, 3, 4];
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    const emptyLanes = [lanes[0], lanes[1]];
    
    for(let i=0; i<5; i++){
      if(emptyLanes.includes(i)) continue;
      const clone = el.cloneNode(true);
      dom.obstaclesContainer.appendChild(clone);
      obstacles.push({ el: clone, type: 'normal', lane: i, y: -5, speed: speedBase * 0.8 });
    }
    el.remove();
    
    // ★修正：詰み防止。複数落ちの直後はしばらく次が出ないようにディレイをかける
    spawnTimer = -1.0; 
  } else {
    dom.obstaclesContainer.appendChild(el);
    let lane = Math.floor(Math.random() * 5);
    obstacles.push({ el, type, lane, y: -5, speed: speedBase, state: 0, timer: 0, dir: Math.random() < 0.5 ? 1 : -1 });
    
    // フェイント系も少しだけディレイ
    if (type === 'stopgo' || type === 'zigzag') spawnTimer = -0.3;
  }
}

function gameLoop(now) {
  if (!isPlaying) return;
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  elapsedTime += dt;

  let phase = 1, requiredTime = 5;
  let passedTime = 0;
  while (true) {
    if (elapsedTime < passedTime + requiredTime) {
      currentMultiplier = 1.0 + (phase - 1) * 0.5;
      break;
    }
    passedTime += requiredTime;
    phase++;
    requiredTime += 5;
  }

  currentScore += 10 * currentMultiplier * dt;
  dom.score.textContent = Math.floor(currentScore);
  dom.multiplier.textContent = `x${currentMultiplier.toFixed(1)}`;
  dom.timer.textContent = elapsedTime.toFixed(1);

  spawnInterval = Math.max(0.35, 1.2 - (elapsedTime * 0.015));
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

  // プレイヤーの中心X座標 (%)
  const playerCenterX = playerPos + 10;

  for (let i = obstacles.length - 1; i >= 0; i--) {
    let obs = obstacles[i];
    
    if (obs.type === 'normal' || obs.type === 'spread') {
      obs.y += obs.speed * dt;
    } 
    else if (obs.type === 'diagonal') {
      obs.y += obs.speed * dt;
      obs.lane += obs.dir * 2 * dt; 
      if (obs.lane < 0) { obs.lane = 0; obs.dir = 1; }
      if (obs.lane > 4) { obs.lane = 4; obs.dir = -1; }
    }
    else if (obs.type === 'stopgo') {
      if (obs.state === 0 && obs.y > 30) {
        obs.state = 1; obs.timer = 1.0; 
      } else if (obs.state === 1) {
        obs.timer -= dt;
        if (obs.timer <= 0) { obs.state = 2; obs.speed *= 2.5; }
      } else {
        obs.y += obs.speed * dt;
      }
    }
    else if (obs.type === 'zigzag') {
      obs.y += obs.speed * dt;
      obs.timer += dt * 5;
      obs.lane += Math.sin(obs.timer) * 0.1;
      obs.lane = Math.max(0, Math.min(4, obs.lane));
    }

    obs.el.style.top = `${obs.y}%`;
    obs.el.style.left = `${obs.lane * 20}%`;

    // ★修正：当たり判定（中心座標の距離で判定。13%未満ならヒット＝少し優しめ）
    const obsCenterX = obs.lane * 20 + 10;
    if (!isInvincible && obs.y > 80 && obs.y < 90) {
      if (Math.abs(playerCenterX - obsCenterX) < 13) {
        hp--;
        updateHpUI();
        isInvincible = true;
        invincibleTimer = 1.0;
        
        dom.damageFlash.style.opacity = 1;
        setTimeout(() => dom.damageFlash.style.opacity = 0, 100);
        
        if (hp <= 0) {
          finishGame();
          return;
        }
      }
    }

    if (obs.y > 100) {
      obs.el.remove();
      obstacles.splice(i, 1);
    }
  }

  animationId = requestAnimationFrame(gameLoop);
}

async function finishGame() {
  if (isProcessing) return;
  isPlaying = false;
  isProcessing = true;
  if(animationId) cancelAnimationFrame(animationId);
  
  const finalScore = Math.floor(currentScore);
  
  // ★修正：報酬のナーフ
  const earnedVit = Math.floor(finalScore / 28);
  const earnedExp = Math.floor(finalScore / 7);

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