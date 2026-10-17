/*  mailer.js  --  chhota SMTP client (koi npm package nahi chahiye)
 *  Gmail ke liye: smtp.gmail.com port 465 (implicit TLS).
 *  Config: DASHBOARD\mail_config.json
 *  {
 *    "host": "smtp.gmail.com", "port": 465, "secure": true,
 *    "user": "politicalpulse03@gmail.com",
 *    "pass": "<16-digit APP PASSWORD>",
 *    "from": "India Political Pulse <politicalpulse03@gmail.com>"
 *  }
 */
const tls = require('tls');
const fs = require('fs');
const path = require('path');

function config() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'mail_config.json'), 'utf8')); }
  catch (e) { return null; }
}

function b64(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }

// UTF-8 subject (Hindi/naam ke liye)
function encHeader(s) {
  return /^[\x20-\x7E]*$/.test(s) ? s : '=?UTF-8?B?' + b64(s) + '?=';
}

function talk(sock, steps, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var buf = '', i = -1, done = false;
    var t = setTimeout(function () { fail(new Error('SMTP timeout')); }, timeoutMs || 20000);
    function fail(e) { if (done) return; done = true; clearTimeout(t); try { sock.destroy(); } catch (x) {} reject(e); }
    function ok() { if (done) return; done = true; clearTimeout(t); resolve(); }
    sock.on('error', fail);
    sock.setEncoding('utf8');
    sock.on('data', function (chunk) {
      buf += chunk;
      // poora reply aaya? (aakhri line "250 " jaisi ho, "250-" nahi)
      var lines = buf.split(/\r?\n/).filter(Boolean);
      var last = lines[lines.length - 1] || '';
      if (!/^\d{3} /.test(last)) return;
      var code = parseInt(last.slice(0, 3), 10);
      var prev = i >= 0 ? steps[i] : { expect: [220] };
      if ((prev.expect || [250]).indexOf(code) < 0)
        return fail(new Error('SMTP ' + code + ': ' + lines.join(' | ').slice(0, 300)));
      buf = '';
      i++;
      if (i >= steps.length) return ok();
      var cmd = steps[i].cmd;
      if (typeof cmd === 'function') cmd = cmd(lines.join('\n'));
      sock.write(cmd + '\r\n');
    });
  });
}

async function sendMail(to, subject, html, text) {
  var c = config();
  if (!c || !c.user || !c.pass) throw new Error('mail_config.json nahi mila ya adhura hai');
  var from = c.from || c.user;
  var boundary = 'pp' + Date.now();
  var dom = String(c.user).split('@')[1] || 'localhost';
  var msgId = '<' + Date.now() + '.' + Math.random().toString(36).slice(2, 10) + '@' + dom + '>';
  var body = [
    'From: ' + from,
    'To: ' + to,
    'Reply-To: ' + c.user,
    'Subject: ' + encHeader(subject),
    'Message-ID: ' + msgId,
    'MIME-Version: 1.0',
    'Date: ' + new Date().toUTCString(),
    'Auto-Submitted: auto-generated',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    '',
    '--' + boundary,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text || html.replace(/<[^>]+>/g, ' ')).replace(/(.{76})/g, '$1\r\n'),
    '--' + boundary,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(html).replace(/(.{76})/g, '$1\r\n'),
    '--' + boundary + '--',
    ''
  ].join('\r\n');

  var port = c.port || 465, host = c.host || 'smtp.gmail.com';
  var sock = tls.connect({ host: host, port: port, servername: host });

  var steps = [
    { cmd: 'EHLO pulse', expect: [250] },
    { cmd: 'AUTH LOGIN', expect: [334] },
    { cmd: b64(c.user), expect: [334] },
    { cmd: b64(c.pass), expect: [235] },
    { cmd: 'MAIL FROM:<' + c.user + '>', expect: [250] },
    { cmd: 'RCPT TO:<' + to + '>', expect: [250, 251] },
    { cmd: 'DATA', expect: [354] },
    { cmd: body + '\r\n.', expect: [250] },
    { cmd: 'QUIT', expect: [221] }
  ];
  await talk(sock, steps, 25000);
  return true;
}

