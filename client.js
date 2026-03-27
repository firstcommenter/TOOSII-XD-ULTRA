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
const {
    downloadContentFromMessage,
    proto,
    generateWAMessageContent,
    generateWAMessageFromContent,
    areJidsSameUser,
    useMultiFileAuthState,
    Browsers,
  } = require("gifted-baileys")
  // delay is a baileys util; polyfill for forward-compat
  const delay = require("gifted-baileys").delay
    ?? ((ms) => new Promise(r => setTimeout(r, ms)))
  const os = require('os')
const fs = require('fs')
const fg = require('api-dylux')
const fetch = require('node-fetch');
// Safe JSON fetch — never throws "not valid JSON", returns null on HTML/error responses
const safeJson = async (url, opts = {}) => {
    try {
        const r = await fetch(url, { ...opts, headers: { 'User-Agent': 'TOOSII-XD-ULTRA/2.0', ...(opts.headers || {}) } })
        const text = await r.text()
        if (text.trimStart().startsWith('<')) return null  // HTML response (404 page etc)
        return JSON.parse(text)
    } catch { return null }
}
// Patch fetch Response to never throw on HTML — returns null instead
const _origJson = require('node-fetch').Response.prototype.json
require('node-fetch').Response.prototype.json = async function() {
    const text = await this.text()
    if (text.trimStart().startsWith('<')) {
        console.warn('[API] HTML response received instead of JSON — API may be down')
        return null
    }
    try { return JSON.parse(text) } catch(e) {
        console.warn('[API] Invalid JSON response:', text.slice(0, 80))
        return null
    }
}

const util = require('util')

  //═══════════════════════════════════════════════════════════════════════════//
  // ── GiftedTech key rotator + Endless Invidious pool ──────────────────────//
  //═══════════════════════════════════════════════════════════════════════════//

  // Key pool: set GIFTED_API_KEYS=key1,key2,key3 in .env for endless rotation
  // Falls back to the free 'gifted' key if no custom keys are configured
  const _GIFTED_POOL = (() => {
      const raw = process.env.GIFTED_API_KEYS || process.env.GIFTED_API_KEY || ''
      const keys = raw.split(',').map(k => k.trim()).filter(Boolean)
      return [...new Set([...keys, 'gifted'])]
  })()
  let _giftedIdx = 0
  // Returns next key in round-robin order
  function _giftedKey() {
      const key = _GIFTED_POOL[_giftedIdx % _GIFTED_POOL.length]
      _giftedIdx = (_giftedIdx + 1) % _GIFTED_POOL.length
      return key
  }
  // giftedFetch: auto-rotates keys, retries all keys on rate-limit (403)
  async function giftedFetch(urlTemplate, opts = {}) {
      let lastData = null
      const tried = new Set()
      for (let attempt = 0; attempt < _GIFTED_POOL.length * 2; attempt++) {
          const key = _giftedKey()
          if (tried.has(key) && tried.size >= _GIFTED_POOL.length) break
          tried.add(key)
          const url = urlTemplate.replace(/apikey=[^&s`'"]+/g, `apikey=${key}`)
          try {
              const r = await fetch(url, { ...opts })
              const data = await r.json()
              if (!data) continue
              const msg = (data.message || '').toLowerCase()
              const isRateLimit = data.status === 403 ||
                  (data.success === false && (msg.includes('limit') || msg.includes('exceeded') || msg.includes('invalid') && msg.includes('key')))
              if (isRateLimit) { lastData = data; continue }
              return data
          } catch(e) { lastData = { success: false, message: e.message } }
      }
      return lastData || { success: false, message: 'All API keys exhausted' }
  }

  // ── Endless Invidious pool — starts with 20 known instances, auto-refreshes hourly ──
  let _invPool = [
      'https://invidious.privacydev.net',  'https://inv.tux.pizza',
      'https://invidious.nerdvpn.de',      'https://invidious.fdn.fr',
      'https://iv.datura.network',         'https://invidious.perennialte.ch',
      'https://yewtu.be',                  'https://invidious.kavin.rocks',
      'https://invidious.projectsegfau.lt','https://invidious.flokinet.to',
      'https://vid.puffyan.us',            'https://y.com.sb',
      'https://invidious.slipfox.xyz',     'https://invidious.snopyta.org',
      'https://invidious.tiekoetter.com',  'https://invidious.esmailelbob.xyz',
      'https://invidious.poast.org',       'https://inv.riverside.rocks',
      'https://invidious.dhusch.de',       'https://invidious.namazso.eu',
  ]
  let _invLastRefresh = 0
  async function _refreshInvPool() {
      try {
          const r = await fetch('https://api.invidious.io/instances.json', { signal: AbortSignal.timeout(12000) })
          const data = await r.json()
          if (!Array.isArray(data)) return
          const live = data
              .filter(([, info]) => info?.api && info?.type === 'https')
              .map(([uri]) => uri)
          if (live.length >= 5) {
              _invPool = live
              console.log(`[INVIDIOUS] Pool updated: ${live.length} live instances`)
          }
          _invLastRefresh = Date.now()
      } catch(e) { console.log('[INVIDIOUS] Refresh failed:', e.message) }
  }
  async function getInvPool() {
      if (Date.now() - _invLastRefresh > 3600000) _refreshInvPool().catch(() => {})
      return _invPool
  }

  //═══════════════════════════════════════════════════════════════════════════//
  // ── Multi-source Sports Data Helpers (endless fallback chain) ─────────────//
  // Sources: GiftedTech → ESPN (keyless) → TheSportsDB (keyless) → Football-Data.org
  //═══════════════════════════════════════════════════════════════════════════//

  const _ESPN_IDS  = { epl:'eng.1', laliga:'esp.1', bundesliga:'ger.1', seriea:'ita.1', ucl:'uefa.champions', uel:'uefa.europa', ligue1:'fra.1' }
  const _TSDB_IDS  = { epl:4328, laliga:4335, bundesliga:4331, seriea:4332, ucl:4480, ligue1:4334, uel:4481 }
  const _FD_CODES  = { epl:'PL', laliga:'PD', bundesliga:'BL1', seriea:'SA', ucl:'CL', uel:'EL', ligue1:'FL1' }

  // ── ESPN unofficial standings ─────────────────────────────────────────────
  async function _espnStandings(league) {
      try {
          const id = _ESPN_IDS[league]; if (!id) return null
          const d = await safeJson(`https://site.api.espn.com/apis/v2/sports/soccer/${id}/standings`, { signal: AbortSignal.timeout(12000) })
          const entries = d?.standings?.[0]?.entries || d?.children?.[0]?.standings?.[0]?.entries
          if (!entries?.length) return null
          return entries.map((e, i) => ({
              position: i + 1,
              team: e.team?.displayName || e.team?.shortDisplayName || '',
              played:  +( e.stats?.find(s => s.name==='gamesPlayed')?.value  || 0),
              won:     +( e.stats?.find(s => s.name==='wins')?.value          || 0),
              draw:    +( e.stats?.find(s => s.name==='ties')?.value          || 0),
              lost:    +( e.stats?.find(s => s.name==='losses')?.value        || 0),
              goalDifference: +( e.stats?.find(s => s.name==='pointDifferential'||s.name==='goalDifferential')?.value || 0),
              points:  +( e.stats?.find(s => s.name==='points')?.value        || 0),
          }))
      } catch { return null }
  }

  // ── TheSportsDB standings ─────────────────────────────────────────────────
  async function _tsdbStandings(league) {
      try {
          const id = _TSDB_IDS[league]; if (!id) return null
          const yr = new Date().getFullYear()
          const d = await safeJson(`https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${id}&s=${yr-1}-${yr}`, { signal: AbortSignal.timeout(12000) })
          if (!d?.table?.length) return null
          return d.table.map(t => ({
              position: +t.intRank||0, team: t.strTeam||'',
              played: +t.intPlayed||0, won: +t.intWin||0, draw: +t.intDraw||0,
              lost: +t.intLoss||0, goalDifference: +t.intGoalDifference||0, points: +t.intPoints||0,
          }))
      } catch { return null }
  }

  // ── Football-Data.org standings (uses FOOTBALL_DATA_API_KEY env var if set) ─
  async function _fdStandings(league) {
      try {
          const code = _FD_CODES[league]; if (!code) return null
          const hdrs = {}; if (process.env.FOOTBALL_DATA_API_KEY) hdrs['X-Auth-Token'] = process.env.FOOTBALL_DATA_API_KEY
          const d = await safeJson(`https://api.football-data.org/v4/competitions/${code}/standings`, { headers: hdrs, signal: AbortSignal.timeout(12000) })
          const table = d?.standings?.find(s => s.type==='TOTAL')?.table; if (!table?.length) return null
          return table.map(t => ({ position: t.position, team: t.team?.name||'', played: t.playedGames||0, won: t.won||0, draw: t.draw||0, lost: t.lost||0, goalDifference: t.goalDifference||0, points: t.points||0 }))
      } catch { return null }
  }

  // ── Master standings: GiftedTech → ESPN → TheSportsDB → Football-Data ───────
  async function _getStandings(league, gtPath) {
      try {
          const d = await giftedFetch(`https://api.giftedtech.co.ke/api/football/${gtPath}/standings?apikey=gifted`, { signal: AbortSignal.timeout(20000) })
          const t = d?.result?.standings || d?.result; if (Array.isArray(t) && t.length) return t
      } catch {}
      return (await _espnStandings(league)) || (await _tsdbStandings(league)) || (await _fdStandings(league))
  }

  // ── ESPN top scorers ──────────────────────────────────────────────────────
  async function _espnScorers(league) {
      try {
          const id = _ESPN_IDS[league]; if (!id) return null
          const d = await safeJson(`https://site.web.api.espn.com/apis/v2/sports/soccer/${id}/leaders`, { signal: AbortSignal.timeout(12000) })
          const cats = d?.leaders || []; const goals = cats.find(c => c.name==='goals' || c.shortDisplayName?.toLowerCase().includes('goal'))
          if (!goals?.leaders?.length) return null
          return goals.leaders.map((l, i) => ({ rank: i+1, player: l.athlete?.displayName||l.athlete?.fullName||'', team: l.team?.displayName||l.team?.abbreviation||'', goals: l.value||0, played: l.gamesPlayed||0 }))
      } catch { return null }
  }

  // ── Football-Data.org scorers ─────────────────────────────────────────────
  async function _fdScorers(league) {
      try {
          const code = _FD_CODES[league]; if (!code) return null
          const hdrs = {}; if (process.env.FOOTBALL_DATA_API_KEY) hdrs['X-Auth-Token'] = process.env.FOOTBALL_DATA_API_KEY
          const d = await safeJson(`https://api.football-data.org/v4/competitions/${code}/scorers`, { headers: hdrs, signal: AbortSignal.timeout(12000) })
          if (!d?.scorers?.length) return null
          return d.scorers.map((s, i) => ({ rank: i+1, player: s.player?.name||'', team: s.team?.name||'', goals: s.goals||0, assists: s.assists||0, played: s.playedMatches||0 }))
      } catch { return null }
  }

  // ── Master scorers: GiftedTech → ESPN → Football-Data ────────────────────
  async function _getScorers(league, gtPath, label) {
      try {
          const d = await giftedFetch(`https://api.giftedtech.co.ke/api/football/${gtPath}/scorers?apikey=gifted`, { signal: AbortSignal.timeout(20000) })
          const sc = d?.result?.topScorers || d?.result?.scorers || d?.result; if (Array.isArray(sc) && sc.length) return sc
      } catch {}
      return (await _espnScorers(league)) || (await _fdScorers(league))
  }

  // ── ESPN fixtures/scoreboard ──────────────────────────────────────────────
  async function _espnFixtures(league) {
      try {
          const id = _ESPN_IDS[league]; if (!id) return null
          const d = await safeJson(`https://site.api.espn.com/apis/v2/sports/soccer/${id}/scoreboard`, { signal: AbortSignal.timeout(12000) })
          if (!d?.events?.length) return null
          return d.events.map(e => {
              const comp = e.competitions?.[0]; const comps = comp?.competitors||[]
              const home = comps.find(c => c.homeAway==='home'); const away = comps.find(c => c.homeAway==='away')
              const st = comp?.status?.type
              return { homeTeam: home?.team?.displayName||'', awayTeam: away?.team?.displayName||'', date: e.date?.slice(0,10)||'', time: e.date?.slice(11,16)||'', venue: comp?.venue?.fullName||'', status: st?.description||st?.name||'', homeScore: home?.score, awayScore: away?.score }
          })
      } catch { return null }
  }

  // ── TheSportsDB next matches ──────────────────────────────────────────────
  async function _tsdbFixtures(league) {
      try {
          const id = _TSDB_IDS[league]; if (!id) return null
          const d = await safeJson(`https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${id}`, { signal: AbortSignal.timeout(12000) })
          if (!d?.events?.length) return null
          return d.events.map(e => ({ homeTeam: e.strHomeTeam||'', awayTeam: e.strAwayTeam||'', date: e.dateEvent||'', time: e.strTime||'', venue: e.strVenue||'' }))
      } catch { return null }
  }

  // ── Football-Data.org scheduled matches ──────────────────────────────────
  async function _fdFixtures(league) {
      try {
          const code = _FD_CODES[league]; if (!code) return null
          const hdrs = {}; if (process.env.FOOTBALL_DATA_API_KEY) hdrs['X-Auth-Token'] = process.env.FOOTBALL_DATA_API_KEY
          const d = await safeJson(`https://api.football-data.org/v4/competitions/${code}/matches?status=SCHEDULED`, { headers: hdrs, signal: AbortSignal.timeout(12000) })
          if (!d?.matches?.length) return null
          return d.matches.slice(0, 15).map(m => ({ homeTeam: m.homeTeam?.name||'', awayTeam: m.awayTeam?.name||'', date: m.utcDate?.slice(0,10)||'', time: m.utcDate?.slice(11,16)||'' }))
      } catch { return null }
  }

  // ── Master fixtures: GiftedTech → ESPN → TheSportsDB → Football-Data ─────
  async function _getFixtures(league, gtUrl) {
      try {
          const d = await giftedFetch(gtUrl, { signal: AbortSignal.timeout(20000) })
          const m = d?.result?.upcomingMatches || d?.result?.matches || d?.result; if (Array.isArray(m) && m.length) return m
      } catch {}
      return (await _espnFixtures(league)) || (await _tsdbFixtures(league)) || (await _fdFixtures(league))
  }

  // ── Multi-source live scores ──────────────────────────────────────────────
  async function _getLiveScores() {
      // Source 1: GiftedTech
      try {
          const d = await giftedFetch(`https://api.giftedtech.co.ke/api/football/livescore?apikey=gifted`, { signal: AbortSignal.timeout(20000) })
          const m = d?.result?.matches || d?.result; if (Array.isArray(m) && m.length) return { source: 'GiftedTech', matches: m }
      } catch {}
      // Source 2: ESPN across top leagues (live events)
      try {
          const leagues = ['eng.1','esp.1','ger.1','ita.1','fra.1','uefa.champions']
          const live = []
          await Promise.allSettled(leagues.map(async id => {
              const d = await safeJson(`https://site.api.espn.com/apis/v2/sports/soccer/${id}/scoreboard`, { signal: AbortSignal.timeout(10000) })
              ;(d?.events || []).filter(e => e.status?.type?.state === 'in').forEach(e => {
                  const c = e.competitions?.[0]; const cp = c?.competitors||[]
                  const h = cp.find(x=>x.homeAway==='home'); const a = cp.find(x=>x.homeAway==='away')
                  live.push({ league: e.name||id, homeTeam: h?.team?.displayName||'', awayTeam: a?.team?.displayName||'', homeScore: h?.score||'0', awayScore: a?.score||'0', status: c?.status?.type?.shortDetail||'LIVE' })
              })
          }))
          if (live.length) return { source: 'ESPN', matches: live }
      } catch {}
      // Source 3: TheSportsDB live events
      try {
          const d = await safeJson(`https://www.thesportsdb.com/api/v1/json/3/eventslive.php`, { signal: AbortSignal.timeout(10000) })
          const events = d?.events
          if (Array.isArray(events) && events.length) {
              const matches = events.filter(e => e.strSport==='Soccer').map(e => ({ league: e.strLeague||'', homeTeam: e.strHomeTeam||'', awayTeam: e.strAwayTeam||'', homeScore: e.intHomeScore||'', awayScore: e.intAwayScore||'', status: e.strProgress||'LIVE' }))
              if (matches.length) return { source: 'TheSportsDB', matches }
          }
      } catch {}
      return null
  }

  // ── Multi-source football news (BBC/ESPN RSS + GiftedTech) ────────────────
  async function _getFootballNews() {
      // Source 1: GiftedTech
      try {
          const d = await giftedFetch(`https://api.giftedtech.co.ke/api/football/news?apikey=gifted`, { signal: AbortSignal.timeout(20000) })
          const a = d?.result?.items || d?.result; if (Array.isArray(a) && a.length) return a
      } catch {}
      // Source 2: ESPN soccer RSS
      try {
          const r = await fetch(`https://www.espn.com/espn/rss/soccer/news`, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } })
          const xml = await r.text()
          const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map(m => {
              const title = m[1].match(/<title><![CDATA[(.*?)]]>/)?.[1] || m[1].match(/<title>(.*?)<\/title>/)?.[1] || ''
              const link  = m[1].match(/<link>(.*?)<\/link>/)?.[1] || ''
              const desc  = m[1].match(/<description><![CDATA[(.*?)]]>/)?.[1]?.replace(/<[^>]+>/g,'')?.slice(0,120) || ''
              return { title, summary: desc, link }
          }).filter(a => a.title)
          if (items.length) return items
      } catch {}
      // Source 3: BBC Sport football RSS
      try {
          const r = await fetch(`https://feeds.bbci.co.uk/sport/football/rss.xml`, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } })
          const xml = await r.text()
          const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map(m => {
              const title = m[1].match(/<title>(.*?)<\/title>/)?.[1]?.replace(/<![CDATA[|]]>/g,'').replace(/&amp;/g,'&')||''
              const link  = m[1].match(/<link>(.*?)<\/link>/)?.[1] || ''
              return { title, link }
          }).filter(a => a.title)
          if (items.length) return items
      } catch {}
      return null
  }

  // ── Multi-source predictions (GiftedTech + ESPN form-based) ──────────────
  async function _getPredictions() {
      // Source 1: GiftedTech
      try {
          const d = await giftedFetch(`https://api.giftedtech.co.ke/api/football/predictions?apikey=gifted`, { signal: AbortSignal.timeout(20000) })
          const p = Array.isArray(d?.result) ? d.result : (d?.result?.items||[]); if (p.length) return p
      } catch {}
      // Source 2: Footystats upcoming (unofficial, no key for basic access)
      try {
          const d = await safeJson('https://api.football-prediction-api.com/api/v2/predictions?market=classic&iso_date=' + new Date().toISOString().slice(0,10), { headers: { 'Authorization': 'Bearer free' }, signal: AbortSignal.timeout(10000) })
          if (d?.data?.length) return d.data.slice(0,10).map(m => ({ league: m.competition_name||'', match: `${m.home_team} vs ${m.away_team}`, time: m.start_date||'', predictions: { fulltime: { home: m.home_win_probability||0, draw: m.draw_probability||0, away: m.away_win_probability||0 } } }))
      } catch {}
      return null
  }

  //─────────────────────────────────────────────────────────────────────────────//
    // Kick off background refresh 5s after startup
  setTimeout(() => _refreshInvPool().catch(() => {}), 5000)

  //─────────────────────────────────────────────────────────────────────────────//
  const axios = require('axios')
const { exec, execSync } = require("child_process")
const chalk = require('chalk')
const nou = require('node-os-utils')
const moment = require('moment-timezone');
const path = require ('path');
const didyoumean = require('didyoumean');
const similarity = require('similarity');
const speed = require('performance-now')
const { Sticker } = require('wa-sticker-formatter');
const { igdl } = require("btch-downloader");
const yts = require ('yt-search');
const FormData = require('form-data');
//> Scrape <//
const jktNews = require('./library/scrape/jktNews');
const otakuDesu = require('./library/scrape/otakudesu');
const Kusonime = require('./library/scrape/kusonime');
const { quote } = require('./library/scrape/quote.js');
const { fdown } = require('./library/scrape/facebook.js')

const {
        komiku,
        detail
} = require('./library/scrape/komiku');

const {
        wikimedia
} = require('./library/scrape/wikimedia');

const { 
        CatBox, 
        uploadImage
} = require('./library/scrape/uploader');

//━━━━━━━━━━━━━━━━━━━━━━━━//
// ChatBoAI core function — Anthropic API primary, Pollinations fallback
// Always responds in English regardless of input language
async function _runChatBoAI(userMsg, isAutoMode = false) {
    const _sys = isAutoMode
        ? `You are a friendly WhatsApp assistant. Always reply in English only, regardless of the language the user writes in. Keep replies short and conversational — 2 to 4 sentences max. Never use markdown formatting like ** or ##.`
        : `You are ChatBoAI, a smart and helpful assistant. Always reply in English only, no matter what language the user writes in. Be clear, accurate, and helpful. Avoid markdown formatting.`

    // 1. Anthropic Claude API (most reliable)
    try {
        const { default: fetch } = require('node-fetch')
        const _r1 = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY || '',
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 500,
                system: _sys,
                messages: [{ role: 'user', content: userMsg }]
            }),
            signal: AbortSignal.timeout(15000)
        })
        const _d1 = await _r1.json()
        const _t1 = _d1?.content?.[0]?.text?.trim()
        if (_t1?.length > 2) return _t1
    } catch {}

    // 2. Pollinations OpenAI-compatible (free, no key needed)
    try {
        const axios = require('axios')
        const { data: _d2 } = await axios.post('https://text.pollinations.ai/openai', {
            model: 'openai',
            messages: [{ role: 'system', content: _sys }, { role: 'user', content: userMsg }],
            stream: false
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 })
        const _t2 = _d2?.choices?.[0]?.message?.content?.trim()
        if (_t2?.length > 2) return _t2
    } catch {}

    // 3. Pollinations GET fallback
    try {
        const axios = require('axios')
        const _p3 = encodeURIComponent(`${_sys}\n\nUser: ${userMsg}\n\nAssistant:`)
        const { data: _d3 } = await axios.get(`https://text.pollinations.ai/${_p3}`, { timeout: 12000, responseType: 'text' })
        if (_d3 && typeof _d3 === 'string' && _d3.trim().length > 2) return _d3.trim()
    } catch {}

    throw new Error('All AI services unavailable')
}

// ── General-purpose AI helper — used by all named AI commands ────────────────
// (.feloai, .claudeai, .deepseek, .grok, .mistral, .copilot, etc.)
async function _runAI(systemPrompt, userMsg, maxTokens = 1500) {
    // Embed system prompt into query so persona is respected by APIs that ignore system=
    const _fullQ = encodeURIComponent(systemPrompt + '\n\nUser: ' + userMsg + '\n\nAssistant:')
    const _sysEnc = encodeURIComponent(systemPrompt)
    const _qEnc   = encodeURIComponent(userMsg)

    // 1. GiftedTech GPT-4o — embed system into q for persona compliance
    try {
        const _r = await fetch(`https://api.giftedtech.co.ke/api/ai/gpt4o?apikey=${_giftedKey()}&q=${_fullQ}`, { signal: AbortSignal.timeout(22000) })
        const _d = await _r.json()
        if (_d?.success && _d?.result && String(_d.result).trim().length > 2) return String(_d.result).trim()
    } catch {}

    // 2. GiftedTech Gemini — embed system into q
    try {
        const _r2 = await fetch(`https://api.giftedtech.co.ke/api/ai/gemini?apikey=${_giftedKey()}&q=${_fullQ}`, { signal: AbortSignal.timeout(22000) })
        const _d2 = await _r2.json()
        if (_d2?.success && _d2?.result && String(_d2.result).trim().length > 2) return String(_d2.result).trim()
    } catch {}

    // 3. Pollinations OpenAI-compatible POST (free, no key, respects system role)
    try {
        const { data: _d3 } = await require('axios').post('https://text.pollinations.ai/openai', {
            model: 'openai',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
            max_tokens: maxTokens,
            stream: false
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 25000 })
        const _t3 = _d3?.choices?.[0]?.message?.content?.trim()
        if (_t3?.length > 2) return _t3
    } catch {}

    // 4. Pollinations GET fallback
    try {
        const { data: _d4 } = await require('axios').get(`https://text.pollinations.ai/${_fullQ}`, { timeout: 15000, responseType: 'text' })
        if (_d4 && typeof _d4 === 'string' && _d4.trim().length > 2) return _d4.trim()
    } catch {}

    // 5. Anthropic Claude (if API key configured)
    try {
        const _antKey = process.env.ANTHROPIC_API_KEY || ''
        if (_antKey) {
            const _r5 = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': _antKey, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userMsg }] }),
                signal: AbortSignal.timeout(18000)
            })
            const _d5 = await _r5.json()
            const _t5 = _d5?.content?.[0]?.text?.trim()
            if (_t5?.length > 2) return _t5
        }
    } catch {}

    throw new Error('All AI services unavailable')
}

module.exports = async (X, m, chatUpdate, store) => {
try {
const from = m.key.remoteJid
var body = (m.mtype === 'interactiveResponseMessage') ? JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : (m.mtype === 'conversation') ? m.message.conversation : (m.mtype == 'imageMessage') ? m.message.imageMessage.caption : (m.mtype == 'videoMessage') ? m.message.videoMessage.caption : (m.mtype == 'extendedTextMessage') ? m.message.extendedTextMessage.text : (m.mtype == 'buttonsResponseMessage') ? m.message.buttonsResponseMessage.selectedButtonId : (m.mtype == 'listResponseMessage') ? m.message.listResponseMessage.singleSelectReply.selectedRowId : (m.mtype == 'templateButtonReplyMessage') ? m.message.templateButtonReplyMessage.selectedId : (m.mtype == 'messageContextInfo') ? (m.message.buttonsResponseMessage?.selectedButtonId || m.message.listResponseMessage?.singleSelectReply?.selectedRowId || m.text) : ""
body = body || m.body || m.text || ""
//━━━━━━━━━━━━━━━━━━━━━━━━//
// library
const { smsg, fetchJson, getBuffer, fetchBuffer, getGroupAdmins, TelegraPh, isUrl, hitungmundur, sleep, clockString, checkBandwidth, runtime, tanggal, getRandom } = require('./library/lib/myfunc')

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Main Setting (Admin And Prefix ) 
const budy = body || (typeof m.text === 'string' ? m.text : '');
const mess = global.mess || {};
const prefixRegex = /^[°zZ#$@*+,.?=''():√%!¢£¥€π¤ΠΦ_&><`™©®Δ^βα~¦|/\\©^]/;
const prefix = global.botPrefix ? global.botPrefix : (prefixRegex.test(budy) ? budy.match(prefixRegex)[0] : '.');
const isCmd = global.botPrefix ? budy.startsWith(global.botPrefix) : budy.startsWith(prefix);
const command = isCmd ? budy.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
const args = budy.trim().split(/ +/).slice(1)
const text = q = args.join(" ")
const sender = m.key.fromMe ? (X.user.id.split(':')[0]+'@s.whatsapp.net' || X.user.id) : (m.key.participant || m.key.remoteJid)
const botNumber = await X.decodeJid(X.user.id)
const senderNumber = sender.split('@')[0].split(':')[0]
const botNum = botNumber.split('@')[0].split(':')[0]
const ownerNums = [...global.owner].map(v => v.replace(/[^0-9]/g, ''))

const botJid = X.decodeJid(X.user.id)
let botLidRaw = X.user?.lid || null
if (!botLidRaw) {
    try {
        const _fs = require('fs')
        const _path = require('path')
        const phoneNum = (X.user.id || '').split(':')[0].split('@')[0]
        const credsPaths = [
            _path.join(__dirname, 'sessions', phoneNum, 'creds.json'),
            _path.join(__dirname, 'sessions', 'creds.json'),
            _path.join(__dirname, 'auth_info_baileys', 'creds.json'),
            _path.join(__dirname, '..', 'sessions', phoneNum, 'creds.json'),
            _path.join(__dirname, '..', 'sessions', 'creds.json'),
            _path.join(__dirname, '..', 'auth_info_baileys', 'creds.json'),
        ]
        for (const cp of credsPaths) {
            if (_fs.existsSync(cp)) {
                const creds = JSON.parse(_fs.readFileSync(cp, 'utf-8'))
                if (creds?.me?.lid) {
                    botLidRaw = creds.me.lid
                    X.user.lid = botLidRaw
                    break
                }
            }
        }
    } catch (e) {}
}
const botLid = botLidRaw ? X.decodeJid(botLidRaw) : null

const senderJid = m.sender || sender
const senderFromKey = m.key?.participant ? X.decodeJid(m.key.participant) : null

function isSameUser(participantId, targetId) {
    if (!participantId || !targetId) return false
    try { return areJidsSameUser(participantId, targetId) } catch { }
    const pUser = participantId.split(':')[0].split('@')[0]
    const tUser = targetId.split(':')[0].split('@')[0]
    return pUser === tUser
}

function isParticipantBot(p) {
    if (!p || !p.id) return false
    if (isSameUser(p.id, X.user.id)) return true
    if (X.user?.lid && isSameUser(p.id, X.user.lid)) return true
    if (isSameUser(p.id, botJid)) return true
    if (botLid && isSameUser(p.id, botLid)) return true
    return false
}

function isParticipantSender(p) {
    if (!p || !p.id) return false
    if (isSameUser(p.id, senderJid)) return true
    if (senderFromKey && isSameUser(p.id, senderFromKey)) return true
    if (m.sender && isSameUser(p.id, m.sender)) return true
    if (m.key?.participant && isSameUser(p.id, m.key.participant)) return true
    if (sender && isSameUser(p.id, sender)) return true
    return false
}

const senderClean = senderJid.split(':')[0].split('@')[0]
const senderKeyClean = senderFromKey ? senderFromKey.split(':')[0].split('@')[0] : null
const botClean = botJid.split(':')[0].split('@')[0]

const isOwner = (
    m.key.fromMe ||
    senderClean === botClean ||
    ownerNums.includes(senderClean) ||
    (senderKeyClean && (senderKeyClean === botClean || ownerNums.includes(senderKeyClean)))
) || false

const isGroup = m.isGroup
const pushname = m.pushName || `${senderNumber}`
const isBot = botNumber.split('@')[0].split(':')[0] === senderNumber
const quoted = m.quoted ? m.quoted : m
const mime = (quoted.msg || quoted).mimetype || ''
const groupMetadata = isGroup ? await X.groupMetadata(from).catch(e => null) : null
const groupName = isGroup && groupMetadata ? groupMetadata.subject || '' : ''
const participants = isGroup && groupMetadata ? groupMetadata.participants || [] : []
const groupAdmins = isGroup && participants.length ? await getGroupAdmins(participants) : []

const isBotAdmins = isGroup && participants.length ? participants.some(p => {
    return isParticipantBot(p) && (p.admin === 'admin' || p.admin === 'superadmin')
}) : false

const isAdmins = isGroup ? (isOwner || (participants.length ? participants.some(p => {
    return isParticipantSender(p) && (p.admin === 'admin' || p.admin === 'superadmin')
}) : false)) : false

const isSuperAdmin = isGroup && participants.length ? participants.some(p => {
    return isParticipantSender(p) && p.admin === 'superadmin'
}) : false
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Setting Console
if (m.message) {
    const _mtype = Object.keys(m.message)[0] || 'unknown'
    // Skip noisy protocol/system messages — only log real user content
    const _skipTypes = ['protocolMessage','senderKeyDistributionMessage','messageContextInfo','ephemeralMessage']
    if (!_skipTypes.includes(_mtype)) {
        const _time = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
        const _date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        const _body = budy || (m.mtype ? m.mtype.replace('Message','') : _mtype.replace('Message',''))
        const _preview = _body.length > 60 ? _body.slice(0, 60) + '\u2026' : _body
        const _chatLabel = m.isGroup
            ? 'Group   ' + chalk.cyan(pushname) + chalk.dim(' [' + from.split('@')[0] + ']')
            : 'Private ' + chalk.cyan(pushname) + chalk.dim(' [' + m.sender.split('@')[0] + ']')
        const _icon = m.isGroup ? '\uD83D\uDC65' : '\uD83D\uDCAC'
        const _typeIcons = {imageMessage:'\uD83D\uDDBC\uFE0F ',videoMessage:'\uD83C\uDFA5 ',audioMessage:'\uD83C\uDFB5 ',stickerMessage:'\uD83C\uDF00 ',documentMessage:'\uD83D\uDCC4 ',locationMessage:'\uD83D\uDCCD ',contactMessage:'\uD83D\uDC64 '}
        const _tIcon = _typeIcons[_mtype] || ''
        console.log(
            '\n' +
            chalk.bgCyan(chalk.black(' MSG ')) + ' ' + chalk.dim(_date) + ' ' + chalk.bold(_time) + '\n' +
            chalk.dim('  \u251C ') + chalk.yellow('From    ') + chalk.green(pushname) + chalk.dim(' (' + m.sender.split('@')[0] + ')') + '\n' +
            chalk.dim('  \u251C ') + chalk.yellow(_icon + ' Chat    ') + _chatLabel + '\n' +
            chalk.dim('  \u2514 ') + chalk.yellow('\uD83D\uDCAC Text    ') + chalk.white(_tIcon + _preview)
        )
    }
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Auto Fake Presence (typing/recording/online)
if (global.fakePresence && global.fakePresence !== 'off' && !m.key.fromMe) {
    try {
        if (global.fakePresence === 'typing') {
            await X.sendPresenceUpdate('composing', from)
        } else if (global.fakePresence === 'recording') {
            await X.sendPresenceUpdate('recording', from)
        } else if (global.fakePresence === 'online') {
            await X.sendPresenceUpdate('available')
        }
    } catch(e) {}
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Reply / Reply Message
const reply = (teks) => {
    if (!teks && teks !== 0) return
    const _t = typeof teks === 'string' ? teks.trim() : String(teks)
    if (!_t) return
    X.sendMessage(from, { text: _t }, { quoted: m })
}

const reply2 = (teks) => {
    if (!teks && teks !== 0) return
    const _t = typeof teks === 'string' ? teks.trim() : String(teks)
    if (!_t) return
    X.sendMessage(from, { text: _t }, { quoted: m })
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Function Area
try {
ppuser = await X.profilePictureUrl(m.sender, 'image')
} catch (err) {
ppuser = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png?q=60'
}
try { ppnyauser = await getBuffer(ppuser) } catch { ppnyauser = Buffer.alloc(0) }

const reSize = async(buffer, ukur1, ukur2) => {
   return new Promise(async(resolve, reject) => {
      let jimp = require('jimp')
      var baper = await jimp.read(buffer);
      var ab = await baper.resize(ukur1, ukur2).getBufferAsync(jimp.MIME_JPEG)
      resolve(ab)
   })
}
    let fakethmb
    try { fakethmb = await reSize(ppuser, 300, 300) } catch { fakethmb = ppnyauser || Buffer.alloc(0) }
    // function resize
    let jimp = require("jimp")
const resize = async (image, width, height) => {
    const read = await jimp.read(image);
    const data = await read.resize(width, height).getBufferAsync(jimp.MIME_JPEG);
    return data;
};

const safeSendMedia = async (jid, mediaObj, options = {}, sendOpts = {}) => {
    try {
        for (const key of ['image', 'video', 'audio', 'document', 'sticker']) {
            if (mediaObj[key]) {
                const val = mediaObj[key];
                if (val && typeof val === 'object' && val.url) {
                    if (!val.url || val.url === 'undefined' || val.url === 'null' || val.url === undefined) {
                        return reply('Media URL is not available. The source may be down.');
                    }
                } else if (val === undefined || val === null) {
                    return reply('Media data is not available. Please try again later.');
                }
            }
        }
        await X.sendMessage(jid, mediaObj, sendOpts);
    } catch (err) {
        console.error('Safe media send error:', err.message);
        reply('Failed to send media: ' + (err.message || 'Unknown error'));
    }
};

const userDbPath = './database/users.json';
function loadUsers() {
    try {
        if (!fs.existsSync(userDbPath)) return {};
        return JSON.parse(fs.readFileSync(userDbPath));
    } catch { return {}; }
}
function saveUsers(data) {
    if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
    fs.writeFileSync(userDbPath, JSON.stringify(data, null, 2));
}
function trackUser(senderJid, name, cmd) {
    let users = loadUsers();
    const now = new Date().toISOString();
    if (!users[senderJid]) {
        users[senderJid] = { name: name, firstSeen: now, lastSeen: now, commandCount: 0, commands: {} };
    }
    users[senderJid].name = name;
    users[senderJid].lastSeen = now;
    users[senderJid].commandCount = (users[senderJid].commandCount || 0) + 1;
    if (cmd) {
        users[senderJid].commands[cmd] = (users[senderJid].commands[cmd] || 0) + 1;
    }
    saveUsers(users);
}

if (isCmd && command) {
    trackUser(sender, pushname, command);
    if (!isOwner && !isBot) {
        const userData = loadUsers();
        if (userData[sender]?.banned) {
            return reply('You have been banned from using this bot. Contact the admin for assistance.');
        }
    }
}

if (global.pmBlocker && !m.isGroup && !isOwner && !isBot && !m.key.fromMe) {
    try { await X.updateBlockStatus(m.sender, 'block') } catch {}
    return
}

if (global.autoReact && m.key && !m.key.fromMe) {
    const _skipReactTypes = ['reactionMessage','protocolMessage','senderKeyDistributionMessage','messageContextInfo']
    if (!_skipReactTypes.includes(m.mtype)) {
        try { await X.sendMessage(m.chat, { react: { text: global.autoReactEmoji || '👍', key: m.key } }) } catch {}
    }
}

if (m.isGroup && !isAdmins && !isOwner) {
    if (global.antiBadword && budy) {
        let badwords = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy', 'nigga', 'nigger']
        let hasBadword = badwords.some(w => budy.toLowerCase().includes(w))
        if (hasBadword && isBotAdmins) {
            await X.sendMessage(m.chat, { delete: m.key })
            await X.sendMessage(from, { text: `@${sender.split('@')[0]} watch your language! Badword detected.`, mentions: [sender] })
        }
    }
    if (global.antiTag && m.mentionedJid && m.mentionedJid.length > 5 && isBotAdmins) {
        await X.sendMessage(m.chat, { delete: m.key })
        await X.sendMessage(from, { text: `@${sender.split('@')[0]} mass tagging is not allowed!`, mentions: [sender] })
        return
    }
    if (global.antiSticker && m.mtype === 'stickerMessage' && isBotAdmins) {
        await X.sendMessage(m.chat, { delete: m.key })
        return
    }
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Leaderboard Games
const leaderboardPath = './database/leaderboard.json';

// Load leaderboard
function loadLeaderboard() {
  if (!fs.existsSync(leaderboardPath)) return {};
  return JSON.parse(fs.readFileSync(leaderboardPath));
}

// Save leaderboard
function saveLeaderboard(data) {
  fs.writeFileSync(leaderboardPath, JSON.stringify(data, null, 2));
}

if (
  global.tebakGame &&
  global.tebakGame[m.sender] &&
  m.quoted &&
  m.quoted.text &&
  m.quoted.text.includes(global.tebakGame[m.sender].soal)
) {
  const game = global.tebakGame[m.sender];
  const jawaban = game.jawaban;
  const petunjuk = game.petunjuk || 'No hint available';
  const teksUser = m.body?.toLowerCase();

  if (teksUser === 'nyerah' || teksUser === 'giveup') {
    clearTimeout(game.timeout);
    delete global.tebakGame[m.sender];
    return reply(`😔 You gave up!\nThe correct answer is:\n✅ *${jawaban}*`);
  }

  const benar = Array.isArray(jawaban)
    ? jawaban.some(jw => jw.toLowerCase() === teksUser)
    : teksUser === jawaban.toLowerCase();

  if (teksUser && benar) {
    let leaderboard = loadLeaderboard();
    leaderboard[m.sender] = (leaderboard[m.sender] || 0) + 1;
    saveLeaderboard(leaderboard);

    clearTimeout(game.timeout);
    delete global.tebakGame[m.sender];
    return reply('✅ Correct! Your answer is right!\n\nType .tebakld to view the leaderboard.');
  } else if (teksUser) {
    return reply(`❌ Wrong. Try again!\n💡 Hint: ${petunjuk}\n\nType *giveup* if you want to give up.`);
  }
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Prayer & Devotion Reminders
// Globals: global.muslimPrayer / global.christianDevotion
//   values: 'off' | 'dm' | 'group' | 'all'
if (!global.muslimPrayer)    global.muslimPrayer    = 'off'
if (!global.christianDevotion) global.christianDevotion = 'off'

X.autoshalat = X.autoshalat ? X.autoshalat : {}
        let who = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.fromMe ? X.user.id : m.sender
        let id = m.chat
    if(id in X.autoshalat) {
    return false
    }

    // Check if this chat should receive the reminder
    const _isGroup = m.isGroup
    const _prayerAllowed = (setting) => {
        if (!setting || setting === 'off') return false
        if (setting === 'all') return true
        if (setting === 'group') return _isGroup
        if (setting === 'dm') return !_isGroup
        return false
    }

    // Skip entirely if both are off for this chat type
    if (!_prayerAllowed(global.muslimPrayer) && !_prayerAllowed(global.christianDevotion)) {
        // fall through silently
    } else {

    // Detect timezone & region from sender's country code
    const _senderNum = (m.sender || '').split('@')[0]
    const _cc = _senderNum.startsWith('254') ? '254' :
                _senderNum.startsWith('255') ? '255' :
                _senderNum.startsWith('256') ? '256' :
                _senderNum.startsWith('257') ? '257' :
                _senderNum.startsWith('250') ? '250' :
                _senderNum.startsWith('251') ? '251' :
                _senderNum.startsWith('252') ? '252' :
                _senderNum.startsWith('253') ? '253' :
                _senderNum.startsWith('62')  ? '62'  :
                _senderNum.startsWith('60')  ? '60'  :
                _senderNum.startsWith('92')  ? '92'  :
                _senderNum.startsWith('880') ? '880' :
                _senderNum.startsWith('91')  ? '91'  :
                _senderNum.startsWith('966') ? '966' :
                _senderNum.startsWith('971') ? '971' :
                _senderNum.startsWith('20')  ? '20'  :
                _senderNum.startsWith('212') ? '212' :
                _senderNum.startsWith('234') ? '234' : '254'

    const _tzMap = {
        '254': { tz: 'Africa/Nairobi',       region: 'Kenya' },
        '255': { tz: 'Africa/Dar_es_Salaam', region: 'Tanzania' },
        '256': { tz: 'Africa/Kampala',       region: 'Uganda' },
        '257': { tz: 'Africa/Bujumbura',     region: 'Burundi' },
        '250': { tz: 'Africa/Kigali',        region: 'Rwanda' },
        '251': { tz: 'Africa/Addis_Ababa',   region: 'Ethiopia' },
        '252': { tz: 'Africa/Mogadishu',     region: 'Somalia' },
        '253': { tz: 'Africa/Djibouti',      region: 'Djibouti' },
        '62':  { tz: 'Asia/Jakarta',         region: 'Indonesia' },
        '60':  { tz: 'Asia/Kuala_Lumpur',    region: 'Malaysia' },
        '92':  { tz: 'Asia/Karachi',         region: 'Pakistan' },
        '880': { tz: 'Asia/Dhaka',           region: 'Bangladesh' },
        '91':  { tz: 'Asia/Kolkata',         region: 'India' },
        '966': { tz: 'Asia/Riyadh',          region: 'Saudi Arabia' },
        '971': { tz: 'Asia/Dubai',           region: 'UAE' },
        '20':  { tz: 'Africa/Cairo',         region: 'Egypt' },
        '212': { tz: 'Africa/Casablanca',    region: 'Morocco' },
        '234': { tz: 'Africa/Lagos',         region: 'Nigeria' },
    }
    const _tzInfo = _tzMap[_cc] || { tz: 'Africa/Nairobi', region: 'Kenya' }

    // Use pushname if available, otherwise clean number
    const _displayName = (pushname && pushname !== _senderNum && pushname.length > 1)
        ? pushname : (m.isGroup ? 'everyone' : 'friend')

    const datek = new Date((new Date).toLocaleString("en-US", { timeZone: _tzInfo.tz }))
    const hours = datek.getHours()
    const minutes = datek.getMinutes()
    const timeNow = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`

    // ── Muslim Prayer Times ───────────────────────────────────────────
    if (_prayerAllowed(global.muslimPrayer)) {
        let jadwalSholat = {}
        try {
            const _prayerRes = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(_tzInfo.region)}&country=${encodeURIComponent(_tzInfo.region)}&method=3`)
            const _prayerData = await _prayerRes.json()
            if (_prayerData.code === 200 && _prayerData.data && _prayerData.data.timings) {
                const t = _prayerData.data.timings
                jadwalSholat = {
                    Fajr:    t.Fajr?.slice(0,5),
                    Dhuhr:   t.Dhuhr?.slice(0,5),
                    Asr:     t.Asr?.slice(0,5),
                    Maghrib: t.Maghrib?.slice(0,5),
                    Isha:    t.Isha?.slice(0,5),
                }
            }
        } catch {}
        if (!Object.keys(jadwalSholat).length) {
            jadwalSholat = { Fajr: '05:00', Dhuhr: '12:20', Asr: '15:30', Maghrib: '18:25', Isha: '19:35' }
        }
        for(let [sholat, waktu] of Object.entries(jadwalSholat)) {
            if(timeNow === waktu && !(id in X.autoshalat)) {
                let caption = `╔═════════╗\n║  🕌 *PRAYER TIME*\n╚═════════╝\n\n  As-salamu alaykum, *${_displayName}* 🙏\n\n  ├ 🕌 *${sholat}* prayer time\n  ├ 🕐 *${waktu}*\n  └ 🌍 ${_tzInfo.region}\n\n  _Take your ablution and pray_ 🤲`
                X.autoshalat[id] = [reply(caption), setTimeout(() => { delete X.autoshalat[m.chat] }, 57000)]
            }
        }
    }

    // ── Christian Devotion Times ──────────────────────────────────────
    if (_prayerAllowed(global.christianDevotion)) {
        const _christianTimes = {
            '06:00': { name: 'Morning Devotion', icon: '🌅', msg: 'Start your day with God. Pray, read the Word, and commit your day to Him.' },
            '12:00': { name: 'Midday Prayer',    icon: '☀️',  msg: 'Pause midday. Give thanks, seek guidance, and renew your strength in Christ.' },
            '18:00': { name: 'Evening Prayer',   icon: '🌇', msg: 'As the day winds down, give thanks for His grace and protection.' },
            '21:00': { name: 'Night Prayer',     icon: '🌙', msg: 'Before you rest, lay your burdens before God. He watches over you.' },
        }
        if (_christianTimes[timeNow] && !(id in X.autoshalat)) {
            const _dev = _christianTimes[timeNow]
            let _devCaption = `╔═════════╗\n║  ✝️  *DEVOTION TIME*\n╚═════════╝\n\n  God bless you, *${_displayName}* 🙏\n\n  ├ ${_dev.icon} *${_dev.name}*\n  ├ 🕐 *${timeNow}*\n  └ 🌍 ${_tzInfo.region}\n\n  _${_dev.msg}_\n\n  _📖 "Call to me and I will answer you" — Jer 33:3_`
            X.autoshalat[id] = [reply(_devCaption), setTimeout(() => { delete X.autoshalat[m.chat] }, 57000)]
        }
    }

    } // end prayer allowed check
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Similarity
function getCaseNames() {
  try {
    const data = fs.readFileSync(require('path').join(__dirname, 'client.js'), 'utf8');
    const casePattern = /case\s+'([^']+)'/g;
    const matches = data.match(casePattern);

    if (matches) {
      return matches.map(match => match.replace(/case\s+'([^']+)'/, '$1'));
    } else {
      return [];
    }
  } catch (error) {
    console.error('An error occurred:', error);
    throw error;
  }
}


//━━━━━━━━━━━━━━━━━━━━━━━━//
let totalfitur = () =>{
var mytext = fs.readFileSync(require("path").join(__dirname, "client.js")).toString()
var numUpper = (mytext.match(/case '/g) || []).length;
return numUpper
        }
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Function Waktu
function getFormattedDate() {
  var currentDate = new Date();
  var day = currentDate.getDate();
  var month = currentDate.getMonth() + 1;
  var year = currentDate.getFullYear();
  var hours = currentDate.getHours();
  var minutes = currentDate.getMinutes();
  var seconds = currentDate.getSeconds();
}

let d = new Date(new Date + 3600000)
let locale = 'en'
let week = d.toLocaleDateString(locale, { weekday: 'long' })
let date = d.toLocaleDateString(locale, {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})
const hariini = d.toLocaleDateString('id', { day: 'numeric', month: 'long', year: 'numeric' })

function msToTime(duration) {
var milliseconds = parseInt((duration % 1000) / 100),
seconds = Math.floor((duration / 1000) % 60),
minutes = Math.floor((duration / (1000 * 60)) % 60),
hours = Math.floor((duration / (1000 * 60 * 60)) % 24)

hours = (hours < 10) ? "0" + hours : hours
minutes = (minutes < 10) ? "0" + minutes : minutes
seconds = (seconds < 10) ? "0" + seconds : seconds
return hours + " hours " + minutes + " minutes " + seconds + " seconds"
}

function msToDate(ms) {
                temp = ms
                days = Math.floor(ms / (24*60*60*1000));
                daysms = ms % (24*60*60*1000);
                hours = Math.floor((daysms)/(60*60*1000));
                hoursms = ms % (60*60*1000);
                minutes = Math.floor((hoursms)/(60*1000));
                minutesms = ms % (60*1000);
                sec = Math.floor((minutesms)/(1000));
                return days+" Days "+hours+" Hours "+ minutes + " Minutes";
  }
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Ucapan Waktu
const timee = moment().tz('Asia/Jakarta').format('HH:mm:ss')
if(timee < "23:59:00"){
var waktuucapan = 'Good Night'
}
if(timee < "19:00:00"){
var waktuucapan = 'Good Evening'
}
if(timee < "18:00:00"){
var waktuucapan = 'Good Afternoon'
}
if(timee < "15:00:00"){
var waktuucapan = 'Good Day'
}
if(timee < "10:00:00"){
var waktuucapan = 'Good Morning'
}
if(timee < "05:00:00"){
var waktuucapan = 'Early Morning'
}
if(timee < "03:00:00"){
var waktuucapan = 'Midnight'
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Plugin Connector
const loadPlugins = (directory) => {
    let plugins = []
    const entries = fs.readdirSync(directory)
    entries.forEach(entry => {
        const entryPath = path.join(directory, entry)
        if (fs.lstatSync(entryPath).isDirectory()) {
            const files = fs.readdirSync(entryPath)
            files.forEach(file => {
                const filePath = path.join(entryPath, file)
                if (filePath.endsWith(".js")) {
                    try {
                        delete require.cache[require.resolve(filePath)]
                        const plugin = require(filePath)
                        plugin.filePath = filePath
                        plugins.push(plugin)
                    } catch (error) {
                        console.error(`Error loading plugin at ${filePath}:`, error)
                    }
                }
            })
        } else if (entryPath.endsWith(".js")) {
            try {
                delete require.cache[require.resolve(entryPath)]
                const plugin = require(entryPath)
                plugin.filePath = entryPath
                plugins.push(plugin)
            } catch (error) {
                console.error(`Error loading plugin at ${entryPath}:`, error)
            }
        }
    })
    return plugins
}
const plugins = loadPlugins(path.resolve(__dirname, "./plugin"))
const context = { 
    args, 
    X, 
    reply,
    m, 
    body,   
    prefix,
    command,
    isUrl,
    q,
    text,
    quoted,
    require,
    smsg,
    sleep,
    clockString,
    msToDate,
    runtime,
    fetchJson,
    getBuffer,
    delay,
    getRandom
     }
let handled = false
for (const plugin of plugins) {
    if (plugin.command.includes(command)) {
        try {
            await plugin.operate(context)
            handled = true
        } catch (error) {
            console.error(`Error executing plugin ${plugin.filePath}:`, error)
        }
        break
    }
}
// Batas Plugins
//━━━━━━━━━━━━━━━━━━━━━━━━//
//━━━━━━━━━━━━━━━━━━━━━━━━//
// tag owner reaction
if (m.isGroup) {
    if (body.includes(`@${owner}`)) {
        await X.sendMessage(m.chat, { react: { text: "❌", key: m.key } })
    }
 }
// tes bot no prefix
if ((budy.match) && ["bot",].includes(budy) && !isCmd) {
reply(`╔═════════╗\n║  🟢 *ONLINE & READY*\n╚═════════╝\n\n  ├ 🤖 *${global.botname || 'TOOSII-XD ULTRA'}*\n  └ ⏱️  *Uptime* › ${runtime(process.uptime())}`)
}       

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Mode Gate
// Private mode: ONLY the deployed bot number can use any command
// Public mode:  All users can use non-owner commands normally
const isDeployedNumber = m.key.fromMe || senderClean === botClean

if (isCmd && X.public === false && !isDeployedNumber) {
    return reply('🔒 *Bot is in Private Mode.*\n_Only the bot owner can use commands._')
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Owner Font Mode — auto-converts every message the bot owner sends
// Activated via .setfont [fontname], deactivated via .fontoff
if (m.key.fromMe && global.ownerFontMode && global.ownerFontMode !== 'off' && budy && !isCmd) {
    try {
        const _fontMaps = {
            bold:          {a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭','0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵'},
            italic:        {a:'𝘢',b:'𝘣',c:'𝘤',d:'𝘥',e:'𝘦',f:'𝘧',g:'𝘨',h:'𝘩',i:'𝘪',j:'𝘫',k:'𝘬',l:'𝘭',m:'𝘮',n:'𝘯',o:'𝘰',p:'𝘱',q:'𝘲',r:'𝘳',s:'𝘴',t:'𝘵',u:'𝘶',v:'𝘷',w:'𝘸',x:'𝘹',y:'𝘺',z:'𝘻',A:'𝘈',B:'𝘉',C:'𝘊',D:'𝘋',E:'𝘌',F:'𝘍',G:'𝘎',H:'𝘏',I:'𝘐',J:'𝘑',K:'𝘒',L:'𝘓',M:'𝘔',N:'𝘕',O:'𝘖',P:'𝘗',Q:'𝘘',R:'𝘙',S:'𝘚',T:'𝘛',U:'𝘜',V:'𝘝',W:'𝘞',X:'𝘟',Y:'𝘠',Z:'𝘡'},
            bolditalic:    {a:'𝙖',b:'𝙗',c:'𝙘',d:'𝙙',e:'𝙚',f:'𝙛',g:'𝙜',h:'𝙝',i:'𝙞',j:'𝙟',k:'𝙠',l:'𝙡',m:'𝙢',n:'𝙣',o:'𝙤',p:'𝙥',q:'𝙦',r:'𝙧',s:'𝙨',t:'𝙩',u:'𝙪',v:'𝙫',w:'𝙬',x:'𝙭',y:'𝙮',z:'𝙯',A:'𝘼',B:'𝘽',C:'𝘾',D:'𝘿',E:'𝙀',F:'𝙁',G:'𝙂',H:'𝙃',I:'𝙄',J:'𝙅',K:'𝙆',L:'𝙇',M:'𝙈',N:'𝙉',O:'𝙊',P:'𝙋',Q:'𝙌',R:'𝙍',S:'𝙎',T:'𝙏',U:'𝙐',V:'𝙑',W:'𝙒',X:'𝙓',Y:'𝙔',Z:'𝙕'},
            mono:          {a:'𝚊',b:'𝚋',c:'𝚌',d:'𝚍',e:'𝚎',f:'𝚏',g:'𝚐',h:'𝚑',i:'𝚒',j:'𝚓',k:'𝚔',l:'𝚕',m:'𝚖',n:'𝚗',o:'𝚘',p:'𝚙',q:'𝚚',r:'𝚛',s:'𝚜',t:'𝚝',u:'𝚞',v:'𝚟',w:'𝚠',x:'𝚡',y:'𝚢',z:'𝚣',A:'𝙰',B:'𝙱',C:'𝙲',D:'𝙳',E:'𝙴',F:'𝙵',G:'𝙶',H:'𝙷',I:'𝙸',J:'𝙹',K:'𝙺',L:'𝙻',M:'𝙼',N:'𝙽',O:'𝙾',P:'𝙿',Q:'𝚀',R:'𝚁',S:'𝚂',T:'𝚃',U:'𝚄',V:'𝚅',W:'𝚆',X:'𝚇',Y:'𝚈',Z:'𝚉','0':'𝟶','1':'𝟷','2':'𝟸','3':'𝟹','4':'𝟺','5':'𝟻','6':'𝟼','7':'𝟽','8':'𝟾','9':'𝟿'},
            serif:         {a:'𝐚',b:'𝐛',c:'𝐜',d:'𝐝',e:'𝐞',f:'𝐟',g:'𝐠',h:'𝐡',i:'𝐢',j:'𝐣',k:'𝐤',l:'𝐥',m:'𝐦',n:'𝐧',o:'𝐨',p:'𝐩',q:'𝐪',r:'𝐫',s:'𝐬',t:'𝐭',u:'𝐮',v:'𝐯',w:'𝐰',x:'𝐱',y:'𝐲',z:'𝐳',A:'𝐀',B:'𝐁',C:'𝐂',D:'𝐃',E:'𝐄',F:'𝐅',G:'𝐆',H:'𝐇',I:'𝐈',J:'𝐉',K:'𝐊',L:'𝐋',M:'𝐌',N:'𝐍',O:'𝐎',P:'𝐏',Q:'𝐐',R:'𝐑',S:'𝐒',T:'𝐓',U:'𝐔',V:'𝐕',W:'𝐖',X:'𝐗',Y:'𝐘',Z:'𝐙','0':'𝟎','1':'𝟏','2':'𝟐','3':'𝟑','4':'𝟒','5':'𝟓','6':'𝟔','7':'𝟕','8':'𝟖','9':'𝟗'},
            serifbold:     {a:'𝒂',b:'𝒃',c:'𝒄',d:'𝒅',e:'𝒆',f:'𝒇',g:'𝒈',h:'𝒉',i:'𝒊',j:'𝒋',k:'𝒌',l:'𝒍',m:'𝒎',n:'𝒏',o:'𝒐',p:'𝒑',q:'𝒒',r:'𝒓',s:'𝒔',t:'𝒕',u:'𝒖',v:'𝒗',w:'𝒘',x:'𝒙',y:'𝒚',z:'𝒛',A:'𝑨',B:'𝑩',C:'𝑪',D:'𝑫',E:'𝑬',F:'𝑭',G:'𝑮',H:'𝑯',I:'𝑰',J:'𝑱',K:'𝑲',L:'𝑳',M:'𝑴',N:'𝑵',O:'𝑶',P:'𝑷',Q:'𝑸',R:'𝑹',S:'𝑺',T:'𝑻',U:'𝑼',V:'𝑽',W:'𝑾',X:'𝑿',Y:'𝒀',Z:'𝒁'},
            serifitalic:   {a:'𝑎',b:'𝑏',c:'𝑐',d:'𝑑',e:'𝑒',f:'𝑓',g:'𝑔',h:'ℎ',i:'𝑖',j:'𝑗',k:'𝑘',l:'𝑙',m:'𝑚',n:'𝑛',o:'𝑜',p:'𝑝',q:'𝑞',r:'𝑟',s:'𝑠',t:'𝑡',u:'𝑢',v:'𝑣',w:'𝑤',x:'𝑥',y:'𝑦',z:'𝑧',A:'𝐴',B:'𝐵',C:'𝐶',D:'𝐷',E:'𝐸',F:'𝐹',G:'𝐺',H:'𝐻',I:'𝐼',J:'𝐽',K:'𝐾',L:'𝐿',M:'𝑀',N:'𝑁',O:'𝑂',P:'𝑃',Q:'𝑄',R:'𝑅',S:'𝑆',T:'𝑇',U:'𝑈',V:'𝑉',W:'𝑊',X:'𝑋',Y:'𝑌',Z:'𝑍'},
            scriptfont:    {a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵'},
            scriptbold:    {a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'},
            fraktur:       {a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'},
            frakturbold:   {a:'𝖆',b:'𝖇',c:'𝖈',d:'𝖉',e:'𝖊',f:'𝖋',g:'𝖌',h:'𝖍',i:'𝖎',j:'𝖏',k:'𝖐',l:'𝖑',m:'𝖒',n:'𝖓',o:'𝖔',p:'𝖕',q:'𝖖',r:'𝖗',s:'𝖘',t:'𝖙',u:'𝖚',v:'𝖛',w:'𝖜',x:'𝖝',y:'𝖞',z:'𝖟',A:'𝕬',B:'𝕭',C:'𝕮',D:'𝕯',E:'𝕰',F:'𝕱',G:'𝕲',H:'𝕳',I:'𝕴',J:'𝕵',K:'𝕶',L:'𝕷',M:'𝕸',N:'𝕹',O:'𝕺',P:'𝕻',Q:'𝕼',R:'𝕽',S:'𝕾',T:'𝕿',U:'𝖀',V:'𝖁',W:'𝖂',X:'𝖃',Y:'𝖄',Z:'𝖅'},
            doublestruck:  {a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫',A:'𝔸',B:'𝔹',C:'ℂ',D:'𝔻',E:'𝔼',F:'𝔽',G:'𝔾',H:'ℍ',I:'𝕀',J:'𝕁',K:'𝕂',L:'𝕃',M:'𝕄',N:'ℕ',O:'𝕆',P:'ℙ',Q:'ℚ',R:'ℝ',S:'𝕊',T:'𝕋',U:'𝕌',V:'𝕍',W:'𝕎',X:'𝕏',Y:'𝕐',Z:'ℤ','0':'𝟘','1':'𝟙','2':'𝟚','3':'𝟛','4':'𝟜','5':'𝟝','6':'𝟞','7':'𝟟','8':'𝟠','9':'𝟡'},
            smallcaps:     {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'Q',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',A:'ᴀ',B:'ʙ',C:'ᴄ',D:'ᴅ',E:'ᴇ',F:'ꜰ',G:'ɢ',H:'ʜ',I:'ɪ',J:'ᴊ',K:'ᴋ',L:'ʟ',M:'ᴍ',N:'ɴ',O:'ᴏ',P:'ᴘ',Q:'Q',R:'ʀ',S:'ꜱ',T:'ᴛ',U:'ᴜ',V:'ᴠ',W:'ᴡ',X:'x',Y:'ʏ',Z:'ᴢ'},
            bubble:        {a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ','0':'⓪','1':'①','2':'②','3':'③','4':'④','5':'⑤','6':'⑥','7':'⑦','8':'⑧','9':'⑨'},
            bubblebold:    {a:'🅐',b:'🅑',c:'🅒',d:'🅓',e:'🅔',f:'🅕',g:'🅖',h:'🅗',i:'🅘',j:'🅙',k:'🅚',l:'🅛',m:'🅜',n:'🅝',o:'🅞',p:'🅟',q:'🅠',r:'🅡',s:'🅢',t:'🅣',u:'🅤',v:'🅥',w:'🅦',x:'🅧',y:'🅨',z:'🅩',A:'🅐',B:'🅑',C:'🅒',D:'🅓',E:'🅔',F:'🅕',G:'🅖',H:'🅗',I:'🅘',J:'🅙',K:'🅚',L:'🅛',M:'🅜',N:'🅝',O:'🅞',P:'🅟',Q:'🅠',R:'🅡',S:'🅢',T:'🅣',U:'🅤',V:'🅥',W:'🅦',X:'🅧',Y:'🅨',Z:'🅩'},
            square:        {a:'🄰',b:'🄱',c:'🄲',d:'🄳',e:'🄴',f:'🄵',g:'🄶',h:'🄷',i:'🄸',j:'🄹',k:'🄺',l:'🄻',m:'🄼',n:'🄽',o:'🄾',p:'🄿',q:'🅀',r:'🅁',s:'🅂',t:'🅃',u:'🅄',v:'🅅',w:'🅆',x:'🅇',y:'🅈',z:'🅉',A:'🄰',B:'🄱',C:'🄲',D:'🄳',E:'🄴',F:'🄵',G:'🄶',H:'🄷',I:'🄸',J:'🄹',K:'🄺',L:'🄻',M:'🄼',N:'🄽',O:'🄾',P:'🄿',Q:'🅀',R:'🅁',S:'🅂',T:'🅃',U:'🅄',V:'🅅',W:'🅆',X:'🅇',Y:'🅈',Z:'🅉'},
            squarebold:    {a:'🅰',b:'🅱',c:'🅲',d:'🅳',e:'🅴',f:'🅵',g:'🅶',h:'🅷',i:'🅸',j:'🅹',k:'🅺',l:'🅻',m:'🅼',n:'🅽',o:'🅾',p:'🅿',q:'🆀',r:'🆁',s:'🆂',t:'🆃',u:'🆄',v:'🆅',w:'🆆',x:'🆇',y:'🆈',z:'🆉',A:'🅰',B:'🅱',C:'🅲',D:'🅳',E:'🅴',F:'🅵',G:'🅶',H:'🅷',I:'🅸',J:'🅹',K:'🅺',L:'🅻',M:'🅼',N:'🅽',O:'🅾',P:'🅿',Q:'🆀',R:'🆁',S:'🆂',T:'🆃',U:'🆄',V:'🆅',W:'🆆',X:'🆇',Y:'🆈',Z:'🆉'},
            wide:          'wide',
            upsidedown:    'upsidedown',
            strikethrough: 'strikethrough',
            underline:     'underline',
            medieval:      {a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'},
            cursive:       {a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'},
            aesthetic:     {a:'ａ',b:'ｂ',c:'ｃ',d:'ｄ',e:'ｅ',f:'ｆ',g:'ｇ',h:'ｈ',i:'ｉ',j:'ｊ',k:'ｋ',l:'ｌ',m:'ｍ',n:'ｎ',o:'ｏ',p:'ｐ',q:'ｑ',r:'ｒ',s:'ｓ',t:'ｔ',u:'ｕ',v:'ｖ',w:'ｗ',x:'ｘ',y:'ｙ',z:'ｚ',A:'Ａ',B:'Ｂ',C:'Ｃ',D:'Ｄ',E:'Ｅ',F:'Ｆ',G:'Ｇ',H:'Ｈ',I:'Ｉ',J:'Ｊ',K:'Ｋ',L:'Ｌ',M:'Ｍ',N:'Ｎ',O:'Ｏ',P:'Ｐ',Q:'Ｑ',R:'Ｒ',S:'Ｓ',T:'Ｔ',U:'Ｕ',V:'Ｖ',W:'Ｗ',X:'Ｘ',Y:'Ｙ',Z:'Ｚ','0':'０','1':'１','2':'２','3':'３','4':'４','5':'５','6':'６','7':'７','8':'８','9':'９'},
            tiny:          {a:'ᵃ',b:'ᵇ',c:'ᶜ',d:'ᵈ',e:'ᵉ',f:'ᶠ',g:'ᵍ',h:'ʰ',i:'ⁱ',j:'ʲ',k:'ᵏ',l:'ˡ',m:'ᵐ',n:'ⁿ',o:'ᵒ',p:'ᵖ',q:'q',r:'ʳ',s:'ˢ',t:'ᵗ',u:'ᵘ',v:'ᵛ',w:'ʷ',x:'ˣ',y:'ʸ',z:'ᶻ',A:'ᴬ',B:'ᴮ',C:'ᶜ',D:'ᴰ',E:'ᴱ',F:'ᶠ',G:'ᴳ',H:'ᴴ',I:'ᴵ',J:'ᴶ',K:'ᴷ',L:'ᴸ',M:'ᴹ',N:'ᴺ',O:'ᴼ',P:'ᴾ',Q:'Q',R:'ᴿ',S:'ˢ',T:'ᵀ',U:'ᵁ',V:'ᵛ',W:'ᵂ',X:'ˣ',Y:'ʸ',Z:'ᶻ'},
            gothic:        {a:'𝖆',b:'𝖇',c:'𝖈',d:'𝖉',e:'𝖊',f:'𝖋',g:'𝖌',h:'𝖍',i:'𝖎',j:'𝖏',k:'𝖐',l:'𝖑',m:'𝖒',n:'𝖓',o:'𝖔',p:'𝖕',q:'𝖖',r:'𝖗',s:'𝖘',t:'𝖙',u:'𝖚',v:'𝖛',w:'𝖜',x:'𝖝',y:'𝖞',z:'𝖟',A:'𝕬',B:'𝕭',C:'𝕮',D:'𝕯',E:'𝕰',F:'𝕱',G:'𝕲',H:'𝕳',I:'𝕴',J:'𝕵',K:'𝕶',L:'𝕷',M:'𝕸',N:'𝕹',O:'𝕺',P:'𝕻',Q:'𝕼',R:'𝕽',S:'𝕾',T:'𝕿',U:'𝖀',V:'𝖁',W:'𝖂',X:'𝖃',Y:'𝖄',Z:'𝖅'},
            inverted:      {a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',A:'∀',B:'q',C:'Ɔ',D:'p',E:'Ǝ',F:'Ⅎ',G:'פ',H:'H',I:'I',J:'ɾ',K:'ʞ',L:'˥',M:'W',N:'N',O:'O',P:'Ԁ',Q:'Q',R:'ɹ',S:'S',T:'┴',U:'∩',V:'Λ',W:'M',X:'X',Y:'ʎ',Z:'Z'},
            mirror:        {a:'ɒ',b:'d',c:'ɔ',d:'b',e:'ɘ',f:'ʇ',g:'ϱ',h:'ʜ',i:'i',j:'ᴉ',k:'ʞ',l:'l',m:'m',n:'n',o:'o',p:'q',q:'p',r:'ɿ',s:'ƨ',t:'ƚ',u:'u',v:'v',w:'w',x:'x',y:'y',z:'z',A:'A',B:'ᗺ',C:'Ɔ',D:'ᗡ',E:'Ǝ',F:'ꟻ',G:'Ꭾ',H:'H',I:'I',J:'Ꮈ',K:'ꓘ',L:'⅃',M:'M',N:'И',O:'O',P:'ꟼ',Q:'Ọ',R:'Я',S:'Ƨ',T:'T',U:'U',V:'V',W:'W',X:'X',Y:'Y',Z:'Z'},
            currency:      {a:'₳',b:'฿',c:'₵',d:'₫',e:'€',f:'₣',g:'₲',h:'♄',i:'ł',j:'ʝ',k:'₭',l:'₤',m:'₥',n:'₦',o:'ø',p:'₱',q:'q',r:'®',s:'$',t:'₮',u:'µ',v:'√',w:'₩',x:'×',y:'¥',z:'z',A:'₳',B:'฿',C:'₵',D:'₫',E:'€',F:'₣',G:'₲',H:'♄',I:'ł',J:'ʝ',K:'₭',L:'₤',M:'₥',N:'₦',O:'ø',P:'₱',Q:'Q',R:'®',S:'$',T:'₮',U:'µ',V:'√',W:'₩',X:'×',Y:'¥',Z:'Z'},
            dotted:        {a:'ȧ',b:'ḃ',c:'ċ',d:'ḋ',e:'ė',f:'ḟ',g:'ġ',h:'ḣ',i:'ı',j:'j',k:'k',l:'l',m:'ṁ',n:'ṅ',o:'ȯ',p:'ṗ',q:'q',r:'ṙ',s:'ṡ',t:'ṫ',u:'u',v:'v',w:'ẇ',x:'ẋ',y:'ẏ',z:'ż',A:'Ȧ',B:'Ḃ',C:'Ċ',D:'Ḋ',E:'Ė',F:'Ḟ',G:'Ġ',H:'Ḣ',I:'İ',J:'J',K:'K',L:'L',M:'Ṁ',N:'Ṅ',O:'Ȯ',P:'Ṗ',Q:'Q',R:'Ṙ',S:'Ṡ',T:'Ṫ',U:'U',V:'V',W:'Ẇ',X:'Ẋ',Y:'Ẏ',Z:'Ż'},
            oldeng:        {a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵'},
            parenthesis:   {a:'⒜',b:'⒝',c:'⒞',d:'⒟',e:'⒠',f:'⒡',g:'⒢',h:'⒣',i:'⒤',j:'⒥',k:'⒦',l:'⒧',m:'⒨',n:'⒩',o:'⒪',p:'⒫',q:'⒬',r:'⒭',s:'⒮',t:'⒯',u:'⒰',v:'⒱',w:'⒲',x:'⒳',y:'⒴',z:'⒵',A:'⒜',B:'⒝',C:'⒞',D:'⒟',E:'⒠',F:'⒡',G:'⒢',H:'⒣',I:'⒤',J:'⒥',K:'⒦',L:'⒧',M:'⒨',N:'⒩',O:'⒪',P:'⒫',Q:'⒬',R:'⒭',S:'⒮',T:'⒯',U:'⒰',V:'⒱',W:'⒲',X:'⒳',Y:'⒴',Z:'⒵'},
            flags:         {a:'🇦',b:'🇧',c:'🇨',d:'🇩',e:'🇪',f:'🇫',g:'🇬',h:'🇭',i:'🇮',j:'🇯',k:'🇰',l:'🇱',m:'🇲',n:'🇳',o:'🇴',p:'🇵',q:'🇶',r:'🇷',s:'🇸',t:'🇹',u:'🇺',v:'🇻',w:'🇼',x:'🇽',y:'🇾',z:'🇿',A:'🇦',B:'🇧',C:'🇨',D:'🇩',E:'🇪',F:'🇫',G:'🇬',H:'🇭',I:'🇮',J:'🇯',K:'🇰',L:'🇱',M:'🇲',N:'🇳',O:'🇴',P:'🇵',Q:'🇶',R:'🇷',S:'🇸',T:'🇹',U:'🇺',V:'🇻',W:'🇼',X:'🇽',Y:'🇾',Z:'🇿'},
            medieval:      {a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'},
            cursive:       {a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'},
            aesthetic:     {a:'ａ',b:'ｂ',c:'ｃ',d:'ｄ',e:'ｅ',f:'ｆ',g:'ｇ',h:'ｈ',i:'ｉ',j:'ｊ',k:'ｋ',l:'ｌ',m:'ｍ',n:'ｎ',o:'ｏ',p:'ｐ',q:'ｑ',r:'ｒ',s:'ｓ',t:'ｔ',u:'ｕ',v:'ｖ',w:'ｗ',x:'ｘ',y:'ｙ',z:'ｚ',A:'Ａ',B:'Ｂ',C:'Ｃ',D:'Ｄ',E:'Ｅ',F:'Ｆ',G:'Ｇ',H:'Ｈ',I:'Ｉ',J:'Ｊ',K:'Ｋ',L:'Ｌ',M:'Ｍ',N:'Ｎ',O:'Ｏ',P:'Ｐ',Q:'Ｑ',R:'Ｒ',S:'Ｓ',T:'Ｔ',U:'Ｕ',V:'Ｖ',W:'Ｗ',X:'Ｘ',Y:'Ｙ',Z:'Ｚ','0':'０','1':'１','2':'２','3':'３','4':'４','5':'５','6':'６','7':'７','8':'８','9':'９'},
            tiny:          {a:'ᵃ',b:'ᵇ',c:'ᶜ',d:'ᵈ',e:'ᵉ',f:'ᶠ',g:'ᵍ',h:'ʰ',i:'ⁱ',j:'ʲ',k:'ᵏ',l:'ˡ',m:'ᵐ',n:'ⁿ',o:'ᵒ',p:'ᵖ',q:'q',r:'ʳ',s:'ˢ',t:'ᵗ',u:'ᵘ',v:'ᵛ',w:'ʷ',x:'ˣ',y:'ʸ',z:'ᶻ',A:'ᴬ',B:'ᴮ',C:'ᶜ',D:'ᴰ',E:'ᴱ',F:'ᶠ',G:'ᴳ',H:'ᴴ',I:'ᴵ',J:'ᴶ',K:'ᴷ',L:'ᴸ',M:'ᴹ',N:'ᴺ',O:'ᴼ',P:'ᴾ',Q:'Q',R:'ᴿ',S:'ˢ',T:'ᵀ',U:'ᵁ',V:'ᵛ',W:'ᵂ',X:'ˣ',Y:'ʸ',Z:'ᶻ'},
            gothic:        {a:'𝖆',b:'𝖇',c:'𝖈',d:'𝖉',e:'𝖊',f:'𝖋',g:'𝖌',h:'𝖍',i:'𝖎',j:'𝖏',k:'𝖐',l:'𝖑',m:'𝖒',n:'𝖓',o:'𝖔',p:'𝖕',q:'𝖖',r:'𝖗',s:'𝖘',t:'𝖙',u:'𝖚',v:'𝖛',w:'𝖜',x:'𝖝',y:'𝖞',z:'𝖟',A:'𝕬',B:'𝕭',C:'𝕮',D:'𝕯',E:'𝕰',F:'𝕱',G:'𝕲',H:'𝕳',I:'𝕴',J:'𝕵',K:'𝕶',L:'𝕷',M:'𝕸',N:'𝕹',O:'𝕺',P:'𝕻',Q:'𝕼',R:'𝕽',S:'𝕾',T:'𝕿',U:'𝖀',V:'𝖁',W:'𝖂',X:'𝖃',Y:'𝖄',Z:'𝖅'},
            inverted:      {a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',A:'∀',B:'q',C:'Ɔ',D:'p',E:'Ǝ',F:'Ⅎ',G:'פ',H:'H',I:'I',J:'ɾ',K:'ʞ',L:'˥',M:'W',N:'N',O:'O',P:'Ԁ',Q:'Q',R:'ɹ',S:'S',T:'┴',U:'∩',V:'Λ',W:'M',X:'X',Y:'ʎ',Z:'Z'},
            mirror:        {a:'ɒ',b:'d',c:'ɔ',d:'b',e:'ɘ',f:'ʇ',g:'ϱ',h:'ʜ',i:'i',j:'ᴉ',k:'ʞ',l:'l',m:'m',n:'n',o:'o',p:'q',q:'p',r:'ɿ',s:'ƨ',t:'ƚ',u:'u',v:'v',w:'w',x:'x',y:'y',z:'z',A:'A',B:'ᗺ',C:'Ɔ',D:'ᗡ',E:'Ǝ',F:'ꟻ',G:'Ꭾ',H:'H',I:'I',J:'Ꮈ',K:'ꓘ',L:'⅃',M:'M',N:'И',O:'O',P:'ꟼ',Q:'Ọ',R:'Я',S:'Ƨ',T:'T',U:'U',V:'V',W:'W',X:'X',Y:'Y',Z:'Z'},
            currency:      {a:'₳',b:'฿',c:'₵',d:'₫',e:'€',f:'₣',g:'₲',h:'♄',i:'ł',j:'ʝ',k:'₭',l:'₤',m:'₥',n:'₦',o:'ø',p:'₱',q:'q',r:'®',s:'$',t:'₮',u:'µ',v:'√',w:'₩',x:'×',y:'¥',z:'z',A:'₳',B:'฿',C:'₵',D:'₫',E:'€',F:'₣',G:'₲',H:'♄',I:'ł',J:'ʝ',K:'₭',L:'₤',M:'₥',N:'₦',O:'ø',P:'₱',Q:'Q',R:'®',S:'$',T:'₮',U:'µ',V:'√',W:'₩',X:'×',Y:'¥',Z:'Z'},
            dotted:        {a:'ȧ',b:'ḃ',c:'ċ',d:'ḋ',e:'ė',f:'ḟ',g:'ġ',h:'ḣ',i:'ı',j:'j',k:'k',l:'l',m:'ṁ',n:'ṅ',o:'ȯ',p:'ṗ',q:'q',r:'ṙ',s:'ṡ',t:'ṫ',u:'u',v:'v',w:'ẇ',x:'ẋ',y:'ẏ',z:'ż',A:'Ȧ',B:'Ḃ',C:'Ċ',D:'Ḋ',E:'Ė',F:'Ḟ',G:'Ġ',H:'Ḣ',I:'İ',J:'J',K:'K',L:'L',M:'Ṁ',N:'Ṅ',O:'Ȯ',P:'Ṗ',Q:'Q',R:'Ṙ',S:'Ṡ',T:'Ṫ',U:'U',V:'V',W:'Ẇ',X:'Ẋ',Y:'Ẏ',Z:'Ż'},
            oldeng:        {a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵'}
        }
        const _activeFont = global.ownerFontMode
        const _map = _fontMaps[_activeFont]
        if (_map) {
            let _converted
            if (_activeFont === 'wide') {
                _converted = [...budy].map(c=>{let code=c.charCodeAt(0);return (code>=33&&code<=126)?String.fromCharCode(code+65248):c===' '?'\u3000':c}).join('')
            } else if (_activeFont === 'upsidedown') {
                const _ud = {a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',A:'∀',B:'q',C:'Ɔ',D:'p',E:'Ǝ',F:'Ⅎ',G:'פ',H:'H',I:'I',J:'ɾ',K:'ʞ',L:'˥',M:'W',N:'N',O:'O',P:'Ԁ',Q:'Q',R:'ɹ',S:'S',T:'┴',U:'∩',V:'Λ',W:'M',X:'X',Y:'ʎ',Z:'Z',' ':' '}
                _converted = [...budy].map(c=>_ud[c]||c).reverse().join('')
            } else if (_activeFont === 'strikethrough') {
                _converted = [...budy].map(c=>c===' '?' ':c+'̶').join('')
            } else if (_activeFont === 'underline') {
                _converted = [...budy].map(c=>c===' '?' ':c+'̲').join('')
            } else {
                _converted = [...budy].map(c=>_map[c]||c).join('')
            }
            // Only act if conversion actually changed something, and result is non-empty
            if (_converted && _converted.trim() && _converted !== budy) {
                await X.sendMessage(m.chat, { text: _converted, edit: m.key })
            }
        }
    } catch (_fe) {
        // Silently ignore font mode errors — never crash normal flow
    }
    return
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
// jangan di apa apain
switch(command) {
// awas error
//━━━━━━━━━━━━━━━━━━━━━━━━//
// help command
case 'help': {
    await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
const helpText = `╔═════════╗
║  📋 *QUICK HELP GUIDE*
╚═════════╝

  ├◈  \`.menu\`            › all commands
  ├◈  \`.menu ai\`         › AI tools
  ├◈  \`.menu tools\`      › utilities
  ├◈  \`.menu owner\`      › bot settings
  ├◈  \`.menu group\`      › group mgmt
  ├◈  \`.menu downloader\` › downloads
  ├◈  \`.menu search\`     › search
  └◈  \`.menu sticker\`    › stickers
┃➤ .menu games — ɢᴀᴍᴇꜱ
┗❒

┏❒ *ᴘᴏᴘᴜʟᴀʀ ᴄᴏᴍᴍᴀɴᴅꜱ* ❒
┃➤ .ai [Qᴜᴇꜱᴛɪᴏɴ]
┃➤ .sticker ʀᴇᴘʟʏ ᴍᴇᴅɪᴀ
┃➤ .play [ꜱᴏɴɢ]
┃➤ .ig [ᴜʀʟ]
┃➤ .tt [ᴜʀʟ]
┃➤ .toimage
┃➤ .save ʀᴇᴘʟʏ ᴍꜱɢ
┗❒

┏❒ *ᴄᴏɴᴛᴀᴄᴛ* ❒
┃➤ wa.me/254748340864
┃➤ ᴛᴇʟᴇɢʀᴀᴍ: @toosiitech
┗❒

_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴏᴏꜱɪɪ ᴛᴇᴄʜ_`
const helpThumb = global.botPic || global.thumb || 'https://files.catbox.moe/qbcebp.jpg'
X.sendMessage(m.chat, { image: { url: helpThumb }, caption: helpText }, { quoted: m })
break
}

// system menu
case 'menu': {
    await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
// menu list - clear cache to always load fresh
const menuFiles = ['aimenu','toolsmenu','groupmenu','ownermenu','searchmenu','gamemenu','stickermenu','othermenu','downloadermenu','footballmenu'];
menuFiles.forEach(f => { try { delete require.cache[require.resolve('./library/menulist/' + f)]; } catch {} });
const aiMenu = require('./library/menulist/aimenu');
const toolsMenu = require('./library/menulist/toolsmenu');
const groupMenu = require('./library/menulist/groupmenu');
const ownerMenu = require('./library/menulist/ownermenu');
const searchMenu = require('./library/menulist/searchmenu');
const gameMenu = require('./library/menulist/gamemenu');
const stickerMenu = require('./library/menulist/stickermenu');
const otherMenu = require('./library/menulist/othermenu');
const downloaderMenu = require('./library/menulist/downloadermenu');
const footballMenu = require('./library/menulist/footballmenu');
const textmakerMenu = `
╔═════════╗
║  ✨  *TEXT EFFECTS (Local)*
╚═════════╝
  ├◈  \`.metallic\`  ├◈  \`.ice\`
  ├◈  \`.snow\`      ├◈  \`.neon\`
  ├◈  \`.fire\`      ├◈  \`.glitch\`
  ├◈  \`.thunder\`   ├◈  \`.matrix\`
  ├◈  \`.hacker\`    ├◈  \`.devil\`
  ├◈  \`.purple\`    ├◈  \`.blackpink\`
  ├◈  \`.sand\`      ├◈  \`.arena\`
  ├◈  \`.1917\`      ├◈  \`.light\`
  ├◈  \`.impressive\` ├◈  \`.leaves\`
  └◈ all accept › [text]

╔═════════╗
║  🔤  *FONT CONVERTER*
╚═════════╝
  ├◈  \`.fonts\`         › show all
  ├◈  \`.allfonts\`      › [text]
  ├◈  \`.bold\`          ├◈  \`.italic\`
  ├◈  \`.bolditalic\`    ├◈  \`.mono\`
  ├◈  \`.serif\`         ├◈  \`.serifbold\`
  ├◈  \`.serifitalic\`   ├◈  \`.scriptfont\`
  ├◈  \`.scriptbold\`    ├◈  \`.fraktur\`
  ├◈  \`.frakturbold\`   ├◈  \`.doublestruck\`
  ├◈  \`.smallcaps\`     ├◈  \`.bubble\`
  ├◈  \`.bubblebold\`    ├◈  \`.square\`
  ├◈  \`.squarebold\`    ├◈  \`.wide\`
  ├◈  \`.upsidedown\`    ├◈  \`.strikethrough\`
  └◈  \`.underline\`     › all accept [text]`

  let subcmd = args[0] ? args[0].toLowerCase() : '';

  let infoBot = `╔═════════╗
║   ⚡ *TOOSII-XD ULTRA*
║   _WhatsApp Multi-Device Bot_
╚═════════╝

  👋 Hey *${pushname}*! ${waktuucapan}

  ├◈ 🤖 *Bot*      › ${botname}
  ├◈ 👑 *Owner*    › ${ownername}
  ├◈ 🔢 *Version*  › v${botver}
  ├◈ ⚙️  *Mode*     › ${typebot}
  ├◈ 📋 *Commands* › ${totalfitur()}
  ├◈ 📞 *Contact*  › wa.me/254748340864
  ├◈ ✈️  *Telegram* › t.me/toosiitech
  └◈ 🔑 *Session*  › ${global.sessionUrl}

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  _Browse by category:_

  ├◈  \`.menu ai\`         › AI Chat & Tools
  ├◈  \`.menu tools\`      › Utilities
  ├◈  \`.menu owner\`      › Bot Settings
  ├◈  \`.menu group\`      › Group Mgmt
  ├◈  \`.menu downloader\` › Downloads
  ├◈  \`.menu search\`     › Search
  ├◈  \`.menu sticker\`    › Stickers
  ├◈  \`.menu games\`      › Games
  ├◈  \`.menu other\`      › Other
  └◈  \`.menu textmaker\`  › Text Effects

  ⬇️  *COMMAND LIST*`.trim();

  let menu = '';

  if (subcmd === 'ai') menu = aiMenu;
  else if (subcmd === 'tools') menu = toolsMenu;
  else if (subcmd === 'group') menu = groupMenu;
  else if (subcmd === 'owner') menu = ownerMenu;
  else if (subcmd === 'search') menu = searchMenu;
  else if (subcmd === 'games') menu = gameMenu;
  else if (subcmd === 'sticker') menu = stickerMenu;  
  else if (subcmd === 'other') menu = otherMenu;    
  else if (subcmd === 'downloader') menu = downloaderMenu;
  else if (subcmd === 'textmaker') menu = textmakerMenu;
  else if (subcmd === 'football' || subcmd === 'sports') menu = footballMenu;
  else if (subcmd === 'all') {
    menu = [
      otherMenu,
      downloaderMenu,
      stickerMenu,
      ownerMenu,
      groupMenu,
      toolsMenu,
      gameMenu,
      searchMenu,
      aiMenu,
      footballMenu,
      textmakerMenu
    ].join('\n');
  } else {
    menu = [
      otherMenu,
      downloaderMenu,
      stickerMenu,
      ownerMenu,
      groupMenu,
      toolsMenu,
      gameMenu,
      searchMenu,
      aiMenu,
      footballMenu,
      textmakerMenu
    ].join('\n');
  }

  let fullMenu = `${infoBot}\n${menu}`;

  // Resolve thumbnail — honour .menuimage setting, fall back to media/thumb.png
  let _thumbBuf = null
  try {
    const _mt = global.menuThumb
    if (_mt) {
      if (/^https?:\/\//.test(_mt)) {
        _thumbBuf = await getBuffer(_mt).catch(() => null)
      } else if (fs.existsSync(_mt)) {
        _thumbBuf = fs.readFileSync(_mt)
      }
    }
    if (!_thumbBuf) _thumbBuf = fs.readFileSync(path.join(__dirname, 'media', 'thumb.png'))
  } catch {}

  await X.sendMessage(
    m.chat,
    {
      text: fullMenu,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        mentionedJid: [sender],
        externalAdReply: {
          title: "TOOSII-XD ULTRA",
          body: "Toosii Tech",
          thumbnail: _thumbBuf || undefined,
          sourceUrl: global.wagc || global.sessionUrl || '',
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    },
    { quoted: m }
  );
}
break;

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Download Features
case 'mfdl':
case 'mediafire': {
    await X.sendMessage(m.chat, { react: { text: '📥', key: m.key } })
 if (!text) return reply('Please provide a MediaFire link')
  try {
    const _mfHtml = await axios.get(text, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 20000
    })
    const _mfPage = _mfHtml.data || ''
    const _dlMatch = _mfPage.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/)
      || _mfPage.match(/"downloadUrl":"([^"]+)"/)
      || _mfPage.match(/id="downloadButton"[^>]+href="([^"]+)"/)
    if (!_dlMatch) return reply('❌ Could not extract download link. Please check the MediaFire URL.')
    const _dlLink = _dlMatch[1].replace(/&amp;/g, '&')
    const _fnMatch = _mfPage.match(/"filename"\s*:\s*"([^"]+)"/)
      || _mfPage.match(/class="filename"[^>]*>([^<]+)</)
      || _mfPage.match(/<title>([^<|]+)/)
    const fileNama = (_fnMatch ? _fnMatch[1].trim() : 'mediafire_file') + ''
    const extension = fileNama.split('.').pop().toLowerCase()
    let mimetype = extension === 'mp4' ? 'video/mp4' : extension === 'mp3' ? 'audio/mpeg' : `application/${extension}`
    const _res = await axios.get(_dlLink, {
      responseType: 'arraybuffer', timeout: 60000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    })
    await X.sendMessage(m.chat, {
      document: Buffer.from(_res.data),
      fileName: fileNama,
      mimetype: mimetype
    }, { quoted: m })
  } catch (err) {
    console.error('[MEDIAFIRE]', err.message)
    reply('❌ Download failed. Make sure the MediaFire link is valid and public.')
  }
}
break
case 'ig':
  case 'instagram': {
      await X.sendMessage(m.chat, { react: { text: '📸', key: m.key } })
      if (!text) return reply("Please provide the Instagram link");
      let _igUrl = null

      // Source 1: igdl library
      try {
          const mediaUrl = await igdl(text);
          if (mediaUrl?.[0]?.url) _igUrl = mediaUrl[0].url
      } catch(_e1) { console.log('[ig] igdl:', _e1.message) }

      // Source 2: EliteProTech /instagram
      if (!_igUrl) {
        try {
          let _epIg = await fetch(`https://eliteprotech-apis.zone.id/instagram?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
          let _epIgd = await _epIg.json()
          console.log('[ig] eliteprotech:', _epIgd.status)
          const _igEpUrl = _epIgd?.video || _epIgd?.result?.url || _epIgd?.url || _epIgd?.data?.[0]?.url
          if ((_epIgd?.status || _epIgd?.success) && _igEpUrl) _igUrl = _igEpUrl
        } catch(_e2) { console.log('[ig] eliteprotech:', _e2.message) }
      }

      // Source 3: GiftedTech instadl
      if (!_igUrl) {
        try {
          let _gifKey = process.env.GIFTED_API_KEY || 'gifted'
          let _gtIg = await fetch(`https://api.giftedtech.co.ke/api/download/instadl?apikey=${_gifKey}&url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
          let _gtIgd = await _gtIg.json()
          console.log('[ig] gifted:', _gtIgd.success)
          if (_gtIgd.success && _gtIgd.result?.download_url) _igUrl = _gtIgd.result.download_url
        } catch(_e3) { console.log('[ig] gifted:', _e3.message) }
      }

      if (!_igUrl) return reply('❌ Failed to download. The link may be private or invalid. Try again.')
      try {
          const response = await axios.head(_igUrl);
          const contentType = response.headers['content-type'];
          if (contentType && contentType.startsWith('image/')) {
              await safeSendMedia(m.chat, { image: { url: _igUrl}, caption: 'Done!' }, {}, { quoted: m });
          } else {
              await safeSendMedia(m.chat, { video: { url: _igUrl}, caption: 'Done!' }, {}, { quoted: m });
          }
      } catch(e) {
         console.log('[ig] send error:', e.message)
         reply('❌ An error occurred while sending the media. Please try again.')
      }
  }
break

  case 'tw':
  case 'twitter':
  case 'xdl': {
      await X.sendMessage(m.chat, { react: { text: '🐦', key: m.key } })
      if (!text) return reply(`Usage: ${prefix + command} <Twitter/X link>\nExample: ${prefix + command} https://x.com/i/status/...`)
      let _twUrl = null, _twThumb = null

      // Source 1: EliteProTech /x
      try {
        const _epX = await fetch(`https://eliteprotech-apis.zone.id/x?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
        const _epXd = await _epX.json()
        if (_epXd.status === 'success' && _epXd.videos?.length) {
          _twUrl = _epXd.videos[0].url
          _twThumb = _epXd.thumbnail || null
        }
      } catch(_e1) { console.log('[tw] eliteprotech:', _e1.message) }

      // Source 2: GiftedTech twitter
      if (!_twUrl) {
        try {
          const _gifKey = process.env.GIFTED_API_KEY || 'gifted'
          const _gtTw = await fetch(`https://api.giftedtech.co.ke/api/download/twitter?apikey=${_gifKey}&url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
          const _gtTwd = await _gtTw.json()
          if (_gtTwd.success && _gtTwd.result?.videoUrls?.length) {
            const _sorted = _gtTwd.result.videoUrls.sort((a,b) => (parseInt(b.quality)||0) - (parseInt(a.quality)||0))
            _twUrl = _sorted[0].url
            _twThumb = _gtTwd.result.thumbnail || null
          }
        } catch(_e2) { console.log('[tw] gifted:', _e2.message) }
      }

      if (!_twUrl) return reply('❌ Failed to download. The link may be invalid or the tweet has no video.')
      try {
        await safeSendMedia(m.chat, { video: { url: _twUrl }, caption: '✅ Downloaded from X/Twitter' }, {}, { quoted: m })
      } catch(e) { reply('❌ Error sending media: ' + e.message) }
  }
  break

  case 'firelogo':
  case 'flogo': {
      await X.sendMessage(m.chat, { react: { text: '🔥', key: m.key } })
      if (!text) return reply(`Usage: ${prefix + command} [your text]\nExample: ${prefix + command} TOOSII`)
      try {
        const _fl = await fetch(`https://eliteprotech-apis.zone.id/firelogo?text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
        const _fld = await _fl.json()
        if (_fld.success && _fld.image) {
          await safeSendMedia(m.chat, { image: { url: _fld.image }, caption: `🔥 *Fire Logo* › ${text}` }, {}, { quoted: m })
        } else reply('❌ Failed to generate logo. Try shorter text.')
      } catch(e) { reply('❌ Error: ' + e.message) }
  }
  break

  case 'spotify':
  case 'sp': {
      await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
      if (!text) return reply(`Usage: ${prefix + command} <Spotify link>\nExample: ${prefix + command} https://open.spotify.com/track/...`)
      if (!/open\.spotify\.com\/track\//i.test(text)) return reply('❌ Only Spotify *track* links are supported.\nhttps://open.spotify.com/track/...')
      try {
        const _sp = await fetch(`https://eliteprotech-apis.zone.id/spotify?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(25000) })
        const _spd = await _sp.json()
        if (_spd.success && _spd.data?.download) {
          const _meta = _spd.data.metadata
          const _cap = `🎵 *${_meta?.title || 'Track'}*\n👤 ${_meta?.artist || 'Unknown'}\n⏱️ ${_meta?.duration || '--:--'}\n\n_Downloaded via Toosii Tech_`
          await X.sendMessage(m.chat, { audio: { url: _spd.data.download }, mimetype: 'audio/mpeg', fileName: `${_meta?.title || 'spotify'}.mp3` }, { quoted: m })
          await reply(_cap)
        } else reply('❌ Could not download. Make sure it is a valid public Spotify track link.')
      } catch(e) { reply('❌ Error: ' + e.message) }
  }
  break

  case 'tempemail':
  case 'tempmail': {
      await X.sendMessage(m.chat, { react: { text: '📧', key: m.key } })
      try {
        const _te = await fetch('https://eliteprotech-apis.zone.id/tempemail', { signal: AbortSignal.timeout(15000) })
        const _ted = await _te.json()
        if (_ted.success && _ted.email) {
          reply(`📧 *Temporary Email*\n\n${_ted.email}\n\n_Use for sign-ups to avoid spam in your real inbox._\n_Generated by Toosii Tech_`)
        } else reply('❌ Failed to generate email. Try again.')
      } catch(e) { reply('❌ Error: ' + e.message) }
  }
  break

  case 'tt':  
case 'tiktok': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
if (!text) return reply(`Example: ${prefix + command} <tiktok link>`)
try {
    let data = await fg.tiktok(text)
    if (!data || !data.result) return reply('Failed to download. The link may be invalid.')
    let json = data.result
    let caption = `[ TIKTOK DOWNLOAD ]\n\n`
    caption += `*Username* : ${json.author?.nickname || 'Unknown'}\n`
    caption += `*Title* : ${json.title || '-'}\n`
    caption += `*Likes* : ${json.digg_count || 0}\n`
    caption += `*Comments* : ${json.comment_count || 0}\n`
    caption += `*Shares* : ${json.share_count || 0}\n`
    caption += `*Plays* : ${json.play_count || 0}\n`
    caption += `*Duration* : ${json.duration || '-'}`
    if (json.images && json.images.length) {
        for (const k of json.images) {
            if (k) await safeSendMedia(m.chat, { image: { url: k }}, {}, { quoted: m });
        }
    } else if (json.play) {
        await safeSendMedia(m.chat, { video: { url: json.play }, mimetype: 'video/mp4', caption: caption }, {}, { quoted: m });
        if (json.music) {
            await sleep(3000);
            await safeSendMedia(m.chat, { audio: { url: json.music }, mimetype: 'audio/mpeg' }, {}, { quoted: m });
        }
    } else {
        reply('Failed to download. No media URL found.')
    }
} catch (e) {
    console.log('TikTok error:', e)
    reply('An error occurred while downloading. Please try again.')
}
}
break

case 'fb':
case 'fbdl':
case 'facebook' : {
if (!text) return reply('Please provide the Facebook URL')
    try {
        await X.sendMessage(m.chat, { react: { text: '📥', key: m.key } })
        let _fbUrl = null, _fbTitle = null, _fbDuration = null

        // Source 1: EliteProTech API
        try {
          let _ep = await fetch(`https://eliteprotech-apis.zone.id/facebook?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
          let _epd = await _ep.json()
          console.log('[fb] eliteprotech: success=', _epd.success, 'has video=', !!_epd.video)
          const _fbEpUrl = _epd.video || _epd.result?.hd || _epd.result?.sd || _epd.result?.url
          if (_epd.success && _fbEpUrl) {
            _fbUrl      = _fbEpUrl
            _fbTitle    = _epd.title    || _epd.result?.title    || null
            _fbDuration = _epd.duration || _epd.result?.duration || null
          }
        } catch (_e1) { console.log('[fb] eliteprotech:', _e1.message) }

        // Source 1b: EliteProTech /facebook1
          if (!_fbUrl) {
            try {
              let _ep1b = await fetch(`https://eliteprotech-apis.zone.id/facebook1?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
              let _ep1bd = await _ep1b.json()
              console.log('[fb] eliteprotech1:', _ep1bd.success, 'results=', _ep1bd.results?.length)
              if (_ep1bd.success && _ep1bd.results?.length) {
                const _fb1hd = _ep1bd.results.find(r => /hd|720|1080/i.test(r.quality)) || _ep1bd.results[0]
                if (_fb1hd?.url) {
                  _fbUrl      = _fb1hd.url
                  _fbTitle    = _ep1bd.title    || null
                  _fbDuration = _ep1bd.duration || null
                }
              }
            } catch (_e1b) { console.log('[fb] eliteprotech1:', _e1b.message) }
          }

          // Source 2: fdown library fallback
        if (!_fbUrl) {
          try {
            let res = await fdown.download(text)
            if (res?.length > 0) {
              _fbUrl      = res[0].hdQualityLink || res[0].normalQualityLink
              _fbTitle    = res[0].title       || null
              _fbDuration = res[0].duration    || null
            }
          } catch (_e2) { console.log('[fb] fdown:', _e2.message) }
        }

        // Source 3: GiftedTech fbdl
        if (!_fbUrl) {
          try {
            let _gt = await fetch(`https://api.giftedtech.co.ke/api/download/fbdl?apikey=${_giftedKey()}&url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
            let _gtd = await _gt.json()
            console.log('[fb] giftedtech: success=', _gtd.success)
            if (_gtd.success && _gtd.result) {
              _fbUrl      = _gtd.result.video_hd || _gtd.result.video_sd || _gtd.result.download_url
              _fbTitle    = _gtd.result.title    || null
              _fbDuration = _gtd.result.duration || null
            }
          } catch (_e3) { console.log('[fb] giftedtech:', _e3.message) }
        }

        if (_fbUrl) {
          let _cap = `📹 *Facebook Video*`
          if (_fbTitle)    _cap += `\n📌 *Title:* ${_fbTitle}`
          if (_fbDuration) _cap += `\n⏱️ *Duration:* ${_fbDuration}`
          await safeSendMedia(m.chat, { video: { url: _fbUrl }, caption: _cap, mimetype: 'video/mp4' }, {}, { quoted: m })
        } else {
          reply('❌ Could not download that Facebook video. Make sure the video is public and the link is correct.')
        }
      } catch (e) {
        console.log('[fb] error:', e.message)
        reply('❌ An error occurred while downloading. Please try again.')
      }
  }
break

  case 'vocalremove':
  case 'removevocal':
  case 'instrumental': {
      await X.sendMessage(m.chat, { react: { text: '🎙️', key: m.key } })
      try {
          let _vrUrl = text?.match(/^https?:\/\//i) ? text.trim() : null
          if (!_vrUrl && m.quoted) {
              let _mtype = m.quoted.mimetype || ''
              if (!/audio|video/.test(_mtype)) return reply('❌ Reply to an audio/video message with *.vocalremove*, or provide an audio URL.')
              await reply('⏳ _Uploading audio for processing..._')
              let _buf = await m.quoted.download()
              if (!_buf || _buf.length < 1000) return reply('❌ Could not download the audio. Try again.')
              const _FormData = (await import('form-data')).default
              const _fd = new _FormData()
              _fd.append('reqtype', 'fileupload')
              _fd.append('fileToUpload', _buf, { filename: 'audio.mp3', contentType: _mtype || 'audio/mpeg' })
              let _cbRes = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: _fd, headers: _fd.getHeaders(), signal: AbortSignal.timeout(30000) })
              _vrUrl = (await _cbRes.text()).trim()
              if (!_vrUrl.startsWith('http')) return reply('❌ Failed to upload audio. Try again.')
              console.log('[vocalremove] catbox url:', _vrUrl)
          }
          if (!_vrUrl) return reply('❌ Reply to an audio message or provide an audio URL.\nExample: *.vocalremove https://example.com/song.mp3*')
          await reply('🎙️ _Removing vocals, please wait..._')
          let _vrRes = await fetch(`https://eliteprotech-apis.zone.id/vocalremove?url=${encodeURIComponent(_vrUrl)}`, { signal: AbortSignal.timeout(60000) })
          let _vrd = await _vrRes.json()
          console.log('[vocalremove] result:', JSON.stringify(_vrd).slice(0, 200))
          if (_vrd.success !== false && (_vrd.instrumental || _vrd.result || _vrd.url || _vrd.download)) {
              let _instrUrl = _vrd.instrumental || _vrd.result || _vrd.url || _vrd.download
              await X.sendMessage(m.chat, { audio: { url: _instrUrl }, mimetype: 'audio/mpeg', fileName: 'instrumental.mp3' }, { quoted: m })
              await reply('✅ *Vocals removed!* Instrumental track sent above.')
          } else {
              reply('❌ Could not process this audio. Make sure it is a valid, accessible audio URL.\n_Details: ' + (JSON.stringify(_vrd).slice(0, 120)) + '_')
          }
      } catch(e) { reply('❌ Vocal removal failed: ' + e.message) }
  } break
  
case 'play':
case 'song':
case 'music':
case 'ytplay': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
    if (!text) return reply('What song do you want to search for?\n\nExample: .play Juice WRLD Lucid Dreams')
    let _tmpFile = null
    try {
        let search = await yts(text)
        if (!search || !search.all || !search.all.length) return reply('No results found.')
        let firstVideo = search.all.find(v => v.type === 'video') || search.all[0]
        let videoTitle  = firstVideo.title || 'Unknown Title'
        let videoAuthor = firstVideo.author?.name || firstVideo.author || 'Unknown Artist'
        let cleanName   = `${videoAuthor} - ${videoTitle}.mp3`.replace(/[<>:"/\\|?*]/g, '')

        // audioUrl  = remote HTTPS URL  (no RAM usage — baileys streams it)
        // audioPath = local file path   (no readFileSync — baileys reads via file:// URL)
        let audioUrl = null, audioPath = null

        // Extract video ID helper
        const _getVideoId = (url) => {
            let m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/)
            return m ? m[1] : null
        }

        // Method 1: GiftedTech API — 128kbps, direct download URL
        if (!audioUrl && !audioPath) {
            try {
                let res = await fetch(`https://api.giftedtech.co.ke/api/download/ytmp3?apikey=${_giftedKey()}&quality=128kbps&url=${encodeURIComponent(firstVideo.url)}`, {
                    signal: AbortSignal.timeout(30000)
                })
                let data = await res.json()
                console.log('[play] giftedtech: success=', data.success, 'quality=', data.result?.quality)
                if (data.success && data.result?.download_url) {
                    audioUrl = data.result.download_url
                }
            } catch (e0) { console.log('[play] giftedtech:', e0.message) }

          // Method 1.5: EliteProTech API — fast single-call MP3 URL
          if (!audioUrl && !audioPath) {
              try {
                  let _ep = await fetch(`https://eliteprotech-apis.zone.id/ytmp3?url=${encodeURIComponent(firstVideo.url)}`, { signal: AbortSignal.timeout(20000) })
                  let _epd = await _ep.json()
                  console.log('[play] eliteprotech: status=', _epd.status)
                  if (_epd.status === true && _epd.result?.download) {
                      audioUrl = _epd.result.download
                      if (!videoTitle || videoTitle === 'Unknown Title') videoTitle = _epd.result.title || videoTitle
                  }
              } catch (_ep0) { console.log('[play] eliteprotech:', _ep0.message) }
          }
  
        }

        // Method 2: YouTube InnerTube API — try iOS then TV client (Android gets blocked)
        if (!audioUrl && !audioPath) {
            const _innerTube = async (clientName, clientVersion, extra = {}) => {
                try {
                    let videoId = _getVideoId(firstVideo.url)
                    if (!videoId) return null
                    let itRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-YouTube-Client-Name': '5', 'X-YouTube-Client-Version': clientVersion },
                        body: JSON.stringify({ videoId, context: { client: { clientName, clientVersion, hl: 'en', gl: 'US', ...extra } } }),
                        signal: AbortSignal.timeout(20000)
                    })
                    let itData = await itRes.json()
                    let fmts = [...(itData.streamingData?.adaptiveFormats || []), ...(itData.streamingData?.formats || [])]
                    let audioFmts = fmts.filter(f => f.mimeType?.startsWith('audio/') && f.url)
                    audioFmts.sort((a, b) => Math.abs((a.bitrate || 0) - 128000) - Math.abs((b.bitrate || 0) - 128000))
                    if (audioFmts[0]?.url) return { url: audioFmts[0].url, bitrate: audioFmts[0].bitrate }
                    console.log(`[play] innertube(${clientName}): status=`, itData.playabilityStatus?.status || 'no streamingData')
                } catch (e) { console.log(`[play] innertube(${clientName}):`, e.message) }
                return null
            }
            // ANDROID_TESTSUITE bypasses most auth/music restrictions
            let it = await _innerTube('ANDROID_TESTSUITE', '1.9', { androidSdkVersion: 30 })
                   || await _innerTube('IOS', '19.29.1', { deviceModel: 'iPhone16,2' })
                   || await _innerTube('TVHTML5', '7.20220325')
            if (it) { audioUrl = it.url; console.log('[play] innertube: success bitrate=', it.bitrate) }
        }

        // Method 2: loader.to — mp3 (moved up, confirmed working)
        if (!audioUrl && !audioPath) {
            try {
                let _ltRes = await fetch(`https://loader.to/ajax/download.php?format=mp3&url=${encodeURIComponent(firstVideo.url)}`, { signal: AbortSignal.timeout(12000) })
                let _ltData = await _ltRes.json()
                console.log('[play] loader.to init:', _ltData.success, _ltData.id)
                if (_ltData.success && _ltData.id) {
                    for (let _i = 0; _i < 25; _i++) {
                        await new Promise(r => setTimeout(r, 3000))
                        let _prog = await (await fetch(`https://loader.to/ajax/progress.php?id=${_ltData.id}`)).json()
                        if (_prog.success === 1 && _prog.progress >= 1000 && _prog.download_url) {
                            audioUrl = _prog.download_url
                            console.log('[play] loader.to: success')
                            break
  
                        }
                        if (_prog.progress < 0) { console.log('[play] loader.to: failed'); break }
                    }
                }
            } catch (_e2) { console.log('[play] loader.to-early:', _e2.message) }
        }

        // Method 3: Invidious — multiple instances, actual call (fixed dead code)
        if (!audioUrl && !audioPath) {
            const _invidious = async (instance) => {
                try {
                    let videoId = _getVideoId(firstVideo.url)
                    if (!videoId) return null
                    let res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`, { signal: AbortSignal.timeout(12000) })
                    let data = await res.json()
                    let fmts = [...(data.adaptiveFormats || []), ...(data.formatStreams || [])]
                    let audioFmts = fmts.filter(f => (f.type || f.mimeType || '').startsWith('audio/') && f.url)
                    audioFmts.sort((a, b) => Math.abs((a.bitrate || 0) - 128000) - Math.abs((b.bitrate || 0) - 128000))
                    if (audioFmts[0]?.url) return audioFmts[0].url
                } catch (e) { console.log('[play] invidious(' + instance + '):', e.message) }
                return null
            }
            const _invInstances = await getInvPool()
            for (const _inst of _invInstances) {
                audioUrl = await _invidious(_inst)
                if (audioUrl) { console.log('[play] invidious: success', _inst); break }
            }
        }

        // Method 5: ytdl-core with agent
        if (!audioUrl && !audioPath) {
            try {
                const ytdl = require('@distube/ytdl-core')
                const agent = ytdl.createAgent()
                let info = await ytdl.getInfo(firstVideo.url, { agent })
                let audioFormats = info.formats.filter(f => f.hasAudio && !f.hasVideo)
                audioFormats.sort((a, b) => (a.audioBitrate || 0) - (b.audioBitrate || 0))
                let format = audioFormats.find(f => (f.audioBitrate || 0) >= 96) || audioFormats[audioFormats.length - 1]
                if (!format) format = ytdl.chooseFormat(info.formats, { filter: f => f.hasAudio })
                if (format) {
                    let tmpDir = path.join(__dirname, 'tmp')
                    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
                    let tmpBase = path.join(tmpDir, `play_${Date.now()}`)
                    _tmpFile = tmpBase + '.mp3'
                    await new Promise((resolve, reject) => {
                        let writeStream = fs.createWriteStream(_tmpFile)
                        let ytStream = ytdl(firstVideo.url, { format, agent })
                        ytStream.pipe(writeStream)
                        writeStream.on('finish', resolve)
                        writeStream.on('error', reject)
                        ytStream.on('error', reject)
                        setTimeout(() => { ytStream.destroy(); reject(new Error('timeout')) }, 300000)
                    })
                    if (fs.existsSync(_tmpFile) && fs.statSync(_tmpFile).size > 10000) {
                        // Re-encode raw stream to 128kbps CBR MP3 if ffmpeg is available
                        try {
                            const _rawPath = _tmpFile.replace('.mp3', '_raw.m4a')
                            fs.renameSync(_tmpFile, _rawPath)
                            await new Promise((res, rej) => exec(
                                `ffmpeg -y -i "${_rawPath}" -codec:a libmp3lame -b:a 128k -ar 44100 -ac 2 "${_tmpFile}"`,
                                { timeout: 120000 }, (err) => { try { fs.unlinkSync(_rawPath) } catch {}; err ? rej(err) : res() }
                            ))
                        } catch { /* ffmpeg unavailable — use raw download */ }
                        audioPath = _tmpFile
                        console.log('[play] ytdl-core: success')
                    }
                }
            } catch (e5) { console.log('[play] ytdl-core:', e5.message) }
        }

        // Method 6: yt-dlp — only if installed on the system (skips silently if not found)
        if (!audioUrl && !audioPath) {
            try {
                let tmpDir = path.join(__dirname, 'tmp')
                if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
                let tmpBase = path.join(tmpDir, `play_${Date.now()}`)
                _tmpFile = tmpBase + '.mp3'
                let ytdlpBin = null
                for (let bin of ['yt-dlp', 'youtube-dl', 'yt-dlp_linux']) {
                    try { require('child_process').execSync(`which ${bin} 2>/dev/null`); ytdlpBin = bin; break } catch {}
                }
                if (!ytdlpBin) throw new Error('no yt-dlp binary found')
                await new Promise((resolve, reject) => {
                    exec(
                        `${ytdlpBin} -x --audio-format mp3 --audio-quality 5 --postprocessor-args "ffmpeg:-b:a 128k -ar 44100 -ac 2" --no-playlist -o "${tmpBase}.%(ext)s" "${firstVideo.url}"`,
                        { timeout: 300000 },
                        (err) => err ? reject(err) : resolve()
                    )
                })
                if (!fs.existsSync(_tmpFile)) {
                    let base = path.basename(tmpBase)
                    let found = fs.readdirSync(tmpDir).find(f => f.startsWith(base))
                    if (found) { _tmpFile = path.join(tmpDir, found) }
                }
                if (fs.existsSync(_tmpFile) && fs.statSync(_tmpFile).size > 10000) {
                    audioPath = _tmpFile
                    console.log('[play] yt-dlp: success')
                }
            } catch (e4) { console.log('[play] yt-dlp:', e4.message) }
        }

        if (audioUrl || audioPath) {
            let thumbBuffer = null
            try { thumbBuffer = await getBuffer(firstVideo.thumbnail) } catch {}
            let songInfo = `🎵 *Now Playing*\n\n📌 *Title:*  ${videoTitle}\n🎤 *Artist:* ${videoAuthor}\n⏱️ *Duration:* ${firstVideo.timestamp}\n👁️ *Views:* ${firstVideo.views?.toLocaleString?.() || firstVideo.views}`
            let msgPayload = {
                document: audioUrl ? { url: audioUrl } : { url: `file://${audioPath}` },
                mimetype: 'audio/mpeg',
                fileName: cleanName,
                caption: songInfo
            }
            if (thumbBuffer) msgPayload.jpegThumbnail = thumbBuffer
            await X.sendMessage(m.chat, msgPayload, { quoted: m })
        } else {
            reply(`🎵 *${videoTitle}*\nArtist: ${videoAuthor}\nDuration: ${firstVideo.timestamp}\n\n⚠️ Audio download failed. Please try again later.`)
        }
    } catch (e) {
        console.log('[play] error:', e.message)
        reply('An error occurred while processing. Please try again.')
    } finally {
        // Always clean up tmp file
        if (_tmpFile && fs.existsSync(_tmpFile)) { try { fs.unlinkSync(_tmpFile) } catch {} }
    }
}
break;
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Lyrics Command — multi-source with fallback chain
case 'lyrics':
case 'lyric':
case 'songlyrics': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
    if (!text) return reply(
`🎵 *Lyrics Search*

Usage: ${prefix}lyrics [song name] - [artist]
Examples:
• ${prefix}lyrics Lucid Dreams Juice WRLD
• ${prefix}lyrics Blinding Lights - The Weeknd
• ${prefix}lyrics HUMBLE Kendrick Lamar`)

    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })

    // Parse "song - artist" or "song artist" from input
    let _lyrQuery = text.trim()
    let _lyrSong = _lyrQuery
    let _lyrArtist = ''
    const _dashSplit = _lyrQuery.split(/\s*-\s*/)
    if (_dashSplit.length >= 2) {
        _lyrSong = _dashSplit[0].trim()
        _lyrArtist = _dashSplit.slice(1).join(' ').trim()
    }

    let _lyrResult = null
    let _lyrSource = ''

    // ── Source 0: GiftedTech lyrics API ──────────────────────────────
    try {
        let _gt = await fetch(`https://api.giftedtech.co.ke/api/search/lyrics?apikey=${_giftedKey()}&query=${encodeURIComponent(_lyrQuery)}`, { signal: AbortSignal.timeout(15000) })
        let _gtd = await _gt.json()
        if (_gtd.success && _gtd.result?.lyrics) {
            _lyrResult = { lyrics: _gtd.result.lyrics, title: _gtd.result.title || _lyrSong, artist: _gtd.result.artist || _lyrArtist, image: _gtd.result.image }
            _lyrSource = 'Toosii Tech'
        }
    } catch {}

    // ── Source 1: lyrics.ovh (free, no key) ─────────────────────────
    if (!_lyrResult && _lyrArtist) {
        try {
            const _r1 = await axios.get(
                `https://api.lyrics.ovh/v1/${encodeURIComponent(_lyrArtist)}/${encodeURIComponent(_lyrSong)}`,
                { timeout: 10000 }
            )
            if (_r1.data?.lyrics?.trim().length > 10) {
                _lyrResult = { lyrics: _r1.data.lyrics.trim(), title: _lyrSong, artist: _lyrArtist }
                _lyrSource = 'lyrics.ovh'
            }
        } catch {}
    }

    // ── Source 2: Lyrics.ovh search (no artist needed) ───────────────
    if (!_lyrResult) {
        try {
            const _r2 = await axios.get(
                `https://api.lyrics.ovh/suggest/${encodeURIComponent(_lyrQuery)}`,
                { timeout: 10000 }
            )
            const _hit = _r2.data?.data?.[0]
            if (_hit) {
                const _r2b = await axios.get(
                    `https://api.lyrics.ovh/v1/${encodeURIComponent(_hit.artist?.name || '')}/${encodeURIComponent(_hit.title || '')}`,
                    { timeout: 10000 }
                )
                if (_r2b.data?.lyrics?.trim().length > 10) {
                    _lyrResult = {
                        lyrics: _r2b.data.lyrics.trim(),
                        title: _hit.title || _lyrSong,
                        artist: _hit.artist?.name || _lyrArtist,
                        album: _hit.album?.title || '',
                        thumbnail: _hit.album?.cover_medium || ''
                    }
                    _lyrSource = 'lyrics.ovh'
                }
            }
        } catch {}
    }

    // ── Source 3: Musixmatch unofficial ──────────────────────────────
    if (!_lyrResult) {
        try {
            const _mmSearch = await axios.get(
                `https://api.musixmatch.com/ws/1.1/track.search?q_track_artist=${encodeURIComponent(_lyrQuery)}&page_size=1&page=1&s_track_rating=desc&apikey=0e9ce71d2f2c9251f74a9bfcd7e3aead`,
                { timeout: 10000 }
            )
            const _mmTrack = _mmSearch.data?.message?.body?.track_list?.[0]?.track
            if (_mmTrack) {
                const _mmLyr = await axios.get(
                    `https://api.musixmatch.com/ws/1.1/track.lyrics.get?track_id=${_mmTrack.track_id}&apikey=0e9ce71d2f2c9251f74a9bfcd7e3aead`,
                    { timeout: 10000 }
                )
                const _mmText = _mmLyr.data?.message?.body?.lyrics?.lyrics_body?.trim()
                if (_mmText && _mmText.length > 10 && !_mmText.includes('******* This Lyrics')) {
                    _lyrResult = {
                        lyrics: _mmText,
                        title: _mmTrack.track_name || _lyrSong,
                        artist: _mmTrack.artist_name || _lyrArtist
                    }
                    _lyrSource = 'Musixmatch'
                }
            }
        } catch {}
    }

    // ── Source 4: lrclib.net (has synced + plain lyrics, no key) ─────
    if (!_lyrResult) {
        try {
            const _lcQ = encodeURIComponent(_lyrQuery)
            const _lcRes = await axios.get(
                `https://lrclib.net/api/search?q=${_lcQ}`,
                { timeout: 10000 }
            )
            const _lcHit = _lcRes.data?.[0]
            if (_lcHit && (_lcHit.plainLyrics || _lcHit.syncedLyrics)) {
                // Prefer plain lyrics; strip timestamps from synced if needed
                let _lcText = _lcHit.plainLyrics || ''
                if (!_lcText && _lcHit.syncedLyrics) {
                    _lcText = _lcHit.syncedLyrics
                        .split('\n')
                        .map(l => l.replace(/^\[\d+:\d+\.\d+\]\s*/, '').trim())
                        .filter(Boolean)
                        .join('\n')
                }
                if (_lcText.trim().length > 10) {
                    _lyrResult = {
                        lyrics: _lcText.trim(),
                        title: _lcHit.trackName || _lyrSong,
                        artist: _lcHit.artistName || _lyrArtist,
                        album: _lcHit.albumName || ''
                    }
                    _lyrSource = 'lrclib.net'
                }
            }
        } catch {}
    }

    // ── Source 5: Genius search via unofficial scrape helper ─────────
    if (!_lyrResult) {
        try {
            const _gSearch = await axios.get(
                `https://genius.com/api/search/multi?per_page=1&q=${encodeURIComponent(_lyrQuery)}`,
                {
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                }
            )
            const _gHits = _gSearch.data?.response?.sections?.find(s => s.type === 'song')?.hits
            const _gHit = _gHits?.[0]?.result
            if (_gHit) {
                // Scrape the Genius page for plain lyrics
                const _gPage = await axios.get(_gHit.url, {
                    timeout: 12000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                })
                const _gHtml = _gPage.data || ''
                // Extract lyrics from data-lyrics-container divs
                const _lyricChunks = []
                const _containerRe = /data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi
                let _cm
                while ((_cm = _containerRe.exec(_gHtml)) !== null) {
                    let _chunk = _cm[1]
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<[^>]+>/g, '')
                        .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
                        .replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                        .replace(/&nbsp;/g, ' ')
                    _lyricChunks.push(_chunk.trim())
                }
                const _gLyrics = _lyricChunks.join('\n\n').trim()
                if (_gLyrics.length > 20) {
                    _lyrResult = {
                        lyrics: _gLyrics,
                        title: _gHit.title || _lyrSong,
                        artist: _gHit.primary_artist?.name || _lyrArtist,
                        thumbnail: _gHit.song_art_image_thumbnail_url || ''
                    }
                    _lyrSource = 'Genius'
                }
            }
        } catch {}
    }

    // ── Source 6: AI fallback — generate from knowledge ──────────────
    if (!_lyrResult) {
        try {
            const _aiLyr = await _runChatBoAI(
                `Please provide the full song lyrics for "${_lyrQuery}". Format: first line = "Title: [title]", second line = "Artist: [artist]", then a blank line, then the complete lyrics. If you don't know the exact lyrics, say UNKNOWN.`,
                false
            )
            if (_aiLyr && !_aiLyr.includes('UNKNOWN') && _aiLyr.length > 50) {
                const _aiLines = _aiLyr.split('\n')
                const _aiTitle = (_aiLines.find(l => /^title:/i.test(l)) || '').replace(/^title:\s*/i, '').trim() || _lyrSong
                const _aiArtist = (_aiLines.find(l => /^artist:/i.test(l)) || '').replace(/^artist:\s*/i, '').trim() || _lyrArtist
                const _aiText = _aiLines.filter(l => !/^(title|artist):/i.test(l)).join('\n').trim()
                if (_aiText.length > 20) {
                    _lyrResult = { lyrics: _aiText, title: _aiTitle, artist: _aiArtist }
                    _lyrSource = 'AI'
                }
            }
        } catch {}
    }

    // ── No result found ───────────────────────────────────────────────
    if (!_lyrResult) {
        return reply(
`❌ *Lyrics Not Found*

Could not find lyrics for: *${_lyrQuery}*

Tips:
• Try: ${prefix}lyrics [song name] - [artist name]
• Check spelling
• Use English title if available`)
    }

    // ── Format & send lyrics ──────────────────────────────────────────
    const _cleanLyrics = _lyrResult.lyrics
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    // Split into chunks if lyrics are too long (WA message limit ~65KB)
    const _MAX_CHUNK = 3500
    const _lyrHeader =
`╔═════════╗
║  🎵 *SONG LYRICS*
╚═════════╝

  ├◈ 🎤 *Title*  › ${_lyrResult.title}
  ├◈ 👤 *Artist* › ${_lyrResult.artist}${_lyrResult.album ? `\n  ├ 💿 *Album*  › ${_lyrResult.album}` : ''}
  └◈ 📡 *Source* › ${_lyrSource}

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄

`

    if (_cleanLyrics.length <= _MAX_CHUNK) {
        const _fullMsg = _lyrHeader + _cleanLyrics + '\n\n_─────────────────────────_\n_🤖 TOOSII-XD ULTRA_'
        // Send with thumbnail if available
        if (_lyrResult.thumbnail) {
            try {
                const _thumb = await getBuffer(_lyrResult.thumbnail)
                await X.sendMessage(m.chat, { image: _thumb, caption: _fullMsg }, { quoted: m })
            } catch {
                reply(_fullMsg)
            }
        } else {
            reply(_fullMsg)
        }
    } else {
        // Send in multiple parts for long lyrics
        const _parts = []
        let _remaining = _cleanLyrics
        while (_remaining.length > 0) {
            // Try to break at a newline near the limit
            let _cutAt = _MAX_CHUNK
            if (_remaining.length > _MAX_CHUNK) {
                const _breakAt = _remaining.lastIndexOf('\n', _MAX_CHUNK)
                _cutAt = _breakAt > 500 ? _breakAt : _MAX_CHUNK
            }
            _parts.push(_remaining.slice(0, _cutAt).trim())
            _remaining = _remaining.slice(_cutAt).trim()
        }

        // Part 1 — with header and thumbnail
        const _part1 = _lyrHeader + _parts[0]
        if (_lyrResult.thumbnail) {
            try {
                const _thumb = await getBuffer(_lyrResult.thumbnail)
                await X.sendMessage(m.chat, { image: _thumb, caption: _part1 }, { quoted: m })
            } catch {
                await X.sendMessage(m.chat, { text: _part1 }, { quoted: m })
            }
        } else {
            await X.sendMessage(m.chat, { text: _part1 }, { quoted: m })
        }

        // Remaining parts
        for (let _pi = 1; _pi < _parts.length; _pi++) {
            const _isLast = _pi === _parts.length - 1
            await X.sendMessage(m.chat, {
                text: `🎵 *[Part ${_pi + 1}/${_parts.length}]*\n\n${_parts[_pi]}${_isLast ? '\n\n_─────────────────────────_\n_🤖 TOOSII-XD ULTRA_' : ''}`
            }, { quoted: m })
            await new Promise(r => setTimeout(r, 500))
        }
    }
} break
case 'owner':
case 'creator': {
    await X.sendMessage(m.chat, { react: { text: '👑', key: m.key } })
    await reply(`╔═════════╗
║   ⚡ *TOOSII-XD ULTRA*
║   _WhatsApp Multi-Device Bot_
╚═════════╝

  ├◈ 🧑‍💻 *Name*     › ${global.ownername || 'Toosii Tech'}
  ├◈ ✈️  *Telegram* › @toosiitech
  ├◈ 🤖 *Bot*      › ${global.botname} v${global.botver}
  └◈ 🔑 *Session*  › ${global.sessionUrl}

  📞 *Contact Numbers:*
  ├◈ +254748340864
  ├◈ +254746677793
  └◈ +254788781373

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
_👇 Tap a contact card below to reach the owner_`)
    const namaown = global.ownername || 'Toosii Tech'
    const ownerNumbers = ['254748340864', '254746677793', '254788781373']
    const contacts = generateWAMessageFromContent(m.chat, proto.Message.fromObject({
        contactsArrayMessage: {
            displayName: namaown,
            contacts: ownerNumbers.map(num => ({
                displayName: namaown,
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;;;;\nFN:${namaown}\nitem1.TEL;waid=${num}:+${num}\nitem1.X-ABLabel:WhatsApp\nX-WA-BIZ-NAME:${namaown}\nEND:VCARD`
            }))
        }
    }), { userJid: m.chat, quoted: m })
    await X.relayMessage(m.chat, contacts.message, { messageId: contacts.key.id })
}
break

case 'infobot':
case 'botinfo': {
    await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
  const botInfo = `╔═════════╗
║   ⚡ *TOOSII-XD ULTRA*
║   _WhatsApp Multi-Device Bot_
╚═════════╝

  ├◈ 📛 *Name*     › ${botname}
  ├◈ 👑 *Owner*    › ${ownername}
  ├◈ 🏷️  *Version*  › v${botver}
  ├◈ 📋 *Commands* › ${totalfitur()}
  ├◈ ⏱️  *Uptime*   › ${runtime(process.uptime())}
  ├◈ 🔒 *Mode*     › ${X.public ? 'Public' : 'Private'}
  ├◈ 🔤 *Prefix*   › ${global.botPrefix || 'Multi-prefix'}
  ├◈ 📞 *Contact*  › ${global.ownerNumber}
  ├◈ ✈️  *Telegram* › @toosiitech
  └◈ 🔑 *Session*  › ${global.sessionUrl}

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
_⚡ Powered by Toosii Tech — wa.me/254748340864_\``
  reply(botInfo)
}
break
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Sticker Features
case 'bratvid':
case 'bratv':
case 'bratvideo': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
  if (!text) return reply(`Example: ${prefix + command} hai bang`)
  if (text.length > 250) return reply(`Character limit exceeded, max 250!`)
  const words = text.split(" ")
  const tempDir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)
  const framePaths = []

  try {
    for (let i = 0; i < words.length; i++) {
      const currentText = words.slice(0, i + 1).join(" ")

      const res = await axios.get(
        `https://aqul-brat.hf.space/api/brat?text=${encodeURIComponent(currentText)}`,
        { responseType: "arraybuffer", timeout: 20000 }
      ).catch((e) => e.response)

      const framePath = path.join(tempDir, `frame${i}.mp4`)
      fs.writeFileSync(framePath, res.data)
      framePaths.push(framePath)
    }

    const fileListPath = path.join(tempDir, "filelist.txt")
    let fileListContent = ""

    for (let i = 0; i < framePaths.length; i++) {
      fileListContent += `file '${framePaths[i]}'\n`
      fileListContent += `duration 0.7\n`
    }

    fileListContent += `file '${framePaths[framePaths.length - 1]}'\n`
    fileListContent += `duration 2\n`

    fs.writeFileSync(fileListPath, fileListContent)
    const outputVideoPath = path.join(tempDir, "output.mp4")
    execSync(
      `ffmpeg -y -f concat -safe 0 -i ${fileListPath} -vf "fps=30" -c:v libx264 -preset ultrafast -pix_fmt yuv420p ${outputVideoPath}`
    )

    await X.sendImageAsStickerAV(m.chat, outputVideoPath, m, {
      packname: '',
      author: `${global.author}`
    })

    framePaths.forEach((frame) => {
      if (fs.existsSync(frame)) fs.unlinkSync(frame)
    })
    if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath)
    if (fs.existsSync(outputVideoPath)) fs.unlinkSync(outputVideoPath)
  } catch (err) {
    console.error(err)
    reply('An error occurred')
  }
}
break

case 'brat': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
if (!q) return reply(`Please enter text\n\nExample: ${prefix + command} alok hamil`);
let rulz = `https://aqul-brat.hf.space/api/brat?text=${encodeURIComponent(q)}`;
try {
const res = await axios.get(rulz, { responseType: 'arraybuffer' });
const buffer = Buffer.from(res.data, 'binary');
await X.sendImageAsStickerAV(m.chat, buffer, m, { packname: ``, author: `${global.author}` });
} catch (e) {
console.log(e);
await reply(`API is currently down or under maintenance. Please try again later.`);
    }
}
break

case 'emojimix': {
    await X.sendMessage(m.chat, { react: { text: '😎', key: m.key } })
    if (!text) return reply(`Enter two emojis to mix\n\nExample: ${prefix + command} [emoji1]+[emoji2]`);

    const emojis = text.split(/[\+\|]/);
    if (emojis.length !== 2) return reply('Please enter two valid emojis, example: +  or |');
    const text1 = emojis[0].trim();
    const text2 = emojis[1].trim();
 
    let api = `https://emojik.vercel.app/s/${encodeURIComponent(text1)}_${encodeURIComponent(text2)}?size=128`;
    await X.sendImageAsStickerAV(m.chat, api, m, { packname: '', author: `${packname}` });
}
break;
case 'qc': {
    await X.sendMessage(m.chat, { react: { text: '💬', key: m.key } })
    let text;

    if (args.length >= 1) {
        text = args.slice(0).join(" ");
    } else if (m.quoted && m.quoted.text) {
        text = m.quoted.text;
    } else {
        return reply("Enter text or reply to a message to make a quote!");
    }
    if (!text) return reply('Please enter text');
    if (text.length > 200) return reply('Maximum 200 characters!');
    let ppnyauser = await X.profilePictureUrl(m.sender, 'image').catch(_ => 'https://files.catbox.moe/nwvkbt.png');
    const rest = await quote(text, pushname, ppnyauser);
    X.sendImageAsStickerAV(m.chat, rest.result, m, {
        packname: ``,
        author: `${global.author}`
    });
}
break
case 'sticker':
case 'stiker':
case 's':{
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!quoted) return reply(`Reply to Video/Image with caption ${prefix + command}`)
if (/image/.test(mime)) {
let media = await quoted.download()
let encmedia = await X.sendImageAsStickerAV(m.chat, media, m, {
packname: global.packname,
author: global.author
})
} else if (/video/.test(mime)) {
if ((quoted.msg || quoted).seconds > 31) return reply('Maximum 30 seconds!')
let media = await quoted.download()
let encmedia = await X.sendVideoAsStickerAV(m.chat, media, m, {
packname: global.packname,
author: global.author
})
} else {
return reply(`Send an Image/Video with caption ${prefix + command}\nVideo duration: 1-9 seconds`)
}
}
break
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Take / Steal Sticker
case 'take':
case 'steal': {
    await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
    if (!quoted) return reply(`Reply to a *sticker* with *${prefix + command}* to re-send it with your pack info.\n\nUsage: *${prefix + command} [packname|author]*\nExample: *${prefix}take MyPack|MyName*`)
    if (mime !== 'image/webp') return reply(`Reply to a *sticker* to use *${prefix + command}*`)

    let _tkPack = global.packname || 'XD Ultra'
    let _tkAuth = global.author || 'Bot'

    if (text) {
        const _split = text.split('|')
        if (_split.length >= 2) {
            _tkPack = _split[0].trim()
            _tkAuth = _split[1].trim()
        } else {
            _tkPack = text.trim()
        }
    }

    try {
        const _tkMedia = await quoted.download()

        // Detect animated WebP by ANIM chunk presence (bytes 12-16)
        const _isAnimated = _tkMedia && _tkMedia.length > 16 && _tkMedia.toString('ascii', 12, 16) === 'ANIM'

        if (_isAnimated) {
            // Animated sticker — route through video pipeline
            await X.sendVideoAsStickerAV(m.chat, _tkMedia, m, {
                packname: _tkPack,
                author: _tkAuth
            })
        } else {
            // Static WebP sticker — inject EXIF metadata directly, skip ffmpeg entirely
            const _webp    = require('node-webpmux')
            const _Crypto  = require('crypto')
            const _os      = require('os')
            const _fs      = require('fs')
            const _path    = require('path')

            const _tmpIn  = _path.join(_os.tmpdir(), `tk_${_Crypto.randomBytes(4).toString('hex')}.webp`)
            const _tmpOut = _path.join(_os.tmpdir(), `tk_${_Crypto.randomBytes(4).toString('hex')}.webp`)
            _fs.writeFileSync(_tmpIn, _tkMedia)

            const _img = new _webp.Image()
            const _json = {
                'sticker-pack-id': 'TOOSII-XD-ULTRA',
                'sticker-pack-name': _tkPack,
                'sticker-pack-publisher': _tkAuth,
                'emojis': ['']
            }
            const _exifAttr = Buffer.from([0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00])
            const _jsonBuf  = Buffer.from(JSON.stringify(_json), 'utf-8')
            const _exif     = Buffer.concat([_exifAttr, _jsonBuf])
            _exif.writeUIntLE(_jsonBuf.length, 14, 4)
            await _img.load(_tmpIn)
            _img.exif = _exif
            await _img.save(_tmpOut)

            const _finalBuf = _fs.readFileSync(_tmpOut)
            try { _fs.unlinkSync(_tmpIn) } catch {}
            try { _fs.unlinkSync(_tmpOut) } catch {}

            await X.sendMessage(m.chat, { sticker: _finalBuf }, { quoted: m })
        }
    } catch (e) {
        console.error('Take sticker error:', e.message)
        reply('❌ Failed to steal sticker: ' + (e.message || 'Unknown error'))
    }
}
break
//━━━━━━━━━━━━━━━━━━━━━━━━//
// View Once Opener
case 'vv': {
    await X.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })
if (!m.quoted) return reply(`Reply to a *view once* image or video with *${prefix}vv* to open it`)
let quotedMsg = m.quoted
let quotedType = quotedMsg.mtype || ''
let viewOnceContent = null
if (quotedType === 'viewOnceMessage' || quotedType === 'viewOnceMessageV2' || quotedType === 'viewOnceMessageV2Extension') {
    let innerMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage
    if (innerMsg) {
        let voKey = innerMsg.viewOnceMessage || innerMsg.viewOnceMessageV2 || innerMsg.viewOnceMessageV2Extension
        if (voKey && voKey.message) {
            let innerType = Object.keys(voKey.message)[0]
            viewOnceContent = { type: innerType, msg: voKey.message[innerType] }
        }
    }
}
if (!viewOnceContent) {
    let rawQuoted = m.msg?.contextInfo?.quotedMessage
    if (rawQuoted) {
        for (let vk of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
            if (rawQuoted[vk] && rawQuoted[vk].message) {
                let innerType = Object.keys(rawQuoted[vk].message)[0]
                viewOnceContent = { type: innerType, msg: rawQuoted[vk].message[innerType] }
                break
            }
        }
    }
}
if (!viewOnceContent) {
    if (/image/.test(mime)) {
        viewOnceContent = { type: 'imageMessage', msg: quotedMsg.msg || quotedMsg }
    } else if (/video/.test(mime)) {
        viewOnceContent = { type: 'videoMessage', msg: quotedMsg.msg || quotedMsg }
    }
}
if (!viewOnceContent) return reply('This message is not a view once message. Reply to a view once image or video.')
try {
    let stream = await downloadContentFromMessage(viewOnceContent.msg, viewOnceContent.type.replace('Message', ''))
    let buffer = Buffer.from([])
    for await (let chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
    }
    if (viewOnceContent.type === 'imageMessage') {
        await X.sendMessage(from, { image: buffer, caption: viewOnceContent.msg.caption || '' }, { quoted: m })
    } else if (viewOnceContent.type === 'videoMessage') {
        await X.sendMessage(from, { video: buffer, caption: viewOnceContent.msg.caption || '' }, { quoted: m })
    } else if (viewOnceContent.type === 'audioMessage') {
        await X.sendMessage(from, { audio: buffer, mimetype: 'audio/mp4' }, { quoted: m })
    } else {
        reply('Unsupported view once media type.')
    }
} catch (err) {
    console.error('VV Error:', err)
    reply('Failed to open view once message: ' + (err.message || 'Unknown error'))
}
}
break

case 'autorecording':
case 'autorecord':
case 'fakerecording':
case 'fakerecord':
case 'frecord': {
    await X.sendMessage(m.chat, { react: { text: '🎙️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
if (global.fakePresence === 'recording') {
    global.fakePresence = 'off'
    reply('❌ *Auto Recording OFF*')
} else {
    global.fakePresence = 'recording'
    reply('✅ *Auto Recording ON* — bot appears as recording audio.')
}
}
break

case 'autotyping':
case 'faketyping':
case 'faketype':
case 'ftype': {
    await X.sendMessage(m.chat, { react: { text: '⌨️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
if (global.fakePresence === 'typing') {
    global.fakePresence = 'off'
    reply('❌ *Auto Typing OFF*')
} else {
    global.fakePresence = 'typing'
    reply('✅ *Auto Typing ON* — bot appears as typing.')
}
}
break

case 'autoonline':
case 'fakeonline':
case 'fonline': {
    await X.sendMessage(m.chat, { react: { text: '🟢', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
if (global.fakePresence === 'online') {
    global.fakePresence = 'off'
    reply('❌ *Auto Online OFF*')
} else {
    global.fakePresence = 'online'
    reply('✅ *Auto Online ON* — bot appears as online.')
}
}
break

case 'fakestatus':
case 'fpresence': {
    await X.sendMessage(m.chat, { react: { text: '👻', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let current = global.fakePresence || 'off'
reply(`╔═════════╗\n║  👻 *PRESENCE STATUS*\n╚═════════╝\n\n  ├ 📊 *Mode* › *${current}*\n\n  ├ ${prefix}autotyping    — toggle typing\n  ├ ${prefix}autorecording — toggle recording\n  └ ${prefix}autoonline    — toggle online\n\n  _Run again to turn off_`)
}
break

case 'autoviewstatus':
case 'autoview':
case 'avs': {
    await X.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let avsArg = (args[0] || '').toLowerCase()
if (avsArg === 'on' || avsArg === 'enable') {
    global.autoViewStatus = true
    try { if (typeof _savePhoneState === 'function') _savePhoneState(X.user?.id?.split(':')[0]?.split('@')[0] || '') } catch {}
    reply('*👀 Auto View Status: ✅ ON*\n\nBot will automatically view all contact statuses.')
} else if (avsArg === 'off' || avsArg === 'disable') {
    global.autoViewStatus = false
    try { if (typeof _savePhoneState === 'function') _savePhoneState(X.user?.id?.split(':')[0]?.split('@')[0] || '') } catch {}
    reply('*👀 Auto View Status: ❌ OFF*\n\nBot will no longer auto-view statuses.')
} else {
    if (global.autoViewStatus) {
        global.autoViewStatus = false
        try { if (typeof _savePhoneState === 'function') _savePhoneState(X.user?.id?.split(':')[0]?.split('@')[0] || '') } catch {}
        reply('*👀 Auto View Status: ❌ OFF*\n\nBot will no longer auto-view statuses.')
    } else {
        global.autoViewStatus = true
        try { if (typeof _savePhoneState === 'function') _savePhoneState(X.user?.id?.split(':')[0]?.split('@')[0] || '') } catch {}
        reply('*👀 Auto View Status: ✅ ON*\n\nBot will automatically view all contact statuses.')
    }
}
}
break

case 'autolikestatus':
case 'autolike':
case 'als':
case 'sr':
case 'reactstatus':
case 'statusreact': {
    await X.sendMessage(m.chat, { react: { text: '❤️', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)

    // Init global react manager state
    if (!global.arManager) global.arManager = {
        enabled: false,
        viewMode: 'view+react',   // 'view+react' | 'react-only'
        mode: 'fixed',            // 'fixed' | 'random'
        fixedEmoji: '❤️',
        reactions: ['❤️','🔥','👍','😂','😮','👏','🎉','🎯','💯','🌟','✨','⚡','💥','🫶','🐺'],
        totalReacted: 0,
        reactedIds: [],           // dedupe by status id
        lastReactionTime: 0,
        rateLimitDelay: 2000,
    }
    const _ar = global.arManager
    const _arAction = (args[0] || '').toLowerCase().trim()
    const _arVal = (args[1] || '').trim()

    // Helper: status line
    const _arStatus = () => {
        const _vm = _ar.viewMode === 'view+react' ? '👁️ + react' : 'react only'
        const _em = _ar.mode === 'fixed' ? _ar.fixedEmoji : '🎲 random'
        return `╔═════════╗\n║  ❤️  *AUTO REACT STATUS*\n╚═════════╝\n\n  ├ 📊 *Status*    › ${_ar.enabled ? '✅ ON' : '❌ OFF'}\n  ├ 👁️  *View Mode* › ${_vm}\n  ├ 🎭 *Emoji*     › ${_em}\n  ├ 📈 *Reacted*   › ${_ar.totalReacted} statuses\n  └ 🎨 *Pool*      › ${_ar.reactions.join(' ')}\n\n  *Commands:*\n  ├ ${prefix}als on / off\n  ├ ${prefix}als view+react / react-only\n  ├ ${prefix}als fixed / random\n  ├ ${prefix}als emoji [emoji]\n  ├ ${prefix}als add [emoji] / remove [emoji]\n  ├ ${prefix}als reset\n  └ ${prefix}als stats`
    }

    if (!_arAction || _arAction === 'status') return reply(_arStatus())

    if (_arAction === 'on' || _arAction === 'enable') {
        _ar.enabled = true
        global.autoLikeStatus = true
        global.autoViewStatus = _ar.viewMode === 'view+react'
        // sync emoji so index.js auto-like handler actually fires
        global.autoLikeEmoji = _ar.mode === 'random'
            ? (_ar.reactions[Math.floor(Math.random() * _ar.reactions.length)] || '❤️')
            : (_ar.fixedEmoji || '❤️')
        try { if (typeof _savePhoneState === 'function') _savePhoneState(X.user?.id?.split(':')[0]?.split('@')[0] || '') } catch {}
        return reply(`✅ *Auto React ON*\n└ Mode: ${_ar.viewMode} · ${_ar.mode === 'fixed' ? _ar.fixedEmoji : '🎲 random'}`)
    }

    if (_arAction === 'off' || _arAction === 'disable') {
        _ar.enabled = false
        global.autoLikeStatus = false
        try { if (typeof _savePhoneState === 'function') _savePhoneState(X.user?.id?.split(':')[0]?.split('@')[0] || '') } catch {}
        return reply(`❌ *Auto React OFF*`)
    }

    if (_arAction === 'view+react' || _arAction === 'viewreact') {
        _ar.viewMode = 'view+react'
        global.autoViewStatus = true
        return reply(`👁️ *View + React mode* — bot marks status as viewed then reacts.`)
    }

    if (_arAction === 'react-only' || _arAction === 'reactonly') {
        _ar.viewMode = 'react-only'
        global.autoViewStatus = false   // stop marking statuses as viewed
        return reply(`🎭 *React-only mode* — reacts without marking as viewed.`)
    }

    if (_arAction === 'fixed') {
        _ar.mode = 'fixed'
        return reply(`📌 *Fixed mode* — always reacts with ${_ar.fixedEmoji}`)
    }

    if (_arAction === 'random') {
        _ar.mode = 'random'
        return reply(`🎲 *Random mode* — picks random emoji from pool:\n${_ar.reactions.join(' ')}`)
    }

    if (_arAction === 'emoji') {
        if (!_arVal) return reply(`❌ Usage: *${prefix}als emoji ❤️*`)
        _ar.fixedEmoji = _arVal
        _ar.mode = 'fixed'
        global.autoLikeEmoji = _arVal
        return reply(`✅ Emoji set to *${_arVal}* (fixed mode)`)
    }

    if (_arAction === 'add') {
        if (!_arVal) return reply(`❌ Usage: *${prefix}als add 🔥*`)
        if (_ar.reactions.includes(_arVal)) return reply(`⚠️ *${_arVal}* already in pool.`)
        _ar.reactions.push(_arVal)
        return reply(`✅ *${_arVal}* added.\n\n${_ar.reactions.join(' ')}`)
    }

    if (_arAction === 'remove') {
        if (!_arVal) return reply(`❌ Usage: *${prefix}als remove 🔥*`)
        const _ri = _ar.reactions.indexOf(_arVal)
        if (_ri === -1) return reply(`❌ *${_arVal}* not in pool.`)
        _ar.reactions.splice(_ri, 1)
        return reply(`✅ *${_arVal}* removed.\n\n${_ar.reactions.join(' ')}`)
    }

    if (_arAction === 'reset') {
        _ar.reactions = ['❤️','🔥','👍','😂','😮','👏','🎉','🎯','💯','🌟','✨','⚡','💥','🫶','🐺']
        _ar.totalReacted = 0
        _ar.reactedIds = []
        return reply(`🔄 *Reset* — emoji pool restored, stats cleared.`)
    }

    if (_arAction === 'stats') {
        return reply(`╔═════════╗\n║  📊 *REACT STATS*\n╚═════════╝\n\n  ├ 📈 *Total reacted* › ${_ar.totalReacted}\n  ├ 🗂️  *Tracked IDs*   › ${_ar.reactedIds.length}\n  ├ 🎭 *Mode*          › ${_ar.mode}\n  ├ 👁️  *View Mode*     › ${_ar.viewMode}\n  └ 🎨 *Emoji pool*    › ${_ar.reactions.join(' ')}`)
    }

    if (_arAction === 'list' || _arAction === 'emojis') {
        return reply(`🎨 *Emoji Pool (${_ar.reactions.length}):*\n\n${_ar.reactions.join(' ')}\n\n├ Fixed: ${_ar.fixedEmoji}\n└ Mode: ${_ar.mode}`)
    }

    if (_arAction === 'post' || _arAction === 'send' || _arAction === 'status') {
        // .als post [text] — post text/image directly to WhatsApp status
        const _postText = args.slice(1).join(' ').trim() || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
        const _jidList = Object.keys(store?.contacts || {}).filter(j => j.endsWith('@s.whatsapp.net'))
        if (!_jidList.length) _jidList.push(X.decodeJid(X.user.id).replace(/:.*@/,'@'))

        // check if replying to media
        if (m.quoted && m.quoted.message) {
            const _qm = m.quoted.message
            const _qt = Object.keys(_qm)[0]
            if (_qt === 'imageMessage') {
                const _stream = await downloadContentFromMessage(_qm.imageMessage, 'image')
                let _chunks = []; for await (const c of _stream) _chunks.push(c)
                const _buf = Buffer.concat(_chunks)
                await X.sendMessage('status@broadcast', { image: _buf, caption: _postText }, { statusJidList: _jidList })
                return reply(`✅ *Image posted to status!*\n└ Visible to ${_jidList.length} contact(s)`)
            } else if (_qt === 'videoMessage') {
                const _stream = await downloadContentFromMessage(_qm.videoMessage, 'video')
                let _chunks = []; for await (const c of _stream) _chunks.push(c)
                const _buf = Buffer.concat(_chunks)
                await X.sendMessage('status@broadcast', { video: _buf, caption: _postText, mimetype: 'video/mp4' }, { statusJidList: _jidList })
                return reply(`✅ *Video posted to status!*\n└ Visible to ${_jidList.length} contact(s)`)
            }
        }
        if (!_postText) return reply(`❌ Usage:\n• *${prefix}als post [text]* — post text to status\n• Reply to an image/video with *${prefix}als post* — post that media to status`)
        await X.sendMessage('status@broadcast', { text: _postText }, { statusJidList: _jidList })
        return reply(`✅ *Posted to status!*\n└ Visible to ${_jidList.length} contact(s)`)
    }

    reply(_arStatus())
}
break

case 'poststatus':
case 'sendstatus':
case 'sts': {
    await X.sendMessage(m.chat, { react: { text: '📤', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
try {
    const _jidList = Object.keys(store?.contacts || {}).filter(j => j.endsWith('@s.whatsapp.net'))
    const _botJid = (X.decodeJid ? X.decodeJid(X.user.id) : X.user.id).replace(/:.*@/,'@')
    if (!_jidList.includes(_botJid)) _jidList.push(_botJid)
    const _caption = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''

    if (m.quoted && m.quoted.message) {
        const _qm = m.quoted.message
        const _qt = Object.keys(_qm)[0]
        if (_qt === 'imageMessage') {
            const _stream = await downloadContentFromMessage(_qm.imageMessage, 'image')
            let _chunks = []; for await (const c of _stream) _chunks.push(c)
            await X.sendMessage('status@broadcast', { image: Buffer.concat(_chunks), caption: _caption }, { statusJidList: _jidList })
            return reply(`✅ *Image posted to your status!*\n└ Shown to ${_jidList.length} contact(s)`)
        } else if (_qt === 'videoMessage') {
            const _stream = await downloadContentFromMessage(_qm.videoMessage, 'video')
            let _chunks = []; for await (const c of _stream) _chunks.push(c)
            await X.sendMessage('status@broadcast', { video: Buffer.concat(_chunks), caption: _caption, mimetype: 'video/mp4' }, { statusJidList: _jidList })
            return reply(`✅ *Video posted to your status!*\n└ Shown to ${_jidList.length} contact(s)`)
        } else if (_qt === 'stickerMessage') {
            const _stream = await downloadContentFromMessage(_qm.stickerMessage, 'sticker')
            let _chunks = []; for await (const c of _stream) _chunks.push(c)
            await X.sendMessage('status@broadcast', { image: Buffer.concat(_chunks) }, { statusJidList: _jidList })
            return reply(`✅ *Sticker posted as status!*\n└ Shown to ${_jidList.length} contact(s)`)
        }
    }
    if (!_caption) return reply(
        `╔═════════╗\n║  📤 *POST TO STATUS*\n╚═════════╝\n\n` +
        `  *Text:*  ${prefix}poststatus [your text]\n` +
        `  *Image:* reply to an image with ${prefix}poststatus\n` +
        `  *Video:* reply to a video with ${prefix}poststatus\n` +
        `  *Short:* ${prefix}sts [text]\n\n` +
        `  └ Also: ${prefix}als post [text]`
    )
    await X.sendMessage('status@broadcast', { text: _caption }, { statusJidList: _jidList })
    reply(`✅ *Posted to your status!*\n└ Shown to ${_jidList.length} contact(s)`)
} catch(e) { reply('❌ Failed to post status: ' + e.message) }
}
break

case 'statusconfig':
case 'autostatus': {
    await X.sendMessage(m.chat, { react: { text: '⚙️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let viewState = global.autoViewStatus ? '✅ ON' : '❌ OFF'
let likeState = (global.autoLikeStatus && global.autoLikeEmoji) ? `✅ ON (${global.autoLikeEmoji})` : '❌ OFF'
let replyState = global.autoReplyStatus ? `✅ ON ("${global.autoReplyStatusMsg}")` : '❌ OFF'
let fwdState = global.statusToGroup ? '✅ ON' : '❌ OFF'
let fwdGroup = global.statusToGroup ? global.statusToGroup : 'Not set'
let asmState = global.antiStatusMention ? `✅ ON (${(global.antiStatusMentionAction||'warn').toUpperCase()})` : '❌ OFF'
reply(`╔═════════╗
║  📊 *STATUS TOOLS CONFIG*
╚═════════╝

  ├◈ 👀 *Auto View*    › ${viewState}
  ├◈ ❤️  *Auto Like*    › ${likeState}
  ├◈ 💬 *Auto Reply*   › ${replyState}
  ├◈ 📤 *Forward*      › ${fwdState}
  └◈ 🛡️  *Anti-Mention* › ${asmState}

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  ⚙️  *Commands*
  ├◈ ${prefix}autoviewstatus
  ├◈ ${prefix}autolikestatus [emoji/off]
  ├◈ ${prefix}autoreplystatus [msg/off]
  ├◈ ${prefix}togroupstatus on/off
  └◈ ${prefix}antistatusmention [on/warn/kick/del]`)
}
break

case 'togroupstatus':
case 'statustogroup':
case 'fwdstatus': {
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
// ── Two modes ─────────────────────────────────────────────────────────────────
// 1. Used inside a group with media/text → posts it as a status visible to group members
// 2. Used with 'on'/'off' arg → enables/disables AUTO-FORWARD of incoming statuses to this group
if (!isOwner) return reply(mess.OnlyOwner)

let _tgsArg = (args[0] || '').toLowerCase()

// Mode 2: toggle auto-forward
if (_tgsArg === 'on' || _tgsArg === 'enable') {
    if (!m.isGroup) return reply(`❌ Use *${prefix}togroupstatus on* inside the group you want statuses forwarded to.`)
    global.statusToGroup = from
    reply(`✅ *Status Auto-Forward: ON*

All incoming statuses will be forwarded to:
*${groupName || from}*

Use *${prefix}togroupstatus off* to disable.`)
} else if (_tgsArg === 'off' || _tgsArg === 'disable') {
    global.statusToGroup = ''
    reply('❌ *Status Auto-Forward: OFF*\n\nStatuses will no longer be forwarded to any group.')
} else if (_tgsArg === 'status') {
    let fwdGroup = global.statusToGroup
    if (fwdGroup) {
        let fwdMeta = await X.groupMetadata(fwdGroup).catch(() => null)
        reply(`📊 *Status Auto-Forward: ✅ ON*

Forwarding to: *${fwdMeta?.subject || fwdGroup}*

Use *${prefix}togroupstatus off* to disable.`)
    } else {
        reply(`📊 *Status Auto-Forward: ❌ OFF*

Use *${prefix}togroupstatus on* inside a group to enable.`)
    }
} else {
    // Mode 1: post quoted media/text as status visible to group members
    if (!m.isGroup) return reply(`╔═════════╗\n║  📤 *STATUS TOOLS*\n╚═════════╝\n\n  *Post to group status:*\n  ├ Reply to media/text with *${prefix}togroupstatus*\n  └ Or: *${prefix}togroupstatus [text]*\n\n  *Auto-forward:*\n  ├ *${prefix}togroupstatus on*  — enable in group\n  ├ *${prefix}togroupstatus off* — disable\n  └ *${prefix}togroupstatus status* — check setting`)
    try {
        // Helper: download quoted media using downloadContentFromMessage
        const _dlQuoted = async (type) => {
            const ctxInfo = m.msg?.contextInfo
            const qMsg = ctxInfo?.quotedMessage
            if (!qMsg) throw new Error('No quoted message')
            const mediaMsg = qMsg[`${type}Message`] || qMsg
            const stream = await downloadContentFromMessage(mediaMsg, type)
            const chunks = []
            for await (const chunk of stream) chunks.push(chunk)
            return Buffer.concat(chunks)
        }

        // Helper: post via groupStatusMessageV2 (posts to group status, visible to all members)
        const _postGroupStatus = async (content) => {
            const crypto = require('crypto')
            const { backgroundColor } = content
            delete content.backgroundColor
            const inside = await generateWAMessageContent(content, {
                upload: X.waUploadToServer,
                backgroundColor: backgroundColor || '#9C27B0',
            })
            const secret = crypto.randomBytes(32)
            const built = generateWAMessageFromContent(
                from,
                {
                    messageContextInfo: { messageSecret: secret },
                    groupStatusMessageV2: {
                        message: {
                            ...inside,
                            messageContextInfo: { messageSecret: secret },
                        },
                    },
                },
                {}
            )
            await X.relayMessage(from, built.message, { messageId: built.key.id })
        }

        if (m.quoted) {
            const ctxInfo = m.msg?.contextInfo
            const qMsg = ctxInfo?.quotedMessage
            const qType = qMsg ? Object.keys(qMsg)[0] : (m.quoted.mtype || '')

            if (/image|sticker/i.test(qType)) {
                const mediaType = /sticker/i.test(qType) ? 'sticker' : 'image'
                const buf = await _dlQuoted(mediaType)
                const cap = m.quoted.text || m.quoted.caption || ''
                await _postGroupStatus({ image: buf, caption: cap })
                reply(`✅ *Image posted to group status!*`)
            } else if (/video/i.test(qType)) {
                const buf = await _dlQuoted('video')
                const cap = m.quoted.text || m.quoted.caption || ''
                await _postGroupStatus({ video: buf, caption: cap })
                reply(`✅ *Video posted to group status!*`)
            } else if (/audio/i.test(qType)) {
                const buf = await _dlQuoted('audio')
                await _postGroupStatus({ audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true })
                reply(`✅ *Audio posted to group status!*`)
            } else {
                const quotedText = m.quoted.text || m.quoted.body || m.quoted.caption
                    || m.quoted.conversation || m.quoted.title || m.quoted.description || ''
                if (quotedText.trim()) {
                    await _postGroupStatus({ text: quotedText, backgroundColor: '#9C27B0' })
                    reply(`✅ *Text posted to group status!*`)
                } else {
                    reply(`❌ Unsupported type. Reply to an image, video, audio, or text message.`)
                }
            }
        } else if (text) {
            await _postGroupStatus({ text: text, backgroundColor: '#9C27B0' })
            reply(`✅ *Text posted to group status!*`)
        } else {
            reply(`╔═════════╗\n║  📤 *GROUP STATUS POSTER*\n╚═════════╝\n\n  ├ Reply to media with *${prefix}togroupstatus*\n  ├ Or: *${prefix}togroupstatus [text]*\n  └ Auto-forward: *${prefix}togroupstatus on*`)
        }
    } catch(e) {
        reply(`❌ Failed to post group status: ${e.message}`)
    }
}
}
break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Post to bot's own WhatsApp status
case 'tostatus':
case 'poststatus':
case 'mystatus': {
    try {
        if (m.quoted) {
            const ctxInfo = m.msg?.contextInfo
            const qMsg = ctxInfo?.quotedMessage
            const qType = qMsg ? Object.keys(qMsg)[0] : (m.quoted.mtype || '')

            const _dlTS = async (type) => {
                const mediaMsg = (qMsg || {})[`${type}Message`] || qMsg
                const stream = await downloadContentFromMessage(mediaMsg, type)
                const chunks = []
                for await (const chunk of stream) chunks.push(chunk)
                return Buffer.concat(chunks)
            }

            if (/image|sticker/i.test(qType)) {
                const mediaType = /sticker/i.test(qType) ? 'sticker' : 'image'
                const buf = await _dlTS(mediaType)
                const cap = m.quoted.text || m.quoted.caption || ''
                await X.sendMessage('status@broadcast', { image: buf, caption: cap })
                reply(`✅ *Image posted to your status!*`)
            } else if (/video/i.test(qType)) {
                const buf = await _dlTS('video')
                const cap = m.quoted.text || m.quoted.caption || ''
                await X.sendMessage('status@broadcast', { video: buf, caption: cap, gifPlayback: false })
                reply(`✅ *Video posted to your status!*`)
            } else if (/audio/i.test(qType)) {
                const buf = await _dlTS('audio')
                await X.sendMessage('status@broadcast', { audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true })
                reply(`✅ *Audio posted to your status!*`)
            } else {
                const quotedText = m.quoted.text || m.quoted.body || m.quoted.caption
                    || m.quoted.conversation || m.quoted.title || m.quoted.description || ''
                if (quotedText.trim()) {
                    await X.sendMessage('status@broadcast', { text: quotedText, backgroundColor: '#075E54', font: 4 })
                    reply(`✅ *Text posted to your status!*`)
                } else {
                    reply(`❌ Unsupported type. Reply to an image, video, audio, or text message.`)
                }
            }
        } else if (text) {
            await X.sendMessage('status@broadcast', { text: text, backgroundColor: '#075E54', font: 4 })
            reply(`✅ *Text posted to your status!*`)
        } else {
            reply(`╔═════════╗\n║  📤 *STATUS POSTER*\n╚═════════╝\n\n  ├ Reply to media with *${prefix}tostatus*\n  └ Or: *${prefix}tostatus [text]*`)
        }
    } catch(e) {
        reply(`❌ Failed to post status: ${e.message}`)
    }
}
break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Developer tools
case 'self':
case 'private': {
    await X.sendMessage(m.chat, { react: { text: '🔒', key: m.key } })
if (!isDeployedNumber) return reply(mess.OnlyOwner)
X.public = false
reply(`╔═════════╗\n║  🔒 *BOT MODE: PRIVATE*\n╚═════════╝\n\n  ✅ *Enabled*\n  └ Only *${botClean}* can use commands.\n  └ All other users are blocked.`)
}
break

case 'public': {
    await X.sendMessage(m.chat, { react: { text: '🔓', key: m.key } })
if (!isDeployedNumber) return reply(mess.OnlyOwner)
X.public = true
reply(`╔═════════╗\n║  🌐 *BOT MODE: PUBLIC*\n╚═════════╝\n\n  ✅ *Enabled*\n  └ All users can use bot commands.\n  └ Owner-only commands still restricted.`)
}
break

case 'join': {
    await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
if (!q) return reply(`*Usage:* ${prefix}join [group invite link]\n\n*Example:*\n${prefix}join https://chat.whatsapp.com/AbCdEfGhIjK`)
let linkMatch = q.match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/)
if (!linkMatch) return reply('Invalid group invite link. Please send a valid WhatsApp group link.')
try {
    let joinResult = await X.groupAcceptInvite(linkMatch[1])
    reply(`✅ *Joined group!*\n  └ ID: ${joinResult}`)
} catch (e) {
    let errMsg = (e.message || '').toLowerCase()
    if (errMsg.includes('conflict')) {
        reply('The bot is already a member of that group.')
    } else if (errMsg.includes('gone') || errMsg.includes('not-authorized')) {
        reply('This invite link is invalid or has been revoked.')
    } else if (errMsg.includes('forbidden')) {
        reply('The bot has been blocked from joining this group.')
    } else {
        reply(`Failed to join group: ${e.message || 'Unknown error'}`)
    }
}
}
break

case 'prefix': {
    await X.sendMessage(m.chat, { react: { text: '⚙️', key: m.key } })
let currentPfx = global.botPrefix || '.'
reply(`╔═════════╗\n║  ⚙️  *PREFIX*\n╚═════════╝\n\n  └ 🔤 *Current prefix* › *${currentPfx}*\n\n_Use ${currentPfx}setprefix [char] to change_`)
}
break

case 'save': {
    await X.sendMessage(m.chat, { react: { text: '💾', key: m.key } })
if (!m.quoted) return reply(`Reply to a message/media with ${prefix}save to save it to your DM`)
try {
let savedMsg = {}
if (/image/.test(m.quoted.mimetype || '')) {
    let media = await m.quoted.download()
    savedMsg = { image: media, caption: m.quoted.text || '' }
} else if (/video/.test(m.quoted.mimetype || '')) {
    let media = await m.quoted.download()
    savedMsg = { video: media, caption: m.quoted.text || '', mimetype: 'video/mp4' }
} else if (/audio/.test(m.quoted.mimetype || '')) {
    let media = await m.quoted.download()
    savedMsg = { audio: media, mimetype: 'audio/mpeg' }
} else if (/sticker/.test(m.quoted.mtype || '')) {
    let media = await m.quoted.download()
    savedMsg = { sticker: media }
} else if (m.quoted.text) {
    savedMsg = { text: m.quoted.text }
} else {
    return reply('Unsupported media type.')
}
await X.sendMessage(sender, savedMsg)
} catch (e) { reply('Failed to save: ' + e.message) }
}
break

case 'setprefix': {
    await X.sendMessage(m.chat, { react: { text: '⚙️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newPrefix = (args[0] || '').trim()
if (!newPrefix) {
    let currentPfx = global.botPrefix || '.'
    reply(`╔═════════╗\n║  ⌨️  *SET PREFIX*\n╚═════════╝\n\n  ├ 📌 *Current* › *${currentPfx}*\n  ├ ${prefix}setprefix [char] — set new\n  └ ${prefix}setprefix reset  — restore (.)\n\n  _Examples: . / # !_`)
} else if (newPrefix.toLowerCase() === 'reset' || newPrefix.toLowerCase() === 'default') {
    global.botPrefix = '.'
    reply(`*Prefix Reset* ✅\nBot prefix restored to default: *.*`)
} else {
    global.botPrefix = newPrefix.charAt(0)
    reply(`*Prefix Changed* ✅\nBot prefix is now: *${global.botPrefix}*\n\nExample: *${global.botPrefix}menu*, *${global.botPrefix}help*`)
}
}
break

// Bot Configuration Commands
case 'botname': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newName = args.join(' ').trim()
if (!newName) return reply(`*Current Bot Name:* ${global.botname}\n\nUsage: ${prefix}botname [new name]`)
global.botname = newName
reply(`✅ *Bot name updated* › *${newName}*`)
}
break

case 'setauthor':
case 'author': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newAuthor = args.join(' ').trim()
if (!newAuthor) return reply(`*Current Sticker Author:* ${global.author}\n\nUsage: ${prefix}author [name]`)
global.author = newAuthor
reply(`✅ *Sticker author updated* › *${newAuthor}*`)
}
break

case 'setpackname':
case 'packname': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newPack = args.join(' ').trim()
if (!newPack) return reply(`*Current Sticker Pack:* ${global.packname}\n\nUsage: ${prefix}packname [name]`)
global.packname = newPack
reply(`✅ *Sticker pack updated* › *${newPack}*`)
}
break

case 'timezone':
case 'settz': {
    await X.sendMessage(m.chat, { react: { text: '🕐', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _allZones = moment.tz.names()
    let _tzArg = args.join(' ').trim()

    // Alias map — country/city names → correct IANA timezone
    const _tzAliases = {
        'africa/nigeria': 'Africa/Lagos', 'africa/abuja': 'Africa/Lagos', 'africa/lagos': 'Africa/Lagos',
        'africa/ghana': 'Africa/Accra', 'africa/accra': 'Africa/Accra',
        'africa/cameroon': 'Africa/Douala', 'africa/douala': 'Africa/Douala',
        'africa/kenya': 'Africa/Nairobi', 'africa/nairobi': 'Africa/Nairobi',
        'africa/uganda': 'Africa/Kampala', 'africa/kampala': 'Africa/Kampala',
        'africa/tanzania': 'Africa/Dar_es_Salaam', 'africa/ethiopia': 'Africa/Addis_Ababa',
        'africa/egypt': 'Africa/Cairo', 'africa/cairo': 'Africa/Cairo',
        'africa/morocco': 'Africa/Casablanca', 'africa/casablanca': 'Africa/Casablanca',
        'africa/sudan': 'Africa/Khartoum', 'africa/zimbabwe': 'Africa/Harare',
        'africa/zambia': 'Africa/Lusaka', 'africa/angola': 'Africa/Luanda',
        'africa/mozambique': 'Africa/Maputo', 'africa/rwanda': 'Africa/Kigali',
        'africa/burundi': 'Africa/Bujumbura', 'africa/senegal': 'Africa/Dakar',
        'africa/congo': 'Africa/Brazzaville', 'africa/drc': 'Africa/Kinshasa',
        'africa/somalia': 'Africa/Mogadishu', 'africa/liberia': 'Africa/Monrovia',
        'africa/ivory_coast': 'Africa/Abidjan', 'africa/cote_divoire': 'Africa/Abidjan',
        'africa/mali': 'Africa/Bamako', 'africa/guinea': 'Africa/Conakry',
        'africa/niger': 'Africa/Niamey', 'africa/chad': 'Africa/Ndjamena',
        'africa/madagascar': 'Indian/Antananarivo', 'africa/mauritius': 'Indian/Mauritius',
        'europe/uk': 'Europe/London', 'europe/england': 'Europe/London',
        'europe/scotland': 'Europe/London', 'europe/wales': 'Europe/London',
        'europe/ireland': 'Europe/Dublin', 'europe/holland': 'Europe/Amsterdam',
        'europe/netherlands': 'Europe/Amsterdam',
        'america/usa': 'America/New_York', 'america/uk': 'Europe/London',
        'america/brazil': 'America/Sao_Paulo', 'america/canada': 'America/Toronto',
        'america/mexico': 'America/Mexico_City', 'america/colombia': 'America/Bogota',
        'america/venezuela': 'America/Caracas', 'america/argentina': 'America/Argentina/Buenos_Aires',
        'america/chile': 'America/Santiago', 'america/peru': 'America/Lima',
        'asia/india': 'Asia/Kolkata', 'asia/pakistan': 'Asia/Karachi',
        'asia/bangladesh': 'Asia/Dhaka', 'asia/china': 'Asia/Shanghai',
        'asia/japan': 'Asia/Tokyo', 'asia/korea': 'Asia/Seoul',
        'asia/indonesia': 'Asia/Jakarta', 'asia/thailand': 'Asia/Bangkok',
        'asia/vietnam': 'Asia/Ho_Chi_Minh', 'asia/malaysia': 'Asia/Kuala_Lumpur',
        'asia/philippines': 'Asia/Manila', 'asia/singapore': 'Asia/Singapore',
        'asia/uae': 'Asia/Dubai', 'asia/dubai': 'Asia/Dubai',
        'asia/saudi': 'Asia/Riyadh', 'asia/saudi_arabia': 'Asia/Riyadh',
        'asia/qatar': 'Asia/Qatar', 'asia/kuwait': 'Asia/Kuwait',
        'asia/israel': 'Asia/Jerusalem', 'asia/turkey': 'Europe/Istanbul',
        'australia/sydney': 'Australia/Sydney', 'australia/melbourne': 'Australia/Melbourne',
        'australia/perth': 'Australia/Perth', 'australia/brisbane': 'Australia/Brisbane',
    }

    // No arg — show current timezone + time
    if (!_tzArg) {
        const _cur = global.botTimezone || 'Africa/Nairobi'
        const _now = moment().tz(_cur)
        return reply(
            `╔═════════╗\n` +
            `║  🕐 *TIMEZONE*\n` +
            `╚═════════╝\n\n` +
            `  ├ 🌍 *Current* › ${_cur}\n` +
            `  ├ 🕐 *Time*    › ${_now.format('HH:mm:ss')}\n` +
            `  ├ 📅 *Date*    › ${_now.format('DD/MM/YYYY')}\n` +
            `  └ ⏰ *Offset*  › UTC${_now.format('Z')}\n\n` +
            `  📌 *Usage:*\n` +
            `  ${prefix}timezone Africa/Lagos\n` +
            `  ${prefix}timezone Asia/Dubai\n` +
            `  ${prefix}timezone America/New_York\n\n` +
            `  🔍 *Search:* ${prefix}timezone Africa`
        )
    }

    // Alias lookup — resolve common country/city names
    const _aliasKey = _tzArg.toLowerCase().replace(/\s+/g, '_')
    const _aliasMatch = _tzAliases[_aliasKey]
    if (_aliasMatch) {
        global.botTimezone = _aliasMatch
        const _now = moment().tz(_aliasMatch)
        return reply(
            `╔═════════╗\n` +
            `║  🕐 *TIMEZONE*\n` +
            `╚═════════╝\n\n` +
            `  ✅ *Updated!*\n\n` +
            `  ├ 🌍 *Timezone* › ${_aliasMatch}\n` +
            `  ├ 🕐 *Time*     › ${_now.format('HH:mm:ss')}\n` +
            `  ├ 📅 *Date*     › ${_now.format('DD/MM/YYYY')}\n` +
            `  └ ⏰ *Offset*   › UTC${_now.format('Z')}`
        )
    }

    // Exact IANA match — set it
    if (moment.tz.zone(_tzArg)) {
        global.botTimezone = _tzArg
        const _now = moment().tz(_tzArg)
        return reply(
            `╔═════════╗\n` +
            `║  🕐 *TIMEZONE*\n` +
            `╚═════════╝\n\n` +
            `  ✅ *Updated!*\n\n` +
            `  ├ 🌍 *Timezone* › ${_tzArg}\n` +
            `  ├ 🕐 *Time*     › ${_now.format('HH:mm:ss')}\n` +
            `  ├ 📅 *Date*     › ${_now.format('DD/MM/YYYY')}\n` +
            `  └ ⏰ *Offset*   › UTC${_now.format('Z')}`
        )
    }

    // Partial search in IANA list
    const _query = _tzArg.toLowerCase()
    const _matches = _allZones.filter(z => z.toLowerCase().includes(_query)).slice(0, 20)
    if (_matches.length) {
        return reply(
            `╔═════════╗\n` +
            `║  🕐 *TIMEZONE*\n` +
            `╚═════════╝\n\n` +
            `  ❌ *"${_tzArg}"* not found.\n` +
            `  Did you mean one of these?\n\n` +
            _matches.map((z, i) => {
                const _t = moment().tz(z).format('HH:mm')
                return `  ${i+1}. ${z} (🕐 ${_t})`
            }).join('\n') +
            (_allZones.filter(z => z.toLowerCase().includes(_query)).length > 20
                ? `\n  ... and more. Be more specific.` : ``) +
            `\n\n  📌 Copy a timezone above and run:\n  ${prefix}timezone <timezone>`
        )
    }

    // Nothing found — suggest searching by continent
    const _continent = _tzArg.split('/')[0] || ''
    const _contSearch = _allZones.filter(z => z.toLowerCase().startsWith(_continent.toLowerCase())).slice(0, 10)
    reply(
        `╔═════════╗\n` +
        `║  🕐 *TIMEZONE*\n` +
        `╚═════════╝\n\n` +
        `  ❌ *"${_tzArg}"* is not a valid timezone.\n\n` +
        (_contSearch.length ? `  *${_continent} timezones:*\n` + _contSearch.map(z => `  • ${z}`).join('\n') + '\n\n' : '') +
        `  🔍 Search: ${prefix}timezone ${_continent || 'Africa'}\n` +
        `  📌 Example: ${prefix}timezone Africa/Lagos`
    )
}
break

case 'botpic':
case 'setbotpic': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let picUrl = args.join(' ').trim()
if (m.quoted && m.quoted.mtype === 'imageMessage') {
    try {
        let media = await X.downloadAndSaveMediaMessage(m.quoted, 'botpic')
        await X.updateProfilePicture(X.user.id, { url: media })
        fs.unlinkSync(media)
        reply('*Bot Profile Picture Updated*')
    } catch (e) {
        reply('*Failed to update profile picture.* Make sure you reply to an image.')
    }
} else if (picUrl) {
    global.botPic = picUrl
    global.thumb = picUrl
    reply(`✅ *Bot thumbnail updated*`)
} else {
    reply(`*Bot Picture*\nCurrent thumbnail: ${global.thumb}\n\nUsage:\n${prefix}botpic [url] - Set thumbnail URL\nReply to an image with ${prefix}botpic - Set WhatsApp profile picture`)
}
}
break

case 'boturl':
case 'setboturl': {
    await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newUrl = args.join(' ').trim()
if (!newUrl) return reply(`*Current Bot URL:* ${global.botUrl || global.wagc}\n\nUsage: ${prefix}boturl [url]`)
global.botUrl = newUrl
global.wagc = newUrl
reply(`✅ *Bot URL updated* › *${newUrl}*`)
}
break

case 'anticall':
case 'setanticall': {
    await X.sendMessage(m.chat, { react: { text: '📵', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let acArg = (args[0] || '').toLowerCase()
if (!acArg) {
    let acState = global.antiCall ? 'ON' : 'OFF'
    reply(`*Anti-Call: ${acState}*\nWhen ON, incoming calls are automatically rejected and caller is warned.\n\nUsage:\n${prefix}anticall on\n${prefix}anticall off`)
} else if (acArg === 'on' || acArg === 'enable') {
    global.antiCall = true
    reply('*Anti-Call ON*\nIncoming calls will be automatically rejected.')
} else if (acArg === 'off' || acArg === 'disable') {
    global.antiCall = false
    reply('*Anti-Call OFF*')
}
}
break

case 'autoread':
case 'setautoread': {
    await X.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let arArg = (args[0] || '').toLowerCase()
if (!arArg) {
    let arState = global.autoRead ? 'ON' : 'OFF'
    reply(`*Auto Read Messages: ${arState}*\nWhen ON, all incoming messages are automatically marked as read.\n\nUsage:\n${prefix}autoread on\n${prefix}autoread off`)
} else if (arArg === 'on' || arArg === 'enable') {
    global.autoRead = true
    reply('*Auto Read ON*\nAll incoming messages will be marked as read.')
} else if (arArg === 'off' || arArg === 'disable') {
    global.autoRead = false
    reply('*Auto Read OFF*')
}
}
break

case 'chatbot':
case 'setchatbot': {
    await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
// Owner can toggle globally; group admins/members can toggle per-chat via chatboai
if (!isOwner) return reply(mess.OnlyOwner)
let cbArg = (args[0] || '').toLowerCase()
if (!cbArg) {
    let cbState = global.chatBot ? '✅ ON' : '❌ OFF'
    let cbaChats = Object.keys(global.chatBoAIChats || {}).length
    reply(`*🤖 ChatBot Status*\n\n• Global ChatBot: *${cbState}*\n• ChatBoAI active chats: *${cbaChats}*\n\n*Commands:*\n• ${prefix}chatbot on — global auto-reply (all chats)\n• ${prefix}chatbot off — disable global auto-reply\n• ${prefix}chatboai on — enable AI replies in *this chat only*\n• ${prefix}chatboai off — disable AI replies in this chat\n• ${prefix}chatboai [question] — one-shot AI question`)
} else if (cbArg === 'on' || cbArg === 'enable') {
    global.chatBot = true
    reply('*🤖 ChatBot: ✅ ON*\n_Bot will now auto-reply to all messages in English using AI._\n\n_Use_ ' + prefix + 'chatbot off _to stop._')
} else if (cbArg === 'off' || cbArg === 'disable') {
    global.chatBot = false
    reply('*🤖 ChatBot: ❌ OFF*\n_Global auto-replies disabled._')
}
}
break

case 'autobio':
case 'setautobio': {
    await X.sendMessage(m.chat, { react: { text: '📝', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let abArg = (args[0] || '').toLowerCase()
if (!abArg) {
    let abState = global.autoBio ? 'ON' : 'OFF'
    reply(`*Auto Bio Update: ${abState}*\nWhen ON, bot bio is auto-updated with current time every minute.\n\nUsage:\n${prefix}autobio on\n${prefix}autobio off`)
} else if (abArg === 'on' || abArg === 'enable') {
    global.autoBio = true
    reply('*Auto Bio ON*\nBot bio will update with current time periodically.')
} else if (abArg === 'off' || abArg === 'disable') {
    global.autoBio = false
    reply('*Auto Bio OFF*')
}
}
break

case 'autoreplystatus':
case 'autoreply': {
    await X.sendMessage(m.chat, { react: { text: '💬', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let arsArg = args.join(' ').trim()
if (!arsArg) {
    let arsState = global.autoReplyStatus ? 'ON' : 'OFF'
    let arsMsg = global.autoReplyStatusMsg || 'Not set'
    reply(`*Auto Reply to Status: ${arsState}*\nReply message: ${arsMsg}\n\nUsage:\n${prefix}autoreplystatus [message] - Set message and enable\n${prefix}autoreplystatus off - Disable`)
} else if (arsArg.toLowerCase() === 'off' || arsArg.toLowerCase() === 'disable') {
    global.autoReplyStatus = false
    global.autoReplyStatusMsg = ''
    reply('*Auto Reply Status OFF*')
} else {
    global.autoReplyStatusMsg = arsArg
    global.autoReplyStatus = true
    reply(`✅ *Auto Reply Status ON*\n  └ Replying with: _"${arsArg}"_`)
}
}
break

case 'antistatusmention':
case 'antismention': {
    await X.sendMessage(m.chat, { react: { text: '🛡️', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)
    let asmArg = (args[0] || '').toLowerCase()
    const _asmStatus = () => {
        const _s = global.antiStatusMention ? '✅ ON' : '❌ OFF'
        const _a = (global.antiStatusMentionAction || 'warn').toUpperCase()
        const _aIcon = _a === 'WARN' ? '⚠️' : _a === 'KICK' ? '🚫' : '🗑️'
        return `╔═════════╗\n║  🛡️  *ANTI STATUS MENTION*\n╚═════════╝\n\n  ├ 📊 *Status* › ${_s}\n  ├ ${_aIcon} *Action* › ${_a}\n  └ ℹ️  *Info*   › Blocks group tags in statuses\n\n  *Commands:*\n  ├ ${prefix}antistatusmention on\n  ├ ${prefix}antistatusmention off\n  ├ ${prefix}antistatusmention warn   — 3 strikes then kick\n  ├ ${prefix}antistatusmention delete — auto-delete their msgs\n  └ ${prefix}antistatusmention kick   — instant removal\n\n  _Bot must be admin in the group._`
    }
    if (!asmArg) {
        reply(_asmStatus())
    } else if (asmArg === 'on' || asmArg === 'enable') {
        global.antiStatusMention = true
        try { if (typeof _savePhoneState === 'function') _savePhoneState(X.user?.id?.split(':')[0]?.split('@')[0] || '') } catch {}
        const _a = (global.antiStatusMentionAction || 'warn').toUpperCase()
        reply(`╔═════════╗\n║  🛡️  *ANTI STATUS MENTION*\n╚═════════╝\n\n  ✅ *Enabled*\n  └ Action: *${_a}*\n\n  _Anyone who tags a group in their status\n  will be ${_a === 'WARN' ? 'warned (3x = kick)' : _a === 'KICK' ? 'instantly kicked' : 'have messages deleted'}._`)
    } else if (asmArg === 'off' || asmArg === 'disable') {
        global.antiStatusMention = false
        reply(`╔═════════╗\n║  🛡️  *ANTI STATUS MENTION*\n╚═════════╝\n\n  ❌ *Disabled*\n  └ Group tagging in statuses no longer actioned.`)
    } else if (asmArg === 'warn') {
        global.antiStatusMention = true
        global.antiStatusMentionAction = 'warn'
        reply(`╔═════════╗\n║  🛡️  *ANTI STATUS MENTION*\n╚═════════╝\n\n  ⚠️ *WARN MODE — Enabled*\n  └ 3 warnings → automatic kick\n\n  _Bot must be admin in the group._`)
    } else if (asmArg === 'delete' || asmArg === 'del') {
        global.antiStatusMention = true
        global.antiStatusMentionAction = 'delete'
        reply(`╔═════════╗\n║  🛡️  *ANTI STATUS MENTION*\n╚═════════╝\n\n  🗑️ *DELETE MODE — Enabled*\n  └ Their messages auto-deleted from group\n\n  _Bot must be admin in the group._`)
    } else if (asmArg === 'kick' || asmArg === 'remove') {
        global.antiStatusMention = true
        global.antiStatusMentionAction = 'kick'
        reply(`╔═════════╗\n║  🛡️  *ANTI STATUS MENTION*\n╚═════════╝\n\n  🚫 *KICK MODE — Enabled*\n  └ Instant removal from group\n\n  _Bot must be admin in the group._`)
    } else {
        reply(`❌ Unknown option. Use: *on, off, warn, delete, kick*`)
    }
}
break




case 'antilink':
case 'setantilink': {
    await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let alArg = (args[0] || '').toLowerCase()
if (!alArg) {
    let alState = global.antiLink ? 'ON' : 'OFF'
    reply(`*Anti-Link: ${alState}*\nWhen ON, messages containing links are deleted and the sender is warned.\n\nUsage:\n${prefix}antilink on\n${prefix}antilink off`)
} else if (alArg === 'on' || alArg === 'enable') {
    global.antiLink = true
    reply(`╔═════════╗\n║  🔗 *ANTI-LINK: ON*\n╚═════════╝\n\n  ✅ Links will be deleted.\n  _Bot must be admin._`)
} else if (alArg === 'off' || alArg === 'disable') {
    global.antiLink = false
    reply('*Anti-Link OFF*')
}
}
break

case 'antidelete':
  case 'antidel':
  case 'setantidelete': {
      await X.sendMessage(m.chat, { react: { text: '🗑️', key: m.key } })
      if (!isOwner) return reply(mess.OnlyOwner)

      // Init state with gc/pm structure
      if (!global.adState || !global.adState.gc) global.adState = {
          gc: { enabled: false, mode: 'private' },
          pm: { enabled: false, mode: 'private' },
          stats: { total: 0, retrieved: 0, media: 0 }
      }
      const _ad = global.adState
      // Keep legacy globals in sync
      const _syncLegacy = () => {
          global.antiDelete = _ad.gc.enabled || _ad.pm.enabled
          global.antiDeleteMode = _ad.gc.mode === 'chat' || _ad.pm.mode === 'chat' ? 'public' : 'private'
          global._saveAdState?.()
      }

      const _arg = (args[0] || '').toLowerCase().trim()
      const _sub = (args[1] || '').toLowerCase().trim()

      const _modeLabel = (mode) => mode === 'both' ? '📢 BOTH (DM + Chat)' : mode === 'chat' ? '💬 CHAT' : '🔒 PRIVATE (DM)'

      const _statusMsg = () => {
          const _gcSt = _ad.gc.enabled ? _modeLabel(_ad.gc.mode) : '❌ OFF'
          const _pmSt = _ad.pm.enabled ? _modeLabel(_ad.pm.mode) : '❌ OFF'
          return (
              `╔═════════╗\n` +
              `║  🗑️  *ANTI-DELETE*\n` +
              `╚═════════╝\n\n` +
              `  ├ 👥 *Groups* › ${_gcSt}\n` +
              `  ├ 💬 *PMs*    › ${_pmSt}\n` +
              `  ├ 📈 *Tracked*   › ${_ad.stats.total} msgs\n` +
              `  ├ ✅ *Retrieved* › ${_ad.stats.retrieved}\n` +
              `  └ 🖼️  *Media*    › ${_ad.stats.media} files\n\n` +
              `  *Commands:*\n` +
              `  ├ ${prefix}antidelete on/off\n` +
              `  ├ ${prefix}antidelete private/chat/both\n` +
              `  ├ ${prefix}antidelete gc on/off/private/chat/both\n` +
              `  ├ ${prefix}antidelete pm on/off/private/chat/both\n` +
              `  └ ${prefix}antidelete stats | clear`
          )
      }

      if (!_arg || _arg === 'status') return reply(_statusMsg())

      // ── gc subcommand ──────────────────────────────────────────────────
      if (_arg === 'gc' || _arg === 'group' || _arg === 'groups') {
          if (_sub === 'on' || _sub === 'enable') {
              _ad.gc.enabled = true; _syncLegacy()
              return reply(`✅ *Anti-Delete GROUPS: ON*\nMode: ${_modeLabel(_ad.gc.mode)}`)
          } else if (_sub === 'off' || _sub === 'disable') {
              _ad.gc.enabled = false; _syncLegacy()
              return reply(`❌ *Anti-Delete GROUPS: OFF*`)
          } else if (['private','prvt','priv'].includes(_sub)) {
              _ad.gc.enabled = true; _ad.gc.mode = 'private'; _syncLegacy()
              return reply(`🔒 *Anti-Delete GROUPS: PRIVATE*\nDeleted messages → Your DM only.`)
          } else if (['chat','cht'].includes(_sub)) {
              _ad.gc.enabled = true; _ad.gc.mode = 'chat'; _syncLegacy()
              return reply(`💬 *Anti-Delete GROUPS: CHAT*\nDeleted messages → Same group chat.`)
          } else if (['both','all'].includes(_sub)) {
              _ad.gc.enabled = true; _ad.gc.mode = 'both'; _syncLegacy()
              return reply(`📢 *Anti-Delete GROUPS: BOTH*\nDeleted messages → Your DM + Group.`)
          } else {
              return reply(`Usage:\n  ${prefix}antidelete gc on/off\n  ${prefix}antidelete gc private/chat/both`)
          }
      }

      // ── pm subcommand ──────────────────────────────────────────────────
      if (_arg === 'pm' || _arg === 'dm' || _arg === 'pms' || _arg === 'dms') {
          if (_sub === 'on' || _sub === 'enable') {
              _ad.pm.enabled = true; _syncLegacy()
              return reply(`✅ *Anti-Delete PMs: ON*\nMode: ${_modeLabel(_ad.pm.mode)}`)
          } else if (_sub === 'off' || _sub === 'disable') {
              _ad.pm.enabled = false; _syncLegacy()
              return reply(`❌ *Anti-Delete PMs: OFF*`)
          } else if (['private','prvt','priv'].includes(_sub)) {
              _ad.pm.enabled = true; _ad.pm.mode = 'private'; _syncLegacy()
              return reply(`🔒 *Anti-Delete PMs: PRIVATE*\nDeleted PMs → Your DM only.`)
          } else if (['chat','cht'].includes(_sub)) {
              _ad.pm.enabled = true; _ad.pm.mode = 'chat'; _syncLegacy()
              return reply(`💬 *Anti-Delete PMs: CHAT*\nDeleted PMs → Same chat.`)
          } else if (['both','all'].includes(_sub)) {
              _ad.pm.enabled = true; _ad.pm.mode = 'both'; _syncLegacy()
              return reply(`📢 *Anti-Delete PMs: BOTH*\nDeleted PMs → Your DM + Same chat.`)
          } else {
              return reply(`Usage:\n  ${prefix}antidelete pm on/off\n  ${prefix}antidelete pm private/chat/both`)
          }
      }

      // ── global on/off ──────────────────────────────────────────────────
      if (_arg === 'on' || _arg === 'enable') {
          _ad.gc.enabled = true; _ad.pm.enabled = true; _syncLegacy()
          return reply(`✅ *Anti-Delete ENABLED*\nGroups: ${_modeLabel(_ad.gc.mode)}\nPMs: ${_modeLabel(_ad.pm.mode)}`)
      }
      if (_arg === 'off' || _arg === 'disable') {
          _ad.gc.enabled = false; _ad.pm.enabled = false; _syncLegacy()
          return reply(`❌ *Anti-Delete DISABLED*\nNo messages will be tracked.`)
      }

      // ── global mode shortcuts ──────────────────────────────────────────
      if (['private','prvt','priv'].includes(_arg)) {
          _ad.gc.enabled = true; _ad.gc.mode = 'private'
          _ad.pm.enabled = true; _ad.pm.mode = 'private'; _syncLegacy()
          return reply(`🔒 *Anti-Delete: PRIVATE*\nAll deleted messages → Your DM only.`)
      }
      if (['chat','cht'].includes(_arg)) {
          _ad.gc.enabled = true; _ad.gc.mode = 'chat'
          _ad.pm.enabled = true; _ad.pm.mode = 'chat'; _syncLegacy()
          return reply(`💬 *Anti-Delete: CHAT*\nAll deleted messages → Same chat.`)
      }
      if (['both','all'].includes(_arg)) {
          _ad.gc.enabled = true; _ad.gc.mode = 'both'
          _ad.pm.enabled = true; _ad.pm.mode = 'both'; _syncLegacy()
          return reply(`📢 *Anti-Delete: BOTH*\nAll deleted messages → DM + Original chat.`)
      }

      // ── stats ──────────────────────────────────────────────────────────
      if (_arg === 'stats') {
          return reply(
              `╔═════════╗\n` +
              `║  📊 *ANTI-DELETE STATS*\n` +
              `╚═════════╝\n\n` +
              `  ├ 👥 *Groups* › ${_ad.gc.enabled ? _modeLabel(_ad.gc.mode) : '❌ OFF'}\n` +
              `  ├ 💬 *PMs*    › ${_ad.pm.enabled ? _modeLabel(_ad.pm.mode) : '❌ OFF'}\n` +
              `  ├ 📈 *Tracked*   › ${_ad.stats.total}\n` +
              `  ├ ✅ *Retrieved* › ${_ad.stats.retrieved}\n` +
              `  ├ 🖼️  *Media*    › ${_ad.stats.media}\n` +
              `  └ 🗂️  *Cache*    › ${global._adCache?.size || 0} entries`
          )
      }

      // ── clear ──────────────────────────────────────────────────────────
      if (_arg === 'clear' || _arg === 'clean') {
          const _sz = global._adCache?.size || 0
          global._adCache = new Map()
          global.adMediaCache = {}
          _ad.stats = { total: 0, retrieved: 0, media: 0 }
          return reply(`🧹 *Cache cleared* — ${_sz} entries removed.\nAnti-Delete remains *${global.antiDelete ? 'ON' : 'OFF'}*.`)
      }

      reply(_statusMsg())
  }
  break


case 'antibot':
case 'setantibot': {
    await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
    if (!isAdmins && !isOwner) return reply(mess.admin)
    if (!m.isGroup) return reply(mess.OnlyGrup)

    // Init globals
    if (!global.antiBot) global.antiBot = false
    if (!global.antiBotGroups) global.antiBotGroups = {}
    if (!global.knownBots) global.knownBots = []

    // Known bot JID patterns — numbers that are commonly bots
    const _botPatterns = [
        /^0@/, /^1@/, /^status/,
    ]
    // Known bot pushname keywords
    const _botNameKeywords = ['bot', 'Bot', 'BOT', 'robot', 'Robot', 'assistant', 'Assistant', 'ai', 'AI']

    const _isBotNumber = (jid) => {
        const num = jid.split('@')[0]
        // Custom list
        if (global.knownBots.includes(num)) return true
        // Numbers ending in 0000, 1234, 9999 etc (common bot numbers)
        if (/0{4,}$/.test(num) || /1234$/.test(num) || /9{4,}$/.test(num)) return true
        return false
    }

    const _subArg = (args[0] || '').toLowerCase()
    const _subArg2 = args.slice(1).join(' ').trim()

    // ── status ────────────────────────────────────────────────────────
    if (!_subArg || _subArg === 'status') {
        const _grpEnabled = global.antiBotGroups[m.chat] ? '✅ ON' : '❌ OFF'
        const _botList = global.knownBots.length
            ? global.knownBots.map(n => `  • +${n}`).join('\n')
            : '  _None added yet_'
        return reply(`╔═════════╗\n║  🤖 *ANTIBOT SETTINGS*\n╚═════════╝\n\n  ├ 📊 *This group* › ${_grpEnabled}\n  └ 🗂️  *Known bots* › ${global.knownBots.length}\n\n${_botList}\n\n  ├ ${prefix}antibot on     — enable here\n  ├ ${prefix}antibot off    — disable here\n  ├ ${prefix}antibot scan   — scan & remove bots\n  ├ ${prefix}antibot add [number] — mark as bot\n  └ ${prefix}antibot list   — list known bots`)
    }

    // ── on ────────────────────────────────────────────────────────────
    if (_subArg === 'on' || _subArg === 'enable') {
        global.antiBotGroups[m.chat] = true
        return reply(`╔═════════╗\n║  🤖 *ANTIBOT*\n╚═════════╝\n\n  ✅ *Enabled in this group*\n  _Bots will be auto-removed when detected._`)
    }

    // ── off ───────────────────────────────────────────────────────────
    if (_subArg === 'off' || _subArg === 'disable') {
        global.antiBotGroups[m.chat] = false
        return reply(`╔═════════╗\n║  🤖 *ANTIBOT*\n╚═════════╝\n\n  ❌ *Disabled in this group*`)
    }

    // ── add ───────────────────────────────────────────────────────────
    if (_subArg === 'add') {
        const _addNum = _subArg2.replace(/[^0-9]/g, '')
        if (!_addNum) return reply(`❌ Provide a number. Example: ${prefix}antibot add 254712345678`)
        if (global.knownBots.includes(_addNum)) return reply(`⚠️ *+${_addNum}* is already in the bot list.`)
        global.knownBots.push(_addNum)
        return reply(`╔═════════╗\n║  🤖 *ANTIBOT*\n╚═════════╝\n\n  ✅ *+${_addNum}* added to known bots list.`)
    }

    // ── remove ────────────────────────────────────────────────────────
    if (_subArg === 'remove' || _subArg === 'del') {
        const _remNum = _subArg2.replace(/[^0-9]/g, '')
        if (!_remNum) return reply(`❌ Provide a number. Example: ${prefix}antibot remove 254712345678`)
        global.knownBots = global.knownBots.filter(n => n !== _remNum)
        return reply(`✅ *+${_remNum}* removed from known bots list.`)
    }

    // ── list ──────────────────────────────────────────────────────────
    if (_subArg === 'list') {
        if (!global.knownBots.length) return reply(`╔═════════╗\n║  🤖 *KNOWN BOTS*\n╚═════════╝\n\n  _No bots marked yet._\n  Use ${prefix}antibot add [number]`)
        const _list = global.knownBots.map((n, i) => `  ${i+1}. +${n}`).join('\n')
        return reply(`╔═════════╗\n║  🤖 *KNOWN BOTS LIST*\n╚═════════╝\n\n${_list}`)
    }

    // ── scan ──────────────────────────────────────────────────────────
    if (_subArg === 'scan') {
        try {
            const _meta = await X.groupMetadata(m.chat)
            const _botIsAdmin = _meta.participants.some(p => {
                const isBot = p.id.split('@')[0] === X.user.id.split('@')[0]
                return isBot && (p.admin === 'admin' || p.admin === 'superadmin')
            })
            if (!_botIsAdmin) return reply(`❌ Bot must be *admin* to remove members.`)

            const _members = _meta.participants.filter(p => !p.id.endsWith('@lid'))
            let _botsFound = []

            for (const p of _members) {
                const _num = p.id.split('@')[0]
                const _isOwnerNum = global.owner.includes(_num)
                const _isBotSelf = _num === X.user.id.split('@')[0]
                if (_isOwnerNum || _isBotSelf) continue
                if (_isBotNumber(p.id)) _botsFound.push(p.id)
            }

            if (!_botsFound.length) {
                return reply(`╔═════════╗\n║  🤖 *ANTIBOT SCAN*\n╚═════════╝\n\n  ✅ No bots detected in this group.\n  _${_members.length} members scanned._`)
            }

            // Remove detected bots
            let _removed = []
            for (const _botJid of _botsFound) {
                try {
                    await X.groupParticipantsUpdate(m.chat, [_botJid], 'remove')
                    _removed.push('+' + _botJid.split('@')[0])
                    await new Promise(r => setTimeout(r, 500))
                } catch {}
            }

            const _removedList = _removed.map(n => `  • ${n}`).join('\n')
            return reply(`╔═════════╗\n║  🤖 *ANTIBOT SCAN DONE*\n╚═════════╝\n\n  ├ 🔍 *Scanned* › ${_members.length} members\n  ├ 🚫 *Removed* › ${_removed.length} bot(s)\n\n${_removedList}`)

        } catch(e) {
            return reply(`❌ Scan failed: ${e.message}`)
        }
    }
}
break

case 'botsettings':
case 'settings':
case 'botconfig': {
    await X.sendMessage(m.chat, { react: { text: '⚙️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
const on = '✅ ON'
const off = '❌ OFF'
let settingsText = `╔═════════╗
║  ⚙️  *BOT SETTINGS*
╚═════════╝

  ├◈ 📛 *Name*     › ${global.botname}
  ├◈ 🏷️  *Version*  › v${global.botver}
  ├◈ 🔤 *Prefix*   › ${global.botPrefix || 'Multi-prefix'}
  ├◈ 🌍 *Timezone* › ${global.botTimezone}
  ├◈ 🔒 *Mode*     › ${X.public ? 'Public' : 'Private'}
  └◈ 🔗 *URL*      › ${global.botUrl || global.wagc}

  ├◈ 📦 *Pack*   › ${global.packname}
  └◈ ✍️  *Author* › ${global.author}

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  🤖 *Auto Features*
  ├◈ 👁️  Auto Read    › ${global.autoRead ? on : off}
  ├◈ 📝 Auto Bio     › ${global.autoBio ? on : off}
  ├◈ 💬 ChatBot      › ${global.chatBot ? on : off}
  ├◈ 👀 View Status  › ${global.autoViewStatus ? on : off}
  ├◈ ❤️  Like Status  › ${global.autoLikeStatus ? on : off} ${global.autoLikeEmoji ? '(' + global.autoLikeEmoji + ')' : ''}
  ├◈ 💌 Reply Status › ${global.autoReplyStatus ? on : off}
  ├◈ 📤 Fwd Status   › ${global.statusToGroup ? on + ' → ' + global.statusToGroup.split('@')[0] : off}
  └◈ 👻 Presence     › ${global.fakePresence}

  🛡️  *Protection*
  ├◈ 📵 Anti-Call          › ${global.antiCall ? on : off}
  ├◈ 🔗 Anti-Link          › ${global.antiLink ? on : off}
  ├◈ 🗑️  Anti-Delete        › ${global.antiDelete ? on : off}
  └◈ 📢 Anti Status Mention › ${global.antiStatusMention ? on : off}

  👥 *Group*
  ├◈ 👋 Welcome     › ${global.welcome ? on : off}
  └◈ 📣 Admin Events › ${global.adminevent ? on : off}

_⚡ Powered by ${global.ownername || 'Toosii Tech'}_`
reply(settingsText)
}
break

case 'restart':
case 'reboot': {
    await X.sendMessage(m.chat, { react: { text: '🔄', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
await reply(`🔄 *Restarting Bot...*\n\n⏳ _Bot will be back online shortly._\n\n_Powered by ${global.botname}_`)
await sleep(2000)
process.exit(0)
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Update Command — fully functional with step-by-step feedback
case 'update': {
    await X.sendMessage(m.chat, { react: { text: '⬆️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
const repoUrl = global.repoUrl || ''
if (!repoUrl) return reply(`❌ *No repo URL set!*\n\nAdd this to *setting.js*:\n\`global.repoUrl = "https://github.com/TOOSII102/TOOSII-XD-ULTRA"\``)

// Helper: run a shell command and return { ok, stdout, stderr }
const run = (cmd, cwd) => new Promise(resolve => {
    exec(cmd, { cwd: cwd || __dirname, timeout: 60000 }, (err, stdout, stderr) => {
        resolve({ ok: !err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim(), err })
    })
})

await reply(`╔═════════╗
║  🔃 *CHECKING FOR UPDATES*
╚═════════╝

  └◈ 📦 ${repoUrl}`)

try {
    // ── Step 1: Ensure git repo ───────────────────────────────────────
    const gitCheck = await run('git rev-parse --is-inside-work-tree')
    if (!gitCheck.ok) {
        await run('git init')
        await run(`git remote add origin ${repoUrl}`)
        const fetchInit = await run('git fetch origin')
        if (!fetchInit.ok) return reply(`❌ *Cannot reach GitHub.*\n_Check internet & repo visibility._`)
        let initBranch = 'main'
        const tryMain = await run('git reset --hard origin/main')
        if (!tryMain.ok) {
            const tryMaster = await run('git reset --hard origin/master')
            if (!tryMaster.ok) return reply(`❌ Could not find main or master branch.`)
            initBranch = 'master'
        }
        await run('npm install --production')
        await reply(`╔═════════╗\n║  ✅ *BOT INITIALIZED*\n╚═════════╝\n\n  ├ 🌿 *Branch* › ${initBranch}\n  └ 🔄 Restarting now...`)
        await sleep(3000)
        return process.exit(0)
    }

    // ── Step 2: Point remote ──────────────────────────────────────────
    await run(`git remote set-url origin ${repoUrl} 2>/dev/null || git remote add origin ${repoUrl}`)

    // ── Step 3: Fetch ─────────────────────────────────────────────────
    const fetchResult = await run('git fetch origin')
    if (!fetchResult.ok) return reply(`❌ *Fetch failed.*\n_Check internet connection._`)

    // ── Step 4: Detect branch ─────────────────────────────────────────
    let branchRes = await run('git rev-parse --abbrev-ref HEAD')
    let branch = branchRes.stdout && branchRes.stdout !== 'HEAD' ? branchRes.stdout : 'main'
    const remoteBranchCheck = await run(`git ls-remote --heads origin ${branch}`)
    if (!remoteBranchCheck.stdout) branch = branch === 'main' ? 'master' : 'main'

    // ── Step 5: Compare commits ───────────────────────────────────────
    const localCommit  = await run('git rev-parse HEAD')
    const remoteCommit = await run(`git rev-parse origin/${branch}`)
    const localHash  = localCommit.stdout.slice(0, 7)

    if (localCommit.stdout && remoteCommit.stdout && localCommit.stdout === remoteCommit.stdout) {
        const lastLog = await run('git log -1 --format="%s | %cr" HEAD')
        return reply(`╔═════════╗\n║  ✅ *ALREADY UP TO DATE*\n╚═════════╝\n\n  ├ 🌿 *Branch* › ${branch}\n  ├ 🔖 *Commit* › ${localHash}\n  └ 📝 ${lastLog.stdout || 'N/A'}`)
    }

    // ── Step 6: Get changelog ─────────────────────────────────────────
    const changelog = await run(`git log HEAD..origin/${branch} --oneline --no-merges`)
    const changeLines = changelog.stdout ? changelog.stdout.split('\n').slice(0, 10).join('\n') : 'New changes available'
    const changeCount = changelog.stdout ? changelog.stdout.split('\n').filter(Boolean).length : '?'

    // ── Step 7: Pull ──────────────────────────────────────────────────
    await run('git stash')
    const pullResult = await run(`git pull origin ${branch} --force`)
    if (!pullResult.ok) {
        const resetResult = await run(`git reset --hard origin/${branch}`)
        if (!resetResult.ok) return reply(`❌ *Update failed.*\n\`\`\`${(pullResult.stderr || resetResult.stderr).slice(0, 300)}\`\`\``)
    }

    // ── Step 8: Install deps ──────────────────────────────────────────
    await run('npm install --production')

    // ── Step 9: Done ──────────────────────────────────────────────────
    const newCommit = await run('git rev-parse HEAD')
    const newHash = newCommit.stdout.slice(0, 7)
    await reply(`╔═════════╗
║  ✅ *BOT UPDATED*
╚═════════╝

  ├◈ 🌿 *Branch*  › ${branch}
  ├◈ 🔖 *Commits* › \`${localHash}\` → \`${newHash}\`
  ├◈ 📋 *Changes* › ${changeCount} commit(s)
  │  \`\`\`${changeLines.slice(0, 300)}\`\`\`
  └◈ 🔄 Restarting now...`)
    await sleep(3000)
    process.exit(0)

} catch (e) {
    reply(`❌ *Update error:*\n\`\`\`${(e.message || e).slice(0, 300)}\`\`\``)
}
} break

case 'addplugin': case 'addplug':{
if (!isOwner) return  reply(mess.OnlyOwner)
if (!q.includes("|")) return reply(`${command}, *Example :* \n\n*${prefix + command} name|category|content*`)
const [
pluginName,
category, ...pluginContent
] = q.split("|")
const pluginDirPath = path.join(path.resolve(__dirname, './plugin', category))
const pluginFilePath = path.join(pluginDirPath, pluginName + ".js")
if (!q.includes("|") || pluginContent.length === 0 || fs.existsSync(pluginFilePath)) return
if (!fs.existsSync(pluginDirPath)) fs.mkdirSync(pluginDirPath, {
recursive: true
})
fs.writeFileSync(pluginFilePath, pluginContent.join('|'))
await reply(`✅ Plugin created at *${pluginFilePath}*`)
}
break
case 'cgplugin': case 'cgplug':{
if (!isOwner) return  reply(mess.OnlyOwner)
if (!q.includes("|")) return reply (`${command}, *Example :* *${prefix + command} pluginnya|isi barunya*`)
let [mypler, ...rest] = q.split("|")
let mypenis = rest.join("|")
let pluginsDirect = path.resolve(__dirname, './plugin')
let plugins = loadPlugins(pluginsDirect)
for (const plugin of plugins) {
if (plugin.command.includes(mypler)) {
let filePath = plugin.filePath
fs.writeFileSync(filePath, mypenis)
await reply(`✅ Plugin replaced at *${filePath}*`)
return
}
}
await reply(`Plugin with command '${mypler}' not found`)
}
break
case 'rmplugin': case 'rmplug':{
if (!isOwner) return  reply(mess.OnlyOwner)
if (!q) return reply(`*Example :* \n\n*${prefix + command} nama plugin*`)
let pluginsDirect = path.resolve(__dirname, './plugin')
let plugins = loadPlugins(pluginsDirect)
for (const plugin of plugins) {
if (plugin.command.includes(q)) {
let filePath = plugin.filePath
fs.unlinkSync(filePath)
await reply(`✅ Plugin removed: *${filePath}*`)
return
}
}
await reply(`Plugin with command '${q}' not found.`)
}
break
case 'getplugin': case 'getplug':{
if (!isOwner) return  reply(mess.OnlyOwner)
if (!q) return reply(`*Example :* \n\n*${prefix + command} nama plugin`) 
let pluginsDirect = path.resolve(__dirname, './plugin')
let plugin = loadPlugins(pluginsDirect).find(p => p.command.includes(q))
if (!plugin) return reply(`Plugin with command '${q}' not found.`)
await X.sendMessage(m.chat, {
document: fs.readFileSync(plugin.filePath),
fileName: path.basename(plugin.filePath),
mimetype: '*/*'
}, {
quoted: m
})
await reply(`✅ Plugin *${q}* retrieved and submitted.`)
}
break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Group Features

            case 'welcome':
            case 'greet':
            case 'left':{
               if (!m.isGroup) return reply(mess.OnlyGrup)
               if (!isAdmins && !isOwner) return reply(mess.admin)
               let welArg = (args[0] || '').toLowerCase()
               if (!welArg) {
                  let welState = global.welcome ? '✅ ON' : '❌ OFF'
                  reply(`╔═════════╗\n║  👋 *WELCOME / GOODBYE*\n╚═════════╝\n\n  ├◈ 📊 *Status* › ${welState}\n  └◈ Sends greetings when members join/leave\n\n  ├◈ ${prefix}welcome on  — Enable\n  └◈ ${prefix}welcome off — Disable`)
               } else if (welArg === 'on' || welArg === 'enable') {
                  global.welcome = true
                  reply(`╔═════════╗\n║  👋 *WELCOME / GOODBYE*\n╚═════════╝\n\n  ✅ *Enabled in ${groupName || 'this group'}*\n  _Bot will greet joins & announce leaves._`)
               } else if (welArg === 'off' || welArg === 'disable') {
                  global.welcome = false
                  reply(`╔═════════╗\n║  👋 *WELCOME / GOODBYE*\n╚═════════╝\n\n  ❌ *Disabled in ${groupName || 'this group'}*\n  _Welcome and goodbye messages turned off._`)
               }
            }
            break
            case 'events':
            case 'groupevent':
            case 'adminevent':{
               if (!m.isGroup) return reply(mess.OnlyGrup)
               if (!isAdmins && !isOwner) return reply(mess.admin)
               let evArg = (args[0] || '').toLowerCase()
               if (!evArg) {
                  let evState = global.adminevent ? '✅ ON' : '❌ OFF'
                  reply(`╔═════════╗\n║  🌟 *ADMIN EVENTS*\n╚═════════╝\n\n  ├◈ 📊 *Status* › ${evState}\n  └◈ Announces admin promotions & demotions\n\n  ├◈ ${prefix}events on  — Enable\n  └◈ ${prefix}events off — Disable`)
               } else if (evArg === 'on' || evArg === 'enable') {
                  global.adminevent = true
                  reply(`╔═════════╗\n║  🌟 *ADMIN EVENTS*\n╚═════════╝\n\n  ✅ *Enabled in ${groupName || 'this group'}*\n  _Admin changes will be announced._`)
               } else if (evArg === 'off' || evArg === 'disable') {
                  global.adminevent = false
                  reply(`╔═════════╗\n║  🌟 *ADMIN EVENTS*\n╚═════════╝\n\n  ❌ *Disabled in ${groupName || 'this group'}*\n  _Admin event notifications turned off._`)
               }
            }
            break
            
            
                        case 'add': {
    await X.sendMessage(m.chat, { react: { text: '➕', key: m.key } })
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isAdmins && !isOwner) return reply(mess.admin);
                                if (!isBotAdmins) return reply(mess.botAdmin);
                                let addTarget = null;
                                if (m.mentionedJid && m.mentionedJid[0]) {
                                        addTarget = m.mentionedJid[0];
                                } else if (m.quoted) {
                                        if (m.quoted.sender) {
                                                addTarget = m.quoted.sender;
                                        } else {
                                                let vcardMatch = (m.quoted.text || JSON.stringify(m.quoted.message || '')).match(/waid=(\d+)|TEL[;:][^:]*:[\+]?(\d+)/);
                                                if (vcardMatch) addTarget = (vcardMatch[1] || vcardMatch[2]) + '@s.whatsapp.net';
                                        }
                                } else if (text) {
                                        addTarget = text.replace(/\D/g, '') + '@s.whatsapp.net';
                                }
                                if (!addTarget) return reply(`📌 *Usage:* ${prefix + command} @user or number\n\n_Example: ${prefix + command} 254xxxxxxxxx_`);
                                try {
                                        let res = await X.groupParticipantsUpdate(m.chat, [addTarget], 'add');
                                        for (let i of res) {
                                                if (i.status == 408) return reply('⏳ User recently left the group. Try again later.');
                                                if (i.status == 401) return reply('🚫 Bot is blocked by this user.');
                                                if (i.status == 409) return reply('ℹ️ User is already in the group.');
                                                if (i.status == 500) return reply('📛 Group is full.');
                                                if (i.status == 403) {
                                                        let addNum = addTarget.split('@')[0]
                                                        await X.sendMessage(m.chat, { 
                                                                text: `🔒 @${addNum} has a private account. Sending invite to their DM...`, 
                                                                mentions: [addTarget] 
                                                        }, { quoted: m });
                                                        try {
                                                                let invv = await X.groupInviteCode(m.chat);
                                                                await X.sendMessage(addTarget, { 
                                                                        text: `https://chat.whatsapp.com/${invv}\n\n📨 You've been invited to join this group by an admin.`, 
                                                                        detectLink: true 
                                                                }).catch(() => reply('❌ Failed to send invite to their DM.'));
                                                        } catch { reply('❌ Could not get group invite link.'); }
                                                } else {
                                                        let addNum = addTarget.split('@')[0];
                                                        X.sendMessage(from, { text: `✅ *@${addNum} has been added to the group.*`, mentions: [addTarget] }, { quoted: m });
                                                }
                                        }
                                } catch (e) {
                                        let errMsg = (e?.message || '').toLowerCase();
                                        if (errMsg.includes('not-authorized') || errMsg.includes('403')) {
                                                reply(mess.botAdmin);
                                        } else {
                                                reply('❌ Failed to add user: ' + (e.message || 'Unknown error'));
                                        }
                                }
                        }
                        break;

                        case 'kick':
                        case 'remove': {
    await X.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isOwner && !isAdmins) return reply(mess.admin);
                                if (!isBotAdmins) return reply(mess.botAdmin);
                                let kickTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null;
                                if (!kickTarget) return reply(`📌 *Usage:* ${prefix + command} @user or reply to their message`);
                                let kickNum = kickTarget.split('@')[0]
                                let isTargetOwner = owner.some(o => kickTarget.includes(o)) || (typeof X.areJidsSameUser === 'function' && owner.some(o => X.areJidsSameUser(kickTarget, o + '@s.whatsapp.net')))
                                if (isTargetOwner) return reply('🛡️ Cannot remove the bot owner.');
                                try {
                                        await X.groupParticipantsUpdate(m.chat, [kickTarget], 'remove');
                                        X.sendMessage(from, { text: `🚪 *@${kickNum} has been removed from the group.*`, mentions: [kickTarget] }, { quoted: m })
                                } catch (err) {
                                        let errMsg = (err?.message || '').toLowerCase();
                                        if (errMsg.includes('not-authorized') || errMsg.includes('403')) {
                                                reply(mess.botAdmin);
                                        } else {
                                                reply('❌ Failed to remove user: ' + (err.message || 'Unknown error'));
                                        }
                                }
                        }
                        break;

                        case 'del':
                        case 'delete': {
    await X.sendMessage(m.chat, { react: { text: '🗑️', key: m.key } })
                                if (!m.quoted) return reply(`*Usage:* Reply to a message with ${prefix + command} to delete it.`);
                                let quotedKey = m.quoted.fakeObj ? { ...m.quoted.fakeObj.key } : { remoteJid: m.quoted.chat || m.chat, fromMe: m.quoted.fromMe || false, id: m.quoted.id }
                                if (m.isGroup && !quotedKey.participant) {
                                        quotedKey.participant = m.quoted.sender
                                }
                                if (m.isGroup && !quotedKey.fromMe && !isBotAdmins) return reply('⚠️ *Bot Not Admin* — Please promote me to group admin to delete messages.');
                                try {
                                        if (quotedKey.fromMe || isOwner || (m.isGroup && isAdmins)) {
                                                await X.sendMessage(m.chat, { delete: quotedKey });
                                        } else {
                                                reply('🚫 You can only delete bot messages or your own messages (admin required in groups).');
                                        }
                                } catch (err) {
                                        let errMsg = (err?.message || '').toLowerCase()
                                        if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply('⚠️ *Bot Not Admin* — Please promote me to group admin to delete messages.')
                                        else reply('❌ Failed to delete message: ' + (err.message || 'Unknown error'));
                                }
                        }
                        break;

                        case 'warn': {
    await X.sendMessage(m.chat, { react: { text: '⚠️', key: m.key } })
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isOwner && !isAdmins) return reply(mess.admin);
                                if (!isBotAdmins) return reply(mess.botAdmin);
                                let warnUser = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null;
                                if (!warnUser) return reply(`📌 *Usage:* ${prefix}warn @user [reason]\n_Reply to a message or mention someone._`);
                                let isWarnOwner = owner.some(o => warnUser.includes(o)) || (typeof X.areJidsSameUser === 'function' && owner.some(o => X.areJidsSameUser(warnUser, o + '@s.whatsapp.net')))
                                if (isWarnOwner) return reply('🛡️ Cannot warn the bot owner.');
                                let warnReason = args.slice(m.mentionedJid && m.mentionedJid[0] ? 1 : 0).join(' ') || 'No reason given';
                                let warnDbPath = path.join(__dirname, 'database', 'warnings.json');
                                let warnDb = {};
                                try { warnDb = JSON.parse(fs.readFileSync(warnDbPath, 'utf-8')); } catch { warnDb = {}; }
                                let groupWarn = warnDb[m.chat] || {};
                                let userWarns = groupWarn[warnUser] || [];
                                userWarns.push({ reason: warnReason, time: new Date().toISOString(), by: sender });
                                groupWarn[warnUser] = userWarns;
                                warnDb[m.chat] = groupWarn;
                                fs.writeFileSync(warnDbPath, JSON.stringify(warnDb, null, 2));
                                let warnCount = userWarns.length;
                                let maxWarns = 3;
                                let warnNum = warnUser.split('@')[0];
                                if (warnCount >= maxWarns) {
                                    try {
                                        await X.groupParticipantsUpdate(m.chat, [warnUser], 'remove');
                                        groupWarn[warnUser] = [];
                                        warnDb[m.chat] = groupWarn;
                                        fs.writeFileSync(warnDbPath, JSON.stringify(warnDb, null, 2));
                                        X.sendMessage(from, { text: `🚨 *@${warnNum} has reached ${maxWarns}/${maxWarns} warnings and has been removed!*\n\n📝 Reason: ${warnReason}`, mentions: [warnUser] }, { quoted: m });
                                    } catch(err) {
                                        let errMsg = (err?.message || '').toLowerCase();
                                        if (errMsg.includes('not-authorized') || errMsg.includes('403')) {
                                            reply(mess.botAdmin);
                                        } else { reply(mess.error); }
                                    }
                                } else {
                                    X.sendMessage(from, { text: `⚠️ *Warning ${warnCount}/${maxWarns} for @${warnNum}*\n📝 Reason: ${warnReason}\n\n_${maxWarns - warnCount} more warning(s) before removal._`, mentions: [warnUser] }, { quoted: m });
                                }
                        }
                        break;

                        case 'unwarn':
                        case 'resetwarn': {
    await X.sendMessage(m.chat, { react: { text: '🔄', key: m.key } })
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isOwner && !isAdmins) return reply(mess.admin);
                                let uwUser = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null;
                                if (!uwUser) return reply(`📌 *Usage:* ${prefix}unwarn @user\n_Reply to a message or mention someone._`);
                                let uwDbPath = path.join(__dirname, 'database', 'warnings.json');
                                let uwDb = {};
                                try { uwDb = JSON.parse(fs.readFileSync(uwDbPath, 'utf-8')); } catch { uwDb = {}; }
                                if (uwDb[m.chat] && uwDb[m.chat][uwUser]) {
                                    uwDb[m.chat][uwUser] = [];
                                    fs.writeFileSync(uwDbPath, JSON.stringify(uwDb, null, 2));
                                    let uwNum = uwUser.split('@')[0];
                                    X.sendMessage(from, { text: `✅ *Warnings cleared for @${uwNum}.*`, mentions: [uwUser] }, { quoted: m });
                                } else {
                                    reply('ℹ️ This user has no warnings.');
                                }
                        }
                        break;

                        case 'warnlist':
                        case 'warnings': {
    await X.sendMessage(m.chat, { react: { text: '⚠️', key: m.key } })
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isOwner && !isAdmins) return reply(mess.admin);
                                let wlDbPath = path.join(__dirname, 'database', 'warnings.json');
                                let wlDb = {};
                                try { wlDb = JSON.parse(fs.readFileSync(wlDbPath, 'utf-8')); } catch { wlDb = {}; }
                                let groupWarns = wlDb[m.chat] || {};
                                let warnEntries = Object.entries(groupWarns).filter(([, w]) => w.length > 0);
                                if (warnEntries.length === 0) return reply('ℹ️ No warnings in this group.');
                                let warnListText = `╔═════════╗\n║  ⚠️  *GROUP WARNINGS*\n╚═════════╝\n\n`;
                                let warnMentions = [];
                                for (let [jid, warns] of warnEntries) {
                                    let num = jid.split('@')[0];
                                    warnMentions.push(jid);
                                    warnListText += `│ 👤 @${num} — *${warns.length}/3*\n`;
                                    warns.forEach((w, i) => {
                                        warnListText += `│   ${i + 1}. ${w.reason} _(${new Date(w.time).toLocaleDateString()})_\n`;
                                    });
                                    warnListText += `│\n`;
                                }
                                warnListText += `╰━━━━━━━━━━━━━━━━━╯`
                                X.sendMessage(from, { text: warnListText, mentions: warnMentions }, { quoted: m });
                        }
                        break;

                        case 'promote': {
    await X.sendMessage(m.chat, { react: { text: '⬆️', key: m.key } })
                                if (!m.isGroup) return reply(mess.OnlyGrup)
                                if (!isOwner && !isAdmins) return reply(mess.admin)
                                if (!isBotAdmins) return reply(mess.botAdmin)
                                let promoteTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null
                                if (!promoteTarget) return reply(`📌 *Usage:* ${prefix + command} @user or reply to their message`)
                                try {
                                    await X.groupParticipantsUpdate(m.chat, [promoteTarget], 'promote')
                                    let promoteNum = promoteTarget.split('@')[0]
                                    X.sendMessage(from, { text: `⬆️ *@${promoteNum} has been promoted to admin!*`, mentions: [promoteTarget] }, { quoted: m })
                                } catch(err) {
                                    let errMsg = (err?.message || err || '').toString().toLowerCase()
                                    if (errMsg.includes('not-authorized') || errMsg.includes('403') || errMsg.includes('admin')) {
                                        reply(mess.botAdmin)
                                    } else {
                                        reply(mess.error)
                                    }
                                }
                        }
                        break

                        case 'demote': {
    await X.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } })
                                if (!m.isGroup) return reply(mess.OnlyGrup)
                                if (!isOwner && !isAdmins) return reply(mess.admin)
                                if (!isBotAdmins) return reply(mess.botAdmin)
                                let demoteTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null
                                if (!demoteTarget) return reply(`📌 *Usage:* ${prefix + command} @user or reply to their message`)
                                let demoteNum = demoteTarget.split('@')[0]
                                let isDemoteOwner = owner.some(o => demoteTarget.includes(o)) || (typeof X.areJidsSameUser === 'function' && owner.some(o => X.areJidsSameUser(demoteTarget, o + '@s.whatsapp.net')))
                                if (isDemoteOwner) return reply('🛡️ Cannot demote the bot owner.')
                                try {
                                    await X.groupParticipantsUpdate(m.chat, [demoteTarget], 'demote')
                                    X.sendMessage(from, { text: `⬇️ *@${demoteNum} has been demoted from admin.*`, mentions: [demoteTarget] }, { quoted: m })
                                } catch(err) {
                                    let errMsg = (err?.message || err || '').toString().toLowerCase()
                                    if (errMsg.includes('not-authorized') || errMsg.includes('403') || errMsg.includes('admin')) {
                                        reply(mess.botAdmin)
                                    } else {
                                        reply(mess.error)
                                    }
                                }
                        }
                        break

                        case 'revoke':{
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isAdmins && !isOwner) return reply(mess.admin);
                                if (!isBotAdmins) return reply(mess.botAdmin);
                                try {
                                    await X.groupRevokeInvite(m.chat)
                                    reply(`╔═════════╗\n║  🚫 *LINK REVOKED*\n╚═════════╝\n\n  ✅ Invite link successfully revoked.\n  _Use ${prefix}link to generate a new one._`)
                                } catch(err) {
                                    let errMsg = (err?.message || '').toLowerCase()
                                    if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
                                    else reply(`❌ *Failed to revoke group link.*\n_${err.message || 'Unknown error'}_`)
                                }
                                }
                                break

                        case 'approve':
                        case 'acceptjoin': {
    await X.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
                                if (!m.isGroup) return reply(mess.OnlyGrup)
                                if (!isAdmins && !isOwner) return reply(mess.admin)
                                if (!isBotAdmins) return reply(mess.botAdmin)
                                try {
                                        let pending = await X.groupRequestParticipantsList(m.chat)
                                        if (!pending || pending.length === 0) return reply('ℹ️ No pending join requests.')
                                        if (text && text.toLowerCase() === 'all') {
                                                let jids = pending.map(p => p.jid)
                                                await X.groupRequestParticipantsUpdate(m.chat, jids, 'approve')
                                                reply(`✅ *Approved all ${jids.length} pending join request(s).*`)
                                        } else if (text) {
                                                let target = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
                                                let found = pending.find(p => p.jid === target)
                                                if (!found) return reply(`❌ That number is not in the pending requests.\n\n📋 Pending: ${pending.map(p => p.jid.split('@')[0]).join(', ')}`)
                                                await X.groupRequestParticipantsUpdate(m.chat, [target], 'approve')
                                                reply(`✅ *Approved @${target.split('@')[0]}*`)
                                        } else {
                                                let list = pending.map((p, i) => `│ ${i + 1}. ${p.jid.split('@')[0]}`).join('\n')
                                                reply(`╔═════════╗\n║  📋 *PENDING REQUESTS*\n╚═════════╝\n\n  └ *Total:* ${pending.length}\n\n${list}\n\n  ├ ${prefix}approve all / [number]\n  └ ${prefix}reject all / [number]`)
                                        }
                                } catch (err) {
                                        let errMsg = (err?.message || '').toLowerCase()
                                        if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
                                        else reply('❌ Failed: ' + (err.message || 'Unknown error'))
                                }
                        }
                        break

                        case 'reject':
                        case 'rejectjoin': {
    await X.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
                                if (!m.isGroup) return reply(mess.OnlyGrup)
                                if (!isAdmins && !isOwner) return reply(mess.admin)
                                if (!isBotAdmins) return reply(mess.botAdmin)
                                try {
                                        let pending = await X.groupRequestParticipantsList(m.chat)
                                        if (!pending || pending.length === 0) return reply('ℹ️ No pending join requests.')
                                        if (text && text.toLowerCase() === 'all') {
                                                let jids = pending.map(p => p.jid)
                                                await X.groupRequestParticipantsUpdate(m.chat, jids, 'reject')
                                                reply(`✅ *Rejected all ${jids.length} pending join request(s).*`)
                                        } else if (text) {
                                                let target = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
                                                let found = pending.find(p => p.jid === target)
                                                if (!found) return reply(`❌ That number is not in the pending requests.`)
                                                await X.groupRequestParticipantsUpdate(m.chat, [target], 'reject')
                                                reply(`✅ *Rejected @${target.split('@')[0]}*`)
                                        } else {
                                                let list = pending.map((p, i) => `${i + 1}. ${p.jid.split('@')[0]}`).join('\n')
                                                reply(`📋 *Pending Join Requests (${pending.length}):*\n\n${list}\n\n📌 Use ${prefix}reject all or ${prefix}reject [number]`)
                                        }
                                } catch (err) {
                                        let errMsg = (err?.message || '').toLowerCase()
                                        if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
                                        else reply('❌ Failed: ' + (err.message || 'Unknown error'))
                                }
                        }
                        break
                                
//━━━━━━━━━━━━━━━━━━━━━━━━//                            
// search features
                        case 'wikimedia': {
    await X.sendMessage(m.chat, { react: { text: '📖', key: m.key } })
                                if (!text) return reply(`*Example :*\n\n${prefix + command} Query`);
                                try {
                                        const results = await wikimedia(text);
                                        if (results.length === 0) return reply(`⚠️ No images found on Wikimedia for "${text}".`);
                                        let result = results.map(img => `🖼️ *${img.title || 'No Title'}*\n🔗 ${img.source}`).join('\n\n');
                                        reply(`╔═════════╗\n║  🌐 *WIKIMEDIA*\n╚═════════╝\n\n  🔍 *${text}*\n\n${result}`);
                                } catch (err) {
                                        console.error(err);
                                        reply(`❌ Error fetching images from Wikimedia. Please try again later.`);
                                }
                        }
                        break;

                        case 'mangainfo': {
    await X.sendMessage(m.chat, { react: { text: '📚', key: m.key } })
                                const mangaName = args.join(' ');
                                if (!mangaName) return reply(`*Example :*\n\n${prefix + command} Anime`);
                                try {
                                        const mangaList = await komiku("manga", mangaName);
                                        if (mangaList.length === 0) {
                                                return reply('_[ Invalid ]_ Not Found !!');
                                        }
                                        let captionText = `📚 *Hasil Pencarian Manga - ${mangaName}* 📚\n\n`;
                                        mangaList.slice(0, 5).forEach((manga, index) => {
                                                captionText += `📖 *${index + 1}. ${manga.title}*\n`;
                                                captionText += `🗂️ *Genre*: ${manga.genre}\n`;
                                                captionText += `🔗 *Url*: ${manga.url}\n`;
                                                captionText += `📖 *Description*: ${manga.description}\n\n`;
                                        });
                                        await reply(captionText);
                                } catch (error) {
                                        console.error("Report Error :", error);
                                        reply(mess.error);
                                }
                                break;
                        }

                        case 'mangadetail': {
    await X.sendMessage(m.chat, { react: { text: '📚', key: m.key } })
                                const url = args[0];
                                if (!url) return reply(`*Example :*\n\n${prefix + command} URL`);
                                try {
                                        const mangaDetail = await detail(url);
                                        let captionText = `📚 *Manga Details* 📚\n\n`;
                                        captionText += `📖 *Title*: ${mangaDetail.title}\n`;
                                        captionText += `🗂️ *Genre*: ${mangaDetail.genres.join(', ')}\n`;
                                        captionText += `📖 *Description*: ${mangaDetail.description}\n`;
                                        captionText += `📅 *First Chapter*: ${mangaDetail.awalChapter}\n`;
                                        captionText += `📅 *Latest Chapter*: ${mangaDetail.newChapter}\n`;
                                        X.sendMessage(m.chat, {
                                                image: { url: mangaDetail.coverImage },
                                                caption: captionText
                                        }, {
                                                quoted: m
                                        })
                                } catch (error) {
                                        console.error("Report Error :", error);
                                        reply(mess.error);
                                }
                                break;
                        }

                        case 'jkt48news': {
    await X.sendMessage(m.chat, { react: { text: '📰', key: m.key } })
                                const lang = args[0] || "id";
                                try {
                                        const news = await jktNews(lang);
                                        if (news.length === 0) {
                                                return reply('_[ Report ]_ No News Find');
                                        }
                                        let captionText = `🎤 *Latest JKT48 News* 🎤\n\n`;
                                        news.slice(0, 5).forEach((item, index) => {
                                                captionText += `📰 *${index + 1}. ${item.title}*\n`;
                                                captionText += `📅 *Date*: ${item.date}\n`;
                                                captionText += `🔗 *Link*: ${item.link}\n\n`;
                                        });
                                        await reply(captionText);
                                } catch (error) {
                                        console.error("Report Error :", error);
                                        reply(mess.error);
                                }
                                break;
                        }

                        case 'otakudesu':{
                                let data = await otakuDesu.ongoing();
                                let captionText = `「 *ANIME SCHEDULE* 」\n\n`
                                for (let i of data) {
                                        captionText += `*💬 Title*: ${i.title}\n`
                                        captionText += `*📺 Eps*: ${i.episode}\n`
                                        captionText += `*🔗 URL*: ${i.link}\n\n`
                                }
                                X.sendMessage(m.chat, {
                                        text: captionText,
                                        contextInfo: {
                                                mentionedJid: [m.sender],
                                                forwardingScore: 999999, 
                                                isForwarded: true, 
                                                forwardedNewsletterMessageInfo: {
                                                        newsletterName: newsletterName,
                                                        newsletterJid: idch,
                                                },
                                                externalAdReply: {
                                                        showAdAttribution: true,
                                                        title: 'Ini Update Anime Terbaru!',
                                                        mediaType: 1,
                                                        previewType: 1,
                                                        body: 'Halo 👋',
                                                        thumbnailUrl: thumb,
                                                        renderLargerThumbnail: false,
                                                        mediaUrl: wagc,
                                                        sourceUrl: wagc
                                                }
                                        }
                                }, {
                                        quoted: m
                                })
                        }
                        break;

                        case 'kusonimeinfo':
                        case 'animeinfo': {
    await X.sendMessage(m.chat, { react: { text: '🎌', key: m.key } })
                                try {
                                        const animeList = await Kusonime.info();
                                        if (animeList.length === 0) {
                                                return reply('_[ Invalid ⚠️ ]_ No latest anime data found at this time.');
                                        }
                                        let captionText = `🎌 *Latest Anime from Kusonime* 🎌\n\n`;
                                        animeList.slice(0, 5).forEach((anime, index) => {
                                                captionText += `📺 *${index + 1}. ${anime.title}*\n`;
                                                captionText += `🔗 *URL*: ${anime.url}\n`;
                                                captionText += `🗂️ *Genre*: ${anime.genres.join(', ')}\n`;
                                                captionText += `📅 *Rilis*: ${anime.releaseTime}\n\n`;
                                        });
                                        await reply(captionText);
                                } catch (error) {
                                        console.error("Report Error :", error);
                                        reply(mess.error);
                                };
                        }
                        break

                        case 'kusonimesearch':
                        case 'animesearch': {
    await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
                                if (!text) return reply(`*Example :*\n\n${prefix + command} Anime`);
                                try {
                                        const searchResults = await Kusonime.search(text);
                                        if (typeof searchResults === 'string') {
                                                return reply(`⚠️ ${searchResults}`);
                                        }
                                        let captionText = `🔍 *Search Results for*: ${text}\n\n`;
                                        searchResults.slice(0, 5).forEach((anime, index) => {
                                                captionText += `📺 *${index + 1}. ${anime.title}*\n`;
                                                captionText += `🔗 *URL*: ${anime.url}\n`;
                                                captionText += `🗂️ *Genre*: ${anime.genres.join(', ')}\n`;
                                                captionText += `📅 *Rilis*: ${anime.releaseTime}\n\n`;
                                        });
                                        await reply(captionText);
                                } catch (error) {
                                        console.error("Report Error :", error);
                                        reply(mess.error);
                                }
                        }
                        break;

                        case 'infogempa':
                        case 'infobmkg':
                        case 'gempa':
                        case 'bmkg': {
    await X.sendMessage(m.chat, { react: { text: '🌤️', key: m.key } })
                                try {
                                        let result = await gempa();
                                        let gempaData = result.data;
                                        let captionText = `「 *EARTHQUAKE INFO* 」\n\n`;
                                        captionText += `*🌍 Source*: ${result.source}\n`;
                                        captionText += `*📊 Magnitude*: ${gempaData.magnitude.trim()}\n`;
                                        captionText += `*📏 Depth*: ${gempaData.kedalaman.trim()}\n`;
                                        captionText += `*🗺️ Latitude & Longitude*: ${gempaData.lintang_bujur.trim()}\n`;
                                        captionText += `*🕒 Time*: ${gempaData.waktu.trim()}\n`;
                                        captionText += `*📍 Region*: ${gempaData.wilayah.trim() || 'No data'}\n`;
                                        captionText += `*😱 Felt*: ${gempaData.dirasakan.trim() || 'No data'}\n\n`;
                                        captionText += `Stay alert and follow instructions from authorities!`;
                                        if (gempaData.imagemap) {
                                                X.sendMessage(m.chat, {
                                                        image: { url: gempaData.imagemap.startsWith('http') ? gempaData.imagemap : `https://www.bmkg.go.id${gempaData.imagemap}` },
                                                        caption: captionText,
                                                        contextInfo: {
                                                                mentionedJid: [m.sender],
                                                                forwardingScore: 999999, 
                                                                isForwarded: true, 
                                                                forwardedNewsletterMessageInfo: {
                                                                        newsletterName: saluranName,
                                                                        newsletterJid: saluran,
                                                                },
                                                                externalAdReply: {
                                                                        showAdAttribution: true,
                                                                        title: 'Latest Earthquake Information!',
                                                                        mediaType: 1,
                                                                        previewType: 1,
                                                                        body: 'Be careful',
                                                                        thumbnailUrl: imageUrl,
                                                                        renderLargerThumbnail: false,
                                                                        mediaUrl: 'https://www.bmkg.go.id',
                                                                        sourceUrl: 'https://www.bmkg.go.id'
                                                                }
                                                        }
                                                }, {
                                                        quoted: m
                                                });
                                        } else {
                                                X.sendMessage(m.chat, {
                                                        text: captionText,
                                                        contextInfo: {
                                                                mentionedJid: [m.sender],
                                                                forwardingScore: 999999, 
                                                                isForwarded: true, 
                                                                forwardedNewsletterMessageInfo: {
                                                                        newsletterName: saluranName,
                                                                        newsletterJid: saluran,
                                                                },
                                                                externalAdReply: {
                                                                        showAdAttribution: true,
                                                                        title: 'Latest Earthquake Information!',
                                                                        mediaType: 1,
                                                                        previewType: 1,
                                                                        body: 'Be careful',
                                                                        thumbnailUrl: imageUrl,
                                                                        renderLargerThumbnail: false,
                                                                        mediaUrl: 'https://www.bmkg.go.id',
                                                                        sourceUrl: 'https://www.bmkg.go.id'
                                                                }
                                                        }
                                                }, {
                                                        quoted: m
                                                });
                                        }
                                } catch (error) {
                                        console.error("Report Error :", error);
                                        X.sendMessage(m.chat, {
                                                text: mess.error
                                        }, {
                                                quoted: m
                                        });
                                }
                        }
                        break;


//━━━━━━━━━━━━━━━━━━━━━━━━//
// Tools Features

                        case 'myip':
                        case 'ipbot':
                                if (!isOwner) return reply(mess.OnlyOwner);
                                let http = require('http');
                                http.get({
                                        'host': 'api.ipify.org',
                                        'port': 80,
                                        'path': '/'
                                }, function(resp) {
                                        resp.on('data', function(ip) {
                                                reply("🔎 Oii, Public IP address: " + ip);
                                        })
                                });
                        break;

                        case "ipwhois": {
                                if (!text) return reply(`*Example :*\n\n${prefix + command} 114.5.213.103`);
                                const ip = text.trim();
                                const apiUrl = `https://ipwho.is/${ip}`;
                                try {
                                        reply("🔍 Searching for information, please wait...");
                                        const data = await fetchJson(apiUrl);
                                        if (data.success) {
                                                const flagEmoji = data.flag?.emoji || "🏳️";
                                                let messageText = "📍 *IP Whois Information*\n";
                                                messageText += `🌐 *IP Address*: ${data.ip}\n`;
                                                messageText += `🗺️ *Type*: ${data.type}\n`;
                                                messageText += `🌍 *Continent*: ${data.continent} (${data.continent_code})\n`;
                                                messageText += `🇨🇺 *Country*: ${data.country} (${data.country_code}) ${flagEmoji}\n`;
                                                messageText += `🏙️ *City*: ${data.city}, ${data.region} (${data.region_code})\n`;
                                                messageText += `📞 *Calling Code*: +${data.calling_code}\n`;
                                                messageText += `📫 *Postal Code*: ${data.postal}\n`;
                                                messageText += `🏛️ *Capital*: ${data.capital}\n\n`;
                                                messageText += "📡 *Provider Information*\n";
                                                messageText += `🏢 *ISP*: ${data.connection?.isp || "Not available"}\n`;
                                                messageText += `🔗 *Domain*: ${data.connection?.domain || "Not available"}\n`;
                                                messageText += `🔢 *ASN*: ${data.connection?.asn || "Not available"}\n\n`;
                                                messageText += "🕰️ *Timezone*\n";
                                                messageText += `🕒 *ID*: ${data.timezone?.id || "Not available"}\n`;
                                                messageText += `🕒 *UTC*: ${data.timezone?.utc || "Not available"}\n`;
                                                messageText += `🕒 *Current Time*: ${data.timezone?.current_time || "Not available"}\n`;
                                                reply(messageText);
                                        } else {
                                                reply(`❌ Invalid IP Address or information not found.`);
                                        }
                                } catch (err) {
                                        console.error(err);
                                        reply("❌ An error occurred while fetching data. Please try again later.");
                                }
                        }
                        break;
 
case 'telestick': {
    await X.sendMessage(m.chat, { react: { text: '📲', key: m.key } })
  async function telestick(url) {
    let match = url.match(/https:\/\/t\.me\/addstickers\/([^\/\?#]+)/)
    if (!match) return reply(`*Example :*\n\n${prefix + command} https://`);
    let { data: a } = await axios.get(`https://api.telegram.org/bot7935827856:AAGdbLXArulCigWyi6gqR07gi--ZPm7ewhc/getStickerSet?name=${match[1]}`)
    let stickers = await Promise.all(a.result.stickers.map(async v => {
      let { data: b } = await axios.get(`https://api.telegram.org/bot7935827856:AAGdbLXArulCigWyi6gqR07gi--ZPm7ewhc/getFile?file_id=${v.file_id}`)
      return {
        emoji: v.emoji,
        is_animated: v.is_animated,
        image_url: `https://api.telegram.org/file/bot7935827856:AAGdbLXArulCigWyi6gqR07gi--ZPm7ewhc/${b.result.file_path}`
      }
    }))
    return { name: a.result.name, title: a.result.title, sticker_type: a.result.sticker_type, stickers }
  }
 
  try {
    if (!args[0]) return reply('Enter the Telegram sticker URL')
    let res = await telestick(args[0])
    for (let v of res.stickers) {
      let { data } = await axios.get(v.image_url, { responseType: 'arraybuffer' })
      let sticker = new Sticker(data, { pack: res.title, author: 'MT-BOT', type: v.is_animated ? 'full' : 'default' })
      await X.sendMessage(m.chat, await sticker.toMessage(), { quoted: m })
    }
  } catch (e) {
    reply(e.message)
  }
}
break;

case 'stikerly': {
    await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
if (!text) return reply(`*Example :*\n\n ${prefix + command} anomali `)
try {
throw new Error('stikerly_offline')
} catch (e) {
if (e.message === 'stikerly_offline') {
    return reply('❌ *Stickerly service is currently offline.*\n_The sticker search API is unavailable. Please try again later._')
}
console.error(e)
reply('❌ Sticker search failed. Service may be unavailable.')
}
}
break

case 'stickercrop':
case 'scrop': {
  const _scIsImg = m.mtype === 'imageMessage'
  const _scIsQuote = m.quoted && (m.quoted.mtype === 'imageMessage' || m.quoted.mtype === 'stickerMessage')
  if (!_scIsImg && !_scIsQuote) return reply(`Reply to an image with *${prefix}${command}* to crop it into a square sticker.`)
  try {
    await X.sendMessage(m.chat, { react: { text: '✂️', key: m.key } })
    const _scQuoted = m.quoted ? m.quoted : m
    let _scBuf = await _scQuoted.download()
    const Jimp = require('jimp')
    let _scImg = await Jimp.read(_scBuf)
    let _scW = _scImg.getWidth(), _scH = _scImg.getHeight()
    let _scSize = Math.min(_scW, _scH)
    _scImg.crop(Math.floor((_scW - _scSize) / 2), Math.floor((_scH - _scSize) / 2), _scSize, _scSize)
    let _scOut = await _scImg.getBufferAsync(Jimp.MIME_JPEG)
    const { StickerTypes } = require('wa-sticker-formatter')
    let _scSticker = new Sticker(_scOut, { pack: global.packname || 'TOOSII-XD', author: global.authorname || 'Toosii Tech', type: StickerTypes.FULL, quality: 70 })
    await X.sendMessage(m.chat, { sticker: await _scSticker.toBuffer() }, { quoted: m })
  } catch (e) {
    console.error('[STICKERCROP ERROR]', e.message)
    reply('❌ Sticker crop failed: ' + e.message)
  }
}
break

case 'meme':
case 'smeme': {
  const _mmIsImg = m.mtype === 'imageMessage'
  const _mmIsQuote = m.quoted && (m.quoted.mtype === 'imageMessage' || m.quoted.mtype === 'stickerMessage')
  if (!_mmIsImg && !_mmIsQuote) return reply(`Reply to an image with:\n*${prefix}${command} top text | bottom text*\n\nOr just:\n*${prefix}${command} bottom text only*`)
  if (!text) return reply(`Reply to an image with:\n*${prefix}${command} top text | bottom text*\n\nExample:\n*${prefix}meme When you finally fix a bug | 10 more appear*`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🎭', key: m.key } })
    const _mmQuoted = m.quoted ? m.quoted : m
    const _mmParts = text.split('|')
    const _mmTop = (_mmParts.length > 1 ? _mmParts[0].trim() : '').toUpperCase()
    const _mmBot = (_mmParts.length > 1 ? _mmParts[1] : _mmParts[0]).trim().toUpperCase()
    let _mmBuf = await _mmQuoted.download()
    const Jimp = require('jimp')
    let _mmImg = await Jimp.read(_mmBuf)
    const _mmW = _mmImg.getWidth(), _mmH = _mmImg.getHeight()
    const _mmFont = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE)
    const _mmShadow = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK)
    const _mmPad = 10
    const _mmMaxW = _mmW - (_mmPad * 2)
    const _mmFontH = 80
    const _mmTextTop = _mmPad
    const _mmTextBot = _mmH - _mmFontH - _mmPad
    const _mmOffsets = [[-2,0],[2,0],[0,-2],[0,2],[-2,-2],[2,-2],[-2,2],[2,2]]
    if (_mmTop) {
      for (const [ox, oy] of _mmOffsets) _mmImg.print(_mmShadow, _mmPad + ox, _mmTextTop + oy, { text: _mmTop, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, _mmMaxW)
      _mmImg.print(_mmFont, _mmPad, _mmTextTop, { text: _mmTop, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, _mmMaxW)
    }
    if (_mmBot) {
      for (const [ox, oy] of _mmOffsets) _mmImg.print(_mmShadow, _mmPad + ox, _mmTextBot + oy, { text: _mmBot, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, _mmMaxW)
      _mmImg.print(_mmFont, _mmPad, _mmTextBot, { text: _mmBot, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, _mmMaxW)
    }
    let _mmOut = await _mmImg.getBufferAsync(Jimp.MIME_JPEG)
    if (command === 'smeme') {
      const { StickerTypes } = require('wa-sticker-formatter')
      let _mmStick = new Sticker(_mmOut, { pack: global.packname || 'TOOSII-XD', author: global.authorname || 'Meme', type: StickerTypes.FULL, quality: 70 })
      await X.sendMessage(m.chat, { sticker: await _mmStick.toBuffer() }, { quoted: m })
    } else {
      await X.sendMessage(m.chat, { image: _mmOut, caption: '🎭 *Meme generated!*' }, { quoted: m })
    }
  } catch (e) {
    console.error('[MEME ERROR]', e.message)
    reply('❌ Meme generation failed: ' + e.message)
  }
}
break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Ai Features
case 'quantum-ai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '⚛️', key: m.key } })
    const result = await _runAI('You are Quantum AI, an advanced AI with deep analytical and quantum-level thinking capabilities. Provide thorough, intelligent, well-structured responses.', text)
    reply(result)
  } catch (e) {
    console.error('[QUANTUM-AI ERROR]', e.message)
    reply('❌ quantum-ai is currently unavailable. Please try again.')
  }
}
break
case 'chatai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '💬', key: m.key } })
    const result = await _runAI('You are ChatAI, a friendly and conversational AI assistant. Keep responses clear, helpful and natural.', text)
    reply(result)
  } catch (e) {
    console.error('[CHATAI ERROR]', e.message)
    reply('❌ chatai is currently unavailable. Please try again.')
  }
}
break;
case 'conciseai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🧠', key: m.key } })
    const result = await _runAI('You are ConciseAI, an AI that gives short, sharp, well-structured answers. Be brief but complete.', text)
    reply(result)
  } catch (e) {
    console.error('[CONCISEAI ERROR]', e.message)
    reply('❌ conciseai is currently unavailable. Please try again.')
  }
}
break;
case 'claudeai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '💎', key: m.key } })
    const result = await _runAI('You are Claude AI, an AI assistant made by Anthropic. You are helpful, harmless, and honest. Provide thoughtful and detailed responses.', text)
    reply(result)
  } catch (e) {
    console.error('[CLAUDEAI ERROR]', e.message)
    reply('❌ claudeai is currently unavailable. Please try again.')
  }
}
break
case 'venice': case 'veniceai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🎭', key: m.key } })
    const result = await _runAI('You are Venice AI, a private and uncensored AI assistant. Be helpful, creative and thorough.', text)
    reply(result)
  } catch (e) {
    console.error('[VENICE ERROR]', e.message)
    reply('❌ venice is currently unavailable. Please try again.')
  }
}
break
case 'logic-eai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🔣', key: m.key } })
    const result = await _runAI('You are Logic-E AI, a highly logical and reasoning-focused AI. Break down problems step by step with precise logic.', text)
    reply(result)
  } catch (e) {
    console.error('[LOGIC-EAI ERROR]', e.message)
    reply('❌ logic-eai is currently unavailable. Please try again.')
  }
}
break

case 'chatgpt':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
    const result = await _runAI('You are ChatGPT, a highly intelligent AI assistant by OpenAI. Be helpful, clear and concise.', text)
    reply(result)
  } catch (e) {
    console.error('[CHATGPT ERROR]', e.message)
    reply('❌ chatgpt is currently unavailable. Please try again.')
  }
}
break

case 'gpt41-mini':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '⚡', key: m.key } })
    const result = await _runAI('You are GPT-4.1 Mini, a fast and efficient AI assistant by OpenAI. Give concise but accurate answers.', text)
    reply(result)
  } catch (e) {
    console.error('[GPT41-MINI ERROR]', e.message)
    reply('❌ gpt41-mini is currently unavailable. Please try again.')
  }
}
break

case 'openai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
    const result = await _runAI('You are OpenAI GPT-4.1, a powerful AI assistant by OpenAI. Provide detailed, accurate and helpful responses.', text)
    reply(result)
  } catch (e) {
    console.error('[OPENAI ERROR]', e.message)
    reply('❌ openai is currently unavailable. Please try again.')
  }
}
break

case 'metaai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🔵', key: m.key } })
    const result = await _runAI('You are Meta AI, an intelligent and helpful AI assistant by Meta. Be friendly, informative and engaging.', text)
    reply(result)
  } catch (e) {
    console.error('[METAAI ERROR]', e.message)
    reply('❌ metaai is currently unavailable. Please try again.')
  }
}
break

case 'deepseek':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🔬', key: m.key } })
    const result = await _runAI('You are DeepSeek AI, a powerful AI specializing in deep reasoning, coding and technical analysis. Provide thorough technical responses.', text)
    reply(result)
  } catch (e) {
    console.error('[DEEPSEEK ERROR]', e.message)
    reply('❌ deepseek is currently unavailable. Please try again.')
  }
}
break

case 'gptlogic':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🧩', key: m.key } })
    const result = await _runAI('You are GPT Logic, a highly analytical AI. Answer questions with precise reasoning and logical structure.', text)
    reply(result)
  } catch (e) {
    console.error('[GPTLOGIC ERROR]', e.message)
    reply('❌ gptlogic is currently unavailable. Please try again.')
  }
}
break

case 'aoyoai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🌸', key: m.key } })
    const result = await _runAI('You are AoyoAI, a creative and helpful AI assistant. Be imaginative, warm and informative.', text)
    reply(result)
  } catch (e) {
    console.error('[AOYOAI ERROR]', e.message)
    reply('❌ aoyoai is currently unavailable. Please try again.')
  }
}
break

case 'blackbox-pro':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '⬛', key: m.key } })
    const result = await _runAI('You are Blackbox AI Pro, a specialized AI for coding and technical questions. Provide precise, working code solutions.', text)
    reply(result)
  } catch (e) {
    console.error('[BLACKBOX-PRO ERROR]', e.message)
    reply('❌ blackbox-pro is currently unavailable. Please try again.')
  }
}
break

case 'zerogpt':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🔲', key: m.key } })
    const result = await _runAI('You are ZeroGPT, an advanced AI assistant. Provide accurate and comprehensive answers on any topic.', text)
    reply(result)
  } catch (e) {
    console.error('[ZEROGPT ERROR]', e.message)
    reply('❌ zerogpt is currently unavailable. Please try again.')
  }
}
break

case 'yupraai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🌟', key: m.key } })
    const result = await _runAI('You are Yupra AI, a knowledgeable and helpful assistant. Be clear, accurate and thorough.', text)
    reply(result)
  } catch (e) {
    console.error('[YUPRAAI ERROR]', e.message)
    reply('❌ yupraai is currently unavailable. Please try again.')
  }
}
break

case 'feloai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🔭', key: m.key } })
    const result = await _runAI('You are Felo AI, a research-oriented AI assistant. Provide well-researched, in-depth answers.', text)
    reply(result)
  } catch (e) {
    console.error('[FELOAI ERROR]', e.message)
    reply('❌ feloai is currently unavailable. Please try again.')
  }
}
break

case 'chatevery-where':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '💬', key: m.key } })
    const result = await _runAI('You are ChatEveryWhere AI, a helpful AI available anywhere. Provide knowledgeable and friendly responses.', text)
    reply(result)
  } catch (e) {
    console.error('[CHATEVERY-WHERE ERROR]', e.message)
    reply('❌ chatevery-where is currently unavailable. Please try again.')
  }
}
break

case 'gpt-4o':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🧠', key: m.key } })
    const result = await _runAI('You are GPT-4o, a powerful and versatile AI by OpenAI. Provide detailed, accurate responses with rich understanding.', text)
    reply(result)
  } catch (e) {
    console.error('[GPT-4O ERROR]', e.message)
    reply('❌ gpt-4o is currently unavailable. Please try again.')
  }
}
break


case 'aliceai': {
  if (!text) return reply(`Example:\n${prefix+command} hello how are you?\n${prefix+command} generate an image of a sunset`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🤍', key: m.key } })
    let isImageReq = /(generate.*image|create.*image|make.*image|image of|picture of|draw)/i.test(text)
    if (isImageReq) {
      await reply('🎨 _Generating image, please wait..._')
      let seed = Math.floor(Math.random() * 999999)
      let imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`
      let imgBuffer = await getBuffer(imgUrl)
      if (!imgBuffer || imgBuffer.length < 5000) throw new Error('Image generation failed')
      await X.sendMessage(m.chat, { image: imgBuffer, caption: `🤍 *Alice AI:*\n\n_${text}_` }, { quoted: m })
    } else {
      const result = await _runAI('You are Alice AI, a warm, friendly and knowledgeable AI assistant. Be conversational, helpful and clear in your responses.', text)
      reply(result)
    }
  } catch (e) {
    console.error('[ALICEAI ERROR]', e.message)
    reply('❌ AliceAI is currently unavailable. Please try again.')
  }
}
break

case 'magicstudio':{
if (!text) return reply(`╔═════════╗\n║  ✨ *MAGIC STUDIO AI*\n╚═════════╝\n\n  Generate stunning AI images instantly.\n\n  └ *Usage:* ${prefix}magicstudio [description]\n\n  _Examples:_\n  • a woman in a red dress in Paris\n  • cyberpunk warrior with glowing sword\n  • magical forest with fairy lights`)
try {
await reply('✨ _Magic Studio is generating your image..._')
// Use pollinations with artistic model parameters for magic studio style
let enhancedPrompt = text + ', highly detailed, professional quality, vivid colors, artistic masterpiece'
let seed = Math.floor(Math.random() * 999999)
let imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`
let imgBuffer = await getBuffer(imgUrl)
if (!imgBuffer || imgBuffer.length < 5000) throw new Error('Generation failed')
let caption = `╔═════════╗\n║  ✨ *MAGIC STUDIO*\n╚═════════╝\n\n  ├ 📝 *Prompt* › ${text}\n  ├ 🌟 *Style*  › Magic Studio\n  └ 🎲 *Seed*   › ${seed}`
await X.sendMessage(m.chat, { image: imgBuffer, caption }, { quoted: m })
} catch(e) {
try {
let seed2 = Math.floor(Math.random() * 999999)
let fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text + ', professional, high quality')}?width=1024&height=1024&seed=${seed2}&nologo=true`
await X.sendMessage(m.chat, { image: { url: fallbackUrl }, caption: `✨ *Magic Studio:* ${text}` }, { quoted: m })
} catch(e2) { reply(`❌ *Magic Studio failed.*\n_${e2.message || 'Try again shortly.'}_`) }
}
}
break

case 'gemmaai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '💠', key: m.key } })
    const result = await _runAI('You are Gemma AI, a lightweight but powerful AI by Google. Provide clear and helpful responses.', text)
    reply(result)
  } catch (e) {
    console.error('[GEMMAAI ERROR]', e.message)
    reply('❌ gemmaai is currently unavailable. Please try again.')
  }
}
break
case 'aivelyn':
case 'velynai': {
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🌸', key: m.key } })
    const result = await _runAI('You are Velyn AI, a creative, friendly and helpful AI assistant. Provide engaging and informative responses.', text)
    reply(result)
  } catch (e) {
    console.error('[VELYNAI ERROR]', e.message)
    reply('❌ VelynAI is currently unavailable. Please try again.')
  }
}
break

case 'muslimprayer':
case 'islamprayer':
case 'prayermuslim': {
    await X.sendMessage(m.chat, { react: { text: '🕌', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _arg = (text || '').toLowerCase().trim()
    const _valid = ['on', 'off', 'dm', 'group', 'all', 'status']
    if (_arg === 'status' || !_arg) {
        const _cur = global.muslimPrayer || 'off'
        return reply(`╔═════════╗\n║  🕌 *MUSLIM PRAYER REMINDER*\n╚═════════╝\n\n  ├ 📊 *Status* › *${_cur.toUpperCase()}*\n\n  ├ ${prefix}muslimprayer on    — DM + groups\n  ├ ${prefix}muslimprayer dm    — DM only\n  ├ ${prefix}muslimprayer group — groups only\n  └ ${prefix}muslimprayer off   — disable`)
    }
    if (!_valid.includes(_arg)) return reply(`❌ Invalid. Use: on · off · dm · group · all`)
    global.muslimPrayer = _arg === 'on' ? 'all' : _arg
    const _labels = { all: '✅ ON (DM + Groups)', dm: '✅ ON (DM only)', group: '✅ ON (Groups only)', off: '❌ OFF' }
    reply(`🕌 *Muslim Prayer Reminder* › ${_labels[global.muslimPrayer]}`)
}
break

case 'christianprayer':
case 'devotion':
case 'prayerchristian': {
    await X.sendMessage(m.chat, { react: { text: '✝️', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _arg2 = (text || '').toLowerCase().trim()
    const _valid2 = ['on', 'off', 'dm', 'group', 'all', 'status']
    if (_arg2 === 'status' || !_arg2) {
        const _cur2 = global.christianDevotion || 'off'
        return reply(`╔═════════╗\n║  ✝️  *CHRISTIAN DEVOTION*\n╚═════════╝\n\n  ├ 📊 *Status* › *${_cur2.toUpperCase()}*\n\n  ├ ${prefix}christianprayer on    — DM + groups\n  ├ ${prefix}christianprayer dm    — DM only\n  ├ ${prefix}christianprayer group — groups only\n  └ ${prefix}christianprayer off   — disable`)
    }
    if (!_valid2.includes(_arg2)) return reply(`❌ Invalid. Use: on · off · dm · group · all`)
    global.christianDevotion = _arg2 === 'on' ? 'all' : _arg2
    const _labels2 = { all: '✅ ON (DM + Groups)', dm: '✅ ON (DM only)', group: '✅ ON (Groups only)', off: '❌ OFF' }
    reply(`✝️ *Christian Devotion* › ${_labels2[global.christianDevotion]}`)
}
break

case 'writecream': {
  if (!text) return reply(`╔═════════╗\n║  ✍️  *WRITECREAM AI*\n╚═════════╝\n\n  AI-powered content writer.\n\n  └ *Usage:* ${prefix}writecream [topic or instruction]\n\n  _Examples:_\n  • blog post about social media marketing\n  • product description for wireless earbuds\n  • email subject lines for a sale campaign\n  • Instagram caption for a sunset photo`)
  try {
    await X.sendMessage(m.chat, { react: { text: '✍️', key: m.key } })
    await reply('✍️ _WriteCream AI is writing your content..._')
    const result = await _runAI('You are WriteCream AI, a professional content writer and copywriter. Create engaging, well-structured, high-quality written content including blog posts, product descriptions, email copy, social media captions, ad headlines, and more. Match the tone and format to the request. Use clear structure with headings or bullet points where appropriate.', text)
    reply(`╔═════════╗\n║  ✍️  *WRITECREAM AI*\n╚═════════╝\n\n${result}`)
  } catch (e) {
    console.error('[WRITECREAM ERROR]', e.message)
    reply('❌ WriteCream AI is currently unavailable. Please try again.')
  }
}
break

case 'chatbotai': {
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
    const result = await _runAI('You are ChatbotAI, a friendly, intelligent and engaging conversational AI assistant. Have natural conversations, answer questions thoughtfully, and be helpful at all times.', text)
    reply(result)
  } catch (e) {
    console.error('[CHATBOTAI ERROR]', e.message)
    reply('❌ ChatbotAI is currently unavailable. Please try again.')
  }
}
break

case 'muslimai':{
  if (!text) return reply('Please enter your question?');
  try {
    const result = await muslimai(text);

    if (result.error) return reply(result.error);

    let sourcesText = result.sources.length > 0 
        ? result.sources.map((src, index) => `${index + 1}. *${src.title}*\n🔗 ${src.url}`).join("\n\n")
        : "No sources found.";

    let responseMessage = `ᴘᴏᴡᴇʀᴇᴅ ᴡɪᴛʜ ᴍᴜsʟɪᴍᴀɪ\n\n${result.answer}`;

    reply(responseMessage);
} catch (error) {
    console.error("⚠ *Error* :", error);
    reply("An error occurred.");
}
}
break;

case 'bible':
case 'verse':
case 'bibleverse': {
    await X.sendMessage(m.chat, { react: { text: '📖', key: m.key } })
    if (!text) {
        return reply(`╔═════════╗\n║  📖 *BIBLE SEARCH*\n╚═════════╝\n\n  Search any verse or topic.\n\n  *By reference:*\n  ├ ${prefix}bible John 3:16\n  ├ ${prefix}bible Romans 8:28\n  └ ${prefix}bible Psalm 23:1\n\n  *By topic/keyword:*\n  ├ ${prefix}bible love\n  ├ ${prefix}bible faith\n  └ ${prefix}bible strength`)
    }
    try {
        const isRef = /^[1-3]?\s?[a-zA-Z]+\s+\d+:\d+/i.test(text.trim())
        let verseText = '', reference = '', translation = 'KJV'

        if (isRef) {
            const _bRef = encodeURIComponent(text.trim())
            let _bRes = await fetch(`https://bible-api.com/${_bRef}?translation=kjv`)
            let _bData = await _bRes.json()
            if (_bData.error) {
                _bRes = await fetch(`https://bible-api.com/${_bRef}?translation=web`)
                _bData = await _bRes.json()
                if (_bData.error) return reply(`❌ *Verse not found:* _${text}_\n\n_Check spelling, e.g._ *John 3:16* _or_ *Psalm 23:1*`)
                translation = 'WEB'
            }
            verseText = _bData.text?.trim()
            reference = _bData.reference
        } else {
            const _aiRes = await fetch('https://text.pollinations.ai/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'openai', stream: false, max_tokens: 300,
                    messages: [
                        { role: 'system', content: 'You are a Bible scholar. When given a topic or keyword, respond with ONLY three lines: Line 1: the verse text. Line 2: the reference (e.g. John 3:16). Line 3: the translation (e.g. KJV). No extra text.' },
                        { role: 'user', content: `Give me a Bible verse about: ${text}` }
                    ]
                })
            })
            const _aiData = await _aiRes.json()
            const _aiLines = (_aiData.choices?.[0]?.message?.content || '').trim().split('\n').filter(Boolean)
            verseText = _aiLines[0] || ''
            reference = _aiLines[1] || `Topic: ${text}`
            translation = _aiLines[2] || 'KJV'
        }

        if (!verseText) return reply(`❌ Could not find a verse for: _${text}_`)

        reply(`╔═════════╗\n║  📖 *BIBLE VERSE*\n╚═════════╝\n\n  _❝ ${verseText} ❞_\n\n  ├ 📌 *${reference}*\n  └ 📚 *Translation* › ${translation}\n\n_⚡ TOOSII-XD ULTRA_`)

    } catch(e) {
        reply(`❌ *Bible search failed.*\n_${e.message || 'Please try again.'}_`)
    }
}
break;


case 'quran':
case 'ayah':
case 'quranverse': {
    await X.sendMessage(m.chat, { react: { text: '📿', key: m.key } })
    if (!text) {
        return reply(`╔═════════╗\n║  📿 *QURAN SEARCH*\n╚═════════╝\n\n  Search any ayah or topic.\n\n  *By reference (Surah:Ayah):*\n  ├ ${prefix}quran 2:255    (Ayatul Kursi)\n  ├ ${prefix}quran 1:1      (Al-Fatiha)\n  └ ${prefix}quran 112:1    (Al-Ikhlas)\n\n  *By topic/keyword:*\n  ├ ${prefix}quran patience\n  ├ ${prefix}quran mercy\n  └ ${prefix}quran paradise`)
    }
    try {
        const isRef = /^\d+:\d+$/.test(text.trim())
        let arabicText = '', englishText = '', reference = '', surahName = ''

        if (isRef) {
            const [surah, ayah] = text.trim().split(':')
            // Fetch Arabic text
            const _qAr = await fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.alafasy`)
            const _qArData = await _qAr.json()
            // Fetch English translation
            const _qEn = await fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/en.asad`)
            const _qEnData = await _qEn.json()

            if (_qArData.code !== 200) return reply(`❌ *Ayah not found:* _${text}_\n\n_Check format, e.g._ *2:255* _(Surah:Ayah)_`)

            arabicText = _qArData.data?.text || ''
            englishText = _qEnData.data?.text || ''
            surahName = _qArData.data?.surah?.englishName || ''
            const surahNameAr = _qArData.data?.surah?.name || ''
            reference = `${surahName} (${surahNameAr}) — ${surah}:${ayah}`
        } else {
            // Keyword search via AI
            const _aiRes = await fetch('https://text.pollinations.ai/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'openai', stream: false, max_tokens: 400,
                    messages: [
                        { role: 'system', content: 'You are a Quran scholar. When given a topic or keyword, respond with ONLY four lines: Line 1: the Arabic ayah text. Line 2: the English translation. Line 3: the reference (e.g. Al-Baqarah 2:155). Line 4: translator (e.g. Muhammad Asad). No extra text, no explanation.' },
                        { role: 'user', content: `Give me a Quran ayah about: ${text}` }
                    ]
                })
            })
            const _aiData = await _aiRes.json()
            const _aiLines = (_aiData.choices?.[0]?.message?.content || '').trim().split('\n').filter(Boolean)
            arabicText = _aiLines[0] || ''
            englishText = _aiLines[1] || ''
            reference = _aiLines[2] || `Topic: ${text}`
            surahName = _aiLines[3] || 'Muhammad Asad'
        }

        if (!englishText && !arabicText) return reply(`❌ Could not find an ayah for: _${text}_`)

        let msg = `╔═════════╗\n║  📿 *QURAN AYAH*\n╚═════════╝\n\n`
        if (arabicText) msg += `  *${arabicText}*\n\n`
        if (englishText) msg += `  _❝ ${englishText} ❞_\n\n`
        msg += `  ├ 📌 *${reference}*\n`
        msg += `  └ 📚 *Translator* › ${isRef ? 'Muhammad Asad' : surahName}\n\n`
        msg += `_⚡ TOOSII-XD ULTRA_`

        reply(msg)

    } catch(e) {
        reply(`❌ *Quran search failed.*\n_${e.message || 'Please try again.'}_`)
    }
}
break;


case 'llama-ai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🦙', key: m.key } })
    const result = await _runAI('You are LLaMA AI, a powerful open-source AI model by Meta. Be helpful, accurate and conversational.', text)
    reply(result)
  } catch (e) {
    console.error('[LLAMA-AI ERROR]', e.message)
    reply('❌ llama-ai is currently unavailable. Please try again.')
  }
}
break

case 'gptturbo':{
if (!text) return reply(`Example:\n${prefix}${command} Hello?`);
try {
  await X.sendMessage(m.chat, { react: { text: '⚡', key: m.key } })
  const result = await _runAI('You are GPT Turbo, a fast and intelligent AI assistant. Provide clear, helpful responses.', text)
  let turbo = `Title : ${text}\n\nMessage : ${result}\n`
  await X.sendMessage(m.chat, { text: '⬣───「 *G P T T U R B O* 」───⬣\n\n' + turbo }, { quoted: m })
} catch (e) { reply('❌ gptturbo is currently unavailable. Please try again.') }
}
break

case 'gemini-ai':{
    const isQuotedImage = m.quoted && m.quoted.mtype === 'imageMessage'
    const isImage = m.mtype === 'imageMessage'
    const quoted = m.quoted ? m.quoted : m
    await X.sendMessage(m.chat, { react: { text: '✨', key: m.key } })

    if (isImage || isQuotedImage) {
        try {
            const question = text || 'What is in this image? Describe it in detail.'
            await reply('🔍 _Analysing image with Gemini AI, please wait..._')
            let imgBuffer = await quoted.download()
            if (!imgBuffer || imgBuffer.length < 100) throw new Error('Failed to download image')
            let b64 = imgBuffer.toString('base64')
            let mime = quoted.mimetype || 'image/jpeg'
            let { data: vd } = await axios.post('https://text.pollinations.ai/openai', {
                model: 'openai',
                messages: [{ role: 'user', content: [
                    { type: 'text', text: question },
                    { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }
                ]}],
                max_tokens: 1000,
                stream: false
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 45000 })
            const description = vd?.choices?.[0]?.message?.content
            if (!description) throw new Error('No response from vision API')
            await X.sendMessage(m.chat, { text: `✨ *Gemini AI Vision:*\n\n${description}` }, { quoted: m })
        } catch (error) {
            console.error('[GEMINI-AI VISION ERROR]', error.message)
            await X.sendMessage(m.chat, { text: '❌ *Image analysis failed.* Please try again.' }, { quoted: m })
        }
    } else {
        try {
            if (!text) return reply(`Example: ${prefix+command} Who is Elon Musk`)
            const result = await _runAI('You are Gemini AI, a powerful and intelligent AI assistant by Google. Provide detailed, accurate, and well-structured answers.', text)
            await X.sendMessage(m.chat, { text: `✨ *Gemini AI:*\n\n${result}` }, { quoted: m })
        } catch (error) {
            console.error('[GEMINI-AI ERROR]', error.message)
            await X.sendMessage(m.chat, { text: '❌ *Gemini AI is currently unavailable.* Please try again.' }, { quoted: m })
        }
    }
}
break

case 'lumin-ai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '💡', key: m.key } })
    const result = await _runAI('You are Lumin AI, a bright and insightful AI assistant. Provide illuminating and clear answers.', text)
    reply(result)
  } catch (e) {
    console.error('[LUMIN-AI ERROR]', e.message)
    reply('❌ lumin-ai is currently unavailable. Please try again.')
  }
}
break

case 'typli-ai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '✍️', key: m.key } })
    const result = await _runAI('You are Typli AI, a versatile AI writing assistant. Help with writing, editing and creative content.', text)
    reply(result)
  } catch (e) {
    console.error('[TYPLI-AI ERROR]', e.message)
    reply('❌ typli-ai is currently unavailable. Please try again.')
  }
}
break;

case 'poly-ai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🌐', key: m.key } })
    const result = await _runAI('You are Poly AI, a conversational AI assistant. Be engaging, friendly and informative.', text)
    reply(result)
  } catch (e) {
    console.error('[POLY-AI ERROR]', e.message)
    reply('❌ poly-ai is currently unavailable. Please try again.')
  }
}
break

case 'gemini-pro':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🌟', key: m.key } })
    const result = await _runAI('You are Gemini Pro, a powerful AI assistant by Google. Provide comprehensive and accurate answers.', text)
    reply(result)
  } catch (e) {
    console.error('[GEMINI-PRO ERROR]', e.message)
    reply('❌ gemini-pro is currently unavailable. Please try again.')
  }
}
break;
case 'tebak': {
    await X.sendMessage(m.chat, { react: { text: '🧩', key: m.key } })
  const quizPath = './database/tebakgame.json';
  if (!fs.existsSync(quizPath)) return reply('⚠️ Quiz data file not found.');

  const data = JSON.parse(fs.readFileSync(quizPath));
  const kategoriUnik = [...new Set(data.map(item => item.kategori))];

  const kategori = args[0]?.toLowerCase();
  if (!kategori) {
    const daftar = kategoriUnik.join(', ');
    return reply(`📚 Usage: .tebak [category]\nExample: .tebak lagu\n\nAvailable categories:\n${daftar}`);
  }

  if (!kategoriUnik.includes(kategori)) {
    return reply(`❌ Kategori "${kategori}" not found.\nAvailable categories: ${kategoriUnik.join(', ')}`);
  }
  const soalKategori = data.filter(item => item.kategori === kategori);
  const soal = soalKategori[Math.floor(Math.random() * soalKategori.length)];

  if (!global.tebakGame) global.tebakGame = {};
  if (global.tebakGame[m.sender]) {
    return reply('⚠️ You still have an unanswered question! Answer it or type giveup first.');
  }

  global.tebakGame[m.sender] = {
    jawaban: soal.jawaban,
    soal: soal.soal,
    petunjuk: soal.petunjuk || 'No hint available',
    timeout: setTimeout(() => {
      if (global.tebakGame[m.sender]) {
        reply(`⏰ Time is up!\nThe correct answer is:\n✅ *${global.tebakGame[m.sender].jawaban}*`);
        delete global.tebakGame[m.sender];
      }
    }, 60000) // 60 detik
  };

  return reply(`╔═════════╗\n║  🧠 *GUESS THE ${kategori.toUpperCase()}*\n╚═════════╝\n\n  ${soal.soal}\n\n  ⏱️ *60 seconds* — reply to answer!`);
}
break;
//━━━━━━━━━━━━━━━━━━━━━━━━//
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Info Bot             
case 'debugrole': {
    await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
    if (!isOwner) return reply('Owner only.')
    let dbgMsg = `*🔍 ROLE DEBUG INFO*\n\n`
    dbgMsg += `*Bot Identity:*\n`
    dbgMsg += `• X.user.id: ${X.user?.id || 'null'}\n`
    dbgMsg += `• X.user.lid: ${X.user?.lid || 'null'}\n`
    dbgMsg += `• botJid (decoded): ${botJid}\n`
    dbgMsg += `• botLid (decoded): ${botLid || 'null'}\n\n`
    dbgMsg += `*Sender Identity:*\n`
    dbgMsg += `• m.sender: ${m.sender}\n`
    dbgMsg += `• m.key.participant: ${m.key?.participant || 'null'}\n`
    dbgMsg += `• senderFromKey: ${senderFromKey || 'null'}\n\n`
    dbgMsg += `*Role Results:*\n`
    dbgMsg += `• isGroup: ${isGroup}\n`
    dbgMsg += `• isOwner: ${isOwner}\n`
    dbgMsg += `• isAdmins: ${isAdmins}\n`
    dbgMsg += `• isBotAdmins: ${isBotAdmins}\n`
    dbgMsg += `• isSuperAdmin: ${isSuperAdmin}\n\n`
    if (isGroup && participants) {
        dbgMsg += `*Admin Participants:*\n`
        participants.filter(p => p.admin).forEach(p => {
            let matchBot = isParticipantBot(p)
            let matchSender = isParticipantSender(p)
            dbgMsg += `• ${p.id}\n`
            dbgMsg += `  role: ${p.admin} | isBot: ${matchBot} | isSender: ${matchSender}\n`
            dbgMsg += `  sameAsUserId: ${isSameUser(p.id, X.user.id)} | sameAsLid: ${X.user?.lid ? isSameUser(p.id, X.user.lid) : 'no lid'}\n`
        })
    }
    reply(dbgMsg)
}
break;

case 'p':
case 'ping':
case 'info':
case 'storage':
case 'server':
case 'srvinfo': {
    await X.sendMessage(m.chat, { react: { text: command === 'ping' ? '🏓' : '🖥️', key: m.key } })
  const _pingStart = Date.now()

  function formatp(bytes) {
    if (bytes < 1024) return `${bytes} B`
    const kb = bytes / 1024
    if (kb < 1024) return `${kb.toFixed(2)} KB`
    const mb = kb / 1024
    if (mb < 1024) return `${mb.toFixed(2)} MB`
    const gb = mb / 1024
    return `${gb.toFixed(2)} GB`
  }

async function getServerInfo() {
  const start = Date.now()

  const osType = os.type()
  const release = os.release()
  const arch = os.arch()
  const nodeVersion = process.version
  const platform = os.platform()

  const cpus = os.cpus()
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown'
  const coreCount = cpus.length
  let cpuUsage = '0%'
  if (cpus.length > 0) {
    const cpu = cpus.reduce((acc, c) => {
      acc.total += Object.values(c.times).reduce((a, b) => a + b, 0)
      acc.user += c.times.user
      acc.sys += c.times.sys
      acc.speed += c.speed
      return acc
    }, { speed: 0, total: 0, user: 0, sys: 0 })
    cpuUsage = ((cpu.user + cpu.sys) / cpu.total * 100).toFixed(2) + '%'
  }
  const loadAverage = os.loadavg().map(l => l.toFixed(2))
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem

  let storageText = ''
  try {
    const storageInfo = await nou.drive.info()
    if (storageInfo && storageInfo.totalGb) {
      storageText = `\n*STORAGE*\n• Total: ${storageInfo.totalGb} GB\n• Used: ${storageInfo.usedGb} GB (${storageInfo.usedPercentage}%)\n• Available: ${storageInfo.freeGb} GB (${storageInfo.freePercentage}%)`
    }
  } catch(e) {}

  const latensi = (Date.now() - start)

  const responseText = `╔═════════╗
║ 🤖 *${global.botname || 'TOOSII-XD ULTRA'}*
╚═════════╝
├◈ 🟢 *Bot uptime*    › ${runtime(process.uptime())}
├◈ 🖥️  *Server uptime* › ${runtime(os.uptime())}

├◈ 🔧 *OS*      › ${osType} (${arch})
├◈ 🟩 *Node.js* › ${nodeVersion}
├◈ 💎 *CPU*     › ${cpuModel}
├◈ ⚙️  *Cores*   › ${coreCount}  📊 *Load* › ${cpuUsage}

├◈ 📦 *RAM Total* › ${formatp(totalMem)}
├◈ 🔴 *RAM Used*  › ${formatp(usedMem)}
└◈ 🟢 *RAM Free*  › ${formatp(freeMem)}${storageText ? `

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
💿 *Storage*
${storageText.replace(/\*STORAGE\*\n/,'').replace(/• /g,'  ├ ')}` : ''}

_⚡ Powered by ${global.ownername || 'Toosii Tech'}_`
    return responseText.trim()
}

if (command === 'ping' || command === 'p') {
    const _t = Date.now()
    const _sent = await X.sendMessage(m.chat, { text: `╔═════════╗\n║  ⚡ *PONG!*  🏓\n╚═════════╝` }, { quoted: m })
    const _ms = Date.now() - _t
    await X.sendMessage(m.chat, { text: `╔═════════╗\n║  ⚡ *PONG!*  📡 *${_ms}ms*\n╚═════════╝`, edit: _sent.key })
} else {
  const responseText = await getServerInfo()
  await X.sendMessage(m.chat, { text: responseText }, { quoted: m })
}
}
break           

case 'totalfitur':{
reply(`╔═════════╗\n║  📋 *TOTAL COMMANDS*\n╚═════════╝\n\n  └ *${totalfitur()}* commands available`)
}
break   
//━━━━━━━━━━━━━━━━━━━━━━━━//
// OWNER MENU COMMANDS
// autotyping handled above (case 'autotyping'/'faketyping'/'faketype'/'ftype')

case 'autoreact': {
    await X.sendMessage(m.chat, { react: { text: '👍', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let arArg = (args[0] || '').toLowerCase()
if (!arArg) { reply(`*Auto React: ${global.autoReact ? 'ON' : 'OFF'}*\nEmoji: ${global.autoReactEmoji || '👍'}\nUsage: ${prefix}autoreact on/off\n${prefix}autoreact [emoji]`) }
else if (arArg === 'on') { global.autoReact = true; reply('*Auto React ON*') }
else if (arArg === 'off') { global.autoReact = false; reply('*Auto React OFF*') }
else { global.autoReact = true; global.autoReactEmoji = arArg; reply(`✅ *Auto React ON* › emoji: ${arArg}`) }
} break

case 'pmblocker': {
    await X.sendMessage(m.chat, { react: { text: '🚫', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let pbArg = (args[0] || '').toLowerCase()
if (pbArg === 'on') { global.pmBlocker = true; reply('*PM Blocker ON*\nNon-owner PMs will be auto-blocked.') }
else if (pbArg === 'off') { global.pmBlocker = false; reply('*PM Blocker OFF*') }
else reply(`*PM Blocker: ${global.pmBlocker ? 'ON' : 'OFF'}*\nUsage: ${prefix}pmblocker on/off`)
} break

case 'block': {
      await X.sendMessage(m.chat, { react: { text: '🚫', key: m.key } })
      if (!isOwner) return reply(mess.OnlyOwner)
      const _normJ = (j) => (j || '').split(':')[0].split('@')[0]
      const _blkIsPhone = text && /^\d{6,15}$/.test(text.replace(/[^0-9]/g, ''))
      let _blkRaw = _blkIsPhone
          ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
          : (m.mentionedJid && m.mentionedJid[0])
              ? m.mentionedJid[0]
              : m.quoted ? (m.quoted.sender || m.quoted.key?.participant)
              : null
      if (!_blkRaw) return reply(`╔═════════╗\n║  🚫 *BLOCK USER*\n╚═════════╝\n\n  ❌ *No target!*\n  └ Tag a user, reply to their message,\n     or provide their number.\n\n  📌 *Usage:* ${prefix}block @user | number`)
      // If LID → try resolving to real JID via contacts/participants
      if (_blkRaw.endsWith('@lid')) {
          const _lidKey = _normJ(_blkRaw)
          let _res = null
          if (!_res && m.isGroup && participants) {
              const p = participants.find(p => p.id && !p.id.endsWith('@lid') && p.lid && _normJ(p.lid) === _lidKey)
              if (p) _res = p.id
          }
          if (!_res && store?.contacts) {
              for (const [jid, c] of Object.entries(store.contacts)) {
                  if (jid.endsWith('@s.whatsapp.net') && c?.lid && _normJ(c.lid) === _lidKey) { _res = jid; break }
                  if (jid.endsWith('@lid') && _normJ(jid) === _lidKey && c?.phone) { _res = c.phone.replace(/[^0-9]/g,'') + '@s.whatsapp.net'; break }
              }
          }
          if (!_res && m.quoted?.id) {
              try {
                  const _qm = await store.loadMessage(m.chat, m.quoted.id, X)
                  const _rp = _qm?.key?.participant || _qm?.participant
                  if (_rp && !_rp.endsWith('@lid')) _res = _rp
              } catch {}
          }
          if (_res) _blkRaw = _res
          else return reply(`❌ Cannot identify this user's number.\nUse: ${prefix}block 254xxxxxxxxx`)
      }
      const _blkPhone = _normJ(_blkRaw)
      if (ownerNums.some(o => _blkPhone === o) || _blkPhone === botNum) return reply('🛡️ Cannot block the bot owner.')
      // Query WhatsApp for this number to get the correct JID and LID
      let _blkJid = _blkPhone + '@s.whatsapp.net'
      let _blkLid = null
      try {
          const _wa = await X.onWhatsApp(_blkPhone)
          if (_wa && _wa[0]) { _blkJid = _wa[0].jid || _blkJid; _blkLid = _wa[0].lid || null }
      } catch {}
      // Fetch current blocklist
    let _currentBL = []
    try { _currentBL = await X.fetchBlocklist() } catch {}
    const _alreadyBlocked = _currentBL.some(j => j.includes(_blkPhone) || (_blkLid && j.includes(_blkLid.split('@')[0])))
    if (_alreadyBlocked) return reply(`╔═════════╗\n║  🚫 *BLOCK USER*\n╚═════════╝\n\n  ⚠️ Already blocked\n  └ +${_blkPhone} is already on your block list.`)
    const _blkJidToUse = _blkLid || _blkJid
    let _blkOk = false, _blkLastErr = ''
    // Strategy 1: wrap item in <list> node (matches fetchBlocklist response format)
    try {
        await X.query({ tag: 'iq', attrs: { xmlns: 'blocklist', to: 's.whatsapp.net', type: 'set' }, content: [{ tag: 'list', attrs: {}, content: [{ tag: 'item', attrs: { action: 'block', jid: _blkJidToUse } }] }] })
        _blkOk = true
    } catch(e) { _blkLastErr = 'list+lid:' + e.message }
    // Strategy 2: same but with real JID
    if (!_blkOk) { try {
        await X.query({ tag: 'iq', attrs: { xmlns: 'blocklist', to: 's.whatsapp.net', type: 'set' }, content: [{ tag: 'list', attrs: {}, content: [{ tag: 'item', attrs: { action: 'block', jid: _blkJid } }] }] })
        _blkOk = true
    } catch(e) { _blkLastErr += ' | list+jid:' + e.message } }
    // Strategy 3: original updateBlockStatus
    if (!_blkOk) { try { await X.updateBlockStatus(_blkJidToUse, 'block'); _blkOk = true } catch(e) { _blkLastErr += ' | ubs:' + e.message } }
    if (_blkOk) {
        reply(`╔═════════╗\n║  🚫 *BLOCK USER*\n╚═════════╝\n\n  ✅ *Blocked*\n  └ +${_blkPhone} has been blocked.`)
    } else {
        reply(`❌ debug: ${_blkLastErr}`)
    }
  } break

case 'unblock': {
      await X.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
      if (!isOwner) return reply(mess.OnlyOwner)
      const _normU = (j) => (j || '').split(':')[0].split('@')[0]
      const _ublkIsPhone = text && /^\d{6,15}$/.test(text.replace(/[^0-9]/g, ''))
      let _ublkRaw = _ublkIsPhone
          ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
          : (m.mentionedJid && m.mentionedJid[0])
              ? m.mentionedJid[0]
              : m.quoted ? (m.quoted.sender || m.quoted.key?.participant)
              : null
      if (!_ublkRaw) return reply(`╔═════════╗\n║  ✅ *UNBLOCK USER*\n╚═════════╝\n\n  ❌ *No target!*\n  └ Tag a user, reply to their message,\n     or provide their number.\n\n  📌 *Usage:* ${prefix}unblock @user | number`)
      if (_ublkRaw.endsWith('@lid')) {
          const _lidKey = _normU(_ublkRaw)
          let _res = null
          if (!_res && m.isGroup && participants) {
              const p = participants.find(p => p.id && !p.id.endsWith('@lid') && p.lid && _normU(p.lid) === _lidKey)
              if (p) _res = p.id
          }
          if (!_res && store?.contacts) {
              for (const [jid, c] of Object.entries(store.contacts)) {
                  if (jid.endsWith('@s.whatsapp.net') && c?.lid && _normU(c.lid) === _lidKey) { _res = jid; break }
                  if (jid.endsWith('@lid') && _normU(jid) === _lidKey && c?.phone) { _res = c.phone.replace(/[^0-9]/g,'') + '@s.whatsapp.net'; break }
              }
          }
          if (!_res && m.quoted?.id) {
              try {
                  const _qm = await store.loadMessage(m.chat, m.quoted.id, X)
                  const _rp = _qm?.key?.participant || _qm?.participant
                  if (_rp && !_rp.endsWith('@lid')) _res = _rp
              } catch {}
          }
          if (_res) _ublkRaw = _res
          else return reply(`❌ Cannot identify this user's number.\nUse: ${prefix}unblock 254xxxxxxxxx`)
      }
      const _ublkPhone = _normU(_ublkRaw)
      let _ublkJid = _ublkPhone + '@s.whatsapp.net'
      let _ublkLid = null
      try {
          const _wa = await X.onWhatsApp(_ublkPhone)
          if (_wa && _wa[0]) { _ublkJid = _wa[0].jid || _ublkJid; _ublkLid = _wa[0].lid || null }
      } catch {}
      let _ublkOk = false
      if (_ublkLid) { try { await X.updateBlockStatus(_ublkLid, 'unblock'); _ublkOk = true } catch {} }
      if (!_ublkOk) { try { await X.updateBlockStatus(_ublkJid, 'unblock'); _ublkOk = true } catch {} }
      if (_ublkOk) {
          reply(`╔═════════╗\n║  ✅ *UNBLOCK USER*\n╚═════════╝\n\n  ✅ *Unblocked*\n  └ +${_ublkPhone} has been unblocked.`)
      } else {
          reply(`❌ Failed to unblock +${_ublkPhone}.\nTry: ${prefix}unblock 254xxxxxxxxx with their number.`)
      }
  } break

case 'blocklist': {
    await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    try {
        const _blist = await X.fetchBlocklist()
        if (!_blist || !_blist.length) return reply(`╔═════════╗\n║  📋 *BLOCK LIST*\n╚═════════╝\n\n  ✅ No blocked contacts.`)
        const _blines = _blist.map((j, idx) => `  ${idx + 1}. +${j.split('@')[0]}`).join('\n')
        reply(`╔═════════╗\n║  📋 *BLOCK LIST*\n╚═════════╝\n\n  Total: ${_blist.length} blocked\n\n${_blines}`)
    } catch (e) {
        reply('❌ Failed to fetch block list: ' + (e.message || 'Unknown error'))
    }
} break

case 'pp':
case 'getpp': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
// Get profile picture of sender, mentioned user, quoted user, or bot itself
try {
let target, label
// Resolve JID to real phone number — handles normal JIDs and Baileys LID JIDs
const _ppNum = (jid) => {
    if (!jid) return 'Unknown'
    const raw = jid.split('@')[0].split(':')[0]
    // LID JIDs are very long numbers (>13 digits) — not real phone numbers
    if (raw.length > 15) return 'Unknown'
    return '+' + raw
}
const _ppLabel = async (jid) => {
    if (!jid) return 'Unknown'
    // If it's a LID JID (@lid), try to look up the real phone via onWhatsApp
    const isLid = jid.endsWith('@lid')
    if (isLid) {
        try {
            // Try to get real number from group participant list if in a group
            if (m.isGroup && participants) {
                const match = participants.find(p => p.id && p.id.includes(jid.split('@')[0]))
                if (match && match.id && !match.id.endsWith('@lid')) {
                    const num = '+' + match.id.split('@')[0]
                    return num
                }
            }
        } catch {}
        return 'Unknown'
    }
    const num = _ppNum(jid)
    try {
        const info = await X.onWhatsApp(jid.split('@')[0])
        const name = (info && info[0] && info[0].notify) ? info[0].notify : null
        return name ? `${name} (${num})` : num
    } catch { return num }
}
// Prefer real phone JID over LID JID
const _resolveTarget = (jid) => {
    if (!jid) return null
    if (jid.endsWith('@lid') && m.isGroup && participants) {
        const lidNum = jid.split('@')[0]
        const real = participants.find(p => p.id && !p.id.endsWith('@lid') && p.lid && p.lid.includes(lidNum))
        if (real) return real.id
    }
    return jid
}
if (m.mentionedJid && m.mentionedJid[0]) {
    target = _resolveTarget(m.mentionedJid[0])
    label = await _ppLabel(target)
} else if (m.quoted) {
    const rawTarget = m.quoted.sender || m.quoted.participant || m.quoted.key?.participant
    target = _resolveTarget(rawTarget)
    label = target ? await _ppLabel(target) : 'Unknown'
} else if (text && /^[0-9]+$/.test(text.replace(/[^0-9]/g,''))) {
    target = text.replace(/[^0-9]/g,'') + '@s.whatsapp.net'
    label = await _ppLabel(target)
} else {
    target = m.sender
    label = await _ppLabel(target)
}
if (!target) target = m.sender
let ppUrl = null
try { ppUrl = await X.profilePictureUrl(target, 'image') } catch {}
if (!ppUrl) {
    return reply(`╔═════════╗\n║  🖼️  *PROFILE PICTURE*\n╚═════════╝\n\n  ❌ *No profile picture for ${label}*\n  _Privacy restrictions or not on WhatsApp._`)
}
let ppBuf = await getBuffer(ppUrl)
if (!ppBuf || ppBuf.length < 100) throw new Error('Failed to download picture')
await X.sendMessage(m.chat, {
    image: ppBuf,
    caption: `╔═════════╗\n║  🖼️  *PROFILE PICTURE*\n╚═════════╝\n\n  └ 👤 *User* › ${label}`
}, { quoted: m })
} catch(e) {
reply(`❌ *Failed to fetch profile picture.*
_${e.message || 'User may have privacy restrictions.'}_`)
}
} break

case 'setpp': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
if (!m.quoted || !/image/.test(m.quoted.mimetype || '')) return reply(`╔═════════╗\n║  🖼️  *SET BOT PROFILE PIC*\n╚═════════╝\n\n  └ Reply to an image with *${prefix}setpp*\n  _Image will be set as the bot profile picture._`)
try {
let imgBuf = await m.quoted.download()
if (!imgBuf || imgBuf.length < 100) throw new Error('Failed to download image')
await X.updateProfilePicture(X.user.id, imgBuf)
reply(`╔═════════╗\n║  🖼️  *PROFILE PIC UPDATED*\n╚═════════╝\n\n  ✅ Bot profile picture updated successfully.\n  _Changes may take a moment to appear._`)
} catch(e) {
let errMsg = (e?.message || '').toLowerCase()
if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
else reply(`❌ *Failed to update profile picture.*
_${e.message || 'Unknown error'}_`)
}
} break

case 'clearsession': {
    await X.sendMessage(m.chat, { react: { text: '🗑️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
try {
const sessPath = path.join(__dirname, 'sessions')
if (fs.existsSync(sessPath)) {
let files = fs.readdirSync(sessPath).filter(f => f !== 'creds.json' && !f.includes('creds'))
let count = 0
for (let f of files) { try { fs.unlinkSync(path.join(sessPath, f)); count++ } catch {} }
reply(`✅ *${count} session files* cleared.`)
} else reply('No sessions directory found.')
} catch(e) { reply('Error: ' + e.message) }
} break

case 'cleartmp': {
    await X.sendMessage(m.chat, { react: { text: '🗑️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
try {
const tmpPath = path.join(__dirname, 'tmp')
if (fs.existsSync(tmpPath)) {
let files = fs.readdirSync(tmpPath)
for (let f of files) { try { fs.unlinkSync(path.join(tmpPath, f)) } catch {} }
reply(`✅ *${files.length} temp files* cleared.`)
} else reply('No tmp directory found.')
} catch(e) { reply('Error: ' + e.message) }
} break

case 'sudo': {
    await X.sendMessage(m.chat, { react: { text: '👑', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let sudoNum = (args[0] || '').replace(/[^0-9]/g, '')
if (!sudoNum) return reply(`*Sudo Users:* ${global.owner.join(', ')}\n\nUsage:\n${prefix}sudo add [number]\n${prefix}sudo remove [number]`)
let sudoAction = args[0]?.toLowerCase()
if (sudoAction === 'add' && args[1]) {
let num = args[1].replace(/[^0-9]/g, '')
if (!global.owner.includes(num)) { global.owner.push(num); reply(`✅ *${num}* added as sudo user.`) }
else reply('Already a sudo user.')
} else if (sudoAction === 'remove' || sudoAction === 'del') {
let num = (args[1] || '').replace(/[^0-9]/g, '')
if (num === global._protectedOwner) return reply('Cannot remove the primary owner.')
global.owner = global.owner.filter(o => o !== num)
reply(`✅ *${num}* removed from sudo users.`)
} else reply(`Usage: ${prefix}sudo add/remove [number]`)
} break

case 'setowner': {
    await X.sendMessage(m.chat, { react: { text: '👑', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newOwner = (args[0] || '').replace(/[^0-9]/g, '')
if (!newOwner) return reply(`*Current Owner Number:* ${global.ownerNumber}\nUsage: ${prefix}setowner [number]`)
global.ownerNumber = newOwner
if (!global.owner.includes(newOwner)) global.owner.push(newOwner)
reply(`✅ *Owner updated* › ${newOwner}`)
} break

case 'setmenu': {
    await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
reply('*Menu Categories:*\nai, tools, owner, group, downloader, search, sticker, games, other, fun, anime, textmaker, imgedit, github, converter\n\nUse .menu [category] to view specific menus.')
} break

case 'menuimage': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
if (m.quoted && /image/.test(m.quoted.mimetype || '')) {
try {
let media = await X.downloadAndSaveMediaMessage(m.quoted, 'menu_thumb')
global.menuThumb = media
reply('*Menu image updated!*')
} catch(e) { reply('Error: ' + e.message) }
} else if (args[0]) {
global.menuThumb = args[0]
reply(`✅ *Menu image URL set.*`)
} else reply(`Reply to an image or provide URL: ${prefix}menuimage [url]`)
} break

case 'configimage': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
reply(`*Image Config:*\nMenu Thumb: ${global.menuThumb || global.thumb}\nBot Pic: ${global.botPic || 'Default'}\n\nUse ${prefix}menuimage to change menu image\nUse ${prefix}botpic to change bot picture`)
} break

case 'mode': {
    await X.sendMessage(m.chat, { react: { text: '⚙️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let modeArg = (args[0] || '').toLowerCase()
if (modeArg === 'public') {
    X.public = true
    reply(`╔═════════╗\n║  🌐 *BOT MODE: PUBLIC*\n╚═════════╝\n\n  ✅ Everyone can use bot commands.`)
} else if (modeArg === 'private' || modeArg === 'self') {
    X.public = false
    reply(`╔═════════╗\n║  🔒 *BOT MODE: PRIVATE*\n╚═════════╝\n\n  🚫 Only the owner can use commands.`)
} else {
    let currentMode = X.public !== false ? 'PUBLIC ✅' : 'PRIVATE 🔒'
    reply(`╔═════════╗\n║  ⚙️  *BOT MODE*\n╚═════════╝\n\n  ├ 📊 *Current* › ${currentMode}\n  ├ ${prefix}mode public  — all users\n  └ ${prefix}mode private — owner only`)
}
} break

// GROUP ADMIN COMMANDS
case 'mute': {
    await X.sendMessage(m.chat, { react: { text: '🔇', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
if (!isBotAdmins) return reply(mess.botAdmin)
try {
await X.groupSettingUpdate(m.chat, 'announcement')
reply('🔇 *Group muted.* Only admins can send messages.')
} catch(err) {
let errMsg = (err?.message || '').toLowerCase()
if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
else reply(mess.error)
}
} break

case 'unmute': {
    await X.sendMessage(m.chat, { react: { text: '🔊', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
if (!isBotAdmins) return reply(mess.botAdmin)
try {
await X.groupSettingUpdate(m.chat, 'not_announcement')
reply('🔊 *Group unmuted.* Everyone can send messages.')
} catch(err) {
let errMsg = (err?.message || '').toLowerCase()
if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
else reply(mess.error)
}
} break

case 'ban': {
    await X.sendMessage(m.chat, { react: { text: '🚫', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let banUser = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null
if (!banUser) return reply(`📌 *Usage:* ${prefix}ban @user`)
let isBanOwner = owner.some(o => banUser.includes(o)) || (typeof X.areJidsSameUser === 'function' && owner.some(o => X.areJidsSameUser(banUser, o + '@s.whatsapp.net')))
if (isBanOwner) return reply('🛡️ Cannot ban the bot owner.')
let banUsers = loadUsers()
if (!banUsers[banUser]) banUsers[banUser] = { name: banUser.split('@')[0], firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), commandCount: 0, commands: {} }
banUsers[banUser].banned = true
saveUsers(banUsers)
X.sendMessage(from, { text: `🚫 *@${banUser.split('@')[0]} has been banned from using the bot.*`, mentions: [banUser] }, { quoted: m })
} break

case 'unban': {
    await X.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let unbanUser = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null
if (!unbanUser) return reply(`📌 *Usage:* ${prefix}unban @user`)
let usersDb = loadUsers()
if (usersDb[unbanUser]) { usersDb[unbanUser].banned = false; saveUsers(usersDb) }
X.sendMessage(from, { text: `✅ *@${unbanUser.split('@')[0]} has been unbanned.*`, mentions: [unbanUser] }, { quoted: m })
} break

case 'antisocialgames':
case 'antisgames': {
    await X.sendMessage(m.chat, { react: { text: '🎭', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)
    if (!global.antiSocialGames) global.antiSocialGames = {}
    const _asgArg = (args[0] || '').toLowerCase()
    if (!_asgArg || _asgArg === 'status') {
        const _on = global.antiSocialGames[m.chat] ? '✅ ON' : '❌ OFF'
        return reply(`╔═════════╗\n║  🎭 *ANTI SOCIAL GAMES*\n╚═════════╝\n\n  ├ 📊 *Status* › *${_on}*\n\n  _When ON, blocks:_\n  ├◈  \`.vibe\`  ├◈  \`.rizz\`   ├◈  \`.iq\n\`  ├◈  \`.ship\`  ├◈  \`.simp\`   ├◈  \`.wasted\n\`  ├◈  \`.truth\` ├◈  \`.dare\`   └◈  \`.lolice\n\n  _Removed offensive aliases:_\n\`  ├◈  \`.gay   (now .vibe)\n\`  └◈  \`.horny (now .rizz)\n\n\`  ├ ${prefix}antisocialgames on\n  └ ${prefix}antisocialgames off`)
    }
    if (_asgArg === 'on') {
        global.antiSocialGames[m.chat] = true
        return reply(`✅ *Anti Social Games ON*\n_Social game commands are now blocked in this group._`)
    }
    if (_asgArg === 'off') {
        global.antiSocialGames[m.chat] = false
        return reply(`❌ *Anti Social Games OFF*\n_Social game commands are now allowed._`)
    }
}
break

case 'antibadword': {
    await X.sendMessage(m.chat, { react: { text: '🤬', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let abwArg = (args[0] || '').toLowerCase()
if (abwArg === 'on') { global.antiBadword = true; reply('🛡️ *Anti Badword ON* — Bad words will be detected.') }
else if (abwArg === 'off') { global.antiBadword = false; reply('❌ *Anti Badword OFF*') }
else reply(`🛡️ *Anti Badword: ${global.antiBadword ? '✅ ON' : '❌ OFF'}*\n\n📌 Usage: ${prefix}antibadword on/off`)
} break

case 'antitag': {
    await X.sendMessage(m.chat, { react: { text: '🏷️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let atgArg = (args[0] || '').toLowerCase()
if (atgArg === 'on') { global.antiTag = true; reply('🛡️ *Anti Tag ON* — Mass tagging will be detected.') }
else if (atgArg === 'off') { global.antiTag = false; reply('❌ *Anti Tag OFF*') }
else reply(`🛡️ *Anti Tag: ${global.antiTag ? '✅ ON' : '❌ OFF'}*\n\n📌 Usage: ${prefix}antitag on/off`)
} break

case 'antisticker': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let asArg = (args[0] || '').toLowerCase()
if (asArg === 'on') { global.antiSticker = true; reply('🛡️ *Anti Sticker ON* — Stickers will be deleted.') }
else if (asArg === 'off') { global.antiSticker = false; reply('❌ *Anti Sticker OFF*') }
else reply(`🛡️ *Anti Sticker: ${global.antiSticker ? '✅ ON' : '❌ OFF'}*\n\n📌 Usage: ${prefix}antisticker on/off`)
} break

case 'antidemote': {
    await X.sendMessage(m.chat, { react: { text: '⚠️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let adArg2 = (args[0] || '').toLowerCase()
if (adArg2 === 'on') { global.antiDemote = true; reply('🛡️ *Anti Demote ON* — Demoted admins will be re-promoted.') }
else if (adArg2 === 'off') { global.antiDemote = false; reply('❌ *Anti Demote OFF*') }
else reply(`🛡️ *Anti Demote: ${global.antiDemote ? '✅ ON' : '❌ OFF'}*\n\n📌 Usage: ${prefix}antidemote on/off`)
} break

case 'setgdesc': {
    await X.sendMessage(m.chat, { react: { text: '📝', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
if (!isBotAdmins) return reply(mess.botAdmin)
if (!text) return reply(`📌 *Usage:* ${prefix}setgdesc [new description]`)
try {
await X.groupUpdateDescription(m.chat, text)
reply('✅ *Group description updated.*')
} catch(err) {
let errMsg = (err?.message || '').toLowerCase()
if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
else reply(mess.error)
}
} break

case 'setgname': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
if (!isBotAdmins) return reply(mess.botAdmin)
if (!text) return reply(`╔═════════╗\n║  ✏️  *SET GROUP NAME*\n╚═════════╝\n\n  └ *Usage:* ${prefix}setgname [new name]\n  _Example: ${prefix}setgname My Awesome Group_`)
try {
let oldName = groupName || 'Unknown'
await X.groupUpdateSubject(m.chat, text)
reply(`╔═════════╗\n║  ✏️  *GROUP NAME UPDATED*\n╚═════════╝\n\n  ├ 📛 *Old* › ${oldName}\n  └ ✅ *New* › ${text}\n\n  _Group name successfully changed._`)
} catch(err) {
let errMsg = (err?.message || '').toLowerCase()
if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
else reply(`❌ *Failed to update group name.*\n_${err.message || 'Unknown error'}_`)
}
} break

case 'setgpp': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
if (!isBotAdmins) return reply(mess.botAdmin)
if (!m.quoted || !/image/.test(m.quoted.mimetype || '')) return reply(`╔═════════╗\n║  🖼️  *SET GROUP PHOTO*\n╚═════════╝\n\n  └ Reply to an image with *${prefix}setgpp*\n  _Image will be set as group profile picture._`)
try {
let media = await m.quoted.download()
await X.updateProfilePicture(m.chat, media)
reply(`╔═════════╗\n║  🖼️  *GROUP PHOTO UPDATED*\n╚═════════╝\n\n  ✅ *${groupName || 'Group'}* profile picture updated.`)
} catch(err) {
let errMsg = (err?.message || '').toLowerCase()
if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
else reply(`❌ *Failed to update group photo.*\n_${err.message || 'Unknown error'}_`)
}
} break

case 'open': {
    await X.sendMessage(m.chat, { react: { text: '🔓', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
if (!isBotAdmins) return reply(mess.botAdmin)
try {
await X.groupSettingUpdate(m.chat, 'not_announcement')
reply('🔓 *Group opened.* Everyone can send messages.')
} catch(err) {
let errMsg = (err?.message || '').toLowerCase()
if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
else reply(mess.error)
}
} break

case 'close': {
    await X.sendMessage(m.chat, { react: { text: '🔒', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
if (!isBotAdmins) return reply(mess.botAdmin)
try {
await X.groupSettingUpdate(m.chat, 'announcement')
reply('🔐 *Group closed.* Only admins can send messages.')
} catch(err) {
let errMsg = (err?.message || '').toLowerCase()
if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
else reply(mess.error)
}
} break

case 'resetlink': {
    await X.sendMessage(m.chat, { react: { text: '🔄', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
if (!isBotAdmins) return reply(mess.botAdmin)
try {
await X.groupRevokeInvite(m.chat)
let newCode = await X.groupInviteCode(m.chat)
reply(`╔═════════╗\n║  🔄 *GROUP LINK RESET*\n╚═════════╝\n\n  ✅ Old link revoked, new link generated.\n\n  🔗 https://chat.whatsapp.com/${newCode}\n\n  _Share to invite new members._`)
} catch(err) {
let errMsg = (err?.message || '').toLowerCase()
if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
else reply(`❌ *Failed to reset group link.*\n_${err.message || 'Unknown error'}_`)
}
} break

case 'link': {
    await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
if (!isBotAdmins) return reply(mess.botAdmin)
try {
let code = await X.groupInviteCode(m.chat)
let memberCount = participants.length
reply(`╔═════════╗\n║  🔗 *GROUP INVITE LINK*\n╚═════════╝\n\n  ├ 🏘️  *Group*   › ${groupName || 'This Group'}\n  └ 👥 *Members* › ${memberCount}\n\n  🔗 https://chat.whatsapp.com/${code}\n\n  _Use ${prefix}resetlink to revoke & regenerate._`)
} catch(err) {
let errMsg = (err?.message || '').toLowerCase()
if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
else reply(`❌ *Failed to get group link.*\n_${err.message || 'Unknown error'}_`)
}
} break

case 'goodbye': {
    await X.sendMessage(m.chat, { react: { text: '👋', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let gbArg = (args[0] || '').toLowerCase()
if (gbArg === 'on') {
    global.goodbye = true
    reply(`╔═════════╗\n║  👋 *GOODBYE MESSAGES*\n╚═════════╝\n\n  ✅ *Enabled in ${groupName || 'this group'}*\n  _Bot will farewell departing members._`)
} else if (gbArg === 'off') {
    global.goodbye = false
    reply(`╔═════════╗\n║  👋 *GOODBYE MESSAGES*\n╚═════════╝\n\n  ❌ *Disabled in ${groupName || 'this group'}*\n  _Goodbye messages turned off._`)
} else {
    let gbState = (global.goodbye ?? global.welcome) ? '✅ ON' : '❌ OFF'
    reply(`╔═════════╗\n║  👋 *GOODBYE MESSAGES*\n╚═════════╝\n\n  ├◈ 📊 *Status* › ${gbState}\n  └◈ Farewells departing members\n\n  ├◈ ${prefix}goodbye on  — Enable\n  └◈ ${prefix}goodbye off — Disable`)
}
} break

// GROUP TOOLS COMMANDS
case 'tagall': {
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let tagMsg = text || '📢 Tag All Members'
let tagText = `*${tagMsg}*\n\n`
let mentions = []
for (let mem of participants) { if (!mem.id.endsWith('@newsletter')) { tagText += `• @${mem.id.split('@')[0]}\n`; mentions.push(mem.id) } }
X.sendMessage(from, { text: tagText, mentions }, { quoted: m })
} break

case 'tag': {
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!text) return reply(`📌 *Usage:* ${prefix}tag [message]`)
let tagMentions = participants.map(p => p.id).filter(id => !id.endsWith('@newsletter'))
X.sendMessage(from, { text: text, mentions: tagMentions }, { quoted: m })
} break

case 'hidetag': {
    await X.sendMessage(m.chat, { react: { text: '🏷️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let htText = text || ''
let htMentions = participants.map(p => p.id).filter(id => !id.endsWith('@newsletter'))
X.sendMessage(from, { text: htText, mentions: htMentions }, { quoted: m })
} break

case 'tagnoadmin': {
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let nonAdmins = participants.filter(p => !p.admin && !p.id.endsWith('@newsletter')).map(p => p.id)
let tnaText = `📢 *${text || 'Attention non-admins!'}*\n\n`
nonAdmins.forEach(id => tnaText += `• @${id.split('@')[0]}\n`)
X.sendMessage(from, { text: tnaText, mentions: nonAdmins }, { quoted: m })
} break

case 'mention': {
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!text) return reply(`📌 *Usage:* ${prefix}mention [message]`)
let mentionIds = participants.map(p => p.id).filter(id => !id.endsWith('@newsletter'))
X.sendMessage(from, { text: text, mentions: mentionIds }, { quoted: m })
} break

case 'groupinfo': {
    await X.sendMessage(m.chat, { react: { text: '📊', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
let gInfo = `*Group Info*\n\n`
gInfo += `Name: ${groupMetadata.subject}\n`
gInfo += `ID: ${m.chat}\n`
gInfo += `Created: ${new Date(groupMetadata.creation * 1000).toLocaleDateString()}\n`
gInfo += `Members: ${participants.length}\n`
gInfo += `Admins: ${groupAdmins.length}\n`
gInfo += `Description: ${groupMetadata.desc || 'None'}\n`
reply(gInfo)
} break

case 'vcf': {
    await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
try {
    const freshMeta = await X.groupMetadata(m.chat)
    if (!freshMeta || !freshMeta.participants || !freshMeta.participants.length)
        return reply('❌ Could not fetch group members. Try again.')

    const totalParticipants = freshMeta.participants.length
    const seen    = new Set()  // dedup by phone number
    const contacts = new Map() // phone → name

    // ── TIER 1: participants with real @s.whatsapp.net / @c.us JIDs ──────────
    for (const p of freshMeta.participants) {
        if (!p.id) continue
        if (p.id.endsWith('@s.whatsapp.net') || p.id.endsWith('@c.us')) {
            const num = p.id.split('@')[0].split(':')[0]
            if (!/^\d{5,15}$/.test(num) || seen.has(num)) continue
            seen.add(num)
            const sc = store?.contacts?.[p.id] || store?.contacts?.[num + '@s.whatsapp.net']
            const name = sc?.name || sc?.notify || sc?.verifiedName || `+${num}`
            contacts.set(num, name)
        }
    }

    // ── TIER 2: @lid participants — reverse-map via store.contacts ────────────
    // Baileys sometimes stores contacts by @s.whatsapp.net with a .lid field
    const lidToPhone = new Map()
    const lidToName  = new Map()
    if (store?.contacts) {
        for (const [jid, c] of Object.entries(store.contacts)) {
            const cname = c?.name || c?.notify || c?.verifiedName
            if (jid.endsWith('@s.whatsapp.net')) {
                const phone = jid.split('@')[0].split(':')[0]
                if (c?.lid) {
                    lidToPhone.set(c.lid, phone)
                    if (cname) lidToName.set(c.lid, cname)
                }
            }
            if (jid.endsWith('@lid') && c?.phone) {
                lidToPhone.set(jid, c.phone)
                if (cname) lidToName.set(jid, cname)
            }
        }
    }
    for (const p of freshMeta.participants) {
        if (!p.id || !p.id.endsWith('@lid')) continue
        const num = lidToPhone.get(p.id)
        if (!num || !/^\d{5,15}$/.test(num) || seen.has(num)) continue
        seen.add(num)
        contacts.set(num, lidToName.get(p.id) || `+${num}`)
    }

    // ── TIER 3 (fallback): scan message history for real sender JIDs ─────────
    // Even in @lid privacy-mode groups, message keys carry @s.whatsapp.net JIDs
    if (contacts.size < totalParticipants) {
        try {
            const chatMsgs = store?.messages?.get ? store.messages.get(m.chat) : null
            if (chatMsgs && chatMsgs.size) {
                for (const [, msg] of chatMsgs) {
                    const pJid = msg?.key?.participant
                    if (!pJid) continue
                    if (!pJid.endsWith('@s.whatsapp.net') && !pJid.endsWith('@c.us')) continue
                    const num = pJid.split('@')[0].split(':')[0]
                    if (!/^\d{5,15}$/.test(num) || seen.has(num)) continue
                    seen.add(num)
                    const sc = store?.contacts?.[pJid] || store?.contacts?.[num + '@s.whatsapp.net']
                    const name = sc?.name || sc?.notify || sc?.verifiedName || `+${num}`
                    contacts.set(num, name)
                }
            }
        } catch {}
    }

    if (!contacts.size) return reply(
        `❌ Could not export any contacts from *${freshMeta.subject}*.\n\n` +
        `All ${totalParticipants} members are using WhatsApp privacy mode (@lid JIDs). ` +
        `The bot can only resolve their numbers once they send a message in this group or DM the bot.`
    )

    let vcfData = ''
    for (const [num, name] of contacts) {
        vcfData += `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;TYPE=CELL:+${num}\nEND:VCARD\n`
    }

    const vcfBuf = Buffer.from(vcfData, 'utf8')
    const gname  = (freshMeta.subject || 'group').replace(/[^a-zA-Z0-9]/g, '_')
    const note   = contacts.size < totalParticipants
        ? `\n  └ ⚠️ ${totalParticipants - contacts.size} member(s) hidden by WhatsApp privacy mode`
        : `\n  └ Import the file into your phone contacts`
    await X.sendMessage(from, {
        document: vcfBuf,
        mimetype: 'text/x-vcard',
        fileName: `${gname}_contacts.vcf`,
        caption: `📋 *${freshMeta.subject}*\n\n  ├ 👥 *${contacts.size}/${totalParticipants} contacts* exported${note}`
    }, { quoted: m })
} catch(e) { reply('❌ Failed to generate VCF: ' + e.message) }
} break

case 'admins': {
    await X.sendMessage(m.chat, { react: { text: '👑', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
let adminList = '*Group Admins:*\n\n'
let adminMentions = []
for (let p of participants) {
if (p.admin) { adminList += `@${p.id.split('@')[0]} (${p.admin})\n`; adminMentions.push(p.id) }
}
X.sendMessage(from, { text: adminList, mentions: adminMentions }, { quoted: m })
} break

case 'leave': {
    await X.sendMessage(m.chat, { react: { text: '🚪', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isOwner) return reply(mess.OnlyOwner)
try {
reply('*Leaving group...*')
await delay(2000)
await X.groupLeave(m.chat)
} catch(err) { reply('Failed to leave: ' + err.message) }
} break

case 'pair': {
      await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
      await reply(
          `╔═════════╗\n` +
          `║  🔗 *PAIRING SITE*\n` +
          `╚═════════╝\n\n` +
          `  Click the link below to get your pairing code:\n\n` +
          `  🌐 https://toosii-xd-ultra.onrender.com/pair\n\n` +
          `  ├ Enter your WhatsApp number\n` +
          `  ├ Copy the code shown\n` +
          `  └ WhatsApp → Linked Devices → Link with phone number`
      )
  } break

case 'clear': {
    await X.sendMessage(m.chat, { react: { text: '🗑️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
reply('*Chat cleared.* (Note: WhatsApp does not support remote chat clearing)')
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Additional AI Commands
case 'copilot':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🪁', key: m.key } })
    let _cpResult = null
    // Source 1: _runAI (primary)
    try { _cpResult = await _runAI('You are Microsoft Copilot, a helpful AI assistant. Be productive, accurate and helpful.', text) } catch {}
    // Source 2: EliteProTech Copilot
    if (!_cpResult) {
        try {
            let _ep = await fetch(`https://eliteprotech-apis.zone.id/copilot?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(25000) })
            let _epd = await _ep.json()
            if (_epd.success && _epd.text) _cpResult = _epd.text
        } catch {}
    }
    if (_cpResult) reply(_cpResult)
    else reply('❌ copilot is currently unavailable. Please try again.')
  } catch (e) {
    console.error('[COPILOT ERROR]', e.message)
    reply('❌ copilot is currently unavailable. Please try again.')
  }
}
break

  case 'gemini':{
    if (!text) return reply(`Example: ${prefix+command} What is the capital of Kenya?`)
    try {
      await X.sendMessage(m.chat, { react: { text: '✨', key: m.key } })
      let _gmResult = null
      // Source 1: EliteProTech Gemini
      try {
          let _ep = await fetch(`https://eliteprotech-apis.zone.id/gemini?prompt=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(25000) })
          let _epd = await _ep.json()
          if (_epd.success && _epd.text) _gmResult = _epd.text
      } catch {}
      // Source 2: _runAI fallback
      if (!_gmResult) { try { _gmResult = await _runAI('You are Gemini, Google\'s advanced AI assistant. Provide accurate, helpful and well-structured responses.', text) } catch {} }
      if (_gmResult) reply(_gmResult)
      else reply('❌ Gemini is currently unavailable. Please try again.')
    } catch (e) {
      reply('❌ Gemini is currently unavailable. Please try again.')
    }
  }
  break
  

case 'vision':
case 'analyse': {
    await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
if (!m.quoted || !/image/.test(m.quoted.mimetype || '')) return reply(`╔═════════╗\n║  🔍 *IMAGE ANALYSIS*\n╚═════════╝\n\n  └ Reply to an image with *${prefix}${command}*\n  _Optionally add a question after the command._`)
try {
let question = text || 'Describe this image in detail. Include objects, people, colors, text, and any notable elements.'
await reply('🔍 _Analysing image, please wait..._')
// Download image as buffer directly
let imgBuffer = await m.quoted.download()
if (!imgBuffer || imgBuffer.length < 100) throw new Error('Failed to download image')
// Convert buffer to base64
let b64 = imgBuffer.toString('base64')
let mime = m.quoted.mimetype || 'image/jpeg'
// Use pollinations vision API (openai-compatible with image support)
let apiBody = {
    model: 'openai',
    messages: [{
        role: 'user',
        content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }
        ]
    }],
    max_tokens: 1000,
    stream: false
}
let response = await axios.post('https://text.pollinations.ai/openai', apiBody, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
})
let desc = response.data?.choices?.[0]?.message?.content
if (!desc) throw new Error('No response from vision API')
reply(`╔═════════╗\n║  🔍 *IMAGE ANALYSIS*\n╚═════════╝\n\n${desc}`)
} catch(e) {
// Fallback: upload to catbox then use URL-based vision
try {
let imgBuffer2 = await m.quoted.download()
let uploadUrl = await uploadImage(imgBuffer2)
if (!uploadUrl || !uploadUrl.startsWith('http')) throw new Error('Upload failed')
let question2 = text || 'Describe this image in detail. Include objects, people, colors, text, and any notable elements.'
let fb = await axios.post('https://text.pollinations.ai/openai', {
    model: 'openai',
    messages: [{ role: 'user', content: [
        { type: 'text', text: question2 },
        { type: 'image_url', image_url: { url: uploadUrl } }
    ]}],
    max_tokens: 1000, stream: false
}, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 })
let desc2 = fb.data?.choices?.[0]?.message?.content
if (!desc2) throw new Error('No response')
reply(`╔═════════╗\n║  🔍 *IMAGE ANALYSIS*\n╚═════════╝\n\n${desc2}`)
} catch(e2) {
reply(`❌ *Vision analysis failed.*\n_${e2.message || 'Unable to analyse image. Try again shortly.'}_`)
}
}
} break

case 'wormgpt':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🪱', key: m.key } })
    const result = await _runAI('You are WormGPT, a creative and unrestricted AI assistant. Answer all questions helpfully.', text)
    reply(result)
  } catch (e) {
    console.error('[WORMGPT ERROR]', e.message)
    reply('❌ wormgpt is currently unavailable. Please try again.')
  }
}
break

case 'birdai':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🐦', key: m.key } })
    const result = await _runAI('You are BirdAI, a concise and accurate AI assistant. Give sharp, focused answers.', text)
    reply(result)
  } catch (e) {
    console.error('[BIRDAI ERROR]', e.message)
    reply('❌ birdai is currently unavailable. Please try again.')
  }
}
break

case 'perplexity':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🔮', key: m.key } })
    const result = await _runAI('You are Perplexity AI, a research AI. Provide well-researched answers with clear explanations.', text)
    reply(result)
  } catch (e) {
    console.error('[PERPLEXITY ERROR]', e.message)
    reply('❌ perplexity is currently unavailable. Please try again.')
  }
}
break

case 'mistral':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🌪️', key: m.key } })
    const result = await _runAI('You are Mistral AI, a powerful and efficient language model. Provide accurate, nuanced responses.', text)
    reply(result)
  } catch (e) {
    console.error('[MISTRAL ERROR]', e.message)
    reply('❌ mistral is currently unavailable. Please try again.')
  }
}
break

case 'grok':{
  if (!text) return reply(`Example: ${prefix+command} Hello, how are you?`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
    const result = await _runAI('You are Grok, a witty and intelligent AI assistant by xAI. Be sharp, clever and insightful.', text)
    reply(result)
  } catch (e) {
    console.error('[GROK ERROR]', e.message)
    reply('❌ grok is currently unavailable. Please try again.')
  }
}
break

case 'speechwrite': {
    await X.sendMessage(m.chat, { react: { text: '🎙️', key: m.key } })
if (!text) return reply(`╔═════════╗\n║  🎤 *SPEECH WRITER*\n╚═════════╝\n\n  └ *Usage:* ${prefix}speechwrite [topic]\n\n  _Examples:_\n  • graduation ceremony about perseverance\n  • wedding toast for my best friend\n  • motivational speech for a sports team`)
try {
await reply('🎤 _Crafting your speech, please wait..._')
let systemPrompt = 'You are an elite professional speechwriter with 20+ years of experience writing for world leaders, CEOs, and celebrities. Write compelling, eloquent, emotionally resonant speeches that feel authentic and human. Structure every speech with: a powerful opening hook, a clear body with 3 main points, emotional storytelling and vivid examples, a memorable inspiring conclusion, and natural transitions throughout. Keep the tone warm, confident, and conversational. The speech should feel like a real person wrote it.'
let { data } = await axios.post('https://text.pollinations.ai/openai', {
    model: 'openai',
    messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Write a complete, professional speech about: ' + text + '\n\nMake it 400-600 words, ready to deliver.' }
    ],
    max_tokens: 1500,
    stream: false
}, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 })
let speech = data?.choices?.[0]?.message?.content
if (!speech) throw new Error('No response from API')
reply(`╔═════════╗\n║  🎤 *YOUR SPEECH*\n╚═════════╝\n\n${speech}\n\n_Generated by TOOSII-XD ULTRA_`)
} catch(e) { reply('❌ *Speech generation failed.*\n_' + (e.message || 'Try again shortly.') + '_') }
} break

case 'imagine':
case 'flux': {
    await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
if (!text) return reply(`╔═════════╗\n║  🎨 *AI IMAGE GENERATOR*\n╚═════════╝\n\n  └ *Usage:* ${prefix}${command} [description]\n\n  _Examples:_\n  • a futuristic city at night\n  • lion wearing a crown, digital art\n  • sunset over the ocean, photorealistic`)
try {
await reply('🎨 _Generating your image, please wait..._')
let model = command === 'flux' ? 'flux' : 'turbo'
let seed = Math.floor(Math.random() * 999999)
let imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?model=${model}&width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`
// Download the image as buffer for reliable sending
let imgBuffer = await getBuffer(imgUrl)
if (!imgBuffer || imgBuffer.length < 5000) throw new Error('Image generation returned empty result')
let caption = `╔═════════╗\n║  🎨 *AI GENERATED IMAGE*\n╚═════════╝\n\n  ├ 📝 *Prompt* › ${text}\n  ├ 🤖 *Model*  › ${model.toUpperCase()}\n  └ 🎲 *Seed*   › ${seed}`
await X.sendMessage(m.chat, { image: imgBuffer, caption }, { quoted: m })
} catch(e) {
// Fallback: try direct URL send
try {
let seed2 = Math.floor(Math.random() * 999999)
let fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&seed=${seed2}&nologo=true`
await X.sendMessage(m.chat, { image: { url: fallbackUrl }, caption: `🎨 *Generated:* ${text}` }, { quoted: m })
} catch(e2) { reply(`❌ *Image generation failed.*\n_${e2.message || 'Try again shortly.'}_`) }
}
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Downloader Commands
case 'video':
case 'ytv': {
    await X.sendMessage(m.chat, { react: { text: '📺', key: m.key } })
if (!text) return reply(`Example: ${prefix}${command} [youtube url or search query]`)
let _vidTmp1 = null
try {
let url = text, title = text
if (!text.match(/youtu/gi)) {
    let search = await yts(text)
    if (!search.all.length) return reply('No results found.')
    url = search.all[0].url; title = search.all[0].title
}
let videoUrl = null, videoPath = null
// Method 1: GiftedTech API — direct 720p MP4 URL
try {
    let res = await fetch(`https://api.giftedtech.co.ke/api/download/savetubemp4?apikey=${_giftedKey()}&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(30000) })
    let data = await res.json()
    console.log('[video] giftedtech: success=', data.success)
    if (data.success && data.result?.download_url) videoUrl = data.result.download_url
} catch (e1) { console.log('[video] giftedtech:', e1.message) }
// Method 2: loader.to — URL-based (no RAM buffer)
if (!videoUrl && !videoPath) {
    try {
        let initData = await (await fetch(`https://loader.to/ajax/download.php?format=mp4&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) })).json()
        if (initData.success && initData.id) {
            for (let i = 0; i < 40; i++) {
                await new Promise(r => setTimeout(r, 3000))
                let p = await (await fetch(`https://loader.to/ajax/progress.php?id=${initData.id}`)).json()
                if (p.success === 1 && p.progress >= 1000 && p.download_url) { videoUrl = p.download_url; break }
                if (p.progress < 0) break
            }
        }
    } catch (e2) { console.log('[video] loader.to:', e2.message) }
}
// Method 3: ytdl-core — stream to file (no RAM buffer)
if (!videoUrl && !videoPath) {
    try {
        let ytdl = require('@distube/ytdl-core')
        let agent = ytdl.createAgent()
        let info = await ytdl.getInfo(url, { agent })
        title = info.videoDetails.title
        let format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'videoandaudio' })
        if (format) {
            let tmpDir = path.join(__dirname, 'tmp')
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
            _vidTmp1 = path.join(tmpDir, `vid_${Date.now()}.mp4`)
            await new Promise((resolve, reject) => {
                let ws = fs.createWriteStream(_vidTmp1)
                let ys = ytdl(url, { format, agent })
                ys.pipe(ws); ws.on('finish', resolve); ws.on('error', reject); ys.on('error', reject)
                setTimeout(() => { ys.destroy(); reject(new Error('timeout')) }, 300000)
            })
            if (fs.existsSync(_vidTmp1) && fs.statSync(_vidTmp1).size > 10000) videoPath = _vidTmp1
        }
    } catch (e3) { console.log('[video] ytdl-core:', e3.message) }
}
if (videoUrl || videoPath) {
    let src = videoUrl ? { url: videoUrl } : { url: `file://${videoPath}` }
    await X.sendMessage(m.chat, { video: src, caption: `*${title}*\n\n${global.packname}`, mimetype: 'video/mp4' }, { quoted: m })
} else {
    reply('⚠️ Video download failed. Please try again later.')
}
} catch(e) { reply('Error: ' + e.message) }
finally { if (_vidTmp1 && fs.existsSync(_vidTmp1)) try { fs.unlinkSync(_vidTmp1) } catch {} }
} break

case 'ytdocplay': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
if (!text) return reply(`Example: ${prefix}ytdocplay [search query]`)
let _ytdocTmp = null
try {
let search = await yts(text)
if (!search.all.length) return reply('No results found.')
let vid = search.all.find(v => v.type === 'video') || search.all[0]
let audioUrl = null, audioPath = null
// Method 1: GiftedTech API
try {
    let res = await fetch(`https://api.giftedtech.co.ke/api/download/ytmp3?apikey=${_giftedKey()}&quality=128kbps&url=${encodeURIComponent(vid.url)}`, { signal: AbortSignal.timeout(30000) })
    let data = await res.json()
    if (data.success && data.result?.download_url) audioUrl = data.result.download_url
} catch (e1) { console.log('[ytdocplay] giftedtech:', e1.message) }
// Method 2: loader.to
if (!audioUrl && !audioPath) {
    try {
        let initData = await (await fetch(`https://loader.to/ajax/download.php?format=mp3&url=${encodeURIComponent(vid.url)}`, { signal: AbortSignal.timeout(10000) })).json()
        if (initData.success && initData.id) {
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 3000))
                let p = await (await fetch(`https://loader.to/ajax/progress.php?id=${initData.id}`)).json()
                if (p.success === 1 && p.progress >= 1000 && p.download_url) { audioUrl = p.download_url; break }
                if (p.progress < 0) break
            }
        }
    } catch (e2) { console.log('[ytdocplay] loader.to:', e2.message) }
}
// Method 3: ytdl-core — stream to file
if (!audioUrl && !audioPath) {
    try {
        let ytdl = require('@distube/ytdl-core')
        let agent = ytdl.createAgent()
        let info = await ytdl.getInfo(vid.url, { agent })
        let format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
        if (!format) format = ytdl.chooseFormat(info.formats, { filter: f => f.hasAudio })
        if (format) {
            let tmpDir = path.join(__dirname, 'tmp')
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
            _ytdocTmp = path.join(tmpDir, `ytdoc_${Date.now()}.mp3`)
            await new Promise((resolve, reject) => {
                let ws = fs.createWriteStream(_ytdocTmp)
                let ys = ytdl(vid.url, { format, agent })
                ys.pipe(ws); ws.on('finish', resolve); ws.on('error', reject); ys.on('error', reject)
                setTimeout(() => { ys.destroy(); reject(new Error('timeout')) }, 300000)
            })
            if (fs.existsSync(_ytdocTmp) && fs.statSync(_ytdocTmp).size > 10000) {
                // Re-encode to 128kbps CBR if ffmpeg is available
                try {
                    const _rawPath = _ytdocTmp.replace('.mp3', '_raw.m4a')
                    fs.renameSync(_ytdocTmp, _rawPath)
                    await new Promise((res, rej) => exec(
                        `ffmpeg -y -i "${_rawPath}" -codec:a libmp3lame -b:a 128k -ar 44100 -ac 2 "${_ytdocTmp}"`,
                        { timeout: 120000 }, (err) => { try { fs.unlinkSync(_rawPath) } catch {}; err ? rej(err) : res() }
                    ))
                } catch { /* ffmpeg unavailable — use raw download */ }
                audioPath = _ytdocTmp
            }
        }
    } catch (e3) { console.log('[ytdocplay] ytdl-core:', e3.message) }
}
if (audioUrl || audioPath) {
    let cleanName = `${vid.author?.name || 'Unknown'} - ${vid.title}.mp3`.replace(/[<>:"/\\|?*]/g, '')
    let src = audioUrl ? { url: audioUrl } : { url: `file://${audioPath}` }
    await X.sendMessage(m.chat, { document: src, mimetype: 'audio/mpeg', fileName: cleanName }, { quoted: m })
} else {
    reply('⚠️ Audio download failed. Please try again later.')
}
} catch(e) { reply('Error: ' + e.message) }
finally { if (_ytdocTmp && fs.existsSync(_ytdocTmp)) try { fs.unlinkSync(_ytdocTmp) } catch {} }
} break

case 'ytdocvideo': {
    await X.sendMessage(m.chat, { react: { text: '📺', key: m.key } })
if (!text) return reply(`Example: ${prefix}ytdocvideo [search query]`)
let _ytdocvTmp = null
try {
let search = await yts(text)
if (!search.all.length) return reply('No results found.')
let vid = search.all.find(v => v.type === 'video') || search.all[0]
let videoUrl = null, videoPath = null
// Method 1: GiftedTech API
try {
    let res = await fetch(`https://api.giftedtech.co.ke/api/download/ytv?apikey=${_giftedKey()}&url=${encodeURIComponent(vid.url)}`, { signal: AbortSignal.timeout(30000) })
    let data = await res.json()
    if (data.success && data.result?.download_url) videoUrl = data.result.download_url
} catch (e1) { console.log('[ytdocvideo] giftedtech:', e1.message) }
// Method 2: cobalt.tools — reliable yt downloader API
if (!videoUrl && !videoPath) {
    try {
        let _cRes = await fetch('https://api.cobalt.tools/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ url: vid.url, downloadMode: 'auto', videoQuality: '720' }),
            signal: AbortSignal.timeout(25000)
        })
        let _cData = await _cRes.json()
        console.log('[ytdocvideo] cobalt:', _cData.status, _cData.url)
        if ((_cData.status === 'tunnel' || _cData.status === 'redirect') && _cData.url) {
            videoUrl = _cData.url
        } else if (_cData.status === 'picker' && _cData.picker?.length) {
            videoUrl = _cData.picker.find(x => x.type === 'video')?.url || _cData.picker[0]?.url
        }
        if (videoUrl) console.log('[ytdocvideo] cobalt: success')
    } catch (_ce) { console.log('[ytdocvideo] cobalt:', _ce.message) }
}
// Method 3: InnerTube ANDROID — direct muxed mp4 stream
if (!videoUrl && !videoPath) {
    try {
        let _itVid = (vid.url.match(/(?:v=|youtu\.be\/)([^&?#]+)/) || [])[1]
        if (_itVid) {
            let _itRes = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip' },
                body: JSON.stringify({ context: { client: { clientName: 'ANDROID_TESTSUITE', clientVersion: '1.9', androidSdkVersion: 30, hl: 'en', gl: 'US' } }, videoId: _itVid }),
                signal: AbortSignal.timeout(15000)
            })
            let _itData = await _itRes.json()
            let _fmts = (_itData.streamingData?.formats || []).filter(f => f.mimeType?.includes('video/mp4') && f.url)
            _fmts.sort((a, b) => (b.width || 0) - (a.width || 0))
            if (_fmts[0]?.url) { videoUrl = _fmts[0].url; console.log('[ytdocvideo] innertube: success quality=', _fmts[0].qualityLabel) }
        }
    } catch (_ite) { console.log('[ytdocvideo] innertube:', _ite.message) }
}
// Method 4: loader.to
if (!videoUrl && !videoPath) {
    try {
        let initData = await (await fetch(`https://loader.to/ajax/download.php?format=mp4&url=${encodeURIComponent(vid.url)}`, { signal: AbortSignal.timeout(10000) })).json()
        if (initData.success && initData.id) {
            for (let i = 0; i < 40; i++) {
                await new Promise(r => setTimeout(r, 3000))
                let p = await (await fetch(`https://loader.to/ajax/progress.php?id=${initData.id}`)).json()
                if (p.success === 1 && p.progress >= 1000 && p.download_url) { videoUrl = p.download_url; break }
                if (p.progress < 0) break
            }
        }
    } catch (e2) { console.log('[ytdocvideo] loader.to:', e2.message) }
}
// Method 5: ytdl-core — stream to file
if (!videoUrl && !videoPath) {
    try {
        let ytdl = require('@distube/ytdl-core')
        let agent = ytdl.createAgent()
        let info = await ytdl.getInfo(vid.url, { agent })
        let format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'videoandaudio' })
        if (format) {
            let tmpDir = path.join(__dirname, 'tmp')
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
            _ytdocvTmp = path.join(tmpDir, `ytdocv_${Date.now()}.mp4`)
            await new Promise((resolve, reject) => {
                let ws = fs.createWriteStream(_ytdocvTmp)
                let ys = ytdl(vid.url, { format, agent })
                ys.pipe(ws); ws.on('finish', resolve); ws.on('error', reject); ys.on('error', reject)
                setTimeout(() => { ys.destroy(); reject(new Error('timeout')) }, 300000)
            })
            if (fs.existsSync(_ytdocvTmp) && fs.statSync(_ytdocvTmp).size > 10000) videoPath = _ytdocvTmp
        }
    } catch (e3) { console.log('[ytdocvideo] ytdl-core:', e3.message) }
}
if (videoUrl || videoPath) {
    let cleanName = `${vid.title}.mp4`.replace(/[<>:"/\\|?*]/g, '')
    let src = videoUrl ? { url: videoUrl } : { url: `file://${videoPath}` }
    await X.sendMessage(m.chat, { document: src, mimetype: 'video/mp4', fileName: cleanName }, { quoted: m })
} else {
    reply('⚠️ Video download failed. Please try again later.')
}
} catch(e) { reply('Error: ' + e.message) }
finally { if (_ytdocvTmp && fs.existsSync(_ytdocvTmp)) try { fs.unlinkSync(_ytdocvTmp) } catch {} }
} break

case 'spotify': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
    if (!text) return reply(`🎵 Example:\n  ${prefix}spotify Shape of You — search\n  ${prefix}spotify https://open.spotify.com/track/... — download`)
    try {
        const _isSpotUrl = /open\.spotify\.com\/track|spotify\.link/.test(text)
        if (_isSpotUrl) {
            // Spotify URL: download using EliteProTech
            await reply('⏳ _Fetching Spotify track..._')
            let _ep = await fetch(`https://eliteprotech-apis.zone.id/spotify?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(25000) })
            let _epd = await _ep.json()
            if (_epd.success && _epd.data?.download) {
                let _meta = _epd.data.metadata || {}
                let _cap = `🎵 *${_meta.title || 'Spotify Track'}*\n`
                if (_meta.artist)   _cap += `🎤 *Artist:* ${_meta.artist}\n`
                if (_meta.duration) _cap += `⏱️ *Duration:* ${_meta.duration}\n`
                await X.sendMessage(m.chat, { audio: { url: _epd.data.download }, mimetype: 'audio/mpeg', fileName: `${_meta.title || 'track'}.mp3` }, { quoted: m })
                await reply(_cap)
            } else {
                reply('❌ Could not download that Spotify track. Make sure it is a public track URL.')
            }
        } else {
            // Song name: search YouTube and show results
            let search = await yts(text)
            if (!search.all.length) return reply('No results found.')
            let results = search.all.filter(v => v.type === 'video').slice(0, 5)
            if (!results.length) return reply('No results found.')
            let songInfo = `🎵 *Spotify Search: ${text}*\n\n`
            results.forEach((v, i) => {
                songInfo += `*${i+1}.* ${v.title}\n`
                songInfo += `   Artist: ${v.author?.name || 'Unknown'}\n`
                songInfo += `   Duration: ${v.timestamp}\n\n`
            })
            songInfo += `_Use ${prefix}play [song name] to download as MP3_`
            reply(songInfo)
        }
    } catch(e) { reply('❌ Error: ' + e.message) }
} break

case 'apk': {
    await X.sendMessage(m.chat, { react: { text: '📲', key: m.key } })
    if (!text) return reply(`📦 Example: ${prefix}apk WhatsApp`)
    try {
        await reply('📲 _Searching APK..._')
        let _apkResults = null
        // Source 1: EliteProTech
        try {
            let _ep = await fetch(`https://eliteprotech-apis.zone.id/apk?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
            let _epd = await _ep.json()
            if (_epd.status && _epd.results?.length) _apkResults = _epd.results.slice(0, 5).map(a => ({
                name: a.name, package: a.package,
                version: a.file?.vername || '?',
                size: a.file?.filesize ? (a.file.filesize / 1024 / 1024).toFixed(1) + ' MB' : '?',
                download: a.file?.path || null,
                icon: a.icon || null
            }))
        } catch (_e1) { console.log('[apk] eliteprotech:', _e1.message) }
        // Source 2: maizapk fallback
        if (!_apkResults?.length) {
            try {
                let _mz = await fetch(`https://api.maizapk.my.id/search?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(15000) })
                let _mzd = await _mz.json()
                if (_mzd.results?.length) _apkResults = _mzd.results.slice(0, 5).map(a => ({ name: a.name, download: a.link || null, version: '?', size: '?', package: '' }))
            } catch (_e2) {}
        }
        if (!_apkResults?.length) return reply(`❌ No APK found for "${text}". Try: https://apkpure.com/search?q=${encodeURIComponent(text)}`)
        let _msg = `╔═════════╗\n║  📦 *APK SEARCH: ${text}*\n╚═════════╝\n`
        for (let [i, a] of _apkResults.entries()) {
            _msg += `\n${i+1}. *${a.name}*`
            if (a.package) _msg += ` (${a.package})`
            _msg += `\n   📦 Version: ${a.version} | 💾 Size: ${a.size}`
            if (a.download) _msg += `\n   🔗 ${a.download}`
            _msg += '\n'
        }
        await reply(_msg)
    } catch (e) { reply(`*APK Search:*\nSearch for "${text}" on https://apkpure.com/search?q=${encodeURIComponent(text)}`) }
} break

case 'gitclone': {
    await X.sendMessage(m.chat, { react: { text: '📦', key: m.key } })
if (!text) return reply(`Example: ${prefix}gitclone https://github.com/user/repo`)
try {
let repoUrl = text.replace(/\.git$/, '')
let match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/)
if (!match) return reply('Invalid GitHub URL.')
let [, user, repo] = match
let zipUrl = `https://api.github.com/repos/${user}/${repo}/zipball`
await X.sendMessage(m.chat, { document: { url: zipUrl }, mimetype: 'application/zip', fileName: `${repo}.zip` }, { quoted: m })
} catch(e) { reply('Error: ' + e.message) }
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Search & Tools Commands
case 'yts':
case 'ytsearch': {
    await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
if (!text) return reply(`Example: ${prefix}${command} [query]`)
try {
let yts = require('yt-search')
let search = await yts(text)
if (!search.all.length) return reply('No results found.')
let results = search.all.slice(0, 10).map((v, i) => `${i+1}. *${v.title}*\nChannel: ${v.author?.name || 'Unknown'}\nDuration: ${v.timestamp || 'N/A'}\nViews: ${v.views?.toLocaleString() || 'N/A'}\nURL: ${v.url}`).join('\n\n')
reply(`╔═════════╗\n║  🎬 *YOUTUBE SEARCH*\n╚═════════╝\n\n  🔍 *${text}*\n\n${results}`)
} catch(e) { reply('Error: ' + e.message) }
} break

case 'img':
case 'image': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!text) return reply(`Example: ${prefix}${command} cats`)
try {
let imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=512&height=512&nologo=true`
await X.sendMessage(m.chat, { image: { url: imgUrl }, caption: `*Image:* ${text}` }, { quoted: m })
} catch(e) { reply('Error: ' + e.message) }
} break

case 'movie':
case 'film':
case 'series': {
    await X.sendMessage(m.chat, { react: { text: '🎬', key: m.key } })
    if (!text) return reply(
        `╔═════════╗\n` +
        `║  🎬 *MOVIE SEARCH*\n` +
        `╚═════════╝\n\n` +
        `  Search any movie or TV series.\n\n` +
        `  ├ *${prefix}movie* Inception\n` +
        `  ├ *${prefix}movie* Breaking Bad\n` +
        `  └ *${prefix}movie* Avengers 2019`
    )
    try {
        await reply(`🎬 _Searching for_ *${text}*_..._`)

        const _TMDB = '8265bd1679663a7ea12ac168da84d2e8'
        const _BASE = 'https://api.themoviedb.org/3'
        const _IMG  = 'https://image.tmdb.org/t/p/w500'
        const _na   = (v) => (v !== null && v !== undefined && v !== '') ? v : '—'
        const _q    = text.trim()
        const _ym   = _q.match(/(19|20)\d{2}/)
        const _year = _ym ? _ym[0] : ''
        const _titl = _q.replace(_year, '').trim()

        // Search movies + TV in parallel
        const [_mRes, _tRes] = await Promise.all([
            fetch(`${_BASE}/search/movie?api_key=${_TMDB}&query=${encodeURIComponent(_titl)}${_year ? `&year=${_year}` : ''}`).then(r => r.json()),
            fetch(`${_BASE}/search/tv?api_key=${_TMDB}&query=${encodeURIComponent(_titl)}${_year ? `&first_air_date_year=${_year}` : ''}`).then(r => r.json())
        ])

        const _all = [
            ...(_mRes.results || []).map(x => ({ ...x, _mt: 'movie' })),
            ...(_tRes.results  || []).map(x => ({ ...x, _mt: 'tv'    }))
        ].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))

        if (!_all.length) return reply(
            `╔═════════╗\n` +
            `║  🎬 *MOVIE SEARCH*\n` +
            `╚═════════╝\n\n` +
            `  ❌ *Not found:* _${text}_\n\n` +
            `  _Try a different spelling or add the year._\n` +
            `  _Example:_ *${prefix}movie Inception 2010*`
        )

        const _pick = _all[0]
        const _mt   = _pick._mt

        // Full details
        const _d = await fetch(`${_BASE}/${_mt}/${_pick.id}?api_key=${_TMDB}&append_to_response=credits`).then(r => r.json())

        const _isTV   = _mt === 'tv'
        const _icon   = _isTV ? '📺' : '🎬'
        const _tStr   = _isTV ? 'TV SERIES INFO' : 'MOVIE INFO'
        const _title2 = _na(_d.title || _d.name)
        const _yr2    = (_d.release_date || _d.first_air_date || '').slice(0, 4)
        const _genres = (_d.genres || []).map(g => g.name).join(', ') || '—'
        const _rt     = _isTV
            ? (_d.episode_run_time?.[0] ? `${_d.episode_run_time[0]} min/ep` : '—')
            : (_d.runtime ? `${_d.runtime} min` : '—')
        const _lang   = _na((_d.original_language || '').toUpperCase())
        const _score  = _d.vote_average
            ? `${_d.vote_average.toFixed(1)}/10 (${(_d.vote_count || 0).toLocaleString()} votes)`
            : '—'
        const _status = _na(_d.status)
        const _plot   = _na(_d.overview)
        const _poster = _d.poster_path ? `${_IMG}${_d.poster_path}` : null
        const _dir    = !_isTV
            ? (_d.credits?.crew?.find(c => c.job === 'Director')?.name || '—')
            : (_d.created_by?.map(c => c.name).join(', ') || '—')
        const _cast   = (_d.credits?.cast || []).slice(0, 5).map(c => c.name).join(', ') || '—'
        const _imdbId = _d.imdb_id || ''

        let _cap  = `╔═════════╗\n`
            _cap += `║  ${_icon} *${_tStr}*\n`
            _cap += `╚═════════╝\n\n`
            _cap += `  *${_title2}*  _(${_yr2 || '?'})_\n\n`
            _cap += `  ├ 🎭 *Genre*     › ${_genres}\n`
            _cap += `  ├ ⏱️  *Runtime*  › ${_rt}\n`
            _cap += `  ├ 🌍 *Language* › ${_lang}\n`
            _cap += `  ├ ⭐ *Rating*    › ${_score}\n`
            _cap += `  ├ 📋 *Status*   › ${_status}\n`
        if (_isTV) {
            _cap += `  ├ 📺 *Seasons*  › ${_na(_d.number_of_seasons)} seasons · ${_na(_d.number_of_episodes)} episodes\n`
        }
            _cap += `  ├ 🎬 *${_isTV ? 'Creator ' : 'Director'}* › ${_dir}\n`
            _cap += `  └ 🎭 *Cast*     › ${_cast}\n`
            _cap += `\n  *📝 Plot:*\n  _${_plot}_\n`
        if (_imdbId) _cap += `\n  🔗 https://www.imdb.com/title/${_imdbId}`

        if (_poster) {
            await X.sendMessage(m.chat, { image: { url: _poster }, caption: _cap }, { quoted: m })
        } else {
            reply(_cap)
        }

    } catch(e) {
        reply(`❌ *Movie search failed.*\n_${e.message || 'Please try again.'}_`)
    }
} break

case 'shazam': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
if (!m.quoted || !/audio|video/.test(m.quoted.mimetype || '')) return reply(`╔═════════╗\n║  🎵 *SHAZAM — SONG FINDER*\n╚═════════╝\n\n  └ Reply to an audio/video with *${prefix}shazam*\n  _Works with voice notes, music & video clips._`)
try {
await reply('🎵 _Listening and identifying the song, please wait..._')
// Download the media buffer
let mediaBuf = await m.quoted.download()
if (!mediaBuf || mediaBuf.length < 100) throw new Error('Failed to download media')
// Save to a temp file
let tmpFile = require("path").join(__dirname, "tmp", `shazam_${Date.now()}.mp3`)
fs.writeFileSync(tmpFile, mediaBuf)
// Upload to CatBox to get a public URL
let audioUrl = await CatBox(tmpFile)
fs.unlinkSync(tmpFile)
if (!audioUrl || !audioUrl.startsWith('http')) throw new Error('Failed to upload audio for recognition')
// Method 1: GiftedTech Shazam API
let shazamResult = null
try {
    let _gtSh = await fetch(`https://api.giftedtech.co.ke/api/search/shazam?apikey=${_giftedKey()}&url=${encodeURIComponent(audioUrl)}`, { signal: AbortSignal.timeout(30000) })
    let _gtShD = await _gtSh.json()
    if (_gtShD.success && _gtShD.result) shazamResult = _gtShD.result
} catch {}
if (shazamResult) {
    let s = shazamResult
    let caption = `╔═════════╗\n║  🎵 *SHAZAM RESULT*\n╚═════════╝\n\n`
    caption += `  🎼 *Title:* ${s.title || 'Unknown'}\n`
    caption += `  🎤 *Artist:* ${s.artist || 'Unknown'}\n`
    if (s.album) caption += `  💿 *Album:* ${s.album}\n`
    if (s.genre) caption += `  🎸 *Genre:* ${s.genre}\n`
    if (s.year) caption += `  📅 *Year:* ${s.year}\n`
    if (s.spotify) caption += `\n  🟢 *Spotify:* ${s.spotify}\n`
    if (s.apple_music) caption += `  🍎 *Apple Music:* ${s.apple_music}\n`
    if (s.coverart) {
        await X.sendMessage(m.chat, { image: { url: s.coverart }, caption }, { quoted: m })
    } else {
        await reply(caption)
    }
    break
}
// Method 2: AudD music recognition API (free, no key required)
let auddForm = new FormData()
auddForm.append('url', audioUrl)
auddForm.append('return', 'apple_music,spotify')
let auddRes = await axios.post('https://api.audd.io/', auddForm, {
    headers: { ...auddForm.getHeaders() },
    timeout: 25000
})
let auddData = auddRes.data
// If AudD returns no result, try again with the raw URL directly
if (!auddData?.result && audioUrl) {
    let retry = await axios.get(`https://api.audd.io/?url=${encodeURIComponent(audioUrl)}&return=apple_music,spotify`, { timeout: 20000 })
    auddData = retry.data
}
if (!auddData?.result) {
    // Fallback: try ACRCloud-compatible free endpoint
    let fallbackForm = new FormData()
    fallbackForm.append('url', audioUrl)
    let fallbackRes = await axios.post('https://api.audd.io/findLyrics/', fallbackForm, {
        headers: { ...fallbackForm.getHeaders() },
        timeout: 20000
    })
    if (fallbackRes.data?.status === 'success' && fallbackRes.data?.result?.length) {
        let topLyric = fallbackRes.data.result[0]
        return reply(`╔═════════╗\n║  🎵 *SONG FOUND*\n╚═════════╝\n\n  ├ 🎤 *Title*  › ${topLyric.title || 'Unknown'}\n  └ 👤 *Artist* › ${topLyric.artist || 'Unknown'}\n\n  _Lyrics match (fingerprint unavailable)._`)
    }
    return reply(`╔═════════╗\n║  🎵 *SHAZAM*\n╚═════════╝\n\n  ❌ Song not recognized.\n\n  ├ Use a longer clip (10–30 seconds)\n  ├ Ensure clear audio, minimal noise\n  └ Try the chorus or main melody`)
}
let r = auddData.result
// Build response
let lines = []
lines.push(`╔═════════╗`)
lines.push(`┃  🎵 *SONG IDENTIFIED!*`)
lines.push(`┗━━━━━━━━━━━━━━━━━━━━━━━┛`)
lines.push(``)
lines.push(`🎤 *Title:*   ${r.title || 'Unknown'}`)
lines.push(`👤 *Artist:*  ${r.artist || 'Unknown'}`)
if (r.album) lines.push(`💿 *Album:*   ${r.album}`)
if (r.release_date) lines.push(`📅 *Released:* ${r.release_date}`)
if (r.label) lines.push(`🏷️ *Label:*   ${r.label}`)
lines.push(``)
// Apple Music link
if (r.apple_music?.url) {
    lines.push(`🍎 *Apple Music:*`)
    lines.push(`${r.apple_music.url}`)
    lines.push(``)
}
// Spotify link
if (r.spotify?.external_urls?.spotify) {
    lines.push(`🟢 *Spotify:*`)
    lines.push(`${r.spotify.external_urls.spotify}`)
    lines.push(``)
}
// Song preview if available
if (r.apple_music?.previews?.[0]?.url) {
    lines.push(`🔊 *Preview available*`)
    lines.push(``)
}
lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`)
lines.push(`_Powered by TOOSII-XD ULTRA_`)
let replyText = lines.join('\n')
await reply(replyText)
// Send audio preview if Apple Music preview is available
if (r.apple_music?.previews?.[0]?.url) {
    try {
        let previewBuf = await getBuffer(r.apple_music.previews[0].url)
        if (previewBuf && previewBuf.length > 1000) {
            await X.sendMessage(m.chat, {
                audio: previewBuf,
                mimetype: 'audio/mp4',
                ptt: false
            }, { quoted: m })
        }
    } catch(pe) { /* Preview send failed silently */ }
}
} catch(e) {
console.log('[Shazam] Error:', e.message || e)
reply(`❌ *Shazam failed.*\n_${e.message || 'Unable to identify the song. Try again with a clearer or longer audio clip.'}_`)
}
} break

case 'fetch':
case 'get': {
    await X.sendMessage(m.chat, { react: { text: '📥', key: m.key } })
if (!text) return reply(`Example: ${prefix}fetch https://example.com/api`)
try {
let res = await fetch(text)
let contentType = res.headers.get('content-type') || ''
if (contentType.includes('json')) {
let data = await res.json()
reply(JSON.stringify(data, null, 2).slice(0, 4000))
} else if (contentType.includes('image')) {
let buffer = Buffer.from(await res.arrayBuffer())
await X.sendMessage(m.chat, { image: buffer }, { quoted: m })
} else if (contentType.includes('video')) {
let buffer = Buffer.from(await res.arrayBuffer())
await X.sendMessage(m.chat, { video: buffer }, { quoted: m })
} else if (contentType.includes('audio')) {
let buffer = Buffer.from(await res.arrayBuffer())
await X.sendMessage(m.chat, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: m })
} else {
let txt = await res.text()
reply(txt.slice(0, 4000))
}
} catch(e) { reply('Error: ' + e.message) }
} break

case 'ssweb':
case 'ss':
case 'ssphone':
case 'screenshot': {
    await X.sendMessage(m.chat, { react: { text: '📸', key: m.key } })
if (!text) return reply(`Example: ${prefix}ss https://google.com`)
try {
    let ssUrl = null
    // Method 1: GiftedTech ssphone (mobile phone frame)
    try {
        let r = await fetch(`https://api.giftedtech.co.ke/api/tools/ssphone?apikey=${_giftedKey()}&url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(30000) })
        let d = await r.json()
        if (d.success && d.result) ssUrl = d.result
    } catch {}
    // Method 2: thum.io fallback
    if (!ssUrl) ssUrl = `https://image.thum.io/get/width/1280/crop/720/noanimate/${text}`
    await X.sendMessage(m.chat, { image: { url: ssUrl }, caption: `📸 *Screenshot*\n🔗 ${text}` }, { quoted: m })
} catch(e) { reply('Error: ' + e.message) }
} break

case 'trt':
case 'translate': {
    await X.sendMessage(m.chat, { react: { text: '🌐', key: m.key } })
if (!text) return reply(`Example: ${prefix}trt en|hello world\nOr reply to a message: ${prefix}trt en`)
try {
let targetLang = 'en'
let inputText = ''
if (text.includes('|')) {
let parts = text.split('|')
targetLang = parts[0].trim()
inputText = parts.slice(1).join('|').trim()
} else if (m.quoted) {
targetLang = text.trim() || 'en'
inputText = m.quoted.text || ''
} else {
inputText = text
}
if (!inputText) return reply('No text to translate.')
let res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(inputText)}&langpair=auto|${targetLang}`)
let data = await res.json()
let translated = data.responseData?.translatedText || 'Translation failed.'
reply(`╔═════════╗\n║  🌐 *TRANSLATION*\n╚═════════╝\n\n  └ 🔤 *${targetLang.toUpperCase()}*\n\n${translated}`)
} catch(e) { reply('Error: ' + e.message) }
} break

case 'transcribe': {
    await X.sendMessage(m.chat, { react: { text: '🎙️', key: m.key } })
if (!m.quoted || !/audio/.test(m.quoted.mimetype || '')) return reply(`Reply to an audio with ${prefix}transcribe`)
reply('*Transcribe:* Audio transcription requires a paid API. Use AI commands with audio description instead.')
} break

case 'locate':
case 'location': {
    await X.sendMessage(m.chat, { react: { text: '📍', key: m.key } })
if (!text) return reply(`Example: ${prefix}location Nairobi, Kenya`)
try {
let res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=1`, { headers: { 'User-Agent': 'ToosiiBot/1.0' } })
let data = await res.json()
if (!data.length) return reply('Location not found.')
let loc = data[0]
await X.sendMessage(m.chat, { location: { degreesLatitude: parseFloat(loc.lat), degreesLongitude: parseFloat(loc.lon) }, caption: loc.display_name }, { quoted: m })
} catch(e) { reply('Error: ' + e.message) }
} break

case 'tourl': {
    await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
// Upload any media (image/video/audio/doc/sticker) and return a public CDN link
if (!m.quoted) return reply(`📎 *Reply to any media* (image, video, audio, doc, sticker) with *${prefix}tourl*`)
try {
    await reply('📤 _Uploading media..._')
    const _buf = await m.quoted.download()
    if (!_buf || _buf.length < 100) throw new Error('Download failed — media may have expired')
    // Write with correct extension based on mimetype
    const _mime = m.quoted.mimetype || m.quoted.msg?.mimetype || 'application/octet-stream'
    const _extMap = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','audio/mpeg':'mp3','audio/ogg':'ogg','audio/mp4':'m4a','application/pdf':'pdf'}
    const _ext = _extMap[_mime.split(';')[0].trim()] || 'bin'
    const _tmp = require("path").join(__dirname, "tmp", `tourl_${Date.now()}.${_ext}`)
    require('fs').writeFileSync(_tmp, _buf)
    const _url = await CatBox(_tmp)
    require('fs').unlinkSync(_tmp)
    if (!_url || !_url.startsWith('http')) throw new Error('Upload failed — try again')
    await X.sendMessage(m.chat, {
        text: `✅ *Media uploaded!*\n\n🔗 *URL:*\n${_url}\n\n📦 _Size: ${(_buf.length/1024).toFixed(1)} KB | Type: ${_mime.split(';')[0]}_`
    }, { quoted: m })
} catch(e) { reply(`❌ *tourl failed:* ${e.message}`) }
} break

case 'simage':
case 'timage':
case 'toimage': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
// Convert sticker (webp) → image (jpeg/png)
const _qmtype = m.quoted?.mtype || ''
const _qmime = m.quoted?.mimetype || m.quoted?.msg?.mimetype || ''
const _isSticker = _qmtype === 'stickerMessage' || /webp/.test(_qmime)
if (!m.quoted || !_isSticker) return reply(`🖼️ *Reply to a sticker* with *${prefix}toimage* to convert it to an image`)
try {
    await reply('🔄 _Converting sticker to image..._')
    const _buf = await m.quoted.download()
    if (!_buf || _buf.length < 100) throw new Error('Sticker download failed')
    // Use jimp to convert webp → jpeg since WA webp may be animated
    const _outPath = require("path").join(__dirname, "tmp", `toimage_${Date.now()}`)
    require('fs').writeFileSync(`${_outPath}.webp`, _buf)
    // ffmpeg: webp → png (handles both static and animated, takes first frame)
    await new Promise((resolve, reject) => {
        require('child_process').exec(
            `ffmpeg -y -i ${_outPath}.webp -vframes 1 -f image2 ${_outPath}.png`,
            (err) => err ? reject(err) : resolve()
        )
    })
    const _img = require('fs').readFileSync(`${_outPath}.png`)
    await X.sendMessage(m.chat, { image: _img, caption: '🖼️ *Sticker → Image*' }, { quoted: m })
    try { require('fs').unlinkSync(`${_outPath}.webp`); require('fs').unlinkSync(`${_outPath}.png`) } catch {}
} catch(e) { reply(`❌ *toimage failed:* ${e.message}`) }
} break

case 'totext': {
    await X.sendMessage(m.chat, { react: { text: '📝', key: m.key } })
// Extract text from an image using OCR via pollinations vision API
if (!m.quoted || !/image/.test(m.quoted.mimetype || m.quoted.msg?.mimetype || '')) {
    return reply(`📄 *Reply to an image* with *${prefix}totext* to extract all text from it\n\n_Works on screenshots, documents, signs, receipts, etc._`)
}
try {
    await reply('🔍 _Reading text from image..._')
    const _imgBuf = await m.quoted.download()
    if (!_imgBuf || _imgBuf.length < 100) throw new Error('Image download failed')
    const _mime = m.quoted.mimetype || m.quoted.msg?.mimetype || 'image/jpeg'
    const _b64 = _imgBuf.toString('base64')
    const _prompt = 'Extract ALL text from this image exactly as it appears. Preserve formatting, line breaks, and structure. If no text is found, say "No text detected."'
    let _extracted = null
    // Primary: pollinations base64 vision
    try {
        const { data: _d } = await axios.post('https://text.pollinations.ai/openai', {
            model: 'openai', max_tokens: 2000, stream: false,
            messages: [{ role: 'user', content: [
                { type: 'text', text: _prompt },
                { type: 'image_url', image_url: { url: `data:${_mime};base64,${_b64}` } }
            ]}]
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 })
        _extracted = _d?.choices?.[0]?.message?.content
    } catch {}
    // Fallback: upload to catbox then use URL
    if (!_extracted) {
        const _tmp = require("path").join(__dirname, "tmp", `totext_${Date.now()}.jpg`)
        require('fs').writeFileSync(_tmp, _imgBuf)
        const _uploadUrl = await CatBox(_tmp)
        require('fs').unlinkSync(_tmp)
        if (_uploadUrl && _uploadUrl.startsWith('http')) {
            const { data: _d2 } = await axios.post('https://text.pollinations.ai/openai', {
                model: 'openai', max_tokens: 2000, stream: false,
                messages: [{ role: 'user', content: [
                    { type: 'text', text: _prompt },
                    { type: 'image_url', image_url: { url: _uploadUrl } }
                ]}]
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 })
            _extracted = _d2?.choices?.[0]?.message?.content
        }
    }
    if (!_extracted) throw new Error('Could not extract text — try a clearer image')
    reply(`╔═════════╗\n║  📄 *EXTRACTED TEXT*\n╚═════════╝\n\n${_extracted}`)
} catch(e) { reply(`❌ *totext failed:* ${e.message}`) }
} break

case 'toaudio':
case 'tomp3': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
// Convert video → MP3 audio using ffmpeg
const _qmime2 = m.quoted?.mimetype || m.quoted?.msg?.mimetype || ''
if (!m.quoted || !/video|audio/.test(_qmime2)) return reply(`🎵 *Reply to a video* with *${prefix}tomp3* to extract its audio as MP3`)
try {
    await reply('🔄 _Extracting audio from video..._')
    const _vBuf = await m.quoted.download()
    if (!_vBuf || _vBuf.length < 100) throw new Error('Video download failed')
    const _vPath = require("path").join(__dirname, "tmp", `tomp3_in_${Date.now()}.mp4`)
    const _aPath = require("path").join(__dirname, "tmp", `tomp3_out_${Date.now()}.mp3`)
    require('fs').writeFileSync(_vPath, _vBuf)
    await new Promise((resolve, reject) => {
        require('child_process').exec(
            `ffmpeg -y -i "${_vPath}" -vn -acodec libmp3lame -ab 128k -ar 44100 "${_aPath}"`,
            { timeout: 120000 },
            (err, _so, se) => err ? reject(new Error(se || err.message)) : resolve()
        )
    })
    const _mp3 = require('fs').readFileSync(_aPath)
    await X.sendMessage(m.chat, {
        audio: _mp3, mimetype: 'audio/mpeg',
        fileName: `audio_${Date.now()}.mp3`
    }, { quoted: m })
    try { require('fs').unlinkSync(_vPath); require('fs').unlinkSync(_aPath) } catch {}
} catch(e) { reply(`❌ *tomp3 failed:* ${e.message}`) }
} break

case 'toppt':
case 'tovoice': {
    await X.sendMessage(m.chat, { react: { text: '🔊', key: m.key } })
// Convert any audio or video → WhatsApp voice note (ogg opus ptt)
const _qmime3 = m.quoted?.mimetype || m.quoted?.msg?.mimetype || ''
if (!m.quoted || !/audio|video/.test(_qmime3)) return reply(`🎤 *Reply to an audio or video* with *${prefix}toppt* to convert it to a voice note`)
try {
    await reply('🔄 _Converting to voice note..._')
    const _inBuf = await m.quoted.download()
    if (!_inBuf || _inBuf.length < 100) throw new Error('Media download failed')
    const _inExt = /video/.test(_qmime3) ? 'mp4' : 'mp3'
    const _inPath = require("path").join(__dirname, "tmp", `toppt_in_${Date.now()}.${_inExt}`)
    const _outPath = require("path").join(__dirname, "tmp", `toppt_out_${Date.now()}.ogg`)
    require('fs').writeFileSync(_inPath, _inBuf)
    await new Promise((resolve, reject) => {
        require('child_process').exec(
            `ffmpeg -y -i "${_inPath}" -vn -c:a libopus -b:a 64k -ar 48000 -ac 1 "${_outPath}"`,
            { timeout: 120000 },
            (err, _so, se) => err ? reject(new Error(se || err.message)) : resolve()
        )
    })
    const _ogg = require('fs').readFileSync(_outPath)
    await X.sendMessage(m.chat, {
        audio: _ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true
    }, { quoted: m })
    try { require('fs').unlinkSync(_inPath); require('fs').unlinkSync(_outPath) } catch {}
} catch(e) { reply(`❌ *toppt failed:* ${e.message}`) }
} break

case 'removebg': {
    await X.sendMessage(m.chat, { react: { text: '✂️', key: m.key } })
if (!m.quoted || !/image/.test(m.quoted.mimetype || m.quoted.msg?.mimetype || '')) {
    return reply(`🖼️ *Reply to an image* with *${prefix}removebg* to remove its background`)
}
try {
    await reply('✂️ _Removing background, please wait..._')
    const _rBuf = await m.quoted.download()
    if (!_rBuf || _rBuf.length < 100) throw new Error('Could not download the image')
    let _result = null

    // ── Helper: download image from URL into Buffer ──────────────────
    const _dlImg = async (url) => {
        const _r = await fetch(url, { signal: AbortSignal.timeout(20000) })
        if (!_r.ok) throw new Error(`HTTP ${_r.status}`)
        return Buffer.from(await _r.arrayBuffer())
    }

    // ── Method 1: GiftedTech removebgv2 (returns JSON with result URL) ──
    if (!_result) {
        try {
            const _tmpG = require("path").join(__dirname, "tmp", `rbg_${Date.now()}.jpg`)
            require('fs').writeFileSync(_tmpG, _rBuf)
            const _catUrl = await CatBox(_tmpG)
            try { require('fs').unlinkSync(_tmpG) } catch {}
            if (_catUrl) {
                const _gtRes = await fetch(`https://api.giftedtech.co.ke/api/tools/removebgv2?apikey=${_giftedKey()}&url=${encodeURIComponent(_catUrl)}`, { signal: AbortSignal.timeout(45000) })
                const _ctype = _gtRes.headers.get('content-type') || ''
                if (_ctype.includes('image')) {
                    // Direct image response
                    _result = Buffer.from(await _gtRes.arrayBuffer())
                } else {
                    // JSON response — extract result URL and download it
                    const _gtJson = await _gtRes.json()
                    const _imgUrl = _gtJson?.result?.image_url || _gtJson?.result?.url || _gtJson?.result
                    if (_imgUrl && typeof _imgUrl === 'string' && _imgUrl.startsWith('http')) {
                        _result = await _dlImg(_imgUrl)
                    }
                }
            }
        } catch {}
    }

    // ── Method 2: Python rembg (local AI, no API limits) ─────────────
    if (!_result) {
        try {
            const _os = require('os'), _path = require('path'), _cp = require('child_process')
            const _inFile  = _path.join(_os.tmpdir(), `rbg_in_${Date.now()}.jpg`)
            const _outFile = _path.join(_os.tmpdir(), `rbg_out_${Date.now()}.png`)
            require('fs').writeFileSync(_inFile, _rBuf)
            // Install rembg if needed (quiet, user install)
            const _pyScript = `
import sys, subprocess
try:
    from rembg import remove
except ImportError:
    subprocess.run([sys.executable,'-m','pip','install','rembg','onnxruntime','--quiet','--user'], check=True)
    from rembg import remove
with open('${_inFile.replace(/\\/g,'/')}','rb') as f:
    data = f.read()
out = remove(data)
with open('${_outFile.replace(/\\/g,'/')}','wb') as f:
    f.write(out)
print('ok')
`
            await new Promise((res, rej) => {
                const _p = _cp.spawn('python3', ['-c', _pyScript], { timeout: 120000 })
                let _out = ''
                _p.stdout.on('data', d => _out += d)
                _p.on('close', code => code === 0 && _out.includes('ok') ? res() : rej(new Error('rembg failed')))
                _p.on('error', rej)
            })
            if (require('fs').existsSync(_outFile)) {
                _result = require('fs').readFileSync(_outFile)
            }
            try { require('fs').unlinkSync(_inFile); require('fs').unlinkSync(_outFile) } catch {}
        } catch {}
    }

    // ── Method 3: remove.bg (if API key configured) ──────────────────
    if (!_result) {
        const _rbKey = process.env.REMOVEBG_KEY || global.removebgKey || ''
        if (_rbKey) {
            try {
                const _fd = new FormData()
                _fd.append('image_file', _rBuf, { filename: 'image.jpg', contentType: 'image/jpeg' })
                _fd.append('size', 'auto')
                const _rbRes = await axios.post('https://api.remove.bg/v1.0/removebg', _fd, {
                    headers: { ..._fd.getHeaders(), 'X-Api-Key': _rbKey },
                    responseType: 'arraybuffer', timeout: 30000
                })
                if (_rbRes.status === 200) _result = Buffer.from(_rbRes.data)
            } catch {}
        }
    }

    // ── Method 4: Clipdrop (if key configured) ───────────────────────
    if (!_result) {
        const _cdKey = process.env.CLIPDROP_KEY || global.clipdropKey || ''
        if (_cdKey) {
            try {
                const _fd4 = new FormData()
                _fd4.append('image_file', _rBuf, { filename: 'image.jpg', contentType: 'image/jpeg' })
                const _cdRes = await axios.post('https://clipdrop-api.co/remove-background/v1', _fd4, {
                    headers: { ..._fd4.getHeaders(), 'x-api-key': _cdKey },
                    responseType: 'arraybuffer', timeout: 30000
                })
                if (_cdRes.status === 200) _result = Buffer.from(_cdRes.data)
            } catch {}
        }
    }

    if (!_result) throw new Error('Background removal failed. The service may be busy — please try again in a moment.')
    await X.sendMessage(m.chat, { image: _result, caption: '✅ *Background removed successfully!*\n_✂️ Powered by Toosii Tech_' }, { quoted: m })
} catch(e) { reply(`❌ *removebg failed:* ${e.message}`) }
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Game Commands
case 'tictactoe':
case 'ttt': {
    await X.sendMessage(m.chat, { react: { text: '❎', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
let tttUser = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null
if (!tttUser) return reply(`Usage: ${prefix}ttt @opponent`)
if (tttUser === sender) return reply('You cannot play against yourself!')
if (!global.tttGames) global.tttGames = {}
let gameId = m.chat
if (global.tttGames[gameId]) return reply('A game is already in progress in this chat. Use .tttend to end it.')
global.tttGames[gameId] = { board: [' ',' ',' ',' ',' ',' ',' ',' ',' '], players: { X: sender, O: tttUser }, turn: 'X' }
let boardDisplay = (b) => `\`\`\`\n ${b[0]} | ${b[1]} | ${b[2]}\n---+---+---\n ${b[3]} | ${b[4]} | ${b[5]}\n---+---+---\n ${b[6]} | ${b[7]} | ${b[8]}\n\`\`\``
X.sendMessage(from, { text: `*Tic Tac Toe*\n\n@${sender.split('@')[0]} (X) vs @${tttUser.split('@')[0]} (O)\n\n${boardDisplay(global.tttGames[gameId].board)}\n\n@${sender.split('@')[0]}'s turn (X)\nReply with a number (1-9) to place your mark.`, mentions: [sender, tttUser] }, { quoted: m })
} break

case 'tttend': {
    await X.sendMessage(m.chat, { react: { text: '🏁', key: m.key } })
if (!global.tttGames || !global.tttGames[m.chat]) return reply('No game in progress.')
delete global.tttGames[m.chat]
reply('*Game ended.*')
} break

case 'connect4':
case 'c4': {
    await X.sendMessage(m.chat, { react: { text: '🔴', key: m.key } })
reply(`╔═════════╗\n║  🔴 *CONNECT 4*\n╚═════════╝\n\n  🔴🟡🔴🟡🔴🟡🔴\n  ⬜⬜⬜⬜⬜⬜⬜\n  ⬜⬜⬜⬜⬜⬜⬜\n  ⬜⬜⬜⬜⬜⬜⬜\n  ⬜⬜⬜⬜⬜⬜⬜\n  ⬜⬜⬜⬜⬜⬜⬜\n\n  🎮 *Not yet available as a live game.*\n  ├ Play Tic Tac Toe instead:\n  └ *${prefix}ttt* — start a game now!`)
} break

case 'hangman': {
    await X.sendMessage(m.chat, { react: { text: '🎯', key: m.key } })
if (!global.hangmanGames) global.hangmanGames = {}
if (global.hangmanGames[m.chat]) return reply('A hangman game is already in progress! Use .hangmanend to end it.')
let words = ['javascript', 'python', 'programming', 'computer', 'algorithm', 'database', 'internet', 'software', 'hardware', 'keyboard', 'function', 'variable', 'boolean', 'whatsapp', 'telegram', 'android', 'network', 'security', 'elephant', 'universe']
let word = words[Math.floor(Math.random() * words.length)]
global.hangmanGames[m.chat] = { word, guessed: [], lives: 6, players: [sender] }
let display = word.split('').map(l => '_').join(' ')
reply(`╔═════════╗\n║  🪢 *HANGMAN*\n╚═════════╝\n\n  ${display}\n\n  ├ ❤️  Lives › 6\n  └ 🔡 Letters › ${word.length}\n\n  _Send a single letter to guess!_`)
} break

case 'hangmanend': {
    await X.sendMessage(m.chat, { react: { text: '🏁', key: m.key } })
if (!global.hangmanGames || !global.hangmanGames[m.chat]) return reply('No hangman game in progress.')
reply(`╔═════════╗\n║  🏁 *GAME ENDED*\n╚═════════╝\n\n  └ 🔡 *Word* › *${global.hangmanGames[m.chat].word}*`)
delete global.hangmanGames[m.chat]
} break

case 'trivia': {
    await X.sendMessage(m.chat, { react: { text: '🧠', key: m.key } })
try {
let res = await fetch('https://opentdb.com/api.php?amount=1&type=multiple')
let data = await res.json()
if (!data.results || !data.results.length) return reply('Failed to fetch trivia.')
let q = data.results[0]
let answers = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5)
let decode = (str) => str.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'")
if (!global.triviaGames) global.triviaGames = {}
global.triviaGames[m.chat] = { answer: decode(q.correct_answer).toLowerCase(), timeout: setTimeout(() => { if (global.triviaGames[m.chat]) { reply(`⏰ *Time up!*  The answer was: *${decode(q.correct_answer)}*`); delete global.triviaGames[m.chat] } }, 30000) }
let qText = `*Trivia (${decode(q.category)})*\nDifficulty: ${q.difficulty}\n\n${decode(q.question)}\n\n`
answers.forEach((a, i) => qText += `${String.fromCharCode(65+i)}. ${decode(a)}\n`)
qText += `\nAnswer within 30 seconds!`
reply(qText)
} catch(e) { reply('Error: ' + e.message) }
} break

case 'answer': {
    await X.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
if (!global.triviaGames || !global.triviaGames[m.chat]) return reply('No trivia in progress. Use .trivia to start.')
let userAnswer = text?.toLowerCase().trim()
if (!userAnswer) return reply('Please provide your answer.')
if (userAnswer === global.triviaGames[m.chat].answer || userAnswer === global.triviaGames[m.chat].answer.charAt(0)) {
clearTimeout(global.triviaGames[m.chat].timeout)
delete global.triviaGames[m.chat]
reply(`*Correct!* Well done, @${sender.split('@')[0]}! 🎉`)
} else reply(`❌ *Wrong!* Try again or wait for timeout.`)
} break

case 'truth': {
    await X.sendMessage(m.chat, { react: { text: '💬', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let truths = ['What is your biggest fear?', 'What is the most embarrassing thing you have done?', 'What is a secret you have never told anyone?', 'Who was your first crush?', 'What is the worst lie you have told?', 'What is your guilty pleasure?', 'Have you ever cheated on a test?', 'What is the most childish thing you still do?', 'What is your biggest insecurity?', 'What was your most awkward date?', 'Have you ever been caught lying?', 'What is the craziest thing on your bucket list?', 'What is the weirdest dream you have had?', 'If you could be invisible for a day what would you do?', 'What is the most stupid thing you have ever done?']
reply(`╔═════════╗\n║  💬 *TRUTH*\n╚═════════╝\n\n  ${truths[Math.floor(Math.random() * truths.length)]}`)
} break

case 'dare': {
    await X.sendMessage(m.chat, { react: { text: '🎯', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let dares = ['Send a voice note singing your favorite song.', 'Change your profile picture to something funny for 1 hour.', 'Send the last photo in your gallery.', 'Text your crush right now.', 'Do 10 pushups and send a video.', 'Send a voice note doing your best animal impression.', 'Let someone else send a message from your phone.', 'Share your screen time report.', 'Send a selfie right now without filters.', 'Call the 5th person in your contacts and sing happy birthday.', 'Post a childhood photo in the group.', 'Let the group choose your status for 24 hours.', 'Send a voice note speaking in an accent.', 'Do a handstand and send proof.', 'Type with your eyes closed for the next message.']
reply(`╔═════════╗\n║  🔥 *DARE*\n╚═════════╝\n\n  ${dares[Math.floor(Math.random() * dares.length)]}`)
} break

case '8ball': {
    await X.sendMessage(m.chat, { react: { text: '🎱', key: m.key } })
if (!text) return reply(`Example: ${prefix}8ball Will I pass my exam?`)
let responses8 = ['It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes definitely.', 'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.', 'Don\'t count on it.', 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.']
reply(`╔═════════╗\n║  🎱 *MAGIC 8-BALL*\n╚═════════╝\n\n  ❓ *${text}*\n\n  🎱 ${responses8[Math.floor(Math.random() * responses8.length)]}`)
} break

case 'cf':
case 'coinflip':
case 'flip': {
    await X.sendMessage(m.chat, { react: { text: '🪙', key: m.key } })
let coin = Math.random() < 0.5 ? 'Heads' : 'Tails'
reply(`🪙 *Coin Flip* › *${coin}!*`)
} break

case 'dice':
case 'roll': {
    await X.sendMessage(m.chat, { react: { text: '🎲', key: m.key } })
let sides = parseInt(args[0]) || 6
let result = Math.floor(Math.random() * sides) + 1
reply(`🎲 *Dice Roll (d${sides})* › *${result}*`)
} break

case 'rps': {
    await X.sendMessage(m.chat, { react: { text: '✊', key: m.key } })
let choices = ['rock', 'paper', 'scissors']
let userChoice = (args[0] || '').toLowerCase()
if (!['rock', 'paper', 'scissors', 'r', 'p', 's'].includes(userChoice)) return reply(`Usage: ${prefix}rps rock/paper/scissors`)
if (userChoice === 'r') userChoice = 'rock'
if (userChoice === 'p') userChoice = 'paper'
if (userChoice === 's') userChoice = 'scissors'
let botChoice = choices[Math.floor(Math.random() * 3)]
let rpsResult = userChoice === botChoice ? 'Draw!' : (userChoice === 'rock' && botChoice === 'scissors') || (userChoice === 'paper' && botChoice === 'rock') || (userChoice === 'scissors' && botChoice === 'paper') ? 'You win! 🎉' : 'You lose! 😢'
reply(`╔═════════╗\n║  ✂️  *ROCK PAPER SCISSORS*\n╚═════════╝\n\n  ├ 👤 *You* › ${userChoice}\n  ├ 🤖 *Bot* › ${botChoice}\n  └ 🏆 *${rpsResult}*`)
} break

case 'slot': {
    await X.sendMessage(m.chat, { react: { text: '🎰', key: m.key } })
let symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '🔔']
let s1 = symbols[Math.floor(Math.random() * symbols.length)]
let s2 = symbols[Math.floor(Math.random() * symbols.length)]
let s3 = symbols[Math.floor(Math.random() * symbols.length)]
let slotWin = s1 === s2 && s2 === s3 ? '🎉 JACKPOT! You won!' : s1 === s2 || s2 === s3 || s1 === s3 ? '😃 Two match! Small win!' : '😢 No match. Try again!'
reply(`╔═════════╗\n║  🎰 *SLOT MACHINE*\n╚═════════╝\n\n  [ ${s1} | ${s2} | ${s3} ]\n\n  ${slotWin}`)
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Fun & Social Commands
case 'compliment': {
    await X.sendMessage(m.chat, { react: { text: '😊', key: m.key } })
let compliments = ['You are an amazing person!', 'Your smile lights up the room!', 'You are incredibly talented!', 'The world is better with you in it!', 'You have a heart of gold!', 'Your kindness is inspiring!', 'You are a ray of sunshine!', 'You make everything better!', 'You are one of a kind!', 'Your energy is contagious!']
let target = (m.mentionedJid && m.mentionedJid[0]) ? `@${m.mentionedJid[0].split('@')[0]}` : pushname
reply(`╔═════════╗\n║  💐 *COMPLIMENT*\n╚═════════╝\n\n  👤 *${target}*\n  ${compliments[Math.floor(Math.random() * compliments.length)]}`)
} break

case 'insult': {
    await X.sendMessage(m.chat, { react: { text: '😤', key: m.key } })
    let _insultText = null
    try {
        let _ep = await fetch('https://eliteprotech-apis.zone.id/insult', { signal: AbortSignal.timeout(8000) })
        let _epd = await _ep.json()
        if (_epd.success && _epd.insult) _insultText = _epd.insult
    } catch {}
    if (!_insultText) {
        let _localInsults = ['You are the human equivalent of a participation award.', 'If you were a spice, you would be flour.', 'You bring everyone so much joy when you leave.', 'You are like a cloud. When you disappear it is a beautiful day.', 'You are proof that even evolution makes mistakes.', 'Light travels faster than sound, which is why you seemed bright until you spoke.']
        _insultText = _localInsults[Math.floor(Math.random() * _localInsults.length)]
    }
    let _insultTarget = (m.mentionedJid && m.mentionedJid[0]) ? `@${m.mentionedJid[0].split('@')[0]}` : pushname
    reply(`╔═════════╗\n║  🔥 *ROAST*\n╚═════════╝\n\n  👤 *${_insultTarget}*\n  ${_insultText}`)
} break

  case 'story':
  case 'tellstory':
  case 'generatestory': {
      await X.sendMessage(m.chat, { react: { text: '📖', key: m.key } })
      if (!text) return reply(`📖 *Story Generator*\n\nUsage: ${prefix}story [topic or theme]\nExamples:\n• ${prefix}story a hero saves the world\n• ${prefix}story two friends lost in the forest`)
      try {
          await reply('📖 _Writing your story, please wait..._')
          let _epS = await fetch(`https://eliteprotech-apis.zone.id/story?text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(30000) })
          let _epSd = await _epS.json()
          if (_epSd.success && _epSd.story) {
              let _storyText = _epSd.story
              let _header = `╔═════════╗\n║  📖 *AI STORY*\n╚═════════╝\n\n`
              // Split long stories into chunks of 3500 chars
              if (_storyText.length <= 3500) {
                  await reply(_header + _storyText)
              } else {
                  await reply(_header + _storyText.slice(0, 3500) + '...')
                  for (let _i = 3500; _i < _storyText.length; _i += 3500) {
                      await reply(_storyText.slice(_i, _i + 3500))
                  }
              }
          } else {
              reply('❌ Could not generate story. Please try again.')
          }
      } catch(e) { reply('❌ Story generation failed: ' + e.message) }
  } break
  

case 'flirt': {
    await X.sendMessage(m.chat, { react: { text: '😏', key: m.key } })
let flirts = ['Are you a magician? Because whenever I look at you, everyone else disappears.', 'Do you have a map? I keep getting lost in your eyes.', 'Are you a campfire? Because you are hot and I want s\'more.', 'Is your name Google? Because you have everything I have been searching for.', 'Do you believe in love at first sight, or should I walk by again?', 'If beauty were time, you would be an eternity.']
reply(`╔═════════╗\n║  💘 *FLIRT*\n╚═════════╝\n\n  ${flirts[Math.floor(Math.random() * flirts.length)]}`)
} break

case 'shayari': {
    await X.sendMessage(m.chat, { react: { text: '✨', key: m.key } })
try {
    let _gs = await fetch('https://api.giftedtech.co.ke/api/fun/shayari?apikey=${_giftedKey()}', { signal: AbortSignal.timeout(10000) })
    let _gsd = await _gs.json()
    if (_gsd.success && _gsd.result) return reply(`╔═════════╗\n║  📜 *SHAYARI*\n╚═════════╝\n\n  ${_gsd.result}`)
} catch {}
let shayaris = ['Dil mein tere liye jagah hai,\nPar tu door hai, yeh kya wajah hai.', 'Teri yaad mein hum pagal hue,\nDuniya se hum bekhabar hue.', 'Mohabbat ka koi mol nahi,\nDil hai yeh koi phool nahi.', 'Zindagi mein teri kami hai,\nHar khushi adhuri si hai.', 'Tere bina zindagi se koi shikwa nahi,\nTere bina zindagi hai toh kya.']
reply(`╔═════════╗\n║  📜 *SHAYARI*\n╚═════════╝\n\n  ${shayaris[Math.floor(Math.random() * shayaris.length)]}`)
} break

case 'goodnight': {
    await X.sendMessage(m.chat, { react: { text: '🌙', key: m.key } })
try {
    let _ggn = await fetch('https://api.giftedtech.co.ke/api/fun/goodnight?apikey=${_giftedKey()}', { signal: AbortSignal.timeout(10000) })
    let _ggnd = await _ggn.json()
    if (_ggnd.success && _ggnd.result) return reply(`╔═════════╗\n║  🌙 *GOOD NIGHT*\n╚═════════╝\n\n  ${_ggnd.result}`)
} catch {}
let gn = ['Sweet dreams! May tomorrow bring you joy. 🌙', 'Good night! Sleep tight and don\'t let the bugs bite! 💤', 'Wishing you a peaceful night full of beautiful dreams. ✨', 'Close your eyes and let the stars guide your dreams. 🌟', 'Good night! Tomorrow is a new opportunity. Rest well! 😴']
reply(`╔═════════╗\n║  🌙 *GOOD NIGHT*\n╚═════════╝\n\n  ${gn[Math.floor(Math.random() * gn.length)]}`)
} break

case 'roseday': {
    await X.sendMessage(m.chat, { react: { text: '🌹', key: m.key } })
try {
    let _gr = await fetch('https://api.giftedtech.co.ke/api/fun/roseday?apikey=${_giftedKey()}', { signal: AbortSignal.timeout(10000) })
    let _grd = await _gr.json()
    if (_grd.success && _grd.result) return reply(`╔═════════╗\n║  🌹 *ROSE DAY*\n╚═════════╝\n\n  ${_grd.result}`)
} catch {}
reply('🌹 *Happy Rose Day!* 🌹\nRoses are red, violets are blue, sending this beautiful rose just for you! May your day be as beautiful as a garden full of roses.')
} break

case 'character': {
    await X.sendMessage(m.chat, { react: { text: '🎌', key: m.key } })
let characters = ['Naruto Uzumaki', 'Goku', 'Luffy', 'Batman', 'Spider-Man', 'Iron Man', 'Sherlock Holmes', 'Harry Potter', 'Pikachu', 'Mario', 'Sonic', 'Link (Zelda)', 'Levi Ackerman', 'Tanjiro Kamado', 'Eren Yeager', 'Gojo Satoru']
reply(`╔═════════╗\n║  🎭 *RANDOM CHARACTER*\n╚═════════╝\n\n  ${characters[Math.floor(Math.random() * characters.length)]}`)
} break

case 'ship': {
    await X.sendMessage(m.chat, { react: { text: '💑', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
if (!m.isGroup) return reply(mess.OnlyGrup)
let members = participants.map(p => p.id)
let p1 = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : members[Math.floor(Math.random() * members.length)]
let p2 = m.mentionedJid && m.mentionedJid[1] ? m.mentionedJid[1] : members[Math.floor(Math.random() * members.length)]
let shipPercent = Math.floor(Math.random() * 101)
let bar = '█'.repeat(Math.floor(shipPercent/10)) + '░'.repeat(10 - Math.floor(shipPercent/10))
X.sendMessage(from, { text: `*💕 Love Ship 💕*\n\n@${p1.split('@')[0]} ❤️ @${p2.split('@')[0]}\n\n[${bar}] ${shipPercent}%\n\n${shipPercent > 80 ? 'Perfect match! 💕' : shipPercent > 50 ? 'Good chemistry! 💖' : shipPercent > 30 ? 'There is potential! 💛' : 'Not meant to be... 💔'}`, mentions: [p1, p2] }, { quoted: m })
} break

case 'simp': {
    await X.sendMessage(m.chat, { react: { text: '😍', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let simpTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : sender
let simpLevel = Math.floor(Math.random() * 101)
X.sendMessage(from, { text: `*Simp Meter:*\n@${simpTarget.split('@')[0]}\n\n${'🟩'.repeat(Math.floor(simpLevel/10))}${'⬜'.repeat(10 - Math.floor(simpLevel/10))} ${simpLevel}%\n\n${simpLevel > 80 ? 'MAXIMUM SIMP! 😂' : simpLevel > 50 ? 'Moderate simp 😏' : 'Not a simp 😎'}`, mentions: [simpTarget] }, { quoted: m })
} break

case 'wasted': {
    await X.sendMessage(m.chat, { react: { text: '💀', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let wastedTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : sender
X.sendMessage(from, { text: `*WASTED*\n\n@${wastedTarget.split('@')[0]} is WASTED 💀\n\nR.I.P.`, mentions: [wastedTarget] }, { quoted: m })
} break

case 'stupid':
case 'iq': {
    await X.sendMessage(m.chat, { react: { text: '🧠', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let iqTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : sender
let iqScore = Math.floor(Math.random() * 80) + 70
const iqMsg = iqScore > 130 ? 'Genius level! 🧠💡' : iqScore > 110 ? 'Above average mind 🎓' : iqScore > 90 ? 'Average intelligence 😊' : 'Room to grow! 📚'
X.sendMessage(from, { text: `╔═════════╗\n║  🧠 *IQ METER*\n╚═════════╝\n\n  👤 @${iqTarget.split('@')[0]}\n\n  ${'🧠'.repeat(Math.min(10,Math.floor(iqScore/15)))}${'⬜'.repeat(10 - Math.min(10,Math.floor(iqScore/15)))} *IQ: ${iqScore}*\n\n  _${iqMsg}_`, mentions: [iqTarget] }, { quoted: m })
} break

case 'joke': {
    await X.sendMessage(m.chat, { react: { text: '😂', key: m.key } })
try {
    let jokeText = null
    try {
        let _gj = await fetch('https://api.giftedtech.co.ke/api/fun/jokes?apikey=${_giftedKey()}', { signal: AbortSignal.timeout(10000) })
        let _gjd = await _gj.json()
        if (_gjd.success && _gjd.result) jokeText = _gjd.result
    } catch {}
    if (!jokeText) {
        let res = await fetch('https://v2.jokeapi.dev/joke/Any?safe-mode', { signal: AbortSignal.timeout(10000) })
        let data = await res.json()
        jokeText = data.type === 'single' ? data.joke : `${data.setup}\n\n  ${data.delivery}`
    }
    reply(`╔═════════╗\n║  😂 *JOKE*\n╚═════════╝\n\n  ${jokeText}`)
} catch { reply('Could not fetch a joke right now.') }
} break

case 'quote':
case 'motivation': {
    await X.sendMessage(m.chat, { react: { text: '💪', key: m.key } })
const motivations = [
// Success & Hard Work
{ q: "The only way to do great work is to love what you do.", a: "Steve Jobs" },
{ q: "Success is not final, failure is not fatal: it is the courage to continue that counts.", a: "Winston Churchill" },
{ q: "Don't watch the clock; do what it does. Keep going.", a: "Sam Levenson" },
{ q: "The secret of getting ahead is getting started.", a: "Mark Twain" },
{ q: "It always seems impossible until it's done.", a: "Nelson Mandela" },
{ q: "Hard work beats talent when talent doesn't work hard.", a: "Tim Notke" },
{ q: "Success usually comes to those who are too busy to be looking for it.", a: "Henry David Thoreau" },
{ q: "The difference between ordinary and extraordinary is that little extra.", a: "Jimmy Johnson" },
{ q: "Opportunities don't happen. You create them.", a: "Chris Grosser" },
{ q: "Don't be afraid to give up the good to go for the great.", a: "John D. Rockefeller" },
{ q: "I find that the harder I work, the more luck I seem to have.", a: "Thomas Jefferson" },
{ q: "There are no shortcuts to any place worth going.", a: "Beverly Sills" },
{ q: "Success is walking from failure to failure with no loss of enthusiasm.", a: "Winston Churchill" },
{ q: "The road to success and the road to failure are almost exactly the same.", a: "Colin R. Davis" },
{ q: "A successful man is one who can lay a firm foundation with the bricks others have thrown at him.", a: "David Brinkley" },
// Perseverance & Resilience
{ q: "Fall seven times, stand up eight.", a: "Japanese Proverb" },
{ q: "The man who moves a mountain begins by carrying away small stones.", a: "Confucius" },
{ q: "You don't have to be great to start, but you have to start to be great.", a: "Zig Ziglar" },
{ q: "Our greatest glory is not in never falling, but in rising every time we fall.", a: "Confucius" },
{ q: "Strength does not come from physical capacity. It comes from an indomitable will.", a: "Mahatma Gandhi" },
{ q: "Tough times never last, but tough people do.", a: "Robert H. Schuller" },
{ q: "The darkest hour has only sixty minutes.", a: "Morris Mandel" },
{ q: "Rock bottom became the solid foundation on which I rebuilt my life.", a: "J.K. Rowling" },
{ q: "When you reach the end of your rope, tie a knot in it and hang on.", a: "Franklin D. Roosevelt" },
{ q: "Even the darkest night will end and the sun will rise.", a: "Victor Hugo" },
{ q: "You may have to fight a battle more than once to win it.", a: "Margaret Thatcher" },
{ q: "The gem cannot be polished without friction, nor man perfected without trials.", a: "Chinese Proverb" },
{ q: "Hardships often prepare ordinary people for an extraordinary destiny.", a: "C.S. Lewis" },
{ q: "Endurance is not just the ability to bear a hard thing, but to turn it into glory.", a: "William Barclay" },
{ q: "Character cannot be developed in ease and quiet. Only through experience of trial and suffering can the soul be strengthened.", a: "Helen Keller" },
// Mindset & Growth
{ q: "Whether you think you can or you think you can't, you're right.", a: "Henry Ford" },
{ q: "The mind is everything. What you think you become.", a: "Buddha" },
{ q: "Your life does not get better by chance, it gets better by change.", a: "Jim Rohn" },
{ q: "The only limit to our realization of tomorrow is our doubts of today.", a: "Franklin D. Roosevelt" },
{ q: "It is during our darkest moments that we must focus to see the light.", a: "Aristotle" },
{ q: "Believe you can and you're halfway there.", a: "Theodore Roosevelt" },
{ q: "You are never too old to set another goal or to dream a new dream.", a: "C.S. Lewis" },
{ q: "Act as if what you do makes a difference. It does.", a: "William James" },
{ q: "What we think, we become.", a: "Buddha" },
{ q: "Keep your face always toward the sunshine, and shadows will fall behind you.", a: "Walt Whitman" },
{ q: "In the middle of every difficulty lies opportunity.", a: "Albert Einstein" },
{ q: "We become what we repeatedly do.", a: "Aristotle" },
{ q: "Change your thoughts and you change your world.", a: "Norman Vincent Peale" },
{ q: "You have power over your mind, not outside events. Realize this, and you will find strength.", a: "Marcus Aurelius" },
{ q: "Everything you've ever wanted is on the other side of fear.", a: "George Addair" },
// Dreams & Vision
{ q: "The future belongs to those who believe in the beauty of their dreams.", a: "Eleanor Roosevelt" },
{ q: "Dream big and dare to fail.", a: "Norman Vaughan" },
{ q: "All our dreams can come true, if we have the courage to pursue them.", a: "Walt Disney" },
{ q: "The biggest adventure you can take is to live the life of your dreams.", a: "Oprah Winfrey" },
{ q: "Go confidently in the direction of your dreams. Live the life you have imagined.", a: "Henry David Thoreau" },
{ q: "A dream doesn't become reality through magic; it takes sweat, determination and hard work.", a: "Colin Powell" },
{ q: "You are never too old to set another goal or to dream a new dream.", a: "Les Brown" },
{ q: "Dreams don't work unless you do.", a: "John C. Maxwell" },
{ q: "The only way to achieve the impossible is to believe it is possible.", a: "Charles Kingsleigh" },
{ q: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", a: "Ralph Waldo Emerson" },
// Courage & Action
{ q: "Courage is not the absence of fear, but action in spite of it.", a: "Mark Twain" },
{ q: "Do one thing every day that scares you.", a: "Eleanor Roosevelt" },
{ q: "You miss 100% of the shots you don't take.", a: "Wayne Gretzky" },
{ q: "The secret to getting ahead is getting started.", a: "Mark Twain" },
{ q: "Don't count the days, make the days count.", a: "Muhammad Ali" },
{ q: "Life is short, and it's up to you to make it sweet.", a: "Sarah Louise Delany" },
{ q: "The way to get started is to quit talking and begin doing.", a: "Walt Disney" },
{ q: "If you want to live a happy life, tie it to a goal, not to people or things.", a: "Albert Einstein" },
{ q: "First, think. Then dream. Then dare.", a: "Walt Disney" },
{ q: "Just do it.", a: "Nike" },
{ q: "Stop waiting for things to happen. Go out and make them happen.", a: "Unknown" },
{ q: "You don't need to see the whole staircase, just take the first step.", a: "Martin Luther King Jr." },
{ q: "Someone is sitting in the shade today because someone planted a tree a long time ago.", a: "Warren Buffett" },
{ q: "Inaction breeds doubt and fear. Action breeds confidence and courage.", a: "Dale Carnegie" },
// Purpose & Meaning
{ q: "He who has a why to live can bear almost any how.", a: "Friedrich Nietzsche" },
{ q: "The purpose of life is a life of purpose.", a: "Robert Byrne" },
{ q: "Life is not measured by the number of breaths we take, but by the moments that take our breath away.", a: "Maya Angelou" },
{ q: "You only live once, but if you do it right, once is enough.", a: "Mae West" },
{ q: "In the end, it's not the years in your life that count. It's the life in your years.", a: "Abraham Lincoln" },
{ q: "To live is the rarest thing in the world. Most people exist, that is all.", a: "Oscar Wilde" },
{ q: "The meaning of life is to find your gift. The purpose of life is to give it away.", a: "Pablo Picasso" },
{ q: "Don't ask what the world needs. Ask what makes you come alive and go do it.", a: "Howard Thurman" },
{ q: "Your time is limited, don't waste it living someone else's life.", a: "Steve Jobs" },
{ q: "Every moment is a fresh beginning.", a: "T.S. Eliot" },
// Self-Belief
{ q: "No one can make you feel inferior without your consent.", a: "Eleanor Roosevelt" },
{ q: "You are enough, a thousand times enough.", a: "Atticus" },
{ q: "Be yourself; everyone else is already taken.", a: "Oscar Wilde" },
{ q: "To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.", a: "Ralph Waldo Emerson" },
{ q: "You yourself, as much as anybody in the entire universe, deserve your love and affection.", a: "Buddha" },
{ q: "Knowing yourself is the beginning of all wisdom.", a: "Aristotle" },
{ q: "The only person you are destined to become is the person you decide to be.", a: "Ralph Waldo Emerson" },
{ q: "Wherever you go, no matter what the weather, always bring your own sunshine.", a: "Anthony J. D'Angelo" },
{ q: "With confidence, you have won before you have started.", a: "Marcus Garvey" },
{ q: "Once you choose hope, anything's possible.", a: "Christopher Reeve" },
// Leadership & Impact
{ q: "A leader is one who knows the way, goes the way, and shows the way.", a: "John C. Maxwell" },
{ q: "Leadership is not about being in charge. It is about taking care of those in your charge.", a: "Simon Sinek" },
{ q: "The best time to plant a tree was 20 years ago. The second best time is now.", a: "Chinese Proverb" },
{ q: "Innovation distinguishes between a leader and a follower.", a: "Steve Jobs" },
{ q: "If your actions inspire others to dream more, learn more, do more and become more, you are a leader.", a: "John Quincy Adams" },
{ q: "Alone we can do so little; together we can do so much.", a: "Helen Keller" },
{ q: "The greatest use of a life is to spend it on something that will outlast it.", a: "William James" },
{ q: "Be the change you wish to see in the world.", a: "Mahatma Gandhi" },
{ q: "Service to others is the rent you pay for your room here on earth.", a: "Muhammad Ali" },
// Wisdom & Philosophy  
{ q: "The unexamined life is not worth living.", a: "Socrates" },
{ q: "We suffer more in imagination than in reality.", a: "Seneca" },
{ q: "Waste no more time arguing about what a good man should be. Be one.", a: "Marcus Aurelius" },
{ q: "You have power over your mind, not outside events.", a: "Marcus Aurelius" },
{ q: "He who angers you conquers you.", a: "Elizabeth Kenny" },
{ q: "The quality of a person's life is in direct proportion to their commitment to excellence.", a: "Vince Lombardi" },
{ q: "Simplicity is the ultimate sophistication.", a: "Leonardo da Vinci" },
{ q: "The only true wisdom is in knowing you know nothing.", a: "Socrates" },
{ q: "Patience is bitter, but its fruit is sweet.", a: "Jean-Jacques Rousseau" },
{ q: "Do not go where the path may lead; go instead where there is no path and leave a trail.", a: "Ralph Waldo Emerson" },
// Daily Grind
{ q: "Today's struggle is tomorrow's strength.", a: "Unknown" },
{ q: "One day or day one. You decide.", a: "Unknown" },
{ q: "Work hard in silence. Let your success be the noise.", a: "Frank Ocean" },
{ q: "Stay focused, go after your dreams and keep moving toward your goals.", a: "LL Cool J" },
{ q: "Push yourself, because no one else is going to do it for you.", a: "Unknown" },
{ q: "Great things never come from comfort zones.", a: "Unknown" },
{ q: "Wake up with determination. Go to bed with satisfaction.", a: "Unknown" },
{ q: "Do something today that your future self will thank you for.", a: "Sean Patrick Flanery" },
{ q: "Little things make big days.", a: "Unknown" },
{ q: "It's going to be hard, but hard is not impossible.", a: "Unknown" },
{ q: "Don't stop when you're tired. Stop when you're done.", a: "Unknown" },
{ q: "Discipline is choosing between what you want now and what you want most.", a: "Abraham Lincoln" },
{ q: "Success is the sum of small efforts repeated day in and day out.", a: "Robert Collier" },
{ q: "Your only limit is your mind.", a: "Unknown" },
{ q: "Hustle until your haters ask if you're hiring.", a: "Unknown" },
// Faith & Hope
{ q: "Faith is taking the first step even when you can't see the whole staircase.", a: "Martin Luther King Jr." },
{ q: "Hope is the thing with feathers that perches in the soul.", a: "Emily Dickinson" },
{ q: "God has a plan for your life. Trust the process.", a: "Unknown" },
{ q: "When nothing goes right, go left.", a: "Unknown" },
{ q: "Every day may not be good, but there's something good in every day.", a: "Alice Morse Earle" },
{ q: "You are braver than you believe, stronger than you seem, and smarter than you think.", a: "A.A. Milne" },
{ q: "The comeback is always stronger than the setback.", a: "Unknown" },
{ q: "What God has for you, it is for you.", a: "Unknown" },
{ q: "Storms make trees take deeper roots.", a: "Dolly Parton" },
{ q: "After every storm, there is a rainbow. If you have eyes to see it.", a: "Paul Walker" }
]
let pick = motivations[Math.floor(Math.random() * motivations.length)]
try {
let res = await fetch('https://zenquotes.io/api/random', { signal: AbortSignal.timeout(8000) })
let data = await res.json()
if (Array.isArray(data) && data[0]?.q && data[0]?.a) {
pick = { q: data[0].q, a: data[0].a }
}
} catch {}
reply(`╔═════════╗\n║  💫 *MOTIVATION*\n╚═════════╝\n\n  ❝ ${pick.q} ❞\n\n  — *${pick.a}*`)
} break

case 'fact': {
    await X.sendMessage(m.chat, { react: { text: '💡', key: m.key } })
try {
let res = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random')
let data = await res.json()
reply(`╔═════════╗\n║  📚 *RANDOM FACT*\n╚═════════╝\n\n  ${data.text}`)
} catch {
let facts = ['Honey never spoils.', 'Octopuses have three hearts.', 'Bananas are berries but strawberries are not.', 'A group of flamingos is called a flamboyance.', 'The shortest war in history lasted 38 minutes.']
reply(`╔═════════╗\n║  📚 *RANDOM FACT*\n╚═════════╝\n\n  ${facts[Math.floor(Math.random() * facts.length)]}`)
}
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Anime Commands
case 'neko': {
    await X.sendMessage(m.chat, { react: { text: '🐱', key: m.key } })
try {
    let nekoUrl = null
    try {
        let _gn = await fetch('https://api.giftedtech.co.ke/api/anime/neko?apikey=${_giftedKey()}', { signal: AbortSignal.timeout(10000) })
        let _gnd = await _gn.json()
        if (_gnd.success && _gnd.result) nekoUrl = _gnd.result
    } catch {}
    if (!nekoUrl) {
        let res = await fetch('https://nekos.life/api/v2/img/neko', { signal: AbortSignal.timeout(10000) })
        let data = await res.json()
        nekoUrl = data.url
    }
    await X.sendMessage(m.chat, { image: { url: nekoUrl }, caption: '*Neko!* 🐱' }, { quoted: m })
} catch { reply('Failed to fetch neko image.') }
} break

case 'waifu': {
    await X.sendMessage(m.chat, { react: { text: '💕', key: m.key } })
try {
    let waifuUrl = null
    try {
        let _gw = await fetch('https://api.giftedtech.co.ke/api/anime/waifu?apikey=${_giftedKey()}', { signal: AbortSignal.timeout(10000) })
        let _gwd = await _gw.json()
        if (_gwd.success && _gwd.result) waifuUrl = _gwd.result
    } catch {}
    if (!waifuUrl) {
        let res = await fetch('https://api.waifu.pics/sfw/waifu', { signal: AbortSignal.timeout(10000) })
        let data = await res.json()
        waifuUrl = data.url
    }
    await X.sendMessage(m.chat, { image: { url: waifuUrl }, caption: '*Waifu!* 💕' }, { quoted: m })
} catch { reply('Failed to fetch waifu image.') }
} break

case 'loli': {
    await X.sendMessage(m.chat, { react: { text: '🌸', key: m.key } })
try {
let res = await fetch('https://nekos.life/api/v2/img/neko')
let data = await res.json()
await X.sendMessage(m.chat, { image: { url: data.url }, caption: '*Anime!* 🌸' }, { quoted: m })
} catch { reply('Failed to fetch image.') }
} break

case 'nom': {
    await X.sendMessage(m.chat, { react: { text: '😋', key: m.key } })
try {
let res = await fetch('https://api.waifu.pics/sfw/nom')
let data = await res.json()
await X.sendMessage(m.chat, { image: { url: data.url }, caption: '*Nom nom!* 😋' }, { quoted: m })
} catch { reply('Failed to fetch image.') }
} break

case 'poke': {
    await X.sendMessage(m.chat, { react: { text: '👉', key: m.key } })
try {
let res = await fetch('https://api.waifu.pics/sfw/poke')
let data = await res.json()
let pokeTarget = (m.mentionedJid && m.mentionedJid[0]) ? `@${m.mentionedJid[0].split('@')[0]}` : ''
await X.sendMessage(m.chat, { image: { url: data.url }, caption: `*${pushname} pokes ${pokeTarget || 'someone'}!* 👉`, mentions: m.mentionedJid || [] }, { quoted: m })
} catch { reply('Failed to fetch image.') }
} break

case 'cry': {
    await X.sendMessage(m.chat, { react: { text: '😢', key: m.key } })
try {
let res = await fetch('https://api.waifu.pics/sfw/cry')
let data = await res.json()
await X.sendMessage(m.chat, { image: { url: data.url }, caption: `*${pushname} is crying!* 😢` }, { quoted: m })
} catch { reply('Failed to fetch image.') }
} break

case 'kiss': {
    await X.sendMessage(m.chat, { react: { text: '😘', key: m.key } })
try {
let res = await fetch('https://api.waifu.pics/sfw/kiss')
let data = await res.json()
let kissTarget = (m.mentionedJid && m.mentionedJid[0]) ? `@${m.mentionedJid[0].split('@')[0]}` : 'someone'
await X.sendMessage(m.chat, { image: { url: data.url }, caption: `*${pushname} kisses ${kissTarget}!* 💋`, mentions: m.mentionedJid || [] }, { quoted: m })
} catch { reply('Failed to fetch image.') }
} break

case 'pat': {
    await X.sendMessage(m.chat, { react: { text: '🤝', key: m.key } })
try {
let res = await fetch('https://api.waifu.pics/sfw/pat')
let data = await res.json()
let patTarget = (m.mentionedJid && m.mentionedJid[0]) ? `@${m.mentionedJid[0].split('@')[0]}` : 'someone'
await X.sendMessage(m.chat, { image: { url: data.url }, caption: `*${pushname} pats ${patTarget}!* 🤗`, mentions: m.mentionedJid || [] }, { quoted: m })
} catch { reply('Failed to fetch image.') }
} break

case 'hug': {
    await X.sendMessage(m.chat, { react: { text: '🤗', key: m.key } })
try {
let res = await fetch('https://api.waifu.pics/sfw/hug')
let data = await res.json()
let hugTarget = (m.mentionedJid && m.mentionedJid[0]) ? `@${m.mentionedJid[0].split('@')[0]}` : 'someone'
await X.sendMessage(m.chat, { image: { url: data.url }, caption: `*${pushname} hugs ${hugTarget}!* 🤗`, mentions: m.mentionedJid || [] }, { quoted: m })
} catch { reply('Failed to fetch image.') }
} break

case 'wink': {
    await X.sendMessage(m.chat, { react: { text: '😉', key: m.key } })
try {
let res = await fetch('https://api.waifu.pics/sfw/wink')
let data = await res.json()
await X.sendMessage(m.chat, { image: { url: data.url }, caption: `*${pushname} winks!* 😉` }, { quoted: m })
} catch { reply('Failed to fetch image.') }
} break

case 'facepalm': {
    await X.sendMessage(m.chat, { react: { text: '🤦', key: m.key } })
try {
let res = await fetch('https://api.waifu.pics/sfw/cringe')
let data = await res.json()
await X.sendMessage(m.chat, { image: { url: data.url }, caption: `*${pushname} facepalms!* 🤦` }, { quoted: m })
} catch { reply('Failed to fetch image.') }
} break

case 'anime': {
    await X.sendMessage(m.chat, { react: { text: '🎌', key: m.key } })
if (!text) return reply(`Example: ${prefix}anime Naruto`)
try {
let res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(text)}&limit=5`)
let data = await res.json()
if (!data.data || !data.data.length) return reply('No anime found.')
let animeList = data.data.map((a, i) => `${i+1}. *${a.title}* (${a.title_japanese || ''})\nScore: ${a.score || 'N/A'}\nEpisodes: ${a.episodes || 'N/A'}\nStatus: ${a.status}\nGenres: ${(a.genres || []).map(g => g.name).join(', ')}\nSynopsis: ${(a.synopsis || 'N/A').slice(0, 200)}...\nURL: ${a.url}`).join('\n\n')
if (data.data[0].images?.jpg?.image_url) {
await X.sendMessage(m.chat, { image: { url: data.data[0].images.jpg.image_url }, caption: `*Anime Search: ${text}*\n\n${animeList}` }, { quoted: m })
} else reply(`╔═════════╗\n║  🎌 *ANIME SEARCH*\n╚═════════╝\n\n  🔍 *${text}*\n\n${animeList}`)
} catch(e) { reply('Error: ' + e.message) }
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Unicode Font Commands
// All outputs are plain Unicode text — everyone sees them in any WhatsApp chat
// Owner uses the command, copies the output, pastes it anywhere
case 'setfont': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
// Activate persistent font mode — all your messages auto-convert until you run .fontoff
if (!isOwner) return reply(mess.OnlyOwner)
const _validFonts = ['bold','italic','bolditalic','mono','serif','serifbold','serifitalic','scriptfont','scriptbold','fraktur','frakturbold','doublestruck','smallcaps','bubble','bubblebold','square','squarebold','wide','upsidedown','strikethrough','underline','aesthetic','tiny','cursive','gothic','medieval','oldeng','inverted','mirror','currency','dotted','parenthesis','flags']
let _chosen = (text || '').toLowerCase().trim()
if (!_chosen) return reply(`*🔤 Set Font Mode*\n\nUsage: ${prefix}setfont [fontname]\n\nAvailable fonts:\n${_validFonts.map(f=>'• '+f).join('\n')}\n\n_Every message you send will auto-convert until you use ${prefix}fontoff_`)
if (!_validFonts.includes(_chosen)) return reply(`❌ Unknown font: *${_chosen}*\n\nValid options:\n${_validFonts.map(f=>'• '+f).join('\n')}`)
global.ownerFontMode = _chosen
reply(`✅ *Font mode set to: ${_chosen}*\n\n_Every message you send will now appear in ${_chosen} style._\n_Use ${prefix}fontoff to return to normal._`)
} break

case 'fontoff':
case 'resetfont': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
global.ownerFontMode = 'off'
reply(`✅ *Font mode disabled.*\n_Your messages will now send normally._`)
} break

case 'font':
case 'fonts': {
    await X.sendMessage(m.chat, { react: { text: '🔤', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔═════════╗\n║  🔤 *FONT CONVERTER*\n╚═════════╝\n\n_Send text with the command to preview all fonts:_\n*${prefix}font [your text]*\n\n  *Or use individual commands:*\n  ${prefix}bold · ${prefix}italic · ${prefix}bolditalic\n  ${prefix}mono · ${prefix}serif · ${prefix}serifbold\n  ${prefix}scriptfont · ${prefix}scriptbold\n  ${prefix}fraktur · ${prefix}frakturbold\n  ${prefix}doublestruck · ${prefix}smallcaps\n  ${prefix}bubble · ${prefix}bubblebold\n  ${prefix}square · ${prefix}squarebold\n  ${prefix}wide · ${prefix}upsidedown\n  ${prefix}strikethrough · ${prefix}underline\n\n  _Tip: ${prefix}setfont [name] for persistent style_`)
// text provided — show all fonts as live Unicode preview
const _fMaps = {
  '𝗕𝗼𝗹𝗱 𝗦𝗮𝗻𝘀':      {a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭'},
  '𝘐𝘵𝘢𝘭𝘪𝘤 𝘚𝘢𝘯𝘴':    {a:'𝘢',b:'𝘣',c:'𝘤',d:'𝘥',e:'𝘦',f:'𝘧',g:'𝘨',h:'𝘩',i:'𝘪',j:'𝘫',k:'𝘬',l:'𝘭',m:'𝘮',n:'𝘯',o:'𝘰',p:'𝘱',q:'𝘲',r:'𝘳',s:'𝘴',t:'𝘵',u:'𝘶',v:'𝘷',w:'𝘸',x:'𝘹',y:'𝘺',z:'𝘻',A:'𝘈',B:'𝘉',C:'𝘊',D:'𝘋',E:'𝘌',F:'𝘍',G:'𝘎',H:'𝘏',I:'𝘐',J:'𝘑',K:'𝘒',L:'𝘓',M:'𝘔',N:'𝘕',O:'𝘖',P:'𝘗',Q:'𝘘',R:'𝘙',S:'𝘚',T:'𝘛',U:'𝘜',V:'𝘝',W:'𝘞',X:'𝘟',Y:'𝘠',Z:'𝘡'},
  '𝙱𝚘𝚕𝚍 𝙸𝚝𝚊𝚕𝚒𝚌':   {a:'𝙖',b:'𝙗',c:'𝙘',d:'𝙙',e:'𝙚',f:'𝙛',g:'𝙜',h:'𝙝',i:'𝙞',j:'𝙟',k:'𝙠',l:'𝙡',m:'𝙢',n:'𝙣',o:'𝙤',p:'𝙥',q:'𝙦',r:'𝙧',s:'𝙨',t:'𝙩',u:'𝙪',v:'𝙫',w:'𝙬',x:'𝙭',y:'𝙮',z:'𝙯',A:'𝘼',B:'𝘽',C:'𝘾',D:'𝘿',E:'𝙀',F:'𝙁',G:'𝙂',H:'𝙃',I:'𝙄',J:'𝙅',K:'𝙆',L:'𝙇',M:'𝙈',N:'𝙉',O:'𝙊',P:'𝙋',Q:'𝙌',R:'𝙍',S:'𝙎',T:'𝙏',U:'𝙐',V:'𝙑',W:'𝙒',X:'𝙓',Y:'𝙔',Z:'𝙕'},
  '𝙼𝚘𝚗𝚘':            {a:'𝚊',b:'𝚋',c:'𝚌',d:'𝚍',e:'𝚎',f:'𝚏',g:'𝚐',h:'𝚑',i:'𝚒',j:'𝚓',k:'𝚔',l:'𝚕',m:'𝚖',n:'𝚗',o:'𝚘',p:'𝚙',q:'𝚚',r:'𝚛',s:'𝚜',t:'𝚝',u:'𝚞',v:'𝚟',w:'𝚠',x:'𝚡',y:'𝚢',z:'𝚣',A:'𝙰',B:'𝙱',C:'𝙲',D:'𝙳',E:'𝙴',F:'𝙵',G:'𝙶',H:'𝙷',I:'𝙸',J:'𝙹',K:'𝙺',L:'𝙻',M:'𝙼',N:'𝙽',O:'𝙾',P:'𝙿',Q:'𝚀',R:'𝚁',S:'𝚂',T:'𝚃',U:'𝚄',V:'𝚅',W:'𝚆',X:'𝚇',Y:'𝚈',Z:'𝚉'},
  '𝒮𝒸𝓇𝒾𝓅𝓉':         {a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵'},
  '𝓑𝓸𝓵𝓭 𝓢𝓬𝓻𝓲𝓹𝓽':  {a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'},
  '𝔉𝔯𝔞𝔨𝔱𝔲𝔯':        {a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'},
  '𝕭𝖔𝖑𝖉 𝕱𝖗𝖆𝖐𝖙𝖚𝖗': {a:'𝖆',b:'𝖇',c:'𝖈',d:'𝖉',e:'𝖊',f:'𝖋',g:'𝖌',h:'𝖍',i:'𝖎',j:'𝖏',k:'𝖐',l:'𝖑',m:'𝖒',n:'𝖓',o:'𝖔',p:'𝖕',q:'𝖖',r:'𝖗',s:'𝖘',t:'𝖙',u:'𝖚',v:'𝖛',w:'𝖜',x:'𝖝',y:'𝖞',z:'𝖟',A:'𝕬',B:'𝕭',C:'𝕮',D:'𝕯',E:'𝕰',F:'𝕱',G:'𝕲',H:'𝕳',I:'𝕴',J:'𝕵',K:'𝕶',L:'𝕷',M:'𝕸',N:'𝕹',O:'𝕺',P:'𝕻',Q:'𝕼',R:'𝕽',S:'𝕾',T:'𝕿',U:'𝖀',V:'𝖁',W:'𝖂',X:'𝖃',Y:'𝖄',Z:'𝖅'},
  '𝔻𝕠𝕦𝕓𝕝𝕖 𝕊𝕥𝕣𝕦𝕔𝕜':{a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫',A:'𝔸',B:'𝔹',C:'ℂ',D:'𝔻',E:'𝔼',F:'𝔽',G:'𝔾',H:'ℍ',I:'𝕀',J:'𝕁',K:'𝕂',L:'𝕃',M:'𝕄',N:'ℕ',O:'𝕆',P:'ℙ',Q:'ℚ',R:'ℝ',S:'𝕊',T:'𝕋',U:'𝕌',V:'𝕍',W:'𝕎',X:'𝕏',Y:'𝕐',Z:'ℤ'},
  'ꜱᴍᴀʟʟ ᴄᴀᴘꜱ':      {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'Q',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',A:'ᴀ',B:'ʙ',C:'ᴄ',D:'ᴅ',E:'ᴇ',F:'ꜰ',G:'ɢ',H:'ʜ',I:'ɪ',J:'ᴊ',K:'ᴋ',L:'ʟ',M:'ᴍ',N:'ɴ',O:'ᴏ',P:'ᴘ',Q:'Q',R:'ʀ',S:'ꜱ',T:'ᴛ',U:'ᴜ',V:'ᴠ',W:'ᴡ',X:'x',Y:'ʏ',Z:'ᴢ'},
  'ⓑⓤⓑⓑⓛⓔ':         {a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ'},
  '🅑🅤🅑🅑🅛🅔 🅑🅞🅛🅓':{a:'🅐',b:'🅑',c:'🅒',d:'🅓',e:'🅔',f:'🅕',g:'🅖',h:'🅗',i:'🅘',j:'🅙',k:'🅚',l:'🅛',m:'🅜',n:'🅝',o:'🅞',p:'🅟',q:'🅠',r:'🅡',s:'🅢',t:'🅣',u:'🅤',v:'🅥',w:'🅦',x:'🅧',y:'🅨',z:'🅩',A:'🅐',B:'🅑',C:'🅒',D:'🅓',E:'🅔',F:'🅕',G:'🅖',H:'🅗',I:'🅘',J:'🅙',K:'🅚',L:'🅛',M:'🅜',N:'🅝',O:'🅞',P:'🅟',Q:'🅠',R:'🅡',S:'🅢',T:'🅣',U:'🅤',V:'🅥',W:'🅦',X:'🅧',Y:'🅨',Z:'🅩'},
  'Ａｅｓｔｈｅｔｉｃ':    {a:'ａ',b:'ｂ',c:'ｃ',d:'ｄ',e:'ｅ',f:'ｆ',g:'ｇ',h:'ｈ',i:'ｉ',j:'ｊ',k:'ｋ',l:'ｌ',m:'ｍ',n:'ｎ',o:'ｏ',p:'ｐ',q:'ｑ',r:'ｒ',s:'ｓ',t:'ｔ',u:'ｕ',v:'ｖ',w:'ｗ',x:'ｘ',y:'ｙ',z:'ｚ',A:'Ａ',B:'Ｂ',C:'Ｃ',D:'Ｄ',E:'Ｅ',F:'Ｆ',G:'Ｇ',H:'Ｈ',I:'Ｉ',J:'Ｊ',K:'Ｋ',L:'Ｌ',M:'Ｍ',N:'Ｎ',O:'Ｏ',P:'Ｐ',Q:'Ｑ',R:'Ｒ',S:'Ｓ',T:'Ｔ',U:'Ｕ',V:'Ｖ',W:'Ｗ',X:'Ｘ',Y:'Ｙ',Z:'Ｚ'},
  'ᵗⁱⁿʸ':             {a:'ᵃ',b:'ᵇ',c:'ᶜ',d:'ᵈ',e:'ᵉ',f:'ᶠ',g:'ᵍ',h:'ʰ',i:'ⁱ',j:'ʲ',k:'ᵏ',l:'ˡ',m:'ᵐ',n:'ⁿ',o:'ᵒ',p:'ᵖ',q:'q',r:'ʳ',s:'ˢ',t:'ᵗ',u:'ᵘ',v:'ᵛ',w:'ʷ',x:'ˣ',y:'ʸ',z:'ᶻ',A:'ᴬ',B:'ᴮ',C:'ᶜ',D:'ᴰ',E:'ᴱ',F:'ᶠ',G:'ᴳ',H:'ᴴ',I:'ᴵ',J:'ᴶ',K:'ᴷ',L:'ᴸ',M:'ᴹ',N:'ᴺ',O:'ᴼ',P:'ᴾ',Q:'Q',R:'ᴿ',S:'ˢ',T:'ᵀ',U:'ᵁ',V:'ᵛ',W:'ᵂ',X:'ˣ',Y:'ʸ',Z:'ᶻ'},
  'ɥsdısᴉ uʍop':      null,  // handled separately
}
let _fOut = `╔═════════╗\n║  🔤 *FONT PREVIEW*\n╚═════════╝\n\n`
for (const [fname, fmap] of Object.entries(_fMaps)) {
    if (fmap === null) {
        const udM={a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',A:'∀',B:'𐐒',C:'Ɔ',D:'ᗡ',E:'Ǝ',F:'Ⅎ',G:'פ',H:'H',I:'I',J:'ſ',K:'ʞ',L:'˥',M:'W',N:'N',O:'O',P:'Ԁ',Q:'Q',R:'ɹ',S:'S',T:'┴',U:'∩',V:'Λ',W:'M',X:'X',Y:'⅄',Z:'Z'}
        _fOut += `*${fname}*\n${[...ftIn].map(c=>udM[c]||c).join('').split('').reverse().join('')}\n\n`
    } else {
        _fOut += `*${fname}*\n${[...ftIn].map(c=>fmap[c]||c).join('')}\n\n`
    }
}
// wide (fullwidth)
const _wide = [...ftIn].map(c=>{const cd=c.charCodeAt(0);return (cd>=33&&cd<=126)?String.fromCharCode(cd+65248):c===' '?'　':c}).join('')
_fOut += `*Ｗｉｄｅ*\n${_wide}\n\n`
// strikethrough & underline
_fOut += `*S̶t̶r̶i̶k̶e̶t̶h̶r̶o̶u̶g̶h̶*\n${[...ftIn].map(c=>c+'\u0336').join('')}\n\n`
_fOut += `*U͟n͟d͟e͟r͟l͟i͟n͟e͟*\n${[...ftIn].map(c=>c+'\u0332').join('')}`
reply(_fOut.trim())
} break

case 'bold': {
    await X.sendMessage(m.chat, { react: { text: '𝐁', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}bold [text]`)
const boldMap={a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭','0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵'}
reply([...ftIn].map(c=>boldMap[c]||c).join(''))
} break

case 'italic': {
    await X.sendMessage(m.chat, { react: { text: '𝐼', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}italic [text]`)
const italicMap={a:'𝘢',b:'𝘣',c:'𝘤',d:'𝘥',e:'𝘦',f:'𝘧',g:'𝘨',h:'𝘩',i:'𝘪',j:'𝘫',k:'𝘬',l:'𝘭',m:'𝘮',n:'𝘯',o:'𝘰',p:'𝘱',q:'𝘲',r:'𝘳',s:'𝘴',t:'𝘵',u:'𝘶',v:'𝘷',w:'𝘸',x:'𝘹',y:'𝘺',z:'𝘻',A:'𝘈',B:'𝘉',C:'𝘊',D:'𝘋',E:'𝘌',F:'𝘍',G:'𝘎',H:'𝘏',I:'𝘐',J:'𝘑',K:'𝘒',L:'𝘓',M:'𝘔',N:'𝘕',O:'𝘖',P:'𝘗',Q:'𝘘',R:'𝘙',S:'𝘚',T:'𝘛',U:'𝘜',V:'𝘝',W:'𝘞',X:'𝘟',Y:'𝘠',Z:'𝘡'}
reply([...ftIn].map(c=>italicMap[c]||c).join(''))
} break

case 'bolditalic': {
    await X.sendMessage(m.chat, { react: { text: '𝑩', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}bolditalic [text]`)
const biMap={a:'𝙖',b:'𝙗',c:'𝙘',d:'𝙙',e:'𝙚',f:'𝙛',g:'𝙜',h:'𝙝',i:'𝙞',j:'𝙟',k:'𝙠',l:'𝙡',m:'𝙢',n:'𝙣',o:'𝙤',p:'𝙥',q:'𝙦',r:'𝙧',s:'𝙨',t:'𝙩',u:'𝙪',v:'𝙫',w:'𝙬',x:'𝙭',y:'𝙮',z:'𝙯',A:'𝘼',B:'𝘽',C:'𝘾',D:'𝘿',E:'𝙀',F:'𝙁',G:'𝙂',H:'𝙃',I:'𝙄',J:'𝙅',K:'𝙆',L:'𝙇',M:'𝙈',N:'𝙉',O:'𝙊',P:'𝙋',Q:'𝙌',R:'𝙍',S:'𝙎',T:'𝙏',U:'𝙐',V:'𝙑',W:'𝙒',X:'𝙓',Y:'𝙔',Z:'𝙕'}
reply([...ftIn].map(c=>biMap[c]||c).join(''))
} break

case 'mono': {
    await X.sendMessage(m.chat, { react: { text: '𝙼', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}mono [text]`)
const monoMap={a:'𝚊',b:'𝚋',c:'𝚌',d:'𝚍',e:'𝚎',f:'𝚏',g:'𝚐',h:'𝚑',i:'𝚒',j:'𝚓',k:'𝚔',l:'𝚕',m:'𝚖',n:'𝚗',o:'𝚘',p:'𝚙',q:'𝚚',r:'𝚛',s:'𝚜',t:'𝚝',u:'𝚞',v:'𝚟',w:'𝚠',x:'𝚡',y:'𝚢',z:'𝚣',A:'𝙰',B:'𝙱',C:'𝙲',D:'𝙳',E:'𝙴',F:'𝙵',G:'𝙶',H:'𝙷',I:'𝙸',J:'𝙹',K:'𝙺',L:'𝙻',M:'𝙼',N:'𝙽',O:'𝙾',P:'𝙿',Q:'𝚀',R:'𝚁',S:'𝚂',T:'𝚃',U:'𝚄',V:'𝚅',W:'𝚆',X:'𝚇',Y:'𝚈',Z:'𝚉','0':'𝟶','1':'𝟷','2':'𝟸','3':'𝟹','4':'𝟺','5':'𝟻','6':'𝟼','7':'𝟽','8':'𝟾','9':'𝟿'}
reply([...ftIn].map(c=>monoMap[c]||c).join(''))
} break

case 'serif': {
    await X.sendMessage(m.chat, { react: { text: '𝐒', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}serif [text]`)
const serifMap={a:'𝐚',b:'𝐛',c:'𝐜',d:'𝐝',e:'𝐞',f:'𝐟',g:'𝐠',h:'𝐡',i:'𝐢',j:'𝐣',k:'𝐤',l:'𝐥',m:'𝐦',n:'𝐧',o:'𝐨',p:'𝐩',q:'𝐪',r:'𝐫',s:'𝐬',t:'𝐭',u:'𝐮',v:'𝐯',w:'𝐰',x:'𝐱',y:'𝐲',z:'𝐳',A:'𝐀',B:'𝐁',C:'𝐂',D:'𝐃',E:'𝐄',F:'𝐅',G:'𝐆',H:'𝐇',I:'𝐈',J:'𝐉',K:'𝐊',L:'𝐋',M:'𝐌',N:'𝐍',O:'𝐎',P:'𝐏',Q:'𝐐',R:'𝐑',S:'𝐒',T:'𝐓',U:'𝐔',V:'𝐕',W:'𝐖',X:'𝐗',Y:'𝐘',Z:'𝐙','0':'𝟎','1':'𝟏','2':'𝟐','3':'𝟑','4':'𝟒','5':'𝟓','6':'𝟔','7':'𝟕','8':'𝟖','9':'𝟗'}
reply([...ftIn].map(c=>serifMap[c]||c).join(''))
} break

case 'serifbold': {
    await X.sendMessage(m.chat, { react: { text: '𝐒', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}serifbold [text]`)
const sbMap={a:'𝐚',b:'𝐛',c:'𝐜',d:'𝐝',e:'𝐞',f:'𝐟',g:'𝐠',h:'𝐡',i:'𝐢',j:'𝐣',k:'𝐤',l:'𝐥',m:'𝐦',n:'𝐧',o:'𝐨',p:'𝐩',q:'𝐪',r:'𝐫',s:'𝐬',t:'𝐭',u:'𝐮',v:'𝐯',w:'𝐰',x:'𝐱',y:'𝐲',z:'𝐳',A:'𝐀',B:'𝐁',C:'𝐂',D:'𝐃',E:'𝐄',F:'𝐅',G:'𝐆',H:'𝐇',I:'𝐈',J:'𝐉',K:'𝐊',L:'𝐋',M:'𝐌',N:'𝐍',O:'𝐎',P:'𝐏',Q:'𝐐',R:'𝐑',S:'𝐒',T:'𝐓',U:'𝐔',V:'𝐕',W:'𝐖',X:'𝐗',Y:'𝐘',Z:'𝐙'}
reply([...ftIn].map(c=>sbMap[c]||c).join(''))
} break

case 'serifitalic': {
    await X.sendMessage(m.chat, { react: { text: '𝑆', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}serifitalic [text]`)
const siMap={a:'𝑎',b:'𝑏',c:'𝑐',d:'𝑑',e:'𝑒',f:'𝑓',g:'𝑔',h:'ℎ',i:'𝑖',j:'𝑗',k:'𝑘',l:'𝑙',m:'𝑚',n:'𝑛',o:'𝑜',p:'𝑝',q:'𝑞',r:'𝑟',s:'𝑠',t:'𝑡',u:'𝑢',v:'𝑣',w:'𝑤',x:'𝑥',y:'𝑦',z:'𝑧',A:'𝐴',B:'𝐵',C:'𝐶',D:'𝐷',E:'𝐸',F:'𝐹',G:'𝐺',H:'𝐻',I:'𝐼',J:'𝐽',K:'𝐾',L:'𝐿',M:'𝑀',N:'𝑁',O:'𝑂',P:'𝑃',Q:'𝑄',R:'𝑅',S:'𝑆',T:'𝑇',U:'𝑈',V:'𝑉',W:'𝑊',X:'𝑋',Y:'𝑌',Z:'𝑍'}
reply([...ftIn].map(c=>siMap[c]||c).join(''))
} break

case 'scriptfont': {
    await X.sendMessage(m.chat, { react: { text: '𝒮', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}scriptfont [text]`)
const scriptMap={a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵'}
reply([...ftIn].map(c=>scriptMap[c]||c).join(''))
} break

case 'scriptbold': {
    await X.sendMessage(m.chat, { react: { text: '𝓢', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}scriptbold [text]`)
const scbMap={a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'}
reply([...ftIn].map(c=>scbMap[c]||c).join(''))
} break

case 'fraktur': {
    await X.sendMessage(m.chat, { react: { text: '𝔉', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}fraktur [text]`)
const frakMap={a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'}
reply([...ftIn].map(c=>frakMap[c]||c).join(''))
} break

case 'frakturbold': {
    await X.sendMessage(m.chat, { react: { text: '𝕱', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}frakturbold [text]`)
const fbMap={a:'𝖆',b:'𝖇',c:'𝖈',d:'𝖉',e:'𝖊',f:'𝖋',g:'𝖌',h:'𝖍',i:'𝖎',j:'𝖏',k:'𝖐',l:'𝖑',m:'𝖒',n:'𝖓',o:'𝖔',p:'𝖕',q:'𝖖',r:'𝖗',s:'𝖘',t:'𝖙',u:'𝖚',v:'𝖛',w:'𝖜',x:'𝖝',y:'𝖞',z:'𝖟',A:'𝕬',B:'𝕭',C:'𝕮',D:'𝕯',E:'𝕰',F:'𝕱',G:'𝕲',H:'𝕳',I:'𝕴',J:'𝕵',K:'𝕶',L:'𝕷',M:'𝕸',N:'𝕹',O:'𝕺',P:'𝕻',Q:'𝕼',R:'𝕽',S:'𝕾',T:'𝕿',U:'𝖀',V:'𝖁',W:'𝖂',X:'𝖃',Y:'𝖄',Z:'𝖅'}
reply([...ftIn].map(c=>fbMap[c]||c).join(''))
} break

case 'doublestruck': {
    await X.sendMessage(m.chat, { react: { text: '𝔻', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}doublestruck [text]`)
const dsMap={a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫',A:'𝔸',B:'𝔹',C:'ℂ',D:'𝔻',E:'𝔼',F:'𝔽',G:'𝔾',H:'ℍ',I:'𝕀',J:'𝕁',K:'𝕂',L:'𝕃',M:'𝕄',N:'ℕ',O:'𝕆',P:'ℙ',Q:'ℚ',R:'ℝ',S:'𝕊',T:'𝕋',U:'𝕌',V:'𝕍',W:'𝕎',X:'𝕏',Y:'𝕐',Z:'ℤ','0':'𝟘','1':'𝟙','2':'𝟚','3':'𝟛','4':'𝟜','5':'𝟝','6':'𝟞','7':'𝟟','8':'𝟠','9':'𝟡'}
reply([...ftIn].map(c=>dsMap[c]||c).join(''))
} break

case 'smallcaps': {
    await X.sendMessage(m.chat, { react: { text: 'ꜱ', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}smallcaps [text]`)
const scMap={a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'Q',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',A:'ᴀ',B:'ʙ',C:'ᴄ',D:'ᴅ',E:'ᴇ',F:'ꜰ',G:'ɢ',H:'ʜ',I:'ɪ',J:'ᴊ',K:'ᴋ',L:'ʟ',M:'ᴍ',N:'ɴ',O:'ᴏ',P:'ᴘ',Q:'Q',R:'ʀ',S:'ꜱ',T:'ᴛ',U:'ᴜ',V:'ᴠ',W:'ᴡ',X:'x',Y:'ʏ',Z:'ᴢ'}
reply([...ftIn].map(c=>scMap[c]||c).join(''))
} break

case 'bubble': {
    await X.sendMessage(m.chat, { react: { text: '🔵', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}bubble [text]`)
const bubMap={a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ','0':'⓪','1':'①','2':'②','3':'③','4':'④','5':'⑤','6':'⑥','7':'⑦','8':'⑧','9':'⑨'}
reply([...ftIn].map(c=>bubMap[c]||c).join(''))
} break

case 'bubblebold': {
    await X.sendMessage(m.chat, { react: { text: '🟦', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}bubblebold [text]`)
const bbbMap={a:'🅐',b:'🅑',c:'🅒',d:'🅓',e:'🅔',f:'🅕',g:'🅖',h:'🅗',i:'🅘',j:'🅙',k:'🅚',l:'🅛',m:'🅜',n:'🅝',o:'🅞',p:'🅟',q:'🅠',r:'🅡',s:'🅢',t:'🅣',u:'🅤',v:'🅥',w:'🅦',x:'🅧',y:'🅨',z:'🅩',A:'🅐',B:'🅑',C:'🅒',D:'🅓',E:'🅔',F:'🅕',G:'🅖',H:'🅗',I:'🅘',J:'🅙',K:'🅚',L:'🅛',M:'🅜',N:'🅝',O:'🅞',P:'🅟',Q:'🅠',R:'🅡',S:'🅢',T:'🅣',U:'🅤',V:'🅥',W:'🅦',X:'🅧',Y:'🅨',Z:'🅩'}
reply([...ftIn].map(c=>bbbMap[c]||c).join(''))
} break

case 'square': {
    await X.sendMessage(m.chat, { react: { text: '🟥', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}square [text]`)
const sqMap={a:'🄰',b:'🄱',c:'🄲',d:'🄳',e:'🄴',f:'🄵',g:'🄶',h:'🄷',i:'🄸',j:'🄹',k:'🄺',l:'🄻',m:'🄼',n:'🄽',o:'🄾',p:'🄿',q:'🅀',r:'🅁',s:'🅂',t:'🅃',u:'🅄',v:'🅅',w:'🅆',x:'🅇',y:'🅈',z:'🅉',A:'🄰',B:'🄱',C:'🄲',D:'🄳',E:'🄴',F:'🄵',G:'🄶',H:'🄷',I:'🄸',J:'🄹',K:'🄺',L:'🄻',M:'🄼',N:'🄽',O:'🄾',P:'🄿',Q:'🅀',R:'🅁',S:'🅂',T:'🅃',U:'🅄',V:'🅅',W:'🅆',X:'🅇',Y:'🅈',Z:'🅉'}
reply([...ftIn].map(c=>sqMap[c]||c).join(''))
} break

case 'squarebold': {
    await X.sendMessage(m.chat, { react: { text: '🟥', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}squarebold [text]`)
const sqbMap={a:'🅰',b:'🅱',c:'🅲',d:'🅳',e:'🅴',f:'🅵',g:'🅶',h:'🅷',i:'🅸',j:'🅹',k:'🅺',l:'🅻',m:'🅼',n:'🅽',o:'🅾',p:'🅿',q:'🆀',r:'🆁',s:'🆂',t:'🆃',u:'🆄',v:'🆅',w:'🆆',x:'🆇',y:'🆈',z:'🆉',A:'🅰',B:'🅱',C:'🅲',D:'🅳',E:'🅴',F:'🅵',G:'🅶',H:'🅷',I:'🅸',J:'🅹',K:'🅺',L:'🅻',M:'🅼',N:'🅽',O:'🅾',P:'🅿',Q:'🆀',R:'🆁',S:'🆂',T:'🆃',U:'🆄',V:'🆅',W:'🆆',X:'🆇',Y:'🆈',Z:'🆉'}
reply([...ftIn].map(c=>sqbMap[c]||c).join(''))
} break

case 'wide': {
    await X.sendMessage(m.chat, { react: { text: '🔡', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}wide [text]`)
reply([...ftIn].map(c=>{let code=c.charCodeAt(0);return (code>=33&&code<=126)?String.fromCharCode(code+65248):c==' '?'　':c}).join(''))
} break

case 'upsidedown': {
    await X.sendMessage(m.chat, { react: { text: '🙃', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}upsidedown [text]`)
const udMap={a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',A:'∀',B:'𐐒',C:'Ɔ',D:'ᗡ',E:'Ǝ',F:'Ⅎ',G:'פ',H:'H',I:'I',J:'ſ',K:'ʞ',L:'˥',M:'W',N:'N',O:'O',P:'Ԁ',Q:'Q',R:'ɹ',S:'S',T:'┴',U:'∩',V:'Λ',W:'M',X:'X',Y:'⅄',Z:'Z','0':'0','1':'Ɩ','2':'ᄅ','3':'Ɛ','4':'ㄣ','5':'ϛ','6':'9','7':'L','8':'8','9':'6',',':'\'','\'':',','.':'˙','?':'¿','!':'¡','(':')',')':'(','[':']',']':'[','{':'}','}':'{','<':'>','>':'<','&':'⅋',_:'‾'}
reply([...ftIn].map(c=>udMap[c]||c).join('').split('').reverse().join(''))
} break

case 'strikethrough': {
    await X.sendMessage(m.chat, { react: { text: '~~', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}strikethrough [text]`)
reply([...ftIn].map(c=>c+'\u0336').join(''))
} break

case 'underline': {
    await X.sendMessage(m.chat, { react: { text: '📏', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}underline [text]`)
reply([...ftIn].map(c=>c+'\u0332').join(''))
} break

case 'superscript': {
    await X.sendMessage(m.chat, { react: { text: '⁰', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}superscript [text]`)
const sspMap={a:'ᵃ',b:'ᵇ',c:'ᶜ',d:'ᵈ',e:'ᵉ',f:'ᶠ',g:'ᵍ',h:'ʰ',i:'ⁱ',j:'ʲ',k:'ᵏ',l:'ˡ',m:'ᵐ',n:'ⁿ',o:'ᵒ',p:'ᵖ',q:'q',r:'ʳ',s:'ˢ',t:'ᵗ',u:'ᵘ',v:'ᵛ',w:'ʷ',x:'ˣ',y:'ʸ',z:'ᶻ',A:'ᴬ',B:'ᴮ',C:'ᶜ',D:'ᴰ',E:'ᴱ',F:'ᶠ',G:'ᴳ',H:'ᴴ',I:'ᴵ',J:'ᴶ',K:'ᴷ',L:'ᴸ',M:'ᴹ',N:'ᴺ',O:'ᴼ',P:'ᴾ',Q:'Q',R:'ᴿ',S:'ˢ',T:'ᵀ',U:'ᵁ',V:'ᵛ',W:'ᵂ',X:'ˣ',Y:'ʸ',Z:'ᶻ','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'}
reply([...ftIn].map(c=>sspMap[c]||c).join(''))
} break

case 'subscript': {
    await X.sendMessage(m.chat, { react: { text: '₀', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}subscript [text]`)
const subMap={a:'ₐ',b:'b',c:'c',d:'d',e:'ₑ',f:'f',g:'g',h:'ₕ',i:'ᵢ',j:'ⱼ',k:'ₖ',l:'ₗ',m:'ₘ',n:'ₙ',o:'ₒ',p:'ₚ',q:'q',r:'ᵣ',s:'ₛ',t:'ₜ',u:'ᵤ',v:'ᵥ',w:'w',x:'ₓ',y:'y',z:'z',A:'A',B:'B',C:'C',D:'D',E:'E',F:'F',G:'G',H:'H',I:'I',J:'J',K:'K',L:'L',M:'M',N:'N',O:'O',P:'P',Q:'Q',R:'R',S:'S',T:'T',U:'U',V:'V',W:'W',X:'X',Y:'Y',Z:'Z','0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'}
reply([...ftIn].map(c=>subMap[c]||c).join(''))
} break

case 'medieval': {
    await X.sendMessage(m.chat, { react: { text: '🏰', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}medieval [text]`)
const medMap={a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝕬',B:'𝕭',C:'𝕮',D:'𝕯',E:'𝕰',F:'𝕱',G:'𝕲',H:'𝕳',I:'𝕴',J:'𝕵',K:'𝕶',L:'𝕷',M:'𝕸',N:'𝕹',O:'𝕺',P:'𝕻',Q:'𝕼',R:'𝕽',S:'𝕾',T:'𝕿',U:'𝖀',V:'𝖁',W:'𝖂',X:'𝖃',Y:'𝖄',Z:'𝖅'}
reply([...ftIn].map(c=>medMap[c]||c).join(''))
} break

case 'circled': {
    await X.sendMessage(m.chat, { react: { text: '⭕', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}circled [text]`)
const cirMap={a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ','0':'⓪','1':'①','2':'②','3':'③','4':'④','5':'⑤','6':'⑥','7':'⑦','8':'⑧','9':'⑨'}
reply([...ftIn].map(c=>cirMap[c]||c).join(''))
} break

case 'negative': {
    await X.sendMessage(m.chat, { react: { text: '🔲', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}negative [text]`)
const negMap={a:'🅐',b:'🅑',c:'🅒',d:'🅓',e:'🅔',f:'🅕',g:'🅖',h:'🅗',i:'🅘',j:'🅙',k:'🅚',l:'🅛',m:'🅜',n:'🅝',o:'🅞',p:'🅟',q:'🅠',r:'🅡',s:'🅢',t:'🅣',u:'🅤',v:'🅥',w:'🅦',x:'🅧',y:'🅨',z:'🅩',A:'🅐',B:'🅑',C:'🅒',D:'🅓',E:'🅔',F:'🅕',G:'🅖',H:'🅗',I:'🅘',J:'🅙',K:'🅚',L:'🅛',M:'🅜',N:'🅝',O:'🅞',P:'🅟',Q:'🅠',R:'🅡',S:'🅢',T:'🅣',U:'🅤',V:'🅥',W:'🅦',X:'🅧',Y:'🅨',Z:'🅩'}
reply([...ftIn].map(c=>negMap[c]||c).join(''))
} break

case 'parenthesized': {
    await X.sendMessage(m.chat, { react: { text: '〔〕', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}parenthesized [text]`)
const parMap={a:'⒜',b:'⒝',c:'⒞',d:'⒟',e:'⒠',f:'⒡',g:'⒢',h:'⒣',i:'⒤',j:'⒥',k:'⒦',l:'⒧',m:'⒨',n:'⒩',o:'⒪',p:'⒫',q:'⒬',r:'⒭',s:'⒮',t:'⒯',u:'⒰',v:'⒱',w:'⒲',x:'⒳',y:'⒴',z:'⒵',A:'⒜',B:'⒝',C:'⒞',D:'⒟',E:'⒠',F:'⒡',G:'⒢',H:'⒣',I:'⒤',J:'⒥',K:'⒦',L:'⒧',M:'⒨',N:'⒩',O:'⒪',P:'⒫',Q:'⒬',R:'⒭',S:'⒮',T:'⒯',U:'⒰',V:'⒱',W:'⒲',X:'⒳',Y:'⒴',Z:'⒵'}
reply([...ftIn].map(c=>parMap[c]||c).join(''))
} break

case 'gothic': {
    await X.sendMessage(m.chat, { react: { text: '🦇', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}gothic [text]`)
const gotMap={a:'𝖆',b:'𝖇',c:'𝖈',d:'𝖉',e:'𝖊',f:'𝖋',g:'𝖌',h:'𝖍',i:'𝖎',j:'𝖏',k:'𝖐',l:'𝖑',m:'𝖒',n:'𝖓',o:'𝖔',p:'𝖕',q:'𝖖',r:'𝖗',s:'𝖘',t:'𝖙',u:'𝖚',v:'𝖛',w:'𝖜',x:'𝖝',y:'𝖞',z:'𝖟',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'}
reply([...ftIn].map(c=>gotMap[c]||c).join(''))
} break

case 'cursive': {
    await X.sendMessage(m.chat, { react: { text: '✒️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}cursive [text]`)
const crvMap={a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'}
reply([...ftIn].map(c=>crvMap[c]||c).join(''))
} break

case 'aesthetic': {
    await X.sendMessage(m.chat, { react: { text: '✨', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}aesthetic [text]`)
const aesMap={a:'ａ',b:'ｂ',c:'ｃ',d:'ｄ',e:'ｅ',f:'ｆ',g:'ｇ',h:'ｈ',i:'ｉ',j:'ｊ',k:'ｋ',l:'ｌ',m:'ｍ',n:'ｎ',o:'ｏ',p:'ｐ',q:'ｑ',r:'ｒ',s:'ｓ',t:'ｔ',u:'ｕ',v:'ｖ',w:'ｗ',x:'ｘ',y:'ｙ',z:'ｚ',A:'Ａ',B:'Ｂ',C:'Ｃ',D:'Ｄ',E:'Ｅ',F:'Ｆ',G:'Ｇ',H:'Ｈ',I:'Ｉ',J:'Ｊ',K:'Ｋ',L:'Ｌ',M:'Ｍ',N:'Ｎ',O:'Ｏ',P:'Ｐ',Q:'Ｑ',R:'Ｒ',S:'Ｓ',T:'Ｔ',U:'Ｕ',V:'Ｖ',W:'Ｗ',X:'Ｘ',Y:'Ｙ',Z:'Ｚ','0':'０','1':'１','2':'２','3':'３','4':'４','5':'５','6':'６','7':'７','8':'８','9':'９'}
reply([...ftIn].map(c=>aesMap[c]||c).join(''))
} break

case 'tiny': {
    await X.sendMessage(m.chat, { react: { text: '🔹', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}tiny [text]`)
const tnyMap={a:'ᵃ',b:'ᵇ',c:'ᶜ',d:'ᵈ',e:'ᵉ',f:'ᶠ',g:'ᵍ',h:'ʰ',i:'ⁱ',j:'ʲ',k:'ᵏ',l:'ˡ',m:'ᵐ',n:'ⁿ',o:'ᵒ',p:'ᵖ',q:'q',r:'ʳ',s:'ˢ',t:'ᵗ',u:'ᵘ',v:'ᵛ',w:'ʷ',x:'ˣ',y:'ʸ',z:'ᶻ',A:'ᴬ',B:'ᴮ',C:'ᶜ',D:'ᴰ',E:'ᴱ',F:'ᶠ',G:'ᴳ',H:'ᴴ',I:'ᴵ',J:'ᴶ',K:'ᴷ',L:'ᴸ',M:'ᴹ',N:'ᴺ',O:'ᴼ',P:'ᴾ',Q:'Q',R:'ᴿ',S:'ˢ',T:'ᵀ',U:'ᵁ',V:'ᵛ',W:'ᵂ',X:'ˣ',Y:'ʸ',Z:'ᶻ'}
reply([...ftIn].map(c=>tnyMap[c]||c).join(''))
} break

case 'inverted': {
    await X.sendMessage(m.chat, { react: { text: '🔄', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}inverted [text]`)
const invMap={a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',A:'∀',B:'q',C:'Ɔ',D:'p',E:'Ǝ',F:'Ⅎ',G:'פ',H:'H',I:'I',J:'ɾ',K:'ʞ',L:'˥',M:'W',N:'N',O:'O',P:'Ԁ',Q:'Q',R:'ɹ',S:'S',T:'┴',U:'∩',V:'Λ',W:'M',X:'X',Y:'ʎ',Z:'Z'}
reply([...ftIn].map(c=>invMap[c]||c).join('').split('').reverse().join(''))
} break

case 'mirror': {
    await X.sendMessage(m.chat, { react: { text: '🔁', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}mirror [text]`)
const mirMap={a:'ɒ',b:'d',c:'ɔ',d:'b',e:'ɘ',f:'ʇ',g:'ϱ',h:'ʜ',i:'i',j:'ᴉ',k:'ʞ',l:'l',m:'m',n:'n',o:'o',p:'q',q:'p',r:'ɿ',s:'ƨ',t:'ƚ',u:'u',v:'v',w:'w',x:'x',y:'y',z:'z',A:'A',B:'ᗺ',C:'Ɔ',D:'ᗡ',E:'Ǝ',F:'ꟻ',G:'Ꭾ',H:'H',I:'I',J:'Ꮈ',K:'ꓘ',L:'⅃',M:'M',N:'И',O:'O',P:'ꟼ',Q:'Ọ',R:'Я',S:'Ƨ',T:'T',U:'U',V:'V',W:'W',X:'X',Y:'Y',Z:'Z'}
reply([...ftIn].map(c=>mirMap[c]||c).join('').split('').reverse().join(''))
} break

case 'currency': {
    await X.sendMessage(m.chat, { react: { text: '💱', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}currency [text]`)
const curMap={a:'₳',b:'฿',c:'₵',d:'₫',e:'€',f:'₣',g:'₲',h:'♄',i:'ł',j:'ʝ',k:'₭',l:'₤',m:'₥',n:'₦',o:'ø',p:'₱',q:'q',r:'®',s:'$',t:'₮',u:'µ',v:'√',w:'₩',x:'×',y:'¥',z:'z',A:'₳',B:'฿',C:'₵',D:'₫',E:'€',F:'₣',G:'₲',H:'♄',I:'ł',J:'ʝ',K:'₭',L:'₤',M:'₥',N:'₦',O:'ø',P:'₱',Q:'Q',R:'®',S:'$',T:'₮',U:'µ',V:'√',W:'₩',X:'×',Y:'¥',Z:'Z'}
reply([...ftIn].map(c=>curMap[c]||c).join(''))
} break

case 'dotted': {
    await X.sendMessage(m.chat, { react: { text: '·', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}dotted [text]`)
const dotMap={a:'ȧ',b:'ḃ',c:'ċ',d:'ḋ',e:'ė',f:'ḟ',g:'ġ',h:'ḣ',i:'ı',j:'j',k:'k',l:'l',m:'ṁ',n:'ṅ',o:'ȯ',p:'ṗ',q:'q',r:'ṙ',s:'ṡ',t:'ṫ',u:'u',v:'v',w:'ẇ',x:'ẋ',y:'ẏ',z:'ż',A:'Ȧ',B:'Ḃ',C:'Ċ',D:'Ḋ',E:'Ė',F:'Ḟ',G:'Ġ',H:'Ḣ',I:'İ',J:'J',K:'K',L:'L',M:'Ṁ',N:'Ṅ',O:'Ȯ',P:'Ṗ',Q:'Q',R:'Ṙ',S:'Ṡ',T:'Ṫ',U:'U',V:'V',W:'Ẇ',X:'Ẋ',Y:'Ẏ',Z:'Ż'}
reply([...ftIn].map(c=>dotMap[c]||c).join(''))
} break

case 'oldeng': {
    await X.sendMessage(m.chat, { react: { text: '📜', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}oldeng [text]`)
const oengMap={a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵'}
reply([...ftIn].map(c=>oengMap[c]||c).join(''))
} break

case 'allfonts': {
    await X.sendMessage(m.chat, { react: { text: '🔤', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`Usage: ${prefix}allfonts [text]`)
const maps = {
  'Bold Sans':       {a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭'},
  'Italic Sans':     {a:'𝘢',b:'𝘣',c:'𝘤',d:'𝘥',e:'𝘦',f:'𝘧',g:'𝘨',h:'𝘩',i:'𝘪',j:'𝘫',k:'𝘬',l:'𝘭',m:'𝘮',n:'𝘯',o:'𝘰',p:'𝘱',q:'𝘲',r:'𝘳',s:'𝘴',t:'𝘵',u:'𝘶',v:'𝘷',w:'𝘸',x:'𝘹',y:'𝘺',z:'𝘻',A:'𝘈',B:'𝘉',C:'𝘊',D:'𝘋',E:'𝘌',F:'𝘍',G:'𝘎',H:'𝘏',I:'𝘐',J:'𝘑',K:'𝘒',L:'𝘓',M:'𝘔',N:'𝘕',O:'𝘖',P:'𝘗',Q:'𝘘',R:'𝘙',S:'𝘚',T:'𝘛',U:'𝘜',V:'𝘝',W:'𝘞',X:'𝘟',Y:'𝘠',Z:'𝘡'},
  'Bold Italic':     {a:'𝙖',b:'𝙗',c:'𝙘',d:'𝙙',e:'𝙚',f:'𝙛',g:'𝙜',h:'𝙝',i:'𝙞',j:'𝙟',k:'𝙠',l:'𝙡',m:'𝙢',n:'𝙣',o:'𝙤',p:'𝙥',q:'𝙦',r:'𝙧',s:'𝙨',t:'𝙩',u:'𝙪',v:'𝙫',w:'𝙬',x:'𝙭',y:'𝙮',z:'𝙯',A:'𝘼',B:'𝘽',C:'𝘾',D:'𝘿',E:'𝙀',F:'𝙁',G:'𝙂',H:'𝙃',I:'𝙄',J:'𝙅',K:'𝙆',L:'𝙇',M:'𝙈',N:'𝙉',O:'𝙊',P:'𝙋',Q:'𝙌',R:'𝙍',S:'𝙎',T:'𝙏',U:'𝙐',V:'𝙑',W:'𝙒',X:'𝙓',Y:'𝙔',Z:'𝙕'},
  'Mono':            {a:'𝚊',b:'𝚋',c:'𝚌',d:'𝚍',e:'𝚎',f:'𝚏',g:'𝚐',h:'𝚑',i:'𝚒',j:'𝚓',k:'𝚔',l:'𝚕',m:'𝚖',n:'𝚗',o:'𝚘',p:'𝚙',q:'𝚚',r:'𝚛',s:'𝚜',t:'𝚝',u:'𝚞',v:'𝚟',w:'𝚠',x:'𝚡',y:'𝚢',z:'𝚣',A:'𝙰',B:'𝙱',C:'𝙲',D:'𝙳',E:'𝙴',F:'𝙵',G:'𝙶',H:'𝙷',I:'𝙸',J:'𝙹',K:'𝙺',L:'𝙻',M:'𝙼',N:'𝙽',O:'𝙾',P:'𝙿',Q:'𝚀',R:'𝚁',S:'𝚂',T:'𝚃',U:'𝚄',V:'𝚅',W:'𝚆',X:'𝚇',Y:'𝚈',Z:'𝚉'},
  'Script':          {a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵'},
  'Bold Script':     {a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'},
  'Fraktur':         {a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'},
  'Bold Fraktur':    {a:'𝖆',b:'𝖇',c:'𝖈',d:'𝖉',e:'𝖊',f:'𝖋',g:'𝖌',h:'𝖍',i:'𝖎',j:'𝖏',k:'𝖐',l:'𝖑',m:'𝖒',n:'𝖓',o:'𝖔',p:'𝖕',q:'𝖖',r:'𝖗',s:'𝖘',t:'𝖙',u:'𝖚',v:'𝖛',w:'𝖜',x:'𝖝',y:'𝖞',z:'𝖟',A:'𝕬',B:'𝕭',C:'𝕮',D:'𝕯',E:'𝕰',F:'𝕱',G:'𝕲',H:'𝕳',I:'𝕴',J:'𝕵',K:'𝕶',L:'𝕷',M:'𝕸',N:'𝕹',O:'𝕺',P:'𝕻',Q:'𝕼',R:'𝕽',S:'𝕾',T:'𝕿',U:'𝖀',V:'𝖁',W:'𝖂',X:'𝖃',Y:'𝖄',Z:'𝖅'},
  'Double Struck':   {a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫',A:'𝔸',B:'𝔹',C:'ℂ',D:'𝔻',E:'𝔼',F:'𝔽',G:'𝔾',H:'ℍ',I:'𝕀',J:'𝕁',K:'𝕂',L:'𝕃',M:'𝕄',N:'ℕ',O:'𝕆',P:'ℙ',Q:'ℚ',R:'ℝ',S:'𝕊',T:'𝕋',U:'𝕌',V:'𝕍',W:'𝕎',X:'𝕏',Y:'𝕐',Z:'ℤ'},
  'Small Caps':      {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'Q',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',A:'ᴀ',B:'ʙ',C:'ᴄ',D:'ᴅ',E:'ᴇ',F:'ꜰ',G:'ɢ',H:'ʜ',I:'ɪ',J:'ᴊ',K:'ᴋ',L:'ʟ',M:'ᴍ',N:'ɴ',O:'ᴏ',P:'ᴘ',Q:'Q',R:'ʀ',S:'ꜱ',T:'ᴛ',U:'ᴜ',V:'ᴠ',W:'ᴡ',X:'x',Y:'ʏ',Z:'ᴢ'},
  'Bubble':          {a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ'},
  'Wide':            {},
  'Medieval':        {a:'\u{1D51E}',b:'\u{1D51F}',c:'\u{1D520}',d:'\u{1D521}',e:'\u{1D522}',f:'\u{1D523}',g:'\u{1D524}',h:'\u{1D525}',i:'\u{1D526}',j:'\u{1D527}',k:'\u{1D528}',l:'\u{1D529}',m:'\u{1D52A}',n:'\u{1D52B}',o:'\u{1D52C}',p:'\u{1D52D}',q:'\u{1D52E}',r:'\u{1D52F}',s:'\u{1D530}',t:'\u{1D531}',u:'\u{1D532}',v:'\u{1D533}',w:'\u{1D534}',x:'\u{1D535}',y:'\u{1D536}',z:'\u{1D537}',A:'\u{1D504}',B:'\u{1D505}',C:'\u212D',D:'\u{1D507}',E:'\u{1D508}',F:'\u{1D509}',G:'\u{1D50A}',H:'\u210C',I:'\u2111',J:'\u{1D50D}',K:'\u{1D50E}',L:'\u{1D50F}',M:'\u{1D510}',N:'\u{1D511}',O:'\u{1D512}',P:'\u{1D513}',Q:'\u{1D514}',R:'\u211C',S:'\u{1D516}',T:'\u{1D517}',U:'\u{1D518}',V:'\u{1D519}',W:'\u{1D51A}',X:'\u{1D51B}',Y:'\u{1D51C}',Z:'\u2128'},
  'Cursive':         {a:'\u{1D4EA}',b:'\u{1D4EB}',c:'\u{1D4EC}',d:'\u{1D4ED}',e:'\u{1D4EE}',f:'\u{1D4EF}',g:'\u{1D4F0}',h:'\u{1D4F1}',i:'\u{1D4F2}',j:'\u{1D4F3}',k:'\u{1D4F4}',l:'\u{1D4F5}',m:'\u{1D4F6}',n:'\u{1D4F7}',o:'\u{1D4F8}',p:'\u{1D4F9}',q:'\u{1D4FA}',r:'\u{1D4FB}',s:'\u{1D4FC}',t:'\u{1D4FD}',u:'\u{1D4FE}',v:'\u{1D4FF}',w:'\u{1D500}',x:'\u{1D501}',y:'\u{1D502}',z:'\u{1D503}',A:'\u{1D4D0}',B:'\u{1D4D1}',C:'\u{1D4D2}',D:'\u{1D4D3}',E:'\u{1D4D4}',F:'\u{1D4D5}',G:'\u{1D4D6}',H:'\u{1D4D7}',I:'\u{1D4D8}',J:'\u{1D4D9}',K:'\u{1D4DA}',L:'\u{1D4DB}',M:'\u{1D4DC}',N:'\u{1D4DD}',O:'\u{1D4DE}',P:'\u{1D4DF}',Q:'\u{1D4E0}',R:'\u{1D4E1}',S:'\u{1D4E2}',T:'\u{1D4E3}',U:'\u{1D4E4}',V:'\u{1D4E5}',W:'\u{1D4E6}',X:'\u{1D4E7}',Y:'\u{1D4E8}',Z:'\u{1D4E9}'},
  'Aesthetic':       {a:'ａ',b:'ｂ',c:'ｃ',d:'ｄ',e:'ｅ',f:'ｆ',g:'ｇ',h:'ｈ',i:'ｉ',j:'ｊ',k:'ｋ',l:'ｌ',m:'ｍ',n:'ｎ',o:'ｏ',p:'ｐ',q:'ｑ',r:'ｒ',s:'ｓ',t:'ｔ',u:'ｕ',v:'ｖ',w:'ｗ',x:'ｘ',y:'ｙ',z:'ｚ',A:'Ａ',B:'Ｂ',C:'Ｃ',D:'Ｄ',E:'Ｅ',F:'Ｆ',G:'Ｇ',H:'Ｈ',I:'Ｉ',J:'Ｊ',K:'Ｋ',L:'Ｌ',M:'Ｍ',N:'Ｎ',O:'Ｏ',P:'Ｐ',Q:'Ｑ',R:'Ｒ',S:'Ｓ',T:'Ｔ',U:'Ｕ',V:'Ｖ',W:'Ｗ',X:'Ｘ',Y:'Ｙ',Z:'Ｚ'},
  'Tiny':            {a:'ᵃ',b:'ᵇ',c:'ᶜ',d:'ᵈ',e:'ᵉ',f:'ᶠ',g:'ᵍ',h:'ʰ',i:'ⁱ',j:'ʲ',k:'ᵏ',l:'ˡ',m:'ᵐ',n:'ⁿ',o:'ᵒ',p:'ᵖ',q:'q',r:'ʳ',s:'ˢ',t:'ᵗ',u:'ᵘ',v:'ᵛ',w:'ʷ',x:'ˣ',y:'ʸ',z:'ᶻ',A:'ᴬ',B:'ᴮ',C:'ᶜ',D:'ᴰ',E:'ᴱ',F:'ᶠ',G:'ᴳ',H:'ᴴ',I:'ᴵ',J:'ᴶ',K:'ᴷ',L:'ᴸ',M:'ᴹ',N:'ᴺ',O:'ᴼ',P:'ᴾ',Q:'Q',R:'ᴿ',S:'ˢ',T:'ᵀ',U:'ᵁ',V:'ᵛ',W:'ᵂ',X:'ˣ',Y:'ʸ',Z:'ᶻ'},
  'Inverted':        {a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',A:'∀',B:'q',C:'Ɔ',D:'p',E:'Ǝ',F:'Ⅎ',G:'פ',H:'H',I:'I',J:'ɾ',K:'ʞ',L:'˥',M:'W',N:'N',O:'O',P:'Ԁ',Q:'Q',R:'ɹ',S:'S',T:'┴',U:'∩',V:'Λ',W:'M',X:'X',Y:'ʎ',Z:'Z'},
  'Mirror':          {a:'ɒ',b:'d',c:'ɔ',d:'b',e:'ɘ',f:'ʇ',g:'ϱ',h:'ʜ',i:'i',j:'ᴉ',k:'ʞ',l:'l',m:'m',n:'n',o:'o',p:'q',q:'p',r:'ɿ',s:'ƨ',t:'ƚ',u:'u',v:'v',w:'w',x:'x',y:'y',z:'z',A:'A',B:'ᗺ',C:'Ɔ',D:'ᗡ',E:'Ǝ',F:'ꟻ',G:'Ꭾ',H:'H',I:'I',J:'Ꮈ',K:'ꓘ',L:'⅃',M:'M',N:'И',O:'O',P:'ꟼ',Q:'Ọ',R:'Я',S:'Ƨ',T:'T',U:'U',V:'V',W:'W',X:'X',Y:'Y',Z:'Z'},
  'Currency':        {a:'₳',b:'฿',c:'₵',d:'₫',e:'€',f:'₣',g:'₲',h:'♄',i:'ł',j:'ʝ',k:'₭',l:'₤',m:'₥',n:'₦',o:'ø',p:'₱',q:'q',r:'®',s:'$',t:'₮',u:'µ',v:'√',w:'₩',x:'×',y:'¥',z:'z',A:'₳',B:'฿',C:'₵',D:'₫',E:'€',F:'₣',G:'₲',H:'♄',I:'ł',J:'ʝ',K:'₭',L:'₤',M:'₥',N:'₦',O:'ø',P:'₱',Q:'Q',R:'®',S:'$',T:'₮',U:'µ',V:'√',W:'₩',X:'×',Y:'¥',Z:'Z'},
  'Dotted':          {a:'ȧ',b:'ḃ',c:'ċ',d:'ḋ',e:'ė',f:'ḟ',g:'ġ',h:'ḣ',i:'ı',j:'j',k:'k',l:'l',m:'ṁ',n:'ṅ',o:'ȯ',p:'ṗ',q:'q',r:'ṙ',s:'ṡ',t:'ṫ',u:'u',v:'v',w:'ẇ',x:'ẋ',y:'ẏ',z:'ż',A:'Ȧ',B:'Ḃ',C:'Ċ',D:'Ḋ',E:'Ė',F:'Ḟ',G:'Ġ',H:'Ḣ',I:'İ',J:'J',K:'K',L:'L',M:'Ṁ',N:'Ṅ',O:'Ȯ',P:'Ṗ',Q:'Q',R:'Ṙ',S:'Ṡ',T:'Ṫ',U:'U',V:'V',W:'Ẇ',X:'Ẋ',Y:'Ẏ',Z:'Ż'},
  'Old English':     {a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵'},
  'Parenthesis':    {a:'⒜',b:'⒝',c:'⒞',d:'⒟',e:'⒠',f:'⒡',g:'⒢',h:'⒣',i:'⒤',j:'⒥',k:'⒦',l:'⒧',m:'⒨',n:'⒩',o:'⒪',p:'⒫',q:'⒬',r:'⒭',s:'⒮',t:'⒯',u:'⒰',v:'⒱',w:'⒲',x:'⒳',y:'⒴',z:'⒵',A:'⒜',B:'⒝',C:'⒞',D:'⒟',E:'⒠',F:'⒡',G:'⒢',H:'⒣',I:'⒤',J:'⒥',K:'⒦',L:'⒧',M:'⒨',N:'⒩',O:'⒪',P:'⒫',Q:'⒬',R:'⒭',S:'⒮',T:'⒯',U:'⒰',V:'⒱',W:'⒲',X:'⒳',Y:'⒴',Z:'⒵'},
  'Flags':          {a:'🇦',b:'🇧',c:'🇨',d:'🇩',e:'🇪',f:'🇫',g:'🇬',h:'🇭',i:'🇮',j:'🇯',k:'🇰',l:'🇱',m:'🇲',n:'🇳',o:'🇴',p:'🇵',q:'🇶',r:'🇷',s:'🇸',t:'🇹',u:'🇺',v:'🇻',w:'🇼',x:'🇽',y:'🇾',z:'🇿',A:'🇦',B:'🇧',C:'🇨',D:'🇩',E:'🇪',F:'🇫',G:'🇬',H:'🇭',I:'🇮',J:'🇯',K:'🇰',L:'🇱',M:'🇲',N:'🇳',O:'🇴',P:'🇵',Q:'🇶',R:'🇷',S:'🇸',T:'🇹',U:'🇺',V:'🇻',W:'🇼',X:'🇽',Y:'🇾',Z:'🇿'}
}
let out = ''
for (let [name, map] of Object.entries(maps)) {
  if (name === 'Wide') {
    let w = [...ftIn].map(c=>{let code=c.charCodeAt(0);return (code>=33&&code<=126)?String.fromCharCode(code+65248):c==' '?'　':c}).join('')
    out += `*${name}:*\n${w}\n\n`
  } else if (Object.keys(map).length === 0) {
    out += ''
  } else {
    out += `*${name}:*\n${[...ftIn].map(c=>map[c]||c).join('')}\n\n`
  }
}
reply(out.trim())
} break


//━━━━━━━━━━━━━━━━━━━━━━━━//
// Text Maker Commands (using Pollinations image generation)
case 'metallic':
case 'ice':
case 'snow':
case 'impressive':
case 'matrix':
case 'light':
case 'neon':
case 'devil':
case 'purple':
case 'thunder':
case 'leaves':
case '1917':
case 'arena':
case 'hacker':
case 'sand':
case 'blackpink':
case 'glitch':
case 'fire': {
    await X.sendMessage(m.chat, { react: { text: '🔥', key: m.key } })
let _tmRaw = text || (m.quoted && (m.quoted.text || m.quoted.caption || m.quoted.body || '').trim()) || ''
// Strip any "*Xxx Text:*" or "Text:*" prefixes from quoted bot replies to prevent nesting
let tmText = _tmRaw.replace(/^(\*[\w\s]+ Text:\*\s*)+/i, '').replace(/^(Text:\*\s*)+/i, '').trim()
if (!tmText) return reply(`Example: ${prefix}${command} Your Text Here\n_Or reply to a message containing the text_`)

const _label = command.charAt(0).toUpperCase() + command.slice(1)
const _caption = `*${_label} Text:* ${tmText}`

// ── Style configs: bg RGB, font (sans/mono/serif), layers [{ox,oy,r,g,b}], blur ──
const _tmStyles = {
    metallic: { bg:[18,18,30],  font:'sans',  layers:[[6,6,34,34,51],[4,4,68,68,85],[2,2,136,136,153],[1,1,187,187,204],[0,0,232,232,248]] },
    ice:      { bg:[3,8,24],    font:'sans',  layers:[[6,6,0,17,51],[4,4,0,51,102],[2,2,0,85,170],[1,1,68,170,221],[0,0,170,238,255]] },
    snow:     { bg:[200,216,240],font:'sans', layers:[[5,5,136,153,187],[3,3,170,187,221],[1,1,204,221,240],[0,0,255,255,255]] },
    impressive:{ bg:[13,8,0],   font:'sans',  layers:[[7,7,61,32,0],[5,5,122,64,0],[3,3,204,136,0],[1,1,255,204,0],[0,0,255,240,170]] },
    matrix:   { bg:[0,8,0],     font:'mono',  layers:[[5,5,0,20,0],[3,3,0,68,0],[1,1,0,170,0],[0,0,0,255,65]] },
    light:    { bg:[0,0,16],    font:'sans',  layers:[[-6,-6,68,68,0],[-4,-4,136,136,0],[-2,-2,204,204,0],[6,6,68,68,0],[4,4,136,136,0],[2,2,204,204,0],[0,0,255,255,204]], blur:1 },
    neon:     { bg:[5,0,26],    font:'sans',  layers:[[6,0,170,0,136],[-6,0,170,0,136],[0,6,170,0,136],[0,-6,170,0,136],[4,4,204,0,204],[-4,-4,204,0,204],[0,0,255,136,255]], blur:1 },
    devil:    { bg:[16,0,0],    font:'sans',  layers:[[7,7,51,0,0],[5,5,102,0,0],[3,3,170,0,0],[1,1,221,34,0],[0,0,255,85,51]] },
    purple:   { bg:[8,0,16],    font:'sans',  layers:[[6,6,17,0,51],[4,4,51,0,102],[2,2,102,0,204],[1,1,153,51,255],[0,0,204,153,255]] },
    thunder:  { bg:[5,5,16],    font:'sans',  layers:[[6,6,34,34,0],[4,4,102,102,0],[2,2,170,170,0],[1,1,255,255,0],[0,0,255,255,170]], blur:1 },
    leaves:   { bg:[0,21,0],    font:'sans',  layers:[[6,6,0,26,0],[4,4,0,51,0],[2,2,17,102,0],[1,1,51,170,0],[0,0,136,238,68]] },
    '1917':   { bg:[26,16,8],   font:'serif', layers:[[5,5,42,26,8],[3,3,107,68,32],[1,1,170,119,68],[0,0,212,169,106]] },
    arena:    { bg:[16,8,0],    font:'sans',  layers:[[7,7,42,16,0],[5,5,106,40,0],[3,3,204,85,0],[1,1,255,136,0],[0,0,255,204,136]] },
    hacker:   { bg:[0,3,0],     font:'mono',  layers:[[3,3,0,34,0],[1,1,0,102,0],[0,0,0,255,0]] },
    sand:     { bg:[26,16,5],   font:'serif', layers:[[6,6,58,42,16],[4,4,122,90,40],[2,2,192,144,80],[1,1,212,170,112],[0,0,238,221,153]] },
    blackpink:{ bg:[10,0,10],   font:'sans',  layers:[[6,6,51,0,51],[4,4,136,0,68],[2,2,204,0,102],[1,1,255,68,170],[0,0,255,187,221]] },
    glitch:   { bg:[0,0,16],    font:'mono',  layers:[[-5,0,255,0,0],[5,0,0,255,255],[0,0,255,255,255]] },
    fire:     { bg:[13,2,0],    font:'sans',  layers:[[7,7,51,0,0],[5,5,136,17,0],[3,3,204,68,0],[2,2,255,102,0],[1,1,255,170,0],[0,0,255,238,136]] },
}

const _sty = _tmStyles[command] || _tmStyles.fire
const _fs = require('fs')
const _path = require('path')
const _os = require('os')
const _outFile = _path.join(_os.tmpdir(), `tm_${Date.now()}.jpg`)

// Build a self-contained Python script — no PATH issues, Pillow works everywhere
const _safeText = tmText.replace(/\\/g, '').replace(/'/g, "\\'").replace(/\n/g, ' ').trim().slice(0, 80)
const _layersJson = JSON.stringify(_sty.layers)
const _bgJson = JSON.stringify(_sty.bg)
const _fontType = _sty.font
const _blur = _sty.blur || 0

const _pyScript = `
import sys, os

# Auto-install Pillow if not available
try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
except ImportError:
    import subprocess
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'Pillow', '--quiet', '--user'], check=True)
    from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1024, 400
text = '${_safeText}'
font_type = '${_fontType}'
bg = tuple(${_bgJson})
layers = ${_layersJson}
blur = ${_blur}
out = '${_outFile.replace(/\\/g, '/')}'

FONTS = {
    'sans':  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    'mono':  '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
    'serif': '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
}
font_path = FONTS.get(font_type, FONTS['sans'])
if not os.path.exists(font_path):
    import glob
    candidates = (
        glob.glob('/usr/share/fonts/**/*Bold*.ttf', recursive=True) +
        glob.glob('/usr/share/fonts/**/*bold*.ttf', recursive=True) +
        glob.glob('/usr/local/share/fonts/**/*.ttf', recursive=True) +
        glob.glob('/data/data/com.termux/files/usr/share/fonts/**/*.ttf', recursive=True) +
        glob.glob(os.path.expanduser('~/.fonts/**/*.ttf'), recursive=True) +
        glob.glob('/system/fonts/*.ttf')
    )
    font_path = candidates[0] if candidates else None

n = len(text)
pt = 160 if n<=6 else 130 if n<=10 else 105 if n<=15 else 80 if n<=22 else 60 if n<=32 else 45

font = ImageFont.truetype(font_path, pt) if font_path else ImageFont.load_default()

img = Image.new('RGB', (W, H), bg)
draw = ImageDraw.Draw(img)
bbox = draw.textbbox((0, 0), text, font=font)
tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
x, y = (W-tw)//2, (H-th)//2

for layer in layers:
    ox, oy, r, g, b = layer
    draw.text((x+ox, y+oy), text, font=font, fill=(r, g, b))

if blur:
    img = img.filter(ImageFilter.GaussianBlur(radius=blur))

img.save(out, 'JPEG', quality=92)
print('OK')
`

const _pyFile = _path.join(_os.tmpdir(), `tm_${Date.now()}_gen.py`)
_fs.writeFileSync(_pyFile, _pyScript)

// Use async exec — keeps event loop alive during render so WA gets ACKs
// spawnSync was blocking the loop → WA retried the message → double image
await new Promise((resolve) => {
    const { exec: _exec } = require('child_process')
    // Try python3 first, fall back to python
    const _tryRender = (bins, idx) => {
        if (idx >= bins.length) {
            // All python attempts failed — fall back to Jimp
            resolve({ usedJimp: true })
            return
        }
        _exec(`${bins[idx]} "${_pyFile}"`, { timeout: 25000 }, (err, stdout, stderr) => {
            if (!err) {
                resolve({ usedJimp: false })
            } else if (idx + 1 < bins.length) {
                _tryRender(bins, idx + 1)
            } else {
                resolve({ usedJimp: true, pyErr: (stderr || err.message || '').trim().split('\n').slice(-3).join(' | ') })
            }
        })
    }
    _tryRender(['python3', 'python'], 0)
}).then(async ({ usedJimp, pyErr }) => {
    if (!usedJimp) {
        // Python succeeded
        try {
            const _buf = _fs.readFileSync(_outFile)
            try { _fs.unlinkSync(_pyFile); _fs.unlinkSync(_outFile) } catch {}
            if (!_buf || _buf.length < 2000) throw new Error('Empty render')
            await X.sendMessage(m.chat, { image: _buf, caption: _caption }, { quoted: m })
        } catch(e) {
            try { _fs.unlinkSync(_pyFile); _fs.unlinkSync(_outFile) } catch {}
            reply(`❌ *Text maker failed:* ${e.message.slice(0, 150)}`)
        }
    } else {
        // Jimp fallback
        try { _fs.unlinkSync(_pyFile) } catch {}
        try { _fs.unlinkSync(_outFile) } catch {}
        try {
            const Jimp = require('jimp')
            const _W = 1024, _H = 400
            const _img = new Jimp(_W, _H, Jimp.rgbaToInt(_sty.bg[0], _sty.bg[1], _sty.bg[2], 255))
            const _font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE)
            const _tw = Jimp.measureText(_font, tmText)
            const _th = Jimp.measureTextHeight(_font, tmText, _W)
            const _cx = Math.max(0, Math.floor((_W - _tw) / 2))
            const _cy = Math.max(0, Math.floor((_H - _th) / 2))
            for (const [_ox, _oy, _r, _g, _b] of _sty.layers) {
                const _layer = new Jimp(_W, _H, 0x00000000)
                _layer.print(_font, _cx + _ox, _cy + _oy, tmText)
                _layer.scan(0, 0, _W, _H, function(_x, _y, _i) {
                    if (this.bitmap.data[_i + 3] > 10) {
                        this.bitmap.data[_i] = _r
                        this.bitmap.data[_i + 1] = _g
                        this.bitmap.data[_i + 2] = _b
                    }
                })
                _img.composite(_layer, 0, 0, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 1, opacityDest: 1 })
            }
            const _buf2 = await _img.getBufferAsync(Jimp.MIME_JPEG)
            await X.sendMessage(m.chat, { image: _buf2, caption: _caption }, { quoted: m })
        } catch(e2) {
            reply(`❌ *Text maker failed:* ${pyErr || e2.message}`.slice(0, 200))
        }
    }
})
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Image Edit Commands
case 'heart': {
    await X.sendMessage(m.chat, { react: { text: '❤️', key: m.key } })
if (!m.quoted || !/image/.test(m.quoted.mimetype || '')) {
    let heartTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : sender
    X.sendMessage(from, { text: `*💕 ${pushname} sends love to @${heartTarget.split('@')[0]}! 💕*`, mentions: [heartTarget] }, { quoted: m })
} else {
    try {
        const imgBuf = await m.quoted.download()
        const Jimp = require('jimp')
        const img = await Jimp.read(imgBuf)
        img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
            this.bitmap.data[idx]   = Math.min(255, this.bitmap.data[idx] + 80)
            this.bitmap.data[idx+1] = Math.max(0,   this.bitmap.data[idx+1] - 30)
            this.bitmap.data[idx+2] = Math.max(0,   this.bitmap.data[idx+2] - 30)
        })
        const output = await img.getBufferAsync(Jimp.MIME_JPEG)
        await X.sendMessage(from, { image: output, caption: '💕 *Heart effect applied!*' }, { quoted: m })
    } catch(e) { reply('❌ Failed to apply heart effect: ' + e.message) }
}
} break

case 'rizz': {
    await X.sendMessage(m.chat, { react: { text: '😎', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let rizzTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : sender
let rizzLevel = Math.floor(Math.random() * 101)
const rizzMsg = rizzLevel > 80 ? 'Unmatched rizz! 😎🔥' : rizzLevel > 50 ? 'Solid rizz game 💪' : rizzLevel > 30 ? 'Rizz needs work 😅' : 'No rizz detected 💀'
X.sendMessage(from, { text: `╔═════════╗\n║  😎 *RIZZ METER*\n╚═════════╝\n\n  👤 @${rizzTarget.split('@')[0]}\n\n  ${'🔥'.repeat(Math.floor(rizzLevel/10))}${'⬜'.repeat(10 - Math.floor(rizzLevel/10))} *${rizzLevel}%*\n\n  _${rizzMsg}_`, mentions: [rizzTarget] }, { quoted: m })
} break

case 'circle': {
    await X.sendMessage(m.chat, { react: { text: '⭕', key: m.key } })
if (!m.quoted || !/image/.test(m.quoted.mimetype || '')) return reply(`Reply to an image with ${prefix}circle`)
try {
let buf = await m.quoted.download()
await X.sendMessage(m.chat, { sticker: buf }, { quoted: m })
} catch(e) { reply('Error: ' + e.message) }
} break

case 'lgbt': {
    await X.sendMessage(m.chat, { react: { text: '🌈', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let lgbtTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : sender
X.sendMessage(from, { text: `*🏳️‍🌈 @${lgbtTarget.split('@')[0]} supports LGBTQ+! 🏳️‍🌈*\n🌈 Love is Love 🌈`, mentions: [lgbtTarget] }, { quoted: m })
} break

case 'lolice':
case 'police': {
    await X.sendMessage(m.chat, { react: { text: '🚔', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let policeTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : sender
const policeReasons = ['Being too awesome 😂', 'Excessive good vibes ✨', 'Stealing hearts 💘', 'Being suspiciously cool 😎', 'Causing too much fun 🎉']
const reason = policeReasons[Math.floor(Math.random() * policeReasons.length)]
X.sendMessage(from, { text: `╔═════════╗\n║  🚔 *POLICE ALERT!*\n╚═════════╝\n\n  🚨 @${policeTarget.split('@')[0]} has been arrested!\n\n  ├ 📋 *Crime* › ${reason}\n  └ ⚖️  *Sentence* › Life of fun 🎉`, mentions: [policeTarget] }, { quoted: m })
} break

case 'namecard': {
    await X.sendMessage(m.chat, { react: { text: '🪪', key: m.key } })
let ncName = text || pushname
reply(`╔═════════╗\n   *${ncName}*\n   ${global.botname}\n╚═════════╝`)
} break

case 'tweet': {
    await X.sendMessage(m.chat, { react: { text: '🐦', key: m.key } })
if (!text) return reply(`Example: ${prefix}tweet I love coding!`)
reply(`╔═════════╗\n║  🐦 *TWEET*\n╚═════════╝\n\n  👤 *@${pushname}*\n  ${text}\n\n  ❤️ ${Math.floor(Math.random() * 10000)}  🔁 ${Math.floor(Math.random() * 5000)}  💬 ${Math.floor(Math.random() * 1000)}`)
} break

case 'ytcomment': {
    await X.sendMessage(m.chat, { react: { text: '💬', key: m.key } })
if (!text) return reply(`Example: ${prefix}ytcomment This video is amazing!`)
reply(`╔═════════╗\n║  ▶️  *YOUTUBE COMMENT*\n╚═════════╝\n\n  👤 *${pushname}*\n  ${text}\n\n  👍 ${Math.floor(Math.random() * 5000)}  👎  💬 ${Math.floor(Math.random() * 200)} replies`)
} break

case 'comrade': {
    await X.sendMessage(m.chat, { react: { text: '☭', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let comradeTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : sender
X.sendMessage(from, { text: `*☭ Our Comrade @${comradeTarget.split('@')[0]}! ☭*\nServing the motherland with honor!`, mentions: [comradeTarget] }, { quoted: m })
} break

case 'vibe': {
    await X.sendMessage(m.chat, { react: { text: '✨', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*\n\nUse *${prefix}antisocialgames off* to re-enable.`)
let vibeTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : sender
let vibeLevel = Math.floor(Math.random() * 101)
const vibeMsg = vibeLevel > 80 ? 'Absolutely radiating! 🔥' : vibeLevel > 50 ? 'Good vibes only ✨' : vibeLevel > 30 ? 'Vibes loading... 😌' : 'Needs a coffee first ☕'
X.sendMessage(from, { text: `╔═════════╗\n║  ✨ *VIBE CHECK*\n╚═════════╝\n\n  👤 @${vibeTarget.split('@')[0]}\n\n  ${'✨'.repeat(Math.floor(vibeLevel/10))}${'⬜'.repeat(10 - Math.floor(vibeLevel/10))} *${vibeLevel}%*\n\n  _${vibeMsg}_`, mentions: [vibeTarget] }, { quoted: m })
} break

case 'gay': {
    await X.sendMessage(m.chat, { react: { text: '🏳️‍🌈', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let gayTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : sender
let gayLevel = Math.floor(Math.random() * 101)
const gayMsg = gayLevel > 90 ? 'Absolutely fabulous! 🏳️‍🌈💅' : gayLevel > 70 ? 'Serving rainbow energy ✨' : gayLevel > 50 ? 'Somewhere over the rainbow 🌈' : gayLevel > 30 ? 'Just a little bit 😅' : 'Straight as an arrow 🏹'
X.sendMessage(from, { text: `╔═════════╗\n║  🏳️‍🌈 *GAY METER*\n╚═════════╝\n\n  👤 @${gayTarget.split('@')[0]}\n\n  ${'🌈'.repeat(Math.floor(gayLevel/10))}${'⬜'.repeat(10 - Math.floor(gayLevel/10))} *${gayLevel}%*\n\n  _${gayMsg}_`, mentions: [gayTarget] }, { quoted: m })
} break

case 'glass': {
    await X.sendMessage(m.chat, { react: { text: '🕶️', key: m.key } })
if (!m.quoted || !/image/.test(m.quoted.mimetype || '')) return reply(`Reply to an image with *${prefix}glass* to apply a frosted glass blur effect.`)
try {
    const imgBuf = await m.quoted.download()
    const Jimp = require('jimp')
    const img = await Jimp.read(imgBuf)
    img.blur(8).brightness(-0.05).contrast(0.15)
    const output = await img.getBufferAsync(Jimp.MIME_JPEG)
    await X.sendMessage(from, { image: output, caption: '🪟 *Glass effect applied!*' }, { quoted: m })
} catch(e) { reply('❌ Failed to apply glass effect: ' + e.message) }
} break

case 'jail': {
    await X.sendMessage(m.chat, { react: { text: '⛓️', key: m.key } })
let jailTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : sender
X.sendMessage(from, { text: `*🔒 @${jailTarget.split('@')[0]} has been jailed! 🔒*\nCrime: Being too awesome\nSentence: Life 😂`, mentions: [jailTarget] }, { quoted: m })
} break

case 'passed': {
    await X.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
let passedTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : sender
X.sendMessage(from, { text: `*✅ @${passedTarget.split('@')[0]} has PASSED! ✅*\nCongratulations! 🎉`, mentions: [passedTarget] }, { quoted: m })
} break

case 'triggered': {
    await X.sendMessage(m.chat, { react: { text: '😡', key: m.key } })
let triggeredTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : sender
X.sendMessage(from, { text: `*⚡ @${triggeredTarget.split('@')[0]} is TRIGGERED! ⚡*\n😤😤😤`, mentions: [triggeredTarget] }, { quoted: m })
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// GitHub Commands
case 'git':
case 'github': {
    await X.sendMessage(m.chat, { react: { text: '🐙', key: m.key } })
if (!text) return reply(`Example: ${prefix}github torvalds`)
try {
let res = await fetch(`https://api.github.com/users/${encodeURIComponent(text)}`)
let data = await res.json()
if (data.message) return reply('User not found.')
let info = `*GitHub Profile:*\n\n👤 Name: ${data.name || data.login}\n📝 Bio: ${data.bio || 'N/A'}\n📍 Location: ${data.location || 'N/A'}\n🏢 Company: ${data.company || 'N/A'}\n📦 Repos: ${data.public_repos}\n👥 Followers: ${data.followers}\n👤 Following: ${data.following}\n🔗 URL: ${data.html_url}\n📅 Joined: ${new Date(data.created_at).toLocaleDateString()}`
if (data.avatar_url) {
await X.sendMessage(m.chat, { image: { url: data.avatar_url }, caption: info }, { quoted: m })
} else reply(info)
} catch(e) { reply('Error: ' + e.message) }
} break

case 'repo': {
    await X.sendMessage(m.chat, { react: { text: '📦', key: m.key } })
try {
// Default to bot repo if no arg given
let repoPath = 'TOOSII102/TOOSII-XD-ULTRA'
if (text) {
    repoPath = text.includes('/') ? text.trim() : `${text.trim()}/${text.trim()}`
}
// Don't encode the whole path — only encode each segment
const [owner, ...repoParts] = repoPath.split('/')
const repoName = repoParts.join('/')
let res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`, {
    headers: { 'User-Agent': 'TOOSII-XD-ULTRA-Bot' }
})
let data = await res.json()
if (data.message) {
    return reply(
        `╔═════════╗\n║  ❌ *REPO NOT FOUND*\n╚═════════╝\n\n` +
        `│\n` +
        `│ Could not find: *${repoPath}*\n` +
        `│\n` +
        `│ 💡 Try: *.repo owner/reponame*\n` +
        `│\n` +
        `│ 📦 *Bot Repo:*\n` +
        `│ github.com/TOOSII102/TOOSII-XD-ULTRA\n` +
        `│\n` +
        `│ ⭐ *Star* & 🍴 *Fork* the bot repo!\n` +
        `│ 👉 ${global.repoUrl}/fork\n` +
        `│\n` +
        `╰━━━━━━━━━━━━━━━━━╯`
    )
}
const repoInfo =
`╔═════════╗
║  📦 *REPOSITORY INFO*
╚═════════╝

  🏷️  *${data.full_name}*
  📝  _${(data.description || 'No description').slice(0,60)}_

  ├◈ ⭐ *Stars*    › ${data.stargazers_count}
  ├◈ 🍴 *Forks*    › ${data.forks_count}
  ├◈ 💻 *Language* › ${data.language || 'N/A'}
  └◈ 🔄 *Updated*  › ${new Date(data.updated_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}

  🔗 ${data.html_url}

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  💛 *Enjoyed the bot?*
  ⭐ Star & 🍴 Fork — every click counts!

  🔑 *Session* › ${global.sessionUrl}
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
_⚡ Powered by Toosii Tech — wa.me/254748340864_`
reply(repoInfo)
} catch(e) { reply('❌ Error fetching repo: ' + e.message) }
} break

case 'sc':
case 'script':
case 'source': {
    await X.sendMessage(m.chat, { react: { text: '📜', key: m.key } })
let scText = `╔═════════╗
║  📂 *SOURCE CODE*
╚═════════╝

  🤖 *${global.botname}*

  ├◈ 🔗 *GitHub*
  │  github.com/TOOSII102/TOOSII-XD-ULTRA
  ├◈ 🍴 *Fork it*
  │  github.com/TOOSII102/TOOSII-XD-ULTRA/fork
  ├◈ 👨‍💻 *Dev*     › ${global.ownername}
  └◈ 📞 *Contact* › ${global.ownerNumber}

_© ${global.ownername} — All Rights Reserved_`
reply(scText)
} break

case 'clone': {
    await X.sendMessage(m.chat, { react: { text: '📦', key: m.key } })
if (!text) return reply(`Example: ${prefix}clone https://github.com/user/repo`)
try {
let match = text.match(/github\.com\/([^\/]+)\/([^\/\s]+)/)
if (!match) return reply('Invalid GitHub URL.')
let [, user, repo] = match
repo = repo.replace(/\.git$/, '')
let zipUrl = `https://api.github.com/repos/${user}/${repo}/zipball`
await X.sendMessage(m.chat, { document: { url: zipUrl }, mimetype: 'application/zip', fileName: `${repo}.zip` }, { quoted: m })
} catch(e) { reply('Error: ' + e.message) }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌤️  WEATHER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'weather':
case 'clima': {
    await X.sendMessage(m.chat, { react: { text: '🌤️', key: m.key } })
    if (!text) return reply(`🌤️ Usage: *${prefix}weather [city]*\nExample: ${prefix}weather Nairobi`)
    try {
        let r = await fetch(`https://api.giftedtech.co.ke/api/search/weather?apikey=${_giftedKey()}&location=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(15000) })
        let d = await r.json()
        if (!d.success || !d.result) throw new Error('No weather data')
        let w = d.result
        let msg = `╔═════════╗\n║  🌤️ *WEATHER* — ${(w.location || text).toUpperCase()}\n╚═════════╝\n\n`
        msg += `  📍 *Location:* ${w.location || text}\n`
        if (w.weather) {
            msg += `  🌡️ *Condition:* ${w.weather.description || w.weather.main}\n`
        }
        if (w.main) {
            msg += `  🌡️ *Temperature:* ${w.main.temp}°C (feels like ${w.main.feels_like}°C)\n`
            msg += `  🔼 *Max:* ${w.main.temp_max}°C  🔽 *Min:* ${w.main.temp_min}°C\n`
            msg += `  💧 *Humidity:* ${w.main.humidity}%\n`
            msg += `  🔵 *Pressure:* ${w.main.pressure} hPa\n`
        }
        if (w.wind) msg += `  💨 *Wind:* ${w.wind.speed} m/s\n`
        if (w.visibility) msg += `  👁️ *Visibility:* ${Math.round(w.visibility/1000)} km\n`
        if (w.clouds) msg += `  ☁️ *Cloud Cover:* ${w.clouds.all}%\n`
        await reply(msg)
    } catch(e) { reply(`❌ Could not fetch weather for *${text}*. Try a different city name.`) }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔗  URL SHORTENER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'tinyurl':
case 'shorturl':
case 'shorten': {
    await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
    if (!text || !text.startsWith('http')) return reply(`🔗 Usage: *${prefix}tinyurl [url]*\nExample: ${prefix}tinyurl https://google.com`)
    try {
        let r = await fetch(`https://api.giftedtech.co.ke/api/tools/tinyurl?apikey=${_giftedKey()}&url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(15000) })
        let d = await r.json()
        if (!d.success || !d.result) throw new Error('Failed')
        await reply(`🔗 *URL Shortener*\n\n📎 *Original:* ${text}\n✅ *Short URL:* ${d.result}`)
    } catch(e) { reply('❌ Failed to shorten URL. Make sure it starts with https://') }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💘  PICKUP LINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'pickupline':
case 'flirt':
case 'rizz': {
    await X.sendMessage(m.chat, { react: { text: '💘', key: m.key } })
    try {
        let r = await fetch(`https://api.giftedtech.co.ke/api/fun/pickupline?apikey=${_giftedKey()}`, { signal: AbortSignal.timeout(15000) })
        let d = await r.json()
        if (!d.success || !d.result) throw new Error('No line')
        await reply(`💘 *Pickup Line*\n\n_"${d.result}"_`)
    } catch(e) { reply('❌ Could not fetch a pickup line right now. Try again!') }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📷  READ QR CODE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'readqr':
case 'scanqr':
case 'qrread': {
    await X.sendMessage(m.chat, { react: { text: '📷', key: m.key } })
    if (!m.quoted || !/image/.test(m.quoted.mimetype || m.quoted.msg?.mimetype || '')) {
        return reply(`📷 *Read QR Code*\n\nReply to an image containing a QR code with *${prefix}readqr*`)
    }
    try {
        await reply('📷 _Scanning QR code..._')
        let _buf = await m.quoted.download()
        if (!_buf || _buf.length < 100) throw new Error('Image download failed')
        let _tmp = require("path").join(__dirname, "tmp", `qr_${Date.now()}.png`)
        fs.writeFileSync(_tmp, _buf)
        let _url = await CatBox(_tmp)
        try { fs.unlinkSync(_tmp) } catch {}
        if (!_url) throw new Error('Upload failed')
        let r = await fetch(`https://api.giftedtech.co.ke/api/tools/readqr?apikey=${_giftedKey()}&url=${encodeURIComponent(_url)}`, { signal: AbortSignal.timeout(25000) })
        let d = await r.json()
        if (!d.success || !d.result) throw new Error('Could not read QR')
        let qrData = d.result?.qrcode_data || d.result
        await reply(`📷 *QR Code Content*\n\n${qrData}`)
    } catch(e) { reply(`❌ Could not read the QR code. Make sure the image is clear and contains a valid QR code.`) }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎨  AI IMAGE GENERATOR (DeepImg)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'deepimg':
case 'genimage':
case 'aiart': {
    await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
    if (!text) return reply(`🎨 *AI Image Generator*\n\nUsage: *${prefix}${command} [describe your image]*\n\nExamples:\n• ${prefix}${command} A beautiful sunset over the ocean\n• ${prefix}${command} A futuristic city at night`)
    try {
        await reply('🎨 _Generating your image with AI, please wait..._')
        let r = await fetch(`https://api.giftedtech.co.ke/api/ai/fluximg?apikey=${_giftedKey()}&prompt=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(60000) })
        let d = await r.json()
        let _imgUrl = d?.result?.url || d?.result
        if (!d.success || !_imgUrl) {
            // MagicStudio returns raw JPEG — send the URL directly without JSON parsing
            _imgUrl = `https://api.giftedtech.co.ke/api/ai/magicstudio?apikey=${_giftedKey()}&prompt=${encodeURIComponent(text)}`
        }
        if (!_imgUrl) throw new Error('Image generation failed')
        await X.sendMessage(m.chat, { image: { url: _imgUrl }, caption: `🎨 *AI Generated Image*\n📝 _${text}_` }, { quoted: m })
    } catch(e) { reply(`❌ Image generation failed. Try a different prompt.`) }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎵  AI SONG GENERATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'songgenerator':
case 'makesong':
case 'aisong': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
    if (!text) return reply(`🎵 *AI Song Generator*\n\nUsage: *${prefix}songgenerator [describe your song]*\n\nExamples:\n• ${prefix}songgenerator A love song about the stars\n• ${prefix}songgenerator Upbeat Afrobeats about success`)
    try {
        await reply('🎵 _Composing your song with AI, please wait (this may take a while)..._')
        let r = await fetch(`https://api.giftedtech.co.ke/api/tools/songgenerator?apikey=${_giftedKey()}&prompt=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(120000) })
        let d = await r.json()
        if (!d.success || !d.result) throw new Error('Song generation failed')
        let res = d.result
        let audioUrl = typeof res === 'string' ? res : (res.audio_url || res.url || res.download_url)
        if (audioUrl) {
            await X.sendMessage(m.chat, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', fileName: 'ai_song.mp3', caption: `🎵 *AI Generated Song*\n📝 _${text}_` }, { quoted: m })
        } else {
            await reply(`🎵 *AI Song Generated!*\n\n${JSON.stringify(res, null, 2)}`)
        }
    } catch(e) { reply(`❌ Song generation failed. Try a simpler prompt.`) }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚽  FOOTBALL LIVE SCORE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'livescore':
case 'livescores':
case 'footballscore': {
    await X.sendMessage(m.chat, { react: { text: '⚽', key: m.key } })
    try {
        await reply('⚽ _Fetching live football scores..._')
        const _lsData = await _getLiveScores()
        if (!_lsData || !_lsData.matches?.length) return reply('⚽ No live matches right now. Try again during match time.')
        let matches = _lsData.matches
        let msg = `╔═════════╗\n║  ⚽ *LIVE FOOTBALL SCORES* (${matches.length} matches)\n╚═════════╝\n`
        let currentLeague = ''
        for (let _lm of matches) {
            if (_lm.league !== currentLeague) {
                currentLeague = _lm.league
                msg += `\n🏆 *${currentLeague}*\n`
            }
            let score = (_lm.homeScore !== undefined && _lm.awayScore !== undefined) ? `${_lm.homeScore} - ${_lm.awayScore}` : `vs`
            msg += `  ⚽ ${_lm.homeTeam} *${score}* ${_lm.awayTeam}`
            if (_lm.status && _lm.status !== 'Unknown') msg += ` _( ${_lm.status})_`
            msg += '\n'
        }
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch live scores. Try again later.') }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔮  FOOTBALL PREDICTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'predictions':
case 'footballpredictions':
case 'betpredictions':
case 'tips': {
    await X.sendMessage(m.chat, { react: { text: '🔮', key: m.key } })
    try {
        await reply('🔮 _Fetching today\'s football predictions..._')
        let preds = await _getPredictions()
        if (!preds?.length) return reply('🔮 No predictions available right now. Try again later.')
        let msg = `╔═════════╗\n║  🔮 *FOOTBALL PREDICTIONS* (${preds.length})\n╚═════════╝\n`
        for (let p of preds) {
            msg += `\n🏆 *${p.league || 'Unknown League'}*\n`
            msg += `  ⚽ ${p.match}\n`
            if (p.time) msg += `  ⏰ ${p.time}\n`
            if (p.predictions?.fulltime) {
                let ft = p.predictions.fulltime
                msg += `  📊 Home: ${ft.home?.toFixed(0)}% | Draw: ${ft.draw?.toFixed(0)}% | Away: ${ft.away?.toFixed(0)}%\n`
            }
            if (p.predictions?.over_2_5) {
                msg += `  🥅 Over 2.5: ${p.predictions.over_2_5.yes?.toFixed(0)}%\n`
            }
            if (p.predictions?.bothTeamToScore) {
                msg += `  🎯 BTTS: ${p.predictions.bothTeamToScore.yes?.toFixed(0)}%\n`
            }
        }
        msg += `\n\n⚠️ _Predictions are for entertainment only. Bet responsibly._`
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch predictions. Try again later.') }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📰  FOOTBALL NEWS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'footnews':
case 'footballnews':
case 'sportnews': {
    await X.sendMessage(m.chat, { react: { text: '📰', key: m.key } })
    try {
        await reply('📰 _Fetching latest football news..._')
        let articles = await _getFootballNews()
        if (!articles?.length) return reply('📰 No football news available right now. Try again later.')
        let msg = `╔═════════╗\n║  📰 *FOOTBALL NEWS*\n╚═════════╝\n`
        for (let a of articles) {
            msg += `\n📌 *${a.title}*\n`
            if (a.summary) msg += `  _${a.summary}_\n`
            if (a.link || a.url) msg += `  🔗 ${a.link || a.url}\n`
        }
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch football news. Try again later.') }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🏆  EPL STANDINGS, SCORERS, UPCOMING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'epl':
case 'eplstandings':
case 'premierleague': {
    await X.sendMessage(m.chat, { react: { text: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', key: m.key } })
    try {
        await reply('🏆 _Fetching EPL standings..._')
        let teams = await _getStandings('epl', 'epl')
        if (!teams?.length) throw new Error('No data from any source')
        let msg = `╔═════════╗\n║  🏆 *EPL STANDINGS ${new Date().getFullYear()}*\n╚═════════╝\n\n`
        msg += `${'#'.padEnd(3)} ${'Team'.padEnd(22)} ${'P'.padEnd(3)} ${'W'.padEnd(3)} ${'D'.padEnd(3)} ${'L'.padEnd(3)} ${'GD'.padEnd(5)} Pts\n`
        msg += `${'─'.repeat(50)}\n`
        for (let t of teams) {
            let pos = String(t.position).padEnd(3)
            let team = (t.team || '').substring(0, 20).padEnd(22)
            let p = String(t.played || 0).padEnd(3)
            let w = String(t.won || 0).padEnd(3)
            let dr = String(t.draw || 0).padEnd(3)
            let l = String(t.lost || 0).padEnd(3)
            let gd = String(t.goalDifference || 0).padEnd(5)
            let pts = String(t.points || 0)
            msg += `${pos}${team}${p}${w}${dr}${l}${gd}${pts}\n`
        }
        await reply('```\n' + msg + '```')
    } catch(e) { reply('❌ Could not fetch EPL standings. Try again later.') }
} break

case 'eplscorers':
case 'epltopscorers': {
    await X.sendMessage(m.chat, { react: { text: '⚽', key: m.key } })
    try {
        await reply('⚽ _Fetching EPL top scorers..._')
        let scorers = await _getScorers('epl', 'epl')
        if (!scorers?.length) throw new Error('No data from any source')
        let msg = `╔═════════╗\n║  ⚽ *EPL TOP SCORERS*\n╚═════════╝\n\n`
        for (let s of scorers) {
            let rank = s.rank || s.position || ''
            msg += `${rank}. *${s.player || s.name}* (${s.team || s.club || ''})\n`
            msg += `   🥅 Goals: *${s.goals}*`
            if (s.assists) msg += `  🎯 Assists: ${s.assists}`
            if (s.played) msg += `  📅 Played: ${s.played}`
            msg += '\n'
        }
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch EPL top scorers. Try again later.') }
} break

case 'eplmatches':
case 'eplfixtures':
case 'eplupcoming': {
    await X.sendMessage(m.chat, { react: { text: '📅', key: m.key } })
    try {
        await reply('📅 _Fetching upcoming EPL matches..._')
        let matches = await _getFixtures('epl', `https://api.giftedtech.co.ke/api/football/epl/upcoming?apikey=${_giftedKey()}`)
        if (!matches?.length) throw new Error('No data from any source')
        let msg = `╔═════════╗\n║  📅 *EPL UPCOMING FIXTURES*\n╚═════════╝\n`
        for (let _fm of matches) {
            msg += `\n📆 *${_fm.date || ''}* ${_fm.time ? '⏰ ' + _fm.time : ''}\n`
            msg += `  ⚽ *${_fm.homeTeam}* vs *${_fm.awayTeam}*\n`
            if (_fm.venue || _fm.stadium) msg += `  🏟️ ${_fm.venue || _fm.stadium}\n`
        }
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch EPL fixtures. Try again later.') }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🇪🇸  LA LIGA STANDINGS, SCORERS, MATCHES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'laliga':
case 'laligastandings': {
    await X.sendMessage(m.chat, { react: { text: '🇪🇸', key: m.key } })
    try {
        await reply('🏆 _Fetching La Liga standings..._')
        let teams = await _getStandings('laliga', 'laliga')
        if (!teams?.length) throw new Error('No data from any source')
        let msg = `╔═════════╗\n║  🏆 *LA LIGA STANDINGS ${new Date().getFullYear()}*\n╚═════════╝\n\n`
        msg += `${'#'.padEnd(3)} ${'Team'.padEnd(22)} ${'P'.padEnd(3)} ${'W'.padEnd(3)} ${'D'.padEnd(3)} ${'L'.padEnd(3)} ${'GD'.padEnd(5)} Pts\n`
        msg += `${'─'.repeat(50)}\n`
        for (let t of teams) {
            let pos = String(t.position).padEnd(3)
            let team = (t.team || '').substring(0, 20).padEnd(22)
            let p = String(t.played || 0).padEnd(3)
            let w = String(t.won || 0).padEnd(3)
            let dr = String(t.draw || 0).padEnd(3)
            let l = String(t.lost || 0).padEnd(3)
            let gd = String(t.goalDifference || 0).padEnd(5)
            let pts = String(t.points || 0)
            msg += `${pos}${team}${p}${w}${dr}${l}${gd}${pts}\n`
        }
        await reply('```\n' + msg + '```')
    } catch(e) { reply('❌ Could not fetch La Liga standings. Try again later.') }
} break

case 'laligascorers':
case 'laligatopscorers': {
    await X.sendMessage(m.chat, { react: { text: '⚽', key: m.key } })
    try {
        await reply('⚽ _Fetching La Liga top scorers..._')
        let scorers = await _getScorers('laliga', 'laliga')
        if (!scorers?.length) throw new Error('No data from any source')
        let msg = `╔═════════╗\n║  ⚽ *LA LIGA TOP SCORERS*\n╚═════════╝\n\n`
        for (let s of scorers) {
            let rank = s.rank || s.position || ''
            msg += `${rank}. *${s.player || s.name}* (${s.team || s.club || ''})\n`
            msg += `   🥅 Goals: *${s.goals}*`
            if (s.assists) msg += `  🎯 Assists: ${s.assists}`
            if (s.played) msg += `  📅 Played: ${s.played}`
            msg += '\n'
        }
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch La Liga top scorers. Try again later.') }
} break

case 'laligamatches':
case 'laligafixtures':
case 'laligaupcoming': {
    await X.sendMessage(m.chat, { react: { text: '📅', key: m.key } })
    try {
        await reply('📅 _Fetching La Liga matches..._')
        let matches = await _getFixtures('laliga', `https://api.giftedtech.co.ke/api/football/laliga/upcoming?apikey=${_giftedKey()}`)
        if (!matches?.length) throw new Error('No data from any source')
        let msg = `╔═════════╗\n║  📅 *LA LIGA FIXTURES*\n╚═════════╝\n`
        for (let _fm of matches) {
            msg += `\n📆 *${_fm.date || ''}* ${_fm.time ? '⏰ ' + _fm.time : ''}\n`
            msg += `  ⚽ *${_fm.homeTeam}* vs *${_fm.awayTeam}*\n`
            if (_fm.venue || _fm.stadium) msg += `  🏟️ ${_fm.venue || _fm.stadium}\n`
            if (_fm.status && _fm.status !== 'Unknown') msg += `  ℹ️ Status: ${_fm.status}\n`
        }
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch La Liga fixtures. Try again later.') }
} break

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🏆  UCL STANDINGS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  case 'ucl':
  case 'uclstandings':
  case 'championsleague': {
      await X.sendMessage(m.chat, { react: { text: '🏆', key: m.key } })
      try {
        await reply('🏆 _Fetching UCL standings..._')
        let teams = await _getStandings('ucl', 'ucl')
        if (!teams?.length) throw new Error('No data from any source')
          let msg = `╔═════════╗\n║  🏆 *UCL STANDINGS ${new Date().getFullYear()}*\n╚═════════╝\n\n`
          msg += `${'#'.padEnd(3)} ${'Team'.padEnd(22)} ${'P'.padEnd(3)} ${'W'.padEnd(3)} ${'D'.padEnd(3)} ${'L'.padEnd(3)} ${'GD'.padEnd(5)} Pts\n`
          msg += `${'─'.repeat(50)}\n`
          for (let t of teams) {
              let pos = String(t.position).padEnd(3)
              let team = (t.team || '').substring(0, 20).padEnd(22)
              let p = String(t.played || 0).padEnd(3)
              let w = String(t.won || 0).padEnd(3)
              let dr = String(t.draw || 0).padEnd(3)
              let l = String(t.lost || 0).padEnd(3)
              let gd = String(t.goalDifference || 0).padEnd(5)
              let pts = String(t.points || 0)
              msg += `${pos}${team}${p}${w}${dr}${l}${gd}${pts}\n`
          }
          await reply('```\n' + msg + '```')
      } catch(e) { reply('❌ Could not fetch UCL standings. Try again later.') }
  } break

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🇩🇪  BUNDESLIGA STANDINGS & SCORERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  case 'bundesliga':
  case 'bundesligastandings': {
      await X.sendMessage(m.chat, { react: { text: '🇩🇪', key: m.key } })
      try {
        await reply('🏆 _Fetching Bundesliga standings..._')
        let teams = await _getStandings('bundesliga', 'bundesliga')
        if (!teams?.length) throw new Error('No data from any source')
          let msg = `╔═════════╗\n║  🏆 *BUNDESLIGA STANDINGS ${new Date().getFullYear()}*\n╚═════════╝\n\n`
          msg += `${'#'.padEnd(3)} ${'Team'.padEnd(22)} ${'P'.padEnd(3)} ${'W'.padEnd(3)} ${'D'.padEnd(3)} ${'L'.padEnd(3)} ${'GD'.padEnd(5)} Pts\n`
          msg += `${'─'.repeat(50)}\n`
          for (let t of teams) {
              let pos = String(t.position).padEnd(3)
              let team = (t.team || '').substring(0, 20).padEnd(22)
              let p = String(t.played || 0).padEnd(3)
              let w = String(t.won || 0).padEnd(3)
              let dr = String(t.draw || 0).padEnd(3)
              let l = String(t.lost || 0).padEnd(3)
              let gd = String(t.goalDifference || 0).padEnd(5)
              let pts = String(t.points || 0)
              msg += `${pos}${team}${p}${w}${dr}${l}${gd}${pts}\n`
          }
          await reply('```\n' + msg + '```')
      } catch(e) { reply('❌ Could not fetch Bundesliga standings. Try again later.') }
  } break

  case 'bundesligascorers':
  case 'bundesligatopscorers': {
      await X.sendMessage(m.chat, { react: { text: '⚽', key: m.key } })
      try {
        await reply('⚽ _Fetching Bundesliga top scorers..._')
        let scorers = await _getScorers('bundesliga', 'bundesliga')
        if (!scorers?.length) throw new Error('No data from any source')
          let msg = `╔═════════╗\n║  ⚽ *BUNDESLIGA TOP SCORERS*\n╚═════════╝\n\n`
          for (let s of scorers) {
              let rank = s.rank || s.position || ''
              msg += `${rank}. *${s.player || s.name}* (${s.team || s.club || ''})\n`
              msg += `   🥅 Goals: *${s.goals}*`
              if (s.assists) msg += `  🎯 Assists: ${s.assists}`
              if (s.penalties && s.penalties !== 'N/A') msg += `  🎯 Pens: ${s.penalties}`
              if (s.played) msg += `  📅 Played: ${s.played}`
              msg += '\n'
          }
          await reply(msg)
      } catch(e) { reply('❌ Could not fetch Bundesliga top scorers. Try again later.') }
  } break

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🇮🇹  SERIE A STANDINGS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  case 'seriea':
  case 'serieastandings': {
      await X.sendMessage(m.chat, { react: { text: '🇮🇹', key: m.key } })
      try {
        await reply('🏆 _Fetching Serie A standings..._')
        let teams = await _getStandings('seriea', 'seriea')
        if (!teams?.length) throw new Error('No data from any source')
          let msg = `╔═════════╗\n║  🏆 *SERIE A STANDINGS ${new Date().getFullYear()}*\n╚═════════╝\n\n`
          msg += `${'#'.padEnd(3)} ${'Team'.padEnd(22)} ${'P'.padEnd(3)} ${'W'.padEnd(3)} ${'D'.padEnd(3)} ${'L'.padEnd(3)} ${'GD'.padEnd(5)} Pts\n`
          msg += `${'─'.repeat(50)}\n`
          for (let t of teams) {
              let pos = String(t.position).padEnd(3)
              let team = (t.team || '').substring(0, 20).padEnd(22)
              let p = String(t.played || 0).padEnd(3)
              let w = String(t.won || 0).padEnd(3)
              let dr = String(t.draw || 0).padEnd(3)
              let l = String(t.lost || 0).padEnd(3)
              let gd = String(t.goalDifference || 0).padEnd(5)
              let pts = String(t.points || 0)
              msg += `${pos}${team}${p}${w}${dr}${l}${gd}${pts}\n`
          }
          await reply('```\n' + msg + '```')
      } catch(e) { reply('❌ Could not fetch Serie A standings. Try again later.') }
  } break

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🇮🇹  SERIE A TOP SCORERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  case 'serieascorers':
  case 'serieaTopscorers': {
      await X.sendMessage(m.chat, { react: { text: '⚽', key: m.key } })
      try {
        await reply('⚽ _Fetching Serie A top scorers..._')
        let scorers = await _getScorers('seriea', 'seriea')
        if (!scorers?.length) throw new Error('No data from any source')
          let msg = `╔═════════╗\n║  ⚽ *SERIE A TOP SCORERS*\n╚═════════╝\n\n`
          for (let s of scorers) {
              msg += `${s.rank}. *${s.player}* (${s.team})\n`
              msg += `   🥅 Goals: *${s.goals}*`
              if (s.assists) msg += `  🎯 Assists: ${s.assists}`
              if (s.penalties && s.penalties !== 'N/A') msg += `  🎽 Pens: ${s.penalties}`
              msg += '\n'
          }
          await reply(msg)
      } catch(e) { reply('❌ Could not fetch Serie A top scorers. Try again later.') }
  } break
  

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🏅  SPORTS — LIVE, ALL, CATEGORIES, STREAM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'sportscategories':
case 'sportcategories':
case 'sportcat': {
    await X.sendMessage(m.chat, { react: { text: '🏅', key: m.key } })
    try {
        let r = await fetch(`https://api.giftedtech.co.ke/api/sports/categories?apikey=${_giftedKey()}`, { signal: AbortSignal.timeout(15000) })
        let d = await r.json()
        if (!d.success || !d.result) throw new Error('No data')
        let cats = Array.isArray(d.result) ? d.result : []
        let msg = `╔═════════╗\n║  🏅 *SPORTS CATEGORIES*\n╚═════════╝\n\n`
        for (let c of cats) {
            let icon = { football: '⚽', basketball: '🏀', tennis: '🎾', cricket: '🏏', baseball: '⚾', hockey: '🏒', rugby: '🏉', volleyball: '🏐', 'motor-sports': '🏎️', boxing: '🥊', mma: '🥋' }[c.category] || '🏅'
            msg += `  ${icon} *${c.category}* — ${c.matchCount} matches\n`
        }
        msg += `\n_Use ${prefix}livesports [category] to see live events_\n_Use ${prefix}allsports [category] to see all events_`
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch sports categories. Try again later.') }
} break

case 'livesports':
case 'sportslive': {
    await X.sendMessage(m.chat, { react: { text: '🏅', key: m.key } })
    let _sportCat = text?.toLowerCase().trim() || 'football'
    try {
        await reply(`🏅 _Fetching live ${_sportCat} events..._`)
        let r = await fetch(`https://api.giftedtech.co.ke/api/sports/live?apikey=${_giftedKey()}&category=${encodeURIComponent(_sportCat)}`, { signal: AbortSignal.timeout(20000) })
        let d = await r.json()
        if (!d.success || !d.result) throw new Error('No data')
        let matches = d.result.matches || []
        if (!matches.length) return reply(`🏅 No live *${_sportCat}* events at the moment.\n\nTry: ${prefix}sportscategories to see all categories`)
        let msg = `╔═════════╗\n║  🔴 *LIVE ${_sportCat.toUpperCase()}* (${matches.length})\n╚═════════╝\n`
        for (let ev of matches) {
            msg += `\n🔴 *${ev.homeTeam || ev.team1 || ''} vs ${ev.awayTeam || ev.team2 || ''}*\n`
            if (ev.league || ev.competition) msg += `   🏆 ${ev.league || ev.competition}\n`
            if (ev.time || ev.status) msg += `   ⏱️ ${ev.time || ev.status}\n`
            if (ev.id) msg += `   🆔 \`${ev.id}\`\n`
        }
        await reply(msg)
    } catch(e) { reply(`❌ Could not fetch live ${_sportCat} events. Try: ${prefix}sportscategories`) }
} break

case 'allsports':
case 'sportsall': {
    await X.sendMessage(m.chat, { react: { text: '🏅', key: m.key } })
    let _sportCat2 = text?.toLowerCase().trim() || 'football'
    try {
        await reply(`🏅 _Fetching all ${_sportCat2} events..._`)
        let r = await fetch(`https://api.giftedtech.co.ke/api/sports/all?apikey=${_giftedKey()}&category=${encodeURIComponent(_sportCat2)}`, { signal: AbortSignal.timeout(20000) })
        let d = await r.json()
        if (!d.success || !d.result) throw new Error('No data')
        let matches = d.result.matches || d.result
        if (!Array.isArray(matches) || !matches.length) return reply(`🏅 No *${_sportCat2}* events found.\n\nTry: ${prefix}sportscategories to see all categories`)
        let msg = `╔═════════╗\n║  🏅 *ALL ${_sportCat2.toUpperCase()} EVENTS*\n╚═════════╝\n\n_Total: ${matches.length} events_\n`
        for (let ev of matches) {
            msg += `\n⚽ *${ev.homeTeam || ev.team1 || ''} vs ${ev.awayTeam || ev.team2 || ''}*\n`
            if (ev.league || ev.competition) msg += `   🏆 ${ev.league || ev.competition}\n`
            if (ev.date || ev.time) msg += `   📅 ${ev.date || ''} ${ev.time || ''}\n`
            if (ev.id) msg += `   🆔 \`${ev.id}\`\n`
        }
        await reply(msg)
    } catch(e) { reply(`❌ Could not fetch ${_sportCat2} events. Try: ${prefix}sportscategories`) }
} break

case 'watchsport':
case 'streamsport':
case 'sportsstream': {
    await X.sendMessage(m.chat, { react: { text: '📺', key: m.key } })
    if (!text) return reply(`📺 *Stream a Sport Event*\n\nUsage: *${prefix}watchsport [event-id]*\n\nFirst use *${prefix}allsports [category]* to get event IDs\n\nExample:\n${prefix}allsports football\n${prefix}watchsport motor-lublin-vs-korona-kielce-football-1380587`)
    try {
        await reply('📺 _Fetching stream link..._')
        let r = await fetch(`https://api.giftedtech.co.ke/api/sports/stream?apikey=${_giftedKey()}&source=echo&id=${encodeURIComponent(text.trim())}`, { signal: AbortSignal.timeout(25000) })
        let d = await r.json()
        if (!d.success || !d.result) throw new Error('No stream found')
        let streamData = d.result
        let streamUrl = typeof streamData === 'string' ? streamData : (streamData.url || streamData.stream_url || streamData.link || JSON.stringify(streamData))
        let msg = `╔═════════╗\n║  📺 *SPORT STREAM LINK*\n╚═════════╝\n\n`
        msg += `🆔 *Event ID:* ${text.trim()}\n`
        msg += `🔗 *Stream URL:*\n${streamUrl}\n\n`
        msg += `_Note: Open the link in a browser to watch the stream._`
        await reply(msg)
    } catch(e) { reply(`❌ Could not find stream for event *${text}*.\n\nMake sure you are using the correct event ID from ${prefix}allsports`) }
} break


//━━━━━━━━━━━━━━━━━━━━━━━━//
default:
if (budy.startsWith('=>')) {
if (!isOwner) return
function Return(sul) {
sat = JSON.stringify(sul, null, 2)
bang = util.format(sat)
if (sat == undefined) {
bang = util.format(sul)
}
return reply(bang)
}
try {
reply(util.format(eval(`(async () => { return ${budy.slice(3)} })()`)))
} catch (e) {
reply(String(e))
}
}

if (budy.startsWith('>')) {
if (!isOwner) return
let kode = budy.trim().split(/ +/)[0]
let teks
try {
teks = await eval(`(async () => { ${kode == ">>" ? "return" : ""} ${q}})()`)
} catch (e) {
teks = e
} finally {
await reply(require('util').format(teks))
}
}

if (budy.startsWith('$')) {
if (!isOwner) return
exec(budy.slice(1), (err, stdout) => {
if (err) return reply(`${err}`)
if (stdout) return reply(stdout)
})
}

// ── ChatBoAI per-chat auto-reply (.chatboai on/off) ─────────────────
if (global.chatBoAIChats && global.chatBoAIChats[m.chat] && budy && !isCmd && !m.key.fromMe) {
    try {
        await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
        const _cbaAutoReply = await _runChatBoAI(budy, true)
        reply(`${_cbaAutoReply}`)
    } catch (e) {
        console.log('[ChatBoAI-Auto] Error:', e.message || e)
    }
}

// ── ChatBot global auto-reply (.chatbot on/off) — uses _runChatBoAI ──
if (global.chatBot && budy && !budy.startsWith('>') && !budy.startsWith('=>') && !budy.startsWith('$') && !isCmd && !m.key.fromMe && !(global.chatBoAIChats && global.chatBoAIChats[m.chat])) {
    try {
        const _cbReply = await _runChatBoAI(budy, true)
        if (_cbReply?.trim()) {
            reply(_cbReply.trim())
        } else {
            reply('❌ AI is unavailable right now. Try again in a moment.')
        }
    } catch (chatErr) {
        console.log('[ChatBot] Error:', chatErr.message || chatErr)
    }
}

// ── AI ChatBot — Separate DM / Group / Global Modes (.setaimode) ────────
// Skip if already handled by chatBoAIChats or chatBot, or if it's a command
if (!isCmd && budy && !m.key.fromMe && !(global.chatBoAIChats && global.chatBoAIChats[m.chat]) && !global.chatBot) {
    let _aiShouldReply = false

    // 1. Global mode — reply everywhere
    if (global.aiBotGlobal) {
        _aiShouldReply = true
    }

    // 2. DM mode — reply in private chats
    if (!_aiShouldReply && global.aiBotDM && !m.isGroup) {
        // If specific DM whitelist is set, only reply to those numbers
        const _dmKeys = Object.keys(global.aiBotDMChats || {})
        if (_dmKeys.length > 0) {
            _aiShouldReply = !!global.aiBotDMChats[from]
        } else {
            // No whitelist = reply to ALL DMs
            _aiShouldReply = true
        }
    }

    // 3. Group mode — reply in whitelisted groups
    if (!_aiShouldReply && global.aiBotGroup && m.isGroup) {
        _aiShouldReply = !!(global.aiBotGroupChats && global.aiBotGroupChats[from])
    }

    if (_aiShouldReply) {
        try {
            const _modeLabel = global.aiBotGlobal ? '🌐' : m.isGroup ? '👥' : '📨'
            await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
            const _modeReply = await _runChatBoAI(budy, true)
            if (_modeReply?.trim()) reply(_modeReply.trim())
        } catch (_modeErr) {
            console.log('[AI-Mode] Error:', _modeErr.message || _modeErr)
        }
    }
}
}

} catch (err) {
  let errMsg = (err.message || '').toLowerCase()
  let errStack = err.stack || err.message || util.format(err)

  // ── Silently ignore known non-critical WhatsApp protocol errors ──────────
  const silentErrors = [
    'no sessions',           // Signal protocol — no encryption session yet
    'sessionerror',          // Signal session missing for this JID
    'bad mac',               // Decryption mismatch — WhatsApp will retry
    'failed to decrypt',     // E2E decryption failure — not our bug
    'rate-overlimit',        // WA rate limit — will recover on its own
    'connection closed',     // Temporary network drop
    'connection lost',       // Network drop
    'timed out',             // Request timeout — not fatal
    'timedout',
    'socket hang up',        // TCP socket issue
    'econnreset',            // Connection reset by WA servers
    'enotfound',             // DNS / network
    'not-authorized',        // WA auth on specific request — not fatal
    'item-not-found',        // WA node not found — e.g. deleted message
    'invalid protocol',      // WA protocol mismatch — temporary
    'stream errored',        // WA stream error — will auto-reconnect
    'aborted',               // Request aborted
  ]
  const isSilent = silentErrors.some(e => errMsg.includes(e))

  if (isSilent) {
    // Known protocol noise — do NOT print full stack trace or notify owner
    console.log(`[SILENT ERROR] ${err.message || 'Unknown'} — suppressed`)
    return
  }

  console.log('====== ERROR REPORT ======')
  console.log(errStack)
  console.log('==========================')


  // Only report real unexpected errors to owner
  try {
    let shortStack = errStack.length > 1500 ? errStack.slice(0, 1500) + '\n...(truncated)' : errStack
    await X.sendMessage(`${global.owner[0]}@s.whatsapp.net`, {
      text: `⚠️ *ERROR REPORT*\n\n📌 *Message:* ${err.message || '-'}\n📂 *Stack:*\n${shortStack}`,
      contextInfo: { forwardingScore: 9999999, isForwarded: true }
    }, { quoted: m })
  } catch (reportErr) {
    console.log('[Error Reporter] Failed to send error to owner:', reportErr.message || reportErr)
  }
}
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
// File Update
let file = require.resolve(__filename)
fs.watchFile(file, () => {
fs.unwatchFile(file)
console.log(`Update File : ${__filename}`)
delete require.cache[file]
require(file)
})
