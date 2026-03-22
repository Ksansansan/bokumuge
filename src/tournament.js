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

// 特定のランキングで特定の順位を取ったらいくらもらえるかを返す
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
