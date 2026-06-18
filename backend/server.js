const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 托管前端静态文件（解决 file:// 跨域问题）
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// 数据库初始化（lowdb - 纯JS JSON存储）
const adapter = new FileSync(path.join(__dirname, 'db.json'));
const db = low(adapter);
db.defaults({ images: [], categories: ['风景', '人物', '物品', '文档', '其他'], nextId: 1 }).write();

// 工具函数
function getNextId() {
  const id = db.get('nextId').value();
  db.set('nextId', id + 1).write();
  return id;
}

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // 处理中文文件名
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|bmp|webp/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = file.mimetype.startsWith('image/');
    if (extOk && mimeOk) cb(null, true);
    else cb(new Error('只支持图片格式 (jpeg/jpg/png/gif/bmp/webp)'));
  }
});

// 百度AI Token获取
let baiduToken = null;
let tokenExpiry = 0;

async function getBaiduToken() {
  if (baiduToken && Date.now() < tokenExpiry) return baiduToken;
  const apiKey = process.env.BAIDU_API_KEY;
  const secretKey = process.env.BAIDU_SECRET_KEY;
  if (!apiKey || !secretKey || apiKey === 'your_baidu_api_key_here') {
    throw new Error('百度AI API Key 未配置，请在 backend/.env 文件中填入真实的 BAIDU_API_KEY 和 BAIDU_SECRET_KEY');
  }
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json();
  if (data.error) throw new Error(`百度Token获取失败: ${data.error_description}`);
  baiduToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return baiduToken;
}

