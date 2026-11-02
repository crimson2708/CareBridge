# CareBridge — Mid-Semester Report

`main.tex` + `references.bib` for the UCS503P mid-semester evaluation.

## ⚠️ Missing file: `tietreport.cls`

`main.tex` starts with `\documentclass{tietreport}`, and **that class
file is not in this repo** — it comes from the course template. Drop
`tietreport.cls` into this directory (or use the Overleaf project that
already has it) before building, otherwise the very first line fails.

## Build

```shell
latexmk -pdf main.tex          # runs biber automatically
```

or manually:

```shell
pdflatex main
biber main
pdflatex main
pdflatex main
```

The bibliography uses `biblatex` with the **biber** backend, so the
middle step must be `biber main`, not `bibtex main`.

## Before submitting — fill these in

| Placeholder | Where |
| --- | --- |
| Roll numbers (`102XXXXXXX` ×4) | `\author` block |
| Group number (`XXXX`) | `\TitlePageSubText` |
| Course title | `\TitlePageHeader` — currently "UCS503P - Software Engineering Laboratory" |
| Advisor name/title | `\AdvisorName` — currently "Anushka Choudhary" |

Also **verify every entry in `references.bib`** against the original
source before submission, particularly the four clinical citations.

## Diagrams

Five figures are stubbed as framed placeholder boxes so the document
compiles as-is. Each is a `\diagramslot{text}{caption}{label}{height}`
call describing what the figure should show:

| Label | Figure |
| --- | --- |
| `fig:architecture` | Three-tier architecture + trust boundaries |
| `fig:erd` | Entity-relationship diagram (7 tables) |
| `fig:voiceseq` | Voice note sequence — highlights the review gate |
| `fig:handoffstate` | Handoff state machine |
| `fig:screenflow` | Screen flow / navigation map |

To replace one, swap the `\diagramslot{...}` call for a normal figure:

```latex
\begin{figure}[h]
  \centering
  \includegraphics[width=0.9\textwidth]{figures/architecture.pdf}
  \caption{System Architecture}
  \label{fig:architecture}
\end{figure}
```

Keep the `\label` keys unchanged — nothing cross-references them yet,
but the captions are numbered in the order above.

## A note on the Results chapter

Chapter 3 reports **only measurements that were actually taken**: 16
passing tests, 7 database constraint checks, the cleared security
advisory, and code volume. The template's sample table (response time,
accuracy, throughput) was intentionally *not* filled in with invented
numbers.

Time-to-Acknowledgement is presented as **instrumented but not yet
measured**, because that requires a pilot with real nurses. If you run
one before submission, the SQL to populate it is already in §3.3.
