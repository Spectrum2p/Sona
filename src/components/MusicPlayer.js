'use client';
import { useRef, useEffect, useState } from 'react';
import { useAudio } from '@/context/AudioContext';
import { db, auth } from '@/lib/firebase';
import { ref, push } from 'firebase/database';

export default function MusicPlayer() {
  const { currentSong, isPlaying, setIsPlaying, playNextSong, playPreviousSong, handleSongEnd } = useAudio();
  const audioRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  
  // 🔁 State Mode Repeat: 'off' | 'one' | 'all'
  const [repeatMode, setRepeatMode] = useState('off');

  // 📝 Fungsi mencatat pemutaran lagu ke Firebase (Play History)
  const logPlayHistory = async (song) => {
    if (!song) return;
    const user = auth?.currentUser;
    const userId = user ? user.uid : 'guest';

    try {
      const historyRef = ref(db, `users/${userId}/play_history`);
      await push(historyRef, {
        songId: song.id || song.title,
        title: song.title,
        artist: song.artist || 'Unknown',
        genre: song.genre || 'pop',
        emotionalCategory: song.emotionalCategory || 'tenang',
        timestamp: new Date().toISOString()
      });
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
        // Catat ke history tiap kali lagu baru diputar
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

  // Toggle Mode Repeat: OFF -> ONE (Repeat 1 Lagu) -> ALL (Repeat Playlist) -> OFF
  const toggleRepeatMode = () => {
    if (repeatMode === 'off') setRepeatMode('one');
    else if (repeatMode === 'one') setRepeatMode('all');
    else setRepeatMode('off');
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  // 🎯 Logika Penanganan Lagu Selesai
  const onAudioEnded = async () => {
    if (repeatMode === 'one') {
      // Repeat 1 Lagu: Putar ulang lagu yang sama dari detik ke-0
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
        
        // 1. Catat pemutaran berulang ke Firebase
        await logPlayHistory(currentSong);
        
        // 2. Minta Sona AI untuk mengecek apakah sudah saatnya menyapa pengguna
        triggerAiIntervention();
      }
    } else if (repeatMode === 'all') {
      // Repeat All
      playNextSong();
    } else {
      // Normal / Off
      if (handleSongEnd) {
        handleSongEnd(currentSong);
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

  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!currentSong) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-between z-50 shadow-2xl">
      <audio
        ref={audioRef}
        src={currentSong.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={onAudioEnded}
      />

      {/* Info Lagu + Cover Image */}
      <div className="flex items-center gap-4 w-1/4">
        {currentSong.coverUrl ? (
          <img
            src={currentSong.coverUrl}
            alt={currentSong.title}
            className="w-12 h-12 rounded-xl object-cover border border-slate-700"
          />
        ) : (
          <div className="w-12 h-12 bg-indigo-600/30 rounded-xl flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/20">
            🎵
          </div>
        )}
        <div className="truncate">
          <h4 className="text-sm font-semibold text-white truncate">{currentSong.title}</h4>
          <p className="text-xs text-slate-400 truncate">{currentSong.artist}</p>
        </div>
      </div>

      {/* Control Navigation & Seek Bar */}
      <div className="flex flex-col items-center gap-2 w-2/4 max-w-lg">
        <div className="flex items-center gap-6">
          <button onClick={playPreviousSong} className="text-slate-400 hover:text-white transition text-sm">
            ⏮
          </button>
          
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white text-lg transition shadow-lg shadow-indigo-600/40"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          
          <button onClick={playNextSong} className="text-slate-400 hover:text-white transition text-sm">
            ⏭
          </button>

          {/* 🔁 Tombol Repeat */}
          <button
            onClick={toggleRepeatMode}
            className={`relative transition text-base flex items-center justify-center p-1.5 rounded-lg ${
              repeatMode !== 'off' 
                ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/30' 
                : 'text-slate-400 hover:text-white'
            }`}
            title={
              repeatMode === 'one' 
                ? 'Repeat Current Song' 
                : repeatMode === 'all' 
                ? 'Repeat All Songs' 
                : 'Repeat Off'
            }
          >
            🔁
            {repeatMode === 'one' && (
              <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                1
              </span>
            )}
            {repeatMode === 'all' && (
              <span className="absolute -bottom-0.5 right-0.5 w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
            )}
          </button>
        </div>

        <div className="w-full flex items-center gap-3 text-xs text-slate-400">
          <span>{formatTime(progress)}</span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={progress}
            onChange={handleSeek}
            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Pengatur Volume */}
      <div className="flex items-center gap-2 w-1/4 justify-end">
        <span className="text-xs text-slate-400">🔊</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={handleVolumeChange}
          className="w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
      </div>
    </div>
  );
}