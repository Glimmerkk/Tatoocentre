import {createServer} from "node:http";
import {readFileSync,existsSync,mkdirSync} from "node:fs";
import {extname,join,resolve,dirname} from "node:path";
import {DatabaseSync} from "node:sqlite";

const port=Number(process.env.PORT||10000);
const publicDir=resolve("dist");
const dbPath=resolve(process.env.DB_PATH||"data/ink-noir.sqlite");
mkdirSync(dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec(`
CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,package_name TEXT NOT NULL,starting_price INTEGER NOT NULL,deposit INTEGER NOT NULL,payment_method TEXT NOT NULL,placement TEXT NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,idea TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT NOT NULL,sender TEXT NOT NULL,body TEXT NOT NULL,telegram_message_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,rating INTEGER NOT NULL,comment TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);

function json(res,status,data){res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(data))}
async function readBody(req){const chunks=[];for await(const chunk of req)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks).toString()||"{}")}
async function sendTelegram(text){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  const chatId=process.env.TELEGRAM_ADMIN_CHAT_ID;
  if(!token||!chatId)throw new Error("Telegram is not configured");
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true,reply_markup:{force_reply:true,input_field_placeholder:"Reply to this customer"}})});
  const data=await response.json();
  if(!data.ok)throw new Error("Telegram delivery failed");
  return data.result.message_id;
}

let telegramOffset=0;
let telegramPollingReady=false;
async function saveTelegramReply(m){
  if(!m?.text||String(m.chat?.id)!==String(process.env.TELEGRAM_ADMIN_CHAT_ID))return;
  let origin=m.reply_to_message?db.prepare("SELECT * FROM chat_messages WHERE telegram_message_id=? LIMIT 1").get(m.reply_to_message.message_id):null;
  if(!origin)origin=db.prepare("SELECT * FROM chat_messages WHERE sender='customer' ORDER BY id DESC LIMIT 1").get();
  if(origin)db.prepare("INSERT INTO chat_messages(conversation_id,sender,body,telegram_message_id) VALUES(?,?,?,?)").run(origin.conversation_id,"agent",String(m.text).slice(0,1000),m.message_id);
}
async function pollTelegram(){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token||!process.env.TELEGRAM_ADMIN_CHAT_ID){setTimeout(pollTelegram,5000);return}
  try{
    if(!telegramPollingReady){await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({drop_pending_updates:true})});telegramPollingReady=true}
    const response=await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${telegramOffset}&timeout=20&allowed_updates=%5B%22message%22%5D`);
    const data=await response.json();
    if(data.ok)for(const update of data.result){telegramOffset=update.update_id+1;await saveTelegramReply(update.message)}
  }catch(error){console.error("Telegram polling error",error)}
  setTimeout(pollTelegram,1000);
}
pollTelegram();

