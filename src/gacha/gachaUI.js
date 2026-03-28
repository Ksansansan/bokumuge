// src/gacha/gachaUI.js
import { RARITY_DATA, STAT_TYPES, EQUIP_NAMES, getLckBonusMultiplier, getActualProbabilities, pullGacha, calcEquipLevel, getEquipStats } from './equipment.js';
import { savePlayerData, addGlobalNews, getCachedBuffLevel, checkAndSaveFirstGenesis } from '../firebase.js';
import { formatNumber } from '../main.js';
import { playSound } from '../audio.js';

let playerRef = null;
let onEquipUpdate = null;
let autoInterval = null;
let currentInvTab = "str"; // 現在選ばれているタブ

const TYPE_COLORS = { str: "#ff6b6b", vit: "#6be6ff", agi: "#94ff6b", lck: "#ffd166" };
const TYPE_NAMES = { str: "武器", vit: "防具", agi: "靴", lck: "アクセ" };

export function initGachaUI(playerObj, equipUpdateFn) {
  playerRef = playerObj;
  onEquipUpdate = equipUpdateFn; 
  
  if (!playerRef.inventory_equip) playerRef.inventory_equip = { str:{}, vit:{}, agi:{}, lck:{} };
  if (!playerRef.equips) playerRef.equips = { str:null, vit:null, agi:null, lck:null };

  // AUTO停止プルダウンの生成 (UC以上〜GENまで)
  const stopSelect = document.getElementById('eq-auto-stop');
  stopSelect.innerHTML = '<option value="-1">ストップしない</option>';
  for (let i = 1; i < RARITY_DATA.length -1; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${RARITY_DATA[i].id} 以上`;
    stopSelect.appendChild(opt);
  }

  updateTicketCount();
  renderCurrentEquips();
  renderInventory();

  // --- ボタン設定 ---
  document.getElementById('btn-show-prob').addEventListener('click', showProbModal);
  document.getElementById('btn-gacha').addEventListener('click', () => doGacha());
  
  document.getElementById('eq-auto-check').addEventListener('change', (e) => {
    if(!e.target.checked) stopAutoGacha();
  });
  document.getElementById('btn-gacha-stop').addEventListener('click', stopAutoGacha);
  
  // インベントリのタブ切り替えイベント
  document.querySelectorAll('.eq-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      playSound('click');
      currentInvTab = e.target.dataset.type;
      
      // 見た目の更新
      document.querySelectorAll('.eq-tab-btn').forEach(b => {
        b.style.background = '#222';
        b.style.color = TYPE_COLORS[b.dataset.type];
      });
      e.target.style.background = TYPE_COLORS[currentInvTab];
      e.target.style.color = '#000';
      
      renderInventory();
    });
  });

  document.getElementById('prob-tab-before').addEventListener('click', () => renderProbList(false));
  document.getElementById('prob-tab-after').addEventListener('click', () => renderProbList(true));
}

// ★ export して外部（main.jsの戦闘後）からも呼べるようにする
export function updateTicketCount() {
  const tickets = playerRef.inventory?.["装備ガチャチケット"] || 0;
  const el = document.getElementById('eq-ticket-count');
  if(el) el.textContent = formatNumber(tickets);
  return tickets;
}

// --- ガチャ実行ロジック ---
async function doGacha() {
  const isAuto = document.getElementById('eq-auto-check').checked;
  const stopTarget = parseInt(document.getElementById('eq-auto-stop').value, 10);
  
  if (isAuto) {
    startAutoGacha(stopTarget);
    return;
  }

  let tickets = playerRef.inventory?.["装備ガチャチケット"] || 0;
  if (tickets < 1) {
    alert("ガチャチケットが足りません！"); return;
  }
  
  playSound('hit');
  playerRef.inventory["装備ガチャチケット"]--;
  updateTicketCount();

  const logArea = document.getElementById('gacha-log-area');
  logArea.innerHTML = '';
  const currentLck = playerRef.battleStats?.lck || playerRef.lck;
  const result = pullGacha(currentLck);
  const probs = getActualProbabilities(currentLck); 
  let probValue;
  let probStr;
  if (result.rarityId === "SEC") {
    // SECの基本確率にLCK倍率を掛ける
    const lckMult = getLckBonusMultiplier(currentLck);
    probValue = RARITY_DATA[result.rarityIndex].prob * lckMult;
    probStr = `(${probValue.toFixed(4)}%)`;
  } else {
    probValue = probs[result.rarityIndex];
    probStr = `(${probValue.toFixed(4)}%)`;
  }
  playerRef.inventory_equip[result.type][result.rarityId] = (playerRef.inventory_equip[result.type][result.rarityId] || 0) + 1;
  playerRef.gachaCount = (playerRef.gachaCount || 0) + 1;
  // ★修正：ファースト・ジェネシス判定 ＆ ニュース送信
   if (result.rarityId === "SEC" && probValue <= 0.2) {
     playSound('win');
    addGlobalNews(`🌈🌈 【シークレット発見！！】<span class="clickable-name" data-name="${playerRef.name}" style="color:#5ce6e6; font-weight:bold;">${playerRef.name}</span> が${probStr}を引き当て、${TYPE_NAMES[result.type]}[SEC] ${result.name} を手に入れました！！ 🌈🌈`, 1);
  } 
  else if (result.rarityId === "GEN") {
    const isFirst = await checkAndSaveFirstGenesis(playerRef.name, probStr);
    if (isFirst) {
      addGlobalNews(`✨✨ 【世界初】<span class="clickable-name" data-name="${playerRef.name}" style="color:#5ce6e6; font-weight:bold;">${playerRef.name}</span> が ${probStr} を引き当て、${TYPE_NAMES[result.type]}[GEN] ${result.name} を世界で初めて獲得しました！！`, 1);
    }
  // ★ 0.2%以下の激レアを引いたらニュース送信 (優先度3)
  }else if (probValue <= 0.2) {
    addGlobalNews(`✨ ラッキー！ <span class="clickable-name" data-name="${playerRef.name}" style="color:#5ce6e6; font-weight:bold;">${playerRef.name}</span> が ${TYPE_NAMES[result.type]}[${result.rarityId}] ${result.name} ${probStr} を引き当てました！`, 3);
  }
  const logEl = document.createElement('div');
  // ★ レア度 [${result.rarityId}] と 確率 ${probStr} を追加
  logEl.innerHTML = `[${TYPE_NAMES[result.type]}] <span class="r-${result.rarityId}">[${result.rarityId}] ${result.name}</span> <span style="font-size:10px; color:#aaa;">${probStr}</span> を獲得！`;
  logArea.prepend(logEl);

  renderInventory();
  renderCurrentEquips();
  if (onEquipUpdate) onEquipUpdate(); 
  await savePlayerData(playerRef);
}

// --- AUTOガチャ ---
function startAutoGacha(stopRarityIndex) {
  document.getElementById('btn-gacha').style.display = 'none';
  document.getElementById('btn-gacha-stop').style.display = 'block';
  const logArea = document.getElementById('gacha-log-area');
  const currentLck = playerRef.battleStats?.lck || playerRef.lck;
  const probs = getActualProbabilities(currentLck);
  let autoPullCount = 0;
  const buffLv = getCachedBuffLevel();
  const intervalMs = (buffLv >= 8) ? 66 : 100; // 神速の抽選
  
  autoInterval = setInterval(async () => {
    if ((playerRef.inventory?.["装備ガチャチケット"] || 0) <= 0) {
      stopAutoGacha(); return;
    }
    playerRef.inventory["装備ガチャチケット"]--;
    updateTicketCount();
    autoPullCount++;
     const res = pullGacha(currentLck); 
     let probValue;
  let probStr;
  if (res.rarityId === "SEC") {
    // SECの基本確率にLCK倍率を掛ける
    const lckMult = getLckBonusMultiplier(currentLck);
    probValue = RARITY_DATA[res.rarityIndex].prob * lckMult;
    probStr = `(${probValue.toFixed(4)}%)`;
  } else {
    probValue = probs[res.rarityIndex];
    probStr = `(${probValue.toFixed(4)}%)`;
  }
    playerRef.inventory_equip[res.type][res.rarityId] = (playerRef.inventory_equip[res.type][res.rarityId] || 0) + 1;
    playerRef.gachaCount = (playerRef.gachaCount || 0) + 1;
    if (res.rarityId === "SEC" && probValue <= 0.2) {
      playSound('win');
      stopAutoGacha();
    addGlobalNews(`🌈🌈 【シークレット発見！！】<span class="clickable-name" data-name="${playerRef.name}" style="color:#5ce6e6; font-weight:bold;">${playerRef.name}</span> が${probStr}を引き当て、${TYPE_NAMES[result.type]}[SEC] ${result.name} を手に入れました！！ 🌈🌈`, 1);
  } 
     // ★修正：ファースト・ジェネシス判定 ＆ ニュース送信
  else if (res.rarityId === "GEN") {
    const isFirst = await checkAndSaveFirstGenesis(playerRef.name, probStr);
    if (isFirst) {
      addGlobalNews(`✨✨ 【世界初】<span class="clickable-name" data-name="${playerRef.name}" style="color:#5ce6e6; font-weight:bold;">${playerRef.name}</span> が ${probStr} を引き当て、${TYPE_NAMES[result.type]}[GEN] ${result.name} を世界で初めて獲得しました！！`, 1);
    }
     // ★ 0.2%以下ニュース
  }else if (probVal <= 0.2) {
      addGlobalNews(`✨ ラッキー！ <span class="clickable-name" data-name="${playerRef.name}" style="color:#5ce6e6; font-weight:bold;">${playerRef.name}</span> が ${TYPE_NAMES[res.type]}[${res.rarityId}] ${res.name} ${probStr} を引き当てました！`, 3);
    }

    const logEl = document.createElement('div');
    logEl.innerHTML = `[${TYPE_NAMES[res.type]}] <span class="r-${res.rarityId}">[${res.rarityId}] ${res.name}</span> <span style="font-size:10px; color:#aaa;">${probStr}</span> を獲得！`;
    logArea.prepend(logEl);
    if(logArea.children.length > 20) logArea.lastChild.remove();
    if (autoPullCount >= 20) {
      autoPullCount = 0;
      savePlayerData(playerRef); // ※awaitせず裏で投げっぱなしにして止めない
    }

    if (stopRarityIndex !== -1 && res.rarityIndex >= stopRarityIndex) {
      playSound('win');
      stopAutoGacha();
    } else {
      playSound('click');
    }
  }, intervalMs); // 0.1秒に1回引く
}

async function stopAutoGacha() {
  clearInterval(autoInterval);
  document.getElementById('btn-gacha').style.display = 'block';
  document.getElementById('btn-gacha-stop').style.display = 'none';
  document.getElementById('eq-auto-check').checked = false;
  
  renderInventory();
  renderCurrentEquips();
  if (onEquipUpdate) onEquipUpdate(); 
  await savePlayerData(playerRef);
}

// --- 装備UI描画 ---
function renderCurrentEquips() {
  const container = document.getElementById('current-equips-grid');
  container.innerHTML = '';

  STAT_TYPES.forEach(type => {
    const eqId = playerRef.equips[type];
    const box = document.createElement('div');
    box.className = 'eq-box';
    box.style.borderColor = TYPE_COLORS[type];

    if (eqId) {
      const rarityIdx = RARITY_DATA.findIndex(r => r.id === eqId);
      const count = playerRef.inventory_equip[type][eqId];
      const lvInfo = calcEquipLevel(count);
      const stats = getEquipStats(rarityIdx, lvInfo.level);
      const name = EQUIP_NAMES[type][rarityIdx];
      const progress = (lvInfo.current / lvInfo.nextReq) * 100;
      
      // ★ ステータス名に色をつけ、+は無色、倍率は小数点第1位まで
      box.innerHTML = `
        <div style="position:absolute; top:2px; left:5px; font-size:10px; color:${TYPE_COLORS[type]};">${TYPE_NAMES[type]}</div>
        <div style="margin-top:12px;">
          <div class="r-${eqId}" style="font-weight:bold; font-size:14px; margin-bottom:5px;">[${eqId}] ${name}</div>
          <div style="font-size:11px; color:#fff;">
            <span style="color:${TYPE_COLORS[type]}; font-weight:bold;">${type.toUpperCase()}</span> 
            <span style="color:#5ce6e6;">x${stats.mult.toFixed(1)}</span> + ${formatNumber(stats.add)}
          </div>
          <div style="font-size:10px; color:#aaa; margin-top:3px;">
            Lv ${lvInfo.level} <span style="font-size:9px;">(${lvInfo.current}/${lvInfo.nextReq})</span>
          </div>
          <div style="width:100%; background:#111; height:4px; border-radius:2px; margin-top:3px; overflow:hidden;">
            <div style="width:${progress}%; background:${TYPE_COLORS[type]}; height:100%;"></div>
          </div>
        </div>
      `;

      // ★ ダブルタップで装備を外す
      let lastTapTime = 0;
      box.addEventListener('click', async () => {
        const now = Date.now();
        if (now - lastTapTime < 300) {
          playSound('error');
          playerRef.equips[type] = null;
          renderCurrentEquips();
          renderInventory();
          if (onEquipUpdate) onEquipUpdate();
          await savePlayerData(playerRef);
        }
        lastTapTime = now;
      });

    } else {
      box.innerHTML = `
        <div style="position:absolute; top:2px; left:5px; font-size:10px; color:${TYPE_COLORS[type]};">${TYPE_NAMES[type]}</div>
        <div style="margin-top:12px; color:#aaa; font-size:12px; line-height:30px;">装備なし</div>
      `;
    }
    container.appendChild(box);
  });
}

function renderInventory() {
  const container = document.getElementById('eq-inventory-list');
  container.innerHTML = '';
  
  let items =[];
  const type = currentInvTab; // 現在のタブの部位だけ表示
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

  // ★ 強い順 (最終倍率の降順) にソート
  items.sort((a, b) => b.stats.mult - a.stats.mult);

  items.forEach(item => {
    const isEquipped = playerRef.equips[item.type] === item.rId;
    const btnText = isEquipped ? "装備中" : "装備する";
    const btnColor = isEquipped ? "#555" : "#c49a45";
    const progress = (item.lvInfo.current / item.lvInfo.nextReq) * 100;

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
          <span class="r-${item.rId}" style="font-size:16px; font-weight:bold;">[${item.rId}] ${item.name}</span>
        </div>
        <div style="font-size:13px; color:#fff;">
          効果: <span style="color:${TYPE_COLORS[item.type]}; font-weight:bold;">${item.type.toUpperCase()}</span> 
          <span style="color:#5ce6e6;">x${item.stats.mult.toFixed(1)}</span> + ${formatNumber(item.stats.add)}
        </div>
        <div style="font-size:11px; color:#aaa; margin-top:4px;">
          Lv ${item.lvInfo.level} <span style="font-size:9px;">(${item.lvInfo.current}/${item.lvInfo.nextReq})</span> / 所持: ${formatNumber(item.count)}個
        </div>
        <div style="width:80%; background:#111; height:4px; border-radius:2px; margin-top:4px; overflow:hidden;">
          <div style="width:${progress}%; background:${TYPE_COLORS[item.type]}; height:100%;"></div>
        </div>
      </div>
      <button class="btn-fantasy btn-equip" style="width:auto; padding:8px 15px; font-size:12px; margin:0; background:${btnColor}; border-color:${btnColor}; color:${isEquipped ? '#aaa' : '#000'};">
        ${btnText}
      </button>
    `;
    
    el.querySelector('.btn-equip').addEventListener('click', async () => {
      playSound('click');
      playerRef.equips[item.type] = item.rId;
      renderCurrentEquips();
      renderInventory();
      if (onEquipUpdate) onEquipUpdate();
      await savePlayerData(playerRef);
    });

    container.appendChild(el);
  });
}

