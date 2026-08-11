import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

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
    }).filter(s => s.no > 0).sort((a, b) => a.no - b.no);
  } catch (err) {
    console.error("❌ Error Reading CSV Fallback:", err);
    return [];
  }
}

let cachedSongs = null;

async function fetchAllSongs() {
  if (cachedSongs && cachedSongs.length > 0) {
    return cachedSongs;
  }

  let songsList = [];

  // 1. Try fetching directly from Firebase RTDB REST API (super fast & reliable in Node environment)
  try {
    const dbUrl = "https://moodify-b867b-default-rtdb.asia-southeast1.firebasedatabase.app/songs.json";
    const res = await fetch(dbUrl, {
      signal: AbortSignal.timeout(3000), // 3 second timeout
      cache: 'no-store'
    });

    if (res.ok) {
      const songsData = await res.json();
      if (songsData) {
        songsList = Object.keys(songsData)
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
          .sort((a, b) => a.no - b.no);
      }
    }
  } catch (dbError) {
    console.warn("⚠️ RTDB REST fetch failed or timed out, trying local CSV dataset:", dbError.message);
  }

  // 2. Fallback to local CSV dataset if RTDB returned empty
  if (songsList.length === 0) {
    songsList = await getSongsFromCSV();
  }

  if (songsList.length > 0) {
    cachedSongs = songsList;
  }

  return songsList;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const allParam = searchParams.get('all');

    const fullList = await fetchAllSongs();
    const total = fullList.length;

    if (allParam === 'true' || limitParam === 'all') {
      return NextResponse.json({ success: true, songs: fullList, total, hasMore: false });
    }

    const limit = limitParam ? parseInt(limitParam) || 100 : 100;
    const offset = offsetParam ? parseInt(offsetParam) || 0 : 0;

    const sliced = fullList.slice(offset, offset + limit);
    const hasMore = offset + sliced.length < total;

    return NextResponse.json({
      success: true,
      songs: sliced,
      total,
      hasMore,
      limit,
      offset
    });
  } catch (error) {
    console.error("❌ Error Fetching Songs:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
