#!/bin/bash
# AI图像管理系统 - 服务器一键部署脚本
# 在服务器上执行: bash server-deploy.sh

set -e
APP_DIR="/home/ubuntu/ai-image-admin"
echo "======================================"
echo " AI图像管理系统 服务器部署脚本"
echo "======================================"

# 1. 检查并安装Node.js
echo "[1/6] 检查Node.js环境..."
if ! command -v node &> /dev/null; then
    echo "  安装Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"

# 2. 解压项目（如果是tar包）
if [ -f "/home/ubuntu/ai-image-admin.tar.gz" ]; then
    echo "[2/6] 解压项目包..."
    cd /home/ubuntu
    rm -rf ai-image-admin
    tar -xzf ai-image-admin.tar.gz
    echo "  解压完成"
fi

# 3. 创建必要目录
echo "[3/6] 初始化目录..."
mkdir -p $APP_DIR/backend/uploads
chmod 755 $APP_DIR/backend/uploads

# 4. 安装依赖
echo "[4/6] 安装Node.js依赖..."
cd $APP_DIR/backend
npm install --production
echo "  依赖安装完成"

# 5. 安装并配置PM2
echo "[5/6] 配置PM2进程守护..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi
pm2 delete ai-image-admin 2>/dev/null || true
pm2 start server.js --name ai-image-admin --restart-delay=3000
pm2 save
# 配置开机自启
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true
echo "  PM2配置完成"

# 6. 开放防火墙
echo "[6/6] 配置防火墙..."
sudo ufw allow 3001/tcp 2>/dev/null || true

# 等待启动
sleep 2

# 验证
echo ""
echo "======================================"
echo " 验证部署结果"
echo "======================================"
HEALTH=$(curl -s http://localhost:3001/api/health 2>/dev/null)
if [ -n "$HEALTH" ]; then
    echo "✅ 服务运行正常: $HEALTH"
    echo ""
    echo "🌐 访问地址: http://43.138.174.2:3001"
    echo "⚙️  如需修改百度AI Key，编辑: $APP_DIR/backend/.env"
else
    echo "⚠️  服务可能未正常启动，查看日志:"
    pm2 logs ai-image-admin --lines 20
fi

pm2 list
