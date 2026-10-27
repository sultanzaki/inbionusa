# Rencana teknis alat dan pencucian

Status: implementasi awal tersedia di codebase (migrasi 030, halaman alat, dan perintah operasional). Migrasi dan tes alur dijalankan di database lokal. Belum diterapkan ke produksi; pemeriksaan browser dan regresi lintas modul masih diperlukan.

## Aturan operasional

- Alat baru mulai dalam keadaan perlu pemeriksaan; siap dipakai hanya setelah pencucian dan pemeriksaan tercatat.
- Pemeriksa boleh sama dengan petugas pencucian, tetapi keduanya tetap dicatat.
- Sebelum batch dimulai, setiap alat yang dipilih harus bersih, layak, aktif, dan tidak sedang dipakai batch lain. Persyaratan berlaku juga untuk produk yang sama.
- Setelah pemakaian selesai atau dibatalkan setelah alat dipakai, alat harus dibersihkan dan diperiksa kembali. Hasil gagal atau kerusakan menahan alat sampai pemeriksaan berikutnya berhasil.
- Riwayat penggunaan, pencucian, kondisi, petugas, dan pemeriksaan dapat ditelusuri dari alat dan batch. Koreksi mencantumkan alasan dan tidak menghapus catatan semula.

## Titik integrasi yang perlu ditangani

1. Aset alat dengan kode unik, identitas, lokasi, status dan versi; izin mengikuti peran produksi.
2. Penugasan alat ke production order, dengan transaksi dan penguncian database agar dua batch tidak mengambil alat yang sama bersamaan.
3. Catatan pencucian dan pemeriksaan yang terhubung ke alat dan pemakaian terakhir, termasuk pemeriksaan awal sebelum pemakaian pertama.
4. Pemeriksaan pada saat rilis/mulai produksi dan semua operasi yang benar-benar mengonsumsi bahan atau mencatat hasil; cegah pemakaian tanpa alat yang valid.
5. Cegah bypass melalui pencatatan produksi langsung (`save_move`/`post_move`). Jalur produksi langsung harus memilih alat dan melewati aturan yang sama, termasuk retry dan permintaan bersamaan.
6. Perubahan status, pembatalan, transaksi gagal, dan pemulihan harus atomik; audit tidak boleh bisa ditulis ulang oleh pengguna aplikasi.
7. Tampilan responsif untuk daftar alat, penggunaan pada batch, form pencucian, hasil pemeriksaan dan riwayat; informasi rahasia BOM tidak boleh terbuka melalui halaman alat.
8. Uji alur pertama, pemakaian berulang, gagal pemeriksaan, perbaikan, pembatalan, dua pengguna bersamaan, hak akses, semua jalur produksi, dan tampilan mobile.

## Keputusan rollout

Data produksi lama dan batch yang masih berjalan perlu ditangani secara eksplisit sebelum aturan wajib diaktifkan. Migrasi dan UI harus diuji bersama; jangan mengaktifkan gerbang produksi baru tanpa cara yang berfungsi untuk mendaftarkan serta memeriksa alat.
