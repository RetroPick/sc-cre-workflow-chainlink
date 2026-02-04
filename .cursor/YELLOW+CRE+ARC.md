
# RetroPick: Full Architecture with CRE Integration

SettlementRequested Event
         │
         ▼
    Log Trigger
         │
         ▼
┌────────────────────┐
│ Step 1: Decode     │
│ Event data         │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ Step 2: EVM Read   │
│ Get market details │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ Step 3: HTTP       │
│ Query Gemini AI    │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ Step 4: EVM Write  │
│ Submit settlement  │
└────────┬───────────┘
         │
         ▼
      Return txHash

## Overview

RetroPick is a decentralized, real-time prediction market that combines gasless state channel betting with stablecoin-backed settlement and trusted outcome resolution. This architecture combines:

* **Yellow Network** for off-chain, gasless sessions
* **Arc** for deterministic USDC-based settlement
* **LI.FI / Circle CCTP** for cross-chain USDC entry
* **Chainlink Functions (CRE)** for secure and flexible event outcome resolution

---

## System Architecture

### 1. **User Flow & Session Initiation**

* **USDC Onboarding:**

  * Users on any EVM chain initiate a deposit using **LI.FI** or **Circle CCTP**.
  * Funds are bridged to **Arc** and deposited into RetroPick's Arc smart contract.

* **Session Start:**

  * User connects wallet to frontend.
  * Yellow SDK initializes a **state channel session** between user and RetroPick app.
  * User's deposit amount is locked on Arc, while trades are tracked off-chain.

### 2. **Off-Chain Betting Engine (Yellow SDK)**

* All trades, odds updates, position changes happen **off-chain** via Yellow's state channel protocol (ERC-7824).
* Messages are signed by users and relayed instantly.
* User balance is updated in real-time without incurring gas costs.
* Example: Alice bets 10 USDC on "Yes" → balance updates reflected off-chain.

### 3. **Market Close & CRE Resolution Trigger**

* When a market ends (e.g. ETH > $2300 at 12:00 UTC), the RetroPick Arc smart contract:

  * Closes the session with Yellow SDK: retrieves final user balances
  * Triggers a **Chainlink Function (CRE)** to fetch the event outcome

* **Chainlink Function:**

  * Calls an external API (e.g. CoinGecko, Coindesk, ESPN, etc.) securely
  * Validates the outcome (e.g. `"yes"`, `price = 2340`, `score = 2-1`)
  * Returns result to RetroPick Arc contract

### 4. **Settlement on Arc**

* Arc contract receives CRE result and determines:

  * Which users predicted correctly
  * Calculates payouts based on final odds and balance
  * Transfers USDC to users via Arc's native stablecoin logic

### 5. **Withdrawals**

* Users can withdraw their USDC:

  * Directly if staying on Arc
  * Via **LI.FI** or **Circle CCTP** to return to their original chain (Ethereum, Polygon, etc.)

---

## Visual Layer Mapping

| Layer                 | Tool                      | Purpose                                             |
| --------------------- | ------------------------- | --------------------------------------------------- |
| Frontend              | React + MetaMask          | Wallet connection, UI, trade flow                   |
| Off-Chain Engine      | Yellow SDK                | Session-based gasless trading                       |
| Smart Contracts       | Arc                       | Secure collateral custody, CRE oracle, payout logic |
| Oracle Resolution     | Chainlink Functions (CRE) | Fetch trusted event outcome from HTTPS APIs         |
| Cross-Chain Liquidity | LI.FI SDK / Circle CCTP   | USDC on-ramp/off-ramp from/to EVM chains            |
| Testing               | Arc Faucet                | Provide testnet USDC to simulate trades             |

---

## Benefits of CRE Layer

* Supports any HTTPS API
* Event-agnostic: works for price, governance, sports, and news-based markets
* Fully auditable oracle call
* Eliminates need for centralized resolution authority

---

## Sample CRE Use Case

**Market**: "Will BTC be above $45,000 on Feb 8, 2026?"

* Market closes: Feb 8, 2026, 12:00 UTC
* CRE fetches: `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd`
* Outcome: BTC = 45,732 → "Yes" side wins
* Smart contract pays out all "Yes" bettors based on locked odds

---

Let me know if you'd like code snippets for the CRE trigger or Yellow session logic next.


# RetroPick Monorepo Architecture (Fullstack, Modular, Chainlink-Enabled)

## Overview

RetroPick is structured as a fullstack monorepo optimized for:

* Modular prediction market development
* Fast iteration on Chainlink Functions (CRE)
* Type-safe React frontend and Foundry-based Solidity backend
* Seamless off-chain/on-chain interactions

---


Re-architecting the CRE Workflow for Yellow Channels and Circle Arc

