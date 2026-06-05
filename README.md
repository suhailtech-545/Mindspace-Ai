# MindSpace AI — Mental Health Companion Web App

**Non-diagnostic mental health support application combining React, Express.js, FastAPI, TensorFlow/Keras, and Google Gemini API.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ⚠️ Disclaimer

MindSpace AI is **not a medical diagnosis tool**. It provides:

- Initial mental health reflection
- Evidence-based self-care recommendations
- AI-powered supportive conversation

For mental health emergencies, always contact:

- Local emergency services
- Mental health professionals
- Crisis hotlines in your country

---

## 🎯 Features

✅ **Daily Mental Health Questionnaire** - 6-parameter Likert scale assessment  
✅ **ML-Based Mood Classification** - Keras classifier for mood prediction  
✅ **AI Chat Assistant** - Personalized responses via Google Gemini  
✅ **Analytics Dashboard** - Mood tracking with visualizations  
✅ **Secure Authentication** - Firebase Auth integration  
✅ **Data Persistence** - Optional MongoDB for history tracking  
✅ **Dark Theme UI** - React + Tailwind CSS responsive design

---

## 🏗️ Architecture

### Tech Stack

- **Frontend**: React 19 + Vite + Tailwind CSS
- **Backend**: Express.js (Node.js)
- **ML Inference**: FastAPI (Python) with TensorFlow/Keras
- **AI**: Google Gemini API (generative responses)
- **Database**: MongoDB (optional) + Firebase Auth
- **Data Science**: Pandas, NumPy, scikit-learn

### Folder Structure

```
├── src/                    # React frontend
├── server/                 # Express.js backend + Gemini integration
├── ml_api/                 # FastAPI classifier service
│   ├── models/            # Keras model + label encoder
│   └── training/          # Model training scripts
├── data_science/          # Data wrangling & EDA
├── data_dictionary/       # Feature documentation
├── ds_dashboard/          # Streamlit analytics (optional)
└── public/                # Static assets
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- **Python 3.10+**
- **Google Gemini API Key** ([Get here](https://makersuite.google.com/app/apikey))

### 1. Setup Environment

```bash
# Copy and configure environment variables
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY and other credentials
```

### 2. Install Dependencies

```bash
# Node.js dependencies
npm install

# Python ML API dependencies
python -m venv .venv
.\.venv\Scripts\Activate.ps1    # Windows
source .venv/bin/activate        # macOS/Linux
pip install -r ml_api/requirements.txt
```

### 3. Run All Services (3 terminals)

**Terminal 1 - ML Classifier API:**

```bash
npm run dev:classifier
# Runs on http://127.0.0.1:8000
```

**Terminal 2 - Express Backend:**

```bash
npm run dev:server
# Runs on http://localhost:3000
```

**Terminal 3 - React Frontend:**

```bash
npm run dev
# Runs on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## 📋 Available Scripts

```bash
# Frontend
npm run dev              # Start Vite dev server
npm run build           # Build for production
npm run lint            # Run ESLint

# Backend
npm run dev:server      # Start Express with file watching
npm run server          # Start Express (production)

# ML API
npm run dev:classifier  # Start FastAPI dev server
npm run train:classifier # Retrain Keras model

# Data Science
npm run data:prep       # Run data wrangling & EDA
npm run data:abtest     # Run A/B testing evaluation
npm run dashboard:streamlit # Start Streamlit dashboard
```

---

## 🔐 Security Notes

### Environment Variables

- **NEVER commit .env file** to version control
- Keep API keys in `.env` (already in `.gitignore`)
- Use `.env.example` as template for setup

### Backend Security Features

- ✅ Helmet.js security headers
- ✅ Rate limiting (100 requests/15min general, 30 for sensitive endpoints)
- ✅ CORS protection with origin whitelist
- ✅ Request size limits (1MB JSON max)
- ✅ Input validation on all endpoints
- ✅ Production error message filtering

### Production Deployment

