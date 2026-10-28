# Forms di dalam ERP

## Pemakaian

Administrator membuka **Administration → Forms** (`/dashboard/admin/forms`). Menu dan tindakan pengelolaan mengikuti hak administrator ERP; pengisian melalui link publik tidak memerlukan akun.

1. Pilih **Form baru** untuk membuat form umum. Tombol pembuatan template pencucian tidak ditampilkan; form pencucian yang sudah ada tetap dapat digunakan.
2. Ubah judul/deskripsi, tambah pertanyaan, pilih tipe, atur wajib isi dan pilihan jawaban. Pertanyaan dapat diurutkan naik/turun. Tipe: teks, paragraf, angka, tanggal, waktu, pilihan tunggal, referensi data ERP, file. Editor menampilkan satu pertanyaan sekaligus. Gunakan daftar urutan di desktop atau pemilih pertanyaan di mobile.
3. Untuk upload, tambahkan pertanyaan lalu pilih tipe **file**. Maksimal tiga field file, masing-masing satu file. PDF, JPG dan PNG didukung; maksimal 2 MB per file dan 3 MB gabungan.
4. **Simpan draft**, lalu **Terbitkan**. Tombol penerbitan dinonaktifkan selama masih ada perubahan yang belum disimpan.
5. Buka tab **Bagikan**, kemudian **Salin link**, **Buka form**, atau **Unduh QR** untuk membagikan. Halaman pengisian berada di `/forms/<token>` dan dapat digunakan tanpa login.
6. Tab **Pratinjau** menampilkan draft tanpa mengirim data. Jawaban terbaru dan file tersedia di tab **Jawaban**. **Jeda** menghentikan penerimaan melalui link tersebut tanpa menghapus jawaban.

Perubahan draft tidak memengaruhi form yang sedang diterbitkan. Menerbitkan ulang menaikkan versi; setiap jawaban menyimpan salinan template dan versinya. Pengiriman yang memakai versi lama ditolak agar pengguna memuat ulang. Pengiriman ulang dengan ID dan isi yang sama tidak menggandakan jawaban.

## Menghapus form

Gunakan **Hapus form** pada toolbar, kemudian geser konfirmasi. Form hilang dari daftar dan link pengisian langsung dinonaktifkan. Penghapusan ini menyimpan jawaban, lampiran privat, serta catatan pencucian yang sudah masuk ke operasional. Tindakan tercatat dalam audit. Akses pengelolaan form yang sudah dihapus ditutup; tidak ada tombol pemulihan atau penghapusan permanen data riwayat pada rilis ini.

## Referensi data ERP

Tambahkan **Data ERP**, atau pilih tipe **Referensi data ERP**, kemudian pilih **Sumber data ERP**. Pilihan dikelompokkan berdasarkan modul. Pencarian pada tautan pengisian menggunakan kode/nama dengan pagination 25 pilihan per halaman; seluruh data tidak diunduh sekaligus.

Sumber yang tersedia setelah pemeriksaan struktur database:

| Kelompok | Sumber |
| --- | --- |
| Master data & Administration | Produk, satuan, pengguna aktif |
| Production | Peralatan, perintah produksi, catatan hasil produksi, pencucian alat |
| Warehouse | Batch/lot produk, gudang, lokasi/area, palet, pergerakan stok/DO, stock opname, transfer gudang, retur |
| Purchase | Bahan baku, lot bahan baku, pemasok, purchase order |
| Sales | Pelanggan, quotation, sales order |
| CRM | Peluang penjualan, aktivitas, permintaan sampel |
| Quality | Inspeksi produk, inspeksi bahan masuk, COA, spesifikasi bahan |
| Documents | Dokumen produk, dokumen bahan/pemasok |
| Service | Nomor kasus layanan |
| Finance | Nomor dokumen tagihan, nomor pembayaran |

Referensi hanya mengekspos identitas: ID dan label kode/nama/nomor/tanggal sesuai sumber. Tidak ada harga, saldo, rekening bank, kontak pribadi, file dokumen, password, sesi, audit mentah, atau komposisi BOM. Tabel teknis, counter, tabel relasi/baris transaksi, dan tabel keamanan tidak menjadi pilihan referensi mandiri. Deviasi/CAPA yang dapat terkait BOM dilindungi tidak diekspos melalui referensi umum ini.

Setiap field hanya dapat mencari sumber yang dipilih pada versi form yang telah diterbitkan. Akses modul dan lokasi mengikuti penerbit. Modul yang dinonaktifkan membuat sumber terkait tidak tersedia; akun penerbit yang dinonaktifkan menonaktifkan tautan. Pada submit, server memvalidasi ulang ID lalu menyimpan ID, sumber, dan label saat pengiriman dalam `reference_data`. Label historis tidak ikut berubah saat master data diganti nama. Form umum hanya mencatat referensi; memilih SO/DO/batch tidak mengubah transaksi tersebut.

