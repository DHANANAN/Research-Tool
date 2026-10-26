import React, {useEffect, useState} from 'react';

export function WorkspacePreferences() {
  const [layout,setLayout]=useState(()=>localStorage.getItem('research-layout')||'left');
  const [activity,setActivity]=useState('active');
  const [install,setInstall]=useState(null);
  useEffect(()=>{document.documentElement.dataset.layout=layout;localStorage.setItem('research-layout',layout);},[layout]);
  useEffect(()=>{
    let timer;
    const update=()=>{clearTimeout(timer);setActivity(document.hidden?'background':'active');if(!document.hidden)timer=setTimeout(()=>setActivity('idle'),60000);};
    const prompt=e=>{e.preventDefault();setInstall(e);};
    ['pointerdown','pointermove','keydown','visibilitychange'].forEach(name=>document.addEventListener(name,update));
    window.addEventListener('beforeinstallprompt',prompt);update();
    return()=>{clearTimeout(timer);['pointerdown','pointermove','keydown','visibilitychange'].forEach(name=>document.removeEventListener(name,update));window.removeEventListener('beforeinstallprompt',prompt);};
  },[]);
  useEffect(()=>{document.documentElement.dataset.activity=activity;},[activity]);
  return <div className="workspace-preferences"><span className="activity-light" title={`Workspace ${activity}`} aria-label={`Workspace ${activity}`} />
    <label>Navigation<select aria-label="Navigation position" value={layout} onChange={e=>setLayout(e.target.value)}><option value="left">Left sidebar</option><option value="right">Right sidebar</option><option value="top">Top navigation</option><option value="hidden">Hide sidebar</option></select></label>
    <button className="btn secondary" onClick={async()=>{if(install){await install.prompt();setInstall(null);}else alert('Install this app using your browser menu → Install app or Add to Home Screen. On iPhone: Share → Add to Home Screen.');}}>Install app shortcut</button>
  </div>;
}

export function ProfilePicture({user}) {
  const key=`research-avatar-${user.id}`;
  const [picture,setPicture]=useState(()=>localStorage.getItem(key)||'');
  return <label className="personal-picture">{picture && <img src={picture} alt="Your profile" />}Profile photo (this device)<input type="file" accept="image/*" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=await smallImage(file);localStorage.setItem(key,data);setPicture(data);}catch(error){alert(error.message);}}}/>{picture && <button type="button" onClick={()=>{localStorage.removeItem(key);setPicture('');}}>Remove photo</button>}</label>;
}
export async function smallImage(file) {
  if(!file.type.startsWith('image/') || file.size>10000000)throw new Error('Choose an image smaller than 10 MB.');
  const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');
  const scale=Math.min(1,400/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  let result=canvas.toDataURL('image/jpeg',0.55);
  if(result.length>18000){const smaller=document.createElement('canvas');smaller.width=Math.max(1,Math.round(canvas.width/2));smaller.height=Math.max(1,Math.round(canvas.height/2));smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);result=smaller.toDataURL('image/jpeg',0.4);}
  if(result.length>18000)throw new Error('Image is too detailed. Choose a smaller image.');return result;
}
export function ExtraAnswer({question,value,onChange}) {
  const [error,setError]=useState('');
  if(question.kind==='image')return <div><input aria-label={question.label} type="file" accept="image/*" onChange={async e=>{try{if(e.target.files[0])onChange(await smallImage(e.target.files[0]));setError('');}catch(e){setError(e.message);}}}/>{value && <><img className="answer-image" src={value} alt="Selected attachment"/><button type="button" onClick={()=>onChange('')}>Remove attachment</button></>}{error && <p role="alert">{error}</p>}</div>;
  return <div><p>Optional. Your browser asks permission before sharing coordinates. Location can be inaccurate or altered.</p><button type="button" className="btn secondary" onClick={()=>{if(!navigator.geolocation){setError('Location is unavailable.');return;}navigator.geolocation.getCurrentPosition(position=>{onChange(JSON.stringify({latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy_m:position.coords.accuracy,captured_at:new Date().toISOString(),study_area:question.study_area||''}));setError('');},()=>setError('Location was not shared. You can continue without it.'),{timeout:15000,maximumAge:0,enableHighAccuracy:true});}}>Share my location</button>{value && <><p>{value}</p><button type="button" onClick={()=>onChange('')}>Remove location</button></>}{error && <p role="status">{error}</p>}</div>;
}
