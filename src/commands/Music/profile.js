import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fs from 'fs';

const AUDIO_DB_PATH = './audio_stats.json';

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0m';
    const weeks = Math.floor(seconds / (60 * 60 * 24 * 7));
    const days = Math.floor((seconds % (60 * 60 * 24 * 7)) / (60 * 60 * 24));
    const hours = Math.floor((seconds % (60 * 60 * 24)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    
    if (weeks > 0) return `${weeks}w ${days}d`;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Menampilkan kartu statistik musik bersih ala Jockie Music')
        .addUserOption(option => 
            option.setName('user').setDescription('Pilih user').setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;

        let db = {};
        if (fs.existsSync(AUDIO_DB_PATH)) {
            db = JSON.parse(fs.readFileSync(AUDIO_DB_PATH, 'utf8'));
        }
        const userData = db[userId] || { servers: {}, tracks: {}, friends: {} };

        // Nomor kotak hijau ala Jockie (bisa pakai emoji 1️⃣ 2️⃣ 3️⃣ atau kotak teks)
        const numIcons = ['🟩', '🟩', '🟩']; // Atau pakai emoji angka

        // 1. TOP SERVERS (Nama asli, gak di-hidden)
        const sortedServers = Object.entries(userData.servers || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const topServersText = sortedServers.length > 0 
            ? sortedServers.map(([guildId, duration], index) => {
                const guild = interaction.client.guilds.cache.get(guildId);
                const sName = guild ? guild.name : 'Unknown Server';
                return `\` #${index + 1} \` **${formatDuration(duration)}** · ${sName}`;
              }).join('\n')
            : '\` #1 \` 0m · Belum ada data';

        // 2. TOP FRIENDS (Nama asli user, gak di-hidden)
        const sortedFriends = Object.entries(userData.friends || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const topFriendsText = sortedFriends.length > 0
            ? sortedFriends.map(([friendId, duration], index) => {
                const friend = interaction.client.users.cache.get(friendId);
                const fName = friend ? friend.username : 'Unknown User';
                return `\` #${index + 1} \` **${formatDuration(duration)}** · ${fName}`;
              }).join('\n')
            : '\` #1 \` 0m · Belum ada teman';

        // 3. TOP TRACKS (Judul lagu asli)
        const sortedTracks = Object.entries(userData.tracks || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const topTracksText = sortedTracks.length > 0
            ? sortedTracks.map(([trackName, count], index) => `\` #${index + 1} \` ${trackName}`).join('\n')
            : '\` #1 \` Belum ada lagu diputar';

        // Embed Bersih & Elegan ala Jockie Music
        const profileEmbed = new EmbedBuilder()
            .setColor(0x0E3A2F) // Hijau gelap khas Jockie
            .setAuthor({ 
                name: `${targetUser.username}`, 
                iconURL: targetUser.displayAvatarURL({ dynamic: true }) 
            })
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: 'TOP SERVERS', value: topServersText, inline: true },
                { name: 'TOP FRIENDS', value: topFriendsText, inline: true },
                { name: 'TOP TRACKS', value: topTracksText, inline: false }
            )
            .setFooter({ text: 'JOCKIE MUSIC • Jupiter' })
            .setTimestamp();

        await interaction.reply({ embeds: [profileEmbed] });
    }
};
