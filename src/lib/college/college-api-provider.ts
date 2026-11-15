import type {
  CollegeEnrollmentStatus,
  CollegeIntegrationProvider,
  CollegeStudentRecord,
  StudentVerificationResult,
} from './types'

/**
 * TEMPLATE adapter for an official college HTTP API.
 *
 * NOT ACTIVE until the college provides an approved API contract. The paths
 * and response shapes below are placeholders showing where the mapping goes —
 * adjust them to the real contract, then set COLLEGE_PROVIDER="college-api".
 * Runs server-side only; COLLEGE_API_KEY never reaches the browser.
 */
export class CollegeApiProvider implements CollegeIntegrationProvider {
  readonly id = 'college-api'
  readonly displayName = 'Official college API'
  readonly isMock = false

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {
    if (!baseUrl || !apiKey) {
      throw new Error('COLLEGE_API_BASE_URL and COLLEGE_API_KEY are required for the college-api provider')
    }
  }

  private async get<T>(path: string): Promise<T | null> {
    const res = await fetch(new URL(path, this.baseUrl), {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`College API error ${res.status}`)
    return (await res.json()) as T
  }

  async verifyStudent(email: string): Promise<StudentVerificationResult> {
    try {
      // PLACEHOLDER: map to the college's real lookup endpoint
      const rec = await this.get<CollegeStudentRecord>(`/students/by-email/${encodeURIComponent(email)}`)
      if (!rec) return { eligible: false, reason: 'NOT_FOUND' }
      if (rec.enrollmentStatus !== 'ENROLLED') return { eligible: false, reason: 'NOT_ENROLLED' }
      return { eligible: true, studentId: rec.studentId }
    } catch {
      return { eligible: false, reason: 'PROVIDER_UNAVAILABLE' }
    }
  }

  async getStudentProfile(studentId: string): Promise<CollegeStudentRecord | null> {
    return this.get<CollegeStudentRecord>(`/students/${encodeURIComponent(studentId)}`)
  }

  async checkEnrollmentStatus(studentId: string): Promise<CollegeEnrollmentStatus> {
    try {
      const rec = await this.getStudentProfile(studentId)
      return rec?.enrollmentStatus ?? 'UNKNOWN'
    } catch {
      return 'UNKNOWN'
    }
  }
}
