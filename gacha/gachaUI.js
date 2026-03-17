// src/gacha/gachaUI.js
import { RARITY_DATA, STAT_TYPES, getLckBonusMultiplier, getActualProbabilities, pullGacha, calcEquipLevel, getEquipStats } from './equipment.js';
import { savePlayerData } from '../firebase.js';
import { formatNumber } from '../main.js';
import { playSound } from '../audio.js';

let playerRef = null;
let onEquipUpdate = null;
let autoInterval = null;

const TYPE_COLORS = { str: "#ff6b6b", vit: "#6be6ff", agi: "#94ff6b", lck: "#ffd166" };
const TYPE_NAMES = { str: "武器 (STR)", vit: "防具 (VIT)", agi: "靴 (AGI)", lck: "アクセ (LCK)" };

export function initGachaUI(playerObj, equipUpdateFn) {
  playerRef = playerObj;
  onEquipUpdate = equipUpdateFn; // 装備変更時にメインのステータスを更新する用
  
  if (!playerRef.inventory_equip) playerRef.inventory_equip = { str:{}, vit:{}, agi:{}, lck:{} };
  if (!playerRef.equips) playerRef.equips = { str:null, vit:null, agi:null, lck:null };

  updateTicketCount();
  renderCurrentEquips();
  renderInventory();

  // --- ボタン設定 ---
  document.getElementById('btn-show-prob').addEventListener('click', showProbModal);
  
  document.getElementById('btn-gacha-1').addEventListener('click', () => doGacha(1));
  document.getElementById('btn-gacha-10').addEventListener('click', () => doGacha(10));
  
  document.getElementById('eq-auto-check').addEventListener('change', (e) => {
    if(!e.target.checked) stopAutoGacha();
  });
  document.getElementById('btn-gacha-stop').addEventListener('click', stopAutoGacha);
  
  document.getElementById('eq-sort').addEventListener('change', renderInventory);

  // 確率モーダルタブ
  document.getElementById('prob-tab-before').addEventListener('click', () => renderProbList(false));
  document.getElementById('prob-tab-after').addEventListener('click', () => renderProbList(true));
}

function updateTicketCount() {
  const tickets = playerRef.inventory?.["装備ガチャチケット"] || 0;
  document.getElementById('eq-ticket-count').textContent = formatNumber(tickets);
  return tickets;
}

// --- ガチャ実行ロジック ---
async function doGacha(times) {
  const isAuto = document.getElementById('eq-auto-check').checked;
  const stopTarget = parseInt(document.getElementById('eq-auto-stop').value, 10);
  
  if (isAuto && times === 10) {
    // AUTOがONならループ開始
    startAutoGacha(stopTarget);
    return;
  }

  let tickets = playerRef.inventory?.["装備ガチャチケット"] || 0;
  if (tickets < times) {
    alert("ガチャチケットが足りません！"); return;
  }
  
  playSound('hit');
  playerRef.inventory["装備ガチャチケット"] -= times;
  updateTicketCount();

  const logArea = document.getElementById('gacha-log-area');
  logArea.innerHTML = ''; // ログクリア

  for (let i = 0; i < times; i++) {
    const result = pullGacha(playerRef.lck);
    // インベントリに追加
    playerRef.inventory_equip[result.type][result.rarityId] = (playerRef.inventory_equip[result.type][result.rarityId] || 0) + 1;
    
    // ログに出力
    const logEl = document.createElement('div');
    logEl.innerHTML = `[${TYPE_NAMES[result.type]}] <span class="r-${result.rarityId}">${result.name}</span> を獲得！`;
    logArea.prepend(logEl);
  }

  renderInventory();
  renderCurrentEquips();
  await savePlayerData(playerRef);
}

