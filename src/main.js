// src/main.js
import { simulateBattle } from './battle/battleCalc.js';
import { generateFloorData } from './battle/enemyGen.js';

const player = { str: 25, vit: 20, agi: 15, lck: 10, floor: 1 };

const elStr = document.getElementById('val-str');
const elVit = document.getElementById('val-vit');
const elAgi = document.getElementById('val-agi');
const elLck = document.getElementById('val-lck');

const elFloorHeader = document.getElementById('floor-header');
const elStageName = document.getElementById('stage-name');
const elRecStats = document.getElementById('rec-stats');
const elDropList = document.getElementById('drop-list');

const btnChallenge = document.getElementById('btn-challenge');
const modalBattle = document.getElementById('battle-modal-overlay');
const logContainer = document.getElementById('battle-log-container');
const resultText = document.getElementById('battle-result-text');
const btnCloseBattle = document.getElementById('btn-close-battle');

// GUI要素
const uiP_hp = document.getElementById('ui-p-hp');
const uiP_hpTxt = document.getElementById('ui-p-hp-txt');
const uiP_gauge = document.getElementById('ui-p-gauge');
const uiE_name = document.getElementById('ui-e-name');
const uiE_hp = document.getElementById('ui-e-hp');
const uiE_hpTxt = document.getElementById('ui-e-hp-txt');
const uiE_gauge = document.getElementById('ui-e-gauge');
const guiContainer = document.getElementById('battle-gui-container');

// バトルアニメーション用変数
let animationId = null;

function init() {
  updateStatusUI();
  updateFloorUI(player.floor);
  setupTabNavigation();
}

function updateStatusUI() {
  elStr.textContent = player.str;
  elVit.textContent = player.vit;
  elAgi.textContent = player.agi;
  elLck.textContent = player.lck;
}

function updateFloorUI(floorNum) {
  const floorData = generateFloorData(floorNum);
  elFloorHeader.textContent = `第 ${floorData.floor} 層`;
  elStageName.textContent = floorData.stageName;
  elRecStats.textContent = `推奨: STR ${floorData.recommended.str} / VIT ${floorData.recommended.vit} / AGI ${floorData.recommended.agi}`;
  elDropList.innerHTML = '';
  floorData.drops.forEach(drop => {
    const li = document.createElement('li');
    li.textContent = `${drop.name} (${drop.prob}%)`;
    if(drop.isCollection) li.style.color = "#ff6b6b";
    elDropList.appendChild(li);
  });
}

// ⚔️ バトル実行＆アニメーション再生
btnChallenge.addEventListener('click', () => {
  const floorData = generateFloorData(player.floor);
  const result = simulateBattle(player, floorData.enemies);
  
  logContainer.innerHTML = '';
  resultText.textContent = '';
  modalBattle.style.display = 'flex';
  btnCloseBattle.style.display = 'none';

  // --- アニメーションの再生準備 ---
  let currentFrame = 0;
  let eventIndex = 0;
  
  // 描画用の内部状態
  let pMaxHp = 1, pHp = 1, eMaxHp = 1, eHp = 1;
  let pGaugeVal = 0, eGaugeVal = 0;
  let currentEnemyAgi = 0;
  
  // 描画ループ関数
  function renderLoop() {
    // スピード倍率（2にすると2倍速になる）
    const speed = 2; 
    currentFrame += speed;

    // 現在のフレームに到達したイベントを処理
    while (eventIndex < result.events.length && result.events[eventIndex].frame <= currentFrame) {
      const ev = result.events[eventIndex];
      
      if (ev.type === 'start') {
        pMaxHp = ev.playerMaxHp; pHp = pMaxHp;
        eMaxHp = ev.enemy.maxHp; eHp = eMaxHp;
        uiE_name.textContent = ev.enemy.name;
        currentEnemyAgi = ev.enemy.agi;
      } 
      else if (ev.type === 'next_enemy') {
        eMaxHp = ev.enemy.maxHp; eHp = eMaxHp;
        uiE_name.textContent = ev.enemy.name;
        currentEnemyAgi = ev.enemy.agi;
        eGaugeVal = 0; // 敵のゲージリセット
      }
      else if (ev.type === 'attack') {
        // ダメージポップアップの生成
        const dmgText = document.createElement('div');
        dmgText.className = 'dmg-popup';
        dmgText.textContent = ev.damage;
        // 攻撃者によってポップアップの左右位置を変える
        if(ev.actor === 'player') {
          dmgText.style.right = '20%'; 
          eHp = ev.hpRemaining;
          pGaugeVal = 0; // 攻撃したらゲージリセット
        } else {
          dmgText.style.left = '20%';
          pHp = ev.hpRemaining;
          eGaugeVal = 0;
        }
        guiContainer.appendChild(dmgText);
        setTimeout(() => dmgText.remove(), 800); // アニメーション終了後に削除

        // ログエリアにもテキスト追加
        const pLog = document.createElement('div');
        pLog.textContent = `[${Math.floor(ev.frame/60)}s] ${ev.actor === 'player' ? 'プレイヤー' : '敵'}の攻撃！ ${ev.damage} ダメージ`;
        pLog.style.color = ev.actor === 'player' ? '#5ce6e6' : '#ff6b6b';
        logContainer.appendChild(pLog);
        logContainer.scrollTop = logContainer.scrollHeight;
      }
      else if (ev.type === 'stopper') {
        eGaugeVal = 1000; // 割り込み
      }
      eventIndex++;
    }

    // ゲージの上昇アニメーション（1000でMAX）
    pGaugeVal += player.agi * speed;
    eGaugeVal += currentEnemyAgi * speed;
    if(pGaugeVal > 1000) pGaugeVal = 1000;
    if(eGaugeVal > 1000) eGaugeVal = 1000;

    // HPとゲージのDOM更新
    uiP_hp.style.width = `${Math.max(0, (pHp / pMaxHp) * 100)}%`;
    uiP_hpTxt.textContent = `${Math.max(0, pHp)} / ${pMaxHp}`;
    uiP_gauge.style.width = `${(pGaugeVal / 1000) * 100}%`;

    uiE_hp.style.width = `${Math.max(0, (eHp / eMaxHp) * 100)}%`;
    uiE_hpTxt.textContent = `${Math.max(0, eHp)} / ${eMaxHp}`;
    uiE_gauge.style.width = `${(eGaugeVal / 1000) * 100}%`;

    // 終了判定
    if (currentFrame >= result.totalFrames || eventIndex >= result.events.length) {
      btnCloseBattle.style.display = 'block';
      if (result.isWin) {
        resultText.textContent = `🎉 勝利！ タイム: ${result.clearTime}`;
        resultText.style.color = '#ffd166';
        player.floor++; 
      } else {
        resultText.textContent = `💀 敗北...`;
        resultText.style.color = '#ff6b6b';
      }
      cancelAnimationFrame(animationId);
      return;
    }

    animationId = requestAnimationFrame(renderLoop);
  }

  // アニメーション開始
  animationId = requestAnimationFrame(renderLoop);
});

btnCloseBattle.addEventListener('click', () => {
  modalBattle.style.display = 'none';
  if(animationId) cancelAnimationFrame(animationId);
  updateFloorUI(player.floor); 
});

function setupTabNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.getAttribute('data-target')).classList.add('active');
    });
  });
}

init();
