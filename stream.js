// Import necessary modules
const express = require('express');
const https = require('https');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

// Create an Express application
const app = express();

// Create an HTTPS server using SSL certificates
const httpsServer = https.createServer({
    key: fs.readFileSync('/etc/letsencrypt/live/node.techlm77.co.uk/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/node.techlm77.co.uk/fullchain.pem')
}, app);

// Create a WebSocket server using the HTTPS server
const wssHttps = new WebSocket.Server({ server: httpsServer });

// Create an HTTP server
const httpServer = http.createServer(app);

// Create a WebSocket server using the HTTP server
const wssHttp = new WebSocket.Server({ noServer: true });

// Map to store connected clients for each channel
const channelClients = new Map();

wssHttps.on('connection', handleConnection);
wssHttp.on('connection', handleConnection);

httpServer.on('upgrade', (request, socket, head) => {
    wssHttp.handleUpgrade(request, socket, head, (ws) => {
        wssHttp.emit('connection', ws, request);
    });
});

httpsServer.listen(8446, () => {
    console.log('HTTPS server listening on port 8446');
});

httpServer.listen(8086, () => {
    console.log('HTTP server listening on port 8086');
});

function handleConnection(ws, req) {
    const url = new URL(req.url, 'https://node.techlm77.co.uk');
    const channel = url.searchParams.get('channel');

    if (!channel) {
        ws.send(JSON.stringify({ type: 'channel-required' }));
        ws.close();
        return;
    }

    if (!channelClients.has(channel)) {
        channelClients.set(channel, new Set());
    }

    const clients = channelClients.get(channel);

    clients.add(ws);

    broadcastConnectedClients(channel);

    if (liveStreamBuffer[channel]) {
        liveStreamBuffer[channel].forEach((dataBlob) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(dataBlob);
            }
        });
    }

    ws.on('message', (message) => {
        clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });

        if (isStreamEnded(message)) {
            cleanupFiles(channel);
            clearLiveStreamBuffer(channel);
        }

        saveStreamDataToFile(channel, message);
        saveStreamDataToBuffer(channel, message);
    });

    ws.on('close', () => {
        clients.delete(ws);
        broadcastDisconnectedClient(channel);

        if (clients.size === 0) {
            clearLiveStreamBuffer(channel);
            cleanupFiles(channel);
        }
    });
}

function clearLiveStreamBuffer(channel) {
    liveStreamBuffer[channel] = [];
}

// Function to check if a stream has ended based on the message type
function isStreamEnded(message) {
    try {
        const data = JSON.parse(message);
        return data.type === 'stream-ended';
    } catch (error) {
        return false;
    }
}

// Function to delete files in the channel folder
function cleanupFiles(channel) {
    const folderPath = path.join(__dirname, `channel-${channel}`);

    fs.readdir(folderPath, (err, files) => {
        if (err) {
            console.error('Error reading folder:', err);
            return;
        }

        files.forEach((file) => {
            const filePath = path.join(folderPath, file);

            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error('Error deleting file:', unlinkErr);
                }
            });
        });
    });
}

// Function to broadcast the count of connected clients to all clients in the channel
function broadcastConnectedClients(channel) {
    const clients = channelClients.get(channel);
    const connectedClientsCount = clients.size;
    const message = JSON.stringify({ type: 'connected-clients', count: connectedClientsCount });

    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Function to broadcast a message when a client disconnects
function broadcastDisconnectedClient(channel) {
    const clients = channelClients.get(channel);
    const connectedClientsCount = clients.size;
    const message = JSON.stringify({ type: 'disconnected-client', count: connectedClientsCount });

    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Function to save stream data to a file
function saveStreamDataToFile(channel, data) {
    const filePath = path.join(__dirname, `channel-${channel}`, `${Date.now()}.webm`);

    fs.appendFileSync(filePath, data, 'binary', (err) => {
        if (err) {
            console.error('Error saving stream data to file:', err);
        }
    });
}

// Function to save stream data to a buffer
function saveStreamDataToBuffer(channel, data) {
    if (!liveStreamBuffer[channel]) {
        liveStreamBuffer[channel] = [];
    }

    liveStreamBuffer[channel].push(data);
}

// Map to store buffered stream data for each channel
const liveStreamBuffer = {};