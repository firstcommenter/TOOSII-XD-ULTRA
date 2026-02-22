//═════════════════════════════════//

/*
🔗 TOOSII-XD ULTRA Bot System
by Toosii Tech • 2024 - 2026

>> Contact Links:
・WhatsApp : wa.me/254748340864
・Telegram : t.me/toosiitech
*/

//═════════════════════════════════//
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Module
require("./setting")
const { default: makeWASocket, DisconnectReason, jidDecode, proto, getContentType, useMultiFileAuthState, downloadContentFromMessage } = require("gifted-baileys")
const { makeInMemoryStore } = require('./library/lib/store')
const pino = require('pino')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const http = require('http')
const readline = require("readline");
const _ = require('lodash')
const yargs = require('yargs/yargs')
const PhoneNumber = require('awesome-phonenumber')
const FileType = require('file-type')
const path = require('path')
const fetch = require("node-fetch") 
const { getBuffer } = require('./library/lib/myfunc')
const { imageToWebp, imageToWebp3, videoToWebp, writeExifImg, writeExifImgAV, writeExifVid } = require('./library/lib/exif')

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception (handled):', err.message || err)
})
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection (handled):', err.message || err)
})

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Anti-Tampering Protection
const _ov = '254748340864'
const _bn = 'TOOSII-XD ULTRA'
const _ba = 'Toosii Tech'
function _integrityCheck() {
    const ownerValid = global.owner && global.owner.includes(_ov)
    const nameValid = global.botname && global.botname.includes('TOOSII')
    const authorValid = global.ownername === _ba
    if (!ownerValid || !nameValid || !authorValid) {
        console.log('\n╔══════════════════════════════════════════╗')
        console.log('║  ⚠️  INTEGRITY CHECK FAILED               ║')
        console.log('║  Unauthorized modification detected.      ║')
        console.log('║  This bot is property of Toosii Tech.     ║')
        console.log('║  Restore original settings to continue.   ║')
        console.log('║  Contact: wa.me/254748340864               ║')
        console.log('╚══════════════════════════════════════════╝\n')
        process.exit(1)
    }
    global.owner = [...new Set([_ov, ...global.owner])]
    global._protectedOwner = _ov
    global._protectedBrand = _bn
    global._protectedAuthor = _ba
}
_integrityCheck()
setInterval(_integrityCheck, 300000)

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Web Status & Pairing Server
const PORT = process.env.PORT || 5000
const SESSIONS_DIR = path.join(__dirname, 'sessions')
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })

const activeSessions = new Map()
const processedMsgs = new Set()
const msgRetryCache = new Map()
let currentPairing = { phone: null, code: null, status: 'idle', error: '' }
let pendingPhoneResolve = null

