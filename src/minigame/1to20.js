// src/minigame/1to20.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';

const RANKS =[
  { name: "S", timeLimit: 5.0, agiBase: 8, exp: 35, color: "#ffeb85" },
  { name: "A", timeLimit: 7.0, agiBase: 6, exp: 25, color: "#ff6b6b" },
  { name: "B", timeLimit: 10.0, agiBase: 5, exp: 20, color: "#5ce6e6" },
  { name: "C", timeLimit: 15.0, agiBase: 4, exp: 15, color: "#94ff6b" },
  { name: "D", timeLimit: Infinity, agiBase: 3, exp: 15, color: "#aaa" }
];

let playerRef = null, onUpdateCallback = null;
let dom = {};

const MAX_NUMBER = 20;
let currentNumber = 1;
let startTime = 0;
let timerInterval = null;
let isTimerRunning = false;
let isProcessing = false;
let isStunned = false;

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
    if(!isProcessing) { clearInterval(timerInterval); startGame(); } 
  });
  dom.btnQuit.addEventListener('click', () => { 
    clearInterval(timerInterval); showView('info'); 
  });
  dom.btnClose.addEventListener('click', () => { dom.overlay.style.display = 'none'; });

  window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    if (e.key.toLowerCase() === 'r') {
      if (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex') {
        clearInterval(timerInterval);
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

function startGame() {
  showView('play');
  currentNumber = 1;
  isTimerRunning = false;
  isStunned = false;
  isProcessing = false;
  
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

  // グリッドにボタンを生成
  dom.gridContainer.innerHTML = '';
  dom.gridContainer.style.filter = 'none';
  
  numbers.forEach(num => {
    const btn = document.createElement('div');
    btn.textContent = num;
    // ボタンのデザイン
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

    // タップイベント（マルチタッチ対策＆ペナルティ処理）
    const onTouch = (e) => {
      if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
      if (e.type === 'touchstart') e.preventDefault();
      handleTap(num, btn);
    };

    btn.addEventListener('mousedown', onTouch);
    btn.addEventListener('touchstart', onTouch, { passive: false });

    dom.gridContainer.appendChild(btn);
  });
}

function handleTap(num, btnEl) {
  if (isStunned || isProcessing || btnEl.style.visibility === 'hidden') return;

  if (num === currentNumber) {
    // --- 正解 ---
    if (!isTimerRunning) {
      isTimerRunning = true;
      startTime = performance.now();
      dom.timerText.style.color = "#5ce6e6";
      timerInterval = setInterval(() => {
        dom.timerText.textContent = ((performance.now() - startTime) / 1000).toFixed(2);
      }, 10);
    }

    btnEl.style.visibility = 'hidden'; // 消す（レイアウトは維持）
    currentNumber++;
    
    if (currentNumber <= MAX_NUMBER) {
      dom.nextNumText.textContent = currentNumber;
    } else {
      dom.nextNumText.textContent = "CLEAR!";
      finishGame();
    }
  } else {
    // --- 不正解（ペナルティ） ---
    // 最初の1を間違えた時はタイマーが動いていないのでペナルティ不要
    if (!isTimerRunning) return; 

    isStunned = true;
    dom.gridContainer.style.animation = 'none';
    dom.gridContainer.offsetHeight; 
    dom.gridContainer.style.animation = 'shake 0.2s';
    dom.gridContainer.style.filter = 'brightness(0.5) sepia(1) hue-rotate(-50deg) saturate(5)';

    setTimeout(() => {
      isStunned = false;
      dom.gridContainer.style.animation = 'none';
      dom.gridContainer.style.filter = 'none';
    }, 200); // 0.2秒の硬直
  }
}

async function finishGame() {
  if (isProcessing) return;
  isProcessing = true;
  clearInterval(timerInterval);
  isTimerRunning = false;

  const time = (performance.now() - startTime) / 1000;
  
  let rankIndex = RANKS.findIndex(r => time < r.timeLimit);
  if(rankIndex === -1) rankIndex = RANKS.length - 1;
  const rank = RANKS[rankIndex];

  let nextRankStr = "最高ランク！";
  if (rankIndex > 0) {
    const nextRank = RANKS[rankIndex - 1];
    nextRankStr = `次の[${nextRank.name}]まで あと ${(time - nextRank.timeLimit).toFixed(2)} 秒`;
  }

  // ステータス反映 (AGI)
  const result = applyMinigameResult(playerRef, 'agi', rank.exp, rank.agiBase);
  
  if (onUpdateCallback) onUpdateCallback();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();

  await savePlayerData(playerRef);

  const isNewRecord = await savePersonalBest(playerRef.name, "1to20", time);

  // リザルト構築
  document.getElementById('ot-res-time').textContent = time.toFixed(2) + " 秒";
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