// src/minigame/slot.js
import { savePersonalBest, getPersonalBest, savePlayerData } from '../firebase.js';
import { applyMinigameResult } from './minigameCore.js';
import { playSound } from '../audio.js';

let playerRef = null, onUpdateCallback = null;
let dom = {};

const SYMBOL_SIZE = 70; // px
const NUM_SYMBOLS = 6;
const BASE_SCORE = 50;

// 絵柄: 💎(ダイヤ)x1, 💰(コイン)x2, 💀(ドクロ)x3
const SYMBOLS =['💎', '💰', '💀', '💰', '💀', '💀'];

let isPlaying = false, isProcessing = false;
let animationId = null;
let lastFrameTime = 0;

let currentScore = 0;
let hp = 3;
let spinCount = 0;
let currentMultiplier = 1.0;

// リール状態
let reels =[
  { y: 0, speed: 0, isStopped: true, result: null, dom: null },
  { y: 0, speed: 0, isStopped: true, result: null, dom: null },
  { y: 0, speed: 0, isStopped: true, result: null, dom: null }
];

export function initSlot(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateCallback = updateUIFn;
  
  dom = {
    overlay: document.getElementById('modal-slot'),
    viewInfo: document.getElementById('sl-view-info'),
    viewPlay: document.getElementById('sl-view-play'),
    viewResult: document.getElementById('sl-view-result'),
    btnStart: document.getElementById('sl-btn-start'),
    btnRetry: document.getElementById('sl-btn-retry'),
    btnReset: document.getElementById('sl-btn-reset'),
    btnQuit: document.getElementById('sl-btn-quit'),
    btnClose: document.getElementById('sl-btn-close'),
    hp: document.getElementById('sl-hp'),
    score: document.getElementById('sl-score'),
    spinCount: document.getElementById('sl-spin-count'),
    multiplier: document.getElementById('sl-multiplier'),
    msg: document.getElementById('sl-message'),
    bestText: document.getElementById('sl-best-time')
  };

  reels[0].dom = document.getElementById('sl-reel-0');
  reels[1].dom = document.getElementById('sl-reel-1');
  reels[2].dom = document.getElementById('sl-reel-2');

  const btns =[document.getElementById('sl-stop-0'), document.getElementById('sl-stop-1'), document.getElementById('sl-stop-2')];

  dom.btnStart.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnRetry.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnReset.addEventListener('click', () => { if(!isProcessing) startGame(); });
  dom.btnQuit.addEventListener('click', () => { isPlaying = false; showView('info'); });
  dom.btnClose.addEventListener('click', () => { dom.overlay.style.display = 'none'; });

  window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    const k = e.key.toLowerCase();
    if (k === 'r' && (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex')) {
      startGame();
    }
    // PC用に A, S, D キーでも止められるようにする
    if (dom.viewPlay.style.display === 'flex') {
      if (k === 'a') stopReel(0, btns[0]);
      if (k === 's') stopReel(1, btns[1]);
      if (k === 'd') stopReel(2, btns[2]);
    }
  });

  btns.forEach((btn, i) => {
    const onTouch = (e) => { e.preventDefault(); stopReel(i, btn); };
    btn.addEventListener('mousedown', onTouch);
    btn.addEventListener('touchstart', onTouch, { passive: false });
  });
}

export async function openSlotModal() {
  dom.overlay.style.display = 'flex';
  showView('info');
  const best = await getPersonalBest(playerRef.name, "slot");
  dom.bestText.textContent = best ? Math.floor(best).toString() + " pt" : "記録なし";
}

function showView(view) {
  dom.viewInfo.style.display = view === 'info' ? 'flex' : 'none';
  dom.viewPlay.style.display = view === 'play' ? 'flex' : 'none';
  dom.viewResult.style.display = view === 'result' ? 'flex' : 'none';
}

function updateHpUI() {
  dom.hp.textContent = "❤️".repeat(hp) + "🖤".repeat(3 - hp);
}

