require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
// 针对 B站 iframe 环境，保持宽泛的跨域支持
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// B站官方要求的安全响应头（必须保留）
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'ALLOW-FROM https://play-live.bilibili.com/');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});

app.use(express.static(__dirname));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ================= 数据存取接口 =================
app.get('/api/config', async (req, res) => {
    try {
        const mid = req.query.mid;
        if (!mid) return res.status(400).json({ error: '缺少 mid 参数' });

        const { data, error } = await supabase.from('playlists').select('config').eq('mid', mid).single();

        if (error || !data || !data.config) {
            // 如果出错或为空，返回默认配置（防止前端白屏）
            return res.json({
                songs: "", theme: "cute-purple", scroll: true, speed: 70,
                fontSize: 22, width: 440, height: 1000, borderWidth: 10, staticCategory: "all"
            });
        }
        res.json(data.config);
    } catch (e) {
        console.error('读取异常:', e);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { mid, config } = req.body;
        if (!mid || !config) return res.status(400).json({ error: '参数不完整' });

        const { error } = await supabase.from('playlists').upsert(
            { mid, config, updated_at: new Date() }, 
            { onConflict: 'mid' }
        );

        if (error) {
            console.error('Supabase 保存失败:', error);
            return res.status(500).json({ error: '保存失败' });
        }
        res.json({ success: true, message: '保存成功' });
    } catch (e) {
        console.error('写入异常:', e);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// ================= B站官方签名（保留） =================
function generateSignature(headers, secret) {
    const keys = Object.keys(headers).filter(k => k.startsWith('x-bili-')).sort();
    const signStr = keys.map(k => `${k}:${headers[k]}`).join('\n');
    return crypto.createHmac('sha256', secret).update(signStr).digest('hex').toLowerCase();
}

app.get('/api/bili/start', async (req, res) => {
    try {
        const { code } = req.query;
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 后端服务已启动，运行在端口: ${PORT}`);
});
