'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAudio } from '@/context/AudioContext';
import { db, auth, signOut } from '@/lib/firebase';
import { ref, get, set } from 'firebase/database';
import Link from 'next/link';
import { 
  ArrowLeft, 
  User, 
  Pencil, 
  LogOut, 
  Music, 
  MessageSquare, 
  ListMusic, 
  X, 
  Clock, 
  Heart, 
  Play, 
  Calendar, 
  UserCheck
} from 'lucide-react';

export default function ProfileView({ onBackToHome }) {
  const router = useRouter();
  const { 
    userId, 
    userProfile, 
    fetchUserProfile, 
    setCurrentSong, 
    setIsPlaying, 
    setHasPlayerStarted,
    stopAndResetPlayer,
    favorites 
  } = useAudio();
  
  const [activeTab, setActiveTab] = useState('chat'); // chat, songs, playlists
  const [isLoading, setIsLoading] = useState(true);
  const [playHistory, setPlayHistory] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [customPlaylists, setCustomPlaylists] = useState([]);
  
  // State Edit Profil Modal
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    birthday: '',
    gender: 'Laki-Laki'
  });

  useEffect(() => {
    if (!userId) {
      router.push('/login');
      return;
    }

    const loadUserData = async () => {
      setIsLoading(true);
      try {
        if (!db) return;
        const userRef = ref(db, `users/${userId}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
          const data = snapshot.val();
          
          if (data.profile) {
            setEditForm({
              fullName: data.profile.fullName || '',
              email: data.profile.email || '',
              birthday: data.profile.birthday || '',
              gender: data.profile.gender || 'Laki-Laki'
            });
          }

          const songsRaw = data.play_history || data.history_songs || {};
          const songsList = Object.values(songsRaw).sort((a, b) => new Date(b.timestamp || b.playedAt || 0) - new Date(a.timestamp || a.playedAt || 0));
          setPlayHistory(songsList);

          const chatRaw = data.history_chat || {};
          const chatList = Object.values(chatRaw).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
          setChatHistory(chatList);

          const sessionRaw = data.history_sessions || {};
          const sessionList = Object.values(sessionRaw).sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
          setSessionHistory(sessionList);

          const playlistRaw = data.custom_playlists || {};
          const playlistList = Object.keys(playlistRaw).map(k => ({
            id: k,
            ...playlistRaw[k],
            songs: playlistRaw[k].songs ? (Array.isArray(playlistRaw[k].songs) ? playlistRaw[k].songs : Object.values(playlistRaw[k].songs)) : []
          }));
          setCustomPlaylists(playlistList);
        }
      } catch (err) {
        console.error("❌ Error loading user profile data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [userId, router]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!db || !userId) return;
    try {
      const profileRef = ref(db, `users/${userId}/profile`);
      const snapshot = await get(profileRef);
      const existing = snapshot.exists() ? snapshot.val() : {};

      await set(profileRef, {
        ...existing,
        fullName: editForm.fullName.trim() || `Pengguna ${userId}`,
        email: editForm.email.trim(),
        birthday: editForm.birthday,
        gender: editForm.gender,
        updatedAt: new Date().toISOString()
      });

      await fetchUserProfile(userId);
      setIsEditingProfile(false);
    } catch (err) {
      console.error("❌ Gagal menyimpan profil:", err);
    }
  };

  const handleLogout = async () => {
    try {
      if (stopAndResetPlayer) {
        stopAndResetPlayer();
      }
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
        localStorage.removeItem('sona_user_id');
        localStorage.removeItem('sona_saved_guest_uid');
      }
      if (auth) {
        await signOut(auth);
      }
      window.location.href = '/login';
    } catch (err) {
      console.error("❌ Logout error:", err);
      if (stopAndResetPlayer) {
        stopAndResetPlayer();
      }
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
        localStorage.removeItem('sona_user_id');
        localStorage.removeItem('sona_saved_guest_uid');
      }
      window.location.href = '/login';
    }
  };

  const playSongFromList = (item) => {
    if (!item) return;
    const songToPlay = {
      id: item.songId || item.id || item.title,
      title: item.title,
      artist: item.artist || 'Unknown Artist',
      audioUrl: item.audioUrl || item.url || '',
      coverUrl: item.coverUrl || '',
      genre: item.genre || 'Pop',
      emotionalCategory: item.emotionalCategory || 'tenang'
    };
    if (songToPlay.audioUrl) {
      setCurrentSong(songToPlay);
      setHasPlayerStarted(true);
      setIsPlaying(true);
    }
  };

  const totalSongsPlayed = playHistory.length;
  const totalSessions = sessionHistory.length || (totalSongsPlayed > 0 ? 1 : 0);

  const activeDaysSet = new Set();
  playHistory.forEach(s => {
    const ts = s.timestamp || s.playedAt;
    if (ts) activeDaysSet.add(new Date(ts).toISOString().split('T')[0]);
  });
  sessionHistory.forEach(s => {
    const ts = s.startTime;
    if (ts) activeDaysSet.add(new Date(ts).toISOString().split('T')[0]);
  });
  chatHistory.forEach(c => {
    const ts = c.timestamp;
    if (ts) activeDaysSet.add(new Date(ts).toISOString().split('T')[0]);
  });
  if (userProfile?.lastLogin) {
    activeDaysSet.add(new Date(userProfile.lastLogin).toISOString().split('T')[0]);
  }
  const totalActiveDays = activeDaysSet.size || 1;

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 p-4 sm:p-6 md:p-8 max-w-2xl md:max-w-5xl lg:max-w-6xl mx-auto space-y-6 pb-28 font-sans">
      {/* Top Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3.5">
        {onBackToHome ? (
          <button 
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition bg-[#141824] hover:bg-[#1f2638] px-4 py-2 rounded-full border border-slate-700/60 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-[#1DB954]" /> Kembali ke Home
          </button>
        ) : (
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition bg-[#141824] hover:bg-[#1f2638] px-4 py-2 rounded-full border border-slate-700/60 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-[#1DB954]" /> Kembali ke Home
          </Link>
        )}
        <span className="text-[10px] text-slate-400 font-mono bg-[#141824] px-3 py-1 rounded-full border border-slate-800">
          ID: {userId}
        </span>
      </div>

      {/* Profile Card */}
      <div className="bg-gradient-to-br from-[#1a2233] via-[#141926] to-[#0b0e14] border border-slate-800/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#1DB954]/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 relative z-10">
          <div className="relative">
            {userProfile?.photoURL ? (
              <img src={userProfile.photoURL} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-[#1DB954] shadow-xl" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#1DB954] to-emerald-300 flex items-center justify-center font-extrabold text-3xl text-slate-950 shadow-xl">
                {(userProfile?.fullName || userId || 'S')[0].toUpperCase()}
              </div>
            )}
            <span className="absolute bottom-0 right-0 bg-[#1DB954] w-4 h-4 rounded-full border-2 border-[#0b0e14]" title="Aktif"></span>
          </div>

          <div className="flex-1 text-center sm:text-left space-y-2">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                {userProfile?.fullName || `Pengguna ${userId}`}
              </h1>
              <button 
                onClick={() => {
                  setEditForm({
                    fullName: userProfile?.fullName || '',
                    email: userProfile?.email || '',
                    birthday: userProfile?.birthday || '',
                    gender: userProfile?.gender || 'Laki-Laki'
                  });
                  setIsEditingProfile(true);
                }} 
                className="text-slate-400 hover:text-[#1DB954] text-xs p-1.5 bg-slate-800/60 rounded-full transition" 
                title="Edit Profil Lengkap"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-300 pt-1">
              <p className="flex items-center justify-center sm:justify-start gap-1.5 text-slate-400">
                <span className="font-semibold text-slate-300">ID Subjek:</span>
                <span className="font-mono text-[11px] text-[#1DB954]">{userId}</span>
              </p>
              <p className="flex items-center justify-center sm:justify-start gap-1.5 text-slate-400">
                <span className="font-semibold text-slate-300">Email:</span>
                <span>{userProfile?.email || 'Belum diisi'}</span>
              </p>
              <p className="flex items-center justify-center sm:justify-start gap-1.5 text-slate-400">
                <Calendar className="w-3.5 h-3.5 text-[#1DB954]" />
                <span className="font-semibold text-slate-300">Tanggal Lahir:</span>
                <span>{userProfile?.birthday || 'Belum diisi'}</span>
              </p>
              <p className="flex items-center justify-center sm:justify-start gap-1.5 text-slate-400">
                <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                <span className="font-semibold text-slate-300">Jenis Kelamin:</span>
                <span>{userProfile?.gender || 'Laki-Laki'}</span>
              </p>
            </div>

            <p className="text-[11px] text-slate-500 flex items-center gap-1 justify-center sm:justify-start pt-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Terakhir aktif: {userProfile?.lastLogin ? new Date(userProfile.lastLogin).toLocaleString('id-ID') : 'Hari ini'}
            </p>
          </div>

          <div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-full text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" /> Keluar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div className="bg-[#141824]/90 p-3.5 rounded-2xl border border-slate-800 shadow-inner text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Jml Lagu Diputar</p>
            <p className="text-xl font-extrabold text-[#1DB954] mt-0.5">{totalSongsPlayed}</p>
          </div>
          <div className="bg-[#141824]/90 p-3.5 rounded-2xl border border-slate-800 shadow-inner text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Hari Aktif</p>
            <p className="text-xl font-extrabold text-sky-400 mt-0.5">{totalActiveDays} Hari</p>
          </div>
          <div className="bg-[#141824]/90 p-3.5 rounded-2xl border border-slate-800 shadow-inner text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Jml Sesi</p>
            <p className="text-xl font-extrabold text-amber-400 mt-0.5">{totalSessions} Sesi</p>
          </div>
        </div>
      </div>

      {/* MODAL EDIT PROFIL */}
      {isEditingProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141824] border border-slate-700 w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-[#1DB954]" /> Edit Profil Lengkap
              </h2>
              <button onClick={() => setIsEditingProfile(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300 uppercase">Username / Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm(prev => ({ ...prev, fullName: e.target.value }))}
                  className="w-full bg-[#0b0e14] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#1DB954]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300 uppercase">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full bg-[#0b0e14] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#1DB954]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300 uppercase">Tanggal Lahir</label>
                  <input
                    type="date"
                    required
                    value={editForm.birthday}
                    onChange={(e) => setEditForm(prev => ({ ...prev, birthday: e.target.value }))}
                    className="w-full bg-[#0b0e14] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#1DB954]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300 uppercase">Jenis Kelamin</label>
                  <select
                    value={editForm.gender}
                    onChange={(e) => setEditForm(prev => ({ ...prev, gender: e.target.value }))}
                    className="w-full bg-[#0b0e14] border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-[#1DB954]"
                  >
                    <option value="Laki-Laki">Laki-Laki</option>
                    <option value="Perempuan">Perempuan</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1DB954] hover:bg-emerald-400 text-black rounded-xl font-extrabold shadow-lg shadow-[#1DB954]/20"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Navigation Tabs */}
      <div className="flex border-b border-slate-800/80 overflow-x-auto scrollbar-none gap-2 pb-2.5">
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-2 text-xs font-extrabold rounded-full transition whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'chat'
              ? 'bg-[#1DB954] text-black shadow-lg shadow-[#1DB954]/20 scale-105'
              : 'text-slate-300 hover:text-white bg-[#141824] border border-slate-800'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" /> History Chat ({chatHistory.length})
        </button>

        <button
          onClick={() => setActiveTab('songs')}
          className={`px-4 py-2 text-xs font-extrabold rounded-full transition whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'songs'
              ? 'bg-[#1DB954] text-black shadow-lg shadow-[#1DB954]/20 scale-105'
              : 'text-slate-300 hover:text-white bg-[#141824] border border-slate-800'
          }`}
        >
          <Music className="w-3.5 h-3.5" /> History Pemutaran ({playHistory.length})
        </button>

        <button
          onClick={() => setActiveTab('playlists')}
          className={`px-4 py-2 text-xs font-extrabold rounded-full transition whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'playlists'
              ? 'bg-[#1DB954] text-black shadow-lg shadow-[#1DB954]/20 scale-105'
              : 'text-slate-300 hover:text-white bg-[#141824] border border-slate-800'
          }`}
        >
          <ListMusic className="w-3.5 h-3.5" /> Playlist Tersedia ({customPlaylists.length + (favorites?.length ? 1 : 0)})
        </button>
      </div>

      {/* Tab Contents */}
      <div className="bg-[#141824] border border-slate-800/80 rounded-3xl p-5 min-h-[320px] shadow-xl">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3 text-slate-500 text-xs">
            <div className="w-6 h-6 border-2 border-[#1DB954] border-t-transparent rounded-full animate-spin"></div>
            <p>Memuat profil Sona...</p>
          </div>
        ) : (
          <>
            {activeTab === 'chat' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-400" /> Riwayat Chat Sona AI
                  </h2>
                </div>
                {chatHistory.length === 0 ? (
                  <p className="text-xs text-slate-500 py-12 text-center">Belum ada riwayat percakapan chat.</p>
                ) : (
                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {chatHistory.map((chat, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-2xl text-xs space-y-1 ${
                          chat.role === 'user'
                            ? 'bg-[#1DB954]/15 border border-[#1DB954]/30 text-white ml-6'
                            : 'bg-[#0b0e14] border border-slate-800 text-slate-200 mr-6'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="font-bold uppercase">{chat.role === 'user' ? 'Kamu' : 'Sona AI'}</span>
                          <span>{chat.timestamp ? new Date(chat.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </div>
                        <p className="leading-relaxed">{chat.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'songs' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Riwayat Pemutaran Musik</h2>
                  <span className="text-[10px] text-slate-500 font-mono">{playHistory.length} lagu dicatat</span>
                </div>
                
                {playHistory.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs space-y-1">
                    <Music className="w-8 h-8 text-slate-600 mx-auto" />
                    <p>Belum ada riwayat lagu yang diputar.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[480px] overflow-y-auto pr-1">
                    {playHistory.map((item, index) => (
                      <div key={index} className="p-3 bg-[#0b0e14] hover:bg-[#1a2233] rounded-2xl flex items-center justify-between gap-3 text-xs border border-slate-800/60 transition group">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-slate-500 font-mono text-[10px] w-4 text-center">{index + 1}</span>
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate group-hover:text-[#1DB954] transition">{item.title}</p>
                            <p className="text-[11px] text-slate-400 truncate">{item.artist || 'Unknown Artist'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0 text-[10px]">
                          <span className="px-2.5 py-0.5 rounded-full bg-[#1DB954]/15 border border-[#1DB954]/30 text-[#1DB954] font-bold capitalize">
                            {item.emotionalCategory || 'tenang'}
                          </span>
                          <button
                            onClick={() => playSongFromList(item)}
                            className="w-7 h-7 rounded-full bg-[#1DB954] text-black flex items-center justify-center hover:scale-110 active:scale-95 transition shadow"
                            title="Putar Lagu Ini"
                          >
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'playlists' && (
              <div className="space-y-4">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Playlist Tersedia</h2>
                
                <div className="p-4 bg-gradient-to-r from-emerald-950/80 to-[#0b0e14] border border-[#1DB954]/40 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-[#1DB954] flex items-center justify-center text-black font-bold shadow-lg shadow-[#1DB954]/30">
                        <Heart className="w-5 h-5 fill-current" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-white text-xs">Lagu Disukai (Liked Songs)</h3>
                        <p className="text-[11px] text-slate-400">{favorites?.length || 0} lagu tersimpan</p>
                      </div>
                    </div>
                  </div>

                  {favorites && favorites.length > 0 ? (
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pt-2 border-t border-slate-800">
                      {favorites.map((fav, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-[#0b0e14]/80 hover:bg-[#181818] text-xs transition">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-white truncate">{fav.title}</p>
                            <p className="text-[10px] text-slate-400 truncate">{fav.artist}</p>
                          </div>
                          <button
                            onClick={() => playSongFromList(fav)}
                            className="p-1.5 bg-[#1DB954] text-black rounded-full hover:scale-105 transition"
                          >
                            <Play className="w-3 h-3 fill-current" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic pt-1">Belum ada lagu yang kamu sukai (tekan tombol + di lagu untuk menyimpan).</p>
                  )}
                </div>

                <div className="space-y-2 pt-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Playlist Kustom Kamu</p>
                  {customPlaylists.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-800 rounded-2xl">
                      Belum ada playlist kustom yang dibuat.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {customPlaylists.map((pl) => (
                        <div key={pl.id} className="p-3.5 bg-[#0b0e14] border border-slate-800 rounded-2xl space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-[#1DB954] text-xs">{pl.name}</h3>
                            <span className="text-[10px] bg-[#141824] text-slate-300 px-2 py-0.5 rounded-full border border-slate-800 font-mono">
                              {pl.songs?.length || 0} Lagu
                            </span>
                          </div>
                          {pl.description && <p className="text-[11px] text-slate-400 line-clamp-1">{pl.description}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
