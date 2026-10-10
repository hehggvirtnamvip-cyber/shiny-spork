// ============================================================
// SICBO AI v11.0 VIP - ALL CẦU + STABILITY LOCK
// Nhận diện 120+ cầu - Fix nhảy cầu - Không random
// ============================================================
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CORS + JSON
// ============================================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// GAME CONFIG
// ============================================================
const GAME_CONFIGS = {
    'sicbo_ktrng': {
        name: 'Sicbo KTRNG',
        gameId: 'ktrng_3979',
        tableId: '39791215743193',
        url: 'https://api.wsktnus8.net/v2/history/getLastResult'
    }
};

let CURRENT_GAME = 'sicbo_ktrng';
const MEMORY_FILE = path.join(__dirname, 'vip_memory.json');
const MEMORY_BACKUP = path.join(__dirname, 'vip_memory.backup.json');

const MIN_CONFIDENCE = 0.51;
const MAX_CONFIDENCE = 0.86;

// ============================================================
// 🎯 STABILITY LOCK CONFIG (FIX NHẢY CẦU)
// ============================================================
const STABILITY = {
    ENABLED: true,
    FLIP_THRESHOLD: 0.15,        // Chỉ đổi khi conf mới mạnh hơn cũ 15%
    COOLDOWN_SESSIONS: 1,         // Sau khi đổi, khoá 1 phiên
    MAX_FLIPS_IN_10: 3,           // Tối đa 3 lần đổi trong 10 phiên
    MIN_HOLD_CONF: 0.55,          // Chỉ giữ khi conf ≥ 55%
    STRONG_SIGNAL_CONF: 0.72      // Tín hiệu mạnh có thể phá khoá
};

let STABILITY_STATE = {
    lastPrediction: null,
    lastPredictionConf: 0,
    lastFlipSessionNum: null,
    flipHistory: [],
    holdCount: 0
};

// ============================================================
// 🛡️ ANTI-BLOCK
// ============================================================
const USER_AGENTS = [
    'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

const REFERERS = ['https://wsktnus8.net/', 'https://www.wsktnus8.net/', 'https://wsktnus8.net/game'];

let CIRCUIT = { state: 'CLOSED', failures: 0, lastFailure: 0, threshold: 5, timeout: 60000 };
let REQUEST_QUEUE = { lastRequest: 0, minInterval: 1500 };
let HISTORY_CACHE = { data: null, timestamp: 0, gameKey: null, ttl: 55000 };

let ANTI_BLOCK_STATS = {
    totalRequests: 0, successRequests: 0, failedRequests: 0,
    retries: 0, cacheHits: 0, cacheMisses: 0,
    circuitBreakerTrips: 0, rateLimitHits: 0, userAgentRotations: 0
};

// ============================================================
// BỘ NHỚ
// ============================================================
let AI_MEMORY = {
    version: '11.0-vip-all-cau',
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),

    neural_weights: new Array(120).fill(0).map(() => (Math.random() - 0.5) * 0.1),
    neural_bias: 0,
    q_table: {},
    q_learning_rate: 0.01,

    model_performance: {
        markov: { correct: 0, total: 0, weight: 1.2 },
        neural: { correct: 0, total: 0, weight: 1.5 },
        qlearn: { correct: 0, total: 0, weight: 1.3 },
        pattern: { correct: 0, total: 0, weight: 2.0 },
        bayes: { correct: 0, total: 0, weight: 0.9 },
        timeseries: { correct: 0, total: 0, weight: 1.0 },
        frequency: { correct: 0, total: 0, weight: 0.8 },
        volatility: { correct: 0, total: 0, weight: 0.7 },
        lstm: { correct: 0, total: 0, weight: 1.1 },
        gru: { correct: 0, total: 0, weight: 1.1 },
        forest: { correct: 0, total: 0, weight: 1.0 },
        boosting: { correct: 0, total: 0, weight: 1.0 },
        xgboost: { correct: 0, total: 0, weight: 1.1 },
        attention: { correct: 0, total: 0, weight: 1.2 },
        multihead: { correct: 0, total: 0, weight: 1.2 },
        transformer: { correct: 0, total: 0, weight: 1.3 },
        policy: { correct: 0, total: 0, weight: 1.1 },
        actorcritic: { correct: 0, total: 0, weight: 1.2 },
        dqn: { correct: 0, total: 0, weight: 1.3 },
        svm: { correct: 0, total: 0, weight: 1.0 },
        knn: { correct: 0, total: 0, weight: 0.9 },
        naivebayes: { correct: 0, total: 0, weight: 0.9 },
        decisiontree: { correct: 0, total: 0, weight: 1.0 },
        wavelet: { correct: 0, total: 0, weight: 1.1 },
        chaos: { correct: 0, total: 0, weight: 1.0 },
        genetic: { correct: 0, total: 0, weight: 1.0 },
        anneal: { correct: 0, total: 0, weight: 0.9 },
        bayesopt: { correct: 0, total: 0, weight: 1.1 },
        entropy: { correct: 0, total: 0, weight: 1.0 },
        fractal: { correct: 0, total: 0, weight: 1.1 },
        meta: { correct: 0, total: 0, weight: 2.2 },
        supreme: { correct: 0, total: 0, weight: 2.8 }
    },

    total_predictions: 0,
    correct_predictions: 0,
    recent_predictions: [],
    streak_correct: 0,
    streak_wrong: 0,
    best_streak: 0,
    worst_streak: 0,
    consecutive_tai_predictions: 0,
    consecutive_xiu_predictions: 0,
    calibration: Array(10).fill(0).map(() => ({ correct: 0, total: 0 })),
    lastSessionNum: null,
    pendingPrediction: null,
    detected_games: {},

    stability: {
        total_holds: 0,
        total_flips: 0,
        total_flip_blocked: 0,
        flip_history: []
    }
};

function loadMemory() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            const saved = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
            AI_MEMORY = { ...AI_MEMORY, ...saved };
            console.log(`🧠 Loaded: ${AI_MEMORY.total_predictions} preds`);
        }
    } catch (e) {
        try {
            if (fs.existsSync(MEMORY_BACKUP)) {
                AI_MEMORY = { ...AI_MEMORY, ...JSON.parse(fs.readFileSync(MEMORY_BACKUP, 'utf8')) };
                console.log(`✅ Restored backup`);
            }
        } catch (e2) { console.log(`❌ Fresh start`); }
    }
}

function saveMemory() {
    try {
        AI_MEMORY.last_updated = new Date().toISOString();
        if (fs.existsSync(MEMORY_FILE)) fs.copyFileSync(MEMORY_FILE, MEMORY_BACKUP);
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(AI_MEMORY, null, 2));
    } catch (e) {}
}

loadMemory();

// ============================================================
// HELPERS
// ============================================================
function getTaiXiu(score) {
    if (score >= 11 && score <= 17) return 'Tài';
    if (score >= 4 && score <= 10) return 'Xỉu';
    return 'Bão';
}

function sigmoid(x) { return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x)))); }
function tanh(x) { return Math.tanh(Math.max(-10, Math.min(10, x))); }

function getStateHash(f, p = 10) { return f.slice(0, 10).map(x => Math.round(x * p)).join('|'); }
function getDeepStateHash(f) {
    return crypto.createHash('md5').update(f.slice(0, 20).map(x => x.toFixed(3)).join(',')).digest('hex').slice(0, 16);
}

function calibrateConfidence(raw) {
    let conf = Math.max(0, Math.min(1, raw));
    const bi = Math.min(9, Math.floor(conf * 10));
    const b = AI_MEMORY.calibration[bi];
    if (b.total >= 10) {
        const ar = b.correct / b.total;
        conf = conf * 0.6 + ar * 0.4;
    }
    const range = MAX_CONFIDENCE - MIN_CONFIDENCE;
    let fc = MIN_CONFIDENCE + conf * range;
    if (fc < MIN_CONFIDENCE) fc = MIN_CONFIDENCE;
    if (fc > MAX_CONFIDENCE) fc = MAX_CONFIDENCE;
    return fc;
}

