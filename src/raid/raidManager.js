// src/raid/raidManager.js

import { subscribeRaidData, updateRaidState, toggleRaidWaiting, getCachedBuffLevel, GLOBAL_BUFFS, claimRaidReward } from '../firebase.js';
import { formatNumber } from '../main.js';
import { playSound } from '../audio.js';
import { startRaidBattleAnimation } from './raidBattle.js';
import { updateTicketCount } from '../gacha/gachaUI.js';

let playerRef = null;
let currentRaidData = null;
let countdownInterval = null;

const RAID_HOURS =[0, 3, 6, 9, 12, 15,16, 18, 21];
const RAID_DURATION_MINUTES = 50;

export function initRaidManager(playerObj) {
  playerRef = playerObj;
  subscribeRaidData((data) => {
    currentRaidData = data;
    checkAndRenderRaid();
    renderGlobalBuffs(); // バフ一覧も更新
  });
  countdownInterval = setInterval(checkAndRenderRaid, 1000);
}

export function cancelRaidWaitingIfActive() {
  if (currentRaidData && !currentRaidData.isOpen && currentRaidData.waitingPlayers?.includes(playerRef.name)) {
    toggleRaidWaiting(playerRef.name, false);
  }
}

// スケジュール判定（レイドを一意のIDで管理する）
function getRaidSchedule() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  
  let startH = 0;
  for(let i = RAID_HOURS.length - 1; i >= 0; i--) {
     if(h >= RAID_HOURS[i]) { startH = RAID_HOURS[i]; break; }
  }
  
  const isRaidTime = (h === startH) && (m < RAID_DURATION_MINUTES);
  
  const yy = now.getFullYear();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const hh = String(startH).padStart(2,'0');
  const currentRaidId = `${yy}${mm}${dd}_${hh}`;
  
  let nextRaidTime = new Date(now);
  if (isRaidTime) {
    nextRaidTime.setMinutes(RAID_DURATION_MINUTES, 0, 0);
  } else {
    let nextH = RAID_HOURS.find(hour => hour > h);
    if (nextH === undefined) {
      nextH = RAID_HOURS[0];
      nextRaidTime.setDate(now.getDate() + 1); 
    }
    nextRaidTime.setHours(nextH, 0, 0, 0);
  }
  
  const diff = nextRaidTime - now;
  const t_mm = Math.floor(diff / 60000);
  const t_ss = Math.floor((diff % 60000) / 1000);
  const timeStr = `${String(t_mm).padStart(2,'0')}:${String(t_ss).padStart(2,'0')}`;
  
  return { isRaidTime, timeStr, currentRaidId };
}

// バフ一覧の描画
function renderGlobalBuffs() {
  const buffLv = getCachedBuffLevel();
  const panel = document.getElementById('raid-buff-panel');
  const list = document.getElementById('raid-buff-list');
  if (!panel || !list) return;

  if (buffLv <= 0) {
    panel.style.display = 'none';
    return;
  }
  
  panel.style.display = 'block';
  list.innerHTML = '';
  for(let i = 1; i <= Math.min(buffLv, 9); i++) {
    if (GLOBAL_BUFFS[i]) {
      list.innerHTML += `<li><span style="color:#ffeb85; font-weight:bold;">${GLOBAL_BUFFS[i].name}</span>: ${GLOBAL_BUFFS[i].desc}</li>`;
    }
  }
}

