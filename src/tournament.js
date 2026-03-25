// src/tournament.js
import { getRankingData, getAllUsersForPrize, getFirstGenesisRecord } from './firebase.js';

// --- 賞金定義 ---
const PRIZES = {
  floor:[300, 200, 150, 100, 80, 50, 40, 30, 20, 10], // 1位〜10位
  firstClearCount:[111, 77, 51],
  collectionCount: [51, 40, 25],
  winCount: [51, 40, 25],
  gachaCount:[51, 40, 25],
  firstGenesis: [100],
  str:[40, 25, 15], vit: [40, 25, 15], agi:[40, 25, 15], lck: [40, 25, 15],
  rockPush: [25, 15, 10], daruma:[25, 15, 10], chicken: [25, 15, 10], guard:[25, 15, 10],
  '1to20': [25, 15, 10], command:[25, 15, 10], clover: [25, 15, 10], slot:[25, 15, 10]
};

// 順位報酬のみを計算（歩合は別途ユーザーデータから計算する）
export function getPrizeForRank(rankId, index, score = 0) {
  let yen = 0;
  
  if (PRIZES[rankId] && index < PRIZES[rankId].length) {
    yen += PRIZES[rankId][index];
  }

  if (rankId === 'floor') {
    yen += score; 
    if (score >= 25) yen += 20;
    if (score >= 51) yen += 30;
  }
  if (rankId === 'totalLv') {
    yen += Math.floor(score / 2); // 特訓Lv 2 につき 1円
  }
  if (rankId === 'bugReports') {
    yen += score * 10; // バグ報告 1件につき 10円
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

  // 1. 各ランキングの順位報酬を加算
  for (const rankId of Object.keys(PRIZES)) {
    const data = await getRankingData(rankId, false);
    data.forEach((item, index) => {
      if (initPlayer(item.name)) {
        playerPrizes[item.name] += getPrizeForRank(rankId, index);
      }
    });
  }

  // 2. Firebaseから全ユーザーデータを取得して歩合報酬 ＆ バウンティを計算
  const allUsers = await getAllUsersForPrize();
  
  allUsers.forEach(u => {
    if (initPlayer(u.name)) {
      // 階層歩合 (1層につき1円, 25層で+20円, 51層で+30円)
      let floorScore = u.floor || 1;
      let floorYen = floorScore; 
      if (floorScore > 25) floorYen += 20;
      if (floorScore >= 51) floorYen += 30;
      playerPrizes[u.name] += floorYen;

      // 特訓Lv歩合 (Lv 2 につき 1円)
      let lvYen = Math.floor((u.totalLv || 4) / 2);
      playerPrizes[u.name] += lvYen;

      // 🐛 バグ報告バウンティ (1件につき 10円)
      // 主催者がFirebaseから手動で u.bugReports という数値フィールドを追加する想定
      let bugBountyYen = (u.bugReports || 0) * 10;
      playerPrizes[u.name] += bugBountyYen;
    }
  });

  // 3. ✨ ファースト・ジェネシス賞 (+100円)
  const firstGen = await getFirstGenesisRecord();
  if (firstGen && initPlayer(firstGen.name)) {
    playerPrizes[firstGen.name] += 100;
  }

  const result = Object.keys(playerPrizes).map(name => ({
    name: name,
    score: playerPrizes[name]
  }));
  
  result.sort((a, b) => b.score - a.score);
  return result;
}