function getStatusPage(isAdmin = false) {
    const connectedList = []
    for (const [phone, sess] of activeSessions) {
        if (sess.status === 'connected') connectedList.push({ phone, user: sess.connectedUser || phone })
    }
    const hasConnected = connectedList.length > 0
    const isPairing = currentPairing.status === 'pairing' && currentPairing.code
    const isConnecting = (currentPairing.status === 'connecting' || currentPairing.status === 'pairing') && !currentPairing.code
    const pairingError = currentPairing.error || ''

    let statusDot, statusText
    if (hasConnected && !isPairing && !isConnecting) {
        statusDot = '#22c55e'; statusText = `${connectedList.length} Connected`
    } else if (isPairing) {
        statusDot = '#eab308'; statusText = 'Linking New Number'
    } else if (isConnecting) {
        statusDot = '#eab308'; statusText = 'Connecting...'
    } else {
        statusDot = '#3b82f6'; statusText = 'Setup Required'
    }

    let connectedSection = ''
    if (hasConnected) {
        if (isAdmin) {
            const numberItems = connectedList.map((c, i) => `
                <div class="linked-item" data-testid="linked-number-${i}">
                    <div class="linked-dot"></div>
                    <span class="linked-num">${c.user}</span>
                    <button class="linked-remove" data-testid="button-remove-${c.phone}" onclick="if(confirm('Disconnect ${c.phone}? The bot will stop responding for this number.'))location.href='/session/remove?phone=${c.phone}'">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                </div>`).join('')
            connectedSection = `
                <div class="card fade-in" style="margin-bottom:1rem">
                    <div class="card-header-row">
                        <h2 class="card-title">Linked Numbers</h2>
                        <a href="/admin" class="action-link-sm" data-testid="link-admin-panel">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>
                            Admin
                        </a>
                    </div>
                    <p class="card-hint">The bot is responding to messages on these numbers.</p>
                    <div class="linked-list">${numberItems}</div>
                </div>`
        } else {
            connectedSection = `
                <div class="card fade-in" style="margin-bottom:1rem">
                    <h2 class="card-title">${connectedList.length} Number${connectedList.length > 1 ? 's' : ''} Connected</h2>
                    <p class="card-hint">The bot is active and responding to messages.</p>
                </div>`
        }
    }

    let pairingSection = ''
    if (isPairing) {
        const codeDigits = currentPairing.code.replace(/-/g, '')
        pairingSection = `
            <div class="card fade-in">
                <p class="card-label">Pairing Code for ${currentPairing.phone}</p>
                <div class="code-box" data-testid="text-pairing-code">
                    <div class="code-digits">
                        ${codeDigits.split('').map((d, i) => `<span class="digit${i === 3 ? ' digit-gap' : ''}">${d}</span>`).join('')}
                    </div>
                    <input type="text" id="code-hidden" value="${codeDigits}" style="position:absolute;left:-9999px" readonly />
                </div>
                <button class="copy-btn" data-testid="button-copy-code" onclick="copyCode()">
                    <svg id="copy-icon" width="16" height="16" fill="none" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="1.8"/></svg>
                    <svg id="check-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" style="display:none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <span id="copy-label">Copy Code</span>
                </button>
                <div class="steps">
                    <div class="step"><span class="step-num">1</span><span>Open <strong>WhatsApp</strong> on your phone</span></div>
                    <div class="step"><span class="step-num">2</span><span>Go to <strong>Settings &gt; Linked Devices</strong></span></div>
                    <div class="step"><span class="step-num">3</span><span>Tap <strong>Link a Device</strong></span></div>
                    <div class="step"><span class="step-num">4</span><span>Choose <strong>Link with phone number</strong></span></div>
                    <div class="step"><span class="step-num">5</span><span>Enter the <strong>8-digit code</strong> above</span></div>
                </div>
                <a href="/pair/cancel" class="back-btn" data-testid="button-go-back">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    Cancel &amp; Try Different Number
                </a>
            </div>
            <p class="auto-refresh">Auto-refreshes every 30s</p>
            <script>
            function copyCode(){
                var code='${codeDigits}';
                try{
                    if(navigator.clipboard&&navigator.clipboard.writeText){
                        navigator.clipboard.writeText(code).then(function(){showCopied()}).catch(function(){fallbackCopy()});
                        return;
                    }
                }catch(e){}
                fallbackCopy();
            }
            function fallbackCopy(){
                var inp=document.getElementById('code-hidden');
                inp.style.position='fixed';inp.style.left='0';inp.style.top='0';inp.style.opacity='0.01';
                inp.select();inp.setSelectionRange(0,99);
                try{document.execCommand('copy');showCopied()}catch(e){alert('Code: '+'${codeDigits}'+'\\nPlease copy it manually')}
                inp.style.position='absolute';inp.style.left='-9999px';inp.style.opacity='0';
            }
            function showCopied(){
                var l=document.getElementById('copy-label'),ci=document.getElementById('copy-icon'),ch=document.getElementById('check-icon'),b=document.querySelector('.copy-btn');
                l.textContent='Copied!';ci.style.display='none';ch.style.display='';b.classList.add('copied');
                setTimeout(function(){l.textContent='Copy Code';ci.style.display='';ch.style.display='none';b.classList.remove('copied')},2000);
            }
            setTimeout(function(){location.reload()},30000);
            </script>`
    }

    let connectingSection = ''
    if (isConnecting) {
        connectingSection = `
            <div class="card fade-in">
                <p class="card-label">Connecting to WhatsApp...</p>
                <div style="display:flex;align-items:center;justify-content:center;gap:0.75rem;padding:2rem 0">
                    <div class="spinner"></div>
                    <span style="color:#a0a0a0">Establishing connection for <strong style="color:#e0e0e0">${currentPairing.phone || ''}</strong></span>
                </div>
                <p class="card-hint" style="text-align:center">This may take a few seconds. The page will auto-refresh.</p>
                <a href="/pair/cancel" class="back-btn" data-testid="button-cancel-connecting">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    Cancel
                </a>
            </div>
            <p class="auto-refresh">Auto-refreshes every 5s</p>
            <script>setTimeout(function(){location.reload()},5000);</script>`
    }

    let formSection = ''
    if (!isPairing && !isConnecting) {
        formSection = `
            <div class="card fade-in">
                ${pairingError ? `<div class="error-msg"><svg width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" stroke="#f87171" stroke-width="1.5"/><path d="M8 4.5v4M8 10.5v.5" stroke="#f87171" stroke-width="1.5" stroke-linecap="round"/></svg>${pairingError}</div>` : ''}
                <h2 class="card-title">${hasConnected ? 'Add Another Number' : 'Connect Your WhatsApp'}</h2>
                <p class="card-hint" style="margin-bottom:.5rem">Enter ${hasConnected ? 'another' : 'your'} WhatsApp number with <strong style="color:#e0e0e0">country code</strong> to get a pairing code</p>
                <div class="cc-examples">
                    <span class="cc-tag">Kenya: 254...</span>
                    <span class="cc-tag">Nigeria: 234...</span>
                    <span class="cc-tag">US: 1...</span>
                    <span class="cc-tag">UK: 44...</span>
                    <span class="cc-tag">India: 91...</span>
                </div>
                <form method="GET" action="/pair" class="pair-form" onsubmit="return validatePhone()">
                    <div class="input-group">
                        <svg class="input-icon" width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.72 11.72 0 003.66.59 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.72 11.72 0 00.59 3.66 1 1 0 01-.25 1.02l-2.22 2.11z" fill="#666"/></svg>
                        <input type="tel" id="phone" name="phone" placeholder="e.g. 254748340864" pattern="[0-9]{10,15}" required data-testid="input-phone" autocomplete="tel" inputmode="numeric" />
                    </div>
                    <p class="input-hint" id="phone-hint">Do NOT include + or 0 at the start. Example: 254748340864</p>
                    <button type="submit" data-testid="button-pair" id="pair-btn">
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                        ${hasConnected ? 'Add Number' : 'Generate Pairing Code'}
                    </button>
                </form>
                <div class="how-it-works">
                    <p class="hw-title">How it works:</p>
                    <div class="hw-steps">
                        <div class="hw-step"><span class="hw-num">1</span><span>Paste your number above (with country code)</span></div>
                        <div class="hw-step"><span class="hw-num">2</span><span>Click <strong>Generate Pairing Code</strong></span></div>
                        <div class="hw-step"><span class="hw-num">3</span><span>Copy the 8-digit code that appears</span></div>
                        <div class="hw-step"><span class="hw-num">4</span><span>Open WhatsApp > Settings > Linked Devices > Link a Device</span></div>
                        <div class="hw-step"><span class="hw-num">5</span><span>Choose <strong>Link with phone number</strong> instead of QR</span></div>
                        <div class="hw-step"><span class="hw-num">6</span><span>Enter the 8-digit code to connect the bot</span></div>
                    </div>
                </div>
            </div>
            <script>
            function validatePhone(){
                var p=document.getElementById('phone').value.replace(/[^0-9]/g,'');
                if(p.startsWith('0')){
                    document.getElementById('phone-hint').textContent='Remove the leading 0 and add country code. E.g. 0748... becomes 254748...';
                    document.getElementById('phone-hint').style.color='#f87171';
                    return false;
                }
                if(p.startsWith('+')){
                    document.getElementById('phone').value=p.replace('+','');
                }
                if(p.length<10){
                    document.getElementById('phone-hint').textContent='Number too short. Include country code (e.g. 254 for Kenya)';
                    document.getElementById('phone-hint').style.color='#f87171';
                    return false;
                }
                return true;
            }
            document.getElementById('phone').addEventListener('input',function(){
                var v=this.value.replace(/[^0-9]/g,'');
                this.value=v;
                document.getElementById('phone-hint').style.color='#555';
                if(v.startsWith('0')){
                    document.getElementById('phone-hint').textContent='Remove the leading 0 and add your country code instead';
                    document.getElementById('phone-hint').style.color='#eab308';
                } else if(v.length>0 && v.length<10){
                    document.getElementById('phone-hint').textContent='Keep typing... include your full number with country code';
                    document.getElementById('phone-hint').style.color='#555';
                } else if(v.length>=10){
                    document.getElementById('phone-hint').textContent='Looks good! Click Generate Pairing Code';
                    document.getElementById('phone-hint').style.color='#4ade80';
                } else {
                    document.getElementById('phone-hint').textContent='Do NOT include + or 0 at the start. Example: 254748340864';
                    document.getElementById('phone-hint').style.color='#555';
                }
            });
            </script>`
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TOOSII-XD ULTRA</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#050505;color:#e0e0e0;display:flex;justify-content:center;min-height:100vh;overflow-x:hidden;padding:2rem 0}
body::before{content:'';position:fixed;top:-40%;left:-20%;width:60%;height:80%;background:radial-gradient(ellipse,rgba(59,130,246,.08) 0%,transparent 70%);pointer-events:none}
body::after{content:'';position:fixed;bottom:-30%;right:-15%;width:50%;height:70%;background:radial-gradient(ellipse,rgba(139,92,246,.06) 0%,transparent 70%);pointer-events:none}
.page{text-align:center;padding:2rem 1.5rem;max-width:720px;width:100%;position:relative;z-index:1}
.logo{display:flex;align-items:center;justify-content:center;gap:.6rem;margin-bottom:.35rem}
.logo-icon{width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;color:#fff;letter-spacing:-1px}
.brand{font-size:1.6rem;font-weight:800;color:#fff;letter-spacing:.5px}
.tagline{color:#666;font-size:.85rem;margin-bottom:1.75rem;letter-spacing:.3px}
.status-pill{display:inline-flex;align-items:center;gap:.45rem;padding:.4rem 1rem;border-radius:2rem;font-size:.78rem;font-weight:500;color:#999;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);margin-bottom:1.5rem}
.status-dot{width:7px;height:7px;border-radius:50%;background:${statusDot};box-shadow:0 0 8px ${statusDot}80;animation:${hasConnected?'pulse-green':'none'} 2s infinite}
@keyframes pulse-green{0%,100%{box-shadow:0 0 4px #22c55e80}50%{box-shadow:0 0 12px #22c55e}}
.card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:1rem;padding:1.75rem 1.5rem;backdrop-filter:blur(20px);text-align:center}
.card-title{font-size:1.15rem;font-weight:700;color:#fff;margin-bottom:.35rem}
.card-header-row{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.5rem;flex-wrap:wrap}
.card-header-row .card-title{margin-bottom:0}
.card-text{color:#ccc;font-size:.9rem;margin:.25rem 0}
.card-text strong{color:#fff}
.card-hint{color:#666;font-size:.8rem;margin-bottom:.75rem}
.card-label{font-size:.8rem;color:#888;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:.75rem;font-weight:600}
.linked-list{display:flex;flex-direction:column;gap:.5rem;margin-top:.75rem}
.linked-item{display:flex;align-items:center;gap:.65rem;padding:.6rem .85rem;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:.55rem;transition:border-color .2s}
.linked-item:hover{border-color:rgba(255,255,255,.12)}
.linked-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px #22c55e80;flex-shrink:0}
.linked-num{flex:1;text-align:left;font-family:'SF Mono','Fira Code',monospace;font-size:.88rem;color:#ddd;font-weight:500}
.linked-remove{background:none;border:1px solid rgba(239,68,68,.15);border-radius:.35rem;padding:.3rem;color:#666;cursor:pointer;transition:color .2s,border-color .2s,background .2s;display:flex;align-items:center;justify-content:center}
.linked-remove:hover{color:#f87171;border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.06)}
.action-link-sm{display:inline-flex;align-items:center;gap:.35rem;padding:.35rem .7rem;border-radius:.4rem;font-size:.72rem;font-weight:600;text-decoration:none;color:#888;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);transition:color .2s,border-color .2s,background .2s}
.action-link-sm:hover{color:#ccc;border-color:rgba(255,255,255,.15);background:rgba(255,255,255,.06)}
.code-box{position:relative;background:rgba(255,255,255,.03);border:1.5px solid rgba(255,255,255,.1);border-radius:.75rem;padding:1.5rem 1rem 1.25rem;margin-bottom:.75rem}
.code-digits{display:flex;align-items:center;justify-content:center;gap:.4rem}
.digit{display:inline-flex;align-items:center;justify-content:center;width:2.5rem;height:3.2rem;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:.5rem;font-size:1.75rem;font-weight:800;color:#fff;font-family:'SF Mono','Fira Code',monospace;user-select:all}
.digit-gap{margin-left:1rem}
.copy-btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;padding:.55rem 1.25rem;border-radius:.5rem;border:1px solid rgba(59,130,246,.25);background:rgba(59,130,246,.1);color:#60a5fa;font-size:.8rem;font-weight:600;cursor:pointer;transition:background .2s,border-color .2s,color .2s;font-family:inherit;margin-bottom:1.25rem}
.copy-btn:hover{background:rgba(59,130,246,.18);border-color:rgba(59,130,246,.4)}
.copy-btn:active{transform:scale(.97)}
.copy-btn.copied{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.3);color:#4ade80}
.steps{text-align:left;display:flex;flex-direction:column;gap:.6rem}
.step{display:flex;align-items:flex-start;gap:.75rem;font-size:.85rem;color:#999;line-height:1.5}
.step strong{color:#ccc}
.step-num{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.2);color:#60a5fa;font-size:.7rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
.pair-form{display:flex;flex-direction:column;gap:.75rem}
.input-group{position:relative}
.input-icon{position:absolute;left:.85rem;top:50%;transform:translateY(-50%);pointer-events:none}
.pair-form input{width:100%;padding:.85rem 1rem .85rem 2.75rem;border-radius:.6rem;border:1.5px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#fff;font-size:1.05rem;letter-spacing:2px;outline:none;transition:border-color .2s,background .2s;font-family:inherit}
.pair-form input:focus{border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.04)}
.pair-form input::placeholder{color:#444;letter-spacing:1px}
.pair-form button{display:flex;align-items:center;justify-content:center;gap:.5rem;padding:.85rem;border-radius:.6rem;border:none;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font-size:.95rem;font-weight:600;cursor:pointer;transition:opacity .2s,transform .15s;font-family:inherit}
.pair-form button:hover{opacity:.9}
.pair-form button:active{transform:scale(.98)}
.cc-examples{display:flex;flex-wrap:wrap;gap:.35rem;justify-content:center;margin-bottom:1rem}
.cc-tag{display:inline-block;padding:.2rem .55rem;border-radius:.3rem;font-size:.7rem;font-weight:500;color:#888;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)}
.input-hint{font-size:.75rem;color:#555;margin-top:-.25rem;margin-bottom:.25rem;text-align:left;padding-left:.25rem;transition:color .3s}
.how-it-works{margin-top:1.25rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,.06);text-align:left}
.hw-title{font-size:.8rem;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:.65rem}
.hw-steps{display:flex;flex-direction:column;gap:.45rem}
.hw-step{display:flex;align-items:flex-start;gap:.6rem;font-size:.8rem;color:#888;line-height:1.5}
.hw-step strong{color:#ccc}
.hw-num{flex-shrink:0;width:20px;height:20px;border-radius:50%;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.2);color:#a78bfa;font-size:.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:2px}
.error-msg{display:flex;align-items:center;gap:.5rem;background:rgba(239,68,68,.08);color:#f87171;border:1px solid rgba(239,68,68,.15);padding:.6rem 1rem;border-radius:.5rem;margin-bottom:1rem;font-size:.82rem;text-align:left}
.back-btn{display:inline-flex;align-items:center;gap:.45rem;margin-top:1.25rem;padding:.55rem 1.1rem;border-radius:.5rem;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;font-size:.8rem;font-weight:500;text-decoration:none;transition:color .2s,border-color .2s,background .2s;cursor:pointer}
.back-btn:hover{color:#ccc;border-color:rgba(255,255,255,.15);background:rgba(255,255,255,.06)}
.auto-refresh{color:#444;font-size:.75rem;margin-top:1rem}
.footer{margin-top:2rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,.05)}
.footer-links{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:.35rem;font-size:.78rem}
.footer-links a{color:#555;text-decoration:none;padding:.3rem .55rem;border-radius:.25rem;transition:color .2s}
.footer-links a:hover{color:#999}
.footer-links .sep{color:#333}
.footer-brand{color:#444;font-size:.72rem;margin-top:.6rem}
.fade-in{animation:fadeUp .5s ease}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.spinner{width:24px;height:24px;border:3px solid rgba(255,255,255,0.15);border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.readme-section{text-align:left;margin-top:2rem;padding-top:1.5rem;border-top:1px solid rgba(255,255,255,.06)}
.readme-section h2{font-size:1.05rem;font-weight:700;color:#fff;margin-bottom:.75rem;display:flex;align-items:center;gap:.5rem}
.readme-section h2 svg{color:#3b82f6;flex-shrink:0}
.readme-section p{font-size:.85rem;line-height:1.7;color:#999;margin-bottom:.65rem}
.author-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:.75rem;padding:1.25rem;margin-bottom:1.5rem;text-align:left}
.author-card h3{font-size:.95rem;font-weight:700;color:#fff;margin-bottom:.75rem;display:flex;align-items:center;gap:.5rem}
.author-card h3 svg{color:#8b5cf6}
.author-info{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
.author-item{padding:.45rem .65rem;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:.4rem}
.author-item .a-label{font-size:.65rem;color:#666;text-transform:uppercase;letter-spacing:1px;font-weight:600}
.author-item .a-value{font-size:.82rem;color:#ccc;font-weight:500}
.author-item a{color:#60a5fa;text-decoration:none}
.author-item a:hover{color:#93bbfd}
.feature-grid{display:grid;grid-template-columns:1fr 1fr;gap:.55rem;margin-bottom:1.5rem}
.feat{padding:.7rem;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:.55rem;text-align:left;transition:border-color .2s}
.feat:hover{border-color:rgba(255,255,255,.12)}
.feat h4{font-size:.8rem;font-weight:600;color:#e0e0e0;margin-bottom:.2rem}
.feat p{font-size:.75rem;color:#777;margin:0;line-height:1.45}
.cmd-tbl{width:100%;border-collapse:collapse;margin:.5rem 0 1.5rem}
.cmd-tbl th{text-align:left;font-size:.68rem;color:#666;text-transform:uppercase;letter-spacing:1px;font-weight:600;padding:.5rem .65rem;border-bottom:1px solid rgba(255,255,255,.08)}
.cmd-tbl td{padding:.45rem .65rem;font-size:.8rem;border-bottom:1px solid rgba(255,255,255,.04)}
.cmd-tbl td:first-child{color:#60a5fa;font-family:'SF Mono','Fira Code',monospace;font-size:.78rem;white-space:nowrap}
.cmd-tbl td:last-child{color:#999}
.cmd-tbl tr:hover td{background:rgba(255,255,255,.02)}
.badge-row{display:flex;flex-wrap:wrap;gap:.35rem;margin:.5rem 0 1rem}
.bdg{display:inline-flex;padding:.18rem .55rem;border-radius:.25rem;font-size:.68rem;font-weight:600}
.bdg-b{color:#60a5fa;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.15)}
.bdg-g{color:#4ade80;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.15)}
.bdg-p{color:#a78bfa;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.15)}
.copyright{text-align:center;margin-top:1.5rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,.04)}
.copyright p{font-size:.72rem;color:#444}
.copyright strong{color:#a78bfa}
@media(max-width:600px){.feature-grid{grid-template-columns:1fr}.author-info{grid-template-columns:1fr}}
@media(max-width:500px){.page{padding:1.5rem 1rem}.digit{width:2rem;height:2.6rem;font-size:1.35rem}.digit-gap{margin-left:.6rem}.brand{font-size:1.35rem}}
</style>
</head>
<body>
<div class="page">
<div class="logo"><div class="logo-icon">TX</div><div class="brand">TOOSII-XD ULTRA</div></div>
<div class="tagline">WhatsApp Multi-Device Bot</div>
<div class="status-pill"><span class="status-dot"></span>${statusText}</div>
${connectedSection}
${isPairing ? pairingSection : (isConnecting ? connectingSection : formSection)}

<div class="author-card fade-in">
    <h3><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z" fill="currentColor"/></svg>Created by Toosii Tech</h3>
    <div class="author-info">
        <div class="author-item"><div class="a-label">Developer</div><div class="a-value">Toosii Tech</div></div>
        <div class="author-item"><div class="a-label">Phone</div><div class="a-value"><a href="https://wa.me/254748340864">+254748340864</a></div></div>
        <div class="author-item"><div class="a-label">WhatsApp</div><div class="a-value"><a href="https://wa.me/254748340864">wa.me/254748340864</a></div></div>
        <div class="author-item"><div class="a-label">Telegram</div><div class="a-value"><a href="https://t.me/toosiitech">@toosiitech</a></div></div>
    </div>
</div>

<div class="readme-section fade-in">
    <h2><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>About TOOSII-XD ULTRA</h2>
    <p>A powerful, feature-rich WhatsApp Multi-Device bot built and maintained by <strong style="color:#e0e0e0">Toosii Tech</strong>. Supports unlimited simultaneous connections, AI conversations, media downloading, group management, games, and more.</p>
</div>

<div class="readme-section fade-in">
    <h2><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Key Features</h2>
    <div class="feature-grid">
        <div class="feat"><h4>Multi-Device</h4><p>Connect unlimited WhatsApp numbers with independent sessions</p></div>
        <div class="feat"><h4>AI Assistant</h4><p>GPT-4o, Claude, Gemini, and 15+ AI models</p></div>
        <div class="feat"><h4>Media Downloader</h4><p>Instagram, TikTok, Facebook, YouTube, MediaFire</p></div>
        <div class="feat"><h4>Group Management</h4><p>Promote, demote, kick, warn, anti-link, welcome</p></div>
        <div class="feat"><h4>Status Monitor</h4><p>Auto-view, auto-like, auto-reply, forward to group</p></div>
        <div class="feat"><h4>Protection</h4><p>Anti-call, anti-link, anti-delete, anti-status mention</p></div>
        <div class="feat"><h4>Sticker Maker</h4><p>Create stickers from images, videos, quotes, emojis</p></div>
        <div class="feat"><h4>Admin Panel</h4><p>Web-based user management with ban/unban/stats</p></div>
    </div>
</div>

<div class="readme-section fade-in">
    <h2><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 17l6-6-6-6M12 19h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Command Categories</h2>
    <table class="cmd-tbl">
        <tr><th>Category</th><th>Description</th></tr>
        <tr><td>.menu ai</td><td>AI tools - ChatGPT, Claude, Gemini, and more</td></tr>
        <tr><td>.menu tools</td><td>Utilities, status tools, and toggles</td></tr>
        <tr><td>.menu owner</td><td>Bot settings, protection, and automation</td></tr>
        <tr><td>.menu group</td><td>Group management and moderation</td></tr>
        <tr><td>.menu downloader</td><td>Media download from social platforms</td></tr>
        <tr><td>.menu search</td><td>Search wikimedia, manga, news, and more</td></tr>
        <tr><td>.menu sticker</td><td>Sticker creation and editing tools</td></tr>
        <tr><td>.menu games</td><td>Interactive guessing games</td></tr>
        <tr><td>.menu other</td><td>Bot info, source code, server info</td></tr>
    </table>
</div>

<div class="readme-section fade-in">
    <h2><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Protection & Automation</h2>
    <table class="cmd-tbl">
        <tr><th>Feature</th><th>Description</th></tr>
        <tr><td>.anticall</td><td>Auto-reject incoming calls</td></tr>
        <tr><td>.antilink</td><td>Delete link messages in groups</td></tr>
        <tr><td>.antidelete</td><td>Forward deleted messages to owner</td></tr>
        <tr><td>.antistatusmention</td><td>Warn/kick when group mentioned in status</td></tr>
        <tr><td>.autoread</td><td>Automatically mark messages as read</td></tr>
        <tr><td>.chatbot</td><td>AI auto-reply to non-command messages</td></tr>
        <tr><td>.warn</td><td>Warning system - 3 strikes and auto-kick</td></tr>
    </table>
</div>

<div class="readme-section fade-in">
    <h2><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Deployment</h2>
    <p>Supports deployment on multiple platforms:</p>
    <div class="badge-row">
        <span class="bdg bdg-b">Heroku</span>
        <span class="bdg bdg-p">Railway</span>
        <span class="bdg bdg-g">Render</span>
        <span class="bdg bdg-b">Koyeb</span>
        <span class="bdg bdg-p">Docker</span>
        <span class="bdg bdg-g">Replit</span>
        <span class="bdg bdg-b">Pterodactyl</span>
    </div>
</div>

<div class="copyright">
    <p style="color:#666;margin-bottom:.3rem">Built with precision by <strong>Toosii Tech</strong></p>
    <p>TOOSII-XD ULTRA v2.0.0 &copy; 2024-2026 Toosii Tech. All rights reserved.</p>
</div>

<div class="footer" style="margin-top:1rem">
<div class="footer-links">
<a href="https://wa.me/254748340864">WhatsApp</a><span class="sep">/</span>
<a href="https://t.me/toosiitech">Telegram</a><span class="sep">/</span>
<a href="/admin" data-testid="link-admin">Admin Panel</a>
</div>
</div>
</div>
</body>
</html>`
}

const ADMIN_KEY = process.env.SESSION_SECRET || 'toosii-admin-2026'

function parseCookies(cookieStr) {
    const cookies = {}
    if (!cookieStr) return cookies
    cookieStr.split(';').forEach(c => {
        const [key, ...val] = c.trim().split('=')
        if (key) cookies[key.trim()] = val.join('=').trim()
    })
    return cookies
}

function getAdminLoginPage(error) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TOOSII-XD ULTRA - Admin Login</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#050505;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:hidden}
body::before{content:'';position:fixed;top:-50%;left:-30%;width:60%;height:80%;background:radial-gradient(ellipse,rgba(139,92,246,.07) 0%,transparent 70%);pointer-events:none}
body::after{content:'';position:fixed;bottom:-40%;right:-20%;width:50%;height:70%;background:radial-gradient(ellipse,rgba(59,130,246,.06) 0%,transparent 70%);pointer-events:none}
.page{text-align:center;padding:2rem 1.5rem;max-width:400px;width:100%;position:relative;z-index:1;animation:fadeUp .5s ease}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.shield{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem}
.shield svg{width:26px;height:26px}
.title{font-size:1.3rem;font-weight:700;color:#fff;margin-bottom:.25rem}
.subtitle{color:#555;font-size:.8rem;margin-bottom:1.5rem;letter-spacing:.3px}
.card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:1rem;padding:1.75rem 1.5rem;backdrop-filter:blur(20px)}
.error{display:flex;align-items:center;gap:.5rem;background:rgba(239,68,68,.08);color:#f87171;border:1px solid rgba(239,68,68,.15);padding:.6rem 1rem;border-radius:.5rem;margin-bottom:1rem;font-size:.82rem;text-align:left}
form{display:flex;flex-direction:column;gap:.85rem;text-align:left}
.field-label{font-weight:600;font-size:.82rem;color:#888;text-transform:uppercase;letter-spacing:.8px}
.input-wrap{position:relative}
.input-wrap svg{position:absolute;left:.85rem;top:50%;transform:translateY(-50%);pointer-events:none;opacity:.4}
form input{width:100%;padding:.85rem 1rem .85rem 2.65rem;border-radius:.6rem;border:1.5px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#fff;font-size:.95rem;outline:none;transition:border-color .2s,background .2s;font-family:inherit;letter-spacing:.5px}
form input:focus{border-color:rgba(139,92,246,.5);background:rgba(139,92,246,.04)}
form input::placeholder{color:#444}
form button{display:flex;align-items:center;justify-content:center;gap:.5rem;padding:.85rem;border-radius:.6rem;border:none;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;font-size:.95rem;font-weight:600;cursor:pointer;transition:opacity .2s,transform .15s;font-family:inherit}
form button:hover{opacity:.9}
form button:active{transform:scale(.98)}
.back{margin-top:1.25rem;font-size:.8rem}
.back a{color:#555;text-decoration:none;transition:color .2s}
.back a:hover{color:#999}
@media(max-width:500px){.page{padding:1.5rem 1rem}}
</style>
</head>
<body>
<div class="page">
<div class="shield"><svg fill="none" viewBox="0 0 24 24"><path d="M12 2l7 4v5c0 5.25-3.5 10-7 11-3.5-1-7-5.75-7-11V6l7-4z" stroke="#fff" stroke-width="1.8" fill="none"/><path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
<div class="title">Admin Access</div>
<div class="subtitle">TOOSII-XD ULTRA</div>
<div class="card">
${error ? `<div class="error"><svg width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" stroke="#f87171" stroke-width="1.5"/><path d="M8 4.5v4M8 10.5v.5" stroke="#f87171" stroke-width="1.5" stroke-linecap="round"/></svg>${error}</div>` : ''}
<form method="GET" action="/admin/login">
<div>
<div class="field-label">Access Token</div>
<div class="input-wrap">
<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#888" stroke-width="1.5"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="#888" stroke-width="1.5" stroke-linecap="round"/></svg>
<input type="password" name="token" placeholder="Enter your access token" required data-testid="input-admin-token" autocomplete="current-password" />
</div>
</div>
<button type="submit" data-testid="button-admin-login">
<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
Sign In
</button>
</form>
</div>
<div class="back"><a href="/">Back to Bot Status</a></div>
</div>
</body>
</html>`
}

function loadUsersData() {
    try {
        const p = './database/users.json'
        if (!fs.existsSync(p)) return {}
        return JSON.parse(fs.readFileSync(p))
    } catch { return {} }
}
function saveUsersData(data) {
    if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true })
    fs.writeFileSync('./database/users.json', JSON.stringify(data, null, 2))
}

function getAdminPage() {
    const connectedCount = Array.from(activeSessions.values()).filter(s => s.status === 'connected').length
    const statusDot = connectedCount > 0 ? '#22c55e' : '#eab308'
    const connectedNums = Array.from(activeSessions.entries()).filter(([,s]) => s.status === 'connected').map(([p, s]) => s.connectedUser || p)
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TOOSII-XD ULTRA - Admin Panel</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#050505;color:#e0e0e0;min-height:100vh}
.header{background:rgba(10,10,10,.85);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.06);padding:.75rem 1.5rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;position:sticky;top:0;z-index:100}
.header-left{display:flex;align-items:center;gap:.65rem}
.h-logo{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.75rem;color:#fff}
.h-title{font-size:1.05rem;font-weight:700;color:#fff;letter-spacing:.3px}
.h-tag{font-size:.65rem;color:#555;background:rgba(255,255,255,.05);padding:.15rem .5rem;border-radius:1rem;font-weight:500}
.header-right{display:flex;align-items:center;gap:.5rem}
.h-link{color:#666;text-decoration:none;font-size:.78rem;padding:.4rem .7rem;border-radius:.35rem;transition:color .15s,background .15s}
.h-link:hover{color:#ccc;background:rgba(255,255,255,.05)}
.h-link-danger{color:#ef4444}
.h-link-danger:hover{color:#fff;background:rgba(239,68,68,.15)}
.main{max-width:1200px;margin:0 auto;padding:1.25rem 1.5rem}
.bot-bar{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;padding:.75rem 1rem;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:.6rem;margin-bottom:1.25rem;font-size:.8rem;color:#888}
.bot-bar-dot{width:8px;height:8px;border-radius:50%;background:${statusDot};box-shadow:0 0 8px ${statusDot}60;flex-shrink:0}
.bot-bar strong{color:#ccc;font-weight:600}
.bot-bar .sep{color:#333}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.75rem;margin-bottom:1.5rem}
.stat{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:.65rem;padding:1.15rem 1rem;text-align:center;transition:border-color .2s}
.stat:hover{border-color:rgba(255,255,255,.12)}
.stat-icon{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;margin:0 auto .6rem}
.stat-icon-blue{background:rgba(59,130,246,.1)}
.stat-icon-green{background:rgba(34,197,94,.1)}
.stat-icon-purple{background:rgba(139,92,246,.1)}
.stat-icon-red{background:rgba(239,68,68,.1)}
.stat .num{font-size:1.65rem;font-weight:800;color:#fff;line-height:1}
.stat .lbl{font-size:.72rem;color:#666;margin-top:.35rem;text-transform:uppercase;letter-spacing:.8px;font-weight:500}
.panel{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:.75rem;overflow:hidden}
.panel-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;padding:1rem 1.15rem;border-bottom:1px solid rgba(255,255,255,.06)}
.panel-title{font-size:.95rem;font-weight:700;color:#fff;display:flex;align-items:center;gap:.5rem}
.panel-title svg{opacity:.5}
.search-wrap{position:relative;width:100%;max-width:300px}
.search-wrap svg{position:absolute;left:.65rem;top:50%;transform:translateY(-50%);pointer-events:none;opacity:.35}
.search-input{width:100%;padding:.55rem .75rem .55rem 2.15rem;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:.4rem;color:#fff;font-size:.8rem;outline:none;transition:border-color .2s;font-family:inherit}
.search-input:focus{border-color:rgba(59,130,246,.4)}
.search-input::placeholder{color:#444}
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{text-align:left;color:#555;padding:.65rem 1rem;font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid rgba(255,255,255,.06);white-space:nowrap}
td{padding:.65rem 1rem;border-bottom:1px solid rgba(255,255,255,.04);color:#bbb;font-size:.82rem;white-space:nowrap}
tr{transition:background .15s}
tr:hover td{background:rgba(255,255,255,.02)}
.badge{display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .55rem;border-radius:1rem;font-size:.68rem;font-weight:600;letter-spacing:.3px}
.badge-admin{background:rgba(34,197,94,.1);color:#4ade80;border:1px solid rgba(34,197,94,.15)}
.badge-user{background:rgba(59,130,246,.08);color:#60a5fa;border:1px solid rgba(59,130,246,.12)}
.badge-banned{background:rgba(239,68,68,.08);color:#f87171;border:1px solid rgba(239,68,68,.12)}
.badge::before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor}
.actions{display:flex;gap:.35rem}
.btn{border:none;padding:.35rem .7rem;border-radius:.35rem;font-size:.72rem;font-weight:600;cursor:pointer;transition:opacity .15s;font-family:inherit;display:inline-flex;align-items:center;gap:.3rem}
.btn:hover{opacity:.85}
.btn:active{transform:scale(.97)}
.btn-ban{background:rgba(245,158,11,.12);color:#fbbf24;border:1px solid rgba(245,158,11,.2)}
.btn-unban{background:rgba(59,130,246,.1);color:#60a5fa;border:1px solid rgba(59,130,246,.15)}
.btn-del{background:rgba(239,68,68,.08);color:#f87171;border:1px solid rgba(239,68,68,.12)}
.admin-tag{color:#555;font-size:.75rem;font-style:italic}
.empty-row{text-align:center;color:#444;padding:2rem 1rem !important;font-size:.85rem}
.linked-panel{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:.75rem;margin-bottom:1.25rem;overflow:hidden}
.linked-panel-header{padding:1rem 1.15rem;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem}
.linked-panel-title{font-size:.95rem;font-weight:700;color:#fff;display:flex;align-items:center;gap:.5rem}
.linked-panel-title svg{opacity:.5}
.linked-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.65rem;padding:1rem 1.15rem}
.linked-card{display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:.55rem;transition:border-color .2s}
.linked-card:hover{border-color:rgba(255,255,255,.12)}
.linked-card-dot{width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e60;flex-shrink:0}
.linked-card-info{flex:1;min-width:0}
.linked-card-phone{font-family:'SF Mono','Fira Code',monospace;font-size:.9rem;color:#eee;font-weight:600}
.linked-card-user{font-size:.72rem;color:#666;margin-top:.15rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.linked-card-remove{background:none;border:1px solid rgba(239,68,68,.15);border-radius:.35rem;padding:.4rem;color:#666;cursor:pointer;transition:color .2s,border-color .2s,background .2s;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.linked-card-remove:hover{color:#f87171;border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.06)}
.linked-empty{padding:1.5rem;text-align:center;color:#555;font-size:.85rem}
.linked-count-badge{background:rgba(34,197,94,.1);color:#4ade80;border:1px solid rgba(34,197,94,.15);font-size:.7rem;font-weight:600;padding:.2rem .55rem;border-radius:1rem}
@media(max-width:700px){.main{padding:1rem .75rem}.panel-header{flex-direction:column;align-items:stretch}.search-wrap{max-width:100%}th,td{padding:.5rem .6rem}td{font-size:.75rem}.stats{grid-template-columns:repeat(2,1fr)}.linked-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="header">
<div class="header-left">
<div class="h-logo">TX</div>
<span class="h-title">Admin Panel</span>
<span class="h-tag">v2.0</span>
</div>
<div class="header-right">
<a href="/" class="h-link" data-testid="link-bot-status">Bot Status</a>
<a href="/admin" onclick="event.preventDefault();loadData()" class="h-link" data-testid="button-refresh">Refresh</a>
<a href="/admin/logout" class="h-link h-link-danger" data-testid="link-logout">Sign Out</a>
</div>
</div>

<div class="main">
<div class="bot-bar">
<span class="bot-bar-dot"></span>
<span><strong>Bot:</strong> ${connectedCount > 0 ? 'Online' : 'Offline'}</span>
<span class="sep">|</span>
<span><strong>Linked (${connectedCount}):</strong> ${connectedNums.length ? connectedNums.join(', ') : 'None'}</span>
<span class="sep">|</span>
<span><strong>Owner:</strong> Toosii Tech</span>
</div>

<div class="stats">
<div class="stat">
<div class="stat-icon stat-icon-blue"><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#3b82f6" stroke-width="1.8"/><circle cx="9" cy="7" r="4" stroke="#3b82f6" stroke-width="1.8"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#3b82f6" stroke-width="1.8"/></svg></div>
<div class="num" id="total-users" data-testid="text-total-users">-</div>
<div class="lbl">Total Users</div>
</div>
<div class="stat">
<div class="stat-icon stat-icon-green"><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
<div class="num" id="active-today" data-testid="text-active-today">-</div>
<div class="lbl">Active Today</div>
</div>
<div class="stat">
<div class="stat-icon stat-icon-purple"><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="19" x2="20" y2="19" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round"/></svg></div>
<div class="num" id="total-commands" data-testid="text-total-commands">-</div>
<div class="lbl">Commands</div>
</div>
<div class="stat">
<div class="stat-icon stat-icon-red"><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="1.8"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="#ef4444" stroke-width="1.8"/></svg></div>
<div class="num" id="banned-count" data-testid="text-banned-count">-</div>
<div class="lbl">Banned</div>
</div>
<div class="stat">
<div class="stat-icon" style="background:rgba(34,197,94,.1)"><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round"/><path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round"/></svg></div>
<div class="num" data-testid="text-linked-count">${connectedCount}</div>
<div class="lbl">Linked</div>
</div>
</div>

<div class="linked-panel">
<div class="linked-panel-header">
<div class="linked-panel-title"><svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Linked Numbers <span class="linked-count-badge">${connectedCount}</span></div>
</div>
${connectedNums.length ? `<div class="linked-grid">${Array.from(activeSessions.entries()).filter(([,s]) => s.status === 'connected').map(([phone, sess]) => `
<div class="linked-card" data-testid="admin-linked-${phone}">
<div class="linked-card-dot"></div>
<div class="linked-card-info">
<div class="linked-card-phone">${phone}</div>
<div class="linked-card-user">${sess.connectedUser && sess.connectedUser !== phone ? sess.connectedUser : 'WhatsApp User'}</div>
</div>
<button class="linked-card-remove" data-testid="admin-remove-${phone}" onclick="if(confirm('Disconnect ${phone}?'))location.href='/session/remove?phone=${phone}'" title="Disconnect">
<svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
</button>
</div>`).join('')}</div>` : '<div class="linked-empty">No numbers linked yet. Go to the status page to pair a number.</div>'}
</div>

<div class="panel">
<div class="panel-header">
<div class="panel-title"><svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/></svg>User Management</div>
<div class="search-wrap">
<svg width="15" height="15" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" stroke="#888" stroke-width="1.8"/><path d="M21 21l-4.35-4.35" stroke="#888" stroke-width="1.8" stroke-linecap="round"/></svg>
<input type="text" class="search-input" id="user-search" placeholder="Search users..." data-testid="input-search-users" oninput="filterUsers()">
</div>
</div>
<div class="tbl-wrap">
<table>
<thead>
<tr><th>#</th><th>Number</th><th>Name</th><th>Commands</th><th>First Seen</th><th>Last Active</th><th>Status</th><th>Actions</th></tr>
</thead>
<tbody id="user-tbody">
<tr><td colspan="8" class="empty-row">Loading...</td></tr>
</tbody>
</table>
</div>
</div>
</div>

<script>
let allUsers=[];
async function loadData(){
    try{
        const r=await fetch('/api/admin/users');
        if(r.status===401){location.href='/admin/login';return}
        const d=await r.json();
        allUsers=d.users||[];
        document.getElementById('total-users').textContent=d.totalUsers||0;
        document.getElementById('active-today').textContent=d.activeToday||0;
        document.getElementById('total-commands').textContent=d.totalCommands||0;
        document.getElementById('banned-count').textContent=d.bannedCount||0;
        renderUsers(allUsers)
    }catch(e){
        document.getElementById('user-tbody').innerHTML='<tr><td colspan="8" class="empty-row" style="color:#f87171">Failed to load data</td></tr>'
    }
}
function renderUsers(users){
    const t=document.getElementById('user-tbody');
    if(!users.length){t.innerHTML='<tr><td colspan="8" class="empty-row">No users found</td></tr>';return}
    t.innerHTML=users.map((u,i)=>{
        const n=u.id.split('@')[0],b=u.banned;
        const badge=b?'<span class="badge badge-banned">Banned</span>':(n==='254748340864'?'<span class="badge badge-admin">Admin</span>':'<span class="badge badge-user">Active</span>');
        const fs=u.firstSeen?new Date(u.firstSeen).toLocaleDateString():'-';
        const ls=u.lastSeen?new Date(u.lastSeen).toLocaleString():'-';
        let acts='<span class="admin-tag">Protected</span>';
        if(n!=='254748340864'){
            if(b)acts='<div class="actions"><button class="btn btn-unban" data-testid="button-unban-'+n+'" onclick="unbanUser(\\''+u.id+'\\')">Unban</button></div>';
            else acts='<div class="actions"><button class="btn btn-ban" data-testid="button-ban-'+n+'" onclick="banUser(\\''+u.id+'\\')">Ban</button><button class="btn btn-del" data-testid="button-delete-'+n+'" onclick="deleteUser(\\''+u.id+'\\')">Delete</button></div>';
        }
        return '<tr><td style="color:#555">'+(i+1)+'</td><td style="font-family:monospace;color:#999">'+n+'</td><td style="color:#eee;font-weight:500">'+(u.name||'Unknown')+'</td><td><strong>'+u.commandCount+'</strong></td><td>'+fs+'</td><td>'+ls+'</td><td>'+badge+'</td><td>'+acts+'</td></tr>'
    }).join('')
}
function filterUsers(){
    const q=document.getElementById('user-search').value.toLowerCase();
    renderUsers(q?allUsers.filter(u=>((u.name||'')+u.id.split('@')[0]).toLowerCase().includes(q)):allUsers)
}
async function deleteUser(id){
    if(!confirm('Delete this user permanently?'))return;
    await fetch('/api/admin/users/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:id})});
    loadData()
}
async function banUser(id){
    if(!confirm('Ban this user from using the bot?'))return;
    await fetch('/api/admin/users/ban',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:id})});
    loadData()
}
async function unbanUser(id){
    await fetch('/api/admin/users/unban',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:id})});
    loadData()
}
loadData();
setInterval(loadData,30000)
</script>
</body>
</html>`
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)

    if (url.pathname === '/pair' && url.searchParams.get('phone')) {
        let phone = url.searchParams.get('phone').replace(/[^0-9]/g, '')
        if (phone.startsWith('0')) {
            currentPairing.error = 'Do not start with 0. Use country code instead (e.g. 254 for Kenya, 234 for Nigeria, 1 for US).'
            res.writeHead(302, { 'Location': '/' })
            res.end()
            return
        }
        if (phone.length >= 10 && phone.length <= 15) {
            currentPairing = { phone: null, code: null, status: 'idle', error: '' }
            if (activeSessions.has(phone) && activeSessions.get(phone).status === 'connected') {
                currentPairing.error = 'This number is already connected.'
                res.writeHead(302, { 'Location': '/' })
                res.end()
                return
            }
            connectSession(phone)
            res.writeHead(302, { 'Location': '/' })
            res.end()
        } else {
            currentPairing.error = 'Please enter a valid phone number (10-15 digits with country code).'
            res.writeHead(302, { 'Location': '/' })
            res.end()
        }
        return
    }

    if (url.pathname === '/pair/cancel') {
        if (currentPairing.phone && activeSessions.has(currentPairing.phone)) {
            const sess = activeSessions.get(currentPairing.phone)
            if (sess.socket && sess.status !== 'connected') {
                try { sess.socket.end(); } catch(e) {}
                activeSessions.delete(currentPairing.phone)
                try {
                    const sessDir = path.join(SESSIONS_DIR, currentPairing.phone)
                    if (fs.existsSync(sessDir)) fs.rmSync(sessDir, { recursive: true, force: true })
                } catch(e) {}
            }
        }
        currentPairing = { phone: null, code: null, status: 'idle', error: '' }
        res.writeHead(302, { 'Location': '/' })
        res.end()
        return
    }

    if (url.pathname === '/session/remove' && url.searchParams.get('phone')) {
        const cookies = parseCookies(req.headers.cookie || '')
        if (cookies.admin_token !== ADMIN_KEY) {
            res.writeHead(302, { 'Location': '/admin/login' })
            res.end()
            return
        }
        const phone = url.searchParams.get('phone').replace(/[^0-9]/g, '')
        if (activeSessions.has(phone)) {
            const sess = activeSessions.get(phone)
            if (sess.socket) {
                try { sess.socket.end(); } catch(e) {}
            }
            activeSessions.delete(phone)
        }
        try {
            const sessDir = path.join(SESSIONS_DIR, phone)
            if (fs.existsSync(sessDir)) fs.rmSync(sessDir, { recursive: true, force: true })
        } catch(e) {
            console.log('Session remove error:', e.message)
        }
        res.writeHead(302, { 'Location': '/' })
        res.end()
        return
    }

    if (url.pathname === '/status') {
        const cookies = parseCookies(req.headers.cookie || '')
        const isAdminReq = cookies.admin_token === ADMIN_KEY
        const connected = []
        for (const [phone, sess] of activeSessions) {
            if (sess.status === 'connected') connected.push({ phone, user: sess.connectedUser || phone })
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        if (isAdminReq) {
            res.end(JSON.stringify({
                connected,
                totalConnected: connected.length,
                pairing: currentPairing.status === 'pairing' ? { phone: currentPairing.phone, code: currentPairing.code } : null
            }))
        } else {
            res.end(JSON.stringify({
                totalConnected: connected.length,
                pairing: currentPairing.status === 'pairing' ? { status: 'in_progress' } : null
            }))
        }
        return
    }

    if (url.pathname === '/admin/login' && req.method === 'GET') {
        const token = url.searchParams.get('token')
        if (token === ADMIN_KEY) {
            res.writeHead(302, { 
                'Set-Cookie': `admin_token=${ADMIN_KEY}; Path=/; HttpOnly; SameSite=Strict`,
                'Location': '/admin'
            })
            res.end()
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(getAdminLoginPage(token ? 'Invalid access token. Please try again.' : ''))
        }
        return
    }

    if (url.pathname === '/admin/logout') {
        res.writeHead(302, { 
            'Set-Cookie': 'admin_token=; Path=/; HttpOnly; Max-Age=0',
            'Location': '/'
        })
        res.end()
        return
    }

    if (url.pathname === '/admin') {
        const cookies = parseCookies(req.headers.cookie || '')
        if (cookies.admin_token !== ADMIN_KEY) {
            res.writeHead(302, { 'Location': '/admin/login' })
            res.end()
            return
        }
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(getAdminPage())
        return
    }

    if (url.pathname.startsWith('/api/admin/')) {
        const cookies = parseCookies(req.headers.cookie || '')
        if (cookies.admin_token !== ADMIN_KEY) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Unauthorized' }))
            return
        }
    }

    if (url.pathname === '/api/admin/users') {
        const users = loadUsersData()
        const today = new Date().toISOString().split('T')[0]
        const userList = Object.entries(users).map(([id, data]) => ({
            id,
            name: data.name || 'Unknown',
            firstSeen: data.firstSeen,
            lastSeen: data.lastSeen,
            commandCount: data.commandCount || 0,
            commands: data.commands || {},
            banned: data.banned || false
        })).sort((a, b) => (b.commandCount || 0) - (a.commandCount || 0))

        const activeToday = userList.filter(u => u.lastSeen && u.lastSeen.startsWith(today)).length
        const totalCommands = userList.reduce((sum, u) => sum + (u.commandCount || 0), 0)
        const bannedCount = userList.filter(u => u.banned).length

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
            users: userList,
            totalUsers: userList.length,
            activeToday,
            totalCommands,
            bannedCount
        }))
        return
    }

    if (url.pathname === '/api/admin/users/delete' && req.method === 'POST') {
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', () => {
            try {
                const { userId } = JSON.parse(body)
                if (userId && userId.includes('254748340864')) {
                    res.writeHead(403, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ error: 'Cannot delete admin' }))
                    return
                }
                const users = loadUsersData()
                if (users[userId]) {
                    delete users[userId]
                    saveUsersData(users)
                }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: true }))
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Invalid request' }))
            }
        })
        return
    }

    if (url.pathname === '/api/admin/users/ban' && req.method === 'POST') {
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', () => {
            try {
                const { userId } = JSON.parse(body)
                if (userId && userId.includes('254748340864')) {
                    res.writeHead(403, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ error: 'Cannot ban admin' }))
                    return
                }
                const users = loadUsersData()
                if (users[userId]) {
                    users[userId].banned = true
                    saveUsersData(users)
                }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: true }))
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Invalid request' }))
            }
        })
        return
    }

    if (url.pathname === '/api/admin/users/unban' && req.method === 'POST') {
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', () => {
            try {
                const { userId } = JSON.parse(body)
                const users = loadUsersData()
                if (users[userId]) {
                    users[userId].banned = false
                    saveUsersData(users)
                }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: true }))
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Invalid request' }))
            }
        })
        return
    }

    const cookies = parseCookies(req.headers.cookie || '')
    const isAdmin = cookies.admin_token === ADMIN_KEY
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(getStatusPage(isAdmin))
})

