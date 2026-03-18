// src/minigame/chicken.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';
import { playSound } from '../audio.js';

// --- ランク定義（評価基準は「崖までの残り距離」）---
const RANKS =[
  { name: "S", distLimit: 3.5, vitBase: 15, exp: 60, color: "#ffeb85" },
  { name: "A", distLimit: 7.5, vitBase: 11, exp: 40, color: "#ff6b6b" },
  { name: "B", distLimit: 15.0, vitBase: 8, exp: 30, color: "#5ce6e6" },
  { name: "C", distLimit: 30.0, vitBase: 5, exp: 25, color: "#94ff6b" },
  { name: "D", distLimit: 100.0, vitBase: 4, exp: 20, color: "#aaa" },
  { name: "チキン", distLimit: Infinity, vitBase: 1, exp: 5, color: "#555" }
];
const FALL_RANK = { name: "落下", distLimit: -1, vitBase: 3, exp: 15, color: "#ff0000" };
let playerRef = null, onUpdateCallback = null;
let dom = {};

// 物理演算用パラメータ
let targetDistance = 0; // 今回のランダムな崖までの距離 (m)
let currentPos = 0;     // 現在位置 (m)
let currentSpeed = 0;   // 現在速度 (m/s)
const ACCELERATION = 20; // 長押し中の加速度 (m/s^2)
const FRICTION = 40;     // ブレーキ時（離した時）の減速度 (m/s^2)

// 状態管理
let isAccelerating = false; // ボタンを押しているか
let hasReleased = false;    // 一度でもボタンを離したか
let isPlaying = false;      // ゲーム中か
let isProcessing = false;   // 処理中ロック
let lastFrameTime = 0;
let animationId = null;

export function initChicken(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateCallback = updateUIFn;
  
  dom = {
    overlay: document.getElementById('modal-chicken'),
    viewInfo: document.getElementById('ch-view-info'),
    viewPlay: document.getElementById('ch-view-play'),
    viewResult: document.getElementById('ch-view-result'),
    btnStart: document.getElementById('ch-btn-start'),
    btnRetry: document.getElementById('ch-btn-retry'),
    btnClose: document.getElementById('ch-btn-close'),
    btnQuit: document.getElementById('ch-btn-quit'),
    btnReset: document.getElementById('ch-btn-reset'),
    actionBtn: document.getElementById('ch-action-btn'),
    targetDistText: document.getElementById('ch-target-dist'),
    currentDistText: document.getElementById('ch-current-dist'),
    speedText: document.getElementById('ch-speed-txt'),
    bestText: document.getElementById('ch-best-time'),
    playerBall: document.getElementById('ch-player-ball')
  };

  dom.btnStart.addEventListener('click', () => { if(!isProcessing) startGame(); });
   dom.btnRetry.addEventListener('click', () => { if(!isProcessing) startGame(); });
  // ★リザルト画面の「特訓場へ戻る」ボタン
  dom.btnClose.addEventListener('click', () => { if(!isProcessing) dom.overlay.style.display = 'none'; });

  // ★追加：「やめる」ボタン
  dom.btnQuit.addEventListener('click', () => {
    isPlaying = false;
    if(animationId) cancelAnimationFrame(animationId);
    showView('info');
  });

  // プレイ中の「リトライ」ボタン
  dom.btnReset.addEventListener('click', () => {
    if(!isProcessing) {
      isPlaying = false;
      if(animationId) cancelAnimationFrame(animationId);
      startGame();
    }
  });
  
  // Rキー対応
   window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    if (e.key.toLowerCase() === 'r') {
      // プレイ中、またはリザルト画面にいる時だけ Rキー でリトライ
      if (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex') {
        isPlaying = false;
        if(animationId) cancelAnimationFrame(animationId);
        startGame();
      }
    }
  });

  // --- アクションボタンの処理 ---
  const onPress = (e) => {
    if (!isPlaying || hasReleased) return;
    if (e && e.cancelable) e.preventDefault(); 
    playSound('click');
    isAccelerating = true;
    dom.actionBtn.textContent = "加速中...!!";
    dom.actionBtn.style.background = "linear-gradient(to bottom, #ff3333, #990000)";
  };

  const onRelease = (e) => {
    if (!isPlaying || !isAccelerating) return;
    if (e && e.cancelable) e.preventDefault();
    playSound('click');
    isAccelerating = false;
    hasReleased = true; // 一度離したらもう押せない
    dom.actionBtn.textContent = "ブレーキ作動！";
    dom.actionBtn.style.background = "linear-gradient(to bottom, #555, #222)";
    dom.actionBtn.style.color = "#aaa";
    dom.actionBtn.style.pointerEvents = "none"; // 物理的にも押せなくする
  };

  // PC(マウス) & スマホ(タッチ) 両対応
  dom.actionBtn.addEventListener('mousedown', onPress);
  dom.actionBtn.addEventListener('touchstart', onPress, { passive: false });
  
  // 画面のどこで離しても反応するように window にも離す判定を付ける
  window.addEventListener('mouseup', onRelease);
  window.addEventListener('touchend', onRelease);
}

