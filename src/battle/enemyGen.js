// src/battle/enemyGen.js

// mobName と bossName を追加
const BIOMES =[
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

  // 基本となる雑魚のステータス（STRはVITより少し高めに設定）
  const baseStr = 11 * linearBonus + 14 * powerMultiplier;
  const baseVit = 14 * linearBonus + 18 * powerMultiplier;
  const baseAgi = 12 * linearBonus + 16 * powerMultiplier;

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
  const bossStr = 18 * linearBonus + 24 * powerMultiplier;
  const bossVit = 22.5 * linearBonus + 30 * powerMultiplier;
  const bossAgi = 21 * linearBonus + 26 * powerMultiplier;

  const enemies =[
    createMob(1), createMob(2), createMob(3),
    {
      name: `🔥 ${prefix}${biome.bossName}`,
      str: Math.floor(bossStr),
      vit: Math.floor(bossVit),
      agi: Math.floor(bossAgi)
    }
  ];

  // 推奨ステータス逆算（前回のまま変更なし）
  const TARGET_FRAMES = 45 * 60; 
  const recommendedAgi = enemies[3].agi;

  let recommendedStr = enemies[3].vit + 1;
  while (true) {
    let requiredFrames = 0;
    for (const enemy of enemies) {
      const dmg = Math.max(1, recommendedStr - enemy.vit * 0.5);
      const enemyHp = enemy.vit * 10;
      const hitsNeeded = Math.ceil(enemyHp / dmg);
      requiredFrames += hitsNeeded * (1000 / recommendedAgi);
    }
    if (requiredFrames <= TARGET_FRAMES) break;
    recommendedStr++;
  }

  let recommendedVit = 1;
  while (true) {
    let playerHp = recommendedVit * 10;
    let isSurvived = true;
    for (const enemy of enemies) {
      const dmgToEnemy = Math.max(1, recommendedStr - Math.floor(enemy.vit * 0.5));
      const enemyHp = enemy.vit * 10;
      const hitsNeeded = Math.ceil(enemyHp / dmgToEnemy);
      const framesAlive = hitsNeeded * (1000 / recommendedAgi);
      const enemyAttacks = Math.floor(framesAlive * enemy.agi / 1000);
      const dmgFromEnemy = Math.max(0, enemy.str - Math.floor(recommendedVit * 0.5));
      
      playerHp -= (enemyAttacks * dmgFromEnemy);
      if (playerHp <= 0) { isSurvived = false; break; }
    }
    if (isSurvived) break;
    recommendedVit++;
  }

  return {
    floor, isMaxFloor: floor >= MAX_FLOOR, stageName,
    recommended: { str: recommendedStr, vit: recommendedVit, agi: recommendedAgi }, enemies,
    drops:[
      { name: "装備ガチャチケット", prob: 100, isCollection: false },
      { name: subLevel === 5 ? biome.bossDrop : biome.mobDrop, prob: 30, isCollection: true }
    ]
  };
}
