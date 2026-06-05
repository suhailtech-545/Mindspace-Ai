"""
Dashboard Streamlit untuk analitik MindSpace.

Jalankan dari root project:
    streamlit run ds_dashboard/streamlit_app.py
"""

from pathlib import Path
import pandas as pd
import streamlit as st
import plotly.express as px

# --- CONFIG & PATH SETUP ---
ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "processed" / "feature_engineered_mood_dataset.csv"
RAW_FALLBACK = ROOT / "data" / "raw" / "sample_mood_dataset.csv"

st.set_page_config(page_title="MindSpace Analytics", layout="wide")

# --- CUSTOM CSS ---
st.markdown("""
    <style>
    .block-container { padding-top: 2rem; padding-bottom: 2rem; }
    h1 { color: #2E4057; }
    h2 { color: #4A90E2; border-bottom: 1px solid #E0E0E0; padding-bottom: 5px; }
    .user-box { padding: 15px; background-color: #F8F9FA; border-radius: 10px; border-left: 5px solid #4A90E2; }
    </style>
""", unsafe_allow_html=True)

st.title("🧠 MindSpace Mood Analytics Dashboard")
st.caption("Dashboard analitik interaktif hasil kuesioner, distribusi mood, analisis korelasi, dan evaluasi A/B testing.")

# --- DATA LOADING FUNCTION ---
@st.cache_data
def load_data() -> pd.DataFrame:
    path = DATA_PATH if DATA_PATH.exists() else RAW_FALLBACK
    df = pd.read_csv(path)
    # Konversi ke datetime murni
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
    # Ekstrak tanggalnya saja untuk pengelompokan harian
    df["created_date"] = pd.to_datetime(df["created_at"].dt.date)
    return df

df = load_data()
QUESTION_COLUMNS = ["mood", "tidur", "aktivitas", "energi", "stres", "sosial"]

# --- DETEKSI OTOMATIS NAMA KOLOM UMUR (Mencegah KeyError 'usia' / 'age') ---
AGE_COL = "usia" if "usia" in df.columns else ("age" if "age" in df.columns else None)

# --- SIDEBAR FILTERS & MODE NAVIGATION ---
with st.sidebar:
    st.header("🎛️ Panel Kontrol")
    st.write("Pilih mode tampilan dashboard untuk menyesuaikan analisis data.")
    
    # Mode Dashboard
    view_mode = st.radio(
        "Mode Tampilan Dashboard", 
        ["Analitik Bisnis (Semua User)", "Profil Spesifik Per User"]
    )
    
    st.markdown("---")
    
    if view_mode == "Analitik Bisnis (Semua User)":
        st.subheader("Filter Data Makro")
        
        # 1. Filter Label Mood
        labels = sorted(df["label"].dropna().unique().tolist())
        selected_labels = st.multiselect("Label Mood Pengguna", labels, default=labels)
        
        # 2. Filter A/B Group
        if "ab_group" in df.columns:
            groups = sorted(df["ab_group"].dropna().unique().tolist())
            selected_groups = st.multiselect("A/B group", groups, default=groups)
        else:
            selected_groups = []
        
        # 3. Slider Rentang Umur (Otomatis menyesuaikan nama kolom dataset)
        if AGE_COL:
            selected_age = st.slider(
                "Rentang Umur", 
                min_value=15, 
                max_value=35, 
                value=(15, 35), 
                step=1
            )
        else:
            selected_age = (15, 35)
            
    else:
        st.subheader("Navigasi Data Mikro")
        user_ids = df.index.tolist()
        selected_user = st.selectbox(
            "Pilih ID Pengguna", 
            user_ids, 
            format_func=lambda x: f"User ID: MD-2026-{x:04d}"
        )