export async function openChickenModal() {
  dom.overlay.style.display = 'flex';
  showView('info');
  const best = await getPersonalBest(playerRef.name, "chicken");
  dom.bestText.textContent = best ? `${best.toFixed(2)} m` : "記録なし";
}

function showView(view) {
  dom.viewInfo.style.display = view === 'info' ? 'flex' : 'none';
  dom.viewPlay.style.display = view === 'play' ? 'flex' : 'none';
  dom.viewResult.style.display = view === 'result' ? 'flex' : 'none';
}

function startGame() {
  if(animationId) cancelAnimationFrame(animationId);
  showView('play');
  
  // パターン化防止: 目標距離を 300m 〜 600m の間でランダムに設定（平均7秒ほどで終わる距離）
  targetDistance = Math.floor(Math.random() * 300) + 300;
  currentPos = 0;
  currentSpeed = 0;
  isAccelerating = false;
  hasReleased = false;
  isPlaying = true;
  isProcessing = false;
  
  // UIリセット
  dom.targetDistText.textContent = `${targetDistance.toFixed(1)} m`;
  dom.currentDistText.textContent = `${targetDistance.toFixed(1)} m`;
  dom.currentDistText.style.color = "#ffeb85";
  dom.speedText.textContent = "0.0";
  dom.playerBall.style.animation = 'none';
  dom.playerBall.style.left = '10px';
  
  dom.actionBtn.textContent = "長押しで加速！";
  dom.actionBtn.style.background = "linear-gradient(to bottom, #ff6b6b, #cc0000)";
  dom.actionBtn.style.color = "#fff";
  dom.actionBtn.style.pointerEvents = "auto";

  lastFrameTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

function gameLoop(now) {
  if (!isPlaying) return;
  const deltaTime = (now - lastFrameTime) / 1000; // 秒に変換
  lastFrameTime = now;

  // --- 物理演算 ---
  if (isAccelerating) {
    currentSpeed += ACCELERATION * deltaTime;
  } else if (hasReleased) {
    currentSpeed -= FRICTION * deltaTime;
    if (currentSpeed < 0) currentSpeed = 0;
  }

  currentPos += currentSpeed * deltaTime;
  let remaining = targetDistance - currentPos;

  // --- UI更新 ---
  dom.speedText.textContent = currentSpeed.toFixed(1);
  
  // 演出：ボールの位置を「画面幅(%)」で表現。最後の方だけ右端に近づくようにする。
  // 全体の進行度(0~1)
  const progress = Math.min(1, currentPos / targetDistance);
  // 画面の左10%〜右90%の間を移動する
  dom.playerBall.style.left = `${10 + progress * 80}%`;

  if (remaining <= 0) {
    // 落下（失敗）
    playSound('error');
    dom.currentDistText.textContent = "0.0 m";
    dom.currentDistText.style.color = "#ff0000";
    dom.playerBall.style.left = '90%'; 
    dom.playerBall.style.animation = 'fall-down 0.5s forwards';
    finishGame(true, 0); // 落下フラグ
    return;
  } else {
    dom.currentDistText.textContent = remaining.toFixed(1);
    if(remaining < 10) dom.currentDistText.style.color = "#ff6b6b";
  }

  // 完全に停止したか判定
  if (hasReleased && currentSpeed === 0) {
    finishGame(false, remaining);
    return;
  }

  animationId = requestAnimationFrame(gameLoop);
}

async function finishGame(isFall, remainingDist) {
  if (isProcessing) return;
  isPlaying = false;
  isProcessing = true;
  if (animationId) cancelAnimationFrame(animationId);
  if (!isFall) playSound('win');
  let rank;
  let nextRankStr = "";

  if (isFall) {
    rank = FALL_RANK;
    // 落下時は、最低ランクDへの復帰を促す
    nextRankStr = `崖の手前で止まろう！`;
  } else {
    // 現在のランクを特定
    let rankIndex = RANKS.findIndex(r => remainingDist <= r.distLimit);
    if (rankIndex === -1) rankIndex = RANKS.length - 1;
    rank = RANKS[rankIndex];

    // ★追加：次のランクまでの計算
    if (rankIndex > 0) {
      // 0（Sランク）より大きい場合、一つ上のランクが存在する
      const nextRank = RANKS[rankIndex - 1];
      const diff = remainingDist - nextRank.distLimit;
      nextRankStr = `次の[${nextRank.name}]まで あと ${diff.toFixed(2)} m`;
    } else {
      nextRankStr = "最高ランク！";
    }
  }

  // ステータス反映
  const result = applyMinigameResult(playerRef, 'vit', rank.exp, rank.vitBase);
  
  if (onUpdateCallback) onUpdateCallback();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();

  await savePlayerData(playerRef);

  // 自己ベスト記録（落下は除外）
  let isNewRecord = false;
  if (!isFall) {
    isNewRecord = await savePersonalBest(playerRef.name, "chicken", remainingDist);
  }

  // --- 表示の更新 ---
  const resTimeEl = dom.viewResult.querySelector('#ch-res-time');
  resTimeEl.textContent = isFall ? "落下" : `${remainingDist.toFixed(2)} m`;
  resTimeEl.style.color = isFall ? "#ff4444" : "#fff";
  
  document.getElementById('ch-res-rank').textContent = rank.name;
  document.getElementById('ch-res-rank').style.color = rank.color;

  // ★追加：計算した「次のランクまで」を表示
  document.getElementById('ch-res-next').textContent = nextRankStr;
  
  let gainHtml = `
    <div style="font-size:16px; margin-bottom:10px;">Lv.${result.currentLv} <span style="font-size:12px; color:#aaa;">(${result.currentExp}/${result.nextExp})</span></div>
    VIT 基礎値: <span style="color:#6be6ff;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>
    EXP 獲得: <span style="color:#5ce6e6;">+${result.actualExpGain}</span>
  `;
  
  const prog = Math.floor((result.currentExp / result.nextExp) * 100);
  gainHtml += `<div style="width:100%; background:#111; border:1px solid #4a3b26; height:8px; margin-top:8px; border-radius:4px; overflow:hidden;"><div style="width:${prog}%; background:#6be6ff; height:100%;"></div></div>`;
  if (result.leveledUp) gainHtml += `<div style="color:#ffd166; font-weight:bold; font-size:16px; margin-top:5px;">🎉 LEVEL UP!</div>`;

  document.getElementById('ch-res-gained').innerHTML = gainHtml;
  document.getElementById('ch-res-newrecord').style.display = isNewRecord ? 'block' : 'none';

  // 1秒ほど余韻を残してからリザルトを出す
  setTimeout(() => {
    showView('result');
    isProcessing = false;
  }, 1000);
}