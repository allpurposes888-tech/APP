# Dokumen Desain: Aplikasi Pencatat Latihan Hipertrofi

Nama kerja: **RepLog**. Versi dokumen 1.0, 19 November 2026.

> **Disclaimer.** Skor fatigue, readiness, dan rekomendasi deload di aplikasi ini adalah **estimasi heuristik** dari data latihan dan isian pengguna. Semuanya bukan diagnosis dan bukan saran medis. Belum ada validasi ilmiah bahwa skor ini memprediksi cedera atau overreaching. Pengguna selalu bisa menolak, menunda, atau mengubah rekomendasi. Nyeri yang menetap sebaiknya diperiksakan ke tenaga kesehatan.

---

## Daftar isi

1. Ringkasan visi
2. Keputusan desain kunci dan resolusi konflik
3. Landasan sains (ringkas)
4. Fitur dan prioritas: MVP vs Later
5. Alur layar dan wireframe teks
6. Model data
7. Spesifikasi timer
8. Spesifikasi algoritma fatigue dan deload
9. Tech stack dan arsitektur
10. Roadmap implementasi
11. Risiko dan pertanyaan terbuka
12. Referensi
13. Lampiran: proses kerja sub-agen

---

## 1. Ringkasan visi

RepLog adalah pencatat latihan beban untuk orang yang berlatih demi **hipertrofi**. Aplikasi ini dibangun di atas tiga janji:

1. **Mencatat secepat mengangkat.** Satu set tercatat dalam 1 sampai 3 ketukan dengan satu tangan. Nilai sesi sebelumnya sudah terisi, jadi pengguna hanya mengoreksi yang berbeda.
2. **Waktu yang bisa dipercaya.** Stopwatch durasi set (TUT) dan timer jeda yang otomatis mulai, tetap berbunyi dan bergetar walau layar mati, dan tidak hilang walau aplikasi ditutup paksa.
3. **Asisten yang menjelaskan dirinya.** Skor fatigue 0-100 per otot, per sesi, dan per minggu, serta rekomendasi deload berbasis pemicu. Setiap angka bisa diketuk untuk melihat "mengapa angkanya segini". Tidak ada kotak hitam.

**Pengguna sasaran:** lifter tingkat pemula-lanjut sampai menengah yang sudah punya program (atau ingin menyusunnya) dan berlatih 3-6 kali seminggu.

**Di luar cakupan:** pelatihan powerlifting/peaking, nutrisi, dan sosial/kompetisi. Aplikasi juga tidak memberi diagnosis cedera.

---

## 2. Keputusan desain kunci dan resolusi konflik

Bagian ini mencatat keputusan arsitek setelah meninjau keluaran keempat sub-agen (sains, UX, data, algoritma), termasuk konflik di antara mereka.

| # | Topik | Usulan yang bertentangan | Keputusan final | Alasan |
|---|---|---|---|---|
| K1 | Model beban akut:kronis | Algoritma: EWMA harian 7/28 hari | **Jendela bergulir**: akut = total ESL 7 hari; kronis = rata-rata ESL per minggu pada 28 hari **sebelum** jendela akut | EWMA harian berosilasi menurut hari dalam pekan. Pada pola Senin/Rabu/Jumat, skor dada 69 pada Jumat turun menjadi 45 pada Minggu, sehingga pemicu "fatigue tinggi 5 dari 7 hari" hampir mustahil terpenuhi. Jendela yang tidak tumpang tindih juga menghindari *mathematical coupling* (Lolli et al.). Tes baru membuktikan skor stabil di ketujuh hari. |
| K2 | Kapan timer jeda mulai | UX: saat "Simpan" (setelah input). Data: reducer mulai saat `SAVE_SET` | **Jeda mulai saat SELESAI SET** (`ended_at`). Input reps/beban/RIR muncul sebagai sheet di atas countdown | Lebih akurat secara fisiologis. `rest_seconds_actual = next.started_at - prev.ended_at` jadi konsisten. Waktu mengisi input tidak lagi "mencuri" waktu istirahat. |
| K3 | Foreground service Android | UX: foreground service. Data: tidak perlu | **Tanpa foreground service di MVP.** Pakai notifikasi lokal terjadwal untuk akhir jeda, ditambah notifikasi *ongoing* chronometer yang dirender sistem dari timestamp | Lebih sederhana, menghindari kebijakan tipe FGS Android 14, dan akurasinya sama karena timer berbasis timestamp. |
| K4 | Drop set | Algoritma: hitung penuh. Data: bobot 0,5 | **Drop set = 0,5 × ESL** | Drop set adalah lanjutan set induk. Menghitungnya penuh akan menggelembungkan volume. |
| K5 | Bobot subjektif | Sains: subjektif ~40% (Saw et al. 2016: ukuran subjektif lebih responsif) | **Default 70% objektif / 30% subjektif**, dapat diatur 50-80% | Engine tetap jalan tanpa check-in. Bobot 40% dijadikan opsi kalibrasi (pertanyaan terbuka Q3). |
| K6 | Item check-in | UX: "nyeri sendi/otot" satu baris. Algoritma: soreness dan jointPain terpisah | **Empat baris**: Tidur, Pegal otot, Nyeri sendi, Motivasi. Tiap baris berupa 5 chip yang dipetakan ke 1-5 | Tipe deload (*volume* vs *intensity*) bergantung pada pemisahan nyeri sendi dari pegal otot. |
| K7 | Preskripsi deload | UX: "volume -40%, beban -10%, RIR 4" | **Dua tipe baku** (§8.8): *Volume* (set -50%, beban tetap, RIR ≥3) dan *Intensity* (beban -12,5%, set -30%, RIR ≥2) | Konsisten dengan engine dan bisa diuji. |
| K8 | Rest pendek | Sains: relatif (<60% rest target). Algoritma: absolut | **Absolut**: <60 dtk ×1,10; 60-89 dtk ×1,05 | Lebih sederhana dan transparan. Ambang 60 dtk konsisten dengan bukti bahwa rest <60 dtk tampak merugikan. Mode relatif masuk Later. |
| K9 | Stack | Rekomendasi awal: PWA atau RN/Flutter | **React Native (Expo dev build) + expo-sqlite + Drizzle** | PWA gagal pada syarat inti: notifikasi jeda saat layar mati di iOS. RN dipilih atas Flutter karena engine fatigue TypeScript bisa dibagi ke backend sync nanti. |
| K10 | TUT | - | **Opsional, satu ketukan.** Tanpa TUT, set tetap tercatat dan skor tetap jalan | Bukti menunjukkan durasi repetisi 0,5-8 dtk setara untuk hipertrofi. TUT berguna sebagai pencatat konsistensi tempo, bukan target. |
| K11 | Deload saat data sedikit | UX: risiko deload dipicu data minim | Pemicu reaktif butuh data minimum (tren ≥4 sesi, drift ≥6 set). Skor dengan riwayat <14 hari diberi label *kepercayaan rendah*, dan UI tidak menampilkan banner deload reaktif selama status ini | Mencegah alarm palsu di minggu-minggu awal. |

---

## 3. Landasan sains (ringkas)

Kepastian ditandai **T** (tinggi), **S** (sedang), atau **R** (rendah). Item bertanda **[perlu verifikasi]** wajib dicek ke sumber primer sebelum dikutip di aplikasi. Sub-agen riset menjawab dari pengetahuan internal tanpa pencarian basis data. Tidak ada sitasi yang dikarang, tetapi detail angka dan tahun belum dicek ulang.

### 3.1 Hipertrofi

| Variabel | Ringkasan bukti | Default aplikasi | Kepastian |
|---|---|---|---|
| Volume mingguan per otot | Hubungan dosis-respons positif dengan hasil yang menurun (*diminishing returns*) (Schoenfeld, Ogborn & Krieger 2017; Pelland et al. 2024/2025 [perlu verifikasi]). Zona produktif umum 10-20 hard set/minggu | Mulai 8-12 hard set/otot/minggu (pemula 6-10); rentang atur 4-20+ | T untuk arah, S untuk angka |
| Kedekatan ke failure | Failure vs non-failure tidak berbeda signifikan (Refalo et al. 2023). Hubungan positif lemah-sedang, efeknya menurun mendekati failure (Robinson et al. 2024 [perlu verifikasi detail]) | Target RIR 1-2; isolasi 0-1; compound berat 2-3 | S |
| Rest antar set | Rest 3 menit lebih baik daripada 1 menit (Schoenfeld et al. 2016, sampel kecil). Rest <60 dtk tampak merugikan, di atasnya perbedaan tidak jelas (Singer et al. 2024 [perlu verifikasi]) | Compound 2-3 menit; isolasi 1,5-2 menit | S |
| Tempo/TUT | Durasi repetisi 0,5-8 dtk setara; >10 dtk/rep kemungkinan inferior (Schoenfeld, Ogborn & Krieger 2015) | Tidak ada target TUT; peringatan bila <0,5 atau >8 dtk/rep | S-T |
| Frekuensi | Dengan volume disamakan, frekuensi tidak berpengaruh signifikan (Schoenfeld et al. 2019 [perlu verifikasi tahun]). Frekuensi lebih berperan mendistribusikan volume | 2x/minggu per otot (boleh 1-3) | S |
| Akurasi RIR | Estimasi RIR subjektif meleset, terutama jauh dari failure dan pada pemula (Steele et al. 2017 [perlu verifikasi]; Zourdos et al. 2016) | Input RIR berupa chip 0/1/2/3/4/5+; RPE dikonversi | S |

