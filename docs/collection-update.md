# Collection and questionnaire overview update

Republish `firestore.rules` in Firebase Console → Firestore Database → Rules before testing public submissions. The public form now requires a nonempty email/mobile identifier before showing questions. It is explicitly self-reported and not verified by email or OTP. The identifier is stored with private responses and included in the browser Excel export. Existing field submissions and existing responses do not require that field. Legacy public clients without an identifier will be rejected once the updated rules are deployed.

Re-import Indian Caste Inquiry using the default section-splitting setting. The result is three main drafts, with four demographic questions included in each: 14, 14 and 21 answer fields. Headings are display elements rather than answer fields. The old combined questionnaire remains unchanged to preserve its existing responses. Review and publish the new drafts and share their new links.

Responses default to newest first. Filter by questionnaire, collector and received date (UTC); sort newest, oldest or collector name. These controls affect the table and charts. Downloads still include all responses for the selected questionnaire, clearly indicated beside the controls.

The analysis dashboard now has five whole-dataset views: submissions by collector, submissions by day, field/online sources, answered/missing applicable answer slots, and missing answers by question. Filter to one questionnaire to inspect that instrument. Conditional skipped slots are excluded from completeness. It is not a psychometric scale score or a combined interpretation of unlike answer types.

Logo activity: green while interacting, yellow after 30 seconds idle, red after 60 seconds or when hidden. Pastel leaf colours change every 30 seconds. Bookmark and dock navigation keep controls on the same horizontal strip, with horizontal scrolling where needed on narrow screens.
