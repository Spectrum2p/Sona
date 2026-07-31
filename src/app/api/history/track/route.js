import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get, set, push } from 'firebase/database';

export async function POST(request) {
  try {
    const { userId, songData } = await request.json();
    // songData berisi: { songId, title, artist, emotionalCategory, genre, valence, energy, bpm }

    if (!userId || !songData?.songId) {
      return NextResponse.json({ success: false, error: "Data subjek/lagu tidak lengkap" }, { status: 400 });
    }

    const timestamp = new Date().toISOString();

    // 1. Simpan ke History Songs & Play History (sinkron per userId)
    const payload = {
      ...songData,
      playedAt: timestamp,
      timestamp
    };

    const songsHistoryRef = ref(db, `users/${userId}/history_songs`);
    const playHistoryRef = ref(db, `users/${userId}/play_history`);
    
    await set(push(songsHistoryRef), payload);
    await set(push(playHistoryRef), payload);

    // 2. Ambil 5 lagu terakhir untuk evaluasi trigger
    const snapshot = await get(songsHistoryRef);
    let allPlayed = [];
    if (snapshot.exists()) {
      const data = snapshot.val();
      allPlayed = Object.values(data);
    }

    const last5Songs = allPlayed.slice(-5);
    let triggerAI = false;
    let isSpecialCondition = false;
    let detectedMood = null;

    if (last5Songs.length === 5) {
      const firstEmotion = last5Songs[0].emotionalCategory;
      const firstId = last5Songs[0].songId;

      const allSameEmotion = last5Songs.every(s => s.emotionalCategory === firstEmotion);
      const allSameSong = last5Songs.every(s => s.songId === firstId);

      if (allSameSong) {
        triggerAI = true;
        isSpecialCondition = true;
        detectedMood = firstEmotion;
      } else if (allSameEmotion) {
        triggerAI = true;
        detectedMood = firstEmotion;
      }
    }

    // 3. Simpan ke Real-time Mood Trigger jika terdeteksi
    if (triggerAI) {
      const consecutiveMoodRef = ref(db, `users/${userId}/history_mood/consecutive_moods`);
      const newMoodRef = push(consecutiveMoodRef);
      await set(newMoodRef, {
        detectedMood,
        triggerType: isSpecialCondition ? 'repeat_5x' : '5_consecutive_songs',
        detectedAt: timestamp
      });
    }

    return NextResponse.json({
      success: true,
      triggerAI,
      isSpecialCondition,
      detectedMood,
      preferredGenre: songData.genre
    });

  } catch (error) {
    console.error("❌ Error Tracking Route:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}