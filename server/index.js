import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  saveMoodAssessment,
  saveChatMessage,
  getRecentMoodStats,
} from "./mongo.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const CLASSIFIER_API_URL =
  process.env.CLASSIFIER_API_URL || "http://127.0.0.1:8000";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite";
const GEMINI_MAX_RETRIES = Number(process.env.GEMINI_MAX_RETRIES || 2);
const GEMINI_RETRY_DELAY_MS = Number(process.env.GEMINI_RETRY_DELAY_MS || 1200);
const CLASSIFIER_TIMEOUT_MS = Number(process.env.CLASSIFIER_TIMEOUT_MS || 10000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const allowedOrigins = new Set([
  CLIENT_ORIGIN,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5176",
]);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`Origin tidak diizinkan oleh CORS: ${origin}`));
    },
  }),
);

app.use(express.json({ limit: "2mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 250,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak request. Silakan coba lagi nanti." },
});
app.use("/api/", apiLimiter);

const geminiConfigured =
  Boolean(GEMINI_API_KEY) &&
  !GEMINI_API_KEY.includes("ISI_API_KEY") &&
  !GEMINI_API_KEY.includes("your_gemini_api_key_here") &&
  GEMINI_API_KEY.length > 20;

if (!geminiConfigured) {
  console.warn(
    "⚠️ GEMINI_API_KEY belum diisi dengan API key asli. Backend tetap berjalan memakai fallback lokal.",
  );
}

const genAI = geminiConfigured ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const systemInstruction = `Kamu adalah MindSpace AI, asisten dukungan kesehatan mental yang empatik, aman, dan ramah untuk pengguna Indonesia.

Kategori hasil kuesioner:
- Great: kondisi mental sangat baik. Berikan apresiasi dan tips menjaga konsistensi.
- Good: kondisi mental baik/stabil. Berikan motivasi ringan dan kebiasaan kecil yang sehat.
- Netral: kondisi biasa saja/menengah. Tanyakan hal kecil yang mungkin mengganjal dan berikan refleksi ringan.
- Low: kondisi mental sedang turun/rentan. Validasi perasaan dan berikan grounding/relaksasi awal.
- Distressed: kondisi sangat tertekan. Prioritaskan validasi, grounding, dan arahkan ke orang tepercaya/profesional bila terasa tidak aman.

Aturan mutlak:
1. Fokus hanya pada kesehatan mental, kesejahteraan diri, emosi, stres, kecemasan, tidur, kebiasaan sehat, relasi sosial, dan dukungan psikologis umum.
2. Jangan memberi diagnosis klinis dan jangan menggantikan psikolog/psikiater.
3. Jika ada indikasi menyakiti diri/orang lain atau kondisi darurat, arahkan segera ke layanan darurat, orang terdekat, atau tenaga profesional.
4. Gunakan bahasa Indonesia yang natural, singkat, dan praktis.
5. Hindari markdown tebal seperti **contoh** agar tampilan chat bersih.`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatus(error) {
  return error?.status || error?.response?.status || error?.cause?.status;
}

function isQuotaExceededError(error) {
  const message = String(error?.message || "").toLowerCase();
  const status = getStatus(error);
  return (
    status === 429 ||
    message.includes("quota exceeded") ||
    message.includes("too many requests") ||
    message.includes("free tier requests")
  );
}

function isTemporaryGeminiError(error) {
  const status = getStatus(error);
  const message = String(error?.message || "").toLowerCase();
  return (
    [429, 500, 502, 503, 504].includes(status) ||
    message.includes("high demand") ||
    message.includes("service unavailable") ||
    message.includes("quota exceeded") ||
    message.includes("too many requests")
  );
}

function normalizeLabel(label = "") {
  const value = String(label).trim().toLowerCase();
  if (["great", "senang", "sangat baik"].includes(value)) return "Great";
  if (["good", "tenang", "baik"].includes(value)) return "Good";
  if (["neutral", "netral", "normal", "biasa"].includes(value)) return "Netral";
  if (["low", "cemas", "rendah", "turun", "rentan"].includes(value)) return "Low";
  if (["distressed", "stres", "stress", "tertekan", "darurat"].includes(value)) {
    return "Distressed";
  }
  return "Netral";
}

