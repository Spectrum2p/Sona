import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { db } from '@/lib/firebase';
import { ref, get, set, push } from 'firebase/database';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "API_KEY_KAMU" });

export async function POST(request) {
  try {
    const { userId, detectedEmotion, preferredGenre, userMessage, isAutoInitiated } = await request.json();

    // 1. Ambil Profil, History Chat, dan History Pemutaran Lagu dari Firebase
    const userRef = ref(db, `users/${userId || 'guest'}`);
    const userSnapshot = await get(userRef);
    const userData = userSnapshot.exists() ? userSnapshot.val() : {};

    const profile = userData.profile || { fullName: "Teman", gender: "Umum" };
    
    // 💬 Ambil 6 riwayat chat terakhir
    const chatHistoryRaw = userData.history_chat ? Object.values(userData.history_chat).slice(-6) : [];
    
    // 🎵 Ambil riwayat pemutaran lagu pengguna
    const playHistoryRaw = userData.play_history ? Object.values(userData.play_history) : [];
    const recent5Plays = playHistoryRaw.slice(-5);
    const recentPlayedIds = new Set(recent5Plays.map(h => h.songId || h.id));

    // 🎯 2. FITUR DETEKSI REPEAT BERLEBIHAN (SPECIAL CONDITION)
    let isSpecialCondition = false;
    let repeatedSong = null;

    if (recent5Plays.length >= 5) {
      const firstId = recent5Plays[0].songId || recent5Plays[0].id;
      // Cek apakah 5 pemutaran terakhir adalah lagu yang persis sama
      const isRepeated5Times = recent5Plays.every(item => (item.songId || item.id) === firstId);
      
      if (isRepeated5Times) {
        isSpecialCondition = true;
        repeatedSong = recent5Plays[0];
      }
    }

    // 3. Tarik Seluruh Database Lagu & Hitung Skor Preferensi
    const songsRef = ref(db, 'songs');
    const songsSnapshot = await get(songsRef);
    let allSongs = [];
    if (songsSnapshot.exists()) {
      const songsData = songsSnapshot.val();
      allSongs = Object.keys(songsData).map(key => ({
        id: key,
        ...songsData[key]
      }));
    }

    // Analisis Preferensi Genre & Artis dari Play History
    const genreFrequency = {};
    const artistFrequency = {};
    playHistoryRaw.forEach(item => {
      if (item.genre) genreFrequency[item.genre.toLowerCase().trim()] = (genreFrequency[item.genre.toLowerCase().trim()] || 0) + 1;
      if (item.artist) artistFrequency[item.artist.toLowerCase().trim()] = (artistFrequency[item.artist.toLowerCase().trim()] || 0) + 1;
    });

    allSongs = allSongs.map(song => {
      let score = 0;
      const g = song.genre?.toLowerCase().trim();
      const a = song.artist?.toLowerCase().trim();
      if (g && genreFrequency[g]) score += genreFrequency[g] * 2;
      if (a && artistFrequency[a]) score += artistFrequency[a] * 3;
      if (preferredGenre && g === preferredGenre.toLowerCase().trim()) score += 5;
      return { ...song, preferenceScore: score };
    });

    // 4. Deteksi Emosi Otomatis dari Chat (Fallback jika frontend tidak mengoper detectedEmotion)
    let emosiUser = (detectedEmotion || '').toLowerCase().trim();
    if (!emosiUser && userMessage) {
      const msg = userMessage.toLowerCase();
      if (msg.includes('marah') || msg.includes('kesal') || msg.includes('benci') || msg.includes('jengkel')) emosiUser = 'marah';
      else if (msg.includes('takut') || msg.includes('cemas') || msg.includes('panik') || msg.includes('stres')) emosiUser = 'cemas';
      else if (msg.includes('senang') || msg.includes('bahagia') || msg.includes('happy')) emosiUser = 'senang';
      else if (msg.includes('sedih') || msg.includes('galau') || msg.includes('nangis')) emosiUser = 'sedih';
      else emosiUser = 'sedih';
    } else if (!emosiUser) {
      emosiUser = 'sedih'; // Default fallback jika belum ada emosi terdeteksi
    }

    const matchEmotion = (songCategory, target) => {
      if (!songCategory) return false;
      const cat = songCategory.toLowerCase();
      if (target === 'sedih') return cat === 'sedih' || cat === 'sad';
      if (target === 'senang') return cat === 'senang' || cat === 'happy';
      if (target === 'tenang') return cat === 'tenang' || cat === 'relaxed';
      if (target === 'marah') return cat === 'marah' || cat === 'angry';
      if (target === 'cemas') return cat === 'cemas' || cat === 'fear';
      return cat === target;
    };

    const sortPersonalized = (songList, isAscendingValence = true) => {
      return songList.sort((a, b) => {
        const aPlayed = recentPlayedIds.has(a.id) ? -10 : 0;
        const bPlayed = recentPlayedIds.has(b.id) ? -10 : 0;
        const scoreA = a.preferenceScore + aPlayed;
        const scoreB = b.preferenceScore + bPlayed;

        if (Math.abs(scoreA - scoreB) > 2) return scoreB - scoreA;

        const valA = a.valence || 0;
        const valB = b.valence || 0;
        return isAscendingValence ? valA - valB : valB - valA;
      });
    };

    // 🎯 5. PENYUSUNAN GRADASI REKOMENDASI LAGU DENGAN FILTER REPEAT & EMOSI
    let playlistRekomendasi = [];

    if (isSpecialCondition && repeatedSong) {
      const targetEmosiLagu = (repeatedSong.emotionalCategory || '').toLowerCase();
      const isHighEnergyOrAngry = targetEmosiLagu.includes('marah') || targetEmosiLagu.includes('angry') || (repeatedSong.energy || 0) >= 0.75;

      if (isHighEnergyOrAngry) {
        // Intervensi Repeat Lagu Angry/High-Energy: De-eskalasi energi bertahap
        const transisiSedang = sortPersonalized(allSongs.filter(s => (s.energy || 0) >= 0.4 && (s.energy || 0) <= 0.6), false);
        const penenang = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'tenang')), true);
        const bahagia = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'senang')), false);

        playlistRekomendasi = [
          ...transisiSedang.slice(0, 2),
          ...penenang.slice(0, 4),
          ...bahagia.slice(0, 4)
        ];
      } else if (targetEmosiLagu.includes('sad') || targetEmosiLagu.includes('sedih')) {
        // Intervensi Repeat Lagu Sedih: Memutus siklus rumination
        const penenang = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'tenang')), true);
        const bahagia = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'senang')), false);

        playlistRekomendasi = [
          ...penenang.slice(0, 5),
          ...bahagia.slice(0, 5)
        ];
      } else {
        // Repeat Lagu Umum/Upbeat Berlebihan
        const penenang = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'tenang')), false);
        const bahagia = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'senang')), false);

        playlistRekomendasi = [
          ...penenang.slice(0, 5),
          ...bahagia.slice(0, 5)
        ];
      }

    } else if (emosiUser === 'sedih') {
      const laguSedih = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'sedih')), true);
      const laguPenenang = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'tenang')), true);
      const laguBahagia = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'senang')), false);

      playlistRekomendasi = [
        ...laguSedih.slice(0, 3),
        ...laguPenenang.slice(0, 4),
        ...laguBahagia.slice(0, 3)
      ];

    } else if (['marah', 'takut', 'cemas'].includes(emosiUser)) {
      const laguAwal = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, emosiUser)), false);
      const laguPenenang = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'tenang') || matchEmotion(s.emotionalCategory, 'senang')), true);

      playlistRekomendasi = [
        ...laguAwal.slice(0, 3),
        ...laguPenenang.slice(0, 7)
      ];

    } else {
      const laguPositif = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'senang') || matchEmotion(s.emotionalCategory, 'tenang')), false);
      playlistRekomendasi = laguPositif.slice(0, 10);
    }

    if (playlistRekomendasi.length < 10) {
      const existingIds = new Set(playlistRekomendasi.map(s => s.id));
      const sisa = sortPersonalized(allSongs.filter(s => !existingIds.has(s.id)), false);
      playlistRekomendasi = [...playlistRekomendasi, ...sisa.slice(0, 10 - playlistRekomendasi.length)];
    }

    // 🎯 6. SYSTEM INSTRUCTION GEMINI AI (DUKUNGAN CHAT DULUAN / PROACTIVE CHAT & REPEAT DETEKTIF)
    let chatHistoryText = chatHistoryRaw.map(c => `${c.role}: ${c.message}`).join("\n");
    const repeatedSongTitle = repeatedSong?.title || "lagu ini";

    let systemInstruction = `
      Anda adalah Sona AI, asisten psikologi musik empiris yang ramah, empati, dan peka.
      Subjek: ${profile.fullName} (${profile.gender}).
      
      Riwayat Chat Terakhir:
      ${chatHistoryText || "Belum ada percakapan."}

      KONDISI KHUSUS:
      - Apakah Chat Init Otomatis (AI Menyapa Duluan karena Deteksi Emosi/Sistem): ${isAutoInitiated ? "YA" : "TIDAK"}
      - Status Repeat Lagu 5x: ${isSpecialCondition ? `YA (Judul: "${repeatedSongTitle}")` : "TIDAK"}
      - Emosi Terdeteksi: "${emosiUser}"

      PANDUAN RESPONS:
      1. JIKA isSpecialCondition = true (Terdeteksi Repeat 5x):
         - Sapa ${profile.fullName} dengan lembut.
         - Sebutkan bahwa Anda menyadari dia memutar lagu "${repeatedSongTitle}" berulang-ulang.
         - Tanyakan 3 kemungkinan (misal: apakah lagu ini membantunya fokus/relate liriknya, atau sedang butuh teman cerita).
         - Beritahu bahwa playlist sudah disesuaikan agar mood-nya tetap segar.

      2. JIKA isAutoInitiated = true (AI Chat Duluan):
         - Berikan sapaan pembuka hangat tanpa menunggu pesan pengguna.
         - Sampaikan bahwa sistem mendeteksi emosi "${emosiUser}" dan Anda hadir untuk menemani serta menyajikan gradasi musik penyeimbang mood.

      3. JIKA CHAT BIASA:
         - Berikan respon empati yang relevan dengan emosi "${emosiUser}".
    `;

    const promptUserText = userMessage || (isAutoInitiated ? `Sapa saya karena emosiku terdeteksi "${emosiUser}"` : 'Berikan saya rekomendasi lagu');

    const prompt = `Pesan pengguna/sistem: "${promptUserText}".
      Format Output HARUS selalu JSON murni:
      {
        "aiResponse": "Pesan sapaan empatik untuk pengguna",
        "reasoning": "Penjelasan ringkas ilmiah penanganan emosi/repeat/gradasi"
      }
    `;

    let aiResult = {
      aiResponse: isSpecialCondition 
        ? `Halo ${profile.fullName}, aku menyadari kamu sedang memutar lagu "${repeatedSongTitle}" berulang kali. Apakah lagu ini sedang membantumu fokus, atau kamu sedang butuh teman cerita? Aku sudah menyusun gradasi lagu baru untukmu.`
        : `Halo ${profile.fullName}! Aku mendeteksi emosimu saat ini (${emosiUser}). Aku telah menyiapakan gradasi musik khusus untuk menemani harimu.`,
      reasoning: isSpecialCondition ? "Mendeteksi repetisi lagu berlebihan dan menyajikan variasi gradasi penyeimbang." : "Gradasi musik ISO Principle."
    };

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json'
        }
      });

      if (response && response.text) {
        aiResult = JSON.parse(response.text);
      }
    } catch (modelErr) {
      console.warn("⚠️ Error Gemini:", modelErr.message);
    }

    // 7. Simpan Pesan Baru ke History Chat Firebase
    if (userId && userId !== 'guest') {
      try {
        const chatRef = ref(db, `users/${userId}/history_chat`);
        const timestamp = new Date().toISOString();
        if (userMessage) {
          await set(push(chatRef), { role: 'user', message: userMessage, timestamp });
        }
        await set(push(chatRef), { role: 'model', message: aiResult.aiResponse, timestamp });
      } catch (dbErr) {
        console.warn("⚠️ Gagal simpan chat history:", dbErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      isSpecialCondition,
      sapaanAI: aiResult.aiResponse,
      analisisIlmiah: aiResult.reasoning,
      playlist: playlistRekomendasi
    });

  } catch (error) {
    console.error("❌ Error Chat Route:", error);
    return NextResponse.json({ 
      success: true, 
      sapaanAI: "Sona AI siap menemani. Nikmati gradasi musik berikut!",
      playlist: []
    });
  }
}