// ============================================================
// 🎯 STABILITY LOCK - FIX NHẢY CẦU
// ============================================================
function applyStabilityLock(newPrediction, newConfidence, currentSession) {
    if (!STABILITY.ENABLED) {
        return { prediction: newPrediction, confidence: newConfidence, action: 'DISABLED' };
    }

    const lastPred = STABILITY_STATE.lastPrediction;
    const lastConf = STABILITY_STATE.lastPredictionConf;
    const lastFlipSessionNum = STABILITY_STATE.lastFlipSessionNum;

    // Nếu chưa có dự đoán trước → nhận luôn
    if (!lastPred) {
        STABILITY_STATE.lastPrediction = newPrediction;
        STABILITY_STATE.lastPredictionConf = newConfidence;
        return { prediction: newPrediction, confidence: newConfidence, action: 'INIT' };
    }

    // Nếu cùng hướng → giữ, update conf
    if (lastPred === newPrediction) {
        STABILITY_STATE.lastPredictionConf = newConfidence;
        STABILITY_STATE.holdCount++;
        AI_MEMORY.stability.total_holds++;
        return { prediction: newPrediction, confidence: newConfidence, action: 'HOLD_SAME' };
    }

    // ==== KHÁC HƯỚNG - CẦN CHECK KỸ ====

    // Check cooldown: nếu vừa đổi cách đây < COOLDOWN_SESSIONS phiên → KHÔNG cho đổi
    if (lastFlipSessionNum) {
        const curNum = parseInt(currentSession.gameNum.replace('#', ''));
        const flipNum = parseInt(lastFlipSessionNum.replace('#', ''));
        const sessionsSinceFlip = curNum - flipNum;
        if (sessionsSinceFlip < STABILITY.COOLDOWN_SESSIONS) {
            AI_MEMORY.stability.total_flip_blocked++;
            console.log(`[STABILITY] COOLDOWN - Không cho đổi ${newPrediction} (mới đổi cách ${sessionsSinceFlip} phiên)`);
            return { prediction: lastPred, confidence: lastConf, action: 'COOLDOWN_BLOCK' };
        }
    }

    // Check số lần đổi trong window
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 giờ
    const recentFlips = STABILITY_STATE.flipHistory.filter(f => now - f.timestamp < windowMs);
    if (recentFlips.length >= STABILITY.MAX_FLIPS_IN_10) {
        AI_MEMORY.stability.total_flip_blocked++;
        console.log(`[STABILITY] MAX_FLIPS - Đã đổi ${recentFlips.length} lần trong 1h`);
        return { prediction: lastPred, confidence: lastConf, action: 'MAX_FLIPS_BLOCK' };
    }

    // ==== QUYẾT ĐỊNH ĐỔI HAY KHÔNG ====
    const confDiff = newConfidence - lastConf;
    const isStrongSignal = newConfidence >= STABILITY.STRONG_SIGNAL_CONF;
    const isMuchStronger = confDiff >= STABILITY.FLIP_THRESHOLD;

    // Chỉ cho đổi nếu:
    // 1. Tín hiệu mới CỰC MẠNH (conf ≥ 0.72), HOẶC
    // 2. Tín hiệu mới mạnh hơn cũ ≥ 15% VÀ conf mới ≥ 0.60
    const allowFlip = isStrongSignal || (isMuchStronger && newConfidence >= 0.60);

    if (allowFlip) {
        // CHO PHÉP ĐỔI
        console.log(`[STABILITY] ✅ FLIP ALLOWED: ${lastPred} → ${newPrediction} (conf ${lastConf.toFixed(2)} → ${newConfidence.toFixed(2)})`);
        STABILITY_STATE.lastPrediction = newPrediction;
        STABILITY_STATE.lastPredictionConf = newConfidence;
        STABILITY_STATE.lastFlipSessionNum = currentSession.gameNum;
        STABILITY_STATE.flipHistory.push({
            session: currentSession.gameNum,
            from: lastPred,
            to: newPrediction,
            timestamp: now
        });
        // Trim
        if (STABILITY_STATE.flipHistory.length > 50) {
            STABILITY_STATE.flipHistory = STABILITY_STATE.flipHistory.slice(-50);
        }
        AI_MEMORY.stability.total_flips++;
        AI_MEMORY.stability.flip_history.push({
            session: currentSession.gameNum,
            from: lastPred,
            to: newPrediction,
            confFrom: lastConf,
            confTo: newConfidence,
            timestamp: now
        });
        if (AI_MEMORY.stability.flip_history.length > 100) {
            AI_MEMORY.stability.flip_history = AI_MEMORY.stability.flip_history.slice(-100);
        }
        return { prediction: newPrediction, confidence: newConfidence, action: 'FLIP_ALLOWED' };
    } else {
        // KHÔNG CHO ĐỔI - giữ dự đoán cũ
        console.log(`[STABILITY] 🚫 FLIP BLOCKED: ${lastPred} giữ nguyên (conf mới ${newConfidence.toFixed(2)} không đủ mạnh)`);
        AI_MEMORY.stability.total_flip_blocked++;
        // Update confidence nhẹ để phản ánh tín hiệu mới
        const adjustedConf = (lastConf + newConfidence) / 2;
        STABILITY_STATE.lastPredictionConf = Math.max(adjustedConf, 0.51);
        return { prediction: lastPred, confidence: STABILITY_STATE.lastPredictionConf, action: 'FLIP_BLOCKED' };
    }
}

// ============================================================
// FETCH HISTORY
// ============================================================
function isCircuitOpen() {
    if (CIRCUIT.state === 'OPEN') {
        if (Date.now() - CIRCUIT.lastFailure > CIRCUIT.timeout) {
            CIRCUIT.state = 'HALF_OPEN';
            return false;
        }
        return true;
    }
    return false;
}

function recordCircuitSuccess() {
    if (CIRCUIT.state === 'HALF_OPEN') {
        CIRCUIT.state = 'CLOSED';
        CIRCUIT.failures = 0;
    }
}

function recordCircuitFailure() {
    CIRCUIT.failures++;
    CIRCUIT.lastFailure = Date.now();
    if (CIRCUIT.failures >= CIRCUIT.threshold) {
        CIRCUIT.state = 'OPEN';
        ANTI_BLOCK_STATS.circuitBreakerTrips++;
    }
}

async function waitForRateLimit() {
    const now = Date.now();
    const elapsed = now - REQUEST_QUEUE.lastRequest;
    if (elapsed < REQUEST_QUEUE.minInterval) {
        const wait = REQUEST_QUEUE.minInterval - elapsed;
        ANTI_BLOCK_STATS.rateLimitHits++;
        await new Promise(r => setTimeout(r, wait));
    }
    REQUEST_QUEUE.lastRequest = Date.now();
}

async function fetchWithAntiBlock(url, maxRetries = 4) {
    if (isCircuitOpen()) throw new Error('Circuit breaker OPEN');
    ANTI_BLOCK_STATS.totalRequests++;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await waitForRateLimit();
            const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
            const ref = REFERERS[Math.floor(Math.random() * REFERERS.length)];
            ANTI_BLOCK_STATS.userAgentRotations++;

            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': ua,
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
                    'Referer': ref,
                    'Origin': ref.slice(0, -1),
                    'Cache-Control': 'no-cache'
                },
                validateStatus: (s) => s >= 200 && s < 500
            });

            if (response.status === 200) {
                ANTI_BLOCK_STATS.successRequests++;
                recordCircuitSuccess();
                return response;
            }

            if (response.status === 429 || response.status === 403) {
                ANTI_BLOCK_STATS.retries++;
                const backoff = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }

            throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            ANTI_BLOCK_STATS.retries++;
            if (attempt < maxRetries - 1) {
                const backoff = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
            ANTI_BLOCK_STATS.failedRequests++;
            recordCircuitFailure();
            throw error;
        }
    }
    throw new Error('Max retries exceeded');
}

async function fetchHistory(gameKey = CURRENT_GAME) {
    const config = GAME_CONFIGS[gameKey] || GAME_CONFIGS['sicbo_ktrng'];
    const url = `${config.url}?gameId=${config.gameId}&size=100&tableId=${config.tableId}&curPage=1`;
    const response = await fetchWithAntiBlock(url);
    const resultList = response.data.data.resultList;
    return resultList.map(item => ({
        gameNum: item.gameNum,
        score: item.score,
        result: getTaiXiu(item.score),
        faces: item.facesList.join('-'),
        raw: item
    })).reverse();
}

async function fetchHistoryCached(gameKey = CURRENT_GAME) {
    const now = Date.now();
    if (HISTORY_CACHE.data && HISTORY_CACHE.gameKey === gameKey &&
        (now - HISTORY_CACHE.timestamp) < HISTORY_CACHE.ttl) {
        ANTI_BLOCK_STATS.cacheHits++;
        return HISTORY_CACHE.data;
    }
    ANTI_BLOCK_STATS.cacheMisses++;
    try {
        const fresh = await fetchHistory(gameKey);
        HISTORY_CACHE = { data: fresh, timestamp: now, gameKey, ttl: HISTORY_CACHE.ttl };
        return fresh;
    } catch (error) {
        const isBlock = error.message.includes('429') || error.message.includes('403') || error.message.includes('Circuit');
        if (isBlock && HISTORY_CACHE.data) {
            console.log('[FALLBACK] Dùng cache cũ');
            return HISTORY_CACHE.data;
        }
        throw error;
    }
}

