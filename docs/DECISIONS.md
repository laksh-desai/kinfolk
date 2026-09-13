# Architecture decisions

Append only. To change a past decision, write a new ADR that says "Supersedes NNN".

Template:

```
## NNN — Short title
Date: YYYY-MM-DD
Status: accepted | superseded by NNN

**Context.** What forced a choice. What the alternatives were.
**Decision.** What was chosen.
**Consequences.** What this makes easy, what it makes hard, what it rules out.
```

## 001 — Children attach to Unions, not to persons
Date: (fill in)
Status: accepted

**Context.** A family graph must represent remarriage, half-siblings, step-families, single
parents, and adoption. Attaching children directly to one or two parent ids forces special
cases for each.

**Decision.** Every `ParentChild` edge points at a `Union`. A single known parent gets a
Union with one partner. Half-siblings are children of two different Unions sharing one
partner.

**Consequences.** The layout engine can center children under a union connector uniformly.
Half-sibling detection is a graph query, not a flag. Cost: creating a child always implies
selecting or creating a Union, so the UI must handle that invisibly for the common case.