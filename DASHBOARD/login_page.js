/*  login_page.js  --  Political Pulse ka login page (3D flip)
 *  Left  : Sign In        -> POST /login   (server.js pehle se handle karta hai)
 *  Right : Request Access -> POST /request-access  (MongoDB me save)
 *  Sign Up jaan-boojh kar nahi hai -- account admin banata hai.
 */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

function loginPage(err, msg, openRequest) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
+ '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
+ '<title>Political Pulse - Sign in</title>'
+ '<link rel="preconnect" href="https://fonts.googleapis.com">'
+ '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">'
+ '<style>'
+ ':root{--indigo-1:#F97316;--indigo-2:#EA580C;--indigo-3:#C0430D;--page-bg:#FBDFC6;--ink:#3A2418;--ink-dim:#9A7A63;--field-bg:#FDF3EA;}'
+ '*{margin:0;padding:0;box-sizing:border-box;font-family:Montserrat,sans-serif;}'
+ 'html,body{height:100%;}'
+ 'body{min-height:100vh;display:flex;align-items:center;justify-content:center;'
+ 'background:radial-gradient(900px 600px at 10% 15%,#FFF0E0 0,transparent 60%),'
+ 'radial-gradient(900px 600px at 90% 85%,#F6C89A 0,transparent 60%),var(--page-bg);'
+ 'overflow:auto;padding:24px 12px;perspective:2200px;}'
+ '.orb{position:absolute;border-radius:50%;filter:blur(1px);opacity:.45;animation:drift 14s ease-in-out infinite;pointer-events:none;}'
+ '.orb1{width:260px;height:260px;left:6%;top:10%;background:radial-gradient(circle at 35% 30%,#FB923C,transparent 70%);}'
+ '.orb2{width:200px;height:200px;right:8%;bottom:12%;background:radial-gradient(circle at 35% 30%,#EA580C,transparent 70%);animation-delay:-6s;}'
+ '@keyframes drift{0%,100%{transform:translate3d(0,0,0);}50%{transform:translate3d(16px,-18px,0);}}'
+ '.container{position:relative;width:880px;max-width:94vw;min-height:500px;background:#fff;border-radius:26px;'
+ 'box-shadow:0 40px 80px -20px rgba(150,70,15,.42),0 10px 30px -10px rgba(150,70,15,.28);'
+ 'overflow:hidden;transform-style:preserve-3d;transition:transform .25s ease-out;}'
+ '.form-box{position:absolute;top:0;left:0;height:100%;width:50%;display:flex;align-items:center;'
+ 'justify-content:center;padding:30px 38px;'
+ 'transition:transform .6s ease-in-out,opacity .35s ease-in-out,visibility 0s linear .6s;}'
+ '.signin-box{opacity:1;visibility:visible;z-index:2;}'
+ '.container.active .signin-box{transform:translateX(100%);opacity:0;visibility:hidden;pointer-events:none;}'
+ '.signup-box{opacity:0;visibility:hidden;z-index:1;pointer-events:none;}'
+ '.container.active .signup-box{transform:translateX(100%);opacity:1;visibility:visible;pointer-events:auto;}'
+ 'form{width:100%;display:flex;flex-direction:column;}'
+ '.brand{display:flex;align-items:center;gap:9px;margin-bottom:12px;}'
+ '.brand .dot{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--indigo-1),var(--indigo-3));'
+ 'display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;flex:0 0 auto;}'
+ '.brand .bt{font-size:12px;letter-spacing:1.6px;color:var(--ink-dim);font-weight:600;line-height:1.3;}'
+ '.brand .bs{font-size:9.5px;letter-spacing:1.4px;color:#C09B80;font-weight:500;}'
+ '.lab{font-size:10.5px;font-weight:600;color:#8C6B54;letter-spacing:.6px;margin:0 0 4px 2px;text-transform:uppercase;}'
+ '.foot{margin-top:16px;padding-top:11px;border-top:1px solid #F3E3D5;font-size:10.5px;color:#B49480;line-height:1.55;}'
+ 'h1{color:var(--ink);font-size:24px;font-weight:700;letter-spacing:-.3px;}'
+ '.small-text{font-size:12.5px;color:var(--ink-dim);margin:6px 0 16px;line-height:1.55;}'
+ '.field{position:relative;margin-bottom:11px;}'
+ '.field input,.field select{width:100%;background:var(--field-bg);border:1px solid #F0DCC9;border-radius:10px;'
+ 'padding:11px 14px;font-size:13px;color:var(--ink);outline:none;transition:.18s;}'
+ '.field input:focus,.field select:focus{border-color:var(--indigo-1);background:#fff;box-shadow:0 0 0 3px rgba(249,115,22,.18);}'
+ '.field input::placeholder{color:#C4A78F;}'
+ '.field-error{display:none;font-size:11px;color:#d1435b;margin:4px 0 0 3px;}'
+ '.field.has-error input,.field.has-error select{border-color:#d1435b;background:#fff5f6;}'
+ '.field.has-error .field-error{display:block;}'
+ '.forgot{font-size:12px;color:var(--ink-dim);text-decoration:none;margin:4px 0 16px;}'
+ '.btn{background:var(--indigo-2);color:#fff;border:none;border-radius:10px;padding:12px 40px;'
+ 'font-size:12.5px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;cursor:pointer;transition:.2s;'
+ 'box-shadow:0 6px 16px -6px rgba(234,88,12,.55);}'
+ '.btn:hover{background:var(--indigo-3);}'
+ '.btn.ghost{background:transparent;border:1.5px solid rgba(255,255,255,.85);}'
+ '.btn.ghost:hover{background:rgba(255,255,255,.14);}'
+ '.err,.ok{font-size:12.5px;border-radius:8px;padding:9px 12px;margin-bottom:12px;line-height:1.5;}'
+ '.err{background:#fdecee;color:#b3243c;border:1px solid #f6c9d1;}'
+ '.ok{background:#e9f7ef;color:#17663f;border:1px solid #bfe6d0;}'
+ '.toggle-box{position:absolute;top:0;left:50%;width:50%;height:100%;overflow:hidden;'
+ 'transition:all .6s ease-in-out;border-radius:150px 0 0 150px;z-index:1000;}'
+ '.container.active .toggle-box{transform:translateX(-100%);border-radius:0 150px 150px 0;}'
+ '.toggle{position:relative;left:-100%;width:200%;height:100%;color:#fff;'
+ 'background:linear-gradient(120deg,var(--indigo-1) 0%,var(--indigo-2) 55%,var(--indigo-3) 100%);'
+ 'transition:all .6s ease-in-out;}'
+ '.container.active .toggle{transform:translateX(50%);}'
+ '.toggle::before{content:"";position:absolute;inset:0;pointer-events:none;'
+ 'background:radial-gradient(circle at 30% 20%,rgba(255,255,255,.18),transparent 55%);}'
+ '.toggle-panel{position:absolute;top:0;width:50%;height:100%;display:flex;flex-direction:column;'
+ 'align-items:center;justify-content:center;text-align:center;padding:0 34px;transition:all .6s ease-in-out;}'
+ '.toggle-left{left:0;transform:translateX(-200%);}'
+ '.container.active .toggle-left{transform:translateX(0);}'
+ '.toggle-right{right:0;transform:translateX(0);}'
+ '.container.active .toggle-right{transform:translateX(200%);}'
+ '.toggle-panel .tb{font-size:11px;letter-spacing:2.5px;color:rgba(255,255,255,.72);font-weight:600;margin-bottom:8px;}'
+ '.toggle-panel h1{color:#fff;font-size:23px;line-height:1.25;}'
+ '.toggle-panel p{font-size:12.5px;line-height:1.6;color:rgba(255,255,255,.88);margin:9px 0 18px;}'
+ '@media (max-width:760px){.container{min-height:auto;border-radius:22px;}'
+ '.toggle-box{display:none;}'
+ '.form-box{position:relative;width:100%;padding:28px 24px;transform:none!important;'
+ 'opacity:1!important;visibility:visible!important;pointer-events:auto!important;}'
+ '.signup-box{border-top:1px solid #F3E3D5;}}'
+ '@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;}}'
+ '</style></head><body>'
+ '<div class="orb orb1"></div><div class="orb orb2"></div>'
+ '<div class="container' + (openRequest ? ' active' : '') + '" id="container">'