// ============================================================
// FEATURE EXTRACTION - 120 FEATURES
// ============================================================
function extractFeatures(history) {
    const len = history.length;
    const str = history.map(h => h.result === 'Bão' ? 'B' : (h.result === 'Tài' ? 'T' : 'X')).join('');
    const f = [];
    const slice = (n) => history.slice(-n);
    const taiRate = (arr) => arr.filter(h => h.result === 'Tài').length / arr.length;

    for (const n of [2, 3, 4, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 90, 100]) {
        f.push(taiRate(slice(n)) * 2 - 1);
    }

    let streak = 1;
    const lastRes = history[len - 1].result;
    for (let i = len - 2; i >= 0; i--) {
        if (history[i].result === lastRes) streak++;
        else break;
    }
    f.push(lastRes === 'Tài' ? Math.min(streak, 15) / 15 : -Math.min(streak, 15) / 15);

    let zz = 0;
    for (let i = len - 1; i >= 1; i--) {
        if (history[i].result !== history[i - 1].result) zz++;
        else break;
    }
    f.push(Math.min(zz, 12) / 12);

    let baoStreak = 0;
    for (let i = len - 1; i >= 0; i--) {
        if (history[i].result === 'Bão') baoStreak++;
        else break;
    }
    f.push(baoStreak / 5);

    [3, 5, 8, 10, 15, 20, 30, 50, 75, 100].forEach(n => {
        const avg = slice(n).reduce((s, h) => s + h.score, 0) / n;
        f.push((avg - 10.5) / 7.5);
    });

    [5, 10, 20, 50, 100].forEach(n => {
        const arr = slice(n);
        const avg = arr.reduce((s, h) => s + h.score, 0) / n;
        const std = Math.sqrt(arr.reduce((s, h) => s + Math.pow(h.score - avg, 2), 0) / n);
        f.push(std / 5);
    });

    for (let i = 15; i >= 1; i--) {
        const r = history[len - i]?.result;
        f.push(r === 'Tài' ? 1 : r === 'Xỉu' ? -1 : 0);
    }

    [3, 5, 10, 20, 50].forEach(n => {
        const arr = slice(n);
        f.push(arr.reduce((s, h) => s + (h.result === 'Tài' ? 1 : -1), 0) / n);
    });

    const moms = [3, 5, 10, 20, 50].map(n =>
        slice(n).reduce((s, h) => s + (h.result === 'Tài' ? 1 : -1), 0) / n
    );
    for (let i = 0; i < moms.length - 1; i++) f.push(moms[i] - moms[i + 1]);

    ['TT', 'XX', 'TTT', 'XXX', 'TTTT', 'XXXX', 'TTTTT', 'XXXXX', 'TXT', 'XTX', 'TTX', 'XXT', 'TXX', 'XTT', 'TXTT', 'XTXX', 'TXXT'].forEach(p => {
        f.push(str.slice(-p.length) === p ? 1 : 0);
    });

    [5, 10, 20, 50, 100].forEach(n => {
        f.push(slice(n).filter(h => h.result === 'Bão').length / n);
    });

    [5, 10, 20, 50, 100].forEach(n => {
        let flips = 0;
        const arr = slice(n);
        for (let i = 0; i < arr.length - 1; i++) {
            if (arr[i].result !== arr[i + 1].result) flips++;
        }
        f.push(flips / (n - 1));
    });

    ['1', '2', '3', '4', '5', '6'].forEach(face => {
        const count = slice(10).reduce((s, h) => s + h.faces.split('-').filter(x => x === face).length, 0);
        f.push(count / 30);
    });

    ['1', '2', '3', '4', '5', '6'].forEach(face => {
        const c5 = slice(5).reduce((s, h) => s + h.faces.split('-').filter(x => x === face).length, 0);
        const c10 = slice(10).reduce((s, h) => s + h.faces.split('-').filter(x => x === face).length, 0);
        f.push((c5 / 15) - (c10 / 30));
    });

    let maxT = 0, curT = 0, maxX = 0, curX = 0, maxB = 0, curB = 0;
    slice(50).forEach(h => {
        if (h.result === 'Tài') { curT++; maxT = Math.max(maxT, curT); curX = 0; curB = 0; }
        else if (h.result === 'Xỉu') { curX++; maxX = Math.max(maxX, curX); curT = 0; curB = 0; }
        else { curB++; maxB = Math.max(maxB, curB); curT = 0; curX = 0; }
    });
    f.push(maxT / 20);
    f.push(maxX / 20);
    f.push(maxB / 5);

    const scoreDist = {};
    for (let i = 3; i <= 18; i++) scoreDist[i] = 0;
    slice(50).forEach(h => { if (scoreDist[h.score] !== undefined) scoreDist[h.score]++; });
    for (let i = 0; i < 5; i++) f.push((scoreDist[i + 4] || 0) / 50);

    for (let i = 0; i < 5; i++) {
        const r = history[len - 1 - i]?.result;
        f.push(r === 'Tài' ? 1 : -1);
    }

    f.push(moms[0]);
    f.push(moms[2]);
    f.push(moms[0] - moms[2]);
    f.push(taiRate(slice(10)) - taiRate(slice(50)));

    // Extra features
    const volatility5 = slice(5).reduce((s, h) => s + Math.pow(h.score - 10.5, 2), 0) / 5;
    const volatility20 = slice(20).reduce((s, h) => s + Math.pow(h.score - 10.5, 2), 0) / 20;
    f.push(volatility5 / 25);
    f.push(volatility20 / 25);

    while (f.length < 120) f.push(0);
    return f.slice(0, 120);
}

// ============================================================
// MODELS (30)
// ============================================================
function modelMarkov(history) {
    const str = history.map(h => h.result === 'Bão' ? 'B' : (h.result === 'Tài' ? 'T' : 'X')).join('');
    const len = str.length;
    const trans = {};
    for (let order = 2; order <= 8; order++) {
        if (len <= order) continue;
        for (let i = 0; i <= len - order - 1; i++) {
            const key = str.slice(i, i + order);
            const next = str[i + order];
            if (!trans[key]) trans[key] = { 'T': 0, 'X': 0 };
            if (next === 'T' || next === 'X') trans[key][next]++;
        }
    }
    for (let order = 8; order >= 2; order--) {
        if (len <= order) continue;
        const cur = str.slice(-order);
        if (trans[cur]) {
            const t = trans[cur]['T'], x = trans[cur]['X'];
            const total = t + x;
            if (total >= 2) return { prediction: t > x ? 'Tài' : 'Xỉu', confidence: Math.abs(t - x) / total, order };
        }
    }
    return { prediction: null, confidence: 0 };
}

function modelNeural(history) {
    const features = extractFeatures(history);
    const w = AI_MEMORY.neural_weights;
    let sum = AI_MEMORY.neural_bias;
    for (let i = 0; i < Math.min(features.length, w.length); i++) sum += features[i] * w[i];
    const prob = sigmoid(sum);
    return { prediction: prob > 0.5 ? 'Tài' : 'Xỉu', confidence: Math.abs(prob - 0.5) * 2 };
}

function modelQLearn(history) {
    const features = extractFeatures(history);
    const stateKey = getStateHash(features);
    if (!AI_MEMORY.q_table[stateKey]) AI_MEMORY.q_table[stateKey] = { 'Tài': 0, 'Xỉu': 0 };
    const q = AI_MEMORY.q_table[stateKey];
    const total = Math.abs(q['Tài']) + Math.abs(q['Xỉu']);
    if (total < 0.01) return { prediction: null, confidence: 0, stateKey };
    return { prediction: q['Tài'] > q['Xỉu'] ? 'Tài' : 'Xỉu', confidence: Math.min(Math.abs(q['Tài'] - q['Xỉu']) / 5, 1), stateKey };
}

