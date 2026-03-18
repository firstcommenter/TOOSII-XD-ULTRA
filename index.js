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
require('dotenv').config()          // ← FIX 1: load .env FIRST so SESSION_ID is available
require("./setting")

// ── Suppress libsignal / gifted-baileys internal session state dumps ──────────
// libsignal/session_record.js calls console.warn("Session already closed", session)
// where `session` is a large Signal crypto object full of Buffer dumps.
// We silence those specific warnings — all other console output is unaffected.
;(function suppressSignalNoise() {
    // ── Core noise-detection patterns ─────────────────────────────────────────
    const _NOISY_STRINGS = [
        '_chains','currentratchet','ephemeralkeypair','registrationid','rootkey',
        'indexinfo','basekeytype','senderkey','signedprekey','identitykey','prekey',
        'chainkey','chaintype','messagekeys','privkey','pubkey','remoteidentikey',
        'remoteidentitykey','previouscounter','lastsessionsaved','lastsynctime',
        'bad mac','session already','v1 session storage','no sessions',
        'failed to decrypt','session error','session_cipher','libsignal',
        'queue_job','nosuchsession','invalid prekey','invalid message','no senderkey',
        'closing open session','closing session','sessionentry','prekey bundle',
        'incoming prekey','open session in favor','privsenderkey','__signal_obj__'
    ]
    const _isNoisy = (s) => {
        const lower = (typeof s === 'string' ? s : String(s)).toLowerCase()
        return _NOISY_STRINGS.some(p => lower.includes(p))
    }
    const _serialize = (a) => {
        if (typeof a === 'string') return a
        if (a && typeof a === 'object') {
            const keys = Object.keys(a).join(' ').toLowerCase()
            if (_isNoisy(keys)) return '__signal_obj__'
            try { return JSON.stringify(a).slice(0, 600) } catch { return a?.message || a?.stack || '[object]' }
        }
        return a?.message || a?.stack || String(a)
    }
    const _noisy = (args) => {
        const combined = args.map(_serialize).join(' ')
        return _isNoisy(combined)
    }
    // ── Override console methods ───────────────────────────────────────────────
    const _origWarn  = console.warn.bind(console)
    const _origError = console.error.bind(console)
    const _origLog   = console.log.bind(console)
    console.warn  = (...args) => { if (!_noisy(args)) _origWarn(...args)  }
    console.error = (...args) => { if (!_noisy(args)) _origError(...args) }
    console.log   = (...args) => { if (!_noisy(args)) _origLog(...args)   }
    // ── Override process.stdout.write to catch pino & direct writes ───────────
    const _origStdout = process.stdout.write.bind(process.stdout)
    const _origStderr = process.stderr.write.bind(process.stderr)
    process.stdout.write = function(chunk, ...rest) {
        if (typeof chunk === 'string' && _isNoisy(chunk)) return true
        if (Buffer.isBuffer(chunk) && _isNoisy(chunk.toString())) return true
        return _origStdout(chunk, ...rest)
    }
    process.stderr.write = function(chunk, ...rest) {
        if (typeof chunk === 'string' && _isNoisy(chunk)) return true
        if (Buffer.isBuffer(chunk) && _isNoisy(chunk.toString())) return true
        return _origStderr(chunk, ...rest)
    }
})()

// Auto-inject OWNER_NUMBER from .env into global.owner
// Deployers only need to set OWNER_NUMBER in .env — no editing of setting.js needed
;(function autoInjectOwner() {
    const raw = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '').trim()
    if (!raw || raw.length < 7) return
    if (!global.owner) global.owner = []
    if (!global.owner.includes(raw)) {
        global.owner = [...new Set([...global.owner, raw])]
        console.log('[ TOOSII-XD ULTRA ] ✅ OWNER_NUMBER loaded from .env:', raw)
    }
})()
const { default: makeWASocket, DisconnectReason, Browsers, jidDecode, proto, getContentType, useMultiFileAuthState, downloadContentFromMessage, areJidsSameUser } = require("gifted-baileys")
const { makeInMemoryStore } = require('./library/lib/store')
const pino = require('pino')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const readline = require("readline");
const _ = require('lodash')
const yargs = require('yargs/yargs')
const PhoneNumber = require('awesome-phonenumber')
const FileType = require('file-type')
const path = require('path')
const fetch = require("node-fetch")
const moment = require('moment-timezone')  // ← FIX 2: missing import (needed by autoBio)
const { getBuffer } = require('./library/lib/myfunc')
const { imageToWebp, imageToWebp3, videoToWebp, writeExifImg, writeExifImgAV, writeExifVid } = require('./library/lib/exif')

const c = {
    r: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    white: '\x1b[37m',
    bgGreen: '\x1b[42m',
    bgCyan: '\x1b[46m',
    bgYellow: '\x1b[43m',
    bgRed: '\x1b[41m',
    bgMagenta: '\x1b[45m',
    bgBlue: '\x1b[44m',
}

process.on('uncaughtException', (err) => {
    let em = (err?.message || String(err)).toLowerCase()
    let es = (err?.stack || '').toLowerCase()
    let isSignal = (
        em.includes('no sessions') || em.includes('sessionerror') ||
        em.includes('bad mac') || em.includes('failed to decrypt') ||
        em.includes('no senderkey') || em.includes('invalid prekey') ||
        em.includes('invalid message') || em.includes('nosuchsession') ||
        es.includes('session_cipher') || es.includes('libsignal') || es.includes('queue_job')
    )
    if (isSignal) {
        // Fully silent — normal WhatsApp Signal protocol noise
    } else {
        console.error('[UncaughtException]', err.message || err)
    }
})
process.on('unhandledRejection', (err) => {
    let em = (err?.message || String(err)).toLowerCase()
    let es = (err?.stack || '').toLowerCase()
    let isSignal = (
        em.includes('no sessions') || em.includes('sessionerror') ||
        em.includes('bad mac') || em.includes('failed to decrypt') ||
        em.includes('no senderkey') || em.includes('invalid prekey') ||
        em.includes('invalid message') || em.includes('nosuchsession') ||
        es.includes('session_cipher') || es.includes('libsignal') || es.includes('queue_job')
    )
    if (isSignal) {
        // Fully silent — normal WhatsApp Signal protocol noise
    } else {
        console.error('[UnhandledRejection]', err?.message || err)
    }
})

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Startup owner sanity check — warn if no owner configured, never exit
const _bn = global.botname || 'TOOSII-XD ULTRA'
;(function _startupCheck() {
    if (!global.owner || global.owner.length === 0) {
        console.log('[ BOT ] ⚠️  No OWNER_NUMBER configured. Set OWNER_NUMBER in .env or setting.js')
    } else {
        console.log(`[ BOT ] ✅ Owner(s): ${global.owner.join(', ')}`)
    }
})()

// Initialize auto-status globals from setting.js / env vars (defaults: on)
global.autoViewStatus  = global.autoViewStatus  ?? (process.env.AUTO_VIEW_STATUS  !== 'no')
global.autoLikeStatus  = global.autoLikeStatus  ?? (process.env.AUTO_LIKE_STATUS  !== 'no')
global.autoReplyStatus = global.autoReplyStatus ?? (process.env.AUTO_REPLY_STATUS === 'yes')
global.autoLikeEmoji   = global.autoLikeEmoji   || (process.env.AUTO_LIKE_EMOJI   || '❤️')

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Session & State
const SESSIONS_DIR = path.join(__dirname, 'sessions')
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })

// Ensure runtime directories exist
;[
    path.join(__dirname, 'tmp'),
    path.join(__dirname, 'database'),
    path.join(__dirname, 'media'),
    path.join(__dirname, 'plugin'),
].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) })

// Auto-clean tmp directory — delete files older than 30 minutes every 15 minutes
const _tmpCleanDir = path.join(__dirname, 'tmp')
function _cleanTmpDir() {
    try {
        const _now = Date.now()
        const _files = fs.readdirSync(_tmpCleanDir)
        let _deleted = 0
        for (const _f of _files) {
            try {
                const _fp = path.join(_tmpCleanDir, _f)
                const _stat = fs.statSync(_fp)
                if (_now - _stat.mtimeMs > 30 * 60 * 1000) { // older than 30 min
                    fs.unlinkSync(_fp)
                    _deleted++
                }
            } catch {}
        }
        if (_deleted > 0) console.log(`[TMP CLEANUP] Deleted ${_deleted} stale file(s) from tmp/`)
    } catch {}
}
_cleanTmpDir()
setInterval(_cleanTmpDir, 15 * 60 * 1000) // every 15 minutes

const activeSessions = new Map()
const processedMsgs = new Set()
const msgRetryCache = new Map()

//━━━━━━━━━━━━━━━━━━━━━━━━//
// FIX 3: Auto-load SESSION_ID from .env on startup
// If SESSION_ID is set in .env, decode and save creds.json before connecting
function autoLoadSessionFromEnv() {
    const sessionId = process.env.SESSION_ID
    if (!sessionId || sessionId.trim() === '' || sessionId === 'PASTE_YOUR_TOOSII~_SESSION_HERE') return null

    const prefix = 'TOOSII~'
    let raw = sessionId.trim()

    try {
        let credsData
        // Handle TOOSII~ prefix
        if (raw.startsWith(prefix)) {
            raw = raw.slice(prefix.length)
        }
        // Try base64 decode first
        try {
            credsData = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
        } catch {
            // Try raw JSON
            credsData = JSON.parse(raw)
        }

        const sessionPhone = credsData.me?.id?.split(':')[0]?.split('@')[0] || 'imported_' + Date.now()
        const sessionDir = path.join(SESSIONS_DIR, sessionPhone)
        const credsPath = path.join(sessionDir, 'creds.json')

        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true })

        // Only write if creds.json doesn't already exist
        if (!fs.existsSync(credsPath)) {
            // Fresh SESSION_ID load - wipe stale signal sessions to prevent Bad MAC errors.
            // Old session files from a previous host cause Bad MAC decrypt failures on first messages.
            try {
                const _stale = fs.readdirSync(sessionDir).filter(f => f !== 'creds.json' && f.endsWith('.json'))
                _stale.forEach(f => { try { fs.unlinkSync(path.join(sessionDir, f)) } catch {} })
                if (_stale.length > 0) console.log('[ TOOSII-XD ULTRA ] Cleared ' + _stale.length + ' stale session file(s) - prevents Bad MAC errors')
            } catch {}
            fs.writeFileSync(credsPath, JSON.stringify(credsData, null, 2))
            console.log('[ TOOSII-XD ULTRA ] Session auto-loaded from .env for: ' + sessionPhone)
        } else {
            console.log(`${c.green}[ ${_bn} ]${c.r} ✅ Existing session found for: ${c.cyan}${sessionPhone}${c.r}`)
        }
        return sessionPhone
    } catch (err) {
        console.log(`${c.red}[ ${_bn} ] ❌ Failed to load SESSION_ID from .env: ${err.message}${c.r}`)
        return null
    }
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Console Login Interface

