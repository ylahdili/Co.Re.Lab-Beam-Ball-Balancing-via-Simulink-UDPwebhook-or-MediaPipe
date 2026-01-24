import dgram from 'dgram';

const PORT = 3000;
const HOST = '127.0.0.1';

const server = dgram.createSocket('udp4');

server.on('listening', () => {
    const address = server.address();
    console.log(`Test Receiver listening on ${address.address}:${address.port}`);
    console.log('Use this script to verify that bridge.js is sending data.');
    console.log('NOTE: Stop Simulink before running this, or it will fail to bind port 3000.\n');
});

server.on('message', (msg, remote) => {
    // We expect 21 bytes
    console.log(`\nReceived ${msg.length} bytes from ${remote.address}:${remote.port}`);

    if (msg.length !== 21) {
        console.warn('WARNING: Unexpected packet length!');
    }

    // Parse the binary data (Little Endian)
    // Structure:
    // [0-1]   Score (Int16)
    // [2-3]   Health (Int16)
    // [4-7]   Ball X (Float32)
    // [8-11]  Ball Y (Float32)
    // [12-15] Beam Left Y (Float32)
    // [16-19] Beam Right Y (Float32)
    // [20]    Game State (UInt8)

    try {
        const score = msg.readInt16LE(0);
        const health = msg.readInt16LE(2);
        const ballX = msg.readFloatLE(4);
        const ballY = msg.readFloatLE(8);
        const beamLy = msg.readFloatLE(12);
        const beamRy = msg.readFloatLE(16);
        const state = msg.readUInt8(20);

        console.log(`  State:  ${state} (${state === 1 ? 'Playing' : 'Waiting'})`);
        console.log(`  Score:  ${score}`);
        console.log(`  Health: ${health}`);
        console.log(`  Ball:   (${ballX.toFixed(1)}, ${ballY.toFixed(1)})`);
        console.log(`  Beam:   L=${beamLy.toFixed(1)} / R=${beamRy.toFixed(1)}`);
    } catch (e) {
        console.error('Error parsing packet:', e.message);
    }
});

server.bind(PORT, HOST);
