import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  width?: number;
  height?: number;
  title?: string;
}

export default function BarChart({
  data,
  width = 300,
  height = 200,
  title,
}: BarChartProps) {
  if (data.length === 0) {
    return (
      <View style={styles.container}>
        {title && <Text style={styles.title}>{title}</Text>}
        <Text style={styles.emptyText}>暂无数据</Text>
      </View>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const chartHeight = height - 40; // Leave space for labels
  const barWidth = (width - 20) / data.length - 10;
  const barGap = 10;

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      <Svg width={width} height={height}>
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * chartHeight;
          const x = 10 + index * (barWidth + barGap);
          const y = chartHeight - barHeight + 10;

          return (
            <React.Fragment key={index}>
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={item.color || '#007AFF'}
                rx={4}
              />
              <SvgText
                x={x + barWidth / 2}
                y={height - 5}
                fontSize={10}
                fill="#666"
                textAnchor="middle"
              >
                {item.label}
              </SvgText>
              <SvgText
                x={x + barWidth / 2}
                y={y - 5}
                fontSize={10}
                fill="#333"
                textAnchor="middle"
              >
                {item.value}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
    padding: 20,
  },
});
