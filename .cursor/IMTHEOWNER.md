Yep — this explains *exactly* why you’re seeing the CRE/broadcaster address as `creator`.

In your contract you do:

```solidity
creator: msg.sender
...
emit MarketCreated(..., msg.sender);
```

So whoever **sends the onchain transaction** becomes the creator.

In your CRE flow, the tx sender is **the EVM capability signer/broadcaster**, not your deployer hot wallet. That’s why `creator != deployer`.

---

## Why deployer is not the creator (clear mental model)

* **Deployer**: the address that executed the constructor once (deploy tx).
* **Creator**: the address that called `createMarket()` (or the function that eventually calls it).

Those are completely independent.

CRE submitted the tx that resulted in market creation, so Solidity sees:

* `msg.sender = 0x15fC...` (CRE broadcaster)
* not your deployer wallet

Even if you deployed with your hot wallet, it doesn’t automatically become `msg.sender` for future calls.

---

## If you want “creator = the user/hotwallet”, you must change the design

There are 3 safe patterns; choose based on your product.

### Pattern A (recommended for CRE): store both `creator` and `requestedBy`

Keep `creator` as the tx sender (CRE), but also store the “real initiator” inside the payload.

#### 1) Update the struct (add requestedBy)

```solidity
address requestedBy;
```

#### 2) Change createMarket signature

```solidity
function createMarket(address requestedBy, string memory question) public returns (uint256 marketId) {
    marketId = nextMarketId++;

    markets[marketId] = Market({
        creator: msg.sender,          // CRE broadcaster
        requestedBy: requestedBy,     // real initiator
        createdAt: uint48(block.timestamp),
        settledAt: 0,
        settled: false,
        confidence: 0,
        outcome: Prediction.Yes,
        totalYesPool: 0,
        totalNoPool: 0,
        question: question
    });

    emit MarketCreated(marketId, question, requestedBy);
}
```

#### 3) Update CRE encoding

Change ABI params to:

```ts
parseAbiParameters("address requestedBy,string question")
```

and encode `[requestedBy, question]`.

✅ Pros: preserves CRE trust model and gives correct attribution.
⚠️ You must validate `requestedBy` (see below).

---

### Pattern B: “creator is always deployer” (simple, but usually wrong)

If you literally want the deployer/hotwallet always shown as creator, you can hardcode it:

```solidity
address public owner;

constructor() { owner = msg.sender; }

function createMarket(string memory question) public returns (uint256 marketId) {
    ...
    creator: owner
}
```

✅ Pros: simplest.
❌ Cons: it lies about who initiated each market; not good for multi-user systems.

---

### Pattern C: only allow your hotwallet to create markets (centralized)

Require that only your wallet can call createMarket:

```solidity
address public operator;

modifier onlyOperator() { require(msg.sender == operator, "not operator"); _; }

function createMarket(string memory question) public onlyOperator returns (...) { ... }
```

But CRE won’t be able to call it unless CRE tx sender == operator.

✅ Pros: strict control.
❌ Cons: you lose CRE automation unless you set operator to CRE signer (which brings you back to original issue).

---

## The missing security piece if you pass `requestedBy`

If your HTTP trigger is public-ish, a random person could send:

```json
{ "requestedBy": "vitalikAddress", "question": "..." }
```

and falsely attribute.

So you need one of these validations:

### Validation 1 (best): request must be signed by requestedBy

* User signs a message offchain: `keccak256(question, nonce, chainId, contract)`
* CRE verifies signature
* CRE includes `requestedBy` + signature in report
* Contract verifies signature before storing

### Validation 2 (acceptable): requestedBy is derived from HTTP auth key

Since your trigger has `authorizedKeys`, you can map:

* “this HTTP key” → “this user address”
  and only allow that mapping.

---

## Quick fix for your current system (minimal changes)

Right now, your goal is just: “show my hotwallet as creator”.

You can do this minimal change:

```solidity
address public immutable hotWallet;

constructor(address _hotWallet) { hotWallet = _hotWallet; }

function createMarket(string memory question) public returns (uint256 marketId) {
    marketId = nextMarketId++;
    markets[marketId] = Market({
        creator: hotWallet,   // <- instead of msg.sender
        createdAt: uint48(block.timestamp),
        settledAt: 0,
        settled: false,
        confidence: 0,
        outcome: Prediction.Yes,
        totalYesPool: 0,
        totalNoPool: 0,
        question: question
    });
    emit MarketCreated(marketId, question, hotWallet);
}
```

But note: this makes every market look like it was created by your hotwallet even if it wasn’t.

---

## What I recommend for a prediction market product

Use **Pattern A**:

* `creator = msg.sender` (CRE broadcaster)
* `requestedBy = actual user`
* signature-based attribution

If you paste your `Market` struct + your `writeReport` entry function (the function CRE calls), I’ll give you an exact drop-in Solidity patch + the updated CRE encoding so your attribution is correct and not spoofable.


Nice — this output answers your earlier “why isn’t it my hotwallet?” question *with proof*.

You now have **two different addresses** involved, and each plays a different role:

* `from` = **who paid gas / signed the transaction**
* `to` = **the contract that received the call**
* `market.creator` (stored) = whatever your contract set (in your case `msg.sender` inside `createMarket`)

