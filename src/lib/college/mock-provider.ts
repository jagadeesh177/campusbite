import type {
  CollegeEnrollmentStatus,
  CollegeIntegrationProvider,
  CollegeStudentRecord,
  StudentVerificationResult,
} from './types'

// ===========================================================================
//  MOCK COLLEGE DIRECTORY — DEVELOPMENT ONLY
//  Stands in for the college's own student system until an approved
//  integration (API / SSO / read-only DB / CSV sync) is available.
//  These are fictional students. Do not add real student data here.
// ===========================================================================

export const MOCK_COLLEGE_DIRECTORY: CollegeStudentRecord[] = [
  { studentId: '22CS101', email: 'aarav.sharma@college.edu', fullName: 'Aarav Sharma', department: 'Computer Science', programme: 'B.Tech', yearOfStudy: 3, enrollmentStatus: 'ENROLLED' },
  { studentId: '22CS114', email: 'diya.patel@college.edu', fullName: 'Diya Patel', department: 'Computer Science', programme: 'B.Tech', yearOfStudy: 3, enrollmentStatus: 'ENROLLED' },
  { studentId: '23EC042', email: 'rohan.verma@college.edu', fullName: 'Rohan Verma', department: 'Electronics', programme: 'B.Tech', yearOfStudy: 2, enrollmentStatus: 'ENROLLED' },
  { studentId: '23ME077', email: 'ananya.iyer@college.edu', fullName: 'Ananya Iyer', department: 'Mechanical', programme: 'B.Tech', yearOfStudy: 2, enrollmentStatus: 'ENROLLED' },
  { studentId: '24CV015', email: 'kabir.singh@college.edu', fullName: 'Kabir Singh', department: 'Civil', programme: 'B.Tech', yearOfStudy: 1, enrollmentStatus: 'ENROLLED' },
  { studentId: '21IT088', email: 'meera.nair@college.edu', fullName: 'Meera Nair', department: 'Information Technology', programme: 'B.Tech', yearOfStudy: 4, enrollmentStatus: 'ENROLLED' },
  { studentId: '24BB023', email: 'arjun.reddy@college.edu', fullName: 'Arjun Reddy', department: 'Management', programme: 'BBA', yearOfStudy: 1, enrollmentStatus: 'ENROLLED' },
  { studentId: '23BS061', email: 'ishita.ghosh@college.edu', fullName: 'Ishita Ghosh', department: 'Biotechnology', programme: 'B.Sc', yearOfStudy: 2, enrollmentStatus: 'ENROLLED' },
  { studentId: '22EE030', email: 'vikram.joshi@college.edu', fullName: 'Vikram Joshi', department: 'Electrical', programme: 'B.Tech', yearOfStudy: 3, enrollmentStatus: 'ENROLLED' },
  { studentId: '24CS009', email: 'sneha.kulkarni@college.edu', fullName: 'Sneha Kulkarni', department: 'Computer Science', programme: 'B.Tech', yearOfStudy: 1, enrollmentStatus: 'ENROLLED' },
  // Enrolled but NOT yet activated on CampusBite — use these to try the activation flow
  { studentId: '24CS031', email: 'neha.rao@college.edu', fullName: 'Neha Rao', department: 'Computer Science', programme: 'B.Tech', yearOfStudy: 1, enrollmentStatus: 'ENROLLED' },
  { studentId: '23ME090', email: 'karan.mehta@college.edu', fullName: 'Karan Mehta', department: 'Mechanical', programme: 'B.Tech', yearOfStudy: 2, enrollmentStatus: 'ENROLLED' },
  // Graduated — must be refused
  { studentId: '20CS050', email: 'old.graduate@college.edu', fullName: 'Rahul Das', department: 'Computer Science', programme: 'B.Tech', yearOfStudy: 4, enrollmentStatus: 'NOT_ENROLLED' },
]

/**
 * Parses MOCK_EXTRA_STUDENTS (JSON array) — lets a pilot add real students to
 * the mock directory without committing their emails. Invalid entries are skipped.
 * Example: [{"studentId":"24CS001","email":"name@college.edu","fullName":"Name","programme":"B.Tech"}]
 */
export function parseExtraStudents(raw: string | undefined): CollegeStudentRecord[] {
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list
      .filter((s) => s && typeof s.studentId === 'string' && typeof s.email === 'string' && typeof s.fullName === 'string')
      .map((s) => ({
        studentId: s.studentId,
        email: String(s.email).trim().toLowerCase(),
        fullName: s.fullName,
        department: typeof s.department === 'string' ? s.department : undefined,
        programme: typeof s.programme === 'string' ? s.programme : undefined,
        yearOfStudy: typeof s.yearOfStudy === 'number' ? s.yearOfStudy : undefined,
        enrollmentStatus: s.enrollmentStatus === 'NOT_ENROLLED' ? 'NOT_ENROLLED' : 'ENROLLED',
      }))
  } catch {
    console.error('[college] MOCK_EXTRA_STUDENTS is not valid JSON — ignored')
    return []
  }
}

export class MockCollegeProvider implements CollegeIntegrationProvider {
  readonly id = 'mock'
  readonly displayName = 'Mock college directory (development)'
  readonly isMock = true

  constructor(private readonly directory: CollegeStudentRecord[] = MOCK_COLLEGE_DIRECTORY) {}

  async verifyStudent(email: string): Promise<StudentVerificationResult> {
    const rec = this.directory.find((s) => s.email.toLowerCase() === email.trim().toLowerCase())
    if (!rec) return { eligible: false, reason: 'NOT_FOUND' }
    if (rec.enrollmentStatus !== 'ENROLLED') return { eligible: false, reason: 'NOT_ENROLLED' }
    return { eligible: true, studentId: rec.studentId }
  }

  async getStudentProfile(studentId: string): Promise<CollegeStudentRecord | null> {
    return this.directory.find((s) => s.studentId === studentId) ?? null
  }

  async checkEnrollmentStatus(studentId: string): Promise<CollegeEnrollmentStatus> {
    return this.directory.find((s) => s.studentId === studentId)?.enrollmentStatus ?? 'UNKNOWN'
  }
}
