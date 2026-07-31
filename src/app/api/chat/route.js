import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { db } from '@/lib/firebase';
import { ref, get, set, push } from 'firebase/database';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function padZero(num, size) {
  let s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}

async function getSongsFromCSV() {
  try {
    const csvFilePath = path.join(process.cwd(), 'Dataset final - Sheet1.csv');
    if (!fs.existsSync(csvFilePath)) return [];

    const rows = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    return rows.map(row => {
      const idLagu = parseInt(row.No) || 0;
      const formatEmpatDigit = padZero(idLagu, 4);
      return {
        id: `song_${formatEmpatDigit}`,
        no: idLagu,
        title: row.Title || 'Tanpa Judul',
        artist: row.Artist || 'Unknown Artist',
        bpm: parseInt(row.BPM) || 0,
        energy: parseInt(row.ENERGY) || 0,
        danceability: parseInt(row.DANCE) || 0,
        loudness: parseInt(row.LOUD) || 0,
        valence: parseFloat(row.VALENCE) / 100 || 0,
        duration: row.LENGTH || '0:00',
        acousticness: parseInt(row.ACOUSTIC) || 0,
        genre: row.GENRE || 'Pop',
        emotionalCategory: row['KATEGORI EMOSI'] ? row['KATEGORI EMOSI'].toLowerCase().trim() : 'unknown',
        coverUrl: row.Cover_url || '',
        audioUrl: `https://firebasestorage.googleapis.com/v0/b/moodify-b867b.firebasestorage.app/o/Song${formatEmpatDigit}.mp3?alt=media`
      };
    }).filter(s => s.no > 0);
  } catch (err) {
    console.error("❌ Error reading CSV fallback in chat route:", err);
    return [];
  }
}

