// src/minigameCore.js

export class MinigameSystem {
  constructor(initialData = null) {
    // データベースから読み込んだ初期値（なければデフォルト）
    this.statusData = initialData || {
      STR: { baseValue: 10, level: 1, exp: 0 },
      VIT: { baseValue: 10, level: 1, exp: 0 },
      AGI: { baseValue: 10, level: 1, exp: 0 },
      LCK: { baseValue: 10, level: 1, exp: 0 }
    };
  }

  // 次のレベルに必要な経験値を計算 (Lvが上がるごとに1.5倍に増える)
  getRequiredExp(level) {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  }

  // レベルに基づく基礎値の「倍率」を計算 (1レベルにつき +5%ボーナス)
  getMultiplier(level) {
    return 1.0 + ((level - 1) * 0.05);
  }

  // 最終的なステータス値（基礎値 × レベル倍率）を取得
  getFinalValue(type) {
    const stat = this.statusData[type];
    const multiplier = this.getMultiplier(stat.level);
    return Math.floor(stat.baseValue * multiplier);
  }

  // ミニゲームクリア時の処理 (引数: 鍛えたステータス, 獲得経験値, 獲得基礎値)
  finishMinigame(type, gainedExp, gainedBase) {
    const stat = this.statusData[type];
    
    stat.baseValue += gainedBase;
    stat.exp += gainedExp;
    
    let leveledUp = false;
    let reqExp = this.getRequiredExp(stat.level);
    
    // 経験値が閾値を超えたらレベルアップ（一気に複数レベル上がるのも対応）
    while (stat.exp >= reqExp) {
      stat.exp -= reqExp;
      stat.level++;
      leveledUp = true;
      reqExp = this.getRequiredExp(stat.level); // 次の必要経験値を再計算
    }
    
    return {
      leveledUp,
      currentLevel: stat.level,
      currentExp: stat.exp,
      requiredExp: reqExp,
      currentBaseValue: stat.baseValue,
      currentMultiplier: this.getMultiplier(stat.level)
    };
  }
}
