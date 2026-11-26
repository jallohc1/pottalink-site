# pottalink-site

The public website for Pottalink at https://pottalink.com: home page, SMS terms and privacy policy. Plain HTML and one CSS file, served by GitHub Pages from the `main` branch. No build step, no JavaScript.

| Page | File |
| --- | --- |
| https://pottalink.com/ | `index.html` |
| https://pottalink.com/sms-terms/ | `sms-terms/index.html` |
| https://pottalink.com/privacy/ | `privacy/index.html` |
| https://pottalink.com/.well-known/assetlinks.json | `.well-known/assetlinks.json` |

The SMS terms and privacy policy are referenced by the AWS SMS spending-limit request and the US toll-free number registration. Their wording (opt-in text, STOP and HELP, "not shared with third parties") is what carriers check, so change them with care and keep the app's consent checkbox text identical to the one quoted on `/sms-terms/`.

`CNAME` sets the custom domain; `.nojekyll` tells GitHub Pages to serve the files as they are (it also makes Pages serve the `.well-known` folder). DNS records for pottalink.com are in Route 53 in the AWS account that holds the domain.

## App links for passkeys

Passkeys belong to pottalink.com, and the community apps use them too (hha-app, ADR 0019 and ADR 0022). Android checks `/.well-known/assetlinks.json` before an app may use this domain's passkeys:

- It must answer `200` with `Content-Type: application/json`, with no redirect.
- `delegate_permission/common.get_login_creds` lets the listed app use pottalink.com's sign-in credentials, passkeys included. `handle_all_urls` (Android App Links, opening pottalink.com links in the app) is not granted.
- Listed app: `com.pottalink.hha`, signed by the EAS upload key (SHA-256 `94:12:43:BC:…:DF:64:39`; full value in hha-app ADR 0022). When the app is on Google Play, the Play app signing key's SHA-256 is added to the same `sha256_cert_fingerprints` list. Each new community app gets its own entry.
- Check what Google reads: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://pottalink.com&relation=delegate_permission/common.get_login_creds`

The iOS file (`/.well-known/apple-app-site-association`) is added once there is an Apple Team ID.

Preview locally: `python3 -m http.server 8000`, then open http://localhost:8000.
