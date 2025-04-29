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
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="51a87b1e-7c20-5590-a05e-7c77e30f1b62")}catch(e){}}();
//# debugId=51a87b1e-7c20-5590-a05e-7c77e30f1b62
