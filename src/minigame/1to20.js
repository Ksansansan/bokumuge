// src/minigame/1to20.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';

// ★ シャッフルによる探索ラグを考慮し、制限時間を少し緩和
const RANKS =[
  { name: "S", timeLimit: 7.0, agiBase: 10, exp: 40, color: "#ffeb85" },
  { name: "A", timeLimit: 10.0, agiBase: 8, exp: 30, color: "#ff6b6b" },
  { name: "B", timeLimit: 14.0, agiBase: 6, exp: 25, color: "#5ce6e6" },
  { name: "C", timeLimit: 20.0, agiBase: 5, exp: 20, color: "#94ff6b" },
  { name: "D", timeLimit: Infinity, agiBase: 4, exp: 20, color: "#aaa" }
];

let playerRef = null, onUpdateCallback = null;
let dom = {};

const MAX_NUMBER = 20;
let currentNumber = 1;

// ★ ストップウォッチ方式のタイマー管理用変数
let accumulatedTime = 0;
let lastStartTime = 0;
let timerInterval = null;
let isTimerRunning = false;

let isProcessing = false;
let isStunned = false;
let isShuffling = false; // シャッフル中フラグ

export function init1to20(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateCallback = updateUIFn;
  
  dom = {
    overlay: document.getElementById('modal-1to20'),
    viewInfo: document.getElementById('ot-view-info'),
    viewPlay: document.getElementById('ot-view-play'),
    viewResult: document.getElementById('ot-view-result'),
    btnStart: document.getElementById('ot-btn-start'),
    btnRetry: document.getElementById('ot-btn-retry'),
    btnReset: document.getElementById('ot-btn-reset'),
    btnQuit: document.getElementById('ot-btn-quit'),
    btnClose: document.getElementById('ot-btn-close'),
    gridContainer: document.getElementById('ot-grid-container'),
    timerText: document.getElementById('ot-timer'),
    nextNumText: document.getElementById('ot-next-num'),
    bestText: document.getElementById('ot-best-time')
  };

  dom.btnStart.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnRetry.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnReset.addEventListener('click', () => { 
    if(!isProcessing) { pauseTimer(); startGame(); } 
  });
  dom.btnQuit.addEventListener('click', () => { 
    pauseTimer(); showView('info'); 
  });
  dom.btnClose.addEventListener('click', () => { dom.overlay.style.display = 'none'; });

  window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    if (e.key.toLowerCase() === 'r') {
      if (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex') {
        pauseTimer();
        startGame();
      }
    }
  });
}

export async function open1to20Modal() {
  dom.overlay.style.display = 'flex';
  showView('info');
  const best = await getPersonalBest(playerRef.name, "1to20");
  dom.bestText.textContent = best ? `${best.toFixed(2)} 秒` : "記録なし";
}

function showView(view) {
  dom.viewInfo.style.display = view === 'info' ? 'flex' : 'none';
  dom.viewPlay.style.display = view === 'play' ? 'flex' : 'none';
  dom.viewResult.style.display = view === 'result' ? 'flex' : 'none';
}

// --- タイマー管理 ---
function startTimer() {
  if (isTimerRunning) return;
  isTimerRunning = true;
  lastStartTime = performance.now();
  timerInterval = setInterval(updateTimerUI, 10);
  dom.timerText.style.color = "#5ce6e6";
}

function pauseTimer() {
  if (!isTimerRunning) return;
  isTimerRunning = false;
  accumulatedTime += (performance.now() - lastStartTime) / 1000;
  clearInterval(timerInterval);
  updateTimerUI();
  dom.timerText.style.color = "#fff";
}

function updateTimerUI() {
  let elapsed = accumulatedTime;
  if (isTimerRunning) elapsed += (performance.now() - lastStartTime) / 1000;
  dom.timerText.textContent = elapsed.toFixed(2);
}

