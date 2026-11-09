import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setup-staff')
        .setDescription('Kirim panel daftar admin & staff server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.guild) {
            await interaction.reply({ content: "Fitur ini cuma bisa dipakai di dalam server ya!", ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        // Data lengkap divisi, role, deskripsi (sudah direvisi), dan member staff
        const staffGroups = [
            {
                name: 'Eternal Crown',
                roleId: '1515888261921509477',
                desc: 'Pemilik server yang memiliki kendali utama dan bertanggung jawab atas pengelolaan serta keputusan penting server.',
                members: ['<@1451748892055044166>']
            },
            {
                name: 'Crown Duke',
                roleId: '1515889167530459308',
                desc: 'Membantu owner dalam mengelola dan mengawasi server, mengatur jalannya kegiatan, serta memastikan seluruh kepengurusan berjalan dengan baik.',
                members: [
                    '<@1550473357458411592>',
                    '<@1541663046571655260>'
                ]
            },
            {
                name: 'Operator',
                roleId: '156636609850',
                desc: 'Mengatur dan mengelola bot server, memastikan fitur bot berjalan dengan baik, serta membantu menangani kebutuhan teknis server.',
                members: ['<@1302370416332902440>']
            },
            {
                name: 'Aether Council',
                roleId: '1540194481893285969',
                desc: 'Menjaga ketertiban server, membantu member, mengawasi aktivitas chat, serta memastikan suasana tetap aman, nyaman, dan menyenangkan.',
                members: [
                    '<@1542109299247947849>',
                    '<@1536992035016540191>'
                ]
            },
            {
                name: 'Navigator Vanguard',
                roleId: '1549959899990073405',
                desc: 'Memandu member dan membantu mereka menemukan arah di server.',
                members: [
                    '<@1510198720757764207>',
                    '<@757146561204715572>',
                    '<@1524526939711471746>',
                    '<@1461322081517043825>',
                    '<@1137018522032148561>'
                ]
            },
            {
                name: 'Sentinel Watcher',
                roleId: '1547550490894798879',
                desc: 'Menjaga keamanan server, mengawasi aktivitas member, dan menjaga ketertiban server.',
                members: [
                    '<@1500785712243409066>',
                    '<@1510290395588984845>',
                    '<@1433179346813849632>',
                    '<@1525761448087781399>'
                ]
            },
            {
                name: 'Entry Verifier',
                roleId: '1559047040980484146',
                desc: 'Memverifikasi member dan memastikan proses verifikasi berjalan dengan baik.',
                members: [
                    '<@1452478312072089752>',
                    '<@1270656189344251969>'
                ]
            }
        ];

        // Hitung total seluruh staff dari semua divisi
        let totalStaffCount = staffGroups.reduce((acc, group) => acc + group.members.length, 0);

        const staffEmbed = new EmbedBuilder()
            .setTitle(`✨ Daftar Admin & Staff ${interaction.guild.name}`)
            .setDescription(`Staff AKASYAA ${interaction.guild.name}.\n\n🔵 **Total Staff:** ${totalStaffCount} orang`)
            .setColor(0x2b2d31)
            .setTimestamp()
            .setFooter({ text: `Check out channel terkait server` });

        // Masukin setiap divisi ke dalam field embed
        for (const group of staffGroups) {
            const roleHeader = group.roleId ? `<@&${group.roleId}>` : `**${group.name}**`;
            
            const memberList = group.members.length > 0 
                ? group.members.map((m, idx) => `${idx + 1}. ${m}`).join('\n') 
                : '_(Belum ada member)_';

            staffEmbed.addFields({
                name: `👑 ${group.name} — ${group.members.length} member`,
                value: `${roleHeader}\n*${group.desc}*\n\n${memberList}`,
                inline: false
            });
        }

        // Kirim panel embed ke channel publik & konfirmasi ephemeral ke admin
        await interaction.channel.send({ embeds: [staffEmbed] });
        await interaction.editReply({ content: "Berhasil mengirim daftar staff dengan revisi terbaru ke channel ini!" });
    }
};