// --- 確率表示モーダル ---
function showProbModal() {
  document.getElementById('modal-gacha-prob').style.display = 'flex';
  const currentLck = playerRef.battleStats?.lck || playerRef.lck;
  const mult = getLckBonusMultiplier(currentLck);
  document.getElementById('prob-lck-mult').textContent = `x${mult.toFixed(2)}`;
  renderProbList(true);
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
  const currentLck = playerRef.battleStats?.lck || playerRef.lck;
  const actualProbs = isAfter ? getActualProbabilities(currentLck) : null;

  for (let i = RARITY_DATA.length - 2; i >= 0; i--) {
    const r = RARITY_DATA[i];
    const probValue = isAfter ? actualProbs[i] : r.prob;
    const probStr = probValue < 0.0001 ? "< 0.0001" : probValue.toFixed(4);

    container.innerHTML += `
      <div style="display:grid; grid-template-columns: 15% 35% 20% 30%; border-bottom:1px dashed #444; padding:5px 0; align-items:center;">
        <div class="r-${r.id}" style="font-weight:bold; font-size:14px;">${r.id}</div>
        <div class="r-${r.id}" style="font-size:10px;">${r.name}</div>
        <div style="color:#5ce6e6;">${probStr}%</div>
        <div style="color:#ffeb85;">x${r.mult.toFixed(1)} <span style="font-size:10px; color:#fff;">+${formatNumber(r.add)}</span></div>
      </div>
    `;
  }
}
