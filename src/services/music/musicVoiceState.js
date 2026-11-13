import { successEmbed } from '../../utils/embeds.js';
import { getGuildMusicData } from '../playerStore.js';
import { applyPause, applyResume, getPlayer } from './musicActions.js';
import fs from 'fs';

const AUDIO_DB_PATH = './audio_stats.json';

function loadAudioDB() {
    if (!fs.existsSync(AUDIO_DB_PATH)) {
        fs.writeFileSync(AUDIO_DB_PATH, JSON.stringify({}));
    }
    return JSON.parse(fs.readFileSync(AUDIO_DB_PATH, 'utf8'));
}

function saveAudioDB(data) {
    fs.writeFileSync(AUDIO_DB_PATH, JSON.stringify(data, null, 2));
}

const userVoiceTimers = new Map();

export async function handleMusicVoiceState(client, oldState, newState) {
    // --- 1. FITUR TRACKING DURASI VOICE (UNTUK PROFIL MUSIK) ---
    const userId = newState.member?.user.id || oldState.member?.user.id;
    if (userId && !newState.member?.user.bot) {
        const now = Date.now();

        // User masuk voice channel
        if (!oldState.channelId && newState.channelId) {
            userVoiceTimers.set(userId, { 
                channelId: newState.channelId, 
                guildId: newState.guild.id, 
                time: now 
            });
        }
        // User keluar voice channel
        else if (oldState.channelId && !newState.channelId) {
            const session = userVoiceTimers.get(userId);
            if (session) {
                const durationInSeconds = Math.floor((now - session.time) / 1000);
                userVoiceTimers.delete(userId);

                if (durationInSeconds >= 5) {
                    const db = loadAudioDB();
                    if (!db[userId]) {
                        db[userId] = { servers: {}, tracks: {}, friends: {} };
                    }

                    // Simpan durasi Top Servers
                    db[userId].servers[session.guildId] = (db[userId].servers[session.guildId] || 0) + durationInSeconds;

                    // Simpan durasi Top Friends
                    const channel = newState.guild.channels.cache.get(session.channelId);
                    if (channel) {
                        channel.members.forEach(member => {
                            if (member.user.id !== userId && !member.user.bot) {
                                db[userId].friends[member.user.id] = (db[userId].friends[member.user.id] || 0) + durationInSeconds;
                            }
                        });
                    }

                    saveAudioDB(db);
                }
            }
        }
    }

    // --- 2. LOGIKA ASLI BOT (AUTO-PAUSE/RESUME MUSIK) ---
    if (client.riffy) {
        // ... kode bawaan bot kamu selanjutnya tetap di sini ...
    }
    
    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) return;

    const player = getPlayer(client, guildId);
    if (!player?.voiceChannel) return;

    const voiceChannel = client.channels.cache.get(player.voiceChannel);
    if (!voiceChannel) return;

    const guildData = getGuildMusicData(guildId);
    const humansInChannel = voiceChannel.members.filter(member => !member.user.bot);
    const hasUsers = humansInChannel.size > 0;

    if (!hasUsers && !player.paused && player.playing) {
        guildData.autoPaused = true;
        await applyPause(client, guildId);
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                channel.send({ embeds: [successEmbed('Paused', 'Voice channel is empty. Music paused until someone joins.')] });
            }
        }
        return;
    }

    if (hasUsers && guildData.autoPaused && player.paused) {
        await applyResume(client, guildId);
        guildData.autoPaused = false;
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                channel.send({ embeds: [successEmbed('Resumed', 'Someone joined the voice channel. Playback resumed.')] });
            }
        }
    }
    }