Figure: Original my-workflow directory layout (Chainlink CRE TypeScript template). The root contains main.ts, Chainlink config.*.json, a sources/ folder for data feeds, and supporting scripts and utils.
In the existing my-workflow (Chainlink CRE) repo, the directory follows the demo template’s pattern[1]. It includes top-level workflow entrypoints (main.ts, callbacks), Chainlink config files (config.staging.json, config.production.json), and folders for data sources (sources/), jobs (jobs/), builders, and utilities. To integrate Yellow state channels and Circle’s Arc/BridgeKit, we propose a refactored structure that clearly separates concerns and adds new modules.
Refactored Directory Structure
We restructure my-workflow to group related functionality. For example:
my-workflow/
├── bun.lobk
├── config.production.json
├── config.staging.json
├── gpt.ts
├── httpCallback.ts
├── logCallback.ts
├── main.ts
├── src/
│   ├── builders/ 
│   │   ├── buildFinalStateRequest.ts      
│   │   ├── generateMarket.ts  
│   │   ├── schemaValidator.ts  
│   ├── chainlink/           # CRE workflow handlers and trigger logic
│   │   ├── triggers.ts      # Cron/log trigger configurations
│   │   └── settlement.ts    # On-chain market settlement logic
│   ├── yellow/              # Yellow Network state-channel integration
│   │   ├── nitroliteClient.ts  # Init Nitrolite SDK client
│   │   ├── auth.ts            # Session key and auth messages
│   │   ├── channel.ts         # Channel open/resize/close logic
│   │   └── wsListener.ts      # WebSocket handlers for Yellow events
│   ├── circle/             # Arc chain and BridgeKit integration
│   │   ├── bridgeKit.ts    # BridgeKit setup and calls
│   │   ├── circleAdapter.ts # Circle wallet adapter setup (Viem/ethers)
│   │   └── arcClient.ts    # Arc chain RPC client (if needed)
│   ├── oracles/            # Prediction outcome or external data oracles
│   │   └── predictionOracle.ts
│   ├── jobs/               # Scheduled tasks (e.g. bridging jobs)
│   │   └── bridgeJob.ts
│   │   ├── marketCreator.ts
│   │   ├── sessionSnapshot.ts    
│   ├── sources/ 
│   │   ├── coinGecko.ts etc based on file
│   ├── utils/              # Shared utilities (e.g. config loaders)
│   └── types/              # TypeScript types/interfaces
├── config/                 # CRE configs
│   ├── project.yaml        # (optional) global CRE settings
│   ├── secrets.yaml        # secret names
│   └── workflow.yaml       # workflow-specific overrides (entrypoints, timeouts)
├── contracts/              # (Optional) ABI or generated bindings
│   └── abi/                # If needed for EVMClient bindings
├── test/                   # Integration/unit tests
├── package.json
├── tsconfig.json
└── README.md
In this layout, Chainlink CRE code (inside src/chainlink/) handles triggers and on-chain writes/reads. The Yellow and Circle integrations are isolated into their own modules for clarity. We retain workflow.yaml to point at src/chainlink/main.ts (the entrypoint), and use config/ for CRE configuration per environment[1].
Integrating Yellow Network (State Channels)
Yellow Network provides off-chain state channels for instant, gas-free transactions. Yellow’s NitroLite protocol lets us lock funds in on-chain custody contracts and then conduct unlimited off-chain transfers[2]. In practice, we would use the @erc7824/nitrolite SDK within yellow/ modules to manage channels. For example, initializing the Nitrolite client (per Yellow Quickstart) looks like:
import { NitroliteClient, WalletStateSigner, createECDSAMessageSigner } from '@erc7824/nitrolite';
import { createPublicClient, createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';
const publicClient = createPublicClient({ chain: sepolia, transport: http(process.env.ALCHEMY_RPC_URL) });
const walletClient = createWalletClient({ chain: sepolia, transport: http(), account });
const client = new NitroliteClient({
  publicClient,
  walletClient,
  stateSigner: new WalletStateSigner(walletClient),
  addresses: {
    custody: '0x...CustodyAddress', 
    adjudicator: '0x...AdjudicatorAddress'
  },
  chainId: sepolia.id,
  challengeDuration: 3600n,
});
const ws = new WebSocket('wss://clearnet-sandbox.yellow.com/ws');
This mirrors Yellow’s sandbox quickstart[3][4]. In our architecture, yellow/nitroliteClient.ts would encapsulate this setup. A separate yellow/auth.ts would generate a session key and perform EIP-712 auth (using createAuthRequestMessage and createAuthVerifyMessageFromChallenge) per Yellow’s protocol[5][6].
Once authenticated, our yellow/channel.ts module can open and fund channels. For example, creating and allocating to a channel (using Nitrolite) might follow the Quickstart pattern:
const createMsg = await createCreateChannelMessage(sessionSigner, { chain_id: 11155111, token: ytestUsdcAddress });
ws.send(createMsg);
// After node replies with channel state and signatures:
await client.createChannel({ channel, unsignedInitialState, serverSignature });
const resizeMsg = await createResizeChannelMessage(sessionSigner, {
  channel_id: channelId,
  allocate_amount: 20n,
  funds_destination: account.address
});
ws.send(resizeMsg);
await client.resizeChannel({ resizeState, proofStates });
With these modules, our CRE workflow handlers can programmatically open channels for a user, deposit funds into Yellow’s unified balance, and later transfer funds within the channel. Yellow’s state channels give “real-time betting with instant settlement”[7]: users can place unlimited off-chain bets with zero gas, then settle the final outcome on-chain (as shown by Re:Bet’s use-case[8][9]). Concretely, our yellow/transfer.ts could implement off-chain bet transfers (e.g. transferring USDC within the channel’s state) and capture channel states for settlement.
Key Yellow concepts we leverage: Yellow’s unified balance across chains[10] and custody contract. For example, any supported chain (including Arc) can deposit USDC into Yellow’s Custody contract, moving funds into the unified off-chain balance[11][12]. (The docs illustrate depositing on Polygon/Base and withdrawing to Arbitrum, which generalizes to Arc: “… deposit tokens into the Custody Contract on any supported chain… and withdraw back through the Custody Contract to any supported chain.”[11].) Our code will use client.allocateAmount or createResizeChannelMessage to move on-chain USDC into Yellow, making it available off-chain. Then, off-chain sessions (managed in yellow/channel.ts) allow high-frequency bets or payments with sub-second finality and no gas[13].
Whenever on-chain settlement is required (market resolution or user exit), our CRE workflow can use Yellow’s client.closeChannel and client.withdrawal to settle the channel on-chain[14]. For example, after betting closes, the final channel state (including all bets) is pushed to the on-chain Yellow “custody” contract, and funds are withdrawn to users’ wallets. The Solidity side would involve a Yellow-compatible consumer contract (e.g. YellowSessionManager.sol in Re:Bet) that handles deposits and enforces outcomes[9].
Circle Arc Chain and BridgeKit (USDC Custody)
Circle’s Arc is an EVM-compatible chain designed for Circle’s own USDC liquidity. We integrate Arc as the on-chain settlement layer for USDC and use Circle’s BridgeKit to move USDC between chains (via CCTP). BridgeKit abstracts Circle’s Cross-Chain Transfer Protocol, which securely burns and mints USDC across chains[15]. For example, the docs describe using BridgeKit to send USDC from an EVM chain like Ethereum Sepolia to Arc Testnet[15].
In practice, our circle/bridgeKit.ts module would initialize BridgeKit and an adapter for the user’s wallet (using @circle-fin/adapter-circle-wallets or a Viem provider). A transfer call looks like:
import { BridgeKit } from "@circle-fin/bridge-kit";
const kit = new BridgeKit();
const result = await kit.bridge({
  from: { adapter: ethAdapter, chain: "Ethereum_Sepolia" },
  to:   { adapter: arcAdapter, chain: "Arc_Testnet" },
  amount: "10.00"
});
This example (transferring 10 USDC from Arc to Solana Devnet) from the Circle tutorial[16] illustrates the general pattern: specify from.chain and to.chain (Arc_Testnet, Solana_Devnet, etc.), and BridgeKit handles approvals, burning on the source, and minting on the destination. We will use bridgeKit.bridge() in scheduled or triggered jobs to ensure USDC moves where needed. For instance, before opening a Yellow session we might bridge a user’s USDC from Ethereum to Arc to deposit into Yellow’s Arc custody (or vice versa on exit). The Circle docs emphasize that BridgeKit “programmatically transfers USDC from an EVM chain (e.g. Ethereum Sepolia) to Arc Testnet” using Circle wallets[15].
Our directory would include an Arc RPC client (in circle/arcClient.ts) configured for Arc’s chain ID (5042002 for testnet[17]) to interact with on-chain contracts (e.g. market contracts on Arc). The circleAdapter.ts sets up a Viem or ethers provider tied to the user’s Circle wallet. BridgeKit relies on “adapters” from these providers. Once a user’s funds are on Arc (via BridgeKit), they can be deposited into Yellow’s Arc custody contract just like any supported chain.
In summary, the Circle/Arc integration does two things: bridge USDC to/from Arc, and execute on-chain settlements on Arc. We will design a bridgeJob.ts that can be run (via a CRE Cron trigger or after certain events) to call kit.bridge(). For example, after a market resolution, we might burn/mint USDC to move all funds back to the original chain. Circle’s docs and guides make clear that BridgeKit abstracts this complexity[15][18].
Chainlink CRE (Triggers and Settlement Layer)
Chainlink CRE remains the orchestration layer that triggers workflows and writes settlements on-chain. The current CRE workflow entrypoint is my-workflow/main.ts (flat template layout), and workflow.yaml points to that file. Chainlink CRE supports multiple trigger types – for example, Cron triggers for periodic jobs and EVM Log triggers for reacting to on-chain events[19][20].
•	Cron Triggers: We can schedule jobs (e.g. deposit or bridging tasks) at fixed intervals. For example, a cron job could check if any Yellow channels need funding or closure, or periodically harvest channel balances.
•	Log Triggers: We can listen for specific smart contract events. For instance, a market contract on Arc might emit a MarketResolved event; the CRE workflow’s log trigger can catch that and invoke settlement logic.
Today, main.ts uses CRE’s handler() to register Cron and Log triggers and forwards to jobs like jobs/scheduleTrigger.ts and logCallback.ts. For example, a Cron trigger drives market creation and Yellow session snapshots, while a Log trigger reacts to SettlementRequested events. In line with the CRE docs, multiple handlers can be registered in one workflow[21]. The workflow.yaml maps main.ts and may configure environment-specific RPCs (e.g. to Arc) via targets.
Within the CRE handlers (onCronTrigger, onLogTrigger), we will call into our Yellow and Circle modules. For instance, onCronTrigger might perform routine tasks (bridge USDC, open/resume sessions), while onLogTrigger (fired by a market’s on-chain event) will fetch final odds or results and then call into yellow/channel.ts to close the channel and distribute funds on Arc. The CRE EVM client (via Viem) will be used to write final settlement transactions to the Arc chain. Thus, CRE remains the spine: it schedules Yellow and Bridge actions and writes outcomes on-chain.
Prediction Market Flow (Yellow + Arc)
Combining these pieces yields a fast, secure prediction market workflow. For example:
1.	Market Creation: A new market is created on the Arc chain (using a consumer contract, e.g. PredictionMarket.sol) with a defined oracle for outcome. The CRE workflow could optionally deploy or initialize this contract, or simply know its address.
2.	Funding (Deposits): Participants deposit USDC into the market. In our design, a user would first bridge or have USDC on Arc, then deposit into the Yellow-integrated market contract (or directly into Yellow’s custody). Because Yellow unifies balances across chains[10], the user can deposit USDC on Arc, and our yellow/resize logic moves it into the unified balance.
3.	Open Yellow Channel: The user and market make a Yellow state channel (via yellow/createChannel as above). This channel is funded by the user’s deposited USDC off-chain. The yellow/wsListener.ts listens for the channel open event and confirms it.
4.	Off-chain Betting: All bets and odds updates occur off-chain in Yellow. Users send USDC payments within the channel to bet on outcomes. These are instant and gasless: “All individual bets happen off-chain via state channels, with only the initial deposit requiring gas”[22]. The yellow/transfer.ts module handles updating channel states and off-chain balances as bets are placed. Since Yellow offers sub-second finality and no on-chain fees[13], users enjoy high-frequency betting.
5.	Outcome Resolution: Once the event concludes, Chainlink (or another oracle) provides the result. CRE might listen for a Chainlink event or query an external API in src/oracles/predictionOracle.ts. The CRE onLogTrigger (or Cron, if periodic) then knows the outcome.
6.	Settle Channel: The workflow calls yellow/closeChannel in yellow/channel.ts, providing the final outcome. This cooperatively closes the channel on-chain (on the Yellow custody contract)[14]. The final state distributes USDC to winners (as per on-chain contract logic).
7.	Withdraw to Arc: After closure, the CRE workflow calls client.withdrawal(...) to withdraw USDC from the Yellow custody back to the user’s on-chain wallet. If needed, BridgeKit can move USDC from Arc to another chain or vice versa at this point.
8.	Final on-chain enforcement: The consumer contract on Arc (the market contract) records the final distribution for full transparency. Because Yellow is ERC-7824 compatible, the on-chain contract can enforce payouts using on-chain logic once the Yellow state is submitted.
Throughout, Chainlink CRE is used only for orchestration (triggers, EVM calls) and does not replace Yellow or Arc. In fact, Yellow provides the fast-payment liquidity layer, and Arc provides the secure custody on-chain. As Re:Bet highlights, this “dual-contract architecture” uses off-chain state channels for betting and on-chain settlement for permanence[9][22].
Integration Components and Job Scheduling
Key modules and jobs in this design include:
•	Yellow WebSocket Listener: In yellow/wsListener.ts, we run a websocket client to the Yellow node. It handles auth challenges and incoming channel events (like channel creation, payments, and close requests). This could run as an always-on task or be triggered by CRE (e.g. an HTTP-triggered function). The listener invokes callbacks (in our workflow) when Yellow sends events.
•	Session Manager: A module to handle Yellow session keys (auth.ts). Each user/app instance uses a temporary session key to sign state channel operations. This module abstracts EIP-712 signing and message creation.
•	Payment Session Logic: A component in yellow/channel.ts or yellow/payments.ts to coordinate multi-party app channels (if betting has multiple parties, not just user-vs-market). It would use Yellow’s App Sessions if needed (Yellow supports multi-party governance in channels[23]).
•	Bridge Job (Cron): A job in jobs/bridgeJob.ts (invoked via Cron trigger) to sweep USDC balances. For instance, once bets close we may need to move any remaining USDC from Arc to Ethereum or vice versa. This calls BridgeKit’s bridge() as shown, using an adapter created by circleAdapter.ts. A scheduled CRE task could also refresh Circle wallets (if needed) or handle BridgeKit status events.
•	Oracle Fetch Job: Although CRE can run HTTP requests directly, a job could fetch external data and write it to an on-chain oracle contract before triggering settlement.
•	Chainlink Triggers: As mentioned, Cron and Log triggers in chainlink/triggers.ts schedule these jobs. For example, a Cron trigger might run the Bridge job every hour, while an EVM Log trigger could start settlement as soon as MarketResolved is emitted by the Arc contract.
•	Config and Secrets: The workflow.yaml will specify necessary RPC URLs and private keys for both the Arc and Ethereum networks (for Yellow on Sepolia and Arc, for example). We’ll use CRE’s secrets.yaml to reference wallet keys (e.g. one key for Yellow on Sepolia, one for Circle wallet on Arc).
Throughout these modules, all off-chain transfers rely on Yellow’s SDK calls and all on-chain writes use Viem/Ethers via CRE (for example, using Viem’s encodeFunctionData to call the market contract and Yellow’s custody contract as needed[21]). By decoupling concerns in our folder layout, each piece (Yellow channel mgmt, Arc bridging, CRE triggers) can be developed and tested independently.
Summary
By refactoring my-workflow into dedicated modules for Yellow and Circle Arc, we create a hybrid architecture: Yellow state channels provide fast, gasless payments, while the Arc chain (via Circle’s USDC) provides secure on-chain settlement. Chainlink CRE remains the orchestration layer with scheduled triggers and oracles. This allows a prediction market to offer “unlimited off-chain bets” with instant settlement[8], yet enforce outcomes on a public ledger. The new directory structure and integration code (shown above) make clear where Yellow’s off-chain sessions link to Arc’s on-chain custody, and where BridgeKit routes USDC across chains. Together, these components enable a high-throughput, cross-chain prediction market: Yellow for high-frequency liquidity, Arc and BridgeKit for cross-chain USDC custody, and Chainlink CRE for final settlement and coordination[7][15].
Sources: Official Yellow docs (Architecture & Quickstart)[2][3], Circle’s BridgeKit/CCTP guides[15][16], Chainlink CRE templates and trigger reference[1][19], and example prediction-market implementation (Re:Bet)[8][22].
________________________________________
[1] [19] [20] [21] Running a Demo Workflow | Chainlink Documentation
https://docs.chain.link/cre/templates/running-demo-workflow-ts
[2] [7] [10] [11] [12] [13] What Yellow Solves | Yellow Network
https://docs.yellow.org/docs/learn/introduction/what-yellow-solves/
[3] [4] [5] [6] [14] Quickstart | Yellow Network
https://docs.yellow.org/docs/learn/getting-started/quickstart/
[8] [9] [22] Re:Bet | ETHGlobal
https://ethglobal.com/showcase/re-bet-6ay2z
[15] Bridge USDC to Arc - Arc Docs
https://docs.arc.network/arc/tutorials/bridge-usdc-to-arc
[16] [17] [18] Crosschain USDC transfers with RainbowKit and Bridge Kit
https://www.circle.com/blog/integrating-rainbowkit-with-bridge-kit-for-crosschain-usdc-transfers
[23] Learn | Yellow Network
https://docs.yellow.org/docs/learn/


# YELLOW PAYMENT APP EXAMPLES TO EXTRACT ITS LOGIC:

Quick Start Guide
Build your first Yellow App in 5 minutes! This guide walks you through creating a simple payment application using state channels.

What You'll Build
A basic payment app where users can:

Deposit funds into a state channel
Send instant payments to another user
Withdraw remaining funds
No blockchain knowledge required - we'll handle the complexity for you!

Prerequisites
Node.js 16+ installed on your computer
A wallet (MetaMask recommended)
Basic JavaScript/TypeScript knowledge
Step 1: Installation
Create a new project and install the Yellow SDK:

npm
yarn
pnpm
mkdir my-yellow-app
cd my-yellow-app
npm init -y
npm install @erc7824/nitrolite


Step 2: Connect to ClearNode
Create a file app.js and connect to the Yellow Network.

Clearnode Endpoints
Production: wss://clearnet.yellow.com/ws
Sandbox: wss://clearnet-sandbox.yellow.com/ws (recommended for testing)
app.js
import { createAppSessionMessage, parseRPCResponse } from '@erc7824/nitrolite';

// Connect to Yellow Network (using sandbox for testing)
const ws = new WebSocket('wss://clearnet-sandbox.yellow.com/ws');

ws.onopen = () => {
  console.log('✅ Connected to Yellow Network!');
};

ws.onmessage = (event) => {
  const message = parseRPCResponse(event.data);
  console.log('📨 Received:', message);
};

ws.onerror = (error) => {
  console.error('Connection error:', error);
};

console.log('Connecting to Yellow Network...');


Step 3: Create Application Session
Set up your wallet for signing messages:

// Set up message signer for your wallet
async function setupMessageSigner() {
  if (!window.ethereum) {
    throw new Error('Please install MetaMask');
  }

  // Request wallet connection
  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts'
  });
  
  const userAddress = accounts[0];
  
  // Create message signer function
  const messageSigner = async (message) => {
    return await window.ethereum.request({
      method: 'personal_sign',
      params: [message, userAddress]
    });
  };

  console.log('✅ Wallet connected:', userAddress);
  return { userAddress, messageSigner };
}


