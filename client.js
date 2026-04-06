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
  // Configurable API base — set GIFTED_API_URL in .env to override without code changes
  const _GTAPI = (process.env.GIFTED_API_URL || 'https://api.giftedtech.co.ke').replace(/\/$/, '')

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

  //══════════════════════════════════════════════════════════════════════════//
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
  // ── Keith API (apiskeith.top) — free, no key, primary sports source ─────────
  const _KEITH_BASE = 'https://apiskeith.top'
  const _KEITH_LEAGUES = { epl: 'epl', laliga: 'laliga', ucl: 'ucl', bundesliga: 'bundesliga', seriea: 'seriea', ligue1: 'ligue1', euros: 'euros', fifa: 'fifa' }
  async function _keithFetch(path) {
      try {
          const r = await fetch(`${_KEITH_BASE}${path}`, { signal: AbortSignal.timeout(15000) })
          const d = await r.json()
          if (d?.status) return d.result
      } catch {}
      return null
  }

  async function _getStandings(league, gtPath) {
      // Keith first — free, no key, most up-to-date data
      const _kl = _KEITH_LEAGUES[league]
      if (_kl) { try { const _kd = await _keithFetch(`/${_kl}/standings`); const _kt = _kd?.standings || _kd; if (Array.isArray(_kt) && _kt.length) return _kt } catch {} }
      // GiftedTech fallback
      try {
          const d = await giftedFetch(`${_GTAPI}/api/football/${gtPath}/standings?apikey=gifted`, { signal: AbortSignal.timeout(20000) })
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

  // ── Football-Data.org scorers ────────────────────────────────────────────
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
  // ── Master scorers: Keith → GiftedTech → ESPN → Football-Data ─────────────
  async function _getScorers(league, gtPath, label) {
      const _kl = _KEITH_LEAGUES[league]
      if (_kl) { try { const _kd = await _keithFetch(`/${_kl}/scorers`); const _ks = _kd?.topScorers || _kd?.scorers || _kd; if (Array.isArray(_ks) && _ks.length) return _ks } catch {} }
      try {
          const d = await giftedFetch(`${_GTAPI}/api/football/${gtPath}/scorers?apikey=gifted`, { signal: AbortSignal.timeout(20000) })
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
          return d.matches.map(m => ({ homeTeam: m.homeTeam?.name||'', awayTeam: m.awayTeam?.name||'', date: m.utcDate?.slice(0,10)||'', time: m.utcDate?.slice(11,16)||'' }))
      } catch { return null }
  }

  // ── Master fixtures: GiftedTech → ESPN → TheSportsDB → Football-Data ─────
  // ── Master fixtures: Keith → GiftedTech → ESPN → TheSportsDB → Football-Data
  async function _getFixtures(league, gtUrl) {
      const _kl = _KEITH_LEAGUES[league]
      if (_kl) { try { const _kd = await _keithFetch(`/${_kl}/upcomingmatches`); const _km = _kd?.upcomingMatches || _kd?.matches || _kd; if (Array.isArray(_km) && _km.length) return _km.map(x => ({ homeTeam: x.homeTeam||x.home_team||'', awayTeam: x.awayTeam||x.away_team||'', date: x.date||'', time: x.time||'', status: x.status||'' })) } catch {} }
      try {
          const d = await giftedFetch(gtUrl, { signal: AbortSignal.timeout(20000) })
          const m = d?.result?.upcomingMatches || d?.result?.matches || d?.result; if (Array.isArray(m) && m.length) return m
      } catch {}
      return (await _espnFixtures(league)) || (await _tsdbFixtures(league)) || (await _fdFixtures(league))
  }
  // ── Multi-source live scores ──────────────────────────────────────────────
  async function _getLiveScores() {
      // Source 1: Keith API (apiskeith.top)
      try {
          const _kld = await _keithFetch('/livescore')
          if (_kld?.games) {
              const _klm = Object.values(_kld.games).map(g => ({ homeTeam: g.p1||'', awayTeam: g.p2||'', homeScore: g.R?.r1||'0', awayScore: g.R?.r2||'0', status: g.R?.st||'LIVE', date: g.dt||'', time: g.tm||'' }))
              if (_klm.length) return { source: 'Keith', matches: _klm }
          }
      } catch {}
      // Source 2: GiftedTech
      try {
          const d = await giftedFetch(`${_GTAPI}/api/football/livescore?apikey=gifted`, { signal: AbortSignal.timeout(20000) })
          const m = d?.result?.matches || d?.result; if (Array.isArray(m) && m.length) return { source: 'GiftedTech', matches: m }
      } catch {}
      // Source 3: ESPN across top leagues (live events)
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
      // Source 4: TheSportsDB live events
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
      // Source 1: Keith API (apiskeith.top)
      try {
          const _knd = await _keithFetch('/football/news')
          const _kni = _knd?.data?.items || _knd?.items
          if (Array.isArray(_kni) && _kni.length) return _kni.map(x => ({ title: x.title||'', summary: x.summary||'' }))
      } catch {}
      // Source 2: GiftedTech
      try {
          const d = await giftedFetch(`${_GTAPI}/api/football/news?apikey=gifted`, { signal: AbortSignal.timeout(20000) })
          const a = d?.result?.items || d?.result; if (Array.isArray(a) && a.length) return a
      } catch {}
      // Source 3: ESPN soccer RSS
      try {
          const r = await fetch(`https://www.espn.com/espn/rss/soccer/news`, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } })
          const xml = await r.text()
          const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
              const title = m[1].match(/<title><![CDATA[(.*?)]]>/)?.[1] || m[1].match(/<title>(.*?)<\/title>/)?.[1] || ''
              const link  = m[1].match(/<link>(.*?)<\/link>/)?.[1] || ''
              const desc  = m[1].match(/<description><![CDATA[(.*?)]]>/)?.[1]?.replace(/<[^>]+>/g,'')?.slice(0,120) || ''
              return { title, summary: desc, link }
          }).filter(a => a.title)
          if (items.length) return items
      } catch {}
      // Source 4: BBC Sport football RSS
      try {
          const r = await fetch(`https://feeds.bbci.co.uk/sport/football/rss.xml`, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } })
          const xml = await r.text()
          const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
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
      // Source 1: Keith API bet tips (apiskeith.top/bet)
      try {
          const _kpd = await _keithFetch('/bet')
          if (Array.isArray(_kpd) && _kpd.length) return _kpd.map(x => ({ league: x.league||'', match: x.match||'', time: x.time||'', result: x.result||'', predictions: x.predictions||{} }))
      } catch {}
      // Source 2: GiftedTech
      try {
          const d = await giftedFetch(`${_GTAPI}/api/football/predictions?apikey=gifted`, { signal: AbortSignal.timeout(20000) })
          const p = Array.isArray(d?.result) ? d.result : (d?.result?.items||[]); if (p.length) return p
      } catch {}
      // Source 3: Footystats upcoming (unofficial, no key for basic access)
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
        const _r = await fetch(`${_GTAPI}/api/ai/gpt4o?apikey=${_giftedKey()}&q=${_fullQ}`, { signal: AbortSignal.timeout(22000) })
        const _d = await _r.json()
        if (_d?.success && _d?.result && String(_d.result).trim().length > 2) return String(_d.result).trim()
    } catch {}

    // 2. GiftedTech Gemini — embed system into q
    try {
        const _r2 = await fetch(`${_GTAPI}/api/ai/gemini?apikey=${_giftedKey()}&q=${_fullQ}`, { signal: AbortSignal.timeout(22000) })
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
// ── Bot-sent message tracker ─────────────────────────────────────────────────
// Wraps X.sendMessage (once per socket) so every outgoing bot reply has its
// message-ID registered in a global Set.  The setfont handler checks this Set
// before editing a fromMe message, ensuring bot replies are NEVER touched.
if (!X._botSentTracked) {
    X._botSentTracked = true
    if (!global._botSentIds) global._botSentIds = new Set()
    const _origSM = X.sendMessage.bind(X)
    X.sendMessage = async (..._smArgs) => {
        // ── Global empty-message guard ──────────────────────────────────────
        // Block any outgoing message where text is '', '   ', undefined, null,
        // or the literal strings 'undefined'/'null' from bad template interpolation.
        // Also strips empty captions from media messages (leaves media intact).
        const _msgPayload = _smArgs[1]
        const _isEmptyVal = (v) => {
            if (v === undefined || v === null) return true
            if (typeof v !== 'string') return false
            const _s = v.trim()
            if (!_s || _s === 'undefined' || _s === 'null') return true
            // Strip zero-width / invisible Unicode chars, then recheck
            const _vis = _s.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u180E\u034F]/g, '').trim()
            return !_vis
        }
        if (_msgPayload) {
            if ('text' in _msgPayload && _isEmptyVal(_msgPayload.text)) {
                console.log('[EmptyGuard] Blocked empty text send to', _smArgs[0])
                return null
            }
            if ('caption' in _msgPayload && _isEmptyVal(_msgPayload.caption)) {
                delete _msgPayload.caption
            }
            if (_msgPayload.react && 'text' in _msgPayload.react && _isEmptyVal(_msgPayload.react.text)) {
                _msgPayload.react.text = ''
            }
            if (_msgPayload.contextInfo?.externalAdReply) {
                const _ear = _msgPayload.contextInfo.externalAdReply
                if (_isEmptyVal(_ear.title)) _ear.title = global.botname || 'TOOSII-XD ULTRA'
                if (_isEmptyVal(_ear.body))  _ear.body  = 'WhatsApp Bot'
            }
        }
        // ───────────────────────────────────────────────────────────────────
        const _sent = await _origSM(..._smArgs)
        if (_sent?.key?.id) {
            global._botSentIds.add(_sent.key.id)
            setTimeout(() => global._botSentIds?.delete(_sent.key.id), 60000)
        }
        return _sent
    }
}
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
if (!mess.OnlyOwner) mess.OnlyOwner = '╔══〔 👑 OWNER ONLY 〕══╗\n\n║ This command is for bot owner only.\n╚═══════════════════════╝'
if (!mess.OnlyGrup)  mess.OnlyGrup  = '╔══〔 👥 GROUP ONLY 〕══╗\n\n║ This command only works in a group.\n╚═══════════════════════╝'
if (!mess.error)     mess.error     = '╔══〔 ❌ ERROR 〕══╗\n\n║ An error occurred. Please try again.\n╚═══════════════════════╝'
const prefixRegex = /^[°zZ#$@*+,.?=''():√%!¢£¥€π¤ΠΦ_&><`™©®Δ^βα~¦|/\\©^]/;
const _bpDefined = global.botPrefix !== undefined && global.botPrefix !== null; const prefix = _bpDefined ? (global.botPrefix || '') : (prefixRegex.test(budy) ? budy.match(prefixRegex)[0] : '.');
const isCmd = _bpDefined ? (global.botPrefix === '' ? true : budy.startsWith(global.botPrefix)) : budy.startsWith(prefix);
const command = isCmd ? budy.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
const args = isCmd
  ? budy.slice(prefix.length).trim().split(/ +/).slice(1)
  : budy.trim().split(/ +/).slice(1)
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

// Sudo users — bypass private/silent mode and use elevated commands
const _sudoDbPath = require('path').join(__dirname, 'database', 'sudoUsers.json')
const _sudoList = (() => { try { return JSON.parse(require('fs').readFileSync(_sudoDbPath, 'utf-8')) } catch { return [] } })()
// SUDO_USERS env var (comma-separated numbers) — persists across deploys/restarts
const _sudoEnv = (process.env.SUDO_USERS || '').split(',').map(s => s.trim()).filter(Boolean).map(s => s.includes('@') ? s : s.replace(/\D/g,'') + '@s.whatsapp.net')
const _sudoMerged = [...new Set([..._sudoList, ..._sudoEnv])]
const isSudo = !isOwner && _sudoMerged.some(s => s.split(':')[0].split('@')[0] === senderClean)

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
                        return reply('╔══〔 ⚠️ MEDIA ERROR 〕══╗\n\n║ Media URL is not available.\n║ The source may be down.\n╚═══════════════════════╝');
                    }
                } else if (val === undefined || val === null) {
                    return reply('╔══〔 ⚠️ MEDIA ERROR 〕══╗\n\n║ Media data is not available.\n║ Please try again later.\n╚═══════════════════════╝');
                }
            }
        }
        await X.sendMessage(jid, mediaObj, sendOpts);
    } catch (err) {
        console.error('Safe media send error:', err.message);
        reply('╔══〔 ❌ SEND FAILED 〕══╗\n\n║ Failed to send media.\n║ ' + (err.message || 'Unknown error').slice(0,100) + '\n╚═══════════════════════╝');
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
    return  // pmBlocker: silently ignore PMs (updateBlockStatus removed — not supported by WhatsApp)
}

if (global.autoReact && m.key && !m.key.fromMe) {
    const _skipReactTypes = ['reactionMessage','protocolMessage','senderKeyDistributionMessage','messageContextInfo']
    const _wouldBlock = !isDeployedNumber && !isSudo && (X.public === false || global.BOT_MODE === 'silent')
    if (!_skipReactTypes.includes(m.mtype) && !_wouldBlock) {
        try { await X.sendMessage(m.chat, { react: { text: global.autoReactEmoji || '👍', key: m.key } }) } catch {}
    }

// ── Auto-react to channel posts (.channelreact on/off) ──────────────────────
if (global.autoChannelReact && m.chat.endsWith('@newsletter')) {
    const _crTarget = global.autoChannelReactJid || ''
    if (!_crTarget || m.chat === _crTarget) {
        const _crBaseEmojis = global.autoChannelReactEmojis || ['❤️','🔥','👍','😍','🎉','💯','🙌','⚡','🫶','😎']
        const _crCount = global.autoChannelReactCount || _crBaseEmojis.length
        const _crSeq = Array.from({length: _crCount}, (_,i) => _crBaseEmojis[i % _crBaseEmojis.length])
        ;(async () => {
            for (const _ce of _crSeq) {
                try { await X.sendMessage(m.chat, { react: { text: _ce, key: m.key } }) } catch {}
                await new Promise(r => setTimeout(r, 700))
            }
        })()
    }
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
    if (global.antiImageGroups?.[m.chat] && m.mtype === 'imageMessage' && isBotAdmins) {
        await X.sendMessage(m.chat, { delete: m.key })
        await X.sendMessage(from, { text: `@${sender.split('@')[0]} images are not allowed in this group!`, mentions: [sender] })
        return
    }
    if (global.antiVideoGroups?.[m.chat] && m.mtype === 'videoMessage' && isBotAdmins) {
        await X.sendMessage(m.chat, { delete: m.key })
        await X.sendMessage(from, { text: `@${sender.split('@')[0]} videos are not allowed in this group!`, mentions: [sender] })
        return
    }
    if (global.antiMentionGroups?.[m.chat] && m.mentionedJid && m.mentionedJid.length > 0 && isBotAdmins) {
        await X.sendMessage(m.chat, { delete: m.key })
        await X.sendMessage(from, { text: `@${sender.split('@')[0]} mentioning members is not allowed in this group!`, mentions: [sender] })
        return
    }
    if (global.antilinkGcGroups?.[m.chat] && budy && /chat\.whatsapp\.com\/[A-Za-z0-9]+/i.test(budy) && isBotAdmins) {
        await X.sendMessage(m.chat, { delete: m.key })
        await X.sendMessage(from, { text: `@${sender.split('@')[0]} group links are not allowed here!`, mentions: [sender] })
        return
    }
    if (global.antiGroupStatusGroups?.[m.chat] && isBotAdmins) {
        const _isViewOnce    = m.mtype === 'viewOnceMessage' || m.mtype === 'viewOnceMessageV2' || m.mtype === 'viewOnceMessageV2Extension'
        const _isFwdStatus   = m.message?.extendedTextMessage?.contextInfo?.isForwarded && m.message?.extendedTextMessage?.contextInfo?.remoteJid === 'status@broadcast'
        const _isGroupStatus = m.mtype === 'groupStatusMessageV2' || !!m.message?.groupStatusMessageV2
        if (_isViewOnce || _isFwdStatus || _isGroupStatus) {
            try { await X.sendMessage(m.chat, { delete: m.key }) } catch {}
            return
        }
    }
}

// ── Anti Status Mention enforcement ──────────────────────────────────────
// Fires when someone posts a WhatsApp status that tags/mentions a group.
// Applies warn (3-strike kick) / delete-notify / instant kick in that group.
if (from === 'status@broadcast' && global.antiStatusMentionGroups && Object.values(global.antiStatusMentionGroups).some(g => g?.enabled) && !m.key.fromMe) {
    try {
        const _asmSender  = sender  // JID of the person who posted the status
        // Collect group JIDs mentioned directly in the status
        const _mentionedGroups = (m.mentionedJid || []).filter(j => j.endsWith('@g.us'))
        // Also detect WhatsApp group invite links in the status text
        const _hasGroupLink = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/.test(budy)

        if (_mentionedGroups.length || _hasGroupLink) {
            let _targetGroups = [..._mentionedGroups]

            // If only a link (no direct JID mention), find groups where sender is a member
            if (!_targetGroups.length && _hasGroupLink) {
                try {
                    const _allGroups = await X.groupFetchAllParticipating()
                    _targetGroups = Object.keys(_allGroups).filter(gId =>
                        (_allGroups[gId].participants || []).some(p =>
                            p.id === _asmSender || p.id?.split(':')[0]+'@s.whatsapp.net' === _asmSender
                        )
                    )
                } catch {}
            }

            for (const _gId of _targetGroups) {
                try {
                    // Only act if this specific group has antistatusmention enabled
                    const _asmGrpCfg = global.antiStatusMentionGroups?.[_gId]
                    if (!_asmGrpCfg?.enabled) continue
                    const _asmAction = (_asmGrpCfg.action || 'warn').toLowerCase()

                    const _gMeta    = await X.groupMetadata(_gId).catch(() => null)
                    if (!_gMeta) continue
                    const _gParts   = _gMeta.participants || []
                    // Bot must be admin in the group to act
                    const _botAdmin = _gParts.some(p => isParticipantBot(p) && (p.admin === 'admin' || p.admin === 'superadmin'))
                    if (!_botAdmin) continue
                    // Sender must be a member of this group
                    const _sNum     = _asmSender.split('@')[0].split(':')[0]
                    const _inGroup  = _gParts.some(p => (p.id || '').split('@')[0].split(':')[0] === _sNum)
                    if (!_inGroup) continue

                    if (_asmAction === 'kick') {
                        await X.groupParticipantsUpdate(_gId, [_asmSender], 'remove')
                        await X.sendMessage(_gId, {
                            text: `🚫 @${_sNum} was removed for tagging this group in their WhatsApp status.`,
                            mentions: [_asmSender]
                        })
                    } else if (_asmAction === 'delete') {
                        // Can't delete a status post, so notify in group and DM the sender
                        await X.sendMessage(_gId, {
                            text: `⚠️ @${_sNum} tagged this group in their WhatsApp status. Warned.`,
                            mentions: [_asmSender]
                        })
                        await X.sendMessage(_asmSender, {
                            text: `⚠️ You tagged a protected group in your status. Please remove it to avoid further action.`
                        }).catch(() => {})
                    } else {
                        // warn mode: 3 strikes then kick — reuse the group warnings.json
                        const _warnPath = require('path').join(__dirname, 'database', 'warnings.json')
                        let _warnDb = {}
                        try { _warnDb = JSON.parse(require('fs').readFileSync(_warnPath, 'utf-8')) } catch { _warnDb = {} }
                        const _gWarns = _warnDb[_gId] || {}
                        const _uWarns = _gWarns[_asmSender] || []
                        _uWarns.push({ reason: 'Tagged group in WhatsApp status', time: new Date().toISOString(), by: 'antistatusmention' })
                        _gWarns[_asmSender] = _uWarns
                        _warnDb[_gId] = _gWarns
                        require('fs').writeFileSync(_warnPath, JSON.stringify(_warnDb, null, 2))
                        const _cnt = _uWarns.length
                        if (_cnt >= 3) {
                            await X.groupParticipantsUpdate(_gId, [_asmSender], 'remove')
                            _gWarns[_asmSender] = []
                            _warnDb[_gId] = _gWarns
                            require('fs').writeFileSync(_warnPath, JSON.stringify(_warnDb, null, 2))
                            await X.sendMessage(_gId, {
                                text: `🚨 @${_sNum} reached 3/3 warnings for tagging this group in their status and was removed.`,
                                mentions: [_asmSender]
                            })
                        } else {
                            await X.sendMessage(_gId, {
                                text: `⚠️ Warning ${_cnt}/3 — @${_sNum}: Do not tag this group in your WhatsApp status.\n_${3 - _cnt} more warning(s) before removal._`,
                                mentions: [_asmSender]
                            })
                        }
                    }
                } catch {} // skip groups where an action fails
            }
        }
    } catch {}
}
// ────────────────────────────────────────────────────────────────────────

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
    return reply(`╔══〔 🎮 GAME OVER 〕══════╗\n║ 😔 You gave up!\n║ ✅ *Correct answer* : ${jawaban}\n╚═══════════════════════╝`);
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
    return reply(`╔══〔 ✅ CORRECT ANSWER! 〕═╗\n\n║ 🎉 Well done! Your answer is right!\n║ Use *${prefix}tebakld* to view leaderboard.\n╚═══════════════════════╝`);
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
                let caption = `╔══〔 🕌 PRAYER TIME 〕═══╗\n\n║ As-salamu alaykum, *${_displayName}* 🙏\n\n║ 🕌 *${sholat}* prayer time\n║ 🕐 *${waktu}*\n║ 🌍 ${_tzInfo.region}\n\n║ _Take your ablution and pray_ 🤲\n╚═══════════════════════╝`
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
            let _devCaption = `╔══〔 ✝️  DEVOTION TIME 〕══╗\n\n║ God bless you, *${_displayName}* 🙏\n\n║ ${_dev.icon} *${_dev.name}*\n║ 🕐 *${timeNow}*\n║ 🌍 ${_tzInfo.region}\n\n║ _${_dev.msg}_\n\n║ _📖 "Call to me and I will answer you" — Jer 33:3_\n╚═══════════════════════╝`
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
reply(`╔══〔 🟢 ONLINE & READY 〕══╗\n\n║ 🤖 *${global.botname || 'TOOSII-XD ULTRA'}*\n║ ⏱️  *Uptime* : ${runtime(process.uptime())}\n╚═══════════════════════╝`)
}       

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Mode Gate
// Private mode: ONLY the deployed bot number can use any command
// Public mode:  All users can use non-owner commands normally
const isDeployedNumber = m.key.fromMe || senderClean === botClean

