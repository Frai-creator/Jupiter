import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fs from 'fs';

const AUDIO_DB_PATH = './audio_stats.json';

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0m';
    const weeks = Math.floor(seconds / (60 * 60 * 24 * 7));
    const days = Math.floor((seconds % (60 * 60 * 24 * 7)) / (60 * 60 * 24));
    const hours = Math.floor((seconds % (60 * 60 * 24)) / (60 * 60));
    
    if (weeks > 0) return `${weeks}w ${days}d`;
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
}

export default {
    // Mendukung Slash Command
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Menampilkan kartu statistik musik ala Jockie Music')
        .addUserOption(option => 
            option.setName('user').setDescription('Pilih user').setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;

        if (!fs.existsSync(AUDIO_DB_PATH)) {
            return interaction.reply({ content: "Belum ada data statistik musik yang tercatat!", ephemeral: true });
        }

        const db = JSON.parse(fs.readFileSync(AUDIO_DB_PATH, 'utf8'));
        const userData = db[userId] || { servers: {}, tracks: {}, friends: {} };

        // Top Servers
        const sortedServers = Object.entries(userData.servers || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const topServersText = sortedServers.length > 0 
            ? sortedServers.map(([guildId, duration], index) => {
                const guild = interaction.client.guilds.cache.get(guildId);
                return `\`${index + 1}\` ${formatDuration(duration)} · ${guild ? guild.name : 'Hidden Server'}`;
              }).join('\n')
            : '`1` Belum ada data server';

        // Top Friends
        const sortedFriends = Object.entries(userData.friends || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const topFriendsText = sortedFriends.length > 0
            ? sortedFriends.map(([friendId, duration], index) => {
                const friend = interaction.client.users.cache.get(friendId);
                return `\`${index + 1}\` ${formatDuration(duration)} · ${friend ? friend.username : 'Hidden User'}`;
              }).join('\n')
            : '`1` Belum ada data teman';

        // Top Tracks
        const sortedTracks = Object.entries(userData.tracks || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const topTracksText = sortedTracks.length > 0
            ? sortedTracks.map(([trackName, count], index) => `\`${index + 1}\` ${trackName}`).join('\n')
            : '`1` Belum ada lagu diputar';

        // Embed Estetik ala Jockie Music
        const profileEmbed = new EmbedBuilder()
            .setColor(0x0E3A2F)
            .setAuthor({ 
                name: `${targetUser.username} • Music Profile`, 
                iconURL: targetUser.displayAvatarURL({ dynamic: true }) 
            })
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .setDescription(`🎧 **Aktivitas & Statistik Musik Otomatis**`)
            .addFields(
                { name: '🏆 TOP SERVERS', value: topServersText, inline: true },
                { name: '👥 TOP FRIENDS', value: topFriendsText, inline: true },
                { name: '🎵 TOP TRACKS', value: topTracksText, inline: false }
            )
            .setFooter({ text: 'JOCKIE MUSIC STYLE • Jupiter Audio' })
            .setTimestamp();

        await interaction.reply({ embeds: [profileEmbed] });
    },

    // (Opsional) Jika bot kamu juga support prefix command teks biasa di folder ini
    async executePrefix(message, args) {
        const targetUser = message.mentions.users.first() || message.author;
        const userId = targetUser.id;

        if (!fs.existsSync(AUDIO_DB_PATH)) {
            return message.reply("Belum ada data statistik musik yang tercatat!");
        }

        const db = JSON.parse(fs.readFileSync(AUDIO_DB_PATH, 'utf8'));
        const userData = db[userId] || { servers: {}, tracks: {}, friends: {} };

        const sortedServers = Object.entries(userData.servers || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const topServersText = sortedServers.length > 0 
            ? sortedServers.map(([guildId, duration], index) => {
                const guild = message.client.guilds.cache.get(guildId);
                return `\`${index + 1}\` ${formatDuration(duration)} · ${guild ? guild.name : 'Hidden Server'}`;
              }).join('\n') : '`1` Belum ada data server';

        const sortedFriends = Object.entries(userData.friends || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const topFriendsText = sortedFriends.length > 0
            ? sortedFriends.map(([friendId, duration], index) => {
                const friend = message.client.users.cache.get(friendId);
                return `\`${index + 1}\` ${formatDuration(duration)} · ${friend ? friend.username : 'Hidden User'}`;
              }).join('\n') : '`1` Belum ada data teman';

        const sortedTracks = Object.entries(userData.tracks || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const topTracksText = sortedTracks.length > 0
            ? sortedTracks.map(([trackName, count], index) => `\`${index + 1}\` ${trackName}`).join('\n') : '`1` Belum ada lagu diputar';

        const profileEmbed = new EmbedBuilder()
            .setColor(0x0E3A2F)
            .setAuthor({ name: `${targetUser.username} • Music Profile`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .setDescription(`🎧 **Aktivitas & Statistik Musik Otomatis**`)
            .addFields(
                { name: '🏆 TOP SERVERS', value: topServersText, inline: true },
                { name: '👥 TOP FRIENDS', value: topFriendsText, inline: true },
                { name: '🎵 TOP TRACKS', value: topTracksText, inline: false }
            )
            .setFooter({ text: 'JOCKIE MUSIC STYLE • Jupiter Audio' })
            .setTimestamp();

        return message.channel.send({ embeds: [profileEmbed] });
    }
};
