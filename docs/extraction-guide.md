# Salary extraction guide

This guide is for the agents that read collected r/GehaltAT posts and turn them into structured salary data.
`npm run prepare-extraction` writes input shards to `data/extraction/input/<name>.md`.
Each agent processes whole shards and writes `data/extraction/output/<name>.jsonl`.
`npm run build-data` then validates every figure and builds `public/data/salaries.json`.

You read each post like a careful human: the title, the body, the attached images (usually payslips) and the comments.

## Input format

```
=== POST <postId> | <date> | score <n> | <n> comments | images: <n> | flair: <flair>
TITLE: <title>
BODY: <post text>
IMAGE TRANSCRIPT (automatic OCR of the attached image, may contain recognition errors):
<payslip lines>
IMAGES (open with the Read tool only if the transcript is unclear): data/images/<postId>-0.jpg
COMMENTS ([OP] = original poster, number = score):
- [OP 12] <comment by the poster>
  - [4] <reply by someone else>
```

- Posts are usually German or Austrian German. A typical title looks like `M29 / 38,5h / Solutions Architect / 10 YoE / Wien`.
- The salary is often only in the payslip or in the OP's comments.
- **Read the IMAGE TRANSCRIPT first.** Open the image itself with the Read tool only if the transcript is missing, garbled, or leaves the gross/net figure or the clean/unclean question unclear. Open each image at most once.
- The comment list holds all OP comments, the comments they answer, and the top comments that contain numbers.

## Output format

Write exactly one JSON object per line (JSONL). Use no pretty-printing and no Markdown fences.
Write at least one line per input post, in input order.

**Skip line**, for posts without a usable salary figure of the poster:

```json
{"postId":"1u2y4kl","skip":true,"reason":"question without own salary figure"}
```

**Record line**. All keys are required; use `null` when a value is not stated.

```json
{"postId":"1u3us9y","inAustria":true,"salaryKind":"current","jobTitle":"Solutions Architect","standardizedTitle":"Solutions Architect","industry":"IT & Software","seniority":"senior","experienceYears":10,"region":null,"hoursPerWeek":38.5,"employmentType":"employee","paymentsPerYear":null,"grossMonthly":6165,"grossAnnual":null,"netMonthly":3805.85,"hourlyGross":null,"bonusAnnual":null,"allIn":false,"collectiveAgreement":null,"salarySource":"image","evidence":["[image] Gehalt 6.165,00","[image] Auszahlung 3.805,85","Kein All-In"],"confidence":0.9,"notes":"Base salary from payslip; no all-in, no staff responsibility. Commenters doubt 10 YoE (about 4.5 years full-time)."}
```

