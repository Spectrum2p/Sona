'use client';
import { createContext, useState, useEffect, useContext, useRef } from 'react';
import { db, auth, onAuthStateChanged } from '@/lib/firebase';
import { ref, get, set, push, remove } from 'firebase/database';

const AudioContext = createContext(null);

export const AudioProvider = ({ children, userId: propUserId }) => {
  // Ambil userId dari prop atau localStorage agar selalu sinkron dengan user yang login
  const [userId, setUserId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sona_user_id') || propUserId || null;
    }
    return propUserId || null;
  });

  // State Pemutar Musik
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [customSong, setCustomSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayerStarted, setHasPlayerStarted] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off'); // 'off' | 'one' | 'all'
  const [isShuffle, setIsShuffle] = useState(false);

  // 🎵 State Antrean (Queue List)
  const [queue, setQueue] = useState([]);

  // 🎶 State Custom Playlists (Playlist Saya) & Favorit
  const [customPlaylists, setCustomPlaylists] = useState([]);
  const [favorites, setFavorites] = useState([]);

  // 👤 State Profil User
  const [userProfile, setUserProfile] = useState(null);

  // State Sesi & AI
  const [sessionId, setSessionId] = useState(null);
  const [sessionSongs, setSessionSongs] = useState([]); // Menyimpan lagu dalam 1 sesi (untuk Modus)
  const [aiNotification, setAiNotification] = useState(null); // Menyimpan pesan pop-up AI

  const fetchUserProfile = async (uid) => {
    try {
      if (!db || !uid) return;
      const userRef = ref(db, `users/${uid}/profile`);
      const snapshot = await get(userRef);
      if (snapshot.exists()) {
        setUserProfile(snapshot.val());
      }
    } catch (err) {
      console.warn("⚠️ Gagal memuat profil user:", err.message);
    }
  };

  const fetchCustomPlaylists = async (uid) => {
    try {
      if (!db || !uid) return;
      const playlistRef = ref(db, `users/${uid}/custom_playlists`);
      const snapshot = await get(playlistRef);
      if (snapshot.exists()) {
        const val = snapshot.val();
        const list = Object.keys(val).map(key => ({
          id: key,
          ...val[key],
          songs: val[key].songs ? (Array.isArray(val[key].songs) ? val[key].songs : Object.values(val[key].songs)) : []
        }));
        setCustomPlaylists(list);
      } else {
        setCustomPlaylists([]);
      }
    } catch (err) {
      console.warn("⚠️ Gagal memuat playlist kustom:", err.message);
    }
  };

  const fetchFavorites = async (uid) => {
    try {
      if (!db || !uid) return;
      const favRef = ref(db, `users/${uid}/favorites`);
      const snapshot = await get(favRef);
      if (snapshot.exists()) {
        const val = snapshot.val();
        const list = Array.isArray(val) ? val : Object.values(val);
        setFavorites(list);
      } else {
        setFavorites([]);
      }
    } catch (err) {
      console.warn("⚠️ Gagal memuat favorit:", err.message);
    }
  };

  const toggleFavorite = async (song) => {
    if (!song) return;
    const songId = song.id || song.songId || song.title;
    const exists = favorites.some(s => (s.id || s.songId || s.title) === songId);
    
    let updated;
    if (exists) {
      updated = favorites.filter(s => (s.id || s.songId || s.title) !== songId);
    } else {
      updated = [...favorites, song];
    }
    setFavorites(updated);

    try {
      if (db && userId) {
        const favRef = ref(db, `users/${userId}/favorites`);
        await set(favRef, updated);
      }
    } catch (err) {
      console.warn("⚠️ Gagal menyimpan favorit ke Firebase:", err.message);
    }
  };

  const isFavorite = (song) => {
    if (!song) return false;
    const songId = song.id || song.songId || song.title;
    return favorites.some(s => (s.id || s.songId || s.title) === songId);
  };

  // Sync Auth State & Load Custom Playlists / User Profile / Favorites from Firebase
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let unsub = () => {};
    if (auth) {
      unsub = onAuthStateChanged(auth, (user) => {
        if (user) {
          const uid = user.uid;
          setUserId(uid);
          localStorage.setItem('sona_user_id', uid);
          Promise.resolve().then(() => {
            fetchUserProfile(uid);
            fetchCustomPlaylists(uid);
            fetchFavorites(uid);
          });
        } else {
          const stored = localStorage.getItem('sona_user_id');
          Promise.resolve().then(() => {
            setUserId(stored);
            if (stored) {
              fetchUserProfile(stored);
              fetchCustomPlaylists(stored);
              fetchFavorites(stored);
            }
          });
        }
      });
    } else {
      const stored = localStorage.getItem('sona_user_id');
      Promise.resolve().then(() => {
        setUserId(stored);
        if (stored) {
          fetchUserProfile(stored);
          fetchCustomPlaylists(stored);
          fetchFavorites(stored);
        }
      });
    }

    return () => unsub();
  }, []);

  // 📝 Fungsi Kelola Custom Playlist
  const createCustomPlaylist = async (name, description = '') => {
    if (!name.trim()) return null;
    try {
      const playlistRef = ref(db, `users/${userId}/custom_playlists`);
      const newRef = push(playlistRef);
      const newPlaylist = {
        id: newRef.key,
        name: name.trim(),
        description: description.trim(),
        createdAt: new Date().toISOString(),
        songs: []
      };
      await set(newRef, newPlaylist);
      await fetchCustomPlaylists(userId);
      return newPlaylist;
    } catch (err) {
      console.error("❌ Gagal membuat playlist:", err);
      return null;
    }
  };

  const addToCustomPlaylist = async (playlistId, song) => {
    try {
      const targetPlaylist = customPlaylists.find(p => p.id === playlistId);
      if (!targetPlaylist) return;

      const updatedSongs = [...(targetPlaylist.songs || [])];
      if (!updatedSongs.some(s => (s.id || s.songId) === (song.id || song.songId))) {
        updatedSongs.push(song);
        const songRef = ref(db, `users/${userId}/custom_playlists/${playlistId}/songs`);
        await set(songRef, updatedSongs);
        await fetchCustomPlaylists(userId);
      }
    } catch (err) {
      console.error("❌ Gagal menambah lagu ke playlist:", err);
    }
  };

  const removeFromCustomPlaylist = async (playlistId, songId) => {
    try {
      const targetPlaylist = customPlaylists.find(p => p.id === playlistId);
      if (!targetPlaylist) return;

      const updatedSongs = (targetPlaylist.songs || []).filter(s => (s.id || s.songId) !== songId);
      const songRef = ref(db, `users/${userId}/custom_playlists/${playlistId}/songs`);
      await set(songRef, updatedSongs);
      await fetchCustomPlaylists(userId);
    } catch (err) {
      console.error("❌ Gagal menghapus lagu dari playlist:", err);
    }
  };

  const deleteCustomPlaylist = async (playlistId) => {
    try {
      const playlistRef = ref(db, `users/${userId}/custom_playlists/${playlistId}`);
      await remove(playlistRef);
      await fetchCustomPlaylists(userId);
    } catch (err) {
      console.error("❌ Gagal menghapus playlist:", err);
    }
  };

  // 🎵 Fungsi Kelola Queue (Antrean)
  const addToQueue = (song) => {
    setQueue(prev => [...prev, song]);
  };

  const playNextInQueue = (song) => {
    setQueue(prev => [song, ...prev]);
  };

  const removeFromQueue = (index) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  };

  const clearQueue = () => {
    setQueue([]);
  };

  // Active song computed or custom
  const currentSong = customSong || (playlist.length > 0 && playlist[currentIndex] ? playlist[currentIndex] : null);
  const setCurrentSong = (song) => {
    setCustomSong(song);
    if (song) setHasPlayerStarted(true);
  };

  const playSongAndStart = (song, index) => {
    if (index !== undefined) setCurrentIndex(index);
    if (song) setCustomSong(song);
    setHasPlayerStarted(true);
    setIsPlaying(true);
  };

  const stopAndResetPlayer = () => {
    setIsPlaying(false);
    setCustomSong(null);
    setHasPlayerStarted(false);
  };

  // Ref untuk sinkronisasi data sesi terkini saat browser/tab ditutup
  const sessionIdRef = useRef(null);
  const sessionSongsRef = useRef([]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    sessionSongsRef.current = sessionSongs;
  }, [sessionSongs]);

  // 1. START SESSION: Dimulai saat lagu PERTAMA KALI diputar (isPlaying === true)
  useEffect(() => {
    async function startSession() {
      if (sessionId || !userId) return;
      try {
        const res = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'START', userId })
        });
        const data = await res.json();
        if (data.success) {
          setSessionId(data.sessionId);
          console.log("🟢 Sesi Sona Dimulai (Lagu Diputar) ID:", data.sessionId);
        }
      } catch (err) {
        console.error("❌ Gagal memulai sesi:", err);
      }
    }

    if (isPlaying && !sessionId && userId) {
      startSession();
    }
  }, [isPlaying, sessionId, userId]);

  // 2. END SESSION: Hitung Modus Emosi & Durasi Sesi saat User Menutup Web/Tab/Browser
  useEffect(() => {
    const handleUnload = () => {
      if (sessionIdRef.current) {
        navigator.sendBeacon('/api/session', JSON.stringify({
          action: 'END',
          userId,
          sessionId: sessionIdRef.current,
          songsPlayedInSession: sessionSongsRef.current
        }));
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [userId]);

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

    // Auto play lagu berikutnya (utamakan antrean queue terlebih dahulu)
    if (repeatMode !== 'one' && repeatMode !== 'once') {
      playNextSong();
    }
  };

  // 4. TRIGGER CHATBOT: Memanggil API Chat untuk Sapaan & Gradasi Valensi (Proaktif)
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
          isAutoInitiated: true,
          userMessage: "" // Kosongkan pesan awal agar AI langsung menyapa secara proaktif
        })
      });

      const data = await res.json();
      if (data.success) {
        setAiNotification({
          sapaan: data.sapaanAI,
          analisis: data.analisisIlmiah,
          playlist: data.playlist,
          detectedEmotion: data.detectedEmotion,
          isSpecialCondition
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sona_auto_chat', { detail: data }));
        }
      }
    } catch (err) {
      console.error("❌ Gagal memanggil Chatbot AI:", err);
    }
  };

  // Fungsi Kontrol Navigasi Musik
  const playNextSong = () => {
    // 1. Jika ada antrean di queue, putar item pertama antrean
    if (queue.length > 0) {
      const nextSongFromQueue = queue[0];
      setQueue(prev => prev.slice(1));
      setCustomSong(nextSongFromQueue);
      setIsPlaying(true);
      return;
    }

    if (playlist.length === 0) return;
    setCustomSong(null);

    // 2. Lanjut ke lagu berikutnya atau acak (Smart Shuffle)
    if (playlist.length > 1) {
      if (isShuffle) {
        // 🌟 SMART SHUFFLE (Memilah lagu sesuai preferensi & emosi user / favorit)
        const availableSongs = playlist.filter((_, idx) => idx !== currentIndex);
        
        // Memilih lagu yang cocok dengan emosi, genre, atau lagu yang disukai (favorites)
        const preferredSongs = availableSongs.filter(s => 
          isFavorite(s) || 
          (currentSong && s.emotionalCategory === currentSong.emotionalCategory) ||
          (currentSong && s.genre === currentSong.genre)
        );

        let chosenSong;
        if (preferredSongs.length > 0) {
          chosenSong = preferredSongs[Math.floor(Math.random() * preferredSongs.length)];
        } else {
          chosenSong = availableSongs[Math.floor(Math.random() * availableSongs.length)];
        }

        const nextIndex = playlist.findIndex(s => (s.id || s.title) === (chosenSong.id || chosenSong.title));
        if (nextIndex !== -1) {
          setCurrentIndex(nextIndex);
        } else {
          let randomIndex = Math.floor(Math.random() * playlist.length);
          if (randomIndex === currentIndex) randomIndex = (randomIndex + 1) % playlist.length;
          setCurrentIndex(randomIndex);
        }
      } else {
        // 🔀 SHUFFLE BIASA (Acak lagu biasa tanpa filter)
        let randomIndex = Math.floor(Math.random() * playlist.length);
        if (randomIndex === currentIndex) {
          randomIndex = (randomIndex + 1) % playlist.length;
        }
        setCurrentIndex(randomIndex);
      }
      setIsPlaying(true);
    } else if (playlist.length === 1) {
      setCurrentIndex(0);
      setIsPlaying(true);
    }
  };

  const playPreviousSong = () => {
    if (playlist.length === 0) return;
    setCustomSong(null);
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else {
      // Jika di index 0, acak/pindah lagu sebelumnya
      let randomIndex = Math.floor(Math.random() * playlist.length);
      setCurrentIndex(randomIndex);
    }
    setIsPlaying(true);
  };

  const toggleRepeatMode = () => {
    setRepeatMode(prev => {
      if (prev === 'off') return 'once';   // Klik 1x: Repeat 1x (Auto-off setelah 1x diputar)
      if (prev === 'once') return 'one';  // Klik 2x: Repeat On / Repeat Biasa (Terus-menerus)
      return 'off';                       // Klik 3x: Repeat Off (Mati)
    });
  };

  const toggleShuffle = () => {
    // Jika Repeat sedang aktif, menyalakan/mengganti Smart Shuffle akan otomatis mematikan Repeat
    if (repeatMode !== 'off') {
      setRepeatMode('off');
      setIsShuffle(true); // Aktifkan Smart Shuffle ✨
    } else {
      // Mengubah antara Smart Shuffle ✨ (true) dan Shuffle Biasa 🔀 (false)
      setIsShuffle(prev => !prev);
    }
  };

  const dismissNotification = () => setAiNotification(null);

  return (
    <AudioContext.Provider value={{
      // User Info
      userId,
      setUserId,
      userProfile,
      fetchUserProfile,

      // State & Kontrol Player
      playlist,
      setPlaylist,
      currentIndex,
      setCurrentIndex,
      currentSong,
      setCurrentSong,
      isPlaying,
      setIsPlaying,
      hasPlayerStarted,
      setHasPlayerStarted,
      playSongAndStart,
      stopAndResetPlayer,
      repeatMode,
      setRepeatMode,
      toggleRepeatMode,
      isShuffle,
      setIsShuffle,
      toggleShuffle,
      playNextSong,
      playPreviousSong,
      handleSongEnd,

      // State & Kontrol Antrean (Queue)
      queue,
      setQueue,
      addToQueue,
      playNextInQueue,
      removeFromQueue,
      clearQueue,

      // State & Kontrol Custom Playlist & Favorit
      customPlaylists,
      createCustomPlaylist,
      addToCustomPlaylist,
      removeFromCustomPlaylist,
      deleteCustomPlaylist,
      fetchCustomPlaylists,
      favorites,
      toggleFavorite,
      isFavorite,
      
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
