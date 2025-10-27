### 正确部署及测试

 ```te
npx hardhat run test/sepolia/sepolia-deployment.test.ts --network sepolia
 ```

🚀 开始部署 DeFi Aggregator 到 Sepolia 测试网...

📍 部署账户: 0x197131c5e0400602fFe47009D38d12f815411149
💰 账户余额: 0.129682970341963426 ETH

📦 步骤 1: 部署 Mock 合约...

  - 部署 USDC...
    ✅ USDC: 0x9D44A22bFA40EeEE7603339048EC069AA9C901EA
  - 部署 DAI...
    ✅ DAI: 0xeC9d7c84154b96a7AfCAE7c50EC38B4C87E85b7E
  - 部署 USDT...
    ✅ USDT: 0x6A9F823CB0D162dFe936a102F410a5e9E10CD714
  - 部署 MockUniswapRouter...
    ✅ MockRouter: 0x5C76bDCcfafCD7f0Ea52850A07F0F882D47a5Ca9
  - 部署 MockAavePool...
    ✅ MockAavePool: 0xDb8a47c65D092D65Ee5566EC3942f0B622744593
  - 部署 MockAToken...
    ✅ MockAToken: 0x785eae047b1D853d6034E8CACb268b92cDeea945
  - 部署 ChainlinkPriceOracle...
    ✅ PriceOracle: 0xe1189E10c4AfCc5201071C2D7D10002cde312724

✅ Mock 合约部署完成!

📦 步骤 2: 部署核心合约...

  - 部署 VaultFactory...
    ✅ VaultFactory: 0x1592EAb5B17085958bFB5cfC487480a9633a44e3
  - 部署 StrategyManager (Upgradeable)...
    ✅ StrategyManager: 0x4A9eA8a66410Bb95f09C2E0809Fb29Ff02c61A72

✅ 核心合约部署完成!

📦 步骤 3: 创建测试 Vault...

  - 通过 VaultFactory 创建 USDC Vault...
    ✅ USDC Vault: 0xA57895b71Fc239bc03F1a45a72db159348031737

✅ Vault 创建完成!

📦 步骤 4: 部署策略合约 (Upgradeable)...

  - 部署 AaveStrategy...
    ⚠️ AaveStrategy 部署失败，跳过: Contract `contracts/strategies/AaveStrategy.sol:AaveStrategy` is not upgrade safe

contracts\strategies\BaseStrategy.sol:17: Variable `performanceFee` is assigned an initial value
    Move the assignment to the initializer
    https://zpl.in/upgrades/error-004

  - 部署 CompoundStrategy...
    ⚠️ CompoundStrategy 部署失败，跳过: Contract `contracts/strategies/CompoundStrategy.sol:CompoundStrategy` is not upgrade safe

contracts\strategies\BaseStrategy.sol:17: Variable `performanceFee` is assigned an initial value
    Move the assignment to the initializer
    https://zpl.in/upgrades/error-004

  - 部署 CurveStrategy...
    ⚠️ CurveStrategy 部署失败，跳过: Contract `contracts/strategies/CurveStrategy.sol:CurveStrategy` is not upgrade safe

contracts\strategies\BaseStrategy.sol:17: Variable `performanceFee` is assigned an initial value
    Move the assignment to the initializer
    https://zpl.in/upgrades/error-004

✅ 策略合约部署完成!

📦 步骤 5: 部署 Meta Transaction 合约...

  - 部署 MetaTxForwarder...
    ✅ MetaTxForwarder: 0x06789449d7ab39126Aa39647DAd953E2f8b9C1af
  - 部署 GasStation...
    ✅ GasStation: 0xc5CA76AAB786ccAA63E8C494B7CF95301f46453c
  - 部署 BatchExecutor...
    ✅ BatchExecutor: 0x377C1dea0a7C02574804a1c04a760Cbc785c45bB

✅ Meta Transaction 合约部署完成!

📦 步骤 6: 部署杠杆和清算合约...

  - 部署 LeverageHelper...
    ✅ LeverageHelper: 0xa1F1E87dE35B549d2d4287659370173e675a220b
  - 部署 LeverageEngine...
    ✅ LeverageEngine: 0xd4e468050D4d3884744a25c38e2ef189D02A4257
  - 部署 PositionManager...
    ✅ PositionManager: 0xd1F4305B79AAC4B5A3512609DaC9050E04a3Fe30
  - 部署 LiquidationBot...
    ✅ LiquidationBot: 0xAC82Cd88b7CDC496de190aF019878fA3F034de47

✅ 杠杆和清算合约部署完成!

📦 步骤 7: 部署跨链合约...

  - 部署 CrossChainBridge...
    ✅ CrossChainBridge: 0x57b18Fd188827d772D00453e036d7AE7fe0bB37b
  - 部署 L2Messenger...
    ✅ L2Messenger: 0x837B83A0Cd35Cd072D36A76C8B0fee66D354A48f

✅ 跨链合约部署完成!

📦 步骤 8: 部署安全和自动化合约...

  - 部署 InsuranceFund...
    ✅ InsuranceFund: 0xB84a18744f88F67Bc5154214a828bEcDBa4F0149
  - 部署 EmergencyStop...
    ✅ EmergencyStop: 0xE4f2bfa177E2f8633b572f138c8Bc365DcE5742A