export async function POST(request) {
  try {
    const { userId, detectedEmotion, preferredGenre, userMessage, isAutoInitiated } = await request.json();

    const targetUserId = userId || 'user_001';

    // 1. Ambil Data History Lengkap Per Akun dari Firebase:
    // - Profile
    // - history_chat (Chat history)
    // - play_history / history_songs (Lagu yang diputar & Audio Features)
    // - history_sessions (Sesi & Modus emosi)
    // - history_mood (Mood & trigger)
    let userData = {};
    try {
      const userRef = ref(db, `users/${targetUserId}`);
      const userSnapshot = await get(userRef);
      if (userSnapshot.exists()) {
        userData = userSnapshot.val();
      }
    } catch (dbErr) {
      console.warn("⚠️ Firebase user read error in chat route:", dbErr.message);
    }

    const profile = userData.profile || { fullName: "Teman", gender: "Umum" };
    
    // 💬 1a. History Chat
    const chatHistoryRaw = userData.history_chat ? Object.values(userData.history_chat) : [];
    const recentChatList = chatHistoryRaw.slice(-6);
    
    // 🎵 1b. History Lagu & Audio Features
    const playHistoryRaw = userData.play_history ? Object.values(userData.play_history) : 
                           (userData.history_songs ? Object.values(userData.history_songs) : []);
    const recent5Plays = playHistoryRaw.slice(-5);
    const recentPlayedIds = new Set(recent5Plays.map(h => h.songId || h.id));

    // 📊 1c. History Sesi
    const sessionHistoryRaw = userData.history_sessions ? Object.values(userData.history_sessions) : [];
    const recentSessionMoods = sessionHistoryRaw
      .map(s => s.dominantMood)
      .filter(Boolean)
      .slice(-5);

    // 🧠 1d. History Mood
    const moodHistoryRaw = userData.history_mood ? Object.values(userData.history_mood) : [];
    const recentMoodEntries = moodHistoryRaw
      .map(m => m.detectedMood || (m.consecutive_moods ? Object.values(m.consecutive_moods).pop()?.detectedMood : null))
      .filter(Boolean)
      .slice(-5);

    // 🎯 2. FITUR DETEKSI REPEAT BERLEBIHAN (SPECIAL CONDITION)
    let isSpecialCondition = false;
    let repeatedSong = null;

    if (recent5Plays.length >= 5) {
      const firstId = recent5Plays[0].songId || recent5Plays[0].id;
      const isRepeated5Times = recent5Plays.every(item => (item.songId || item.id) === firstId);
      
      if (isRepeated5Times) {
        isSpecialCondition = true;
        repeatedSong = recent5Plays[0];
      }
    }

    // 3. Tarik Seluruh Database Lagu & Hitung Skor Preferensi Berdasarkan History Pengguna
    let allSongs = [];
    try {
      const dbUrl = "https://moodify-b867b-default-rtdb.asia-southeast1.firebasedatabase.app/songs.json";
      const res = await fetch(dbUrl, {
        signal: AbortSignal.timeout(3000),
        cache: 'no-store'
      });
      if (res.ok) {
        const songsData = await res.json();
        if (songsData) {
          allSongs = Object.keys(songsData).map(key => ({
            id: key,
            ...songsData[key]
          }));
        }
      }
    } catch (dbErr) {
      console.warn("⚠️ Firebase songs REST fetch error in chat route:", dbErr.message);
    }

    if (allSongs.length === 0) {
      allSongs = await getSongsFromCSV();
    }

    // Analisis Preferensi Genre, Artis & Audio Feature Baseline dari History Pengguna
    const genreFrequency = {};
    const artistFrequency = {};
    let sumValence = 0;
    let sumEnergy = 0;
    let sumBpm = 0;
    let featureCount = 0;

    playHistoryRaw.forEach(item => {
      if (item.genre) {
        const g = item.genre.toLowerCase().trim();
        genreFrequency[g] = (genreFrequency[g] || 0) + 1;
      }
      if (item.artist) {
        const a = item.artist.toLowerCase().trim();
        artistFrequency[a] = (artistFrequency[a] || 0) + 1;
      }
      if (item.valence !== undefined) sumValence += parseFloat(item.valence) || 0.5;
      if (item.energy !== undefined) sumEnergy += parseFloat(item.energy) || 50;
      if (item.bpm !== undefined) sumBpm += parseFloat(item.bpm) || 100;
      featureCount++;
    });

    const topGenres = Object.keys(genreFrequency).sort((a, b) => genreFrequency[b] - genreFrequency[a]).slice(0, 3);
    const topArtists = Object.keys(artistFrequency).sort((a, b) => artistFrequency[b] - artistFrequency[a]).slice(0, 3);

    allSongs = allSongs.map(song => {
      let score = 0;
      const g = song.genre?.toLowerCase().trim();
      const a = song.artist?.toLowerCase().trim();
      if (g && genreFrequency[g]) score += genreFrequency[g] * 3;
      if (a && artistFrequency[a]) score += artistFrequency[a] * 4;
      if (preferredGenre && g === preferredGenre.toLowerCase().trim()) score += 6;
      return { ...song, preferenceScore: score };
    });

    // 4. Deteksi Emosi & Ringkasan Niat Chat Pengguna (Berbasis AI Semantik & Context Multimodal)
    let emosiUser = (detectedEmotion || '').toLowerCase().trim();
    // Apabila emosiUser belum diisi, biarkan Gemini AI menyimpulkan secara mendalam dari isi percakapan,
    // nada bicara, konteks cerita, serta riwayat musik/mood tanpa bergantung pada kata kunci kaku.

    const isExplicitMusicRequest = Boolean(userMessage && (
      /lagu|playlist|musik|rekomendasi|putar|stel|setel|putarkan|gradasi|dengar/i.test(userMessage)
    ));

    const isAutoTrigger = Boolean(isAutoInitiated);

    const matchEmotion = (songCategory, target) => {
      if (!songCategory) return false;
      const cat = songCategory.toLowerCase().trim();
      const tgt = (target || '').toLowerCase().trim();

      if (['senang', 'happy', 'bahagia', 'gembira', 'semangat', 'bangga', 'antusias', 'ceria'].includes(tgt)) {
        return ['senang', 'happy'].some(x => cat.includes(x));
      }
      if (['tenang', 'relaxed', 'santai', 'damai', 'fokus', 'rileks', 'calm'].includes(tgt)) {
        return ['tenang', 'relaxed', 'calm'].some(x => cat.includes(x));
      }
      if (['marah', 'angry', 'frustrasi', 'frustasi', 'jengkel', 'kesal', 'stres', 'stress'].includes(tgt)) {
        return ['marah', 'angry', 'sedih'].some(x => cat.includes(x));
      }
      if (['cemas', 'fear', 'lelah', 'capek', 'penat', 'khawatir', 'gelisah', 'sedih', 'sad', 'kecewa', 'patah hati'].includes(tgt)) {
        return ['sedih', 'sad', 'tenang', 'cemas', 'fear'].some(x => cat.includes(x));
      }
      return cat.includes(tgt) || tgt.includes(cat);
    };

    const sortPersonalized = (songList) => {
      return songList.sort((a, b) => {
        const aPlayed = recentPlayedIds.has(a.id) ? -15 : 0;
        const bPlayed = recentPlayedIds.has(b.id) ? -15 : 0;
        const scoreA = a.preferenceScore + aPlayed;
        const scoreB = b.preferenceScore + bPlayed;
        return scoreB - scoreA;
      });
    };

    // 🎯 5. ALGORITMA GRADASI EMOSI & AUDIO FEATURES (ISO PRINCIPLE & MOOD ELEVATION ARC)
    // Berlaku untuk emosi apapun, disesuaikan dengan preferensi musik pengguna.
    let playlistRekomendasi = [];

    if (isSpecialCondition && repeatedSong) {
      // De-eskalasi Repeat Lagu Berlebihan (Kondisi Khusus)
      const penenang = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'tenang') || (s.acousticness || 0) >= 40));
      const transisi = sortPersonalized(allSongs.filter(s => (s.bpm || 100) >= 80 && (s.bpm || 100) <= 110));
      const bahagia = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'senang')));

      playlistRekomendasi = [
        ...penenang.slice(0, 3),
        ...transisi.slice(0, 4),
        ...bahagia.slice(0, 3)
      ];
    } else {
      // Gradasi Emosi Multitahap ISO Principle untuk emosi apapun
      const targetEmosiAwal = emosiUser || 'sedih';

      // 1. Validasi Emosi Awal
      const tahap1_validasi = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, targetEmosiAwal)));

      // 2. Rileks & Penenangan (Acousticness tinggi, BPM 60-85, Energy rendah)
      const tahap2_rileks = sortPersonalized(allSongs.filter(s => 
        matchEmotion(s.emotionalCategory, 'tenang') || ((s.energy || 50) <= 55 && (s.bpm || 90) <= 90)
      ));

      // 3. Elevasi Bertahap Audio Features (BPM & Energy naik bertahap)
      const tahap3_elevasi = sortPersonalized(allSongs.filter(s => 
        (s.bpm || 100) >= 85 && (s.bpm || 100) <= 115 && (s.valence || 0.5) >= 0.45
      ));

      // 4. Puncak Senang & Bahagia (Valence > 0.65, Energy > 55, BPM > 105)
      const tahap4_senang = sortPersonalized(allSongs.filter(s => 
        matchEmotion(s.emotionalCategory, 'senang') || ((s.valence || 0) >= 0.65 && (s.energy || 0) >= 55)
      ));

      playlistRekomendasi = [
        ...tahap1_validasi.slice(0, 2),
        ...tahap2_rileks.slice(0, 3),
        ...tahap3_elevasi.slice(0, 3),
        ...tahap4_senang.slice(0, 2)
      ];
    }

    // Pastikan minimal 10 lagu tanpa duplikasi ID
    if (playlistRekomendasi.length < 10) {
      const existingIds = new Set(playlistRekomendasi.map(s => s.id));
      const fallback = sortPersonalized(allSongs.filter(s => !existingIds.has(s.id)));
      playlistRekomendasi = [...playlistRekomendasi, ...fallback.slice(0, 10 - playlistRekomendasi.length)];
    }

    // 🎯 6. GEMINI SYSTEM INSTRUCTION (BERBASIS EMPATI, KESIMPULAN EMOSI & NADA SAPAAN MULTI-EMOSI)
    let chatHistoryText = recentChatList.map(c => `${c.role}: ${c.message}`).join("\n");
    const repeatedSongTitle = repeatedSong?.title || "lagu ini";

    let systemInstruction = `
      Anda adalah Sona AI, sahabat & asisten psikologi musik empiris yang ramah, hangat, empati, dan ilmiah.
      Subjek: ${profile.fullName} (${profile.gender}).
      
      PREFERENSI MUSIK PENGGUNA (${targetUserId}):
      - Genre Favorit (History): ${topGenres.join(", ") || "Pop"}
      - Artis Favorit (History): ${topArtists.join(", ") || "Umum"}
      - Riwayat Percakapan Terakhir:
      ${chatHistoryText || "Belum ada percakapan."}

      STATUS CHAT SAAT INI:
      - Pesan Pengguna: "${userMessage || ''}"
      - Pemicu Otomatis Sistem (Trigger 5 lagu / repeat 5x): ${isAutoTrigger ? "YA" : "TIDAK"}
      - Minta Playlist Langsung: ${isExplicitMusicRequest ? "YA" : "TIDAK"}
      - Kondisi Khusus (Repeat 1 lagu 5x berlebihan): ${isSpecialCondition ? `YA (Judul: "${repeatedSongTitle}")` : "TIDAK"}
      - Emosi Awal Terdeteksi: "${emosiUser || 'perlu disimpulkan dari chat'}"

      PANDUAN NADA SAPAAN & DETEKSI EMOSI ADAPTIF (BAHASA INDONESIA):
      Sona AI MENGANALISIS EMOSI SECARA ADAPTIF & PRESISI DALAM BAHASA INDONESIA:
      - Nilai "detectedEmotion" HARUS berupa kata emosi Bahasa Indonesia yang paling tepat dan spesifik mewakili cerita/curhatan/kondisi pengguna.
      - Contoh emosi adaptif Bahasa Indonesia: "frustrasi", "stres", "cemas", "lelah", "penat", "kecewa", "marah", "kesal", "sedih", "galau", "tenang", "santai", "damai", "fokus", "senang", "bahagia", "semangat", "gembira", "gelisah", dll.
      - PENTING: JANGAN gunakan bahasa Inggris untuk "detectedEmotion" (misal: gunakan "stres" bukan "stressed", "frustrasi" bukan "frustrated", "cemas" bukan "anxious").

      PANDUAN RESPONS KATEGORI EMOSI:
      - EMOSI POSITIF (Senang, Bahagia, Semangat, Gembira, Bangga): Sambut dengan gembira, antusias, dan ceria. Sampaikan bahwa gradasi musik disiapkan untuk merayakan dan memperpanjang energi positif pengguna.
      - EMOSI TENANG / RILEKS (Tenang, Santai, Damai, Fokus): Sambut dengan hangat, teduh, dan tenang. Sampaikan bahwa gradasi musik disiapkan untuk menemani ketenangan dan menjaga fokus pikiran.
      - EMOSI TEKANAN / NEGATIF (Frustrasi, Stres, Cemas, Lelah, Marah, Kecewa, Sedih): Sambut dengan empati mendalam, ramah, dan tanpa menghakimi. Sampaikan bahwa gradasi musik disiapkan secara bertahap (ISO principle) untuk meredakan ketegangan, mendampingi, dan memulihkan kenyamanan emosi.
      - KONDISI KHUSUS (Repeat 1 lagu 5x): Apresiasi rasa sukanya pada lagu tersebut, lalu tawarkan gradasi musik penenangan relaksasi agar suasana pendengaran tetap segar.

      PANDUAN ALUR CHAT:
      1. JIKA PENGGUNA HANYA MENYAPA ATAU BERCERITA / CURHAT TANPA LANGSUNG MEMINTA PLAYLIST (Minta Playlist = TIDAK & Trigger Otomatis = TIDAK):
         - Balaslah dengan hangat dan penuh empati dalam Bahasa Indonesia.
         - Dari cerita/sapaan, SIMPULKAN emosi spesifik pengguna secara adaptif (misal: "frustrasi", "stres", "cemas", "lelah", "sedih", "senang", dll).
         - Sebutkan kesimpulan emosi tersebut dalam percakapan secara alami.
         - Tanyakan dengan ramah apakah dia ingin mendengarkan gradasi musik penyeimbang/pendamping mood untuk emosi tersebut.
         - Set "shouldUpdatePlaylist": false.
         - Set "detectedEmotion": "<kata_emosi_bahasa_indonesia_teranalisis>".

      2. JIKA PENGGUNA EKSPLISIT MEMINTA PLAYLIST / REKOMENDASI (Minta Playlist = YA):
         - Berikan respon hangat yang sesuai dengan emosinya & jelaskan gradasi musik personal yang disiapkan berbasis preferensi genre/artis miliknya.
         - Set "shouldUpdatePlaylist": true.
         - Set "detectedEmotion": "<kata_emosi_bahasa_indonesia_teranalisis>".

      3. JIKA PEMICU OTOMATIS SISTEM / PROAKTIF (Trigger Otomatis = YA):
         - Sona AI HARUS NGECHAT DULUAN secara proaktif dengan sapaan hangat yang sesuai nada emosinya.
         - Set "shouldUpdatePlaylist": true.
         - Set "detectedEmotion": "${emosiUser || 'senang'}".

      Format Output HARUS SELALU JSON MURNI:
      {
        "aiResponse": "Teks pesan balasan empati Sona AI untuk pengguna dalam Bahasa Indonesia (sesuaikan nada emosinya)",
        "reasoning": "Penjelasan ringkas ilmiah kesimpulan emosi dan gradasi audio features berbasis preferensi pengguna",
        "detectedEmotion": "kata emosi spesifik teranalisis dalam Bahasa Indonesia (contoh: frustrasi, stres, cemas, lelah, sedih, tenang, senang, dll)",
        "shouldUpdatePlaylist": true/false
      }
    `;

    const promptUserText = userMessage || (isAutoInitiated 
      ? (isSpecialCondition 
          ? `Saya memutar lagu "${repeatedSongTitle}" 5 kali berturut-turut. Sapa saya dengan kondisi khusus ini secara ramah.` 
          : `Saya mendengarkan 5 lagu emosi "${emosiUser || 'senang'}" berturut-turut. Sapa saya secara proaktif sesuai nada emosi ini.`)
      : 'Halo Sona AI');

    const prompt = `Pesan pengguna/sistem: "${promptUserText}".`;

    let defaultGreeting = `Halo ${profile.fullName}! Senang mengobrol denganmu. Bagaimana perasaanmu hari ini?`;
    if (isSpecialCondition) {
      defaultGreeting = `Halo ${profile.fullName}, aku memperhatikan kamu memutar "${repeatedSongTitle}" berulang kali (Kondisi Khusus). Mari rilekskan pikiran sejenak dengan gradasi audio penenangan yang kusiapkan.`;
    } else if (isAutoInitiated) {
      if (['senang', 'bahagia', 'semangat', 'gembira'].includes(emosiUser)) {
        defaultGreeting = `Halo ${profile.fullName}! Wah, senang sekali melihat kamu sedang merasa ${emosiUser}! Aku sudah menyiapkan gradasi musik pilihan untuk merayakan dan menjaga energi bahagiamu hari ini.`;
      } else if (['tenang', 'santai', 'damai'].includes(emosiUser)) {
        defaultGreeting = `Halo ${profile.fullName}! Suasana hatimu terasa sangat ${emosiUser}. Aku menyajikan gradasi alun musik yang selaras untuk menemani ketenanganmu.`;
      } else {
        defaultGreeting = `Halo ${profile.fullName}! Aku mendeteksi kamu sedang merasa ${emosiUser || 'tertentu'}. Aku telah menyusun gradasi musik personal berbasis audio features untuk mendampingi dan membuat perasaanmu lebih nyaman.`;
      }
    }

    let aiResult = {
      aiResponse: defaultGreeting,
      reasoning: "Penyimpulan emosi dari percakapan & penyusunan gradasi musik ISO principle berbasis preferensi riwayat.",
      detectedEmotion: emosiUser || 'senang',
      shouldUpdatePlaylist: isAutoInitiated || isExplicitMusicRequest
    };

    try {
      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json'
          }
        });
      } catch (e2) {
        response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json'
          }
        });
      }

      if (response && response.text) {
        aiResult = JSON.parse(response.text);
      }
    } catch (modelErr) {
      console.warn("⚠️ Error Gemini:", modelErr.message);
    }

    const finalEmotion = aiResult.detectedEmotion || emosiUser || 'sedih';
    const shouldUpdatePlaylist = Boolean(aiResult.shouldUpdatePlaylist || isAutoInitiated || isExplicitMusicRequest);

    // 7. Simpan History Chat & History Mood ke Firebase
    if (targetUserId) {
      try {
        const timestamp = new Date().toISOString();
        const chatRef = ref(db, `users/${targetUserId}/history_chat`);
        
        if (userMessage) {
          await set(push(chatRef), { role: 'user', message: userMessage, timestamp, detectedEmotion: finalEmotion });
        }
        await set(push(chatRef), { role: 'model', message: aiResult.aiResponse, timestamp, reasoning: aiResult.reasoning });

        // Simpan Log History Mood
        const moodRef = ref(db, `users/${targetUserId}/history_mood`);
        await set(push(moodRef), {
          detectedMood: finalEmotion,
          detectedAt: timestamp,
          triggerType: isSpecialCondition ? 'repeat_5x' : (isAutoInitiated ? 'auto_chat' : 'user_chat'),
          notes: aiResult.reasoning
        });
      } catch (dbErr) {
        console.warn("⚠️ Gagal simpan chat/mood history:", dbErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      isSpecialCondition,
      sapaanAI: aiResult.aiResponse,
      analisisIlmiah: aiResult.reasoning,
      detectedEmotion: finalEmotion,
      shouldUpdatePlaylist,
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