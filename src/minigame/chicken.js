// src/minigame/chicken.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';

// ランク定義（単位：崖からの残り距離 / 崖から遠いほどランクが下がる）
// ※落ちた場合（距離がマイナス）は即Dランク（報酬なし/少なめ）
const RANKS =[
  { name: "S", diffLimit: 5,   vitBase: 10, exp: 40, color: "#ffeb85" }, // 5m以内（神の感覚）
  { name: "A", diffLimit: 15,  vitBase: 8,  exp: 30, color: "#ff6b6b" }, // 15m以内
  { name: "B", diffLimit: 30,  vitBase: 6,  exp: 25, color: "#5ce6e6" }, // 30m以内
  { name: "C", diffLimit: 60,  vitBase: 4,  exp: 20, color: "#94ff6b" }, // 60m以内
  { name: "D", diffLimit: Infinity, vitBase: 2, exp: 10, color: "#aaa" } // それ以上手前、または落下
];

let playerRef = null, onUpdateCallback = null;
let dom = {};

// ゲーム内変数
let isProcessing = false;
let gameState = 'ready'; // 'ready', 'running', 'braking', 'result'
let targetDistance = 0;
let currentDistance = 0;
let speed = 0; // 現在の速度
const ACCELERATION = 0.5; // 加速度（長押し中）
const DECELERATION = 0.3; // 減速度（離したあと）
const MAX_SPEED = 25; // 最高速度
let animationId = null;

export function initChicken(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateCallback = updateUIFn;
  
  dom = {
    overlay: document.getElementById('modal-chicken'),
    viewInfo: document.getElementById('ck-view-info'),
    viewPlay: document.getElementById('ck-view-play'),
    viewResult: document.getElementById('ck-view-result'),
    btnStart: document.getElementById('ck-btn-start'),
    btnRetry: document.getElementById('ck-btn-retry'),
    btnReset: document.getElementById('ck-btn-reset'),
    btnQuit: document.getElementById('ck-btn-quit'),
    btnClose: document.getElementById('ck-btn-close'),
    bestText: document.getElementById('ck-best-time'),
    
    // プレイ用UI
    targetText: document.getElementById('ck-target-dist'),
    speedText: document.getElementById('ck-speed'),
    runButton: document.getElementById('ck-run-btn'),
    bgLayer: document.getElementById('ck-bg-layer')
  };

  dom.btnStart.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnRetry.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnReset.addEventListener('click', () => { if(!isProcessing) { cancelAnimationFrame(animationId); startGame(); }});
  dom.btnQuit.addEventListener('click', () => { cancelAnimationFrame(animationId); showView('info'); });
  dom.btnClose.addEventListener('click', () => { dom.overlay.style.display = 'none'; });

  // 長押し（ダッシュ）のイベント
  const handlePress = (e) => {
    if(e.type === 'touchstart') e.preventDefault();
    if(gameState === 'ready') {
      gameState = 'running';
      loop(); // アニメーション開始
    }
  };
  
  const handleRelease = (e) => {
    if(e.type === 'touchend') e.preventDefault();
    if(gameState === 'running') {
      gameState = 'braking'; // 指を離したらブレーキ状態へ移行
      dom.runButton.style.opacity = '0.5';
      dom.runButton.textContent = 'ブレーキ中...';
    }
  };

  dom.runButton.addEventListener('mousedown', handlePress);
  dom.runButton.addEventListener('touchstart', handlePress, { passive: false });
  
  dom.runButton.addEventListener('mouseup', handleRelease);
  dom.runButton.addEventListener('mouseleave', handleRelease); // ボタン外にポインタが出た時
  dom.runButton.addEventListener('touchend', handleRelease, { passive: false });
  dom.runButton.addEventListener('touchcancel', handleRelease, { passive: false });

  // Rキーリトライ
  window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    if (e.key.toLowerCase() === 'r') {
      if (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex') {
        cancelAnimationFrame(animationId);
        startGame();
      }
    }
  });
}

export async function openChickenModal() {
  dom.overlay.style.display = 'flex';
  showView('info');
  // 崖っぷちは「残り距離(小さいほど良い)」の記録を保存している前提
  const best = await getPersonalBest(playerRef.name, "chicken");
  dom.bestText.textContent = best !== null ? `残り ${best.toFixed(1)} m` : "記録なし";
}

function showView(view) {
  dom.viewInfo.style.display = view === 'info' ? 'flex' : 'none';
  dom.viewPlay.style.display = view === 'play' ? 'flex' : 'none';
  dom.viewResult.style.display = view === 'result' ? 'flex' : 'none';
}

