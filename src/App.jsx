import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Auth from './Auth';
import Dashboard from './Dashboard';

function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Pantau apakah user sedang login atau tidak
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) {
        return <div className="h-screen bg-ms-bg flex items-center justify-center text-ms-primary">Memuat...</div>;
    }

    return (
        <Router>
            <Routes>
                {/* Jika belum login, arahkan ke halaman Auth. Jika sudah, arahkan ke halaman Utama */}
                <Route path="/login" element={user ? <Navigate to="/" /> : <Auth />} />
                <Route path="/" element={user ? <Dashboard user={user} /> : <Navigate to="/login" />} />
            </Routes>
        </Router>
    );
}

export default App;