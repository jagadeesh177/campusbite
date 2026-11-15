import type { Metadata } from 'next'
import { ProsePage } from '@/components/site/prose-page'

export const metadata: Metadata = { title: 'Privacy Policy' }

export default function PrivacyPage() {
  return (
    <ProsePage
      title="Privacy Policy"
      intro="Template policy for the pilot. Your college should review and adapt it before launch."
    >
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Your name, college email address and college student ID, confirmed with college records.</li>
          <li>Your orders: items, amounts, timestamps and pickup records.</li>
          <li>Payment references from the payment gateway. We never see or store your UPI PIN, card or bank details.</li>
          <li>Optional preferences you choose to share, such as a phone number or dietary preference.</li>
        </ul>
      </section>
      <section>
        <h2>What we don&apos;t do</h2>
        <ul>
          <li>We don&apos;t copy the college&apos;s student database — we only verify eligibility when you sign in.</li>
          <li>We don&apos;t sell or share your data with advertisers.</li>
        </ul>
      </section>
      <section>
        <h2>Who can see your data</h2>
        <p>
          Canteen staff see your name, student ID and order details so they can prepare and hand over food. Authorised
          college staff can view orders and payments for support, refunds and reporting. Sensitive actions are recorded
          in an audit log.
        </p>
      </section>
      <section>
        <h2>Security</h2>
        <p>
          Passwords are stored as one-way hashes, sessions use secure HTTP-only cookies, and payments are verified on
          our servers directly with the payment gateway.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Questions about your data: canteen@college.edu.</p>
      </section>
    </ProsePage>
  )
}