server.listen(PORT, '0.0.0.0', () => {
    console.log(`TOOSII-XD ULTRA status page running on port ${PORT}`)
})
//━━━━━━━━━━━━━━━━━━━━━━━━//
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Connection Bot - Multi-Session

async function connectSession(phone) {
try {
const sessionDir = path.join(SESSIONS_DIR, phone)
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true })

if (!activeSessions.has(phone) || activeSessions.get(phone).status !== 'connected') {
    currentPairing = { phone, code: null, status: 'connecting', error: '' }
}
activeSessions.set(phone, { socket: null, status: 'connecting', connectedUser: phone })

const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
const X = makeWASocket({
logger: pino({ level: "silent" }),
printQRInTerminal: false,
auth: state,
connectTimeoutMs: 60000,
defaultQueryTimeoutMs: 0,
keepAliveIntervalMs: 10000,
emitOwnEvents: true,
fireInitQueries: true,
generateHighQualityLinkPreview: false,
syncFullHistory: false,
markOnlineOnConnect: true,
browser: ["Ubuntu", "Chrome", "20.0.04"],
msgRetryCounterCache: msgRetryCache,
getMessage: async (key) => {
    if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id)
        return msg?.message || undefined
    }
    return { conversation: '' }
},
});

activeSessions.set(phone, { socket: X, status: 'connecting', connectedUser: phone })

