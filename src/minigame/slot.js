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
  dom.btnReset.addEventListener('click', () => { 
    if(!isProcessing) { isPlaying = false; startGame(); } 
  });
  dom.btnQuit.addEventListener('click', () => { 
    isPlaying = false; showView('info'); 
  });
  dom.btnClose.addEventListener('click', () => { dom.overlay.style.display = 'none'; });

  window.addEventListener('keydown', (e) => {
    if (dom.overlay.style.display !== 'flex' || isProcessing) return;
    const k = e.key.toLowerCase();
    if (k === 'r' && (dom.viewPlay.style.display === 'flex' || dom.viewResult.style.display === 'flex')) {
      isPlaying = false;
      startGame();
    }
    // PC用ショートカット
    if (dom.viewPlay.style.display === 'flex') {
      if (k === 'a' || e.key === 'ArrowLeft') stopReel(0, btns[0]);
      if (k === 's' || e.key === 'ArrowDown') stopReel(1, btns[1]);
      if (k === 'd' || e.key === 'ArrowRight') stopReel(2, btns[2]);
    }
  });

  btns.forEach((btn, i) => {
    const onTouch = (e) => { 
      if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
      if (e.type === 'touchstart') e.preventDefault(); 
      stopReel(i, btn); 
    };
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
  // ★ 修正: hpがマイナスになってもエラーにならないよう Math.max(0, hp) で保護
  const displayHp = Math.max(0, hp);
  dom.hp.textContent = "❤️".repeat(displayHp) + "🖤".repeat(3 - displayHp);
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
  
  reels.forEach(r => {
    r.dom.parentElement.style.borderColor = '#d4af37';
    r.dom.innerHTML = '';
  });

  updateHpUI();
  startNextSpin();
  
  lastFrameTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

function startNextSpin() {
  spinCount++;
  
  // ★ 修正: 倍率を 1.1倍ずつの「加算（単利）」に変更 (1.0 -> 1.1 -> 1.2 -> 1.3...)
  currentMultiplier = 1.0 + ((spinCount - 1) * 0.1);
  
  dom.spinCount.textContent = spinCount;
  dom.multiplier.textContent = `x${currentMultiplier.toFixed(1)}`;
  dom.msg.textContent = "";

  // ★ 修正: リールの初速を大幅に緩和 (210px/s = 1周2秒) し、速度上昇も緩やかに
  const speed = 250 + (spinCount * 25);

  reels.forEach((r, i) => {
    let shuffled = [...SYMBOLS].sort(() => Math.random() - 0.5);
    r.symbols = shuffled;
    r.dom.innerHTML = '';
    
    // 描画用に3周分（18個）並べる（高速になっても途切れないように余裕を持たせる）
    [...shuffled, ...shuffled, ...shuffled].forEach(sym => {
      const el = document.createElement('div');
      el.textContent = sym;
      el.style.height = `${SYMBOL_SIZE}px`;
      el.style.lineHeight = `${SYMBOL_SIZE}px`;
      el.style.fontSize = '40px';
      el.style.textAlign = 'center';
      r.dom.appendChild(el);
    });

    // リールの初期位置をランダムにして、毎回バラバラの位置からスタートさせる
    const initialOffset = Math.floor(Math.random() * NUM_SYMBOLS) * SYMBOL_SIZE;
    r.y = -initialOffset - (SYMBOL_SIZE * NUM_SYMBOLS);
    r.speed = speed;
    r.isStopped = false;
    r.result = null;
    
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
  
  // y座標はマイナスなので絶対値を取り、シンボルサイズで割って四捨五入（もっとも近い絵柄）
  let snapIndex = Math.round(Math.abs(r.y) / SYMBOL_SIZE) % NUM_SYMBOLS;
  
  // 万が一限界を超えたら剰余をとる
  snapIndex = snapIndex % NUM_SYMBOLS;
  
  r.y = -(snapIndex * SYMBOL_SIZE);
  r.dom.style.transform = `translateY(${r.y}px)`;
  r.result = r.symbols[snapIndex]; 
  
  if (reels.every(reel => reel.isStopped)) {
    evaluateResult();
  }
}

function evaluateResult() {
  isProcessing = true; 
  
  const r1 = reels[0].result;
  const r2 = reels[1].result;
  const r3 = reels[2].result;
  
  const results = [r1, r2, r3];
  let skullCount = results.filter(x => x === '💀').length;
  let coinCount = results.filter(x => x === '💰').length;
  let diamondCount = results.filter(x => x === '💎').length;
  
  let gained = 0;
  let scoreMsg = "";

  // --- 1. まず役の判定を行う（ドクロがあっても計算する） ---
  if (diamondCount === 3) {
    gained = Math.floor(BASE_SCORE * currentMultiplier * 3);
    scoreMsg = `💎超大当り！ +${gained}pt`;
  } 
  else if (coinCount === 3) {
    gained = Math.floor(BASE_SCORE * currentMultiplier * 1);
    scoreMsg = `💰大当り！ +${gained}pt`;
  } 
  else if (diamondCount === 2) {
    gained = Math.floor(BASE_SCORE * currentMultiplier * 0.5);
    scoreMsg = `💎惜しい！ +${gained}pt`;
  }
  else if (coinCount === 2) {
    gained = Math.floor(BASE_SCORE * currentMultiplier * 0.2);
    scoreMsg = `💰惜しい！ +${gained}pt`;
  }

  // スコアを加算
  currentScore += gained;
  dom.score.textContent = currentScore;

  // --- 2. 次にドクロの判定とメッセージの構築 ---
  if (skullCount > 0) {
    hp -= skullCount;
    playSound('error');
    updateHpUI();
    
    let dmgMsg = `💀ダメージx${skullCount}!`;
    
    // スコア獲得がある場合は両方表示
    if (gained > 0) {
      dom.msg.textContent = `${scoreMsg} / ${dmgMsg}`;
    } else {
      dom.msg.textContent = dmgMsg;
    }
    dom.msg.style.color = '#ff6b6b';
    
    // ドクロのリールを赤枠にする
    reels.forEach(r => { 
      if(r.result === '💀') r.dom.parentElement.style.borderColor = '#ff0000'; 
    });
    
    if (hp <= 0) {
      setTimeout(() => finishGame(), 1000);
      return;
    }
  } else {
    // ドクロなしでスコア獲得した場合
    if (gained > 0) {
      playSound('win');
      dom.msg.textContent = scoreMsg;
      dom.msg.style.color = (diamondCount >= 2) ? '#ffeb85' : '#5ce6e6';
    } else {
      // 完全ハズレ
      playSound('error');
      dom.msg.textContent = "ハズレ...";
      dom.msg.style.color = '#aaa';
    }
  }

  // 1秒後に次のスピンへ
  setTimeout(() => {
    if (hp > 0 && isPlaying) {
      reels.forEach(r => r.dom.parentElement.style.borderColor = '#d4af37');
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
      r.y += r.speed * dt;
      // ループ処理 (NUM_SYMBOLS * SYMBOL_SIZE を超えたら位置を戻す)
      if (r.y >=0) {
        r.y -= SYMBOL_SIZE * NUM_SYMBOLS; 
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
  const earnedLck = Math.floor(finalScore / 25);
  const earnedExp = Math.floor(finalScore / 6);

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