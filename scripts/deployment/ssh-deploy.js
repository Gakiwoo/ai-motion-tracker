/**
 * ssh-deploy.js — SSH 部署 MediaPipe 文件到 gakiwoo.com
 * 使用 Node.js ssh2 包 + SCP 上传
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG = {
  host: 'gakiwoo.com',
  port: 22,
  username: 'root',
  password: process.env.GAKIWOO_DEPLOY_PASSWORD,
  localPoseDir: path.join(__dirname, '../../mediapipe-upload/pose'),
  remotePoseDir: '/var/www/gakiwoo/static/mediapipe/pose/',
  nginxConf: '/etc/nginx/sites-enabled/gakiwoo.com',
};

function rl(prompt) {
  return new Promise(resolve => {
    const i = readline.createInterface({ input: process.stdin, output: process.stdout });
    i.question(prompt, ans => { i.close(); resolve(ans); });
  });
}

function sshExec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let out = '', err2 = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => err2 += d);
      stream.on('close', (code, signal) => {
        if (code !== 0 && err2) reject(new Error(err2));
        else resolve(out);
      });
    });
  });
}

function scpFile(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.scpSend({
      source: localPath,
      destination: remotePath,
      // small file timeout
    }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function main() {
  const { host, port, username, localPoseDir, remotePoseDir, nginxConf } = CONFIG;
  let { password } = CONFIG;
  if (!password) {
    password = await rl('SSH password (or press Enter to use key/agent): ');
  }

  console.log('=== 连接到', host, '===');
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({
      host,
      port,
      username,
      ...(password ? { password } : {}),
    });
  });
  console.log('  ✓ SSH 连接成功');

  // 1. 检查本地文件
  console.log('\n[1/5] 检查本地文件...');
  const files = fs.readdirSync(localPoseDir);
  console.log('  ✓ 找到', files.length, '个文件:', files.join(', '));

  // 2. 创建远程目录
  console.log('\n[2/5] 创建远程目录...');
  await sshExec(conn, `mkdir -p "${remotePoseDir}"`);
  console.log('  ✓ 目录已创建');

  // 3. 上传文件
  console.log('\n[3/5] 上传文件...');
  for (const file of files) {
    const localPath = path.join(localPoseDir, file);
    const remotePath = remotePoseDir + file;
    process.stdout.write(`  上传 ${file}... `);
    await scpFile(conn, localPath, remotePath);
    console.log('✓');
  }
  console.log('  ✓ 全部上传完成');

  // 4. 验证
  console.log('\n[4/5] 验证远程文件...');
  const lsOut = await sshExec(conn, `ls -la "${remotePoseDir}"`);
  console.log(lsOut);

  // 5. Nginx 配置
  console.log('\n[5/5] 更新 Nginx 配置...');

  // 备份
  await sshExec(conn, `cp "${nginxConf}" "${nginxConf}.bak.$(date +%Y%m%d%H%M%S)"`);
  console.log('  ✓ 备份完成');

  // 读取当前配置
  let nginxContent = await sshExec(conn, `cat "${nginxConf}"`);
  let modified = false;

  // 添加 MediaPipe location（在 location /api/ 之前）
  const mediapipeBlock = `
    # ===== MediaPipe Pose 静态文件 (WASM/模型) =====
    location /static/mediapipe/ {
        alias /var/www/gakiwoo/static/mediapipe/;
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Range" always;
        add_header Cache-Control "public, max-age=2592000, immutable";
        types {
            application/javascript  js;
            application/wasm        wasm;
            application/octet-stream data tflite binarypb;
        }
        client_max_body_size 10m;
        access_log off;
    }
`;
  if (!nginxContent.includes('location /static/mediapipe/')) {
    nginxContent = nginxContent.replace(
      /(\n    location \/api\/)/,
      mediapipeBlock + '$1'
    );
    modified = true;
    console.log('  ✓ MediaPipe location 已添加');
  } else {
    console.log('  - MediaPipe location 已存在，跳过');
  }

  // 更新 CSP connect-src
  const oldCSPConnect = "connect-src 'self' https://gakiwoo.com https://api.minimaxi.com;";
  const newCSPConnect = "connect-src 'self' https://gakiwoo.com https://api.minimaxi.com https://gakiwoo.com/static/mediapipe/;";
  if (nginxContent.includes(oldCSPConnect) && !nginxContent.includes(newCSPConnect)) {
    nginxContent = nginxContent.replace(oldCSPConnect, newCSPConnect);
    console.log('  ✓ CSP connect-src 已更新');
  }

  // 更新 CSP script-src
  const oldCSPScript = "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;";
  const newCSPScript = "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://gakiwoo.com;";
  if (nginxContent.includes(oldCSPScript) && !nginxContent.includes(newCSPScript)) {
    nginxContent = nginxContent.replace(oldCSPScript, newCSPScript);
    console.log('  ✓ CSP script-src 已更新');
  }

  if (modified) {
    // 写入临时文件再 copy（避免 heredoc 转义问题）
    const tmpFile = '/tmp/nginx_gakiwoo_new.conf';
    await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        const writeStream = sftp.createWriteStream(tmpFile);
        writeStream.write(nginxContent);
        writeStream.end();
        writeStream.on('close', resolve);
        writeStream.on('error', reject);
      });
    });

    // 用 cat 重定向（保留文件权限）
    await sshExec(conn, `cat "${tmpFile}" > "${nginxConf}" && rm -f "${tmpFile}"`);
    console.log('  ✓ Nginx 配置已写入');
  }

  // 测试 Nginx
  console.log('\n  测试 Nginx 配置...');
  let testOut;
  try {
    testOut = await sshExec(conn, 'nginx -t 2>&1');
    console.log('  ', testOut.trim());
  } catch (e) {
    console.error('  nginx -t 失败:', e.message);
  }

  // 重载 Nginx
  console.log('\n  重载 Nginx...');
  await sshExec(conn, 'nginx -s reload');
  console.log('  ✓ Nginx 已重载');

  // 验证文件可访问
  console.log('\n  验证文件可访问性...');
  try {
    const headers = await sshExec(conn, 'curl -sI "https://gakiwoo.com/static/mediapipe/pose/pose.js" | head -6');
    console.log(headers);
  } catch (e) {
    console.error('  验证失败:', e.message);
  }

  conn.end();
  console.log('\n=== 部署完成 ===');
  console.log('验证 URL:');
  console.log('  https://gakiwoo.com/static/mediapipe/pose/pose.js');
  console.log('  https://gakiwoo.com/static/mediapipe/pose/pose_solution_simd_wasm_bin.wasm');
}

main().catch(err => {
  console.error('部署失败:', err.message);
  process.exit(1);
});
