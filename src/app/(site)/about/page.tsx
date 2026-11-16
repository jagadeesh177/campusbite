import type { Metadata } from 'next'
import { ProsePage } from '@/components/site/prose-page'

export const metadata: Metadata = { title: 'About' }

export default function AboutPage() {
  return (
    <ProsePage title="About CampusBite" intro="A pre-ordering platform built for the way campus breaks actually work.">
      <section>
        <h2>Why we built it</h2>
        <p>
          Lunch breaks are short and canteen queues are long. CampusBite lets users order from wherever they are on
          campus, pay online, and walk up only when their food is ready — while giving the kitchen a calm, organised
          view of every order.
        </p>
      </section>
      <section>
        <h2>Who can use it</h2>
        <p>
          Users create their own account with any personal email address (Gmail, Outlook, Yahoo and more) and
          verify it through a one-time activation link. Canteen and staff accounts are created only by authorised
          administrators.
        </p>
      </section>
      <section>
        <h2>What we keep</h2>
        <p>
          CampusBite only keeps the minimum needed to run your orders: your name, email, mobile number and order
          history.
        </p>
      </section>
    </ProsePage>
  )
}