if (X.ws) {
    X.ws.on('error', (err) => {
        console.log(`[${phone}] WebSocket error (handled):`, err.message || err)
    })
}
X.ev.on('CB:error', () => {})

if (!X.authState.creds.registered) {
    console.log(`[${phone}] Waiting for WebSocket handshake...`)
    currentPairing.status = 'connecting'
    await new Promise(resolve => setTimeout(resolve, 5000))
    console.log(`[${phone}] Requesting pairing code...`)
    let retries = 0
    const maxRetries = 3
    let paired = false
    while (retries < maxRetries && !paired) {
        try {
            currentPairing.status = 'pairing'
            let code = await X.requestPairingCode(phone);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            currentPairing.code = code
            console.log(`[${phone}] Pairing Code: ${code}`);
            paired = true
        } catch (err) {
            retries++
            console.error(`[${phone}] Pairing attempt ${retries}/${maxRetries} failed:`, err.message || err)
            if (retries < maxRetries) {
                console.log(`[${phone}] Retrying in 3 seconds...`)
                await new Promise(resolve => setTimeout(resolve, 3000))
            }
        }
    }
    if (!paired) {
        console.error(`[${phone}] All pairing attempts failed`)
        currentPairing = { phone: null, code: null, status: 'idle', error: 'Failed to generate pairing code. Please try again.' }
        activeSessions.delete(phone)
        try { X.end(); } catch(e) {}
        try {
            const sessDir = path.join(SESSIONS_DIR, phone)
            if (fs.existsSync(sessDir)) fs.rmSync(sessDir, { recursive: true, force: true })
        } catch(e) {}
        return
    }
} else {
    console.log(`[${phone}] Reconnecting existing session...`)
}

