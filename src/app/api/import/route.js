import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { db } from '@/lib/firebase'; 
import { ref, set } from 'firebase/database';

function padZero(num, size) {
  let s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}

export async function GET() {
  try {
    const csvFilePath = path.join(process.cwd(), 'Dataset final - Sheet1.csv');
    const songs = [];

    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => songs.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`🤖 Memulai impor ${songs.length} lagu di folder SONA ke Realtime Database...`);

    let suksesCount = 0;
    for (const row of songs) {
      const idLagu = parseInt(row.No);
      if (!idLagu) continue;

      const formatEmpatDigit = padZero(idLagu, 4);
      const audioUrl = `https://firebasestorage.googleapis.com/v0/b/moodify-b867b.firebasestorage.app/o/Song${formatEmpatDigit}.mp3?alt=media`;

      const dataLagu = {
        id: `song_${formatEmpatDigit}`,
        no: idLagu,
        title: row.Title || "Unknown",
        artist: row.Artist || "Unknown",
        bpm: parseInt(row.BPM) || 0,
        energy: parseInt(row.ENERGY) || 0,
        danceability: parseInt(row.DANCE) || 0,
        loudness: parseInt(row.LOUD) || 0,
        valence: parseFloat(row.VALENCE) / 100, 
        length: row.LENGTH || "0:00",
        acousticness: parseInt(row.ACOUSTIC) || 0,
        genre: row.GENRE || "Pop",
        emotionalCategory: row['KATEGORI EMOSI'] ? row['KATEGORI EMOSI'].toLowerCase().trim() : 'unknown',
        coverUrl: row.Cover_url || "",
        audioUrl: audioUrl
      };

      const songRef = ref(db, `songs/${dataLagu.id}`);
      await set(songRef, dataLagu);
      suksesCount++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `🏁 Sona Environment Sukses! Berhasil meng-import ${suksesCount} lagu ke Realtime Database.` 
    });

  } catch (error) {
    console.error("❌ Error Import Route:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}