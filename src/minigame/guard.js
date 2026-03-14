// src/minigame/guard.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';

let playerRef = null, onUpdateCallback = null;
let dom = {};
let animationId = null, isPlaying = false, isProcessing = false;

// ゲーム状態
let hp = 3;
let score = 0;
let startTime = 0;
let lastFrameTime = 0;
let invincibleUntil = 0;
let currentMultiplier = 1;

// プレイヤー情報
let playerX = 50; // 0〜100 (%)
const playerWidth = 36, playerHeight = 12;

// 敵情報
let enemies =[];
let spawnTimer = 0;
let spawnInterval = 1000; // 初期1秒
let baseFallSpeed = 150;  // 初期落下速度 (px/s)

// スコア倍率の境界（等差数列）
// 0-5s(長5), 5-15s(長10), 15-30s(長15), 30-50s(長20), 50-75s(長25)
function getMultiplier(elapsedSec) {
  let n = 1;
  while (true) {
    let boundary = 5 * n * (n + 1) / 2;
    if (elapsedSec < boundary) return n;
    n++;
  }
}

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
    btnClose: document.getElementById('gd-btn-close'),
    btnQuit: document.getElementById('gd-btn-quit'),
    btnReset: document.getElementById('gd-btn-reset'),
    
    hpText: document.getElementById('gd-hp-text'),
    timerText: document.getElementById('gd-timer'),
    multiText: document.getElementById('gd-multiplier'),
    scoreText: document.getElementById('gd-score'),
    bestText: document.getElementById('gd-best-time'),
    
    playArea: document.getElementById('gd-play-area'),
    player: document.getElementById('gd-player')
  };

  dom.btnStart.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnRetry.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnClose.addEventListener('click', () => { if(!isProcessing) dom.overlay.style.display = 'none'; });
  
  dom.btnQuit.addEventListener('click', () => {
    isPlaying = false;
    if(animationId) cancelAnimationFrame(animationId);
    showView('info');
  });
  dom.btnReset.addEventListener('click', () => {
    if(!isProcessing) {
      isPlaying = false;
      if(animationId) cancelAnimationFrame(animationId);
      startGame();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    if (e.key.toLowerCase() === 'r' && (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex')) {
      isPlaying = false;
      if(animationId) cancelAnimationFrame(animationId);
      startGame();
    }
  });

  // --- ドラッグ（スワイプ）操作の実装 ---
  const updatePlayerPos = (clientX) => {
    if (!isPlaying) return;
    const rect = dom.playArea.getBoundingClientRect();
    let x = clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width));
    playerX = (x / rect.width) * 100;
    dom.player.style.left = `${playerX}%`;
  };

  const onPointerMove = (e) => {
    if (e.touches) {
      e.preventDefault(); // スクロール防止
      updatePlayerPos(e.touches[0].clientX);
    } else {
      // マウス操作時は左クリックを押している時だけか、ホバーだけで動かすか。
      // PCならホバーだけで付いてくるほうが遊びやすい
      updatePlayerPos(e.clientX);
    }
  };

  dom.playArea.addEventListener('touchmove', onPointerMove, { passive: false });
  dom.playArea.addEventListener('mousemove', onPointerMove);
}

export async function openGuardModal() {
  dom.overlay.style.display = 'flex';
  showView('info');
  const best = await getPersonalBest(playerRef.name, "guard");
  dom.bestText.textContent = best ? `${Math.floor(best).toLocaleString()}` : "記録なし";
}

function showView(view) {
  dom.viewInfo.style.display = view === 'info' ? 'flex' : 'none';
  dom.viewPlay.style.display = view === 'play' ? 'flex' : 'none';
  dom.viewResult.style.display = view === 'result' ? 'flex' : 'none';
}

