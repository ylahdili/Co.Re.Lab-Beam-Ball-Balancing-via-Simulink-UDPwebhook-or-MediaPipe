import { useEffect, useRef, useState, useCallback } from 'react';

// Optimized Telemetry Protocol
interface TelemetryData {
    s: number;      // Score (Int16)
    h: number;      // Health (Int16)
    bx: number;     // Ball X (Float32)
    by: number;     // Ball Y (Float32)
    bly: number;    // Beam Left Y (Float32)
    bry: number;    // Beam Right Y (Float32)
    gs: number;     // Game State (UInt8)
    ev?: string;    // Event (Optional)
}

// Optimized Control Protocol
interface ControlData {
    ly: number;     // Target Left Y (Float32)
    ry: number;     // Target Right Y (Float32)
    start?: boolean;// Start Trigger
}

export const useSimulink = (onStartGameCommand: () => void) => {
    const ws = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    // Default to center screen (360)
    const simControlRef = useRef({ ly: 360, ry: 360 });

    const connect = useCallback(() => {
        try {
            const socket = new WebSocket('ws://localhost:8080');

            socket.onopen = () => {
                console.log('Connected to Simulink Bridge');
                setIsConnected(true);
            };

            socket.onclose = () => {
                console.log('Disconnected from Simulink Bridge');
                setIsConnected(false);
                // Simple reconnect logic
                setTimeout(connect, 3000);
            };

            socket.onerror = (err) => {
                console.error('Simulink WebSocket Error:', err);
                socket.close();
            };

            socket.onmessage = (event) => {
                try {
                    const data: ControlData = JSON.parse(event.data);

                    // Update control refs directly (no re-render)
                    if (typeof data.ly === 'number') simControlRef.current.ly = data.ly;
                    if (typeof data.ry === 'number') simControlRef.current.ry = data.ry;

                    // Trigger Game Start if command received
                    if (data.start) {
                        console.log("Simulink Triggered Start Game");
                        onStartGameCommand();
                    }
                } catch (e) {
                    console.error('Error parsing Simulink message:', e);
                }
            };

            ws.current = socket;
        } catch (e) {
            console.error('WebSocket connection failed:', e);
        }
    }, [onStartGameCommand]);

    useEffect(() => {
        connect();
        return () => {
            if (ws.current) ws.current.close();
        };
    }, [connect]);

    // Throttled Telemetry Sender (10Hz)
    const lastSendTime = useRef(0);
    const sendTelemetry = useCallback((data: TelemetryData) => {
        const now = performance.now();
        if (now - lastSendTime.current < 100) return; // Limit to ~10fps

        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(data));
            lastSendTime.current = now;
        }
    }, []);

    return {
        isConnected,
        simControlRef,
        sendTelemetry
    };
};