function startGame() {
  if(animationId) cancelAnimationFrame(animationId);
  showView('play');
  
  isPlaying = true;
  isProcessing = false;
  currentScore = 0;
  hp = 3;
  spinCount = 0;
  dom.score.textContent = "0";
  dom.msg.textContent = "";
  
  updateHpUI();
  startNextSpin();
  
  lastFrameTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

function startNextSpin() {
  spinCount++;
  // 複利で1.1倍ずつ上昇
  currentMultiplier = Math.pow(1.1, spinCount - 1);
  
  dom.spinCount.textContent = spinCount;
  dom.multiplier.textContent = `x${currentMultiplier.toFixed(2)}`;
  dom.msg.textContent = "";

  // 速度：最初は 420px/s(1周1秒)。スピンごとに10%速くなる
  const speed = 420 * Math.pow(1.1, spinCount - 1);

  reels.forEach((r, i) => {
    // シンボルをシャッフルしてDOMに詰める (2周分=12個)
    let shuffled = [...SYMBOLS].sort(() => Math.random() - 0.5);
    r.symbols = shuffled;
    r.dom.innerHTML = '';
    
    // 継ぎ目なくループさせるため、シャッフルした配列を2回繰り返す
    [...shuffled, ...shuffled].forEach(sym => {
      const el = document.createElement('div');
      el.textContent = sym;
      el.style.height = `${SYMBOL_SIZE}px`;
      el.style.lineHeight = `${SYMBOL_SIZE}px`;
      el.style.fontSize = '40px';
      el.style.textAlign = 'center';
      r.dom.appendChild(el);
    });

    r.y = 0;
    r.speed = speed;
    r.isStopped = false;
    r.result = null;
    
    // ボタンの見た目復元
    const btn = document.getElementById(`sl-stop-${i}`);
    btn.style.background = "linear-gradient(to bottom, #ff6b6b, #cc0000)";
    btn.style.color = "#fff";
  });
}

function stopReel(index, btnEl) {
  let r = reels[index];
  if (r.isStopped || !isPlaying || isProcessing) return;
  r.isStopped = true;
  playSound('click');
  
  btnEl.style.background = "linear-gradient(to bottom, #555, #222)";
  btnEl.style.color = "#aaa";
  
  // ピタッと止める処理（最も近いシンボルのY座標にスナップ）
  let snapIndex = Math.round(Math.abs(r.y) / SYMBOL_SIZE);
  if (snapIndex >= NUM_SYMBOLS) snapIndex = 0;
  
  r.y = -snapIndex * SYMBOL_SIZE;
  r.dom.style.transform = `translateY(${r.y}px)`;
  r.result = r.symbols[snapIndex]; 
  
  checkAllStopped();
}

function checkAllStopped() {
  if (reels.every(r => r.isStopped)) {
    evaluateResult();
  }
}

function evaluateResult() {
  isProcessing = true; // 演出中はボタンロック
  
  const r1 = reels[0].result;
  const r2 = reels[1].result;
  const r3 = reels[2].result;
  
  let skullCount =[r1, r2, r3].filter(x => x === '💀').length;
  
  if (skullCount > 0) {
    // ダメージ処理
    hp -= skullCount;
    playSound('error');
    updateHpUI();
    dom.msg.textContent = `💀 ドクロ ${skullCount}個でダメージ！`;
    dom.msg.style.color = '#ff6b6b';
    
    // 赤く光る演出
    reels.forEach(r => { if(r.result==='💀') r.dom.parentElement.style.borderColor = '#ff0000'; });
    
    if (hp <= 0) {
      setTimeout(() => finishGame(), 1000);
      return;
    }
  } else {
    // 役の判定
    if (r1 === r2 && r2 === r3) {
      playSound('win');
      let gained = 0;
      if (r1 === '💎') {
        gained = Math.floor(BASE_SCORE * currentMultiplier * 2);
        dom.msg.textContent = `💎 超大当り！ +${gained} pt`;
        dom.msg.style.color = '#ffeb85';
      } else if (r1 === '💰') {
        gained = Math.floor(BASE_SCORE * currentMultiplier * 1);
        dom.msg.textContent = `💰 大当り！ +${gained} pt`;
        dom.msg.style.color = '#5ce6e6';
      }
      currentScore += gained;
      dom.score.textContent = currentScore;
    } else {
      playSound('hit');
      dom.msg.textContent = "ハズレ...";
      dom.msg.style.color = '#aaa';
    }
  }

  // 1秒後に次のスピンへ
  setTimeout(() => {
    if (hp > 0 && isPlaying) {
      reels.forEach(r => r.dom.parentElement.style.borderColor = '#d4af37'); // 枠色リセット
      isProcessing = false;
      startNextSpin();
    }
  }, 1000);
}

function gameLoop(now) {
  if (!isPlaying) return;
  let dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  if (dt > 0.1) dt = 0.016; 

  reels.forEach(r => {
    if (!r.isStopped) {
      r.y -= r.speed * dt;
      // 1周分(420px)上にスクロールしたら0に戻して無限ループ
      if (r.y <= -SYMBOL_SIZE * NUM_SYMBOLS) {
        r.y += SYMBOL_SIZE * NUM_SYMBOLS; 
      }
      r.dom.style.transform = `translateY(${r.y}px)`;
    }
  });

  animationId = requestAnimationFrame(gameLoop);
}

async function finishGame() {
  isPlaying = false;
  isProcessing = true;
  if(animationId) cancelAnimationFrame(animationId);
  
  const finalScore = Math.floor(currentScore);
  
  // 飛来物ガードと同じ基準で計算
  const earnedLck = Math.floor(finalScore / 30) + 2;
  const earnedExp = Math.floor(finalScore / 6) + 15;

  const result = applyMinigameResult(playerRef, 'lck', earnedExp, earnedLck);
  
  if (onUpdateCallback) onUpdateCallback();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();

  await savePlayerData(playerRef);
  const isNewRecord = await savePersonalBest(playerRef.name, "slot", finalScore);

  dom.viewResult.querySelector('#sl-res-score').textContent = finalScore;
  
  let gainHtml = `
    <div style="font-size:16px; margin-bottom:10px;">Lv.${result.currentLv} <span style="font-size:12px; color:#aaa;">(${result.currentExp}/${result.nextExp})</span></div>
    LCK 基礎値: <span style="color:#ffd166;">+${result.actualBaseGain}</span> <span style="font-size:11px; color:#aaa;">(倍率 x${result.multiplier.toFixed(2)})</span><br>
    EXP 獲得: <span style="color:#5ce6e6;">+${earnedExp}</span>
  `;
  const prog = Math.floor((result.currentExp / result.nextExp) * 100);
  gainHtml += `<div style="width:100%; background:#111; border:1px solid #4a3b26; height:8px; margin-top:8px; border-radius:4px; overflow:hidden;"><div style="width:${prog}%; background:#ffd166; height:100%;"></div></div>`;
  if (result.leveledUp) gainHtml += `<div style="color:#ffd166; font-weight:bold; font-size:16px; margin-top:5px;">🎉 LEVEL UP!</div>`;

  document.getElementById('sl-res-gained').innerHTML = gainHtml;
  document.getElementById('sl-res-newrecord').style.display = isNewRecord ? 'block' : 'none';

  setTimeout(() => {
    showView('result');
    isProcessing = false;
  }, 1000);
}