# Forms di dalam ERP

## Pemakaian

Administrator membuka **Production → Forms**. Menu dan tindakan pengelolaan mengikuti hak administrator ERP; pengisian melalui link publik tidak memerlukan akun.

1. Pilih **Form baru** untuk template umum, atau **Template pencucian** untuk template yang terhubung ke alat.
2. Ubah judul/deskripsi, tambah pertanyaan, pilih tipe, atur wajib isi dan pilihan jawaban. Pertanyaan dapat diurutkan naik/turun. Tipe awal: teks, paragraf, angka, tanggal, waktu, pilihan tunggal, file.
3. Untuk upload, tambahkan pertanyaan lalu pilih tipe **file**. Maksimal tiga field file, masing-masing satu file. PDF, JPG dan PNG didukung; maksimal 2 MB per file dan 3 MB gabungan.
4. **Simpan draft**, lalu **Terbitkan**. Tombol penerbitan dinonaktifkan selama masih ada perubahan yang belum disimpan.
5. **Salin link**, **Buka form**, atau **Unduh QR** untuk membagikan. Halaman pengisian berada di `/forms/<token>` dan dapat digunakan tanpa login.
6. Jawaban terbaru dan file tersedia di halaman admin form. **Jeda** menghentikan penerimaan melalui link tersebut tanpa menghapus jawaban.

Perubahan draft tidak memengaruhi form yang sedang diterbitkan. Menerbitkan ulang menaikkan versi; setiap jawaban menyimpan salinan template dan versinya. Pengiriman yang memakai versi lama ditolak agar pengguna memuat ulang. Pengiriman ulang dengan ID dan isi yang sama tidak menggandakan jawaban.

## Pencucian alat

Pertanyaan sistem pada template pencucian boleh diganti labelnya dan diurutkan, tetapi tidak boleh dihapus, dibuat opsional, atau diganti tipenya. Binding internal tetap menghubungkan jawaban dengan pemeriksaan alat. Pertanyaan tambahan, termasuk file, boleh ditambahkan.

- Pilihan alat, area, dan petugas berasal dari ERP. Pemilihan menggunakan ID, sehingga nama yang sama tidak menyebabkan pencocokan ambigu.
- Area mengikuti alat yang dipilih. Nomor batch dipilih dari pemakaian terakhir alat, termasuk nomor order/record serta lot hasilnya. Tanda `-` mengikuti aturan nonproduk yang sudah ada.
- Alat yang sedang dipakai tidak dapat dipilih untuk pencucian. Penggunaan harus diselesaikan dahulu.
- Pencucian tetap memeriksa kondisi, residu, metode/jenis najis, pembilasan, penanganan, hasil akhir, dan kesiapan. Pengisian tanpa login adalah atribusi nama yang dipilih; bukan autentikasi identitas pengisi. Ini mengikuti kebijakan penggunaan internal yang disepakati.
- Status alat hanya diperbarui dalam transaksi yang sama dengan jawaban dan catatan pencucian. Upload atau validasi yang gagal tidak meluluskan alat.
- Form bergantung pada akun administrator yang menerbitkan dan akses modul Production. Menonaktifkan akun penerbit atau modul dapat membuat link tidak tersedia; terbitkan ulang melalui administrator aktif jika penanggung jawab berganti.

Google Form dan Apps Script yang sudah dibuat tetap tersedia sebagai jalur transisi. Jangan memasukkan pencucian yang sama melalui dua jalur: ID pengiriman berbeda dianggap sebagai dua kejadian dan pemeriksaan urutan waktu dapat menolak pengiriman kedua. Setelah memakai form native, nonaktifkan trigger Google secara terencana agar operator tidak memakai dua sumber.

## Lampiran

Bucket Supabase Storage **form-attachments** harus privat. Server memeriksa ukuran dan jenis berdasarkan signature file, bukan nama saja. File SVG/HTML dan jenis lain ditolak. Pemeriksaan signature bukan antivirus atau validasi menyeluruh isi PDF.

Upload dilakukan server. Kunci Supabase tidak dikirim ke browser. Bucket dibuat privat pada upload pertama jika belum tersedia; kegagalan penyedia storage menggagalkan pengiriman. Jalur file acak dibuat server, lalu direferensikan oleh jawaban. File pada pengiriman yang ditolak dibersihkan; bila provider tidak dapat dihubungi saat cleanup, pengelola perlu memeriksa orphan object. Unduhan memerlukan sesi administrator dan menghasilkan URL privat bertempo 60 detik. URL sementara dapat dipakai siapa pun yang memperolehnya selama masih berlaku.

Jangan mengubah bucket menjadi publik. Pemeriksaan server menolak upload bila bucket ternyata publik. Tidak ada fitur penghapusan massal atau retensi otomatis pada rilis awal. Backup database tidak menyertakan binary Storage; siapkan backup/retensi Storage tersendiri sesuai kebutuhan perusahaan.

## Deployment dan pemeriksaan

Terapkan migrasi 033 setelah 032 lalu deploy aplikasi. Migrasi bersifat tambahan, tidak mengubah catatan produksi lama, dan tidak membuat template aktif otomatis. Tidak perlu environment secret Apps Script untuk form native. Akses Storage menggunakan service role server yang sudah digunakan aplikasi.

Pemeriksaan lokal:
- `npx tsx --test tests/native-forms.test.ts tests/native-forms-database.test.ts`
- `TEST_NATIVE_FORMS_ONLY=1 npm run test:e2e`

Tes browser memakai adapter Storage lokal untuk menguji alur API upload dan otorisasi; pengaturan Storage cloud perlu diverifikasi saat deployment. Halaman admin menampilkan maksimal 100 jawaban terbaru per form pada versi awal; seluruh jawaban tetap tersimpan. Form builder belum mencakup conditional sections, rumus, tanda tangan, multi-select, atau pengisian offline.

Status pemeriksaan pengembangan: tes unit dan database untuk validasi, versi, replay, hak akses dan pemilihan ID telah lulus. Tes browser mencakup pembuatan/penerbitan form, pengiriman PDF tanpa login, unduhan admin, QR, jeda form dan pencucian alat. Adapter Storage dipakai pada tes browser. Bucket cloud privat juga telah diuji terpisah melalui upload PDF, penolakan akses publik, unduhan bertempo dan penghapusan file uji.
