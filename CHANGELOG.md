# BloxSmith Changelog

## Latest Updates

### Profile Fixes
- Fixed profile settings not saving correctly.
- Added a stronger fallback save system for display name, bio, and studio specialty.
- Profile details now save into the profile table and auth metadata when needed.
- Profile data refreshes after saving so users see the newest info right away.

### Credit Deduction
- Tightened credit deduction for AI image generation.
- Tightened credit deduction for Roblox clothing generation.
- Added fallback credit charging if the Supabase credit RPC is missing or not working.
- Added credit transaction logging for successful paid generations.
- Owners/admins can still generate without being charged.

### Profile Customization
- Added real profile picture/avatar uploads inside the user profile page.
- Added profile banner uploads so users can customize their account with a wide cover image.
- Added Roblox-style generated avatars for users who do not upload a profile picture.
- Profile pictures now display as the user icon in the website header/account menu.

### AI Model Guide
- Added a Roblox AI model guide on AI/model areas of the website.
- The guide explains what each model is best used for when building Roblox games.

### Profile Security
- Added two-factor authentication setup directly inside the user profile/account area.
- Added Change Password inside profile settings.
- Login now supports accounts that require 2FA verification.

### AI Models
- Removed Gemini Pro from the selectable model list.
- Kept Gemini Flash as the fast fallback model.

### Chat Helper
- Repositioned the AI Help chat assistant properly across the site.

### Themes
- Added the official BloxSmith branded neon theme/background into the theme system.
