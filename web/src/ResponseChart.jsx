import React,{useState} from 'react';
const colors=['#428bca','#e4a43e','#51a878','#a778c5','#d76a70','#49a9ae','#a6ac45','#bf8455'];
export default function ResponseChart({question,values}){
 const numeric=['integer','decimal'].includes(question.kind);
 const [view,setView]=useState(numeric?'bar':question.kind==='multiple'?'bar':'pie');
 let data;
 if(numeric){
   const numbers=values.filter(value=>typeof value==='number'&&Number.isFinite(value));
   if(!numbers.length)return null;
   const min=Math.min(...numbers),max=Math.max(...numbers),bins=min===max?1:Math.min(5,numbers.length),step=(max-min)/bins;
   data=Array.from({length:bins},(_,index)=>({label:bins===1?String(min):`${(min+index*step).toFixed(1)} – ${(min+(index+1)*step).toFixed(1)}${index===bins-1?' (inclusive)':' (upper excluded)'}`,count:0}));
   numbers.forEach(value=>data[Math.min(bins-1,step?Math.floor((value-min)/step):0)].count++);
 }else{
   const choices=question.kind==='boolean'?[{code:true,label:'Yes'},{code:false,label:'No'}]:question.choices;
   data=choices.map(choice=>({label:choice.label,count:values.filter(value=>Array.isArray(value)?value.includes(choice.code):value===choice.code).length}));
 }
 const total=data.reduce((sum,row)=>sum+row.count,0),maximum=Math.max(1,...data.map(row=>row.count));let end=0;
 const gradient=data.map((row,index)=>{const start=end;end+=total?row.count/total*100:0;return `${colors[index%colors.length]} ${start}% ${end}%`;}).join(',');
 return <section className="response-chart"><div className="chart-heading"><h4>{question.label}</h4><div role="group" aria-label={`Chart type: ${question.label}`}><button type="button" className="btn secondary small" aria-pressed={view==='bar'} onClick={()=>setView('bar')}>{numeric?'Histogram':'Bars'}</button>{!numeric&&<button type="button" className="btn secondary small" aria-pressed={view==='pie'} onClick={()=>setView('pie')}>Pie</button>}</div></div>
 <p>{values.length} answered{numeric?` · Mean ${(values.reduce((sum,v)=>sum+v,0)/values.length).toFixed(2)} · Min ${Math.min(...values)} · Max ${Math.max(...values)}`:''}</p>
 <div className={`chart-content ${view}`}>
 {view==='pie'&&total>0&&<div className="chart-pie" role="img" aria-label={`${question.label}: ${data.map(row=>`${row.label}, ${row.count}`).join('; ')}`} style={{background:`conic-gradient(${gradient})`}}/>}
 <div className="chart-legend">{data.map((row,index)=><div key={index} className="chart-row"><span className="chart-key" style={{background:colors[index%colors.length]}}/><span>{row.label}</span><strong>{row.count} · {Math.round(row.count/(values.length||1)*100)}%</strong>{view==='bar'&&<div className="chart-track"><div style={{width:`${row.count/maximum*100}%`,background:colors[index%colors.length]}}/></div>}</div>)}</div></div>
 <p className="chart-caption">{question.kind==='multiple'?'Percentages use respondents as the denominator. Pie slices show shares of selections; multiple answers per person are possible.':'Counts and percentages describe recorded answers only.'}</p></section>;
}
