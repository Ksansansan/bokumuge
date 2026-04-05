// src/minigame/clover.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';
import { playSound } from '../audio.js';

const RANKS =[
  { name: "S", timeLimit: 9.5, lckBase: 12, exp: 45, color: "#ffeb85" },
  { name: "A", timeLimit: 13.0, lckBase: 10, exp: 35, color: "#ff6b6b" },
  { name: "B", timeLimit: 18.0, lckBase: 8, exp: 30, color: "#5ce6e6" },
  { name: "C", timeLimit: 24.0, lckBase: 6, exp: 25, color: "#94ff6b" },
  { name: "D", timeLimit: Infinity, lckBase: 5, exp: 20, color: "#aaa" }
];

let playerRef = null, onUpdateCallback = null;
let dom = {};

// 各セットの [列数, 行数]
const SET_CONFIGS = [
  [4, 5], // Set 1: 20個
  [5, 7], // Set 2: 35個
  [9, 6], // Set 3: 54個
  [8, 10], // Set 4: 80個
  [11, 11] // Set 5: 121個 
];

let currentSet = 0;
let accumulatedTime = 0;
let lastStartTime = 0;
let timerInterval = null;
let isTimerRunning = false;
let isProcessing = false;
let isStunned = false;
let isTransitioning = false;

export function initClover(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateCallback = updateUIFn;
  
  dom = {
    overlay: document.getElementById('modal-clover'),
    viewInfo: document.getElementById('cv-view-info'),
    viewPlay: document.getElementById('cv-view-play'),
    viewResult: document.getElementById('cv-view-result'),
    btnStart: document.getElementById('cv-btn-start'),
    btnRetry: document.getElementById('cv-btn-retry'),
    btnReset: document.getElementById('cv-btn-reset'),
    btnQuit: document.getElementById('cv-btn-quit'),
    btnClose: document.getElementById('cv-btn-close'),
    fieldContainer: document.getElementById('cv-field-container'),
    timerText: document.getElementById('cv-timer'),
    setCountText: document.getElementById('cv-set-count'),
    bestText: document.getElementById('cv-best-time')
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
        pauseTimer(); startGame();
      }
    }
  });
}

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

export async function openCloverModal() {
  dom.overlay.style.display = 'flex';
  showView('info');
  const best = await getPersonalBest(playerRef.name, "clover");
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
  accumulatedTime = 0;
  isTimerRunning = false;
  isStunned = false;
  isProcessing = false;
  isTransitioning = false;
  
  dom.timerText.textContent = "0.00";
  dom.timerText.style.color = "#fff";
  clearInterval(timerInterval);
  
  startSet(currentSet);
  startTimer(); // 四つ葉探しは最初からタイマーが動く
}

function createCloverElement(isFour) {
  const wrapper = document.createElement('div');
  wrapper.className = 'clover-wrapper';
  wrapper.dataset.isFour = isFour ? 'true' : 'false';

  // ランダムな回転角と、少しのズレ(オフセット)でより自然な（紛らわしい）配置に
  const rotation = Math.floor(Math.random() * 360);
  const offsetX = Math.floor(Math.random() * 10) - 5;
  const offsetY = Math.floor(Math.random() * 10) - 5;

  const cloverHTML = isFour 
    ? `<div class="clover" style="transform: rotate(${rotation}deg) translate(${offsetX}px, ${offsetY}px);">
         <div class="leaf leaf-4-1"></div><div class="leaf leaf-4-2"></div>
         <div class="leaf leaf-4-3"></div><div class="leaf leaf-4-4"></div>
         <div class="stem"></div>
       </div>`
    : `<div class="clover" style="transform: rotate(${rotation}deg) translate(${offsetX}px, ${offsetY}px);">
         <div class="leaf leaf-3-1"></div><div class="leaf leaf-3-2"></div>
         <div class="leaf leaf-3-3"></div>
         <div class="stem"></div>
       </div>`;

  wrapper.innerHTML = cloverHTML;

  // タップイベント
  const onTouch = (e) => {
    if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
    if (e.type === 'touchstart') e.preventDefault();
    handleTap(isFour);
  };
  wrapper.addEventListener('mousedown', onTouch);
  wrapper.addEventListener('touchstart', onTouch, { passive: false });

  return wrapper;
}