Before deploying to production:

1. Update `CLIENT_ORIGIN` in `.env` to your domain
2. Add production MongoDB URI (not required but recommended)
3. Enable rate limiting
4. Use HTTPS everywhere
5. Rotate API keys regularly
6. Monitor error logs

---

## 📊 API Endpoints

### Health Check

```bash
GET /health
```

### Mood Classification

```bash
POST /api/classifier
Body: { answers: { mood: 5, tidur: 4, ... } }
```

### AI Chat

```bash
POST /api/chat
Body: { message: "...", history: [...], questionnaireLabel: "Great" }
```

### Analytics

```bash
GET /api/analytics/mood-summary
```

---

## 🧠 ML Model Info

- **Model**: TensorFlow Keras Sequential
- **Features**: 6 mental health parameters (mood, sleep, activity, energy, stress, social)
- **Classes**: 5 mood states (Great, Good, Neutral, Low, Distressed)
- **Location**: `ml_api/models/mood_classifier.keras`

---

## 🤝 Contributing

This is a personal project, but improvements are welcome!

1. Fork the repository
2. Create feature branch (`git checkout -b feature/improvement`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/improvement`)
5. Open Pull Request

---

## 📝 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

- **Google Gemini API** for generative AI responses
- **Firebase** for authentication
- **TensorFlow/Keras** for ML classification
- **React & Vite** ecosystem

---

## 📧 Support

For issues, feature requests, or questions:

- Open an issue on GitHub
- Check existing documentation in `/data_dictionary`

**Remember: This tool is for self-reflection only. Always consult mental health professionals for serious concerns.**

npm run data:prep

````

Jalankan A/B testing:

```bash
npm run data:abtest
````

Buka dashboard Streamlit:

```bash
npm run dashboard:streamlit
```

## Training Model Keras

Source code training tersedia di:

```text
ml_api/training/train_mood_classifier.py
notebooks/01_mindspace_training_pipeline.ipynb
```

Jalankan training:

```bash
npm run train:classifier
```

Training menggunakan:

- TensorFlow Functional API.
- Custom Layer `AttentionLayer`.
- Custom Callback `StopAtMetric`.
- TensorBoard callback.
- Custom evaluation loop.
- Export ke `ml_api/models/mood_classifier.keras`.
- Export encoder ke `ml_api/models/label_encoder.pkl`.

Buka TensorBoard:

```bash
tensorboard --logdir ml_api/training/tensorboard_logs
```

## Checklist Perbaikan

### Full Stack Developer

- Front-end React responsif: `src/`.
- Back-end Express: `server/index.js`.
- Integrasi ML: `/api/classifier` dan `/api/kuesioner`.
- Integrasi Gemini: `/api/chat` dan `/api/kuesioner`.
- Axios API client: `src/api/client.js`.
- MongoDB opsional: `server/mongo.js`.

### AI Engineer

- Model `.keras`: `ml_api/models/mood_classifier.keras`.
- Label encoder `.pkl`: `ml_api/models/label_encoder.pkl`.
- FastAPI inference: `ml_api/app.py`.
- Training source code: `ml_api/training/train_mood_classifier.py`.
- Custom Layer: `AttentionLayer`.
- Custom Callback: `StopAtMetric`.
- TensorBoard: `ml_api/training/tensorboard_logs/`.
- Generative AI: Google Gemini di `server/index.js`.

### Data Science

- Data wrangling/EDA/feature engineering: `data_science/01_data_wrangling_eda_feature_engineering.py`.
- Data dictionary: `data_dictionary/`.
- Streamlit dashboard: `ds_dashboard/streamlit_app.py`.
- A/B testing: `data_science/02_ab_testing_evaluation.py`.
- Laporan teknis: `data_science/technical_report.md`.

## File yang Jangan Di-upload ke GitHub

Pastikan file berikut tidak ikut commit:

```text
.env
.venv/
node_modules/
dist/
build/
__pycache__/
*.pyc
```
