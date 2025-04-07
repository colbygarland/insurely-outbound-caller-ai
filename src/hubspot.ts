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
    startTime: number // JS unix timestamp
    email: string
  }) => {
    // Pretty sure its this: https://developers.hubspot.com/docs/reference/api/library/meetings#post-%2Fscheduler%2Fv3%2Fmeetings%2Fmeeting-links%2Fbook
    const body = {
      duration: 1800000, // 30 minutes
      firstName,
      lastName,
      consented: true,
      startTime, // JS unix timestamp
      locale: 'en-us',
      slug: process.env.HUBSPOT_MEETING_SLUG,
      email,
    }
    try {
      const response = await hubspotClient.apiRequest({
        method: 'POST',
        path: '/scheduler/v3/meetings/meeting-links/book',
        body,
      })
      const json = await response.json()
      console.log(`[Hubspot API] response = ${json}`)
      return json
    } catch (error) {
      console.error(`[Hubspot] error with getClientDetails(): ${JSON.stringify(error)}`)
      return null
    }
  },
} as const
