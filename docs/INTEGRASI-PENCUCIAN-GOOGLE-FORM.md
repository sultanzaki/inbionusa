# Google Form → ERP: pencucian alat

## Alur

Google Form tetap menjadi tempat pengisian harian. Apps Script terikat pada spreadsheet jawaban, mengirim JSON bertanda tangan ke `POST /api/integrations/equipment-cleaning`. Tidak perlu membuat Web App Apps Script atau endpoint Google yang dapat dibaca publik. ERP menyimpan semua 21 kolom dan menampilkan jawaban pada detail alat → Cleaning records.

Kolom tambahan memakai judul **Nomor Batch**. Urutan kolom bebas; semua judul harus sama persis (spasi tepi diabaikan). Form lain pada spreadsheet yang sama tidak diproses. Jangan menyisipkan password login atau kunci Supabase ke form maupun spreadsheet.

## Persiapan master

- Nama Alat harus cocok dengan nama alat di ERP dan Area Kerja harus cocok dengan nama lokasi alat. Pasangan harus unik. Perbedaan kapital dan spasi tepi diabaikan; nama ambigu ditolak.
- Nama Petugas dan Nama Pemeriksa harus cocok dengan nama lengkap pengguna ERP yang aktif, tidak diwajibkan mengganti password, dan memiliki izin tulis Production serta akses lokasi alat. Orang yang sama boleh mengisi keduanya. Jangan membuat akun bersama untuk menggantikan identitas operator.
- Sebelum mencuci alat bekas pakai, selesaikan penggunaan alat di ERP. Pencucian tidak otomatis menghentikan batch yang sedang berjalan.
- Nomor Batch wajib untuk alat yang sudah pernah digunakan. Cocokkan dengan nomor lot hasil produksi, nomor production order (MO), atau nomor production record (PRD) pada pemakaian terakhir alat. Teks produk terakhir hanya keterangan, bukan pengganti identitas batch. Untuk pencucian awal alat baru, Nomor Batch harus kosong.
- Pencucian yang lebih lama dari penggunaan/inspeksi terakhir ditolak untuk diperiksa manual. Jangan melakukan backfill buta lalu menganggap kondisi alat saat ini sudah benar.

## Konfigurasi server ERP

Terapkan migrasi 031 setelah 030, deploy kode aplikasi, lalu atur variabel server berikut pada Vercel (jangan memakai awalan NEXT_PUBLIC):

| Variabel | Isi |
|---|---|
| EQUIPMENT_FORM_SECRET | Secret acak minimal 32 karakter; simpan salinan yang sama dalam Script properties |
| EQUIPMENT_FORM_SOURCE_ID | `<spreadsheet-id>:<sheet-gid>` dari spreadsheet dan tab jawaban yang diizinkan |
| EQUIPMENT_FORM_ACTOR_ID | UUID akun ERP yang bertanggung jawab atas integrasi; harus aktif, memiliki Production write dan akses lokasi terkait |
| EQUIPMENT_FORM_APPROVED_ANSWERS | Opsional: override JSON. Tanpa variabel ini, ERP memakai pilihan aktual form yang sudah diberikan |

Profil bawaan mengikuti pilihan aktual form:

```json
{"rinse":["Ya, sesuai prosedur"],"residue":["Tidak ditemukan residu yang terlihat"],"condition":["Bersih secara visual"],"dry":["Sudah dikeringkan dan disimpan sesuai prosedur","Sudah ditangani sesuai prosedur, tetapi belum disimpan"],"outcome":["Selesai dan memenuhi kriteria pemeriksaan"],"ready":["Siap digunakan kembali"]}
```

“Tidak berlaku sesuai SOP” belum meluluskan alat otomatis; hasil tersebut perlu ditinjau. Kedua jawaban “Sudah ... sesuai prosedur” pada pengeringan/penyimpanan diterima hanya jika pemeriksa juga menyatakan alat siap. Metode harus cocok dengan jenis potensi najis: Ringan → Air; Sedang → Air + Sabun; Berat → Air + Tanah, memakai teks persis dari form. Ini memeriksa kesesuaian pencatatan; bukan memastikan proses fisiknya telah benar.

Pemetaan: rinse=pembilasan; residue=tidak ada residu; condition=kondisi alat; dry=pengeringan/penyimpanan; outcome=hasil akhir; ready=siap digunakan kembali. Semua harus cocok agar hasil lulus dan status alat menjadi ready. Jika salah satunya tidak cocok, catatan tetap masuk sebagai fail dan alat menjadi repair. Perbedaan kapital dan spasi tepi diabaikan; jangan mencantumkan jawaban negatif dalam daftar lulus. Jenis potensi najis, metode, bahan pembersih, ketidaksesuaian dan Notes tetap disimpan untuk penelusuran. Ini tidak mengesahkan kecukupan SOP atau kepatuhan halal secara otomatis.

