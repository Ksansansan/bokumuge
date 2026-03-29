// src/raid/raidManager.js

import { subscribeRaidData, updateRaidState, toggleRaidWaiting, getCachedBuffLevel, GLOBAL_BUFFS, claimRaidReward, getReliableTime, savePlayerData } from '../firebase.js';
import { formatNumber } from '../main.js';
import { playSound } from '../audio.js';
import { startRaidBattleAnimation } from './raidBattle.js';
import { updateTicketCount } from '../gacha/gachaUI.js';

let playerRef = null;
let currentRaidData = null;
let countdownInterval = null;
const RAID_HOURS =[0, 3, 6, 9, 12, 15, 18, 21];
const RAID_DURATION_MINUTES = 30;

export function initRaidManager(playerObj) {
  playerRef = playerObj;
  subscribeRaidData((data) => {
    currentRaidData = data;
    checkAndRenderRaid();
    renderGlobalBuffs();
  });
  countdownInterval = setInterval(checkAndRenderRaid, 1000);
}

export function cancelRaidWaitingIfActive() {
  if (currentRaidData && !currentRaidData.isOpen && currentRaidData.waitingPlayers?.includes(playerRef.name)) {
    toggleRaidWaiting(playerRef.name, false);
  }
}

function getRaidSchedule() {
 const now = new Date(getReliableTime()); 
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

  // --- 1. 新しいレイドの初期化 ---
  if (sched.isRaidTime && (!currentRaidData || currentRaidData.raidId !== sched.currentRaidId)) {
    const nextLv = (currentRaidData && currentRaidData.level) ? currentRaidData.level : 1;
    let baseHp = 2700;
    for (let i = 2; i <= nextLv; i++) {
      // 倍率を計算（3.0から開始し、Lvが上がるごとに0.25ずつ減る。下限1.5）
      let multiplier = Math.max(1.5, 3.0 - (i - 2) * 0.3);
      baseHp = Math.floor(baseHp * multiplier);
    }
    
    let prevData = null;
    if (currentRaidData && currentRaidData.participants) {
      prevData = {
        level: currentRaidData.level,
        maxHp: currentRaidData.maxHp,
        currentHp: currentRaidData.currentHp,
        isDefeated: currentRaidData.isDefeated,
        participants: currentRaidData.participants
      };
    }

    await updateRaidState({
      raidId: sched.currentRaidId,
      level: nextLv, maxHp: baseHp, currentHp: baseHp,
      isActive: true, isOpen: false, isDefeated: false,
      waitingPlayers:[], participants: {},
      lastRaidData: prevData
    });
    return;
  }

  // --- 2. 報酬受け取り判定 (最優先) ---
  // ★修正：前回の報酬を受け取っていないなら、今のレイド状況に関わらず報酬画面を優先する
  let targetDataForReward = null;
  let isFromLastRaid = false;

  // まず「前回」のデータで未受け取りがないか確認
  if (currentRaidData?.lastRaidData?.participants?.[playerRef.name] && !currentRaidData.lastRaidData.participants[playerRef.name].claimed) {
    targetDataForReward = currentRaidData.lastRaidData;
    isFromLastRaid = true;
  } 
  // 次に「今回」のデータで（レイドが終わっている場合）未受け取りがないか確認
  else if ((!sched.isRaidTime || currentRaidData?.isDefeated) && currentRaidData?.participants?.[playerRef.name] && !currentRaidData.participants[playerRef.name].claimed) {
    targetDataForReward = currentRaidData;
  }

  if (targetDataForReward) {
    const myData = targetDataForReward.participants[playerRef.name];
    const levelMult = targetDataForReward.isDefeated ? Math.max(1, targetDataForReward.level) : targetDataForReward.level;
    
    const baseTickets = 125;
    const damagePercent = 1 - (targetDataForReward.currentHp / targetDataForReward.maxHp);
    let rewardTickets = Math.floor(baseTickets * (levelMult - 1) * damagePercent);
    const contributionTickets = Math.floor((myData.damage / targetDataForReward.maxHp) * 100 * (levelMult - 1));
    rewardTickets += contributionTickets;
    let rankText = "";

    if (targetDataForReward.isDefeated) {
      const participants = Object.entries(targetDataForReward.participants)
        .map(([name, data]) => ({ name, damage: data.damage }))
        .sort((a, b) => b.damage - a.damage);
      
      const myRank = participants.findIndex(p => p.name === playerRef.name) + 1;
      let rankBonus = 0;
      if (myRank === 1) rankBonus = 100 * (levelMult - 1);
      else if (myRank === 2) rankBonus = 70 * (levelMult - 1);
      else if (myRank === 3) rankBonus = 50 * (levelMult - 1);
      else rankBonus = 25 * (levelMult - 1); 
      
      rewardTickets += rankBonus;
      rankText = `<div style="color:#5ce6e6; font-size:14px; margin-bottom:10px;">与ダメージ順位: ${myRank}位 (順位ボーナス獲得！)</div>`;
    }

    panel.style.background = 'radial-gradient(circle at center, #2b2511, #141108)';
    panel.style.borderColor = '#d4af37';
    panel.style.boxShadow = '0 0 15px rgba(212, 175, 55, 0.2)';
    panel.style.marginTop = '30px';
    title.style.display = 'block';
    title.textContent = '🎁 レイド報酬';
    title.style.color = '#d4af37';
    title.style.borderBottomColor = '#d4af37';

    // 既に描画されているなら上書きしない（ボタンイベントの重複防止）
    if (container.dataset.state !== 'reward') {
      container.dataset.state = 'reward';
      container.innerHTML = `
        <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">参加したレイドの報酬が届いています！</div>
        ${rankText}
        <div style="font-size: 24px; font-weight: bold; color: #ffd166; margin-bottom: 15px;">ガチャチケ x${formatNumber(rewardTickets)}</div>
        <button id="btn-claim-raid" class="btn-fantasy" style="width:100%; padding:10px; background:linear-gradient(to bottom, #d4af37, #8a6d1c); color:#000;">報酬を受け取る</button>
      `;

       document.getElementById('btn-claim-raid').addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = "受け取り中...";
        
        const success = await claimRaidReward(playerRef.name, rewardTickets, isFromLastRaid);
        
        if(success) {
          playSound('win');
          if (!playerRef.inventory) playerRef.inventory = {};
          playerRef.inventory["装備ガチャチケット"] = (playerRef.inventory["装備ガチャチケット"] || 0) + rewardTickets;
          updateTicketCount();
          
          // ★追加：増えたチケットを即座にプレイヤーデータとしてセーブする
          await savePlayerData(playerRef);
          
          // ★追加：通信ラグでボタンが復活しないよう、ローカルのレイドデータも「受け取り済み」に書き換えてしまう
          if (isFromLastRaid) {
            currentRaidData.lastRaidData.participants[playerRef.name].claimed = true;
          } else {
            currentRaidData.participants[playerRef.name].claimed = true;
          }
          
          container.dataset.state = ''; // 状態リセット
          checkAndRenderRaid(); // 再描画（ローカルがclaimed=trueになったので、次の画面へ進む）
        } else {
          // 既に受け取っていた場合やエラーの場合
          e.target.disabled = false;
          e.target.textContent = "既に受け取り済み、またはエラー";
          
          // エラーになった場合でも、念のため状態をリセットして再描画
          setTimeout(() => {
            container.dataset.state = '';
            checkAndRenderRaid();
          }, 1500);
        }
      });
    }
    return;
  }

  // --- 3. 時間外 ---
  if (!sched.isRaidTime) {
    panel.style.background = 'transparent';
    panel.style.borderColor = 'transparent';
    panel.style.boxShadow = 'none';
    panel.style.marginTop = '15px';
    title.style.display = 'none';

    // タイマー部分だけを更新する（DOM全体を作らない）
    if (container.dataset.state !== 'offline') {
      container.dataset.state = 'offline';
      container.innerHTML = `
        <div style="font-size: 12px; color: #888; text-align:center;">次回のレイドボス襲来まで: <span id="raid-offline-timer" style="font-family:monospace; color:#ccc;">${sched.timeStr}</span></div>
      `;
    } else {
      document.getElementById('raid-offline-timer').textContent = sched.timeStr;
    }
    return;
  }

  // --- 4. 討伐済み ---
  // --- 4. 討伐済み ---
  if (currentRaidData.isDefeated) {
    panel.style.background = 'radial-gradient(circle at center, #2b0808, #110000)';
    panel.style.borderColor = '#ff3333';
    panel.style.boxShadow = '0 0 15px rgba(255,0,0,0.2)';
    panel.style.marginTop = '30px';
    title.style.display = 'block';
    title.textContent = '🐉 ワールドレイド';
    title.style.color = '#ff6b6b';
    title.style.borderBottomColor = '#ff3333';

    // 次回の開始時間を計算
    const now = new Date(getReliableTime()); // ★ここもサーバー時間基準にする
    let nextH = RAID_HOURS.find(hour => hour > now.getHours());
    let nextTime = new Date(now);
    if (nextH === undefined) {
      nextH = RAID_HOURS[0];
      nextTime.setDate(now.getDate() + 1);
    }
    nextTime.setHours(nextH, 0, 0, 0);
    const diff = nextTime - now;
    const mm = Math.floor(diff / 60000);
    const ss = Math.floor((diff % 60000) / 1000);
    const nextTimeStr = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    // ★追加：最終ランキングの生成
    const participantsList = Object.entries(currentRaidData.participants || {})
      .map(([name, data]) => ({ name, damage: data.damage }))
      .sort((a, b) => b.damage - a.damage);

    let rankHtml = '';
    participantsList.forEach((p, i) => { 
      const colors = ["#ffd700", "#c0c0c0", "#cd7f32"];
      const c = i < 3 ? colors[i] : "#fff";
      const bg = p.name === playerRef.name ? 'rgba(92, 230, 230, 0.2)' : 'transparent';
      
      rankHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:2px; background:${bg}; padding: 2px 4px; border-radius: 3px;">
        <div>
          <span style="color:${c}; font-weight:bold; margin-right:5px;">${i+1}位.</span>
          <span class="clickable-name" data-name="${p.name}" style="color:${c}; font-weight:bold;">${p.name}</span>
        </div>
        <span style="color:#fff; font-family:monospace;">${formatNumber(p.damage)}</span>
      </div>`;
    });
    if (participantsList.length === 0) rankHtml = '<div style="text-align:center; color:#777;">まだ攻撃したプレイヤーがいません</div>';

    // UIへの反映
    if (container.dataset.state !== 'defeated') {
      container.dataset.state = 'defeated';
      // 討伐されたボスのLvではなく、現在発動しているバフLv(= ボスLv - 1)を表示
      const activeBuffLv = Math.max(1, (currentRaidData.level || 1) - 1); 
      
      container.innerHTML = `
        <div style="font-size: 16px; color: #ffd166; font-weight: bold; margin-bottom: 5px;">🎉 レイドボスは討伐されました！</div>
        <div style="font-size: 12px; color: #aaa;">次回の襲来まで待機してください。<br>(次回まで: <span id="raid-defeated-timer" style="font-family:monospace; color:#fff;">${nextTimeStr}</span>)</div>
        
        <div style="margin-top:10px; background:rgba(255,215,0,0.1); border:1px dashed #ffd700; padding:8px; border-radius:4px; margin-bottom: 10px;">
          <span style="color:#ffd700; font-weight:bold; font-size:14px;">現在のアクティブバフ (Lv.${activeBuffLv})</span><br>
          <span style="font-size:12px; color:#fff;">すべてのプレイヤーに永続効果が発動中！</span>
        </div>

        <!-- ★追加：討伐後のランキング表示枠 -->
        <div style="border-top:1px dashed #555; padding-top:10px; font-size:12px; text-align:left;">
          <div style="color:#aaa; margin-bottom:5px; text-align:center;">🏆 最終与ダメージ順位</div>
          <div id="raid-rank-scroll" style="max-height: 100px; overflow-y: auto; padding-right: 5px;">
            <div id="raid-defeated-ranking">${rankHtml}</div>
          </div>
        </div>
      `;
    } else {
      document.getElementById('raid-defeated-timer').textContent = nextTimeStr;
      // ランキングが更新された場合（遅延して誰かのダメージが反映された場合など）に備えて更新
      const rankContainer = document.getElementById('raid-defeated-ranking');
      if (rankContainer && rankContainer.innerHTML !== rankHtml) {
        rankContainer.innerHTML = rankHtml;
      }
    }
    return;
  }

  // --- 5. ゲート待機中 ---
  if (!currentRaidData.isOpen) {
    panel.style.background = 'radial-gradient(circle at center, #2b0808, #110000)';
    panel.style.borderColor = '#ff3333';
    panel.style.boxShadow = '0 0 15px rgba(255,0,0,0.2)';
    panel.style.marginTop = '30px';
    title.style.display = 'block';
    title.textContent = '🐉 ワールドレイド';
    title.style.color = '#ff6b6b';
    title.style.borderBottomColor = '#ff3333';

    const waiters = currentRaidData.waitingPlayers ||[];
    const isMeWaiting = waiters.includes(playerRef.name);
    
    // 状態が変わった時だけ全体を再描画
    const currentStateStr = `wait_${isMeWaiting}_${waiters.length}`;
    if (container.dataset.state !== currentStateStr) {
      container.dataset.state = currentStateStr;
      
      let html = `
        <div style="font-size: 14px; color: #ffeb85; margin-bottom: 10px; animation: blink 1.5s infinite;">⚠️ ゲート解放貢献中... (${waiters.length}/2人)</div>
        <div style="font-size: 12px; color: #ccc; margin-bottom: 10px;">画面を開いたまま、他のプレイヤーを待ってください。<br>終了まで: <span id="raid-wait-timer">${sched.timeStr}</span></div>
      `;
      if (isMeWaiting) html += `<button id="btn-raid-cancel" class="btn-fantasy" style="width:80%; padding:8px; font-size:14px; background:#333; border-color:#555; display:block; margin:0 auto;">やっぱ貢献やめる</button>`;
      else html += `<button id="btn-raid-wait" class="btn-fantasy" style="width:80%; padding:8px; font-size:14px; background:linear-gradient(to bottom, #7a2020, #4a0d0d); border-color:#ff6b6b; display:block; margin:0 auto;">ゲート解放に貢献する</button>`;
      container.innerHTML = html;
      
      if (isMeWaiting) document.getElementById('btn-raid-cancel').addEventListener('click', () => { playSound('click'); toggleRaidWaiting(playerRef.name, false); });
      else document.getElementById('btn-raid-wait').addEventListener('click', () => { playSound('hit'); toggleRaidWaiting(playerRef.name, true); });
    } else {
      document.getElementById('raid-wait-timer').textContent = sched.timeStr;
    }
    return;
  }

  // --- 6. ゲート解放済み (戦闘可能) ---
  panel.style.background = 'radial-gradient(circle at center, #2b0808, #110000)';
  panel.style.borderColor = '#ff3333';
  panel.style.boxShadow = '0 0 15px rgba(255,0,0,0.2)';
  panel.style.marginTop = '30px';
  title.style.display = 'block';
  title.textContent = '🐉 ワールドレイド';
  title.style.color = '#ff6b6b';
  title.style.borderBottomColor = '#ff3333';

  const myCurrentData = (currentRaidData.participants && currentRaidData.participants[playerRef.name]) || { damage: 0, tries: 0 };
  const remainingTries = Math.max(0, 5 - myCurrentData.tries);
  const hpPercent = (currentRaidData.currentHp / currentRaidData.maxHp) * 100;

  const participantsList = Object.entries(currentRaidData.participants || {})
    .map(([name, data]) => ({ name, damage: data.damage }))
    .sort((a, b) => b.damage - a.damage);

    // ★ 追加：次回のバフ情報を取得
  const nextBuff = GLOBAL_BUFFS[currentRaidData.level];
  const buffInfoHtml = nextBuff ? `
    <div style="margin-bottom:10px; background:rgba(255,215,0,0.1); border:1px solid #ffd700; padding:8px; border-radius:4px; text-align:left;">
      <div style="color:#ffd700; font-weight:bold; font-size:11px; margin-bottom:3px; text-align:center;">🌟 初回討伐報酬 (Lv.${currentRaidData.level})</div>
      <div style="font-size:11px; color:#fff;"><span style="color:#ffeb85; font-weight:bold;">${nextBuff.name}</span>: ${nextBuff.desc}</div>
    </div>
  ` : '';

  // 初回だけDOMの骨組みを作り、以降は中身のテキストや幅だけを更新する
  if (container.dataset.state !== 'battle') {
    container.dataset.state = 'battle';
    
    container.innerHTML = `
      <div style="font-size: 16px; color: #ff6b6b; font-weight: bold; margin-bottom: 5px;">😈 絶望の化身 Lv.<span id="raid-live-lv">${currentRaidData.level}</span></div>
      <div style="width:100%; background:#111; border:1px solid #ff3333; height:12px; border-radius:6px; margin-bottom:5px; position:relative; overflow:hidden;">
        <div id="raid-live-hp-bar" style="width:${hpPercent}%; background:linear-gradient(to right, #cc0000, #ff6b6b); height:100%; transition:width 0.3s;"></div>
        <div id="raid-live-hp-text" style="position:absolute; top:0; left:0; width:100%; font-size:10px; font-weight:bold; color:#fff; line-height:12px;">
          ${formatNumber(Math.max(0, currentRaidData.currentHp))} / ${formatNumber(currentRaidData.maxHp)}
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:12px; color:#ccc; margin-bottom: 10px;">
        <span>終了まで: <span id="raid-live-timer">${sched.timeStr}</span></span>
        <span style="color:#5ce6e6;">あなたの与ダメ: <span id="raid-live-my-dmg">${formatNumber(myCurrentData.damage)}</span></span>
      </div>
      <button id="btn-raid-battle" class="btn-fantasy" ${remainingTries <= 0 ? 'disabled' : ''} 
        style="width:100%; padding:10px; font-size:18px; margin:0 auto; display:block; ${remainingTries <= 0 ? 'opacity:0.5; cursor:not-allowed;' : 'background:linear-gradient(to bottom, #d4af37, #8a6d1c); color:#000;'}">
        レイドに挑戦！ (残り <span id="raid-live-tries">${remainingTries}</span> 回)
      </button>
      
      <div style="margin-top:15px; border-top:1px dashed #555; padding-top:10px; font-size:12px; text-align:left;">
      ${buffInfoHtml}  
      <div style="color:#aaa; margin-bottom:5px; text-align:center;">🏆 現在の与ダメージ順位</div>
        <div id="raid-rank-scroll" style="max-height: 100px; overflow-y: auto; padding-right: 5px;">
          <div id="raid-live-ranking"></div>
        </div>
      </div>
    `;

    const btnBattle = document.getElementById('btn-raid-battle');
    if (btnBattle && remainingTries > 0) {
      btnBattle.addEventListener('click', () => {
        playSound('win');
        startRaidBattleAnimation(playerRef, currentRaidData, myCurrentData);
      });
    }
  } else {
    // 骨組みが既にある場合は、必要な要素だけを更新する（これでスクロールが戻らない！）
    document.getElementById('raid-live-lv').textContent = currentRaidData.level;
    document.getElementById('raid-live-hp-bar').style.width = `${hpPercent}%`;
    document.getElementById('raid-live-hp-text').textContent = `${formatNumber(Math.max(0, currentRaidData.currentHp))} / ${formatNumber(currentRaidData.maxHp)}`;
    document.getElementById('raid-live-timer').textContent = sched.timeStr;
    document.getElementById('raid-live-my-dmg').textContent = formatNumber(myCurrentData.damage);
    
    // ボタンの更新
    const btnBattle = document.getElementById('btn-raid-battle');
    document.getElementById('raid-live-tries').textContent = remainingTries;
    if (remainingTries <= 0) {
      btnBattle.disabled = true;
      btnBattle.style.opacity = '0.5';
      btnBattle.style.cursor = 'not-allowed';
      btnBattle.style.background = '';
    }
  }

  // --- 6. ゲート解放済み (戦闘可能) のランキング生成部分 ---
  // ★ 修正：名前に clickable-name クラスと data-name 属性を追加
  let rankHtml = '';
  participantsList.forEach((p, i) => { 
    const colors =["#ffd700", "#c0c0c0", "#cd7f32"];
    const c = i < 3 ? colors[i] : "#fff";
    const bg = p.name === playerRef.name ? 'rgba(92, 230, 230, 0.2)' : 'transparent';
    
    rankHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:2px; background:${bg}; padding: 2px 4px; border-radius: 3px;">
      <div>
        <span style="color:${c}; font-weight:bold; margin-right:5px;">${i+1}位.</span>
        <span class="clickable-name" data-name="${p.name}" style="color:${c}; font-weight:bold;">${p.name}</span>
      </div>
      <span style="color:#fff; font-family:monospace;">${formatNumber(p.damage)}</span>
    </div>`;
  });
  if (participantsList.length === 0) rankHtml = '<div style="text-align:center; color:#777;">まだ攻撃したプレイヤーがいません</div>';
  
  // スクロールコンテナの中身だけを書き換える
  const rankContainer = document.getElementById('raid-live-ranking');
  if (rankContainer && rankContainer.innerHTML !== rankHtml) {
     rankContainer.innerHTML = rankHtml;
  }
}
