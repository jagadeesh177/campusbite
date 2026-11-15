// College integration contract.
//
// CampusBite never owns the college's student records. Every adapter (mock,
// official API, OIDC/SAML, read-only DB, CSV sync) implements this interface,
// and the rest of the app only talks to it through getCollegeProvider().
// Adapters run server-side only; credentials never reach the browser.

export type CollegeEnrollmentStatus = 'ENROLLED' | 'NOT_ENROLLED' | 'UNKNOWN'

export interface CollegeStudentRecord {
  studentId: string
  email: string
  fullName: string
  department?: string
  programme?: string
  yearOfStudy?: number
  enrollmentStatus: CollegeEnrollmentStatus
}

export type VerificationFailureReason = 'NOT_FOUND' | 'NOT_ENROLLED' | 'PROVIDER_UNAVAILABLE'

export type StudentVerificationResult =
  | { eligible: true; studentId: string }
  | { eligible: false; reason: VerificationFailureReason }

export interface CollegeIntegrationProvider {
  /** Stable identifier stored on StudentProfile.integrationSource */
  readonly id: string
  /** Human-readable name shown to staff */
  readonly displayName: string
  /** True for development-only adapters */
  readonly isMock: boolean

  /** Is this college email an eligible, currently-enrolled student? */
  verifyStudent(email: string): Promise<StudentVerificationResult>

  /** Minimal profile needed by CampusBite (no grades, fees, addresses, etc.). */
  getStudentProfile(studentId: string): Promise<CollegeStudentRecord | null>

  /** Current enrollment status; called at activation and periodically at login. */
  checkEnrollmentStatus(studentId: string): Promise<CollegeEnrollmentStatus>
}
