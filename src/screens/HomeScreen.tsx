import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeScreenProps } from '../types/navigation';
import { EXERCISE_CONFIGS } from '../constants/exerciseConfig';
import { ExerciseType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import ExerciseIllustration from '../components/ExerciseIllustration';

// ── 布局常量 ──
const SCREEN_W = Dimensions.get('window').width;
const MAIN_PAD = 16;        // 左右内边距
const GAP = 12;             // 卡片间距
const CARD_W = (SCREEN_W - MAIN_PAD * 2 - GAP) / 2;
const CARD_H = CARD_W * 1.25;   // 4:5 纵向比例
const ILLUSTRATION_SIZE = CARD_W * 0.62;

// ── 与桌面版 cardThemes 对齐 ──
const CARD_THEMES: Record<
  ExerciseType,
  { colors: [string, string]; accent: string; labelBg: string }
> = {
  jump_rope: {
    colors: ['#EBF4FF', '#C8E4FF'],
    accent: '#007AFF',
    labelBg: 'rgba(0,122,255,0.10)',
  },
  jumping_jacks: {
    colors: ['#EDFBF2', '#C6EFD5'],
    accent: '#25A244',
    labelBg: 'rgba(37,162,68,0.10)',
  },
  squats: {
    colors: ['#FFF5EA', '#FFE0BC'],
    accent: '#D4700A',
    labelBg: 'rgba(212,112,10,0.10)',
  },
  standing_long_jump: {
    colors: ['#F6F0FF', '#E2D3FD'],
    accent: '#8A3FD4',
    labelBg: 'rgba(138,63,212,0.10)',
  },
  vertical_jump: {
    colors: ['#FFF2F1', '#FFCCC9'],
    accent: '#D4201A',
    labelBg: 'rgba(212,32,26,0.10)',
  },
  sit_ups: {
    colors: ['#E8FAF8', '#BDECE6'],
    accent: '#0A8F85',
    labelBg: 'rgba(10,143,133,0.10)',
  },
};

// ── 单张运动卡片 ──
function ExerciseCard({
  exercise,
  onPress,
  index,
}: {
  exercise: typeof EXERCISE_CONFIGS[0];
  onPress: () => void;
  index: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const theme = CARD_THEMES[exercise.type];

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 380,
      delay: index * 60,
      useNativeDriver: true,
    }).start();
  }, []);

  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        activeOpacity={1}
      >
        <View style={[
          styles.card,
          index % 2 === 1 && styles.cardOdd,
          index >= 2 && styles.cardNotFirstRow,
        ]}>
          {/* 渐变背景层（用两色 linearGradient 模拟） */}
          <View style={[styles.cardGradient, { backgroundColor: theme.colors[0] }]}>
            <View style={[styles.cardGradientBottom, { backgroundColor: theme.colors[1] }]} />
          </View>

          {/* 内容层 */}
          <View style={styles.cardInner}>
            {/* 名称标签 — 顶部居中 */}
            <View
              style={[
                styles.exerciseLabel,
                { backgroundColor: theme.labelBg },
              ]}
            >
              <Text style={[styles.exerciseName, { color: theme.accent }]}>
                {exercise.name}
              </Text>
            </View>

            {/* 插画区 */}
            <View style={styles.illustrationWrap}>
              <ExerciseIllustration type={exercise.type} size={ILLUSTRATION_SIZE} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── 主页面 ──
export default function HomeScreen({ navigation }: HomeScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F2F7" />

      {/* ── 顶栏：对齐桌面版 ── */}
      <Animated.View style={[styles.topbar, { opacity: fadeAnim, paddingTop: insets.top + 10 }]}>
        <Text style={styles.logo}>AI SPORT</Text>
        <View style={styles.navActions}>
          {/* 用户头像入口 */}
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.7}
          >
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {(user?.nickname || user?.email || '?')[0].toUpperCase()}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => navigation.navigate('History')}
            activeOpacity={0.7}
          >
            <Text style={styles.navBtnText}>历史</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, styles.navBtnPrimary]}
            onPress={() => navigation.navigate('Analytics')}
            activeOpacity={0.7}
          >
            <Text style={[styles.navBtnText, styles.navBtnTextLight]}>分析</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── 卡片网格 ── */}
      <ScrollView
        style={styles.main}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {EXERCISE_CONFIGS.map((exercise, i) => (
          <ExerciseCard
            key={exercise.type}
            exercise={exercise}
            index={i}
            onPress={() =>
              navigation.navigate('Workout', { exerciseType: exercise.type })
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },

  // ── 顶栏 ──
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  logo: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2.5,
    color: '#1C1C1E',
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.90)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  navBtnPrimary: {
    backgroundColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 2,
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  navBtnTextLight: {
    color: '#FFFFFF',
  },
  avatarBtn: {
    marginRight: 4,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── 主内容 ──
  main: {
    flex: 1,
    paddingHorizontal: MAIN_PAD,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 24,
  },

  // ── 卡片 ──
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    backgroundColor: '#fff',
  },
  cardOdd: {
    marginLeft: GAP,
  },
  cardNotFirstRow: {
    marginTop: GAP,
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  cardGradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  cardInner: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 4,
  },

  // ── 名称标签（顶部居中） ──
  exerciseLabel: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.02,
  },

  // ── 插画 ──
  illustrationWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
});
