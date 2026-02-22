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
const { downloadContentFromMessage, proto, generateWAMessage, getContentType, prepareWAMessageMedia, generateWAMessageFromContent, GroupSettingChange, jidDecode, WAGroupMetadata, emitGroupParticipantsUpdate, emitGroupUpdate, generateMessageID, jidNormalizedUser, generateForwardMessageContent, WAGroupInviteMessageGroupMetadata, GroupMetadata, Headers, delay, WA_DEFAULT_EPHEMERAL, WADefault, getAggregateVotesInPollMessage, generateWAMessageContent, areJidsSameUser, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, makeWaconnet, makeInMemoryStore, MediaType, WAMessageStatus, downloadAndSaveMediaMessage, AuthenticationState, initInMemoryKeyStore, MiscMessageGenerationOptions, useSingleFileAuthState, BufferJSON, WAMessageProto, MessageOptions, WAFlag, WANode, WAMetric, ChatModification, MessageTypeProto, WALocationMessage, ReconnectMode, WAContextInfo, ProxyAgent, waChatKey, MimetypeMap, MediaPathMap, WAContactMessage, WAContactsArrayMessage, WATextMessage, WAMessageContent, WAMessage, BaileysError, WA_MESSAGE_STATUS_TYPE, MediaConnInfo, URL_REGEX, WAUrlInfo, WAMediaUpload, mentionedJid, processTime, Browser, MessageType,
Presence, WA_MESSAGE_STUB_TYPES, Mimetype, relayWAMessage, Browsers, DisconnectReason, WAconnet, getStream, WAProto, isBaileys, AnyMessageContent, templateMessage, InteractiveMessage, Header } = require("gifted-baileys")
const os = require('os')
const fs = require('fs')
const fg = require('api-dylux')
const fetch = require('node-fetch');
const util = require('util')
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
        fileIO, 
        pomfCDN, 
        uploadFile
} = require('./library/scrape/uploader');