async function checkAndRenderRaid() {
  const container = document.getElementById('raid-content');
  const panel = document.getElementById('raid-panel');
  const title = document.getElementById('raid-title');
  if (!container || !panel || !title) return;

  const sched = getRaidSchedule();

  // ★新しいレイド時間の開始時に初期化する
  if (sched.isRaidTime && (!currentRaidData || currentRaidData.raidId !== sched.currentRaidId)) {
    const nextLv = (currentRaidData && currentRaidData.level) ? currentRaidData.level : 1;
    const baseHp = Math.floor(50000 * Math.pow(1.5, nextLv - 1));
    await updateRaidState({
      raidId: sched.currentRaidId,
      level: nextLv, maxHp: baseHp, currentHp: baseHp,
      isActive: true, isOpen: false, isDefeated: false,
      waitingPlayers:[], participants: {}
    });
    return;
  }

  // --- 報酬受け取り判定 ---
  const myData = currentRaidData?.participants?.[playerRef.name];
  const isFinished = !sched.isRaidTime || currentRaidData?.isDefeated;
  const canClaim = isFinished && myData && !myData.claimed;

  if (canClaim) {
    // 報酬計算
    const baseTickets = 150; // ベース
    const levelMult = currentRaidData.level;
    const damagePercent = 1 - (currentRaidData.currentHp / currentRaidData.maxHp);
    let rewardTickets = Math.floor(baseTickets * levelMult * damagePercent);
    let rankText = "";

    // 討伐成功時の順位報酬
    if (currentRaidData.isDefeated) {
      const participants = Object.entries(currentRaidData.participants)
        .map(([name, data]) => ({ name, damage: data.damage }))
        .sort((a, b) => b.damage - a.damage);
      
      const myRank = participants.findIndex(p => p.name === playerRef.name) + 1;
      let rankBonus = 0;
      if (myRank === 1) rankBonus = 100 * levelMult;
      else if (myRank === 2) rankBonus = 70 * levelMult;
      else if (myRank === 3) rankBonus = 50 * levelMult;
      else rankBonus = 20 * levelMult; // 参加賞
      
      rewardTickets += rankBonus;
      rankText = `<div style="color:#5ce6e6; font-size:14px; margin-bottom:10px;">与ダメージ順位: ${myRank}位 (順位ボーナス獲得！)</div>`;
    }

    panel.style.background = 'radial-gradient(circle at center, #2b2511, #141108)';
    panel.style.borderColor = '#d4af37';
    title.style.display = 'block';
    title.textContent = '🎁 レイド報酬';
    title.style.color = '#d4af37';
    title.style.borderBottomColor = '#d4af37';

    container.innerHTML = `
      <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">前回参加したレイドの報酬が届いています！</div>
      ${rankText}
      <div style="font-size: 24px; font-weight: bold; color: #ffd166; margin-bottom: 15px;">ガチャチケ x${formatNumber(rewardTickets)}</div>
      <button id="btn-claim-raid" class="btn-fantasy" style="width:100%; padding:10px; background:linear-gradient(to bottom, #d4af37, #8a6d1c); color:#000;">報酬を受け取る</button>
    `;

    document.getElementById('btn-claim-raid').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = "受け取り中...";
      const success = await claimRaidReward(playerRef.name, rewardTickets);
      if(success) {
        playSound('win');
        updateTicketCount();
      } else {
        e.target.disabled = false;
        e.target.textContent = "エラー。再試行";
      }
    });
    return;
  }

  // --- 時間外 ---
  if (!sched.isRaidTime) {
    panel.style.background = 'transparent';
    panel.style.borderColor = 'transparent';
    panel.style.boxShadow = 'none';
    title.style.display = 'none';
    container.innerHTML = `
      <div style="font-size: 12px; color: #888; text-align:center;">次回のレイドボス襲来まで: <span style="font-family:monospace; color:#ccc;">${sched.timeStr}</span></div>
    `;
    return;
  }

  // --- 討伐済み (受取済) ---
  if (currentRaidData.isDefeated) {
    title.style.display = 'block';
    title.textContent = '🐉 ワールドレイド';
    title.style.color = '#ff6b6b';
    container.innerHTML = `
      <div style="font-size: 16px; color: #ffd166; font-weight: bold; margin-bottom: 5px;">🎉 レイドボスは討伐されました！</div>
      <div style="font-size: 12px; color: #aaa;">次回の襲来まで待機してください。<br>(残り時間: ${sched.timeStr})</div>
    `;
    return;
  }

  // --- ゲート待機中 ---
  if (!currentRaidData.isOpen) {
    // ... (前回の待機中UIとボタン処理をそのまま配置)
    const waiters = currentRaidData.waitingPlayers ||[];
    const isMeWaiting = waiters.includes(playerRef.name);
    panel.style.background = 'radial-gradient(circle at center, #2b0808, #110000)';
    panel.style.borderColor = '#ff3333';
    panel.style.boxShadow = '0 0 15px rgba(255,0,0,0.2)';
    title.style.display = 'block';
    title.textContent = '🐉 ワールドレイド';
    title.style.color = '#ff6b6b';
    
    let html = `
      <div style="font-size: 14px; color: #ffeb85; margin-bottom: 10px; animation: blink 1.5s infinite;">⚠️ ゲート解放貢献中... (${waiters.length}/2人)</div>
      <div style="font-size: 12px; color: #ccc; margin-bottom: 10px;">画面を開いたまま、他のプレイヤーを待ってください。<br>終了まで: ${sched.timeStr}</div>
    `;
    if (isMeWaiting) html += `<button id="btn-raid-cancel" class="btn-fantasy" style="width:80%; padding:8px; font-size:14px; background:#333; border-color:#555; display:block; margin:0 auto;">貢献をキャンセル</button>`;
    else html += `<button id="btn-raid-wait" class="btn-fantasy" style="width:80%; padding:8px; font-size:14px; background:linear-gradient(to bottom, #7a2020, #4a0d0d); border-color:#ff6b6b; display:block; margin:0 auto;">ゲート解放に貢献する</button>`;
    container.innerHTML = html;
    
    if (isMeWaiting) document.getElementById('btn-raid-cancel').addEventListener('click', () => { playSound('click'); toggleRaidWaiting(playerRef.name, false); });
    else document.getElementById('btn-raid-wait').addEventListener('click', () => { playSound('hit'); toggleRaidWaiting(playerRef.name, true); });
    return;
  }

  // --- ゲート解放済み (戦闘可能) ---
  const remainingTries = Math.max(0, 5 - (myData?.tries || 0));
  const hpPercent = (currentRaidData.currentHp / currentRaidData.maxHp) * 100;

  // ★与ダメランキングの生成
  const participantsList = Object.entries(currentRaidData.participants || {})
    .map(([name, data]) => ({ name, damage: data.damage }))
    .sort((a, b) => b.damage - a.damage);

  let rankHtml = '<div style="margin-top:15px; border-top:1px dashed #555; padding-top:10px; font-size:12px; text-align:left;">';
  rankHtml += '<div style="color:#aaa; margin-bottom:5px; text-align:center;">🏆 現在の与ダメージ順位</div>';
  participantsList.slice(0, 3).forEach((p, i) => { // Top 3
    const colors =["#ffd700", "#c0c0c0", "#cd7f32"];
    rankHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span style="color:${colors[i]}; font-weight:bold;">${i+1}位. ${p.name}</span><span style="color:#fff;">${formatNumber(p.damage)}</span></div>`;
  });
  if (participantsList.length === 0) rankHtml += '<div style="text-align:center; color:#777;">まだ攻撃したプレイヤーがいません</div>';
  rankHtml += '</div>';

  container.innerHTML = `
    <div style="font-size: 16px; color: #ff6b6b; font-weight: bold; margin-bottom: 5px;">😈 絶望の化身 Lv.${currentRaidData.level}</div>
    <div style="width:100%; background:#111; border:1px solid #ff3333; height:12px; border-radius:6px; margin-bottom:5px; position:relative; overflow:hidden;">
      <div style="width:${hpPercent}%; background:linear-gradient(to right, #cc0000, #ff6b6b); height:100%; transition:width 0.3s;"></div>
      <div style="position:absolute; top:0; left:0; width:100%; font-size:10px; font-weight:bold; color:#fff; line-height:12px;">
        ${formatNumber(Math.max(0, currentRaidData.currentHp))} / ${formatNumber(currentRaidData.maxHp)}
      </div>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:12px; color:#ccc; margin-bottom: 10px;">
      <span>終了まで: ${sched.timeStr}</span>
      <span style="color:#5ce6e6;">あなたの与ダメ: ${formatNumber(myData?.damage || 0)}</span>
    </div>
    <button id="btn-raid-battle" class="btn-fantasy" ${remainingTries <= 0 ? 'disabled' : ''} 
      style="width:100%; padding:10px; font-size:18px; margin:0 auto; display:block; ${remainingTries <= 0 ? 'opacity:0.5; cursor:not-allowed;' : 'background:linear-gradient(to bottom, #d4af37, #8a6d1c); color:#000;'}">
      レイドに挑戦！ (残り ${remainingTries} 回)
    </button>
    ${rankHtml}
  `;

  const btnBattle = document.getElementById('btn-raid-battle');
  if (btnBattle && remainingTries > 0) {
    btnBattle.addEventListener('click', () => {
      playSound('win');
      startRaidBattleAnimation(playerRef, currentRaidData, myData);
    });
  }
}