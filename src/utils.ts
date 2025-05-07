import type { Twilio as TwilioInterface } from 'twilio'
import Twilio from 'twilio'
import { HUBSPOT } from './hubspot'
import { DateTime } from 'luxon'

// Helper function to get signed URL for authenticated conversations
export async function getSignedUrl(agentId: string, apiKey: string) {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      },
    )

    if (!response.ok) {
      throw new Error(`Failed to get signed URL: ${response.statusText}`)
    }

    const data = await response.json()
    return data.signed_url
  } catch (error) {
    console.error('Error getting signed URL:', error)
    throw error
  }
}

export async function handleTransferCall(
  callSid: string,
  twilioClient: TwilioInterface,
  activeCalls: Array<{
    phone: string
    firstName: string
    lastName: string
    email: string
    callSid: string
  }>,
) {
  const forwardPhone = process.env.SUPPORT_PHONE_NUMBER
  if (!forwardPhone) {
    throw new Error('Missing phone number to forward call to')
  }

  try {
    console.log(`[Transfer] Initiating transfer for call ${callSid} to ${forwardPhone}`)

    // Get call details
    const call = await twilioClient.calls(callSid).fetch()
    const conferenceName = `transfer_${callSid}`
    const callerNumber = call.to

    // Move caller to a conference room
    const customerTwiml = new Twilio.twiml.VoiceResponse()
    customerTwiml.say('Please hold while we connect you to an agent.')
    customerTwiml.dial().conference(
      {
        startConferenceOnEnter: false,
        endConferenceOnExit: false,
        waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
      },
      conferenceName,
    )

    console.log(`[Transfer] Updating call ${callSid} with conference TwiML`)
    await twilioClient.calls(callSid).update({ twiml: customerTwiml.toString() })

    console.log(`[Transfer] Caller ${callerNumber} placed in conference ${conferenceName}`)

    // Call the agent and connect them to the same conference
    console.log(`[Transfer] Creating outbound call to agent ${forwardPhone}`)
    const agentCall = await twilioClient.calls.create({
      to: forwardPhone,
      from: call.from,
      twiml: `
        <Response>
          <Say>You are being connected to a caller who was speaking with our AI assistant.</Say>
          <Dial>
            <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">
              ${conferenceName}
            </Conference>
          </Dial>
        </Response>
      `,
    })

    console.log(`[Transfer] Outbound call to agent created: ${agentCall.sid}`)

    // activeCalls.set(callSid, {
    //   status: 'transferring',
    //   conferenceName,
    //   agentCallSid: agentCall.sid,
    //   forwardPhone,
    // })

    return { success: true, agentCallSid: agentCall.sid }
  } catch (error) {
    console.error('[Transfer] Error transferring call:', error)
    // @ts-expect-error
    console.error('[Transfer] Full error details:', error.stack)
    // @ts-expect-error
    return { success: false, error: error.message }
  }
}

export const escapeXML = (unsafe: string) => {
  return unsafe
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;')
    .replaceAll(/"/g, '&quot;')
    .replaceAll(/'/g, '&apos;')
    .replaceAll(/\n/g, ' ')
}

// Helper function to convert day and time to UTC timestamp
function convertToUTC(day: string, time: string, timezone: string): string {
  // Get current year
  const year = new Date().getFullYear()

  // Parse the date in the local timezone
  const inputString = `${day} ${time} ${year}`
  console.log(`[Timezone Debug] Input string: ${inputString}`)

  const local = DateTime.fromFormat(inputString, 'LLLL d HH:mm yyyy', {
    zone: timezone,
  })

  if (!local.isValid) {
    console.error(`[Timezone Debug] Invalid date: ${local.invalidReason} - ${local.invalidExplanation}`)
    throw new Error(`Invalid date format: ${inputString}`)
  }

  // Convert to UTC and get Unix timestamp
  const utc = local.toUTC()
  console.log(`[Timezone Debug] Local time: ${local.toString()}`)
  console.log(`[Timezone Debug] UTC time: ${utc.toString()}`)
  console.log(`[Timezone Debug] Local milli: ${local.toMillis()}`)
  console.log(`[Timezone Debug] UTC milli: ${utc.toMillis()}`)

  return utc.toString()
}

export const handleBookMeetingInHubspot = async ({
  email,
  phone,
  firstName,
  lastName,
  day,
  time,
  timezone,
  skipMeeting,
}: {
  email: string
  phone: string
  firstName: string
  lastName: string
  day: string
  time: string
  timezone: string
  skipMeeting?: boolean
}) => {
  if (!email || !firstName || !lastName || !day || !time) {
    console.error(`[Hubspot] missing required parameters`)
    throw new Error('One of [email, firstName, lastName, day, time] is required')
  }

  console.log(
    `[Hubspot] booking meeting for ${firstName} ${lastName} with email ${email} at ${day} ${time} ${timezone}`,
  )

  const users = await HUBSPOT.getClientDetails({ firstName, lastName, email, phone })
  if (!users) {
    console.log(`[Hubspot] no user found`)
  }

  const user = users?.[0] ?? null

  const startTime = convertToUTC(day, time, timezone)
  console.log(`[Hubspot] Final UTC timestamp: ${startTime}`)

  if (skipMeeting) {
    console.log(`[Hubspot] Book meeting is false, not booking meeting`)
    return user
  }

  // Book the actual meeting now
  const meetingResponse = await HUBSPOT.bookMeeting({
    firstName,
    lastName,
    email,
    startTime,
    ownerId: user?.properties?.hubspot_owner_id,
    phone,
  })
  if (!meetingResponse) {
    return 'user found, but no meeting was booked'
  }

  return meetingResponse
}
