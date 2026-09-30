const clean = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')

const UA_EXACT = {
  'assisted lying calves stretch':'Розтягування литкових мʼязів лежачи з підтримкою',
  'assisted lying glutes stretch':'Розтягування сідничних мʼязів лежачи з підтримкою',
  'assisted lying gluteus and piriformis stretch':'Розтягування сідничного та грушоподібного мʼязів лежачи з підтримкою',
  'assisted prone lying quads stretch':'Розтягування квадрицепса лежачи на животі з підтримкою',
  'assisted prone rectus femoris stretch':'Розтягування прямого мʼяза стегна лежачи на животі з підтримкою',
  'assisted sitting pectoralis major stretch':'Розтягування великого грудного мʼяза сидячи з підтримкою',
  'assisted prone hamstring':'Згинання ніг лежачи з підтримкою',
  'assisted lying leg raise with lateral throw down':'Підйом ніг лежачи з боковим опусканням партнером',
  'assisted lying leg raise with throw down':'Підйом ніг лежачи з опусканням партнером',
  'assisted motion russian twist':'Російські скручування з медболом і підтримкою',
}

const RU_EXACT = {
  'assisted lying calves stretch':'Растяжка икроножных мышц лёжа с поддержкой',
  'assisted lying glutes stretch':'Растяжка ягодичных мышц лёжа с поддержкой',
  'assisted lying gluteus and piriformis stretch':'Растяжка ягодичной и грушевидной мышц лёжа с поддержкой',
  'assisted prone lying quads stretch':'Растяжка квадрицепса лёжа на животе с поддержкой',
  'assisted prone rectus femoris stretch':'Растяжка прямой мышцы бедра лёжа на животе с поддержкой',
  'assisted sitting pectoralis major stretch':'Растяжка большой грудной мышцы сидя с поддержкой',
  'assisted prone hamstring':'Сгибание ног лёжа с поддержкой',
  'assisted lying leg raise with lateral throw down':'Подъём ног лёжа с боковым опусканием партнёром',
  'assisted lying leg raise with throw down':'Подъём ног лёжа с опусканием партнёром',
  'assisted motion russian twist':'Русские скручивания с медболом и поддержкой',
}

const UA_TARGET = {
  calves:'литкових мʼязів', glutes:'сідничних мʼязів', 'gluteus and piriformis':'сідничного та грушоподібного мʼязів',
  quads:'квадрицепса', quadriceps:'квадрицепса', 'rectus femoris':'прямого мʼяза стегна', hamstring:'задньої поверхні стегна',
  hamstrings:'задньої поверхні стегна', pectoralis:'грудних мʼязів', 'pectoralis major':'великого грудного мʼяза',
  shoulders:'плечей', shoulder:'плеча', biceps:'біцепса', triceps:'трицепса', lats:'найширших мʼязів спини',
  back:'спини', adductors:'привідних мʼязів стегна', adductor:'привідних мʼязів стегна', hip:'тазостегнової ділянки'
}
const RU_TARGET = {
  calves:'икроножных мышц', glutes:'ягодичных мышц', 'gluteus and piriformis':'ягодичной и грушевидной мышц',
  quads:'квадрицепса', quadriceps:'квадрицепса', 'rectus femoris':'прямой мышцы бедра', hamstring:'задней поверхности бедра',
  hamstrings:'задней поверхности бедра', pectoralis:'грудных мышц', 'pectoralis major':'большой грудной мышцы',
  shoulders:'плеч', shoulder:'плеча', biceps:'бицепса', triceps:'трицепса', lats:'широчайших мышц спины',
  back:'спины', adductors:'приводящих мышц бедра', adductor:'приводящих мышц бедра', hip:'тазобедренной области'
}

function assistedStretch(name, lang) {
  if (!name.startsWith('assisted ') || !name.endsWith(' stretch')) return null
  let middle = name.slice('assisted '.length, -' stretch'.length)
  let position = ''
  const positionRules = [
    ['prone lying ', lang === 'ru' ? 'лёжа на животе' : 'лежачи на животі'],
    ['prone ', lang === 'ru' ? 'лёжа на животе' : 'лежачи на животі'],
    ['supine ', lang === 'ru' ? 'лёжа на спине' : 'лежачи на спині'],
    ['lying ', lang === 'ru' ? 'лёжа' : 'лежачи'],
    ['sitting ', lang === 'ru' ? 'сидя' : 'сидячи'],
    ['seated ', lang === 'ru' ? 'сидя' : 'сидячи'],
    ['standing ', lang === 'ru' ? 'стоя' : 'стоячи'],
  ]
  for (const [prefix, label] of positionRules) {
    if (middle.startsWith(prefix)) { middle = middle.slice(prefix.length); position = label; break }
  }
  const target = (lang === 'ru' ? RU_TARGET : UA_TARGET)[middle]
  if (!target) return null
  return lang === 'ru'
    ? `Растяжка ${target}${position ? ` ${position}` : ''} с поддержкой`
    : `Розтягування ${target}${position ? ` ${position}` : ''} з підтримкою`
}

export function naturalExerciseName(value, lang='uk') {
  if (lang !== 'uk' && lang !== 'ru') return null
  const name = clean(value).replace(/\s*\((male|female)\)\s*$/i, '')
  const exact = (lang === 'ru' ? RU_EXACT : UA_EXACT)[name]
  if (exact) return exact
  return assistedStretch(name, lang)
}
