// src/battleCalc.js

export function simulateBattle(player, enemies) {
  let log =[];
  let currentEnemyIndex = 0;
  let currentEnemy = { ...enemies[currentEnemyIndex], currentHp: enemies[currentEnemyIndex].hp };
  
  let playerHp = player.vit * 10; 
  let playerGauge = 0;
  let enemyGauge = 0;
  let playerConsecutiveTurns = 0;
  let timeFrames = 0;

  while (currentEnemyIndex < enemies.length && playerHp > 0) {
    playerGauge += player.agi;
    enemyGauge += currentEnemy.agi;
    timeFrames++;

    // プレイヤーの行動
    if (playerGauge >= 1000) {
      let damage = Math.max(0, player.str - currentEnemy.vit);
      currentEnemy.currentHp -= damage;
      playerGauge -= 1000;
      playerConsecutiveTurns++;
      
      log.push(`[${Math.floor(timeFrames/60)}秒] プレイヤーの攻撃！ ${currentEnemy.name}に ${damage} ダメージ！ (残りHP: ${currentEnemy.currentHp})`);
      
      if (currentEnemy.currentHp <= 0) {
        log.push(`▶ ${currentEnemy.name} を撃破！`);
        currentEnemyIndex++;
        if (currentEnemyIndex < enemies.length) {
          currentEnemy = { ...enemies[currentEnemyIndex], currentHp: enemies[currentEnemyIndex].hp };
          enemyGauge = 0;
          playerConsecutiveTurns = 0;
        }
        continue;
      }
      
      if (playerConsecutiveTurns >= 10 && currentEnemy.currentHp > 0) {
        log.push(`⚠️ プレイヤーが10回連続攻撃したため、敵が強制割り込み行動します！`);
        enemyGauge = 1000;
        playerConsecutiveTurns = 0;
      }
    } 
    // 敵の行動
    else if (enemyGauge >= 1000) {
      let damage = Math.max(0, currentEnemy.str - player.vit);
      playerHp -= damage;
      enemyGauge -= 1000;
      playerConsecutiveTurns = 0;
      
      log.push(`[${Math.floor(timeFrames/60)}秒] ${currentEnemy.name}の攻撃！ プレイヤーに ${damage} ダメージ！ (残りHP: ${playerHp})`);
    }

    if (Math.max(0, player.str - currentEnemy.vit) === 0 && Math.max(0, currentEnemy.str - player.vit) === 0) {
      log.push(`❌ お互いにダメージを与えられないため、戦闘はタイムアップ（敗北）となります。`);
      playerHp = 0;
      break;
    }
    
    // 制限時間：5分（300秒 ＝ 18000フレーム）に変更
    if (timeFrames > 18000) {
      log.push(`❌ 制限時間（5分）を超えたためタイムアップ（敗北）です。`);
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
    remainingHp: playerHp,
    log
  };
}