function normalizeApiLabel(label = "") {
  const normalized = normalizeLabel(label);
  const mapping = {
    Great: "GREAT",
    Good: "GOOD",
    Netral: "NEUTRAL",
    Low: "LOW",
    Distressed: "DISTRESSED",
  };
  return mapping[normalized] || "NEUTRAL";
}

function getModel(modelName = GEMINI_MODEL) {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY belum tersedia atau masih placeholder.");
  }
  return genAI.getGenerativeModel({ model: modelName, systemInstruction });
}

function cleanText(text = "") {
  return String(text).replace(/\*\*/g, "").trim();
}

async function callGeminiWithRetry({ message, history = [], useChat = true }) {
  const modelsToTry = [
    ...new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL].filter(Boolean)),
  ];
  let lastError;

  for (const modelName of modelsToTry) {
    for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
      try {
        const model = getModel(modelName);
        if (useChat) {
          const chatSession = model.startChat({ history });
          const result = await chatSession.sendMessage(message);
          return {
            text: cleanText(result.response.text()),
            model: modelName,
            attempt,
            fallbackUsed: modelName !== GEMINI_MODEL,
          };
        }

        const result = await model.generateContent(message);
        return {
          text: cleanText(result.response.text()),
          model: modelName,
          attempt,
          fallbackUsed: modelName !== GEMINI_MODEL,
        };
      } catch (error) {
        lastError = error;
        const shouldRetry =
          isTemporaryGeminiError(error) && attempt < GEMINI_MAX_RETRIES;
        if (!shouldRetry) break;
        const delay = GEMINI_RETRY_DELAY_MS * attempt;
        console.warn(
          `Gemini ${modelName} gagal sementara: ${error.message}. Retry dalam ${delay}ms.`,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function ensureAnswerObject(answers) {
  if (Array.isArray(answers)) {
    const keys = ["mood", "tidur", "aktivitas", "energi", "stres", "sosial"];
    return Object.fromEntries(keys.map((key, index) => [key, Number(answers[index] || 3)]));
  }
  return answers || {};
}

function validateAndNormalizeAnswers(answers) {
  const normalized = ensureAnswerObject(answers);
  const keys = ["mood", "tidur", "aktivitas", "energi", "stres", "sosial"];
  const output = {};

  for (const key of keys) {
    const value = Number(normalized[key]);
    output[key] = Number.isFinite(value) ? Math.min(5, Math.max(1, value)) : 3;
  }

  return output;
}

function fallbackClassifyAnswers(answers) {
  const safe = validateAndNormalizeAnswers(answers);
  const adjustedScore =
    safe.mood +
    safe.tidur +
    safe.aktivitas +
    safe.energi +
    (6 - safe.stres) +
    safe.sosial;
  const avg = adjustedScore / 6;

  let label = "NEUTRAL";
  if (safe.stres >= 5 && (safe.mood <= 2 || safe.energi <= 2)) label = "DISTRESSED";
  else if (avg >= 4.5) label = "GREAT";
  else if (avg >= 3.7) label = "GOOD";
  else if (avg >= 2.8) label = "NEUTRAL";
  else if (avg >= 2.0) label = "LOW";
  else label = "DISTRESSED";

  const confidence = Math.min(0.92, Math.max(0.55, Math.abs(avg - 3) / 2 + 0.55));
  const labels = ["DISTRESSED", "GOOD", "GREAT", "LOW", "NEUTRAL"];
  const remaining = Number(((1 - confidence) / (labels.length - 1)).toFixed(6));
  const probabilities = Object.fromEntries(
    labels.map((item) => [item, item === label ? Number(confidence.toFixed(6)) : remaining]),
  );

  return {
    label,
    rawLabel: label,
    confidence: Number(confidence.toFixed(6)),
    confidencePercent: Number((confidence * 100).toFixed(2)),
    probabilities,
    fallback: true,
    fallbackReason: "Python classifier belum bisa dihubungi, memakai rule-based fallback.",
    inputOrder: ["mood", "tidur", "aktivitas", "energi", "stres", "sosial"],
    inputValues: [safe.mood, safe.tidur, safe.aktivitas, safe.energi, safe.stres, safe.sosial],
  };
}

async function classifyQuestionnaire(answers) {
  const safeAnswers = validateAndNormalizeAnswers(answers);
  try {
    const { response, data } = await fetchJsonWithTimeout(
      `${CLASSIFIER_API_URL}/predict`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: safeAnswers }),
      },
      CLASSIFIER_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(data?.detail || data?.error || "Classifier Python gagal memproses kuesioner.");
    }

    return {
      ...data,
      label: normalizeApiLabel(data?.label || data?.rawLabel),
      fallback: Boolean(data?.fallback),
    };
  } catch (error) {
    console.warn("Classifier Python tidak tersedia, fallback lokal dipakai:", error.message);
    return fallbackClassifyAnswers(safeAnswers);
  }
}