Step 4: Create Application Session
Create a session for your payment app:

async function createPaymentSession(messageSigner, userAddress, partnerAddress) {
  // Define your payment application
  const appDefinition = {
    protocol: 'payment-app-v1',
    participants: [userAddress, partnerAddress],
    weights: [50, 50], // Equal participation
    quorum: 100, // Both participants must agree
    challenge: 0,
    nonce: Date.now()
  };

  // Initial balances (1 USDC = 1,000,000 units with 6 decimals)
  const allocations = [
    { participant: userAddress, asset: 'usdc', amount: '800000' }, // 0.8 USDC
    { participant: partnerAddress, asset: 'usdc', amount: '200000' } // 0.2 USDC
  ];

  // Create signed session message
  const sessionMessage = await createAppSessionMessage(
    messageSigner,
    [{ definition: appDefinition, allocations }]
  );

  // Send to ClearNode
  ws.send(sessionMessage);
  console.log('✅ Payment session created!');
  
  return { appDefinition, allocations };
}


Step 5: Send Instant Payments
async function sendPayment(ws, messageSigner, amount, recipient) {
  // Create payment message
  const paymentData = {
    type: 'payment',
    amount: amount.toString(),
    recipient,
    timestamp: Date.now()
  };

  // Sign the payment
  const signature = await messageSigner(JSON.stringify(paymentData));
  
  const signedPayment = {
    ...paymentData,
    signature,
    sender: await getCurrentUserAddress()
  };

  // Send instantly through ClearNode
  ws.send(JSON.stringify(signedPayment));
  console.log('💸 Payment sent instantly!');
}

