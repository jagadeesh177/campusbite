# College integration layer

CampusBite never stores the college's student database. It asks the college whether a student is eligible, keeps only what ordering needs (name, college email, student ID, department/programme/year, enrollment status), and re-checks enrollment at least every 24 hours at sign-in.

## The contract

`types.ts` → `CollegeIntegrationProvider`:

| Method | Purpose |
|---|---|
| `verifyStudent(email)` | Is this college email an eligible, currently-enrolled student? Returns the student ID |
| `getStudentProfile(studentId)` | Minimal profile for CampusBite |
| `checkEnrollmentStatus(studentId)` | `ENROLLED` / `NOT_ENROLLED` / `UNKNOWN` (unknown = system unreachable; last known status is used) |

The app only calls `getCollegeProvider()` (`index.ts`), selected by `COLLEGE_PROVIDER`. Adapters run on the server only; credentials never reach the browser.

## Adapters

| `COLLEGE_PROVIDER` | Status | What's needed from the college |
|---|---|---|
| `mock` | ✅ active | Nothing — fictional directory in `mock-provider.ts` for development |
| `college-api` | Template (`college-api-provider.ts`) | Approved REST API, base URL, API key, real endpoint paths and response format |
| `oidc` / `saml` | Planned | IdP metadata, client ID/secret, claims for student ID + enrollment status |
| `readonly-db` | Planned | Read-only DB user limited to a view with the fields above, network allow-listing |
| `csv-sync` | Planned | Approved export (e.g. nightly CSV) of currently-enrolled students; store only eligibility, not the full record |

## Adding an adapter

1. Implement `CollegeIntegrationProvider` in a new file.
2. Add a `case` in `getCollegeProvider()`.
3. Add any credentials to `.env.example` (server-side only).
4. Write tests with a fake transport — see `tests/unit/logic.test.ts` for how the mock is exercised.

Nothing else in the app changes.
