RetroPick	

RetroPick: AI-Orchestrated Prediction Infrastructure with Adaptive Liquidity, Unified Vaults, and Verifiable Off-Chain Execution
Multi-Outcome LS-LMSR Markets Powered by Chainlink CRE, Chainlink CCIP and Yellow State Sessions
Asyam Jayanegara - NapLabs                                                                                                                                                                         RetroPick is a chain-agnostic, AI-orchestrated multi-outcome prediction market infrastructure that solves cold-start liquidity, fragmented capital, and resolution trust. Markets follow a two-phase lifecycle: Chainlink CRE workflows continuously generate MarketDrafts (question, outcomes, resolvability playbook, trust score) from authenticated external data sources, and markets become live only when a Creator/MM claims and funds them. Upon activation, the creator deploys a UnifiedVault (ERC-4626) on a target chain, holding collateral, earning yield, and allocating risk budgets across multiple markets. Public users may later join as LPs to share fees and yield.
RetroPick leverages Chainlink CCIP for cross-chain asset abstraction: users can deposit from any supported chain, with collateral normalized and credited to the vault’s execution chain, preserving unified capital while avoiding cross-chain liquidity fragmentation.
Pricing uses a Liquidity-Sensitive LMSR (LS-LMSR), where liquidity depth adapts to participation, enabling long-tail markets while deepening popular markets to reduce slippage. Trading executes gaslessly within Nitrolite Yellow state sessions, enforcing max-cost/min-share constraints and committing signed state updates; onchain contracts provide custody, dispute exits, and final settlement without re-pricing.
Resolution is automated via CRE. A MODRA workflow retrieves authenticated evidence (via Confidential HTTP), submits bonded outcome proposals, and escalates disputes to a Senate-style mechanism when necessary. A Risk Sentinel monitors solvency, concentration, and volatility shocks to trigger safeguards. RetroPick delivers scalable, MEV-resistant, institution-ready prediction infrastructure with chain-agnostic capital access and verifiable execution.


Contents
	Introduction		2
	Setting & Background
	Market Structure Problems
	Threat Outcome / Assumptions
	Design Rationale (Why LMSR, Why Not CLOB, Why Offchain)	2
	System Overview
	Market Lifecycle and Governance
	Draft Market Board (pre-deploy)
	Claim or Design then Activate
	Operation
	Resolution & Close	3
	Pricing Mechanism
	Notation & Definitions
	Multi-Outcome LMSR Baseline
	Trading primitives
	Slippage & Execution Price	5
	Yellow Session Execution and State Commitment
	Session Outcome 
	State Schema
	Checkpointing
	Exit + dispute
	MEV Resistance Properties	6
	Unified Creator Vault (ERC-4626) and Capital Allocation 
	Vault Semantics
	Portfolio backing Across Markets
	Solvency Invariants
	P&L Sharing
	Budgeting & Rebalancing
	Slippage & Execution Price
	Cross-Chain Vault Expansion
	Cross-Chain Market Registry
	Settlement Routing
	Risk Synchronization	7
	Resolution Architecture (CRE + MODRA + Escalation)
	Evidence-based Resolution (MODRA)
	Escalation (“Senate”)
	Finality & Anti-MEV Resolution Timing	8
	Risk Sentinal and Complience Mode
	Monitored Signals
	Automated Actions
	Institutional / Private Features	8
	 Evaluation and Reproducibility
	 Comparison with CLOB / Polymarket / Kalshi / XO
	 Roadmap and Extensions
	 Security Considerations	10





Corresponding author(s): jayanegara.asyam@gmail.com
© 2026 RetroPick. All rights reserved. 

	Introduction

Prediction markets allow participants to trade contingent claims on future events. When sufficiently liquid and properly structured, these markets aggregate dispersed information and produce prices that approximate calibrated probabilities of outcomes. However, most prediction markets struggle to scale beyond a small set of high-volume events due to structural limitations in liquidity provisioning, market creation, execution latency, and resolution trust.

Two dominant architectures exist today:
	Order-book markets, which match buyers and sellers via a central limit order book or continuous double auction. These systems offer tight spreads in high-volume markets but rely heavily on active market makers and suffer from liquidity fragmentation in long-tail markets.
	Cost-function market makers (CFMMs), which maintain a convex cost function over outstanding share quantities and quote prices as its gradient. In these systems, the venue (or its liquidity providers) assumes bounded worst-case loss in exchange for always-available liquidity.

While CFMMs such as the Logarithmic Market Scoring Rule (LMSR) provide continuous liquidity and bounded risk, existing implementations face practical challenges:
	Cold-start liquidity for new markets
	Fragmented capital across outcomes and markets
	Manual bottlenecks in market creation
	Onchain execution costs and latency
	Resolution trust and dispute handling

RetroPick addresses these structural issues through a modular, chain-agnostic prediction infrastructure composed of five coordinated layers:

	AI-Orchestrated Market Supply Chainlink CRE workflows continuously generate structured MarketDrafts with defined outcomes, resolvability playbooks, and trust scores. Markets only become live when claimed and funded by a creator, preventing idle onchain deployments.
	Creator UnifiedVault (ERC-4626) A portfolio-style collateral vault backs multiple markets, allocates risk budgets, and enables public liquidity providers to share fees and yield.
	Liquidity-Adaptive Pricing (LMSR + LS Policy) A multi-outcome LMSR baseline ensures continuous tradability and bounded loss, while a liquidity-sensitive policy deepens markets as participation grows.
	Offchain Execution via Yellow Sessions Trades execute gaslessly in signed state channels (Nitrolite Yellow sessions), enforcing deterministic pricing constraints and committing netted state to chain without re-pricing.
	Verifiable Resolution and Risk Automation CRE-based MODRA workflows fetch authenticated evidence and post bonded outcome proposals. A Risk Sentinel monitors solvency, concentration, and abnormal activity to trigger safeguards.


RetroPick separates market discovery, capital allocation, execution, and settlement into interoperable components. Onchain contracts provide custody, dispute exits, and final settlement. Offchain sessions provide speed and cost efficiency. CRE workflows provide structured automation for both market supply and resolution.
By combining adaptive CFMM pricing, unified collateral vaults, AI-driven market lifecycle management, and cross-chain interoperability via CCIP, RetroPick transforms prediction markets from isolated applications into programmable financial infrastructure.
This document focuses on the system architecture, market microstructure, and capital Outcome underpinning RetroPick. We assume familiarity with probability theory, convex optimization, and DeFi-style automated market makers.

	Setting & Background

Prediction markets are mechanisms for aggregating dispersed information through trading of contingent claims. When properly designed, their prices can approximate calibrated probabilities under rational participation. However, empirical deployments reveal recurring structural weaknesses that limit scalability, liquidity robustness, and institutional adoption.
This section characterizes those structural challenges, formalizes the system threat model, and motivates the core design decisions underlying RetroPick.

2.1 Market Structure Problems
Despite their theoretical appeal, contemporary prediction market implementations encounter five persistent structural problems.
2.1.1 Cold-Start Liquidity
Order-book–based architectures depend on active market makers and sufficient two-sided participation. In thin markets, spreads widen significantly and price discovery stalls. Markets without continuous maker participation frequently become non-tradable. This creates a bootstrap paradox: liquidity attracts traders, yet traders require liquidity to participate.
Cost-function market makers mitigate this issue by guaranteeing always-available liquidity. However, fully onchain implementations introduce other frictions discussed below.

2.1.2 Liquidity Fragmentation
Prediction markets often fragment liquidity across:
	Separate pools per outcome
	Separate markets for related events
	Independent collateral pools per market
