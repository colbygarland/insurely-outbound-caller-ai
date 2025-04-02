import { Client } from '@hubspot/api-client'
import { FilterOperatorEnum } from '@hubspot/api-client/lib/codegen/crm/contacts'

const hubspotClient = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })

export const HUBSPOT = {
  getClientDetails: async ({
    firstName,
    lastName,
    email,
    phone,
  }: {
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
  }): Promise<Array<Client> | null> => {
    try {
      const api = hubspotClient.crm.contacts.searchApi
      const response = await api.doSearch({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: FilterOperatorEnum.Eq,
                value: email,
              },
              {
                propertyName: 'firstname',
                operator: FilterOperatorEnum.Eq,
                value: firstName,
              },
              {
                propertyName: 'lastname',
                operator: FilterOperatorEnum.Eq,
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
      })
      if (response.total < 1) {
        console.log(`[Hubspot API] no results found`)
        return null
      }
      console.log(`[Hubspot API] response = ${response}`)
      return response.results as unknown as Array<Client>
    } catch (error) {
      console.error(`[Hubspot] error with getClientDetails(): ${JSON.stringify(error)}`)
      return null
    }
  },
  bookMeeting: async ({
    firstName,
    lastName,
    startTime,
    email,
  }: {
    firstName: string
    lastName: string
    startTime: string
    email: string
  }) => {
    // Pretty sure its this: https://developers.hubspot.com/docs/reference/api/library/meetings#post-%2Fscheduler%2Fv3%2Fmeetings%2Fmeeting-links%2Fbook
    const body = {
      duration: 30,
      firstName,
      lastName,
      likelyAvailable: [],
      legalConsent: [],
      communication: '',
      consented: true,
      startTime, // 2025-04-02T01:16:00.012Z
      locale: 'en',
      slug: '',
      email,
    }
    try {
      const response = await hubspotClient.apiRequest({
        method: 'POST',
        path: '/scheduler/v3/meetings/meeting-links/book',
        body,
        headers: {
          authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
        },
      })
      console.log(`[Hubspot API] response = ${response}`)
    } catch (error) {
      console.error(`[Hubspot] error with getClientDetails(): ${JSON.stringify(error)}`)
      return null
    }
  },
} as const
