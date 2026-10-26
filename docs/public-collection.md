# Enable public questionnaires

1. Open Firebase Console → Firestore Database → Rules.
2. Copy the repository's `firestore.rules` into the editor and click Publish. Keep the restrictive rules; do not enable test mode.
3. Wait for Vercel to deploy main.
4. Review and publish a questionnaire, then click Share public form in Questionnaires and copy its link.
5. Test in a private browser window with fictional answers. Check Responses & exports, Response insights, and Excel.
6. Close the original questionnaire to stop public viewing and submissions.

Public participants need no account. Only questionnaire content is publicly readable; existing responses remain private. Anyone with the link can submit, including repeat submissions. This release does not provide spam prevention or verify participant identity. Public responses are labelled Online participant. Multiple-choice percentages can total more than 100%.

Version 1.0 adds optional GPS and small compressed photo/screenshot answers in Firebase and playground mode. GPS requires HTTPS and explicit browser permission; it is self-reported device evidence, not proof of identity or genuine participation. Add an optional GPS question and describe its study city in the builder. GPS questions cannot be required. This release records coordinates and accuracy; it does not enforce geofences.

Image answers are compressed thumbnails (under 18 KB of encoded text), not original-quality research photographs. They are stored with the private response and exported as encoded text. Avoid sensitive images unless your consent protocol covers them. Question illustrations accept public HTTPS URLs. Profile photos are personal to this browser and do not sync to the team directory. Full-size uploads and shared study cover images remain future work. New question kinds are for Firebase/playground; the legacy Rust server does not support them.

To identify public respondents by email, add a clearly labelled text question and explain why you collect it. These email answers are self-reported and unverified. Automatic Google identity and email verification are not implemented.

Navigation can be left, right, top, or hidden using Navigation above the study. Activity shows green while interacting, yellow after one idle minute, and red when the document is hidden. Install app shortcut provides the browser prompt where supported, otherwise platform instructions. Footer links appear on hover or keyboard focus; mobile devices show them directly. Triple-click Connected for an original encouragement message.

The discreet creator credit uses Dhananjay from the project context. The education motto is original wording, not a quotation attributed to an institution. The existing repository license governs software reuse.
