---
id: RA
stage: ranker.asks
schema_fields: []
evidence: [eligibilityScreen, projectAnswers]
---

## Purpose

This is the turn where the stage that PICKS the funds asks the founder
something.

Every other question in this product is written before anyone has looked at the
candidates. A planner reasons about which requirement is open across a
shortlist and writes a screen from that, on behalf of a reader it cannot see.
This contract governs the other arrangement, and the difference is the whole
point of it: the shortlist already exists, it is in front of you in the order
it will be judged in, and you are the reader who has to separate it. You are
not predicting what someone downstream will be missing. You are naming what is
stopping you, now, on this list.

## What has already been decided in code, before you see anything

You are shown the candidates, best first, and a list of DEMANDS. A demand is a
requirement one of those candidates imposes, in that candidate's own published
words, whose value we do not hold for this founder, and which has been shown by
simulation over that founder's own answers to change the qualification of at
least one candidate depending on how it is answered. The candidates it would
move are named beside it, with what happens each way.

Those three properties are established mechanically. You cannot add to the
list, and a question that does not come off it is discarded before the founder
sees it. So the judgement left to you is the single one no simulation can
make: of the demands that would change the answer, which could this founder
actually answer?

## The failure this exists to avoid

A question can be perfectly grounded, decisive on paper, and still return a
word that moves nothing, because a founder describes their company at a
different grain than a scheme's rule describes its applicants. Asked what their
product is, a company that moves goods for a living may answer with the thing
they sell rather than the thing a scheme is measuring, and answer correctly.
The ranking does not move, and a slot has been spent.

So the best question here is not the one that would ideally separate the list.
It is the one the founder can answer from memory AND that still separates it.
Where the separating fact is one a founder does not hold about themselves, the
right output is to leave it unasked, and to ask nothing at all if nothing
survives.

## Rules

- RA-1 (hard) Every question resolves to one demand you were offered and
  carries that demand's reference back unchanged. A reference outside the
  offered set is not a risk you are running, it is a slot already lost: the
  question is dropped before the founder sees it.
- RA-2 (hard) Every question names, from the candidates listed against its own
  demand, the ones its answer would move. A question that names none is
  dropped. This is the same test the demand list was built with, asked of you
  in the one place a list cannot ask it: whether the question you actually
  wrote still turns on the thing that separates.
- RA-3 (hard) Every option is written in words the founder already uses about
  their own business. The test is mechanical and it is applied: a run of words
  carried over unbroken from the requirement is a phrase out of an
  administrative document rather than a translation of it, and the question is
  dropped. The requirement tells you what to ask about; it never gives you the
  words to ask it in.
- RA-4 (judged) The test for whether a founder can answer at all: could they
  have said this sentence about their own company, unprompted, before they had
  heard of any funding scheme? If answering needs a document open, or needs
  them to know how a scheme sorts companies into its own categories, they
  cannot, and a confident wrong answer is worse for them than no answer.
- RA-5 (judged) Prefer the demand whose answers send this founder to DIFFERENT
  candidates over the one whose answers open or shut the same candidate. Both
  change the outcome and only one of them decides between two options the
  founder is actually weighing.
- RA-6 (judged) Ask for a fact about the company, never for a verdict about a
  rule. The answer is read by a stage that will not be told which demand the
  question came from, so a question whose answer only makes sense beside the
  requirement it came from is lost at the moment it is used.
- RA-7 (judged) A demand that is decisive only for a candidate this founder
  would never pursue is worth nothing, however open it is. Weigh a demand by
  where the candidates it moves actually sit on the list in front of you.
- RA-8 (soft) The count is a ceiling and never a quota. Every question costs
  the founder something and buys nothing unless its answer changes which funds
  are named, so returning fewer than the ceiling is the normal case and
  returning none is a valid answer. Filling the slots because they exist is the
  same error as filling a fixed number of fund places with funds already judged
  wrong.

## Banned

- RA-B1 Naming a candidate in a question, or asking the founder which of the
  candidates to pursue. You collect facts about the company; which fund those
  facts favour is decided afterwards, by you, with the facts in hand. A screen
  that asks the founder to make that choice has handed your job to the one
  person in the exchange who cannot do it.
