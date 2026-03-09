import { createPublicClient, http } from 'viem';
import { avalancheFuji } from 'viem/chains';
import fs from 'node:fs';

const DraftBoardAbi = JSON.parse(fs.readFileSync('./apps/front-end-v2/src/contracts/abi/MarketDraftBoard.json', 'utf8'));
const DraftClaimAbi = JSON.parse(fs.readFileSync('./apps/front-end-v2/src/contracts/abi/DraftClaimManager.json', 'utf8'));

const client = createPublicClient({ chain: avalancheFuji, transport: http('https://api.avax-test.network/ext/bc/C/rpc', {timeout: 20000}) });
const draftId = '0xef68de92acb8eeb01b88763a1cd9a3d1bd9a4a8dc9d591d0d5f59abe5ff5a028';
const DRAFT_BOARD = '0x8a81759d0A4383E4879b0Ff298Bf60ff24be8302';
const DCM = '0x0b7B98b10b2067a4918720Bc04f374c669B313d5';

const [status, draft, claimer, claim, factory] = await Promise.all([
  client.readContract({address: DRAFT_BOARD, abi: DraftBoardAbi, functionName:'getStatus', args:[draftId]}),
  client.readContract({address: DRAFT_BOARD, abi: DraftBoardAbi, functionName:'getDraft', args:[draftId]}),
  client.readContract({address: DCM, abi: DraftClaimAbi, functionName:'getClaimer', args:[draftId]}),
  client.readContract({address: DCM, abi: DraftClaimAbi, functionName:'getClaim', args:[draftId]}),
  client.readContract({address: DCM, abi: DraftClaimAbi, functionName:'liquidityVaultFactory'}),
]);

console.log(JSON.stringify({status:Number(status), draft, claimer, claim, factory}, null, 2));