function startGame() {
  showView('play');
  hp = 3;
  score = 0;
  playerX = 50;
  dom.player.style.left = '50%';
  dom.player.style.opacity = '1';
  dom.hpText.textContent = "♥♥♥";
  
  // 敵のクリーンアップ
  enemies.forEach(e => e.el.remove());
  enemies =[];
  
  spawnTimer = 0;
  spawnInterval = 1000;
  baseFallSpeed = 150;
  invincibleUntil = 0;

  startTime = Date.now();
  lastFrameTime = performance.now();
  isPlaying = true;
  isProcessing = false;
  
  animationId = requestAnimationFrame(gameLoop);
}

function spawnEnemy(elapsedSec) {
  // レーン (0〜4)
  const lane = Math.floor(Math.random() * 5);
  const x = 10 + lane * 20; // 10%, 30%, 50%, 70%, 90%
  
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.width = '16px';
  el.style.height = '16px';
  el.style.background = 'radial-gradient(circle at 30% 30%, #ff8888, #aa0000)';
  el.style.borderRadius = '50%';
  el.style.transform = 'translate(-50%, -50%)';
  el.style.boxShadow = '0 0 8px #ff0000';
  dom.playArea.appendChild(el);

  // 時間経過でパターン解放
  const availableTypes = ['normal'];
  if (elapsedSec > 10) availableTypes.push('diagonal');
  if (elapsedSec > 20) availableTypes.push('bend');
  if (elapsedSec > 30) availableTypes.push('zigzag', 'reflect');
  if (elapsedSec > 40) availableTypes.push('stopgo');

  const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
  
  // 速度もブレさせる
  const speed = baseFallSpeed * (0.8 + Math.random() * 0.4);

  let vx = 0;
  if (type === 'diagonal' || type === 'reflect') {
    vx = (Math.random() > 0.5 ? 1 : -1) * speed * 0.5;
  }

  enemies.push({
    el, type, x, y: -10, vx, vy: speed,
    state: 0, initialX: x, baseSpeed: speed
  });
}

function gameLoop(now) {
  if (!isPlaying) return;
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  const elapsedSec = (Date.now() - startTime) / 1000;

  // --- スコアと難易度の更新 ---
  currentMultiplier = getMultiplier(elapsedSec);
  // 60fps換算で毎フレーム加算したいので dt * 60 をかける
  score += currentMultiplier * (dt * 60);
  
  dom.timerText.textContent = elapsedSec.toFixed(2);
  dom.multiText.textContent = currentMultiplier;
  dom.scoreText.textContent = Math.floor(score).toLocaleString();

  // 難易度上昇
  spawnInterval = Math.max(200, 1000 - elapsedSec * 10);
  baseFallSpeed = 150 + elapsedSec * 5;

  // スポーン
  spawnTimer += dt * 1000;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnEnemy(elapsedSec);
    // たまに同時に2個出す(15秒以降)
    if (elapsedSec > 15 && Math.random() < 0.3) spawnEnemy(elapsedSec);
  }

  // --- 敵の移動と衝突判定 ---
  const areaRect = dom.playArea.getBoundingClientRect();
  const pxPx = (playerX / 100) * areaRect.width;
  const pyPx = areaRect.height - 10 - playerHeight/2; // プレイヤーのY中心
  const hitRadius = 12; // 判定の甘さ

  for (let i = enemies.length - 1; i >= 0; i--) {
    let e = enemies[i];

    // パターンごとの挙動
    if (e.type === 'normal') {
      e.y += e.vy * dt;
    } else if (e.type === 'diagonal') {
      e.x += (e.vx / areaRect.width) * 100 * dt; // xは%
      e.y += e.vy * dt;
    } else if (e.type === 'bend') {
      if (e.y > areaRect.height * 0.3 && e.state === 0) {
        e.state = 1;
        e.vx = (e.x > 50 ? -1 : 1) * e.baseSpeed * 0.8;
      }
      e.x += (e.vx / areaRect.width) * 100 * dt;
      e.y += e.vy * dt;
    } else if (e.type === 'zigzag') {
      e.state += dt * 5; // 周波数
      e.x = e.initialX + Math.sin(e.state) * 15;
      e.y += e.vy * dt;
    } else if (e.type === 'reflect') {
      e.x += (e.vx / areaRect.width) * 100 * dt;
      e.y += e.vy * dt;
      if (e.x <= 0 || e.x >= 100) { e.vx *= -1; e.x = Math.max(0, Math.min(100, e.x)); }
    } else if (e.type === 'stopgo') {
      if (e.y > areaRect.height * 0.4 && e.state === 0) {
        e.state = 1; // 停止
        e.stopTimer = 0;
      }
      if (e.state === 1) {
        e.stopTimer += dt;
        // 震える演出
        e.x = e.initialX + (Math.random()-0.5)*2;
        if (e.stopTimer > 1.0) {
          e.state = 2; // 急加速
          e.vy = e.baseSpeed * 2.5;
        }
      } else {
        e.y += e.vy * dt;
      }
    }

    e.el.style.left = `${e.x}%`;
    e.el.style.top = `${e.y}px`;

    // 画面外削除
    if (e.y > areaRect.height + 20) {
      e.el.remove();
      enemies.splice(i, 1);
      continue;
    }

    // 衝突判定
    if (now > invincibleUntil) {
      const exPx = (e.x / 100) * areaRect.width;
      const dx = pxPx - exPx;
      const dy = pyPx - e.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist < hitRadius) {
        // 被弾！
        hp--;
        dom.hpText.textContent = "♥".repeat(hp) + "♡".repeat(3 - hp);
        invincibleUntil = now + 1000; // 1秒無敵
        
        // 画面フラッシュ
        dom.playArea.style.background = "rgba(255,0,0,0.5)";
        setTimeout(()=> dom.playArea.style.background = "rgba(0,0,0,0.6)", 100);

        if (hp <= 0) {
          finishGame(elapsedSec);
          return;
        }
      }
    }
  }

  // 無敵中の点滅
  if (now < invincibleUntil) {
    dom.player.style.opacity = Math.floor(now / 100) % 2 === 0 ? '0.2' : '1';
  } else {
    dom.player.style.opacity = '1';
  }

  animationId = requestAnimationFrame(gameLoop);
}

