// src/profile.js

import { getUserProfile, getRankingData } from './firebase.js';
import { formatNumber, IS_TOURNAMENT_MODE } from './main.js';
import { EQUIP_NAMES, RARITY_DATA, calcEquipLevel, getEquipStats } from './gacha/equipment.js';
import { playSound } from './audio.js';
import { generateFloorData, getDropStatType } from './battle/enemyGen.js';
import { getPrizeForRank } from './tournament.js'; // ★インポート

const RARITY_INDEX = { "C":0, "UC":1, "R":2, "HR":3, "SR":4, "SSR":5, "ER":6, "UR":7, "LR":8, "MR":9, "GR":10, "XR":11, "GEN":12, "SEC":13 };

function getCollectionRank(count) {
  if (count >= 81) return { rank: 5, name: "マスター", color: "#ff6b6b", mult: 8 }; 
  if (count >= 27) return { rank: 4, name: "金", color: "#ffd700", mult: 5 }; 
  if (count >= 9)  return { rank: 3, name: "銀", color: "#c0c0c0", mult: 3 };
  if (count >= 3)  return { rank: 2, name: "銅", color: "#cd7f32", mult: 2 };
  if (count >= 1)  return { rank: 1, name: "木", color: "#8c7a65", mult: 1 };
  return { rank: 0, name: "未取得", color: "#555", mult: 0 };
}

