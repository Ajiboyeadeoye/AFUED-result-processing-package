// import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
// import { Boom } from '@hapi/boom';
// import pino from 'pino';

// let sock;
// let isReady = false;

// // Adjust this to your default country code
// const DEFAULT_COUNTRY_CODE = '234';

// // ------------------- Connect to WhatsApp -------------------
// export const connectToWhatsApp = async () => {
//     const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
//     const { version } = await fetchLatestBaileysVersion();

//     sock = makeWASocket({
//         auth: state,
//         logger: pino({ level: 'silent' }),
//         browser: ['Chrome', 'Linux', '4.0.0'],
//         version,
//         getMessage: async () => undefined,
//     });

//     // Save credentials automatically
//     sock.ev.on('creds.update', saveCreds);

//     sock.ev.on('connection.update', (update) => {
//         const { connection, lastDisconnect, qr } = update;

//         if (connection === 'open') {
//             console.log('✅ Connection opened successfully!');
//             isReady = true;
//         } else if (connection === 'close') {
//             isReady = false;
//             const statusCode = (lastDisconnect?.error instanceof Boom)
//                 ? lastDisconnect.error.output.statusCode
//                 : 0;
//             const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
//             console.log('⚠️ Connection closed, reconnecting:', shouldReconnect);
//             if (shouldReconnect) connectToWhatsApp();
//         }

//         if (qr) console.log('📸 QR Code received:', qr);
//     });

//     sock.ev.on('messages.upsert', async (m) => {
//         const message = m.messages[0];
//         if (m.type === 'notify' && message && !message.key.fromMe) {
//             const text = message.message?.conversation || '';
//             console.log(`💬 Received message from ${message.key.remoteJid}: ${text}`);
//         }
//     });
// };

// // ------------------- Send WhatsApp Message -------------------
// export const sendWhatsAppMessage = async (to, message, retries = 3) => {
//     if (!sock || !sock.user) throw new Error('WhatsApp service unavailable');

//     // Handle full JID conversion
//     if (!to.includes('@')) {
//         to = to.replace(/\D/g, ''); // remove non-digit characters
//         if (to.startsWith('0')) to = DEFAULT_COUNTRY_CODE + to.slice(1);
//         to += '@s.whatsapp.net';
//     }

//     // Wait until socket is ready
//     if (!isReady) {
//         console.log('⏳ Waiting for WhatsApp socket to be ready...');
//         await new Promise((resolve, reject) => {
//             const timeout = setTimeout(() => reject(new Error('Socket not ready in time')), 40000);
//             const interval = setInterval(() => {
//                 if (isReady) {
//                     clearTimeout(timeout);
//                     clearInterval(interval);
//                     resolve();
//                 }
//             }, 500);
//         });
//         // Small delay to ensure full session sync
//         await new Promise(r => setTimeout(r, 2000));
//     }

//     // Retry with exponential backoff
//     for (let attempt = 1; attempt <= retries; attempt++) {
//         try {
//             await sock.sendMessage(to, { text: message });
//             console.log(`✅ Message sent to ${to}`);
//             return;
//         } catch (err) {
//             console.warn(`⚠️ Attempt ${attempt} failed: ${err.message}`);
//             if (attempt < retries) await new Promise(r => setTimeout(r, 2000 * attempt)); // backoff
//         }
//     }

//     throw new Error(`🚫 Failed to send message to ${to} after ${retries} attempts`);
// };

// // ------------------- Initialize -------------------
// connectToWhatsApp();


import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { exec } from 'child_process';
import notifier from 'node-notifier';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sock;
let isReady = false;
const DEFAULT_COUNTRY_CODE = '234';

// Store conversation context for replies
const conversationContext = new Map();

