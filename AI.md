# Sistem AI Jupiter

AI yang bisa diatur penuh lewat slash command: personality, nama, channel, bahasa, panjang jawaban, dan lainnya.
Semua setting disimpan **per server**.

## Setup cepat

1. Ambil API key gratis di <https://aistudio.google.com/apikey>, lalu isi di `.env`:
   ```
   GEMINI_API_KEY=isi_key_kamu
   ```
   (Boleh banyak key: `GEMINI_API_KEYS=key1,key2` supaya otomatis pindah kalau kena limit.)
   Tanpa key, AI tetap jalan lewat fallback Pollinations, tapi kurang stabil.
2. Jalankan `npm install` lalu restart bot.
3. Di server: `/ai panel` → pilih personality, nyalakan **AI Aktif**. Selesai.

## Cara memanggil AI

| Cara | Syarat |
|---|---|
| Mention bot / reply ke jawaban AI | Trigger `Mention` atau `Mention + Channel AI` |
| Ngobrol bebas di channel AI | Trigger `Channel AI` atau `Mention + Channel AI` (atur via `/ai channel tambah`) |
| `/tanya pertanyaan:` (bisa kirim gambar) | AI aktif |

Di channel AI, awali pesan dengan `//` kalau mau ngobrol antar-member tanpa dijawab AI.
Pesan berawalan prefix bot (mis. `a!ping`) tidak pernah dijawab AI.

## Command admin (`/ai`, butuh izin Manage Server)

| Command | Fungsi |
|---|---|
| `/ai panel` | Dashboard interaktif: semua pengaturan di satu pesan |
| `/ai status` | Lihat semua pengaturan |
| `/ai aktif nilai:` | Nyala/mati |
| `/ai personality preset:` | Pilih preset (Ramah, Gaul, Formal, Sarkas, Tsundere, Kakak Mentor, Sahabat Curhat, Teman Gaming, Custom) |
| `/ai tulis-persona` | Form: nama AI, personality custom, info server |
| `/ai channel tambah/hapus/daftar` | Atur channel AI |
| `/ai set ...` | Ubah banyak hal sekaligus: nama, trigger, bahasa, panjang, gaya (teks/embed), kreativitas, memori, cooldown, konteks, emoji, gambar, role akses |
| `/ai preview` | Coba ngobrol dengan setting sekarang |
| `/ai reset-memori` | Hapus ingatan percakapan |
| `/ai reset-config` | Kembalikan ke default |

### Info server
Di `/ai tulis-persona` ada kolom **Info server**. Isi aturan, channel penting, nama staff, jadwal event, dll.
AI akan memakainya sebagai rujukan sehingga bisa menjawab pertanyaan seputar server kamu.

## Penjelasan setting

- **Kreativitas** (0.1–1.5): rendah = konsisten, tinggi = lebih bebas.
- **Memori**: jumlah giliran tanya-jawab yang diingat per user per channel (disimpan di RAM, hilang saat bot restart atau idle 30 menit).
- **Konteks channel**: berapa pesan terakhir di channel yang ikut dibaca AI (0 = mati).
- **Cooldown**: jeda antar pesan per user.
- **Baca gambar**: AI bisa menanggapi gambar PNG/JPG/WEBP (maks 4 MB, hanya dengan Gemini).
- **Role akses**: batasi pemakaian AI hanya untuk role tertentu (admin tetap bisa).

## Environment (opsional)

```
GEMINI_MODEL=gemini-2.5-flash   # ganti model sesuai kebutuhan
AI_FALLBACK=true                # false = matikan fallback Pollinations
AI_MAX_CONCURRENT=5             # batas permintaan AI bersamaan
AI_TIMEOUT_MS=30000
```

## Keamanan bawaan

- Output dibersihkan dari `@everyone`, `@here`, dan mention role/user; balasan tidak pernah ping siapa pun.
- Aturan keselamatan ditaruh di prompt sistem dan tidak bisa diubah oleh pesan user.
- Cooldown per user + batas permintaan bersamaan melindungi kuota API.
