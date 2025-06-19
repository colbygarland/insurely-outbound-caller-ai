"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HUBSPOT = void 0;
const api_client_1 = require("@hubspot/api-client");
const contacts_1 = require("@hubspot/api-client/lib/codegen/crm/contacts");
const Sentry = __importStar(require("@sentry/node"));
const hubspotClient = new api_client_1.Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });
exports.HUBSPOT = {
    getClientDetails: async ({ firstName, lastName, email, phone, }) => {
        try {
            const api = hubspotClient.crm.contacts.searchApi;
            const response = await api.doSearch({
                filterGroups: [
                    {
                        filters: [
                            {
                                propertyName: 'email',
                                operator: contacts_1.FilterOperatorEnum.Eq,
                                value: email,
                            },
                            {
                                propertyName: 'firstname',
                                operator: contacts_1.FilterOperatorEnum.Eq,
                                value: firstName,
                            },
                            {
                                propertyName: 'lastname',
                                operator: contacts_1.FilterOperatorEnum.Eq,
                                value: lastName,
                            },
                            // {
                            //   propertyName: 'phone',
                            //   operator: FilterOperatorEnum.Eq,
                            //   value: phone,
                            // },
                            // {
                            //   propertyName: 'mobilephone',
                            //   operator: FilterOperatorEnum.Eq,
                            //   value: phone,
                            // },
                        ],
                    },
                ],
                properties: ['firstname', 'lastname', 'email', 'phone', 'hubspot_owner_id'],
            });
            if (response.total < 1) {
                console.log(`[Hubspot API] no results found`);
                return null;
            }
            console.log(`[Hubspot API getClientDetails] response = ${JSON.stringify(response)}`);
            return response.results;
        }
        catch (error) {
            console.error(`[Hubspot API] error with getClientDetails(): ${JSON.stringify(error)}`);
            return null;
        }
    },
    bookMeeting: async ({ firstName, lastName, startTime, email, ownerId, phone, timezone, }) => {
        // https://developers.hubspot.com/docs/reference/api/library/meetings#post-%2Fscheduler%2Fv3%2Fmeetings%2Fmeeting-links%2Fbook
        const body = {
            duration: 1800000, // 30 minutes
            firstName,
            lastName,
            consented: true,
            startTime, // JS unix timestamp
            locale: 'en-us',
            timezone,
            slug: process.env.HUBSPOT_MEETING_SLUG,
            email,
            formFields: [
                {
                    name: 'mobilephone',
                    value: phone,
                },
            ],
            ...(ownerId ? { likelyAvailableUserIds: [ownerId] } : {}),
        };
        try {
            const response = await hubspotClient.apiRequest({
                method: 'POST',
                path: `/scheduler/v3/meetings/meeting-links/book`,
                body,
            });
            const json = await response.json();
            console.log(`[Hubspot API bookMeeting] json = ${JSON.stringify(json)}`);
            if (json?.status === 'error' || !json?.calendarEventId) {
                throw new Error(json);
            }
            console.log(`[Hubspot API bookMeeting] meeting successfully booked for ${firstName} ${lastName} ${phone} / ${email}`);
            return json;
        }
        catch (error) {
            console.error(`[Hubspot API] error with bookMeeting(): ${JSON.stringify(error)}`);
            Sentry.captureException(error);
            throw error;
        }
    },
    createEngagement: async ({ id, metadata, ownerId, }) => {
        const timestamp = Date.now();
        const body = {
            metadata,
            properties: {
                hs_timestamp: timestamp,
                hs_call_title: 'Call with ElevenLabs',
                ...(ownerId ? { hubspot_owner_id: ownerId } : {}),
                hs_call_callee_object_id: id,
                hs_call_body: metadata.body,
                hs_call_duration: metadata.durationMilliseconds,
                hs_call_from_number: metadata.fromNumber,
                hs_call_to_number: metadata.toNumber,
                hs_call_recording_url: metadata.fromNumber,
                hs_call_status: 'COMPLETED',
                hs_call_direction: 'INBOUND',
            },
            associations: [
                {
                    to: { id }, // HubSpot Contact ID
                    types: [
                        {
                            associationCategory: 'HUBSPOT_DEFINED',
                            associationTypeId: 194, // 3 is for Contact-Call association
                        },
                    ],
                },
            ],
        };
        try {
            const response = await hubspotClient.apiRequest({
                method: 'POST',
                path: '/crm/v3/objects/calls',
                body,
            });
            const json = await response.json();
            console.log(`[Hubspot API createEngagement] response = ${JSON.stringify(json)}`);
            if (json?.error || !json?.id) {
                throw new Error(json);
            }
            console.log(`[Hubspot API createEngagement] engagement successfully created for ${metadata.toNumber}}`);
            return json;
        }
        catch (error) {
            console.error(`[Hubspot API] error with createEngagement(): ${JSON.stringify(error)}`);
            Sentry.captureException(error);
            return null;
        }
    },
    getAvailableMeetingTimes: async ({ timezone }) => {
        try {
            const response = await hubspotClient.apiRequest({
                method: 'GET',
                path: `/scheduler/v3/meetings/meeting-links/book/${encodeURIComponent(process.env.HUBSPOT_MEETING_SLUG)}?timezone=${timezone}`,
            });
            // console.log(`[Hubspot API getAvailableMeetingTimes] response = ${JSON.stringify(response)}`)
            const json = await response.json();
            // console.log(`[Hubspot API getAvailableMeetingTimes] json = ${JSON.stringify(json)}`)
            if (json.error) {
                console.error(`[Hubspot API] error with getAvailableMeetingTimes(): ${JSON.stringify(json)}`);
                throw new Error(json);
            }
            return json;
        }
        catch (error) {
            console.error(`[Hubspot API] error with getAvailableMeetingTimes(): ${JSON.stringify(error)}`);
            Sentry.captureException(error);
            return null;
        }
    },
    getMeetingLinks: async () => {
        try {
            const response = await hubspotClient.apiRequest({
                method: 'GET',
                path: `/scheduler/v3/meetings/meeting-links`,
            });
            const json = await response.json();
            console.log(`[Hubspot API getMeetingLinks] json = ${JSON.stringify(json)}`);
            if (json.error) {
                throw new Error(json);
            }
            return json;
        }
        catch (error) {
            console.error(`[Hubspot API] error with getMeetingLinks(): ${JSON.stringify(error)}`);
            Sentry.captureException(error);
            return null;
        }
    },
};
