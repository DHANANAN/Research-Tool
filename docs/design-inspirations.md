# Design inspirations for a universal research tool

Research-Tool's purpose is research and public benefit. The product direction is free, open-source, self-hostable software, with no built-in subscriptions, paid feature tiers, advertisements, or sale of research data. Hosting, devices, backups, connectivity, and administration can still have costs. A local demonstration does not establish a cost-free public deployment.

The repository's MIT license remains unchanged. This product mission is not a new license restriction: MIT permits downstream reuse, including commercial reuse. Do not describe a research-only/noncommercial restriction as a term of MIT or silently replace the open-source license.

The user supplied a comparison in `Pasted text.txt` and asked to learn from the strongest ideas across research platforms. This document turns that comparison into implementation priorities. It does not adopt its first-person verification claims, current prices, plan limits, vendor promises, or statements about deployed systems as established facts.

## Source labels

- **Official documentation checked:** KoboToolbox and ODK source documentation already recorded in [References](references.md).
- **Official repository checked for this comparison:** Survey Solutions README and `LICENSE.md`; LimeSurvey README and `LICENSE`. These files were fetched from the official GitHub repositories on 25 October 2026. Only the documented claims described below were checked; no application was installed or field-tested.
- **Supplied comparison only:** SurveyCTO, REDCap, ArcGIS Survey123, and Qualtrics descriptions. Their current features, institutional access, prices, terms, and supported offline modes were not independently verified in this task.

All are design references. No integration, endorsement, equivalent feature set, compatible file format, reconstructed proprietary code, or benchmark result is claimed.

## Features to learn from and when to build them

Milestones refer to the [delivery roadmap](roadmap.md). A mapped feature is a requirement or design lesson, not an implemented or verified capability.

| Reference | Evidence status and useful idea | Research-Tool implementation direction | Scope |
| --- | --- | --- | --- |
| KoboToolbox | Official documentation checked: draft/preview/deploy lifecycle, browser offline preparation, queue visibility, stable export names, and choice-column exports. | Make a form's publication explicit; show device readiness and pending responses; export one row per received interview with typed answer columns and a version-specific codebook. | Core: milestone 1 authoring/Excel and milestone 2 offline collection. Multilingual forms and richer question types come later. |
| ODK Collect and Central | Official documentation checked: separate form design, deployment, collection permissions, and data management. Native Android and browser workflows have different capabilities. | Use server-enforced project permissions, immutable form versions, a durable receipt, and safe retry behavior. Test the web client on its actual supported browsers. | Core: milestones 1–2. XLSForm interchange, repeats, and broader client compatibility are later work. |
| SurveyCTO | Supplied comparison only: field research emphasis on validation, monitoring, and data-quality review. | Present validation failures and review outcomes honestly; preserve original answers, corrections, and audit context instead of turning a failed upload into “submitted.” | Core validation in milestone 1; basic administrator review/correction in milestone 3. Advanced monitoring and automated quality rules are later. |
| World Bank Survey Solutions | Official README checked: Designer, Web Tester, Headquarters, export service, and separate Android interviewer/supervisor components. | Separate questionnaire preview from real collection; keep collector assignments explicit; consolidate accepted server records for export. | Project assignment and preview in milestone 1. Dedicated supervisor queues, multi-stage approval, and nearby device relay are later, not implied by the initial two roles. |
| REDCap | Supplied comparison only: research records, consent, user rights, and data-access groups. | Preserve versioned study information/consent and enforce record/project permissions. Design stable identifiers suitable for future repeated visits. | Consent/access controls in milestone 1 and operations in milestone 3. Longitudinal visit structures, repeat records, and institutional integrations are later. No regulatory-compliance claim follows from adopting these ideas. |
| ArcGIS Survey123 | Supplied comparison only: geography-oriented field forms and spatial accessibility work. | Keep location collection optional and study-specific; allow later map-friendly exports without requiring every study to collect GPS. | Later: maps, GPS questions, geospatial files, and spatial workflows. No ArcGIS account or paid service is a dependency of the core application. |
| LimeSurvey | Official README checked: adaptable questionnaires, conditional logic, question branching, multilingual support, and templates. | Make a blank project and editable form builder useful across disciplines; use stable codes independently of display wording; preview before publication. | Core builder/conditions in milestone 1. Translation management, expanded templates, and advanced logic are later. No native offline guarantee was verified. |
| Qualtrics | Supplied comparison only: sophisticated questionnaire design and institution-oriented research administration. | Prioritize understandable editing, clear preview, and reproducible export definitions rather than importing a large vendor-specific feature surface. | Core editing/preview in milestone 1. Randomization, advanced survey flows, panel management, and institutional integrations are outside the initial scope. |

