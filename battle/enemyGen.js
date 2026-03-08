// src/enemyGen.js

// 5階層ごとに変わる環境（バイオーム）の定義
const BIOMES =[
  { name: "始まりの草原", mobDrop: "スライムの粘液", bossDrop: "ゴブリン王の王冠" },
  { name: "暗い洞窟", mobDrop: "コウモリの羽", bossDrop: "岩魔像の核" },
  { name: "迷いの森", mobDrop: "トレントの枝", bossDrop: "大蜘蛛の毒牙" },
  { name: "灼熱の砂漠", mobDrop: "サソリの尾", bossDrop: "砂ワームの体液" },
  { name: "死の火山", mobDrop: "燃える石", bossDrop: "火竜の逆鱗" }
];

export function generateFloorData(floor) {
  // 環境の特定 (1-5層ならindex0, 6-10層ならindex1...)
  const biomeIndex = Math.floor((floor - 1) / 5) % BIOMES.length;
  // 環境名に付くランク接頭辞 (周回によるインフレ演出)
  const loopCount = Math.floor((floor - 1) / (BIOMES.length * 5));
  const prefixes = ["", "[凶] ", "[狂] ", "[絶] ", "[神] "];
  const prefix = prefixes[Math.min(loopCount, prefixes.length - 1)];

  const biome = BIOMES[biomeIndex];
  const subLevel = ((floor - 1) % 5) + 1; // 1〜5
  const stageName = `${prefix}${biome.name}-${subLevel}`;

  // 【最重要】インフレ計算 (1階層ごとに1.15倍)
  const powerMultiplier = Math.pow(1.15, floor - 1);

  // モンスター生成関数
  const createMob = (num) => ({
    name: `雑魚モンスター${num}`,
    hp: Math.floor(50 * powerMultiplier),
    str: Math.floor(15 * powerMultiplier),
    vit: Math.floor(5 * powerMultiplier),
    agi: Math.floor(10 * powerMultiplier)
  });

  // 雑魚3体 ＋ ボス1体 (ボスは雑魚の数倍強い)
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

  // UIに表示する「推奨ステータス」（ボスにギリギリ勝てる目安を逆算）
  const recommended = {
    str: enemies[3].vit + 5, // ボスの装甲を少し抜ける攻撃力
    vit: enemies[3].str - 2, // ボスの攻撃をギリギリ耐える防御力
    agi: enemies[3].agi
  };

  return {
    floor,
    stageName,
    recommended,
    enemies,
    drops:[
      { name: "装備ガチャチケット", prob: 100, isCollection: false },
      { name: subLevel === 5 ? biome.bossDrop : biome.mobDrop, prob: 30, isCollection: true }
    ]
  };
}
