// src/main.js
import { simulateBattle } from './battle/battleCalc.js';
import { generateFloorData, BIOMES, getDropStatType } from './battle/enemyGen.js';
import { loginOrRegister, savePlayerData, getRankingData, checkAndSaveFirstClear, getFirstClearRecord, subscribeNews, addGlobalNews, getPersonalBest, getGlobalConfig, getReliableTime, syncServerTime } from './firebase.js';
import { getLckBonusMultiplier } from './gacha/equipment.js';
import { getRequiredExp, getLevelMultiplier } from './minigame/minigameCore.js';
import { initGachaUI, updateTicketCount } from './gacha/gachaUI.js';
import { RARITY_DATA, calcEquipLevel, getEquipStats } from './gacha/equipment.js';
import { initMeditation } from './minigame/meditation.js';
import { initRockPush, openRockPushModal } from './minigame/rockPush.js';
import { initDaruma, openDarumaModal } from './minigame/daruma.js';
import { initChicken, openChickenModal } from './minigame/chicken.js';
import { initGuard, openGuardModal } from './minigame/guard.js';
import { init1to20, open1to20Modal } from './minigame/1to20.js';
import { initCommand, openCommandModal } from './minigame/command.js'; 
import { initClover, openCloverModal } from './minigame/clover.js';
import { initSlot, openSlotModal } from './minigame/slot.js';
import { playSound, setVolume, toggleMute, getAudioSettings } from './audio.js'; // 追加
import { openProfileModal } from './profile.js';
import { initRaidManager, cancelRaidWaitingIfActive } from './raid/raidManager.js';
import { calculateTournamentPrizes, getPrizeForRank } from './tournament.js'; // ★インポート追加

// ==========================================
// リリース設定
// ==========================================
export const IS_TOURNAMENT_MODE = false;
export const IS_PRE_RELEASE = false;
export const RELEASE_DATE = new Date('2026-03-28T15:00:00+09:00').getTime();

// ==========================================
// ⏳ ティザー（カウントダウン）画面の制御
// ==========================================
const teaserModal = document.getElementById('modal-teaser');

async function initTeaser() {
  if (!IS_PRE_RELEASE) {
    // リリース済みならティザーを完全に消去して終了
    if (teaserModal) teaserModal.style.display = 'none';
    return;
  }

  // サーバーと時間を同期（チート対策）
  await syncServerTime();
  if (teaserModal) {
    teaserModal.style.display = 'flex';
  }
  function updateTeaser() {
    const now = getReliableTime();
    const diff = RELEASE_DATE - now;

    if (diff <= 0) {
      teaserModal.style.transition = 'opacity 1s ease';
      teaserModal.style.opacity = '0';
      setTimeout(() => teaserModal.style.display = 'none', 1000);
      return; // ループ終了
    }

    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);

    document.getElementById('t-days').textContent = String(d).padStart(2, '0');
    document.getElementById('t-hours').textContent = String(h).padStart(2, '0');
    document.getElementById('t-mins').textContent = String(m).padStart(2, '0');
    document.getElementById('t-secs').textContent = String(s).padStart(2, '0');

    requestAnimationFrame(updateTeaser);
  }
  
  updateTeaser();
}

// スクリプト読み込み時に即実行
initTeaser();


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
let isSurrendered = false;
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
  // mult: ステータス上昇に乗算される内部倍率 (金とマスターで跳ね上がる)
  if (count >= 81) return { rank: 5, name: "マスター", color: "#ff6b6b", mult: 8 }; 
  if (count >= 27) return { rank: 4, name: "金", color: "#ffd700", mult: 5 }; 
  if (count >= 9)  return { rank: 3, name: "銀", color: "#c0c0c0", mult: 3 };
  if (count >= 3)  return { rank: 2, name: "銅", color: "#cd7f32", mult: 2 };
  if (count >= 1)  return { rank: 1, name: "木", color: "#8c7a65", mult: 1 };
  return { rank: 0, name: "未取得", color: "#555", mult: 0 };
}


