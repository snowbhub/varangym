import { popularExerciseName } from './exercise-popular-name.js'

// Ukrainian exercise-name normalizer for the canonical English catalogue. Popular gym names win
// first; compositional fallbacks are deliberately phrased as people actually say them in a gym.
const PHRASES = [
  ['assisted prone lying quadriceps stretch','розтягування квадрицепса лежачи на животі з підтримкою'],
  ['assisted lying quadriceps stretch','розтягування квадрицепса лежачи з підтримкою'],
  ['assisted lying leg curl','згинання ніг лежачи з підтримкою'],
  ['assisted seated pectoralis major stretch','розтягування грудних м’язів сидячи з підтримкою'],
  ['assisted standing pull up','підтягування стоячи з підтримкою'],
  ['assisted pull up','підтягування з підтримкою'],
  ['assisted chin up','підтягування зворотним хватом з підтримкою'],
  ['assisted dip','віджимання на брусах з підтримкою'],
  ['romanian deadlift','румунська станова тяга'],['stiff leg deadlift','станова тяга на прямих ногах'],
  ['straight leg deadlift','станова тяга на прямих ногах'],['sumo deadlift','станова тяга сумо'],
  ['bench press','жим лежачи'],['chest press','жим від грудей'],['shoulder press','жим над головою'],
  ['military press','армійський жим'],['arnold press','жим Арнольда'],['leg press','жим ногами'],
  ['close grip','вузьким хватом'],['wide grip','широким хватом'],['neutral grip','нейтральним хватом'],
  ['reverse grip','зворотним хватом'],['underhand grip','нижнім хватом'],['overhand grip','верхнім хватом'],
  ['lat pulldown','тяга верхнього блока'],['lateral pulldown','бокова тяга верхнього блока'],
  ['straight arm pulldown','тяга верхнього блока прямими руками'],['triceps pushdown','розгинання рук на блоці'],
  ['face pull','тяга до обличчя'],['upright row','тяга до підборіддя'],['bent over row','тяга в нахилі'],
  ['seated row','тяга сидячи'],['t bar row','тяга Т-грифа'],['one arm row','тяга однією рукою'],['single arm row','тяга однією рукою'],
  ['single arm','однією рукою'],['one arm','однією рукою'],['upper arm','плече'],
  ['arm curl','згинання рук'],['arm curls','згинання рук'],['arm extension','розгинання рук'],['arm extensions','розгинання рук'],
  ['arm raise','підйом рук'],['arm raises','підйом рук'],['arm stretch','розтягування рук'],['arm swing','махи руками'],['arm rotation','обертання рук'],
  ['lateral raise','підйом рук у сторони'],['front raise','підйом рук перед собою'],
  ['rear delt fly','розведення на задню дельту'],['reverse fly','зворотне розведення'],['chest fly','розведення на груди'],
  ['pec deck','зведення рук у тренажері'],['biceps curl','згинання рук на біцепс'],['hammer curl','молоткове згинання рук'],
  ['preacher curl','згинання рук на лаві Скотта'],['concentration curl','концентроване згинання рук'],
  ['triceps extension','розгинання рук на трицепс'],['skull crusher','французький жим лежачи'],['french press','французький жим'],
  ['leg extension','розгинання ніг'],['leg curl','згинання ніг'],['calf raise','підйом на носки'],
  ['hip thrust','тазовий міст зі штангою'],['glute bridge','сідничний міст'],['hip abduction','відведення стегна'],['hip adduction','приведення стегна'],
  ['pull up','підтягування'],['chin up','підтягування зворотним хватом'],['push up','віджимання'],['sit up','підйом тулуба'],
  ['knee raise','підйом колін'],['leg raise','підйом ніг'],['hanging leg raise','підйом ніг у висі'],['hanging knee raise','підйом колін у висі'],
  ['russian twist','російський поворот'],['side bend','боковий нахил'],['side plank','бокова планка'],
  ['mountain climber','альпініст'],['jumping jack','стрибки ноги-руки'],['battle rope','робота з канатами'],
  ['farmer walk','фермерська хода'],["farmer's walk",'фермерська хода'],['good morning','нахили «доброго ранку»'],
  ['step up','зашагування'],['box jump','стрибок на тумбу'],['jump squat','присідання зі стрибком'],
  ['split squat','роздільне присідання'],['bulgarian split squat','болгарське присідання'],
  ['goblet squat','присідання з гантеллю біля грудей'],['hack squat','гак-присідання'],['front squat','фронтальне присідання'],
  ['back squat','присідання зі штангою на спині'],['overhead squat','присідання зі снарядом над головою'],
  ['walking lunge','випади в ходьбі'],['reverse lunge','зворотні випади'],['side lunge','бокові випади'],['lunge jump','випади зі стрибком'],
  ['wrist curl','згинання зап’ястя'],['wrist extension','розгинання зап’ястя'],['neck flexion','згинання шиї'],['neck extension','розгинання шиї'],
  ['internal rotation','внутрішня ротація'],['external rotation','зовнішня ротація'],['shoulder rotation','ротація плеча'],
  ['ankle circles','кола гомілкостопом'],['arm circles','кола руками'],['air bike','повітряний велосипед'],
  ['stationary bike','велотренажер'],['elliptical machine','еліптичний тренажер'],['rowing machine','гребний тренажер'],
  ['ski erg','лижний ергометр'],['jump rope','стрибки зі скакалкою'],['bear crawl','ведмежа хода'],
  ['dead bug','«мертвий жук»'],['bird dog','«пташка-собака»'],['child pose','поза дитини'],['cobra pose','поза кобри'],['cat cow','кішка-корова'],
  ['all fours','навкарачки']
]

