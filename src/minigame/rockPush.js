// src/minigame/rockPush.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js'; // ★savePlayerDataを追加
import { applyMinigameResult } from './minigameCore.js';
import { playSound } from '../audio.js';
const RANKS = [
  { name: "S", timeLimit: 5.0, strBase: 7, exp: 30, color: "#ffeb85" },
  { name: "A", timeLimit: 7.0, strBase: 6, exp: 25, color: "#ff6b6b" },
  { name: "B", timeLimit: 9.0, strBase: 5, exp: 20, color: "#5ce6e6" },
  { name: "C", timeLimit: 12.0, strBase: 4, exp: 15, color: "#94ff6b" },
  { name: "D", timeLimit: Infinity, strBase: 3, exp: 15, color: "#aaa" }
];

let playerRef = null;
const TOTAL_TAPS = 51;
let remainingTaps = 0;
let startTime = 0;
let timerInterval = null;
let isProcessing = false;
let lastTapTime = 0;
let isTimerRunning = false; // ★タイマー稼働フラグ
let dom = {};
let onUpdateCallback = null;

export function initRockPush(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateCallback = updateUIFn;
  dom = {
    overlay: document.getElementById('modal-rock-push'),
    viewInfo: document.getElementById('rp-view-info'),
    viewPlay: document.getElementById('rp-view-play'),
    viewResult: document.getElementById('rp-view-result'),
    btnStart: document.getElementById('rp-btn-start'),
    btnRetry: document.getElementById('rp-btn-retry'),
    btnClose: document.getElementById('rp-btn-close'),
    rockBtn: document.getElementById('rp-rock-btn'),
    timerText: document.getElementById('rp-timer'),
    countText: document.getElementById('rp-count'),
    bestText: document.getElementById('rp-best-time'),
    btnQuit: document.getElementById('rp-btn-quit'),
    btnReset: document.getElementById('rp-btn-reset'),
    
  };

  dom.btnStart.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnRetry.addEventListener('click', () => { if(!isProcessing) startGame(); });
  

  dom.btnClose.addEventListener('click', () => { dom.overlay.style.display = 'none'; });
// ★「やめる」ボタン：タイマーを止めて説明画面へ
  dom.btnQuit.addEventListener('click', () => {
    clearInterval(timerInterval);
    isTimerRunning = false;
    showView('info');
  });

  // ★「リトライ」ボタン：タイマーを止めて最初から
  dom.btnReset.addEventListener('click', () => { 
    if(!isProcessing) { clearInterval(timerInterval); startGame(); } 
  });

  window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    if (e.key.toLowerCase() === 'r') {
      // プレイ中、またはリザルト画面にいる時だけ Rキー でリトライ
      if (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex') {
        clearInterval(timerInterval);
        startGame();
      }
    }
  });

  const handleTap = (e) => {
    if (e.type === 'touchstart') e.preventDefault();
    if (e.touches && e.touches.length > 1) return;

    const now = performance.now();
    if (now - lastTapTime < 13) return;
    lastTapTime = now;

    if (remainingTaps > 0) {
      // ★最初の1打目でタイマースタート
      if (!isTimerRunning) {
        startTimer();
      }
      playSound('hit'); 
      remainingTaps--;
      dom.countText.textContent = remainingTaps;
      
      dom.rockBtn.style.animation = 'none';
      dom.rockBtn.offsetHeight;
      dom.rockBtn.style.animation = 'shake 0.1s';

      if (remainingTaps === 0) finishGame();
    }
  };

  dom.rockBtn.addEventListener('touchstart', handleTap, { passive: false });
  dom.rockBtn.addEventListener('mousedown', handleTap);
}

export async function openRockPushModal() {
  dom.overlay.style.display = 'flex';
  showView('info');
  const best = await getPersonalBest(playerRef.name, "rockPush");
  dom.bestText.textContent = best ? `${best.toFixed(2)} 秒` : "記録なし";
}

