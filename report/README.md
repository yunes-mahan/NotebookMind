# Report source (ACM LaTeX, single column)

## Files

| File | What it is |
|------|------------|
| `report.tex` | The report. `\documentclass[manuscript]{acmart}` (single column). |
| `references.bib` | 19 BibTeX entries, all real and verified. |
| `figures/` | Drop the three screenshots here (see below). |

## Compiling in Overleaf

1. Upload `report.tex`, `references.bib` and the `figures/` folder to a new
   Overleaf project (or upload this folder as a ZIP).
2. Set the compiler to **pdfLaTeX** (Menu → Compiler).
3. Compile. Overleaf runs BibTeX automatically; if the citations show as `[?]`,
   hit Recompile once more.

`acmart` and `ACM-Reference-Format.bst` are part of Overleaf's TeX Live, so
nothing needs installing.

## Screenshots (already captured)

All three are in `figures/`, taken from the running app against the live
Supabase demo course. The document compiles with or without them: a missing
file renders as a labelled placeholder box instead of failing.

| File | What it shows |
|------|---------------|
| `figures/learn-mode.png` | Learn mode, Step 3 **Fix the bug**: the brief, the CodeMirror editor with the planted bug (`- 2.0 * sleep_hours`), the hint box open, and the Reveal control that only appears once a hint is taken. |
| `figures/explain-mode.png` | Explain mode, cell 1: code, output band, all three context tabs, the AI explanation, the **Matching slide** embed, and a yellow **margin note**. |
| `figures/teacher-dashboard.png` | Teacher → Overview: the per topic understanding chart (green/red, weakest first) and the insights card with the on demand **Generate AI insights** button. |

To retake any of them: run `.\start.ps1`, open the JupyterLab URL, and note
that the Teacher tab is gated by a hardcoded prototype password (`123`, at
`src/nbApp.ts:984`).

## Title block (already filled in)

- **Author:** Yunes Mahan
- **Affiliation:** Fakultät für Mathematik, Informatik und Statistik,
  Ludwig-Maximilians-Universität München
- **Course line under the title:** Practical Intelligent Interactive Systems,
  Sommersemester 2026

Umlauts are written as `\"a` / `\"u` so they render identically under both
pdfLaTeX and XeLaTeX.

## Repository link

The **Availability** section points at
`https://github.com/yunes-mahan/NotebookMind`, matching the project README.
That repository is **public**, and the submitted work is on its default branch
(`master`).

The account was renamed `exewww` → `yunes-mahan`. GitHub redirects the old URL,
so an older checkout with `origin` still set to `exewww/NotebookMind` pushes to
the right place — but prefer the canonical name:

```
git remote set-url origin https://github.com/yunes-mahan/NotebookMind.git
```

## Rebuilding the PDF

`report.pdf` in this folder is up to date. To rebuild, either upload to Overleaf
as above, or use any local TeX distribution:

```
pdflatex report && bibtex report && pdflatex report && pdflatex report
```

## Length

About **29,450 characters** counting the abstract, body, figure captions and
table cells (27,350 if captions and tables are excluded). Inside the required
20,000 to 30,000 range on either reading. 12 pages, 18 references.