Fragmentation reduces effective depth and amplifies slippage. In multi-outcome environments, splitting capital across outcomes results in capital inefficiency, especially for long-tail or low-volume markets. This structural inefficiency is magnified when liquidity cannot be dynamically reallocated across markets.

2.1.3 Manual Market Supply Constraints
Most prediction platforms rely on human curation, governance voting, or centralized editorial processes to create markets. This introduces:
	Throughput bottlenecks
	Selection bias
	Limited responsiveness to real-time events
As information velocity increases (e.g., financial markets, elections, AI competitions), manual supply mechanisms cannot scale proportionally.

2.1.4 Onchain Execution Friction
Fully onchain cost-function market makers (CFMMs) incur:
	Gas costs per trade
	Latency dependent on block confirmation
	Exposure to miner- or validator-extractable value (MEV)
	Deterministic transaction ordering vulnerabilities
These frictions degrade user experience and hinder high-frequency or small-size trading. While onchain execution provides strong settlement guarantees, it is inefficient for iterative price discovery.

2.1.5 Resolution Risk
Settlement in prediction markets depends on reliable outcome determination. Common approaches include:
	Human committees
	Governance token votes
	Centralized oracle feeds
These introduce ambiguity, potential governance capture, and dispute delays. In high-stakes markets, delayed or contested resolution undermines trust and liquidity.

Collectively, these structural issues motivate a system that:
	Guarantees baseline tradability,
	Minimizes liquidity fragmentation,
	Automates scalable market supply,
	Reduces execution friction without sacrificing custody,
	Formalizes resolution workflows with explicit trust boundaries.
RetroPick is designed to address these issues holistically.

2.2 Threat Model and Assumptions
RetroPick explicitly separates custody, execution, and resolution into independent layers. The following assumptions define the system’s security model.

2.2.1 Operator Model
The offchain execution operator (session coordinator):
	May censor or delay trade execution,
	May temporarily fail or become unavailable.
However, the operator:
	Cannot access or withdraw collateral held in onchain vault contracts,
	Cannot invalidate previously signed state transitions,
	Cannot prevent users from exiting with their latest valid signed state.
Collateral custody remains non-custodial and enforced onchain. Operator misbehavior affects availability but not asset ownership.

2.2.2 Session Integrity
Offchain execution occurs within signed state sessions. We assume:
	All state transitions require valid digital signatures,
	Nonces enforce monotonic state progression,
	The latest valid signed state supersedes prior states,
	Replay attacks are prevented through nonce verification.
In the event of dispute, the onchain settlement contract enforces “latest state wins” semantics during the challenge window.

2.2.3 Oracle and Resolution Model
Resolution proposals are generated through structured workflows and must satisfy:
	Predefined evidence source requirements,
	Playbook-defined evaluation criteria,
	Bonded proposal submission.
If a proposal is disputed or deemed low-confidence, it escalates to an adjudication mechanism. This layered resolution model limits oracle manipulation and clarifies escalation pathways.

2.2.4 Market Creator Risk Model
Each market is collateralized through a UnifiedVault (ERC-4626). We assume:
	The creator funds an initial risk budget,
	Per-market exposure caps are enforced,
	Worst-case liability is bounded (e.g., LMSR loss bound),
	Aggregate vault exposure is constrained to prevent insolvency.
Liquidity providers deposit into the vault and share fee and yield revenue while accepting bounded risk exposure.

2.2.5 Adversarial Conditions Considered
The system considers the following adversarial scenarios:
	Operator censorship or downtime,
	Attempted oracle manipulation,
	Malicious or low-quality market drafts,
	Concentrated trading intended to stress vault solvency,
	Late-stage information asymmetry near expiry.
RetroPick’s layered architecture is designed to mitigate these risks without requiring trust in a single centralized entity.

2.3 Design Rationale
RetroPick’s architectural decisions are guided by the structural problems identified above.

2.3.1 Why LMSR Instead of a Pure CLOB
Central limit order books (CLOBs) perform efficiently under high participation and continuous maker presence. They offer:
	Tight spreads,
	Efficient capital use in deep markets,
	Familiar microstructure.
However, CLOBs require:
	Active and continuous liquidity providers,
	High participation density,
	Significant capital to maintain competitive spreads.
In long-tail or early-stage markets, CLOBs frequently degrade into illiquid venues.
The Logarithmic Market Scoring Rule (LMSR) offers:
	Deterministic, always-available liquidity,
	Continuous price updates,
	Closed-form bounded worst-case loss,
	Independence from external market maker activity.
RetroPick prioritizes universal tradability over minimal spreads in early market phases. LMSR ensures that any market remains executable, even at low participation levels.
Liquidity-sensitive extensions (LS-LMSR policies) allow liquidity depth to grow with open interest, improving slippage characteristics as markets mature.

2.3.2 Why Offchain Execution
While LMSR is well-suited for prediction markets, executing exponential and logarithmic operations fully onchain is inefficient.
Offchain session-based execution provides:
	Reduced gas consumption,
	Lower latency,
	MEV-resistant ordering,
	Improved user experience.
Onchain contracts retain:
	Custody of collateral,
	Enforcement of state commitments,
	Settlement guarantees,
	Dispute resolution.
Thus, RetroPick separates price discovery (offchain) from finality (onchain), combining performance with security.

2.3.3 Why AI-Orchestrated Market Supply
To scale prediction infrastructure, market supply must scale with information flow. AI-driven MarketDraft workflows enable:
	Structured question generation,
	Formal resolvability playbooks,
	Source transparency,
	Automated trust scoring.
Markets only become live upon creator activation and funding, preserving economic discipline while eliminating editorial bottlenecks.

2.3.4 Why Unified Vault Collateralization
Rather than fragment capital across isolated market pools, RetroPick aggregates collateral into Creator UnifiedVaults (ERC-4626). This design:
	Improves capital efficiency,
	Allows portfolio risk budgeting across markets,
	Enables LP participation at scale,
	Simplifies solvency monitoring.
Unified collateralization transforms LMSR from a single-market mechanism into a programmable liquidity infrastructure.

	Systems Overview

3. System Overview
RetroPick is a modular prediction market infrastructure that separates market supply, liquidity provisioning, execution, custody, and resolution into distinct yet composable layers. This separation is intentional: it isolates trust domains, improves scalability, and enables cross-chain extensibility.
We describe the system in terms of actors, layers, and state boundaries.

3.1 Actors
RetroPick involves the following roles:
	Trader
A participant who acquires outcome shares through the pricing engine. Traders interact with the offchain execution layer but rely on onchain custody guarantees.
	Liquidity Provider (LP)
A participant who deposits capital into a UnifiedVault. LPs share in fee revenue and yield and indirectly back the bounded risk exposure of markets.
	Creator / Market Owner (MM)
An entity that claims a MarketDraft, deploys the live market, funds the UnifiedVault, sets liquidity parameters, and earns a share of fees.
	Execution Operator
A session coordinator responsible for computing offchain LS-LMSR state transitions and collecting signed state updates. The operator cannot access collateral.
	Resolver (MODRA Workflow)
A CRE-driven workflow that evaluates predefined evidence sources and proposes outcomes.
	Risk Sentinel
A CRE monitoring workflow that observes vault health, market dynamics, and abnormal behavior to trigger safeguards.

