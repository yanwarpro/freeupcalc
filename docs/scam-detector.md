# Scam Detector — Kriteria "Proyek Aman"

FreeUp Calc menandai setiap kartu proyek di Upwork dan Freelancer.com dengan
badge risiko: 🟢 Aman, 🟡 Perlu Cek, atau 🔴 Berisiko.

## Kriteria 🟢 Aman (harus SEMUA terpenuhi)

| Platform | Kriteria |
|---|---|
| **Freelancer.com** | 1. Payment verified<br>2. Email verified<br>3. Deposit made |
| **Upwork.com** | 1. Payment verified<br>2. Hire rate **> 90%**<br>3. Terakhir dilihat **< 2 hari**<br>4. Phone number verified |

Kalau satu saja tidak terpenuhi (atau datanya tidak bisa dibaca dari halaman),
badge menjadi 🟡 **Perlu Cek**. Arahkan kursor ke badge untuk melihat checklist
kriteria aman beserta rinciannya.

## Kenapa 🟢 dibatalkan?

Kalau proyek memenuhi kriteria aman platform **tetapi** ada sinyal scam kritis,
badge tetap 🔴 Berisiko. Sinyal kritis yang membatalkan badge Aman:

- Minta kontak di luar platform (Telegram, WhatsApp, email, dsb.)
- Bayaran terlalu tinggi untuk pekerjaan yang tampak mudah (`no experience needed`, `make $3000 per day`, …)

Pola deskripsi seperti `upfront payment`, `send money`, atau `training fee`
menambah skor sebagai temuan mencurigakan, tetapi sendiri tidak ditandai kritis.

## Aturan skor risiko

Skor = jumlah poin dari semua temuan. Level ditentukan dari skor **dan**
kriteria aman:

| Kondisi | Level |
|---|---|
| Semua kriteria aman terpenuhi, tanpa sinyal scam keras | 🟢 Aman |
| Ada sinyal scam keras, atau skor > 3 | 🔴 Berisiko |
| Selain itu (kriteria aman belum lengkap) | 🟡 Perlu Cek |

### Poin risiko

| Risiko | Poin | Platform |
|---|---:|---|
| Deposit belum dibuat (belum di-escrow) | 4 | Freelancer |
| Payment belum diverifikasi | 3 | keduanya |
| Minta kontak di luar platform | 3 | keduanya |
| $0 total spending | 2 | Upwork |
| Budget tidak realistis (< $5) | 2 | keduanya |
| Akun klien baru (< 6 bulan) | 2 | Freelancer |
| Bayaran terlalu tinggi / pekerjaan terlalu mudah | 2 | keduanya |
| Email belum diverifikasi | 2 | Freelancer |
| Phone number belum diverifikasi | 2 | Upwork |
| Hire rate ≤ 90% | 2 | Upwork |
| Terakhir dilihat > 2 hari lalu | 2 | Upwork |
| Spending < $100 | 1 | Upwork |
| Belum ada rating/ulasan | 1 | keduanya |
| Identity belum diverifikasi | 1 | Freelancer |
| Deskripsi terlalu singkat | 1 | keduanya |
| Belum ada proposal/bid masuk (budget >= $500) | 1 | keduanya |
| Rata-rata bid < 20% budget (budget >= $100) | 1 | keduanya |

Skor dijumlahkan dari temuan yang datanya tersedia. Jika kriteria Aman lengkap
dan tidak ada risiko kritis, hasilnya tetap 🟢 Aman. Di kondisi lainnya, risiko
kritis atau total skor **lebih dari 3** menghasilkan 🔴 Berisiko. Jika total
skor 3 atau kurang dan kriteria Aman belum lengkap, hasilnya 🟡 Perlu Cek. Jadi,
🟡 Perlu Cek juga dapat muncul hanya karena satu atau lebih data kriteria Aman
tidak diketahui, tanpa temuan berisiko.