function welcomeHtml(name, email, pw, roleLabel, url) {
  var link = url || '';
  return '<div style="background:#f4f6fa;padding:26px 12px;font-family:Segoe UI,Helvetica,Arial,sans-serif">'
    + '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e8f0;border-radius:10px;overflow:hidden">'
    + '<div style="background:#12305c;padding:20px 26px">'
    + '<div style="font-size:11px;letter-spacing:2.5px;color:#a9bcd8">INDIA POLITICAL PULSE</div>'
    + '<div style="font-size:18px;color:#ffffff;font-weight:600;margin-top:4px">Your account has been approved</div></div>'
    + '<div style="padding:26px">'
    + '<p style="margin:0 0 14px;font-size:15px;color:#16324f">Dear ' + name + ',</p>'
    + '<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#3d4a5c">'
    + 'Thank you for your interest in the India Political Pulse analytics platform. '
    + 'Your access request has been reviewed and approved. Your account details are below.</p>'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:22px;border:1px solid #e3e8f0">'
    + '<tr><td style="padding:11px 14px;background:#f7f9fc;width:130px;color:#54627a;font-weight:600;border-bottom:1px solid #e3e8f0">Login ID</td>'
    + '<td style="padding:11px 14px;color:#16324f;font-family:Consolas,monospace;border-bottom:1px solid #e3e8f0">' + email + '</td></tr>'
    + '<tr><td style="padding:11px 14px;background:#f7f9fc;color:#54627a;font-weight:600;border-bottom:1px solid #e3e8f0">Temporary key</td>'
    + '<td style="padding:11px 14px;font-family:Consolas,monospace;font-size:16px;color:#12305c;font-weight:700;border-bottom:1px solid #e3e8f0">' + pw + '</td></tr>'
    + '<tr><td style="padding:11px 14px;background:#f7f9fc;color:#54627a;font-weight:600">Access level</td>'
    + '<td style="padding:11px 14px;color:#16324f">' + (roleLabel || 'Standard') + '</td></tr></table>'
    + (link ? '<p style="margin:0 0 22px"><a href="' + link + '" style="background:#12305c;color:#ffffff;'
        + 'text-decoration:none;padding:12px 28px;border-radius:6px;display:inline-block;font-size:14px;font-weight:600">'
        + 'Open the dashboard</a></p>'
        + '<p style="margin:0 0 20px;font-size:12.5px;color:#7a8798">If the button does not work, copy this address into your browser:<br>'
        + '<span style="color:#12305c">' + link + '</span></p>' : '')
    + '<p style="margin:0 0 6px;font-size:13px;line-height:1.65;color:#3d4a5c">'
    + 'Please keep these details confidential and do not share them with anyone. '
    + 'If you did not request this access, kindly reply to this email so we can remove the account.</p>'
    + '<p style="margin:18px 0 0;font-size:14px;color:#16324f">Regards,<br>'
    + '<b>Data Team</b><br>'
    + '<span style="font-size:12.5px;color:#7a8798">Jarvis Consulting</span></p>'
    + '</div></div>'
    + '<div style="max-width:560px;margin:14px auto 0;text-align:center;font-size:11px;color:#8a94a6;line-height:1.6">'
    + 'This is an automated message from the India Political Pulse platform.<br>'
    + 'Sent because an access request was submitted with this email address.</div></div>';
}

function welcomeText(name, email, pw, roleLabel, url) {
  return 'Dear ' + name + ',\r\n\r\n'
    + 'Thank you for your interest in the India Political Pulse analytics platform.\r\n'
    + 'Your access request has been reviewed and approved.\r\n\r\n'
    + 'Login ID     : ' + email + '\r\n'
    + 'Temporary key: ' + pw + '\r\n'
    + 'Access level : ' + (roleLabel || 'Standard') + '\r\n\r\n'
    + (url ? 'Sign in here: ' + url + '\r\n\r\n' : '')
    + 'Please keep these details confidential. If you did not request this access,\r\n'
    + 'kindly reply to this email so we can remove the account.\r\n\r\n'
    + 'Regards,\r\nData Team\r\nJarvis Consulting\r\n';
}

function requestHtml(d, panelUrl) {
  var row = function (k, v) {
    return '<tr><td style="padding:10px 14px;background:#f7f9fc;width:140px;color:#54627a;font-weight:600;'
      + 'border-bottom:1px solid #e3e8f0">' + k + '</td>'
      + '<td style="padding:10px 14px;color:#16324f;border-bottom:1px solid #e3e8f0">' + (v || '&mdash;') + '</td></tr>';
  };
  return '<div style="background:#f4f6fa;padding:26px 12px;font-family:Segoe UI,Helvetica,Arial,sans-serif">'
    + '<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3e8f0;border-radius:10px;overflow:hidden">'
    + '<div style="background:#C0430D;padding:20px 26px">'
    + '<div style="font-size:11px;letter-spacing:2.5px;color:#ffd9bf">INDIA POLITICAL PULSE</div>'
    + '<div style="font-size:18px;color:#fff;font-weight:600;margin-top:4px">New access request</div></div>'
    + '<div style="padding:26px">'
    + '<p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#3d4a5c">'
    + 'A new access request has been submitted on the platform. Details below.</p>'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:22px;border:1px solid #e3e8f0">'
    + row('Name', d.name) + row('Email', d.email) + row('Organisation', d.org)
    + row('Requested', d.want) + row('Purpose', d.reason)
    + row('Received', new Date().toLocaleString('en-IN')) + '</table>'
    + (panelUrl ? '<p style="margin:0 0 18px"><a href="' + panelUrl + '" style="background:#C0430D;color:#fff;'
        + 'text-decoration:none;padding:12px 26px;border-radius:6px;display:inline-block;font-size:14px;font-weight:600">'
        + 'Review in admin panel</a></p>' : '')
    + '<p style="margin:0;font-size:12.5px;color:#7a8798;line-height:1.6">'
    + 'Approve the request from the panel to create the account and email the login details automatically.</p>'
    + '</div></div></div>';
}

