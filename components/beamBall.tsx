/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState } from 'react';
import { useSimulink } from '../services/useSimulink';
import { Point, FallingItem, Particle } from '../types';
import {
  Loader2, Activity, Terminal, AlertTriangle,
  Monitor, MoveVertical, RefreshCcw, Heart, Zap,
  Pizza, Skull, Sparkles, TrendingUp, Cpu,
  Play, Clock, Sliders, RotateCcw
} from 'lucide-react';

const TARGET_FPS = 60;

// --- Configuration Constants ---
const DEFAULT_CONFIG = {
  GRAVITY: 0.98,            // Vertical acceleration (Increased for snappier response)
  FRICTION: 0.95,           // Surface friction (Applied when ball touches beam)
  BOUNCE_FACTOR: 0.25,      // Elasticity (Reduced from 0.4 for less chaotic bouncing)
  BALL_RADIUS: 18,          // Visual and physical radius of the orange ball
  BEAM_WIDTH_PERCENT: 0.7,  // Percentage of canvas width the beam covers
  ITEM_SPAWN_CHANCE: 0.015, // Probability per frame of an item spawning
  MAX_BEAM_IMPULSE: 8       // Cap momentum transfer from jerky hand movements
};

const GAME_DURATION = 60; // 60 Seconds (1 minute)

