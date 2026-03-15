// src/main.js
import { simulateBattle } from './battle/battleCalc.js';
import { generateFloorData, BIOMES, getDropStatType } from './battle/enemyGen.js';
import { loginOrRegister, savePlayerData, getRankingData, checkAndSaveFirstClear, getFirstClearRecord, getPersonalBest } from './firebase.js';
import { getRequiredExp, getLevelMultiplier } from './minigame/minigameCore.js';
import { initRockPush, openRockPushModal } from './minigame/rockPush.js';
import { initDaruma, openDarumaModal } from './minigame/daruma.js';
import { initChicken, openChickenModal } from './minigame/chicken.js';
import { initGuard, openGuardModal } from './minigame/guard.js';
import { init1to20, open1to20Modal } from './minigame/1to20.js';
import { playSound } from './audio.js';

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
const uiE_char = document.getElementById('ui-e-char');
// バトルアニメーション用変数
let animationId = null;

let player = null; // ログイン成功後にデータが入る

// ★インフレ対応：数値をK, M, Bにする関数
export function formatNumber(num) {
  if (num < 1000) return Math.floor(num).toString();
  const suffixes =["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  const exponent = Math.floor(Math.log10(num) / 3);
  const suffix = suffixes[exponent] || "";
  const shortValue = num / Math.pow(10, exponent * 3);
  return shortValue.toFixed(3) + suffix;
}

// ★図鑑のランクを取得する関数
function getCollectionRank(count) {
  if (count >= 81) return { rank: 5, name: "マスター", color: "#ff6b6b" };
  if (count >= 27) return { rank: 4, name: "金", color: "#ffd700" };
  if (count >= 9) return { rank: 3, name: "銀", color: "#c0c0c0" };
  if (count >= 3) return { rank: 2, name: "銅", color: "#cd7f32" };
  if (count >= 1) return { rank: 1, name: "木", color: "#8c7a65" };
  return { rank: 0, name: "未取得", color: "#555" };
}

// ★戦闘用に「バフ込みのステータス」を計算する関数
function getBattleStats(p) {
  let bonuses = { STR: 0, VIT: 0, AGI: 0, LCK: 0, ALL: 0 };
  
  // 図鑑バフの計算（最高到達階層までのアイテムをチェック）
  for (let f = 1; f <= (p.maxClearedFloor || 1); f += 5) {
    const floorData = generateFloorData(f);
    const g = Math.ceil(f / 5);
    
    const mobCount = p.inventory?.[floorData.biome.mobDrop] || 0;
    bonuses[getDropStatType(f, false)] += g * getCollectionRank(mobCount).rank;

    const bossCount = p.inventory?.[floorData.biome.bossDrop] || 0;
    bonuses['ALL'] += g * getCollectionRank(bossCount).rank;
  }

  return {
    str: Math.floor(p.str * (1 + (bonuses.STR + bonuses.ALL) / 100)),
    vit: Math.floor(p.vit * (1 + (bonuses.VIT + bonuses.ALL) / 100)),
    agi: Math.floor(p.agi * (1 + (bonuses.AGI + bonuses.ALL) / 100)),
    lck: Math.floor(p.lck * (1 + (bonuses.LCK + bonuses.ALL) / 100))
  };
}

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
  updateCollectionUI();
  setupTabNavigation();
  player.updateStatusUI = updateStatusUI; 
  player.updateTrainingUI = updateTrainingUI; 
  initRockPush(player, updateTrainingUI); 
  initDaruma(player, updateTrainingUI);
  initChicken(player, updateTrainingUI);
  initGuard(player, updateTrainingUI); 
  init1to20(player, updateTrainingUI);
  // ◀ ▶ ボタン
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (player.floor > 1) {
      player.floor--;
      updateFloorUI(player.floor);
    }
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    // 自分が今までクリアした最高階層（maxClearedFloor）まで移動可能
    if (player.floor < (player.maxClearedFloor || 1)) {
      player.floor++;
      updateFloorUI(player.floor);
    }
  });
}

