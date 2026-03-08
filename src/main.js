// src/main.js
import { simulateBattle } from './battleCalc.js';
import { generateFloorData } from './enemyGen.js';

// ==========================================
// プレイヤーの初期ステータス（ハードコーディング）
// ==========================================
const player = {
  str: 25,
  vit: 20,
  agi: 15,
  lck: 10,
  floor: 1 // 現在の挑戦階層
};

// ==========================================
// DOM要素の取得
// ==========================================
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

// ==========================================
// 初期化・画面描画
// ==========================================
function init() {
  updateStatusUI();
  updateFloorUI(player.floor);
  setupTabNavigation();
}

// 画面上部のステータスバーを更新
function updateStatusUI() {
  elStr.textContent = player.str;
  elVit.textContent = player.vit;
  elAgi.textContent = player.agi;
  elLck.textContent = player.lck;
}

// 中央の階層データ（敵生成ロジックから取得）を更新
function updateFloorUI(floorNum) {
  const floorData = generateFloorData(floorNum);
  
  elFloorHeader.textContent = `第 ${floorData.floor} 層`;
  elStageName.textContent = floorData.stageName;
  elRecStats.textContent = `推奨: STR ${floorData.recommended.str} / VIT ${floorData.recommended.vit} / AGI ${floorData.recommended.agi}`;
  
  elDropList.innerHTML = '';
  floorData.drops.forEach(drop => {
    const li = document.createElement('li');
    li.textContent = `${drop.name} (${drop.prob}%)`;
    if(drop.isCollection) li.style.color = "#ff6b6b"; // レアドロップは色を変える
    elDropList.appendChild(li);
  });
}

// ==========================================
// ⚔️ バトル実行ロジック
// ==========================================
btnChallenge.addEventListener('click', () => {
  const floorData = generateFloorData(player.floor);
  
  // エンジンでバトルをシミュレーション（一瞬で終わる）
  const result = simulateBattle(player, floorData.enemies);
  
  // モーダルを表示して初期化
  logContainer.innerHTML = '';
  resultText.textContent = '';
  modalBattle.style.display = 'flex';
  btnCloseBattle.style.display = 'none'; // ログが流れている間は閉じられないようにする
  
  // 【演出】中学生がハラハラするように、ログを0.05秒ごとに1行ずつ追加する
  let i = 0;
  const interval = setInterval(() => {
    if (i < result.log.length) {
      const p = document.createElement('div');
      p.textContent = result.log[i];
      
      // テキスト内容によって色分け（視認性アップ）
      if(result.log[i].includes('プレイヤーの攻撃')) p.style.color = '#5ce6e6';
      else if(result.log[i].includes('ダメージ！')) p.style.color = '#ff6b6b';
      else if(result.log[i].includes('撃破！')) p.style.color = '#ffd166';
      else p.style.color = '#aaa';
      
      p.style.marginBottom = '6px';
      p.style.borderBottom = '1px dashed #333';
      
      logContainer.appendChild(p);
      logContainer.scrollTop = logContainer.scrollHeight; // 自動で一番下へスクロール
      i++;
    } else {
      // ログ出力完了
      clearInterval(interval);
      btnCloseBattle.style.display = 'block'; // 閉じるボタン表示
      
      if (result.isWin) {
        resultText.textContent = `🎉 勝利！ タイム: ${result.clearTime}`;
        resultText.style.color = '#ffd166';
        player.floor++; // 勝ったら次の階層へ
      } else {
        resultText.textContent = `💀 敗北...`;
        resultText.style.color = '#ff6b6b';
      }
    }
  }, 50); // 50ミリ秒間隔で流す
});

// モーダルを閉じる
btnCloseBattle.addEventListener('click', () => {
  modalBattle.style.display = 'none';
  updateFloorUI(player.floor); // 階層UIを更新（勝っていたら第2層になる）
});

// ==========================================
// タブ切り替えロジック
// ==========================================
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

// ゲーム起動！
init();
