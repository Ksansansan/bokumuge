// src/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCuXSWPC0PFNeRQbPPrA-eUBLx5yTiNvv8",
  authDomain: "bokumuge.firebaseapp.com",
  projectId: "bokumuge",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ★追加：データ変化を追跡するためのキャッシュ
let lastSavedPlayerState = null;

// ==========================================
// 簡易ログイン ＆ 新規登録
// ==========================================
export async function loginOrRegister(username, pin) {
  const userRef = doc(db, "users", username);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const data = userSnap.data();
    if (data.pin === pin) {
      if (!data.timestamps) data.timestamps = {}; // 古いデータ互換
      lastSavedPlayerState = JSON.parse(JSON.stringify(data)); // キャッシュに保存
      return { success: true, data: data };
    } else {
      return { success: false, message: "パスワード(4桁)が違います" };
    }
  } else {
    const initialData = {
      name: username, pin: pin, str: 25, vit: 20, agi: 20, lck: 10,
      floor: 1, maxClearedFloor: 1, winCount: 0, collectionCount: 0, inventory: {},
      exp: { str: 0, vit: 0, agi: 0, lck: 0 }, lv:  { str: 1, vit: 1, agi: 1, lck: 1 }, totalLv: 4,
      createdAt: serverTimestamp(),
      timestamps: {} // ★項目ごとの更新日時を保存する枠
    };
    await setDoc(userRef, initialData);
    lastSavedPlayerState = JSON.parse(JSON.stringify(initialData));
    return { success: true, data: initialData };
  }
}

// ==========================================
// 初クリア者の保存
// ==========================================
export async function getFirstClearRecord(floor) {
  const docRef = doc(db, "firstClears", `floor_${floor}`);
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() : null;
}

export async function checkAndSaveFirstClear(player, floor, time) {
  const docRef = doc(db, "firstClears", `floor_${floor}`);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    const data = {
      name: player.name, time: time,
      str: player.battleStats ? player.battleStats.str : player.str,
      vit: player.battleStats ? player.battleStats.vit : player.vit,
      agi: player.battleStats ? player.battleStats.agi : player.agi,
      lck: player.battleStats ? player.battleStats.lck : player.lck,
      timestamp: serverTimestamp()
    };
    await setDoc(docRef, data);
    return true;
  }
  return false;
}

// ==========================================
// プレイヤーデータの自動セーブ（更新日時の追跡処理）
// ==========================================
export async function savePlayerData(player) {
  player.totalLv = player.lv.str + player.lv.vit + player.lv.agi + player.lv.lck;
  player.winCount = player.winCount || 0;
  player.collectionCount = player.collectionCount || 0;
  if (!player.timestamps) player.timestamps = {};
  
  const dataToSave = { ...player };
  
  if (player.battleStats) {
    dataToSave.rankStr = player.battleStats.str;
    dataToSave.rankVit = player.battleStats.vit;
    dataToSave.rankAgi = player.battleStats.agi;
    dataToSave.rankLck = player.battleStats.lck;
  }

  // ★「前回セーブした時」と比べて数値が上がっていたら、その項目の日時を更新する！
  const keysToCheck =["str", "vit", "agi", "lck", "rankStr", "rankVit", "rankAgi", "rankLck", "floor", "maxClearedFloor", "totalLv", "winCount", "collectionCount"];
  const now = serverTimestamp();
  
  if (lastSavedPlayerState) {
    keysToCheck.forEach(k => {
      // 記録が伸びた場合のみタイムスタンプを更新（同値なら先着順を維持するため更新しない）
      if (dataToSave[k] > (lastSavedPlayerState[k] || 0)) {
        dataToSave.timestamps[k] = now;
      }
    });
  } else {
    keysToCheck.forEach(k => dataToSave.timestamps[k] = now);
  }

  delete dataToSave.updateTrainingUI; 
  delete dataToSave.updateStatusUI;
  delete dataToSave.battleStats;

  const userRef = doc(db, "users", player.name);
  await setDoc(userRef, dataToSave, { merge: true });
  
  // 次の比較用にキャッシュを更新
  lastSavedPlayerState = JSON.parse(JSON.stringify(dataToSave));
}

// ==========================================
// ミニゲームの自己ベスト保存・取得
// ==========================================
export async function savePersonalBest(userId, gameId, score) {
  const docRef = doc(db, "minigames", gameId, "scores", userId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    await setDoc(docRef, { userId: userId, time: score, timestamp: serverTimestamp() });
    return true; 
  } else {
    const currentBest = docSnap.data().time; // フィールド名はtimeのまま（過去データ互換のため）
    // ★ guard はスコアなので「大きい方が更新」。他はTAなので「小さい方が更新」
    const isBetter = (gameId === "guard" || gameId === "slot") ? (score > currentBest) : (score < currentBest);
    
    if (isBetter) {
      await setDoc(docRef, { userId: userId, time: score, timestamp: serverTimestamp() });
      return true;
    }
  }
  return false;
}

export async function getPersonalBest(userId, gameId) {
  const docRef = doc(db, "minigames", gameId, "scores", userId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data().time : null;
}

// ==========================================
// ランキングデータの取得（JSでソートする方式に変更）
// ==========================================
export async function getRankingData(rankId, isTotal = false) {
  const rankings =[];
  const statMap = { str: "rankStr", vit: "rankVit", agi: "rankAgi", lck: "rankLck" };

  if (["str", "vit", "agi", "lck", "floor", "totalLv", "winCount", "collectionCount"].includes(rankId)) {
    const dbField = (isTotal && statMap[rankId]) ? statMap[rankId] : rankId;

    // ★身内用なので全件取得してJSでソートする
    const querySnapshot = await getDocs(collection(db, "users"));
    querySnapshot.forEach((doc) => {
      const d = doc.data();
      const score = d[dbField] || d[rankId] || 0;
      // 到達した日時（無ければ初期作成日時、それも無ければ今の時間）
      const ts = (d.timestamps && d.timestamps[dbField]) || d.createdAt || serverTimestamp();
      rankings.push({ name: d.name, score: score, timestamp: ts });
    });

    // ★ソート: スコアが同値なら、タイムスタンプが古い（先着）順にする
    rankings.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score; // 降順
      return a.timestamp - b.timestamp; // 昇順（先着順）
    });

  } 
   else {
    // ミニゲーム系
    const querySnapshot = await getDocs(collection(db, "minigames", rankId, "scores"));
    querySnapshot.forEach((doc) => {
      const d = doc.data();
      rankings.push({ name: d.userId, score: d.time, timestamp: d.timestamp || serverTimestamp() });
    });

    // ★ ミニゲームの種類によってソート方向を変える
    rankings.sort((a, b) => {
      if (a.score !== b.score) {
        // guard は降順（スコアが高い方が上）、その他は昇順（タイムが短い方が上）
        return (rankId === 'guard' || rankId === 'slot') ? b.score - a.score : a.score - b.score;
      }
      return a.timestamp - b.timestamp; // 同値なら先着順
    });
  }
  
  return rankings.slice(0, 10);
}