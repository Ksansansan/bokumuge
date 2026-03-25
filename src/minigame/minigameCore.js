// src/minigame/minigameCore.js

// ステータスごとの設定
const STATUS_CONFIG = {
  str: { name: "STR" },
  vit: { name: "VIT" },
  agi: { name: "AGI" },
  lck: { name: "LCK" }
};

/**
 * 経験値を加算し、レベルアップ処理を行う関数
 */
export function applyMinigameResult(player, statKey, expGained, baseGained) {
  if (!player.exp) player.exp = { str: 0, vit: 0, agi: 0, lck: 0 };
  if (!player.lv) player.lv = { str: 1, vit: 1, agi: 1, lck: 1 };
  
  const totalLevel = player.lv.str + player.lv.vit + player.lv.agi + player.lv.lck;
  const currentLv = player.lv[statKey];
  const multiplier = getLevelMultiplier(currentLv, totalLevel);
  
  const actualBaseGain = Math.floor(baseGained * multiplier);
  player[statKey] += actualBaseGain;

  // ★修正：魔の激動のバフ（%）を経験値に適用
  const gekidoBuff = player.lastGekidoBuff || 0;
  const actualExpGain = Math.floor(expGained * (1 + gekidoBuff / 100));

  player.exp[statKey] += actualExpGain;

  let leveledUp = false;
  let reqExp = getRequiredExp(player.lv[statKey]);

  while (player.exp[statKey] >= reqExp) {
    player.exp[statKey] -= reqExp;
    player.lv[statKey]++;
    leveledUp = true;
    reqExp = getRequiredExp(player.lv[statKey]);
  }

  return {
    statKey, actualBaseGain, multiplier, leveledUp,
    currentLv: player.lv[statKey],
    currentExp: player.exp[statKey],
    nextExp: reqExp,
    actualExpGain // ★リザルト表示用に返す
  };
}

/**
 * レベルごとの倍率計算
 * @param {Number} level そのステータスのレベル
 * @param {Number} totalLevel 全ステータスの合計レベル
 */
export function getLevelMultiplier(level, totalLevel) {
  // 基本倍率: 1.12^n倍
  const baseMult = Math.floor(100 * Math.pow(1.12, (level - 1)))/100;
  
  // ★シナジーボーナス: 合計Lv 1につき +1% の全体底上げ
  // STR Lv50まで上げたら、VIT Lv1でも最初から 1.5倍 でスタートできる！
  const synergyBonus = 1.0 + totalLevel * 0.01;
  
  return baseMult * synergyBonus;
}

/**
 * 次のレベルに必要な経験値
 * 序盤はサクサク、後半はキツくする曲線
 */
export function getRequiredExp(level) {
  // 急激すぎると心が折れるので、1.15乗くらいの緩やかなカーブにするのがおすすめ
  return Math.floor(100 * Math.pow(1.12, (level - 1)) + (level - 1) * 25);
}