### 3.2 Fatigue dan deload: apa yang bisa dan tidak bisa disimpulkan

- **ACWR** (Gabbett 2016). Ambang 0,8-1,3/1,5 berasal dari olahraga tim dan dikritik secara metodologis (Impellizzeri et al. 2020; Lolli et al. 2019 tentang *coupling*). Versi EWMA: Williams et al. 2017. **Kesimpulan:** ACWR dipakai hanya sebagai **indikator lonjakan beban relatif terhadap kebiasaan pribadi**, bukan prediktor cedera. (T)
- **Session-RPE, monotony, strain** (Foster 1998; Foster et al. 2001). Murah dan berguna sebagai beban internal. Untuk latihan beban, durasi sesi didominasi waktu istirahat. **Kesimpulan:** hanya metrik pendukung di dashboard, bukan pemicu deload. (R-S)
- **Readiness subjektif.** Ukuran subjektif umumnya lebih responsif daripada ukuran objektif terhadap perubahan beban (Saw, Main & Gastin 2016). **Kesimpulan:** check-in 4 item menjadi komponen utama subjektif. (T-S)
- **e1RM.** Epley/Brzycki kurang akurat di atas ~10-12 repetisi. **Kesimpulan:** dipakai sebagai **tren** per latihan, hanya untuk set ≤12 rep, dengan penyesuaian RIR (reps + RIR) sesuai pendekatan RPE-RIR (Zourdos et al. 2016; Helms et al. 2016). (S)
- **Deload.** Praktik umum adalah sekitar 1 minggu, mengurangi volume dan/atau intensitas, terjadwal atau reaktif. Dasarnya survei/konsensus pelatih (Bell et al. 2022/2023 [perlu verifikasi]), bukan eksperimen. Satu studi menemukan deload 1 minggu tidak merugikan hipertrofi atau kekuatan dibanding latihan kontinu (Coleman et al. 2024 [perlu verifikasi detail]). **Kesimpulan:** deload aman, tetapi **tidak terbukti meningkatkan** hipertrofi. Karena itu deload disajikan sebagai **rekomendasi**, bukan keharusan, dan interval proaktif 4-8 minggu adalah praktik, bukan hasil RCT. (T untuk "tidak terbukti wajib")

---

## 4. Fitur dan prioritas: MVP vs Later

### 4.1 MVP (rilis 1)

| Area | Fitur |
|---|---|
| Program | Builder: program → hari → latihan; target set, rentang rep, beban, RIR, rest per latihan (default otomatis compound 3:00 / isolasi 1:30-2:00); urut ulang; satu program aktif |
| Katalog | Ditanam awal ~80 latihan umum dengan pemetaan otot primer (1,0) dan sekunder (0,5); latihan kustom |
| Sesi aktif | Nilai ghost (sesi lalu atau target), stepper, chip RIR; TUT opsional; jeda otomatis saat SELESAI SET; ±15 dtk dan Lewati; set warm-up; edit/hapus set dengan Urungkan; layar tetap menyala; pemulihan sesi |
| Notifikasi | Notifikasi lokal terjadwal "Jeda selesai" (suara + getar, *time-sensitive* di iOS); notifikasi ongoing chronometer (Android) |
| Readiness | Check-in 4 item (<15 dtk, boleh dilewati); RPE sesi (1 ketukan di ringkasan) |
| Asisten | Skor fatigue per otot, sesi, dan minggu dengan panel "Mengapa?"; status deload *ok/waspada/deload* dengan daftar pemicu (nilai aktual vs ambang); Terima/Tunda/Abaikan/Atur sendiri; terapkan deload ke rencana minggu depan |
| Riwayat | Daftar sesi, detail set (bisa diedit), grafik per latihan (beban terbaik, e1RM, volume mingguan per otot) |
| Data | Lokal saja (SQLite terenkripsi), ekspor JSON/CSV, impor JSON |

### 4.2 Later

- **Rilis 2:** superset dan drop set penuh (blok A1/B1), heatmap siluet otot, iOS Live Activities, rest relatif terhadap target, penyetelan ambang/bobot pemicu, template program, progresi beban otomatis (double progression).
- **Rilis 3:** akun dan sinkronisasi multi-perangkat (PowerSync/Supabase), Wear OS/watchOS (MULAI/SELESAI SET dari jam), tombol volume sebagai SELESAI SET, satuan lb, multi-bahasa, kalibrasi bobot skor dari riwayat pribadi.

---

## 5. Alur layar dan wireframe teks

### 5.1 Prinsip satu tangan

- Aksi utama berada di **40% layar bawah** (zona jempol), dengan tinggi 72-96 dp dan selebar layar. Target sentuh minimum 48 dp, jarak antar target ≥8 dp.
- Posisi tombol utama **tidak berubah** di semua state sesi, sehingga memori otot terbentuk.
- Mode gelap default. Angka utama berkontras ≥7:1, timer ≥56 sp dengan font tabular. Status tidak hanya dibedakan lewat warna (ikon + label).
- Tidak ada gestur halus sebagai satu-satunya jalan. Ada opsi "Tombol besar" (+25%).
- Semua aksi bisa diurungkan (snackbar 6 dtk), sehingga dialog konfirmasi tidak diperlukan.

### 5.2 Navigasi

Bottom nav: **Hari Ini · Program · [Latih] · Riwayat · Fatigue**. Tombol tengah lebih menonjol. Selama sesi berlangsung, bottom nav disembunyikan dan diganti bar sesi.

Daftar layar: Onboarding (tujuan, hari latihan, satuan, disclaimer) · Hari Ini · Check-in · Program (daftar → hari → edit latihan) · Pustaka latihan · Sesi Aktif (+ sheet input, ganti latihan, catatan) · Ringkasan sesi · Riwayat (sesi / per latihan) · Dashboard Fatigue (+ detail otot, "Mengapa?") · Rekomendasi Deload · Pengaturan (timer, notifikasi, asisten, privasi, ekspor).

### 5.3 Hari Ini

```
┌──────────────────────────────────┐
│ Kamis, 19 Nov               [⚙]  │
├──────────────────────────────────┤
│ ⚠ Deload disarankan · 2 pemicu   │
│   [Lihat alasan]                 │
├──────────────────────────────────┤
│ SESI HARI INI · Upper B          │
│ 6 latihan · ±65 mnt              │
│ Bench Press 4×6-8 @80 kg · RIR 2 │
│ Barbell Row 4×8-10 · +4 lainnya  │
│ ┌──────────────────────────────┐ │
│ │         MULAI SESI           │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ READINESS  Belum check-in        │
│            [Check-in · 10 dtk]   │
├──────────────────────────────────┤
│ Minggu ini: 3/4 sesi             │
│ Dada 11,6 · Punggung 12,0 set ef.│
├──────────────────────────────────┤
│ Hari Ini│Program│◉Latih│Riwayat│Fatigue│
└──────────────────────────────────┘
```

Check-in tidak memblokir MULAI SESI. Bila readiness < 40, kartu sesi menampilkan saran lembut: "Pertimbangkan -1 set per latihan hari ini", dengan tombol [Terapkan] [Abaikan].

### 5.4 Check-in readiness (target < 15 dtk)

```
┌──────────────────────────────────┐
│ Check-in cepat           [Lewati]│
│ Tidur semalam                    │
│ [<5j][5-6j][6-7j][●7-8j][>8j]    │  → 1..5
│ Pegal otot                       │
│ [Berat][Sedang][●Ringan][Sedikit][Tidak] │ → 1..5
│ Nyeri sendi                      │
│ [Berat][Sedang][Ringan][Sedikit][●Tidak] │ → 1..5
│   └ bila ≤ Ringan: [Bahu][Siku][Lutut][Pinggang]… │
│ Motivasi                         │
│ [1][2][●3][4][5]                 │
│ ┌──────────────────────────────┐ │
│ │           SIMPAN             │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

Nilai awal diambil dari kemarin (ghost). Pada skala 1-5, nilai 5 = terbaik/tanpa nyeri.

### 5.5 Program Builder

```
┌─ Upper/Lower 4x ───────── [⋯] ┐   ┌─ Edit: Bench Press ───────────┐
│ Hari 1 · Upper A   6 latihan >│   │ Set         [−]  4   [+]      │
│ Hari 2 · Lower A   5 latihan >│   │ Rep         [−] 6–8  [+]      │
│ Hari 3 · Upper B   6 latihan >│   │ Beban       [−] 80 kg [+]     │
│ Hari 4 · Lower B   5 latihan >│   │ RIR target  [0][1][●2][3][4]  │
│ [+ Tambah hari] [⇅ Urutkan]   │   │ Jeda        [−] 3:00 [+]      │
└───────────────────────────────┘   │ TUT  [Tanya ▾]  Warm-up [Oto ▾]│
                                    │ Otot: Dada 1,0 · Trisep 0,5 · │
                                    │       Bahu depan 0,5          │
                                    └───────────────────────────────┘
