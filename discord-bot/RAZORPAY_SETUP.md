# Razorpay Setup

This bot now supports automatic premium activation through Razorpay Payment Links.

## 1. Add env vars

Copy the keys from `.env.example` into your real `.env` and replace the placeholder values:

```env
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
RAZORPAY_CURRENCY=INR
RAZORPAY_PREMIUM_MONTHLY_AMOUNT=9900
RAZORPAY_PREMIUM_YEARLY_AMOUNT=99900
RAZORPAY_PREMIUM_LIFETIME_AMOUNT=499900
RAZORPAY_CALLBACK_URL=https://your-domain.com/premium/success
RAZORPAY_CALLBACK_METHOD=get
```

Amounts are in currency subunits. For INR:

- `9900` = Rs.99.00
- `99900` = Rs.999.00
- `499900` = Rs.4,999.00

## 2. How the payment flow works

When a user runs `/premium buy`, the bot creates a Razorpay Payment Link and returns the hosted payment URL in Discord.

When Razorpay sends a successful webhook:

- `payment_link.paid`

the bot automatically activates premium for that Discord user.

## 3. Configure the webhook in Razorpay

Set the webhook endpoint to:

```text
https://your-domain.com/razorpay/webhook
```

Subscribe to these events:

- `payment_link.paid`
- `payment_link.cancelled`
- `payment_link.expired`

Copy the webhook secret into:

- `RAZORPAY_WEBHOOK_SECRET`

The webhook signature is verified using the raw request body and the `X-Razorpay-Signature` header, as described in the official Razorpay webhook validation docs:

- https://razorpay.com/docs/webhooks/validate-test/
- https://razorpay.com/docs/webhooks/payloads/payment-links/

## 4. Premium plan behavior

- Monthly: adds 30 days of premium.
- Yearly: adds 365 days of premium.
- Lifetime: grants premium with no expiry.

If a user buys monthly or yearly again before expiry, the bot extends from the current expiry date instead of resetting from now.

## 5. Notes about recurring billing

This implementation uses Razorpay Payment Links because they fit Discord well by returning a direct hosted payment URL.

That means:

- premium activation is automatic
- premium extension is automatic after each payment
- recurring auto-renew subscriptions are not included in this version

If you want, I can build a Razorpay Subscriptions version later, but that usually needs a more web-style flow than a simple Discord payment link.

## 6. Production checklist

- Use live Razorpay keys in production.
- Use HTTPS for the webhook endpoint.
- Make sure your bot server is publicly reachable by Razorpay.
- Restart the bot after changing env vars.

## 7. Testing

Start the bot:

```powershell
npm start
```

Then use `/premium buy` in Discord and complete a test payment from the returned Razorpay link.

After payment, verify that the webhook hits:

```text
/razorpay/webhook
```

and the user's premium status updates.
