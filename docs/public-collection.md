# Enable public questionnaires

1. Open Firebase Console → Firestore Database → Rules.
2. Copy the repository's `firestore.rules` into the editor and click Publish. Keep the restrictive rules; do not enable test mode.
3. Wait for Vercel to deploy main.
4. Review and publish a questionnaire, then click Share public form in Questionnaires and copy its link.
5. Test in a private browser window with fictional answers. Check Responses & exports, Response insights, and Excel.
6. Close the original questionnaire to stop public viewing and submissions.

Public participants need no account. Only questionnaire content is publicly readable; existing responses remain private. Anyone with the link can submit, including repeat submissions. This release does not provide spam prevention or verify participant identity. Public responses are labelled Online participant. Multiple-choice percentages can total more than 100%.

Photo/screenshot uploads and dedicated GPS questions are deferred. They need a storage and privacy design; Firebase Storage may require billing. Do not store image files inside Firestore responses. A normal text question can collect a voluntarily supplied location for now.

The discreet creator credit uses Dhananjay from the project context. The education motto is original wording, not a quotation attributed to an institution. The existing repository license governs software reuse.
