import { api } from './api.js'
import { setExerciseOverrides } from './exercise-overrides-core.js'
let inflight=null
export async function loadExerciseOverrides(){if(inflight)return inflight;inflight=api('/api/insights/exercise-overrides').then(d=>setExerciseOverrides(d.overrides||[])).catch(()=>0).finally(()=>{inflight=null});return inflight}
