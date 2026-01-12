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
app.post('/webhook', async (req, res) => {
    const body = req.body;
    console.log("Incoming Webhook:", JSON.stringify(body, null, 2)); // <--- NEW DEBUG LOG


    // ตรวจสอบว่าเป็น event จาก page หรือไม่
    if (body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED'); // ตอบกลับ FB ทันทีว่าได้รับแล้ว (สำคัญ!)

        // วนลูปทุก entry (เผื่อมาหลายข้อความพร้อมกัน)
        for (const entry of body.entry) {
            // ส่วนของข้อความ (messaging)
            const webhook_event = entry.messaging ? entry.messaging[0] : null;

            if (webhook_event && webhook_event.message && webhook_event.message.text) {
                const sender_psid = webhook_event.sender.id;
                const received_text = webhook_event.message.text;
                console.log(`Received message from ${sender_psid}: ${received_text}`);

                try {
                    // 1. ค้นหาคำตอบใน Google Sheet
                    const answer = await findAnswerInSheet(received_text);

                    // 2. ถ้าเจอ ให้ตอบคำตอบ ถ้าไม่เจอ ให้ตอบ default
                    const replyText = answer || "ขอโทษครับ ผมไม่พบข้อมูลเรื่องนี้ในฐานข้อมูล (ลองถามเรื่องอื่น เช่น ค่าเทอม, ติดต่อ)";

                    // 3. ส่งข้อความกลับไปหาผู้ใช้ผ่าน FB API
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
            res.json({ response: "ขอโทษครับ ผมไม่พบข้อมูลเกี่ยวกับเรื่องนี้ในฐานข้อมูล" }); // "Sorry, I couldn't find matches"
        }

    } catch (error) {
        console.error('Error processing chat:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
