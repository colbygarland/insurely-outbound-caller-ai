"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ELEVENLABS = void 0;
const elevenlabs_1 = require("elevenlabs");
// Initialize ElevenLabs
const client = new elevenlabs_1.ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
exports.ELEVENLABS = {
    getAgent: async () => {
        try {
            const response = await client.conversationalAi.getAgent(process.env.ELEVENLABS_AGENT_ID);
            return response;
        }
        catch (error) {
            console.error(`[ElevenLabs] error with getAgent(): ${JSON.stringify(error)}`);
            return null;
        }
    },
};
