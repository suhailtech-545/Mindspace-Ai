import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Konfigurasi asli milikmu
const firebaseConfig = {
  apiKey: "AIzaSyBk-fKktbLYoVwcImNUScM0MjZJ_cr1-aY",
  authDomain: "mental-health-915f0.firebaseapp.com",
  projectId: "mental-health-915f0",
  storageBucket: "mental-health-915f0.firebasestorage.app",
  messagingSenderId: "406917218588",
  appId: "1:406917218588:web:54306b477fb70a86a4bad9",
  measurementId: "G-WD2F11SZXZ"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// Inisialisasi layanan Autentikasi yang akan dipakai di App.jsx
export const auth = getAuth(app);