// Usage
await sendPayment(ws, messageSigner, 100000n, partnerAddress); // Send 0.1 USDC


Step 6: Handle Incoming Messages
// Enhanced message handling
ws.onmessage = (event) => {
  const message = parseRPCResponse(event.data);
  
  switch (message.type) {
    case 'session_created':
      console.log('✅ Session confirmed:', message.sessionId);
      break;
      
    case 'payment':
      console.log('💰 Payment received:', message.amount);
      // Update your app's UI
      updateBalance(message.amount, message.sender);
      break;
      
    case 'session_message':
      console.log('📨 App message:', message.data);
      handleAppMessage(message);
      break;
      
    case 'error':
      console.error('❌ Error:', message.error);
      break;
  }
};

function updateBalance(amount, sender) {
  console.log(`Received ${amount} from ${sender}`);
  // Update your application state
}

# CIRCLE BRIDGE KIT:
https://developers.circle.com/bridge-kit

Bridge Kit
Bridge Kit

Copy page

The Bridge Kit SDK lets you move USDC across blockchains in only a few lines of code. You can use it in client-side and server-side applications. The SDK provides a type-safe interface that works with Viem and Ethers. You can also extend the kit to support other wallet providers and frameworks.
This example shows how to bridge between an EVM and non-EVM chain in a single method call:
TypeScript
// Transfer 10.00 USDC from Ethereum to Solana
const result = await kit.bridge({
  from: { adapter: viemAdapter, chain: "Ethereum" },
  to: { adapter: solanaAdapter, chain: "Solana" },
  amount: "10.00",
});
​
Quickstart
To start bridging, follow the quickstart guide for the blockchains you plan to transfer between.
Transfer USDC from Arc to Base
Transfer USDC from Ethereum to Solana
Transfer USDC from Arc to Solana with Circle Wallets
​
Key features
Hundreds of bridge routes: Over a couple hundred bridge routes available between dozens of supported blockchains through Circle’s Cross-Chain Transfer Protocol (CCTP).
Simple setup: Start bridging in a few lines of code.
Application monetization: Collect a fee from end-users without writing new code.
Flexible configurations: Specify transfer speeds, custom RPC endpoints, and custom wallet clients.
Multiple supported wallets: Works with Viem, Ethers, and self-custody wallets such as MetaMask and Phantom.
Smart retry capabilities: Identify and recover stuck transactions.
Was this page helpful?

Instalation:

Bridge Kit Installation

Copy page

You install Bridge Kit along with the adapters for each blockchain you plan to transfer between.
EVM only: Install either the Viem or Ethers adapter. You don’t need both.
EVM and Solana: Install the Solana Kit adapter along with either the Viem or Ethers adapter.
If you have a Circle Wallets account, you can also install the Circle Wallets adapter for server-side use only. The Circle Wallets adapter connects to developer-controlled wallets and Circle Contracts. It lets you use your Circle Wallets account to transfer between supported EVM chains and Solana.
​
Viem adapter
Use your preferred package manager to install Bridge Kit with the Viem adapter to transfer between EVM-compatible blockchains.

yarn

npm
yarn add @circle-fin/bridge-kit @circle-fin/adapter-viem-v2 viem
​
Ethers adapter
Use your preferred package manager to install Bridge Kit with the Ethers adapter to transfer between EVM-compatible chains.

yarn

npm
yarn add @circle-fin/bridge-kit @circle-fin/adapter-ethers-v6 ethers
​
Solana adapter
After you install Viem or Ethers, install the Solana Kit adapter to transfer to or from Solana.

yarn

npm
yarn add @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js
If you need compatibility with existing web3.js code, you can use the Solana adapter.
​
Circle Wallets adapter
Use your preferred package manager to install Bridge Kit with the Circle Wallets adapter to transfer between supported EVM chains and Solana.
Note: The Circle Wallets adapter requires an API Key and Entity Secret from the Circle Developer Console. These credentials should never be exposed in the browser. For this reason, the adapter is intended for server-side use only.

yarn

npm
yarn add @circle-fin/bridge-kit @circle-fin/adapter-circle-wallets
Was this page helpful?


Yes

No

Quickstart: Transfer USDC from Arc to Base

Copy page

Learn how to use Bridge Kit to transfer USDC from Arc to Base.

This quickstart helps you write a server-side script that transfers USDC from Arc Testnet to Base Sepolia.
​
Prerequisites
Before you begin, ensure that you’ve:
Installed Node.js v22+ and npm.
Created an Arc Testnet wallet and Base Sepolia wallet. You will fund these wallets in this quickstart.
​
Step 1. Set up the project
This step shows you how to prepare your project and environment.
​
1.1. Set up your development environment
Create a new directory and install Bridge Kit and its dependencies:
Shell
# Set up your directory and initialize a Node.js project
mkdir bridge-kit-quickstart-transfer-arc-to-base
cd bridge-kit-quickstart-transfer-arc-to-base
npm init -y

# Install Bridge Kit and tools
npm install @circle-fin/bridge-kit @circle-fin/adapter-viem-v2 viem typescript tsx
​
1.2. Initialize and configure the project
First, initialize the project. This command creates a tsconfig.json file:
Shell
# Initialize a TypeScript project
npx tsc --init
Then, edit the tsconfig.json file:
Shell
# Replace the contents of the generated file
cat <<'EOF' > tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
EOF
​
1.3. Configure environment variables
Create a .env file in the project directory and add your wallet private key, replacing {YOUR_PRIVATE_KEY} with the private key from your EVM wallet.
Tip: You can find and export your private key in MetaMask.
Shell
echo "PRIVATE_KEY={YOUR_PRIVATE_KEY}" > .env
Warning: This is strictly for testing purposes. Never share your private key.
​
1.4. Fund your wallets (optional)
For this quickstart, you need USDC in your Arc Testnet wallet, and native tokens in your Base Sepolia wallet. If you need USDC testnet tokens, use the Circle Faucet to get 1 USDC in your Arc Testnet wallet. You can use the Superchain Faucet faucet to get native tokens for Base Sepolia.
Tip: Alternatively, you can use the Ethereum Sepolia faucet, then transfer some tokens to Base via SuperBridge.
​
Step 2. Bridge USDC
This step shows you how to set up your script, execute the bridge transfer, and check the result.
​
2.1. Create the script
Create an index.ts file in the project directory and add the following code. This code sets up your script. It transfers 1 USDC from Base Sepolia to Ethereum Sepolia:
TypeScript
// Import Bridge Kit and its dependencies
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

