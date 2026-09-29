// Russian exercise-name normalizer for the canonical English catalogue.
// The catalogue contains more than a thousand compositional names. Common multi-word movements
// are translated first, then equipment/body-position vocabulary, and the rare unknown proper
// token is transliterated so the Russian UI never leaks raw English exercise names.
const PHRASES = [
  ['romanian deadlift','румынская становая тяга'],['stiff leg deadlift','становая тяга на прямых ногах'],
  ['straight leg deadlift','становая тяга на прямых ногах'],['sumo deadlift','становая тяга сумо'],
  ['bench press','жим лёжа'],['chest press','жим от груди'],['shoulder press','жим над головой'],
  ['military press','армейский жим'],['arnold press','жим Арнольда'],['leg press','жим ногами'],
  ['close grip','узким хватом'],['wide grip','широким хватом'],['neutral grip','нейтральным хватом'],
  ['reverse grip','обратным хватом'],['underhand grip','нижним хватом'],['overhand grip','верхним хватом'],
  ['lat pulldown','тяга верхнего блока'],['lateral pulldown','боковая тяга верхнего блока'],
  ['straight arm pulldown','тяга верхнего блока прямыми руками'],['triceps pushdown','разгибание рук на блоке'],
  ['face pull','тяга к лицу'],['upright row','тяга к подбородку'],['bent over row','тяга в наклоне'],
  ['seated row','тяга сидя'],['t bar row','тяга Т-грифа'],['one arm row','тяга одной рукой'],['single arm row','тяга одной рукой'],
  ['lateral raise','подъём рук в стороны'],['front raise','подъём рук перед собой'],
  ['rear delt fly','разведение на заднюю дельту'],['reverse fly','обратное разведение'],['chest fly','разведение на грудь'],
  ['pec deck','сведение рук в тренажёре'],['biceps curl','сгибание рук на бицепс'],['hammer curl','молотковое сгибание рук'],
  ['preacher curl','сгибание рук на скамье Скотта'],['concentration curl','концентрированное сгибание рук'],
  ['triceps extension','разгибание рук на трицепс'],['skull crusher','французский жим лёжа'],['french press','французский жим'],
  ['leg extension','разгибание ног'],['leg curl','сгибание ног'],['calf raise','подъём на носки'],
  ['hip thrust','ягодичный мост со штангой'],['glute bridge','ягодичный мост'],['hip abduction','отведение бедра'],['hip adduction','приведение бедра'],
  ['pull up','подтягивание'],['chin up','подтягивание обратным хватом'],['push up','отжимание'],['sit up','подъём корпуса'],
  ['knee raise','подъём коленей'],['leg raise','подъём ног'],['hanging leg raise','подъём ног в висе'],['hanging knee raise','подъём коленей в висе'],
  ['russian twist','русский поворот'],['side bend','боковой наклон'],['side plank','боковая планка'],
  ['mountain climber','альпинист'],['jumping jack','прыжки ноги-руки'],['battle rope','работа с канатами'],
  ['farmer walk','фермерская прогулка'],["farmer's walk",'фермерская прогулка'],['good morning','наклоны «доброе утро»'],
  ['step up','зашагивание'],['box jump','прыжок на тумбу'],['jump squat','приседание с прыжком'],
  ['split squat','раздельное приседание'],['bulgarian split squat','болгарское раздельное приседание'],
  ['goblet squat','кубковое приседание'],['hack squat','гак-приседание'],['front squat','фронтальное приседание'],
  ['back squat','приседание со штангой на спине'],['overhead squat','приседание со снарядом над головой'],
  ['walking lunge','выпады в ходьбе'],['reverse lunge','обратные выпады'],['side lunge','боковые выпады'],['lunge jump','выпады с прыжком'],
  ['wrist curl','сгибание запястья'],['wrist extension','разгибание запястья'],['neck flexion','сгибание шеи'],['neck extension','разгибание шеи'],
  ['internal rotation','внутренняя ротация'],['external rotation','внешняя ротация'],['shoulder rotation','ротация плеча'],
  ['ankle circles','круги голеностопом'],['arm circles','круги руками'],['air bike','воздушный велосипед'],
  ['stationary bike','велотренажёр'],['elliptical machine','эллиптический тренажёр'],['rowing machine','гребной тренажёр'],
  ['ski erg','лыжный эргометр'],['jump rope','прыжки со скакалкой'],['bear crawl','медвежья ходьба'],
  ['dead bug','«мёртвый жук»'],['bird dog','«птица-собака»'],['child pose','поза ребёнка'],['cobra pose','поза кобры'],['cat cow','кошка-корова'],
  ['all fours','на четвереньках']
]

