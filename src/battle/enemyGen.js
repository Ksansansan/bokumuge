// src/enemyGen.js

const BIOMES =[
  { name: "始まりの草原", mobDrop: "スライムの粘液", bossDrop: "ゴブリン王の王冠" },
  { name: "暗い洞窟", mobDrop: "コウモリの羽", bossDrop: "岩魔像の核" },
  { name: "迷いの森", mobDrop: "トレントの枝", bossDrop: "大蜘蛛の毒牙" },
  { name: "灼熱の砂漠", mobDrop: "サソリの尾", bossDrop: "砂ワームの体液" },
  { name: "死の火山", mobDrop: "燃える石", bossDrop: "火竜の逆鱗" },
  { name: "極寒の雪山", mobDrop: "氷狼の牙", bossDrop: "氷竜の鱗" },
  { name: "朽ちた遺跡", mobDrop: "古代の歯車", bossDrop: "守護兵のコア" },
  { name: "瘴気の沼地", mobDrop: "毒ガエルの舌", bossDrop: "腐竜の骨" },
  { name: "浮遊する島", mobDrop: "風精の羽", bossDrop: "天空獣の角" },
  { name: "魔王の居城", mobDrop: "悪魔の血", bossDrop: "魔王の欠片" }
];

const PREFIXES = ["", "[凶] ", "[狂] ", "[絶] ", "[神] ", "[魔] ", "[獄] ", "[滅] ", "[創] ", "[終] "];
const MAX_FLOOR = BIOMES.length * 5 * PREFIXES.length;

export function generateFloorData(targetFloor) {
  const floor = Math.min(targetFloor, MAX_FLOOR);
  
  const biomeIndex = Math.floor((floor - 1) / 5) % BIOMES.length;
  const loopCount = Math.floor((floor - 1) / (BIOMES.length * 5));
  const prefix = PREFIXES[Math.min(loopCount, PREFIXES.length - 1)];

  const biome = BIOMES[biomeIndex];
  const subLevel = ((floor - 1) % 5) + 1;
  const stageName = `${prefix}${biome.name}-${subLevel}`;

  const powerMultiplier = Math.pow(1.19, floor - 1);

  // 【修正点】 hpプロパティを削除。VITとSTRのバランスを調整
  const createMob = (num) => ({
    name: `雑魚モンスター${num}`,
    str: Math.floor(22 * powerMultiplier), // 雑魚も少し痛い
    vit: Math.floor(6 * powerMultiplier),  // VIT6 = HP60相当
    agi: Math.floor(10 * powerMultiplier)
  });

  const enemies =[
    createMob(1), createMob(2), createMob(3),
    {
      name: `🔥 ${prefix}エリアボス`,
      str: Math.floor(35 * powerMultiplier), // ボスはガッツリ痛い
      vit: Math.floor(18 * powerMultiplier), // VIT18 = HP180相当
      agi: Math.floor(20 * powerMultiplier)
    }
  ];

  // --- 推奨ステータス逆算ロジック (敵HPを enemy.vit * 10 で計算) ---
  const TARGET_FRAMES = 45 * 60; // 45秒
  const recommendedAgi = enemies[3].agi;

  // 1. 必要なSTRの計算
  let recommendedStr = enemies[3].vit + 1;
  while (true) {
    let requiredFrames = 0;
    for (const enemy of enemies) {
      const dmg = Math.max(1, recommendedStr - enemy.vit);
      const enemyHp = enemy.vit * 10; // 敵のHPはVIT×10
      const hitsNeeded = Math.ceil(enemyHp / dmg);
      requiredFrames += hitsNeeded * (1000 / recommendedAgi);
    }
    if (requiredFrames <= TARGET_FRAMES) break;
    recommendedStr++;
  }

  // 2. 必要なVITの計算
  let recommendedVit = 1;
  while (true) {
    let playerHp = recommendedVit * 10;
    let isSurvived = true;
    for (const enemy of enemies) {
      const dmgToEnemy = Math.max(1, recommendedStr - enemy.vit);
      const enemyHp = enemy.vit * 10;
      const hitsNeeded = Math.ceil(enemyHp / dmgToEnemy);
      const framesAlive = hitsNeeded * (1000 / recommendedAgi);
      
      const enemyAttacks = Math.floor(framesAlive * enemy.agi / 1000);
      const dmgFromEnemy = Math.max(0, enemy.str - recommendedVit);
      
      playerHp -= (enemyAttacks * dmgFromEnemy);
      if (playerHp <= 0) {
        isSurvived = false;
        break;
      }
    }
    if (isSurvived) break;
    recommendedVit++;
  }

  return {
    floor,
    isMaxFloor: floor >= MAX_FLOOR,
    stageName,
    recommended: { str: recommendedStr, vit: recommendedVit, agi: recommendedAgi },
    enemies,
    drops:[
      { name: "装備ガチャチケット", prob: 100, isCollection: false },
      { name: subLevel === 5 ? biome.bossDrop : biome.mobDrop, prob: 30, isCollection: true }
    ]
  };
}
