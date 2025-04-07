import { ElevenLabsClient } from 'elevenlabs'

// Initialize ElevenLabs
const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })

export const ELEVENLABS = {
  getAgent: async () => {
    try {
      const response = await client.conversationalAi.getAgent(process.env.ELEVENLABS_AGENT_ID!)
      return response
    } catch (error) {
      console.error(`[ElevenLabs] error with getAgent(): ${JSON.stringify(error)}`)
      return null
    }
  },
}
