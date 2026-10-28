# Tempat dan ruangan

Struktur fisik memakai dua tingkat: **Tempat → Ruangan**. Contoh: tempat `KBI`, dengan ruangan `Gudang`, `Lab`, dan `Produksi`. Tampilan lokasi menjadi `KBI/Lab`. Jenis ruangan tersedia: Gudang, Laboratorium, Produksi, Kantor, Lainnya. Jenis merupakan klasifikasi, tidak memindahkan stok atau membuat transaksi otomatis.

## Penggunaan

Administrator membuka **Administration → Sites & rooms / Tempat & ruangan**. Buat tempat, lalu tambahkan ruangan dan pilih jenisnya. Nama dan jenis dapat diedit. Nama tempat harus unik; nama ruangan unik di tempat yang sama, tanpa membedakan huruf besar/kecil. Tanda `/` dipakai sistem sebagai pemisah, bukan bagian nama baru.

Kode tempat/ruangan tidak diminta dan tidak ditampilkan sebagai label pemilihan. Kode teknis lama dipertahankan dan kode teknis baru dibuat otomatis untuk kompatibilitas. Contoh identitas yang ditampilkan hanya `KBI/Lab`.

Ruangan aktif di tempat aktif muncul pada pilihan **Area Kerja** form pencucian meskipun belum mempunyai alat. Pilihan alat mengikuti ruangan; jika kosong, pengisi melihat bahwa belum ada alat yang tersedia. Daftarkan alat dengan memilih ruangan tersebut. Alat yang sedang dipakai tetap tidak bisa dipilih untuk pencucian. Pengguna pencuci/pemeriksa tetap harus memiliki izin operasional pada tempat terkait.

Referensi ERP `Tempat` dan `Ruangan` merupakan master data bersama, bukan hanya Warehouse. Izin modul transaksi dan cakupan akses tempat tetap diperiksa pada penggunaan operasional. Administrator mengatur batas tempat melalui menu **Site access / Akses tempat**; izin lama tetap berlaku pada tempat yang sama.

## Riwayat dan kompatibilitas

Migrasi **037** diterapkan setelah **036**. Tabel induk lama `erp_warehouses` dipakai sebagai tempat fisik dan `erp_locations` menjadi ruangan. Nama tabel, ID, foreign key, ledger, saldo, dan cakupan akses lama dipertahankan. Tidak ada tempat tiruan atau duplikasi lokasi untuk lab/produksi. Penamaan `warehouse_id` pada kontrak internal tetap digunakan untuk kompatibilitas; UI menampilkannya sebagai Tempat.

Setiap lokasi lama memperoleh `room_name`, `room_kind` (awal: Warehouse), dan versi. Label lokasi dinormalisasi menjadi `Nama tempat/Nama ruangan`; jumlah stok dan identitas lokasi tetap. Administrator dapat mengoreksi jenis ruangan lama. Perubahan nama memperbarui label operasional saat ini, bukan snapshot jawaban/dokumen atau audit historis.

Ruangan yang telah dibuat tidak dapat dipindahkan ke tempat lain melalui editor. Buat ruangan di tempat tujuan dan gunakan transaksi pemindahan yang sesuai untuk stok. Menonaktifkan ruangan/tempat ditolak jika masih ada stok, stock opname, pergerakan draft, transfer, order produksi terbuka, atau alat yang sedang dipakai/dicuci. Riwayat tidak dihapus saat lokasi dinonaktifkan.

Integrasi Google Form lama tetap mengenali nama ruangan tanpa awalan tempat bila alat/lokasi cocok tepat satu aset. Jika nama berulang antar tempat menyebabkan ambigu, pengiriman ditolak untuk peninjauan. Form native memakai ID alat dan label jalur lengkap. Halaman pengisian yang sudah terbuka sebelum migrasi sebaiknya dimuat ulang untuk memperoleh pilihan baru.

Rute lama `/dashboard/warehouse/sites`, `/dashboard/warehouse/locations`, dan pengaturan `?view=locations` diarahkan ke `/dashboard/admin/places`.

## Pemeriksaan

- `npm test`
- `npm run test:forms`
- `npm run test:places` (database lokal terisolasi; jalankan migrasi dasar melalui `npm run test:db` terlebih dahulu pada lingkungan baru)
- `TEST_NATIVE_FORMS_ONLY=1 npm run test:e2e`

Tes mencakup pembuatan tanpa kode, keunikan nama, perubahan nama tanpa mengubah relasi alat/saldo, versi stale, akses per tempat, ruangan tanpa alat pada form, penonaktifan yang ditolak saat masih ada kegiatan aktif, serta alur tambah/edit pada desktop dan mobile.
