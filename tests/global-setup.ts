import { execSync } from 'node:child_process'
import { loadTestEnv } from './test-env'

// Brings the separate *_test database up to the latest migration (non-destructive).
// Each test file truncates its own tables via tests/helpers.ts → resetDb().
export default function setup() {
  const env = loadTestEnv()
  if (!/_test(\?|$)/.test(new URL(env.DATABASE_URL).pathname + '?')) {
    throw new Error('Refusing to run tests against a non-test database')
  }
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, ...env },
    stdio: 'pipe',
  })
}
