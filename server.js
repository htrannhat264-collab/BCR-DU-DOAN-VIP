const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 5000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// ============================================================
// LƯU DỮ LIỆU
// ============================================================
const sessionData = {};
const lastData = {};
const historyCorrect = {};
const bankrollData = {};

// ============================================================
// HÀM CHUYỂN STRING -> ARRAY
// ============================================================
function toArray(str) {
    return str ? str.split('') : [];
}

// ============================================================
// THUẬT TOÁN KELLY - KHÔNG RANDOM
// ============================================================
function kellyCriterion(winRate, odds, bankroll) {
    // winRate: xác suất thắng (0-1)
    // odds: tỷ lệ trả thưởng (Banker: 0.95, Player: 1, Tie: 8)
    // bankroll: số vốn hiện tại
    
    if (winRate <= 0 || winRate >= 1) return 0;
    if (odds <= 0) return 0;
    
    // Công thức Kelly: f = (bp - q) / b
    // b = odds, p = winRate, q = 1 - winRate
    const b = odds;
    const p = winRate;
    const q = 1 - p;
    
    let f = (b * p - q) / b;
    
    // Giới hạn Kelly (không đặt quá 25% bankroll)
    f = Math.max(0, Math.min(f, 0.25));
    
    // Điều chỉnh Kelly an toàn (Half Kelly)
    f = f * 0.5;
    
    return f * bankroll;
}

// ============================================================
// THUẬT TOÁN KELLY ADAPTIVE
// ============================================================
function kellyAdaptive(history, bankroll) {
    if (!history || history.length < 5) {
        return {
            bankerBet: 0,
            playerBet: 0,
            tieBet: 0,
            totalBet: 0,
            reason: 'Chưa đủ dữ liệu'
        };
    }
    
    const arr = toArray(history);
    const counts = { B: 0, P: 0, T: 0 };
    for (const c of arr) {
        if (counts[c] !== undefined) counts[c]++;
    }
    const total = arr.length;
    
    // Xác suất thực tế từ dữ liệu
    const pB = counts.B / total;
    const pP = counts.P / total;
    const pT = counts.T / total;
    
    // Điều chỉnh theo xác suất thực tế của Baccarat
    const adjustedB = pB * 0.7 + 0.1376;
    const adjustedP = pP * 0.7 + 0.1339;
    const adjustedT = pT * 0.7 + 0.0286;
    
    const sum = adjustedB + adjustedP + adjustedT;
    const finalB = adjustedB / sum;
    const finalP = adjustedP / sum;
    const finalT = adjustedT / sum;
    
    // Tỷ lệ trả thưởng
    const oddsB = 0.95;
    const oddsP = 1.0;
    const oddsT = 8.0;
    
    // Tính Kelly cho từng cửa
    const kellyB = kellyCriterion(finalB, oddsB, bankroll);
    const kellyP = kellyCriterion(finalP, oddsP, bankroll);
    const kellyT = kellyCriterion(finalT, oddsT, bankroll);
    
    // Tổng số tiền đặt
    const totalBet = kellyB + kellyP + kellyT;
    
    // Dự đoán cửa nào có Kelly cao nhất
    let prediction = 'Player';
    let maxKelly = Math.max(kellyB, kellyP, kellyT);
    if (maxKelly === kellyB) prediction = 'Banker';
    else if (maxKelly === kellyP) prediction = 'Player';
    else prediction = 'Tie';
    
    return {
        bankerBet: Math.round(kellyB * 100) / 100,
        playerBet: Math.round(kellyP * 100) / 100,
        tieBet: Math.round(kellyT * 100) / 100,
        totalBet: Math.round(totalBet * 100) / 100,
        prediction: prediction,
        bankroll: Math.round(bankroll * 100) / 100,
        probabilities: {
            B: Math.round(finalB * 1000) / 10,
            P: Math.round(finalP * 1000) / 10,
            T: Math.round(finalT * 1000) / 10
        },
        odds: {
            B: oddsB,
            P: oddsP,
            T: oddsT
        }
    };
}