function updateStatusUI() {
  const battleStats = getBattleStats(player);
  player.battleStats = battleStats; // ★バフ込みの数値を保持（保存・ランキング用）

  document.getElementById('val-str').textContent = formatNumber(battleStats.str);
  document.getElementById('val-vit').textContent = formatNumber(battleStats.vit);
  document.getElementById('val-agi').textContent = formatNumber(battleStats.agi);
  document.getElementById('val-lck').textContent = formatNumber(battleStats.lck);
}

// 階層UI更新関数（Firebaseから初クリア者を取得して表示）
async function updateFloorUI(floorNum) {
  const floorData = generateFloorData(floorNum);
  
  document.getElementById('floor-header').textContent = `第 ${floorData.floor} 層`;
  document.getElementById('stage-name').textContent = floorData.stageName;

  // --- 推奨ステータスの色分け ---
  const rec = floorData.recommended;
  document.getElementById('rec-stats').innerHTML = `
    推奨: <span style="color:#ff6b6b;">STR ${formatNumber(rec.str)}</span> / 
    <span style="color:#6be6ff;">VIT ${formatNumber(rec.vit)}</span> / 
    <span style="color:#94ff6b;">AGI ${formatNumber(rec.agi)}</span>
  `;
  // ★【重要】ドロップ情報の表示
  const dropList = document.getElementById('drop-list');
  dropList.innerHTML = `
    <li>装備ガチャチケット (ボス100%)</li>
    <li>${floorData.biome.mobDrop} [図鑑] (雑魚20%)</li>
    <li>${floorData.biome.bossDrop} [図鑑] (ボス30%)</li>
  `;
  // ◀ ▶ ボタン制御
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  prevBtn.className = (floorNum <= 1) ? 'btn-arrow disabled' : 'btn-arrow';
  nextBtn.className = (floorNum >= (player.maxClearedFloor || 1)) ? 'btn-arrow disabled' : 'btn-arrow';

  // --- 初クリア者情報の表示（色分け ＆ LCK追加） ---
  const recordEl = document.getElementById('clear-record');
  recordEl.innerHTML = "💡 記録を確認中...";

  try {
    const record = await getFirstClearRecord(floorNum);
    if (record) {
      recordEl.innerHTML = `
        <div style="margin-bottom:5px;">💡 <span class="highlight-text" style="color:#5ce6e6; font-size:18px;">${record.name}</span> が初クリア！</div>
        <div style="font-size:13px; color:#fff;">
          タイム: <span style="color:#ffeb85;">${record.time}</span> / 
          <span style="color:#ff6b6b;">STR ${formatNumber(record.str)}</span> / 
          <span style="color:#6be6ff;">VIT ${formatNumber(record.vit)}</span> / 
          <span style="color:#94ff6b;">AGI ${formatNumber(record.agi)}</span> / 
          <span style="color:#ffd166;">LCK ${formatNumber(record.lck || 0)}</span>
        </div>
      `;
    } else {
      recordEl.innerHTML = "💡 まだクリア者がいません！最初の挑戦者になろう！";
    }
  } catch (err) {
    recordEl.innerHTML = "💡 記録の読み込みに失敗しました。";
  }
}
// --- ⚔️ バトル実行 ---
btnChallenge.addEventListener('click', () => {
  const floorData = generateFloorData(player.floor);
  // ★戦闘には「バフ込みステータス」を渡す
  const battleStats = getBattleStats(player);
  const result = simulateBattle(battleStats, floorData);
  
  resultText.textContent = '';
  document.getElementById('battle-drop-result').style.display = 'none';
  modalBattle.style.display = 'flex';
  btnCloseBattle.style.display = 'none';

  document.getElementById('ui-p-name').textContent = player.name;
  document.getElementById('ui-p-stat-str').textContent = formatNumber(battleStats.str);
  document.getElementById('ui-p-stat-vit').textContent = formatNumber(battleStats.vit);
  document.getElementById('ui-p-stat-agi').textContent = formatNumber(battleStats.agi);

  // 初回の敵ステータスをすぐにセット（Aのステータス更新バグ対策）
  document.getElementById('ui-e-stat-str').textContent = formatNumber(floorData.enemies[0].str);
  document.getElementById('ui-e-stat-vit').textContent = formatNumber(floorData.enemies[0].vit);
  document.getElementById('ui-e-stat-agi').textContent = formatNumber(floorData.enemies[0].agi);

  let currentFrame = 0, eventIndex = 0;
  let pMaxHp = 1, pHp = 1, eMaxHp = 1, eHp = 1;
  let pGaugeVal = 0, eGaugeVal = 0, currentEnemyAgi = 0;
  
  const timerBar = document.getElementById('battle-timer-bar');
  const timerText = document.getElementById('battle-timer-text');

  function renderLoop() {
    const speed = 1; 
    currentFrame += speed;

    // タイマーの更新（90秒＝5400F）
    const elapsedSec = currentFrame / 60;
    timerText.textContent = elapsedSec.toFixed(2);
    timerBar.style.width = `${Math.max(0, 100 - (elapsedSec / 90) * 100)}%`;

    while (eventIndex < result.events.length && result.events[eventIndex].frame <= currentFrame) {
      const ev = result.events[eventIndex];
      
      if (ev.type === 'start' || ev.type === 'next_enemy') {
        // ★ スライドインアニメーション
        uiE_char.classList.remove('enemy-slide-out');
        uiE_char.classList.add('enemy-slide-in');
        if(ev.type === 'start') { pMaxHp = ev.playerMaxHp; pHp = pMaxHp; } else { eGaugeVal = 0; }
        eMaxHp = ev.enemy.maxHp; eHp = eMaxHp;
        document.getElementById('ui-e-name').textContent = ev.enemy.name;
        currentEnemyAgi = ev.enemy.agi;
        
        document.getElementById('ui-e-stat-str').textContent = formatNumber(ev.enemy.str);
        document.getElementById('ui-e-stat-vit').textContent = formatNumber(ev.enemy.vit);
        document.getElementById('ui-e-stat-agi').textContent = formatNumber(ev.enemy.agi);
      } 
      else if (ev.type === 'attack') {
        if(ev.actor === 'player') playSound('hit');
        else playSound('damage');
        const dmgText = document.createElement('div');
        dmgText.className = 'dmg-popup';
        dmgText.textContent = formatNumber(ev.damage);
        if(ev.actor === 'player') { dmgText.style.right = '20%'; eHp = ev.hpRemaining; pGaugeVal = 0; } 
        else { dmgText.style.left = '20%'; pHp = ev.hpRemaining; eGaugeVal = 0; }
        document.getElementById('battle-gui-container').appendChild(dmgText);
        setTimeout(() => dmgText.remove(), 800);
      }
      else if (ev.type === 'defeat') {
        // ★ 撃破音 ＆ スライドアウト（退場）
        playSound('defeat');
        uiE_char.classList.remove('enemy-slide-in');
        uiE_char.classList.add('enemy-slide-out');
      }
      else if (ev.type === 'stopper') { eGaugeVal = 1000; }
      eventIndex++;
    }

    // AGIの加算計算を「相手の10倍」までに制限する（battleCalc.jsと合わせる）
    let visualPAgi = Math.min(battleStats.agi, currentEnemyAgi * 10);
    let visualEAgi = Math.min(currentEnemyAgi, battleStats.agi * 10);

    // 自分のゲージ上昇（1000でMAX）
    pGaugeVal += visualPAgi * speed;
    if (pGaugeVal > 1000) pGaugeVal = 1000;

    // 敵のゲージ上昇
    eGaugeVal += visualEAgi * speed;
    if (eGaugeVal > 1000) eGaugeVal = 1000;

    // --- DOM更新（バーの幅反映） ---
    document.getElementById('ui-p-hp').style.width = `${Math.max(0, (pHp / pMaxHp) * 100)}%`;
    document.getElementById('ui-p-hp-txt').textContent = `${formatNumber(Math.max(0, pHp))} / ${formatNumber(pMaxHp)}`;
    document.getElementById('ui-p-gauge').style.width = `${(pGaugeVal / 1000) * 100}%`;

    document.getElementById('ui-e-hp').style.width = `${Math.max(0, (eHp / eMaxHp) * 100)}%`;
    document.getElementById('ui-e-hp-txt').textContent = `${formatNumber(Math.max(0, eHp))} / ${formatNumber(eMaxHp)}`;
    document.getElementById('ui-e-gauge').style.width = `${(eGaugeVal / 1000) * 100}%`;

    if (currentFrame >= result.totalFrames || eventIndex >= result.events.length) {
      btnCloseBattle.style.display = 'block';

      // ★ドロップ結果の表示とインベントリ追加
      if (result.drops.length > 0) {
        if(!player.inventory) player.inventory = {};
        const dropListEl = document.getElementById('battle-drop-list');
        dropListEl.innerHTML = '';
        
        result.drops.forEach(d => {
          player.inventory[d.name] = (player.inventory[d.name] || 0) + d.count;
          const li = document.createElement('li');
          // ★ x2 などの表示を追加
          li.innerHTML = `<span style="color:${d.type==='boss'?'#ffd166':'#fff'}">${d.name}</span> <span style="color:#5ce6e6; font-weight:bold;">x${d.count}</span> を獲得！`;
          dropListEl.appendChild(li);
        });
        document.getElementById('battle-drop-result').style.display = 'block';
        updateCollectionUI(); // ★リザルトが出た瞬間に図鑑を裏で更新
      }

      if (result.isWin) {
        playSound('win');
        handleVictory(result, floorData.floor); 
      } else {
        playSound('error');
        resultText.textContent = `💀 敗北...`;
        resultText.style.color = '#ff6b6b';
        savePlayerData(player); // 負けてもドロップは保存
        updateCollectionUI();
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
document.getElementById('btn-play-daruma').addEventListener('click', () => {
  openDarumaModal();
});
document.getElementById('btn-play-chicken').addEventListener('click', () => {
  openChickenModal();
});
document.getElementById('btn-play-guard').addEventListener('click', () => {
  openGuardModal();
});
document.getElementById('btn-play-1to20').addEventListener('click', () => {
  open1to20Modal();
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
const dummyGames =['command', 'clover', 'slot'];
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
const toggleContainer = document.getElementById('ranking-toggle-container');
const btnRankBase = document.getElementById('btn-rank-base');
const btnRankTotal = document.getElementById('btn-rank-total');
const myRankingContainer = document.getElementById('my-ranking-container');

let currentRankId = "";
let currentRankTitle = "";
let isTotalMode = false; // false=基礎値, true=総合値
// タブ切り替えイベント
btnRankBase.addEventListener('click', () => { isTotalMode = false; renderRanking(); });
btnRankTotal.addEventListener('click', () => { isTotalMode = true; renderRanking(); });

document.querySelectorAll('.btn-show-ranking').forEach(btn => {
  btn.addEventListener('click', (e) => {
    currentRankId = e.currentTarget.getAttribute('data-rank-id');
    currentRankTitle = e.currentTarget.textContent.replace(/[👑💪🛡️⚡🍀🪨🪵⚔️📖]/g, '').trim(); 
    isTotalMode = false; // デフォルトは基礎値
    
    // ステータス系ならタブを表示
    if (["str", "vit", "agi", "lck"].includes(currentRankId)) {
      toggleContainer.style.display = 'flex';
    } else {
      toggleContainer.style.display = 'none';
    }

    modalRanking.style.display = 'flex';
    renderRanking();
  });
});

async function renderRanking() {
  // タブの見た目更新
  btnRankBase.style.background = isTotalMode ? "#222" : "#c49a45";
  btnRankBase.style.color = isTotalMode ? "#c49a45" : "#000";
  btnRankTotal.style.background = isTotalMode ? "#c49a45" : "#222";
  btnRankTotal.style.color = isTotalMode ? "#000" : "#c49a45";

  rankingTitle.textContent = currentRankTitle + (toggleContainer.style.display === 'flex' ? (isTotalMode ? " (総合値)" : " (基礎値)") : "");
  rankingList.innerHTML = '<p style="text-align:center; color:#aaa; font-size:12px; margin-top:20px;">データ取得中...</p>';
  myRankingContainer.innerHTML = '';

  const data = await getRankingData(currentRankId, isTotalMode);
  
  // ▼ 自分のスコアを取得
  let myScore = null;
  if (["str", "vit", "agi", "lck"].includes(currentRankId)) {
    myScore = isTotalMode ? (player.battleStats ? player.battleStats[currentRankId] : player[currentRankId]) : player[currentRankId];
  } else if (["floor", "totalLv", "winCount", "collectionCount"].includes(currentRankId)) {
    myScore = player[currentRankId] || (currentRankId==='floor'?1:0);
  } else {
    myScore = await getPersonalBest(player.name, currentRankId); // ミニゲーム
  }

  // リストの描画
  let html = '';
  const colors =["#ffd700", "#c0c0c0", "#cd7f32", "#aaa"];
  let iAmInTop10 = false;
  
  if (data.length === 0) {
    html = '<p style="text-align:center; color:#aaa; font-size:12px;">まだ記録がありません</p>';
  } else {
    data.forEach((item, index) => {
      const isMe = item.name === player.name;
      if (isMe) iAmInTop10 = true;

      // --- 1. 順位に基づく色 (1位:金, 2位:銀, 3位:銅, 他:グレー) ---
      const rankColors = ["#ffd700", "#c0c0c0", "#cd7f32", "#aaa"];
      const color = index < 3 ? rankColors[index] : rankColors[3];
      const bg = index < 3 ? `rgba(${index===0?'255,215,0':index===1?'192,192,192':'205,127,50'}, 0.1)` : 'rgba(0,0,0,0.3)';
      
      // --- 2. スコアのフォーマット ---
      let displayScore = item.score;
      if(["str", "vit", "agi", "lck"].includes(currentRankId)) displayScore = formatNumber(item.score);
      else if(currentRankId === 'floor') displayScore += ' 層';
      else if(currentRankId === 'totalLv') displayScore = 'Lv.' + displayScore;
      else if(["rockPush", "daruma"].includes(currentRankId)) {
        displayScore = item.score.toFixed(2) + ' 秒';
      }
      else if(currentRankId === 'chicken') {
        displayScore = item.score.toFixed(2) + ' m'; // ★mを表示
      }
      else if(currentRankId === "guard") displayScore = Math.floor(item.score) + ' pt';
      const borderLeftStyle = `4px solid ${color}`; 
      // --- 3. HTML生成 (isMe のときだけ rank-row-self クラスを付与) ---
      const selfClass = isMe ? 'rank-row-self' : '';
      
      html += `
        <div class="${selfClass}" style="display:flex; justify-content:space-between; padding:10px; margin-bottom:8px; border-bottom:1px solid #4a3b26; background:${bg}; border-left:${borderLeftStyle};">
          <div style="display:flex; align-items:center;">
            <span style="font-weight:bold; color:${color}; font-size:16px; margin-right:8px;">${index + 1}位.</span>
            <span style="font-weight:bold; color:#fff;">${item.name} ${isMe ? '<span style="color:#5ce6e6; font-size:10px; margin-left:4px;">(あなた)</span>' : ''}</span>
          </div>
          <span style="font-weight:bold; color:#fff; font-family:monospace;">${displayScore}</span>
        </div>
      `;
    });
  }
  rankingList.innerHTML = html;

  // ▼ 圏外の場合の固定表示
  if (!iAmInTop10 && myScore !== null) {
    let displayMyScore = myScore;
    if(["str", "vit", "agi", "lck"].includes(currentRankId)) displayMyScore = formatNumber(myScore);
    else if(currentRankId === 'floor') displayMyScore += ' 層';
    else if(currentRankId === 'totalLv') displayMyScore = 'Lv.' + displayMyScore;
    else if(["rockPush", "daruma"].includes(currentRankId)) {
      displayMyScore = myScore.toFixed(2) + ' 秒';
    }
    else if(currentRankId === 'chicken') {
      displayMyScore = myScore.toFixed(2) + ' m'; // ★mを表示
    }
    else if(currentRankId === "guard") displayScore = Math.floor(item.score) + ' pt';

    myRankingContainer.innerHTML = `
      <div style="display:flex; justify-content:space-between; padding:10px; background:rgba(92, 230, 230, 0.1); border-left:3px solid #5ce6e6; border-radius:4px;">
        <span style="font-weight:bold; color:#5ce6e6;">圏外. ${player.name} (あなた)</span>
        <span style="font-weight:bold; color:#fff;">${displayMyScore}</span>
      </div>
    `;
  }
}

// ★勝利時の処理を修正（初クリア者の判定）
// --- 勝利時の処理（初クリア保存と進行度更新） ---
async function handleVictory(result, floorNum) {
  player.winCount = (player.winCount || 0) + 1;
  resultText.textContent = `🎉 勝利！ タイム: ${result.clearTime}`;
  resultText.style.color = '#ffd166';

  try {
    const isFirst = await checkAndSaveFirstClear(player, floorNum, result.clearTime);
    if(isFirst) console.log("🌟 初クリア者として記録！");

    if (!player.maxClearedFloor || floorNum >= player.maxClearedFloor) {
      player.maxClearedFloor = floorNum + 1;
      // ★削除: player.floor = floorNum + 1; （勝手に次の階層へ進まないようにした！）
    }
    await savePlayerData(player);
    
    // UIを更新（最高到達階層が更新されたので、▶ボタンが押せるようになる）
    updateFloorUI(floorNum); 
    updateStatusUI();
    updateCollectionUI();
  } catch (err) {
    console.error(err);
  }
}

// --- 📖 図鑑UI更新関数 ---
function updateCollectionUI() {
  const container = document.getElementById('collection-list-container');
  if (!container) return;
  container.innerHTML = '';

  let totalCollected = 0;
  let totalBonuses = { STR: 0, VIT: 0, AGI: 0, LCK: 0, ALL: 0 };
  const rankThresholds = [0, 1, 3, 9, 27, 81, Infinity];
  for (let f = 1; f <= (player.maxClearedFloor || 1); f += 5) {
    const floorData = generateFloorData(f);
    const g = Math.ceil(f / 5);
    const statType = getDropStatType(f, false);

    const items = [
      { name: floorData.biome.mobDrop, type: 'mob', color: '#5ce6e6' },
      { name: floorData.biome.bossDrop, type: 'boss', color: '#ffd166' }
    ];

    items.forEach(item => {
      const count = player.inventory?.[item.name] || 0;
      totalCollected += count;
      const rankInfo = getCollectionRank(count);
      const buffValue = g * rankInfo.rank;

      // ★合計バフへの加算
      if (item.type === 'boss') {
        totalBonuses.ALL += buffValue;
      } else {
        totalBonuses[statType] += buffValue;
      }

      // 次のランクの閾値
      const nextIdx = rankInfo.rank + 1;
      const nextGoal = rankThresholds[nextIdx];
      const goalText = nextGoal === Infinity ? "MAX" : `${count}/${nextGoal}`;
      const progress = nextGoal === Infinity ? 100 : (count / nextGoal) * 100;

      container.innerHTML += `
          <div class="panel">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="font-size: 16px; color:${rankInfo.color};">${item.name} [${rankInfo.name}]</strong>
              <span style="color:#fff; font-size:12px; font-family:monospace;">所持: ${count}個</span>
            </div>
            <div style="font-size: 12px; color: ${item.color}; margin: 4px 0;">
              効果: ${item.type === 'boss' ? '全ステータス' : statType} +${g * rankInfo.rank}%
            </div>
            <!-- 進捗バー -->
            <div style="background: #111; border: 1px solid #4a3b26; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 5px;">
              <div style="background: ${rankInfo.color}; width: ${progress}%; height: 100%;"></div>
            </div>
            <div style="text-align: right; font-size: 10px; color: #aaa; margin-top: 2px;">次ランクまで: ${goalText}</div>
          </div>
        `;
      });
    }
    
    // ★追加：サマリーパネルの数値を更新
    document.getElementById('total-buff-str').textContent = `+${totalBonuses.STR + totalBonuses.ALL}%`;
    document.getElementById('total-buff-vit').textContent = `+${totalBonuses.VIT + totalBonuses.ALL}%`;
    document.getElementById('total-buff-agi').textContent = `+${totalBonuses.AGI + totalBonuses.ALL}%`;
    document.getElementById('total-buff-lck').textContent = `+${totalBonuses.LCK + totalBonuses.ALL}%`;
    
    player.collectionCount = totalCollected; // 保存用
  }

  // ★追加：画面内のボタンを押したら勝手に「ポッ」と鳴るようにする（全体適用）
document.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON' || e.target.classList.contains('btn-show-ranking')) {
    playSound('click');
  }
});