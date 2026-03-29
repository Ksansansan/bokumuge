// src/minigame/meditation.js
import { getReliableTime, savePlayerData, getCachedBuffLevel } from '../firebase.js';
import { formatNumber } from '../main.js';
import { getLevelMultiplier } from './minigameCore.js';
import { updateTicketCount } from '../gacha/gachaUI.js';
import { playSound } from '../audio.js';

let playerRef = null;
let onUpdateUI = null;

// ★ バフを考慮した現在の設定値を返す関数を作成
function getMeditationConfig() {
  const buffLv = getCachedBuffLevel();
  
  let maxMs = 12 * 60 * 60 * 1000;
  if (buffLv >= 9) maxMs = 24 * 60 * 60 * 1000;
  else if (buffLv >= 1) maxMs = 18 * 60 * 60 * 1000;

  let statTick = 20 * 60 * 1000;
  let ticketTick = 10 * 60 * 1000;
  if (buffLv >= 3) {
    statTick *= 0.75;
    ticketTick *= 0.75;
  }

  return { 
    maxMs, 
    statTick, 
    ticketTick, 
    buffLv,
    // 表示用テキスト
    maxHour: maxMs / (60 * 60 * 1000),
    statMin: statTick / (60 * 1000),
    ticketMin: ticketTick / (60 * 1000)
  };
}

export function initMeditation(playerObj, updateUIFn) {
  playerRef = playerObj;
  onUpdateUI = updateUIFn;

  const selectEl = document.getElementById('md-target-select');
  if(selectEl) selectEl.value = playerRef.meditation.target;
  
  selectEl.addEventListener('change', (e) => {
    playerRef.meditation.target = e.target.value;
    savePlayerData(playerRef);
    updateDisplay();
  });

  document.getElementById('md-btn-claim').addEventListener('click', claimRewards);

  setInterval(updateDisplay, 1000);
  updateDisplay();
}

function updateDisplay() {
  const now = getReliableTime();
  // ★ 最新のバフ設定を取得
  const config = getMeditationConfig();
  
  // ラベルテキストの更新
  document.getElementById('md-max-hour-label').textContent = config.maxHour;
  document.getElementById('md-tick-label').innerHTML = 
    `<span style="color:#5ce6e6;">${config.ticketMin}分ごとにチケット</span> / <span style="color:#ff6b6b;">${config.statMin}分ごとに基礎値</span>`;

  const elapsedStat = Math.min(now - playerRef.meditation.lastStatTime, config.maxMs);
  const elapsedTicket = Math.min(now - playerRef.meditation.lastTicketTime, config.maxMs);
  
  const displayMs = Math.max(elapsedStat, elapsedTicket);
  
  const h = Math.floor(displayMs / 3600000);
  const m = Math.floor((displayMs % 3600000) / 60000);
  const s = Math.floor((displayMs % 60000) / 1000);
  
  document.getElementById('md-elapsed-time').textContent = 
    `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  const statTicks = Math.floor(elapsedStat / config.statTick);
  const ticketTicks = Math.floor(elapsedTicket / config.ticketTick);

  const target = playerRef.meditation.target;
  const totalLevel = playerRef.lv.str + playerRef.lv.vit + playerRef.lv.agi + playerRef.lv.lck;
  const multiplier = getLevelMultiplier(playerRef.lv[target], totalLevel);
  const statGain = statTicks * Math.floor(5 * multiplier);

  const currentLck = playerRef.battleStats?.lck || playerRef.lck || 0;
  let ticketsPerTick = 1;
  if (currentLck >= 100) {
    ticketsPerTick += Math.max(0, Math.floor(Math.log(currentLck / 100) / Math.log(3) * 1.25));
  }
  // レイドバフの直接加算
  if(config.buffLv >= 2) ticketsPerTick++;
  if(config.buffLv >= 5) ticketsPerTick+=2;

  const ticketGain = ticketTicks * ticketsPerTick;

  document.getElementById('md-est-stats').textContent = `+${formatNumber(statGain)}`;
  const colors = { str:"#ff6b6b", vit:"#6be6ff", agi:"#94ff6b", lck:"#ffd166" };
  document.getElementById('md-est-stats').style.color = colors[target];
  document.getElementById('md-est-tickets').textContent = `${formatNumber(ticketGain)} 枚`;
  
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
  const config = getMeditationConfig();
  
  const elapsedStat = Math.min(now - playerRef.meditation.lastStatTime, config.maxMs);
  const elapsedTicket = Math.min(now - playerRef.meditation.lastTicketTime, config.maxMs);
  
  const statTicks = Math.floor(elapsedStat / config.statTick);
  const ticketTicks = Math.floor(elapsedTicket / config.ticketTick);

  if (statTicks === 0 && ticketTicks === 0) return;

  const target = playerRef.meditation.target;
  const totalLevel = playerRef.lv.str + playerRef.lv.vit + playerRef.lv.agi + playerRef.lv.lck;
  const multiplier = getLevelMultiplier(playerRef.lv[target], totalLevel);
  const statGain = statTicks * Math.floor(5 * multiplier);

  const currentLck = playerRef.battleStats?.lck || playerRef.lck || 0;
  let ticketsPerTick = 1;
  if (currentLck >= 100) {
    ticketsPerTick += Math.max(0, Math.floor(Math.log(currentLck / 100) / Math.log(3) * 1.25));
  }
  if(config.buffLv >= 2) ticketsPerTick++;
  if(config.buffLv >= 5) ticketsPerTick+=2;

  const ticketGain = ticketTicks * ticketsPerTick;

  if (statGain > 0) {
    playerRef[target] += statGain;
    playerRef.meditation.lastStatTime += statTicks * config.statTick;
  }
  
  if (ticketGain > 0) {
    if (!playerRef.inventory) playerRef.inventory = {};
    playerRef.inventory["装備ガチャチケット"] = (playerRef.inventory["装備ガチャチケット"] || 0) + ticketGain;
    playerRef.meditation.lastTicketTime += ticketTicks * config.ticketTick;
  }

  // 上限に達していた場合の時間リセット処理を修正
  if (elapsedStat >= config.maxMs) playerRef.meditation.lastStatTime = now;
  if (elapsedTicket >= config.maxMs) playerRef.meditation.lastTicketTime = now;

  playSound('win');
  if (onUpdateUI) onUpdateUI();
  if (playerRef.updateStatusUI) playerRef.updateStatusUI();
  updateTicketCount();
  await savePlayerData(playerRef);
  updateDisplay();
}
