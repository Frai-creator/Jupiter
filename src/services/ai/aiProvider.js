// aiProvider.js
// Lapisan tipis ke penyedia AI.
//   1) Google Gemini  -> kalau GEMINI_API_KEY (atau GEMINI_API_KEYS, dipisah koma) diisi.
//      Mendukung banyak key: kalau satu kena limit, otomatis pindah ke key berikutnya.
//   2) Pollinations   -> fallback tanpa key (sama seperti yang dipakai /quiz). Nonaktifkan dengan AI_FALLBACK=false.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../utils/logger.js';

export class AiError extends Error {
    constructor(code, message) {
        super(message || code);
        this.name = 'AiError';
        this.code = code; // blocked | timeout | nokey | empty | network
    }
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 30_000;

let rotation = 0;
let warnedNoKey = false;

function getKeys() {
    const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

function fallbackEnabled() {
    return String(process.env.AI_FALLBACK ?? 'true').toLowerCase() !== 'false';
}

export function getProviderInfo() {
    const keys = getKeys();
    if (keys.length) {
        return { name: 'Google Gemini', model: process.env.GEMINI_MODEL || DEFAULT_MODEL, keys: keys.length };
    }
    return fallbackEnabled()
        ? { name: 'Pollinations (fallback)', model: 'openai', keys: 0 }
        : { name: 'Belum dikonfigurasi', model: '-', keys: 0 };
}

async function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new AiError('timeout', 'AI timeout')), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

async function callGemini(key, { system, history, text, images, temperature, maxTokens }) {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
        systemInstruction: system,
        generationConfig: { temperature, maxOutputTokens: maxTokens, topP: 0.95 },
    });

    const chat = model.startChat({
        history: history.map((h) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.text }],
        })),
    });

    const parts = [text, ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))];
    const result = await chat.sendMessage(parts);
    const response = result.response;

    if (response.promptFeedback?.blockReason) throw new AiError('blocked', response.promptFeedback.blockReason);

    let out = '';
    try {
        out = response.text();
    } catch {
        throw new AiError('blocked', 'response blocked');
    }
    if (!out || !out.trim()) throw new AiError('empty', 'empty response');
    return out.trim();
}

async function callPollinations({ system, history, text, temperature, maxTokens }) {
    const messages = [
        { role: 'system', content: system },
        ...history.map((h) => ({ role: h.role, content: h.text })),
        { role: 'user', content: text },
    ];

    const res = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'openai',
            messages,
            temperature: Math.min(Number(temperature) || 0.8, 1.5),
            max_tokens: maxTokens,
            private: true,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) throw new AiError('network', `Pollinations HTTP ${res.status}`);
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content;
    if (!out || !String(out).trim()) throw new AiError('empty', 'empty response');
    return String(out).trim();
}

/**
 * @param {{system:string, history:{role:'user'|'assistant', text:string}[], text:string,
 *          images?:{mimeType:string,data:string}[], temperature:number, maxTokens:number}} opts
 * @returns {Promise<{text:string, provider:string}>}
 */
export async function generateReply(opts) {
    const payload = { ...opts, images: opts.images || [] };
    const keys = getKeys();

    if (keys.length) {
        const start = rotation % keys.length;
        for (let i = 0; i < keys.length; i++) {
            const idx = (start + i) % keys.length;
            try {
                const text = await withTimeout(callGemini(keys[idx], payload), TIMEOUT_MS);
                rotation = idx;
                return { text, provider: 'gemini' };
            } catch (err) {
                if (err?.code === 'blocked') throw err;
                const status = err?.status ?? err?.response?.status ?? '-';
                logger.warn(`[AI] Gemini key #${idx + 1} gagal (status ${status}): ${err?.message || err}`);
                rotation = (idx + 1) % keys.length;
            }
        }
    } else if (!warnedNoKey) {
        warnedNoKey = true;
        logger.warn('[AI] GEMINI_API_KEY belum diisi, memakai fallback Pollinations (kualitas & kestabilan lebih rendah).');
    }

    if (!fallbackEnabled()) {
        throw new AiError(keys.length ? 'network' : 'nokey', 'Tidak ada provider AI yang tersedia');
    }

    try {
        const text = await callPollinations(payload);
        return { text, provider: 'pollinations' };
    } catch (err) {
        logger.warn(`[AI] Fallback Pollinations gagal: ${err?.message || err}`);
        throw err instanceof AiError ? err : new AiError('network', err?.message);
    }
}