export async function openProfileModal(username) {
  playSound('click');
  const modal = document.getElementById('modal-profile');
  const modalInner = modal.querySelector('div'); 
  modal.style.display = 'flex';
  
  document.getElementById('prof-name').textContent = username;
  document.getElementById('prof-equips').innerHTML = '<span style="color:#aaa;">取得中...</span>';
  document.getElementById('prof-ranks').innerHTML = '<span style="color:#aaa;">データ取得中...</span>';

  const u = await getUserProfile(username);
  if (!u) {
    document.getElementById('prof-ranks').innerHTML = '<p style="color:#ff6b6b;">データが見つかりません。</p>';
    document.getElementById('prof-equips').innerHTML = '';
    return;
  }

  // --- 1. すべてのバフ・装備を計算して「本当の最強ステータス」を特定する ---
  let totalBonuses = { STR: 0, VIT: 0, AGI: 0, LCK: 0, ALL: 0 };
  const maxFloor = u.maxClearedFloor || 1;
  for (let f = 1; f <= maxFloor; f += 5) {
    const floorData = generateFloorData(f);
    const g = Math.ceil(f / 20);
    const statType = getDropStatType(f, false);
    totalBonuses[statType] += g * getCollectionRank(u.inventory?.[floorData.biome.mobDrop] || 0).mult;
    totalBonuses['ALL'] += g * getCollectionRank(u.inventory?.[floorData.biome.bossDrop] || 0).mult;
  }

  const finalValues = {};['str', 'vit', 'agi', 'lck'].forEach(s => {
    let val = (u[s] || 0) * (1 + (totalBonuses[s.toUpperCase()] + totalBonuses.ALL) / 100);
    const eqId = u.equips?.[s];
    if (eqId) {
      const rarityIdx = RARITY_INDEX[eqId];
      const stats = getEquipStats(rarityIdx, calcEquipLevel(u.inventory_equip?.[s]?.[eqId] || 1).level);
      val = (val * stats.mult) + stats.add;
    }
    finalValues[s] = val;
  });

  const statColors = { str: "#ff6b6b", vit: "#6be6ff", agi: "#94ff6b", lck: "#ffd166" };
  let mainStat = 'str';
  if (finalValues.vit > finalValues[mainStat]) mainStat = 'vit';
  if (finalValues.agi > finalValues[mainStat]) mainStat = 'agi';
  if (finalValues.lck > finalValues[mainStat]) mainStat = 'lck';

  const themeColor = statColors[mainStat];
  modalInner.style.borderColor = themeColor;
  modalInner.style.boxShadow = `0 0 20px ${themeColor}80`; 
  const nameEl = document.getElementById('prof-name');
  nameEl.style.color = themeColor;
  nameEl.style.borderColor = themeColor;

  // --- 2. 基礎ステータスと図鑑バフの表示 ---
  document.getElementById('prof-str').textContent = formatNumber(u.str || 0);
  document.getElementById('prof-vit').textContent = formatNumber(u.vit || 0);
  document.getElementById('prof-agi').textContent = formatNumber(u.agi || 0);
  document.getElementById('prof-lck').textContent = formatNumber(u.lck || 0);

  document.getElementById('prof-buff-str').textContent = `+${totalBonuses.STR + totalBonuses.ALL}%`;
  document.getElementById('prof-buff-vit').textContent = `+${totalBonuses.VIT + totalBonuses.ALL}%`;
  document.getElementById('prof-buff-agi').textContent = `+${totalBonuses.AGI + totalBonuses.ALL}%`;
  document.getElementById('prof-buff-lck').textContent = `+${totalBonuses.LCK + totalBonuses.ALL}%`;

  // --- 3. 装備の詳細表示 ---
  let eqHtml = '';
  const types =[{k:'str', c:'#ff6b6b', n:'武器'}, {k:'vit', c:'#6be6ff', n:'防具'}, {k:'agi', c:'#94ff6b', n:' 靴 '}, {k:'lck', c:'#ffd166', n:'飾品'}];
  
  types.forEach(t => {
    const eqId = u.equips ? u.equips[t.k] : null;
    if (eqId && RARITY_INDEX[eqId] !== undefined) {
      const rarityIdx = RARITY_INDEX[eqId];
      const eqName = EQUIP_NAMES[t.k][rarityIdx];
      const count = u.inventory_equip?.[t.k]?.[eqId] || 1;
      const lvInfo = calcEquipLevel(count);
      const stats = getEquipStats(rarityIdx, lvInfo.level);

      eqHtml += `
        <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed #333;">
          <div style="display:flex; align-items:center; margin-bottom:2px;">
            <span style="color:${t.c}; font-weight:bold; display:inline-block; width:35px; text-align:center; border:1px solid ${t.c}; border-radius:3px; margin-right:5px; font-size:10px;">${t.n}</span> 
            <span class="r-${eqId}" style="font-weight:bold;">[${eqId}] ${eqName}</span>
          </div>
          <div style="font-size:11px; color:#fff; padding-left:45px;">
            効果: <span style="color:${t.c}; font-weight:bold;">${t.k.toUpperCase()}</span> <span style="color:#5ce6e6;">x${stats.mult.toFixed(1)}</span> + ${formatNumber(stats.add)}
          </div>
          <div style="font-size:10px; color:#aaa; padding-left:45px; margin-top:2px;">
            Lv ${lvInfo.level} <span style="font-size:9px;">(${lvInfo.current}/${lvInfo.nextReq})</span>
          </div>
        </div>
      `;
    } else {
      eqHtml += `<div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed #333;"><span style="color:${t.c}; font-weight:bold; display:inline-block; width:35px; text-align:center; border:1px solid ${t.c}; border-radius:3px; margin-right:5px; font-size:10px;">${t.n}</span> <span style="color:#555;">装備なし</span></div>`;
    }
  });
  document.getElementById('prof-equips').innerHTML = eqHtml;

  // --- 4. ランキングと賞金の計算・表示 ---
  const rankTargets =[
    { id: 'tournament', name: '大会獲得賞金', isTotal: false },
    { id: 'floor', name: '最高到達層', isTotal: false },
    { id: 'firstClearCount', name: '初クリア数', isTotal: false },
     // 基礎値（賞金対象）
    { id: 'str', name: 'STR (基礎値)', isTotal: false },
    { id: 'vit', name: 'VIT (基礎値)', isTotal: false },
    { id: 'agi', name: 'AGI (基礎値)', isTotal: false },
    { id: 'lck', name: 'LCK (基礎値)', isTotal: false },
    
    // 総合値（賞金対象外）
    { id: 'str', name: 'STR (総合値)', isTotal: true },
    { id: 'vit', name: 'VIT (総合値)', isTotal: true },
    { id: 'agi', name: 'AGI (総合値)', isTotal: true },
    { id: 'lck', name: 'LCK (総合値)', isTotal: true },
    { id: 'totalLv', name: '総特訓レベル', isTotal: false },
    { id: 'winCount', name: '累計勝利数', isTotal: false },
    { id: 'gachaCount', name: '累計ガチャ回数', isTotal: false },
    { id: 'collectionCount', name: '収集コレクター', isTotal: false },
    { id: 'rockPush', name: '大岩プッシュ王', isTotal: false },
    { id: 'daruma', name: 'だるま落とし王', isTotal: false },
    { id: 'chicken', name: '崖っぷち王', isTotal: false },
    { id: 'guard', name: '飛来物ガード王', isTotal: false },
    { id: '1to20', name: '1〜20早押し王', isTotal: false },
    { id: 'command', name: 'コマンド入力王', isTotal: false },
    { id: 'clover', name: '四つ葉探し王', isTotal: false },
    { id: 'slot', name: 'スロット王', isTotal: false },
    { id: 'bugReports', name: 'バグ報告数', isTotal: false },
    { id: 'firstGenesis', name: '初ジェネシス賞', isTotal: false },
    { id: 'secretCount', name: 'シークレット所持数', isTotal: false }, // ★追加
    { id: 'genesisCount', name: 'ジェネシス所持数', isTotal: false } // ★追加
    
  ];

  let results =[];
  
  for (let i = 0; i < rankTargets.length; i++) {
    const rt = rankTargets[i];
    
    // 大会獲得賞金は Firebase の rankings にはないため特殊処理
    let data =[];
    if (rt.id === 'tournament') {
      // tournament.js の calculateTournamentPrizes をインポートして使用しても良いですが、
      // ここではプロフィールのロードを軽くするため、データ取得をスキップして後で表示調整します。
    } else {
      data = await getRankingData(rt.id, rt.isTotal);
    }
    
    const myRankIdx = data.findIndex(d => d.name === username);
    
    let rankNum = 999999;
    let rankText = "圏外";
    let scoreText = "-";
    let rankColor = "#555";
    let prizeYen = 0;
    let score = null;

    if (myRankIdx !== -1) {
      rankNum = myRankIdx + 1;
      rankText = `${rankNum}位`;
      if (rankNum === 1) rankColor = "#ffd700";
      else if (rankNum === 2) rankColor = "#c0c0c0";
      else if (rankNum === 3) rankColor = "#cd7f32";
      else rankColor = "#fff";
      score = data[myRankIdx].score;
    } else {
      // 圏外の場合でも、歩合計算や表示のためにユーザーデータ(u)からスコアを取得する
      if (['str','vit','agi','lck'].includes(rt.id)) score = rt.isTotal ? (u.battleStats?.[rt.id] || u[rt.id] || 0) : (u[rt.id] || 0);
      else if (rt.id === 'floor') score = u.floor || 1;
      else if (rt.id === 'totalLv') score = u.totalLv || 4;
      else if (rt.id === 'winCount') score = u.winCount || 0;
      else if (rt.id === 'gachaCount') score = u.gachaCount || 0;
      else if (rt.id === 'firstClearCount') score = u.firstClearCount || 0;
      else if (rt.id === 'collectionCount') score = u.collectionCount || 0;
      else if (rt.id === 'bugReports') score = u.bugReports || 0;
      // ミニゲームとジェネシスは圏外なら null (表示しない)
    }

    // ★ 賞金の計算 (tournament.js の仕様に合わせる)
    if (IS_TOURNAMENT_MODE && rt.id !== 'tournament') {
      if (!rt.isTotal || !['str','vit','agi','lck'].includes(rt.id)) {
      // 順位報酬
      if (myRankIdx !== -1) {
        prizeYen += getPrizeForRank(rt.id, myRankIdx);
      }
      
      // 歩合報酬 (圏外でももらえる！)
      if (rt.id === 'floor') {
        let floorScore = u.floor || 1;
        prizeYen += floorScore;
        if (floorScore > 25) prizeYen += 20;
        if (floorScore >= 51) prizeYen += 30;
      } else if (rt.id === 'totalLv') {
        let lvScore = u.totalLv || 4;
        prizeYen += Math.floor(lvScore / 2);
      } else if (rt.id === 'bugReports') {
        let bugScore = u.bugReports || 0;
        prizeYen += bugScore * 10;
      }
    }
    }

    // 表示テキストのフォーマット
    if (score !== null && score !== undefined && (score !== 0 || rt.id === 'floor' || rt.id === 'bugReports')) {
      if (['str','vit','agi','lck'].includes(rt.id)) scoreText = formatNumber(score);
      else if (rt.id === 'floor') scoreText = score + ' 層';
      else if (rt.id === 'winCount' || rt.id === 'firstClearCount') scoreText = score + ' 勝';
      else if (rt.id === 'gachaCount') scoreText = score + ' 回';
      else if (rt.id === 'collectionCount'|| rt.id === 'genesisCount' || rt.id === 'secretCount') scoreText = score + ' 個';
      else if (rt.id === 'bugReports') scoreText = score + ' 件';
      else if (rt.id === 'firstGenesis') scoreText = score; 
      else if (rt.id === 'totalLv') scoreText = 'Lv.' + score;
      else if (['rockPush','daruma','1to20','command','clover'].includes(rt.id)) scoreText = score.toFixed(2) + ' 秒';
      else if (rt.id === 'chicken') scoreText = score.toFixed(2) + ' m';
      else if (rt.id === 'guard' || rt.id === 'slot') scoreText = formatNumber(score) + ' pt';
    }

    // 大会総賞金と初ジェネシス(未取得)のスキップ処理
    if (rt.id === 'tournament') continue; 
    if (rt.id === 'firstGenesis' && rankNum === 999999) continue;

    results.push({ ...rt, originalIndex: i, rankNum, rankText, scoreText, rankColor, prizeYen });
  }

  // 順位が高い順 -> 同じなら元の定義順
  results.sort((a, b) => {
    if (a.rankNum !== b.rankNum) return a.rankNum - b.rankNum;
    return a.originalIndex - b.originalIndex;
  });

  let ranksHtml = '';
  results.forEach(r => {
    let prizeHtml = (IS_TOURNAMENT_MODE && r.prizeYen > 0) ? `<span style="color:#ffd166; font-size:11px; margin-left:5px;">(+${r.prizeYen}円)</span>` : '';
    
    ranksHtml += `
      <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #333; padding:6px 0;">
        <span style="color:#ccc;">${r.name}</span>
        <span>
          <span style="color:${r.rankColor}; font-weight:bold; margin-right:8px;">${r.rankText}</span> 
          <span style="color:#fff; font-family:monospace;">${r.scoreText}${prizeHtml}</span>
        </span>
      </div>
    `;
  });
  document.getElementById('prof-ranks').innerHTML = ranksHtml;
}
