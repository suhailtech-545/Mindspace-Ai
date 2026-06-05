"""
FastAPI service untuk classifier kuesioner MindSpace.

Mode utama:
- Memuat model asli mood_classifier.keras
- Memuat label_encoder.pkl

Mode cadangan:
- Jika TensorFlow/model belum siap, API tetap hidup dan mengembalikan rule-based fallback.
  Ini mencegah frontend mendapat error "fetch failed" saat demo.
"""

import os

# Harus diset sebelum TensorFlow di-import.
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import pickle
import time
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Union

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "mood_classifier.keras"
ENCODER_PATH = BASE_DIR / "models" / "label_encoder.pkl"
QUESTION_ORDER = ["mood", "tidur", "aktivitas", "energi", "stres", "sosial"]

app = FastAPI(title="MindSpace Keras Classifier API", version="1.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_model = None
_label_encoder = None
_tf = None
_startup_error: Optional[str] = None
_model_ready = False


class PredictRequest(BaseModel):
    answers: Union[Dict[str, float], List[float]] = Field(
        ...,
        description=(
            "Dict berisi mood, tidur, aktivitas, energi, stres, sosial "
            "atau list 6 angka skala 1-5."
        ),
    )


def normalize_label(label: str) -> str:
    value = str(label).strip().lower()
    mapping = {
        "distressed": "DISTRESSED",
        "stres": "DISTRESSED",
        "stress": "DISTRESSED",
        "low": "LOW",
        "cemas": "LOW",
        "neutral": "NEUTRAL",
        "netral": "NEUTRAL",
        "normal": "NEUTRAL",
        "good": "GOOD",
        "tenang": "GOOD",
        "great": "GREAT",
        "senang": "GREAT",
    }
    return mapping.get(value, value.upper() or "NEUTRAL")


def fallback_label_from_values(values: List[float]) -> Dict[str, object]:
    """Rule-based fallback agar API tetap responsif jika model .keras belum siap."""
    mood, tidur, aktivitas, energi, stres, sosial = values
    adjusted_score = mood + tidur + aktivitas + energi + (6 - stres) + sosial
    avg = adjusted_score / 6

    if stres >= 5 and (mood <= 2 or energi <= 2):
        label = "DISTRESSED"
    elif avg >= 4.5:
        label = "GREAT"
    elif avg >= 3.7:
        label = "GOOD"
    elif avg >= 2.8:
        label = "NEUTRAL"
    elif avg >= 2.0:
        label = "LOW"
    else:
        label = "DISTRESSED"

    confidence = min(0.92, max(0.55, abs(avg - 3) / 2 + 0.55))
    labels = ["DISTRESSED", "GOOD", "GREAT", "LOW", "NEUTRAL"]
    probabilities = {item: 0.05 for item in labels}
    probabilities[label] = round(confidence, 6)
    remaining = round((1 - confidence) / (len(labels) - 1), 6)
    probabilities = {item: (round(confidence, 6) if item == label else remaining) for item in labels}

    return {
        "label": label,
        "rawLabel": label,
        "confidence": round(float(confidence), 6),
        "confidencePercent": round(float(confidence) * 100, 2),
        "probabilities": probabilities,
        "fallback": True,
        "fallbackReason": _startup_error or "Model belum siap, memakai rule-based fallback.",
    }


def get_tensorflow():
    global _tf
    if _tf is not None:
        return _tf

    import tensorflow as tf  # lazy import supaya API tidak gagal saat modul dibaca

    _tf = tf
    return _tf


def build_attention_layer(tf):
    @tf.keras.utils.register_keras_serializable(package="Custom")
    class AttentionLayer(tf.keras.layers.Layer):
        """Custom layer yang dipakai oleh mood_classifier.keras."""

        def build(self, input_shape):
            self.attention_weights = self.add_weight(
                name="attention_weights",
                shape=(int(input_shape[-1]),),
                initializer="ones",
                trainable=True,
            )
            super().build(input_shape)

        def call(self, inputs):
            return inputs * self.attention_weights

    return AttentionLayer


def load_assets() -> None:
    """Load model .keras dan label_encoder.pkl sekali saat server hidup."""
    global _model, _label_encoder, _model_ready

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model tidak ditemukan: {MODEL_PATH}")
    if not ENCODER_PATH.exists():
        raise FileNotFoundError(f"Label encoder tidak ditemukan: {ENCODER_PATH}")

    tf = get_tensorflow()
    AttentionLayer = build_attention_layer(tf)

    print("Loading model Keras...")
    print(f"Model path: {MODEL_PATH}")

    load_kwargs = {
        "custom_objects": {"AttentionLayer": AttentionLayer},
        "compile": False,
    }

    try:
        _model = tf.keras.models.load_model(MODEL_PATH, safe_mode=False, **load_kwargs)
    except TypeError:
        _model = tf.keras.models.load_model(MODEL_PATH, **load_kwargs)

    print("Loading label encoder...")
    print(f"Encoder path: {ENCODER_PATH}")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with open(ENCODER_PATH, "rb") as file:
            _label_encoder = pickle.load(file)

    _model_ready = True
    print("Model dan label encoder berhasil dimuat.")


def warmup_model() -> None:
    if _model is None:
        return

    dummy_input = np.array([[3, 3, 3, 3, 3, 3]], dtype=np.float32)
    _ = _model(dummy_input, training=False).numpy()
    print("Warm-up selesai. Classifier siap digunakan.")


@app.on_event("startup")
def startup_event() -> None:
    global _startup_error, _model_ready
    try:
        load_assets()
        warmup_model()
    except Exception as exc:
        # Jangan matikan API. Frontend tetap bisa jalan memakai fallback.
        _model_ready = False
        _startup_error = str(exc)
        print(f"⚠️ Classifier Keras belum siap, fallback aktif: {_startup_error}")


def answers_to_array(answers: Union[Dict[str, float], List[float]]) -> np.ndarray:
    if isinstance(answers, list):
        values = answers
    else:
        missing = [key for key in QUESTION_ORDER if key not in answers]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Field jawaban kurang: {', '.join(missing)}",
            )
        values = [answers[key] for key in QUESTION_ORDER]

    if len(values) != 6:
        raise HTTPException(status_code=400, detail="Input harus berisi tepat 6 nilai.")

    try:
        numeric_values = [float(value) for value in values]
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Semua jawaban harus berupa angka.")

    invalid_values = [value for value in numeric_values if value < 1 or value > 5]
    if invalid_values:
        raise HTTPException(status_code=400, detail="Semua jawaban harus berada pada skala 1 sampai 5.")

    return np.array([numeric_values], dtype=np.float32)