Endpoint akan menjawab 503 selama konfigurasi belum lengkap. Actor hanya mengizinkan integrasi melakukan pencatatan; identitas pencuci/pemeriksa tetap diambil dan divalidasi dari masing-masing jawaban. Tidak ada password pengguna atau session token yang dikirim dari Google.

## Memasang Apps Script

1. Buka spreadsheet jawaban → Extensions → Apps Script.
2. Salin seluruh isi `scripts/integrations/equipment-cleaning.gs` ke editor.
3. Pastikan timezone spreadsheet **Asia/Jakarta**; set timezone project Apps Script juga Asia/Jakarta.
4. Buka Project Settings → Script properties dan buat:
   - ERP_URL: `https://<domain-erp>/api/integrations/equipment-cleaning` (langsung ke domain final tanpa redirect).
   - ERP_SECRET: secret yang sama dengan EQUIPMENT_FORM_SECRET.
   - RESPONSE_SHEET_ID: angka `gid` tab jawaban (misalnya `0`).
5. Jalankan `installEquipmentSync` satu kali dan izinkan akses spreadsheet, trigger, serta koneksi HTTP. Fungsi ini memasang trigger **From spreadsheet → On form submit** dan trigger retry setiap lima menit. Tidak perlu Deploy as Web App. Jalankan ulang hanya dari project integrasi yang sama, agar tidak ada pemasangan trigger ganda di project lain.
6. Kirim satu jawaban uji melalui Google Form. Jangan menjalankan `onCleaningFormSubmit` dari tombol Run; fungsi tersebut memerlukan event dari spreadsheet.
7. Periksa tab `_ERP_Cleaning_Outbox` dan riwayat alat ERP. Batasi akses editor ke spreadsheet/project dan tab outbox: outbox berisi salinan jawaban dan dapat memicu perubahan status alat.

Apps Script memakai scope yang diminta Google untuk spreadsheet, trigger, dan external request. Jalankan dari akun perusahaan yang dipelihara; trigger bergantung pada izin akun tersebut dan kuota Google. Pengiriman adalah near-real-time dan bukan jaminan waktu tertentu.

## Antrean dan kegagalan

- SENT: server menerima, atau menerima ulang jawaban yang sama sebagai duplikat tanpa membuat catatan baru.
- RETRY: gangguan koneksi, konfigurasi/authentication, atau server. Dicoba ulang tiap lima menit, maksimal sepuluh percobaan; lalu REVIEW. Maksimal 20 pesan dikirim setiap eksekusi.
- REVIEW: payload/identitas/batch/tanggal perlu diperbaiki atau pengiriman berulang gagal. Periksa kolom Result, jangan langsung menandai SENT sendiri.
- Setelah konfigurasi diperbaiki, pilih baris outbox lalu jalankan `retrySelectedOutboxRow`. Payload dan event ID tidak berubah sehingga retry aman walaupun respons sebelumnya hilang setelah commit.
- Setelah data form diperbaiki, pilih baris jawaban lalu jalankan `queueSelectedCleaningRow` untuk membuat event koreksi baru. Catatan SENT yang sudah tercatat tidak ditimpa. Bila koreksi berbenturan dengan waktu/riwayat yang sudah tersimpan, selesaikan manual di ERP; jangan mengubah jam untuk melewati validasi.
- Jika pemetaan tanggal/header gagal saat submit, catatan belum masuk outbox. Perbaiki kolom, pilih baris jawaban, lalu jalankan `queueSelectedCleaningRow`. Pantau juga menu Executions Apps Script untuk trigger gagal.
- Tanggal Pencucian harus berupa sel Date asli. Waktu menerima sel Time asli atau teks HH:mm[:ss]. Waktu selesai harus pada hari yang sama dan tidak mendahului waktu mulai; pencucian lintas tengah malam memerlukan penanganan manual. Waktu masa depan lebih dari lima menit ditolak server.
- Pengubahan jawaban Google Form tidak otomatis disinkronkan; trigger utama hanya untuk submit baru. Jangan menghapus atau mengedit Payload/Event ID outbox.

Secret hanya berada di environment server dan Script properties, tidak di URL/cell/log. Setiap request ditandatangani HMAC SHA-256 dengan timestamp maksimal lima menit. Rotasi secret harus dilakukan pada dua sisi. Database hanya mengizinkan RPC import kepada service role; tabel receipt tidak dibuka langsung. Pengiriman yang gagal tidak membuat alat siap.

## Penghapusan data uji

Migrasi 031 menambahkan tabel `erp_equipment_imports` yang mereferensikan riwayat pencucian. SQL reset alat yang lama perlu menambahkan penghapusan receipt **sebelum** riwayat pencucian, kemudian penggunaan dan master alat. Setelah reset, jangan mengirim ulang outbox lama tanpa meninjau dampaknya. Audit dan replay log tidak dihapus oleh reset alat tersebut.