3.2 Architectural Layers
RetroPick is composed of five logical layers.
3.2.1 AI Market Supply Layer
This layer continuously generates candidate markets (“MarketDrafts”) using Chainlink CRE workflows.
Each MarketDraft contains:
	Question and outcome space Ω
	Expiry timestamp
	Resolvability playbook (approved sources + evaluation criteria)
	Trust score
	Recommended liquidity bands
Drafts are non-binding until activated by a Creator.
This layer solves the market supply bottleneck without increasing onchain state footprint.

3.2.2 Creator Ownership & Vault Layer
Upon activation, a Creator deploys:
	A Market contract (registry entry)
	A UnifiedVault (ERC-4626)
	A Yellow session instance
The UnifiedVault:
	Holds collateral
	Accepts LP deposits
	Earns yield via strategy adapters
	Allocates per-market risk budgets
	Collects trading fees
Each market maintains an independent LS-LMSR state vector qmq_mqm, but collateral backing is unified at the vault layer.
This design prevents capital fragmentation while preserving per-market pricing independence.

3.2.3 Pricing Engine Layer
Pricing follows a multi-outcome LMSR baseline:
c(q)=b⋅ln⁡(∑_(i=1)^n▒ⅇ^(q_i∕b) )
Prices are computed as:
p_i (q)=ⅇ^(q_i/b)/(Σ_j ⅇ^(q_j/b) )
RetroPick may extend this via liquidity-sensitive policies:
b(q)=b0+α⋅OI(q)
where OI denotes open interest.
The pricing engine runs offchain within Yellow sessions to:
	Avoid expensive exponentials onchain
	Enable low-latency trading
	Reduce MEV exposure
Execution constraints enforce:
	maxCost
	minShares
	maxOddsImpact

3.2.4 Yellow Session Execution Layer
Trading occurs inside hub-and-spoke state channels (“Yellow sessions”).
Each session maintains a signed state:
S = (q, balances, positions, fees, nonce)
Properties:
	State transitions require signatures from involved parties
	Nonces prevent replay
	Latest valid state supersedes earlier states
Periodically, the session coordinator commits netted deltas to onchain settlement contracts. In case of dispute or operator failure, users can submit the latest signed state to enforce settlement.
This separation ensures:
	Non-custodial collateral
	Offchain performance
	Onchain enforceability

3.2.5 Resolution & Risk Layer (CRE)
Resolution and monitoring are implemented as independent workflows.
MODRA (Resolution Workflow)
	Fetches evidence via Confidential HTTP
	Evaluates predefined criteria
	Posts bonded outcome proposal
	Supports escalation
Risk Sentinel
	Monitors vault solvency
	Detects abnormal odds movements
	Enforces circuit breakers
	Triggers forced session checkpoints
This separation prevents resolution logic from being embedded in the trading engine, improving auditability.

3.3 Onchain vs Offchain Boundary
A critical design property of RetroPick is strict boundary separation.
Onchain Responsibilities
	Collateral custody (UnifiedVault)
	Market registry
	Settlement enforcement
	Dispute resolution
	Risk guardrails
	CCIP cross-chain messaging (optional extension)
Offchain Responsibilities
	LS-LMSR state evolution
	Quote computation
	Order matching against curve
	Execution transcript hashing
	Real-time monitoring
This boundary ensures that no pricing logic is required for final settlement. Onchain contracts validate state transitions but do not recompute curve math.

3.4 Cross-Chain and CCIP Abstraction
RetroPick is designed to be chain-agnostic.
	Vaults may exist on a base chain (e.g., mainnet)
	Markets may be deployed on satellite chains
	CCIP routes settlement messages and capital transfers
Possible configurations:
	Single-chain deployment (baseline)
	Multi-chain market execution with centralized vault
	Cross-chain vault aggregation
CCIP ensures:
	Verified message delivery
	Cross-chain collateral movement
	Deterministic settlement finality
This allows institutional deployment across jurisdictions while preserving unified liquidity logic.



3.5 System Properties
Under the defined assumptions, RetroPick guarantees:
	Always-available liquidity (LMSR property)
	Bounded worst-case loss
	Non-custodial collateral
	Deterministic settlement
	MEV-reduced execution
	Chain-agnostic extensibility

	Market Lifescycle and Governance

RetroPick implements a two-phase market lifecycle that separates market ideation from market activation, and further separates execution, custody, and resolution. This lifecycle is designed to reduce spam, bound risk exposure, and scale market supply without increasing onchain complexity.
We describe the lifecycle as a state machine over four phases:
Draft -> Activated -> Operational -> Resolved
Each phase has explicit transition conditions and governance controls.

4.1 Draft Market Board (Pre-Deploy Phase)
A MarketDraft is a non-binding market proposal generated prior to onchain deployment.
4.1.1 MarketDraft Schema
A MarketDraft is defined as:
D=(Q,Ω,Texpiry,Π,σ,Λ) 
Where:
	Q = natural language question
	Ω = {1,…,n} =  mutually exclusive and exhaustive outcome space
	Texpiry = expiration timestamp
	Π =  resolvability playbook (approved sources + criteria)
	Σ ∈ [0,1] = trust score
	Λ = suggested liquidity policy (initial b, caps, bands)
Drafts are generated via structured workflows and may optionally be committed onchain via hash anchoring.
4.1.2 Properties of Draft Phase
	No collateral is locked.
	No pricing curve exists.
	No execution session is active.
	No vault exposure is incurred.
This phase addresses the market supply bottleneck by allowing continuous candidate generation without economic commitment.

4.2 Claim or Design then Activate
A Draft becomes a live market only upon creator activation.
4.2.1 Creator Activation
A Creator C selects a draft D and submits:
	Initial capital commitment K,
	Liquidity parameter policy b or b(q),
	Fee schedule f,
	Per-market exposure cap Emax,
	Resolution bond requirement.
Activation deploys:
	MarketRegistry entry M,
	UnifiedVault (ERC-4626) attachment V,
	Yellow session instance S.
Formally:
D (---→)┴(Activate( C,   K ¬¬¬)) (M,V,S)

4.2.2 Economic Constraints
Activation enforces:
Lmax ≤ Emax ≤ α⋅VaultAssetsL
where Lmax is the LMSR worst-case loss bound.
This ensures that each market’s liability is explicitly budgeted within vault capacity.

4.3 Operation Phase
Once activated, the market enters operational state.
4.3.1 Trading
Trades are executed inside Yellow sessions:
Consider a trade that increments holdings of outcome 𝑘 by Δ ∈ ℝ (positive for a buy, negative for a sell), so the state moves from 𝑞 to 𝑞’ = 𝑞 + Δ𝑒𝑘 where 𝑒𝑘 is the 𝑘-th unit vector. The total cost (from the trader’s perspective) is
Δ𝐶 = 𝐶(𝑞 + Δ𝑒𝑘) − 𝐶(𝑞).	(3)

 
The average execution price per share is
¯𝑝𝑘 (𝑞, Δ) =
 

Δ𝐶
Δ	for Δ ≠ 0.
 
By convexity of 𝐶 we have
Δ𝐶 ≥ ∇𝐶(𝑞) · (Δ𝑒𝑘) = 𝑝𝑘 (𝑞) Δ,	when Δ > 0,
and
Δ𝐶 ≤ ∇𝐶(𝑞′) · (Δ𝑒𝑘) = 𝑝𝑘 (𝑞′) Δ,	when Δ < 0.
Thus for a buy (Δ > 0), ¯𝑝𝑘 (𝑞, Δ) lies between the initial price 𝑝𝑘 (𝑞) and the final price 𝑝𝑘 (𝑞′). Furthermore, larger |Δ| induces more price movement (“slippage”), governed by the curvature (i.e. the Hessian) of 𝐶.
Constraints include:
	maxCost,
	minShares,
	maxOddsImpact.