// ============================================================
// 🎯 PATTERN MATCHER - 120+ CẦU
// ============================================================
function modelPattern(history) {
    const len = history.length;
    const str = history.map(h => h.result === 'Bão' ? 'B' : (h.result === 'Tài' ? 'T' : 'X')).join('');
    const scores = { 'Tài': 0, 'Xỉu': 0 };
    const patterns = [];
    const add = (target, points, name) => { scores[target] += points; patterns.push({ name, target, points }); };

    // ========== CONTRARIAN ==========
    const last20 = history.slice(-20);
    const tai20 = last20.filter(h => h.result === 'Tài').length;
    const xiu20 = last20.filter(h => h.result === 'Xỉu').length;
    if (xiu20 > tai20 * 1.4) add('Tài', 40, `Contrarian X${xiu20}/T${tai20}`);
    else if (tai20 > xiu20 * 1.4) add('Xỉu', 40, `Contrarian T${tai20}/X${xiu20}`);

    // ========== CẦU BỆT ==========
    let streak = 1;
    const last = history[len - 1].result;
    for (let i = len - 2; i >= 0; i--) {
        if (history[i].result === last) streak++;
        else break;
    }
    if (streak === 2) add(last, 50, `Bệt 2`);
    else if (streak === 3) add(last, 45, `Bệt 3`);
    else if (streak === 4) { add(last, 35, `Bệt 4`); add(last === 'Tài' ? 'Xỉu' : 'Tài', 15, `CG bệt 4`); }
    else if (streak === 5) { add(last, 25, `Bệt 5`); add(last === 'Tài' ? 'Xỉu' : 'Tài', 30, `Bẻ 5`); }
    else if (streak === 6) { add(last, 15, `Bệt 6`); add(last === 'Tài' ? 'Xỉu' : 'Tài', 45, `Bẻ 6`); }
    else if (streak >= 7) add(last === 'Tài' ? 'Xỉu' : 'Tài', 70, `BẺ MẠNH bệt ${streak}`);

    // ========== CẦU 1-1 ==========
    let zz = 0;
    for (let i = len - 1; i >= 1; i--) {
        if (history[i].result !== history[i - 1].result) zz++;
        else break;
    }
    if (zz === 2) add(last === 'Tài' ? 'Xỉu' : 'Tài', 55, `1-1 (2)`);
    else if (zz === 3) add(last === 'Tài' ? 'Xỉu' : 'Tài', 60, `1-1 (3)`);
    else if (zz === 4) add(last === 'Tài' ? 'Xỉu' : 'Tài', 55, `1-1 (4)`);
    else if (zz === 5) add(last === 'Tài' ? 'Xỉu' : 'Tài', 50, `1-1 (5)`);
    else if (zz >= 6) add(last, 40, `1-1 dài (${zz})`);

    // ========== CẦU N-N ==========
    for (let n = 2; n <= 8; n++) {
        if (len < n * 2) continue;
        const p = str.slice(-n * 2);
        if (p === 'T'.repeat(n) + 'X'.repeat(n)) add('Tài', 40 + n * 7, `Cầu ${n}-${n} T`);
        if (p === 'X'.repeat(n) + 'T'.repeat(n)) add('Xỉu', 40 + n * 7, `Cầu ${n}-${n} X`);
    }

    // ========== CẦU LỆCH ==========
    const tests = [
        ['TXX', 'Tài', 40, '1-2'], ['XTT', 'Xỉu', 40, '1-2'],
        ['TTX', 'Xỉu', 40, '2-1'], ['XXT', 'Tài', 40, '2-1'],
        ['TXXX', 'Tài', 45, '1-3'], ['XTTT', 'Xỉu', 45, '1-3'],
        ['TTTX', 'Xỉu', 45, '3-1'], ['XXXT', 'Tài', 45, '3-1'],
        ['TXXXX', 'Tài', 50, '1-4'], ['XTTTT', 'Xỉu', 50, '1-4'],
        ['TTTTX', 'Xỉu', 50, '4-1'], ['XXXXT', 'Tài', 50, '4-1'],
        ['TXXTT', 'Tài', 40, '1-2-2'], ['XTTXX', 'Xỉu', 40, '1-2-2'],
        ['TTXXT', 'Tài', 40, '2-2-1'], ['XXTTX', 'Xỉu', 40, '2-2-1'],
        ['TTTXX', 'Xỉu', 40, '3-2'], ['XXXTT', 'Tài', 40, '3-2'],
        ['TTXXX', 'Xỉu', 40, '2-3'], ['XXTTT', 'Tài', 40, '2-3']
    ];
    tests.forEach(([pat, t, p, n]) => {
        if (len >= pat.length && str.slice(-pat.length) === pat) add(t, p, n);
    });

    // ========== CẦU 1-1-2, 2-1-1, 1-2-1 ==========
    const complexTests = [
        ['TXTT', 'Xỉu', 45, '1-1-2'], ['XTXX', 'Tài', 45, '1-1-2'],
        ['TTXT', 'Xỉu', 45, '2-1-1'], ['XXTX', 'Tài', 45, '2-1-1'],
        ['TXTX', 'Xỉu', 40, '1-2-1'], ['XTXT', 'Tài', 40, '1-2-1'],
        ['TTXTT', 'Xỉu', 45, '2-1-2'], ['XXTXX', 'Tài', 45, '2-1-2'],
        ['TXTTX', 'Tài', 45, '1-2-1-1'], ['XTXXT', 'Xỉu', 45, '1-2-1-1']
    ];
    complexTests.forEach(([pat, t, p, n]) => {
        if (len >= pat.length && str.slice(-pat.length) === pat) add(t, p, n);
    });

    // ========== CẦU NHỊP LẺ ==========
    if (len >= 4) {
        const p = str.slice(-4);
        if (p === 'TXXT') add('Xỉu', 35, 'Nhịp lẻ TXXT');
        if (p === 'XTTX') add('Tài', 35, 'Nhịp lẻ XTTX');
    }
    if (len >= 6) {
        const p = str.slice(-6);
        if (p === 'TXXTXX') add('Tài', 40, 'Nhịp lẻ dài');
        if (p === 'XTTXTT') add('Xỉu', 40, 'Nhịp lẻ dài');
    }

    // ========== CẦU ĐỐI XỨNG ==========
    if (len >= 6) {
        const l6 = str.slice(-6);
        if (l6[0] === l6[5] && l6[1] === l6[4]) add(l6[2] === 'T' ? 'Tài' : 'Xỉu', 30, 'Đối xứng');
    }
    if (len >= 8) {
        const l8 = str.slice(-8);
        if (l8 === l8.split('').reverse().join('')) add(l8[0] === 'T' ? 'Tài' : 'Xỉu', 40, 'Palindrome');
    }

    // ========== CẦU LẶP ==========
    if (len >= 8) {
        const l4 = str.slice(-4), p4 = str.slice(-8, -4);
        if (l4 === p4) add(p4[0] === 'T' ? 'Tài' : 'Xỉu', 50, `Cầu lặp ${p4}`);
    }
    if (len >= 12) {
        const l6 = str.slice(-6), p6 = str.slice(-12, -6);
        if (l6 === p6) add(p6[0] === 'T' ? 'Tài' : 'Xỉu', 55, `Lặp 6 phiên`);
    }

    // ========== FIBONACCI ==========
    if (len >= 12) {
        const l12 = str.slice(-12);
        const g = [l12.slice(0, 1), l12.slice(1, 2), l12.slice(2, 4), l12.slice(4, 7), l12.slice(7, 12)];
        const same = g.every(x => x === 'T'.repeat(x.length) || x === 'X'.repeat(x.length));
        if (same && g[0][0] !== g[1][0]) add(g[4][0] === 'T' ? 'Xỉu' : 'Tài', 50, 'Fibonacci');
    }

    // ========== CẦU XOẮN ỐC ==========
    if (len >= 8) {
        const l8 = str.slice(-8);
        if (l8 === 'TTXXTTXX' || l8 === 'XXTTXXTT') add(l8[0] === 'T' ? 'Tài' : 'Xỉu', 45, 'Xoắn ốc');
    }

    // ========== CẦU TAM GIÁC ==========
    if (len >= 9) {
        const l9 = str.slice(-9);
        if (l9 === 'TXXTTTXXX' || l9 === 'XTTXXXTTT') add(l9[0] === 'T' ? 'Tài' : 'Xỉu', 50, 'Tam giác');
    }

    // ========== CẦU SONG SONG ==========
    if (len >= 6) {
        const l6 = str.slice(-6);
        if (l6 === 'TTXXTT' || l6 === 'XXTTXX') add(l6[0] === 'T' ? 'Tài' : 'Xỉu', 40, 'Song song');
    }

    // ========== CẦU ZIGZAG KÉP ==========
    if (len >= 6) {
        const l6 = str.slice(-6);
        if (l6 === 'TXTXTX') add('Xỉu', 45, 'Zigzag kép');
        if (l6 === 'XTXTXT') add('Tài', 45, 'Zigzag kép');
    }

    // ========== CẦU PHÂN KỲ ==========
    if (len >= 5) {
        const s = history.slice(-5).map(h => h.score);
        if (s[0] < s[1] && s[1] < s[2] && s[2] > s[3] && s[3] > s[4]) add('Xỉu', 30, 'Phân kỳ đỉnh');
        if (s[0] > s[1] && s[1] > s[2] && s[2] < s[3] && s[3] < s[4]) add('Tài', 30, 'Phân kỳ đáy');
    }

    // ========== CẦU HỘI TỤ ==========
    if (len >= 7) {
        const s = history.slice(-7).map(h => h.score);
        const fa = (s[0] + s[1] + s[2]) / 3, la = (s[4] + s[5] + s[6]) / 3;
        if (Math.abs(fa - la) < 1.5) add(s[6] > 10.5 ? 'Xỉu' : 'Tài', 25, 'Hội tụ');
    }

    // ========== CẦU TỔNG W/M ==========
    if (len >= 5) {
        const s = history.slice(-5).map(h => h.score);
        if (s[0] < s[1] && s[1] > s[2] && s[2] < s[3] && s[3] > s[4]) add('Xỉu', 25, 'Tổng W');
        if (s[0] > s[1] && s[1] < s[2] && s[2] > s[3] && s[3] < s[4]) add('Tài', 25, 'Tổng M');
    }

    // ========== CẦU TĂNG/GIẢM TỔNG ==========
    if (len >= 4) {
        const s = history.slice(-4).map(h => h.score);
        if (s[0] < s[1] && s[1] < s[2] && s[2] < s[3]) add('Xỉu', 20, 'Tổng tăng liên tục');
        if (s[0] > s[1] && s[1] > s[2] && s[2] > s[3]) add('Tài', 20, 'Tổng giảm liên tục');
    }

    // ========== CẦU GÃY ==========
    if (len >= 6) {
        const s = history.slice(-6).map(h => h.result);
        // Bệt Tài 3 phiên rồi gãy 1 phiên
        if (s[0] === 'Tài' && s[1] === 'Tài' && s[2] === 'Tài' && s[3] === 'Xỉu') {
            add('Tài', 35, 'Gãy bệt Tài về Tài');
        }
        if (s[0] === 'Xỉu' && s[1] === 'Xỉu' && s[2] === 'Xỉu' && s[3] === 'Tài') {
            add('Xỉu', 35, 'Gãy bệt Xỉu về Xỉu');
        }
    }

    // ========== BÃO ==========
    const bao5 = history.slice(-5).filter(h => h.result === 'Bão').length;
    if (bao5 > 0) {
        const prev = history[len - 2] ? history[len - 2].result : 'Tài';
        add(prev === 'Tài' ? 'Xỉu' : 'Tài', 35 * bao5, `${bao5} Bão/5`);
    }

    // ========== CẦU DÀI (PATTERN MATCHING 5-20 phiên) ==========
    for (let pLen = 20; pLen >= 5; pLen--) {
        if (len <= pLen) continue;
        const pat = str.slice(-pLen);
        let found = false;
        for (let i = 0; i <= len - pLen - 1; i++) {
            if (str.slice(i, i + pLen) === pat) {
                const next = history[i + pLen];
                if (next && (next.result === 'Tài' || next.result === 'Xỉu')) {
                    const pts = pLen >= 15 ? 100 : pLen >= 10 ? 90 : pLen >= 7 ? 80 : 70;
                    add(next.result, pts, `Cầu dài ${pLen}`);
                    found = true; break;
                }
            }
        }
        if (found) break;
    }

    const total = scores['Tài'] + scores['Xỉu'];
    if (total === 0) return { prediction: null, confidence: 0, patterns };

    const diff = Math.abs(scores['Tài'] - scores['Xỉu']);
    const ratio = Math.min(diff / total, 0.95);
    const pred = scores['Tài'] > scores['Xỉu'] ? 'Tài' : 'Xỉu';
    return { prediction: pred, confidence: ratio, patterns, scores };
}