function startSet(setIndex) {
  dom.setCountText.textContent = setIndex + 1;
  const [cols, rows] = SET_CONFIGS[setIndex];
  const total = cols * rows;

  dom.fieldContainer.innerHTML = '';
  dom.fieldContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  dom.fieldContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  // 1つだけ四つ葉、残りは三つ葉
  let clovers = Array(total).fill(false);
  const fourIndex = Math.floor(Math.random() * total);
  clovers[fourIndex] = true;

  clovers.forEach(isFour => {
    dom.fieldContainer.appendChild(createCloverElement(isFour));
  });
}

function handleTap(isFour) {
  if (isStunned || isProcessing || isTransitioning) return;

  if (isFour) {
    // --- 正解（四つ葉発見！） ---
    playSound('hit');
    currentSet++;
    
    if (currentSet >= SET_CONFIGS.length) {
      finishGame();
    } else {
      isTransitioning = true;
      pauseTimer(); 
      playSound('click');
      
      dom.fieldContainer.innerHTML = '<div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; color:#ffd166; font-size:36px; font-weight:bold; letter-spacing:2px;">NEXT!</div>';
      
      setTimeout(() => {
        isTransitioning = false;
        startSet(currentSet);
        startTimer();
      }, 400); 
    }
  } else {
    // --- 不正解ペナルティ (0.3秒硬直) ---
    playSound('error');
    isStunned = true;
    dom.fieldContainer.style.animation = 'none';
    dom.fieldContainer.offsetHeight; 
    dom.fieldContainer.style.animation = 'shake 0.2s';
    dom.fieldContainer.style.filter = 'brightness(0.5) sepia(1) hue-rotate(-50deg) saturate(5)';

    setTimeout(() => {
      isStunned = false;
      dom.fieldContainer.style.animation = 'none';
      dom.fieldContainer.style.filter = 'none';
    }, 300);
  }
}

async function finishGame() {
  if (isProcessing) return;
  isProcessing = true;
  pauseTimer();
  playSound('win');

  const finalTime = accumulatedTime;
  
  let rankIndex = RANKS.findIndex(r => finalTime < r.timeLimit);
  if(rankIndex === -1) rankIndex = RANKS.length - 1;
  const rank = RANKS[rankIndex];

  let nextRankStr = rankIndex > 0 ? `次の[${RANKS[rankIndex - 1].name}]まで あと ${(finalTime - RANKS[rankIndex - 1].timeLimit).toFixed(2)} 秒` : "最高ランク！";

  const result = applyMinigameResult(playerRef, 'lck', rank.exp, rank.lckBase);
  
  if (onUpdateCallback) onUpdateCallback();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();

  await savePlayerData(playerRef);
  const isNewRecord = await savePersonalBest(playerRef.name, "clover", finalTime, playerRef.isRTA);

  document.getElementById('cv-res-time').textContent = finalTime.toFixed(2) + " 秒";
  document.getElementById('cv-res-rank').textContent = rank.name;
  document.getElementById('cv-res-rank').style.color = rank.color;
  document.getElementById('cv-res-next').textContent = nextRankStr;
  
  let gainHtml = `
    <div style="font-size:16px; margin-bottom:10px;">Lv.${result.currentLv} <span style="font-size:12px; color:#aaa;">(${result.currentExp}/${result.nextExp})</span></div>
    LCK 基礎値: <span style="color:#ffd166;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>
    EXP 獲得: <span style="color:#5ce6e6;">+${result.actualExpGain}</span>
  `;
  const prog = Math.floor((result.currentExp / result.nextExp) * 100);
  gainHtml += `<div style="width:100%; background:#111; border:1px solid #4a3b26; height:8px; margin-top:8px; border-radius:4px; overflow:hidden;"><div style="width:${prog}%; background:#ffd166; height:100%;"></div></div>`;
  if (result.leveledUp) gainHtml += `<div style="color:#ffd166; font-weight:bold; font-size:16px; margin-top:5px;">🎉 LEVEL UP!</div>`;

  document.getElementById('cv-res-gained').innerHTML = gainHtml;
  document.getElementById('cv-res-newrecord').style.display = isNewRecord ? 'block' : 'none';

  showView('result');
  isProcessing = false;
}
