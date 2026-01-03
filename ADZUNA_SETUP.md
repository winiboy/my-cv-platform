# Adzuna Job API Integration Setup

This document explains how to set up the Adzuna API integration to fetch real Swiss job listings.

## Overview

The job search feature supports two data sources:
1. **Live Data** - Real Swiss jobs from Adzuna API
2. **Sample Data** - Comprehensive mock jobs (26 listings) for development

The app will automatically fall back to sample data if Adzuna credentials are not configured or if the API fails.

## Why Adzuna?

**Adzuna** is one of the most popular job search APIs with:
- ✅ Excellent Swiss market coverage
- ✅ Free tier (5,000 API calls per month)
- ✅ Well-documented RESTful API
- ✅ Structured JSON responses
- ✅ Geographic filtering (Switzerland-specific)
- ✅ Employment type filtering
- ✅ No credit card required for free tier

## Setup Instructions

### Step 1: Sign Up for Adzuna API

1. Go to [https://developer.adzuna.com/](https://developer.adzuna.com/)
2. Click "Sign Up" in the top right
3. Fill in the registration form:
   - First Name
   - Last Name
   - Email Address
   - Company Name (can be personal project name)
   - Choose "Developer" as account type
4. Verify your email address
5. Log in to your Adzuna developer account

### Step 2: Get Your API Credentials

1. After logging in, you'll see your dashboard
2. Your credentials will be displayed:
   - **Application ID** (app_id)
   - **Application Key** (app_key)
3. Copy both values - you'll need them in the next step

### Step 3: Configure Environment Variables

1. In your project root, create or edit `.env.local`:
   ```bash
   # Adzuna Job API Configuration
   ADZUNA_APP_ID=your_app_id_here
   ADZUNA_APP_KEY=your_app_key_here
   ```

2. Replace `your_app_id_here` and `your_app_key_here` with your actual credentials

3. **Important:** Never commit `.env.local` to version control. It's already in `.gitignore`.

### Step 4: Restart Your Development Server

```bash
# Stop the current dev server (Ctrl+C)
# Then restart it
pnpm dev
```

### Step 5: Verify the Integration

1. Navigate to the Job Search page: `http://localhost:3000/en/dashboard/jobs`
2. Look for the data source indicator in the top right:
   - 🟢 **"Live Data"** (green badge) - Adzuna API is working
   - 🟡 **"Sample Data"** (amber badge) - Using mock data
3. If you see an error message, check:
   - Your `.env.local` file has the correct credentials
   - You've restarted the dev server
   - Your Adzuna account is active
   - You haven't exceeded the free tier limit (5,000 calls/month)

## API Usage and Limits

### Free Tier Limits
- **5,000 API calls per month**
- Rate limit: 1 request per second
- No credit card required

### Current Implementation
- Job search fetches: ~1 call per search/filter change
- Results are cached for 5 minutes to reduce API calls
- Automatic fallback to mock data on error

### Monitoring Usage
1. Log in to [https://developer.adzuna.com/](https://developer.adzuna.com/)
2. View your dashboard to see:
   - Calls made today
   - Calls made this month
   - Remaining calls

## How It Works

### Architecture

```
User → Job Search Page → Next.js API Route → Adzuna API → Transform → Display
                                  ↓
                          (on error or no credentials)
                                  ↓
                              Mock Data
```

### API Flow

1. **User searches for jobs** (e.g., "frontend developer" in "Zürich")
2. **Frontend** (`JobSearchLayout`) calls `/api/jobs?query=frontend&location=Zürich`
3. **API Route** (`src/app/api/jobs/route.ts`):
   - Checks for Adzuna credentials
   - If configured: Calls Adzuna API
   - If not configured or error: Returns mock data
4. **Transform** (`adzuna-client.ts`):
   - Maps Adzuna response to our `JobListing` type
   - Extracts Swiss cities
   - Formats salary ranges
   - Cleans HTML descriptions
5. **Display**: Jobs shown in two-column layout with filters

### Data Transformation

Adzuna jobs are transformed to match our schema:

| Adzuna Field | Our Field | Transformation |
|--------------|-----------|----------------|
| `id` | `id` | Direct mapping |
| `title` | `title` | Direct mapping |
| `company.display_name` | `company` | Direct mapping |
| `location.area[0]` | `location_city` | Extract first city |
| `location.area` | `location_country` | Always 'CH' |
| `contract_time` | `employment_type` | Map to our enum |
| `description` | `description` | Strip HTML, clean |
| `salary_min/max` | `salary_range` | Format as CHF range |
| `created` | `posted_date` | ISO to YYYY-MM-DD |
| `redirect_url` | `application_url` | Direct mapping |

## Troubleshooting

### Issue: "Sample Data" badge shown instead of "Live Data"

**Possible Causes:**
1. Adzuna credentials not configured
2. Dev server not restarted after adding credentials
3. API credentials are invalid

**Solution:**
1. Check `.env.local` exists and has both `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`
2. Verify credentials match your Adzuna dashboard exactly
3. Restart dev server: `pnpm dev`

### Issue: Error message shown, then falls back to sample data

**Possible Causes:**
1. Exceeded free tier limit (5,000 calls/month)
2. Network connectivity issue
3. Adzuna API temporarily down

**Solution:**
1. Check your Adzuna dashboard for usage limits
2. Wait a few minutes and try again
3. Check console for detailed error messages

### Issue: No Swiss jobs returned

**Possible Causes:**
1. Search query too specific
2. Location filter too restrictive
3. Adzuna has limited listings for that combination

**Solution:**
1. Try broader search terms
2. Remove location filter
3. Check "Sample Data" to see variety of available job types

## Development vs Production

### Development Mode
- Sample data is always available as fallback
- Data source indicator clearly shows which source is active
- Error messages are verbose for debugging

### Production Mode
- Same behavior, but consider:
  - Monitor API usage to stay within limits
  - Set up error monitoring (Sentry already configured)
  - Consider upgrading to paid Adzuna tier for higher limits
  - Add rate limiting on your API route

## Advanced Configuration

### Customizing Results

Edit `src/lib/adzuna-client.ts` to customize:

```typescript
// Change results per page
resultsPerPage: 50 // Default: 20

// Change sort order
sort_by: 'salary' // Options: 'default', 'date', 'salary'

// Add salary filters
salary_min: 80000
salary_max: 150000

// Add distance radius
distance: 30 // kilometers from location
```

### Adding Other Countries

To add jobs from other countries, modify:

```typescript
// In adzuna-client.ts
const COUNTRY_CODE = 'de' // Germany
const COUNTRY_CODE = 'fr' // France
const COUNTRY_CODE = 'at' // Austria
```

**Note:** Update the `location_country` type constraint in `src/types/jobs.ts` accordingly.

## Upgrading to Paid Tier

If you need more than 5,000 calls/month:

1. Log in to [Adzuna Developer Portal](https://developer.adzuna.com/)
2. Navigate to billing/upgrade section
3. Choose a paid plan based on your needs
4. No code changes required - same API credentials work

## Support

- **Adzuna Documentation:** https://developer.adzuna.com/docs
- **Adzuna Support:** support@adzuna.com
- **API Status:** https://status.adzuna.com/

## Alternative Job APIs

If Adzuna doesn't meet your needs, consider:

- **Indeed API** - Requires Publisher account
- **LinkedIn Jobs API** - Limited access
- **Reed API** - UK-focused but has some CH jobs
- **The Muse** - More limited Swiss coverage
