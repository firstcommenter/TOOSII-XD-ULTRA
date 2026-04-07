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

// ── Channel React persistent settings ────────────────────────────────────────
;(() => {
    const _crFs = require('fs'), _crPath = require('path').join(__dirname, 'database', 'channelreact.json')
    const _crSave = () => {
        try {
            require('fs').mkdirSync(require('path').join(__dirname, 'database'), { recursive: true })
            _crFs.writeFileSync(_crPath, JSON.stringify({
                on: global.autoChannelReact || false,
                jid: global.autoChannelReactJid || '',
                emojis: global.autoChannelReactEmojis || [],
                count: global.autoChannelReactCount || 0
            }, null, 2))
        } catch {}
    }
    try {
        const _crData = JSON.parse(_crFs.readFileSync(_crPath, 'utf-8'))
        if (_crData.on)     global.autoChannelReact       = _crData.on
        if (_crData.jid)    global.autoChannelReactJid    = _crData.jid
        if (_crData.emojis && _crData.emojis.length) global.autoChannelReactEmojis = _crData.emojis
        if (_crData.count)  global.autoChannelReactCount  = _crData.count
    } catch {}
    global._saveCrSettings = _crSave
})()
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
const command = (isCmd ? budy.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '').replace(/^[^a-z0-9]+$/, '') // ignore dot-only non-commands like '...'
// fromMe + not a command = bot's own reply echoed back — skip to prevent loops
if (m.key.fromMe && !isCmd) return
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

// Sync X.public from saved botPublicMode (ensures mode survives restarts)
if (typeof global.botPublicMode !== 'undefined') X.public = (global.botPublicMode !== false)

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

// ── Anti-Link enforcement ─────────────────────────────────────────────────
// Lives OUTSIDE the !isAdmins/!isOwner block so it catches all senders.
// Admin/owner exemptions are handled internally.
if (global.antiLink && m.isGroup && !m.key.fromMe) {
    const _alText = budy || m.body || m.text || m.message?.extendedTextMessage?.text || m.message?.conversation || ''
    const _alIsLink = _alText && (
        /https?:\/\/[^\s]+/i.test(_alText) ||
        /(?:^|\s)www\.[a-z0-9-]+\.[a-z]{2,}[^\s]*/i.test(_alText) ||
        /(?:^|\s)(?:chat\.whatsapp\.com|wa\.me|t\.me|youtu\.be|bit\.ly|tinyurl\.com|goo\.gl)\/[^\s]*/i.test(_alText)
    )
    if (_alIsLink) {
        const _alAction = (global.antiLinkAction || 'delete').toLowerCase()
        const _alSenderNum = sender.split('@')[0]
        if (isOwner || isSudo) {
            // owner/sudo: notify only, no enforcement
        } else if (isAdmins) {
            // group admin: notify only, no enforcement
        } else {
            try { await X.sendMessage(m.chat, { delete: m.key }) } catch {}
            if (_alAction === 'kick') {
                try {
                    await X.groupParticipantsUpdate(from, [sender], 'remove')
                    await X.sendMessage(from, { text: `⚠️ *Anti-Link:* @${_alSenderNum} has been kicked for sharing a link.`, mentions: [sender] })
                } catch {
                    await X.sendMessage(from, { text: `⚠️ *Anti-Link:* Link deleted from @${_alSenderNum}. Could not kick (missing admin perms?).`, mentions: [sender] })
                }
            } else if (_alAction === 'warn') {
                if (!global.antiLinkWarns) global.antiLinkWarns = {}
                if (!global.antiLinkWarns[from]) global.antiLinkWarns[from] = {}
                global.antiLinkWarns[from][sender] = (global.antiLinkWarns[from][sender] || 0) + 1
                const _alWarnLimit = global.antiLinkWarnLimit || 3
                const _alCurrentWarns = global.antiLinkWarns[from][sender]
                if (_alCurrentWarns >= _alWarnLimit) {
                    try {
                        await X.groupParticipantsUpdate(from, [sender], 'remove')
                        global.antiLinkWarns[from][sender] = 0
                        try { require('./library/settings').saveSettings() } catch {}
                        await X.sendMessage(from, { text: `🚫 *Anti-Link:* @${_alSenderNum} reached ${_alWarnLimit} warnings and has been kicked!`, mentions: [sender] })
                    } catch {
                        await X.sendMessage(from, { text: `⚠️ *Anti-Link:* @${_alSenderNum} has ${_alCurrentWarns}/${_alWarnLimit} warnings! Could not kick.`, mentions: [sender] })
                    }
                } else {
                    await X.sendMessage(from, { text: `⚠️ *Anti-Link Warning ${_alCurrentWarns}/${_alWarnLimit}* for @${_alSenderNum}!\nLinks are not allowed. You will be kicked after ${_alWarnLimit} warnings.`, mentions: [sender] })
                }
            } else {
                await X.sendMessage(from, { text: `⚠️ *Anti-Link:* Links are not allowed here @${_alSenderNum}!`, mentions: [sender] })
            }
            return
        }
    }
}

// ── Helper: extract groupMentions from ALL message types ─────────────────
const _extractGroupMentions = (msg) => {
    if (!msg) return []
    const result = []
    for (const _mk of Object.keys(msg)) {
        const _gms = msg[_mk]?.contextInfo?.groupMentions
        if (_gms?.length) for (const gm of _gms) if (!result.some(r => r.groupJid === gm.groupJid)) result.push(gm)
    }
    return result
}

// ── Helper: extract mentionedJid from ALL message types ──────────────────
const _extractAllMentionedJids = (msg) => {
    if (!msg) return []
    const jids = new Set()
    for (const _mk of Object.keys(msg)) {
        const _mj = msg[_mk]?.contextInfo?.mentionedJid
        if (_mj?.length) for (const j of _mj) jids.add(j)
    }
    return [...jids]
}

// ── Anti Group Mention enforcement ───────────────────────────────────────
// Fires on @everyone, groupMentions API, or mass mentionedJid across any message type.
if (global.antiGroupMentionGroups?.[from]?.enabled && m.isGroup && !m.key.fromMe) {
    try {
        // Dedup: same message ID never processed twice
        if (!global._agmSeen) global._agmSeen = new Map()
        const _agmMsgId = m.key?.id
        let _agmAlreadySeen = false
        if (_agmMsgId) {
            if (global._agmSeen.has(_agmMsgId)) {
                _agmAlreadySeen = true
            } else {
                global._agmSeen.set(_agmMsgId, Date.now())
                if (global._agmSeen.size > 500) {
                    const _agmCutoff = Date.now() - 60000
                    for (const [_k, _t] of global._agmSeen) if (_t < _agmCutoff) global._agmSeen.delete(_k)
                }
            }
        }

        if (!_agmAlreadySeen) {
            // 1. groupMentions API (@everyone / WhatsApp native group tag)
            const _agmGroupMentions = _extractGroupMentions(m.message)
            const _agmHasGroupTag = _agmGroupMentions.some(gm =>
                gm.groupJid === from || gm.groupJid?.split('@')[0] === from.split('@')[0]
            )

            // 2. ANY mentionedJid across ALL message types (text, image, video, doc, audio, sticker)
            // Even a single @tag triggers AGM — this is the key difference from ASM
            const _agmAllJids = _extractAllMentionedJids(m.message)
            const _agmHasMention = _agmAllJids.length > 0

            // 3. Text-based: @all, @everyone, @here keywords OR .tagall / !tagall / /tagall commands
            const _agmText = (
                m.message?.conversation ||
                m.message?.extendedTextMessage?.text ||
                m.message?.imageMessage?.caption ||
                m.message?.videoMessage?.caption ||
                m.message?.documentMessage?.caption ||
                ''
            ).trim()
            const _agmHasTextTag = /^[.!/]tagall\b/i.test(_agmText) ||
                /@(all|everyone|here)\b/i.test(_agmText)

            if ((_agmHasGroupTag || _agmHasMention || _agmHasTextTag) && !isOwner && !isSudo && !isAdmins) {
                const _agmAction = (global.antiGroupMentionGroups[from].action || 'delete').toLowerCase()
                const _agmSenderNum = sender.split('@')[0]
                // Always silently delete the message
                try { await X.sendMessage(m.chat, { delete: m.key }) } catch {}
                if (_agmAction === 'kick') {
                    try {
                        await X.groupParticipantsUpdate(from, [sender], 'remove')
                        await X.sendMessage(from, { text: `🚫 *Anti Group Mention:* @${_agmSenderNum} was removed for tagging members in this group.`, mentions: [sender] })
                    } catch { /* silent if no admin */ }
                } else if (_agmAction === 'warn') {
                    if (!global._agmWarns) global._agmWarns = {}
                    const _agmWarnKey = `${from}:${sender}`
                    global._agmWarns[_agmWarnKey] = (global._agmWarns[_agmWarnKey] || 0) + 1
                    const _agmWCount = global._agmWarns[_agmWarnKey]
                    console.log(`[AGM] warn ${_agmWCount}/3 for ${_agmSenderNum} in ${from.split('@')[0]}`)
                    if (_agmWCount >= 3) {
                        try {
                            await X.groupParticipantsUpdate(from, [sender], 'remove')
                            global._agmWarns[_agmWarnKey] = 0
                        } catch { /* silent */ }
                    }
                }
                // delete mode: already deleted above, nothing else
                return
            }
        }
    } catch (_agmErr) { console.log('[AGM]', _agmErr.message || _agmErr) }
}

