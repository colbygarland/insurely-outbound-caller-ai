import { ElevenLabsClient } from 'elevenlabs'

// Initialize ElevenLabs
const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })

let agent: any = null

const getAgentId = (call_type: 'outbound' | 'rental') => {
  if (call_type === 'rental') {
    return process.env.ELEVENLABS_AGENT_ID_RENTAL!
  }
  if (call_type === 'outbound') {
    return process.env.ELEVENLABS_AGENT_ID!
  }
  throw new Error('Invalid call type')
}

export const ELEVENLABS = {
  getAgent: async (call_type?: 'outbound' | 'rental') => {
    if (agent) {
      return agent
    }
    if (!call_type) {
      throw new Error('call_type is required if agent has not been set')
    }
    const agentId = getAgentId(call_type)
    try {
      const response = await client.conversationalAi.getAgent(agentId)
      agent = response
      return agent
    } catch (error) {
      console.error(`[ElevenLabs] error with getAgent(): ${JSON.stringify(error)}`)
      return null
    }
  },
}
