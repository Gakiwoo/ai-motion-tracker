import { useCallback, useRef } from 'react';
import { Audio } from 'expo-av';

export type SoundType = 'success' | 'warning' | 'complete';

const SOUND_URI = 'https://www.soundjay.com/buttons/beep-01a.mp3';

export function useSound() {
  const soundRef = useRef<Audio.Sound | null>(null);

  const playSound = useCallback(async (type: SoundType) => {
    try {
      // Configure audio mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      // Unload previous sound if exists
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      // Create and play sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: SOUND_URI },
        { shouldPlay: true, volume: 0.8 }
      );

      soundRef.current = sound;

      // Auto cleanup after playing
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (error) {
      console.warn('Failed to play sound:', error);
    }
  }, []);

  const playSuccess = useCallback(() => playSound('success'), [playSound]);
  const playComplete = useCallback(() => playSound('complete'), [playSound]);
  const playWarning = useCallback(() => playSound('warning'), [playSound]);

  return { playSound, playSuccess, playComplete, playWarning };
}
