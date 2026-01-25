import { WebSocketServer } from 'ws';
import dgram from 'dgram';

const WS_PORT = 8080;
const SIM_PORT_IN = 3000;  // Simulink Listening Port (UDP)
const SIM_PORT_OUT = 3001; // Simulink Sending Port (UDP)
const SIM_HOST = '127.0.0.1';

// UDP Client for sending telemetry to Simulink
const udpClient = dgram.createSocket('udp4');

// Pre-allocate telemetry buffer once (reused on each send, it helps reduce GC)
// Structure: Score(2) + Health(2) + BallX(4) + BallY(4) + BeamLY(4) + BeamRY(4) + State(1) = 21 bytes
const telemetryBuf = Buffer.alloc(21);

const wss = new WebSocketServer({ port: WS_PORT });

console.log(`Bridge Running: WS:${WS_PORT} <-> UDP:${SIM_PORT_IN}/${SIM_PORT_OUT}`);

// Bind UDP to listen for control signals from Simulink
udpClient.bind(SIM_PORT_OUT);

// Track active WebSocket client (prevents adding duplicate UDP listeners on reconnect)
let activeWs = null;

// 2. Simulink -> React (Control)
// UDP listener added ONCE at module level - fixes MaxListenersExceededWarning
udpClient.on('message', (msg) => {
    try {
        // Expected packet size: 9 bytes
        // [0-3] Right Y Target (Float32)
        // [4-7] Left Y Target (Float32)
        // [8]   Command (UInt8): 1 = Start Game
        if (msg.length >= 9 && activeWs && activeWs.readyState === activeWs.OPEN) {
            const controlData = {
                ry: msg.readFloatLE(0), // Right Y Force/Pos
                ly: msg.readFloatLE(4), // Left Y Force/Pos
                start: msg.readUInt8(8) === 1 // Trigger to Start
            };

            // Send efficient JSON key-value pairs to React
            activeWs.send(JSON.stringify(controlData));
        }
    } catch (e) {
        console.error('Error parsing control signal:', e);
    }
});

wss.on('connection', (ws) => {
    activeWs = ws;
    // console.log('React client connected');

    ws.on('close', () => {
        if (activeWs === ws) activeWs = null;
        // console.log('React client disconnected');
    });

    // 1. React -> Simulink (Telemetry)
    // Incoming JSON from React (via WebSocket)
    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            // DEBUG: Log received data from React
            // console.log('React Telemetry:', data);

            // Reuse pre-allocated buffer (writes overwrite previous values)
            // [0-1]   Score (Int16)
            // [2-3]   Health (Int16)
            // [4-7]   Ball X (Float32)
            // [8-11]  Ball Y (Float32)
            // [12-15] Beam Left Y (Float32)
            // [16-19] Beam Right Y (Float32)
            // [20]    Game State (UInt8)

            // Score and Health: Use Int16 to support negative values and > 255
            telemetryBuf.writeInt16LE(data.score || 0, 0);
            telemetryBuf.writeInt16LE(data.health || 0, 2);

            // Positions: Use Float32 (Single) for bandwidth efficiency (4 bytes)
            // Range: 0.0 - 720.0 (or 1280.0 for X)
            telemetryBuf.writeFloatLE(data.ballX || 0, 4);
            telemetryBuf.writeFloatLE(data.ballY || 0, 8);
            telemetryBuf.writeFloatLE(data.beamLy || 0, 12);
            telemetryBuf.writeFloatLE(data.beamRy || 0, 16);

            // Game State: 0=Waiting, 1=Playing, 2=Finished
            telemetryBuf.writeUInt8(data.state || 0, 20);

            // Send to Simulink
            udpClient.send(telemetryBuf, SIM_PORT_IN, SIM_HOST);
        } catch (e) {
            console.error('Error parsing telemetry:', e);
        }
    });
});