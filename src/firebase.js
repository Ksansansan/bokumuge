// src/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, serverTimestamp, query, orderBy, limit, onSnapshot, addDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCuXSWPC0PFNeRQbPPrA-eUBLx5yTiNvv8",
  authDomain: "bokumuge.firebaseapp.com",
  projectId: "bokumuge",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ★追加：データ変化を追跡するためのキャッシュ
let lastSavedPlayerState = null;
// ★追加：サーバーとクライアントの時間のズレを保持する変数
let serverTimeOffset = 0;

export function getReliableTime() {
  return Date.now() + serverTimeOffset;
}
// ==========================================
// 簡易ログイン ＆ 新規登録
// ==========================================
export async function loginOrRegister(username, pin) {
  const userRef = doc(db, "users", username);
  
  // 1. まず現在のデータが存在するか（pinが設定されているか）確認
  let userSnap = await getDoc(userRef);

  if (userSnap.exists() && userSnap.data().pin) {
    // --- 既存ユーザー（ログイン） ---
    const data = userSnap.data();
    if (data.pin === pin) {
      // パスワードが合っていればログイン時間を更新
      await setDoc(userRef, { lastLoginTime: serverTimestamp() }, { merge: true });
      
      // サーバー時間を取得してオフセット計算
      userSnap = await getDoc(userRef);
      const updatedData = userSnap.data();
      const serverTime = updatedData.lastLoginTime.toMillis();
      serverTimeOffset = serverTime - Date.now();
      
      if (!updatedData.timestamps) updatedData.timestamps = {}; 
      if (!updatedData.meditation) {
        updatedData.meditation = { target: 'str', lastStatTime: serverTime, lastTicketTime: serverTime };
      } 
      
      lastSavedPlayerState = JSON.parse(JSON.stringify(updatedData));
      return { success: true, data: updatedData };
    } else {
      return { success: false, message: "パスワード(4桁)が違います" };
    }
  } else {
    // --- 新規登録 ---
    const initialData = {
      name: username, pin: pin, str: 25, vit: 20, agi: 20, lck: 10,
      floor: 1, maxClearedFloor: 1, winCount: 0, collectionCount: 0, gachaCount: 0, firstClearCount: 0, inventory: {},
      exp: { str: 0, vit: 0, agi: 0, lck: 0 }, lv:  { str: 1, vit: 1, agi: 1, lck: 1 }, totalLv: 4,
      createdAt: serverTimestamp(),
      lastLoginTime: serverTimestamp(),
      timestamps: {}, 
    };
    
    // 一度保存してサーバー時間を確定させる
    await setDoc(userRef, initialData);
    
    // サーバー時間を取得してオフセットと瞑想初期値を設定
    userSnap = await getDoc(userRef);
    const savedData = userSnap.data();
    const serverTime = savedData.lastLoginTime.toMillis();
    serverTimeOffset = serverTime - Date.now();
    
    savedData.meditation = { target: 'str', lastStatTime: serverTime, lastTicketTime: serverTime };
    await setDoc(userRef, { meditation: savedData.meditation }, { merge: true });
    
    lastSavedPlayerState = JSON.parse(JSON.stringify(savedData));
    return { success: true, data: savedData };
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

// ==========================================
// 📰 ニュース (テロップ) 機能
// ==========================================
export async function addGlobalNews(text, priority) {
  try {
    await addDoc(collection(db, "news"), {
      text: text,
      priority: priority,
      timestamp: Date.now()
    });
  } catch (e) { console.warn("ニュース送信失敗", e); }
}

export function subscribeNews(callback) {
  const q = query(collection(db, "news"), orderBy("timestamp", "desc"), limit(20));
  return onSnapshot(q, (snapshot) => {
    const newsList =[];
    const now = Date.now();
    snapshot.forEach(doc => {
      const data = doc.data();
      // 直近10分以内 (600,000ミリ秒) のニュースのみ取得
      if (now - data.timestamp <= 600000) {
        newsList.push({ id: doc.id, ...data });
      }
    });
    // 優先度(数字が小さい=高い)順 → 同値なら新しい順でソート
    newsList.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.timestamp - a.timestamp;
    });
    callback(newsList);
  });
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
    // ★初クリア数をインクリメント
    player.firstClearCount = (player.firstClearCount || 0) + 1;
    // ★ ニュース送信 (優先度1)
    addGlobalNews(`👑 【初クリア】<span class="clickable-name" data-name="${player.name}" style="color:#5ce6e6; font-weight:bold;">${player.name}</span> が 第${floor}層 を世界で初めて突破しました！！`, 1);
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
  player.gachaCount = player.gachaCount || 0;
  if (!player.timestamps) player.timestamps = {};
  
  const dataToSave = { ...player };
  
  if (player.battleStats) {
    dataToSave.rankStr = player.battleStats.str;
    dataToSave.rankVit = player.battleStats.vit;
    dataToSave.rankAgi = player.battleStats.agi;
    dataToSave.rankLck = player.battleStats.lck;
  }

  // ★「前回セーブした時」と比べて数値が上がっていたら、その項目の日時を更新する！
  const keysToCheck =["str", "vit", "agi", "lck", "rankStr", "rankVit", "rankAgi", "rankLck", "floor", "maxClearedFloor", "totalLv", "winCount", "collectionCount", "gachaCount", "firstClearCount"];
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
// --- 自己ベスト保存時 (1位更新ニュースを追加) ---
export async function savePersonalBest(userId, gameId, score) {
  const docRef = doc(db, "minigames", gameId, "scores", userId);
  const docSnap = await getDoc(docRef);
  let isNew = false;
  
  if (!docSnap.exists()) {
    await setDoc(docRef, { userId: userId, time: score, timestamp: Date.now() });
    isNew = true; 
  } else {
    const currentBest = docSnap.data().time;
    const isBetter = (gameId === "guard" || gameId === "slot") ? (score > currentBest) : (score < currentBest);
    if (isBetter) {
      await setDoc(docRef, { userId: userId, time: score, timestamp: Date.now() });
      isNew = true;
    }
  }

  // ★ 1位を更新したかチェックしてニュース送信 (優先度2)
  if (isNew) {
    const ranks = await getRankingData(gameId);
    if (ranks.length > 0 && ranks[0].name === userId) {
      const gNames = { rockPush: "大岩プッシュ", daruma: "だるま落とし", chicken: "崖っぷちダッシュ", guard: "飛来物ガード", '1to20': "1〜20 早押し", command: "コマンド早入力", clover: "四つ葉探し", slot: "狙え！スロット" };
      let sStr = (gameId === 'guard' || gameId === 'slot') ? `${score} pt` : (gameId === 'chicken' ? `${score.toFixed(2)} m` : `${score.toFixed(2)} 秒`);
       addGlobalNews(`🏆 【記録更新】<span class="clickable-name" data-name="${userId}" style="color:#5ce6e6; font-weight:bold;">${userId}</span> が ${gNames[gameId]} で1位（${sStr}）に躍り出ました！`, 2);
    }
  }
  return isNew;
}

export async function getPersonalBest(userId, gameId) {
  const docRef = doc(db, "minigames", gameId, "scores", userId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data().time : null;
}

// ★ 追加：特定ユーザーの全データを取得
export async function getUserProfile(username) {
  const userSnap = await getDoc(doc(db, "users", username));
  return userSnap.exists() ? userSnap.data() : null;
}


// ==========================================
// ランキングデータの取得（JSでソートする方式に変更）
// ==========================================
export async function getRankingData(rankId, isTotal = false) {
  const rankings =[];
  const statMap = { str: "rankStr", vit: "rankVit", agi: "rankAgi", lck: "rankLck" };

  if (["str", "vit", "agi", "lck", "floor", "totalLv", "winCount", "collectionCount", "gachaCount", "firstClearCount"].includes(rankId)) {
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


// ==========================================
// 🐉 レイドボス同期機能
// ==========================================
// ==========================================
// 🌟 グローバルバフ定義と取得
// ==========================================
export const GLOBAL_BUFFS = {
  1: { name: "魂の休息", desc: "瞑想の蓄積上限時間が 12時間 → 18時間 に延長" },
  2: { name: "戦神の加護", desc: "バトル勝利時のガチャチケット獲得枚数 +1枚" },
  3: { name: "瞑想の極意", desc: "瞑想の報酬発生間隔が 10%短縮" },
  4: { name: "魂の超休息", desc: "瞑想の蓄積上限時間が 18時間 → 24時間 に延長" },
  5: { name: "深淵の記憶", desc: "「魔の激動」のドロップ率が 1.5倍に" },
  6: { name: "戦神の超加護", desc: "バトル勝利時のガチャチケット獲得枚数 +2枚" },
  7: { name: "瞑想の真極意", desc: "瞑想の報酬発生間隔が 25%短縮" },
  8: { name: "神速の抽選", desc: "AUTOガチャの間隔が 0.1秒 → 0.066秒に" },
  9: { name: "真深淵の記憶", desc: "「魔の激動」のドロップ率が 2.0倍に" }
};

let currentGlobalBuffLevel = 0; // キャッシュ用

// 現在解放されているバフレベルを取得する関数
export async function getGlobalBuffLevel() {
  const docRef = doc(db, "global", "raidState");
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    currentGlobalBuffLevel = snap.data().defeatedCount || 0;
  }
  return currentGlobalBuffLevel;
}

// リアルタイム同期用の変数も更新しておく
export function subscribeRaidData(callback) {
  const raidRef = doc(db, "global", "raidState");
  return onSnapshot(raidRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      currentGlobalBuffLevel = data.defeatedCount || 0;
      callback(data);
    } else {
      callback(null);
    }
  });
}

// 他のファイルから即座にバフレベルを読めるようにエクスポート
export function getCachedBuffLevel() {
  return currentGlobalBuffLevel;
}

export async function updateRaidState(updates) {
  const raidRef = doc(db, "global", "raidState");
  await setDoc(raidRef, updates, { merge: true });
}

// ゲート待機列に参加/離脱する
export async function toggleRaidWaiting(playerName, isWaiting) {
  const raidRef = doc(db, "global", "raidState");
  const snap = await getDoc(raidRef);
  if (!snap.exists()) return;

  let waiters = snap.data().waitingPlayers ||[];
  if (isWaiting && !waiters.includes(playerName)) {
    waiters.push(playerName);
  } else if (!isWaiting) {
    waiters = waiters.filter(n => n !== playerName);
  }
  
  const updates = { waitingPlayers: waiters };
  // 2人揃ったらゲート解放！
  if (waiters.length >= 2 && !snap.data().isOpen) {
    updates.isOpen = true;
    addGlobalNews(`🚨 【警報】ゲートが解放され、レイドボスが姿を現しました！！`, 1);
  }
  await updateRaidState(updates);
}

// ==========================================
// ⚔️ レイドのトランザクション処理（ロールバック対策）
// ==========================================
export async function submitRaidDamage(playerName, newDamage, maxTries = 5) {
  const raidRef = doc(db, "global", "raidState");

  try {
    const isDefeatedNow = await runTransaction(db, async (transaction) => {
      const raidDoc = await transaction.get(raidRef);
      if (!raidDoc.exists()) throw "レイドデータが存在しません！";
      
      const data = raidDoc.data();
      
      // 既に討伐済みならダメージは加算しないが、挑戦回数は消費する
      if (data.isDefeated) {
        let pData = data.participants?.[playerName] || { damage: 0, tries: 0 };
        pData.tries += 1;
        transaction.update(raidRef, {[`participants.${playerName}`]: pData });
        return false;
      }

      // 新しいHPと参加者データの計算
      let newHp = Math.max(0, data.currentHp - newDamage);
      let pData = data.participants?.[playerName] || { damage: 0, tries: 0 };
      pData.damage += newDamage;
      pData.tries += 1;
      
      const updates = {
        currentHp: newHp,
        [`participants.${playerName}`]: pData
      };

      // 今回の攻撃でHPが0になった（＝トドメを刺した）場合の処理
      let justDefeated = false;
      if (newHp <= 0) {
        updates.isDefeated = true;
        // 討伐数を増やし、次回レベルを上げる
        updates.defeatedCount = (data.defeatedCount || 0) + 1;
        updates.level = data.level + 1;
        justDefeated = true;
      }

      transaction.update(raidRef, updates);
      return justDefeated;
    });

    // トランザクション成功後、トドメを刺した張本人ならニュースを流す
    if (isDefeatedNow) {
      const currentCount = (currentGlobalBuffLevel || 0) + 1; // 討伐後のレベル
      const buffName = GLOBAL_BUFFS[currentCount] ? `【${GLOBAL_BUFFS[currentCount].name}】が解放されました！` : "報酬を獲得しました！";
      addGlobalNews(`🎉 【討伐成功】<span class="clickable-name" data-name="${player.name}" style="color:#5ce6e6; font-weight:bold;">${player.name}</span>がトドメを刺し、レイドボスを撃破！ ${buffName}`, 1);
    }
    return true;
  } catch (e) {
    console.error("レイドダメージ送信エラー:", e);
    return false;
  }
}

// ★追加：レイド報酬の受け取り処理
export async function claimRaidReward(playerName, ticketAmount, isFromLastRaid = false) {
  const raidRef = doc(db, "global", "raidState");
  const userRef = doc(db, "users", playerName);
  
  try {
    await runTransaction(db, async (t) => {
       const raidDoc = await t.get(raidRef);
       const userDoc = await t.get(userRef);
       
       if(raidDoc.exists()) {
          const data = raidDoc.data();
          
          if (isFromLastRaid) {
            // ★ 前回のレイド (lastRaidData) の報酬を受け取る場合
            if(data.lastRaidData && data.lastRaidData.participants && data.lastRaidData.participants[playerName]) {
               let newParticipants = { ...data.lastRaidData.participants };
               newParticipants[playerName] = { ...newParticipants[playerName], claimed: true };
               // lastRaidData の中身だけを更新
               let newLastRaidData = { ...data.lastRaidData, participants: newParticipants };
               t.update(raidRef, { lastRaidData: newLastRaidData });
            }
          } else {
            // ★ 現在のレイドの報酬を受け取る場合
            if(data.participants && data.participants[playerName]) {
               let newParticipants = { ...data.participants };
               newParticipants[playerName] = { ...newParticipants[playerName], claimed: true };
               t.update(raidRef, { participants: newParticipants });
            }
          }
       }
       
       
       if(userDoc.exists()) {
          const uData = userDoc.data();
          let newInventory = { ...(uData.inventory || {}) };
          newInventory["装備ガチャチケット"] = (newInventory["装備ガチャチケット"] || 0) + ticketAmount;
          t.update(userRef, { inventory: newInventory });
       }
    });
    return true;
  } catch(e) {
    console.error("報酬受け取りエラー:", e);
    return false;
  }
}