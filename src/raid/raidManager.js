// src/raid/raidManager.js
import { subscribeRaidData, updateRaidState, toggleRaidWaiting } from '../firebase.js';
import { formatNumber } from '../main.js';
import { playSound } from '../audio.js';
import { startRaidBattleAnimation } from './raidBattle.js';

let playerRef = null;
let currentRaidData = null;
let countdownInterval = null;

// 3時間ごとのスケジュール設定
const RAID_HOURS =[0, 3, 6, 9, 12, 15,16, 18, 21];
const RAID_DURATION_MINUTES = 30;

export function initRaidManager(playerObj) {
  playerRef = playerObj;
  
  // リアルタイム同期開始
  subscribeRaidData((data) => {
    currentRaidData = data;
    checkAndRenderRaid();
  });

  // 1秒ごとにタイマーを回す
  countdownInterval = setInterval(checkAndRenderRaid, 1000);
}

// ★追加：タブ切り替え時などに自動でキャンセルする関数
export function cancelRaidWaitingIfActive() {
  if (currentRaidData && !currentRaidData.isOpen && currentRaidData.waitingPlayers?.includes(playerRef.name)) {
    toggleRaidWaiting(playerRef.name, false);
  }
}

// 現在がレイド時間内かどうかを判定し、残り時間を返す
function getRaidSchedule() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  
  const isRaidTime = RAID_HOURS.includes(h) && m < RAID_DURATION_MINUTES;
  
  let nextRaidTime = new Date(now);
  if (isRaidTime) {
    // 終了までの時間
    nextRaidTime.setMinutes(RAID_DURATION_MINUTES, 0, 0);
  } else {
    // 次の開始までの時間
    let nextH = RAID_HOURS.find(hour => hour > h);
    if (nextH === undefined) {
      nextH = RAID_HOURS[0];
      nextRaidTime.setDate(now.getDate() + 1); // 翌日
    }
    nextRaidTime.setHours(nextH, 0, 0, 0);
  }
  
  const diff = nextRaidTime - now;
  const mm = Math.floor(diff / 60000);
  const ss = Math.floor((diff % 60000) / 1000);
  const timeStr = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  
  return { isRaidTime, timeStr };
}

