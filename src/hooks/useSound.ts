import { useCallback, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';

// 本地音效文件（不再依赖外网 soundjay.com）
const SOUND_ASSET = require('../../assets/sounds/beep-01a.wav');

export type SoundType = 'success' | 'warning' | 'complete';

export function useSound() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const isLoadedRef = useRef(false);

  // 预加载音效：组件挂载时一次性下载，后续播放直接 replayAsync 复用
  useEffect(() => {
    let mounted = true;

    async function preload() {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          SOUND_ASSET,
          { shouldPlay: false, volume: 0.8 }
        );
        if (mounted) {
          soundRef.current = sound;
          isLoadedRef.current = true;
        } else {
          sound.unloadAsync();
        }
      } catch (error) {
        console.warn('Failed to preload sound:', error);
      }
    }

    preload();

    return () => {
      mounted = false;
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
        isLoadedRef.current = false;
      }
    };
  }, []);

  // 播放音效：复用已加载的 Sound 对象，避免每次播放都重新下载
  const playSound = useCallback(async (_type: SoundType) => {
    try {
      if (isLoadedRef.current && soundRef.current) {
        await soundRef.current.replayAsync();
      }
      // 未加载完成时静默跳过（首次挂载网络慢的情况）
    } catch (error) {
      console.warn('Failed to play sound:', error);
    }
  }, []);

  const playSuccess = useCallback(() => playSound('success'), [playSound]);
  const playComplete = useCallback(() => playSound('complete'), [playSound]);
  const playWarning = useCallback(() => playSound('warning'), [playSound]);

  return { playSound, playSuccess, playComplete, playWarning };
}
