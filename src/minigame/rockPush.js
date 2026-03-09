// src/minigame/rockPush.js
import { savePersonalBest, getPersonalBest } from '../firebase.js';
import { applyMinigameResult, getLevelMultiplier, getRequiredExp } from './minigameCore.js';

// --- ランク定義 (CDのEXPを15に統一) ---
const RANKS =[
  { name: "S", timeLimit: 5.0, strBase: 7, exp: 30, color: "#ffeb85" },
  { name: "A", timeLimit: 6.5, strBase: 6, exp: 25, color: "#ff6b6b" },
  { name: "B", timeLimit: 8.5, strBase: 5, exp: 20, color: "#5ce6e6" },
  { name: "C", timeLimit: 12.0, strBase: 4, exp: 15, color: "#94ff6b" },
  { name: "D", timeLimit: Infinity, strBase: 3, exp: 15, color: "#aaa" }
];

let playerRef = null;
const TOTAL_TAPS = 50;
let remainingTaps = 0;
let startTime = 0;
let timerInterval = null;
let lastTapTime = 0;
let isTimerRunning = false;
let dom = {};

export function initRockPush(playerObj) {
  playerRef = playerObj;
  
  // DOM取得
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
    rankBtn: document.getElementById('rp-btn-ranking') // 追加
  };

  // イベントリスナー
  dom.btnStart.addEventListener('click', startGame);
  dom.btnRetry.addEventListener('click', startGame);
  dom.btnClose.addEventListener('click', () => { dom.overlay.style.display = 'none'; });
  
  // ランキングボタン（特訓タブのランキングへ遷移させる想定）
  if(dom.rankBtn) {
    dom.rankBtn.addEventListener('click', () => {
      dom.overlay.style.display = 'none';
      document.querySelector('[data-target="tab-ranking"]').click(); // ランキングタブを擬似クリック
    });
  }

  // タップ処理
  const handleTap = (e) => {
    if (e.type === 'touchstart') e.preventDefault();
    if (e.touches && e.touches.length > 1) return;

    const now = Date.now();
    if (now - lastTapTime < 20) return;
    lastTapTime = now;

    if (remainingTaps > 0) {
      if (!isTimerRunning) {
        startTimer();
      }
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
  
  // 現在のSTRレベル情報の表示更新（説明画面などにLvを表示する場合用）
  // 今回は割愛しますが、必要ならここで dom 更新
  
  // 自己ベスト取得
  const best = await getPersonalBest(playerRef.name, "rockPush");
  dom.bestText.textContent = best ? `${best.toFixed(2)} 秒` : "記録なし";
}

function showView(viewName) {
  dom.viewInfo.style.display = viewName === 'info' ? 'flex' : 'none';
  dom.viewPlay.style.display = viewName === 'play' ? 'flex' : 'none';
  dom.viewResult.style.display = viewName === 'result' ? 'flex' : 'none';
}

function startGame() {
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
  startTime = Date.now();
  dom.timerText.style.color = "#5ce6e6";
  timerInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    dom.timerText.textContent = elapsed.toFixed(2);
  }, 10);
}

async function finishGame() {
  clearInterval(timerInterval);
  const time = (Date.now() - startTime) / 1000;
  
  // ランク判定
  let rankIndex = RANKS.findIndex(r => time < r.timeLimit);
  if(rankIndex === -1) rankIndex = RANKS.length - 1;
  const rank = RANKS[rankIndex];

  // 次のランクまでの秒数
  let nextRankStr = "最高ランク！";
  if (rankIndex > 0) {
    const nextRank = RANKS[rankIndex - 1];
    const diff = time - nextRank.timeLimit;
    nextRankStr = `次の[${nextRank.name}]まで あと ${diff.toFixed(2)} 秒`;
  }

  // ★ここで共通ロジックを使ってステータス反映！
  const result = applyMinigameResult(playerRef, 'str', rank.exp, rank.strBase);

  // ヘッダーUI更新
  document.getElementById('val-str').textContent = playerRef.str;
  savePlayerData(playerRef);
  // 自己ベスト更新
  const isNewRecord = await savePersonalBest(playerRef.name, "rockPush", time);

  // リザルト表示
  document.getElementById('rp-res-time').textContent = time.toFixed(2) + " 秒";
  document.getElementById('rp-res-rank').textContent = rank.name;
  document.getElementById('rp-res-rank').style.color = rank.color;
  document.getElementById('rp-res-next').textContent = nextRankStr;
  
  // 獲得情報の詳細表示
  let gainHtml = `STR 基礎値: <span style="color:#ff6b6b;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>` +
                 `EXP 獲得: <span style="color:#5ce6e6;">+${rank.exp}</span>`;
  
  if (result.leveledUp) {
    gainHtml += `<br><span style="color:#ffd166; font-weight:bold; font-size:16px;">🎉 ミニゲームLv UP! -> Lv.${result.currentLv}</span>`;
  } else {
    // 次のレベルまでバーを表示してもいいかも
    const progress = Math.floor((result.currentExp / result.nextExp) * 100);
    gainHtml += `<br><div style="width:100%; background:#333; height:4px; margin-top:5px;"><div style="width:${progress}%; background:#5ce6e6; height:100%;"></div></div>`;
  }

  document.getElementById('rp-res-gained').innerHTML = gainHtml;

  if (isNewRecord) {
    document.getElementById('rp-res-newrecord').style.display = 'block';
  } else {
    document.getElementById('rp-res-newrecord').style.display = 'none';
  }

  showView('result');
}
