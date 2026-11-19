# pottalink-site

The public website for Pottalink at https://pottalink.com: home page, SMS terms and privacy policy. Plain HTML and one CSS file, served by GitHub Pages from the `main` branch. No build step, and no JavaScript except the temporary `/passkey-test/` page.

| Page | File |
| --- | --- |
| https://pottalink.com/ | `index.html` |
| https://pottalink.com/sms-terms/ | `sms-terms/index.html` |
| https://pottalink.com/privacy/ | `privacy/index.html` |
| https://pottalink.com/passkey-test/ | `passkey-test/` (temporary, hha-dev only; not linked, not indexed; remove after the F4b passkey test) |

The SMS terms and privacy policy are referenced by the AWS SMS spending-limit request and the US toll-free number registration. Their wording (opt-in text, STOP and HELP, "not shared with third parties") is what carriers check, so change them with care and keep the app's consent checkbox text identical to the one quoted on `/sms-terms/`.

`CNAME` sets the custom domain; `.nojekyll` tells GitHub Pages to serve the files as they are. DNS records for pottalink.com are in Route 53 in the AWS account that holds the domain.

Preview locally: `python3 -m http.server 8000`, then open http://localhost:8000.
