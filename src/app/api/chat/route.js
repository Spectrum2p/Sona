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

    // -------------------------------------------------------------------------
    // 🎯 3. ANALYSIS PREFERENSI BASELINE PENGGUNA
    // -------------------------------------------------------------------------
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

    // Helper identifikasi lagu Lokal (Indo/Jawa/Dangdut) vs Barat/English
    const isIndoGenreOrArtist = (song) => {
      const g = (song.genre || '').toLowerCase();
      const a = (song.artist || '').toLowerCase();
      const t = (song.title || '').toLowerCase();
      if (/jawa|dangdut|indo|melayu|keroncong/i.test(g)) return true;
      if (/didi kempot|denny caknan|happy asmara|guyon waton|lyodra|acha septriasa|nidji|fourtwnty|donne maula|ipank|rizky febian|hivi|noah|barasuara|nadin amizah|ndarboy|mahalini|hindia|feast|ndx|pamungkas|tulus|raisa|isyana|fiersa|judika|afgan|rossa|vidi|sheila|dwa|kunto|yura|kahitna|glenn|dewi|armada|dewa|dmasiv|slank|gigi|geisha|padi|ungu|wali|kangen|st12|last child|virgoun|jkt48|tiara|ziva|keisya|febi|nadhif|sal priadi|bernadya|juicy luicy|maliq|batavia|brisia|fuji/i.test(a + " " + t)) return true;
      return false;
    };

    // -------------------------------------------------------------------------
    // 🎯 4. GEMINI SYSTEM INSTRUCTION - KECERDASAN SEMANTIK INTENT & CONSTRAINTS
    // -------------------------------------------------------------------------
    let chatHistoryText = recentChatList.map(c => `${c.role}: ${c.message}`).join("\n");
    const repeatedSongTitle = repeatedSong?.title || "lagu ini";
    const isAutoTrigger = Boolean(isAutoInitiated);

    let systemInstruction = `
      Anda adalah Sona AI, sahabat pendengar yang hangat, empati tinggi, & asisten psikologi musik empiris yang cerdas.
      Subjek: ${profile.fullName} (${profile.gender}).
      
      PREFERENSI HISTORIS MUSIK PENGGUNA (${targetUserId}):
      - Genre Favorit: ${topGenres.join(", ") || "Pop"}
      - Artis Favorit: ${topArtists.join(", ") || "Umum"}
      - Riwayat Percakapan Terakhir:
      ${chatHistoryText || "Belum ada percakapan."}

      STATUS CHAT SAAT INI:
      - Pesan Pengguna: "${userMessage || ''}"
      - Pemicu Otomatis Sistem (Trigger 5 lagu / repeat 5x): ${isAutoTrigger ? "YA" : "TIDAK"}
      - Kondisi Khusus (Repeat 1 lagu 5x berlebihan): ${isSpecialCondition ? `YA (Judul: "${repeatedSongTitle}")` : "TIDAK"}
      - Emosi Awal Terdeteksi: "${detectedEmotion || 'perlu disimpulkan dari chat'}"

      PRINSIP KECERDASAN SEMANTIK & HIRARKI REKOMENDASI (PENTING):

      HIRARKI UTAMA:
      1. TANGGAPAN BAIK TERLEBIH DAHULU (ALWAYS RESPOND EMPATHETICALLY FIRST):
         Setiap kali pengguna bercerita atau curhat, Sona AI WAJIB merespons cerita/perasaannya dengan tanggapan yang sangat baik, hangat, empati, dan mendengarkan dengan tulus terlebih dahulu.
      2. PERINTAH DICHAT ADALAH PRIORITAS UTAMA (HIGHEST PRIORITY):
         Jika pengguna memberikan perintah spesifik di chat (misal genre: R&B/Pop/Rock/Jazz/Akustik, bahasa: English/Indonesia/Jawa, nuansa: upbeat/slow, atau nama artis), perintah tersebut WAJIB menjadi filter utama.
      3. PREFERENSI HISTORIS MUSIK TETAP JADI PERTIMBANGAN:
         Riwayat genre & artis favorit pengguna (Top Genres: ${topGenres.join(", ") || "Pop"}, Top Artists: ${topArtists.join(", ") || "Umum"}) digunakan untuk merangking (sorting) lagu-lagu kandidat yang telah lolos filter perintah chat.
      4. PENOLAKAN DICHAT (ABSOLUTE FILTER):
         Lagu, artis, atau genre yang dilarang pengguna HARUS dihapus total dan DILARANG KERAS disarankan dalam balasan chat.

      1. KLASIFIKASI NIAT PENGGUNA (userIntent):
         Analisis pesan pengguna dengan kecerdasan semantikmu secara fleksibel:
         - "greeting_or_chitchat": Pengguna baru menyapa ("Halo Sona", "Hai", "Selamat pagi"), menanyakan kabar AI, atau obrolan ringan awal.
         - "curhat_in_progress": Pengguna sedang menceritakan masalah, kejadian hari ini, perasaan, atau beban pikiran, TAPI cerita curhatnya MASIH BERLANJUT / BELUM SELESAI dan pengguna BELUM MINTA playlist/lagu.
         - "curhat_finished": Cerita curhat pengguna sudah selesai, atau pengguna mengisyaratkan telah lega menceritakan semuanya / menanyakan pendapat AI atas perasaannya.
         - "request_music": Pengguna MENJAWAB "IYA", "MAU", "BOLEH", "COBA", "PUTARIN", "AYO" saat ditawari musik, ATAU pengguna dari awal secara eksplisit meminta rekomendasi lagu/playlist/genre tertentu.
         - "end_session": Pengguna mengisyaratkan menyudahi sesi chat ("terima kasih Sona", "selesai", "sampai jumpa", "bye").

      2. ATURAN PENANGANAN LULUSAN EMPATI (SANGAT PENTING - ALUR MUSIK KETAT):
         - JIKA userIntent ADALAH "greeting_or_chitchat" ATAU "curhat_in_progress":
           * Set "shouldUpdatePlaylist": false.
           * DALAM "aiResponse", TANGGAPI PENGGUNA SEBAGAI SAHABAT PENDENGAR YANG EMPATIS TERLEBIH DAHULU.
           * DILARANG KERAS MENYODORKAN PLAYLIST, MENYURUH MENDENGARKAN MUSIK, ATAU MEMBERIKAN DAFTAR LAGU!
           * Dengarkan dengan tulus, validasi perasaannya, dan tanyakan kelanjutan ceritanya dengan hangat.
         - JIKA userIntent ADALAH "curhat_finished" (CERITA CURHAT SUDAH SELESAI):
           * Set "shouldUpdatePlaylist": false.
           * DALAM "aiResponse", berikan tanggapan & penguatan emosional yang baik dulu atas seluruh cerita pengguna.
           * KEMUDIAN DI AKHIR BALASAN, TANYAKAN DENGAN HANGAT DAN MANIS:
             "Mau coba dengerin langsung untuk membantu memperbaiki suasana hatimu gaa??"
           * DILARANG LANGSUNG MEMBERIKAN DAFTAR LAGU/PLAYLIST! Tunggu pengguna menjawab "iya" atau "mau".
         - JIKA userIntent ADALAH "request_music" (Pengguna Menjawab "Iya", "Mau", "Boleh", "Putar", atau Minta Lagu):
           * Set "shouldUpdatePlaylist": true.
           * Sampaikan dengan ramah & antusias bahwa Sona AI telah menyiapkan playlist lagu khusus untuk membantu meredakan/memperbaiki suasana hatinya.
         - JIKA Pemicu Otomatis Sistem (isAutoTrigger/isSpecialCondition):
           * Set "shouldUpdatePlaylist": true.

      3. EKSTRAKSI LARANGAN & PENOLAKAN (excludedTerms) SECARA SEMANTIK:
         Gunakan kecerdasan bahasa untuk mendeteksi apa yang DILARANG / DITOLAK oleh pengguna dari pesan dan histori (contoh: "jangan didi kempot", "ga mau dangdut", "bukan lagu jawa", "stop lagu galau", "tidak mau lagu slow").
         * Masukkan istilah/artis/genre penolakan tersebut ke array "excludedTerms" (contoh: ["didi kempot", "dangdut", "pop jawa"]).
         * DALAM "aiResponse", KAMU DILARANG KERAS MENYEBUTKAN ATAU MENYARANKAN ARTIS/GENRE TERSEBUT LAGI!

      4. EKSTRAKSI PREFERENSI GENRE, BAHASA & NUANSA EKSPLISIT:
         - "requestedGenre": Genre spesifik jika diminta (contoh: "R&B", "Pop", "Rock", "Jazz", "Indie", "Acoustic", "Dangdut", "Pop Jawa", "any").
         - "requestedLanguage": "english" | "indonesia" | "jawa" | "any".
         - "requestedVibe": "upbeat" | "slow" | "calm" | "any".
         - "requestedArtist": Nama artis spesifik jika diminta (atau "any").

      Format Output WAJIB JSON MURNI:
      {
        "userIntent": "greeting_or_chitchat" | "curhat_in_progress" | "curhat_finished" | "request_music" | "end_session",
        "aiResponse": "Teks balasan empati Sona AI untuk pengguna dalam Bahasa Indonesia",
        "reasoning": "Analisis singkat kesimpulan emosi dan niat pengguna",
        "detectedEmotion": "Emosi spesifik terdeteksi dalam Bahasa Indonesia (contoh: frustrasi, lelah, cemas, sedih, tenang, senang, dll)",
        "excludedTerms": ["didi kempot", "dangdut"],
        "requestedGenre": "R&B" | "any",
        "requestedLanguage": "english" | "indonesia" | "any",
        "requestedVibe": "upbeat" | "slow" | "any",
        "shouldUpdatePlaylist": true | false
      }
    `;

    const promptUserText = userMessage || (isAutoInitiated 
      ? (isSpecialCondition 
          ? `Saya memutar lagu "${repeatedSongTitle}" 5 kali berturut-turut. Sapa saya dengan kondisi khusus ini secara ramah.` 
          : `Saya mendengarkan 5 lagu emosi "${detectedEmotion || 'senang'}" berturut-turut. Sapa saya secara proaktif sesuai nada emosi ini.`)
      : 'Halo Sona AI');

    const prompt = `Pesan pengguna/sistem: "${promptUserText}".`;

    let defaultGreeting = `Halo ${profile.fullName}! Senang mengobrol denganmu. Bagaimana perasaanmu hari ini?`;
    if (isSpecialCondition) {
      defaultGreeting = `Halo ${profile.fullName}, aku memperhatikan kamu memutar "${repeatedSongTitle}" berulang kali (Kondisi Khusus). Mari rilekskan pikiran sejenak dengan gradasi audio penenangan yang kusiapkan.`;
    } else if (isAutoInitiated) {
      defaultGreeting = `Halo ${profile.fullName}! Sona AI siap menyajikan gradasi musik personal untuk menemani harimu.`;
    }

    let aiResult = {
      userIntent: userMessage ? (/(?:lagu|playlist|musik|putar|rekomendasi|r&b|rnb|english|inggris|iya|mau|boleh|coba|setel)/i.test(userMessage) ? "request_music" : "curhat_in_progress") : "greeting_or_chitchat",
      aiResponse: defaultGreeting,
      reasoning: "Analisis awal percakapan dan respon empati.",
      detectedEmotion: (detectedEmotion || 'senang').toLowerCase(),
      excludedTerms: [],
      requestedGenre: "any",
      requestedLanguage: "any",
      requestedVibe: "any",
      shouldUpdatePlaylist: Boolean(isAutoInitiated || isSpecialCondition)
    };

    try {
      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json'
          }
        });
      } catch (e2) {
        response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json'
          }
        });
      }

      if (response && response.text) {
        const parsed = JSON.parse(response.text);
        aiResult = { ...aiResult, ...parsed };
      }
    } catch (modelErr) {
      console.warn("⚠️ Error Gemini API call:", modelErr.message);

      // Smart Fallback jika Gemini API bermasalah/API Key tidak valid/belum diset:
      if (userMessage) {
        const msgLower = userMessage.toLowerCase();
        let fallbackEmpathy = `Aku mendengarkanmu, ${profile.fullName}. Ceritakan lebih banyak tentang apa yang kamu rasakan ya.`;
        let emotion = 'tenang';

        if (/senang|bahagia|gembira|happy|mantap|seru|asik|asik/i.test(msgLower)) {
          fallbackEmpathy = `Wah, senang sekali mendengarnya, ${profile.fullName}! 🎉 Kebahagiaanmu menular banget. Apa yang bikin harimu begitu menyenangkan hari ini?`;
          emotion = 'senang';
        } else if (/sedih|duka|kecewa|tangis|nangis|galau|kecewa|patah/i.test(msgLower)) {
          fallbackEmpathy = `Peluk hangat untukmu, ${profile.fullName}. Tidak apa-apa merasa sedih. Aku di sini siap mendengarkan seluruh ceritamu kalau kamu mau curhat.`;
          emotion = 'sedih';
        } else if (/marah|kesal|jengkel|sebel|emosi|benci|gedeg/i.test(msgLower)) {
          fallbackEmpathy = `Aku paham rasanya pasti tidak nyaman banget, ${profile.fullName}. Keluarkan saja unek-unekmu di sini, aku siap mendengarkan.`;
          emotion = 'marah';
        } else if (/cemas|takut|khawatir|panik|bingung|stres|stress/i.test(msgLower)) {
          fallbackEmpathy = `Tarik napas perlahan ya, ${profile.fullName}. Kamu tidak sendirian. Coba ceritakan apa yang sedang membebani pikiranmu.`;
          emotion = 'sedih';
        } else if (/halo|hai|hey|sore|pagi|malam/i.test(msgLower)) {
          fallbackEmpathy = `Halo ${profile.fullName}! Ada cerita atau perasaan apa yang ingin kamu bagikan denganku hari ini?`;
        }

        aiResult.aiResponse = fallbackEmpathy;
        aiResult.detectedEmotion = emotion;
      }
    }

    // -------------------------------------------------------------------------
    // 🎯 5. GABUNGKAN LARANGAN NEGATIF (GEMINI + REGEX FALLBACK)
    // -------------------------------------------------------------------------
    const lowerUserMessage = (userMessage || '').toLowerCase();
    const excludedKeywords = new Set(aiResult.excludedTerms || []);

    const negativeRegex = /(?:jangan|bukan|tidak mau|gak suka|ga suka|gak mau|ga mau|selain|tanpa|no|exclude|banned|stop)\s+([a-zA-Z0-9\s]+?)(?=[.,;!?]|$|\s(?:dan|atau|tapi|namun|mau|pilih|ganti))/gi;
    let negMatch;
    while ((negMatch = negativeRegex.exec(lowerUserMessage)) !== null) {
      if (negMatch[1]) {
        const term = negMatch[1].replace(/^(?:lagu|musik|penyanyi|artis|genre|yang|putar|setel|pilihan|nyanyian|lagunya|suara)\s+/gi, '').trim();
        if (term.length >= 2) excludedKeywords.add(term);
      }
    }

    if (/(?:jangan|bukan|tidak mau|gak mau|ga mau|gak suka|ga suka|selain|tanpa|no|stop)/i.test(lowerUserMessage)) {
      if (lowerUserMessage.includes('didi kempot') || lowerUserMessage.includes('didi') || lowerUserMessage.includes('kempot')) {
        excludedKeywords.add('didi kempot');
        excludedKeywords.add('didi');
        excludedKeywords.add('kempot');
      }
      if (lowerUserMessage.includes('dangdut')) excludedKeywords.add('dangdut');
      if (lowerUserMessage.includes('pop jawa') || lowerUserMessage.includes('jawa')) {
        excludedKeywords.add('pop jawa');
        excludedKeywords.add('jawa');
      }
      if (lowerUserMessage.includes('galau')) excludedKeywords.add('galau');
      if (lowerUserMessage.includes('slow')) excludedKeywords.add('slow');
      if (lowerUserMessage.includes('sedih')) excludedKeywords.add('sedih');
      if (lowerUserMessage.includes('pop indo') || lowerUserMessage.includes('indonesia')) excludedKeywords.add('pop indo');
    }

    const excludedTermsArray = Array.from(excludedKeywords);

    if (excludedTermsArray.length > 0) {
      allSongs = allSongs.filter(song => {
        const songTitle = (song.title || '').toLowerCase();
        const songArtist = (song.artist || '').toLowerCase();
        const songGenre = (song.genre || '').toLowerCase();
        const songCategory = (song.emotionalCategory || '').toLowerCase();

        return !excludedTermsArray.some(term => {
          if (!term) return false;
          if (songTitle.includes(term) || songArtist.includes(term) || songGenre.includes(term) || songCategory.includes(term)) return true;
          const termWords = term.split(/\s+/).filter(w => w.length >= 3);
          if (termWords.length > 1 && termWords.some(w => songArtist.includes(w) || songTitle.includes(w))) return true;
          return false;
        });
      });
    }

    // -------------------------------------------------------------------------
    // 🎯 6. KEPUTUSAN UPDATE PLAYLIST & PENYUSUNAN DAFTAR LAGU
    // -------------------------------------------------------------------------
    const finalEmotion = aiResult.detectedEmotion || detectedEmotion || 'sedih';
    
    // Playlist HANYA di-update bila user MINTA REKOMENDASI MUSIK atau pemicu otomatis/kondisi khusus!
    const isChitchatOrCurhat = aiResult.userIntent === 'greeting_or_chitchat' || 
                               aiResult.userIntent === 'curhat_in_progress' || 
                               aiResult.userIntent === 'curhat_finished';
    const shouldUpdatePlaylist = Boolean(
      (aiResult.shouldUpdatePlaylist || aiResult.userIntent === 'request_music' || isAutoInitiated || isSpecialCondition) &&
      !isChitchatOrCurhat
    );

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

    const shuffleArray = (array) => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const sortPersonalized = (songList) => {
      // Shuffle array first so equal/similar scoring songs don't preserve fixed CSV/JSON row order
      const shuffled = shuffleArray(songList);
      return shuffled.sort((a, b) => {
        const aPlayed = recentPlayedIds.has(a.id) ? -20 : 0;
        const bPlayed = recentPlayedIds.has(b.id) ? -20 : 0;
        // Variasi acak dinamis (+- 8 poin) agar rekomendasi selalu segar & tidak selalu Suket Teki atau lagu #1
        const jitterA = Math.random() * 8;
        const jitterB = Math.random() * 8;
        const scoreA = (a.preferenceScore || 0) + aPlayed + jitterA;
        const scoreB = (b.preferenceScore || 0) + bPlayed + jitterB;
        return scoreB - scoreA;
      });
    };

    let playlistRekomendasi = [];

    if (shouldUpdatePlaylist) {
      const reqGenre = (aiResult.requestedGenre && aiResult.requestedGenre !== 'any') ? aiResult.requestedGenre.toLowerCase() : null;
      const reqLang = (aiResult.requestedLanguage && aiResult.requestedLanguage !== 'any') ? aiResult.requestedLanguage.toLowerCase() : null;
      const reqVibe = (aiResult.requestedVibe && aiResult.requestedVibe !== 'any') ? aiResult.requestedVibe.toLowerCase() : null;
      const reqArtist = (aiResult.requestedArtist && aiResult.requestedArtist !== 'any') ? aiResult.requestedArtist.toLowerCase() : null;

      const wantsRnb = reqGenre?.includes('r&b') || reqGenre?.includes('rnb') || /r&b|rnb|r n b|r and b/i.test(userMessage);
      const wantsEnglish = reqLang === 'english' || /english|inggris|barat|western|luar|us|uk|international/i.test(userMessage);
      const wantsIndo = reqLang === 'indonesia' || reqLang === 'jawa' || /indonesia|indo|lokal|jawa/i.test(userMessage);
      const wantsUpbeat = reqVibe === 'upbeat' || /upbeat|semangat|ceria|gembira|enerjik|fast|cepat|dance/i.test(userMessage);
      const wantsSlow = reqVibe === 'slow' || reqVibe === 'calm' || /slow|pelan|santai|lembut|akustik|menenangkan|tenang|pengantar tidur/i.test(userMessage);

      const hasExplicitChatCommand = Boolean(reqGenre || reqLang || reqVibe || reqArtist || wantsRnb || wantsEnglish || wantsIndo || wantsUpbeat || wantsSlow);

      if (isSpecialCondition && repeatedSong) {
        const penenang = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'tenang') || (s.acousticness || 0) >= 40));
        const transisi = sortPersonalized(allSongs.filter(s => (s.bpm || 100) >= 80 && (s.bpm || 100) <= 110));
        const bahagia = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, 'senang')));

        playlistRekomendasi = [
          ...penenang.slice(0, 3),
          ...transisi.slice(0, 4),
          ...bahagia.slice(0, 3)
        ];
      } else if (hasExplicitChatCommand) {
        // PERINTAH CHAT SEBAGAI FILTER UTAMA
        let matchingSongs = allSongs.filter(song => {
          const songGenre = (song.genre || '').toLowerCase();
          const songArtist = (song.artist || '').toLowerCase();
          const songTitle = (song.title || '').toLowerCase();

          if (reqArtist && !(songArtist.includes(reqArtist) || reqArtist.includes(songArtist))) return false;
          if (wantsEnglish && isIndoGenreOrArtist(song)) return false;
          if (wantsIndo && !isIndoGenreOrArtist(song)) return false;
          
          if (wantsRnb) {
            if (!songGenre.includes('r&b') && !songGenre.includes('rnb')) return false;
          } else if (reqGenre && reqGenre !== 'any') {
            if (!songGenre.includes(reqGenre) && !songTitle.includes(reqGenre)) return false;
          }

          if (wantsUpbeat) {
            if ((song.bpm || 100) < 100 && (song.energy || 50) < 55 && !matchEmotion(song.emotionalCategory, 'senang')) return false;
          }
          if (wantsSlow) {
            if ((song.bpm || 100) > 100 && (song.energy || 50) > 55 && !matchEmotion(song.emotionalCategory, 'tenang')) return false;
          }

          return true;
        });

        if (matchingSongs.length > 0) {
          // URUTKAN HASIL FILTER BERDASARKAN PREFERENSI HISTORIS PENGGUNA + JITTER VARIASI ACAK
          const sorted = sortPersonalized(matchingSongs);
          playlistRekomendasi = shuffleArray(sorted.slice(0, 10));
        } else {
          // Fallback sekunder jika kombinasi sangat spesifik: ambil filter bahasa/genre yang paling relevan
          let fallbackCandidates = allSongs;
          if (wantsEnglish) fallbackCandidates = fallbackCandidates.filter(s => !isIndoGenreOrArtist(s));
          if (wantsIndo) fallbackCandidates = fallbackCandidates.filter(s => isIndoGenreOrArtist(s));
          playlistRekomendasi = shuffleArray(sortPersonalized(fallbackCandidates).slice(0, 10));
        }
      } else {
        // PERINTAH UMUM / BEBAS: GUNAKAN GRADASI EMOSI DENGAN VARIABILITAS & SELEKSI DYNAMIC
        const targetEmosiAwal = finalEmotion || 'sedih';

        const tahap1_validasi = sortPersonalized(allSongs.filter(s => matchEmotion(s.emotionalCategory, targetEmosiAwal)));
        const tahap2_rileks = sortPersonalized(allSongs.filter(s => 
          matchEmotion(s.emotionalCategory, 'tenang') || ((s.energy || 50) <= 55 && (s.bpm || 90) <= 90)
        ));
        const tahap3_elevasi = sortPersonalized(allSongs.filter(s => 
          (s.bpm || 100) >= 85 && (s.bpm || 100) <= 115 && (s.valence || 0.5) >= 0.45
        ));
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

      if (playlistRekomendasi.length < 10) {
        const existingIds = new Set(playlistRekomendasi.map(s => s.id));
        const fallback = sortPersonalized(allSongs.filter(s => !existingIds.has(s.id)));
        playlistRekomendasi = [...playlistRekomendasi, ...fallback.slice(0, 10 - playlistRekomendasi.length)];
      }
    }

    // -------------------------------------------------------------------------
    // 🎯 7. SIMPAN CHAT HISTORY & MOOD LOG KE FIREBASE
    // -------------------------------------------------------------------------
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
      sapaanAI: "Sona AI siap menemani. Ada yang ingin kamu ceritakan?",
      playlist: []
    });
  }
}
