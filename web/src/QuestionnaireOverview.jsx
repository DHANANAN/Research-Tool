import React from 'react';
import ResponseChart from './ResponseChart.jsx';
import AnswerInsights from './AnswerInsights.jsx';
export default function QuestionnaireOverview({responses,forms}) {
 const categorical=(id,label,values)=>{const choices=[...new Set(values)].sort().map(value=>({code:value,label:value}));return <ResponseChart key={id} question={{id,label,kind:'single',choices}} values={values}/>;};
 const slots=responses.flatMap(response=>{const form=forms.find(form=>form.id===response.form_id);return (form?.questions||[]).filter(q=>q.kind!=='section'&&response.statuses?.[q.id]!=='skipped').map(q=>({label:q.label,answered:response.statuses?.[q.id]==='answered'}));});
 const missing=slots.filter(slot=>!slot.answered).map(slot=>slot.label);
 return <section className="panel" style={{padding:22,marginBottom:22}}><h3>Questionnaire-wide analysis</h3><p>{responses.length} submissions. Filter to one questionnaire for instrument-specific results. These charts describe collection and completeness; they do not combine unrelated answers into a score. Dates use UTC.</p><div className="overview-charts">
 {categorical('collectors','Submissions by collector',responses.map(r=>r.collector_name||r.collector_id))}
 {categorical('timeline','Submissions by day',responses.map(r=>(r.received_at||r.collected_at||'Unknown').slice(0,10)))}
 {categorical('source','Field versus online submissions',responses.map(r=>r.collector_id==='public'?'Online':'Field'))}
 {categorical('coverage','Recorded versus missing answer slots',slots.map(slot=>slot.answered?'Answered':'Not recorded'))}
 {missing.length?categorical('missing','Missing answers by question',missing):<section className="response-chart"><h4>Missing answers by question</h4><p>No missing answers in the applicable recorded slots.</p></section>}
 </div><AnswerInsights responses={responses} forms={forms}/></section>;
}