// --- AUTOガチャ ---
function startAutoGacha(stopRarityIndex) {
  document.getElementById('btn-gacha-1').style.display = 'none';
  document.getElementById('btn-gacha-10').style.display = 'none';
  document.getElementById('btn-gacha-stop').style.display = 'block';
  
  const logArea = document.getElementById('gacha-log-area');

  autoInterval = setInterval(async () => {
    if ((playerRef.inventory?.["装備ガチャチケット"] || 0) <= 0) {
      stopAutoGacha(); return;
    }
    playerRef.inventory["装備ガチャチケット"]--;
    updateTicketCount();

    const res = pullGacha(playerRef.lck);
    playerRef.inventory_equip[res.type][res.rarityId] = (playerRef.inventory_equip[res.type][res.rarityId] || 0) + 1;

    const logEl = document.createElement('div');
    logEl.innerHTML = `[${TYPE_NAMES[res.type]}] <span class="r-${res.rarityId}">${res.name}</span> を獲得！`;
    logArea.prepend(logEl);
    if(logArea.children.length > 20) logArea.lastChild.remove();

    if (stopRarityIndex !== -1 && res.rarityIndex >= stopRarityIndex) {
      playSound('win');
      stopAutoGacha();
    } else {
      playSound('click');
    }
  }, 150); // 0.15秒に1回引く爆速仕様
}

async function stopAutoGacha() {
  clearInterval(autoInterval);
  document.getElementById('btn-gacha-1').style.display = 'block';
  document.getElementById('btn-gacha-10').style.display = 'block';
  document.getElementById('btn-gacha-stop').style.display = 'none';
  document.getElementById('eq-auto-check').checked = false;
  
  renderInventory();
  renderCurrentEquips();
  await savePlayerData(playerRef);
}

// --- 装備UI描画 ---
function renderCurrentEquips() {
  const container = document.getElementById('current-equips-grid');
  container.innerHTML = '';

  STAT_TYPES.forEach(type => {
    const eqId = playerRef.equips[type];
    let contentHtml = `<div style="color:#aaa; font-size:12px; margin-top:10px;">装備なし</div>`;
    
    if (eqId) {
      const rarityIdx = RARITY_DATA.findIndex(r => r.id === eqId);
      const count = playerRef.inventory_equip[type][eqId];
      const lvInfo = calcEquipLevel(count);
      const stats = getEquipStats(rarityIdx, lvInfo.level);
      const name = EQUIP_NAMES[type][rarityIdx];
      
      contentHtml = `
        <div class="r-${eqId}" style="font-weight:bold; font-size:14px; margin-bottom:5px;">${name}</div>
        <div style="font-size:11px; color:#fff;">${type.toUpperCase()} x${formatNumber(stats.mult)} + ${formatNumber(stats.add)}</div>
        <div style="font-size:10px; color:#aaa; margin-top:3px;">Lv ${lvInfo.level} <span style="font-size:9px;">(${lvInfo.current}/${lvInfo.nextReq})</span></div>
      `;
    }

    container.innerHTML += `
      <div class="eq-box" style="border-color:${TYPE_COLORS[type]};">
        <div style="position:absolute; top:2px; left:5px; font-size:10px; color:${TYPE_COLORS[type]};">${TYPE_NAMES[type]}</div>
        <div style="margin-top:12px;">${contentHtml}</div>
      </div>
    `;
  });
}