function createFallbackAdvice(label = "Netral", options = {}) {
  const value = normalizeLabel(label);
  const age = options.age || "-";
  const answers = validateAndNormalizeAnswers(options.answers || {});

  if (value === "Distressed") {
    return `Aku menangkap kondisimu sedang cukup berat. Ini bukan diagnosis, tetapi sinyal bahwa kamu perlu memperlakukan diri dengan lembut. Coba grounding 5-4-3-2-1: sebutkan 5 hal yang kamu lihat, 4 hal yang kamu rasakan, 3 hal yang kamu dengar, 2 hal yang kamu cium, dan 1 hal kecil yang bisa kamu syukuri. Jika kamu merasa tidak aman atau muncul dorongan menyakiti diri, segera hubungi orang terdekat, tenaga profesional, atau layanan darurat setempat.`;
  }

  if (value === "Low") {
    return `Kondisimu terlihat sedang menurun, dan itu valid. Di usia ${age}, tekanan harian kadang terasa menumpuk. Coba mulai dari langkah kecil: minum air, tarik napas perlahan, tulis satu hal yang paling membebani, lalu pilih satu tindakan kecil yang bisa dilakukan hari ini.`;
  }

  if (value === "Netral") {
    return `Kondisimu terlihat cukup stabil, tetapi mungkin ada hal kecil yang masih mengganggu. Coba cek kebutuhan dasar: tidur, makan, istirahat, dan ruang untuk bercerita. Tingkat stresmu tercatat ${answers.stres}/5, jadi beri waktu sejenak untuk memahami apa yang paling memengaruhi harimu.`;
  }

  if (value === "Good") {
    return `Kondisimu terlihat baik dan cukup stabil. Pertahankan rutinitas sehat seperti tidur cukup, aktivitas ringan, dan tetap terhubung dengan orang yang suportif. Pilih satu kebiasaan baik yang sudah berhasil dan ulangi secara konsisten.`;
  }

  return `Luar biasa, kondisimu terlihat sangat positif. Pertahankan konsistensi dengan menjaga pola tidur, aktivitas fisik ringan, relasi sehat, dan waktu untuk diri sendiri. Rayakan progres kecilmu hari ini.`;
}