// ------------------- Notification Functions -------------------
class NotificationManager {
    static async sendWhatsAppNotification(contactName, message, messageData) {
        const notificationId = Date.now().toString();
        
        // Store context for reply
        conversationContext.set(notificationId, {
            remoteJid: messageData.key.remoteJid,
            contactName: contactName,
            originalMessage: message,
            timestamp: Date.now()
        });

        // Clean up old contexts (older than 1 hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        for (const [id, context] of conversationContext.entries()) {
            if (context.timestamp < oneHourAgo) {
                conversationContext.delete(id);
            }
        }

        // Send notification with actions
        try {
            // Method 1: Using node-notifier (supports actions on Linux)
            notifier.notify({
                title: `WhatsApp - ${contactName}`,
                message: message.length > 100 ? message.substring(0, 100) + '...' : message,
                icon: path.join(__dirname, 'whatsapp-icon.png'), // Optional: add a WhatsApp icon
                timeout: 10, // Wait for user action
                actions: ['Reply', 'Mark as Read', 'Ignore'],
                sound: true,
                // Custom identifier for tracking
                id: notificationId
            });
 
            // Method 2: Fallback to notify-send (for systems without node-notifier actions)
            this.sendSystemNotification(contactName, message, notificationId);

        } catch (error) {
            console.error('Notification error:', error);
            // Fallback to basic system notification
            this.sendSystemNotification(contactName, message, notificationId);
        }

        // Handle notification interactions
        this.setupNotificationHandlers(notificationId);
    }

    static sendSystemNotification(contactName, message, notificationId) {
        const cleanMessage = message.replace(/"/g, '\\"');
        const command = `notify-send "WhatsApp - ${contactName}" "${cleanMessage}" -u normal -t 10000`;
        
        exec(command, (error) => {
            if (error) {
                console.error('System notification failed:', error);
            }
        });
    }

    static setupNotificationHandlers(notificationId) {
        // Handle clicks and actions from node-notifier
        notifier.on('click', (notification, options) => {
            if (options.id === notificationId) {
                this.handleNotificationAction('click', notificationId);
            }
        });

        notifier.on('timeout', (notification, options) => {
            if (options.id === notificationId) {
                this.handleNotificationAction('timeout', notificationId);
            }
        });

        // Note: Action handling varies by system. On some Linux systems,
        // you might need to use DBus for proper action handling
    }

    static handleNotificationAction(action, notificationId) {
        const context = conversationContext.get(notificationId);
        if (!context) return;

        console.log(`Notification ${action} for message from ${context.contactName}`);
        
        if (action === 'Reply') {
            this.promptForReply(context);
        }
    }

    static promptForReply(context) {
        // This is a simplified approach. For a better solution, you might want to:
        // 1. Create a simple GUI input dialog
        // 2. Use a terminal input prompt
        // 3. Integrate with a desktop environment's native reply feature
        
        console.log(`\n💬 Replying to ${context.contactName}`);
        console.log(`Original: ${context.originalMessage}`);
        console.log('Type your reply (press Ctrl+C to cancel):');
        
        // Simple terminal-based reply (you can enhance this with readline)
        process.stdin.once('data', (data) => {
            const reply = data.toString().trim();
            if (reply && sock) {
                this.sendReply(context.remoteJid, reply);
            }
        });
    }

    static async sendReply(remoteJid, replyText) {
        try {
            await sock.sendMessage(remoteJid, { text: replyText });
            console.log(`✅ Reply sent to ${remoteJid}`);
            
            // Send confirmation notification
            notifier.notify({
                title: 'WhatsApp - Reply Sent',
                message: `Reply sent successfully`,
                timeout: 3
            });
        } catch (error) {
            console.error('Failed to send reply:', error);
            notifier.notify({
                title: 'WhatsApp - Error',
                message: `Failed to send reply: ${error.message}`,
                timeout: 5
            });
        }
    }

    static extractContactName(remoteJid) {
        // Extract phone number from JID
        const phoneNumber = remoteJid.split('@')[0];
        
        // Try to get contact name from WhatsApp
        // You can enhance this by checking sock.contacts
        return `+${phoneNumber}`;
    }
}

