# Gym Hipertrofi

Aplikasi web (PWA) untuk mencatat latihan hipertrofi: timer set (TUT) dan timer jeda, estimasi fatigue, dan saran deload.
Data tersimpan di perangkat (IndexedDB), tanpa server dan tanpa akun. Estimasi fatigue dan deload adalah heuristik, bukan saran medis.

## Struktur

| Jalur | Isi |
|---|---|
| `docs/` | Aplikasi web yang dipublikasikan (HTML, CSS, JS murni, tanpa build). |
| `fatigue.ts`, `fatigue.test.ts` | Sumber engine fatigue dan deload beserta 30 tes. |
| `docs/fatigue.js` | Hasil konversi `fatigue.ts` untuk browser. Jangan diedit tangan. |
| `docs/exdb.js` | Daftar 477 gerakan (hasil `tools/build-exdb.mjs`). Jangan diedit tangan. |
| `tools/` | Skrip pembuat `fatigue.js`, `exdb.js`, dan ikon. |
| `DESAIN_APP_GYM_HIPERTROFI.md` | Dokumen desain lengkap. |

## Menjalankan di komputer

```powershell
python -m http.server 8123 --directory docs
```

Buka `http://127.0.0.1:8123`. Untuk menguji dari iPhone di jaringan Wi-Fi yang sama, buka `http://<IP komputer>:8123`
(service worker dan "Tambah ke Layar Utama" hanya aktif lewat HTTPS, jadi uji penuh dilakukan setelah dipublikasikan).

## Mengubah engine fatigue

Edit `fatigue.ts`, lalu jalankan:

```powershell
node --test fatigue.test.ts
node tools/build-engine.mjs
```

Naikkan `VERSION` di `docs/sw.js` setiap kali berkas aplikasi berubah agar cache offline diperbarui.

## Publikasi gratis lewat GitHub Pages

1. Buat repositori baru di GitHub, lalu unggah isi folder ini.
2. Di repositori: Settings, Pages, Build and deployment: Source "Deploy from a branch", Branch `main`, folder `/docs`, lalu Save.
3. Setelah beberapa menit, alamatnya muncul: `https://<nama-pengguna>.github.io/<nama-repositori>/`.
4. Di iPhone, buka alamat itu di Safari, ketuk Bagikan, lalu Tambah ke Layar Utama.

## Catatan iPhone

- Layar dijaga tetap menyala selama sesi (Screen Wake Lock) agar timer dan bunyi tetap berjalan.
- Bunyi jeda selesai mengikuti tombol senyap iPhone. Safari di iPhone tidak mendukung getar.
- Buat cadangan lewat Pengaturan, Ekspor cadangan. Safari dapat menghapus data situs yang lama tidak dibuka.

## Sumber data gerakan

Daftar gerakan dan fotonya berasal dari [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (lisensi Unlicense, domain publik).
Hanya metadata ringkas yang disimpan di repositori. Foto dimuat dari CDN jsDelivr saat dilihat, lalu di-cache service worker.
Untuk memperbarui daftar, unduh `dist/exercises.json` dari repositori itu lalu jalankan `node tools/build-exdb.mjs <jalur-berkas>`.