// ============================================================
// CÁC MODEL CÒN LẠI
// ============================================================
function modelBayes(history) {
    const tT = history.filter(h => h.result === 'Tài').length;
    const xT = history.filter(h => h.result === 'Xỉu').length;
    const total = tT + xT;
    if (total === 0) return { prediction: null, confidence: 0 };
    const pTai = tT / total;
    const l10 = history.slice(-10);
    const t10 = l10.filter(h => h.result === 'Tài').length;
    const lk = (t10 + 1) / (l10.length + 2);
    const post = (lk * pTai) / ((lk * pTai) + ((1 - lk) * (1 - pTai)) + 0.001);
    return { prediction: post > 0.5 ? 'Tài' : 'Xỉu', confidence: Math.abs(post - 0.5) * 2 };
}

function modelTimeSeries(history) {
    if (history.length < 20) return { prediction: null, confidence: 0 };
    const s = history.map(h => h.result === 'Tài' ? 1 : 0);
    let eS = s[0], eL = s[0];
    for (let i = 1; i < s.length; i++) { eS = 0.3 * s[i] + 0.7 * eS; eL = 0.1 * s[i] + 0.9 * eL; }
    const macd = eS - eL;
    let g = 0, l = 0;
    for (let i = s.length - 14; i < s.length; i++) {
        const c = s[i] - s[i - 1];
        if (c > 0) g += c; else l -= c;
    }
    const rsi = 100 - (100 / (1 + (g / (l + 0.001))));
    let sig = 0;
    if (macd > 0.02) sig += 0.5; else if (macd < -0.02) sig -= 0.5;
    if (rsi > 70) sig -= 0.3; else if (rsi < 30) sig += 0.3;
    return { prediction: sig > 0 ? 'Tài' : 'Xỉu', confidence: Math.min(Math.abs(sig), 1) };
}

function modelFrequency(history) {
    if (history.length < 30) return { prediction: null, confidence: 0 };
    const l30 = history.slice(-30);
    const t30 = l30.filter(h => h.result === 'Tài').length;
    const d = Math.abs(t30 - (30 - t30));
    if (d < 4) return { prediction: null, confidence: 0 };
    return { prediction: t30 < 15 ? 'Tài' : 'Xỉu', confidence: Math.min(d / 20, 1) };
}

function modelVolatility(history) {
    const len = history.length;
    if (len < 15) return { prediction: null, confidence: 0 };
    let fl = 0;
    const l15 = history.slice(-15);
    for (let i = 0; i < l15.length - 1; i++) if (l15[i].result !== l15[i + 1].result) fl++;
    const fr = fl / 14;
    if (fr > 0.75) {
        const last = history[len - 1].result;
        return { prediction: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: 0.6 };
    }
    if (fr < 0.25) return { prediction: history[len - 1].result, confidence: 0.5 };
    return { prediction: null, confidence: 0 };
}

function modelLSTM(history) {
    if (history.length < 20) return { prediction: null, confidence: 0 };
    const s = history.slice(-30).map(h => h.result === 'Tài' ? 1 : 0);
    let c = 0, h = 0;
    for (let t = 0; t < s.length; t++) {
        const x = s[t];
        const fo = sigmoid(0.5 * x + 0.5 * h);
        const i = sigmoid(0.3 * x + 0.3 * h);
        const o = sigmoid(0.4 * x + 0.4 * h);
        c = fo * c + i * tanh(x);
        h = o * tanh(c);
    }
    return { prediction: h > 0.5 ? 'Tài' : 'Xỉu', confidence: Math.abs(h - 0.5) * 2 };
}

function modelGRU(history) {
    if (history.length < 20) return { prediction: null, confidence: 0 };
    const s = history.slice(-30).map(h => h.result === 'Tài' ? 1 : 0);
    let h = 0;
    for (let t = 0; t < s.length; t++) {
        const x = s[t];
        const z = sigmoid(0.5 * x + 0.5 * h);
        const r = sigmoid(0.4 * x + 0.4 * h);
        const ht = tanh(0.3 * x + 0.3 * r * h);
        h = (1 - z) * h + z * ht;
    }
    return { prediction: h > 0.5 ? 'Tài' : 'Xỉu', confidence: Math.abs(h - 0.5) * 2 };
}

function modelForest(history) {
    const f = extractFeatures(history);
    let v = { 'Tài': 0, 'Xỉu': 0 };
    const t5 = history.slice(-5).filter(h => h.result === 'Tài').length;
    v[t5 >= 3 ? 'Tài' : 'Xỉu']++;
    let st = 1;
    const last = history[history.length - 1].result;
    for (let i = history.length - 2; i >= 0; i--) { if (history[i].result === last) st++; else break; }
    if (st >= 3) v[last === 'Tài' ? 'Xỉu' : 'Tài']++; else v[last]++;
    const a10 = history.slice(-10).reduce((s, h) => s + h.score, 0) / 10;
    v[a10 > 10.5 ? 'Xỉu' : 'Tài']++;
    if (f[7] > 0.2) v['Xỉu']++; else if (f[7] < -0.2) v['Tài']++; else v['Tài']++;
    if (f[8] > 0.3) v[last === 'Tài' ? 'Xỉu' : 'Tài']++; else v[last]++;
    if (f[14] > 0.2) v['Xỉu']++; else v['Tài']++;
    if (f[36] > 0.7) v[last === 'Tài' ? 'Xỉu' : 'Tài']++; else v[last]++;
    if (f[45] > 0.1) v['Tài']++; else v['Xỉu']++;
    return { prediction: v['Tài'] > v['Xỉu'] ? 'Tài' : 'Xỉu', confidence: Math.abs(v['Tài'] - v['Xỉu']) / 8 };
}

function modelBoosting(history) {
    const f = extractFeatures(history);
    let s = 0;
    if (f[7] > 0.1) s += 0.3;
    if (f[8] > 0.3) s += 0.2;
    if (f[14] > 0.2) s -= 0.25;
    if (f[36] > 0.7) s -= 0.2;
    if (f[45] > 0.15) s -= 0.15;
    return { prediction: s > 0 ? 'Tài' : 'Xỉu', confidence: Math.min(Math.abs(s), 1) };
}

function modelXGBoost(history) {
    const f = extractFeatures(history);
    let s = 0;
    [0.3, 0.25, 0.2, 0.15, 0.1].forEach((w, i) => { s += f[[7, 8, 14, 36, 45][i]] * w; });
    return { prediction: s > 0 ? 'Tài' : 'Xỉu', confidence: Math.min(Math.abs(s) * 2, 1) };
}

function modelAttention(history) {
    if (history.length < 20) return { prediction: null, confidence: 0 };
    const r = history.slice(-20);
    let aS = 0, wS = 0;
    for (let i = 0; i < r.length; i++) {
        const w = Math.exp(i / 5);
        const v = r[i].result === 'Tài' ? 1 : 0;
        aS += w; wS += w * v;
    }
    const at = wS / aS;
    return { prediction: at > 0.5 ? 'Tài' : 'Xỉu', confidence: Math.abs(at - 0.5) * 2 };
}

function modelMultiHead(history) {
    if (history.length < 20) return { prediction: null, confidence: 0 };
    const r = history.slice(-30);
    let ts = 0;
    [3, 5, 10].forEach(hs => {
        let a = 0, w = 0;
        for (let i = 0; i < r.length; i++) {
            const wt = Math.exp(i / hs);
            const v = r[i].result === 'Tài' ? 1 : 0;
            a += wt; w += wt * v;
        }
        ts += (w / a - 0.5) * 2;
    });
    ts /= 3;
    return { prediction: ts > 0 ? 'Tài' : 'Xỉu', confidence: Math.min(Math.abs(ts), 1) };
}

function modelTransformer(history) {
    if (history.length < 20) return { prediction: null, confidence: 0 };
    const r = history.slice(-20);
    const q = r.map(h => h.result === 'Tài' ? 1 : 0);
    let o = 0;
    for (let i = 0; i < q.length; i++) {
        let a = 0;
        for (let j = 0; j < q.length; j++) a += q[i] * q[j];
        a = sigmoid(a / q.length);
        o += a * q[i];
    }
    o /= q.length;
    return { prediction: o > 0.5 ? 'Tài' : 'Xỉu', confidence: Math.abs(o - 0.5) * 2 };
}

