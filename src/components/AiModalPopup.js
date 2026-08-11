'use client';
import { useAudio } from '@/context/AudioContext';

export default function AiModalPopup() {
  const { aiNotification, dismissNotification, setPlaylist } = useAudio();

  if (!aiNotification) return null;

  const handleApplyPlaylist = () => {
    if (aiNotification.playlist) {
      setPlaylist(aiNotification.playlist);
    }
    dismissNotification();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        {/* Header Pop-up */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <div>
              <h3 className="font-semibold text-lg text-indigo-400">Pesan dari Sona AI</h3>
              {aiNotification.isSpecialCondition && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium inline-block mt-0.5">
                  ⚠️ Kondisi Khusus: Pemutaran Berulang 5x
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={dismissNotification}
            className="text-slate-400 hover:text-white text-lg font-bold"
          >
            ✕
          </button>
        </div>

        {/* Isi Sapaan Personal AI */}
        <div className="text-slate-200 text-sm leading-relaxed bg-slate-800/50 p-4 rounded-xl border border-slate-800">
          {aiNotification.sapaan}
        </div>

        {/* Landasan Ilmiah Singkat */}
        {aiNotification.analisis && (
          <div className="text-xs text-slate-400 italic">
            💡 {aiNotification.analisis}
          </div>
        )}

        {/* Aksi / Tombol Terima Rekomendasi Musik */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={dismissNotification}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl"
          >
            Nanti Saja
          </button>
          <button
            onClick={handleApplyPlaylist}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl"
          >
            Putar Playlist Rekomendasi
          </button>
        </div>
      </div>
    </div>
  );
}