// ★戦闘用に「バフ込みのステータス」を計算する関数
function getBattleStats(p) {
  let bonuses = { STR: 0, VIT: 0, AGI: 0, LCK: 0, ALL: 0 };
  
  // 図鑑バフの計算（最高到達階層までのアイテムをチェック）
  for (let f = 1; f <= (p.maxClearedFloor || 1); f += 5) {
    const floorData = generateFloorData(f);
    const g = Math.ceil(f / 20);
    
    const mobCount = p.inventory?.[floorData.biome.mobDrop] || 0;
    bonuses[getDropStatType(f, false)] += g * getCollectionRank(mobCount).rank;

    const bossCount = p.inventory?.[floorData.biome.bossDrop] || 0;
    bonuses['ALL'] += g * getCollectionRank(bossCount).rank;
  }

   let finalStats = { str: 0, vit: 0, agi: 0, lck: 0 };
  const statsList = ["str", "vit", "agi", "lck"];

  statsList.forEach(s => {
    // 1. 基礎値に図鑑バフを掛ける
    let baseWithBuff = p[s] * (1 + (bonuses[s.toUpperCase()] + bonuses.ALL) / 100);
    
    let eqMult = 1.0;
    let eqAdd = 0;
    
    // 2. 装備の倍率と加算値を取得
    const eqRarityId = p.equips?.[s];
    if (eqRarityId) {
      const rarityIdx = RARITY_DATA.findIndex(r => r.id === eqRarityId);
      const count = p.inventory_equip?.[s]?.[eqRarityId] || 1;
      const lvInfo = calcEquipLevel(count);
      const eqStats = getEquipStats(rarityIdx, lvInfo.level);
      
      eqMult = eqStats.mult;
      eqAdd = eqStats.add;
    }
    
    // 3. 最終計算： (基礎×図鑑) × 装備倍率 + 装備定数
    finalStats[s] = Math.floor(baseWithBuff * eqMult) + eqAdd;
  });

  return finalStats;
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

   // ★追加：フロントエンド側でのフライング防止
  if (IS_PRE_RELEASE && getReliableTime() < RELEASE_DATE) {
    errorEl.textContent = "まだ塔の扉は開かれていません...";
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

// 音量UIの初期化
const btnMute = document.getElementById('btn-mute');
const sliderVol = document.getElementById('volume-slider');
const initialAudio = getAudioSettings();

sliderVol.value = initialAudio.volume;
btnMute.textContent = initialAudio.muted ? '🔇' : '🔊';

sliderVol.addEventListener('input', (e) => {
  setVolume(parseFloat(e.target.value));
  if (getAudioSettings().muted) { // スライダーを動かしたらミュート解除
    toggleMute();
    btnMute.textContent = '🔊';
  }
});

btnMute.addEventListener('click', () => {
  const isMuted = toggleMute();
  btnMute.textContent = isMuted ? '🔇' : '🔊';
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
  initGachaUI(player, updateStatusUI);
  initNewsTicker();
  initMeditation(player, updateTrainingUI);
  initRockPush(player, updateTrainingUI); 
  initDaruma(player, updateTrainingUI);
  initChicken(player, updateTrainingUI);
  initGuard(player, updateTrainingUI); 
  init1to20(player, updateTrainingUI);
  initCommand(player, updateTrainingUI);
  initClover(player, updateTrainingUI);
  initSlot(player, updateTrainingUI);
  initRaidManager(player); 

  if (IS_TOURNAMENT_MODE) {
    const tBtn = document.getElementById('btn-tournament-rank');
    if (tBtn) tBtn.style.display = 'block';
  }

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

  const rec = floorData.recommended;
  document.getElementById('rec-stats').innerHTML = `
    推奨: <span style="color:#ff6b6b;">STR ${formatNumber(rec.str)}</span> / 
    <span style="color:#6be6ff;">VIT ${formatNumber(rec.vit)}</span> / 
    <span style="color:#94ff6b;">AGI ${formatNumber(rec.agi)}</span>
  `;

   // ★ 修正：階層移動ボタンの透明化 (disabled クラスの付け外し)
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');

  if (floorNum <= 1) {
    prevBtn.classList.add('disabled');
    prevBtn.style.opacity = "0.3";
    prevBtn.style.pointerEvents = "none";
  } else {
    prevBtn.classList.remove('disabled');
    prevBtn.style.opacity = "1";
    prevBtn.style.pointerEvents = "auto";
  }

  // 自分の最高到達階層（maxClearedFloor）より先には行けない
  if (floorNum >= (player.maxClearedFloor || 1)) {
    nextBtn.classList.add('disabled');
    nextBtn.style.opacity = "0.3";
    nextBtn.style.pointerEvents = "none";
  } else {
    nextBtn.classList.remove('disabled');
    nextBtn.style.opacity = "1";
    nextBtn.style.pointerEvents = "auto";
  }

  // ★ドロップの色分けと、ガチャチケ枚数のLCK加算
  let ticketCount = 1;
  const currentLck = player.battleStats?.lck || player.lck || 0;
  if (currentLck >= 100) {
    ticketCount += Math.max(0, Math.floor(Math.log(currentLck / 100) / Math.log(3)));
  }
  const lckMult = getLckBonusMultiplier(currentLck);
  const gekidoProb = (0.01 * lckMult).toFixed(4);

  document.getElementById('drop-list').innerHTML = `
    <li style="color:#fff;">装備ガチャチケット <span style="font-weight:bold;">x${ticketCount}</span> (ボス100%)</li>
    <li style="color:#5ce6e6;">${floorData.biome.mobDrop}[図鑑] (雑魚20%)</li>
    <li style="color:#ffd166;">${floorData.biome.bossDrop} [図鑑] (ボス30%)</li>
    <li style="color:#b16bff;">${floorData.gekido.name} [特殊] (${gekidoProb}%)</li>
  `;

  // ★初クリア者表示 (serverTimestamp の処理)
  const recordEl = document.getElementById('clear-record');
  recordEl.innerHTML = "💡 記録を確認中...";
  try {
    const record = await getFirstClearRecord(floorNum);
    if (record) {
      // serverTimestamp は toMillis() を持つオブジェクトで返ってくることがある
      const ts = record.timestamp?.toMillis ? record.timestamp.toMillis() : record.timestamp;
      const d = new Date(ts);
      const dateStr = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      
       recordEl.innerHTML = `
        <div style="margin-bottom:5px;">💡 <span class="highlight-text clickable-name" data-name="${record.name}" style="color:#5ce6e6; font-size:18px; font-weight:bold;">${record.name}</span> が初クリア！ <span style="font-size:11px; color:#aaa;">(${dateStr})</span></div>
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

  // ★ 修正：モーダルを開いた直後は「降参」を表示し「閉じる」を隠す
  document.getElementById('btn-surrender-modal').style.display = 'block';
  btnCloseBattle.style.display = 'none';
  isSurrendered = false;


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

    // ★追加：降参フラグが立ったら即座に敗北処理へ飛ばす
    if (isSurrendered) {
      currentFrame = result.totalFrames; // 強制終了
      result.isWin = false; // 負け扱い
      eventIndex = result.events.length; // 残りの「攻撃」や「音」のイベントを全てスキップする！
    }

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
        playSound('defeat');
        // ★修正1: 最後の敵(ボス)ならスライドアウトさせない
        if (!ev.isLast) {
          // ★修正2: HPが0になるのをしっかり見せるため、0.15秒待ってからスライドアウト
          setTimeout(() => {
            uiE_char.classList.remove('enemy-slide-in');
            uiE_char.classList.add('enemy-slide-out');
          }, 150);
        }
      }
      else if (ev.type === 'stopper') { eGaugeVal = 1000; }
      eventIndex++;
    }

    // AGIの加算計算を「相手の10倍」までに制限する（battleCalc.jsと合わせる）
    const BASE_SPEED = 1000 / 60;
    let visualPAgi = Math.max(1, Math.min(battleStats.agi, currentEnemyAgi * 10));
    let visualEAgi = Math.max(1, Math.min(currentEnemyAgi, battleStats.agi * 10));
    const minVisualAgi = Math.min(visualPAgi, visualEAgi); // minに変更

    pGaugeVal += (visualPAgi / minVisualAgi) * BASE_SPEED * speed;
    eGaugeVal += (visualEAgi / minVisualAgi) * BASE_SPEED * speed;

    if (pGaugeVal > 1000) pGaugeVal = 1000;
    if (eGaugeVal > 1000) eGaugeVal = 1000;

    // --- DOM更新（バーの幅反映） ---
    document.getElementById('ui-p-hp').style.width = `${Math.max(0, (pHp / pMaxHp) * 100)}%`;
    document.getElementById('ui-p-hp-txt').textContent = `${formatNumber(Math.max(0, pHp))} / ${formatNumber(pMaxHp)}`;
    document.getElementById('ui-p-gauge').style.width = `${(pGaugeVal / 1000) * 100}%`;

    document.getElementById('ui-e-hp').style.width = `${Math.max(0, (eHp / eMaxHp) * 100)}%`;
    document.getElementById('ui-e-hp-txt').textContent = `${formatNumber(Math.max(0, eHp))} / ${formatNumber(eMaxHp)}`;
    document.getElementById('ui-e-gauge').style.width = `${(eGaugeVal / 1000) * 100}%`;

    // --- バトルの終了判定 (降参・ドロップ色分け・d エラー修正) ---
    if (currentFrame >= result.totalFrames || eventIndex >= result.events.length) {
      document.getElementById('btn-surrender-modal').style.display = 'none';
      btnCloseBattle.style.display = 'block';

      if (result.drops.length > 0) {
        if(!player.inventory) player.inventory = {};
        const dropListEl = document.getElementById('battle-drop-list');
        dropListEl.innerHTML = '';
        
        let hasGekidoUpdate = false;

        // ★ d 変数エラーの修正と色分け
        result.drops.forEach(dropItem => {
          const currentCount = player.inventory[dropItem.name] || 0;
          const newCount = currentCount + dropItem.count;
          player.inventory[dropItem.name] = newCount;
          
          let color = '#fff';
          if (dropItem.type === 'mob') color = '#5ce6e6';
          else if (dropItem.type === 'boss') color = '#ffd166';
          else if (dropItem.type === 'gekido' || dropItem.name.includes('激動')) color = '#b16bff';

          const li = document.createElement('li');
          li.innerHTML = `<span style="color:${color}">${dropItem.name}</span> <span style="color:#fff; font-weight:bold;">x${dropItem.count}</span> を獲得！`;
          dropListEl.appendChild(li);

          // マスター(81個)到達ニュース
          if (dropItem.type !== 'gacha' && currentCount < 81 && newCount >= 81) {
            addGlobalNews(`👑 【マスター到達】<span class="clickable-name" data-name="${player.name}" style="color:#5ce6e6; font-weight:bold;">${player.name}</span> が ${dropItem.name} をマスター(MAX)にしました！`, 4);
          }

          if (dropItem.name.includes("魔の激動")) {
            hasGekidoUpdate = true;
          }
        });
        document.getElementById('battle-drop-result').style.display = 'block';
        
        // ★ ドロップ処理がすべて終わってからバフを再計算する
        if (hasGekidoUpdate) {
          applyGekidoBonus();
        }
         updateTicketCount(); 
        updateCollectionUI(); 
      }

      if (result.isWin && !isSurrendered) {
        playSound('win');
        handleVictory(result, floorData.floor); 
      } else {
        playSound('error');
        resultText.textContent = isSurrendered ? `🏳️ 降参しました` : `💀 敗北...`;
        resultText.style.color = '#ff6b6b';
        savePlayerData(player); 
      }
      updateCollectionUI();
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
      const targetId = btn.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');


      // ★追加：バトルタブ以外に切り替えたらレイド待機を自動キャンセル
      if (targetId !== 'tab-battle') {
        cancelRaidWaitingIfActive();
      }
      
      if (targetId === 'tab-training') updateTrainingUI();
      // ★ 装備タブを開いたときにチケット枚数を同期する
      if (targetId === 'tab-equip') updateTicketCount();
    });
  });
}

document.getElementById('btn-surrender-modal').addEventListener('click', () => {
  isSurrendered = true;
});


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
document.getElementById('btn-play-command').addEventListener('click', () => {
  openCommandModal();
});
document.getElementById('btn-play-clover').addEventListener('click', () => {
  openCloverModal();
});
document.getElementById('btn-play-slot').addEventListener('click', () => {
  openSlotModal();
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
    currentRankTitle = e.currentTarget.textContent.replace(/[👑💪🛡️⚡🍀🪨🪵⚔️📖🎰🏆✨🐛]/g, '').trim(); 
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

  let data =[];
  
  // ★大会賞金ランキングの場合の特別処理
  if (currentRankId === 'tournament') {
    data = await calculateTournamentPrizes();
  } else {
    data = await getRankingData(currentRankId, isTotalMode);
  }
  
  // ▼ 自分のスコアを取得
  let myScore = null;
  if (["str", "vit", "agi", "lck"].includes(currentRankId)) {
    myScore = isTotalMode ? (player.battleStats ? player.battleStats[currentRankId] : player[currentRankId]) : player[currentRankId];
  } else if (["floor", "totalLv", "winCount", "collectionCount", "gachaCount", "firstClearCount"].includes(currentRankId)) {
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
      if (isMe && index < 10) iAmInTop10 = true; // 上位10人に入っているか

      // 表示を10位で打ち切る（大会賞金ランキングは全員表示してもOKだが、ここでは10位までとする）
      if (currentRankId !== 'tournament' && index >= 10) return;

      const color = index < 3 ? colors[index] : colors[3];
      const bg = isMe ? 'rgba(92, 230, 230, 0.2)' : (index < 3 ? `rgba(${index===0?'255,215,0':index===1?'192,192,192':'205,127,50'}, 0.1)` : 'rgba(0,0,0,0.3)');
      const borderLeftStyle = `4px solid ${color}`; 
      const selfClass = isMe ? 'rank-row-self' : '';
      
      let displayScore = item.score;
      if (currentRankId === 'tournament') displayScore += ' 円';
      else if(["str", "vit", "agi", "lck"].includes(currentRankId)) displayScore = formatNumber(item.score);
      else if(currentRankId === 'floor') displayScore += ' 層';
      else if(currentRankId === 'totalLv') displayScore = 'Lv.' + displayScore;
      else if(currentRankId === 'winCount' || currentRankId === 'firstClearCount') displayScore += ' 勝';
      else if(currentRankId === 'gachaCount') displayScore += ' 回';
      else if(currentRankId === 'collectionCount') displayScore += ' 個';
      else if(currentRankId === 'bugReports') displayScore += ' 件'; // ★追加
      else if(currentRankId === 'firstGenesis') displayScore = item.score; // ★(xx%)のまま出す
      else if(["rockPush", "daruma", "1to20", "command"].includes(currentRankId)) displayScore = item.score.toFixed(2) + ' 秒';
      else if(currentRankId === 'chicken') displayScore = item.score.toFixed(2) + ' m';
      else if(currentRankId === 'guard' || currentRankId === 'slot') displayScore = formatNumber(item.score) + ' pt';

      // ★大会モードがON ＆ 賞金対象の順位なら「(+〇円)」を追記
      let prizeHtml = '';
      if (IS_TOURNAMENT_MODE && currentRankId !== 'tournament') {
        const isStatusTotal = (["str", "vit", "agi", "lck"].includes(currentRankId) && isTotalMode);
        
        if (!isStatusTotal) {
          // ★修正：歩合計算のため、生スコア(item.score)も渡す
          const yen = getPrizeForRank(currentRankId, index, item.score);
          if (yen > 0) {
            prizeHtml = `<span style="color:#ffd166; font-size:12px; margin-left:8px;">(+${yen}円)</span>`;
          }
        }
      }

      html += `
        <div class="${selfClass}" style="display:flex; justify-content:space-between; padding:10px; margin-bottom:8px; border-bottom:1px solid #4a3b26; background:${bg}; border-left:${borderLeftStyle};">
          <div style="display:flex; align-items:center;">
            <span style="font-weight:bold; color:${color}; font-size:16px; margin-right:8px;">${index + 1}位.</span>
            <span class="clickable-name" data-name="${item.name}" style="font-weight:bold; color:#fff;">${item.name} ${isMe ? '<span style="color:#5ce6e6; font-size:10px; margin-left:4px;">(あなた)</span>' : ''}</span>
          </div>
          <span style="font-weight:bold; color:#fff; font-family:monospace;">${displayScore} ${prizeHtml}</span>
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
    else if(["rockPush", "daruma", "1to20", "command", "clover"].includes(currentRankId)) {
      displayMyScore = myScore.toFixed(2) + ' 秒';
    }
    else if(currentRankId === 'chicken') {
      displayMyScore = myScore.toFixed(2) + ' m'; // ★mを表示
    }
    else if(currentRankId === "guard" || currentRankId === "slot") displayScore = Math.floor(item.score) + ' pt';

    myRankingContainer.innerHTML = `
      <div style="display:flex; justify-content:space-between; padding:10px; background:rgba(92, 230, 230, 0.1); border-left:3px solid #5ce6e6; border-radius:4px;">
        <span style="font-weight:bold; color:#5ce6e6;">圏外.<span class="clickable-name" data-name="${player.name}" style="font-weight:bold; color:#fff;">${player.name}</span> (あなた)</span>
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

      // ★ 5層ごとの突破ニュース (まだ誰もクリアしていない階層は「初クリア」が流れるので除外気味で)
      if (floorNum % 5 === 0 && !isFirst) {
        addGlobalNews(`🎌 【到達】<span class="clickable-name" data-name="${player.name}" style="color:#5ce6e6; font-weight:bold;">${player.name}</span> が第${floorNum}層を突破しました！`, 5);
      }
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

// --- 📖 図鑑UIの更新 (魔の激動と未取得表示の追加) ---
function updateCollectionUI() {
  const container = document.getElementById('collection-list-container');
  if (!container) return;
  container.innerHTML = '';

  let totalBonuses = { STR: 0, VIT: 0, AGI: 0, LCK: 0, ALL: 0 };
  let totalCollectedCount = 0;
  const rankThresholds = [0, 1, 3, 9, 27, 81, Infinity]; 
  const statColors = { "STR": "#ff6b6b", "VIT": "#6be6ff", "AGI": "#94ff6b", "LCK": "#ffd166", "ALL": "#ffd166" };

  // 1. 通常ドロップの描画
  for (let f = 1; f <= (player.maxClearedFloor || 1); f += 5) {
    const floorData = generateFloorData(f);
    const g = Math.ceil(f / 20);
    const statType = getDropStatType(f, false);

    const items =[
      { name: floorData.biome.mobDrop, type: 'mob', stat: statType, color: '#5ce6e6', dropText: `第${f}〜${f+4}層 (雑魚)` },
      { name: floorData.biome.bossDrop, type: 'boss', stat: 'ALL', color: '#ffd166', dropText: `第${f+4}層 (ボス)` }
    ];

    items.forEach(item => {
      const count = player.inventory?.[item.name] || 0;
       if (item.name !== "装備ガチャチケット") totalCollectedCount += Math.min(count, 81);
      const rankInfo = getCollectionRank(count);
      const buffValue = g * rankInfo.mult;

      if (item.type === 'boss') totalBonuses.ALL += buffValue;
      else totalBonuses[statType] += buffValue;

      // ★ 未取得でも0として描画する
      const nextIdx = rankInfo.rank + 1;
      const nextGoal = rankThresholds[nextIdx];
      const goalText = nextGoal === Infinity ? "MAX" : `${count}/${nextGoal}`;
      const progress = nextGoal === Infinity ? 100 : (count / nextGoal) * 100;
      const statColor = statColors[item.stat];

      container.innerHTML += `
        <div class="panel">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 16px; color:${rankInfo.color};">${item.name}[${rankInfo.name}]</strong>
            <span style="color:#fff; font-size:12px; font-family:monospace;">所持: ${count}個</span>
          </div>
          <div style="font-size: 11px; color: #aaa; margin: 2px 0;">ドロップ: ${item.dropText}</div>
          <div style="font-size: 13px; color: ${statColor}; font-weight: bold; margin: 4px 0;">
            効果: ${item.type === 'boss' ? '全ステータス' : statType} +${buffValue}%
          </div>
          <div style="background: #111; border: 1px solid #4a3b26; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 5px;">
            <div style="background: ${rankInfo.color}; width: ${progress}%; height: 100%;"></div>
          </div>
          <div style="text-align: right; font-size: 10px; color: #aaa; margin-top: 2px;">次ランクまで: ${goalText}</div>
        </div>
      `;
    });
  }

  // 2. 魔の激動（特殊コレクション）の描画
  container.innerHTML += `<h3 style="color:#b16bff; text-align:center; margin-top:20px; border-top:1px dashed #b16bff; padding-top:10px;">特殊コレクション</h3>`;
  for (let f = 1; f <= (player.maxClearedFloor || 1); f += 50) {
    const fd = generateFloorData(f);
    const count = player.inventory?.[fd.gekido.name] || 0;
    totalCollectedCount += count;
    const rankInfo = getCollectionRank(count);
    const buffValue = fd.gekido.baseBuff * rankInfo.mult;

    const nextIdx = rankInfo.rank + 1;
    const nextGoal = rankThresholds[nextIdx];
    const progress = nextGoal === Infinity ? 100 : (count / nextGoal) * 100;

    container.innerHTML += `
      <div class="panel" style="border-color:#b16bff;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 16px; color:${rankInfo.color};">${fd.gekido.name} [${rankInfo.name}]</strong>
          <span style="color:#fff; font-size:12px; font-family:monospace;">所持: ${count}個</span>
        </div>
        <div style="font-size: 11px; color: #aaa; margin: 2px 0;">ドロップ: 第${f}〜${f+49}層 (全敵 0.01%)</div>
        <div style="font-size: 13px; color: #b16bff; font-weight: bold; margin: 4px 0;">
          効果: 累計特訓経験値 +${buffValue}%
        </div>
        <div style="background: #111; border: 1px solid #4a3b26; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 5px;">
          <div style="background: ${rankInfo.color}; width: ${progress}%; height: 100%;"></div>
        </div>
        <div style="text-align: right; font-size: 10px; color: #aaa; margin-top: 2px;">次ランクまで: ${count}/${nextGoal === Infinity ? "MAX" : nextGoal}</div>
      </div>
    `;
  }

  document.getElementById('total-buff-str').textContent = `+${totalBonuses.STR + totalBonuses.ALL}%`;
  document.getElementById('total-buff-vit').textContent = `+${totalBonuses.VIT + totalBonuses.ALL}%`;
  document.getElementById('total-buff-agi').textContent = `+${totalBonuses.AGI + totalBonuses.ALL}%`;
  document.getElementById('total-buff-lck').textContent = `+${totalBonuses.LCK + totalBonuses.ALL}%`;

  player.collectionCount = totalCollectedCount;
}
  // ★追加：画面内のボタンを押したら勝手に「ポッ」と鳴るようにする（全体適用）
document.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON' || e.target.classList.contains('btn-show-ranking')) {
    playSound('click');
  }
});

// ==========================================
// 📰 ニューステロップ制御 (流れるアニメーション完全版)
// ==========================================
let currentNewsQueue =[];
let currentNewsIndex = 0;
let currentPlayingId = null;
let isNewsPlaying = false;

function initNewsTicker() {
  subscribeNews((newsList) => {
    currentNewsQueue = newsList;
    updateNewsDisplay();
  });
}

function updateNewsDisplay() {
  if (currentNewsQueue.length === 0) {
    if (!isNewsPlaying) playNextNews("🔔 ぼくらの無限塔へようこそ！");
    return;
  }
  
  const topNews = currentNewsQueue[0];
  
  // 新規ニュース（割り込み）
  if (currentPlayingId !== topNews.id) {
    currentPlayingId = topNews.id;
    playSound('win');
    currentNewsIndex = 0;
    
    // 今流れているものを強制キャンセルして上書き
    const el = document.querySelector('.news-text');
    el.removeEventListener('transitionend', onNewsEnd);
    playNextNews(topNews.text);
  } 
  // 停止中なら再生
  else if (!isNewsPlaying) {
    playNextNews(currentNewsQueue[currentNewsIndex].text);
  }
}

// 右端から流して左に消えるロジック
function playNextNews(htmlText) {
  isNewsPlaying = true;
  const el = document.querySelector('.news-text');
  const container = document.querySelector('.news-ticker');
  
  // CSSアニメーションを無効化し、HTMLをセット
  el.style.transition = 'none';
  el.style.animation = 'none';
  el.innerHTML = htmlText;
  
  // 画面の描画を待つ
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // 初期位置をコンテナの右端ギリギリ見えない場所にセット
      const containerWidth = container.offsetWidth;
      el.style.transform = `translateX(${containerWidth}px)`;
      
      requestAnimationFrame(() => {
        // テキストの長さを取得し、移動距離と速度を計算
        const textWidth = el.offsetWidth;
        const totalDist = containerWidth + textWidth;
        const speed = 80; // 1秒間に70px進む (長文ほど表示時間が長くなる)
        const duration = totalDist / speed;
        
        // 移動開始
        el.style.transition = `transform ${duration}s linear`;
        el.style.transform = `translateX(-${textWidth}px)`;
        
        el.removeEventListener('transitionend', onNewsEnd);
        el.addEventListener('transitionend', onNewsEnd, { once: true });
      });
    });
  });
}

// 流れ終わったら次を呼ぶ
function onNewsEnd() {
  isNewsPlaying = false;
  if (currentNewsQueue.length > 0) {
    currentNewsIndex = (currentNewsIndex + 1) % currentNewsQueue.length;
    playNextNews(currentNewsQueue[currentNewsIndex].text);
  } else {
    playNextNews("🔔 ぼくらの無限塔へようこそ！");
  }
}


// --- 魔の激動バフの計算関数 ---
function getTotalGekidoBuff(p) {
  let total = 0;
  for (let f = 1; f <= (p.maxClearedFloor || 1); f += 50) {
    const fd = generateFloorData(f);
    const count = p.inventory?.[fd.gekido.name] || 0;
    const rank = getCollectionRank(count); // main.js内にある既存の関数
    total += fd.gekido.baseBuff * rank.mult;
  }
  return total;
}

// --- 遡及EXP付与 ---
function applyGekidoBonus() {
  const stats = ["str", "vit", "agi", "lck"];
  let totalGekidoBuff = getTotalGekidoBuff(player);
  const prevBuff = player.lastGekidoBuff || 0;
  const diffBuff = totalGekidoBuff - prevBuff;
  
  if (diffBuff <= 0) return;

  stats.forEach(s => {
    let currentLv = player.lv[s];
    let totalExp = 0;
    for (let i = 1; i < currentLv; i++) totalExp += getRequiredExp(i);
    totalExp += player.exp[s];

    let bonusExp = Math.floor(totalExp * (diffBuff / 100));
    player.exp[s] += bonusExp;
    
    let reqExp = getRequiredExp(player.lv[s]);
    while (player.exp[s] >= reqExp) {
      player.exp[s] -= reqExp;
      player.lv[s]++;
      reqExp = getRequiredExp(player.lv[s]);
    }
  });

  player.lastGekidoBuff = totalGekidoBuff;
  playSound('win');
}

// ==========================================
// 👤 プレイヤープロフィール表示イベント
// ==========================================
document.addEventListener('click', (e) => {
  const nameEl = e.target.closest('.clickable-name');
  if (nameEl) {
    const targetName = nameEl.dataset.name || nameEl.textContent.trim();
    if (targetName) {
      openProfileModal(targetName);
    }
  }
});
