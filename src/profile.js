// src/profile.js
import { getUserProfile, getRankingData } from './firebase.js';
import { formatNumber } from './main.js';
import { EQUIP_NAMES } from './gacha/equipment.js';
import { playSound } from './audio.js';

const RARITY_INDEX = { "C":0, "UC":1, "R":2, "HR":3, "SR":4, "SSR":5, "ER":6, "UR":7, "LR":8, "MR":9, "GR":10, "XR":11, "GEN":12 };

export async function openProfileModal(username) {
  playSound('click');
  const modal = document.getElementById('modal-profile');
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

  // ステータス
  document.getElementById('prof-str').textContent = formatNumber(u.rankStr || u.str || 0);
  document.getElementById('prof-vit').textContent = formatNumber(u.rankVit || u.vit || 0);
  document.getElementById('prof-agi').textContent = formatNumber(u.rankAgi || u.agi || 0);
  document.getElementById('prof-lck').textContent = formatNumber(u.rankLck || u.lck || 0);

  // 装備
  let eqHtml = '';
  const types =[{k:'str', c:'#ff6b6b', n:'武'}, {k:'vit', c:'#6be6ff', n:'防'}, {k:'agi', c:'#94ff6b', n:'靴'}, {k:'lck', c:'#ffd166', n:'飾'}];
  
  types.forEach(t => {
    const eqId = u.equips ? u.equips[t.k] : null;
    if (eqId && RARITY_INDEX[eqId] !== undefined) {
      const eqName = EQUIP_NAMES[t.k][RARITY_INDEX[eqId]];
      eqHtml += `<div style="margin-bottom:2px;"><span style="color:${t.c}; font-weight:bold; display:inline-block; width:16px;">${t.n}</span>: <span class="r-${eqId}">[${eqId}] ${eqName}</span></div>`;
    } else {
      eqHtml += `<div style="margin-bottom:2px;"><span style="color:${t.c}; font-weight:bold; display:inline-block; width:16px;">${t.n}</span>: <span style="color:#555;">装備なし</span></div>`;
    }
  });
  document.getElementById('prof-equips').innerHTML = eqHtml;

  // 主要ランキングの順位取得 (非同期で並列取得)
  const rankTargets =[
    { id: 'floor', name: '最高到達層', isTotal: false },
    { id: 'str', name: 'STR (総合)', isTotal: true },
    { id: 'winCount', name: '累計勝利数', isTotal: false },
    { id: 'rockPush', name: '大岩プッシュ', isTotal: false }
  ];

  let ranksHtml = '';
  for (const rt of rankTargets) {
    const data = await getRankingData(rt.id, rt.isTotal);
    const myRankIdx = data.findIndex(d => d.name === username);
    
    let rankText = "圏外";
    let scoreText = "-";
    let rankColor = "#aaa";

    if (myRankIdx !== -1) {
      const r = myRankIdx + 1;
      rankText = `${r}位`;
      if (r === 1) rankColor = "#ffd700";
      else if (r === 2) rankColor = "#c0c0c0";
      else if (r === 3) rankColor = "#cd7f32";
      else rankColor = "#fff";

      let score = data[myRankIdx].score;
      if (rt.id === 'str') score = formatNumber(score);
      else if (rt.id === 'floor') score += ' 層';
      else if (rt.id === 'winCount') score += ' 勝';
      else if (rt.id === 'rockPush') score = score.toFixed(2) + ' 秒';
      scoreText = score;
    }

    ranksHtml += `
      <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #333; padding:4px 0;">
        <span style="color:#ccc;">${rt.name}</span>
        <span><span style="color:${rankColor}; font-weight:bold; margin-right:8px;">${rankText}</span> <span style="color:#fff;">${scoreText}</span></span>
      </div>
    `;
  }
  document.getElementById('prof-ranks').innerHTML = ranksHtml;
}