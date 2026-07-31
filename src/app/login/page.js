'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, googleProvider, signInWithPopup, signInAnonymously, db } from '@/lib/firebase';
import { ref, set, get } from 'firebase/database';

export default function LoginPage() {
  const [userIdInput, setUserIdInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [birthdayInput, setBirthdayInput] = useState('');
  const [genderInput, setGenderInput] = useState('Laki-Laki');
  
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [pendingUser, setPendingUser] = useState(null); // { uid, authProvider, defaultName, defaultEmail }
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sona_user_id');
      if (saved) {
        router.push('/');
      }
    }
  }, [router]);

  const saveProfileToFirebase = async (uid, profileData) => {
    try {
      if (!db) return;
      const userRef = ref(db, `users/${uid}/profile`);
      const snapshot = await get(userRef);
      const existing = snapshot.exists() ? snapshot.val() : {};
      
      await set(userRef, {
        ...existing,
        ...profileData,
        lastLogin: new Date().toISOString()
      });
    } catch (err) {
      console.warn("⚠️ Gagal menyimpan profil ke Firebase:", err.message);
    }
  };

  // Helper untuk mengecek apakah user sudah memiliki profil tersimpan di Firebase
  const checkAndAutoLogin = async (uid) => {
    try {
      if (!db) return false;
      const userRef = ref(db, `users/${uid}/profile`);
      const snapshot = await get(userRef);
      if (snapshot.exists()) {
        const profile = snapshot.val();
        // Jika profil sudah pernah diisi
        if (profile.birthday || profile.gender || profile.fullName) {
          localStorage.setItem('sona_user_id', uid);
          await saveProfileToFirebase(uid, { lastLogin: new Date().toISOString() });
          router.push('/');
          return true;
        }
      }
    } catch (err) {
      console.warn("Cek profil otomatis gagal:", err);
    }
    return false;
  };

  // Step 1: Login Google
  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setIsLoading(true);
    try {
      if (!auth) throw new Error("Firebase Auth tidak terinisialisasi.");
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const uid = user.uid;

      // Cek apakah user sudah punya profil di Firebase, jika ada langsung masuk!
      const isLoggedIn = await checkAndAutoLogin(uid);
      if (isLoggedIn) return;

      setPendingUser({
        uid,
        authProvider: 'google',
        defaultName: user.displayName || 'Pengguna Google',
        defaultEmail: user.email || ''
      });
      setUsernameInput(user.displayName || 'Pengguna Google');
      setEmailInput(user.email || '');
      setShowProfileSetup(true);

    } catch (err) {
      console.error("❌ Google Login error:", err);
      if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized-domain')) {
        const domain = typeof window !== 'undefined' ? window.location.hostname : 'domain app ini';
        setErrorMsg(`Domain [ ${domain} ] belum terdaftar di Firebase Console (Authentication > Settings > Authorized Domains). Silakan tambahkan domain tersebut atau masuk menggunakan Mode Guest / Subjek ID.`);
      } else {
        setErrorMsg(err.message || "Gagal masuk dengan Google. Coba lagi atau gunakan opsi lain.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Login Anonim / Guest
  const handleAnonymousLogin = async () => {
    setErrorMsg('');
    setIsLoading(true);
    try {
      if (!auth) throw new Error("Firebase Auth tidak terinisialisasi.");
      
      let savedGuestId = typeof window !== 'undefined' ? localStorage.getItem('sona_saved_guest_uid') : null;
      let uid = savedGuestId;

      if (!uid) {
        const result = await signInAnonymously(auth);
        uid = result.user.uid;
        if (typeof window !== 'undefined') {
          localStorage.setItem('sona_saved_guest_uid', uid);
        }
      }

      // Cek apakah user anonim ini sudah punya profil tersimpan di Firebase
      const isLoggedIn = await checkAndAutoLogin(uid);
      if (isLoggedIn) return;

      setPendingUser({
        uid,
        authProvider: 'anonymous',
        defaultName: `Guest ${uid.slice(0, 6)}`,
        defaultEmail: 'anonim@sona.app'
      });
      setUsernameInput(`Guest ${uid.slice(0, 6)}`);
      setEmailInput('anonim@sona.app');
      setShowProfileSetup(true);

    } catch (err) {
      console.error("❌ Anonymous Login error:", err);
      setErrorMsg(err.message || "Gagal masuk secara anonim.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Login ID Subjek Tetap
  const handleCustomIdLogin = async (e) => {
    e.preventDefault();
    if (!userIdInput.trim()) {
      setErrorMsg('Masukkan ID Subjek khusus kamu.');
      return;
    }

    const uid = userIdInput.trim();
    setIsLoading(true);
    try {
      const isLoggedIn = await checkAndAutoLogin(uid);
      if (isLoggedIn) return;

      setPendingUser({
        uid,
        authProvider: 'custom_id',
        defaultName: `Subjek ${uid}`,
        defaultEmail: `${uid}@sona.research`
      });
      setUsernameInput(`Subjek ${uid}`);
      setEmailInput(`${uid}@sona.research`);
      setShowProfileSetup(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Simpan Data Lengkap Profil (Username, Tanggal Lahir, Gender, Email) & Masuk
  const handleCompleteProfileSubmit = async (e) => {
    e.preventDefault();
    if (!pendingUser) return;
    setIsLoading(true);

    try {
      const uid = pendingUser.uid;
      localStorage.setItem('sona_user_id', uid);

      await saveProfileToFirebase(uid, {
        fullName: usernameInput.trim() || pendingUser.defaultName,
        email: emailInput.trim() || pendingUser.defaultEmail,
        birthday: birthdayInput || '2000-01-01',
        gender: genderInput || 'Laki-Laki',
        authProvider: pendingUser.authProvider,
        isAnonymous: pendingUser.authProvider === 'anonymous'
      });

      router.push('/');
    } catch (err) {
      console.error("❌ Gagal menyimpan profil lengkap:", err);
      setErrorMsg("Gagal menyimpan profil. Mencoba masuk...");
      router.push('/');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0e14] text-white p-4 font-sans">
      <div className="max-w-md w-full bg-[#141824] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        
        {/* Header Logo */}
        <div className="text-center space-y-1">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#1DB954] to-emerald-300 mx-auto flex items-center justify-center font-black text-2xl text-slate-950 shadow-xl shadow-[#1DB954]/20 mb-2">
            S
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Sona</h1>
          <p className="text-xs text-slate-400">Personal Emotion & Music Therapy Platform</p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-2xl text-center font-medium leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* STEP 2: Form Kelengkapan Profil Awal */}
        {showProfileSetup ? (
          <form onSubmit={handleCompleteProfileSubmit} className="space-y-4 pt-1 animate-in fade-in duration-200">
            <div className="bg-[#0b0e14] p-3 rounded-2xl border border-slate-800 text-center">
              <span className="text-[10px] font-bold text-[#1DB954] uppercase tracking-wider">Langkah Terakhir</span>
              <h2 className="text-sm font-bold text-white mt-0.5">Lengkapi Profil Kamu</h2>
            </div>

            {/* Username / Nama */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Username / Nama Lengkap</label>
              <input
                type="text"
                required
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Contoh: Alex Sona"
                className="w-full bg-[#0b0e14] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#1DB954]"
              />
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Email (Opsional)</label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="email@contoh.com"
                className="w-full bg-[#0b0e14] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#1DB954]"
              />
            </div>

            {/* Birthday & Gender Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Tanggal Lahir</label>
                <input
                  type="date"
                  required
                  value={birthdayInput}
                  onChange={(e) => setBirthdayInput(e.target.value)}
                  className="w-full bg-[#0b0e14] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#1DB954]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Jenis Kelamin</label>
                <select
                  value={genderInput}
                  onChange={(e) => setGenderInput(e.target.value)}
                  className="w-full bg-[#0b0e14] border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#1DB954]"
                >
                  <option value="Laki-Laki">Laki-Laki</option>
                  <option value="Perempuan">Perempuan</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#1DB954] hover:bg-emerald-400 text-black font-extrabold text-xs rounded-2xl transition shadow-lg shadow-[#1DB954]/20 active:scale-95 mt-2"
            >
              {isLoading ? 'Menyimpan Profile...' : 'Mulai Dengarkan Musik 🎵'}
            </button>
          </form>
        ) : (
          /* STEP 1: Opsi Pilih Cara Masuk */
          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs rounded-2xl transition duration-200 flex items-center justify-center gap-3 shadow-md active:scale-95 disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.23v3.15C3.25 21.37 7.34 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.23C.44 8.16 0 9.99 0 12s.44 3.84 1.23 5.42l4.05-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.63 1.23 6.58l4.05 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
              Masuk dengan Akun Google
            </button>

            <button
              onClick={handleAnonymousLogin}
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-[#1a2233] hover:bg-[#253047] text-slate-200 font-bold text-xs rounded-2xl transition duration-200 flex items-center justify-center gap-2 border border-slate-700/80 active:scale-95 disabled:opacity-50"
            >
              <span>👤</span>
              Masuk Secara Anonim (Guest)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