// ---------- SIGN IN ----------
+ '<div class="form-box signin-box"><form id="signinForm" method="post" action="/login" novalidate>'
+ '<div class="brand"><div class="dot">IP</div><div><div class="bt">INDIA POLITICAL PULSE</div>'
+ '<div class="bs">X HANDLE ANALYTICS</div></div></div>'
+ '<h1>Sign in</h1>'
+ '<div class="small-text">Use the credentials shared with you by your administrator.</div>'
+ (err ? '<div class="err">' + esc(err) + '</div>' : '')
+ (msg ? '<div class="ok">' + esc(msg) + '</div>' : '')
+ '<div class="lab">Email address</div>'
+ '<div class="field" id="siEmailField"><input type="email" name="email" id="siEmail" placeholder="name@company.com" autocomplete="username">'
+ '<div class="field-error">Enter a valid email address</div></div>'
+ '<div class="lab">Password</div>'
+ '<div class="field" id="siPassField"><input type="password" name="password" id="siPass" placeholder="Enter your password" autocomplete="current-password">'
+ '<div class="field-error">Enter your password</div></div>'
+ '<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-dim);margin:2px 0 14px;cursor:pointer">'
+ '<input type="checkbox" style="width:auto" onclick="document.getElementById(\'siPass\').type=this.checked?\'text\':\'password\'"> Show password</label>'
+ '<button type="submit" class="btn">Sign in</button>'
+ '<a class="forgot" href="/forgot" style="text-align:center;margin:12px 0 0;color:#9A7A63;font-size:12px;text-decoration:none">Forgot your password?</a>'
+ '<div class="foot">Authorised users only. All sign-ins are logged.<br>'
+ 'Data Team &middot; Jarvis Consulting</div>'
+ '</form></div>'

