// src/gacha/equipment.js

export const RARITY_DATA =[
  { id: "C",   name: "コモン",               prob: 66.7,       mult: 1.0,   add: 20 },
  { id: "UC",  name: "アンコモン",             prob: 22.2,       mult: 1.5,   add: 70 },
  { id: "R",   name: "レア",                 prob: 7.4,        mult: 2.2,   add: 200 },
  { id: "HR",  name: "ハイパーレア",           prob: 2.5,        mult: 3.2,   add: 500 },
  { id: "SR",  name: "スーパーレア",           prob: 0.82,       mult: 4.8,   add: 1300 },
  { id: "SSR", name: "スーパースペシャルレア", prob: 0.27,       mult: 7.0,   add: 3000 },
  { id: "ER",  name: "エピックレア",           prob: 0.09,       mult: 10.5,  add: 7000 },
  { id: "UR",  name: "ウルトラレア",           prob: 0.03,       mult: 15.5,  add: 16000 },
  { id: "LR",  name: "レジェンドレア",         prob: 0.01,       mult: 23.0,  add: 40000 },
  { id: "MR",  name: "ミシカルレア",           prob: 0.003,      mult: 35.0,  add: 80000 },
  { id: "GR",  name: "ゴッドレア",             prob: 0.001,      mult: 51.0,  add: 180000 },
  { id: "XR",  name: "エクストラレア",         prob: 0.0003,     mult: 75.0,  add: 400000 },
  { id: "GEN", name: "ジェネシス",             prob: 0.0001,     mult: 111.0, add: 1000000 },

  { id: "SEC", name: "シークレット",           prob: 0.0000194,  mult: 151.0, add: 2514000 } 
];

export const EQUIP_NAMES = {
  str:["朽ちた木の枝", "兵士の銅剣", "業物の鉄剣", "銀騎士の長剣", "勇者の聖剣", "覇王の宝剣", "魔剣グラム", "聖剣エクスカリバー", "神槍グングニル", "終焉の魔剣レーヴァテイン", "創世剣・天地開闢", "次元断層の刃", "始まりの創造神剣", "特異神剣・シンギュラリティ"],
  vit:["ボロボロの布服", "なめし革の鎧", "鋼鉄の重鎧", "ミスリルの鎖帷子", "王家の紋章鎧", "オリハルコンの神鎧", "聖盾アイギス", "竜神の逆鱗鎧", "天使の神衣", "冥王の絶望鎧", "神の威光", "絶対結界アヴァロン", "無限宇宙の神装", "空間跋扈の衣・パラドクス"],
  agi:["すり減ったわらじ", "旅人の革靴", "しなやかな風切靴", "銀細工の飛燕靴", "天馬の疾風靴", "星渡りの天靴", "閃光のヘルメスブーツ", "光速のフェンリルブーツ", "天駆けの光翼靴", "虚空を歩む靴", "超光速の神靴", "時空跳躍のブーツ", "概念超越の歩界", "事象跳躍の靴・タキオン"],
  lck:["石ころの指輪", "欠けた銅の指輪", "水晶のペンダント", "魔力宿るアミュレット", "精霊の涙", "竜の心臓", "時の歯車", "賢者の石", "星屑の指輪", "宇宙の真理", "神格の証", "特異点の核", "ぼくらの無限塔", "創造神の瞳・アカシック"]
};

export const STAT_TYPES = ["str", "vit", "agi", "lck"];

// LCKボーナス倍率：1.0 + ((LCK/100) ^ 0.4)
export function getLckBonusMultiplier(lck) {
  if (lck <= 100) return 1.0;
  return 1.0 + Math.pow(lck / 100, 0.4);
}

// 実際の確率分布を計算（表示用）
export function getActualProbabilities(lck) {
  const mult = getLckBonusMultiplier(lck);
  const probs =[];
  let remaining = 100.0;

  for (let i = RARITY_DATA.length - 2; i >= 1; i--) {
    let p = Math.min(remaining, RARITY_DATA[i].prob * mult);
    probs[i] = p;
    remaining -= p;
  }
  probs[0] = Math.max(0, remaining); // コモン(C)は残りの確率を全て被る
  return probs;
}

// ガチャを引く
export function pullGacha(lck) {
  const lckMult = getLckBonusMultiplier(lck);
  const rand = Math.random() * 100;
  let currentSum = 0;
  let selectedRarityIndex = 0;

  for (let i = RARITY_DATA.length - 1; i >= 1; i--) {
    currentSum += RARITY_DATA[i].prob * lckMult;
    if (rand <= currentSum) {
      selectedRarityIndex = i;
      break;
    }
  }

  const typeIndex = Math.floor(Math.random() * 4);
  const type = STAT_TYPES[typeIndex];

  return {
    type, rarityIndex: selectedRarityIndex, rarityId: RARITY_DATA[selectedRarityIndex].id,
    name: EQUIP_NAMES[type][selectedRarityIndex]
  };
}

/**
 * フィボナッチ数列による合成レベル計算 (1個目=Lv1, 以降1,1,2,3,5...でLvUP)
 * @param {Number} count 現在の所持数
 */
export function calcEquipLevel(count) {
  if (count <= 0) return { level: 0, current: 0, nextReq: 1 };
  
  let lv = 1;
  let remaining = count - 1; // 1個目は本体として消費
  
  let a = 1;
  let b = 1;
  let nextReq = a;
  
  // 無限にフィボナッチ数列を計算してレベルを上げる
  while (remaining >= nextReq) {
    remaining -= nextReq;
    lv++;
    
    let temp = a + b;
    a = b;
    b = temp;
    nextReq = a;
  }
  
  return { level: lv, current: remaining, nextReq: nextReq };
}

// 装備ステータスの計算 (1.12^n 倍)
export function getEquipStats(rarityIndex, level) {
  const baseData = RARITY_DATA[rarityIndex];
  const lvBonus = Math.pow(1.12, level - 1);
  return {
    mult: baseData.mult * lvBonus,
    add: baseData.add * lvBonus // 定数も1.12倍で成長させる
  };
}