const WORDS = {
  barbell:'штанга',dumbbell:'гантеля',kettlebell:'гиря',cable:'блок',band:'стрічка',bands:'стрічки',rope:'канат',machine:'тренажер',smith:'Сміта',
  leverage:'важільний',assisted:'з підтримкою',weighted:'з обтяженням',bodyweight:'з власною вагою',body:'тіло',weight:'вага',
  olympic:'олімпійський',ez:'EZ',bosu:'BOSU',ball:'м’яч',stability:'фітбол',medicine:'медичний',roller:'ролик',sled:'сани',wheel:'колесо',bench:'лава',box:'тумба',chair:'стілець',
  standing:'стоячи',seated:'сидячи',sitting:'сидячи',lying:'лежачи',supine:'лежачи на спині',prone:'лежачи на животі',incline:'похилий',decline:'зворотно-похилий',
  vertical:'вертикальний',horizontal:'горизонтальний',single:'однією',one:'однією',two:'двома',alternating:'почерговий',alternate:'почерговий',
  unilateral:'односторонній',bilateral:'двосторонній',left:'ліворуч',right:'праворуч',reverse:'зворотний',front:'передній',rear:'задній',side:'боковий',lateral:'боковий',
  overhead:'над головою',behind:'за',neck:'шиєю',high:'високий',low:'низький',wide:'широкий',close:'вузький',grip:'хват',neutral:'нейтральний',
  press:'жим',fly:'розведення',raise:'підйом',row:'тяга',pulldown:'тяга зверху',pull:'тяга',pushdown:'тяга вниз',push:'поштовх',curl:'згинання',extension:'розгинання',flexion:'згинання',
  squat:'присідання',squatters:'присідання',lunge:'випад',deadlift:'станова тяга',thrust:'поштовх',bridge:'міст',dip:'віджимання на брусах',dips:'віджимання на брусах',
  crunch:'скручування',plank:'планка',twist:'поворот',rotation:'ротація',stretch:'розтягування',carry:'перенесення',walk:'хода',walking:'у ходьбі',run:'біг',running:'біг',
  jump:'стрибок',jumping:'стрибки',step:'крок',clean:'взяття на груди',snatch:'ривок',jerk:'поштовх',swing:'мах',kick:'удар ногою',
  chest:'груди',back:'спина',shoulder:'плече',shoulders:'плечі',delt:'дельта',deltoid:'дельта',biceps:'біцепс',triceps:'трицепс',forearm:'передпліччя',forearms:'передпліччя',wrist:'зап’ястя',
  abs:'прес',abdominal:'прес',oblique:'косі м’язи',waist:'талія',core:'кор',quad:'квадрицепс',quads:'квадрицепс',quadriceps:'квадрицепс',
  hamstring:'задня поверхня стегна',hamstrings:'задня поверхня стегна',glute:'сідниці',glutes:'сідниці',calf:'литки',calves:'литки',thigh:'стегно',thighs:'стегна',
  hip:'тазостегновий',hips:'тазостегнові',adductor:'привідні м’язи',abductor:'відвідні м’язи',ankle:'гомілкостоп',knee:'коліно',knees:'коліна',leg:'нога',legs:'ноги',
  arm:'руки',arms:'руки',hand:'кисть',hands:'кисті',foot:'стопа',feet:'стопи',head:'голова',scapula:'лопатка',scapular:'лопатковий',upper:'верхній',lower:'нижній',inner:'внутрішній',outer:'зовнішній',middle:'середній',
  power:'силовий',explosive:'вибуховий',dynamic:'динамічний',static:'статичний',iso:'ізометричний',isometric:'ізометричний',
  with:'з',without:'без',and:'і',to:'до',from:'від',on:'на',off:'від',up:'вгору',down:'вниз',over:'над',under:'під',across:'через',around:'навколо',against:'проти',using:'з використанням',
  floor:'підлозі',wall:'стіни',rack:'стійці',parallel:'паралельний',hanging:'у висі',mobility:'мобільність',circles:'кола',circle:'коло',touch:'дотик',touches:'дотики',
  heel:'п’ята',heels:'п’яти',toe:'носок',toes:'носки',handstand:'стійка на руках',pulse:'пульсація',pulses:'пульсації',hold:'утримання',
  pressdown:'розгинання на блоці',shrug:'шраги',shrugs:'шраги',crossover:'кросовер',pullover:'пуловер',kickback:'відведення назад',kickbacks:'відведення назад',
  hyperextension:'гіперекстензія',hyperextensions:'гіперекстензії',nordic:'нордичний',bicycle:'велосипед',bike:'велосипед',treadmill:'бігова доріжка',climb:'підйом',climber:'альпініст',
  strongman:'стронгмен',yoga:'йога',pilates:'пілатес',plyometric:'пліометричний'
}

