import type { Metadata } from 'next'
import { ProsePage } from '@/components/site/prose-page'

export const metadata: Metadata = { title: 'Support' }

export default function SupportPage() {
  return (
    <ProsePage title="Support" intro="Answers to common questions. Still stuck? Email easalajagadeesh@gmail.com.">
      <section>
        <h2>I can&apos;t activate my account</h2>
        <p>
          Check your Junk/Spam folder for the activation email. Each link works once and expires after 15 minutes,
          and only one email is sent every 15 minutes — if your link has expired, request a new one from the
          Create Account page. Already activated? Use &ldquo;Forgot password?&rdquo; on the sign-in page.
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
          Email <a className="font-medium text-primary underline" href="mailto:easalajagadeesh@gmail.com">easalajagadeesh@gmail.com</a> with
          your order number (it starts with <strong>CB-</strong>) and we&apos;ll get back to you.
        </p>
      </section>
    </ProsePage>
  )
}
