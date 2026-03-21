// src/raid/raidBattle.js
import { updateRaidState } from '../firebase.js';
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
  let bBaseAgi = 20 * Math.pow(1.5, bossData.level - 1);
  
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

  const result = simulateRaidBattle(player.battleStats, bossData);

  let currentFrame = 0, eventIndex = 0;
  let pMaxHp = 1, pHp = 1, eMaxHp = 1, eHp = 1;
  let pGaugeVal = 0, eGaugeVal = 0;
  
  function renderLoop() {
    const speed = 1; // レイドは1倍速固定で演出を味わう
    currentFrame += speed;
    let s = currentFrame / 60;
    
    document.getElementById('raid-timer-text').textContent = `Time: ${s.toFixed(2)}s`;
    // ボスのインフレ率をリアルタイム表示
    document.getElementById('ru-e-power').textContent = `${Math.pow(1.6, s).toFixed(2)}x`;

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

    // ゲージ上昇（描画用）
    pGaugeVal += 1000/60 * speed; // 仮の描画速度
    eGaugeVal += 1000/60 * speed * Math.pow(1.6, s);
    if(pGaugeVal>1000) pGaugeVal=1000; if(eGaugeVal>1000) eGaugeVal=1000;

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
        resultText.textContent = `🎉 討伐成功！！ (${result.totalDamage} Dmg)`;
        resultText.style.color = '#ffeb85';
      } else {
        playSound('error');
        resultText.textContent = `💀 敗北... (${result.totalDamage} Dmg)`;
        resultText.style.color = '#ff6b6b';
      }
      
      // ボタンが押されたら結果をFirebaseへ送る
      btnClose.onclick = async () => {
        btnClose.textContent = "送信中...";
        myData.damage += result.totalDamage;
        myData.tries += 1;
        const newHp = Math.max(0, bossData.currentHp - result.totalDamage);
        
        await updateRaidState({
          currentHp: newHp,
          isDefeated: newHp <= 0,[`participants.${player.name}`]: myData
        });
        
        modal.style.display = 'none';
        btnClose.textContent = "結果を送信して戻る";
      };
      
      cancelAnimationFrame(animationId);
      return;
    }
    animationId = requestAnimationFrame(renderLoop);
  }
  animationId = requestAnimationFrame(renderLoop);
}