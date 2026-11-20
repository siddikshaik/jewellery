// Set a new password for any user, from the computer that runs the server.
//   node scripts/reset-password.js <username> <new password>        (DATA_DIR env var picks another data folder)
const path = require('path');
const { createDb } = require('../server/db'), { hashPassword } = require('../server/auth');
const [username, pw] = process.argv.slice(2);
if (!username || !pw || pw.length < 8) { console.error('Usage: node scripts/reset-password.js <username> <new password of 8+ characters>'); process.exit(1); }
const db = createDb(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const users = db.users(), u = users.find(x => x.username === username.toLowerCase());
if (!u) { console.error('No user named ' + username); process.exit(1); }
u.passwordHash = hashPassword(pw); u.active = true; db.saveUsers(users);
console.log('Password changed for ' + u.username + '. They can sign in now.');