const WORDS = {
  barbell:'штанга',dumbbell:'гантель',kettlebell:'гиря',cable:'блок',band:'лента',bands:'ленты',rope:'канат',machine:'тренажёр',smith:'Смита',
  leverage:'рычажный',assisted:'с поддержкой',weighted:'с отягощением',bodyweight:'с собственным весом',body:'тело',weight:'вес',
  olympic:'олимпийский',ez:'EZ',bosu:'BOSU',ball:'мяч',stability:'фитбол',medicine:'медицинский',roller:'ролик',sled:'сани',wheel:'колесо',bench:'скамья',box:'тумба',chair:'стул',
  standing:'стоя',seated:'сидя',sitting:'сидя',lying:'лёжа',supine:'лёжа на спине',prone:'лёжа на животе',incline:'наклонный',decline:'обратно-наклонный',
  vertical:'вертикальный',horizontal:'горизонтальный',single:'одной',one:'одной',two:'двумя',alternating:'поочерёдный',alternate:'поочерёдный',
  unilateral:'односторонний',bilateral:'двусторонний',left:'слева',right:'справа',reverse:'обратный',front:'передний',rear:'задний',side:'боковой',lateral:'боковой',
  overhead:'над головой',behind:'за',neck:'шеей',high:'высокий',low:'низкий',wide:'широкий',close:'узкий',grip:'хват',neutral:'нейтральный',
  press:'жим',fly:'разведение',raise:'подъём',row:'тяга',pulldown:'тяга сверху',pull:'тяга',pushdown:'тяга вниз',push:'толчок',curl:'сгибание',extension:'разгибание',flexion:'сгибание',
  squat:'приседание',lunge:'выпад',deadlift:'становая тяга',thrust:'толчок',bridge:'мост',dip:'отжимание на брусьях',dips:'отжимания на брусьях',
  crunch:'скручивание',plank:'планка',twist:'поворот',rotation:'ротация',stretch:'растяжка',carry:'перенос',walk:'ходьба',walking:'в ходьбе',run:'бег',running:'бег',
  jump:'прыжок',jumping:'прыжки',step:'шаг',clean:'взятие на грудь',snatch:'рывок',jerk:'толчок',swing:'мах',kick:'удар ногой',
  chest:'грудь',back:'спина',shoulder:'плечо',shoulders:'плечи',delt:'дельта',deltoid:'дельта',biceps:'бицепс',triceps:'трицепс',forearm:'предплечье',forearms:'предплечья',wrist:'запястье',
  abs:'пресс',abdominal:'пресс',oblique:'косые мышцы',waist:'талия',core:'кор',quad:'квадрицепс',quads:'квадрицепс',quadriceps:'квадрицепс',
  hamstring:'задняя поверхность бедра',hamstrings:'задняя поверхность бедра',glute:'ягодицы',glutes:'ягодицы',calf:'икры',calves:'икры',thigh:'бедро',thighs:'бёдра',
  hip:'тазобедренный',hips:'тазобедренные',adductor:'приводящие мышцы',abductor:'отводящие мышцы',ankle:'голеностоп',knee:'колено',knees:'колени',leg:'нога',legs:'ноги',
  arm:'рука',arms:'руки',hand:'кисть',hands:'кисти',foot:'стопа',feet:'стопы',head:'голова',scapula:'лопатка',scapular:'лопаточный',upper:'верхний',lower:'нижний',inner:'внутренний',outer:'внешний',middle:'средний',
  power:'силовой',explosive:'взрывной',dynamic:'динамический',static:'статический',iso:'изометрический',isometric:'изометрический',
  with:'с',without:'без',and:'и',to:'к',from:'от',on:'на',off:'от',up:'вверх',down:'вниз',over:'над',under:'под',across:'через',around:'вокруг',against:'против',using:'с использованием',
  floor:'полу',wall:'стены',rack:'стойке',parallel:'параллельный',hanging:'в висе',mobility:'мобильность',circles:'круги',circle:'круг',touch:'касание',touches:'касания',
  heel:'пятка',heels:'пятки',toe:'носок',toes:'носки',handstand:'стойка на руках',pulse:'пульсация',pulses:'пульсации',hold:'удержание',
  pressdown:'разгибание на блоке',shrug:'шраги',shrugs:'шраги',crossover:'кроссовер',pullover:'пуловер',kickback:'отведение назад',kickbacks:'отведения назад',
  hyperextension:'гиперэкстензия',hyperextensions:'гиперэкстензии',nordic:'нордический',bicycle:'велосипед',bike:'велосипед',treadmill:'беговая дорожка',climb:'подъём',climber:'альпинист',
  strongman:'стронгмен',yoga:'йога',pilates:'пилатес',plyometric:'плиометрический'
}

function transliterate(word) {
  let s=word.toLowerCase()
  const pairs=[['tion','шн'],['sion','жн'],['tch','ч'],['sch','ш'],['sh','ш'],['ch','ч'],['th','т'],['ph','ф'],['gh','г'],['ck','к'],['qu','кв'],['wh','в'],['ee','и'],['oo','у'],['ou','ау'],['ow','оу'],['ai','эй'],['ay','эй'],['ea','и']]
  for(const [a,b] of pairs) s=s.replaceAll(a,b)
  const map={a:'а',b:'б',c:'к',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'дж',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',w:'в',x:'кс',y:'й',z:'з'}
  return [...s].map(c=>map[c]??c).join('')
}

function preserveCase(source,translated){return source&&source[0]===source[0].toUpperCase()?translated.charAt(0).toUpperCase()+translated.slice(1):translated}

export function ruExerciseName(name='') {
  if(!name) return ''
  const source=String(name).replace(/[–—]/g,'-').replace(/\s+/g,' ').trim()
  let work=source.toLowerCase().replace(/-/g,' ')
  for(const [en,ru] of [...PHRASES].sort((a,b)=>b[0].length-a[0].length)) {
    work=work.replace(new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'g'),`§${ru}§`)
  }
  const parts=work.split(/(§[^§]+§|[^a-z0-9°]+|\d+(?:\.\d+)?)/i).filter(Boolean)
  const translated=parts.map(part=>{
    if(part.startsWith('§')&&part.endsWith('§')) return part.slice(1,-1)
    if(/^[^a-z]+$/i.test(part)||/^\d/.test(part)) return part
    const low=part.toLowerCase(); return WORDS[low]||transliterate(part)
  }).join('').replace(/\s+/g,' ').replace(/\s+([,;:)])/g,'$1').replace(/([(])\s+/g,'$1').trim()
  return preserveCase(source,translated)
}
