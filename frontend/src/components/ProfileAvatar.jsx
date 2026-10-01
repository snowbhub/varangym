import { t } from '../lib/i18n.js'

const initialsOf=name=>String(name||'V').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'V'

export default function ProfileAvatar({src='',name='VARANGYM',size=42,className=''}){
  return <span className={`vg-avatar ${src?'has-photo':''} ${className}`} style={{width:size,height:size}} aria-hidden="true">
    {src?<img src={src} alt=""/>:<span>{initialsOf(name)}</span>}
  </span>
}

export async function avatarFromFile(file,max=320){
  if(!file||!String(file.type||'').startsWith('image/'))throw new Error(t('Choose an image file'))
  const raw=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error(t('Could not read image')));r.readAsDataURL(file)})
  const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error(t('Could not read image')));i.src=raw})
  const side=Math.min(image.naturalWidth||image.width,image.naturalHeight||image.height)
  const sx=Math.max(0,((image.naturalWidth||image.width)-side)/2),sy=Math.max(0,((image.naturalHeight||image.height)-side)/2)
  const out=Math.min(max,side||max),canvas=document.createElement('canvas');canvas.width=out;canvas.height=out
  const ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,sx,sy,side,side,0,0,out,out)
  return canvas.toDataURL('image/jpeg',.84)
}
