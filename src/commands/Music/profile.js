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
        .setDescription('Menampilkan profil statistik musik ala Jockie Music')
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

        // 1. TOP SERVERS (1-3)
        const sortedServers = Object.entries(userData.servers || {}).sort((a, b) => b[1] - a[1]);
        let topServersLines = [];
        for (let i = 0; i < 3; i++) {
            if (sortedServers[i]) {
                const [guildId, duration] = sortedServers[i];
                const guild = interaction.client.guilds.cache.get(guildId);
                const sName = guild ? guild.name : 'Unknown Server';
                topServersLines.push(`🟦 \`#${i + 1}\` **${formatDuration(duration)}** · ${sName}`);
            } else {
                topServersLines.push(`🟦 \`#${i + 1}\` 0m · Belum ada data`);
            }
        }

        // 2. TOP FRIENDS (1-3)
        const sortedFriends = Object.entries(userData.friends || {}).sort((a, b) => b[1] - a[1]);
        let topFriendsLines = [];
        for (let i = 0; i < 3; i++) {
            if (sortedFriends[i]) {
                const [friendId, duration] = sortedFriends[i];
                const friend = interaction.client.users.cache.get(friendId);
                const fName = friend ? friend.username : 'Unknown User';
                topFriendsLines.push(`🟦 \`#${i + 1}\` **${formatDuration(duration)}** · ${fName}`);
            } else {
                topFriendsLines.push(`🟦 \`#${i + 1}\` 0m · Belum ada teman`);
            }
        }

        // 3. TOP TRACKS (1-3)
        const sortedTracks = Object.entries(userData.tracks || {}).sort((a, b) => b[1] - a[1]);
        let topTracksLines = [];
        for (let i = 0; i < 3; i++) {
            if (sortedTracks[i]) {
                const [trackName, count] = sortedTracks[i];
                topTracksLines.push(`🟦 \`#${i + 1}\` ${count}x · ${trackName}`);
            } else {
                topTracksLines.push(`🟦 \`#${i + 1}\` Belum ada lagu diputar`);
            }
        }

        // Embed Biru Muda / Cyan Elegan
        const profileEmbed = new EmbedBuilder()
            .setColor(0x008DDA) // Biru Jockie Style
            .setAuthor({ 
                name: `${targetUser.username} • Music Profile`, 
                iconURL: targetUser.displayAvatarURL({ dynamic: true }) 
            })
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '🌐 TOP SERVERS', value: topServersLines.join('\n'), inline: true },
                { name: '👥 TOP FRIENDS', value: topFriendsLines.join('\n'), inline: true },
                { name: '🎵 TOP TRACKS', value: topTracksLines.join('\n'), inline: false }
            )
            .setFooter({ text: 'JOCKIE MUSIC STYLE • Jupiter Audio' })
            .setTimestamp();

        await interaction.reply({ embeds: [profileEmbed] });
    }
};
