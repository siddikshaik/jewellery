// Passwords (scrypt), signed session cookies (HMAC) and login throttling. Node built-ins only.
const crypto = require('crypto'), fs = require('fs'), path = require('path');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
const DUMMY = hashPassword('not-a-real-password');
function verifyPassword(pw, stored) {
  const [t, salt, h] = String(stored || DUMMY).split('$');
  if (t !== 'scrypt' || !salt || !h) return false;
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(String(pw), salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b) && !!stored;
}

function createAuth(dataDir) {
  const keyFile = path.join(dataDir, 'platform', 'secret.key');
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  const secret = fs.readFileSync(keyFile, 'utf8').trim();
  const TTL = 12 * 3600 * 1000, NAME = 'jb';
  const mac = s => crypto.createHmac('sha256', secret).update(s).digest('base64url');

  function issue(uid) {
    const p = Buffer.from(JSON.stringify({ u: uid, exp: Date.now() + TTL })).toString('base64url');
    return p + '.' + mac(p);
  }
  function readToken(req) {
    const m = String(req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(NAME + '='));
    if (!m) return null;
    const [p, sig] = m.slice(NAME.length + 1).split('.');
    if (!p || !sig) return null;
    const want = Buffer.from(mac(p)), got = Buffer.from(sig);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
    try { const t = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); return t.exp > Date.now() ? t : null; } catch (e) { return null; }
  }
  const cookie = (token, req) => `${NAME}=${token || ''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? TTL / 1000 : 0}` +
    (req && (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '');

  /* 5 wrong passwords in 10 minutes locks that user+address for 5 minutes */
  const fails = new Map();
  const throttle = {
    blocked(key) { const f = fails.get(key); return !!f && f.until > Date.now(); },
    fail(key) {
      const now = Date.now(), f = fails.get(key);
      if (!f || now - f.first > 600000) return fails.set(key, { n: 1, first: now, until: 0 });
      f.n++; if (f.n >= 5) f.until = now + 300000;
    },
    ok(key) { fails.delete(key); }
  };
  return { issue, readToken, cookie, throttle };
}
module.exports = { hashPassword, verifyPassword, createAuth };
