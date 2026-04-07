const fs   = require('fs')
const path = require('path')
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json')
const SAVEABLE = [
    'prefix','botname','welcome','goodbye','adminevent','antidelete','antiLink',
    'antitoxic','antibot','fakePresence','autoViewStatus','autoLikeStatus',
    'autoLikeEmoji','statusToGroup','mode','autoRead','chatBot','anticall',
    'antiword','antispam','warn','warnlimit','alive','aliveMsg','aliveMoment',
    'packname','authorname','watermark','botPrefix','statusMentionWarns','statusMentionDeleteList',
    'BOT_MODE','onlyGroup','botPublicMode','ownerFontMode','antilinkGcGroups',
    'antiLinkAction','antiLinkWarnLimit','antiLinkWarns'
]
const loadSettings = () => {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) return
        const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
        let n = 0
        for (const [k, v] of Object.entries(data)) {
            if (k.startsWith('_protected')) continue
            global[k] = v; n++
        }
        if (n > 0) console.log('✅ Settings restored: ' + n + ' values')
    } catch (e) { console.log('[settings] load error: ' + e.message) }
}
const saveSettings = () => {
    try {
        const dir = path.dirname(SETTINGS_FILE)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        const data = {}
        for (const k of SAVEABLE) if (global[k] !== undefined) data[k] = global[k]
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2))
    } catch (e) { console.log('[settings] save error: ' + e.message) }
}
module.exports = { loadSettings, saveSettings }
