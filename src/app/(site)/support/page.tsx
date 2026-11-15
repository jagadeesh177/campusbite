import type { Metadata } from 'next'
import { ProsePage } from '@/components/site/prose-page'

export const metadata: Metadata = { title: 'Support' }

export default function SupportPage() {
  return (
    <ProsePage title="Support" intro="Answers to common questions. Still stuck? Email canteen@college.edu.">
      <section>
        <h2>I can&apos;t activate my account</h2>
        <p>
          Use your official college email address. Activation codes are only sent to students who are currently
          enrolled according to college records. If you believe your enrollment is shown incorrectly, contact the
          college administration office.
        </p>
      </section>
      <section>
        <h2>Money was deducted but my order isn&apos;t confirmed</h2>
        <p>
          Orders are confirmed only after the payment gateway verifies your payment — this normally takes a few
          seconds. If a payment arrives after your order has expired, it is refunded automatically. Refunds usually
          reach your account in 5–7 working days.
        </p>
      </section>
      <section>
        <h2>Can I cancel an order?</h2>
        <p>
          You can cancel an unpaid order at any time, and a paid order until the canteen accepts it — a full refund is
          started automatically. Once the kitchen has started preparing your food, please speak to the counter.
        </p>
      </section>
      <section>
        <h2>The canteen rejected my order</h2>
        <p>If the kitchen can&apos;t fulfil an order (for example, an item ran out), the full amount is refunded automatically.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Email <a className="font-medium text-primary underline" href="mailto:canteen@college.edu">canteen@college.edu</a> with
          your order number (it starts with <strong>CB-</strong>) and we&apos;ll get back to you.
        </p>
      </section>
    </ProsePage>
  )
}