function requestText(d) {
  return 'New access request on India Political Pulse\r\n\r\n'
    + 'Name        : ' + (d.name || '-') + '\r\n'
    + 'Email       : ' + (d.email || '-') + '\r\n'
    + 'Organisation: ' + (d.org || '-') + '\r\n'
    + 'Requested   : ' + (d.want || '-') + '\r\n'
    + 'Purpose     : ' + (d.reason || '-') + '\r\n'
    + 'Received    : ' + new Date().toLocaleString('en-IN') + '\r\n\r\n'
    + 'Approve it from the backend admin panel.\r\n';
}

function inviteHtml(name, email, link, roleLabel, isReset) {
  var head = isReset ? 'Password reset request' : 'Your account is ready';
  var line = isReset
    ? 'We received a request to reset the password for your India Political Pulse account. '
      + 'Use the button below to choose a new one.'
    : 'Thank you for your interest in the India Political Pulse analytics platform. '
      + 'Your access request has been approved. Use the button below to activate your account.';
  return '<div style="background:#f7f5f2;padding:26px 12px;font-family:Segoe UI,Helvetica,Arial,sans-serif">'
    + '<div style="max-width:540px;margin:0 auto;background:#fff;border:1px solid #efe3d8;border-radius:10px;overflow:hidden">'
    + '<div style="background:#C0430D;padding:20px 26px">'
    + '<div style="font-size:11px;letter-spacing:2.5px;color:#ffd9bf">INDIA POLITICAL PULSE</div>'
    + '<div style="font-size:18px;color:#fff;font-weight:600;margin-top:4px">' + head + '</div></div>'
    + '<div style="padding:26px">'
    + '<p style="margin:0 0 14px;font-size:15px;color:#3a2418">Dear ' + name + ',</p>'
    + '<p style="margin:0 0 22px;font-size:14px;line-height:1.65;color:#5c4a3c">' + line + '</p>'
    + '<p style="margin:0 0 20px"><a href="' + link + '" style="background:#C0430D;color:#fff;text-decoration:none;'
    + 'padding:13px 30px;border-radius:6px;display:inline-block;font-size:14px;font-weight:600">'
    + (isReset ? 'Choose a new password' : 'Activate my account') + '</a></p>'
    + '<p style="margin:0 0 20px;font-size:12.5px;color:#8a7565;line-height:1.6">'
    + 'If the button does not work, copy this address into your browser:<br>'
    + '<span style="color:#C0430D;word-break:break-all">' + link + '</span></p>'
    + '<table style="width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:20px;border:1px solid #efe3d8">'
    + '<tr><td style="padding:10px 14px;background:#fdf8f3;width:130px;color:#8a7565;font-weight:600">Your login ID</td>'
    + '<td style="padding:10px 14px;color:#3a2418">' + email + '</td></tr></table>'
    + '<p style="margin:0;font-size:12.5px;color:#8a7565;line-height:1.6">'
    + 'This link works once and expires in 7 days. If you did not expect this message, '
    + 'you can ignore it or reply to let us know.</p>'
    + '<p style="margin:20px 0 0;font-size:14px;color:#3a2418">Regards,<br>'
    + '<b>Data Team</b><br>'
    + '<span style="font-size:12.5px;color:#8a7565">Jarvis Consulting</span></p>'
    + '</div></div></div>';
}

function inviteText(name, email, link, roleLabel, isReset) {
  return 'Dear ' + name + ',\r\n\r\n'
    + (isReset
        ? 'We received a request to reset the password for your India Political Pulse account.\r\n'
        : 'Your access request for the India Political Pulse platform has been approved.\r\n')
    + '\r\nOpen this link to ' + (isReset ? 'choose a new password' : 'activate your account') + ':\r\n'
    + link + '\r\n\r\n'
    + 'Your login ID : ' + email + '\r\n\r\n'
    + 'The link works once and expires in 7 days.\r\n\r\n'
    + 'Regards,\r\nData Team\r\nJarvis Consulting\r\n';
}

module.exports = { sendMail: sendMail, inviteHtml: inviteHtml, inviteText: inviteText, requestHtml: requestHtml, requestText: requestText, config: config, welcomeHtml: welcomeHtml, welcomeText: welcomeText };
