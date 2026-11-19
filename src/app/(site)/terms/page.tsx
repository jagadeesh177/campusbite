import type { Metadata } from 'next'
import { ProsePage } from '@/components/site/prose-page'

export const metadata: Metadata = { title: 'Terms and Conditions' }

export default function TermsPage() {
  return (
    <ProsePage
      title="Terms and Conditions"
      intro="These terms apply to orders placed on CampusBite (GetCampusBite), operated by Easala Jagadeesh. Last updated 18 November 2026."
    >
      <section>
        <h2>Eligibility</h2>
        <p>CampusBite is available to users who sign up with a verified Gmail address or Google account, and to authorised canteen and college staff.</p>
      </section>
      <section>
        <h2>Orders and payment</h2>
        <ul>
          <li>Prices are shown in Indian Rupees (₹) and are confirmed by our servers at checkout.</li>
          <li>An order is confirmed only after payment is verified by the payment gateway.</li>
          <li>Unpaid orders expire automatically after 30 minutes.</li>
        </ul>
      </section>
      <section>
        <h2>Cancellations and refunds</h2>
        <ul>
          <li>You may cancel a paid order before the canteen accepts it for a full refund.</li>
          <li>If the canteen cannot fulfil your order, you receive a full refund.</li>
          <li>Refunds are returned to the original payment method, typically within 5–7 working days.</li>
        </ul>
      </section>
      <section>
        <h2>Pickup</h2>
        <p>
          Collect your order from the counter using your pickup code. Each code works once. Please collect within your
          chosen pickup slot.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>Accounts are personal. Don&apos;t share your login or pickup codes, and don&apos;t attempt to misuse the service.</p>
      </section>
    </ProsePage>
  )
}
