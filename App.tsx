import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import HomeScreen from './src/screens/HomeScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import { RootStackParamList } from './src/types/navigation';

const Stack = createStackNavigator<RootStackParamList>();

// ── 认证守卫：根据登录状态决定显示哪些页面 ──
function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={user ? 'Home' : 'Login'}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#F2F2F7' },
      }}
    >
      {/* 未登录 */}
      {!user ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : (
        <>
          {/* 已登录 */}
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="Workout"
            component={WorkoutScreen}
            options={{ headerShown: true, title: '运动训练', headerTintColor: '#1C1C1E' }}
          />
          <Stack.Screen
            name="History"
            component={HistoryScreen}
            options={{ headerShown: true, title: '训练历史', headerTintColor: '#1C1C1E' }}
          />
          <Stack.Screen
            name="Analytics"
            component={AnalyticsScreen}
            options={{ headerShown: true, title: '数据分析', headerTintColor: '#1C1C1E' }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ headerShown: true, title: '我的', headerTintColor: '#1C1C1E' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <NavigationContainer>
            <AuthGate />
          </NavigationContainer>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
});
