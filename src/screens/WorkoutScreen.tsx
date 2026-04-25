import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, Modal, StatusBar, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExerciseType, Pose, WorkoutMode } from '../types';
import { WorkoutScreenProps } from '../types/navigation';
import CameraView from '../components/CameraView';
import { useWorkout } from '../hooks/useWorkout';
import { useExerciseFeedback, FormFeedback } from '../hooks/useExerciseFeedback';
import { useSound } from '../hooks/useSound';
import { EXERCISE_NAMES, DEFAULT_TARGETS, DEFAULT_DURATIONS } from '../constants/exerciseConfig';

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getElapsedSeconds(startTime: number | null): number {
  if (!startTime) return 0;
  return Math.round((Date.now() - startTime) / 1000);
}

export default function WorkoutScreen({ route }: WorkoutScreenProps) {
  const { exerciseType } = route.params;
  const insets = useSafeAreaInsets();
  const {
    isActive,
    count,
    mode,
    targetCount,
    setTargetCount,
    targetDuration,
    setTargetDuration,
    isSaving,
    timeUp,
    processFrame,
    start,
    stop,
    switchMode,
  } = useWorkout(exerciseType);

  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetInput, setTargetInput] = useState(DEFAULT_TARGETS[exerciseType].toString());
  const [durationInput, setDurationInput] = useState(DEFAULT_DURATIONS[exerciseType].toString());
  const [currentFeedback, setCurrentFeedback] = useState<FormFeedback | null>(null);
  const hasShownCompletionRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const countdownAnim = useRef(new Animated.Value(1)).current;
  const [elapsed, setElapsed] = useState(0);

  const { getFeedback } = useExerciseFeedback();
  const { playSuccess } = useSound();

  // Sync startTime with hook
  useEffect(() => {
    if (isActive) {
      startTimeRef.current = Date.now();
      hasShownCompletionRef.current = false;
      setElapsed(0);
    } else {
      startTimeRef.current = null;
    }
  }, [isActive]);

  // Elapsed timer
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(getElapsedSeconds(startTimeRef.current));
      }
    }, 200);
    return () => clearInterval(timer);
  }, [isActive]);

  // Countdown pulse animation when time is up
  useEffect(() => {
    if (timeUp) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(countdownAnim, { toValue: 0.6, duration: 500, useNativeDriver: true }),
          Animated.timing(countdownAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      countdownAnim.setValue(1);
    }
  }, [timeUp]);

  // Check for target completion (count mode only)
  useEffect(() => {
    if (isActive && mode === 'count' && count > 0 && count >= targetCount && !hasShownCompletionRef.current) {
      hasShownCompletionRef.current = true;
      playSuccess();
      Alert.alert(
        '🎉 恭喜完成！',
        `已达成目标 ${targetCount} 次！`,
        [{ text: '继续', style: 'cancel' }, { text: '停止', onPress: handleStop }]
      );
    }
  }, [count, targetCount, isActive, mode, playSuccess]);

  // Auto-stop on timeUp (timed mode)
  useEffect(() => {
    if (timeUp && isActive) {
      handleStop();
    }
  }, [timeUp]);

  const handlePoseDetected = useCallback((pose: Pose) => {
    processFrame(pose);
    const feedback = getFeedback(pose, exerciseType);
    setCurrentFeedback(feedback);
  }, [processFrame, getFeedback, exerciseType]);

  const handleStart = () => {
    start();
    setCurrentFeedback(null);
  };

  const handleStop = async () => {
    setCurrentFeedback(null);
    const { session, saved } = await stop();

    if (saved && session) {
      const modeLabel = session.mode === 'timed' ? '⏰ 定时模式' : '🎯 定数模式';
      Alert.alert(
        `${modeLabel}\n训练记录已保存`,
        `${EXERCISE_NAMES[exerciseType]}：${session.count} 次，耗时 ${session.duration} 秒`,
        [{ text: '确定' }]
      );
    } else if (!saved && session) {
      Alert.alert(
        '保存失败',
        '训练记录保存失败，请重试',
        [{ text: '确定' }]
      );
    }
  };

  const handleSetTarget = () => {
    const target = parseInt(targetInput, 10);
    if (isNaN(target) || target <= 0) {
      Alert.alert('无效目标', '请输入有效的目标次数');
      return;
    }
    setTargetCount(target);
    setShowTargetModal(false);
  };

  const handleSetDuration = () => {
    const dur = parseInt(durationInput, 10);
    if (isNaN(dur) || dur <= 0) {
      Alert.alert('无效时长', '请输入有效的目标时长（秒）');
      return;
    }
    setTargetDuration(dur);
    setShowTargetModal(false);
  };

  const getFeedbackStyle = (feedback: FormFeedback | null) => {
    if (!feedback) return {};
    switch (feedback.type) {
      case 'error':
        return styles.feedbackError;
      case 'warning':
        return styles.feedbackWarning;
      case 'success':
        return styles.feedbackSuccess;
      default:
        return {};
    }
  };

  const countdown = Math.max(0, targetDuration - elapsed);
  const isTimed = mode === 'timed';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <CameraView onPoseDetected={handlePoseDetected} isActive={isActive} />
      <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        {/* ── 顶部栏 ── */}
        <View style={styles.topRow}>
          <View style={styles.namePill}>
            <Text style={styles.exerciseName}>{EXERCISE_NAMES[exerciseType]}</Text>
          </View>
          {!isActive && (
            <>
              <TouchableOpacity
                style={styles.targetButton}
                onPress={() => setShowTargetModal(true)}
              >
                <Text style={styles.targetButtonText}>
                  {isTimed ? `⏰ ${formatCountdown(targetDuration)}` : `🎯 ${targetCount}`}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── 模式切换（仅非活跃状态显示） ── */}
        {!isActive && (
          <View style={styles.modeSwitcher}>
            <TouchableOpacity
              style={[styles.modeBtn, !isTimed && styles.modeBtnActive]}
              onPress={() => switchMode('count')}
            >
              <Text style={[styles.modeBtnText, !isTimed && styles.modeBtnTextActive]}>🎯 定数模式</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, isTimed && styles.modeBtnActive]}
              onPress={() => switchMode('timed')}
            >
              <Text style={[styles.modeBtnText, isTimed && styles.modeBtnTextActive]}>⏰ 定时模式</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 计数区 ── */}
        <View style={styles.centerContent}>
          {isActive && isTimed && (
            <Animated.View style={{ opacity: countdownAnim }}>
              <Text style={[
                styles.timerValue,
                timeUp && styles.timerValueExpired,
              ]}>
                {formatCountdown(countdown)}
              </Text>
            </Animated.View>
          )}

          <Text style={[
            styles.counter,
            isActive && isTimed && styles.counterTimed,
          ]}>
            {count}
          </Text>

          {isActive && (
            <View style={styles.targetHint}>
              <Text style={styles.targetHintText}>
                {isTimed
                  ? `剩余 ${formatCountdown(countdown)}  ·  已做 ${count} 次`
                  : `目标 ${targetCount}  ·  ${Math.round((count / targetCount) * 100)}%`
                }
              </Text>
            </View>
          )}

          {currentFeedback && (
            <View style={[styles.feedbackBox, getFeedbackStyle(currentFeedback)]}>
              <Text style={styles.feedbackText}>{currentFeedback.message}</Text>
            </View>
          )}
        </View>

        {/* ── 底部控制按钮 ── */}
        <View style={styles.controls}>
          {!isActive ? (
            <TouchableOpacity style={styles.startButton} onPress={handleStart}>
              <Text style={styles.buttonText}>开始</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.stopButton, isSaving && styles.disabledButton]}
              onPress={() => {
                Alert.alert(
                  '确认停止',
                  isTimed
                    ? `当前已做 ${count} 次，确定要停止并保存记录吗？`
                    : `当前 ${count}/${targetCount} 次，确定要停止并保存记录吗？`,
                  [
                    { text: '取消', style: 'cancel' },
                    { text: '停止并保存', style: 'destructive', onPress: handleStop },
                  ]
                );
              }}
              disabled={isSaving}
            >
              <Text style={[styles.buttonText, styles.stopButtonText]}>{isSaving ? '保存中...' : '停止'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── 目标设置弹窗 ── */}
      <Modal
        visible={showTargetModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTargetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {isTimed ? (
              <>
                <Text style={styles.modalTitle}>⏰ 设置目标时长</Text>
                <TextInput
                  style={styles.targetInput}
                  value={durationInput}
                  onChangeText={setDurationInput}
                  keyboardType="number-pad"
                  placeholder="输入秒数（如 60）"
                  maxLength={4}
                />
                <Text style={styles.modalHint}>常用：30秒 / 60秒 / 90秒 / 120秒</Text>
                <View style={styles.modalQuickBtns}>
                  {[30, 60, 90, 120].map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.quickBtn, durationInput === d.toString() && styles.quickBtnActive]}
                      onPress={() => setDurationInput(d.toString())}
                    >
                      <Text style={styles.quickBtnText}>{d}s</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => {
                      setDurationInput(targetDuration.toString());
                      setShowTargetModal(false);
                    }}
                  >
                    <Text style={styles.cancelButtonText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.confirmButton]}
                    onPress={handleSetDuration}
                  >
                    <Text style={styles.confirmButtonText}>确定</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>🎯 设置目标次数</Text>
                <TextInput
                  style={styles.targetInput}
                  value={targetInput}
                  onChangeText={setTargetInput}
                  keyboardType="number-pad"
                  placeholder="输入目标次数"
                  maxLength={5}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => {
                      setTargetInput(targetCount.toString());
                      setShowTargetModal(false);
                    }}
                  >
                    <Text style={styles.cancelButtonText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.confirmButton]}
                    onPress={handleSetTarget}
                  >
                    <Text style={styles.confirmButtonText}>确定</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },

  // ── 顶部栏 ──
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  namePill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  exerciseName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  targetButton: {
    backgroundColor: 'rgba(0,122,255,0.82)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,122,255,0.5)',
  },
  targetButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── 模式切换 ──
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 14,
    padding: 3,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: 'rgba(0,122,255,0.82)',
  },
  modeBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
  },

  // ── 计时区（定时模式） ──
  timerValue: {
    fontSize: 42,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'sans-serif-condensed',
    marginBottom: 4,
  },
  timerValueExpired: {
    color: '#FF3B30',
  },

  // ── 计数区 ──
  centerContent: {
    alignItems: 'center',
  },
  counter: {
    fontSize: 104,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 16,
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'sans-serif-condensed',
  },
  counterTimed: {
    fontSize: 80,
  },
  targetHint: {
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.40)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  targetHintText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  feedbackBox: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  feedbackWarning: {
    backgroundColor: 'rgba(255,159,10,0.88)',
    borderColor: 'rgba(255,159,10,0.40)',
  },
  feedbackError: {
    backgroundColor: 'rgba(255,59,48,0.88)',
    borderColor: 'rgba(255,59,48,0.40)',
  },
  feedbackSuccess: {
    backgroundColor: 'rgba(52,199,89,0.22)',
    borderColor: 'rgba(52,199,89,0.45)',
  },
  feedbackText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── 底部控制按钮 ──
  controls: {
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 56,
    paddingVertical: 17,
    borderRadius: 50,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.40,
    shadowRadius: 12,
    elevation: 6,
  },
  stopButton: {
    backgroundColor: 'rgba(255,59,48,0.92)',
    paddingHorizontal: 56,
    paddingVertical: 17,
    borderRadius: 50,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  stopButtonText: {
    color: '#FFFFFF',
  },

  // ── 弹窗 ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    width: '80%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    color: '#1C1C1E',
  },
  modalHint: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginBottom: 12,
  },
  targetInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 14,
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 16,
    color: '#1C1C1E',
    backgroundColor: '#F2F2F7',
    fontWeight: '700',
  },
  modalQuickBtns: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  quickBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
  },
  quickBtnActive: {
    backgroundColor: '#007AFF',
  },
  quickBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
  },
  cancelButton: {
    backgroundColor: '#F2F2F7',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#1C1C1E',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