```

### 5.6 Sesi Aktif (layar terpenting)

Mesin state UI: **Siap set → Set berjalan → (Jeda + sheet input) → Siap set berikutnya.**

**A. Siap set**
```
┌──────────────────────────────────┐
│ Upper B  ⏱ 32:10      [Selesai?] │
│ Bench Press (1/6)                │
│ Set  ✓1  ✓2  [●3]  4             │
│ Target 6-8 · 80 kg · RIR 2       │
│ Lalu: 80 kg × 8 @RIR2            │
│ BEBAN  [−]  80  [+]              │
│ REPS   [−]   8  [+]              │
│ ┌──────────────────────────────┐ │
│ │      ▶ MULAI SET (TUT)       │ │
│ └──────────────────────────────┘ │
│ [ ✓ Catat tanpa timer ]          │
└──────────────────────────────────┘
```

**B. Set berjalan (stopwatch TUT)**
```
│ Set 3 berjalan          ● REC    │
│              00:34               │
│ ┌──────────────────────────────┐ │
│ │        ■ SELESAI SET         │ │   (±35% tinggi layar)
│ └──────────────────────────────┘ │
```

**C. Jeda berjalan + sheet input** (jeda sudah mulai sejak SELESAI SET, keputusan K2)
```
│ JEDA  2:41 / 3:00   ▓▓▓▓▓▓░░     │
├──────── sheet ───────────────────┤
│ Set 3 · TUT 0:41                 │
│ Beban [−] 80 [+]   Reps [−] 7 [+]│
│ RIR  [0][●1][2][3][4][5+]        │
│ Tipe [Working ▾]   [+ Drop set]  │
│ ┌──────────────────────────────┐ │
│ │          ✓ SIMPAN            │ │
│ └──────────────────────────────┘ │
```

Bila tidak disentuh selama 20 dtk, sheet turun dan nilai ghost tersimpan dengan tanda "belum dikonfirmasi" (•). Tanda ini bisa dikoreksi di ringkasan.

**D. Jeda (setelah simpan)**
```
│ JEDA                Set 4 berikut│
│               2:12               │
│ ▓▓▓▓▓▓▓░░░░░  (target 3:00)      │
│ [ −15 dtk ]  [ +15 dtk ]  [LEWATI]│
│ Berikut: 80 kg × 6-8             │
│ ┌──────────────────────────────┐ │
│ │       ▶ MULAI SET 4          │ │
│ └──────────────────────────────┘ │
```

Saat jeda selesai, pengguna mendapat getar pendek-panjang, bunyi lembut, dan layar berkedip sekali. Timer lalu menghitung naik ("+0:12 lewat") dengan warna berbeda, tidak dihentikan paksa.

**Mode "Catat tanpa timer":** tombol utama menjadi **✓ SET SELESAI**. Satu ketukan menyimpan nilai ghost dan memulai jeda. Pada skenario sesuai target, ini cukup 1 ketukan per set.

### 5.7 Notifikasi lock-screen

```
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ ◉ Jeda · Bench Press set 3       │   │ ◉ Jeda selesai                   │
│   2:41 (chronometer mundur)      │ → │   Siap set 4                     │
│ [−15s] [+15s] [Lewati]           │   │ [MULAI SET]                      │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

Teks notifikasi **tidak** memuat data sensitif (readiness, nyeri).

### 5.8 Ringkasan pasca-sesi

