'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MusicPlayer from '@/components/MusicPlayer';
import AiModalPopup from '@/components/AiModalPopup';
import { useAudio } from '@/context/AudioContext';

export default function HomePage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [songs, setSongs] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // all, valence, chatbot
  const [displayLimit, setDisplayLimit] = useState(50); // Batas tampilan awal agar performa responsif
  
  // State untuk Chatbot AI
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { sender: 'ai', text: 'Halo! Aku Sona AI. Bagaimana perasaanmu hari ini? Aku siap menemani dan menyesuaikan musik untuk mood-mu.' }
  ]);

  const { setPlaylist, setCurrentSong, setIsPlaying, currentSong } = useAudio();

  useEffect(() => {
    // 1. Cek Login
    const savedUserId = localStorage.getItem('sona_user_id');
    if (!savedUserId) {
      router.push('/login');
    } else {
      setUserId(savedUserId);
      setLoading(false);
      fetchSongs();
    }
  }, [router]);

  // Fetch daftar lagu dari database
  const fetchSongs = async () => {
    try {
      const res = await fetch('/api/songs');
      const data = await res.json();
      if (data.success && data.songs) {
        setSongs(data.songs);
        setPlaylist(data.songs);
      }
    } catch (err) {
      console.error("Gagal mengambil data lagu:", err);
    }
  };

  const handlePlaySong = (song, index) => {
    setPlaylist(songs);
    setCurrentSong(song);
    setIsPlaying(true);
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    // Tambahkan pesan user & indikator loading sementara
    setChatMessages(prev => [
      ...prev, 
      { sender: 'user', text: userText },
      { sender: 'ai', text: 'Sona AI sedang memproses...', isLoading: true }
    ]);
    setChatInput('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userMessage: userText
        })
      });
      
      const data = await res.json();

      if (data.success) {
        // Ganti pesan loading dengan jawaban asli AI
        setChatMessages(prev => {
          const filtered = prev.filter(m => !m.isLoading);
          return [...filtered, { sender: 'ai', text: data.sapaanAI || data.message }];
        });

        // Update playlist lagu berdasarkan rekomendasi AI
        if (data.playlist && data.playlist.length > 0) {
          setSongs(data.playlist);
          setPlaylist(data.playlist);
        }
      } else {
        throw new Error(data.error || 'Gagal memuat respon AI');
      }
    } catch (err) {
      console.error("Gagal kirim chat:", err);
      setChatMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [...filtered, { sender: 'ai', text: 'Maaf, terjadi kendala koneksi ke Sona AI. Tetap nikmati musik yang ada ya!' }];
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('sona_user_id');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="animate-pulse text-indigo-400 font-medium">Memuat Sona Platform...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-28">
      {/* Top Navigation */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur px-6 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
            S
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white">Sona</h1>
            <p className="text-[10px] text-slate-400">ID Subjek: <span className="font-mono text-indigo-300">{userId}</span></p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="px-3 py-1.5 bg-slate-800 hover:bg-red-950/40 hover:text-red-400 border border-slate-700 text-xs text-slate-300 rounded-lg transition"
        >
          Keluar
        </button>
      </header>

      {/* Main Grid Layout (Spotify Style + Sidebar Chatbot) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 max-w-7xl mx-auto w-full">
        
        {/* Left/Center Section: Music Library & Playlists */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Welcome & Mood Banner */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-purple-950/50 border border-indigo-500/20 shadow-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
              Personal Music Therapy
            </span>
            <h2 className="text-2xl font-bold mt-3 text-white">Selamat Datang di Sona</h2>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Dengarkan musik favoritmu. Sona AI secara otomatis menganalisis respon emosi dan menyajikan gradasi musik penyeimbang mood.
            </p>
          </div>

          {/* Filter / Category Tabs */}
          <div className="flex gap-2 border-b border-slate-800 pb-3">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition ${
                activeTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              🎵 Semua Lagu ({songs.length})
            </button>
            <button
              onClick={() => setActiveTab('valence')}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition ${
                activeTab === 'valence' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              📊 Gradasi Valensi
            </button>
          </div>

          {/* Song List Table */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 overflow-hidden">
            {songs.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                Belum ada lagu tersedia di database.
              </div>
            ) : (
              <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
                {songs.slice(0, displayLimit).map((song, index) => {
                  const isCurrent = currentSong?.id === song.id;
                  return (
                    <div
                      key={song.id || index}
                      onClick={() => handlePlaySong(song, index)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition ${
                        isCurrent 
                          ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-300' 
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {/* Nomor Urut */}
                        <span className="text-xs text-slate-500 font-mono w-8 text-center">
                          {isCurrent ? '▶' : (song.no || index + 1)}
                        </span>

                        {/* Cover Image */}
                        {song.coverUrl ? (
                          <img
                            src={song.coverUrl}
                            alt={song.title}
                            className="w-10 h-10 rounded-lg object-cover bg-slate-800"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-indigo-900/40 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                            🎵
                          </div>
                        )}

                        <div>
                          <p className={`text-sm font-semibold ${isCurrent ? 'text-indigo-400' : 'text-slate-100'}`}>
                            {song.title || 'Judul Lagu'}
                          </p>
                          <p className="text-xs text-slate-400">{song.artist || 'Artis'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {song.genre && (
                          <span className="text-[10px] px-2.5 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded-full">
                            {song.genre}
                          </span>
                        )}
                        {song.emotionalCategory && (
                          <span className="text-[10px] px-2.5 py-1 bg-indigo-950/60 border border-indigo-800/50 text-indigo-300 rounded-full">
                            {song.emotionalCategory}
                          </span>
                        )}
                        <span className="text-xs text-slate-500 font-mono">{song.duration || '3:30'}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Tombol Load More jika data lebih dari displayLimit */}
                {displayLimit < songs.length && (
                  <button
                    onClick={() => setDisplayLimit(prev => prev + 100)}
                    className="w-full py-3 mt-3 text-xs text-indigo-400 hover:text-indigo-300 bg-slate-800/40 hover:bg-slate-800 rounded-xl transition border border-slate-700/50"
                  >
                    Tampilkan Lebih Banyak Lagu ({songs.length - displayLimit} tersisa)...
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Sona AI Chatbot & Mood Companion */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col h-[520px] shadow-xl">
          {/* Chat Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <div>
                <h3 className="text-sm font-bold text-white">Sona AI Companion</h3>
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online
                </p>
              </div>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-2xl leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-slate-800 flex gap-2 bg-slate-900">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ceritakan mood-mu ke Sona AI..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl transition"
            >
              Kirim
            </button>
          </form>
        </div>

      </div>

      {/* Pop-up Notifikasi AI saat Trigger 5 Lagu / Repeat */}
      <AiModalPopup />

      {/* Player Bar Spotify-style di Bawah */}
      <MusicPlayer />
    </div>
  );
}