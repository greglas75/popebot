/**
 * OAuth provider presets.
 *
 * Nested by provider → packages. Each provider shares authorize/token URLs;
 * each package defines the scopes for a specific integration.
 */
export const OAUTH_PROVIDERS = {
  google: {
    name: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    packages: {
      gmail: {
        name: 'Gmail',
        scopes: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
      },
      calendar: {
        name: 'Google Calendar',
        scopes: 'https://www.googleapis.com/auth/calendar',
      },
      drive: {
        name: 'Google Drive',
        scopes: 'https://www.googleapis.com/auth/drive',
      },
      sheets: {
        name: 'Google Sheets',
        scopes: 'https://www.googleapis.com/auth/spreadsheets',
      },
      youtube: {
        name: 'YouTube',
        scopes: 'https://www.googleapis.com/auth/youtube',
      },
    },
  },
};
