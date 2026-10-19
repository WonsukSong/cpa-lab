/* Plain-data schema shared by the private reader and the public update tools. */
(function(root){
'use strict';
const subjects=['financial','cost','finance','economics','audit','tax','business','law'];
const lessons={financial:['equation','accrual','inventory','depreciation','bonds','cashflow'],cost:['cvp','variance','eoq'],finance:['timevalue','npv','portfolio','dupont'],economics:['market','elasticity'],audit:['audit','sampling'],tax:['taxbridge','progressive'],business:['expectancy','selection'],law:['voting','ownership']};
function validate(bank){
 const fail=message=>{throw new Error('Question bank: '+message);};
 const text=(value,label,max=12000)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(label);if(/<\/?[a-z][^>]*>/i.test(value))fail(label+' must contain plain text');};
 const texts=(value,label,min=1)=>{if(!Array.isArray(value)||value.length<min)fail(label);value.forEach((x,i)=>text(x,label+'.'+i));};
 if(!bank||bank.version!==1||bank.examYear!==2027||!Array.isArray(bank.questions)||bank.questions.length>5000)fail('version, exam year or size');
 text(bank.revision,'revision',80);if(!/^\d{4}-\d{2}-\d{2}$/.test(bank.updatedAt))fail('updatedAt');
 const ids=new Set(),stems=new Set();
 for(const q of bank.questions){
  if(!q||typeof q!=='object')fail('question');
  text(q.id,'id',100);if(!/^[a-z0-9][a-z0-9-]*$/.test(q.id)||ids.has(q.id))fail('duplicate or invalid id');ids.add(q.id);
  if(!subjects.includes(q.subject)||!['mcq','written'].includes(q.type)||!['기초','응용','심화'].includes(q.difficulty))fail(q.id+' category');
  if(q.examYear!==2027||!Number.isInteger(q.revision)||q.revision<1)fail(q.id+' revision');
  if(q.status!==undefined&&!['active','withdrawn'].includes(q.status))fail(q.id+' status');
  for(const k of ['topic','title','stem','answer'])text(q[k],q.id+'.'+k);
  const stem=q.stem.replace(/\s+/g,'').toLowerCase();if(stems.has(stem))fail('duplicate stem');stems.add(stem);
  texts(q.assumptions,q.id+'.assumptions');texts(q.lessonIds,q.id+'.lessonIds');
  if(q.lessonIds.some(id=>!lessons[q.subject].includes(id)))fail(q.id+' unknown or mismatched lesson');
  if(q.type==='mcq'){
   texts(q.options,q.id+'.options',5);if(q.options.length!==5||new Set(q.options.map(x=>x.replace(/\s+/g,''))).size!==5||!Number.isInteger(q.answerIndex)||q.answerIndex<0||q.answerIndex>4)fail(q.id+' choices');
  }else if(!Array.isArray(q.options)||q.options.length||q.answerIndex!==null)fail(q.id+' written choices');
  if(!q.solution)fail(q.id+' solution');texts(q.solution.steps,q.id+'.steps',3);texts(q.solution.pitfalls,q.id+'.pitfalls',2);text(q.solution.rationale,q.id+'.rationale');text(q.solution.check,q.id+'.check');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(q.createdAt))fail(q.id+' createdAt');
  if(!q.basis||!['concept','hypothetical','current-law'].includes(q.basis.kind))fail(q.id+' basis');text(q.basis.note,q.id+'.basis.note');
  if(!Array.isArray(q.basis.sources)||!q.basis.sources.length)fail(q.id+' sources');
  q.basis.sources.forEach(s=>{for(const k of ['title','url','checked','scope'])text(s[k],q.id+'.source.'+k);if(!/^https:\/\/[^\s/@]+(?:\/[^\s]*)?$/.test(s.url)||!/^\d{4}-\d{2}-\d{2}$/.test(s.checked))fail(q.id+' source URL/date');});
  if(!q.review||q.review.status!=='reviewed')fail(q.id+' has not passed review');text(q.review.method,q.id+'.review.method');
 }
 if(!Array.isArray(bank.batches)||!bank.batches.length)fail('batches');
 return bank;
}
if(typeof module==='object'&&module.exports)module.exports=validate;
if(root)root.CPA_VALIDATE_QUESTION_BANK=validate;
})(typeof window==='object'?window:null);