# ==========================================
# MODE 1: ANALITIK BISNIS (SEMUA DATA USER)
# ==========================================
if view_mode == "Analitik Bisnis (Semua User)":
    
    # --- PROSES FILTER DATA GLOBAL ---
    filtered = df[df["label"].isin(selected_labels)]
    
    if "ab_group" in filtered.columns and selected_groups:
        filtered = filtered[filtered["ab_group"].isin(selected_groups)]
        
    if AGE_COL and AGE_COL in filtered.columns:
        filtered = filtered[(filtered[AGE_COL] >= selected_age[0]) & (filtered[AGE_COL] <= selected_age[1])]

    # --- METRIK UTAMA ---
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("📊 Total Respons", f"{len(filtered):,}")
    with col2:
        avg_wellbeing = filtered.get("wellbeing_score", pd.Series([0])).mean()
        st.metric("✨ Rata-rata Wellbeing", f"{avg_wellbeing:.2f}")
    with col3:
        avg_stress = filtered.get("stres", pd.Series([0])).mean()
        st.metric("🔥 Rata-rata Stres", f"{avg_stress:.2f} / 5")
    with col4:
        if "completed_recommendation" in filtered.columns:
            comp_rate = filtered["completed_recommendation"].mean() * 100
            st.metric("✅ Completion Rate Total", f"{comp_rate:.1f}%")
        else:
            st.metric("✅ Completion Rate Total", "N/A")

    st.markdown("---")

    # --- USER WELLBEING INSIGHTS ---
    st.header("📊 Analisis & Profil Mood Pengguna Global")
    left_col, right_col = st.columns(2)

    with left_col:
        st.subheader("Distribusi Kategori Mood")
        label_counts = filtered["label"].value_counts().reset_index()
        label_counts.columns = ["Kategori Mood", "Jumlah Responden"]
        
        fig_labels = px.bar(
            label_counts, 
            x="Kategori Mood", 
            y="Jumlah Responden", 
            color="Kategori Mood",
            text_auto=True, 
            labels={"Kategori Mood": "Kategori Mood", "Jumlah Responden": "Jumlah Responden"},
            color_discrete_sequence=px.colors.qualitative.Pastel
        )
        fig_labels.update_layout(showlegend=False, height=350, margin=dict(t=10, b=10, l=10, r=10))
        st.plotly_chart(fig_labels, use_container_width=True)

    with right_col:
        st.subheader("Tren Harian Wellbeing Score")
        if "created_date" in filtered.columns and "wellbeing_score" in filtered.columns:
            trend = filtered.dropna(subset=["created_date"]).groupby("created_date")["wellbeing_score"].mean().reset_index()
            trend = trend.sort_values("created_date")
            
            # Pastikan tipe data kolom x adalah datetime asli
            trend["created_date"] = pd.to_datetime(trend["created_date"])
            
            fig_trend = px.line(
                trend, 
                x="created_date", 
                y="wellbeing_score", 
                markers=True,
                labels={"created_date": "Tanggal", "wellbeing_score": "Rata-Rata Wellbeing"}
            )
            fig_trend.update_traces(line_color='#4A90E2', line_width=2)
    
            fig_trend.update_xaxes(
                type='date',                   
                tickformat="%d/%m/%y",         
                tickangle=45,                  
                tickmode='array',              
                tickvals=trend["created_date"],
                showgrid=True,                 
                gridcolor='#EAEAEA'            
            )
            
            fig_trend.update_yaxes(
                showgrid=True,                 
                gridcolor='#EAEAEA'            
            )
            
            fig_trend.update_layout(height=350, margin=dict(t=10, b=10, l=10, r=10))
            st.plotly_chart(fig_trend, use_container_width=True)
        else:
            st.info("Data tanggal atau wellbeing_score belum tersedia.")

    st.markdown("---")

    # --- ANALISIS KORELASI (HEATMAP) ---
    st.header("🔗 Analisis Korelasi Antar Faktor (Heatmap)")
    st.write("Melihat seberapa kuat hubungan antar jawaban kuesioner pengguna secara global.")
    
    corr_cols = [c for c in QUESTION_COLUMNS if c in filtered.columns]
    if "wellbeing_score" in filtered.columns:
        corr_cols.append("wellbeing_score")
        
    if len(corr_cols) > 1:
        corr_matrix = filtered[corr_cols].corr(numeric_only=True)
        
        fig_heatmap = px.imshow(
            corr_matrix,
            text_auto=".2f", 
            aspect="auto",
            color_continuous_scale=px.colors.sequential.RdBu_r, 
            labels=dict(color="Korelasi"),
            x=corr_cols,
            y=corr_cols
        )
        fig_heatmap.update_layout(height=450, margin=dict(t=20, b=20, l=20, r=20))
        st.plotly_chart(fig_heatmap, use_container_width=True)
    else:
        st.info("Kolom kuesioner tidak mencukupi untuk membuat matriks korelasi.")

    st.markdown("---")

    # --- ADVANCED INSIGHTS FROM FEATURE ENGINEERING ---
    st.header("🕵️ Analisis Celah Fitur Kesehatan Mental")
    col_eng1, col_eng2 = st.columns(2)

    with col_eng1:
        if "sleep_energy_gap" in filtered.columns:
            st.markdown("**Celah Kualitas Tidur vs Energi Pengguna (`sleep_energy_gap`)**")
            gap_by_mood = filtered.groupby("label")["sleep_energy_gap"].mean().reset_index()
            gap_by_mood.columns = ["Kategori Mood", "sleep_energy_gap"]
            
            fig_gap = px.bar(gap_by_mood, x="Kategori Mood", y="sleep_energy_gap", color="sleep_energy_gap",
                             labels={"Kategori Mood": "Kategori Mood", "sleep_energy_gap": "Rata-Rata Celah"},
                             color_continuous_scale=px.colors.sequential.Viridis)
            fig_gap.update_layout(height=300, showlegend=False)
            st.plotly_chart(fig_gap, use_container_width=True)

    with col_eng2:
        if "risk_index" in filtered.columns:
            st.markdown("**Indeks Risiko Pengguna Berdasarkan Kategori Mood (`risk_index`)**")
            risk_by_mood = filtered.groupby("label")["risk_index"].mean().reset_index()
            risk_by_mood.columns = ["Kategori Mood", "risk_index"]
            
            fig_risk = px.bar(risk_by_mood, x="Kategori Mood", y="risk_index", color="risk_index",
                              labels={"Kategori Mood": "Kategori Mood", "risk_index": "Rata-Rata Risk Index"},
                              color_continuous_scale=px.colors.sequential.Reds)
            fig_risk.update_layout(height=300, showlegend=False)
            st.plotly_chart(fig_risk, use_container_width=True)

    st.markdown("---")

    # --- A/B TESTING EXPERIMENT EVALUATION ---
    st.header("🧪 Evaluasi Eksperimen Bisnis (A/B Testing)")
    
    if {"ab_group", "completed_recommendation"}.issubset(filtered.columns) and not filtered.empty:
        ab_data = filtered.groupby("ab_group")["completed_recommendation"].mean().reset_index()
        ab_data["completed_recommendation_percent"] = ab_data["completed_recommendation"] * 100
        
        col_ab1, col_ab2 = st.columns([1, 2])
        with col_ab1:
            st.write("### Perbandingan Completion Rate")
            fig_ab = px.bar(
                ab_data, x="ab_group", y="completed_recommendation_percent", color="ab_group",
                text=ab_data["completed_recommendation_percent"].map(lambda x: f"{x:.2f}%"),
                labels={"ab_group": "Grup", "completed_recommendation_percent": "Completion Rate"},
                color_discrete_map={"A": "#95A5A6", "B": "#2ECC71"}
            )
            fig_ab.update_layout(height=300, showlegend=False)
            fig_ab.update_yaxes(range=[0, 100])
            st.plotly_chart(fig_ab, use_container_width=True)
            
        with col_ab2:
            st.write("### 📊 Kesimpulan Hasil Eksperimen")
            
            df_a = ab_data[ab_data["ab_group"] == "A"]
            df_b = ab_data[ab_data["ab_group"] == "B"]
            
            rate_a = df_a["completed_recommendation_percent"].values[0] if not df_a.empty else 0.0
            rate_b = df_b["completed_recommendation_percent"].values[0] if not df_b.empty else 0.0
            
            if not df_a.empty and not df_b.empty:
                uplift = rate_b - rate_a
                st.markdown(f"""
                * **Tingkat Penyelesaian Grup A (Kontrol):** `{rate_a:.2f}%`
                * **Tingkat Penyelesaian Grup B (AI Personal):** `{rate_b:.2f}%`
                """)
                if uplift > 0:
                    st.success(f"🎉 **Variasi B Sukses!** Terdapat peningkatan mutlak sebesar **{uplift:.2f}%** pada tingkat penyelesaian rekomendasi self-care.")
                    st.info("💡 **Rekomendasi Bisnis:** Segera deploy fitur sapaan Gen AI Personal ke seluruh user basis.")
                else:
                    st.warning("⚠️ **Variasi B Belum Optimal:** Sapaan personal AI belum menunjukkan peningkatan dibanding kelompok standar.")
            elif not df_a.empty:
                st.markdown(f"* **Menampilkan data Grup A (Kontrol) saja:** `{rate_a:.2f}%` selesai.")
                st.info("ℹ️ Centang juga pilihan grup B di panel kontrol samping untuk melihat perbandingan.")
            elif not df_b.empty:
                st.markdown(f"* **Menampilkan data Grup B (AI Personal) saja:** `{rate_b:.2f}%` selesai.")
                st.info("ℹ️ Centang juga pilihan grup A di panel kontrol samping untuk melihat perbandingan.")
    else:
        st.info("Tidak ada data eksperimen A/B testing yang sesuai dengan kriteria filter saat ini.")

    st.markdown("---")
    st.header("📋 Lampiran Transaksi Data Mentah")
    with st.expander("Klik untuk melihat seluruh data transaksi"):
        st.dataframe(filtered, use_container_width=True)