// 百度图像识别（三项能力）
async function analyzeImageWithBaidu(imagePath) {
  const token = await getBaiduToken();
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const results = {};

  // 1. 通用物体和场景识别
  try {
    const res = await fetch(`https://aip.baidubce.com/rest/2.0/image-classify/v2/advanced_general?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `image=${encodeURIComponent(base64Image)}&baike_num=0`
    });
    results.general = await res.json();
  } catch (e) {
    results.general = { error: e.message };
  }

  // 2. OCR通用文字识别
  try {
    const res = await fetch(`https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `image=${encodeURIComponent(base64Image)}&language_type=CHN_ENG`
    });
    results.ocr = await res.json();
  } catch (e) {
    results.ocr = { error: e.message };
  }

  // 3. 图像主体检测
  try {
    const res = await fetch(`https://aip.baidubce.com/rest/2.0/image-classify/v1/object_detect?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `image=${encodeURIComponent(base64Image)}`
    });
    results.object = await res.json();
  } catch (e) {
    results.object = { error: e.message };
  }

  return results;
}

// 整理分析结果
function parseAnalysisResults(rawResult) {
  const analysis = { objects: [], text: '', mainSubject: '', confidence: 0, summary: '' };

  if (rawResult.general && rawResult.general.result) {
    analysis.objects = rawResult.general.result.slice(0, 5).map(item => ({
      name: item.keyword,
      score: Math.round(item.score * 100)
    }));
    if (analysis.objects.length > 0) {
      analysis.mainSubject = analysis.objects[0].name;
      analysis.confidence = analysis.objects[0].score;
    }
  }

  if (rawResult.ocr && rawResult.ocr.words_result) {
    analysis.text = rawResult.ocr.words_result.map(w => w.words).join(' ');
  }

  const parts = [];
  if (analysis.mainSubject) parts.push(`主要内容：${analysis.mainSubject}`);
  if (analysis.objects.length > 1) {
    parts.push(`相关元素：${analysis.objects.slice(1, 4).map(o => o.name).join('、')}`);
  }
  if (analysis.text) {
    parts.push(`识别文字：${analysis.text.substring(0, 60)}${analysis.text.length > 60 ? '...' : ''}`);
  }
  analysis.summary = parts.join('；') || '识别完成，未找到明显对象';

  return analysis;
}

// ============ API 路由 ============

// 上传并分析图片
app.post('/api/images/upload', upload.array('images', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: '请选择图片文件' });
  }

  const uploaded = [];
  for (const file of req.files) {
    const id = getNextId();
    const record = {
      id, filename: file.filename, original_name: file.originalname,
      file_path: file.path, file_size: file.size, mime_type: file.mimetype,
      status: 'analyzing', ai_result: null, ai_analysis: null, tags: '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    db.get('images').push(record).write();
    uploaded.push({ id, filename: file.filename, originalName: file.originalname });
  }

  res.json({ success: true, message: `${uploaded.length} 张图片上传成功，AI分析进行中...`, data: uploaded });

  // 异步AI分析
  for (const item of uploaded) {
    const record = db.get('images').find({ id: item.id }).value();
    if (!record) continue;
    try {
      const rawResult = await analyzeImageWithBaidu(record.file_path);
      const analysis = parseAnalysisResults(rawResult);
      const tags = analysis.objects.map(o => o.name).join(',');
      db.get('images').find({ id: item.id }).assign({
        status: 'done', ai_result: rawResult, ai_analysis: analysis,
        tags, updated_at: new Date().toISOString()
      }).write();
    } catch (err) {
      db.get('images').find({ id: item.id }).assign({
        status: 'error', ai_analysis: { error: err.message },
        updated_at: new Date().toISOString()
      }).write();
      console.error(`[AI分析失败] ID=${item.id}:`, err.message);
    }
  }
});

// 获取图片列表
app.get('/api/images', (req, res) => {
  const { page = 1, pageSize = 12, search = '', status = '' } = req.query;
  let images = db.get('images').value().slice().reverse(); // 最新在前

  if (search) {
    const s = search.toLowerCase();
    images = images.filter(img =>
      img.original_name.toLowerCase().includes(s) ||
      (img.tags && img.tags.toLowerCase().includes(s))
    );
  }
  if (status) images = images.filter(img => img.status === status);

  const total = images.length;
  const pg = parseInt(page), ps = parseInt(pageSize);
  const paginated = images.slice((pg - 1) * ps, pg * ps);

  res.json({
    success: true,
    data: paginated.map(img => ({ ...img, url: `/uploads/${img.filename}` })),
    pagination: { total, page: pg, pageSize: ps, totalPages: Math.ceil(total / ps) }
  });
});

// 获取单张图片详情
app.get('/api/images/:id', (req, res) => {
  const img = db.get('images').find({ id: parseInt(req.params.id) }).value();
  if (!img) return res.status(404).json({ success: false, message: '图片不存在' });
  res.json({ success: true, data: { ...img, url: `/uploads/${img.filename}` } });
});

// 重新分析图片
app.post('/api/images/:id/reanalyze', async (req, res) => {
  const id = parseInt(req.params.id);
  const img = db.get('images').find({ id }).value();
  if (!img) return res.status(404).json({ success: false, message: '图片不存在' });

  db.get('images').find({ id }).assign({ status: 'analyzing', updated_at: new Date().toISOString() }).write();
  res.json({ success: true, message: '重新分析已启动' });

  try {
    const rawResult = await analyzeImageWithBaidu(img.file_path);
    const analysis = parseAnalysisResults(rawResult);
    const tags = analysis.objects.map(o => o.name).join(',');
    db.get('images').find({ id }).assign({ status: 'done', ai_result: rawResult, ai_analysis: analysis, tags, updated_at: new Date().toISOString() }).write();
  } catch (err) {
    db.get('images').find({ id }).assign({ status: 'error', ai_analysis: { error: err.message }, updated_at: new Date().toISOString() }).write();
  }
});

// 删除单张图片
app.delete('/api/images/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const img = db.get('images').find({ id }).value();
  if (!img) return res.status(404).json({ success: false, message: '图片不存在' });
  try { if (fs.existsSync(img.file_path)) fs.unlinkSync(img.file_path); } catch (e) {}
  db.get('images').remove({ id }).write();
  res.json({ success: true, message: '删除成功' });
});

// 批量删除
app.delete('/api/images', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ success: false, message: '请提供要删除的ID列表' });
  for (const rawId of ids) {
    const id = parseInt(rawId);
    const img = db.get('images').find({ id }).value();
    if (img) {
      try { if (fs.existsSync(img.file_path)) fs.unlinkSync(img.file_path); } catch (e) {}
      db.get('images').remove({ id }).write();
    }
  }
  res.json({ success: true, message: `已删除 ${ids.length} 张图片` });
});

// 统计数据
app.get('/api/stats', (req, res) => {
  const images = db.get('images').value();
  const total = images.length;
  const done = images.filter(i => i.status === 'done').length;
  const analyzing = images.filter(i => i.status === 'analyzing').length;
  const error = images.filter(i => i.status === 'error').length;
  const totalSize = images.reduce((s, i) => s + (i.file_size || 0), 0);
  res.json({ success: true, data: { total, done, analyzing, error, totalSize } });
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'AI图像管理后台运行正常', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 AI图像管理后台启动成功: http://localhost:${PORT}`);
  console.log(`📋 前端界面: 直接用浏览器打开 frontend/index.html`);
  console.log(`🔑 请确认 backend/.env 中已填入百度AI Key`);
});

module.exports = app;
