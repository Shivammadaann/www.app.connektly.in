import crypto from 'node:crypto';

const PURPOSE = 'connektly:whatsapp-embedded-signup:v1';
const TICKET_LIFETIME_MS = 10 * 60 * 1000;

interface EmbeddedSignupTicketClaims {
  userId: string;
  appId: string;
  configId: string;
  oauthState: string;
  accessToken: string;
  expiresAt: number;
}

function ticketKey(secret: string) {
  if (!secret) throw new Error('Meta app credentials are not configured.');
  return crypto.createHash('sha256').update(`${PURPOSE}:${secret}`).digest();
}

export function createEmbeddedSignupTicket(
  claims: Omit<EmbeddedSignupTicketClaims, 'expiresAt'>,
  secret: string,
  now = Date.now(),
) {
  const expiresAt = now + TICKET_LIFETIME_MS;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ticketKey(secret), iv);
  cipher.setAAD(Buffer.from(PURPOSE));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ ...claims, expiresAt }), 'utf8'),
    cipher.final(),
  ]);
  return {
    signupTicket: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url'),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function readEmbeddedSignupTicket(
  ticket: string,
  expected: Pick<EmbeddedSignupTicketClaims, 'userId' | 'appId' | 'configId' | 'oauthState'>,
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
    if (
      claims.userId !== expected.userId || claims.appId !== expected.appId ||
      claims.configId !== expected.configId || claims.oauthState !== expected.oauthState ||
      typeof claims.accessToken !== 'string' || !claims.accessToken ||
      !Number.isFinite(claims.expiresAt) || claims.expiresAt <= now
    ) throw new Error();
    return claims;
  } catch {
    throw new Error('This WhatsApp signup session is invalid or expired. Start Embedded Signup again.');
  }
}
