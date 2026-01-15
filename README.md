# YMCA SMART on FHIR Application

A web-based SMART on FHIR application designed for YMCA health data integration. This application can be launched from smarthealthit.org and displays patient information, vital signs, and recent observations in a clean, modern interface.

## Features

- 🏥 **SMART on FHIR Integration**: Fully compliant with SMART on FHIR authorization
- 👤 **Patient Information**: Displays comprehensive patient demographics
- 💓 **Vital Signs**: Shows latest vital signs including temperature, heart rate, blood pressure
- 📊 **Observations**: Lists recent medical observations and lab results
- �‍♀️ **YMCA Referrals**: Submit referrals directly to local HAPI FHIR server
- �🎨 **Modern UI**: Clean, responsive design with YMCA branding
- 🔒 **Secure**: OAuth2-based authentication with proper token handling

## Quick Start

### Prerequisites

- Node.js (version 14 or higher)
- Web server or hosting platform
- FHIR server access (e.g., smarthealthit.org sandbox)

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser to:**
   ```
   http://localhost:3000
   ```

### Testing with SMART Health IT

1. Go to [https://launch.smarthealthit.org](https://launch.smarthealthit.org)
2. Enter your app's launch URL: `http://localhost:3000/launch.html`
3. Select a patient and launch the app
4. The app will redirect to your local development server

### Testing YMCA Referrals with Local HAPI FHIR

1. **Start HAPI FHIR Server:**
   ```bash
   # Using Docker (recommended)
   docker run -p 8080:8080 hapiproject/hapi:latest
   
   # Access HAPI FHIR at: http://localhost:8080/fhir/
   ```

2. **Submit Referrals:**
   - Launch your SMART app from SMART Health IT
   - Scroll to "YMCA Program Referral" section
   - Select a program (e.g., "Diabetes Prevention")
   - Add clinical notes
   - Click "Submit Referral to HAPI FHIR Server"
   - **The app automatically creates the patient in your local HAPI FHIR if needed**

3. **Verify Referrals:**
   - Check HAPI FHIR web interface: `http://localhost:8080/`
   - Search for ServiceRequest resources
   - Search for Patient resources (auto-created from SMART Health IT)
   - View submitted referral data

## Deployment

### 1. Build for Production

The app is ready for deployment as static files. Simply upload all files to your web server:

- `index.html` - Main application
- `launch.html` - SMART launch page
- `app.js` - Application logic
- `package.json` - Dependencies
- `smart-app-manifest.json` - App configuration

### 2. Configure Hosting

Upload files to your hosting provider (GitHub Pages, Netlify, Vercel, etc.)

### 3. Update Manifest

Edit `smart-app-manifest.json` and replace placeholder URLs:

```json
{
  "client_uri": "https://your-actual-domain.com",
  "redirect_uris": [
    "https://your-actual-domain.com/index.html"
  ],
  "launch_uris": [
    "https://your-actual-domain.com/launch.html"
  ]
}
```

### 4. Register with SMART Health IT

1. Go to [https://launch.smarthealthit.org](https://launch.smarthealthit.org)
2. Click "Register New App"
3. Use your deployed `launch.html` URL
4. Test with different patients and scenarios

## App Configuration

### Scopes

The app requests these FHIR scopes:
- `launch` - SMART launch context
- `patient/*.read` - Read access to patient data

### FHIR Resources

The app reads:
- **Patient** - Demographics and contact information
- **Observation** - Vital signs and lab results

## File Structure

```
ymca-smart-app/ 
├── index.html # Main application interface 
├── launch.html # SMART launch entry point 
├── app.js # Application logic 
├── package.json # Node.js dependencies 
├── smart-app-manifest.json # SMART app configuration 
├── README.md # Project documentation 
├── src/ 
│ ├── fhir/ # FHIR‐related business logic and API integrations (e.g. creating patients & referrals).
│ ├── ui/ # DOM‐manipulation and UI components (display helpers, form handlers, error banners).
│ └── utils/ # Shared utility functions (data formatting, patient/observation helpers).
├── __tests__/ # Unit tests covering your FHIR, UI, and utility modules.
│ ├── fhir/ # Tests for FHIR workflows (ensure/create patient, submit referrals).
│ ├── ui/ # Tests for UI behavior (displayPatientInfo, showError, form submission).
│ └── utils/ # Tests for helper utilities (name/address formatting, observation parsing).
```

## SMART on FHIR Flow

1. **Launch**: User launches app from EHR or launch.smarthealthit.org
2. **Authorize**: App redirects to FHIR server for OAuth2 authorization
3. **Token Exchange**: App receives authorization code and exchanges for access token
4. **Data Access**: App uses token to fetch patient data from FHIR server
5. **Display**: App presents patient information in user-friendly interface

## Development

### Adding New Features

1. **New FHIR Resources**: Add requests in `app.js`
2. **UI Components**: Update HTML structure and CSS styling
3. **Data Processing**: Add utility functions for new data types

### Error Handling

The app includes comprehensive error handling:
- Authorization failures
- Network connectivity issues
- Missing patient data
- FHIR server errors

## Running Unit Tests

We use Jest to validate all helper functions, UI components, and FHIR workflows.

1. Install dependencies (if you haven’t already):
   ```bash
   npm install
   ```

2. Run the full test suite:
   ```bash
   npm test
   ```

3. Run a single test file (e.g. the UI display tests):
   ```bash
   npm test -- __tests__/ui/display.test.js
   ```

4. Run tests in watch mode during development:
   ```bash
   npm test -- --watch
   ```

All tests live under __tests__ (for referral, error, display, form, helpers) and are executed by Jest with a JSDOM environment for DOM-related code.

## Security Considerations

- No sensitive data is stored locally
- OAuth2 tokens are handled securely
- HTTPS required for production deployment
- CORS properly configured for FHIR requests



---

**Note**: Replace placeholder URLs in `smart-app-manifest.json` with your actual deployment URLs before production use.
