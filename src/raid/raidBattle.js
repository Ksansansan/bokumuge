// src/raid/raidBattle.js
import { submitRaidDamage } from '../firebase.js';
import { formatNumber } from '../main.js';
import { playSound } from '../audio.js';

let animationId = null;

// レイドバトルの事前計算
function simulateRaidBattle(playerStats, bossData) {
  // ★仕様: STRは^0.25 (四乗根) にデフレする
  let pStr = Math.max(1, Math.floor(Math.pow(playerStats.str, 0.25)));
  let pVit = playerStats.vit;
  let pAgi = playerStats.agi;
  let pHp = pVit * 10;
  
  let bMaxHp = bossData.maxHp;
  let bHp = bossData.currentHp;
  
  // ボス初期ステータス (Lvで初期値が増加)
  let bBaseStr = 50 * Math.pow(1.5, bossData.level - 1);
  let bBaseAgi = 50 * Math.pow(1.5, bossData.level - 1);
  
  let pGauge = 0, bGauge = 0;
  let pConsecutive = 0, bConsecutive = 0;
  let forcePTurn = false, forceBTurn = false;
  let timeFrames = 0;
  let totalDamage = 0;
  let events =[];
  
  const BASE_SPEED = 1000 / 60;
  events.push({ frame: 0, type: 'start', pMaxHp: pHp, bMaxHp: bMaxHp, pStr });

  while (pHp > 0 && bHp > 0) {
    timeFrames++;
    let s = timeFrames / 60; 
    
    // ★仕様: ボスの攻撃と速度が毎秒 1.6^s で爆発的にインフレ
    let currentBStr = bBaseStr * Math.pow(1.6, s);
    let currentBAgi = bBaseAgi * Math.pow(1.6, s);
    
    let pAgiClipped = Math.max(1, Math.min(pAgi, currentBAgi * 10));
    let bAgiClipped = Math.max(1, Math.min(currentBAgi, pAgi * 10));
    let minAgi = Math.min(pAgiClipped, bAgiClipped);
    
    pGauge += (pAgiClipped / minAgi) * BASE_SPEED;
    bGauge += (bAgiClipped / minAgi) * BASE_SPEED;
    
    let isPAct = false, isBAct = false;
    if (forceBTurn) isBAct = true;
    else if (forcePTurn) isPAct = true;
    else if (pGauge >= 1000 && bGauge >= 1000) isPAct = true;
    else if (pGauge >= 1000) isPAct = true;
    else if (bGauge >= 1000) isBAct = true;
    
    if (isPAct) {
      // 防御0なので、デフレしたSTRがそのままダメージになる
      let dmg = pStr; 
      bHp -= dmg;
      totalDamage += dmg;
      pGauge -= 1000;
      pConsecutive++;
      bConsecutive = 0;
      forcePTurn = false;
      
      events.push({ frame: timeFrames, type: 'attack', actor: 'player', damage: dmg, hpRemaining: bHp });
      
      if (bHp <= 0) break; // 討伐成功
      
      if (pConsecutive >= 10) {
        forceBTurn = true; pConsecutive = 0; bGauge = Math.max(1000, bGauge);
        events.push({ frame: timeFrames, type: 'stopper' });
      }
    } else if (isBAct) {
      let dmg = Math.max(1, Math.floor(currentBStr) - Math.floor(pVit * 0.25));
      pHp -= dmg;
      bGauge -= 1000;
      bConsecutive++;
      pConsecutive = 0;
      forceBTurn = false;
      
      events.push({ frame: timeFrames, type: 'attack', actor: 'boss', damage: dmg, hpRemaining: pHp });
      
      if (bConsecutive >= 10 && pHp > 0) {
        forcePTurn = true; bConsecutive = 0; pGauge = Math.max(1000, pGauge);
      }
    }
  }
  
  return { totalDamage, totalFrames: timeFrames, isDefeated: bHp <= 0, events };
}

