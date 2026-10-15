import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const app=express(), root=dirname(fileURLToPath(import.meta.url));
app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'35kb'}));
app.use('/api',rateLimit({windowMs:15*60*1000,limit:180,standardHeaders:'draft-7',legacyHeaders:false}));
if(process.env.NODE_ENV==='production'&&!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatório em produção');
if(process.env.NODE_ENV==='production'&&(!process.env.ADMIN_TOKEN||process.env.ADMIN_TOKEN.length<24)) throw new Error('ADMIN_TOKEN forte obrigatório');
const db=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:process.env.DATABASE_SSL_REJECT_UNAUTHORIZED!=='false'}:false,max:5}):null;
const demo=[
{id:'tech-01',name:'Fone Bluetooth Premium',category:'Tecnologia',price:129.9,compareAt:169.9,image:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=720&auto=format&fit=crop',stock:20,description:'Produto ilustrativo — fornecedor não integrado'},
{id:'casa-01',name:'Luminária Decorativa',category:'Casa',price:89.9,compareAt:119.9,image:'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=720&auto=format&fit=crop',stock:20,description:'Produto ilustrativo — fornecedor não integrado'},
{id:'moda-01',name:'Bolsa Casual Feminina',category:'Moda',price:149.9,compareAt:189.9,image:'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=720&auto=format&fit=crop',stock:20,description:'Produto ilustrativo — fornecedor não integrado'},
{id:'beleza-01',name:'Kit de Pincéis de Maquiagem',category:'Beleza',price:69.9,compareAt:98.9,image:'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=720&auto=format&fit=crop',stock:20,description:'Produto ilustrativo — fornecedor não integrado'},
{id:'tools-01',name:'Kit de Ferramentas',category:'Ferramentas',price:199.9,compareAt:249.9,image:'https://images.unsplash.com/photo-1581147036324-c1c89c2c8b5c?w=720&auto=format&fit=crop',stock:20,description:'Produto ilustrativo — fornecedor não integrado'},
{id:'auto-01',name:'Acessório para Carro',category:'Automotivo',price:59.9,compareAt:79.9,image:'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=720&auto=format&fit=crop',stock:20,description:'Produto ilustrativo — fornecedor não integrado'}
];
let local={products:demo,orders:[],suppliers:[]};
async function init(){if(!db)return;await db.query('CREATE TABLE IF NOT EXISTS store_documents (key TEXT PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ DEFAULT now())');await db.query('INSERT INTO store_documents(key,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',['products',JSON.stringify(demo)]);}
async function load(key){if(!db)return local[key];const r=await db.query('SELECT data FROM store_documents WHERE key=$1',[key]);return r.rows[0]?.data??[];}
async function save(key,value){if(!db){local[key]=value;return;}await db.query('INSERT INTO store_documents(key,data) VALUES ($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data,updated_at=now()',[key,JSON.stringify(value)]);}
function auth(req,res,next){const expected=process.env.ADMIN_TOKEN||'',received=req.get('x-admin-token')||'';const a=Buffer.from(expected),b=Buffer.from(received);if(a.length<24||a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({error:'Não autorizado'});next();}
app.get('/api/health',async(req,res)=>{try{if(db)await db.query('SELECT 1');res.json({ok:true,storage:db?'postgresql':'memory',payments:'not_configured',suppliers:'not_configured'});}catch{res.status(503).json({ok:false});}});
app.get('/api/config',(req,res)=>res.json({name:'NOVA STORE',paymentsEnabled:false,demoMode:true}));
app.get('/api/products',async(req,res,next)=>{try{res.json(await load('products'));}catch(e){next(e)}});
app.get('/api/admin/summary',auth,async(req,res,next)=>{try{const [p,o,s]=await Promise.all(['products','orders','suppliers'].map(load));res.json({products:p.length,orders:o.length,suppliers:s.length,demoMode:true});}catch(e){next(e)}});
app.get('/api/admin/orders',auth,async(req,res,next)=>{try{res.json(await load('orders'));}catch(e){next(e)}});
app.get('/api/admin/suppliers',auth,async(req,res,next)=>{try{res.json(await load('suppliers'));}catch(e){next(e)}});
app.post('/api/admin/suppliers',auth,async(req,res,next)=>{try{const name=String(req.body?.name||'').trim();if(name.length<3||name.length>120)return res.status(400).json({error:'Nome inválido'});const all=await load('suppliers');const supplier={id:randomUUID(),name,website:String(req.body?.website||'').slice(0,300),status:'manual'};all.push(supplier);await save('suppliers',all);res.status(201).json(supplier);}catch(e){next(e)}});
app.post('/api/orders',async(req,res)=>res.status(503).json({error:'Checkout ainda não habilitado. Nenhum pagamento foi efetuado.'}));
app.use(express.static(join(root,'public'),{extensions:['html']}));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Erro interno'});});
await init();app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('NOVA STORE online, porta '+(process.env.PORT||3000)));