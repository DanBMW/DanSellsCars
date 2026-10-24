# Turning on Continue with Google (free)

The button is already built into the Swipe Drive sign in screen and the end of the Revvy chat. It stays hidden
until `GOOGLE_LOGIN_ENABLED: true` in `swipe-drive/config.js`. Do these steps first, in this order.

## 1. Google Cloud: create the OAuth client (free, no billing needed)
1. Go to https://console.cloud.google.com/ and sign in with the Google account that should own it.
2. Top bar project picker, then **New project**. Name it `Swipe Drive`, then **Create** and select it.
3. Menu, **APIs and Services**, then **OAuth consent screen** (now called **Google Auth Platform**, **Branding**).
   * User type: **External**.
   * App name: `Swipe Drive`. User support email: your address.
   * App domain: home page `https://dan-sells.co.uk/swipe-drive/`, privacy `https://dan-sells.co.uk/privacy.html`, terms `https://dan-sells.co.uk/terms.html`.
   * Authorised domains: `dan-sells.co.uk` and `supabase.co`.
   * Scopes (Data access): only `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. These need no Google review.
   * **Audience**: press **Publish app** so it is "In production". Without this only listed test users can sign in.
4. **Clients** (or **Credentials**), then **Create client**, then **OAuth client ID**.
   * Application type: **Web application**. Name: `Swipe Drive Supabase`.
   * Authorised JavaScript origins: `https://dan-sells.co.uk`
   * Authorised redirect URIs, exactly:
     `https://dexqyqrbelmdjdhxaboq.supabase.co/auth/v1/callback`
   * **Create**. Copy the **Client ID** and **Client secret**.

## 2. Supabase: paste them in
1. https://supabase.com/dashboard/project/dexqyqrbelmdjdhxaboq/auth/providers
2. Open **Google**, switch **Enable Sign in with Google** on.
3. Paste the **Client ID** into *Client IDs* and the **Client secret** into *Client Secret (for OAuth)*. Save.
4. Authentication, URL Configuration: Site URL stays `https://dan-sells.co.uk/swipe-drive/`. The redirect list
   already has `https://dan-sells.co.uk/swipe-drive/`, which is where Google sign in returns to.

The secret only ever lives in Supabase. Never put it in the repo or config.js.

## 3. Switch the button on
In `swipe-drive/config.js` set `GOOGLE_LOGIN_ENABLED: true`, bump the cache in `swipe-drive/sw.js`, push.
Answers from the chat are still saved after a Google sign in: the chat marks them as waiting, and the app saves
them to the profile as soon as Google sends the customer back to Swipe Drive.
