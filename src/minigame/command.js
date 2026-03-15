// src/minigame/command.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';
import { playSound } from '../audio.js';

// ★ Sランクを11.0sに緩和し、全体を調整
const RANKS = [
  { name: "S", timeLimit: 9.5, agiBase: 13, exp: 50, color: "#ffeb85" },
  { name: "A", timeLimit: 13.0, agiBase: 10, exp: 40, color: "#ff6b6b" },
  { name: "B", timeLimit: 17.0, agiBase: 8, exp: 30, color: "#5ce6e6" },
  { name: "C", timeLimit: 22.0, agiBase: 6, exp: 25, color: "#94ff6b" },
  { name: "D", timeLimit: Infinity, agiBase: 5, exp: 25, color: "#aaa" }
];

let playerRef = null, onUpdateCallback = null;
let dom = {};

const SET_LENGTHS = [4, 5, 7, 9, 10]; 
const DIRS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
const DIR_SYMBOLS = { 'UP': '↑', 'DOWN': '↓', 'LEFT': '←', 'RIGHT': '→' };
const DIR_COLORS = { 'UP': '#ff6b6b', 'DOWN': '#6be6ff', 'LEFT': '#94ff6b', 'RIGHT': '#ffd166' };

let currentSet = 0;
let currentSequence = [];
let currentIndex = 0;

// ★ ストップウォッチ方式のタイマー管理
let accumulatedTime = 0;
let lastStartTime = 0;
let timerInterval = null;
let isTimerRunning = false;

let isProcessing = false;
let isStunned = false;
let isTransitioning = false;

export function initCommand(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateCallback = updateUIFn;
  
  dom = {
    overlay: document.getElementById('modal-command'),
    viewInfo: document.getElementById('cm-view-info'),
    viewPlay: document.getElementById('cm-view-play'),
    viewResult: document.getElementById('cm-view-result'),
    btnStart: document.getElementById('cm-btn-start'),
    btnRetry: document.getElementById('cm-btn-retry'),
    btnReset: document.getElementById('cm-btn-reset'),
    btnQuit: document.getElementById('cm-btn-quit'),
    btnClose: document.getElementById('cm-btn-close'),
    sequenceContainer: document.getElementById('cm-sequence-container'),
    timerText: document.getElementById('cm-timer'),
    setCountText: document.getElementById('cm-set-count'),
    bestText: document.getElementById('cm-best-time'),
    inputBtns: document.querySelectorAll('.cm-input-btn')
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

  // キーボード対応
  window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    if (e.key.toLowerCase() === 'r') {
      if (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex') {
        pauseTimer(); startGame();
      }
      return;
    }
    if (dom.viewPlay.style.display !== 'flex' || isTransitioning || isStunned) return;

    if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') { e.preventDefault(); handleInput('UP'); }
    else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') { e.preventDefault(); handleInput('DOWN'); }
    else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') { e.preventDefault(); handleInput('LEFT'); }
    else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') { e.preventDefault(); handleInput('RIGHT'); }
  });

  dom.inputBtns.forEach(btn => {
    const onTouch = (e) => {
      if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
      if (e.type === 'touchstart') e.preventDefault();
      handleInput(btn.dataset.dir);
      
      btn.style.transform = 'translateY(4px)';
      btn.style.boxShadow = 'none';
      setTimeout(() => {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = `0 4px 0 ${getShadowColor(btn.dataset.dir)}`;
      }, 50);
    };
    btn.addEventListener('mousedown', onTouch);
    btn.addEventListener('touchstart', onTouch, { passive: false });
  });
}

function getShadowColor(dir) {
  if(dir === 'UP') return '#990000';
  if(dir === 'DOWN') return '#0d314a';
  if(dir === 'LEFT') return '#1d4a0d';
  if(dir === 'RIGHT') return '#8a6d1c';
  return '#000';
}

// --- ★ タイマー制御関数 ---
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

export async function openCommandModal() {
  dom.overlay.style.display = 'flex';
  showView('info');
  const best = await getPersonalBest(playerRef.name, "command");
  dom.bestText.textContent = best ? `${best.toFixed(2)} 秒` : "記録なし";
}

function showView(view) {
  dom.viewInfo.style.display = view === 'info' ? 'flex' : 'none';
  dom.viewPlay.style.display = view === 'play' ? 'flex' : 'none';
  dom.viewResult.style.display = view === 'result' ? 'flex' : 'none';
}

function startGame() {
  showView('play');
  currentSet = 0;
  accumulatedTime = 0; // ★ リセット
  isTimerRunning = false;
  isStunned = false;
  isProcessing = false;
  isTransitioning = false;
  
  dom.timerText.textContent = "0.00";
  dom.timerText.style.color = "#fff";
  clearInterval(timerInterval);
  
  startSet(currentSet);
}

function startSet(setIndex) {
  dom.setCountText.textContent = setIndex + 1;
  currentIndex = 0;
  currentSequence = [];
  const length = SET_LENGTHS[setIndex];
  for (let i = 0; i < length; i++) {
    currentSequence.push(DIRS[Math.floor(Math.random() * DIRS.length)]);
  }
  renderSequence();
}