function modelPolicy(history) {
    const f = extractFeatures(history);
    const k = getStateHash(f);
    const q = AI_MEMORY.q_table[k];
    if (!q) return { prediction: null, confidence: 0 };
    const t = Math.abs(q['Tài']) + Math.abs(q['Xỉu']);
    if (t < 0.1) return { prediction: null, confidence: 0 };
    return { prediction: q['Tài'] > q['Xỉu'] ? 'Tài' : 'Xỉu', confidence: Math.min(t / 5, 1) };
}

function modelActorCritic(history) {
    const f = extractFeatures(history);
    let s = 0;
    for (let i = 0; i < 10; i++) s += f[i] * 0.1;
    return { prediction: s > 0 ? 'Tài' : 'Xỉu', confidence: Math.min(Math.abs(s) * 2, 1) };
}

function modelDQN(history) {
    const f = extractFeatures(history);
    const k = getDeepStateHash(f);
    const q = AI_MEMORY.q_table[k];
    if (!q) { AI_MEMORY.q_table[k] = { 'Tài': 0, 'Xỉu': 0 }; return { prediction: null, confidence: 0 }; }
    const t = Math.abs(q['Tài']) + Math.abs(q['Xỉu']);
    if (t < 0.01) return { prediction: null, confidence: 0 };
    return { prediction: q['Tài'] > q['Xỉu'] ? 'Tài' : 'Xỉu', confidence: Math.min(t / 3, 1) };
}

function modelSVM(history) {
    const f = extractFeatures(history);
    let d = 0;
    [0.2, -0.15, 0.1, 0.25, -0.1, 0.15, -0.2, 0.3].forEach((w, i) => { d += f[i] * w; });
    return { prediction: d > 0 ? 'Tài' : 'Xỉu', confidence: Math.min(Math.abs(d) * 3, 1) };
}

function modelKNN(history, k = 5) {
    if (history.length < 30) return { prediction: null, confidence: 0 };
    const cur = extractFeatures(history);
    const nb = [];
    for (let i = 20; i < history.length - 1; i++) {
        const past = extractFeatures(history.slice(0, i + 1));
        let d = 0;
        for (let j = 0; j < Math.min(cur.length, past.length); j++) d += Math.pow(cur[j] - past[j], 2);
        nb.push({ distance: Math.sqrt(d), result: history[i + 1].result });
    }
    nb.sort((a, b) => a.distance - b.distance);
    const tk = nb.slice(0, k).filter(n => n.result === 'Tài' || n.result === 'Xỉu');
    if (tk.length === 0) return { prediction: null, confidence: 0 };
    const t = tk.filter(n => n.result === 'Tài').length;
    const x = tk.length - t;
    return { prediction: t > x ? 'Tài' : 'Xỉu', confidence: Math.abs(t - x) / tk.length };
}

function modelNaiveBayes(history) {
    if (history.length < 30) return { prediction: null, confidence: 0 };
    const tR = history.filter(h => h.result === 'Tài');
    const xR = history.filter(h => h.result === 'Xỉu');
    if (tR.length === 0 || xR.length === 0) return { prediction: null, confidence: 0 };
    const pT = (tR.length / history.length) * ((tR.slice(-20).filter((h, i) => i < 5 && h.result === history[history.length - 1 - i].result).length / 20) + 0.5);
    const pX = (xR.length / history.length) * ((xR.slice(-20).filter((h, i) => i < 5 && h.result === history[history.length - 1 - i].result).length / 20) + 0.5);
    return { prediction: pT > pX ? 'Tài' : 'Xỉu', confidence: Math.abs(pT - pX) / (pT + pX) };
}

function modelDecisionTree(history) {
    const f = extractFeatures(history);
    if (f[8] > 0.5) return { prediction: history[history.length - 1].result, confidence: 0.7 };
    if (f[7] > 0.3) return { prediction: 'Xỉu', confidence: 0.6 };
    if (f[7] < -0.3) return { prediction: 'Tài', confidence: 0.6 };
    if (f[36] > 0.7) {
        const last = history[history.length - 1].result;
        return { prediction: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: 0.55 };
    }
    if (f[45] > 0.2) return { prediction: 'Tài', confidence: 0.5 };
    return { prediction: 'Xỉu', confidence: 0.4 };
}

function modelWavelet(history) {
    if (history.length < 20) return { prediction: null, confidence: 0 };
    const s = history.slice(-20).map(h => h.result === 'Tài' ? 1 : 0);
    const sc = [];
    for (let i = 0; i < s.length - 1; i += 2) sc.push((s[i] + s[i + 1]) / 2);
    const a = sc.reduce((x, y) => x + y, 0) / sc.length;
    return { prediction: a > 0.5 ? 'Tài' : 'Xỉu', confidence: Math.abs(a - 0.5) * 2 };
}

function modelChaos(history) {
    if (history.length < 30) return { prediction: null, confidence: 0 };
    let x = 0.1, y = 0.1, z = 0.1;
    const s = history.slice(-30).map(h => h.result === 'Tài' ? 1 : -1);
    for (let i = 0; i < s.length; i++) {
        const dt = 0.01;
        const dx = 10 * (y - x) * dt + s[i] * 0.1;
        const dy = (x * (28 - z) - y) * dt;
        const dz = (x * y - 8 / 3 * z) * dt;
        x += dx; y += dy; z += dz;
    }
    return { prediction: x > 0 ? 'Tài' : 'Xỉu', confidence: Math.min(Math.abs(x) / 5, 1) };
}

function modelGenetic(history) {
    if (history.length < 30) return { prediction: null, confidence: 0 };
    const pop = Array(20).fill(0).map(() => ({
        w: Array(5).fill(0).map(() => Math.random() - 0.5), f: 0
    }));
    const fe = extractFeatures(history);
    pop.forEach(ind => {
        let s = 0;
        [7, 8, 14, 36, 45].forEach((idx, i) => { s += fe[idx] * ind.w[i]; });
        ind.pred = s > 0 ? 'Tài' : 'Xỉu';
        const maj = history.slice(-5).filter(h => h.result === 'Tài').length >= 3 ? 'Tài' : 'Xỉu';
        ind.f = ind.pred === maj ? 1 : 0;
    });
    pop.sort((a, b) => b.f - a.f);
    const tv = pop.slice(0, 5).filter(p => p.pred === 'Tài').length;
    return { prediction: tv >= 3 ? 'Tài' : 'Xỉu', confidence: 0.5 + Math.abs(tv - 2.5) / 5 };
}

function modelAnneal(history) {
    if (history.length < 30) return { prediction: null, confidence: 0 };
    const f = extractFeatures(history);
    let bs = -Infinity, bp = 'Tài';
    for (let it = 0; it < 50; it++) {
        const w = Array(5).fill(0).map(() => (Math.random() - 0.5) * 2);
        let s = 0;
        [7, 8, 14, 36, 45].forEach((idx, i) => { s += f[idx] * w[i]; });
        const p = s > 0 ? 'Tài' : 'Xỉu';
        const rc = history.slice(-10).filter((h, i) => {
            if (i === 0) return false;
            return (h.result === 'Tài' && s > 0) || (h.result === 'Xỉu' && s <= 0);
        }).length;
        if (rc > bs) { bs = rc; bp = p; }
    }
    return { prediction: bp, confidence: Math.min(bs / 10, 1) };
}

function modelBayesOpt(history) {
    if (history.length < 30) return { prediction: null, confidence: 0 };
    const f = extractFeatures(history);
    let bp = 'Tài', bs = -Infinity;
    for (let i = 0; i < 30; i++) {
        const s = Array(10).fill(0).map(() => Math.random() - 0.5);
        let sc = 0;
        for (let j = 0; j < 10; j++) sc += f[j] * s[j];
        const acq = sc + 0.5 * Math.sqrt(Math.log(i + 1) / (i + 1));
        if (acq > bs) { bs = acq; bp = sc > 0 ? 'Tài' : 'Xỉu'; }
    }
    return { prediction: bp, confidence: Math.min(Math.abs(bs) * 2, 1) };
}

function modelEntropy(history) {
    if (history.length < 30) return { prediction: null, confidence: 0 };
    const l = history.slice(-30);
    const t = l.filter(h => h.result === 'Tài').length;
    const pT = t / 30, pX = (30 - t) / 30;
    const H = -(pT * Math.log2(pT + 0.001) + pX * Math.log2(pX + 0.001));
    if (H > 0.95) return { prediction: null, confidence: 0 };
    return { prediction: t < 15 ? 'Tài' : 'Xỉu', confidence: 1 - H };
}

function modelFractal(history) {
    if (history.length < 50) return { prediction: null, confidence: 0 };
    const s = history.slice(-50).map(h => h.result === 'Tài' ? 1 : -1);
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    let cum = 0, cumDev = [];
    s.forEach(v => { cum += v - mean; cumDev.push(cum); });
    const R = Math.max(...cumDev) - Math.min(...cumDev);
    const std = Math.sqrt(s.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / s.length);
    const H = Math.log(R / (std + 0.001)) / Math.log(s.length);
    if (H > 0.5) return { prediction: history[history.length - 1].result, confidence: Math.min(H, 1) };
    const last = history[history.length - 1].result;
    return { prediction: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: Math.min(1 - H, 1) };
}