store.bind(X.ev)

X.ev.on('messages.upsert', async chatUpdate => {
try {
mek = chatUpdate.messages[0]
if (!mek.message) return
mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
if (mek.key && mek.key.remoteJid === 'status@broadcast') {
    if (!mek.key.fromMe) {
        try {
            if (global.autoViewStatus) {
                await X.readMessages([mek.key])
                console.log(`[${phone}] Auto-viewed status from ${mek.key.participant || mek.key.remoteJid}`)
            }
            if (global.autoLikeStatus && global.autoLikeEmoji) {
                await X.sendMessage('status@broadcast', {
                    react: { text: global.autoLikeEmoji, key: mek.key }
                }, { statusJidList: [mek.key.participant || mek.key.remoteJid] })
                console.log(`[${phone}] Auto-liked status from ${mek.key.participant || mek.key.remoteJid} with ${global.autoLikeEmoji}`)
            }
            if (global.autoReplyStatus && global.autoReplyStatusMsg) {
                let statusPoster = mek.key.participant || mek.key.remoteJid
                try {
                    await X.sendMessage(statusPoster, { text: global.autoReplyStatusMsg })
                    console.log(`[${phone}] Auto-replied to status from ${statusPoster}`)
                } catch (arErr) {
                    console.log(`[${phone}] Auto-reply status error:`, arErr.message || arErr)
                }
            }
            if (global.antiStatusMention) {
                try {
                    let msgContent2 = mek.message
                    let mentionedJids = []
                    let ct = Object.keys(msgContent2)[0]
                    if (msgContent2[ct] && msgContent2[ct].contextInfo && msgContent2[ct].contextInfo.mentionedJid) {
                        mentionedJids = msgContent2[ct].contextInfo.mentionedJid
                    }
                    let botJid = X.decodeJid(X.user.id)
                    let mentioner = (mek.key.participant || mek.key.remoteJid).split('@')[0]
                    let ownerJid2 = global.owner[0] + '@s.whatsapp.net'
                    let statusText = ''
                    if (msgContent2[ct]) {
                        statusText = msgContent2[ct].text || msgContent2[ct].caption || ''
                    }
                    if (mentionedJids.includes(botJid)) {
                        await X.sendMessage(ownerJid2, { text: `*Status Mention Alert*\n\n+${mentioner} mentioned you in their status.` })
                        console.log(`[${phone}] Status mention detected from ${mentioner}`)
                    }
                    let groupMentioned = mentionedJids.filter(jid => jid.endsWith('@g.us'))
                    let mentionerJid = mentioner + '@s.whatsapp.net'
                    let asmAction = global.antiStatusMentionAction || 'warn'
                    if (groupMentioned.length > 0) {
                        for (let gJid of groupMentioned) {
                            let groupName = gJid
                            try {
                                let gMeta = await X.groupMetadata(gJid)
                                groupName = gMeta.subject || gJid
                                let isMember = gMeta.participants.some(p => p.id.includes(mentioner))
                                let botIsAdmin2 = gMeta.participants.some(p => {
                                    let pNum = p.id.split('@')[0]
                                    let botNum2 = (X.user.id || '').split(':')[0].split('@')[0]
                                    return (pNum === botNum2 || p.id === X.user.id) && (p.admin === 'admin' || p.admin === 'superadmin')
                                })
                                let isOwnerMention = global.owner.includes(mentioner)
                                if (isMember && botIsAdmin2 && !isOwnerMention) {
                                    if (asmAction === 'kick') {
                                        await X.groupParticipantsUpdate(gJid, [mentionerJid], 'remove')
                                        await X.sendMessage(gJid, { text: `*@${mentioner} has been removed for mentioning this group in their status.*`, mentions: [mentionerJid] })
                                        await X.sendMessage(ownerJid2, { text: `*Anti-Status Action: KICKED*\n+${mentioner} was removed from "${groupName}" for mentioning the group in their status.` })
                                    } else if (asmAction === 'delete') {
                                        await X.sendMessage(gJid, { text: `*Warning: @${mentioner} mentioned this group in their status.*\nTheir messages will be monitored.`, mentions: [mentionerJid] })
                                        await X.sendMessage(ownerJid2, { text: `*Anti-Status Action: ALERT*\n+${mentioner} mentioned "${groupName}" in their status. Warning sent to group.` })
                                    } else {
                                        const warnDbPath2 = path.join(__dirname, 'database', 'warnings.json')
                                        let warnDb2 = {}
                                        try { warnDb2 = JSON.parse(fs.readFileSync(warnDbPath2, 'utf-8')) } catch { warnDb2 = {} }
                                        let gWarns = warnDb2[gJid] || {}
                                        let uWarns = gWarns[mentionerJid] || []
                                        uWarns.push({ reason: 'Mentioned group in WhatsApp status', time: new Date().toISOString(), by: 'bot-auto' })
                                        gWarns[mentionerJid] = uWarns
                                        warnDb2[gJid] = gWarns
                                        fs.writeFileSync(warnDbPath2, JSON.stringify(warnDb2, null, 2))
                                        let wCount = uWarns.length
                                        let maxW = 3
                                        if (wCount >= maxW) {
                                            await X.groupParticipantsUpdate(gJid, [mentionerJid], 'remove')
                                            gWarns[mentionerJid] = []
                                            warnDb2[gJid] = gWarns
                                            fs.writeFileSync(warnDbPath2, JSON.stringify(warnDb2, null, 2))
                                            await X.sendMessage(gJid, { text: `*@${mentioner} reached ${maxW}/${maxW} warnings and has been removed.*\nReason: Mentioning group in status.`, mentions: [mentionerJid] })
                                            await X.sendMessage(ownerJid2, { text: `*Anti-Status Action: WARNED & KICKED*\n+${mentioner} reached max warnings in "${groupName}" and was removed.` })
                                        } else {
                                            await X.sendMessage(gJid, { text: `*Warning ${wCount}/${maxW} for @${mentioner}*\nReason: Mentioning this group in WhatsApp status.\n_${maxW - wCount} more warning(s) before removal._`, mentions: [mentionerJid] })
                                            await X.sendMessage(ownerJid2, { text: `*Anti-Status Action: WARNED*\n+${mentioner} warned (${wCount}/${maxW}) in "${groupName}" for mentioning the group in their status.` })
                                        }
                                    }
                                } else {
                                    await X.sendMessage(ownerJid2, { text: `*Group Mention in Status*\n\n+${mentioner} mentioned "${groupName}" in their status.${!botIsAdmin2 ? '\n_Bot is not admin in this group, no action taken._' : ''}${isOwnerMention ? '\n_Owner is protected, no action taken._' : ''}` })
                                }
                            } catch (gErr) {
                                await X.sendMessage(ownerJid2, { text: `*Group Mention in Status*\n+${mentioner} mentioned a group in their status.\nGroup: ${gJid}` })
                            }
                        }
                        console.log(`[${phone}] Group mention in status from ${mentioner} - action: ${asmAction}`)
                    }
                    let linkMatch2 = statusText.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/g)
                    if (linkMatch2 && linkMatch2.length > 0) {
                        await X.sendMessage(ownerJid2, { text: `*Group Link in Status*\n\n+${mentioner} shared a group link in their status:\n${linkMatch2.map(l => '• https://' + l).join('\n')}` })
                        console.log(`[${phone}] Group link in status from ${mentioner}`)
                    }
                } catch (smErr) {
                    console.log(`[${phone}] Anti-status-mention error:`, smErr.message || smErr)
                }
            }
            if (global.statusToGroup) {
                let statusSender = mek.key.participant || mek.key.remoteJid
                let senderName = statusSender.split('@')[0]
                let msgContent = mek.message
                let contentType = Object.keys(msgContent)[0]
                let targetGroup = global.statusToGroup
                try {
                    if (contentType === 'imageMessage' && msgContent.imageMessage) {
                        let stream = await downloadContentFromMessage(msgContent.imageMessage, 'image')
                        let buffer = Buffer.from([])
                        for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]) }
                        let caption = msgContent.imageMessage.caption || ''
                        await X.sendMessage(targetGroup, { image: buffer, caption: `*Status from +${senderName}*\n${caption}` })
                    } else if (contentType === 'videoMessage' && msgContent.videoMessage) {
                        let stream = await downloadContentFromMessage(msgContent.videoMessage, 'video')
                        let buffer = Buffer.from([])
                        for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]) }
                        let caption = msgContent.videoMessage.caption || ''
                        await X.sendMessage(targetGroup, { video: buffer, caption: `*Status from +${senderName}*\n${caption}` })
                    } else if (contentType === 'extendedTextMessage' && msgContent.extendedTextMessage) {
                        let statusText = msgContent.extendedTextMessage.text || ''
                        await X.sendMessage(targetGroup, { text: `*Status from +${senderName}*\n\n${statusText}` })
                    } else if (contentType === 'conversation') {
                        await X.sendMessage(targetGroup, { text: `*Status from +${senderName}*\n\n${msgContent.conversation}` })
                    }
                    console.log(`[${phone}] Forwarded status from ${senderName} to group`)
                } catch (fwdErr) {
                    console.log(`[${phone}] Status forward error:`, fwdErr.message || fwdErr)
                }
            }
        } catch (err) {
            console.log(`[${phone}] Auto status action error:`, err.message || err)
        }
    }
    return
}
if (!X.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return
let msgId = mek.key.id
if (processedMsgs.has(msgId)) return
processedMsgs.add(msgId)
if (processedMsgs.size > 5000) {
    let iter = processedMsgs.values()
    for (let i = 0; i < 2000; i++) { processedMsgs.delete(iter.next().value) }
}
if (global.autoRead && !mek.key.fromMe) {
    try { await X.readMessages([mek.key]) } catch {}
}
if (global.antiLink && mek.message && !mek.key.fromMe) {
    let chat = mek.key.remoteJid
    if (chat && chat.endsWith('@g.us')) {
        let msgBody = ''
        if (mek.message.conversation) msgBody = mek.message.conversation
        else if (mek.message.extendedTextMessage) msgBody = mek.message.extendedTextMessage.text || ''
        else if (mek.message.imageMessage) msgBody = mek.message.imageMessage.caption || ''
        else if (mek.message.videoMessage) msgBody = mek.message.videoMessage.caption || ''
        let linkRegex = /https?:\/\/[^\s]+|wa\.me\/[^\s]+|chat\.whatsapp\.com\/[^\s]+/gi
        if (linkRegex.test(msgBody)) {
            let senderJid = mek.key.participant || mek.key.remoteJid
            let ownerNum = global.owner[0] + '@s.whatsapp.net'
            let senderNum = senderJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
            let isOwnr = global.owner.includes(senderNum) || mek.key.fromMe
            if (!isOwnr) {
                try {
                    let groupMeta = await X.groupMetadata(chat)
                    let botId = X.decodeJid(X.user.id)
                    let isBotAdmin = groupMeta.participants.some(p => X.decodeJid(p.id) === botId && (p.admin === 'admin' || p.admin === 'superadmin'))
                    if (isBotAdmin) {
                        await X.sendMessage(chat, { delete: mek.key })
                        await X.sendMessage(chat, { text: `*Anti-Link*\n@${senderNum}, links are not allowed in this group.`, mentions: [senderJid] })
                    }
                } catch {}
            }
        }
    }
}
m = smsg(X, mek, store)
require("./client")(X, m, chatUpdate, store)
} catch (err) {
console.log(err)
}
})