```
┌──────────────────────────────────┐
│ Sesi selesai · 1j 04m            │
│ 22 set kerja · Volume 9.420 kg   │
│ PR: Bench 80×8 (+1 rep)          │
│ RPE sesi:  [5][6][7][●8][9][10]  │
│ Fatigue sesi 58 · Dada 72 · Bahu 55 │
│ [Mengapa 58?]   • 2 set belum dikonfirmasi [Cek] │
│ ┌──────────────────────────────┐ │
│ │       SIMPAN & SELESAI       │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

### 5.9 Dashboard Fatigue

```
┌──────────────────────────────────┐
│ Fatigue sistemik: 66 (Tinggi)  ⓘ │
│ [Hari ini][Otot][8 minggu]       │
│ Dada     ███████░░ 73  ▲         │
│ Punggung █████░░░░ 52            │
│ Bahu     ██████░░░ 61            │
│ Quad     ████░░░░░ 47  (kepercayaan: sedang) │
│ Tren 8 minggu  ▂▃▄▅▅▆▆█  ┈ 70    │
│ MENGAPA DADA 73?                 │
│  Set efektif 7 hari   15,5       │
│  Rata-rata/minggu     10,8       │
│  Rasio 1,43 → objektif 71,7 ×0,7 = 50,2 │
│  Pegal otot (check-in) 75 ×0,3 = 22,5   │
│ ⓘ Estimasi heuristik, bukan saran medis │
└──────────────────────────────────┘
```

Setiap baris komponen bisa diketuk untuk membuka data mentahnya (daftar set yang membentuk angka tersebut).

### 5.10 Rekomendasi Deload

```
┌──────────────────────────────────┐
│ Deload disarankan · 7 hari       │
│ Pemicu (2 dari 4 reaktif):       │
│ ✓ Fatigue sistemik ≥70: 5/7 hari │
│ ✓ RIR drift −1,2 (ambang −1,0)   │
│ ○ Performa: 1 latihan stagnan (perlu 2) │
│ ○ Readiness 7 hari 52 (ambang <40)│
│ ○ 5,0 minggu sejak deload (jadwal 6) │
│ Usulan (tipe VOLUME):            │
│  Set −50% · beban tetap · RIR ≥3 │
│  Bench 4→2 set @80 kg …  [Lihat] │
│ ┌──────────┐ ┌──────────┐        │
│ │  TERIMA  │ │ TUNDA ▾  │        │
│ └──────────┘ └──────────┘        │
│ [Abaikan]  [Atur sendiri]        │
│ ⓘ Heuristik, bukan saran medis.  │
└──────────────────────────────────┘
```

Opsi Tunda: 3 hari, 1 minggu, atau "ingatkan bila skor naik". Abaikan menanyakan alasan secara opsional (satu chip), yang kelak dipakai untuk kalibrasi. Bila nyeri sendi berat dilaporkan ≥3 hari, aplikasi menampilkan satu kali kartu kontekstual untuk berkonsultasi dengan tenaga kesehatan.

### 5.11 Microcopy dan disclaimer

- Nada saran, bukan perintah: "Skor naik karena set efektif dada +43% dan 3 set sampai failure. Perlu lebih ringan?" Hindari kata menghakimi seperti "overtraining".
- Disclaimer muncul (1) sekali di onboarding, (2) sebagai ikon ⓘ permanen di setiap skor yang membuka "Cara skor dihitung dan batasannya", dan (3) sebagai satu baris footer di Dashboard dan Rekomendasi. Disclaimer **tidak** ditampilkan di Sesi Aktif dan tidak muncul sebagai pop-up berulang.

### 5.12 Metrik UX

- Median waktu mencatat satu set < 5 dtk (< 2 dtk bila sesuai ghost). Ketukan per set ≤3 dengan TUT, ≤2 tanpa TUT.
- Check-in < 15 dtk pada ≥90% kasus. Check-in terisi pada ≥60% hari latihan.
- Akurasi timer < 1 dtk terhadap jam dinding, termasuk saat layar mati. Nol sesi hilang.
- Persentase pengguna yang membuka "Mengapa?" (indikator transparansi), rasio Terima:Abaikan deload, SUS ≥80, retensi minggu ke-4.

---

## 6. Model data

### 6.1 Konvensi

- ID memakai **UUID v7** (`TEXT`), yang terurut waktu dan siap sinkronisasi.
- Waktu disimpan sebagai **epoch ms UTC** (`INTEGER`) + `tz_offset_min`. Hari kalender disimpan eksplisit sebagai `local_date 'YYYY-MM-DD'` (tidak diturunkan ulang, aman saat bepergian lintas zona).
- Setiap tabel yang disinkronkan punya `created_at`, `updated_at`, dan `deleted_at` (soft delete). Konflik nanti diselesaikan dengan last-write-wins per baris.
- Beban dalam kg (`REAL`); konversi lb hanya di UI. Durasi dalam detik.

### 6.2 DDL SQLite

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE user_settings (
  id TEXT PRIMARY KEY,
  weight_unit TEXT NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg','lb')),
  default_rest_compound INTEGER NOT NULL DEFAULT 180,
  default_rest_isolation INTEGER NOT NULL DEFAULT 105,
  tut_mode TEXT NOT NULL DEFAULT 'ask' CHECK (tut_mode IN ('always','ask','never')),
  weekly_target_sets INTEGER NOT NULL DEFAULT 12,        -- baseline cold start engine
  deload_interval_weeks INTEGER NOT NULL DEFAULT 6 CHECK (deload_interval_weeks BETWEEN 4 AND 8),
  objective_weight REAL NOT NULL DEFAULT 0.7 CHECK (objective_weight BETWEEN 0.5 AND 0.8),
  training_start_date TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

CREATE TABLE muscle_group (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,          -- 'chest','lats','quads','front_delts',...
  name TEXT NOT NULL,
  region TEXT CHECK (region IN ('upper','lower','core')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

CREATE TABLE exercise (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('compound','isolation')),
  equipment TEXT,
  default_rest_seconds INTEGER NOT NULL DEFAULT 120,
  load_step_kg REAL NOT NULL DEFAULT 2.5,
  is_main_lift INTEGER NOT NULL DEFAULT 0,   -- dipakai pemicu performa
  is_custom INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

CREATE TABLE exercise_muscle (
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  muscle_id   TEXT NOT NULL REFERENCES muscle_group(id),
  contribution REAL NOT NULL CHECK (contribution IN (0.5, 1.0)),  -- sekunder / primer
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
  PRIMARY KEY (exercise_id, muscle_id)
);
CREATE INDEX ix_em_muscle ON exercise_muscle(muscle_id);

CREATE TABLE program (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, split_type TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

CREATE TABLE program_day (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES program(id),
  name TEXT NOT NULL, position INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX ix_pd_program ON program_day(program_id, position);

CREATE TABLE program_exercise (
  id TEXT PRIMARY KEY,
  program_day_id TEXT NOT NULL REFERENCES program_day(id),
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  position INTEGER NOT NULL,
  superset_group TEXT,                 -- Later: blok A1/B1
  target_sets INTEGER NOT NULL,
  rep_min INTEGER NOT NULL,
  rep_max INTEGER NOT NULL CHECK (rep_max >= rep_min),
  target_load_kg REAL,
  target_rir INTEGER CHECK (target_rir BETWEEN 0 AND 5),
  rest_seconds INTEGER,                -- NULL = exercise.default_rest_seconds
  tempo TEXT,                          -- opsional '3-1-1-0'
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX ix_pe_day ON program_exercise(program_day_id, position);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  program_day_id TEXT REFERENCES program_day(id),   -- NULL = sesi bebas
  started_at INTEGER NOT NULL, ended_at INTEGER,
  tz_offset_min INTEGER NOT NULL, local_date TEXT NOT NULL,
  session_rpe REAL CHECK (session_rpe BETWEEN 0 AND 10),  -- CR-10 Foster
  deload_event_id TEXT REFERENCES deload_event(id),        -- sesi bagian dari deload
  notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX ix_session_date ON session(local_date);

CREATE TABLE set_log (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id),
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  program_exercise_id TEXT REFERENCES program_exercise(id),
  parent_set_id TEXT REFERENCES set_log(id),   -- drop set menunjuk set induk
  exercise_order INTEGER NOT NULL,
  set_index INTEGER NOT NULL,
  set_type TEXT NOT NULL CHECK (set_type IN ('warmup','working','drop')),
  started_at INTEGER,                  -- MULAI SET (NULL bila tanpa timer)
  ended_at INTEGER,                    -- SELESAI SET = awal jeda
  tut_seconds REAL GENERATED ALWAYS AS
    (CASE WHEN started_at IS NOT NULL AND ended_at IS NOT NULL
          THEN (ended_at - started_at) / 1000.0 END) VIRTUAL,
  rest_before_seconds INTEGER,         -- = started_at(set ini) - ended_at(set sebelumnya)
  rest_target_seconds INTEGER,
  reps INTEGER, load_kg REAL,
  rir INTEGER CHECK (rir BETWEEN 0 AND 5),   -- 5 = "5+"
  rpe REAL CHECK (rpe BETWEEN 1 AND 10),
  target_rir INTEGER, target_load_kg REAL,   -- salinan target saat set dibuat (untuk RIR drift)
  confirmed INTEGER NOT NULL DEFAULT 1,      -- 0 = ghost yang belum dikonfirmasi
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX ix_setlog_session ON set_log(session_id, exercise_order, set_index);
CREATE INDEX ix_setlog_exercise_time ON set_log(exercise_id, ended_at);

CREATE TABLE readiness_checkin (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL, checked_at INTEGER NOT NULL, tz_offset_min INTEGER NOT NULL,
  sleep INTEGER NOT NULL CHECK (sleep BETWEEN 1 AND 5),
  soreness INTEGER NOT NULL CHECK (soreness BETWEEN 1 AND 5),     -- 5 = tidak pegal
  joint_pain INTEGER NOT NULL CHECK (joint_pain BETWEEN 1 AND 5), -- 5 = tanpa nyeri
  motivation INTEGER NOT NULL CHECK (motivation BETWEEN 1 AND 5),
  pain_areas TEXT,                     -- JSON ['shoulder_r','knee_l']
  muscle_soreness TEXT,                -- JSON opsional {muscle_slug: 1..5}
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE UNIQUE INDEX ux_checkin_date ON readiness_checkin(local_date) WHERE deleted_at IS NULL;

-- Cache turunan: boleh dibuang dan dihitung ulang; TIDAK disinkronkan
CREATE TABLE fatigue_snapshot (
  scope TEXT NOT NULL CHECK (scope IN ('muscle','systemic')),
  muscle_id TEXT,                      -- NULL untuk systemic
  local_date TEXT NOT NULL,
  acute REAL, chronic REAL, objective_score REAL, subjective REAL,
  fatigue_score REAL NOT NULL, confidence TEXT NOT NULL,
  explanation_json TEXT NOT NULL,
  engine_version INTEGER NOT NULL, computed_at INTEGER NOT NULL,
  PRIMARY KEY (scope, muscle_id, local_date)
);

CREATE TABLE deload_event (
  id TEXT PRIMARY KEY,
  suggested_at INTEGER NOT NULL,
  trigger_ids TEXT NOT NULL,           -- JSON ['systemic_fatigue','rir_drift',...] atau ['manual']
  decision_json TEXT NOT NULL,         -- salinan DeloadDecision (nilai aktual vs ambang)
  deload_type TEXT CHECK (deload_type IN ('volume','intensity','custom')),
  starts_on TEXT, ends_on TEXT,        -- local_date
  status TEXT NOT NULL CHECK (status IN ('suggested','accepted','postponed','ignored','completed')),
  postponed_until TEXT, ignore_reason TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);

-- Lokal saja: satu baris status timer
CREATE TABLE timer_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  phase TEXT NOT NULL CHECK (phase IN ('idle','set_running','resting')),
  session_id TEXT, set_log_id TEXT,
  phase_started_at INTEGER, target_end_at INTEGER,
  notification_id TEXT, updated_at INTEGER NOT NULL
);
```

### 6.3 Pemetaan ke input engine

Engine (`fatigue.ts`) murni dan tidak tahu tentang DB. Lapisan repository memetakan data sebagai berikut:

- `set_log` + `session.local_date` → `SetLog { date, exerciseId, setType, reps, loadKg, rir, rpe, targetRir, targetLoadKg, tutSeconds, restBeforeSeconds }`. Set dengan `confirmed = 0` tetap dihitung, tetapi `rir`-nya diperlakukan sebagai `null` (fallback ke target). Akibatnya RIR drift tidak dicemari oleh nilai ghost.
- `exercise` + `exercise_muscle` → `Exercise { id, isMain, muscles[] }`.
- `readiness_checkin` → `ReadinessCheckin`. `session` → `SessionLog { date, sessionRpe, durationMinutes }`.

---

## 7. Spesifikasi timer

### 7.1 Prinsip

1. **Berbasis timestamp, bukan tick.** Sumber kebenarannya adalah `started_at`, `ended_at`, dan `target_end_at` di SQLite. UI hanya merender `Date.now() - t0` setiap 250 ms. Interval boleh mati kapan saja tanpa kehilangan data.
2. **Persist dulu, baru UI.** Setiap transisi ditulis ke DB dalam transaksi sebelum state UI berubah.
3. **Getar saat layar mati berasal dari notifikasi OS**, bukan dari kode JS (JS dibekukan di background).

