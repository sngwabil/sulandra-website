import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const target = path.join(repositoryRoot, 'api', 'src', 'onboarding-bootstrap.ts');
let source = await readFile(target, 'utf8');

const claimsNeedle = `type AuthTokenClaims = JwtPayload & {\n  organizationId?: unknown;\n  role?: unknown;\n};`;
const claimsReplacement = `type AuthTokenClaims = JwtPayload & {\n  organizationId?: unknown;\n  role?: unknown;\n  tokenUse?: unknown;\n  scopes?: unknown;\n  legalEntityId?: unknown;\n  clientId?: unknown;\n  jti?: unknown;\n};`;
if (source.includes(claimsNeedle)) source = source.replace(claimsNeedle, claimsReplacement);

const loginMarker = `const loginSchema = z.object({`;
const helper = `const mobileTokenMeta = (req: express.Request) => {\n  const token = bearerToken(req.header('authorization'));\n  if (!token || !jwtSecret) return null;\n  try {\n    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });\n    if (typeof decoded === 'string') return null;\n    const claims = decoded as AuthTokenClaims;\n    if (claims.tokenUse !== 'mobile_oauth') return null;\n    if (typeof claims.jti !== 'string' || typeof claims.clientId !== 'string') return null;\n    const scopes = Array.isArray(claims.scopes)\n      ? claims.scopes.filter((value): value is string => typeof value === 'string')\n      : [];\n    return {\n      tokenUse: 'mobile_oauth' as const,\n      scopes,\n      legalEntityId: typeof claims.legalEntityId === 'string' ? claims.legalEntityId : undefined,\n      clientId: claims.clientId,\n      jti: claims.jti,\n    };\n  } catch {\n    return null;\n  }\n};\n\n`;
if (!source.includes('const mobileTokenMeta = (req: express.Request) => {')) {
  if (!source.includes(loginMarker)) throw new Error('Mobile OAuth login insertion marker was not found.');
  source = source.replace(loginMarker, `${helper}${loginMarker}`);
}

const currentMiddlewareNeedle = `const authenticate: express.RequestHandler = async (req, res, next) => {\n  const auth = internalAuth(req) ?? tokenAuth(req);\n  if (!auth) {\n    res.status(401).json({ error: 'Unauthorized' });\n    return;\n  }\n\n  try {\n    res.locals.auth = await getUserEntityContext(prisma, auth);\n    next();\n  } catch (error) {\n    next(error);\n  }\n};`;
const legacySyncMiddlewareNeedle = `  const auth = internalAuth(req) ?? tokenAuth(req);\n  if (!auth) {\n    res.status(401).json({ error: 'Authentication required' });\n    return;\n  }\n\n  res.locals.auth = {\n    ...auth,\n    ipAddress: req.ip || req.socket.remoteAddress || '0.0.0.0',\n    userAgent: req.get('user-agent')?.trim() || 'Sulandra Health API',\n  };\n  next();`;
const legacyAsyncMiddlewareNeedle = `  const auth = internalAuth(req) ?? await tokenAuth(req);\n  if (!auth) {\n    res.status(401).json({ error: 'Authentication required' });\n    return;\n  }\n\n  res.locals.auth = {\n    ...auth,\n    ipAddress: req.ip || req.socket.remoteAddress || '0.0.0.0',\n    userAgent: req.get('user-agent')?.trim() || 'Sulandra Health API',\n  };\n  next();`;
const currentMiddlewareReplacement = `const authenticate: express.RequestHandler = async (req, res, next) => {\n  const internal = internalAuth(req);\n  const auth = internal ?? tokenAuth(req);\n  if (!auth) {\n    res.status(401).json({ error: 'Unauthorized' });\n    return;\n  }\n\n  if (!internal) {\n    const mobile = mobileTokenMeta(req);\n    if (mobile) {\n      if (!req.path.startsWith('/api/mobile/')) {\n        res.status(403).json({ error: 'This mobile token is restricted to the Sulandra field API' });\n        return;\n      }\n      res.locals.mobileTokenUse = mobile.tokenUse;\n      res.locals.mobileScopes = mobile.scopes;\n      res.locals.mobileLegalEntityId = mobile.legalEntityId;\n      res.locals.mobileClientId = mobile.clientId;\n      res.locals.mobileJti = mobile.jti;\n    }\n  }\n\n  try {\n    res.locals.auth = await getUserEntityContext(prisma, auth);\n    next();\n  } catch (error) {\n    next(error);\n  }\n};`;
const legacyMiddlewareReplacement = `  const internal = internalAuth(req);\n  const auth = internal ?? await tokenAuth(req);\n  if (!auth) {\n    res.status(401).json({ error: 'Authentication required' });\n    return;\n  }\n\n  if (!internal) {\n    const mobile = mobileTokenMeta(req);\n    if (mobile) {\n      if (!req.path.startsWith('/api/mobile/')) {\n        res.status(403).json({ error: 'This mobile token is restricted to the Sulandra field API' });\n        return;\n      }\n      res.locals.mobileTokenUse = mobile.tokenUse;\n      res.locals.mobileScopes = mobile.scopes;\n      res.locals.mobileLegalEntityId = mobile.legalEntityId;\n      res.locals.mobileClientId = mobile.clientId;\n      res.locals.mobileJti = mobile.jti;\n    }\n  }\n\n  res.locals.auth = {\n    ...auth,\n    ipAddress: req.ip || req.socket.remoteAddress || '0.0.0.0',\n    userAgent: req.get('user-agent')?.trim() || 'Sulandra Health API',\n  };\n  next();`;

if (!source.includes('res.locals.mobileTokenUse = mobile.tokenUse;')) {
  if (source.includes(currentMiddlewareNeedle)) {
    source = source.replace(currentMiddlewareNeedle, currentMiddlewareReplacement);
  } else if (source.includes(legacyAsyncMiddlewareNeedle)) {
    source = source.replace(legacyAsyncMiddlewareNeedle, legacyMiddlewareReplacement);
  } else if (source.includes(legacySyncMiddlewareNeedle)) {
    source = source.replace(legacySyncMiddlewareNeedle, legacyMiddlewareReplacement);
  } else {
    throw new Error('Mobile OAuth authentication middleware marker was not found.');
  }
}

if (!source.includes('res.locals.mobileTokenUse = mobile.tokenUse;')) {
  throw new Error('Mobile OAuth boundary was not installed.');
}
await writeFile(target, source, 'utf8');
console.log('Scoped native OAuth boundary installed: mobile tokens are confined to /api/mobile, retain per-token scopes, and preserve the canonical authenticated entity context.');
