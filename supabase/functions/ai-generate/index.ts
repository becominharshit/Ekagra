import { serveAi } from '../_shared/server.ts'
import { generateFeature } from './feature.ts'

serveAi(generateFeature)
