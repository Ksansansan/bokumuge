// src/battle/battleCalc.js

export function simulateBattle(player, enemies) {
  let log = [];
  let events =[]; // UI描画用のイベント履歴
  let currentEnemyIndex = 0;
  
  let currentEnemy = { 
    ...enemies[currentEnemyIndex], 
    maxHp: enemies[currentEnemyIndex].vit * 10,
    currentHp: enemies[currentEnemyIndex].vit * 10 
  };
  
  let playerMaxHp = player.vit * 10;
  let playerHp = playerMaxHp; 
  let playerGauge = 0;
  let enemyGauge = 0;
  let playerConsecutiveTurns = 0;
  let timeFrames = 0;

  // 初期化イベント
  events.push({ frame: 0, type: 'start', enemy: currentEnemy, playerMaxHp: playerMaxHp });

  while (currentEnemyIndex < enemies.length && playerHp > 0) {
    playerGauge += player.agi;
    enemyGauge += currentEnemy.agi;
    timeFrames++;

    if (playerGauge >= 1000) {
      let damage = Math.max(0, player.str - Math.floor(currentEnemy.vit * 0.2));
      currentEnemy.currentHp -= damage;
      playerGauge -= 1000;
      playerConsecutiveTurns++;
      
      log.push(`[${Math.floor(timeFrames/60)}秒] プレイヤーの攻撃！ ${currentEnemy.name}に ${damage} ダメージ！ (残りHP: ${currentEnemy.currentHp})`);
      // UI用イベント記録（プレイヤーの攻撃）
      events.push({ frame: timeFrames, type: 'attack', actor: 'player', damage: damage, hpRemaining: currentEnemy.currentHp });
      
      if (currentEnemy.currentHp <= 0) {
        log.push(`▶ ${currentEnemy.name} を撃破！`);
        currentEnemyIndex++;
        if (currentEnemyIndex < enemies.length) {
          currentEnemy = { 
            ...enemies[currentEnemyIndex], 
            maxHp: enemies[currentEnemyIndex].vit * 10,
            currentHp: enemies[currentEnemyIndex].vit * 10 
          };
          enemyGauge = 0;
          playerConsecutiveTurns = 0;
          events.push({ frame: timeFrames, type: 'next_enemy', enemy: currentEnemy });
        }
        continue;
      }
      
      if (playerConsecutiveTurns >= 10 && currentEnemy.currentHp > 0) {
        log.push(`⚠️ プレイヤーが10回連続攻撃したため、敵が強制割り込み行動します！`);
        enemyGauge = 1000;
        playerConsecutiveTurns = 0;
        events.push({ frame: timeFrames, type: 'stopper' });
      }
    } 
    else if (enemyGauge >= 1000) {
      let damage = Math.max(0, currentEnemy.str - Math.floor(player.vit * 0.2));
      playerHp -= damage;
      enemyGauge -= 1000;
      playerConsecutiveTurns = 0;
      
      log.push(`[${Math.floor(timeFrames/60)}秒] ${currentEnemy.name}の攻撃！ プレイヤーに ${damage} ダメージ！ (残りHP: ${playerHp})`);
      // UI用イベント記録（敵の攻撃）
      events.push({ frame: timeFrames, type: 'attack', actor: 'enemy', damage: damage, hpRemaining: playerHp });
    }

    if (Math.max(0, player.str - Math.floor(currentEnemy.vit * 0.2)) === 0 && Math.max(0, currentEnemy.str - Math.floor(player.vit * 0.2)) === 0) {
      log.push(`❌ お互いにダメージを与えられないため、戦闘はタイムアップ（敗北）となります。`);
      playerHp = 0;
      break;
    }
    
    if (timeFrames > 10800) {
      log.push(`❌ 制限時間（3分）を超えたためタイムアップ（敗北）です。`);
      playerHp = 0;
      break;
    }
  }

  const formatTime = (frames) => {
    const totalSeconds = Math.floor(frames / 60);
    const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  return {
    isWin: playerHp > 0 && currentEnemyIndex >= enemies.length,
    clearTime: formatTime(timeFrames),
    totalFrames: timeFrames, // アニメーション終了時間用に追加
    remainingHp: playerHp,
    log,
    events
  };
}