function showView(viewName) {
  dom.viewInfo.style.display = viewName === 'info' ? 'flex' : 'none';
  dom.viewPlay.style.display = viewName === 'play' ? 'flex' : 'none';
  dom.viewResult.style.display = viewName === 'result' ? 'flex' : 'none';
}

function startGame() {
  if (isProcessing) return;
  showView('play');
  remainingTaps = TOTAL_TAPS;
  isTimerRunning = false; // ★まだ動かさない
  dom.countText.textContent = remainingTaps;
  dom.timerText.textContent = "0.00"; // ★待機中表示
  dom.timerText.style.color = "#ffeb85";
  lastTapTime = 0;
  clearInterval(timerInterval);
}

// ★タイマー開始ロジックを分離
function startTimer() {
  isTimerRunning = true;
  startTime = performance.now();
  dom.timerText.style.color = "#5ce6e6";
  timerInterval = setInterval(() => {
    const elapsed = (performance.now() - startTime) / 1000;
    dom.timerText.textContent = elapsed.toFixed(2);
  }, 10);
}

async function finishGame() {
  clearInterval(timerInterval);
  isTimerRunning = false;
  isProcessing = true;
  playSound('win');
  const time = (performance.now() - startTime) / 1000;
  
  let rankIndex = RANKS.findIndex(r => time < r.timeLimit);
  if(rankIndex === -1) rankIndex = RANKS.length - 1;
  const rank = RANKS[rankIndex];

  let nextRankStr = "最高ランク！";
  if (rankIndex > 0) {
    const nextRank = RANKS[rankIndex - 1];
    const diff = time - nextRank.timeLimit;
    nextRankStr = `次の[${nextRank.name}]まで あと ${diff.toFixed(2)} 秒`;
  }

  // ステータス反映
  const result = applyMinigameResult(playerRef, 'str', rank.exp, rank.strBase);
  
  // ★追加：ヘッダー（StatusUI）も更新するように依頼する
  if (playerRef.updateStatusUI) {
    playerRef.updateStatusUI();
  }
  if (onUpdateCallback) onUpdateCallback();
  // ★ここでFirebaseにセーブ
  await savePlayerData(playerRef);

  // 自己ベスト更新
  const isNewRecord = await savePersonalBest(playerRef.name, "rockPush", time);

  // リザルト表示
  document.getElementById('rp-res-time').textContent = time.toFixed(2) + " 秒";
  document.getElementById('rp-res-rank').textContent = rank.name;
  document.getElementById('rp-res-rank').style.color = rank.color;
  document.getElementById('rp-res-next').textContent = nextRankStr;
  
  // 獲得情報の詳細表示（Lvとx/yを追加）
  let gainHtml = `
    <div style="font-size:16px; margin-bottom:10px;">
      Lv.${result.currentLv} <span style="font-size:12px; color:#aaa;">(${result.currentExp}/${result.nextExp})</span>
    </div>
    STR 基礎値: <span style="color:#ff6b6b;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>
    EXP 獲得: <span style="color:#5ce6e6;">+${result.actualExpGain}</span>
  `;
  
  // 経験値バー
  const progress = Math.floor((result.currentExp / result.nextExp) * 100);
  gainHtml += `
    <div style="width:100%; background:#111; border:1px solid #4a3b26; height:8px; margin-top:8px; border-radius:4px; overflow:hidden;">
      <div style="width:${progress}%; background:#5ce6e6; height:100%;"></div>
    </div>
  `;

  if (result.leveledUp) {
    gainHtml += `<div style="color:#ffd166; font-weight:bold; font-size:16px; margin-top:5px; animation: blink 0.5s infinite;">🎉 ミニゲームLv UP! -> Lv.${result.currentLv}</div>`;
  }

  document.getElementById('rp-res-gained').innerHTML = gainHtml;
  
  document.getElementById('rp-res-newrecord').style.display = isNewRecord ? 'block' : 'none';

  showView('result');
  isProcessing = false;
}