async function handleSessionLogin(sessionId) {
    if (!sessionId || sessionId.length < 10) {
        console.log(`[ ${_bn} ] Invalid Session ID. Too short.`)
        return
    }
    try {
        console.log(`[ ${_bn} ] Processing Session ID...`)
        let credsData
        try {
            let raw = sessionId.trim()
            if (raw.startsWith('TOOSII~')) raw = raw.slice('TOOSII~'.length)
            credsData = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
        } catch {
            try {
                credsData = JSON.parse(sessionId)
            } catch {
                console.log(`[ ${_bn} ] Invalid Session ID format. Must be base64 encoded or JSON.`)
                return
            }
        }
        const sessionPhone = credsData.me?.id?.split(':')[0]?.split('@')[0] || 'imported_' + Date.now()
        const sessionDir = path.join(SESSIONS_DIR, sessionPhone)
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true })
        fs.writeFileSync(path.join(sessionDir, 'creds.json'), JSON.stringify(credsData, null, 2))
        console.log(`[ ${_bn} ] Session ID saved for ${sessionPhone}`)
        console.log(`[ ${_bn} ] Connecting...`)
        await connectSession(sessionPhone)
    } catch (err) {
        console.log(`[ ${_bn} ] Error processing Session ID: ${err.message || err}`)
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
})

function waitForConsoleInput() {
    rl.once('line', async (input) => {
        const cmd = input.trim()
        if (cmd === '1') {
            console.log('')
            console.log(`${c.green}[ ${_bn} ]${c.r} ${c.white}Enter your WhatsApp number with country code${c.r}`)
            console.log(`${c.green}[ ${_bn} ]${c.r} ${c.dim}Example: ${c.cyan}254748340864${c.r} ${c.dim}(Kenya), ${c.cyan}2348012345678${c.r} ${c.dim}(Nigeria), ${c.cyan}12025551234${c.r} ${c.dim}(US)${c.r}`)
            console.log(`${c.green}[ ${_bn} ]${c.r} ${c.red}Do NOT include + or leading 0${c.r}`)
            console.log('')
            rl.once('line', async (phoneInput) => {
                const phone = phoneInput.trim().replace(/[^0-9]/g, '')
                if (phone.length < 10 || phone.length > 15) {
                    console.log(`${c.red}[ ${_bn} ] ✗ Invalid number. Must be 10-15 digits with country code.${c.r}`)
                    waitForConsoleInput()
                    return
                }
                if (phone.startsWith('0')) {
                    console.log(`${c.red}[ ${_bn} ] ✗ Do not start with 0. Use country code instead.${c.r}`)
                    waitForConsoleInput()
                    return
                }
                console.log(`${c.green}[ ${_bn} ]${c.r} ${c.cyan}Connecting with number: ${c.bold}${phone}${c.r}${c.cyan}...${c.r}`)
                await connectSession(phone)
                waitForConsoleInput()
            })
        } else if (cmd === '2') {
            console.log('')
            console.log(`${c.yellow}[ ${_bn} ]${c.r} ${c.white}Paste your Session ID below:${c.r}`)
            console.log('')
            rl.once('line', async (sessionInput) => {
                await handleSessionLogin(sessionInput.trim())
                waitForConsoleInput()
            })
        } else if (cmd === '3') {
            console.log(`${c.green}[ ${_bn} ]${c.r} ${c.dim}Skipped. Bot is running with existing sessions.${c.r}`)
            waitForConsoleInput()
        } else if (cmd.length >= 10 && /^[0-9]+$/.test(cmd)) {
            console.log(`${c.green}[ ${_bn} ]${c.r} Detected phone number: ${c.cyan}${c.bold}${cmd}${c.r}`)
            console.log(`${c.green}[ ${_bn} ]${c.r} ${c.cyan}Connecting...${c.r}`)
            await connectSession(cmd)
            waitForConsoleInput()
        } else if (cmd) {
            console.log(`${c.red}[ ${_bn} ] ✗ Unknown command: "${cmd}"${c.r}`)
            console.log(`${c.yellow}[ ${_bn} ]${c.r} Type ${c.green}${c.bold}1${c.r} for Pairing Code, ${c.yellow}${c.bold}2${c.r} for Session ID`)
            waitForConsoleInput()
        } else {
            waitForConsoleInput()
        }
    })
}

async function startBot() {
    console.log('')
    console.log(`${c.cyan}${c.bold}╔══════════════════════════════════════════╗${c.r}`)
    console.log(`${c.cyan}${c.bold}║${c.r}  ${c.green}${c.bold}⚡ TOOSII-XD ULTRA${c.r} ${c.yellow}v2.0.0${c.r}             ${c.cyan}${c.bold}║${c.r}`)
    console.log(`${c.cyan}${c.bold}║${c.r}  ${c.white}${c.bold}   WhatsApp Multi-Device Bot${c.r}          ${c.cyan}${c.bold}║${c.r}`)
    console.log(`${c.cyan}${c.bold}║${c.r}  ${c.magenta}     by Toosii Tech © 2024-2026${c.r}     ${c.cyan}${c.bold}║${c.r}`)
    console.log(`${c.cyan}${c.bold}╚══════════════════════════════════════════╝${c.r}`)
    console.log('')

    // ── FIX 3: Auto-connect from .env SESSION_ID ──────────────────────────────
    const envPhone = autoLoadSessionFromEnv()
    if (envPhone) {
        console.log(`${c.green}[ ${_bn} ]${c.r} ${c.dim}Auto-connecting session from .env...${c.r}`)
        console.log('')
        connectSession(envPhone)
        // In headless/cloud deployments stdin may not be a TTY — skip the
        // interactive prompt so the process doesn't hang waiting for input.
        if (process.stdin.isTTY) {
            console.log(`${c.cyan}${c.bold}┌─────────────────────────────────────────┐${c.r}`)
            console.log(`${c.cyan}${c.bold}│${c.r}  ${c.white}${c.bold}Add another session or skip:${c.r}            ${c.cyan}${c.bold}│${c.r}`)
            console.log(`${c.cyan}${c.bold}│${c.r}                                         ${c.cyan}${c.bold}│${c.r}`)
            console.log(`${c.cyan}${c.bold}│${c.r}  ${c.green}${c.bold}1)${c.r} ${c.white}Enter WhatsApp Number${c.r} ${c.dim}(Pairing Code)${c.r} ${c.cyan}${c.bold}│${c.r}`)
            console.log(`${c.cyan}${c.bold}│${c.r}  ${c.yellow}${c.bold}2)${c.r} ${c.white}Paste Session ID${c.r}                     ${c.cyan}${c.bold}│${c.r}`)
            console.log(`${c.cyan}${c.bold}│${c.r}  ${c.magenta}${c.bold}3)${c.r} ${c.white}Skip${c.r} ${c.dim}(already connected)${c.r}            ${c.cyan}${c.bold}│${c.r}`)
            console.log(`${c.cyan}${c.bold}└─────────────────────────────────────────┘${c.r}`)
            console.log('')
            waitForConsoleInput()
        } else {
            console.log(`${c.green}[ ${_bn} ]${c.r} ${c.dim}Headless mode — skipping interactive menu.${c.r}`)
        }
        return
    }

    // No .env session — check for existing sessions on disk
    const existingSessions = []
    if (fs.existsSync(SESSIONS_DIR)) {
        const dirs = fs.readdirSync(SESSIONS_DIR).filter(d => {
            const p = path.join(SESSIONS_DIR, d)
            return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'creds.json'))
        })
        existingSessions.push(...dirs)
    }

    if (existingSessions.length > 0) {
        console.log(`${c.green}[ ${_bn} ]${c.r} Found ${c.yellow}${c.bold}${existingSessions.length}${c.r} existing session(s): ${c.cyan}${existingSessions.join(', ')}${c.r}`)
        console.log(`${c.green}[ ${_bn} ]${c.r} ${c.dim}Reconnecting existing sessions...${c.r}`)
        console.log('')
        for (const phone of existingSessions) {
            connectSession(phone)
        }
        console.log('')
        console.log(`${c.cyan}${c.bold}┌─────────────────────────────────────────┐${c.r}`)
        console.log(`${c.cyan}${c.bold}│${c.r}  ${c.white}${c.bold}Choose login method:${c.r}                    ${c.cyan}${c.bold}│${c.r}`)
        console.log(`${c.cyan}${c.bold}│${c.r}                                         ${c.cyan}${c.bold}│${c.r}`)
        console.log(`${c.cyan}${c.bold}│${c.r}  ${c.green}${c.bold}1)${c.r} ${c.white}Enter WhatsApp Number${c.r} ${c.dim}(Pairing Code)${c.r} ${c.cyan}${c.bold}│${c.r}`)
        console.log(`${c.cyan}${c.bold}│${c.r}  ${c.yellow}${c.bold}2)${c.r} ${c.white}Paste Session ID${c.r}                     ${c.cyan}${c.bold}│${c.r}`)
        console.log(`${c.cyan}${c.bold}│${c.r}  ${c.magenta}${c.bold}3)${c.r} ${c.white}Skip${c.r} ${c.dim}(already connected)${c.r}            ${c.cyan}${c.bold}│${c.r}`)
        console.log(`${c.cyan}${c.bold}└─────────────────────────────────────────┘${c.r}`)
        console.log('')
    } else {
        console.log(`${c.yellow}[ ${_bn} ]${c.r} ${c.dim}No existing sessions found.${c.r}`)
        console.log('')
        console.log(`${c.cyan}${c.bold}┌─────────────────────────────────────────┐${c.r}`)
        console.log(`${c.cyan}${c.bold}│${c.r}  ${c.white}${c.bold}Choose login method:${c.r}                    ${c.cyan}${c.bold}│${c.r}`)
        console.log(`${c.cyan}${c.bold}│${c.r}                                         ${c.cyan}${c.bold}│${c.r}`)
        console.log(`${c.cyan}${c.bold}│${c.r}  ${c.green}${c.bold}1)${c.r} ${c.white}Enter WhatsApp Number${c.r} ${c.dim}(Pairing Code)${c.r} ${c.cyan}${c.bold}│${c.r}`)
        console.log(`${c.cyan}${c.bold}│${c.r}  ${c.yellow}${c.bold}2)${c.r} ${c.white}Paste Session ID${c.r}                     ${c.cyan}${c.bold}│${c.r}`)
        console.log(`${c.cyan}${c.bold}└─────────────────────────────────────────┘${c.r}`)
        console.log('')
    }

    waitForConsoleInput()
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Connection Bot - Multi-Session

// ── Signal session file wipe (NOT creds.json) ────────────────────────────────
// Deletes all Signal key material for a phone (pre-keys, sender-keys, sessions)
// while preserving creds.json (WhatsApp auth identity).
// Called before each 401 retry so reconnects start with a clean Signal state.
// Stale Signal sessions for a contact are the root cause of repeated 401s after
// commands in someone's DM or group chat.
function _wipeSignalFiles(phone) {
    const sessDir = path.join(SESSIONS_DIR, phone)
    if (!fs.existsSync(sessDir)) return
    let wiped = 0
    try {
        fs.readdirSync(sessDir).forEach(f => {
            if (f === 'creds.json') return  // KEEP — WhatsApp identity
            try { fs.unlinkSync(path.join(sessDir, f)); wiped++ } catch {}
        })
        if (wiped > 0) console.log(`[${phone}] Wiped ${wiped} stale Signal session file(s) — creds.json kept`)
    } catch(e) {}
}

async function connectSession(phone) {
try {
const sessionDir = path.join(SESSIONS_DIR, phone)
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true })

// ── Tear down the old socket before creating a new one ──────────────────────
const _prevSession = activeSessions.get(phone)
if (_prevSession && _prevSession.socket) {
    try {
        _prevSession.socket.ev.removeAllListeners()
        _prevSession.socket.ws?.close?.()
    } catch {}
}

activeSessions.set(phone, { socket: null, status: 'connecting', connectedUser: phone })

