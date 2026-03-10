// src/firebase.js

// ⚠️ URLをCDNのフルパスに修正しています
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCuXSWPC0PFNeRQbPPrA-eUBLx5yTiNvv8",
  authDomain: "bokumuge.firebaseapp.com",
  projectId: "bokumuge",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// 簡易ログイン ＆ 新規登録
// ==========================================
export async function loginOrRegister(username, pin) {
  const userRef = doc(db, "users", username);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    // 既にユーザーがいる場合（ログイン）
    const data = userSnap.data();
    if (data.pin === pin) {
      return { success: true, data: data };
    } else {
      return { success: false, message: "パスワード(4桁)が違います" };
    }
  } else {
    // いない場合（新規登録して初期ステータスを付与）
    const initialData = {
      name: username,
      pin: pin,
      str: 25, vit: 20, agi: 20, lck: 10,
      floor: 1,maxClearedFloor: 1, inventory: {},
      exp: { str: 0, vit: 0, agi: 0, lck: 0 },
      lv:  { str: 1, vit: 1, agi: 1, lck: 1 },
      totalLv: 4
    };
    await setDoc(userRef, initialData);
    return { success: true, data: initialData };
  }
}

// ==========================================
// プレイヤーデータの自動セーブ
// ==========================================
export async function savePlayerData(player) {
  // 総レベルを計算して保存（ランキング用）
  player.totalLv = player.lv.str + player.lv.vit + player.lv.agi + player.lv.lck;
  const userRef = doc(db, "users", player.name);
  await setDoc(userRef, player, { merge: true }); // マージで上書き保存
}

// ==========================================
// ミニゲーム(大岩プッシュ等)の自己ベスト保存・取得
// ==========================================
export async function savePersonalBest(userId, gameId, time) {
  const docRef = doc(db, "minigames", gameId, "scores", userId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists() || time < docSnap.data().time) {
    await setDoc(docRef, { userId: userId, time: time, timestamp: Date.now() });
    return true; // 新記録
  }
  return false;
}

export async function getPersonalBest(userId, gameId) {
  const docRef = doc(db, "minigames", gameId, "scores", userId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data().time : null;
}

// ==========================================
// あらゆるランキングデータを取得する汎用関数
// ==========================================
export async function getRankingData(rankId) {
  const rankings =[];
  let q;

  // ステータス・階層・レベル系のランキング
  if (["str", "vit", "agi", "lck", "floor", "totalLv"].includes(rankId)) {
    // usersコレクションから、指定された値が高い順(desc)に10人取得
    q = query(collection(db, "users"), orderBy(rankId, "desc"), limit(10));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      rankings.push({ name: doc.data().name, score: doc.data()[rankId] });
    });
  } 
  // ミニゲーム(タイムアタック)系のランキング
  else {
    // minigames/{gameId}/scores コレクションから、タイムが短い順(asc)に10人取得
    q = query(collection(db, "minigames", rankId, "scores"), orderBy("time", "asc"), limit(10));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      rankings.push({ name: doc.data().userId, score: doc.data().time.toFixed(2) + " 秒" });
    });
  }
  return rankings;
}

export async function getFastestRecord(floor) {
  const docRef = doc(db, "records", `floor_${floor}`);
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() : null;
}

// 勝利時に記録を保存する処理（simulateBattle の後で呼ぶ）
export async function saveClearRecord(player, floor, time) {
  const data = {
    name: player.name, time: time, 
    str: player.str, vit: player.vit, agi: player.agi, lck: player.lck
  };
  await setDoc(doc(db, "records", `floor_${floor}`), data);
}

// その階層の初クリアデータを取得
export async function getFirstClearRecord(floor) {
  const docRef = doc(db, "firstClears", `floor_${floor}`);
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() : null;
}

// 初クリア者がいなければ自分を登録する
export async function checkAndSaveFirstClear(player, floor, time) {
  const docRef = doc(db, "firstClears", `floor_${floor}`);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    const data = {
      name: player.name,
      time: time,
      str: player.str,
      vit: player.vit,
      agi: player.agi,
      lck: player.lck, // ← ログイン中の player オブジェクトから取得
      timestamp: Date.now()
    };
    await setDoc(docRef, data);
    return true;
  }
  return false;
}