// ============================================================
// THUẬT TOÁN DỰ ĐOÁN SIÊU CẦU - KHÔNG RANDOM
// ============================================================
function predictBCR(history) {
    if (!history || history.length < 3) {
        return {
            prediction: 'Player',
            banker: 48,
            player: 48,
            tie: 4,
            pattern: 'Chưa đủ dữ liệu',
            confidence: 50,
            stats: { B: 0, P: 0, T: 0 }
        };
    }

    const arr = toArray(history);
    const total = arr.length;
    const counts = { B: 0, P: 0, T: 0 };
    for (const c of arr) {
        if (counts[c] !== undefined) counts[c]++;
    }

    // ===== PHÂN TÍCH TẦN SUẤT =====
    const pPercent = (counts.P / total) * 100;
    const bPercent = (counts.B / total) * 100;
    const tPercent = (counts.T / total) * 100;

    // ===== PHÂN TÍCH STREAK (DÂY) =====
    let maxStreak = 1;
    let streakChar = arr[0];
    let currentStreak = 1;
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] === arr[i-1]) {
            currentStreak++;
            if (currentStreak > maxStreak) {
                maxStreak = currentStreak;
                streakChar = arr[i];
            }
        } else {
            currentStreak = 1;
        }
    }

    // ===== PHÂN TÍCH ZIGZAG =====
    let zigzagCount = 0;
    for (let i = 1; i < arr.length - 1; i++) {
        if (arr[i] !== arr[i-1] && arr[i] !== arr[i+1]) {
            zigzagCount++;
        }
    }

    // ===== PHÂN TÍCH PATTERN 2-2 =====
    let pattern22 = 0;
    for (let i = 1; i < Math.min(10, arr.length - 1); i += 2) {
        if (arr[arr.length - i] === arr[arr.length - i - 1]) {
            pattern22++;
        }
    }

    // ===== PHÂN TÍCH PATTERN 3-3 =====
    let pattern33 = 0;
    for (let i = 2; i < Math.min(12, arr.length - 1); i += 3) {
        if (arr[arr.length - i] === arr[arr.length - i - 1] &&
            arr[arr.length - i] === arr[arr.length - i - 2]) {
            pattern33++;
        }
    }

    // ===== PHÂN TÍCH PATTERN 4-4 =====
    let pattern44 = 0;
    for (let i = 3; i < Math.min(14, arr.length - 1); i += 4) {
        if (arr[arr.length - i] === arr[arr.length - i - 1] &&
            arr[arr.length - i] === arr[arr.length - i - 2] &&
            arr[arr.length - i] === arr[arr.length - i - 3]) {
            pattern44++;
        }
    }

    // ===== PHÂN TÍCH MARKOV BẬC 1 =====
    const markov1 = { 'B': { 'B': 0, 'P': 0, 'T': 0 }, 'P': { 'B': 0, 'P': 0, 'T': 0 }, 'T': { 'B': 0, 'P': 0, 'T': 0 } };
    for (let i = 0; i < arr.length - 1; i++) {
        if (markov1[arr[i]] && markov1[arr[i]][arr[i+1]] !== undefined) {
            markov1[arr[i]][arr[i+1]]++;
        }
    }
    const lastChar = arr[arr.length - 1];
    const trans1 = markov1[lastChar];
    let markov1Pred = 'B';
    let markov1Prob = 0;
    if (trans1) {
        const totalTrans = trans1.B + trans1.P + trans1.T;
        if (totalTrans > 0) {
            let maxProb = 0;
            for (const [key, val] of Object.entries(trans1)) {
                if (val / totalTrans > maxProb) {
                    maxProb = val / totalTrans;
                    markov1Pred = key;
                    markov1Prob = maxProb;
                }
            }
        }
    }

    // ===== PHÂN TÍCH MARKOV BẬC 2 =====
    const markov2 = {};
    for (let i = 0; i < arr.length - 2; i++) {
        const key = arr[i] + arr[i+1];
        const next = arr[i+2];
        if (!markov2[key]) {
            markov2[key] = { 'B': 0, 'P': 0, 'T': 0 };
        }
        if (markov2[key][next] !== undefined) {
            markov2[key][next]++;
        }
    }
    const lastKey = arr.slice(-2).join('');
    const trans2 = markov2[lastKey];
    let markov2Pred = 'B';
    let markov2Prob = 0;
    if (trans2) {
        const totalTrans = trans2.B + trans2.P + trans2.T;
        if (totalTrans > 0) {
            let maxProb = 0;
            for (const [key, val] of Object.entries(trans2)) {
                if (val / totalTrans > maxProb) {
                    maxProb = val / totalTrans;
                    markov2Pred = key;
                    markov2Prob = maxProb;
                }
            }
        }
    }

    // ===== PHÂN TÍCH MOMENTUM =====
    const values = arr.map(c => c === 'B' ? 1 : c === 'P' ? -1 : 0);
    let momentum = 0;
    let acceleration = 0;
    for (let i = 1; i < Math.min(values.length, 10); i++) {
        momentum += values[i] - values[i - 1];
        if (i > 1) {
            acceleration += (values[i] - values[i-1]) - (values[i-1] - values[i-2]);
        }
    }
    momentum = momentum / Math.min(values.length, 10);
    acceleration = acceleration / Math.min(values.length - 1, 9);

    // ===== PHÂN TÍCH ENTROPY =====
    let entropy = 0;
    for (const c of ['B', 'P', 'T']) {
        const prob = counts[c] / total;
        if (prob > 0) entropy -= prob * Math.log2(prob);
    }
    const maxEntropy = Math.log2(3);
    const predictability = 1 - (entropy / maxEntropy);

    // ===== PHÂN TÍCH GAP =====
    const gaps = { 'B': [], 'P': [], 'T': [] };
    const lastPos = { 'B': -1, 'P': -1, 'T': -1 };
    for (let i = 0; i < arr.length; i++) {
        const char = arr[i];
        if (lastPos[char] !== -1) {
            gaps[char].push(i - lastPos[char] - 1);
        }
        lastPos[char] = i;
    }
    const avgGaps = {};
    const stdGaps = {};
    for (const key of ['B', 'P', 'T']) {
        if (gaps[key].length > 0) {
            avgGaps[key] = gaps[key].reduce((a, b) => a + b, 0) / gaps[key].length;
            const variance = gaps[key].reduce((a, b) => a + Math.pow(b - avgGaps[key], 2), 0) / gaps[key].length;
            stdGaps[key] = Math.sqrt(variance);
        } else {
            avgGaps[key] = 2;
            stdGaps[key] = 1;
        }
    }
    const currentGap = {};
    for (const key of ['B', 'P', 'T']) {
        currentGap[key] = arr.length - 1 - lastPos[key];
    }
    let gapPred = 'B';
    let gapScore = 0;
    for (const key of ['B', 'P', 'T']) {
        const zScore = (currentGap[key] - avgGaps[key]) / (stdGaps[key] || 1);
        const score = Math.abs(zScore);
        if (score > gapScore) {
            gapScore = score;
            gapPred = key;
        }
    }

    // ===== PHÂN TÍCH FIBONACCI =====
    const fib = [1, 1, 2, 3, 5, 8, 13];
    const fibPositions = [];
    for (const f of fib) {
        if (f <= arr.length) {
            fibPositions.push(arr.length - f);
        }
    }
    const fibCounts = { 'B': 0, 'P': 0, 'T': 0 };
    for (const pos of fibPositions) {
        if (pos >= 0 && pos < arr.length) {
            const char = arr[pos];
            if (fibCounts[char] !== undefined) fibCounts[char]++;
        }
    }
    let fibPred = 'B';
    let fibMax = 0;
    for (const [key, val] of Object.entries(fibCounts)) {
        if (val > fibMax) {
            fibMax = val;
            fibPred = key;
        }
    }

    // ===== PHÂN TÍCH HARMONIC =====
    let harmonicCount = 0;
    const last8 = arr.slice(-8);
    for (let i = 0; i < last8.length - 1; i++) {
        if (last8[i] === last8[i + 1]) harmonicCount++;
    }

    // ===== PHÂN TÍCH CORRELATION =====
    const seq = arr.map(c => c === 'B' ? 1 : c === 'P' ? -1 : 0);
    const n = seq.length;
    const mean = seq.reduce((a, b) => a + b, 0) / n;
    const variance = seq.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const corr = [];
    for (let lag = 1; lag <= Math.min(5, n - 1); lag++) {
        let sum = 0;
        for (let i = 0; i < n - lag; i++) {
            sum += (seq[i] - mean) * (seq[i + lag] - mean);
        }
        corr.push(sum / ((n - lag) * variance));
    }
    const lastValue = seq[n - 1];
    let corrPred = 'B';
    if (corr.length > 0 && corr[0] > 0.3) {
        corrPred = lastValue > 0 ? 'B' : 'P';
    } else if (corr.length > 1 && corr[1] < -0.3) {
        corrPred = lastValue > 0 ? 'P' : 'B';
    }

    // ============================================================
    // TỔNG HỢP ĐIỂM - KHÔNG RANDOM
    // ============================================================
    let bankerScore = 0;
    let playerScore = 0;
    let tieScore = 0;

    // Trọng số cố định (không random)
    const weights = {
        frequency: 0.12,
        streak: 0.10,
        zigzag: 0.08,
        pattern22: 0.07,
        pattern33: 0.06,
        pattern44: 0.04,
        markov1: 0.08,
        markov2: 0.07,
        momentum: 0.07,
        entropy: 0.06,
        gap: 0.06,
        fibonacci: 0.05,
        harmonic: 0.04,
        correlation: 0.04
    };

    // 1. Tần suất
    bankerScore += bPercent * weights.frequency;
    playerScore += pPercent * weights.frequency;
    tieScore += tPercent * weights.frequency;

    // 2. Streak
    if (maxStreak >= 4) {
        if (streakChar === 'B') bankerScore += 100 * weights.streak;
        else if (streakChar === 'P') playerScore += 100 * weights.streak;
        else tieScore += 100 * weights.streak;
    } else {
        bankerScore += 50 * weights.streak;
        playerScore += 50 * weights.streak;
    }

    // 3. Zigzag
    if (zigzagCount >= 4) {
        const last = arr[arr.length - 1];
        if (last === 'P') bankerScore += 100 * weights.zigzag;
        else if (last === 'B') playerScore += 100 * weights.zigzag;
        else tieScore += 100 * weights.zigzag;
    } else {
        bankerScore += 50 * weights.zigzag;
        playerScore += 50 * weights.zigzag;
    }

    // 4. Pattern 2-2
    if (pattern22 >= 2) {
        const last = arr[arr.length - 1];
        if (last === 'P') bankerScore += 100 * weights.pattern22;
        else if (last === 'B') playerScore += 100 * weights.pattern22;
        else tieScore += 100 * weights.pattern22;
    }

    // 5. Pattern 3-3
    if (pattern33 >= 1) {
        const last = arr[arr.length - 1];
        if (last === 'P') bankerScore += 100 * weights.pattern33;
        else if (last === 'B') playerScore += 100 * weights.pattern33;
        else tieScore += 100 * weights.pattern33;
    }

    // 6. Pattern 4-4
    if (pattern44 >= 1) {
        const last = arr[arr.length - 1];
        if (last === 'P') bankerScore += 100 * weights.pattern44;
        else if (last === 'B') playerScore += 100 * weights.pattern44;
        else tieScore += 100 * weights.pattern44;
    }

    // 7. Markov 1
    if (markov1Prob > 0.4) {
        if (markov1Pred === 'B') bankerScore += 100 * weights.markov1;
        else if (markov1Pred === 'P') playerScore += 100 * weights.markov1;
        else tieScore += 100 * weights.markov1;
    }

    // 8. Markov 2
    if (markov2Prob > 0.4) {
        if (markov2Pred === 'B') bankerScore += 100 * weights.markov2;
        else if (markov2Pred === 'P') playerScore += 100 * weights.markov2;
        else tieScore += 100 * weights.markov2;
    }

    // 9. Momentum
    if (Math.abs(momentum) > 0.3) {
        if (momentum > 0) bankerScore += 100 * weights.momentum;
        else playerScore += 100 * weights.momentum;
    }

    // 10. Entropy
    if (predictability > 0.6) {
        const freqPred = bPercent > pPercent ? 'B' : 'P';
        if (freqPred === 'B') bankerScore += 100 * weights.entropy;
        else playerScore += 100 * weights.entropy;
    } else if (predictability < 0.3) {
        tieScore += 100 * weights.entropy;
    }

    // 11. Gap
    if (gapScore > 1.5) {
        if (gapPred === 'B') bankerScore += 100 * weights.gap;
        else if (gapPred === 'P') playerScore += 100 * weights.gap;
        else tieScore += 100 * weights.gap;
    }

    // 12. Fibonacci
    if (fibMax >= 2) {
        if (fibPred === 'B') bankerScore += 100 * weights.fibonacci;
        else if (fibPred === 'P') playerScore += 100 * weights.fibonacci;
        else tieScore += 100 * weights.fibonacci;
    }

    // 13. Harmonic
    if (harmonicCount >= 4) {
        const last = arr[arr.length - 1];
        if (last === 'P') bankerScore += 100 * weights.harmonic;
        else if (last === 'B') playerScore += 100 * weights.harmonic;
        else tieScore += 100 * weights.harmonic;
    }

    // 14. Correlation
    if (corrPred === 'B') bankerScore += 100 * weights.correlation;
    else if (corrPred === 'P') playerScore += 100 * weights.correlation;
    else tieScore += 100 * weights.correlation;

    // ===== CHUẨN HÓA =====
    const totalScore = bankerScore + playerScore + tieScore || 1;
    let banker = (bankerScore / totalScore) * 100;
    let player = (playerScore / totalScore) * 100;
    let tie = (tieScore / totalScore) * 100;

    // Điều chỉnh theo xác suất thực tế Baccarat
    banker = banker * 0.7 + 13.76;
    player = player * 0.7 + 13.39;
    tie = tie * 0.7 + 2.86;

    const sum = banker + player + tie;
    banker = (banker / sum) * 100;
    player = (player / sum) * 100;
    tie = (tie / sum) * 100;

    // ===== XÁC ĐỊNH DỰ ĐOÁN =====
    let prediction = 'Player';
    let maxRate = Math.max(banker, player, tie);
    if (maxRate === banker) prediction = 'Banker';
    else if (maxRate === player) prediction = 'Player';
    else prediction = 'Tie';

    // ===== ĐỘ TIN CẬY =====
    const confidence = Math.min(Math.max(maxRate - 10, 25), 85);

    // ===== PHÂN TÍCH CẦU =====
    let pattern = '';
    if (maxStreak >= 4) {
        pattern = `Dây ${streakChar === 'B' ? 'Banker' : 'Player'} x${maxStreak}`;
    } else if (zigzagCount >= 4) {
        pattern = `Zigzag ${zigzagCount} lần`;
    } else if (pattern22 >= 2 && pattern33 >= 1) {
        pattern = `Cầu 2-2 (${pattern22} lần) + 3-3`;
    } else if (pattern22 >= 2) {
        pattern = `Cầu 2-2 (${pattern22} lần)`;
    } else if (pattern33 >= 1) {
        pattern = `Cầu 3-3`;
    } else if (pattern44 >= 1) {
        pattern = `Cầu 4-4`;
    } else if (bPercent > 55) {
        pattern = `Banker áp đảo ${Math.round(bPercent)}%`;
    } else if (pPercent > 55) {
        pattern = `Player áp đảo ${Math.round(pPercent)}%`;
    } else {
        pattern = 'Cầu đan xen';
    }

    // ===== LÀM TRÒN - KHÔNG RANDOM =====
    let b = Math.round(banker);
    let p = Math.round(player);
    let t = Math.round(tie);

    if (b === 50) b = 51;
    if (p === 50) p = 49;
    if (t === 50) t = 5;

    const totalRates = b + p + t;
    if (totalRates !== 100) {
        const diff = 100 - totalRates;
        if (b > p && b > t) b += diff;
        else if (p > b && p > t) p += diff;
        else t += diff;
    }

    return {
        prediction: prediction,
        banker: Math.max(b, 3),
        player: Math.max(p, 3),
        tie: Math.max(t, 2),
        pattern: pattern,
        confidence: Math.round(confidence),
        stats: {
            B: Math.round(bPercent),
            P: Math.round(pPercent),
            T: Math.round(tPercent),
            maxStreak: maxStreak,
            zigzag: zigzagCount,
            pattern22: pattern22,
            pattern33: pattern33,
            pattern44: pattern44,
            momentum: Math.round(momentum * 100) / 100,
            acceleration: Math.round(acceleration * 100) / 100,
            entropy: Math.round(entropy * 10) / 10,
            predictability: Math.round(predictability * 100),
            markov1: Math.round(markov1Prob * 100),
            markov2: Math.round(markov2Prob * 100),
            fibPred: fibPred,
            harmonic: harmonicCount,
            corr: corr.map(c => Math.round(c * 100) / 100)
        },
        algorithms: {
            frequency: { B: Math.round(bPercent), P: Math.round(pPercent), T: Math.round(tPercent) },
            streak: { char: streakChar, length: maxStreak },
            zigzag: { count: zigzagCount },
            pattern22: { count: pattern22 },
            pattern33: { count: pattern33 },
            pattern44: { count: pattern44 },
            markov1: { pred: markov1Pred, prob: Math.round(markov1Prob * 100) },
            markov2: { pred: markov2Pred, prob: Math.round(markov2Prob * 100) },
            momentum: { value: Math.round(momentum * 100) / 100 },
            entropy: { value: Math.round(entropy * 10) / 10, predictability: Math.round(predictability * 100) },
            gap: { pred: gapPred, score: Math.round(gapScore * 100) / 100 },
            fibonacci: { pred: fibPred, count: fibMax },
            harmonic: { count: harmonicCount },
            correlation: { pred: corrPred, values: corr.map(c => Math.round(c * 100) / 100) }
        }
    };
}