if (isCmd && X.public === false && !isDeployedNumber && !isSudo && !isOwner) {
      console.log('[PrivateGate] BLOCKED', senderClean, '| isSudo:', isSudo, '| isOwner:', isOwner, '| sudoList:', _sudoMerged)
    return reply('🔒 *Bot is in Private Mode.*\n_Only the owner and sudo users can use commands._\n\n📢 *Join Channel:*\nhttps://whatsapp.com/channel/0029VbCGMJeEquiVSIthcK03')
}
if (isCmd && (global.BOT_MODE === 'silent') && !isDeployedNumber && !isSudo && !isOwner) {
    return reply('🔇 *Bot is in Silent Mode.*\n_Only the owner and sudo users can use commands._')
}
if (isCmd && global.BOT_MODE === 'groups' && !m.chat.endsWith('@g.us') && !isDeployedNumber) {
    return
}
if (isCmd && global.BOT_MODE === 'dms' && m.chat.endsWith('@g.us') && !isDeployedNumber) {
    return
}
if (isCmd && global.BOT_MODE === 'channel' && !m.chat.endsWith('@newsletter') && !isDeployedNumber) {
    return
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Owner Font Mode — auto-converts every message the bot owner sends
// Activated via .setfont [fontname], deactivated via .fontoff
// _botSentIds guard: skip any message the bot itself sent (command replies, fancy output, etc.)
if (m.key.fromMe && global.ownerFontMode && global.ownerFontMode !== 'off' && budy && !isCmd && !(global._botSentIds?.has(m.key.id))) {
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
// Media download with retry — handles WhatsApp CDN socket hang up
// Panel restart helper — works on Heroku, Render, Railway, VPS, pm2, bare server
const _restartBot = () => {
  if (process.env._BOT_CHILD) {
    // Running under the built-in supervisor — just exit; supervisor restarts us in 3s
    setTimeout(() => process.exit(1), 500)
    return
  }
  // Running standalone (no supervisor) — try pm2, then exit with code 1
  const { exec: _rex } = require('child_process')
  _rex('pm2 restart all', (e1) => {
    if (!e1) return
    _rex('pm2 restart 0', (e2) => {
      if (!e2) return
      process.exit(1)
    })
  })
}
const _dlWithRetry = async (quotedMsg, maxTries = 3) => {
  let lastErr
  for (let _t = 0; _t < maxTries; _t++) {
    try {
      const _b = await Promise.race([
        quotedMsg.download(),
        new Promise((_,rej) => setTimeout(() => rej(new Error('Download timeout')), 20000))
      ])
      if (_b && _b.length > 100) return _b
      throw new Error('Empty buffer received')
    } catch (_e) {
      lastErr = _e
      if (_t < maxTries - 1) await new Promise(r => setTimeout(r, 1200 * (_t + 1)))
    }
  }
  throw lastErr
}
switch(command) {
// awas error
//━━━━━━━━━━━━━━━━━━━━━━━━//
// help command
case 'help': {
    await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
const helpText = `╔══〔 📋  QUICK HELP GUIDE 〕══╗

║ .menu : all commands
║ .menu ai : AI & chat
║ .menu tools : utilities
║ .menu owner : bot settings
║ .menu group : group mgmt
║ .menu downloader : downloads
║ .menu search : search
║ .menu sticker : stickers
║ .menu games : games & fun
║ .menu other : effects & fonts
║ .menu football : sports & scores

╠══〔 ⚡  POPULAR COMMANDS 〕══╣
║ .ai : [question]
║ .sticker : reply media
║ .play : [song name]
║ .ig : [instagram url]
║ .tt : [tiktok url]
║ .toimage : sticker to image
║ .save : reply any message

╠════〔 📞  CONTACT 〕════╣
║ wa.me/254748340864
║ Telegram: @toosiitech

║ _Powered by Toosii Tech_
╚═══════════════════════╝`
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
╔══〔 ✨ TEXT EFFECTS 〕═══╗
║ .metallic
║ .ice
║ .snow
║ .neon
║ .fire
║ .glitch
║ .thunder
║ .matrix
║ .hacker
║ .devil
║ .purple
║ .blackpink
║ .sand
║ .arena
║ .1917
║ .light
║ .impressive
║ .leaves
║ all accept [text]

╠══〔 🔤 FONT CONVERTER 〕══╣
║ .fonts : show all styles
║ .allfonts : [text]
║ .bold
║ .italic
║ .bolditalic
║ .mono
║ .serif
║ .serifbold
║ .serifitalic
║ .scriptfont
║ .scriptbold
║ .fraktur
║ .frakturbold
║ .doublestruck
║ .smallcaps
║ .bubble
║ .bubblebold
║ .square
║ .squarebold
║ .wide
║ .upsidedown
║ .strikethrough
║ .underline : all accept [text]
╚═══════════════════════╝`

  let subcmd = args[0] ? args[0].toLowerCase() : '';

  let infoBot = `╔══〔 ⚡ TOOSII-XD ULTRA 〕══╗
║ 👋 Hey *${pushname}*! ${waktuucapan}

║ 🤖 *Bot* : ${botname}
║ 👑 *Owner* : ${ownername}
║ 🔢 *Version* : v${botver}
║ ⚙️  *Mode* : ${typebot}
║ 📋 *Commands* : ${totalfitur()}
║ 📞 *Contact* : wa.me/254748340864
║ ✈️  *Telegram* : t.me/toosiitech
║ 🔑 *Session* : ${global.sessionUrl}

╠══〔 📂  BROWSE BY CATEGORY 〕══╣
║ .menu ai : AI & Chat
║ .menu tools : Utilities
║ .menu owner : Bot Settings
║ .menu group : Group Mgmt
║ .menu downloader : Downloads
║ .menu search : Search
║ .menu sticker : Stickers
║ .menu games : Games & Fun
║ .menu other : Effects & Fonts
║ .menu football : Sports & Scores
║ .menu textmaker : Text Effects

╠══〔 📜  FULL COMMAND LIST 〕══╣
╚═══════════════════════╝`.trim();

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

  // Resolve thumbnail — honour .menuimage setting, persist across restarts
  let _thumbBuf = null
  try {
    const _mt = global.menuThumb
    const _savedThumb = path.join(__dirname, 'media', 'menu_thumb.jpg')
    if (_mt) {
      if (/^https?:\/\//.test(_mt)) {
        _thumbBuf = await getBuffer(_mt).catch(() => null)
      } else if (fs.existsSync(_mt)) {
        _thumbBuf = fs.readFileSync(_mt)
      }
    }
    // Auto-restore saved thumbnail from disk after bot restart
    if (!_thumbBuf && fs.existsSync(_savedThumb)) {
      if (!global.menuThumb) global.menuThumb = _savedThumb
      _thumbBuf = fs.readFileSync(_savedThumb)
    }
    if (!_thumbBuf) _thumbBuf = fs.readFileSync(path.join(__dirname, 'media', 'thumb.png'))
  } catch {}

  // Send menu — image+caption if thumb available, plain text otherwise
  // global.getCtxInfo() adds the native "View Channel" footer button automatically
  if (_thumbBuf) {
    await X.sendMessage(
      m.chat,
      { image: _thumbBuf, caption: fullMenu, contextInfo: global.getCtxInfo([sender]) },
      { quoted: m }
    )
  } else {
    await X.sendMessage(
      m.chat,
      { text: fullMenu, contextInfo: global.getCtxInfo([sender]) },
      { quoted: m }
    )
  };
}
break;

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Lyrics Command — multi-source with fallback chain
case 'lyrics':
case 'lyric':
case 'songlyrics': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
    if (!text) return reply(`╔══〔 🎵 LYRICS SEARCH 〕═══╗
║ *Usage:* ${prefix}lyrics [song] - [artist]
╠══〔 💡 EXAMPLES 〕═══════╣
║ ${prefix}lyrics Lucid Dreams Juice WRLD
║ ${prefix}lyrics Blinding Lights - The Weeknd
║ ${prefix}lyrics HUMBLE Kendrick Lamar
╚═══════════════════════╝`)

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

    // ── Source 0: GiftedTech lyrics API ─────────────────────────────
    try {
        let _gt = await fetch(`${_GTAPI}/api/search/lyrics?apikey=${_giftedKey()}&query=${encodeURIComponent(_lyrQuery)}`, { signal: AbortSignal.timeout(15000) })
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
`╔══〔 🎵 SONG LYRICS 〕═══╗

║ 🎤 *Title* : ${_lyrResult.title}
║ 👤 *Artist* : ${_lyrResult.artist}${_lyrResult.album ?`\n║ 💿 *Album* : ${_lyrResult.album}` : ''}
║ 📡 *Source* : ${_lyrSource}




╚═══════════════════════╝`

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
    await reply(`╔══〔 ⚡ TOOSII-XD ULTRA 〕══╗

║ 🧑‍💻 *Name* : ${global.ownername || 'Toosii Tech'}
║ ✈️  *Telegram* : @toosiitech
║ 🤖 *Bot* : ${global.botname} v${global.botver}
║ 🔑 *Session* : ${global.sessionUrl}

  📞 *Contact Numbers:*
║ +254748340864
║ +254746677793
║ +254788781373


║ _👇 Tap a contact card below to reach the owner_
╚═══════════════════════╝`)
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
  const botInfo = `╔══〔 ⚡ TOOSII-XD ULTRA 〕══╗

║ 📛 *Name* : ${botname}
║ 👑 *Owner* : ${ownername}
║ 🏷️  *Version* : v${botver}
║ 📋 *Commands* : ${totalfitur()}
║ ⏱️  *Uptime* : ${runtime(process.uptime())}
║ 🔒 *Mode* : ${X.public ? 'Public' : 'Private'}
║ 🔤 *Prefix* : ${global.botPrefix || 'Multi-prefix'}
║ 📞 *Contact* : ${global.ownerNumber}
║ ✈️  *Telegram* : @toosiitech
║ 🔑 *Session* : ${global.sessionUrl}


║ _⚡ Powered by Toosii Tech — wa.me/254748340864_
╚═══════════════════════╝`
  reply(botInfo)
}
break
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Take / Steal Sticker
case 'take':
case 'steal': {
    await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
    if (!quoted) return reply(`╔══〔 🎨 TAKE STICKER 〕══╗\n\n║ Reply to a sticker with *${prefix + command}*\n║ Usage: *${prefix + command} [packname|author]*\n║ Example: ${prefix}take MyPack|MyName\n╚═══════════════════════╝`)
    if (mime !== 'image/webp') return reply(`╔══〔 ⚠️ TAKE STICKER 〕══╗\n\n║ Please reply to a *sticker* to use\n║ *${prefix + command}*\n╚═══════════════════════╝`)

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
if (!m.quoted) return reply(`╔══〔 👁️ VIEW ONCE REVEAL 〕╗\n\n║ Usage: *${prefix}vv*\n║ Reply to a view-once image/video.\n╚═══════════════════════╝`)
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
if (!viewOnceContent) return reply('╔══〔 ⚠️ VIEW ONCE 〕══╗\n\n║ Reply to a view-once image or video.\n╚═══════════════════════╝')
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
        reply('╔══〔 ⚠️ VIEW ONCE 〕══╗\n\n║ Unsupported view once media type.\n╚═══════════════════════╝')
    }
} catch (err) {
    console.error('VV Error:', err)
    reply('╔══〔 ❌ VIEW ONCE 〕══╗\n\n║ Failed to open view once message.\n║ ' + (err.message || 'Unknown error').slice(0,100) + '\n╚═══════════════════════╝')
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
    reply('╔══〔 🎙️ FAKE RECORDING 〕══╗\n\n║ ❌ *Status* : OFF\n╚═══════════════════════╝')
} else {
    global.fakePresence = 'recording'
    reply('╔══〔 🎙️ FAKE RECORDING 〕══╗\n\n║ ✅ *Status* : ON\n║ Bot now appears as recording.\n╚═══════════════════════╝')
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
    reply('╔══〔 ⌨️ FAKE TYPING 〕════╗\n\n║ ❌ *Status* : OFF\n╚═══════════════════════╝')
} else {
    global.fakePresence = 'typing'
    reply('╔══〔 ⌨️ FAKE TYPING 〕════╗\n\n║ ✅ *Status* : ON\n║ Bot now appears as typing.\n╚═══════════════════════╝')
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
reply(`╔══〔 👻 PRESENCE STATUS 〕══╗\n\n║ 📊 *Mode* : *${current}*\n\n║ ${prefix}autotyping    — toggle typing\n║ ${prefix}autorecording — toggle recording\n║ ${prefix}autoonline    — toggle online\n\n║ _Run again to turn off_\n╚═══════════════════════╝`)
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
    reply('╔══〔 👀 AUTO VIEW STATUS 〕╗\n\n║ ✅ *Status* : ON\n║ Bot will auto-view all statuses.\n╚═══════════════════════╝')
} else if (avsArg === 'off' || avsArg === 'disable') {
    global.autoViewStatus = false
    try { if (typeof _savePhoneState === 'function') _savePhoneState(X.user?.id?.split(':')[0]?.split('@')[0] || '') } catch {}
    reply('╔══〔 👀 AUTO VIEW STATUS 〕╗\n\n║ ❌ *Status* : OFF\n║ Bot will no longer auto-view statuses.\n╚═══════════════════════╝')
} else {
    if (global.autoViewStatus) {
        global.autoViewStatus = false
        try { if (typeof _savePhoneState === 'function') _savePhoneState(X.user?.id?.split(':')[0]?.split('@')[0] || '') } catch {}
        reply('╔══〔 👀 AUTO VIEW STATUS 〕╗\n\n║ ❌ *Status* : OFF\n║ Bot will no longer auto-view statuses.\n╚═══════════════════════╝')
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
        return `╔══〔 ❤️  AUTO REACT STATUS 〕══╗\n\n║ 📊 *Status* : ${_ar.enabled ? '✅ ON' : '❌ OFF'}\n║ 👁️  *View Mode* : ${_vm}\n║ 🎭 *Emoji* : ${_em}\n║ 📈 *Reacted* : ${_ar.totalReacted} statuses\n║ 🎨 *Pool* : ${_ar.reactions.join(' ')}\n\n║ *Commands:*\n║ ${prefix}als on / off\n║ ${prefix}als view+react / react-only\n║ ${prefix}als fixed / random\n║ ${prefix}als emoji [emoji]\n║ ${prefix}als add [emoji] / remove [emoji]\n║ ${prefix}als reset\n║ ${prefix}als stats\n╚═══════════════════════╝`
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
        return reply(`✅ *Auto React ON*\n║ Mode: ${_ar.viewMode} · ${_ar.mode === 'fixed' ? _ar.fixedEmoji : '🎲 random'}`)
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
        return reply(`╔══〔 🎲 RANDOM MODE 〕════╗\n║ Picks random emoji from pool:\n║ ${_ar.reactions.join(' ')}\n╚═══════════════════════╝`)
    }

    if (_arAction === 'emoji') {
        if (!_arVal) return reply(`╔══〔 ❤️ AUTO LIKE STATUS 〕══╗\n\n║ Usage: *${prefix}als emoji [emoji]*\n║ Example: ${prefix}als emoji ❤️\n╚═══════════════════════╝`)
        _ar.fixedEmoji = _arVal
        _ar.mode = 'fixed'
        global.autoLikeEmoji = _arVal
        return reply(`✅ Emoji set to *${_arVal}* (fixed mode)`)
    }

    if (_arAction === 'add') {
        if (!_arVal) return reply(`╔══〔 🔥 AUTO LIKE STATUS 〕══╗\n\n║ Usage: *${prefix}als add [emoji]*\n║ Example: ${prefix}als add 🔥\n╚═══════════════════════╝`)
        if (_ar.reactions.includes(_arVal)) return reply(`⚠️ *${_arVal}* already in pool.`)
        _ar.reactions.push(_arVal)
        return reply(`✅ *${_arVal}* added.\n\n${_ar.reactions.join(' ')}`)
    }

    if (_arAction === 'remove') {
        if (!_arVal) return reply(`╔══〔 🗑️ AUTO LIKE STATUS 〕══╗\n\n║ Usage: *${prefix}als remove [emoji]*\n║ Example: ${prefix}als remove 🔥\n╚═══════════════════════╝`)
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
        return reply(`╔══〔 📊 REACT STATS 〕═══╗\n\n║ 📈 *Total reacted* : ${_ar.totalReacted}\n║ 🗂️  *Tracked IDs* : ${_ar.reactedIds.length}\n║ 🎭 *Mode* : ${_ar.mode}\n║ 👁️  *View Mode* : ${_ar.viewMode}\n║ 🎨 *Emoji pool* : ${_ar.reactions.join(' ')}\n╚═══════════════════════╝`)
    }

    if (_arAction === 'list' || _arAction === 'emojis') {
        return reply(`🎨 *Emoji Pool (${_ar.reactions.length}):*\n\n${_ar.reactions.join(' ')}\n\n║ Fixed: ${_ar.fixedEmoji}\n║ Mode: ${_ar.mode}`)
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
                return reply(`✅ *Image posted to status!*\n║ Visible to ${_jidList.length} contact(s)`)
            } else if (_qt === 'videoMessage') {
                const _stream = await downloadContentFromMessage(_qm.videoMessage, 'video')
                let _chunks = []; for await (const c of _stream) _chunks.push(c)
                const _buf = Buffer.concat(_chunks)
                await X.sendMessage('status@broadcast', { video: _buf, caption: _postText, mimetype: 'video/mp4' }, { statusJidList: _jidList })
                return reply(`✅ *Video posted to status!*\n║ Visible to ${_jidList.length} contact(s)`)
            }
        }
        if (!_postText) return reply(`╔══〔 📤 POST TO STATUS 〕══╗\n\n║ ${prefix}als post [text] — text status\n║ Reply to image/video with ${prefix}als post — media status\n╚═══════════════════════╝`)
        await X.sendMessage('status@broadcast', { text: _postText }, { statusJidList: _jidList })
        return reply(`✅ *Posted to status!*\n║ Visible to ${_jidList.length} contact(s)`)
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
            return reply(`✅ *Image posted to your status!*\n║ Shown to ${_jidList.length} contact(s)`)
        } else if (_qt === 'videoMessage') {
            const _stream = await downloadContentFromMessage(_qm.videoMessage, 'video')
            let _chunks = []; for await (const c of _stream) _chunks.push(c)
            await X.sendMessage('status@broadcast', { video: Buffer.concat(_chunks), caption: _caption, mimetype: 'video/mp4' }, { statusJidList: _jidList })
            return reply(`✅ *Video posted to your status!*\n║ Shown to ${_jidList.length} contact(s)`)
        } else if (_qt === 'stickerMessage') {
            const _stream = await downloadContentFromMessage(_qm.stickerMessage, 'sticker')
            let _chunks = []; for await (const c of _stream) _chunks.push(c)
            await X.sendMessage('status@broadcast', { image: Buffer.concat(_chunks) }, { statusJidList: _jidList })
            return reply(`✅ *Sticker posted as status!*\n║ Shown to ${_jidList.length} contact(s)`)
        }
    }
    if (!_caption) return reply(
        `╔══〔 📤 POST TO STATUS 〕══╗\n\n` +
        `  *Text:*  ${prefix}poststatus [your text]\n` +
        `  *Image:* reply to an image with ${prefix}poststatus\n` +
        `  *Video:* reply to a video with ${prefix}poststatus\n` +
        `  *Short:* ${prefix}sts [text]\n\n` +
        `║ Also: ${prefix}als post [text]\n╚═══════════════════════╝`
    )
    await X.sendMessage('status@broadcast', { text: _caption }, { statusJidList: _jidList })
    reply(`✅ *Posted to your status!*\n║ Shown to ${_jidList.length} contact(s)`)
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
reply(`╔══〔 📊 STATUS TOOLS CONFIG 〕══╗

║ 👀 *Auto View* : ${viewState}
║ ❤️  *Auto Like* : ${likeState}
║ 💬 *Auto Reply* : ${replyState}
║ 📤 *Forward* : ${fwdState}
║ 🛡️  *Anti-Mention* : ${asmState}


  🛠️  *Commands*
║ ${prefix}autoviewstatus
║ ${prefix}autolikestatus [emoji/off]
║ ${prefix}autoreplystatus [msg/off]
║ ${prefix}togroupstatus on/off
║ ${prefix}antistatusmention [on/warn/kick/del]
╚═══════════════════════╝`)
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
    if (!m.isGroup) return reply(`╔══〔 📤 STATUS TOOLS 〕══╗\n\n║ *Post to group status:*\n║ Reply to media/text with *${prefix}togroupstatus*\n║ Or: *${prefix}togroupstatus [text]*\n\n║ *Auto-forward:*\n║ *${prefix}togroupstatus on*  — enable in group\n║ *${prefix}togroupstatus off* — disable\n║ *${prefix}togroupstatus status* — check setting\n╚═══════════════════════╝`)
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
            reply(`╔══〔 📤 GROUP STATUS POSTER 〕══╗\n\n║ Reply to media with *${prefix}togroupstatus*\n║ Or: *${prefix}togroupstatus [text]*\n║ Auto-forward: *${prefix}togroupstatus on*\n╚═══════════════════════╝`)
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
case 'mystatus': {
    try {
        // Build statusJidList from store contacts — targets them directly,
        // bypassing WhatsApp privacy settings which often block delivery
        const _getStatusJids = () => {
            try {
                const _raw = store?.contacts
                if (!_raw) return []
                const _entries = typeof _raw.entries === 'function'
                    ? [..._raw.entries()] : Object.entries(_raw)
                return _entries
                    .map(([jid]) => jid)
                    .filter(jid => jid && jid.endsWith('@s.whatsapp.net'))
            } catch { return [] }
        }
        const _statusJids = _getStatusJids()
        const _sendOpts = _statusJids.length ? { statusJidList: _statusJids } : {}

        const _send = (content) => X.sendMessage('status@broadcast', content, _sendOpts)

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
                const buf = await _dlTS(/sticker/i.test(qType) ? 'sticker' : 'image')
                const cap = m.quoted.text || m.quoted.caption || ''
                await _send({ image: buf, caption: cap })
                reply(`✅ *Image posted to your status!*`)
            } else if (/video/i.test(qType)) {
                const buf = await _dlTS('video')
                const cap = m.quoted.text || m.quoted.caption || ''
                await _send({ video: buf, caption: cap, gifPlayback: false })
                reply(`✅ *Video posted to your status!*`)
            } else if (/audio/i.test(qType)) {
                const buf = await _dlTS('audio')
                await _send({ audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true })
                reply(`✅ *Audio posted to your status!*`)
            } else {
                const quotedText = m.quoted.text || m.quoted.body || m.quoted.caption
                    || m.quoted.conversation || m.quoted.title || m.quoted.description || ''
                if (quotedText.trim()) {
                    await _send({ text: quotedText, backgroundColor: '#075E54', font: 4 })
                    reply(`✅ *Text posted to your status!*`)
                } else {
                    reply(`❌ Unsupported type. Reply to an image, video, audio, or text message.`)
                }
            }
        } else if (text) {
            await _send({ text: text, backgroundColor: '#075E54', font: 4 })
            reply(`✅ *Text posted to your status!*`)
        } else {
            reply(`╔══〔 📤 STATUS POSTER 〕══╗\n\n║ Reply to media with *${prefix}tostatus*\n║ Or: *${prefix}tostatus [text]*\n╚═══════════════════════╝`)
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
reply(`╔══〔 🔒 BOT MODE: PRIVATE 〕══╗\n\n║ ✅ *Enabled*\n║ Only *${botClean}* and sudo users can use commands.\n║ All other users are blocked.\n╚═══════════════════════╝`)
}
break

case 'public': {
    await X.sendMessage(m.chat, { react: { text: '🔓', key: m.key } })
if (!isDeployedNumber) return reply(mess.OnlyOwner)
X.public = true
reply(`╔══〔 🌐 BOT MODE: PUBLIC 〕══╗\n\n║ ✅ *Enabled*\n║ All users can use bot commands.\n║ Owner-only commands still restricted.\n╚═══════════════════════╝`)
}
break

case 'join': {
    await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
if (!q) return reply(`╔═══〔 🔗 JOIN GROUP 〕═══╗\n\n║ Usage: *${prefix}join [invite link]*\n║ Example: ${prefix}join https://chat.whatsapp.com/...\n╚═══════════════════════╝`)
let linkMatch = q.match(/chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/)
if (!linkMatch) return reply(`╔══〔 ❌ INVALID LINK 〕═══╗\n\n║ That doesn't look like a valid WhatsApp\n║ group invite link.\n║\n║ ✅ Format: *https://chat.whatsapp.com/XXX*\n╚═══════════════════════╝`)
try {
    await reply('🔗 _Checking group info..._')

    // Step 1: fetch group metadata from the invite link
    let _grpInfo = null
    try { _grpInfo = await X.groupGetInviteInfo(linkMatch[1]) } catch (_gi) { console.log('[join] getInviteInfo:', _gi.message) }

    const _grpName    = _grpInfo?.subject || 'Unknown Group'
    const _grpSize    = _grpInfo?.size    || '?'
    const _needsApproval = _grpInfo?.joinApprovalMode === 'on' || _grpInfo?.joinApprovalMode === true

    if (_needsApproval) {
        await reply(`╔══〔 ⏳ APPROVAL REQUIRED 〕══╗\n\n║ 👥 *Group* : ${_grpName}\n║ 👤 *Members* : ${_grpSize}\n║\n║ This group requires admin approval.\n║ Sending join request now...\n╚═══════════════════════╝`)
    }

    // Step 2: attempt to join (or submit join request)
    let joinResult = await X.groupAcceptInvite(linkMatch[1])

    if (_needsApproval) {
        reply(`╔══〔 📨 REQUEST SENT 〕════╗\n\n║ 🛎️ Join request sent to admins of\n║ *${_grpName}*.\n║\n║ The bot will join once an admin\n║ approves the request.\n╚═══════════════════════╝`)
    } else {
        reply(`╔══〔 ✅ GROUP JOINED 〕═══╗\n\n║ 🎉 Bot successfully joined!\n║ 👥 *Group* : ${_grpName}\n║ 👤 *Members* : ${_grpSize}\n║ 🆔 *ID* : ${joinResult}\n╚═══════════════════════╝`)
    }

} catch (e) {
    // Check HTTP status code first (atassa pattern), then fall back to message text
    const errCode = e.data || e.output?.statusCode
    const errMsg  = (e.message || '').toLowerCase()
    if (errCode === 409 || errMsg.includes('conflict') || errMsg.includes('already')) {
        reply(`╔══〔 ⚠️ ALREADY JOINED 〕══╗\n\n║ The bot is already a member\n║ of that group.\n╚═══════════════════════╝`)
    } else if (errCode === 400 || errMsg.includes('membership') || errMsg.includes('approval') || errMsg.includes('pending')) {
        reply(`╔══〔 📨 REQUEST SENT 〕════╗\n\n║ 🛎️ This group requires admin approval.\n║\n║ Join request submitted — the bot\n║ will join once an admin approves.\n╚═══════════════════════╝`)
    } else if (errCode === 403 || errMsg.includes('forbidden') || errMsg.includes('blocked')) {
        reply(`╔══〔 🚫 JOIN BLOCKED 〕═══╗\n\n║ The bot is not allowed to\n║ join this group.\n╚═══════════════════════╝`)
    } else if (errMsg.includes('gone') || errMsg.includes('not-authorized') || errMsg.includes('expired')) {
        reply(`╔══〔 ❌ LINK EXPIRED 〕════╗\n\n║ This invite link is invalid or has\n║ been revoked. Ask for a new one.\n╚═══════════════════════╝`)
    } else {
        reply(`╔══〔 ❌ JOIN FAILED 〕════╗\n\n║ ⚠️ ${(e.message || 'Unknown error').slice(0, 120)}\n╚═══════════════════════╝`)
    }
}
}
break

case 'prefix': {
    await X.sendMessage(m.chat, { react: { text: '⚙️', key: m.key } })
let currentPfx = global.botPrefix || '.'
reply(`╔════〔 ⚙️  PREFIX 〕═════╗\n\n║ 🔤 *Current prefix* : *${currentPfx}*\n\n║ 💡 Supports: chars · emojis · words\n║ Use *${currentPfx}setprefix [prefix]* to change\n╚═══════════════════════╝`)
}
break

case 'save': {
    await X.sendMessage(m.chat, { react: { text: '💾', key: m.key } })
if (!m.quoted) return reply(`╔══〔 💾 SAVE TO DM 〕═════╗
║ Reply to any message/media
║ with *${prefix}save* to save it to your DM
╚═══════════════════════╝`)
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
    return reply('❌ *Unsupported media type.* Only images, videos, audio, stickers and text are supported.')
}
await X.sendMessage(sender, savedMsg)
} catch (e) { reply('❌ Failed to save: ' + e.message) }
}
break

case 'setprefix': {
    await X.sendMessage(m.chat, { react: { text: '⚙️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newPrefix = text.trim()
if (!newPrefix) {
    let currentPfx = (global.botPrefix === '') ? '*none* (no prefix)' : (global.botPrefix || '.')
    reply(`╔══〔 ⌨️  SET PREFIX 〕═══╗\n\n║ 📌 *Current* : ${currentPfx}\n\n║ ${prefix}setprefix [prefix]  — set new prefix\n║ ${prefix}setprefix none     — remove prefix\n║ ${prefix}setprefix reset    — restore default (.)\n\n║ 💡 *Works with anything:*\n║  Single char  : . ! # @ $\n║  Emojis       : 🔥 ⚡ 🤖 👑\n║  Words        : bot toosii XD\n║  Mixed        : 🔥bot! XD~\n╚═══════════════════════╝`)
} else if (newPrefix.toLowerCase() === 'reset' || newPrefix.toLowerCase() === 'default') {
    global.botPrefix = '.'
    reply(`╔══〔 ⌨️  SET PREFIX 〕═══╗\n\n║ ✅ *Prefix reset to default*\n║ 🔤 Now using: *.*\n║ Example: *.menu*, *.ping*\n╚═══════════════════════╝`)
} else if (newPrefix.toLowerCase() === 'none' || newPrefix.toLowerCase() === 'off' || newPrefix.toLowerCase() === 'remove') {
    global.botPrefix = ''
    reply(`╔══〔 ⌨️  SET PREFIX 〕═══╗\n\n║ ✅ *Prefix removed!*\n║ Commands now work without a prefix.\n║ Example: *menu*, *ping*, *help*\n╚═══════════════════════╝`)
} else {
    global.botPrefix = newPrefix
    reply(`╔══〔 ⌨️  SET PREFIX 〕═══╗\n\n║ ✅ *Prefix updated!*\n║ 🔤 *New prefix* : *${global.botPrefix}*\n\n║ Example: *${global.botPrefix}menu*\n║          *${global.botPrefix}ping*\n║          *${global.botPrefix}help*\n╚═══════════════════════╝`)
}
}
break

// Bot Configuration Commands
case 'botname': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newName = args.join(' ').trim()
if (!newName) return reply(`╔════〔 🤖 BOT NAME 〕════╗\n\n║ Current: *${global.botname}*\n║ Usage: *${prefix}botname [new name]*\n╚═══════════════════════╝`)
global.botname = newName
reply(`✅ *Bot name updated* : *${newName}*`)
}
break

case 'setauthor':
case 'author': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newAuthor = args.join(' ').trim()
if (!newAuthor) return reply(`╔══〔 ✏️ STICKER AUTHOR 〕══╗\n\n║ Current: *${global.author}*\n║ Usage: *${prefix}author [new name]*\n╚═══════════════════════╝`)
global.author = newAuthor
reply(`✅ *Sticker author updated* : *${newAuthor}*`)
}
break

case 'setwm':
case 'setwatermark':
case 'setpackname':
case 'packname': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newPack = args.join(' ').trim()
if (!newPack) return reply(`╔══〔 📦 STICKER PACK 〕══╗\n\n║ Current: *${global.packname}*\n║ Usage: *${prefix}packname [new name]*\n╚═══════════════════════╝`)
global.packname = newPack
reply(`✅ *Sticker pack updated* : *${newPack}*`)
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
            `╔════〔 🕐 TIMEZONE 〕════╗\n\n` +
            `║ 🌍 *Current* : ${_cur}\n` +
            `║ 🕐 *Time* : ${_now.format('HH:mm:ss')}\n` +
            `║ 📅 *Date* : ${_now.format('DD/MM/YYYY')}\n` +
            `║ ⏰ *Offset* : UTC${_now.format('Z')}\n\n` +
            `  📌 *Usage:*\n` +
            `  ${prefix}timezone Africa/Lagos\n` +
            `  ${prefix}timezone Asia/Dubai\n` +
            `  ${prefix}timezone America/New_York\n\n` +
            `  🔍 *Search:* ${prefix}timezone Africa\n╚═══════════════════════╝`
        )
    }

    // Alias lookup — resolve common country/city names
    const _aliasKey = _tzArg.toLowerCase().replace(/\s+/g, '_')
    const _aliasMatch = _tzAliases[_aliasKey]
    if (_aliasMatch) {
        global.botTimezone = _aliasMatch
        const _now = moment().tz(_aliasMatch)
        return reply(
            `╔════〔 🕐 TIMEZONE 〕════╗\n\n` +
            `  ✅ *Updated!*\n\n` +
            `║ 🌍 *Timezone* : ${_aliasMatch}\n` +
            `║ 🕐 *Time* : ${_now.format('HH:mm:ss')}\n` +
            `║ 📅 *Date* : ${_now.format('DD/MM/YYYY')}\n` +
            `║ ⏰ *Offset* : UTC${_now.format('Z')}\n╚═══════════════════════╝`
        )
    }

    // Exact IANA match — set it
    if (moment.tz.zone(_tzArg)) {
        global.botTimezone = _tzArg
        const _now = moment().tz(_tzArg)
        return reply(
            `╔════〔 🕐 TIMEZONE 〕════╗\n\n` +
            `  ✅ *Updated!*\n\n` +
            `║ 🌍 *Timezone* : ${_tzArg}\n` +
            `║ 🕐 *Time* : ${_now.format('HH:mm:ss')}\n` +
            `║ 📅 *Date* : ${_now.format('DD/MM/YYYY')}\n` +
            `║ ⏰ *Offset* : UTC${_now.format('Z')}\n╚═══════════════════════╝`
        )
    }

    // Partial search in IANA list
    const _query = _tzArg.toLowerCase()
    const _matches = _allZones.filter(z => z.toLowerCase().includes(_query)).slice(0, 20)
    if (_matches.length) {
        return reply(
            `╔════〔 🕐 TIMEZONE 〕════╗\n\n` +
            `  ❌ *"${_tzArg}"* not found.\n` +
            `  Did you mean one of these?\n\n` +
            _matches.map((z, i) => {
                const _t = moment().tz(z).format('HH:mm')
                return `  ${i+1}. ${z} (🕐 ${_t})`
            }).join('\n') +
            (_allZones.filter(z => z.toLowerCase().includes(_query)).length > 20
                ? `\n║ ... and more. Be more specific.` : ``) +
            `\n\n║ 📌 Copy a timezone above and run:\n║ ${prefix}timezone <timezone>\n╚═══════════════════════╝`
        )
    }

    // Nothing found — suggest searching by continent
    const _continent = _tzArg.split('/')[0] || ''
    const _contSearch = _allZones.filter(z => z.toLowerCase().startsWith(_continent.toLowerCase())).slice(0, 10)
    reply(
        `╔════〔 🕐 TIMEZONE 〕════╗\n\n` +
        `  ❌ *"${_tzArg}"* is not a valid timezone.\n\n` +
        (_contSearch.length ? `  *${_continent} timezones:*\n` + _contSearch.map(z => `  • ${z}`).join('\n') + '\n\n' : '') +
        `  🔍 Search: ${prefix}timezone ${_continent || 'Africa'}\n` +
        `  📌 Example: ${prefix}timezone Africa/Lagos\n╚═══════════════════════╝`
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
        reply('╔══〔 🖼️ BOT PP 〕══╗\n\n║ ✅ Profile picture updated!\n╚═══════════════════════╝')
    } catch (e) {
        reply('*Failed to update profile picture.* Make sure you reply to an image.')
    }
} else if (picUrl) {
    global.botPic = picUrl
    global.thumb = picUrl
    reply(`✅ *Bot thumbnail updated*`)
} else {
    reply(`╔══〔 🖼️ BOT PICTURE 〕════╗\n║ 🔗 *Current* : ${global.thumb}\n╠══〔 📋 USAGE 〕══════════╣\n║ ${prefix}botpic [url]   — set thumbnail URL\n║ Reply + ${prefix}botpic  — set profile picture\n╚═══════════════════════╝`)
}
}
break

case 'boturl':
case 'setboturl': {
    await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newUrl = args.join(' ').trim()
if (!newUrl) return reply(`╔════〔 🌐 BOT URL 〕═════╗\n\n║ Current: *${global.botUrl || global.wagc}*\n║ Usage: *${prefix}boturl [url]*\n╚═══════════════════════╝`)
global.botUrl = newUrl
global.wagc = newUrl
reply(`✅ *Bot URL updated* : *${newUrl}*`)
}
break