// ── Anti Status Mention — group notification path ─────────────────────────
// Catches WhatsApp's "Mention Group in Status" feature delivered into the group.
// Deduplication by message ID prevents double-processing under mass-mention load.
if (global.antiStatusMentionGroups?.[from]?.enabled && m.isGroup && !m.key.fromMe) {
    try {
        // 0. Dedup: same message ID never processed twice (handles mass mention bursts)
        if (!global._asmSeen) global._asmSeen = new Map()
        const _asmMsgId = m.key?.id
        let _asmAlreadySeen = false
        if (_asmMsgId) {
            if (global._asmSeen.has(_asmMsgId)) {
                _asmAlreadySeen = true
            } else {
                global._asmSeen.set(_asmMsgId, Date.now())
                if (global._asmSeen.size > 500) {
                    const _asmCutoff = Date.now() - 60000
                    for (const [_k, _t] of global._asmSeen) if (_t < _asmCutoff) global._asmSeen.delete(_k)
                }
            }
        }

        let _asmTriggered = false
        const _asmFromNum = from.split('@')[0]

        if (!_asmAlreadySeen && m.message) {
            // Helper: does a JID string match the current group?
            const _asmJidMatch = j => j && (j === from || j.split('@')[0] === _asmFromNum)

            // 1. Primary: groupStatusMentionMessage
            const _gsmMsg = m.message.groupStatusMentionMessage
            if (_gsmMsg) {
                const _gsmGroupId = _gsmMsg?.groupJid || _gsmMsg?.message?.groupJid
                if (!_gsmGroupId || _asmJidMatch(_gsmGroupId)) {
                    _asmTriggered = true
                    console.log(`[ASM] groupStatusMentionMessage from ${sender.split('@')[0]} in ${_asmFromNum}`)
                }
            }

            // 2. groupMentionedMessage
            if (!_asmTriggered && m.message.groupMentionedMessage) {
                const _gmmJid = m.message.groupMentionedMessage?.groupJid || m.message.groupMentionedMessage?.jid
                if (!_gmmJid || _asmJidMatch(_gmmJid)) {
                    _asmTriggered = true
                    console.log(`[ASM] groupMentionedMessage from ${sender.split('@')[0]} in ${_asmFromNum}`)
                }
            }

            // 3. statusMentionMessage
            if (!_asmTriggered && m.message.statusMentionMessage) {
                const _smmJid = m.message.statusMentionMessage?.groupJid
                if (!_smmJid || _asmJidMatch(_smmJid)) {
                    _asmTriggered = true
                    console.log(`[ASM] statusMentionMessage from ${sender.split('@')[0]} in ${_asmFromNum}`)
                }
            }

            // 4. contextInfo.groupMentions / mentionedJid across ALL message types
            if (!_asmTriggered) {
                const _asmCtxMentions = _extractGroupMentions(m.message)
                if (_asmCtxMentions.some(gm => _asmJidMatch(gm.groupJid))) {
                    _asmTriggered = true
                    console.log(`[ASM] contextInfo.groupMentions from ${sender.split('@')[0]} in ${_asmFromNum}`)
                }
            }

            // 5. Any key forwarded from status@broadcast mentioning this group
            if (!_asmTriggered) {
                for (const _fk of Object.keys(m.message)) {
                    const _fct = m.message[_fk]?.contextInfo
                    if (!_fct) continue
                    if (_fct.isForwarded && _fct.remoteJid === 'status@broadcast') {
                        const _fMentioned = _fct.mentionedJid || []
                        const _fGrpMentions = _fct.groupMentions || []
                        if (_fMentioned.some(_asmJidMatch) ||
                            _fGrpMentions.some(gm => _asmJidMatch(gm.groupJid))) {
                            _asmTriggered = true
                            console.log(`[ASM] fwd-from-status key:${_fk} from ${sender.split('@')[0]} in ${_asmFromNum}`)
                            break
                        }
                    }
                }
            }

            // 6. Catch-all: any unknown key whose name contains status/mention/group
            //    scanned for a groupJid/jid field pointing at this group
            if (!_asmTriggered) {
                const _asmCatchKeys = Object.keys(m.message).filter(k =>
                    /status|mention|group/i.test(k) && k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage'
                )
                for (const _ck of _asmCatchKeys) {
                    const _cv = m.message[_ck]
                    if (!_cv || typeof _cv !== 'object') continue
                    const _cjid = _cv.groupJid || _cv.jid || _cv.remoteJid
                    if (_cjid && _asmJidMatch(_cjid)) {
                        _asmTriggered = true
                        console.log(`[ASM] catch-all key:${_ck} from ${sender.split('@')[0]} in ${_asmFromNum}`)
                        break
                    }
                }
            }
        }

        if (_asmTriggered && !isOwner && !isSudo && !isAdmins) {
            const _asmAction = (global.antiStatusMentionGroups[from].action || 'warn').toLowerCase()
            const _asmSenderNum = sender.split('@')[0]
            // Always silently delete the status mention notification
            try { await X.sendMessage(m.chat, { delete: m.key }) } catch {}
            if (_asmAction === 'kick') {
                // Kick: remove user, send one message
                try {
                    await X.groupParticipantsUpdate(from, [sender], 'remove')
                    await X.sendMessage(from, { text: `🚫 *Anti Status Mention:* @${_asmSenderNum} was removed for tagging this group in their status.`, mentions: [sender] })
                } catch { /* silent if kick fails */ }
            } else if (_asmAction === 'warn') {
                // Warn: track silently, auto-kick at 3 with no announcement
                if (!global.statusMentionWarns) global.statusMentionWarns = {}
                const _asmWarnKey = `${from}:${sender}`
                global.statusMentionWarns[_asmWarnKey] = (global.statusMentionWarns[_asmWarnKey] || 0) + 1
                const _wCount = global.statusMentionWarns[_asmWarnKey]
                console.log(`[ASM] warn ${_wCount}/3 for ${_asmSenderNum} in ${from}`)
                if (_wCount >= 3) {
                    try {
                        await X.groupParticipantsUpdate(from, [sender], 'remove')
                        global.statusMentionWarns[_asmWarnKey] = 0
                    } catch { /* silent */ }
                }
            }
            // delete mode: already deleted above, nothing else sent
        }
    } catch (_asmNErr) { console.log('[ASM-notif]', _asmNErr.message || _asmNErr) }
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
    return X.sendMessage(m.chat, { text: '🔒 *Bot is in Private Mode.*\n_Only the owner and sudo users can use commands._\n\n📢 *Follow our channel to stay updated!*', contextInfo: global.getCtxInfo() }, { quoted: m })
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
║ 🔑 *Session* : https://toosiitechdevelopertools.zone.id/session

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
// Download Features
case 'mfdl':
case 'mediafire':
case 'mfire': {
    await X.sendMessage(m.chat, { react: { text: '📥', key: m.key } })
    if (!text) return reply(`╔══〔 📥 MEDIAFIRE 〕══════╗\n║ *Usage:* ${prefix}mediafire [link]\n║ Example: ${prefix}mediafire https://mediafire.com/...\n╚═══════════════════════╝`)
    try {
      let _mfDlLink = null, _mfFileName = null, _mfMime = null

      // Source 1: Keith mfire API
      try {
        const _kMf = await fetch(`https://apiskeith.top/download/mfire?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
        const _kMfd = await _kMf.json()
        console.log('[mfire] keith: status=', _kMfd.status)
        if (_kMfd.status && _kMfd.result?.dl_link) {
          _mfDlLink   = _kMfd.result.dl_link
          _mfFileName = _kMfd.result.fileName || 'mediafire_file'
          const _ext  = _mfFileName.split('.').pop().toLowerCase()
          _mfMime = _ext === 'mp4' ? 'video/mp4' : _ext === 'mp3' ? 'audio/mpeg' : `application/${_ext}`
        }
      } catch (_kMfE) { console.log('[mfire] keith:', _kMfE.message) }

      // Source 2: HTML scraping fallback
      if (!_mfDlLink) {
        const _mfHtml = await axios.get(text, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 20000
        })
        const _mfPage = _mfHtml.data || ''
        const _dlMatch = _mfPage.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/)
          || _mfPage.match(/"downloadUrl":"([^"]+)"/)
          || _mfPage.match(/id="downloadButton"[^>]+href="([^"]+)"/)
        if (!_dlMatch) return reply('❌ Could not extract download link. Please check the MediaFire URL.')
        _mfDlLink = _dlMatch[1].replace(/&amp;/g, '&')
        const _fnMatch = _mfPage.match(/"filename"\s*:\s*"([^"]+)"/)
          || _mfPage.match(/class="filename"[^>]*>([^<]+)</)
          || _mfPage.match(/<title>([^<|]+)/)
        _mfFileName = (_fnMatch ? _fnMatch[1].trim() : 'mediafire_file')
        const _ext2 = _mfFileName.split('.').pop().toLowerCase()
        _mfMime = _ext2 === 'mp4' ? 'video/mp4' : _ext2 === 'mp3' ? 'audio/mpeg' : `application/${_ext2}`
      }

      const _mfBuf = await axios.get(_mfDlLink, {
        responseType: 'arraybuffer', timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      })
      await X.sendMessage(m.chat, { document: Buffer.from(_mfBuf.data), fileName: _mfFileName, mimetype: _mfMime }, { quoted: m })
    } catch (err) {
      console.error('[MEDIAFIRE]', err.message)
      reply('❌ Download failed. Make sure the MediaFire link is valid and public.')
    }
}
break
case 'ig':
  case 'instagram': {
      await X.sendMessage(m.chat, { react: { text: '📸', key: m.key } })
      if (!text) return reply(`╔══〔 📸 INSTAGRAM DL 〕═══╗\n\n║ Usage: *${prefix}ig [link]*\n║ Example: ${prefix}ig https://www.instagram.com/p/...\n╚═══════════════════════╝`);
      let _igUrl = null

      // Source 1: igdl library (btch-downloader)
      try {
          const mediaUrl = await igdl(text);
          if (mediaUrl?.[0]?.url) _igUrl = mediaUrl[0].url
          console.log('[ig] igdl:', _igUrl ? 'success' : 'no url')
      } catch(_e1) { console.log('[ig] igdl:', _e1.message) }

      // Source 2: api-dylux ig downloader
      if (!_igUrl) {
        try {
          const { igdl: _dyluxIg } = require('api-dylux')
          const _dynRes = await Promise.race([_dyluxIg(text), new Promise(r=>setTimeout(()=>r(null),15000))])
          if (_dynRes?.[0]?.url) { _igUrl = _dynRes[0].url; console.log('[ig] api-dylux: success') }
        } catch(_e2) { console.log('[ig] api-dylux:', _e2.message) }
      }

      // Source 3: GiftedTech instadl
      if (!_igUrl) {
        try {
          let _gtIg = await fetch(`${_GTAPI}/api/download/instadl?apikey=${_giftedKey()}&url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
          let _gtIgd = await _gtIg.json()
          console.log('[ig] gifted:', _gtIgd.success)
          if (_gtIgd.success && _gtIgd.result?.download_url) _igUrl = _gtIgd.result.download_url
        } catch(_e3) { console.log('[ig] gifted:', _e3.message) }
      }

      // Source 4: Keith instadl
      if (!_igUrl) {
        try {
          let _kIg = await fetch(`https://apiskeith.top/download/instadl?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
          let _kIgd = await _kIg.json()
          console.log('[ig] keith:', _kIgd.status)
          const _kIgUrl = _kIgd?.result
          if (_kIgd.status && typeof _kIgUrl === 'string' && _kIgUrl.startsWith('http')) _igUrl = _kIgUrl
          else if (_kIgd.status && Array.isArray(_kIgUrl) && _kIgUrl[0]?.url) _igUrl = _kIgUrl[0].url
        } catch(_e4) { console.log('[ig] keith:', _e4.message) }
      }

      if (!_igUrl) return reply('❌ Failed to download. The link may be private or invalid. Try again.')
      try {
          const response = await axios.head(_igUrl);
          const contentType = response.headers['content-type'];
          if (contentType && contentType.startsWith('image/')) {
              await safeSendMedia(m.chat, { image: { url: _igUrl}, caption: `╔══〔 📸 INSTAGRAM DOWNLOAD 〕╗
║ ✅ Downloaded!
╚═══════════════════════╝` }, {}, { quoted: m });
          } else {
              await safeSendMedia(m.chat, { video: { url: _igUrl}, caption: `╔══〔 📸 INSTAGRAM DOWNLOAD 〕╗
║ ✅ Downloaded!
╚═══════════════════════╝` }, {}, { quoted: m });
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
      if (!text) return reply(`╔══〔 🐦 TWITTER DOWNLOADER 〕══╗\n\n║ Usage: *${prefix + command} <link>*\n║ Example: ${prefix + command} https://x.com/i/status/...\n╚═══════════════════════╝`)
      let _twUrl = null, _twThumb = null

      // Source 1: EliteProTech /twitter (working endpoint)
      try {
        const _epTw = await fetch(`https://eliteprotech-apis.zone.id/twitter?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
        const _epTwd = await _epTw.json()
        console.log('[tw] eliteprotech/twitter: success=', _epTwd.success, 'count=', _epTwd.data?.length)
        if (_epTwd.success && Array.isArray(_epTwd.data) && _epTwd.data.length) {
          // Pick highest quality entry
          const _sorted = [..._epTwd.data].sort((a,b) => (parseInt(b.quality||b.resolution)||0) - (parseInt(a.quality||a.resolution)||0))
          const _pick = _sorted.find(x => x.url) || _sorted[0]
          if (_pick?.url) { _twUrl = _pick.url; _twThumb = _epTwd.thumbnail || null }
        }
      } catch(_e1) { console.log('[tw] eliteprotech/twitter:', _e1.message) }

      // Source 2: GiftedTech twitter
      if (!_twUrl) {
        try {
          const _gtTw = await fetch(`${_GTAPI}/api/download/twitter?apikey=${_giftedKey()}&url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
          const _gtTwd = await _gtTw.json()
          console.log('[tw] gifted:', _gtTwd.success)
          if (_gtTwd.success && _gtTwd.result?.videoUrls?.length) {
            const _sorted = _gtTwd.result.videoUrls.sort((a,b) => (parseInt(b.quality)||0) - (parseInt(a.quality)||0))
            _twUrl = _sorted[0].url
            _twThumb = _gtTwd.result.thumbnail || null
          }
        } catch(_e2) { console.log('[tw] gifted:', _e2.message) }
      }

      // Source 3: Keith twitter
      if (!_twUrl) {
        try {
          const _kTw = await fetch(`https://apiskeith.top/download/twitter?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
          const _kTwd = await _kTw.json()
          console.log('[tw] keith:', _kTwd.status)
          if (_kTwd.status && _kTwd.result) {
            _twUrl = _kTwd.result.video_hd || _kTwd.result.video_sd || null
            _twThumb = _kTwd.result.thumb || null
          }
        } catch(_e3) { console.log('[tw] keith:', _e3.message) }
      }

      if (!_twUrl) return reply('❌ Failed to download. The link may be invalid or the tweet has no video.')
      try {
        await safeSendMedia(m.chat, { video: { url: _twUrl }, caption: '✅ Downloaded from X/Twitter' }, {}, { quoted: m })
      } catch(e) { reply('❌ Error sending media: ' + e.message) }
  }
  break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🕵️  SOCIAL STALKER (Keith API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  case 'tiktokstalk':
  case 'tikstalk': {
      await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
      const _tksu = q?.trim() || text?.trim()
      if (!_tksu) return reply(`╌══〔 🎵 TIKTOK STALK 〕══╌\n║ *Usage:* ${prefix}tiktokstalk [@username]\n║ Example: ${prefix}tiktokstalk @charlidamelio\n╚═══════════════════════╝`)
      try {
          await reply(`🔍 _Stalking TikTok: ${_tksu}..._`)
          const _tkd = await _keithFetch(`/stalker/tiktok?q=${encodeURIComponent(_tksu.replace('@',''))}`)
          const _tkp = _tkd?.result?.profile || _tkd?.profile
          const _tks = _tkd?.result?.stats   || _tkd?.stats || {}
          if (!_tkp?.username) throw new Error('User not found')
          const _tkAvatar = _tkp.avatars?.large || _tkp.avatars?.medium
          const _fmtNum = n => (typeof n === 'number' && n >= 0) ? n.toLocaleString() : 'N/A'
          let caption = `╌══〔 🎵 TIKTOK PROFILE 〕═╌\n`
          caption += `\n👤 *@${_tkp.username}*`
          if (_tkp.nickname) caption += ` _(${_tkp.nickname})_`
          caption += `\n`
          if (_tkp.bio) caption += `\n💬 *Bio:* ${_tkp.bio}\n`
          caption += `\n👥 *Followers:* ${_fmtNum(_tks.followers)}`
          caption += `\n💞 *Following:* ${_fmtNum(_tks.following)}`
          caption += `\n❤️ *Total Likes:* ${_fmtNum(_tks.likes)}`
          caption += `\n🎬 *Videos:* ${_tks.videos ?? 'N/A'}`
          caption += `\n👫 *Friends:* ${_fmtNum(_tks.friends)}`
          if (_tkp.verified) caption += `\n✅ *Verified Account*`
          if (_tkp.private) caption += `\n🔒 *Private Account*`
          if (_tkp.createdAt) caption += `\n📅 *Joined:* ${new Date(_tkp.createdAt).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })}`
          caption += `\n\n╚═══════════════════════╝`
          if (_tkAvatar) {
              try { await X.sendMessage(m.chat, { image: { url: _tkAvatar }, caption }, { quoted: m }); break } catch {}
          }
          await reply(caption)
      } catch(e) { reply(`❌ Could not stalk TikTok user *${_tksu}*. Make sure the username is correct.`) }
  } break

  case 'igstalk':
  case 'instastalk': {
      await X.sendMessage(m.chat, { react: { text: '📷', key: m.key } })
      const _igsu = q?.trim() || text?.trim()
      if (!_igsu) return reply(`╌══〔 📷 INSTAGRAM STALK 〕╌\n║ *Usage:* ${prefix}igstalk [@username]\n║ Example: ${prefix}igstalk @cristiano\n╚═══════════════════════╝`)
      try {
          await reply(`🔍 _Stalking Instagram: ${_igsu}..._`)
          const _igd = await _keithFetch(`/stalker/ig?q=${encodeURIComponent(_igsu.replace('@',''))}`)
          const _igp  = _igd?.result?.profile || _igd?.profile
          const _igs  = _igd?.result?.stats   || _igd?.stats  || {}
          const _igst = _igd?.result?.status  || _igd?.status || {}
          if (!_igp?.username) throw new Error('Not found')
          const _igAvatar = _igp.avatars?.hd || _igp.avatars?.standard
          const _fmtNum = n => (typeof n === 'number') ? n.toLocaleString() : 'N/A'
          let caption = `╌══〔 📷 INSTAGRAM PROFILE 〕╌\n`
          caption += `\n👤 *${_igp.username}*`
          if (_igp.fullName) caption += ` _(${_igp.fullName})_`
          caption += `\n`
          if (_igp.biography) caption += `\n💬 *Bio:* ${_igp.biography}\n`
          if (_igp.category) caption += `🏷️ *Category:* ${_igp.category}\n`
          caption += `\n👥 *Followers:* ${_fmtNum(_igs.followers)}`
          caption += `\n💞 *Following:* ${_fmtNum(_igs.following)}`
          caption += `\n🖼️ *Posts:* ${_igs.mediaCount ?? 'N/A'}`
          if (_igs.engagementRate) caption += `\n📊 *Engagement:* ${_igs.engagementRate}`
          if (_igst.isVerified) caption += `\n✅ *Verified Account*`
          if (_igst.isPrivate) caption += `\n🔒 *Private Account*`
          if (_igst.isBusiness) caption += `\n🏢 *Business Account*`
          if (_igp.externalUrl) caption += `\n🔗 ${_igp.externalUrl}`
          caption += `\n\n╚═══════════════════════╝`
          if (_igAvatar) {
              try { await X.sendMessage(m.chat, { image: { url: _igAvatar }, caption }, { quoted: m }); break } catch {}
          }
          await reply(caption)
      } catch(e) { reply(`❌ Could not fetch Instagram profile *${_igsu}*. Check the username and try again.`) }
  } break

  case 'twitterstalk':
  case 'xstalk': {
      await X.sendMessage(m.chat, { react: { text: '🐦', key: m.key } })
      const _twsu = q?.trim() || text?.trim()
      if (!_twsu) return reply(`╌══〔 🐦 TWITTER/X STALK 〕═╌\n║ *Usage:* ${prefix}twitterstalk [@username]\n║ Example: ${prefix}twitterstalk @elonmusk\n╚═══════════════════════╝`)
      try {
          await reply(`🔍 _Stalking X/Twitter: ${_twsu}..._`)
          const _twsd = await _keithFetch(`/stalker/twitter?user=${encodeURIComponent(_twsu.replace('@',''))}`)
          const _twsp = _twsd?.profile || _twsd?.result?.profile || _twsd
          if (!_twsp?.username) throw new Error('User not found')
          let msg = `╌══〔 🐦 TWITTER/X PROFILE 〕╌\n`
          msg += `\n👤 *@${_twsp.username}*\n`
          if (_twsp.displayName || _twsp.name) msg += `   🏷️ ${_twsp.displayName || _twsp.name}\n`
          if (_twsp.bio || _twsp.description) msg += `\n💬 *Bio:* ${_twsp.bio || _twsp.description}\n`
          if (_twsp.followers !== undefined) msg += `\n👥 *Followers:* ${(_twsp.followers || 0).toLocaleString()}\n`
          if (_twsp.following !== undefined) msg += `💞 *Following:* ${(_twsp.following || 0).toLocaleString()}\n`
          if (_twsp.tweets !== undefined) msg += `📝 *Tweets:* ${(_twsp.tweets || 0).toLocaleString()}\n`
          if (_twsp.likes !== undefined) msg += `❤️ *Likes:* ${(_twsp.likes || 0).toLocaleString()}\n`
          if (_twsp.location) msg += `📍 *Location:* ${_twsp.location}\n`
          if (_twsp.verified || _twsp.isVerified) msg += `✅ *Verified Account*\n`
          if (_twsp.joinDate || _twsp.created) msg += `📅 *Joined:* ${_twsp.joinDate || _twsp.created}\n`
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply(`❌ Could not stalk *${_twsu}*. Check the username and try again.`) }
  } break


  case 'githubtrends':
  case 'ghtrend': {
      await X.sendMessage(m.chat, { react: { text: '💜', key: m.key } })
      try {
          await reply('🔍 _Fetching GitHub trending repos..._')
          const _ghd = await _keithFetch('/stalker/githubtrend')
          const _gha = Array.isArray(_ghd) ? _ghd : (_ghd?.result || _ghd?.repos || [])
          if (!_gha.length) throw new Error('No data')
          let msg = `╌══〔 💜 GITHUB TRENDING 〕═╌\n`
          for (let r of _gha.slice(0, 10)) { msg += `\n${r.rank || '?'}. *${r.title || r.name}*\n   ✍️ ${r.author || ''}  |  🔗 ${r.url || ''}\n` }
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply('❌ Could not fetch GitHub trends. Try again later.') }
  } break

  case 'countryinfo':
  case 'country': {
      await X.sendMessage(m.chat, { react: { text: '🌍', key: m.key } })
      const _ciq = q?.trim() || text?.trim()
      if (!_ciq) return reply(`╌══〔 🌍 COUNTRY INFO 〕══╌\n║ *Usage:* ${prefix}country [name]\n║ Example: ${prefix}country Kenya\n╚═══════════════════════╝`)
      try {
          await reply(`🌍 _Looking up: ${_ciq}..._`)
          const _cid = await _keithFetch(`/stalker/country?q=${encodeURIComponent(_ciq)}`)
          const _cib = _cid?.basicInfo
          const _cig = _cid?.geography
          const _cic = _cid?.culture
          const _civ = _cid?.government
          if (!_cib?.name) throw new Error('Not found')
          const _ciContinent = _cig?.continent?.emoji ? `${_cig.continent.emoji} ${_cig.continent.name}` : ''
          const _ciNeighbors = (_cig?.neighbors || []).map(n => n.name).join(', ')
          const _ciLangs = (_cic?.languages?.native || []).map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')
          let caption = `╌══〔 🌍 ${_cib.name.toUpperCase()} 〕╌\n`
          caption += `\n🏳️ *Country:* ${_cib.name}`
          if (_cib.capital) caption += `\n🏢 *Capital:* ${_cib.capital}`
          if (_ciContinent) caption += `\n🗺️ *Continent:* ${_ciContinent}`
          if (_civ?.currency) caption += `\n💰 *Currency:* ${_civ.currency}`
          if (_ciLangs) caption += `\n🗣️ *Languages:* ${_ciLangs}`
          if (_civ?.constitutionalForm) caption += `\n🏛️ *Government:* ${_cib.name.charAt(0).toUpperCase() + _civ.constitutionalForm.slice(1)}`
          if (_cig?.area?.sqKm) caption += `\n📐 *Area:* ${_cig.area.sqKm.toLocaleString()} km²`
          if (_cib.phoneCode) caption += `\n📞 *Phone Code:* ${_cib.phoneCode}`
          if (_cib.internetTLD) caption += `\n🌐 *TLD:* ${_cib.internetTLD}`
          if (_cig?.landlocked !== undefined) caption += `\n⛵ *Landlocked:* ${_cig.landlocked ? 'Yes' : 'No'}`
          if (_cic?.famousFor) caption += `\n⭐ *Famous For:* ${_cic.famousFor}`
          if (_cic?.drivingSide) caption += `\n🚗 *Drives on:* ${_cic.drivingSide} side`
          if (_ciNeighbors) caption += `\n🤝 *Neighbors:* ${_ciNeighbors}`
          if (_cib.googleMaps) caption += `\n📍 ${_cib.googleMaps}`
          caption += `\n\n╚═══════════════════════╝`
          if (_cib.flag) {
              try { await X.sendMessage(m.chat, { image: { url: _cib.flag }, caption }, { quoted: m }); break } catch {}
          }
          await reply(caption)
      } catch(e) { reply(`❌ Country *${_ciq}* not found. Try the full country name.`) }
  } break

  case 'forex':
  case 'exchange':
  case 'convert':
  case 'rate': {
      await X.sendMessage(m.chat, { react: { text: '💱', key: m.key } })
      // Usage: .forex [amount] [FROM] [TO]  |  .forex [FROM] [TO]  |  .forex [TO]
      const _fxInput = (q?.trim() || text?.trim() || '').toUpperCase()
      if (!_fxInput) return reply(
          `╌══〔 💱 FOREX CONVERTER 〕══╌\n` +
          `║ *Usage:*\n` +
          `║   ${prefix}forex [to]          → 1 USD to currency\n` +
          `║   ${prefix}forex [from] [to]   → 1 unit conversion\n` +
          `║   ${prefix}forex [amt] [from] [to]\n` +
          `║\n` +
          `║ *Examples:*\n` +
          `║   ${prefix}forex KES\n` +
          `║   ${prefix}forex USD KES\n` +
          `║   ${prefix}forex 500 KES USD\n` +
          `╚═══════════════════════╝`
      )
      try {
          // Normalize common informal currency names/codes to ISO 4217
          const _fxAlias = { KSH:'KES', TSH:'TZS', SHS:'KES', KSHS:'KES', TSHS:'TZS', NAIRA:'NGN', CEDIS:'GHS', CEDI:'GHS', RAND:'ZAR', POUNDS:'GBP', POUND:'GBP', EURO:'EUR', EUROS:'EUR', DOLLAR:'USD', DOLLARS:'USD', FRANC:'XOF', BIRR:'ETB', SHILLING:'KES', SHILLINGS:'KES' }
          const _fxNorm = c => { const u = c?.toUpperCase?.()?.replace?.(/[^A-Z]/g,''); return _fxAlias[u] || u || '' }
          // Strip connector words (to/into/→/=) so "100ksh to tsh" → "100ksh tsh"
          const _fxClean = _fxInput.replace(/\bTO\b|\bINTO\b|→|=>/g, ' ').trim()
          const _fxParts = _fxClean.split(/\s+/).filter(Boolean)
          let _fxAmt = 1, _fxFrom = 'USD', _fxTo
          if (_fxParts.length === 1) {
              // ".forex KES" or ".forex 100KES"
              const _n = parseFloat(_fxParts[0])
              const _c = _fxNorm(_fxParts[0].replace(/[\d.,]/g, ''))
              if (!isNaN(_n) && _c) { _fxAmt = _n; _fxTo = _c }
              else { _fxTo = _fxNorm(_fxParts[0]) }
          } else if (_fxParts.length === 2) {
              // "100KSH TSH" or "100 KSH" or "USD KES"
              const _n0 = parseFloat(_fxParts[0])
              const _c0 = _fxNorm(_fxParts[0].replace(/[\d.,]/g, ''))
              const _c1 = _fxNorm(_fxParts[1])
              if (!isNaN(_n0) && _c0) { _fxAmt = _n0; _fxFrom = _c0; _fxTo = _c1 }      // "100KSH TSH"
              else if (!isNaN(_n0))   { _fxAmt = _n0; _fxTo = _c1 }                      // "100 KES"
              else                     { _fxFrom = _fxNorm(_fxParts[0]); _fxTo = _c1 }   // "USD KES"
          } else {
              // "100 KSH TSH" — 3+ parts
              const _n0 = parseFloat(_fxParts[0])
              const _c0 = _fxNorm(_fxParts[0].replace(/[\d.,]/g, ''))
              if (!isNaN(_n0) && _c0) { _fxAmt = _n0; _fxFrom = _c0; _fxTo = _fxNorm(_fxParts[1]) }    // "100KSH TSH"
              else if (!isNaN(_n0))   { _fxAmt = _n0; _fxFrom = _fxNorm(_fxParts[1]); _fxTo = _fxNorm(_fxParts[2]) } // "100 KSH TSH"
              else { _fxFrom = _fxNorm(_fxParts[0]); _fxTo = _fxNorm(_fxParts[1]) }
          }
          if (!_fxTo) return reply('❌ Please specify a target currency. Example: `.forex KES`')
          await reply(`💱 _Converting ${_fxAmt} ${_fxFrom} → ${_fxTo}..._`)
          // Fetch both rates (USD→FROM and USD→TO)
          let _fxRateFrom = 1, _fxRateTo = 1
          if (_fxFrom !== 'USD') {
              const _fxD = await _keithFetch(`/finance/exchange?q=${_fxFrom}`)
              if (!_fxD?.rate) return reply(`❌ Unknown currency: *${_fxFrom}*`)
              _fxRateFrom = _fxD.rate
          }
          if (_fxTo !== 'USD') {
              const _fxD2 = await _keithFetch(`/finance/exchange?q=${_fxTo}`)
              if (!_fxD2?.rate) return reply(`❌ Unknown currency: *${_fxTo}*`)
              _fxRateTo = _fxD2.rate
          }
          const _fxResult = (_fxAmt * _fxRateTo) / _fxRateFrom
          const _fxRate = _fxRateTo / _fxRateFrom
          let msg = `╌══〔 💱 FOREX CONVERTER 〕══╌\n`
          msg += `\n💵 *${_fxAmt.toLocaleString()} ${_fxFrom}*\n`
          msg += `   = *${_fxResult.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${_fxTo}*\n`
          msg += `\n📊 *Rate:* 1 ${_fxFrom} = ${_fxRate.toFixed(4)} ${_fxTo}\n`
          msg += `🏦 *Base:* USD (via exchange rates)\n`
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply('❌ Currency conversion failed. Check the currency codes and try again.') }
  } break

  case 'npminfo':
  case 'npm': {
      await X.sendMessage(m.chat, { react: { text: '📦', key: m.key } })
      const _npq = q?.trim() || text?.trim()
      if (!_npq) return reply(`╌══〔 📦 NPM INFO 〕═══════╌\n║ *Usage:* ${prefix}npm [package-name]\n║ Example: ${prefix}npm baileys\n╚═══════════════════════╝`)
      try {
          await reply(`📦 _Looking up npm: ${_npq}..._`)
          const _npd = await _keithFetch(`/stalker/npm?q=${encodeURIComponent(_npq)}`)
          const _npr = _npd?.result || _npd
          const _npm = _npr?.metadata || _npr
          const _npv = _npr?.versions || {}
          const _npDeps = _npr?.dependencies || {}
          if (!_npm?.name) throw new Error('Not found')
          let msg = `╌══〔 📦 NPM: ${_npm.name} 〕══╌\n`
          if (_npm.description) msg += `\n📝 *Description:* ${_npm.description}\n`
          if (_npm.license) msg += `📄 *License:* ${_npm.license}\n`
          if (_npv.latest) msg += `\n📌 *Latest Version:* v${_npv.latest}\n`
          if (_npv.latestPublishTime) msg += `📅 *Last Published:* ${new Date(_npv.latestPublishTime).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })}\n`
          if (_npv.count) msg += `🗂️ *Total Versions:* ${_npv.count}\n`
          if (_npv.first) msg += `🕰️ *First Version:* v${_npv.first}\n`
          if (_npv.initialPublishTime) msg += `📅 *First Published:* ${new Date(_npv.initialPublishTime).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })}\n`
          if (_npr?.maintainers?.length) msg += `\n✍️ *Maintainers:* ${_npr.maintainers.slice(0, 3).join(', ')}\n`
          if (_npDeps?.latestCount) msg += `📦 *Dependencies:* ${_npDeps.latestCount}\n`
          if (_npm.keywords?.length) msg += `🏷️ *Keywords:* ${_npm.keywords.slice(0, 6).join(', ')}\n`
          if (_npr?.repository) msg += `\n🔗 *Repo:* ${_npr.repository}\n`
          msg += `\n\`\`\`npm install ${_npm.name}\`\`\``
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply(`❌ Package *${_npq}* not found on npm.`) }
  } break

  case 'pinterestsearch':
  case 'pinstalk':
  case 'pinterest': {
      await X.sendMessage(m.chat, { react: { text: '📌', key: m.key } })
      const _piq = q?.trim() || text?.trim()
      if (!_piq) return reply(`╌══〔 📌 PINTEREST STALK 〕╌\n║ *Usage:* ${prefix}pinterest [username]\n║ Example: ${prefix}pinterest nasa\n╚═══════════════════════╝`)
      try {
          await reply(`📌 _Looking up Pinterest: ${_piq}..._`)
          const _pid = await _keithFetch(`/stalker/pinterest?q=${encodeURIComponent(_piq.replace('@',''))}`)
          const _piu = _pid?.result?.data || _pid?.data
          if (!_piu?.username) throw new Error('Not found')
          const _piAvatar = _piu.image?.original || _piu.image?.large || _piu.image?.medium
          const _fmtNum = n => (typeof n === 'number') ? n.toLocaleString() : 'N/A'
          const _piStats = _piu.stats || {}
          let caption = `╌══〔 📌 PINTEREST PROFILE 〕╌\n`
          caption += `\n👤 *@${_piu.username}*`
          if (_piu.full_name) caption += ` _(${_piu.full_name})_`
          caption += `\n`
          if (_piu.bio) caption += `\n💬 *Bio:* ${_piu.bio}\n`
          caption += `\n📌 *Pins:* ${_fmtNum(_piStats.pins)}`
          caption += `\n📋 *Boards:* ${_fmtNum(_piStats.boards)}`
          caption += `\n👥 *Followers:* ${_fmtNum(_piStats.followers)}`
          caption += `\n💞 *Following:* ${_fmtNum(_piStats.following)}`
          if (_piu.is_verified?.verified) caption += `\n✅ *Verified Account*`
          if (_piu.website) caption += `\n🔗 ${_piu.website}`
          if (_piu.location) caption += `\n📍 ${_piu.location}`
          if (_piu.created_at) caption += `\n📅 *Joined:* ${_piu.created_at}`
          if (_piu.profile_url) caption += `\n\n🌐 ${_piu.profile_url}`
          caption += `\n\n╚═══════════════════════╝`
          if (_piAvatar) {
              try { await X.sendMessage(m.chat, { image: { url: _piAvatar }, caption }, { quoted: m }); break } catch {}
          }
          await reply(caption)
      } catch(e) { reply(`❌ Pinterest user *${_piq}* not found. Try again.`) }
  } break



  case 'firelogo':
  case 'flogo': {
      await X.sendMessage(m.chat, { react: { text: '🔥', key: m.key } })
      if (!text) return reply(`╔═══〔 🔥 FIRE LOGO 〕════╗\n\n║ Usage: *${prefix + command} [your text]*\n║ Example: ${prefix + command} TOOSII\n╚═══════════════════════╝`)
      try {
        const _fl = await fetch(`https://eliteprotech-apis.zone.id/firelogo?text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
        const _fld = await _fl.json()
        if (_fld.success && _fld.image) {
          await safeSendMedia(m.chat, { image: { url: _fld.image }, caption: `🔥 *Fire Logo* : ${text}` }, {}, { quoted: m })
        } else reply('❌ Failed to generate logo. Try shorter text.')
      } catch(e) { reply('❌ Error: ' + e.message) }
  }
  break

  case 'spotify':
  case 'sp': {
      await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
      if (!text) return reply(`╔══〔 🎵 SPOTIFY 〕════════╗\n\n║ *Download:* ${prefix}spotify [track url]\n║ *Search:*   ${prefix}spotify [song name]\n╚═══════════════════════╝`)
      const _isSpotUrl = /open\.spotify\.com\/track|spotify\.link/i.test(text)
      if (!_isSpotUrl) {
          // Song name search → show YouTube results
          try {
              let _srch = await yts(text)
              let _hits = (_srch.all || []).filter(v => v.type === 'video').slice(0, 5)
              if (!_hits.length) return reply('❌ No results found. Try different keywords.')
              let _out = `╔══〔 🔍 SPOTIFY SEARCH 〕══╗\n\n`
              _hits.forEach((v, i) => {
                  _out += `║ *${i+1}.* ${(v.title||'').slice(0,50)}\n`
                  _out += `║    👤 ${v.author?.name || 'Unknown'} | ⏱️ ${v.timestamp || '?'}\n`
              })
              _out += `╠══〔 📥 DOWNLOAD 〕════════╣\n║ Use *${prefix}play [song name]* to download\n╚═══════════════════════╝`
              return reply(_out)
          } catch (_se) { return reply('❌ Search failed: ' + _se.message) }
      }
      try {
        const _sp = await fetch(`https://eliteprotech-apis.zone.id/spotify?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(25000) })
        const _spd = await _sp.json()
        if (_spd.success && _spd.data?.download) {
          const _meta = _spd.data.metadata
          const _cap = `🎵 *${_meta?.title || 'Track'}*\n👤 ${_meta?.artist || 'Unknown'}\n⏱️ ${_meta?.duration || '--:--'}\n\n_Downloaded via Toosii Tech_`
          await X.sendMessage(m.chat, { audio: { url: _spd.data.download }, mimetype: 'audio/mpeg', fileName: `${_meta?.title || 'spotify'}.mp3` }, { quoted: m })
          await reply(_cap)
        } else {
          // Fallback: Keith Spotify
          try {
            let _kSp = await fetch(`https://apiskeith.top/download/spotify?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(25000) })
            let _kSpd = await _kSp.json()
            console.log('[spotify] keith:', _kSpd.status)
            if (_kSpd.status && (_kSpd.result?.download_url || _kSpd.result?.url)) {
              let _spUrl = _kSpd.result.download_url || _kSpd.result.url
              let _spTitle = _kSpd.result.title || 'Spotify Track'
              await X.sendMessage(m.chat, { audio: { url: _spUrl }, mimetype: 'audio/mpeg', fileName: `${_spTitle}.mp3` }, { quoted: m })
              reply(`╔══〔 🎵 SPOTIFY DOWNLOAD 〕══╗
║ 🎵 *${_spTitle}*
╚═══════════════════════╝`)
            } else reply('❌ Could not download. Make sure it is a valid public Spotify track link.')
          } catch (_kE) { reply('❌ Could not download. Make sure it is a valid public Spotify track link.') }
        }
      } catch(e) { reply('❌ Error: ' + e.message) }
  }
  break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎵  SOUNDCLOUD DOWNLOADER (Keith API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'soundcloud':
case 'scloud': {
  await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
  if (!text) return reply(`╔══〔 🎵 SOUNDCLOUD DL 〕══╗\n\n║ *Usage:* ${prefix}soundcloud [link]\n║ Example: ${prefix}soundcloud https://soundcloud.com/...\n╚═══════════════════════╝`)
  const _scUrlRegex = /soundcloud\.com\//i
  if (!_scUrlRegex.test(text)) return reply(`╔══〔 🎵 SOUNDCLOUD DL 〕══╗\n\n║ ❌ Please provide a valid SoundCloud track link.\n╚═══════════════════════╝`)
  try {
    await reply('🎵 _Downloading from SoundCloud..._')
    const _scRes = await fetch(`https://apiskeith.top/download/soundcloud?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(30000) })
    const _scJson = await _scRes.json()
    if (!_scJson.success && !_scJson.status) throw new Error('Track not found or unavailable')
    const _scData = _scJson.data || _scJson.result
    const _scAudioUrl = Array.isArray(_scData?.medias) ? _scData.medias.find(m => m.audioAvailable || m.extension === 'mp3')?.url || _scData.medias[0]?.url : null
    if (!_scAudioUrl) throw new Error('No audio stream found')
    const _scTitle = _scData?.title || 'SoundCloud Track'
    const _scThumb = _scData?.thumbnail || null
    const _scDur   = _scData?.duration || '--:--'
    const _scCap = `╔══〔 🎵 SOUNDCLOUD 〕══════╗\n║ 🎵 *${_scTitle}*\n║ ⏱️ *Duration:* ${_scDur}\n╚═══════════════════════╝`
    if (_scThumb) {
      await X.sendMessage(m.chat, { image: { url: _scThumb }, caption: _scCap }, { quoted: m })
    }
    await X.sendMessage(m.chat, { audio: { url: _scAudioUrl }, mimetype: 'audio/mpeg', fileName: `${_scTitle}.mp3` }, { quoted: m })
  } catch(e) {
    reply(`❌ SoundCloud download failed: ${e.message}`)
  }
} break

  case 'tempemail':
  case 'tempmail': {
      await X.sendMessage(m.chat, { react: { text: '📧', key: m.key } })

      // ── Check inbox: .tempmail [email] ──────────────────────────────
      if (text && text.includes('@')) {
          try {
              await reply('📬 _Checking inbox, please wait..._')
              let _inboxReply = null
              // Primary: Keith API
              try {
                  const _ki = await _keithFetch(`/tempmail/inbox?email=${encodeURIComponent(text.trim())}`)
                  const _kim = _ki?.result?.messages || _ki?.messages || (_ki?.result ? [_ki.result] : null)
                  if (Array.isArray(_kim) && _kim.length) {
                      const _msg = _kim[0]
                      const _from    = _msg.from || _msg.sender || 'Unknown'
                      const _subject = _msg.subject || '(no subject)'
                      const _time    = _msg.date || _msg.time || 'Unknown'
                      const _body    = (_msg.body || _msg.text || _msg.content || _msg.message || '').slice(0, 1500)
                      _inboxReply = `╔══〔 📬 INBOX 〕══╗\n\n║ 📧 *To* : ${text.trim()}\n║ 👤 *From* : ${_from}\n║ 📌 *Subject* : ${_subject}\n║ 🕐 *Time* : ${_time}\n${_body ? '\n' + _body + '\n' : ''}\n╚═══════════════════════╝`
                  } else if (_ki !== null) {
                      _inboxReply = `╔══〔 📭 INBOX EMPTY 〕═══╗\n\n║ 📧 *Email* : ${text.trim()}\n\n║ _No messages received yet._\n╚═══════════════════════╝`
                  }
              } catch(_) {}
              // Fallback: eliteprotech
              if (!_inboxReply) {
                  const _ti = await fetch(`https://eliteprotech-apis.zone.id/tempemail?action=inbox&email=${encodeURIComponent(text.trim())}`, { signal: AbortSignal.timeout(20000) })
                  const _tid = await _ti.json()
                  if (!_tid.success) return reply('❌ Could not check inbox. Make sure the email is valid.')
                  if (!_tid.inbox) {
                      return reply(`╔══〔 📭 INBOX EMPTY 〕═══╗\n\n║ 📧 *Email* : ${text.trim()}\n\n║ _No messages received yet._\n║ _Send something to this address, then check again._\n╚═══════════════════════╝`)
                  }
                  const _fmsg = _tid.inbox
                  const _fbody = (_fmsg.body || _fmsg.text || _fmsg.content || _fmsg.message || '').slice(0, 1500)
                  _inboxReply = `╔══〔 📬 INBOX 〕══╗\n\n║ 📧 *To* : ${text.trim()}\n║ 👤 *From* : ${_fmsg.from || 'Unknown'}\n║ 📌 *Subject* : ${_fmsg.subject || '(no subject)'}\n║ 🕐 *Time* : ${_fmsg.time || 'Unknown'}\n${_fbody ? '\n' + _fbody + '\n' : ''}\n╚═══════════════════════╝`
              }
              reply(_inboxReply || '❌ Could not check inbox. Try again.')
          } catch(e) { reply('❌ Inbox check failed: ' + e.message) }

      // ── Generate new temp email: .tempmail ──────────────────────────
      } else {
          try {
              let _email = null
              // Primary: Keith API
              try {
                  const _ke = await _keithFetch('/tempmail/generate')
                  _email = _ke?.result?.email || _ke?.email || (typeof _ke?.result === 'string' ? _ke.result : null)
              } catch(_) {}
              // Fallback: eliteprotech
              if (!_email) {
                  const _te = await fetch('https://eliteprotech-apis.zone.id/tempemail', { signal: AbortSignal.timeout(15000) })
                  const _ted = await _te.json()
                  if (_ted.success && _ted.email) _email = _ted.email
              }
              if (_email) {
                  reply(`╔══〔 📧 TEMP EMAIL 〕══╗\n\n║ ✅ *Your Temporary Email:*\n\n║ 📨  ${_email}\n\n║ Use it for sign-ups & verifications\n║ To check received messages:\n║ *${prefix}tempmail ${_email}*\n\n║ _Inbox refreshes on each check._\n╚═══════════════════════╝`)
              } else reply('❌ Failed to generate email. Try again.')
          } catch(e) { reply('❌ Error: ' + e.message) }
      }
  } break

  case 'tt':
case 'tiktok': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
if (!text) return reply(`╔══〔 🎵 TIKTOK DOWNLOADER 〕══╗\n\n║ Usage:  *${prefix}tt [tiktok url]*\n║ Example: ${prefix}tt https://vm.tiktok.com/xxx\n╚═══════════════════════╝`)
try {
    let data = await fg.tiktok(text)
    if (!data || !data.result) return reply('╔══〔 ❌ DOWNLOAD FAILED 〕══╗\n\n║ Failed to download.\n║ The link may be invalid.\n╚═══════════════════════╝')
    let json = data.result
    let caption = `╔══〔 🎵 TIKTOK DOWNLOAD 〕══╗\n`
    caption += `║ 👤 *Username* : ${json.author?.nickname || 'Unknown'}\n`
    caption += `║ 📝 *Title* : ${json.title || '-'}\n`
    caption += `║ ❤️  *Likes* : ${json.digg_count || 0}\n`
    caption += `║ 💬 *Comments* : ${json.comment_count || 0}\n`
    caption += `║ 🔁 *Shares* : ${json.share_count || 0}\n`
    caption += `║ ▶️  *Plays* : ${json.play_count || 0}\n`
    caption += `║ ⏱️  *Duration* : ${json.duration || '-'}\n`
    caption += `╚═══════════════════════╝`
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
        reply('╔══〔 ❌ DOWNLOAD FAILED 〕══╗\n\n║ Failed to download.\n║ No media URL found from source.\n╚═══════════════════════╝')
    }
} catch (err1) {
    console.log('[tt] fg.tiktok failed:', err1.message)
    // Fallback: EliteProTech /tiktok
    let _ttFallback = false
    try {
      let _ep = await fetch(`https://eliteprotech-apis.zone.id/tiktok?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(25000) })
      let _epd = await _ep.json()
      console.log('[tt] eliteprotech:', _epd.success)
      if (_epd.success && (_epd.video || _epd.result?.url || _epd.data?.url)) {
        let _vidUrl = _epd.video || _epd.result?.url || _epd.data?.url || _epd.url
        let _ttCap = `╔══〔 🎵 TIKTOK DOWNLOAD 〕══╗
║ 👤 *Author* : ${_epd.author?.nickname || _epd.author || 'Unknown'}
║ 📝 *Title* : ${(_epd.title || _epd.desc || '').slice(0,80)}
╚═══════════════════════╝`
        await safeSendMedia(m.chat, { video: { url: _vidUrl }, mimetype: 'video/mp4', caption: _ttCap }, {}, { quoted: m })
        _ttFallback = true
      }
    } catch (_e2) { console.log('[tt] eliteprotech:', _e2.message) }
    // Fallback 2: tikwm
    if (!_ttFallback) {
      try {
        let _tw = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(text)}&hd=1`, { signal: AbortSignal.timeout(25000) })
        let _twd = await _tw.json()
        console.log('[tt] tikwm: code=', _twd.code)
        if (_twd.code === 0 && _twd.data?.play) {
          let _vidUrl2 = _twd.data.hdplay || _twd.data.play
          let _ttCap2 = `╔══〔 🎵 TIKTOK DOWNLOAD 〕══╗
║ 👤 *Author* : ${_twd.data.author?.nickname || 'Unknown'}
║ 📝 *Title* : ${(_twd.data.title || '').slice(0,80)}
║ ❤️  *Likes* : ${_twd.data.digg_count || 0}
║ ▶️  *Plays* : ${_twd.data.play_count || 0}
╚═══════════════════════╝`
          await safeSendMedia(m.chat, { video: { url: _vidUrl2 }, mimetype: 'video/mp4', caption: _ttCap2 }, {}, { quoted: m })
          if (_twd.data.music) await safeSendMedia(m.chat, { audio: { url: _twd.data.music }, mimetype: 'audio/mpeg' }, {}, { quoted: m })
          _ttFallback = true
        }
      } catch (_e3) { console.log('[tt] tikwm:', _e3.message) }
    }
    // Fallback 3: Keith tiktokdl3
    if (!_ttFallback) {
      try {
        let _kTt = await fetch(`https://apiskeith.top/download/tiktokdl3?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(25000) })
        let _kTtd = await _kTt.json()
        console.log('[tt] keith:', _kTtd.status)
        const _kTtUrl = _kTtd?.result
        if (_kTtd.status && typeof _kTtUrl === 'string' && _kTtUrl.startsWith('http')) {
          await safeSendMedia(m.chat, { video: { url: _kTtUrl }, mimetype: 'video/mp4', caption: '🎵 *TikTok Download*' }, {}, { quoted: m })
          _ttFallback = true
        }
      } catch (_e4) { console.log('[tt] keith:', _e4.message) }
    }
    if (!_ttFallback) reply('❌ TikTok download failed. Please make sure the link is valid and public.')
}
}
break

case 'fb':
case 'fbdl':
case 'facebook' : {
if (!text) return reply(`╔══〔 📘 FACEBOOK DL 〕════╗\n\n║ Usage: *${prefix}fb [link]*\n║ Example: ${prefix}fb https://www.facebook.com/...\n╚═══════════════════════╝`)
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
            let _gt = await fetch(`${_GTAPI}/api/download/fbdl?apikey=${_giftedKey()}&url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
            let _gtd = await _gt.json()
            console.log('[fb] giftedtech: success=', _gtd.success)
            if (_gtd.success && _gtd.result) {
              _fbUrl      = _gtd.result.video_hd || _gtd.result.video_sd || _gtd.result.download_url
              _fbTitle    = _gtd.result.title    || null
              _fbDuration = _gtd.result.duration || null
            }
          } catch (_e3) { console.log('[fb] giftedtech:', _e3.message) }
        }

        // Source 4: Keith fbdown
        if (!_fbUrl) {
          try {
            let _kFb = await fetch(`https://apiskeith.top/download/fbdown?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
            let _kFbd = await _kFb.json()
            console.log('[fb] keith:', _kFbd.status)
            if (_kFbd.status && _kFbd.result) {
              _fbUrl   = _kFbd.result.media?.hd || _kFbd.result.media?.sd || null
              _fbTitle = _kFbd.result.title || null
            }
          } catch (_e4) { console.log('[fb] keith:', _e4.message) }
        }

        if (_fbUrl) {
          let _cap = `╔══〔 📹 FACEBOOK VIDEO 〕══╗\n`
          if (_fbTitle)    _cap += `║ 📌 *Title* : ${_fbTitle}\n`
          if (_fbDuration) _cap += `║ ⏱️ *Duration* : ${_fbDuration}\n`
          _cap += `╚═══════════════════════╝`
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
              await reply('╔══〔 🎵 VOCAL REMOVER 〕══╗\n\n║ ✅ Vocals removed!\n║ Instrumental track sent above.\n╚═══════════════════════╝')
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
    if (!text) return reply(`╔══〔 🎵 YTPLAY 〕═════════╗\n\n║ Usage: *${prefix}ytplay [song name]*\n║ Example: ${prefix}ytplay Juice WRLD Lucid Dreams\n╚═══════════════════════╝`)
    let _tmpFile = null
    try {
        let search = await yts(text)
        if (!search || !search.all || !search.all.length) return reply('❌ No results found for that song. Try different keywords.')
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
                let res = await fetch(`${_GTAPI}/api/download/ytmp3?apikey=${_giftedKey()}&quality=128kbps&url=${encodeURIComponent(firstVideo.url)}`, {
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

          // Method 1.7: Keith API ytmp3 backup
          if (!audioUrl && !audioPath) {
              try {
                  let _kp = await fetch(`https://apiskeith.top/download/ytmp3?url=${encodeURIComponent(firstVideo.url)}`, { signal: AbortSignal.timeout(25000) })
                  let _kpd = await _kp.json()
                  console.log('[play] keith: status=', _kpd.status)
                  if (_kpd.status && _kpd.result?.download_url) {
                      audioUrl = _kpd.result.download_url
                  } else if (_kpd.status && _kpd.result?.url) {
                      audioUrl = _kpd.result.url
                  }
              } catch (_kp0) { console.log('[play] keith:', _kp0.message) }
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
            let songInfo = `╔══〔 🎵 NOW PLAYING 〕═══╗\n║ 📌 *Title* : ${videoTitle}\n║ 🎤 *Artist* : ${videoAuthor}\n║ ⏱️ *Duration* : ${firstVideo.timestamp}\n║ 👁️ *Views* : ${firstVideo.views?.toLocaleString?.() || firstVideo.views}\n╚═══════════════════════╝`
            let msgPayload = {
                document: audioUrl ? { url: audioUrl } : { url: `file://${audioPath}` },
                mimetype: 'audio/mpeg',
                fileName: cleanName,
                caption: songInfo
            }
            if (thumbBuffer) msgPayload.jpegThumbnail = thumbBuffer
            await X.sendMessage(m.chat, msgPayload, { quoted: m })
        } else {
            reply(`╔══〔 🎵 SONG SEARCH 〕═══╗\n║ 📌 *Title* : ${videoTitle}\n║ 🎤 *Artist* : ${videoAuthor}\n║ ⏱️ *Duration* : ${firstVideo.timestamp}\n║\n║ ⚠️ Audio download failed — try again\n╚═══════════════════════╝`)
        }
    } catch (e) {
        console.log('[play] error:', e.message)
        reply('╔══〔 ❌ PLAY ERROR 〕══╗\n\n║ An error occurred while processing.\n║ Please try again.\n╚═══════════════════════╝')
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
║ 🔑 *Session* : https://toosiitechdevelopertools.zone.id/session

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
║ 🔑 *Session* : https://toosiitechdevelopertools.zone.id/session


║ _⚡ Powered by Toosii Tech — wa.me/254748340864_
╚═══════════════════════╝`
  reply(botInfo)
}
break
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Sticker Features
case 'bratvid':
case 'bratv':
case 'bratvideo': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
  if (!text) return reply(`╔══〔 🎬 BRAT VIDEO 〕══╗\n\n║ Usage: *${prefix}${command} [pesan]*\n║ Contoh: ${prefix}${command} Hai bang, apa kabar?\n╚═══════════════════════╝`)
  if (text.length > 250) return reply(`╔══〔 ⚠️ BRAT VIDEO 〕══╗\n\n║ Character limit exceeded!\n║ Maximum: 250 characters\n╚═══════════════════════╝`)
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
    reply('╔══〔 ❌ ERROR 〕══╗\n\n║ An error occurred. Please try again.\n╚═══════════════════════╝')
  }
}
break

case 'brat': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
if (!q) return reply(`╔══〔 ✏️ BRAT TEXT 〕══════╗\n\n║ Usage: *${prefix}brat [text]*\n║ Example: ${prefix}brat alok hamil\n╚═══════════════════════╝`);
let _bratBuf = null
try {
  const _r1 = await axios.get(`https://aqul-brat.hf.space/api/brat?text=${encodeURIComponent(q)}`, { responseType: 'arraybuffer', timeout: 15000 })
  _bratBuf = Buffer.from(_r1.data, 'binary')
} catch {}
if (!_bratBuf || _bratBuf.length < 1000) {
  try {
    const _r2 = await axios.get(`https://brat.space/api/brat?text=${encodeURIComponent(q)}`, { responseType: 'arraybuffer', timeout: 15000 })
    _bratBuf = Buffer.from(_r2.data, 'binary')
  } catch {}
}
try {
  if (!_bratBuf || _bratBuf.length < 1000) throw new Error('Both brat APIs failed')
  await X.sendImageAsStickerAV(m.chat, _bratBuf, m, { packname: ``, author: `${global.author}` })
} catch (e) {
  console.log(e)
  await reply('❌ Brat sticker generation failed. Please try again.')
}
}
break

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ✏️  ANIMATED TEXT TO STICKER (ATTP / TTP)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  case 'attp':
  case 'ttp':
  case 'textsticker': {
      await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
      const _atText = text || (m.quoted ? (m.quoted.text || m.quoted.body || '') : '')
      if (!_atText) return reply(`╔══〔 ✏️ TEXT STICKER 〕══╗\n\n║ *Usage:* *${prefix}attp [text]*\n║ *Example:* ${prefix}attp Hello World\n║\n║ Creates an animated text sticker\n╚═══════════════════════╝`)
      try {
          let _atBuf = null
          // Method 1: GiftedTech ATTP API
          try {
              const _gt = await fetch(`${_GTAPI}/api/sticker/attp?apikey=${_giftedKey()}&text=${encodeURIComponent(_atText)}`, { signal: AbortSignal.timeout(25000) })
              if (_gt.ok) {
                  const _ct = _gt.headers.get('content-type') || ''
                  if (_ct.includes('image') || _ct.includes('octet')) {
                      _atBuf = Buffer.from(await _gt.arrayBuffer())
                  } else {
                      const _gtd = await _gt.json().catch(() => null)
                      if (_gtd?.result) {
                          const _img = await fetch(_gtd.result, { signal: AbortSignal.timeout(15000) })
                          if (_img.ok) _atBuf = Buffer.from(await _img.arrayBuffer())
                      }
                  }
              }
          } catch {}
          // Method 2: Keith API TTP
          if (!_atBuf) {
              try {
                  const _kth = await _keithFetch(`/ttp?text=${encodeURIComponent(_atText)}`, 25000)
                  if (_kth?.url) {
                      const _kImg = await fetch(_kth.url, { signal: AbortSignal.timeout(15000) })
                      if (_kImg.ok) _atBuf = Buffer.from(await _kImg.arrayBuffer())
                  } else if (_kth?.result) {
                      const _kImg2 = await fetch(_kth.result, { signal: AbortSignal.timeout(15000) })
                      if (_kImg2.ok) _atBuf = Buffer.from(await _kImg2.arrayBuffer())
                  }
              } catch {}
          }
          // Method 3: Pollinations text-to-image (renders styled text as image)
          if (!_atBuf) {
              try {
                  const _prompt = `Bold stylized neon text on black background: "${_atText.slice(0,50)}", high contrast, vibrant colors, art style`
                  const _pUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(_prompt)}?width=512&height=512&nologo=true`
                  const _pImg = await fetch(_pUrl, { signal: AbortSignal.timeout(30000) })
                  if (_pImg.ok) _atBuf = Buffer.from(await _pImg.arrayBuffer())
              } catch {}
          }
          if (!_atBuf || _atBuf.length < 1000) throw new Error('Text sticker generation failed. Please try again.')
          await X.sendImageAsStickerAV(m.chat, _atBuf, m, { packname: global.packname || 'XD Ultra', author: global.author || 'Bot' })
      } catch(e) { reply(`❌ *ATTP failed:* ${e.message}`) }
  } break
  

case 'emojimix': {
    await X.sendMessage(m.chat, { react: { text: '😎', key: m.key } })
    if (!text) return reply(`╔══〔 😎 EMOJI MIX 〕══╗\n\n║ Usage: *${prefix + command} [emoji1]+[emoji2]*\n║ Example: ${prefix + command} 😂+😍\n╚═══════════════════════╝`);

    const emojis = text.split(/[\+\|]/);
    if (emojis.length !== 2) return reply('╔══〔 ⚠️ EMOJI MIX 〕══╗\n\n║ Please enter two valid emojis.\n║ Example: .emojimix 😂+😍\n╚═══════════════════════╝');
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
        return reply(`╔══〔 💬 QUOTE CARD 〕═════╗\n\n║ Usage: *${prefix}qc [text]*\n║ Or reply to any message.\n╚═══════════════════════╝`);
    }
    if (!text) return reply(`╔══〔 💬 QUOTE CARD 〕═════╗\n\n║ Usage: *${prefix}qc [text]*\n╚═══════════════════════╝`);
    if (text.length > 200) return reply('❌ Maximum *200 characters* allowed. Your text: ' + text.length + ' chars.');
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
if (!quoted) return reply(`╔══〔 🖼️ STICKER MAKER 〕══╗\n\n║ Usage: *${prefix}s*\n║ Reply to any image or video.\n╚═══════════════════════╝`)
if (/image/.test(mime)) {
let media = await quoted.download()
let encmedia = await X.sendImageAsStickerAV(m.chat, media, m, {
packname: global.packname,
author: global.author
})
} else if (/video/.test(mime)) {
if ((quoted.msg || quoted).seconds > 31) return reply('╔══〔 ⚠️ STICKER 〕══╗\n\n║ Video must be 30 seconds or less!\n╚═══════════════════════╝')
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
const _asmCount = Object.values(global.antiStatusMentionGroups || {}).filter(v => v?.enabled).length
const _asmSummary = _asmCount > 0 ? `✅ ON (${_asmCount} group${_asmCount>1?'s':''})` : '❌ OFF'
reply(`╔══〔 📊 STATUS TOOLS CONFIG 〕══╗

║ 👀 *Auto View* : ${viewState}
║ ❤️  *Auto Like* : ${likeState}
║ 💬 *Auto Reply* : ${replyState}
║ 📤 *Forward* : ${fwdState}
║ 🛡️  *Anti-Mention* : ${_asmSummary}


  🛠️  *Commands*
║ ${prefix}autoviewstatus
║ ${prefix}autolikestatus [emoji/off]
║ ${prefix}autoreplystatus [msg/off]
║ ${prefix}togroupstatus on/off
║ ${prefix}asm [on/warn/kick/delete/off] ← in group
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
global.botPublicMode = false
try { require('./library/settings').saveSettings() } catch {}
reply(`╔══〔 🔒 BOT MODE: PRIVATE 〕══╗\n\n║ ✅ *Enabled*\n║ Only *${botClean}* and sudo users can use commands.\n║ All other users are blocked.\n╚═══════════════════════╝`)
}
break

case 'public': {
    await X.sendMessage(m.chat, { react: { text: '🔓', key: m.key } })
if (!isDeployedNumber) return reply(mess.OnlyOwner)
X.public = true
global.botPublicMode = true
try { require('./library/settings').saveSettings() } catch {}
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
    try { require('./library/settings').saveSettings() } catch {}
    reply('╔══〔 📖 AUTO READ 〕══╗\n\n║ Status: ✅ ON\n║ All messages will be marked as read.\n╚═══════════════════════╝')
} else if (arArg === 'off' || arArg === 'disable') {
    global.autoRead = false
    try { require('./library/settings').saveSettings() } catch {}
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
    try { require('./library/settings').saveSettings() } catch {}
    reply('*🤖 ChatBot: ✅ ON*\n_Bot will now auto-reply to all messages in English using AI._\n\n_Use_ ' + prefix + 'chatbot off _to stop._')
} else if (cbArg === 'off' || cbArg === 'disable') {
    global.chatBot = false
    try { require('./library/settings').saveSettings() } catch {}
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
case 'asm': {
    await X.sendMessage(m.chat, { react: { text: '🛡️', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)
    if (!global.antiStatusMentionGroups) global.antiStatusMentionGroups = {}
    const _asmCfg = global.antiStatusMentionGroups[m.chat] || { enabled: false, action: 'warn' }
    const _asmArg = (args[0] || '').toLowerCase()
    const _asmStatus = () => {
        const _s    = _asmCfg.enabled ? '✅ ON' : '❌ OFF'
        const _a    = (_asmCfg.action || 'warn').toUpperCase()
        const _aIcon = _a === 'KICK' ? '🚫' : _a === 'DELETE' ? '🗑️' : '⚠️'
        return `╔══〔 🛡️ ANTI STATUS MENTION 〕══╗\n\n║ 📊 *Status* : ${_s}\n║ ${_aIcon} *Action* : ${_a}\n║ 📍 *Scope* : This group only\n\n║ *Commands:*\n║ ${prefix}asm on\n║ ${prefix}asm off\n║ ${prefix}asm warn   ← 3 warns then kick\n║ ${prefix}asm kick   ← instant remove\n║ ${prefix}asm delete ← auto-delete msgs\n\n║ _Triggers when a group member tags this_\n║ _group in their WhatsApp status post._\n║ _Bot must be admin in the group._\n╚═══════════════════════╝`
    }
    if (!_asmArg) {
        reply(_asmStatus())
    } else if (_asmArg === 'on' || _asmArg === 'enable') {
        global.antiStatusMentionGroups[m.chat] = { enabled: true, action: _asmCfg.action || 'warn' }
        try { require('./library/settings').saveSettings() } catch {}
        reply(`╔══〔 🛡️ ANTI STATUS MENTION 〕══╗\n\n║ ✅ *Enabled for this group*\n║ Action: *${(_asmCfg.action||'warn').toUpperCase()}*\n\n║ _Members who tag this group in status_\n║ _will be ${(_asmCfg.action||'warn')==='kick'?'removed instantly':(_asmCfg.action||'warn')==='delete'?'put on auto-delete':'warned (3× then kicked)'}._\n╚═══════════════════════╝`)
    } else if (_asmArg === 'off' || _asmArg === 'disable') {
        global.antiStatusMentionGroups[m.chat] = { enabled: false, action: _asmCfg.action || 'warn' }
        try { require('./library/settings').saveSettings() } catch {}
        reply(`╔══〔 🛡️ ANTI STATUS MENTION 〕══╗\n\n║ ❌ *Disabled for this group*\n╚═══════════════════════╝`)
    } else if (_asmArg === 'warn') {
        global.antiStatusMentionGroups[m.chat] = { enabled: true, action: 'warn' }
        try { require('./library/settings').saveSettings() } catch {}
        reply(`╔══〔 🛡️ ANTI STATUS MENTION 〕══╗\n\n║ ⚠️ *WARN MODE — Enabled*\n║ Members get 3 warnings then are kicked.\n╚═══════════════════════╝`)
    } else if (_asmArg === 'kick' || _asmArg === 'remove') {
        global.antiStatusMentionGroups[m.chat] = { enabled: true, action: 'kick' }
        try { require('./library/settings').saveSettings() } catch {}
        reply(`╔══〔 🛡️ ANTI STATUS MENTION 〕══╗\n\n║ 🚫 *KICK MODE — Enabled*\n║ Members are removed instantly on first offense.\n╚═══════════════════════╝`)
    } else if (_asmArg === 'delete' || _asmArg === 'del') {
        global.antiStatusMentionGroups[m.chat] = { enabled: true, action: 'delete' }
        try { require('./library/settings').saveSettings() } catch {}
        reply(`╔══〔 🛡️ ANTI STATUS MENTION 〕══╗\n\n║ 🗑️ *DELETE MODE — Enabled*\n║ Members' messages will be auto-deleted.\n╚═══════════════════════╝`)
    } else {
        reply(`❌ Unknown option. Use: *on, off, warn, kick, delete*`)
    }
}
break

case 'antigroupmention':
case 'agm': {
    await X.sendMessage(m.chat, { react: { text: '👥', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)
    if (!global.antiGroupMentionGroups) global.antiGroupMentionGroups = {}
    const _agmCfg = global.antiGroupMentionGroups[m.chat] || { enabled: false, action: 'delete' }
    const _agmArg = (args[0] || '').toLowerCase()

    const _agmStatus = () => {
        const _s    = _agmCfg.enabled ? '✅ ON' : '❌ OFF'
        const _a    = (_agmCfg.action || 'delete').toUpperCase()
        const _aIcon = _a === 'KICK' ? '🚫' : _a === 'WARN' ? '⚠️' : '🗑️'
        return `╔══〔 👥 ANTI GROUP MENTION 〕══╗\n\n║ 📊 *Status* : ${_s}\n║ ${_aIcon} *Action* : ${_a}\n║ 📍 *Scope* : This group only\n\n║ *Commands:*\n║ ${prefix}agm on\n║ ${prefix}agm off\n║ ${prefix}agm delete — silent delete\n║ ${prefix}agm warn   — 3 silent strikes then kick\n║ ${prefix}agm kick   — delete + kick sender\n\n║ _Triggers when anyone @tags a member_\n║ _in any message (text, image, video…)._\n║ _Bot must be admin. Admins are exempt._\n╚═══════════════════════╝`
    }

    if (!_agmArg) {
        reply(_agmStatus())
    } else if (_agmArg === 'on' || _agmArg === 'enable') {
        global.antiGroupMentionGroups[m.chat] = { enabled: true, action: _agmCfg.action || 'delete' }
        try { require('./library/settings').saveSettings() } catch {}
        reply(`╔══〔 👥 ANTI GROUP MENTION 〕══╗\n\n║ ✅ *Enabled for this group*\n║ Action: *${(_agmCfg.action || 'delete').toUpperCase()}*\n╚═══════════════════════╝`)
    } else if (_agmArg === 'off' || _agmArg === 'disable') {
        global.antiGroupMentionGroups[m.chat] = { enabled: false, action: _agmCfg.action || 'delete' }
        try { require('./library/settings').saveSettings() } catch {}
        reply(`╔══〔 👥 ANTI GROUP MENTION 〕══╗\n\n║ ❌ *Disabled for this group*\n╚═══════════════════════╝`)
    } else if (_agmArg === 'delete' || _agmArg === 'del') {
        global.antiGroupMentionGroups[m.chat] = { enabled: true, action: 'delete' }
        try { require('./library/settings').saveSettings() } catch {}
        reply(`╔══〔 👥 ANTI GROUP MENTION 〕══╗\n\n║ 🗑️ *DELETE MODE — Enabled*\n║ Mass-tags silently deleted, no notification.\n╚═══════════════════════╝`)
    } else if (_agmArg === 'warn') {
        global.antiGroupMentionGroups[m.chat] = { enabled: true, action: 'warn' }
        try { require('./library/settings').saveSettings() } catch {}
        reply(`╔══〔 👥 ANTI GROUP MENTION 〕══╗\n\n║ ⚠️ *WARN MODE — Enabled*\n║ 3 silent strikes → auto-kick.\n╚═══════════════════════╝`)
    } else if (_agmArg === 'kick' || _agmArg === 'remove') {
        global.antiGroupMentionGroups[m.chat] = { enabled: true, action: 'kick' }
        try { require('./library/settings').saveSettings() } catch {}
        reply(`╔══〔 👥 ANTI GROUP MENTION 〕══╗\n\n║ 🚫 *KICK MODE — Enabled*\n║ Mass-taggers instantly removed.\n╚═══════════════════════╝`)
    } else {
        reply(`❌ Unknown option. Use: *on, off, delete, warn, kick*`)
    }
}
break

case 'antilink':
case 'setantilink': {
    await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
const _alArg = (args[0] || '').toLowerCase()
const _alAction = global.antiLinkAction || 'delete'
const _alWarnLimitDisplay = global.antiLinkWarnLimit || 3
if (!_alArg) {
    reply(`╔══〔 🔗 ANTI LINK 〕══════╗\n║ 📊 *Status* : ${global.antiLink ? '✅ ON' : '❌ OFF'}\n║ ⚙️  *Action* : ${_alAction}\n║ ⚠️  *Warn Limit* : ${_alWarnLimitDisplay}\n╠══〔 📋 USAGE 〕══════════╣\n║ ${prefix}antilink on\n║ ${prefix}antilink off\n║ ${prefix}antilink delete — delete only\n║ ${prefix}antilink kick  — delete + kick\n║ ${prefix}antilink warn  — warn, then kick\n║ ${prefix}antilink warnlimit 3 — set warn limit\n╚═══════════════════════╝`)
} else if (_alArg === 'on' || _alArg === 'enable') {
    global.antiLink = true
    try { require('./library/settings').saveSettings() } catch {}
    reply(`╔══〔 🔗 ANTI-LINK: ON 〕══╗\n\n║ ✅ Active — action: *${_alAction}*\n║ _Bot must be admin in group._\n╚═══════════════════════╝`)
} else if (_alArg === 'off' || _alArg === 'disable') {
    global.antiLink = false
    try { require('./library/settings').saveSettings() } catch {}
    reply('╔══〔 🔗 ANTI-LINK 〕══╗\n\n║ Status: ❌ OFF\n╚═══════════════════════╝')
} else if (['delete','kick','warn'].includes(_alArg)) {
    global.antiLinkAction = _alArg
    global.antiLink = true
    try { require('./library/settings').saveSettings() } catch {}
    reply(`╔══〔 🔗 ANTI-LINK 〕══╗\n\n║ ✅ ON — Action: *${_alArg}*\n║ ${_alArg === 'delete' ? 'Links will be deleted silently.' : _alArg === 'kick' ? 'Senders will be kicked.' : `Senders get ${_alWarnLimitDisplay} warnings then kicked.`}\n╚═══════════════════════╝`)
} else if (_alArg === 'warnlimit') {
    const _alNewLimit = parseInt(args[1])
    if (isNaN(_alNewLimit) || _alNewLimit < 1 || _alNewLimit > 20) return reply('❌ Warn limit must be a number between 1 and 20\nExample: .antilink warnlimit 3')
    global.antiLinkWarnLimit = _alNewLimit
    try { require('./library/settings').saveSettings() } catch {}
    reply(`✅ *Anti-Link warn limit set to ${_alNewLimit}*\nUsers will be kicked after ${_alNewLimit} link warnings.`)
} else {
    reply(`❌ Unknown option: *${_alArg}*\nUse: on / off / delete / kick / warn / warnlimit`)
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
║ 👥 Anti Group Mention : ${global.antiGroupMentionGroups ? on : off}

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
                  try { require('./library/settings').saveSettings() } catch {}
                  reply(`╔══〔 👋 WELCOME / GOODBYE 〕══╗\n\n║ ✅ *Enabled in ${groupName || 'this group'}*\n║ _Bot will greet joins & announce leaves._\n╚═══════════════════════╝`)
               } else if (welArg === 'off' || welArg === 'disable') {
                  global.welcome = false
                  try { require('./library/settings').saveSettings() } catch {}
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
    if (_cra === 'on') { global.autoChannelReact = true; global._saveCrSettings(); reply('╔══〔 📡 CHANNEL REACT 〕══╗\n\n║ Status: ✅ ON\n║ Bot will auto-react to\n║ every channel post with\n║ multiple emojis 🔥\n║\n║ Use .channelreact jid to\n║ target a specific channel.\n╚══════════════════════╝') }
    else if (_cra === 'off') { global.autoChannelReact = false; global._saveCrSettings(); reply('╔══〔 📡 CHANNEL REACT 〕══╗\n\n║ Status: ❌ OFF\n║ Channel auto-react disabled.\n╚══════════════════════╝') }
    else if (_cra === 'jid') {
        if (!args[1]) return reply('❌ Provide the newsletter JID\nExample: .channelreact jid 120363xxxxxxxx@newsletter')
        global.autoChannelReactJid = args[1].trim()
        global._saveCrSettings()
        reply(`✅ *Channel JID set*\n📌 ${global.autoChannelReactJid}\n\nBot will only auto-react to posts from this channel.`)
    } else if (_cra === 'emojis') {
        const _newEmojis = args.slice(1)
        if (!_newEmojis.length) return reply('❌ Provide emojis\nExample: .channelreact emojis ❤️ 🔥 👍 🎉 💯')
        global.autoChannelReactEmojis = _newEmojis
        global._saveCrSettings()
        reply(`✅ *React emojis updated*\n🎭 ${_newEmojis.join(' ')}\n\n${_newEmojis.length} emojis will be sent per channel post.`)
    } else if (_cra === 'count') {
        const _newCnt = parseInt(args[1])
        if (isNaN(_newCnt) || _newCnt < 1 || _newCnt > 200) return reply('❌ Count must be a number between 1 and 200\nExample: .channelreact count 30')
        global.autoChannelReactCount = _newCnt
        global._saveCrSettings()
        reply(`✅ *React count set*\n🔢 ${_newCnt} reactions will be sent per channel post.`)
    } else { global.autoChannelReact = true; global._saveCrSettings(); reply(`✅ *Channel React ON*\n🎭 Emojis: ${_craEmojis}`) }
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
        global._saveCrSettings()
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
        // Resolve @lid to real JID (newer WhatsApp accounts)
        if (_sdTarget.endsWith('@lid')) {
            try { const _lidR = await X.getJidFromLid(_sdTarget); if (_lidR) _sdTarget = _lidR } catch {}
        }
        const _sdTargetNum = _sdTarget.split('@')[0]
        // Block adding the bot owner
        if (global.owner?.includes(_sdTargetNum) || global.ownerNumber === _sdTargetNum) return reply(`❌ @${_sdTargetNum} is the bot owner and already has full access.`)
        // Verify number exists on WhatsApp
        try {
            const [_sdWa] = await X.onWhatsApp(_sdTargetNum)
            if (!_sdWa || !_sdWa.exists) return reply(`❌ The number *${_sdTargetNum}* is not registered on WhatsApp.`)
        } catch { return reply(`⚠️ Could not verify if *${_sdTargetNum}* is on WhatsApp. Please try again.`) }
        let _sdList = _sdRead()
        if (_sdList.some(u => u.split('@')[0] === _sdTargetNum)) return reply(`⚠️ @${_sdTargetNum} is already a sudo user.`)
        _sdList.push(_sdTarget)
        _sdWrite(_sdList)
        await X.sendMessage(m.chat, { text: `╔══〔 ✅ SUDO ADDED 〕════╗\n\n║ 🛡️ @${_sdTargetNum} is now a *sudo user*!\n║ Total: ${_sdList.length} user(s)\n╚═══════════════════════╝`, mentions: [_sdTarget] }, { quoted: m })

    // .sudo remove / .sudo del @user
    } else if (_sdAction === 'remove' || _sdAction === 'del') {
        let _sdTarget = (m.mentionedJid && m.mentionedJid[0])
            || (m.quoted && m.quoted.sender)
            || (args[1] && args[1].replace(/\D/g,'') + '@s.whatsapp.net')
        if (!_sdTarget || _sdTarget === '@s.whatsapp.net') return reply(`╔══〔 🔓 REMOVE SUDO 〕═══╗\n\n║ Usage: *${prefix}sudo remove @user*\n║ Or: *${prefix}sudo remove 254xxxxxxx*\n║ Or reply to a message\n╚═══════════════════════╝`)
        // Resolve @lid to real JID
        if (_sdTarget.endsWith('@lid')) {
            try { const _lidR = await X.getJidFromLid(_sdTarget); if (_lidR) _sdTarget = _lidR } catch {}
        }
        const _sdTargetNum = _sdTarget.split('@')[0]
        // Block removing the bot owner
        if (global.owner?.includes(_sdTargetNum) || global.ownerNumber === _sdTargetNum) return reply(`❌ Cannot remove the bot owner from sudo.`)
        let _sdList = _sdRead()
        const _sdIdx = _sdList.findIndex(u => u.split('@')[0] === _sdTargetNum)
        if (_sdIdx === -1) return reply(`⚠️ @${_sdTargetNum} is not a sudo user.`)
        _sdList.splice(_sdIdx, 1)
        _sdWrite(_sdList)
        await X.sendMessage(m.chat, { text: `╔══〔 🔓 SUDO REMOVED 〕══╗\n\n║ @${_sdTargetNum} removed from *sudo*!\n║ Total sudo users: ${_sdList.length}\n╚═══════════════════════╝`, mentions: [_sdTarget] }, { quoted: m })

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
        try {
            const _miUrlBuf = await getBuffer(args[0])
            if (!_miUrlBuf || _miUrlBuf.length < 100) throw new Error('Failed to download image from URL')
            const _miPath = path.join(__dirname, 'media', 'menu_thumb.jpg')
            fs.writeFileSync(_miPath, _miUrlBuf)
            global.menuThumb = _miPath
            reply('✅ *Menu image updated from URL!* It will now show in .menu and .pair and persist after restart.')
        } catch(e) { reply('❌ Could not download image from that URL: ' + e.message) }
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
          global.botPublicMode = true
          try { require('./library/settings').saveSettings() } catch {}
          if (global.BOT_BUTTONS_MODE) {
              await reply(`╔══〔 🌐 BOT MODE: PUBLIC 〕══╗\n\n║ ✅ *Activated*\n║ All users can use bot commands.\n╚═══════════════════════╝`)
              await _sendBtnPanel()
          } else {
              reply(`╔══〔 🌐 BOT MODE: PUBLIC 〕══╗\n\n║ ✅ *Activated*\n║ All users can use bot commands.\n╚═══════════════════════╝`)
          }
      } else if (modeArg === 'default') {
          X.public = true
          global.BOT_MODE = 'public'
          global.botPublicMode = true
          try { require('./library/settings').saveSettings() } catch {}
          if (global.BOT_BUTTONS_MODE) {
              await reply(`╔══〔 📝 BOT MODE: DEFAULT 〕══╗\n\n║ ✅ *Activated*\n║ All users can use bot commands.\n╚═══════════════════════╝`)
              await _sendBtnPanel()
          } else {
              reply(`╔══〔 📝 BOT MODE: DEFAULT 〕══╗\n\n║ ✅ *Activated*\n║ All users can use bot commands.\n╚═══════════════════════╝`)
          }
      } else if (modeArg === 'private' || modeArg === 'silent') {
          X.public = false
          global.BOT_MODE = 'silent'
          global.botPublicMode = false
          try { require('./library/settings').saveSettings() } catch {}
          if (global.BOT_BUTTONS_MODE) {
              await reply(`╔══〔 🔕 BOT MODE: SILENT 〕══╗\n\n║ ✅ *Activated*\n║ Only the owner and sudo users can use commands.\n╚═══════════════════════╝`)
              await _sendBtnPanel()
          } else {
              reply(`╔══〔 🔕 BOT MODE: SILENT 〕══╗\n\n║ ✅ *Activated*\n║ Only the owner and sudo users can use commands.\n╚═══════════════════════╝`)
          }
      } else if (modeArg === 'groups') {
          X.public = true
          global.BOT_MODE = 'groups'
          global.botPublicMode = true
          try { require('./library/settings').saveSettings() } catch {}
          if (global.BOT_BUTTONS_MODE) {
              await reply(`╔══〔 👥 BOT MODE: GROUPS 〕══╗\n\n║ ✅ *Activated*\n║ Bot responds only in group chats.\n║ Private messages are ignored.\n╚═══════════════════════╝`)
              await _sendBtnPanel()
          } else {
              reply(`╔══〔 👥 BOT MODE: GROUPS 〕══╗\n\n║ ✅ *Activated*\n║ Bot responds only in group chats.\n║ Private messages are ignored.\n╚═══════════════════════╝`)
          }
      } else if (modeArg === 'dms') {
          X.public = true
          global.BOT_MODE = 'dms'
          global.botPublicMode = true
          try { require('./library/settings').saveSettings() } catch {}
          if (global.BOT_BUTTONS_MODE) {
              await reply(`╔══〔 💬 BOT MODE: DMs 〕══╗\n\n║ ✅ *Activated*\n║ Bot responds only in private chats.\n║ Group messages are ignored.\n╚═══════════════════════╝`)
              await _sendBtnPanel()
          } else {
              reply(`╔══〔 💬 BOT MODE: DMs 〕══╗\n\n║ ✅ *Activated*\n║ Bot responds only in private chats.\n║ Group messages are ignored.\n╚═══════════════════════╝`)
          }
      } else if (modeArg === 'channel') {
          X.public = true
          global.BOT_MODE = 'channel'
          global.botPublicMode = true
          try { require('./library/settings').saveSettings() } catch {}
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
    try { require('./library/settings').saveSettings() } catch {}
    reply(`╔══〔 👋 GOODBYE MESSAGES 〕══╗\n\n║ ✅ *Enabled in ${groupName || 'this group'}*\n║ _Bot will farewell departing members._\n╚═══════════════════════╝`)
} else if (gbArg === 'off') {
    global.goodbye = false
    try { require('./library/settings').saveSettings() } catch {}
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
      const _pairText =
          `╔══〔 🔗 PAIRING SITE 〕══╗\n` +
          `║\n` +
          `║  Click the link below to get your pairing code:\n` +
          `║\n` +
          `║  🌐 https://toosiitechdevelopertools.zone.id/session\n` +
          `║\n` +
          `║  📱 Enter your WhatsApp number\n` +
          `║  📋 Copy the code shown\n` +
          `║  🔗 WhatsApp → Linked Devices → Link with phone number\n` +
          `║\n` +
          `╚═══════════════════════╝`
      // Use menu thumbnail if set, otherwise send plain text
      let _pairThumb = null
      try {
          const _savedThumb = path.join(__dirname, 'media', 'menu_thumb.jpg')
          if (global.menuThumb) {
              if (/^https?:\/\//.test(global.menuThumb)) {
                  _pairThumb = await getBuffer(global.menuThumb).catch(() => null)
              } else if (fs.existsSync(global.menuThumb)) {
                  _pairThumb = fs.readFileSync(global.menuThumb)
              }
          }
          if (!_pairThumb && fs.existsSync(_savedThumb)) {
              _pairThumb = fs.readFileSync(_savedThumb)
          }
          if (!_pairThumb) _pairThumb = fs.readFileSync(path.join(__dirname, 'media', 'thumb.png'))
      } catch {}
      if (_pairThumb) {
          await X.sendMessage(m.chat, { image: _pairThumb, caption: _pairText, contextInfo: global.getCtxInfo([sender]) }, { quoted: m })
      } else {
          await reply(_pairText)
      }
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
// Downloader Commands
case 'ytmp4':
case 'ytvideo':
case 'ytdl':
case 'yt':
case 'video':
case 'ytv': {
    await X.sendMessage(m.chat, { react: { text: '📺', key: m.key } })
if (!text) return reply(`╔══〔 📺 YOUTUBE VIDEO 〕══╗\n\n║ Usage: *${prefix}ytv [url or query]*\n║ Example: ${prefix}ytv Afrobeats mix 2025\n╚═══════════════════════╝`)
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
    let res = await fetch(`${_GTAPI}/api/download/savetubemp4?apikey=${_giftedKey()}&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(30000) })
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
// Method 4: Keith API ytmp4 backup
if (!videoUrl && !videoPath) {
    try {
        let _kv = await fetch(`https://apiskeith.top/download/ytmp4?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(40000) })
        let _kvd = await _kv.json()
        console.log('[video] keith: status=', _kvd.status)
        if (_kvd.status && _kvd.result?.download_url) videoUrl = _kvd.result.download_url
        else if (_kvd.status && _kvd.result?.url) videoUrl = _kvd.result.url
    } catch (_kv0) { console.log('[video] keith:', _kv0.message) }
}
if (videoUrl || videoPath) {
    let src = videoUrl ? { url: videoUrl } : { url: `file://${videoPath}` }
    await X.sendMessage(m.chat, { video: src, caption: `╔══〔 📺 VIDEO DOWNLOAD 〕══╗\n║ 🎬 *${title}*\n╚═══════════════════════╝`, mimetype: 'video/mp4' }, { quoted: m })
} else {
    reply('⚠️ Video download failed. Please try again later.')
}
} catch(e) { reply('❌ Error: ' + e.message) }
finally { if (_vidTmp1 && fs.existsSync(_vidTmp1)) try { fs.unlinkSync(_vidTmp1) } catch {} }
} break

case 'ytdocplay': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
if (!text) return reply(`╔══〔 🎵 YT DOC AUDIO 〕══╗\n\n║ Usage: *${prefix}ytdocplay [song name]*\n║ Example: ${prefix}ytdocplay Tems Free Mind\n╚═══════════════════════╝`)
let _ytdocTmp = null
try {
let search = await yts(text)
if (!search.all.length) return reply('No results found.')
let vid = search.all.find(v => v.type === 'video') || search.all[0]
let audioUrl = null, audioPath = null
// Method 1: GiftedTech API
try {
    let res = await fetch(`${_GTAPI}/api/download/ytmp3?apikey=${_giftedKey()}&quality=128kbps&url=${encodeURIComponent(vid.url)}`, { signal: AbortSignal.timeout(30000) })
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
} catch(e) { reply('❌ Error: ' + e.message) }
finally { if (_ytdocTmp && fs.existsSync(_ytdocTmp)) try { fs.unlinkSync(_ytdocTmp) } catch {} }
} break

case 'ytdocvideo': {
    await X.sendMessage(m.chat, { react: { text: '📺', key: m.key } })
if (!text) return reply(`╔══〔 📺 YT DOC VIDEO 〕══╗\n\n║ Usage: *${prefix}ytdocvideo [video name]*\n║ Example: ${prefix}ytdocvideo Burna Boy live\n╚═══════════════════════╝`)
let _ytdocvTmp = null
try {
let search = await yts(text)
if (!search.all.length) return reply('No results found.')
let vid = search.all.find(v => v.type === 'video') || search.all[0]
let videoUrl = null, videoPath = null
// Method 1: GiftedTech API
try {
    let res = await fetch(`${_GTAPI}/api/download/ytv?apikey=${_giftedKey()}&url=${encodeURIComponent(vid.url)}`, { signal: AbortSignal.timeout(30000) })
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
} catch(e) { reply('❌ Error: ' + e.message) }
finally { if (_ytdocvTmp && fs.existsSync(_ytdocvTmp)) try { fs.unlinkSync(_ytdocvTmp) } catch {} }
} break


case 'apk': {
    await X.sendMessage(m.chat, { react: { text: '📲', key: m.key } })
    if (!text) return reply(`╔══〔 📲 APK SEARCH 〕═════╗
║ *Usage:* ${prefix}apk [app name]
║ Example: ${prefix}apk WhatsApp
╚═══════════════════════╝`)
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
        let _msg = `╔══〔 📦 APK SEARCH: ${text} 〕══╗\n\n`
        for (let [i, a] of _apkResults.entries()) {
            _msg += `\n${i+1}. *${a.name}*`
            if (a.package) _msg += ` (${a.package})`
            _msg += `\n║ 📦 Version: ${a.version} | 💾 Size: ${a.size}`
            if (a.download) _msg += `\n║ 🔗 ${a.download}`
            _msg += '\n'
        }
        await reply(_msg)
    } catch (e) { reply(`╔══〔 📲 APK SEARCH 〕═════╗\n║ 🔍 *Query* : ${text}\n║ 🔗 apkpure.com/search?q=${encodeURIComponent(text)}\n╚═══════════════════════╝`) }
} break

case 'gitclone': {
    await X.sendMessage(m.chat, { react: { text: '📦', key: m.key } })
if (!text) return reply(`╔══〔 📦 GIT CLONE INFO 〕══╗\n\n║ Usage: *${prefix}gitclone [github url]*\n║ Example: ${prefix}gitclone https://github.com/user/repo\n╚═══════════════════════╝`)
try {
let repoUrl = text.replace(/\.git$/, '')
let match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/)
if (!match) return reply('Invalid GitHub URL.')
let [, user, repo] = match
let zipUrl = `https://api.github.com/repos/${user}/${repo}/zipball`
await X.sendMessage(m.chat, { document: { url: zipUrl }, mimetype: 'application/zip', fileName: `${repo}.zip` }, { quoted: m })
} catch(e) { reply('❌ Error: ' + e.message) }
} break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Search & Tools Commands
case 'yts':
case 'ytsearch': {
    await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
if (!text) return reply(`╔══〔 🔍 YOUTUBE SEARCH 〕══╗\n\n║ Usage: *${prefix}yts [query]*\n║ Example: ${prefix}yts best Afrobeats 2025\n╚═══════════════════════╝`)
try {
let yts = require('yt-search')
let search = await yts(text)
if (!search.all.length) return reply('No results found.')
let results = search.all.slice(0, 10).map((v, i) => `${i+1}. *${v.title}*\nChannel: ${v.author?.name || 'Unknown'}\nDuration: ${v.timestamp || 'N/A'}\nViews: ${v.views?.toLocaleString() || 'N/A'}\nURL: ${v.url}`).join('\n\n')
reply(`╔══〔 🎬 YOUTUBE SEARCH 〕══╗\n\n║ 🔍 *${text}*\n\n${results}\n╚═══════════════════════╝`)
} catch(e) { reply('❌ Error: ' + e.message) }
} break

case 'img':
case 'imgfind':
case 'gimage':
case 'image': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
if (!text) return reply(`╔══〔 🖼️ IMAGE SEARCH 〕══╗\n\n║ Usage: *${prefix}img [query]*\n║ Example: ${prefix}img beautiful sunset\n╚═══════════════════════╝`)
try {
let imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=512&height=512&nologo=true`
// Also try Keith image search for real photos
let _keithImgUrl = null
try {
  let _kr = await fetch(`https://apiskeith.top/search/images?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(10000) })
  let _kd = await _kr.json()
  if (_kd.status && Array.isArray(_kd.result) && _kd.result.length) {
    _keithImgUrl = _kd.result[0].url || _kd.result[0].link || _kd.result[0].src
  }
} catch {}
let _finalImg = _keithImgUrl || imgUrl
await X.sendMessage(m.chat, { image: { url: _finalImg }, caption: `╔══〔 🖼️ IMAGE SEARCH 〕══╗
║ 🔍 *Query:* ${text}
╚═══════════════════════╝` }, { quoted: m })
} catch(e) { reply('❌ Error: ' + e.message) }
} break

case 'imdb':
case 'tmdb':
case 'movie':
case 'film':
case 'series': {
    await X.sendMessage(m.chat, { react: { text: '🎬', key: m.key } })
    if (!text) return reply(
        `╔══〔 🎬 MOVIE / SERIES 〕══╗\n\n` +
        `  Search any movie or TV series and get\n  info + trailer.\n\n` +
        `║ *${prefix}movie* Inception\n` +
        `║ *${prefix}movie* Breaking Bad\n` +
        `║ *${prefix}movie* Avengers 2019\n╚═══════════════════════╝`
    )
    try {
        await reply(`🎬 _Searching for_ *${text}*_..._`)

        const _TMDB  = '8265bd1679663a7ea12ac168da84d2e8'
        const _BASE  = 'https://api.themoviedb.org/3'
        const _IMG   = 'https://image.tmdb.org/t/p/w500'
        const _KEITH = 'https://apiskeith.top'
        const _na    = (v) => (v !== null && v !== undefined && v !== '') ? v : '—'
        const _q     = text.trim()
        const _ym    = _q.match(/(19|20)\d{2}/)
        const _year  = _ym ? _ym[0] : ''
        const _titl  = _q.replace(_year, '').trim()

        // Step 1: TMDB search (movie + tv) + Keith moviebox search — all in parallel
        const [_mRes, _tRes, _kRes] = await Promise.allSettled([
            fetch(`${_BASE}/search/movie?api_key=${_TMDB}&query=${encodeURIComponent(_titl)}${_year ? `&year=${_year}` : ''}`).then(r => r.json()),
            fetch(`${_BASE}/search/tv?api_key=${_TMDB}&query=${encodeURIComponent(_titl)}${_year ? `&first_air_date_year=${_year}` : ''}`).then(r => r.json()),
            fetch(`${_KEITH}/moviebox/search?q=${encodeURIComponent(_q)}`, { signal: AbortSignal.timeout(12000) }).then(r => r.json())
        ])

        const _tmdbAll = [
            ...(_mRes.status === 'fulfilled' ? (_mRes.value?.results || []).map(x => ({ ...x, _mt: 'movie' })) : []),
            ...(_tRes.status === 'fulfilled' ? (_tRes.value?.results || []).map(x => ({ ...x, _mt: 'tv'    })) : [])
        ].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))

        // Best Keith moviebox match (title fuzzy match first, else first result)
        const _kResults = (_kRes.status === 'fulfilled' && _kRes.value?.status) ? (_kRes.value.result?.results || []) : []
        const _kPick = _kResults.find(r => r.title?.toLowerCase().includes(_titl.toLowerCase())) || _kResults[0] || null

        if (!_tmdbAll.length && !_kPick) return reply(
            `╔══〔 🎬 MOVIE SEARCH 〕══╗\n\n` +
            `  ❌ *Not found:* _${text}_\n\n` +
            `  _Try a different spelling or add the year._\n` +
            `  _Example:_ *${prefix}movie Inception 2010*\n╚═══════════════════════╝`
        )

        // Step 2: TMDB details + Keith trailer — in parallel
        const _pick  = _tmdbAll[0]
        const _mt    = _pick?._mt || 'movie'
        const _isTV  = _mt === 'tv'

        const [_dRes, _trRes] = await Promise.allSettled([
            _pick ? fetch(`${_BASE}/${_mt}/${_pick.id}?api_key=${_TMDB}&append_to_response=credits`).then(r => r.json()) : Promise.resolve(null),
            _kPick?.url ? fetch(`${_KEITH}/movie/trailer?q=${encodeURIComponent(_kPick.url)}`, { signal: AbortSignal.timeout(15000) }).then(r => r.json()) : Promise.resolve(null)
        ])
        const _d   = _dRes.status  === 'fulfilled' ? _dRes.value  : null
        const _tr  = _trRes.status === 'fulfilled' ? _trRes.value : null
        const _trd = _tr?.status ? _tr.result : null

        // Build metadata
        const _icon   = _isTV ? '📺' : '🎬'
        const _tStr   = _isTV ? 'TV SERIES' : 'MOVIE'
        const _title2 = _na(_d?.title || _d?.name || _trd?.title || _kPick?.title || _pick?.title || _pick?.name)
        const _yr2    = (_d?.release_date || _d?.first_air_date || '').slice(0, 4)
        const _genres = (_d?.genres || []).map(g => g.name).join(', ') || '—'
        const _rt     = _isTV
            ? (_d?.episode_run_time?.[0] ? `${_d.episode_run_time[0]} min/ep` : '—')
            : (_d?.runtime ? `${_d.runtime} min` : '—')
        const _lang   = _na((_d?.original_language || '').toUpperCase())
        const _score  = _d?.vote_average ? `${_d.vote_average.toFixed(1)}/10 ⭐` : '—'
        // Keith rating is doubled e.g. "8.88.8" — take first half
        const _kRaw   = _kPick?.rating || ''
        const _kRating = _kRaw.length >= 2 ? _kRaw.slice(0, _kRaw.length / 2) : _kRaw
        const _plot   = _na(_d?.overview || _trd?.description)
        const _poster = _d?.poster_path ? `${_IMG}${_d.poster_path}` : (_trd?.thumbnail || null)
        const _dir    = !_isTV
            ? (_d?.credits?.crew?.find(c => c.job === 'Director')?.name || '—')
            : (_d?.created_by?.map(c => c.name).join(', ') || '—')
        const _cast   = (_d?.credits?.cast || []).slice(0, 5).map(c => c.name).join(', ') || '—'
        const _imdbId = _d?.imdb_id || ''
        const _trailerMp4 = _trd?.trailerUrl || null

        let _cap  = `╔══〔 ${_icon} ${_tStr} INFO 〕══╗\n\n`
            _cap += `  *${_title2}*  _(${_yr2 || '?'})_\n\n`
            _cap += `║ 🎭 *Genre* : ${_genres}\n`
            _cap += `║ ⏱️  *Runtime* : ${_rt}\n`
            _cap += `║ 🌍 *Language* : ${_lang}\n`
        if (_score !== '—') _cap += `║ ⭐ *TMDB Rating* : ${_score}\n`
        if (_kRating && _kRating !== '0') _cap += `║ ⭐ *MovieBox Rating* : ${_kRating}\n`
        if (_isTV && _d) {
            _cap += `║ 📺 *Seasons* : ${_na(_d.number_of_seasons)} seasons · ${_na(_d.number_of_episodes)} episodes\n`
        }
            _cap += `║ 🎬 *${_isTV ? 'Creator' : 'Director'}* : ${_dir}\n`
            _cap += `║ 🎭 *Cast* : ${_cast}\n`
            _cap += `\n║ 📝 *Plot:*\n║ _${_plot.slice(0, 350)}${_plot.length > 350 ? '…' : ''}_\n`
        if (_imdbId) _cap += `\n║ 🔗 https://www.imdb.com/title/${_imdbId}\n`
        if (_kPick?.url) _cap += `║ 📺 ${_kPick.url}\n`
        if (_trailerMp4) _cap += `\n╠══〔 🎞️ TRAILER BELOW 〕══╣\n`
        _cap += `╚═══════════════════════╝`

        // Send poster with info card
        if (_poster) {
            await X.sendMessage(m.chat, { image: { url: _poster }, caption: _cap }, { quoted: m })
        } else {
            await reply(_cap)
        }

        // Send trailer video if available
        if (_trailerMp4) {
            await X.sendMessage(m.chat, {
                video: { url: _trailerMp4 },
                caption: `🎬 *${_title2}* — Official Trailer`,
                mimetype: 'video/mp4'
            }, { quoted: m })
        }

    } catch(e) {
        reply(`❌ *Movie search failed.*\n_${e.message || 'Please try again.'}_`)
    }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎬  DRAMA & MOVIE SEARCH (Keith API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'dramabox':
case 'drama': {
    await X.sendMessage(m.chat, { react: { text: '🇟🇰', key: m.key } })
    const _dbq = q?.trim() || text?.trim()
    if (!_dbq) return reply(`╌══〔 🇟🇰 DRAMABOX SEARCH 〕╌\n║ *Usage:* ${prefix}drama [title]\n║ Example: ${prefix}drama crash landing\n╚═══════════════════════╝`)
    try {
        await reply(`🔍 _Searching DramaBox for: ${_dbq}..._`)
        const _dbd = await _keithFetch(`/dramabox?q=${encodeURIComponent(_dbq)}`)
        const _dbr = Array.isArray(_dbd) ? _dbd : (_dbd?.result || _dbd?.dramas || [])
        if (!_dbr.length) { reply(`❌ No dramas found for *${_dbq}*`); break }
        let msg = `╌══〔 🇟🇰 DRAMABOX RESULTS 〕╌\n`
        for (let d of _dbr.slice(0, 5)) {
            msg += `\n🎬 *${d.title || d.name}*\n`
            if (d.year) msg += `   📅 Year: ${d.year}\n`
            if (d.rating) msg += `   ⭐ Rating: ${d.rating}\n`
            if (d.episodes) msg += `   📺 Episodes: ${d.episodes}\n`
            if (d.genre) msg += `   🏷️ Genre: ${Array.isArray(d.genre) ? d.genre.join(', ') : d.genre}\n`
            if (d.url) msg += `   🔗 ${d.url}\n`
        }
        msg += `\n╚═══════════════════════╝`
        await reply(msg)
    } catch(e) { reply('❌ Drama search failed. Try again later.') }
} break

case 'movsearch':
case 'searchmovie': {
    await X.sendMessage(m.chat, { react: { text: '🎬', key: m.key } })
    const _mvsq = q?.trim() || text?.trim()
    if (!_mvsq) return reply(`╌══〔 🎬 MOVIE SEARCH 〕═══╌\n║ *Usage:* ${prefix}movsearch [title]\n║ Example: ${prefix}movsearch avengers\n╚═══════════════════════╝`)
    try {
        await reply(`🔍 _Searching movies: ${_mvsq}..._`)
        const _mvsd = await _keithFetch(`/moviebox/search?q=${encodeURIComponent(_mvsq)}`)
        const _mvsr = Array.isArray(_mvsd) ? _mvsd : (_mvsd?.result || _mvsd?.movies || [])
        if (!_mvsr.length) { reply(`❌ No movies found for *${_mvsq}*`); break }
        let msg = `╌══〔 🎬 MOVIE RESULTS 〕═══╌\n`
        for (let mv of _mvsr.slice(0, 5)) {
            msg += `\n🎬 *${mv.title || mv.name}*\n`
            if (mv.year) msg += `   📅 Year: ${mv.year}\n`
            if (mv.rating || mv.imdbRating) msg += `   ⭐ Rating: ${mv.rating || mv.imdbRating}\n`
            if (mv.genre) msg += `   🏷️ Genre: ${Array.isArray(mv.genre) ? mv.genre.join(', ') : mv.genre}\n`
            if (mv.description || mv.plot) msg += `   📝 ${(mv.description || mv.plot || '').slice(0, 100)}...\n`
        }
        msg += `\n╚═══════════════════════╝`
        await reply(msg)
    } catch(e) { reply('❌ Movie search failed. Try again later.') }
} break

case 'trailer':
case 'movietrailer': {
    await X.sendMessage(m.chat, { react: { text: '🎬', key: m.key } })
    const _trq = q?.trim() || text?.trim()
    if (!_trq) return reply(`╌══〔 🎬 MOVIE TRAILER 〕══╌\n║ *Usage:* ${prefix}trailer [movie name]\n║ Example: ${prefix}trailer avengers\n╚═══════════════════════╝`)
    try {
        await reply(`🎬 _Searching trailer for: ${_trq}..._`)
        const _trd = await _keithFetch(`/movie/trailer?q=${encodeURIComponent(_trq)}`)
        const _trr = _trd?.result || _trd
        if (!_trr?.title) {
            // fallback: use youtube search for trailer
            const _yts = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(_trq + ' official trailer')}`)
            const _ythtml = await _yts.text()
            const _ytmatch = _ythtml.match(/\"videoId\":\"([^\"]{11})\"/)
            if (_ytmatch) {
                const _ytUrl = `https://www.youtube.com/watch?v=${_ytmatch[1]}`
                await reply(`🎬 *Trailer: ${_trq}*\n\n🔗 ${_ytUrl}\n\n_Use .ytdl to download the trailer!_`)
            } else throw new Error('No trailer found')
        } else {
            let msg = `╌══〔 🎬 TRAILER 〕═══════╌\n`
            msg += `\n🎬 *${_trr.title}*\n`
            if (_trr.year) msg += `   📅 Year: ${_trr.year}\n`
            if (_trr.rating) msg += `   ⭐ Rating: ${_trr.rating}\n`
            if (_trr.trailerUrl || _trr.url) msg += `\n🔗 *Trailer:* ${_trr.trailerUrl || _trr.url}\n`
            if (_trr.description || _trr.overview) msg += `\n📝 _${(_trr.description || _trr.overview).slice(0, 200)}_\n`
            msg += `\n╚═══════════════════════╝`
            await reply(msg)
        }
    } catch(e) { reply(`❌ Could not find trailer for *${_trq}*. Try another title.`) }
} break



// ── Direct stream lookup: .stream [xcasper-id] [movie|tv] [season?] [ep?]
case 'stream':
case 'getstream':
case 'episode': {
    await X.sendMessage(m.chat, { react: { text: '📺', key: m.key } })
    const _sArgs = text?.trim().split(/\s+/) || []
    const _sId   = _sArgs[0]
    const _sType = (_sArgs[1] || 'movie').toLowerCase()
    const _sSeas = parseInt(_sArgs[2]) || 1
    const _sEp   = parseInt(_sArgs[3]) || 1
    if (!_sId) return reply(
        `╔══〔 📺 STREAM LOOKUP 〕══╗\n\n` +
        `Usage: *${prefix}stream [id] [movie|tv] [season] [episode]*\n\n` +
        `Examples:\n║ ${prefix}stream 4059 movie\n║ ${prefix}stream 77 tv 1 3\n\n` +
        `_Get the ID from ${prefix}movie search results_\n╚═══════════════════════╝`
    )
    try {
        await reply(`📺 _Fetching stream links..._`)
        const _XCASPER = 'https://movieapi.xcasper.space'
        const _isTV = _sType === 'tv'
        const _url = _isTV
            ? `${_XCASPER}/api/showbox/tv?id=${_sId}&season=${_sSeas}&episode=${_sEp}`
            : `${_XCASPER}/api/showbox/movie?id=${_sId}`
        const _sr = await fetch(_url, { signal: AbortSignal.timeout(20000) })
        const _sd = await _sr.json()
        if (!_sd.success || !_sd.data) return reply(`❌ Title ID *${_sId}* not found. Get IDs from *${prefix}movie* search.`)

        const _files = _sd.data.file || []
        const _freeFiles = _files.filter(f => !f.vip_only && f.path && f.path.startsWith('http'))
        const _allFiles  = _files.filter(f => f.path && f.path.startsWith('http'))
        const _title = _sd.data.title || `ID ${_sId}`

        let _msg = `╔══〔 📺 STREAM LINKS 〕══╗\n\n`
        _msg += `🎬 *${_title}*`
        if (_isTV) _msg += ` — S${_sSeas}E${_sEp}`
        _msg += '\n'
        if (_sd.data.imdb_rating) _msg += `⭐ IMDb: ${_sd.data.imdb_rating}/10\n`

        if (!_allFiles.length) {
            _msg += `\n⚠️ _No stream links available for this title right now._\n`
            _msg += _isTV ? `\nTry a different season/episode.` : `\nThis movie may be VIP-only or not yet available.`
        } else {
            if (_freeFiles.length) {
                _msg += `\n✅ *FREE STREAMS (${_freeFiles.length}):*\n`
                for (const _f of _freeFiles) {
                    _msg += `\n🎞️ *${_f.quality}* ${_f.format ? `(${_f.format.toUpperCase()})` : ''} — ${_f.size || '?'}\n`
                    _msg += `${_f.path}\n`
                }
            }
            const _vipOnly = _allFiles.filter(f => f.vip_only)
            if (_vipOnly.length) {
                _msg += `\n🔒 *VIP QUALITY OPTIONS:* ${_vipOnly.map(f => f.quality).join(', ')}\n`
            }
            _msg += `\n_Open in VLC / MX Player / any video player_`
        }

        if (_isTV && _sd.data.seasons?.length) {
            _msg += `\n\n📺 *Seasons available:* ${_sd.data.seasons.map(s => `S${s.season_num}`).join(', ')}`
            _msg += `\n_Use ${prefix}stream ${_sId} tv [season] [episode] for specific episodes_`
        }
        _msg += '\n╚═══════════════════════╝'
        await reply(_msg)
    } catch(e) {
        reply(`❌ Stream lookup failed: ${e.message}`)
    }
} break

case 'shazam': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
if (!m.quoted || !/audio|video/.test(m.quoted.mimetype || '')) return reply(`╔══〔 🎵 SHAZAM — SONG FINDER 〕══╗\n\n║ Reply to an audio/video with *${prefix}shazam*\n║ _Works with voice notes, music & video clips._\n╚═══════════════════════╝`)
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
    let _gtSh = await fetch(`${_GTAPI}/api/search/shazam?apikey=${_giftedKey()}&url=${encodeURIComponent(audioUrl)}`, { signal: AbortSignal.timeout(30000) })
    let _gtShD = await _gtSh.json()
    if (_gtShD.success && _gtShD.result) shazamResult = _gtShD.result
} catch {}
if (shazamResult) {
    let s = shazamResult
    let caption = `╔══〔 🎵 SHAZAM RESULT 〕══╗\n`
    caption += `║ 🎼 *Title* : ${s.title || 'Unknown'}\n`
    caption += `║ 🎤 *Artist* : ${s.artist || 'Unknown'}\n`
    if (s.album) caption += `║ 💿 *Album* : ${s.album}\n`
    if (s.genre) caption += `║ 🎸 *Genre* : ${s.genre}\n`
    if (s.year) caption += `║ 📅 *Year* : ${s.year}\n`
    if (s.spotify) caption += `║ 🟢 *Spotify* : ${s.spotify}\n`
    if (s.apple_music) caption += `║ 🍎 *Apple Music* : ${s.apple_music}\n`
    caption += `╚═══════════════════════╝`
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
        timeout: 20000
    })
    if (fallbackRes.data?.status === 'success' && fallbackRes.data?.result?.length) {
        let topLyric = fallbackRes.data.result[0]
        return reply(`╔═══〔 🎵 SONG FOUND 〕═══╗\n\n║ 🎤 *Title* : ${topLyric.title || 'Unknown'}\n║ 👤 *Artist* : ${topLyric.artist || 'Unknown'}\n\n║ _Lyrics match (fingerprint unavailable)._\n╚═══════════════════════╝`)
    }
    return reply(`╔═════〔 🎵 SHAZAM 〕═════╗\n\n║ ❌ Song not recognized.\n\n║ Use a longer clip (10–30 seconds)\n║ Ensure clear audio, minimal noise\n║ Try the chorus or main melody\n╚═══════════════════════╝`)
}
let r = auddData.result
// Build response
let lines = []
lines.push(`╔══〔 🎵 SONG IDENTIFIED! 〕══╗`)
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
lines.push(`╚═══════════════════════╝`)
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
if (!text) return reply(`╔═══〔 📥 API FETCH 〕════╗\n\n║ Usage: *${prefix}fetch [url]*\n║ Example: ${prefix}fetch https://api.example.com/data\n╚═══════════════════════╝`)
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
} catch(e) { reply('❌ Error: ' + e.message) }
} break

case 'ssweb':
case 'ssphone':
case 'screenshot':
case 'ss': {
    await X.sendMessage(m.chat, { react: { text: '📸', key: m.key } })
    if (!text || !text.startsWith('http')) return reply(`╌══〔 📸 SCREENSHOT 〕════╌\n║ *Usage:* ${prefix}ss [url]\n║ Example: ${prefix}ss https://google.com\n╚═══════════════════════╝`)
    try {
        await reply(`📸 _Taking screenshot of ${text}..._`)
        let _ssUrl = null
        // Keith API first
        try {
            const _sskd = await _keithFetch(`/tool/screenshot?url=${encodeURIComponent(text)}`)
            if (_sskd?.screenshot) _ssUrl = _sskd.screenshot
            else if (_sskd?.result?.url) _ssUrl = _sskd.result.url
            else if (_sskd?.url) _ssUrl = _sskd.url
        } catch {}
        // Thum.io fallback
        if (!_ssUrl) _ssUrl = `https://image.thum.io/get/width/1280/crop/800/${encodeURIComponent(text)}`
        await safeSendMedia(m.chat, { image: { url: _ssUrl }, caption: `📸 *Screenshot*\n🔗 ${text}` }, {}, { quoted: m })
    } catch(e) { reply('❌ Screenshot failed: ' + e.message) }
} break

case 'webcopier':
case 'sitecopy':
case 'webcopy': {
    await X.sendMessage(m.chat, { react: { text: '💾', key: m.key } })
    if (!text || !text.startsWith('http')) return reply(`╔═══〔 💾 WEB COPIER 〕═══╗\n\n║ Usage: *${prefix}${command} [url]*\n║ Example: ${prefix}${command} https://google.com\n\n║ _Downloads a full offline copy of any website as a ZIP archive._\n╚═══════════════════════╝`)
    try {
        await reply('💾 _Copying website, please wait..._')
        let _wcRes = await fetch(`https://eliteprotech-apis.zone.id/webcopier?url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(45000) })
        let _wcd   = await _wcRes.json()
        if (_wcd.success && _wcd.download) {
            reply(`╔═══〔 💾 WEB COPIER 〕═══╗\n\n║ ✅ *Website copied successfully!*\n\n║ 🔗 *Source* : ${text}\n║ 📦 *Download ZIP* : ${_wcd.download}\n\n║ _Click the link above to download the full website archive._\n╚═══════════════════════╝`)
        } else {
            reply('❌ Could not copy this website. Make sure the URL is accessible and try again.')
        }
    } catch(e) { reply(`❌ Web copier failed.\n_${e.message}_`) }
} break

case 'trt':
case 'translate':
case 'tr': {
    await X.sendMessage(m.chat, { react: { text: '🌐', key: m.key } })
    if (!text) return reply(`╌══〔 🌐 TRANSLATOR 〕═════╌\n║ *Usage:* ${prefix}translate [lang]|[text]\n║ *Reply:* ${prefix}translate [lang]\n║\n║ *Codes:* en fr es de ar zh sw pt ru ja\n╚═══════════════════════╝`)
    try {
        let targetLang = 'en', inputText = ''
        if (text.includes('|')) { const parts = text.split('|'); targetLang = parts[0].trim(); inputText = parts.slice(1).join('|').trim() }
        else if (m.quoted) { targetLang = text.trim() || 'en'; inputText = m.quoted.text || m.quoted.body || '' }
        else { inputText = text }
        if (!inputText) return reply('❌ Please provide text to translate.')
        await reply(`🌐 _Translating to ${targetLang.toUpperCase()}..._`)
        let _trResult = null
        // Keith API first
        try {
            const _trkd = await _keithFetch(`/translate?q=${encodeURIComponent(inputText)}&to=${encodeURIComponent(targetLang)}`)
            if (_trkd?.translated) _trResult = _trkd.translated
            else if (_trkd?.result?.translated) _trResult = _trkd.result.translated
            else if (typeof _trkd?.result === 'string') _trResult = _trkd.result
        } catch {}
        // MyMemory fallback
        if (!_trResult) {
            const _mm = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(inputText)}&langpair=auto|${targetLang}`, { signal: AbortSignal.timeout(12000) })
            const _mmd = await _mm.json()
            _trResult = _mmd.responseData?.translatedText || null
        }
        if (!_trResult) throw new Error('Translation failed')
        await reply(`╌══〔 🌐 TRANSLATION 〕════╌\n\n📝 *Original:* _${inputText}_\n\n💬 *${targetLang.toUpperCase()}:*\n${_trResult}\n╚═══════════════════════╝`)
    } catch(e) { reply('❌ Translation failed: ' + e.message) }
} break

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🔊  TEXT TO SPEECH
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  case 'tts':
  case 'speak':
  case 'say': {
      await X.sendMessage(m.chat, { react: { text: '🔊', key: m.key } })
      let _ttsText = text || (m.quoted ? (m.quoted.text || m.quoted.body || '') : '')
      let _ttsLang = 'en'
      if (!_ttsText) return reply(`╔══〔 🔊 TEXT TO SPEECH 〕══╗\n\n║ *Usage:*\n║ *${prefix}tts* [text]\n║ *${prefix}tts* [lang]|[text]\n║ Reply to text with *${prefix}tts*\n║\n║ *Languages:* en · es · fr · de · ar\n║   pt · hi · zh · ja · ko · ru\n╚═══════════════════════╝`)
      if (_ttsText.includes('|')) {
          const _sp = _ttsText.split('|')
          _ttsLang = _sp[0].trim().toLowerCase() || 'en'
          _ttsText = _sp.slice(1).join('|').trim()
      }
      if (!_ttsText) return reply('❌ Please provide text to convert to speech.')
      if (_ttsText.length > 200) _ttsText = _ttsText.slice(0, 200)
      try {
          let _ttsAudio = null
          // Method 1: Keith API TTS
          try {
              const _kth = await _keithFetch(`/tts?text=${encodeURIComponent(_ttsText)}&lang=${encodeURIComponent(_ttsLang)}`, 30000)
              if (_kth?.url) {
                  const _rb = await fetch(_kth.url, { signal: AbortSignal.timeout(20000) })
                  if (_rb.ok) _ttsAudio = Buffer.from(await _rb.arrayBuffer())
              }
          } catch {}
          // Method 2: Google Translate TTS (no key)
          if (!_ttsAudio) {
              try {
                  const _gtUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(_ttsLang)}&client=tw-ob&q=${encodeURIComponent(_ttsText)}`
                  const _gtRes = await fetch(_gtUrl, {
                      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36' },
                      signal: AbortSignal.timeout(20000)
                  })
                  if (_gtRes.ok) {
                      const _ct = _gtRes.headers.get('content-type') || ''
                      if (_ct.includes('audio') || _ct.includes('mpeg')) {
                          _ttsAudio = Buffer.from(await _gtRes.arrayBuffer())
                      }
                  }
              } catch {}
          }
          // Method 3: VoiceRSS-style fallback via Keith translate endpoint
          if (!_ttsAudio) {
              try {
                  const _vRes = await fetch(`https://apiskeith.top/api/tts?text=${encodeURIComponent(_ttsText)}&language=${encodeURIComponent(_ttsLang)}`, {
                      signal: AbortSignal.timeout(25000)
                  })
                  if (_vRes.ok) {
                      const _vct = _vRes.headers.get('content-type') || ''
                      if (_vct.includes('audio') || _vct.includes('mpeg') || _vct.includes('wav')) {
                          _ttsAudio = Buffer.from(await _vRes.arrayBuffer())
                      } else {
                          const _vd = await _vRes.json().catch(() => null)
                          if (_vd?.url) {
                              const _vAB = await fetch(_vd.url, { signal: AbortSignal.timeout(15000) })
                              if (_vAB.ok) _ttsAudio = Buffer.from(await _vAB.arrayBuffer())
                          }
                      }
                  }
              } catch {}
          }
          if (!_ttsAudio || _ttsAudio.length < 500) throw new Error('TTS service unavailable. Try again shortly.')
          await X.sendMessage(m.chat, {
              audio: _ttsAudio,
              mimetype: 'audio/mpeg',
              fileName: 'tts.mp3',
              ptt: true
          }, { quoted: m })
      } catch(e) { reply(`❌ *TTS failed:* ${e.message}`) }
  } break
  

case 'transcribe': {
    await X.sendMessage(m.chat, { react: { text: '🎙️', key: m.key } })
if (!m.quoted || !/audio|video/.test(m.quoted.mimetype || ''))
    return reply(`╔══〔 🎙️ VOICE TRANSCRIBER 〕══╗\n\n║ Reply to a voice note or audio with\n║ *${prefix}transcribe*\n║ _Converts speech to text automatically._\n╚═══════════════════════╝`)
try {
    await reply('🎙️ _Transcribing audio, please wait..._')
    const _tcBuf = await m.quoted.download()
    if (!_tcBuf || _tcBuf.length < 100) throw new Error('Failed to download audio')
    const _tcPath = require('path').join(__dirname, 'tmp', `tc_${Date.now()}.mp3`)
    fs.writeFileSync(_tcPath, _tcBuf)
    const _tcUrl = await CatBox(_tcPath)
    fs.unlinkSync(_tcPath)
    if (!_tcUrl || !_tcUrl.startsWith('http')) throw new Error('Audio upload failed')
    let _tcText = null
    // Method 1: HuggingFace Whisper public inference (free, no key required)
    try {
        const _hfRes = await fetch('https://api-inference.huggingface.co/models/openai/whisper-small', {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream' },
            body: _tcBuf, signal: AbortSignal.timeout(45000)
        })
        const _hfData = await _hfRes.json()
        if (_hfData?.text && _hfData.text.trim().length > 2) _tcText = _hfData.text.trim()
    } catch {}
    // Method 2: GiftedTech totext (tries the URL against their API)
    if (!_tcText) try {
        const _gtRes = await fetch(`${_GTAPI}/api/tools/totext?apikey=${_giftedKey()}&url=${encodeURIComponent(_tcUrl)}`, { signal: AbortSignal.timeout(30000) })
        const _gtData = await _gtRes.json()
        if (_gtData?.success && typeof _gtData.result === 'string' && _gtData.result.trim().length > 2) _tcText = _gtData.result.trim()
    } catch {}
    // Method 3: Whisper large-v3 via HuggingFace (better accuracy)
    if (!_tcText) try {
        const _hf2Res = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v3', {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream' },
            body: _tcBuf, signal: AbortSignal.timeout(60000)
        })
        const _hf2Data = await _hf2Res.json()
        if (_hf2Data?.text && _hf2Data.text.trim().length > 2) _tcText = _hf2Data.text.trim()
    } catch {}
    if (_tcText) {
        reply(`╔══〔 🎙️ TRANSCRIPTION 〕══╗\n\n${_tcText}\n╚═══════════════════════╝`)
    } else {
        reply(`╔══〔 🎙️ TRANSCRIPTION 〕══╗\n\n║ ⚠️ _Could not auto-transcribe this audio._\n\n║ Try these alternatives:\n║ *${prefix}shazam* : identify music\n║ *${prefix}ai* [describe what you heard]\n╚═══════════════════════╝`)
    }
} catch (e) { reply('❌ Transcription failed: ' + e.message) }
} break

case 'locate':
case 'location': {
    await X.sendMessage(m.chat, { react: { text: '📍', key: m.key } })
if (!text) return reply(`╔════〔 📍 LOCATION 〕════╗\n\n║ Usage: *${prefix}location [city / address]*\n║ Example: ${prefix}location Nairobi, Kenya\n╚═══════════════════════╝`)
try {
let res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=1`, { headers: { 'User-Agent': 'ToosiiBot/1.0' } })
let data = await res.json()
if (!data.length) return reply('╔══〔 ⚠️ WEATHER 〕══╗\n\n║ Location not found.\n║ Try a different city name.\n╚═══════════════════════╝')
let loc = data[0]
await X.sendMessage(m.chat, { location: { degreesLatitude: parseFloat(loc.lat), degreesLongitude: parseFloat(loc.lon) }, caption: loc.display_name }, { quoted: m })
} catch(e) { reply('❌ Error: ' + e.message) }
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
    return reply(`╔══〔 📄 TEXT EXTRACTOR 〕══╗\n║ Reply to an image with *${prefix}totext*\n║ _Screenshots, docs, signs, receipts_\n╚═══════════════════════╝`)
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
    reply(`╔══〔 📄 EXTRACTED TEXT 〕══╗\n\n${_extracted}\n╚═══════════════════════╝`)
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

    // ── Helper: upload buffer to catbox, get public URL ─────────────
    const _uploadCatbox = async (buf) => {
        const _tmpP = require("path").join(__dirname, "tmp", `rbg_${Date.now()}.jpg`)
        require('fs').writeFileSync(_tmpP, buf)
        const url = await CatBox(_tmpP)
        try { require('fs').unlinkSync(_tmpP) } catch {}
        return url
    }

    // ── Method 1: Keith API removebg ─────────────────────────────────
    if (!_result) {
        try {
            const _kCatUrl = await _uploadCatbox(_rBuf)
            if (_kCatUrl) {
                const _kRbRes = await fetch(`https://apiskeith.top/ai/removebg?url=${encodeURIComponent(_kCatUrl)}`, { signal: AbortSignal.timeout(30000) })
                const _kRbJson = await _kRbRes.json()
                const _kRbUrl = _kRbJson?.result
                if (_kRbUrl && typeof _kRbUrl === 'string' && _kRbUrl.startsWith('http')) {
                    _result = await _dlImg(_kRbUrl)
                }
            }
        } catch {}
    }

    // ── Method 2: GiftedTech removebgv2 (returns JSON with result URL) ──
    if (!_result) {
        try {
            const _catUrl = await _uploadCatbox(_rBuf)
            if (_catUrl) {
                const _gtRes = await fetch(`${_GTAPI}/api/tools/removebgv2?apikey=${_giftedKey()}&url=${encodeURIComponent(_catUrl)}`, { signal: AbortSignal.timeout(45000) })
                const _ctype = _gtRes.headers.get('content-type') || ''
                if (_ctype.includes('image')) {
                    _result = Buffer.from(await _gtRes.arrayBuffer())
                } else {
                    const _gtJson = await _gtRes.json()
                    const _imgUrl = _gtJson?.result?.image_url || _gtJson?.result?.url || _gtJson?.result
                    if (_imgUrl && typeof _imgUrl === 'string' && _imgUrl.startsWith('http')) {
                        _result = await _dlImg(_imgUrl)
                    }
                }
            }
        } catch {}
    }

    // ── Method 3: Python rembg (local AI, no API limits) ─────────────
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
                    headers: { 'X-Api-Key': _rbKey },
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
                    headers: { 'x-api-key': _cdKey },
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🖼️  IMAGE ENHANCEMENT (Keith API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'hd':
case 'upscale': {
    await X.sendMessage(m.chat, { react: { text: '🔭', key: m.key } })
    if (!m.quoted) return reply('❌ *Reply to an image* to upscale/enhance it to HD quality.')
    if (!/image/.test(mime)) return reply('❌ *Reply to an image* to upscale/enhance it to HD quality.')
    try {
        await reply('🔭 _Enhancing image to HD... Please wait..._')
        const _hdBuf = await quoted.download()
        if (!_hdBuf || _hdBuf.length < 100) throw new Error('Failed to download image')
        let _hdOutUrl = null
        let _hdOutBuf = null
        // Source 1: Keith API HD enhancer
        try {
            const _hdTmpP = require("path").join(__dirname, "tmp", `hd_${Date.now()}.jpg`)
            require('fs').writeFileSync(_hdTmpP, _hdBuf)
            const _hdCatUrl = await CatBox(_hdTmpP)
            try { require('fs').unlinkSync(_hdTmpP) } catch {}
            if (_hdCatUrl) {
                const _hdKRes = await fetch(`https://apiskeith.top/ai/hd?url=${encodeURIComponent(_hdCatUrl)}`, { signal: AbortSignal.timeout(30000) })
                const _hdKJson = await _hdKRes.json()
                const _hdKUrl = Array.isArray(_hdKJson?.result) ? _hdKJson.result[0] : _hdKJson?.result
                if (_hdKUrl && typeof _hdKUrl === 'string' && _hdKUrl.startsWith('http')) _hdOutUrl = _hdKUrl
            }
        } catch {}
        // Source 2: waifu2x free API (no key required)
        if (!_hdOutUrl) {
        try {
            const _fd = require('form-data')
            const _form = new _fd()
            _form.append('file', _hdBuf, { filename: 'image.jpg', contentType: 'image/jpeg' })
            const { data: _w } = await axios.post('https://api.deepai.org/api/waifu2x', _form, {
                headers: { 'api-key': 'quickstart-QUdJIGlzIGF3ZXNvbWU=' },
                timeout: 40000
            })
            if (_w?.output_url) _hdOutUrl = _w.output_url
        } catch {}
        }
        // Source 3: Jimp 2× upscale (always works — no API needed)
        if (!_hdOutUrl) {
            try {
                const Jimp = require('jimp')
                const _img = await Jimp.read(_hdBuf)
                const _w2 = _img.getWidth(), _h2 = _img.getHeight()
                _img.resize(Math.min(_w2 * 2, 2048), Jimp.AUTO, Jimp.RESIZE_BICUBIC)
                _img.quality(95)
                _hdOutBuf = await _img.getBufferAsync(Jimp.MIME_JPEG)
            } catch (_je) { throw new Error('Image processing failed: ' + _je.message) }
        }
        if (_hdOutUrl) {
            await X.sendMessage(m.chat, { image: { url: _hdOutUrl }, caption: '✅ *Image enhanced to HD!*' }, { quoted: m })
        } else if (_hdOutBuf) {
            await X.sendMessage(m.chat, { image: _hdOutBuf, caption: '✅ *Image upscaled 2× with HD quality!*' }, { quoted: m })
        } else {
            throw new Error('Could not process image')
        }
    } catch(e) { reply(`❌ HD upscale failed: ${e.message}`) }
} break
case 'imageedit':
case 'imgfilter': {
    await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
    const _ieMsg = m.quoted || m
    const _ieMime = _ieMsg?.message?.imageMessage?.mimetype || _ieMsg?.mimetype || ''
    if (!_ieMime.startsWith('image/')) return reply(`❌ *Reply to an image* then use *${prefix}imageedit [prompt]*\n\n_Example:_ ${prefix}imageedit make it cartoon`)
    const _iePrompt = (q?.trim() || text?.trim() || 'enhance')
    try {
        await reply(`🎨 _Editing image: "${_iePrompt}"..._`)
        const _ieBuf = await (m.quoted ? m.quoted.download() : X.downloadMediaMessage(_ieMsg))
        // Upload to catbox for a public URL
        const _ieTmpP = require("path").join(__dirname, "tmp", `ie_${Date.now()}.jpg`)
        require('fs').writeFileSync(_ieTmpP, _ieBuf)
        const _ieCatUrl = await CatBox(_ieTmpP)
        try { require('fs').unlinkSync(_ieTmpP) } catch {}
        if (!_ieCatUrl) throw new Error('Image upload failed')
        // Keith imageedit — GET endpoint, returns raw image bytes
        const _ieRes = await fetch(`https://apiskeith.top/ai/imageedit?q=${encodeURIComponent(_iePrompt)}&url=${encodeURIComponent(_ieCatUrl)}`, { signal: AbortSignal.timeout(45000) })
        const _ieCtype = _ieRes.headers.get('content-type') || ''
        if (!_ieRes.ok) throw new Error(`API error ${_ieRes.status}`)
        const _ieFinalBuf = Buffer.from(await _ieRes.arrayBuffer())
        if (_ieFinalBuf.length < 1000) throw new Error('Empty response from image editor')
        await X.sendMessage(m.chat, { image: _ieFinalBuf, caption: `🎨 *Prompt:* ${_iePrompt}` }, { quoted: m })
    } catch(e) { reply(`❌ Image edit failed: ${e.message}`) }
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
          await reply(`╌══〔 🙅 NEVER HAVE I EVER 〕═╌\n\n✋ _Raise your hand if you have..._\n\n💬 *${_nhtxt}*\n\n🤫 _Who has done this? React below!_\n╚═══════════════════════╝`)
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌿  INSPIROBOT MEDITATION FLOW (Keith API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'inspirobot':
case 'meditate':
case 'innerpeace':
case 'mindful': {
  await X.sendMessage(m.chat, { react: { text: '🌿', key: m.key } })
  try {
    await reply('🌿 _Generating your mindfulness flow..._')
    const _ibRes = await fetch('https://apiskeith.top/quote/audio', { signal: AbortSignal.timeout(20000) })
    const _ibJson = await _ibRes.json()
    if (!_ibJson.status) throw new Error('Service unavailable')
    const _ibData = _ibJson.result
    // Extract all quote texts from the flow
    const _ibQuotes = (_ibData.data || []).filter(d => d.type === 'quote' && d.text).map(d => d.text)
    const _ibMp3   = _ibData.mp3 || null
    if (!_ibQuotes.length) throw new Error('No quotes returned')
    // Build the message
    let _ibMsg = `╔══〔 🌿 MEDITATION FLOW 〕══╗\n\n`
    _ibQuotes.forEach((q, i) => {
      _ibMsg += `❝ ${q} ❞\n\n`
    })
    _ibMsg += `╚═══════════════════════╝\n_🧘 Take a deep breath and let it go..._`
    await reply(_ibMsg)
    // Send the background meditation audio
    if (_ibMp3) {
      await X.sendMessage(m.chat, {
        audio: { url: _ibMp3 },
        mimetype: 'audio/mpeg',
        fileName: 'meditation_flow.mp3'
      }, { quoted: m })
    }
  } catch(e) {
    reply(`❌ Meditation flow failed: ${e.message}`)
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
// Unicode Font Commands
// All outputs are plain Unicode text — everyone sees them in any WhatsApp chat
// Owner uses the command, copies the output, pastes it anywhere
case 'setfont': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
// Activate persistent font mode — all your messages auto-convert until you run .fontoff
if (!isOwner) return reply(mess.OnlyOwner)
const _validFonts = ['bold','italic','bolditalic','mono','serif','serifbold','serifitalic','scriptfont','scriptbold','fraktur','frakturbold','doublestruck','smallcaps','bubble','bubblebold','square','squarebold','wide','upsidedown','strikethrough','underline','aesthetic','tiny','cursive','gothic','medieval','oldeng','inverted','mirror','currency','dotted','parenthesis','flags']
let _chosen = (text || '').toLowerCase().trim()
if (!_chosen) return reply(`╔════〔 🔤 SET FONT 〕════╗\n\n║ Usage: *${prefix}setfont [fontname]*\n║ Fonts: ${_validFonts.join(' · ')}\n\n║ _Auto-converts your messages until ${prefix}fontoff_\n╚═══════════════════════╝`)
if (!_validFonts.includes(_chosen)) return reply(`❌ Unknown font: *${_chosen}*\n\nValid options:\n${_validFonts.map(f=>'• '+f).join('\n')}`)
global.ownerFontMode = _chosen
try { require('./library/settings').saveSettings() } catch {}
reply(`✅ *Font mode set to: ${_chosen}*\n\n_Every message you send will now appear in ${_chosen} style._\n_Use ${prefix}fontoff to return to normal._`)
} break

case 'fontoff':
case 'resetfont': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
global.ownerFontMode = 'off'
try { require('./library/settings').saveSettings() } catch {}
reply(`✅ *Font mode disabled.*\n_Your messages will now send normally._`)
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✨  FANCY TEXT — 35 numbered styles + pick-by-reply
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'fancy':
case 'fancytext':
case 'stylish': {
    await X.sendMessage(m.chat, { react: { text: '✨', key: m.key } })
    // ── font table (from fontConverter.js) ──────────────────────────
    const _FNTS = {
        bold:            { l:'𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇', u:'𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭', d:'𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵', n:'Bold' },
        italic:          { l:'𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻', u:'𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡', d:'0123456789', n:'Italic' },
        bolditalic:      { l:'𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯', u:'𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕', d:'0123456789', n:'Bold Italic' },
        serif:           { l:'𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳', u:'𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙', d:'0123456789', n:'Serif Bold' },
        serifitalic:     { l:'𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧', u:'𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍', d:'0123456789', n:'Serif Italic' },
        serifbolditalic: { l:'𝒂𝒃𝒄𝒅𝒆𝒇𝒈𝒉𝒊𝒋𝒌𝒍𝒎𝒏𝒐𝒑𝒒𝒓𝒔𝒕𝒖𝒗𝒘𝒙𝒚𝒛', u:'𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁', d:'0123456789', n:'Serif Bold Italic' },
        script:          { l:'𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃', u:'𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩', d:'0123456789', n:'Script Bold' },
        scriptlight:     { l:'𝒶𝒷𝒸𝒹𝑒𝒻𝑔𝒽𝒾𝒿𝓀𝓁𝓂𝓃𝑜𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏', u:'𝒜𝐵𝒞𝒟𝐸𝐹𝒢𝐻𝐼𝒥𝒦𝐿𝑀𝒩𝒪𝒫𝒬𝑅𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵', d:'0123456789', n:'Script' },
        gothic:          { l:'𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷', u:'𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ', d:'0123456789', n:'Gothic' },
        gothicbold:      { l:'𝖆𝖇𝖈𝖉𝖊𝖋𝖌𝖍𝖎𝖏𝖐𝖑𝖒𝖓𝖔𝖕𝖖𝖗𝖘𝖙𝖚𝖛𝖜𝖝𝖞𝖟', u:'𝕬𝕭𝕮𝕯𝕰𝕱𝕲𝕳𝕴𝕵𝕶𝕷𝕸𝕹𝕺𝕻𝕼𝕽𝕾𝕿𝖀𝖁𝖂𝖃𝖄𝖅', d:'0123456789', n:'Gothic Bold' },
        mono:            { l:'𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣', u:'𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉', d:'𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿', n:'Monospace' },
        double:          { l:'𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫', u:'𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ', d:'𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡', n:'Double Struck' },
        circled:         { l:'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ', u:'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ', d:'⓪①②③④⑤⑥⑦⑧⑨', n:'Circled' },
        squared:         { l:'🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉', u:'🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉', d:'0123456789', n:'Squared' },
        fullwidth:       { l:'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ', u:'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ', d:'０１２３４５６７８９', n:'Full Width' },
        smallcaps:       { l:'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ', u:'ABCDEFGHIJKLMNOPQRSTUVWXYZ', d:'0123456789', n:'Small Caps' },
        superscript:     { l:'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖqʳˢᵗᵘᵛʷˣʸᶻ', u:'ᴬᴮᶜᴰᴱᶠᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾQᴿˢᵀᵁⱽᵂˣʸᶻ', d:'⁰¹²³⁴⁵⁶⁷⁸⁹', n:'Superscript' },
        inverted:        { l:'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz', u:'∀ꓭƆꓷƎꓞ⅁HIꓩꓘ⅂WNOꓒΌꓤSꓕꓵΛMX⅄Z', d:'0123456789', n:'Inverted/Flip' },
        bubbles:         { l:'🅐🅑🅒🅓🅔🅕🅖🅗🅘🅙🅚🅛🅜🅝🅞🅟🅠🅡🅢🅣🅤🅥🅦🅧🅨🅩', u:'🅐🅑🅒🅓🅔🅕🅖🅗🅘🅙🅚🅛🅜🅝🅞🅟🅠🅡🅢🅣🅤🅥🅦🅧🅨🅩', d:'0123456789', n:'Bubbles' },
        strikethrough:   { l:'a̶b̶c̶d̶e̶f̶g̶h̶i̶j̶k̶l̶m̶n̶o̶p̶q̶r̶s̶t̶u̶v̶w̶x̶y̶z̶', u:'A̶B̶C̶D̶E̶F̶G̶H̶I̶J̶K̶L̶M̶N̶O̶P̶Q̶R̶S̶T̶U̶V̶W̶X̶Y̶Z̶', d:'0123456789', n:'Strikethrough' },
        sansserif:       { l:'𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂𝗃𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓', u:'𝖠𝖡𝖢𝖣𝖤𝖥𝖦𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹', d:'𝟢𝟣𝟤𝟥𝟦𝟧𝟨𝟩𝟪𝟫', n:'Sans Serif' },
        parenthesized:   { l:'⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵', u:'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ', d:'⓪①②③④⑤⑥⑦⑧⑨', n:'Parenthesized' },
    }
    const _COMB = [
        { n:'Underline',        c:'\u0332' }, { n:'Double Underline', c:'\u0333' },
        { n:'Overline',         c:'\u0305' }, { n:'Wavy Below',       c:'\u0330' },
        { n:'Dotted Above',     c:'\u0307' }, { n:'Ring Above',       c:'\u030A' },
        { n:'Tilde Above',      c:'\u0303' }, { n:'Tilde Overlay',    c:'\u0334' },
        { n:'Acute Above',      c:'\u0301' }, { n:'Grave Above',      c:'\u0300' },
        { n:'Circumflex',       c:'\u0302' }, { n:'Diaeresis',        c:'\u0308' },
        { n:'Slash Through',    c:'\u0338' },
    ]
    const _NL  = 'abcdefghijklmnopqrstuvwxyz'
    const _NU  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const _ND  = '0123456789'
    const _conv = (ch, f) => {
        const li = _NL.indexOf(ch); if (li !== -1) return [...f.l][li] || ch
        const ui = _NU.indexOf(ch); if (ui !== -1) return [...f.u][ui] || ch
        const di = _ND.indexOf(ch); if (di !== -1) return [...f.d][di] || ch
        return ch
    }
    // ── pick mode: user replied to a fancy list with a number ────────
    const _fqText = m.quoted?.text || m.quoted?.body || m.quoted?.caption || ''
    const _fIsFancyList = _fqText.includes('✨ *Fancy Styles for:*')
    const _fIsNum = /^\d+$/.test(text?.trim() || '')
    if (_fIsFancyList && _fIsNum) {
        const _fPick = parseInt(text.trim())
        const _fLines = _fqText.split('\n')
        const _fTarget = _fLines.find(l => l.trimStart().startsWith(`*${_fPick}.*`))
        if (!_fTarget) {
            const _fMax = _fLines.filter(l => /^\*\d+\.\*/.test(l.trimStart())).length
            return reply(`❌ Style #${_fPick} not found. Pick 1–${_fMax}.`)
        }
        const _fClean = _fTarget.replace(/^\*\d+\.\*\s*/, '').replace(/\s{2}_\[.+?\]_$/, '').trim()
        return reply(_fClean)
    }
    // ── generate mode ────────────────────────────────────────────────
    let _fInput = text?.trim() || _fqText.trim()
    if (!_fInput) return reply(`╔═══〔 ✨ FANCY TEXT 〕════╗\n\n║ Usage: *${prefix}fancy [text]*\n║ Example: ${prefix}fancy Hello World\n\n║ _Or reply to any message with *${prefix}fancy*_\n║ _Then reply the result with *${prefix}fancy [number]*_\n║ _to send just that one style._\n╚═══════════════════════╝`)
    // build numbered list
    const _fLines2 = []
    let _fNum = 1
    for (const font of Object.values(_FNTS)) {
        const styled = [..._fInput].map(ch => _conv(ch, font)).join('')
        _fLines2.push(`*${_fNum}.* ${styled}  _[${font.n}]_`)
        _fNum++
    }
    for (const cs of _COMB) {
        const styled = [..._fInput].map(ch => /\s/.test(ch) ? ch : ch + cs.c).join('')
        _fLines2.push(`*${_fNum}.* ${styled}  _[${cs.n}]_`)
        _fNum++
    }
    // ── Keith API extra styles ────────────────────────────────────────
    try {
        const _kfData = await _keithFetch(`/fancytext?q=${encodeURIComponent(_fInput)}`)
        const _kfStyles = _kfData?.result || _kfData?.styles || (Array.isArray(_kfData) ? _kfData : null)
        if (Array.isArray(_kfStyles)) {
            for (const s of _kfStyles.slice(0, 15)) {
                const _kfText = typeof s === 'string' ? s : (s.text || s.style || s.value)
                const _kfName = typeof s === 'string' ? 'Keith Style' : (s.name || s.font || 'Keith Style')
                if (_kfText && _kfText !== _fInput) _fLines2.push(`*${_fNum}.* ${_kfText}  _[${_kfName}]_`); _fNum++
            }
        }
    } catch {} // Keith bonus styles optional
    const _fTotal = _fLines2.length
    const _fHeader = `╔═══〔 ✨ FANCY TEXT 〕════╗\n_${_fInput}_ · ${_fTotal} styles\n\n`
    const _fFooter = `\n╚═══════════════════════╝ _Reply with_ *${prefix}fancy [number]* _to send just that style_`
    const _fFull = _fHeader + _fLines2.join('\n') + _fFooter
    if (_fFull.length <= 60000) {
        await reply(_fFull)
    } else {
        let _fBuf = _fHeader
        for (const line of _fLines2) {
            if ((_fBuf + line + '\n').length > 60000) { await reply(_fBuf.trimEnd()); _fBuf = '' }
            _fBuf += line + '\n'
        }
        if (_fBuf.trim()) await reply(_fBuf.trimEnd() + _fFooter)
    }
} break

  case 'ascii':
  case 'asciiart': {
      await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
      const _asq = q?.trim() || text?.trim()
      if (!_asq) return reply(`╌══〔 🎨 ASCII ART 〕═════╌\n║ *Usage:* ${prefix}ascii [word]\n║ Example: ${prefix}ascii dragon\n╚═══════════════════════╝`)
      try {
          await reply(`🎨 _Generating ASCII art for: ${_asq}..._`)
          const _asd = await _keithFetch(`/tools/ascii?q=${encodeURIComponent(_asq)}`)
          const _asr = Array.isArray(_asd) ? _asd : (_asd?.arts || _asd?.result?.arts || (_asd?.art ? [_asd.art] : null))
          if (!Array.isArray(_asr) || !_asr.length) throw new Error('No art')
          const _asArt = _asr[Math.floor(Math.random() * Math.min(_asr.length, 3))]
          await reply(`🎨 *ASCII: ${_asq.toUpperCase()}*\n\`\`\`\n${_asArt}\n\`\`\``)
      } catch(e) { reply('❌ ASCII art generation failed. Try another word.') }
  } break

  case 'walink':
  case 'whatsapplink': {
      await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
      const _wlparts = text?.split(' ') || []
      const _wlnum = _wlparts[0]?.replace(/[^0-9]/g, '')
      const _wlmsg = _wlparts.slice(1).join(' ')
      if (!_wlnum) return reply(`╌══〔 🔗 WA LINK 〕═══════╌\n║ *Usage:* ${prefix}walink [number] [message]\n║ Example: ${prefix}walink 254712345678 Hello!\n╚═══════════════════════╝`)
      try {
          const _wld = await _keithFetch(`/tools/walink?q=${encodeURIComponent(_wlmsg || 'Hello')}&number=${_wlnum}`)
          const _wlurl = _wld?.shortUrl || _wld?.url || `https://wa.me/${_wlnum}${_wlmsg ? '?text=' + encodeURIComponent(_wlmsg) : ''}`
          await reply(`╌══〔 🔗 WHATSAPP LINK 〕══╌\n\n📞 *Number:* +${_wlnum}\n🔗 *Link:* ${_wlurl}\n╚═══════════════════════╝`)
      } catch(e) { reply('❌ Failed to create WhatsApp link.') }
  } break


case 'font':
case 'fonts': {
    await X.sendMessage(m.chat, { react: { text: '🔤', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n_Send text with the command to preview all fonts:_\n*${prefix}font [your text]*\n\n║ *Or use individual commands:*\n║ ${prefix}bold · ${prefix}italic · ${prefix}bolditalic\n║ ${prefix}mono · ${prefix}serif · ${prefix}serifbold\n║ ${prefix}scriptfont · ${prefix}scriptbold\n║ ${prefix}fraktur · ${prefix}frakturbold\n║ ${prefix}doublestruck · ${prefix}smallcaps\n║ ${prefix}bubble · ${prefix}bubblebold\n║ ${prefix}square · ${prefix}squarebold\n║ ${prefix}wide · ${prefix}upsidedown\n║ ${prefix}strikethrough · ${prefix}underline\n\n║ _Tip: ${prefix}setfont [name] for persistent style_\n╚═══════════════════════╝`)
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
let _fOut = `╔══〔 🔤 FONT PREVIEW 〕══╗\n\n`
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
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}bold [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const boldMap={a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭','0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵'}
reply([...ftIn].map(c=>boldMap[c]||c).join(''))
} break

case 'italic': {
    await X.sendMessage(m.chat, { react: { text: '𝐼', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}italic [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const italicMap={a:'𝘢',b:'𝘣',c:'𝘤',d:'𝘥',e:'𝘦',f:'𝘧',g:'𝘨',h:'𝘩',i:'𝘪',j:'𝘫',k:'𝘬',l:'𝘭',m:'𝘮',n:'𝘯',o:'𝘰',p:'𝘱',q:'𝘲',r:'𝘳',s:'𝘴',t:'𝘵',u:'𝘶',v:'𝘷',w:'𝘸',x:'𝘹',y:'𝘺',z:'𝘻',A:'𝘈',B:'𝘉',C:'𝘊',D:'𝘋',E:'𝘌',F:'𝘍',G:'𝘎',H:'𝘏',I:'𝘐',J:'𝘑',K:'𝘒',L:'𝘓',M:'𝘔',N:'𝘕',O:'𝘖',P:'𝘗',Q:'𝘘',R:'𝘙',S:'𝘚',T:'𝘛',U:'𝘜',V:'𝘝',W:'𝘞',X:'𝘟',Y:'𝘠',Z:'𝘡'}
reply([...ftIn].map(c=>italicMap[c]||c).join(''))
} break

case 'bolditalic': {
    await X.sendMessage(m.chat, { react: { text: '𝑩', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}bolditalic [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const biMap={a:'𝙖',b:'𝙗',c:'𝙘',d:'𝙙',e:'𝙚',f:'𝙛',g:'𝙜',h:'𝙝',i:'𝙞',j:'𝙟',k:'𝙠',l:'𝙡',m:'𝙢',n:'𝙣',o:'𝙤',p:'𝙥',q:'𝙦',r:'𝙧',s:'𝙨',t:'𝙩',u:'𝙪',v:'𝙫',w:'𝙬',x:'𝙭',y:'𝙮',z:'𝙯',A:'𝘼',B:'𝘽',C:'𝘾',D:'𝘿',E:'𝙀',F:'𝙁',G:'𝙂',H:'𝙃',I:'𝙄',J:'𝙅',K:'𝙆',L:'𝙇',M:'𝙈',N:'𝙉',O:'𝙊',P:'𝙋',Q:'𝙌',R:'𝙍',S:'𝙎',T:'𝙏',U:'𝙐',V:'𝙑',W:'𝙒',X:'𝙓',Y:'𝙔',Z:'𝙕'}
reply([...ftIn].map(c=>biMap[c]||c).join(''))
} break

case 'mono': {
    await X.sendMessage(m.chat, { react: { text: '𝙼', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}mono [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const monoMap={a:'𝚊',b:'𝚋',c:'𝚌',d:'𝚍',e:'𝚎',f:'𝚏',g:'𝚐',h:'𝚑',i:'𝚒',j:'𝚓',k:'𝚔',l:'𝚕',m:'𝚖',n:'𝚗',o:'𝚘',p:'𝚙',q:'𝚚',r:'𝚛',s:'𝚜',t:'𝚝',u:'𝚞',v:'𝚟',w:'𝚠',x:'𝚡',y:'𝚢',z:'𝚣',A:'𝙰',B:'𝙱',C:'𝙲',D:'𝙳',E:'𝙴',F:'𝙵',G:'𝙶',H:'𝙷',I:'𝙸',J:'𝙹',K:'𝙺',L:'𝙻',M:'𝙼',N:'𝙽',O:'𝙾',P:'𝙿',Q:'𝚀',R:'𝚁',S:'𝚂',T:'𝚃',U:'𝚄',V:'𝚅',W:'𝚆',X:'𝚇',Y:'𝚈',Z:'𝚉','0':'𝟶','1':'𝟷','2':'𝟸','3':'𝟹','4':'𝟺','5':'𝟻','6':'𝟼','7':'𝟽','8':'𝟾','9':'𝟿'}
reply([...ftIn].map(c=>monoMap[c]||c).join(''))
} break

case 'serif': {
    await X.sendMessage(m.chat, { react: { text: '𝐒', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}serif [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const serifMap={a:'𝐚',b:'𝐛',c:'𝐜',d:'𝐝',e:'𝐞',f:'𝐟',g:'𝐠',h:'𝐡',i:'𝐢',j:'𝐣',k:'𝐤',l:'𝐥',m:'𝐦',n:'𝐧',o:'𝐨',p:'𝐩',q:'𝐪',r:'𝐫',s:'𝐬',t:'𝐭',u:'𝐮',v:'𝐯',w:'𝐰',x:'𝐱',y:'𝐲',z:'𝐳',A:'𝐀',B:'𝐁',C:'𝐂',D:'𝐃',E:'𝐄',F:'𝐅',G:'𝐆',H:'𝐇',I:'𝐈',J:'𝐉',K:'𝐊',L:'𝐋',M:'𝐌',N:'𝐍',O:'𝐎',P:'𝐏',Q:'𝐐',R:'𝐑',S:'𝐒',T:'𝐓',U:'𝐔',V:'𝐕',W:'𝐖',X:'𝐗',Y:'𝐘',Z:'𝐙','0':'𝟎','1':'𝟏','2':'𝟐','3':'𝟑','4':'𝟒','5':'𝟓','6':'𝟔','7':'𝟕','8':'𝟖','9':'𝟗'}
reply([...ftIn].map(c=>serifMap[c]||c).join(''))
} break

case 'serifbold': {
    await X.sendMessage(m.chat, { react: { text: '𝐒', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}serifbold [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const sbMap={a:'𝐚',b:'𝐛',c:'𝐜',d:'𝐝',e:'𝐞',f:'𝐟',g:'𝐠',h:'𝐡',i:'𝐢',j:'𝐣',k:'𝐤',l:'𝐥',m:'𝐦',n:'𝐧',o:'𝐨',p:'𝐩',q:'𝐪',r:'𝐫',s:'𝐬',t:'𝐭',u:'𝐮',v:'𝐯',w:'𝐰',x:'𝐱',y:'𝐲',z:'𝐳',A:'𝐀',B:'𝐁',C:'𝐂',D:'𝐃',E:'𝐄',F:'𝐅',G:'𝐆',H:'𝐇',I:'𝐈',J:'𝐉',K:'𝐊',L:'𝐋',M:'𝐌',N:'𝐍',O:'𝐎',P:'𝐏',Q:'𝐐',R:'𝐑',S:'𝐒',T:'𝐓',U:'𝐔',V:'𝐕',W:'𝐖',X:'𝐗',Y:'𝐘',Z:'𝐙'}
reply([...ftIn].map(c=>sbMap[c]||c).join(''))
} break

case 'serifitalic': {
    await X.sendMessage(m.chat, { react: { text: '𝑆', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}serifitalic [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const siMap={a:'𝑎',b:'𝑏',c:'𝑐',d:'𝑑',e:'𝑒',f:'𝑓',g:'𝑔',h:'ℎ',i:'𝑖',j:'𝑗',k:'𝑘',l:'𝑙',m:'𝑚',n:'𝑛',o:'𝑜',p:'𝑝',q:'𝑞',r:'𝑟',s:'𝑠',t:'𝑡',u:'𝑢',v:'𝑣',w:'𝑤',x:'𝑥',y:'𝑦',z:'𝑧',A:'𝐴',B:'𝐵',C:'𝐶',D:'𝐷',E:'𝐸',F:'𝐹',G:'𝐺',H:'𝐻',I:'𝐼',J:'𝐽',K:'𝐾',L:'𝐿',M:'𝑀',N:'𝑁',O:'𝑂',P:'𝑃',Q:'𝑄',R:'𝑅',S:'𝑆',T:'𝑇',U:'𝑈',V:'𝑉',W:'𝑊',X:'𝑋',Y:'𝑌',Z:'𝑍'}
reply([...ftIn].map(c=>siMap[c]||c).join(''))
} break

case 'scriptfont': {
    await X.sendMessage(m.chat, { react: { text: '𝒮', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}scriptfont [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const scriptMap={a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵'}
reply([...ftIn].map(c=>scriptMap[c]||c).join(''))
} break

case 'scriptbold': {
    await X.sendMessage(m.chat, { react: { text: '𝓢', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}scriptbold [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const scbMap={a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'}
reply([...ftIn].map(c=>scbMap[c]||c).join(''))
} break

case 'fraktur': {
    await X.sendMessage(m.chat, { react: { text: '𝔉', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}fraktur [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const frakMap={a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'}
reply([...ftIn].map(c=>frakMap[c]||c).join(''))
} break

case 'frakturbold': {
    await X.sendMessage(m.chat, { react: { text: '𝕱', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}frakturbold [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const fbMap={a:'𝖆',b:'𝖇',c:'𝖈',d:'𝖉',e:'𝖊',f:'𝖋',g:'𝖌',h:'𝖍',i:'𝖎',j:'𝖏',k:'𝖐',l:'𝖑',m:'𝖒',n:'𝖓',o:'𝖔',p:'𝖕',q:'𝖖',r:'𝖗',s:'𝖘',t:'𝖙',u:'𝖚',v:'𝖛',w:'𝖜',x:'𝖝',y:'𝖞',z:'𝖟',A:'𝕬',B:'𝕭',C:'𝕮',D:'𝕯',E:'𝕰',F:'𝕱',G:'𝕲',H:'𝕳',I:'𝕴',J:'𝕵',K:'𝕶',L:'𝕷',M:'𝕸',N:'𝕹',O:'𝕺',P:'𝕻',Q:'𝕼',R:'𝕽',S:'𝕾',T:'𝕿',U:'𝖀',V:'𝖁',W:'𝖂',X:'𝖃',Y:'𝖄',Z:'𝖅'}
reply([...ftIn].map(c=>fbMap[c]||c).join(''))
} break

case 'doublestruck': {
    await X.sendMessage(m.chat, { react: { text: '𝔻', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}doublestruck [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const dsMap={a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫',A:'𝔸',B:'𝔹',C:'ℂ',D:'𝔻',E:'𝔼',F:'𝔽',G:'𝔾',H:'ℍ',I:'𝕀',J:'𝕁',K:'𝕂',L:'𝕃',M:'𝕄',N:'ℕ',O:'𝕆',P:'ℙ',Q:'ℚ',R:'ℝ',S:'𝕊',T:'𝕋',U:'𝕌',V:'𝕍',W:'𝕎',X:'𝕏',Y:'𝕐',Z:'ℤ','0':'𝟘','1':'𝟙','2':'𝟚','3':'𝟛','4':'𝟜','5':'𝟝','6':'𝟞','7':'𝟟','8':'𝟠','9':'𝟡'}
reply([...ftIn].map(c=>dsMap[c]||c).join(''))
} break

case 'smallcaps': {
    await X.sendMessage(m.chat, { react: { text: 'ꜱ', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}smallcaps [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const scMap={a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'Q',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',A:'ᴀ',B:'ʙ',C:'ᴄ',D:'ᴅ',E:'ᴇ',F:'ꜰ',G:'ɢ',H:'ʜ',I:'ɪ',J:'ᴊ',K:'ᴋ',L:'ʟ',M:'ᴍ',N:'ɴ',O:'ᴏ',P:'ᴘ',Q:'Q',R:'ʀ',S:'ꜱ',T:'ᴛ',U:'ᴜ',V:'ᴠ',W:'ᴡ',X:'x',Y:'ʏ',Z:'ᴢ'}
reply([...ftIn].map(c=>scMap[c]||c).join(''))
} break

case 'bubble': {
    await X.sendMessage(m.chat, { react: { text: '🔵', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}bubble [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const bubMap={a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ','0':'⓪','1':'①','2':'②','3':'③','4':'④','5':'⑤','6':'⑥','7':'⑦','8':'⑧','9':'⑨'}
reply([...ftIn].map(c=>bubMap[c]||c).join(''))
} break

case 'bubblebold': {
    await X.sendMessage(m.chat, { react: { text: '🟦', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}bubblebold [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const bbbMap={a:'🅐',b:'🅑',c:'🅒',d:'🅓',e:'🅔',f:'🅕',g:'🅖',h:'🅗',i:'🅘',j:'🅙',k:'🅚',l:'🅛',m:'🅜',n:'🅝',o:'🅞',p:'🅟',q:'🅠',r:'🅡',s:'🅢',t:'🅣',u:'🅤',v:'🅥',w:'🅦',x:'🅧',y:'🅨',z:'🅩',A:'🅐',B:'🅑',C:'🅒',D:'🅓',E:'🅔',F:'🅕',G:'🅖',H:'🅗',I:'🅘',J:'🅙',K:'🅚',L:'🅛',M:'🅜',N:'🅝',O:'🅞',P:'🅟',Q:'🅠',R:'🅡',S:'🅢',T:'🅣',U:'🅤',V:'🅥',W:'🅦',X:'🅧',Y:'🅨',Z:'🅩'}
reply([...ftIn].map(c=>bbbMap[c]||c).join(''))
} break

case 'square': {
    await X.sendMessage(m.chat, { react: { text: '🟥', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}square [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const sqMap={a:'🄰',b:'🄱',c:'🄲',d:'🄳',e:'🄴',f:'🄵',g:'🄶',h:'🄷',i:'🄸',j:'🄹',k:'🄺',l:'🄻',m:'🄼',n:'🄽',o:'🄾',p:'🄿',q:'🅀',r:'🅁',s:'🅂',t:'🅃',u:'🅄',v:'🅅',w:'🅆',x:'🅇',y:'🅈',z:'🅉',A:'🄰',B:'🄱',C:'🄲',D:'🄳',E:'🄴',F:'🄵',G:'🄶',H:'🄷',I:'🄸',J:'🄹',K:'🄺',L:'🄻',M:'🄼',N:'🄽',O:'🄾',P:'🄿',Q:'🅀',R:'🅁',S:'🅂',T:'🅃',U:'🅄',V:'🅅',W:'🅆',X:'🅇',Y:'🅈',Z:'🅉'}
reply([...ftIn].map(c=>sqMap[c]||c).join(''))
} break

case 'squarebold': {
    await X.sendMessage(m.chat, { react: { text: '🟥', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}squarebold [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const sqbMap={a:'🅰',b:'🅱',c:'🅲',d:'🅳',e:'🅴',f:'🅵',g:'🅶',h:'🅷',i:'🅸',j:'🅹',k:'🅺',l:'🅻',m:'🅼',n:'🅽',o:'🅾',p:'🅿',q:'🆀',r:'🆁',s:'🆂',t:'🆃',u:'🆄',v:'🆅',w:'🆆',x:'🆇',y:'🆈',z:'🆉',A:'🅰',B:'🅱',C:'🅲',D:'🅳',E:'🅴',F:'🅵',G:'🅶',H:'🅷',I:'🅸',J:'🅹',K:'🅺',L:'🅻',M:'🅼',N:'🅽',O:'🅾',P:'🅿',Q:'🆀',R:'🆁',S:'🆂',T:'🆃',U:'🆄',V:'🆅',W:'🆆',X:'🆇',Y:'🆈',Z:'🆉'}
reply([...ftIn].map(c=>sqbMap[c]||c).join(''))
} break

case 'wide': {
    await X.sendMessage(m.chat, { react: { text: '🔡', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}wide [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
reply([...ftIn].map(c=>{let code=c.charCodeAt(0);return (code>=33&&code<=126)?String.fromCharCode(code+65248):c==' '?'　':c}).join(''))
} break

case 'upsidedown': {
    await X.sendMessage(m.chat, { react: { text: '🙃', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}upsidedown [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const udMap={a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',A:'∀',B:'𐐒',C:'Ɔ',D:'ᗡ',E:'Ǝ',F:'Ⅎ',G:'פ',H:'H',I:'I',J:'ſ',K:'ʞ',L:'˥',M:'W',N:'N',O:'O',P:'Ԁ',Q:'Q',R:'ɹ',S:'S',T:'┴',U:'∩',V:'Λ',W:'M',X:'X',Y:'⅄',Z:'Z','0':'0','1':'Ɩ','2':'ᄅ','3':'Ɛ','4':'ㄣ','5':'ϛ','6':'9','7':'L','8':'8','9':'6',',':'\'','\'':',','.':'˙','?':'¿','!':'¡','(':')',')':'(','[':']',']':'[','{':'}','}':'{','<':'>','>':'<','&':'⅋',_:'‾'}
reply([...ftIn].map(c=>udMap[c]||c).join('').split('').reverse().join(''))
} break

case 'strikethrough': {
    await X.sendMessage(m.chat, { react: { text: '~~', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}strikethrough [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
reply([...ftIn].map(c=>c+'\u0336').join(''))
} break

case 'underline': {
    await X.sendMessage(m.chat, { react: { text: '📏', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}underline [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
reply([...ftIn].map(c=>c+'\u0332').join(''))
} break

case 'superscript': {
    await X.sendMessage(m.chat, { react: { text: '⁰', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}superscript [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const sspMap={a:'ᵃ',b:'ᵇ',c:'ᶜ',d:'ᵈ',e:'ᵉ',f:'ᶠ',g:'ᵍ',h:'ʰ',i:'ⁱ',j:'ʲ',k:'ᵏ',l:'ˡ',m:'ᵐ',n:'ⁿ',o:'ᵒ',p:'ᵖ',q:'q',r:'ʳ',s:'ˢ',t:'ᵗ',u:'ᵘ',v:'ᵛ',w:'ʷ',x:'ˣ',y:'ʸ',z:'ᶻ',A:'ᴬ',B:'ᴮ',C:'ᶜ',D:'ᴰ',E:'ᴱ',F:'ᶠ',G:'ᴳ',H:'ᴴ',I:'ᴵ',J:'ᴶ',K:'ᴷ',L:'ᴸ',M:'ᴹ',N:'ᴺ',O:'ᴼ',P:'ᴾ',Q:'Q',R:'ᴿ',S:'ˢ',T:'ᵀ',U:'ᵁ',V:'ᵛ',W:'ᵂ',X:'ˣ',Y:'ʸ',Z:'ᶻ','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'}
reply([...ftIn].map(c=>sspMap[c]||c).join(''))
} break

case 'subscript': {
    await X.sendMessage(m.chat, { react: { text: '₀', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}subscript [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const subMap={a:'ₐ',b:'b',c:'c',d:'d',e:'ₑ',f:'f',g:'g',h:'ₕ',i:'ᵢ',j:'ⱼ',k:'ₖ',l:'ₗ',m:'ₘ',n:'ₙ',o:'ₒ',p:'ₚ',q:'q',r:'ᵣ',s:'ₛ',t:'ₜ',u:'ᵤ',v:'ᵥ',w:'w',x:'ₓ',y:'y',z:'z',A:'A',B:'B',C:'C',D:'D',E:'E',F:'F',G:'G',H:'H',I:'I',J:'J',K:'K',L:'L',M:'M',N:'N',O:'O',P:'P',Q:'Q',R:'R',S:'S',T:'T',U:'U',V:'V',W:'W',X:'X',Y:'Y',Z:'Z','0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'}
reply([...ftIn].map(c=>subMap[c]||c).join(''))
} break

case 'medieval': {
    await X.sendMessage(m.chat, { react: { text: '🏰', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}medieval [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const medMap={a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',A:'𝕬',B:'𝕭',C:'𝕮',D:'𝕯',E:'𝕰',F:'𝕱',G:'𝕲',H:'𝕳',I:'𝕴',J:'𝕵',K:'𝕶',L:'𝕷',M:'𝕸',N:'𝕹',O:'𝕺',P:'𝕻',Q:'𝕼',R:'𝕽',S:'𝕾',T:'𝕿',U:'𝖀',V:'𝖁',W:'𝖂',X:'𝖃',Y:'𝖄',Z:'𝖅'}
reply([...ftIn].map(c=>medMap[c]||c).join(''))
} break

case 'circled': {
    await X.sendMessage(m.chat, { react: { text: '⭕', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}circled [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const cirMap={a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ','0':'⓪','1':'①','2':'②','3':'③','4':'④','5':'⑤','6':'⑥','7':'⑦','8':'⑧','9':'⑨'}
reply([...ftIn].map(c=>cirMap[c]||c).join(''))
} break

case 'negative': {
    await X.sendMessage(m.chat, { react: { text: '🔲', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}negative [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const negMap={a:'🅐',b:'🅑',c:'🅒',d:'🅓',e:'🅔',f:'🅕',g:'🅖',h:'🅗',i:'🅘',j:'🅙',k:'🅚',l:'🅛',m:'🅜',n:'🅝',o:'🅞',p:'🅟',q:'🅠',r:'🅡',s:'🅢',t:'🅣',u:'🅤',v:'🅥',w:'🅦',x:'🅧',y:'🅨',z:'🅩',A:'🅐',B:'🅑',C:'🅒',D:'🅓',E:'🅔',F:'🅕',G:'🅖',H:'🅗',I:'🅘',J:'🅙',K:'🅚',L:'🅛',M:'🅜',N:'🅝',O:'🅞',P:'🅟',Q:'🅠',R:'🅡',S:'🅢',T:'🅣',U:'🅤',V:'🅥',W:'🅦',X:'🅧',Y:'🅨',Z:'🅩'}
reply([...ftIn].map(c=>negMap[c]||c).join(''))
} break

case 'parenthesized': {
    await X.sendMessage(m.chat, { react: { text: '〔〕', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}parenthesized [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const parMap={a:'⒜',b:'⒝',c:'⒞',d:'⒟',e:'⒠',f:'⒡',g:'⒢',h:'⒣',i:'⒤',j:'⒥',k:'⒦',l:'⒧',m:'⒨',n:'⒩',o:'⒪',p:'⒫',q:'⒬',r:'⒭',s:'⒮',t:'⒯',u:'⒰',v:'⒱',w:'⒲',x:'⒳',y:'⒴',z:'⒵',A:'⒜',B:'⒝',C:'⒞',D:'⒟',E:'⒠',F:'⒡',G:'⒢',H:'⒣',I:'⒤',J:'⒥',K:'⒦',L:'⒧',M:'⒨',N:'⒩',O:'⒪',P:'⒫',Q:'⒬',R:'⒭',S:'⒮',T:'⒯',U:'⒰',V:'⒱',W:'⒲',X:'⒳',Y:'⒴',Z:'⒵'}
reply([...ftIn].map(c=>parMap[c]||c).join(''))
} break

case 'gothic': {
    await X.sendMessage(m.chat, { react: { text: '🦇', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}gothic [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const gotMap={a:'𝖆',b:'𝖇',c:'𝖈',d:'𝖉',e:'𝖊',f:'𝖋',g:'𝖌',h:'𝖍',i:'𝖎',j:'𝖏',k:'𝖐',l:'𝖑',m:'𝖒',n:'𝖓',o:'𝖔',p:'𝖕',q:'𝖖',r:'𝖗',s:'𝖘',t:'𝖙',u:'𝖚',v:'𝖛',w:'𝖜',x:'𝖝',y:'𝖞',z:'𝖟',A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'}
reply([...ftIn].map(c=>gotMap[c]||c).join(''))
} break

case 'cursive': {
    await X.sendMessage(m.chat, { react: { text: '✒️', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}cursive [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const crvMap={a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'}
reply([...ftIn].map(c=>crvMap[c]||c).join(''))
} break

case 'aesthetic': {
    await X.sendMessage(m.chat, { react: { text: '✨', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}aesthetic [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const aesMap={a:'ａ',b:'ｂ',c:'ｃ',d:'ｄ',e:'ｅ',f:'ｆ',g:'ｇ',h:'ｈ',i:'ｉ',j:'ｊ',k:'ｋ',l:'ｌ',m:'ｍ',n:'ｎ',o:'ｏ',p:'ｐ',q:'ｑ',r:'ｒ',s:'ｓ',t:'ｔ',u:'ｕ',v:'ｖ',w:'ｗ',x:'ｘ',y:'ｙ',z:'ｚ',A:'Ａ',B:'Ｂ',C:'Ｃ',D:'Ｄ',E:'Ｅ',F:'Ｆ',G:'Ｇ',H:'Ｈ',I:'Ｉ',J:'Ｊ',K:'Ｋ',L:'Ｌ',M:'Ｍ',N:'Ｎ',O:'Ｏ',P:'Ｐ',Q:'Ｑ',R:'Ｒ',S:'Ｓ',T:'Ｔ',U:'Ｕ',V:'Ｖ',W:'Ｗ',X:'Ｘ',Y:'Ｙ',Z:'Ｚ','0':'０','1':'１','2':'２','3':'３','4':'４','5':'５','6':'６','7':'７','8':'８','9':'９'}
reply([...ftIn].map(c=>aesMap[c]||c).join(''))
} break

case 'tiny': {
    await X.sendMessage(m.chat, { react: { text: '🔹', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}tiny [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const tnyMap={a:'ᵃ',b:'ᵇ',c:'ᶜ',d:'ᵈ',e:'ᵉ',f:'ᶠ',g:'ᵍ',h:'ʰ',i:'ⁱ',j:'ʲ',k:'ᵏ',l:'ˡ',m:'ᵐ',n:'ⁿ',o:'ᵒ',p:'ᵖ',q:'q',r:'ʳ',s:'ˢ',t:'ᵗ',u:'ᵘ',v:'ᵛ',w:'ʷ',x:'ˣ',y:'ʸ',z:'ᶻ',A:'ᴬ',B:'ᴮ',C:'ᶜ',D:'ᴰ',E:'ᴱ',F:'ᶠ',G:'ᴳ',H:'ᴴ',I:'ᴵ',J:'ᴶ',K:'ᴷ',L:'ᴸ',M:'ᴹ',N:'ᴺ',O:'ᴼ',P:'ᴾ',Q:'Q',R:'ᴿ',S:'ˢ',T:'ᵀ',U:'ᵁ',V:'ᵛ',W:'ᵂ',X:'ˣ',Y:'ʸ',Z:'ᶻ'}
reply([...ftIn].map(c=>tnyMap[c]||c).join(''))
} break

case 'inverted': {
    await X.sendMessage(m.chat, { react: { text: '🔄', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}inverted [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const invMap={a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',A:'∀',B:'q',C:'Ɔ',D:'p',E:'Ǝ',F:'Ⅎ',G:'פ',H:'H',I:'I',J:'ɾ',K:'ʞ',L:'˥',M:'W',N:'N',O:'O',P:'Ԁ',Q:'Q',R:'ɹ',S:'S',T:'┴',U:'∩',V:'Λ',W:'M',X:'X',Y:'ʎ',Z:'Z'}
reply([...ftIn].map(c=>invMap[c]||c).join('').split('').reverse().join(''))
} break

case 'mirror': {
    await X.sendMessage(m.chat, { react: { text: '🔁', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}mirror [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const mirMap={a:'ɒ',b:'d',c:'ɔ',d:'b',e:'ɘ',f:'ʇ',g:'ϱ',h:'ʜ',i:'i',j:'ᴉ',k:'ʞ',l:'l',m:'m',n:'n',o:'o',p:'q',q:'p',r:'ɿ',s:'ƨ',t:'ƚ',u:'u',v:'v',w:'w',x:'x',y:'y',z:'z',A:'A',B:'ᗺ',C:'Ɔ',D:'ᗡ',E:'Ǝ',F:'ꟻ',G:'Ꭾ',H:'H',I:'I',J:'Ꮈ',K:'ꓘ',L:'⅃',M:'M',N:'И',O:'O',P:'ꟼ',Q:'Ọ',R:'Я',S:'Ƨ',T:'T',U:'U',V:'V',W:'W',X:'X',Y:'Y',Z:'Z'}
reply([...ftIn].map(c=>mirMap[c]||c).join('').split('').reverse().join(''))
} break

case 'currency': {
    await X.sendMessage(m.chat, { react: { text: '💱', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}currency [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const curMap={a:'₳',b:'฿',c:'₵',d:'₫',e:'€',f:'₣',g:'₲',h:'♄',i:'ł',j:'ʝ',k:'₭',l:'₤',m:'₥',n:'₦',o:'ø',p:'₱',q:'q',r:'®',s:'$',t:'₮',u:'µ',v:'√',w:'₩',x:'×',y:'¥',z:'z',A:'₳',B:'฿',C:'₵',D:'₫',E:'€',F:'₣',G:'₲',H:'♄',I:'ł',J:'ʝ',K:'₭',L:'₤',M:'₥',N:'₦',O:'ø',P:'₱',Q:'Q',R:'®',S:'$',T:'₮',U:'µ',V:'√',W:'₩',X:'×',Y:'¥',Z:'Z'}
reply([...ftIn].map(c=>curMap[c]||c).join(''))
} break

case 'dotted': {
    await X.sendMessage(m.chat, { react: { text: '·', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}dotted [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const dotMap={a:'ȧ',b:'ḃ',c:'ċ',d:'ḋ',e:'ė',f:'ḟ',g:'ġ',h:'ḣ',i:'ı',j:'j',k:'k',l:'l',m:'ṁ',n:'ṅ',o:'ȯ',p:'ṗ',q:'q',r:'ṙ',s:'ṡ',t:'ṫ',u:'u',v:'v',w:'ẇ',x:'ẋ',y:'ẏ',z:'ż',A:'Ȧ',B:'Ḃ',C:'Ċ',D:'Ḋ',E:'Ė',F:'Ḟ',G:'Ġ',H:'Ḣ',I:'İ',J:'J',K:'K',L:'L',M:'Ṁ',N:'Ṅ',O:'Ȯ',P:'Ṗ',Q:'Q',R:'Ṙ',S:'Ṡ',T:'Ṫ',U:'U',V:'V',W:'Ẇ',X:'Ẋ',Y:'Ẏ',Z:'Ż'}
reply([...ftIn].map(c=>dotMap[c]||c).join(''))
} break

case 'oldeng': {
    await X.sendMessage(m.chat, { react: { text: '📜', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}oldeng [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
const oengMap={a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏',A:'𝒜',B:'ℬ',C:'𝒞',D:'𝒟',E:'ℰ',F:'ℱ',G:'𝒢',H:'ℋ',I:'ℐ',J:'𝒥',K:'𝒦',L:'ℒ',M:'ℳ',N:'𝒩',O:'𝒪',P:'𝒫',Q:'𝒬',R:'ℛ',S:'𝒮',T:'𝒯',U:'𝒰',V:'𝒱',W:'𝒲',X:'𝒳',Y:'𝒴',Z:'𝒵'}
reply([...ftIn].map(c=>oengMap[c]||c).join(''))
} break

case 'allfonts': {
    await X.sendMessage(m.chat, { react: { text: '🔤', key: m.key } })
if (!isOwner) return reply(mess.OnlyOwner)
let ftIn = text || (m.quoted && (m.quoted.text || m.quoted.body || m.quoted.caption || '').trim()) || ''
if (!ftIn) return reply(`╔══〔 🔤 FONT CONVERTER 〕══╗\n\n║ Usage: *${prefix}allfonts [text]*\n║ Or reply to any message with the command\n╚═══════════════════════╝`)
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
let out = `╔══〔 🔤 ALL FONTS — ${ftIn} 〕══╗\n\n`
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
// GitHub Commands
case 'git':
case 'github': {
    await X.sendMessage(m.chat, { react: { text: '🐙', key: m.key } })
if (!text) return reply(`╔══〔 🐙 GITHUB PROFILE 〕══╗\n\n║ Usage: *${prefix}github [username]*\n║ Example: ${prefix}github torvalds\n╚═══════════════════════╝`)
try {
let res = await fetch(`https://api.github.com/users/${encodeURIComponent(text)}`)
let data = await res.json()
if (data.message) return reply('User not found.')
let info = `*GitHub Profile:*\n\n👤 Name: ${data.name || data.login}\n📝 Bio: ${data.bio || 'N/A'}\n📍 Location: ${data.location || 'N/A'}\n🏢 Company: ${data.company || 'N/A'}\n📦 Repos: ${data.public_repos}\n👥 Followers: ${data.followers}\n👤 Following: ${data.following}\n🔗 URL: ${data.html_url}\n📅 Joined: ${new Date(data.created_at).toLocaleDateString()}`
if (data.avatar_url) {
await X.sendMessage(m.chat, { image: { url: data.avatar_url }, caption: info }, { quoted: m })
} else reply(info)
} catch(e) { reply('❌ Error: ' + e.message) }
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
        `╔══〔 ❌ REPO NOT FOUND 〕══╗\n\n║ Could not find: *${repoPath}*\n║ Try: *.repo owner/reponame*\n\n║ 📦 *Bot Repo:* github.com/TOOSII102/TOOSII-XD-ULTRA\n║ ⭐ *Star* & 🍴 *Fork*: ${global.repoUrl}/fork\n\n╚═══════════════════════╝`
    )
}
const repoInfo =
`╔══〔 📦 REPOSITORY INFO 〕══╗
║ 🏷️  *${data.full_name}*
║ 📝 _${(data.description || 'No description').slice(0,80)}_
║
║ ⭐ *Stars* : ${data.stargazers_count}
║ 🍴 *Forks* : ${data.forks_count}
║ 💻 *Language* : ${data.language || 'N/A'}
║ 🔄 *Updated* : ${new Date(data.updated_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}

║ 🔗 ${data.html_url}

║ 💛 *Enjoyed the bot?*
║ ⭐ Star & 🍴 Fork — every click counts!

║ 🔑 Session : https://toosiitechdevelopertools.zone.id/session

║ _⚡ Powered by Toosii Tech — wa.me/254748340864_
╚═══════════════════════╝`
reply(repoInfo)
} catch(e) { reply('❌ Error fetching repo: ' + e.message) }
} break

case 'sc':
case 'script':
case 'source': {
    await X.sendMessage(m.chat, { react: { text: '📜', key: m.key } })
let scText = `╔══〔 📂 SOURCE CODE 〕═══╗

║ 🤖 *${global.botname}*

║ 🔗 *GitHub*
║ github.com/TOOSII102/TOOSII-XD-ULTRA
║ 🍴 *Fork it*
║ github.com/TOOSII102/TOOSII-XD-ULTRA/fork
║ 👨‍💻 *Dev* : ${global.ownername}
║ 📞 *Contact* : ${global.ownerNumber}

║ _© ${global.ownername} — All Rights Reserved_
╚═══════════════════════╝`
reply(scText)
} break

case 'clone': {
    await X.sendMessage(m.chat, { react: { text: '📦', key: m.key } })
if (!text) return reply(`╔══〔 🐙 GITHUB CLONE 〕══╗\n\n║ Usage: *${prefix}clone [github url]*\n║ Example: ${prefix}clone https://github.com/user/repo\n╚═══════════════════════╝`)
try {
let match = text.match(/github\.com\/([^\/]+)\/([^\/\s]+)/)
if (!match) return reply('Invalid GitHub URL.')
let [, user, repo] = match
repo = repo.replace(/\.git$/, '')
let zipUrl = `https://api.github.com/repos/${user}/${repo}/zipball`
await X.sendMessage(m.chat, { document: { url: zipUrl }, mimetype: 'application/zip', fileName: `${repo}.zip` }, { quoted: m })
} catch(e) { reply('❌ Error: ' + e.message) }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌤️  WEATHER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'wttr':
case 'weather':
case 'clima': {
    await X.sendMessage(m.chat, { react: { text: '🌤️', key: m.key } })
    if (!text) return reply(`╔════〔 🌤️ WEATHER 〕════╗\n\n║ Usage: *${prefix}weather [city]*\n║ Example: ${prefix}weather Nairobi\n╚═══════════════════════╝`)
    try {
        let _wCity = text.trim()
        let _wMsg = null

        // ── Primary: Keith API ──────────────────────────────────────────────
        try {
            const _kw = await _keithFetch(`/weather?city=${encodeURIComponent(_wCity)}`)
            const _kwd = (_kw?.result || _kw) ?? {}
            const _wTemp = _kwd.temperature ?? _kwd.temp
            if (_wTemp !== undefined) {
                const _wCond = _kwd.condition || _kwd.description || _kwd.weather || '-'
                const _wFeel = _kwd.feels_like ?? _kwd.feelslike
                const _wHum  = _kwd.humidity
                const _wWnd  = _kwd.wind || _kwd.wind_speed
                const _wLoc  = (_kwd.location || _kwd.city || _wCity).toUpperCase()
                _wMsg = `╔══〔 🌤️ WEATHER 〕══╗\n║ 📍 *${_wLoc}*\n║ 🌡️ *Temp:* ${_wTemp}°C${_wFeel !== undefined ? ` (feels ${_wFeel}°C)` : ''}\n║ 🌤️ *Condition:* ${_wCond}\n${_wHum !== undefined ? `║ 💧 *Humidity:* ${_wHum}%\n` : ''}${_wWnd !== undefined ? `║ 💨 *Wind:* ${_wWnd} km/h\n` : ''}╚═══════════════════════╝`
            }
        } catch(_) {}

        // ── Fallback: wttr.in (free, no key) ───────────────────────────────
        if (!_wMsg) {
            const _wr = await safeJson(`https://wttr.in/${encodeURIComponent(_wCity)}?format=j1`)
            const _wc = _wr?.current_condition?.[0]
            if (_wc) {
                const _wa    = _wr?.nearest_area?.[0]
                const _wLoc2 = _wa?.areaName?.[0]?.value || _wCity
                const _wCtry = _wa?.country?.[0]?.value || ''
                _wMsg = `╔══〔 🌤️ WEATHER 〕══╗\n║ 📍 *${_wLoc2}${_wCtry ? ', ' + _wCtry : ''}*\n║ 🌡️ *Temp:* ${_wc.temp_C}°C (feels ${_wc.FeelsLikeC}°C)\n║ 🌤️ *Condition:* ${_wc.weatherDesc?.[0]?.value || '-'}\n║ 💧 *Humidity:* ${_wc.humidity}%\n║ 💨 *Wind:* ${_wc.windspeedKmph} km/h (${_wc.winddir16Point})\n║ 👁️ *Visibility:* ${_wc.visibility} km\n║ 🔵 *Pressure:* ${_wc.pressure} hPa\n║ ☀️ *UV Index:* ${_wc.uvIndex}\n╚═══════════════════════╝`
            }
        }

        if (!_wMsg) throw new Error('No weather data')
        await reply(_wMsg)
    } catch(e) { reply(`❌ Could not fetch weather for *${text}*. Try a different city name.`) }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔗  URL SHORTENER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'tinyurl':
case 'shorturl':
case 'shorten': {
    await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
    if (!text || !text.startsWith('http')) return reply(`╌════〔 🔗 URL SHORTENER 〕══╌\n\n║ *Usage:* ${prefix}tinyurl [url]\n║ Example: ${prefix}tinyurl https://google.com\n╚═══════════════════════╝`)
    try {
        let _suUrl = null
        // Keith first
        const _sukd = await _keithFetch(`/shortener/tinyurl?url=${encodeURIComponent(text)}`)
        if (_sukd?.shortened) _suUrl = _sukd.shortened
        // GiftedTech fallback
        if (!_suUrl) {
            let _sugr = await fetch(`${_GTAPI}/api/tools/tinyurl?apikey=${_giftedKey()}&url=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(12000) })
            let _sugd = await _sugr.json()
            if (_sugd.success && _sugd.result) _suUrl = _sugd.result
        }
        if (!_suUrl) throw new Error('Failed')
        await reply(`╌══〔 🔗 URL SHORTENER 〕══╌\n║ 📎 *Original* : ${text}\n║ ✅ *Short URL* : ${_suUrl}\n╚═══════════════════════╝`)
    } catch(e) { reply('❌ Failed to shorten URL. Make sure it starts with https://') }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💘  PICKUP LINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'pickupline': {
    await X.sendMessage(m.chat, { react: { text: '💘', key: m.key } })
    try {
        let _plTxt = null
        const _plkd = await _keithFetch('/fun/pickuplines')
        if (typeof _plkd === 'string') _plTxt = _plkd; else if (_plkd?.result) _plTxt = _plkd.result
        if (!_plTxt) {
            let _plr = await fetch(`${_GTAPI}/api/fun/pickupline?apikey=${_giftedKey()}`, { signal: AbortSignal.timeout(10000) })
            let _pld = await _plr.json()
            if (_pld.success && _pld.result) _plTxt = _pld.result
        }
        if (!_plTxt) throw new Error('No pickup line')
        await reply(`╌══〔 💘 PICKUP LINE 〕════╌\n║ _“${_plTxt}”_\n╚═══════════════════════╝`)
    } catch(e) { reply('❌ Could not fetch a pickup line right now. Try again!') }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📲  QR CODE GENERATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'qr':
case 'qrcode':
case 'makeqr':
case 'genqr': {
    await X.sendMessage(m.chat, { react: { text: '📲', key: m.key } })
    if (!text) return reply(`╔══〔 📲 QR CODE GENERATOR 〕══╗\n\n║ Usage: *${prefix}${command} [text or url]*\n║ Example: ${prefix}${command} https://google.com\n║ Example: ${prefix}${command} Hello World\n╚═══════════════════════╝`)
    try {
        let _qrRes = await fetch(`https://eliteprotech-apis.zone.id/qr?text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
        if (!_qrRes.ok) throw new Error('QR API error: ' + _qrRes.status)
        let _qrBuf = Buffer.from(await _qrRes.arrayBuffer())
        if (!_qrBuf || _qrBuf.length < 500) throw new Error('Empty QR response')
        await X.sendMessage(m.chat, {
            image: _qrBuf,
            caption: `╔════〔 📲 QR CODE 〕═════╗\n\n║ 📝 *Content* : ${text.length > 60 ? text.slice(0,60) + '...' : text}\n╚═══════════════════════╝`
        }, { quoted: m })
    } catch(e) {
        // Fallback: goqr.me API
        try {
            let _qrFallback = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(text)}`
            await X.sendMessage(m.chat, {
                image: { url: _qrFallback },
                caption: `╔════〔 📲 QR CODE 〕═════╗\n\n║ 📝 *Content* : ${text.length > 60 ? text.slice(0,60) + '...' : text}\n╚═══════════════════════╝`
            }, { quoted: m })
        } catch(e2) { reply(`❌ QR code generation failed.\n_${e2.message}_`) }
    }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📷  READ QR CODE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'readqr':
case 'scanqr':
case 'qrread': {
    await X.sendMessage(m.chat, { react: { text: '📷', key: m.key } })
    if (!m.quoted || !/image/.test(m.quoted.mimetype || m.quoted.msg?.mimetype || '')) {
        return reply(`╌══〔 📷 READ QR CODE 〕══╌\n║ Reply to a QR image with *${prefix}readqr*\n║ Works with any standard QR code\n╚═══════════════════════╝`)
    }
    try {
        await reply('📷 _Scanning QR code..._')
        let _buf = await m.quoted.download()
        if (!_buf || _buf.length < 100) throw new Error('Image download failed')
        let _tmp = require('path').join(__dirname, 'tmp', `qr_${Date.now()}.png`)
        fs.writeFileSync(_tmp, _buf)
        let _url = await CatBox(_tmp)
        try { fs.unlinkSync(_tmp) } catch {}
        if (!_url) throw new Error('Upload failed')
        let qrData = null
        // Source 1: api.qrserver.com (free, no key)
        try {
            const _qsR = await fetch(`https://api.qrserver.com/v1/read-qr-code/?fileurl=${encodeURIComponent(_url)}`, { signal: AbortSignal.timeout(15000) })
            const _qsD = await _qsR.json()
            if (_qsD?.[0]?.symbol?.[0]?.data) qrData = _qsD[0].symbol[0].data
        } catch {}
        // Source 2: GiftedTech
        if (!qrData) {
            const _gtR = await fetch(`${_GTAPI}/api/tools/readqr?apikey=${_giftedKey()}&url=${encodeURIComponent(_url)}`, { signal: AbortSignal.timeout(25000) })
            const _gtD = await _gtR.json()
            if (_gtD.success && _gtD.result) qrData = _gtD.result?.qrcode_data || _gtD.result
        }
        if (!qrData) throw new Error('Could not read QR')
        await reply(`╌══〔 📷 QR CODE RESULT 〕══╌\n║ ${qrData}\n╚═══════════════════════╝`)
    } catch(e) { reply('❌ Could not read the QR code. Make sure the image is clear and contains a valid QR code.') }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎨  AI IMAGE GENERATOR (DeepImg)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'deepimg':
case 'genimage':
case 'aiart':
case 'aiimage': {
    await X.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })
    if (!text) return reply(`╌══〔 🎨 AI IMAGE GEN 〕══╌\n║ *Usage:* ${prefix}imagine [describe image]\n║ Example: ${prefix}imagine a lion at sunset\n║\n║ 💡 Be descriptive for best results!\n╚═══════════════════════╝`)
    try {
        await reply('🎨 _Generating your image with AI... please wait ⏳_')
        let _aiImgUrl = null
        // Source 1: Pollinations.ai (free, no key)
        try {
            const _polUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&nologo=true&model=flux`
            const _polR = await fetch(_polUrl, { signal: AbortSignal.timeout(45000) })
            if (_polR.ok && _polR.headers.get('content-type')?.startsWith('image/')) {
                _aiImgUrl = _polUrl
            }
        } catch {}
        // Source 2: GiftedTech fluximg
        if (!_aiImgUrl) {
            try {
                const _gtR = await fetch(`${_GTAPI}/api/ai/fluximg?apikey=${_giftedKey()}&prompt=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(60000) })
                const _gtD = await _gtR.json()
                if (_gtD.success && (_gtD.result?.url || _gtD.result)) _aiImgUrl = _gtD.result?.url || _gtD.result
            } catch {}
        }
        // Source 3: MagicStudio (direct image)
        if (!_aiImgUrl) _aiImgUrl = `${_GTAPI}/api/ai/magicstudio?apikey=${_giftedKey()}&prompt=${encodeURIComponent(text)}`
        await safeSendMedia(m.chat, { image: { url: _aiImgUrl }, caption: `🎨 *AI Generated Image*\n📝 _${text}_` }, {}, { quoted: m })
    } catch(e) { reply('❌ Image generation failed. Try a shorter or different prompt.') }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎵  AI SONG GENERATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'songgenerator':
case 'makesong':
case 'aisong': {
    await X.sendMessage(m.chat, { react: { text: '🎵', key: m.key } })
    if (!text) return reply(`╔══〔 🎵 AI SONG GENERATOR 〕══╗\n\n║ Usage: *${prefix}songgenerator [describe your song]*\n║ Example: ${prefix}songgenerator Upbeat Afrobeats about success\n╚═══════════════════════╝`)
    try {
        await reply('🎵 _Composing your song with AI, please wait (this may take a while)..._')
        let r = await fetch(`${_GTAPI}/api/tools/songgenerator?apikey=${_giftedKey()}&prompt=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(120000) })
        let d = await r.json()
        if (!d.success || !d.result) throw new Error('Song generation failed')
        let res = d.result
        let audioUrl = typeof res === 'string' ? res : (res.audio_url || res.url || res.download_url)
        if (audioUrl) {
            await X.sendMessage(m.chat, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', fileName: 'ai_song.mp3', caption: `🎵 *AI Generated Song*\n📝 _${text}_` }, { quoted: m })
        } else {
            await reply(`╔══〔 🎵 AI SONG GENERATED 〕╗\n║ ${JSON.stringify(res, null, 2)}\n╚═══════════════════════╝`)
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
        let msg = `╔══〔 ⚽ LIVE FOOTBALL SCORES (${matches.length} matches) 〕══╗`
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
        msg += `\n╚═══════════════════════╝`
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
        let msg = `╔══〔 🔮 FOOTBALL PREDICTIONS (${preds.length}) 〕══╗`
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
        msg += `\n╚═══════════════════════╝\n\n⚠️ _Predictions are for entertainment only. Bet responsibly._`
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch predictions. Try again later.') }
} break

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📰  FOOTBALL NEWS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
case 'footnews':
case 'footballnews':
case 'sportnews': {
    await X.sendMessage(m.chat, { react: { text: '📰', key: m.key } })
    try {
        await reply('📰 _Fetching latest football news..._')
        let articles = await _getFootballNews()
        if (!articles?.length) return reply('📰 No football news available right now. Try again later.')
        let msg = `╔══〔 📰 FOOTBALL NEWS 〕══╗`
        for (let a of articles) {
            msg += `\n📌 *${a.title}*\n`
            if (a.summary) msg += `  _${a.summary}_\n`
            if (a.link || a.url) msg += `  🔗 ${a.link || a.url}\n`
        }
        msg += `\n╚═══════════════════════╝`
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
        let msg = `╔══〔 🏆 EPL STANDINGS ${new Date().getFullYear()} 〕══╗`
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
        let msg = `╔══〔 ⚽ EPL TOP SCORERS 〕══╗`
        for (let s of scorers) {
            let rank = s.rank || s.position || ''
            msg += `${rank}. *${s.player || s.name}* (${s.team || s.club || ''})\n`
            msg += `   🥅 Goals: *${s.goals}*`
            if (s.assists) msg += `  🎯 Assists: ${s.assists}`
            if (s.played) msg += `  📅 Played: ${s.played}`
            msg += '\n'
        }
        msg += `\n╚═══════════════════════╝`
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch EPL top scorers. Try again later.') }
} break

case 'eplmatches':
case 'eplfixtures':
case 'eplupcoming': {
    await X.sendMessage(m.chat, { react: { text: '📅', key: m.key } })
    try {
        await reply('📅 _Fetching upcoming EPL matches..._')
        let matches = await _getFixtures('epl', `${_GTAPI}/api/football/epl/upcoming?apikey=${_giftedKey()}`)
        if (!matches?.length) throw new Error('No data from any source')
        let msg = `╔══〔 📅 EPL UPCOMING FIXTURES 〕══╗`
        for (let _fm of matches) {
            msg += `\n📆 *${_fm.date || ''}* ${_fm.time ? '⏰ ' + _fm.time : ''}\n`
            msg += `  ⚽ *${_fm.homeTeam}* vs *${_fm.awayTeam}*\n`
            if (_fm.venue || _fm.stadium) msg += `  🏟️ ${_fm.venue || _fm.stadium}\n`
        }
        msg += `\n╚═══════════════════════╝`
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
        let msg = `╔══〔 🏆 LA LIGA STANDINGS ${new Date().getFullYear()} 〕══╗`
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
        let msg = `╔══〔 ⚽ LA LIGA TOP SCORERS 〕══╗`
        for (let s of scorers) {
            let rank = s.rank || s.position || ''
            msg += `${rank}. *${s.player || s.name}* (${s.team || s.club || ''})\n`
            msg += `   🥅 Goals: *${s.goals}*`
            if (s.assists) msg += `  🎯 Assists: ${s.assists}`
            if (s.played) msg += `  📅 Played: ${s.played}`
            msg += '\n'
        }
        msg += `\n╚═══════════════════════╝`
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch La Liga top scorers. Try again later.') }
} break

case 'laligamatches':
case 'laligafixtures':
case 'laligaupcoming': {
    await X.sendMessage(m.chat, { react: { text: '📅', key: m.key } })
    try {
        await reply('📅 _Fetching La Liga matches..._')
        let matches = await _getFixtures('laliga', `${_GTAPI}/api/football/laliga/upcoming?apikey=${_giftedKey()}`)
        if (!matches?.length) throw new Error('No data from any source')
        let msg = `╔══〔 📅 LA LIGA FIXTURES 〕══╗`
        for (let _fm of matches) {
            msg += `\n📆 *${_fm.date || ''}* ${_fm.time ? '⏰ ' + _fm.time : ''}\n`
            msg += `  ⚽ *${_fm.homeTeam}* vs *${_fm.awayTeam}*\n`
            if (_fm.venue || _fm.stadium) msg += `  🏟️ ${_fm.venue || _fm.stadium}\n`
            if (_fm.status && _fm.status !== 'Unknown') msg += `  ℹ️ Status: ${_fm.status}\n`
        }
        msg += `\n╚═══════════════════════╝`
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
          let msg = `╔══〔 🏆 UCL STANDINGS ${new Date().getFullYear()} 〕══╗`
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
          let msg = `╔══〔 🏆 BUNDESLIGA STANDINGS ${new Date().getFullYear()} 〕══╗`
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
          let msg = `╔══〔 ⚽ BUNDESLIGA TOP SCORERS 〕══╗`
          for (let s of scorers) {
              let rank = s.rank || s.position || ''
              msg += `${rank}. *${s.player || s.name}* (${s.team || s.club || ''})\n`
              msg += `   🥅 Goals: *${s.goals}*`
              if (s.assists) msg += `  🎯 Assists: ${s.assists}`
              if (s.penalties && s.penalties !== 'N/A') msg += `  🎯 Pens: ${s.penalties}`
              if (s.played) msg += `  📅 Played: ${s.played}`
              msg += '\n'
          }
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply('❌ Could not fetch Bundesliga top scorers. Try again later.') }
  } break

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🇮🇹  SERIE A STANDINGS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  case 'seriea':
  case 'serieastandings': {
      await X.sendMessage(m.chat, { react: { text: '🇮🇹', key: m.key } })
      try {
        await reply('🏆 _Fetching Serie A standings..._')
        let teams = await _getStandings('seriea', 'seriea')
        if (!teams?.length) throw new Error('No data from any source')
          let msg = `╔══〔 🏆 SERIE A STANDINGS ${new Date().getFullYear()} 〕══╗`
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
          let msg = `╔══〔 ⚽ SERIE A TOP SCORERS 〕══╗`
          for (let s of scorers) {
              msg += `${s.rank}. *${s.player}* (${s.team})\n`
              msg += `   🥅 Goals: *${s.goals}*`
              if (s.assists) msg += `  🎯 Assists: ${s.assists}`
              if (s.penalties && s.penalties !== 'N/A') msg += `  🎽 Pens: ${s.penalties}`
              msg += '\n'
          }
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply('❌ Could not fetch Serie A top scorers. Try again later.') }
  } break
  

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🇫🇷  LIGUE 1 — STANDINGS · SCORERS · MATCHES (Keith API)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'ligue1':
    case 'ligue1standings': {
        await X.sendMessage(m.chat, { react: { text: '🇫🇷', key: m.key } })
        try {
            await reply('🏆 _Fetching Ligue 1 standings..._')
            let teams = await _getStandings('ligue1', 'ligue1')
            if (!teams?.length) throw new Error('No data')
            let msg = `╔══〔 🏆 LIGUE 1 STANDINGS ${new Date().getFullYear()} 〕══╗`
            msg += `${'#'.padEnd(3)} ${'Team'.padEnd(22)} ${'P'.padEnd(3)} ${'W'.padEnd(3)} ${'D'.padEnd(3)} ${'L'.padEnd(3)} ${'GD'.padEnd(5)} Pts\n`
            msg += `${'─'.repeat(50)}\n`
            for (let t of teams) {
                let pos = String(t.position).padEnd(3), team = (t.team||'').substring(0,20).padEnd(22)
                let p = String(t.played||0).padEnd(3), w = String(t.won||0).padEnd(3), dr = String(t.draw||0).padEnd(3)
                let l = String(t.lost||0).padEnd(3), gd = String(t.goalDifference||0).padEnd(5), pts = String(t.points||0)
                msg += `${pos}${team}${p}${w}${dr}${l}${gd}${pts}\n`
            }
            await reply('```\n' + msg + '```')
        } catch(e) { reply('❌ Could not fetch Ligue 1 standings. Try again later.') }
    } break

    case 'ligue1scorers':
    case 'ligue1topscorers': {
        await X.sendMessage(m.chat, { react: { text: '⚽', key: m.key } })
        try {
            await reply('⚽ _Fetching Ligue 1 top scorers..._')
            let scorers = await _getScorers('ligue1', 'ligue1')
            if (!scorers?.length) throw new Error('No data')
            let msg = `╔══〔 ⚽ LIGUE 1 TOP SCORERS 〕══╗`
            for (let s of scorers) {
                let rank = s.rank || s.position || ''
                msg += `${rank}. *${s.player||s.name}* (${s.team||s.club||''})\n`
                msg += `   🥅 Goals: *${s.goals}*`
                if (s.assists) msg += `  🎯 Assists: ${s.assists}`
                if (s.penalties && s.penalties !== 'N/A') msg += `  🎽 Pens: ${s.penalties}`
                msg += '\n'
            }
            msg += `\n╚═══════════════════════╝`
            await reply(msg)
        } catch(e) { reply('❌ Could not fetch Ligue 1 top scorers. Try again later.') }
    } break

    case 'ligue1matches':
    case 'ligue1fixtures': {
        await X.sendMessage(m.chat, { react: { text: '📅', key: m.key } })
        try {
            await reply('📅 _Fetching Ligue 1 matches..._')
            let matches = await _getFixtures('ligue1', `${_GTAPI}/api/football/ligue1/upcoming?apikey=${_giftedKey()}`)
            if (!matches?.length) throw new Error('No data')
            let msg = `╔══〔 📅 LIGUE 1 FIXTURES 〕══╗`
            for (let _fm of matches) {
                msg += `\n📆 *${_fm.date||_fm.matchday||''}*\n`
                msg += `  ⚽ *${_fm.homeTeam}* vs *${_fm.awayTeam}*`
                if (_fm.status && _fm.status !== '') msg += ` [${_fm.status}]`
                msg += '\n'
            }
            msg += `\n╚═══════════════════════╝`
            await reply(msg)
        } catch(e) { reply('❌ Could not fetch Ligue 1 fixtures. Try again later.') }
    } break

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🏆  UEFA EUROS — STANDINGS · SCORERS (Keith API)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'euros':
    case 'eurosstandings':
    case 'eurostandings': {
        await X.sendMessage(m.chat, { react: { text: '🏆', key: m.key } })
        try {
            await reply('🏆 _Fetching Euros standings..._')
            let teams = await _getStandings('euros', 'euros')
            if (!teams?.length) throw new Error('No data')
            let msg = `╔══〔 🏆 UEFA EUROS STANDINGS 〕══╗`
            msg += `${'#'.padEnd(3)} ${'Team'.padEnd(22)} ${'P'.padEnd(3)} ${'W'.padEnd(3)} ${'D'.padEnd(3)} ${'L'.padEnd(3)} ${'GD'.padEnd(5)} Pts\n`
            msg += `${'─'.repeat(50)}\n`
            for (let t of teams) {
                let pos = String(t.position).padEnd(3), team = (t.team||'').substring(0,20).padEnd(22)
                let p = String(t.played||0).padEnd(3), w = String(t.won||0).padEnd(3), dr = String(t.draw||0).padEnd(3)
                let l = String(t.lost||0).padEnd(3), gd = String(t.goalDifference||0).padEnd(5), pts = String(t.points||0)
                msg += `${pos}${team}${p}${w}${dr}${l}${gd}${pts}\n`
            }
            await reply('```\n' + msg + '```')
        } catch(e) { reply('❌ Could not fetch Euros standings. Try again later.') }
    } break

    case 'eurosscorers':
    case 'eurotopscorers': {
        await X.sendMessage(m.chat, { react: { text: '⚽', key: m.key } })
        try {
            await reply('⚽ _Fetching Euros top scorers..._')
            let scorers = await _getScorers('euros', 'euros')
            if (!scorers?.length) throw new Error('No data')
            let msg = `╔══〔 ⚽ EUROS TOP SCORERS 〕══╗`
            for (let s of scorers) {
                let rank = s.rank || s.position || ''
                msg += `${rank}. *${s.player||s.name}* (${s.team||s.club||''})\n`
                msg += `   🥅 Goals: *${s.goals}*`
                if (s.assists) msg += `  🎯 Assists: ${s.assists}`
                msg += '\n'
            }
            msg += `\n╚═══════════════════════╝`
            await reply(msg)
        } catch(e) { reply('❌ Could not fetch Euros top scorers. Try again later.') }
    } break

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🌍  FIFA WORLD CUP — STANDINGS · SCORERS (Keith API)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'fifa':
    case 'fifastandings':
    case 'worldcupstandings': {
        await X.sendMessage(m.chat, { react: { text: '🌍', key: m.key } })
        try {
            await reply('🌍 _Fetching FIFA standings..._')
            let teams = await _getStandings('fifa', 'fifa')
            if (!teams?.length) throw new Error('No data')
            let msg = `╔══〔 🌍 FIFA STANDINGS 〕══╗`
            msg += `${'#'.padEnd(3)} ${'Team'.padEnd(22)} ${'P'.padEnd(3)} ${'W'.padEnd(3)} ${'D'.padEnd(3)} ${'L'.padEnd(3)} ${'GD'.padEnd(5)} Pts\n`
            msg += `${'─'.repeat(50)}\n`
            for (let t of teams) {
                let pos = String(t.position).padEnd(3), team = (t.team||'').substring(0,20).padEnd(22)
                let p = String(t.played||0).padEnd(3), w = String(t.won||0).padEnd(3), dr = String(t.draw||0).padEnd(3)
                let l = String(t.lost||0).padEnd(3), gd = String(t.goalDifference||0).padEnd(5), pts = String(t.points||0)
                msg += `${pos}${team}${p}${w}${dr}${l}${gd}${pts}\n`
            }
            await reply('```\n' + msg + '```')
        } catch(e) { reply('❌ Could not fetch FIFA standings. Try again later.') }
    } break

    case 'fifascorers':
    case 'fifatopscorers':
    case 'worldcupscorers': {
        await X.sendMessage(m.chat, { react: { text: '⚽', key: m.key } })
        try {
            await reply('⚽ _Fetching FIFA top scorers..._')
            let scorers = await _getScorers('fifa', 'fifa')
            if (!scorers?.length) throw new Error('No data')
            let msg = `╔══〔 ⚽ FIFA TOP SCORERS 〕══╗`
            for (let s of scorers) {
                let rank = s.rank || s.position || ''
                msg += `${rank}. *${s.player||s.name}* (${s.team||s.club||''})\n`
                msg += `   🥅 Goals: *${s.goals}*`
                if (s.assists) msg += `  🎯 Assists: ${s.assists}`
                msg += '\n'
            }
            msg += `\n╚═══════════════════════╝`
            await reply(msg)
        } catch(e) { reply('❌ Could not fetch FIFA top scorers. Try again later.') }
    } break

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🔍  PLAYER / TEAM / VENUE SEARCH + MATCH EVENTS (Keith API)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    case 'playersearch':
    case 'searchplayer': {
        await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
        const _psq = q?.trim()
        if (!_psq) { reply('⚠️ Usage: *.playersearch* [player name]\nExample: .playersearch Erling Haaland'); break }
        try {
            await reply(`🔍 _Searching for player: ${_psq}..._`)
            const _psd = await _keithFetch(`/sport/playersearch?q=${encodeURIComponent(_psq)}`)
            const _psr = Array.isArray(_psd) ? _psd : (_psd?.result || [])
            if (!_psr.length) { reply(`❌ No player found for "*${_psq}*"`); break }
            let msg = `╔══〔 🔍 PLAYER SEARCH: ${_psq.toUpperCase()} 〕══╗\n`
            for (let p of _psr.slice(0, 5)) {
                msg += `\n👤 *${p.name}*\n`
                if (p.team) msg += `  🏟️ Club: ${p.team}\n`
                if (p.nationality) msg += `  🌍 Nationality: ${p.nationality}\n`
                if (p.position) msg += `  ⚽ Position: ${p.position}\n`
                if (p.birthDate) msg += `  🎂 Born: ${p.birthDate}\n`
                if (p.status) msg += `  📋 Status: ${p.status}\n`
            }
            msg += `\n╚═══════════════════════╝`
            await reply(msg)
        } catch(e) { reply('❌ Player search failed. Try again later.') }
    } break

    case 'teamsearch':
    case 'searchteam': {
        await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
        const _tsq = q?.trim()
        if (!_tsq) { reply('⚠️ Usage: *.teamsearch* [team name]\nExample: .teamsearch Arsenal'); break }
        try {
            await reply(`🔍 _Searching for team: ${_tsq}..._`)
            const _tsd = await _keithFetch(`/sport/teamsearch?q=${encodeURIComponent(_tsq)}`)
            const _tsr = Array.isArray(_tsd) ? _tsd : (_tsd?.result || [])
            if (!_tsr.length) { reply(`❌ No team found for "*${_tsq}*"`); break }
            let msg = `╔══〔 🔍 TEAM SEARCH: ${_tsq.toUpperCase()} 〕══╗\n`
            for (let t of _tsr.slice(0, 3)) {
                msg += `\n🏆 *${t.name}*`
                if (t.shortName) msg += ` (${t.shortName})`
                msg += '\n'
                if (t.league) msg += `  🏟️ League: ${t.league}\n`
                if (t.country) msg += `  🌍 Country: ${t.country}\n`
                if (t.stadium) msg += `  🏟️ Stadium: ${t.stadium}\n`
                if (t.stadiumCapacity) msg += `  👥 Capacity: ${t.stadiumCapacity}\n`
                if (t.location) msg += `  📍 Location: ${t.location}\n`
            }
            msg += `\n╚═══════════════════════╝`
            await reply(msg)
        } catch(e) { reply('❌ Team search failed. Try again later.') }
    } break

    case 'venuesearch':
    case 'searchvenue':
    case 'stadiumsearch': {
        await X.sendMessage(m.chat, { react: { text: '🏟️', key: m.key } })
        const _vsq = q?.trim()
        if (!_vsq) { reply('⚠️ Usage: *.venuesearch* [stadium name]\nExample: .venuesearch Wembley'); break }
        try {
            await reply(`🏟️ _Searching for venue: ${_vsq}..._`)
            const _vsd = await _keithFetch(`/sport/venuesearch?q=${encodeURIComponent(_vsq)}`)
            const _vsr = Array.isArray(_vsd) ? _vsd : (_vsd?.result || [])
            if (!_vsr.length) { reply(`❌ No venue found for "*${_vsq}*"`); break }
            let msg = `╔══〔 🏟️ VENUE SEARCH: ${_vsq.toUpperCase()} 〕══╗\n`
            for (let v of _vsr.slice(0, 3)) {
                msg += `\n🏟️ *${v.name}*\n`
                if (v.sport) msg += `  ⚽ Sport: ${v.sport}\n`
                if (v.description) msg += `  📝 ${v.description.slice(0,200)}...\n`
            }
            msg += `\n╚═══════════════════════╝`
            await reply(msg)
        } catch(e) { reply('❌ Venue search failed. Try again later.') }
    } break

    case 'gameevents':
    case 'matchevents':
    case 'matchhistory': {
        await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
        const _geq = q?.trim()
        if (!_geq) { reply('⚠️ Usage: *.gameevents* [team1 vs team2]\nExample: .gameevents Arsenal vs Chelsea'); break }
        try {
            await reply(`📋 _Searching match events: ${_geq}..._`)
            const _ged = await _keithFetch(`/sport/gameevents?q=${encodeURIComponent(_geq)}`)
            const _ger = Array.isArray(_ged) ? _ged : (_ged?.result || [])
            if (!_ger.length) { reply(`❌ No match events found for "*${_geq}*"`); break }
            let msg = `╔══〔 📋 MATCH EVENTS: ${_geq.toUpperCase()} 〕══╗\n`
            for (let ev of _ger.slice(0, 5)) {
                msg += `\n⚽ *${ev.match||ev.alternateMatchName||''}*\n`
                if (ev.league?.name) msg += `  🏆 League: ${ev.league.name}\n`
                if (ev.season) msg += `  📅 Season: ${ev.season}\n`
                if (ev.dateTime?.date) msg += `  🗓️ Date: ${ev.dateTime.date} ${ev.dateTime.time||''}\n`
                if (ev.teams?.home && ev.teams?.away) {
                    msg += `  🔵 ${ev.teams.home.name} ${ev.teams.home.score ?? ''} – ${ev.teams.away.score ?? ''} ${ev.teams.away.name}\n`
                }
                if (ev.venue?.name) msg += `  🏟️ Venue: ${ev.venue.name}\n`
                if (ev.status) msg += `  📋 Status: ${ev.status}\n`
            }
            msg += `\n╚═══════════════════════╝`
            await reply(msg)
        } catch(e) { reply('❌ Match events search failed. Try again later.') }
    } break

  

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🏅  SPORTS — LIVE, ALL, CATEGORIES, STREAM  (xcasper /api/live)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: send long text in chunks so ALL matches always appear (WA limit ~65KB)
async function _sendAllChunked(chat, lines, chunkSize = 3500) {
    let buf = ''
    for (const line of lines) {
        if (buf.length + line.length > chunkSize) {
            await X.sendMessage(chat, { text: buf.trimEnd() })
            buf = ''
        }
        buf += line
    }
    if (buf.trim()) await X.sendMessage(chat, { text: buf.trimEnd() })
}
case 'sportscategories':
case 'sportcategories':
case 'sportcat': {
    await X.sendMessage(m.chat, { react: { text: '🏅', key: m.key } })
    try {
        let _r = await fetch('https://movieapi.xcasper.space/api/live', { signal: AbortSignal.timeout(15000) })
        let _d = await _r.json()
        if (!_d.success || !_d.data?.matchList) throw new Error('No data')
        let _all = _d.data.matchList
        let _catMap = {}
        for (let _ev of _all) {
            let _t = (_ev.type || 'other').toLowerCase()
            _catMap[_t] = (_catMap[_t] || 0) + 1
        }
        const _sportIcon = { football: '⚽', basketball: '🏀', tennis: '🎾', cricket: '🏏', baseball: '⚾', hockey: '🏒', rugby: '🏉', volleyball: '🏐', motorsports: '🏎️', boxing: '🥊', mma: '🥋', badminton: '🏸', tabletennis: '🏓', snooker: '🎱' }
        let _msg = `╔══〔 🏅 SPORTS CATEGORIES 〕══╗\n\n`
        for (let [_cat, _cnt] of Object.entries(_catMap).sort((a,b) => b[1]-a[1])) {
            _msg += `  ${_sportIcon[_cat] || '🏅'} *${_cat}* — ${_cnt} match${_cnt!==1?'es':''}\n`
        }
        _msg += `\n_Use ${prefix}livesports [sport] to see live events_\n_Use ${prefix}allsports [sport] to see all events_\n_Use ${prefix}watchsport [match-id] to get stream link_`
        await reply(_msg)
    } catch(e) { reply('❌ Could not fetch sports categories. Try again later.') }
} break

case 'livesports':
case 'sportslive': {
    await X.sendMessage(m.chat, { react: { text: '🔴', key: m.key } })
    let _lsCat = (text?.toLowerCase().trim()) || ''
    try {
        await reply(`🔴 _Fetching live sports events..._`)
        let _r = await fetch('https://movieapi.xcasper.space/api/live', { signal: AbortSignal.timeout(20000) })
        let _d = await _r.json()
        if (!_d.success || !_d.data?.matchList) throw new Error('No data')
        let _all = _d.data.matchList
        // Filter: only genuinely live/ongoing matches
        let _live = _all.filter(ev => {
            let _st = (ev.status || '').toLowerCase()
            let _sl = (ev.statusLive || '').toLowerCase()
            return _st === 'living' || _sl === 'living' || _st.includes('live') || _st.includes('progress') || _st.includes('half')
        })
        if (_lsCat) _live = _live.filter(ev => (ev.type || '').toLowerCase().includes(_lsCat))
        if (!_live.length) {
            let _label = _lsCat ? `*${_lsCat}*` : 'any sport'
            return reply(`╔══〔 🔴 NO LIVE EVENTS 〕══╗\n║ No live *${_label}* events right now\n╠══〔 💡 TRY INSTEAD 〕═══╣\n║ ${prefix}allsports        — all matches\n║ ${prefix}sportscategories — all sports\n╚═══════════════════════╝`)
        }
        const _si = { football: '⚽', basketball: '🏀', tennis: '🎾', cricket: '🏏', baseball: '⚾', hockey: '🏒', rugby: '🏉', volleyball: '🏐', motorsports: '🏎️', boxing: '🥊', mma: '🥋' }
        let _lines = [`╔══〔 🔴 LIVE SPORTS (${live.length}) 〕══╗\n\n`]
        for (let _ev of _live) {
            let _icon = _si[(_ev.type||'').toLowerCase()] || '🏅'
            let _sc1 = _ev.team1?.score || '0', _sc2 = _ev.team2?.score || '0'
            let _entry = `\n${_icon} *${_ev.team1?.name || '?'} ${_sc1} - ${_sc2} ${_ev.team2?.name || '?'}*\n`
            if (_ev.league) _entry += `   🏆 ${_ev.league}\n`
            if (_ev.timeDesc) _entry += `   ⏱️ ${_ev.timeDesc}\n`
            _entry += `   🆔 ${_ev.id}\n`
            _lines.push(_entry)
        }
        _lines.push(`\n_Use ${prefix}watchsport [match-id] to get the stream link_`)
        await _sendAllChunked(m.chat, _lines)
    } catch(e) { reply(`❌ Could not fetch live sports. Try again later.`) }
} break

case 'allsports':
case 'sportsall': {
    await X.sendMessage(m.chat, { react: { text: '🏅', key: m.key } })
    let _asCat = (text?.toLowerCase().trim()) || ''
    try {
        await reply(`🏅 _Fetching sports events..._`)
        let _r = await fetch('https://movieapi.xcasper.space/api/live', { signal: AbortSignal.timeout(20000) })
        let _d = await _r.json()
        if (!_d.success || !_d.data?.matchList) throw new Error('No data')
        let _all = _d.data.matchList
        if (_asCat) _all = _all.filter(ev => (ev.type || '').toLowerCase().includes(_asCat))
        if (!_all.length) return reply(`╔══〔 🏅 NO EVENTS FOUND 〕══╗\n║ No *${_asCat || 'sports'}* events found\n║ Try: *${prefix}sportscategories*\n╚═══════════════════════╝`)
        const _si = { football: '⚽', basketball: '🏀', tennis: '🎾', cricket: '🏏', baseball: '⚾', hockey: '🏒', rugby: '🏉', volleyball: '🏐', motorsports: '🏎️', boxing: '🥊', mma: '🥋' }
        const _statusLabel = { living: '🔴 LIVE', matchended: '✅ Ended', matchnotstart: '🕐 Not Started' }
        let _lines = [`╔══〔 🏅 ${asCat ? asCat.toUpperCase() + ' EVENTS' : 'ALL SPORTS'} (${all.length}) 〕══╗\n\n`]
        for (let _ev of _all) {
            let _icon = _si[(_ev.type||'').toLowerCase()] || '🏅'
            let _sc1 = _ev.team1?.score || '0', _sc2 = _ev.team2?.score || '0'
            let _stKey = (_ev.status || '').toLowerCase().replace(/\s/g,'')
            let _stLabel = _statusLabel[_stKey] || _ev.timeDesc || _ev.status || ''
            let _entry = `\n${_icon} *${_ev.team1?.name || '?'} ${_sc1} - ${_sc2} ${_ev.team2?.name || '?'}*\n`
            if (_ev.league) _entry += `   🏆 ${_ev.league}\n`
            if (_stLabel) _entry += `   📊 ${_stLabel}\n`
            _entry += `   🆔 ${_ev.id}\n`
            _lines.push(_entry)
        }
        _lines.push(`\n_Use ${prefix}watchsport [match-id] to get the stream link_`)
        await _sendAllChunked(m.chat, _lines)
    } catch(e) { reply(`❌ Could not fetch sports events. Try again later.`) }
} break

case 'watchsport':
case 'streamsport':
case 'sportsstream': {
    await X.sendMessage(m.chat, { react: { text: '📺', key: m.key } })
    if (!text) return reply(`╔══〔 📺 WATCH SPORT 〕═══╗\n\n║ Usage: *${prefix}watchsport [match-id]*\n║ Get IDs: *${prefix}livesports* or *${prefix}allsports*\n║ Example: ${prefix}watchsport 4789881499804909776\n╚═══════════════════════╝`)
    try {
        await reply('📺 _Fetching stream link..._')
        let _r = await fetch('https://movieapi.xcasper.space/api/live', { signal: AbortSignal.timeout(20000) })
        let _d = await _r.json()
        if (!_d.success || !_d.data?.matchList) throw new Error('No data')
        let _ev = _d.data.matchList.find(ev => ev.id === text.trim())
        if (!_ev) return reply(`❌ Match ID *${text.trim()}* not found.\n\nUse *${prefix}allsports* to get valid match IDs.`)
        let _streamUrl = _ev.playPath || ''
        let _msg = `╔══〔 📺 SPORT STREAM 〕══╗\n\n`
        _msg += `⚽ *${_ev.team1?.name || '?'} vs ${_ev.team2?.name || '?'}*\n`
        if (_ev.league) _msg += `🏆 *League:* ${_ev.league}\n`
        let _stKey = (_ev.status || '').toLowerCase()
        if (_stKey === 'living') _msg += `📊 *Status:* 🔴 LIVE\n`
        else if (_stKey === 'matchended') _msg += `📊 *Status:* ✅ Ended (${_ev.team1?.score || 0}-${_ev.team2?.score || 0})\n`
        else _msg += `📊 *Status:* ${_ev.status || 'Unknown'}\n`
        if (_streamUrl) {
            _msg += `\n🔗 *Stream URL (HLS/M3U8):*\n${_streamUrl}\n\n`
            _msg += `_Open with VLC, MX Player, or any HLS-compatible player_`
        } else {
            _msg += `\n⚠️ _No stream available for this match right now._\n_Streams are only available for live/ongoing matches._`
        }
        await reply(_msg)
    } catch(e) { reply(`❌ Could not get stream for match *${text}*. Try again later.`) }
} break


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NEW COMMANDS FROM PLUGIN ZIP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── AI aliases ─────────────────────────────────────────────────────
case 'gpt':
case 'gpt4': {
    await X.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
    if (!text) return reply(`╔═════〔 🤖 GPT-4 〕══════╗\n\n║ Usage: *${prefix}gpt4 [message]*\n║ Example: ${prefix}gpt4 Hello, how are you?\n╚═══════════════════════╝`)
    try {
        let _kResultgpt4 = null
    try {
      let _kr = await fetch(`https://apiskeith.top/ai/gpt?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
      let _kd = await _kr.json()
      if (_kd.status && _kd.result) _kResultgpt4 = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
    } catch {}
    if (_kResultgpt4) return reply(_kResultgpt4)
    const result = await _runAI('You are GPT-4, a highly intelligent AI assistant by OpenAI. Be helpful, clear and concise.', text)
        reply(result)
    } catch (e) {
        reply('❌ GPT-4 is currently unavailable. Please try again.')
    }
} break

case 'claude': {
    await X.sendMessage(m.chat, { react: { text: '💎', key: m.key } })
    if (!text) return reply(`╔═══〔 💎 CLAUDE AI 〕════╗\n\n║ Usage: *${prefix}claude [message]*\n║ Example: ${prefix}claude Hello, how are you?\n╚═══════════════════════╝`)
    try {
        let _kResultclaude = null
        try {
          let _kr = await fetch(`https://apiskeith.top/ai/claude?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
          let _kd = await _kr.json()
          if (_kd.status && _kd.result) _kResultclaude = typeof _kd.result === 'string' ? _kd.result : JSON.stringify(_kd.result)
        } catch {}
        if (_kResultclaude) return reply(_kResultclaude)
        const result = await _runAI('You are Claude AI, an AI assistant made by Anthropic. You are helpful, harmless, and honest. Provide thoughtful and detailed responses.', text)
        reply(result)
    } catch (e) {
        reply('❌ Claude AI is currently unavailable. Please try again.')
    }
} break

// ─── Fun aliases ─────────────────────────────────────────────────────
case 'eightball':
case 'magicball': {
    await X.sendMessage(m.chat, { react: { text: '🎱', key: m.key } })
    if (!text) return reply(`╔══〔 🎱 MAGIC 8 BALL 〕══╗\n\n║ Usage: *${prefix}${command} [message]*\n║ Example: ${prefix}${command} Will I pass my exam?\n╚═══════════════════════╝`)
    const _8bAnswers = ['It is certain.','It is decidedly so.','Without a doubt.','Yes definitely.','You may rely on it.','As I see it, yes.','Most likely.','Outlook good.','Yes.','Signs point to yes.','Reply hazy, try again.','Ask again later.','Better not tell you now.','Cannot predict now.','Concentrate and ask again.',"Don't count on it.",'My reply is no.','My sources say no.','Outlook not so good.','Very doubtful.']
    reply(`╔══〔 🎱 MAGIC 8 BALL 〕═══╗\n║ ❓ *${text}*\n║\n║ 💬 ${_8bAnswers[Math.floor(Math.random() * _8bAnswers.length)]}\n╚═══════════════════════╝`)
} break

// ─── Sports aliases ──────────────────────────────────────────────────
case 'fixtures':
case 'matches': {
    await X.sendMessage(m.chat, { react: { text: '📅', key: m.key } })
    try {
        await reply('📅 _Fetching upcoming EPL fixtures..._')
        const _gKey = typeof _giftedKey === 'function' ? _giftedKey() : (global._giftedApiKey || '')
        let _fxMatches = await _getFixtures('epl', `${_GTAPI}/api/football/epl/upcoming?apikey=${_gKey}`)
        if (!_fxMatches?.length) throw new Error('No fixtures found')
        let _fxMsg = `╔══〔 📅  UPCOMING EPL FIXTURES 〕══╗\n\n`
        for (let _fm of _fxMatches) {
            _fxMsg += `\n📆 *${_fm.date || ''}*${_fm.time ? '  ⏰ ' + _fm.time : ''}\n`
            _fxMsg += `  ⚽ *${_fm.homeTeam}* vs *${_fm.awayTeam}*\n`
            if (_fm.venue || _fm.stadium) _fxMsg += `  🏟️ _${_fm.venue || _fm.stadium}_\n`
        }
        await reply(_fxMsg)
    } catch(e) { reply('❌ Could not fetch EPL fixtures. Try again later.') }
} break

// ─── Owner commands ──────────────────────────────────────────────────
case 'broadcast':
case 'bc': {
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    if (!text) return reply(`╔═══〔 📢 BROADCAST 〕════╗\n\n║ Usage: *${prefix}broadcast <your message>*\n║ Sends to all groups the bot is in\n╚═══════════════════════╝`)
    await reply('📢 Sending broadcast...')
    try {
        const _bcGroups = await X.groupFetchAllParticipating()
        const _bcIds = Object.keys(_bcGroups)
        let _bcSent = 0
        for (const _bcId of _bcIds) {
            try {
                await X.sendMessage(_bcId, { text: `📢 *BROADCAST*\n\n${text}` })
                _bcSent++
                await new Promise(r => setTimeout(r, 500))
            } catch (_) {}
        }
        reply(`✅ Broadcast sent to *${_bcSent}/${_bcIds.length}* groups!`)
    } catch (e) { reply('❌ Broadcast failed: ' + e.message) }
} break

case 'addsudo':
case 'addmod': {
    await X.sendMessage(m.chat, { react: { text: '🛡️', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    let _sudoTarget = (m.mentionedJid && m.mentionedJid[0]) || (m.quoted && m.quoted.sender) || (args[0] && args[0].replace(/\D/g,'') + '@s.whatsapp.net')
    if (!_sudoTarget) return reply(`╔═══〔 🛡️ ADD SUDO 〕════╗\n\n║ Usage: *${prefix}addsudo @user*\n║ Or reply to a message\n╚═══════════════════════╝`)
    const _sudoPath = path.join(__dirname, 'database', 'sudoUsers.json')
    let _sudoList = []
    try { _sudoList = JSON.parse(fs.readFileSync(_sudoPath, 'utf-8')) } catch { _sudoList = [] }
    if (_sudoList.includes(_sudoTarget)) return reply(`⚠️ @${_sudoTarget.split('@')[0]} is already a sudo user.`)
    _sudoList.push(_sudoTarget)
    fs.mkdirSync(path.join(__dirname, 'database'), { recursive: true })
    fs.writeFileSync(_sudoPath, JSON.stringify(_sudoList, null, 2))
    await X.sendMessage(m.chat, { text: `✅ @${_sudoTarget.split('@')[0]} added as *sudo/mod*!`, mentions: [_sudoTarget] }, { quoted: m })
} break

case 'delsudo':
case 'removesudo':
case 'removemod': {
    await X.sendMessage(m.chat, { react: { text: '🔓', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    let _dsuTarget = (m.mentionedJid && m.mentionedJid[0]) || (m.quoted && m.quoted.sender) || (args[0] && args[0].replace(/\D/g,'') + '@s.whatsapp.net')
    if (!_dsuTarget) return reply(`╔══〔 🔓 REMOVE SUDO 〕═══╗\n\n║ Usage: *${prefix}delsudo @user*\n║ Or reply to a message\n╚═══════════════════════╝`)
    const _dsuPath = path.join(__dirname, 'database', 'sudoUsers.json')
    let _dsuList = []
    try { _dsuList = JSON.parse(fs.readFileSync(_dsuPath, 'utf-8')) } catch { _dsuList = [] }
    const _dsuIdx = _dsuList.indexOf(_dsuTarget)
    if (_dsuIdx === -1) return reply(`⚠️ @${_dsuTarget.split('@')[0]} is not a sudo user.`)
    _dsuList.splice(_dsuIdx, 1)
    fs.writeFileSync(_dsuPath, JSON.stringify(_dsuList, null, 2))
    await X.sendMessage(m.chat, { text: `✅ @${_dsuTarget.split('@')[0]} removed from *sudo*!`, mentions: [_dsuTarget] }, { quoted: m })
} break

case 'sudolist':
case 'mods':
case 'listmods': {
    await X.sendMessage(m.chat, { react: { text: '📋', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _slPath = path.join(__dirname, 'database', 'sudoUsers.json')
    let _slList = []
    try { _slList = JSON.parse(fs.readFileSync(_slPath, 'utf-8')) } catch { _slList = [] }
    if (!_slList.length) return reply('╔══〔 🛡️  SUDO / MOD USERS 〕══╗\n\n║ _No sudo users set yet._\n\n║ Use `.addsudo @user` to add one.')
    const _slMentions = _slList.map(u => u)
    await X.sendMessage(m.chat, {
        text: `╔══〔 🛡️  SUDO / MOD USERS 〕══╗\n\n${_slList.map((u, i) => `  ${i+1}. @${u.split('@')[0]}`).join('\n')}\n\n║ _Total: ${_slList.length} user(s)_\n╚═══════════════════════╝`,
        mentions: _slMentions
    }, { quoted: m })
} break

case 'setname':
case 'setbotname': {
    await X.sendMessage(m.chat, { react: { text: '✏️', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    if (!text) return reply(`╔══〔 ✏️ SET BOT NAME 〕══╗\n\n║ Usage: *${prefix}setbotname <new name>*\n╚═══════════════════════╝`)
    try {
        await X.updateProfileName(text)
        reply(`✅ Bot name updated to: *${text}*`)
    } catch (e) { reply('❌ Failed to update name: ' + e.message) }
} break

case 'sysinfo':
case 'system':
case 'serverinfo': {
    await X.sendMessage(m.chat, { react: { text: '🖥️', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _siMem = process.memoryUsage()
    const _siTot = os.totalmem(), _siFree = os.freemem()
    const _siUsed = ((_siTot - _siFree) / 1024 / 1024).toFixed(1)
    const _siTotMb = (_siTot / 1024 / 1024).toFixed(1)
    const _siCpus = os.cpus()
    const _siUp = process.uptime()
    const _siD = Math.floor(_siUp / 86400), _siH = Math.floor((_siUp % 86400) / 3600)
    const _siMn = Math.floor((_siUp % 3600) / 60), _siS = Math.floor(_siUp % 60)
    reply(
        `╔══〔 🖥️ SYSTEM INFORMATION 〕══╗\n\n` +
        `║ 💾 *RAM* : ${_siUsed} MB / ${_siTotMb} MB\n` +
        `║ 🧠 *Heap* : ${(_siMem.heapUsed / 1024 / 1024).toFixed(1)} MB\n` +
        `║ ⚙️  *CPU* : ${_siCpus[0]?.model?.trim() || 'Unknown'}\n` +
        `║ 🔢 *Cores* : ${_siCpus.length}\n` +
        `║ 🖥️  *OS* : ${os.type()} ${os.release()}\n` +
        `║ 📦 *Node* : ${process.version}\n` +
        `║ ⏱️  *Uptime* : ${_siD}d ${_siH}h ${_siMn}m ${_siS}s\n` +
        `║ 🏠 *Host* : ${os.hostname()}\n╚═══════════════════════╝`
    )
} break

case 'onlygroup':
case 'onlygc': {
    await X.sendMessage(m.chat, { react: { text: '👥', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _ogArg = (args[0] || '').toLowerCase()
    if (_ogArg === 'on') { global.onlyGroup = true; try { require('./library/settings').saveSettings() } catch {}; reply('✅ *Only Group mode ON* — bot will only respond in groups.') }
    else if (_ogArg === 'off') { global.onlyGroup = false; try { require('./library/settings').saveSettings() } catch {}; reply('✅ *Only Group mode OFF*') }
    else reply(`╔══〔 👥 ONLY GROUP MODE 〕══╗\n║ 📊 *Status* : ${global.onlyGroup ? '✅ ON' : '❌ OFF'}\n║ Usage: *${prefix}onlygroup on/off*\n╚═══════════════════════╝`)
} break

case 'onlypc': {
    await X.sendMessage(m.chat, { react: { text: '💬', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _opcArg = (args[0] || '').toLowerCase()
    if (_opcArg === 'on') { global.onlyPC = true; reply('✅ *Only Private Chat mode ON* — bot will only respond in DMs.') }
    else if (_opcArg === 'off') { global.onlyPC = false; reply('✅ *Only Private Chat mode OFF*') }
    else reply(`╔══〔 📩 ONLY DM MODE 〕═══╗\n║ 📊 *Status* : ${global.onlyPC ? '✅ ON' : '❌ OFF'}\n║ Usage: *${prefix}onlypc on/off*\n╚═══════════════════════╝`)
} break

case 'unavailable': {
    await X.sendMessage(m.chat, { react: { text: '🔕', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _unavArg = (args[0] || '').toLowerCase()
    if (_unavArg === 'on') {
        global.botUnavailable = true
        try { await X.sendPresenceUpdate('unavailable') } catch (_) {}
        reply('✅ *Unavailable mode ON* — bot appears offline.')
    } else if (_unavArg === 'off') {
        global.botUnavailable = false
        try { await X.sendPresenceUpdate('available') } catch (_) {}
        reply('✅ *Unavailable mode OFF* — bot appears online.')
    } else reply(`╔══〔 🔕 UNAVAILABLE MODE 〕╗\n║ 📊 *Status* : ${global.botUnavailable ? '✅ ON' : '❌ OFF'}\n║ Usage: *${prefix}unavailable on/off*\n╚═══════════════════════╝`)
} break

case 'idch':
case 'cekidch': {
    await X.sendMessage(m.chat, { react: { text: '📢', key: m.key } })
    if (!args[0]) return reply(`╔═══〔 📢 CHANNEL ID 〕═══╗\n\n║ Usage: *${prefix}idch <channel link>*\n║ Example: ${prefix}idch https://whatsapp.com/channel/...\n╚═══════════════════════╝`)
    if (!args[0].includes('https://whatsapp.com/channel/')) return reply('❌ Must be a valid WhatsApp channel link.')
    try {
        const _chCode = args[0].split('https://whatsapp.com/channel/')[1]
        const _chRes = await X.newsletterMetadata('invite', _chCode)
        reply(
            `╔══〔 📢 CHANNEL INFO 〕══╗\n\n` +
            `║ 🆔 *ID* : ${_chRes.id}\n` +
            `║ 📛 *Name* : ${_chRes.name}\n` +
            `║ 👥 *Followers* : ${_chRes.subscribers?.toLocaleString?.() ?? _chRes.subscribers}\n` +
            `║ 📊 *Status* : ${_chRes.state}\n` +
            `║ ✅ *Verified* : ${_chRes.verification === 'VERIFIED' ? 'Yes ✅' : 'No ❌'}\n╚═══════════════════════╝`
        )
    } catch (e) { reply('❌ Failed to fetch channel info. Check the link.') }
} break

case 'alwaysonline':
case 'onlineon': {
    await X.sendMessage(m.chat, { react: { text: '🟢', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _aoArg = (args[0] || '').toLowerCase()
    if (_aoArg === 'on') {
        if (global._alwaysOnlineInterval) clearInterval(global._alwaysOnlineInterval)
        global._alwaysOnlineInterval = setInterval(async () => {
            try { await X.sendPresenceUpdate('available') } catch (_) {}
        }, 10000)
        reply('✅ *Always Online ON* — bot will appear online continuously.')
    } else if (_aoArg === 'off') {
        if (global._alwaysOnlineInterval) { clearInterval(global._alwaysOnlineInterval); global._alwaysOnlineInterval = null }
        try { await X.sendPresenceUpdate('unavailable') } catch (_) {}
        reply('✅ *Always Online OFF* — bot presence is now normal.')
    } else reply(`╔══〔 🟢 ALWAYS ONLINE 〕══╗\n║ 📊 *Status* : ${global._alwaysOnlineInterval ? '✅ ON' : '❌ OFF'}\n║ Usage: *${prefix}alwaysonline on/off*\n╚═══════════════════════╝`)
} break

case 'lastseen':
case 'ls': {
    await X.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    const _lsArg = (args[0] || '').toLowerCase()
    if (_lsArg !== 'on' && _lsArg !== 'off') return reply(`╔═══〔 👁️ LAST SEEN 〕═══╗\n\n║ Usage: *${prefix}lastseen on/off*\n║ on = hide · off = show\n╚═══════════════════════╝`)
    try {
        await X.updateLastSeenPrivacy(_lsArg === 'on' ? 'none' : 'all')
        reply(`✅ Last seen is now *${_lsArg === 'on' ? 'HIDDEN' : 'VISIBLE'}*`)
    } catch (e) { reply('❌ Failed to update last seen: ' + e.message) }
} break

case 'creategroup':
case 'newgroup':
case 'mkgroup': {
    await X.sendMessage(m.chat, { react: { text: '👥', key: m.key } })
    if (!isOwner) return reply(mess.OnlyOwner)
    if (!text) return reply(`╔══〔 👥 CREATE GROUP 〕══╗\n\n║ Usage: *${prefix}creategroup <group name>*\n╚═══════════════════════╝`)
    try {
        const _cgResult = await X.groupCreate(text, [sender])
        reply(`✅ Group *${text}* created!\n🆔 ${_cgResult?.id || _cgResult?.gid || 'Done'}`)
    } catch (e) { reply('❌ Failed to create group: ' + e.message) }
} break

// ─── Group protection toggles ────────────────────────────────────────
case 'antigroupstatus':
case 'antigrpstatus':
case 'antigstt': {
    await X.sendMessage(m.chat, { react: { text: '🚫', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)
    const _agsArg = (args[0] || '').toLowerCase()
    if (!_agsArg) {
        const _agsState = global.antiGroupStatusGroups?.[m.chat] ? '✅ ON' : '❌ OFF'
        return reply(`╔══〔 🚫  ANTI GROUP STATUS 〕══╗\n\n║ Status : ${_agsState}\n║ Usage : ${prefix}antigroupstatus on/off\n\n_When ON, view-once & forwarded status messages will be auto-deleted._\n╚═══════════════════════╝`)
    }
    if (!['on','off'].includes(_agsArg)) return reply(`╔══〔 🚫 ANTI GROUP STATUS 〕══╗\n\n║ Usage: *${prefix}antigroupstatus on/off*\n╚═══════════════════════╝`)
    if (!global.antiGroupStatusGroups) global.antiGroupStatusGroups = {}
    global.antiGroupStatusGroups[m.chat] = _agsArg === 'on'
    reply(`╔══〔 🚫  ANTI GROUP STATUS 〕══╗\n\n║ ${_agsArg === 'on' ? '✅ *ENABLED* ─ status shares will be removed.' : '❌ *DISABLED* — status shares are allowed.'}\n╚═══════════════════════╝`)
} break

case 'antilinkgc': {
    await X.sendMessage(m.chat, { react: { text: '🔗', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)
    const _alcArg = (args[0] || '').toLowerCase()
    if (!_alcArg) {
        const _alcState = global.antilinkGcGroups?.[m.chat] ? '✅ ON' : '❌ OFF'
        return reply(`╔══〔 🔗  ANTI GC LINK 〕══╗\n\n║ Status : ${_alcState}\n║ Usage : ${prefix}antilinkgc on/off\n\n_Deletes WhatsApp group invite links posted in the group._\n╚═══════════════════════╝`)
    }
    if (!['on','off'].includes(_alcArg)) return reply(`╔══〔 🔗 ANTI GC LINK 〕══╗\n\n║ Usage: *${prefix}antilinkgc on/off*\n╚═══════════════════════╝`)
    if (!global.antilinkGcGroups) global.antilinkGcGroups = {}
    global.antilinkGcGroups[m.chat] = _alcArg === 'on'
    try { require('./library/settings').saveSettings() } catch {}
    reply(`╔══〔 🔗  ANTI GC LINK 〕══╗\n\n║ ${_alcArg === 'on' ? '✅ *ENABLED* — group links will be removed.' : '❌ *DISABLED* — group links are allowed.'}\n╚═══════════════════════╝`)
} break

case 'antiimage':
case 'antipic': {
    await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)
    const _aiArg = (args[0] || '').toLowerCase()
    if (!_aiArg) {
        const _aiState = global.antiImageGroups?.[m.chat] ? '✅ ON' : '❌ OFF'
        return reply(`╔══〔 🖼️  ANTI IMAGE 〕══╗\n\n║ Status : ${_aiState}\n║ Usage : ${prefix}antiimage on/off\n\n_Deletes all images sent in the group._\n╚═══════════════════════╝`)
    }
    if (!['on','off'].includes(_aiArg)) return reply(`╔══〔 🖼️ ANTI IMAGE 〕═══╗\n\n║ Usage: *${prefix}antiimage on/off*\n╚═══════════════════════╝`)
    if (!global.antiImageGroups) global.antiImageGroups = {}
    global.antiImageGroups[m.chat] = _aiArg === 'on'
    reply(`╔══〔 🖼️  ANTI IMAGE 〕══╗\n\n║ ${_aiArg === 'on' ? '✅ *ENABLED* — images will be auto-deleted.' : '❌ *DISABLED* — images are allowed.'}\n╚═══════════════════════╝`)
} break

case 'antivideo': {
    await X.sendMessage(m.chat, { react: { text: '🎬', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)
    const _avArg = (args[0] || '').toLowerCase()
    if (!_avArg) {
        const _avState = global.antiVideoGroups?.[m.chat] ? '✅ ON' : '❌ OFF'
        return reply(`╔══〔 🎬  ANTI VIDEO 〕═══╗\n\n║ Status : ${_avState}\n║ Usage : ${prefix}antivideo on/off\n\n_Deletes all videos sent in the group._\n╚═══════════════════════╝`)
    }
    if (!['on','off'].includes(_avArg)) return reply(`╔═══〔 🎬 ANTI VIDEO 〕═══╗\n\n║ Usage: *${prefix}antivideo on/off*\n╚═══════════════════════╝`)
    if (!global.antiVideoGroups) global.antiVideoGroups = {}
    global.antiVideoGroups[m.chat] = _avArg === 'on'
    reply(`╔══〔 🎬  ANTI VIDEO 〕═══╗\n\n║ ${_avArg === 'on' ? '✅ *ENABLED* — videos will be auto-deleted.' : '❌ *DISABLED* — videos are allowed.'}\n╚═══════════════════════╝`)
} break

case 'antimention': {
    await X.sendMessage(m.chat, { react: { text: '📣', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)
    const _amArg = (args[0] || '').toLowerCase()
    if (!_amArg) {
        const _amState = global.antiMentionGroups?.[m.chat] ? '✅ ON' : '❌ OFF'
        return reply(`╔══〔 📣  ANTI MENTION 〕══╗\n\n║ Status : ${_amState}\n║ Usage : ${prefix}antimention on/off\n\n_Deletes messages that tag/mention members._\n╚═══════════════════════╝`)
    }
    if (!['on','off'].includes(_amArg)) return reply(`╔══〔 📣 ANTI MENTION 〕══╗\n\n║ Usage: *${prefix}antimention on/off*\n╚═══════════════════════╝`)
    if (!global.antiMentionGroups) global.antiMentionGroups = {}
    global.antiMentionGroups[m.chat] = _amArg === 'on'
    reply(`╔══〔 📣  ANTI MENTION 〕══╗\n\n║ ${_amArg === 'on' ? '✅ *ENABLED* — mass mentions will be removed.' : '❌ *DISABLED* — mentions are allowed.'}\n╚═══════════════════════╝`)
} break

case 'clearwarn': {
    await X.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isAdmins && !isOwner) return reply(mess.admin)
    const _cwUser = (m.mentionedJid && m.mentionedJid[0]) || (m.quoted && m.quoted.sender) || (text && text.replace(/\D/g,'') + '@s.whatsapp.net')
    if (!_cwUser) return reply(`╔═══〔 ✅ CLEAR WARN 〕════╗\n\n║ Usage: *${prefix}clearwarn @user*\n║ Or reply to their message\n╚═══════════════════════╝`)
    const _cwDbPath = path.join(__dirname, 'database', 'warnings.json')
    let _cwDb = {}
    try { _cwDb = JSON.parse(fs.readFileSync(_cwDbPath, 'utf-8')) } catch { _cwDb = {} }
    if (_cwDb[m.chat]) { _cwDb[m.chat][_cwUser] = []; fs.writeFileSync(_cwDbPath, JSON.stringify(_cwDb, null, 2)) }
    await X.sendMessage(from, { text: `✅ *Warnings cleared for @${_cwUser.split('@')[0]}.*`, mentions: [_cwUser] }, { quoted: m })
} break

// ─── Disappearing messages ───────────────────────────────────────────
case 'disp-1':
case 'disp-7':
case 'disp-90':
case 'disp-off': {
    await X.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isOwner) return reply(mess.OnlyOwner)
    const _dispMap = { 'disp-1': 86400, 'disp-7': 7 * 86400, 'disp-90': 90 * 86400, 'disp-off': 0 }
    const _dispSec = _dispMap[command]
    try {
        await X.groupToggleEphemeral(m.chat, _dispSec)
        reply(_dispSec === 0
            ? '✅ Disappearing messages turned *OFF*.'
            : `✅ Disappearing messages set to *${command.replace('disp-','')} day(s)*.`
        )
    } catch (e) { reply('❌ Failed: ' + e.message) }
} break

// ─── Kickall ─────────────────────────────────────────────────────────
case 'kickall':
case 'kill': {
    await X.sendMessage(m.chat, { react: { text: '💀', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isOwner) return reply(mess.OnlyOwner)
    if (!isBotAdmins) return reply(mess.botAdmin)
    try {
        const _kaMeta = await X.groupMetadata(m.chat)
        const _kaMembers = _kaMeta.participants.filter(p => p.id !== X.user?.id && p.id !== sender).map(p => p.id)
        reply(`💀 Removing ${_kaMembers.length} member(s)... Stand by.`)
        await X.groupUpdateSubject(m.chat, 'Xxx Videos Hub').catch(() => {})
        await X.groupUpdateDescription(m.chat, 'This group is no longer available 🥹!').catch(() => {})
        await new Promise(r => setTimeout(r, 1500))
        await X.sendMessage(m.chat, { text: `⚠️ Removing ${_kaMembers.length} member(s) now. Goodbye everyone 👋` })
        await X.groupParticipantsUpdate(m.chat, _kaMembers, 'remove')
        setTimeout(() => X.groupLeave(m.chat).catch(() => {}), 1500)
    } catch (e) { reply('❌ Failed: ' + e.message) }
} break

// ─── Trash group ─────────────────────────────────────────────────────
case 'trash-group': {
    await X.sendMessage(m.chat, { react: { text: '🆘', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isOwner) return reply(mess.OnlyOwner)
    const _tgSleep = ms => new Promise(r => setTimeout(r, ms))
    for (let _tgi = 0; _tgi < 5; _tgi++) {
        for (let _tgj = 0; _tgj < 4; _tgj++) {
            await X.groupUpdateSubject(m.chat, `⚠️${Math.random().toString(36).slice(2)}`).catch(() => {})
        }
        await _tgSleep(500)
    }
    reply('[ 🔥 ] Done.\n> Pause for a few minutes to avoid ban.')
} break

// ─── getsw ───────────────────────────────────────────────────────────
case 'getsw': {
    await X.sendMessage(m.chat, { react: { text: '📥', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!m.quoted) return reply(
        `❌ *REPLY TO NOTIFICATION MESSAGE!*\n\n📋 *How to Use:*\n1. Wait for someone to tag the group in their status\n2. WhatsApp will send a notification to the group\n3. Reply to that notification with .getsw\n\n💡 Example:\n[Notification: "Status from user @ Group name"]\n└─ Reply: .getsw`
    )
    try {
        const _gsRawSender = m.quoted?.sender || m.message?.extendedTextMessage?.contextInfo?.participant
        if (!_gsRawSender) return reply('❌ Cannot detect status sender!')
        const _gsSenderNum = _gsRawSender.replace(/[^0-9]/g, '')
        if (!global.statusStore) return reply('❌ *STATUS STORE NOT ACTIVE!*\n\n💡 Make sure index.js has been updated with status@broadcast listener.')
        let _gsStatuses = global.statusStore.get(_gsRawSender) || []
        if (!_gsStatuses.length) {
            for (const [_gsKey, _gsVal] of global.statusStore.entries()) {
                if (_gsKey.replace(/[^0-9]/g,'') === _gsSenderNum) { _gsStatuses = _gsVal; break }
            }
        }
        if (!_gsStatuses.length) return reply(`❌ *STATUS NOT FOUND!*\n\n👤 User: @${_gsSenderNum}\n\n💡 Bot may have just restarted or status was deleted.`)
        const _gsLatest = _gsStatuses[_gsStatuses.length - 1]
        let _gsContent = _gsLatest?.message || {}
        for (let _gsi = 0; _gsi < 10; _gsi++) {
            if (_gsContent?.ephemeralMessage?.message) { _gsContent = _gsContent.ephemeralMessage.message; continue }
            if (_gsContent?.viewOnceMessage?.message) { _gsContent = _gsContent.viewOnceMessage.message; continue }
            if (_gsContent?.viewOnceMessageV2?.message) { _gsContent = _gsContent.viewOnceMessageV2.message; continue }
            break
        }
        const _gsSupportedTypes = ['imageMessage','videoMessage','audioMessage','extendedTextMessage','conversation']
        const _gsType = Object.keys(_gsContent).find(k => _gsSupportedTypes.includes(k))
        if (!_gsType) return reply(`❌ Status type not supported: ${Object.keys(_gsContent).join(', ')}`)
        const _gsNode = _gsContent[_gsType]
        const _gsCaption = _gsNode?.caption || _gsContent?.extendedTextMessage?.text || (typeof _gsContent?.conversation === 'string' ? _gsContent.conversation : '') || ''
        if (_gsType === 'imageMessage') {
            const _gsBuf = await (async () => { const _s = await downloadContentFromMessage(_gsNode, 'image'); let b = Buffer.from([]); for await (const c of _s) b = Buffer.concat([b,c]); return b })()
            await X.sendMessage(m.chat, { image: _gsBuf, caption: `✅ *STATUS RETRIEVED!*\n\n👤 From: @${_gsSenderNum}\n📷 Type: Image${_gsCaption ? `\n📝 Caption: ${_gsCaption}` : ''}`, mentions: [_gsRawSender] }, { quoted: m })
        } else if (_gsType === 'videoMessage') {
            const _gsBuf = await (async () => { const _s = await downloadContentFromMessage(_gsNode, 'video'); let b = Buffer.from([]); for await (const c of _s) b = Buffer.concat([b,c]); return b })()
            await X.sendMessage(m.chat, { video: _gsBuf, caption: `✅ *STATUS RETRIEVED!*\n\n👤 From: @${_gsSenderNum}\n🎥 Type: Video${_gsCaption ? `\n📝 Caption: ${_gsCaption}` : ''}`, mentions: [_gsRawSender], mimetype: 'video/mp4' }, { quoted: m })
        } else if (_gsType === 'audioMessage') {
            const _gsBuf = await (async () => { const _s = await downloadContentFromMessage(_gsNode, 'audio'); let b = Buffer.from([]); for await (const c of _s) b = Buffer.concat([b,c]); return b })()
            await X.sendMessage(m.chat, { audio: _gsBuf, mimetype: _gsNode.mimetype || 'audio/mp4', ptt: _gsNode.ptt || false }, { quoted: m })
            await reply(`✅ *STATUS RETRIEVED!*\n\n👤 From: @${_gsSenderNum}\n🎤 Type: ${_gsNode.ptt ? 'Voice Note' : 'Audio'}`)
        } else {
            reply(`✅ *STATUS RETRIEVED!*\n\n👤 From: @${_gsSenderNum}\n📝 Type: Text\n\n💬 Status:\n${_gsCaption || 'No text'}`)
        }
    } catch (e) {
        console.error('[GETSW ERROR]', e)
        reply('❌ *FAILED TO RETRIEVE STATUS!*\n\n🔧 Error: ' + e.message)
    }
} break

// ─── swgc / upswgc ───────────────────────────────────────────────────
case 'swgc':
case 'upswgc': {
    await X.sendMessage(m.chat, { react: { text: '📤', key: m.key } })
    if (!m.isGroup) return reply(mess.OnlyGrup)
    if (!isOwner) return reply(mess.OnlyOwner)
    try {
        const _swCrypto = require('crypto')
        const _swDownload = async (node, type) => {
            const stream = await downloadContentFromMessage(node, type.replace('Message',''))
            let buf = Buffer.from([])
            for await (const chunk of stream) buf = Buffer.concat([buf, chunk])
            return buf
        }
        const _swUnwrap = raw => {
            let msg = raw || {}
            for (let i = 0; i < 10; i++) {
                if (msg?.ephemeralMessage?.message) { msg = msg.ephemeralMessage.message; continue }
                if (msg?.viewOnceMessage?.message) { msg = msg.viewOnceMessage.message; continue }
                if (msg?.viewOnceMessageV2?.message) { msg = msg.viewOnceMessageV2.message; continue }
                if (msg?.documentWithCaptionMessage?.message) { msg = msg.documentWithCaptionMessage.message; continue }
                break
            }
            return msg
        }
        const _swMediaTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage']
        const _swTextTypes  = ['extendedTextMessage','conversation']
        const _swPickNode = raw => {
            if (!raw) return null
            const u = _swUnwrap(raw)
            for (const t of _swMediaTypes) if (u?.[t]) return { node: u[t], type: t }
            for (const t of _swTextTypes)  if (u?.[t]) return { node: u[t], type: t }
            return null
        }
        const _swIsUrl = s => /^https?:\/\//i.test((s||'').trim())
        const _swGetDomain = url => { try { return new URL(url).hostname.replace('www.','') } catch { return url } }
        const _swBgColors = [0xFF8A2BE2, 0xFFFF69B4, 0xFFFFA500, 0xFF00BFFF, 0xFF32CD32]
        const _swRandBg = () => _swBgColors[Math.floor(Math.random() * _swBgColors.length)]

        let _swPicked = null
        let _swCaption = text || ''
        const _swQuotedRaw = m.quoted?.message || null
        if (_swQuotedRaw) _swPicked = _swPickNode(_swQuotedRaw)
        if (!_swPicked && m.message) {
            const _swSelf = _swPickNode(m.message)
            if (_swSelf && _swMediaTypes.includes(_swSelf.type)) _swPicked = _swSelf
        }
        if (!_swPicked) {
            const _swRawText = _swCaption || (() => { const u = _swUnwrap(m.message); return u?.extendedTextMessage?.text || u?.conversation || '' })()
            if (!_swRawText) return reply(`❌ *NO CONTENT!*\n\n📋 *How to Use:*\n1️⃣ Image/Video: Send/reply media : .swgc\n2️⃣ Text: .swgc Hello everyone!\n3️⃣ Link: .swgc https://youtu.be/xxx`)
            _swPicked = { node: _swRawText, type: 'text' }
            _swCaption = ''
        }

        let _swPayload = {}, _swTypeLabel = ''
        if (_swPicked.type === 'imageMessage') {
            const buf = await _swDownload(_swPicked.node, 'imageMessage')
            _swPayload = { image: buf, caption: _swCaption || _swPicked.node?.caption || '' }
            _swTypeLabel = '📷 Image'
        } else if (_swPicked.type === 'videoMessage') {
            const buf = await _swDownload(_swPicked.node, 'videoMessage')
            _swPayload = { video: buf, caption: _swCaption || _swPicked.node?.caption || '', gifPlayback: false }
            _swTypeLabel = '🎥 Video'
        } else if (_swPicked.type === 'audioMessage') {
            const buf = await _swDownload(_swPicked.node, 'audioMessage')
            const isPtt = _swPicked.node?.ptt === true
            _swPayload = { audio: buf, mimetype: isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4', ptt: isPtt }
            _swTypeLabel = isPtt ? '🎤 Voice Note' : '🎵 Audio'
        } else {
            const rawText = typeof _swPicked.node === 'string' ? _swPicked.node : _swCaption
            if (_swIsUrl(rawText)) {
                _swPayload = { text: rawText, linkPreview: { url: rawText, title: _swGetDomain(rawText), description: _swCaption || rawText, thumbnail: null } }
                _swTypeLabel = `🔗 Link — ${_swGetDomain(rawText)}`
            } else {
                _swPayload = { text: rawText, backgroundArgb: _swRandBg(), textArgb: 0xFFFFFFFF, font: Math.floor(Math.random() * 5) + 1 }
                _swTypeLabel = '📝 Text'
            }
        }

        let _swWaContent
        try {
            _swWaContent = await generateWAMessageContent(_swPayload, { upload: X.waUploadToServer })
        } catch (_swFbErr) {
            const _swFallbackText = _swCaption || (typeof _swPicked.node === 'string' ? _swPicked.node : '') || _swTypeLabel || '(status)'
            _swWaContent = await generateWAMessageContent({ text: _swFallbackText, backgroundArgb: _swRandBg(), textArgb: 0xFFFFFFFF, font: 1 }, { upload: X.waUploadToServer })
            _swTypeLabel += ' (fallback text)'
        }

        const _swSecret = _swCrypto.randomBytes(32)
        const _swFinalMsg = generateWAMessageFromContent(m.chat, {
            messageContextInfo: { messageSecret: _swSecret },
            groupStatusMessageV2: { message: { ..._swWaContent, messageContextInfo: { messageSecret: _swSecret } } }
        }, { userJid: X.user?.id })

        await X.relayMessage(m.chat, _swFinalMsg.message, { messageId: _swFinalMsg.key.id })
        reply(`✅ *GROUP STATUS UPLOADED!*\n\n📌 Type: ${_swTypeLabel}\n💡 Status published to the group.`)
    } catch (e) {
        console.error('[SWGC ERROR]', e)
        reply('❌ *Upload Status Failed*\n\n🔧 Error: ' + e.message)
    }
} break


//━━━━━━━━━━━━━━━━━━━━━━━━//
// SEARCH COMMANDS

case 'gsearch':
case 'google': {
  await X.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
  if (!text) return reply(`╔══〔 🔍 GOOGLE SEARCH 〕══╗\n║ *Usage:* ${prefix}google [query]\n║ Example: ${prefix}google kenya news\n╚═══════════════════════╝`)
  try {
    await reply('🔍 _Searching Google..._')
    let r = await fetch(`https://apiskeith.top/search/google?q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000) })
    let d = await r.json()
    if (!d.status || !d.result || !d.result.items || !d.result.items.length) return reply('❌ No results found for: ' + text)
    let items = d.result.items.slice(0, 5)
    let body = `╔══〔 🔍 GOOGLE: ${text.toUpperCase()} 〕══╗\n`
    items.forEach((item, i) => {
      body += `║ *${i+1}. ${item.title}*\n║    ${item.link}\n`
    })
    body += `╚═══════════════════════╝`
    reply(body)
  } catch (e) { reply('❌ Google search failed: ' + e.message) }
} break

case 'wikipedia':
case 'wiki': {
  await X.sendMessage(m.chat, { react: { text: '📖', key: m.key } })
  if (!text) return reply(`╔══〔 📖 WIKIPEDIA 〕══════╗\n║ *Usage:* ${prefix}wiki [topic]\n║ Example: ${prefix}wiki Nairobi\n╚═══════════════════════╝`)
  try {
    await reply('📖 _Fetching Wikipedia..._')
    let r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text.replace(/ /g,'_'))}`, { signal: AbortSignal.timeout(15000) })
    let d = await r.json()
    if (d.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') return reply(`❌ No Wikipedia article found for: *${text}*`)
    let thumb = d.thumbnail ? d.thumbnail.source : null
    let caption = `╔══〔 📖 WIKIPEDIA 〕══════╗\n║ *${d.title}*\n║\n║ ${(d.extract || '').slice(0, 500).replace(/\n/g, '\n║ ')}\n║\n║ 🔗 ${d.content_urls?.desktop?.page || ''}\n╚═══════════════════════╝`
    if (thumb) {
      await X.sendMessage(m.chat, { image: { url: thumb }, caption }, { quoted: m })
    } else {
      reply(caption)
    }
  } catch (e) { reply('❌ Wikipedia lookup failed: ' + e.message) }
} break

case 'dict':
case 'define':
case 'dictionary': {
  await X.sendMessage(m.chat, { react: { text: '📚', key: m.key } })
  if (!text) return reply(`╔══〔 📚 DICTIONARY 〕═════╗\n║ *Usage:* ${prefix}define [word]\n║ Example: ${prefix}define ephemeral\n╚═══════════════════════╝`)
  try {
    await reply('📚 _Looking up definition..._')
    let r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text.split(' ')[0])}`, { signal: AbortSignal.timeout(15000) })
    if (r.status === 404) return reply(`❌ No definition found for: *${text}*`)
    let d = await r.json()
    if (!Array.isArray(d) || !d.length) return reply(`❌ No definition found for: *${text}*`)
    let entry = d[0]
    let word = entry.word
    let phonetic = entry.phonetic || (entry.phonetics?.[0]?.text) || ''
    let meanings = entry.meanings?.slice(0, 2) || []
    let body = `╔══〔 📚 DICTIONARY 〕═════╗\n║ 🔤 *${word}* ${phonetic}\n`
    for (let m2 of meanings) {
      body += `╠══〔 ${m2.partOfSpeech.toUpperCase()} 〕════╣\n`
      let defs = m2.definitions?.slice(0, 2) || []
      for (let def of defs) {
        body += `║ • ${def.definition.slice(0, 120)}\n`
        if (def.example) body += `║   _"${def.example.slice(0, 100)}"_\n`
      }
    }
    body += `╚═══════════════════════╝`
    reply(body)
  } catch (e) { reply('❌ Dictionary failed: ' + e.message) }
} break

case 'urban': {
  await X.sendMessage(m.chat, { react: { text: '🏙️', key: m.key } })
  if (!text) return reply(`╔══〔 🏙️ URBAN DICTIONARY 〕╗\n║ *Usage:* ${prefix}urban [word/slang]\n║ Example: ${prefix}urban goated\n╚═══════════════════════╝`)
  try {
    await reply('🏙️ _Looking up slang..._')
    let r = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(15000) })
    let d = await r.json()
    if (!d.list || !d.list.length) return reply(`❌ No Urban Dictionary entry for: *${text}*`)
    let e = d.list[0]
    let def = e.definition.replace(/\[|\]/g, '').slice(0, 300)
    let ex = (e.example || '').replace(/\[|\]/g, '').slice(0, 200)
    let body = `╔══〔 🏙️ URBAN DICTIONARY 〕╗\n║ 🔤 *${e.word}*\n║\n║ 📖 *Definition:*\n║ ${def.replace(/\n/g, '\n║ ')}\n`
    if (ex) body += `║\n║ 💬 *Example:*\n║ _${ex.replace(/\n/g, '\n║ ')}_\n`
    body += `║\n║ 👍 ${e.thumbs_up}  👎 ${e.thumbs_down}\n╚═══════════════════════╝`
    reply(body)
  } catch (e2) { reply('❌ Urban Dictionary failed: ' + e2.message) }
} break

case 'gnews':
case 'news': {
  await X.sendMessage(m.chat, { react: { text: '📰', key: m.key } })
  try {
    await reply('📰 _Fetching latest BBC news..._')
    // Primary: Keith BBC news
    const _nbd = await _keithFetch('/news/bbc')
    const _nbs = _nbd?.topStories || []
    if (_nbs.length) {
      // Send image of first story if available
      const _nbFirst = _nbs[0]
      if (_nbFirst.imageUrl && !_nbFirst.imageUrl.includes('grey-placeholder')) {
        try { await X.sendMessage(m.chat, { image: { url: _nbFirst.imageUrl }, caption: `🔴 *${_nbFirst.isLive ? 'LIVE: ' : ''}${_nbFirst.title}*` }, { quoted: m }) } catch {}
      }
      let body = `╔══〔 📰 BBC WORLD NEWS 〕══╗\n`
      for (let a of _nbs.slice(0, 8)) {
        const _nbTime = a.metadata?.time ? ` · ${a.metadata.time}` : ''
        const _nbCat  = a.metadata?.category ? ` [${a.metadata.category}]` : ''
        const _nbLive = a.isLive ? '🔴 LIVE — ' : ''
        body += `\n${_nbLive}*${(a.title||'').slice(0,90)}*${_nbCat}\n`
        if (a.description) body += `   _${a.description.slice(0,100)}_\n`
        if (_nbTime) body += `   🕐${_nbTime}\n`
        if (a.url) body += `   🔗 ${a.url}\n`
      }
      body += `\n╚═══════════════════════╝`
      return reply(body)
    }
    // Fallback: Google News RSS via rss2json
    const _nq = text?.trim() || 'Kenya'
    const _nr = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://news.google.com/rss/search?q=' + _nq + '&hl=en')}`, { signal: AbortSignal.timeout(15000) })
    const _nd = await _nr.json()
    if (!_nd.items?.length) return reply('❌ No news found right now. Try again later.')
    let body = `╔══〔 📰 NEWS: ${_nq.toUpperCase()} 〕══╗\n`
    _nd.items.slice(0, 6).forEach((item, i) => {
      body += `\n*${i+1}. ${(item.title||'').replace(/ - .+$/, '').slice(0,85)}*\n   🔗 ${item.link||''}\n`
    })
    body += `\n╚═══════════════════════╝`
    reply(body)
  } catch (e) { reply('❌ News fetch failed. Try again later.') }
} break


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📚  EDUCATION — GRAMMAR · POEM · BOOKS · FRUIT INFO (Keith API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  case 'grammarcheck':
  case 'grammar': {
      await X.sendMessage(m.chat, { react: { text: '✍️', key: m.key } })
      const _gcq = q?.trim() || text?.trim()
      if (!_gcq) return reply(`╌══〔 ✍️ GRAMMAR CHECK 〕══╌\n║ *Usage:* ${prefix}grammarcheck [text]\n║ Example: ${prefix}grammarcheck She go to school\n╚═══════════════════════╝`)
      try {
          await reply('✍️ _Checking grammar..._')
          const _gcd = await _keithFetch(`/grammarcheck?q=${encodeURIComponent(_gcq)}`)
          const _gcr = _gcd?.recommendations || _gcd?.result?.recommendations
          if (!Array.isArray(_gcr) || !_gcr.length) { await reply('✅ *Grammar looks good!*'); break }
          let msg = '╌══〔 ✍️ GRAMMAR CHECK 〕══╌\n'
          msg += `\n📝 *Original:* _${_gcq}_\n\n*Suggestions:*\n`
          for (let s of _gcr.slice(0, 5)) { msg += `\n❗ ${s.adviceText || s.text || ''}\n` }
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply('❌ Grammar check failed. Try again later.') }
  } break

  case 'poem':
  case 'randompoem': {
      await X.sendMessage(m.chat, { react: { text: '🎭', key: m.key } })
      try {
          const _pd = await _keithFetch('/education/randompoem')
          const _pr = _pd?.poem || _pd
          if (!_pr?.title) throw new Error('No poem')
          let msg = `╌══〔 🎭 RANDOM POEM 〕════╌\n\n📜 *${_pr.title}*\n✍️ _by ${_pr.author || 'Unknown'}_\n\n`
          if (Array.isArray(_pr.lines)) msg += _pr.lines.slice(0, 20).join('\n') + '\n'
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply('❌ Could not fetch a poem right now.') }
  } break

  case 'booksearch':
  case 'findbook': {
      await X.sendMessage(m.chat, { react: { text: '📖', key: m.key } })
      const _bsq = q?.trim() || text?.trim()
      if (!_bsq) return reply(`╌══〔 📖 BOOK SEARCH 〕════╌\n║ *Usage:* ${prefix}booksearch [title]\n║ Example: ${prefix}booksearch Harry Potter\n╚═══════════════════════╝`)
      try {
          await reply(`📖 _Searching books for: ${_bsq}..._`)
          const _bsd = await _keithFetch(`/education/booksearch?q=${encodeURIComponent(_bsq)}`)
          const _bsr = Array.isArray(_bsd) ? _bsd : (_bsd?.result || [])
          if (!_bsr.length) { reply(`❌ No books found for *${_bsq}*`); break }
          let msg = `╌══〔 📖 BOOKS: ${_bsq.toUpperCase()} 〕╌\n`
          for (let b of _bsr.slice(0, 5)) {
              const _bt = b.title || b.volumeInfo?.title || 'Unknown'
              const _ba = b.authors || b.volumeInfo?.authors
              msg += `\n📚 *${_bt}*\n`
              if (_ba) msg += `   ✍️ ${Array.isArray(_ba) ? _ba.join(', ') : _ba}\n`
              const _bde = b.description || b.volumeInfo?.description
              if (_bde) msg += `   📝 ${_bde.slice(0, 120)}...\n`
          }
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply('❌ Book search failed. Try again later.') }
  } break

  case 'fruit':
  case 'fruitinfo': {
      await X.sendMessage(m.chat, { react: { text: '🍎', key: m.key } })
      const _fiq = q?.trim() || text?.trim()
      if (!_fiq) return reply(`╌══〔 🍎 FRUIT INFO 〕════╌\n║ *Usage:* ${prefix}fruit [name]\n║ Example: ${prefix}fruit mango\n╚═══════════════════════╝`)
      try {
          await reply(`🍎 _Looking up: ${_fiq}..._`)
          const _fid = await _keithFetch(`/education/fruit?q=${encodeURIComponent(_fiq)}`)
          const _fir = _fid?.result || _fid
          if (!_fir?.name) throw new Error('Not found')
          let msg = `╌══〔 🍎 ${_fir.name.toUpperCase()} 〕╌\n`
          if (_fir.family) msg += `\n🌿 *Family:* ${_fir.family}\n`
          if (_fir.order) msg += `📦 *Order:* ${_fir.order}\n`
          if (_fir.nutritions) { const n = _fir.nutritions; msg += `\n*🔬 Nutrition (per 100g):*\n`; if (n.calories !== undefined) msg += `  🔥 Calories: ${n.calories}\n`; if (n.carbohydrates !== undefined) msg += `  🌾 Carbs: ${n.carbohydrates}g\n`; if (n.protein !== undefined) msg += `  💪 Protein: ${n.protein}g\n`; if (n.fat !== undefined) msg += `  🥑 Fat: ${n.fat}g\n`; if (n.sugar !== undefined) msg += `  🍬 Sugar: ${n.sugar}g\n` }
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply(`❌ Could not find info for *${_fiq}*. Try: mango, apple, lemon`) }
  } break

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🍽️  RECIPE / FOOD LOOKUP
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  case 'recipe':
  case 'food':
  case 'meal':
  case 'cooking': {
      await X.sendMessage(m.chat, { react: { text: '🍽️', key: m.key } })
      const _rcQ = text?.trim() || q?.trim()
      if (!_rcQ) return reply(`╌══〔 🍽️ RECIPE FINDER 〕════╌\n║ *Usage:* *${prefix}recipe [food name]*\n║ *Example:* ${prefix}recipe jollof rice\n║\n║ Powered by TheMealDB & Keith API\n╚═══════════════════════╝`)
      try {
          await reply('🍽️ _Searching for recipe..._')
          let _rcResult = null
          // Method 1: TheMealDB free API
          try {
              const _mdb = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(_rcQ)}`, { signal: AbortSignal.timeout(15000) })
              const _mdd = await _mdb.json()
              if (_mdd.meals && _mdd.meals.length) {
                  const m1 = _mdd.meals[0]
                  // Build ingredient list (TheMealDB stores up to 20 ingredients)
                  let _ing = ''
                  for (let i = 1; i <= 20; i++) {
                      const ingr = m1[`strIngredient${i}`]?.trim()
                      const meas = m1[`strMeasure${i}`]?.trim()
                      if (ingr) _ing += `\n║ • ${meas ? meas + ' ' : ''}${ingr}`
                  }
                  const _instr = (m1.strInstructions || '').slice(0, 500).replace(/\r\n/g, '\n').trim()
                  _rcResult = `╔══〔 🍽️ RECIPE: ${m1.strMeal} 〕══╗\n║ 🌍 *Origin:* ${m1.strArea || 'Unknown'}\n║ 🏷️  *Category:* ${m1.strCategory || 'Food'}\n║\n║ 🛒 *Ingredients:*${_ing}\n║\n║ 📖 *Instructions:*\n║ ${_instr}${_instr.length >= 500 ? '...' : ''}\n╚═══════════════════════╝`
                  if (m1.strMealThumb) {
                      await X.sendMessage(m.chat, { image: { url: m1.strMealThumb }, caption: _rcResult }, { quoted: m })
                  } else {
                      await reply(_rcResult)
                  }
              }
          } catch {}
          // Method 2: Keith API fallback
          if (!_rcResult) {
              try {
                  const _krc = await _keithFetch(`/recipe?q=${encodeURIComponent(_rcQ)}`, 20000)
                  if (_krc?.title || _krc?.name || _krc?.result) {
                      const _r = _krc.result || _krc
                      _rcResult = `╔══〔 🍽️ RECIPE FOUND 〕════╗\n║ 🍴 *${_r.title || _r.name || _rcQ}*\n║ ${(_r.description || _r.instructions || JSON.stringify(_r)).slice(0,500)}\n╚═══════════════════════╝`
                      await reply(_rcResult)
                  }
              } catch {}
          }
          if (!_rcResult) return reply(`❌ No recipe found for *${_rcQ}*. Try: chicken, rice, pasta, soup`)
      } catch(e) { reply(`❌ Recipe lookup failed: ${e.message}`) }
  } break
  



// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📰  BBC / TECH / KENYANS NEWS (Keith API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  case 'bbcnews':
  case 'bbcheadlines': {
      await X.sendMessage(m.chat, { react: { text: '📡', key: m.key } })
      try {
          await reply('📡 _Fetching BBC headlines..._')
          const _bd = await _keithFetch('/news/bbc')
          const _bst = _bd?.topStories || _bd?.articles || _bd
          if (!Array.isArray(_bst) || !_bst.length) throw new Error('No data')
          let msg = `╔══〔 📡 BBC NEWS 〕══╗\n`
          for (let a of _bst.slice(0, 8)) {
              msg += `\n🔹 *${a.title}*\n`
              if (a.description) msg += `   ${a.description.slice(0, 100)}...\n`
          }
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply('❌ Could not fetch BBC news. Try again later.') }
  } break

  case 'technews':
  case 'techheadlines': {
      await X.sendMessage(m.chat, { react: { text: '💻', key: m.key } })
      try {
          await reply('💻 _Fetching tech news..._')
          const _tnd = await _keithFetch('/news/tech')
          const _tna = _tnd?.featuredArticles || _tnd?.articles || _tnd?.items || (Array.isArray(_tnd) ? _tnd : [])
          if (!_tna.length) throw new Error('No data')
          let msg = `╔══〔 💻 TECH NEWS 〕══╗\n`
          for (let a of _tna.slice(0, 8)) {
              const _tnTitle = a.title || a.name || ''
              const _tnDesc = (a.description || a.summary || '').trim()
              const _tnLink = a.link || a.url || ''
              msg += `\n🔷 *${_tnTitle}*\n`
              if (_tnDesc) msg += `   _${_tnDesc.slice(0, 110)}_\n`
              if (_tnLink) msg += `   🔗 ${_tnLink}\n`
          }
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply('❌ Could not fetch tech news. Try again later.') }
  } break

  case 'kenyans':
  case 'kenyannews': {
      await X.sendMessage(m.chat, { react: { text: '🇰🇪', key: m.key } })
      try {
          if (text?.trim()) {
              // Search mode: .kenyans [query]
              await reply(`🔍 _Searching Kenyans.co.ke for "${text.trim()}"..._`)
              const _ksd = await _keithFetch(`/news/kenyans/search?q=${encodeURIComponent(text.trim())}`)
              const _ksr = _ksd?.results || []
              if (!_ksr.length) return reply(`❌ No results found for: *${text.trim()}*`)
              let msg = `╔══〔 🔍 KENYANS SEARCH 〕══╗\n║ Query: *${text.trim()}*\n║ Found: ${_ksd?.totalResults || _ksr.length} results\n`
              for (let a of _ksr.slice(0, 6)) {
                  msg += `\n📰 *${a.title}*\n`
                  if (a.date) msg += `   📅 ${new Date(a.date).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })}\n`
                  if (a.excerpt) msg += `   _${a.excerpt.replace(/…/g,'').trim().slice(0, 100)}_\n`
                  if (a.url) msg += `   🔗 ${a.url}\n`
              }
              msg += `\n╚═══════════════════════╝`
              return reply(msg)
          }
          // Default: latest news
          await reply('🇰🇪 _Fetching Kenyans.co.ke news..._')
          const _knd = await _keithFetch('/news/kenyans')
          const _kna = Array.isArray(_knd) ? _knd : (_knd?.articles || [])
          if (!_kna.length) throw new Error('No data')
          let msg = `╔══〔 🇰🇪 KENYANS NEWS 〕══╗\n`
          for (let a of _kna.slice(0, 8)) {
              const _kCat = a.category ? `[${a.category}] ` : ''
              const _kTitle = (a.title || '').replace(/^(Breaking News|News Just In|Latest News)/i, '').trim()
              msg += `\n${_kCat ? `🔴 *${_kCat}*` : `📰`} *${_kTitle}*\n`
              if (a.teaser) msg += `   _${a.teaser.slice(0, 100)}_\n`
              if (a.date) msg += `   📅 ${a.date}\n`
              if (a.url) msg += `   🔗 ${a.url}\n`
          }
          msg += `\n╚═══════════════════════╝`
          await reply(msg)
      } catch(e) { reply('❌ Could not fetch Kenyan news. Try again later.') }
  } break



case 'bbcnews':
case 'bbc': {
    await X.sendMessage(m.chat, { react: { text: '🌍', key: m.key } })
    try {
        await reply('🌍 _Fetching BBC World News..._')
        const _bbd = await _keithFetch('/news/bbc')
        const _bbs = _bbd?.topStories || []
        if (!_bbs.length) throw new Error('No data')
        // Send thumbnail of first story with real image
        const _bbImg = _bbs.find(a => a.imageUrl && !a.imageUrl.includes('grey-placeholder'))
        if (_bbImg) {
            try { await X.sendMessage(m.chat, { image: { url: _bbImg.imageUrl }, caption: `🔴 *${_bbImg.isLive ? 'LIVE: ' : ''}${_bbImg.title}*\n${_bbImg.description ? '_' + _bbImg.description + '_' : ''}` }, { quoted: m }) } catch {}
        }
        let msg = `╔══〔 🌍 BBC WORLD NEWS 〕══╗\n`
        for (let a of _bbs.slice(0, 8)) {
            const _bbCat = a.metadata?.category ? ` · ${a.metadata.category}` : ''
            const _bbTime = a.metadata?.time ? ` · ${a.metadata.time}` : ''
            const _bbLive = a.isLive ? '🔴 *LIVE* — ' : '📰 '
            msg += `\n${_bbLive}*${(a.title||'').slice(0,90)}*${_bbCat}\n`
            if (a.description) msg += `   _${a.description.slice(0,110)}_\n`
            if (_bbTime) msg += `   🕐${_bbTime}\n`
            if (a.url) msg += `   🔗 ${a.url}\n`
        }
        msg += `\n╚═══════════════════════╝`
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch BBC news. Try again later.') }
} break

case 'kbcnews':
case 'kbc': {
    await X.sendMessage(m.chat, { react: { text: '📺', key: m.key } })
    try {
        await reply('📺 _Fetching KBC Channel 1 news..._')
        const _kbd = await _keithFetch('/news/kbc')
        const _kbr = _kbd || {}
        const _kbItems = _kbr.breakingNews || _kbr.topStories || _kbr.latestNews || []
        if (!_kbItems.length) throw new Error('No data')
        let msg = `╔══〔 📺 KBC CHANNEL 1 NEWS 〕══╗\n║ 🌐 ${_kbr.baseUrl || 'kbctv.co.ke'}\n`
        for (let a of _kbItems.slice(0, 8)) {
            const _kbTitle = (a.title || a.text || '').trim()
            if (!_kbTitle) continue
            msg += `\n📌 *${_kbTitle.slice(0, 90)}*\n`
            if (a.url && a.url !== _kbr.baseUrl) msg += `   🔗 ${a.url}\n`
        }
        msg += `\n╚═══════════════════════╝`
        await reply(msg)
    } catch(e) { reply('❌ Could not fetch KBC news. Try again later.') }
} break

case 'manga': {
  await X.sendMessage(m.chat, { react: { text: '📕', key: m.key } })
  if (!text) return reply(`╔══〔 📕 MANGA SEARCH 〕═══╗\n║ *Usage:* ${prefix}manga [title]\n║ Example: ${prefix}manga one piece\n╚═══════════════════════╝`)
  try {
    await reply('📕 _Searching manga..._')
    let r = await fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(text)}&limit=1`, { signal: AbortSignal.timeout(15000) })
    let d = await r.json()
    if (!d.data || !d.data.length) return reply(`❌ No manga found: *${text}*`)
    let mg = d.data[0]
    let cover = mg.images?.jpg?.image_url
    let caption = `╔══〔 📕 MANGA FOUND 〕════╗\n║ 📝 *Title:* ${mg.title}\n║ 📖 *Chapters:* ${mg.chapters || 'Ongoing'}\n║ ⭐ *Score:* ${mg.score || 'N/A'}\n║ 📊 *Status:* ${mg.status || 'N/A'}\n║ 🏷️ *Genres:* ${(mg.genres||[]).slice(0,3).map(g=>g.name).join(', ')}\n║\n║ 📄 *Synopsis:*\n║ ${(mg.synopsis||'N/A').slice(0,200).replace(/\n/g,'\n║ ')}...\n╚═══════════════════════╝`
    if (cover) {
      await X.sendMessage(m.chat, { image: { url: cover }, caption }, { quoted: m })
    } else {
      reply(caption)
    }
  } catch (e) { reply('❌ Manga search failed: ' + e.message) }
} break

case 'wallpaper': {
  await X.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
  if (!text) return reply(`╔══〔 🖼️ WALLPAPER 〕══════╗\n║ *Usage:* ${prefix}wallpaper [keyword]\n║ Example: ${prefix}wallpaper galaxy\n╚═══════════════════════╝`)
  try {
    await reply('🖼️ _Finding wallpaper..._')
    let _wpSent = false
    // Source 1: Keith wallpaper (topic-aware results)
    try {
      const _wpRes = await fetch(`https://apiskeith.top/download/wallpaper?text=${encodeURIComponent(text)}&page=1`, { signal: AbortSignal.timeout(20000) })
      const _wpJson = await _wpRes.json()
      const _wpList = _wpJson?.result
      if (Array.isArray(_wpList) && _wpList.length > 0) {
        const _wpPick = _wpList[Math.floor(Math.random() * _wpList.length)]
        const _wpImgs = _wpPick?.image
        if (Array.isArray(_wpImgs) && _wpImgs.length > 0) {
          const _wpImgUrl = _wpImgs[0]
          const _wpBuf = await fetch(_wpImgUrl, { signal: AbortSignal.timeout(20000) }).then(async r => r.ok ? Buffer.from(await r.arrayBuffer()) : null).catch(() => null)
          if (_wpBuf && _wpBuf.length > 5000) {
            await X.sendMessage(m.chat, { image: _wpBuf, caption: `╔══〔 🖼️ WALLPAPER 〕══════╗\n║ 🔍 *Query:* ${text}\n║ 📸 Source: Keith Wallpapers\n╚═══════════════════════╝` }, { quoted: m })
            _wpSent = true
          } else if (_wpImgUrl) {
            await X.sendMessage(m.chat, { image: { url: _wpImgUrl }, caption: `╔══〔 🖼️ WALLPAPER 〕══════╗\n║ 🔍 *Query:* ${text}\n║ 📸 Source: Keith Wallpapers\n╚═══════════════════════╝` }, { quoted: m })
            _wpSent = true
          }
        }
      }
    } catch {}
    if (_wpSent) break
    // Source 2: Unsplash
    try {
      let r = await fetch(`https://source.unsplash.com/1920x1080/?${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(20000), redirect: 'follow' })
      if (r.ok) {
        let buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 5000) {
          await X.sendMessage(m.chat, { image: buf, caption: `╔══〔 🖼️ WALLPAPER 〕══════╗\n║ 🔍 *Query:* ${text}\n║ 📸 Source: Unsplash\n╚═══════════════════════╝` }, { quoted: m })
          _wpSent = true
        }
      }
    } catch {}
    if (_wpSent) break
    // Source 3: Picsum random
    let r2 = await fetch(`https://picsum.photos/1920/1080`, { signal: AbortSignal.timeout(20000), redirect: 'follow' })
    let buf2 = Buffer.from(await r2.arrayBuffer())
    await X.sendMessage(m.chat, { image: buf2, caption: `╔══〔 🖼️ WALLPAPER 〕══════╗\n║ 🔍 *Query:* ${text}\n║ 📸 Random HD wallpaper\n╚═══════════════════════╝` }, { quoted: m })
  } catch (e) { reply('❌ Wallpaper fetch failed: ' + e.message) }
} break

case 'playstore': {
  await X.sendMessage(m.chat, { react: { text: '🏪', key: m.key } })
  if (!text) return reply(`╔══〔 🏪 PLAY STORE 〕═════╗\n║ *Usage:* ${prefix}playstore [app name]\n║ Example: ${prefix}playstore whatsapp\n╚═══════════════════════╝`)
  try {
    await reply('🏪 _Searching Play Store..._')
    let r = await fetch(`https://play.google.com/store/search?q=${encodeURIComponent(text)}&c=apps&hl=en`, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error('Failed to reach Play Store')
    let link = `https://play.google.com/store/search?q=${encodeURIComponent(text)}&c=apps`
    reply(`╔══〔 🏪 PLAY STORE SEARCH 〕╗\n║ 🔍 *Query:* ${text}\n║\n║ 🔗 ${link}\n║\n║ 💡 _Tap the link to view results_\n╚═══════════════════════╝`)
  } catch (e) { reply(`╔══〔 🏪 PLAY STORE 〕═════╗\n║ 🔍 *Query:* ${text}\n║ 🔗 https://play.google.com/store/search?q=${encodeURIComponent(text)}&c=apps\n╚═══════════════════════╝`) }
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
          // Strip leading "Would you rather [have] " prefix if present
          const _wyrClean = _wyrTxt.replace(/^would you rather\s*/i, '').trim()
          // Split on first " or " and join remainder back for optB
          const _wyrParts = _wyrClean.split(/ or /i)
          const optA = _wyrParts[0].trim().replace(/\?$/, '')
          const optB = _wyrParts.slice(1).join(' or ').trim().replace(/\?$/, '')
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
break

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

}
} catch (err) {  let errMsg = (err.message || '').toLowerCase()
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
