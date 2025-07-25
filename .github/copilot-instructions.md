<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# YMCA SMART on FHIR Application

This is a SMART on FHIR web application designed for YMCA health data integration.

## Technology Stack
- **Frontend**: HTML5, CSS3, vanilla JavaScript
- **FHIR Client**: fhirclient library (v2.5.2)
- **Standards**: SMART on FHIR, OAuth2, FHIR R4
- **Hosting**: Static web hosting (compatible with GitHub Pages, Netlify, Vercel)

## Key Conventions
- Use ES6+ JavaScript features
- Follow SMART on FHIR best practices
- Implement proper error handling for FHIR operations
- Use semantic HTML and accessible design patterns
- Follow responsive design principles

## FHIR Resources
- **Patient**: Demographics and identifiers
- **Observation**: Vital signs and lab results
- Focus on FHIR R4 compatibility

## Security Requirements
- OAuth2 authorization flow
- No local storage of sensitive data
- HTTPS for production deployments
- Proper CORS handling

## UI/UX Guidelines
- Modern, clean design with YMCA branding
- Mobile-responsive layout
- Accessible to users with disabilities
- Clear error messages and loading states

When making changes:
1. Test SMART launch flow thoroughly
2. Validate FHIR resource parsing
3. Ensure responsive design works on mobile
4. Check error handling for network failures
5. Verify OAuth2 token handling is secure
