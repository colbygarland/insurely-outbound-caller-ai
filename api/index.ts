import Twilio from 'twilio'
import WebSocket from 'ws'
import dotenv from 'dotenv'
import { escapeXML, getSignedUrl, handleBookMeetingInHubspot, handleTransferCall } from '../src/utils/utils'
import { FIRST_MESSAGE, PORT, PROMPT, TOOLS } from '../src/constants'
import { createServer } from '../src/server'
import { HUBSPOT } from '../src/hubspot'
import { ELEVENLABS } from '../src/elevenLabs'
import { CallEvent } from '../types/twilio'
import '../instrument.js'

// Load environment variables from .env file
dotenv.config()

// Check for required environment variables
const { ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } =
  process.env

if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  console.error('Missing required environment variables')
  throw new Error('Missing required environment variables')
}

// Initialize Fastify server
const server = createServer()

// Initialize Twilio client
const twilioClient = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

const activeCalls: Array<{
  phone: string
  firstName: string
  lastName: string
  email: string
  callSid: string
}> = []

// Route to initiate outbound calls
server.post('/outbound-call', async (request, reply) => {
  // @ts-expect-error
  const { number, email, firstName, lastName, timezone, caller_api_key } = request.body

  if (!caller_api_key || caller_api_key !== process.env.CALLER_API_KEY) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }

  if (!number) {
    return reply.code(400).send({ error: 'Phone number is required' })
  }

  const queryParams = `email=${encodeURIComponent(email)}&firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&phone=${encodeURIComponent(number)}&timezone=${encodeURIComponent(timezone)}`
  const url = `https://${request.headers.host}/outbound-call-twiml?${queryParams}`

  try {
    const call = await twilioClient.calls.create({
      from: TWILIO_PHONE_NUMBER,
      to: number,
      url,
      machineDetection: 'Enable',
      asyncAmd: 'true',
      // timeout: 15, // short timeout for testing
      statusCallbackMethod: 'POST',
      statusCallback: `https://${request.headers.host}/outbound-call-status`,
    })

    activeCalls.push({
      phone: number,
      firstName,
      lastName,
      email,
      callSid: call.sid,
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

// @ts-expect-error
server.post('/outbound-call-status', async (request: { body: CallEvent }, reply) => {
  const { CallStatus } = request.body

  if (CallStatus === 'no-answer') {
    console.log(`[Twilio] Call status: ${CallStatus}`)
    const call = activeCalls.find(call => call.callSid === request.body.CallSid)
    // tell Hubspot the call didn't land
    if (call) {
      const user = await HUBSPOT.getClientDetails({
        firstName: call.firstName,
        lastName: call.lastName,
        email: call.email,
      })
      if (user?.[0]?.id) {
        await HUBSPOT.createEngagement({
          id: Number(user[0].id),
          ownerId: Number(user[0].properties.hubspot_owner_id),
          metadata: {
            body: `<p><strong>[User]</strong> didn't answer the call.</p>`,
            fromNumber: process.env.TWILIO_PHONE_NUMBER!,
            toNumber: call.phone,
            recordingUrl: '',
            durationMilliseconds: 0,
            status: 'COMPLETED',
          },
        })
      }
    }

    reply.send({
      success: true,
      message: 'Call not answered',
    })
  }
})

// TwiML route for outbound calls
server.all('/outbound-call-twiml', async (request, reply) => {
  // @ts-expect-error
  const { email, firstName, lastName, phone, timezone } = request.query
  const agent = await ELEVENLABS.getAgent()
  const prompt = agent?.conversation_config?.agent?.prompt?.prompt ?? PROMPT
  const first_message = agent?.conversation_config?.agent?.first_message ?? FIRST_MESSAGE

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Connect>
        <Stream url="wss://${request.headers.host}/outbound-media-stream">
            <Parameter name="prompt" value="${escapeXML(prompt)}" />
            <Parameter name="first_message" value="${escapeXML(first_message)}" />
            <Parameter name="email" value="${escapeXML(email)}" />
            <Parameter name="firstName" value="${escapeXML(firstName)}" />
            <Parameter name="lastName" value="${escapeXML(lastName)}" />
            <Parameter name="phone" value="${escapeXML(phone)}" />
            <Parameter name="timezone" value="${escapeXML(timezone)}" />
        </Stream>
        </Connect>
    </Response>`

  reply.type('text/xml').send(twimlResponse)
})

// WebSocket route for handling media streams
server.register(async fastifyInstance => {
  fastifyInstance.get('/outbound-media-stream', { websocket: true }, async (ws, req) => {
    console.info('[Server] Twilio connected to outbound media stream')

    // Variables to track the call
    let streamSid: string | null = null
    let callSid: string | null = null
    let elevenLabsWs: WebSocket | null = null
    let customParameters: {
      email: string
      first_message: string
      prompt: string
      firstName: string
      lastName: string
      phone: string
      timezone: string
    } | null = null // Add this to store parameters
    let callLog = ''

    // Handle WebSocket errors
    ws.on('error', console.error)

    // Set up ElevenLabs connection
    const setupElevenLabs = async () => {
      try {
        const signedUrl = await getSignedUrl(ELEVENLABS_AGENT_ID, ELEVENLABS_API_KEY)
        const agent = await ELEVENLABS.getAgent()
        elevenLabsWs = new WebSocket(signedUrl)

        elevenLabsWs.on('open', () => {
          console.log('[ElevenLabs] Connected to Conversational AI')

          // Send initial configuration with prompt and first message
          const initialConfig = {
            type: 'conversation_initiation_client_data',
            conversation_config_override: {
              agent: {
                prompt: {
                  prompt: agent?.conversation_config.agent?.prompt?.prompt ?? PROMPT,
                },
                first_message: agent?.conversation_config.agent?.first_message ?? FIRST_MESSAGE,
              },
            },
          }

          // console.log(
          //   '[ElevenLabs] Sending initial config with prompt:',
          //   initialConfig.conversation_config_override.agent.prompt.prompt,
          // )

          // Send the configuration to ElevenLabs
          elevenLabsWs?.send(JSON.stringify(initialConfig))
        })

        elevenLabsWs.on('message', async data => {
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
                callLog += `<p><strong>[Agent]</strong> ${message.agent_response_event?.agent_response}</p>`
                break

              case 'user_transcript':
                console.log(`[Twilio] User transcript: ${message.user_transcription_event?.user_transcript}`)
                callLog += `<p><strong>[User]</strong> ${message.user_transcription_event?.user_transcript}</p>`
                break

              case 'tool_request':
                {
                  console.log(`[Tool Request] tool_request received`)
                  const toolName = message.tool_request?.tool_name
                  console.log(`[Tool Request] tool name: ${toolName}`)
                  const toolParameters = message.tool_request?.params || {}

                  if (toolName === TOOLS.transferCall && callSid) {
                    const transferResult = await handleTransferCall(callSid, twilioClient, activeCalls)
                    console.log(`[Tool Request] Transfer result: ${JSON.stringify(transferResult)}`)
                    console.log(
                      `[II] Sending tool response to ElevenLabs with event ID: ${message.tool_request.event_id}`,
                    )
                    const toolResponse = {
                      type: 'tool_response',
                      event_id: message.tool_request.event_id,
                      tool_name: 'transfer_to_agent',
                      result: transferResult,
                    }
                    console.log(`[II] Tool response payload: ${JSON.stringify(toolResponse)}`)

                    elevenLabsWs?.send(JSON.stringify(toolResponse))
                    break
                  }
                  if (toolName === TOOLS.bookCall) {
                    console.log(`[Tool Request 1] Book call request received`)
                    console.log(`[Tool Request 1] tool parameters: ${JSON.stringify(toolParameters)}`)
                    break
                    const bookCallResult = await HUBSPOT.bookMeeting({
                      firstName: toolParameters.firstName,
                      lastName: toolParameters.lastName,
                      email: toolParameters.email,
                      startTime: toolParameters.startTime,
                      phone: toolParameters.phone,
                    })
                    console.log(`[Tool Request] Book call result: ${JSON.stringify(bookCallResult)}`)
                    console.log(
                      `[Tool Request] Sending tool response to ElevenLabs with event ID: ${message.tool_request.event_id}`,
                    )
                    const bookCallResponse = {
                      type: 'tool_response',
                      event_id: message.tool_request.event_id,
                      tool_name: 'book_call',
                      result: bookCallResult,
                    }
                    console.log(`[Tool Request] Tool response payload: ${JSON.stringify(bookCallResponse)}`)

                    elevenLabsWs?.send(JSON.stringify(bookCallResponse))
                  }
                }
                break
              case 'client_tool_call':
                console.log(`[Tool Request] client_tool_call received`)
                const toolName = message.client_tool_call?.tool_name
                console.log(`[Tool Request] tool name: ${toolName}`)
                // console.log(`[Tool Request] tool: ${JSON.stringify(message.client_tool_call)}`)
                const toolParameters = message.client_tool_call?.parameters || {}

                if (toolName === TOOLS.transferCall && callSid) {
                  const transferResult = await handleTransferCall(callSid, twilioClient, activeCalls)
                  console.log(`[Tool Request] Transfer result: ${JSON.stringify(transferResult)}`)
                  console.log(
                    `[Tool Request] Sending tool response to ElevenLabs with event ID: ${message.client_tool_call.event_id}`,
                  )
                  const toolResponse = {
                    type: 'tool_response',
                    event_id: message.client_tool_call.event_id,
                    tool_name: 'transfer_to_agent',
                    result: transferResult,
                  }
                  console.log(`[Tool Request] Tool response payload: ${JSON.stringify(toolResponse)}`)

                  elevenLabsWs?.send(JSON.stringify(toolResponse))
                  break
                }

                if (toolName === TOOLS.bookCall) {
                  console.log(`[Tool Request 2] Book call request received`)
                  console.log(`[Tool Request 2] tool parameters: ${JSON.stringify(toolParameters)}`)
                  const response = await handleBookMeetingInHubspot({
                    firstName: customParameters?.firstName!,
                    lastName: customParameters?.lastName!,
                    email: customParameters?.email!,
                    phone: customParameters?.phone!,
                    day: toolParameters?.day,
                    time: toolParameters?.time,
                    timezone: customParameters?.timezone!,
                  })
                  console.log(`[Tool Request] Book call result: ${JSON.stringify(response)}`)
                  break
                }

                if (toolName === TOOLS.createCall) {
                  console.log(`[Tool Request] Create call request received`)
                  const user = await HUBSPOT.getClientDetails({
                    firstName: customParameters?.firstName,
                    lastName: customParameters?.lastName,
                    email: customParameters?.email,
                    phone: customParameters?.phone,
                  })
                  const response = await HUBSPOT.createEngagement({
                    id: Number(user?.[0].id),
                    ownerId: Number(user?.[0].properties.hubspot_owner_id),
                    metadata: {
                      body: callLog,
                      fromNumber: process.env.TWILIO_PHONE_NUMBER!,
                      toNumber: toolParameters.phone,
                      status: 'COMPLETED',
                      recordingUrl: '',
                      durationMilliseconds: 0,
                    },
                  })
                  console.log(`[Tool Request] response: ${JSON.stringify(response)}`)
                  break
                }

                if (toolName === TOOLS.noAnswer) {
                  console.log(`[Tool Request] No answer received`)
                  const user = await HUBSPOT.getClientDetails({
                    firstName: customParameters?.firstName,
                    lastName: customParameters?.lastName,
                    email: customParameters?.email,
                    phone: customParameters?.phone,
                  })
                  const response = await HUBSPOT.createEngagement({
                    id: Number(user?.[0].id),
                    ownerId: Number(user?.[0].properties.hubspot_owner_id),
                    metadata: {
                      body: "<p><strong>[User]</strong> didn't answer the call.</p>",
                      fromNumber: process.env.TWILIO_PHONE_NUMBER!,
                      toNumber: toolParameters.phone,
                      status: 'COMPLETED',
                      recordingUrl: '',
                      durationMilliseconds: 0,
                    },
                  })
                  console.log(`[Tool Request] response: ${JSON.stringify(response)}`)
                  break
                }

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
            // console.log('[Twilio] Start parameters:', customParameters)
            // console.log(`[Twilio] msg: ${JSON.stringify(msg)}`)
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
server.listen({ port: PORT, host: process.env.NODE_ENV === 'development' ? 'localhost' : '0.0.0.0' }, err => {
  if (err) {
    console.error('Error starting server:', err)
    process.exit(1)
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[Server] Listening on http://localhost:${PORT}`)
  } else {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`)
  }
})

// Root route for health check
server.get('/', async (_, reply) => {
  reply.send({ message: 'Server is running' })
})

server.all('/incoming-call-eleven', async (request: any, reply) => {
  const callSid = request.body.CallSid
  console.log(`[Twilio] Incoming call received with SID: ${callSid}`)

  if (callSid) {
    // activeCalls.set(callSid, {
    //   status: 'active',
    //   from: request.body.From,
    //   to: request.body.To,
    //   started: new Date(),
    // })
    console.log(
      `[Twilio] Call tracked: ${JSON.stringify({
        from: request.body.From,
        to: request.body.To,
      })}`,
    )
  }

  // Generate TwiML response to connect the call to a WebSocket stream
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <Stream url="wss://${request.headers.host}/media-stream" />
      </Connect>
    </Response>`

  reply.type('text/xml').send(twimlResponse)
})

/** 
 * curl -X POST localhost:3000/hubspot \
-H "Content-Type: application/json" \
-d '{
    "firstName": "Colby",
    "lastName": "Garland",
    "phone": "780-882-4742",
    "email": "colbyrobyn2017@gmail.com",
    "day": "May 9",
    "time": "14:00",
    "timezone": "America/Edmonton",
    "skipMeeting": false
    }' | jq
 */
server.all('/hubspot', async (request: any) => {
  console.log(`[Hubspot] testing hubspot`)
  const { phone, email, firstName, lastName, day, time, timezone, skipMeeting } = request.body
  //const response = await HUBSPOT.getAvailableMeetingTimes({ timezone: 'America/Edmonton' })
  const response = await handleBookMeetingInHubspot({
    email,
    phone,
    firstName,
    lastName,
    day,
    time,
    timezone,
    skipMeeting,
  })
  return response
})

server.get('/debug-sentry', () => {
  console.log('.log')
  console.error('.error')
  throw new Error('testing Sentry')
})
