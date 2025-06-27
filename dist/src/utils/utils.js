"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTranscriptForValidation = exports.handleBookMeetingInHubspot = exports.escapeXML = void 0;
exports.getSignedUrl = getSignedUrl;
exports.handleTransferCall = handleTransferCall;
exports.convertToUTC = convertToUTC;
const twilio_1 = __importDefault(require("twilio"));
const hubspot_1 = require("../hubspot");
const luxon_1 = require("luxon");
// Helper function to get signed URL for authenticated conversations
async function getSignedUrl(agentId, apiKey) {
    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`, {
            method: 'GET',
            headers: {
                'xi-api-key': apiKey,
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to get signed URL: ${response.statusText}`);
        }
        const data = await response.json();
        return data.signed_url;
    }
    catch (error) {
        console.error('Error getting signed URL:', error);
        throw error;
    }
}
async function handleTransferCall(callSid, twilioClient, activeCalls) {
    const forwardPhone = process.env.SUPPORT_PHONE_NUMBER;
    if (!forwardPhone) {
        throw new Error('Missing phone number to forward call to');
    }
    try {
        console.log(`[Transfer] Initiating transfer for call ${callSid} to ${forwardPhone}`);
        // Get call details
        const call = await twilioClient.calls(callSid).fetch();
        const conferenceName = `transfer_${callSid}`;
        const callerNumber = call.to;
        // Move caller to a conference room
        const customerTwiml = new twilio_1.default.twiml.VoiceResponse();
        customerTwiml.say('Please hold while we connect you to an agent.');
        customerTwiml.dial().conference({
            startConferenceOnEnter: false,
            endConferenceOnExit: false,
            waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
        }, conferenceName);
        console.log(`[Transfer] Updating call ${callSid} with conference TwiML`);
        await twilioClient.calls(callSid).update({ twiml: customerTwiml.toString() });
        console.log(`[Transfer] Caller ${callerNumber} placed in conference ${conferenceName}`);
        // Call the agent and connect them to the same conference
        console.log(`[Transfer] Creating outbound call to agent ${forwardPhone}`);
        const agentCall = await twilioClient.calls.create({
            to: forwardPhone,
            from: call.from,
            callReason: 'Outbound Call',
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
        });
        console.log(`[Transfer] Outbound call transfer from ${callerNumber} to agent created: ${agentCall.sid}`);
        // activeCalls.set(callSid, {
        //   status: 'transferring',
        //   conferenceName,
        //   agentCallSid: agentCall.sid,
        //   forwardPhone,
        // })
        return { success: true, agentCallSid: agentCall.sid };
    }
    catch (error) {
        console.error('[Transfer] Error transferring call:', error);
        // @ts-expect-error
        console.error('[Transfer] Full error details:', error.stack);
        // @ts-expect-error
        return { success: false, error: error.message };
    }
}
const escapeXML = (unsafe) => {
    return unsafe
        .replaceAll(/&/g, '&amp;')
        .replaceAll(/</g, '&lt;')
        .replaceAll(/>/g, '&gt;')
        .replaceAll(/"/g, '&quot;')
        .replaceAll(/'/g, '&apos;')
        .replaceAll(/\n/g, ' ');
};
exports.escapeXML = escapeXML;
// Helper function to convert day and time to UTC timestamp
function convertToUTC(day, time, timezone) {
    // Get current year
    const year = new Date().getFullYear();
    // Parse the date in the local timezone
    const inputString = `${day} ${time} ${year}`;
    console.log(`[Timezone Debug] Input string: ${inputString}`);
    const local = luxon_1.DateTime.fromFormat(inputString, 'LLLL d HH:mm yyyy', {
        zone: timezone,
    });
    if (!local.isValid) {
        console.error(`[Timezone Debug] Invalid date: ${local.invalidReason} - ${local.invalidExplanation}`);
        throw new Error(`Invalid date format: ${inputString}`);
    }
    // Convert to UTC and get Unix timestamp
    const utc = local.toUTC();
    console.log(`[Timezone Debug] Local time: ${local.toString()}`);
    console.log(`[Timezone Debug] UTC time: ${utc.toString()}`);
    console.log(`[Timezone Debug] Local milli: ${local.toMillis()}`);
    console.log(`[Timezone Debug] UTC milli: ${utc.toMillis()}`);
    console.log(`[Timezone Debug] Timezone: ${timezone}`);
    return utc.toMillis();
}
const handleBookMeetingInHubspot = async ({ email, phone, firstName, lastName, day, time, timezone, skipMeeting, id, }) => {
    if (!email || !firstName || !lastName || !day || !time) {
        console.error(`[Hubspot] missing required parameters`);
        throw new Error('One of [email, firstName, lastName, day, time] is required');
    }
    console.log(`[Hubspot] booking meeting for ${firstName} ${lastName} with email ${email} at ${day} ${time} ${timezone}`);
    let ownerId = null;
    if (!id) {
        const users = await hubspot_1.HUBSPOT.getClientDetails({ firstName, lastName, email, phone });
        const user = users?.[0] ?? null;
        if (!user) {
            console.log(`[Hubspot] no user found`);
            return 'no user found';
        }
        id = user?.id;
        ownerId = user?.properties?.hubspot_owner_id ?? null;
    }
    const startTime = convertToUTC(day, time, timezone);
    console.log(`[Hubspot] Final UTC timestamp: ${startTime}`);
    if (skipMeeting) {
        console.log(`[Hubspot] Book meeting is false, not booking meeting`);
        return 'skipping meeting';
    }
    // Book the actual meeting now
    const meetingResponse = await hubspot_1.HUBSPOT.bookMeeting({
        firstName,
        lastName,
        email,
        startTime,
        ownerId: ownerId ? ownerId : undefined,
        phone,
        timezone,
    });
    if (!meetingResponse) {
        return 'user found, but no meeting was booked';
    }
    return meetingResponse;
};
exports.handleBookMeetingInHubspot = handleBookMeetingInHubspot;
const sendTranscriptForValidation = async ({ message, phone, email, firstName, lastName, }) => {
    const response = await fetch(process.env.CONVERSATION_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message,
            phone,
            email,
            first_name: firstName,
            last_name: lastName,
            caller_api_key: process.env.CONVERSATION_API_KEY,
        }),
    });
    console.log(`[Conversation] response = ${JSON.stringify(response)}`);
    const data = await response.json();
    console.log(`[Conversation] data = ${JSON.stringify(data)}`);
    return data;
};
exports.sendTranscriptForValidation = sendTranscriptForValidation;