async function finishGame(elapsedSec) {
  if(isProcessing) return;
  isPlaying = false;
  isProcessing = true;
  if(animationId) cancelAnimationFrame(animationId);
  
  // スコアから基礎値とEXPを計算
  const finalScore = Math.floor(score);
  const vitBase = Math.floor(finalScore / 1000) + 2;
  const expGain = Math.floor(finalScore / 150) + 10;

  const result = applyMinigameResult(playerRef, 'vit', expGain, vitBase);
  
  if (onUpdateCallback) onUpdateCallback();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();
  await savePlayerData(playerRef);

  const isNewRecord = await savePersonalBest(playerRef.name, "guard", finalScore);

  // リザルト構築
  document.getElementById('gd-res-score').textContent = finalScore.toLocaleString();
  document.getElementById('gd-res-time').textContent = `${elapsedSec.toFixed(2)} s`;
  
  let gainHtml = `
    <div style="font-size:16px; margin-bottom:10px;">Lv.${result.currentLv} <span style="font-size:12px; color:#aaa;">(${result.currentExp}/${result.nextExp})</span></div>
    VIT 基礎値: <span style="color:#6be6ff;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>
    EXP 獲得: <span style="color:#5ce6e6;">+${expGain}</span>
  `;
  
  const prog = Math.floor((result.currentExp / result.nextExp) * 100);
  gainHtml += `<div style="width:100%; background:#111; border:1px solid #4a3b26; height:8px; margin-top:8px; border-radius:4px; overflow:hidden;"><div style="width:${prog}%; background:#6be6ff; height:100%;"></div></div>`;
  if (result.leveledUp) gainHtml += `<div style="color:#ffd166; font-weight:bold; font-size:16px; margin-top:5px;">🎉 LEVEL UP!</div>`;

  document.getElementById('gd-res-gained').innerHTML = gainHtml;
  document.getElementById('gd-res-newrecord').style.display = isNewRecord ? 'block' : 'none';

  setTimeout(() => {
    showView('result');
    isProcessing = false;
  }, 500);
}