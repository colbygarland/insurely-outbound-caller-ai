"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleBookMeetingInHubspot = exports.escapeXML = void 0;
exports.getSignedUrl = getSignedUrl;
exports.handleTransferCall = handleTransferCall;
const twilio_1 = __importDefault(require("twilio"));
const hubspot_1 = require("./hubspot");
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
        console.log(`[Transfer] Outbound call to agent created: ${agentCall.sid}`);
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
const handleBookMeetingInHubspot = async ({ email, phone, firstName, lastName, day, time, timezone, skipMeeting, }) => {
    if (!email || !firstName || !lastName || !day || !time) {
        console.error(`[Hubspot] missing required parameters`);
        throw new Error('One of [email, firstName, lastName, day, time] is required');
    }
    console.log(`[Hubspot] booking meeting for ${firstName} ${lastName} with email ${email} at ${day} ${time} ${timezone}`);
    const users = await hubspot_1.HUBSPOT.getClientDetails({ firstName, lastName, email, phone });
    if (!users) {
        console.log(`[Hubspot] no user found`);
    }
    const user = users?.[0] ?? null;
    // Will this pigeon hole us if this is happening near the end of the year??
    const year = new Date().getFullYear();
    // How are we going to get the timezone reliably? That is a must
    const date = new Date(`${day} ${year} ${time}`);
    const options = {
        timeZone: timezone,
    };
    const dateString = date.toLocaleString('en-US', options);
    const formattedDate = new Date(dateString);
    const startTime = formattedDate.getTime();
    console.log(`[Hubspot] start time: ${startTime} (${date.toISOString()})`);
    if (skipMeeting) {
        console.log(`[Hubspot] Book meeting is false, not booking meeting`);
        return user;
    }
    // Book the actual meeting now
    const meetingResponse = await hubspot_1.HUBSPOT.bookMeeting({
        firstName,
        lastName,
        email,
        startTime,
        ownerId: user?.properties?.hubspot_owner_id,
        phone,
    });
    if (!meetingResponse) {
        return 'user found, but no meeting was booked';
    }
    return meetingResponse;
};
exports.handleBookMeetingInHubspot = handleBookMeetingInHubspot;
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="7ad889a8-3bb5-5e5c-88a4-c28314bf70f1")}catch(e){}}();
//# debugId=7ad889a8-3bb5-5e5c-88a4-c28314bf70f1
