// Extraction stays local. No HTML from a document is rendered.
export async function readDocument(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose a document smaller than 8 MB.');
  if (/\.docx$/i.test(file.name)) {
    const {extractRawText} = await import('mammoth/mammoth.browser');
    const result = await extractRawText({arrayBuffer: await file.arrayBuffer()});
    if (result.value.length > 200000) throw new Error('Extracted document is too large. Split it into instruments.');
    return result.value;
  }
  if (/\.(txt|md)$/i.test(file.name)) return file.text();
  throw new Error('Use DOCX or TXT. For Google Docs: File → Download → Microsoft Word (.docx). For old .doc files, save as .docx first.');
}
export function documentSections(text) {
  return text.split(/^\s*===+\s*$/m).map(part=>part.trim()).filter(Boolean);
}
export function parseQuestionnaires(text, split=false) {
  if(text.length>200000) throw new Error('Split documents larger than 200,000 characters before importing.');
  const blocks=text.split(/\n\s*\n|\n(?=\s*(?:\d+[.)]|Section\s+\d+))/).map(value=>value.trim()).filter(Boolean);
  const title=blocks[0]?.replace(/^#+\s*/,'') || 'Imported questionnaire';
  const groups=[];let group={title,questions:[]},counter=0,qualitative=false;
  const push=()=>{if(group.questions.some(q=>q.kind!=='section'))groups.push(group);};
  for(const block of blocks.slice(1)) {
    if(/^Data Analysis\s*(?:&|and)\s*Coding Guide/i.test(block))break;
    if(/^Research Objective:|^Instructions:/i.test(block))continue;
    if(/^===+$/.test(block)||/^Section\s+\d+\s*:|^Respondent Demographics/i.test(block)){
      if(split){push();group={title:`${title} — ${block}`,questions:[]};}
      qualitative=/qualitative|in.depth/i.test(block);
      group.questions.push({id:`section_${++counter}`,kind:'section',label:block,required:false,choices:[]});continue;
    }
    let label=block.replace(/^\d+[.)]\s*/,'').trim(),kind=qualitative?'long_text':'text',choices=[],extra={};
    const binary=label.match(/\[\s*Yes\s*\/\s*No\s*\]\s*$/i);
    const options=label.match(/\(([^()]*\/[^()]*)\)\s*$/);
    const colon=label.match(/^([^:]+):\s*(.+\/.+)$/s);
    if(binary){kind='boolean';label=label.slice(0,binary.index).trim();}
    else if(options||colon){const match=options||colon;const values=(options?match[1]:match[2]).split('/').map(value=>value.trim()).filter(Boolean);if(values.length>1){kind='single';choices=values.map((value,index)=>({code:`option_${index+1}`,label:value}));label=options?label.slice(0,match.index).trim():match[1].trim();}}
    else if(/scale of 1 to 5/i.test(label)){kind='integer';extra={min:1,max:5};}
    else if(/what percentage/i.test(label)){kind='decimal';extra={min:0,max:100};}
    else if(/how many|at what age/i.test(label)){kind='integer';extra={min:0};}
    group.questions.push({id:`q_import_${++counter}`,label,kind,choices,required:false,...extra});
  }
  push();
  if(!groups.length)throw new Error('No question candidates found. Review the extracted text.');
  if(groups.some(group=>group.questions.length>200))throw new Error('More than 200 items in one instrument. Enable separate-section drafts or split the document. Nothing has been truncated.');
  return groups.map(group=>({...group,description:'Imported draft. Compare every item with the source before publication.',warnings:['All answers start optional. Review inferred types, options, consent and branching. Headings are preserved; the analysis guide is not a question.']}));
}
