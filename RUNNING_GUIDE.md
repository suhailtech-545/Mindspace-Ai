# Cara Menjalankan MindSpace AI

Project ini terdiri dari 3 server utama. Jalankan di 3 terminal berbeda.

## Pertama kali setelah extract ZIP

```powershell
cd "E:\Dicoding\6\mindspace-ai-main"
npm config set registry https://registry.npmjs.org/
npm install --registry=https://registry.npmjs.org/
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip setuptools wheel
pip install -r ml_api/requirements.txt
```

Copy `.env.example` menjadi `.env`, lalu isi API key Gemini baru.

## Terminal 1 - Classifier Keras

```powershell
cd "E:\Dicoding\6\mindspace-ai-main"
.\.venv\Scripts\Activate.ps1
$env:TF_ENABLE_ONEDNN_OPTS="0"
npm run dev:classifier
```

Cek: http://127.0.0.1:8000/health

## Terminal 2 - Backend Node/Gemini

```powershell
cd "E:\Dicoding\6\mindspace-ai-main"
npm run dev:server
```

Cek: http://localhost:3000/health

## Terminal 3 - Frontend React

```powershell
cd "E:\Dicoding\6\mindspace-ai-main"
npm run dev
```

Buka: http://localhost:5173

## Opsional - Streamlit Dashboard

```powershell
cd "E:\Dicoding\6\mindspace-ai-main"
.\.venv\Scripts\Activate.ps1
npm run dashboard:streamlit
```

Buka: http://localhost:8501

## Catatan

- Kalau Gemini sedang overload atau API key belum diisi, backend tetap membalas dengan fallback lokal.
- Kalau Python classifier belum aktif, backend tetap mengembalikan hasil fallback agar website tidak crash.
- Untuk memenuhi checklist AI, tetap jalankan classifier Keras saat demo.