✅ 安全和自动化合约部署完成!

📦 步骤 9: 部署 Gas 赞助合约...

  - 部署 GasSponsor...
    ✅ GasSponsor: 0x6235e17Ed0Ec087070caAf8941b6Dae82830Ad9e
  - 部署 TokenGasPayment...
    ✅ TokenGasPayment: 0x5AD24Bc7c99441678C7f0889E489333d749201c9

✅ Gas 赞助合约部署完成!

💾 步骤 10: 保存部署地址...
✅ 部署地址已保存到 deployments/sepolia.json

============================================================

🎉 部署完成！
============================================================

📋 已部署合约列表:

  mockUSDC                  0x9D44A22bFA40EeEE7603339048EC069AA9C901EA
  mockDAI                   0xeC9d7c84154b96a7AfCAE7c50EC38B4C87E85b7E
  mockUSDT                  0x6A9F823CB0D162dFe936a102F410a5e9E10CD714
  mockRouter                0x5C76bDCcfafCD7f0Ea52850A07F0F882D47a5Ca9
  mockAavePool              0xDb8a47c65D092D65Ee5566EC3942f0B622744593
  mockAToken                0x785eae047b1D853d6034E8CACb268b92cDeea945
  priceOracle               0xe1189E10c4AfCc5201071C2D7D10002cde312724
  vaultFactory              0x1592EAb5B17085958bFB5cfC487480a9633a44e3
  strategyManager           0x4A9eA8a66410Bb95f09C2E0809Fb29Ff02c61A72
  usdcVault                 0xA57895b71Fc239bc03F1a45a72db159348031737
  metaTxForwarder           0x06789449d7ab39126Aa39647DAd953E2f8b9C1af
  gasStation                0xc5CA76AAB786ccAA63E8C494B7CF95301f46453c
  batchExecutor             0x377C1dea0a7C02574804a1c04a760Cbc785c45bB
  leverageHelper            0xa1F1E87dE35B549d2d4287659370173e675a220b
  leverageEngine            0xd4e468050D4d3884744a25c38e2ef189D02A4257
  positionManager           0xd1F4305B79AAC4B5A3512609DaC9050E04a3Fe30
  liquidationBot            0xAC82Cd88b7CDC496de190aF019878fA3F034de47
  crossChainBridge          0x57b18Fd188827d772D00453e036d7AE7fe0bB37b
  l2Messenger               0x837B83A0Cd35Cd072D36A76C8B0fee66D354A48f
  insuranceFund             0xB84a18744f88F67Bc5154214a828bEcDBa4F0149
  emergencyStop             0xE4f2bfa177E2f8633b572f138c8Bc365DcE5742A
  gasSponsor                0x6235e17Ed0Ec087070caAf8941b6Dae82830Ad9e
  tokenGasPayment           0x5AD24Bc7c99441678C7f0889E489333d749201c9

============================================================
📌 下一步操作:

    1. 验证合约部署状态
    2. 配置合约权限和参数
    3. 运行功能测试



npx hardhat test test/unit/Vault.test.ts
Compiled 1 Solidity file successfully (evm target: shanghai).


  Vault
    Deployment
      √ 应该正确设置名称和符号 (851ms)
      √ 应该正确设置底层资产
      √ 应该正确设置小数位数
      √ 初始总资产应为0
    Deposit
      √ 应该允许用户存款
      √ 存款后应该获得正确数量的份额
      √ 多次存款应该累积份额
      √ 应该拒绝0金额存款
      √ 应该拒绝未授权的存款
    Withdraw
      √ 应该允许用户提款
      √ 提款后份额应该减少
      √ 应该返回正确数量的资产
      √ 应该拒绝提取超过余额的份额
    Share Price
      √ 初始份额价格应为1:1
      √ 收益后份额价格应该增加
    Strategy Integration
      √ 应该允许添加策略
      √ 应该正确分配资金到策略
      √ 策略分配比例总和不应超过100%
    Pause Functionality
      √ 所有者应该能够暂停金库
      √ 暂停时应该拒绝存款
      √ 暂停时应该允许提款
      √ 非所有者不应该能够暂停
    Upgradeability
      √ 应该能够升级合约
      √ 升级后应该保留状态
      √ 非所有者不应该能够升级
    Fees
      √ 应该正确收取绩效费
      √ 费用应该不超过预期比例
    Edge Cases
      √ 应该处理小额存款
      √ 应该处理大额存款
      √ 应该正确处理精度损失

  30 passing (1s)



 npx hardhat test test/integration/LeverageFlow.test.ts


  Leverage Flow Integration
    Complete Leverage Farming Journey
      √ 从开仓到盈利平仓的完整流程 (643ms)
      √ 多个仓位同时管理
    Liquidation Process
      √ 完整的清算流程
      √ 自动清算机器人应该持续监控
    Rebalancing Process
      √ 价格变动后自动再平衡
      √ 应该设置再平衡阈值
    Risk Management
      √ 应该防止过度杠杆
      √ 应该实施止损机制
      √ 应该限制单个用户的总敞口
    Multi-Strategy Combination
      √ 杠杆挖矿 + 收益聚合 (176ms)


  10 passing (903ms)