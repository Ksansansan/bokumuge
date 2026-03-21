// src/audio.js を以下で上書き
const AudioContext = window.AudioContext || window.webkitAudioContext;
let ctx;

// ★ 追加：音量管理
let masterVolume = parseFloat(localStorage.getItem('se_volume')) ?? 0.5; // 初期値50%
let isMuted = localStorage.getItem('se_muted') === 'true';

export function setVolume(val) {
  masterVolume = val;
  localStorage.setItem('se_volume', val);
}

export function toggleMute() {
  isMuted = !isMuted;
  localStorage.setItem('se_muted', isMuted);
  return isMuted;
}

export function getAudioSettings() {
  return { volume: masterVolume, muted: isMuted };
}

function initAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
}

export function playSound(type) {
  if (isMuted || masterVolume === 0) return; // ★ ミュート時は鳴らさない
  
  initAudio();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  
  // 各音の「基本音量」に masterVolume を掛ける
  const v = (baseVol) => baseVol * masterVolume;

  switch(type) {
    case 'click':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
      gain.gain.setValueAtTime(v(0.1), now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now); osc.stop(now + 0.1);
      break;
    case 'hit':
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
      gain.gain.setValueAtTime(v(0.1), now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now); osc.stop(now + 0.1);
      break;
    case 'damage':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.2);
      gain.gain.setValueAtTime(v(0.2), now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
      break;
    case 'defeat':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
      gain.gain.setValueAtTime(v(0.1), now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
      break;
    case 'error':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.setValueAtTime(120, now + 0.1);
      gain.gain.setValueAtTime(v(0.05), now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
      break;
    case 'win':
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.setValueAtTime(500, now + 0.1);
      osc.frequency.setValueAtTime(600, now + 0.2);
      gain.gain.setValueAtTime(v(0.15), now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.6);
      osc.start(now); osc.stop(now + 0.6);
      break;
  }
}