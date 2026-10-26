import React,{useEffect,useRef,useState} from 'react';
const quotations = [
 ['Knowledge is power.','Francis Bacon'],
 ['I think, therefore I am.','René Descartes'],
 ['The unexamined life is not worth living.','Socrates, in Plato’s Apology'],
 ['All men by nature desire to know.','Aristotle, Metaphysics'],
 ['Sapere aude!','Immanuel Kant, What Is Enlightenment?'],
 ['Liberty consists in doing what one desires.','John Stuart Mill, On Liberty'],
 ['Justice is the first virtue of social institutions.','John Rawls, A Theory of Justice'],
 ['Where there is no law, there is no freedom.','John Locke, Second Treatise of Government'],
 ['The life of the law has not been logic: it has been experience.','Oliver Wendell Holmes Jr., The Common Law'],
 ['Government of the people, by the people, for the people.','Abraham Lincoln, Gettysburg Address'],
];
const prompts=['Ask one careful question','Listen before interpreting','Keep a clear audit trail','Make room for uncertainty','Respect a participant’s silence','Record what surprised you','Check an assumption','Protect a person’s privacy','Separate evidence from inference','Let curiosity guide the next step'];
const endings=['. Small observations matter.','. Clarity grows through patience.','. A thoughtful pause can help.','. Good research begins with care.'];
const cards=[...quotations,...prompts.flatMap(prompt=>endings.map(ending=>[prompt+ending,'Research-Tool · original reflection']))];
export default function GoldenMoment(){
 const [card,setCard]=useState(null),[effect,setEffect]=useState(0);const close=useRef(null);
 useEffect(()=>{const open=()=>{setCard(cards[Math.floor(Math.random()*cards.length)]);setEffect(Math.floor(Math.random()*5));};window.addEventListener('research-golden-moment',open);return()=>window.removeEventListener('research-golden-moment',open);},[]);
 useEffect(()=>{if(!card)return;const previous=document.activeElement;close.current?.focus();const key=e=>{if(e.key==='Escape')setCard(null);if(e.key==='Tab'){e.preventDefault();close.current?.focus();}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};},[card]);
 return card && <div className="golden-overlay" onClick={()=>setCard(null)}><section className={`golden-card effect-${effect}`} role="dialog" aria-modal="true" aria-label="Golden moment" onClick={event=>event.stopPropagation()}><span>GOLDEN MOMENT</span><blockquote>{card[0]}</blockquote><p>{card[1]}</p><button ref={close} className="btn secondary" onClick={()=>setCard(null)}>Back to research</button></section></div>;
}
