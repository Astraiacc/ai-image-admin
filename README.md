# AI图像管理系统

基于**百度AI开放平台**的智能图像上传与分析后台管理系统。

## 功能特性

- 📤 **批量上传** — 支持拖拽上传，批量处理多张图片
- 🤖 **AI自动分析** — 上传后自动调用百度AI进行识别
  - 通用物体和场景识别（TOP5结果+置信度）
  - OCR文字识别（中英文）
  - 图像主体检测
- 🔍 **智能搜索** — 按文件名、AI标签快速检索
- 📊 **数据统计** — 实时显示总量、完成数、分析中、失败数
- 🗑️ **批量管理** — 支持批量删除、单张删除
- 🔄 **重新分析** — 支持对失败图片重新触发AI分析

## 快速启动

### 第1步：申请百度AI接口
1. 前往 https://ai.baidu.com/
2. 登录 → 控制台 → 创建应用
3. 勾选"图像识别"服务
4. 获取 **API Key** 和 **Secret Key**

### 第2步：配置密钥
编辑 `backend/.env` 文件：
```
BAIDU_API_KEY=你的APIKey
BAIDU_SECRET_KEY=你的SecretKey
```

### 第3步：启动后端
方式一（推荐）：双击运行 `start.bat`

方式二（手动）：
```bash
cd backend
npm install
npm start
```

### 第4步：打开前端
直接用浏览器打开 `frontend/index.html`

> 确保后端运行在 `http://localhost:3001`

## 目录结构

```
ai-image-admin/
├── backend/           # Node.js 后端
│   ├── server.js      # 主服务文件
│   ├── package.json   # 依赖配置
│   ├── .env           # 密钥配置（请勿提交到git）
│   ├── .env.example   # 配置模板
│   └── uploads/       # 上传图片存储目录
├── frontend/
│   └── index.html     # 前端管理面板
├── start.bat          # Windows一键启动脚本
└── README.md
```

## API接口说明

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/images/upload | 上传并分析图片（支持多文件） |
| GET | /api/images | 获取图片列表（支持分页/搜索/筛选） |
| GET | /api/images/:id | 获取单张图片详情（含AI结果） |
| POST | /api/images/:id/reanalyze | 重新触发AI分析 |
| DELETE | /api/images/:id | 删除单张图片 |
| DELETE | /api/images | 批量删除 |
| GET | /api/stats | 获取统计数据 |
| GET | /api/health | 健康检查 |

## 技术栈

- **后端**：Node.js + Express + SQLite（better-sqlite3）+ Multer
- **前端**：原生HTML/CSS/JavaScript（无框架依赖）
- **AI**：百度AI开放平台（图像识别 + OCR）