### 7.2 Mesin state

```
           START_SET                 END_SET (= mulai jeda, K2)
  idle ───────────────▶ set_running ─────────────────────────▶ resting
   ▲                                                            │  │
   │  LOG_WITHOUT_TIMER (ended_at = now, langsung jeda) ────────┘  │
   │                                                               │
   └──────────── START_SET berikutnya / SKIP_REST / REST_DONE ◀────┘
     (sheet input reps/beban/RIR = overlay UI selama resting, bukan state timer)
```

```ts
type Phase = 'idle' | 'set_running' | 'resting';
interface TimerState { phase: Phase; sessionId?: string; setLogId?: string;
  phaseStartedAt?: number; targetEndAt?: number; notificationId?: string }
type Event =
  | { type: 'START_SET'; setLogId: string; now: number }
  | { type: 'END_SET'; restSeconds: number; now: number }
  | { type: 'LOG_WITHOUT_TIMER'; setLogId: string; restSeconds: number; now: number }
  | { type: 'ADJUST_REST'; deltaSec: number }
  | { type: 'SKIP_REST' } | { type: 'REST_DONE' };
type Effect =
  | { kind: 'writeSet'; field: 'started_at' | 'ended_at'; at: number }
  | { kind: 'writeRestBefore'; setLogId: string; at: number } // rest aktual set sebelumnya
  | { kind: 'scheduleRest'; at: number } | { kind: 'cancelRest' }
  | { kind: 'haptic'; style: 'light' | 'success' };

export function reduce(s: TimerState, e: Event): { state: TimerState; effects: Effect[] } {
  switch (e.type) {
    case 'START_SET': {
      if (s.phase === 'set_running') break;
      const fx: Effect[] = [{ kind: 'writeSet', field: 'started_at', at: e.now },
                            { kind: 'writeRestBefore', setLogId: e.setLogId, at: e.now },
                            { kind: 'haptic', style: 'light' }];
      if (s.phase === 'resting') fx.unshift({ kind: 'cancelRest' });
      return { state: { phase: 'set_running', setLogId: e.setLogId, phaseStartedAt: e.now }, effects: fx };
    }
    case 'END_SET': {
      if (s.phase !== 'set_running') break;
      const at = e.now + e.restSeconds * 1000;
      return { state: { ...s, phase: 'resting', phaseStartedAt: e.now, targetEndAt: at },
               effects: [{ kind: 'writeSet', field: 'ended_at', at: e.now },
                         { kind: 'scheduleRest', at }, { kind: 'haptic', style: 'light' }] };
    }
    case 'LOG_WITHOUT_TIMER': {
      const at = e.now + e.restSeconds * 1000;
      return { state: { phase: 'resting', setLogId: e.setLogId, phaseStartedAt: e.now, targetEndAt: at },
               effects: [...(s.phase === 'resting' ? [{ kind: 'cancelRest' } as Effect] : []),
                         { kind: 'writeSet', field: 'ended_at', at: e.now }, { kind: 'scheduleRest', at }] };
    }
    case 'ADJUST_REST':
      if (s.phase !== 'resting') break;
      return { state: { ...s, targetEndAt: s.targetEndAt! + e.deltaSec * 1000 },
               effects: [{ kind: 'cancelRest' }, { kind: 'scheduleRest', at: s.targetEndAt! + e.deltaSec * 1000 }] };
    case 'SKIP_REST':
      if (s.phase !== 'resting') break;
      return { state: { phase: 'idle' }, effects: [{ kind: 'cancelRest' }] };
    case 'REST_DONE':
      if (s.phase !== 'resting') break;
      return { state: { ...s, phase: 'idle' }, effects: [{ kind: 'haptic', style: 'success' }] };
  }
  return { state: s, effects: [] };   // event tak valid di fase ini: abaikan
}
```

Reducer ini murni dan diuji dengan unit test (jam di-inject). Efek dieksekusi oleh adapter platform.

### 7.3 Notifikasi dan platform

| Kebutuhan | Android | iOS |
|---|---|---|
| Akhir jeda saat layar mati | Notifikasi lokal terjadwal (`expo-notifications`), channel `rest-timer` importance HIGH, pola getar; exact alarm (`SCHEDULE_EXACT_ALARM`, fallback `setExactAndAllowWhileIdle`) | Notifikasi lokal `interruptionLevel: timeSensitive`, suara kustom <30 dtk |
| Countdown tampil di lock screen | Notifikasi ongoing `setUsesChronometer` + `setChronometerCountDown` (modul native kecil) | MVP: hanya notifikasi akhir. **Rilis 2:** Live Activities (`Text(timerInterval:)`) |
| Stopwatch TUT | Notifikasi ongoing chronometer naik | Ditampilkan hanya in-app (set biasanya < 90 dtk) |
| Layar tetap menyala | `expo-keep-awake` selama sesi (bisa dimatikan) | sama |
| Haptics | `expo-haptics` di foreground | sama |

**Aturan tambahan:**

- Setiap transisi yang meninggalkan `resting` **wajib** memanggil `cancelRest` (tanpa notifikasi yatim). `notification_id` disimpan di `timer_state`.
- Bila notifikasi tiba saat aplikasi di foreground, banner ditekan dan diganti haptic + suara in-app.
- **Pemulihan:** saat aplikasi aktif atau setelah dibunuh, `hydrate()` membaca `timer_state`. Bila `resting` dan `now ≥ target_end_at`, state berubah ke `REST_DONE` tanpa spam getar. Bila `set_running` > 10 menit, aplikasi menawarkan "Set ini masih berjalan?".
- **OEM Android** (Xiaomi/Oppo/Vivo/Realme, umum di Indonesia) agresif mematikan aplikasi. Onboarding menyertakan langkah "izinkan autostart / abaikan optimasi baterai", plus tes notifikasi 10 detik.
- Set < 5 dtk memicu konfirmasi ringan ("Tersentuh tidak sengaja?").

---

## 8. Spesifikasi algoritma fatigue dan deload

Implementasi ada di `fatigue.ts` (TypeScript murni, tanpa dependensi). Tes di `fatigue.test.ts` berisi **30 tes, semua lulus** (`node --test fatigue.test.ts`, Node 26). Semua parameter terkumpul di `PARAMS`, `DELOAD_PARAMS`, dan `DELOAD_PRESCRIPTION`.

### 8.1 Gambaran pipeline

```
SetLog ─▶ ESL per set ─▶ beban harian per otot ─▶ akut (7 hr) & kronis (28 hr sebelumnya)
                                                         │
                                         objektif otot = clamp(50 × akut/kronis, 0, 100)
Check-in ─▶ readiness (rata-rata 3 hr) ─┐                │
                                        ├─▶ fatigue otot = 0,7·objektif + 0,3·pegal
                                        └─▶ fatigue sistemik = 0,7·Σ(objektif·bobot kronis) + 0,3·(100−readiness)
Set kerja ─▶ e1RM ─▶ tren latihan utama ┐
Set kerja ─▶ RIR drift ─────────────────┼─▶ evaluateDeload ─▶ ok / waspada / deload + tipe + durasi
Riwayat sistemik 7 hr, readiness 7 hr ──┤
Tanggal deload terakhir ────────────────┘
```

### 8.2 Effective Set Load (ESL) per set

Hanya set `working` dan `drop` yang dihitung (warm-up = 0).

**RIR yang dipakai:** `rir` → `10 − rpe` → `targetRir` → default 2.

**Bobot RIR (stimulus):**

| RIR | 0 | 1 | 2 | 3 | 4 | ≥5 |
|---|---|---|---|---|---|---|
| bobot | 1,0 | 1,0 | 0,9 | 0,75 | 0,5 | 0,25 |

**Pengali fatigue** (dikalikan, lalu dibatasi maksimum **1,3**):

| Kondisi | Pengali | Rasional |
|---|---|---|
| RIR 0 (failure) | ×1,15 | Failure menambah fatigue lebih besar daripada tambahan stimulusnya |
| Rest sebelum set < 60 dtk | ×1,10 | Rest pendek menambah kelelahan dalam sesi |
| Rest 60-89 dtk | ×1,05 | |
| TUT/rep > 6 dtk | ×1,05 | Tempo sangat lambat |

`ESL = bobotRIR × min(1,3, Π pengali) × faktorTipe` dengan faktorTipe = 1 untuk working dan **0,5 untuk drop** (K4).

**Volume load** (reps × beban) hanya dilaporkan sebagai informasi dan dipakai untuk e1RM. Volume load tidak masuk skor karena bias ke latihan berbeban besar dan tidak bisa dibandingkan antar latihan.

> Bobot RIR dan pengali adalah **heuristik desain**, bukan angka dari literatur. Arahnya konsisten dengan bukti (set jauh dari failure memberi stimulus lebih kecil; fatigue naik tidak linear mendekati failure).

