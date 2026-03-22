// src/tournament.js
import { getRankingData } from './firebase.js';

// --- 賞金定義 ---
const PRIZES = {
  floor:[300, 200, 150, 100, 80, 50, 40, 30, 20, 10], // 1位〜10位
  firstClearCount:[111, 77, 51],
  collectionCount: [51, 40, 25],
  winCount: [51, 40, 25],
  gachaCount:[51, 40, 25],
  str:[40, 25, 15], vit: [40, 25, 15], agi:[40, 25, 15], lck: [40, 25, 15],
  rockPush: [25, 15, 10], daruma:[25, 15, 10], chicken: [25, 15, 10], guard:[25, 15, 10],
  '1to20': [25, 15, 10], command:[25, 15, 10], clover: [25, 15, 10], slot:[25, 15, 10]
};

// 全プレイヤーの現在の賞金を計算してランキング配列で返す
export async function calculateTournamentPrizes() {
  const playerPrizes = {};

  // 初期化ヘルパー
  const initPlayer = (name) => {
    if (!playerPrizes[name]) playerPrizes[name] = { total: 0, details:[] };
  };

  // 1. 各ランキングの順位報酬を計算
  for (const [rankId, prizeArray] of Object.entries(PRIZES)) {
    // ステータス系は「基礎値(false)」で計算（※ルールに合わせて適宜 true/false 変更可）
    const isTotal = false; 
    const data = await getRankingData(rankId, isTotal);
    
    data.forEach((item, index) => {
      if (index < prizeArray.length) {
        initPlayer(item.name);
        const yen = prizeArray[index];
        playerPrizes[item.name].total += yen;
      }
    });
  }

  // 2. 歩合制報酬（全員分）を計算するため、最高到達層ランキングを全件(50件)取得して計算
  const floorData = await getRankingData('floor', false);
  const lvData = await getRankingData('totalLv', false);

  floorData.forEach(item => {
    initPlayer(item.name);
    let floorYen = item.score; // 1層につき1円
    if (item.score >= 25) floorYen += 20;
    if (item.score >= 51) floorYen += 30;
    playerPrizes[item.name].total += floorYen;
  });

  lvData.forEach(item => {
    initPlayer(item.name);
    let lvYen = Math.floor(item.score / 2); // 特訓Lv 2につき1円
    playerPrizes[item.name].total += lvYen;
  });

  // 3. ランキング配列に変換してソート（降順）
  const result = Object.keys(playerPrizes).map(name => ({
    name: name,
    score: playerPrizes[name].total
  }));
  
  result.sort((a, b) => b.score - a.score);
  return result;
}

// 特定のランキングで特定の順位を取ったらいくらもらえるかを返す
// ★修正：スコア(score)も引数に受け取り、歩合報酬を加算する
export function getPrizeForRank(rankId, index, score = 0) {
  let yen = 0;
  
  // 順位報酬
  if (PRIZES[rankId] && index < PRIZES[rankId].length) {
    yen += PRIZES[rankId][index];
  }

  // 歩合報酬
  if (rankId === 'floor') {
    yen += score; // 1層につき1円
    if (score >= 25) yen += 20;
    if (score >= 51) yen += 30;
  }
  if (rankId === 'totalLv') {
    yen += Math.floor(score / 2); // 特訓Lv2につき1円
  }
  
  return yen;
}

export async function calculateTournamentPrizes() {
  const playerPrizes = {};
  const initPlayer = (name) => { 
    if (!name || name === "undefined") return false; 
    if (!playerPrizes[name]) playerPrizes[name] = 0; 
    return true;
  };

  // 全対象ランキングをループ
  const allRanks = Object.keys(PRIZES);
  if (!allRanks.includes('totalLv')) allRanks.push('totalLv'); // 歩合のみのtotalLvも追加

  for (const rankId of allRanks) {
    const data = await getRankingData(rankId, false); // 基礎値で計算
    data.forEach((item, index) => {
      if (initPlayer(item.name)) {
        playerPrizes[item.name] += getPrizeForRank(rankId, index, item.score);
      }
    });
  }

  const result = Object.keys(playerPrizes).map(name => ({
    name: name,
    score: playerPrizes[name]
  }));
  
  result.sort((a, b) => b.score - a.score);
  return result;
}