function createLocalChatReply(message = "", questionnaireLabel) {
  const text = String(message).toLowerCase();
  const context = questionnaireLabel ? `Berdasarkan check-in terakhir (${normalizeLabel(questionnaireLabel)}), ` : "";

  if (/bunuh diri|menyakiti diri|self harm|mati saja|akhiri hidup|suicide/i.test(text)) {
    return `${context}aku sangat peduli dengan keselamatanmu. Tolong jangan hadapi ini sendirian. Hubungi orang terdekat sekarang, pergi ke tempat yang aman, atau hubungi layanan darurat setempat. Jika kamu di Indonesia, kamu juga bisa mencari bantuan tenaga profesional/IGD terdekat. Aku bisa menemanimu menyusun kalimat singkat untuk meminta bantuan.`;
  }

  if (/mempertahankan|pertahankan|jaga|konsisten|stabil/i.test(text)) {
    return `${context}cara mempertahankannya adalah dengan membuat rutinitas kecil yang realistis: tidur di jam yang mirip setiap hari, bergerak ringan 10-15 menit, tetap terhubung dengan satu orang suportif, dan menulis 1 hal yang kamu syukuri. Jangan mengejar sempurna; cukup ulangi kebiasaan kecil yang membuatmu merasa lebih stabil.`;
  }

  if (/cemas|khawatir|gelisah|takut|overthinking/i.test(text)) {
    return `${context}rasa cemas itu valid. Coba tarik napas 4 detik, tahan 4 detik, lalu buang 6 detik sebanyak 5 kali. Setelah itu, tulis: “apa yang bisa aku kontrol sekarang?” dan pilih satu langkah kecil.`;
  }

  if (/stres|stress|capek|lelah|burnout|berat/i.test(text)) {
    return `${context}kedengarannya kamu sedang terbebani. Coba turunkan target untuk sementara: pilih satu tugas paling kecil, kerjakan 10 menit, lalu istirahat. Kamu tidak harus menyelesaikan semuanya sekaligus.`;
  }

  return `${context}aku dengar ceritamu. Coba ceritakan sedikit lebih spesifik: bagian mana yang paling terasa berat atau paling ingin kamu pertahankan? Dari situ kita bisa susun langkah kecil yang aman dan realistis.`;
}

function extractMessageText(message) {
  return String(
    message?.text || message?.content || message?.message || message?.parts?.[0]?.text || "",
  ).trim();
}

function normalizeGeminiHistory(messages = []) {
  const raw = Array.isArray(messages) ? messages : [];
  const compacted = [];

  for (const message of raw.slice(-16)) {
    const text = extractMessageText(message);
    if (!text) continue;

    const sender = String(message?.sender || message?.role || "").toLowerCase();
    const role = ["ai", "assistant", "bot", "model"].includes(sender) ? "model" : "user";
    const previous = compacted[compacted.length - 1];

    if (previous?.role === role) {
      previous.parts[0].text += `\n${text}`;
    } else {
      compacted.push({ role, parts: [{ text }] });
    }
  }

  while (compacted.length > 0 && compacted[0].role !== "user") {
    compacted.shift();
  }

  // Jangan kirim history yang berakhir user, karena message baru juga role user.
  while (compacted.length > 0 && compacted[compacted.length - 1].role !== "model") {
    compacted.pop();
  }

  return compacted.slice(-10);
}

app.get("/health", async (req, res) => {
  res.json({
    status: "ok",
    service: "MindSpace Gemini Backend",
    port: PORT,
    classifierApiUrl: CLASSIFIER_API_URL,
    geminiConfigured,
    geminiModel: GEMINI_MODEL,
    geminiFallbackModel: GEMINI_FALLBACK_MODEL,
    mongoEnabled: Boolean(process.env.MONGODB_URI),
  });
});

app.post("/api/classifier", async (req, res) => {
  const { answers } = req.body || {};
  const classifier = await classifyQuestionnaire(answers || {});
  res.json(classifier);
});

app.post("/api/kuesioner", async (req, res) => {
  const { label, age, answers, score } = req.body || {};
  const safeAnswers = validateAndNormalizeAnswers(answers || {});
  const classifierResult = await classifyQuestionnaire(safeAnswers);
  const normalizedLabel = normalizeLabel(label || classifierResult?.label);

  const promptTersembunyi = `Konteks tersembunyi dari website:
Pengguna baru mengisi kuesioner kesejahteraan mental.
Kategori hasil: ${normalizedLabel}
Usia pengguna: ${age || "tidak disebutkan"}
Skor ringkas: ${score ?? "tidak tersedia"}
Jawaban skala 1-5: ${JSON.stringify(safeAnswers)}
Classifier: ${JSON.stringify(classifierResult)}

Tugas:
1. Sapa dengan empatik berdasarkan hasil.
2. Jelaskan secara non-diagnostik.
3. Berikan 3 rekomendasi praktis.
4. Akhiri dengan pertanyaan ringan agar pengguna mau lanjut chat.
5. Gunakan bahasa Indonesia natural tanpa markdown tebal.`;

  let responseText = createFallbackAdvice(normalizedLabel, { age, answers: safeAnswers });
  let geminiInfo = { model: "local-fallback", fallbackUsed: true, localFallback: true };

  try {
    const gemini = await callGeminiWithRetry({
      message: promptTersembunyi,
      useChat: false,
    });
    responseText = gemini.text || responseText;
    geminiInfo = gemini;
  } catch (error) {
    console.warn("Gemini kuesioner tidak tersedia, fallback lokal dipakai:", error.message);
  }

  saveMoodAssessment({
    userId: req.body?.userId || "anonymous",
    age: age || null,
    score: score ?? null,
    answers: safeAnswers,
    label: normalizedLabel,
    classifier: classifierResult,
    aiAdvice: responseText,
    source: "questionnaire",
    geminiModel: geminiInfo.model,
    geminiFallbackUsed: geminiInfo.fallbackUsed,
  }).catch((mongoError) => {
    console.warn("MongoDB mood save skipped/error:", mongoError.message);
  });

  res.json({
    balasan: responseText,
    label: normalizeApiLabel(normalizedLabel),
    classifier: classifierResult,
    model: geminiInfo.model,
    fallbackUsed: geminiInfo.fallbackUsed,
    localFallback: geminiInfo.localFallback || false,
  });
});

