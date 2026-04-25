import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { RegisterScreenProps } from '../types/navigation';

export default function RegisterScreen({ navigation }: RegisterScreenProps) {
  const { register, isAuthenticating, error, clearError } = useAuth();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleRegister = async () => {
    if (!nickname.trim()) {
      Alert.alert('提示', '请输入昵称');
      return;
    }
    if (!email.trim()) {
      Alert.alert('提示', '请输入邮箱');
      return;
    }
    if (!password) {
      Alert.alert('提示', '请输入密码');
      return;
    }
    if (password.length < 6) {
      Alert.alert('提示', '密码至少 6 位');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('提示', '两次密码不一致');
      return;
    }
    try {
      await register(email.trim(), password, nickname.trim());
    } catch {
      // error 已在 context 中处理
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F2F7" />
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 标题 */}
        <View style={styles.header}>
          <Text style={styles.title}>创建账号</Text>
          <Text style={styles.subtitle}>注册后即可使用 AI SPORT</Text>
        </View>

        {/* 表单 */}
        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={clearError}>
                <Text style={styles.errorDismiss}>×</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="昵称"
            placeholderTextColor="#AEAEB2"
            autoCapitalize="none"
            value={nickname}
            onChangeText={setNickname}
            editable={!isAuthenticating}
          />

          <TextInput
            style={styles.input}
            placeholder="邮箱"
            placeholderTextColor="#AEAEB2"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            editable={!isAuthenticating}
          />

          <TextInput
            style={styles.input}
            placeholder="密码（至少 6 位）"
            placeholderTextColor="#AEAEB2"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!isAuthenticating}
          />

          <TextInput
            style={styles.input}
            placeholder="确认密码"
            placeholderTextColor="#AEAEB2"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!isAuthenticating}
            onSubmitEditing={handleRegister}
          />

          <TouchableOpacity
            style={[styles.button, isAuthenticating && styles.buttonDisabled]}
            onPress={handleRegister}
            activeOpacity={0.8}
            disabled={isAuthenticating}
          >
            <Text style={styles.buttonText}>
              {isAuthenticating ? '注册中...' : '注册'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchLink}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.switchText}>
              已有账号？<Text style={styles.switchHighlight}>立即登录</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  keyboardWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
  },
  form: {
    gap: 12,
  },
  errorBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFE5E5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#D4201A',
    fontWeight: '500',
  },
  errorDismiss: {
    fontSize: 18,
    color: '#D4201A',
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1C1C1E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  switchLink: {
    alignItems: 'center',
    marginTop: 8,
  },
  switchText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  switchHighlight: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
