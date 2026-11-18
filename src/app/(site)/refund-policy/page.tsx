import type { Metadata } from 'next'
import { ProsePage } from '@/components/site/prose-page'

export const metadata: Metadata = { title: 'Cancellation and Refund Policy' }

export default function RefundPolicyPage() {
  return (
    <ProsePage
      title="Cancellation and Refund Policy"
      intro="How cancellations and refunds work for orders placed on CampusBite (GetCampusBite). Last updated 18 November 2026."
    >
      <section>
        <h2>Cancelling an order</h2>
        <ul>
          <li>Unpaid orders can be cancelled at any time and expire automatically after 30 minutes. No money is taken.</li>
          <li>A paid order can be cancelled from <strong>My Orders</strong> until the canteen accepts it. You get a full refund.</li>
          <li>Once the canteen has started preparing your food, the order can no longer be cancelled.</li>
        </ul>
      </section>
      <section>
        <h2>When you are refunded automatically</h2>
        <ul>
          <li>The canteen rejects or cannot prepare your order: full refund.</li>
          <li>Your payment reached us after the order had already expired: full refund.</li>
          <li>You were charged twice for the same order: the extra payment is refunded.</li>
        </ul>
      </section>
      <section>
        <h2>How long refunds take</h2>
        <p>
          Refunds go back to the original payment method (UPI, card, net banking or wallet) through our payment
          partner Razorpay. They usually reach you within 5–7 working days, depending on your bank.
        </p>
      </section>
      <section>
        <h2>Problems with your food</h2>
        <p>
          If an item is missing or wrong, tell the canteen counter when you collect it, or email us within 24 hours with
          your order number. We will review it and refund the affected item where appropriate.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Email <a href="mailto:easalajagadeesh@gmail.com">easalajagadeesh@gmail.com</a> with your order number for any
          cancellation or refund question.
        </p>
      </section>
    </ProsePage>
  )
}