// ---------- REQUEST ACCESS ----------
+ '<div class="form-box signup-box"><form id="reqForm" method="post" action="/request-access" novalidate>'
+ '<div class="brand"><div class="dot">IP</div><div><div class="bt">INDIA POLITICAL PULSE</div>'
+ '<div class="bs">X HANDLE ANALYTICS</div></div></div>'
+ '<h1>Request access</h1>'
+ '<div class="small-text">Accounts are created by the administrator. Submit your details and your login will be emailed to you once approved.</div>'
+ '<div class="field" id="rqNameField"><input type="text" name="name" id="rqName" placeholder="Full name">'
+ '<div class="field-error">Enter your name</div></div>'
+ '<div class="field" id="rqEmailField"><input type="email" name="email" id="rqEmail" placeholder="Work email">'
+ '<div class="field-error">Enter a valid email address</div></div>'
+ '<div class="field" id="rqOrgField"><input type="text" name="org" id="rqOrg" placeholder="Organisation or team">'
+ '<div class="field-error">Enter your organisation</div></div>'
+ '<div class="field"><select name="want" id="rqWant">'
+ '<option value="All India">Which dashboard? — All India</option>'
+ '<option value="Uttar Pradesh">Uttar Pradesh</option>'
+ '<option value="Both">Both (All India + Uttar Pradesh)</option>'
+ '</select></div>'
+ '<div class="field"><input type="text" name="reason" placeholder="Purpose of access (optional)"></div>'
+ '<button type="submit" class="btn">Send request</button></form></div>'

