// src/firebase.js
import { initializeApp } from "firebase/app";

// ⚠️ ここに自分のFirebaseプロジェクトの設定をコピペしてください
const firebaseConfig = {
  apiKey: "AIzaSyCuXSWPC0PFNeRQbPPrA-eUBLx5yTiNvv8",
  authDomain: "bokumuge.firebaseapp.com",
  projectId: "bokumuge",
};
let db = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase未設定: ランキング機能はローカルの仮データで動作します。");
}

// 自己ベストを保存する関数
export async function savePersonalBest(userId, gameId, time) {
  if (!db) {
    // ローカルストレージで代用（テスト用）
    const currentBest = localStorage.getItem(`${userId}_${gameId}_best`);
    if (!currentBest || time < parseFloat(currentBest)) {
      localStorage.setItem(`${userId}_${gameId}_best`, time);
      return true; // 更新した
    }
    return false; // 更新しなかった
  }

  // 実際のFirestore処理
  const docRef = doc(db, "rankings", `${gameId}_${userId}`);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists() || time < docSnap.data().time) {
    await setDoc(docRef, { userId: userId, time: time, timestamp: Date.now() });
    return true;
  }
  return false;
}

// 自己ベストを取得する関数
export async function getPersonalBest(userId, gameId) {
  if (!db) return parseFloat(localStorage.getItem(`${userId}_${gameId}_best`)) || null;
  
  const docRef = doc(db, "rankings", `${gameId}_${userId}`);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data().time : null;
}
