// src/battle/enemyGen.js

// mobName と bossName を追加
export const BIOMES =[
  { name: "始まりの草原", mobName: "スライム", bossName: "ゴブリン王", mobDrop: "スライムの粘液", bossDrop: "ゴブリン王の王冠" },
  { name: "暗い洞窟", mobName: "大コウモリ", bossName: "ロックゴーレム", mobDrop: "コウモリの羽", bossDrop: "岩魔像の核" },
  { name: "迷いの森", mobName: "トレント", bossName: "ジャイアントスパイダー", mobDrop: "トレントの枝", bossDrop: "大蜘蛛の毒牙" },
  { name: "灼熱の砂漠", mobName: "デザートスコーピオン", bossName: "サンドワーム", mobDrop: "サソリの尾", bossDrop: "砂ワームの体液" },
  { name: "死の火山", mobName: "フレイムロック", bossName: "ファイアドラゴン", mobDrop: "燃える石", bossDrop: "火竜の逆鱗" },
  { name: "極寒の雪山", mobName: "アイスウルフ", bossName: "フロストドラゴン", mobDrop: "氷狼の牙", bossDrop: "氷竜の鱗" },
  { name: "朽ちた遺跡", mobName: "古代の機械兵", bossName: "遺跡の守護神", mobDrop: "古代の歯車", bossDrop: "守護兵のコア" },
  { name: "瘴気の沼地", mobName: "ポイズントード", bossName: "ゾンビドラゴン", mobDrop: "毒ガエルの舌", bossDrop: "腐竜の骨" },
  { name: "浮遊する島", mobName: "ウィンドシルフ", bossName: "スカイビースト", mobDrop: "風精の羽", bossDrop: "天空獣の角" },
  { name: "魔王の居城", mobName: "レッサーデーモン", bossName: "魔王の影", mobDrop: "悪魔の血", bossDrop: "魔王の欠片" }
];

const PREFIXES = ["", "[激] ", "[凶] ", "[狂] ", "[絶] ", "[神] ", "[魔] ", "[獄] ", "[滅] ", "[天] "];
const MAX_FLOOR = BIOMES.length * 5 * PREFIXES.length;