X.decodeJid = (jid) => {
if (!jid) return jid
if (/:\d+@/gi.test(jid)) {
let decode = jidDecode(jid) || {}
return decode.user && decode.server && decode.user + '@' + decode.server || jid
} else return jid
}

X.getName = (jid, withoutContact= false) => {
id = X.decodeJid(jid)
withoutContact = X.withoutContact || withoutContact 
let v
if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
v = store.contacts[id] || {}
if (!(v.name || v.subject)) v = X.groupMetadata(id) || {}
resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
})
else v = id === '0@s.whatsapp.net' ? {
id,
name: 'WhatsApp'
} : id === X.decodeJid(X.user.id) ?
X.user :
(store.contacts[id] || {})
return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
}

X.public = true 

X.serializeM = (m) => smsg(X, m, store);
X.ev.on('connection.update', (update) => {
const { connection, lastDisconnect } = update;
if (connection === "close") {
let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
if (reason === DisconnectReason.badSession) {
console.log(`[${phone}] Session file corrupted`);
if (activeSessions.has(phone)) activeSessions.get(phone).status = 'disconnected'
  } else if (reason === DisconnectReason.connectionClosed) {
console.log(`[${phone}] Connection closed, reconnecting...`);
if (activeSessions.has(phone)) activeSessions.get(phone).status = 'reconnecting'
setTimeout(() => connectSession(phone), 3000);
  } else if (reason === DisconnectReason.connectionLost) {
console.log(`[${phone}] Connection lost, reconnecting...`);
if (activeSessions.has(phone)) activeSessions.get(phone).status = 'reconnecting'
setTimeout(() => connectSession(phone), 3000);
  } else if (reason === DisconnectReason.connectionReplaced) {
console.log(`[${phone}] Connection replaced`);
if (activeSessions.has(phone)) activeSessions.get(phone).status = 'disconnected'
  } else if (reason === DisconnectReason.loggedOut) {
console.log(`[${phone}] Device logged out, removing session`);
activeSessions.delete(phone)
try {
    const sessDir = path.join(SESSIONS_DIR, phone)
    if (fs.existsSync(sessDir)) fs.rmSync(sessDir, { recursive: true, force: true })
} catch(e) {}
  } else if (reason === DisconnectReason.restartRequired) {
console.log(`[${phone}] Restart required, reconnecting...`);
connectSession(phone);
  } else if (reason === DisconnectReason.timedOut) {
console.log(`[${phone}] Connection timed out, reconnecting...`);
if (activeSessions.has(phone)) activeSessions.get(phone).status = 'reconnecting'
setTimeout(() => connectSession(phone), 3000);
  } else {
console.log(`[${phone}] Unknown DisconnectReason: ${reason}|${connection}`);
setTimeout(() => connectSession(phone), 5000);
  }
} else if (connection === "open") {
const connUser = X.user?.id?.split(':')[0] || phone
activeSessions.set(phone, { socket: X, status: 'connected', connectedUser: connUser })
if (currentPairing.phone === phone) {
    currentPairing = { phone: null, code: null, status: 'idle', error: '' }
}
try {
X.newsletterFollow('120363299254074394@newsletter')
} catch (e) {}
try {
X.groupAcceptInvite('CwNhH3QNvrVFdcKNgaKg4g')
console.log(`[${phone}] Auto-joined WhatsApp group`)
} catch (e) {
console.log(`[${phone}] Could not auto-join group:`, e.message || e)
}
const connectedJid = X.user.id.replace(/:.*@/, '@')
X.sendMessage(connectedJid, {text: `\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\u2502  *TOOSII-XD ULTRA*\n\u2502  _WhatsApp Multi-Device Bot_\n\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n\u2705 *Connection Successful!*\n\n\u250F\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\u2503 *User:* ${connUser}\n\u2503 *Status:* Active & Online\n\u2503 *Bot:* TOOSII-XD ULTRA v2.0\n\u2517\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n\u25B8 Type *.menu* to view all commands\n\u25B8 Type *.help* for quick assistance\n\n\u250F\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\u2503 *Join Our Community*\n\u2503 https://chat.whatsapp.com/CwNhH3QNvrVFdcKNgaKg4g\n\u2517\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n_Powered by Toosii Tech_\n_wa.me/254748340864_`})
console.log(`[${phone}] Connected: ${JSON.stringify(X.user.id)}`);
}
});

