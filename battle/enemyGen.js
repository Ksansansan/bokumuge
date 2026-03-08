// src/enemyGen.js

// 5階層ごとに変わる10種類の環境
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

// 50階層（10バイオーム×5）ごとに切り替わる10種類の接頭辞
const PREFIXES = ["", "[凶] ", "[狂] ", "[絶] ", "[神] ", "[魔] ", "[獄] ", "[滅] ", "[創] ", "[終] "];

// MAX 500層
const MAX_FLOOR = BIOMES.length * 5 * PREFIXES.length;

export function generateFloorData(targetFloor) {
  // 500層を超えないようにクリップ
  const floor = Math.min(targetFloor, MAX_FLOOR);
  
  const biomeIndex = Math.floor((floor - 1) / 5) % BIOMES.length;
  const loopCount = Math.floor((floor - 1) / (BIOMES.length * 5));
  const prefix = PREFIXES[Math.min(loopCount, PREFIXES.length - 1)];

  const biome = BIOMES[biomeIndex];
  const subLevel = ((floor - 1) % 5) + 1; // 1〜5
  const stageName = `${prefix}${biome.name}-${subLevel}`;

  // インフレ計算 (1階層ごとに1.15倍)
  const powerMultiplier = Math.pow(1.15, floor - 1);

  const createMob = (num) => ({
    name: `雑魚モンスター${num}`,
    hp: Math.floor(50 * powerMultiplier),
    str: Math.floor(15 * powerMultiplier),
    vit: Math.floor(5 * powerMultiplier),
    agi: Math.floor(10 * powerMultiplier)
  });

  const enemies =[
    createMob(1), createMob(2), createMob(3),
    {
      name: `🔥 ${prefix}エリアボス`,
      hp: Math.floor(200 * powerMultiplier),
      str: Math.floor(35 * powerMultiplier),
      vit: Math.floor(15 * powerMultiplier),
      agi: Math.floor(20 * powerMultiplier)
    }
  ];

  // --- 【超重要】45秒でギリギリ勝てる推奨ステータスの逆算アルゴリズム ---
  const TARGET_FRAMES = 45 * 60; // 45秒
  const recommendedAgi = enemies[3].agi; // AGIはボスの基準に合わせる

  // 1. 45秒以内で全敵を倒し切れる最小のSTRを求める
  let recommendedStr = enemies[3].vit + 1;
  while (true) {
    let requiredFrames = 0;
    for (const enemy of enemies) {
      const dmg = Math.max(1, recommendedStr - enemy.vit);
      const hitsNeeded = Math.ceil(enemy.hp / dmg);
      // 1000ゲージ溜めるのにかかるフレーム ＝ (1000 / AGI)
      requiredFrames += hitsNeeded * (1000 / recommendedAgi);
    }
    if (requiredFrames <= TARGET_FRAMES) break;
    recommendedStr++;
  }

  // 2. そのSTRで戦った場合、敵が生きている間に受ける総ダメージを耐えられる最小のVITを求める
  let recommendedVit = 1;
  while (true) {
    let playerHp = recommendedVit * 10;
    let isSurvived = true;
    for (const enemy of enemies) {
      const dmgToEnemy = Math.max(1, recommendedStr - enemy.vit);
      const hitsNeeded = Math.ceil(enemy.hp / dmgToEnemy);
      const framesAlive = hitsNeeded * (1000 / recommendedAgi);
      
      // 敵が生きている間に攻撃してくる回数
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
    isMaxFloor: floor >= MAX_FLOOR, // これが true なら UI で右矢印を disabled にする
    stageName,
    recommended: {
      str: recommendedStr,
      vit: recommendedVit,
      agi: recommendedAgi
    },
    enemies,
    drops:[
      { name: "装備ガチャチケット", prob: 100, isCollection: false },
      { name: subLevel === 5 ? biome.bossDrop : biome.mobDrop, prob: 30, isCollection: true }
    ]
  };
}
