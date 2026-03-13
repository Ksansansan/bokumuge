// src/minigame/daruma.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';

// だるま落としのランク設定（難易度が高いので報酬多め）
const RANKS =[
  { name: "S", timeLimit: 9.0, strBase: 12, exp: 45, color: "#ffeb85" },
  { name: "A", timeLimit: 12.0, strBase: 10, exp: 35, color: "#ff6b6b" },
  { name: "B", timeLimit: 15.0, strBase: 8, exp: 30, color: "#5ce6e6" },
  { name: "C", timeLimit: 20.0, strBase: 6, exp: 25, color: "#94ff6b" },
  { name: "D", timeLimit: Infinity, strBase: 5, exp: 25, color: "#aaa" }
];

let playerRef = null, onUpdateCallback = null;
const TOTAL_BLOCKS = 51;
let blocks =[]; // 'red' or 'blue'
let currentIndex = 0; // 現在の一番下のブロックのインデックス
let startTime = 0, timerInterval = null, isTimerRunning = false;
let isStunned = false; // ペナルティ中の硬直フラグ
let isProcessing = false;
let lastInputTime = 0;
let dom = {};

export function initDaruma(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateCallback = updateUIFn;
  
  dom = {
    overlay: document.getElementById('modal-daruma'),
    viewInfo: document.getElementById('dm-view-info'),
    viewPlay: document.getElementById('dm-view-play'),
    viewResult: document.getElementById('dm-view-result'),
    blocksContainer: document.getElementById('dm-blocks-container'),
    timerText: document.getElementById('dm-timer'),
    countText: document.getElementById('dm-count'),
    bestText: document.getElementById('dm-best-time')
  };

  // ボタン設定
   document.getElementById('dm-btn-start').addEventListener('click', () => { if(!isProcessing) startGame(); });
  document.getElementById('dm-btn-retry').addEventListener('click', () => { if(!isProcessing) startGame(); });
  document.getElementById('dm-btn-reset').addEventListener('click', () => { 
    if(!isProcessing) { clearInterval(timerInterval); startGame(); } 
  });
  document.getElementById('dm-btn-quit').addEventListener('click', () => { clearInterval(timerInterval); showView('info'); });
  document.getElementById('dm-btn-close').addEventListener('click', () => { dom.overlay.style.display = 'none'; });

  
  // 左右のタップ領域設定（PCマウスクリック＆スマホタップ対応）
  const tapLeft = document.getElementById('dm-tap-left');
  const tapRight = document.getElementById('dm-tap-right');

  const handleInput = (color) => {
    if (isStunned || currentIndex >= TOTAL_BLOCKS) return;
    
    // 20ms以内の高速入力（ツールやバグ）を無視
    const now = Date.now();
    if (now - lastInputTime < 20) return;
    lastInputTime = now;

    if (!isTimerRunning) {
      isTimerRunning = true;
      startTime = Date.now();
      dom.timerText.style.color = "#5ce6e6";
      timerInterval = setInterval(() => {
        dom.timerText.textContent = ((Date.now() - startTime) / 1000).toFixed(2);
      }, 10);
    }

    if (blocks[currentIndex] === color) {
      // 正解
      currentIndex++;
      dom.countText.textContent = TOTAL_BLOCKS - currentIndex;
      renderBlocks();
      if (currentIndex >= TOTAL_BLOCKS) finishGame();
    } else {
      // 不正解ペナルティ（0.4秒硬直）
      isStunned = true;
      dom.blocksContainer.style.animation = 'shake 0.3s';
      dom.blocksContainer.style.filter = 'brightness(0.5) sepia(1) hue-rotate(-50deg) saturate(5) opacity(0.8)'; // 赤く暗くなる演出
      setTimeout(() => {
        isStunned = false;
        dom.blocksContainer.style.animation = 'none';
        dom.blocksContainer.style.filter = 'none';
      }, 400);
    }
  };

  // イベント登録
  const onTouchZone = (e) => {
    // 2本以上の指が触れていたら完全に無視
    if (e.touches && e.touches.length > 1) {
        e.preventDefault(); // ブラウザのデフォルト挙動を止める
        return;
    }
    
    if (e.type === 'touchstart') e.preventDefault(); // クリックの二重発火防止
    
    const color = e.currentTarget.dataset.color;
    handleInput(color);
  };
  tapLeft.dataset.color = 'red';
  tapRight.dataset.color = 'blue';
  
  // mousedownとtouchstartで即座に反応させる
  // スマホ用
  tapLeft.addEventListener('touchstart', onTouchZone, { passive: false });
  tapRight.addEventListener('touchstart', onTouchZone, { passive: false });
  // PC用
  tapLeft.addEventListener('mousedown', onTouchZone);
  tapRight.addEventListener('mousedown', onTouchZone);

  // PCのキーボード対応 (A:左/赤, D:右/青, または矢印キー)
   window.addEventListener('keydown', (e) => {
    // モーダル自体が開いていない、または通信中なら無視
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;

    const key = e.key.toLowerCase();

    // --- Rキーでのリトライ処理 (プレイ中 または リザルト表示中) ---
    if (key === 'r') {
      if (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex') {
        clearInterval(timerInterval);
        isTimerRunning = false;
        startGame();
        return;
      }
    }

    // --- プレイ中の操作判定 (プレイ中のみ) ---
    if (dom.viewPlay.style.display === 'flex') {
      if (e.repeat) return;
      if (key === 'a' || e.key === 'ArrowLeft') handleInput('red');
      if (key === 'd' || e.key === 'ArrowRight') handleInput('blue');
    }
  });
}

