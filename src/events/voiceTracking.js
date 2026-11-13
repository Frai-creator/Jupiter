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

const voiceTimers = new Map();

export default {
    name: 'voiceStateUpdate',
    execute(oldState, newState) {
        const userId = newState.member?.user.id || oldState.member?.user.id;
        if (newState.member?.user.bot) return;

        const now = Date.now();

        // User masuk voice channel
        if (!oldState.channelId && newState.channelId) {
            voiceTimers.set(userId, { channelId: newState.channelId, guildId: newState.guild.id, time: now });
        }
        // User keluar voice channel (Hitung durasi)
        else if (oldState.channelId && !newState.channelId) {
            const session = voiceTimers.get(userId);
            if (session) {
                const durationInSeconds = Math.floor((now - session.time) / 1000);
                voiceTimers.delete(userId);

                const db = loadAudioDB();
                if (!db[userId]) {
                    db[userId] = { servers: {}, tracks: {}, friends: {} };
                }

                // Catat waktu di server tersebut
                db[userId].servers[session.guildId] = (db[userId].servers[session.guildId] || 0) + durationInSeconds;

                // Catat teman yang satu voice room
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
};
