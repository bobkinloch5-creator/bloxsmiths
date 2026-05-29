# BloxSmith Changelog

## Latest Updates

### Profile Security
- Added two-factor authentication setup directly inside the user profile/account area.
- Users can now enable 2FA with an authenticator app by scanning a QR code.
- Users can verify their authenticator code, view active authenticators, and remove 2FA from their account.
- Added a profile-based Change Password section so users can update their password from account settings.
- Login now detects accounts that require 2FA and routes them through MFA verification before entering the dashboard.
- Added a global MFA session guard so protected pages stay locked until 2FA-enabled users finish verification.
- Improved the 2FA sign-in page so users can enter their authenticator code and continue back to the page they were trying to open.

### Profile Usage Analytics
- Improved the profile usage analytics section with a more premium dashboard look.
- Added stronger neon/glass styling, glow effects, better card hover states, and cleaner chart panels.
- Improved the model usage table styling so operation logs feel more like a real account dashboard.
- Cleaned up old Gemini Pro display references in profile analytics so removed models do not show as selectable or promoted.

### AI Models
- Removed Gemini Pro from the selectable model list.
- Kept Gemini Flash as the fast fallback model.

### Chat Helper
- Repositioned the AI Help chat assistant properly across the site.
- Improved mobile and desktop placement with safe-area spacing.
- Made the chat panel act like a bottom sheet on mobile and a floating card on desktop.

### Themes
- Added the official BloxSmith branded neon theme/background into the theme system.