case 'anticall':
case 'setanticall': {
    await X.sendMessage(m.chat, { react: { text: '📵', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let acArg = (args[0] || '').toLowerCase()
if (!acArg) {
    let acState = global.antiCall ? 'ON' : 'OFF'
    reply(`╔══〔 📵 ANTI CALL 〕══════╗\n║ 📊 *Status* : ${acState}\n║ ✅ Rejects & warns callers automatically\n╠══〔 📋 USAGE 〕══════════╣\n║ ${prefix}anticall on\n║ ${prefix}anticall off\n╚═══════════════════════╝`)
} else if (acArg === 'on' || acArg === 'enable') {
    global.antiCall = true
    reply('╔══〔 📵 ANTI-CALL 〕══╗\n\n║ Status: ✅ ON\n║ Incoming calls will be rejected.\n╚═══════════════════════╝')
} else if (acArg === 'off' || acArg === 'disable') {
    global.antiCall = false
    reply('╔══〔 📵 ANTI-CALL 〕══╗\n\n║ Status: ❌ OFF\n╚═══════════════════════╝')
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
    reply(`╔══〔 👁️ AUTO READ 〕══════╗\n║ 📊 *Status* : ${arState}\n║ Marks all messages as read automatically\n╠══〔 📋 USAGE 〕══════════╣\n║ ${prefix}autoread on\n║ ${prefix}autoread off\n╚═══════════════════════╝`)
} else if (arArg === 'on' || arArg === 'enable') {
    global.autoRead = true
    reply('╔══〔 📖 AUTO READ 〕══╗\n\n║ Status: ✅ ON\n║ All messages will be marked as read.\n╚═══════════════════════╝')
} else if (arArg === 'off' || arArg === 'disable') {
    global.autoRead = false
    reply('╔══〔 📖 AUTO READ 〕══╗\n\n║ Status: ❌ OFF\n╚═══════════════════════╝')
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
    reply(`╔══〔 🤖 CHATBOT STATUS 〕══╗\n║ 🌐 *Global ChatBot* : ${cbState}\n║ 💬 *AI Active Chats* : ${cbaChats}\n╠══〔 📋 COMMANDS 〕══════╣\n║ ${prefix}chatbot on       — global auto-reply\n║ ${prefix}chatbot off      — disable\n║ ${prefix}chatboai on      — this chat only\n║ ${prefix}chatboai off     — disable here\n║ ${prefix}chatboai [msg]   — one-shot AI reply\n╚═══════════════════════╝`)
} else if (cbArg === 'on' || cbArg === 'enable') {
    global.chatBot = true
    reply('*🤖 ChatBot: ✅ ON*\n_Bot will now auto-reply to all messages in English using AI._\n\n_Use_ ' + prefix + 'chatbot off _to stop._')
} else if (cbArg === 'off' || cbArg === 'disable') {
    global.chatBot = false
    reply('*🤖 ChatBot: ❌ OFF*\n_Global auto-replies disabled._')
}
}
break

case 'setbio':
  case 'changebio':
  case 'setstatus': {
      await X.sendMessage(m.chat, { react: { text: '📝', key: m.key } })
      if (!isOwner) return reply(mess.OnlyOwner)
      if (!text) return reply(`╔══〔 📝 SET BIO 〕════╗\n\n║ Usage: *${prefix}setbio <text>*\n║ Sets the bot's WhatsApp status/bio\n╚═══════════════════════╝`)
      try {
          await X.updateProfileStatus(text)
          reply(`✅ *Bio updated!*\n📝 ${text}`)
      } catch(e) { reply('❌ Failed to update bio: ' + e.message) }
  } break

  case 'autobio':
case 'setautobio': {
    await X.sendMessage(m.chat, { react: { text: '📝', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    let abArg = (args[0] || '').toLowerCase()
    if (!abArg) {
        let abState = global._autoBioInterval ? 'ON' : 'OFF'
        reply(`╔══〔 ✍️ AUTO BIO 〕═══════╗\n║ 📊 *Status* : ${abState}\n║ Bio updates with current time every min\n╠══〔 📋 USAGE 〕══════════╣\n║ ${prefix}autobio on\n║ ${prefix}autobio off\n╚═══════════════════════╝`)
    } else if (abArg === 'on' || abArg === 'enable') {
        if (global._autoBioInterval) clearInterval(global._autoBioInterval)
        const _doBio = async () => {
            try {
                const _now = new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos', hour12: true, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                await X.updateProfileStatus(`🤖 TOOSII-XD-ULTRA | Online ✅ | ${_now}`)
            } catch (_) {}
        }
        _doBio()
        global._autoBioInterval = setInterval(_doBio, 60000)
        global.autoBio = true
        reply('╔══〔 ⚙️ AUTO BIO 〕══╗\n\n║ Status: ✅ ON\n║ Bio will update with current time every minute.\n╚═══════════════════════╝')
    } else if (abArg === 'off' || abArg === 'disable') {
        if (global._autoBioInterval) { clearInterval(global._autoBioInterval); global._autoBioInterval = null }
        global.autoBio = false
        try { await X.updateProfileStatus('🤖 TOOSII-XD-ULTRA | Powered by Baileys') } catch (_) {}
        reply('╔══〔 ⚙️ AUTO BIO 〕══╗\n\n║ Status: ❌ OFF\n║ Bio restored to default.\n╚═══════════════════════╝')
    }
} break

case 'autoreplystatus':
case 'autoreply': {
    await X.sendMessage(m.chat, { react: { text: '💬', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let arsArg = args.join(' ').trim()
if (!arsArg) {
    let arsState = global.autoReplyStatus ? 'ON' : 'OFF'
    let arsMsg = global.autoReplyStatusMsg || 'Not set'
    reply(`╔══〔 💬 AUTO REPLY STATUS 〕╗\n║ 📊 *Status* : ${arsState}\n║ 📝 *Reply msg* : ${arsMsg}\n╠══〔 📋 USAGE 〕══════════╣\n║ ${prefix}autoreplystatus [msg] — enable\n║ ${prefix}autoreplystatus off  — disable\n╚═══════════════════════╝`)
} else if (arsArg.toLowerCase() === 'off' || arsArg.toLowerCase() === 'disable') {
    global.autoReplyStatus = false
    global.autoReplyStatusMsg = ''
    reply('╔══〔 🔄 AUTO REPLY STATUS 〕══╗\n\n║ Status: ❌ OFF\n╚═══════════════════════╝')
} else {
    global.autoReplyStatusMsg = arsArg
    global.autoReplyStatus = true
    reply(`✅ *Auto Reply Status ON*\n║ Replying with: _"${arsArg}"_`)
}
}
break

case 'antistatusmention':
case 'antismention': {
    await X.sendMessage(m.chat, { react: { text: '🛡️', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)
    if (!global.antiStatusMentionGroups) global.antiStatusMentionGroups = {}
    const _asmCfg = global.antiStatusMentionGroups[m.chat] || { enabled: false, action: 'warn' }
    let asmArg = (args[0] || '').toLowerCase()

    const _asmStatus = () => {
        const _s    = _asmCfg.enabled ? '✅ ON' : '❌ OFF'
        const _a    = (_asmCfg.action || 'warn').toUpperCase()
        const _aIcon = _a === 'WARN' ? '⚠️' : _a === 'KICK' ? '🚫' : '🗑️'
        return `╔══〔 🛡️  ANTI STATUS MENTION 〕══╗\n\n║ 📊 *Status* : ${_s}\n║ ${_aIcon} *Action* : ${_a}\n║ 📍 *Scope* : This group only\n\n║ *Commands:*\n║ ${prefix}antistatusmention on\n║ ${prefix}antistatusmention off\n║ ${prefix}antistatusmention warn   — 3 strikes then kick\n║ ${prefix}antistatusmention delete — notify in group\n║ ${prefix}antistatusmention kick   — instant removal\n\n║ _Bot must be admin in the group._\n╚═══════════════════════╝`
    }

    const _save = (enabled, action) => {
        global.antiStatusMentionGroups[m.chat] = { enabled, action: action || _asmCfg.action || 'warn' }
    }

    if (!asmArg) {
        reply(_asmStatus())
    } else if (asmArg === 'on' || asmArg === 'enable') {
        _save(true, _asmCfg.action || 'warn')
        const _a = (_asmCfg.action || 'warn').toUpperCase()
        reply(`╔══〔 🛡️  ANTI STATUS MENTION 〕══╗\n\n║ ✅ *Enabled for this group*\n║ Action: *${_a}*\n\n║ _Anyone who tags this group in their status\n║ will be ${_a === 'WARN' ? 'warned (3x = kick)' : _a === 'KICK' ? 'instantly kicked' : 'notified and warned'}._\n╚═══════════════════════╝`)
    } else if (asmArg === 'off' || asmArg === 'disable') {
        _save(false, _asmCfg.action || 'warn')
        reply(`╔══〔 🛡️  ANTI STATUS MENTION 〕══╗\n\n║ ❌ *Disabled for this group*\n║ Group tagging in statuses no longer actioned.\n╚═══════════════════════╝`)
    } else if (asmArg === 'warn') {
        _save(true, 'warn')
        reply(`╔══〔 🛡️  ANTI STATUS MENTION 〕══╗\n\n║ ⚠️ *WARN MODE — Enabled*\n║ 📍 This group only\n║ 3 warnings : automatic kick\n\n║ _Bot must be admin in the group._\n╚═══════════════════════╝`)
    } else if (asmArg === 'delete' || asmArg === 'del') {
        _save(true, 'delete')
        reply(`╔══〔 🛡️  ANTI STATUS MENTION 〕══╗\n\n║ 🗑️ *DELETE MODE — Enabled*\n║ 📍 This group only\n║ Group notified + sender DM'd\n\n║ _Bot must be admin in the group._\n╚═══════════════════════╝`)
    } else if (asmArg === 'kick' || asmArg === 'remove') {
        _save(true, 'kick')
        reply(`╔══〔 🛡️  ANTI STATUS MENTION 〕══╗\n\n║ 🚫 *KICK MODE — Enabled*\n║ 📍 This group only\n║ Instant removal from group\n\n║ _Bot must be admin in the group._\n╚═══════════════════════╝`)
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
    reply(`╔══〔 🔗 ANTI LINK 〕══════╗\n║ 📊 *Status* : ${alState}\n║ Deletes links & warns sender\n╠══〔 📋 USAGE 〕══════════╣\n║ ${prefix}antilink on\n║ ${prefix}antilink off\n╚═══════════════════════╝`)
} else if (alArg === 'on' || alArg === 'enable') {
    global.antiLink = true
    reply(`╔══〔 🔗 ANTI-LINK: ON 〕══╗\n\n║ ✅ Links will be deleted.\n║ _Bot must be admin._\n╚═══════════════════════╝`)
} else if (alArg === 'off' || alArg === 'disable') {
    global.antiLink = false
    reply('╔══〔 🔗 ANTI-LINK 〕══╗\n\n║ Status: ❌ OFF\n╚═══════════════════════╝')
}
}
break

case 'antichat':
case 'nochat':
case 'chatlock': {
    await X.sendMessage(m.chat, { react: { text: '💬', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)

    const _acPath = './database/antichat.json'
    let _acDB = {}
    try { _acDB = JSON.parse(fs.readFileSync(_acPath, 'utf8')) } catch {}
    const _acSave = () => {
        try {
            if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true })
            fs.writeFileSync(_acPath, JSON.stringify(_acDB, null, 2))
        } catch {}
    }

    const _acGC  = _acDB[m.chat] || { enabled: false, action: 'delete', warnings: {} }
    const _acSub = (args[0] || '').toLowerCase()

    if (!_acSub || _acSub === 'status') {
        const _acStatus = _acGC.enabled
            ? `✅ ON (${(_acGC.action || 'delete').toUpperCase()})`
            : '❌ OFF'
        return reply(
            `╔══〔 💬 ANTI-CHAT 〕══════╗
` +
            `║ 📊 *Status*  : ${_acStatus}
` +
            `║ 🔒 Blocks non-admin messages
` +
            `╠══〔 📋 USAGE 〕══════════╣
` +
            `║ ${prefix}antichat on
` +
            `║ ${prefix}antichat off
` +
            `║ ${prefix}antichat action delete
` +
            `║ ${prefix}antichat action warn
` +
            `║ ${prefix}antichat action kick
` +
            `║ ${prefix}antichat resetwarns
` +
            `╚═══════════════════════╝`
        )
    }

    if (_acSub === 'on' || _acSub === 'enable') {
        _acDB[m.chat] = { ..._acGC, enabled: true }
        _acSave()
        return reply(
            `╔══〔 💬 ANTI-CHAT: ON 〕══╗

` +
            `║ ✅ Non-admins cannot send messages.
` +
            `║ 🔧 *Action* : ${(_acDB[m.chat].action || 'delete').toUpperCase()}
` +
            `║ _Bot must be group admin._
` +
            `╚═══════════════════════╝`
        )
    }

    if (_acSub === 'off' || _acSub === 'disable') {
        _acDB[m.chat] = { ..._acGC, enabled: false }
        _acSave()
        return reply(
            `╔══〔 💬 ANTI-CHAT: OFF 〕═╗

` +
            `║ Members can now chat freely.
` +
            `╚═══════════════════════╝`
        )
    }

    if (_acSub === 'action') {
        const _acAct = (args[1] || '').toLowerCase()
        if (!['delete', 'warn', 'kick'].includes(_acAct)) {
            return reply(
                `╔══〔 ❌ INVALID ACTION 〕══╗

` +
                `║ Valid actions:
` +
                `║  • delete — remove message
` +
                `║  • warn   — warn + count
` +
                `║  • kick   — remove from group
` +
                `║
` +
                `║ Example: ${prefix}antichat action warn
` +
                `╚═══════════════════════╝`
            )
        }
        _acDB[m.chat] = { ..._acGC, action: _acAct }
        _acSave()
        return reply(
            `╔══〔 💬 ANTI-CHAT 〕══════╗

` +
            `║ ✅ Action set to: *${_acAct.toUpperCase()}*
` +
            `╚═══════════════════════╝`
        )
    }

    if (_acSub === 'resetwarns' || _acSub === 'reset') {
        _acDB[m.chat] = { ..._acGC, warnings: {} }
        _acSave()
        return reply(
            `╔══〔 💬 ANTI-CHAT 〕══════╗

` +
            `║ ✅ All warnings have been cleared.
` +
            `╚═══════════════════════╝`
        )
    }

    return reply(
        `╔══〔 ❌ UNKNOWN OPTION 〕══╗

` +
        `║ Use *${prefix}antichat* to see commands.
` +
        `╚═══════════════════════╝`
    )
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
              `╔══〔 🗑️ ANTI-DELETE 〕══╗\n\n` +
              `║ 👥 *Groups* : ${_gcSt}\n` +
              `║ 💬 *PMs* : ${_pmSt}\n` +
              `║ 📈 *Tracked* : ${_ad.stats.total} msgs\n` +
              `║ ✅ *Retrieved* : ${_ad.stats.retrieved}\n` +
              `║ 🖼️  *Media* : ${_ad.stats.media} files\n\n` +
              `  *Commands:*\n` +
              `║ ${prefix}antidelete on/off\n` +
              `║ ${prefix}antidelete private/chat/both\n` +
              `║ ${prefix}antidelete gc on/off/private/chat/both\n` +
              `║ ${prefix}antidelete pm on/off/private/chat/both\n` +
              `║ ${prefix}antidelete stats | clear\n╚═══════════════════════╝`
          )
      }

      if (!_arg || _arg === 'status') return reply(_statusMsg())

      // ── gc subcommand ─────────────────────────────────────────────────
      if (_arg === 'gc' || _arg === 'group' || _arg === 'groups') {
          if (_sub === 'on' || _sub === 'enable') {
              _ad.gc.enabled = true; _syncLegacy()
              return reply(`✅ *Anti-Delete GROUPS: ON*\nMode: ${_modeLabel(_ad.gc.mode)}`)
          } else if (_sub === 'off' || _sub === 'disable') {
              _ad.gc.enabled = false; _syncLegacy()
              return reply(`❌ *Anti-Delete GROUPS: OFF*`)
          } else if (['private','prvt','priv'].includes(_sub)) {
              _ad.gc.enabled = true; _ad.gc.mode = 'private'; _syncLegacy()
              return reply(`╔══〔 🔒 ANTI DELETE: GROUPS 〕╗\n║ 📨 *Mode* : PRIVATE\n║ Deleted messages sent to your DM only\n╚═══════════════════════╝`)
          } else if (['chat','cht'].includes(_sub)) {
              _ad.gc.enabled = true; _ad.gc.mode = 'chat'; _syncLegacy()
              return reply(`╔══〔 💬 ANTI DELETE: GROUPS 〕╗\n║ 📨 *Mode* : CHAT\n║ Deleted messages shown in group chat\n╚═══════════════════════╝`)
          } else if (['both','all'].includes(_sub)) {
              _ad.gc.enabled = true; _ad.gc.mode = 'both'; _syncLegacy()
              return reply(`╔══〔 📢 ANTI DELETE: GROUPS 〕╗\n║ 📨 *Mode* : BOTH\n║ Deleted messages → DM + Group chat\n╚═══════════════════════╝`)
          } else {
              return reply(`╔══〔 🛡 ANTI DELETE — GROUPS 〕══╗\n\n║ ${prefix}antidelete gc on/off\n║ ${prefix}antidelete gc private/chat/both\n╚═══════════════════════╝`)
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
              return reply(`╔══〔 🔒 ANTI DELETE: PMs 〕══╗\n║ 📨 *Mode* : PRIVATE\n║ Deleted PMs sent to your DM only\n╚═══════════════════════╝`)
          } else if (['chat','cht'].includes(_sub)) {
              _ad.pm.enabled = true; _ad.pm.mode = 'chat'; _syncLegacy()
              return reply(`╔══〔 💬 ANTI DELETE: PMs 〕══╗\n║ 📨 *Mode* : CHAT\n║ Deleted PMs shown in same chat\n╚═══════════════════════╝`)
          } else if (['both','all'].includes(_sub)) {
              _ad.pm.enabled = true; _ad.pm.mode = 'both'; _syncLegacy()
              return reply(`╔══〔 📢 ANTI DELETE: PMs 〕══╗\n║ 📨 *Mode* : BOTH\n║ Deleted PMs → DM + Same chat\n╚═══════════════════════╝`)
          } else {
              return reply(`╔══〔 🛡 ANTI DELETE — PMS 〕══╗\n\n║ ${prefix}antidelete pm on/off\n║ ${prefix}antidelete pm private/chat/both\n╚═══════════════════════╝`)
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
          return reply(`╔══〔 🔒 ANTI DELETE 〕════╗\n║ 📨 *Mode* : PRIVATE\n║ All deleted messages → your DM\n╚═══════════════════════╝`)
      }
      if (['chat','cht'].includes(_arg)) {
          _ad.gc.enabled = true; _ad.gc.mode = 'chat'
          _ad.pm.enabled = true; _ad.pm.mode = 'chat'; _syncLegacy()
          return reply(`╔══〔 💬 ANTI DELETE 〕════╗\n║ 📨 *Mode* : CHAT\n║ All deleted messages → same chat\n╚═══════════════════════╝`)
      }
      if (['both','all'].includes(_arg)) {
          _ad.gc.enabled = true; _ad.gc.mode = 'both'
          _ad.pm.enabled = true; _ad.pm.mode = 'both'; _syncLegacy()
          return reply(`╔══〔 📢 ANTI DELETE 〕════╗\n║ 📨 *Mode* : BOTH\n║ All deleted messages → DM + chat\n╚═══════════════════════╝`)
      }

      // ── stats ──────────────────────────────────────────────────────────
      if (_arg === 'stats') {
          return reply(
              `╔══〔 📊 ANTI-DELETE STATS 〕══╗\n\n` +
              `║ 👥 *Groups* : ${_ad.gc.enabled ? _modeLabel(_ad.gc.mode) : '❌ OFF'}\n` +
              `║ 💬 *PMs* : ${_ad.pm.enabled ? _modeLabel(_ad.pm.mode) : '❌ OFF'}\n` +
              `║ 📈 *Tracked* : ${_ad.stats.total}\n` +
              `║ ✅ *Retrieved* : ${_ad.stats.retrieved}\n` +
              `║ 🖼️  *Media* : ${_ad.stats.media}\n` +
              `║ 🗂️  *Cache* : ${global._adCache?.size || 0} entries\n╚═══════════════════════╝`
          )
      }

      // ── clear ─────────────────────────────────────────────────────────
      if (_arg === 'clear' || _arg === 'clean') {
          const _sz = global._adCache?.size || 0
          global._adCache = new Map()
          global.adMediaCache = {}
          _ad.stats = { total: 0, retrieved: 0, media: 0 }
          return reply(`╔══〔 🧹 CACHE CLEARED 〕══╗\n║ 🗑️ *Removed* : ${_sz} entries\n║ 🛡️ *Anti-Delete* : ${global.antiDelete ? '✅ ON' : '❌ OFF'}\n╚═══════════════════════╝`)
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
        return reply(`╔══〔 🤖 ANTIBOT SETTINGS 〕══╗\n\n║ 📊 *This group* : ${_grpEnabled}\n║ 🗂️  *Known bots* : ${global.knownBots.length}\n\n${_botList}\n\n║ ${prefix}antibot on     — enable here\n║ ${prefix}antibot off    — disable here\n║ ${prefix}antibot scan   — scan & remove bots\n║ ${prefix}antibot add [number] — mark as bot\n║ ${prefix}antibot list   — list known bots\n╚═══════════════════════╝`)
    }

    // ── on ───────────────────────────────────────────────────────────
    if (_subArg === 'on' || _subArg === 'enable') {
        global.antiBotGroups[m.chat] = true
        return reply(`╔════〔 🤖 ANTIBOT 〕═════╗\n\n║ ✅ *Enabled in this group*\n║ _Bots will be auto-removed when detected._\n╚═══════════════════════╝`)
    }

    // ── off ───────────────────────────────────────────────────────────
    if (_subArg === 'off' || _subArg === 'disable') {
        global.antiBotGroups[m.chat] = false
        return reply(`╔════〔 🤖 ANTIBOT 〕═════╗\n\n║ ❌ *Disabled in this group*\n╚═══════════════════════╝`)
    }

    // ── add ───────────────────────────────────────────────────────────
    if (_subArg === 'add') {
        const _addNum = _subArg2.replace(/[^0-9]/g, '')
        if (!_addNum) return reply(`❌ Provide a number. Example: ${prefix}antibot add 254712345678`)
        if (global.knownBots.includes(_addNum)) return reply(`⚠️ *+${_addNum}* is already in the bot list.`)
        global.knownBots.push(_addNum)
        return reply(`╔════〔 🤖 ANTIBOT 〕═════╗\n\n║ ✅ *+${_addNum}* added to known bots list.\n╚═══════════════════════╝`)
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
        if (!global.knownBots.length) return reply(`╔═══〔 🤖 KNOWN BOTS 〕═══╗\n\n║ _No bots marked yet._\n║ Use ${prefix}antibot add [number]\n╚═══════════════════════╝`)
        const _list = global.knownBots.map((n, i) => `  ${i+1}. +${n}`).join('\n')
        return reply(`╔══〔 🤖 KNOWN BOTS LIST 〕══╗\n\n${_list}\n╚═══════════════════════╝`)
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
                return reply(`╔══〔 🤖 ANTIBOT SCAN 〕══╗\n\n║ ✅ No bots detected in this group.\n║ _${_members.length} members scanned._\n╚═══════════════════════╝`)
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
            return reply(`╔══〔 🤖 ANTIBOT SCAN DONE 〕══╗\n\n║ 🔍 *Scanned* : ${_members.length} members\n║ 🚫 *Removed* : ${_removed.length} bot(s)\n\n${_removedList}\n╚═══════════════════════╝`)

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
let settingsText = `╔══〔 ⚙️  BOT SETTINGS 〕══╗

║ 📛 *Name* : ${global.botname}
║ 🏷️  *Version* : v${global.botver}
║ 🔤 *Prefix* : ${global.botPrefix || 'Multi-prefix'}
║ 🌍 *Timezone* : ${global.botTimezone}
║ 🔒 *Mode* : ${X.public ? 'Public' : 'Private'}
║ 🔗 *URL* : ${global.botUrl || global.wagc}

║ 📦 *Pack* : ${global.packname}
║ ✍️  *Author* : ${global.author}


║ 🤖 *Auto Features*
║ 👁️  Auto Read : ${global.autoRead ? on : off}
║ 📝 Auto Bio : ${global.autoBio ? on : off}
║ 💬 ChatBot : ${global.chatBot ? on : off}
║ 👀 View Status : ${global.autoViewStatus ? on : off}
║ ❤️  Like Status : ${global.autoLikeStatus ? on : off} ${global.autoLikeEmoji ? '(' + global.autoLikeEmoji + ')' : ''}
║ 💌 Reply Status : ${global.autoReplyStatus ? on : off}
║ 📤 Fwd Status : ${global.statusToGroup ? on + ' → ' + global.statusToGroup.split('@')[0] : off}
║ 👻 Presence : ${global.fakePresence}

  🛡️  *Protection*
║ 📵 Anti-Call : ${global.antiCall ? on : off}
║ 🔗 Anti-Link : ${global.antiLink ? on : off}
║ 🗑️  Anti-Delete : ${global.antiDelete ? on : off}
║ 📢 Anti Status Mention : ${global.antiStatusMention ? on : off}

  👥 *Group*
║ 👋 Welcome : ${global.welcome ? on : off}
║ 📣 Admin Events : ${global.adminevent ? on : off}

  🛡️  *Per-Group Protections* _(current group)_
║ 🖼️  Anti Image : ${m.isGroup ? (global.antiImageGroups?.[m.chat] ? on : off) : '—'}
║ 🎬 Anti Video : ${m.isGroup ? (global.antiVideoGroups?.[m.chat] ? on : off) : '—'}
║ 📣 Anti Mention : ${m.isGroup ? (global.antiMentionGroups?.[m.chat] ? on : off) : '—'}
║ 🔗 Anti Link GC : ${m.isGroup ? (global.antilinkGcGroups?.[m.chat] ? on : off) : '—'}
║ 📢 Anti Status Msg : ${m.isGroup ? (global.antiGroupStatusGroups?.[m.chat] ? on : off) : '—'}

║ _⚡ Powered by ${global.ownername || 'Toosii Tech'}_
╚═══════════════════════╝`
reply(settingsText)
}
break

case 'restart':
case 'reboot': {
    await X.sendMessage(m.chat, { react: { text: '🔄', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
await reply(`╔══〔 🔄 RESTARTING 〕═════╗\n║ ⏳ Bot will be back shortly...\n║ _Powered by ${global.botname}_\n╚═══════════════════════╝`)
await sleep(2000)
process.exit(0)
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Update Command — fully functional with step-by-step feedback
case 'announce':
case 'sendupdate': {
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    let _chJid   = global.channelJid
    const _chLink = global.channelLink || global.sessionUrl

    // Auto-resolve newsletter JID from invite link — no manual JID needed
    if (!_chJid && _chLink && _chLink.includes('/channel/')) {
        try {
            const _invCode = _chLink.split('/channel/')[1].split('?')[0].trim()
            const _chMeta  = await X.newsletterMetadata('invite', _invCode)
            if (_chMeta?.id) {
                _chJid = _chMeta.id
                global.channelJid = _chJid   // cache so next call is instant
                console.log('✅ Channel JID auto-resolved:', _chJid)
            }
        } catch (e) {
            console.error('⚠️ Channel JID resolve failed:', e.message)
        }
    }

    if (!_chJid) return reply(`❌ *Could not resolve Channel JID*\n\nCheck that *channelLink* in setting.js is correct:\n${_chLink || 'not set'}`)

    const _announcement = q?.trim()
    if (!_announcement) return reply(`╔══〔 📢 ANNOUNCE 〕══╗\n\n║ *Usage:* ${prefix}announce [message]\n║\n║ *Example:*\n║ ${prefix}announce Hello everyone! 🎉\n║ New update is live, use .update now!\n╚═══════════════════════╝`)

    try {
        // global.getCtxInfo() — adds native "View Channel" footer button
        // channelJid is already resolved at bot startup, so this works immediately
        const _annCtx = global.getCtxInfo()

        // Show the announcement card in the current chat so owner can see "View Channel"
        await X.sendMessage(m.chat, {
            text: _announcement,
            footer: '⚡ TOOSII-XD ULTRA  •  Official Bot Channel',
            contextInfo: _annCtx
        })

        // Also post to the channel itself so subscribers are notified
        await X.sendMessage(_chJid, {
            text: _announcement,
            footer: '⚡ TOOSII-XD ULTRA  •  Official Bot Channel',
            contextInfo: _annCtx
        }).catch(e => console.error('Channel post failed:', e.message))

        reply(`✅ *Announcement sent!*\nYou should see *View Channel* in the footer of the message above.`)
    } catch (e) {
        reply(`❌ Failed: ${e.message}`)
    }
} break

case 'update': {
    await X.sendMessage(m.chat, { react: { text: '⬆️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
const repoUrl = global.repoUrl || ''
if (!repoUrl) return reply(`❌ *No repo URL set!*\n\nAdd this to *setting.js*:\nglobal.repoUrl = "https://github.com/TOOSII102/TOOSII-XD-ULTRA"`)

// Helper: run a shell command and return { ok, stdout, stderr }
const run = (cmd, cwd) => new Promise(resolve => {
    exec(cmd, { cwd: cwd || __dirname, timeout: 60000 }, (err, stdout, stderr) => {
        resolve({ ok: !err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim(), err })
    })
})

await reply(`╔══〔 🔃 CHECKING FOR UPDATES 〕══╗

║ 📦 ${repoUrl}
╚═══════════════════════╝`)

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
        await reply(`╔══〔 ✅ BOT INITIALIZED 〕══╗\n\n║ 🌿 *Branch* : ${initBranch}\n║ 🔄 Restarting now...\n╚═══════════════════════╝`)
        await new Promise(r => setTimeout(r, 2500))
        return _restartBot()
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
        return reply(`╔══〔 ✅ ALREADY UP TO DATE 〕══╗\n\n║ 🌿 *Branch* : ${branch}\n║ 🔖 *Commit* : ${localHash}\n║ 📝 ${(lastLog.stdout || 'N/A').slice(0,80)}\n╚═══════════════════════╝\n\n_Use .announce to post the update notice to your channel_`)
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
        if (!resetResult.ok) return reply(`❌ *Update failed.*\n${(pullResult.stderr || resetResult.stderr).slice(0, 300)}`)
    }

    // ── Step 8: Install deps ──────────────────────────────────────────
    // If pull failed AND reset --hard also failed, try ZIP download as last resort
    const _needsZip = !pullResult.ok && !(await run(`git rev-parse origin/${branch}`)).ok
    if (_needsZip) {
        await reply('⚠️ _Git unavailable — downloading ZIP from GitHub..._')
        try {
            const AdmZip  = require('adm-zip')
            const fse     = require('fs-extra')
            const _r      = (repoUrl || '').replace('https://github.com/', '')
            const _zUrl   = 'https://github.com/' + _r + '/archive/' + branch + '.zip'
            const _zPath  = path.join(__dirname, '_upd' + Date.now() + '.zip')
            const _exPath = path.join(__dirname, '_upd_ex')
            const { data: _zData } = await axios.get(_zUrl, { responseType: 'arraybuffer', timeout: 90000, headers: { 'User-Agent': 'TOOSII-XD-ULTRA' } })
            fse.writeFileSync(_zPath, _zData)
            new AdmZip(_zPath).extractAllTo(_exPath, true)
            const _rName   = _r.split('/')[1]
            const _srcPath = path.join(_exPath, _rName + '-' + branch)
            fse.copySync(_srcPath, __dirname, { overwrite: true, filter: (src) => {
                const rel = require('path').relative(_srcPath, src)
                if (!rel) return true
                if (rel === '.env' || rel.startsWith('.env')) return false
                if (rel.startsWith('session') || rel.startsWith('node_modules')) return false
                return true
            }})
            fse.unlinkSync(_zPath)
            fse.rmSync(_exPath, { recursive: true, force: true })
            console.log('[update] ZIP fallback succeeded')
        } catch (_ze) { return reply('❌ ZIP fallback failed: ' + _ze.message.slice(0, 200)) }
    }
    await run('npm install --production')

    // ── Step 9: Done ──────────────────────────────────────────────────
    const newCommit = await run('git rev-parse HEAD')
    const newHash = newCommit.stdout.slice(0, 7)
    await reply(`╔══〔 ✅ BOT UPDATED 〕══╗

║ 🌿 *Branch*   : ${branch}
║ 🔖 *Old*      : ${localHash}
║ 🆕 *New*      : ${newHash}
║ 📋 *Changes*  : ${changeCount} commit(s)
${changeLines ? changeLines.split('\n').slice(0,8).map(l => '║  • '+l.trim().slice(0,60)).join('\n') : ''}
║
║ 🔄 Restarting panel now...
╚═══════════════════════╝`)
    await new Promise(r => setTimeout(r, 2500))
    _restartBot()

} catch (e) {
    reply(`❌ *Update error:*\n${(e.message || e).slice(0, 300)}`)
}
} break

case 'addplugin': case 'addplug':{
if (!isOwner) return  reply(mess.OnlyOwner)
if (!q.includes("|")) return reply(`╔══〔 📋 USAGE 〕══════════╗\n║ *${prefix + command} name|category|content*\n╚═══════════════════════╝`)
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
if (!q.includes("|")) return reply(`╔══〔 🔧 EDIT PLUGIN 〕════╗\n\n║ Usage: *${prefix}cgplugin [name]|[new content]*\n║ Example: ${prefix}cgplugin myplug|new content here\n╚═══════════════════════╝`)
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
await reply(`╔══〔 ❌ NOT FOUND 〕══════╗\n║ Plugin *${mypler}* not found.\n╚═══════════════════════╝`)
}
break
case 'rmplugin': case 'rmplug':{
if (!isOwner) return  reply(mess.OnlyOwner)
if (!q) return reply(`╔══〔 📋 USAGE 〕══════════╗\n║ *${prefix + command} nama plugin*\n╚═══════════════════════╝`)
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
await reply(`╔══〔 ❌ NOT FOUND 〕══════╗\n║ Plugin *${q}* not found.\n╚═══════════════════════╝`)
}
break
case 'getplugin': case 'getplug':{
if (!isOwner) return  reply(mess.OnlyOwner)
if (!q) return reply(`╔══〔 📋 USAGE 〕══════════╗\n║ *${prefix + command} nama plugin*\n╚═══════════════════════╝`) 
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
                  reply(`╔══〔 👋 WELCOME / GOODBYE 〕══╗\n\n║ 📊 *Status* : ${welState}\n║ Sends greetings when members join/leave\n\n║ ${prefix}welcome on  — Enable\n║ ${prefix}welcome off — Disable\n╚═══════════════════════╝`)
               } else if (welArg === 'on' || welArg === 'enable') {
                  global.welcome = true
                  reply(`╔══〔 👋 WELCOME / GOODBYE 〕══╗\n\n║ ✅ *Enabled in ${groupName || 'this group'}*\n║ _Bot will greet joins & announce leaves._\n╚═══════════════════════╝`)
               } else if (welArg === 'off' || welArg === 'disable') {
                  global.welcome = false
                  reply(`╔══〔 👋 WELCOME / GOODBYE 〕══╗\n\n║ ❌ *Disabled in ${groupName || 'this group'}*\n║ _Welcome and goodbye messages turned off._\n╚═══════════════════════╝`)
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
                  reply(`╔══〔 🌟 ADMIN EVENTS 〕══╗\n\n║ 📊 *Status* : ${evState}\n║ Announces admin promotions & demotions\n\n║ ${prefix}events on  — Enable\n║ ${prefix}events off — Disable\n╚═══════════════════════╝`)
               } else if (evArg === 'on' || evArg === 'enable') {
                  global.adminevent = true
                  reply(`╔══〔 🌟 ADMIN EVENTS 〕══╗\n\n║ ✅ *Enabled in ${groupName || 'this group'}*\n║ _Admin changes will be announced._\n╚═══════════════════════╝`)
               } else if (evArg === 'off' || evArg === 'disable') {
                  global.adminevent = false
                  reply(`╔══〔 🌟 ADMIN EVENTS 〕══╗\n\n║ ❌ *Disabled in ${groupName || 'this group'}*\n║ _Admin event notifications turned off._\n╚═══════════════════════╝`)
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
                                if (!addTarget) return reply(`╔════〔 ➕ ADD USER 〕═════╗\n\n║ Usage: *${prefix + command} @user*\n║ Or type the number: ${prefix + command} 254xxxxxxxxx\n╚═══════════════════════╝`);
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
                                if (!kickTarget) return reply(`╔═══〔 👢 KICK USER 〕════╗\n\n║ Usage: *${prefix + command} @user*\n║ Or reply to their message\n╚═══════════════════════╝`)
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
                                if (!m.quoted) return reply(`╔════〔 🗑️ DELETE 〕═════╗\n\n║ Reply to any message with *${prefix + command}* to delete it\n╚═══════════════════════╝`);
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
                                if (!warnUser) return reply(`╔═══〔 ⚠️ WARN USER 〕════╗\n\n║ Usage: *${prefix}warn @user [reason]*\n║ Or reply to a message\n╚═══════════════════════╝`);
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
                                if (!uwUser) return reply(`╔═══〔 ✅ UNWARN USER 〕═══╗\n\n║ Usage: *${prefix}unwarn @user*\n║ Or reply to a message\n╚═══════════════════════╝`);
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

                        case 'listwarn':
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
                                let warnListText = `╔══〔 ⚠️  GROUP WARNINGS 〕══╗\n\n`;
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
                                warnListText += `╚═══════════════════════╝`
                                X.sendMessage(from, { text: warnListText, mentions: warnMentions }, { quoted: m });
                        }
                        break;

                        case 'promote': {
    await X.sendMessage(m.chat, { react: { text: '⬆️', key: m.key } })
                                if (!m.isGroup) return reply(mess.OnlyGrup)
                                if (!isOwner && !isAdmins) return reply(mess.admin)
                                if (!isBotAdmins) return reply(mess.botAdmin)
                                let promoteTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null
                                if (!promoteTarget) return reply(`╔════〔 ⬆️ PROMOTE 〕═════╗\n\n║ Usage: *${prefix + command} @user*\n║ Or reply to their message\n╚═══════════════════════╝`)
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
                                if (!demoteTarget) return reply(`╔═════〔 ⬇️ DEMOTE 〕═════╗\n\n║ Usage: *${prefix + command} @user*\n║ Or reply to their message\n╚═══════════════════════╝`)
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
                                    reply(`╔══〔 🚫 LINK REVOKED 〕══╗\n\n║ ✅ Invite link successfully revoked.\n║ _Use ${prefix}link to generate a new one._\n╚═══════════════════════╝`)
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
                                                reply(`╔══〔 📋 PENDING REQUESTS 〕══╗\n\n║ *Total:* ${pending.length}\n\n${list}\n\n║ ${prefix}approve all / [number]\n║ ${prefix}reject all / [number]\n╚═══════════════════════╝`)
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
                                                reply(`╔══〔 📋 PENDING REQUESTS 〕╗\n║ *${pending.length} pending requests:*\n║
${list}\n║ ${prefix}reject all — reject all\n║ ${prefix}reject [n]  — reject specific\n╚═══════════════════════╝`)
                                        }
                                } catch (err) {
                                        let errMsg = (err?.message || '').toLowerCase()
                                        if (errMsg.includes('not-authorized') || errMsg.includes('403')) reply(mess.botAdmin)
                                        else reply('❌ Failed: ' + (err.message || 'Unknown error'))
                                }
                        }
                        break
                                
//━━━━━━━━━━━━━━━━━━━━━━━//                            
// search features
                        case 'wikimedia': {
    await X.sendMessage(m.chat, { react: { text: '📖', key: m.key } })
                                if (!text) return reply(`╔══〔 📋 USAGE 〕══════════╗\n║ *${prefix + command} Query*\n╚═══════════════════════╝`);
                                try {
                                        const results = await wikimedia(text);
                                        if (results.length === 0) return reply(`⚠️ No images found on Wikimedia for "${text}".`);
                                        let result = results.map(img => `🖼️ *${img.title || 'No Title'}*\n🔗 ${img.source}`).join('\n\n');
                                        reply(`╔═══〔 🌐 WIKIMEDIA 〕════╗\n\n║ 🔍 *${text}*\n\n${result}\n╚═══════════════════════╝`);
                                } catch (err) {
                                        console.error(err);
                                        reply(`❌ Error fetching images from Wikimedia. Please try again later.`);
                                }
                        }
                        break;

                        case 'mangainfo': {
    await X.sendMessage(m.chat, { react: { text: '📚', key: m.key } })
                                const mangaName = args.join(' ');
                                if (!mangaName) return reply(`╔══〔 📋 USAGE 〕══════════╗\n║ *${prefix + command} Anime*\n╚═══════════════════════╝`);
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
                                if (!url) return reply(`╔══〔 📋 USAGE 〕══════════╗\n║ *${prefix + command} URL*\n╚═══════════════════════╝`);
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
  mediaUrl: global.groupLink || wagc,
  sourceUrl: global.groupLink || wagc
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
                                                return reply('╔══〔 🎌 ANIME INFO 〕═════╗\n\n║ ⚠️ No latest anime data found right now.\n╚═══════════════════════╝');
                                        }
                                        let captionText = `╔══〔 🎌 LATEST ANIME 〕═══╗\n\n`;
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
                                if (!text) return reply(`╔══〔 📋 USAGE 〕══════════╗\n║ *${prefix + command} Anime*\n╚═══════════════════════╝`);
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
                                if (!text) return reply(`╔══〔 📋 USAGE 〕══════════╗\n║ *${prefix + command} 114.5.213.103*\n╚═══════════════════════╝`);
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
    if (!match) return reply(`╔══〔 📋 USAGE 〕══════════╗\n║ *${prefix + command} https://...*\n╚═══════════════════════╝`);
    const _tgToken = process.env.TELEGRAM_BOT_TOKEN
    if (!_tgToken) return reply('⚠️ *TELEGRAM_BOT_TOKEN not set.*\nGet a free token from @BotFather on Telegram → add it as TELEGRAM_BOT_TOKEN in your .env file.')
    let { data: a } = await axios.get(`https://api.telegram.org/bot${_tgToken}/getStickerSet?name=${match[1]}`)
    let stickers = await Promise.all(a.result.stickers.map(async v => {
      let { data: b } = await axios.get(`https://api.telegram.org/bot${_tgToken}/getFile?file_id=${v.file_id}`)
      return {
        emoji: v.emoji,
        is_animated: v.is_animated,
        image_url: `https://api.telegram.org/file/bot${_tgToken}/${b.result.file_path}`
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
if (!text) return reply(`╔══〔 📋 USAGE 〕══════════╗\n║ *${prefix + command} anomali*\n╚═══════════════════════╝`)
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
  if (!_scIsImg && !_scIsQuote) return reply(`╔══〔 ✂️ SQUARE CROP 〕════╗\n\n║ Usage: *${prefix}scrop*\n║ Reply to an image to crop it\n║ into a square sticker.\n╚═══════════════════════╝`)
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
  if (!_mmIsImg && !_mmIsQuote) return reply(`╔══〔 🎭 MEME MAKER 〕═════╗\n║ Reply to an image with:\n║ *${prefix}${command} top text | bottom text*\n║\n║ Or just bottom text:\n║ *${prefix}${command} bottom text only*\n╚═══════════════════════╝`)
  if (!text) return reply(`╔══〔 🎭 MEME MAKER 〕═════╗\n║ Reply to an image with:\n║ *${prefix}${command} top | bottom*\n║\n║ Example:\n║ *${prefix}meme Fixed a bug | 10 more appear*\n╚═══════════════════════╝`)
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
case 'quantum':
case 'quantum-ai':{
  if (!text) return reply(`╔══〔 ⚛️ QUANTUM AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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
  if (!text) return reply(`╔══〔 🗨️ CHAT AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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
  if (!text) return reply(`╔══〔 📌 CONCISE AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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
  if (!text) return reply(`╔══〔 💎 CLAUDE AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '💎', key: m.key } })
    let _kResultclaudeai = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/claude?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultclaudeai = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultclaudeai) return reply(_kResultclaudeai)
    const result = await _runAI('You are Claude AI, an AI assistant made by Anthropic. You are helpful, harmless, and honest. Provide thoughtful and detailed responses.', text)
    reply(result)
  } catch (e) {
    console.error('[CLAUDEAI ERROR]', e.message)
    reply('❌ claudeai is currently unavailable. Please try again.')
  }
}
break
case 'venice': case 'veniceai':{
  if (!text) return reply(`╔══〔 🎨 VENICE AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🎭', key: m.key } })
    let _kResultveniceai = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/venice?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultveniceai = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultveniceai) return reply(_kResultveniceai)
    const result = await _runAI('You are Venice AI, a private and uncensored AI assistant. Be helpful, creative and thorough.', text)
    reply(result)
  } catch (e) {
    console.error('[VENICE ERROR]', e.message)
    reply('❌ venice is currently unavailable. Please try again.')
  }
}
break
case 'logic':
case 'logic-eai':{
  if (!text) return reply(`╔══〔 🧠 LOGIC-E AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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
  if (!text) return reply(`╔══〔 🤖 CHAT GPT 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
    let _cgResult = null
    // Source 1: EliteProTech ChatGPT (primary)
    try {
      let _ep = await fetch(`https://eliteprotech-apis.zone.id/chatgpt?prompt=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(25000) })
      let _epd = await _ep.json()
      if (_epd.success && _epd.response) _cgResult = _epd.response
    } catch {}
    // Source 2: _runAI fallback
    if (!_cgResult) {
      try { _cgResult = await _runAI('You are ChatGPT, a highly intelligent AI assistant by OpenAI. Be helpful, clear and concise.', text) } catch {}
    }
    if (_cgResult) reply(_cgResult)
    else reply('❌ ChatGPT is currently unavailable. Please try again.')
  } catch (e) {
    console.error('[CHATGPT ERROR]', e.message)
    reply('❌ ChatGPT is currently unavailable. Please try again.')
  }
}
break

case 'talkai':
case 'talkgpt':
case 'eliteai': {
  if (!text) return reply(`╔════〔 🧠 TALK AI 〕═════╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} What is quantum computing?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🧠', key: m.key } })
    let _taResult = null
    // Source 1: EliteProTech Talk-AI (primary)
    try {
      let _ep = await fetch(`https://eliteprotech-apis.zone.id/talk-ai?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(25000) })
      let _epd = await _ep.json()
      if (_epd.success && _epd.response) _taResult = _epd.response
    } catch {}
    // Source 2: _runAI fallback
    if (!_taResult) {
      try { _taResult = await _runAI('You are a helpful and intelligent AI assistant. Respond clearly and accurately.', text) } catch {}
    }
    if (_taResult) reply(_taResult)
    else reply('❌ Talk AI is currently unavailable. Please try again.')
  } catch (e) {
    console.error('[TALKAI ERROR]', e.message)
    reply('❌ Talk AI is currently unavailable. Please try again.')
  }
}
break

case 'gpt41':
case 'gpt41-mini':{
  if (!text) return reply(`╔══〔 ⚡ GPT 4.1 MINI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '⚡', key: m.key } })
    let _kResultgpt41mini = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/gpt?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultgpt41mini = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultgpt41mini) return reply(_kResultgpt41mini)
    const result = await _runAI('You are GPT-4.1 Mini, a fast and efficient AI assistant by OpenAI. Give concise but accurate answers.', text)
    reply(result)
  } catch (e) {
    console.error('[GPT41-MINI ERROR]', e.message)
    reply('❌ gpt41-mini is currently unavailable. Please try again.')
  }
}
break

case 'openai':{
  if (!text) return reply(`╔══〔 🔵 OPEN AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
    let _kResultopenai = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/gpt?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultopenai = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultopenai) return reply(_kResultopenai)
    const result = await _runAI('You are OpenAI GPT-4.1, a powerful AI assistant by OpenAI. Provide detailed, accurate and helpful responses.', text)
    reply(result)
  } catch (e) {
    console.error('[OPENAI ERROR]', e.message)
    reply('❌ openai is currently unavailable. Please try again.')
  }
}
break
case 'metaai':{
  if (!text) return reply(`╔══〔 🌀 META AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🔵', key: m.key } })
    let _kResultmetaai = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/llama?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultmetaai = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultmetaai) return reply(_kResultmetaai)
    const result = await _runAI('You are Meta AI, an intelligent and helpful AI assistant by Meta. Be friendly, informative and engaging.', text)
    reply(result)
  } catch (e) {
    console.error('[METAAI ERROR]', e.message)
    reply('❌ metaai is currently unavailable. Please try again.')
  }
}
break
case 'deepseek':{
  if (!text) return reply(`╔══〔 🌊 DEEP SEEK 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🔬', key: m.key } })
    let _kResultdeepseek = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/deepseek?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultdeepseek = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultdeepseek) return reply(_kResultdeepseek)
    const result = await _runAI('You are DeepSeek AI, a powerful AI specializing in deep reasoning, coding and technical analysis. Provide thorough technical responses.', text)
    reply(result)
  } catch (e) {
    console.error('[DEEPSEEK ERROR]', e.message)
    reply('❌ deepseek is currently unavailable. Please try again.')
  }
}
break

case 'gptlogic':{
  if (!text) return reply(`╔══〔 🧩 GPT LOGIC 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🧩', key: m.key } })
    let _kResultgptlogic = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/gpt?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultgptlogic = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultgptlogic) return reply(_kResultgptlogic)
    const result = await _runAI('You are GPT Logic, a highly analytical AI. Answer questions with precise reasoning and logical structure.', text)
    reply(result)
  } catch (e) {
    console.error('[GPTLOGIC ERROR]', e.message)
    reply('❌ gptlogic is currently unavailable. Please try again.')
  }
}
break

case 'aoyoai':{
  if (!text) return reply(`╔══〔 🌙 AOYO AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🌸', key: m.key } })
    let _kResultaoyoai = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/gemini?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultaoyoai = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultaoyoai) return reply(_kResultaoyoai)
    const result = await _runAI('You are AoyoAI, a creative and helpful AI assistant. Be imaginative, warm and informative.', text)
    reply(result)
  } catch (e) {
    console.error('[AOYOAI ERROR]', e.message)
    reply('❌ aoyoai is currently unavailable. Please try again.')
  }
}
break

case 'blackbox':
case 'blackbox-pro':{
  if (!text) return reply(`╔══〔 ⬛ BLACKBOX PRO 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '⬛', key: m.key } })
    let _kResultblackboxpro = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/gpt?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultblackboxpro = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultblackboxpro) return reply(_kResultblackboxpro)
    const result = await _runAI('You are Blackbox AI Pro, a specialized AI for coding and technical questions. Provide precise, working code solutions.', text)
    reply(result)
  } catch (e) {
    console.error('[BLACKBOX-PRO ERROR]', e.message)
    reply('❌ blackbox-pro is currently unavailable. Please try again.')
  }
}
break

case 'zerogpt':{
  if (!text) return reply(`╔══〔 🔲 ZERO GPT 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🔲', key: m.key } })
    let _kResultzerogpt = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/gpt?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultzerogpt = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultzerogpt) return reply(_kResultzerogpt)
    const result = await _runAI('You are ZeroGPT, an advanced AI assistant. Provide accurate and comprehensive answers on any topic.', text)
    reply(result)
  } catch (e) {
    console.error('[ZEROGPT ERROR]', e.message)
    reply('❌ zerogpt is currently unavailable. Please try again.')
  }
}
break

case 'yupraai':{
  if (!text) return reply(`╔══〔 🌟 YUPRA AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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
  if (!text) return reply(`╔══〔 🦅 FELO AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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

case 'chatevery':
case 'chatevery-where':{
  if (!text) return reply(`╔══〔 🌐 CHAT EVERYWHERE 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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
  if (!text) return reply(`╔══〔 ⚡ GPT-4o 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🧠', key: m.key } })
    let _kResultgpt_4o = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/gpt?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultgpt_4o = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultgpt_4o) return reply(_kResultgpt_4o)
    const result = await _runAI('You are GPT-4o, a powerful and versatile AI by OpenAI. Provide detailed, accurate responses with rich understanding.', text)
    reply(result)
  } catch (e) {
    console.error('[GPT-4O ERROR]', e.message)
    reply('❌ gpt-4o is currently unavailable. Please try again.')
  }
}
break


case 'aliceai': {
  if (!text) return reply(`╔══〔 🐇 ALICE AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n║ Example: ${prefix}${command} generate an image of a sunset\n╚═══════════════════════╝`)
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
if (!text) return reply(`╔══〔 ✨ MAGIC STUDIO AI 〕══╗\n\n║ Generate stunning AI images instantly.\n\n║ *Usage:* ${prefix}magicstudio [description]\n\n║ _Examples:_\n║ • a woman in a red dress in Paris\n║ • cyberpunk warrior with glowing sword\n║ • magical forest with fairy lights\n╚═══════════════════════╝`)
try {
await reply('✨ _Magic Studio is generating your image..._')
// Use pollinations with artistic model parameters for magic studio style
let enhancedPrompt = text + ', highly detailed, professional quality, vivid colors, artistic masterpiece'
let seed = Math.floor(Math.random() * 999999)
let imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`
let imgBuffer = await getBuffer(imgUrl)
if (!imgBuffer || imgBuffer.length < 5000) throw new Error('Generation failed')
let caption = `╔══〔 ✨ MAGIC STUDIO 〕═══╗\n\n║ 📝 *Prompt* : ${text}\n║ 🌟 *Style* : Magic Studio\n║ 🎲 *Seed* : ${seed}\n╚═══════════════════════╝`
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
  if (!text) return reply(`╔══〔 💎 GEMMA AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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
  if (!text) return reply(`╔══〔 🌸 VELYN AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🌸', key: m.key } })
    let _kResultvelynai = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/gemini?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultvelynai = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultvelynai) return reply(_kResultvelynai)
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
        return reply(`╔══〔 🕌 MUSLIM PRAYER REMINDER 〕══╗\n\n║ 📊 *Status* : *${_cur.toUpperCase()}*\n\n║ ${prefix}muslimprayer on    — DM + groups\n║ ${prefix}muslimprayer dm    — DM only\n║ ${prefix}muslimprayer group — groups only\n║ ${prefix}muslimprayer off   — disable\n╚═══════════════════════╝`)
    }
    if (!_valid.includes(_arg)) return reply(`❌ Invalid. Use: on · off · dm · group · all`)
    global.muslimPrayer = _arg === 'on' ? 'all' : _arg
    const _labels = { all: '✅ ON (DM + Groups)', dm: '✅ ON (DM only)', group: '✅ ON (Groups only)', off: '❌ OFF' }
    reply(`🕌 *Muslim Prayer Reminder* : ${_labels[global.muslimPrayer]}`)
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
        return reply(`╔══〔 ✝️  CHRISTIAN DEVOTION 〕══╗\n\n║ 📊 *Status* : *${_cur2.toUpperCase()}*\n\n║ ${prefix}christianprayer on    — DM + groups\n║ ${prefix}christianprayer dm    — DM only\n║ ${prefix}christianprayer group — groups only\n║ ${prefix}christianprayer off   — disable\n╚═══════════════════════╝`)
    }
    if (!_valid2.includes(_arg2)) return reply(`❌ Invalid. Use: on · off · dm · group · all`)
    global.christianDevotion = _arg2 === 'on' ? 'all' : _arg2
    const _labels2 = { all: '✅ ON (DM + Groups)', dm: '✅ ON (DM only)', group: '✅ ON (Groups only)', off: '❌ OFF' }
    reply(`✝️ *Christian Devotion* : ${_labels2[global.christianDevotion]}`)
}
break

case 'writecream': {
  if (!text) return reply(`╔══〔 ✍️  WRITECREAM AI 〕══╗\n\n║ AI-powered content writer.\n\n║ *Usage:* ${prefix}writecream [topic or instruction]\n\n║ _Examples:_\n║ • blog post about social media marketing\n║ • product description for wireless earbuds\n║ • email subject lines for a sale campaign\n║ • Instagram caption for a sunset photo\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '✍️', key: m.key } })
    await reply('✍️ _WriteCream AI is writing your content..._')
    const result = await _runAI('You are WriteCream AI, a professional content writer and copywriter. Create engaging, well-structured, high-quality written content including blog posts, product descriptions, email copy, social media captions, ad headlines, and more. Match the tone and format to the request. Use clear structure with headings or bullet points where appropriate.', text)
    reply(`╔══〔 ✍️  WRITECREAM AI 〕══╗\n\n${result}\n╚═══════════════════════╝`)
  } catch (e) {
    console.error('[WRITECREAM ERROR]', e.message)
    reply('❌ WriteCream AI is currently unavailable. Please try again.')
  }
}
break

case 'chatbotai': {
  if (!text) return reply(`╔══〔 🤖 CHATBOT AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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
        return reply(`╔══〔 📖 BIBLE SEARCH 〕══╗\n\n║ Search any verse or topic.\n\n║ *By reference:*\n║ ${prefix}bible John 3:16\n║ ${prefix}bible Romans 8:28\n║ ${prefix}bible Psalm 23:1\n\n║ *By topic/keyword:*\n║ ${prefix}bible love\n║ ${prefix}bible faith\n║ ${prefix}bible strength\n╚═══════════════════════╝`)
    }
    try {
        const isRef = /^[1-3]?\s?[a-zA-Z]+\s+\d+:\d+/i.test(text.trim())
        let verseText = '', reference = '', translation = 'KJV'

        if (isRef) {
            const _bRef = encodeURIComponent(text.trim())
            // ── Primary: Keith API ──────────────────────────────────────────
            try {
                const _kb = await _keithFetch(`/bible/search?q=${_bRef}`)
                const _kbr = _kb?.result || _kb
                if (_kbr?.text || _kbr?.verse) {
                    verseText   = _kbr.text || _kbr.verse
                    reference   = _kbr.reference || _kbr.ref || text.trim()
                    translation = _kbr.translation || 'KJV'
                }
            } catch(_) {}
            // ── Fallback: bible-api.com ─────────────────────────────────────
            if (!verseText) {
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
            }
        } else {
            // ── Topic search: Keith then Pollinations.ai ────────────────────
            try {
                const _kt = await _keithFetch(`/bible/verse?topic=${encodeURIComponent(text.trim())}`)
                const _ktr = _kt?.result || _kt
                if (_ktr?.text || _ktr?.verse) {
                    verseText   = _ktr.text || _ktr.verse
                    reference   = _ktr.reference || _ktr.ref || `Topic: ${text}`
                    translation = _ktr.translation || 'KJV'
                }
            } catch(_) {}
            if (!verseText) {
                const _aiRes = await fetch('https://text.pollinations.ai/openai', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
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
                verseText   = _aiLines[0] || ''
                reference   = _aiLines[1] || `Topic: ${text}`
                translation = _aiLines[2] || 'KJV'
            }
        }

        if (!verseText) return reply(`❌ Could not find a verse for: _${text}_`)
        reply(`╔══〔 📖 BIBLE VERSE 〕═══╗\n\n║ _❝ ${verseText} ❞_\n\n║ 📌 *${reference}*\n║ 📚 *Translation* : ${translation}\n\n_⚡ TOOSII-XD ULTRA_\n╚═══════════════════════╝`)

    } catch(e) {
        reply(`❌ *Bible search failed.*\n_${e.message || 'Please try again.'}_`)
    }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎶  HYMN SEARCH (Keith API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'hymn':
case 'hymnbook': {
    await X.sendMessage(m.chat, { react: { text: '🎶', key: m.key } })
    const _hmq = q?.trim() || text?.trim()
    try {
        if (_hmq) {
            await reply(`🎶 _Searching hymn: ${_hmq}..._`)
            const _hmd = await _keithFetch(`/hymn?q=${encodeURIComponent(_hmq)}`)
            const _hmr = _hmd?.result || (Array.isArray(_hmd) ? _hmd[0] : _hmd)
            if (!_hmr?.title && !_hmr?.lyrics) throw new Error('Not found')
            let msg = `╌══〔 🎶 HYMN 〕═════════╌\n`
            if (_hmr.title) msg += `\n🎵 *${_hmr.title}*\n`
            if (_hmr.number) msg += `📌 *Number:* ${_hmr.number}\n`
            if (_hmr.lyrics) msg += `\n${_hmr.lyrics.slice(0, 1000)}${_hmr.lyrics.length > 1000 ? '\n...' : ''}\n`
            msg += `\n╚═══════════════════════╝`
            await reply(msg)
        } else {
            // Random hymn
            await reply('🎶 _Fetching random hymn..._')
            const _hrnd = await _keithFetch('/hymn/random')
            const _hrnr = _hrnd?.result || _hrnd
            if (!_hrnr?.title) throw new Error('No hymn')
            let msg = `╌══〔 🎶 HYMN OF THE DAY 〕═╌\n`
            if (_hrnr.title) msg += `\n🎵 *${_hrnr.title}*\n`
            if (_hrnr.number) msg += `📌 *Number:* ${_hrnr.number}\n`
            if (_hrnr.lyrics) msg += `\n${_hrnr.lyrics.slice(0, 1000)}${_hrnr.lyrics.length > 1000 ? '\n...' : ''}\n`
            msg += `\n╚═══════════════════════╝`
            await reply(msg)
        }
    } catch(e) {
        reply(`╌══〔 🎶 HYMN 〕═════════╌\n║ *Usage:* ${prefix}hymn [search term]\n║ *Random:* ${prefix}hymn\n║ Example: ${prefix}hymn amazing grace\n╚═══════════════════════╝`)
    }
} break

case 'randommeme':
case 'rmeme': {
    await X.sendMessage(m.chat, { react: { text: '🤣', key: m.key } })
    try {
        const _rmd = await _keithFetch('/fun/meme')
        const _rmr = _rmd?.result || _rmd
        const _rmUrl = _rmr?.url || _rmr?.imageUrl
        const _rmTitle = _rmr?.title || 'Random Meme'
        const _rmSub = _rmr?.subreddit ? ` (r/${_rmr.subreddit})` : ''
        if (!_rmUrl) throw new Error('No meme')
        await safeSendMedia(m.chat, { image: { url: _rmUrl }, caption: `🤣 *${_rmTitle}*${_rmSub}` }, {}, { quoted: m })
    } catch(e) { reply('❌ Could not fetch a meme right now. Try again!') }
} break



case 'quran':
case 'ayah':
case 'quranverse': {
    await X.sendMessage(m.chat, { react: { text: '📿', key: m.key } })
    if (!text) {
        return reply(`╔══〔 📿 QURAN SEARCH 〕══╗\n\n║ Search any ayah or topic.\n\n║ *By reference (Surah:Ayah):*\n║ ${prefix}quran 2:255    (Ayatul Kursi)\n║ ${prefix}quran 1:1      (Al-Fatiha)\n║ ${prefix}quran 112:1    (Al-Ikhlas)\n\n║ *By topic/keyword:*\n║ ${prefix}quran patience\n║ ${prefix}quran mercy\n║ ${prefix}quran paradise\n╚═══════════════════════╝`)
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

        let msg = `╔═══〔 📿 QURAN AYAH 〕═══╗`
        if (arabicText) msg += `  *${arabicText}*\n\n`
        if (englishText) msg += `  _❝ ${englishText} ❞_\n\n`
        msg += `║ 📌 *${reference}*\n`
        msg += `║ 📚 *Translator* : ${isRef ? 'Muhammad Asad' : surahName}\n\n`
        msg += `_⚡ TOOSII-XD ULTRA_`

        msg += `\n╚═══════════════════════╝`
        reply(msg)

    } catch(e) {
        reply(`❌ *Quran search failed.*\n_${e.message || 'Please try again.'}_`)
    }
}
break;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📖  SURAH LOOKUP (Keith API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'surah':
case 'surahsearch': {
    await X.sendMessage(m.chat, { react: { text: '📖', key: m.key } })
    const _srq = q?.trim() || text?.trim()
    if (!_srq) return reply(`╌══〔 📖 SURAH SEARCH 〕══╌\n║ *Usage:* ${prefix}surah [number/name]\n║ Example: ${prefix}surah 1\n║ Example: ${prefix}surah al-fatiha\n╚═══════════════════════╝`)
    try {
        await reply(`📖 _Fetching Surah ${_srq}..._`)
        const _srd = await _keithFetch(`/surah?number=${encodeURIComponent(_srq)}`)
        const _srs = _srd?.surah || _srd?.result || _srd
        if (!_srs || (!_srs.englishName && !_srs.name)) throw new Error('Not found')
        let msg = `╌══〔 📖 SURAH ${_srs.number || _srq} 〕══╌\n`
        if (_srs.englishName) msg += `\n📜 *Name:* ${_srs.englishName} (${_srs.name || ''})\n`
        if (_srs.englishNameTranslation) msg += `🖼️ *Meaning:* ${_srs.englishNameTranslation}\n`
        if (_srs.numberOfAyahs) msg += `📊 *Ayahs:* ${_srs.numberOfAyahs}\n`
        if (_srs.revelationType) msg += `🏙️ *Revealed in:* ${_srs.revelationType}\n`
        const _sray = Array.isArray(_srs.ayahs) ? _srs.ayahs.slice(0, 3) : []
        if (_sray.length) { msg += `\n*🔉 First Ayahs:*\n`; for (let a of _sray) { msg += `\n🔹 [${a.numberInSurah}] ${a.text || ''}\n`; if (a.translation) msg += `   _${a.translation}_\n` } }
        msg += `\n╚═══════════════════════╝`
        await reply(msg)
    } catch(e) { reply(`❌ Could not find Surah *${_srq}*. Try a number (1-114) or use .surahlist to see all.`) }
} break

case 'surahlist': {
    await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
    try {
        const _sld = await _keithFetch('/surah')
        const _sls = Array.isArray(_sld) ? _sld : (_sld?.surahs || _sld?.result)
        if (!Array.isArray(_sls) || !_sls.length) throw new Error('No list')
        let msg = `╌══〔 📋 ALL SURAHS (${_sls.length}) 〕╌\n`
        for (let s of _sls.slice(0, 30)) { msg += `\n${s.number || '?'}. *${s.englishName || s.name}* — ${s.numberOfAyahs || '?'} ayahs` }
        if (_sls.length > 30) msg += `\n\n_...use ${prefix}surah [number] for full details_`
        msg += `\n╚═══════════════════════╝`
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch surah list. Try again later.') }
} break



case 'llama':
case 'llama-ai':{
  if (!text) return reply(`╔══〔 🦙 LLAMA AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🦙', key: m.key } })
    let _kResultllamaai = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/llama?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultllamaai = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultllamaai) return reply(_kResultllamaai)
    const result = await _runAI('You are LLaMA AI, a powerful open-source AI model by Meta. Be helpful, accurate and conversational.', text)
    reply(result)
  } catch (e) {
    console.error('[LLAMA-AI ERROR]', e.message)
    reply('❌ llama-ai is currently unavailable. Please try again.')
  }
}
break

case 'gptturbo':{
if (!text) return reply(`╔════〔 ⚡ GPT TURBO 〕════╗\n\n║ Usage: *${prefix}gptturbo [message]*\n║ Example: ${prefix}gptturbo Tell me a joke\n╚═══════════════════════╝`);
try {
  await X.sendMessage(m.chat, { react: { text: '⚡', key: m.key } })
  let _kResultgptturbo = null
  try {
    let _kr = await fetch(`https://apiskeith.top/ai/gpt?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
    let _kd = await _kr.json()
    if (_kd.status && _kd.result) _kResultgptturbo = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
  } catch {}
  const _aiResult = _kResultgptturbo || await _runAI('You are GPT Turbo, a fast and intelligent AI assistant. Provide clear, helpful responses.', text)
  let turbo = `Title : ${text}\n\nMessage : ${_aiResult}\n`
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
            if (!text) return reply(`╔══〔 🤖 AI ASSISTANT 〕══╗\n\n║ Usage: *${prefix}${command} [question]*\n║ Example: ${prefix}${command} Who is Elon Musk?\n╚═══════════════════════╝`)
            const result = await _runAI('You are Gemini AI, a powerful and intelligent AI assistant by Google. Provide detailed, accurate, and well-structured answers.', text)
            await X.sendMessage(m.chat, { text: `✨ *Gemini AI:*\n\n${result}` }, { quoted: m })
        } catch (error) {
            console.error('[GEMINI-AI ERROR]', error.message)
            await X.sendMessage(m.chat, { text: '❌ *Gemini AI is currently unavailable.* Please try again.' }, { quoted: m })
        }
    }
}
break

case 'lumin':
case 'lumin-ai':{
  if (!text) return reply(`╔══〔 💡 LUMIN AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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

case 'typli':
case 'typli-ai':{
  if (!text) return reply(`╔══〔 ✍️ TYPLI AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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

case 'poly':
case 'poly-ai':{
  if (!text) return reply(`╔══〔 🔷 POLY AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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
  if (!text) return reply(`╔══〔 ♊ GEMINI PRO 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🌟', key: m.key } })
    let _kResultgemini_pro = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/gemini?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultgemini_pro = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultgemini_pro) return reply(_kResultgemini_pro)
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
    return reply(`╔═════〔 📚 TEBAK 〕══════╗\n\n║ Usage: *.tebak [category]*\n║ Example: .tebak lagu\n\n${daftar}\n╚═══════════════════════╝`);
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
        reply(`╔══〔 ⏰ TIME IS UP 〕═════╗\n║ ✅ *Correct answer* : ${global.tebakGame[m.sender].jawaban}\n╚═══════════════════════╝`);
        delete global.tebakGame[m.sender];
      }
    }, 60000) // 60 detik
  };

  return reply(`╔══〔 🧠 GUESS THE ${kategori.toUpperCase()} 〕══╗\n\n║ ${soal.soal}\n\n║ ⏱️ *60 seconds* — reply to answer!\n╚═══════════════════════╝`);
}
break;
//━━━━━━━━━━━━━━━━━━━━━━━━//
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Info Bot             
case 'debugrole': {
    await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
    if (!isOwner) return reply('╔══〔 👑 OWNER ONLY 〕══╗\n\n║ This command is for owner only.\n╚═══════════════════════╝')
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
      storageText = `\n*STORAGE*\n║ 💾 Total: ${storageInfo.totalGb} GB\n║ 📥 Used: ${storageInfo.usedGb} GB (${storageInfo.usedPercentage}%)\n║ ✅ Free: ${storageInfo.freeGb} GB (${storageInfo.freePercentage}%)`
    }
  } catch(e) {}

  const latensi = (Date.now() - start)

  const responseText = `╔══〔 🤖 ${global.botname || 'TOOSII-XD ULTRA'} 〕══╗
║ 🟢 *Bot uptime* : ${runtime(process.uptime())}
║ 🖥️  *Server uptime* : ${runtime(os.uptime())}

║ 🔧 *OS* : ${osType} (${arch})
║ 🟩 *Node.js* : ${nodeVersion}
║ 💎 *CPU* : ${cpuModel}
║ ⚙️  *Cores* : ${coreCount}  📊 *Load* : ${cpuUsage}

║ 📦 *RAM Total* : ${formatp(totalMem)}
║ 🔴 *RAM Used* : ${formatp(usedMem)}
║ 🟢 *RAM Free* : ${formatp(freeMem)}${storageText ?`


║ 💿 *Storage*
${storageText.replace(/\*STORAGE\*\n/,'').replace(/• /g,'║ ')}` : ''}

║ _⚡ Powered by ${global.ownername || 'Toosii Tech'}_
╚═══════════════════════╝`
    return responseText.trim()
}

if (command === 'ping' || command === 'p') {
    const _t = Date.now()
    const _sent = await X.sendMessage(m.chat, { text: `╔══════〔 🏓 PING 〕══════╗\n║ Measuring...\n╚═══════════════════════╝` }, { quoted: m })
    const _ms = Date.now() - _t
    const _rating = _ms < 200 ? '🟢 Fast' : _ms < 600 ? '🟡 Normal' : '🔴 Slow'
    const _ram = process.memoryUsage()
    const _ramUsed = (_ram.rss / 1024 / 1024).toFixed(1)
    const _pingText = `╔══════〔 🏓 PING 〕══════╗\n║ 📡 Speed   : ${_ms}ms\n║ ${_rating}\n║ ⏱️  Uptime  : ${runtime(process.uptime())}\n║ 💾 RAM     : ${_ramUsed} MB\n╚${'═'.repeat(23)}╝`
    await X.sendMessage(m.chat, { text: _pingText, edit: _sent.key })
} else {
  const responseText = await getServerInfo()
  await X.sendMessage(m.chat, { text: responseText }, { quoted: m })
}
}
break           

case 'totalfitur':{
reply(`╔══〔 📋 TOTAL COMMANDS 〕══╗\n\n║ *${totalfitur()}* commands available\n╚═══════════════════════╝`)
}
break   

case 'getcmd': {
  await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
  if (!text) return reply(`╔══〔 🔍 GET COMMAND CODE 〕══╗\n\n║ Usage: *${prefix}getcmd [command]*\n║ Example: *${prefix}getcmd play*\n\n║ Returns the real source code for that command.\n╚═══════════════════════╝`)
  const _q = text.trim().toLowerCase().replace(/^\./, '')
  try {
    const _src = fs.readFileSync(__filename, 'utf8')
    const _lines = _src.split('\n')
    // Find the case line — matches  case 'cmd':  or  case "cmd":
    const _caseRe = new RegExp(`^\\s*case\\s+['"]${_q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}['"]\\s*[:{]?`)
    let _startLine = -1
    for (let _i = 0; _i < _lines.length; _i++) {
      if (_caseRe.test(_lines[_i])) { _startLine = _i; break }
    }
    if (_startLine === -1) {
      return reply(`╔═══〔 🔍 NOT FOUND 〕════╗\n\n║ ❌  No case block found for *${_q}*\n║ Check spelling or try ${prefix}menu\n╚═══════════════════════╝`)
    }
    // Walk forward tracking brace depth; stop at top-level  break
    let _depth = 0, _endLine = _lines.length - 1
    for (let _i = _startLine; _i < _lines.length; _i++) {
      for (const _ch of _lines[_i]) {
        if (_ch === '{') _depth++
        else if (_ch === '}') _depth--
      }
      if (_i > _startLine && _depth <= 0 && /^\s*break\b/.test(_lines[_i])) {
        _endLine = _i; break
      }
    }
    let _block = _lines.slice(_startLine, _endLine + 1).join('\n').trimEnd()
    const _totalLines = _endLine - _startLine + 1
    const _MAX_CHARS = 60000
    let _truncNote = ''
    if (_block.length > _MAX_CHARS) {
      _block = _block.slice(0, _MAX_CHARS)
      _block = _block.slice(0, _block.lastIndexOf('\n'))
      _truncNote = `\n\n║ ⚠️ Output truncated — ${_totalLines} lines total`
    }
    reply(`\n${_block}\n${_truncNote}`)
  } catch (_gcErr) {
    reply(`❌ Could not read source: ${_gcErr.message}`)
  }
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// OWNER MENU COMMANDS
// autotyping/faketyping/faketype/ftype handled above

case 'autoreact': {
    await X.sendMessage(m.chat, { react: { text: '👍', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let arArg = (args[0] || '').toLowerCase()
if (!arArg) { reply(`╔══〔 ❤️ AUTO REACT 〕══════╗\n║ 📊 *Status* : ${global.autoReact ? '✅ ON' : '❌ OFF'}\n║ 🎭 *Emoji* : ${global.autoReactEmoji || '👍'}\n╠══〔 📋 USAGE 〕══════════╣\n║ ${prefix}autoreact on/off\n║ ${prefix}autoreact [emoji]\n╚═══════════════════════╝`) }
else if (arArg === 'on') { global.autoReact = true; reply('╔══〔 😊 AUTO REACT 〕══╗\n\n║ Status: ✅ ON\n╚═══════════════════════╝') }
else if (arArg === 'off') { global.autoReact = false; reply('╔══〔 😊 AUTO REACT 〕══╗\n\n║ Status: ❌ OFF\n╚═══════════════════════╝') }
else { global.autoReact = true; global.autoReactEmoji = arArg; reply(`✅ *Auto React ON* : emoji: ${arArg}`) }
} break

case 'channelreact':
case 'autoreactchannel': {
    await X.sendMessage(m.chat, { react: { text: '📡', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _cra = (args[0] || '').toLowerCase()
    const _craJid = global.autoChannelReactJid ? `\n║ 📌 *Channel JID* : ${global.autoChannelReactJid}` : `\n║ 📌 *Channel JID* : Not set (reacts to ALL newsletters)`
    const _craEmojis = (global.autoChannelReactEmojis || ['❤️','🔥','👍','😍','🎉','💯','🙌','⚡','🫶','😎']).join(' ')
    const _craCnt = global.autoChannelReactCount || (global.autoChannelReactEmojis || ['x']).length
    if (!_cra) return reply(`╔══〔 📡 CHANNEL REACT 〕══╗\n║\n║ 📊 *Status* : ${global.autoChannelReact ? '✅ ON' : '❌ OFF'}${_craJid}\n║ 🔢 *Count* : ${_craCnt} reactions/post\n║ 🎭 *Emojis* : ${_craEmojis}\n║\n║ *Usage*\n║ .channelreact on\n║ .channelreact off\n║ .channelreact count 30\n║ .channelreact jid [newsletter-jid]\n║ .channelreact emojis ❤️ 🔥 👍 🎉\n║ .channeljid [channel-link]\n╚══════════════════════╝`);
    if (_cra === 'on') { global.autoChannelReact = true; reply('╔══〔 📡 CHANNEL REACT 〕══╗\n\n║ Status: ✅ ON\n║ Bot will auto-react to\n║ every channel post with\n║ multiple emojis 🔥\n║\n║ Use .channelreact jid to\n║ target a specific channel.\n╚══════════════════════╝') }
    else if (_cra === 'off') { global.autoChannelReact = false; reply('╔══〔 📡 CHANNEL REACT 〕══╗\n\n║ Status: ❌ OFF\n║ Channel auto-react disabled.\n╚══════════════════════╝') }
    else if (_cra === 'jid') {
        if (!args[1]) return reply('❌ Provide the newsletter JID\nExample: .channelreact jid 120363xxxxxxxx@newsletter')
        global.autoChannelReactJid = args[1].trim()
        reply(`✅ *Channel JID set*\n📌 ${global.autoChannelReactJid}\n\nBot will only auto-react to posts from this channel.`)
    } else if (_cra === 'emojis') {
        const _newEmojis = args.slice(1)
        if (!_newEmojis.length) return reply('❌ Provide emojis\nExample: .channelreact emojis ❤️ 🔥 👍 🎉 💯')
        global.autoChannelReactEmojis = _newEmojis
        reply(`✅ *React emojis updated*\n🎭 ${_newEmojis.join(' ')}\n\n${_newEmojis.length} emojis will be sent per channel post.`)
    } else if (_cra === 'count') {
        const _newCnt = parseInt(args[1])
        if (isNaN(_newCnt) || _newCnt < 1 || _newCnt > 200) return reply('❌ Count must be a number between 1 and 200\nExample: .channelreact count 30')
        global.autoChannelReactCount = _newCnt
        reply(`✅ *React count set*\n🔢 ${_newCnt} reactions will be sent per channel post.`)
    } else { global.autoChannelReact = true; reply(`✅ *Channel React ON*\n🎭 Emojis: ${_craEmojis}`) }
} break
case 'channeljid':
case 'getchanneljid': {
    await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    if (!args[0]) return reply('❌ Provide a WhatsApp channel link\n\nExample:\n.channeljid https://whatsapp.com/channel/0029VbCGMJeEquiVSIthcK03')
    const _cjLink = args[0].trim()
    if (!_cjLink.includes('whatsapp.com/channel/')) return reply('❌ Not a valid WhatsApp channel link\nMust contain: whatsapp.com/channel/')
    try {
        const _cjCode = _cjLink.split('whatsapp.com/channel/')[1].split('/')[0].split('?')[0]
        const _cjMeta = await X.newsletterMetadata('invite', _cjCode)
        const _cjJid = _cjMeta.id
        global.autoChannelReactJid = _cjJid
        const _cjName = _cjMeta.name || _cjMeta.title || _cjMeta.subject || _cjMeta.channelName || 'N/A'
        const _cjSubs = ((_cjMeta.subscriberCount ?? _cjMeta.subscribers ?? _cjMeta.followerCount) || 'N/A').toLocaleString ? ((_cjMeta.subscriberCount ?? _cjMeta.subscribers ?? _cjMeta.followerCount) || 0).toLocaleString() : 'N/A'
        const _cjVerif = ((_cjMeta.verification || _cjMeta.verifiedName || '') === 'VERIFIED') ? 'Yes ✅' : 'No ❌'
        if (_cjName === 'N/A') console.log('[channeljid] raw:', JSON.stringify(_cjMeta).slice(0,400))
        reply(
            `╔══〔 🔍 CHANNEL JID 〕══════╗\n\n` +
            `║ 📛 *Name* : ${_cjName}\n` +
            `║ 🆔 *JID* : ${_cjJid}\n` +
            `║ 👥 *Followers* : ${_cjSubs}\n` +
            `║ ✅ *Verified* : ${_cjVerif}\n` +
            `║\n` +
            `║ ✅ *Auto set as your channel react target*\n` +
            `║ Bot will now react to posts from this channel.\n` +
            `╚═══════════════════════════╝`
        )
    } catch (e) { reply('❌ Could not fetch channel info.\nCheck the link and try again.') }
} break


case 'pmblocker': {
    await X.sendMessage(m.chat, { react: { text: '🚫', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let pbArg = (args[0] || '').toLowerCase()
if (pbArg === 'on') { global.pmBlocker = true; reply('╔══〔 🛡️ PM BLOCKER 〕══╗\n\n║ Status: ✅ ON\n║ Non-owner PMs will be blocked.\n╚═══════════════════════╝') }
else if (pbArg === 'off') { global.pmBlocker = false; reply('╔══〔 🛡️ PM BLOCKER 〕══╗\n\n║ Status: ❌ OFF\n╚═══════════════════════╝') }
else reply(`╔══〔 🚫 PM BLOCKER 〕═════╗\n║ 📊 *Status* : ${global.pmBlocker ? '✅ ON' : '❌ OFF'}\n║ Usage: *${prefix}pmblocker on/off*\n╚═══════════════════════╝`)
} break

case 'blocklist': {
    await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    try {
        const _blist = await X.fetchBlocklist()
        if (!_blist || !_blist.length) return reply(`╔═══〔 📋 BLOCK LIST 〕═══╗\n\n║ ✅ No blocked contacts.\n╚═══════════════════════╝`)
        const _blines = _blist.map((j, idx) => `  ${idx + 1}. +${j.split('@')[0]}`).join('\n')
        reply(`╔═══〔 📋 BLOCK LIST 〕═══╗\n\n║ Total: ${_blist.length} blocked\n\n${_blines}\n╚═══════════════════════╝`)
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
    if (!jid) return null
    const raw = jid.split('@')[0].split(':')[0]
    if (raw.length > 15) return null  // LID — not a real phone number
    return '+' + raw
}
const _ppLabel = async (jid) => {
    if (!jid) return 'Unknown'
    const isLid = jid.endsWith('@lid')
    if (isLid) {
        const lidNum = jid.split('@')[0]
        // TIER 1: resolve via group participant list — match on p.lid (correct field)
        try {
            if (m.isGroup && participants) {
                const match = participants.find(p =>
                    (p.lid && p.lid.split('@')[0] === lidNum) ||
                    (p.id && !p.id.endsWith('@lid') && p.id.split('@')[0] === lidNum)
                )
                if (match && match.id && !match.id.endsWith('@lid')) {
                    const resolvedJid = match.id
                    const num = '+' + resolvedJid.split('@')[0]
                    const sc = store?.contacts?.[resolvedJid]
                    const sn = sc?.name || sc?.notify || sc?.verifiedName
                    return sn ? `${sn} (${num})` : num
                }
            }
        } catch {}
        // TIER 2: store.contacts keyed by LID directly
        const lidSc = store?.contacts?.[jid]
        if (lidSc) {
            const sn = lidSc?.name || lidSc?.notify || lidSc?.verifiedName
            const num = _ppNum(lidSc?.id || '')
            if (sn && num) return `${sn} (${num})`
            if (sn) return sn
            if (num) return num
        }
        // TIER 3: scan store.contacts for a contact whose .lid matches
        if (store?.contacts) {
            for (const [cjid, c] of Object.entries(store.contacts)) {
                if (c?.lid && c.lid.split('@')[0] === lidNum) {
                    const num = '+' + cjid.split('@')[0]
                    const sn = c?.name || c?.notify || c?.verifiedName
                    return sn ? `${sn} (${num})` : num
                }
            }
        }
        // TIER 4: unresolvable LID — we have no phone number
        return 'Unsaved Contact'
    }
    // Non-LID JID — phone number is always extractable
    const num = _ppNum(jid)
    const sc = store?.contacts?.[jid]
    const storeName = sc?.name || sc?.notify || sc?.verifiedName
    if (storeName) return num ? `${storeName} (${num})` : storeName
    // Fallback: use pushName from the message if this is the sender
    if (jid === m.sender && m.pushName) return num ? `${m.pushName} (${num})` : m.pushName
    return num || 'Unsaved Contact'
}
// Resolve LID JID to real phone JID before fetching profile picture
const _resolveTarget = (jid) => {
    if (!jid) return null
    if (jid.endsWith('@lid') && m.isGroup && participants) {
        const lidNum = jid.split('@')[0]
        const real = participants.find(p =>
            p.id && !p.id.endsWith('@lid') && p.lid && p.lid.split('@')[0] === lidNum
        )
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
    return reply(`╔══〔 🖼️  PROFILE PICTURE 〕══╗\n\n║ ❌ *No profile picture for ${label}*\n║ _Privacy restrictions or not on WhatsApp._\n╚═══════════════════════╝`)
}
let ppBuf = await getBuffer(ppUrl)
if (!ppBuf || ppBuf.length < 100) throw new Error('Failed to download picture')
await X.sendMessage(m.chat, {
    image: ppBuf,
    caption: `╔══〔 🖼️  PROFILE PICTURE 〕══╗\n\n║ 👤 *User* : ${label}\n╚═══════════════════════╝`
}, { quoted: m })
} catch(e) {
reply(`❌ *Failed to fetch profile picture.*
_${e.message || 'User may have privacy restrictions.'}_`)
}
} break

case 'setpp': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
if (!m.quoted || !/image/.test(m.quoted.mimetype || '')) return reply(`╔══〔 🖼️  SET BOT PROFILE PIC 〕══╗\n\n║ Reply to an image with *${prefix}setpp*\n║ _Image will be set as the bot profile picture._\n╚═══════════════════════╝`)
try {
let imgBuf = await m.quoted.download()
if (!imgBuf || imgBuf.length < 100) throw new Error('Failed to download image')
await X.updateProfilePicture(X.user.id, imgBuf)
reply(`╔══〔 🖼️  PROFILE PIC UPDATED 〕══╗\n\n║ ✅ Bot profile picture updated successfully.\n║ _Changes may take a moment to appear._\n╚═══════════════════════╝`)
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
} else reply('╔══〔 ⚠️ SESSION 〕══╗\n\n║ No sessions directory found.\n╚═══════════════════════╝')
} catch(e) { reply('❌ Error: ' + e.message) }
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
} else reply('╔══〔 ⚠️ TEMP DIR 〕══╗\n\n║ No tmp directory found.\n╚═══════════════════════╝')
} catch(e) { reply('❌ Error: ' + e.message) }
} break

case 'sudo': {
    await X.sendMessage(m.chat, { react: { text: '🛡️', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _sdPath = require('path').join(__dirname, 'database', 'sudoUsers.json')
    const _sdRead = () => { try { return JSON.parse(fs.readFileSync(_sdPath, 'utf-8')) } catch { return [] } }
    const _sdWrite = d => { fs.mkdirSync(require('path').join(__dirname, 'database'), { recursive: true }); fs.writeFileSync(_sdPath, JSON.stringify(d, null, 2)) }
    const _sdAction = (args[0] || '').toLowerCase()

    // .sudo list / .sudo (no args)
    if (!_sdAction || _sdAction === 'list') {
        let _sdList = _sdRead()
        const _sdEnvList = (process.env.SUDO_USERS || '').split(',').map(s => s.trim()).filter(Boolean).map(s => s.includes('@') ? s : s.replace(/\D/g,'') + '@s.whatsapp.net')
        const _sdAll = [...new Set([..._sdList, ..._sdEnvList])]
        if (!_sdAll.length) return reply(`╔══〔 🛡️ SUDO USERS 〕════╗\n\n║ _No sudo users added yet._\n║ ${prefix}sudo add @user\n╚═══════════════════════╝`)
        await X.sendMessage(m.chat, {
            text: `╔══〔 🛡️ SUDO USERS 〕════╗\n\n${_sdAll.map((u,i) => `  ${i+1}. @${u.split('@')[0]}${_sdEnvList.includes(u) ? ' 🔒' : ''}`).join('\n')}\n\n║ _Total: ${_sdAll.length} sudo user(s)_\n║ _🔒 = permanent (SUDO_USERS env var)_\n╚═══════════════════════╝`,
            mentions: _sdAll
        }, { quoted: m })

    // .sudo add @user / .sudo add 254xxx
    } else if (_sdAction === 'add') {
        let _sdTarget = (m.mentionedJid && m.mentionedJid[0])
            || (m.quoted && m.quoted.sender)
            || (args[1] && args[1].replace(/\D/g,'') + '@s.whatsapp.net')
        if (!_sdTarget || _sdTarget === '@s.whatsapp.net') return reply(`╔══〔 🛡️ ADD SUDO 〕══════╗\n\n║ Usage: *${prefix}sudo add @user*\n║ Or: *${prefix}sudo add 254xxxxxxx*\n║ Or reply to a message\n╚═══════════════════════╝`)
        let _sdList = _sdRead()
        if (_sdList.includes(_sdTarget)) return reply(`⚠️ @${_sdTarget.split('@')[0]} is already a sudo user.`)
        _sdList.push(_sdTarget)
        _sdWrite(_sdList)
        await X.sendMessage(m.chat, { text: `╔══〔 ✅ SUDO ADDED 〕════╗\n\n║ 🛡️ @${_sdTarget.split('@')[0]} is now a *sudo user*!\n║ Total: ${_sdList.length} user(s)\n║\n║ ⚠️ *To make permanent* (survives restarts):\n║ Add to *SUDO_USERS* env var:\n║ ${_sdTarget.split('@')[0]}\n╚═══════════════════════╝`, mentions: [_sdTarget] }, { quoted: m })

    // .sudo remove / .sudo del @user
    } else if (_sdAction === 'remove' || _sdAction === 'del') {
        let _sdTarget = (m.mentionedJid && m.mentionedJid[0])
            || (m.quoted && m.quoted.sender)
            || (args[1] && args[1].replace(/\D/g,'') + '@s.whatsapp.net')
        if (!_sdTarget || _sdTarget === '@s.whatsapp.net') return reply(`╔══〔 🔓 REMOVE SUDO 〕═══╗\n\n║ Usage: *${prefix}sudo remove @user*\n║ Or: *${prefix}sudo remove 254xxxxxxx*\n║ Or reply to a message\n╚═══════════════════════╝`)
        let _sdList = _sdRead()
        const _sdIdx = _sdList.indexOf(_sdTarget)
        if (_sdIdx === -1) return reply(`⚠️ @${_sdTarget.split('@')[0]} is not a sudo user.`)
        _sdList.splice(_sdIdx, 1)
        _sdWrite(_sdList)
        await X.sendMessage(m.chat, { text: `╔══〔 🔓 SUDO REMOVED 〕══╗\n\n║ @${_sdTarget.split('@')[0]} removed from *sudo*!\n║ Total sudo users: ${_sdList.length}\n╚═══════════════════════╝`, mentions: [_sdTarget] }, { quoted: m })

    } else {
        reply(`╔══〔 🛡️ SUDO MANAGER 〕══╗\n\n║ ${prefix}sudo           — list all sudo users\n║ ${prefix}sudo add @user  — grant sudo access\n║ ${prefix}sudo remove @user — revoke sudo access\n╠══〔 💡 TIPS 〕═══════════╣\n║ You can @mention, reply to a\n║ message, or use the number directly.\n╚═══════════════════════╝`)
    }
} break

case 'setowner': {
    await X.sendMessage(m.chat, { react: { text: '👑', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let newOwner = (args[0] || '').replace(/[^0-9]/g, '')
if (!newOwner) return reply(`╔═══〔 👑 SET OWNER 〕════╗\n\n║ Current: *${global.ownerNumber}*\n║ Usage: *${prefix}setowner [number]*\n╚═══════════════════════╝`)
global.ownerNumber = newOwner
if (!global.owner.includes(newOwner)) global.owner.push(newOwner)
reply(`✅ *Owner updated* : ${newOwner}`)
} break

case 'setmenu': {
    await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
reply('*Menu Categories:*\nai, tools, owner, group, downloader, search, sticker, games, other, fun, anime, textmaker, imgedit, github, converter\n\nUse .menu [category] to view specific menus.')
} break

case 'menuimage': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    if (m.quoted && /image/.test(mime)) {
        try {
            const _miBuf = await quoted.download()
            if (!_miBuf || _miBuf.length < 100) throw new Error('Failed to download image')
            const _miPath = path.join(__dirname, 'media', 'menu_thumb.jpg')
            fs.writeFileSync(_miPath, _miBuf)
            global.menuThumb = _miPath
            reply('✅ *Menu image updated!* It will now show in .menu')
        } catch(e) { reply('❌ Error: ' + e.message) }
    } else if (args[0]) {
        global.menuThumb = args[0]
        reply(`✅ *Menu image URL set.*`)
    } else reply(`Reply to an image or provide URL: ${prefix}menuimage [url]`)
} break

case 'configimage': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
reply(`╔══〔 🖼️ IMAGE CONFIG 〕═══╗\n║ 🖼️ *Menu Thumb* : ${global.menuThumb || global.thumb}\n║ 🤖 *Bot Pic* : ${global.botPic || 'Default'}\n╠══〔 📋 USAGE 〕══════════╣\n║ ${prefix}menuimage — change menu image\n║ ${prefix}botpic    — change bot picture\n╚═══════════════════════╝`)
} break

case 'botmode':
  case 'setmode':
  case 'mode': {
      await X.sendMessage(m.chat, { react: { text: '⚙️', key: m.key } })
      if (!isOwner) return reply(mess.OnlyOwner)
      let modeArg = (args[0] || '').toLowerCase()
      const _validModes = ['public', 'groups', 'dms', 'silent', 'private', 'default', 'buttons', 'channel']

      // Helper: send interactive quick-reply button panel
      const _sendBtnPanel = async () => {
          let _curMode = global.BOT_MODE || (X.public === false ? 'silent' : 'public')
          try {
              await X.sendMessage(m.chat, {
                  interactiveMessage: {
                      body: { text: `✅ *Buttons Mode Activated*\n\nTap any button to switch mode` },
                      footer: { text: `${global.botname || 'TOOSII-XD ULTRA'} • Current: ${_curMode.toUpperCase()}` },
                      nativeFlowMessage: {
                          buttons: [
                              { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🌐 Public',  id: `${prefix}mode public`   }) },
                              { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '💬 DMs',     id: `${prefix}mode dms`      }) },
                              { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👥 Groups',  id: `${prefix}mode groups`   }) },
                              { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🔕 Silent',  id: `${prefix}mode silent`   }) },
                              { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '⚫ Buttons', id: `${prefix}mode buttons`  }) },
                              { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📡 Channel', id: `${prefix}mode channel`  }) },
                              { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📝 Default', id: `${prefix}mode default`  }) },
                          ]
                      }
                  }
              }, { quoted: m })
          } catch (_btnErr) {
              let _curMode2 = global.BOT_MODE || (X.public === false ? 'silent' : 'public')
              reply(`╔═══〔 ⚙️  BOT MODE 〕═══╗\n\n║ 📊 *Current Mode* : ${_curMode2.toUpperCase()}\n║\n║ 📌 *Available Modes:*\n║ ${prefix}mode public / groups / dms / silent / channel / default / buttons\n╚═══════════════════════╝`)
          }
      }

      if (!modeArg) {
          if (global.BOT_BUTTONS_MODE) {
              await _sendBtnPanel()
          } else {
              let _curMode = global.BOT_MODE || (X.public === false ? 'silent' : 'public')
              reply(`╔═══〔 ⚙️  BOT MODE 〕═══╗\n\n║ 📊 *Current Mode* : ${_curMode.toUpperCase()}\n║\n║ 📌 *Available Modes:*\n║ ${prefix}mode public / groups / dms / silent / channel / default / buttons\n╚═══════════════════════╝`)
          }
      } else if (modeArg === 'buttons') {
          global.BOT_BUTTONS_MODE = !global.BOT_BUTTONS_MODE
          if (global.BOT_BUTTONS_MODE) {
              await reply(`✅ *Buttons Mode Activated*\n\nTap any button to switch mode`)
              await _sendBtnPanel()
          } else {
              reply(`❌ *Buttons Mode Deactivated*\n\nMode panel will now show as plain text.`)
          }
      } else if (modeArg === 'public') {
          X.public = true
          global.BOT_MODE = 'public'
          if (global.BOT_BUTTONS_MODE) {
              await reply(`╔══〔 🌐 BOT MODE: PUBLIC 〕══╗\n\n║ ✅ *Activated*\n║ All users can use bot commands.\n╚═══════════════════════╝`)
              await _sendBtnPanel()
          } else {
              reply(`╔══〔 🌐 BOT MODE: PUBLIC 〕══╗\n\n║ ✅ *Activated*\n║ All users can use bot commands.\n╚═══════════════════════╝`)
          }
      } else if (modeArg === 'default') {
          X.public = true
          global.BOT_MODE = 'public'
          if (global.BOT_BUTTONS_MODE) {
              await reply(`╔══〔 📝 BOT MODE: DEFAULT 〕══╗\n\n║ ✅ *Activated*\n║ All users can use bot commands.\n╚═══════════════════════╝`)
              await _sendBtnPanel()
          } else {
              reply(`╔══〔 📝 BOT MODE: DEFAULT 〕══╗\n\n║ ✅ *Activated*\n║ All users can use bot commands.\n╚═══════════════════════╝`)
          }
      } else if (modeArg === 'private' || modeArg === 'silent') {
          X.public = false
          global.BOT_MODE = 'silent'
          if (global.BOT_BUTTONS_MODE) {
              await reply(`╔══〔 🔕 BOT MODE: SILENT 〕══╗\n\n║ ✅ *Activated*\n║ Only the owner and sudo users can use commands.\n╚═══════════════════════╝`)
              await _sendBtnPanel()
          } else {
              reply(`╔══〔 🔕 BOT MODE: SILENT 〕══╗\n\n║ ✅ *Activated*\n║ Only the owner and sudo users can use commands.\n╚═══════════════════════╝`)
          }
      } else if (modeArg === 'groups') {
          X.public = true
          global.BOT_MODE = 'groups'
          if (global.BOT_BUTTONS_MODE) {
              await reply(`╔══〔 👥 BOT MODE: GROUPS 〕══╗\n\n║ ✅ *Activated*\n║ Bot responds only in group chats.\n║ Private messages are ignored.\n╚═══════════════════════╝`)
              await _sendBtnPanel()
          } else {
              reply(`╔══〔 👥 BOT MODE: GROUPS 〕══╗\n\n║ ✅ *Activated*\n║ Bot responds only in group chats.\n║ Private messages are ignored.\n╚═══════════════════════╝`)
          }
      } else if (modeArg === 'dms') {
          X.public = true
          global.BOT_MODE = 'dms'
          if (global.BOT_BUTTONS_MODE) {
              await reply(`╔══〔 💬 BOT MODE: DMs 〕══╗\n\n║ ✅ *Activated*\n║ Bot responds only in private chats.\n║ Group messages are ignored.\n╚═══════════════════════╝`)
              await _sendBtnPanel()
          } else {
              reply(`╔══〔 💬 BOT MODE: DMs 〕══╗\n\n║ ✅ *Activated*\n║ Bot responds only in private chats.\n║ Group messages are ignored.\n╚═══════════════════════╝`)
          }
      } else if (modeArg === 'channel') {
          X.public = true
          global.BOT_MODE = 'channel'
          if (global.BOT_BUTTONS_MODE) {
              await reply(`╔══〔 📡 BOT MODE: CHANNEL 〕══╗\n\n║ ✅ *Activated*\n║ Bot responds only in channels/newsletters.\n║ Groups and DMs are ignored.\n╚═══════════════════════╝`)
              await _sendBtnPanel()
          } else {
              reply(`╔══〔 📡 BOT MODE: CHANNEL 〕══╗\n\n║ ✅ *Activated*\n║ Bot responds only in channels/newsletters.\n║ Groups and DMs are ignored.\n╚═══════════════════════╝`)
          }
      } else {
          reply(`╔══〔 ❌ INVALID MODE 〕══╗\n\n║ Usage: *${prefix}mode public / groups / dms / silent / channel / default / buttons*\n╚═══════════════════════╝`)
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
if (!banUser) return reply(`╔════〔 🚫 BAN USER 〕════╗\n\n║ Usage: *${prefix}ban @user*\n╚═══════════════════════╝`)
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
if (!unbanUser) return reply(`╔═══〔 ✅ UNBAN USER 〕════╗\n\n║ Usage: *${prefix}unban @user*\n╚═══════════════════════╝`)
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
        return reply(`╔══〔 🎭 ANTI SOCIAL GAMES 〕══╗\n\n║ 📊 *Status* : *${_on}*\n\n║ _When ON, blocks:_\n║ .vibe
║ .rizz
║ .iq\n║ .ship
║ .simp
║ .wasted\n║ .truth
║ .dare
║ .lolice\n\n║ _Removed offensive aliases:_\n║ .gay   (now .vibe)\n║ .horny (now .rizz)\n\n║ ${prefix}antisocialgames on\n║ ${prefix}antisocialgames off
╚═══════════════════════╝`)
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
else reply(`╔══〔 🛡️ ANTI BADWORD 〕══╗\n║ 📊 *Status* : ${global.antiBadword ? '✅ ON' : '❌ OFF'}\n║ Usage: *${prefix}antibadword on/off*\n╚═══════════════════════╝`)
} break

case 'antitag': {
    await X.sendMessage(m.chat, { react: { text: '🏷️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let atgArg = (args[0] || '').toLowerCase()
if (atgArg === 'on') { global.antiTag = true; reply('🛡️ *Anti Tag ON* — Mass tagging will be detected.') }
else if (atgArg === 'off') { global.antiTag = false; reply('❌ *Anti Tag OFF*') }
else reply(`╔══〔 🏷️ ANTI TAG 〕══════╗\n║ 📊 *Status* : ${global.antiTag ? '✅ ON' : '❌ OFF'}\n║ Usage: *${prefix}antitag on/off*\n╚═══════════════════════╝`)
} break

case 'antisticker': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let asArg = (args[0] || '').toLowerCase()
if (asArg === 'on') { global.antiSticker = true; reply('🛡️ *Anti Sticker ON* — Stickers will be deleted.') }
else if (asArg === 'off') { global.antiSticker = false; reply('❌ *Anti Sticker OFF*') }
else reply(`╔══〔 🖼️ ANTI STICKER 〕══╗\n║ 📊 *Status* : ${global.antiSticker ? '✅ ON' : '❌ OFF'}\n║ Usage: *${prefix}antisticker on/off*\n╚═══════════════════════╝`)
} break

case 'antidemote': {
    await X.sendMessage(m.chat, { react: { text: '⚠️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let adArg2 = (args[0] || '').toLowerCase()
if (adArg2 === 'on') { global.antiDemote = true; reply('🛡️ *Anti Demote ON* — Demoted admins will be re-promoted.') }
else if (adArg2 === 'off') { global.antiDemote = false; reply('❌ *Anti Demote OFF*') }
else reply(`╔══〔 ⚠️ ANTI DEMOTE 〕═══╗\n║ 📊 *Status* : ${global.antiDemote ? '✅ ON' : '❌ OFF'}\n║ Usage: *${prefix}antidemote on/off*\n╚═══════════════════════╝`)
} break

case 'setgdesc': {
    await X.sendMessage(m.chat, { react: { text: '📝', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
if (!isBotAdmins) return reply(mess.botAdmin)
if (!text) return reply(`╔══〔 ✏️ SET GROUP DESC 〕══╗\n\n║ Usage: *${prefix}setgdesc [description]*\n╚═══════════════════════╝`)
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
if (!text) return reply(`╔══〔 ✏️  SET GROUP NAME 〕══╗\n\n║ *Usage:* ${prefix}setgname [new name]\n║ _Example: ${prefix}setgname My Awesome Group_\n╚═══════════════════════╝`)
try {
let oldName = groupName || 'Unknown'
await X.groupUpdateSubject(m.chat, text)
reply(`╔══〔 ✏️  GROUP NAME UPDATED 〕══╗\n\n║ 📛 *Old* : ${oldName}\n║ ✅ *New* : ${text}\n\n║ _Group name successfully changed._\n╚═══════════════════════╝`)
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
if (!m.quoted || !/image/.test(m.quoted.mimetype || '')) return reply(`╔══〔 🖼️  SET GROUP PHOTO 〕══╗\n\n║ Reply to an image with *${prefix}setgpp*\n║ _Image will be set as group profile picture._\n╚═══════════════════════╝`)
try {
let media = await m.quoted.download()
await X.updateProfilePicture(m.chat, media)
reply(`╔══〔 🖼️  GROUP PHOTO UPDATED 〕══╗\n\n║ ✅ *${groupName || 'Group'}* profile picture updated.\n╚═══════════════════════╝`)
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
reply(`╔══〔 🔄 GROUP LINK RESET 〕══╗\n\n║ ✅ Old link revoked, new link generated.\n\n║ 🔗 https://chat.whatsapp.com/${newCode}\n\n║ _Share to invite new members._\n╚═══════════════════════╝`)
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
reply(`╔══〔 🔗 GROUP INVITE LINK 〕══╗\n\n║ 🏘️  *Group* : ${groupName || 'This Group'}\n║ 👥 *Members* : ${memberCount}\n\n║ 🔗 https://chat.whatsapp.com/${code}\n\n║ _Use ${prefix}resetlink to revoke & regenerate._\n╚═══════════════════════╝`)
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
    reply(`╔══〔 👋 GOODBYE MESSAGES 〕══╗\n\n║ ✅ *Enabled in ${groupName || 'this group'}*\n║ _Bot will farewell departing members._\n╚═══════════════════════╝`)
} else if (gbArg === 'off') {
    global.goodbye = false
    reply(`╔══〔 👋 GOODBYE MESSAGES 〕══╗\n\n║ ❌ *Disabled in ${groupName || 'this group'}*\n║ _Goodbye messages turned off._\n╚═══════════════════════╝`)
} else {
    let gbState = (global.goodbye ?? global.welcome) ? '✅ ON' : '❌ OFF'
    reply(`╔══〔 👋 GOODBYE MESSAGES 〕══╗\n\n║ 📊 *Status* : ${gbState}\n║ Farewells departing members\n\n║ ${prefix}goodbye on  — Enable\n║ ${prefix}goodbye off — Disable\n╚═══════════════════════╝`)
}
} break

// GROUP TOOLS COMMANDS
case 'everyone':
case 'all':
case 'tageveryone':
case 'mentionall':
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
if (!text) return reply(`╔════〔 📣 TAG ALL 〕═════╗\n\n║ Usage: *${prefix}tag [message]*\n╚═══════════════════════╝`)
let tagMentions = participants.map(p => p.id).filter(id => !id.endsWith('@newsletter'))
X.sendMessage(from, { text: text, mentions: tagMentions }, { quoted: m })
} break

case 'hidetag': {
    await X.sendMessage(m.chat, { react: { text: '🏷️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let htText = text || '​'  // zero-width space: invisible but non-empty, bypasses empty guard
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

case 'hiall':
case 'hiko':
case 'mention': {
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!text) return reply(`╔══〔 📢 MENTION ALL 〕═══╗\n\n║ Usage: *${prefix}mention [message]*\n╚═══════════════════════╝`)
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
        ? `\n║ ⚠️ ${totalParticipants - contacts.size} member(s) hidden by WhatsApp privacy mode`
        : `\n║ Import the file into your phone contacts`
    await X.sendMessage(from, {
        document: vcfBuf,
        mimetype: 'text/x-vcard',
        fileName: `${gname}_contacts.vcf`,
        caption: `📋 *${freshMeta.subject}*\n\n║ 👥 *${contacts.size}/${totalParticipants} contacts* exported${note}`
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
reply('╔══〔 🚪 LEAVE GROUP 〕══╗\n\n║ Bot is leaving this group...\n╚═══════════════════════╝')
await delay(2000)
await X.groupLeave(m.chat)
} catch(err) { reply('❌ Failed to leave: ' + err.message) }
} break

case 'pair': {
      await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
      await reply(
          `╔══〔 🔗 PAIRING SITE 〕══╗\n` +
          `║\n` +
          `║  Click the link below to get your pairing code:\n` +
          `║\n` +
          `║  🌐 ${global.sessionUrl || 'https://toosii-xd-session-generator-woyo.onrender.com/pair'}\n` +
          `║\n` +
          `║  📱 Enter your WhatsApp number\n` +
          `║  📋 Copy the code shown\n` +
          `║  🔗 WhatsApp → Linked Devices → Link with phone number\n` +
          `║\n` +
          `╚═══════════════════════╝`
      )
  } break

case 'clear': {
    await X.sendMessage(m.chat, { react: { text: '🗑️', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
reply('╔══〔 🗑️ CLEAR CHAT 〕══╗\n\n║ ✅ Chat cleared.\n║ Note: WhatsApp does not support\n║ remote chat clearing.\n╚═══════════════════════╝')
} break

//━━━━━━━━━━━━━━━━━━━━━━━//
// Additional AI Commands
case 'copilot':{
  if (!text) return reply(`╔══〔 🪁 COPILOT 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🪁', key: m.key } })
    let _cpResult = null
    // Source 1: EliteProTech Copilot (primary — live & direct)
    try {
      let _ep = await fetch(`https://eliteprotech-apis.zone.id/copilot?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(25000) })
      let _epd = await _ep.json()
      if (_epd.success && _epd.text) _cpResult = _epd.text
    } catch {}
    // Source 2: _runAI fallback
    if (!_cpResult) {
      try { _cpResult = await _runAI('You are Microsoft Copilot, a helpful AI assistant. Be productive, accurate and helpful.', text) } catch {}
    }
    if (_cpResult) reply(_cpResult)
    else reply('❌ Copilot is currently unavailable. Please try again.')
  } catch (e) {
    console.error('[COPILOT ERROR]', e.message)
    reply('❌ Copilot is currently unavailable. Please try again.')
  }
}
break

  case 'gemini':{
    if (!text) return reply(`╔══〔 ♊ GEMINI AI 〕══╗\n\n║ Usage: *${prefix}${command} [question]*\n║ Example: ${prefix}${command} What is the capital of Kenya?\n╚═══════════════════════╝`)
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
if (!m.quoted || !/image/.test(m.quoted.mimetype || '')) return reply(`╔══〔 🔍 IMAGE ANALYSIS 〕══╗\n\n║ Reply to an image with *${prefix}${command}*\n║ _Optionally add a question after the command._\n╚═══════════════════════╝`)
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
reply(`╔══〔 🔍 IMAGE ANALYSIS 〕══╗\n\n${desc}\n╚═══════════════════════╝`)
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
reply(`╔══〔 🔍 IMAGE ANALYSIS 〕══╗\n\n${desc2}\n╚═══════════════════════╝`)
} catch(e2) {
reply(`❌ *Vision analysis failed.*\n_${e2.message || 'Unable to analyse image. Try again shortly.'}_`)
}
}
} break

case 'wormgpt':{
  if (!text) return reply(`╔══〔 🪱 WORM GPT 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🪱', key: m.key } })
    let _kResultwormgpt = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/wormgpt?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultwormgpt = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultwormgpt) return reply(_kResultwormgpt)
    const result = await _runAI('You are WormGPT, a creative and unrestricted AI assistant. Answer all questions helpfully.', text)
    reply(result)
  } catch (e) {
    console.error('[WORMGPT ERROR]', e.message)
    reply('❌ wormgpt is currently unavailable. Please try again.')
  }
}
break

case 'birdai':{
  if (!text) return reply(`╔══〔 🐦 BIRD AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
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
  if (!text) return reply(`╔══〔 🔭 PERPLEXITY 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🔮', key: m.key } })
    let _kResultperplexity = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/perplexity?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultperplexity = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultperplexity) return reply(_kResultperplexity)
    const result = await _runAI('You are Perplexity AI, a research AI. Provide well-researched answers with clear explanations.', text)
    reply(result)
  } catch (e) {
    console.error('[PERPLEXITY ERROR]', e.message)
    reply('❌ perplexity is currently unavailable. Please try again.')
  }
}
break

case 'mistral':{
  if (!text) return reply(`╔══〔 ⚡ MISTRAL AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🌪️', key: m.key } })
    let _kResultmistral = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/mistral?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultmistral = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultmistral) return reply(_kResultmistral)
    const result = await _runAI('You are Mistral AI, a powerful and efficient language model. Provide accurate, nuanced responses.', text)
    reply(result)
  } catch (e) {
    console.error('[MISTRAL ERROR]', e.message)
    reply('❌ mistral is currently unavailable. Please try again.')
  }
}
break

case 'grok':{
  if (!text) return reply(`╔══〔 🔬 GROK AI 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Hello, how are you?\n╚═══════════════════════╝`)
  try {
    await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
    let _kResultgrok = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/grok?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultgrok = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultgrok) return reply(_kResultgrok)
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
if (!text) return reply(`╔══〔 🎤 SPEECH WRITER 〕══╗\n\n║ *Usage:* ${prefix}speechwrite [topic]\n\n║ _Examples:_\n║ • graduation ceremony about perseverance\n║ • wedding toast for my best friend\n║ • motivational speech for a sports team\n╚═══════════════════════╝`)
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
reply(`╔══〔 🎤 YOUR SPEECH 〕═══╗\n\n${speech}\n\n_Generated by TOOSII-XD ULTRA_\n╚═══════════════════════╝`)
} catch(e) { reply('❌ *Speech generation failed.*\n_' + (e.message || 'Try again shortly.') + '_') }
} break

case 'imagine':
case 'flux': {
    await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
    // Resolve prompt — typed text > quoted text > quoted image caption
    let _imgPrompt = text
    if (!_imgPrompt && m.quoted) {
        const _qBody = m.quoted.text || m.quoted.caption || ''
        if (_qBody.trim()) {
            _imgPrompt = _qBody.trim()
        } else if (/image/.test(mime)) {
            return reply(`╔══〔 🎨 IMAGINE 〕══╗\n\n║ ℹ️ You replied to an image.\n║ Add a description after the command:\n║ *${prefix}imagine [what to generate]*\n╚═══════════════════════╝`)
        }
    }
    if (!_imgPrompt) return reply(`╔══〔 🎨 AI IMAGE GENERATOR 〕══╗\n\n║ *Usage:* ${prefix}${command} [description]\n║ _Or reply to a text/caption with the command_\n\n║ _Examples:_\n║ • a futuristic city at night\n║ • lion wearing a crown, digital art\n║ • sunset over the ocean, photorealistic\n╚═══════════════════════╝`)
    try {
        await reply('🎨 _Generating your image, please wait..._')
        const _imgCaption = `╔══〔 🎨 AI GENERATED IMAGE 〕══╗\n\n║ 📝 *Prompt* : ${_imgPrompt}\n╚═══════════════════════╝`
        let _imgSent = false
        // Source 1: EliteProTech Imagine (primary — returns raw JPEG)
        if (command !== 'flux') {
            try {
                let _epImgRes = await fetch(`https://eliteprotech-apis.zone.id/imagine?prompt=${encodeURIComponent(_imgPrompt)}`, { signal: AbortSignal.timeout(35000) })
                if (_epImgRes.ok) {
                    let _epBuf = Buffer.from(await _epImgRes.arrayBuffer())
                    if (_epBuf && _epBuf.length > 5000) {
                        await X.sendMessage(m.chat, { image: _epBuf, caption: _imgCaption }, { quoted: m })
                        _imgSent = true
                    }
                }
            } catch {}
        }
        // Source 2: Pollinations fallback (also handles .flux)
        if (!_imgSent) {
            let model = command === 'flux' ? 'flux' : 'turbo'
            let seed  = Math.floor(Math.random() * 999999)
            let imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(_imgPrompt)}?model=${model}&width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`
            let imgBuffer = await getBuffer(imgUrl)
            if (!imgBuffer || imgBuffer.length < 5000) throw new Error('Image generation returned empty result')
            await X.sendMessage(m.chat, { image: imgBuffer, caption: _imgCaption + `\n║ 🤖 *Model* : ${model.toUpperCase()}\n║ 🎲 *Seed* : ${seed}` }, { quoted: m })
            _imgSent = true
        }
    } catch(e) {
        // Final fallback: direct URL send
        try {
            let seed2 = Math.floor(Math.random() * 999999)
            let fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(_imgPrompt || text)}?width=1024&height=1024&seed=${seed2}&nologo=true`
            await X.sendMessage(m.chat, { image: { url: fallbackUrl }, caption: `🎨 *Generated:* ${_imgPrompt || text}` }, { quoted: m })
        } catch(e2) { reply(`❌ *Image generation failed.*\n_${e2.message || 'Try again shortly.'}_`) }
    }
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Game Commands
case 'tictactoe':
case 'ttt': {
    await X.sendMessage(m.chat, { react: { text: '❎', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
let tttUser = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null
if (!tttUser) return reply(`╔═══〔 ❎ TIC TAC TOE 〕═══╗\n\n║ Usage: *${prefix}ttt @opponent*\n║ Mention the user you want to play against\n╚═══════════════════════╝`)
if (tttUser === sender) return reply('╔══〔 ⚠️ GAME 〕══╗\n\n║ You cannot play against yourself!\n╚═══════════════════════╝')
if (!global.tttGames) global.tttGames = {}
let gameId = m.chat
if (global.tttGames[gameId]) return reply('╔══〔 ⚠️ TIC-TAC-TOE 〕══╗\n\n║ A game is already in progress.\n║ Use .tttend to end it.\n╚═══════════════════════╝')
global.tttGames[gameId] = { board: [' ',' ',' ',' ',' ',' ',' ',' ',' '], players: { X: sender, O: tttUser }, turn: 'X' }
let boardDisplay = (b) => `\n ${b[0]} | ${b[1]} | ${b[2]}\n---+---+---\n ${b[3]} | ${b[4]} | ${b[5]}\n---+---+---\n ${b[6]} | ${b[7]} | ${b[8]}\n`
X.sendMessage(from, { text: `*Tic Tac Toe*\n\n@${sender.split('@')[0]} (X) vs @${tttUser.split('@')[0]} (O)\n\n${boardDisplay(global.tttGames[gameId].board)}\n\n@${sender.split('@')[0]}'s turn (X)\nReply with a number (1-9) to place your mark.`, mentions: [sender, tttUser] }, { quoted: m })
} break

case 'tttend': {
    await X.sendMessage(m.chat, { react: { text: '🏁', key: m.key } })
if (!global.tttGames || !global.tttGames[m.chat]) return reply('╔══〔 ⚠️ GAME 〕══╗\n\n║ No game in progress.\n╚═══════════════════════╝')
delete global.tttGames[m.chat]
reply('╔══〔 🎮 GAME 〕══╗\n\n║ Game ended.\n╚═══════════════════════╝')
} break

case 'connect4':
case 'c4': {
    await X.sendMessage(m.chat, { react: { text: '🔴', key: m.key } })
reply(`╔═══〔 🔴 CONNECT 4 〕════╗\n\n║ 🔴🟡🔴🟡🔴🟡🔴\n║ ⬜⬜⬜⬜⬜⬜⬜\n║ ⬜⬜⬜⬜⬜⬜⬜\n║ ⬜⬜⬜⬜⬜⬜⬜\n║ ⬜⬜⬜⬜⬜⬜⬜\n║ ⬜⬜⬜⬜⬜⬜⬜\n\n║ 🎮 *Not yet available as a live game.*\n║ Play Tic Tac Toe instead:\n║ *${prefix}ttt* — start a game now!\n╚═══════════════════════╝`)
} break

case 'hangman': {
    await X.sendMessage(m.chat, { react: { text: '🎯', key: m.key } })
if (!global.hangmanGames) global.hangmanGames = {}
if (global.hangmanGames[m.chat]) return reply('╔══〔 ⚠️ HANGMAN 〕══╗\n\n║ A game is already in progress.\n║ Use .hangmanend to end it.\n╚═══════════════════════╝')
let words = ['javascript', 'python', 'programming', 'computer', 'algorithm', 'database', 'internet', 'software', 'hardware', 'keyboard', 'function', 'variable', 'boolean', 'whatsapp', 'telegram', 'android', 'network', 'security', 'elephant', 'universe']
let word = words[Math.floor(Math.random() * words.length)]
global.hangmanGames[m.chat] = { word, guessed: [], lives: 6, players: [sender] }
let display = word.split('').map(l => '_').join(' ')
reply(`╔════〔 🪢 HANGMAN 〕═════╗\n\n║ ${display}\n\n║ ❤️  Lives : 6\n║ 🔡 Letters : ${word.length}\n\n║ _Send a single letter to guess!_\n╚═══════════════════════╝`)
} break

case 'hangmanend': {
    await X.sendMessage(m.chat, { react: { text: '🏁', key: m.key } })
if (!global.hangmanGames || !global.hangmanGames[m.chat]) return reply('╔══〔 ⚠️ HANGMAN 〕══╗\n\n║ No hangman game in progress.\n╚═══════════════════════╝')
reply(`╔═══〔 🏁 GAME ENDED 〕═══╗\n\n║ 🔡 *Word* : *${global.hangmanGames[m.chat].word}*\n╚═══════════════════════╝`)
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
} catch(e) { reply('❌ Error: ' + e.message) }
} break

case 'bored':
case 'activity': {
    await X.sendMessage(m.chat, { react: { text: '🎲', key: m.key } })
    try {
        // Bored API — completely free
        let _br = await fetch('https://bored-api.appbrewery.com/random')
        let _brd = await _br.json()
        let _act = _brd?.activity || _brd?.activity?.activity
        if (!_act) throw new Error('No activity')
        let typeIcon = { education: '📚', recreational: '🎮', social: '👥', diy: '🔨', charity: '💝', cooking: '🍳', relaxation: '🛌', music: '🎵', busywork: '💻' }
        let icon = typeIcon[_brd.type] || '🎲'
        let msg = `╬══〔 ${icon} ACTIVITY SUGGESTION 〕══╬\n\n║ 📍 *Activity:* ${_act}\n║ 🏷️ *Type:* ${_brd.type || 'Fun'}\n║ 👥 *Participants:* ${_brd.participants || 1}\n║ 💰 *Price:* ${(_brd.price === 0 ? 'Free' : '$' + _brd.price) || 'Free'}\n║ 📊 *Accessibility:* ${Math.round((1 - (_brd.accessibility || 0)) * 100)}% easy\n╚═══════════════════════╝`
        await reply(msg)
    } catch { reply('❌ Could not find an activity right now. Try again!') }
} break

case 'dadjoke':
case 'dj': {
    await X.sendMessage(m.chat, { react: { text: '🤣', key: m.key } })
    try {
        // icanhazdadjoke — free, no key
        let _dj = await fetch('https://icanhazdadjoke.com/', { headers: { 'Accept': 'application/json' } })
        let _djd = await _dj.json()
        if (!_djd.joke) throw new Error('No joke')
        await reply(`🤭 *Dad Joke of the Day*\n\n_${_djd.joke}_\n\n🤣 hehe`)
    } catch {
        const _djs = ['Why don\'t scientists trust atoms? Because they make up everything!', 'I\'m reading a book about anti-gravity. It\'s impossible to put down!', 'Why did the math book look so sad? Because it had too many problems.', 'What do you call cheese that isn\'t yours? Nacho cheese!', 'Why can\'t you give Elsa a balloon? Because she\'ll let it go!']
        await reply(`🤭 *Dad Joke*\n\n_${_djs[Math.floor(Math.random() * _djs.length)]}_\n\n🤣 hehe`)
    }
} break

case 'compliment': {
    await X.sendMessage(m.chat, { react: { text: '💜', key: m.key } })
    try {
        // complimentr — free, no key
        let _cr = await fetch('https://complimentr.com/api')
        let _crd = await _cr.json()
        let _cmpl = _crd.compliment
        if (!_cmpl) throw new Error('No compliment')
        let _mention = (m.mentionedJid && m.mentionedJid[0]) ? `@${m.mentionedJid[0].split('@')[0]}` : 'you'
        await reply(`💜 *Compliment for ${_mention}:*\n\n_${_cmpl}_\n\n✨ Have a wonderful day!`, m.mentionedJid || [])
    } catch {
        const _cmpls = ['You have an incredible heart.', 'Your smile lights up the room.', 'You make everything better just by being here.', 'You are stronger than you think.', 'The world is better with you in it.']
        let _mention = (m.mentionedJid && m.mentionedJid[0]) ? `@${m.mentionedJid[0].split('@')[0]}` : 'you'
        await reply(`💜 *Compliment for ${_mention}:*\n\n_${_cmpls[Math.floor(Math.random() * _cmpls.length)]}_\n\n✨ Have a wonderful day!`, m.mentionedJid || [])
    }
} break


case 'advice':
case 'advise': {
    await X.sendMessage(m.chat, { react: { text: '💡', key: m.key } })
    try {
        // adviceslip.com — free, no key
        let _ar = await fetch('https://api.adviceslip.com/advice')
        let _ad = await _ar.json()
        let _advice = _ad?.slip?.advice
        if (!_advice) throw new Error('No advice')
        await reply(`💡 *Daily Advice*\n\n_“${_advice}”_\n\n✨ Hope that helps!`)
    } catch {
        const _advs = ['“Do small things with great love.”', '“Persistence is the key to success.”', '“Kindness is free — sprinkle it everywhere.”', '“Be the change you wish to see in the world.”', '“Every day is a new opportunity to grow.”']
        await reply(`💡 *Advice*\n\n_${_advs[Math.floor(Math.random() * _advs.length)]}_\n\n✨ Hope that helps!`)
    }
} break

case 'numberfact':
case 'numfact': {
    await X.sendMessage(m.chat, { react: { text: '🔢', key: m.key } })
    let _num = parseInt(text) || Math.floor(Math.random() * 1000)
    try {
        // numbersapi.com — free, no key
        let _nr = await fetch(`http://numbersapi.com/${_num}/trivia?json`)
        let _nd = await _nr.json()
        let _nf = _nd.text
        if (!_nf) throw new Error('No fact')
        await reply(`🔢 *Fact about ${_num}*\n\n_${_nf}_`)
    } catch { reply(`🔢 *Fact about ${_num}*\n\n_${_num} is ${_num % 2 === 0 ? 'an even' : 'an odd'} number with ${_num.toString().length} digit(s)._`) }
} break

case 'answer': {
    await X.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
let userAnswer = text?.toLowerCase().trim()
if (!userAnswer) return reply('❌ Please provide your answer. Example: *' + prefix + 'answer Paris*')
// Handle tebakld game
if (global.tebakldGames && global.tebakldGames[m.chat]) {
  let tg = global.tebakldGames[m.chat]
  if (userAnswer === tg.answer) {
    clearTimeout(tg.timeout)
    delete global.tebakldGames[m.chat]
    return reply(`╔══〔 ✅ CORRECT! 〕════════╗
║ 🎉 Well done, @${sender.split('@')[0]}!
║ 🗺️ *Answer:* ${tg.answer.charAt(0).toUpperCase() + tg.answer.slice(1)}
╚═══════════════════════╝`)
  } else {
    return reply(`❌ *Wrong!* Try again or wait for time to run out.`)
  }
}
// Handle tebak game
if (global.tebakGame && global.tebakGame[m.chat]) {
  let tg2 = global.tebakGame[m.chat]
  if (userAnswer === (tg2.answer || tg2.jawaban || '').toLowerCase()) {
    clearTimeout(tg2.timeout)
    delete global.tebakGame[m.chat]
    return reply(`╔══〔 ✅ CORRECT! 〕════════╗
║ 🎉 Well done, @${sender.split('@')[0]}!
╚═══════════════════════╝`)
  } else return reply(`❌ *Wrong!* Try again.`)
}
// Handle trivia
if (!global.triviaGames || !global.triviaGames[m.chat]) return reply('╔══〔 ⚠️ TRIVIA 〕══╗\n\n║ No active game.\n║ Use .trivia or .tebak to start.\n╚═══════════════════════╝')
if (userAnswer === global.triviaGames[m.chat].answer || userAnswer === global.triviaGames[m.chat].answer.charAt(0)) {
clearTimeout(global.triviaGames[m.chat].timeout)
delete global.triviaGames[m.chat]
reply(`╔══〔 ✅ CORRECT! 〕════════╗
║ 🎉 Well done, @${sender.split('@')[0]}!
╚═══════════════════════╝`)
} else reply(`❌ *Wrong!* Try again or wait for timeout.`)
} break

case 'truth': {
    await X.sendMessage(m.chat, { react: { text: '💬', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let truths = ['What is your biggest fear?', 'What is the most embarrassing thing you have done?', 'What is a secret you have never told anyone?', 'Who was your first crush?', 'What is the worst lie you have told?', 'What is your guilty pleasure?', 'Have you ever cheated on a test?', 'What is the most childish thing you still do?', 'What is your biggest insecurity?', 'What was your most awkward date?', 'Have you ever been caught lying?', 'What is the craziest thing on your bucket list?', 'What is the weirdest dream you have had?', 'If you could be invisible for a day what would you do?', 'What is the most stupid thing you have ever done?']
let _truthQ = null
try {
  let _kr = await fetch('https://apiskeith.top/fun/truth', { signal: AbortSignal.timeout(8000) })
  let _kd = await _kr.json()
  if (_kd.status && _kd.result) _truthQ = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
} catch {}
if (!_truthQ) _truthQ = truths[Math.floor(Math.random() * truths.length)]
reply(`╔══〔 💬 TRUTH QUESTION 〕═╗\n║ ❓ ${_truthQ}\n╚═══════════════════════╝`)
} break

case 'dare': {
    await X.sendMessage(m.chat, { react: { text: '🎯', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let dares = ['Send a voice note singing your favorite song.', 'Change your profile picture to something funny for 1 hour.', 'Send the last photo in your gallery.', 'Text your crush right now.', 'Do 10 pushups and send a video.', 'Send a voice note doing your best animal impression.', 'Let someone else send a message from your phone.', 'Share your screen time report.', 'Send a selfie right now without filters.', 'Call the 5th person in your contacts and sing happy birthday.', 'Post a childhood photo in the group.', 'Let the group choose your status for 24 hours.', 'Send a voice note speaking in an accent.', 'Do a handstand and send proof.', 'Type with your eyes closed for the next message.']
let _dareQ = null
try {
  let _kr2 = await fetch('https://apiskeith.top/fun/dare', { signal: AbortSignal.timeout(8000) })
  let _kd2 = await _kr2.json()
  if (_kd2.status && _kd2.result) _dareQ = typeof _kd2.result === 'string' ? _kd2.result : JSON.stringify(_kd2.result)
} catch {}
if (!_dareQ) _dareQ = dares[Math.floor(Math.random() * dares.length)]
reply(`╔══〔 🔥 DARE CHALLENGE 〕══╗\n║ 🎯 ${_dareQ}\n╚═══════════════════════╝`)
} break

  case 'paranoia': {
      await X.sendMessage(m.chat, { react: { text: '😱', key: m.key } })
      try {
          const _pnd = await _keithFetch('/fun/paranoia')
          const _pntxt = typeof _pnd === 'string' ? _pnd : (_pnd?.result || _pnd?.question)
          if (!_pntxt) throw new Error('No question')
          await reply(`╌══〔 😱 PARANOIA 〕══════╌\n\n💬 _Someone just whispered a question about you..._\n\n❓ *${_pntxt}*\n\n🙄 _Only your neighbors know the answer!_\n╚═══════════════════════╝`)
      } catch(e) { reply('❌ Could not get a paranoia question. Try again!') }
  } break

  case 'nhie':
  case 'neverhaveiever': {
      await X.sendMessage(m.chat, { react: { text: '🙅', key: m.key } })
      try {
          const _nhd = await _keithFetch('/fun/never-have-i-ever')
          const _nhtxt = typeof _nhd === 'string' ? _nhd : (_nhd?.result || _nhd?.statement)
          if (!_nhtxt) throw new Error('No statement')
          await reply(`╌══〔 🙅 NEVER HAVE I EVER 〕═╌\n\n✋ _Raise your hand if you have..._\n\n💬 *Never have I ever ${_nhtxt}*\n\n🤫 _Who has done this? React below!_\n╚═══════════════════════╝`)
      } catch(e) { reply('❌ Could not get a NHIE statement. Try again!') }
  } break

  case 'question': {
      await X.sendMessage(m.chat, { react: { text: '🧩', key: m.key } })
      try {
          const _trd = await _keithFetch('/fun/question')
          const _trq = _trd?.question || _trd?.result?.question
          const _tca = _trd?.correctAnswer || _trd?.result?.correctAnswer
          const _tcat = _trd?.category || _trd?.result?.category || 'General'
          if (!_trq) throw new Error('No question')
          await reply(`╌══〔 🧩 TRIVIA 〕════════╌\n\n📚 *Category:* ${_tcat}\n\n❓ *${_trq}*\n\n💡 _Reply with your answer! Correct answer will be revealed!_\n🟢 *Answer:* ||${_tca}||\n╚═══════════════════════╝`)
      } catch(e) { reply('❌ Could not fetch a trivia question. Try again!') }
  } break


case '8ball': {
    await X.sendMessage(m.chat, { react: { text: '🎱', key: m.key } })
if (!text) return reply(`╔══〔 🎱 MAGIC 8-BALL 〕══╗\n\n║ Usage: *${prefix}8ball [your question]*\n║ Example: ${prefix}8ball Will I pass my exam?\n╚═══════════════════════╝`)
let responses8 = ['It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes definitely.', 'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.', 'Don\'t count on it.', 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.']
reply(`╔══〔 🎱 MAGIC 8-BALL 〕══╗\n\n║ ❓ *${text}*\n\n║ 🎱 ${responses8[Math.floor(Math.random() * responses8.length)]}\n╚═══════════════════════╝`)
} break

case 'cf':
case 'coinflip':
case 'flip': {
    await X.sendMessage(m.chat, { react: { text: '🪙', key: m.key } })
let coin = Math.random() < 0.5 ? 'Heads' : 'Tails'
reply(`╔══〔 🪙 COIN FLIP 〕══════╗\n║ Result: *${coin}!*\n╚═══════════════════════╝`)
} break

case 'dice':
case 'roll': {
    await X.sendMessage(m.chat, { react: { text: '🎲', key: m.key } })
let sides = parseInt(args[0]) || 6
let result = Math.floor(Math.random() * sides) + 1
reply(`╔══〔 🎲 DICE ROLL 〕══════╗\n║ 🎲 d${sides} → *${result}*\n╚═══════════════════════╝`)
} break

case 'rps': {
    await X.sendMessage(m.chat, { react: { text: '✊', key: m.key } })
let choices = ['rock', 'paper', 'scissors']
let userChoice = (args[0] || '').toLowerCase()
if (!['rock', 'paper', 'scissors', 'r', 'p', 's'].includes(userChoice)) return reply(`╔══〔 ✊ ROCK PAPER SCISSORS 〕══╗\n\n║ Usage: *${prefix}rps rock/paper/scissors*\n║ Shorthand: r / p / s\n╚═══════════════════════╝`)
if (userChoice === 'r') userChoice = 'rock'
if (userChoice === 'p') userChoice = 'paper'
if (userChoice === 's') userChoice = 'scissors'
let botChoice = choices[Math.floor(Math.random() * 3)]
let rpsResult = userChoice === botChoice ? 'Draw!' : (userChoice === 'rock' && botChoice === 'scissors') || (userChoice === 'paper' && botChoice === 'rock') || (userChoice === 'scissors' && botChoice === 'paper') ? 'You win! 🎉' : 'You lose! 😢'
reply(`╔══〔 ✂️  ROCK PAPER SCISSORS 〕══╗\n\n║ 👤 *You* : ${userChoice}\n║ 🤖 *Bot* : ${botChoice}\n║ 🏆 *${rpsResult}*\n╚═══════════════════════╝`)
} break

case 'slot': {
    await X.sendMessage(m.chat, { react: { text: '🎰', key: m.key } })
let symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '🔔']
let s1 = symbols[Math.floor(Math.random() * symbols.length)]
let s2 = symbols[Math.floor(Math.random() * symbols.length)]
let s3 = symbols[Math.floor(Math.random() * symbols.length)]
let slotWin = s1 === s2 && s2 === s3 ? '🎉 JACKPOT! You won!' : s1 === s2 || s2 === s3 || s1 === s3 ? '😃 Two match! Small win!' : '😢 No match. Try again!'
reply(`╔══〔 🎰 SLOT MACHINE 〕══╗\n\n║ [ ${s1} | ${s2} | ${s3} ]\n\n║ ${slotWin}\n╚═══════════════════════╝`)
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Fun & Social Commands
case 'insult': {
    await X.sendMessage(m.chat, { react: { text: '🗡️', key: m.key } })
    try {
        let _inTxt = null
        const _inkd = await _keithFetch('/fun/insult')
        if (typeof _inkd === 'string') _inTxt = _inkd; else if (_inkd?.insult) _inTxt = _inkd.insult; else if (_inkd?.result) _inTxt = typeof _inkd.result === 'string' ? _inkd.result : _inkd.result?.insult
        if (!_inTxt) {
            let _ingr = await fetch(`${_GTAPI}/api/fun/insult?apikey=${_giftedKey()}`, { signal: AbortSignal.timeout(10000) })
            let _ingd = await _ingr.json()
            if (_ingd.success && _ingd.result) _inTxt = _ingd.result
        }
        if (!_inTxt) throw new Error('No insult')
        const _inTarget = m.quoted?.pushName || mentioned[0] && store.contacts[mentioned[0]]?.name || sender.split('@')[0]
        await reply(`╌══〔 🗡️ INSULT 〕════════╌\n\n@${_inTarget} 👇\n\n_${_inTxt}_\n\n╚═══════════════════════╝`)
    } catch(e) { reply('❌ Could not generate insult. Try again!') }
} break

  case 'story':
  case 'tellstory':
  case 'generatestory': {
      await X.sendMessage(m.chat, { react: { text: '📖', key: m.key } })
      if (!text) return reply(`╔══〔 📖 STORY GENERATOR 〕══╗\n\n║ Usage: *${prefix}story [topic or theme]*\n║ Example: ${prefix}story a hero saves the world\n╚═══════════════════════╝`)
      try {
          await reply('📖 _Writing your story, please wait..._')
          let _epS = await fetch(`https://eliteprotech-apis.zone.id/story?text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(30000) })
          let _epSd = await _epS.json()
          if (_epSd.success && _epSd.story) {
              let _storyText = _epSd.story
              let _header = `╔════〔 📖 AI STORY 〕════╗\n\n`
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
reply(`╔═════〔 💘 FLIRT 〕══════╗\n\n║ ${flirts[Math.floor(Math.random() * flirts.length)]}\n╚═══════════════════════╝`)
} break

case 'shayari': {
    await X.sendMessage(m.chat, { react: { text: '✨', key: m.key } })
try {
    let _gs = await fetch(`${_GTAPI}/api/fun/shayari?apikey=${_giftedKey()}`, { signal: AbortSignal.timeout(10000) })
    let _gsd = await _gs.json()
    if (_gsd.success && _gsd.result) return reply(`╔════〔 📜 SHAYARI 〕═════╗\n\n║ ${_gsd.result}\n╚═══════════════════════╝`)
} catch {}
let shayaris = ['Dil mein tere liye jagah hai,\nPar tu door hai, yeh kya wajah hai.', 'Teri yaad mein hum pagal hue,\nDuniya se hum bekhabar hue.', 'Mohabbat ka koi mol nahi,\nDil hai yeh koi phool nahi.', 'Zindagi mein teri kami hai,\nHar khushi adhuri si hai.', 'Tere bina zindagi se koi shikwa nahi,\nTere bina zindagi hai toh kya.']
reply(`╔════〔 📜 SHAYARI 〕═════╗\n\n║ ${shayaris[Math.floor(Math.random() * shayaris.length)]}\n╚═══════════════════════╝`)
} break

case 'goodnight': {
    await X.sendMessage(m.chat, { react: { text: '🌙', key: m.key } })
try {
    let _ggn = await fetch(`${_GTAPI}/api/fun/goodnight?apikey=${_giftedKey()}`, { signal: AbortSignal.timeout(10000) })
    let _ggnd = await _ggn.json()
    if (_ggnd.success && _ggnd.result) return reply(`╔═══〔 🌙 GOOD NIGHT 〕═══╗\n\n║ ${_ggnd.result}\n╚═══════════════════════╝`)
} catch {}
let gn = ['Sweet dreams! May tomorrow bring you joy. 🌙', 'Good night! Sleep tight and don\'t let the bugs bite! 💤', 'Wishing you a peaceful night full of beautiful dreams. ✨', 'Close your eyes and let the stars guide your dreams. 🌟', 'Good night! Tomorrow is a new opportunity. Rest well! 😴']
reply(`╔═══〔 🌙 GOOD NIGHT 〕═══╗\n\n║ ${gn[Math.floor(Math.random() * gn.length)]}\n╚═══════════════════════╝`)
} break

case 'roseday': {
    await X.sendMessage(m.chat, { react: { text: '🌹', key: m.key } })
try {
    let _gr = await fetch(`${_GTAPI}/api/fun/roseday?apikey=${_giftedKey()}`, { signal: AbortSignal.timeout(10000) })
    let _grd = await _gr.json()
    if (_grd.success && _grd.result) return reply(`╔════〔 🌹 ROSE DAY 〕════╗\n\n║ ${_grd.result}\n╚═══════════════════════╝`)
} catch {}
reply('🌹 *Happy Rose Day!* 🌹\nRoses are red, violets are blue, sending this beautiful rose just for you! May your day be as beautiful as a garden full of roses.')
} break

case 'character': {
    await X.sendMessage(m.chat, { react: { text: '🎌', key: m.key } })
let characters = ['Naruto Uzumaki', 'Goku', 'Luffy', 'Batman', 'Spider-Man', 'Iron Man', 'Sherlock Holmes', 'Harry Potter', 'Pikachu', 'Mario', 'Sonic', 'Link (Zelda)', 'Levi Ackerman', 'Tanjiro Kamado', 'Eren Yeager', 'Gojo Satoru']
reply(`╔══〔 🎭 RANDOM CHARACTER 〕══╗\n\n║ ${characters[Math.floor(Math.random() * characters.length)]}\n╚═══════════════════════╝`)
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
X.sendMessage(from, { text: `╔════〔 🧠 IQ METER 〕════╗\n\n║ 👤 @${iqTarget.split('@')[0]}\n\n║ ${'🧠'.repeat(Math.min(10,Math.floor(iqScore/15)))}${'⬜'.repeat(10 - Math.min(10,Math.floor(iqScore/15)))} *IQ: ${iqScore}*\n\n║ _${iqMsg}_\n╚═══════════════════════╝`, mentions: [iqTarget] }, { quoted: m })
} break

case 'joke':
case 'jokes': {
    await X.sendMessage(m.chat, { react: { text: '😂', key: m.key } })
    try {
        let _jkTxt = null
        // Keith API first
        const _jkkd = await _keithFetch('/fun/jokes')
        if (_jkkd?.setup && _jkkd?.punchline) _jkTxt = `*${_jkkd.setup}*\n\n${_jkkd.punchline}`
        else if (_jkkd?.result?.setup) _jkTxt = `*${_jkkd.result.setup}*\n\n${_jkkd.result.punchline}`
        else if (typeof _jkkd === 'string') _jkTxt = _jkkd
        // GiftedTech fallback
        if (!_jkTxt) {
            let _jkgr = await fetch(`${_GTAPI}/api/fun/joke?apikey=${_giftedKey()}`, { signal: AbortSignal.timeout(10000) })
            let _jkgd = await _jkgr.json()
            if (_jkgd.success && _jkgd.result) _jkTxt = _jkgd.result
        }
        if (!_jkTxt) throw new Error('No joke')
        await reply(`╌══〔 😂 JOKE OF THE DAY 〕══╌\n\n${_jkTxt}\n\n😄 _Haha!_\n╚═══════════════════════╝`)
    } catch(e) { reply('❌ Could not fetch a joke. Try again!') }
} break

case 'quote':
case 'motivation': {
    await X.sendMessage(m.chat, { react: { text: '💪', key: m.key } })
    try {
        let _qtText = null, _qtAuthor = null
        // Keith API first
        const _qtkd = await _keithFetch('/fun/quote')
        if (_qtkd?.quote) { _qtText = _qtkd.quote; _qtAuthor = _qtkd.author || 'Unknown' }
        else if (_qtkd?.result?.quote) { _qtText = _qtkd.result.quote; _qtAuthor = _qtkd.result.author || 'Unknown' }
        else if (typeof _qtkd === 'string') { _qtText = _qtkd; _qtAuthor = 'Unknown' }
        // Local fallback
        if (!_qtText) {
            const _localQts = [
                { q: 'The secret of getting ahead is getting started.', a: 'Mark Twain' },
                { q: 'It always seems impossible until it is done.', a: 'Nelson Mandela' },
                { q: 'The harder you work, the luckier you get.', a: 'Gary Player' },
                { q: 'Success is not final, failure is not fatal.', a: 'Winston Churchill' },
                { q: 'Believe you can and you are halfway there.', a: 'Theodore Roosevelt' },
                { q: 'Your time is limited, don\'t waste it living someone else\'s life.', a: 'Steve Jobs' },
                { q: 'Do what you can, with what you have, where you are.', a: 'Theodore Roosevelt' },
                { q: 'Strive not to be a success, but rather to be of value.', a: 'Albert Einstein' },
                { q: 'The only way to do great work is to love what you do.', a: 'Steve Jobs' },
                { q: 'In the middle of every difficulty lies opportunity.', a: 'Albert Einstein' },
            ]
            const _lq = _localQts[Math.floor(Math.random() * _localQts.length)]
            _qtText = _lq.q; _qtAuthor = _lq.a
        }
        await reply(`╌══〔 💫 QUOTE 〕══════════╌\n\n❝ ${_qtText} ❞\n\n— *${_qtAuthor}*\n╚═══════════════════════╝`)
    } catch(e) {
        reply('╌══〔 💫 QUOTE 〕══════════╌\n\n❝ The secret of getting ahead is getting started. ❞\n\n— *Mark Twain*\n╚═══════════════════════╝')
    }
} break

case 'fact':
case 'randomfact': {
    await X.sendMessage(m.chat, { react: { text: '🧠', key: m.key } })
    try {
        let _ftTxt = null
        // Keith API first
        const _ftkd = await _keithFetch('/fun/fact')
        if (typeof _ftkd === 'string') _ftTxt = _ftkd; else if (_ftkd?.fact) _ftTxt = _ftkd.fact; else if (_ftkd?.result) _ftTxt = typeof _ftkd.result === 'string' ? _ftkd.result : _ftkd.result.fact
        // GiftedTech fallback
        if (!_ftTxt) {
            let _ftgr = await fetch(`${_GTAPI}/api/fun/fact?apikey=${_giftedKey()}`, { signal: AbortSignal.timeout(10000) })
            let _ftgd = await _ftgr.json()
            if (_ftgd.success && _ftgd.result) _ftTxt = _ftgd.result
        }
        if (!_ftTxt) throw new Error('No fact')
        await reply(`╌══〔 🧠 RANDOM FACT 〕════╌\n\n💡 _${_ftTxt}_\n\n╚═══════════════════════╝`)
    } catch(e) { reply('❌ Could not fetch a random fact. Try again!') }
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Anime Commands
case 'neko': {
    await X.sendMessage(m.chat, { react: { text: '🐱', key: m.key } })
    try {
        let nekoUrl = null
        // Source 1: nekos.best (free, no key)
        try {
            const _nb = await fetch('https://nekos.best/api/v2/neko', { signal: AbortSignal.timeout(8000) })
            const _nbd = await _nb.json()
            if (_nbd.results?.[0]?.url) nekoUrl = _nbd.results[0].url
        } catch {}
        // Source 2: waifu.pics
        if (!nekoUrl) {
            const _wp = await fetch('https://api.waifu.pics/sfw/neko', { signal: AbortSignal.timeout(8000) })
            const _wpd = await _wp.json()
            if (_wpd.url) nekoUrl = _wpd.url
        }
        // Source 3: GiftedTech
        if (!nekoUrl) {
            const _gn = await fetch(`${_GTAPI}/api/anime/neko?apikey=${_giftedKey()}`, { signal: AbortSignal.timeout(10000) })
            const _gnd = await _gn.json()
            if (_gnd.success && _gnd.result) nekoUrl = _gnd.result
        }
        if (!nekoUrl) throw new Error('No neko image')
        await safeSendMedia(m.chat, { image: { url: nekoUrl }, caption: '*Neko!* 🐱' }, {}, { quoted: m })
    } catch { reply('❌ Failed to fetch neko image. Try again!') }
} break

case 'waifu': {
    await X.sendMessage(m.chat, { react: { text: '👩', key: m.key } })
    try {
        let waifuUrl = null
        // Source 1: waifu.pics (free, no key)
        try {
            const _wp = await fetch('https://api.waifu.pics/sfw/waifu', { signal: AbortSignal.timeout(8000) })
            const _wpd = await _wp.json()
            if (_wpd.url) waifuUrl = _wpd.url
        } catch {}
        // Source 2: waifu.im (free, no key)
        if (!waifuUrl) {
            const _wi = await fetch('https://api.waifu.im/search?included_tags=waifu&is_nsfw=false', { signal: AbortSignal.timeout(8000) })
            const _wid = await _wi.json()
            if (_wid.images?.[0]?.url) waifuUrl = _wid.images[0].url
        }
        // Source 3: GiftedTech
        if (!waifuUrl) {
            const _gw = await fetch(`${_GTAPI}/api/anime/waifu?apikey=${_giftedKey()}`, { signal: AbortSignal.timeout(10000) })
            const _gwd = await _gw.json()
            if (_gwd.success && _gwd.result) waifuUrl = _gwd.result
        }
        if (!waifuUrl) throw new Error('No waifu image')
        await safeSendMedia(m.chat, { image: { url: waifuUrl }, caption: '*Waifu!* 👩‍🎤' }, {}, { quoted: m })
    } catch { reply('❌ Failed to fetch waifu image. Try again!') }
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

case 'slap':
case 'smack': {
    await X.sendMessage(m.chat, { react: { text: '👋', key: m.key } })
    try {
        let _wp = await fetch('https://api.waifu.pics/sfw/slap')
        let _wpd = await _wp.json()
        let _tgt = (m.mentionedJid && m.mentionedJid[0]) ? `@${m.mentionedJid[0].split('@')[0]}` : 'someone'
        await safeSendMedia(m.chat, { image: { url: _wpd.url }, caption: `*${pushname} slaps ${_tgt}!* 👋` }, { mentions: m.mentionedJid || [] }, { quoted: m })
    } catch { reply('❌ Failed to fetch image.') }
} break

case 'cuddle': {
    await X.sendMessage(m.chat, { react: { text: '🤗', key: m.key } })
    try {
        let _wp = await fetch('https://api.waifu.pics/sfw/cuddle')
        let _wpd = await _wp.json()
        let _tgt = (m.mentionedJid && m.mentionedJid[0]) ? `@${m.mentionedJid[0].split('@')[0]}` : 'someone'
        await safeSendMedia(m.chat, { image: { url: _wpd.url }, caption: `*${pushname} cuddles ${_tgt}!* 🤗` }, { mentions: m.mentionedJid || [] }, { quoted: m })
    } catch { reply('❌ Failed to fetch image.') }
} break

case 'wave': {
    await X.sendMessage(m.chat, { react: { text: '👋', key: m.key } })
    try {
        let _wp = await fetch('https://api.waifu.pics/sfw/wave')
        let _wpd = await _wp.json()
        let _tgt = (m.mentionedJid && m.mentionedJid[0]) ? `@${m.mentionedJid[0].split('@')[0]}` : 'someone'
        await safeSendMedia(m.chat, { image: { url: _wpd.url }, caption: `*${pushname} waves at ${_tgt}!* 👋` }, { mentions: m.mentionedJid || [] }, { quoted: m })
    } catch { reply('❌ Failed to fetch image.') }
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

case 'mal':
case 'myanimelist':
case 'anime': {
    await X.sendMessage(m.chat, { react: { text: '🎌', key: m.key } })
if (!text) return reply(`╔══〔 🎌 ANIME SEARCH 〕══╗\n\n║ Usage: *${prefix}anime [title]*\n║ Example: ${prefix}anime Naruto\n╚═══════════════════════╝`)
try {
let res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(text)}&limit=5`)
let data = await res.json()
if (!data.data || !data.data.length) return reply('No anime found.')
let animeList = data.data.map((a, i) => `${i+1}. *${a.title}* (${a.title_japanese || ''})\nScore: ${a.score || 'N/A'}\nEpisodes: ${a.episodes || 'N/A'}\nStatus: ${a.status}\nGenres: ${(a.genres || []).map(g => g.name).join(', ')}\nSynopsis: ${(a.synopsis || 'N/A').slice(0, 200)}...\nURL: ${a.url}`).join('\n\n')
if (data.data[0].images?.jpg?.image_url) {
await X.sendMessage(m.chat, { image: { url: data.data[0].images.jpg.image_url }, caption: `*Anime Search: ${text}*\n\n${animeList}` }, { quoted: m })
} else reply(`╔══〔 🎌 ANIME SEARCH 〕══╗\n\n║ 🔍 *${text}*\n\n${animeList}\n╚═══════════════════════╝`)
} catch(e) { reply('❌ Error: ' + e.message) }
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
if (!tmText) return reply(`╔══〔 🎨 STYLED TEXT 〕═════╗\n\n║ Usage: *${prefix}${command} [text]*\n║ Or reply to any message\n║\n╠══〔 🔥 AVAILABLE STYLES 〕═╣\n║ ${prefix}fire  · ${prefix}ice   · ${prefix}neon  · ${prefix}matrix\n║ ${prefix}glitch · ${prefix}hacker · ${prefix}snow  · ${prefix}devil\n║ ${prefix}purple · ${prefix}thunder · ${prefix}leaves · ${prefix}sand\n║ ${prefix}impressive · ${prefix}light · ${prefix}blackpink\n║ ${prefix}arena  · ${prefix}1917  · ${prefix}snow\n╚═══════════════════════╝`)

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
const _safeText = tmText.replace(/`/g, '').replace(/\\/g, '').replace(/"/g, '').replace(/'/g, "\\'").replace(/\n/g, ' ').trim().slice(0, 80)
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

// Outer safety net — guarantees a reply no matter what fails
let _iceDone = false
try {
    // ── Step 1: Try Python (async exec keeps event loop alive) ──────
    let _pyOk = false
    await new Promise(resolve => {
        const { exec: _exec } = require('child_process')
        const _tryPy = (bins, i2) => {
            if (i2 >= bins.length) { resolve(); return }
            _exec(`${bins[i2]} "${_pyFile}"`, { timeout: 22000 }, (err) => {
                if (!err) { _pyOk = true; resolve() }
                else _tryPy(bins, i2 + 1)
            })
        }
        _tryPy(['python3', 'python'], 0)
    })

    if (_pyOk) {
        try {
            const _buf = _fs.readFileSync(_outFile)
            if (_buf && _buf.length > 1000) {
                await X.sendMessage(m.chat, { image: _buf, caption: _caption }, { quoted: m })
                _iceDone = true
            }
        } catch (_re) { console.log('[ice] read outFile:', _re.message) }
    }

    // ── Step 2: Jimp fallback ────────────────────────────────────────
    if (!_iceDone) {
        try {
            const Jimp = require('jimp')
            const _W = 1024, _H = 400
            if (typeof Jimp.rgbaToInt === 'function' && typeof Jimp.loadFont === 'function') {
                // Jimp v3 — full layered font rendering
                const _bgInt = Jimp.rgbaToInt(_sty.bg[0], _sty.bg[1], _sty.bg[2], 255)
                const _img = new Jimp(_W, _H, _bgInt)
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
                _iceDone = true
            } else {
                // Jimp v4 — solid color bg + text in caption
                const [_br, _bg2, _bb] = _sty.bg
                const _bgHex = (_br << 24 | _bg2 << 16 | _bb << 8 | 0xff) >>> 0
                const _topLayer = _sty.layers[_sty.layers.length - 1]
                const _accentHex = (_topLayer[2] << 24 | _topLayer[3] << 16 | _topLayer[4] << 8 | 0xff) >>> 0
                let _img4
                try { _img4 = new Jimp({ width: _W, height: _H, color: _bgHex }) }
                catch { _img4 = new Jimp(_W, _H, _bgHex) }
                for (let _px = 0; _px < _W; _px++)
                    for (let _py2 = Math.floor(_H*0.38); _py2 < Math.floor(_H*0.62); _py2++)
                        _img4.setPixelColor(_accentHex, _px, _py2)
                const _buf4 = await (_img4.getBufferAsync ? _img4.getBufferAsync(Jimp.MIME_JPEG || 'image/jpeg') : _img4.getBuffer('image/jpeg'))
                await X.sendMessage(m.chat, { image: _buf4, caption: _caption }, { quoted: m })
                _iceDone = true
            }
        } catch (_je) { console.log('[ice] jimp:', _je.message) }
    }
} catch (_oe) { console.log('[ice] outer error:', _oe.message) }

// ── Step 3: Text-only final fallback ───────────────────────────────
if (!_iceDone) {
    reply(`╔══〔 🎨 ${command.toUpperCase()} TEXT 〕══╗\n\n║ ${tmText}\n╚═══════════════════════╝`)
}
try { _fs.unlinkSync(_pyFile) } catch {}
try { _fs.unlinkSync(_outFile) } catch {}
} break

case 'heart': {
    await X.sendMessage(m.chat, { react: { text: '💕', key: m.key } })
    let heartTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : sender
    if (!m.quoted) {
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
X.sendMessage(from, { text: `╔═══〔 😎 RIZZ METER 〕═══╗\n\n║ 👤 @${rizzTarget.split('@')[0]}\n\n║ ${'🔥'.repeat(Math.floor(rizzLevel/10))}${'⬜'.repeat(10 - Math.floor(rizzLevel/10))} *${rizzLevel}%*\n\n║ _${rizzMsg}_\n╚═══════════════════════╝`, mentions: [rizzTarget] }, { quoted: m })
} break

case 'circle': {
    await X.sendMessage(m.chat, { react: { text: '⭕', key: m.key } })
if (!m.quoted || !/image/.test(m.quoted.mimetype || '')) return reply(`Reply to an image with ${prefix}circle`)
try {
let buf = await m.quoted.download()
await X.sendMessage(m.chat, { sticker: buf }, { quoted: m })
} catch(e) { reply('❌ Error: ' + e.message) }
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
X.sendMessage(from, { text: `╔══〔 🚔 POLICE ALERT! 〕══╗\n\n║ 🚨 @${policeTarget.split('@')[0]} has been arrested!\n\n║ 📋 *Crime* : ${reason}\n║ ⚖️  *Sentence* : Life of fun 🎉\n╚═══════════════════════╝`, mentions: [policeTarget] }, { quoted: m })
} break

case 'namecard': {
    await X.sendMessage(m.chat, { react: { text: '🪪', key: m.key } })
let ncName = text || pushname
reply(`╔═══〔 🪪 ${ncName} 〕════╗\n\n║ Bot : ${global.botname}\n╚═══════════════════════╝`)
} break

case 'tweet': {
    await X.sendMessage(m.chat, { react: { text: '🐦', key: m.key } })
if (!text) return reply(`╔═══〔 🐦 TWEET CARD 〕═══╗\n\n║ Usage: *${prefix}tweet [message]*\n║ Example: ${prefix}tweet I love coding!\n╚═══════════════════════╝`)
reply(`╔═════〔 🐦 TWEET 〕══════╗\n\n║ 👤 *@${pushname}*\n║ ${text}\n\n║ ❤️ ${Math.floor(Math.random() * 10000)}  🔁 ${Math.floor(Math.random() * 5000)}  💬 ${Math.floor(Math.random() * 1000)}\n╚═══════════════════════╝`)
} break

case 'ytcomment': {
    await X.sendMessage(m.chat, { react: { text: '💬', key: m.key } })
if (!text) return reply(`╔══〔 💬 YT COMMENT CARD 〕══╗\n\n║ Usage: *${prefix}ytcomment [message]*\n║ Example: ${prefix}ytcomment This video is amazing!\n╚═══════════════════════╝`)
reply(`╔══〔 ▶️  YOUTUBE COMMENT 〕══╗\n\n║ 👤 *${pushname}*\n║ ${text}\n\n║ 👍 ${Math.floor(Math.random() * 5000)}  👎  💬 ${Math.floor(Math.random() * 200)} replies\n╚═══════════════════════╝`)
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
X.sendMessage(from, { text: `╔═══〔 ✨ VIBE CHECK 〕════╗\n\n║ 👤 @${vibeTarget.split('@')[0]}\n\n║ ${'✨'.repeat(Math.floor(vibeLevel/10))}${'⬜'.repeat(10 - Math.floor(vibeLevel/10))} *${vibeLevel}%*\n\n║ _${vibeMsg}_\n╚═══════════════════════╝`, mentions: [vibeTarget] }, { quoted: m })
} break

case 'gay': {
    await X.sendMessage(m.chat, { react: { text: '🏳️‍🌈', key: m.key } })
    if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
let gayTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : sender
let gayLevel = Math.floor(Math.random() * 101)
const gayMsg = gayLevel > 90 ? 'Absolutely fabulous! 🏳️‍🌈💅' : gayLevel > 70 ? 'Serving rainbow energy ✨' : gayLevel > 50 ? 'Somewhere over the rainbow 🌈' : gayLevel > 30 ? 'Just a little bit 😅' : 'Straight as an arrow 🏹'
X.sendMessage(from, { text: `╔══〔 🏳️‍🌈 GAY METER 〕══╗\n\n║ 👤 @${gayTarget.split('@')[0]}\n\n║ ${'🌈'.repeat(Math.floor(gayLevel/10))}${'⬜'.repeat(10 - Math.floor(gayLevel/10))} *${gayLevel}%*\n\n║ _${gayMsg}_\n╚═══════════════════════╝`, mentions: [gayTarget] }, { quoted: m })
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
// AI COMMANDS

case 'ai': {
  await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
  if (!text) return reply(`╔══〔 🤖 AI ASSISTANT 〕═══╗\n║ *Usage:* ${prefix}ai [message]\n║ Example: ${prefix}ai What is AI?\n╚═══════════════════════╝`)
  try {
    let _aiRes = null
    // Source 1: Keith AI
    try {
      let _kr = await fetch(`https://apiskeith.top/ai?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _aiRes = _kd.result
    } catch {}
    // Source 2: _runAI fallback
    if (!_aiRes) {
      try { _aiRes = await _runAI('You are a helpful AI assistant.', text) } catch {}
    }
    if (_aiRes) reply(_aiRes)
    else reply('❌ AI is currently unavailable. Please try again.')
  } catch (e) { reply('❌ AI error: ' + e.message) }
} break

case 'fluximg': {
  await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
  if (!text) return reply(`╔══〔 🎨 FLUX IMAGE AI 〕══╗\n║ *Usage:* ${prefix}fluximg [prompt]\n║ Example: ${prefix}fluximg futuristic city at night\n╚═══════════════════════╝`)
  try {
    await reply('🎨 _Generating Flux image, please wait..._')
    let r = await fetch(`https://apiskeith.top/ai/flux?prompt=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(60000) })
    if (!r.ok) throw new Error('Flux API error: ' + r.status)
    let imgBuf = Buffer.from(await r.arrayBuffer())
    if (imgBuf.length < 1000) throw new Error('Invalid image returned')
    await X.sendMessage(m.chat, {
      image: imgBuf,
      caption: `╔══〔 🎨 FLUX IMAGE AI 〕══╗\n║ 🖌️ *Prompt:* ${text.slice(0,100)}\n║ 🤖 *Model:* Flux by Keith\n╚═══════════════════════╝`
    }, { quoted: m })
  } catch (e) { reply('❌ Flux image generation failed: ' + e.message) }
} break

case 'setaimode': {
  await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
  const validModes = ['gpt', 'gemini', 'claude', 'copilot', 'mistral', 'deepseek', 'wormgpt', 'perplexity', 'grok', 'venice']
  if (!text || !validModes.includes(text.toLowerCase())) {
    return reply(`╔══〔 🤖 SET AI MODE 〕════╗\n║ *Usage:* ${prefix}setaimode [model]\n║\n║ *Available models:*\n${validModes.map(m2=>`║ • ${m2}`).join('\n')}\n║\n║ 📌 *Current:* ${global.aiMode || 'default'}\n╚═══════════════════════╝`)
  }
  global.aiMode = text.toLowerCase()
  reply(`╔══〔 🤖 AI MODE SET 〕════╗\n║ ✅ *AI Mode:* ${global.aiMode}\n║ All AI commands will now use: *${global.aiMode}*\n╚═══════════════════════╝`)
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// FUN / GAME COMMANDS

case 'horny': {
  await X.sendMessage(m.chat, { react: { text: '🌡️', key: m.key } })
  if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
  let hornyTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : sender
  let hornyPct = Math.floor(Math.random() * 101)
  let hornyBar = '█'.repeat(Math.floor(hornyPct/10)) + '░'.repeat(10 - Math.floor(hornyPct/10))
  let hornyMsg = hornyPct < 20 ? '😇 Very innocent!' : hornyPct < 40 ? '😊 Pretty calm...' : hornyPct < 60 ? '😏 Getting there...' : hornyPct < 80 ? '🔥 Running hot!' : '💥 Off the charts!'
  X.sendMessage(from, {
    text: `╔══〔 🌡️ HORNY METER 〕════╗\n║ 🎯 *Target:* @${hornyTarget.split('@')[0]}\n║\n║ [${hornyBar}]\n║ 🌡️ *Level:* ${hornyPct}%\n║\n║ ${hornyMsg}\n╚═══════════════════════╝`,
    mentions: [hornyTarget]
  }, { quoted: m })
} break

case 'wyr': {
  await X.sendMessage(m.chat, { react: { text: '🤔', key: m.key } })
  if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply('❌ *Social games are disabled in this group.*')
  try {
      let _wyrTxt = null
      // Keith API first
      const _wyrkd = await _keithFetch('/fun/would-you-rather')
      if (typeof _wyrkd === 'string') _wyrTxt = _wyrkd
      else if (_wyrkd?.result) _wyrTxt = typeof _wyrkd.result === 'string' ? _wyrkd.result : _wyrkd.result?.question
      if (_wyrTxt && _wyrTxt.includes(' or ')) {
          const [optA, optB] = _wyrTxt.split(' or ').map(s => s.trim())
          await reply(`╌══〔 🤔 WOULD YOU RATHER 〕═╌\n║ 🅰️ *Option A:*\n║    ${optA}\n║\n║ 🅱️ *Option B:*\n║    ${optB}\n║\n║ 💬 Reply A or B!\n╚═══════════════════════╝`)
      } else {
          // Local fallback
          const wyrQs = [
            ['Be able to fly', 'Be able to turn invisible'],
            ['Always be late', 'Always be too early'],
            ['Eat only sweets forever', 'Never eat sweets again'],
            ['Always have to speak in rhyme', 'Always have to sing when you talk'],
            ['Know when you will die', 'Know how you will die'],
            ['Live in the city', 'Live in the countryside'],
            ['Be the funniest person in the room', 'Be the smartest person in the room'],
            ['Have unlimited money but no friends', 'Have unlimited friends but no money'],
          ]
          const q = wyrQs[Math.floor(Math.random() * wyrQs.length)]
          await reply(`╌══〔 🤔 WOULD YOU RATHER 〕═╌\n║ 🅰️ *Option A:*\n║    ${q[0]}\n║\n║ 🅱️ *Option B:*\n║    ${q[1]}\n║\n║ 💬 Reply A or B!\n╚═══════════════════════╝`)
      }
  } catch(e) {
      const wyrQs = [['Be able to fly','Be able to turn invisible'],['Always be late','Always be too early']]
      const q = wyrQs[Math.floor(Math.random()*wyrQs.length)]
      reply(`╌══〔 🤔 WOULD YOU RATHER 〕═╌\n║ 🅰️ *Option A:* ${q[0]}\n║ 🅱️ *Option B:* ${q[1]}\n║ 💬 Reply A or B!\n╚═══════════════════════╝`)
  }
} break

case 'nvhh': {
  await X.sendMessage(m.chat, { react: { text: '🙋', key: m.key } })
  if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
  const nvhQs = [
    'Never have I ever stayed up past 3am for no reason',
    'Never have I ever forgotten a friend\'s birthday',
    'Never have I ever stalked someone\'s social media',
    'Never have I ever lied about being busy',
    'Never have I ever texted the wrong person',
    'Never have I ever eaten food that fell on the floor',
    'Never have I ever pretended to be sick to skip something',
    'Never have I ever cried at a movie in public',
    'Never have I ever sent a risky text and instantly regretted it',
    'Never have I ever faked laughing at a joke I didn\'t get',
    'Never have I ever left someone on read for more than a week',
    'Never have I ever posted a selfie and deleted it after 5 mins',
    'Never have I ever bought something I never used',
    'Never have I ever cheated at a board game',
    'Never have I ever broken something and blamed it on someone else',
  ]
  let q = nvhQs[Math.floor(Math.random() * nvhQs.length)]
  reply(`╔══〔 🙋 NEVER HAVE I EVER 〕╗\n║ 🗣️ *Statement:*\n║\n║ "${q}"\n║\n║ 👍 — I have!  👎 — I haven't!\n╚═══════════════════════╝`)
} break

case 'roast': {
  await X.sendMessage(m.chat, { react: { text: '🔥', key: m.key } })
  if (m.isGroup && global.antiSocialGames && global.antiSocialGames[m.chat]) return reply(`❌ *Social games are disabled in this group.*`)
  let roastTarget = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : sender
  let roastName = roastTarget.split('@')[0]
  const roasts = [
    `@${roastName} is so slow, they got lapped by a turtle on a Sunday stroll. 🐢`,
    `I'd roast @${roastName} more, but my mama told me not to burn trash. 🗑️`,
    `@${roastName}'s WiFi signal has more personality than they do. 📶`,
    `@${roastName} told me they were a morning person — the morning disagreed. 🌅`,
    `@${roastName} is proof that even evolution can have off days. 🧬`,
    `@${roastName} texted their WiFi password instead of their ex by accident. At least one reconnected. 📡`,
    `@${roastName} is the human version of a buffering screen. ⏳`,
    `@${roastName}'s selfie made my camera lens blur on purpose. 📷`,
    `@${roastName} called tech support and the robot asked to speak to a human instead. 🤖`,
    `@${roastName} is living proof that not all heroes wear capes — some just stay in bed. 🛏️`,
    `@${roastName} tried to look sharp but ended up looking like a blunt pencil. ✏️`,
    `@${roastName}'s brain cells call in sick more often than they show up. 🏥`,
    `@${roastName} is so average, even their average is average. 📉`,
    `@${roastName} asked Siri for directions and she went offline. 🗺️`,
    `If @${roastName} were a spice, they'd be flour. Tasteless, but somehow still here. 🌾`,
  ]
  let roast = roasts[Math.floor(Math.random() * roasts.length)]
  X.sendMessage(from, {
    text: `╔══〔 🔥 ROASTED! 〕═══════╗\n║ 🎯 *Target:* @${roastName}\n║\n║ ${roast}\n║\n║ 🧯 _Too hot to handle!_\n╚═══════════════════════╝`,
    mentions: [roastTarget]
  }, { quoted: m })
} break

case 'tebakld': {
  await X.sendMessage(m.chat, { react: { text: '🗺️', key: m.key } })
  const provinces = [
    { name: 'Aceh', hints: ['Northernmost province of Indonesia', 'Known as Serambi Mekkah', 'Capital: Banda Aceh'] },
    { name: 'Bali', hints: ['Island of the Gods', 'Famous tourist destination', 'Capital: Denpasar'] },
    { name: 'Jakarta', hints: ['Capital city of Indonesia', 'Largest city in Southeast Asia', 'Located in Java island'] },
    { name: 'Papua', hints: ['Easternmost province', 'Shares island with Papua New Guinea', 'Home to Puncak Jaya'] },
    { name: 'Kalimantan', hints: ['Part of Borneo island', 'Known for orangutans', 'Rich in coal and palm oil'] },
    { name: 'Sulawesi', hints: ['Island shaped like a letter K', 'Home to Torajan culture', 'Capital: Makassar'] },
    { name: 'Lombok', hints: ['Next to Bali', 'Famous for Mount Rinjani', 'Capital: Mataram'] },
    { name: 'Maluku', hints: ['Also called the Spice Islands', 'Historical center of clove trade', 'Capital: Ambon'] },
    { name: 'Sumatra', hints: ['Second largest island', 'Home to Lake Toba', 'Orangutans and tigers live here'] },
    { name: 'Yogyakarta', hints: ['City of culture and students', 'Near Mount Merapi', 'Home of Borobudur temple'] },
  ]
  if (!global.tebakldGames) global.tebakldGames = {}
  if (global.tebakldGames[m.chat]) {
    return reply(`╔══〔 🗺️ GAME IN PROGRESS 〕╗\n║ A tebak-lambang game is already active!\n║ Use *${prefix}answer [province name]*\n╚═══════════════════════╝`)
  }
  let prov = provinces[Math.floor(Math.random() * provinces.length)]
  global.tebakldGames[m.chat] = {
    answer: prov.name.toLowerCase(),
    timeout: setTimeout(() => {
      if (global.tebakldGames && global.tebakldGames[m.chat]) {
        X.sendMessage(m.chat, { text: `╔══〔 ⏰ TIME IS UP 〕═════╗\n║ ✅ *Answer:* ${prov.name}\n║ Better luck next time!\n╚═══════════════════════╝` })
        delete global.tebakldGames[m.chat]
      }
    }, 45000)
  }
  reply(`╔══〔 🗺️ TEBAK LAMBANG DAERAH 〕╗\n║ 🧩 Guess the Indonesian province!\n║\n║ 💡 *Hint 1:* ${prov.hints[0]}\n║ 💡 *Hint 2:* ${prov.hints[1]}\n║ 💡 *Hint 3:* ${prov.hints[2]}\n║\n║ ✏️ Use *${prefix}answer [province]*\n║ ⏰ You have 45 seconds!\n╚═══════════════════════╝`)
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// GROUP COMMANDS

case 'setgpic': {
  await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
  if (!m.isGroup) return reply('❌ This command is for groups only.')
  if (!isBotAdmin) return reply('❌ I need to be an admin to set group picture.')
  if (!isAdmin && !isOwner) return reply('❌ Only admins can use this command.')
  if (!m.quoted || !/image/.test(m.quoted.mimetype || '')) return reply(`╔══〔 🖼️ SET GROUP PIC 〕══╗\n║ Reply to an image with *${prefix}setgpic*\n╚═══════════════════════╝`)
  try {
    let buf = await m.quoted.download()
    await X.updateProfilePicture(m.chat, buf)
    reply(`╔══〔 🖼️ GROUP PICTURE 〕══╗\n║ ✅ Group picture updated!\n╚═══════════════════════╝`)
  } catch (e) { reply('❌ Failed to update group picture: ' + e.message) }
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// IMAGE EFFECT COMMANDS (jimp)

case 'blur': {
  await X.sendMessage(m.chat, { react: { text: '🌫️', key: m.key } })
  const _blurMime = (m.quoted && (m.quoted.msg || m.quoted).mimetype) || ''
  if (!m.quoted || !/image/.test(_blurMime)) return reply(`╔══〔 🌫️ BLUR EFFECT 〕══╗\n\n║ Reply to an image with *${prefix}blur*\n╚═══════════════════════╝`)
  try {
    await reply('🌫️ _Applying blur effect..._')
    let buf = await _dlWithRetry(m.quoted)
    let Jimp = require('jimp')
    let img = await (Jimp.read ? Jimp.read(buf) : Jimp.fromBuffer(buf))
    img.blur(10)
    let out = await (img.getBufferAsync ? img.getBufferAsync(Jimp.MIME_JPEG || 'image/jpeg') : img.getBuffer('image/jpeg'))
    await X.sendMessage(m.chat, { image: out, caption: `╔══〔 🌫️ BLUR EFFECT 〕══╗\n\n║ ✅ Blur applied!\n╚═══════════════════════╝` }, { quoted: m })
  } catch (e) { reply('╔══〔 ❌ BLUR FAILED 〕══╗\n\n║ ' + (e.message.includes('hang') || e.message.includes('timeout') || e.message.includes('closed') ? 'Media download failed — please resend\n║ the image and try again.' : e.message.slice(0,120)) + '\n╚═══════════════════════╝') }
} break

case 'sharpen': {
  await X.sendMessage(m.chat, { react: { text: '🔪', key: m.key } })
  const _sharpMime = (m.quoted && (m.quoted.msg || m.quoted).mimetype) || ''
  if (!m.quoted || !/image/.test(_sharpMime)) return reply(`╔══〔 🔪 SHARPEN EFFECT 〕══╗\n\n║ Reply to an image with *${prefix}sharpen*\n╚═══════════════════════╝`)
  try {
    await reply('🔪 _Sharpening image..._')
    let buf = await _dlWithRetry(m.quoted)
    let Jimp = require('jimp')
    let img = await (Jimp.read ? Jimp.read(buf) : Jimp.fromBuffer(buf))
    img.convolute([[0,-1,0],[-1,5,-1],[0,-1,0]])
    let out = await (img.getBufferAsync ? img.getBufferAsync(Jimp.MIME_JPEG || 'image/jpeg') : img.getBuffer('image/jpeg'))
    await X.sendMessage(m.chat, { image: out, caption: `╔══〔 🔪 SHARPEN EFFECT 〕══╗\n\n║ ✅ Image sharpened!\n╚═══════════════════════╝` }, { quoted: m })
  } catch (e) { reply('╔══〔 ❌ SHARPEN FAILED 〕══╗\n\n║ ' + (e.message.includes('hang') || e.message.includes('timeout') || e.message.includes('closed') ? 'Media download failed — please resend\n║ the image and try again.' : e.message.slice(0,120)) + '\n╚═══════════════════════╝') }
} break

case 'greyscale':
case 'grayscale': {
  await X.sendMessage(m.chat, { react: { text: '⬛', key: m.key } })
  const _greyMime = (m.quoted && (m.quoted.msg || m.quoted).mimetype) || ''
  if (!m.quoted || !/image/.test(_greyMime)) return reply(`╔══〔 ⬛ GREYSCALE 〕══╗\n\n║ Reply to an image with *${prefix}greyscale*\n╚═══════════════════════╝`)
  try {
    await reply('⬛ _Converting to greyscale..._')
    let buf = await _dlWithRetry(m.quoted)
    let Jimp = require('jimp')
    let img = await (Jimp.read ? Jimp.read(buf) : Jimp.fromBuffer(buf))
    img.greyscale()
    let out = await (img.getBufferAsync ? img.getBufferAsync(Jimp.MIME_JPEG || 'image/jpeg') : img.getBuffer('image/jpeg'))
    await X.sendMessage(m.chat, { image: out, caption: `╔══〔 ⬛ GREYSCALE 〕══╗\n\n║ ✅ Greyscale applied!\n╚═══════════════════════╝` }, { quoted: m })
  } catch (e) { reply('╔══〔 ❌ GREYSCALE FAILED 〕══╗\n\n║ ' + (e.message.includes('hang') || e.message.includes('timeout') || e.message.includes('closed') ? 'Media download failed — please resend\n║ the image and try again.' : e.message.slice(0,120)) + '\n╚═══════════════════════╝') }
} break

case 'sepia': {
  await X.sendMessage(m.chat, { react: { text: '🟫', key: m.key } })
  const _sepiaMime = (m.quoted && (m.quoted.msg || m.quoted).mimetype) || ''
  if (!m.quoted || !/image/.test(_sepiaMime)) return reply(`╔══〔 🟫 SEPIA EFFECT 〕══╗\n\n║ Reply to an image with *${prefix}sepia*\n╚═══════════════════════╝`)
  try {
    await reply('🟫 _Applying sepia tone..._')
    let buf = await _dlWithRetry(m.quoted)
    let Jimp = require('jimp')
    let img = await (Jimp.read ? Jimp.read(buf) : Jimp.fromBuffer(buf))
    img.sepia()
    let out = await (img.getBufferAsync ? img.getBufferAsync(Jimp.MIME_JPEG || 'image/jpeg') : img.getBuffer('image/jpeg'))
    await X.sendMessage(m.chat, { image: out, caption: `╔══〔 🟫 SEPIA EFFECT 〕══╗\n\n║ ✅ Sepia applied!\n╚═══════════════════════╝` }, { quoted: m })
  } catch (e) { reply('╔══〔 ❌ SEPIA FAILED 〕══╗\n\n║ ' + (e.message.includes('hang') || e.message.includes('timeout') || e.message.includes('closed') ? 'Media download failed — please resend\n║ the image and try again.' : e.message.slice(0,120)) + '\n╚═══════════════════════╝') }
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// OWNER COMMANDS

//━━━━━━━━━━━━━━━━━━━━━━━━//
// TOOLS COMMANDS

case 'runtime': {
  await X.sendMessage(m.chat, { react: { text: '⏱️', key: m.key } })
  let uptimeMs = process.uptime() * 1000
  let days = Math.floor(uptimeMs / 86400000)
  let hours = Math.floor((uptimeMs % 86400000) / 3600000)
  let mins = Math.floor((uptimeMs % 3600000) / 60000)
  let secs = Math.floor((uptimeMs % 60000) / 1000)
  reply(`╔══〔 ⏱️ BOT RUNTIME 〕════╗\n║ 🤖 *Bot:* ${global.botname}\n║\n║ ⏰ *Uptime:*\n║    ${days}d ${hours}h ${mins}m ${secs}s\n║\n║ 📅 *Started:* ${new Date(Date.now() - uptimeMs).toLocaleString('en-KE', { timeZone: global.timezone || 'Africa/Nairobi' })}\n╚═══════════════════════╝`)
} break

case 'xmascard': {
  await X.sendMessage(m.chat, { react: { text: '🎄', key: m.key } })
  let xName = text || pushname
  try {
    // Fetch Xmas-themed avatar image (PNG from DiceBear)
    let imgUrl = `https://api.dicebear.com/9.x/pixel-art/png?seed=${encodeURIComponent(xName)}&size=400&backgroundColor=b6e3f4,c0ebcc,fde8d8`
    let imgCaption = `╔══〔 🎄 CHRISTMAS CARD 〕══╗\n║ 🎅 *To:* ${xName}\n║\n║ 🎄 Wishing you a Merry Christmas\n║    and a Happy New Year! 🎁\n║\n║ ❄️ May your days be merry & bright\n║ 🌟 From: ${global.botname || 'TOOSII-XD ULTRA'}\n╚═══════════════════════╝`
    try {
      let imgBuf = await getBuffer(imgUrl)
      if (imgBuf && imgBuf.length > 500) {
        await X.sendMessage(m.chat, { image: imgBuf, caption: imgCaption }, { quoted: m })
      } else { await reply(imgCaption) }
    } catch { await reply(imgCaption) }
  } catch (e) { reply('❌ Christmas card failed: ' + e.message) }
} break

case 'robottext': {
  await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
  if (!text) return reply(`╔══〔 🤖 ROBOT TEXT 〕═════╗\n║ *Usage:* ${prefix}robottext [text]\n║ Example: ${prefix}robottext hello\n╚═══════════════════════╝`)
  const robotMap = {
    a:'4',b:'8',c:'[',d:'|)',e:'3',f:'|=',g:'6',h:'|-|',i:'1',j:'_|',
    k:'|<',l:'1',m:'|\\/|',n:'|\\|',o:'0',p:'|°',q:'(,)',r:'|2',
    s:'5',t:'7',u:'|_|',v:'\\/',w:'\\^/',x:'><',y:'`/',z:'2',
    ' ':' '
  }
  let robot = text.toLowerCase().split('').map(c => robotMap[c] || c).join('')
  reply(`╔══〔 🤖 ROBOT TEXT 〕═════╗\n║ *Original:* ${text}\n║\n║ *Robot:*\n║ ${robot}\n╚═══════════════════════╝`)
} break

case 'transcript': {
  await X.sendMessage(m.chat, { react: { text: '📝', key: m.key } })
  if (!m.quoted || !/audio|video/.test(m.quoted.mimetype || '')) return reply(`╔══〔 📝 TRANSCRIPT 〕═════╗\n║ Reply to an audio/video with *${prefix}transcript*\n║ _Converts speech to text_\n╚═══════════════════════╝`)
  try {
    await reply('📝 _Transcribing audio, please wait..._')
    let mediaBuf = await m.quoted.download()
    if (!mediaBuf || mediaBuf.length < 100) throw new Error('Failed to download media')
    let tmpPath = require('path').join(__dirname, 'tmp', `trans_${Date.now()}.ogg`)
    fs.writeFileSync(tmpPath, mediaBuf)
    let audioUrl = await CatBox(tmpPath)
    fs.unlinkSync(tmpPath)
    if (!audioUrl || !audioUrl.startsWith('http')) throw new Error('Upload failed')
    // Use AssemblyAI free tier or GiftedTech
    let trResult = null
    try {
      let _gr = await fetch(`${_GTAPI}/api/tools/speech2text?apikey=${_giftedKey()}&url=${encodeURIComponent(audioUrl)}`, { signal: AbortSignal.timeout(40000) })
      let _gd = await _gr.json()
      if (_gd.success && _gd.result) trResult = _gd.result
    } catch {}
    if (!trResult) throw new Error('Transcription service unavailable')
    reply(`╔══〔 📝 TRANSCRIPT 〕═════╗\n║ 🎙️ *Audio transcribed:*\n║\n║ ${trResult.replace(/\n/g, '\n║ ')}\n╚═══════════════════════╝`)
  } catch (e) { reply('❌ Transcript failed: ' + e.message) }
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
try {
      const _evalProm = eval(`(async () => { return ${budy.slice(3)} })()`)
      if (_evalProm && typeof _evalProm.then === 'function') {
          _evalProm.then(_evalRes => {
              const _evalStr = require('util').format(_evalRes)
              if (_evalStr && _evalStr !== 'undefined' && _evalStr !== 'null') reply(_evalStr)
          }).catch(_evalErr => reply(String(_evalErr)))
      } else {
          const _evalStr2 = require('util').format(_evalProm)
          if (_evalStr2 && _evalStr2 !== 'undefined' && _evalStr2 !== 'null') reply(_evalStr2)
      }
  } catch(_evalCatchErr) { reply(String(_evalCatchErr)) }
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
const _evalStr = require('util').format(teks); if (_evalStr && _evalStr !== 'undefined' && _evalStr !== 'null') await reply(_evalStr)
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
        if (_cbaAutoReply && _cbaAutoReply.trim()) {
              reply(_cbaAutoReply.trim())
          }
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


//━━━━━━━━━━━━━━━━━━━━━━━━//
// Fetch / Test API
case 'fetch':
case 'testapi':
case 'curl': {
    await X.sendMessage(m.chat, { react: { text: '🌐', key: m.key } })
    if (!q) return reply('❌ Provide a URL.\n\nUsage: .fetch https://api.example.com')
    let _url = q.trim()
    if (!_url.startsWith('http')) _url = 'https://' + _url
    try {
        const _fetchRes = await require('node-fetch')(_url, { timeout: 30000,
            headers: { 'User-Agent': 'TOOSII-XD-ULTRA/2.0' } })
        const _ct = _fetchRes.headers.get('content-type') || ''
        let _body = await _fetchRes.text()
        let _disp = _body
        if (_ct.includes('json') || _body.trimStart().startsWith('{') || _body.trimStart().startsWith('[')) {
            try { _disp = JSON.stringify(JSON.parse(_body), null, 2) } catch {}
        }
        const _out = _disp.length > 3000 ? _disp.slice(0, 3000) + '\n\n[...truncated]' : _disp
        await reply(`🌐 *URL:* ${_url}\n📊 *Status:* ${_fetchRes.status}\n📄 *Type:* ${_ct.split(';')[0]}\n\n\`\`\`\n${_out}\n\`\`\``)
    } catch (_fe) { reply('❌ Fetch failed: ' + (_fe.message || _fe)) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// GitHub Repo Downloader
case 'gitclone':
case 'github':
case 'repodl': {
    await X.sendMessage(m.chat, { react: { text: '📦', key: m.key } })
    if (!q) return reply('❌ Provide a GitHub repo URL.\n\nUsage: .gitclone https://github.com/user/repo')
    const _gitMatch = q.match(/github\.com\/([^\/\s]+)\/([^\/\s]+)/i)
    if (!_gitMatch) return reply('❌ Invalid GitHub URL.')
    const [, _ghu, _ghr] = _gitMatch
    const _repoName = _ghr.replace(/\.git$/, '')
    try {
        const _apiRes = await require('node-fetch')(`https://api.github.com/repos/${_ghu}/${_repoName}`, {
            headers: { 'User-Agent': 'TOOSII-XD-ULTRA', Accept: 'application/vnd.github.v3+json' }
        })
        if (!_apiRes.ok) return reply(`❌ Repo not found: ${_ghu}/${_repoName}`)
        const _rd = await _apiRes.json()
        const _branch = _rd.default_branch || 'main'
        const _zipUrl = `https://github.com/${_ghu}/${_repoName}/archive/refs/heads/${_branch}.zip`
        await X.sendMessage(m.chat, { text: `⬇️ Downloading *${_ghu}/${_repoName}* (@${_branch})...\n⭐ Stars: ${_rd.stargazers_count} | 🍴 Forks: ${_rd.forks_count}` })
        const _zipRes = await require('node-fetch')(_zipUrl, { timeout: 60000 })
        if (!_zipRes.ok) return reply('❌ Failed to download ZIP')
        const _zipBuf = Buffer.from(await _zipRes.arrayBuffer())
        await X.sendMessage(m.chat, {
            document: _zipBuf,
            fileName: `${_repoName}-${_branch}.zip`,
            mimetype: 'application/zip',
            caption: `📦 *${_ghu}/${_repoName}*\n🌿 Branch: ${_branch}\n📦 Size: ${(_zipBuf.length/1024).toFixed(1)}KB\n📝 ${_rd.description || 'No description'}`,
            contextInfo: global.getCtxInfo()
        }, { quoted: m })
    } catch (_ge) { reply('❌ Error: ' + (_ge.message || _ge)) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Save Settings Persistently
case 'savesettings': {
    if (!isOwner) return reply('❌ Owner only.')
    try {
        require('./library/settings').saveSettings()
        reply('✅ Settings saved — will survive restarts.\n\nTo restore automatically, they load on every startup.')
    } catch(_se) { reply('❌ ' + _se.message) }
    break
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Tag Everyone
case 'everyone':
case 'tag':
case 'all':
case 'mention': {
    if (!isGroup) return reply('❌ Groups only.')
    if (!isAdmin && !isOwner) return reply('❌ Admins only.')
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
    try {
        const _meta = await getGroupMetadata(X, from)
        const _jids = _meta.participants.map(p => p.id)
        const _mentions = _jids.map(j => '@' + j.split('@')[0]).join(' ')
        const _msg = q ? q + '\n\n' + _mentions : _mentions
        await X.sendMessage(from, { text: _msg, mentions: _jids, contextInfo: global.getCtxInfo(_jids) }, { quoted: m })
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Hidden Tag
case 'hidetag':
case 'htag':
case 'hidtag': {
    if (!isGroup) return reply('❌ Groups only.')
    if (!isAdmin && !isOwner) return reply('❌ Admins only.')
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
    try {
        const _meta2 = await getGroupMetadata(X, from)
        const _jids2 = _meta2.participants.map(p => p.id)
        const _txt = q || m.quoted?.body || '📢 Notice'
        await X.sendMessage(from, { text: _txt, mentions: _jids2 }, { quoted: m })
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Tag All Members
case 'tagall':
case 'mentionall': {
    if (!isGroup) return reply('❌ Groups only.')
    if (!isAdmin && !isOwner) return reply('❌ Admins only.')
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
    try {
        const _metaA = await getGroupMetadata(X, from)
        const _jidsA = _metaA.participants.map(p => p.id)
        let _text = (q ? q + '\n\n' : '👥 *Everyone is tagged!*\n\n')
        _text += _jidsA.map(j => '@' + j.split('@')[0]).join('\n')
        await X.sendMessage(from, { text: _text, mentions: _jidsA, contextInfo: global.getCtxInfo(_jidsA) }, { quoted: m })
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Tag Admins Only
case 'tagadmins':
case 'taggcadmins': {
    if (!isGroup) return reply('❌ Groups only.')
    await X.sendMessage(m.chat, { react: { text: '👮', key: m.key } })
    try {
        const _metaAd = await getGroupMetadata(X, from)
        const _admJids = _metaAd.participants.filter(p => p.admin).map(p => p.id)
        if (!_admJids.length) return reply('❌ No admins found.')
        const _admTxt = (q ? q + '\n\n' : '👮 *Admins tagged!*\n\n') + _admJids.map(j => '@' + j.split('@')[0]).join('\n')
        await X.sendMessage(from, { text: _admTxt, mentions: _admJids, contextInfo: global.getCtxInfo(_admJids) }, { quoted: m })
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// List Join Requests
case 'listrequests':
case 'joinrequests':
case 'pendingrequests': {
    if (!isGroup) return reply('❌ Groups only.')
    if (!isBotAdmin) return reply('❌ Bot must be admin.')
    if (!isAdmin && !isOwner) return reply('❌ Admins only.')
    await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
    try {
        const _reqs = await X.groupRequestParticipantsList(from)
        if (!_reqs?.length) return reply('📭 No pending join requests.')
        const _reqTxt = _reqs.map((r,i) => (i+1) + '. +' + r.jid.split('@')[0]).join('\n')
        reply('📋 *Pending Join Requests (' + _reqs.length + ')*\n\n' + _reqTxt + '\n\nUse .acceptall or .rejectall')
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Accept All Join Requests
case 'acceptall':
case 'approveall': {
    if (!isGroup) return reply('❌ Groups only.')
    if (!isBotAdmin) return reply('❌ Bot must be admin.')
    if (!isAdmin && !isOwner) return reply('❌ Admins only.')
    await X.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
    try {
        const _reqs2 = await X.groupRequestParticipantsList(from)
        if (!_reqs2?.length) return reply('📭 No pending requests.')
        await X.groupRequestParticipantsUpdate(from, _reqs2.map(r=>r.jid), 'approve')
        reply('✅ Accepted ' + _reqs2.length + ' join request(s).')
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Reject All Join Requests
case 'rejectall':
case 'denyall': {
    if (!isGroup) return reply('❌ Groups only.')
    if (!isBotAdmin) return reply('❌ Bot must be admin.')
    if (!isAdmin && !isOwner) return reply('❌ Admins only.')
    await X.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
    try {
        const _reqs3 = await X.groupRequestParticipantsList(from)
        if (!_reqs3?.length) return reply('📭 No pending requests.')
        await X.groupRequestParticipantsUpdate(from, _reqs3.map(r=>r.jid), 'reject')
        reply('❌ Rejected ' + _reqs3.length + ' join request(s).')
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Create New Group
case 'newgroup':
case 'creategc': {
    if (!isOwner) return reply('❌ Owner only.')
    if (!q) return reply('❌ Usage: .newgroup Group Name')
    await X.sendMessage(m.chat, { react: { text: '🆕', key: m.key } })
    try {
        const _gc = await X.groupCreate(q.trim(), [m.sender])
        reply('✅ Group *' + q.trim() + '* created!\nID: ' + (_gc.gid||_gc.id||'unknown'))
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Set Group Name
case 'groupname':
case 'setgcname':
case 'gcname': {
    if (!isGroup) return reply('❌ Groups only.')
    if (!isBotAdmin) return reply('❌ Bot must be admin.')
    if (!isAdmin && !isOwner) return reply('❌ Admins only.')
    if (!q) return reply('❌ Usage: .groupname New Name')
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
    try {
        await X.groupUpdateSubject(from, q.trim())
        reply('✅ Group name changed to *' + q.trim() + '*')
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Set Group Description
case 'gcdesc':
case 'setgcdesc':
case 'groupdesc': {
    if (!isGroup) return reply('❌ Groups only.')
    if (!isBotAdmin) return reply('❌ Bot must be admin.')
    if (!isAdmin && !isOwner) return reply('❌ Admins only.')
    await X.sendMessage(m.chat, { react: { text: '📝', key: m.key } })
    try {
        await X.groupUpdateDescription(from, q || '')
        reply('✅ Group description ' + (q ? 'updated' : 'cleared') + '.')
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// List Bot Groups
case 'mygroups':
case 'gclist':
case 'listgroups': {
    if (!isOwner) return reply('❌ Owner only.')
    await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
    try {
        const _gcs = await X.groupFetchAllParticipating()
        const _gcArr = Object.values(_gcs)
        if (!_gcArr.length) return reply('📭 Bot is not in any groups.')
        const _gcTxt = _gcArr.map((g,i)=>(i+1)+'. *'+g.subject+'* ['+( g.participants?.length||0)+' members]').join('\n')
        reply('📋 *Bot Groups (' + _gcArr.length + ')*\n\n' + _gcTxt)
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// View Once Bypass
case 'vv':
case 'viewonce': {
    if (!isOwner && !isAdmin) return reply('❌ Admins/Owner only.')
    await X.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })
    try {
        const _vvBuf = await X.downloadMediaMessage(m.quoted)
        const _vvMime = m.quoted?.message?.imageMessage?.mimetype || m.quoted?.message?.videoMessage?.mimetype || 'image/jpeg'
        const _isVid = _vvMime.startsWith('video')
        await X.sendMessage(from, {
            [_isVid ? 'video' : 'image']: _vvBuf,
            caption: '👁️ View Once revealed', contextInfo: global.getCtxInfo()
        }, { quoted: m })
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Get LID Info
case 'getlid': {
    if (!isOwner) return reply('❌ Owner only.')
    await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
    try {
        const _lidTarget = m.quoted ? m.quoted.sender : (q ? q.replace(/[^0-9]/g,'')+'@s.whatsapp.net' : m.sender)
        const _lidMeta = isGroup ? await getGroupMetadata(X, from) : null
        const _lidP = _lidMeta?.participants?.find(p => p.id === _lidTarget || p.pn === _lidTarget)
        reply('🔍 *JID/LID Info*\n\nJID: ' + _lidTarget + '\nLID: ' + (_lidP?.lid||'N/A') + '\nPhone: ' + (_lidP?.pn||_lidTarget.split('@')[0]))
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Sudo Management
case 'setsudo':
case 'addsudo': {
    if (!isOwner) return reply('❌ Owner only.')
    const _sudoTarget = m.quoted?.sender || (q ? q.replace(/[^0-9]/g,'') : null)
    if (!_sudoTarget) return reply('❌ Quote a message or provide a number.')
    const _sudoNum = _sudoTarget.includes('@') ? _sudoTarget.split('@')[0] : _sudoTarget
    if (!global.sudo) global.sudo = []
    if (global.sudo.includes(_sudoNum)) return reply('@' + _sudoNum + ' is already a sudo user.', null, [_sudoNum+'@s.whatsapp.net'])
    global.sudo.push(_sudoNum)
    try { require('./library/settings').saveSettings() } catch {}
    reply('✅ @' + _sudoNum + ' added as sudo (sub-owner).', null, [_sudoNum+'@s.whatsapp.net'])
    break
}
case 'delsudo':
case 'remsudo': {
    if (!isOwner) return reply('❌ Owner only.')
    const _delNum = (m.quoted?.sender || (q?q.replace(/[^0-9]/g,''):'')).replace('@s.whatsapp.net','')
    if (!_delNum) return reply('❌ Quote or provide a number.')
    if (!global.sudo?.includes(_delNum)) return reply('❌ Not in sudo list.')
    global.sudo = global.sudo.filter(n => n !== _delNum)
    try { require('./library/settings').saveSettings() } catch {}
    reply('✅ @' + _delNum + ' removed from sudo.', null, [_delNum+'@s.whatsapp.net'])
    break
}
case 'getsudo':
case 'sudolist': {
    if (!isOwner) return reply('❌ Owner only.')
    const _sudoList = global.sudo || []
    if (!_sudoList.length) return reply('📭 No sudo users set.')
    reply('👑 *Sudo Users (' + _sudoList.length + ')*\n\n' + _sudoList.map((n,i)=>(i+1)+'. @'+n).join('\n'), null, _sudoList.map(n=>n+'@s.whatsapp.net'))
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Check if Number is on WhatsApp
case 'onwa':
case 'isonwa':
case 'checkwa': {
    if (!q) return reply('❌ Usage: .onwa 254XXXXXXXXX')
    await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
    try {
        const _waNum = q.replace(/[^0-9]/g,'') + '@s.whatsapp.net'
        const _waCheck = await X.onWhatsApp(_waNum)
        const _isOnWa = _waCheck?.[0]?.exists
        reply('📱 *WhatsApp Check*\n\n+' + q.replace(/[^0-9]/g,'') + ' is ' + (_isOnWa ? '✅ on WhatsApp' : '❌ NOT on WhatsApp'))
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Export Group Contacts as VCF
case 'vcf':
case 'exportcontacts':
case 'contacts': {
    if (!isGroup) return reply('❌ Groups only.')
    if (!isAdmin && !isOwner) return reply('❌ Admins only.')
    await X.sendMessage(m.chat, { react: { text: '📇', key: m.key } })
    try {
        const _vcfMeta = await getGroupMetadata(X, from)
        const _gcSubj = _vcfMeta.subject || 'Group'
        let _vcf = '', _idx = 1
        for (const _p of _vcfMeta.participants) {
            const _pjid = _p.pn || _p.jid || _p.id
            if (!_pjid?.includes('@s.whatsapp.net')) continue
            const _pid = _pjid.split('@')[0]
            _vcf += 'BEGIN:VCARD\nVERSION:3.0\nFN:[' + (_idx++) + '] +' + _pid + '\nTEL;type=CELL;waid=' + _pid + ':+' + _pid + '\nEND:VCARD\n'
        }
        if (!_vcf) return reply('❌ No valid contacts found.')
        await X.sendMessage(from, {
            document: Buffer.from(_vcf.trim(), 'utf-8'), mimetype: 'text/vcard',
            fileName: _gcSubj + '.vcf',
            caption: '📇 *' + _gcSubj + '*\nContacts: ' + (_idx-1),
            contextInfo: global.getCtxInfo()
        }, { quoted: m })
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Notes System
case 'addnote':
case 'savenote': {
    if (!q) return reply('❌ Usage: .addnote Your note text')
    await X.sendMessage(m.chat, { react: { text: '📝', key: m.key } })
    try {
        const { addNote } = require('./library/notes')
        const _nCount = addNote(m.sender, q)
        reply('📝 Note #' + _nCount + ' saved!\n\n"' + q.slice(0,100) + (q.length>100?'...':'') + '"')
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}
case 'getnotes':
case 'notes':
case 'mynotes': {
    await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
    try {
        const { getNotes } = require('./library/notes')
        const _notes = getNotes(m.sender)
        if (!_notes.length) return reply('📭 You have no saved notes.\n\nUse .addnote <text> to save one.')
        const _nList = _notes.map((n,i)=>'*#'+(i+1)+'* '+n.text.slice(0,80)+(n.text.length>80?'...:':'')).join('\n')
        reply('📋 *Your Notes (' + _notes.length + ')*\n\n' + _nList + '\n\nUse .getnote <number> for full text')
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}
case 'getnote': {
    const _gn = parseInt(q)
    if (!_gn) return reply('❌ Usage: .getnote <number>')
    await X.sendMessage(m.chat, { react: { text: '📄', key: m.key } })
    try {
        const { getNote } = require('./library/notes')
        const _note = getNote(m.sender, _gn)
        if (!_note) return reply('❌ Note #' + _gn + ' not found. Use .notes to see your notes.')
        reply('📄 *Note #' + _gn + '*\n\n' + _note.text + '\n\n_Saved: ' + new Date(_note.created).toLocaleString() + '_')
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}
case 'updatenote':
case 'editnote': {
    const _unParts = (q||'').split(' ')
    const _unNum = parseInt(_unParts[0])
    const _unText = _unParts.slice(1).join(' ')
    if (!_unNum || !_unText) return reply('❌ Usage: .updatenote <number> New text')
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
    try {
        const { updateNote } = require('./library/notes')
        const _ok = updateNote(m.sender, _unNum, _unText)
        reply(_ok ? '✅ Note #' + _unNum + ' updated!' : '❌ Note #' + _unNum + ' not found.')
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}
case 'delnote':
case 'deletenote': {
    const _dn = parseInt(q)
    if (!_dn) return reply('❌ Usage: .delnote <number>')
    await X.sendMessage(m.chat, { react: { text: '🗑️', key: m.key } })
    try {
        const { deleteNote } = require('./library/notes')
        const _ok2 = deleteNote(m.sender, _dn)
        reply(_ok2 ? '✅ Note #' + _dn + ' deleted.' : '❌ Note #' + _dn + ' not found.')
    } catch(_e) { reply('❌ ' + _e.message) }
    break
}
case 'delallnotes':
case 'clearnotes': {
    await X.sendMessage(m.chat, { react: { text: '🗑️', key: m.key } })
    try {
        const { deleteAllNotes } = require('./library/notes')
        const _cnt = deleteAllNotes(m.sender)
        reply(_cnt > 0 ? '✅ Deleted ' + _cnt + ' note(s).' : '📭 You had no notes to delete.')
    } catch(_e) { reply('❌ ' + _e.message) }
    break
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