// Initialize the SDK
const kit = new BridgeKit();

const bridgeUSDC = async (): Promise<void> => {
  try {
    // Initialize the adapter which lets you transfer tokens from your wallet on any EVM-compatible chain
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: process.env.PRIVATE_KEY as string,
    });

    console.log("---------------Starting Bridging---------------");

    // Use the same adapter for the source and destination blockchains
    const result = await kit.bridge({
      from: { adapter, chain: "Arc_Testnet" },
      to: { adapter, chain: "Base_Sepolia" },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.log("ERROR", inspect(err, false, null, true));
  }
};

void bridgeUSDC();
Tip: Collect a fee on transfers and estimate gas and provider fees before a transfer, only proceeding if the cost is acceptable.
​
2.2. Run the script
Save the index.ts file and run the script in your terminal:
Shell
npx tsx --env-file=.env index.ts
​
2.3. Verify the transfer
After the script finishes, find the returned steps array in the terminal output. Each transaction step includes an explorerUrl. Use that link to verify that the USDC amount matches the amount you transferred.
The following code is an example of how an approve step might look in the terminal output. The values are used in this example only and are not a real transaction:
Shell
steps: [
  {
    name: "approve",
    state: "success",
    txHash: "0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcd",
    data: {
      txHash:
        "0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcd",
      status: "success",
      cumulativeGasUsed: 17138643n,
      gasUsed: 38617n,
      blockNumber: 8778959n,
      blockHash:
        "0xbeadfacefeed1234567890abcdef1234567890abcdef1234567890abcdef12",
      transactionIndex: 173,
      effectiveGasPrice: 1037232n,
      explorerUrl:
        "https://testnet.arcscan.app/tx/0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcd",
    },
  },
];


Quickstart: Transfer USDC from Ethereum to Solana

Copy page

Learn how to use Bridge Kit to transfer USDC from Ethereum to Solana.

This quickstart helps you write a server-side script that transfers USDC from Ethereum to Solana.
​
Prerequisites
Before you begin, ensure that you’ve:
Installed Node.js v22+ and npm.
Created an Ethereum Sepolia wallet and Solana Devnet wallet. You will fund these wallets in this quickstart.
​
Step 1. Set up the project
This step shows you how to prepare your project and environment.
​
1.1. Set up your development environment
Create a new directory and install Bridge Kit and its dependencies:
Shell
# Set up your directory and initialize the project
mkdir bridge-kit-quickstart-transfer-eth-to-sol
cd bridge-kit-quickstart-transfer-eth-to-sol
npm init -y

# Install Bridge Kit and tools
npm install @circle-fin/bridge-kit @circle-fin/adapter-viem-v2 @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js viem typescript tsx
​
1.2. Initialize and configure the project
First, initialize the project. This command creates a tsconfig.json file:
Shell
# Initialize a TypeScript project
npx tsc --init
Then, edit the tsconfig.json file:
Shell
# Replace the contents of the generated file
cat <<'EOF' > tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
EOF
​
1.3. Configure environment variables
Create an .env file in the project directory and add your wallet private key, replacing {YOUR_PRIVATE_KEY} with the private key for your Ethereum Sepolia wallet and {YOUR_SOLANA_PRIVATE_KEY} with the Base58-encoded private key for your Solana Devnet wallet.
Tip: You can find and export your private keys in MetaMask and Phantom.
Shell
echo "PRIVATE_KEY={YOUR_PRIVATE_KEY}
SOLANA_PRIVATE_KEY={YOUR_SOLANA_PRIVATE_KEY}" > .env
Warning: This is strictly for testing purposes. Never share your private key.
​
1.4. Fund your wallets (optional)
For this quickstart, you need USDC and native tokens in your Ethereum testnet wallet and native tokens in your Solana testnet wallet. If you need USDC testnet tokens, use the Circle Faucet to get 1 USDC on the Ethereum Sepolia and Solana Devnet testnets.
Use the following faucets to get testnet native tokens in your wallets.
Ethereum Sepolia faucet
Solana Devnet faucet
​
Step 2. Bridge USDC
This step shows you how to set up your script, execute the bridge transfer, and check the result.
​
2.1. Create the script
Create an index.ts file in the project directory and add the following code. This code sets up your script and transfers 1 USDC from Ethereum Sepolia to Solana Devnet.
TypeScript
// Import Bridge Kit and dependencies
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaKitAdapterFromPrivateKey } from "@circle-fin/adapter-solana-kit";
import { inspect } from "util";

const kit = new BridgeKit();

