import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';

let sock;
let isReady = false;

// Adjust this to your default country code
const DEFAULT_COUNTRY_CODE = '234';

// ------------------- Connect to WhatsApp -------------------
export const connectToWhatsApp = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Chrome', 'Linux', '4.0.0'],
        version,
        getMessage: async () => undefined,
    });

    // Save credentials automatically
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'open') {
            console.log('✅ Connection opened successfully!');
            isReady = true;
        } else if (connection === 'close') {
            isReady = false;
            const statusCode = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error.output.statusCode
                : 0;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        }

        if (qr) console.log('📸 QR Code received:', qr);
    });

    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (m.type === 'notify' && message && !message.key.fromMe) {
            const text = message.message?.conversation || '';
            console.log(`💬 Received message from ${message.key.remoteJid}: ${text}`);
        }
    });
};

// ------------------- Send WhatsApp Message -------------------
export const sendWhatsAppMessage = async (to, message, retries = 3) => {
    if (!sock || !sock.user) throw new Error('WhatsApp service unavailable');

    // Handle full JID conversion
    if (!to.includes('@')) {
        to = to.replace(/\D/g, ''); // remove non-digit characters
        if (to.startsWith('0')) to = DEFAULT_COUNTRY_CODE + to.slice(1);
        to += '@s.whatsapp.net';
    }

    // Wait until socket is ready
    if (!isReady) {
        console.log('⏳ Waiting for WhatsApp socket to be ready...');
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Socket not ready in time')), 40000);
            const interval = setInterval(() => {
                if (isReady) {
                    clearTimeout(timeout);
                    clearInterval(interval);
                    resolve();
                }
            }, 500);
        });
        // Small delay to ensure full session sync
        await new Promise(r => setTimeout(r, 2000));
    }

    // Retry with exponential backoff
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await sock.sendMessage(to, { text: message });
            console.log(`✅ Message sent to ${to}`);
            return;
        } catch (err) {
            console.warn(`⚠️ Attempt ${attempt} failed: ${err.message}`);
            if (attempt < retries) await new Promise(r => setTimeout(r, 2000 * attempt)); // backoff
        }
    }

    throw new Error(`🚫 Failed to send message to ${to} after ${retries} attempts`);
};

// ------------------- Initialize -------------------
connectToWhatsApp();
