'use client';
import { useRef, useEffect, useState } from 'react';
import { useAudio } from '@/context/AudioContext';
import { db, auth } from '@/lib/firebase';
import { ref, push } from 'firebase/database';
import QueuePlaylistDrawer from '@/components/QueuePlaylistDrawer';

export default function MusicPlayer() {
  const {
    currentSong,
    isPlaying,
    setIsPlaying,
    hasPlayerStarted,
    repeatMode,
    setRepeatMode,
    toggleRepeatMode,
    isShuffle,
    toggleShuffle,
    playNextSong,
    playPreviousSong,
    handleSongEnd,
    queue,
    toggleFavorite,
    isFavorite
  } = useAudio();

  const audioRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // Modal / Fullscreen PWA player view

  const favorited = isFavorite(currentSong);

  // 📝 Fungsi mencatat pemutaran lagu ke Firebase (Play History & History Songs)
  const logPlayHistory = async (song) => {
    if (!song) return;
    const user = auth?.currentUser;
    const userId = user ? user.uid : (typeof window !== 'undefined' ? localStorage.getItem('sona_user_id') || 'user_001' : 'user_001');

    try {
      const historyRef = ref(db, `users/${userId}/play_history`);
      const payload = {
        songId: song.id || song.songId || song.title,
        title: song.title,
        artist: song.artist || 'Unknown',
        genre: song.genre || 'Pop',
        emotionalCategory: song.emotionalCategory || 'tenang',
        valence: song.valence || 0.5,
        energy: song.energy || 50,
        bpm: song.bpm || 100,
        timestamp: new Date().toISOString()
      };

      await push(historyRef, payload);

      // Duplikat ke history_songs untuk konsistensi query backend
      const songsHistoryRef = ref(db, `users/${userId}/history_songs`);
      await push(songsHistoryRef, { ...payload, playedAt: payload.timestamp });
    } catch (error) {
      console.warn("⚠️ Gagal mencatat history pemutaran:", error.message);
    }
  };

  // 🤖 Fungsi Pemicu Intervensi Sona AI
  const triggerAiIntervention = async () => {
    const user = auth?.currentUser;
    const userId = user ? user.uid : 'guest';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          isAutoInitiated: true // Memberitahu backend bahwa ini pemanggilan otomatis dari player
        })
      });

      const data = await res.json();
      
      // Jika AI mendeteksi kondisi khusus (seperti repeat 5x), kirim event ke frontend
      if (data.isSpecialCondition && data.sapaanAI) {
        window.dispatchEvent(new CustomEvent('sona_auto_chat', { detail: data }));
      }
    } catch (err) {
      console.warn("⚠️ Gagal memicu intervensi Sona AI:", err);
    }
  };

  // Sync Status Audio Play/Pause
  useEffect(() => {
    if (!audioRef.current || !currentSong) return;

    if (isPlaying) {
      audioRef.current.play().then(() => {
        logPlayHistory(currentSong);
      }).catch(err => console.log("Audio play restriction:", err));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentSong]);

  const togglePlay = () => {
    if (!currentSong) return;
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  // 🎯 Logika Penanganan Lagu Selesai
  const onAudioEnded = async () => {
    if (repeatMode === 'once') {
      // Repeat 1x: Mengulangi lagu 1 kali lagi, lalu kembalikan mode repeat ke 'off' (auto-off saat lagu berputar lagi)
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(err => console.warn("Audio play error:", err));
        setRepeatMode('off');
        await logPlayHistory(currentSong);
        if (handleSongEnd) {
          handleSongEnd(currentSong);
        }
      }
    } else if (repeatMode === 'one') {
      // Repeat 1 Lagu: Mengulangi lagu ini terus-menerus
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(err => console.warn("Audio play error:", err));
        await logPlayHistory(currentSong);
        if (handleSongEnd) {
          handleSongEnd(currentSong);
        }
      }
    } else if (repeatMode === 'all') {
      if (handleSongEnd) {
        await handleSongEnd(currentSong);
      } else {
        playNextSong();
      }
    } else {
      if (handleSongEnd) {
        await handleSongEnd(currentSong);
      } else {
        playNextSong();
      }
    }
  };

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setProgress(newTime);
    }
  };

  const rewind10 = () => {
    if (audioRef.current) {
      const target = Math.max(0, audioRef.current.currentTime - 10);
      audioRef.current.currentTime = target;
      setProgress(target);
    }
  };

  const forward10 = () => {
    if (audioRef.current) {
      const target = Math.min(duration || 0, audioRef.current.currentTime + 10);
      audioRef.current.currentTime = target;
      setProgress(target);
    }
  };

  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '00:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // 📻 Chrome & System Native Media Session API Integration (System Notification / Lockscreen Player)
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !currentSong) return;

    try {
      const favoritedIcon = favorited ? ' ❤️' : '';
      const shuffleStatus = isShuffle ? ' [🔀 Smart Shuffle]' : ' [🔀 Shuffle Biasa]';
      const repeatStatus = repeatMode === 'one' ? ' [🔁 Repeat 1]' : repeatMode === 'all' ? ' [🔁 Repeat All]' : '';

      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${currentSong.title || 'Lagu Sona'}${favoritedIcon}`,
        artist: currentSong.artist || 'Sona Music',
        album: `${currentSong.genre || currentSong.emotionalCategory || 'Sona Research'}${repeatStatus}${shuffleStatus}`,
        artwork: [
          { src: currentSong.coverUrl || '/icon-192.png', sizes: '96x96', type: 'image/jpeg' },
          { src: currentSong.coverUrl || '/icon-192.png', sizes: '128x128', type: 'image/jpeg' },
          { src: currentSong.coverUrl || '/icon-192.png', sizes: '192x192', type: 'image/jpeg' },
          { src: currentSong.coverUrl || '/icon-192.png', sizes: '512x512', type: 'image/jpeg' },
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => {
        setIsPlaying(true);
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        setIsPlaying(false);
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        playPreviousSong();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        playNextSong();
      });

      // Repeat & Shuffle Action Handlers for Chrome / OS Media Control
      const extraActions = [
        { name: 'toggleshuffle', fn: () => toggleShuffle() },
        { name: 'shuffle', fn: () => toggleShuffle() },
        { name: 'togglerepeat', fn: () => toggleRepeatMode() },
        { name: 'repeat', fn: () => toggleRepeatMode() }
      ];

      extraActions.forEach(({ name, fn }) => {
        try {
          navigator.mediaSession.setActionHandler(name, fn);
        } catch (err) {}
      });

      try {
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          const skipTime = details.seekOffset || 10;
          if (audioRef.current) {
            const target = Math.max(0, audioRef.current.currentTime - skipTime);
            audioRef.current.currentTime = target;
            setProgress(target);
          }
        });
      } catch (err) {}

      try {
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          const skipTime = details.seekOffset || 10;
          if (audioRef.current) {
            const target = Math.min(duration || 0, audioRef.current.currentTime + skipTime);
            audioRef.current.currentTime = target;
            setProgress(target);
          }
        });
      } catch (err) {}

      try {
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined && audioRef.current) {
            audioRef.current.currentTime = details.seekTime;
            setProgress(details.seekTime);
          }
        });
      } catch (err) {
        // seekto optional support
      }
    } catch (e) {
      console.warn("MediaSession setup warning:", e);
    }
  }, [currentSong, setIsPlaying, playNextSong, playPreviousSong, favorited, isShuffle, repeatMode, duration, toggleShuffle, toggleRepeatMode]);

  // Sync Media Session Playback State
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch (e) {}
  }, [isPlaying]);

  // Sync Media Session Position State
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !duration || isNaN(duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: duration || 0,
        playbackRate: 1,
        position: Math.min(progress || 0, duration || 0),
      });
    } catch (e) {}
  }, [duration, progress]);

  if (!currentSong || !hasPlayerStarted) return null;

  return (
    <>
      <audio
        ref={audioRef}
        src={currentSong.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={onAudioEnded}
      />

      {/* 📱 EXPANDED FULLSCREEN PWA MEDIA PLAYER (Hides bottom nav completely) */}
      {isExpanded && (
        <div className="fixed inset-0 z-[100] bg-[#121620] text-white flex flex-col justify-between p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-5 duration-200 overflow-y-auto">
          {/* Top Bar Navigation */}
          <div className="flex items-center justify-between mb-2 sm:mb-4">
            <button
              onClick={() => setIsExpanded(false)}
              className="w-10 h-10 rounded-full bg-slate-800/60 hover:bg-slate-700/80 flex items-center justify-center text-slate-200 transition active:scale-95"
              title="Tutup / Minimize Player"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <span className="text-lg font-semibold tracking-wide text-slate-200">Media player</span>

            <button
              onClick={() => setIsDrawerOpen(true)}
              className="w-10 h-10 rounded-full bg-slate-800/60 hover:bg-slate-700/80 flex items-center justify-center text-slate-200 transition active:scale-95"
              title="Buka Antrean & Playlist"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="5" y="2" width="14" height="20" rx="2" strokeWidth="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Album Cover Art */}
          <div className="flex-1 flex items-center justify-center my-3 sm:my-6 px-2">
            <div className="relative w-full max-w-xs sm:max-w-sm aspect-square rounded-2xl overflow-hidden shadow-2xl border border-slate-700/50 group">
              {currentSong.coverUrl ? (
                <img
                  src={currentSong.coverUrl}
                  alt={currentSong.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-600/40 via-purple-700/30 to-slate-900 flex items-center justify-center">
                  <span className="text-6xl">🎵</span>
                </div>
              )}
              {/* Sona Branding Badge on Cover */}
              <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Sona Player</span>
              </div>
            </div>
          </div>

          {/* Song Metadata */}
          <div className="max-w-md mx-auto w-full text-left mb-4 sm:mb-6 px-1">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-snug line-clamp-2">
              {currentSong.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-400 font-medium mt-1 line-clamp-1">
              {currentSong.artist || 'Unknown Artist'}
            </p>
          </div>

          {/* Progress Seekbar */}
          <div className="max-w-md mx-auto w-full mb-6 sm:mb-8 px-1">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={progress}
              onChange={handleSeek}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition"
            />
            <div className="flex justify-between items-center text-xs sm:text-sm font-mono text-slate-400 mt-2 font-medium">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls Bar Row:
              [ (+) ]   [ 🔀 ]   [ ⏮ ]   [ ▶/⏸ ]   [ ⏭ ]   [ 🔁 ]
          */}
          <div className="max-w-md mx-auto w-full flex items-center justify-between px-1 pb-4 sm:pb-6">
            {/* 1. Add to Favorite (+) Button */}
            <button
              onClick={() => toggleFavorite(currentSong)}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition active:scale-90 border ${
                favorited
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-700 hover:text-white'
              }`}
              title={favorited ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}
            >
              {favorited ? (
                <svg className="w-5 h-5 fill-current text-emerald-400" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 5v14m7-7H5" />
                </svg>
              )}
            </button>

            {/* 2. Shuffle Button with Green Dot indicator when active */}
            <button
              onClick={toggleShuffle}
              className={`relative flex flex-col items-center justify-center w-10 h-10 transition active:scale-90 ${
                isShuffle ? 'text-emerald-400' : 'text-slate-400 hover:text-white'
              }`}
              title={isShuffle ? 'Acak Lagu (Aktif)' : 'Acak Lagu (Non-aktif)'}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M16 3h5v5M4 20l5-5M21 3l-7.5 7.5M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
              {isShuffle && (
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mt-1 animate-pulse"></span>
              )}
            </button>

            {/* 3. Previous Song Button */}
            <button
              onClick={playPreviousSong}
              className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-white transition active:scale-90"
              title="Lagu Sebelumnya"
            >
              <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* 4. Play / Pause Button (Circle Button) */}
            <button
              onClick={togglePlay}
              className="w-14 h-14 rounded-full bg-slate-200 hover:bg-white text-slate-900 flex items-center justify-center transition shadow-2xl hover:scale-105 active:scale-95"
              title={isPlaying ? 'Jeda' : 'Putar'}
            >
              {isPlaying ? (
                <svg className="w-7 h-7 fill-current text-slate-900" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-7 h-7 fill-current text-slate-900 ml-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* 5. Next Song Button */}
            <button
              onClick={playNextSong}
              className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-white transition active:scale-90"
              title="Lagu Berikutnya"
            >
              <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            {/* 6. Repeat Button */}
            <button
              onClick={toggleRepeatMode}
              className={`relative flex flex-col items-center justify-center w-10 h-10 transition active:scale-90 ${
                repeatMode !== 'off' ? 'text-emerald-400' : 'text-slate-400 hover:text-white'
              }`}
              title={
                repeatMode === 'once'
                  ? 'Repeat 1x (Auto-off setelah 1x putar)'
                  : repeatMode === 'one'
                  ? 'Repeat On (Terus-menerus)'
                  : 'Repeat Off'
              }
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M17 2l4 4-4 4M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 01-4 4H3" />
                {repeatMode === 'once' && (
                  <>
                    {/* Background cutout layer to break top line of loop */}
                    <text
                      x="13"
                      y="6"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="10.5"
                      fontWeight="900"
                      fill="none"
                      stroke="#090d16"
                      strokeWidth="3.5"
                    >
                      1
                    </text>
                    {/* Foreground green number 1 */}
                    <text
                      x="13"
                      y="6"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="10.5"
                      fontWeight="900"
                      fill="currentColor"
                      stroke="none"
                    >
                      1
                    </text>
                  </>
                )}
              </svg>
              {repeatMode !== 'off' && (
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mt-0.5"></span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 🎵 COMPACT FLOATING MINI MUSIC PLAYER BAR */}
      <div className="fixed bottom-16 left-0 right-0 h-16 bg-[#0d121d]/95 backdrop-blur-md border-t border-slate-800/80 px-3 sm:px-5 flex items-center justify-between z-40 shadow-2xl">
        {/* Top Progress Highlight Line */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-800">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${(progress / (duration || 1)) * 100}%` }}
          />
        </div>

        {/* Info Lagu + Cover Image (Clickable to Expand Full Player) */}
        <div 
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2.5 w-2/5 sm:w-1/4 min-w-0 cursor-pointer group hover:opacity-90 transition"
          title="Buka Layar Penuh Player"
        >
          {currentSong.coverUrl ? (
            <img
              src={currentSong.coverUrl}
              alt={currentSong.title}
              className="w-10 h-10 rounded-lg object-cover border border-slate-700/80 flex-shrink-0 group-hover:scale-105 transition"
            />
          ) : (
            <div className="w-10 h-10 bg-indigo-600/30 rounded-lg flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/20 flex-shrink-0">
              🎵
            </div>
          )}
          <div className="truncate min-w-0">
            <h4 className="text-xs font-semibold text-white truncate leading-tight">
              {currentSong.title}
            </h4>
            <p className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">{currentSong.artist}</p>
          </div>
        </div>

        {/* Control Buttons Row in Mini Player: [ + ] [ 🔀 ] [ ⏮ ] [ ▶/⏸ ] [ ⏭ ] [ 🔁 ] */}
        <div className="flex items-center justify-center gap-2.5 sm:gap-5 md:gap-6">
          {/* ➕ Favorite Button */}
          <button
            onClick={() => toggleFavorite(currentSong)}
            className={`w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center transition active:scale-90 ${
              favorited ? 'text-emerald-400' : 'text-slate-400 hover:text-white'
            }`}
            title={favorited ? 'Hapus Favorit' : 'Tambah Favorit'}
          >
            {favorited ? (
              <svg className="w-4 h-4 md:w-5 md:h-5 fill-current text-emerald-400" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 5v14m7-7H5" />
              </svg>
            )}
          </button>

          {/* 🔀 Shuffle */}
          <button
            onClick={toggleShuffle}
            className={`hidden sm:flex relative items-center justify-center w-8 h-8 md:w-9 md:h-9 transition active:scale-90 ${
              isShuffle ? 'text-emerald-400' : 'text-slate-400 hover:text-white'
            }`}
            title={isShuffle ? 'Acak Lagu (On)' : 'Acak Lagu (Off)'}
          >
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 3h5v5M4 20l5-5M21 3l-7.5 7.5M21 16v5h-5M15 15l6 6M4 4l5 5" />
            </svg>
            {isShuffle && <span className="w-1 h-1 bg-emerald-400 rounded-full absolute -bottom-1"></span>}
          </button>

          {/* ⏮ Previous */}
          <button
            onClick={playPreviousSong}
            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center text-slate-300 hover:text-white transition active:scale-90"
            title="Lagu Sebelumnya"
          >
            <svg className="w-5 h-5 md:w-6 md:h-6 fill-current" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>
          
          {/* ▶/⏸ Play Pause Button */}
          <button
            onClick={togglePlay}
            className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full bg-slate-200 hover:bg-white flex items-center justify-center text-slate-900 transition shadow-md hover:scale-105 active:scale-95 flex-shrink-0"
            title={isPlaying ? 'Jeda' : 'Putar'}
          >
            {isPlaying ? (
              <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current text-slate-900" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current text-slate-900 ml-0.5" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          
          {/* ⏭ Next */}
          <button
            onClick={playNextSong}
            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center text-slate-300 hover:text-white transition active:scale-90"
            title="Lagu Berikutnya"
          >
            <svg className="w-5 h-5 md:w-6 md:h-6 fill-current" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          {/* 🔁 Repeat */}
          <button
            onClick={toggleRepeatMode}
            className={`hidden sm:flex relative flex-col items-center justify-center w-8 h-8 md:w-9 md:h-9 transition active:scale-90 ${
              repeatMode !== 'off' ? 'text-emerald-400' : 'text-slate-400 hover:text-white'
            }`}
            title={
              repeatMode === 'once'
                ? 'Repeat 1x (Auto-off setelah 1x putar)'
                : repeatMode === 'one'
                ? 'Repeat On (Terus-menerus)'
                : 'Repeat Off'
            }
          >
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 2l4 4-4 4M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 01-4 4H3" />
              {repeatMode === 'once' && (
                <>
                  {/* Background cutout layer to break top line of loop */}
                  <text
                    x="13"
                    y="6"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="10.5"
                    fontWeight="900"
                    fill="none"
                    stroke="#090d16"
                    strokeWidth="3.5"
                  >
                    1
                  </text>
                  {/* Foreground green number 1 */}
                  <text
                    x="13"
                    y="6"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="10.5"
                    fontWeight="900"
                    fill="currentColor"
                    stroke="none"
                  >
                    1
                  </text>
                </>
              )}
            </svg>
            {repeatMode !== 'off' && (
              <span className="w-1 h-1 bg-emerald-400 rounded-full mt-0.5"></span>
            )}
          </button>
        </div>

        {/* Action Buttons: Expand & Drawer Antrean */}
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => setIsExpanded(true)}
            className="w-8 h-8 text-slate-400 hover:text-white transition flex items-center justify-center text-sm"
            title="Layar Penuh Media Player"
          >
            ⛶
          </button>

          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-1.5 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs relative"
            title="Buka Antrean"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            {queue.length > 0 && (
              <span className="bg-emerald-500 text-black text-[9px] font-extrabold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {queue.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <QueuePlaylistDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}

