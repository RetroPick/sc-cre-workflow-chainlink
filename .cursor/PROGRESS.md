User calls requestSettlement(0)
↓
Event emitted
↓
CRE detects event
↓
Workflow logs it

## Later Should Be:

User calls requestSettlement(0)
↓
Event emitted
↓
CRE detects event
↓
Workflow fetches question
↓
Workflow computes outcome (oracle / AI / API / rule engine)
↓
Workflow signs report
↓
Workflow writes settlement to contract
↓
Contract verifies report
↓
Market.settled = true
↓
Funds unlock