function startGame() {
  if (isProcessing) return;
  showView('play');
  
  // 500m 〜 1200m の間でランダムな目標地点を設定
  targetDistance = Math.floor(Math.random() * 700) + 500;
  currentDistance = 0;
  speed = 0;
  gameState = 'ready';
  
  dom.targetText.textContent = targetDistance + ' m';
  dom.speedText.textContent = '0 km/h';
  dom.runButton.style.opacity = '1';
  dom.runButton.textContent = '長押しで走る！(離すとブレーキ)';
  dom.bgLayer.style.backgroundPosition = '0 0';
}

// 物理演算ループ
function loop() {
  if (gameState === 'running') {
    speed += ACCELERATION;
    if (speed > MAX_SPEED) speed = MAX_SPEED;
  } else if (gameState === 'braking') {
    speed -= DECELERATION;
    if (speed <= 0) {
      speed = 0;
      finishGame(); // 完全に止まったら終了
      return;
    }
  }

  currentDistance += speed;
  dom.speedText.textContent = Math.floor(speed * 4) + ' km/h'; // 視覚的なスピード感演出
  
  // 背景をスクロールさせて走っている感を出す
  let currentBgPos = parseFloat(dom.bgLayer.style.backgroundPosition.split(' ')[0]) || 0;
  dom.bgLayer.style.backgroundPosition = `${currentBgPos - speed}px 0`;

  // 崖を越えたら（落下したら）即終了
  if (currentDistance > targetDistance) {
    finishGame(true); // true = 落下
    return;
  }

  animationId = requestAnimationFrame(loop);
}

async function finishGame(isFallen = false) {
  cancelAnimationFrame(animationId);
  isProcessing = true;
  gameState = 'result';

  const diff = isFallen ? Infinity : (targetDistance - currentDistance);
  
  let rankIndex = RANKS.findIndex(r => diff <= r.diffLimit);
  if(rankIndex === -1) rankIndex = RANKS.length - 1; // 落ちた場合は最低ランク
  const rank = RANKS[rankIndex];

  // 落下時はマイナス距離として表示
  const resultTextStr = isFallen ? `落下!! (-${(currentDistance - targetDistance).toFixed(1)}m)` : `残り ${diff.toFixed(1)} m`;

  // ステータス反映（VIT）
  const result = applyMinigameResult(playerRef, 'vit', rank.exp, rank.vitBase);
  if (onUpdateCallback) onUpdateCallback();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();
  await savePlayerData(playerRef);

  // 自己ベスト保存（diffが小さいほど上位なので、そのまま保存）
  let isNewRecord = false;
  if (!isFallen) {
    isNewRecord = await savePersonalBest(playerRef.name, "chicken", diff);
  }

  // --- リザルト表示 ---
  document.getElementById('ck-res-time').textContent = resultTextStr;
  document.getElementById('ck-res-time').style.color = isFallen ? '#ff6b6b' : '#fff';
  document.getElementById('ck-res-rank').textContent = rank.name;
  document.getElementById('ck-res-rank').style.color = rank.color;
  
  let nextRankStr = isFallen ? "落下ペナルティ" : (rankIndex > 0 ? `次の[${RANKS[rankIndex-1].name}]まで あと ${(diff - RANKS[rankIndex-1].diffLimit).toFixed(1)} m 攻める` : "最高ランク！");
  document.getElementById('ck-res-next').textContent = nextRankStr;

  let gainHtml = `
    <div style="font-size:16px; margin-bottom:10px;">Lv.${result.currentLv} <span style="font-size:12px; color:#aaa;">(${result.currentExp}/${result.nextExp})</span></div>
    VIT 基礎値: <span style="color:#6be6ff;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>
    EXP 獲得: <span style="color:#5ce6e6;">+${rank.exp}</span>
  `;
  const progress = Math.floor((result.currentExp / result.nextExp) * 100);
  gainHtml += `<div style="width:100%; background:#111; border:1px solid #4a3b26; height:8px; margin-top:8px; border-radius:4px; overflow:hidden;"><div style="width:${progress}%; background:#6be6ff; height:100%;"></div></div>`;
  if (result.leveledUp) gainHtml += `<div style="color:#ffd166; font-weight:bold; font-size:16px; margin-top:5px;">🎉 LEVEL UP!</div>`;

  document.getElementById('ck-res-gained').innerHTML = gainHtml;
  document.getElementById('ck-res-newrecord').style.display = isNewRecord ? 'block' : 'none';

  showView('result');
  isProcessing = false;
}