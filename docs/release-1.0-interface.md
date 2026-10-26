# Interface and import update

The navigation is fixed on the left again. Activity and installation controls live inside it; previous right/top/hidden preferences are reset. Mobile navigation keeps its open/close button.

Word import accepts DOCX and text files up to 8 MB, extracts text locally, and shows editable text before candidate extraction. Google Docs users must download DOCX; Google Docs URLs and legacy binary DOC files are not parsed. Use a line containing `===` to separate instruments. The candidate preview processes one section at a time. Save each instrument as a separate draft; keep a copy of the extracted text when switching to the editor. Layout, branching, scoring and consent must be reviewed manually. This is conservative extraction, not an AI reconstruction of an instrument.

Administrators have an Analysis dashboard sidebar entry. It uses their existing authorized response data, with questionnaire filters, submission counts, choice distribution bars and numeric means. It is descriptive analysis, not statistical hypothesis testing. Published cloud questionnaires have individual Share link buttons. Drafts cannot be publicly shared.

Golden moments: triple-click Connected. Fifty cards mix ten short attributed quotations with forty clearly labelled original research reflections. Five brief card effects respect reduced-motion preferences; Escape or Back to research closes the overlay. The working screen is blurred behind it rather than shaken.

CivicAge reference reviewed: `DHANANAN/CivicAge-Survey`, deployment documentation at revision `d0d4ed4662341f766e69b5a5efc0cbb54b518f25`. Its consent and GPS accuracy concepts informed the review. Its Google Sheets / Drive deployment and strict GPS gate are not copied into the Firebase application. Optional GPS and existing administrator/surveyor permissions remain as requested.

No new Firebase rules are needed for these interface/import changes. Production deployment still depends on Vercel building the pushed main branch. Verify the signed-out page in both themes after updating; cached pages may need a reload.
