// src/battle/battleCalc.js

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
  let playerConsecutiveTurns = 0;
  let enemyConsecutiveTurns = 0; // 敵の連続行動もカウント
  let forceEnemyTurn = false;    // 割り込みフラグ
  let forcePlayerTurn = false;
  let timeFrames = 0;

  events.push({ frame: 0, type: 'start', enemy: currentEnemy, playerMaxHp: playerMaxHp });

  while (currentEnemyIndex < enemies.length && playerHp > 0) {
    timeFrames++;

    // ★修正1：AGIの加算値を「相手の10倍」までにクリップする
    let pAgi = Math.min(player.agi, currentEnemy.agi * 10);
    let eAgi = Math.min(currentEnemy.agi, player.agi * 10);
    
    playerGauge += pAgi;
    enemyGauge += eAgi;

    // ★修正2：行動権の判定（強制割り込みを最優先する）
    let isPlayerAct = false;
    let isEnemyAct = false;

    if (forceEnemyTurn) {
      isEnemyAct = true;
    } else if (forcePlayerTurn) {
      isPlayerAct = true;
    } else if (playerGauge >= 1000 && enemyGauge >= 1000) {
      isPlayerAct = true; // 同値ならプレイヤー優先
    } else if (playerGauge >= 1000) {
      isPlayerAct = true;
    } else if (enemyGauge >= 1000) {
      isEnemyAct = true;
    }

    // --- プレイヤーの攻撃 ---
    if (isPlayerAct) {
      let damage = Math.max(1, player.str - Math.floor(currentEnemy.vit * 0.25));
      currentEnemy.currentHp -= damage;
      playerGauge -= 1000;
      playerConsecutiveTurns++;
      enemyConsecutiveTurns = 0; // 敵の連続カウントリセット
      forcePlayerTurn = false;   // 強制フラグ解除
      
      events.push({ frame: timeFrames, type: 'attack', actor: 'player', damage: damage, hpRemaining: currentEnemy.currentHp });
      
      // 倒した時の処理
      if (currentEnemy.currentHp <= 0) {
        if (currentEnemyIndex < 3) {
          if (Math.random() < 0.20) drops.push({ name: floorData.biome.mobDrop, type: 'mob' });
        } else {
          drops.push({ name: "装備ガチャチケット", type: 'gacha' });
          if (Math.random() < 0.30) drops.push({ name: floorData.biome.bossDrop, type: 'boss' });
        }

        currentEnemyIndex++;
        if (currentEnemyIndex < enemies.length) {
          currentEnemy = { ...enemies[currentEnemyIndex], maxHp: enemies[currentEnemyIndex].vit * 10, currentHp: enemies[currentEnemyIndex].vit * 10 };
          enemyGauge = 0;
          playerConsecutiveTurns = 0;
          events.push({ frame: timeFrames, type: 'next_enemy', enemy: currentEnemy });
        }
        continue;
      }
      
      // ★修正3：10回攻撃したら次フレームは「強制的に敵のターン」にする
      if (playerConsecutiveTurns >= 10 && currentEnemy.currentHp > 0) {
        forceEnemyTurn = true;
        playerConsecutiveTurns = 0;
        enemyGauge = Math.max(1000, enemyGauge); // 敵のゲージを満タンに保証
        events.push({ frame: timeFrames, type: 'stopper' });
      }
    } 
    // --- 敵の攻撃 ---
    else if (isEnemyAct) {
      let damage = Math.max(0, currentEnemy.str - Math.floor(player.vit * 0.25));
      playerHp -= damage;
      enemyGauge -= 1000;
      enemyConsecutiveTurns++;
      playerConsecutiveTurns = 0; 
      forceEnemyTurn = false;

      events.push({ frame: timeFrames, type: 'attack', actor: 'enemy', damage: damage, hpRemaining: playerHp });

      // 敵が10回連続攻撃した場合はプレイヤーにターンを渡す（敵のAGIが高い場合）
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
  rawDrops.forEach(d => {
    const existing = aggregatedDrops.find(x => x.name === d.name);
    if (existing) {
      existing.count++;
    } else {
      aggregatedDrops.push({ ...d, count: 1 });
    }
  });
  
  return {
    isWin: playerHp > 0 && currentEnemyIndex >= enemies.length,
    clearTime: formatTime(timeFrames),
    totalFrames: timeFrames,
    remainingHp: playerHp,
    drops: aggregatedDrops,
    events
  };
}