// レイドの状態をUIに描画する
async function checkAndRenderRaid() {
  const container = document.getElementById('raid-content');
  const panel = document.getElementById('raid-panel');
  const title = document.getElementById('raid-title');
  if (!container || !panel || !title) return;

  const sched = getRaidSchedule();

  // --- 1. レイド時間外 (控えめな表示) ---
  if (!sched.isRaidTime) {
    panel.style.background = 'transparent';
    panel.style.borderColor = 'transparent';
    panel.style.boxShadow = 'none';
    panel.style.marginTop = '15px';
    title.style.display = 'none'; // タイトルも隠す

    container.innerHTML = `
      <div style="font-size: 12px; color: #888; text-align:center;">次回のレイドボス襲来まで: <span style="font-family:monospace; color:#ccc;">${sched.timeStr}</span></div>
    `;
    
    if (currentRaidData && currentRaidData.isActive) {
      await updateRaidState({ isActive: false, isOpen: false, waitingPlayers:[], isDefeated: false });
    }
    return;
  }

  // --- 2. レイド時間内 (派手な表示) ---
  panel.style.background = 'radial-gradient(circle at center, #2b0808, #110000)';
  panel.style.borderColor = '#ff3333';
  panel.style.boxShadow = '0 0 15px rgba(255,0,0,0.2)';
  panel.style.marginTop = '30px';
  title.style.display = 'block'; // タイトルを出す

  // --- 2. レイド時間内だが、まだデータが作成されていない場合（最初の1人が初期化） ---
  if (!currentRaidData || !currentRaidData.isActive) {
    const nextLv = (currentRaidData && currentRaidData.level) ? currentRaidData.level : 1;
    // 仮のHP計算：レベルが上がるごとにHP爆増 (後日バランス調整可能)
    const baseHp = 100000 * Math.pow(1.5, nextLv - 1);
    
    await updateRaidState({
      level: nextLv, maxHp: baseHp, currentHp: baseHp,
      isActive: true, isOpen: false, isDefeated: false,
      waitingPlayers:[], participants: {}
    });
    return;
  }

  // --- 3. ボス討伐済み ---
  if (currentRaidData.isDefeated) {
    const buffLv = currentRaidData.defeatedCount || 0;
    container.innerHTML = `
      <div style="font-size: 16px; color: #ffd166; font-weight: bold; margin-bottom: 5px;">🎉 レイドボスは討伐されました！</div>
      <div style="font-size: 12px; color: #aaa;">次回の襲来まで待機してください。<br>(残り時間: ${sched.timeStr})</div>
      <div style="margin-top:10px; background:rgba(255,215,0,0.1); border:1px dashed #ffd700; padding:8px; border-radius:4px;">
        <span style="color:#ffd700; font-weight:bold; font-size:14px;">現在のアクティブバフ (Lv.${buffLv})</span><br>
        <span style="font-size:12px; color:#fff;">すべてのプレイヤーに永続効果が発動中！</span>
      </div>
    `;
    return;
  }

  // --- 4. ゲート解放待機中 (isOpen === false) ---
  if (!currentRaidData.isOpen) {
    const waiters = currentRaidData.waitingPlayers ||[];
    const isMeWaiting = waiters.includes(playerRef.name);
    
    let html = `
      <div style="font-size: 14px; color: #ffeb85; margin-bottom: 10px; animation: blink 1.5s infinite;">⚠️ ゲート解放待機中... (${waiters.length}/2人)</div>
      <div style="font-size: 12px; color: #ccc; margin-bottom: 10px;">画面を開いたまま、他のプレイヤーを待ってください。<br>終了まで: ${sched.timeStr}</div>
    `;
    
    if (isMeWaiting) {
      html += `<button id="btn-raid-cancel" class="btn-fantasy" style="width:80%; padding:8px; font-size:14px; background:#333; border-color:#555; display:block; margin:0 auto;">待機をキャンセル</button>`;
    } else {
      html += `<button id="btn-raid-wait" class="btn-fantasy" style="width:80%; padding:8px; font-size:14px; background:linear-gradient(to bottom, #7a2020, #4a0d0d); border-color:#ff6b6b; display:block; margin:0 auto;">ゲート待機列に並ぶ</button>`;
    }
    
    container.innerHTML = html;
    
    // イベント登録
    if (isMeWaiting) {
      document.getElementById('btn-raid-cancel').addEventListener('click', () => { playSound('click'); toggleRaidWaiting(playerRef.name, false); });
    } else {
      document.getElementById('btn-raid-wait').addEventListener('click', () => { playSound('hit'); toggleRaidWaiting(playerRef.name, true); });
    }
    return;
  }

  // --- 5. ゲート解放済み！ (戦闘可能) ---
  // 参加データの取得
  const myData = (currentRaidData.participants && currentRaidData.participants[playerRef.name]) || { damage: 0, tries: 0 };
  const remainingTries = Math.max(0, 5 - myData.tries);
  const hpPercent = (currentRaidData.currentHp / currentRaidData.maxHp) * 100;

  container.innerHTML = `
    <div style="font-size: 16px; color: #ff6b6b; font-weight: bold; margin-bottom: 5px;">😈 絶望の化身 Lv.${currentRaidData.level}</div>
    
    <!-- 全体HPバー -->
    <div style="width:100%; background:#111; border:1px solid #ff3333; height:12px; border-radius:6px; margin-bottom:5px; position:relative; overflow:hidden;">
      <div style="width:${hpPercent}%; background:linear-gradient(to right, #cc0000, #ff6b6b); height:100%; transition:width 0.3s;"></div>
      <div style="position:absolute; top:0; left:0; width:100%; font-size:10px; font-weight:bold; color:#fff; line-height:12px;">
        ${formatNumber(Math.max(0, currentRaidData.currentHp))} / ${formatNumber(currentRaidData.maxHp)}
      </div>
    </div>
    
    <div style="display:flex; justify-content:space-between; font-size:12px; color:#ccc; margin-bottom: 10px;">
      <span>終了まで: ${sched.timeStr}</span>
      <span style="color:#5ce6e6;">あなたの与ダメ: ${formatNumber(myData.damage)}</span>
    </div>
    
    <button id="btn-raid-battle" class="btn-fantasy" ${remainingTries <= 0 ? 'disabled' : ''} 
      style="width:100%; padding:10px; font-size:18px; ${remainingTries <= 0 ? 'opacity:0.5; cursor:not-allowed;' : 'background:linear-gradient(to bottom, #d4af37, #8a6d1c); color:#000;'}">
      レイドに挑戦！ (残り ${remainingTries} 回)
    </button>
  `;

  // ★ 修正：挑戦ボタンでバトルアニメーションを開始
  const btnBattle = document.getElementById('btn-raid-battle');
  if (btnBattle && remainingTries > 0) {
    btnBattle.addEventListener('click', () => {
      playSound('win');
      startRaidBattleAnimation(playerRef, currentRaidData, myData);
    });
  }
}