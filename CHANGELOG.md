# BloxSmith Changelog

## Latest Updates

### Profile Customization
- Added real profile picture/avatar uploads inside the user profile page.
- Added profile banner uploads so users can customize their account with a wide cover image.
- Improved profile uploads with image compression, instant previews, and better error handling.
- Added a fallback save method so avatars/banners can still save through account metadata if storage policies are not ready yet.
- Added Roblox-style generated avatars for users who do not upload a profile picture.
- Profile pictures now display as the user icon in the website header/account menu.
- The account dropdown now shows the user's avatar and banner for a more complete profile-card feel.
- Mobile navigation now includes a Profile shortcut that uses the user's uploaded or generated avatar.

### AI Model Guide
- Added a Roblox AI model guide on AI/model areas of the website.
- The guide explains what each model is best used for when building Roblox games.
- Added model tips for ChatGPT, Claude, Gemini Flash, fast/open models, and image models.
- Users can now better understand which model to choose for scripting, debugging, game planning, thumbnails, UI, and Roblox assets.

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