const bridgeUSDC = async (): Promise<void> => {
  try {
    // Initialize the Viem adapter which lets you transfer tokens from your wallet on any EVM-compatible chain
    const evmAdapter = createViemAdapterFromPrivateKey({
      privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
    });

    // Initialize the Solana adapter which lets you transfer tokens on Solana
    const solanaAdapter = createSolanaKitAdapterFromPrivateKey({
      privateKey: process.env.SOLANA_PRIVATE_KEY as string,
    });

    console.log("---------------Starting Bridging---------------");

    // Transfer 1 USDC from Ethereum to Solana
    const result = await kit.bridge({
      from: { adapter: viemAdapter, chain: "Ethereum_Sepolia" },
      to: { adapter: solanaAdapter, chain: "Solana_Devnet" },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.log("ERROR", inspect(err, false, null, true));
  }
};

void bridgeUSDC();
To transfer from Solana Devnet to Ethereum Sepolia, swap the from and to contexts in the bridge call.
Tip: Collect a fee on transfers and estimate gas and provider fees before a transfer, only proceeding if the cost is acceptable.
​
2.2. Run the script
Save the index.ts file and run the script in your terminal:
Shell
npx tsx --env-file=.env index.ts
​
2.3. Verify the transfer
After the script finishes, find the returned steps array in the terminal output. Each transaction step includes an explorerUrl. Use that link to verify that the USDC amount matches the amount you transferred.
The following code is an example of how an approve step might look in the terminal output. The values are used in this example only and are not a real transaction:
Shell
steps: [
  {
    name: "approve",
    state: "success",
    txHash: "0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcd",
    data: {
      txHash:
        "0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcd",
      status: "success",
      cumulativeGasUsed: 17138643n,
      gasUsed: 38617n,
      blockNumber: 8778959n,
      blockHash:
        "0xbeadfacefeed1234567890abcdef1234567890abcdef1234567890abcdef12",
      transactionIndex: 173,
      effectiveGasPrice: 1037232n,
    explorerUrl:
      "https://sepolia.etherscan.io/tx/0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcd",
  },
];


Quickstart: Transfer USDC from Arc to Solana with Circle Wallets

Copy page

Learn how to use Bridge Kit with the Circle Wallets adapter to transfer USDC from Arc to Solana.

This quickstart helps you write a server-side script that transfers USDC from Arc to Solana using the Circle Wallets adapter.
​
Prerequisites
Before you begin, ensure that you’ve:
Installed Node.js v22+ and npm.
Obtained a Circle API Key and Entity Secret from the Circle Developer Console.
Created an Arc Testnet wallet and Solana Devnet wallet. You will fund these wallets in this quickstart.
​
Step 1. Set up the project
This step shows you how to prepare your project and environment.
​
1.1. Set up your development environment
Create a new directory and install Bridge Kit with the Circle Wallets adapter and supporting tools:
Shell
# Set up your directory and initialize the project
mkdir bridge-kit-quickstart-transfer-arc-to-sol-with-circle-wallets
cd bridge-kit-quickstart-transfer-arc-to-sol-with-circle-wallets
npm init -y

# Install Bridge Kit, Circle Wallets adapter, and tools
npm install @circle-fin/bridge-kit @circle-fin/adapter-circle-wallets typescript tsx dotenv
​
1.2. Initialize and configure the project
First, initialize the project. This command creates a tsconfig.json file:
Shell
# Initialize a TypeScript project
npx tsc --init
Then, edit the tsconfig.json file:
Shell
# Replace the contents of the generated file
cat <<'EOF' > tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
EOF
​
1.3. Configure environment variables
Create a .env file in the project directory with your Circle credentials and wallet addresses, replacing these placeholders with your value:
CIRCLE_API_KEY: your API key should be either environment-prefixed (for example, TEST_API_KEY:abc123:def456 or LIVE_API_KEY:xyz:uvw) or base64-encoded strings.
YOUR_ENTITY_SECRET: your entity secret should be 64 lowercase alphanumeric characters.
YOUR_EVM_WALLET_ADDRESS and YOUR_SOLANA_WALLET_ADDRESS are the wallet addresses you control through Circle Wallets. You can fetch the addresses from the Circle Developer Console or the list wallets endpoint.
Shell
echo "CIRCLE_API_KEY={YOUR_API_KEY}
CIRCLE_ENTITY_SECRET={YOUR_ENTITY_SECRET}
EVM_WALLET_ADDRESS={YOUR_EVM_WALLET_ADDRESS}
SOLANA_WALLET_ADDRESS={YOUR_SOLANA_WALLET_ADDRESS}" > .env
Warning: This is strictly for testing purposes. Always protect your API key and entity secret.
​
1.4. Fund your wallets (optional)
For this quickstart, you need USDC in your Arc Testnet wallet and native tokens in your Solana testnet wallet. If you need USDC testnet tokens, use the Circle Faucet to get 1 USDC on the Arc Testnet and Solana Devnet testnets. If you need testnet native tokens, use the Circle Console Faucet. For more information about the faucets, see Testnet Faucets.
​
Step 2. Bridge USDC
This step shows you how to set up your script, execute the bridge transfer, and check the result.
​
2.1. Create the script
Create an index.ts file in the project directory and add the following code. This code sets up your script and transfers 1 USDC from Arc Testnet to Solana Devnet.
Typescript
// Import Bridge Kit and the Circle Wallets adapter
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

// Initialize the SDK
const kit = new BridgeKit();

const bridgeUSDC = async (): Promise<void> => {
  try {
    // Set up the Circle Wallets adapter instance, works for both ecosystems
    const adapter = createCircleWalletsAdapter({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
    });

    console.log("---------------Starting Bridging---------------");

    // Use the same adapter for the source and destination blockchains
    const result = await kit.bridge({
      from: {
        adapter,
        chain: "Arc_Testnet",
        address: process.env.EVM_WALLET_ADDRESS!, // EVM address (developer-controlled)
      },
      to: {
        adapter, // Use the same adapter instance
        chain: "Solana_Devnet",
        address: process.env.SOLANA_WALLET_ADDRESS!, // Solana address (developer-controlled)
      },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.log("ERROR", inspect(err, false, null, true));
  }
};

void bridgeUSDC();
To transfer from Solana Devnet to Arc Testnet, swap the from and to contexts in the bridge call.
Tip: Collect a fee on transfers and estimate gas and provider fees before a transfer, only proceeding if the cost is acceptable.
​
2.2. Run the script
Save the index.ts file and run the script in your terminal:
npx tsx --env-file=.env index.ts
​
2.3. Verify the transfer
After the script finishes, find the returned steps array in the terminal output. Each transaction step includes an explorerUrl. Use that link to verify that the USDC amount matches the amount you transferred.
The following code is an example of how an approve step might look in the terminal output. The values are used in this example only and are not a real transaction:
Shell
steps: [
  {
    name: "approve",
    state: "success",
    txHash: "0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcd",
    data: {
      txHash:
        "0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcd",
      status: "success",
      cumulativeGasUsed: 17138643n,
      gasUsed: 38617n,
      blockNumber: 8778959n,
      blockHash:
        "0xbeadfacefeed1234567890abcdef1234567890abcdef1234567890abcdef12",
      transactionIndex: 173,
      effectiveGasPrice: 1037232n,
    explorerUrl:
      "https://testnet.arcscan.app/tx/0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcd",
  },
];

Adapter Setups

Copy page

Bridge Kit supports these adapter types:
Chain client adapters abstract away the complexity of different blockchain architectures. Each adapter manages blockchain-specific bridging operations.
The Circle Wallet adapter is available if you already use Circle’s developer-controlled wallets. It uses your Circle Wallets account to let you transfer between supported blockchains.
​
Chain client adapter setups
Bridge Kit works with these client adapter libraries:
viem v2 for EVM-compatible blockchains
ethers v6 for EVM-compatible blockchains
solana for the Solana blockchain
You only need to set up with one EVM adapter, either Viem or Ethers. Add the Solana adapter to your setup only if you plan to transfer to or from Solana.
The following table shows ways to set up chain client adapters and when to use each setup.
Setup method	Description	Use case
Standard	Standard setup that creates an adapter from a private wallet key. Uses default built-in public RPC endpoints and factory functions.	Testing environments that need a quick start without custom RPC configuration.
Custom RPC	Private key setup that lets you configure an RPC endpoint.	Production deployments that require reliable RPC providers.
Browser wallet	Uses an injected wallet provider, such as MetaMask or Phantom, to create an adapter in the browser.	Browser-based apps that rely on user wallet providers.
​
Standard setup
This setup is the fastest way to start. Create one adapter from your wallet private key to transfer tokens between EVM-compatible blockchains. Add the Solana adapter to transfer tokens to or from Solana.
This setup uses public RPC endpoints and factory functions. For production, you should configure a custom RPC. Public connections have rate limits and might be slow.
Select the tab to see code examples for your adapter choice.
Viem
Ethers
Solana
This code block initializes the Viem adapter to transfer tokens between EVM-compatible chains:
TypeScript
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

const adapter = createViemAdapterFromPrivateKey({
  privateKey: process.env.PRIVATE_KEY as string,
});
​
Custom RPC
You can replace the public RPC from the standard setup with your own connection. For production, you should use a paid service like Alchemy or QuickNode. These services are more reliable than free connections.
The following code shows how to set up your own RPC. Pick your adapter to see the code.
Viem
Ethers
Solana
To use your own connection, replace the default one and add your custom RPC endpoints. Map each chain to its RPC endpoint so one adapter can work across multiple chains. This example uses Alchemy connections:
TypeScript
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { EthereumSepolia, ArcTestnet } from "@circle-fin/bridge-kit/chains";
import { createPublicClient, http } from "viem";

// Map RPC endpoints by chain name
const RPC_BY_CHAIN_NAME: Record<string, string> = {
  [EthereumSepolia.name]: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
  [ArcTestnet.name]: `https://arc-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
};

// Create an adapter
const adapter = createViemAdapterFromPrivateKey({
  privateKey: process.env.PRIVATE_KEY as string,
  // Replace the default connection
  getPublicClient: ({ chain }) => {
    const rpcUrl = RPC_BY_CHAIN_NAME[chain.name];
    if (!rpcUrl) {
      throw new Error(`No RPC configured for chain: ${chain.name}`);
    }
    return createPublicClient({
      chain,
      transport: http(rpcUrl, {
        retryCount: 3,
        timeout: 10000,
      }),
    });
  },
});
​
Browser wallet
You can create an adapter from browser wallet apps like MetaMask or Phantom.
The following code creates an adapter from a browser wallet. Pick your adapter to see the code.
Viem
Ethers
Solana
TypeScript
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { EIP1193Provider } from "viem";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

// Check if wallet provider is available
if (!window.ethereum) {
  throw new Error("No wallet provider found");
}

const adapter = await createViemAdapterFromProvider({
  provider: window.ethereum,
});
​
Circle Wallets adapter setup
Note: This adapter is for server-side applications only. It requires private keys and entity secrets that must never be exposed to browsers.
You can use the Circle Wallets adapter if you already manage wallets through Circle. Suited for enterprise and backend applications, it uses Circle’s developer-controlled wallets and Circle Contracts so you can transfer between supported blockchains without managing private keys yourself.
The Circle Wallets adapter requires a Circle API Key and Entity Secret obtained from the Circle Developer Console.
API Key format:
Environment-prefixed: TEST_API_KEY:abc123:def456 or LIVE_API_KEY:xyz:uvw
Base64 encoded: standard Base64 string
Entity Secret format:
64 lowercase alphanumeric characters
This code block initializes the Circle Wallets adapter:
Typescript
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

// Initialize adapter with Circle credentials (server-side only)
const adapter = createCircleWalletsAdapter({
  apiKey: process.env.CIRCLE_API_KEY!, // Format: TEST_API_KEY:abc:def or Base64
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!, // Format: 64 lowercase alphanumeric chars
});


# LI.FI TO SUPPORT ARC 
https://docs.li.fi/introduction/user-flows-and-examples/end-to-end-example

User Flows and Examples
End-to-end Transaction Example

Copy page

​
Step by step
1
Requesting a quote or routes


TypeScript
const getQuote = async (fromChain, toChain, fromToken, toToken, fromAmount, fromAddress) => {
    const result = await axios.get('https://li.quest/v1/quote', {
        params: {
            fromChain,
            toChain,
            fromToken,
            toToken,
            fromAmount,
            fromAddress,
        }
    });
    return result.data;
}

const fromChain = 42161;
const fromToken = 'USDC';
const toChain = 100;
const toToken = 'USDC';
const fromAmount = '1000000';
const fromAddress = YOUR_WALLET_ADDRESS;

const quote = await getQuote(fromChain, toChain, fromToken, toToken, fromAmount, fromAddress);
2
Choose the desired route if `/advanced/routes` was used and retrieve transaction data from `/advanced/stepTransaction`

This step is only needed if /advanced/routes endpoint was used. /quote already returns the transaction data within the response. Difference between /quote and /advanced/routes is described here
3
Setting the allowance

Before any transaction can be sent, it must be made sure that the user is allowed to send the requested amount from the wallet.

TypeScript
const { Contract } = require('ethers');

const ERC20_ABI = [
    {
        "name": "approve",
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "name": "allowance",
        "inputs": [
            {
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            }
        ],
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

// Get the current allowance and update it if needed
const checkAndSetAllowance = async (wallet, tokenAddress, approvalAddress, amount) => {
    // Transactions with the native token don't need approval
    if (tokenAddress === ethers.constants.AddressZero) {
        return
    }

    const erc20 = new Contract(tokenAddress, ERC20_ABI, wallet);
    const allowance = await erc20.allowance(await wallet.getAddress(), approvalAddress);

    if (allowance.lt(amount)) {
        const approveTx = await erc20.approve(approvalAddress, amount);
        await approveTx.wait();
    }
}

await checkAndSetAllowance(wallet, quote.action.fromToken.address, quote.estimate.approvalAddress, fromAmount);
4
Sending the transaction

After receiving a quote, the transaction has to be sent to trigger the transfer.
Firstly, the wallet has to be configured. The following example connects your wallet to the Gnosis Chain.

TypeScript
const provider = new ethers.providers.JsonRpcProvider('https://rpc.xdaichain.com/', 100);
const wallet = ethers.Wallet.fromMnemonic(YOUR_PERSONAL_MNEMONIC).connect(
    provider
);
Afterward, the transaction can be sent using the transactionRequest inside the previously retrieved quote:

TypeScript
const tx = await wallet.sendTransaction(quote.transactionRequest);
await tx.wait();
5
Executing second step if applicable

If two-step route was used, the second step has to be executed after the first step is complete. Fetch the status of the first step like described in next step and then request transactionData from the /advanced/stepTransaction endpoint.
6
Fetching the transfer status

To check if the token was successfully sent to the receiving chain, the /status endpoint can be called:

TypeScript
const getStatus = async (bridge, fromChain, toChain, txHash) => {
    const result = await axios.get('https://li.quest/v1/status', {
        params: {
            bridge,
            fromChain,
            toChain,
            txHash,
        }
    });
    return result.data;
}

result = await getStatus(quote.tool, fromChain, toChain, tx.hash);
​
Full example

TypeScript
const ethers = require('ethers');
const axios = require('axios');

const API_URL = 'https://li.quest/v1';

// Get a quote for your desired transfer
const getQuote = async (fromChain, toChain, fromToken, toToken, fromAmount, fromAddress) => {
    const result = await axios.get(`${API_URL}/quote`, {
        params: {
            fromChain,
            toChain,
            fromToken,
            toToken,
            fromAmount,
            fromAddress,
        }
    });
    return result.data;
}

// Check the status of your transfer
const getStatus = async (bridge, fromChain, toChain, txHash) => {
    const result = await axios.get(`${API_URL}/status`, {
        params: {
            bridge,
            fromChain,
            toChain,
            txHash,
        }
    });
    return result.data;
}

const fromChain = 42161;
const fromToken = 'USDC';
const toChain = 100;
const toToken = 'USDC';
const fromAmount = '1000000';
const fromAddress = YOUR_WALLET_ADDRESS;

// Set up your wallet
const provider = new ethers.providers.JsonRpcProvider('https://rpc.xdaichain.com/', 100);
const wallet = ethers.Wallet.fromMnemonic(YOUR_PERSONAL_MNEMONIC).connect(
    provider
);

const run = async () => {
    const quote = await getQuote(fromChain, toChain, fromToken, toToken, fromAmount, fromAddress);
    const tx = await wallet.sendTransaction(quote.transactionRequest);

    await tx.wait();

    // Only needed for cross chain transfers
    if (fromChain !== toChain) {
        let result;
        do {
            result = await getStatus(quote.tool, fromChain, toChain, tx.hash);
        } while (result.status !== 'DONE' && result.status !== 'FAILED')
    }
}

run().then(() => {
    console.log('DONE!')
});

User Flows and Examples
Fetching a Quote/Route

Copy page

Guide to make a quote and route request

​
Using SDK
import { getRoutes } from '@lifi/sdk';

const routesRequest: RoutesRequest = {
  fromChainId: 42161, // Arbitrum
  toChainId: 10, // Optimism
  fromTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
  toTokenAddress: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', // DAI on Optimism
  fromAmount: '10000000', // 10 USDC
};

const result = await getRoutes(routesRequest);
const routes = result.routes;
When you make a route request, you receive an array of route objects containing the essential information to determine which route to take for a swap or bridging transfer. At this stage, transaction data is not included and must be requested separately.
Additionally, if you would like to receive just one best option that our smart routing API can offer, it might be better to request a quote using getQuote.
​
Using API
To generate a quote based on the amount you are sending, use the /quote endpoint. This method is useful when you know the exact amount you want to send and need to calculate how much the recipient will receive.
const getQuote = async (fromChain, toChain, fromToken, toToken, fromAmount, fromAddress) => {
    const result = await axios.get('https://li.quest/v1/quote', {
        params: {
            fromChain,
            toChain,
            fromToken,
            toToken,
            fromAmount,
            fromAddress,
        }
    });
    return result.data;
}

const fromChain = 42161;
const fromToken = 'USDC';
const toChain = 10;
const toToken = 'USDC';
const fromAmount = '1000000';
const fromAddress = YOUR_WALLET_ADDRESS;

const quote = await getQuote(fromChain, toChain, fromToken, toToken, fromAmount, 

Quote vs Route

Copy page

Difference between /quote and /advanced/routes

​
/quote
/quote endpoint returns the best single-step route only. So only one route is returned and it includes transaction data that is needed to be sent onchain to execute the route.
​
/advanced/routes
The /advanced/routes endpoint allows more complex routes, in which the user needs to bridge funds first and then needs to trigger a second transaction on the destination chain to swap into the desired asset.
After retrieving the routes, the tx data needs to be generated and retrieved using the /stepTransaction endpoint. This endpoint expects a full Step object which usually is retrieved by calling the /advanced/routes endpoint and selecting the most suitable Route.
/stepTransaction endpoint need to be called to retrieve transaction data for every Step. Internally both endpoints use the same routing algorithm, but with the described different settings.

Solana Transaction Example

Copy page

​
Requesting Solana specific information via the API
​
Chains
curl --request GET \
     --url 'https://li.quest/v1/chains?chainTypes=SVM' \
     --header 'accept: application/json'
​
Tokens
curl --request GET \
     --url 'https://li.quest/v1/tokens?chains=SOL&chainTypes=SVM' \
     --header 'accept: application/json'
​
Token details
curl --request GET \
     --url 'https://li.quest/v1/token?chain=SOL&token=BONK' \
     --header 'accept: application/json' 
​
Requesting a Quote or Routes

/quote

/advanced/routes
curl --request GET \
     --url 'https://li.quest/v1/quote?fromChain=ARB&toChain=SOL&fromToken=0xaf88d065e77c8cC2239327C5EDb3A432268e5831&toToken=7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs&fromAddress=YOUR_EVM_WALLET&toAddress=YOUR_SOL_WALLET&fromAmount=1000000000' \
     --header 'accept: application/json'
​
Response
The key difference between EVM -> SOL and SOL -> EVM transfers is the structure of the transactionRequest. For SOL -> EVM transfers, it contains only a data parameter, which represents base64 encoded Solana transaction data:
"transactionRequest": {
    "data": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAsUBmw6CY1QcV7385AuJb6tDdM71YrLbjDGeWn6/zWFZAEcjcsOlIINY3LYFWBe38OO1l26BSpzB1L1bYnVNorsXkDqoJZ5Mb5PNE07yLa8RJGvFV55ILi1+vklkapJoW1yUKv7UyXP9sO3ptc4QOktFqSHRb9AYoDxZXcodBKfc4vN6ai03uOqBMXcmI4cih1E71LnDKMQljw0rqlnVVKOn98YHXWKE3PmeT4MetR4/Ep7+sfN+1vkcpHlwGeEHZgK4EIcmnLsIpOTZxLFhBBVIsDwUJkuCB/B43O01pI8fuLzyjGxJMo5db7lPEcx8Ns2BJ8kYOoL0ob3fnQ0eN3JwPzibblpkKkSjSk1qpqwB4d5rSn1PrbBHf6rOIO/O/W6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABceQrkgrAQHdCyf7CIDjBD/Y4pzKA7iTYhaafiX1eik37c9HIG4v1EeQo1ENAm3KHS+LCOKkZ4WQntGZQgIyu7ixIazui3zX0pmHiw3K3u/XdzSJfZ+ugLzVfJnnOn3v2RmLUngAdF+k4G2bOshpHaEkSZUr1Y1/vT3G9R/qU8zKFLzTYC6vfOspR18AlAfdoQQSzchbXIKs9TVzmL7XEYAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYceCg/3UzgsruALUdoCSm3XiyBz8VtBPnGEIhrYpcBQ26zvkSidWkhDjuJPqY+9JDKulE8Bq2dVUioc+URRKUUsG3fbh12Whk9nL4UbO63msHLSF7V9bN5E6jPWFfv8AqTLHwyN3CxGdzcZNzliJWl0TJu3X7nF6oB9sysdDGG/6Ag8ABQJAQg8ADhMAAAcQBAMMAQgRAgYLDRIFChMJccw/qau6fVaf/aDz3hWN+Sh9oNuBvkrLv0ttxmLuxpa1pXsmnZ0BxMAAAAAAAAAAAAAAAABVIAjA9ocML3flzB0uub3/A+MOoAUAAAAAAAAAAAAAAAAnkbyh8t5GYe2IowyZp6lEmqhBdOkDAAAAAAAA"
}

Transaction Status Tracking

Copy page

Complete guide to checking cross-chain transaction statuses using the LI.FI API

​
Transaction Status
This guide explains how to check the status of cross-chain and swap transactions using the /status endpoint provided by LI.FI.
​
Querying the Status Endpoint
To fetch the status of a transfer, the /status endpoint can be queried with:
sending transaction hash
receiving transaction hash
transactionId
Only one of the above values are required and need to be passed in txHash param.
​
Required:
txHash
​
Optional:
fromChain: Speeds up the request (recommended)
toChain
bridge
For swap transactions, set fromChain and toChain to the same value. The bridge parameter can be omitted.
const getStatus = async (txHash: string) => {
  const result = await axios.get('https://li.quest/v1/status', {
    params: { txHash },
  });
  return result.data;
};
​
Sample Response
{
  "transactionId": "0x0959ee0fbb37a868752d7ae40b25dbfa3b7d72f499fa8386fd5f4105b18b62bd",
  "sending": {
    "txHash": "0x5862726dbc6643c6a34b3496bb15e91f11771f6756ccf83826304846bbc93c0v",
    "txLink": "https://etherscan.io/tx/0x5862726dbc6643c6a34b3496bb15e91f11771f6756ccf83826304846bbc93c0v",
    "amount": "60000000000000000000000",
    "token": {
      "symbol": "ORDS",
      "priceUSD": "0.012027801612559667"
    },
    "gasPrice": "23079962248",
    "gasUsed": "231727",
    "gasAmountUSD": "14.0296",
    "amountUSD": "721.6681",
    "includedSteps": [
      {
        "tool": "feeCollection",
        "fromAmount": "60000000000000000000000",
        "toAmount": "59820000000000000000000"
      },
      {
        "tool": "1inch",
        "fromAmount": "59820000000000000000000",
        "toAmount": "275101169247651913"
      }
    ]
  },
  "receiving": {
    "txHash": "0x2862726dbc6643c6a34b3496bb15e91f11771f6756ccf83826604846bbc93c0v",
    "amount": "275101169247651913",
    "token": {
      "symbol": "ETH",
      "priceUSD": "2623.22"
    },
    "gasAmountUSD": "14.0296",
    "amountUSD": "721.6509"
  },
  "lifiExplorerLink": "https://scan.li.fi/tx/0x5862726dbc6643c6a34b3496bb15e91f11771f6756ccf83826304846bbc93c0v",
  "fromAddress": "0x14a980237fa9797fa27c5152c496cab65e36da4f",
  "toAddress": "0x14a980237fa9797fa27c5152c496cab65e36da4f",
  "tool": "1inch",
  "status": "DONE",
  "substatus": "COMPLETED",
  "substatusMessage": "The transfer is complete.",
  "metadata": {
    "integrator": "example_integrator"
  }
}
​
Status Values
Status	Description
NOT_FOUND	Transaction doesn’t exist or not yet mined.
INVALID	Hash is not tied to the requested tool.
PENDING	Bridging is still in progress.
DONE	Transaction completed successfully.
FAILED	Bridging process failed.
​
Substatus Definitions
​
PENDING
WAIT_SOURCE_CONFIRMATIONS: Waiting for source chain confirmations
WAIT_DESTINATION_TRANSACTION: Waiting for destination transaction
BRIDGE_NOT_AVAILABLE: Bridge API is unavailable
CHAIN_NOT_AVAILABLE: Source/destination chain RPC unavailable
REFUND_IN_PROGRESS: Refund in progress (if supported)
UNKNOWN_ERROR: Status is indeterminate
​
DONE
COMPLETED: Transfer was successful
PARTIAL: Only partial transfer completed (common for across, hop, stargate, amarok)
REFUNDED: Tokens were refunded
​
FAILED
NOT_PROCESSABLE_REFUND_NEEDED: Cannot complete, refund needed
OUT_OF_GAS: Transaction ran out of gas
SLIPPAGE_EXCEEDED: Received amount too low
INSUFFICIENT_ALLOWANCE: Not enough allowance
INSUFFICIENT_BALANCE: Not enough balance
EXPIRED: Transaction expired
UNKNOWN_ERROR: Unknown or invalid state
REFUNDED: Tokens were refunded