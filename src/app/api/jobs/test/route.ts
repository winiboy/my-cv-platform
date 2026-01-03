/**
 * Adzuna API Test Endpoint
 * Use this to diagnose connection issues
 * Visit: http://localhost:3000/api/jobs/test
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY

  // Check if credentials are configured
  const hasCredentials = Boolean(appId && appKey)

  if (!hasCredentials) {
    return NextResponse.json({
      status: 'error',
      message: 'Adzuna credentials not configured',
      details: {
        hasAppId: Boolean(appId),
        hasAppKey: Boolean(appKey),
        appIdLength: appId?.length || 0,
        appKeyLength: appKey?.length || 0,
      },
    })
  }

  // Test API call
  const testUrl = `https://api.adzuna.com/v1/api/jobs/ch/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=5&what=developer`

  try {
    console.log('Testing Adzuna API...')
    console.log('URL:', testUrl.replace(appKey, 'REDACTED'))

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    const responseText = await response.text()
    let responseData

    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = responseText
    }

    if (!response.ok) {
      return NextResponse.json({
        status: 'error',
        message: `Adzuna API returned error: ${response.status} ${response.statusText}`,
        details: {
          statusCode: response.status,
          statusText: response.statusText,
          responseData,
          credentialsValid: false,
          appIdProvided: Boolean(appId),
          appKeyProvided: Boolean(appKey),
          appIdPreview: appId?.substring(0, 8) + '...',
          appKeyPreview: appKey?.substring(0, 8) + '...',
        },
      })
    }

    return NextResponse.json({
      status: 'success',
      message: 'Adzuna API connection successful!',
      details: {
        statusCode: response.status,
        jobsReturned: responseData.results?.length || 0,
        totalJobs: responseData.count || 0,
        sampleJob: responseData.results?.[0] ? {
          id: responseData.results[0].id,
          title: responseData.results[0].title,
          company: responseData.results[0].company?.display_name,
          location: responseData.results[0].location?.display_name,
          descriptionLength: responseData.results[0].description?.length || 0,
          descriptionPreview: responseData.results[0].description?.substring(0, 300) + '...',
        } : null,
        fullFirstJob: responseData.results?.[0] || null, // Return complete first job object
      },
    })

  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Failed to connect to Adzuna API',
      details: {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        credentialsConfigured: true,
        appIdProvided: Boolean(appId),
        appKeyProvided: Boolean(appKey),
      },
    })
  }
}
