"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HUBSPOT = void 0;
const api_client_1 = require("@hubspot/api-client");
const contacts_1 = require("@hubspot/api-client/lib/codegen/crm/contacts");
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
            console.log(`[Hubspot API] response = ${JSON.stringify(response)}`);
            return response.results;
        }
        catch (error) {
            console.error(`[Hubspot] error with getClientDetails(): ${JSON.stringify(error)}`);
            return null;
        }
    },
    bookMeeting: async ({ firstName, lastName, startTime, email, ownerId, }) => {
        // https://developers.hubspot.com/docs/reference/api/library/meetings#post-%2Fscheduler%2Fv3%2Fmeetings%2Fmeeting-links%2Fbook
        const body = {
            duration: 1800000, // 30 minutes
            firstName,
            lastName,
            consented: true,
            startTime, // JS unix timestamp
            locale: 'en-us',
            slug: process.env.HUBSPOT_MEETING_SLUG,
            email,
            ...(ownerId ? { likelyAvailableUserIds: [ownerId] } : {}),
        };
        try {
            const response = await hubspotClient.apiRequest({
                method: 'POST',
                path: '/scheduler/v3/meetings/meeting-links/book',
                body,
            });
            const json = await response.json();
            console.log(`[Hubspot API] response = ${JSON.stringify(json)}`);
            if (json.error) {
                throw new Error(json);
            }
            return json;
        }
        catch (error) {
            console.error(`[Hubspot] error with getClientDetails(): ${JSON.stringify(error)}`);
            return null;
        }
    },
};
