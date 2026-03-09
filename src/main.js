// src/main.js
import { simulateBattle } from './battle/battleCalc.js';
import { generateFloorData } from './battle/enemyGen.js';
import { initRockPush, openRockPushModal } from './minigame/rockPush.js';
import { loginOrRegister, savePlayerData, getRankingData, getFastestRecord } from './firebase.js';
import { getRequiredExp, getLevelMultiplier } from './minigame/minigameCore.js';

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

let player = null; // ログイン成功後にデータが入る

// ==========================================
// 🛡️ 入力チェック（インジェクション対策と文字数制限）
// ==========================================
function getByteLength(str) {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    // 半角英数字や半角カナなどは1、それ以外（漢字やひらがな）は2としてカウント
    if ((c >= 0x0 && c < 0x81) || (c === 0xf8f0) || (c >= 0xff61 && c < 0xffa0) || (c >= 0xf8f1 && c < 0xf8f4)) {
      count += 1;
    } else {
      count += 2;
    }
  }
  return count;
}

function sanitizeUsername(str) {
  // FirestoreのドキュメントIDに使えない文字（ / . #[ ] $ ）やHTMLタグ(< >)を削除
  return str.replace(/[/#\.\[\]\$<>]/g, '').trim();
}

// ==========================================
// 👁️ パスワードの表示/非表示トグル
// ==========================================
const pinInput = document.getElementById('login-pin');
const btnTogglePin = document.getElementById('btn-toggle-pin');
btnTogglePin.addEventListener('click', () => {
  if (pinInput.type === 'password') {
    pinInput.type = 'text';
    btnTogglePin.textContent = '🙈';
  } else {
    pinInput.type = 'password';
    btnTogglePin.textContent = '👁️';
  }
});

// ==========================================
// 🚪 ログイン処理
// ==========================================
document.getElementById('btn-login').addEventListener('click', async () => {
  const rawUsername = document.getElementById('login-username').value;
  const pin = pinInput.value;
  const errorEl = document.getElementById('login-error');
  const btnLogin = document.getElementById('btn-login');

  // サニタイズと文字数チェック
  const username = sanitizeUsername(rawUsername);
  
  if (!username) {
    errorEl.textContent = "ユーザー名を入力してください";
    return;
  }
  if (getByteLength(username) > 12) {
    errorEl.textContent = "ユーザー名が長すぎます（半角12文字まで）";
    return;
  }
  if (!/^\d{4}$/.test(pin)) {
    errorEl.textContent = "PINは数字4桁で入力してください";
    return;
  }

  btnLogin.textContent = "通信中...";
  errorEl.textContent = "";

  try {
    const res = await loginOrRegister(username, pin);

    if (res.success) {
      player = res.data;
      document.getElementById('modal-login').style.display = 'none'; // ログイン画面を消す
      document.querySelector('.username').textContent = player.name; // ヘッダーの名前更新
      init(); // ⚠️ ここで初めてゲームを初期化する！
    } else {
      errorEl.textContent = res.message;
      btnLogin.textContent = "ゲームスタート";
    }
  } catch (err) {
    console.error(err);
    errorEl.innerHTML = "通信エラーが発生しました。";
    btnLogin.textContent = "ゲームスタート";
  }
});

// ==========================================
// 🎮 ゲーム初期化とUI更新
// ==========================================
function init() {
  updateStatusUI();
  updateTrainingUI();
  updateFloorUI(player.floor);
  setupTabNavigation();
  player.updateTrainingUI = updateTrainingUI; 
  initRockPush(player);

  // ◀ ▶ ボタンのイベント設定
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (player.floor > 1) {
      player.floor--;
      updateFloorUI(player.floor);
    }
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    // 実際にクリアした階層までしか進めないようにする
    if (player.floor < player.maxClearedFloor) { 
      player.floor++;
      updateFloorUI(player.floor);
    }
  });
}

function updateStatusUI() {
  elStr.textContent = player.str;
  elVit.textContent = player.vit;
  elAgi.textContent = player.agi;
  elLck.textContent = player.lck;
}