// ============================================================
// LẤY DỮ LIỆU TỪ API
// ============================================================
async function fetchTableData(tableId) {
    try {
        const url = `https://bcr-vip-1ftu.onrender.com/api/baccarat/${tableId}`;
        const response = await axios.get(url, { timeout: 10000 });
        if (response.data && response.data.success && response.data.data) {
            return response.data.data.result || '';
        }
        return '';
    } catch (error) {
        console.error(`Lỗi bàn ${tableId}:`, error.message);
        return '';
    }
}

// ============================================================
// API DỰ ĐOÁN TỪNG BÀN (CÓ KELLY)
// ============================================================
app.get('/api/predict/:tableId', async (req, res) => {
    try {
        const tableId = req.params.tableId;
        const history = await fetchTableData(tableId);

        if (!history) {
            return res.json({
                success: false,
                message: `Không tìm thấy bàn ${tableId}`
            });
        }

        // Lưu dữ liệu cũ
        const lastDataKey = `table_${tableId}`;
        const oldData = lastData[lastDataKey] || '';
        const isNewData = (history !== oldData && history.length > oldData.length);
        lastData[lastDataKey] = history;

        // Tăng phiên
        if (!sessionData[tableId]) sessionData[tableId] = 0;
        if (isNewData) sessionData[tableId]++;

        // Dự đoán
        const result = predictBCR(history);

        // ===== KELLY CRITERION =====
        if (!bankrollData[tableId]) bankrollData[tableId] = 1000; // Bankroll mặc định
        const kellyResult = kellyAdaptive(history, bankrollData[tableId]);
        
        // Cập nhật bankroll (giả định thắng/thua)
        const predMap = { 'Banker': 'B', 'Player': 'P', 'Tie': 'T' };
        const lastActual = history[history.length - 1];
        const isCorrect = predMap[result.prediction] === lastActual;
        
        if (isCorrect) {
            const odds = result.prediction === 'Banker' ? 0.95 : result.prediction === 'Player' ? 1 : 8;
            bankrollData[tableId] += kellyResult.totalBet * odds;
        } else {
            bankrollData[tableId] -= kellyResult.totalBet;
        }
        bankrollData[tableId] = Math.max(bankrollData[tableId], 10);

        // Tính đúng/sai
        let correct = 0;
        let wrong = 0;
        if (history.length > 1) {
            if (predMap[result.prediction] === lastActual) {
                correct = 1;
                if (!historyCorrect[tableId]) historyCorrect[tableId] = { correct: 0, wrong: 0 };
                historyCorrect[tableId].correct++;
            } else {
                wrong = 1;
                if (!historyCorrect[tableId]) historyCorrect[tableId] = { correct: 0, wrong: 0 };
                historyCorrect[tableId].wrong++;
            }
        }

        const totalGames = historyCorrect[tableId] ? historyCorrect[tableId].correct + historyCorrect[tableId].wrong : 0;
        const winRate = totalGames > 0 ? Math.round((historyCorrect[tableId].correct / totalGames) * 100) : 0;

        res.json({
            success: true,
            table: `Bàn ${tableId}`,
            phiên: sessionData[tableId],
            
            // Dự đoán chính
            dự_đoán: result.prediction,
            tỉ_lệ: `${Math.max(result.banker, result.player, result.tie)}%`,
            
            // Chi tiết 3 cửa
            banker: `${result.banker}%`,
            player: `${result.player}%`,
            tie: `${result.tie}%`,
            
            // Thống kê đúng/sai
            đúng: historyCorrect[tableId] ? historyCorrect[tableId].correct : 0,
            sai: historyCorrect[tableId] ? historyCorrect[tableId].wrong : 0,
            tỉ_lệ_thắng_bàn: `${winRate}%`,
            
            // Kelly Criterion
            kelly: {
                bankerBet: `${kellyResult.bankerBet}$`,
                playerBet: `${kellyResult.playerBet}$`,
                tieBet: `${kellyResult.tieBet}$`,
                totalBet: `${kellyResult.totalBet}$`,
                bankroll: `${Math.round(kellyResult.bankroll)}$`,
                probabilities: kellyResult.probabilities,
                odds: kellyResult.odds
            },
            
            // Cầu
            cầu: result.pattern,
            confidence: `${result.confidence}%`,
            
            // Stats chi tiết
            stats: result.stats,
            algorithms: result.algorithms,
            
            is_new_data: isNewData,
            data_length: history.length,
            timestamp: new Date().toISOString(),
            id: '@tranhoang2286'
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// API DỰ ĐOÁN TẤT CẢ BÀN
// ============================================================
app.get('/api/predict/all', async (req, res) => {
    try {
        const tableIds = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', '1'];
        const results = [];

        for (const id of tableIds) {
            const history = await fetchTableData(id);
            if (history) {
                const lastDataKey = `table_${id}`;
                const oldData = lastData[lastDataKey] || '';
                const isNewData = (history !== oldData && history.length > oldData.length);
                lastData[lastDataKey] = history;

                if (!sessionData[id]) sessionData[id] = 0;
                if (isNewData) sessionData[id]++;

                const result = predictBCR(history);

                if (!bankrollData[id]) bankrollData[id] = 1000;
                const kellyResult = kellyAdaptive(history, bankrollData[id]);

                const predMap = { 'Banker': 'B', 'Player': 'P', 'Tie': 'T' };
                const lastActual = history[history.length - 1];
                const isCorrect = predMap[result.prediction] === lastActual;
                
                if (isCorrect) {
                    const odds = result.prediction === 'Banker' ? 0.95 : result.prediction === 'Player' ? 1 : 8;
                    bankrollData[id] += kellyResult.totalBet * odds;
                } else {
                    bankrollData[id] -= kellyResult.totalBet;
                }
                bankrollData[id] = Math.max(bankrollData[id], 10);

                let correct = 0;
                let wrong = 0;
                if (history.length > 1) {
                    if (predMap[result.prediction] === lastActual) {
                        correct = 1;
                        if (!historyCorrect[id]) historyCorrect[id] = { correct: 0, wrong: 0 };
                        historyCorrect[id].correct++;
                    } else {
                        wrong = 1;
                        if (!historyCorrect[id]) historyCorrect[id] = { correct: 0, wrong: 0 };
                        historyCorrect[id].wrong++;
                    }
                }

                const totalGames = historyCorrect[id] ? historyCorrect[id].correct + historyCorrect[id].wrong : 0;
                const winRate = totalGames > 0 ? Math.round((historyCorrect[id].correct / totalGames) * 100) : 0;

                results.push({
                    table: `Bàn ${id}`,
                    phiên: sessionData[id],
                    dự_đoán: result.prediction,
                    tỉ_lệ: `${Math.max(result.banker, result.player, result.tie)}%`,
                    banker: `${result.banker}%`,
                    player: `${result.player}%`,
                    tie: `${result.tie}%`,
                    đúng: historyCorrect[id] ? historyCorrect[id].correct : 0,
                    sai: historyCorrect[id] ? historyCorrect[id].wrong : 0,
                    tỉ_lệ_thắng_bàn: `${winRate}%`,
                    kelly: {
                        totalBet: `${Math.round(kellyResult.totalBet)}$`,
                        bankroll: `${Math.round(kellyResult.bankroll)}$`
                    },
                    cầu: result.pattern,
                    confidence: `${result.confidence}%`,
                    is_new_data: isNewData,
                    data_length: history.length
                });
            }
        }

        res.json({
            success: true,
            data: results,
            total: results.length,
            timestamp: new Date().toISOString(),
            id: '@tranhoang2286'
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// API RESET
// ============================================================
app.get('/api/reset/:tableId', (req, res) => {
    const tableId = req.params.tableId;
    if (sessionData[tableId] !== undefined) {
        sessionData[tableId] = 0;
        historyCorrect[tableId] = { correct: 0, wrong: 0 };
        bankrollData[tableId] = 1000;
        res.json({
            success: true,
            message: `Đã reset bàn ${tableId}`,
            id: '@tranhoang2286'
        });
    } else {
        res.json({
            success: false,
            message: `Không tìm thấy bàn ${tableId}`
        });
    }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        tables: Object.keys(sessionData).length,
        algorithms: ['Kelly', 'Streak', 'Zigzag', 'Pattern', 'Markov', 'Momentum', 'Entropy', 'Gap', 'Fibonacci', 'Harmonic', 'Correlation'],
        id: '@tranhoang2286'
    });
});

// ============================================================
// ROOT
// ============================================================
app.get('/', (req, res) => {
    res.json({
        name: 'BACCARAT PREDICTION - KELLY + SIÊU CẦU',
        version: '5.0.0',
        author: '@tranhoang2286',
        features: {
            dự_đoán: '3 cửa Banker, Player, Tie',
            tỉ_lệ: 'Tính toán không random',
            đúng_sai: 'So sánh với kết quả thực tế',
            tỉ_lệ_thắng: 'Của từng bàn',
            kelly: 'Kelly Criterion - Quản lý vốn'
        },
        algorithms: [
            'Kelly Criterion',
            'Streak Analysis',
            'Zigzag Analysis',
            'Pattern 2-2, 3-3, 4-4',
            'Markov Bậc 1 & 2',
            'Momentum & Acceleration',
            'Entropy Analysis',
            'Gap Analysis',
            'Fibonacci Analysis',
            'Harmonic Analysis',
            'Correlation Analysis'
        ],
        endpoints: {
            'Dự đoán 1 bàn': '/api/predict/:tableId',
            'Dự đoán tất cả': '/api/predict/all',
            'Reset': '/api/reset/:tableId',
            'Health': '/api/health'
        },
        tables: ['C01-C19', '1']
    });
});

// ============================================================
// KHỞI ĐỘNG
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log('🃏 BACCARAT PREDICTION - KELLY + SIÊU CẦU');
    console.log('========================================');
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log('📊 20 bàn: C01-C19 + Bàn 1');
    console.log('📌 Thuật toán: 11 luồng + Kelly');
    console.log('📌 Dự đoán: Banker | Player | Tie');
    console.log('📌 Tỉ lệ: Không random');
    console.log('📌 Đúng/Sai: Có');
    console.log('📌 Tỉ lệ thắng: Có');
    console.log('📌 Kelly: Quản lý vốn');
    console.log(`👤 Author: @tranhoang2286`);
    console.log('========================================');
});