import { createPublicClient, http } from 'viem';
import { avalancheFuji } from 'viem/chains';
import fs from 'node:fs';

const DraftClaimAbi = JSON.parse(fs.readFileSync('./apps/front-end-v2/src/contracts/abi/DraftClaimManager.json', 'utf8'));

const client = createPublicClient({ chain: avalancheFuji, transport: http('https://api.avax-test.network/ext/bc/C/rpc', {timeout: 20000}) });
const DCM = '0x0b7B98b10b2067a4918720Bc04f374c669B313d5';

const args = [
 '0xef68de92acb8eeb01b88763a1cd9a3d1bd9a4a8dc9d591d0d5f59abe5ff5a028',
 '0x61c8d94ab8a729126a9fa41751fad7f464604948',
 1000000000n,
 0n,
 '0x'
];

try {
  await client.simulateContract({
    account: '0x38A8AB6EE17EB531d86eb877e56005587bC078e7',
    address: DCM,
    abi: DraftClaimAbi,
    functionName: 'claimAndSeed',
    args,
  });
  console.log('simulate ok');
} catch (e) {
  console.log('short:', e.shortMessage || e.message || String(e));
  if (e.cause) {
    console.log('cause-short:', e.cause.shortMessage || e.cause.message || String(e.cause));
    console.log('cause-data:', e.cause.data || '');
  }
}