function renderSequence() {
  dom.sequenceContainer.innerHTML = '';
  currentSequence.forEach((dir, i) => {
    if (i < currentIndex) return;
    const el = document.createElement('div');
    el.textContent = DIR_SYMBOLS[dir];
    el.style.color = DIR_COLORS[dir];
    el.style.fontSize = '32px';
    el.style.fontWeight = 'bold';
    el.style.display = 'flex';
    el.style.justifyContent = 'center';
    el.style.alignItems = 'center';
    el.style.width = '40px';
    el.style.height = '40px';
    el.style.background = 'rgba(255,255,255,0.1)';
    el.style.borderRadius = '6px';
    el.style.border = `1px solid ${DIR_COLORS[dir]}`;
    if (i === currentIndex) {
      el.style.transform = 'scale(1.1)';
      el.style.boxShadow = `0 0 10px ${DIR_COLORS[dir]}`;
      el.style.background = 'rgba(255,255,255,0.2)';
    }
    dom.sequenceContainer.appendChild(el);
  });
}

function handleInput(dir) {
  if (isStunned || isProcessing || isTransitioning) return;

  // ★ 最初の入力でタイマースタート
  if (!isTimerRunning && accumulatedTime === 0) {
    startTimer();
  }

  if (dir === currentSequence[currentIndex]) {
    playSound('hit');
    currentIndex++;
    
    if (currentIndex >= currentSequence.length) {
      currentSet++;
      if (currentSet >= SET_LENGTHS.length) {
        finishGame();
      } else {
        // ★ セット間：タイマーを一時停止する
        isTransitioning = true;
        pauseTimer(); 
        playSound('click');
        dom.sequenceContainer.innerHTML = '<div style="width:100%; text-align:center; color:#ffeb85; font-size:32px; font-weight:bold; align-self:center; letter-spacing:2px;">NEXT!</div>';
        
        setTimeout(() => {
          isTransitioning = false;
          startSet(currentSet);
          startTimer(); // ★ 再開
        }, 400); // 0.4秒だけ演出
      }
    } else {
      renderSequence();
    }
  } else {
    // ペナルティ (0.3s)
    playSound('error');
    isStunned = true;
    dom.sequenceContainer.style.animation = 'none';
    dom.sequenceContainer.offsetHeight; 
    dom.sequenceContainer.style.animation = 'shake 0.2s';
    dom.sequenceContainer.style.filter = 'brightness(0.5) sepia(1) hue-rotate(-50deg) saturate(5)';
    setTimeout(() => {
      isStunned = false;
      dom.sequenceContainer.style.animation = 'none';
      dom.sequenceContainer.style.filter = 'none';
    }, 300);
  }
}

async function finishGame() {
  if (isProcessing) return;
  isProcessing = true;
  pauseTimer(); // ★ ここで最終タイム確定

  const finalTime = accumulatedTime;
  
  let rankIndex = RANKS.findIndex(r => finalTime < r.timeLimit);
  if(rankIndex === -1) rankIndex = RANKS.length - 1;
  const rank = RANKS[rankIndex];

  let nextRankStr = rankIndex > 0 ? `次の[${RANKS[rankIndex - 1].name}]まで あと ${(finalTime - RANKS[rankIndex - 1].timeLimit).toFixed(2)} 秒` : "最高ランク！";

  const result = applyMinigameResult(playerRef, 'agi', rank.exp, rank.agiBase);
  if (onUpdateCallback) onUpdateCallback();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();

  await savePlayerData(playerRef);
  const isNewRecord = await savePersonalBest(playerRef.name, "command", finalTime);

  document.getElementById('cm-res-time').textContent = finalTime.toFixed(2) + " 秒";
  document.getElementById('cm-res-rank').textContent = rank.name;
  document.getElementById('cm-res-rank').style.color = rank.color;
  document.getElementById('cm-res-next').textContent = nextRankStr;
  
  let gainHtml = `
    <div style="font-size:16px; margin-bottom:10px;">Lv.${result.currentLv} <span style="font-size:12px; color:#aaa;">(${result.currentExp}/${result.nextExp})</span></div>
    AGI 基礎値: <span style="color:#94ff6b;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>
    EXP 獲得: <span style="color:#5ce6e6;">+${rank.exp}</span>
  `;
  const prog = Math.floor((result.currentExp / result.nextExp) * 100);
  gainHtml += `<div style="width:100%; background:#111; border:1px solid #4a3b26; height:8px; margin-top:8px; border-radius:4px; overflow:hidden;"><div style="width:${prog}%; background:#94ff6b; height:100%;"></div></div>`;
  if (result.leveledUp) gainHtml += `<div style="color:#ffd166; font-weight:bold; font-size:16px; margin-top:5px;">🎉 LEVEL UP!</div>`;

  document.getElementById('cm-res-gained').innerHTML = gainHtml;
  document.getElementById('cm-res-newrecord').style.display = isNewRecord ? 'block' : 'none';

  showView('result');
  isProcessing = false;
}