// 階層UI更新関数（Firebaseから初クリア者を取得して表示）
async function updateFloorUI(floorNum) {
  const floorData = generateFloorData(floorNum);
  
  elFloorHeader.textContent = `第 ${floorData.floor} 層`;
  elStageName.textContent = floorData.stageName;
  elRecStats.textContent = `推奨: STR ${floorData.recommended.str} / VIT ${floorData.recommended.vit} / AGI ${floorData.recommended.agi}`;
  
  // ▼ ◀ ▶ ボタンの有効/無効切り替え
  document.getElementById('btn-prev').className = floorNum <= 1 ? 'btn-arrow disabled' : 'btn-arrow';
  document.getElementById('btn-next').className = floorNum >= player.maxClearedFloor ? 'btn-arrow disabled' : 'btn-arrow';

  // ▼ Firebaseから「その階層の最速クリア者」を取得して表示
  // ※ここでは仮に、Firebaseから取得する処理を入れる
  const record = await getFastestRecord(floorNum); // 新規関数
  if (record) {
    document.getElementById('clear-record').innerHTML = 
      `💡 <span class="highlight-text">${record.name}</span> がこの層を初クリアしました<br>` +
      `タイム: ${record.time} / STR ${record.str}, VIT ${record.vit}, AGI ${record.agi}, LCK ${record.lck}`;
  } else {
    document.getElementById('clear-record').innerHTML = "💡 まだクリア者がいません！";
  }
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
    const speed = 1; 
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
          // 未クリアの階層を突破した場合のみ保存
          if (player.floor >= player.maxClearedFloor) {
              player.maxClearedFloor = player.floor + 1;
              saveClearRecord(player, player.floor, result.clearTime);
          }
          player.floor++; 
          savePlayerData(player);
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
  const stats = ['str', 'vit', 'agi', 'lck'];
  const totalLv = stats.reduce((sum, s) => sum + player.lv[s], 0); // 合計Lv計算
  
  stats.forEach(s => {
    const level = player.lv[s];
    const exp = player.exp[s];
    const nextExp = getRequiredExp(level);
    const progress = (exp / nextExp) * 100;
    
    // ★現在の倍率を取得 (minigameCoreから)
    const mult = getLevelMultiplier(level, totalLv);

    // 数値の更新
    document.getElementById(`ui-base-${s}`).textContent = player[s];
    document.getElementById(`ui-lv-${s}`).textContent = level;
    document.getElementById(`ui-exp-txt-${s}`).textContent = `${exp}/${nextExp}`;
    document.getElementById(`ui-mult-${s}`).textContent = mult.toFixed(2); // 倍率表示
    
    // バーの更新
    const bar = document.getElementById(`ui-exp-bar-${s}`);
    if (bar) bar.style.width = `${progress}%`;
  });
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
// 👑 ランキングモーダルへの実データ反映
// ==========================================
const modalRanking = document.getElementById('modal-ranking-overlay');
const rankingTitle = document.getElementById('ranking-modal-title');
const rankingList = document.getElementById('ranking-list-container');

document.querySelectorAll('.btn-show-ranking').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const rankId = e.currentTarget.getAttribute('data-rank-id');
    const title = e.currentTarget.textContent.replace(/[👑💪🛡️⚡🍀🪨]/g, '').trim(); 
    
    rankingTitle.textContent = title;
    rankingList.innerHTML = '<p style="text-align:center; color:#aaa; font-size:12px; margin-top:20px;">データ取得中...</p>';
    modalRanking.style.display = 'flex';

    // ▼ Firebaseから本物のランキングデータを取得！
    const data = await getRankingData(rankId);
    
    if (data.length === 0) {
      rankingList.innerHTML = '<p style="text-align:center; color:#aaa; font-size:12px;">まだ記録がありません</p>';
      return;
    }

    let html = '';
    const colors =["#ffd700", "#c0c0c0", "#cd7f32", "#aaa"]; // 1位金, 2位銀, 3位銅, 4位以降グレー
    
    data.forEach((item, index) => {
      const color = index < 3 ? colors[index] : colors[3];
      const bg = index < 3 ? `rgba(${index===0?'255,215,0':index===1?'192,192,192':'205,127,50'}, 0.15)` : 'rgba(0,0,0,0.3)';
      
      // 値のフォーマット（階層なら「〇層」、レベルなら「Lv.〇」など）
      let displayScore = item.score;
      if(rankId === 'floor') displayScore += ' 層';
      else if(rankId === 'totalLv') displayScore = 'Lv.' + displayScore;
      
      html += `
        <div style="display:flex; justify-content:space-between; padding:10px; margin-bottom:5px; border-bottom:1px solid #4a3b26; background:${bg}; border-left:3px solid ${color};">
          <span style="font-weight:bold; color:${color};">${index + 1}位. ${item.name}</span>
          <span style="font-weight:bold; color:#fff;">${displayScore}</span>
        </div>
      `;
    });
    
    rankingList.innerHTML = html;
  });
});
