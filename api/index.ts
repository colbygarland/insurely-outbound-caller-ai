import fastifyFormBody from '@fastify/formbody'
import fastifyWs from '@fastify/websocket'
import Fastify from 'fastify'
import Twilio from 'twilio'
import WebSocket from 'ws'
import dotenv from 'dotenv'
import { getSignedUrl } from '../utils'

// Load environment variables from .env file
dotenv.config()

// Check for required environment variables
const { ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } =
  process.env

if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  console.error('Missing required environment variables')
  throw new Error('Missing required environment variables')
}

const PROMPT =
  'You are a friendly, empathetic customer service agent at Insurely. Your job is to call people who have previously looked into Insurely, but dropped off at some point. You are trying to gather information on what type of insurance they are requiring, and then transfer them to a sales agent. Gather info such as name, email, phone number, address. If they do not want to transfer immediately to a sales staff, book a call using Hubspots calendar. Respond to people in a warm, understanding and professional manner, using simple language and avoiding technical jargon. If the customers question is unclear, ask follow-up questions to gather more information.'
const FIRST_MESSAGE =
  'Hello, this is Jessica from Insurely. I understand you previously were looking at Insurely, how can I help you with insurance?'

// Initialize Fastify server
const fastify = Fastify()
fastify.register(fastifyFormBody)
fastify.register(fastifyWs)

const PORT = (process.env.PORT as unknown as number) || 8000

// Root route for health check
fastify.get('/', async (_, reply) => {
  reply.send({ message: 'Server is running' })
})

// Initialize Twilio client
const twilioClient = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

// Route to initiate outbound calls
fastify.post('/outbound-call', async (request, reply) => {
  // @ts-expect-error
  const { number } = request.body

  if (!number) {
    return reply.code(400).send({ error: 'Phone number is required' })
  }

  try {
    const call = await twilioClient.calls.create({
      from: TWILIO_PHONE_NUMBER,
      to: number,
      url: `https://${request.headers.host}/outbound-call-twiml?prompt=${encodeURIComponent(
        PROMPT,
      )}&first_message=${encodeURIComponent(FIRST_MESSAGE)}`,
    })

    reply.send({
      success: true,
      message: 'Call initiated',
      callSid: call.sid,
    })
  } catch (error) {
    console.error('Error initiating outbound call:', error)
    reply.code(500).send({
      success: false,
      error: 'Failed to initiate call',
      details: error,
    })
  }
})

