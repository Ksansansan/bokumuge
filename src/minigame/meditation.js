// src/minigame/meditation.js
import { getReliableTime, savePlayerData } from '../firebase.js';
import { formatNumber } from '../main.js';
import { getLevelMultiplier } from './minigameCore.js';
import { updateTicketCount } from '../gacha/gachaUI.js';
import { playSound } from '../audio.js';

let playerRef = null;
let onUpdateUI = null;

const MAX_OFFLINE_MS = 12 * 60 * 60 * 1000; // 12時間
const STAT_TICK_MS = 20 * 60 * 1000; // 20分
const TICKET_TICK_MS = 10 * 60 * 1000; // 10分

export function initMeditation(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateUI = updateUIFn;

  const selectEl = document.getElementById('md-target-select');
  selectEl.value = playerRef.meditation.target;
  
  // ターゲット変更時
  selectEl.addEventListener('change', (e) => {
    playerRef.meditation.target = e.target.value;
    savePlayerData(playerRef);
    updateDisplay();
  });

  document.getElementById('md-btn-claim').addEventListener('click', claimRewards);

  // 1秒ごとに表示を更新
  setInterval(updateDisplay, 1000);
  updateDisplay();
}

function updateDisplay() {
  const now = getReliableTime();
  
  // 最大12時間の制限を考慮して経過時間を計算
  const elapsedStat = Math.min(now - playerRef.meditation.lastStatTime, MAX_OFFLINE_MS);
  const elapsedTicket = Math.min(now - playerRef.meditation.lastTicketTime, MAX_OFFLINE_MS);
  
  const displayMs = Math.max(elapsedStat, elapsedTicket);
  
  const h = Math.floor(displayMs / 3600000);
  const m = Math.floor((displayMs % 3600000) / 60000);
  const s = Math.floor((displayMs % 60000) / 1000);
  
  document.getElementById('md-elapsed-time').textContent = 
    `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  // 報酬回数の計算
  const statTicks = Math.floor(elapsedStat / STAT_TICK_MS);
  const ticketTicks = Math.floor(elapsedTicket / TICKET_TICK_MS);

  // ステータス獲得量計算: 5 × (特訓Lvによるボーナス)
  const target = playerRef.meditation.target;
  const totalLevel = playerRef.lv.str + playerRef.lv.vit + playerRef.lv.agi + playerRef.lv.lck;
  const multiplier = getLevelMultiplier(playerRef.lv[target], totalLevel);
  const statGain = statTicks * Math.floor(5 * multiplier);

  // チケット獲得量計算 (バトルと同じ式)
  const currentLck = playerRef.battleStats?.lck || playerRef.lck || 0;
  let ticketsPerTick = 1;
  if (currentLck >= 100) {
    ticketsPerTick += Math.max(0, Math.floor(Math.log(currentLck / 100) / Math.log(3)));
  }
  const ticketGain = ticketTicks * ticketsPerTick;

  // UI反映
  document.getElementById('md-est-stats').textContent = `+${formatNumber(statGain)}`;
  const colors = { str:"#ff6b6b", vit:"#6be6ff", agi:"#94ff6b", lck:"#ffd166" };
  document.getElementById('md-est-stats').style.color = colors[target];
  
  document.getElementById('md-est-tickets').textContent = `${formatNumber(ticketGain)} 枚`;
  
  // 受け取りボタンの活性化
  const btn = document.getElementById('md-btn-claim');
  if (statGain > 0 || ticketGain > 0) {
    btn.style.opacity = 1;
    btn.style.pointerEvents = 'auto';
  } else {
    btn.style.opacity = 0.5;
    btn.style.pointerEvents = 'none';
  }
}

async function claimRewards() {
  const now = getReliableTime();
  
  const elapsedStat = Math.min(now - playerRef.meditation.lastStatTime, MAX_OFFLINE_MS);
  const elapsedTicket = Math.min(now - playerRef.meditation.lastTicketTime, MAX_OFFLINE_MS);
  
  const statTicks = Math.floor(elapsedStat / STAT_TICK_MS);
  const ticketTicks = Math.floor(elapsedTicket / TICKET_TICK_MS);

  if (statTicks === 0 && ticketTicks === 0) return;

  const target = playerRef.meditation.target;
  const totalLevel = playerRef.lv.str + playerRef.lv.vit + playerRef.lv.agi + playerRef.lv.lck;
  const multiplier = getLevelMultiplier(playerRef.lv[target], totalLevel);
  const statGain = statTicks * Math.floor(5 * multiplier);

  const currentLck = playerRef.battleStats?.lck || playerRef.lck || 0;
  let ticketsPerTick = 1;
  if (currentLck >= 100) {
    ticketsPerTick += Math.max(0, Math.floor(Math.log(currentLck / 100) / Math.log(3)));
  }
  const ticketGain = ticketTicks * ticketsPerTick;

  // 報酬付与
  if (statGain > 0) {
    playerRef[target] += statGain;
    // 受け取った分だけ時間を進める（端数を持ち越す）
    playerRef.meditation.lastStatTime += statTicks * STAT_TICK_MS;
  }
  
  if (ticketGain > 0) {
    if (!playerRef.inventory) playerRef.inventory = {};
    playerRef.inventory["装備ガチャチケット"] = (playerRef.inventory["装備ガチャチケット"] || 0) + ticketGain;
    playerRef.meditation.lastTicketTime += ticketTicks * TICKET_TICK_MS;
  }

  // 12時間制限に引っかかっていた場合、時間を現在時刻にリセットする（無駄な端数蓄積を防ぐため）
  if (elapsedStat === MAX_OFFLINE_MS) playerRef.meditation.lastStatTime = now;
  if (elapsedTicket === MAX_OFFLINE_MS) playerRef.meditation.lastTicketTime = now;

  playSound('win');
  alert(`🧘 瞑想の成果！\n${target.toUpperCase()} 基礎値: +${formatNumber(statGain)}\nガチャチケット: +${formatNumber(ticketGain)}枚`);

  if (onUpdateUI) onUpdateUI();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();
  updateTicketCount();
  await savePlayerData(playerRef);
  updateDisplay();
}