// ---------- TOGGLE ----------
+ '<div class="toggle-box"><div class="toggle">'
+ '<div class="toggle-panel toggle-left"><div class="tb">INDIA POLITICAL PULSE</div>'
+ '<h1>Already have an account?</h1>'
+ '<p>Sign in with the email address and password issued to you by the administrator.</p>'
+ '<button type="button" class="btn ghost" id="loginBtn">Sign in</button></div>'
+ '<div class="toggle-panel toggle-right"><div class="tb">INDIA POLITICAL PULSE</div>'
+ '<h1>Need access?</h1>'
+ '<p>Self sign-up is not available on this platform. Submit a request and the administrator will issue your login.</p>'
+ '<button type="button" class="btn ghost" id="registerBtn">Request access</button></div>'
+ '</div></div></div>'

+ '<script>'
+ 'var container=document.getElementById("container");'
+ 'document.getElementById("registerBtn").addEventListener("click",function(){container.classList.add("active");});'
+ 'document.getElementById("loginBtn").addEventListener("click",function(){container.classList.remove("active");});'
+ 'document.addEventListener("mousemove",function(e){'
+ 'var x=(e.clientX/window.innerWidth)-0.5,y=(e.clientY/window.innerHeight)-0.5;'
+ 'container.style.transform="rotateY("+(x*5)+"deg) rotateX("+(-y*5)+"deg)";});'
+ 'document.addEventListener("mouseleave",function(){container.style.transform="rotateY(0deg) rotateX(0deg)";});'
+ 'function chk(i,f,fn){var a=document.getElementById(i),b=document.getElementById(f);'
+ 'var ok=fn(a.value.trim());b.classList.toggle("has-error",!ok);'
+ 'a.oninput=function(){b.classList.remove("has-error");};return ok;}'
+ 'document.getElementById("signinForm").addEventListener("submit",function(e){'
+ 'var a=chk("siEmail","siEmailField",function(v){return /\\S+@\\S+\\.\\S+/.test(v);});'
+ 'var b=chk("siPass","siPassField",function(v){return v.length>0;});'
+ 'if(!(a&&b))e.preventDefault();});'
+ 'document.getElementById("reqForm").addEventListener("submit",function(e){'
+ 'var a=chk("rqName","rqNameField",function(v){return v.length>1;});'
+ 'var b=chk("rqEmail","rqEmailField",function(v){return /\\S+@\\S+\\.\\S+/.test(v);});'
+ 'var c=chk("rqOrg","rqOrgField",function(v){return v.length>1;});'
+ 'if(!(a&&b&&c))e.preventDefault();});'
+ '</script></body></html>';
}


/* ---------- chhota single-card page (change password / forgot) ---------- */
function simplePage(title, heading, sub, bodyHtml, err, ok) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
+ '<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' + esc(title) + ' - Political Pulse</title>'
+ '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">'
+ '<style>'
+ '*{margin:0;padding:0;box-sizing:border-box;font-family:Montserrat,sans-serif}'
+ 'body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 12px;color:#3A2418;'
+ 'background:radial-gradient(900px 600px at 10% 15%,#FFF0E0 0,transparent 60%),'
+ 'radial-gradient(900px 600px at 90% 85%,#F6C89A 0,transparent 60%),#FBDFC6}'
+ '.card{width:430px;max-width:94vw;background:#fff;border-radius:20px;padding:34px 34px 30px;'
+ 'box-shadow:0 30px 60px -18px rgba(150,70,15,.4)}'
+ '.brand{display:flex;align-items:center;gap:9px;margin-bottom:16px}'
+ '.dot{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#F97316,#C0430D);color:#fff;'
+ 'display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}'
+ '.bt{font-size:11.5px;letter-spacing:1.6px;color:#9A7A63;font-weight:600}'
+ '.bs{font-size:9.5px;letter-spacing:1.4px;color:#C09B80}'
+ 'h1{font-size:22px;font-weight:700;letter-spacing:-.3px}'
+ '.sub{font-size:12.5px;color:#9A7A63;margin:6px 0 18px;line-height:1.55}'
+ '.lab{font-size:10.5px;font-weight:600;color:#8C6B54;letter-spacing:.6px;margin:0 0 4px 2px;text-transform:uppercase}'
+ 'input{width:100%;background:#FDF3EA;border:1px solid #F0DCC9;border-radius:10px;padding:11px 14px;'
+ 'font-size:13px;color:#3A2418;outline:none;margin-bottom:12px}'
+ 'input:focus{border-color:#F97316;background:#fff;box-shadow:0 0 0 3px rgba(249,115,22,.18)}'
+ 'input::placeholder{color:#C4A78F}'
+ '.btn{width:100%;background:#EA580C;color:#fff;border:none;border-radius:10px;padding:12px;font-size:12.5px;'
+ 'font-weight:600;letter-spacing:.8px;text-transform:uppercase;cursor:pointer;box-shadow:0 6px 16px -6px rgba(234,88,12,.55)}'
+ '.btn:hover{background:#C0430D}'
+ '.err,.ok{font-size:12.5px;border-radius:8px;padding:9px 12px;margin-bottom:12px;line-height:1.5}'
+ '.err{background:#fdecee;color:#b3243c;border:1px solid #f6c9d1}'
+ '.ok{background:#e9f7ef;color:#17663f;border:1px solid #bfe6d0}'
+ '.lnk{display:block;text-align:center;margin-top:16px;font-size:12px;color:#9A7A63;text-decoration:none}'
+ '.lnk b{color:#C0430D}'
+ '</style></head><body><div class="card">'
+ '<div class="brand"><div class="dot">IP</div><div><div class="bt">INDIA POLITICAL PULSE</div>'
+ '<div class="bs">X HANDLE ANALYTICS</div></div></div>'
+ '<h1>' + esc(heading) + '</h1><div class="sub">' + sub + '</div>'
+ (err ? '<div class="err">' + esc(err) + '</div>' : '')
+ (ok ? '<div class="ok">' + esc(ok) + '</div>' : '')
+ bodyHtml + '</div></body></html>';
}