Pengaturan referensi umum bersifat mandiri per pertanyaan. Cascade khusus area → alat → batch tetap tersedia pada template pencucian; konfigurasi cascade bebas antarsumber belum termasuk.

Tempat dan ruangan dikelola melalui **Administration → Sites & rooms**. Pilihan Area Kerja mencakup seluruh ruangan aktif pada tempat aktif, termasuk ruangan tanpa alat. Label memakai `Tempat/Ruangan`, misalnya `KBI/Lab`. Lihat [panduan tempat dan ruangan](SITES-AND-ROOMS.md).

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

## Kinerja dan pengisian

Migrasi 036 memisahkan pemeriksaan akses dari pemuatan pilihan alat/batch/petugas. Pengecekan replay, submit, dan referensi memakai guard privat yang ringan. Pengiriman normal memakai dua RPC server → database (`erp_form_prepare`, `erp_form_submit`), menggantikan tiga RPC sebelumnya dan empat pembangunan ulang pilihan ERP. Validasi aktif/jeda/hapus, penerbit, modul, versi, referensi, dan replay tetap berlaku saat penyimpanan.

Halaman pengisian menerima data langsung melalui render server di dalam Suspense. Skeleton tampil selama menunggu, tanpa menunggu JavaScript lalu melakukan GET data form lagi. Kontrol pengisian diaktifkan setelah hidrasi agar input pertama tidak tertimpa state awal. Pilihan referensi dicari saat field digunakan; pencarian ditunda 200 ms saat mengetik. Tidak ada cache jangka panjang untuk status alat atau otorisasi. Refresh daftar dan detail admin setelah penyimpanan berjalan bersamaan; daftar admin hanya memuat judul dan metadata. Index tambahan mencakup pemakaian/pencucian alat terbaru dan riwayat jawaban.

Form pencucian dikelompokkan menjadi Identitas alat, Pelaksanaan pencucian, Pemeriksaan hasil, dan Verifikasi. Pertanyaan tambahan tetap tersedia. Form umum dikelompokkan setiap delapan pertanyaan. Bagian dapat diisi tanpa harus melewati wizard. Indikator kelengkapan menghitung field wajib yang sudah memiliki nilai, bukan persetujuan akhir. Pemeriksaan field wajib/format/ukuran lampiran dilakukan sebelum pengiriman dan tetap diulangi server. Tombol kirim menampilkan status penyimpanan; pengiriman ganda ditahan. Pilihan referensi ditutup setelah dipilih, dan lampiran menampilkan nama/ukuran serta tombol hapus sebelum pengiriman.

Upload maksimal tiga file berjalan paralel setelah pemeriksaan bucket privat. Server menunggu seluruh upload selesai, termasuk ketika ada yang gagal, sebelum membersihkan file yang berhasil diunggah dari pengiriman gagal. Riwayat operasional dan ketentuan waktu pencucian tidak diubah.

## Deployment dan pemeriksaan

Terapkan migrasi 033 setelah 032 dan 034 setelah 033 dan 035 setelah 034 dan 036 setelah 035 dan 037 setelah 036, lalu deploy aplikasi. Form umum tidak bergantung pada modul Production. Tautan lama `/dashboard/forms` diarahkan ke lokasi Administration yang baru. Migrasi bersifat tambahan, tidak mengubah catatan produksi lama, dan tidak membuat template aktif otomatis. Tidak perlu environment secret Apps Script untuk form native. Akses Storage menggunakan service role server yang sudah digunakan aplikasi.

Pemeriksaan lokal:
- `npx tsx --test tests/native-forms.test.ts tests/native-forms-database.test.ts`
- `TEST_NATIVE_FORMS_ONLY=1 npm run test:e2e`

Tes browser memakai adapter Storage lokal untuk menguji alur API upload dan otorisasi; pengaturan Storage cloud perlu diverifikasi saat deployment. Halaman admin menampilkan maksimal 100 jawaban terbaru per form pada versi awal; seluruh jawaban tetap tersimpan. Form builder belum mencakup conditional sections, rumus, tanda tangan, multi-select, atau pengisian offline.

Status pemeriksaan pengembangan: tes unit dan database untuk validasi, versi, replay, hak akses dan pemilihan ID telah lulus. Tes browser mencakup pembuatan/penerbitan form, pengiriman PDF tanpa login, unduhan admin, QR, jeda form dan pencucian alat. Adapter Storage dipakai pada tes browser. Bucket cloud privat juga telah diuji terpisah melalui upload PDF, penolakan akses publik, unduhan bertempo dan penghapusan file uji.
