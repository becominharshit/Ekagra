import { productionDeps } from '../_shared/server.ts'
import { handleTutorRequest } from './feature.ts'

Deno.serve(handleTutorRequest(productionDeps))