Let’s decode your tx field-by-field and connect it to your CRE workflow.

---

## 1) What “from” means here

Your tx shows:

```
from  0xbeaA395506D02d20749d8E39ddb996ACe1C85Bfc
```

This is **the EOA that broadcast the transaction and paid gas**.

Where did this come from?

It matches the address you configured in your workflow trigger:

```ts
authorizedKeys: [
  {
    type: "KEY_TYPE_ECDSA_EVM",
    publicKey: "0xbeaA395506D02d20749d8E39ddb996ACe1C85Bfc",
  },
]
```

Important correction:

* That `authorizedKeys` is for **HTTP trigger authorization**
* but you also ended up using the same EVM identity as the **broadcaster** in simulation/broadcast flow

So the broadcast sender is not your deployer/hotwallet; it’s this “workflow identity” key.

That’s exactly why your stored creator didn’t match your hotwallet.

---

## 2) What “to” means here

Your tx shows:

```
to  0x15fC6ae953E024d975e77382eEeC56A9101f9F88
```

This is **not your market contract**.

This is the contract you called onchain — likely one of these:

* an **EVM capability gateway / router**
* a **forwarder / dispatcher**
* a **report receiver / aggregator** that then calls your target receiver

Why do we know it’s a router/forwarder?
Because your transaction `input` starts with a function selector and includes your market address inside the calldata:

```
input 0x11289565 ... 00000000000000000000000062d8...2045c ...
```

That embedded `0x62d8...2045c` is your market contract address.

So the call flow is:

**EOA (0xbeaA...) → router contract (0x15fC...) → your market contract (0x62d8...)**

---

## 3) Why `getMarket(0)` returned creator = `0x15fC...`

Your `getMarket(0)` earlier returned creator:

```
creator = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88
```

Now it makes perfect sense:

Inside your market contract you store:

```solidity
creator: msg.sender
```

When the router (0x15fC...) called into your market contract, **your market contract saw**:

* `msg.sender = 0x15fC...` (the router contract)

So it stored the router as the creator.

This is not a CRE “weird thing” — it’s just Solidity call semantics:

* `msg.sender` is **the immediate caller**, not the original EOA.
* If a contract calls your contract, `msg.sender` becomes that contract.

If you want the original EOA inside a forwarded call, you need:

* `tx.origin` (not recommended)
* or EIP-2771 trusted forwarder pattern
* or pass the original address as data and verify it

---

## 4) What the `input` is telling you (high level)

You don’t need to decode every byte, but here’s what is clearly happening:

* `0x11289565` = function selector of the router’s function (some `writeReport(...)`-style function)
* next fields include:

  * `receiver = 0x62d8...2045c` (your market contract)
  * offsets to dynamic fields (report blobs / signatures)
  * your question string appears in plaintext inside calldata:

    ```
    "Will Argentina win the 2022 World Cup?"
    ```

So: tx is a “report write” into a router, which forwards to your market contract.

---

# ✅ So why isn’t it your deployer/hotwallet?

Because:

1. **Your hotwallet only deployed the contract** (one-time action).
2. **CRE broadcast used another EOA** (`from 0xbeaA...`).
3. The **router contract** (`to 0x15fC...`) forwarded the call to your market contract.
4. Your market contract stores `creator = msg.sender`, which was the **router contract**.

That’s why creator != deployer.

---

# How to make “creator” be the original EOA (0xbeaA...) instead of router

### Option 1 (simple & correct): store `tx.origin` (NOT recommended)

```solidity
creator: tx.origin
```

This would record 0xbeaA... in this case.

**Why not recommended:** `tx.origin` breaks composability and creates security pitfalls (phishing via contract calls).

---

### Option 2 (recommended): add `requestedBy` param and verify

Change createMarket to accept `requestedBy`:

```solidity
function createMarket(address requestedBy, string memory question) public returns (uint256 marketId) {
    marketId = nextMarketId++;
    markets[marketId] = Market({
        creator: requestedBy, // true initiator
        createdAt: uint48(block.timestamp),
        settledAt: 0,
        settled: false,
        confidence: 0,
        outcome: Prediction.Yes,
        totalYesPool: 0,
        totalNoPool: 0,
        question: question
    });
}
```

Then your CRE report payload includes `(requestedBy, question)`.

**But you must verify** `requestedBy` is legitimate (e.g., signature, or only from trusted CRE router/report verification).

---

### Option 3 (best practice): EIP-2771 Trusted Forwarder

If that router is a trusted forwarder, your contract can read the original sender appended to calldata.

This is the standard “meta-tx” pattern:

* `msg.sender` = forwarder
* `_msgSender()` returns the real sender

This requires:

* your forwarder to append sender
* your contract to implement ERC2771Context-style logic

---

# Quick question (no need to overthink)

Do you want the creator to be:

1. **the end user address** (who initiated HTTP request / signed message), or
2. **your hotwallet** (project operator), or
3. **the CRE identity** (router/forwarder)?

If you tell me which, I’ll give you the cleanest Solidity patch **that matches how CRE writes reports** (and avoids `tx.origin`).
