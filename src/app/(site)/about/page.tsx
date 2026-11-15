import type { Metadata } from 'next'
import { ProsePage } from '@/components/site/prose-page'

export const metadata: Metadata = { title: 'About' }

export default function AboutPage() {
  return (
    <ProsePage title="About CampusBite" intro="A pre-ordering platform built for the way campus breaks actually work.">
      <section>
        <h2>Why we built it</h2>
        <p>
          Lunch breaks are short and canteen queues are long. CampusBite lets students order from wherever they are on
          campus, pay online, and walk up only when their food is ready — while giving the kitchen a calm, organised
          view of every order.
        </p>
      </section>
      <section>
        <h2>Who can use it</h2>
        <p>
          CampusBite is exclusive to the college community. Students sign in with their official college email, and
          eligibility is confirmed with the college&apos;s own records. Canteen and staff accounts are created by
          authorised administrators.
        </p>
      </section>
      <section>
        <h2>How your college stays in control</h2>
        <p>
          Enrollment always remains managed by the college. CampusBite only keeps the minimum needed to run your
          orders: your name, college email, student ID and order history.
        </p>
      </section>
    </ProsePage>
  )
}
