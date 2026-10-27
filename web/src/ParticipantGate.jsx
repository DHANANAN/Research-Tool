import React,{useState} from 'react';
export default function ParticipantGate({children,onIdentity}) {
 const [value,setValue]=useState(''),[started,setStarted]=useState(false),[error,setError]=useState('');
 if(started)return children;
 return <form onSubmit={event=>{event.preventDefault();const identity=value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)&&!/^\+?[\d\s()-]{7,20}$/.test(identity)){setError('Enter a valid email address or mobile number.');return;}onIdentity(identity);setStarted(true);}}><label>Email or mobile number<input autoComplete="off" required value={value} maxLength={200} onChange={event=>setValue(event.target.value)}/></label><p>Your identifier will be shared with the research team alongside your answers. It is self-reported, not verified. Continue only if you agree.</p>{error&&<p role="alert">{error}</p>}<button type="submit" className="btn primary">Agree and start questionnaire</button></form>;
}