### 8.3 Beban per otot dan skor objektif

```
beban_harian[otot][hari] = Σ ESL(set) × kontribusi(latihan, otot)      // primer 1,0 / sekunder 0,5
akut   = Σ beban_harian hari ke-0..6                                   // "set efektif minggu ini"
kronis = (Σ beban_harian hari ke-7..34 / n_hari) × 7                   // rata-rata per minggu, tidak tumpang tindih
ACWR   = akut / kronis
objektif = clamp(50 × ACWR, 0, 100)
```

- **50** = sama dengan kebiasaan pribadi. **75** = 1,5× kebiasaan. **100** = ≥2×.
- **Cold start** (riwayat < 14 hari): `kronis = weekly_target_sets` (default 12), kepercayaan **rendah**. Riwayat 14-34 hari: kronis memakai hari yang tersedia, kepercayaan **sedang**. Riwayat ≥35 hari: **tinggi**.
- **Keterbatasan yang disengaja:** skor objektif bersifat **relatif**. Lifter yang stabil di volume tinggi akan selalu mendapat ~50. Kelelahan kronis pada volume stabil ditangkap oleh pemicu performa, RIR drift, readiness, dan jadwal proaktif, bukan oleh skor ini.
- Setelah minggu deload, kronis ikut turun sehingga ACWR minggu-minggu berikutnya sedikit tinggi. Cooldown 3 minggu (§8.7) meredam efek ini.

### 8.4 Komponen subjektif

```
peta(x)    = (x − 1) / 4 × 100                    // skala 1..5 → 0..100
readiness  = 0,30·peta(tidur) + 0,30·peta(pegal) + 0,25·peta(nyeri_sendi) + 0,15·peta(motivasi)
           dirata-rata atas check-in 3 hari terakhir (smoothing)
fatigue_subjektif = 100 − readiness
pegal_otot (per otot) = 100 − peta(muscle_soreness[otot] ?? pegal)
```

**Metrik pendukung (tidak memicu deload):** sRPE = RPE sesi × menit (Foster); monotony = rata-rata/SD sRPE harian 7 hari; strain = beban mingguan × monotony.

### 8.5 Skor fatigue akhir

```
fatigue_otot     = 0,7 × objektif_otot + 0,3 × pegal_otot
fatigue_sistemik = 0,7 × Σ(objektif_otot × kronis_otot) / Σ kronis_otot + 0,3 × (100 − readiness)
fatigue_sesi     = fatigue_sistemik yang dihitung tepat setelah sesi selesai, disertai fatigue otot yang dilatih
fatigue_minggu   = rata-rata fatigue_sistemik 7 hari (dari systemicHistory)
```

- Tanpa check-in, bobot objektif menjadi 1,0 dan peringatan "hanya komponen objektif" muncul.
- Skor sistemik memakai skor **objektif** otot, bukan skor otot yang sudah memuat pegal, agar komponen subjektif tidak terhitung dua kali.
- Setiap fungsi mengembalikan `explanation { summary, components[{name, value, weight, contribution, note}], caveats[] }`. Kontribusi komponen dijumlahkan sama dengan skor, dan UI merender ini langsung di panel "Mengapa?".

**Label UI:** 0-39 Rendah · 40-59 Normal · 60-69 Meningkat · 70-100 Tinggi.

### 8.6 Performa dan RIR drift

- **e1RM (Epley, disesuaikan RIR):** `e1RM = beban × (1 + (reps + RIR)/30)`, hanya untuk reps 1-12; selain itu `null`. Contoh: 100 kg × 8 @RIR2 → 100 × (1 + 10/30) = **133,3 kg**.
- **Tren per latihan utama** (`is_main_lift`): ambil e1RM terbaik per sesi (set working saja), lalu bandingkan rata-rata 2 sesi terakhir dengan rata-rata ≤3 sesi sebelumnya (butuh ≥4 sesi). Naik bila ≥ +1%; **stagnan** bila antara −2% dan +1%; **turun** bila < −2%.
- **RIR drift:**
  - Metode utama: rata-rata (RIR aktual − RIR target) pada set working 7 hari terakhir. Set yang bebannya > 2,5% di atas target dikecualikan, supaya yang diukur adalah "RIR pada beban yang sama".
  - Fallback tanpa target: RIR rata-rata 7 hari dikurangi RIR rata-rata hari ke-8 sampai ke-35.
  - Hanya RIR yang benar-benar diisi yang dihitung (bukan asumsi/ghost). Butuh minimal 6 set.
  - Pemicu: drift ≤ −1,0, artinya beban yang sama terasa ≥1 rep lebih berat dari rencana.

### 8.7 Aturan deload

| ID | Pemicu | Ambang default |
|---|---|---|
| (a) `systemic_fatigue` | Fatigue sistemik tinggi berkelanjutan | ≥70 pada ≥5 dari 7 hari terakhir |
| (b) `performance` | Performa stagnan/turun | ≥2 latihan utama berstatus stagnan atau turun |
| (c) `rir_drift` | RIR aktual makin kecil dari target | drift ≤ −1,0 |
| (d) `readiness` | Readiness rendah | rata-rata 7 hari < 40 |
| (e) `proactive` | Jadwal proaktif (fallback) | ≥ `deload_interval_weeks` (default 6, rentang 4-8) sejak deload terakhir atau awal program |

**Keputusan:**

```
deload  bila  (e)  ATAU  ≥2 dari (a)-(d)
waspada bila  tepat 1 dari (a)-(d)
ok      bila  tidak ada pemicu

Cooldown: bila deload terakhir < 3 minggu lalu, rekomendasi ditekan menjadi "waspada"
          KECUALI (a) dan (d) terpicu bersamaan.
```

**Durasi:** 7 hari bila ada pemicu reaktif; 5 hari bila hanya proaktif.

### 8.8 Tipe deload

| Tipe | Kapan | Preskripsi |
|---|---|---|
| **Volume** (default) | Semua kasus selain di bawah | Hard set **−50%** (dibulatkan, minimal 1), **beban tetap**, RIR ≥3 |
| **Intensity** | Nyeri sendi dominan: rata-rata nyeri sendi 7 hari ≤2,5 **dan** merupakan item readiness terendah | Beban **−12,5%** (dibulatkan ke kenaikan beban latihan), set −30%, RIR ≥2 |

`applyDeloadToPlan(plan, type)` menghasilkan rencana minggu deload tanpa memutasi program asli. Pengguna melihat pratinjau per latihan sebelum menekan Terima. **Atur sendiri** membuka editor yang sama dengan nilai yang bisa diubah bebas (override penuh).

### 8.9 Contoh numerik lengkap (dihitung dengan `fatigue.ts`)

**Skenario:**
- Bench press 100 kg × 8, hanya otot dada (kontribusi 1,0).
- **5 minggu sebelumnya:** Senin/Rabu/Jumat, 4 set @RIR2, rest 120 dtk.
- **Minggu ini:** tiap sesi 5 set dengan RIR 2, 2, 1, 1, 0 dan rest 120, 120, 90, 45, 45 dtk.
- Evaluasi pada Jumat 27-02-2026 setelah sesi.
- Check-in 3 hari terakhir: tidur 3, pegal 2, nyeri sendi 4, motivasi 3.
- Deload terakhir 5 minggu lalu.

**Langkah 1. ESL per set minggu ini**

| Set | RIR | Rest | Bobot RIR | Pengali | ESL |
|---|---|---|---|---|---|
| 1 | 2 | 120 | 0,9 | 1,00 | 0,900 |
| 2 | 2 | 120 | 0,9 | 1,00 | 0,900 |
| 3 | 1 | 90 | 1,0 | 1,00 | 1,000 |
| 4 | 1 | 45 | 1,0 | 1,10 | 1,100 |
| 5 | 0 | 45 | 1,0 | 1,15 × 1,10 = 1,265 | 1,265 |

ESL per sesi = 5,165. Minggu lalu per sesi 4 × 0,9 = 3,6.

**Langkah 2. Akut dan kronis**
- Akut = 3 × 5,165 = **15,495** set efektif.
- Kronis = 3 × 3,6 = **10,8** set efektif per minggu.

**Langkah 3. Skor objektif**
- ACWR = 15,495 / 10,8 = **1,435**.
- Objektif = 50 × 1,435 = **71,7** (kepercayaan tinggi, 40 hari riwayat).

**Langkah 4. Readiness**
- 0,3·50 + 0,3·25 + 0,25·75 + 0,15·50 = **48,75**.
- Fatigue subjektif = 51,25. Pegal dada = 100 − 25 = **75**.

**Langkah 5. Fatigue dada**
- 0,7 × 71,7 + 0,3 × 75 = 50,2 + 22,5 = **72,7** (label: Tinggi).

**Langkah 6. Fatigue sistemik**
- Dada satu-satunya otot: 0,7 × 71,7 + 0,3 × 51,25 = **65,6** (label: Meningkat).