// 描画アニメーション開始
export function startRaidBattleAnimation(player, bossData, myData) {
  const modal = document.getElementById('raid-modal-overlay');
  const btnClose = document.getElementById('btn-close-raid');
  const resultText = document.getElementById('raid-result-text');
  
  modal.style.display = 'flex';
  btnClose.style.display = 'none';
  resultText.textContent = '';
  document.getElementById('ru-p-name').textContent = player.name;
  document.getElementById('ru-e-name').textContent = `絶望の化身 Lv.${bossData.level}`;
  const result = simulateRaidBattle(player.battleStats, bossData);

  let currentFrame = 0, eventIndex = 0;
  let pMaxHp = 1, pHp = 1, eMaxHp = 1, eHp = 1;
  let pGaugeVal = 0, eGaugeVal = 0;
  
  // プレイヤーのステータス描画
  let pStr = Math.max(1, Math.floor(Math.pow(player.battleStats.str, 0.25))); // 攻撃用のデフレSTR
  document.getElementById('ru-p-stat-str').textContent = formatNumber(pStr);
  document.getElementById('ru-p-stat-vit').textContent = formatNumber(player.battleStats.vit);
  document.getElementById('ru-p-stat-agi').textContent = formatNumber(player.battleStats.agi);

  let bBaseStr = 50 * Math.pow(1.5, bossData.level - 1);
  let bBaseVit = 270;
    for (let i = 2; i <= bossData.level; i++) {
      // 倍率を計算（3.0から開始し、Lvが上がるごとに0.25ずつ減る。下限1.5）
      let multiplier = Math.max(1.5, 3.0 - (i - 2) * 0.25);
      bBaseVit = Math.floor(bBaseVit * multiplier);
    }
  
  let bBaseAgi = 50 * Math.pow(1.5, bossData.level - 1);
  
  function renderLoop() {
    const speed = 1; 
    currentFrame += speed;
    let s = currentFrame / 60;
    
    document.getElementById('raid-timer-text').textContent = `Time: ${s.toFixed(2)}s`;
    
    // ★ 毎フレーム、インフレしていくボスのステータスを計算してUIに反映
    let currentBStr = bBaseStr * Math.pow(1.6, s);
    let currentBVit = bBaseVit;
    let currentBAgi = bBaseAgi * Math.pow(1.6, s);

    document.getElementById('ru-e-stat-str').textContent = formatNumber(currentBStr);
    document.getElementById('ru-e-stat-vit').textContent = formatNumber(currentBVit);
    document.getElementById('ru-e-stat-agi').textContent = formatNumber(currentBAgi);

    while (eventIndex < result.events.length && result.events[eventIndex].frame <= currentFrame) {
      const ev = result.events[eventIndex];
      if (ev.type === 'start') {
        pMaxHp = ev.pMaxHp; pHp = pMaxHp;
        eMaxHp = ev.bMaxHp; eHp = bossData.currentHp; // スタート時のHP
      } else if (ev.type === 'attack') {
        const isP = ev.actor === 'player';
        playSound(isP ? 'hit' : 'damage');
        if(isP) { eHp -= ev.damage; pGaugeVal = 0; } else { pHp = ev.hpRemaining; eGaugeVal = 0; }
        
        // ダメージポップアップ
        const dmgText = document.createElement('div');
        dmgText.className = 'dmg-popup';
        dmgText.textContent = formatNumber(ev.damage);
        dmgText.style[isP ? 'right' : 'left'] = '20%';
        document.getElementById('raid-gui-container').appendChild(dmgText);
        setTimeout(() => dmgText.remove(), 800);
      } else if (ev.type === 'stopper') { eGaugeVal = 1000; }
      eventIndex++;
    }

   // ★ ゲージ上昇（描画用）を通常バトルと同じ相対速度計算にする
    const BASE_SPEED = 1000 / 60;
    let visualPAgi = Math.max(1, Math.min(player.battleStats.agi, currentBAgi * 10));
    let visualEAgi = Math.max(1, Math.min(currentBAgi, player.battleStats.agi * 10));
    const minVisualAgi = Math.min(visualPAgi, visualEAgi);

    pGaugeVal += (visualPAgi / minVisualAgi) * BASE_SPEED * speed;
    eGaugeVal += (visualEAgi / minVisualAgi) * BASE_SPEED * speed;

    if(pGaugeVal>1000) pGaugeVal=1000; 
    if(eGaugeVal>1000) eGaugeVal=1000;

    document.getElementById('ru-p-hp').style.width = `${Math.max(0, (pHp / pMaxHp) * 100)}%`;
    document.getElementById('ru-p-hp-txt').textContent = `${formatNumber(Math.max(0, pHp))} / ${formatNumber(pMaxHp)}`;
    document.getElementById('ru-p-gauge').style.width = `${(pGaugeVal / 1000) * 100}%`;
    document.getElementById('ru-e-hp').style.width = `${Math.max(0, (eHp / eMaxHp) * 100)}%`;
    document.getElementById('ru-e-hp-txt').textContent = `${formatNumber(Math.max(0, eHp))} / ${formatNumber(eMaxHp)}`;
    document.getElementById('ru-e-gauge').style.width = `${(eGaugeVal / 1000) * 100}%`;

    if (currentFrame >= result.totalFrames || eventIndex >= result.events.length) {
      btnClose.style.display = 'block';
      if (result.isDefeated) {
        playSound('win');
        resultText.textContent = `🎉 討伐成功！！ (${formatNumber(result.totalDamage)} Dmg)`; // ★ フォーマット
        resultText.style.color = '#ffeb85';
      } else {
        playSound('error');
        resultText.textContent = `💀 敗北... (${formatNumber(result.totalDamage)} Dmg)`; // ★ フォーマット
        resultText.style.color = '#ff6b6b';
      }
      
      // ★ 修正：ロールバック対策されたトランザクション関数を呼ぶ
      btnClose.onclick = async () => {
        btnClose.textContent = "送信中...";
        btnClose.style.pointerEvents = 'none'; // 2回押し防止
        
        const success = await submitRaidDamage(player.name, result.totalDamage);
        
        if (success) {
          modal.style.display = 'none';
          btnClose.textContent = "結果を送信して戻る";
          btnClose.style.pointerEvents = 'auto';
        } else {
          btnClose.textContent = "エラー。再試行してください";
          btnClose.style.pointerEvents = 'auto';
        }
      };
      
      cancelAnimationFrame(animationId);
      return;
    }
    animationId = requestAnimationFrame(renderLoop);
  }
  animationId = requestAnimationFrame(renderLoop);
}
