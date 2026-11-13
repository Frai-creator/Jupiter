import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
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

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
}

async function generateProfileCard(client, targetUser, userData) {
    const width = 900;
    const height = 520;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Background Biru Gelap Gradien (Elegan & Modern)
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0B192C');
    bgGrad.addColorStop(1, '#1E3E62');
    roundRect(ctx, 0, 0, width, height, 24);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // Badge Kanan Atas (Biru Terang)
    ctx.fillStyle = '#008DDA';
    roundRect(ctx, width - 210, 24, 180, 32, 6);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JUPITER MUSIC', width - 120, 45);
    ctx.textAlign = 'left';

    // 2. Avatar User + Border Biru Muda (Cyan)
    const avatarX = 45;
    const avatarY = 30;
    const avatarSize = 100;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    try {
        const avatarURL = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
        const avatarImg = await loadImage(avatarURL);
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    } catch {
        ctx.fillStyle = '#145DA0';
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#41C9E2'; // Border Cyan Terang
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();

    // Username & Subtitle
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(targetUser.username, 170, 78);

    ctx.fillStyle = '#94O8B0'; // Soft Blue/Cyan Accent
    ctx.fillStyle = '#A6F1E0'; 
    ctx.font = '15px sans-serif';
    ctx.fillText('Audio & Voice Activity Profile', 170, 106);

    // 3. Panel Kotak Container (Biru Transparan)
    const boxY = 155;
    const boxHeight = 165;
    const halfWidth = 395;

    ctx.fillStyle = 'rgba(15, 32, 67, 0.65)';
    roundRect(ctx, 40, boxY, halfWidth, boxHeight, 12); // Panel Kiri (Servers)
    ctx.fill();

    roundRect(ctx, 465, boxY, halfWidth, boxHeight, 12); // Panel Kanan (Friends)
    ctx.fill();

    const bottomY = 340;
    const bottomHeight = 155;
    roundRect(ctx, 40, bottomY, 820, bottomHeight, 12); // Panel Bawah (Tracks)
    ctx.fill();

    // Judul Panel (Warna Biru Muda)
    ctx.fillStyle = '#41C9E2';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('TOP SERVERS', 60, boxY + 28);
    ctx.fillText('TOP FRIENDS', 485, boxY + 28);
    ctx.fillText('TOP TRACKS', 60, bottomY + 28);

    // Data Sumber
    const sortedServers = Object.entries(userData.servers || {}).sort((a, b) => b[1] - a[1]);
    const sortedFriends = Object.entries(userData.friends || {}).sort((a, b) => b[1] - a[1]);
    const sortedTracks = Object.entries(userData.tracks || {}).sort((a, b) => b[1] - a[1]);

    for (let i = 0; i < 3; i++) {
        const rowOffset = i * 38;
        // Kotak nomor urut: Peringkat 1 Biru Terang (Cyan), 2-3 Biru Sedang
        const badgeColor = i === 0 ? '#008DDA' : '#145DA0';

        // --- TOP SERVERS ---
        const sy = boxY + 44 + rowOffset;
        ctx.fillStyle = badgeColor;
        roundRect(ctx, 60, sy, 26, 26, 5);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${i + 1}`, 73, sy + 18);
        ctx.textAlign = 'left';

        let serverLabel = '0m · Belum ada data';
        if (sortedServers[i]) {
            const [gId, dur] = sortedServers[i];
            const guild = client.guilds.cache.get(gId);
            serverLabel = `${formatDuration(dur)} · ${guild ? guild.name : 'Unknown Server'}`;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px sans-serif';
        ctx.fillText(truncateText(ctx, serverLabel, 310), 98, sy + 18);

        // --- TOP FRIENDS ---
        ctx.fillStyle = badgeColor;
        roundRect(ctx, 485, sy, 26, 26, 5);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${i + 1}`, 498, sy + 18);
        ctx.textAlign = 'left';

        let friendLabel = '0m · Belum ada teman';
        if (sortedFriends[i]) {
            const [fId, dur] = sortedFriends[i];
            const friend = client.users.cache.get(fId);
            friendLabel = `${formatDuration(dur)} · ${friend ? friend.username : 'Unknown User'}`;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px sans-serif';
        ctx.fillText(truncateText(ctx, friendLabel, 310), 523, sy + 18);

        // --- TOP TRACKS ---
        const ty = bottomY + 42 + (i * 34);
        ctx.fillStyle = badgeColor;
        roundRect(ctx, 60, ty, 24, 24, 5);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${i + 1}`, 72, ty + 17);
        ctx.textAlign = 'left';

        let trackLabel = 'Belum ada lagu diputar';
        if (sortedTracks[i]) {
            const [tName, count] = sortedTracks[i];
            trackLabel = `${count}x pemutaran · ${tName}`;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px sans-serif';
        ctx.fillText(truncateText(ctx, trackLabel, 730), 96, ty + 17);
    }

    return canvas.toBuffer('image/png');
}

export default {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Menampilkan kartu statistik musik landscape bernuansa biru muda')
        .addUserOption(option =>
            option.setName('user').setDescription('Pilih user').setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;

        let db = {};
        if (fs.existsSync(AUDIO_DB_PATH)) {
            db = JSON.parse(fs.readFileSync(AUDIO_DB_PATH, 'utf8'));
        }
        const userData = db[userId] || { servers: {}, tracks: {}, friends: {} };

        const buffer = await generateProfileCard(interaction.client, targetUser, userData);
        const attachment = new AttachmentBuilder(buffer, { name: 'music-profile.png' });

        await interaction.editReply({ files: [attachment] });
    }
};