module.exports = async (X, m) => {
try {
const from = m.key.remoteJid
var body = (m.mtype === 'interactiveResponseMessage') ? JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : (m.mtype === 'conversation') ? m.message.conversation : (m.mtype == 'imageMessage') ? m.message.imageMessage.caption : (m.mtype == 'videoMessage') ? m.message.videoMessage.caption : (m.mtype == 'extendedTextMessage') ? m.message.extendedTextMessage.text : (m.mtype == 'buttonsResponseMessage') ? m.message.buttonsResponseMessage.selectedButtonId : (m.mtype == 'listResponseMessage') ? m.message.listResponseMessage.singleSelectReply.selectedRowId : (m.mtype == 'templateButtonReplyMessage') ? m.message.templateButtonReplyMessage.selectedId : (m.mtype == 'messageContextInfo') ? (m.message.buttonsResponseMessage?.selectedButtonId || m.message.listResponseMessage?.singleSelectReply?.selectedRowId || m.text) : ""
body = body || ""
//━━━━━━━━━━━━━━━━━━━━━━━━//
// library
const { smsg, fetchJson, getBuffer, fetchBuffer, getGroupAdmins, TelegraPh, isUrl, hitungmundur, sleep, clockString, checkBandwidth, runtime, tanggal, getRandom } = require('./library/lib/myfunc')

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Main Setting (Admin And Prefix ) 
const budy = (typeof m.text === 'string') ? m.text : '';
const prefixRegex = /^[°zZ#$@*+,.?=''():√%!¢£¥€π¤ΠΦ_&><`™©®Δ^βα~¦|/\\©^]/;
const prefix = global.botPrefix ? global.botPrefix : (prefixRegex.test(body) ? body.match(prefixRegex)[0] : '.');
const isCmd = global.botPrefix ? body.startsWith(global.botPrefix) : body.startsWith(prefix);
const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
const args = body.trim().split(/ +/).slice(1)
const text = q = args.join(" ")
const sender = m.key.fromMe ? (X.user.id.split(':')[0]+'@s.whatsapp.net' || X.user.id) : (m.key.participant || m.key.remoteJid)
const botNumber = await X.decodeJid(X.user.id)
const senderNumber = sender.split('@')[0]
const isOwner = (m && m.sender && (
    [botNumber, ...global.owner].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender) ||
    m.key.fromMe ||
    [botNumber, ...global.owner].map(v => v.replace(/[^0-9]/g, '')).includes(m.sender.split('@')[0])
)) || false;
const pushname = m.pushName || `${senderNumber}`
const isBot = botNumber.includes(senderNumber)
const quoted = m.quoted ? m.quoted : m
const mime = (quoted.msg || quoted).mimetype || ''
const groupMetadata = m.isGroup ? await X.groupMetadata(from).catch(e => {}) : ''
const groupName = m.isGroup ? groupMetadata.subject : ''
const participants = m.isGroup ? await groupMetadata.participants : ''
const groupAdmins = m.isGroup ? await getGroupAdmins(participants) : ''
const botLid = X.user?.lid ? X.decodeJid(X.user.lid) : null
const isBotAdmins = m.isGroup ? (groupAdmins.includes(botNumber) || (botLid && groupAdmins.includes(botLid)) || participants.some(p => {
    return (p.id === botNumber || (botLid && p.id === botLid)) && (p.admin === 'admin' || p.admin === 'superadmin')
})) : false
const isAdmins = m.isGroup ? (groupAdmins.includes(m.sender) || participants.some(p => {
    return p.id === m.sender && (p.admin === 'admin' || p.admin === 'superadmin')
})) : false
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Setting Console
if (m.message) {
console.log(chalk.black(chalk.bgWhite('[ New Message ]')), chalk.black(chalk.bgGreen(new Date)), chalk.black(chalk.bgBlue(budy || m.mtype)) + '\n' + chalk.magenta('» Dari'), chalk.green(pushname), chalk.yellow(m.sender) + '\n' + chalk.blueBright('» Di'), chalk.green(m.isGroup ? pushname : 'Private Chat', from))
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
X.sendMessage(from, { text: teks, contextInfo: { 
"externalAdReply": { 
"showAdAttribution": true, 
"title": "TOOSII-XD ULTRA", 
"containsAutoReply": true, 
"mediaType": 1, 
"thumbnail": fakethmb, 
"mediaUrl": "https://t.me/toosiitech", 
"sourceUrl": "https://t.me/toosiitech" }}}, { quoted: m }) }

const reply2 = (teks) => {
X.sendMessage(from, { text : teks }, { quoted : m })
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Function Area
try {
ppuser = await X.profilePictureUrl(m.sender, 'image')
} catch (err) {
ppuser = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png?q=60'
}
ppnyauser = await getBuffer(ppuser)

const reSize = async(buffer, ukur1, ukur2) => {
   return new Promise(async(resolve, reject) => {
      let jimp = require('jimp')
      var baper = await jimp.read(buffer);
      var ab = await baper.resize(ukur1, ukur2).getBufferAsync(jimp.MIME_JPEG)
      resolve(ab)
   })
}
    const fakethmb = await reSize(ppuser, 300, 300)
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
// autoshalat
X.autoshalat = X.autoshalat ? X.autoshalat : {}
        let who = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.fromMe ? X.user.id : m.sender
        let id = m.chat 
    if(id in X.autoshalat) {
    return false
    }
    let jadwalSholat = {
    shubuh: '04:29',
    terbit: '05:44',
    dhuha: '06:02',
    dzuhur: '12:02',
    ashar: '15:15',
    magrib: '18:11',
    isya: '19:01',
    }
    const datek = new Date((new Date).toLocaleString("en-US", {
    timeZone: "Asia/Jakarta"  
    }));
    const hours = datek.getHours();
    const minutes = datek.getMinutes();
    const timeNow = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
    for(let [sholat, waktu] of Object.entries(jadwalSholat)) {
    if(timeNow === waktu) {
    let caption = `Hi ${pushname},\nIt's time for *${sholat}* prayer. Take your ablution and pray.\n\n*${waktu}*\n_For the Sumatra region and surrounding areas._`
    X.autoshalat[id] = [
    reply(caption),
    setTimeout(async () => {
    delete X.autoshalat[m.chat]
    }, 57000)
    ]
    }
    }
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Similarity
function getCaseNames() {
  try {
    const data = fs.readFileSync('./client.js', 'utf8');
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

if (prefix && command) {
  const caseNames = getCaseNames();
  let noPrefix = m.text.replace(prefix, '').trim();
  let mean = didyoumean(noPrefix, caseNames);
  let sim = similarity(noPrefix, mean);
  let similarityPercentage = parseInt(sim * 100);

  if (mean && noPrefix.toLowerCase() !== mean.toLowerCase()) {
    const respony = (`Sorry, invalid command. Did you mean:\n\n➠  *${prefix + mean}*\n➠  *Similarity:* ${similarityPercentage}%`);
    reply(respony);
  }
}
//━━━━━━━━━━━━━━━━━━━━━━━━//
let totalfitur = () =>{
var mytext = fs.readFileSync("./client.js").toString()
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
    const folders = fs.readdirSync(directory)
    folders.forEach(folder => {
        const folderPath = path.join(directory, folder)
        if (fs.lstatSync(folderPath).isDirectory()) {
            const files = fs.readdirSync(folderPath)
            files.forEach(file => {
                const filePath = path.join(folderPath, file)
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
        reaction(m.chat, "❌")
    }
 }
// tes bot no prefix
if ((budy.match) && ["bot",].includes(budy) && !isCmd) {
reply(`bot online ✅`)
}       

//━━━━━━━━━━━━━━━━━━━━━━━━//
// jangan di apa apain
switch(command) {
// awas error
//━━━━━━━━━━━━━━━━━━━━━━━━//
// help command
case 'help': {
const helpText = `┌──────────────────────────────────
│  *TOOSII-XD ULTRA*
│  _Quick Help Guide_
└──────────────────────────────────

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ *Getting Started*
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ *.menu* — View all commands
▸ *.menu ai* — AI tools (ChatGPT, Claude, Gemini)
▸ *.menu tools* — Utility commands
▸ *.menu owner* — Bot settings (owner only)
▸ *.menu group* — Group management
▸ *.menu downloader* — Download media
▸ *.menu search* — Search the web
▸ *.menu sticker* — Sticker tools
▸ *.menu games* — Play games

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ *Popular Commands*
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ *.ai [question]* — Ask AI anything
▸ *.sticker* — Reply to image to make sticker
▸ *.play [song]* — Download music
▸ *.igdl [url]* — Download Instagram post
▸ *.tiktok [url]* — Download TikTok video
▸ *.toimg* — Convert sticker to image

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ *Need More Help?*
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Contact: wa.me/254748340864
▸ Group: https://chat.whatsapp.com/CwNhH3QNvrVFdcKNgaKg4g

──────────────────────────────────
_Powered by Toosii Tech_`
const helpThumb = global.botPic || global.thumb || 'https://files.catbox.moe/qbcebp.jpg'
X.sendMessage(m.chat, { image: { url: helpThumb }, caption: helpText }, { quoted: m })
break
}

// system menu
case 'menu': {
// menu list terpisah
const aiMenu = require('./library/menulist/aimenu');
const toolsMenu = require('./library/menulist/toolsmenu');
const groupMenu = require('./library/menulist/groupmenu');
const ownerMenu = require('./library/menulist/ownermenu');
const searchMenu = require('./library/menulist/searchmenu');
const gameMenu = require('./library/menulist/gamemenu');
const stickerMenu = require('./library/menulist/stickermenu');
const otherMenu = require('./library/menulist/othermenu');
const downloaderMenu = require('./library/menulist/downloadermenu');

  let subcmd = args[0] ? args[0].toLowerCase() : '';

  let infoBot = `
*━━━━━━━━━━━━━━━━━━━━━━*
     *TOOSII-XD ULTRA*
*━━━━━━━━━━━━━━━━━━━━━━*

Hey ${pushname}! ${waktuucapan}

╭──── *About Me* ─────
│ Name    : ${botname}
│ Owner   : ${ownername}
│ Version : ${botver}
│ Mode    : ${typebot}
│ Commands: ${totalfitur()}
│ Contact : +254748340864
│ Telegram: @toosiitech
╰──────────────────────

*Type .menu [category] to filter*
_ai | tools | owner | group | downloader_
_search | sticker | games | other_

*━━━━━ COMMAND LIST ━━━━━*
`.trim();

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
      aiMenu
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
      aiMenu
    ].join('\n');
  }

  let fullMenu = `${infoBot}\n${menu}`;

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
          thumbnail: fs.readFileSync('./media/thumb.png'),
          sourceUrl: wagc,
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
 if (!text) return reply('Please provide a MediaFire link')
reply(global.mess.wait)
  try {
    const api = await fetchJson(`https://api.vreden.web.id/api/mediafiredl?url=${encodeURIComponent(text)}`)
    if (!api.status || !api.result || !api.result[0]) return reply('Failed to get data from API.')

    const data = api.result[0]
    const fileNama = decodeURIComponent(data.nama || 'file.zip')
    const extension = fileNama.split('.').pop().toLowerCase()

    const res = await axios.get(data.link, { responseType: 'arraybuffer' })
    const media = Buffer.from(res.data)

    let mimetype = ''
    if (extension === 'mp4') mimetype = 'video/mp4'
    else if (extension === 'mp3') mimetype = 'audio/mp3'
    else mimetype = `application/${extension}`

    await X.sendMessage(m.chat, {
      document: media,
      fileName: fileNama,
      mimetype: mimetype
    }, { quoted: m })
  } catch (err) {
    console.error(err)
    reply('Download error: ' + err.message)
  }
}
break
case 'ig':
case 'instagram': {
    if (!text) return reply("Please provide the Instagram link");
    reply(global.mess.wait)
    try {
        const mediaUrl = await igdl(text);
        if (!mediaUrl || !mediaUrl[0] || !mediaUrl[0].url) return reply('Failed to download. The link may be invalid.');
        const url_media = mediaUrl[0].url;
        try {
            const response = await axios.head(url_media); 
            const contentType = response.headers['content-type'];
            if (contentType && contentType.startsWith('image/')) {
                await safeSendMedia(m.chat, { image: { url: url_media}, caption: 'Done!' }, {}, { quoted: m });
            } else {
                await safeSendMedia(m.chat, { video: { url: url_media}, caption: 'Done!' }, {}, { quoted: m });
            }
        } catch(e) {
           console.log('IG error:', e.message)
           reply('An error occurred while downloading. Please try again.')
        }
    } catch(e) {
        console.log('IG error:', e.message)
        reply('An error occurred while downloading. Please try again.')
    }
}
break

case 'tt': 
case 'tiktok': {
if (!text) return reply(`Example: ${prefix + command} <tiktok link>`)
reply(global.mess.wait)
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
reply(global.mess.wait)
    try {
      let res = await fdown.download(text);
      if (res && res.length > 0) {
        let videoData = res[0]; 
        let videoUrl = videoData.hdQualityLink || videoData.normalQualityLink; 
        if (videoUrl) {
          let caption = `*Title:* ${videoData.title || '-'}\n*Description:* ${videoData.description || '-'}\n*Duration:* ${videoData.duration || '-'}`;
          await safeSendMedia(m.chat, { 
            video: { url: videoUrl }, 
            caption: caption, 
            mimetype: 'video/mp4'
          }, {}, { quoted: m });
        } else {
          reply('Failed to get video download URL.')
        }
      } else {
        return reply('Failed to download. The link may be invalid.')
      }
    } catch (e) {
      console.log(e);
      reply('An error occurred while downloading. Please try again.')
    }
  }
break
case 'play':
case 'song':
case 'music':
case 'ytplay': {
    if (!text) return reply('What song do you want to search for?\n\nExample: .play Juice WRLD Lucid Dreams')
    reply(global.mess.wait)
    try {
        let search = await yts(text);
        if (!search || !search.all || !search.all.length) return reply('No results found.')
        let firstVideo = search.all.find(v => v.type === 'video') || search.all[0];
        let videoTitle = firstVideo.title || 'Unknown Title'
        let videoAuthor = firstVideo.author?.name || firstVideo.author || 'Unknown Artist'
        let caption = `*${videoTitle}*\nArtist: ${videoAuthor}\nDuration: ${firstVideo.timestamp}\nViews: ${firstVideo.views}\nURL: ${firstVideo.url}`;

        let tmpBase = `./tmp/play_${Date.now()}`
        let tmpFile = `${tmpBase}.mp3`
        let downloaded = false
        let ytdlpBin = '/home/runner/workspace/.pythonlibs/bin/yt-dlp'
        if (!fs.existsSync(ytdlpBin)) ytdlpBin = 'yt-dlp'
        try {
            await new Promise((resolve, reject) => {
                exec(`${ytdlpBin} -x --audio-format mp3 --audio-quality 0 --no-playlist --max-filesize 50M -o "${tmpBase}.%(ext)s" "${firstVideo.url}"`, { timeout: 120000 }, (err) => {
                    if (err) reject(err)
                    else resolve()
                })
            })
            if (!fs.existsSync(tmpFile)) {
                let baseName = path.basename(tmpBase)
                let candidates = fs.readdirSync('./tmp').filter(f => f.startsWith(baseName))
                if (candidates.length > 0) tmpFile = `./tmp/${candidates[0]}`
            }
            downloaded = true
        } catch (dlErr) {
            console.log('yt-dlp download failed:', dlErr.message)
        }

        if (downloaded && fs.existsSync(tmpFile)) {
            let audioBuffer = fs.readFileSync(tmpFile)
            let cleanName = `${videoAuthor} - ${videoTitle}.mp3`.replace(/[<>:"/\\|?*]/g, '')
            await X.sendMessage(m.chat, {
                document: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: cleanName,
                contextInfo: {
                    externalAdReply: {
                        showAdAttribution: true,
                        title: videoTitle,
                        body: videoAuthor,
                        sourceUrl: firstVideo.url,
                        thumbnailUrl: firstVideo.thumbnail || '',
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m })
            try { fs.unlinkSync(tmpFile) } catch(e) {}
        } else {
            try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile) } catch(e) {}
            reply(caption + '\n\nAudio download failed. Use the link above.')
        }
    } catch (e) {
        console.log(e)
        reply('An error occurred while searching. Please try again.')
    }
}
break;
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Other Features
case 'owner': case 'botowner':
let namaown = `Toosii Tech`
var contact = generateWAMessageFromContent(m.chat, proto.Message.fromObject({
"contactMessage": {
"displayName": `${namaown}`,
"vcard": `BEGIN:VCARD\nVERSION:3.0\nN:;;;;\nFN:Toosii Tech\nitem1.TEL;waid=254748340864:+254748340864\nitem1.X-ABLabel:Ponsel\nX-WA-BIZ-DESCRIPTION:${ownername}\nX-WA-BIZ-NAME: ${namaown}\nEND:VCARD`,
}
}), { userJid: m.chat, quoted: m })
X.relayMessage(m.chat, contact.message, { messageId: contact.key.id })
break

case 'sc': {
reply(`TOOSII-XD ULTRA Bot\nContact: https://wa.me/254748340864\nTelegram: https://t.me/toosiitech`)
}
break

case 'infobot':
case 'botinfo': {
// wait message
reply(global.mess.wait)
  const botInfo = `
╭─ ⌬ Bot Info
│ • Name    : ${botname}
│ • Owner   : ${ownername}
│ • Version  : ${botver}
│ • Command : ${totalfitur()}
│ • Runtime  : ${runtime(process.uptime())}\n╰─────────────
`
  reply(botInfo)
}
break
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Sticker Features
case 'bratvid':
case 'bratv':
case 'bratvideo': {
  if (!text) return reply(`Example: ${prefix + command} hai bang`)
  if (text.length > 250) return reply(`Character limit exceeded, max 250!`)
// wait message
reply(global.mess.wait)
  const words = text.split(" ")
  const tempDir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)
  const framePaths = []

  try {
    for (let i = 0; i < words.length; i++) {
      const currentText = words.slice(0, i + 1).join(" ")

      const res = await axios.get(
        `https://brat.caliphdev.com/api/brat?text=${encodeURIComponent(currentText)}`,
        { responseType: "arraybuffer" }
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

    await X.sendImageAsSticker(m.chat, outputVideoPath, m, {
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
if (!q) return reply(`Please enter text\n\nExample: ${prefix + command} alok hamil`);
// wait message
reply(global.mess.wait)
let rulz = `https://aqul-brat.hf.space/api/brat?text=${encodeURIComponent(q)}`;
try {
const res = await axios.get(rulz, { responseType: 'arraybuffer' });
const buffer = Buffer.from(res.data, 'binary');
await X.sendImageAsSticker(m.chat, buffer, m, { packname: ``, author: `${global.author}` });
} catch (e) {
console.log(e);
await reply(`API is currently down or under maintenance. Please try again later.`);
    }
}
break

case 'emojimix': {
    if (!text) return reply(`Enter two emojis to mix\n\nExample: ${prefix + command} [emoji1]+[emoji2]`);

    const emojis = text.split(/[\+\|]/);
    if (emojis.length !== 2) return reply('Please enter two valid emojis, example: +  or |');
// wait message
reply(global.mess.wait)
    const text1 = emojis[0].trim();
    const text2 = emojis[1].trim();
 
    let api = `https://fastrestapis.fasturl.cloud/maker/emojimix?emoji1=${text1}&emoji2=${text2}`;
    await X.sendImageAsSticker(m.chat, api, m, { packname: '', author: `${packname}` });
}
break;
case 'qc': {
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
// wait message
reply(global.mess.wait)
    let ppnyauser = await X.profilePictureUrl(m.sender, 'image').catch(_ => 'https://files.catbox.moe/nwvkbt.png');
    const rest = await quote(text, pushname, ppnyauser);
    X.sendImageAsSticker(m.chat, rest.result, m, {
        packname: ``,
        author: `${global.author}`
    });
}
break
case 'sticker':
case 'stiker':
case 's':{
if (!quoted) return reply(`Reply to Video/Image with caption ${prefix + command}`)
// wait message
reply(global.mess.wait)
if (/image/.test(mime)) {
let media = await quoted.download()
let encmedia = await X.sendImageAsSticker(m.chat, media, m, {
packname: global.packname,
author: global.author
})
} else if (/video/.test(mime)) {
if ((quoted.msg || quoted).seconds > 31) return reply('Maximum 30 seconds!')
let media = await quoted.download()
let encmedia = await X.sendVideoAsSticker(m.chat, media, m, {
packname: global.packname,
author: global.author
})
} else {
return reply(`Send an Image/Video with caption ${prefix + command}\nVideo duration: 1-9 seconds`)
}
}
break
//━━━━━━━━━━━━━━━━━━━━━━━━//
// View Once Opener
case 'vv': {
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
reply(global.mess.wait)
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

case 'fakerecording':
case 'fakerecord':
case 'frecord': {
if (!isOwner) return reply(mess.OnlyOwner)
if (global.fakePresence === 'recording') {
    global.fakePresence = 'off'
    reply('Fake recording *OFF*\nBot will no longer appear as recording.')
} else {
    global.fakePresence = 'recording'
    reply('Fake recording *ON*\nBot will now appear as *recording audio* whenever someone messages.')
}
}
break

case 'faketyping':
case 'faketype':
case 'ftype': {
if (!isOwner) return reply(mess.OnlyOwner)
if (global.fakePresence === 'typing') {
    global.fakePresence = 'off'
    reply('Fake typing *OFF*\nBot will no longer appear as typing.')
} else {
    global.fakePresence = 'typing'
    reply('Fake typing *ON*\nBot will now appear as *typing* whenever someone messages.')
}
}
break

case 'fakeonline':
case 'fonline': {
if (!isOwner) return reply(mess.OnlyOwner)
if (global.fakePresence === 'online') {
    global.fakePresence = 'off'
    reply('Fake online *OFF*\nBot will no longer force online status.')
} else {
    global.fakePresence = 'online'
    reply('Fake online *ON*\nBot will now appear *online* whenever someone messages.')
}
}
break

case 'fakestatus':
case 'fpresence': {
if (!isOwner) return reply(mess.OnlyOwner)
let current = global.fakePresence || 'off'
reply(`*Fake Presence Status*\nCurrent mode: *${current}*\n\nAvailable commands:\n• ${prefix}faketyping - Toggle auto typing\n• ${prefix}fakerecord - Toggle auto recording\n• ${prefix}fakeonline - Toggle auto online\n\nUse any command again to turn it off.`)
}
break

case 'autoviewstatus':
case 'autoview':
case 'avs': {
if (!isOwner) return reply(mess.OnlyOwner)
if (global.autoViewStatus) {
    global.autoViewStatus = false
    reply('*Auto View Status OFF*\nBot will no longer auto-view contact statuses.')
} else {
    global.autoViewStatus = true
    reply('*Auto View Status ON*\nBot will now automatically view all contact statuses.')
}
}
break

case 'autolikestatus':
case 'autolike':
case 'als': {
if (!isOwner) return reply(mess.OnlyOwner)
let emojiArg = (args.join(' ') || '').trim()
if (!emojiArg) {
    let statusMsg = global.autoLikeStatus ? 'ON' : 'OFF'
    let currentEmoji = global.autoLikeEmoji || 'Not set'
    reply(`*Auto Like Status: ${statusMsg}*\nCurrent emoji: ${currentEmoji}\n\n*Usage:*\n• ${prefix}autolikestatus [emoji] - Set emoji and turn ON\n• ${prefix}autolikestatus off - Turn OFF\n• ${prefix}autolikestatus - Check status\n\n*Examples:*\n• ${prefix}autolikestatus \u2764\uFE0F\n• ${prefix}autolikestatus \uD83D\uDD25\n• ${prefix}autolikestatus \uD83D\uDE02\n• ${prefix}autolikestatus \uD83D\uDC4D\n• ${prefix}autolikestatus off`)
} else if (emojiArg.toLowerCase() === 'off') {
    global.autoLikeStatus = false
    global.autoLikeEmoji = ''
    reply('*Auto Like Status OFF*\nBot will no longer auto-react to contact statuses.')
} else {
    global.autoLikeEmoji = emojiArg
    global.autoLikeStatus = true
    reply(`*Auto Like Status ON*\nBot will react to all contact statuses with: ${emojiArg}`)
}
}
break

case 'statusconfig':
case 'autostatus': {
if (!isOwner) return reply(mess.OnlyOwner)
let viewState = global.autoViewStatus ? 'ON' : 'OFF'
let likeActive = global.autoLikeStatus && global.autoLikeEmoji
let likeState = likeActive ? 'ON' : 'OFF'
let emojiState = global.autoLikeEmoji || 'Not set'
let fwdState = global.statusToGroup ? 'ON' : 'OFF'
let fwdGroup = global.statusToGroup || 'Not set'
reply(`*Status Auto-Actions Config*\n\n• Auto View: *${viewState}*\n• Auto Like: *${likeState}*\n• Like Emoji: *${emojiState}*\n• Forward to Group: *${fwdState}*\n• Target Group: *${fwdGroup}*\n\n*Commands:*\n• ${prefix}autoviewstatus - Toggle auto view\n• ${prefix}autolikestatus [emoji] - Set emoji & enable\n• ${prefix}autolikestatus off - Turn off auto like\n• ${prefix}togroupstatus - Toggle status forwarding to current group\n• ${prefix}togroupstatus off - Disable forwarding`)
}
break

case 'togroupstatus':
case 'statustogroup':
case 'fwdstatus': {
if (!isOwner) return reply(mess.OnlyOwner)
let statusArg = (args.join(' ') || '').trim().toLowerCase()
if (statusArg === 'off' || statusArg === 'disable') {
    global.statusToGroup = ''
    reply('*Status Forwarding OFF*\nContact statuses will no longer be forwarded to any group.')
} else if (m.isGroup) {
    global.statusToGroup = m.chat
    let gName = groupName || m.chat
    reply(`*Status Forwarding ON*\nAll contact statuses (images, videos, text) will now be forwarded to this group: *${gName}*`)
} else {
    if (global.statusToGroup) {
        reply(`*Status Forwarding is ON*\nCurrently forwarding to: *${global.statusToGroup}*\n\n• Use in a group to change target\n• ${prefix}togroupstatus off - Disable`)
    } else {
        reply(`*Status Forwarding is OFF*\n\nUse this command inside a group chat to set it as the target for status forwarding.\n\n• ${prefix}togroupstatus off - Disable`)
    }
}
}
break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Developer tools
case 'self': {
if (!isOwner) return reply(mess.OnlyOwner)
X.public = false
reply('Changed to Self Mode')
}
break

case 'public': {
if (!isOwner) return reply(mess.OnlyOwner)
X.public = true
reply('Changed to Public Mode')
}
break

case 'join': {
if (!isOwner) return reply(mess.OnlyOwner)
if (!q) return reply(`*Usage:* ${prefix}join [group invite link]\n\n*Example:*\n${prefix}join https://chat.whatsapp.com/AbCdEfGhIjK`)
let linkMatch = q.match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/)
if (!linkMatch) return reply('Invalid group invite link. Please send a valid WhatsApp group link.')
try {
    let joinResult = await X.groupAcceptInvite(linkMatch[1])
    reply(`Successfully joined group!\nGroup ID: ${joinResult}`)
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

case 'setprefix': {
if (!isOwner) return reply(mess.OnlyOwner)
let newPrefix = (args[0] || '').trim()
if (!newPrefix) {
    let currentPfx = global.botPrefix || 'Multi-prefix (auto-detect)'
    reply(`*Current Prefix:* ${currentPfx}\n\n*Usage:*\n• ${prefix}setprefix [character] - Set a specific prefix\n• ${prefix}setprefix reset - Reset to multi-prefix mode\n\n*Examples:*\n• ${prefix}setprefix .\n• ${prefix}setprefix /\n• ${prefix}setprefix #\n• ${prefix}setprefix !\n• ${prefix}setprefix reset`)
} else if (newPrefix.toLowerCase() === 'reset' || newPrefix.toLowerCase() === 'multi') {
    global.botPrefix = ''
    reply('*Prefix Reset*\nBot now accepts multiple prefixes: . / # ! $ + , etc.')
} else {
    global.botPrefix = newPrefix.charAt(0)
    reply(`*Prefix Changed*\nBot prefix is now: *${global.botPrefix}*\n\nAll commands must start with *${global.botPrefix}* (e.g. ${global.botPrefix}menu, ${global.botPrefix}help)`)
}
}
break

// Bot Configuration Commands
case 'botname': {
if (!isOwner) return reply(mess.OnlyOwner)
let newName = args.join(' ').trim()
if (!newName) return reply(`*Current Bot Name:* ${global.botname}\n\nUsage: ${prefix}botname [new name]`)
global.botname = newName
reply(`*Bot Name Updated*\nNew name: *${newName}*`)
}
break

case 'setauthor':
case 'author': {
if (!isOwner) return reply(mess.OnlyOwner)
let newAuthor = args.join(' ').trim()
if (!newAuthor) return reply(`*Current Sticker Author:* ${global.author}\n\nUsage: ${prefix}author [name]`)
global.author = newAuthor
reply(`*Sticker Author Updated*\nNew author: *${newAuthor}*`)
}
break

case 'setpackname':
case 'packname': {
if (!isOwner) return reply(mess.OnlyOwner)
let newPack = args.join(' ').trim()
if (!newPack) return reply(`*Current Sticker Pack:* ${global.packname}\n\nUsage: ${prefix}packname [name]`)
global.packname = newPack
reply(`*Sticker Pack Name Updated*\nNew pack: *${newPack}*`)
}
break

case 'timezone':
case 'settz': {
if (!isOwner) return reply(mess.OnlyOwner)
let tz = args.join(' ').trim()
if (!tz) return reply(`*Current Timezone:* ${global.botTimezone}\n\nUsage: ${prefix}timezone [timezone]\n\nExamples:\n${prefix}timezone Africa/Nairobi\n${prefix}timezone Asia/Jakarta\n${prefix}timezone America/New_York`)
global.botTimezone = tz
reply(`*Timezone Updated*\nNew timezone: *${tz}*\nCurrent time: *${moment().tz(tz).format('HH:mm:ss DD/MM/YYYY')}*`)
}
break

case 'botpic':
case 'setbotpic': {
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
    reply(`*Bot Thumbnail Updated*\nNew URL: ${picUrl}`)
} else {
    reply(`*Bot Picture*\nCurrent thumbnail: ${global.thumb}\n\nUsage:\n${prefix}botpic [url] - Set thumbnail URL\nReply to an image with ${prefix}botpic - Set WhatsApp profile picture`)
}
}
break

case 'boturl':
case 'setboturl': {
if (!isOwner) return reply(mess.OnlyOwner)
let newUrl = args.join(' ').trim()
if (!newUrl) return reply(`*Current Bot URL:* ${global.botUrl || global.wagc}\n\nUsage: ${prefix}boturl [url]`)
global.botUrl = newUrl
global.wagc = newUrl
reply(`*Bot URL Updated*\nNew URL: *${newUrl}*`)
}
break

case 'anticall':
case 'setanticall': {
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
if (!isOwner) return reply(mess.OnlyOwner)
let cbArg = (args[0] || '').toLowerCase()
if (!cbArg) {
    let cbState = global.chatBot ? 'ON' : 'OFF'
    reply(`*ChatBot Mode: ${cbState}*\nWhen ON, the bot will automatically reply to all non-command messages using AI.\n\nUsage:\n${prefix}chatbot on\n${prefix}chatbot off`)
} else if (cbArg === 'on' || cbArg === 'enable') {
    global.chatBot = true
    reply('*ChatBot Mode ON*\nBot will auto-reply to all messages using AI.')
} else if (cbArg === 'off' || cbArg === 'disable') {
    global.chatBot = false
    reply('*ChatBot Mode OFF*')
}
}
break

case 'autobio':
case 'setautobio': {
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
    reply(`*Auto Reply Status ON*\nBot will reply to status updates with:\n"${arsArg}"`)
}
}
break

case 'antistatusmention':
case 'antismention': {
if (!isOwner) return reply(mess.OnlyOwner)
let asmArg = (args[0] || '').toLowerCase()
if (!asmArg) {
    let asmState = global.antiStatusMention ? 'ON' : 'OFF'
    let asmAction = global.antiStatusMentionAction || 'warn'
    reply(`*Anti Status Mention*\n\nStatus: *${asmState}*\nAction: *${asmAction}*\n\nWhen someone mentions a group in their status, the bot will take action against them in that group.\n\n*Usage:*\n${prefix}antistatusmention on\n${prefix}antistatusmention off\n${prefix}antistatusmention warn - Warn the user (3 warns = kick)\n${prefix}antistatusmention delete - Delete their messages in the group\n${prefix}antistatusmention kick - Remove them from the group\n\n_Current action: ${asmAction}_`)
} else if (asmArg === 'on' || asmArg === 'enable') {
    global.antiStatusMention = true
    reply(`*Anti Status Mention ON*\nAction: *${global.antiStatusMentionAction || 'warn'}*\nAnyone who mentions a group in their status will be actioned.`)
} else if (asmArg === 'off' || asmArg === 'disable') {
    global.antiStatusMention = false
    reply('*Anti Status Mention OFF*')
} else if (asmArg === 'warn') {
    global.antiStatusMention = true
    global.antiStatusMentionAction = 'warn'
    reply('*Anti Status Mention: WARN*\nUsers who mention a group in their status will be warned. 3 warnings = auto-kick.')
} else if (asmArg === 'delete' || asmArg === 'del') {
    global.antiStatusMention = true
    global.antiStatusMentionAction = 'delete'
    reply('*Anti Status Mention: DELETE*\nMessages from users who mention a group in their status will be deleted in that group.')
} else if (asmArg === 'kick' || asmArg === 'remove') {
    global.antiStatusMention = true
    global.antiStatusMentionAction = 'kick'
    reply('*Anti Status Mention: KICK*\nUsers who mention a group in their status will be removed from that group.')
}
}
break

case 'antilink':
case 'setantilink': {
if (!m.isGroup) return reply(mess.OnlyGrup)
if (!isAdmins && !isOwner) return reply(mess.admin)
let alArg = (args[0] || '').toLowerCase()
if (!alArg) {
    let alState = global.antiLink ? 'ON' : 'OFF'
    reply(`*Anti-Link: ${alState}*\nWhen ON, messages containing links are deleted and the sender is warned.\n\nUsage:\n${prefix}antilink on\n${prefix}antilink off`)
} else if (alArg === 'on' || alArg === 'enable') {
    global.antiLink = true
    reply('*Anti-Link ON*\nMessages with links will be deleted. Bot must be admin.')
} else if (alArg === 'off' || alArg === 'disable') {
    global.antiLink = false
    reply('*Anti-Link OFF*')
}
}
break

case 'antidelete':
case 'setantidelete': {
if (!isOwner) return reply(mess.OnlyOwner)
let adArg = (args[0] || '').toLowerCase()
if (!adArg) {
    let adState = global.antiDelete ? 'ON' : 'OFF'
    reply(`*Anti-Delete: ${adState}*\nWhen ON, deleted messages are forwarded to the owner.\n\nUsage:\n${prefix}antidelete on\n${prefix}antidelete off`)
} else if (adArg === 'on' || adArg === 'enable') {
    global.antiDelete = true
    reply('*Anti-Delete ON*\nDeleted messages will be forwarded to the owner.')
} else if (adArg === 'off' || adArg === 'disable') {
    global.antiDelete = false
    reply('*Anti-Delete OFF*')
}
}
break

case 'botsettings':
case 'settings':
case 'botconfig': {
if (!isOwner) return reply(mess.OnlyOwner)
let settingsText = `*${global.botname} - Settings*\n\n`
settingsText += `*Bot Info*\n`
settingsText += `- Name: ${global.botname}\n`
settingsText += `- Version: ${global.botver}\n`
settingsText += `- Prefix: ${global.botPrefix || 'Multi-prefix'}\n`
settingsText += `- Timezone: ${global.botTimezone}\n`
settingsText += `- Mode: ${X.public ? 'Public' : 'Self'}\n`
settingsText += `- URL: ${global.botUrl || global.wagc}\n\n`
settingsText += `*Sticker*\n`
settingsText += `- Pack: ${global.packname}\n`
settingsText += `- Author: ${global.author}\n\n`
settingsText += `*Auto Features*\n`
settingsText += `- Auto Read: ${global.autoRead ? 'ON' : 'OFF'}\n`
settingsText += `- Auto Bio: ${global.autoBio ? 'ON' : 'OFF'}\n`
settingsText += `- ChatBot: ${global.chatBot ? 'ON' : 'OFF'}\n`
settingsText += `- Auto View Status: ${global.autoViewStatus ? 'ON' : 'OFF'}\n`
settingsText += `- Auto Like Status: ${global.autoLikeStatus ? 'ON' : 'OFF'} ${global.autoLikeEmoji ? '(' + global.autoLikeEmoji + ')' : ''}\n`
settingsText += `- Auto Reply Status: ${global.autoReplyStatus ? 'ON' : 'OFF'}\n`
settingsText += `- Forward Status: ${global.statusToGroup ? 'ON' : 'OFF'}\n`
settingsText += `- Fake Presence: ${global.fakePresence}\n\n`
settingsText += `*Protection*\n`
settingsText += `- Anti-Call: ${global.antiCall ? 'ON' : 'OFF'}\n`
settingsText += `- Anti-Link: ${global.antiLink ? 'ON' : 'OFF'}\n`
settingsText += `- Anti-Delete: ${global.antiDelete ? 'ON' : 'OFF'}\n`
settingsText += `- Anti Status Mention: ${global.antiStatusMention ? 'ON' : 'OFF'}\n\n`
settingsText += `*Group*\n`
settingsText += `- Welcome: ${global.welcome ? 'ON' : 'OFF'}\n`
settingsText += `- Admin Events: ${global.adminevent ? 'ON' : 'OFF'}`
reply(settingsText)
}
break

case 'restart':
if (!isOwner) return reply(mess.OnlyOwner)
reply(`Restarting...`)
await sleep(3000)
process.exit()
break

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
await reply(`A new plugin has been created in ${pluginFilePath}.`)
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
await reply(`The plugin in ${filePath} has been replaced`)
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
await reply(`The plugin in ${filePath} has been removed.`)
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
await reply(`Successfully retrieved plugin '${q}', plugin has been submitted.`)
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
                  let welState = global.welcome ? 'ON' : 'OFF'
                  reply(`*Welcome/Goodbye Messages: ${welState}*\n\nUsage:\n${prefix}${command} on - Enable\n${prefix}${command} off - Disable`)
               } else if (welArg === 'on' || welArg === 'enable' || welArg === 'hidup') {
                  global.welcome = true
                  reply('*Welcome/Goodbye Messages ON*\nNew members will be greeted and departures announced.')
               } else if (welArg === 'off' || welArg === 'disable' || welArg === 'mati') {
                  global.welcome = false
                  reply('*Welcome/Goodbye Messages OFF*')
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
                  let evState = global.adminevent ? 'ON' : 'OFF'
                  reply(`*Admin Events (Promote/Demote): ${evState}*\n\nUsage:\n${prefix}${command} on - Enable\n${prefix}${command} off - Disable`)
               } else if (evArg === 'on' || evArg === 'enable' || evArg === 'hidup') {
                  global.adminevent = true
                  reply('*Admin Events ON*\nPromote/demote notifications will be sent in the group.')
               } else if (evArg === 'off' || evArg === 'disable' || evArg === 'mati') {
                  global.adminevent = false
                  reply('*Admin Events OFF*')
               }
            }
            break
            
            
                        case 'add': {
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isAdmins && !isOwner) return reply(mess.admin);
                                if (!isBotAdmins) return reply(mess.botAdmin);
                                if (!text && !m.quoted) {
                                        reply(`_Example :_\n\n ${prefix + command} 62xxx`);
                                } else {
                                        const numbersOnly = text ? text.replace(/\D/g, '') + '@s.whatsapp.net' : m.quoted?.sender;
                                        try {
                                                await X.groupParticipantsUpdate(m.chat, [numbersOnly], 'add')
                                                        .then(async (res) => {
                                                                for (let i of res) {
                                                                        let invv = await X.groupInviteCode(m.chat);
                                                                        if (i.status == 408) return reply(`_[ Error ]_ User recently left the group`);
                                                                        if (i.status == 401) return reply(`_] Error ]_ Bot is blocked by user`);
                                                                        if (i.status == 409) return reply(`_[ Report ]_ User is already in the group`);
                                                                        if (i.status == 500) return reply(`_[ Invalid ]_ Group is full`);
                                                                        if (i.status == 403) {
                                                                                await X.sendMessage(m.chat, { 
                                                                                        text: `@${numbersOnly.split('@')[0]} Target cannot be added because their account is private. Sending an invite to their private chat`, 
                                                                                        mentions: [numbersOnly] 
                                                                                }, { quoted: m });
                                                                                await X.sendMessage(`${numbersOnly ? numbersOnly : creator}`, { 
                                                                                        text: `${'https://chat.whatsapp.com/' + invv}\n━━━━━━━━━━━━━━━━━━━━━\n\nAdmin: wa.me/${m.sender}\n Has Invited You To This Group`, 
                                                                                        detectLink: true, 
                                                                                        mentions: [numbersOnly] 
                                                                                }, { quoted: floc2 }).catch((err) => reply('Failed to send invite! 😔'));
                                                                        } else {
                                                                                reply(mess.succes);
                                                                        }
                                                                }
                                                        });
                                        } catch (e) {
                                                reply('Failed to add user, something went wrong!');
                                        }
                                }
                        }
                        break;

                        case 'kick':
                        case 'remove': {
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isOwner && !isAdmins) return reply(mess.admin);
                                if (!isBotAdmins) return reply(mess.botAdmin);
                                let users = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null;
                                if (!users) return reply(`*Usage:* ${prefix + command} @user or reply to their message`);
                                if (owner.includes(users.replace('@s.whatsapp.net', ''))) {
                                        return reply('Cannot remove the bot owner.');
                                }
                                try {
                                        await X.groupParticipantsUpdate(m.chat, [users], 'remove');
                                        let num = users.split('@')[0]
                                        X.sendMessage(from, { text: `*@${num} has been removed from the group.*`, mentions: [users] }, { quoted: m })
                                } catch (err) {
                                        console.error(err);
                                        reply(mess.error);
                                }
                        };
                        break;

                        case 'del':
                        case 'delete': {
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isOwner && !isAdmins) return reply(mess.admin);
                                if (!isBotAdmins) return reply(mess.botAdmin);
                                if (!m.quoted) return reply(`*Usage:* Reply to a message with ${prefix + command} to delete it.`);
                                try {
                                        await X.sendMessage(m.chat, { delete: m.quoted.key });
                                } catch (err) {
                                        reply('Failed to delete message. Make sure the bot is an admin.');
                                }
                        }
                        break;

                        case 'warn': {
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isOwner && !isAdmins) return reply(mess.admin);
                                if (!isBotAdmins) return reply(mess.botAdmin);
                                let warnUser = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null;
                                if (!warnUser) return reply(`*Usage:* ${prefix}warn @user [reason]\nReply to a message or mention someone.`);
                                if (owner.includes(warnUser.replace('@s.whatsapp.net', ''))) return reply('Cannot warn the bot owner.');
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
                                        X.sendMessage(from, { text: `*@${warnNum} has reached ${maxWarns}/${maxWarns} warnings and has been removed from the group.*\n\nReason: ${warnReason}`, mentions: [warnUser] }, { quoted: m });
                                    } catch { reply(mess.error); }
                                } else {
                                    X.sendMessage(from, { text: `*Warning ${warnCount}/${maxWarns} for @${warnNum}*\nReason: ${warnReason}\n\n_${maxWarns - warnCount} more warning(s) before removal._`, mentions: [warnUser] }, { quoted: m });
                                }
                        }
                        break;

                        case 'unwarn':
                        case 'resetwarn': {
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isOwner && !isAdmins) return reply(mess.admin);
                                let uwUser = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null;
                                if (!uwUser) return reply(`*Usage:* ${prefix}unwarn @user\nReply to a message or mention someone.`);
                                let uwDbPath = path.join(__dirname, 'database', 'warnings.json');
                                let uwDb = {};
                                try { uwDb = JSON.parse(fs.readFileSync(uwDbPath, 'utf-8')); } catch { uwDb = {}; }
                                if (uwDb[m.chat] && uwDb[m.chat][uwUser]) {
                                    uwDb[m.chat][uwUser] = [];
                                    fs.writeFileSync(uwDbPath, JSON.stringify(uwDb, null, 2));
                                    let uwNum = uwUser.split('@')[0];
                                    X.sendMessage(from, { text: `*Warnings cleared for @${uwNum}.*`, mentions: [uwUser] }, { quoted: m });
                                } else {
                                    reply('This user has no warnings.');
                                }
                        }
                        break;

                        case 'warnlist':
                        case 'warnings': {
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isOwner && !isAdmins) return reply(mess.admin);
                                let wlDbPath = path.join(__dirname, 'database', 'warnings.json');
                                let wlDb = {};
                                try { wlDb = JSON.parse(fs.readFileSync(wlDbPath, 'utf-8')); } catch { wlDb = {}; }
                                let groupWarns = wlDb[m.chat] || {};
                                let warnEntries = Object.entries(groupWarns).filter(([, w]) => w.length > 0);
                                if (warnEntries.length === 0) return reply('No warnings in this group.');
                                let warnListText = `*Group Warnings*\n\n`;
                                let warnMentions = [];
                                for (let [jid, warns] of warnEntries) {
                                    let num = jid.split('@')[0];
                                    warnMentions.push(jid);
                                    warnListText += `@${num} - ${warns.length}/3 warnings\n`;
                                    warns.forEach((w, i) => {
                                        warnListText += `  ${i + 1}. ${w.reason} (${new Date(w.time).toLocaleDateString()})\n`;
                                    });
                                    warnListText += '\n';
                                }
                                X.sendMessage(from, { text: warnListText.trim(), mentions: warnMentions }, { quoted: m });
                        }
                        break;

                        case 'promote': {
                                if (!m.isGroup) return reply(mess.OnlyGrup)
                                if (!isOwner && !isAdmins) return reply(mess.admin)
                                if (!isBotAdmins) return reply(mess.botAdmin)
                                let users = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null
                                if (!users) return reply(`*Example:* ${prefix + command} @user or reply to their message`)
                                await X.groupParticipantsUpdate(m.chat, [users], 'promote').then((res) => {
                                    let num = users.split('@')[0]
                                    X.sendMessage(from, { text: `*✅ @${num} has been promoted to admin!*`, mentions: [users] }, { quoted: m })
                                }).catch((err) => reply(mess.error))
                        }
                        break

                        case 'demote': {
                                if (!m.isGroup) return reply(mess.OnlyGrup)
                                if (!isOwner && !isAdmins) return reply(mess.admin)
                                if (!isBotAdmins) return reply(mess.botAdmin)
                                let users = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null
                                if (!users) return reply(`*Example:* ${prefix + command} @user or reply to their message`)
                                await X.groupParticipantsUpdate(m.chat, [users], 'demote').then((res) => {
                                    let num = users.split('@')[0]
                                    X.sendMessage(from, { text: `*✅ @${num} has been demoted from admin.*`, mentions: [users] }, { quoted: m })
                                }).catch((err) => reply(mess.error))
                        }
                        break

                        case 'revoke':{
                                if (!m.isGroup) return reply(mess.OnlyGrup);
                                if (!isAdmins && !isOwner) return reply(mess.admin);
                                if (!isBotAdmins) return reply(mess.botAdmin);
                                await X.groupRevokeInvite(m.chat)
                                        .then(res => {
                                                reply(mess.succes)
                                        }).catch(() => reply(mess.error))
                                }
                                break

                        case 'approve':
                        case 'acceptjoin': {
                                if (!m.isGroup) return reply(mess.OnlyGrup)
                                if (!isAdmins && !isOwner) return reply(mess.admin)
                                if (!isBotAdmins) return reply(mess.botAdmin)
                                try {
                                        let pending = await X.groupRequestParticipantsList(m.chat)
                                        if (!pending || pending.length === 0) return reply('No pending join requests.')
                                        if (text && text.toLowerCase() === 'all') {
                                                let jids = pending.map(p => p.jid)
                                                await X.groupRequestParticipantsUpdate(m.chat, jids, 'approve')
                                                reply(`Approved all *${jids.length}* pending join request(s).`)
                                        } else if (text) {
                                                let target = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
                                                let found = pending.find(p => p.jid === target)
                                                if (!found) return reply(`That number is not in the pending requests.\n\nPending: ${pending.map(p => p.jid.split('@')[0]).join(', ')}`)
                                                await X.groupRequestParticipantsUpdate(m.chat, [target], 'approve')
                                                reply(`Approved @${target.split('@')[0]}`)
                                        } else {
                                                let list = pending.map((p, i) => `${i + 1}. ${p.jid.split('@')[0]}`).join('\n')
                                                reply(`*Pending Join Requests (${pending.length}):*\n\n${list}\n\n*Usage:*\n• ${prefix}approve all - Approve everyone\n• ${prefix}approve [number] - Approve specific\n• ${prefix}reject all - Reject everyone\n• ${prefix}reject [number] - Reject specific`)
                                        }
                                } catch (err) {
                                        console.error('Approve error:', err)
                                        reply('Failed to process join requests: ' + (err.message || 'Unknown error'))
                                }
                        }
                        break

                        case 'reject':
                        case 'rejectjoin': {
                                if (!m.isGroup) return reply(mess.OnlyGrup)
                                if (!isAdmins && !isOwner) return reply(mess.admin)
                                if (!isBotAdmins) return reply(mess.botAdmin)
                                try {
                                        let pending = await X.groupRequestParticipantsList(m.chat)
                                        if (!pending || pending.length === 0) return reply('No pending join requests.')
                                        if (text && text.toLowerCase() === 'all') {
                                                let jids = pending.map(p => p.jid)
                                                await X.groupRequestParticipantsUpdate(m.chat, jids, 'reject')
                                                reply(`Rejected all *${jids.length}* pending join request(s).`)
                                        } else if (text) {
                                                let target = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
                                                let found = pending.find(p => p.jid === target)
                                                if (!found) return reply(`That number is not in the pending requests.`)
                                                await X.groupRequestParticipantsUpdate(m.chat, [target], 'reject')
                                                reply(`Rejected @${target.split('@')[0]}`)
                                        } else {
                                                let list = pending.map((p, i) => `${i + 1}. ${p.jid.split('@')[0]}`).join('\n')
                                                reply(`*Pending Join Requests (${pending.length}):*\n\n${list}\n\nUse ${prefix}reject all or ${prefix}reject [number]`)
                                        }
                                } catch (err) {
                                        console.error('Reject error:', err)
                                        reply('Failed to process join requests: ' + (err.message || 'Unknown error'))
                                }
                        }
                        break
                                
//━━━━━━━━━━━━━━━━━━━━━━━━//                            
// search features
                        case 'wikimedia': {
                                if (!text) return reply(`*Example :*\n\n${prefix + command} Query`);
                                 // wait message
                  reply(global.mess.wait)
                                try {
                                        const results = await wikimedia(text);
                                        if (results.length === 0) return reply(`⚠️ No images found on Wikimedia for "${text}".`);
                                        let result = results.map(img => `🖼️ *${img.title || 'No Title'}*\n🔗 ${img.source}`).join('\n\n');
                                        reply(`🌐 *Wikimedia Search Results for*: ${text}\n\n${result}`);
                                } catch (err) {
                                        console.error(err);
                                        reply(`❌ Error fetching images from Wikimedia. Please try again later.`);
                                }
                        }
                        break;

                        case 'mangainfo': {
                                const mangaName = args.join(' ');
                                if (!mangaName) return reply(`*Example :*\n\n${prefix + command} Anime`);
                                 // wait message
                  reply(global.mess.wait)                               
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
                                const url = args[0];
                                if (!url) return reply(`*Example :*\n\n${prefix + command} URL`);
                                 // wait message
                  reply(global.mess.wait)                               
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
                                const lang = args[0] || "id";
                                 // wait message
                  reply(global.mess.wait)
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
                                try {
                                        const animeList = await Kusonime.info();
                                        if (animeList.length === 0) {
                                                return reply('_[ Invalid ⚠️ ]_ No latest anime data found at this time.');
                                        }
                                 // wait message
                  reply(global.mess.wait)
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
                                if (!text) return reply(`*Example :*\n\n${prefix + command} Anime`);
                                 // wait message
                  reply(global.mess.wait)
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
                                 // wait message
                  reply(global.mess.wait)
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
                                 // wait message
                  reply(global.mess.wait)
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
  async function telestick(url) {
    let match = url.match(/https:\/\/t\.me\/addstickers\/([^\/\?#]+)/)
    if (!match) return reply(`*Example :*\n\n${prefix + command} https://`);
                                 // wait message
                  reply(global.mess.wait)
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
if (!text) return reply(`*Example :*\n\n ${prefix + command} anomali `)
                                 // wait message
                  reply(global.mess.wait)
try {
const searchRes = await fetch(`https://zenzxz.dpdns.org/search/stickerlysearch?query=${encodeURIComponent(text)}`)
const searchJson = await searchRes.json()
if (!searchJson.status || !Array.isArray(searchJson.data) || searchJson.data.length === 0) {
return reply('*Not Found 🚫*')
}
const pick = searchJson.data[Math.floor(Math.random() * searchJson.data.length)]
const detailUrl = `https://zenzxz.dpdns.org/tools/stickerlydetail?url=${encodeURIComponent(pick.url)}`
const detailRes = await fetch(detailUrl)
const detailJson = await detailRes.json()
if (!detailJson.status || !detailJson.data || !Array.isArray(detailJson.data.stickers) || detailJson.data.stickers.length === 0) {
return reply('Error getting sticker details')
}
const packName = detailJson.data.name
const authorName = detailJson.data.author?.name || 'unknown'
reply(`Sending ${detailJson.data.stickers.length} Sticker`)
let maxSend = 10
for (let i = 0; i < Math.min(detailJson.data.stickers.length, maxSend); i++) {
const img = detailJson.data.stickers[i]
let sticker = new Sticker(img.imageUrl, {
pack: global.packname,
author: global.author,
type: 'full',
categories: ['Stickers'],
id: 'stikerly'
})
let buffer = await sticker.toBuffer()
await X.sendMessage(m.chat, { sticker: buffer }, { quoted: m })
}
} catch (e) {
console.error(e)
reply(global.mess.error)
}
}
break

//━━━━━━━━━━━━━━━━━━━━━━━━//
// Ai Features
case 'quantum-ai':{
  if (!text) return reply(`Example:\n${prefix+command} what is artificial intelligence?`)

 // wait message
 reply(global.mess.wait)

  try {
    const api = `https://zelapioffciall.vercel.app/ai/quantum?text=${encodeURIComponent(text)}`
    const res = await fetch(api)
    if (!res.ok) throw await res.text()
    
    const json = await res.json()
    if (!json.result) return reply('Failed to get response from AI.')

    reply(json.result)
  } catch (e) {
    console.error('[QUANTUM AI ERROR]', e)
    reply('❌ An error occurred while getting response from Quantum AI.')
  }
}
break
case 'chatai':{
  try {
    if (!args.length) return reply('Please enter your question')    
 // wait message
 reply(global.mess.wait)
    let payload = { messages: [{ role: 'user', content: args.join(' ') }] }
    let headers = { headers: { Origin: 'https://chatai.org', Referer: 'https://chatai.org/' } }
    let { data } = await axios.post('https://chatai.org/api/chat', payload, headers)
    
    reply(data?.content || 'No answer found')
  } catch (e) {
    reply(e.message)
  }
}
break;
case 'conciseai':{
  const chatAI = async text => {
    let user_id = uuidv4().replace(/-/g, '')
    let lastMsg = `USER: ${text}`
    let signature = crypto.createHmac('sha256', 'CONSICESIGAIMOVIESkjkjs32120djwejk2372kjsajs3u293829323dkjd8238293938wweiuwe')
      .update(user_id + lastMsg + 'normal')
      .digest('hex')
 
    let form = new URLSearchParams({
      question: lastMsg,
      conciseaiUserId: user_id,
      signature,
      previousChats: JSON.stringify([{ a: '', b: lastMsg, c: false }]),
      model: 'normal'
    })
 
    let { data } = await axios.post('https://toki-41b08d0904ce.herokuapp.com/api/conciseai/chat', form.toString(), {
      headers: {
        'User-Agent': 'okhttp/4.10.0',
        'Connection': 'Keep-Alive',
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return data.answer
  }
 
  try {
    if (!args.length) throw 'Please enter your question'
    reply(await chatAI(args.join(' ')))
 // wait message
 reply(global.mess.wait)
  } catch (e) {
    reply(e.message || e)
  }
}
break;
case 'claudeai':{
  if (!text) {
    return reply(`Please enter your question`)
  }

 // wait message
 reply(global.mess.wait)
 
  try {
    const headers = {
      'Accept': '*/*',
      'Referer': 'https://claudeai.one/',
      'Origin': 'https://claudeai.one',
      'User-Agent': 'Mozilla/5.0'
    }
 
    const res = await fetch('https://claudeai.one/', { headers })
    const html = await res.text()
 
    const dom = new JSDOM(html)
    const doc = dom.window.document
 
    const nonce = doc.querySelector('[data-nonce]')?.getAttribute('data-nonce') || ''
    const postId = doc.querySelector('[data-post-id]')?.getAttribute('data-post-id') || ''
    const botId = doc.querySelector('[data-bot-id]')?.getAttribute('data-bot-id') || ''
 
    const clientId = html.match(/localStorage\.setItem['"]wpaicg_chat_client_id['"],\s*['"](.+?)['"]/)?.[1] || 
      'JHFiony-' + Math.random().toString(36).substring(2, 12)
 
    const form = new FormData()
    form.append('_wpnonce', nonce)
    form.append('post_id', postId)
    form.append('url', 'https://claudeai.one')
    form.append('action', 'wpaicg_chat_shortcode_message')
    form.append('message', text)
    form.append('bot_id', botId)
    form.append('chatbot_identity', 'shortcode')
    form.append('wpaicg_chat_history', '[]')
    form.append('wpaicg_chat_client_id', clientId)
 
    const resPost = await fetch('https://claudeai.one/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: {
        ...headers,
        ...form.getHeaders()
      },
      body: form
    })
 
    const json = await resPost.json()
    const jawaban = json?.data
 
    if (!jawaban) return reply('[!] Failed to get response from Claude.')
 
    await reply(jawaban)
 
  } catch (e) {
    await reply('An error occurred:\n' + JSON.stringify(e.message || e, null, 2))
  }
 
  break
}
case 'chatgpt':{
    if (!text) return reply(`Please enter your question`)
    
 // wait message
 reply(global.mess.wait)
     
    const model_list = {
        chatgpt4: {
            api: 'https://stablediffusion.fr/gpt4/predict2',
            referer: 'https://stablediffusion.fr/chatgpt4'
        },
        chatgpt3: {
            api: 'https://stablediffusion.fr/gpt3/predict',
            referer: 'https://stablediffusion.fr/chatgpt3'
        }
    };

    try {
        let results = [];
        for (const [model, config] of Object.entries(model_list)) {
            try {
const axios = require('axios');
                const hmm = await axios.get(config.referer);
                const { data } = await axios.post(config.api, {
                    prompt: text
                }, {
                    headers: {
                        accept: '*/*',
                        'content-type': 'application/json',
                        origin: 'https://stablediffusion.fr',
                        referer: config.referer,
                        cookie: hmm.headers['set-cookie'].join('; '),
                        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36'
                    }
                });
                results.push(`*${model.toUpperCase()}*:\n${data.message || 'No answer found.'}`);
            } catch (err) {
                results.push(`*${model.toUpperCase()}*:\nFailed to get response.`);
                console.error(`Error on ${model}:`, err.message);
            }
        }
        reply(results.join('\n\n'));
    } catch (e) {
        console.error(e);
        reply('An error occurred while getting the answer.');
    }
}
break
case 'venice': case 'veniceai':{
if (!text) return reply(`Please enter your question`);
 // wait message
 reply(global.mess.wait)
try {
const axios = require('axios');
const { data } = await axios.request({
method: 'POST',
url: 'https://outerface.venice.ai/api/inference/chat',
headers: {
accept: '*/*',
'content-type': 'application/json',
origin: 'https://venice.ai',
referer: 'https://venice.ai/',
'user-agent': 'Mozilla/5.0 (Android 10; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
'x-venice-version': 'interface@20250523.214528+393d253'
},
data: JSON.stringify({
requestId: 'nekorinn',
modelId: 'dolphin-3.0-mistral-24b',
prompt: [
{
content: text,
role: 'user'
}
],
systemPrompt: '',
conversationType: 'text',
temperature: 0.8,
webEnabled: true,
topP: 0.9,
isCharacter: false,
clientProcessingTime: 15
})
});
const chunks = data.split('\n').filter(v => v).map(v => JSON.parse(v));
const hasil = chunks.map(v => v.content).join('');
X.sendMessage(m.chat, { text: hasil }, { quoted: m });
} catch (e) {
console.error(e.message);
X.sendMessage(m.chat, { text: 'Sorry, no results from Venice AI.' }, { quoted: m });
}
}
break
case 'logic-eai':{
    if (!q) {
        return reply(`What would you like to ask?`);
    }
 // wait message
 reply(global.mess.wait)
    const customName = "logic-eai"; 
    const creator = "isOwner";
    const systemMessage = `Your name is now ${customName} and you were created by ${creator}`;

    const url = "https://velyn.biz.id/api/ai/aicustom";

    try {
        const response = await axios.get(url, {
            params: {
                prompt: q,
                system: systemMessage
            }
        });

        if (response.data && response.data.data) {
            X.sendMessage(m.chat, { text: response.data.data }, { quoted: m });
        } else {
            throw new Error("No response from API.");
        }
    } catch (error) {
        console.error("Error AI:", error);
        reply("Sorry, an error occurred while contacting the AI.");
    }
};
break
case 'gpt41-mini':{  
    if (!text) {
        return reply(`Example: ${prefix+command} What is quantum computing?`);
    }
    reply(global.mess.wait)    
    try {
        const ghToken = process.env.GITHUB_AI_TOKEN || '';
        if (!ghToken) return reply('AI service is not configured. Please set up the GITHUB_AI_TOKEN.');
        const res = await axios.post("https://models.github.ai/inference/chat/completions", {
            messages: [
                { role: "system", content: "" },
                { role: "user", content: text }
            ],
            temperature: 1,
            top_p: 1,
            model: "openai/gpt-4.1-mini"
        }, {
            headers: { "Authorization": `Bearer ${ghToken}`, "Content-Type": "application/json" }
        });
        const hasil = res.data.choices[0].message.content.replace(/\*\*(.*?)\*\*/g, '*$1*');
        reply(hasil);
    } catch (e) {
        console.error(e.response?.data || e.message);
        reply('Sorry, the AI is currently unavailable. Please try again later.');
    }
};
break
case 'openai':{  
    if (!text) {
        return reply(`Example: ${prefix+command} What is AI?`);
    }
    reply(global.mess.wait)    
    try {
        const ghToken = process.env.GITHUB_AI_TOKEN || '';
        if (!ghToken) return reply('AI service is not configured. Please set up the GITHUB_AI_TOKEN.');
        const sysPrompt = `Hello ${pushname}, I am ${botname}, powered by OpenAI GPT-4.1. I am a helpful AI assistant.`;
        const res = await axios.post("https://models.github.ai/inference/chat/completions", {
            messages: [
                { role: "system", content: sysPrompt },
                { role: "user", content: text }
            ],
            temperature: 1,
            top_p: 1,
            model: "openai/gpt-4.1"
        }, {
            headers: { "Authorization": `Bearer ${ghToken}`, "Content-Type": "application/json" }
        });
        const hasil = res.data.choices[0].message.content.replace(/\*\*(.*?)\*\*/g, '*$1*');
        reply(hasil);
    } catch (e) {
        console.error(e.response?.data || e.message);
        reply('Sorry, the AI is currently unavailable. Please try again later.');
    }
};
break
case 'metaai':{  
const MetaAi = {
  chat: async (question) => {
    let d = new FormData();
    d.append("content", `User: ${question}`);
    d.append("model", "@groq/llama-3.1-8b-instant");

    let head = {
      headers: {
        ...d.getHeaders(),
      },
    };

    try {
      let { data } = await axios.post("https://mind.hydrooo.web.id/v1/chat", d, head);
      return data.result || data.full_result || JSON.stringify(data);
    } catch (error) {
      console.error("API Error:", error.response?.data || error.message);
      throw new Error("Failed to get response from AI.");
    }
  }
};


  if (!text) return reply(`Example: ${prefix+command} Who invented football`);

 // wait message
 reply(global.mess.wait)
 
  try {

    const result = await MetaAi.chat(text);

    await X.sendMessage(m.chat, {
      text: result
    }, { quoted: m });
  } catch (error) {
    console.error("Error:", error);
    await reply("An error occurred.");
  }
};
break
case 'deepseek':{  

const deepSeekThink = {
  chat: async (question) => {
    let d = new FormData();
    d.append("content", `User: ${question}`);
    d.append("model", "@hf/thebloke/deepseek-coder-6.7b-instruct-awq");

    let head = {
      headers: {
        ...d.getHeaders(),
      },
    };

    try {
      let { data } = await axios.post("https://mind.hydrooo.web.id/v1/chat", d, head);
      return data.result || data.full_result || JSON.stringify(data);
    } catch (error) {
      console.error("API Error:", error.response?.data || error.message);
      throw new Error("Failed to get response from AI.");
    }
  }
};

  if (!text) return reply(`Example: ${prefix+command} Who is Elon Musk`);

 // wait message
 reply(global.mess.wait)
 
  try {

    const result = await deepSeekThink.chat(text);

    await X.sendMessage(m.chat, {
      text: result
    }, { quoted: m });
  } catch (error) {
    console.error("Error:", error);
    await reply("An error occurred.");
  }
};
break
case 'gptlogic':{  
    if (!text) return reply(`Example: ${prefix+command} Who is Elon Musk`);
 // wait message
 reply(global.mess.wait)
    try {
        let response = await axios.post("https://chateverywhere.app/api/chat/", {
            "model": {
                "id": "gpt-3.5-turbo-0613",
                "name": "GPT-3.5",
                "maxLength": 12000,
                "tokenLimit": 4000,
                "completionTokenLimit": 2500,
                "deploymentName": "gpt-35"
            },
            "messages": [
                {
                    "pluginId": null,
                    "content": text,
                    "role": "user"
                }
            ],
            "prompt": "Kamu adalah AI yang membantu pengguna dalam menjawab pertanyaan dengan akurat.",
            "temperature": 0.5
        }, {
            headers: {
                "Accept": "/*/",
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            }
        });

        let result = response.data;
        X.sendMessage(m.chat, { text: result }, { quoted: m });
    } catch (error) {
        console.error("Error fetching data:", error);
        X.sendMessage(m.chat, { text: "An error occurred while processing the request." }, { quoted: m });
    }
};
break
case 'aoyoai':{  
  if (!text) return reply('Please enter your question?');
 // wait message
 reply(global.mess.wait)
  try {
    let { data } = await axios.get(`https://www.abella.icu/aoyoai?q=${encodeURIComponent(text)}`);
    if (data?.status !== 'success') throw 'Failed to get response from API';
    
    let res = data?.data?.response;
    if (!res) throw 'Response not found';
    
    reply(res);
  } catch (e) {
    reply('An error occurred.');
  }
};
break
case 'chatbotai':{  
  if (!text) return reply('Please enter your question?');
 // wait message
 reply(global.mess.wait) 
  try {
    let { data } = await axios.get(`https://www.abella.icu/onlinechatbot?q=${encodeURIComponent(text)}`);
    if (data?.data?.answer?.data) {
      reply(data.data.answer.data);
    } else {
      reply('Unable to find an answer from the AI.');
    }
  } catch (e) {
    reply('An error occurred while getting the answer.');
  }
};
break
case 'blackbox-pro':{  
  if (!text) return reply('Please enter your question?');
 // wait message
 reply(global.mess.wait)
  try {
    let { data } = await axios.get('https://www.abella.icu/blackbox-pro?q=' + encodeURIComponent(text));
    if (data?.status !== 'success') return reply('Failed to get response.');
    reply(data.data.answer.result);
  } catch {
    reply('Error');
  }
};
break
case 'zerogpt':
  if (!q) return reply('Please enter your question?');
 // wait message
 reply(global.mess.wait)
  try {
    const axios = require('axios');
    const id = () => Math.random().toString(36).slice(2, 18);
    const res = await axios.post('https://zerogptai.org/wp-json/mwai-ui/v1/chats/submit', {
      botId: "default",
      customId: null,
      session: "N/A",
      chatId: id(),
      contextId: 39,
      messages: [],
      newMessage: q,
      newFileId: null,
      stream: true
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': 'e7b64e1953',
        'Accept': 'text/event-stream'
      },
      responseType: 'stream'
    });
    let out = '';
    res.data.on('data', chunk => {
      chunk.toString().split('\n').forEach(line => {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'live') out += data.data;
          if (data.type === 'end') reply(out.trim());
        }
      });
    });
  } catch (e) {
    reply('Error: ' + e.message);
  }
  break
case 'writecream':{
 if (!text) return reply(`Please enter your question\nExample : ${prefix+command} you are a psychologist|I often feel anxious at night, why?`);
 // wait message
 reply(global.mess.wait)
 const [logic, question] = text.split('|').map(v => v.trim());
 if (!logic || !question) return reply(`Wrong format\nExample: ${prefix+command} persona|question`);
 
 async function writecream(logic, question) {
 const url = "https://8pe3nv3qha.execute-api.us-east-1.amazonaws.com/default/llm_chat";
 const query = [
 { role: "system", content: logic },
 { role: "user", content: question }
 ];
 const params = new URLSearchParams({
 query: JSON.stringify(query),
 link: "writecream.com"
 });

 try {
 const response = await fetch(`${url}?${params.toString()}`);
 const data = await response.json();

 let raw = data.response_content || data.reply || data.result || data.text || '';
 let cleaned = raw
 .replace(/\\n/g, '\n')
 .replace(/\n{2,}/g, '\n\n')
 .replace(/\*\*(.*?)\*\*/g, '*$1*');

 return cleaned.trim();
 } catch (error) {
 return `Failed to get response: ${error.message}`;
 }
}

 const response = await writecream(logic, question);
 reply(response || 'No response.');
};
break
case 'yupraai':{
if (!text) return reply('Please enter your question?');
 // wait message
 reply(global.mess.wait)
 const timestamp = Date.now();
 const sessionId = m.chat;
 const encodedText = encodeURIComponent(text);
 const url = `https://api.yupradev.biz.id/ai/ypai?text=${encodedText}&t=${timestamp}&session=${sessionId}`;

 try {
 const res = await axios.get(url, {
 headers: {
 authority: 'api.yupradev.biz.id',
 accept: '*/*',
 origin: 'https://ai.yupradev.biz.id',
 referer: 'https://ai.yupradev.biz.id/',
 'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
 }
 });

 const data = res.data;
 const replyText = data.response || data.result || JSON.stringify(data);
 await reply(replyText.trim(), m);
 } catch (err) {
 console.error(err);
 await reply('❌ Failed to contact API: ${err.message}');
 }
};
break
case 'feloai':{
  if (!q) return reply('Please enter your question?');
 // wait message
 reply(global.mess.wait)
  try {

    const licefelo = await Felo(q);
    if (licefelo.error) {
      reply("*Terjadi Kesalahan*");
      return;
    }

    let answer = licefelo.answer || "No answer found yang ditemukan.";
    let sources = licefelo.source.length > 0
      ? `*Sources Used*:\n${licefelo.source
          .filter(src => src.link)
          .slice(0, 5)
          .map((src, i) => `_${src.link}_`)
          .join("\n\n")}`
      : "-";

    let messg = `ᴘᴏᴡᴇʀᴇᴅ ᴡɪᴛʜ ғᴇʟᴏᴀɪ\n\n${answer}\n\n${sources}`;

    await X.sendMessage(m.chat, { text: messg });
  } catch (error) {
    console.error(error);
    reply("⚠ *Terjadi Kesalahan*");
  }
}
break

case 'aliceai' :{
  try {
    if (!text) return reply(`Write something after this command.\n\nExample:\n${prefix+command} hello how are you?\n${prefix+command} https://vt.tiktok.com/ZSFxYcCdr/\n${prefix+command} generate an image of a sunset`)
 // wait message
 reply(global.mess.wait)
    let regexTikTok = /(https?:\/\/)?(www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/gi
    let isTikTok = regexTikTok.test(text)
    let isImageReq = /(gambar|buatkan.*gambar|bikin.*gambar|buat.*gambar)/i.test(text)

    if (isTikTok) {
      let link = text.match(regexTikTok)[0]
      let res = await fetch(`https://www.velyn.biz.id/api/downloader/tiktok?url=${encodeURIComponent(link)}`)
      let json = await res.json()

      if (!json?.status || !json?.data?.no_watermark) {
        return reply(`❌ Error\nLogs error : Failed to download TikTok video.`)
      }

      let prompt = `Create an attractive caption for a TikTok video titled: ${json?.data?.title || 'untitled'}`
      let aiRes = await fetch(`https://www.velyn.biz.id/api/ai/velyn-1.0-1b?prompt=${encodeURIComponent(prompt)}`)
      let aiJson = await aiRes.json()

      if (!aiJson?.status || !aiJson?.result) {
        return reply(`❌ Error\nLogs error : Failed to get caption from AI.`)
      }

      await X.sendMessage(m.chat, {
        video: { url: json.data.no_watermark },
        caption: aiJson.result.toString()
      }, { quoted: m })

    } else if (isImageReq) {
      let prompt = text
      let res = await fetch(`https://www.velyn.biz.id/api/ai/text2img?prompt=${encodeURIComponent(prompt)}`)
      if (!res.ok) return reply(`❌ Error\nLogs error : Failed to contact image service.`)

      let buffer = await res.buffer()
      await X.sendMessage(m.chat, {
        image: buffer,
        caption: `Generated image for prompt:\n*${prompt}*`
      }, { quoted: m })

    } else {
      let prompt = text
      let res = await fetch(`https://www.velyn.biz.id/api/ai/velyn-1.0-1b?prompt=${encodeURIComponent(prompt)}`)
      let json = await res.json()

      if (!json?.status || !json?.result) {
        throw `❌ Error\nLogs error : AI failed to respond.`
      }

      reply(json.result.toString())
    }

  } catch (e) {
    console.error(e)
    return reply(`❌ Error\nLogs error : ${(e?.message || e).toString()}`)
  }
}
break

case 'magicstudio':{
    if (!args[0]) return reply(`Enter a prompt for image generation!\nExample: ${prefix+command} a woman holding a Coca-Cola bottle leaning against a wall`);
 // wait message
 reply(global.mess.wait) 
    let prompt = encodeURIComponent(args.join(' '));
    let apiUrl = `https://velyn.biz.id/api/ai/magicStudio?prompt=${prompt}&apikey=velyn`;
 
    try {
        let res = await fetch(apiUrl);
        let contentType = res.headers.get('content-type');
 
        console.log('Content-Type:', contentType); 
 
        if (contentType && contentType.startsWith('image')) {
            let buffer = await res.buffer();
            await X.sendFile(m.chat, buffer, 'magicStudio.jpg', `Image generated successfully\n${packname}`, xy);
        } else {
            reply('Failed to get image, API may be experiencing errors.');
        }
    } catch (e) {
        console.error('Fetch Error:', e);
        reply('An error occurred while contacting the API.');
    }
};
break

case 'gemmaai' :{
  if (!text) return reply('Please enter your question?');
 // wait message
 reply(global.mess.wait)
  try {
    const res = await fetch(`https://www.velyn.biz.id/api/ai/gemma-2-9b-it?prompt=${encodeURIComponent(text)}`)
    if (res.ok) {
      const json = await res.json()
      if (json.status) {
        await X.sendMessage(m.chat, { text: json.data }, { quoted: m })
      } else {
        await X.sendMessage(m.chat, { text: 'Failed to get data from API.' }, { quoted: m })
      }
    } else {
      await X.sendMessage(m.chat, { text: `Status error: ${res.status}` }, { quoted: m })
    }
  } catch (e) {
    await X.sendMessage(m.chat, { text: 'An error occurred while processing the request.' }, { quoted: m })
    console.error(e)
  }
}
break
case 'aivelyn':
case 'velynai':{
  if (!text) return reply('Please enter your question?');
 // wait message
 reply(global.mess.wait)
  try {
    const url = `https://www.velyn.biz.id/api/ai/velyn-1.0-1b?prompt=${encodeURIComponent(text)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const result = data.result || "Sorry, no answer available.";

    return reply(result);
  } catch (error) {
    console.error("An error occurred:", error);
    return reply("Sorry, an error occurred while contacting the AI.");
  }
}
break

case 'muslimai':{
  if (!text) return reply('Please enter your question?');
 // wait message
 reply(global.mess.wait)
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

case 'llama-ai':{
let messages = [];
  try {
 
    if (!text) return reply('Please enter your question?');
    let response = await fetch(`https://restapii.rioooxdzz.web.id/api/llama?message=${encodeURIComponent(text)}`);
 // wait message
 reply(global.mess.wait) 
    if (!response.ok) {
      throw new Error("Request to OpenAI API failed");
    }
 
    let result = await response.json();
 
    await X.sendMessage(m.chat, {
      text: "" + result.data.response,
    });
 
    messages = [...messages, { role: "user", content: text }];
  } catch (error) {
    await X.sendMessage(m.chat, {
      text: "" + `Error: ${error.message}`,
    });
  }
}
break

case 'gptturbo':{
async function gptturbo(query) {
    const apiUrl = `https://restapii.rioooxdzz.web.id/api/gptturbo?message=${encodeURIComponent(query)}`;
 
    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
            }
        });
        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }
 
        const responseJson = await response.json();
         if (responseJson && responseJson.data.response) {
            return responseJson.data.response;
        } else {
            return "No message in response.";
        }
    } catch (error) {
        console.error("An error occurred:", error.message);
        return "Failed to get response from server.";
    }
}
 
if (!text) return reply(`Example:\n${prefix}${command} Hello?`);
 // wait message
 reply(global.mess.wait)
let gpiti = await gptturbo(text);
let turbo = `Title : ${text}\n\nMessage : ${gpiti}\n`;
await X.sendMessage(m.chat, {
    text: "⬣───「 *G P T T U R B O* 」───⬣" + "\n\n" + turbo,
    contextInfo: {
      externalAdreply: {  
        title: "GPT - TURBO",
        body: '',
        thumbnailUrl: "https://pomf2.lain.la/f/jzv6iqu.jpg",
        sourceUrl: null,
        mediaType: 1,
        renderLargerThumbnail: true
      }
    }
  }, { quoted: m });
}
break

case 'gemini-ai':{  
    const isQuotedImage = m.quoted && m.quoted.mtype === 'imageMessage';
    const isImage = m.mtype === 'imageMessage';
    const quoted = m.quoted ? m.quoted : m;

    if (isImage || isQuotedImage) {
        try {

            const mediaPath = await X.downloadAndSaveMediaMessage(quoted);
            const media = fs.readFileSync(mediaPath);

            const uploadedImageUrl = await uploadImage(media);
            console.log('Image uploaded successfully:', uploadedImageUrl);

            const apiUrl = `https://gemini-api-5k0h.onrender.com/gemini/image`;
            const params = {
                q: 'What is this picture? Please describe it.',
                url: uploadedImageUrl
            };

            const response = await axios.get(apiUrl, { params });
            const description = response.data?.content || 'Failed to get image description.';

            await X.sendMessage(m.chat, {
                text: `📷 *Image Description:*\n${description}`
            }, { quoted: m });

            fs.unlinkSync(mediaPath);
        } catch (error) {
            console.error('Error deskripsi gambar:', error);
            await X.sendMessage(m.chat, {
                text: 'An error occurred while processing the image.'
            }, { quoted: m });
        }
    } else {
        try {
            if (!text) return reply(`Example: ${prefix+command} Who is Elon Musk`);
 // wait message
 reply(global.mess.wait)
            const apiUrl = `https://gemini-api-5k0h.onrender.com/gemini/chat`;
            const params = { q: text };

            const response = await axios.get(apiUrl, { params });
            const replyText = response.data?.content || 'Failed to get respons AI.';

            await X.sendMessage(m.chat, {
                text: `🤖 *AI Gemini:*\n${replyText}`
            }, { quoted: m });
        } catch (error) {
            console.error('Error Gemini Chat:', error);
            await X.sendMessage(m.chat, {
                text: 'An error occurred while processing the AI request.'
            }, { quoted: m });
        }
    }
};
break

case 'lumin-ai':{
  if (!q) return reply(`How can I help you?`);
 // wait message
 reply(global.mess.wait)  
  try {
      const aliceeai = await Eai(q);
      if (!aliceeai) {
          return reply("No response");
      }
      await reply(`${aliceeai}\n\n${packname}`);
  } catch (error) {
      console.error("Error getting data:", error.message);
      reply("An error occurred while processing the request.");
  }
}
break

case 'typli-ai':{
 if (!q) return reply(`_What would you like to ask?_`);
 // wait message
 reply(global.mess.wait) 
 // wm avz
 const avz = async (prompt) => {
   const data = {
     prompt: prompt,
     temperature: 1.2
   };
// wm avz
   const config = {
     method: 'post',
     url: 'https://typli.ai/api/generators/completion',
     headers: {
       'Content-Type': 'application/json',
       'Accept': 'application/json'
     },
     data: JSON.stringify(data)
   };
// wm avz
   try {
     const response = await axios(config);
     return response.data;
   } catch (error) {
     console.error("Fetch error:", error.response ? error.response.data : error.message);
     throw error;
   }
 };
 // wm avz
 const avoskybaik = `${encodeURIComponent(q)}`;
 try {
   const answer = await avz(q);
   reply(answer);
 } catch (error) {
   reply("Terjadi kesalaha!");
 }
}
break;

case 'poly-ai':{
  if (!q) return reply(`_What would you like to ask?_`);
 // wait message
 reply(global.mess.wait)
  async function polybuzzAi(prompt) {
  let data = new URLSearchParams();
  data.append('currentChatStyleId', '1');
  data.append('mediaType', '2');
  data.append('needLive2D', '2');
  data.append('secretSceneId', 'wHp7z');
  data.append('selectId', '209837277');
  data.append('speechText', prompt);

  let headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Cookie': 'session=9997156d23496b9ff96fc09d162191f74821790eaa4ecc52096273a60f517ad3',
  };

  try {
    let { data: respon } = await axios.post('https://api.polybuzz.ai/api/conversation/msgbystream', data, { headers });
    //dibantu ama ai paling sigma(ChatGpt) kode kemaren yg cvbee.ai
    const result = respon.split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          const json = JSON.parse(line.trim());
          return json.content || '';
        } catch (e) {
          console.error("Invalid JSON:", line);
          return '';
        }
      })
      .join('');
      //
    return result;
  } catch (e) {
    console.error(e);
    return null;
  }
}
 try {
   const answer = await polybuzzAi(q);
   reply(answer);
 } catch (error) {
   reply("An error occurred !");
 }
}
 break
 

case 'chatevery-where':{
  if (!text) return reply(`Example: ${prefix+command} axios`)
 // wait message
 reply(global.mess.wait)
async function xyy(prompt) {
  const response = await axios({
    method: "POST",
    url: "https://chateverywhere.app/api/chat",
    headers: {
      "Content-Type": "application/json",
      "Cookie": "_ga=GA1.1.34196701.1707462626; _ga_ZYMW9SZKVK=GS1.1.1707462625.1.0.1707462625.60.0.0; ph_phc_9n85Ky3ZOEwVZlg68f8bI3jnOJkaV8oVGGJcoKfXyn1_posthog=%7B%22distinct_id%22%3A%225aa4878d-a9b6-40fb-8345-3d686d655483%22%2C%22%24sesid%22%3A%5B1707462733662%2C%22018d8cb4-0217-79f9-99ac-b77f18f82ac8%22%2C1707462623766%5D%7D",
      Origin: "https://chateverywhere.app",
      Referer: "https://chateverywhere.app/id",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
    },
    data: {
      model: {
        id: "gpt-3.5-turbo-0613",
        name: "GPT-3.5",
        maxLength: 12000,
        tokenLimit: 4000,
      },
      prompt: prompt,
      messages: [{
        pluginId: null,
        content: prompt,
        role: "user"
      },
        {
          pluginId: null,
          content: `${botname} is an AI assistant developed by Toosii Tech. It is a helpful and knowledgeable assistant.`,
          role: "assistant"
        }]
    }
  })

  return response.data
}
try {
let jut = await xyy(text)
reply(`${jut}`)
} catch (error) {
  reply(error.message)
}
}
break

case 'gemini-pro':{
  if (!text) return reply(`Example:\n${prefix+command} Apa itu chatgpt`);
 // wait message
 reply(global.mess.wait)
async function fetchWithModel(content, model, token) {
    try {
      const response = await axios.post('https://luminai.my.id/', {
        content,
        model,
        headers: {
                'Authorization': `Bearer ${token}`
                 }
      });

      console.log(response.data);
      return response.data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  fetchWithModel(text, 'gemini-pro', '8be9e34764cd2fc4e6bcfb1bf6a945efe30406573a92d8ef0ec1613dc0e54876')
    .then(data => {
      const textl = data.result;
      reply(textl);
    })
  break;
}
  
case 'gpt-4o':{
  if (!text) return reply(`Example:\n${prefix}${command} What is chatgpt`);
 // wait message
 reply(global.mess.wait)
  async function fetchWithModel(content, model, token) {
    try {
      const response = await axios.post('https://luminai.my.id/', {
        content,
        model,
        headers: {
                'Authorization': `Bearer ${token}`
                 }
      });

      console.log(response.data);
      return response.data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  fetchWithModel(text, 'gpt-4o', '8be9e34764cd2fc4e6bcfb1bf6a945efe30406573a92d8ef0ec1613dc0e54876')
    .then(data => {
      const textl = data.result;
      reply(textl);
    })
    .catch(error => console.error(error));
  break;
}
 
case 'ai':{
  if (!text) {
    return reply(`What would you like to ask?`);
  }
 // wait message
 reply(global.mess.wait)
  const prompt = `You are an AI assistant with exceptional intelligence. You enjoy helping others and communicate in a polite and professional manner`
  const requestData = { content: text, user: m.sender, prompt: prompt };
  const quoted = m && (m.quoted || m);

  try {
    let response;
    const mimetype = quoted?.mimetype || quoted?.msg?.mimetype;

    if (mimetype && /image/.test(mimetype)) {
      requestData.imageBuffer = await quoted.download();
    }

    response = (await axios.post('https://luminai.my.id', requestData)).data.result;
    reply(response);
  } catch (err) {
    reply(err.toString());
  }
}
                break
                
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Game Features
case 'tebakld': {
  let leaderboard = loadLeaderboard();

  // Ubah jadi array dan urutkan berdasar score desc
  let sorted = Object.entries(leaderboard)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // Top 10
 
  if (sorted.length === 0) return reply('📊 Leaderboard is empty.');

  let teks = '📊 *Guessing Game Leaderboard*\n\n';
  let rank = 1;
  for (let [userId, score] of sorted) {
    teks += `${rank}. @${userId.split('@')[0]} - ${score} points\n`;
    rank++;
  }

  return reply(teks, { mentions: sorted.map(([u]) => u) });
}
break;
case 'tebak': {
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
// wait message
reply(global.mess.wait)
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

  return reply(`🧠 Guess the *${kategori}* from this hint:\n\n${soal.soal}\n\nTime to answer: *60 seconds*\n\nReply to this message to answer!`);
}
break;
//━━━━━━━━━━━━━━━━━━━━━━━━//
//━━━━━━━━━━━━━━━━━━━━━━━━//
// Info Bot             
case 'ping':
case 'info':
case 'storage':
case 'server':
case 'srvinfo': {

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
  try {
    const start = Date.now()

    const osType = nou.os.type()
    const release = os.release()
    const arch = os.arch()
    const nodeVersion = process.version
    const ip = await nou.os.ip()

    const cpus = os.cpus()
    const cpuModel = cpus[0].model
    const coreCount = cpus.length
    const cpu = cpus.reduce((acc, cpu) => {
      acc.total += Object.values(cpu.times).reduce((a, b) => a + b, 0)
      acc.speed += cpu.speed
      acc.times.user += cpu.times.user
      acc.times.nice += cpu.times.nice
      acc.times.sys += cpu.times.sys
      acc.times.idle += cpu.times.idle
      acc.times.irq += cpu.times.irq
      return acc
    }, { speed: 0, total: 0, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } })
    const cpuUsage = ((cpu.times.user + cpu.times.sys) / cpu.total * 100).toFixed(2) + '%'
    const loadAverage = os.loadavg()
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const storageInfo = await nou.drive.info()
    const latensi = (Date.now() - start) / 1000  // Latency yang benar!

    const responseText = `
SERVER INFO
• OS: ${osType} (${release})
• Architecture: ${arch}
• Node.js Version: ${nodeVersion}

CPU SYSTEM
• Model: ${cpuModel}
• Speed: ${cpu.speed} MHz
• CPU Load: ${cpuUsage} (${coreCount} Core)
• Load Average: ${loadAverage.join(', ')}

MEMORY (RAM)
• Total: ${formatp(totalMem)}
• Used: ${formatp(usedMem)}
• Available: ${formatp(freeMem)}

STORAGE
• Total: ${storageInfo.totalGb} GB
• Used: ${storageInfo.usedGb} GB (${storageInfo.usedPercentage}%)
• Available: ${storageInfo.freeGb} GB (${storageInfo.freePercentage}%)

PING
• Latency: ${latensi.toFixed(4)} sec
• VPS Uptime: ${runtime(os.uptime())}
`
    return responseText.trim()
  } catch (error) {
    console.error('Error getting server information:', error)
    return 'An error occurred while getting server information.'
  }
}

const responseText = await getServerInfo()
await X.sendMessage(m.chat, { text: responseText }, { quoted: m })
}
break           

case 'totalfitur':{
reply(`Total Bot Features: ${totalfitur()}`)
}
break   
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
exec(budy.slice(2), (err, stdout) => {
if (err) return reply(`${err}`)
if (stdout) return reply(stdout)
})
}

if (global.chatBot && budy && !budy.startsWith('>') && !budy.startsWith('=>') && !budy.startsWith('$') && !isCmd && !m.key.fromMe) {
    try {
        let aiToken = process.env.GITHUB_AI_TOKEN
        if (aiToken) {
            let chatResponse = await axios.post('https://models.inference.ai.azure.com/chat/completions', {
                messages: [
                    { role: 'system', content: `You are ${global.botname}, a friendly and helpful WhatsApp bot assistant created by ${global.ownername}. Keep responses short and conversational.` },
                    { role: 'user', content: budy }
                ],
                model: 'gpt-4.1-mini',
                temperature: 0.7,
                max_tokens: 500
            }, {
                headers: {
                    'Authorization': `Bearer ${aiToken}`,
                    'Content-Type': 'application/json'
                }
            })
            let aiReply = chatResponse.data.choices[0].message.content
            if (aiReply) reply(aiReply)
        }
    } catch (chatErr) {
        console.log('[ChatBot] Error:', chatErr.message || chatErr)
    }
}
}

} catch (err) {
  let error = err.stack || err.message || util.format(err);
  console.log('====== ERROR REPORT ======');
  console.log(error);
  console.log('==========================');

  await X.sendMessage(`${owner}@s.whatsapp.net`, {
    text: `⚠️ *LAPORAN ERROR!*\n\n📌 *Message:* ${err.message || '-'}\n📂 *Stack Trace:*\n${error}`,
    contextInfo: { forwardingScore: 9999999, isForwarded: true }
  }, { quoted: m });
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