function transliterate(word) {
  let s=word.toLowerCase()
  const pairs=[['tion','шн'],['sion','жн'],['tch','ч'],['sch','ш'],['sh','ш'],['ch','ч'],['th','т'],['ph','ф'],['gh','г'],['ck','к'],['qu','кв'],['wh','в'],['ee','і'],['oo','у'],['ou','ау'],['ow','оу'],['ai','ей'],['ay','ей'],['ea','і']]
  for(const [a,b] of pairs)s=s.replaceAll(a,b)
  const map={a:'а',b:'б',c:'к',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'і',j:'дж',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',w:'в',x:'кс',y:'й',z:'з'}
  return [...s].map(c=>map[c]??c).join('')
}
function preserveCase(source,translated){return source&&source[0]===source[0].toUpperCase()?translated.charAt(0).toUpperCase()+translated.slice(1):translated}

export function ukExerciseName(name='') {
  if(!name)return''
  const popular=popularExerciseName(name,'uk')
  if(popular)return popular
  const source=String(name).replace(/[–—]/g,'-').replace(/\s+/g,' ').trim()
  let work=source.toLowerCase().replace(/-/g,' ')
  for(const [en,uk] of [...PHRASES].sort((a,b)=>b[0].length-a[0].length))work=work.replace(new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'g'),`§${uk}§`)
  const parts=work.split(/(§[^§]+§|[^a-z0-9°]+|\d+(?:\.\d+)?)/i).filter(Boolean)
  const translated=parts.map(part=>{if(part.startsWith('§')&&part.endsWith('§'))return part.slice(1,-1);if(/^[^a-z]+$/i.test(part)||/^\d/.test(part))return part;const low=part.toLowerCase();return WORDS[low]||transliterate(part)}).join('').replace(/\s+/g,' ').replace(/\s+([,;:)])/g,'$1').replace(/([(])\s+/g,'$1').trim()
  return preserveCase(source,translated)
}