State transitions require signatures and increment session nonces.
4.3.2 Liquidity Provision
LPs may deposit into the UnifiedVault:
LPDeposit:A → V
Vault assets are allocated across markets via exposure budgets.
LPs receive ERC-4626 shares representing proportional claim on:
	Vault collateral,
	Trading fee revenue,
	Yield from strategy adapters.
4.3.3 Rebalancing
Creators may adjust:
	Liquidity parameter policy bbb,
	Fee schedule,
	Exposure caps.
Rebalancing actions are constrained by solvency invariants and may trigger forced checkpointing.
4.3.4 Checkpointing
Periodically:
Soffchain → Sonchain
Netted deltas are committed to onchain settlement contracts. The transcript hash ensures auditability without replaying full trade history.

4.4 Resolution and Close
At expiry Texpiry, the market transitions to resolution state.
4.4.1 Outcome Proposal
A resolution workflow produces:
R = (ω∗, evidence hash, confidence, bond)
The proposal is submitted onchain with bond collateral.
4.4.2 Escalation
If disputed:
R → Escalation
Escalation may involve:
	Commit-reveal voting,
	Additional evidence submission,
	Slashing of incorrect proposers.
4.4.3 Finalization
Upon resolution finality:
Settlement(q,ω*)
Each trader holding θi shares receives:
Payout=θω∗
Vault collateral is debited accordingly.
4.4.4 Market Close
After settlement:
	Market state is archived.
	Remaining fees are distributed.
	Exposure budget is released back to vault.
The lifecycle completes:
Resolved → Closed

4.5 Governance Considerations
RetroPick governance operates at two levels:
Market-Level Governance
	Creator-defined parameters within bounded constraints,
	Resolution escalation rules defined in playbook,
	Per-market risk budgeting.
System-Level Governance
	Protocol upgradeability,
	Global risk sentinel thresholds,
	Cross-chain routing policy (if applicable).
Importantly, governance does not alter:
	Signed execution states,
	Settled outcomes,
	Vault custody guarantees.
________________________________________
4.6 Lifecycle Invariants
Across all phases, the following invariants hold:
	Collateral remains non-custodial.
	Worst-case market liability is bounded.
	Latest signed state is enforceable.
	Resolution follows predefined playbooks.
	Exposure never exceeds vault capacity.


	The Multi-Outcome Logarithmic Market Scoring Rule (LMSR)
	Outcome space and securities
RetroPick operates over discrete, mutually exclusive outcome spaces and implements a cost-function-based market maker within a broader infrastructure that separates pricing, execution, custody, and resolution. This section formalizes the outcome Outcome, the cost-function mechanism, and the structural assumptions underlying the system.
Let Ω = {1, . . . , 𝑛} denote a finite set of mutually exclusive and exhaustive outcomes. In RetroPick Outcome-winner market:
                         Ω = {1, . . . , 𝑛} = {“Outcome 1 wins”, . . . , “Outcome n wins”},
and exactly one outcome 𝜔 ∈ Ω is realized at settlement. We consider a vector of Arrow-Debreu securities 𝑋 (𝜔) ∈ ℝ𝑛 with components: 

