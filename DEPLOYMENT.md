# YMCA SMART App Deployment Guide

## Quick Start for Testing with SMART Health IT

### 1. Start Local Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:8080`

### 2. Test with SMART Health IT Sandbox

1. Go to [https://launch.smarthealthit.org](https://launch.smarthealthit.org)
2. Enter Launch URL: `http://localhost:8080/launch.html`
3. Select a patient (e.g., "Smart, Nancy")
4. Choose a provider if prompted
5. Click "Launch App"

The app should:
- Redirect to your local server
- Display patient information
- Show vital signs and observations

## Production Deployment

### Option 1: GitHub Pages

1. **Create GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/ymca-smart-app.git
   git push -u origin main
   ```

2. **Enable GitHub Pages**
   - Go to repository Settings
   - Scroll to "Pages" section
   - Select "Deploy from a branch"
   - Choose "main" branch
   - Click Save

3. **Update Configuration**
   - Edit `smart-app-manifest.json`
   - Replace URLs with: `https://yourusername.github.io/ymca-smart-app/`

### Option 2: Netlify

1. **Deploy to Netlify**
   - Go to [netlify.com](https://netlify.com)
   - Connect your GitHub repository
   - Deploy automatically

2. **Update Configuration**
   - Edit `smart-app-manifest.json`
   - Replace URLs with your Netlify domain

### Option 3: Vercel

1. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Deploy automatically

2. **Update Configuration**
   - Edit `smart-app-manifest.json`
   - Replace URLs with your Vercel domain

## Register with EHR Systems

### SMART Health IT

1. Go to [https://launch.smarthealthit.org](https://launch.smarthealthit.org)
2. Click "Register New App"
3. Enter your production launch URL
4. Test with different patients

### Epic MyChart

1. Contact Epic support for sandbox access
2. Register your app with Epic App Orchard
3. Follow Epic's SMART on FHIR guidelines

### Cerner SMART on FHIR

1. Register at [Cerner FHIR Developers](https://fhir.cerner.com)
2. Follow Cerner's app registration process

## Configuration for Production

### Update Manifest File

Edit `smart-app-manifest.json`:

```json
{
  "software_id": "ymca-smart-app",
  "client_name": "YMCA Health Dashboard",
  "client_uri": "https://your-production-domain.com",
  "logo_uri": "https://your-production-domain.com/logo.png",
  "redirect_uris": [
    "https://your-production-domain.com/index.html"
  ],
  "launch_uris": [
    "https://your-production-domain.com/launch.html"
  ]
}
```

### Security Considerations

- ✅ Always use HTTPS in production
- ✅ Configure proper CORS headers
- ✅ No sensitive data stored in localStorage
- ✅ OAuth2 tokens handled securely
- ✅ Validate all FHIR data inputs

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure HTTPS is enabled
   - Check FHIR server CORS configuration

2. **Authorization Failures**
   - Verify redirect URIs match exactly
   - Check client ID configuration

3. **No Patient Data**
   - Verify OAuth2 scopes
   - Check patient context in launch

### Debug Mode

Add debug logging by uncommenting console.log statements in `app.js`

## Support

For technical support:
- Check browser console for errors
- Verify FHIR server connectivity
- Test with SMART Health IT sandbox first
- Contact YMCA technical team

## License

MIT License - See LICENSE file for details
