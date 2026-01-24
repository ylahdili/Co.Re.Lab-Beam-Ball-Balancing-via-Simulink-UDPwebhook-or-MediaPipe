
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI } from "@google/genai";
import { AiResponse, DebugInfo, StrategicHint } from "../types";

let ai: GoogleGenAI | null = null;
if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
}

const MODEL_NAME = "gemini-3-flash-preview";

export const getStrategicHint = async (
  imageBase64: string,
  _ignored1: any[],
  _ignored2: number
): Promise<AiResponse> => {
  const startTime = performance.now();
  const debug: DebugInfo = {
    latency: 0,
    screenshotBase64: imageBase64,
    promptContext: "Physics & Survival Analysis",
    rawResponse: "",
    timestamp: new Date().toLocaleTimeString()
  };

  if (!ai) {
    return {
        hint: { message: "AI Engine Offline (Check API Key)" },
        debug: { ...debug, error: "API Key Missing" }
    };
  }

  const prompt = `
    You are a Strategic Balance Coach for a survival physics game.
    The player balances a red ball on a blue beam.
    
    ### GAME ELEMENTS
    1. Red Ball: Must be kept on the beam.
    2. Falling Food (Green): Collect to gain health.
    3. Falling Hazards (Red/Purple): Avoid these.
    
    ### YOUR TASK
    Analyze the visual state. Look at the ball's position, the beam's tilt, and incoming items.
    1. Determine if the player should tilt the beam to catch food or avoid a hazard.
    2. Provide a tactical command focusing on BOTH balance and survival (Health Score).
    3. Mention specific hand movements (LEFT/RIGHT hand UP/DOWN).

    ### OUTPUT FORMAT (Strict JSON)
    {
      "message": "Direct operational command (e.g., 'Tilt left to catch that apple!')",
      "rationale": "Physics/Strategy explanation (e.g., 'Your health is low, prioritize the green bonus over centering.')"
    }
  `;

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }]
      },
      config: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    });

    debug.latency = Math.round(performance.now() - startTime);
    const text = response.text || "{}";
    debug.rawResponse = text;

    try {
        const json = JSON.parse(text);
        return {
            hint: {
                message: json.message || "Stability and Health are key!",
                rationale: json.rationale || "Avoid the red hazards at all costs."
            },
            debug
        };
    } catch (e) {
        return {
            hint: { message: "Stability confirmed. Watch for falling items!" },
            debug: { ...debug, error: "Parse Error" }
        };
    }
  } catch (error: any) {
    return {
        hint: { message: "Coach is recalibrating sensors..." },
        debug: { ...debug, error: error.message }
    };
  }
};