// --- 高速シャッフル演出 ---
function triggerShuffle() {
  isShuffling = true;
  pauseTimer(); // タイマー一時停止
  
  // まだ押されていない（表示中の）ボタンを取得
  const visibleBtns = Array.from(dom.gridContainer.querySelectorAll('.ot-num-btn'))
    .filter(btn => btn.style.visibility !== 'hidden');
  
  // アニメーション: スケールを0にして一瞬消す
  visibleBtns.forEach(btn => {
    btn.style.transform = 'scale(0)';
  });

  setTimeout(() => {
    // 中身の数字をシャッフル
    let remainingNumbers = visibleBtns.map(btn => parseInt(btn.dataset.num, 10));
    for (let i = remainingNumbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingNumbers[i], remainingNumbers[j]] =[remainingNumbers[j], remainingNumbers[i]];
    }

    // 再割り当てして表面に戻す
    visibleBtns.forEach((btn, index) => {
      btn.dataset.num = remainingNumbers[index];
      btn.textContent = remainingNumbers[index];
      btn.style.transform = 'scale(1)'; // 再び表示
    });

    setTimeout(() => {
      isShuffling = false;
      startTimer(); // タイマー再開
    }, 150); // 現れるアニメーションを待つ
  }, 150); // 消えるアニメーションを待つ
}

// --- ゲーム開始 ---
function startGame() {
  showView('play');
  currentNumber = 1;
  accumulatedTime = 0;
  isTimerRunning = false;
  isStunned = false;
  isProcessing = false;
  isShuffling = false;
  
  dom.nextNumText.textContent = currentNumber;
  dom.timerText.textContent = "0.00";
  dom.timerText.style.color = "#fff";
  clearInterval(timerInterval);
  
  // 1〜20の配列を作ってシャッフル
  let numbers = Array.from({ length: MAX_NUMBER }, (_, i) => i + 1);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }

  dom.gridContainer.innerHTML = '';
  dom.gridContainer.style.filter = 'none';
  
  // ボタンの生成（最初は全て「?」）
  numbers.forEach(num => {
    const btn = document.createElement('div');
    btn.className = 'ot-num-btn';
    btn.dataset.num = num;
    btn.textContent = '?'; // ★最初は隠す
    
    btn.style.background = 'linear-gradient(to bottom, #4a7a2a, #2a4a1a)';
    btn.style.border = '2px solid #94ff6b';
    btn.style.borderRadius = '8px';
    btn.style.color = '#fff';
    btn.style.fontSize = '24px';
    btn.style.fontWeight = 'bold';
    btn.style.display = 'flex';
    btn.style.justifyContent = 'center';
    btn.style.alignItems = 'center';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.5)';
    btn.style.userSelect = 'none';
    btn.style.transition = 'transform 0.15s ease-in-out'; // ★シャッフル用アニメーション

    const onTouch = (e) => {
      if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
      if (e.type === 'touchstart') e.preventDefault();
      handleTap(btn);
    };

    btn.addEventListener('mousedown', onTouch);
    btn.addEventListener('touchstart', onTouch, { passive: false });

    dom.gridContainer.appendChild(btn);
  });

  // ★GOボタンのオーバーレイ生成
  const goOverlay = document.createElement('div');
  goOverlay.style.position = 'absolute';
  goOverlay.style.top = '0';
  goOverlay.style.left = '0';
  goOverlay.style.width = '100%';
  goOverlay.style.height = '100%';
  goOverlay.style.display = 'flex';
  goOverlay.style.justifyContent = 'center';
  goOverlay.style.alignItems = 'center';
  goOverlay.style.background = 'rgba(0,0,0,0.6)';
  goOverlay.style.borderRadius = '8px';
  goOverlay.style.zIndex = '10';

  const goBtn = document.createElement('button');
  goBtn.textContent = 'GO!';
  goBtn.className = 'btn-fantasy';
  goBtn.style.fontSize = '36px';
  goBtn.style.padding = '15px 40px';
  goBtn.style.borderRadius = '40px';
  goBtn.style.background = 'linear-gradient(to bottom, #ff6b6b, #cc0000)';
  goBtn.style.borderColor = '#ffaaaa';
  goBtn.style.boxShadow = '0 0 20px rgba(255,107,107,0.8)';
  
  goBtn.addEventListener('click', () => {
    goOverlay.style.display = 'none';
    // 「?」を数字にしてゲーム開始
    const btns = dom.gridContainer.querySelectorAll('.ot-num-btn');
    btns.forEach(b => { b.textContent = b.dataset.num; });
    startTimer();
  });
  
  goOverlay.appendChild(goBtn);
  dom.gridContainer.appendChild(goOverlay);
}

