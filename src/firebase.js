// src/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, serverTimestamp, query, orderBy, limit, onSnapshot, addDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { IS_TOURNAMENT_MODE, TOURNAMENT_END_DATE } from './main.js';

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

function isTournamentEnded() {
  return IS_TOURNAMENT_MODE && getReliableTime() >= TOURNAMENT_END_DATE;
}

// 起動時に呼び出す初期同期関数
export async function syncServerTime() {
  const userRef = doc(db, "global", "timecheck"); // ダミーの場所
  // サーバー時刻を書き込む
  await setDoc(userRef, { lastCheck: serverTimestamp() });
  const snap = await getDoc(userRef);
  const serverTime = snap.data().lastCheck.toMillis();
  serverTimeOffset = serverTime - Date.now();
  console.log("Server time synced. Offset:", serverTimeOffset);
}

export function getReliableTime() {
  return Date.now() + serverTimeOffset;
}

// リリース設定などのグローバル設定を取得
export async function getGlobalConfig() {
  const docRef = doc(db, "global", "config");
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return snap.data();
  }
  return null;
}

// ==========================================
// 1. ログイン処理（初期化バグの完全防止）
// ==========================================
export async function loginOrRegister(username, pin) {
  const collectionName = isRTA ? "users_rta" : "users";
  const otherCollectionName = isRTA ? "users" : "users_rta";

  // 逆のモードで登録されていないかチェック（名前の重複防止）
  const otherSnap = await getDoc(doc(db, otherCollectionName, username));
  if (otherSnap.exists()) {
    return { success: false, message: `この名前は${isRTA ? '通常' : 'RTA'}モードで登録されています` };
  }
  
  const userRef = doc(db, collectionName, username);
  
  let userSnap;
  let isOfflineFallback = false;

  try {
    // 1. サーバーから確実に最新データを取得する
    userSnap = await getDoc(userRef, { source: 'server' });
  } catch (e) {
    console.warn("サーバーからの取得に失敗しました。キャッシュを確認します。", e);
    try {
      // サーバー通信失敗時はキャッシュを見る
      userSnap = await getDoc(userRef, { source: 'cache' });
      isOfflineFallback = true;
    } catch (cacheErr) {
      return { success: false, message: "通信エラーが発生しました。電波の良い場所で再度お試しください。" };
    }
  }

  // 2. データが存在する場合（ログイン）
  if (userSnap && userSnap.exists()) {
    const data = userSnap.data();
    if (data.pin === pin) {
      
      // オンラインの時だけ最終ログイン時刻を更新する（エラーを防ぐため）
      if (!isOfflineFallback) {
        try {
          await setDoc(userRef, { lastLoginTime: serverTimestamp() }, { merge: true });
        } catch(e) {
          console.warn("最終ログイン時刻の更新に失敗(オフラインの可能性)");
        }
      }
      
      if (!data.timestamps) data.timestamps = {};
      lastSavedPlayerState = JSON.parse(JSON.stringify(data));
      return { success: true, data: data };
    } else {
      return { success: false, message: "パスワード(4桁)が違います" };
    }
  } 
  // 3. データが存在しない場合
  else {
    // ★ 最重要修正：オフライン（通信エラー）でデータが見えない時は、絶対に上書きしない！
    if (isOfflineFallback) {
      return { success: false, message: "サーバーに接続できません。新規登録には通信環境が必要です。" };
    }

    // サーバーと通信できた上で「存在しない」と確定した場合のみ、初期データを作成する
    const now = getReliableTime();
    const initialData = {
      name: username, pin: pin, str: 25, vit: 20, agi: 20, lck: 10,
      floor: 1, maxClearedFloor: 1, winCount: 0, collectionCount: 0, gachaCount: 0, firstClearCount: 0, inventory: {},
      exp: { str: 0, vit: 0, agi: 0, lck: 0 }, lv:  { str: 1, vit: 1, agi: 1, lck: 1 }, totalLv: 4,
      createdAt: now, timestamps: {},
      meditation: { target: 'str', lastStatTime: now, lastTicketTime: now },
      lastSaveTime: now,
       isRTA: isRTA, // ★ 追加
      rtaRecords: {} // ★ 追加 { '1': time, '5': time, '10': time }
    };
    
    try {
      await setDoc(userRef, initialData);
      lastSavedPlayerState = JSON.parse(JSON.stringify(initialData));
      return { success: true, data: initialData };
    } catch(e) {
      return { success: false, message: "新規登録に失敗しました。通信環境を確認してください。" };
    }
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
    const now = Date.now();
    const d = new Date(now);
    // HH:MM の形式を作成
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    
    // ${Time} を実際の時間 (14:30 など) に置換。無ければ末尾に付け足す
    let finalText = text;
    finalText += ` <span style="color:#aaa; font-size:10px; margin-left:8px;">(${timeStr})</span>`;
    

    await addDoc(collection(db, "news"), {
      text: finalText,
      priority: priority,
      timestamp: now
    });
  } catch (e) { 
    console.warn("ニュース送信失敗", e); 
  }
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
   if (isTournamentEnded()) return false;
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
// RTAのタイムを保存
// ==========================================
export async function saveRTARecord(player, floor, timeMs) {
  if (!player.isRTA) return;
  if (!player.rtaRecords) player.rtaRecords = {};
  if (player.rtaRecords[floor]) return; // 既に記録済みなら無視

  player.rtaRecords[floor] = timeMs;
  if (floor === 10) {
    player.rtaClearTime = timeMs; // 10層クリアで最終タイム確定
  }

  const userRef = doc(db, "users_rta", player.name);
  await setDoc(userRef, { rtaRecords: player.rtaRecords, rtaClearTime: player.rtaClearTime || null }, { merge: true });
}

// ==========================================
// 2. プレイヤーセーブ（ロールバックの完全防止）
// ==========================================
export async function savePlayerData(player) {
    if (isTournamentEnded()) return; 
   const collectionName = player.isRTA ? "users_rta" : "users";
  const userRef = doc(db, collectionName, player.name);
  const now = getReliableTime(); // 今回セーブする時間

  // ★ 修正：ロールバックチェックを厳格化
  try {
    const currentSnap = await getDoc(userRef, { source: 'server' });
    if (currentSnap.exists()) {
      const serverData = currentSnap.data();
      // サーバー上の最終セーブ時間が、自分の持っている「前回セーブ時間」よりも【新しければ】弾く
      if (serverData.lastSaveTime && player.lastSaveTime) {
        if (serverData.lastSaveTime > player.lastSaveTime) {
          console.error("Rollback prevented! Server:", serverData.lastSaveTime, "Local:", player.lastSaveTime);
          alert("⚠️ 別の端末（またはタブ）でデータが進行しているため、セーブを中止しました。\nページをリロードして最新データを読み込んでください。");
          return false; // セーブ中止
        }
      }
    }
  } catch (e) {
    console.warn("オフラインのためバージョンチェックをスキップ");
  }

  // 保存用データ整形
  player.totalLv = player.lv.str + player.lv.vit + player.lv.agi + player.lv.lck;
  player.winCount = player.winCount || 0;
  player.gachaCount = player.gachaCount || 0;
  player.genesisCount = player.genesisCount || 0; // ★追加
  player.secretCount = player.secretCount || 0;   // ★追加

   // ★ 修正：実際の装備インベントリから GEN と SEC の所持数を再計算
  let actualGenesisCount = 0;
  let actualSecretCount = 0;
  
  if (player.inventory_equip) {
    ["str", "vit", "agi", "lck"].forEach(type => {
      const category = player.inventory_equip[type] || {};
      actualGenesisCount += (category["GEN"] || 0);
      actualSecretCount += (category["SEC"] || 0);
    });
  }
  
  player.genesisCount = actualGenesisCount; // ランキング用フィールドを更新
  player.secretCount = actualSecretCount;   // ランキング用フィールドを更新
  
  player.firstClearCount = player.firstClearCount || 0;
  player.collectionCount = Object.entries(player.inventory || {}).reduce((sum, [name, count]) => {
    if (name === "装備ガチャチケット") return sum;
    return sum + Math.min(count, 81);
  }, 0);
  
  if (!player.timestamps) player.timestamps = {};
  
  const dataToSave = { ...player };
  if (player.battleStats) {
    dataToSave.rankStr = player.battleStats.str;
    dataToSave.rankVit = player.battleStats.vit;
    dataToSave.rankAgi = player.battleStats.agi;
    dataToSave.rankLck = player.battleStats.lck;
  }

  const keysToCheck =["str", "vit", "agi", "lck", "rankStr", "rankVit", "rankAgi", "rankLck", "floor", "maxClearedFloor", "totalLv", "winCount", "collectionCount", "gachaCount", "firstClearCount","genesisCount", "secretCount"];
  
  if (lastSavedPlayerState) {
    keysToCheck.forEach(k => {
      if (dataToSave[k] > (lastSavedPlayerState[k] || 0)) {
        dataToSave.timestamps[k] = now;
      }
    });
  } else {
    keysToCheck.forEach(k => dataToSave.timestamps[k] = now);
  }

  // ★セーブ時間を更新
   dataToSave.lastSaveTime = now;
  player.lastSaveTime = now; // 必須！

  delete dataToSave.updateTrainingUI; 
  delete dataToSave.updateStatusUI;
  delete dataToSave.battleStats;

  await setDoc(userRef, dataToSave, { merge: true });
  lastSavedPlayerState = JSON.parse(JSON.stringify(dataToSave));
  return true;
}
// ==========================================
// ミニゲームの自己ベスト保存・取得
// ==========================================
// --- 自己ベスト保存時 (1位更新ニュースを追加) ---
export async function savePersonalBest(userId, gameId, score) {
  if (isTournamentEnded()) return false;
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

  if (["str", "vit", "agi", "lck", "floor", "totalLv", "winCount", "collectionCount", "gachaCount", "firstClearCount","genesisCount", "secretCount"].includes(rankId)) {
    let dbField = (isTotal && statMap[rankId]) ? statMap[rankId] : rankId;
      if (rankId === 'floor') dbField = 'maxClearedFloor';
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
  // ★追加：初ジェネシス
  else if (rankId === 'firstGenesis') {
    const docRef = doc(db, "global", "firstGenesis");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const d = snap.data();
      rankings.push({ name: d.name, score: d.probability || "100万分の1" });
    }
  } 
  // ★追加：バグ報告ランキング
  else if (rankId === 'bugReports') {
    const querySnapshot = await getDocs(collection(db, "users"));
    querySnapshot.forEach((doc) => {
      const d = doc.data();
      if (d.bugReports && d.bugReports > 0 && d.name && d.name !== "undefined") {
        rankings.push({ name: d.name, score: d.bugReports });
      }
    });
    rankings.sort((a, b) => b.score - a.score);
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
   // ★ RTAランキングの取得ロジック
  if (rankId === 'rta10') {
    // 10層をクリアした人（rtaClearTimeがある人）だけを取得し、タイムの短い順(asc)に並べる
    const querySnapshot = await getDocs(query(collection(db, "users_rta"), orderBy("rtaClearTime", "asc"), limit(50)));
    querySnapshot.forEach((doc) => {
      const d = doc.data();
      if (d.rtaClearTime && d.name && d.name !== "undefined") {
        rankings.push({ 
          name: d.name, 
          score: d.rtaClearTime, // ミリ秒
          rtaRecords: d.rtaRecords // 1層、5層の記録
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
  3: { name: "瞑想の極意", desc: "瞑想の報酬発生間隔が 25%短縮" },
  4: { name: "深淵の記憶", desc: "「魔の激動」のドロップ率が 1.5倍に" },
  5: { name: "戦神の超加護", desc: "バトル勝利時のガチャチケット獲得枚数 +2枚" },
  6: { name: "時間加速", desc: "通常戦闘のゲーム速度が1.25倍に" },
  7: { name: "神速の抽選", desc: "AUTOガチャの間隔が 0.1秒 → 0.066秒に" },
  8: { name: "真深淵の記憶", desc: "「魔の激動」のドロップ率が 2.0倍に" },
  9: { name: "魂の超休息", desc: "瞑想の蓄積上限時間が 18時間 → 24時間 に延長" },
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
export async function claimRaidReward(playerName, tickets, isFromLastRaid) {
  const raidRef = doc(db, "global", "raidState");
  try {
    const snap = await getDoc(raidRef);
    if (!snap.exists()) return false;
    
    const data = snap.data();

    if (isFromLastRaid) {
      if (data.lastRaidData && data.lastRaidData.participants && data.lastRaidData.participants[playerName]) {
        // ★ サーバー側で「すでに受け取り済みか」をチェック（二重受け取り防止）
        if (data.lastRaidData.participants[playerName].claimed) return false; 
        
        data.lastRaidData.participants[playerName].claimed = true;
        await setDoc(raidRef, { lastRaidData: data.lastRaidData }, { merge: true });
        return true;
      }
    } else {
      if (data.participants && data.participants[playerName]) {
        // ★ サーバー側で「すでに受け取り済みか」をチェック
        if (data.participants[playerName].claimed) return false; 
        
        data.participants[playerName].claimed = true;
        await setDoc(raidRef, { participants: data.participants }, { merge: true });
        return true;
      }
    }
  } catch (err) {
    console.error("報酬受け取りエラー:", err);
  }
  return false;
}

export async function initializeRaidWithTransaction(newRaidId, nextLv, baseHp) {
  const raidRef = doc(db, "global", "raidState");
  try {
    await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(raidRef);
      // まだデータがない、または前回のレイドのままの場合のみ初期化を実行する
      if (!sfDoc.exists() || sfDoc.data().raidId !== newRaidId) {
        
        let prevData = null;
        if (sfDoc.exists() && sfDoc.data().participants) {
          prevData = {
            level: sfDoc.data().level,
            maxHp: sfDoc.data().maxHp,
            currentHp: sfDoc.data().currentHp,
            isDefeated: sfDoc.data().isDefeated,
            participants: sfDoc.data().participants
          };
        }

        const newData = {
          raidId: newRaidId,
          level: nextLv, 
          maxHp: baseHp, 
          currentHp: baseHp,
          isActive: true, 
          isOpen: false, 
          isDefeated: false,
          waitingPlayers:[], // 途切れていた箇所
          participants: {},
          lastRaidData: prevData
        };
        transaction.set(raidRef, newData, { merge: true });
      }
    });
    return true;
  } catch (e) {
    console.error("レイドの初期化トランザクションに失敗: ", e);
    return false;
  }
}


// ==========================================
// ✨ ファースト・ジェネシス賞の管理
// ==========================================
export async function getFirstGenesisRecord() {
  const docRef = doc(db, "global", "firstGenesis");
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() : null;
}

export async function checkAndSaveFirstGenesis(playerName, probStr) {
  const docRef = doc(db, "global", "firstGenesis");
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    await setDoc(docRef, {
      name: playerName,
      probability: probStr,
      timestamp: serverTimestamp() // または Date.now()
    });
    return true; // あなたが世界で初めて引きました
  }
  return false; // すでに誰かが引いています
}

// ==========================================
// 🏆 大会賞金計算用：全ユーザーデータの一括取得
// ==========================================
export async function getAllUsersForPrize() {
  const users =[];
  const querySnapshot = await getDocs(collection(db, "users"));
  querySnapshot.forEach((doc) => {
    const d = doc.data();
    if (d.name && d.name !== "undefined") {
      users.push(d);
    }
  });
  return users;
}