**Langkah 7. Stabilitas.** Dihitung ulang pada hari Minggu (tanpa sesi), skor objektif dada **tetap 71,7**. Model EWMA harian sebelumnya akan memberi ~45.

**Langkah 8. Evaluasi deload**

Riwayat sistemik 7 hari: 48,2 · 50,0 · 57,2 · 57,2 · 60,5 · 60,5 · 65,6.

| Pemicu | Nilai | Status |
|---|---|---|
| (a) | 0 hari ≥70 | aman |
| (b) | bench **stagnan** (e1RM terbaik per sesi tetap 133,3 → perubahan 0%), tetapi hanya 1 latihan utama (perlu ≥2) | aman |
| (c) | tanpa target di skenario ini; fallback baseline: RIR 7 hari 1,2 vs 2,0 → drift −0,8 | aman (ambang −1,0) |
| (d) | readiness 48,75 | aman (ambang < 40) |
| (e) | 5,0 minggu dari 6 | aman |

**Hasil: `ok`.** Bila minggu berikutnya pola yang sama berlanjut dan readiness turun ke 38, maka (a) dan (d) akan terpicu, menghasilkan **deload 7 hari tipe volume**: bench 5 → 3 set (5 × 0,5 = 2,5, dibulatkan ke atas menjadi 3) @100 kg, RIR ≥3.

### 8.10 Kasus uji (ringkasan dari `fatigue.test.ts`)

| Kelompok | Kasus yang diuji |
|---|---|
| ESL | Tabel bobot RIR; fallback rir→rpe→target→default; warm-up = 0; drop = 0,5×; pengali rest (45/75/90 dtk); TUT 7 vs 6 dtk/rep; failure ×1,15; cap 1,3 (1,15×1,1×1,05 = 1,328 → 1,3); kontribusi primer/sekunder |
| Beban | EWMA dihitung tangan (utilitas); beban stabil → 50; lonjakan 1,5× → 75 dan 2× → 100; **stabil di 7 hari pada pola Senin/Rabu/Jumat**; cold start (kronis 12, kepercayaan rendah, 14-34 hari sedang) |
| Skor | Otot 0,7/0,3 dan kontribusi berjumlah sama dengan skor; sistemik tertimbang kronis + subjektif |
| Readiness | Semua 5 → 100, semua 1 → 0, bobot item; smoothing 3 hari |
| Performa | e1RM 100×8@RIR2 = 133,3; reps >12 → null; tren naik/stagnan/turun/kurang data; warm-up diabaikan |
| RIR drift | Pemicu −1,0; set lebih berat dari rencana dikecualikan; RIR asumsi diabaikan; fallback baseline |
| Foster | Monotony/strain dihitung tangan; SD 0 → null |
| Deload | ok; proaktif minggu 6 (bukan 5) dan interval dipaksa ke 4-8; dua pemicu → deload 7 hari; satu pemicu → waspada; tipe intensity vs volume; cooldown 3 minggu dengan pengecualian (a)+(d) |
| Rencana | Volume: set −50% (min 1), beban tetap, RIR ≥3, tanpa mutasi; Intensity: 100 → 87,5 kg, 4 → 3 set |
| Integrasi | `analyze()` end-to-end |

### 8.11 Kapan engine dijalankan

- **Setelah sesi selesai:** `analyze()` dijalankan penuh, lalu snapshot otot dan sistemik hari itu di-upsert ke `fatigue_snapshot`, dan `deload_event` dibuat bila status berubah menjadi `deload`.
- **Setelah check-in:** hanya komponen subjektif yang dihitung ulang (murah).
- **Saat aplikasi dibuka di hari baru:** hitung ulang snapshot hari ini (jendela bergeser).
- **Saat data lama diedit atau `engine_version` naik:** semua snapshot dibuang dan dihitung ulang. Snapshot hanyalah cache.
- **Performa:** kompleksitas O(set + otot × 35 hari × 7) per evaluasi, jadi diperkirakan ringan. Ukur di perangkat kelas bawah pada Fase 3; pindahkan ke worker hanya bila > 50 ms.

---

## 9. Tech stack dan arsitektur

### 9.1 Perbandingan dan keputusan

| Aspek | PWA (IndexedDB) | **React Native (Expo + SQLite)** | Flutter (drift) |
|---|---|---|---|
| Notifikasi jeda saat layar mati | Lemah: tidak ada notifikasi lokal terjadwal yang andal; Web Push butuh server; iOS hanya untuk PWA terpasang (16.4+); tidak ada Vibration API di iOS | **Andal** (notifikasi lokal native) | Andal |
| Offline-first | Ada risiko eviksi storage di iOS | **SQLite file nyata, bisa SQLCipher** | sama |
| Berbagi kode engine | TS | **TS (engine bisa dipakai di backend sync)** | Dart |
| Kecepatan iterasi | Tertinggi | Tinggi (EAS Build, OTA) | Sedang |

**Keputusan:** **React Native + Expo (dev build, bukan Expo Go) + `expo-sqlite` (atau `op-sqlite` untuk SQLCipher) + Drizzle ORM + Zustand + Expo Router.** Flutter adalah alternatif yang sah bila tim lebih fasih Dart. PWA dicoret karena gagal pada syarat timer.

### 9.2 Lapisan aplikasi

```
UI (Expo Router, komponen)                      ← hanya render & event
 └─ Stores (Zustand): sessionStore, timerStore, programStore
     └─ Use-case services: startSession, endSet, finishSession, submitCheckin, acceptDeload
         ├─ Domain (TS murni, tanpa import RN/DB):
         │    fatigue.ts (engine), timerReducer.ts, progression.ts (Later)
         └─ Repositories (interface) ← implementasi Drizzle/SQLite
Platform adapters (di-inject): Clock, NotificationScheduler, Haptics, KeepAwake, SecureStore
```

**Aturan:** domain tidak boleh meng-import apa pun dari React Native atau DB, supaya bisa diuji di Node murni (seperti `fatigue.test.ts` sekarang).

### 9.3 Privasi dan keamanan

- Data tidur, nyeri, dan readiness termasuk data pribadi yang sensitif (merujuk UU PDP No. 27/2022). Default **lokal saja**, tanpa analitik yang membawa data latihan. Crash report di-scrub.
- Enkripsi at-rest memakai SQLCipher dengan kunci acak di Keychain/Keystore (`expo-secure-store`). Android `allowBackup` dibatasi agar DB tidak terunggah tanpa enkripsi.
- Sinkronisasi (Rilis 3) hanya dengan persetujuan eksplisit, memakai TLS + RLS per pengguna. Hak ekspor dan hapus total selalu tersedia.

### 9.4 Migrasi, backup, sinkronisasi

- Versi skema memakai `PRAGMA user_version` dengan migrasi bernomor maju-saja, dalam transaksi. File DB di-backup otomatis sebelum migrasi. Seed katalog idempoten berdasarkan `slug`.
- Ekspor berupa JSON berversi (`{schemaVersion, exportedAt, tables}`) dan CSV per tabel. Impor idempoten (upsert berdasar `updated_at`).
- Sinkronisasi nanti memakai PowerSync atau Supabase dengan LWW per baris. `timer_state` dan `fatigue_snapshot` tidak disinkronkan.

### 9.5 Strategi pengujian

- **Unit:** engine fatigue dan reducer timer (`node:test`/Vitest), ditambah *property-based* (fast-check): skor monoton terhadap volume, deterministik, selalu 0-100.
- **Integrasi:** repository terhadap SQLite in-memory dengan migrasi nyata.
- **Timer:** simulasi "aplikasi dibunuh" (hydrate dengan jam dimajukan), dan verifikasi tidak ada notifikasi yatim setelah ubah/lewati jeda.
- **E2E:** Maestro untuk alur sesi.
- **Manual wajib:** matriks perangkat nyata (iPhone dengan Silent/Focus, Pixel, Samsung, Xiaomi, Oppo dengan penghemat baterai, layar mati 3 menit).

---

## 10. Roadmap implementasi