// ── Stability timers (watchdog + presence keepalive) ────────────────────────
// Declared here in connectSession scope so each reconnect gets fresh timers.
let _watchdogTimer = null
let _presenceTimer = null
function _clearStabilityTimers() {
    if (_watchdogTimer) { clearInterval(_watchdogTimer); _watchdogTimer = null }
    if (_presenceTimer) { clearInterval(_presenceTimer); _presenceTimer = null }
}


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
sendStatusReadReceipts: true,
shouldIgnoreJid: jid => false,
browser: Browsers.ubuntu('Chrome'),
msgRetryCounterCache: msgRetryCache,
getMessage: async (key) => {
    try {
        if (store) {
            const msg = await store.loadMessage(key.remoteJid, key.id)
            if (msg?.message) return msg.message
        }
    } catch {}
    return { conversation: '' }
},
patchMessageBeforeSending: (msg) => {
    const requiresPatch = !!(
        msg.buttonsMessage ||
        msg.templateMessage ||
        msg.listMessage
    )
    if (requiresPatch) {
        msg = {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadataVersion: 2,
                        deviceListMetadata: {}
                    },
                    ...msg
                }
            }
        }
    }
    return msg
},
});

activeSessions.set(phone, { socket: X, status: 'connecting', connectedUser: phone })

if (state?.creds?.me?.lid && X.user && !X.user.lid) {
    X.user.lid = state.creds.me.lid
    console.log(`[${phone}] LID pre-loaded from creds: ${X.user.lid}`)
}

if (X.ws) {
    X.ws.on('error', (err) => {
        console.log(`[${phone}] WebSocket error (handled):`, err.message || err)
    })
}
X.ev.on('CB:error', () => {})