“Accepted server records” above means payloads durably received and validated by the server, independently of a researcher's included/excluded review decision. Default exports and their explicit filters must make that distinction clear.

## Shared design principles

1. **One authoritative dataset:** a response has a stable ID and original form version. Export confirmed server records, not an assumed merge of per-investigator documents.
2. **Field reliability before breadth:** local drafts, interrupted interviews, visible upload states, and safe reconnect/retry behavior matter before maps, voice transcription, dashboards, or extra services.
3. **Researcher-controlled questions:** PDF extraction or future assistance proposes drafts. Researchers decide wording, types, branches, consent, translations, and publication. Approved questions do not “self-improve” in place.
4. **Useful analysis outputs:** one interview per response row, typed values and choice codes, explicit missing/declined/skip states, and a codebook. Repeated groups require linked child tables when implemented.
5. **Universal core:** no ICSSR title, city list, oldest-old eligibility rule, scale score, or study-specific approval procedure is imposed on unrelated projects. See [Study context](study-context.md) for the example project.
6. **Independent implementation:** learn from public behavior and documentation. Do not copy proprietary implementations, trademarks, private questionnaire banks, or incompatibly licensed source into this MIT project.

## A pre-pilot exercise using fictional records

The supplied comparison proposes a 10–20-interview pilot. Before any participant pilot, exercise the application with **10–20 fictional responses** and record the results. This is a proposed acceptance exercise, not a claim that interviews or these checks have already happened.

- Create a blank project unrelated to ICSSR and an editable example study; verify neither leaks settings or responses into the other.
- Configure a short questionnaire containing text, numeric zero, boolean false, single choice, multiple choice, optional/declined answers, and a conditional branch.
- Preview it, publish a version, assign distinct collector accounts, and attempt access as an unassigned user.
- Enter some fictional responses online and some after explicitly downloading the form and disconnecting. Close and reopen the browser during a draft; interrupt an upload; reconnect and retry.
- Check that queued, server-received, rejected, and research-review states remain distinct. Verify exactly one server row per response ID after repeated retries.
- Review a response, record an authorized correction where supported, and confirm that its original answers remain traceable.
- Download the complete workbook. Reconcile response IDs and row counts; inspect subanswer columns, type preservation, missingness, codebook, and version metadata.
- Record browser/device, application version, observed failure, recovery action, and any unsupported workflow. Resolve data-loss or authorization failures before a participant pilot.

The comparison's **900+** interviews and the example PDF's approximate sample table are planning inputs. They do not establish that this application has handled 900 responses, concurrent collectors, large attachments, or a full study. Define and execute a separate capacity/load test against the intended deployment before making scale claims.

## Official sources inspected for this comparison

- [Survey Solutions README](https://github.com/surveysolutions/surveysolutions/blob/master/README.md): component boundaries, fieldwork clients, questionnaire testing, and statistical export service.
- [Survey Solutions license](https://github.com/surveysolutions/surveysolutions/blob/master/LICENSE.md): World Bank Master Community License Agreement, describing royalty-free rights subject to its own terms. This is not the project's MIT license and does not authorize relicensing copied source as MIT.
- [LimeSurvey README](https://github.com/LimeSurvey/LimeSurvey/blob/master/README.md): documented questionnaire, branching, template, and multilingual capabilities.
- [LimeSurvey license](https://github.com/LimeSurvey/LimeSurvey/blob/master/LICENSE): GPL version 2 or later for LimeSurvey's software; study of its documented behavior does not relicense its implementation.

The remaining platform URLs are pointers supplied with the user's comparison, not independently checked feature evidence: [SurveyCTO](https://www.surveycto.com/), [REDCap](https://projectredcap.org/software/), [ArcGIS Survey123](https://www.esri.com/en-us/arcgis/products/arcgis-survey123/overview), and [Qualtrics](https://www.qualtrics.com/). Recheck their official documentation and actual terms before proposing an integration or dependency. No paid platform is required to implement the core workflow above.
