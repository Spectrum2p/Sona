import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get, update } from 'firebase/database';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) return NextResponse.json({ success: false, error: "UserId dibutuhkan" }, { status: 400 });

  try {
    const profileRef = ref(db, `users/${userId}/profile`);
    const snapshot = await get(profileRef);

    if (!snapshot.exists()) {
      return NextResponse.json({ success: false, error: "Profil belum diisi" }, { status: 404 });
    }

    return NextResponse.json({ success: true, profile: snapshot.val() });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId, fullName, birthDate, gender, preferredGenre, bio } = await request.json();

    if (!userId) return NextResponse.json({ success: false, error: "UserId dibutuhkan" }, { status: 400 });

    const profileRef = ref(db, `users/${userId}/profile`);
    const updatedProfile = {
      fullName: fullName || "",
      birthDate: birthDate || "",
      gender: gender || "Laki-laki",
      preferredGenre: preferredGenre || "pop",
      bio: bio || "",
      updatedAt: new Date().toISOString()
    };

    await update(profileRef, updatedProfile);

    return NextResponse.json({ success: true, message: "Profil berhasil diperbarui", profile: updatedProfile });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