function renderInventory() {
  const container = document.getElementById('eq-inventory-list');
  container.innerHTML = '';
  
  const sortType = document.getElementById('eq-sort').value;
  let items =[];

  STAT_TYPES.forEach(type => {
    const eqDict = playerRef.inventory_equip[type];
    for (const rId in eqDict) {
      const count = eqDict[rId];
      if (count > 0) {
        const rarityIdx = RARITY_DATA.findIndex(r => r.id === rId);
        const lvInfo = calcEquipLevel(count);
        const stats = getEquipStats(rarityIdx, lvInfo.level);
        items.push({ type, rId, rarityIdx, count, lvInfo, stats, name: EQUIP_NAMES[type][rarityIdx] });
      }
    }
  });

  // ソート処理
  items.sort((a, b) => {
    if (sortType === 'rarity') {
      if (b.rarityIdx !== a.rarityIdx) return b.rarityIdx - a.rarityIdx;
      return STAT_TYPES.indexOf(a.type) - STAT_TYPES.indexOf(b.type);
    } else {
      // 特定のステータス順の場合、該当部位のアイテムを上に
      if (a.type === sortType && b.type !== sortType) return -1;
      if (a.type !== sortType && b.type === sortType) return 1;
      // 同じ部位なら最終倍率(強さ)でソート
      return b.stats.mult - a.stats.mult;
    }
  });

  items.forEach(item => {
    const isEquipped = playerRef.equips[item.type] === item.rId;
    const btnText = isEquipped ? "装備中" : "装備する";
    const btnColor = isEquipped ? "#555" : "#c49a45";

    const el = document.createElement('div');
    el.className = 'panel';
    el.style.display = 'flex';
    el.style.justifyContent = 'space-between';
    el.style.alignItems = 'center';
    el.style.padding = '10px';
    el.style.marginBottom = '5px';
    
    el.innerHTML = `
      <div style="flex-grow:1;">
        <div style="display:flex; align-items:center; margin-bottom:5px;">
          <span style="font-size:10px; padding:2px 4px; background:${TYPE_COLORS[item.type]}; color:#000; border-radius:3px; margin-right:8px; font-weight:bold;">${item.type.toUpperCase()}</span>
          <span class="r-${item.rId}" style="font-size:16px; font-weight:bold;">[${item.rId}] ${item.name}</span>
        </div>
        <div style="font-size:13px; color:#fff;">
          効果: ${item.type.toUpperCase()} <span style="color:#5ce6e6;">x${formatNumber(item.stats.mult)}</span> + <span style="color:#ffeb85;">${formatNumber(item.stats.add)}</span>
        </div>
        <div style="font-size:11px; color:#aaa; margin-top:2px;">
          Lv ${item.lvInfo.level} <span style="font-size:9px;">(${item.lvInfo.current}/${item.lvInfo.nextReq})</span> / 所持: ${formatNumber(item.count)}個
        </div>
      </div>
      <button class="btn-fantasy btn-equip" style="width:auto; padding:8px 15px; font-size:12px; margin:0; background:${btnColor}; border-color:${btnColor}; color:${isEquipped ? '#aaa' : '#000'};">
        ${btnText}
      </button>
    `;
    
    // 装備ボタンのイベント
    el.querySelector('.btn-equip').addEventListener('click', async () => {
      playSound('click');
      playerRef.equips[item.type] = item.rId;
      renderCurrentEquips();
      renderInventory();
      if (onEquipUpdate) onEquipUpdate(); // メインのステータス更新を呼ぶ
      await savePlayerData(playerRef);
    });

    container.appendChild(el);
  });
}

// --- 確率表示モーダル ---
function showProbModal() {
  document.getElementById('modal-gacha-prob').style.display = 'flex';
  const mult = getLckBonusMultiplier(playerRef.lck);
  document.getElementById('prob-lck-mult').textContent = `x${mult.toFixed(2)}`;
  renderProbList(true); // デフォルトは適用後
}

function renderProbList(isAfter) {
  const btnB = document.getElementById('prob-tab-before');
  const btnA = document.getElementById('prob-tab-after');
  btnB.style.background = isAfter ? "#222" : "#c49a45";
  btnB.style.color = isAfter ? "#c49a45" : "#000";
  btnA.style.background = isAfter ? "#c49a45" : "#222";
  btnA.style.color = isAfter ? "#000" : "#c49a45";

  const container = document.getElementById('prob-list-container');
  container.innerHTML = '';
  
  const actualProbs = isAfter ? getActualProbabilities(playerRef.lck) : null;

  // 上位から順に表示
  for (let i = RARITY_DATA.length - 1; i >= 0; i--) {
    const r = RARITY_DATA[i];
    const probValue = isAfter ? actualProbs[i] : r.prob;
    
    // 0.0001未満の場合は切り捨てずに表示するため特殊フォーマット
    const probStr = probValue < 0.0001 ? "< 0.0001" : probValue.toFixed(4);

    container.innerHTML += `
      <div style="display:grid; grid-template-columns: 15% 35% 20% 30%; border-bottom:1px dashed #444; padding:5px 0; align-items:center;">
        <div class="r-${r.id}" style="font-weight:bold; font-size:14px;">${r.id}</div>
        <div class="r-${r.id}" style="font-size:10px;">${r.name}</div>
        <div style="color:#5ce6e6;">${probStr}%</div>
        <div style="color:#ffeb85;">x${r.mult} <span style="font-size:10px;">+${formatNumber(r.add)}</span></div>
      </div>
    `;
  }
}