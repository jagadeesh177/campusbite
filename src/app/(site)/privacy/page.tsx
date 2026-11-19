import type { Metadata } from 'next'
import { ProsePage } from '@/components/site/prose-page'

export const metadata: Metadata = { title: 'Privacy Policy' }

export default function PrivacyPage() {
  return (
    <ProsePage
      title="Privacy Policy"
      intro="How CampusBite (GetCampusBite) collects and uses your information. Last updated 18 November 2026."
    >
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Your name, email address and mobile number, entered when the canteen office creates your account. Your email is verified with a one-time link or by Google.</li>
          <li>Your orders: items, amounts, timestamps and pickup records.</li>
          <li>Payment references from the payment gateway. We never see or store your UPI PIN, card or bank details.</li>
          <li>Optional preferences you choose to share, such as your department or dietary preference.</li><li>Sign-in and email verification are handled by Supabase Auth; activation emails are delivered by our email provider.</li>
        </ul>
      </section>
      <section>
        <h2>What we don&apos;t do</h2>
        <ul>
          <li>We don&apos;t connect to or copy any college student database.</li>
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
        <p>Questions about your data: easalajagadeesh@gmail.com.</p>
      </section>
    </ProsePage>
  )
}
