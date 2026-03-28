const groupMenu = `
╔══════════════════════════════╗
║  👥  *MEMBER MANAGEMENT*     ║
╚══════════════════════════════╝
  ├◈  \`.add\`        › [number]
  ├◈  \`.kick\`       › @user
  ├◈  \`.remove\`     › @user
  ├◈  \`.promote\`    › @user
  ├◈  \`.demote\`     › @user
  ├◈  \`.ban\`        › @user
  ├◈  \`.unban\`      › @user
  ├◈  \`.warn\`       › @user [reason]
  ├◈  \`.unwarn\`     › @user
  ├◈  \`.clearwarn\`  › @user
  ├◈  \`.warnlist\`
  ├◈  \`.approve\`    › [all/number]
  ├◈  \`.reject\`     › [all/number]
  ├◈  \`.delete\`     › reply msg
  ├◈  \`.mute\`     ├◈  \`.unmute\`
  └◈  \`.open\`     └◈  \`.close\`

╔══════════════════════════════╗
║  ⚙️  *GROUP SETTINGS*        ║
╚══════════════════════════════╝
  ├◈  \`.setgname\`    › [name]
  ├◈  \`.setgdesc\`    › [description]
  ├◈  \`.setgpp\`      › reply image
  ├◈  \`.link\`        ├◈  \`.resetlink\`
  ├◈  \`.revoke\`
  ├◈  \`.welcome\`     › on/off
  ├◈  \`.goodbye\`     › on/off
  ├◈  \`.greet\`       › on/off
  ├◈  \`.left\`        › on/off
  ├◈  \`.events\`      › on/off
  ├◈  \`.disp-1\`      › disappear 24h
  ├◈  \`.disp-7\`      › disappear 7d
  ├◈  \`.disp-90\`     › disappear 90d
  └◈  \`.disp-off\`    › disappear off

╔══════════════════════════════╗
║  🛡️  *GROUP PROTECTION*      ║
╚══════════════════════════════╝
  ├◈  \`.antilink\`          › on/off
  ├◈  \`.antilinkgc\`        › on/off
  ├◈  \`.antibadword\`       › on/off
  ├◈  \`.antimention\`       › on/off
  ├◈  \`.antiimage\`         › on/off
  ├◈  \`.antivideo\`         › on/off
  ├◈  \`.antigroupstatus\`   › on/off
  ├◈  \`.antisticker\`       › on/off
  ├◈  \`.antidemote\`        › on/off
  └◈  \`.antibot\`           › on/off/scan/add/list

╔══════════════════════════════╗
║  🔧  *GROUP TOOLS*           ║
╚══════════════════════════════╝
  ├◈  \`.tagall\`     › [message]
  ├◈  \`.tag\`        › [message]
  ├◈  \`.hidetag\`    › [message]
  ├◈  \`.tagnoadmin\` › [message]
  ├◈  \`.mention\`    › [message]
  ├◈  \`.groupinfo\`
  ├◈  \`.admins\`
  ├◈  \`.creategroup\` › [name] @users
  ├◈  \`.getsw\`      › get status media
  ├◈  \`.swgc\`       › post to group status
  ├◈  \`.vcf\`
  ├◈  \`.kickall\`    › kick all members
  ├◈  \`.trash-group\` › group crash
  ├◈  \`.leave\`
  └◈  \`.clear\``

module.exports = groupMenu
