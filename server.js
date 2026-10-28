require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

// 允许所有跨域（混合部署时 Vercel 请求 Render 需要）
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ===== B站官方强制要求的安全响应头 =====
app.use((req, res, next) => {
    // 允许被直播姬的 iframe 嵌入
    res.setHeader('X-Frame-Options', 'ALLOW-FROM https://play-live.bilibili.com/');
    // 满足跨域隔离策略
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});

// 托管静态文件（如果同域部署）
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'playlist_data.json');

// ================= 本地数据存取接口 =================
app.get('/api/config', (req, res) => {
    if (fs.existsSync(DATA_FILE)) {
        res.json(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
    } else {
        // 兜底默认数据：如果 Render 休眠导致文件丢失，给一份默认的
        const defaultData = { 
            songs: "Rap / 卡点-壳,她,123,APT\n流行歌单 (一)-笼,你,骗,蓝\n儿歌歌单-勇气大爆发,快乐女孩", 
            theme: "cute-purple", 
            scroll: true, 
            speed: 70, 
            fontSize: 22, 
            width: 440, 
            height: 1000, 
            borderWidth: 10,
            staticCategory: "all"
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
        res.json(defaultData);
    }
});

app.post('/api/config', (req, res) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true, message: "保存成功" });
});

// ================= B站官方签名与鉴权 =================
function generateSignature(headers, secret) {
    const keys = Object.keys(headers).filter(k => k.startsWith('x-bili-')).sort();
    const signStr = keys.map(k => `${k}:${headers[k]}`).join('\n');
    return crypto.createHmac('sha256', secret).update(signStr).digest('hex').toLowerCase();
}

app.get('/api/bili/start', async (req, res) => {
    try {
        const { code, app_id, room_id, mid } = req.query;
        const headers = {
            'x-bili-accesskeyid': process.env.ACCESS_KEY_ID,
            'x-bili-content-md5': crypto.createHash('md5').update(JSON.stringify({ code })).digest('hex'),
            'x-bili-signature-method': 'HMAC-SHA256',
            'x-bili-signature-nonce': crypto.randomUUID(),
            'x-bili-signature-version': '2.0', 
            'x-bili-timestamp': Math.floor(Date.now() / 1000).toString()
        };
        const authorization = generateSignature(headers, process.env.ACCESS_KEY_SECRET);
        res.json({ success: true, headers, authorization });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 动态读取 Render 分配的端口
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ 后端服务已启动！运行在端口: ${PORT}`);
});