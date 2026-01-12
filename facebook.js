const https = require('https');
require('dotenv').config();

// ฟังก์ชันสำหรับส่งข้อความกลับไปหาผู้ใช้ผ่าน Facebook Messenger
function sendMessage(recipientId, messageText) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText
        }
    };

    const jsonData = JSON.stringify(messageData);
    const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

    if (!PAGE_ACCESS_TOKEN) {
        console.error('Error: FB_PAGE_ACCESS_TOKEN is missing in .env');
        return;
    }

    const options = {
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': jsonData.length
        }
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (d) => {
            body += d;
        });
        res.on('end', () => {
            if (res.statusCode === 200) {
                console.log('Message sent successfully to:', recipientId);
            } else {
                console.error('Unable to send message:', res.statusCode, body);
            }
        });
    });

    req.on('error', (e) => {
        console.error('Problem with request:', e);
    });

    req.write(jsonData);
    req.end();
}

module.exports = {
    sendMessage
};