// TwiML route for outbound calls
fastify.all('/outbound-call-twiml', async (request, reply) => {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Connect>
        <Stream url="wss://${request.headers.host}/outbound-media-stream">
            <Parameter name="prompt" value="${PROMPT}" />
            <Parameter name="first_message" value="${FIRST_MESSAGE}" />
        </Stream>
        </Connect>
    </Response>`

  reply.type('text/xml').send(twimlResponse)
})

// WebSocket route for handling media streams
fastify.register(async fastifyInstance => {
  fastifyInstance.get('/outbound-media-stream', { websocket: true }, (ws, req) => {
    console.info('[Server] Twilio connected to outbound media stream')

    // Variables to track the call
    let streamSid: string | null = null
    let callSid = null
    let elevenLabsWs: WebSocket | null = null
    let customParameters = null // Add this to store parameters

    // Handle WebSocket errors
    ws.on('error', console.error)

    // Set up ElevenLabs connection
    const setupElevenLabs = async () => {
      try {
        const signedUrl = await getSignedUrl(ELEVENLABS_AGENT_ID, ELEVENLABS_API_KEY)
        elevenLabsWs = new WebSocket(signedUrl)

        elevenLabsWs.on('open', () => {
          console.log('[ElevenLabs] Connected to Conversational AI')

          // Send initial configuration with prompt and first message
          const initialConfig = {
            type: 'conversation_initiation_client_data',
            dynamic_variables: {
              user_name: 'Angelo',
              user_id: 1234,
            },
            conversation_config_override: {
              agent: {
                prompt: {
                  prompt: PROMPT,
                },
                first_message: FIRST_MESSAGE,
              },
            },
          }

          console.log(
            '[ElevenLabs] Sending initial config with prompt:',
            initialConfig.conversation_config_override.agent.prompt.prompt,
          )

          // Send the configuration to ElevenLabs
          elevenLabsWs?.send(JSON.stringify(initialConfig))
        })

        elevenLabsWs.on('message', data => {
          try {
            // @ts-expect-error
            const message = JSON.parse(data)

            switch (message.type) {
              case 'conversation_initiation_metadata':
                console.log('[ElevenLabs] Received initiation metadata')
                break

              case 'audio':
                if (streamSid) {
                  if (message.audio?.chunk) {
                    const audioData = {
                      event: 'media',
                      streamSid,
                      media: {
                        payload: message.audio.chunk,
                      },
                    }
                    ws.send(JSON.stringify(audioData))
                  } else if (message.audio_event?.audio_base_64) {
                    const audioData = {
                      event: 'media',
                      streamSid,
                      media: {
                        payload: message.audio_event.audio_base_64,
                      },
                    }
                    ws.send(JSON.stringify(audioData))
                  }
                } else {
                  console.log('[ElevenLabs] Received audio but no StreamSid yet')
                }
                break

              case 'interruption':
                if (streamSid) {
                  ws.send(
                    JSON.stringify({
                      event: 'clear',
                      streamSid,
                    }),
                  )
                }
                break

              case 'ping':
                if (message.ping_event?.event_id) {
                  elevenLabsWs?.send(
                    JSON.stringify({
                      type: 'pong',
                      event_id: message.ping_event.event_id,
                    }),
                  )
                }
                break

              case 'agent_response':
                console.log(`[Twilio] Agent response: ${message.agent_response_event?.agent_response}`)
                break

              case 'user_transcript':
                console.log(`[Twilio] User transcript: ${message.user_transcription_event?.user_transcript}`)
                break

              default:
                console.log(`[ElevenLabs] Unhandled message type: ${message.type}`)
            }
          } catch (error) {
            console.error('[ElevenLabs] Error processing message:', error)
          }
        })

        elevenLabsWs.on('error', error => {
          console.error('[ElevenLabs] WebSocket error:', error)
        })

        elevenLabsWs.on('close', () => {
          console.log('[ElevenLabs] Disconnected')
        })
      } catch (error) {
        console.error('[ElevenLabs] Setup error:', error)
      }
    }

    // Set up ElevenLabs connection
    setupElevenLabs()

    // Handle messages from Twilio
    ws.on('message', message => {
      try {
        // @ts-expect-error
        const msg = JSON.parse(message)
        if (msg.event !== 'media') {
          console.log(`[Twilio] Received event: ${msg.event}`)
        }

        switch (msg.event) {
          case 'start':
            streamSid = msg.start.streamSid
            callSid = msg.start.callSid
            customParameters = msg.start.customParameters // Store parameters
            console.log(`[Twilio] Stream started - StreamSid: ${streamSid}, CallSid: ${callSid}`)
            console.log('[Twilio] Start parameters:', customParameters)
            break

          case 'media':
            if (elevenLabsWs?.readyState === WebSocket.OPEN) {
              const audioMessage = {
                user_audio_chunk: Buffer.from(msg.media.payload, 'base64').toString('base64'),
              }
              elevenLabsWs.send(JSON.stringify(audioMessage))
            }
            break

          case 'stop':
            console.log(`[Twilio] Stream ${streamSid} ended`)
            if (elevenLabsWs?.readyState === WebSocket.OPEN) {
              elevenLabsWs.close()
            }
            break

          default:
            console.log(`[Twilio] Unhandled event: ${msg.event}`)
        }
      } catch (error) {
        console.error('[Twilio] Error processing message:', error)
      }
    })

    // Handle WebSocket closure
    ws.on('close', () => {
      console.log('[Twilio] Client disconnected')
      if (elevenLabsWs?.readyState === WebSocket.OPEN) {
        elevenLabsWs.close()
      }
    })
  })
})

// Start the Fastify server
fastify.listen({ port: PORT }, err => {
  if (err) {
    console.error('Error starting server:', err)
    process.exit(1)
  }
  console.log(`[Server] Listening on port ${PORT}`)
})
