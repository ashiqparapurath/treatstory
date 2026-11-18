# TreatStory — India-wide rollout checklist

TreatStory was founded in Kerala and is moving toward discovery by buyers and creators throughout India. **An India-wide catalogue does not mean every seller ships nationwide.** Each seller controls delivery coverage and accepts or rejects order requests; a buyer-facing price/availability filter currently sorts loaded listings, not guaranteed national inventory.

## Implemented in PR #27

- India-wide homepage, Explore, new arrivals, creator onboarding and structured-data/SEO copy (with Kerala retained as the place of origin in the story).
- Seller onboarding collects city/town and state or union territory, which are shown publicly at city/state level; existing sellers can update those fields in Store Settings.
- Seller Delivery settings now distinguish:
  - **Confirm with buyer** — no general serviceability claim; existing blank-PIN sellers keep their current order-request process.
  - **Selected PIN codes** — restrict order requests to the seller's configured six-digit Indian PINs (up to 10).
  - **Across India** — an explicit opt-in to receive nationwide delivery requests. **This does not promise a courier, fixed transit time, COD, or a guaranteed shipping fee.**
- Both direct seller checkout and custom-quote checkout validate the seller's delivery coverage on the server.
- Existing Indian delivery address format, INR pricing, buyer accounts, and approval/permissions remain in place.
- Explore filters apply to currently loaded standard and seller products, and its sorting is per product collection. They are not a national catalogue index.

## Required before advertising nationwide delivery

- [ ] Verify that participating sellers can fulfil the selected destination PIN codes through their courier / local-delivery arrangements, including remote areas and Union Territories.
- [ ] Confirm shipping charges, COD eligibility, expected delivery dates, cancellations, breakage/returns, and handling of failed delivery before sellers accept orders. **The current checkout uses the seller's flat delivery charge and collects no online payment; do not represent it as a fully integrated national shipping quote.**
- [ ] Add actual courier rate and serviceability APIs, pickup scheduling, tracking numbers and delivery status webhooks before offering automated nationwide shipping estimates.
- [ ] For home bakes and other food items, review packaging, storage, shelf life, cold chain/temperature controls, and transport distance. Keep unsafe-to-ship items limited to appropriate local delivery and pickup.
- [ ] Check marketplace-level FSSAI e-commerce licensing requirements and food-seller registration/license compliance. FSSAI's **18 March 2026** direction notes that e-commerce entities facilitating food-product orders may need a central FSSAI license. Official information: https://www.fssai.gov.in/upload/advisories/2026/03/69baca7e9787aCompliance%20Obligation%20ONDC%20Model.pdf and https://foscos.fssai.gov.in/
- [ ] Ask a qualified Indian tax advisor to assess GST registration and e-commerce operator / TCS obligations for TreatStory's *actual* payment, invoicing and settlement model. GST portal guidance: https://tutorial.gst.gov.in/userguide/returns/FAQs_GSTR-8.htm
- [ ] Review the marketplace's consumer terms, refund/cancellation policies, customer support contacts and grievance-redressal process under the Consumer Protection (E-Commerce) Rules. Official rules: https://consumeraffairs.nic.in/sites/default/files/E%20commerce%20rules.pdf
- [ ] Ensure seller business location data is reviewed and that any displayed public locations are no more granular than city/state without explicit seller intent.
- [ ] Test genuine buyer/seller accounts from several Indian states, a restricted-PIN seller, an India-wide opt-in seller, and a pickup-only seller on Android, iOS and desktop. Validate cross-state COD, taxes and delivery quotes against actual operating arrangements.
- [ ] Update Search Console and merchant feeds only after national promises in the SEO copy match real seller coverage; do not generate thin city/state landing pages merely for ranking.

These are launch-readiness checks, not legal advice or a claim that India-wide shipping is available. No payment processor, courier API or license application was provisioned by this code change.
