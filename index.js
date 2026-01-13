const express = require('express');
const cors = require('cors');
const { findAnswerInSheet } = require('./sheets');
const { sendMessage } = require('./facebook');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// GLOBAL LOGGER: Log every request!
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Main Route
app.get('/', (req, res) => {
    res.send('VERSION 2: READY - Server is Online! 🚀');
});

// ==========================================
// 1. Webhook Verification (Facebook จะเรียกส่วนนี้ตอนตั้งค่าครั้งแรก)
// ==========================================
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400); // Bad Request if no parameters
    }
});

// ==========================================
// 2. Webhook Event Handling (เวลามีคนพิมพ์ข้อความมา)
// ==========================================
// In-memory stickiness (USER_ID -> TIMESTAMP when to resume)
const pausedUsers = new Map();

// ==========================================
// 2. Webhook Event Handling (เวลามีคนพิมพ์ข้อความมา)
// ==========================================
app.post('/webhook', async (req, res) => {
    const body = req.body;
    console.log("========================================");
    console.log("DEBUG: POST /webhook hit!");
    // console.log("DEBUG: Body:", JSON.stringify(body, null, 2)); // Reduce noise
    console.log("========================================");

    if (body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED');

        for (const entry of body.entry) {
            const webhook_event = entry.messaging ? entry.messaging[0] : null;

            if (webhook_event && webhook_event.message && webhook_event.message.text) {
                const sender_psid = webhook_event.sender.id;
                const received_text = webhook_event.message.text.trim(); // Trim whitespace
                console.log(`Received message from ${sender_psid}: ${received_text}`);

                // ---------------------------------------------------------
                // 1. CHECK PAUSE STATE (โหมดคุยกับคน)
                // ---------------------------------------------------------
                const resumeTime = pausedUsers.get(sender_psid);
                const isPaused = resumeTime && Date.now() < resumeTime;

                // Keywords to RESUME bot
                if (received_text === "จบการสนทนา" || received_text === "จบบทสนทนา") {
                    pausedUsers.delete(sender_psid);
                    sendMessage(sender_psid, "ระบบอัตโนมัติกลับมาทำงานแล้วครับ (ถ้ามีอะไรให้ช่วย พิมพ์ถามได้เลยนะครับ)");
                    continue; // Skip the rest, handled here
                }

                // If Paused: Do NOTHING (let human answer) except logging
                if (isPaused) {
                    console.log(`[PAUSED] User ${sender_psid} is talking to human. Ignoring message.`);
                    continue;
                }

                // Keywords to PAUSE bot
                if (received_text === "ติดต่อเจ้าหน้าที่" || received_text === "ติดต่อคน") {
                    // Set pause for 30 minutes
                    const timeoutMinutes = 30;
                    const resumeTimestamp = Date.now() + (timeoutMinutes * 60 * 1000);
                    pausedUsers.set(sender_psid, resumeTimestamp);

                    sendMessage(sender_psid, `รับทราบครับ! บอทจะหยุดทำงาน 30 นาทีเพื่อให้เจ้าหน้าที่มาตอบนะครับ\n\n(ถ้าคุยเสร็จแล้ว พิมพ์คำว่า "จบการสนทนา" เพื่อเรียกบอทกลับมาได้ทันทีครับ)`);
                    continue;
                }

                // ---------------------------------------------------------
                // 2. NORMAL BOT LOGIC (Go to Sheet)
                // ---------------------------------------------------------
                try {
                    const answer = await findAnswerInSheet(received_text);

                    // Fallback Message with Instruction
                    const defaultReply = "ขอโทษครับ ผมไม่พบข้อมูลเรื่องนี้ในฐานข้อมูล\n\n(ลองถามเรื่องอื่น หรือพิมพ์ว่า 'ติดต่อเจ้าหน้าที่' เพื่อคุยกับคนได้เลยครับ)";

                    const replyText = answer || defaultReply;

                    console.log(`Replying: ${replyText}`);
                    sendMessage(sender_psid, replyText);

                } catch (error) {
                    console.error("Error processing message:", error);
                    sendMessage(sender_psid, "ขอโทษครับ ระบบขัดข้องชั่วคราว");
                }
            }
        }
    } else {
        res.sendStatus(404);
    }
});

// API เดิมสำหรับ Web Frontend (ยังใช้ได้อยู่)
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Search in Google Sheet
        const answer = await findAnswerInSheet(message);

        if (answer) {
            res.json({ response: answer });
        } else {
            res.json({ response: "ขอโทษครับ ผมไม่พบข้อมูลเกี่ยวกับเรื่องนี้ในฐานข้อมูล" });
        }

    } catch (error) {
        console.error('Error processing chat:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log("DEBUG MODE: WAITING FOR WEBHOOKS... (Please check logs on Render)");
});