X.ev.on('creds.update', saveCreds)

X.sendText = (jid, text, quoted = '', options) => X.sendMessage(jid, { text: text, ...options }, { quoted })

X.sendFile = async (jid, path, filename = '', caption = '', quoted, ptt = false, options = {}) => {
        let type = await X.getFile(path, true)
        let {
            res,
            data: file,
            filename: pathFile
        } = type
        if (res && res.status !== 200 || file.length <= 65536) {
            try {
                throw {
                    json: JSON.parse(file.toString())
                }
            }
            catch (e) {
                if (e.json) throw e.json
            }
        }
        let opt = {
            filename
        }
        if (quoted) opt.quoted = quoted
        if (!type) options.asDocument = true
        let mtype = '',
            mimetype = type.mime,
            convert
        if (/webp/.test(type.mime) || (/image/.test(type.mime) && options.asSticker)) mtype = 'sticker'
        else if (/image/.test(type.mime) || (/webp/.test(type.mime) && options.asImage)) mtype = 'image'
        else if (/video/.test(type.mime)) mtype = 'video'
        else if (/audio/.test(type.mime))(
            convert = await (ptt ? toPTT : toAudio)(file, type.ext),
            file = convert.data,
            pathFile = convert.filename,
            mtype = 'audio',
            mimetype = 'audio/ogg; codecs=opus'
        )
        else mtype = 'document'
        if (options.asDocument) mtype = 'document'

        delete options.asSticker
        delete options.asLocation
        delete options.asVideo
        delete options.asDocument
        delete options.asImage

        let message = {
            ...options,
            caption,
            ptt,
            [mtype]: {
                url: pathFile
            },
            mimetype
        }
        let m
        try {
            m = await X.sendMessage(jid, message, {
                ...opt,
                ...options
            })
        }
        catch (e) {
            m = null
        }
        finally {
            if (!m) m = await X.sendMessage(jid, {
                ...message,
                [mtype]: file
            }, {
                ...opt,
                ...options
            })
            file = null
            return m
        }
    }
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Welcome Setting

    X.ev.on('group-participants.update', async (anu) => {
        if (global.welcome){
console.log(anu)
try {
let metadata = await X.groupMetadata(anu.id)
let participants = anu.participants
for (let num of participants) {
try {
ppuser = await X.profilePictureUrl(num, 'image')
} catch (err) {
ppuser = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png?q=60'
}
try {
ppgroup = await X.profilePictureUrl(anu.id, 'image')
} catch (err) {
ppgroup = 'https://i.ibb.co/RBx5SQC/avatar-group-large-v2.png?q=60'
}
memb = metadata.participants.length
groupwelcome = await getBuffer(ppuser)
groupleft = await getBuffer(ppuser)
                if (anu.action == 'add') {
                const Xbuffer = await getBuffer(ppuser)
                let XName = num
                    const members = metadata.participants.length
                Xbody = `
┏──────────────────────⏣ 
@${XName.split("@")[0]}
┣──────────────────────⏣
┣⛩️•   𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 
┣${metadata.subject}
┣⛩️•   𝗠𝗲𝗺𝗯𝗲𝗿 : 
┣${members}th
└───────────────┈ ⳹`
X.sendMessage(anu.id,
 { text: Xbody,
 contextInfo:{
 mentionedJid:[num],
 "externalAdReply": {"showAdAttribution": true,
 "containsAutoReply": true,
 "title": ` ${global.botname}`,
"body": `${ownername}`,
 "previewType": "PHOTO",
"thumbnailUrl": ``,
"thumbnail": groupwelcome,
"sourceUrl": `${wagc}`}}})
                } else if (anu.action == 'remove') {
                        const Xbuffer = await getBuffer(ppuser)
                        let XName = num
                    const Xmembers = metadata.participants.length
                    Xbody = `
┏──────────────────────⏣ 
┣@${XName.split("@")[0]}
┣──────────────────────⏣
┣⛩️•   𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 
┣${metadata.subject}
┣⛩️•   𝗠𝗲𝗺𝗯𝗲𝗿 : 
┣${members}th
└───────────────┈ ⳹`
X.sendMessage(anu.id,
 { text: Xbody,
 contextInfo:{
 mentionedJid:[num],
 "externalAdReply": {"showAdAttribution": true,
 "containsAutoReply": true,
 "title": ` ${global.botname}`,
"body": `${ownername}`,
 "previewType": "PHOTO",
"thumbnailUrl": ``,
"thumbnail": groupleft,
"sourceUrl": `${wagc}`}}})
}
}
} catch (err) {
console.log(err)
}
}
})
//━━━━━━━━━━━━━━━━━━━━━━━//
    X.ev.on('group-participants.update', async (anu) => {
        if (global.adminevent){
console.log(anu)
try {
let participants = anu.participants
for (let num of participants) {
try {
ppuser = await X.profilePictureUrl(num, 'image')
} catch (err) {
ppuser = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png?q=60'
}
try {
ppgroup = await X.profilePictureUrl(anu.id, 'image')
} catch (err) {
ppgroup = 'https://i.ibb.co/RBx5SQC/avatar-group-large-v2.png?q=60'
}
 if (anu.action == 'promote') {
let XName = num
Xbody = ` 
━━━━━━━━━━━━━━━━━━━━━
         *[ PROMOTE ]*
@${XName.split("@")[0]}, Congratulations! You are now an *Admin*
━━━━━━━━━━━━━━━━━━━━━`
   X.sendMessage(anu.id,
 { text: Xbody,
 contextInfo:{
 mentionedJid:[num],
 "externalAdReply": {"showAdAttribution": true,
 "containsAutoReply": true,
 "title": ` ${global.botname}`,
"body": `${ownername}`,
 "previewType": "PHOTO",
"thumbnailUrl": ``,
"thumbnail": groupwelcome,
"sourceUrl": `${wagc}`}}})
} else if (anu.action == 'demote') {
let XName = num
Xbody = `
━━━━━━━━━━━━━━━━━━━━━
         *[ DEMOTE ]*
@${XName.split("@")[0]}, You have been *demoted* from admin
━━━━━━━━━━━━━━━━━━━━━`
X.sendMessage(anu.id,
 { text: Xbody,
 contextInfo:{
 mentionedJid:[num],
 "externalAdReply": {"showAdAttribution": true,
 "containsAutoReply": true,
 "title": ` ${global.botname}`,
"body": `${ownername}`,
 "previewType": "PHOTO",
"thumbnailUrl": ``,
"thumbnail": groupleft,
"sourceUrl": `${wagc}`}}})
}
}
} catch (err) {
console.log(err)
}
}
})
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Anti-Call Handler
X.ev.on('call', async (callData) => {
    if (!global.antiCall) return
    try {
        let calls = Array.isArray(callData) ? callData : [callData]
        for (let call of calls) {
            if (call.status === 'offer') {
                let callerId = call.from
                await X.rejectCall(call.id, call.from)
                await X.sendMessage(callerId, {
                    text: `*Anti-Call Active*\nCalls are not allowed. Please send a message instead.\n\n_This is an automated response from ${global.botname}_`
                })
                console.log(`[Anti-Call] Rejected call from ${callerId}`)
            }
        }
    } catch (err) {
        console.log('[Anti-Call] Error:', err.message || err)
    }
})
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Anti-Delete Handler
X.ev.on('messages.update', async (updates) => {
    if (!global.antiDelete) return
    try {
        for (let update of updates) {
            if (update.update && (update.update.messageStubType === proto.WebMessageInfo.StubType.REVOKE || update.update.messageStubType === 1)) {
                let chat = update.key.remoteJid
                let senderJid = update.key.participant || update.key.remoteJid
                let senderNum = senderJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
                let ownerJid = global.owner[0] + '@s.whatsapp.net'
                try {
                    let msgStore = store
                    if (msgStore && msgStore.messages && msgStore.messages[chat]) {
                        let msgs = msgStore.messages[chat]
                        let deletedMsg = msgs.array ? msgs.array.find(m => m.key.id === update.key.id) : null
                        if (deletedMsg && deletedMsg.message) {
                            let delType = getContentType(deletedMsg.message)
                            let delBody = deletedMsg.message.conversation || 
                                         (deletedMsg.message.extendedTextMessage && deletedMsg.message.extendedTextMessage.text) ||
                                         (deletedMsg.message.imageMessage && deletedMsg.message.imageMessage.caption) ||
                                         (deletedMsg.message.videoMessage && deletedMsg.message.videoMessage.caption) || ''
                            let notifText = `*Anti-Delete Detected*\n\nFrom: @${senderNum}\nChat: ${chat}\nType: ${delType}\n${delBody ? 'Content: ' + delBody : ''}`
                            await X.sendMessage(ownerJid, { text: notifText, mentions: [senderJid] })
                            if (deletedMsg.message.imageMessage || deletedMsg.message.videoMessage || deletedMsg.message.audioMessage || deletedMsg.message.documentMessage) {
                                try {
                                    await X.sendMessage(ownerJid, { forward: deletedMsg })
                                } catch {}
                            }
                        } else {
                            await X.sendMessage(ownerJid, { text: `*Anti-Delete*\n@${senderNum} deleted a message in ${chat}`, mentions: [senderJid] })
                        }
                    } else {
                        await X.sendMessage(ownerJid, { text: `*Anti-Delete*\n@${senderNum} deleted a message in ${chat}`, mentions: [senderJid] })
                    }
                } catch (e) {
                    console.log('[Anti-Delete] Store error:', e.message || e)
                }
            }
        }
    } catch (err) {
        console.log('[Anti-Delete] Error:', err.message || err)
    }
})
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Auto Bio Handler
let autoBioInterval = null
function startAutoBio() {
    if (autoBioInterval) clearInterval(autoBioInterval)
    autoBioInterval = setInterval(async () => {
        if (!global.autoBio) return
        try {
            let tz = global.botTimezone || 'Africa/Nairobi'
            let timeStr = moment().tz(tz).format('HH:mm:ss')
            let dateStr = moment().tz(tz).format('DD/MM/YYYY')
            await X.updateProfileStatus(`${global.botname} | ${timeStr} | ${dateStr}`)
        } catch (err) {
            console.log('[Auto-Bio] Error:', err.message || err)
        }
    }, 60000)
}
startAutoBio()
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Message Types
X.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
let quoted = message.msg ? message.msg : message
let mime = (message.msg || message).mimetype || ''
let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
const stream = await downloadContentFromMessage(quoted, messageType)
let buffer = Buffer.from([])
for await(const chunk of stream) {
buffer = Buffer.concat([buffer, chunk])
}
let type = await FileType.fromBuffer(buffer)
let trueFileName = attachExtension ? ('./tmp/' + filename + '.' + type.ext) : './tmp/' + filename
await fs.writeFileSync(trueFileName, buffer)
return trueFileName
}