function handleTap(btnEl) {
  if (isStunned || isProcessing || isShuffling || btnEl.style.visibility === 'hidden') return;
  if (btnEl.textContent === '?') return; // GOを押す前は無効

  const num = parseInt(btnEl.dataset.num, 10);

  if (num === currentNumber) {
    // 正解
    btnEl.style.visibility = 'hidden'; 
    currentNumber++;
    
    if (currentNumber <= MAX_NUMBER) {
      dom.nextNumText.textContent = currentNumber;
      
      // ★ 5, 10, 15を押し終わった直後（次が6, 11, 16の時）にシャッフル発動！
      if ([6, 11, 16].includes(currentNumber)) {
        triggerShuffle();
      }
    } else {
      dom.nextNumText.textContent = "CLEAR!";
      finishGame();
    }
  } else {
    // 不正解ペナルティ (0.2秒硬直)
    isStunned = true;
    dom.gridContainer.style.animation = 'none';
    dom.gridContainer.offsetHeight; 
    dom.gridContainer.style.animation = 'shake 0.2s';
    dom.gridContainer.style.filter = 'brightness(0.5) sepia(1) hue-rotate(-50deg) saturate(5)';

    setTimeout(() => {
      isStunned = false;
      dom.gridContainer.style.animation = 'none';
      dom.gridContainer.style.filter = 'none';
    }, 200);
  }
}

async function finishGame() {
  if (isProcessing) return;
  isProcessing = true;
  pauseTimer();

  const finalTime = accumulatedTime; // 最終タイム
  
  let rankIndex = RANKS.findIndex(r => finalTime < r.timeLimit);
  if(rankIndex === -1) rankIndex = RANKS.length - 1;
  const rank = RANKS[rankIndex];

  let nextRankStr = "最高ランク！";
  if (rankIndex > 0) {
    const nextRank = RANKS[rankIndex - 1];
    nextRankStr = `次の[${nextRank.name}]まで あと ${(finalTime - nextRank.timeLimit).toFixed(2)} 秒`;
  }

  // ステータス反映
  const result = applyMinigameResult(playerRef, 'agi', rank.exp, rank.agiBase);
  
  if (onUpdateCallback) onUpdateCallback();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();

  await savePlayerData(playerRef);

  const isNewRecord = await savePersonalBest(playerRef.name, "1to20", finalTime);

  // リザルト構築
  document.getElementById('ot-res-time').textContent = finalTime.toFixed(2) + " 秒";
  document.getElementById('ot-res-rank').textContent = rank.name;
  document.getElementById('ot-res-rank').style.color = rank.color;
  document.getElementById('ot-res-next').textContent = nextRankStr;
  
  let gainHtml = `
    <div style="font-size:16px; margin-bottom:10px;">Lv.${result.currentLv} <span style="font-size:12px; color:#aaa;">(${result.currentExp}/${result.nextExp})</span></div>
    AGI 基礎値: <span style="color:#94ff6b;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>
    EXP 獲得: <span style="color:#5ce6e6;">+${rank.exp}</span>
  `;
  const prog = Math.floor((result.currentExp / result.nextExp) * 100);
  gainHtml += `<div style="width:100%; background:#111; border:1px solid #4a3b26; height:8px; margin-top:8px; border-radius:4px; overflow:hidden;"><div style="width:${prog}%; background:#94ff6b; height:100%;"></div></div>`;
  if (result.leveledUp) gainHtml += `<div style="color:#ffd166; font-weight:bold; font-size:16px; margin-top:5px;">🎉 LEVEL UP!</div>`;

  document.getElementById('ot-res-gained').innerHTML = gainHtml;
  document.getElementById('ot-res-newrecord').style.display = isNewRecord ? 'block' : 'none';

  showView('result');
  isProcessing = false;
}