// 図鑑ボーナス用の属性を取得する関数
export function getDropStatType(floor, isBoss) {
  if (isBoss) return "ALL";
  const g = Math.ceil(floor / 5);
  const types =["STR", "VIT", "AGI", "LCK"];
  return types[(g - 1) % 4];
}
export function generateFloorData(targetFloor) {
  const floor = Math.min(targetFloor, MAX_FLOOR);
  
  const biomeIndex = Math.floor((floor - 1) / 5) % BIOMES.length;
  const loopCount = Math.floor((floor - 1) / (BIOMES.length * 5));
  const prefix = PREFIXES[Math.min(loopCount, PREFIXES.length - 1)];

  const biome = BIOMES[biomeIndex];
  const subLevel = ((floor - 1) % 5) + 1;
  const stageName = `${prefix}${biome.name}-${subLevel}`;

  const powerMultiplier = Math.pow(1.15, floor - 1); // 指数
  const linearBonus = floor - 1; // 階層比例（定数加算）

  // 基本となる雑魚のステータス（STRはVITより少し高めに設定） （ボスの半分）
  const baseStr = 18 * linearBonus + 24 * powerMultiplier;
  const baseVit = 24 * linearBonus + 32 * powerMultiplier;
  const baseAgi = 20 * linearBonus + 26 * powerMultiplier;

  const createMob = (num) => {
    // ★雑魚の個性付け (A=STR型, B=VIT型, C=AGI型)
    let strMult = 1.0, vitMult = 1.0, agiMult = 1.0;
    if (num === 1) { strMult = 1.2; vitMult = 0.9; agiMult = 0.9; } // A
    if (num === 2) { strMult = 0.9; vitMult = 1.2; agiMult = 0.9; } // B
    if (num === 3) { strMult = 0.9; vitMult = 0.9; agiMult = 1.2; } // C

    return {
      name: `${biome.mobName} ${String.fromCharCode(64 + num)}`, // A, B, C...
      str: Math.floor(baseStr * strMult),
      vit: Math.floor(baseVit * vitMult),
      agi: Math.floor(baseAgi * agiMult)
    };
  };

  // ボスのステータス (雑魚より一回り強い)
  const bossStr = 36 * linearBonus + 48 * powerMultiplier;
  const bossVit = 48 * linearBonus + 64 * powerMultiplier;
  const bossAgi = 40 * linearBonus + 52 * powerMultiplier;

  const enemies =[
    createMob(1), createMob(2), createMob(3),
    {
      name: `🔥 ${prefix}${biome.bossName}`,
      str: Math.floor(bossStr),
      vit: Math.floor(bossVit),
      agi: Math.floor(bossAgi)
    }
  ];

 // --- 推奨ステータス逆算（二分探索で爆速化） ---
  const TARGET_FRAMES = 30 * 60; // 30秒 (1800フレーム)
  const recommendedAgi = enemies[3].agi; // 推奨AGIは敵ボスと同じ
  const BASE_SPEED = 1000 / 60; // 1秒(60F)に1回攻撃する基準

  // ------------------------------------------------
  // 1. STRの二分探索
  // ------------------------------------------------
  let minStr = Math.floor(enemies[3].vit * 0.25) + 1; // 少なくともボスに1ダメージ与えられる値
  
  // 指定のSTRで、30秒以内に全敵を倒せるか判定する関数
  const checkStr = (strVal) => {
    let requiredFrames = 0;
    for (const enemy of enemies) {
      const dmg = Math.max(1, strVal - Math.floor(enemy.vit * 0.25));
      const enemyHp = enemy.vit * 10;
      const hitsNeeded = Math.ceil(enemyHp / dmg);
      
      const pAgi_clipped = Math.max(1, Math.min(recommendedAgi, enemy.agi * 10));
      const eAgi_clipped = Math.max(1, Math.min(enemy.agi, recommendedAgi * 10));
      const maxAgi = Math.max(pAgi_clipped, eAgi_clipped);
      
      const pSpeed = (pAgi_clipped / maxAgi) * BASE_SPEED;
      const framesPerHit = 1000 / pSpeed;
      
      requiredFrames += hitsNeeded * framesPerHit;
    }
    // インターバル3回分(90F)を足して判定
    return (requiredFrames + 90) <= TARGET_FRAMES;
  };

  // 倍々ゲームで大まかな上限(maxStr)を探す
  let maxStr = minStr;
  while (!checkStr(maxStr)) {
    // 限界突破防止 (JavaScriptの安全な整数上限)
    if (maxStr > Number.MAX_SAFE_INTEGER / 2) { maxStr = Number.MAX_SAFE_INTEGER; break; }
    maxStr *= 2; 
  }

  // 二分探索でギリギリのSTRを特定
  let recommendedStr = maxStr;
  while (minStr <= maxStr) {
    const midStr = Math.floor((minStr + maxStr) / 2);
    if (checkStr(midStr)) {
      recommendedStr = midStr; // 条件を満たしたので記録
      maxStr = midStr - 1;     // もっと低い値でも行けるか探す
    } else {
      minStr = midStr + 1;     // ダメだったので高い値を探す
    }
  }


  // ------------------------------------------------
  // 2. VITの二分探索
  // ------------------------------------------------
  let minVit = 1;
  let maxVit = 1;
  
  // 指定のVITで、全敵の攻撃を耐えきれるか判定する関数
  const checkVit = (vitVal) => {
    let playerHp = vitVal * 10;
    let isSurvived = true;
    for (const enemy of enemies) {
      const dmgToEnemy = Math.max(1, recommendedStr - Math.floor(enemy.vit * 0.25));
      const enemyHp = enemy.vit * 10;
      const hitsNeeded = Math.ceil(enemyHp / dmgToEnemy);
      
      const pAgi_clipped = Math.max(1, Math.min(recommendedAgi, enemy.agi * 10));
      const eAgi_clipped = Math.max(1, Math.min(enemy.agi, recommendedAgi * 10));
      const maxAgi = Math.max(pAgi_clipped, eAgi_clipped);
      
      const pSpeed = (pAgi_clipped / maxAgi) * BASE_SPEED;
      const eSpeed = (eAgi_clipped / maxAgi) * BASE_SPEED;
      
      const framesAlive = hitsNeeded * (1000 / pSpeed);
      const enemyAttacks = Math.floor((framesAlive * eSpeed) / 1000);
      const dmgFromEnemy = Math.max(0, enemy.str - Math.floor(vitVal * 0.25));
      
      playerHp -= (enemyAttacks * dmgFromEnemy);
      if (playerHp <= 0) { isSurvived = false; break; }
    }
    return isSurvived;
  };

  // 倍々ゲームで大まかな上限(maxVit)を探す
  while (!checkVit(maxVit)) {
    if (maxVit > Number.MAX_SAFE_INTEGER / 2) { maxVit = Number.MAX_SAFE_INTEGER; break; }
    maxVit *= 2;
  }

  // 二分探索でギリギリのVITを特定
  let recommendedVit = maxVit;
  while (minVit <= maxVit) {
    const midVit = Math.floor((minVit + maxVit) / 2);
    if (checkVit(midVit)) {
      recommendedVit = midVit;
      maxVit = midVit - 1; 
    } else {
      minVit = midVit + 1;
    }
  }

  return {
    floor, isMaxFloor: floor >= MAX_FLOOR, stageName, biome,
    recommended: { str: recommendedStr, vit: recommendedVit, agi: recommendedAgi }, 
    enemies,
    drops:[
      { name: "装備ガチャチケット", prob: 100, isCollection: false },
      { name: subLevel === 5 ? biome.bossDrop : biome.mobDrop, prob: subLevel === 5 ? 30 : 20, isCollection: true }
    ]
  };
}
