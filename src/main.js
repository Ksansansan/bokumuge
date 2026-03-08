// src/main.js
import { simulateBattle } from './battle/battleCalc.js';
import { generateFloorData } from './battle/enemyGen.js';
import { initRockPush, openRockPushModal } from './minigame/rockPush.js';

// playerオブジェクトの定義（名前を追加）
const player = {
  name: "Ksansansan",
  str: 25, vit: 20, agi: 15, lck: 10,
  floor: 1,
  // ミニゲーム用データ
  exp: { str: 0, vit: 0, agi: 0, lck: 0 },
  lv:  { str: 1, vit: 1, agi: 1, lck: 1 }
};
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
  updateTrainingUI();
  updateFloorUI(player.floor);
  setupTabNavigation();
  initRockPush(player);
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
  
  // 【修正】logContainer の初期化を削除
  resultText.textContent = '';
  modalBattle.style.display = 'flex';
  btnCloseBattle.style.display = 'none';

  let currentFrame = 0;
  let eventIndex = 0;
  let pMaxHp = 1, pHp = 1, eMaxHp = 1, eHp = 1;
  let pGaugeVal = 0, eGaugeVal = 0;
  let currentEnemyAgi = 0;
  
  function renderLoop() {
    const speed = 2; 
    currentFrame += speed;

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
        eGaugeVal = 0; 
      }
      else if (ev.type === 'attack') {
        // ダメージポップアップの生成
        const dmgText = document.createElement('div');
        dmgText.className = 'dmg-popup';
        dmgText.textContent = ev.damage;
        
        if(ev.actor === 'player') {
          dmgText.style.right = '20%'; 
          eHp = ev.hpRemaining;
          pGaugeVal = 0; 
        } else {
          dmgText.style.left = '20%';
          pHp = ev.hpRemaining;
          eGaugeVal = 0;
        }
        guiContainer.appendChild(dmgText);
        setTimeout(() => dmgText.remove(), 800);
        
        // 【修正】文字ログ出力部分を削除
      }
      else if (ev.type === 'stopper') {
        eGaugeVal = 1000; 
      }
      eventIndex++;
    }

    pGaugeVal += player.agi * speed;
    eGaugeVal += currentEnemyAgi * speed;
    if(pGaugeVal > 1000) pGaugeVal = 1000;
    if(eGaugeVal > 1000) eGaugeVal = 1000;

    uiP_hp.style.width = `${Math.max(0, (pHp / pMaxHp) * 100)}%`;
    uiP_hpTxt.textContent = `${Math.max(0, pHp)} / ${pMaxHp}`;
    uiP_gauge.style.width = `${(pGaugeVal / 1000) * 100}%`;

    uiE_hp.style.width = `${Math.max(0, (eHp / eMaxHp) * 100)}%`;
    uiE_hpTxt.textContent = `${Math.max(0, eHp)} / ${eMaxHp}`;
    uiE_gauge.style.width = `${(eGaugeVal / 1000) * 100}%`;

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

document.getElementById('btn-play-rockpush').addEventListener('click', () => {
  openRockPushModal();
});

// ==========================================
// 🏋️ 特訓タブのUI更新
// ==========================================
function updateTrainingUI() {
  document.getElementById('ui-base-str').textContent = player.str;
  document.getElementById('ui-lv-str').textContent = player.lv.str;
  
  document.getElementById('ui-base-vit').textContent = player.vit;
  document.getElementById('ui-lv-vit').textContent = player.lv.vit;

  document.getElementById('ui-base-agi').textContent = player.agi;
  document.getElementById('ui-lv-agi').textContent = player.lv.agi;

  document.getElementById('ui-base-lck').textContent = player.lck;
  document.getElementById('ui-lv-lck').textContent = player.lv.lck;
}

// 大岩以外の未実装ミニゲームボタンを押したときの仮処理
const dummyGames =['daruma', 'chicken', 'guard', '1to20', 'command', 'clover', 'slot'];
dummyGames.forEach(id => {
  const btn = document.getElementById(`btn-play-${id}`);
  if(btn) {
    btn.addEventListener('click', () => {
      alert("この特訓は現在建設中です！（次回アップデートをお待ちください）");
    });
  }
});

// ==========================================
// 👑 ランキングモーダルの制御
// ==========================================
const modalRanking = document.getElementById('modal-ranking-overlay');
const rankingTitle = document.getElementById('ranking-modal-title');
const rankingList = document.getElementById('ranking-list-container');

// クラス btn-show-ranking が付いたすべてのボタン（特訓タブ内・順位タブ内両方）にイベント付与
document.querySelectorAll('.btn-show-ranking').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    // どのランキングを開いたか取得
    const rankId = e.currentTarget.getAttribute('data-rank-id');
    const title = e.currentTarget.textContent.replace('👑', '').trim(); // 絵文字などを除いたタイトル
    
    rankingTitle.textContent = title;
    rankingList.innerHTML = '<p style="text-align:center; color:#aaa; font-size:12px;">データ取得中...</p>';
    modalRanking.style.display = 'flex';

    // ⚠️ ここは将来的に firebase.js の getRanking(rankId) 等から取得する
    // 今回はFirebase連携前の「仮のランキング表示モック」です
    setTimeout(() => {
      // ランキング項目のHTML生成
      rankingList.innerHTML = `
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #4a3b26; background:rgba(255,215,0,0.15); border-left:3px solid #ffd700;">
          <span style="font-weight:bold; color:#ffd700;">1位. ゆうき</span>
          <span style="font-weight:bold;">${rankId === 'rockPush' ? '4.85 秒' : '記録データ'}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #4a3b26; background:rgba(192,192,192,0.1); border-left:3px solid #c0c0c0;">
          <span style="font-weight:bold; color:#c0c0c0;">2位. たかし</span>
          <span style="font-weight:bold;">${rankId === 'rockPush' ? '5.12 秒' : '記録データ'}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #4a3b26; background:rgba(205,127,50,0.1); border-left:3px solid #cd7f32;">
          <span style="font-weight:bold; color:#cd7f32;">3位. けんた</span>
          <span style="font-weight:bold;">${rankId === 'rockPush' ? '6.30 秒' : '記録データ'}</span>
        </div>
        <p style="font-size:11px; color:#aaa; text-align:center; margin-top:10px;">
          ※Firebase接続後にここに世界（身内）の順位が表示されます
        </p>
      `;
    }, 400); // ネットワーク通信を模した0.4秒の遅延
  });
});

init();
