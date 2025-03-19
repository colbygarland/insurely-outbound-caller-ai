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
    // @ts-expect-error
    return data.signed_url
  } catch (error) {
    console.error('Error getting signed URL:', error)
    throw error
  }
}
