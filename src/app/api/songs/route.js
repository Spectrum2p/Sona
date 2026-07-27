import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

export async function GET() {
  try {
    const songsRef = ref(db, 'songs');
    const snapshot = await get(songsRef);

    if (!snapshot.exists()) {
      return NextResponse.json({ success: true, songs: [] });
    }

    const songsData = snapshot.val();
    
    // Mapping & Sort dari song_0001 sampai song_1002
    const songsList = Object.keys(songsData)
      .map(key => {
        const song = songsData[key];
        return {
          id: song.id || key,
          no: song.no || parseInt(key.replace(/\D/g, '')) || 0,
          title: song.title || 'Tanpa Judul',
          artist: song.artist || 'Unknown Artist',
          audioUrl: song.audioUrl,
          coverUrl: song.coverUrl,
          duration: song.length || '0:00',
          genre: song.genre,
          emotionalCategory: song.emotionalCategory,
          valence: song.valence,
          energy: song.energy,
          bpm: song.bpm
        };
      })
      .sort((a, b) => a.no - b.no); // Urutkan numerik dari nomor 1

    return NextResponse.json({ success: true, songs: songsList });
  } catch (error) {
    console.error("❌ Error Fetching Songs:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}