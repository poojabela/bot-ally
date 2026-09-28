import { OAuth2Client } from 'google-auth-library';
import { signState } from '../crypto';
import { env } from '../env';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];

export function createOAuthClient() {
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${env.PUBLIC_URL}/auth/google/callback`,
  });
}

export function connectUrl(userId: string) {
  return `${env.PUBLIC_URL}/auth/google?state=${encodeURIComponent(signState(userId))}`;
}
