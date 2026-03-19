// src/battle/battleCalc.js
import { getLckBonusMultiplier } from '../gacha/equipment.js';

export function simulateBattle(player, floorData) {
  const enemies = floorData.enemies;
  let events = [];
  let drops =[]; 
  let currentEnemyIndex = 0;
  
  let currentEnemy = { 
    ...enemies[currentEnemyIndex], 
    maxHp: enemies[currentEnemyIndex].vit * 10,
    currentHp: enemies[currentEnemyIndex].vit * 10 
  };
  
  let playerMaxHp = player.vit * 10;
  let playerHp = playerMaxHp; 
  let playerGauge = 0, enemyGauge = 0;
  let playerConsecutiveTurns = 0, enemyConsecutiveTurns = 0;
  let forceEnemyTurn = false, forcePlayerTurn = false;
  let timeFrames = 0;
  let transitionTimer = 0;

  // ★ベースとなる速度（60フレーム=1秒で1000溜まる）
  const BASE_SPEED = 1000 / 60;

  events.push({ frame: 0, type: 'start', enemy: currentEnemy, playerMaxHp: playerMaxHp });

  while (currentEnemyIndex < enemies.length && playerHp > 0) {
    timeFrames++;

    if (transitionTimer > 0) {
      transitionTimer--;
      if (transitionTimer === 0) {
        currentEnemyIndex++;
        if (currentEnemyIndex < enemies.length) {
          currentEnemy = { ...enemies[currentEnemyIndex], maxHp: enemies[currentEnemyIndex].vit * 10, currentHp: enemies[currentEnemyIndex].vit * 10 };
          enemyGauge = 0;
          playerConsecutiveTurns = 0;
          events.push({ frame: timeFrames, type: 'next_enemy', enemy: currentEnemy });
        }
      }
      continue;
    }

    // ★修正：AGIの相対速度計算（最大10倍キャップ）
    let pAgi_clipped = Math.max(1, Math.min(player.agi, currentEnemy.agi * 10));
    let eAgi_clipped = Math.max(1, Math.min(currentEnemy.agi, player.agi * 10));
    const minAgi = Math.min(pAgi_clipped, eAgi_clipped); // minに変更
    
    playerGauge += (pAgi_clipped / minAgi) * BASE_SPEED;
    enemyGauge += (eAgi_clipped / minAgi) * BASE_SPEED;

    let isPlayerAct = false, isEnemyAct = false;
    if (forceEnemyTurn) isEnemyAct = true;
    else if (forcePlayerTurn) isPlayerAct = true;
    else if (playerGauge >= 1000 && enemyGauge >= 1000) isPlayerAct = true; 
    else if (playerGauge >= 1000) isPlayerAct = true;
    else if (enemyGauge >= 1000) isEnemyAct = true;

    if (isPlayerAct) {
      let damage = Math.max(1, player.str - Math.floor(currentEnemy.vit * 0.25));
      currentEnemy.currentHp -= damage;
      playerGauge -= 1000;
      playerConsecutiveTurns++;
      enemyConsecutiveTurns = 0;
      forcePlayerTurn = false;
      
      events.push({ frame: timeFrames, type: 'attack', actor: 'player', damage: damage, hpRemaining: currentEnemy.currentHp });
      
      if (currentEnemy.currentHp <= 0) {
        const isLastEnemy = (currentEnemyIndex === enemies.length - 1);
        events.push({ frame: timeFrames, type: 'defeat', isLast: isLastEnemy });

        // ★ ガチャチケのドロップ枚数計算 (LCKボーナス)
        const currentLck = player.battleStats?.lck || player.lck || 0;
        const lckMult = getLckBonusMultiplier(currentLck);

        let ticketCount = 1;
        if (currentLck >= 100) {
          ticketCount += Math.max(0, Math.floor(Math.log(currentLck / 100) / Math.log(3)));
        }
        
        if (Math.random() < (0.0001 * lckMult)) {
          drops.push({ name: floorData.gekido.name, type: 'gekido', count: 1 });
        }

        if (currentEnemyIndex < 3) {
          if (Math.random() < 0.20) drops.push({ name: floorData.biome.mobDrop, type: 'mob', count: 1 }); // ★ countを追加
        } else {
          drops.push({ name: "装備ガチャチケット", type: 'gacha', count: ticketCount }); // ★ countを適用
          if (Math.random() < 0.30) drops.push({ name: floorData.biome.bossDrop, type: 'boss', count: 1 });
        }
        
        // 最後の敵でなければインターバルを挟む
        if (!isLastEnemy) {
          transitionTimer = 30;
        } else {
          currentEnemyIndex++; // 勝利判定のために進める
        }
        continue;
      }
      
      if (playerConsecutiveTurns >= 10 && currentEnemy.currentHp > 0) {
        forceEnemyTurn = true;
        playerConsecutiveTurns = 0;
        enemyGauge = Math.max(1000, enemyGauge);
        events.push({ frame: timeFrames, type: 'stopper' });
      }
    } 
    else if (isEnemyAct) {
      let damage = Math.max(0, currentEnemy.str - Math.floor(player.vit * 0.25));
      playerHp -= damage;
      enemyGauge -= 1000;
      enemyConsecutiveTurns++;
      playerConsecutiveTurns = 0; 
      forceEnemyTurn = false;

      events.push({ frame: timeFrames, type: 'attack', actor: 'enemy', damage: damage, hpRemaining: playerHp });

      if (enemyConsecutiveTurns >= 10 && playerHp > 0) {
        forcePlayerTurn = true;
        enemyConsecutiveTurns = 0;
        playerGauge = Math.max(1000, playerGauge);
      }
    }

    if (timeFrames > 5400) { playerHp = 0; break; }
  }

  const formatTime = (frames) => {
    const totalSeconds = Math.floor(frames / 60);
    const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

   const aggregatedDrops = [];
  drops.forEach(d => {
    const existing = aggregatedDrops.find(x => x.name === d.name);
    if (existing) {
      existing.count += d.count; 
    } else {
      aggregatedDrops.push({ ...d});
    }
  });
  // AGI加算ロジック部分
const TICK = 1000 / 60; // 1秒(60F)で1000溜まる基準値

// 相手との比率を計算（最大10倍）
let pRatio = player.agi / currentEnemy.agi;
let eRatio = currentEnemy.agi / player.agi;

// 遅い方の速度を1s(TICK)に固定し、速い方の加算量を倍率化する
let pSpeed = pRatio >= 1 ? Math.min(10, pRatio) * TICK : TICK;
let eSpeed = eRatio > 1 ? Math.min(10, eRatio) * TICK : TICK;

playerGauge += pSpeed;
enemyGauge += eSpeed;
  return {
    isWin: playerHp > 0 && currentEnemyIndex >= enemies.length,
    clearTime: formatTime(timeFrames),
    totalFrames: timeFrames,
    remainingHp: playerHp,
    drops: aggregatedDrops,
    events
  };
}
