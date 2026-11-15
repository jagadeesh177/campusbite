import 'server-only'
import { env } from '@/lib/env'
import { CollegeApiProvider } from './college-api-provider'
import { MockCollegeProvider } from './mock-provider'
import type { CollegeIntegrationProvider } from './types'

export type { CollegeIntegrationProvider } from './types'

let provider: CollegeIntegrationProvider | null = null

/**
 * Single entry point for college data. Swap adapters with COLLEGE_PROVIDER —
 * the ordering system never needs to change.
 */
export function getCollegeProvider(): CollegeIntegrationProvider {
  if (provider) return provider
  switch (env.collegeProvider) {
    case 'mock':
      if (env.isProduction) {
        console.warn('[college] Using MOCK college provider in production — pilot/demo only')
      }
      provider = new MockCollegeProvider()
      break
    case 'college-api':
      provider = new CollegeApiProvider(
        process.env.COLLEGE_API_BASE_URL ?? '',
        process.env.COLLEGE_API_KEY ?? '',
      )
      break
    case 'oidc':
    case 'saml':
    case 'readonly-db':
    case 'csv-sync':
      throw new Error(
        `College provider "${env.collegeProvider}" is planned but not implemented yet. ` +
          'It requires college authorization and connection details — see src/lib/college/README.md.',
      )
    default:
      throw new Error(`Unknown COLLEGE_PROVIDER "${env.collegeProvider}"`)
  }
  return provider
}

/** Only for tests. */
export function setCollegeProviderForTests(p: CollegeIntegrationProvider | null) {
  provider = p
}

export function isAllowedCollegeEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1]
  return !!domain && env.collegeEmailDomains.includes(domain)
}