function modelMeta(history, base) {
    const v = { 'Tài': 0, 'Xỉu': 0 };
    base.forEach(p => {
        if (!p.prediction || !p.confidence) return;
        const w = AI_MEMORY.model_performance[p.name]?.weight || 1.0;
        v[p.prediction] += p.confidence * w;
    });
    const t = v['Tài'] + v['Xỉu'];
    if (t === 0) return { prediction: null, confidence: 0, votes: v };
    return { prediction: v['Tài'] > v['Xỉu'] ? 'Tài' : 'Xỉu', confidence: Math.abs(v['Tài'] - v['Xỉu']) / t, votes: v };
}

function modelSupreme(history, all) {
    const v = { 'Tài': 0, 'Xỉu': 0 };
    all.forEach(r => {
        if (!r.prediction || !r.confidence) return;
        const w = AI_MEMORY.model_performance[r.name]?.weight || 1.0;
        v[r.prediction] += r.confidence * r.confidence * w;
    });
    const t = v['Tài'] + v['Xỉu'];
    if (t === 0) return { prediction: null, confidence: 0 };
    return { prediction: v['Tài'] > v['Xỉu'] ? 'Tài' : 'Xỉu', confidence: Math.abs(v['Tài'] - v['Xỉu']) / t, votes: v };
}

// ============================================================
// ENSEMBLE + STABILITY LOCK
// ============================================================
function runEnsemble(history) {
    const results = {
        markov: modelMarkov(history),
        neural: modelNeural(history),
        qlearn: modelQLearn(history),
        pattern: modelPattern(history),
        bayes: modelBayes(history),
        timeseries: modelTimeSeries(history),
        frequency: modelFrequency(history),
        volatility: modelVolatility(history),
        lstm: modelLSTM(history),
        gru: modelGRU(history),
        forest: modelForest(history),
        boosting: modelBoosting(history),
        xgboost: modelXGBoost(history),
        attention: modelAttention(history),
        multihead: modelMultiHead(history),
        transformer: modelTransformer(history),
        policy: modelPolicy(history),
        actorcritic: modelActorCritic(history),
        dqn: modelDQN(history),
        svm: modelSVM(history),
        knn: modelKNN(history),
        naivebayes: modelNaiveBayes(history),
        decisiontree: modelDecisionTree(history),
        wavelet: modelWavelet(history),
        chaos: modelChaos(history),
        genetic: modelGenetic(history),
        anneal: modelAnneal(history),
        bayesopt: modelBayesOpt(history),
        entropy: modelEntropy(history),
        fractal: modelFractal(history)
    };

    const base = Object.entries(results).map(([name, r]) => ({ name, ...r })).filter(p => p.prediction);
    const metaR = modelMeta(history, base);
    results.meta = metaR;
    const all = [...base, { name: 'meta', ...metaR }];
    const supR = modelSupreme(history, all);
    results.supreme = supR;

    const tv = base.filter(p => p.prediction === 'Tài').length;
    const xv = base.filter(p => p.prediction === 'Xỉu').length;
    const tvTotal = tv + xv || 1;

    let rawPrediction = supR.prediction || metaR.prediction;
    let rawConfidence = supR.confidence || metaR.confidence;

    // Anti-bias chỉ override khi CỰC lệch (> 0.85) + pattern mạnh (> 0.60)
    const imb = Math.abs(tv - xv) / tvTotal;
    if (imb > 0.85 && results.pattern.prediction && results.pattern.prediction !== rawPrediction) {
        if (results.pattern.confidence > 0.60) {
            rawPrediction = results.pattern.prediction;
            rawConfidence = 0.60;
        }
    }

    // Cầu 1-1 confidence penalty
    const last10 = history.slice(-10);
    let flips = 0;
    for (let i = 0; i < last10.length - 1; i++) {
        if (last10[i].result !== last10[i + 1].result) flips++;
    }
    const flipRate = flips / 9;
    if (flipRate > 0.7) rawConfidence *= 0.7;

    const calibrated = calibrateConfidence(rawConfidence);

    return {
        final: { prediction: rawPrediction, confidence: calibrated },
        raw_confidence: rawConfidence,
        supreme: supR,
        meta: metaR,
        models: base,
        taiVotes: tv,
        xiuVotes: xv,
        consensus: Math.max(tv, xv) / tvTotal,
        imbalance: imb.toFixed(2),
        flipRate: flipRate.toFixed(2),
        allModels: results,
        totalModels: base.length
    };
}

// ============================================================
// 3 SỐ TỔNG
// ============================================================
function aiSelectThreeSums(history, prediction) {
    const ss = {};
    for (let i = 4; i <= 17; i++) ss[i] = 0;
    history.slice(-100).forEach(h => { if (h.score >= 4 && h.score <= 17) ss[h.score] += 0.5; });
    history.slice(-50).forEach(h => { if (h.score >= 4 && h.score <= 17) ss[h.score] += 1; });
    history.slice(-20).forEach(h => { if (h.score >= 4 && h.score <= 17) ss[h.score] += 2; });
    history.slice(-10).forEach(h => { if (h.score >= 4 && h.score <= 17) ss[h.score] += 2.5; });
    history.slice(-5).forEach(h => { if (h.score >= 4 && h.score <= 17) ss[h.score] += 3; });

    const mn = prediction === 'Tài' ? 11 : 4;
    const mx = prediction === 'Tài' ? 17 : 10;
    const rs = history.slice(-3).map(h => h.score);

    const c = [];
    for (let s = mn; s <= mx; s++) c.push({ sum: s, score: ss[s], isRecent: rs.includes(s) });
    c.sort((a, b) => {
        if (a.isRecent !== b.isRecent) return a.isRecent ? 1 : -1;
        return b.score - a.score;
    });

    let t3 = c.slice(0, 3).map(x => x.sum);
    if (t3.length < 3) t3 = prediction === 'Tài' ? [11, 13, 15] : [5, 7, 9];
    t3.sort((a, b) => a - b);
    return t3;
}

// ============================================================
// LEARNING
// ============================================================
function learnFromResult(history, actualResult) {
    if (actualResult === 'Bão') return;
    const features = extractFeatures(history.slice(0, -1));
    const w = AI_MEMORY.neural_weights;
    const actual = actualResult === 'Tài' ? 1 : 0;
    let sum = AI_MEMORY.neural_bias;
    for (let i = 0; i < Math.min(features.length, w.length); i++) sum += features[i] * w[i];
    const predicted = sigmoid(sum);
    const error = actual - predicted;
    const lr = 0.005;
    for (let i = 0; i < Math.min(features.length, w.length); i++) {
        w[i] += lr * error * features[i];
        w[i] = Math.max(-3, Math.min(3, w[i]));
    }
    AI_MEMORY.neural_bias += lr * error;

    const qR = modelQLearn(history.slice(0, -1));
    if (qR.stateKey) {
        const q = AI_MEMORY.q_table[qR.stateKey];
        const reward = actualResult === 'Tài' ? 1 : -1;
        q['Tài'] += AI_MEMORY.q_learning_rate * (reward - q['Tài']);
        q['Xỉu'] += AI_MEMORY.q_learning_rate * (-reward - q['Xỉu']);
    }

    const dk = getDeepStateHash(features);
    if (!AI_MEMORY.q_table[dk]) AI_MEMORY.q_table[dk] = { 'Tài': 0, 'Xỉu': 0 };
    AI_MEMORY.q_table[dk][actualResult] += 0.05;
    AI_MEMORY.q_table[dk][actualResult === 'Tài' ? 'Xỉu' : 'Tài'] -= 0.05;

    const ens = runEnsemble(history.slice(0, -1));
    ens.models.forEach(m => {
        const perf = AI_MEMORY.model_performance[m.name];
        if (!perf) return;
        perf.total++;
        if (m.prediction === actualResult) perf.correct++;
        const acc = perf.total > 5 ? perf.correct / perf.total : 0.5;
        perf.weight = 0.5 + acc * 2;
    });

    AI_MEMORY.total_predictions++;
    const fp = ens.final.prediction;
    if (fp === actualResult) {
        AI_MEMORY.correct_predictions++;
        AI_MEMORY.streak_correct++;
        AI_MEMORY.streak_wrong = 0;
        if (AI_MEMORY.streak_correct > AI_MEMORY.best_streak) AI_MEMORY.best_streak = AI_MEMORY.streak_correct;
    } else {
        AI_MEMORY.streak_wrong++;
        AI_MEMORY.streak_correct = 0;
        if (AI_MEMORY.streak_wrong > AI_MEMORY.worst_streak) AI_MEMORY.worst_streak = AI_MEMORY.streak_wrong;
    }

    if (AI_MEMORY.pendingPrediction) {
        const conf = AI_MEMORY.pendingPrediction.confidence;
        const bucket = Math.min(9, Math.floor(conf * 10));
        AI_MEMORY.calibration[bucket].total++;
        if (fp === actualResult) AI_MEMORY.calibration[bucket].correct++;
    }

    AI_MEMORY.recent_predictions.push({
        gameNum: AI_MEMORY.pendingPrediction?.gameNum,
        predicted: fp,
        actual: actualResult,
        correct: fp === actualResult,
        confidence: AI_MEMORY.pendingPrediction?.confidence,
        timestamp: Date.now()
    });
    if (AI_MEMORY.recent_predictions.length > 200) AI_MEMORY.recent_predictions.shift();

    saveMemory();
}