# ==========================================
# MODE 2: PROFIL SPESIFIK (PER SINGLE USER)
# ==========================================
else:
    user_data = df.iloc[selected_user]
    st.header(f"👤 Profil Kesehatan Mental Komprehensif (MD-2026-{selected_user:04d})")
    
    user_age = user_data[AGE_COL] if AGE_COL and AGE_COL in user_data else "N/A"
    
    st.markdown(f"""
    <div class="user-box">
        <h4>Biodata & Metadata Sesi Singkat Pengguna:</h4>
        <ul>
            <li><b>Usia:</b> {int(user_age) if user_age != 'N/A' else 'N/A'} Tahun</li>
            <li><b>Tanggal Kuesioner:</b> {user_data['created_at'].strftime('%d %B %Y %H:%M:%S')}</li>
            <li><b>Durasi Sesi Refleksi:</b> {int(user_data['session_seconds']) if 'session_seconds' in df.columns else 0} Detik</li>
            <li><b>Grup Eksperimen Aplikasi:</b> Grup {user_data['ab_group']}</li>
            <li><b>Status Penyelesaian Rekomendasi:</b> {'✅ Selesai Diikuti' if user_data['completed_recommendation'] == 1 else '❌ Diabaikan'}</li>
        </ul>
    </div>
    """, unsafe_allow_html=True)
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    col_u1, col_u2 = st.columns([2, 1])
    with col_u1:
        st.subheader("Skor Jawaban Kuesioner Pengguna (Skala 1-5)")
        scores = [user_data[q] for q in QUESTION_COLUMNS]
        user_scores_df = pd.DataFrame({"Faktor Kontributor": QUESTION_COLUMNS, "Skor Inputan": scores})
        
        fig_user = px.bar(
            user_scores_df, x="Skor Inputan", y="Faktor Kontributor", orientation='h',
            color="Skor Inputan", color_continuous_scale=px.colors.sequential.Tealgrn,
            text_auto=True
        )
        fig_user.update_layout(height=300, showlegend=False, xaxis=dict(range=[0, 5.5]))
        st.plotly_chart(fig_user, use_container_width=True)
        
    with col_u2:
        st.subheader("Skor Indikator AI")
        if "wellbeing_score" in df.columns:
            st.metric("✨ Wellbeing Score", f"{user_data['wellbeing_score']:.2f} / 30")
        
        if "risk_index" in df.columns:
            st.metric(
                "🚨 Risk Index", 
                f"{user_data['risk_index']:.2f}"
            )