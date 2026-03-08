// src/main.js の btnChallenge.addEventListener 内の関連部分を修正

// （前略）
const elFloorHeader = document.getElementById('floor-header');
// 【修正】logContainer の取得を削除（もう使わないため）
const btnChallenge = document.getElementById('btn-challenge');
const modalBattle = document.getElementById('battle-modal-overlay');
const resultText = document.getElementById('battle-result-text');
const btnCloseBattle = document.getElementById('btn-close-battle');
// （中略）

// ⚔️ バトル実行＆アニメーション再生
btnChallenge.addEventListener('click', () => {
  const floorData = generateFloorData(player.floor);
  const result = simulateBattle(player, floorData.enemies);
  
  // 【修正】logContainer の初期化を削除
  resultText.textContent = '';
  modalBattle.style.display = 'flex';
  btnCloseBattle.style.display = 'none';

  let currentFrame = 0;
  let eventIndex = 0;
  let pMaxHp = 1, pHp = 1, eMaxHp = 1, eHp = 1;
  let pGaugeVal = 0, eGaugeVal = 0;
  let currentEnemyAgi = 0;
  
  function renderLoop() {
    const speed = 1; 
    currentFrame += speed;

    while (eventIndex < result.events.length && result.events[eventIndex].frame <= currentFrame) {
      const ev = result.events[eventIndex];
      
      if (ev.type === 'start') {
        pMaxHp = ev.playerMaxHp; pHp = pMaxHp;
        eMaxHp = ev.enemy.maxHp; eHp = eMaxHp;
        uiE_name.textContent = ev.enemy.name;
        currentEnemyAgi = ev.enemy.agi;
      } 
      else if (ev.type === 'next_enemy') {
        eMaxHp = ev.enemy.maxHp; eHp = eMaxHp;
        uiE_name.textContent = ev.enemy.name;
        currentEnemyAgi = ev.enemy.agi;
        eGaugeVal = 0; 
      }
      else if (ev.type === 'attack') {
        // ダメージポップアップの生成
        const dmgText = document.createElement('div');
        dmgText.className = 'dmg-popup';
        dmgText.textContent = ev.damage;
        
        if(ev.actor === 'player') {
          dmgText.style.right = '20%'; 
          eHp = ev.hpRemaining;
          pGaugeVal = 0; 
        } else {
          dmgText.style.left = '20%';
          pHp = ev.hpRemaining;
          eGaugeVal = 0;
        }
        guiContainer.appendChild(dmgText);
        setTimeout(() => dmgText.remove(), 800);
        
        // 【修正】文字ログ出力部分を削除
      }
      else if (ev.type === 'stopper') {
        eGaugeVal = 1000; 
      }
      eventIndex++;
    }

    pGaugeVal += player.agi * speed;
    eGaugeVal += currentEnemyAgi * speed;
    if(pGaugeVal > 1000) pGaugeVal = 1000;
    if(eGaugeVal > 1000) eGaugeVal = 1000;

    uiP_hp.style.width = `${Math.max(0, (pHp / pMaxHp) * 100)}%`;
    uiP_hpTxt.textContent = `${Math.max(0, pHp)} / ${pMaxHp}`;
    uiP_gauge.style.width = `${(pGaugeVal / 1000) * 100}%`;

    uiE_hp.style.width = `${Math.max(0, (eHp / eMaxHp) * 100)}%`;
    uiE_hpTxt.textContent = `${Math.max(0, eHp)} / ${eMaxHp}`;
    uiE_gauge.style.width = `${(eGaugeVal / 1000) * 100}%`;

    if (currentFrame >= result.totalFrames || eventIndex >= result.events.length) {
      btnCloseBattle.style.display = 'block';
      if (result.isWin) {
        resultText.textContent = `🎉 勝利！ タイム: ${result.clearTime}`;
        resultText.style.color = '#ffd166';
        player.floor++; 
      } else {
        resultText.textContent = `💀 敗北...`;
        resultText.style.color = '#ff6b6b';
      }
      cancelAnimationFrame(animationId);
      return;
    }

    animationId = requestAnimationFrame(renderLoop);
  }

  animationId = requestAnimationFrame(renderLoop);
});
// （後略）
