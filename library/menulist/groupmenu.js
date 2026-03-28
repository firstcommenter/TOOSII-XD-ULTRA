const groupMenu = `
╭──────────────────────────────╮
│  👥  *MEMBER MANAGEMENT*
╰──────────────────────────────╯
  ▸  \`.add\`         →  [number]
  ▸  \`.kick\`        →  @user
  ▸  \`.remove\`      →  @user
  ▸  \`.promote\`     →  @user
  ▸  \`.demote\`      →  @user
  ▸  \`.ban\`         →  @user
  ▸  \`.unban\`       →  @user
  ▸  \`.warn\`        →  @user [reason]
  ▸  \`.unwarn\`      →  @user
  ▸  \`.clearwarn\`   →  @user
  ▸  \`.warnlist\`
  ▸  \`.approve\`     →  [all/number]
  ▸  \`.reject\`      →  [all/number]
  ▸  \`.delete\`      →  reply msg
  ▸  \`.mute\`     ▸  \`.unmute\`
  ▸  \`.open\`     ▸  \`.close\`
  ▸  \`.kickall\`     →  remove all members

╭──────────────────────────────╮
│  ⚙️  *GROUP SETTINGS*
╰──────────────────────────────╯
  ▸  \`.setgname\`     →  [name]
  ▸  \`.setgdesc\`     →  [description]
  ▸  \`.setgpic\`      →  reply image
  ▸  \`.link\`         →  group invite link
  ▸  \`.revoke\`       →  reset invite link
  ▸  \`.hidetag\`      →  silent mention all
  ▸  \`.tagall\`       →  mention all members
  ▸  \`.creategroup\`  →  [name] @users
  ▸  \`.swgc\`         →  post group status
  ▸  \`.getsw\`        →  save member status
  ▸  \`.disp-1\`       →  disappear 1 day
  ▸  \`.disp-7\`       →  disappear 7 days
  ▸  \`.disp-90\`      →  disappear 90 days
  ▸  \`.disp-off\`     →  disable disappearing

╭──────────────────────────────╮
│  🛡️  *GROUP PROTECTION*
╰──────────────────────────────╯
  ▸  \`.antilink\`       →  on/off
  ▸  \`.antilinkgc\`     →  on/off (GC links)
  ▸  \`.antiimage\`      →  on/off
  ▸  \`.antivideo\`      →  on/off
  ▸  \`.antimention\`    →  on/off
  ▸  \`.antigroupstatus\` →  on/off
  ▸  \`.antibot\`        →  on/off
  ▸  \`.antidelete\`     →  on/off
  ▸  \`.welcome\`        →  on/off
  ▸  \`.trash-group\`    →  nuke group name
`

module.exports = groupMenu