function setPasswordPage(email, isReset, err) {
  return simplePage(isReset ? 'Reset password' : 'Set your password',
    isReset ? 'Reset your password' : 'Set your password',
    (isReset ? 'Choose a new password for your account.' : 'Welcome. Choose a password to activate your account.')
      + '<br><b style="color:#8C6B54">' + esc(email) + '</b>',
    '<form method="post" action="/set-password">'
    + '<input type="hidden" name="t" value="' + esc(arguments[3] || '') + '">'
    + '<div class="lab">New password</div>'
    + '<input type="password" name="pw1" id="pw1" placeholder="At least 8 characters" required autofocus>'
    + '<div class="lab">Confirm password</div>'
    + '<input type="password" name="pw2" id="pw2" placeholder="Type it again" required>'
    + '<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#9A7A63;margin:0 0 16px;cursor:pointer">'
    + '<input type="checkbox" style="width:auto;margin:0" onclick="var t=this.checked?\'text\':\'password\';'
    + 'document.getElementById(\'pw1\').type=t;document.getElementById(\'pw2\').type=t;"> Show password</label>'
    + '<button class="btn">' + (isReset ? 'Reset password' : 'Activate account') + '</button></form>', err, '');
}

function linkDeadPage(msg) {
  return simplePage('Link expired', 'This link is no longer valid',
    esc(msg || 'The link has expired or has already been used.'),
    '<a class="btn" href="/forgot" style="display:block;text-align:center;text-decoration:none;line-height:1.6">'
    + 'Request a new link</a>'
    + '<a class="lnk" href="/login">&larr; Back to <b>sign in</b></a>', '', '');
}

function forgotPage(err, ok) {
  return simplePage('Forgot password', 'Forgot your password?',
    'Enter your registered email address. We will email you a link to reset your password.',
    '<form method="post" action="/forgot">'
    + '<div class="lab">Registered email</div>'
    + '<input type="email" name="email" placeholder="name@company.com" required>'
    + '<button class="btn">Send reset link</button></form>'
    + '<a class="lnk" href="/login">&larr; Back to <b>sign in</b></a>', err, ok);
}

module.exports = { loginPage: loginPage, esc: esc,
  simplePage: simplePage, setPasswordPage: setPasswordPage, linkDeadPage: linkDeadPage, forgotPage: forgotPage };