| Field | Type | Rule |
|---|---|---|
| `postId` | string | From the header line. |
| `inAustria` | boolean | `false` if the job is clearly outside Austria (e.g. a German or Swiss salary). |
| `salaryKind` | `current` \| `offer` | `offer` = a job offer or salary band not yet being paid. |
| `jobTitle` | string | The job as the poster names it (keep the original language). |
| `standardizedTitle` | string | Short English title in Title Case, using common names: "Software Developer", "Registered Nurse" (DGKP), "Electrician", "Police Officer", "Teacher", "Accountant", "Mechatronics Technician". Reuse the same title for the same job every time. |
| `industry` | enum | One of: IT & Software, Finance & Insurance, Healthcare & Social, Engineering & Manufacturing, Construction & Trades, Public Sector, Education & Research, Retail & Sales, Hospitality & Tourism, Logistics & Transport, Energy & Utilities, Consulting & Professional Services, Legal, Media & Marketing, Pharma & Chemicals, Telecommunications, Other. Classify by the employer's industry when it is known, else by the role. Fixed mappings: accounting, tax advisory, auditing, Bilanzbuchhaltung → Consulting & Professional Services. Banks, insurers → Finance & Insurance. Airlines, aviation, rail, freight → Logistics & Transport. Metal industry, automotive, machinery → Engineering & Manufacturing. Electricians, plumbers, carpenters, construction → Construction & Trades. Hospitals, care, social work → Healthcare & Social. Schools, universities → Education & Research. Police, ministries, municipalities, ÖBB-style public bodies → Public Sector. Sales jobs → the employer's industry, else Retail & Sales. |
| `seniority` | `junior` \| `mid` \| `senior` \| `lead` \| null | junior: under 2 years or a junior/trainee title. mid: 2–5 years. senior: 6+ years or a senior title. lead: team lead, head of, or Führungskraft with reports. When `experienceYears` is known, the build script derives junior/mid/senior from it; only `lead` is kept as you set it. |
| `experienceYears` | number \| null | Years of professional experience ("10 YoE", "5 Jahre BE", "Berufserfahrung"). Not age. |
| `region` | enum \| null | Austrian state: Vienna, Lower Austria, Upper Austria, Styria, Carinthia, Salzburg, Tyrol, Vorarlberg, Burgenland. Map cities and abbreviations: Wien → Vienna, NÖ → Lower Austria, OÖ/Linz → Upper Austria, Stmk/Graz → Styria, Ktn/Klagenfurt → Carinthia, Sbg → Salzburg, Innsbruck → Tyrol, Vbg → Vorarlberg, Bgld → Burgenland. `null` if not stated. Do not infer the region from an employer address on a payslip. |
| `hoursPerWeek` | number \| null | Contract hours per week ("38,5h" → 38.5). |
| `employmentType` | enum | `apprentice` only while the apprenticeship is still running (Lehrling im 1.–4. Lehrjahr). Someone who has finished it ("ausgelernt", "LAP bestanden", "Lehre abgeschlossen") is an `employee`. `intern` (Praktikum), `civil_servant` (Beamter, Vertragsbedienstete/VB), `freelancer` (selbstständig, EPU, freier Dienstnehmer), otherwise `employee`. |
| `paymentsPerYear` | 12 \| 14 \| null | Only if stated ("14x", "14 Gehälter", "12x"). Otherwise null; the build script assumes 14. |
| `grossMonthly` | number \| null | Regular monthly gross (brutto). |
| `grossAnnual` | number \| null | Annual gross as stated ("60k brutto/Jahr", "Jahresbrutto 58.800"). |
| `netMonthly` | number \| null | Regular monthly net (netto, Auszahlung). |
| `hourlyGross` | number \| null | Gross hourly wage ("18,50 €/h brutto"). |
| `bonusAnnual` | number \| null | Yearly bonus in EUR, if stated as an amount. |
| `allIn` | boolean \| null | `true` for an All-In contract, `false` if the post says "kein All-In", otherwise null. |
| `collectiveAgreement` | string \| null | Kollektivvertrag as named ("KV Metallindustrie", "IT-KV", "Handels-KV"). |
| `salarySource` | `post` \| `comment` \| `image` | Where the main salary figure is: title/body, an OP comment, or the payslip image (transcript or image itself). |
| `evidence` | string[] | 1–3 short snippets (max 80 characters) that contain the reported figures. Text snippets are copied **verbatim** from the post, the comments or the IMAGE TRANSCRIPT. If you read a figure from the image itself because the transcript was wrong or unclear, write the snippet as `[image] ` followed by the label and figure exactly as printed, e.g. `[image] Gehalt 3.450,00`. **Every figure you read from the image itself needs an `[image]` snippet containing it.** |
| `confidence` | number 0–1 | See below. |
| `notes` | string | At most 200 characters of English context about the job and pay: overtime included, allowances, shift work, all-in, and so on. |

## Figure rules. These are critical; the checker and build script enforce them.

