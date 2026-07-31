'use client';
import { useState } from 'react';
import { useAudio } from '@/context/AudioContext';

export default function QueuePlaylistDrawer({ isOpen, onClose }) {
  const {
    currentSong,
    queue,
    removeFromQueue,
    clearQueue,
    customPlaylists,
    createCustomPlaylist,
    removeFromCustomPlaylist,
    deleteCustomPlaylist,
    setPlaylist,
    setCurrentSong,
    setIsPlaying
  } = useAudio();

  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'playlists'
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);

  if (!isOpen) return null;

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    await createCustomPlaylist(newPlaylistName, newPlaylistDesc);
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setShowCreateModal(false);
  };

  const handlePlayPlaylist = (playlistObj) => {
    if (!playlistObj.songs || playlistObj.songs.length === 0) return;
    setPlaylist(playlistObj.songs);
    setCurrentSong(playlistObj.songs[0]);
    setIsPlaying(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl relative">
        {/* Header Drawer */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('queue')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'queue'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              🎵 Antrean ({queue.length})
            </button>
            <button
              onClick={() => setActiveTab('playlists')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'playlists'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              🎶 Playlist Saya ({customPlaylists.length})
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-sm"
          >
            ✕
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: ANTREAN (QUEUE) */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              {/* Currently Playing */}
              {currentSong && (
                <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Sedang Diputar</span>
                  <div className="flex items-center gap-3">
                    {currentSong.coverUrl ? (
                      <img src={currentSong.coverUrl} alt="Cover" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold">🎵</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-white truncate">{currentSong.title}</p>
                      <p className="text-xs text-indigo-300/80 truncate">{currentSong.artist}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Queue List */}
              <div className="flex items-center justify-between pt-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Antrean Berikutnya</h3>
                {queue.length > 0 && (
                  <button
                    onClick={clearQueue}
                    className="text-[11px] text-red-400 hover:text-red-300 font-medium"
                  >
                    Bersihkan Antrean
                  </button>
                )}
              </div>

              {queue.length === 0 ? (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <p className="text-2xl">🎵</p>
                  <p className="text-xs">Antrean musik masih kosong.</p>
                  <p className="text-[11px] text-slate-600">Klik ikon `+ Antrean` pada daftar lagu untuk menambahkannya.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {queue.map((song, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-slate-500 font-mono text-[11px]">{idx + 1}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{song.title}</p>
                          <p className="text-[11px] text-slate-400 truncate">{song.artist}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => removeFromQueue(idx)}
                        className="text-slate-500 hover:text-red-400 p-1 text-sm transition"
                        title="Hapus dari antrean"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PLAYLIST SAYA */}
          {activeTab === 'playlists' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Daftar Playlist</h3>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition flex items-center gap-1"
                >
                  <span>+</span> Buat Playlist
                </button>
              </div>

              {customPlaylists.length === 0 ? (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <p className="text-2xl">🎶</p>
                  <p className="text-xs">Kamu belum membuat playlist.</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="text-xs text-indigo-400 font-semibold hover:underline"
                  >
                    Buat playlist pertama sekarang
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {customPlaylists.map((pl) => (
                    <div key={pl.id} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-white text-sm">{pl.name}</h4>
                          <p className="text-[11px] text-slate-400">{pl.songs?.length || 0} lagu</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePlayPlaylist(pl)}
                            disabled={!pl.songs || pl.songs.length === 0}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs rounded-xl font-medium transition"
                          >
                            ▶ Putar
                          </button>
                          <button
                            onClick={() => deleteCustomPlaylist(pl.id)}
                            className="p-1 text-slate-500 hover:text-red-400 text-xs"
                            title="Hapus Playlist"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* Song preview in playlist */}
                      {selectedPlaylist === pl.id ? (
                        <div className="pt-2 border-t border-slate-800/80 space-y-2">
                          {pl.songs && pl.songs.length > 0 ? (
                            pl.songs.map((s, sIdx) => (
                              <div key={sIdx} className="flex items-center justify-between text-xs text-slate-300 py-1">
                                <span className="truncate">{sIdx + 1}. {s.title}</span>
                                <button
                                  onClick={() => removeFromCustomPlaylist(pl.id, s.id || s.songId)}
                                  className="text-red-400 hover:text-red-300 text-[10px] ml-2"
                                >
                                  Hapus
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className="text-[11px] text-slate-500 italic">Belum ada lagu dalam playlist ini.</p>
                          )}
                          <button
                            onClick={() => setSelectedPlaylist(null)}
                            className="text-[11px] text-indigo-400 hover:underline block pt-1"
                          >
                            Tutup Detail
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedPlaylist(pl.id)}
                          className="text-[11px] text-slate-400 hover:text-indigo-300 block"
                        >
                          Lihat {pl.songs?.length || 0} lagu →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Buat Playlist Baru */}
        {showCreateModal && (
          <div className="absolute inset-0 bg-slate-950/90 z-20 flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
              <h3 className="font-bold text-white text-base">Buat Playlist Baru</h3>

              <form onSubmit={handleCreatePlaylist} className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-400 uppercase font-semibold mb-1">Nama Playlist</label>
                  <input
                    type="text"
                    required
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Contoh: Mood Boster Malam"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 uppercase font-semibold mb-1">Deskripsi (Opsional)</label>
                  <input
                    type="text"
                    value={newPlaylistDesc}
                    onChange={(e) => setNewPlaylistDesc(e.target.value)}
                    placeholder="Contoh: Kumpulan lagu rileks penurun cemas"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-medium hover:bg-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-500 shadow-md shadow-indigo-600/30"
                  >
                    Buat
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
