import Link from 'next/link';
export function LegalContact() {
  const name = process.env.LEGAL_OPERATOR_NAME;
  const address = process.env.LEGAL_OPERATOR_ADDRESS;
  const email = process.env.LEGAL_CONTACT_EMAIL;
  const officer = process.env.LEGAL_GRIEVANCE_OFFICER;
  const phone = process.env.LEGAL_CONTACT_PHONE;
  return (
    <section className="space-y-3 rounded-2xl border p-5">
      <h2 className="text-xl font-semibold text-foreground">
        Contact and complaints
      </h2>
      {name && <p>Operator: {name}</p>}
      {address && <p>Address: {address}</p>}
      {officer && <p>Grievance officer: {officer}</p>}
      {email && (
        <p>
          <a href={'mailto:' + email} className="underline">
            {email}
          </a>
        </p>
      )}
      {phone && <p>Phone: {phone}</p>}
      <p>
        <Link href="/support" className="underline">
          Open a support request
        </Link>{' '}
        for an order, seller, privacy or account concern. Include the order
        reference and relevant details; do not send passwords or payment
        credentials.
      </p>
      {(!name || !address || !email || !officer || !phone) && (
        <p className="text-sm text-amber-900">
          Operator and grievance contact details are awaiting publication.
          Contact support before placing an order if you need these details.
        </p>
      )}
    </section>
  );
}
