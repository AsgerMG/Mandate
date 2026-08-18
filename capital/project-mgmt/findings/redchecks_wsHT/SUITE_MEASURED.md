# The suite, measured — one row per check, 2026-08-18

Produced by wsHT. `loc` is the check module's own length; `cmts` is commits to
that file; `msg` is commits ANYWHERE whose message names it; `find` is files
under project-mgmt/findings/ that name it. `msg` and `find` are the closest
thing this repo has to 'has it ever caught anything real' — a guard nothing
else has ever had to talk about has not been tested against reality.

| check | loc | born | cmts | msg | find |
|---|---:|---|---:|---:|---:|
| typecheck | 0 | 0 | 0 | 0 | builtin |
| unit tests | 0 | 0 | 0 | 0 | builtin |
| segment config is a literal | 90 | 2026-08-08 | 2 | 3 | 2 |
| output contracts | 540 | 2026-07-30 | 17 | 60 | 15 |
| a contract states no rate | 227 | 2026-08-13 | 2 | 3 | 1 |
| a euro figure says what it is a quantity of | 194 | 2026-08-18 | 2 | 3 | 2 |
| a rule's check can actually run | 253 | 2026-08-11 | 1 | 4 | 2 |
| a guard reads the thing it protects | 339 | 2026-08-13 | 2 | 3 | 3 |
| identifiers named in the docs exist | 220 | 2026-08-11 | 1 | 3 | 1 |
| scratch scripts are reachable | 240 | 2026-08-13 | 1 | 5 | 7 |
| rendered numbers | 471 | 2026-08-09 | 2 | 12 | 2 |
| published figures | 334 | 2026-08-09 | 1 | 8 | 2 |
| a measured ceiling was raised | 543 | 2026-08-13 | 5 | 4 | 3 |
| sector evidence | 223 | 2026-08-10 | 1 | 3 | 3 |
| a funds: line states a scope | 133 | 2026-08-11 | 2 | 8 | 0 |
| vocabulary contract | 216 | 2026-07-27 | 8 | 12 | 6 |
| a comparator asks the rule's question | 268 | 2026-08-11 | 1 | 2 | 1 |
| one env loader | 372 | 2026-08-07 | 3 | 23 | 8 |
| client/server boundary | 163 | 2026-08-02 | 2 | 18 | 9 |
| payload budget | 193 | 2026-07-27 | 5 | 13 | 6 |
| both stores select the same columns | 103 | 2026-08-11 | 1 | 3 | 0 |
| archetype regression | 77 | 2026-07-26 | 6 | 7 | 5 |
| every archetype gets a table | 178 | 2026-08-10 | 3 | 6 | 2 |
| liveness has one definition | 241 | 2026-08-06 | 5 | 17 | 8 |
| openness is evidenced | 187 | 2026-08-09 | 3 | 6 | 4 |
| no door is offered on an expired fact | 272 | 2026-08-18 | 1 | 1 | 3 |
| offer routes are sourced | 200 | 2026-08-07 | 1 | 4 | 5 |
| a row is named by something outside its id | 125 | 2026-08-12 | 1 | 1 | 1 |
| a displayed name is not an id | 155 | 2026-08-18 | 1 | 2 | 2 |
| capital kinds match the register | 195 | 2026-08-12 | 1 | 1 | 0 |
| regions match NUTS | 203 | 2026-07-31 | 4 | 5 | 4 |
| theme index is not stale | 67 | 2026-08-01 | 2 | 4 | 6 |
| selector's base rate is current | 333 | 2026-08-11 | 7 | 13 | 2 |
| leaf cap headroom | 136 | 2026-08-06 | 3 | 14 | 16 |
| missing-data neutral | 177 | 2026-08-09 | 2 | 6 | 4 |
| capital reach | 212 | 2026-08-07 | 7 | 14 | 6 |
| a filter can admit someone | 339 | 2026-08-09 | 2 | 22 | 7 |
| open questions still cover the corpus | 111 | 2026-08-09 | 1 | 5 | 1 |
| a winner is never screened out | 220 | 2026-08-09 | 1 | 28 | 11 |
| a winner is never gated out of the memo | 338 | 2026-08-10 | 4 | 42 | 13 |
| asking a question never costs a fund | 308 | 2026-08-11 | 3 | 7 | 1 |
| recall set does not leak | 118 | 2026-08-06 | 2 | 51 | 34 |
| request path cannot reach the answer | 453 | 2026-08-10 | 6 | 38 | 8 |
| harness answers as the founder | 303 | 2026-08-09 | 3 | 11 | 3 |
| peer prior canary | 328 | 2026-08-09 | 4 | 3 | 6 |
| quotations match documents | 127 | 2026-08-07 | 1 | 2 | 7 |
| dependency audit | 116 | 2026-07-28 | 1 | 4 | 7 |
| country gates | 139 | 2026-08-08 | 1 | 2 | 6 |
| gate field reach | 326 | 2026-08-08 | 3 | 8 | 6 |
| answers reach the ranker | 558 | 2026-08-08 | 6 | 10 | 4 |
| answers reach the writer | 151 | 2026-08-18 | 1 | 3 | 5 |
| gate pertinence | 434 | 2026-08-07 | 7 | 10 | 6 |
| applicant identity | 204 | 2026-08-08 | 4 | 5 | 4 |
| corpus currency | 744 | 2026-08-07 | 13 | 23 | 18 |
| site serves the ETL's corpus | 773 | 2026-08-07 | 16 | 27 | 25 |
| degradation policy | 269 | 2026-08-07 | 8 | 6 | 7 |
| both stores agree | 460 | 2026-08-01 | 16 | 24 | 19 |
| recall floor | 1199 | 2026-08-04 | 36 | 102 | 87 |
| published verdicts | 425 | 2026-08-07 | 3 | 19 | 8 |

**Total: 16,323 lines of guard in the suite alone.**

Every check but four was born between 2026-07-26 and 2026-08-18. Forty-nine of
them arrived in the fortnight before this measurement.
