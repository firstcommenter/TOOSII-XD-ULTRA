const fs   = require('fs')
const path = require('path')
const NOTES_FILE = path.join(__dirname, '..', 'data', 'notes.json')
const _load = () => { try { if (!fs.existsSync(NOTES_FILE)) return {}; return JSON.parse(fs.readFileSync(NOTES_FILE,'utf8')) } catch { return {} } }
const _save = (data) => { try { const d=path.dirname(NOTES_FILE); if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); fs.writeFileSync(NOTES_FILE,JSON.stringify(data,null,2)) } catch(e){console.log('[notes]',e.message)} }
const addNote=(uid,text)=>{ const d=_load(); if(!d[uid])d[uid]=[]; d[uid].push({id:Date.now(),text,created:new Date().toISOString()}); _save(d); return d[uid].length }
const getNotes=(uid)=>(_load()[uid]||[])
const getNote=(uid,n)=>getNotes(uid)[n-1]||null
const updateNote=(uid,n,text)=>{ const d=_load(); if(!d[uid]||!d[uid][n-1])return false; d[uid][n-1].text=text; d[uid][n-1].updated=new Date().toISOString(); _save(d); return true }
const deleteNote=(uid,n)=>{ const d=_load(); if(!d[uid]||!d[uid][n-1])return false; d[uid].splice(n-1,1); _save(d); return true }
const deleteAllNotes=(uid)=>{ const d=_load(); const c=(d[uid]||[]).length; delete d[uid]; _save(d); return c }
module.exports={addNote,getNotes,getNote,updateNote,deleteNote,deleteAllNotes}
