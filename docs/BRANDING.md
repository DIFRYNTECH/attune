# Attune Branding

The approved mark is the folded-ribbon A with a rising inner-path crossbar.
The app palette is unchanged. Web headers use the white A on a periwinkle tile
in both themes; the standalone mark retains its periwinkle ribbon shading.

## Assets

- Geometry and gradients: `scripts/lib/attune-brand.mjs`.
- Regenerate web, email, Android launcher and splash assets: `npm run brand:generate`.
- App icon: `public/attune-app-icon.svg`; standalone mark: `public/attune-logo-final.svg`.
- Email: `public/attune-email-logo-v2.png` (256px, displayed at 64px).
- The older SVG email URL remains supported, but new templates use PNG because
  SVG image support varies between mail clients.
- Native resources take effect in the next Android build, not through a web deployment.

## Hosted Emails

`supabase/email-templates/*.html` contains the UAT bodies for all 13 authentication
and security templates. Their existing action URLs, OTP variables and security
messages are preserved. Subjects and notification switches are not changed.
These files are deployment references; pushing Git does not configure Supabase Auth.

Publish the PNG at `https://uat.useattune.co/attune-email-logo-v2.png` before applying
the templates in Supabase Authentication > Emails. Verify the saved source and
preview. Do not send an unsolicited test email or change authentication settings.

Before applying to a different environment, replace only the public asset origin
with that environment's deployed origin. Never point a production email at an
undeployed or preview-only asset.
