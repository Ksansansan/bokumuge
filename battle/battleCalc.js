// src/battleCalc.js

export function simulateBattle(player, enemies) {
  let log =[]; // 戦闘の履歴を保存
  let currentEnemyIndex = 0;
  // 敵の現在HPを初期化
  let currentEnemy = { ...enemies[currentEnemyIndex], currentHp: enemies[currentEnemyIndex].hp };
  
  // プレイヤーの最大HPは「VIT × 10」と定義
  let playerHp = player.vit * 10; 
  
  // 行動ゲージ（1000溜まったら行動）
  let playerGauge = 0;
  let enemyGauge = 0;
  let playerConsecutiveTurns = 0; // 連続行動のストッパー用
  
  let timeFrames = 0; // タイム計測用 (60フレーム=1秒と想定)

  while (currentEnemyIndex < enemies.length && playerHp > 0) {
    // 1フレームごとにAGIを加算
    playerGauge += player.agi;
    enemyGauge += currentEnemy.agi;
    timeFrames++;

    // --- プレイヤーの行動 ---
    if (playerGauge >= 1000) {
      let damage = Math.max(0, player.str - currentEnemy.vit); // 定数減算（最低0）
      currentEnemy.currentHp -= damage;
      playerGauge -= 1000;
      playerConsecutiveTurns++;
      
      log.push(`[${Math.floor(timeFrames/60)}秒] プレイヤーの攻撃！ ${currentEnemy.name}に ${damage} ダメージ！ (残りHP: ${currentEnemy.currentHp})`);
      
      if (currentEnemy.currentHp <= 0) {
        log.push(`▶ ${currentEnemy.name} を撃破！`);
        currentEnemyIndex++;
        if (currentEnemyIndex < enemies.length) {
          currentEnemy = { ...enemies[currentEnemyIndex], currentHp: enemies[currentEnemyIndex].hp };
          enemyGauge = 0; // 敵が切り替わったら敵のゲージのみリセット
          playerConsecutiveTurns = 0;
        }
        continue;
      }
      
      // 【重要】AGIが極端に高い場合の10連続行動ストッパー
      if (playerConsecutiveTurns >= 10 && currentEnemy.currentHp > 0) {
        log.push(`⚠️ プレイヤーが10回連続攻撃したため、敵が強制割り込み行動します！`);
        enemyGauge = 1000; // 敵のゲージを強制MAXに
        playerConsecutiveTurns = 0;
      }
    } 
    // --- 敵の行動 ---
    else if (enemyGauge >= 1000) {
      let damage = Math.max(0, currentEnemy.str - player.vit);
      playerHp -= damage;
      enemyGauge -= 1000;
      playerConsecutiveTurns = 0; // 連続行動リセット
      
      log.push(`[${Math.floor(timeFrames/60)}秒] ${currentEnemy.name}の攻撃！ プレイヤーに ${damage} ダメージ！ (残りHP: ${playerHp})`);
    }

    // --- 【泥沼回避処理】お互いに0ダメージの場合の強制終了 ---
    if (Math.max(0, player.str - currentEnemy.vit) === 0 && Math.max(0, currentEnemy.str - player.vit) === 0) {
      log.push(`❌ お互いにダメージを与えられないため、戦闘はタイムアップ（敗北）となります。`);
      playerHp = 0;
      break;
    }
    
    // 制限時間（例：リアルタイムで3分＝10800フレーム）を超えたら敗北
    if (timeFrames > 10800) {
      log.push(`❌ 戦闘が長引きすぎたためタイムアップ（敗北）です。STRを上げましょう！`);
      playerHp = 0;
      break;
    }
  }

  // 秒数に変換して「mm:ss」のフォーマットにする関数
  const formatTime = (frames) => {
    const totalSeconds = Math.floor(frames / 60);
    const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  return {
    isWin: playerHp > 0,
    clearTime: formatTime(timeFrames),
    remainingHp: playerHp,
    log
  };
}
