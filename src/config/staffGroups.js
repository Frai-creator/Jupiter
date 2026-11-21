// staffGroups.js
// Daftar divisi staff, urut dari yang tertinggi ke terendah.
//
// Member TIDAK ditulis manual lagi: bot membaca siapa saja yang memegang `roleId`
// secara realtime. Cukup kasih / cabut role-nya, daftar staff otomatis ikut berubah.
// Kalau seseorang punya lebih dari satu role staff, dia hanya muncul di divisi tertinggi.
//
// Mau tambah / ubah divisi? Edit di sini lalu restart bot, atau tinggal /setup-staff lagi.

export const DEFAULT_STAFF_GROUPS = [
    {
        name: 'Eternal Crown',
        roleId: '1515888261921509477',
        desc: 'Pemilik server yang memiliki kendali utama dan bertanggung jawab atas pengelolaan serta keputusan penting server.',
    },
    {
        name: 'Crown Duke',
        roleId: '1515889167530459308',
        desc: 'Membantu owner dalam mengelola dan mengawasi server, mengatur jalannya kegiatan, serta memastikan seluruh kepengurusan berjalan dengan baik.',
    },
    {
        name: 'Operator',
        roleId: '1566366098507702292',
        desc: 'Mengatur dan mengelola bot server, memastikan fitur bot berjalan dengan baik, serta membantu menangani kebutuhan teknis server.',
    },
    {
        name: 'Aether Council',
        roleId: '1540194481893285969',
        desc: 'Menjaga ketertiban server, membantu member, mengawasi aktivitas chat, serta memastikan suasana tetap aman, nyaman, dan menyenangkan.',
    },
    {
        name: 'Navigator Vanguard',
        roleId: '1549959899990073405',
        desc: 'Memandu member dan membantu mereka menemukan arah di server.',
    },
    {
        name: 'Sentinel Watcher',
        roleId: '1547550490894798879',
        desc: 'Menjaga keamanan server, mengawasi aktivitas member, dan menjaga ketertiban server.',
    },
    {
        name: 'Entry Verifier',
        roleId: '1559047040980484146',
        desc: 'Memverifikasi member dan memastikan proses verifikasi berjalan dengan baik.',
    },
];

export const STAFF_ROLE_IDS = new Set(DEFAULT_STAFF_GROUPS.map((g) => g.roleId));
