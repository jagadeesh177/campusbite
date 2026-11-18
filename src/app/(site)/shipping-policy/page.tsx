import type { Metadata } from 'next'
import { ProsePage } from '@/components/site/prose-page'

export const metadata: Metadata = { title: 'Pickup and Delivery Policy' }

export default function ShippingPolicyPage() {
  return (
    <ProsePage
      title="Pickup and Delivery Policy"
      intro="CampusBite (GetCampusBite) does not ship or deliver. All orders are collected in person from the college canteen. Last updated 18 November 2026."
    >
      <section>
        <h2>How you receive your order</h2>
        <ul>
          <li>After your payment is confirmed, you get a one-time pickup code and QR code in <strong>My Orders</strong>.</li>
          <li>Show the code at the canteen counter to collect your food. Each code works once.</li>
          <li>You choose &quot;as soon as possible&quot; or a pickup time slot at checkout. Typical preparation time is 10–20 minutes.</li>
          <li>We tell you on the site when your order is ready.</li>
        </ul>
      </section>
      <section>
        <h2>No shipping charges</h2>
        <p>There is no delivery or shipping fee. The total you see at checkout (food plus any convenience fee) is all you pay.</p>
      </section>
      <section>
        <h2>Uncollected orders</h2>
        <p>Please collect your order within your pickup slot. Food that is not collected the same day cannot be kept or refunded.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Email <a href="mailto:easalajagadeesh@gmail.com">easalajagadeesh@gmail.com</a> with your order number.
        </p>
      </section>
    </ProsePage>
  )
}