X.sendStickerFromUrl = async(from, PATH, quoted, options = {}) => {
let { writeExif } = require('./tmp')
let types = await X.getFile(PATH, true)
let { filename, size, ext, mime, data } = types
let type = '', mimetype = mime, pathFile = filename
let media = { mimetype: mime, data }
pathFile = await writeExif(media, { packname: options.packname ? options.packname : packname, author: options.author ? options.author : '254748340864', categories: options.categories ? options.categories : [] })
await fs.promises.unlink(filename)
await X.sendMessage(from, {sticker: {url: pathFile}}, {quoted})
return fs.promises.unlink(pathFile)
}

X.sendTextWithMentions = async (jid, text, quoted, options = {}) => X.sendMessage(jid, { text: text, mentions: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net'), ...options }, { quoted })

X.downloadMediaMessage = async (message) => {
let mime = (message.msg || message).mimetype || ''
let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
const stream = await downloadContentFromMessage(message, messageType)
let buffer = Buffer.from([])
for await(const chunk of stream) {
buffer = Buffer.concat([buffer, chunk])
}
return buffer
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
X.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
let buffer
if (options && (options.packname || options.author)) {
buffer = await writeExifImg(buff, options)
} else {
buffer = await imageToWebp(buff)}
await X.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
return buffer}

X.sendImageAsStickerAV = async (jid, path, quoted, options = {}) => {
let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
let buffer
if (options && (options.packname || options.author)) {
buffer = await writeExifImgAV(buff, options)
} else {
buffer = await imageToWebp2(buff)}
await X.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
return buffer}

X.sendImageAsStickerAvatar = async (jid, path, quoted, options = {}) => {
let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
let buffer
if (options && (options.packname || options.author)) {
buffer = await writeExifImg(buff, options)
} else {
buffer = await imageToWebp3(buff)}
await X.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
return buffer}
 //————————————————————————— [ Toosii Tech ] —————————————————————————\\
X.sendVideoAsSticker = async (jid, path, quoted, options = {}) => {
let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
let buffer
if (options && (options.packname || options.author)) {
buffer = await writeExifVid(buff, options)
} else {
buffer = await videoToWebp(buff)}
await X.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
return buffer}
//━━━━━━━━━━━━━━━━━━━━━━━━//
//━━━━━━━━━━━━━━━━━━━━━━━━//

return X
} catch (err) {
console.error(`[${phone}] Error in connectSession:`, err.message || err)
if (currentPairing.phone === phone) {
    currentPairing = { phone: null, code: null, status: 'idle', error: 'Connection error. Please try again.' }
}
activeSessions.delete(phone)
}
}

async function startAllSessions() {
    try {
        const dirs = fs.readdirSync(SESSIONS_DIR).filter(d => {
            const fullPath = path.join(SESSIONS_DIR, d)
            return fs.statSync(fullPath).isDirectory() && fs.readdirSync(fullPath).length > 0
        })
        if (dirs.length === 0) {
            console.log('No existing sessions found. Waiting for a number from the web interface...')
            return
        }
        console.log(`Found ${dirs.length} existing session(s): ${dirs.join(', ')}`)
        for (const phone of dirs) {
            console.log(`Reconnecting session: ${phone}`)
            currentPairing = { phone: null, code: null, status: 'idle', error: '' }
            await connectSession(phone)
            await new Promise(r => setTimeout(r, 2000))
        }
    } catch (err) {
        console.error('Error starting sessions:', err)
    }
}

startAllSessions()

function smsg(X, m, store) {
if (!m) return m
let M = proto.WebMessageInfo
if (m.key) {
m.id = m.key.id
m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16
m.chat = m.key.remoteJid
m.fromMe = m.key.fromMe
m.isGroup = m.chat.endsWith('@g.us')
m.sender = X.decodeJid(m.fromMe && X.user.id || m.participant || m.key.participant || m.chat || '')
if (m.isGroup) m.participant = X.decodeJid(m.key.participant) || ''
}
if (m.message) {
m.mtype = getContentType(m.message)
m.msg = (m.mtype == 'viewOnceMessage' ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)] : m.message[m.mtype])
m.body = m.message.conversation || (m.msg && m.msg.caption) || (m.msg && m.msg.text) || (m.mtype == 'listResponseMessage' && m.msg && m.msg.singleSelectReply && m.msg.singleSelectReply.selectedRowId) || (m.mtype == 'buttonsResponseMessage' && m.msg && m.msg.selectedButtonId) || (m.mtype == 'viewOnceMessage' && m.msg && m.msg.caption) || m.text
let quoted = m.quoted = (m.msg && m.msg.contextInfo) ? m.msg.contextInfo.quotedMessage : null
m.mentionedJid = (m.msg && m.msg.contextInfo) ? m.msg.contextInfo.mentionedJid : []
if (m.quoted) {
let type = getContentType(quoted)
m.quoted = m.quoted[type]
if (['productMessage'].includes(type)) {
type = getContentType(m.quoted)
m.quoted = m.quoted[type]
}
if (typeof m.quoted === 'string') m.quoted = {
text: m.quoted
}
m.quoted.mtype = type
m.quoted.id = m.msg.contextInfo.stanzaId
m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false
m.quoted.sender = X.decodeJid(m.msg.contextInfo.participant)
m.quoted.fromMe = m.quoted.sender === X.decodeJid(X.user.id)
m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ''
m.quoted.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
m.quoted.download = () => X.downloadMediaMessage(m.quoted)
m.getQuotedObj = m.getQuotedMessage = async () => {
if (!m.quoted.id) return false
let q = await store.loadMessage(m.chat, m.quoted.id, X)
 return exports.smsg(X, q, store)
}
let vM = m.quoted.fakeObj = M.fromObject({
key: {
remoteJid: m.quoted.chat,
fromMe: m.quoted.fromMe,
id: m.quoted.id
},
message: quoted,
...(m.isGroup ? { participant: m.quoted.sender } : {})
})
m.quoted.delete = () => X.sendMessage(m.quoted.chat, { delete: vM.key })
m.quoted.copyNForward = (jid, forceForward = false, options = {}) => X.copyNForward(jid, vM, forceForward, options)
}
}
if (m.msg.url) m.download = () => X.downloadMediaMessage(m.msg)
m.text = m.msg.text || m.msg.caption || m.message.conversation || m.msg.contentText || m.msg.selectedDisplayText || m.msg.title || ''
m.reply = (text, chatId = m.chat, options = {}) => Buffer.isBuffer(text) ? X.sendMedia(chatId, text, 'file', '', m, { ...options }) : X.sendText(chatId, text, m, { ...options })
m.copy = () => exports.smsg(X, M.fromObject(M.toObject(m)))
m.copyNForward = (jid = m.chat, forceForward = false, options = {}) => X.copyNForward(jid, m, forceForward, options)

return m
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
// File Update
let file = require.resolve(__filename)
fs.watchFile(file, () => {
fs.unwatchFile(file)
console.log(`Update File: ${__filename}`)
delete require.cache[file]
require(file)
})
