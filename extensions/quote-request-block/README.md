# Request a Quote — theme app extension

A merchant adds this block to their **product template** via the theme editor
(Customize → product page → Add block → Request a Quote).

## How it works

1. The block renders a container on the product page. Its script calls the
   app's **config endpoint** through the Shopify app proxy
   (`/apps/quote-requests/config?product=...`) to learn whether quote requests
   are enabled, whether this product is eligible, and how the form should
   render (button label, optional fields).
2. Clicking the button opens a modal form (name, email, optional company /
   phone, quantity, notes).
3. On submit the script POSTs to `/apps/quote-requests/submit`. Shopify's app
   proxy adds the HMAC signature + shop param, so the app can trust the shop
   and re-verify the selected variant against the Admin API before storing.

## App proxy setup (Partner Dashboard)

For the block to talk to the app you must configure an app proxy:

- **Subpath prefix:** `apps`
- **Subpath:** `quote-requests` (must match `SHOPIFY_APP_PROXY_SUBPATH`)
- **App proxy URL:** `https://{SHOPIFY_APP_URL}/quote-requests`

Both proxy routes in the app live at `app/routes/quote-requests.*.tsx`.

## Local development

```sh
npm run dev
```

Then install the app on a dev store and add the block to the product template.
No API key or token lives in this extension; all state comes from the proxy
endpoints at request time.