async function api(req,res,url){
  if(url.pathname==="/api/bookings"&&req.method==="POST")try{
    const p=await readBody(req);
    const required=["name","phone","address","packageName","paymentMethod","placement","date","time","idea","conversationId"];
    if(required.some(k=>!String(p[k]||"").trim()))return json(res,400,{error:"Missing required details"});
    const price=Number(p.startingPrice),deposit=Number(p.deposit);
    if(!Number.isFinite(price)||deposit!==price/2)return json(res,400,{error:"Invalid deposit"});
    const address=String(p.address).trim().slice(0,300);
    const customerText=`YOUR APPOINTMENT DETAILS\nName: ${p.name}\nPhone: ${p.phone}\nLocation and address: ${address}\nTattoo price: $${price}\nDeposit: $${deposit}\nPayment method: ${p.paymentMethod}\nPlacement and size: ${p.placement}\nPreferred date: ${p.date}\nPreferred time: ${p.time}\nTattoo idea: ${p.idea}\n\nDetails submitted. Please wait for a reply.`;
    const adminText=`📅 NEW TATTOO APPOINTMENT\n\nName: ${p.name}\nPhone: ${p.phone}\nLocation and address: ${address}\nPackage: ${p.packageName}\nFull price: $${price}\nDeposit: $${deposit}\nPayment: ${p.paymentMethod}\nPlacement: ${p.placement}\nDate: ${p.date} at ${p.time}\nIdea: ${p.idea}\n\nReply directly to this message to answer the customer.`;
    const messageId=await sendTelegram(adminText);
    const result=db.prepare("INSERT INTO bookings(name,phone,address,package_name,starting_price,deposit,payment_method,placement,date,time,idea) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(p.name,p.phone,address,p.packageName,price,deposit,p.paymentMethod,p.placement,p.date,p.time,p.idea);
    db.prepare("INSERT INTO chat_messages(conversation_id,sender,body,telegram_message_id) VALUES(?,?,?,?)").run(String(p.conversationId).slice(0,80),"customer",customerText,messageId);
    return json(res,201,{booking:{id:Number(result.lastInsertRowid)}});
  }catch{return json(res,500,{error:"Booking service unavailable"})}

  if(url.pathname==="/api/chat"&&req.method==="GET"){
    const id=String(url.searchParams.get("conversationId")||"").slice(0,80);
    const messages=id?db.prepare("SELECT id,conversation_id AS conversationId,sender,body FROM chat_messages WHERE conversation_id=? ORDER BY id LIMIT 100").all(id):[];
    return json(res,200,{messages});
  }
  if(url.pathname==="/api/chat"&&req.method==="POST")try{
    const p=await readBody(req),id=String(p.conversationId||"").trim().slice(0,80),text=String(p.body||"").trim().slice(0,1000);
    if(!id||!text)return json(res,400,{error:"Message required"});
    const messageId=await sendTelegram(`💬 WEBSITE CHAT\nConversation: ${id}\n\n${text}\n\nReply directly to this message to answer the customer.`);
    const result=db.prepare("INSERT INTO chat_messages(conversation_id,sender,body,telegram_message_id) VALUES(?,?,?,?)").run(id,"customer",text,messageId);
    return json(res,201,{message:{id:Number(result.lastInsertRowid),sender:"customer",body:text}});
  }catch{return json(res,500,{error:"Chat unavailable"})}

  if(url.pathname==="/api/reviews"&&req.method==="GET")return json(res,200,{reviews:db.prepare("SELECT id,name,rating,comment FROM reviews ORDER BY id DESC LIMIT 50").all()});
  if(url.pathname==="/api/reviews"&&req.method==="POST")try{
    const p=await readBody(req),name=String(p.name||"").trim().slice(0,60),comment=String(p.comment||"").trim().slice(0,600),rating=Math.round(Number(p.rating));
    if(!name||!comment||rating<1||rating>5)return json(res,400,{error:"Complete all review fields"});
    const result=db.prepare("INSERT INTO reviews(name,rating,comment) VALUES(?,?,?)").run(name,rating,comment);
    return json(res,201,{review:{id:Number(result.lastInsertRowid),name,rating,comment}});
  }catch{return json(res,500,{error:"Review unavailable"})}

  if(url.pathname==="/api/telegram/webhook"&&req.method==="POST"){
    const configuredSecret=process.env.TELEGRAM_WEBHOOK_SECRET;
    const expectedSecret=configuredSecret&&/^[A-Za-z0-9_-]{1,256}$/.test(configuredSecret)?configuredSecret:null;
    if(expectedSecret&&req.headers["x-telegram-bot-api-secret-token"]!==expectedSecret)return json(res,401,{ok:false});
    try{
      const update=await readBody(req),m=update.message;
      if(!m?.text||String(m.chat.id)!==String(process.env.TELEGRAM_ADMIN_CHAT_ID))return json(res,200,{ok:true});
      await saveTelegramReply(m);
      return json(res,200,{ok:true});
    }catch{return json(res,200,{ok:true})}
  }
  return json(res,404,{error:"Not found"});
}

const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".jpg":"image/png",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon"};
createServer(async(req,res)=>{
  const url=new URL(req.url||"/",`http://${req.headers.host||"localhost"}`);
  if(url.pathname.startsWith("/api/"))return api(req,res,url);
  let file=join(publicDir,url.pathname==="/"? "index.html":url.pathname);
  if(!existsSync(file)||!extname(file))file=join(publicDir,"index.html");
  try{const data=readFileSync(file);res.writeHead(200,{"content-type":mime[extname(file)]||"application/octet-stream"});res.end(data)}
  catch{res.writeHead(404);res.end("Not found")}
}).listen(port,"0.0.0.0",()=>console.log(`Ink Noir running on port ${port}`));
