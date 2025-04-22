"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeXML = void 0;
exports.getSignedUrl = getSignedUrl;
exports.handleTransferCall = handleTransferCall;
const twilio_1 = __importDefault(require("twilio"));
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
        activeCalls.set(callSid, {
            status: 'transferring',
            conferenceName,
            agentCallSid: agentCall.sid,
            forwardPhone,
        });
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
