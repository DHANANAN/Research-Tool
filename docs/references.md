# Reference tools and design lessons

These references inform the proposed product; they do not describe features already implemented in Research-Tool. Sources were checked on 25 October 2026 using the tools' official GitHub documentation repositories. The published KoboToolbox and ODK documentation sites returned proxy access errors in this environment, so their corresponding official source files were read instead.

See [Design inspirations](design-inspirations.md) for the user's broader comparison, independent checks of Survey Solutions/LimeSurvey sources, and a feature-to-milestone mapping that keeps the initial release focused.

## KoboToolbox

| Official reference | Observed workflow | Lesson for Research-Tool |
| --- | --- | --- |
| [Quickstart guide](https://github.com/kobotoolbox/docs/blob/master/source/quick_start.md) | Create a project, build a form or upload XLSForm, preview, deploy, collect, then manage data. | Keep questionnaire drafting, testing, publication, and real response collection separate. |
| [Adding questions in the Formbuilder](https://github.com/kobotoolbox/docs/blob/master/source/question_types.md) | Questions have labels, types, answer choices, and data column names used in logic and exports. | Let researchers edit readable wording while preserving stable question identifiers for analysis. |
| [Collecting data using web forms](https://github.com/kobotoolbox/docs/blob/master/source/data_through_webforms.md) | Browser collection supports cached offline forms, a submission queue, and home-screen shortcuts. Forms must load while online before offline use. | Show explicit offline readiness and pending-upload status. A home-screen shortcut alone does not guarantee offline availability. |
| [Exporting and downloading data](https://github.com/kobotoolbox/docs/blob/master/source/export_download.md) | Downloads include Excel `.xlsx` and CSV, with choices between readable labels and stable question/choice names. | Make Excel the main research deliverable and include a codebook linking stable names to question text and choice labels. |
| [Advanced export options](https://github.com/kobotoolbox/docs/blob/master/source/advanced_export.md) | Multiple-choice answers can use separate indicator columns; exports can include different form versions, selected questions, and date filters. | Specify how sub-answers, versions, filters, dates, and missing values are represented before building the exporter. |
| [Using XLSForm with KoboToolbox](https://github.com/kobotoolbox/docs/blob/master/source/xlsform_with_kobotoolbox.md) | Spreadsheet form definitions can be downloaded, edited, imported, previewed, and deployed. Imported changes need explicit review and redeployment. | Consider XLSForm interoperability after the core workflow; never treat imported questionnaire definitions as automatically ready for field use. |

## ODK

| Official reference | Observed workflow | Lesson for Research-Tool |
| --- | --- | --- |
| [ODK Forms](https://github.com/getodk/docs/blob/master/docs/form-design-intro.rst) | Enumerators use structured questions, groups, repeats, validation, and form logic. XLSForm is a common authoring format. | Start with a limited, tested set of question types and rules; extend to repeats without losing the relationships between answers. |
| [Managing Forms in Central](https://github.com/getodk/docs/blob/master/docs/central-forms.rst) | Draft forms can be tested before publication. Updates create a new draft, and access is controlled separately from publication. | Publishing a questionnaire should be an explicit action. Editing a draft must preserve existing field records and their original form version. |
| [Managing Submissions in Central](https://github.com/getodk/docs/blob/master/docs/central-submissions.rst) | Collection permissions differ from management permissions. Collected data can be downloaded as CSV tables or connected to analysis tools. Web and Android clients have different capabilities. | Surveyors need a focused collection interface and restricted permissions. Test the supported browser workflow on actual target devices instead of assuming native-app equivalence. |

## Boundaries and reuse

- **XLSForm is a questionnaire definition format.** It describes questions and rules. The requested Excel response workbook is a separate output containing collected answers. Supporting one does not imply supporting the other.
- PDF-to-questionnaire conversion is a proposed Research-Tool workflow, not a capability established by these references. Extraction must produce an editable draft for human review; OCR and complex layouts need separate validation.
- These sources provide design inspiration. Research-Tool does not currently claim KoboToolbox/ODK feature parity, data compatibility, integrations, or affiliation.
- This document summarizes workflows in original wording. No upstream code, assets, or documentation text is copied into the product. Before reusing any implementation or library, review its actual license and preserve any required notices; a project license cannot relicense third-party material.
