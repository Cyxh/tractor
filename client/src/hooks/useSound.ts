import { useEffect, useCallback, useRef } from 'react';

// Simple sound manager using Web Audio API
const audioCtxRef: { current: AudioContext | null } = { current: null };

function getAudioCtx(): AudioContext {
  if (!audioCtxRef.current) {
    audioCtxRef.current = new AudioContext();
  }
  return audioCtxRef.current;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

const sounds: Record<string, () => void> = {
  'play-card': () => {
    playTone(800, 0.08, 'triangle', 0.12);
  },
  'bid': () => {
    playTone(600, 0.15, 'sine', 0.1);
    setTimeout(() => playTone(900, 0.15, 'sine', 0.1), 100);
  },
  'kitty-select': () => {
    playTone(400, 0.2, 'sine', 0.12);
    setTimeout(() => playTone(600, 0.2, 'sine', 0.12), 150);
    setTimeout(() => playTone(800, 0.3, 'sine', 0.12), 300);
  },
  'game-start': () => {
    playTone(523, 0.15, 'triangle', 0.1);
    setTimeout(() => playTone(659, 0.15, 'triangle', 0.1), 120);
    setTimeout(() => playTone(784, 0.2, 'triangle', 0.1), 240);
  },
};

export function useSound(ws: { on: (type: string, handler: (payload: any) => void) => () => void }, enabled: boolean) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const unsub = ws.on('sound', (payload: { sound: string }) => {
      if (!enabledRef.current) return;
      const fn = sounds[payload.sound];
      if (fn) fn();
    });
    return unsub;
  }, [ws]);

  const playSound = useCallback((name: string) => {
    if (!enabledRef.current) return;
    const fn = sounds[name];
    if (fn) fn();
  }, []);

  return { playSound };
}
