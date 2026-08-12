'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AiModalPopup from '@/components/AiModalPopup';
import ProfileView from '@/components/ProfileView';
import { useAudio } from '@/context/AudioContext';
import { 
  Home, 
  Library, 
  Bot, 
  User, 
  Search, 
  Plus, 
  Play, 
  ListPlus, 
  MoreVertical, 
  Sparkles, 
  Send,
  Music2,
  Heart,
  TrendingUp,
  CloudRain,
  Sun,
  Leaf,
  Zap,
  Flame,
  BarChart3,
  CheckCircle2,
  LifeBuoy,
  Info,
  PhoneCall,
  ShieldCheck,
  AlertTriangle,
  Smile,
  X,
  Check,
  HeartPulse,
  RefreshCw,
  Shuffle
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const {
    userId,
    userProfile,
    setPlaylist,
    setCurrentSong,
    setIsPlaying,
    setHasPlayerStarted,
    currentSong,
    addToQueue,
    customPlaylists,
    addToCustomPlaylist,
    createCustomPlaylist,
    aiNotification,
    toggleFavorite,
    isFavorite,
    favorites
  } = useAudio();

  const [loading, setLoading] = useState(false);
  const [songs, setSongs] = useState([]);
  const [totalSongs, setTotalSongs] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // all, valence, sedih, senang, tenang, cemas
  const [displayLimit, setDisplayLimit] = useState(100);
  const [sortMode, setSortMode] = useState('default'); // 'default' | 'most_played' | 'shuffle'
  const [shuffledSeed, setShuffledSeed] = useState(0);
  const [playCounts, setPlayCounts] = useState({});
  
  // Spotify Navigation Tabs: 'home' | 'library' | 'chatbot'
  const [activeNavTab, setActiveNavTab] = useState('home');
  const [hasUnreadAiChat, setHasUnreadAiChat] = useState(false);

  // Popup Menu untuk Lagu & Toast
  const [activeSongMenuId, setActiveSongMenuId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Modal Bikin Playlist Baru
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  // Modal Help Center & Edu Sona
  const [isHelpCenterOpen, setIsHelpCenterOpen] = useState(false);
  const [isEduModalOpen, setIsEduModalOpen] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // State untuk Sona AI Chat
  const chatBottomRef = useRef(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState(() => {
    if (typeof window !== 'undefined') {
      const storedUid = localStorage.getItem('sona_user_id') || 'user_001';
      const saved = sessionStorage.getItem(`sona_chat_session_${storedUid}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {}
      }
    }
    return [
      { sender: 'ai', text: 'Halo! Aku Sona AI, sahabat pendengar musikmu. Ceritakan apa yang sedang kamu rasakan atau alami hari ini. Aku siap mendengarkan!' }
    ];
  });

  // Auto-scroll ke pesan paling bawah
  useEffect(() => {
    if (activeNavTab === 'chatbot' || chatMessages.length > 0) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeNavTab]);

  // Simpan chatMessages ke sessionStorage agar tidak hilang saat navigasi tab/pindah halaman di sesi yang sama
  useEffect(() => {
    if (typeof window !== 'undefined' && userId) {
      sessionStorage.setItem(`sona_chat_session_${userId}`, JSON.stringify(chatMessages));
    }
  }, [chatMessages, userId]);

  // Muat play_history dari Firebase untuk menghitung lagu yang sering diputar
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    let isMounted = true;
    const loadPlayCounts = async () => {
      try {
        const { ref, get } = await import('firebase/database');
        const { db } = await import('@/lib/firebase');
        if (!db) return;
        const historyRef = ref(db, `users/${userId}/play_history`);
        const snapshot = await get(historyRef);
        if (snapshot.exists() && isMounted) {
          const val = snapshot.val();
          const counts = {};
          Object.values(val).forEach(item => {
            if (!item) return;
            const sId = String(item.songId || item.id || '');
            const titleKey = (item.title || '').toLowerCase().trim();
            if (sId) counts[sId] = (counts[sId] || 0) + 1;
            if (titleKey) counts[titleKey] = (counts[titleKey] || 0) + 1;
          });
          setPlayCounts(counts);
        }
      } catch (err) {
        console.warn("⚠️ Gagal memuat play history counts:", err.message);
      }
    };
    loadPlayCounts();
    return () => { isMounted = false; };
  }, [userId]);

  // Muat History Chat dari Firebase Database untuk 1 Sesi Chat Terpadu
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    let isMounted = true;
    const loadFirebaseChatHistory = async () => {
      try {
        const { ref, get } = await import('firebase/database');
        const { db } = await import('@/lib/firebase');
        if (!db) return;
        const chatRef = ref(db, `users/${userId}/history_chat`);
        const snapshot = await get(chatRef);
        if (snapshot.exists()) {
          const val = snapshot.val();
          const list = Object.values(val).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
          if (list.length > 0) {
            const formatted = list.map(item => ({
              sender: item.role === 'user' ? 'user' : 'ai',
              text: item.message || item.text || '',
              detectedEmotion: item.detectedEmotion,
              reasoning: item.reasoning,
              timestamp: item.timestamp
            }));
            if (isMounted) {
              setChatMessages(formatted);
            }
          }
        }
      } catch (err) {
        console.warn("⚠️ Gagal memuat history chat dari Firebase:", err.message);
      }
    };

    loadFirebaseChatHistory();
    return () => { isMounted = false; };
  }, [userId]);

  // Reaksi ketika Sona AI proaktif ngechat duluan (auto trigger 5 lagu / repeat 5x)
  useEffect(() => {
    if (aiNotification && aiNotification.sapaan) {
      const timer = setTimeout(() => {
        setChatMessages(prev => {
          if (prev.some(m => m.text === aiNotification.sapaan)) return prev;
          return [
            ...prev,
            {
              sender: 'ai',
              text: aiNotification.sapaan,
              detectedEmotion: aiNotification.detectedEmotion,
              playlist: aiNotification.playlist,
              isProactive: true
            }
          ];
        });
        if (activeNavTab !== 'chatbot') {
          setHasUnreadAiChat(true);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [aiNotification, activeNavTab]);

  // Listen Event Custom 'sona_auto_chat' dari Player
  useEffect(() => {
    const handleSonaAutoChat = (e) => {
      if (e.detail && (e.detail.sapaanAI || e.detail.sapaan)) {
        const sapaanText = e.detail.sapaanAI || e.detail.sapaan;
        setChatMessages(prev => {
          if (prev.some(m => m.text === sapaanText)) return prev;
          return [
            ...prev,
            {
              sender: 'ai',
              text: sapaanText,
              detectedEmotion: e.detail.detectedEmotion,
              playlist: e.detail.playlist,
              isProactive: true
            }
          ];
        });
        if (activeNavTab !== 'chatbot') {
          setHasUnreadAiChat(true);
        }
      }
    };
    window.addEventListener('sona_auto_chat', handleSonaAutoChat);
    return () => window.removeEventListener('sona_auto_chat', handleSonaAutoChat);
  }, [activeNavTab]);

  useEffect(() => {
    if (!userId) {
      router.push('/login');
      return;
    }
    // Fetch 100 lagu pertama untuk pemuatan cepat
    fetch('/api/songs?limit=100')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.songs) {
          setSongs(data.songs);
          setTotalSongs(data.total || data.songs.length);
          setHasMore(data.hasMore || false);
          setPlaylist(data.songs);
        }
      })
      .catch((err) => console.error("Gagal mengambil data lagu:", err));
  }, [router, userId, setPlaylist]);

  // Fungsi memuat sisa lagu
  const loadAllSongs = async () => {
    if (isLoadingMore || songs.length >= totalSongs) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch('/api/songs?all=true');
      const data = await res.json();
      if (data.success && data.songs) {
        setSongs(data.songs);
        setHasMore(false);
        setPlaylist(data.songs);
        setDisplayLimit(data.songs.length);
      }
    } catch (err) {
      console.error("Gagal memuat semua lagu:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadMoreChunk = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/songs?limit=100&offset=${songs.length}`);
      const data = await res.json();
      if (data.success && data.songs) {
        const updated = [...songs, ...data.songs];
        setSongs(updated);
        setHasMore(data.hasMore || false);
        setPlaylist(updated);
        setDisplayLimit(prev => prev + 100);
      }
    } catch (err) {
      console.error("Gagal memuat lagu tambahan:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim() && songs.length < totalSongs && !isLoadingMore) {
      loadAllSongs();
    }
  };

  // Helper formatted Mood Label in English (4 core moods: Happy, Relaxed, Angry, Sad)
  const getMoodLabelInEnglish = (cat) => {
    if (!cat) return 'Song';
    const c = cat.toLowerCase().trim();
    if (c === 'sedih' || c === 'sad') return 'Sad 🌧️';
    if (c === 'senang' || c === 'happy') return 'Happy ☀️';
    if (c === 'tenang' || c === 'calm' || c === 'relaxed' || c === 'relaks') return 'Relaxed 🍃';
    if (c === 'marah' || c === 'angry') return 'Angry 😡';
    if (c === 'cemas' || c === 'anxious' || c === 'stres' || c === 'stress') return 'Relaxed 🍃';
    return cat;
  };

  // Filter & Sort Lagu
  const filteredSongs = songs.filter((song) => {
    const cat = (song.emotionalCategory || '').toLowerCase().trim();
    if ((activeTab === 'sedih' || activeTab === 'sad') && !(cat === 'sedih' || cat === 'sad')) return false;
    if ((activeTab === 'senang' || activeTab === 'happy') && !(cat === 'senang' || cat === 'happy')) return false;
    if ((activeTab === 'relaxed' || activeTab === 'tenang' || activeTab === 'calm') && !(cat === 'tenang' || cat === 'calm' || cat === 'relaxed' || cat === 'relaks' || cat === 'cemas' || cat === 'anxious')) return false;
    if ((activeTab === 'marah' || activeTab === 'angry') && !(cat === 'marah' || cat === 'angry')) return false;

    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (song.title && song.title.toLowerCase().includes(query)) ||
      (song.artist && song.artist.toLowerCase().includes(query)) ||
      (song.genre && song.genre.toLowerCase().includes(query)) ||
      (song.emotionalCategory && song.emotionalCategory.toLowerCase().includes(query))
    );
  });

  const getSortedSongs = () => {
    if (sortMode === 'most_played') {
      return [...filteredSongs].sort((a, b) => {
        const aId = String(a.id || '');
        const bId = String(b.id || '');
        const aTitle = (a.title || '').toLowerCase().trim();
        const bTitle = (b.title || '').toLowerCase().trim();
        const countA = (playCounts[aId] || 0) + (playCounts[aTitle] || 0) + (parseInt(a.play_count || a.popularity || 0) || 0);
        const countB = (playCounts[bId] || 0) + (playCounts[bTitle] || 0) + (parseInt(b.play_count || b.popularity || 0) || 0);
        return countB - countA;
      });
    }
    if (sortMode === 'shuffle') {
      const array = [...filteredSongs];
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.abs(Math.sin(i * 12.9898 + (shuffledSeed + 1) * 78.233) * 43758.5453) % (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
      }
      return array;
    }
    if (activeTab === 'valence') {
      return [...filteredSongs].sort((a, b) => (parseFloat(a.valence) || 0) - (parseFloat(b.valence) || 0));
    }
    return filteredSongs;
  };

  const displayedSongs = getSortedSongs();

  const handlePlaySong = (song, index) => {
    setPlaylist(displayedSongs);
    setCurrentSong(song);
    setHasPlayerStarted(true);
    setIsPlaying(true);
  };

  const handleAddToQueue = (e, song) => {
    e.stopPropagation();
    addToQueue(song);
    setActiveSongMenuId(null);
    showToast(`"${song.title}" ditambahkan ke antrean.`);
  };

  const handleAddToPlaylist = async (e, playlistId, song) => {
    e.stopPropagation();
    await addToCustomPlaylist(playlistId, song);
    setActiveSongMenuId(null);
    showToast(`"${song.title}" ditambahkan ke playlist.`);
  };

  const handleCreateAndAdd = async (e, song) => {
    e.stopPropagation();
    const name = prompt("Masukkan nama playlist baru:");
    if (!name || !name.trim()) return;
    const newPl = await createCustomPlaylist(name.trim());
    if (newPl) {
      await addToCustomPlaylist(newPl.id, song);
      showToast(`Playlist "${name}" dibuat dan lagu ditambahkan.`);
    }
    setActiveSongMenuId(null);
  };

  const handleCreatePlaylistSubmit = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const newPl = await createCustomPlaylist(newPlaylistName.trim());
    if (newPl) {
      showToast(`Playlist "${newPlaylistName.trim()}" berhasil dibuat!`);
      setNewPlaylistName('');
      setIsCreatePlaylistOpen(false);
    }
  };

  const sendDirectChatMessage = async (userText) => {
    if (!userText || !userText.trim()) return;

    setChatMessages(prev => [
      ...prev, 
      { sender: 'user', text: userText },
      { sender: 'ai', text: 'Sona AI sedang mencerna ceritamu...', isLoading: true }
    ]);

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
        setChatMessages(prev => {
          const filtered = prev.filter(m => !m.isLoading);
          return [
            ...filtered,
            {
              sender: 'ai',
              text: data.sapaanAI || data.message,
              detectedEmotion: data.detectedEmotion,
              playlist: data.playlist,
              shouldUpdatePlaylist: data.shouldUpdatePlaylist
            }
          ];
        });

        if (data.shouldUpdatePlaylist && data.playlist && data.playlist.length > 0) {
          setSongs(data.playlist);
          setPlaylist(data.playlist);
          showToast(`🎵 Gradasi musik dimuat!`);
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

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatInput('');
    await sendDirectChatMessage(userText);
  };

  const handleSelectNavTab = (tab) => {
    setActiveNavTab(tab);
    if (tab === 'chatbot') {
      setHasUnreadAiChat(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121212] text-white flex items-center justify-center">
        <p className="animate-pulse text-[#1DB954] font-semibold text-sm">Memuat Spotify Sona...</p>
      </div>
    );
  }

  // Playlists Data for Spotify Quick Grid (Essential initial playlists: Sona AI Music, 4 Moods, My Collection + User Custom Playlists)
  const quickPlaylists = [
    {
      id: 'sona_ai',
      title: 'Sona Music',
      subtitle: 'Adaptive AI Arc',
      icon: <Sparkles className="w-5 h-5 text-indigo-400" />,
      bg: 'from-[#2e1065] to-[#121212]',
      action: () => {
        const aiMsgWithPlaylist = [...chatMessages].reverse().find(m => m.playlist && m.playlist.length > 0);
        if (aiMsgWithPlaylist && aiMsgWithPlaylist.playlist.length > 0) {
          setSongs(aiMsgWithPlaylist.playlist);
          setPlaylist(aiMsgWithPlaylist.playlist);
          showToast(`✨ Rekomendasi Musik AI Terbaru`);
        } else if (aiNotification && aiNotification.playlist && aiNotification.playlist.length > 0) {
          setSongs(aiNotification.playlist);
          setPlaylist(aiNotification.playlist);
          showToast(`✨ Rekomendasi Musik AI Terbaru`);
        } else {
          showToast("✨ Menampilkan Rekomendasi Musik Terbaru AI");
          setActiveTab('all');
        }
        setActiveNavTab('home');
      }
    },
    {
      id: 'happy',
      title: 'Happy Mood',
      subtitle: 'Positive Energy',
      icon: <Sun className="w-5 h-5 text-amber-400" />,
      bg: 'from-[#78350f] to-[#121212]',
      action: () => setActiveTab('happy')
    },
    {
      id: 'relaxed',
      title: 'Relaxed Mood',
      subtitle: 'Calm & De-stress',
      icon: <Leaf className="w-5 h-5 text-[#1DB954]" />,
      bg: 'from-[#064e3b] to-[#121212]',
      action: () => setActiveTab('relaxed')
    },
    {
      id: 'angry',
      title: 'Angry Mood',
      subtitle: 'Catharsis & Release',
      icon: <Flame className="w-5 h-5 text-rose-500" />,
      bg: 'from-[#881337] to-[#121212]',
      action: () => setActiveTab('marah')
    },
    {
      id: 'sad',
      title: 'Sad Mood',
      subtitle: 'Comfort & Relief',
      icon: <CloudRain className="w-5 h-5 text-sky-400" />,
      bg: 'from-[#0c4a6e] to-[#121212]',
      action: () => setActiveTab('sedih')
    },
    {
      id: 'all_collection',
      title: 'My Collection',
      subtitle: `${songs.length} Tracks`,
      icon: <Music2 className="w-5 h-5 text-slate-300" />,
      bg: 'from-[#27272a] to-[#121212]',
      action: () => setActiveTab('all')
    },
    // Append user custom playlists if available
    ...(customPlaylists.map((pl, idx) => ({
      id: pl.id,
      title: pl.name,
      subtitle: `${(pl.songs || []).length} Tracks`,
      icon: <Music2 className="w-5 h-5 text-emerald-400" />,
      bg: idx % 2 === 0 ? 'from-[#134e4a] to-[#121212]' : 'from-[#164e63] to-[#121212]',
      action: () => {
        if (pl.songs && pl.songs.length > 0) {
          setSongs(pl.songs);
          setPlaylist(pl.songs);
          showToast(`🎵 Playing Playlist "${pl.name}"`);
        } else {
          showToast(`Playlist "${pl.name}" is empty.`);
        }
      }
    })))
  ];

  return (
    <div className="min-h-screen bg-[#121212] text-slate-100 flex flex-col font-sans pb-36 select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#1DB954] text-black text-xs font-bold px-5 py-2.5 rounded-full shadow-2xl animate-bounce flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. TAB HOMEPAGE */}
      {/* ========================================================= */}
      {activeNavTab === 'home' && (
        <div className="flex-1 max-w-md md:max-w-2xl mx-auto w-full px-4 pt-3 space-y-4">
          {/* Header Top: Search & Profile Avatar */}
          <div className="flex items-center justify-between gap-3 sticky top-0 bg-[#121212]/95 backdrop-blur-md py-2.5 z-30 border-b border-slate-800/40">
            {/* Search Input Bar */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Apa yang ingin kamu dengarkan?"
                className="w-full bg-[#242424] hover:bg-[#2a2a2a] border border-slate-800/80 text-xs text-white rounded-full pl-9 pr-4 py-2.5 focus:outline-none focus:border-[#1DB954] placeholder-slate-400 transition"
              />
            </div>

            {/* Profile Avatar Button */}
            <button
              onClick={() => handleSelectNavTab('profile')}
              className="flex items-center p-0.5 bg-[#242424] hover:bg-[#2a2a2a] border border-slate-700/60 rounded-full transition flex-shrink-0"
              title="Profil Pengguna"
            >
              {userProfile?.photoURL ? (
                <img src={userProfile.photoURL} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#1DB954] text-black flex items-center justify-center font-bold text-xs" suppressHydrationWarning>
                  {(userProfile?.fullName || userId || 'U')[0].toUpperCase()}
                </div>
              )}
            </button>
          </div>

          {/* Spotify Mobile Top Filter Pills (4 Core Moods in English) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: 'All' },
              { id: 'happy', label: '☀️ Happy' },
              { id: 'relaxed', label: '🍃 Relaxed' },
              { id: 'marah', label: '😡 Angry' },
              { id: 'sedih', label: '🌧️ Sad' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  activeTab === tab.id 
                    ? 'bg-[#1DB954] text-black font-bold shadow-md shadow-[#1DB954]/20' 
                    : 'bg-[#282828] text-slate-300 hover:text-white hover:bg-[#333333]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 🎵 Tampilan 8 Playlist Teratas (Spotify 2-Column Grid) */}
          <div className="space-y-2 pt-1">
            <h2 className="text-base font-bold text-white tracking-tight">Selamat Datang 👋</h2>
            
            <div className="grid grid-cols-2 gap-2">
              {quickPlaylists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={pl.action}
                  className={`group flex items-center bg-[#282828]/90 hover:bg-[#323232] rounded-md cursor-pointer transition shadow-sm overflow-hidden border border-slate-800/40`}
                >
                  <div className={`w-12 h-12 bg-gradient-to-br ${pl.bg} flex items-center justify-center flex-shrink-0`}>
                    {pl.icon}
                  </div>
                  <div className="min-w-0 flex-1 px-2.5">
                    <h3 className="text-[11px] font-bold text-white truncate group-hover:text-[#1DB954] transition leading-tight">
                      {pl.title}
                    </h3>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 🎶 Tampilan Koleksi Musik Tersedia (Persegi Panjang Cards) */}
          <div className="space-y-2.5 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">Daftar Musik Tersedia ({displayedSongs.length})</h3>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                <button
                  onClick={() => setSortMode('default')}
                  className={`px-2.5 py-1 rounded-full text-[11px] border font-medium transition ${
                    sortMode === 'default'
                      ? 'bg-[#1DB954] text-black border-[#1DB954] font-bold shadow-sm'
                      : 'bg-[#242424] text-slate-300 border-slate-700/60 hover:text-white hover:bg-[#2e2e2e]'
                  }`}
                >
                  Default
                </button>
                <button
                  onClick={() => setSortMode('most_played')}
                  className={`px-2.5 py-1 rounded-full text-[11px] border font-medium transition flex items-center gap-1.5 ${
                    sortMode === 'most_played'
                      ? 'bg-[#1DB954] text-black border-[#1DB954] font-bold shadow-sm'
                      : 'bg-[#242424] text-slate-300 border-slate-700/60 hover:text-white hover:bg-[#2e2e2e]'
                  }`}
                  title="Urutkan berdasarkan lagu paling sering diputar"
                >
                  <TrendingUp className="w-3 h-3" />
                  Sering Diputar
                </button>
                <button
                  onClick={() => {
                    setSortMode('shuffle');
                    setShuffledSeed(prev => prev + 1);
                  }}
                  className={`px-2.5 py-1 rounded-full text-[11px] border font-medium transition flex items-center gap-1.5 ${
                    sortMode === 'shuffle'
                      ? 'bg-[#1DB954] text-black border-[#1DB954] font-bold shadow-sm'
                      : 'bg-[#242424] text-slate-300 border-slate-700/60 hover:text-white hover:bg-[#2e2e2e]'
                  }`}
                  title="Acak urutan lagu"
                >
                  <Shuffle className="w-3 h-3" />
                  Acak
                </button>
                {songs.length < totalSongs && (
                  <button 
                    onClick={loadAllSongs}
                    className="text-[11px] font-semibold text-[#1DB954] hover:underline ml-1 whitespace-nowrap"
                  >
                    Muat Semua
                  </button>
                )}
              </div>
            </div>

            {displayedSongs.length === 0 ? (
              <div className="text-center py-10 bg-[#181818] rounded-xl text-slate-500 text-xs border border-slate-800/60">
                Tidak ada lagu yang cocok dengan pencarian/kategori.
              </div>
            ) : (
              <div className="space-y-1.5">
                {displayedSongs.slice(0, displayLimit).map((song, index) => {
                  const isCurrent = currentSong?.id === song.id;
                  const isMenuOpen = activeSongMenuId === (song.id || index);
                  const favorited = isFavorite(song);

                  return (
                    <div
                      key={`${song.id || 'song'}-${index}`}
                      className={`group relative flex items-center justify-between p-2 rounded-lg transition ${
                        isCurrent 
                          ? 'bg-[#1DB954]/15 border border-[#1DB954]/40 text-[#1DB954]' 
                          : 'bg-[#181818] hover:bg-[#282828] border border-slate-800/40 text-slate-200'
                      }`}
                    >
                      {/* Left: Thumbnail + Title + Artist */}
                      <div
                        onClick={() => handlePlaySong(song, index)}
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      >
                        {song.coverUrl ? (
                          <img
                            src={song.coverUrl}
                            alt={song.title}
                            className="w-11 h-11 rounded-md object-cover bg-slate-800 flex-shrink-0 shadow"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-md bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-sm font-bold text-[#1DB954] flex-shrink-0">
                            <Music2 className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold truncate ${isCurrent ? 'text-[#1DB954]' : 'text-white'}`}>
                            {song.title || 'Judul Lagu'}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{song.artist || 'Artis'}</p>
                        </div>
                      </div>

                      {/* Right: Mood Tag + Action Buttons */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {song.emotionalCategory && (
                          <span className="text-[9px] font-semibold px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-full hidden sm:inline">
                            {getMoodLabelInEnglish(song.emotionalCategory)}
                          </span>
                        )}

                        {/* Tombol + (Tambah ke Lagu Disukai / Liked Songs) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(song);
                            showToast(favorited ? "Dihapus dari Lagu Disukai 💔" : "Dimasukkan ke Daftar Lagu Disukai ❤️");
                          }}
                          className={`p-1.5 rounded-full transition ${
                            favorited 
                              ? 'text-[#1DB954] bg-[#1DB954]/20' 
                              : 'text-slate-400 hover:text-white hover:bg-slate-800'
                          }`}
                          title={favorited ? 'Hapus dari Lagu Disukai' : 'Masud ke Daftar Lagu Disukai (+)'}
                        >
                          <Plus className={`w-4 h-4 ${favorited ? 'rotate-45 transition' : ''}`} />
                        </button>

                        <button
                          onClick={(e) => handleAddToQueue(e, song)}
                          className="p-1.5 text-slate-400 hover:text-[#1DB954] hover:bg-[#1DB954]/10 rounded-full transition"
                          title="Tambah ke Antrean"
                        >
                          <ListPlus className="w-4 h-4" />
                        </button>

                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveSongMenuId(isMenuOpen ? null : (song.id || index));
                            }}
                            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Dropdown Menu */}
                          {isMenuOpen && (
                            <div className="absolute right-0 top-8 w-52 bg-[#282828] border border-slate-700 rounded-xl shadow-2xl z-50 p-2 space-y-1 text-xs">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePlaySong(song, index);
                                  setActiveSongMenuId(null);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-[#333333] rounded-lg text-white font-medium flex items-center gap-2"
                              >
                                <Play className="w-3.5 h-3.5 text-[#1DB954]" /> Putar Sekarang
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(song);
                                  showToast(favorited ? "Dihapus dari Lagu Disukai 💔" : "Dimasukkan ke Daftar Lagu Disukai ❤️");
                                  setActiveSongMenuId(null);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-[#333333] rounded-lg text-white font-medium flex items-center gap-2"
                              >
                                <Heart className={`w-3.5 h-3.5 ${favorited ? 'fill-[#1DB954] text-[#1DB954]' : 'text-slate-400'}`} />
                                {favorited ? 'Dihapus dari Disukai' : 'Suka / Disukai (+)'}
                              </button>
                              <button
                                onClick={(e) => handleAddToQueue(e, song)}
                                className="w-full text-left px-3 py-2 hover:bg-[#333333] rounded-lg text-[#1DB954] flex items-center gap-2"
                              >
                                <ListPlus className="w-3.5 h-3.5" /> Tambah ke Antrean
                              </button>
                              
                              <div className="border-t border-slate-700 my-1 pt-1">
                                <p className="px-3 py-1 text-[9px] text-slate-400 font-bold uppercase">Playlist Kamu</p>
                                {customPlaylists.map(pl => (
                                  <button
                                    key={pl.id}
                                    onClick={(e) => handleAddToPlaylist(e, pl.id, song)}
                                    className="w-full text-left px-3 py-1.5 hover:bg-[#333333] text-slate-200 truncate text-[11px]"
                                  >
                                    🎶 {pl.name}
                                  </button>
                                ))}
                                <button
                                  onClick={(e) => handleCreateAndAdd(e, song)}
                                  className="w-full text-left px-3 py-1.5 hover:bg-[#333333] text-[#1DB954] text-[11px] border-t border-slate-700/60 mt-1 flex items-center gap-1.5"
                                >
                                  <Plus className="w-3 h-3" /> Buat Playlist Baru
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Load More Controls */}
                {songs.length < totalSongs && (
                  <button
                    onClick={loadMoreChunk}
                    disabled={isLoadingMore}
                    className="w-full py-2.5 text-xs font-bold text-[#1DB954] bg-[#181818] hover:bg-[#282828] border border-slate-800 rounded-xl transition mt-2"
                  >
                    {isLoadingMore ? 'Memuat...' : `+ Muat 100 Lagu Lagi`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. TAB YOUR LIBRARY */}
      {/* ========================================================= */}
      {activeNavTab === 'library' && (
        <div className="flex-1 max-w-md md:max-w-2xl mx-auto w-full px-4 pt-3 space-y-4">
          {/* Library Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <Library className="w-6 h-6 text-[#1DB954]" />
              <h2 className="text-xl font-bold text-white tracking-tight">Your Library</h2>
            </div>

            <button
              onClick={() => setIsCreatePlaylistOpen(true)}
              className="p-2 bg-[#282828] hover:bg-[#333333] text-white rounded-full transition flex items-center justify-center"
              title="Buat Playlist Baru"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Bikin Playlist Baru */}
          {isCreatePlaylistOpen && (
            <form onSubmit={handleCreatePlaylistSubmit} className="p-4 bg-[#181818] border border-slate-700 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Nama Playlist Baru</h3>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Contoh: Lagu Pengantar Tidur"
                className="w-full bg-[#282828] border border-slate-700 text-xs text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-[#1DB954]"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatePlaylistOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#1DB954] text-black font-bold text-xs rounded-xl"
                >
                  Simpan
                </button>
              </div>
            </form>
          )}

          {/* Special AI Playlists */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rekomendasi AI</h3>
            
            <div 
              onClick={() => {
                const aiMsgWithPlaylist = [...chatMessages].reverse().find(m => m.playlist && m.playlist.length > 0);
                if (aiMsgWithPlaylist && aiMsgWithPlaylist.playlist.length > 0) {
                  setSongs(aiMsgWithPlaylist.playlist);
                  setPlaylist(aiMsgWithPlaylist.playlist);
                  showToast(`✨ Rekomendasi Musik AI Terbaru`);
                } else if (aiNotification && aiNotification.playlist && aiNotification.playlist.length > 0) {
                  setSongs(aiNotification.playlist);
                  setPlaylist(aiNotification.playlist);
                  showToast(`✨ Rekomendasi Musik AI Terbaru`);
                } else {
                  showToast("✨ Menampilkan Rekomendasi Musik Terbaru AI");
                  setActiveTab('all');
                }
                setActiveNavTab('home');
              }}
              className="flex items-center justify-between p-3.5 bg-gradient-to-r from-indigo-950/80 to-[#181818] border border-indigo-500/30 rounded-xl cursor-pointer hover:border-indigo-400 transition shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Sona AI Music</h4>
                  <p className="text-xs text-slate-400">Daftar lagu rekomendasi terbaru dari AI</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-indigo-300 bg-indigo-950 border border-indigo-700/50 px-2.5 py-1 rounded-full">
                AI Powered
              </span>
            </div>
          </div>

          {/* Lagu Disukai (Liked Songs) */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lagu Disukai</h3>
            
            <div 
              onClick={() => {
                if (favorites && favorites.length > 0) {
                  setSongs(favorites);
                  setPlaylist(favorites);
                  showToast("❤️ Memutar Daftar Lagu Disukai");
                  setActiveNavTab('home');
                } else {
                  showToast("Belum ada lagu disukai. Tekan + pada lagu untuk menyukai.");
                }
              }}
              className="flex items-center justify-between p-3.5 bg-gradient-to-r from-emerald-950/80 to-[#181818] border border-[#1DB954]/40 rounded-xl cursor-pointer hover:border-[#1DB954] transition shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#1DB954] flex items-center justify-center text-black font-bold shadow">
                  <Heart className="w-6 h-6 fill-black" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">Lagu Disukai (Liked Songs)</h4>
                  <p className="text-xs text-slate-400">{(favorites || []).length} lagu tersimpan</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (favorites && favorites.length > 0) {
                    setPlaylist(favorites);
                    setCurrentSong(favorites[0]);
                    setHasPlayerStarted(true);
                    setIsPlaying(true);
                  } else {
                    showToast("Belum ada lagu disukai.");
                  }
                }}
                className="w-8 h-8 rounded-full bg-[#1DB954] text-black font-bold flex items-center justify-center shadow hover:scale-105 transition"
              >
                <Play className="w-4 h-4 fill-black" />
              </button>
            </div>
          </div>

          {/* Custom Playlists Buatan User */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Playlist Saya ({customPlaylists.length})
            </h3>

            {customPlaylists.length === 0 ? (
              <div className="p-6 text-center bg-[#181818] border border-slate-800 rounded-2xl text-slate-500 text-xs space-y-2">
                <p>Belum ada playlist kustom.</p>
                <button
                  onClick={() => setIsCreatePlaylistOpen(true)}
                  className="text-[#1DB954] font-bold hover:underline"
                >
                  + Buat Playlist Pertama
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {customPlaylists.map(pl => (
                  <div
                    key={pl.id}
                    onClick={() => {
                      if (pl.songs && pl.songs.length > 0) {
                        setSongs(pl.songs);
                        setPlaylist(pl.songs);
                        showToast(`🎵 Memutar Playlist "${pl.name}"`);
                        setActiveNavTab('home');
                      } else {
                        showToast(`Playlist "${pl.name}" masih kosong.`);
                      }
                    }}
                    className="flex items-center justify-between p-3 bg-[#181818] hover:bg-[#282828] border border-slate-800 rounded-xl cursor-pointer transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-lg bg-emerald-950 border border-emerald-500/30 flex items-center justify-center text-[#1DB954]">
                        <Music2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">{pl.name}</h4>
                        <p className="text-[10px] text-slate-400">{(pl.songs || []).length} Lagu</p>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (pl.songs && pl.songs.length > 0) {
                          setPlaylist(pl.songs);
                          setCurrentSong(pl.songs[0]);
                          setIsPlaying(true);
                        }
                      }}
                      className="w-8 h-8 rounded-full bg-[#1DB954] text-black font-bold flex items-center justify-center shadow hover:scale-105 transition"
                    >
                      <Play className="w-4 h-4 fill-black" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. TAB CHATBOT (SONA AI) */}
      {/* ========================================================= */}
      {activeNavTab === 'chatbot' && (
        <div className="flex-1 max-w-md md:max-w-2xl mx-auto w-full px-3 md:px-4 pt-3 flex flex-col h-[calc(100vh-140px)]">
          {/* Chat Header */}
          <div className="p-3 bg-[#181818] border border-slate-800 rounded-t-2xl flex items-center justify-between gap-2 shadow-lg shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow shrink-0">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-white truncate">Sona AI Companion</h3>
                <p className="text-[10px] text-[#1DB954] flex items-center gap-1 font-semibold truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-pulse shrink-0"></span> Online<span className="hidden sm:inline"> • Psikologi Musik</span>
                </p>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsHelpCenterOpen(true)}
                title="Help Center & Hotline Bantuan Psikolog"
                className="px-2 sm:px-2.5 py-1 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-[10px] sm:text-[11px] font-bold rounded-xl transition flex items-center gap-1 shrink-0"
              >
                <LifeBuoy className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Help Center</span>
              </button>

              <button
                onClick={() => setIsEduModalOpen(true)}
                title="Info Lanjut & Panduan Sona AI"
                className="px-2 sm:px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 rounded-xl transition flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold shrink-0"
              >
                <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-indigo-200">Info Lanjut</span>
              </button>
            </div>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 p-3 md:p-4 bg-[#121212] border-x border-slate-800/80 overflow-y-auto space-y-3 text-xs min-h-0">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] p-3.5 rounded-2xl leading-relaxed space-y-2 ${
                    msg.sender === 'user'
                      ? 'bg-[#1DB954] text-black font-medium rounded-tr-none shadow-md'
                      : 'bg-[#181818] border border-slate-800 text-slate-200 rounded-tl-none shadow-md'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* Tombol Muat Gradasi Musik */}
                  {msg.sender === 'ai' && msg.playlist && msg.playlist.length > 0 && (
                    <button
                      onClick={() => {
                        setSongs(msg.playlist);
                        setPlaylist(msg.playlist);
                        setCurrentSong(msg.playlist[0]);
                        setIsPlaying(true);
                        showToast(`🎵 Memutar Gradasi Musik`);
                      }}
                      className="mt-2 w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] rounded-xl transition shadow flex items-center justify-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" /> Putar Gradasi Musik
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Form Docked (Fixed Bottom) */}
          <form onSubmit={handleSendChat} className="p-3 bg-[#181818] border border-slate-800 rounded-b-2xl flex gap-2 shrink-0">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ceritakan mood, pemicu, atau preferensi lagumu ke Sona AI..."
              className="flex-1 bg-[#282828] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#1DB954] placeholder-slate-400"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-[#1DB954] hover:bg-[#1aa34a] text-black font-bold text-xs rounded-xl transition shadow flex items-center gap-1 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. TAB PROFILE */}
      {/* ========================================================= */}
      {activeNavTab === 'profile' && (
        <div className="flex-1 w-full pb-20">
          <ProfileView onBackToHome={() => handleSelectNavTab('home')} />
        </div>
      )}

      {/* Pop-up Notifikasi AI saat Trigger 5 Lagu / Repeat (Rendered on demand) */}
      {aiNotification && <AiModalPopup />}

      {/* ========================================================= */}
      {/* 5. BOTTOM NAVIGATION BAR (SPOTIFY STYLE) */}
      {/* ========================================================= */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#000000]/95 backdrop-blur-lg border-t border-slate-800/80 z-50 flex items-center justify-around px-2 shadow-2xl">
        {/* Tab 1: Home */}
        <button
          onClick={() => handleSelectNavTab('home')}
          className={`flex flex-col items-center gap-1 transition ${
            activeNavTab === 'home' ? 'text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Home className={`w-5 h-5 ${activeNavTab === 'home' ? 'text-white fill-white' : ''}`} />
          <span className={`text-[10px] ${activeNavTab === 'home' ? 'font-bold text-white' : 'font-medium'}`}>
            Home
          </span>
        </button>

        {/* Tab 2: Your Library */}
        <button
          onClick={() => handleSelectNavTab('library')}
          className={`flex flex-col items-center gap-1 transition ${
            activeNavTab === 'library' ? 'text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Library className={`w-5 h-5 ${activeNavTab === 'library' ? 'text-white fill-white' : ''}`} />
          <span className={`text-[10px] ${activeNavTab === 'library' ? 'font-bold text-white' : 'font-medium'}`}>
            Your Library
          </span>
        </button>

        {/* Tab 3: Chatbot Sona AI */}
        <div className="relative">
          {hasUnreadAiChat && (
            <div 
              onClick={() => handleSelectNavTab('chatbot')}
              className="absolute -top-9 left-1/2 -translate-x-1/2 bg-[#1DB954] text-black text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-2xl border border-emerald-300 animate-bounce cursor-pointer flex items-center gap-1 whitespace-nowrap z-50"
            >
              <span>💬 Pesan Sona AI</span>
            </div>
          )}

          <button
            onClick={() => handleSelectNavTab('chatbot')}
            className={`flex flex-col items-center gap-1 transition ${
              activeNavTab === 'chatbot' ? 'text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <div className="relative">
              <Bot className={`w-5 h-5 ${activeNavTab === 'chatbot' ? 'text-white' : ''}`} />
              {hasUnreadAiChat && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-black animate-pulse"></span>
              )}
            </div>
            <span className={`text-[10px] ${activeNavTab === 'chatbot' ? 'font-bold text-white' : 'font-medium'}`}>
              Sona AI
            </span>
          </button>
        </div>

        {/* Tab 4: Profile */}
        <button
          onClick={() => handleSelectNavTab('profile')}
          className={`flex flex-col items-center gap-1 transition ${
            activeNavTab === 'profile' ? 'text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <User className={`w-5 h-5 ${activeNavTab === 'profile' ? 'text-white fill-white' : ''}`} />
          <span className={`text-[10px] ${activeNavTab === 'profile' ? 'font-bold text-white' : 'font-medium'}`}>
            Profile
          </span>
        </button>
      </nav>

      {/* ========================================================= */}
      {/* MODAL 1: HELP CENTER */}
      {/* ========================================================= */}
      {isHelpCenterOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-slate-700 rounded-3xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <LifeBuoy className="w-5 h-5 text-rose-400" />
                <h3>Help Center</h3>
              </div>
              <button
                onClick={() => setIsHelpCenterOpen(false)}
                className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p className="text-slate-400">
                Jika kamu memerlukan bantuan atau dukungan lebih lanjut, silakan hubungi kontak bantuan di bawah ini:
              </p>

              <div className="p-4 bg-[#222] border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  <PhoneCall className="w-4 h-4 text-emerald-400" />
                  <span>Kontak Bantuan / Hotline</span>
                </div>
                <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Nomor Telepon:</span>
                  <span className="text-emerald-400 font-mono font-bold text-sm bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-800">
                    +62 812-3456-7890
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsHelpCenterOpen(false)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition"
            >
              Tutup Help Center
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: PANDUAN PENGGUNAAN SONA */}
      {/* ========================================================= */}
      {isEduModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-slate-700 rounded-3xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <Info className="w-5 h-5" />
                <h3>Panduan Penggunaan Sona</h3>
              </div>
              <button
                onClick={() => setIsEduModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="p-3.5 bg-indigo-950/40 border border-indigo-800/50 rounded-2xl space-y-1.5">
                <h4 className="font-bold text-indigo-300 flex items-center gap-2 text-xs">
                  <BarChart3 className="w-4 h-4 text-emerald-400" /> Pengelompokan 4 Emosi Berbasis Riset
                </h4>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Lagu-lagu di Sonamusic telah dikategorikan menjadi 4 jenis emosi utama yang didapatkan dari survei, yaitu: <strong>Senang</strong>, <strong>Tenang</strong>, <strong>Marah</strong>, dan <strong>Sedih/Cemas</strong>.
                </p>
              </div>

              <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-1.5">
                <h4 className="font-bold text-emerald-300 flex items-center gap-2 text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Keamanan &amp; Privasi Chat
                </h4>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Sonamusic memiliki etika privasi chat, dimana Developer tidak mengetahui nama dari masing-masing akun sehingga, keamanan dari chat terjamin.
                </p>
              </div>

              <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-1.5">
                <h4 className="font-bold text-sky-300 flex items-center gap-2 text-xs">
                  <HeartPulse className="w-4 h-4 text-sky-400" /> Batasan Musik &amp; Regulasi Mood
                </h4>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Musik dalam Sonamusic membantu pengguna dalam mengelola suasana hati (mood) harian mereka. Namun, untuk pemulihan masalah traumatis yang berat (seperti gejala depresi), pengguna disarankan menggunakan dukungan dari fitur Help Center.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsEduModalOpen(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition shadow"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
