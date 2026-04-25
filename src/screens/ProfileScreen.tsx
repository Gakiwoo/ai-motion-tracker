import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import AuthService from '../services/AuthService';
import { ProfileScreenProps } from '../types/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { user, logout, updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [isSaving, setIsSaving] = useState(false);

  // ── 修改密码 ──
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleSaveNickname = async () => {
    if (!nickname.trim()) {
      Alert.alert('提示', '昵称不能为空');
      return;
    }
    setIsSaving(true);
    try {
      const updatedUser = await AuthService.updateNickname({ nickname: nickname.trim() });
      updateUser(updatedUser);   // 同步全局 user（头像字母等立即更新）
      setIsEditing(false);
      Alert.alert('成功', '昵称已更新');
    } catch (err: any) {
      Alert.alert('失败', err.message || '更新失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    if (!currentPassword) {
      setPasswordError('请输入当前密码');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('两次密码不一致');
      return;
    }
    setIsChangingPassword(true);
    try {
      await AuthService.changePassword({
        currentPassword,
        newPassword,
      });
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      // changePassword 成功后自动登出
      Alert.alert('成功', '密码已修改，请重新登录');
    } catch (err: any) {
      setPasswordError(err.message || '密码修改失败');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('确认登出', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '登出',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F2F7" />

      {/* 顶栏 */}
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topbarTitle}>我的</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.main} showsVerticalScrollIndicator={false}>
        {/* 用户信息卡片 */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>账号信息</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>邮箱</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{user?.email}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>昵称</Text>
            {isEditing ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  value={nickname}
                  onChangeText={setNickname}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={handleSaveNickname}
                  disabled={isSaving}
                >
                  <Text style={styles.editAction}>
                    {isSaving ? '...' : '保存'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.editRow}>
                <Text style={styles.infoValue}>{user?.nickname}</Text>
                <TouchableOpacity onPress={() => setIsEditing(true)}>
                  <Text style={styles.editAction}>修改</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>注册时间</Text>
            <Text style={styles.infoValue}>
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '-'}
            </Text>
          </View>
        </View>

        {/* 安全设置卡片 */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>安全设置</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => setShowPasswordModal(true)}
          >
            <Text style={styles.menuText}>修改密码</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 登出按钮 */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── 修改密码弹窗 ── */}
      {showPasswordModal ? (
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>修改密码</Text>

            {passwordError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{passwordError}</Text>
              </View>
            ) : null}

            <TextInput
              style={styles.modalInput}
              placeholder="当前密码"
              placeholderTextColor="#AEAEB2"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="新密码（至少 6 位）"
              placeholderTextColor="#AEAEB2"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="确认新密码"
              placeholderTextColor="#AEAEB2"
              secureTextEntry
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              onSubmitEditing={handleChangePassword}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowPasswordModal(false);
                  setPasswordError('');
                }}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, isChangingPassword && styles.buttonDisabled]}
                onPress={handleChangePassword}
                disabled={isChangingPassword}
              >
                <Text style={styles.modalConfirmText}>
                  {isChangingPassword ? '修改中...' : '确认修改'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
  },
  backText: {
    fontSize: 24,
    color: '#007AFF',
    fontWeight: '600',
  },
  topbarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  main: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  infoLabel: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    justifyContent: 'flex-end',
  },
  editInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#007AFF',
    paddingVertical: 4,
    fontSize: 15,
    color: '#1C1C1E',
    textAlign: 'right',
  },
  editAction: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '600',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  menuText: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  menuArrow: {
    fontSize: 22,
    color: '#C7C7CC',
    fontWeight: '300',
  },
  logoutBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  logoutText: {
    fontSize: 16,
    color: '#D4201A',
    fontWeight: '600',
  },

  // ── 弹窗 ──
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 4,
  },
  errorBox: {
    backgroundColor: '#FFE5E5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 13,
    color: '#D4201A',
    fontWeight: '500',
  },
  modalInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1C1E',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalCancel: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  modalConfirm: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#007AFF',
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