if (!X.authState.creds.registered) {
    console.log(`[${phone}] Waiting for WebSocket handshake...`)
    await new Promise(resolve => setTimeout(resolve, 5000))
    console.log(`${c.cyan}[${phone}]${c.r} ${c.dim}Requesting pairing code...${c.r}`)
    let retries = 0
    const maxRetries = 3
    let paired = false
    while (retries < maxRetries && !paired) {
        try {
            let code = await X.requestPairingCode(phone);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log(`[PAIRING_CODE:${code}]`)
            console.log('')
            console.log(`${c.green}${c.bold}╔══════════════════════════════════════════╗${c.r}`)
            console.log(`${c.green}${c.bold}║${c.r}  ${c.bgGreen}${c.white}${c.bold} PAIRING CODE: ${code} ${c.r}                   ${c.green}${c.bold}║${c.r}`)
            console.log(`${c.green}${c.bold}╚══════════════════════════════════════════╝${c.r}`)
            console.log('')
            console.log(`${c.yellow}${c.bold}→${c.r} ${c.white}Open WhatsApp > Settings > Linked Devices > Link a Device${c.r}`)
            console.log(`${c.yellow}${c.bold}→${c.r} ${c.white}Choose "Link with phone number" and enter the code above${c.r}`)
            console.log('')
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

// ── Mirror the store's internal message Maps into _adCache ──────────────────
// The store RELIABLY stores every message via chatMsgs.set(id, msg) BEFORE our
// ev.on listeners run. We intercept those inner Map.set calls so _adCache gets
// every message the store sees, including ones that arrive with null content first.
const _mirrorMsgToCache = (msgId, msg, fallbackJid) => {
    if (!msgId || !msg || msg.key?.remoteJid === 'status@broadcast') return
    if (!msg.message) return  // skip null-content entries (can't show content anyway)
    const _ex = global._adCache?.get(msgId)
    if (_ex?.msg?.message) return  // already have good data
    global._adCache?.set(msgId, {
        msg,
        chatJid: msg.key?.remoteJid || fallbackJid,
        ts: _ex?.ts || Date.now()
    })
}

const _wrapChatMap = (jid, chatMap) => {
    if (!chatMap || chatMap.__adWrapped) return
    chatMap.__adWrapped = true
    const _origSet = chatMap.set.bind(chatMap)
    chatMap.set = function(msgId, msg) {
        _mirrorMsgToCache(msgId, msg, jid)
        return _origSet(msgId, msg)
    }
}

// Wrap all existing chat Maps that the store already created during history sync
for (const [jid, chatMap] of store.messages) _wrapChatMap(jid, chatMap)

// Intercept outer store.messages.set so NEW chat Maps also get wrapped
const _origStoreMessagesSet = store.messages.set.bind(store.messages)
store.messages.set = function(jid, chatMap) {
    const result = _origStoreMessagesSet(jid, chatMap)
    // After it's set, wrap the new Map
    const _actual = store.messages.get(jid)
    if (_actual instanceof Map) _wrapChatMap(jid, _actual)
    return result
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Anti-Delete Message Cache — DISK PERSISTENT
// Survives bot restarts / 401 reconnections.
// Stored at session/adcache.json — loaded on startup, saved every 30s.
const _AD_CACHE_FILE = path.join(__dirname, 'sessions', 'adcache.json')
const _AD_CACHE_MAX  = 1000                // max entries in memory
const _AD_CACHE_TTL  = 6 * 60 * 60 * 1000 // 6 hours — survive short outages

if (!global._adCache) {
    global._adCache = new Map()
    // Load from disk on first boot
    try {
        if (fs.existsSync(_AD_CACHE_FILE)) {
            const _diskData = JSON.parse(fs.readFileSync(_AD_CACHE_FILE, 'utf8'))
            const _cutoff   = Date.now() - _AD_CACHE_TTL
            let _loaded = 0
            for (const [id, entry] of Object.entries(_diskData)) {
                if (entry.ts > _cutoff && entry.msg) {
                    global._adCache.set(id, entry)
                    _loaded++
                }
            }
            if (_loaded) console.log(`[Anti-Delete] Loaded ${_loaded} cached messages from disk`)
        }
    } catch (_) {}
}

// Debounced disk writer — writes at most once per 30 seconds
let _adCacheWriteTimer = null
const _adCacheFlush = () => {
    if (_adCacheWriteTimer) return
    _adCacheWriteTimer = setTimeout(() => {
        _adCacheWriteTimer = null
        try {
            const _out = {}
            for (const [id, entry] of global._adCache) _out[id] = entry
            fs.writeFileSync(_AD_CACHE_FILE, JSON.stringify(_out), 'utf8')
        } catch (_) {}
    }, 30000)
}

// Helper — feed a batch of messages into _adCache
const _adCachePut = (msgs) => {
    try {
        let _added = 0
        for (const _adMsg of (msgs || [])) {
            if (!_adMsg?.key?.id) continue
            if (_adMsg.key.remoteJid === 'status@broadcast') continue

            const _existingEntry = global._adCache.get(_adMsg.key.id)
            // If already cached WITH content — skip (don't overwrite good data with null)
            if (_existingEntry?.msg?.message) continue
            // If no content and still no new content — skip (nothing gained)
            if (!_adMsg.message && _existingEntry) continue

            // Prune by TTL first
            if (!_existingEntry && global._adCache.size >= _AD_CACHE_MAX) {
                const _now = Date.now()
                for (const [_id, _entry] of global._adCache) {
                    if (_now - _entry.ts > _AD_CACHE_TTL) global._adCache.delete(_id)
                }
                if (global._adCache.size >= _AD_CACHE_MAX) {
                    global._adCache.delete(global._adCache.keys().next().value)
                }
            }
            global._adCache.set(_adMsg.key.id, {
                msg: _adMsg,
                chatJid: _adMsg.key.remoteJid,
                ts: _existingEntry?.ts || Date.now() // keep original timestamp for TTL
            })
            _added++
        }
        if (_added) _adCacheFlush()
    } catch (_) {}
}

// Capture live messages (upsert fires with content — or null on first delivery)
X.ev.on('messages.upsert', ({ messages: _adMsgs }) => _adCachePut(_adMsgs))
// Capture history sync on reconnect
X.ev.on('messaging-history.set', ({ messages: _adMsgs }) => _adCachePut(_adMsgs || []))
// Older Baileys history sync event
X.ev.on('messages.set', ({ messages: _adMsgs }) => _adCachePut(_adMsgs || []))

// When a message content arrives via update (e.g. decrypted after initial null delivery)
// update the cache entry so antidelete can use the real content
X.ev.on('messages.update', (_adUpdates) => {
    try {
        for (const _u of (_adUpdates || [])) {
            if (!_u?.key?.id || !_u.update?.message) continue
            const _ex = global._adCache.get(_u.key.id)
            // Only upgrade: fill in null-content entries or merge missing content
            if (!_ex || _ex.msg?.message) continue
            _ex.msg = { ..._ex.msg, message: _u.update.message }
            global._adCache.set(_u.key.id, _ex)
        }
    } catch (_) {}
})

// ── FIX 5: Suppress Bad MAC / libsignal decryption errors ────────────────
// These errors occur when WhatsApp re-keys a session (normal behaviour).
// Baileys already retries via msgRetryCounterCache; we just silence the noise.
X.ev.on('CB:error', () => {})
if (X.ws && X.ws.on) {
    X.ws.on('error', (err) => {
        const msg = (err?.message || String(err)).toLowerCase()
        if (msg.includes('bad mac') || msg.includes('failed to decrypt') ||
            msg.includes('no sessions') || msg.includes('invalid prekey') ||
            msg.includes('invalid message')) return
        console.error(`[${phone}] WS Error:`, err.message || err)
    })
}
// Swallow unhandled signal errors inside this socket context
const _origEmit = X.ev.emit.bind(X.ev)
X.ev.emit = function(event, ...args) {
    try { return _origEmit(event, ...args) } catch(e) {
        const em = (e?.message || '').toLowerCase()
        if (em.includes('bad mac') || em.includes('failed to decrypt') ||
            em.includes('no sessions') || em.includes('nosuchsession')) return false
        throw e
    }
}

// ── FIX 4: messages.upsert — correct type check ──────────────────────────
// The original was missing the type === 'notify' guard at the top level,
// which caused history sync messages to also trigger commands.
X.ev.on('messages.upsert', async chatUpdate => {
try {
// NOTE: 'Message yourself' commands do NOT fire here — gifted-baileys drops msmsg-encrypted
      // messages (same-account device-to-device traffic) at the library level. Commands from
      // OTHER numbers and groups work correctly. Use a second number to test, not 'Message yourself'.
      // Accept ALL message types (notify, append, etc.) — "Message yourself" comes as 'append'
    // Only filter is age: ignore messages older than 2 minutes (prevents history sync commands)
    mek = chatUpdate.messages[0]
    const _msgTs = (mek?.messageTimestamp || 0) * 1000
    if (Date.now() - _msgTs > 120000) return  // older than 2 min — history sync, skip
    if (!mek.message) {
          // SELF-DM FIX: "Message yourself" arrives as a fromMe device-sync message.
          // Do NOT wipe session files for own JID — that kills the retry handshake.
          // Just request a retry receipt and the phone will re-encrypt for this device.
          if (mek.key?.fromMe) {
              try {
                  if (mek.key?.remoteJid && mek.key?.id)
                      await X.sendReceipt(mek.key.remoteJid, null, [mek.key.id], 'retry')
              } catch {}
              return
          }

          // Message failed to decrypt (Bad MAC / no known Signal session).
          // SURGICAL FIX: only clear the specific failing sender's session — NOT all sessions.
          // Wiping all sessions in a group (many members) would force fresh Signal
          // handshakes with every contact simultaneously, flooding the 401 handler.
          try {
              const _fJid = mek.key?.remoteJid
              const _sJid = mek.key?.participant || _fJid
              const _sNum = _sJid ? _sJid.split('@')[0].split(':')[0] : null

              // Wipe ONLY session files belonging to this specific sender.
              // Session files contain the sender's number or JID in their filename.
              const _sessionDir = path.join(SESSIONS_DIR, phone)
              if (fs.existsSync(_sessionDir) && _sNum) {
                  let _wiped = 0
                  fs.readdirSync(_sessionDir).forEach(i => {
                      // Match files that reference this sender (e.g. session-254xxx@s.whatsapp.net.json)
                      if (i !== 'creds.json' && i.includes(_sNum)) {
                          try { fs.unlinkSync(path.join(_sessionDir, i)); _wiped++ } catch {}
                      }
                  })
                  if (_wiped) console.log(`[TOOSII-XD] Bad MAC: wiped ${_wiped} stale session file(s) for ${_sJid} — fresh session pending`)
              }

              // Clear from in-memory key store for both regular JID and @lid variant
              if (_sJid) {
                  try { await state.keys.set({ 'session': { [_sJid]: null } }) } catch {}
                  const _lidJid = _sJid.includes('@') ? _sJid.split('@')[0] + ':0@lid' : null
                  if (_lidJid) try { await state.keys.set({ 'session': { [_lidJid]: null } }) } catch {}
                  try { await saveCreds() } catch {}
              }

              // Ask sender to re-deliver with fresh encryption
              if (_fJid && mek.key?.id && !_fJid.includes('broadcast')) {
                  try { await X.sendReceipt(_fJid, mek.key.participant || null, [mek.key.id], 'retry') } catch {}
              }
          } catch (e) { console.log('[TOOSII-XD] Bad MAC recovery error:', e.message) }
          return
      }

  // Unwrap deviceSentMessage — WhatsApp wraps all "Message yourself" (self-DM) messages in this
    if (mek.message?.deviceSentMessage?.message) mek.message = mek.message.deviceSentMessage.message
    // Unwrap ephemeral messages
    mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
if (mek.key && mek.key.remoteJid === 'status@broadcast') {
    if (!mek.key.fromMe) {
        try {
            // ── Step 1: resolve participant to a phone @s.whatsapp.net JID ──────────
            // gifted-baileys / xmd-baileys may expose the real phone JID directly on
            // these fields when the participant's primary address is a @lid.
            // Priority: direct pn fields → store.contacts LID map → strip device suffix
            const _rawParticipant = mek.key.participant || mek.participant || mek.key.remoteJid

            let statusPosterJid = [
                mek.key.participantPn,
                mek.key.participantAlt,
                mek.key.senderPn,
                mek.participantPn,
                mek.senderPn,
            ].find(j => j && j.endsWith('@s.whatsapp.net'))

            if (!statusPosterJid) {
                // strip device suffix and check if it's already a phone JID
                const _stripped = _rawParticipant.replace(/:.*@/, '@')
                if (_stripped.endsWith('@s.whatsapp.net')) {
                    statusPosterJid = _stripped
                } else if (_stripped.endsWith('@lid') && store?.contacts) {
                    // LID → scan store.contacts for the matching phone JID
                    const _entries = typeof store.contacts.entries === 'function'
                        ? [...store.contacts.entries()]
                        : Object.entries(store.contacts)
                    const _found = _entries.find(([j, ct]) =>
                        j.endsWith('@s.whatsapp.net') &&
                        (ct?.lid === _stripped || ct?.lid === _rawParticipant || ct?.id === _stripped)
                    )
                    if (_found) statusPosterJid = _found[0]
                }
            }

            // Last resort: keep the raw participant (may be @lid — WhatsApp will still
            // accept readMessages with it on some clients)
            if (!statusPosterJid) statusPosterJid = _rawParticipant.replace(/:.*@/, '@')

            // Bot's own JID (phone + lid forms for statusJidList)
            const botSelfJid = (X.decodeJid ? X.decodeJid(X.user.id) : X.user.id).replace(/:.*@/, '@')
            const botLidJid  = X.user?.lid ? (X.decodeJid ? X.decodeJid(X.user.lid) : X.user.lid).replace(/:.*@/, '@') : null

            // ── Auto-view: mark the status as seen ───────────────────────────────
            if (global.autoViewStatus) {
                // Try with resolved phone JID first, fall back to raw key
                const _viewKey1 = { remoteJid: 'status@broadcast', id: mek.key.id, participant: statusPosterJid }
                const _viewKey2 = { ...mek.key }
                let _viewed = false
                try {
                    await X.readMessages([_viewKey1])
                    _viewed = true
                    console.log(`[${phone}] ✅ Auto-viewed status from ${statusPosterJid}`)
                } catch {}
                if (!_viewed) {
                    try {
                        await X.readMessages([_viewKey2])
                        console.log(`[${phone}] ✅ Auto-viewed status (raw key fallback) from ${statusPosterJid}`)
                    } catch (ve) {
                        console.log(`[${phone}] Auto-view failed:`, ve.message || ve)
                    }
                }
            }

            // ── Auto-like: react to the status ───────────────────────────────────
            if (global.autoLikeStatus) {
                try {
                    await new Promise(r => setTimeout(r, 800))
                    const _emojis = ['💛', '❤️', '💜', '🤍', '💙', '🧡', '💚', '🔥', '😍', '👍']
                    const _emoji  = global.autoLikeEmoji || _emojis[Math.floor(Math.random() * _emojis.length)]

                    // React key always uses the raw participant from the message key
                    const _reactKey = {
                        remoteJid: 'status@broadcast',
                        id: mek.key.id,
                        participant: _rawParticipant,
                        fromMe: false,
                    }

                    let _liked = false

                    // Method 1 (most reliable for LID): send react to poster's private DM JID
                    if (statusPosterJid.endsWith('@s.whatsapp.net')) {
                        try {
                            await X.sendMessage(statusPosterJid, { react: { text: _emoji, key: _reactKey } })
                            _liked = true
                            console.log(`[${phone}] ✅ Auto-liked status from ${statusPosterJid} with ${_emoji}`)
                        } catch {}
                    }

                    // Method 2: statusJidList approach (works when participant is phone JID)
                    if (!_liked) {
                        const _jidList = [statusPosterJid, botSelfJid, ...(botLidJid ? [botLidJid] : [])].filter(Boolean)
                        try {
                            await X.sendMessage('status@broadcast', {
                                react: { text: _emoji, key: _reactKey }
                            }, { statusJidList: _jidList })
                            _liked = true
                            console.log(`[${phone}] ✅ Auto-liked (statusJidList) from ${statusPosterJid} with ${_emoji}`)
                        } catch {}
                    }

                    // Method 3: raw participant JID as target
                    if (!_liked && _rawParticipant !== statusPosterJid) {
                        try {
                            await X.sendMessage(_rawParticipant, { react: { text: _emoji, key: _reactKey } })
                            _liked = true
                            console.log(`[${phone}] ✅ Auto-liked (raw JID) from ${_rawParticipant} with ${_emoji}`)
                        } catch {}
                    }

                    if (!_liked) console.log(`[${phone}] Auto-like: all methods failed for ${statusPosterJid}`)
                } catch (likeErr) {
                    console.log(`[${phone}] Auto-like error:`, likeErr.message || likeErr)
                }
            }
            if (global.autoReplyStatus && global.autoReplyStatusMsg) {
                try {
                    await X.sendMessage(statusPosterJid, { text: global.autoReplyStatusMsg })
                    console.log(`[${phone}] ✅ Auto-replied to status from ${statusPosterJid}`)
                } catch (arErr) {
                    console.log(`[${phone}] Auto-reply status error:`, arErr.message || arErr)
                }
            }
            if (global.antiStatusMention) {
                try {
                    let msgContent2 = mek.message
                    let ct = Object.keys(msgContent2)[0]
                    let msgObj = msgContent2[ct] || {}
                    let mentionedJids = msgObj.contextInfo?.mentionedJid || []
                    let statusText = msgObj.text || msgObj.caption || msgObj.description || ''
                    let _mentionerRaw = mek.key.participant || mek.key.remoteJid
                    let mentioner = _mentionerRaw.replace(/:.*@/, '@').split('@')[0]
                    let mentionerJid = mentioner + '@s.whatsapp.net'
                    let botSelfJid = X.decodeJid(X.user.id).replace(/:.*@/, '@')
                    let alertJid = botSelfJid
                    let groupsMentioned = mentionedJids.filter(jid => jid.endsWith('@g.us'))
                    let inviteLinks = statusText.match(/chat\.whatsapp\.com\/([A-Za-z0-9]{20,24})/g) || []
                    if (groupsMentioned.length === 0 && inviteLinks.length === 0) throw Object.assign(new Error('no_mention'), { skip: true })
                    let asmAction = global.antiStatusMentionAction || 'warn'
                    for (let gJid of groupsMentioned) {
                        try {
                            let gMeta = await X.groupMetadata(gJid).catch(() => null)
                            if (!gMeta) {
                                await X.sendMessage(alertJid, { text: `*⚠️ Anti-Status Mention*\n\n+${mentioner} tagged a group in their status.\nGroup: ${gJid}\n_Bot is not a member of this group._` })
                                continue
                            }
                            let gName = gMeta.subject || gJid
                            let isMember = gMeta.participants.some(p => p.id.split(':')[0].split('@')[0] === mentioner)
                            let botIsAdmin = gMeta.participants.some(p => {
                                let isBot = areJidsSameUser(p.id, X.user.id) || (X.user?.lid && areJidsSameUser(p.id, X.user.lid))
                                return isBot && (p.admin === 'admin' || p.admin === 'superadmin')
                            })
                            let isMentionerOwner = global.owner.includes(mentioner)
                            await X.sendMessage(alertJid, { text: `*⚠️ Anti-Status Mention Alert*\n\n👤 User: +${mentioner}\n🏘️ Group tagged: *${gName}*\n⚡ Action: ${asmAction.toUpperCase()}\n🤖 Bot is admin: ${botIsAdmin ? 'Yes' : 'No'}` })
                            if (!isMember) continue
                            if (isMentionerOwner) continue
                            if (!botIsAdmin) {
                                await X.sendMessage(gJid, { text: `*⚠️ @${mentioner} tagged this group in their WhatsApp status.*\n_Make the bot admin to enable auto-actions._`, mentions: [mentionerJid] })
                                continue
                            }
                            if (asmAction === 'kick') {
                                await X.groupParticipantsUpdate(gJid, [mentionerJid], 'remove')
                                await X.sendMessage(gJid, { text: `*🚫 @${mentioner} has been removed.*\nReason: Tagged this group in their WhatsApp status.`, mentions: [mentionerJid] })
                            } else if (asmAction === 'warn') {
                                if (!global.statusMentionWarns) global.statusMentionWarns = {}
                                let warnKey = `${gJid}:${mentionerJid}`
                                global.statusMentionWarns[warnKey] = (global.statusMentionWarns[warnKey] || 0) + 1
                                let wCount = global.statusMentionWarns[warnKey]
                                let maxW = 3
                                if (wCount >= maxW) {
                                    await X.groupParticipantsUpdate(gJid, [mentionerJid], 'remove')
                                    global.statusMentionWarns[warnKey] = 0
                                    await X.sendMessage(gJid, { text: `*🚫 @${mentioner} has been removed after ${maxW} warnings.*\nReason: Repeatedly tagging this group in their WhatsApp status.`, mentions: [mentionerJid] })
                                } else {
                                    await X.sendMessage(gJid, { text: `*⚠️ Warning ${wCount}/${maxW} — @${mentioner}*\nReason: You tagged this group in your WhatsApp status.\n_${maxW - wCount} more warning(s) before removal._`, mentions: [mentionerJid] })
                                }
                            } else if (asmAction === 'delete') {
                                if (!global.statusMentionDeleteList) global.statusMentionDeleteList = {}
                                if (!global.statusMentionDeleteList[gJid]) global.statusMentionDeleteList[gJid] = []
                                if (!global.statusMentionDeleteList[gJid].includes(mentionerJid)) {
                                    global.statusMentionDeleteList[gJid].push(mentionerJid)
                                }
                                await X.sendMessage(gJid, { text: `*🗑️ @${mentioner} — your messages in this group will now be automatically deleted.*\nReason: You tagged this group in your WhatsApp status.\n_Contact an admin to appeal._`, mentions: [mentionerJid] })
                            }
                        } catch (gErr) {
                            console.log(`[${phone}] Anti-status-mention group error:`, gErr.message || gErr)
                        }
                    }
                    if (inviteLinks.length > 0) {
                        let linkListText = inviteLinks.map(l => '• https://' + l).join('\n')
                        await X.sendMessage(alertJid, { text: `*🔗 Anti-Status Mention — Invite Link Detected*\n\n+${mentioner} shared group link(s) in their status:\n${linkListText}\n\n⚡ Action: ${asmAction.toUpperCase()}` })
                        // take action in all groups the bot is admin in where the mentioner is a member
                        try {
                            const allGroups = Object.values(store?.chats?.all?.() || {}).filter(c => c.id && c.id.endsWith('@g.us'))
                            for (const gc of allGroups) {
                                try {
                                    let gMeta = await X.groupMetadata(gc.id).catch(() => null)
                                    if (!gMeta) continue
                                    let isMember = gMeta.participants.some(p => p.id.split(':')[0].split('@')[0] === mentioner)
                                    if (!isMember) continue
                                    let botIsAdmin = gMeta.participants.some(p => {
                                        let isBot = areJidsSameUser(p.id, X.user.id) || (X.user?.lid && areJidsSameUser(p.id, X.user.lid))
                                        return isBot && (p.admin === 'admin' || p.admin === 'superadmin')
                                    })
                                    if (!botIsAdmin) continue
                                    if (global.owner && global.owner.includes(mentioner)) continue
                                    if (asmAction === 'kick') {
                                        await X.groupParticipantsUpdate(gc.id, [mentionerJid], 'remove')
                                        await X.sendMessage(gc.id, { text: `*🚫 @${mentioner} has been removed.*\nReason: Shared a group invite link in their WhatsApp status.`, mentions: [mentionerJid] })
                                    } else if (asmAction === 'warn') {
                                        let warnKey = `${gc.id}:${mentionerJid}`
                                        if (!global.statusMentionWarns) global.statusMentionWarns = {}
                                        global.statusMentionWarns[warnKey] = (global.statusMentionWarns[warnKey] || 0) + 1
                                        let wCount = global.statusMentionWarns[warnKey]
                                        if (wCount >= 3) {
                                            await X.groupParticipantsUpdate(gc.id, [mentionerJid], 'remove')
                                            global.statusMentionWarns[warnKey] = 0
                                            await X.sendMessage(gc.id, { text: `*🚫 @${mentioner} removed after 3 warnings.*\nReason: Sharing group invite links in WhatsApp status.`, mentions: [mentionerJid] })
                                        } else {
                                            await X.sendMessage(gc.id, { text: `*⚠️ Warning ${wCount}/3 — @${mentioner}*\nReason: You shared a group invite link in your WhatsApp status.\n_${3 - wCount} more warning(s) before removal._`, mentions: [mentionerJid] })
                                        }
                                    } else if (asmAction === 'delete') {
                                        if (!global.statusMentionDeleteList) global.statusMentionDeleteList = {}
                                        if (!global.statusMentionDeleteList[gc.id]) global.statusMentionDeleteList[gc.id] = []
                                        if (!global.statusMentionDeleteList[gc.id].includes(mentionerJid)) {
                                            global.statusMentionDeleteList[gc.id].push(mentionerJid)
                                        }
                                        await X.sendMessage(gc.id, { text: `*🗑️ @${mentioner} — your messages will now be auto-deleted.*\nReason: Shared a group invite link in WhatsApp status.`, mentions: [mentionerJid] })
                                    }
                                } catch {}
                            }
                        } catch {}
                    }
                } catch (smErr) {
                    if (!smErr.skip) console.log(`[${phone}] Anti-status-mention error:`, smErr.message || smErr)
                }
            }
            if (global.statusToGroup) {
                let _fwdSender = (mek.key.participant || mek.key.remoteJid).replace(/:.*@/, '@')
                let senderNum = _fwdSender.split('@')[0]
                let msgContent = mek.message
                let contentType = Object.keys(msgContent)[0]
                let targetGroup = global.statusToGroup
                let header = `📢 *Status from +${senderNum}*`
                const _dlBuf = async (msgObj, type) => {
                    let stream = await downloadContentFromMessage(msgObj, type)
                    let chunks = []
                    for await (let c of stream) chunks.push(c)
                    return Buffer.concat(chunks)
                }
                try {
                    if (contentType === 'imageMessage') {
                        let buf = await _dlBuf(msgContent.imageMessage, 'image')
                        let cap = msgContent.imageMessage.caption || ''
                        await X.sendMessage(targetGroup, { image: buf, caption: `${header}${cap ? '\n' + cap : ''}` })
                    } else if (contentType === 'videoMessage') {
                        let buf = await _dlBuf(msgContent.videoMessage, 'video')
                        let cap = msgContent.videoMessage.caption || ''
                        await X.sendMessage(targetGroup, { video: buf, caption: `${header}${cap ? '\n' + cap : ''}`, mimetype: 'video/mp4' })
                    } else if (contentType === 'audioMessage') {
                        let buf = await _dlBuf(msgContent.audioMessage, 'audio')
                        await X.sendMessage(targetGroup, { audio: buf, mimetype: 'audio/mpeg' })
                        await X.sendMessage(targetGroup, { text: header })
                    } else if (contentType === 'stickerMessage') {
                        let buf = await _dlBuf(msgContent.stickerMessage, 'sticker')
                        await X.sendMessage(targetGroup, { sticker: buf })
                        await X.sendMessage(targetGroup, { text: header })
                    } else if (contentType === 'extendedTextMessage') {
                        let txt = msgContent.extendedTextMessage.text || ''
                        await X.sendMessage(targetGroup, { text: `${header}\n\n${txt}` })
                    } else if (contentType === 'conversation') {
                        await X.sendMessage(targetGroup, { text: `${header}\n\n${msgContent.conversation}` })
                    } else {
                        await X.sendMessage(targetGroup, { text: `${header}\n_[${contentType.replace('Message','')} status]_` })
                    }
                    console.log(`[${phone}] ✅ Forwarded ${contentType} status from +${senderNum} to group ${targetGroup}`)
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

// FIX 4 continued: removed duplicate type check that was INSIDE here
// Original had: if (!X.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
// This was WRONG — it returned early for all public messages!
// Fixed: check X.public properly
if (!X.public && !mek.key.fromMe) return

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

// Anti-Status-Mention Delete Mode
if (global.statusMentionDeleteList && mek.message && !mek.key.fromMe) {
    let chat = mek.key.remoteJid
    if (chat && chat.endsWith('@g.us')) {
        let _senderRaw = mek.key.participant || mek.key.remoteJid
        let senderJid = _senderRaw.includes(':') ? _senderRaw.replace(/:.*@/, '@') : _senderRaw
        let flaggedList = global.statusMentionDeleteList[chat] || []
        if (flaggedList.includes(senderJid)) {
            try {
                let groupMeta = await X.groupMetadata(chat).catch(() => null)
                let isBotAdmin = groupMeta && groupMeta.participants.some(p => {
                    let isBot = areJidsSameUser(p.id, X.user.id) || (X.user?.lid && areJidsSameUser(p.id, X.user.lid))
                    return isBot && (p.admin === 'admin' || p.admin === 'superadmin')
                })
                if (isBotAdmin) {
                    await X.sendMessage(chat, { delete: mek.key })
                    console.log(`[${phone}] Deleted message from flagged user ${senderJid} in ${chat}`)
                }
            } catch (delErr) {
                console.log(`[${phone}] Anti-status-mention delete error:`, delErr.message || delErr)
            }
        }
    }
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
            let senderNum = senderJid.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
            let isOwnr = global.owner.includes(senderNum) || mek.key.fromMe
            if (!isOwnr) {
                try {
                    let groupMeta = await X.groupMetadata(chat)
                    let isBotAdmin = groupMeta.participants.some(p => {
                        let match = areJidsSameUser(p.id, X.user.id) || (X.user?.lid && areJidsSameUser(p.id, X.user.lid))
                        return match && (p.admin === 'admin' || p.admin === 'superadmin')
                    })
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
    let em = (err?.message || '').toLowerCase()
    let es = (err?.stack || '').toLowerCase()
    let isSignalNoise = (
        em.includes('no sessions') || em.includes('sessionerror') ||
        em.includes('bad mac') || em.includes('failed to decrypt') ||
        em.includes('no senderkey') || em.includes('invalid prekey') ||
        em.includes('invalid message') || em.includes('nosuchsession') ||
        es.includes('session_cipher') || es.includes('libsignal') || es.includes('queue_job')
    )
    if (isSignalNoise) {
        console.log(`[${phone}] [Signal] Suppressed session error: ${err.message || err}`)
    } else {
        console.log(`[${phone}] [Error]`, err)
    }
}
})

X.decodeJid = (jid) => {
if (!jid) return jid
if (/:\d+@/gi.test(jid)) {
let decode = jidDecode(jid) || {}
return decode.user && decode.server && decode.user + '@' + decode.server || jid
} else return jid
}

X.getName = (jid, withoutContact = false) => {
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
X.ev.on('connection.update', async (update) => {
const { connection, lastDisconnect } = update;
if (connection === "close") {
_clearStabilityTimers()
let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
if (reason === DisconnectReason.badSession) {
console.log(`[${phone}] Session file corrupted, deleting & reconnecting...`);
activeSessions.delete(phone)
try {
    const sessDir = path.join(SESSIONS_DIR, phone)
    if (fs.existsSync(sessDir)) fs.rmSync(sessDir, { recursive: true, force: true })
} catch(e) {}
setTimeout(() => connectSession(phone), 3000)
  } else if (reason === DisconnectReason.connectionClosed) {
console.log(`[${phone}] Connection closed, reconnecting...`);
if (activeSessions.has(phone)) activeSessions.get(phone).status = 'reconnecting'
setTimeout(() => connectSession(phone), 3000);
  } else if (reason === DisconnectReason.connectionLost) {
console.log(`[${phone}] Connection lost, reconnecting...`);
if (activeSessions.has(phone)) activeSessions.get(phone).status = 'reconnecting'
setTimeout(() => connectSession(phone), 3000);
  } else if (reason === DisconnectReason.connectionReplaced) {
// 515 = a newer WhatsApp client connected with the same session.
// First 515: wait 10s and attempt ONE reconnect — this handles an internal
//            WhatsApp socket refresh (same server, transient replacement).
// Second 515 within 60s: another server/deployment took over — yield and stop.
//            The new deployment wins; this instance stops cleanly.
if (!global._replaced515) global._replaced515 = {}
const _now515 = Date.now()
const _last515 = global._replaced515[phone] || 0
global._replaced515[phone] = _now515
_clearStabilityTimers()
if (_now515 - _last515 < 60000) {
    console.log(`[${phone}] Connection replaced again (515×2) — new deployment is active, this instance is stopping.`)
    delete global._replaced515[phone]
    if (activeSessions.has(phone)) activeSessions.get(phone).status = 'disconnected'
} else {
    console.log(`[${phone}] Connection replaced (515) — reconnecting once in 10s`)
    if (activeSessions.has(phone)) activeSessions.get(phone).status = 'reconnecting'
    setTimeout(() => connectSession(phone), 10000)
}
  } else if (reason === DisconnectReason.loggedOut) {
// ── Retry-based 401 handler ────────────────────────────────────────────────
// gifted-baileys emits 401 for BOTH real WhatsApp logouts AND internal
// Signal errors (SessionError, Bad MAC, No sessions) that occur during
// normal DM/group commands — they are indistinguishable from the error alone.
//
// Real logout   → every reconnect attempt immediately gets another 401.
// Signal noise  → one or two 401s, then the reconnect succeeds and stays up.
//
// Strategy: allow up to 3 consecutive 401s before treating it as a real
// logout.  The retry counter resets whenever connection === 'open' fires,
// so a single noisy message in someone's DM cannot accumulate to the wipe
// threshold.  A stale count older than 3 minutes also resets automatically.
if (!global._logout401) global._logout401 = {}
const _now401  = Date.now()
const _rec401  = global._logout401[phone] || { count: 0, ts: 0 }
// Reset counter if last 401 was more than 3 minutes ago (session had recovered)
if (_now401 - _rec401.ts > 180000) _rec401.count = 0
_rec401.count++
_rec401.ts = _now401
global._logout401[phone] = _rec401

if (_rec401.count < 4) {
    // 1st, 2nd, or 3rd 401 — wipe stale Signal session files, then reconnect.
    // Stale Signal sessions for a DM/group contact are the #1 cause of repeated
    // 401s: each reconnect re-uses the same broken key material → same error.
    // Wiping the Signal files (keeping creds.json) forces fresh handshakes on
    // the next connection, breaking the 401 loop.
    const delay = _rec401.count === 1 ? 4000 : _rec401.count === 2 ? 8000 : 15000
    console.log(`[${phone}] Got 401 (${_rec401.count}/4) — wiping stale Signal files & reconnecting in ${delay/1000}s`)
    _wipeSignalFiles(phone)
    if (activeSessions.has(phone)) activeSessions.get(phone).status = 'reconnecting'
    setTimeout(() => connectSession(phone), delay)
} else {
    // 4th consecutive 401 even after clearing all Signal state → real logout.
    // At this point creds.json itself is invalidated by WhatsApp.
    console.log(`[${phone}] Confirmed WhatsApp logout (4 × 401, Signal state was clean) — removing session`)
    delete global._logout401[phone]
    if (global._connMsgSent) global._connMsgSent.delete(phone)
    activeSessions.delete(phone)
    try {
        const sessDir = path.join(SESSIONS_DIR, phone)
        if (fs.existsSync(sessDir)) fs.rmSync(sessDir, { recursive: true, force: true })
    } catch(e) {}
}
  } else if (reason === DisconnectReason.restartRequired) {
console.log(`[${phone}] Restart required, reconnecting...`);
if (activeSessions.has(phone)) activeSessions.get(phone).status = 'reconnecting'
setTimeout(() => connectSession(phone), 2000);
  } else if (reason === DisconnectReason.timedOut) {
console.log(`[${phone}] Connection timed out, reconnecting...`);
if (activeSessions.has(phone)) activeSessions.get(phone).status = 'reconnecting'
setTimeout(() => connectSession(phone), 3000);
  } else if (reason === 405) {
// 405 = conflict / not acceptable — another device is already using this session.
// Do NOT retry — it will just keep getting rejected. The user needs to log out
// of WhatsApp on other linked devices or re-generate the SESSION_ID.
console.log(`[${phone}] ⚠️  WhatsApp returned 405 (conflict). Another device may already be using this session.`);
console.log(`[${phone}]    Fix: open WhatsApp → Linked Devices → unlink old devices, then generate a fresh SESSION_ID.`);
if (activeSessions.has(phone)) activeSessions.get(phone).status = 'disconnected'
  } else {
console.log(`[${phone}] Unknown DisconnectReason: ${reason}|${connection} — retrying in 10s`);
if (activeSessions.has(phone)) activeSessions.get(phone).status = 'reconnecting'
setTimeout(() => connectSession(phone), 10000);
  }
} else if (connection === "open") {
// Reset 401 retry counter — connection is healthy again.
// Prevents Signal noise from a previous command accumulating toward the wipe threshold.
if (global._logout401 && global._logout401[phone]) delete global._logout401[phone]
if (!X.user.lid && state?.creds?.me?.lid) {
    X.user.lid = state.creds.me.lid
    console.log(`[${phone}] LID loaded from creds: ${X.user.lid}`)
}
const connUser = X.user?.id?.split(':')[0] || phone
activeSessions.set(phone, { socket: X, status: 'connected', connectedUser: connUser })
// Auto-add connected number to global.owner so deployer always has owner access
if (connUser && !global.owner.includes(connUser)) {
    global.owner = [...new Set([...global.owner, connUser])]
    console.log(`${c.green}[${phone}]${c.r} ${c.cyan}Auto-added ${connUser} to owner list${c.r}`)
}

// ── Stability Layer 1: Watchdog ──────────────────────────────────────────────
// Checks socket health every 30s. If the WebSocket is no longer OPEN while
// the session still shows as connected, force a clean reconnect.
_clearStabilityTimers()
_watchdogTimer = setInterval(() => {
    const _sess = activeSessions.get(phone)
    if (!_sess || _sess.status !== 'connected') { _clearStabilityTimers(); return }
    const _ws = X.ws
    // WebSocket readyState: 0=CONNECTING 1=OPEN 2=CLOSING 3=CLOSED
    // Only trigger on explicit CLOSING(2) or CLOSED(3) — NOT on undefined.
    // gifted-baileys may not always expose .readyState; undefined != broken.
    if (_ws && (_ws.readyState === 2 || _ws.readyState === 3)) {
        console.log(`[${phone}] Watchdog: socket CLOSING/CLOSED (state=${_ws.readyState}) — forcing reconnect`)
        _clearStabilityTimers()
        if (activeSessions.has(phone)) activeSessions.get(phone).status = 'reconnecting'
        connectSession(phone).catch(console.error)
    }
}, 30000)

// ── Stability Layer 2: Presence keepalive ───────────────────────────────────
// Send 'available' every 5 minutes. WhatsApp marks linked devices as inactive
// if it receives no presence signals, eventually closing the session.
_presenceTimer = setInterval(async () => {
    const _sess = activeSessions.get(phone)
    if (!_sess || _sess.status !== 'connected') { _clearStabilityTimers(); return }
    try { await X.sendPresenceUpdate('available') } catch {}
}, 5 * 60 * 1000)
// ── One-time startup actions (newsletter, group join, connection message) ────
// These only run on the FIRST successful open for this phone number.
// Reconnects (after Signal noise 401, connectionClosed, watchdog, etc.)
// skip this block entirely — no duplicate messages sent to the user.
if (!global._connMsgSent) global._connMsgSent = new Set()
if (!global._connMsgSent.has(phone)) {
    global._connMsgSent.add(phone)
    // Newsletter follow and group auto-join removed
    const connectedJid = X.user.id.replace(/:.*@/, '@')
    try {
        await X.sendMessage(connectedJid, {text: `╔══════════════════════════╗
║   ⚡ *${global.botname || 'TOOSII-XD ULTRA'}*
║   _WhatsApp Multi-Device Bot_
╚══════════════════════════╝

  ✅ *Connection Successful!*

  ├◈ 👤 *User*    › ${connUser}
  ├◈ 🟢 *Status*  › Active & Online
  ├◈ 🤖 *Bot*     › ${global.botname || 'TOOSII-XD ULTRA'}
  ├◈ 📋 *Commands* › Type \`.menu\` to get started

_⚡ Bot is online and ready._`})
    } catch (e) {}
}
console.log(`[BOT_CONNECTED:${connUser}]`)
console.log(`[${phone}] Connected: id=${JSON.stringify(X.user.id)} lid=${JSON.stringify(X.user?.lid || 'NOT SET')}`);
}
});

X.ev.on('creds.update', async (update) => {
    await saveCreds()
    if (update?.me?.lid && !X.user.lid) {
        X.user.lid = update.me.lid
        console.log(`[${phone}] LID updated from creds event: ${X.user.lid}`)
    }
})

X.sendText = (jid, text, quoted = '', options) => X.sendMessage(jid, { text: text, ...options }, { quoted })

X.sendFile = async (jid, path, filename = '', caption = '', quoted, ptt = false, options = {}) => {
        let type = await X.getFile(path, true)
        let { res, data: file, filename: pathFile } = type
        if (res && res.status !== 200 || file.length <= 65536) {
            try { throw { json: JSON.parse(file.toString()) } }
            catch (e) { if (e.json) throw e.json }
        }
        let opt = { filename }
        if (quoted) opt.quoted = quoted
        if (!type) options.asDocument = true
        let mtype = '', mimetype = type.mime, convert
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
        let message = { ...options, caption, ptt, [mtype]: { url: pathFile }, mimetype }
        let m
        try { m = await X.sendMessage(jid, message, { ...opt, ...options }) }
        catch (e) { m = null }
        finally {
            if (!m) m = await X.sendMessage(jid, { ...message, [mtype]: file }, { ...opt, ...options })
            file = null
            return m
        }
    }

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Welcome Setting
    X.ev.on('group-participants.update', async (anu) => {
        try {
            let metadata = await X.groupMetadata(anu.id).catch(() => null)
            if (!metadata) return
            let groupName = metadata.subject || 'the group'
            let totalMembers = metadata.participants.length

            for (let num of anu.participants) {
                let numClean = num.split('@')[0].split(':')[0]
                let ppuser = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png?q=60'
                try { ppuser = await X.profilePictureUrl(num, 'image') } catch {}
                let ppBuf = await getBuffer(ppuser).catch(() => null)

                if (global.welcome && anu.action === 'add') {
                    let welcomeBody =
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃       👋 *WELCOME!*
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Hey @${numClean}! 🎉
You've just joined *${groupName}*

┌─────────────────────────────
│ 👥 Members  : ${totalMembers}
│ 🤖 Bot      : ${global.botname}
└─────────────────────────────

_We're glad to have you here!_
_Please read the group rules and enjoy your stay._ 😊`
                    await X.sendMessage(anu.id, {
                        text: welcomeBody,
                        contextInfo: {
                            mentionedJid: [num],
                            externalAdReply: {
                                showAdAttribution: true,
                                containsAutoReply: true,
                                title: global.botname,
                                body: groupName,
                                previewType: 'PHOTO',
                                thumbnailUrl: '',
                                thumbnail: ppBuf || Buffer.alloc(0),
                                sourceUrl: global.wagc || ''
                            }
                        }
                    })
                }

                if ((global.goodbye ?? global.welcome) && anu.action === 'remove') {
                    let goodbyeBody =
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃       👋 *GOODBYE!*
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

@${numClean} has left *${groupName}* 😔

┌─────────────────────────────
│ 👥 Members  : ${totalMembers}
│ 🤖 Bot      : ${global.botname}
└─────────────────────────────

_Safe travels! You're always welcome back._ 🌟`
                    await X.sendMessage(anu.id, {
                        text: goodbyeBody,
                        contextInfo: {
                            mentionedJid: [num],
                            externalAdReply: {
                                showAdAttribution: true,
                                containsAutoReply: true,
                                title: global.botname,
                                body: groupName,
                                previewType: 'PHOTO',
                                thumbnailUrl: '',
                                thumbnail: ppBuf || Buffer.alloc(0),
                                sourceUrl: global.wagc || ''
                            }
                        }
                    })
                }

                if (global.adminevent && anu.action === 'promote') {
                    let promoteBody =
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃     🌟 *ADMIN PROMOTED!*
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Congratulations @${numClean}! 🎊
You have been *promoted to Admin* in
*${groupName}*

┌─────────────────────────────
│ 🛡️ Role     : Group Admin
│ 👥 Members  : ${totalMembers}
└─────────────────────────────

_Use your powers wisely and responsibly!_ ⚡`
                    await X.sendMessage(anu.id, {
                        text: promoteBody,
                        contextInfo: {
                            mentionedJid: [num],
                            externalAdReply: {
                                showAdAttribution: true,
                                containsAutoReply: true,
                                title: global.botname,
                                body: groupName,
                                previewType: 'PHOTO',
                                thumbnailUrl: '',
                                thumbnail: ppBuf || Buffer.alloc(0),
                                sourceUrl: global.wagc || ''
                            }
                        }
                    })
                }

                if (global.adminevent && anu.action === 'demote') {
                    let demoteBody =
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃     📉 *ADMIN DEMOTED*
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

@${numClean} has been *demoted from Admin*
in *${groupName}*

┌─────────────────────────────
│ 👤 Role     : Member
│ 👥 Members  : ${totalMembers}
└─────────────────────────────

_You are now a regular member._ 🔄`
                    await X.sendMessage(anu.id, {
                        text: demoteBody,
                        contextInfo: {
                            mentionedJid: [num],
                            externalAdReply: {
                                showAdAttribution: true,
                                containsAutoReply: true,
                                title: global.botname,
                                body: groupName,
                                previewType: 'PHOTO',
                                thumbnailUrl: '',
                                thumbnail: ppBuf || Buffer.alloc(0),
                                sourceUrl: global.wagc || ''
                            }
                        }
                    })
                }
            }
        } catch (err) {
            console.log('[Group Events] Error:', err.message || err)
        }
    })

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Message Retry Handler
X.ev.on('messages.receipt', async (receipts) => {
    if (!receipts || !receipts.length) return
    for (let receipt of receipts) {
        try {
            if (receipt.type === 'retry') {
                const retryKey = receipt.key
                if (!retryKey) continue
                const storedMsg = store ? await store.loadMessage(retryKey.remoteJid, retryKey.id).catch(() => null) : null
                if (storedMsg?.message) {
                    await X.relayMessage(retryKey.remoteJid, storedMsg.message, {
                        messageId: retryKey.id,
                        participant: retryKey.participant,
                        additionalAttributes: { edit: '2' }
                    }).catch(() => {})
                }
            }
        } catch (retryErr) {}
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
// ── Anti-Delete helpers (ported from attached code, adapted for gifted-baileys) ──

  // Ensure tmp dir exists
  const _AD_TMP = path.join(__dirname, 'tmp')
  if (!fs.existsSync(_AD_TMP)) fs.mkdirSync(_AD_TMP, { recursive: true })

  // Download media message to disk → returns file path or null
  const _dlMedia = async (msgObj, type, fileName) => {
      try {
          const _stream = await downloadContentFromMessage(msgObj, type)
          const _chunks = []; for await (const _c of _stream) _chunks.push(_c)
          const _buf = Buffer.concat(_chunks)
          if (!_buf.length) return null
          const _fp = path.join(_AD_TMP, fileName)
          fs.writeFileSync(_fp, _buf)
          return _fp
      } catch { return null }
  }

  // Get notification destinations based on gc/pm config
  const _adGetTargets = (chatJid) => {
      const _ownerJid = X.user.id.split(':')[0] + '@s.whatsapp.net'
      const _isGrp = chatJid.endsWith('@g.us')
      const _cfg = global.adState
          ? (_isGrp ? global.adState.gc : global.adState.pm)
          : { enabled: global.antiDelete, mode: global.antiDeleteMode === 'public' ? 'chat' : 'private' }
      if (!_cfg?.enabled) return []
      const _mode = _cfg.mode || 'private'
      const _targets = []
      if (_mode === 'private' || _mode === 'both') _targets.push(_ownerJid)
      if ((_mode === 'chat' || _mode === 'both') && chatJid !== _ownerJid) _targets.push(chatJid)
      if (_targets.length === 0) _targets.push(_ownerJid)
      return _targets
  }

  // Download media when messages arrive → store path in cache
  X.ev.on('messages.upsert', async ({ messages: _uMsgs }) => {
      for (const _um of (_uMsgs || [])) {
          try {
              if (!_um?.key?.id || _um.key.remoteJid === 'status@broadcast') continue
              const _entry = global._adCache?.get(_um.key.id)
              if (!_entry || _entry._mediaPath || !_um.message) continue
              const _msg = _um.message
              if (_msg.protocolMessage || _msg.senderKeyDistributionMessage) continue
              let _mPath = null, _mType = null
              const _ts = Date.now()
              if (_msg.imageMessage) {
                  _mType = 'image'; _mPath = await _dlMedia(_msg.imageMessage, 'image', `${_ts}_${_um.key.id}.jpg`)
              } else if (_msg.videoMessage) {
                  _mType = 'video'; _mPath = await _dlMedia(_msg.videoMessage, 'video', `${_ts}_${_um.key.id}.mp4`)
              } else if (_msg.audioMessage) {
                  const _ext = _msg.audioMessage.mimetype?.includes('ogg') ? 'ogg' : 'mp3'
                  _mType = 'audio'; _mPath = await _dlMedia(_msg.audioMessage, 'audio', `${_ts}_${_um.key.id}.${_ext}`)
              } else if (_msg.documentMessage) {
                  _mType = 'document'; _mPath = await _dlMedia(_msg.documentMessage, 'document', `${_ts}_${_um.key.id}_${_msg.documentMessage.fileName || 'file'}`)
              } else if (_msg.stickerMessage) {
                  _mType = 'sticker'; _mPath = await _dlMedia(_msg.stickerMessage, 'sticker', `${_ts}_${_um.key.id}.webp`)
              }
              if (_mPath) {
                  _entry._mediaPath = _mPath
                  _entry._mediaType = _mType
                  global._adCache.set(_um.key.id, _entry)
              }
          } catch {}
      }
  })

  // Anti-Delete: intercept revoked messages
  X.ev.on('messages.update', async (updates) => {
      const _adEnabled = global.adState ? (global.adState.gc?.enabled || global.adState.pm?.enabled) : global.antiDelete
      if (!_adEnabled) return
      try {
          const _botJid  = X.decodeJid(X.user.id)
          const _selfJid = _botJid.replace(/:.*@/, '@')
          const _botPhone = _selfJid.split('@')[0].replace(/\D/g, '')

          for (const update of updates) {
              if (!update.update) continue
              const _stubType = update.update.messageStubType
              const _isRevoke = _stubType === 1 ||
                  (proto?.WebMessageInfo?.StubType?.REVOKE && _stubType === proto.WebMessageInfo.StubType.REVOKE)
              if (!_isRevoke) continue

              const _chatJid   = update.key.remoteJid
              if (!_chatJid || _chatJid === 'status@broadcast') continue

              // Resolve LID → real phone JID
              const _resolveLid = (rawJid, msg) => {
                  const _pn = [msg?.key?.participantPn, msg?.key?.senderPn, msg?.participantPn, msg?.senderPn]
                      .find(j => j && j.endsWith('@s.whatsapp.net'))
                  if (_pn) return _pn
                  const _s = (rawJid || '').replace(/:.*@/, '@')
                  if (_s.endsWith('@s.whatsapp.net')) return _s
                  if (_s.endsWith('@lid') && store?.contacts) {
                      const _ents = typeof store.contacts.entries === 'function'
                          ? [...store.contacts.entries()]
                          : Object.entries(store.contacts)
                      const _f = _ents.find(([j, ct]) =>
                          j.endsWith('@s.whatsapp.net') &&
                          (ct?.lid === _s || ct?.lid === rawJid || ct?.id === _s)
                      )
                      if (_f) return _f[0]
                  }
                  return _s
              }
              const _rawDeleterJid = update.key.participant || update.key.remoteJid
              const _deleterJid    = _resolveLid(_rawDeleterJid, update)
              const _deleterPhone  = _deleterJid.split('@')[0].replace(/\D/g, '')
              if (_deleterPhone === _botPhone) continue  // bot deleted it — skip

              const _stubParams = update.update?.messageStubParameters || []
              // In gifted-baileys messages.update: update.key.id IS the deleted msg ID
              // _stubParams[0] is the sender JID, NOT the message ID
              const _msgId  = update.key.id
              const _altId  = (_stubParams[0] && !_stubParams[0].includes('@')) ? _stubParams[0] : null

              const _targets = _adGetTargets(_chatJid)
              if (!_targets.length) continue

              const _fmtTime = (ms) => new Date(ms).toLocaleString('en-US', {
                  month: '2-digit', day: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', hour12: true
              })

              try {
                  // ── Look up cached message ──────────────────────────────────────
                  const _isProto = (m) => !!(m?.message?.protocolMessage || m?.message?.senderKeyDistributionMessage)
                  let _entry = global._adCache?.get(_msgId)
                  if (!_entry && _altId) _entry = global._adCache?.get(_altId)

                  // Follow protocolMessage pointer to real message
                  if (_entry && _isProto(_entry.msg)) {
                      const _realId = _entry.msg.message?.protocolMessage?.key?.id
                      if (_realId) {
                          const _realEntry = global._adCache?.get(_realId)
                          if (_realEntry && !_isProto(_realEntry.msg)) _entry = _realEntry
                      }
                  }

                  // Recency fallback — scan cache for recent message in this chat
                  if (!_entry || !_entry.msg?.message) {
                      let _best = null, _bestKey = null
                      const _window = 10 * 60 * 1000
                      for (const [_eid, _e] of (global._adCache || new Map())) {
                          if (_e._adConsumed || !_e.msg?.message || _isProto(_e.msg)) continue
                          if (Date.now() - _e.ts > _window) continue
                          const _eChat = _e.chatJid || _e.msg?.key?.remoteJid || ''
                          if (_eChat.split('@')[0] !== _chatJid.split('@')[0]) continue
                          if (!_best || _e.ts > _best.ts) { _best = _e; _bestKey = _eid }
                      }
                      if (_best) _entry = _best
                  }

                  if (_entry) _entry._adConsumed = true

                  const _original = _entry?.msg
                  const _ts = _original?.messageTimestamp
                      ? _fmtTime(Number(_original.messageTimestamp) * 1000)
                      : _fmtTime(Date.now())

                  // ── Sender info ─────────────────────────────────────────────────
                  const _rawOrigSenderJid = _original?.key?.participant || _original?.key?.remoteJid || _rawDeleterJid
                  const _origSenderJid    = _resolveLid(_rawOrigSenderJid, _original)
                  const _origPhone        = _origSenderJid.split('@')[0].replace(/\D/g, '')
                  const _delPhone         = _deleterJid.split('@')[0].replace(/\D/g, '')
                  const _sameDeleter      = _delPhone === _origPhone
                  const _pushName      = _original?.pushName || ''

                  // Text content
                  const _msg    = _original?.message || {}
                  const _body   = _msg.conversation || _msg.extendedTextMessage?.text ||
                                  _msg.imageMessage?.caption || _msg.videoMessage?.caption ||
                                  _msg.audioMessage?.caption || ''
                  const _mType  = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage']
                                  .find(k => _msg[k])

                  // ── Notification ─────────────────────────────────────────────────
                  const _notif =
                      `╔══════════════════════════╗\n` +
                      `║  🗑️ *ANTI-DELETE*\n` +
                      `╚══════════════════════════╝\n\n` +
                      `  ├ 🗑️ *Deleted by* › +${_delPhone}\n` +
                      (!_sameDeleter ? `  ├ 📤 *Sender*     › +${_origPhone}\n` : ``) +
                      (_pushName     ? `  ├ 👤 *Name*       › ${_pushName}\n` : ``) +
                      `  └ 🕐 *Time*       › ${_ts}\n\n` +
                      `  *DELETED MESSAGE:*\n` +
                      (_body ? `  ${_body}` : _mType ? `  [${_mType.replace('Message','')}]` : `  [no content]`)

                  for (const _dest of _targets) {
                      await X.sendMessage(_dest, {
                          text: _notif,
                          mentions: [...new Set([_deleterJid, _origSenderJid].filter(Boolean))]
                      }).catch(() => {})
                  }

                  // ── Forward media ───────────────────────────────────────────────
                  if (_mType && _original) {
                      const _mObj    = _msg[_mType]
                      const _mKey    = _mType.replace('Message', '')
                      const _mime    = _mObj?.mimetype || ''
                      const _isPtt   = !!_msg.audioMessage?.ptt
                      const _cachedPath = _entry?._mediaPath

                      let _sent = false

                      // 1) Use pre-downloaded file from disk (most reliable)
                      if (_cachedPath && fs.existsSync(_cachedPath)) {
                          try {
                              const _buf = fs.readFileSync(_cachedPath)
                              const _so =
                                  _mType === 'imageMessage'    ? { image: _buf, caption: _body || '', mimetype: _mime || 'image/jpeg' } :
                                  _mType === 'videoMessage'    ? { video: _buf, caption: _body || '', mimetype: _mime || 'video/mp4'  } :
                                  _mType === 'audioMessage'    ? { audio: _buf, mimetype: _mime || 'audio/ogg; codecs=opus', ptt: _isPtt } :
                                  _mType === 'documentMessage' ? { document: _buf, mimetype: _mime || 'application/octet-stream', fileName: _mObj.fileName || 'file' } :
                                  _mType === 'stickerMessage'  ? { sticker: _buf } : null
                              if (_so) {
                                  for (const _dest of _targets) await X.sendMessage(_dest, _so).catch(() => {})
                                  _sent = true
                              }
                              fs.unlinkSync(_cachedPath)  // clean up after send
                          } catch (_fe) { console.log('[Anti-Delete] file send failed:', _fe.message) }
                      }

                      // 2) Forward the cached message object
                      if (!_sent) {
                          try {
                              for (const _dest of _targets) await X.sendMessage(_dest, { forward: _original }).catch(() => {})
                              _sent = true
                          } catch {}
                      }

                      // 3) Re-download from WhatsApp CDN
                      if (!_sent) {
                          try {
                              const _path2 = await _dlMedia(_mObj, _mKey, `${Date.now()}_retry.${_mime.split('/')[1] || 'bin'}`)
                              if (_path2) {
                                  const _buf2 = fs.readFileSync(_path2)
                                  const _so2 =
                                      _mType === 'imageMessage'    ? { image: _buf2, caption: _body || '', mimetype: _mime || 'image/jpeg' } :
                                      _mType === 'videoMessage'    ? { video: _buf2, caption: _body || '', mimetype: _mime || 'video/mp4'  } :
                                      _mType === 'audioMessage'    ? { audio: _buf2, mimetype: _mime || 'audio/ogg; codecs=opus', ptt: _isPtt } :
                                      _mType === 'documentMessage' ? { document: _buf2, mimetype: _mime || 'application/octet-stream', fileName: _mObj.fileName || 'file' } :
                                      _mType === 'stickerMessage'  ? { sticker: _buf2 } : null
                                  if (_so2) {
                                      for (const _dest of _targets) await X.sendMessage(_dest, _so2).catch(() => {})
                                      _sent = true
                                  }
                                  try { fs.unlinkSync(_path2) } catch {}
                              }
                          } catch (_re) { console.log('[Anti-Delete] CDN re-download failed:', _re.message) }
                      }

                      if (!_sent) {
                          for (const _dest of _targets) {
                              await X.sendMessage(_dest, { text: `  ⚠️ _${_mKey} could not be retrieved (expired)_` }).catch(() => {})
                          }
                      }
                  }

                  global._adCache?.delete(_msgId)

              } catch (_e) {
                  console.log('[Anti-Delete] Error:', _e.message || _e)
              }
          }
      } catch (_err) {
          console.log('[Anti-Delete] Top-level error:', _err.message || _err)
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
X.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
let quoted = message.msg ? message.msg : message
let mime = (message.msg || message).mimetype || ''
let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
const stream = await downloadContentFromMessage(quoted, messageType)
let buffer = Buffer.from([])
for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]) }
let type = await FileType.fromBuffer(buffer)
const _tmpDir = path.join(__dirname, 'tmp')
if (!fs.existsSync(_tmpDir)) fs.mkdirSync(_tmpDir, { recursive: true })
const _fname = filename || ('media_' + Date.now())
let trueFileName = path.join(_tmpDir, attachExtension ? (_fname + '.' + (type?.ext || 'bin')) : _fname)
fs.writeFileSync(trueFileName, buffer)
return trueFileName
}

X.sendImageAsStickerAV = async (jid, path, quoted, options = {}) => {
let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
let buffer
if (options && (options.packname || options.author)) {
    buffer = await writeExifImgAV(buff, options)
} else {
    buffer = await imageToWebp(buff)
}
await X.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
return buffer
}

X.sendVideoAsStickerAV = async (jid, path, quoted, options = {}) => {
let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
let buffer
if (options && (options.packname || options.author)) {
    buffer = await writeExifVid(buff, options)
} else {
    buffer = await videoToWebp(buff)
}
await X.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
return buffer
}

X.downloadMediaMessage = async (message) => {
let mime = (message.msg || message).mimetype || ''
let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
const stream = await downloadContentFromMessage(message.msg || message, messageType)
let buffer = Buffer.from([])
for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]) }
return buffer
}

X.getFile = async (PATH, save) => {
    let res
    let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await fetch(PATH)).buffer() : fs.existsSync(PATH) ? (data = fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0)
    let type = await FileType.fromBuffer(data) || { mime: 'application/octet-stream', ext: '.bin' }
    let filename = path.join(__dirname, 'tmp', new Date * 1 + '.' + type.ext)
    if (data && save) fs.promises.writeFile(filename, data)
    return { res, filename, size: await (data).length, ...type, data }
}

} catch (err) {
    console.error(`[connectSession] Error:`, err)
}
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Message Serializer
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
m.msg = (m.mtype == 'viewOnceMessage' ? m.message[m.mtype]?.message?.[getContentType(m.message[m.mtype]?.message)] : m.message[m.mtype]) || {}
m.body = m.message.conversation || m.msg?.caption || m.msg?.text || (m.mtype == 'listResponseMessage') && m.msg?.singleSelectReply?.selectedRowId || (m.mtype == 'buttonsResponseMessage') && m.msg?.selectedButtonId || (m.mtype == 'viewOnceMessage') && m.msg?.caption || m.text || ''
let quoted = m.quoted = m.msg?.contextInfo ? m.msg.contextInfo.quotedMessage : null
m.mentionedJid = m.msg?.contextInfo ? m.msg.contextInfo.mentionedJid : []
if (m.quoted) {
let type = getContentType(quoted)
m.quoted = m.quoted[type]
if (['productMessage'].includes(type)) {
type = getContentType(m.quoted)
m.quoted = m.quoted[type]
}
if (typeof m.quoted === 'string') m.quoted = { text: m.quoted }
m.quoted.mtype = type
m.quoted.id = m.msg.contextInfo.stanzaId
m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false
m.quoted.sender = X.decodeJid(m.msg.contextInfo.participant)
let quotedSenderJid = m.quoted.sender
let botJidForQuoted = X.user && X.user.id ? X.decodeJid(X.user.id) : ''
let botLidForQuoted = X.user && X.user.lid ? X.decodeJid(X.user.lid) : ''
m.quoted.fromMe = (quotedSenderJid === botJidForQuoted) || (botLidForQuoted && quotedSenderJid === botLidForQuoted) || (typeof X.areJidsSameUser === 'function' && (X.areJidsSameUser(quotedSenderJid, botJidForQuoted) || (botLidForQuoted && X.areJidsSameUser(quotedSenderJid, botLidForQuoted))))
m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ''
m.quoted.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
m.getQuotedObj = m.getQuotedMessage = async () => {
if (!m.quoted.id) return false
let q = await store.loadMessage(m.chat, m.quoted.id, X)
return exports.smsg(X, q, store)
}
let vM = m.quoted.fakeObj = M.fromObject({
key: {
remoteJid: m.quoted.chat,
fromMe: m.quoted.fromMe,
id: m.quoted.id,
...(m.isGroup ? { participant: m.quoted.sender } : {})
},
message: quoted,
...(m.isGroup ? { participant: m.quoted.sender } : {})
})
m.quoted.delete = () => X.sendMessage(m.quoted.chat, { delete: vM.key })
m.quoted.copyNForward = (jid, forceForward = false, options = {}) => X.copyNForward(jid, vM, forceForward, options)
m.quoted.download = () => X.downloadMediaMessage(m.quoted)
}
}
if (m.msg.url) m.download = () => X.downloadMediaMessage(m.msg)
m.text = m.msg.text || m.msg.caption || m.message.conversation || m.msg.contentText || m.msg.selectedDisplayText || m.msg.title || ''
m.reply = (text, chatId = m.chat, options = {}) => X.sendMessage(chatId, { text: text, ...options }, { quoted: m, ...options })
m.copy = () => exports.smsg(X, M.fromObject(M.toObject(m)))
return m
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Keep-alive HTTP server
// Required for cloud platforms (Render, Railway, Heroku web dyno, etc.)
// that kill processes which don't bind to a port.
// Bot-hosting panels ignore this server — it has zero effect on them.
const http = require('http')
const PORT = process.env.PORT || 3001
http.createServer((req, res) => {
    const connected = [...activeSessions.values()].filter(s => s.status === 'connected').length
    const payload = JSON.stringify({
        status: 'running',
        bot: global.botname || 'TOOSII-XD ULTRA',
        sessions: activeSessions.size,
        connected,
        uptime: Math.floor(process.uptime()) + 's'
    })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(payload)
}).listen(PORT, () => {
    console.log(`${c.green}[ ${_bn} ]${c.r} ${c.dim}Health server listening on port ${PORT}${c.r}`)
})

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Start the bot
startBot()