Badge juga menampilkan level risiko berbasis poin agar besarnya temuan lebih
terlihat: **L1 Rendah** (0 poin), **L2 Sedang** (1–2), **L3 Tinggi** (3),
**L4 Sangat tinggi** (>3), dan **L5 Kritis** bila ada sinyal kritis. Kategori
badge (Aman/Perlu Cek/Berisiko) tetap menunjukkan hasil kriteria platform;
level adalah ringkasan poin risiko. Arahkan kursor untuk melihat rincian.

### Batas pemeriksaan budget

Walaupun label temuan menyebut "Budget tidak realistis vs. kompleksitas
pekerjaan", implementasi belum menganalisis kompleksitas atau ruang lingkup.
Saat ini aturan hanya memberi **2 poin** jika budget yang terbaca positif dan
di bawah **$5**, kecuali proyek ditandai sebagai microtask. Tidak ada estimasi
jam kerja, perbandingan fitur, atau penilaian harga pasar. Anggap ini sinyal
kasar untuk diperiksa manual, bukan kesimpulan bahwa budget proyek tidak wajar.

## Arsitektur

```
scam-engine.js    → logika murni (skor, kriteria aman, parser teks).
                     Diekspor juga ke Node (module.exports) agar bisa diuji.
scam-parsers.js   → lapisan baca DOM per platform (Upwork / Freelancer).
                     PASIF: hanya membaca DOM/teks yang terlihat, tidak pernah
                     memanggil API internal platform. Dipasang sebelum detector
                     (lihat urutan di manifest.json).
scam-detector.js  → lapisan DOM: memindai kartu, menyuntik badge.
content-scam.css  → gaya badge.
```

Aturan skor hanya ada di `scam-engine.js` — satu sumber kebenaran yang dipakai
oleh content script maupun test.

### Catatan tentang jumlah proposal

Upwork menampilkan jumlah proposal sebagai *tier* pada kartu listing
(mis. `50+ proposals`, `Under 5 proposals`, `10 to 20 proposals`), bukan angka
persis. Agar tier tidak salah dibaca sebagai "0 proposal", parser mengisi:

- `proposalCount` → angka persis, atau `null` bila hanya tier / data tidak ada.
- `proposalTier`  → `{ min, max, label, exact }` untuk kasus tier.

`null` berarti **tidak diketahui**, bukan nol. Aturan `NO_PROPOSALS` hanya
menyala bila `proposalCount === 0` secara eksplisit dan budget >= $500.
Nomor proposal persis baru tersedia di halaman detail proyek.

## Menjalankan test

```bash
npm test                  # semua test
npm run test:scam         # test scoring & kriteria aman
npm run test:parsers      # test parsing hire rate / last view / phone
npm run test:parsers:dom  # test integrasi parser DOM <-> engine (jsdom)
npm run test:badge        # test penempatan badge (listing & detail)
```

## Batasan

- `hire rate`, `last view`, dan `phone verified` diambil dari teks kartu Upwork.
  Bila Upwork mengubah struktur DOM atau teksnya, parser perlu disesuaikan.
- `email verified` pada Freelancer dibaca dari panel verifikasi; bila panel
  tidak memuat status email, kriteria 🟢 tidak akan terpenuhi (badge 🟡).
- Warna ikon verifikasi hanya dipakai sebagai sinyal tambahan; jalur utama
  memakai atribut `title`/`aria-label`, `data-test`, dan teks "X verified"
  agar tetap jalan di DOM yang warnanya tidak bisa dihitung.
- Data yang tidak terbaca tidak dianggap "aman" — lebih baik 🟡 daripada
  salah menandai 🟢.

### Persyaratan kelayakan Freelancer

Badge Freelancer juga menampilkan ikon ⛔ bila teks proyek menyatakan bahwa
proyek hanya terbuka untuk freelancer terpilih. Ini adalah peringatan
kelayakan, bukan poin risiko scam: freelancer yang tidak dipilih tidak dapat
mengajukan bid. Deteksi berjalan pada kartu listing dan halaman detail; bila
teks persyaratan hanya tersedia di detail, listing diperkaya dari halaman
detail proyek.

