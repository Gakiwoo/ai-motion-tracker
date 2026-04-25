import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { Pose } from '../types';

interface SkeletonOverlayProps {
  pose: Pose;
}

const SKELETON_CONNECTIONS = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

export default function SkeletonOverlay({ pose }: SkeletonOverlayProps) {
  const getKeypoint = (name: string) => {
    return pose.keypoints.find(kp => kp.name === name);
  };

  return (
    <View style={styles.overlay}>
      <Svg style={StyleSheet.absoluteFill}>
        {SKELETON_CONNECTIONS.map(([start, end], index) => {
          const startKp = getKeypoint(start);
          const endKp = getKeypoint(end);
          if (!startKp || !endKp) return null;
          if ((startKp.score || 0) < 0.3 || (endKp.score || 0) < 0.3) return null;

          return (
            <Line
              key={index}
              x1={startKp.x}
              y1={startKp.y}
              x2={endKp.x}
              y2={endKp.y}
              stroke="#00ff00"
              strokeWidth="2"
            />
          );
        })}
        {pose.keypoints.map((kp, index) => {
          if ((kp.score || 0) < 0.3) return null;
          return (
            <Circle
              key={index}
              cx={kp.x}
              cy={kp.y}
              r="4"
              fill="#ff0000"
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
});
