// src/minigame/command.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';
import { playSound } from '../audio.js';

const RANKS =[
  { name: "S", timeLimit: 8.0, agiBase: 12, exp: 45, color: "#ffeb85" },
  { name: "A", timeLimit: 11.0, agiBase: 10, exp: 35, color: "#ff6b6b" },
  { name: "B", timeLimit: 15.0, agiBase: 8, exp: 30, color: "#5ce6e6" },
  { name: "C", timeLimit: 20.0, agiBase: 6, exp: 25, color: "#94ff6b" },
  { name: "D", timeLimit: Infinity, agiBase: 5, exp: 20, color: "#aaa" }
];

let playerRef = null, onUpdateCallback = null;
let dom = {};

const SET_LENGTHS = [4, 6, 8, 10, 12]; // 全5セット、計40コマンド
const DIRS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
const DIR_SYMBOLS = { 'UP': '↑', 'DOWN': '↓', 'LEFT': '←', 'RIGHT': '→' };
const DIR_COLORS = { 'UP': '#ff6b6b', 'DOWN': '#6be6ff', 'LEFT': '#94ff6b', 'RIGHT': '#ffd166' };

let currentSet = 0;
let currentSequence =[];
let currentIndex = 0;

let startTime = 0;
let timerInterval = null;
let isTimerRunning = false;
let isProcessing = false;
let isStunned = false;
let isTransitioning = false; // セット間の「NEXT!」表示中フラグ

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
    if(!isProcessing) { clearInterval(timerInterval); startGame(); } 
  });
  dom.btnQuit.addEventListener('click', () => { 
    clearInterval(timerInterval); showView('info'); 
  });
  dom.btnClose.addEventListener('click', () => { dom.overlay.style.display = 'none'; });

  // PCキーボード対応
  window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    
    if (e.key.toLowerCase() === 'r') {
      if (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex') {
        clearInterval(timerInterval); startGame();
      }
      return;
    }

    if (dom.viewPlay.style.display !== 'flex') return;

    if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') { e.preventDefault(); handleInput('UP'); }
    else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') { e.preventDefault(); handleInput('DOWN'); }
    else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') { e.preventDefault(); handleInput('LEFT'); }
    else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') { e.preventDefault(); handleInput('RIGHT'); }
  });

  // スマホ/マウスボタン対応（20ms制限なし、マルチタッチによる同時押しのみ無効化）
  dom.inputBtns.forEach(btn => {
    const onTouch = (e) => {
      if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
      if (e.type === 'touchstart') e.preventDefault();
      handleInput(btn.dataset.dir);
      
      // ボタンが押された視覚効果（沈み込み）
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
  dom.sequenceContainer.style.filter = 'none';
  
  currentSequence.forEach((dir, i) => {
    if (i < currentIndex) return; // 入力済みのものは描画しない（詰める）
    
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
    
    // 一番左（次に入力すべきもの）は少し大きく光らせる
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

  // タイマースタート
  if (!isTimerRunning) {
    isTimerRunning = true;
    startTime = performance.now();
    dom.timerText.style.color = "#5ce6e6";
    timerInterval = setInterval(() => {
      dom.timerText.textContent = ((performance.now() - startTime) / 1000).toFixed(2);
    }, 10);
  }

  if (dir === currentSequence[currentIndex]) {
    // --- 正解 ---
    playSound('hit');
    currentIndex++;
    
    if (currentIndex >= currentSequence.length) {
      // セット完了
      currentSet++;
      if (currentSet >= SET_LENGTHS.length) {
        finishGame();
      } else {
        // 次のセットへの「NEXT!」演出
        isTransitioning = true;
        playSound('click');
        dom.sequenceContainer.innerHTML = '<div style="width:100%; text-align:center; color:#ffeb85; font-size:32px; font-weight:bold; align-self:center; letter-spacing:2px;">NEXT!</div>';
        
        setTimeout(() => {
          isTransitioning = false;
          startSet(currentSet);
        }, 300); // 0.3秒だけ表示してすぐ次へ
      }
    } else {
      // セット途中なら再描画して左に詰める
      renderSequence();
    }
  } else {
    // --- 不正解ペナルティ (0.3秒硬直) ---
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
    }, 300); // 0.3秒の硬直
  }
}

async function finishGame() {
  if (isProcessing) return;
  isProcessing = true;
  clearInterval(timerInterval);
  isTimerRunning = false;
  playSound('win');

  const finalTime = (performance.now() - startTime) / 1000;
  
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
  const isNewRecord = await savePersonalBest(playerRef.name, "command", finalTime);

  // リザルト構築
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