// ------------------- Enhanced WhatsApp Client -------------------
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
            
            // Send welcome notification
            notifier.notify({
                title: 'WhatsApp',
                message: 'Connected to WhatsApp successfully!',
                timeout: 3
            });
        } else if (connection === 'close') {
            isReady = false;
            const statusCode = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error.output.statusCode
                : 0;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ Connection closed, reconnecting:', shouldReconnect);
            
            // Notify about disconnection
            notifier.notify({
                title: 'WhatsApp',
                message: 'Connection lost. Reconnecting...',
                timeout: 5
            });
            
            if (shouldReconnect) {
                connectToWhatsApp()};
        }

        if (qr) {
            console.log('📸 QR Code received:', qr);
            notifier.notify({
                title: 'WhatsApp',
                message: 'QR Code ready for scanning',
                timeout: 10
            });
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (m.type === 'notify' && message && !message.key.fromMe) {
            await processIncomingMessage(message);
        }
    });

    // Handle presence updates to get contact names
    sock.ev.on('contacts.update', (updates) => {
        updates.forEach(update => {
            console.log(`Contact updated: ${update.name} (${update.id})`);
        });
    });
};

// ------------------- Process Incoming Messages -------------------
async function processIncomingMessage(message) {
    try {
        // Extract message text
        const text = extractMessageText(message);
        if (!text) return;

        const remoteJid = message.key.remoteJid;
        const contactName = NotificationManager.extractContactName(remoteJid);
        
        console.log(`💬 Received message from ${contactName}: ${text}`);
        
        // Send desktop notification
        await NotificationManager.sendWhatsAppNotification(contactName, text, message);
        
        // Mark as read
        if (sock) {
            await sock.readMessages([message.key]);
        }
        
    } catch (error) {
        console.error('Error processing message:', error);
    }
}

function extractMessageText(message) {
    const messageTypes = [
        'conversation',
        'extendedTextMessage',
        'imageMessage',
        'videoMessage',
        'audioMessage',
        'documentMessage'
    ];

    for (const type of messageTypes) {
        if (message.message?.[type]) {
            if (type === 'conversation') {
                return message.message[type];
            } else if (type === 'extendedTextMessage') {
                return message.message[type].text;
            } else if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(type)) {
                const caption = message.message[type].caption;
                return caption || `[${type.replace('Message', '')}]`;
            }
        }
    }
    
    return `[Unsupported message ${type}]`;
}

// ------------------- Send WhatsApp Message -------------------
export const sendWhatsAppMessage = async (to, message, retries = 3) => {
    if (!sock || !sock.user) throw new Error('WhatsApp service unavailable');

    // Handle full JID conversion
    if (!to.includes('@')) {
        to = to.replace(/\D/g, '');
        if (to.startsWith('0')) to = DEFAULT_COUNTRY_CODE + to.slice(1);
        to += '@s.whatsapp.net';
    }

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
        await new Promise(r => setTimeout(r, 2000));
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await sock.sendMessage(to, { text: message });
            console.log(`✅ Message sent to ${to}`);
            
            // Send notification confirmation
            notifier.notify({
                title: 'WhatsApp',
                message: `Message sent to ${to}`,
                timeout: 3
            });
            
            return;
        } catch (err) {
            console.warn(`⚠️ Attempt ${attempt} failed: ${err.message}`);
            if (attempt < retries) await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }

    throw new Error(`🚫 Failed to send message to ${to} after ${retries} attempts`);
};

// ------------------- CLI Interface for Replies -------------------
import readline from 'readline';

function setupCLIInterface() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\n🤖 WhatsApp Linux Notifier Started');
    console.log('Type "quit" to exit\n');

    rl.on('line', (input) => {
        if (input.toLowerCase() === 'quit') {
            console.log('Goodbye! 👋');
            process.exit(0);
        }
    });
}

// ------------------- Initialize -------------------
// connectToWhatsApp();
// setupCLIInterface();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    notifier.notify({
        title: 'WhatsApp',
        message: 'WhatsApp client shutting down',
        timeout: 3
    });
    process.exit(0);
});