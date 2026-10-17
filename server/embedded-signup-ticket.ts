import crypto from 'node:crypto';

const PURPOSE = 'connektly:whatsapp-embedded-signup:v1';
const TICKET_LIFETIME_MS = 10 * 60 * 1000;

interface EmbeddedSignupTicketClaims {
  userId: string;
  appId: string;
  configId: string;
  oauthState: string;
  accessToken: string;
  setupType: 'exclusive' | 'coexistence';
  onboardingId: string;
  issuedAt: number;
  expiresAt: number;
}

function ticketKey(secret: string) {
  if (!secret) throw new Error('Meta app credentials are not configured.');
  return crypto.createHash('sha256').update(`${PURPOSE}:${secret}`).digest();
}

export function createEmbeddedSignupTicket(
  claims: Omit<EmbeddedSignupTicketClaims, 'expiresAt' | 'setupType' | 'onboardingId' | 'issuedAt'> & {
    setupType?: EmbeddedSignupTicketClaims['setupType'];
  },
  secret: string,
  now = Date.now(),
) {
  const expiresAt = now + TICKET_LIFETIME_MS;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ticketKey(secret), iv);
  cipher.setAAD(Buffer.from(PURPOSE));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({
      ...claims, setupType: claims.setupType || 'exclusive',
      onboardingId: crypto.randomUUID(), issuedAt: now, expiresAt,
    }), 'utf8'),
    cipher.final(),
  ]);
  return {
    signupTicket: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url'),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function readEmbeddedSignupTicket(
  ticket: string,
  expected: Pick<EmbeddedSignupTicketClaims, 'userId' | 'appId' | 'configId' | 'oauthState'> & {
    setupType?: EmbeddedSignupTicketClaims['setupType'];
  },
  secret: string,
  now = Date.now(),
): EmbeddedSignupTicketClaims {
  try {
    if (!ticket || ticket.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(ticket)) throw new Error();
    const bytes = Buffer.from(ticket, 'base64url');
    if (bytes.length <= 28) throw new Error();
    const decipher = crypto.createDecipheriv('aes-256-gcm', ticketKey(secret), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(PURPOSE));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const claims = JSON.parse(Buffer.concat([
      decipher.update(bytes.subarray(28)), decipher.final(),
    ]).toString('utf8')) as EmbeddedSignupTicketClaims;
    // Pre-upgrade tickets remain usable only for their original Cloud API flow.
    claims.setupType = claims.setupType || 'exclusive';
    claims.issuedAt = claims.issuedAt ?? claims.expiresAt - TICKET_LIFETIME_MS;
    claims.onboardingId = claims.onboardingId || crypto.createHash('sha256').update(ticket).digest('hex');
    if (
      claims.userId !== expected.userId || claims.appId !== expected.appId ||
      claims.configId !== expected.configId || claims.oauthState !== expected.oauthState ||
      !['exclusive', 'coexistence'].includes(claims.setupType) ||
      (expected.setupType !== undefined && claims.setupType !== expected.setupType) ||
      typeof claims.onboardingId !== 'string' || !claims.onboardingId ||
      !Number.isFinite(claims.issuedAt) || claims.issuedAt > now ||
      typeof claims.accessToken !== 'string' || !claims.accessToken ||
      !Number.isFinite(claims.expiresAt) || claims.expiresAt <= now
    ) throw new Error();
    return claims;
  } catch {
    throw new Error('This WhatsApp signup session is invalid or expired. Start Embedded Signup again.');
  }
}