export async function openDarumaModal() {
  dom.overlay.style.display = 'flex';
  showView('info');
  const best = await getPersonalBest(playerRef.name, "daruma");
  dom.bestText.textContent = best ? `${best.toFixed(2)} 秒` : "記録なし";
}

function showView(view) {
  dom.viewInfo.style.display = view === 'info' ? 'flex' : 'none';
  dom.viewPlay.style.display = view === 'play' ? 'flex' : 'none';
  dom.viewResult.style.display = view === 'result' ? 'flex' : 'none';
}

function startGame() {
  isProcessing = false;
  showView('play');
  isTimerRunning = false;
  isStunned = false;
  currentIndex = 0;
  dom.countText.textContent = TOTAL_BLOCKS;
  dom.timerText.textContent = "0.00";
  dom.timerText.style.color = "#ffeb85";
  dom.blocksContainer.style.filter = 'none';
  clearInterval(timerInterval);

  // ランダムにブロックを生成
  blocks = Array.from({ length: TOTAL_BLOCKS }, () => Math.random() < 0.5 ? 'red' : 'blue');
  renderBlocks();
}

// 画面にブロックを最大6個表示する
function renderBlocks() {
  dom.blocksContainer.innerHTML = '';
  // 一番下(currentIndex) から上に向かって積む
  for (let i = currentIndex + 5; i >= currentIndex; i--) {
    if (i < TOTAL_BLOCKS) {
      const isRed = blocks[i] === 'red';
      const colorCode = isRed ? 'linear-gradient(to right, #ff4d4d, #cc0000)' : 'linear-gradient(to right, #4d4dff, #0000cc)';
      const div = document.createElement('div');
      div.style.width = '120px';
      div.style.height = '35px';
      div.style.borderRadius = '6px';
      div.style.marginBottom = '4px';
      div.style.background = colorCode;
      div.style.border = '2px solid #222';
      div.style.boxShadow = 'inset 0 2px 5px rgba(255,255,255,0.3), 0 4px 6px rgba(0,0,0,0.6)';
      dom.blocksContainer.appendChild(div);
    }
  }
}

async function finishGame() {
  isProcessing = true;
  clearInterval(timerInterval);
  isTimerRunning = false;
  const time = (Date.now() - startTime) / 1000;
  
  let rankIndex = RANKS.findIndex(r => time < r.timeLimit);
  if(rankIndex === -1) rankIndex = RANKS.length - 1;
  const rank = RANKS[rankIndex];

  let nextRankStr = "最高ランク！";
  if (rankIndex > 0) {
    const nextRank = RANKS[rankIndex - 1];
    nextRankStr = `次の[${nextRank.name}]まで あと ${(time - nextRank.timeLimit).toFixed(2)} 秒`;
  }

  // ステータス反映 (大岩プッシュと同じ minigameCore を使用)
  const result = applyMinigameResult(playerRef, 'str', rank.exp, rank.strBase);
  if (playerRef.updateStatusUI) {
    playerRef.updateStatusUI();
  }
  if (onUpdateCallback) onUpdateCallback();
  await savePlayerData(playerRef);

  const isNewRecord = await savePersonalBest(playerRef.name, "daruma", time);

  document.getElementById('dm-res-time').textContent = time.toFixed(2) + " 秒";
  document.getElementById('dm-res-rank').textContent = rank.name;
  document.getElementById('dm-res-rank').style.color = rank.color;
  document.getElementById('dm-res-next').textContent = nextRankStr;
  
  let gainHtml = `
    <div style="font-size:16px; margin-bottom:10px;">Lv.${result.currentLv} <span style="font-size:12px; color:#aaa;">(${result.currentExp}/${result.nextExp})</span></div>
    STR 基礎値: <span style="color:#ff6b6b;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>
    EXP 獲得: <span style="color:#5ce6e6;">+${rank.exp}</span>
  `;
  
  const progress = Math.floor((result.currentExp / result.nextExp) * 100);
  gainHtml += `<div style="width:100%; background:#111; border:1px solid #4a3b26; height:8px; margin-top:8px; border-radius:4px; overflow:hidden;"><div style="width:${progress}%; background:#5ce6e6; height:100%;"></div></div>`;

  if (result.leveledUp) gainHtml += `<div style="color:#ffd166; font-weight:bold; font-size:16px; margin-top:5px;">🎉 LEVEL UP!</div>`;

  document.getElementById('dm-res-gained').innerHTML = gainHtml;
  document.getElementById('dm-res-newrecord').style.display = isNewRecord ? 'block' : 'none';

  showView('result');
  isProcessing = false;
}