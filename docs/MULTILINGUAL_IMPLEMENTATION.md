# Multilingual support — implementation notes

## 1. Architecture summary

- **UI:** `react-i18next` + `i18next`. No locale routes. Default `en`. Preference in `localStorage` (`fuelfinder-locale`).
- **Language switcher:** Account → Appearance / Language (English, Hausa, Yoruba, Igbo).
- **APIs:** optional `locale` on `POST /ai/chat` and `POST /ai/recommend`. Omitted = English, same as today.
- **Groq:** additive HA/YO/IG finder/domain patterns; English prompts unchanged when locale is missing.
- **Gemini:** same verification pipeline and threshold; prompt notes multilingual signage; summaries stay English.
- **Database:** no migration.

## 2. Files changed

Frontend i18n config/locales, LocaleProvider, LanguageSelector, chrome (header, nav, account, theme, error boundary), AI request locale, Groq/Gemini prompts, optional schema fields.

## 3. New dependencies

- `i18next`
- `react-i18next`

## 4. Risk assessment

- English chrome keys match previous copy so default users see no change.
- Routing is additive; English fixtures still pass.
- Recommendation cache keys include locale.
- Gemini scoring/status logic untouched.

## 5. Test results

- Backend: `690 passed, 2 skipped`
- Frontend: `552 passed`
- `npm run lint` — clean
- `npx tsc --noEmit` — clean
- `npm run build` — success

## 6. Rollback plan

Revert this PR. No schema change. Clients that omit `locale` keep working on old or new servers.