x_i (ω)={█(1,if ω=i@0,&otherwise)┤


A share of security 𝑖 pays 1 if outcome 𝑖 occurs and 0 otherwise. A trader’s position is a vector 𝜃 ∈ ℝ𝑛, where 𝜃𝑖 is the number of shares of outcome 𝑖 they hold. 

	Cost-function market makers
A cost-function market maker maintains a differentiable, convex function 𝐶 : ℝ𝑛 → ℝ mapping vectors
𝑞 ∈ ℝ𝑛 of outstanding shares held by all traders to an aggregate market value. Intuitively, 𝐶(𝑞) is the cumulative amount of base tokens that have been paid into the market maker to create the current
state 𝑞. That said, as will be discussed throughout this report, the power of these cost-functions is not usually in the value of 𝐶(𝑞) directly; it is in the rich market-wide information encoded by higher-order properties of 𝐶 at any given market state 𝑞.
Given a current state 𝑞:

	The instantaneous price vector is
𝑝(𝑞) = ∇𝐶(𝑞) ∈ ℝ𝑛
A trader who wants to execute some trade vector Δ ∈ ℝ𝑛 and, hence, change the global share vector from 𝑞 to 𝑞 + Δ pays
TradeCost(𝑞, Δ) = 𝐶(𝑞 + Δ) − 𝐶(𝑞)

And the market maker is always willing to “sell” Δ𝑖 > 0 shares of outcome 𝑖 at a total cost equal to the increase in 𝐶, and similarly will “buy back” shares when Δ𝑖 < 0.

	Trading Primitives
		RetroPick prioritizes safe primitives that are compatible with multi-outcome markets and reduce the need for negative share vectors in early deployments.

		5.3.1 Primitive A: BuyShares (single outcome purchase)
			A trader buys 𝛿>0 shares of outcome 𝑘. Define:
Δ = 𝛿ek
				Where ek is the k-th standard basis vector. The required payment is:

CostBuy(𝑞, k, 𝛿) = 𝐶(𝑞 + 𝛿ek) − 𝐶(𝑞)
Execution constraints (submitted by the trader as limit conditions):
	MaxCost: Costbuy ≤ maxCost
	MinShares: δ ≥ minShares
These constraints are checked inside the Yellow session at execution time.
5.3.2 Primitive B: SwapShares (atomic i→j reallocation)
To support position adjustment without enabling unrestricted “shorting primitives” in v1, RetroPick defines a swap as:

Δ=−δei+δej
		The cost is:
Costswap(q, i, j, δ) = C(q – δei + δej) − C(q)
	If the cost is negative, the trader receives the difference (credited within the session balance model).
	Execution constraints:
	MaxCost (for buy-dominant swaps)
	MinReceive (for sell-dominant swaps)
In early deployments, the system can enforce feasibility restrictions such as requiring the trader to hold enough iii-shares to swap out (position non-negativity), which simplifies risk.

	5.3.3 Optional Primitive C: SellShares (restricted)
True sell operations (Δ=−δek) can create negative states if unconstrained. RetroPick can implement sell as a special case of SwapShares into a “cash-like” internal balance within Yellow (not as negative outcome shares), but this requires explicit session collateral accounting and is typically introduced after the basic system is stable.


	Definition

 
 
 
RetroPick uses the Logarithmic Market Scoring Rule (LMSR) baseline:
c(q)=b⋅ln⁡(∑_(i=1)^n▒ⅇ^(q_i∕b) )
where 𝑏 > 0 is a liquidity (or depth) parameter. 
The Prices are:
p_i (q)=ⅇ^(q_i/b)/(Σ_j ⅇ^(q_j/b) )

 Properties:
	Σ_i ⅇ^(q_i/b) = 1
	Continous prices
	Bounded worst-case loss:
〖Loss〗_max=b.ln⁡(n)
	Always-available liquidity


1The foundations laid by Frongillo & Waggoner (3) is a good starting point for exploring MSRs and cost-function markets.
 

	Liquidity-Sensitive Extension (Policy Layer)

RetroPick introduces a liquidity-sensitive extension by defining:

b=b(q)

As a policy-driven function of open interest, such as:

b(q)=b0+α⋅OI(q)

Where:

OI(q)=∑_i▒q_i 
This allows:
	shallow liquidity in early markets
	deeper liquidity as participation grows
	smoother slippage growth
The core LMSR structure remains intact; liquidity sensitivity is implemented as a policy layer within execution sessions.

	Trading and execution prices
Consider a trade that increments holdings of outcome 𝑘 by Δ ∈ ℝ (positive for a buy, negative for a sell), so the state moves from 𝑞 to 𝑞’ = 𝑞 + Δ𝑒𝑘 where 𝑒𝑘 is the 𝑘-th unit vector. The total cost (from the trader’s perspective) is
Δ𝐶 = 𝐶(𝑞 + Δ𝑒𝑘) − 𝐶(𝑞).	(3)

 
The average execution price per share is
¯𝑝𝑘 (𝑞, Δ) =
 

Δ𝐶
Δ	for Δ ≠ 0.
 
By convexity of 𝐶 we have
Δ𝐶 ≥ ∇𝐶(𝑞) · (Δ𝑒𝑘) = 𝑝𝑘 (𝑞) Δ,	when Δ > 0,
and
Δ𝐶 ≤ ∇𝐶(𝑞′) · (Δ𝑒𝑘) = 𝑝𝑘 (𝑞′) Δ,	when Δ < 0.
Thus for a buy (Δ > 0), ¯𝑝𝑘 (𝑞, Δ) lies between the initial price 𝑝𝑘 (𝑞) and the final price 𝑝𝑘 (𝑞′). Furthermore, larger |Δ| induces more price movement (“slippage”), governed by the curvature (i.e. the Hessian) of 𝐶.

	Worst-case loss bound
Suppose the market maker initially has state 𝑞 = 0 and cash 𝐵0 = −𝐶(0) (so that its net wealth is normalized to zero). After an arbitrary sequence of trades, the state is 𝑞 and the cumulated cash held by the market maker is 𝐵 = −𝐶(0) + 𝐶(𝑞).
When outcome 𝜔 ∈ Ω is realized, the market maker must pay 𝑞𝜔 tokens to holders of outcome 𝜔. Its terminal wealth is thus
𝑊 (𝜔) = 𝐵 − 𝑞𝜔 = 𝐶(𝑞) − 𝐶(0) − 𝑞𝜔.

The worst-case loss is:
𝐿max = sup max[𝑞𝜔 − 𝐶(𝑞) + 𝐶(0)] = sup max[𝑞𝑖 − 𝐶(𝑞)] + 𝐶(0) .

For LS-LMSR with payouts in [0, 1] and 𝐶(0) = 𝑏 log 𝑛, one can show (1; 2) that
𝐿max ≤ 𝑏 log 𝑛.	(4)
Intuitively, as traders push one outcome’s probability toward 1 (and others toward 0), they must pay in more and more to move the log partition function, limiting the severity of a subsequent upset.
In Delphi we treat 𝐿max as a risk budget allocated to the market and choose 𝑏 accordingly:
𝑏 = 𝐿max .	(5)
log 𝑛

5.4 Slippage & Execution Price
In cost-function market makers, trades execute across a curve: the trader does not transact at the instantaneous marginal price alone, but at an average price determined by the integral of marginal prices along the path.
5.4.1 Execution price
For a BuyShares trade (k,δ)(k,\delta)(k,δ), define the average execution price as:
pˉk(q,δ)=C(q+δek)−C(q)δ\bar{p}_k(q,\delta) = \frac{C(q+\delta e_k) - C(q)}{\delta}pˉk(q,δ)=δC(q+δek)−C(q) 
This value lies between the starting marginal price and ending marginal price:
pk(q)≤pˉk(q,δ)≤pk(q+δek)p_k(q) \le \bar{p}_k(q,\delta) \le p_k(q+\delta e_k)pk(q)≤pˉk(q,δ)≤pk(q+δek) 
for δ>0\delta>0δ>0. The difference between marginal and execution price is precisely what users experience as slippage.
5.4.2 Slippage definition
Define slippage relative to the starting marginal price:
Slipk(q,δ)=pˉk(q,δ)−pk(q)\text{Slip}_k(q,\delta) = \bar{p}_k(q,\delta) - p_k(q)Slipk(q,δ)=pˉk(q,δ)−pk(q) 
and optionally as basis points:
SlipBpsk(q,δ)=104⋅pˉk(q,δ)−pk(q)pk(q)\text{SlipBps}_k(q,\delta) = 10^4 \cdot \frac{\bar{p}_k(q,\delta) - p_k(q)}{p_k(q)}SlipBpsk(q,δ)=104⋅pk(q)pˉk(q,δ)−pk(q) 
RetroPick can enforce a maximum via constraint:
SlipBpsk(q,δ)≤maxOddsImpactBps\text{SlipBps}_k(q,\delta) \le \text{maxOddsImpactBps}SlipBpsk(q,δ)≤maxOddsImpactBps 
5.4.3 Why slippage is enforced inside Yellow (not onchain)
RetroPick trades execute in Yellow sessions with signed state updates. Therefore:


	slippage is evaluated at the moment of execution using the current session state qqq,
	the resulting trade cost and updated positions are recorded in the signed state,
	onchain finalization commits only netted deltas without re-running pricing computation.
Hence, settlement does not re-price trades; it only redeems based on the outcome and the already-committed positions.
5.4.4 Practical ML-driven liquidity policy hooks (preview)
Although Section 5 defines baseline LMSR mechanics, RetroPick’s ML layer can inform parameter choices used by the execution engine (formalized later under LS-LMSR policy):
	selecting b0b_0b0 from trust score σ\sigmaσ,
	capping maximum trade size for low-trust drafts,
	increasing fees dynamically for abnormal flow,
	tiering markets (experimental/emerging/popular) from open interest and volatility of implied probabilities.
These controls should be treated as policy overlays on top of the deterministic cost-function accounting, not as replacements.

	Interpretation as a proper scoring rule
LS-LMSR is the market-scoring-rule version of the (logarithmic) proper scoring rule. In the single-trader case, if a forecaster reports probability vector 𝑝 and the realized outcome is 𝜔, then their log score is proportional to log 𝑝𝜔. Truthful reporting of their belief distribution maximizes the expected log score.
In a market scoring rule traders sequentially update the current quote 𝑝 to a new quote 𝑝′ and pay the difference in score relative to a reference prediction. Hanson (1) shows that, in the cost-function formulation, the logarithmic scoring rule corresponds exactly to the cost function in equation 1. Chen and Pennock (2) further characterize LS-LMSR as an exponential-utility market maker.


 

	Yellow Session Execution and Staet Commitment

RetroPick executes trading offchain inside per-market Yellow sessions to achieve Web2-class latency and reduce per-trade gas costs. Onchain contracts act as custody + adjudication, enforcing correct settlement through (i) verifiable deposits, (ii) challengeable state commitments, and (iii) dispute exits that ensure latest signed state wins. This section specifies the session outcome semantics, state schema, checkpointing protocol, exit/dispute flow, and MEV-resistance properties.

6.1 Session Outcome
6.1.1 Session participants and trust model (Phase 1)
RetroPick uses a hub-and-spoke session topology per market mmm:
	Trader uuu: submits orders and signs state transitions.
	Operator OOO: runs the pricing engine (LMSR/LS policy), matches orders, maintains the session ledger, and co-signs state transitions.
This design yields strong safety with weaker liveness:
	Safety (non-custodial): operator cannot steal funds because collateral remains onchain and withdrawals require valid signed state.
	Liveness: operator can censor/delay offchain execution, but traders can force settlement by initiating onchain exit.
6.1.2 Outcome semantics of a session
A session’s “outcome” is not the prediction outcome; it is the finalized ledger outcome for a time interval:
	A sequence of trades produces a sequence of signed states S0→S1→⋯→STS_0 \rightarrow S_1 \rightarrow \dots \rightarrow S_TS0→S1→⋯→ST.
	The canonical session outcome is the most recent valid state STS_TST for which signatures and validity conditions hold.
	Onchain finalization commits an authenticated digest of STS_TST (and possibly netted deltas) to the market’s custody/settlement contracts.
Critically, once STS_TST is finalized, the onchain layer must not “re-price” any trade; it only settles positions as recorded in STS_TST.

6.2 State Schema
The state schema must support: (i) deterministic verification, (ii) replay protection, (iii) bounded execution constraints, and (iv) auditability.
6.2.1 Minimum signed state (per market session)
Let StS_tSt denote the session state at step ttt. A minimal schema is:
Header
	sessionId: unique identifier bound to (marketId,chainId,vaultId)(marketId, chainId, vaultId)(marketId,chainId,vaultId)
	marketId: registry identifier
	vaultId: associated ERC-4626 vault (creator vault)
	epoch: monotonic counter for checkpoint periods
	nonce: monotonic counter per state update (strictly increasing)
	validFromBlock (optional): anchor to onchain time window
	stateVersion: schema versioning for upgrades
Market maker state
	q[0..n-1]: outcome share vector for LMSR/LS pricing
	bParams: parameters used to derive liquidity depth (e.g., bbb, or (b0,α,caps)(b_0,\alpha,\text{caps})(b0,α,caps))
	feeParams: fee schedule and dynamic multipliers
	riskCaps: constraints active for this epoch (maxOI, maxOddsImpactBps, maxPosPerUser, etc.)
Account state (for each user u)
	balance[u]: available collateral balance inside session (credited from onchain deposits)
	locked[u]: optional locked margin if you separate free vs reserved
	pos[u][0..n-1]: outcome share holdings (or equivalent claim units)
	feeAccrued[u]: fees paid/earned (optional but useful for audits)
Accounting digests
	accountsRoot: Merkle root over account leaves (so state can be proven with inclusion proofs)
	txRoot: Merkle root over executed trades in this epoch (optional but strong for audit/MEV claims)
	invariantRoot (optional): committed summary of solvency variables (OI, reserved margin, etc.)
	prevStateHash: hash pointer to St−1S_{t-1}St−1 to prevent reordering
Signatures
	sigUser and sigOperator (or aggregated multi-sig in future)
6.2.2 Validity conditions (what must be checked offchain + enforceable onchain)
At minimum, every transition St−1→StS_{t-1}\rightarrow S_tSt−1→St must satisfy:
	Monotonicity: nonce increments; prevStateHash matches.
	Signature validity: required parties signed the state.
	Balance safety: user balances never go negative after applying trade costs and fees.
	Position safety (Phase 1 conservative): positions are non-negative or satisfy allowed swap constraints.
	Constraint compliance: trade-specific limits (maxCost/minShares/maxOddsImpactBps) hold at execution time.
	Risk caps: global caps (per-market OI caps, per-user caps) are respected.
Onchain verification typically checks only (1)–(2) and challenge structure, while (3)–(6) are enforced through challenge games or “fraud proofs” (depending on your Yellow implementation). If fraud proofs are too heavy for MVP, you enforce (3)–(6) by requiring that any exit submission include minimal proofs (account leaf + trade receipts for disputed range), plus a dispute window.

6.3 Checkpointing
Checkpointing provides a performance-security tradeoff: it reduces onchain writes while bounding rollback and dispute scope.
6.3.1 Checkpoint cadence
Define checkpoints either:
	time-based (every Δt\Delta tΔt minutes), or
	volume-based (every NNN trades), or
	risk-based (triggered when volatility/odds impact exceeds threshold).
Risk-based checkpoint triggers are particularly useful for prediction markets close to expiry.
6.3.2 Checkpoint commitment structure
At checkpoint kkk, the operator submits an onchain commitment CkC_kCk containing:
	sessionId, epoch=k, stateHash = H(S_T)
	accountsRoot (Merkle root of balances + positions)
	txRoot (optional but strongly recommended)
	solvencySnapshot (optional: OI, reserved margin, vault health metrics)
	timestamp/blockNumber anchor
This commitment is not a replay of trades; it is a public anchor that fixes the canonical state at that time unless challenged.
6.3.3 Why txRoot matters (audit + MEV claims)
Including txRoot enables:
	later auditing of execution ordering (even if trade details are private offchain),
	dispute narrowing (prove a trade was included/excluded),
	stronger “fair execution” arguments for institutions.
A practical approach is to commit trade hashes with salted fields (to hide user identity/size) while still enabling later reveal if disputed.

6.4 Exit + Dispute
RetroPick must support unilateral exit: any trader can force withdrawal/settlement using the latest signed state they possess.
6.4.1 Exit initiation
A trader submits:
	stateHash + full state header,
	inclusion proof for their account leaf under accountsRoot,
	signatures (user+operator) for that state,
	and their withdrawal claim (balance and/or settlement entitlement post-resolution).
Onchain contract checks:
	session validity (correct sessionId, epoch, etc.)
	signature validity
	Merkle inclusion proof of the trader’s account leaf
	that the exit refers to a state that is ≥ the latest committed checkpoint epoch (or otherwise permitted)
6.4.2 Challenge window (“latest state wins”)
After an exit is posted, a challenge period opens. Any party (operator or counterparty watchers) can challenge by presenting a newer valid signed state S′S'S′ with:
	higher nonce (or later epoch),
	valid signatures,
	and inclusion proof for the same user leaf.
If valid, the exit is updated (or the older exit is invalidated). This yields a clean rule:
Finalized exit must correspond to the newest valid signed state available before the challenge window closes.
6.4.3 Failure modes handled
	Operator censorship: trader exits onchain with latest signed state.
	Operator submits old checkpoint: trader challenges with newer signed state.
	Trader attempts fraudulent exit: operator challenges with newer state or proves invalid signature/inclusion.
	Operator offline: trader still exits; liveness degrades but funds are safe.
________________________________________
6.5 MEV Resistance Properties
Offchain execution changes the MEV surface. RetroPick’s MEV resistance comes from eliminating the mempool-based auction for most trades while preserving enforceable constraints.
6.5.1 Mempool MEV reduction
In onchain CFMMs, trades are public before execution, enabling:
	sandwiching,
	backrunning,
	priority gas auctions,
	censorship via transaction ordering.
In Yellow sessions:
	trades are executed offchain and finalized as state commitments,
	therefore most classical mempool MEV is removed from the trading path.
6.5.2 Ordering and fairness risks (new MEV surface)
Offchain introduces new risks:
	operator ordering power: the operator can reorder trades internally,
	selective inclusion: the operator can delay or reject certain trades,
	information asymmetry: the operator sees order flow.
RetroPick mitigates these with protocol-level controls:
	User-signed limits: each trade includes maxCost, minShares, maxOddsImpactBps; reordering cannot violate these without invalidating the state transition.
	Checkpoint commitments + txRoot: commit to an auditable transcript root per epoch; disputes can reveal ordering and enforce accountability.
	Deterministic pricing function: given qqq and parameters, the executed trade cost is deterministic; manipulation requires either censoring trades (liveness issue) or violating signed constraints (provable).
	Close-to-expiry hardening: enforce more frequent checkpoints, increased fees, and stricter odds-impact caps as expiry approaches to reduce “late-trade exploitation.”
6.5.3 End-stage MEV and resolution window
Prediction markets are uniquely vulnerable near resolution: when information becomes known offchain before the oracle finalizes, traders can extract value.
RetroPick reduces this via:
	fast-path resolution (MODRA) to shrink the time between “truth known” and “market settled,”
	risk sentinel triggers (e.g., force checkpoint + tighten constraints as expiry nears),
	optional trading freeze windows tied to deterministic expiry rules.
6.5.4 Institutional-grade auditability (practical requirement)
Institutions typically require:
	evidence that execution is rule-based and replayable,
	controls against selective treatment,
	post-trade audit trails.
RetroPick’s recommended minimum to satisfy this expectation is:
	accountsRoot + txRoot commitments,
	signed state transitions,
	deterministic pricing and fee policy versioning per epoch,
	and a publicly documented dispute procedure.


	RetroPick LS-LMSR Market Specification
Delphi instantiates this general LS-LMSR framework in specialized Outcome-competition markets. In this section we explain how trades, fees, and settlement works.

	Outcome-winner outcomes
Let M = {1, . . . , 𝑛} be the index set of submitted Outcomes in a competition. The outcome space is Ω = M, and the payoff of a share of Outcome 𝑖 is 𝑋𝑖 (𝜔) = 𝟙[𝜔 = 𝑖], with the constraint that only one outcome wins.
The evaluation pipeline (§8) computes a deterministic function
𝑤 : M → Ω
that maps the set of possible Outcomes to a unique winner, e.g. the Outcome with the highest score under a fixed metric on a fixed dataset (with pre-committed tie-breaking).

	State variables
At any block height 𝑡, the on-chain state of a single market includes:
	Share vector 𝑞(𝑡) = (𝑞1 (𝑡), . . . , 𝑞𝑛 (𝑡)) ∈ ℝ𝑛;
	LS-LMSR liquidity parameter 𝑏 > 0 (constant over the life of a market);
	Fee parameter 𝜏 ∈ [0, 1) (constant or piecewise constant);
	Vault balance 𝑉 (𝑡) (see §5);
	Revenue pool balance 𝑅(𝑡) (accumulated net fees).
We suppress explicit time indices when unambiguous.
On-chain, these quantities are stored as integers in a fixed-point format (e.g. 10−18 token precision). The functional form of 𝐶 and 𝑝 are implemented using exponentials and logarithms built into Solidity’s PRBMath library, with appropriate thresholding on trades to ensure numerical and market stability.

	Fee mechanism
RetroPick charges a proportional fee 𝜏 ∈ [0, 1] on the notional size of each trade. For a state transition
𝑞 → 𝑞′ = 𝑞 + Δ𝑒𝑘, recall that
Δ𝐶 = 𝐶(𝑞′) − 𝐶(𝑞)
and define the notional 𝑁 = |Δ𝐶|. We are ready to derive actualized costs per trade and fee revenues.

Buy-side trade (i.e. Δ𝐶 > 0).	The trader pays
CashOut = (1 + 𝜏) Δ𝐶
tokens, i.e. cost to buy shares and the trading fees. The AMM’s internal cash account increases by Δ𝐶, and the revenue pool increases by Δ𝑅 = 𝜏Δ𝐶.

Sell-side trade (i.e. Δ𝐶 < 0).	The trader receives
CashIn = (1 − 𝜏) |Δ𝐶|
tokens, i.e. return on shares and the trading fees. The AMM releases |Δ𝐶| from its cash account, and the revenue pool receives Δ𝑅 = 𝜏|Δ𝐶|.
 

Effect on bounded loss.	The classical LS-LMSR bound (equation 4) assumes no fees. With fees, the worst-case net loss to the AMM is strictly less, because every trade contributes a non-negative amount to
𝑅(𝑡), which remains available to cover payouts at settlement.
In practice, we treat the theoretical bound 𝐿max = 𝑏 log 𝑛 as a conservative risk budget and layer additional safety margins on top of it (§5.3).

	LS-LMSR Vault: Liquidity Provision and P&L Sharing
The LS-LMSR Vault is a pooled capital account that backs the AMM and earns trading fees. During testnet the Vault is entirely provisioned by the market maker (i.e. Gensyn), but in the future it will allow external participants to act as passive market makers.

	Vault mechanics
Let 𝑉 (𝑡) be the total value of the vault (in $AI) at time 𝑡, and let 𝑆(𝑡) be the total supply of a vault share token.

Deposits.	When a user deposits an amount 𝑑 > 0 at time 𝑡, they receive
𝑑, 		if 𝑆(𝑡) = 0 (first depositor),
 
𝑠mint =
 
𝑑 · 𝑆(𝑡) ,	otherwise,
𝑉 (𝑡)
 
new vault share tokens, preserving proportional ownership. The share supply increases to 𝑆(𝑡+) = 𝑆(𝑡) + 𝑠mint
and the vault balance to 𝑉 (𝑡+) = 𝑉 (𝑡) + 𝑑.

Withdrawals.	When a user redeems 𝑠 > 0 vault shares, they receive

 

𝑑redeem
 
= 𝑠 · 𝑉 (𝑡)
𝑆(𝑡)
 
tokens, and the share supply decreases to 𝑆(𝑡+) = 𝑆(𝑡) − 𝑠, with 𝑉 (𝑡+) = 𝑉 (𝑡) − 𝑑redeem.

Trading P&L.	For a single market, the vault experiences:

	Fee inflows Δ𝑅 on every trade (§4.3),
	A terminal payoff at settlement equal to minus the AMM’s net liability to winning traders.

Let 𝐹 denote total fee income and 𝐿real the realized loss (if any) of the LS-LMSR for that market. Then the contribution of that market to the vault’s value is
Δ𝑉 = 𝐹 − 𝐿real.
Across many markets, these contributions aggregate over time.
 

	Break-even turnover and risk budget
Let 𝐿 be the worst-case loss budget assigned to a given market (e.g. 𝐿 = 𝑏 log 𝑛). Suppose the total absolute trade notional (ignoring sign) over the life of the market is:
 


Fee income is approximately 𝐹 ≈ 𝜏𝑉.
 
𝑉 =
trades 𝑘
 
|Δ𝐶𝑘 |.
 
A simple heuristic for break-even turnover 𝑉∗ is
𝑉∗ ≈ 𝐿 ,	(6)
𝜏
Therefore, if 𝑉 ≫ 𝐿/𝜏, fee income alone can cover the worst-case loss before accounting for any favorable trading P&L.

Illustrative example.	Suppose there are 𝑛 = 10 Outcomes, a risk budget 𝐿 = 40,000 tokens for the LS-LMSR, fee of 𝜏 = 1%, and realized volume 𝑉 = 8,000,000 tokens. Then
𝐹 ≈ 0.01 · 8,000,000 = 80,000,
and even if 𝐿real hits the full budget 𝐿 = 40,000, the vault is ahead by 40,000 tokens before costs. Note that this is not a guarantee of profit; it is a sizing heuristic for 𝑏 and 𝜏.

	Coverage and risk management
We define a coverage ratio for the vault relative to the total risk budget allocated across active markets:
𝜅(𝑡) =	𝑉 (𝑡)	,
𝑚∈Mactive 𝐿𝑚
where 𝐿𝑚 is the loss budget for market 𝑚. We target 𝜅(𝑡) above a threshold, e.g. 𝜅min > 1. If 𝜅(𝑡) approaches the threshold, protocol-level controls can automatically:
	Reduce 𝑏 (and thus 𝐿𝑚) on new or even existing markets;
	Impose caps on order sizes to limit rapid changes in 𝑞;
	Temporarily pause new market creation or deposits.
Vault deposits and withdrawals are also subject to windows around settlement times to avoid last-minute liquidity flight. These parameters are design decisions that can be tuned based on empirical usage.

	Risk Calibration and the Liquidity Parameter
	From worst-case loss to depth
Given a desired per-market loss budget 𝐿 and number of outcomes 𝑛, we select
𝑏 =	𝐿  .
log 𝑛
The choice of 𝑏 implies a specific trade-off:
	Near uniform prices (𝑝 ≈ 1/𝑛), what impact do small trades have on price.
	Moving an outcome’s implied probability from 𝑝 to 𝑝′ requires total cost roughly 𝑏 log 𝑝′  (holding
others fixed), so larger 𝑏 increases the monetary cost of large moves.
 

	Pathwise considerations
The bound 𝐿max ≤ 𝑏 log 𝑛 is path-independent: it holds regardless of the sequence of trades. In practice, realized loss 𝐿real is often much smaller because:

	Traders partially “self-insure” when they buy and later sell as beliefs change.
	Two-sided flow (some traders buying, others selling) tends to keep 𝑞 closer to balanced states where
𝑝𝑖 remain near uniform.

However, for protocol safety we do not rely on this; risk controls are based on the worst-case bound.

	Comparison with Order-Book Prediction Markets
Many large prediction venues (e.g. Polymarket and Kalshi) implement central limit order books or continuous double auctions for trading event contracts, especially in regulated settings. These designs primarily act as matching engines: traders (or external market makers) post collateral and take on outcome risk, while the venue itself can externalize most inventory risk (4).
From the perspective of our design space:

	Order books (matching designs). The venue creates and destroys outcome shares only when there is a counterparty; properly margined, the venue itself need not hold a risky inventory. Hence liquidity is endogenous and can dry up in thin markets, leading to wide spreads and stale prices.
	Cost-function AMMs (LS-LMSR). The venue (or its liquidity providers) runs an always-on market maker willing to buy or sell any bundle at prices given by ∇𝐶(𝑞). Inventory risk is borne by the market maker, but is provably bounded and can be calibrated via 𝑏.

For RetroPick specific use case—thin yet information-rich competitions—LS-LMSR has several advantages:

	Continuous liquidity even when very few traders are active;
	Coherent probabilities across all Outcomes where prices sum to 1 by construction;
	A clean, parametrically bounded risk profile for Market Makers.

	Settlement and Reproducible Evaluation
The payout of RetroPick LS-LMSR market depends on the outcome of an ML competition. To make settlement reproducible and verifiable, we will rely on two components:

	A fully specified evaluation program 𝐸 (Outcome loading, preprocessing, metrics, tie-breaking);
	Verde’s (5) refereed-delegation protocol and reproducible operator library which ensures independent evaluators obtain bitwise-identical results.

Initially, Delphi will utilize transparent public reporting of evaluations as we build out and test features modularly. Once the Verde protocol’s integration is feature complete, settlement will be fully reproducible and verifiable by machine.

	Evaluation as a reproducible program
Let 𝐸 denote a deterministic program that, given:
 

	A Outcome index 𝑖,
	A dataset 𝐷,
	Fixed hyperparameters and seeds,

returns a scalar score 𝜎𝑖 ∈ ℝ (or a vector of scores). The winner function is
𝑤 = arg max 𝜎𝑖,
𝑖∈{1,...,𝑛}
with deterministic tie-breaking if necessary.
In practice, both 𝐸 and 𝐷 are committed on-chain before trading opens. The commitment ensures that the evaluation definition cannot be changed ex post.

	Verifiable execution via refereed delegation
Verde (5) adapts the cryptographic notion of refereed delegation to machine learning programs. At a high level:

	Multiple compute providers can independently run the evaluation program 𝐸 and commit to check- points and outputs via Merkle-tree-based hashes.
	If providers disagree on the output, a referee runs an interactive dispute resolution protocol that recursively narrows down the first diverging checkpoint and then the first diverging operation in the underlying computational graph.
	At the lowest level, the referee re-executes a single operator to determine which party is honest.

To make this viable, Verde relies on a library of reproducible operators (RepOps) that enforce a deter- ministic execution order for floating-point operations across hardware setups. This avoids the usual non-determinism introduced by parallel floating-point arithmetic on GPUs.
For Delphi, the key property is:

Any honest verifier (e.g. a node, user, or governance process) can re-run the evaluation of the winning Outcome using the same program 𝐸 and RepOps, and obtain the same bitwise output. If any evaluator deviates, a refereed-delegation protocol can economically punish them. Hence markets can be transparently settled by machines rather than opaque resolution mechanisms.

Thus, the mapping from market state (𝑞, 𝑏, 𝜏) to settlement outcome 𝜔 is:
𝜔 = 𝑤 𝐸(1), . . . , 𝐸(𝑛) ,
where each 𝐸(𝑖) is reproducible, and disputes about 𝐸 can be resolved via a dispute resolution game.

	Composition with the LS-LMSR AMM
From the perspective of the LS-LMSR AMM, settlement requires only the index 𝜔 of the winning outcome. Once 𝜔 is determined:

	The protocol computes each trader’s net position in shares of outcome 𝜔,
	Pays out 1 token per share,
	Burns all outstanding shares (or marks the market as resolved),
	Realizes the AMM’s P&L relative to the vault.
 

Ultimately the result is that the market participants will effectively bid on verifiable outputs of de- terministic ML evaluations, rather than on a vaguely defined event subject to discretionary human resolution.

	Conclusion and Extensions
We described RetroPick LS-LMSR-based prediction market design, which is backed by a community vault and paired with verifiable ML settlement. The main design choices were:

	Using LS-LMSR to obtain continuous, probabilistic prices and a bounded worst-case loss;
	Funding the market maker via an on-chain vault that shares fee income and risk among stakers;
	Calibrating the liquidity parameter 𝑏 and fee 𝜏 to satisfy a risk budget and break-even turnover target;
	Integrating with Verde’s refereed-delegation framework making settlement reproducible and verifiable.

From an engineering perspective, LS-LMSR provides a compact and mathematically tractable core: a single convex function and its gradient. Around this, Delphi layers the practical concerns of risk management, liquidity provision, and reproducible ML evaluation, resulting in a prediction market system that is truly decentralized, transparent, and computationally robust.

References
	R. Hanson. Logarithmic Market Scoring Rules for Modular Combinatorial Information Aggregation. Journal of Prediction Markets, 1(1):3–15, 2007. Available at https://mason.gmu.edu/~rhanson/mktscore.pdf.
	Y. Chen and D. M. Pennock. A Utility Framework for Bounded-Loss Market Makers. arXiv:1206.5252, 2012.
		R. Frongillo and B. Waggoner. An Axiomatic Study of Scoring Rule Markets. Innovations in Theoretical Computer Science Conference (ITCS), 2018.
		N. Rahman, J. Al-Chami, and J. Clark. SoK: Market Microstructure for Decentralized Prediction Markets (DePMs). arXiv:2510.15612, 2025.
		A. Arun, A. St. Arnaud, A. Titov, B. Wilcox, V. Kolobaric, M. Brinkmann, O. Ersoy, B. Fielding, and J. Bonneau. Verde: Verification via Refereed Delegation for Machine Learning Programs. arXiv:2502.19405, 2025.
	J. Wolfers and E. Zitzewitz. Prediction Markets. Journal of Economic Perspectives, 18(2):107–126, 2004.

