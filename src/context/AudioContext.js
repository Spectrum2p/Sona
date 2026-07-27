'use client';
import { createContext, useState, useEffect, useContext } from 'react';

const AudioContext = createContext(null);

export const AudioProvider = ({ children, userId: propUserId }) => {
  // Ambil userId dari prop atau localStorage agar selalu sinkron dengan user yang login
  const [userId, setUserId] = useState(propUserId || 'user_001');

  // State Pemutar Musik
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  // State Sesi & AI
  const [sessionId, setSessionId] = useState(null);
  const [sessionSongs, setSessionSongs] = useState([]); // Menyimpan lagu dalam 1 sesi (untuk Modus)
  const [aiNotification, setAiNotification] = useState(null); // Menyimpan pesan pop-up AI

  // Sync userId dengan localStorage jika tersedia
  useEffect(() => {
    const savedUserId = localStorage.getItem('sona_user_id');
    if (savedUserId) setUserId(savedUserId);
  }, []);

  // Update lagu aktif setiap kali playlist atau index berubah
  useEffect(() => {
    if (playlist.length > 0 && playlist[currentIndex]) {
      setCurrentSong(playlist[currentIndex]);
    }
  }, [currentIndex, playlist]);

  // 1. START SESSION: Catat Sesi Aktif saat Komponen Pertama Kali Muat
  useEffect(() => {
    async function startSession() {
      try {
        const res = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'START', userId })
        });
        const data = await res.json();
        if (data.success) {
          setSessionId(data.sessionId);
          console.log("🟢 Sesi Sona Dimulai ID:", data.sessionId);
        }
      } catch (err) {
        console.error("❌ Gagal memulai sesi:", err);
      }
    }

    if (userId) startSession();

    // 2. END SESSION: Hitung Modus Emosi & Durasi Sesi saat User Menutup Web/Tab
    const handleUnload = () => {
      if (sessionId) {
        navigator.sendBeacon('/api/session', JSON.stringify({
          action: 'END',
          userId,
          sessionId,
          songsPlayedInSession: sessionSongs
        }));
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [userId, sessionId, sessionSongs]);

  // 3. TRACK SONG END: Dipanggil Setiap Kali Lagu Selesai Diputar
  const handleSongEnd = async (songData) => {
    const activeSong = songData || currentSong;
    if (!activeSong) return;

    // Tambah ke daftar lagu sesi ini (untuk variabel Modus)
    setSessionSongs(prev => [...prev, activeSong]);

    try {
      // Kirim riwayat lagu ke backend
      const res = await fetch('/api/history/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          songData: {
            songId: activeSong.id || activeSong.songId,
            title: activeSong.title,
            artist: activeSong.artist,
            emotionalCategory: activeSong.emotionalCategory,
            genre: activeSong.genre,
            valence: activeSong.valence,
            energy: activeSong.energy,
            bpm: activeSong.bpm
          }
        })
      });

      const data = await res.json();

      // Jika pemicu AI aktif (5 lagu berturut-turut atau 5x repeat)
      if (data.success && data.triggerAI) {
        console.log("🤖 Trigger AI Aktif! Meminta respon dari Sona AI...");
        triggerChatbot(data.detectedMood, data.preferredGenre, data.isSpecialCondition);
      }
    } catch (err) {
      console.error("❌ Gagal mencatat history lagu:", err);
    }

    // Auto play lagu berikutnya jika tidak repeat
    if (!isRepeat) {
      playNextSong();
    }
  };

  // 4. TRIGGER CHATBOT: Memanggil API Chat untuk Sapaan & Gradasi Valensi
  const triggerChatbot = async (detectedEmotion, preferredGenre, isSpecialCondition) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          detectedEmotion,
          preferredGenre,
          isSpecialCondition,
          userMessage: "" // Kosongkan pesan awal agar AI langsung menyapa berdasarkan prompt kustom
        })
      });

      const data = await res.json();
      if (data.success) {
        setAiNotification({
          sapaan: data.sapaanAI,
          analisis: data.analisisIlmiah,
          playlist: data.playlist,
          isSpecialCondition
        });
      }
    } catch (err) {
      console.error("❌ Gagal memanggil Chatbot AI:", err);
    }
  };

  // Fungsi Kontrol Navigasi Musik
  const playNextSong = () => {
    if (currentIndex < playlist.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const playPreviousSong = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const toggleRepeat = () => setIsRepeat(prev => !prev);
  const dismissNotification = () => setAiNotification(null);

  return (
    <AudioContext.Provider value={{
      // State & Kontrol Player
      playlist,
      setPlaylist,
      currentIndex,
      setCurrentIndex,
      currentSong,
      setCurrentSong,
      isPlaying,
      setIsPlaying,
      isRepeat,
      toggleRepeat,
      playNextSong,
      playPreviousSong,
      handleSongEnd,
      
      // State & Kontrol Sesi / AI
      sessionId,
      aiNotification,
      setAiNotification,
      dismissNotification
    }}>
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio harus digunakan di dalam AudioProvider');
  }
  return context;
};