1. **Report stated figures only. Never compute.** No annual from monthly, no gross from net, no midpoints, no currency conversion. Write the figure exactly as stated or printed (4.200 → 4200, 3.805,85 → 3805.85, 60k → 60000). Put it in the field that matches what it is. The build script derives missing values itself.
2. Report the **poster's (OP's)** pay only. Figures from other commenters (their own salaries, or their net estimates of OP's gross) do not count, unless the OP confirms them.
3. Ranges ("45–50k", "Gehaltsband 3.500–4.000") are not figures. If a range is all there is, skip the post.
4. If a post gives an old and a new salary, report the current one. Write two record lines only for a current salary plus a separate offer (maximum 2 records per post).
5. Payslip rules. Decide whether the month is **clean**: it has no variable items, i.e. no overtime (`Überstunden`, `ÜST`, `Mehrstunden`, `Zuschlag` for overtime), no commissions or bonuses (`Provision`, `Commission`, `Prämie`), no special payments (`Sonderzahlung`, `SZ`, `Urlaubszuschuss`/`UZ`, `Weihnachtsremuneration`/`WR`, 13./14. Gehalt), no back pay (`Nachtrag`, `Nachzahlung`, `Aufrollung`) and no other one-off items. Fixed allowances (shift, SEG, `Zulage` paid every month) do not make a month unclean.
   - Clean month: gross = the printed total (`Brutto`, `Gesamtbrutto`, `Summe Bezüge`, `Bruttobezug`). Net = the printed `Netto`/`Nettobezug`/`Net` line; use `Auszahlung`/`Auszahlungsbetrag`/`Payment` only when there is no net line (Auszahlung can be lower because of union dues, company-car contributions or advances).
   - Unclean month: gross = the base salary line as printed (`Gehalt`, `Grundgehalt`, `Monatsgehalt`, `Monatslohn`, `Basic Salary`). Set `netMonthly` to null, because the printed net includes the variable items. Name the variable items and fixed allowances in the notes (e.g. "base only; payslip also shows 250 shift bonus and 3,360 commission"), and use confidence 0.75 or lower.
   - Never add up lines yourself.
   - Ignore tax bases (`Bemessungsgrundlage`, `BMG`), deductions (`SV`, `Lohnsteuer`/`LSt`, `DG-Anteil`, `BV`/`MVK`), year-to-date totals (`Jahressumme`, `kumuliert`, `Jahreslohnzettel` columns) and employer costs.
   - If the image is unreadable (blurry, cropped, too small), rely on the title and comments. If still unclear, skip the post.
   - If the post text or an OP comment states the regular gross or net ("Netto ohne Überstunden ca. 2,1k"), that figure is fine to use (`salarySource: comment` or `post`).
6. Title shorthand: `M29`/`W31` are gender and age; ignore them and never record age or gender. `38,5h` = hours per week. `YoE`, `Jahre BE` = years of experience. `KV` = collective agreement. `14x` = 14 payments. `brutto`/`netto` = gross/net.
7. If it is unclear whether a figure is gross or net, and neither the payslip, the post nor the OP clarifies, skip the post rather than guess.

## Confidence

- 0.9–1.0: figure explicit and clearly labelled gross/net; role and hours clear.
- 0.7–0.89: small ambiguity (hard-to-read image, allowances possibly included, role vague).
- 0.5–0.69: notable ambiguity (gross/net inferred from context, overtime-inclusive totals).
- Below 0.5: do not write a record; write a skip line instead.

## Privacy

- Payslips show names, addresses, employers, personnel and social security numbers. **Never transcribe any of that.** Evidence snippets contain only a salary label and its figure (e.g. `[image] Gehalt 3.450,00`, `netto 2.300`).
- Notes cover the job and the pay only. No health, family or other personal circumstances, and no usernames. Do not mention Familienbonus, children, sick leave or similar payslip items, not even to explain a high net.
- A payslip that spans several months, or an income that varies from month to month (sales per shift, seasonal work), is not a monthly salary: skip the post.

## Process per shard

Work steadily; do not deliberate at length over single posts, and never re-check work you already did. When in doubt, lower the confidence or skip.

1. Read the whole input shard. Go post by post, opening an image only when the rule above requires it.
2. Write the output file `data/extraction/output/<same name>.jsonl`, one line per post, in input order.
3. Run `npm run check-extraction -- data/extraction/input/<name>.md`. Fix every reported problem and repeat until it prints `0 problems`. A figure the checker cannot find means one of two things: you computed or reformatted it (use the literal figure), or you read it from an image without an `[image]` evidence snippet (add one). If no figure remains, write a skip line.
