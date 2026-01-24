import dgram from 'dgram';
import readline from 'readline';

// Configuration
const BRIDGE_HOST = '127.0.0.1';
const TARGET_PORT = 3001; // Send to Bridge's Input Port (SIM_PORT_OUT logic from bridge.js)

const client = dgram.createSocket('udp4');

function sendControl(ly, ry, start = false) {
    // Protocol:
    // [0-3] Left Y (Float32)
    // [4-7] Right Y (Float32)
    // [8]   Command (UInt8): 1 = Start Game

    const buf = Buffer.alloc(9);
    buf.writeFloatLE(ly, 0);
    buf.writeFloatLE(ry, 4);
    buf.writeUInt8(start ? 1 : 0, 8);

    client.send(buf, TARGET_PORT, BRIDGE_HOST, (err) => {
        if (err) console.error(err);
        else console.log(`Sent: ly=${ly}, ry=${ry}, start=${start}`);
    });
}

// Interactive CLI
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("Simulink Test Sender");
console.log("Commands:");
console.log("  <ly> <ry>  -> Send beam position (e.g., '100 100')");
console.log("  start      -> Send Start Game trigger");
console.log("  exit       -> Quit");

rl.on('line', (line) => {
    const parts = line.trim().split(' ');
    if (parts[0] === 'exit') process.exit(0);

    if (parts[0] === 'start') {
        sendControl(360, 360, true);
    } else if (parts.length >= 2) {
        const ly = parseFloat(parts[0]);
        const ry = parseFloat(parts[1]);
        if (!isNaN(ly) && !isNaN(ry)) {
            sendControl(ly, ry, false);
        } else {
            console.log("Invalid format. Use: 100 200");
        }
    }
});
