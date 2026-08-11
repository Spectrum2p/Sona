import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get, set, push, update } from 'firebase/database';

export async function POST(request) {
  try {
    const { action, userId, sessionId, songsPlayedInSession } = await request.json();
    const timestamp = new Date().toISOString();

    if (action === 'START') {
      const newSessionId = `sess_${Date.now()}`;
      const sessionRef = ref(db, `users/${userId}/history_sessions/${newSessionId}`);
      
      await set(sessionRef, {
        sessionId: newSessionId,
        startTime: timestamp,
        endTime: null,
        durationMinutes: 0
      });

      return NextResponse.json({ success: true, sessionId: newSessionId });
    }

    if (action === 'END' && sessionId) {
      const sessionRef = ref(db, `users/${userId}/history_sessions/${sessionId}`);
      const snapshot = await get(sessionRef);

      if (!snapshot.exists()) {
        return NextResponse.json({ success: false, error: "Sesi tidak ditemukan" }, { status: 404 });
      }

      const sessionData = snapshot.val();
      const startTime = new Date(sessionData.startTime);
      const endTime = new Date(timestamp);
      const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

      // Update Sesi Aktif
      await update(sessionRef, {
        endTime: timestamp,
        durationMinutes
      });

      // Hitung MODUS Emosi dari lagu yang diputar selama sesi ini
      let dominantMood = 'unknown';
      if (songsPlayedInSession && songsPlayedInSession.length > 0) {
        const moodCounts = {};
        songsPlayedInSession.forEach(song => {
          const em = song.emotionalCategory;
          moodCounts[em] = (moodCounts[em] || 0) + 1;
        });

        // Cari frekuensi tertinggi (Modus)
        dominantMood = Object.keys(moodCounts).reduce((a, b) => 
          moodCounts[a] > moodCounts[b] ? a : b
        );

        // Simpan Modus Sesi ke Database
        const sessionModeRef = ref(db, `users/${userId}/history_mood/session_modes`);
        const newModeRef = push(sessionModeRef);
        await set(newModeRef, {
          sessionId,
          dominantMood,
          totalSongsPlayed: songsPlayedInSession.length,
          calculatedAt: timestamp
        });
      }

      return NextResponse.json({ 
        success: true, 
        durationMinutes, 
        dominantMood 
      });
    }

    return NextResponse.json({ success: false, error: "Action tidak valid" }, { status: 400 });

  } catch (error) {
    console.error("❌ Error Session Route:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