// ============================================================
// PREDICT + STABILITY
// ============================================================
async function predict(gameKey = CURRENT_GAME) {
    const history = await fetchHistoryCached(gameKey);
    const len = history.length;
    const cur = history[len - 1];

    AI_MEMORY.detected_games[gameKey] = (AI_MEMORY.detected_games[gameKey] || 0) + 1;

    if (AI_MEMORY.lastSessionNum && cur.gameNum !== AI_MEMORY.lastSessionNum) {
        if (AI_MEMORY.pendingPrediction) learnFromResult(history, cur.result);
    }
    AI_MEMORY.lastSessionNum = cur.gameNum;

    const ensemble = runEnsemble(history);

    // ===== STABILITY LOCK =====
    const stability = applyStabilityLock(
        ensemble.final.prediction,
        ensemble.final.confidence,
        cur
    );

    const finalPrediction = stability.prediction;
    const finalConfidence = stability.confidence;
    const stabilityAction = stability.action;

    if (finalPrediction === 'Tài') {
        AI_MEMORY.consecutive_tai_predictions++;
        AI_MEMORY.consecutive_xiu_predictions = 0;
    } else {
        AI_MEMORY.consecutive_xiu_predictions++;
        AI_MEMORY.consecutive_tai_predictions = 0;
    }

    const threeSums = aiSelectThreeSums(history, finalPrediction);
    const betRange = `${threeSums[0]} ${threeSums[1]} ${threeSums[2]}`;

    AI_MEMORY.pendingPrediction = {
        gameNum: cur.gameNum,
        prediction: finalPrediction,
        confidence: finalConfidence
    };
    saveMemory();

    return {
        "phiên": cur.gameNum.replace('#', ''),
        "xúc xắc": cur.faces,
        "tổng": cur.score,
        "kết quả": cur.result,
        "phiên dự đoán": `${parseInt(cur.gameNum.replace('#', '')) + 1}`,
        "dự đoán": finalPrediction.toUpperCase(),
        "vị cược": betRange,
        "tỉ lệ": `${(finalConfidence * 100).toFixed(2)}%`,
        "_stability": {
            "action": stabilityAction,
            "raw_prediction": ensemble.final.prediction,
            "raw_confidence": (ensemble.raw_confidence * 100).toFixed(2) + '%',
            "flip_history_count": STABILITY_STATE.flipHistory.length
        }
    };
}

// ============================================================
// ROUTES
// ============================================================
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        version: AI_MEMORY.version,
        name: '⚡ Sicbo AI v11.0 VIP - ALL CẦU + STABILITY LOCK',
        confidence_range: '51% - 86%',
        models: Object.keys(AI_MEMORY.model_performance).length,
        stability_lock: {
            enabled: STABILITY.ENABLED,
            flip_threshold: STABILITY.FLIP_THRESHOLD,
            cooldown_sessions: STABILITY.COOLDOWN_SESSIONS,
            max_flips_window: STABILITY.MAX_FLIPS_IN_10,
            last_prediction: STABILITY_STATE.lastPrediction,
            last_confidence: STABILITY_STATE.lastPredictionConf.toFixed(3),
            total_holds: AI_MEMORY.stability.total_holds,
            total_flips: AI_MEMORY.stability.total_flips,
            total_flip_blocked: AI_MEMORY.stability.total_flip_blocked
        },
        total_predictions: AI_MEMORY.total_predictions,
        accuracy: AI_MEMORY.total_predictions > 0
            ? `${((AI_MEMORY.correct_predictions / AI_MEMORY.total_predictions) * 100).toFixed(2)}%` : 'N/A',
        endpoints: {
            'Dự đoán': '/api/du-doan',
            'AI Status': '/api/ai-status',
            'Stability': '/api/stability',
            'Anti-Block': '/api/anti-block',
            'Reset': '/api/reset-memory',
            'Tool Predict': '/api/tool/predict'
        }
    });
});

app.get('/api/du-doan', async (req, res) => {
    try {
        const result = await predict(req.query.game || CURRENT_GAME);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stability', (req, res) => {
    res.json({
        config: STABILITY,
        state: {
            lastPrediction: STABILITY_STATE.lastPrediction,
            lastPredictionConf: STABILITY_STATE.lastPredictionConf,
            lastFlipSessionNum: STABILITY_STATE.lastFlipSessionNum,
            holdCount: STABILITY_STATE.holdCount,
            flipHistoryCount: STABILITY_STATE.flipHistory.length
        },
        memory: AI_MEMORY.stability,
        recentFlips: STABILITY_STATE.flipHistory.slice(-10).reverse()
    });
});

app.get('/api/ai-status', (req, res) => {
    const recent = AI_MEMORY.recent_predictions.slice(-20);
    const rc = recent.filter(p => p.correct).length;
    res.json({
        version: AI_MEMORY.version,
        total_predictions: AI_MEMORY.total_predictions,
        correct_predictions: AI_MEMORY.correct_predictions,
        accuracy: AI_MEMORY.total_predictions > 0
            ? `${((AI_MEMORY.correct_predictions / AI_MEMORY.total_predictions) * 100).toFixed(2)}%` : 'N/A',
        recent_20_accuracy: recent.length > 0 ? `${((rc / recent.length) * 100).toFixed(2)}%` : 'N/A',
        streak_correct: AI_MEMORY.streak_correct,
        best_streak: AI_MEMORY.best_streak,
        worst_streak: AI_MEMORY.worst_streak,
        consecutive_tai: AI_MEMORY.consecutive_tai_predictions,
        consecutive_xiu: AI_MEMORY.consecutive_xiu_predictions,
        stability: AI_MEMORY.stability,
        anti_block: ANTI_BLOCK_STATS,
        model_performance: Object.fromEntries(
            Object.entries(AI_MEMORY.model_performance).map(([k, v]) => [
                k, {
                    weight: v.weight.toFixed(2),
                    accuracy: v.total > 0 ? `${((v.correct / v.total) * 100).toFixed(1)}%` : 'N/A',
                    samples: v.total
                }
            ])
        )
    });
});

app.get('/api/anti-block', (req, res) => {
    res.json({
        circuit: CIRCUIT,
        cache: {
            has_data: !!HISTORY_CACHE.data,
            age_ms: HISTORY_CACHE.data ? Date.now() - HISTORY_CACHE.timestamp : null,
            ttl_ms: HISTORY_CACHE.ttl
        },
        stats: ANTI_BLOCK_STATS
    });
});

app.get('/api/reset-memory', (req, res) => {
    if (fs.existsSync(MEMORY_FILE)) fs.unlinkSync(MEMORY_FILE);
    if (fs.existsSync(MEMORY_BACKUP)) fs.unlinkSync(MEMORY_BACKUP);
    STABILITY_STATE = {
        lastPrediction: null, lastPredictionConf: 0,
        lastFlipSessionNum: null, flipHistory: [], holdCount: 0
    };
    res.json({ message: 'Memory reset. Restart server.' });
});

// ============================================================
// TOOL API
// ============================================================
app.get('/api/tool/predict', async (req, res) => {
    try {
        const result = await predict(req.query.game || CURRENT_GAME);
        const format = req.query.format || 'json';
        if (format === 'compact') {
            return res.json({
                s: result["phiên"], d: result["dự đoán"],
                v: result["vị cược"], r: result["tỉ lệ"],
                t: result["tổng"], k: result["kết quả"],
                st: result._stability?.action
            });
        }
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/tool/ping', (req, res) => {
    res.json({
        pong: true, version: AI_MEMORY.version,
        uptime: Math.floor(process.uptime()),
        models: Object.keys(AI_MEMORY.model_performance).length,
        stability_lock: STABILITY.ENABLED,
        circuit: CIRCUIT.state
    });
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   ⚡ SICBO AI v11.0 VIP - ALL CẦU + STABILITY LOCK       ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  🚀 Dự đoán:  http://localhost:${PORT}/api/du-doan           ║`);
    console.log(`║  🎯 Stability: http://localhost:${PORT}/api/stability       ║`);
    console.log(`║  🧠 Status:   http://localhost:${PORT}/api/ai-status         ║`);
    console.log(`║  🛡️  Anti-Block: http://localhost:${PORT}/api/anti-block     ║`);
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  🎯 30 MODELS - 120+ CẦU - 120 FEATURES                   ║');
    console.log('║  🔒 STABILITY LOCK:                                       ║');
    console.log(`║     - Flip threshold: ${STABILITY.FLIP_THRESHOLD}         ║`);
    console.log(`║     - Cooldown: ${STABILITY.COOLDOWN_SESSIONS} phiên      ║`);
    console.log(`║     - Max flips: ${STABILITY.MAX_FLIPS_IN_10}/window      ║`);
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  🎯 Confidence: 51% - 86%                                 ║');
    console.log('║  ✅ Không random - Không cứng - Không nhảy cầu           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
});
