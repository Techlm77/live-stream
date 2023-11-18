const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();

// HTTPS Configuration
const httpsServer = https.createServer({
    key: fs.readFileSync('/etc/letsencrypt/live/node.techlm77.co.uk/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/node.techlm77.co.uk/fullchain.pem')
}, app);

// HTTP Configuration (for non-SSL)
const httpServer = http.createServer(app);

const wss = new WebSocket.Server({ server: httpsServer });

// Serve stream.html for the streamer
app.get('/stream', (req, res) => {
    res.sendFile(path.join(__dirname, 'stream.html'));
});

// Serve view.html for the viewers
app.get('/view', (req, res) => {
    res.sendFile(path.join(__dirname, 'view.html'));
});

// Store the connected clients
const clients = new Set();

// Buffer to store live stream data
let liveStreamBuffer = [];
let activeStreamer = null;

// Maximum number of entries in the live stream buffer
const MAX_BUFFER_LENGTH = 10;

// WebSocket connection event
wss.on('connection', (ws, req) => {
    clients.add(ws);

    // Send the count of connected clients to all clients
    broadcastConnectedClients();

    // Send the live stream data to the new viewer as binary data
    liveStreamBuffer.forEach((dataBlob) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(dataBlob);
        }
    });

    // Handle messages from the streamer
    ws.on('message', (message) => {
        if (!activeStreamer || ws === activeStreamer) {
            activeStreamer = ws;
            clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });

            // Save the live stream data only when the streamer is active and streaming
            if (activeStreamer === ws) {
                liveStreamBuffer.push(message);

                // Limit the size of liveStreamBuffer
                if (liveStreamBuffer.length > MAX_BUFFER_LENGTH) {
                    liveStreamBuffer.shift(); // Remove the oldest entry
                }
            }
        } else {
            ws.send(JSON.stringify({ type: 'streaming-rejected' }));
            ws.close();
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        clients.delete(ws);
        if (ws === activeStreamer) {
            activeStreamer = null;

            // Clear the existing live stream data when the streamer ends the stream
            liveStreamBuffer = [];
        }

        // Notify about the disconnected client
        broadcastDisconnectedClient();
    });
});

// Function to broadcast the count of connected clients to all clients
function broadcastConnectedClients() {
    const connectedClientsCount = clients.size;
    const message = JSON.stringify({ type: 'connected-clients', count: connectedClientsCount });

    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Function to broadcast the disconnection of a client to all clients
function broadcastDisconnectedClient() {
    const connectedClientsCount = clients.size;
    const message = JSON.stringify({ type: 'disconnected-client', count: connectedClientsCount });

    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Start the HTTP and HTTPS servers
const httpPort = 8086; // Change to the desired HTTP port
const httpsPort = 8446; // Change to the desired HTTPS port

httpServer.listen(httpPort, () => {
    console.log(`${httpPort} Live Stream/View v2`);
});

httpsServer.listen(httpsPort, () => {
    console.log(`${httpsPort} Live Stream/View v2`);
});