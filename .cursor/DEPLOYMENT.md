create src/PredictionMarket.sol:PredictionMarket \
  --rpc-url "https://ethereum-sepolia-rpc.publicnode.com" \
  --private-key $CRE_ETH_PRIVATE_KEY \
  --broadcast \
  --constructor-args 0x15fc6ae953e024d975e77382eeec56a9101f9f88

[⠊] Compiling...
No files changed, compilation skipped
Deployer: 0xbeaA395506D02d20749d8E39ddb996ACe1C85Bfc
Deployed to: 0x62d8D11bD63eEDA81715d19332DFC6e50782045c
Transaction hash: 0x64b775c5fdca1a7c824278a34b6c5992c4ccab35f558a6f224f18f656f67876f

asyam321@LAPTOP-IBEUNTHH:~/Project/RetroPick/RetroPick$ cast call $MARKET_ADDRESS \
"getMarket(uint256) returns ((address,uint48,uint48,bool,uint16,uint8,uint256,uint256,string))" \
0 \
--rpc-url https://1rpc.io/sepolia
(0x15fC6ae953E024d975e77382eEeC56A9101f9F88, 1769937120 [1.769e9], 0, false, 0, 0, 0, 0, "Will Argentina win the 2022 World Cup?")
asyam321@LAPTOP-IBEUNTHH:~/Project/RetroPick/RetroPick$