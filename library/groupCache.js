const NodeCache = require('node-cache')

const groupCache    = new NodeCache({ stdTTL: 5 * 60,       useClones: false, checkperiod: 60  })
const lidToJidStore = new NodeCache({ stdTTL: 24 * 60 * 60, useClones: false, checkperiod: 300 })

// ── LID / JID helpers ─────────────────────────────────────────────────────────
const storeLidMapping = (lid, jid) => {
    if (lid && jid && lid.endsWith('@lid') && jid.endsWith('@s.whatsapp.net'))
        lidToJidStore.set(lid, jid)
}
const getLidMapping = (lid) => lidToJidStore.get(lid)

const updateLidMappingsFromMetadata = (meta) => {
    if (!meta?.participants) return
    for (const p of meta.participants) {
        const lid = p.lid || p.id
        const jid = p.pn  || p.jid
        if (lid && jid) storeLidMapping(lid, jid)
    }
}

// ── Resolve LID → real JID from group metadata participants list ───────────────
const getJidFromLidUsingMetadata = (participant, groupMeta) => {
    if (!participant || !groupMeta?.participants) return null
    for (const p of groupMeta.participants) {
        if (p.id === participant || p.lid === participant) {
            const jid = p.pn || p.jid || p.phoneNumber
            if (jid && jid.endsWith('@s.whatsapp.net')) return jid
        }
    }
    return null
}

// ── Full resolution chain: LID store → metadata → X.lidToJid → X.getJidFromLid ─
const getJidFromParticipant = async (X, participant, groupMeta = null) => {
    if (!participant) return participant

    // Already a real JID
    if (participant.endsWith('@s.whatsapp.net')) return participant

    if (participant.endsWith('@lid')) {
        // 1. Check LID store (fastest)
        const stored = getLidMapping(participant)
        if (stored) return stored

        // 2. Check group metadata participants list
        if (groupMeta?.participants) {
            const fromMeta = getJidFromLidUsingMetadata(participant, groupMeta)
            if (fromMeta) return fromMeta
        }

        // 3. Try X.lidToJid() API
        try {
            if (X.lidToJid) {
                const r = await X.lidToJid(participant)
                if (r && r.endsWith('@s.whatsapp.net')) return r
            }
        } catch (_) {}

        // 4. Try X.getJidFromLid() API
        try {
            if (X.getJidFromLid) {
                const r = await X.getJidFromLid(participant)
                if (r && r.endsWith('@s.whatsapp.net')) return r
            }
        } catch (_) {}

        // 5. Fall back to LID as-is
        return participant
    }

    const num = participant.split('@')[0]
    if (num && /^\d+$/.test(num)) return num + '@s.whatsapp.net'
    return participant
}

// ── Event deduplication (prevents duplicate welcome/leave/promote messages) ────
const processedEvents = new Map()
const EVENT_DEDUP_TTL = 5000   // 5 seconds

const getEventKey = (groupJid, action, participants) =>
    `${groupJid}:${action}:${[...participants].sort().join(',')}`

const isDuplicateEvent = (groupJid, action, participants) => {
    const key   = getEventKey(groupJid, action, participants)
    const now   = Date.now()
    const last  = processedEvents.get(key)
    if (last && now - last < EVENT_DEDUP_TTL) return true
    processedEvents.set(key, now)
    // Clean stale entries
    for (const [k, v] of processedEvents)
        if (now - v > EVENT_DEDUP_TTL * 2) processedEvents.delete(k)
    return false
}

// ── Metadata helpers ───────────────────────────────────────────────────────────
const isExpectedError = (msg) =>
    ['forbidden','item-not-found','not-authorized','gone'].some(e => msg?.toLowerCase().includes(e))

const getGroupMetadata = async (X, jid) => {
    if (!jid || !jid.endsWith('@g.us')) return null
    try {
        const cached = groupCache.get(jid)
        if (cached) { updateLidMappingsFromMetadata(cached); return cached }
        const meta = await X.groupMetadata(jid)
        if (meta) { groupCache.set(jid, meta); updateLidMappingsFromMetadata(meta) }
        return meta
    } catch (e) {
        if (!isExpectedError(e.message)) console.error('[groupCache] ' + jid + ': ' + e.message)
        return null
    }
}

const updateGroupCache = (jid, meta) => {
    if (jid && meta) { groupCache.set(jid, meta); updateLidMappingsFromMetadata(meta) }
}

const setupGroupCacheListeners = (X) => {
    X.ev.on('groups.update', async ([event]) => {
        try {
            if (event?.id) updateGroupCache(event.id, await X.groupMetadata(event.id))
        } catch (e) {
            groupCache.del(event?.id)
            if (!isExpectedError(e.message)) console.error('[groupCache] groups.update: ' + e.message)
        }
    })
    X.ev.on('group-participants.update', async (event) => {
        try {
            if (event?.id) updateGroupCache(event.id, await X.groupMetadata(event.id))
        } catch (e) {
            groupCache.del(event?.id)
            if (!isExpectedError(e.message)) console.error('[groupCache] participants.update: ' + e.message)
        }
    })
}

const initializeLidStore = async (X) => {
    try {
        const groups = await X.groupFetchAllParticipating()
        if (groups) {
            for (const jid of Object.keys(groups)) {
                const meta = groups[jid]
                if (meta?.participants) { updateLidMappingsFromMetadata(meta); groupCache.set(jid, meta) }
            }
            console.log('✅ Group cache initialized: ' + Object.keys(groups).length + ' groups, ' + lidToJidStore.keys().length + ' LID mappings')
        }
    } catch (e) { console.log('[groupCache] initializeLidStore: ' + e.message) }
}

module.exports = {
    getGroupMetadata,
    updateGroupCache,
    setupGroupCacheListeners,
    initializeLidStore,
    getLidMapping,
    storeLidMapping,
    getJidFromParticipant,
    getJidFromLidUsingMetadata,
    isDuplicateEvent
}
