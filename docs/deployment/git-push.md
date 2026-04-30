# Git 推送文档

## 远程仓库

| 名称 | 地址 | 用途 |
|------|------|------|
| `origin` | `git@github.com:Gakiwoo/ai-motion-tracker.git` | GitHub |
| `codeup` | `git@codeup.aliyun.com:69e30e610d50a0a5d45da9a8/ai-motion-tracker.git` | Codeup (阿里云) |

## 推送命令

推送到两个平台：
```bash
git push -u origin master && git push -u codeup master
```

单独推送某个平台：
```bash
git push -u origin master   # GitHub
git push -u codeup master   # Codeup
```

## Codeup SSH 配置（首次）

Codeup 需要配置 SSH 密钥才能推送。

### 1. 获取本机公钥

```bash
cat ~/.ssh/id_ed25519.pub
```

输出示例：
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOECDFUymrlUwKH0Vt7W6JhyPPxCwOf/DjJDOh48y4EZ wu_jiaqi@sina.cn
```

### 2. 添加主机密钥

```bash
ssh-keyscan -p 22 codeup.aliyun.com >> ~/.ssh/known_hosts
```

### 3. 添加 SSH 公钥到 Codeup

1. 登录 Codeup → 个人设置 → SSH 公钥
2. 添加上方公钥内容

### 4. 配置 SSH config（可选）

编辑 `~/.ssh/config`：
```
Host codeup.aliyun.com
  HostName codeup.aliyun.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

## 注意事项

- 如果远程有新的提交，先 `git pull --rebase` 再推送
- 推送前确保本地更改已 commit
- `.claude/` 目录是本地配置，无需推送