app.post("/api/chat", async (req, res) => {
  const { message, history = [], questionnaireLabel } = req.body || {};
  const messageStr = String(message || "").trim();

  if (!messageStr) {
    return res.status(400).json({ error: "Pesan tidak boleh kosong." });
  }

  const normalizedHistory = normalizeGeminiHistory(history);
  const labelContext = questionnaireLabel
    ? `Konteks check-in terakhir pengguna: ${normalizeLabel(questionnaireLabel)}. Gunakan konteks ini secara halus.\n\n`
    : "";

  let replyText = createLocalChatReply(messageStr, questionnaireLabel);
  let geminiInfo = { model: "local-fallback", fallbackUsed: true, localFallback: true };

  try {
    const gemini = await callGeminiWithRetry({
      message: `${labelContext}${messageStr}`,
      history: normalizedHistory,
      useChat: true,
    });
    replyText = gemini.text || replyText;
    geminiInfo = gemini;
  } catch (error) {
    console.warn("Gemini chat tidak tersedia, fallback lokal dipakai:", error.message);
  }

  Promise.allSettled([
    saveChatMessage({
      userId: req.body?.userId || "anonymous",
      chatId: req.body?.chatId || null,
      sender: "user",
      text: messageStr,
    }),
    saveChatMessage({
      userId: req.body?.userId || "anonymous",
      chatId: req.body?.chatId || null,
      sender: "ai",
      text: replyText,
      geminiModel: geminiInfo.model,
      geminiFallbackUsed: geminiInfo.fallbackUsed,
    }),
  ]).catch(() => {});

  res.json({
    balasan: replyText,
    model: geminiInfo.model,
    fallbackUsed: geminiInfo.fallbackUsed,
    localFallback: geminiInfo.localFallback || false,
  });
});

app.get("/api/analytics/mood-summary", async (req, res) => {
  try {
    const stats = await getRecentMoodStats(Number(req.query.limit || 100));
    if (!stats) {
      return res.json({
        mongoEnabled: false,
        message: "MONGODB_URI belum diisi; analytics memakai state React lokal.",
        total: 0,
        labelCounts: {},
      });
    }

    res.json({ mongoEnabled: true, ...stats });
  } catch (error) {
    console.error("Error /api/analytics/mood-summary:", error);
    res.json({
      mongoEnabled: false,
      message: "Analytics MongoDB belum tersedia.",
      total: 0,
      labelCounts: {},
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
});

app.use((err, req, res, next) => {
  console.error("Unhandled backend error:", err);
  res.status(500).json({
    error: "Terjadi kesalahan backend, tetapi server tetap aktif.",
    detail: process.env.NODE_ENV === "production" ? undefined : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`✅ MindSpace backend berjalan di http://localhost:${PORT}`);
  if (!geminiConfigured) {
    console.log("ℹ️ Isi GEMINI_API_KEY di .env agar jawaban memakai Gemini. Tanpa key, fallback lokal tetap jalan.");
  }
});