| Fase | Durasi* | Keluaran | Kriteria selesai |
|---|---|---|---|
| **0. Fondasi** | 1 minggu | Repo Expo dev build, CI, skema + migrasi v1, seed katalog dan otot, `fatigue.ts` dipindah ke `domain/` beserta tesnya | CI hijau; DB terbuat di perangkat |
| **1. Program & log** | 2 minggu | Program builder, sesi aktif tanpa timer (ghost, stepper, chip RIR, warm-up, edit/urungkan), riwayat dasar | Mencatat 1 sesi penuh < 5 dtk/set di uji pengguna |
| **2. Timer** | 2 minggu | Reducer timer + `timer_state`, jeda otomatis saat SELESAI SET, notifikasi terjadwal, chronometer Android, keep-awake, pemulihan | Lulus matriks perangkat; deviasi < 1 dtk; nol notifikasi yatim |
| **3. Readiness & asisten** | 2 minggu | Check-in, RPE sesi, integrasi engine, snapshot, dashboard + "Mengapa?", layar deload + `applyDeloadToPlan` | Angka di UI cocok dengan tes engine; disclaimer terpasang |
| **4. Beta tertutup** | 3-4 minggu | 20-50 lifter, telemetri lokal opt-in (agregat), ekspor/impor, perbaikan | Retensi minggu ke-4 ≥40%; ≥60% hari latihan ada check-in |
| **5. Rilis 1 (MVP)** | 1 minggu | Store listing, kebijakan privasi, onboarding OEM | Rilis Play Store + App Store |
| **6. Rilis 2** | 4-6 minggu | Superset/drop penuh, Live Activities, heatmap, ambang bisa diatur, progresi otomatis | — |
| **7. Rilis 3** | — | Akun + sinkronisasi, jam tangan, lb, multi-bahasa, kalibrasi personal | — |

\* Estimasi untuk 1-2 pengembang.

**Validasi engine selama beta:** catat setiap keputusan deload beserta respons pengguna (terima/tunda/abaikan + alasan) dan tren performa 2 minggu sesudahnya, untuk mengkalibrasi ambang pada versi berikutnya (`engine_version`).

---

## 11. Risiko dan pertanyaan terbuka

### 11.1 Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| OEM Android membatalkan alarm/notifikasi | Timer jeda tidak berbunyi | Onboarding autostart/optimasi baterai, tes notifikasi, deteksi & peringatan |
| Kebijakan exact alarm Android 13/14 | Notifikasi meleset beberapa detik | Fallback `setExactAndAllowWhileIdle`, tampilkan toleransi |
| iOS Silent mode meredam suara | Pengguna tidak sadar jeda selesai | Getar tetap jalan; edukasi di onboarding; Live Activities di Rilis 2 |
| Skor dipercaya berlebihan | Keputusan latihan keliru | Transparansi komponen, bahasa saran, disclaimer, override penuh, label kepercayaan |
| Skor objektif relatif tidak menangkap fatigue pada volume stabil | Deload terlambat | Pemicu (b)(c)(d) + jadwal proaktif sebagai fallback |
| RIR subjektif tidak akurat (±1-3 rep) | Drift dan ESL bias | Drift memakai rata-rata ≥6 set; edukasi RIR singkat; e1RM sebagai tren saja |
| Ghost value terkonfirmasi tanpa dicek | Data palsu | Penanda "belum dikonfirmasi", RIR ghost tidak dihitung ke drift, cek di ringkasan |
| Kelelahan mengisi check-in | Komponen subjektif hilang | Boleh dilewati, nilai default kemarin, engine tetap jalan objektif-saja |
| Alarm palsu di minggu awal | Hilang kepercayaan | Banner deload reaktif disembunyikan saat kepercayaan rendah (K11) |
| Sitasi belum diverifikasi | Klaim ilmiah keliru di aplikasi | Semua [perlu verifikasi] dicek ke sumber primer sebelum masuk teks aplikasi |

### 11.2 Pertanyaan terbuka

1. **Platform prioritas:** iOS atau Android lebih dulu? Ini menentukan urutan Live Activities vs chronometer.
2. **Sinkronisasi/akun di MVP?** Usulan: tidak; lokal + ekspor dulu.
3. **Bobot subjektif:** tetap 30% atau 40% (lebih dekat ke bukti Saw et al.)? Usulan: 30% default, uji A/B di beta.
4. **Skala skor objektif:** 50×ACWR membuat 2× volume langsung 100. Perlukah kurva lebih landai (mis. 50 + 50·(ACWR−1)/0,8)? Tentukan dari data beta.
5. **Apakah rekomendasi deload boleh mengubah program otomatis?** Usulan: hanya dengan konfirmasi Terima.
6. **Kurasi katalog dan bobot otot sekunder:** kurasi sendiri atau dataset terbuka?
7. **Latihan beban tubuh** (pull-up, dip): apakah berat badan ditambahkan ke `load_kg` untuk e1RM? Usulan: ya, bila berat badan diisi.
8. **Mode pemula terpandu** (saran beban/RIR) vs pencatat murni di MVP?
9. **Perlukah TUT mendukung pause di tengah set?** Usulan: tidak (start/stop tunggal).

---

## 12. Referensi

Status: belum diverifikasi ulang oleh pencarian basis data. Item bertanda **[perlu verifikasi]** memiliki keraguan spesifik soal tahun, judul, atau detail angka.

- Baz-Valle E. et al. 2022. Volume mingguan dan hipertrofi, *J Hum Kinet* [perlu verifikasi].
- Bell L. et al. 2022/2023. Deload pada olahraga kekuatan & physique: survei pelatih dan konsensus Delphi [perlu verifikasi].
- Brzycki M. 1993. Prediksi 1RM.
- Coleman M. et al. 2024. Deload 1 minggu vs latihan kontinu pada lifter terlatih, *PeerJ* [perlu verifikasi detail].
- Epley B. 1985. Rumus estimasi 1RM.
- Foster C. 1998, *Med Sci Sports Exerc*; Foster C. et al. 2001, *J Strength Cond Res*. Session-RPE, monotony, strain.
- Gabbett T.J. 2016. Paradoks training-injury / ACWR, *Br J Sports Med*.
- Helms E.R. et al. 2016. Penerapan RPE berbasis RIR, *Strength Cond J*.
- Impellizzeri F.M. et al. 2020. Kritik ACWR, *Int J Sports Physiol Perform*.
- Lolli L. et al. 2019. Mathematical coupling pada ACWR, *Br J Sports Med* [perlu verifikasi tahun].
- Pelland J.C. et al. 2024/2025. Meta-regresi volume dan hipertrofi [perlu verifikasi].
- Refalo M.C. et al. 2023. Kedekatan ke failure dan hipertrofi, meta-analisis, *Sports Med*.
- Robinson Z.P. et al. 2024. Dose-response kedekatan ke failure, *Sports Med* [perlu verifikasi detail].
- Saw A.E., Main L.C., Gastin P.B. 2016. Ukuran subjektif vs objektif untuk memantau respons latihan, *Br J Sports Med*.
- Schoenfeld B.J., Ogborn D., Krieger J.W. 2015. Durasi repetisi dan hipertrofi, *Sports Med*.
- Schoenfeld B.J., Ogborn D., Krieger J.W. 2016. Frekuensi latihan, *Sports Med*.
- Schoenfeld B.J. et al. 2016. Rest 1 vs 3 menit, *J Strength Cond Res*.
- Schoenfeld B.J., Ogborn D., Krieger J.W. 2017. Dose-response volume mingguan, *J Sports Sci*.
- Schoenfeld B.J. et al. 2019. Frekuensi dengan volume disamakan, *J Sports Sci* [perlu verifikasi tahun].
- Singer A. et al. 2024. Rest interval dan hipertrofi, meta-analisis Bayesian [perlu verifikasi].
- Steele J. et al. 2017. Akurasi prediksi repetisi tersisa, *PeerJ* [perlu verifikasi].
- Williams S. et al. 2017. ACWR berbasis EWMA, *Br J Sports Med*.
- Zourdos M.C. et al. 2016. Skala RPE berbasis RIR, *J Strength Cond Res*.

---

## 13. Lampiran: proses kerja sub-agen

Empat sub-agen (model Sonnet) dijalankan paralel. Arsitek (Opus) meninjau dan mensintesis hasilnya.

| Sub-agen | Keluaran | Ditinjau/diubah arsitek |
|---|---|---|
| Riset sains | Ringkasan bukti hipertrofi & fatigue, default parameter, tingkat kepastian, daftar sitasi bertanda [perlu verifikasi] | Diringkas di §3; usulan bobot subjektif 40% dijadikan opsi (K5); rest relatif ditunda (K8) |
| UX/produk | Prinsip satu tangan, navigasi, wireframe 10 layar, alur set, microcopy, metrik | Jeda mulai saat SELESAI SET (K2); check-in dipisah 4 item (K6); preskripsi deload diselaraskan (K7) |
| Data & arsitektur | Perbandingan stack, DDL, reducer timer, notifikasi Expo, lapisan aplikasi, privasi, migrasi | Reducer dirombak sesuai K2 (state `set_logging` dihapus); kolom `target_rir`, `confirmed`, `parent_set_id`, `explanation_json` ditambahkan; enum pemicu deload diselaraskan dengan engine |
| Algoritma | `fatigue.ts` + 29 tes, contoh numerik | Model EWMA harian diganti jendela bergulir (K1); drop set 0,5× (K4); tes stabilitas hari-dalam-pekan ditambah, sehingga **30/30 lulus**; contoh numerik dihitung ulang |