@app.get("/")
def root():
    return {
        "message": "MindSpace Keras Classifier API aktif.",
        "health": "/health",
        "predict": "/predict",
    }


@app.get("/health")
def health():
    classes = []
    if _label_encoder is not None and hasattr(_label_encoder, "classes_"):
        classes = [str(label) for label in _label_encoder.classes_]

    return {
        "status": "ok",
        "service": "MindSpace Keras Classifier API",
        "model_loaded": _model is not None,
        "label_encoder_loaded": _label_encoder is not None,
        "model_ready": _model_ready,
        "fallback_available": True,
        "startup_error": _startup_error,
        "classes": classes,
        "input_order": QUESTION_ORDER,
    }


@app.post("/predict")
def predict(payload: PredictRequest):
    start_time = time.perf_counter()
    x = answers_to_array(payload.answers)
    values = x[0].tolist()

    if _model is None or _label_encoder is None:
        fallback = fallback_label_from_values(values)
        fallback.update({
            "inputOrder": QUESTION_ORDER,
            "inputValues": values,
            "processingTimeMs": round((time.perf_counter() - start_time) * 1000, 2),
        })
        return fallback

    try:
        prediction = _model(x, training=False).numpy()[0]
        predicted_index = int(np.argmax(prediction))
        raw_label = str(_label_encoder.inverse_transform([predicted_index])[0])
        normalized_label = normalize_label(raw_label)
        confidence = float(prediction[predicted_index])
        classes = [str(label) for label in _label_encoder.classes_]
        probabilities = {
            normalize_label(label): round(float(prob), 6)
            for label, prob in zip(classes, prediction)
        }

        return {
            "label": normalized_label,
            "rawLabel": raw_label,
            "confidence": round(confidence, 6),
            "confidencePercent": round(confidence * 100, 2),
            "probabilities": probabilities,
            "fallback": False,
            "inputOrder": QUESTION_ORDER,
            "inputValues": values,
            "processingTimeMs": round((time.perf_counter() - start_time) * 1000, 2),
        }
    except Exception as exc:
        # Jika inference Keras gagal saat runtime, jangan buat frontend error.
        global _startup_error
        _startup_error = f"Runtime prediction error: {exc}"
        fallback = fallback_label_from_values(values)
        fallback.update({
            "inputOrder": QUESTION_ORDER,
            "inputValues": values,
            "processingTimeMs": round((time.perf_counter() - start_time) * 1000, 2),
        })
        return fallback