const BeamBall: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameContainerRef = useRef<HTMLDivElement>(null);

  // Physics State Refs
  const ballPos = useRef<Point>({ x: 0, y: 0 });
  const ballVel = useRef<Point>({ x: 0, y: 0 });
  const beamLeftY = useRef<number>(0);
  const beamRightY = useRef<number>(0);
  // Target refs for smooth interpolation from low-fps tracking
  const targetBeamLeftY = useRef<number>(0);
  const targetBeamRightY = useRef<number>(0);

  const prevBeamLeftY = useRef<number>(0);
  const prevBeamRightY = useRef<number>(0);

  const lastUpdate = useRef<number>(performance.now());
  const fallingItems = useRef<FallingItem[]>([]);
  const particles = useRef<Particle[]>([]);

  // Game State Refs
  const scoreRef = useRef<number>(0);
  const healthRef = useRef<number>(100);
  const fallFlagRef = useRef<boolean>(false);
  const lastCollectTypeRef = useRef<'bonus' | 'punish' | null>(null);

  // New Game Logic Refs
  const gameStateRef = useRef<'waiting' | 'playing' | 'finished'>('waiting');
  const gameTimeRef = useRef<number>(0);
  const configRef = useRef({ ...DEFAULT_CONFIG });

  // UI Refs for high-perf updates
  const beamAngleBarRef = useRef<HTMLDivElement>(null);
  const beamAngleTextRef = useRef<HTMLSpanElement>(null);

  // React State for UI
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(100);
  const [showFallFlag, setShowFallFlag] = useState(false);
  const [lastCollectType, setLastCollectType] = useState<'bonus' | 'punish' | null>(null);   // Flash debug indicators

  // New UI States
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'finished'>('waiting');
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG });
  const [timerMode, setTimerMode] = useState<'countdown' | 'countup'>('countdown');
  const [displayTime, setDisplayTime] = useState(0);

  /**
   * Resets ball to the center of the screen above the beam
   */
  const resetBall = (width: number, height: number) => {
    ballPos.current = { x: width / 2, y: height / 2 - 150 };
    ballVel.current = { x: 0, y: 0 };
    fallFlagRef.current = false;
    setShowFallFlag(false);
  };

  const resetGame = () => {
    scoreRef.current = 0;
    healthRef.current = 100;
    fallingItems.current = [];
    particles.current = [];
    gameTimeRef.current = 0;

    // Explicitly reset the beam to center for a clean start
    if (canvasRef.current) {
      const centerY = canvasRef.current.height / 2;
      beamLeftY.current = centerY;
      beamRightY.current = centerY;
      targetBeamLeftY.current = centerY;
      targetBeamRightY.current = centerY;

      // Also reset ball
      resetBall(canvasRef.current.width, canvasRef.current.height);
    }

    setScore(0);
    setHealth(100);
    setDisplayTime(0);
  };

  const updateConfig = (key: keyof typeof DEFAULT_CONFIG, value: number) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    configRef.current = newConfig;
  };

  /**
   * Spawns cosmetic particles at a given location
   */
  const createExplosion = (x: number, y: number, color: string, count = 10) => {
    for (let i = 0; i < count; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1.0,
        color
      });
    }
  };

  /**
   * Generates a new falling item (Bonus or Penalty)
   */
  const spawnItem = (width: number) => {
    const type = Math.random() > 0.4 ? 'bonus' : 'penalty';
    const beamW = configRef.current.BEAM_WIDTH_PERCENT;
    const item: FallingItem = {
      id: Math.random().toString(36).substr(2, 9),
      x: Math.random() * (width * beamW) + (width * (1 - beamW) / 2),
      y: -50,
      type,
      speed: 1.5 + Math.random() * 2,
      active: true,
      radius: 15
    };
    fallingItems.current.push(item);
  };

  /**
   * Initialize Hook for Simulink
   */

  // 1. State for Control Mode
  const [useSimulinkMode, setUseSimulinkMode] = useState(true);
  const useSimulinkModeRef = useRef(true);

  // Update Ref when state changes
  useEffect(() => {
    useSimulinkModeRef.current = useSimulinkMode;
  }, [useSimulinkMode]);

  // 2. Initialize Hook with Stable Callback
  // 2. Initialize Hook with Stable Callback
  const lastStartCommandTime = useRef(0);

  const handleSimulinkStart = React.useCallback(() => {
    // This callback runs when Simulink sends Command 1
    const now = performance.now();
    // Debounce: verify we haven't started recently (prevents machine-gun resetting if signal stays high)
    if (now - lastStartCommandTime.current > 2000) {
      console.log('Executing Simulink Start/Reset Command');
      resetGame();
      setGameState('playing');
      gameStateRef.current = 'playing';
      lastStartCommandTime.current = now;
    }
  }, []); // Empty dependency array = stable reference

  const { simControlRef, sendTelemetry } = useSimulink(handleSimulinkStart);

  useEffect(() => {

    if (!videoRef.current || !canvasRef.current || !gameContainerRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = gameContainerRef.current;

    // willReadFrequently optimizes the context for frequent image data access
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
    if (!ctx) return;

    // Initial Setup
    const setup = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      // Initialize beam at center
      const centerY = canvas.height / 2;
      beamLeftY.current = centerY;
      beamRightY.current = centerY;
      targetBeamLeftY.current = centerY;
      targetBeamRightY.current = centerY;

      prevBeamLeftY.current = centerY;
      prevBeamRightY.current = centerY;
      resetBall(canvas.width, canvas.height);
    };
    setup();

    let camera: any = null;
    let hands: any = null;
    let animationFrameId: number;

    // --- The Information Feed (Vision) ---
    // This runs at whatever FPS the AI can manage (e.g., 20-30fps)
    // It ONLY updates the "target" positions. It does NOT render.
    const onResults = (results: any) => {
      if (loading) setLoading(false);

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        results.multiHandLandmarks.forEach((landmarks: any) => {
          const tip = landmarks[8]; // Index finger tip
          const targetY = tip.y * canvas.height;

          // Mirror correction & Target Update
          // User's Right Hand appears on Right of mirrored screen.
          // MediaPipe normalized x typically goes from 0 (left of camera image) to 1 (right of camera image).
          // With mirrored display, swapping the mapping so tip.x > 0.5 controls Right tip.

          if (tip.x > 0.5) {
            // Right hand or right tip (user perspective)
            targetBeamRightY.current = targetY;
          } else {
            // Left hand or left tip (user perspective)
            targetBeamLeftY.current = targetY;
          }

          // Optional: Draw at 20fps the debug skeletons, or we can skip it (for performance gain) by
          // commenting out the 4 lines below. We can also draw them at 60fps in the main loop (renderLoop) if we cached landmarks.
          if (window.drawConnectors && window.drawLandmarks) {
            window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: '#42a5f5', lineWidth: 2 });
            window.drawLandmarks(ctx, landmarks, { color: '#ffffff', lineWidth: 1, radius: 2 });
          }
        });
      }
    };

    if (window.Hands) {
      hands = new window.Hands({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}` });
      // OPTIMIZATION: Model Complexity 0 (Lite) is much faster
      hands.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      hands.onResults(onResults);
      if (window.Camera) {
        // OPTIMIZATION: Lower resolution for tracking (640x360)
        camera = new window.Camera(video, {
          onFrame: async () => {
            // CRITICAL: Only run hand tracking if NOT in Simulink mode
            // We use a ref helper or just check the state if it was in dep array, 
            // but to avoid resetting checking a ref is best.
            // However, `useSimulinkMode` is state. Let's make a Ref for it to access in the loop.
            if (!useSimulinkModeRef.current) {
              await hands.send({ image: video });
            }
          },
          width: 640,  // Reduced from 1280
          height: 360  // Reduced from 720
        });
        camera.start();
      }
    }

    // --- The Game Loop (Physics & Rendering) ---
    // This runs rigidly at 60Hz (or monitor refresh rate)
    const renderLoop = () => {
      // Loop Request
      animationFrameId = requestAnimationFrame(renderLoop);

      // ensure dimensions
      if (container.clientWidth !== canvas.width || container.clientHeight !== canvas.height) setup();

      const now = performance.now();
      // Calculate delta time (dt). 
      // We target 60FPS. 16.67ms per frame.
      // dt = 1.0 means exactly 16.67ms passed.
      const dt = Math.min(4, (now - lastUpdate.current) / 16.67);
      lastUpdate.current = now;

      // 1. Clear & Draw Background (Video Feed)
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw the raw video feed directly from the video element
      // This is much faster than waiting for MediaPipe's processed image
      if (video.readyState >= 2) { // HAVE_CURRENT_DATA
        ctx.save();
        // Mirror the video manually since we removed the CSS transform on canvas to keep text correct?
        // Actually CSS transform on canvas handles the visual mirror. 
        // But existing code drew `results.image`.
        // Let's draw video natural.
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      ctx.fillStyle = 'rgba(18, 18, 18, 0.85)'; // Dark overlay
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Interpolate Beam (The "Smoothing" Magic)
      // IMPT: Do this logic BEFORE pause check so we can see beam move in setup/simulink mode
      // Fix: Use Ref instead of stale State, because renderLoop is a closure that doesn't re-run on state change
      if (useSimulinkModeRef.current) {
        // Force loading off in Simulink mode so we don't block the view
        // Also ensure we aren't stuck in loading state (since onResults is paused)
        if (loading) setLoading(false);

        // Fix: accessing .ly and .ry which matches useSimulink.ts definition
        // We use explicit casting or safety checks if TS complains, but here we just match the prop names
        // simControlRef.current is { ly: number, ry: number }
        targetBeamLeftY.current = (simControlRef.current as any).ly ?? 360;
        targetBeamRightY.current = (simControlRef.current as any).ry ?? 360;
      }
      // We move the *physics* beam towards the *target* beam provided by Camera Hand Tracking/Simulink.
      // This decouples the frame rates.
      const lerpSpeed = 0.2 * dt; // Adjust for responsiveness
      prevBeamLeftY.current = beamLeftY.current;
      prevBeamRightY.current = beamRightY.current; // Store for velocity calcs

      beamLeftY.current += (targetBeamLeftY.current - beamLeftY.current) * lerpSpeed;
      beamRightY.current += (targetBeamRightY.current - beamRightY.current) * lerpSpeed;

      // 3. Beam Geometry (Use Config)
      // BEAM_WIDTH_PERCENT usage
      const beamW = configRef.current.BEAM_WIDTH_PERCENT;
      const beamXStart = canvas.width * (1 - beamW) / 2;
      const beamXEnd = canvas.width - beamXStart;
      const beamLen = beamXEnd - beamXStart;
      // Calculate Tilt      
      const dy_beam = beamRightY.current - beamLeftY.current;
      const angle = Math.atan2(dy_beam, beamLen);

      // Direct DOM update for performance (React State at 60fps causes stutter)
      if (beamAngleBarRef.current && beamAngleTextRef.current) {
        const range = 0.6; // ~35 degrees range
        const p = Math.min(1, Math.abs(angle) / range);
        const widthPct = p * 50;
        const marginPct = angle > 0 ? 50 : 50 - widthPct;

        beamAngleBarRef.current.style.width = `${widthPct}%`;
        beamAngleBarRef.current.style.marginLeft = `${marginPct}%`;
        beamAngleTextRef.current.innerText = `${(angle * 180 / Math.PI).toFixed(1)}°`;
      }

      // Map State to Protocol Enum
      let netState = 0; // Waiting (Default)
      if (gameStateRef.current === 'playing') netState = 1;
      else if (gameStateRef.current === 'finished') netState = 2;

      // Override with transient events if active (Higher priority for viz in Simulink)
      if (fallFlagRef.current) netState = 10;
      else if (lastCollectTypeRef.current === 'bonus') netState = 11;
      else if (lastCollectTypeRef.current === 'punish') netState = 12;

      // Send data to Node.js Bridge -> Simulink
      // Telemetry throttling at 10fps (to save bandwidth/processing) is handled inside the useSimulink hook
      sendTelemetry({
        score: Math.floor(scoreRef.current / 60),
        health: healthRef.current,
        ballX: ballPos.current.x,
        ballY: ballPos.current.y,
        beamLy: beamLeftY.current,
        beamRy: beamRightY.current,
        state: netState
      });

      // --- PAUSE CHECK (Render Only, No Physics) ---
      if (gameStateRef.current !== 'playing') {
        // Just draw the beam and ball statically (visual feedback while waiting). Or hide them.
        // Let's draw them frozen so user sees setup.
        ctx.lineCap = 'round'; ctx.lineWidth = 14;
        ctx.shadowBlur = 20; ctx.shadowColor = '#42a5f5';
        ctx.beginPath(); ctx.moveTo(beamXStart, beamLeftY.current); ctx.lineTo(beamXEnd, beamRightY.current);
        ctx.strokeStyle = '#42a5f5'; ctx.stroke();
        ctx.restore();
        return;
      }

      // Timer Logic
      gameTimeRef.current += (1 / TARGET_FPS) * dt; // Approximate seconds
      // Sync UI occasionally
      if (Math.floor(gameTimeRef.current) !== Math.floor(displayTime)) {
        // Optimization: set from outside or finding a way to not spam setState
      }
      // Let's just trigger a setState every second roughly.
      // Optimization: This might flicker if high fps, but fine for now. 
      // To avoid closure issues, we use the Ref source directly in UI if we want, but React needs state.
      // We'll update the displayTime state outside/throttled if needed.
      // For now, let's allow the renderLoop to just update logic.

      if (gameTimeRef.current >= GAME_DURATION) {
        gameStateRef.current = 'finished';
        setGameState('finished');
      }

      // 4. Ball Physics
      const ballX = ballPos.current.x;
      const onBeamHorizontal = ballX >= (beamXStart - 5) && ballX <= (beamXEnd + 5);

      // Interpolate beam position at the ball's current X coordinate
      const progress = Math.max(0, Math.min(1, (ballX - beamXStart) / beamLen));
      const targetBeamY = beamLeftY.current + progress * dy_beam;
      const prevTargetBeamY = prevBeamLeftY.current + progress * (prevBeamRightY.current - prevBeamLeftY.current);

      // Calculate vertical velocity of the beam at the ball's contact point
      let beamVelYAtBall = (targetBeamY - prevTargetBeamY) / dt;
      // MAX_BEAM_IMPULSE usage: Cap impulse to prevent physics explosions from tracking errors
      const maxImpulse = configRef.current.MAX_BEAM_IMPULSE;
      beamVelYAtBall = Math.max(-maxImpulse, Math.min(maxImpulse, beamVelYAtBall));

      // GRAVITY usage: Applying it to the ball's vertical velocity
      ballVel.current.y += configRef.current.GRAVITY * dt;

      // Update position based on current velocity
      ballPos.current.x += ballVel.current.x * dt;
      ballPos.current.y += ballVel.current.y * dt;

      // Collision Detection with Beam Surface (Snappy but dampened)
      // BALL_RADIUS usage
      const br = configRef.current.BALL_RADIUS;

      if (onBeamHorizontal && ballPos.current.y + br > targetBeamY && ballVel.current.y >= beamVelYAtBall - 0.5) {
        ballPos.current.y = targetBeamY - br;
        // Calculate relative velocity for bouncing
        const relVelY = ballVel.current.y - beamVelYAtBall;
        if (relVelY > 1.5) {
          // BOUNCE_FACTOR usage
          ballVel.current.y = beamVelYAtBall - (relVelY * configRef.current.BOUNCE_FACTOR);
        } else {
          ballVel.current.y = beamVelYAtBall; // Stick to surface if velocity is low
        }

        // Apply acceleration along the incline (g * sin(theta))
        const slopeAccel = configRef.current.GRAVITY * Math.sin(angle) * 1.8;
        ballVel.current.x += slopeAccel * dt;

        // Apply surface friction only when touching the beam
        // FRICTION usage
        ballVel.current.x *= Math.pow(configRef.current.FRICTION, dt);

        // OLD Scoring Logic: staying near the center increases score
        // const distFromCenter = Math.abs(ballPos.current.x - canvas.width / 2);
        // if (distFromCenter < 50) {
        //   scoreRef.current += 1;
        //   if (scoreRef.current % 60 === 0) setScore(Math.floor(scoreRef.current / 60));
        // }
      } else {
        // Free fall air resistance (very low)
        ballVel.current.x *= Math.pow(0.997, dt);
      }

      // NEW Scoring Logic: Reward keeping beam horizontal
      // Threshold: 0.05 radians is approx 3 degrees
      if (!fallFlagRef.current && Math.abs(angle) < 0.05) {
        scoreRef.current += 1;
        if (scoreRef.current % 60 === 0) setScore(Math.floor(scoreRef.current / 60));
      }

      // Check if ball has fallen off-screen to respawn
      if (ballPos.current.y > canvas.height + 100 || ballPos.current.x < -br || ballPos.current.x > canvas.width + br) {
        if (!fallFlagRef.current) {
          fallFlagRef.current = true;
          setShowFallFlag(true);
          setTimeout(() => resetBall(canvas.width, canvas.height), 1200);
        }
      }

      // 5. Items & Particles Falling Logic
      if (Math.random() < configRef.current.ITEM_SPAWN_CHANCE) spawnItem(canvas.width);

      for (let i = fallingItems.current.length - 1; i >= 0; i--) {
        const item = fallingItems.current[i];
        item.y += item.speed * dt;

        // Simple circle-to-circle collision
        const dist = Math.sqrt((item.x - ballPos.current.x) ** 2 + (item.y - ballPos.current.y) ** 2);
        if (dist < br + item.radius) {
          item.active = false;
          if (item.type === 'bonus') {
            healthRef.current = healthRef.current + 15;
            setHealth(healthRef.current);
            setLastCollectType('bonus');
            lastCollectTypeRef.current = 'bonus';
            createExplosion(item.x, item.y, '#66bb6a', 45);
          } else {
            // OLD Health Logic: Allow only positive health
            // healthRef.current = Math.max(0, healthRef.current - 20);
            // NEW Health Logic: Allow negative health
            healthRef.current = healthRef.current - 20;
            setHealth(healthRef.current);
            setLastCollectType('punish');
            lastCollectTypeRef.current = 'punish';
            createExplosion(item.x, item.y, '#ef5350', 15);
          }
          setTimeout(() => {
            setLastCollectType(null);
            lastCollectTypeRef.current = null;
          }, 1000);
        }

        // Cleanup inactive or off-screen items
        if (item.y > canvas.height + 50 || !item.active) fallingItems.current.splice(i, 1);
        else {
          // Render items
          ctx.save();
          ctx.shadowBlur = 10; ctx.shadowColor = item.type === 'bonus' ? '#66bb6a' : '#ef5350';
          ctx.beginPath(); ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
          ctx.fillStyle = item.type === 'bonus' ? '#66bb6a' : '#ef5350'; ctx.fill();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
          ctx.restore();
        }
      }

      // --- VFX / Particle Processing ---
      // OPTIMIZATION: Using filter instead of splice to reduce GC pressure
      // If this causes issues, revert to the original splice-based loop:
      // for (let i = particles.current.length - 1; i >= 0; i--) {
      //   const p = particles.current[i];
      //   p.x += p.vx * dt; p.y += p.vy * dt; p.life -= 0.03 * dt;
      //   if (p.life <= 0) particles.current.splice(i, 1);
      //   else { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      // }
      particles.current = particles.current.filter(p => {
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= 0.03 * dt;
        if (p.life <= 0) return false;
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });

      // 6. Final Draw (Render Beam & Ball)
      ctx.lineCap = 'round'; ctx.lineWidth = 14;
      ctx.shadowBlur = 20; ctx.shadowColor = '#42a5f5';
      ctx.beginPath(); ctx.moveTo(beamXStart, beamLeftY.current); ctx.lineTo(beamXEnd, beamRightY.current);
      ctx.strokeStyle = '#42a5f5'; ctx.stroke();

      const { x, y } = ballPos.current;
      const ballGrad = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, br);
      ballGrad.addColorStop(0, '#fff3e0'); ballGrad.addColorStop(0.4, '#ff9800'); ballGrad.addColorStop(1, '#e65100');
      ctx.shadowBlur = 5; ctx.shadowColor = '#ff9800';
      ctx.beginPath(); ctx.arc(x, y, br, 0, Math.PI * 2); ctx.fillStyle = ballGrad; ctx.fill();

      ctx.restore();
    }; // End of renderLoop

    // Need a separate interval for Time Display State Update to avoid re-rendering main loop component too often
    // or just assume setDisplayTime is cheap enough (React 18 batches). 
    // Let's use a specialized interval for UI time sync.
    const timeInterval = setInterval(() => {
      if (gameStateRef.current === 'playing') {
        setDisplayTime(Math.max(0, gameTimeRef.current));
      }
    }, 200);

    // Start the physics/render loop
    renderLoop();

    return () => {
      if (camera) camera.stop();
      if (hands) hands.close();
      cancelAnimationFrame(animationFrameId);
      clearInterval(timeInterval);
    };
  }, []);

  return (
    <div className="flex w-full h-screen bg-[#121212] overflow-hidden font-roboto text-[#e3e3e3]">
      <div className="fixed inset-0 z-[100] bg-[#121212] flex flex-col items-center justify-center md:hidden">
        <Monitor className="w-16 h-16 text-[#ef5350] mb-6 animate-pulse" />
        <h2 className="text-2xl font-bold">Desktop Required</h2>
      </div>

      <div ref={gameContainerRef} className="flex-1 relative h-full overflow-hidden">
        <video ref={videoRef} className="absolute hidden" playsInline />
        <canvas ref={canvasRef} className="absolute inset-0" />

        {loading && <div className="absolute inset-0 flex items-center justify-center bg-[#121212] z-50"><Loader2 className="w-12 h-12 text-[#42a5f5] animate-spin" /></div>}

        {showFallFlag && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-red-900/20 backdrop-blur-sm animate-pulse">
            <div className="flex flex-col items-center bg-[#1e1e1e] p-8 rounded-[32px] border-4 border-[#ef5350] shadow-2xl">
              <AlertTriangle className="w-16 h-16 text-[#ef5350] mb-4" />
              <h1 className="text-4xl font-black text-[#ef5350] uppercase tracking-tighter">Ball Fall</h1>
              <p className="text-white/60 text-sm mt-2">Respawning...</p>
            </div>
          </div>
        )}

        {/* --- Top HUD Metrics --- */}
        <div className="absolute top-6 left-6 z-40 flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="bg-[#1e1e1e]/90 p-4 rounded-2xl border border-[#444746] backdrop-blur shadow-xl flex items-center gap-4">
              <div className="bg-[#42a5f5]/20 p-2 rounded-full"><TrendingUp className="w-6 h-6 text-[#42a5f5]" /></div>
              <div>
                <p className="text-[10px] text-[#c4c7c5] uppercase font-bold tracking-widest">Stability</p>
                <p className="text-2xl font-bold">{score}</p>
              </div>
            </div>

            <div className="bg-[#1e1e1e]/90 p-4 rounded-2xl border border-[#444746] backdrop-blur shadow-xl flex items-center gap-4 min-w-[160px]">
              <div className={`p-2 rounded-full transition-colors ${health < 40 ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
                <Heart className={`w-6 h-6 ${health < 40 ? 'text-red-500 animate-pulse' : 'text-green-500'}`} />
              </div>
              <div>
                <p className="text-[10px] text-[#c4c7c5] uppercase font-bold tracking-widest">Health</p>
                <p className={`text-2xl font-bold transition-all ${health < 40 ? 'text-red-500' : 'text-white'}`}>{health}</p>
              </div>
            </div>
          </div>

          {/* --- Beam Tilt Visualization --- */}
          <div className="bg-[#1e1e1e]/90 p-4 rounded-2xl border border-[#444746] backdrop-blur shadow-xl">
            <p className="text-[10px] text-[#c4c7c5] uppercase font-bold tracking-widest mb-2">Beam Angle</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden">
                <div
                  ref={beamAngleBarRef}
                  className="h-full bg-[#ef5350] transition-none"
                  style={{ width: '0%', marginLeft: '50%' }}
                />
              </div>
              <span ref={beamAngleTextRef} className="text-xs font-mono w-10">0.0°</span>
            </div>
          </div>
        </div>

        {/* --- TIMER HUD --- */}
        <div className="absolute top-6 right-6 z-40 bg-[#1e1e1e]/90 p-4 rounded-2xl border border-[#444746] backdrop-blur shadow-xl flex items-center gap-4">
          <div onClick={() => setTimerMode(m => m === 'countdown' ? 'countup' : 'countdown')} className="cursor-pointer bg-[#42a5f5]/20 p-2 rounded-full hover:bg-[#42a5f5]/30 transition-colors">
            <Clock className="w-6 h-6 text-[#42a5f5]" />
          </div>
          <div>
            <p className="text-[10px] text-[#c4c7c5] uppercase font-bold tracking-widest">Time {timerMode === 'countdown' ? 'Left' : 'Elapsed'}</p>
            <p className="text-2xl font-bold font-mono">
              {(() => {
                const t = timerMode === 'countdown' ? Math.max(0, GAME_DURATION - displayTime) : displayTime;
                const m = Math.floor(t / 60);
                const s = Math.floor(t % 60);
                return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
              })()}
            </p>
          </div>
        </div>

        {/* --- GAME OVER / START OVERLAY --- */}
        {gameState !== 'playing' && (
          <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <h1 className="text-6xl font-black text-white mb-8 tracking-tighter uppercase">
              {gameState === 'waiting' ? 'Ready?' : 'Game Over'}
            </h1>
            <button
              onClick={() => { resetGame(); setGameState('playing'); gameStateRef.current = 'playing'; }}
              className="group relative px-12 py-6 bg-[#42a5f5] hover:bg-[#2196f3] text-black font-black text-2xl uppercase tracking-widest transition-all hover:scale-105 rounded-full"
            >
              <div className="flex items-center gap-3">
                <Play className="w-8 h-8 fill-black" />
                {gameState === 'waiting' ? 'Start Game' : 'Play Again'}
              </div>
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-full bg-blue-400 blur-xl opacity-50 group-hover:opacity-100 transition-opacity -z-10"></div>
            </button>
          </div>
        )}

        {/* --- Central Popup Feedback --- */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          {lastCollectType === 'bonus' && (
            <div className="flex flex-col items-center animate-bounce">
              <Sparkles className="w-12 h-12 text-green-400 mb-2" />
              <span className="text-green-400 font-black text-2xl uppercase tracking-tighter">Bonus!</span>
            </div>
          )}
          {lastCollectType === 'punish' && (
            <div className="flex flex-col items-center animate-bounce">
              <Zap className="w-12 h-12 text-red-500 mb-2" />
              <span className="text-red-500 font-black text-2xl uppercase tracking-tighter">Damaged!</span>
            </div>
          )}
        </div>

        {/* --- Interaction Guides --- */}
        <div className="absolute bottom-10 left-10 flex items-center gap-2 text-xs text-gray-400 bg-black/40 px-3 py-1.5 rounded-full border border-white/10">
          <MoveVertical className="w-3 h-3 text-[#42a5f5]" /> Left Tip Control
        </div>
        <div className="absolute bottom-10 right-10 flex items-center gap-2 text-xs text-gray-400 bg-black/40 px-3 py-1.5 rounded-full border border-white/10">
          <MoveVertical className="w-3 h-3 text-[#42a5f5]" /> Right Tip Control
        </div>
      </div>

      {/* --- Side Panel: System Diagnostics --- */}
      <div className="w-[380px] bg-[#1e1e1e] border-l border-[#444746] flex flex-col h-full shadow-2xl">
        <div className="p-6 border-b-4 border-gray-600 bg-[#252525]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-gray-400" />
              <h2 className="font-bold text-sm uppercase tracking-widest text-gray-400">System Diagnostics</h2>
            </div>
          </div>

          <div className="min-h-[60px]">
            <div className="flex gap-3 items-center p-3 bg-black/20 rounded-xl border border-white/5">
              <Cpu className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <p className="text-blue-400 text-xs font-bold uppercase tracking-tight">Optimized Pipeline</p>
                <p className="text-white/60 text-[10px] leading-tight">Low-latency JSON webhooks ⇆ UDP bridge with Simulink.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* CONFIGURATION PANEL */}
          <div className="bg-[#121212] p-4 rounded-xl border border-[#444746] space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#c4c7c5] uppercase tracking-wider">
                <Sliders className="w-3 h-3" /> Configuration
              </div>
            </div>

            {/* Control Source Toggle */}
            <div className="space-y-3 p-3 bg-black/20 rounded-xl border border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor className={`w-4 h-4 ${useSimulinkMode ? 'text-[#ef5350]' : 'text-gray-400'}`} />
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-300">Control Source</span>
                </div>
                <div
                  onClick={() => setUseSimulinkMode(!useSimulinkMode)}
                  className={`relative w-28 h-8 rounded-full cursor-pointer transition-colors border ${useSimulinkMode ? 'bg-[#ef5350]/20 border-[#ef5350]' : 'bg-[#42a5f5]/20 border-[#42a5f5]'}`}
                >
                  <div className={`absolute top-1 bottom-1 w-[50%] rounded-full transition-all flex items-center justify-center text-[10px] font-bold ${useSimulinkMode ? 'left-[48%] bg-[#ef5350] text-white shadow-[0_0_10px_rgba(239,83,80,0.5)]' : 'left-1 bg-[#42a5f5] text-white shadow-[0_0_10px_rgba(66,165,245,0.5)]'}`}>
                    {useSimulinkMode ? 'SIMULINK' : 'CAMERA'}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 leading-tight">
                {useSimulinkMode
                  ? "Camera tracking disabled. Use external Simulink signals."
                  : "Using visual hand tracking. Simulink functionality paused."}
              </p>
            </div>

            <div className="space-y-3 h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {Object.entries(config).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] text-gray-500 font-bold uppercase">{key.replace(/_/g, ' ')}</label>
                    <button onClick={() => updateConfig(key as any, DEFAULT_CONFIG[key as keyof typeof DEFAULT_CONFIG])} className="text-gray-600 hover:text-[#42a5f5]">
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max={key === 'BOUNCE_FACTOR' || key === 'BEAM_WIDTH_PERCENT' ? 1 : (key === 'ITEM_SPAWN_CHANCE' ? 0.1 : (key === 'GRAVITY' || key === 'FRICTION' ? 2 : (key === 'BALL_RADIUS' ? 50 : 100)))}
                      step={key === 'ITEM_SPAWN_CHANCE' ? 0.001 : (key === 'BOUNCE_FACTOR' || key === 'BEAM_WIDTH_PERCENT' || key === 'GRAVITY' || key === 'FRICTION' ? 0.01 : 1)}
                      value={value}
                      onChange={(e) => updateConfig(key as any, parseFloat(e.target.value))}
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#42a5f5]"
                    />
                    <span className="text-[10px] w-8 text-right font-mono">{(value as number).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DEBUG FLAGS SECTION */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Active System Flags</p>
            {showFallFlag && (
              <div className="bg-[#ef5350]/10 border border-[#ef5350]/30 p-3 rounded-xl flex items-center gap-3 animate-pulse">
                <RefreshCcw className="w-5 h-5 text-[#ef5350] animate-spin" />
                <div>
                  <p className="text-[10px] font-bold text-[#ef5350] uppercase">SIGNAL</p>
                  <p className="text-sm font-bold">ball fall</p>
                </div>
              </div>
            )}
            {lastCollectType === 'bonus' && (
              <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-xl flex items-center gap-3">
                <Pizza className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-[10px] font-bold text-green-500 uppercase">SIGNAL</p>
                  <p className="text-sm font-bold">bonus collect</p>
                </div>
              </div>
            )}
            {lastCollectType === 'punish' && (
              <div className="bg-[#ef5350]/10 border border-[#ef5350]/30 p-3 rounded-xl flex items-center gap-3">
                <Skull className="w-5 h-5 text-[#ef5350]" />
                <div>
                  <p className="text-[10px] font-bold text-[#ef5350] uppercase">SIGNAL</p>
                  <p className="text-sm font-bold">punish collect</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#c4c7c5] uppercase tracking-wider">
              <Terminal className="w-3 h-3" /> Raw Console
            </div>
            <div className="bg-[#121212] p-3 rounded-xl border border-[#444746] font-mono text-[10px] text-blue-400/60 leading-normal break-all max-h-40 overflow-y-auto">
              [SYSTEM]: Physics engine running at 60fps...<br />
              [SYSTEM]: Hand tracking in Control Source: Camera
            </div>
          </div>

        </div>

        <div className="p-4 text-center border-t border-[#444746]">
          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Nisa Build v4.2 (Verified Documentation)</p>
        </div>
      </div>
    </div>
  );
};

export default BeamBall;
